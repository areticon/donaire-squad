import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { get, put } from "@vercel/blob";
import {
  ffprobe,
  prepararCompleto,
  cortarVertical,
  cortarHorizontal,
  extrairCapa,
} from "./ffmpeg.mjs";

/**
 * Worker de vídeo da Demandou.
 *
 * Existe porque ffmpeg com arquivo de centenas de megabytes não roda em função
 * serverless: a Vercel tem teto de tempo e de memória, e a gravação de teste
 * tem 850 MB. Aqui não há teto de tempo, o disco é real e o ffmpeg é nativo.
 *
 * O contrato é deliberadamente burro: recebe um trabalho, responde 202 na hora,
 * e avisa por callback quando termina. Nada de o app ficar esperando, que é
 * exatamente a armadilha que derrubou a seleção de trechos duas vezes.
 */

const PORTA = Number(process.env.PORT) || 8080;
const SEGREDO = process.env.WORKER_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!SEGREDO) throw new Error("WORKER_SECRET não configurado");
if (!BLOB_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN não configurado");

/**
 * Assinatura HMAC sobre o corpo cru.
 *
 * Comparação em tempo constante, e não `===`: comparação comum vaza, pelo tempo
 * que leva, quantos bytes iniciais bateram, e isso permite descobrir a
 * assinatura byte a byte. É barato fazer certo.
 */
function assinaturaValida(corpoCru, recebida) {
  if (!recebida) return false;
  const esperada = createHmac("sha256", SEGREDO).update(corpoCru).digest("hex");
  const a = Buffer.from(esperada, "utf8");
  const b = Buffer.from(recebida, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function assinar(texto) {
  return createHmac("sha256", SEGREDO).update(texto).digest("hex");
}

async function baixarFonte(sourceUrl, destino) {
  const blob = await get(sourceUrl, { access: "private", token: BLOB_TOKEN });
  if (!blob || blob.statusCode !== 200) {
    throw new Error("Não consegui ler o vídeo no storage");
  }
  // Fluxo direto para o disco. Nunca `arrayBuffer()`: o contêiner tem memória
  // bem menor que os arquivos que ele processa.
  await pipeline(Readable.fromWeb(blob.stream), createWriteStream(destino));
  return blob.blob.contentType || "video/mp4";
}

async function subir(caminho, chave, contentType) {
  const conteudo = await readFile(caminho);
  const { url } = await put(chave, conteudo, {
    access: "private",
    token: BLOB_TOKEN,
    contentType,
    addRandomSuffix: true,
  });
  const { size } = await stat(caminho);
  return { url, bytes: size };
}

/**
 * O trabalho de verdade.
 *
 * Ordem deliberada: os TRECHOS saem primeiro, e o vídeo completo por último. O
 * completo é o item mais caro (recodifica a gravação inteira) e o menos urgente
 * (o cliente publica no canal com calma), enquanto os trechos são o que ele
 * quer ver para decidir. Se algo estourar no meio, o que sobrou entregue é a
 * parte que importa.
 */
async function processar(trabalho) {
  const pasta = await mkdtemp(join(tmpdir(), "demandou-"));
  const resultados = { trechos: [], completo: null, erros: [] };

  try {
    const fonte = join(pasta, "fonte.mp4");
    await baixarFonte(trabalho.sourceUrl, fonte);
    const info = await ffprobe(fonte);

    for (const t of trabalho.trechos) {
      const duracao = Math.max(1, t.fim - t.inicio);
      const saida = { indice: t.indice, titulo: t.titulo, duracaoSec: duracao };
      try {
        const vertical = join(pasta, `v-${t.indice}.mp4`);
        await cortarVertical(fonte, vertical, t.inicio, duracao);
        saida.vertical = await subir(
          vertical,
          `cortes/${trabalho.videoJobId}/vertical-${t.indice}.mp4`,
          "video/mp4"
        );

        const horizontal = join(pasta, `h-${t.indice}.mp4`);
        await cortarHorizontal(fonte, horizontal, t.inicio, duracao);
        saida.horizontal = await subir(
          horizontal,
          `cortes/${trabalho.videoJobId}/horizontal-${t.indice}.mp4`,
          "video/mp4"
        );

        const capa = join(pasta, `c-${t.indice}.jpg`);
        await extrairCapa(fonte, capa, t.inicio, duracao);
        saida.capa = await subir(
          capa,
          `cortes/${trabalho.videoJobId}/capa-${t.indice}.jpg`,
          "image/jpeg"
        );
      } catch (e) {
        // Um trecho que falha não derruba os outros. Entregar quatro de cinco é
        // melhor que entregar zero, e a tela mostra qual faltou.
        saida.erro = e instanceof Error ? e.message : "falhou";
        resultados.erros.push(`trecho ${t.indice}: ${saida.erro}`);
      }
      resultados.trechos.push(saida);
    }

    try {
      const completo = join(pasta, "completo.mp4");
      await prepararCompleto(fonte, completo);
      resultados.completo = await subir(
        completo,
        `cortes/${trabalho.videoJobId}/completo.mp4`,
        "video/mp4"
      );
    } catch (e) {
      resultados.erros.push(
        `completo: ${e instanceof Error ? e.message : "falhou"}`
      );
    }

    resultados.duracaoSec = Math.round(info.duracaoSec);
    return resultados;
  } finally {
    // O disco do contêiner é compartilhado entre trabalhos. Sem esta limpeza,
    // dois vídeos grandes seguidos enchem o disco e o terceiro falha por um
    // motivo que não tem nada a ver com ele.
    await rm(pasta, { recursive: true, force: true }).catch(() => {});
  }
}

async function avisar(trabalho, corpo) {
  const texto = JSON.stringify(corpo);
  await fetch(trabalho.callbackUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-demandou-assinatura": assinar(texto),
    },
    body: texto,
    signal: AbortSignal.timeout(60_000),
  });
}

const servidor = createServer((req, res) => {
  const responder = (status, corpo) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(corpo));
  };

  // O Railway checa a saúde do contêiner por aqui.
  if (req.method === "GET" && req.url === "/saude") {
    return responder(200, { ok: true });
  }

  if (req.method !== "POST" || !req.url?.startsWith("/cortar")) {
    return responder(404, { error: "Not found" });
  }

  const pedacos = [];
  req.on("data", (d) => pedacos.push(d));
  req.on("end", async () => {
    const corpoCru = Buffer.concat(pedacos).toString("utf8");

    if (!assinaturaValida(corpoCru, req.headers["x-demandou-assinatura"])) {
      return responder(401, { error: "Assinatura inválida" });
    }

    let trabalho;
    try {
      trabalho = JSON.parse(corpoCru);
    } catch {
      return responder(400, { error: "Corpo não é JSON" });
    }
    if (!trabalho.videoJobId || !trabalho.sourceUrl || !trabalho.callbackUrl) {
      return responder(400, { error: "Faltam videoJobId, sourceUrl ou callbackUrl" });
    }

    // Responde ANTES de trabalhar. O app não pode ficar segurando uma requisição
    // por vários minutos: é a mesma armadilha que derrubou a seleção de trechos.
    responder(202, { aceito: true, videoJobId: trabalho.videoJobId });

    try {
      const resultados = await processar(trabalho);
      await avisar(trabalho, { ok: true, ...resultados });
    } catch (e) {
      const mensagem = e instanceof Error ? e.message : "Falha no processamento";
      console.error(`[${trabalho.videoJobId}] ${mensagem}`);
      await avisar(trabalho, { ok: false, erro: mensagem }).catch(() => {});
    }
  });
});

servidor.listen(PORTA, () => {
  console.log(`worker de vídeo ouvindo na porta ${PORTA}`);
});
