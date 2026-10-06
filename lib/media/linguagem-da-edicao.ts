import { ESTILOS, type Estilo } from "@/lib/media/estilos";
import { estiloDoCatalogo, normalizarEscolha, type EscolhaDeEstilo } from "@/lib/media/catalogo-de-estilos";
import { coresDaMarca, familiaDaLinguagem, type CoresDaMarca, type FamiliaDaCapa } from "@/lib/media/capa-composta";
import { legendaDecidida, legendaDoCorteDecidida, type EstiloDeLegenda, type LegendaDecidida } from "@/lib/media/legenda-escolhida";

/**
 * A LINGUAGEM ESCOLHIDA VIRANDO EDIÇÃO (30/09/2026).
 *
 * No teste de 29/09 o Bruno escolheu Vox com aproximação lenta, afastamento,
 * timelapse, mundo congelado, colagem e luz vazada, e os cortes saíram com o
 * perfil de legenda "sério" e nada mais: só `videoStyle` chegava ao worker. A
 * tela prometia uma edição e entregava outra.
 *
 * Aqui a escolha inteira (`Project.videoEstiloEscolha`) vira duas coisas que o
 * pedido de corte leva:
 *
 * 1. O ESTILO da legenda, derivado da base da linguagem, com as cores da marca:
 *    Vox vira legenda escura em caixa de papel com o destaque em marca-texto na
 *    cor da marca; Hormozi vira palavra a palavra grande com a palavra falada na
 *    cor da marca; os sóbrios ficam limpos, com a cor da marca só no destaque.
 * 2. O TRATAMENTO que o worker aplica no vídeo: movimento de câmera (aproximação,
 *    afastamento, alternado, impacto, câmera na mão), look de cor, e os efeitos
 *    pontuais que o ffmpeg faz sem custo (flash, luz vazada, glitch, grão de
 *    papel) nos momentos fortes da fala.
 *
 * O que precisa de geração por IA (mundo congelado, timelapse, clones, drone)
 * fica para a Higgsfield (lib/media/higgsfield.ts), que só liga com aprovação.
 * Aqui entra só o que o ffmpeg executa de verdade: o cliente não pode ver na
 * tela uma camada que a edição ignora sem saber por quê, então `semExecucao`
 * lista o que ficou de fora.
 */

export type ModoDeCamera = "aproximacao" | "afastamento" | "alternado" | "impacto" | "na-mao" | "estatica" | "base";

export type TratamentoDaEdicao = {
  linguagem: string;
  familia: FamiliaDaCapa;
  /** Id do look do catálogo, ou o padrão da família quando o cliente não escolheu. */
  look: string | null;
  camera: { modo: ModoDeCamera; forca: number };
  efeitos: { flash: boolean; luzVazada: boolean; glitch: boolean; grao: boolean };
  /** As cores da marca em hex (#rrggbb), para o que o worker desenha. */
  marca: CoresDaMarca;
  /** Camadas escolhidas que a edição de hoje não executa (vão para a Higgsfield). */
  semExecucao: string[];
};

/** "#F97316" vira "&H001673F9", a ordem azul-verde-vermelho que o ASS usa. */
export function corAss(hex: string, alfa = "00"): string {
  const h = hex.replace("#", "");
  const cheia = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = cheia.slice(0, 2);
  const g = cheia.slice(2, 4);
  const b = cheia.slice(4, 6);
  return `&H${alfa}${b}${g}${r}`.toUpperCase();
}

/** O look padrão de cada família, quando o cliente não escolheu um. */
const LOOK_DA_FAMILIA: Record<FamiliaDaCapa, string | null> = {
  // Vox: foto levemente dessaturada e com grão de papel, e a cor fica para a marca.
  colagem: "papel",
  impacto: "alto-contraste",
  sobrio: "natural",
};

/** O que cada movimento de câmera do catálogo vira no ffmpeg. */
function modoDaCamera(ids: string[]): ModoDeCamera {
  const tem = (id: string) => ids.includes(id);
  if (tem("dolly-in") && tem("dolly-out")) return "alternado";
  if (tem("crash-zoom")) return "impacto";
  if (tem("dolly-in") || tem("grua-desce") || tem("atraves")) return "aproximacao";
  if (tem("dolly-out") || tem("grua-sobe") || tem("recuo-aereo")) return "afastamento";
  if (tem("na-mao")) return "na-mao";
  if (tem("estatica")) return "estatica";
  return "base";
}

/** Camadas que dependem de gerar imagem nova, e não de tratar a gravação. */
const SO_COM_IA = new Set([
  "vertigo", "orbita", "arco", "pan", "whip-pan", "drone-fpv", "recuo-aereo", "de-cima", "bullet-time",
  "timelapse", "hiperlapso", "foco", "atraves", "grua-sobe", "grua-desce",
  "mundo-congelado", "clones", "sumir", "derreter", "lidar", "zoom-da-terra", "particulas", "quadrinho", "recorte", "colagem",
]);

export function edicaoDaLinguagem(
  escolhaBruta: unknown,
  videoStyle: string | null | undefined,
  colorPalette: string | null | undefined,
  /** "corte" (06/10, tarde): a legenda dos cortes, ligada por padrão (ver `legendaDoCorteDecidida`). */
  alvo: "corte" | "completo" = "completo"
): { escolha: EscolhaDeEstilo; estilo: Estilo; tratamento: TratamentoDaEdicao; legenda: LegendaDecidida } {
  const escolha = normalizarEscolha(escolhaBruta, videoStyle);
  const doCatalogo = estiloDoCatalogo(escolha.estiloId);
  const familia = familiaDaLinguagem(escolha.estiloId);
  const marca = coresDaMarca(colorPalette);
  const base = ESTILOS[doCatalogo?.base ?? "acelerado"];
  // Com ou sem legenda, e qual (30/09, lib/media/legenda-escolhida.ts). O
  // "auto" segue pelo caminho de antes, byte a byte; o estilo fixado pelo
  // cliente troca SÓ o desenho da legenda, e o ritmo e o som continuam os da
  // linguagem.
  const decidida = alvo === "corte" ? legendaDoCorteDecidida(escolha.legenda, escolha.legendaDosCortes, familia) : legendaDecidida(escolha.legenda, familia);

  // A LEGENDA DA LINGUAGEM, sempre com a cor da marca no destaque.
  let legenda: Estilo["legenda"];
  if (familia === "colagem") {
    // Vox: frase curta em caixa clara de papel, texto escuro, a palavra falada
    // acende na cor da marca; a frase-chave do agente entra em MARCA-TEXTO.
    legenda = {
      ...base.legenda,
      fonte: "Liberation Sans",
      negrito: true,
      // 124 e duas palavras por vez (30/09): com 96 e três palavras a legenda
      // ficava pequena no celular ("legenda pobre", disse o Bruno).
      corpo: 124,
      palavrasPorVez: 2,
      caixaAlta: false,
      cor: corAss(marca.escuro),
      corDoDestaque: corAss(marca.acento),
      contorno: 14,
      caixa: corAss("#ffffff", "10"),
      marcaTexto: { caixa: corAss(marca.acento), texto: corAss(marca.escuro) },
    };
  } else if (familia === "impacto") {
    legenda = { ...ESTILOS.acelerado.legenda, corDoDestaque: corAss(marca.acento) };
  } else {
    legenda = { ...base.legenda, corDoDestaque: corAss(marca.acento) };
  }
  if (decidida.mostrar && !decidida.automatica) legenda = legendaDoEstilo(decidida.estilo, marca, base.legenda);

  const escolhidas = [...escolha.camera, ...escolha.efeitos];
  const tem = (id: string) => escolha.efeitos.includes(id);
  const modo = modoDaCamera(escolha.camera);
  const tratamento: TratamentoDaEdicao = {
    linguagem: escolha.estiloId,
    familia,
    look: escolha.look ?? LOOK_DA_FAMILIA[familia],
    camera: {
      modo,
      // Aproximação lenta de Vox e documentário anda pouco (6%); impacto e
      // alternado mexem mais, porque é o movimento que carrega o ritmo.
      forca: modo === "impacto" ? 0.08 : modo === "alternado" ? 0.07 : modo === "na-mao" ? 0.04 : 0.06,
    },
    efeitos: {
      flash: tem("flash"),
      luzVazada: tem("luz-vazada"),
      glitch: tem("glitch"),
      // Colagem e recorte de papel, no vídeo gravado, viram grão e textura de papel.
      grao: tem("colagem") || tem("recorte") || familia === "colagem",
    },
    marca,
    semExecucao: escolhidas.filter((id) => SO_COM_IA.has(id) && id !== "colagem" && id !== "recorte"),
  };

  return {
    escolha,
    estilo: { ...base, legenda, ritmo: familia === "colagem" ? { intervaloDeMovimento: 5, forcaDoZoom: 0.03 } : base.ritmo },
    tratamento,
    legenda: decidida,
  };
}

/** Preto ou branco, o que ler melhor sobre a cor (a mesma conta do Remotion, util.ts). */
function textoSobre(hex: string): string {
  const h = hex.replace("#", "");
  const c = h.length === 3 ? h.split("").map((x) => x + x).join("") : h.slice(0, 6);
  const l = (0.299 * parseInt(c.slice(0, 2), 16) + 0.587 * parseInt(c.slice(2, 4), 16) + 0.114 * parseInt(c.slice(4, 6), 16)) / 255;
  return l > 0.6 ? "#16171a" : "#ffffff";
}

/**
 * A legenda do corte simples (ASS) de cada estilo que o cliente pode fixar
 * (30/09). Cada um é o par do desenho do Remotion (worker/remotion/src/partes/
 * legenda.tsx), para o corte simples e o montado dizerem a mesma coisa:
 *
 * - palavra: o perfil acelerado (Anton grande, uma palavra por vez);
 * - caixa: faixa na cor escura da marca, texto branco, a falada acende;
 * - marca-texto: faixa escura translúcida, e cada palavra ganha o grifo na cor
 *   da marca quando é dita (um evento por palavra, ver `grifo` em estilos.ts);
 * - papel: a tira de papel clara da colagem, a mesma do Vox;
 * - limpa: branca com contorno fino, quatro palavras, a da vez na cor da marca.
 */
function legendaDoEstilo(id: EstiloDeLegenda, marca: CoresDaMarca, daBase: Estilo["legenda"]): Estilo["legenda"] {
  const acento = corAss(marca.acento);
  if (id === "palavra") return { ...ESTILOS.acelerado.legenda, corDoDestaque: acento };
  if (id === "limpa") return { ...ESTILOS.serio.legenda, corDoDestaque: acento };
  if (id === "papel") {
    return {
      ...daBase,
      fonte: "Liberation Sans",
      negrito: true,
      corpo: 124,
      palavrasPorVez: 2,
      caixaAlta: false,
      cor: corAss(marca.escuro),
      corDoDestaque: acento,
      contorno: 14,
      caixa: corAss("#ffffff", "10"),
      marcaTexto: { caixa: acento, texto: corAss(marca.escuro) },
    };
  }
  if (id === "caixa") {
    return {
      ...ESTILOS.serio.legenda,
      fonte: "Liberation Sans",
      negrito: true,
      corpo: 112,
      palavrasPorVez: 3,
      caixaAlta: false,
      cor: corAss("#ffffff"),
      corDoDestaque: acento,
      contorno: 16,
      caixa: corAss(marca.escuro, "10"),
    };
  }
  // marca-texto
  return {
    ...ESTILOS.serio.legenda,
    fonte: "Liberation Sans",
    negrito: true,
    corpo: 116,
    palavrasPorVez: 3,
    caixaAlta: false,
    // Sem karaokê aqui: o que ainda não foi dito fica branco na faixa escura,
    // e o grifo de cada evento troca a caixa e a letra da palavra dita.
    cor: corAss("#ffffff"),
    corDoDestaque: corAss("#ffffff"),
    contorno: 12,
    caixa: corAss(marca.escuro, "70"),
    grifo: { caixa: acento, texto: corAss(textoSobre(marca.acento)) },
  };
}
