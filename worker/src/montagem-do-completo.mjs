import { spawn } from "node:child_process";
import { basename, join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { copyFile, cp, rm, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { createServer } from "node:net";
import { emendar, ffprobe, fpsDe, rodar } from "./ffmpeg.mjs";
import { bundleDoRemotion, opcoesDoRender, prepararFundos, servirPasta } from "./montagem.mjs";
import { fatiaAtual } from "./capacidade.mjs";

/**
 * O VÍDEO COMPLETO EDITADO (30/09/2026): o completo no mesmo padrão da
 * montagem dos cortes (canto com colagem, foto, B-roll, cartela, letras de
 * revista, transições, legenda), sem pagar o Remotion no vídeo inteiro. Vale
 * para os dois formatos da base: deitada (16:9) e gravação de celular em pé
 * (9:16, desde 30/09 à noite, com a geometria dos cortes verticais). Nada
 * aqui supõe orientação: tamanho e proporção saem da base e da montagem.
 *
 * ## Por que não é o `montar` dos cortes
 *
 * O Remotion desenha TODO quadro no Chrome: ~4,5 min de render por minuto de
 * vídeo no notebook, inclusive quando a cena é só o narrador em tela cheia.
 * Num completo de 22 min isso passaria de 1h30. Aqui o trabalho é dividido
 * pelo que cada ferramenta faz barato:
 *
 *   1. a BASE é o completo que já sai hoje (limpeza de fala, punch-in nas
 *      emendas, frases de destaque). Ela nunca passa pelo Chrome;
 *   2. as JANELAS são só as cenas que não são narrador cheio (canto, foto,
 *      tela dividida, B-roll, cartela, e o narrador cheio que tem elemento).
 *      Todas elas vão ao Remotion num render só, EMENDADAS uma atrás da outra
 *      (a "linha condensada"), com o narrador daquele trecho recortado da
 *      própria base. Um render só porque cada `renderMedia` paga a abertura do
 *      Chrome e da composição; cem janelas pagariam cem vezes;
 *   3. o ACABAMENTO é do ffmpeg, em lotes: base e janelas intercaladas por
 *      quadro, zoom e punch nas cenas cheias que o diretor marcou, e a
 *      legenda palavra a palavra queimada por libass no vídeo inteiro (a mesma
 *      nas janelas e na base, para ela não trocar de cara a cada inserção).
 *
 * O áudio nunca é tocado: é o da base, copiado inteiro no fim. Nenhuma emenda
 * de imagem mexe no som, então a voz não estala nem sai de sincronia.
 *
 * ## Tela compartilhada
 *
 * Gravação com tela compartilhada (o teste de 29/09 tem 6 min dela) não pode
 * ganhar colagem por cima: cobriria justamente o que o vídeo mostra.
 * `analisarCompleto` separa câmera de tela antes do diretor, e o app só deixa
 * inserção cair nos trechos de câmera.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const PASTA_DAS_FONTES = resolve(AQUI, "..", "fontes");

/**
 * Threads de cada ffmpeg (a mesma trava do montagem.mjs: o contêiner tem teto
 * de processos). Saem da fatia deste render (capacidade.mjs): 3 na máquina de
 * 8 vCPU, mais numa máquina maior; MONTAGEM_FFMPEG_THREADS fixa.
 */
const fios = () => fatiaAtual().ffmpegFios;

/**
 * Os parâmetros do ACABAMENTO em lotes (01/10, parte 240). O render de um
 * completo de 78 cenas morreu três vezes com "Failed to configure output pad
 * on Parsed_scale_78 ... Resource temporarily unavailable": cada `scale` do
 * grafo abria uma piscina de fios do tamanho do número de núcleos (ver
 * `comTetoDeFios` em ffmpeg.mjs), e o lote passava de 160 fios. Aqui o teto é
 * explícito e não depende do tamanho do plano: o grafo inteiro com 1 fio de
 * filtro, 2 fios de decodificação por entrada, o codificador com os seus.
 * Medido no lote real de 42 `scale`: 15 fios no processo, contra 165.
 *
 * `leve` é a TERCEIRA tentativa que o app manda depois de duas falhas
 * técnicas: lotes de 30 s, um de cada vez, codificador com 2 fios e um render
 * do Remotion só. Mais lento, e quase sem pico de recurso.
 */
function parametrosDoAcabamento(leve) {
  return leve
    ? { loteSeg: 30, lotesJuntos: 1, fiosDoCodificador: "2", fiosDeEntrada: "1", renders: 1 }
    : {
        loteSeg: LOTE_SEG,
        // 2 por unidade da fatia (2 na máquina de 8 vCPU); MONTAGEM_COMPLETO_LOTES fixa.
        lotesJuntos: fatiaAtual().lotesDoCompleto,
        fiosDoCodificador: process.env.MONTAGEM_COMPLETO_THREADS_LOTE || "4",
        fiosDeEntrada: "2",
        renders: null,
      };
}

/**
 * A BASE ENQUADRADA (01/10, parte 240): gravação que não é 16:9 nem 9:16 (o
 * gêmeo digital sai 1080x1080; celular que grava 4:3 ou 19,5:9) vira um
 * quadro padrão ANTES de tudo, e a montagem segue a do formato padrão, com
 * abertura e efeitos. O app decide o quadro (lib/media/enquadramento-do-
 * completo.ts) e manda `enquadramento`: a tela do quadro e onde o vídeo
 * original fica dentro dela. O fundo é o próprio vídeo ampliado para cobrir,
 * desfocado e escurecido: continua "a mesma cena" e não uma tarja preta. O
 * desfoque é feito num quadro 8 vezes menor e ampliado depois: o mesmo
 * resultado visual por uma fração do custo.
 */
export async function enquadrarBase(base, enq, pasta, fps) {
  const W = enq.largura;
  const H = enq.altura;
  const c = enq.conteudo;
  const pequeno = `${Math.max(2, Math.round(W / 16) * 2)}:${Math.max(2, Math.round(H / 16) * 2)}`;
  const grafo =
    `[0:v]split[a][b];` +
    `[a]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=fast_bilinear,crop=${W}:${H},scale=${pequeno}:flags=area,` +
    `boxblur=6:2,scale=${W}:${H}:flags=bicubic,eq=brightness=-0.12:saturation=0.85,format=yuv420p[fundo];` +
    `[b]scale=${c.w}:${c.h}:flags=bicubic,format=yuv420p,setsar=1[frente];` +
    `[fundo][frente]overlay=${c.x}:${c.y},setsar=1[v]`;
  const saida = join(pasta, "base-enquadrada.mp4");
  await rodar(
    [
      "-threads", "2", "-i", base,
      "-filter_complex", grafo, "-filter_complex_threads", "2",
      "-map", "[v]", "-map", "0:a?", "-fps_mode", "cfr", "-r", String(fps),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-g", "60",
      "-c:a", "copy", "-threads", "4", "-movflags", "+faststart", saida,
    ],
    { cwd: pasta, timeoutMs: 60 * 60_000 }
  );
  return saida;
}

/**
 * Janelas separadas por menos que isto viram uma só: o narrador cheio curto
 * entre duas inserções sai do Remotion junto, em vez de pagar duas emendas.
 */
const JUNTAR_JANELAS_SEG = 1.2;
/** Quanto da cena cheia vizinha entra na janela quando há transição animada. */
const ANTES_DA_TRANSICAO_SEG = 0.35;
const DEPOIS_DA_TRANSICAO_SEG = 0.4;
/** Tamanho de cada lote do acabamento (quadros ~ segundos x fps). */
const LOTE_SEG = 60;

// ─────────────────────────────── utilidades ───────────────────────────────

let _opcaoDeFiltro = null;
/** A mesma escolha de ffmpeg.mjs: `-/filter_complex` do 7 em diante, o script antes. */
async function descobrirOpcaoDeFiltro() {
  if (_opcaoDeFiltro) return _opcaoDeFiltro;
  const versao = await new Promise((resolver) => {
    const p = spawn("ffmpeg", ["-version"]);
    let s = "";
    p.stdout.on("data", (d) => (s += d));
    p.on("error", () => resolver(0));
    p.on("close", () => resolver(Number((s.match(/ffmpeg version n?(\d+)/i) ?? [])[1] ?? 0)));
  });
  _opcaoDeFiltro = versao >= 7 ? "-/filter_complex" : "-filter_complex_script";
  return _opcaoDeFiltro;
}

/** Uma porta TCP livre agora (o sistema escolhe; fecha e devolve). */
function portaLivre() {
  return new Promise((resolver, rejeitar) => {
    const s = createServer();
    s.on("error", rejeitar);
    s.listen(0, () => {
      const { port } = s.address();
      s.close(() => resolver(port));
    });
  });
}

/** Piscina simples: `n` por vez, na ordem. */
async function emPiscina(itens, n, fn) {
  const fila = itens.map((x, i) => [x, i]);
  const saida = new Array(itens.length);
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(n, itens.length)) }, async () => {
      while (fila.length) {
        const [x, i] = fila.shift();
        saida[i] = await fn(x, i);
      }
    })
  );
  return saida;
}

// ─────────────────────────────── 1. análise ───────────────────────────────

/**
 * CÂMERA OU TELA, por quadro-chave. Decodifica só os quadros-chave (o
 * completo tem um a cada 2 s), reduzidos a 32x18 em cinza: 14 s para 20 min no
 * notebook. O quadro de câmera é sempre parecido com ele mesmo (mesma parede,
 * mesma pessoa); a tela compartilhada muda de cara a cada página. Então: o
 * "quadro típico" é o que tem mais vizinhos parecidos, e câmera é o que fica
 * perto dele. Medido no vídeo de 29/09: câmera a 5-25 de distância média por
 * pixel, tela a 85-120, nada no meio. O limiar de 45 fica no vão.
 */
export async function analisarCompleto(arquivo) {
  const dim = await ffprobe(arquivo);
  const fps = fpsDe(arquivo);
  const N = 32 * 18;
  const { quadros, tempos } = await new Promise((resolver, rejeitar) => {
    const p = spawn("ffmpeg", [
      "-nostdin",
      "-hide_banner", "-v", "info", "-skip_frame", "nokey", "-i", arquivo,
      "-vf", "scale=32:18:flags=area,format=gray,showinfo", "-fps_mode", "passthrough", "-an",
      "-f", "rawvideo", "-",
    ]);
    const bufs = [];
    const tempos = [];
    let resto = "";
    p.stdout.on("data", (d) => bufs.push(d));
    p.stderr.on("data", (d) => {
      resto += d.toString();
      for (const m of resto.matchAll(/pts_time:([\d.]+)/g)) tempos.push(Number(m[1]));
      resto = resto.slice(resto.lastIndexOf("pts_time:") + 1);
    });
    p.on("error", rejeitar);
    p.on("close", (code) => (code === 0 ? resolver({ quadros: Buffer.concat(bufs), tempos }) : rejeitar(new Error(`análise saiu com ${code}`))));
  });
  const n = Math.min(Math.floor(quadros.length / N), tempos.length);
  const vet = (i) => quadros.subarray(i * N, (i + 1) * N);
  const dist = (a, b) => {
    let s = 0;
    for (let k = 0; k < N; k++) s += Math.abs(a[k] - b[k]);
    return s / N;
  };
  // O quadro típico: amostra de até ~200 candidatos contra ~200 vizinhos.
  const passo = Math.max(1, Math.floor(n / 200));
  let tipico = 0;
  let maisVizinhos = -1;
  for (let i = 0; i < n; i += passo) {
    let c = 0;
    for (let j = 0; j < n; j += passo) if (dist(vet(i), vet(j)) < 20) c++;
    if (c > maisVizinhos) {
      maisVizinhos = c;
      tipico = i;
    }
  }
  const camera = Array.from({ length: n }, (_, i) => dist(vet(i), vet(tipico)) < 45);
  // Trechos de câmera: só entre quadros-chave de câmera confirmados (a troca
  // para a tela pode cair em qualquer ponto entre dois quadros-chave, então o
  // trecho termina no último que se viu câmera). Trecho de menos de 6 s some.
  const trechos = [];
  let de = null;
  for (let i = 0; i < n; i++) {
    if (camera[i] && de === null) de = tempos[i];
    const fecha = de !== null && (!camera[i + 1] || i === n - 1);
    if (fecha) {
      const ate = i === n - 1 ? dim.duracaoSec : tempos[i];
      if (ate - de >= 6) trechos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3) });
      de = null;
    }
  }
  const segCamera = trechos.reduce((s, t) => s + t.ate - t.de, 0);
  return {
    duracao: dim.duracaoSec,
    fps,
    largura: dim.largura,
    altura: dim.altura,
    quadrosChave: n,
    trechosDeCamera: trechos,
    fracaoDeCamera: dim.duracaoSec ? +(segCamera / dim.duracaoSec).toFixed(3) : 0,
  };
}

// ─────────────────────────────── 2. as janelas ───────────────────────────────

/** A cena precisa do Chrome? Narrador cheio sem elemento é só a base. */
const precisaDoRemotion = (c) => c.layout !== "narrador-cheio" || (c.elementos?.length ?? 0) > 0;

/**
 * Onde o Remotion trabalha, em QUADROS da base. Devolve janelas [f0, f1) sem
 * sobreposição, em ordem.
 */
export function planejarJanelas(m, fps, totalDeQuadros) {
  const cenas = m.cenas;
  let janelas = [];
  cenas.forEach((c, i) => {
    if (!precisaDoRemotion(c)) return;
    let ini = c.inicio;
    // Narrador cheio com elemento: a janela começa pouco antes do primeiro
    // elemento, e não no começo da cena (o resto dela é a base pura).
    if (c.layout === "narrador-cheio") ini = Math.max(c.inicio, Math.min(...c.elementos.map((e) => e.inicio)) - 0.25);
    janelas.push({ ini, fim: c.fim });
  });
  const juntar = (lista) => {
    const saida = [];
    for (const j of lista.sort((a, b) => a.ini - b.ini)) {
      const ultima = saida[saida.length - 1];
      if (ultima && j.ini - ultima.fim < JUNTAR_JANELAS_SEG) ultima.fim = Math.max(ultima.fim, j.fim);
      else saida.push({ ...j });
    }
    return saida;
  };
  janelas = juntar(janelas);
  // Transição animada na borda: a folha de papel e o deslize precisam da cena
  // vizinha desenhada no Remotion, senão a folha "nasce" no meio da tela e o
  // deslize passa por cima de preto.
  for (const j of janelas) {
    const primeira = cenas.find((c) => Math.abs(c.inicio - j.ini) < 0.02);
    if (primeira && primeira.transicao !== "corte" && primeira.transicao !== "flash") {
      const anterior = cenas[cenas.indexOf(primeira) - 1];
      if (anterior) j.ini = Math.max(anterior.inicio, j.ini - ANTES_DA_TRANSICAO_SEG);
    }
    const seguinte = cenas.find((c) => Math.abs(c.inicio - j.fim) < 0.02);
    if (seguinte && seguinte.transicao !== "corte") j.fim = Math.min(seguinte.fim, j.fim + DEPOIS_DA_TRANSICAO_SEG);
  }
  janelas = juntar(janelas);
  return janelas
    .map((j) => ({ f0: Math.max(0, Math.round(j.ini * fps)), f1: Math.min(totalDeQuadros, Math.round(j.fim * fps)) }))
    .filter((j) => j.f1 - j.f0 >= 2);
}

/**
 * A LINHA CONDENSADA: todas as janelas emendadas, uma atrás da outra, com as
 * cenas deslocadas para o tempo novo. A cena cortada no começo (a vizinha que
 * entrou só pela transição) perde os elementos que já tinham entrado e segue
 * parada: a base continua ela sem zoom, e as duas pontas casam.
 */
export function montagemCondensada(m, janelas, fps) {
  const cenas = [];
  let c0 = 0;
  // A BORDA DA JANELA É ARREDONDADA PARA QUADRO (02/10, painel vazio do
  // completo cmuqc9r7z): a cartela de 65,805 s abria a janela no quadro 1947,
  // que é 65,815 s. Com a comparação exata, a cena contava como "cortada
  // antes" e o marca-texto ancorado no começo dela (65,805) era descartado
  // como "já tinha entrado": 3,7 s de fundo escuro sem nada. Um quadro e meio
  // de tolerância separa o arredondamento de um corte de verdade.
  const tolerancia = 1.5 / fps;
  const comDeslocamento = janelas.map((j) => {
    const ini = j.f0 / fps;
    const fim = j.f1 / fps;
    const desloc = c0 / fps - ini;
    for (const c of m.cenas) {
      if (c.fim <= ini + 1e-6 || c.inicio >= fim - 1e-6) continue;
      const cortadaAntes = c.inicio < ini - tolerancia;
      const cortadaDepois = c.fim > fim + tolerancia;
      const inicio = Math.max(c.inicio, ini);
      // Todo campo de TEMPO anda junto: cena, palavra forte do movimento,
      // entrada e saída dos elementos e as palavras que o texto grifa.
      const mover = (s) => (typeof s === "number" ? +(s + desloc).toFixed(4) : s);
      cenas.push({
        ...c,
        inicio: mover(inicio),
        fim: mover(Math.min(c.fim, fim)),
        movimentoEm: typeof c.movimentoEm === "number" ? mover(Math.max(c.movimentoEm, inicio)) : c.movimentoEm,
        transicao: cortadaAntes ? "corte" : c.transicao,
        movimento: c.layout === "narrador-cheio" && (cortadaAntes || cortadaDepois) ? "estatico" : c.movimento,
        elementos: (c.elementos ?? [])
          .filter((e) => !cortadaAntes || e.inicio >= ini)
          .map((e) => ({
            ...e,
            inicio: mover(e.inicio),
            fim: mover(e.fim),
            palavras: e.palavras?.map((p) => ({ ...p, inicio: mover(p.inicio), fim: mover(p.fim) })),
          })),
      });
    }
    const saida = { ...j, c0 };
    c0 += j.f1 - j.f0;
    return saida;
  });
  return {
    montagem: {
      ...m,
      duracao: c0 / fps,
      cenas: cenas.map((c) => comPessoaSeVazia(c, m)),
      // A legenda é do acabamento (libass, a mesma no vídeo inteiro) e o logo
      // não existe na base: nenhum dos dois entra nas janelas.
      legenda: { ...m.legenda, paginas: [] },
      marca: { ...m.marca, logoUrl: null },
    },
    janelas: comDeslocamento,
    quadros: c0,
  };
}

/**
 * NENHUMA CENA SÓ COM O FUNDO (02/10, segunda trava, do lado do worker): a
 * cena sem a pessoa, sem mídia e sem elemento (o recurso falhou, o elemento
 * saiu no corte da janela, o recorte da pessoa não existe no completo) vira o
 * NARRADOR CHEIO da própria base, o quadro inteiro, que o Remotion desenha
 * pelo `cheio`. O app já faz a mesma troca ao resolver
 * (lib/media/plano-de-montagem.ts); aqui ela vale para o que só acontece
 * depois, no render.
 */
export function comPessoaSeVazia(c, m) {
  const temPessoa = c.narrador && !(c.narrador.modo === "recortado" && !c.reserva);
  const temConteudo = temPessoa || c.midia?.url || (c.elementos?.length ?? 0) > 0;
  if (temConteudo) return c;
  const fonte = m.fonte ?? { largura: m.largura, altura: m.altura };
  return {
    ...c,
    layout: "narrador-cheio",
    midia: null,
    narrador: {
      modo: "video",
      caixa: { x: 0, y: 0, w: m.largura, h: m.altura },
      recorte: { x: 0, y: 0, w: fonte.largura, h: fonte.altura },
      moldura: "nenhuma",
      rotacao: 0,
      origemDoZoom: { x: 0.5, y: 0.4 },
    },
    reserva: undefined,
  };
}

// ─────────────────────────────── 3. a legenda ───────────────────────────────

const assCor = (hex, alfa = 0) => {
  const h = String(hex || "#FFFFFF").replace("#", "").padEnd(6, "0");
  return `&H${alfa.toString(16).padStart(2, "0").toUpperCase()}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
};
const assTempo = (s) => {
  const t = Math.max(0, s);
  const h = Math.floor(t / 3600);
  const mi = Math.floor((t % 3600) / 60);
  const se = (t % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(mi).padStart(2, "0")}:${se}`;
};
const assTexto = (t) => String(t).replace(/[{}\\]/g, "").replace(/\s+/g, " ").trim();

/**
 * A legenda palavra a palavra em ASS, para o libass queimar no acabamento.
 * Mesmo desenho da legenda do Remotion (worker/remotion/src/partes/legenda.tsx):
 * a posição vem da cena (o app já afastou do rosto e da janela do narrador),
 * a palavra dita acende na cor da marca e a que ainda vem fica apagada.
 * "papel" vira caixa clara com texto escuro (BorderStyle 3); as outras, texto
 * branco com contorno. `desloc` é o começo do lote.
 *
 * Os estilos que o cliente fixa na tela (30/09): "caixa" é a frase inteira na
 * faixa escura da marca, a palavra dita no acento; "marca-texto" põe a faixa
 * da marca atrás de cada palavra já dita (o libass desenha uma caixa por
 * trecho de estilo). "Sem legenda" chega com a lista de páginas vazia, e o
 * arquivo sai sem nenhum evento.
 */
export function legendaEmAss(m, { largura: W, altura: H, desloc = 0, duracao = Infinity }) {
  const ex = W / m.largura;
  const ey = H / m.altura;
  const papel = m.legenda.estilo === "papel";
  const destaque = m.legenda.estilo === "destaque";
  const caixa = m.legenda.estilo === "caixa";
  const grifo = m.legenda.estilo === "marca-texto";
  // No completo em pé (30/09) vale o tamanho da legenda dos cortes verticais
  // (worker/remotion/src/partes/legenda.tsx): 58 px num quadro de 1080 de
  // largura some na tela do celular. O deitado segue como estava.
  const vertical = m.altura > m.largura;
  const limpa = m.legenda.estilo === "limpa";
  const base = Math.round((vertical ? (destaque ? 112 : limpa ? 58 : caixa || grifo ? 80 : 78) : destaque ? 74 : 58) * ey);
  const sobreOAcento = (() => {
    const h = String(m.marca.acento || "#F97316").replace("#", "").padEnd(6, "0");
    const l = (0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16)) / 255;
    return l > 0.6 ? "#16171A" : "#FFFFFF";
  })();
  // Nas marcas de cor do ASS (a da caixa e a da letra) vai a cor sem o alfa.
  const cor6 = (hex) => `&H${assCor(hex).slice(-6)}&`;
  const linhas = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${W}`,
    `PlayResY: ${H}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    papel
      ? `Style: L,Liberation Sans,${base},${assCor("#16171A")},${assCor("#16171A")},${assCor("#FBFAF5")},${assCor("#000000", 0x90)},-1,0,0,0,100,100,0,0,3,${Math.round(12 * ey)},${Math.round(3 * ey)},5,0,0,0,1`
      : caixa || grifo
      ? `Style: L,Liberation Sans,${base},${assCor("#FFFFFF")},${assCor("#FFFFFF")},${assCor(m.marca.escuro || "#15171A", grifo ? 0x70 : 0x10)},${assCor("#000000", 0x90)},-1,0,0,0,100,100,0,0,3,${Math.round(14 * ey)},0,5,0,0,0,1`
      : `Style: L,Liberation Sans,${base},${assCor("#FFFFFF")},${assCor("#FFFFFF")},${assCor("#000000")},${assCor("#000000", 0x60)},-1,0,0,0,100,100,0,0,1,${Math.round(4 * ey)},${Math.round(2 * ey)},5,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const acento = assCor(m.marca.acento);
  for (const p of m.legenda.paginas) {
    if (p.oculta || p.fim <= desloc || p.inicio >= desloc + duracao) continue;
    const cena = m.cenas.find((c) => p.inicio >= c.inicio && p.inicio < c.fim) ?? m.cenas[m.cenas.length - 1];
    const x = Math.round(cena.legenda.x * ex);
    const y = Math.round(cena.legenda.y * ey);
    const larg = Math.round(cena.legenda.largura * ex);
    const letras = p.palavras.reduce((s, w) => s + w.texto.length + 1, 0);
    const tam = Math.round(Math.min(base, (larg * 2) / Math.max(8, letras * (destaque ? 0.62 : 0.56))));
    const ml = Math.max(0, x - Math.round(larg / 2));
    const mr = Math.max(0, W - (x + Math.round(larg / 2)));
    p.palavras.forEach((w, i) => {
      const de = i === 0 ? p.inicio : w.inicio;
      const ate = p.palavras[i + 1]?.inicio ?? p.fim;
      if (ate <= de) return;
      const texto = p.palavras
        .map((v, k) => {
          const t = assTexto(destaque ? v.texto.toUpperCase() : v.texto);
          // Marca-texto: toda palavra já dita fica grifada na cor da marca.
          if (grifo) return k <= i ? `{\\3c${cor6(m.marca.acento)}\\3a&H00&\\1c${cor6(sobreOAcento)}}${t}{\\r}` : t;
          // Caixa: a frase inteira aparece de uma vez, só a dita acende.
          if (caixa) return k === i ? `{\\c${acento}&}${t}{\\c}` : t;
          if (k === i) return `{\\c${acento}&}${t}{\\c}`;
          // \1a e não \alpha: o \alpha apaga também a caixa de papel e a
          // legenda saía com remendos cinzas atrás da palavra que ainda vem.
          if (k > i) return `{\\1a&H90&}${t}{\\1a&H00&}`;
          return t;
        })
        .join(" ");
      const a = Math.max(0, de - desloc);
      const b = Math.min(duracao, ate - desloc);
      if (b <= a) return;
      linhas.push(`Dialogue: 0,${assTempo(a)},${assTempo(b)},L,,${ml},${mr},0,,{\\an5\\pos(${x},${y})\\fs${tam}}${texto}`);
    });
  }
  return linhas.join("\n") + "\n";
}

// ─────────────────────────────── 4. zoom da base ───────────────────────────────

/**
 * O movimento das cenas cheias que ficaram na base, no ffmpeg. Punch é o
 * plano fechado de uma vez (12%, a mesma escala do Remotion depois da mola);
 * zoom lento e afastamento andam 10% na cena, com a origem no rosto. O
 * zoompan trabalha em pixel inteiro e treme no zoom lento; a imagem entra
 * 1,5x maior para o tremor cair abaixo de um pixel (2x custava o dobro do
 * tempo do segmento, medido em 30/09). `k0` e `n`: onde este pedaço cai na
 * curva do movimento inteiro (a cena pode chegar partida pela janela vizinha).
 */
/** A caixa da webcam (pixels do quadro da montagem) em pixels pares da base, presa ao quadro. */
export function webcamNoQuadro(w, W, H, m) {
  const ex = W / m.largura;
  const ey = H / m.altura;
  const par = (v) => Math.max(2, Math.floor(v / 2) * 2);
  const x = par(Math.max(0, w.x * ex));
  const y = par(Math.max(0, w.y * ey));
  const largura = Math.min(par(w.w * ex), W - x);
  const altura = Math.min(par(w.h * ey), H - y);
  return largura >= 16 && altura >= 16 ? { x, y, w: largura, h: altura } : null;
}

/** "#F97316" para o formato de cor do ffmpeg ("0xF97316"); sem cor válida, branco. */
function corDoFfmpeg(hex) {
  const h = String(hex || "").replace("#", "");
  return /^[0-9a-f]{6}$/i.test(h) ? `0x${h.toUpperCase()}` : "0xFFFFFF";
}

/**
 * O POPUP DO TRECHO DA TELA (01/10, o "popup que amplia um trecho da tela para
 * ler melhor" do vídeo de referência): em vez de ampliar a tela inteira, o
 * trecho medido (as linhas de texto da região) é recortado do próprio vídeo,
 * ampliado até 82% do quadro e entra por cima num cartão com borda na cor da
 * marca e sombra, com fade; o resto da tela escurece por baixo. A webcam do
 * canto continua visível (a tela não se mexe). Devolve os nós do grafo, com
 * [ENTRADA_A] (o fundo) e [ENTRADA_B] (a fonte do recorte), e o rótulo final.
 */
export function popupDaTela(cena, W, H, fps, k0, m, i) {
  const r = cena.tela?.regiao;
  if (!r || r.w < 8 || r.h < 8) return null;
  const ex = W / m.largura;
  const ey = H / m.altura;
  const par = (v) => Math.max(2, Math.floor(v / 2) * 2);
  const cx = par(Math.max(0, r.x * ex));
  const cy = par(Math.max(0, r.y * ey));
  const cw = par(Math.min(W - cx, r.w * ex));
  const ch = par(Math.min(H - cy, r.h * ey));
  if (cw < 16 || ch < 16) return null;
  // Ampliado até caber em 82% do quadro, no máximo 2,4 vezes (pixel demais borra).
  const escala = Math.min(2.4, (W * 0.82) / cw, (H * 0.82) / ch);
  if (escala < 1.05) return null;
  const sw = par(cw * escala);
  const sh = par(ch * escala);
  const borda = Math.max(4, Math.round(Math.min(W, H) * 0.006));
  const entra = Math.max(0, (Math.round(0.12 * fps) - k0) / fps).toFixed(3);
  const cor = corDoFfmpeg(cena.tela.destaque);
  return {
    nos: [
      `[ENTRADA_A]drawbox=x=0:y=0:w=iw:h=ih:color=black@0.55:t=fill:enable='gte(t,${entra})'[pf${i}]`,
      `[ENTRADA_B]crop=${cw}:${ch}:${cx}:${cy},scale=${sw}:${sh}:flags=bicubic,pad=${sw + 2 * borda}:${sh + 2 * borda}:${borda}:${borda}:color=${cor},format=yuva420p,fade=t=in:st=${entra}:d=0.22:alpha=1[pc${i}]`,
      `[pf${i}][pc${i}]overlay=(W-w)/2:(H-h)/2:shortest=1,format=yuv420p[po${i}]`,
    ],
    saida: `po${i}`,
  };
}

export function filtroDoMovimento(cena, W, H, fps, k0, n, m) {
  // TELA COMPARTILHADA (01/10): o zoom vai à região que importa (o app
  // resolveu em pixels do quadro da montagem) e chega a `zoom` (até 1,8) em
  // 0,6 s, desacelerando, e segura até o corte. É o "zoom na parte da tela"
  // dos vídeos de tutorial; os 10% em volta do rosto não mostrariam nada.
  if (cena.tela?.regiao && cena.tela.zoom > 1 && cena.movimento !== "estatico") {
    const r = cena.tela.regiao;
    const cx = Math.min(1, Math.max(0, (r.x + r.w / 2) / m.largura));
    const cy = Math.min(1, Math.max(0, (r.y + r.h / 2) / m.altura));
    const chegada = Math.max(1, Math.round(0.6 * fps));
    const p = `min(1,(on+${k0})/${chegada})`;
    const z = `1+${(cena.tela.zoom - 1).toFixed(3)}*(1-pow(1-${p},3))`;
    const W2 = Math.round((W * 1.5) / 2) * 2;
    const H2 = Math.round((H * 1.5) / 2) * 2;
    // O DESTAQUE: assentado o zoom, o que está fora da caixa medida (linhas de
    // cima ou de baixo que a janela também mostra, às vezes cortadas na
    // borda) escurece, e o olho fica nas linhas inteiras. Conta da janela
    // final: a mesma do zoompan, em fração do quadro.
    const Z = cena.tela.zoom;
    const vx0 = Math.max(0, Math.min(1 - 1 / Z, cx - 1 / Z / 2));
    const vy0 = Math.max(0, Math.min(1 - 1 / Z, cy - 1 / Z / 2));
    const bx0 = Math.max(0, Math.round(((r.x / m.largura - vx0) * Z) * W));
    const by0 = Math.max(0, Math.round(((r.y / m.altura - vy0) * Z) * H));
    const bx1 = Math.min(W, Math.round((((r.x + r.w) / m.largura - vx0) * Z) * W));
    const by1 = Math.min(H, Math.round((((r.y + r.h) / m.altura - vy0) * Z) * H));
    const assentado = Math.max(0, (chegada - k0) / fps).toFixed(3);
    const escuro = (x, y, w, h) => (w > 2 && h > 2 ? `,drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=black@0.45:t=fill:enable='gte(t,${assentado})'` : "");
    // O CONTORNO DE DESTAQUE (01/10, "highlight" do vídeo de referência): uma
    // moldura fina na cor da marca em volta das linhas que importam, assentado o zoom.
    const contorno =
      cena.tela.destaque && bx1 - bx0 > 8 && by1 - by0 > 8
        ? `,drawbox=x=${Math.max(0, bx0 - 6)}:y=${Math.max(0, by0 - 6)}:w=${Math.min(W, bx1 - bx0 + 12)}:h=${Math.min(H, by1 - by0 + 12)}:color=${corDoFfmpeg(cena.tela.destaque)}@0.95:t=${Math.max(3, Math.round(Math.min(W, H) * 0.004))}:enable='gte(t,${assentado})'`
        : "";
    const destaque =
      escuro(0, 0, W, by0) + escuro(0, by1, W, H - by1) + escuro(0, by0, bx0, by1 - by0) + escuro(bx1, by0, W - bx1, by1 - by0) + contorno;
    return (
      `,scale=${W2}:${H2}:flags=bicubic,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${fps}` +
      `:x='max(0,min(iw-iw/zoom,${cx.toFixed(4)}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${cy.toFixed(4)}*ih-ih/zoom/2))'` +
      destaque
    );
  }
  // O foco da cena (o app resolve: centro do rosto) em fração do quadro.
  const focoX = cena.foco ? cena.foco.x / m.largura : cena.narrador?.origemDoZoom?.x;
  const focoY = cena.foco ? cena.foco.y / m.altura : cena.narrador?.origemDoZoom?.y;
  const fx = Math.min(0.85, Math.max(0.15, focoX ?? 0.5));
  const fy = Math.min(0.8, Math.max(0.2, focoY ?? 0.4));
  // O ENQUADRAMENTO (03/10, corte limpo): `cena.zoom` é o plano da cena (1,1
  // médio, 1,2 fechado) e, no punch, o zoom de chegada na palavra forte.
  // Pedido antigo, sem o campo: o punch de 1,12 de sempre.
  const enquadramento = typeof cena.zoom === "number" && cena.zoom > 1.01 ? Math.min(1.3, cena.zoom) : 1;
  if (cena.movimento === "punch" || (cena.movimento === "estatico" && enquadramento > 1)) {
    const z = cena.movimento === "punch" ? (enquadramento > 1 ? enquadramento : 1.12) : enquadramento;
    const w = Math.round(W / z / 2) * 2;
    const h = Math.round(H / z / 2) * 2;
    const x = Math.round(Math.max(0, Math.min(W - w, fx * W - w / 2)));
    const y = Math.round(Math.max(0, Math.min(H - h, fy * H - h / 2)));
    return `,crop=${w}:${h}:${x}:${y},scale=${W}:${H}:flags=bicubic`;
  }
  if (cena.movimento !== "zoom-in-lento" && cena.movimento !== "zoom-out") return "";
  // Mesma curva do Remotion (cena.tsx): entra e sai suave no zoom lento,
  // desacelera no afastamento.
  const p = `min(1,(on+${k0})/${Math.max(1, n - 1)})`;
  const zb = enquadramento.toFixed(3);
  const z = cena.movimento === "zoom-in-lento" ? `${zb}*(1+0.1*(if(lt(${p},0.5),2*${p}*${p},1-pow(-2*${p}+2,2)/2)))` : `${zb}*(1.1-0.1*(1-pow(1-${p},2)))`;
  const W2 = Math.round((W * 1.5) / 2) * 2;
  const H2 = Math.round((H * 1.5) / 2) * 2;
  return (
    `,scale=${W2}:${H2}:flags=bicubic,zoompan=z='${z}':d=1:s=${W}x${H}:fps=${fps}` +
    `:x='max(0,min(iw-iw/zoom,${fx}*iw-iw/zoom/2))':y='max(0,min(ih-ih/zoom,${fy}*ih-ih/zoom/2))'`
  );
}

// ─────────────────────────────── 5. a montagem ───────────────────────────────

/**
 * O completo editado. `pedido`:
 *   montagem       MontagemResolvida 16:9 do completo inteiro (tempo da base)
 *   completoUrl    a base (o completo de hoje), OU
 *   baseArquivo    só na prova local
 *   renders        quantos renders do Remotion em paralelo (padrão 2)
 */
export async function montarCompleto(pedido, pasta, { baixar, aoProgresso } = {}) {
  const tempos = {};
  const t0 = Date.now();
  let t = Date.now();
  const marcar = (nome) => {
    tempos[nome] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  const m = pedido.montagem;
  if (!m || m.versao !== 1) throw new Error("plano de montagem ausente ou de versão desconhecida");
  await descobrirOpcaoDeFiltro();
  const P = parametrosDoAcabamento(Boolean(pedido.leve));
  tempos.leve = pedido.leve ? 1 : 0;

  // 1. A base.
  let base = join(pasta, "base.mp4");
  if (pedido.baseArquivo) base = pedido.baseArquivo;
  else await baixar(pedido.completoUrl, base);
  // Quadro fora do padrão (gêmeo 1:1, celular 4:3): a base vira o quadro
  // padrão com fundo desfocado antes de qualquer conta (ver `enquadrarBase`).
  if (pedido.enquadramento?.conteudo) {
    base = await enquadrarBase(base, pedido.enquadramento, pasta, fpsDe(base));
    marcar("enquadramento");
  }
  const dim = await ffprobe(base);
  const fps = fpsDe(base);
  const W = dim.largura;
  const H = dim.altura;
  // A montagem tem de ter a PROPORÇÃO da base: as janelas são esticadas para
  // W x H e intercaladas com ela quadro a quadro. Base em pé com montagem
  // deitada (pedido antigo na fila, de antes da montagem vertical de 30/09)
  // ou um quadro fora do padrão (celular que grava 19,5:9) sairiam
  // deformados; melhor falhar com motivo claro, e o completo segue sem a
  // edição. A base em pé com montagem 9:16 passa (mesma proporção).
  const proporcaoDaBase = W / H;
  const proporcaoDaMontagem = m.largura / m.altura;
  if (Math.abs(proporcaoDaBase / proporcaoDaMontagem - 1) > 0.03) {
    throw new Error(`base ${W}x${H} com montagem ${m.largura}x${m.altura}: proporções diferentes, o completo fica sem montagem`);
  }
  const total = Math.round(dim.duracaoSec * fps);
  marcar("base");

  // 2. As janelas e a linha condensada.
  const janelasBase = planejarJanelas(m, fps, total);
  const cond = montagemCondensada(m, janelasBase, fps);
  const quadrosDeJanela = cond.quadros;
  // Fica na pasta para medir e conferir o render sem refazer o resto.
  await writeFile(join(pasta, "montagem-janelas.json"), JSON.stringify(cond.montagem), "utf8");
  marcar("planejamento");

  // 3. O narrador das janelas: cada trecho da base, recortado no quadro exato
  //    (meio quadro antes, para a busca nunca cair no quadro vizinho) e
  //    emendado por cópia. Mesmos parâmetros em todos, então a cópia fecha.
  let janelasMp4 = null;
  if (cond.janelas.length) {
    const partes = await emPiscina(cond.janelas, 3, async (j, i) => {
      const saida = join(pasta, `nj-${String(i).padStart(4, "0")}.mp4`);
      await rodar([
        "-ss", ((j.f0 - 0.5) / fps).toFixed(4), "-i", base,
        "-t", ((j.f1 - j.f0) / fps).toFixed(4),
        "-vf", "setpts=PTS-STARTPTS", "-af", "asetpts=PTS-STARTPTS",
        "-fps_mode", "cfr", "-r", String(fps),
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "14", "-pix_fmt", "yuv420p", "-g", "30",
        "-c:a", "aac", "-b:a", "96k", "-threads", fios(), saida,
      ]);
      return saida;
    });
    const narrador = join(pasta, "narrador-janelas.mp4");
    if (partes.length === 1) await copyFile(partes[0], narrador);
    else await emendar(partes, narrador, pasta);
    for (const p of partes) await rm(p, { force: true }).catch(() => {});
    // O NARRADOR DAS CAIXAS em 960x540 (30/09, velocidade). No canto e na foto
    // o narrador aparece com 540 a 650 px de largura, e o Chrome recebia um
    // quadro de 1080p por quadro de saída para encolher: medido no notebook,
    // a cena de foto foi de 4,2 para 8,1 quadros/s. O tamanho na tela é do CSS
    // (o app resolveu em pixels da base), então o arquivo menor só muda a
    // definição, que nessas caixas não se vê. O cheio usa o arquivo inteiro.
    // Na base em pé (30/09) o arquivo menor é 540x960: deitado, o narrador
    // das caixas sairia espremido.
    await rodar([
      "-i", narrador, "-an", "-vf", `scale=${H > W ? "540:960" : "960:540"}:flags=bicubic,setsar=1`,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "16", "-pix_fmt", "yuv420p", "-g", "30", "-threads", fios(),
      join(pasta, "narrador-caixas.mp4"),
    ]);
    marcar("narrador");

    // 4. O render das janelas, dividido em até `renders` pedaços que rodam
    //    juntos. O corte entre pedaços cai sempre numa borda de janela.
    const fundos = await prepararFundos(cond.montagem, pasta, baixar ?? (async () => { throw new Error("sem download"); }));
    const { renderMedia, selectComposition } = await import("@remotion/renderer");
    const serveUrl = await bundleDoRemotion();
    const servidor = await servirPasta(pasta);
    marcar("preparo");
    try {
      const recorteCheio = { x: 0, y: 0, w: cond.montagem.fonte.largura, h: cond.montagem.fonte.altura };
      const inputProps = {
        montagem: cond.montagem,
        narradorUrl: `${servidor.base}/narrador-caixas.mp4`,
        recortadoUrl: null,
        recortados: {},
        fundos: Object.fromEntries(Object.entries(fundos).map(([k, a]) => [k, `${servidor.base}/${a}`])),
        // A base já está no tamanho do quadro: o narrador cheio das janelas é
        // ela mesma, sem ampliação (o app resolveu o cheio do completo com o
        // quadro inteiro, ver resolverMontagemPaisagem).
        cheio: W === m.largura && H === m.altura ? { url: `${servidor.base}/narrador-janelas.mp4`, recorte: recorteCheio } : null,
        duracaoDasMidias: pedido.duracaoDasMidias ?? {},
      };
      // JPEG 95 nas janelas (02/10, "as inserções pioraram a qualidade"): o
      // quadro do Chrome passa por mais uma compressão que a base; a 90 a
      // imagem gerada perdia detalhe fino perto da gravação.
      const opcoes = { ...opcoesDoRender(), jpegQuality: 95 };
      // 2 por unidade da fatia, até 4 (2 na máquina de 8 vCPU); MONTAGEM_COMPLETO_RENDERS fixa.
      const renders = Math.max(1, Math.min(4, Number(P.renders ?? pedido.renders ?? fatiaAtual().rendersDoCompleto)));
      // As abas do Chrome se dividem entre os renders: o total fica no teto
      // que já sobreviveu em produção (4 abas no contêiner de 7,6 GB), com
      // folga de uma aba por render a mais.
      const abas = Math.max(2, Math.ceil(opcoes.concurrency / renders) + (renders > 1 ? 1 : 0));
      // Porta LIVRE de verdade para o servidor do bundle: o Remotion procura a
      // partir da 3000 e, no teste de 30/09, pegou a 3001 de um "next dev"
      // aberto no IPv6 ("não é um projeto Remotion"). Com dois renders juntos,
      // cada um precisa da sua.
      const composition = await selectComposition({ serveUrl, id: "Montagem", inputProps, chromiumOptions: opcoes.chromiumOptions, port: await portaLivre() });
      // Pedaços de tamanho parecido, cortados em borda de janela.
      const alvo = quadrosDeJanela / renders;
      const cortes = [0];
      for (const j of cond.janelas) if (j.c0 >= alvo * cortes.length && j.c0 > cortes[cortes.length - 1]) cortes.push(j.c0);
      cortes.push(quadrosDeJanela);
      // QUADROS DA COMPOSIÇÃO, e não da base (01/10, parte 240). O celular grava
      // a 29,583 quadros/s e a composição roda a 30: os cortes acima estão em
      // quadros da base, e pedir ao Remotion só até `quadrosDeJanela` deixava
      // de fora o último 1,4% da linha condensada (0,8 s em 57 s de janela), e
      // o fim da última inserção saía curto. A conversão passa pelo tempo, que
      // é o que o acabamento usa para recortar as janelas.
      const naComposicao = (q) => Math.min(composition.durationInFrames, Math.round((q / fps) * composition.fps));
      const cortesNaComposicao = [...new Set(cortes.map(naComposicao))];
      const pedacos = cortesNaComposicao.slice(0, -1).map((de, i) => ({ de, ate: cortesNaComposicao[i + 1] })).filter((p) => p.ate > p.de);
      const totalNaComposicao = Math.max(1, naComposicao(quadrosDeJanela));
      const progresso = pedacos.map(() => 0);
      const arquivos = await Promise.all(
        pedacos.map(async (p, i) => {
          const saida = join(pasta, `janelas-${i}.mp4`);
          await renderMedia({
            ...opcoes,
            port: await portaLivre(),
            concurrency: abas,
            crf: 16,
            composition,
            serveUrl,
            outputLocation: saida,
            inputProps,
            frameRange: [p.de, p.ate - 1],
            muted: true,
            onProgress: ({ progress }) => {
              progresso[i] = progress * (p.ate - p.de);
              aoProgresso?.(progresso.reduce((s, x) => s + x, 0) / totalNaComposicao);
            },
          });
          return saida;
        })
      );
      janelasMp4 = join(pasta, "janelas.mp4");
      if (arquivos.length === 1) await copyFile(arquivos[0], janelasMp4);
      else await emendar(arquivos, janelasMp4, pasta);
      tempos.pedacosDoRender = pedacos.length;
      tempos.abasPorRender = abas;
    } finally {
      await servidor.fechar();
    }
    marcar("render");
  }

  // 5. O acabamento, em lotes: base e janelas intercaladas, zoom nas cenas
  //    cheias que ficaram na base, legenda no vídeo inteiro.
  const segmentos = [];
  // Cena cheia inteira fora das janelas, com movimento: o zoom vai na base.
  // O movimento começa na PALAVRA FORTE (movimentoEm), não no começo da cena:
  // o trecho antes dela fica na base pura.
  // O enquadramento parado (03/10, corte limpo: plano médio ou fechado) vale
  // desde o primeiro quadro da cena, e não da palavra forte.
  const enquadrada = (c) => c.movimento === "estatico" && typeof c.zoom === "number" && c.zoom > 1.01;
  const comMovimento = m.cenas
    .filter((c) => c.layout === "narrador-cheio" && (c.movimento !== "estatico" || enquadrada(c)))
    .map((c) => {
      const f0 = Math.round(c.inicio * fps);
      const f1 = Math.min(total, Math.round(c.fim * fps));
      const forte = typeof c.movimentoEm === "number" && !enquadrada(c) ? Math.round(c.movimentoEm * fps) : f0;
      return { c, cena0: f0, f0: Math.min(f1, Math.max(f0, forte)), f1 };
    })
    .filter((x) => x.f1 - x.f0 >= 6);
  let cursor = 0;
  const empurrarBase = (de, ate) => {
    let f = de;
    for (const z of comMovimento) {
      if (z.f1 <= f || z.f0 >= ate) continue;
      // Só o pedaço fora das janelas (a vizinha da transição fica no Remotion).
      const a = Math.max(z.f0, f);
      const b = Math.min(z.f1, ate);
      if (b - a < 2) continue;
      if (a > f) segmentos.push({ tipo: "base", de: f, ate: a });
      segmentos.push({ tipo: "base", de: a, ate: b, cena: z.c, k0: a - z.f0, n: z.f1 - z.f0, inteiro: true });
      f = b;
    }
    if (ate > f) segmentos.push({ tipo: "base", de: f, ate });
  };
  for (const j of cond.janelas) {
    if (j.f0 > cursor) empurrarBase(cursor, j.f0);
    segmentos.push({ tipo: "janela", de: j.f0, ate: j.f1, c0: j.c0 });
    cursor = j.f1;
  }
  if (cursor < total) empurrarBase(cursor, total);

  // Lotes: ~LOTE_SEG cada, partindo segmentos longos (menos o de zoom, que
  // precisa da cena inteira para a curva).
  const lote = Math.round(P.loteSeg * fps);
  const lotes = [];
  let atual = [];
  let inicioDoLote = 0;
  for (const s0 of segmentos) {
    let s = { ...s0 };
    while (s) {
      const cabe = inicioDoLote + lote - s.de;
      if (s.ate - s.de <= cabe || s.inteiro || cabe < fps) {
        atual.push(s);
        if (s.ate - inicioDoLote >= lote) {
          lotes.push({ de: inicioDoLote, ate: s.ate, segmentos: atual });
          atual = [];
          inicioDoLote = s.ate;
        }
        s = null;
      } else {
        const corte = s.de + cabe;
        atual.push({ ...s, ate: corte });
        lotes.push({ de: inicioDoLote, ate: corte, segmentos: atual });
        atual = [];
        inicioDoLote = corte;
        s = { ...s, de: corte, c0: s.tipo === "janela" ? s.c0 + (corte - s.de) : undefined };
      }
    }
  }
  if (atual.length) lotes.push({ de: inicioDoLote, ate: atual[atual.length - 1].ate, segmentos: atual });

  const opcao = await descobrirOpcaoDeFiltro();
  await cp(PASTA_DAS_FONTES, join(pasta, "fontes"), { recursive: true });
  const codificarLote = async (L, k, { fiosDoCodificador }) => {
    const T0 = (L.de - 0.5) / fps;
    const js = L.segmentos.filter((s) => s.tipo === "janela");
    const J0 = js.length ? js[0].c0 : 0;
    const TJ = (J0 - 0.5) / fps;
    const nos = [];
    const rotulos = [];
    L.segmentos.forEach((s, i) => {
      const norm = `,scale=${W}:${H}:flags=bicubic,format=yuv420p,setsar=1`;
      if (s.tipo === "base") {
        const corte = `[0:v]trim=start=${((s.de - L.de) / fps).toFixed(4)}:end=${((s.ate - L.de) / fps).toFixed(4)},setpts=PTS-STARTPTS`;
        // O POPUP DO TRECHO DA TELA (01/10): a tela fica como está, escurece, e o
        // trecho que importa salta para a frente ampliado num cartão com borda
        // na cor da marca (ver `popupDaTela`).
        const popup = s.cena?.tela?.modo === "popup" ? popupDaTela(s.cena, W, H, fps, s.k0 ?? 0, m, i) : null;
        if (popup) {
          nos.push(`${corte},split[pa${i}][pb${i}]`);
          nos.push(...popup.nos.map((n) => n.replace(/\[ENTRADA_A\]/g, `[pa${i}]`).replace(/\[ENTRADA_B\]/g, `[pb${i}]`)));
          nos.push(`[${popup.saida}]${norm.replace(/^,/, "")}[s${i}]`);
          rotulos.push(`[s${i}]`);
          return;
        }
        const mov = s.cena ? filtroDoMovimento(s.cena, W, H, fps, s.k0 ?? 0, s.n ?? s.ate - s.de, m) : "";
        const webcam = mov && s.cena?.tela?.webcam ? webcamNoQuadro(s.cena.tela.webcam, W, H, m) : null;
        if (webcam) {
          // ZOOM NA TELA COM A WEBCAM DE VOLTA (01/10): o zoom amplia o texto e
          // a webcam do canto sairia do quadro; ela é recortada do quadro
          // ORIGINAL e colada no mesmo lugar e tamanho, com uma borda fina.
          nos.push(`${corte},split[za${i}][zb${i}]`);
          nos.push(`[za${i}]${mov.replace(/^,/, "")}${norm}[zz${i}]`);
          nos.push(`[zb${i}]crop=${webcam.w}:${webcam.h}:${webcam.x}:${webcam.y},drawbox=x=0:y=0:w=iw:h=ih:color=white@0.85:t=3[cam${i}]`);
          nos.push(`[zz${i}][cam${i}]overlay=${webcam.x}:${webcam.y}:shortest=1,format=yuv420p,setsar=1[s${i}]`);
        } else {
          nos.push(`${corte}${mov}${norm}[s${i}]`);
        }
      } else {
        nos.push(`[1:v]trim=start=${((s.c0 - J0) / fps).toFixed(4)}:end=${((s.c0 + (s.ate - s.de) - J0) / fps).toFixed(4)},setpts=PTS-STARTPTS${norm}[s${i}]`);
      }
      rotulos.push(`[s${i}]`);
    });
    const ass = join(pasta, `legenda-${k}.ass`);
    await writeFile(ass, legendaEmAss(m, { largura: W, altura: H, desloc: L.de / fps, duracao: (L.ate - L.de) / fps }), "utf8");
    const grafo =
      nos.join(";") + ";" + rotulos.join("") + `concat=n=${rotulos.length}:v=1:a=0[vc];` +
      // O `fontsdir` aponta as fontes do produto (copiadas para a pasta do
      // trabalho: caminho absoluto do Windows tem dois-pontos, que o grafo lê
      // como separador); sem ele o libass cai numa fonte qualquer do sistema.
      `[vc]subtitles=${basename(ass)}:fontsdir=fontes[v]`;
    const arquivoDoGrafo = join(pasta, `grafo-${k}.txt`);
    await writeFile(arquivoDoGrafo, grafo, "utf8");
    const saida = join(pasta, `lote-${String(k).padStart(3, "0")}.mp4`);
    await rodar(
      [
        // O teto de fios por entrada (decodificador) e do grafo inteiro: ver
        // `parametrosDoAcabamento`. Sem ele, cada `scale` abria um fio por núcleo.
        "-threads", P.fiosDeEntrada, "-ss", Math.max(0, T0).toFixed(4), "-i", base,
        ...(js.length ? ["-threads", P.fiosDeEntrada, "-ss", Math.max(0, TJ).toFixed(4), "-i", janelasMp4] : []),
        opcao, basename(arquivoDoGrafo),
        "-filter_complex_threads", "1", "-filter_threads", "1",
        "-map", "[v]", "-an", "-fps_mode", "cfr", "-r", String(fps),
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
        // Cada lote abre em quadro-chave e fecha o GOP: a emenda por cópia
        // entre lotes não trava (mesma regra do passe 2 do completo).
        "-g", "60", "-keyint_min", "60", "-sc_threshold", "0", "-maxrate", "6M", "-bufsize", "12M",
        "-threads", fiosDoCodificador,
        saida,
      ],
      { cwd: pasta, timeoutMs: 60 * 60_000 }
    );
    return saida;
  };
  // SEGUNDA CHANCE POR LOTE (01/10, parte 240), a mesma lição do passe 2 do
  // completo em ffmpeg.mjs: o lote que falha é repetido SOZINHO no fim, com o
  // codificador em 2 fios, antes de o completo inteiro ser dado como falho.
  // Falta de recurso na hora não é defeito do lote, e refazer só ele custa
  // segundos, contra refazer o render do Remotion inteiro numa nova tentativa.
  const falhados = [];
  const partesDoVideo = await emPiscina(lotes, P.lotesJuntos, async (L, k) => {
    try {
      return await codificarLote(L, k, { fiosDoCodificador: P.fiosDoCodificador });
    } catch (e) {
      console.warn(`[completo] lote ${k} falhou, repete sozinho no fim: ${String(e?.message ?? e).slice(-300)}`);
      falhados.push(k);
      return null;
    }
  });
  for (const k of falhados) partesDoVideo[k] = await codificarLote(lotes[k], k, { fiosDoCodificador: "2" });
  tempos.lotesRepetidos = falhados.length;
  let soVideo = join(pasta, "so-video.mp4");
  if (partesDoVideo.length === 1) await copyFile(partesDoVideo[0], soVideo);
  else await emendar(partesDoVideo, soVideo, pasta);
  marcar("acabamento");

  // 5b. A CONFERÊNCIA DEPOIS DO RENDER (02/10, src/conferencia-do-render.mjs):
  //     trecho preto ou de uma cor só que a gravação não tem é trocado pela
  //     base (o narrador) antes de entregar, e medido de novo. Falhar a
  //     medida não derruba o completo, mas fica escrito no resultado.
  const conferencia = { defeitos: [], consertados: 0, depois: [], poucoConteudo: [], erro: null };
  try {
    const { vaziosDoEditado, consertarComABase } = await import("./conferencia-do-render.mjs");
    const antes = await vaziosDoEditado(soVideo, base);
    conferencia.defeitos = antes.defeitos;
    conferencia.poucoConteudo = antes.poucoConteudo ?? [];
    if (antes.defeitos.length) {
      soVideo = await consertarComABase(soVideo, base, antes.defeitos, pasta, { fps, largura: W, altura: H, fios: P.fiosDoCodificador });
      conferencia.consertados = antes.defeitos.length;
      conferencia.depois = (await vaziosDoEditado(soVideo, base)).defeitos;
    }
  } catch (e) {
    conferencia.erro = String(e?.message ?? e).slice(-300);
    console.warn(`[completo] conferência depois do render falhou: ${conferencia.erro}`);
  }
  marcar("conferencia");
  let saida = join(pasta, "completo-editado.mp4");
  await rodar(["-i", soVideo, "-i", base, "-map", "0:v", "-map", "1:a", "-c", "copy", "-shortest", "-movflags", "+faststart", saida], { cwd: pasta });
  // O SOUND DESIGN (01/10): os efeitos do estilo por baixo da voz, no tempo
  // da base (src/sons.mjs). Falhar aqui não derruba o completo.
  if (m.sons?.length) {
    try {
      const { misturarEfeitos } = await import("./sons.mjs");
      saida = await misturarEfeitos(saida, m.sons, dim.duracaoSec, pasta, join(pasta, "completo-editado-com-som.mp4"));
      tempos.sons = m.sons.length;
    } catch (e) {
      console.warn(`[completo] efeitos sonoros falharam, o completo sai sem eles: ${e instanceof Error ? e.message : e}`);
    }
  }
  for (const p of partesDoVideo) await rm(p, { force: true }).catch(() => {});
  await rm(soVideo, { force: true }).catch(() => {});
  marcar("som");

  // 6. A ABERTURA com os melhores momentos (01/10), na frente do completo
  //    editado, a partir da BASE (os momentos vêm no tempo dela, com as bordas
  //    no silêncio). Emendada por cópia: a abertura sai com os parâmetros dos
  //    lotes. Falhar aqui não derruba o completo: ele sai sem a abertura.
  let final = saida;
  let momentosDaAbertura = 0;
  // A duração da abertura no arquivo final (02/10): a revisão visual do app
  // precisa dela para levar o tempo do vídeo pronto ao tempo da base.
  let aberturaSeg = 0;
  if (pedido.abertura?.momentos?.length) {
    try {
      const { montarAberturaDeImpacto, prefixarAbertura } = await import("./abertura-de-impacto.mjs");
      const pessoa = pedido.pessoa ?? null;
      const foco = pessoa ? { x: pessoa.x + pessoa.w / 2, y: pessoa.y + pessoa.h * 0.3 } : null;
      const abertura = await montarAberturaDeImpacto(base, pedido.abertura.momentos, pasta, {
        familia: pedido.abertura.familia ?? m.familia,
        acento: pedido.abertura.acento ?? m.marca?.acento,
        foco,
        // A passagem do estilo (01/10): fusão no telejornal e no keynote.
        passagem: pedido.abertura.passagem ?? null,
      });
      if (abertura) {
        final = join(pasta, "completo-com-abertura.mp4");
        await prefixarAbertura(abertura, saida, final, pasta, { copiar: true });
        momentosDaAbertura = pedido.abertura.momentos.length;
        // A abertura também é conferida (02/10): trecho vazio nela tira a
        // abertura inteira, e o completo sai sem ela.
        try {
          const { medirVazios } = await import("./conferencia-do-render.mjs");
          const durAbertura = (await ffprobe(abertura)).duracaoSec || 0;
          aberturaSeg = durAbertura;
          const v = await medirVazios(final, { de: 0, ate: durAbertura + 0.2 });
          if (v.trechos.length) {
            conferencia.abertura = v.trechos;
            final = saida;
            momentosDaAbertura = 0;
            aberturaSeg = 0;
          }
        } catch (e) {
          console.warn(`[completo] conferência da abertura falhou: ${e instanceof Error ? e.message : e}`);
        }
      }
    } catch (e) {
      console.error(`[completo] abertura falhou, o completo sai sem ela: ${e instanceof Error ? e.message : e}`);
      final = saida;
    }
    marcar("abertura");
  }

  tempos.total = +((Date.now() - t0) / 1000).toFixed(1);
  return {
    arquivo: final,
    abertura: momentosDaAbertura,
    tempos,
    janelas: cond.janelas.length,
    segundosDeJanela: +(quadrosDeJanela / fps).toFixed(1),
    fracaoDeJanela: total ? +(quadrosDeJanela / total).toFixed(3) : 0,
    lotes: lotes.length,
    cpus: availableParallelism(),
    conferencia,
    aberturaSeg: +aberturaSeg.toFixed(3),
  };
}

