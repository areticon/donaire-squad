import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readdir, rm, writeFile, copyFile, link, rename, stat, statfs, utimes } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aoCancelarOTrabalho, emendar, ffprobe, fpsDe, processoDoTrabalho, rodar, trabalhoCancelado } from "./ffmpeg.mjs";
import { bundleDoRemotion, opcoesDoRender } from "./montagem.mjs";
import { esperarMemoria, memoriaLivreMb } from "./memoria.mjs";

/**
 * O EDITOR SOB MEDIDA NO WORKER (03/10/2026).
 *
 * O vídeo de pitch da landing ficou bom porque um programa escrito para ELE
 * desenhou camadas em HTML e as compôs no ffmpeg sobre o material, e o
 * resultado foi olhado e refeito (scratchpad/pitch/v4/montar_pitch4.py). Este
 * módulo é esse programa, generalizado: o app manda a EDIÇÃO que o agente
 * editor escreveu (lib/media/editor-sob-medida), e aqui:
 *
 *   1. as CAMADAS (títulos, cartões, linhas do tempo, números, mapas) são
 *      desenhadas pelo Remotion, TRANSPARENTES, e só nos quadros em que alguma
 *      coisa se mexe (entrada, passo, saída). Entre um movimento e outro a
 *      camada está parada, e um quadro só basta: o ffmpeg segura. É o que deixa
 *      um completo de 20 min com 80 peças caber em poucos minutos de Chrome;
 *   2. a GRAVAÇÃO passa pelo ffmpeg, plano a plano: cheia com o enquadramento
 *      do momento (médio, fechado, puxado para um lado), em CARTÃO sobre o
 *      fundo da marca, escondida atrás de um GRÁFICO de tela cheia, ou trocada
 *      por uma INSERÇÃO gerada;
 *   3. a LEGENDA pequena e limpa (a do pitch) é queimada no fim, e o áudio da
 *      base nunca é tocado.
 *
 * Em lotes de ~60 s, como o completo editado (worker/src/montagem-do-completo.mjs).
 * `escala` < 1 faz a PRÉVIA (metade da resolução) que o revisor com visão olha.
 *
 * Desde 05/10 o lote é CONTADO EM QUADROS (corte por índice, relógio pela
 * contagem, conferência da soma no fim): ver o comentário em `grafoDoLote`.
 * Foi a boca fora de hora do completo de cmuvv0jje, um quadro perdido por lote.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_DAS_FONTES = resolve(AQUI, "..", "fontes");
/**
 * O tamanho do lote (03/10, terceira volta): a memória do ffmpeg cresce com o
 * lote (as filas do grafo guardam quadros até a vez de cada plano). Medido no
 * completo de cmurtv2zg: lote de 60 s em 1080p chegou a 7,4 GB (o OOM do
 * worker); com as listas e as imagens consertadas, 2,4 GB; o de 30 s, 0,8 a
 * 1,2 GB. O final vai em 30 s; a prévia (metade da resolução) segue em 60 s.
 */
const LOTE_SEG_FINAL = Math.max(10, Number(process.env.SOB_MEDIDA_LOTE_SEG ?? 30));
const LOTE_SEG_PREVIA = 60;
const PAR = (v) => Math.max(2, Math.round(v / 2) * 2);

/**
 * Quantos quadros de vídeo um arquivo tem (05/10): pelos PACOTES, sem
 * decodificar (num .mp4 só de vídeo, um pacote é um quadro). É a conta que
 * fecha o lote e o vídeo emendado contra o que o grafo prometeu.
 */
export function contarQuadros(arquivo) {
  return new Promise((resolve, reject) => {
    const p = spawn("ffprobe", ["-v", "error", "-select_streams", "v:0", "-count_packets", "-show_entries", "stream=nb_read_packets", "-of", "csv=p=0", arquivo]);
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.on("error", reject);
    p.on("close", (c) => {
      const n = Number(String(s).trim());
      if (c !== 0 || !Number.isFinite(n)) return reject(new Error(`ffprobe não contou os quadros de ${basename(arquivo)}`));
      resolve(n);
    });
  });
}
/**
 * O CACHE DAS CAMADAS DA PRÉVIA (05/10). O completo de 17 min de
 * cmuums24z passou por TRÊS prévias (rodadas 0, 1 e 2 do juiz) e cada uma
 * desenhou as ~16 mil camadas de novo no Chrome (~15 min por prévia, 3/4
 * disso no Remotion), embora o conserto entre uma rodada e outra troque umas
 * 20 a 30 peças de 100. O quadro condensado só depende do instante, das
 * camadas visíveis nele (na ordem) e do que vale para todos (tamanho, tema,
 * logo, passada, escala): Camadas.tsx desenha `contexto(c, t)` e nada mais.
 * Então cada quadro ganha uma chave com isso, e a prévia seguinte do mesmo
 * vídeo só leva ao Chrome os trechos que mudaram. Só na prévia (o final é um
 * só, em resolução cheia, e o disco não comporta guardar 16 mil quadros de
 * 1080p); a pasta de cada vídeo sai depois de SOB_MEDIDA_CACHE_HORAS sem uso.
 */
const VERSAO_DO_CACHE = 1;
const RAIZ_DO_CACHE = process.env.SOB_MEDIDA_CACHE_DIR || join(tmpdir(), "camadas-cache");
const HORAS_DO_CACHE = Math.max(0.5, Number(process.env.SOB_MEDIDA_CACHE_HORAS) || 4);
/** Disco livre mínimo para gravar no cache (o render em si precisa do resto). */
const MB_LIVRES_PARA_O_CACHE = 6000;
const cacheLigado = () => process.env.SOB_MEDIDA_CACHE !== "0";
/** Inserções baixadas e normalizadas ao mesmo tempo (cada ffmpeg da normalização fica abaixo de 0,5 GB). */
const MIDIAS_JUNTAS = Math.max(1, Math.min(8, Number(process.env.SOB_MEDIDA_MIDIAS_JUNTAS) || 4));

/** Roda `fn` em cada item, no máximo `n` de cada vez. */
async function emParalelo(itens, n, fn) {
  let proximo = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, itens.length) }, async () => {
      while (proximo < itens.length) {
        if (trabalhoCancelado()) return;
        await fn(itens[proximo++]);
      }
    })
  );
}

/**
 * O FPS DAS CAMADAS (06/10, diagnóstico de cmux0hoxk): a edição chegava com
 * fps 15 e o vídeo de celular a 29,58; o worker segurava cada quadro de camada
 * por dois do vídeo e as animações das peças saíam travadas. Agora as camadas
 * são desenhadas na taxa da BASE (o quadro k da camada cai no quadro k do
 * vídeo, sem segurar); acima de 30 (gravação a 50 ou 60), num divisor inteiro
 * dela que fique em até 30, para cada quadro de camada cair inteiro num grupo
 * de quadros do vídeo. O fps que vem na edição não manda mais (era o teto do
 * app para poupar o Chrome). SOB_MEDIDA_FPS_CAMADAS força outro número sem
 * deploy de código, nunca acima da base. Só os quadros que se MEXEM vão ao
 * Chrome (a linha condensada): o parado continua sendo um quadro só.
 */
export function fpsDasCamadas(fpsBase) {
  const base = Number(fpsBase) > 0 ? Number(fpsBase) : 30;
  const forcado = Number(process.env.SOB_MEDIDA_FPS_CAMADAS);
  if (Number.isFinite(forcado) && forcado >= 5) return Math.min(forcado, base);
  return base > 30.5 ? Math.round((base / Math.ceil(base / 30.5)) * 1000) / 1000 : base;
}

// ─────────────────────────────── 1. a linha condensada ───────────────────────────────

/** Os intervalos em que a camada se mexe (entrada, cada passo, saída). */
export function movimentosDaCamada(c) {
  // O palco (câmera virtual) e o título que deriva se mexem o tempo todo.
  if (c.continua) return [[c.de, c.ate]];
  const m = [[c.de, Math.min(c.ate, c.de + c.entrada)]];
  for (const e of c.eventos ?? []) if (e < c.ate) m.push([Math.max(c.de, e), Math.min(c.ate, e + c.evento)]);
  m.push([Math.max(c.de, c.ate - c.saida), c.ate]);
  return m;
}

/**
 * Cada quadro do vídeo (no fps das camadas) é VAZIO (nenhuma camada), ATIVO
 * (alguma se mexe) ou PARADO (camadas visíveis, nenhuma se mexendo). Quadros
 * ativos seguidos viram um trecho que o Remotion desenha inteiro; um trecho
 * parado vira um quadro só (no meio dele); o vazio não vai ao Chrome.
 * Devolve os trechos da linha condensada e a lista de exibição (quadro
 * condensado ou vazio, com a duração em segundos).
 */
export function linhaCondensada(camadas, duracao, fps) {
  const total = Math.ceil(duracao * fps);
  const estado = new Uint8Array(total); // 0 vazio, 1 parado, 2 ativo
  const marcar = (a, b, v) => {
    const f0 = Math.max(0, Math.floor(a * fps));
    const f1 = Math.min(total, Math.ceil(b * fps));
    for (let f = f0; f < f1; f++) if (estado[f] < v) estado[f] = v;
  };
  for (const c of camadas) {
    marcar(c.de, c.ate, 1);
    for (const [a, b] of movimentosDaCamada(c)) marcar(a, b, 2);
  }
  // O conjunto visível muda só dentro de um trecho ativo (entrada e saída são
  // movimento), mas por segurança a borda de toda camada vira ativa.
  for (const c of camadas) {
    for (const t of [c.de, c.ate]) {
      const f = Math.round(t * fps);
      for (const g of [f - 1, f]) if (g >= 0 && g < total && estado[g] === 1) estado[g] = 2;
    }
  }
  const trechos = [];
  const exibir = []; // { tipo: "quadro"|"vazio", c?: índice condensado, seg }
  let c0 = 0;
  let f = 0;
  while (f < total) {
    let g = f;
    while (g < total && estado[g] === estado[f]) g++;
    const n = g - f;
    if (estado[f] === 0) exibir.push({ tipo: "vazio", seg: n / fps, de: f / fps });
    else if (estado[f] === 2) {
      trechos.push({ c0, t0: +(f / fps).toFixed(5), n });
      for (let k = 0; k < n; k++) exibir.push({ tipo: "quadro", c: c0 + k, seg: 1 / fps, de: (f + k) / fps });
      c0 += n;
    } else {
      trechos.push({ c0, t0: +((f + n / 2) / fps).toFixed(5), n: 1 });
      exibir.push({ tipo: "quadro", c: c0, seg: n / fps, de: f / fps });
      c0 += 1;
    }
    f = g;
  }
  return { trechos, exibir, quadros: c0 };
}

// ─────────────────────────────── 2. o render das camadas ───────────────────────────────

/**
 * AS TRANSIÇÕES ENTRE PLANOS (03/10, segunda volta): em cada troca de plano
 * da gravação (câmera cheia, cartão, inserção) entra uma camada "transicao"
 * de ~0,5 s centrada no corte, que o esconde com luz. O palco das telas
 * cheias tem a própria entrada (íris, cortina de luz, zoom) e não leva.
 */
export function transicoesDaEdicao(ed) {
  // A JORNADA OFICIAL (06/10): sem transição chamativa; a gravação do cliente passa intacta.
  if (ed.jornada) return [];
  const saida = [];
  const bordas = [];
  for (const p of ed.planos ?? []) {
    if (p.tipo === "grafico" && ed.palco) continue;
    // O B-ROLL de banco (03/10, terceira volta) entra e sai no chicote ou na luz, curto.
    const tipo = p.tipo === "insercao" && ed.insercoes?.[p.midia]?.origem === "banco" ? "broll" : p.tipo;
    for (const t of [p.de, p.ate]) if (t > 0.3 && t < ed.duracao - 0.3) bordas.push({ t, tipo });
  }
  bordas.sort((a, b) => a.t - b.t);
  let ultimo = -10;
  bordas.forEach((b, k) => {
    if (b.t - ultimo < 0.5) return;
    ultimo = b.t;
    const tipo = b.tipo === "insercao" ? "flash" : b.tipo === "broll" ? (k % 3 === 2 ? "luz" : "whip") : k % 2 ? "whip" : "luz";
    const meia = tipo === "flash" ? 0.18 : b.tipo === "broll" ? 0.2 : 0.26;
    saida.push({ id: `tr${k}`, peca: "transicao", de: +(b.t - meia).toFixed(3), ate: +(b.t + meia).toFixed(3), entrada: 2 * meia, saida: 0.05, evento: 0.5, eventos: [], props: { tipo }, passes: ["frente"], continua: true });
  });
  return saida;
}

const passesDa = (c) => (Array.isArray(c.passes) && c.passes.length ? c.passes : ["frente"]);

/**
 * A chave de cada quadro condensado (o cache da prévia, acima): o instante
 * EXATO que Camadas.tsx calcula (`t0 + k / fps`, a mesma conta de
 * `tempoDoQuadro`), as camadas visíveis nele na ordem de desenho (as mesmas
 * de `contexto`: de <= t < ate) e o `comum` (tamanho, tema, logo, passada,
 * escala). Devolve uma chave por quadro, na ordem condensada.
 */
export function chavesDosQuadros(cs, trechos, fps, comum) {
  const raiz = createHash("sha1").update(JSON.stringify({ v: VERSAO_DO_CACHE, ...comum })).digest("hex");
  const daCamada = cs.map((c) => createHash("sha1").update(JSON.stringify(c)).digest("hex"));
  const chaves = [];
  for (const tr of trechos) {
    for (let k = 0; k < tr.n; k++) {
      const t = tr.t0 + k / fps;
      const h = createHash("sha1").update(raiz).update(String(t));
      cs.forEach((c, i) => {
        if (t >= c.de && t < c.ate) h.update(daCamada[i]);
      });
      chaves.push(h.digest("hex"));
    }
  }
  return chaves;
}

/** Hardlink (mesmo disco, sem cópia); sem suporte, cópia. Destino existente fica. */
async function ligarArquivo(de, para) {
  try {
    await link(de, para);
  } catch (e) {
    if (e?.code === "EEXIST") return;
    await copyFile(de, para);
  }
}

/** Disco livre em MB onde fica o cache (null se não der para medir). */
async function discoLivreMb(dir) {
  try {
    const s = await statfs(dir);
    return Math.round((s.bavail * s.bsize) / 1048576);
  } catch {
    return null;
  }
}

/** Apaga as pastas de cache de vídeo que ninguém usa há mais de HORAS_DO_CACHE. */
async function limparCacheVelho() {
  try {
    const limite = Date.now() - HORAS_DO_CACHE * 3600_000;
    for (const nome of await readdir(RAIZ_DO_CACHE)) {
      const dir = join(RAIZ_DO_CACHE, nome);
      const s = await stat(dir).catch(() => null);
      if (s && s.mtimeMs < limite) await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  } catch {
    // Sem a raiz ainda: nada a limpar.
  }
}

/** A pasta de cache das camadas deste pedido, ou null (final, cache desligado, sem id). */
export function pastaDoCacheDasCamadas(pedido, escala) {
  if (!cacheLigado() || !(escala < 1)) return null;
  const id = String(pedido?.videoJobId ?? "").replace(/[^a-z0-9-]/gi, "");
  return id ? join(RAIZ_DO_CACHE, id) : null;
}

/**
 * As camadas, desenhadas em até três PASSADAS (worker/remotion/src/sob-medida/
 * Camadas.tsx): "frente" (tudo), "atras" (o que vai por baixo da pessoa
 * recortada) e "vidro" (a máscara do desfoque). Cada passada tem a sua linha
 * condensada: só as camadas dela vão ao Chrome.
 */
export async function renderizarCamadas(edicao, pasta, escala, aoProgresso, cache = null) {
  const { renderFrames, renderStill, selectComposition, makeCancelSignal } = await import("@remotion/renderer");
  // O PRAZO DO TRABALHO (04/10): estourado, o Chrome do Remotion é fechado
  // pelo sinal de cancelamento, em vez de deixar a promessa pendurada.
  const { cancelSignal, cancel } = makeCancelSignal();
  const soltarCancelamento = aoCancelarOTrabalho(cancel);
  try {
    return await renderizarCamadasCom({ renderFrames, renderStill, selectComposition, cancelSignal }, edicao, pasta, escala, aoProgresso, cache);
  } finally {
    soltarCancelamento();
  }
}

async function renderizarCamadasCom({ renderFrames, renderStill, selectComposition, cancelSignal }, edicao, pasta, escala, aoProgresso, cache) {
  const serveUrl = await bundleDoRemotion();
  const fps = edicao.fps;
  const opcoes = opcoesDoRender();
  // AS ABAS DAS CAMADAS (05/10): a composição das camadas não tem vídeo (só
  // HTML, SVG e imagens paradas), e a conta de 1,9 GB por aba da capacidade
  // foi medida no corte com OffthreadVideo. SOB_MEDIDA_ABAS ajusta sem deploy
  // de código; sem ela, o número de sempre.
  const abas = Math.max(1, Math.min(16, Number(process.env.SOB_MEDIDA_ABAS) || opcoes.concurrency));
  if (cache) {
    await mkdir(RAIZ_DO_CACHE, { recursive: true }).catch(() => {});
    await limparCacheVelho();
    // A pasta do vídeo marca o último uso (a limpeza olha a data dela).
    await mkdir(cache, { recursive: true }).catch(() => {});
    await utimes(cache, new Date(), new Date()).catch(() => {});
  }
  const usarCache = cache && ((await discoLivreMb(RAIZ_DO_CACHE)) ?? 0) >= MB_LIVRES_PARA_O_CACHE ? cache : null;
  const reuso = { quadros: 0, desenhados: 0 };
  const base = { largura: edicao.largura, altura: edicao.altura, fps, tema: edicao.tema, logoUrl: edicao.logoUrl ?? null };
  const W = PAR(edicao.largura * escala);
  const H = PAR(edicao.altura * escala);
  const todas = [...edicao.camadas, ...transicoesDaEdicao(edicao)];
  const pedidos = ["frente", "atras", "vidro"].map((passe) => [passe, todas.filter((c) => passesDa(c).includes(passe))]).filter(([passe, cs]) => passe === "frente" || cs.length);
  const linhas = pedidos.map(([passe, cs]) => [passe, cs, linhaCondensada(cs, edicao.duracao, fps)]);
  const totalQuadros = linhas.reduce((s, [, , l]) => s + l.quadros, 0);
  let feitos = 0;
  const passadas = {};
  for (const [passe, cs, { trechos, exibir, quadros }] of linhas) {
    const nomeDir = passe === "frente" ? "camadas" : `camadas-${passe}`;
    const dirQ = join(pasta, nomeDir);
    await rm(dirQ, { recursive: true, force: true });
    await mkdir(dirQ, { recursive: true });
    let arquivos = [];
    if (quadros > 0) {
      const antes = feitos;
      // Desenha `lista` (trechos da linha condensada) na pasta `saida`.
      const desenhar = async (lista, saida) => {
        const inputProps = { ...base, camadas: cs, trechos: lista, passe };
        const composition = await selectComposition({ serveUrl, id: "SobMedidaCamadas", inputProps, chromiumOptions: opcoes.chromiumOptions });
        await renderFrames({
          composition,
          serveUrl,
          inputProps,
          outputDir: saida,
          imageFormat: "png",
          imageSequencePattern: "q-[frame].[ext]",
          concurrency: abas,
          scale: escala,
          chromiumOptions: opcoes.chromiumOptions,
          timeoutInMilliseconds: 120_000,
          cancelSignal,
          onStart: () => {},
          onFrameUpdate: (n) => aoProgresso?.((antes + n) / Math.max(1, totalQuadros)),
        });
      };
      let feitoPeloCache = false;
      if (usarCache) {
        // Qualquer falha aqui cai no desenho inteiro, como sempre foi.
        try {
          const dirCache = join(usarCache, passe);
          await mkdir(dirCache, { recursive: true });
          const chaves = chavesDosQuadros(cs, trechos, fps, { largura: edicao.largura, altura: edicao.altura, W, H, fps, tema: edicao.tema, logoUrl: edicao.logoUrl ?? null, passe, escala });
          // Trecho com TODOS os quadros no cache vem de lá; o resto vai ao Chrome
          // numa linha condensada só com ele (o trecho guarda o próprio t0).
          const faltam = [];
          for (const tr of trechos) {
            let todos = true;
            for (let k = 0; k < tr.n && todos; k++) todos = existsSync(join(dirCache, `${chaves[tr.c0 + k]}.png`));
            if (todos) {
              for (let k = 0; k < tr.n; k++) await ligarArquivo(join(dirCache, `${chaves[tr.c0 + k]}.png`), join(dirQ, `q-${tr.c0 + k}.png`));
              reuso.quadros += tr.n;
            } else faltam.push(tr);
          }
          if (faltam.length) {
            let c = 0;
            const sub = faltam.map((tr) => {
              const x = { c0: c, t0: tr.t0, n: tr.n };
              c += tr.n;
              return x;
            });
            const dirNovos = join(pasta, `${nomeDir}-novos`);
            await rm(dirNovos, { recursive: true, force: true });
            await mkdir(dirNovos, { recursive: true });
            await desenhar(sub, dirNovos);
            const novos = (await readdir(dirNovos)).filter((a) => /^q-\d+\.png$/.test(a)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
            if (novos.length !== c) throw new Error(`o Remotion devolveu ${novos.length} quadros novos de ${c}`);
            let i = 0;
            for (const tr of faltam) {
              for (let k = 0; k < tr.n; k++, i++) {
                const destino = join(dirQ, `q-${tr.c0 + k}.png`);
                await rename(join(dirNovos, novos[i]), destino);
                await ligarArquivo(destino, join(dirCache, `${chaves[tr.c0 + k]}.png`)).catch(() => {});
              }
            }
            await rm(dirNovos, { recursive: true, force: true }).catch(() => {});
            reuso.desenhados += c;
          }
          feitoPeloCache = true;
        } catch (e) {
          console.warn(`[sob-medida] cache das camadas (${passe}) falhou, desenha tudo: ${e?.message ?? e}`);
          await rm(dirQ, { recursive: true, force: true });
          await mkdir(dirQ, { recursive: true });
        }
      }
      if (!feitoPeloCache) {
        await desenhar(trechos, dirQ);
        reuso.desenhados += quadros;
      }
      feitos += quadros;
      arquivos = (await readdir(dirQ)).filter((a) => /^q-\d+\.png$/.test(a)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));
      if (arquivos.length !== quadros) throw new Error(`o Remotion devolveu ${arquivos.length} quadros de ${quadros} (passada ${passe})`);
    }
    // O quadro vazio (transparente) do tamanho certo.
    await rodar(["-f", "lavfi", "-i", `color=c=black@0:s=${W}x${H},format=rgba`, "-frames:v", "1", join(dirQ, "vazio.png")]);
    passadas[passe] = { exibir, arquivos, dirQ, nomeDir, quadros, intervalos: cs.map((c) => [c.de, c.ate]) };
  }
  // Os fundos da marca: o liso e um por caixa de cartão.
  const fundos = {};
  const caixas = new Map();
  for (const p of edicao.planos ?? []) if (p.tipo === "cartao" && p.caixa) caixas.set(JSON.stringify(p.caixa), p.caixa);
  const pedidosDeFundo = [["liso", null], ...[...caixas.entries()].map(([k, cx], i) => [`cartao-${i}`, cx, k])];
  for (const [nome, cartao, chave] of pedidosDeFundo) {
    const inputProps = { largura: edicao.largura, altura: edicao.altura, tema: edicao.tema, cartao };
    const composition = await selectComposition({ serveUrl, id: "SobMedidaFundo", inputProps, chromiumOptions: opcoes.chromiumOptions });
    const out = join(pasta, `fundo-${nome}.png`);
    await renderStill({ composition, serveUrl, inputProps, output: out, frame: 0, imageFormat: "png", scale: escala, chromiumOptions: opcoes.chromiumOptions, cancelSignal });
    fundos[chave ?? "liso"] = out;
  }
  return { passadas, fundos, quadros: totalQuadros, todas, reuso };
}

/**
 * A PESSOA RECORTADA (03/10, segunda volta): a máscara da linha inteira,
 * segmentada só onde há camada na passada de trás (com folga), pelo
 * MediaPipe do recorte.py. Falhar aqui não derruba nada: sem máscara, o
 * título de trás fica por baixo da gravação inteira e a peça cai para a frente.
 */
async function matteDaPessoa(base, pasta, duracao, fps, intervalos) {
  if (!intervalos?.length) return null;
  const juntos = [];
  for (const [a, b] of intervalos.map(([a, b]) => [Math.max(0, a - 0.3), Math.min(duracao, b + 0.3)]).sort((x, y) => x[0] - y[0])) {
    const ult = juntos[juntos.length - 1];
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b);
    else juntos.push([a, b]);
  }
  const saida = join(pasta, "matte-pessoa.mp4");
  const PYTHON = process.env.PYTHON_DO_RECORTE ?? "python3";
  const modelo = process.env.MODELO_SEGMENTACAO ?? "/app/modelos/selfie_segmenter.tflite";
  const config = JSON.stringify({ modo: "linha", video: base, saida, fps, duracao, largura: 512, intervalos: juntos, modelo });
  const texto = await new Promise((resolver) => {
    const p = processoDoTrabalho(spawn(PYTHON, [join(AQUI, "recorte.py"), config], { cwd: pasta }));
    let out = "";
    let err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    const relogio = setTimeout(() => p.kill("SIGKILL"), Math.max(180_000, duracao * 4000));
    p.on("close", (codigo) => {
      clearTimeout(relogio);
      if (codigo !== 0) console.warn(`[sob-medida] recorte da pessoa saiu com ${codigo}: ${err.slice(-300)}`);
      resolver(codigo === 0 ? out : null);
    });
    p.on("error", (e) => {
      clearTimeout(relogio);
      console.warn(`[sob-medida] recorte da pessoa não rodou: ${e.message}`);
      resolver(null);
    });
  });
  const linha = String(texto ?? "").trim().split("\n").reverse().find((l) => l.trim().startsWith("{"));
  try {
    return linha && JSON.parse(linha).ok && existsSync(saida) ? saida : null;
  } catch {
    return null;
  }
}

/**
 * O SOM DAS PEÇAS (03/10, segunda volta): whoosh na entrada das telas e das
 * transições, impacto no título de trás, riser antes do número que conta,
 * tique nos itens que acendem. Sintetizados em src/sons.mjs, mixados abaixo
 * da voz; no máximo um efeito a cada 0,35 s.
 */
export function efeitosDaEdicao(camadas) {
  const ev = [];
  const TELA = new Set(["frase-impacto", "citacao", "pergaminho", "cartoes", "linha-do-tempo", "escada", "comparacao", "fluxo", "numero", "cifrao", "mapa", "fecho", "passos-foco", "grafico-linha", "palavra-gigante", "busca", "pilha-passos", "notebook", "ilustracao-traco", "chat", "material", "seguir", "ferramentas", "colagem", "jornal", "mapa-antigo", "censura", "cronologia"]);
  const CONTA = new Set(["numero", "progresso", "barras", "grafico-linha", "cifrao"]);
  for (const c of camadas) {
    if (["moldura-do-cartao", "legenda-destaque", "grade-azul", "fundo-colagem"].includes(c.peca)) continue;
    if (c.peca === "transicao") ev.push({ t: c.de + 0.05, som: "whoosh", volume: c.props?.tipo === "flash" ? 0.3 : 0.22 });
    else if (c.peca === "titulo-atras") {
      ev.push({ t: Math.max(0, c.de - 0.45), som: "riser", volume: 0.14 });
      ev.push({ t: c.de + 0.12, som: "impacto", volume: 0.28 });
    } else if (TELA.has(c.peca)) ev.push({ t: Math.max(0, c.de - 0.05), som: "whoosh", volume: 0.24 });
    else if (c.peca === "palavra-chave" || c.peca === "capitulo" || c.peca === "carimbo") ev.push({ t: c.de + 0.02, som: "impacto", volume: 0.18 });
    else ev.push({ t: c.de + 0.05, som: "pop", volume: 0.12 });
    if (CONTA.has(c.peca)) ev.push({ t: c.de + 0.4, som: "riser", volume: 0.1 });
    for (const e of c.eventos ?? []) ev.push({ t: e, som: "tique", volume: 0.16 });
  }
  ev.sort((a, b) => a.t - b.t);
  const saida = [];
  for (const e of ev) if (!saida.length || e.t - saida[saida.length - 1].t >= 0.35 || e.som === "impacto") saida.push(e);
  return saida;
}

// ─────────────────────────────── 3. a legenda ───────────────────────────────

const assTempo = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const mi = Math.floor((t % 3600) / 60);
  return `${h}:${String(mi).padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
};
const assCor = (hex, alfa = 0) => {
  const h = String(hex || "#000000").replace("#", "").padEnd(6, "0");
  return `&H${alfa.toString(16).padStart(2, "0").toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};

/**
 * O DESENHO DA LEGENDA NO ESTILO (06/10, noite; lib/media/editor-por-comando/estilo-manda.ts): com
 * `edicao.legenda.estilo`, a letra, o tamanho e a posição que o estilo pede (a condensada grande no meio,
 * logo abaixo do rosto, com contorno; a limpa na caixa escura). Sem o campo, a legenda de sempre.
 */
export function desenhoDaLegenda(estilo, W, H) {
  const vertical = H > W;
  const ey = H / (vertical ? 1920 : 1080);
  if (!estilo) return { fonte: "Geist SemiBold", tam: Math.round((vertical ? 54 : 50) * ey), contorno: false, alinhamento: 2, margemV: Math.round(vertical ? H * 0.2 : 40 * ey), caixaAlta: false };
  const tamanhos = { grande: vertical ? 92 : 76, medio: vertical ? 70 : 60, pequeno: vertical ? 54 : 50 };
  const fonte = estilo.letra === "condensada" ? "Anton" : estilo.letra === "serifa" ? "PT Serif" : "Geist SemiBold";
  const tam = Math.round((tamanhos[estilo.tamanho] ?? tamanhos.medio) * ey);
  // A letra condensada (ou a legenda grande) vai com contorno preto grosso, sem caixa: o desenho das legendas de retenção.
  const contorno = estilo.letra === "condensada" || estilo.tamanho === "grande";
  const caixaAlta = Boolean(estilo.caixaAlta);
  if (estilo.posicao === "centro") return { fonte, tam, contorno, alinhamento: 8, margemV: Math.round(H * (Number(estilo.y) || 0.58)), caixaAlta };
  if (estilo.posicao === "topo") return { fonte, tam, contorno, alinhamento: 8, margemV: Math.round(vertical ? H * 0.035 : 40 * ey), caixaAlta };
  return { fonte, tam, contorno, alinhamento: 2, margemV: Math.round(vertical ? H * 0.17 : 40 * ey), caixaAlta };
}

const DESENHOS_DO_CLIENTE = new Set(["palavra", "caixa", "marca-texto", "limpa", "papel"]);

/**
 * O ESTILO DE LEGENDA ESCOLHIDO PELO CLIENTE (06/10, noite; vídeo cmux4417u: escolheu "Recorte de papel" e saiu a
 * pílula pequena de sempre). Mesmo desenho da legenda do caminho antigo (montagem-do-completo.mjs legendaEmAss,
 * que é o ASS da legenda do Remotion dos cortes): "papel" é a tira clara de papel com texto escuro e sombra;
 * "caixa" é a frase na faixa escura da marca com a palavra dita no acento; "marca-texto" grifa na cor da marca
 * cada palavra já dita; "palavra" é a palavra grande em caixa alta no centro, a dita no acento; "limpa" é a frase
 * branca com contorno e sombra, a dita no acento. A posição (e a faixa de cada página) segue a do editor.
 */
export function legendaDoDesenho(edicao, W, H, desloc, duracao) {
  const vertical = H > W;
  const ey = H / (vertical ? 1920 : 1080);
  const est = edicao.legenda.estilo;
  const desenho = est.desenho;
  const d = desenhoDaLegenda(est, W, H);
  const papel = desenho === "papel";
  const caixa = desenho === "caixa";
  const grifo = desenho === "marca-texto";
  const palavra = desenho === "palavra";
  const limpa = desenho === "limpa";
  const base = Math.round((vertical ? (palavra ? 112 : limpa ? 58 : caixa || grifo ? 80 : 78) : palavra ? 74 : 58) * ey);
  const acentoHex = edicao.tema?.acento || "#F97316";
  const escuroHex = edicao.tema?.escuroLegenda || edicao.tema?.escuro || "#15171A";
  const sobreOAcento = (() => {
    const h = String(acentoHex).replace("#", "").padEnd(6, "0");
    const l = (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255;
    return l > 0.6 ? "#16171A" : "#FFFFFF";
  })();
  const cor6 = (hex) => `&H${assCor(hex).slice(-6)}&`;
  const fonte = palavra ? "Anton" : "Liberation Sans";
  const corpo = (alin, margem) =>
    papel
      ? `${fonte},${base},${assCor("#16171A")},${assCor("#16171A")},${assCor("#FBFAF5")},${assCor("#000000", 0x90)},-1,0,0,0,100,100,0,0,3,${Math.round(12 * ey)},${Math.round(3 * ey)},${alin},${Math.round(70 * ey)},${Math.round(70 * ey)},${margem},1`
      : caixa || grifo
      ? `${fonte},${base},${assCor("#FFFFFF")},${assCor("#FFFFFF")},${assCor(escuroHex, grifo ? 0x70 : 0x10)},${assCor("#000000", 0x90)},-1,0,0,0,100,100,0,0,3,${Math.round(14 * ey)},0,${alin},${Math.round(70 * ey)},${Math.round(70 * ey)},${margem},1`
      : `${fonte},${base},${assCor("#FFFFFF")},${assCor("#FFFFFF")},${assCor("#000000")},${assCor("#000000", 0x60)},${palavra ? 0 : -1},0,0,0,100,100,${palavra ? 1 : 0},0,1,${Math.round((palavra ? 6 : 4) * ey)},${Math.round(2 * ey)},${alin},${Math.round(70 * ey)},${Math.round(70 * ey)},${margem},1`;
  const linhas = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Leg,${corpo(d.alinhamento, d.margemV)}`,
    `Style: LegTopo,${corpo(8, Math.round(vertical ? H * 0.035 : 40 * ey))}`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const acento = assCor(acentoHex);
  const larg = W - Math.round(140 * ey);
  const limparTexto = (t) => String(t).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
  for (const p of edicao.legenda?.paginas ?? []) {
    if (p.fim <= desloc || p.inicio >= desloc + duracao || p.faixa === "oculta") continue;
    const estilo = p.faixa === "topo" ? "LegTopo" : "Leg";
    const ws = (Array.isArray(p.palavras) && p.palavras.length ? p.palavras : [{ texto: p.texto, inicio: p.inicio, fim: p.fim }])
      .map((w) => ({ ...w, texto: limparTexto(palavra ? String(w.texto).toLocaleUpperCase("pt-BR") : w.texto) }))
      .filter((w) => w.texto);
    if (!ws.length) continue;
    // Até duas linhas na largura útil: a letra encolhe na página longa (a mesma conta do caminho antigo).
    const letras = ws.reduce((s, w) => s + w.texto.length + 1, 0);
    const tam = Math.round(Math.min(base, (larg * 2) / Math.max(8, letras * (palavra ? 0.62 : 0.56))));
    ws.forEach((w, i) => {
      const de = i === 0 ? p.inicio : w.inicio;
      const ate = ws[i + 1]?.inicio ?? p.fim;
      if (ate <= de) return;
      const texto = ws
        .map((v, k) => {
          if (grifo) return k <= i ? `{\\3c${cor6(acentoHex)}\\3a&H00&\\1c${cor6(sobreOAcento)}}${v.texto}{\\r}` : v.texto;
          if (k === i) return `{\\c${acento}&}${v.texto}{\\c}`;
          // A que ainda vem fica apagada no papel e no limpo (\1a e não \alpha: o \alpha apaga a caixa de papel).
          if (k > i && (papel || limpa)) return `{\\1a&H90&}${v.texto}{\\1a&H00&}`;
          return v.texto;
        })
        .join(" ");
      const a = Math.max(0, de - desloc);
      const b = Math.min(duracao, ate - desloc);
      if (b <= a) return;
      linhas.push(`Dialogue: 0,${assTempo(a)},${assTempo(b)},${estilo},,0,0,0,,{\\fs${tam}}${texto}`);
    });
  }
  return linhas.join("\n") + "\n";
}

/** A legenda do editor: a pequena e limpa do pitch (Geist SemiBold, caixa escura da marca, no terço de baixo), ou a do estilo. */
export function legendaSobMedida(edicao, W, H, desloc, duracao) {
  // O estilo de legenda fixado pelo cliente tem o desenho dele (papel, caixa, marca-texto, palavra, limpa).
  if (DESENHOS_DO_CLIENTE.has(edicao.legenda?.estilo?.desenho)) return legendaDoDesenho(edicao, W, H, desloc, duracao);
  const vertical = H > W;
  const ey = H / (vertical ? 1920 : 1080);
  const d = desenhoDaLegenda(edicao.legenda?.estilo ?? null, W, H);
  const tam = d.tam;
  const caixa = assCor(edicao.tema?.escuroLegenda ?? "#06111F", 0x28);
  const negrito = d.fonte === "PT Serif" ? -1 : 0;
  // Com contorno: borda 1 (contorno e sombra), texto branco, contorno preto. Sem: borda 3 (a caixa escura de sempre).
  const corpo = (alin, margem) =>
    d.contorno
      ? `${d.fonte},${tam},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,${negrito},0,0,0,100,100,${d.fonte === "Anton" ? 1 : 0},0,1,${Math.max(3, Math.round(tam * 0.085))},${Math.round(3 * ey)},${alin},${Math.round(70 * ey)},${Math.round(70 * ey)},${margem},1`
      : `${d.fonte},${tam},&H00FFFFFF,&H00FFFFFF,${caixa},&H00000000,${negrito},0,0,0,100,100,0,0,3,${Math.round(14 * ey)},0,${alin},${Math.round(80 * ey)},${Math.round(80 * ey)},${margem},1`;
  const linhas = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${W}`, `PlayResY: ${H}`, "WrapStyle: 0", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Leg,${corpo(d.alinhamento, d.margemV)}`,
    // A FAIXA DE CIMA (05/10): a mesma legenda, acima da cabeça, quando uma peça com texto ocupa a posição principal.
    `Style: LegTopo,${corpo(8, Math.round(vertical ? H * 0.035 : 40 * ey))}`,
    "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  for (const p of edicao.legenda?.paginas ?? []) {
    if (p.fim <= desloc || p.inicio >= desloc + duracao) continue;
    // ZONAS EXCLUSIVAS (05/10, lib/media/editor-sob-medida/faixa-da-legenda.ts): o app decide a faixa
    // de cada página pelas peças na tela; "oculta" é quando a peça já é o texto daquele instante.
    if (p.faixa === "oculta") continue;
    const texto0 = String(p.texto).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();
    const texto = d.caixaAlta ? texto0.toLocaleUpperCase("pt-BR") : texto0;
    if (!texto) continue;
    linhas.push(`Dialogue: 0,${assTempo(p.inicio - desloc)},${assTempo(Math.min(duracao, p.fim - desloc))},${p.faixa === "topo" ? "LegTopo" : "Leg"},,0,0,0,,${texto}`);
  }
  return linhas.join("\n") + "\n";
}

// ─────────────────────────────── 4. a gravação, plano a plano ───────────────────────────────

/** O enquadramento constante: recorte de 1/zoom do quadro, centrado no foco, preso às bordas. */
function recorte(W, H, zoom, fx, fy) {
  const z = Math.max(1, Math.min(2.2, zoom || 1));
  const w = PAR(W / z);
  const h = PAR(H / z);
  const x = Math.round(Math.max(0, Math.min(W - w, (fx ?? 0.5) * W - w / 2)));
  const y = Math.round(Math.max(0, Math.min(H - h, (fy ?? 0.4) * H - h / 2)));
  return { w, h, x, y };
}

/** A câmera (enquadramentos) cortada nos segmentos de um intervalo [a, b). */
function cameraNoIntervalo(camera, a, b) {
  const saida = [];
  let t = a;
  const lista = (camera ?? []).filter((k) => k.ate > a && k.de < b).sort((x, y) => x.de - y.de);
  for (const k of lista) {
    if (k.de > t + 1e-3) saida.push({ de: t, ate: Math.min(b, k.de), zoom: 1, x: 0.5, y: 0.4, movimento: "fixo" });
    const de = Math.max(t, k.de);
    const ate = Math.min(b, k.ate);
    if (ate - de > 1e-3) saida.push({ ...k, de, ate, k0: de - k.de, kn: k.ate - k.de });
    t = Math.max(t, ate);
  }
  if (b - t > 1e-3) saida.push({ de: t, ate: b, zoom: 1, x: 0.5, y: 0.4, movimento: "fixo" });
  return saida;
}

/**
 * Os segmentos de um lote, em ordem: cada um com o tipo de plano e, no cheio,
 * o enquadramento. Tempo absoluto (base).
 */
export function segmentosDoLote(edicao, a, b) {
  const planos = (edicao.planos ?? []).filter((p) => p.ate > a && p.de < b).sort((x, y) => x.de - y.de);
  const saida = [];
  let t = a;
  const cheio = (de, ate) => {
    for (const c of cameraNoIntervalo(edicao.camera, de, ate)) saida.push({ tipo: "cheio", ...c });
  };
  for (const p of planos) {
    const de = Math.max(t, p.de);
    const ate = Math.min(b, p.ate);
    if (de > t + 1e-3) cheio(t, de);
    if (ate - de > 1e-3) {
      // Com o PALCO (03/10, segunda volta), a tela cheia é desenhada opaca
      // pelo Remotion: por baixo dela a gravação segue, e a entrada do palco
      // (íris, cortina de luz, zoom) revela a pessoa de verdade, não um fundo.
      if (p.tipo === "cheio" || (p.tipo === "grafico" && edicao.palco)) cheio(de, ate);
      else saida.push({ ...p, de, ate, k0: de - p.de });
    }
    t = Math.max(t, ate);
  }
  if (b - t > 1e-3) cheio(t, b);
  return saida.filter((s) => s.ate - s.de > 0.5 / 60);
}

/** O grafo de um lote. Devolve { entradas, grafo }. */
export function grafoDoLote(edicao, lote, ctx) {
  const { W, H, fps, escala, fundos, insercoes } = ctx;
  const dur = lote.ate - lote.de;
  // De que inserção veio cada entrada (índice do -i): quando o ffmpeg falha
  // citando "stream #N:0", é por aqui que a mídia culpada sai do lote (04/10).
  const origens = {};
  /**
   * O LOTE CONTADO EM QUADROS (05/10, a boca fora de sincronia). O completo
   * de cmuvv0jje saiu com a imagem 1,2 s adiantada em relação à voz no fim:
   * medido contra a base, o vídeo perdia UM quadro por lote (34 emendas, 34
   * quadros) e mais um em cada plano de um quadro só. Dois mecanismos, os
   * dois no ffmpeg 5.1 do contêiner e nenhum no 9 do notebook:
   *   1. o `alphamerge` (a pessoa recortada, em todo lote com peça atrás)
   *      descarta o ÚLTIMO quadro do lote: 900 entram, 899 saem (provado com
   *      o grafo real e o 5.1.1 estático; sem o alphamerge, 900);
   *   2. um plano de um quadro só vale zero segundos para o `concat` (ele
   *      estima a duração pela média, e com um quadro não há média), o plano
   *      seguinte nasce em cima dele e o `fps` joga o quadro repetido fora.
   * Antes, cada plano era cortado por TEMPO (trim=start:end em segundos),
   * o `fps` depois do concat refazia o relógio, e o lote terminava por
   * duração: perder um quadro não deixava rastro, só a boca fora de hora.
   * Agora o lote é contado em quadros, do começo ao fim:
   *   - a base e o matte entram com dois quadros de FOLGA depois do fim do
   *     lote, para o quadro que algum filtro come ser um que não é nosso;
   *   - cada plano é cortado por ÍNDICE de quadro (start_frame:end_frame),
   *     com os índices somando exatamente os quadros do lote;
   *   - depois do concat o relógio é a CONTAGEM (settb + setpts=N): o quadro
   *     número N fica em N/fps, aconteça o que acontecer com as durações;
   *   - o lote termina por quadro (end_frame), não por segundo;
   *   - quem monta (montarSobMedida) CONTA os quadros de cada lote e do
   *     vídeo emendado e para a entrega se a soma não bate.
   * O áudio continua sendo o da base, inteiro: com o vídeo em contagem exata
   * os dois andam juntos.
   */
  const q0 = Math.round(lote.de * fps);
  const quadrosDoLote = Math.min(Math.round(lote.ate * fps), ctx.quadrosDaBase ?? Infinity) - q0;
  const folga = +(2 / fps).toFixed(4);
  // Os planos com o índice do primeiro e do último quadro (relativos ao lote);
  // plano sem quadro inteiro não entra (os quadros dele já são dos vizinhos).
  const segs = segmentosDoLote(edicao, lote.de, lote.ate)
    .map((s) => ({ ...s, q0: Math.max(0, Math.round(s.de * fps) - q0), q1: Math.min(quadrosDoLote, Math.round(s.ate * fps) - q0) }))
    .filter((s) => s.q1 > s.q0);
  const entradas = [
    ["-ss", lote.de.toFixed(4), "-t", (dur + folga).toFixed(4), "-i", ctx.base],
    // -reinit_filter 0 (03/10, segunda volta): o Remotion grava o quadro
    // OPACO do palco em rgb24 e o transparente em rgba; a troca no meio da
    // lista reiniciava o grafo inteiro e travava o ffmpeg.
    ["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", lote.lista],
  ];
  const nos = [];
  // O cartão usa a base DUAS vezes (03/10, terceira volta): uma marca o tempo do
  // fundo da marca, a outra é a pessoa no cartão (ver o plano "cartao" abaixo).
  // A foto da inserção e o fundo do gráfico também marcam o tempo pela base (uma vez);
  // só a inserção em VÍDEO tem relógio próprio.
  const usosDaBase = segs.reduce((n, s) => n + (s.tipo === "cheio" ? 1 : s.tipo === "cartao" ? 2 : s.tipo === "insercao" && insercoes[s.midia]?.tipo === "video" ? 0 : 1), 0);
  // As passadas a mais (03/10, segunda volta): atrás da pessoa, a máscara do vidro e a pessoa recortada.
  const iAtras = lote.listaAtras ? entradas.push(["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", lote.listaAtras]) - 1 : -1;
  const iVidro = lote.listaVidro ? entradas.push(["-reinit_filter", "0", "-f", "concat", "-safe", "0", "-i", lote.listaVidro]) - 1 : -1;
  const iMatte = iAtras >= 0 && ctx.matte ? entradas.push(["-ss", lote.de.toFixed(4), "-t", (dur + folga).toFixed(4), "-i", ctx.matte]) - 1 : -1;
  // A PESSOA RECORTADA viaja como o ALFA da própria base: a câmera de cada
  // plano (zoom, empurrão) mexe na imagem e na máscara de uma vez só, e o
  // grafo não ganha uma segunda cadeia (a primeira versão, com a máscara em
  // paralelo, travou o ffmpeg na prova de 03/10).
  const comAlfa = iMatte >= 0;
  // O QUADRO DERRADEIRO (06/10, cmux0hoxk saiu com 4160 de 4161): no último lote não há folga de leitura depois do
  // fim da base, e o quadro que o alphamerge do 5.1 come era o último do vídeo. O `tpad` repete o último quadro da
  // base e do matte duas vezes; o trim por índice no fim do lote corta a sobra, então nos outros lotes nada muda.
  const FOLGA_NO_FIM = "tpad=stop_mode=clone:stop=2,";
  const FMT = comAlfa ? "yuva420p" : "yuv420p";
  if (comAlfa) {
    nos.push(`[${iMatte}:v]fps=${fps},${FOLGA_NO_FIM}scale=${W}:${H}:flags=bicubic,format=gray,lut=y='clip((val-16)*255/219,0,255)',setpts=PTS-STARTPTS[mm]`);
    nos.push(`[0:v]fps=${fps},${FOLGA_NO_FIM}scale=${W}:${H}:flags=bicubic,setsar=1,format=yuva420p,setpts=PTS-STARTPTS[b0a];[b0a][mm]alphamerge${usosDaBase > 1 ? `,split=${usosDaBase}` : ""}${usosDaBase ? Array.from({ length: usosDaBase }, (_, i) => `[b${i}]`).join("") : ",nullsink"}`);
  } else nos.push(`[0:v]fps=${fps},${FOLGA_NO_FIM}scale=${W}:${H}:flags=bicubic,setsar=1,format=yuv420p,setpts=PTS-STARTPTS${usosDaBase > 1 ? `,split=${usosDaBase}` : ""}${usosDaBase ? Array.from({ length: usosDaBase }, (_, i) => `[b${i}]`).join("") : ",nullsink"}`);
  let ib = 0;
  // A IMAGEM PARADA (fundo, máscara, foto) entra como UM quadro só e é repetida
  // pelo overlay ou pelo alphamerge, com o tempo dado por um trecho da base
  // (03/10, terceira volta). Com `-loop 1` (ou o filtro `loop`) o ffmpeg gerava
  // os n quadros no começo do lote e eles esperavam a vez do plano na fila.
  const imagemExtra = (arquivo) => {
    const i = entradas.length;
    entradas.push(["-i", arquivo]);
    return i;
  };
  const rotulos = [];
  segs.forEach((s, k) => {
    // O plano em QUADROS: `n` é o que ele entrega, e `corte` tira exatamente
    // esses quadros de um trecho da base (ver o cabeçalho do grafo).
    const n = s.q1 - s.q0;
    const d = n / fps;
    const corte = `trim=start_frame=${s.q0}:end_frame=${s.q1}`;
    const r = `s${k}`;
    if (s.tipo === "cheio") {
      const ent = `[b${ib++}]${corte},setpts=PTS-STARTPTS`;
      if (s.movimento === "empurrao" && d > 0.6) {
        const z0 = Math.max(1, s.zoom || 1);
        const z1 = Math.max(z0, s.zoomFinal || z0 * 1.07);
        const p0 = (s.k0 ?? 0) / Math.max(0.1, s.kn ?? d);
        const pt = `min(1,(${p0.toFixed(4)}+on/${Math.max(1, Math.round((s.kn ?? d) * fps))}))`;
        const z = `${z0}+(${(z1 - z0).toFixed(4)})*${pt}`;
        const W2 = PAR(W * 1.5);
        const H2 = PAR(H * 1.5);
        nos.push(`${ent},scale=${W2}:${H2}:flags=bicubic,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${fps}:x='max(0,min(iw-iw/zoom,${(s.x ?? 0.5).toFixed(4)}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${(s.y ?? 0.4).toFixed(4)}*ih-ih/zoom/2))',setsar=1,format=${FMT}[${r}]`);
      } else if ((s.zoom ?? 1) > 1.01) {
        const c = recorte(W, H, s.zoom, s.x, s.y);
        nos.push(`${ent},crop=${c.w}:${c.h}:${c.x}:${c.y},scale=${W}:${H}:flags=bicubic,setsar=1[${r}]`);
      } else nos.push(`${ent}[${r}]`);
    } else if (s.tipo === "cartao") {
      const cx = s.caixa;
      const bx = PAR(cx.x * escala);
      const by = PAR(cx.y * escala);
      const bw = PAR(cx.w * escala);
      const bh = PAR(cx.h * escala);
      // O recorte da gravação na proporção da caixa, centrado no foco (o rosto).
      const z = Math.max(1, s.zoom || 1);
      const prop = bw / bh;
      let cw = W / z;
      let ch = cw / prop;
      if (ch > H / z) {
        ch = H / z;
        cw = ch * prop;
      }
      cw = PAR(cw);
      ch = PAR(ch);
      const x = Math.round(Math.max(0, Math.min(W - cw, (s.x ?? 0.5) * W - cw / 2)));
      const y = Math.round(Math.max(0, Math.min(H - ch, (s.y ?? 0.4) * H - ch / 2)));
      const iF = imagemExtra(fundos[JSON.stringify(s.caixa)] ?? fundos.liso);
      const iM = imagemExtra(ctx.mascara(bw, bh));
      // O FUNDO E A MÁSCARA entram como UM quadro cada, repetidos pelo próprio
      // overlay e pelo alphamerge, e o TEMPO vem da gravação (um segundo trecho
      // da base, coberto pelo fundo). A versão com o fundo em laço gerava os
      // quadros todos no começo do lote e eles esperavam a vez do cartão na
      // fila do overlay: foi o que levou o lote a 2,8 a 7,4 GB (03/10, terceira volta).
      nos.push(`[b${ib++}]${corte},setpts=PTS-STARTPTS,format=yuv420p[ct${k}]`);
      nos.push(`[${iF}:v]scale=${W}:${H},format=yuv420p,setsar=1[cf${k}]`);
      nos.push(`[ct${k}][cf${k}]overlay=0:0,setsar=1[cb${k}]`);
      nos.push(`[b${ib++}]${corte},setpts=PTS-STARTPTS,crop=${cw}:${ch}:${x}:${y},scale=${bw}:${bh}:flags=bicubic,format=yuva420p[cv${k}]`);
      nos.push(`[${iM}:v]format=gray,scale=${bw}:${bh}[cm${k}]`);
      nos.push(`[cv${k}][cm${k}]alphamerge[ca${k}]`);
      nos.push(`[cb${k}][ca${k}]overlay=${bx}:${by}:shortest=1,format=yuv420p,setsar=1[${r}]`);
    } else if (s.tipo === "insercao" && insercoes[s.midia]) {
      const m = insercoes[s.midia];
      if (m.tipo === "video" && m.origem === "banco") {
        // O B-ROLL (03/10, terceira volta): o trecho limpo do arquivo (`inicio`),
        // reenquadrado para o formato (preenche e corta no centro), um empurrão
        // de 8% que nunca para, e a COR CASADA com a gravação (grade).
        const i = entradas.length;
        origens[i] = s.midia;
        // -reinit_filter 0 (04/10): a mídia de fora já vem normalizada
        // (normalizarMidia), e mesmo assim uma troca de propriedade no meio
        // (o laço do -stream_loop, um quadro com outra cor) não reinicia o grafo.
        entradas.push(["-ss", Number(m.inicio ?? 0).toFixed(3), "-stream_loop", "-1", "-t", (d + 0.2).toFixed(4), "-reinit_filter", "0", "-i", m.arquivo]);
        const W2 = PAR(W * 1.1);
        const H2 = PAR(H * 1.1);
        nos.push(`[${i}:v]fps=${fps},scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W2}:${H2},setsar=1,trim=end_frame=${n},setpts=PTS-STARTPTS${m.grade ? `,${m.grade}` : ""},zoompan=z='1+0.08*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      } else if (m.tipo === "video") {
        const i = entradas.length;
        origens[i] = s.midia;
        // Com folga de 0,2 s na leitura e o corte por quadro (05/10): o `fps`
        // do 5.1 pode comer o último quadro lido, e o plano precisa dos `n` dele.
        entradas.push(["-stream_loop", "-1", "-t", (d + 0.2).toFixed(4), "-reinit_filter", "0", "-i", m.arquivo]);
        // O empurrão por cima do vídeo (03/10, segunda volta): mesmo que o
        // Kling devolva a câmera quase parada, a inserção nunca fica imóvel.
        nos.push(`[${i}:v]fps=${fps},scale=${PAR(W * 1.12)}:${PAR(H * 1.12)}:force_original_aspect_ratio=increase:flags=bicubic,crop=${PAR(W * 1.12)}:${PAR(H * 1.12)},setsar=1,trim=end_frame=${n},setpts=PTS-STARTPTS,zoompan=z='1+0.1*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      } else {
        const i = imagemExtra(m.arquivo);
        origens[i] = s.midia;
        const W2 = PAR(W * 1.4);
        const H2 = PAR(H * 1.4);
        // Ken Burns lento (6%), do centro: a foto nunca fica parada. A foto é UM
        // quadro, repetido pelo overlay sobre o trecho da base (que dá o tempo);
        // o zoompan anda quadro a quadro com ela, sem gerar nada adiantado.
        nos.push(`[${i}:v]scale=${W2}:${H2}:force_original_aspect_ratio=increase:flags=bicubic,crop=${W2}:${H2},format=yuv420p,setsar=1[fi${k}]`);
        nos.push(`[b${ib++}]${corte},setpts=PTS-STARTPTS,scale=${W2}:${H2}:flags=fast_bilinear,format=yuv420p,setsar=1[ft${k}]`);
        nos.push(`[ft${k}][fi${k}]overlay=0:0,zoompan=z='1+0.06*on/${n}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1,format=yuv420p,trim=end_frame=${n}[${r}]`);
      }
    } else {
      // "grafico" (e inserção que falhou): o fundo da marca; as camadas desenham o resto.
      const i = imagemExtra(fundos.liso);
      nos.push(`[${i}:v]scale=${W}:${H},format=yuv420p,setsar=1[fg${k}]`);
      nos.push(`[b${ib++}]${corte},setpts=PTS-STARTPTS,format=yuv420p[gt${k}]`);
      nos.push(`[gt${k}][fg${k}]overlay=0:0,setsar=1,trim=end_frame=${n}[${r}]`);
    }
    // Com o alfa, todo plano entra no mesmo formato (o que não é câmera cheia fica opaco).
    if (comAlfa) {
      nos.push(`[${r}]format=yuva420p[${r}a]`);
      rotulos.push(`[${r}a]`);
    } else rotulos.push(`[${r}]`);
  });
  // ZOOM ATRAVÉS nas inserções (03/10, segunda volta): a câmera mergulha no
  // fim do plano anterior e sai de dentro da inserção (o flash da transição
  // esconde o corte). Uma expressão só, no tempo do lote.
  const bordasDeInsercao = segs
    .filter((s) => s.tipo === "insercao")
    .flatMap((s) => {
      const forca = insercoes[s.midia]?.origem === "banco" ? 0.18 : 0.55;
      return [s.de - lote.de, s.ate - lote.de].map((b) => ({ b, forca }));
    })
    .filter(({ b }) => b > 0.2 && b < dur - 0.2);
  // A JORNADA OFICIAL (06/10): sem o zoom através nas bordas das inserções.
  const zoomAtraves = bordasDeInsercao.length && !edicao.jornada
    ? `,zoompan=z='1+${bordasDeInsercao.map(({ b, forca }) => `${forca}*(between(it,${(b - 0.35).toFixed(3)},${b.toFixed(3)})*pow((it-${(b - 0.35).toFixed(3)})/0.35,2)+between(it,${b.toFixed(3)},${(b + 0.45).toFixed(3)})*pow(1-(it-${b.toFixed(3)})/0.45,2))`).join("+")}':d=1:s=${W}x${H}:fps=${fps}:x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2',setsar=1`
    : "";
  // O RELÓGIO É A CONTAGEM (05/10): depois do concat, o quadro N fica em N/fps.
  // Era `fps` + `setpts=PTS-STARTPTS`, e o `fps` jogava fora o quadro do plano
  // de um quadro só (que o concat deixava sem duração). Ver o cabeçalho.
  nos.push(`${rotulos.join("")}concat=n=${rotulos.length}:v=1:a=0,settb=1/${fps},setpts=N${zoomAtraves},format=${FMT}[base0]`);
  // SEM `fps` nas listas das camadas (03/10, terceira volta): a camada parada é
  // um PNG com a duração do trecho, e o `fps` o expandia de uma vez em centenas
  // de quadros RGBA de 8 MB na fila do overlay; foi o que levou um lote de 60 s
  // a 7,4 GB e matou o completo de cmurtv2zg no worker. O overlay repete o
  // último quadro sozinho; a saída é a mesma (1800 quadros, conferido).
  const lista = (i, rot) => nos.push(`[${i}:v]format=rgba,scale=${W}:${H},setpts=PTS-STARTPTS[${rot}]`);
  lista(1, "ov");
  let atual = "base0";
  if (iAtras >= 0) {
    lista(iAtras, "atr");
    if (comAlfa) {
      // A pessoa recortada (a base com o alfa) vai POR CIMA do título de trás.
      nos.push(`[${atual}]split=2[bA][pess]`);
      nos.push(`[bA]format=yuv420p[bO];[bO][atr]overlay=0:0:eof_action=pass[x1]`);
      nos.push(`[x1][pess]overlay=0:0:shortest=1,format=yuv420p[x2]`);
      atual = "x2";
    } else {
      nos.push(`[${atual}][atr]overlay=0:0:eof_action=pass[x2]`);
      atual = "x2";
    }
  }
  if (iVidro >= 0) {
    // VIDRO DE VERDADE: a gravação desfocada (em 1/4, barato) entra só onde há caixa de vidro.
    lista(iVidro, "vid");
    nos.push(`[${atual}]split=2[v1][v2]`);
    nos.push(`[v2]scale=${PAR(W / 4)}:${PAR(H / 4)}:flags=bilinear,gblur=sigma=${(5 * Math.max(0.5, escala)).toFixed(1)},scale=${W}:${H}:flags=bicubic,eq=brightness=-0.035:saturation=1.12,format=yuva420p[bl]`);
    nos.push(`[vid]format=rgba,alphaextract,format=gray[vm];[bl][vm]alphamerge[bm]`);
    nos.push(`[v1][bm]overlay=0:0:shortest=1[x3]`);
    atual = "x3";
  }
  // GRÃO E VINHETA leves no fim (a textura de filme que tira o "digital chapado").
  // A JORNADA OFICIAL (06/10): a gravação do cliente passa intacta, sem grão, sem vinheta, sem correção de cor.
  const textura = edicao.jornada ? "" : "vignette=angle=0.42,noise=c0s=5:c0f=t+u,";
  nos.push(`[${atual}][ov]overlay=0:0:eof_action=pass:format=auto,${textura}${lote.legenda ? `subtitles=${lote.legenda}:fontsdir=fontes,` : ""}format=yuv420p,trim=end_frame=${quadrosDoLote}[v]`);
  // OS FIOS DOS DECODIFICADORES (04/10): cada -i abre um decodificador com um
  // fio por núcleo, e o lote do sob medida chega a 13 entradas. Medido no WSL
  // com o lote 8 da prévia de cmurtv2zg: 186 fios sem teto, 73 com 2 na base
  // e 1 no resto; dois lotes juntos passavam de 370, e com o teto de processos
  // do contêiner o ffmpeg morria ao abrir o fio seguinte ("Failed to configure
  // output pad on auto_scale_N ... Resource temporarily unavailable", a falha
  // da prévia em produção; reproduzida com `ulimit -u 150`).
  return { entradas: entradas.flatMap((e, k) => ["-threads", k === 0 ? "2" : "1", ...e]), grafo: nos.join(";\n"), origens, quadros: quadrosDoLote };
}

/**
 * A edição sem as mídias `ids`: o plano de inserção delas vira câmera cheia
 * (a pessoa), em vez do fundo liso da marca que a inserção ausente mostrava.
 */
export function semMidias(ed, ids) {
  if (!ids?.size) return ed;
  return { ...ed, planos: (ed.planos ?? []).map((p) => (p.tipo === "insercao" && ids.has(p.midia) ? { ...p, tipo: "cheio" } : p)) };
}

/** A lista de exibição das camadas recortada no lote, no formato do demuxer de concatenação. */
function listaDoLote(exibir, arquivos, a, b, dir = "camadas") {
  const linhas = ["ffconcat version 1.0"];
  let ultimo = null;
  for (const e of exibir) {
    const fim = e.de + e.seg;
    if (fim <= a + 1e-6 || e.de >= b - 1e-6) continue;
    const seg = Math.min(fim, b) - Math.max(e.de, a);
    if (seg <= 1e-6) continue;
    const arq = e.tipo === "vazio" ? `${dir}/vazio.png` : `${dir}/${arquivos[e.c]}`;
    linhas.push(`file '${arq}'`, `duration ${seg.toFixed(5)}`);
    ultimo = arq;
  }
  if (ultimo) linhas.push(`file '${ultimo}'`);
  return linhas.join("\n") + "\n";
}

// ─────────────────────────────── 4a. a mídia de fora, normalizada ───────────────────────────────

/**
 * A MÍDIA DE FORA NORMALIZADA AO BAIXAR (04/10). Cada B-roll do Pixabay vem de
 * um autor, com resolução (1440x1080, 1920x1080...), fps (24 a 60), faixa de
 * cor e metadados próprios, e as fotos geradas chegam como JPEG 2752x1536 em
 * faixa cheia com nome de .png. Tudo isso era decodificado em tamanho cheio
 * dentro do lote e convertido no meio do grafo. Aqui cada B-roll, vídeo
 * gerado e foto vira um arquivo NOSSO, todo igual (e pequeno de decodificar): o tamanho do alvo (com folga para o empurrão),
 * yuv420p (rgb24 na foto), fps da base, SAR 1, cor bt709 faixa limitada, sem
 * áudio, sem rotação (aplicada) e sem metadado; o vídeo só no trecho usado. O
 * que não normaliza sai da edição (o plano vira câmera cheia), e o render segue.
 */
export async function normalizarMidia(m, { W, H, fps, segundos = 8 }) {
  const PARn = (v) => Math.max(2, Math.round(v / 2) * 2);
  if (m.tipo === "video") {
    const WN = PARn(W * 1.12);
    const HN = PARn(H * 1.12);
    const saida = m.arquivo.replace(/\.[a-z0-9]+$/i, "") + `-norm-${WN}x${HN}.mp4`;
    const dim = await ffprobe(m.arquivo);
    let inicio = Math.max(0, Number(m.inicio) || 0);
    if (!(dim.duracaoSec > 0.3)) throw new Error("vídeo sem duração");
    if (inicio > dim.duracaoSec - 1) inicio = 0;
    const dur = Math.max(1, Math.min(dim.duracaoSec - inicio, segundos + 1));
    await rodar(
      [
        "-ss", inicio.toFixed(3), "-t", dur.toFixed(3), "-i", m.arquivo,
        "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1", "-map_chapters", "-1",
        "-vf", `scale=${WN}:${HN}:force_original_aspect_ratio=increase:flags=bicubic,crop=${WN}:${HN},setsar=1,fps=${fps},format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        "-color_range", "tv", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
        "-g", String(Math.max(1, Math.round(fps))), "-movflags", "+faststart",
        saida,
      ],
      { timeoutMs: 5 * 60_000 }
    );
    const conferido = await ffprobe(saida);
    if (!(conferido.duracaoSec > 0.3) || conferido.largura !== WN || conferido.altura !== HN) throw new Error(`normalizado saiu ${conferido.largura}x${conferido.altura} com ${conferido.duracaoSec}s`);
    return { ...m, arquivo: saida, inicio: 0 };
  }
  const WI = PARn(W * 1.4);
  const HI = PARn(H * 1.4);
  const saida = m.arquivo.replace(/\.[a-z0-9]+$/i, "") + `-norm-${WI}x${HI}.png`;
  await rodar(["-i", m.arquivo, "-map", "0:v:0", "-frames:v", "1", "-map_metadata", "-1", "-vf", `scale=${WI}:${HI}:force_original_aspect_ratio=increase:flags=bicubic,crop=${WI}:${HI},setsar=1,format=rgb24`, saida], { timeoutMs: 2 * 60_000 });
  if (!existsSync(saida)) throw new Error("foto não normalizou");
  return { ...m, arquivo: saida };
}

// ─────────────────────────────── 4b. a cor casada do B-roll ───────────────────────────────

/** A cor média (RGB 0 a 255) de um vídeo nos instantes pedidos, pelo ffmpeg reduzindo o quadro a 1 pixel. */
export async function corMedia(arquivo, instantes) {
  const somas = [0, 0, 0];
  let n = 0;
  for (const t of instantes) {
    const buf = await new Promise((ok, falha) => {
      const p = processoDoTrabalho(spawn("ffmpeg", ["-nostdin", "-v", "error", "-ss", Math.max(0, t).toFixed(3), "-i", arquivo, "-frames:v", "1", "-vf", "scale=1:1:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { stdio: ["ignore", "pipe", "ignore"] }));
      const pedacos = [];
      const relogio = setTimeout(() => p.kill("SIGKILL"), 60_000);
      p.stdout.on("data", (d) => pedacos.push(d));
      p.on("close", (c) => {
        clearTimeout(relogio);
        c === 0 ? ok(Buffer.concat(pedacos)) : falha(new Error(`ffmpeg ${c}`));
      });
      p.on("error", falha);
    });
    if (buf.length >= 3) {
      somas[0] += buf[0];
      somas[1] += buf[1];
      somas[2] += buf[2];
      n++;
    }
  }
  return n ? somas.map((x) => x / n) : null;
}

/**
 * O filtro que leva a cor do B-roll metade do caminho até a da gravação
 * (ganho por canal entre 0,85 e 1,18), com contraste 1,04 e saturação 0,9.
 * Sem medida, só o contraste e a saturação.
 */
export function gradeParaCasar(cor, alvo) {
  const eq = "eq=contrast=1.04:saturation=0.9:gamma=0.98";
  if (!cor || !alvo) return eq;
  const lum = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  // Só a TINTA: a luz do B-roll fica (uma cena clara não vira escura).
  const k = lum(cor) / Math.max(1, lum(alvo));
  const ganho = [0, 1, 2].map((i) => {
    const g = (alvo[i] * k) / Math.max(8, cor[i]);
    return Math.min(1.18, Math.max(0.85, 1 + 0.5 * (g - 1)));
  });
  return `colorchannelmixer=rr=${ganho[0].toFixed(3)}:gg=${ganho[1].toFixed(3)}:bb=${ganho[2].toFixed(3)},${eq}`;
}

// ─────────────────────────────── 5. a montagem ───────────────────────────────

/**
 * pedido:
 *   edicao        EdicaoResolvida (lib/media/editor-sob-medida/tipos.ts)
 *   completoUrl | baseArquivo
 *   escala        1 (final) ou 0,5 (prévia)
 *   abertura      { momentos, familia, acento, passagem } (opcional, só no final)
 */
export async function montarSobMedida(pedido, pasta, { baixar, aoProgresso } = {}) {
  const tempos = {};
  let t = Date.now();
  const t0 = t;
  const marcar = (n) => {
    tempos[n] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  const ed = pedido.edicao;
  if (!ed || ed.versao !== 1) throw new Error("edição sob medida ausente ou de versão desconhecida");
  const escala = Math.min(1, Math.max(0.25, Number(pedido.escala) || 1));
  await mkdir(pasta, { recursive: true });
  let base = join(pasta, "base.mp4");
  if (pedido.baseArquivo) base = pedido.baseArquivo;
  else if (pedido.trecho?.sourceUrl) {
    // O CORTE (9:16): a base é o trecho limpo e enquadrado, como o narrador do
    // /montar (prepararTrecho), sem legenda nem efeito.
    const { prepararTrecho } = await import("./ffmpeg.mjs");
    const original = join(pasta, "original.mp4");
    await baixar(pedido.trecho.sourceUrl, original);
    const q = pedido.trecho.quadro;
    const emendado = q ? join(pasta, "trecho.mp4") : base;
    await prepararTrecho(original, emendado, pedido.trecho.inicio, pedido.trecho.duracao, pedido.trecho.manter, pedido.trecho.pessoa ?? null);
    await rm(original, { force: true }).catch(() => {});
    // O QUADRO 9:16 do corte (fração da gravação, o app decide em
    // lib/media/editor-sob-medida/corte.ts): a gravação deitada vira a faixa em
    // pé em volta da pessoa. O rosto que a edição segue já vem nesse quadro.
    if (q) {
      const par = (n) => `floor(${n}/2)*2`;
      await rodar([
        "-i", emendado,
        "-vf", `crop=${par(`iw*${Number(q.w).toFixed(5)}`)}:${par(`ih*${Number(q.h).toFixed(5)}`)}:${par(`iw*${Number(q.x).toFixed(5)}`)}:${par(`ih*${Number(q.y).toFixed(5)}`)},setsar=1`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "copy", base,
      ]);
      await rm(emendado, { force: true }).catch(() => {});
    }
  } else await baixar(pedido.completoUrl, base);
  const dim = await ffprobe(base);
  const fps = fpsDe(base);
  // Quantos quadros a base tem de verdade (05/10): o último lote termina onde
  // a IMAGEM da base termina (a duração do formato é a do áudio, que pode
  // passar uns quadros), e a soma dos lotes é conferida contra isso no fim.
  const quadrosDaBase = await contarQuadros(base);
  const W = PAR(ed.largura * escala);
  const H = PAR(ed.altura * escala);
  if (Math.abs(dim.largura / dim.altura / (ed.largura / ed.altura) - 1) > 0.03) throw new Error(`base ${dim.largura}x${dim.altura} com edição ${ed.largura}x${ed.altura}: proporções diferentes`);
  const duracao = Math.min(ed.duracao, dim.duracaoSec);
  marcar("base");

  // As inserções geradas e o B-roll, baixados e normalizados.
  const insercoes = {};
  const midiasTiradas = [];
  // EM PARALELO (05/10): eram uma por vez, 104 s no completo de cmuums24z
  // (49 B-rolls e fotos, cada um baixado, normalizado e medido na cor), e de
  // novo em cada prévia. Cada uma é independente; 4 juntas, no máximo.
  const pendentes = Object.entries(ed.insercoes ?? {}).filter(([, m]) => m?.url);
  const prontas = new Map();
  const umaInsercao = async ([id, m]) => {
    const ext = m.tipo === "video" ? "mp4" : (m.url.match(/\.(png|jpe?g|webp)(\?|$)/i)?.[1] ?? "jpg");
    const arq = join(pasta, `insercao-${id.replace(/[^a-z0-9-]/gi, "")}.${ext}`);
    try {
      if (!existsSync(arq)) {
        if (/^https?:/i.test(m.url)) await baixar(m.url, arq);
        else await copyFile(m.url, arq);
      }
      const usado = (ed.planos ?? []).filter((p) => p.tipo === "insercao" && p.midia === id).reduce((mx, p) => Math.max(mx, p.ate - p.de), 0);
      prontas.set(id, await normalizarMidia({ tipo: m.tipo, arquivo: arq, origem: m.origem ?? null, inicio: Number(m.inicio) || 0 }, { W, H, fps, segundos: Math.max(3, usado) }));
    } catch (e) {
      prontas.set(id, null);
      midiasTiradas.push(`${id}: ${String(e?.message ?? e).slice(-200)}`);
      console.warn(`[sob-medida] inserção ${id} fora da edição (não baixou ou não normalizou): ${e?.message ?? e}`);
    }
  };
  await emParalelo(pendentes, MIDIAS_JUNTAS, umaInsercao);
  // A ordem de antes (a da edição), para o resto do render não mudar nada.
  for (const [id] of pendentes) if (prontas.get(id)) insercoes[id] = prontas.get(id);
  // A COR CASADA (03/10, terceira volta): o B-roll de banco vem com a cor do
  // autor; aqui ele anda metade do caminho até a cor média da gravação, com o
  // contraste e a saturação um pouco abaixo (o "look" do resto do vídeo).
  const brolls = Object.values(insercoes).filter((m) => m.origem === "banco" && m.tipo === "video");
  if (brolls.length) {
    const corDaBase = await corMedia(base, [0.2, 0.5, 0.8].map((f) => f * Math.min(ed.duracao, dim.duracaoSec))).catch(() => null);
    await emParalelo(brolls, MIDIAS_JUNTAS, async (m) => {
      const cor = await corMedia(m.arquivo, [m.inicio + 0.3, m.inicio + 1.2]).catch(() => null);
      m.grade = gradeParaCasar(cor, corDaBase);
    });
  }
  marcar("insercoes");

  const fpsCamadas = fpsDasCamadas(fps);
  tempos.fpsDasCamadas = fpsCamadas;
  tempos.fpsDaEdicao = ed.fps;
  const camadas = await renderizarCamadas({ ...ed, duracao, fps: fpsCamadas }, pasta, escala, (p) => aoProgresso?.(0.6 * p), pastaDoCacheDasCamadas(pedido, escala));
  // Quantos quadros vieram do cache da prévia anterior e quantos foram ao Chrome.
  if (camadas.reuso.quadros) tempos.camadasDoCache = camadas.reuso.quadros;
  tempos.quadrosDeCamada = camadas.quadros;
  tempos.quadrosDoVideo = Math.round(duracao * fps);
  tempos.passadas = Object.fromEntries(Object.entries(camadas.passadas).map(([k, v]) => [k, v.quadros]));
  marcar("camadas");
  // A pessoa recortada, só se há peça atrás dela.
  const matte = camadas.passadas.atras ? await matteDaPessoa(base, pasta, duracao, fps, camadas.passadas.atras.intervalos).catch(() => null) : null;
  tempos.recorte = Boolean(matte);
  if (camadas.passadas.atras) marcar("recorte");

  await cp(PASTA_DAS_FONTES, join(pasta, "fontes"), { recursive: true });
  const mascaras = new Map();
  const mascara = (w, h) => {
    const k = `${w}x${h}`;
    if (!mascaras.has(k)) mascaras.set(k, join(pasta, `mascara-${k}.png`));
    return mascaras.get(k);
  };
  // As máscaras dos cartões, antes dos lotes (cantos arredondados de 28 px).
  for (const p of ed.planos ?? []) {
    if (p.tipo !== "cartao" || !p.caixa) continue;
    const bw = PAR(p.caixa.w * escala);
    const bh = PAR(p.caixa.h * escala);
    const arq = mascara(bw, bh);
    if (existsSync(arq)) continue;
    const r = Math.round(28 * escala * (Math.min(ed.largura, ed.altura) / 1080));
    await rodar(["-f", "lavfi", "-i", `color=c=white:s=${bw}x${bh},format=gray`, "-vf", `geq=lum='if(lte(hypot(max(0,max(${r}-X,X-(W-1-${r}))),max(0,max(${r}-Y,Y-(H-1-${r})))),${r}),255,0)'`, "-frames:v", "1", arq]);
  }

  // Lotes cortados em quadro inteiro.
  const lotes = [];
  const passo = Math.round((escala < 1 ? LOTE_SEG_PREVIA : LOTE_SEG_FINAL) * fps) / fps;
  // Lote que começa depois do último quadro da IMAGEM da base não existe (a
  // duração do formato é a do áudio e pode passar da imagem).
  for (let a = 0; a < duracao - 1e-3; a += passo) if (Math.round(a * fps) < quadrosDaBase) lotes.push({ de: +a.toFixed(5), ate: +Math.min(duracao, a + passo).toFixed(5) });
  const partes = [];
  const comLegenda = Boolean(ed.legenda?.paginas?.length);
  let feitos = 0;
  const ffmpegVersao = await new Promise((r) => {
    const p = spawn("ffmpeg", ["-version"]);
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.on("close", () => r(Number((s.match(/ffmpeg version n?(\d+)/i) ?? [])[1] ?? 0)));
    p.on("error", () => r(0));
  });
  const opcaoDoGrafo = ffmpegVersao >= 7 ? "-/filter_complex" : "-filter_complex_script";
  // A MEMÓRIA (03/10, terceira volta): o lote de 30 s em 1080p segurou até 1,2 GB
  // de ffmpeg na medida local; conta 1,5 GB por lote (proporcional aos pixels e à duração).
  const MB_POR_LOTE = Math.max(400, Math.round(1500 * ((W * H) / (1920 * 1080)) * (passo / 30)));
  const renderLote = async (lote, i) => {
    lote.lista = `lista-${i}.txt`;
    const { frente, atras, vidro } = camadas.passadas;
    await writeFile(join(pasta, lote.lista), listaDoLote(frente.exibir, frente.arquivos, lote.de, lote.ate, frente.nomeDir), "utf8");
    // As passadas a mais entram no lote só se têm camada dentro dele.
    const temNoLote = (ps) => ps && ps.intervalos.some(([a, b]) => b > lote.de && a < lote.ate);
    if (temNoLote(atras) && !lote.simples) {
      lote.listaAtras = `lista-atras-${i}.txt`;
      await writeFile(join(pasta, lote.listaAtras), listaDoLote(atras.exibir, atras.arquivos, lote.de, lote.ate, atras.nomeDir), "utf8");
    }
    if (temNoLote(vidro) && !lote.simples) {
      lote.listaVidro = `lista-vidro-${i}.txt`;
      await writeFile(join(pasta, lote.listaVidro), listaDoLote(vidro.exibir, vidro.arquivos, lote.de, lote.ate, vidro.nomeDir), "utf8");
    }
    if (comLegenda) {
      lote.legenda = `legenda-${i}.ass`;
      await writeFile(join(pasta, lote.legenda), legendaSobMedida(ed, W, H, lote.de, lote.ate - lote.de), "utf8");
    }
    // As mídias que ficaram fora (não normalizaram, ou quebraram este lote) viram câmera cheia.
    const fora = new Set([...Object.keys(ed.insercoes ?? {}).filter((id) => !insercoes[id]), ...(lote.ruins ?? [])]);
    const insercoesDoLote = Object.fromEntries(Object.entries(insercoes).filter(([id]) => !fora.has(id)));
    const { entradas, grafo, origens, quadros } = grafoDoLote(semMidias(ed, fora), lote, { W, H, fps, escala, fundos: camadas.fundos, insercoes: insercoesDoLote, base, mascara, matte, quadrosDaBase });
    lote.origens = origens;
    lote.quadros = quadros;
    await writeFile(join(pasta, `grafo-${i}.txt`), grafo, "utf8");
    await writeFile(join(pasta, `entradas-${i}.json`), JSON.stringify(entradas), "utf8");
    const saida = join(pasta, `lote-${String(i).padStart(3, "0")}.mp4`);
    await rodar(
      [
        ...entradas,
        opcaoDoGrafo, `grafo-${i}.txt`,
        "-map", "[v]", "-an", "-fps_mode", "cfr", "-r", String(fps),
        "-c:v", "libx264", "-preset", escala < 1 ? "ultrafast" : "veryfast", "-crf", escala < 1 ? "26" : "18", "-pix_fmt", "yuv420p",
        "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-maxrate", "6M", "-bufsize", "12M", "-threads", "4",
        saida,
      ],
      { cwd: pasta, timeoutMs: 40 * 60_000 }
    );
    // A CONTA DO LOTE (05/10): o grafo prometeu `quadros`; o arquivo tem que
    // ter exatamente isso. Um a menos é a boca fora de hora (ver grafoDoLote);
    // aqui a entrega para e o motivo sobe, em vez de sair fora de sincronia.
    // No ÚLTIMO lote não há folga depois do fim da base: o quadro que o
    // alphamerge do 5.1 come é o derradeiro do vídeo, e um a menos ali não
    // desloca nada. Só ali um quadro de tolerância.
    const saiu = await contarQuadros(saida);
    const ultimo = lote.ate >= duracao - 1e-3;
    if (saiu !== quadros && !(ultimo && saiu === quadros - 1)) throw new Error(`lote ${i} (${lote.de.toFixed(2)} a ${lote.ate.toFixed(2)} s) saiu com ${saiu} quadros, o grafo prometeu ${quadros}: a imagem perderia a sincronia com a voz`);
    return saida;
  };
  /**
   * Um lote com a guarda de memória: só começa com memória para ele; se o
   * ffmpeg morrer por SINAL (o OOM do contêiner), registra o sinal, espera a
   * memória voltar e refaz o lote em DUAS METADES, uma depois da outra (até
   * dois níveis, lotes de 15 s), emendadas no mesmo arquivo. Outro erro
   * (04/10): falta de recurso refaz igual uma vez; depois sai a mídia de fora
   * culpada (ou todas as do lote); sem mídia, sai o que vai atrás e o vidro.
   * Só então sobe.
   */
  /**
   * O LOTE SOZINHO (05/10). Os SIGKILL "com 4 GB livres" do completo de
   * cmuums24z eram o OOM do contêiner com DOIS lotes no pico ao mesmo tempo:
   * a memória livre é lida DEPOIS da morte, quando o ffmpeg morto já devolveu
   * o que segurava (não é teto de processos, que dá "Resource temporarily
   * unavailable" e tem tratamento próprio, nem o Chrome, já fechado nesta
   * fase). Antes, o lote morto era refeito em duas metades, uma depois da
   * outra, e a emenda no meio reinicia o empurrão do B-roll que cruza o meio.
   * Agora ele é refeito INTEIRO e SOZINHO (a outra vaga termina o lote dela e
   * espera); só se morrer sozinho vai às metades. Os lotes seguintes voltam a
   * correr em par.
   */
  let ativos = 0;
  let portao = null;
  const sozinho = async (fn) => {
    while (portao) await portao;
    let abrir;
    portao = new Promise((r) => (abrir = r));
    try {
      while (ativos > 0) await new Promise((r) => setTimeout(r, 1000));
      return await fn();
    } finally {
      portao = null;
      abrir();
    }
  };
  const fazerLote = async (lote, i, nivel = 0) => {
    const nome = String(i);
    if (!lote.sozinho) while (portao) await portao;
    if (!(await esperarMemoria(MB_POR_LOTE, { ateMs: 10 * 60_000, rotulo: `lote ${nome}` }))) console.warn(`[sob-medida] lote ${nome} começa com ${memoriaLivreMb()} MB livres (pedia ${MB_POR_LOTE})`);
    try {
      ativos++;
      try {
        return await renderLote(lote, nome);
      } finally {
        ativos--;
      }
    } catch (e) {
      if (trabalhoCancelado()) throw e;
      const dur = lote.ate - lote.de;
      if (!e?.sinal) {
        // A MÍDIA QUE QUEBROU SAI E O LOTE SEGUE (04/10): o ffmpeg diz o
        // "stream #N" que falhou; sendo uma inserção, ela sai deste lote (o
        // plano vira câmera cheia) e o lote é refeito. Sem culpada achada,
        // saem todas as mídias de fora do lote, de uma vez.
        const ruins = lote.ruins ?? new Set();
        // Falta de recurso passageira (fios, memória): o mesmo lote, igual, mais uma vez.
        if (/Resource temporarily unavailable|Cannot allocate memory/i.test(String(e?.message)) && !lote.repetido) {
          midiasTiradas.push(`lote ${nome}: refeito por falta de recurso`);
          console.warn(`[sob-medida] lote ${nome} sem recurso (${memoriaLivreMb()} MB livres); refaz igual`);
          await new Promise((r) => setTimeout(r, 5_000));
          return await fazerLote({ de: lote.de, ate: lote.ate, ruins, repetido: true, sozinho: lote.sozinho }, `${nome}r`, nivel);
        }
        const n = Number((String(e?.message ?? "").match(/stream #(\d+):\d+/i) ?? [])[1]);
        const culpada = Number.isFinite(n) ? lote.origens?.[n] : null;
        const doLote = [...new Set(Object.values(lote.origens ?? {}))].filter((id) => !ruins.has(id));
        const tirar = culpada && !ruins.has(culpada) ? [culpada] : doLote;
        if (!tirar.length) {
          // Sem mídia de fora para tirar: o último recurso é o lote SÓ com a
          // passada da frente (sem o título atrás da pessoa e sem o vidro).
          if (!lote.simples && (lote.listaAtras || lote.listaVidro)) {
            midiasTiradas.push(`lote ${nome}: sem as passadas de trás e do vidro (${String(e?.message ?? e).replace(/\s+/g, " ").slice(-160)})`);
            console.warn(`[sob-medida] lote ${nome} falhou sem mídia culpada; refaz só com a frente`);
            return await fazerLote({ de: lote.de, ate: lote.ate, ruins, repetido: lote.repetido, simples: true, sozinho: lote.sozinho }, `${nome}s`, nivel);
          }
          throw e;
        }
        midiasTiradas.push(`lote ${nome}: ${tirar.join(", ")} (${String(e?.message ?? e).replace(/\s+/g, " ").slice(-160)})`);
        console.warn(`[sob-medida] lote ${nome} falhou; refaz sem ${tirar.join(", ")}`);
        return await fazerLote({ de: lote.de, ate: lote.ate, ruins: new Set([...ruins, ...tirar]), repetido: lote.repetido, simples: lote.simples, sozinho: lote.sozinho }, `${nome}m`, nivel);
      }
      if (nivel >= 2 || dur < 8) throw e;
      sinais.push(`lote ${nome} (${dur.toFixed(0)} s) morto por ${e.sinal} com ${memoriaLivreMb()} MB livres${lote.sozinho ? " (sozinho)" : ""}`);
      if (!lote.sozinho) {
        // Primeiro, o mesmo lote inteiro, sem outro ao lado (acima).
        console.warn(`[sob-medida] ${sinais.at(-1)}; refaz inteiro, sozinho`);
        return await sozinho(() => fazerLote({ de: lote.de, ate: lote.ate, ruins: lote.ruins, simples: lote.simples, sozinho: true }, `${nome}x`, nivel));
      }
      console.warn(`[sob-medida] ${sinais.at(-1)}; refaz em duas metades`);
      await esperarMemoria(Math.round(MB_POR_LOTE * 1.2), { ateMs: 10 * 60_000, rotulo: `lote ${nome} de novo` });
      const meio = +(Math.round(((lote.de + lote.ate) / 2) * fps) / fps).toFixed(5);
      const a = await fazerLote({ de: lote.de, ate: meio, ruins: lote.ruins, sozinho: true }, `${nome}a`, nivel + 1);
      const b = await fazerLote({ de: meio, ate: lote.ate, ruins: lote.ruins, sozinho: true }, `${nome}b`, nivel + 1);
      const saida = join(pasta, `lote-${nome.padStart(3, "0")}-junto.mp4`);
      await emendar([a, b], saida, pasta);
      await rm(a, { force: true }).catch(() => {});
      await rm(b, { force: true }).catch(() => {});
      return saida;
    }
  };
  const sinais = [];
  // Lotes em paralelo só com memória para eles (o padrão continua 2).
  const pedidosJuntos = Math.max(1, Number(process.env.SOB_MEDIDA_LOTES ?? 2));
  const livreNoInicio = memoriaLivreMb();
  const juntos = Math.max(1, Math.min(pedidosJuntos, Math.floor((livreNoInicio - 600) / MB_POR_LOTE)));
  tempos.memoria = { livreNoInicioMb: livreNoInicio, mbPorLote: MB_POR_LOTE, lotesJuntos: juntos };
  const fila = lotes.map((l, i) => [l, i]);
  const res = new Array(lotes.length);
  // O PRIMEIRO ERRO PARA A PISCINA (04/10): antes o outro laço seguia
  // pegando lotes enquanto o erro já subia e a pasta era apagada por baixo dele.
  let primeiroErro = null;
  await Promise.all(
    Array.from({ length: Math.min(juntos, lotes.length) }, async () => {
      while (fila.length && !primeiroErro && !trabalhoCancelado()) {
        const [l, i] = fila.shift();
        try {
          res[i] = await fazerLote(l, i);
        } catch (e) {
          primeiroErro ??= e;
          return;
        }
        feitos++;
        aoProgresso?.(0.6 + 0.35 * (feitos / lotes.length));
      }
    })
  );
  if (primeiroErro) throw primeiroErro;
  if (trabalhoCancelado()) throw new Error("render cancelado pelo prazo do trabalho");
  partes.push(...res);
  if (sinais.length) tempos.sinais = sinais;
  if (midiasTiradas.length) tempos.midiasTiradas = midiasTiradas.slice(0, 20);
  marcar("lotes");

  const soVideo = join(pasta, "so-video.mp4");
  if (partes.length === 1) await copyFile(partes[0], soVideo);
  else await emendar(partes, soVideo, pasta);
  // A CONTA DO VÍDEO INTEIRO (05/10): a soma dos lotes contra o que a base
  // tem no trecho editado. Se a emenda perdeu ou repetiu um quadro, para aqui.
  const quadrosEsperados = Math.min(Math.round(duracao * fps), quadrosDaBase);
  const quadrosDoVideo = await contarQuadros(soVideo);
  tempos.quadros = { esperados: quadrosEsperados, emendados: quadrosDoVideo, base: quadrosDaBase, lotes: lotes.map((l) => l.quadros ?? null) };
  // Um quadro a menos só no fim (o último lote, acima) não desloca a voz.
  if (quadrosDoVideo !== quadrosEsperados && quadrosDoVideo !== quadrosEsperados - 1) throw new Error(`o vídeo emendado tem ${quadrosDoVideo} quadros e a base tem ${quadrosEsperados} no trecho editado: a imagem perderia a sincronia com a voz`);
  let saida = join(pasta, escala < 1 ? "previa.mp4" : "sob-medida.mp4");
  await rodar(["-i", soVideo, "-i", base, "-map", "0:v", "-map", "1:a?", "-t", duracao.toFixed(4), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", saida], { cwd: pasta });
  marcar("emenda");

  // A TRILHA do projeto no corte (03/10), só no final: o mesmo `misturarAudio`
  // do /montar (src/sons.mjs), no volume do estilo e abaixando sob a voz.
  // Falhar aqui não derruba nada: o corte sai com a voz só.
  // O SOM DAS PEÇAS (03/10, segunda volta) vai junto, com ou sem trilha:
  // whoosh, impacto, riser e tique no instante de cada entrada, abaixo da voz.
  // A JORNADA OFICIAL (06/10): os sons de entrada são os que a IA decidiu (edicao.sons), nunca a regra por peça.
  const eventos = escala >= 1 && pedido.efeitos !== false ? (ed.jornada ? (Array.isArray(ed.sons) ? ed.sons : []) : efeitosDaEdicao(camadas.todas)) : [];
  tempos.efeitos = eventos.length;
  if (escala >= 1 && (pedido.trilha?.url || eventos.length)) {
    try {
      let trilha = null;
      if (pedido.trilha?.url) {
        const arquivoDaTrilha = join(pasta, "trilha" + (String(pedido.trilha.url).match(/\.[a-z0-9]{2,4}(?=\?|$)/i)?.[0] ?? ".mp3"));
        await baixar(pedido.trilha.url, arquivoDaTrilha);
        trilha = { arquivo: arquivoDaTrilha, volume: pedido.trilha.volume, abaixar: pedido.trilha.abaixar };
      }
      const { misturarAudio } = await import("./sons.mjs");
      saida = await misturarAudio(saida, { eventos, trilha }, duracao, pasta, join(pasta, "sob-medida-com-trilha.mp4"));
      tempos.trilha = Boolean(trilha);
    } catch (e) {
      console.warn(`[sob-medida] trilha e efeitos falharam, segue sem: ${e?.message ?? e}`);
    }
    marcar("trilha");
  }

  // O GANCHO do corte curto (03/10, o mesmo do /montar): a frase forte que o
  // cliente aprovou, tirada do corte já editado, toca antes do começo com
  // zoom, flash e o texto de soco. Falhar aqui não derruba a edição.
  const g = pedido.gancho;
  let ganchoSeg = 0;
  // A JORNADA OFICIAL: a abertura é um elemento gerado decidido no passo 4, nunca o gancho desenhado em código.
  if (escala >= 1 && g && !ed.jornada && Number.isFinite(g.inicio) && Number.isFinite(g.fim) && g.fim - g.inicio >= 1.5 && g.fim <= duracao + 0.5) {
    try {
      const { montarAberturaDeImpacto, prefixarAbertura } = await import("./abertura-de-impacto.mjs");
      const abertura = await montarAberturaDeImpacto(saida, [{ inicio: g.inicio, fim: g.fim, soco: g.soco }], pasta, {
        familia: g.familia ?? "sobrio",
        acento: g.acento ?? ed.tema?.acento,
        foco: { x: 0.5, y: 0.4 },
        passagem: g.passagem ?? null,
      });
      if (abertura) {
        const comGancho = join(pasta, "sob-medida-com-gancho.mp4");
        await prefixarAbertura(abertura, saida, comGancho, pasta, { copiar: false });
        saida = comGancho;
        ganchoSeg = (await ffprobe(abertura).catch(() => null))?.duracaoSec ?? 0;
      }
    } catch (e) {
      console.warn(`[sob-medida] gancho falhou, segue sem: ${e?.message ?? e}`);
    }
    marcar("gancho");
  }

  // A abertura com os melhores momentos (o gancho do JEV), só no final.
  let aberturaSeg = 0;
  if (escala >= 1 && pedido.abertura?.momentos?.length && !ed.jornada) {
    try {
      const { montarAberturaDeImpacto, prefixarAbertura } = await import("./abertura-de-impacto.mjs");
      const abertura = await montarAberturaDeImpacto(base, pedido.abertura.momentos, pasta, {
        familia: pedido.abertura.familia ?? "sobrio",
        acento: pedido.abertura.acento ?? ed.tema?.acento,
        passagem: pedido.abertura.passagem ?? "corte-seco",
      });
      if (abertura) {
        const final = join(pasta, "sob-medida-com-abertura.mp4");
        // Por cópia: os lotes saem com os mesmos parâmetros da abertura (fps da base,
        // x264 veryfast crf 18, GOP 60), como no completo editado; recodificar
        // 20 min só para emendar custava 5 min (prova de 03/10).
        await prefixarAbertura(abertura, saida, final, pasta, { copiar: true });
        aberturaSeg = (await ffprobe(abertura)).duracaoSec || 0;
        saida = final;
      }
    } catch (e) {
      console.warn(`[sob-medida] abertura falhou, segue sem: ${e?.message ?? e}`);
    }
    marcar("abertura");
  }
  // Limpeza do que pesa (os quadros das camadas e os lotes).
  if (!process.env.SOB_MEDIDA_GUARDAR) {
    for (const ps of Object.values(camadas.passadas)) await rm(ps.dirQ, { recursive: true, force: true }).catch(() => {});
    for (const p of partes) await rm(p, { force: true }).catch(() => {});
  }
  tempos.total = +((Date.now() - t0) / 1000).toFixed(1);
  return { arquivo: saida, tempos, aberturaSeg, ganchoSeg, largura: W, altura: H, fps };
}

export { basename };
