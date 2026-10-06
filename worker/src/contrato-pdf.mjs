import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * O CONTRATO EM PDF (05/10/2026): uma página HTML (lib/contratos/html.ts, no
 * app) impressa pelo Chrome que o Remotion já baixou para este worker.
 *
 * Fala com o Chrome pelo protocolo do DevTools, direto, sem puppeteer: o
 * worker não tem puppeteer, e o que o Remotion embute é interno dele. São
 * cinco comandos (criar aba, navegar, esperar carregar, esperar as fontes,
 * imprimir), e o protocolo é estável há anos. O WebSocket é o global do Node 22.
 *
 * O rodapé "página N de M" é do próprio Chrome (headerTemplate/footerTemplate
 * do Page.printToPDF, com as classes pageNumber e totalPages): CSS puro não
 * sabe quantas páginas um documento tem.
 *
 * Onde está o Chrome: CONTRATO_PDF_CHROME, quando definido (o teste local
 * aponta para o Chrome da máquina); senão, o que o ensureBrowser do Remotion
 * devolve (baixa na primeira vez, como os renders já fazem).
 */

export async function executavelDoChrome() {
  const fixo = process.env.CONTRATO_PDF_CHROME?.trim();
  if (fixo) return fixo;
  const { ensureBrowser } = await import("@remotion/renderer");
  const estado = await ensureBrowser({ logLevel: "error" });
  if (estado && "path" in estado && estado.path) return estado.path;
  throw new Error(`Chrome indisponível para o PDF (${estado?.type ?? "sem resposta"})`);
}

/** A4 em polegadas, e as margens em que o Chrome desenha o rodapé. */
const PAGINA = { paperWidth: 8.27, paperHeight: 11.69, marginTop: 0.75, marginBottom: 0.85, marginLeft: 0.7, marginRight: 0.7 };

/**
 * Imprime `html` e devolve o PDF como Buffer. `cabecalho` e `rodape` são os
 * modelos do Chrome (HTML com as classes pageNumber/totalPages).
 */
export async function imprimirHtml({ html, cabecalho = "<div></div>", rodape = "<div></div>", executavel, prazoMs = 60_000 }) {
  const chrome = executavel ?? (await executavelDoChrome());
  const pasta = await mkdtemp(join(tmpdir(), "contrato-pdf-"));
  const arquivo = join(pasta, "contrato.html");
  await writeFile(arquivo, html, "utf8");
  const processo = spawn(
    chrome,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--remote-debugging-port=0",
      `--user-data-dir=${join(pasta, "perfil")}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );
  const prazo = new Promise((_, rejeitar) => setTimeout(() => rejeitar(new Error("o Chrome não imprimiu o PDF no prazo")), prazoMs).unref());
  try {
    return await Promise.race([imprimirCom(processo, arquivo, cabecalho, rodape), prazo]);
  } finally {
    processo.kill("SIGKILL");
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

/** Espera o Chrome anunciar o endereço do DevTools no stderr. */
function enderecoDoDevTools(processo) {
  return new Promise((resolver, rejeitar) => {
    let saida = "";
    processo.stderr.on("data", (d) => {
      saida += d.toString("utf8");
      const m = saida.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolver(m[1]);
    });
    processo.on("exit", (codigo) => rejeitar(new Error(`o Chrome saiu antes de abrir o DevTools (código ${codigo}): ${saida.slice(-300)}`)));
    processo.on("error", rejeitar);
  });
}

async function imprimirCom(processo, arquivo, cabecalho, rodape) {
  const endereco = await enderecoDoDevTools(processo);
  const ws = new WebSocket(endereco);
  await new Promise((resolver, rejeitar) => {
    ws.addEventListener("open", resolver, { once: true });
    ws.addEventListener("error", () => rejeitar(new Error("não conectei ao DevTools do Chrome")), { once: true });
  });
  let proximoId = 0;
  const pendentes = new Map();
  const ouvintes = new Set();
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
    if (msg.id && pendentes.has(msg.id)) {
      const { resolver, rejeitar } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      if (msg.error) rejeitar(new Error(`DevTools: ${msg.error.message}`));
      else resolver(msg.result);
      return;
    }
    if (msg.method) for (const o of ouvintes) o(msg);
  });
  const chamar = (method, params = {}, sessionId) =>
    new Promise((resolver, rejeitar) => {
      const id = ++proximoId;
      pendentes.set(id, { resolver, rejeitar });
      ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const esperarEvento = (method, sessionId) =>
    new Promise((resolver) => {
      const ouvinte = (msg) => {
        if (msg.method === method && msg.sessionId === sessionId) {
          ouvintes.delete(ouvinte);
          resolver(msg.params);
        }
      };
      ouvintes.add(ouvinte);
    });

  try {
    const { targetId } = await chamar("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await chamar("Target.attachToTarget", { targetId, flatten: true });
    await chamar("Page.enable", {}, sessionId);
    const carregou = esperarEvento("Page.loadEventFired", sessionId);
    await chamar("Page.navigate", { url: pathToFileURL(arquivo).href }, sessionId);
    await carregou;
    // As fontes carregam depois do load; sem esperar, a primeira impressão sai em fallback.
    await chamar("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true }, sessionId);
    const { data } = await chamar(
      "Page.printToPDF",
      {
        ...PAGINA,
        printBackground: true,
        preferCSSPageSize: false,
        displayHeaderFooter: true,
        headerTemplate: cabecalho,
        footerTemplate: rodape,
        generateDocumentOutline: false,
      },
      sessionId
    );
    await chamar("Target.closeTarget", { targetId }).catch(() => {});
    return Buffer.from(data, "base64");
  } finally {
    ws.close();
  }
}
