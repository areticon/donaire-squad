// PROVA DOS ELEMENTOS GERADOS POR IA (06/10/2026, noite). NÃO RODAR SEM O OK DO BRUNO: gasta dinheiro de verdade.
//
// O trecho de 60 s (do segundo 60 ao 120) do vídeo cmux4417u000004l56g3x5urx, pela esteira de verdade:
//   1. a fala do trecho (transcrição gravada, banco SÓ LEITURA, um select);
//   2. o plano pelo JEV e pelo redator (escreverPlanoDoVideo: o JEV escolhe o tipo de cada momento, o Sonnet escreve os
//      textos e o prompt detalhado de cada elemento); as cenas e B-rolls do plano são DESCARTADOS nesta prova (isola o
//      custo dos elementos);
//   3. cada elemento gerado pela Higgsfield (GPT Image 2.5 medium), recortado no BiRefNet, gravado em disco num nome
//      único (prepararElementosGerados com dependenciasDeVerdade), com TETO RÍGIDO de US$ 1 nas imagens e recortes;
//   4. a montagem de prova: os elementos recortados sobre o trecho, cada um na caixa medida pela regra da margem segura
//      (caixaDaVetorial: nada nos 10% de cima, nada a menos de 4% da borda), com entrada em fade, pelo ffmpeg;
//   5. o mp4 e a folha de quadros (1 por segundo) na pasta de saída, e o relatório com o custo.
//
// O CUSTO ESTIMADO vai no topo do relatório e no console ANTES de qualquer chamada paga.
//
// Uso (do repo, com .env.local): npx tsx scripts/tmp/prova-elementos-ia-0610.mts [--saida=PASTA] [--teto=1] [--sim]
//   --sim: só imprime a estimativa e sai (nenhuma chamada paga).
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const REPO = process.cwd();
for (const arq of [".env.local", ".env"]) {
  if (!existsSync(`${REPO}/${arq}`)) continue;
  for (const l of readFileSync(`${REPO}/${arq}`, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) {
      const k = l.slice(0, i).trim();
      if (!process.env[k]) process.env[k] = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
    }
  }
}
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ID = "cmux4417u000004l56g3x5urx";
const INI = 60;
const FIM = 120;
const TETO_USD = Math.min(1, Number(arg("teto") ?? 1));
const SAIDA = arg("saida") ?? `${tmpdir()}/prova-elementos-ia-0610`;
mkdirSync(`${SAIDA}/elementos`, { recursive: true });

const { custoDoElemento, prepararElementosGerados, ehPecaGerada } = await import("@/lib/media/editor-por-comando/elemento-gerado");
const { DOLAR_POR_IMAGEM, DOLAR_POR_RECORTE } = await import("@/lib/credits/higgsfield-tabela");

// ─── a estimativa, antes de tudo ───
const porElemento = custoDoElemento();
const densidade = [10, 15];
const estimativa = {
  modelo: "higgsfield-gpt-image-2.5-medium (marketing-studio/image/sunburst, 2K, qualidade média)",
  imagemUsd: DOLAR_POR_IMAGEM["higgsfield-gpt-image-2.5-medium"],
  recorteUsd: DOLAR_POR_RECORTE,
  porElementoUsd: porElemento,
  elementosNoTrecho: `${Math.floor(60 / densidade[1])} a ${Math.floor(60 / densidade[0])}`,
  imagensUsd: `${(Math.floor(60 / densidade[1]) * porElemento).toFixed(3)} a ${(Math.floor(60 / densidade[0]) * porElemento).toFixed(3)}`,
  planoUsd: "~0,02 a 0,05 (o redator Sonnet e o JEV)",
  tetoRigidoUsd: TETO_USD,
};
console.log("CUSTO ESTIMADO DA PROVA:", JSON.stringify(estimativa, null, 1));
if (process.argv.includes("--sim")) process.exit(0);

// ─── 1. a fala do trecho (banco só leitura) ───
const pg = (await import("pg")).default;
const cli = new pg.Client({ connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await cli.connect();
const linha = (
  await cli.query(
    `select v.id, v."projectId", v."blobUrl", v.transcript, p.name, p.niche, p."colorPalette", p."logoUrl"
     from video_jobs v join projects p on p.id = v."projectId" where v.id = $1`,
    [ID]
  )
).rows[0];
await cli.end();
if (!linha) throw new Error(`vídeo ${ID} não encontrado`);
type Palavra = { texto: string; inicio: number; fim: number };
const todas = ((linha.transcript?.words ?? []) as Array<Record<string, unknown>>).map((w) => ({ texto: String(w.texto ?? w.word ?? w.text ?? ""), inicio: Number(w.inicio ?? w.start), fim: Number(w.fim ?? w.end) }));
const palavras: Palavra[] = todas.filter((w) => w.inicio >= INI && w.fim <= FIM).map((w) => ({ ...w, inicio: +(w.inicio - INI).toFixed(3), fim: +(w.fim - INI).toFixed(3) }));
console.log(`fala do trecho: ${palavras.length} palavras`);

// ─── o trecho do vídeo ───
const TOKEN = process.env.BLOB_READ_WRITE_TOKEN ?? "";
const trecho = `${SAIDA}/trecho.mp4`;
if (!existsSync(trecho)) {
  const cab = /private\.blob/.test(linha.blobUrl) ? ["-headers", `Authorization: Bearer ${TOKEN}\r\n`] : [];
  const r = spawnSync("ffmpeg", ["-v", "error", "-y", ...cab, "-ss", String(INI), "-t", String(FIM - INI), "-i", linha.blobUrl, "-c:v", "libx264", "-crf", "18", "-c:a", "aac", trecho]);
  if (r.status !== 0) throw new Error(`ffmpeg não cortou o trecho: ${r.stderr}`);
}
const dims = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", trecho], { encoding: "utf8" }).stdout.trim().split(",").map(Number);
const [W, H] = dims;
const formato: "9:16" | "16:9" = H > W ? "9:16" : "16:9";

// ─── 2. o plano pelo JEV e pelo redator ───
const pc = await import("@/lib/media/editor-por-comando");
const { REFERENCIAS_DE_COMANDO } = await import("@/lib/media/editor-por-comando/comando");
const salvo = await pc.lerComandoDoProjeto(linha.projectId);
const ref = REFERENCIAS_DE_COMANDO[0];
const comando = salvo ?? { texto: ref.texto, fonte: ref.fonte, cores: { tipo: "marca" as const }, origem: "referencia" as const, referencia: ref.id };
const paleta = pc.paletaDoProjeto(linha.colorPalette);
const marca = { acento: paleta[0] ?? "#FF5A1F", escuro: paleta[1] ?? "#121212", claro: paleta[2] ?? "#F4F1EA" };
const rosto = formato === "9:16" ? { x: 0.3, y: 0.18, w: 0.4, h: 0.3 } : { x: 0.38, y: 0.12, w: 0.24, h: 0.45 };
const entrada = {
  palavras: palavras as never,
  duracao: FIM - INI,
  formato,
  comando: comando as never,
  marca,
  paleta,
  rosto,
  comLegenda: true,
  logoUrl: linha.logoUrl ?? null,
  projectId: linha.projectId,
  imagens: 0,
  nicho: linha.niche ?? null,
  marcaNome: linha.name ?? null,
  youtube: true,
};
const base = await pc.classificarComando(comando.texto, linha.projectId);
const escrito = await pc.escreverPlanoDoVideo(entrada as never, base);
if (escrito.erro) console.warn("plano:", escrito.erro);
// Só os elementos gerados por IA (as cenas e os B-rolls do plano ficam fora desta prova).
const plano = { ...escrito.plano, insercoes: [], momentos: (escrito.plano.momentos ?? []).filter((m) => ehPecaGerada(String(m.peca))) };
console.log(`plano: ${plano.momentos.length} elemento(s) gerado(s) por IA: ${plano.momentos.map((m) => `${m.id} ${m.peca}`).join(", ")}`);

// ─── 3. os elementos, com teto rígido ───
const { dependenciasDeVerdade } = await import("@/lib/media/editor-por-comando/elemento-gerado-servidor");
const { falaDaInsercao } = await import("@/lib/media/conferencia-visual");
const local = async (nome: string, dados: Buffer) => {
  const arq = `${SAIDA}/elementos/${nome}`;
  writeFileSync(arq, dados);
  return arq;
};
const r = await prepararElementosGerados(plano as never, {
  cores: pc.coresDoComando(comando as never, marca),
  formato,
  deps: dependenciasDeVerdade({ projectId: linha.projectId, videoId: ID, local }),
  tetoUsd: TETO_USD,
  falaDe: (m) => (m.de ? falaDaInsercao({ de: String(m.de), ate: String(m.ate ?? m.de) }, palavras as never) : ""),
});
console.log(`elementos: ${r.prontos.filter((x) => x.url).length} prontos, ${r.removidos.length} fora; US$ ${r.custoUsd}`, r.erros);

// ─── 4. a montagem de prova (ffmpeg): cada elemento na caixa segura, entrada em fade ───
const { resolverAncora, frasesNumeradas } = await import("@/lib/media/editor-sob-medida/resolver");
const { caixaDaVetorial } = await import("@/lib/media/editor-por-comando/caixa-das-vetoriais");
const frases = frasesNumeradas(palavras as never);
const camadas = ((r.plano as { momentos?: Array<{ id: string; peca: string; de: string; ate: string; props: Record<string, unknown> }> }).momentos ?? [])
  .filter((m) => typeof m.props?.imagem === "string")
  .map((m) => {
    const de = resolverAncora(m.de as never, frases, palavras as never) ?? 0;
    const ate = Math.max(de + 2.5, resolverAncora(m.ate as never, frases, palavras as never) ?? de + 4);
    const caixa = caixaDaVetorial(m.peca, { vertical: formato === "9:16", rosto }) ?? { x: 0.08, y: 0.58, w: 0.84, h: 0.3 };
    return { arq: String(m.props.imagem), de, ate: Math.min(FIM - INI, ate), caixa };
  });
const entradas = ["-i", trecho, ...camadas.flatMap((c) => ["-loop", "1", "-i", c.arq])];
let filtro = "";
let atual = "0:v";
camadas.forEach((c, k) => {
  const w = Math.round(c.caixa.w * W);
  const h = Math.round(c.caixa.h * H);
  filtro += `[${k + 1}:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,format=rgba,fade=t=in:st=${c.de.toFixed(2)}:d=0.3:alpha=1,fade=t=out:st=${(c.ate - 0.3).toFixed(2)}:d=0.3:alpha=1[e${k}];`;
  filtro += `[${atual}][e${k}]overlay=x=${Math.round(c.caixa.x * W)}+(${w}-w)/2:y=${Math.round(c.caixa.y * H)}+(${h}-h)/2:enable='between(t,${c.de.toFixed(2)},${c.ate.toFixed(2)})':shortest=1[v${k}];`;
  atual = `v${k}`;
});
const mp4 = `${SAIDA}/prova-elementos-ia-${ID.slice(0, 9)}-60-120.mp4`;
const argsMontagem = camadas.length
  ? ["-v", "error", "-y", ...entradas, "-filter_complex", filtro.replace(/;$/, ""), "-map", `[${atual}]`, "-map", "0:a?", "-t", String(FIM - INI), "-c:v", "libx264", "-crf", "20", "-c:a", "copy", mp4]
  : ["-v", "error", "-y", "-i", trecho, "-c", "copy", mp4];
const m = spawnSync("ffmpeg", argsMontagem, { encoding: "utf8" });
if (m.status !== 0) console.error("montagem falhou:", m.stderr);

// ─── 5. a folha de quadros e o relatório ───
const folha = `${SAIDA}/folha-elementos-ia-${ID.slice(0, 9)}.jpg`;
spawnSync("ffmpeg", ["-v", "error", "-y", "-i", mp4, "-vf", "fps=1,scale=240:-2,tile=10x6", "-frames:v", "1", folha]);
const relatorio = {
  custoEstimado: estimativa,
  video: ID,
  trecho: [INI, FIM],
  formato,
  arquivo: mp4,
  folha,
  elementos: r.prontos.map((x) => ({ id: x.id, url: x.url, decisao: x.decisao, porQue: x.porQue, custoUsd: x.custoUsd, prompt: x.prompt })),
  removidos: r.removidos,
  erros: r.erros,
  custoDosElementosUsd: r.custoUsd,
  avisosDoPlano: escrito.avisos,
};
writeFileSync(`${SAIDA}/relatorio.json`, JSON.stringify(relatorio, null, 1));
console.log(`pronto: ${mp4}\nfolha: ${folha}\nrelatório: ${SAIDA}/relatorio.json`);
process.exit(0);
