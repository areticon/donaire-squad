import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { copyFile, mkdir, stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { availableParallelism, tmpdir } from "node:os";
import { ffprobe, prepararTrecho, rodar } from "./ffmpeg.mjs";
import { gerarMatte } from "./segmentacao.mjs";

/**
 * O EDITOR COMPLETO no worker (30/09/2026): recebe o plano de montagem JÁ
 * RESOLVIDO pelo app (lib/media/plano-de-montagem.ts) e renderiza com o
 * Remotion (worker/remotion). Aqui não se decide nada de edição.
 *
 * Três passos:
 *   1. o narrador limpo: a gravação cortada nos intervalos mantidos, no tempo
 *      do corte, sem legenda nem efeito (`prepararTrecho`, o mesmo do corte);
 *   2. a pessoa recortada, só quando alguma cena pede: a máscara do MediaPipe
 *      (`gerarMatte`, o mesmo do corte vertical) vira um WebM com
 *      transparência do tamanho EXATO da caixa da pessoa, que é a conta que o
 *      app fez para posicionar o rosto;
 *   3. o render: Chrome headless do Remotion lendo tudo de um servidor local.
 *
 * O rosto do cliente é sempre pixel da gravação: nenhum passo daqui manda
 * quadro do narrador para modelo de IA.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ_DO_REMOTION = resolve(AQUI, "..", "remotion");
const PASTA_DAS_FONTES = resolve(AQUI, "..", "fontes");
/** O bundle pronto da imagem Docker (`node remotion/empacotar.mjs`). */
const BUNDLE_PRONTO = join(RAIZ_DO_REMOTION, "build");

let _bundle = null;

/**
 * O bundle do Remotion, UMA vez por processo. Na imagem Docker ele já vem
 * pronto da construção (empacotar leva 15 a 30 s e não pode cair no tempo do
 * cliente); fora dela, empacota na primeira montagem e guarda.
 */
export async function bundleDoRemotion({ refazer = false } = {}) {
  if (_bundle) return _bundle;
  if (!refazer && existsSync(join(BUNDLE_PRONTO, "index.html"))) {
    _bundle = BUNDLE_PRONTO;
    return _bundle;
  }
  const { bundle } = await import("@remotion/bundler");
  _bundle = await bundle({
    entryPoint: join(RAIZ_DO_REMOTION, "src", "index.ts"),
    publicDir: PASTA_DAS_FONTES,
    onProgress: () => {},
  });
  return _bundle;
}

/**
 * Serve uma pasta em 127.0.0.1, com Range. O Remotion (Chrome e compositor)
 * lê vídeo por URL; subir o narrador intermediário ao Blob só para baixá-lo de
 * volta seria pagar duas transferências por nada.
 */
export function servirPasta(pasta) {
  return new Promise((resolver) => {
    const servidor = createServer(async (req, res) => {
      // O Chrome e o compositor fecham conexões no meio (Range, cancelamento):
      // escrever num socket fechado não pode derrubar o worker inteiro.
      res.on("error", () => {});
      req.socket.on("error", () => {});
      try {
        const nome = basename(decodeURIComponent(new URL(req.url, "http://x").pathname));
        const arquivo = join(pasta, nome);
        const { size } = await stat(arquivo);
        const tipo = nome.endsWith(".webm") ? "video/webm" : nome.endsWith(".mp4") ? "video/mp4" : nome.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream";
        const faixa = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
        if (faixa) {
          const de = faixa[1] ? Number(faixa[1]) : 0;
          const ate = faixa[2] ? Math.min(Number(faixa[2]), size - 1) : size - 1;
          res.writeHead(206, { "Content-Type": tipo, "Content-Range": `bytes ${de}-${ate}/${size}`, "Accept-Ranges": "bytes", "Content-Length": ate - de + 1 });
          createReadStream(arquivo, { start: de, end: ate }).on("error", () => res.destroy()).pipe(res);
        } else {
          res.writeHead(200, { "Content-Type": tipo, "Content-Length": size, "Accept-Ranges": "bytes" });
          createReadStream(arquivo).on("error", () => res.destroy()).pipe(res);
        }
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    servidor.listen(0, "127.0.0.1", () => {
      const { port } = servidor.address();
      resolver({ base: `http://127.0.0.1:${port}`, fechar: () => new Promise((r) => servidor.close(() => r())) });
    });
  });
}

/**
 * As opções do render, num lugar só (a montagem e a medição usam as mesmas).
 * Ver o comentário de velocidade em `montar`.
 */
export function opcoesDoRender() {
  return {
    codec: "h264",
    crf: 20,
    audioCodec: "aac",
    // O x264 no preset padrão (medium) gasta CPU que o Chrome precisa.
    x264Preset: "veryfast",
    // Quadro do Chrome em JPEG 90: o PNG (padrão só com transparência) custa
    // o dobro para codificar e não muda nada num vídeo h264.
    imageFormat: "jpeg",
    jpegQuality: 90,
    // No máximo 4 abas do Chrome: com uma por CPU o compositor morreu por
    // memória na primeira rodada em produção (SIGKILL, contêiner de 7,6 GB).
    // REMOTION_CONCORRENCIA ajusta sem deploy de código, sempre até 4.
    concurrency: Math.min(4, Number(process.env.REMOTION_CONCORRENCIA) || availableParallelism()),
    // O cache de quadros do OffthreadVideo cresce até metade da memória livre
    // por padrão; 512 MB bastam para um corte e deixam o resto para o Chrome.
    offthreadVideoCacheSizeInBytes: 512 * 1024 * 1024,
    offthreadVideoThreads: 2,
    chromiumOptions: process.platform === "linux" ? { enableMultiProcessOnLinux: true } : {},
    timeoutInMilliseconds: 120_000,
    // Escala do render (1 = 1080x1920; 2/3 = 720x1280). Medido em 30/09: 720p
    // ganhou só 10 a 20% (7,0 contra 6,3 quadros/s), porque o custo é por
    // QUADRO (captura do Chrome, extração do vídeo), não por pixel. Fica 1.
    scale: Number(process.env.REMOTION_ESCALA) || 1,
    // Porta do servidor do bundle. Só para a máquina de desenvolvimento, onde
    // um next dev na 3001 fazia o Remotion abrir a página errada (29/09);
    // no contêiner fica a escolha automática.
    port: Number(process.env.REMOTION_PORTA) || null,
  };
}

/** A mesma conta de `pessoaEmPixels` em lib/media/plano-de-montagem.ts. */
function pessoaEmPixels(fonte, pessoa) {
  const par = (v) => Math.max(2, Math.floor(v / 2) * 2);
  const x = par(pessoa.x * fonte.largura);
  const y = par(pessoa.y * fonte.altura);
  return { x, y, w: Math.min(par(pessoa.w * fonte.largura), fonte.largura - x), h: Math.min(par(pessoa.h * fonte.altura), fonte.altura - y) };
}

/**
 * Threads de cada ffmpeg da montagem. Sem limite, cada um abre uma por núcleo
 * (e o filtro outras tantas), e somados ao Chrome estouraram o teto de
 * processos do contêiner ("Resource temporarily unavailable", 30/09).
 */
const THREADS = process.env.MONTAGEM_FFMPEG_THREADS || "3";

/** Cores dos fundos: as mesmas de worker/remotion/src/partes/cena.tsx. */
const COR_DO_PAPEL = "#EEEAE1";

/**
 * OS FUNDOS PRONTOS (30/09, velocidade): papel, papel na cor da marca e
 * escuro, já com a textura de papel misturada, em JPEG do tamanho do quadro.
 * Antes a mistura (mix-blend-mode) era feita pelo Chrome em TODO quadro; aqui
 * é feita uma vez, em menos de um segundo.
 */
export async function prepararFundos(m, pasta, baixar) {
  let papel = null;
  if (m.papelUrl) {
    papel = join(pasta, "papel-textura.jpg");
    try {
      await baixar(m.papelUrl, papel);
    } catch {
      papel = null;
    }
  }
  // Família colagem: o fundo é a própria colagem (kraft, folhas rasgadas,
  // jornal, fita), desenhada pelo Remotion UMA vez (29/09). Se falhar, cai
  // nos fundos lisos de sempre: fundo pior, mas a montagem sai.
  if (m.familia === "colagem") {
    try {
      return await fundosDeColagem(m, pasta, papel);
    } catch (e) {
      console.error(`[montagem] fundo de colagem falhou, fica o liso: ${e?.message ?? e}`);
    }
  }
  const tamanho = `${m.largura}x${m.altura}`;
  const fundos = {};
  // "papel" fora da colagem (30/09): no sóbrio é o claro da marca, no impacto
  // o escuro; e sem textura de papel por cima (papel era Vox chumbado). As
  // mesmas cores do Fundo em remotion/src/partes/cena.tsx.
  const colagem = !m.familia || m.familia === "colagem";
  const corDoPapel = colagem ? COR_DO_PAPEL : m.familia === "sobrio" ? m.marca.claro : m.marca.escuro;
  if (!colagem) papel = null;
  for (const [nome, cor, modo, opacidade] of [
    ["papel", corDoPapel, "multiply", 0.85],
    ["papel-marca", m.marca.acento, "softlight", 0.7],
    ["escuro", m.marca.escuro, "softlight", 0.7],
  ]) {
    const saida = join(pasta, `fundo-${nome}.jpg`);
    const cor6 = cor.replace("#", "0x");
    await rodar(
      papel
        ? [
            "-f", "lavfi", "-i", `color=c=${cor6}:s=${tamanho}`, "-i", papel,
            "-filter_complex",
            `[1:v]scale=${m.largura}:${m.altura}:force_original_aspect_ratio=increase,crop=${m.largura}:${m.altura},format=gbrp[p];` +
              `[0:v]format=gbrp[c];[c][p]blend=all_mode=${modo}:all_opacity=${opacidade},format=yuvj420p`,
            "-frames:v", "1", "-q:v", "3", "-threads", THREADS, saida,
          ]
        : ["-f", "lavfi", "-i", `color=c=${cor6}:s=${tamanho}`, "-frames:v", "1", "-q:v", "3", saida]
    );
    fundos[nome] = basename(saida);
  }
  return fundos;
}

/**
 * OS FUNDOS DE COLAGEM (29/09, reprovação "nada de elemento gráfico"): a
 * composição "Fundos" do Remotion (remotion/src/partes/fundo-colagem.tsx)
 * desenha papel, papel-marca, escuro e a folha da transição, um por quadro,
 * e cada quadro vira um JPEG do tamanho do vídeo. Quatro quadros num Chrome
 * que o render já ia abrir: uns poucos segundos, e o vídeo não paga nada por
 * quadro (o Remotion só pinta a imagem pronta).
 *
 * O fundo só depende do tamanho, da marca e da textura: fica guardado no
 * disco do worker e os cortes seguintes do mesmo projeto não pagam nada.
 * Mudou o desenho em fundo-colagem.tsx, sobe VERSAO_DOS_FUNDOS.
 */
const VERSAO_DOS_FUNDOS = 1;
const NOMES_DOS_FUNDOS = ["papel", "papel-marca", "escuro", "folha"];

async function fundosDeColagem(m, pasta, papel) {
  const chave = createHash("sha1")
    .update(JSON.stringify({ v: VERSAO_DOS_FUNDOS, l: m.largura, a: m.altura, c: m.marca.acento, e: m.marca.escuro, p: m.papelUrl ?? null }))
    .digest("hex")
    .slice(0, 16);
  const guardados = join(tmpdir(), "montagem-fundos", chave);
  if (NOMES_DOS_FUNDOS.every((n) => existsSync(join(guardados, `fundo-${n}.jpg`)))) {
    const fundos = {};
    for (const n of NOMES_DOS_FUNDOS) {
      await copyFile(join(guardados, `fundo-${n}.jpg`), join(pasta, `fundo-${n}.jpg`));
      fundos[n] = `fundo-${n}.jpg`;
    }
    return fundos;
  }
  const { renderFrames, selectComposition } = await import("@remotion/renderer");
  const serveUrl = await bundleDoRemotion();
  const servidor = await servirPasta(pasta);
  try {
    const inputProps = {
      largura: m.largura,
      altura: m.altura,
      marca: { acento: m.marca.acento, escuro: m.marca.escuro },
      papelUrl: papel ? `${servidor.base}/${basename(papel)}` : null,
    };
    const opcoes = opcoesDoRender();
    const composition = await selectComposition({ serveUrl, id: "Fundos", inputProps, chromiumOptions: opcoes.chromiumOptions, port: opcoes.port });
    const nomes = NOMES_DOS_FUNDOS;
    const fundos = {};
    const gravacoes = [];
    await renderFrames({
      composition,
      serveUrl,
      inputProps,
      outputDir: null,
      imageFormat: "jpeg",
      jpegQuality: 90,
      // Um fundo por aba: os quatro saem juntos.
      concurrency: Math.min(4, opcoes.concurrency),
      chromiumOptions: opcoes.chromiumOptions,
      timeoutInMilliseconds: opcoes.timeoutInMilliseconds,
      port: opcoes.port,
      onStart: () => {},
      onFrameUpdate: () => {},
      onFrameBuffer: (buffer, quadro) => {
        const nome = nomes[quadro];
        if (!nome) return;
        const arquivo = `fundo-${nome}.jpg`;
        fundos[nome] = arquivo;
        gravacoes.push(writeFile(join(pasta, arquivo), buffer));
      },
    });
    await Promise.all(gravacoes);
    if (!fundos.papel) throw new Error("o Remotion não devolveu o fundo de papel");
    try {
      await mkdir(guardados, { recursive: true });
      for (const a of Object.values(fundos)) await copyFile(join(pasta, a), join(guardados, a));
    } catch {
      // Sem cache o próximo corte só desenha de novo.
    }
    return fundos;
  } finally {
    await servidor.fechar();
  }
}

/**
 * O NARRADOR CHEIO JÁ ENQUADRADO (30/09, velocidade). No layout cheio o
 * Chrome desenhava a gravação 16:9 inteira ampliada para 3.413 x 1.920 px em
 * todo quadro, para mostrar só a faixa do meio. O ffmpeg recorta e escala uma
 * vez, e o Remotion desenha um vídeo do tamanho exato do quadro.
 */
export async function prepararCheio(narrador, m, pasta) {
  const cena = m.cenas.find((c) => c.layout === "narrador-cheio" && c.narrador?.modo === "video");
  if (!cena) return null;
  const r = cena.narrador.recorte;
  const saida = join(pasta, "narrador-cheio.mp4");
  await rodar([
    "-i", narrador, "-an",
    // No tamanho da CAIXA do narrador, que no vertical deixa a faixa de cima
    // para os elementos (30/09); no resto ela ainda é o quadro inteiro.
    "-vf", `crop=${r.w}:${r.h}:${r.x}:${r.y},scale=${par(cena.narrador.caixa.w)}:${par(cena.narrador.caixa.h)}:flags=bicubic,setsar=1`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-threads", THREADS, saida,
  ]);
  return { arquivo: basename(saida), recorte: r };
}

/** A máscara da pessoa no trecho inteiro, uma vez só (o MediaPipe do corte). */
export async function mascaraDaPessoa(narrador, pasta, pessoa, duracao) {
  const dim = await ffprobe(narrador);
  const matte = await gerarMatte(narrador, pasta, "montagem", 0, duracao, pessoa);
  if (!matte) return null;
  return { matte, P: pessoaEmPixels({ largura: dim.largura, altura: dim.altura }, pessoa) };
}

const par = (v) => Math.max(2, Math.round(v / 2) * 2);

/**
 * A CENA RECORTADA JÁ COMPOSTA (30/09, velocidade). A primeira versão mandava
 * ao Chrome um WebM com transparência (extraído quadro a quadro em PNG) e
 * desenhava a borda de adesivo com cinco drop-shadow encadeados: 0,9 quadro
 * por segundo, medido, contra 6 das outras cenas. Aqui o ffmpeg faz tudo na
 * mesma geometria que o app resolveu (caixa, fundo): a pessoa pela máscara,
 * a borda branca (máscara dilatada) e a sombra (máscara borrada e deslocada),
 * sobre o fundo pronto. O Remotion recebe um vídeo opaco comum.
 */
export async function comporRecortado(narrador, mascara, cena, indice, fundoJpg, m, pasta) {
  const { matte, P } = mascara;
  const R = matte.recorte;
  const ox = Math.max(0, R.x - P.x);
  const oy = Math.max(0, R.y - P.y);
  const mw = Math.min(R.w, P.w - ox);
  const mh = Math.min(R.h, P.h - oy);
  const W = par(cena.narrador.caixa.w);
  const H = par(cena.narrador.caixa.h);
  const X = Math.round(cena.narrador.caixa.x);
  const Y = Math.round(cena.narrador.caixa.y);
  const inicio = cena.inicio.toFixed(3);
  const dur = (cena.fim - cena.inicio).toFixed(3);
  const saida = join(pasta, `recortado-${indice}.mp4`);
  const comBorda = !m.familia || m.familia === "colagem";
  const grafo =
    `[0:v]crop=${P.w}:${P.h}:${P.x}:${P.y},format=rgba[c];` +
    // A máscara do corte vertical esmaece nos 15% de baixo (feita para fundir
    // com o quadro); na colagem isso virava a pessoa "desbotando" em branco
    // sobre a borda de adesivo (29/09). A linha de 84% é repetida até a base:
    // o corpo chega inteiro à borda do quadro.
    `[1:v]format=gray,crop=${mw}:${mh}:0:0,pad=${P.w}:${P.h}:${ox}:${oy}:black,geq=lum='if(gt(Y,H*0.84),lum(X,H*0.84),lum(X,Y))'[mm];` +
    (comBorda ? `[c][mm]alphamerge,scale=${W}:${H},split=3[p1][p2][p3];` : `[c][mm]alphamerge,scale=${W}:${H},split=2[p1][p3];`) +
    // Borda de adesivo: a máscara borrada e cortada num limiar baixo cresce
    // uns 6 px em volta da pessoa, e vira branco. Só na colagem (30/09): no
    // impacto a pessoa recortada vai limpa sobre a cor da marca.
    (comBorda
      ? `[p2]alphaextract,boxblur=luma_radius=8:luma_power=1,lut=y='if(gt(val,20),255,0)'[ba];` +
        `color=c=white:s=${W}x${H}:r=${m.fps}:d=${dur}[bw];[bw][ba]alphamerge[borda];`
      : "") +
    // Sombra de papel: a máscara bem borrada, a 45%, deslocada para baixo.
    `[p3]alphaextract,boxblur=luma_radius=24:luma_power=2,lut=y='val*0.45'[sa];` +
    `color=c=black:s=${W}x${H}:r=${m.fps}:d=${dur}[bk];[bk][sa]alphamerge[sombra];` +
    `[2:v]scale=${m.largura}:${m.altura},setsar=1,format=rgba[bg];` +
    `[bg][sombra]overlay=${X + 14}:${Y + 26}:shortest=1[b1];` +
    (comBorda ? `[b1][borda]overlay=${X}:${Y}[b2];` : `[b1]null[b2];`) +
    `[b2][p1]overlay=${X}:${Y},format=yuv420p[v]`;
  await rodar(
    [
      "-ss", inicio, "-t", dur, "-i", narrador,
      "-ss", inicio, "-t", dur, "-i", matte.arquivo,
      "-loop", "1", "-framerate", String(m.fps), "-t", dur, "-i", fundoJpg,
      "-filter_complex", grafo, "-filter_complex_threads", THREADS, "-map", "[v]", "-an", "-r", String(m.fps),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-threads", THREADS, saida,
    ],
    { cwd: pasta }
  );
  return basename(saida);
}

/**
 * A GEOMETRIA NO TAMANHO REAL DA GRAVAÇÃO (30/09, gravação de celular).
 *
 * O app resolve o recorte do narrador em pixels de `montagem.fonte`, e essas
 * dimensões ele DEDUZ da capa do corte (lib/media/montagem-nos-cortes.ts,
 * `dimensoesDaGravacao`), com 1920x1080 de reserva quando a capa não abre. A
 * capa antiga sai reduzida a 1280 de largura, e uma gravação de celular em pé
 * não é 1920x1080: nos dois casos o recorte apontaria para pixels que não
 * existem, e o narrador sairia cortado ou esticado. Aqui vale o narrador que
 * este worker acabou de gerar, medido pelo ffprobe (que já considera a
 * rotação do celular).
 *
 * Mesma proporção (o caso da capa reduzida): escala tudo pelo mesmo fator.
 * Proporção diferente (reserva 1920x1080 contra gravação em pé): mantém o
 * CENTRO do recorte e a proporção dele (que é a da caixa na tela), com a mesma
 * fração da altura, e encaixa dentro da gravação.
 */
function ajustarAFonteReal(m, dim) {
  const real = { largura: Number(dim?.largura) || 0, altura: Number(dim?.altura) || 0 };
  const fonte = m.fonte;
  if (!real.largura || !real.altura || !fonte?.largura || !fonte?.altura) return;
  if (real.largura === fonte.largura && real.altura === fonte.altura) return;
  const sx = real.largura / fonte.largura;
  const sy = real.altura / fonte.altura;
  const ajustar = (r) => {
    if (!r) return r;
    const aspecto = r.w / Math.max(1, r.h);
    let h = r.h * sy;
    let w = Math.abs(sx - sy) < 0.01 ? r.w * sx : h * aspecto;
    if (h > real.altura) { h = real.altura; w = h * aspecto; }
    if (w > real.largura) { w = real.largura; h = w / aspecto; }
    const cx = (r.x + r.w / 2) * sx;
    const cy = (r.y + r.h / 2) * sy;
    return {
      x: Math.round(Math.max(0, Math.min(real.largura - w, cx - w / 2))),
      y: Math.round(Math.max(0, Math.min(real.altura - h, cy - h / 2))),
      w: Math.round(w),
      h: Math.round(h),
    };
  };
  const proporcional = Math.abs(sx - sy) < 0.01;
  for (const c of m.cenas ?? []) {
    const n = c.narrador;
    if (n?.modo === "video" && n.recorte) n.recorte = ajustar(n.recorte);
    // O "recortado" pega a imagem da caixa da pessoa medida aqui mesmo
    // (mascaraDaPessoa), mas a LARGURA dele na tela o app calculou com a
    // proporção da caixa em pixels da fonte deduzida. Com a fonte certa a menos
    // de um fator, a proporção não muda e nada a fazer. Com a reserva 1920x1080
    // contra uma gravação em pé, a pessoa sairia 3 vezes mais larga que a tela
    // e ampliada (visto na prova de 30/09): refaz a largura com a proporção
    // real, mantém o centro e a altura, e encaixa no quadro.
    if (n?.modo === "recortado" && !proporcional && n.caixa && n.recorte?.h) {
      const antes = n.caixa;
      const aspecto = (n.recorte.w / n.recorte.h) * (sx / sy);
      const w = Math.round(antes.h * aspecto);
      const centro = antes.x + antes.w / 2;
      const x = w <= m.largura ? Math.round(Math.max(0, Math.min(m.largura - w, centro - w / 2))) : Math.round(centro - w / 2);
      n.caixa = { ...antes, x, w };
      n.recorte = { x: 0, y: 0, w: Math.round(n.recorte.w * sx), h: Math.round(n.recorte.h * sy) };
      // `origemDoZoom` fica: é fração da caixa da PESSOA, que continua sendo a
      // caixa inteira, só com a largura certa.
    }
  }
  console.log(`[montagem] fonte ${fonte.largura}x${fonte.altura} corrigida para ${real.largura}x${real.altura}`);
  m.fonte = real;
}

/** Baixa por fetch simples (URL pública), para quem chama sem `baixar`. */
async function baixarPublico(url, destino) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download respondeu ${r.status}`);
  await writeFile(destino, Buffer.from(await r.arrayBuffer()));
}

/**
 * A montagem inteira. `pedido`:
 *   montagem          MontagemResolvida (obrigatório)
 *   narradorUrl       gravação já limpa no tempo do corte, OU
 *   sourceUrl, inicio, duracao, manter, pessoaDoCorte   para cortar aqui
 *   pessoa            caixa da pessoa em fração (para o recorte)
 *   duracaoDasMidias  opcional, { url: segundos }
 *
 * `baixar(url, destino)` vem de quem chama (o index sabe ler o Blob privado).
 */
export async function montar(pedido, pasta, { baixar, aoProgresso, obterOriginal } = {}) {
  const tempos = {};
  let t = Date.now();
  const marcar = (nome) => {
    tempos[nome] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };

  const m = pedido.montagem;
  if (!m || m.versao !== 1) throw new Error("plano de montagem ausente ou de versão desconhecida");

  // 1. O narrador limpo.
  const narrador = join(pasta, "narrador.mp4");
  if (pedido.narradorArquivo) {
    // Só na prova local: o arquivo já está no disco.
    await rodar(["-i", pedido.narradorArquivo, "-c", "copy", narrador]);
  } else if (pedido.narradorUrl) {
    await baixar(pedido.narradorUrl, narrador);
  } else {
    // A gravação original é a mesma para todos os cortes de um vídeo (1,3 GB
    // no teste): `obterOriginal` baixa uma vez e reaproveita entre montagens.
    let original = join(pasta, "original.mp4");
    if (obterOriginal) original = await obterOriginal(pedido.sourceUrl);
    else await baixar(pedido.sourceUrl, original);
    await prepararTrecho(original, narrador, pedido.inicio, pedido.duracao, pedido.manter, pedido.pessoaDoCorte ?? pedido.pessoa ?? null);
  }
  marcar("narrador");
  ajustarAFonteReal(m, await ffprobe(narrador));

  // 1b. A BATIDA (01/10): com a trilha do projeto, os cortes de cena e os
  //     punches a até 0,12 s de uma batida vão para ela (a fala não muda), e
  //     o som de passagem acompanha. Trilha calma ou falha: nada muda.
  // A trilha do projeto (01/10): `trilha` { url, volume, abaixar }. Volta a
  //    tocar no corte montado (só o corte simples tinha) e dita a batida.
  let arquivoDaTrilha = null;
  const urlDaTrilha = pedido.trilha?.url ?? pedido.musicaUrl ?? null;
  if (urlDaTrilha) {
    try {
      arquivoDaTrilha = join(pasta, "trilha" + (String(urlDaTrilha).match(/\.[a-z0-9]{2,4}(?=\?|$)/i)?.[0] ?? ".mp3"));
      await (baixar ?? baixarPublico)(urlDaTrilha, arquivoDaTrilha);
    } catch (e) {
      arquivoDaTrilha = null;
      console.warn(`[montagem] não consegui baixar a trilha: ${e instanceof Error ? e.message : e}`);
    }
  }
  if (arquivoDaTrilha && m.cenas?.length > 1) {
    try {
      const trilha = arquivoDaTrilha;
      const { batidasDaTrilha, encaixarNaBatida, acompanharSons } = await import("./batidas.mjs");
      const grade = await batidasDaTrilha(trilha, m.duracao);
      const r = encaixarNaBatida(m, grade.batidas, { confianca: grade.confianca });
      if (r.movidos.length) m.sons = acompanharSons(m.sons, r.movidos);
      tempos.batida = { bpm: grade.bpm, confianca: grade.confianca, cortes: r.cortes, punches: r.punches };
    } catch (e) {
      console.warn(`[montagem] batida da trilha falhou, segue sem encaixe: ${e instanceof Error ? e.message : e}`);
    }
  }

  // 2. O que o ffmpeg adianta para o Chrome não fazer em todo quadro
  //    (30/09, velocidade): fundos com textura, o narrador cheio enquadrado e
  //    as cenas recortadas já compostas.
  const fundos = await prepararFundos(m, pasta, baixar ?? baixarPublico);
  const cheio = await prepararCheio(narrador, m, pasta);
  marcar("preparo");
  const recortados = {};
  const indicesRecortados = m.cenas.map((c, i) => (c.narrador?.modo === "recortado" ? i : -1)).filter((i) => i >= 0);
  if (indicesRecortados.length) {
    if (!pedido.pessoa) throw new Error("cena recortada sem a caixa da pessoa");
    const mascara = await mascaraDaPessoa(narrador, pasta, pedido.pessoa, m.duracao);
    for (const i of indicesRecortados) {
      if (mascara) {
        recortados[i] = await comporRecortado(narrador, mascara, m.cenas[i], i, join(pasta, fundos[m.cenas[i].fundo] ?? fundos.papel), m, pasta);
      } else if (m.cenas[i].reserva) {
        // Sem máscara, a cena volta para a pessoa em tela cheia (01/10): sem
        // isso ela saía só com o fundo e a legenda (prova do MrBeast, três
        // quadros laranja vazios).
        m.cenas[i].narrador = m.cenas[i].reserva;
        m.cenas[i].layout = "narrador-cheio";
      } else {
        // Plano antigo, sem reserva: a cena sai sem o narrador, como antes.
        m.cenas[i].narrador = null;
      }
    }
  }
  marcar("recorte");

  // 3. O render.
  const { renderMedia, selectComposition } = await import("@remotion/renderer");
  const serveUrl = await bundleDoRemotion();
  // A duração de cada cena gerada (29/09): o Remotion desacelera ou segura o
  // último quadro quando o vídeo é mais curto que a cena, e continua de onde
  // parou quando a mesma cena aparece duas vezes seguidas. O ffprobe lê só o
  // cabeçalho pela URL pública.
  const duracaoDasMidias = { ...(pedido.duracaoDasMidias ?? {}) };
  for (const url of new Set(m.cenas.map((c) => (c.midia?.tipo === "video" ? c.midia.url : null)).filter(Boolean))) {
    if (duracaoDasMidias[url]) continue;
    try {
      const d = (await ffprobe(url)).duracaoSec;
      if (d > 0) duracaoDasMidias[url] = d;
    } catch {
      // Sem a duração, o vídeo toca do jeito que vier (como antes).
    }
  }
  marcar("bundle");
  const servidor = await servirPasta(pasta);
  try {
    const inputProps = {
      montagem: m,
      narradorUrl: `${servidor.base}/narrador.mp4`,
      recortadoUrl: null,
      recortados: Object.fromEntries(Object.entries(recortados).map(([i, a]) => [i, `${servidor.base}/${a}`])),
      fundos: Object.fromEntries(Object.entries(fundos).map(([k, a]) => [k, `${servidor.base}/${a}`])),
      cheio: cheio ? { url: `${servidor.base}/${cheio.arquivo}`, recorte: cheio.recorte } : null,
      duracaoDasMidias,
    };
    // `leve` (01/10, parte 240): a terceira tentativa que o app manda depois de
    // duas falhas técnicas. Duas abas do Chrome e um fio de extração de vídeo
    // em vez de quatro e dois: mais lento, quase sem pico de memória e de fios.
    const opcoes = pedido.leve ? { ...opcoesDoRender(), concurrency: 2, offthreadVideoThreads: 1 } : opcoesDoRender();
    const composition = await selectComposition({ serveUrl, id: "Montagem", inputProps, chromiumOptions: opcoes.chromiumOptions, port: opcoes.port });
    const saida = join(pasta, "montado.mp4");
    await renderMedia({
      ...opcoes,
      composition,
      serveUrl,
      outputLocation: saida,
      inputProps,
      onProgress: aoProgresso ? ({ progress }) => aoProgresso(progress) : undefined,
    });
    marcar("render");
    // O SOUND DESIGN (01/10): os efeitos sintetizados do estilo, por baixo da
    // voz (src/sons.mjs). O vídeo é copiado; falhar aqui não derruba nada.
    let montado = saida;
    if (m.sons?.length || arquivoDaTrilha) {
      try {
        const { misturarAudio } = await import("./sons.mjs");
        montado = await misturarAudio(
          saida,
          { eventos: m.sons ?? [], trilha: arquivoDaTrilha ? { arquivo: arquivoDaTrilha, volume: pedido.trilha?.volume, abaixar: pedido.trilha?.abaixar } : null },
          m.duracao,
          pasta,
          join(pasta, "montado-com-som.mp4")
        );
        tempos.sons = m.sons?.length ?? 0;
        tempos.trilha = Boolean(arquivoDaTrilha);
        marcar("sons");
      } catch (e) {
        console.warn(`[montagem] trilha e efeitos falharam, o corte sai sem eles: ${e instanceof Error ? e.message : e}`);
        montado = saida;
      }
    }
    // O GANCHO do corte curto (01/10): a frase forte de 3 a 5 s que o cliente
    // aprovou, tirada do próprio corte montado (com a legenda e os efeitos
    // dele), toca antes do começo com zoom de impacto, flash, som de
    // transição e o texto de soco. Falhar aqui não derruba a montagem.
    const g = pedido.gancho;
    if (g && Number.isFinite(g.inicio) && Number.isFinite(g.fim) && g.fim - g.inicio >= 1.5 && g.fim <= m.duracao + 0.5) {
      try {
        const { montarAberturaDeImpacto, prefixarAbertura } = await import("./abertura-de-impacto.mjs");
        const abertura = await montarAberturaDeImpacto(montado, [{ inicio: g.inicio, fim: g.fim, soco: g.soco }], pasta, {
          familia: g.familia ?? m.familia,
          acento: g.acento ?? m.marca?.acento,
          foco: { x: 0.5, y: 0.4 },
          passagem: g.passagem ?? null,
        });
        if (abertura) {
          const comGancho = join(pasta, "montado-com-gancho.mp4");
          await prefixarAbertura(abertura, montado, comGancho, pasta, { copiar: false });
          marcar("gancho");
          // A duração do gancho volta para a guarda da fala não mexer nele
          // (ele repete de propósito uma frase do corte).
          const ganchoSeg = (await ffprobe(abertura).catch(() => null))?.duracaoSec ?? 0;
          return { arquivo: comGancho, tempos, ganchoSeg };
        }
      } catch (e) {
        console.error(`[montagem] gancho falhou, o corte sai sem ele: ${e instanceof Error ? e.message : e}`);
      }
    }
    return { arquivo: montado, tempos };
  } finally {
    await servidor.fechar();
  }
}
