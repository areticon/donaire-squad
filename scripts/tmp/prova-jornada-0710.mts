// A PROVA REAL DA JORNADA OFICIAL DO EDITOR (07/10/2026). GASTA DINHEIRO DE VERDADE (teto total das provas: US$ 8).
//
// Um trecho de 60 s de um vídeo real, pela esteira nova de verdade, ponta a ponta:
//   passo 3: medição local (o MESMO leitura.py do worker, venv com mediapipe) e a visão do Gemini em trechos finos;
//   passo 4: ideias pelo Sonnet (com a leitura e o contexto da empresa, da marca e do nicho), decisões pelo JEV;
//   passo 5: aprovação simulada (como veio) e, com --fase=revisar, uma revisão em texto livre;
//   passo 6: um prompt por elemento pelo Sonnet, geração na Higgsfield (Kling só se o JEV pediu B-roll), recorte, leitura do texto;
//   passo 7: caixas e tempos pelo código, escolha pelo JEV, render pelo Remotion e ffmpeg do worker (local).
// O banco de produção é SÓ LEITURA (um SELECT pela DIRECT_URL, sem SET). As gravações de uso (ai_usage) são
// CAPTURADAS na memória para a conta do custo e nunca vão ao banco. As mídias e o mp4 ficam na pasta local
// (servidas ao Chrome do Remotion por um servidor http em 127.0.0.1).
//
// Uso: npx tsx scripts/tmp/prova-jornada-0710.mts --caso=vertical --fase=plano|revisar|montar [--id=el2 --texto="..."]
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync, createReadStream } from "node:fs";
import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { join, extname } from "node:path";

for (const arq of ["C:/Users/devan/opensquad-app/.env.local", "C:/Users/devan/opensquad-app/.env"]) {
  if (!existsSync(arq)) continue;
  for (const l of readFileSync(arq, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
}
const MODELOS = "C:/Users/devan/AppData/Local/Temp/claude/c--/a82c011f-371b-4530-9a72-f50720c60069/scratchpad/leitura-0610/modelos";
process.env.PYTHON_DO_RECORTE = "C:/round.ai/.venv/Scripts/python.exe";
process.env.MODELO_ROSTO = `${MODELOS}/face_landmarker.task`;
process.env.MODELO_MULTICLASSE = `${MODELOS}/selfie_multiclass.tflite`;
process.env.MODELO_SEGMENTACAO = "C:/Users/devan/AppData/Local/Temp/claude/c--/d4e00b36-43ee-4c24-aefb-bf5fb9d889cc/scratchpad/modelos/selfie_segmenter.tflite";
process.env.HIGGSFIELD_NA_EDICAO = "1";
process.env.EDITOR_JORNADA = "1";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const CASOS: Record<string, { id: string; ini: number; fim: number }> = {
  vertical: { id: "cmux4417u000004l56g3x5urx", ini: 60, fim: 120 },
  horizontal: { id: "cmuvv0jje000004l3w6kd1jtw", ini: 240, fim: 300 },
  pregacao: { id: "cmurezdrg000204kz3lvag97w", ini: 60, fim: 120 },
  ia: { id: "cmuo6nirp000004jslatnqvtt", ini: 120, fim: 180 },
};
const casoNome = arg("caso") ?? "vertical";
const fase = arg("fase") ?? "plano";
const caso = CASOS[casoNome];
if (!caso) throw new Error(`caso desconhecido: ${casoNome}`);
const RAIZ = "C:/Users/devan/AppData/Local/Temp/claude/c--/0349741c-caa7-456e-bbea-edaa63e6a10a/scratchpad/provas-jornada";
const PASTA = `${RAIZ}/${casoNome}`;
mkdirSync(`${PASTA}/midias`, { recursive: true });
const DUR = caso.fim - caso.ini;

// ─── o banco, só leitura ───
const linhaArq = `${PASTA}/linha.json`;
let linha: Record<string, unknown>;
if (existsSync(linhaArq)) linha = JSON.parse(readFileSync(linhaArq, "utf8"));
else {
  const pg = (await import("pg")).default;
  const cli = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await cli.connect();
  linha = (
    await cli.query(
      `select v.id, v."projectId", v."blobUrl", v."durationSec", v.transcript->'words' as words, p.name, p.niche, p."colorPalette", p."videoEstiloEscolha", p."videoMusicUrl", p.config->'comandoDoVideo'->>'texto' as comando
       from video_jobs v join projects p on p.id = v."projectId" where v.id = $1`,
      [caso.id]
    )
  ).rows[0];
  await cli.end();
  writeFileSync(linhaArq, JSON.stringify(linha));
}

// ─── nenhuma gravação no banco: o uso é capturado aqui ───
const { prisma } = await import("@/lib/db/prisma");
const capturados: Array<{ operation: string; model: string; costUsd: number }> = [];
const falso = { create: async ({ data }: { data: { operation: string; model: string; costUsd: number } }) => (capturados.push({ operation: data.operation, model: data.model, costUsd: Number(data.costUsd) || 0 }), data) };
for (const k of ["aiUsage"]) Object.defineProperty(prisma, k, { value: falso, configurable: true, writable: true });
for (const k of ["acaoDeAdmin", "notificacao"]) Object.defineProperty(prisma, k, { value: { create: async () => ({}), update: async () => ({}), delete: async () => ({}), findFirst: async () => null, findMany: async () => [] }, configurable: true, writable: true });
await (prisma as unknown as { aiUsage: typeof falso }).aiUsage.create({ data: { operation: "teste-da-captura", model: "x", costUsd: 0 } });
if (!capturados.length) throw new Error("a captura do uso não pegou: abortando para não gravar no banco");
capturados.length = 0;

type W = { word?: string; texto?: string; start?: number; end?: number; inicio?: number; fim?: number };
const palavras = ((linha.words as W[]) ?? [])
  .map((w) => ({ texto: String(w.word ?? w.texto ?? ""), inicio: Number(w.start ?? w.inicio), fim: Number(w.end ?? w.fim) }))
  .filter((w) => w.inicio >= caso.ini && w.fim <= caso.fim)
  .map((w) => ({ ...w, inicio: +(w.inicio - caso.ini).toFixed(3), fim: +(w.fim - caso.ini).toFixed(3) }));

// ─── o trecho ───
const trecho = `${PASTA}/trecho.mp4`;
if (!existsSync(trecho)) {
  const r = spawnSync("ffmpeg", ["-y", "-headers", `Authorization: Bearer ${process.env.BLOB_READ_WRITE_TOKEN}\r\n`, "-ss", String(caso.ini), "-i", String(linha.blobUrl), "-t", String(DUR), "-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", trecho], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`trecho: ${r.stderr.slice(-600)}`);
}
const sonda = JSON.parse(spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate", "-of", "json", trecho], { encoding: "utf8" }).stdout).streams[0];
const vertical = sonda.height > sonda.width;
const formato: "9:16" | "16:9" = vertical ? "9:16" : "16:9";
const [Wd, Hd] = vertical ? [1080, 1920] : [1920, 1080];
const fpsBase = (() => { const [a, b] = String(sonda.r_frame_rate).split("/").map(Number); return b ? a / b : a; })();

const L = await import("@/lib/media/jornada/leitura");
const P = await import("@/lib/media/jornada/planejar");
const R = await import("@/lib/media/jornada/revisao");
const LT = await import("@/lib/media/jornada/linha-do-tempo");
const { destinoDoVideo } = await import("@/lib/media/jornada/contexto");
const { coresDaMarca } = await import("@/lib/media/capa-composta");
const { askClaude } = await import("@/lib/claude");
const { perguntarAoJev } = await import("@/lib/jev/cliente");
const { MODELO_DAS_IDEIAS } = await import("@/lib/media/jornada/ideias");
const redator = (op: string) => (s: string, p: string) => askClaude(s, p, { model: MODELO_DAS_IDEIAS, maxTokens: 8000, effort: "low", timeoutMs: 180_000, usage: { projectId: String(linha.projectId), operation: op } });

const duracaoTotal = Number(linha.durationSec) || DUR;
const contexto = {
  marca: String(linha.name ?? ""),
  nicho: (linha.niche as string) ?? null,
  perfil: null,
  cores: coresDaMarca((linha.colorPalette as string) ?? null),
  estiloDoCliente: String(linha.comando ?? "").trim(),
  formato,
  duracao: DUR,
  duracaoTotal,
  destino: destinoDoVideo(formato, duracaoTotal),
};
const estadoArq = `${PASTA}/estado.json`;
const relArq = `${PASTA}/relatorio.json`;
const rel: Record<string, unknown> = existsSync(relArq) ? JSON.parse(readFileSync(relArq, "utf8")) : { caso: casoNome, video: caso.id, trecho: [caso.ini, caso.fim], formato, custos: {}, tempos: {} };
const somaDe = () => +capturados.reduce((s, c) => s + c.costUsd, 0).toFixed(4);
const gravarRel = () => writeFileSync(relArq, JSON.stringify(rel, null, 1));
// O LIVRO DE GASTOS de todas as rodadas (o teto de US$ 8 é a soma daqui).
const anotarGasto = (etapa: string) => writeFileSync(`${RAIZ}/gastos.jsonl`, JSON.stringify({ em: new Date().toISOString(), caso: casoNome, etapa, usd: somaDe() }) + String.fromCharCode(10), { flag: "a" });

if (fase === "plano") {
  const t0 = Date.now();
  const w = await import("../../worker/src/leitura-do-video.mjs");
  const medidaArq = `${PASTA}/medida.json`;
  let medida;
  if (existsSync(medidaArq)) medida = JSON.parse(readFileSync(medidaArq, "utf8"));
  else {
    const cad = await w.cadenciaDosQuadrosChave(trecho);
    medida = await w.medirVideo(trecho, PASTA, { modo: w.modoPelaCadencia(cad), duracao: DUR });
    writeFileSync(medidaArq, JSON.stringify(medida));
  }
  const proxy = `${PASTA}/proxy.mp4`;
  if (!existsSync(proxy)) await w.proxyParaVisao(trecho, proxy, { modo: "fps1" });
  const tMedida = (Date.now() - t0) / 1000;
  const feito = await P.planejarJornada(
    { palavras, contexto },
    {
      ler: () => L.lerParaAJornada({ url: "local", palavras, duracao: DUR, manter: null, projectId: String(linha.projectId), medicao: { medida, proxyUrl: null }, visaoBytes: new Uint8Array(readFileSync(proxy)) }),
      redator: redator("jornada-ideias"),
      jev: perguntarAoJev,
      projectId: String(linha.projectId),
    }
  );
  const estado = { versao: 1, edicaoId: feito.plano.edicaoId, leitura: feito.leitura, amostras: feito.amostras, plano: feito.plano, revisao: {}, aprovado: null, avisos: feito.avisos };
  writeFileSync(estadoArq, JSON.stringify(estado, null, 1));
  (rel.custos as Record<string, unknown>).plano = { usd: somaDe(), itens: capturados.slice() };
  (rel.tempos as Record<string, unknown>).plano = { medicaoLocal: +tMedida.toFixed(1), ...feito.tempos };
  rel.descartados = feito.descartados;
  rel.ideias = feito.ideias;
  rel.fala = palavras.map((p) => p.texto).join(" ");
  gravarRel();
  anotarGasto("plano");
  console.log(`LEITURA: ${feito.leitura?.genero} | ${feito.leitura?.cenario} | ${feito.leitura?.trechos.length} trechos`);
  console.log(`PLANO (${feito.plano.densidade.porque}), US$ ${feito.plano.custoTotalUsd}:`);
  for (const e of feito.plano.elementos) console.log(`  ${e.id} ${e.gatilho.t.toFixed(1)}s "${e.gatilho.palavra}" [${e.formato}/${e.papel}] ${e.descricao}${e.textoNaImagem ? ` TEXTO="${e.textoNaImagem}"` : ""}`);
  console.log("avisos:", feito.avisos.join(" | "));
  console.log("CUSTO DO PLANO US$", somaDe());
  process.exit(0);
}

if (fase === "revisar") {
  const estado = JSON.parse(readFileSync(estadoArq, "utf8"));
  const frases = LT.frasesDaFala(palavras);
  const novo = await R.pedirMudanca(estado, String(arg("id")), String(arg("texto")), { jev: perguntarAoJev, redator: redator("jornada-revisao"), projectId: String(linha.projectId) }, { palavras, frases, marca: contexto.marca });
  writeFileSync(estadoArq, JSON.stringify(novo, null, 1));
  (rel.custos as Record<string, unknown>).revisao = { usd: somaDe(), itens: capturados.slice() };
  anotarGasto("revisao");
  rel.revisao = { id: arg("id"), pedido: arg("texto"), descricaoNova: novo.revisao[String(arg("id"))]?.descricaoAprovada, acao: novo.revisao[String(arg("id"))]?.acao };
  gravarRel();
  console.log("REVISÃO:", JSON.stringify(rel.revisao));
  process.exit(0);
}

if (fase === "montar" || fase === "remontar") {
  const estado = R.aprovarJornada(JSON.parse(readFileSync(estadoArq, "utf8")));
  writeFileSync(`${PASTA}/estado-aprovado.json`, JSON.stringify(estado, null, 1));
  // As mídias da prova, servidas ao Chrome do Remotion.
  const TIPOS: Record<string, string> = { ".webp": "image/webp", ".png": "image/png", ".mp4": "video/mp4", ".jpg": "image/jpeg" };
  const servidor = createServer((req, res) => {
    const arq = join(`${PASTA}/midias`, decodeURIComponent(String(req.url ?? "/").slice(1)));
    if (!existsSync(arq)) return void res.writeHead(404).end();
    res.writeHead(200, { "Content-Type": TIPOS[extname(arq)] ?? "application/octet-stream", "Content-Length": statSync(arq).size, "Access-Control-Allow-Origin": "*" });
    createReadStream(arq).pipe(res);
  });
  await new Promise<void>((ok) => servidor.listen(0, "127.0.0.1", () => ok()));
  const porta = (servidor.address() as { port: number }).port;
  const { dependenciasDaGeracao } = await import("@/lib/media/jornada/geracao-servidor");
  const geracao = dependenciasDaGeracao({ projectId: String(linha.projectId), videoId: caso.id, edicaoId: estado.edicaoId, local: async (nome, dados) => (writeFileSync(`${PASTA}/midias/${nome}`, dados), `http://127.0.0.1:${porta}/${nome}`) });
  const avisosAdmin: string[] = [];
  geracao.avisarAdmin = (onde, d) => void avisosAdmin.push(`${onde}: ${d}`);
  const { normalizarLegenda } = await import("@/lib/media/legenda-escolhida");
  const leg = normalizarLegenda((linha.videoEstiloEscolha as { legenda?: unknown } | null)?.legenda);
  const { montarPelaJornada } = await import("@/lib/media/jornada/montar-servidor");
  const t0 = Date.now();
  const legendaDaProva = leg.modo === "sem" ? ({ mostrar: false } as const) : leg.modo === "estilo" && leg.estilo ? { mostrar: true as const, estilo: leg.estilo, automatica: false } : { mostrar: true as const, estilo: "limpa" as const, automatica: true };
  // REMONTAR: a mesma edição (as mídias já geradas DESTA edição), só o passo 7 e o render de novo, sem nova geração paga.
  const remontar = async () => {
    const ant = JSON.parse(readFileSync(`${PASTA}/montagem.json`, "utf8"));
    const gerados = ant.gerados.map((g: { url: string | null }) => ({ ...g, url: g.url ? g.url.replace(/127\.0\.0\.1:\d+/, `127.0.0.1:${porta}`) : null }));
    const { montarEdicao } = await import("@/lib/media/jornada/montagem");
    const aprov = R.elementosAprovados(estado);
    const mm = await montarEdicao({ elementos: aprov.map((el) => ({ aprovado: el, gerado: gerados.find((g: { id: string }) => g.id === el.id), t: el.gatilho.t, fraseDe: el.momento.de, fraseAte: el.momento.ate })).filter((x) => x.gerado), amostras: estado.amostras ?? [], formato, W: Wd, H: Hd, fps: fpsBase, duracao: DUR, palavras, legenda: legendaDaProva, cores: contexto.cores, jev: perguntarAoJev, temTrilha: Boolean(linha.videoMusicUrl) });
    return { ...ant, gerados, edicao: mm.edicao, escolhas: mm.escolhas, trilha: mm.trilha, avisosDoCliente: [...gerados.map((g: { avisoCliente: string | null }) => g.avisoCliente).filter(Boolean), ...mm.avisosDoCliente], avisosDoAdmin: mm.avisos, custoUsd: { geracao: 0 }, tempos: { remontagem: true } };
  };
  const m = fase === "remontar" ? await remontar() : await montarPelaJornada({
    estado,
    falaDoPlano: palavras,
    falaDoRender: palavras,
    duracao: DUR,
    formato,
    W: Wd,
    H: Hd,
    fps: fpsBase,
    amostras: estado.amostras ?? [],
    contexto,
    legenda: leg.modo === "sem" ? { mostrar: false } : leg.modo === "estilo" && leg.estilo ? { mostrar: true, estilo: leg.estilo, automatica: false } : { mostrar: true, estilo: "limpa", automatica: true },
    temTrilha: Boolean(linha.videoMusicUrl),
    redator: redator("jornada-prompts"),
    jev: perguntarAoJev,
    geracao,
    projectId: String(linha.projectId),
  });
  const tGeracao = (Date.now() - t0) / 1000;
  writeFileSync(`${PASTA}/montagem.json`, JSON.stringify({ ...m, edicao: m.edicao }, null, 1));
  (rel.custos as Record<string, unknown>).montagem = { usd: somaDe(), itens: capturados.slice(), geracaoUsd: m.custoUsd.geracao };
  rel.gerados = m.gerados.map((g) => ({ id: g.id, ok: Boolean(g.url), tipo: g.tipo, formato: g.formato, modelo: g.modelo, rodadas: g.rodadas, custo: g.custoUsd, tempos: g.tempos, textoLido: g.textoLido, prompt: g.prompt.slice(0, 600) }));
  rel.avisosDoCliente = m.avisosDoCliente;
  rel.avisosDoAdmin = [...m.avisosDoAdmin, ...avisosAdmin];
  rel.escolhas = m.escolhas;
  // O render pelo worker (Remotion + ffmpeg), local.
  const { montarSobMedida } = await import("../../worker/src/edicao-sob-medida.mjs");
  const baixar = async (url: string, arq: string) => {
    const r = await fetch(url, { headers: /private\.blob/.test(url) ? { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } : {} });
    if (!r.ok) throw new Error(`baixar ${url}: ${r.status}`);
    writeFileSync(arq, Buffer.from(await r.arrayBuffer()));
  };
  const t1 = Date.now();
  const pastaRender = `${PASTA}/render`;
  // Cada render numa pasta limpa (nada de arquivo de uma rodada anterior).
  spawnSync("cmd", ["/c", "rmdir", "/s", "/q", pastaRender.replace(/\//g, "\\")]);
  const f = await montarSobMedida({ edicao: m.edicao, baseArquivo: trecho, escala: 1, efeitos: true, trilha: m.trilha && linha.videoMusicUrl ? { url: linha.videoMusicUrl, volume: 0.12, abaixar: true } : null, videoJobId: `prova-${casoNome}` }, pastaRender, { baixar });
  const tRender = (Date.now() - t1) / 1000;
  servidor.close();
  anotarGasto("montagem");
  const final = `${RAIZ}/${casoNome}.mp4`;
  spawnSync("ffmpeg", ["-y", "-i", f.arquivo, "-c", "copy", final]);
  // As folhas: um quadro por segundo, e os quadros de cada elemento em resolução maior.
  const escala = vertical ? "216:384" : "384:216";
  spawnSync("ffmpeg", ["-y", "-i", final, "-vf", `fps=1,scale=${escala},tile=${vertical ? "10x6" : "6x10"}`, "-frames:v", "1", `${RAIZ}/${casoNome}-folha.jpg`]);
  const momentos = (m.escolhas as Array<{ id: string; de: number; ate: number }>).map((e) => +(e.de + Math.min(1.2, (e.ate - e.de) / 2)).toFixed(2));
  if (momentos.length) {
    const filtro = momentos.map((t, i) => `[0:v]trim=start=${t}:duration=0.05,setpts=PTS-STARTPTS,scale=${vertical ? "360:640" : "640:360"}[q${i}]`).join(";");
    spawnSync("ffmpeg", ["-y", "-i", final, "-filter_complex", `${filtro};${momentos.map((_, i) => `[q${i}]`).join("")}hstack=inputs=${momentos.length}[o]`, "-map", "[o]", "-frames:v", "1", `${RAIZ}/${casoNome}-elementos.jpg`]);
  }
  (rel.tempos as Record<string, unknown>).montagem = { ...m.tempos, geracaoTotal: +tGeracao.toFixed(1), render: +tRender.toFixed(1), worker: f.tempos };
  rel.saida = { mp4: final, folha: `${RAIZ}/${casoNome}-folha.jpg`, elementos: `${RAIZ}/${casoNome}-elementos.jpg`, momentos };
  rel.custoTotalUsd = +(((rel.custos as Record<string, { usd: number }>).plano?.usd ?? 0) + ((rel.custos as Record<string, { usd: number }>).revisao?.usd ?? 0) + somaDe()).toFixed(4);
  gravarRel();
  console.log("PRONTO", JSON.stringify({ final, render: tRender, geracao: tGeracao, custoMontagem: somaDe(), custoTotal: rel.custoTotalUsd, avisosDoCliente: m.avisosDoCliente, avisosAdmin: rel.avisosDoAdmin }, null, 1));
  process.exit(0);
}
