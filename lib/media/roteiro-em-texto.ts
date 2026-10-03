import type { CenaDoPlano, ElementoDoPlano, PalavraNoCorte, PlanoDeMontagem, AssetDoPlano, Formato } from "@/lib/media/plano-de-montagem";
import { aberturaNaTela, ganchoNaTela, type AberturaDoCompleto, type AberturaNaTela, type GanchoDoCorte, type GanchoNaTela } from "@/lib/media/abertura-do-roteiro";
import type { TelasDaGravacao } from "@/lib/media/faixas-de-tela";
import type { ResumoDaRevisao } from "@/lib/media/revisao-tipos";
import { cotasDoCompleto } from "@/lib/media/ritmo-da-edicao";

/**
 * A TELA DE ROTEIRO em texto (30/09/2026). Módulo PURO: sem banco, sem IA,
 * sem rede. A tela do cliente importa daqui (componente de cliente nunca
 * importa módulo que toca o banco) e o servidor também, para montar a mesma
 * tela depois de cada ajuste.
 *
 * O pedido do Bruno: "antes de construir os cortes deveria ter uma tela
 * prévia, mostrando a linha editorial para o usuário aprovar (...) selecionamos
 * esses cortes do seu vídeo com trechos da fala e uma ideia de elementos que
 * vão entrar em cada frame (...) o usuário pode escolher até 3; e para o vídeo
 * completo". O plano do diretor é JSON para o Remotion; aqui ele vira frase
 * que o cliente lê ("0:05 a 0:09: você no canto, imagem de Moisés no alto").
 */

// ─────────────────────────────── o que fica gravado ───────────────────────────────

export type AjusteDaCena = NonNullable<CenaDoPlano["ajuste"]>;

/** A fala de um trecho no tempo do CORTE (já limpo), como a montagem usa. */
export type FalaDoTrecho = { palavras: PalavraNoCorte[]; duracao: number };

/** `clips[i].roteiro`: o que o cliente aprova em cada corte candidato. */
export type RoteiroDoCorte = {
  /** Bordas no silêncio (tempo da gravação), as MESMAS do pedido ao worker. */
  inicio: number;
  fim: number;
  /** O que o worker vai emendar, no tempo do corte (0 = `inicio`). */
  manter: Array<{ de: number; ate: number }>;
  /** O texto exato que vai ao ar, com " / " onde a limpeza emendou. */
  texto: string;
  fala: FalaDoTrecho;
  /** O plano do diretor, com os ajustes do cliente. Null: sem montagem (ou fora do teto de cortes planejados). */
  plano: PlanoDeMontagem | null;
  /** O plano como o diretor entregou, para "desfazer". */
  planoOriginal?: PlanoDeMontagem | null;
  /** "reaproveitado": o corte já tinha plano feito para a MESMA fala (não pagamos de novo). */
  origem?: "diretor" | "reaproveitado";
  erro?: string | null;
  feitoEm: string;
  /** A frase de 3 a 5 s que abre o corte (01/10), no tempo do corte. Ver abertura-do-roteiro.ts. */
  gancho?: GanchoDoCorte | null;
  /**
   * A linguagem do catálogo em que o plano foi feito (01/10): trocar o estilo
   * do projeto e refazer replaneja, em vez de reaproveitar o plano antigo.
   */
  estiloId?: string;
  /** O que o revisor achou e corrigiu antes de o cliente ver (revisor-da-montagem.ts). */
  revisao?: ResumoDaRevisao | null;
};

/** O completo dentro do roteiro (fica em `completoMontagem.roteiro.completo`). */
export type RoteiroDoCompleto = {
  fala: FalaDoTrecho;
  /** Blocos do diretor (~3,5 min): tempo e, enquanto o roteiro trabalha, o plano de cada um. */
  blocos: Array<{ de: number; ate: number; inicio: number; fim: number; plano?: PlanoDeMontagem | null; erro?: string | null }>;
  plano: PlanoDeMontagem | null;
  planoOriginal?: PlanoDeMontagem | null;
  /** Quantas inserções o vídeo inteiro leva (a soma das cotas por minuto, ritmo-da-edicao.ts). */
  insercoes: number;
  erro?: string | null;
  /** A linguagem em que o plano foi feito (01/10). */
  estiloId?: string;
  /** A revisão de cada bloco, na ordem dos blocos (01/10). */
  revisoes?: Array<ResumoDaRevisao | null>;
};

/** `completoMontagem.roteiro`: o que vale para o vídeo inteiro. */
export type RoteiroDoVideo = {
  versao: 1;
  desde: string;
  feitoEm?: string | null;
  /**
   * As remoções da limpeza de fala do vídeo inteiro (pausas, muletas,
   * repetições e a limpeza por IA), no tempo da gravação. Guardadas aqui
   * porque a limpeza por IA não é determinística: o corte e o completo saem
   * EXATAMENTE com o texto que o cliente leu e aprovou.
   */
  remocoes: Array<{ de: number; ate: number; motivo?: string }>;
  /** A limpeza já rodou (a lista pode ser vazia de verdade, numa fala limpa). */
  limpezaFeita?: boolean;
  completo: RoteiroDoCompleto | null;
  /** Índices (em `clips`) dos cortes que o diretor planejou. */
  cortesPlanejados: number[];
  /** Custo de IA desta etapa, para o relatório. */
  custoUsd?: number;
  aprovadoEm?: string | null;
  /** Os candidatos que o cliente NÃO escolheu, guardados fora de `clips` na aprovação. */
  descartados?: unknown[];
  creditos?: { roteiro?: number; aprovacao?: number; novasIdeias?: number };
  /**
   * As faixas de tela compartilhada da gravação (01/10), detectadas ANTES do
   * diretor (lib/media/telas-da-gravacao.ts), no tempo da gravação.
   */
  telas?: TelasDaGravacao | null;
  /** A abertura com os melhores momentos do completo (01/10), no tempo da fala do completo. */
  abertura?: AberturaDoCompleto | null;
  /** Os ganchos dos cortes já foram pedidos (a lista pode ter vindo vazia). */
  ganchosFeitos?: boolean;
  /**
   * O gancho de cada candidato, pelo índice em `clips` ANTES da aprovação.
   * Fica aqui e não em `clips[i].roteiro` porque o diretor de cada corte
   * grava o roteiro dele inteiro em paralelo e apagaria o gancho; na
   * aprovação, cada corte que fica leva o seu para `roteiro.gancho`.
   */
  ganchos?: Record<string, GanchoDoCorte>;
};

// ─────────────────────────────── números ───────────────────────────────

/**
 * Até 30/09: uma inserção a cada 2 min ("a plataforma gera um efeito a cada 2
 * minutos de vídeo"). Saía pouco e mal distribuído (ver ritmo-da-edicao.ts):
 * desde 01/10 o total é a soma das cotas por minuto, com o começo mais denso.
 */
export const INSERCAO_DO_COMPLETO_A_CADA_SEG = 120;

export function insercoesDoCompleto(duracaoSeg: number, formato: Formato = "16:9"): number {
  return cotasDoCompleto(duracaoSeg, formato).reduce((s, c) => s + c.insercoes, 0) || 1;
}

/** "1:05", "12:40". */
export function mmss(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// ─────────────────────────────── a cena em português ───────────────────────────────

type Familia = "colagem" | "impacto" | "sobrio";

const LAYOUT: Record<string, string> = {
  "narrador-cheio": "você em tela cheia",
  "narrador-canto": "você no canto, com uma imagem grande em cima",
  "narrador-na-foto": "você dentro de uma foto colada, com recortes em volta",
  "narrador-recortado": "você recortado do fundo, sobre a cor da marca",
  "pip-terco": "você numa janela em um terço da tela, com a imagem ou a lista nos outros dois",
  "tela-dividida": "tela dividida: metade imagem, metade você",
  "broll-cheio": "a imagem em tela cheia, sem você (sua voz continua)",
  cartela: "cartela sem você, com texto ou gráfico (sua voz continua)",
};

const MOVIMENTO: Record<string, string> = {
  estatico: "",
  "zoom-in-lento": "aproximação lenta",
  "zoom-out": "a câmera se afasta",
  punch: "zoom rápido na palavra forte",
};

const TRANSICAO: Record<string, string> = {
  corte: "corte seco",
  "folha-de-papel": "uma folha de papel passa pela frente",
  deslize: "deslize",
  flash: "flash",
  fundir: "fusão suave",
};

function tipoDoAsset(a: AssetDoPlano, familia: Familia): string {
  if (a.tipo === "cena-em-movimento") return "cena de cinema gerada por IA";
  if (a.tipo === "cena-do-narrador") return "a sua sala recriada em vídeo, se desfazendo";
  if (a.tipo === "icone") return `logo de ${a.descricao}`;
  if (a.tipo === "elemento") return "recorte de objeto";
  return familia === "colagem" ? "colagem de papel" : familia === "sobrio" ? "foto documental" : "imagem";
}

/** A ideia do asset em português: o resumo do diretor, o texto do cliente, ou o tipo (planos antigos não têm resumo). */
function ideiaDoAsset(a: AssetDoPlano, familia: Familia): string {
  const tipo = tipoDoAsset(a, familia);
  if (a.doCliente) return `${tipo}: ${a.descricao}`;
  if (a.resumo) return a.resumo.toLowerCase().startsWith(tipo.split(" ")[0]) ? a.resumo : `${tipo}: ${a.resumo}`;
  return tipo === "imagem" ? "imagem gerada" : tipo;
}

function textoDoElemento(e: ElementoDoPlano, assets: AssetDoPlano[], familia: Familia): string {
  const aspas = (t: string) => `“${t}”`;
  switch (e.tipo) {
    case "recorte": {
      const a = assets.find((x) => x.id === e.asset);
      return a ? ideiaDoAsset(a, familia) : "recorte";
    }
    case "marca-texto":
      return `frase em destaque ${aspas(e.texto)}`;
    case "letras-revista":
      return familia === "impacto" ? `palavra gigante ${aspas(e.texto)}` : `título ${aspas(e.texto)}`;
    case "carimbo":
      return `carimbo ${aspas(e.texto)}`;
    case "tarja":
      return `tarja ${aspas(e.texto)}`;
    case "titulo":
      return `título ${aspas(e.texto)}`;
    case "numero":
      return `número ${e.prefixo ?? ""}${e.valor}${e.sufixo ?? ""}${e.rotulo ? ` (${e.rotulo.toLowerCase()})` : ""}`;
    case "icone-pop":
      return `ícone de ${e.nome.replace(/-/g, " ")}`;
    case "barras":
      return `gráfico de barras${e.titulo ? ` ${aspas(e.titulo)}` : ""}`;
    case "seta":
      return "seta desenhada";
    case "circulo":
      return "círculo desenhado";
    // Os do consórcio (02/10).
    case "faixa":
      return `faixa de valor ${aspas(e.texto)}`;
    case "selo":
      return e.check ? `selo ${aspas(e.texto)}` : `rótulo ${aspas(e.texto)}`;
    case "comentario":
      return `comentário respondido ${aspas(e.texto)}`;
    default:
      return "";
  }
}

const TIPOS_DE_TEXTO = new Set(["marca-texto", "letras-revista", "carimbo", "tarja", "titulo", "faixa", "selo", "comentario"]);

/** Cena "com efeito": tudo que não é você em tela cheia, parado e sem nada por cima. */
export function cenaTemEfeito(c: CenaDoPlano): boolean {
  return c.layout !== "narrador-cheio" || c.elementos.length > 0 || Boolean(c.asset);
}

/** Cena que pesa na conta (Remotion, imagem ou cena gerada): a que conta como "inserção" no completo. */
export function cenaEhInsercao(c: CenaDoPlano): boolean {
  return c.layout !== "narrador-cheio" || c.elementos.length > 0;
}

/** O que o botão "editar" muda nesta cena, e o texto que já está lá. */
export type EdicaoDaCena =
  | { tipo: "imagem"; atual: string }
  | { tipo: "texto"; atual: string }
  | { tipo: "nova"; atual: "" };

export function edicaoDaCena(c: CenaDoPlano, plano: PlanoDeMontagem): EdicaoDaCena {
  const asset = assetEditavel(c, plano);
  if (asset) return { tipo: "imagem", atual: asset.doCliente ? asset.descricao : asset.resumo ?? "" };
  const t = c.elementos.find((e) => TIPOS_DE_TEXTO.has(e.tipo)) as { texto: string } | undefined;
  if (t) return { tipo: "texto", atual: t.texto };
  return { tipo: "nova", atual: "" };
}

/** O asset que o "editar" troca: o principal da cena, ou o primeiro recorte gerado. Ícone de marca não se edita. */
export function assetEditavel(c: CenaDoPlano, plano: PlanoDeMontagem): AssetDoPlano | null {
  const porId = (id?: string) => (id ? plano.assets.find((a) => a.id === id && a.tipo !== "icone") ?? null : null);
  const principal = porId(c.asset);
  if (principal) return principal;
  for (const e of c.elementos) if (e.tipo === "recorte") {
    const a = porId(e.asset);
    if (a) return a;
  }
  return null;
}

export type CenaNaTela = {
  /** Índice da cena no plano (é o que as ações mandam de volta). */
  indice: number;
  inicio: number;
  fim: number;
  /** As palavras da cena, do jeito que vão ao ar. */
  fala: string;
  descricao: string;
  porque: string;
  transicao: string;
  efeito: boolean;
  ajuste: AjusteDaCena | null;
  edicao: EdicaoDaCena;
  /** Há versão original para desfazer. */
  temOriginal: boolean;
  /**
   * O pedido ao gerador de imagem, quando o plano não tem o resumo em
   * português (planos anteriores a 30/09): melhor o cliente ler o pedido em
   * inglês do que só "imagem".
   */
  pedidoDaImagem: string | null;
  /** O pedido do cliente nesta cena e se foi atendido (02/10): nunca some em silêncio. */
  pedido: { texto: string; atendido: "sim" | "parcial" | "nao"; motivo: string | null } | null;
  /** A edição de verdade, em peças curtas com ícone (02/10): o que acontece na tela. */
  visual: EdicaoVisual;
};

/**
 * A EDIÇÃO DA CENA EM PEÇAS (02/10, pedido do Bruno: "o card mostra só a
 * descrição"). Cada peça tem um ícone (o componente escolhe o desenho) e um
 * rótulo curto, na língua de quem é dono do negócio: "vídeo no lugar da sua
 * imagem", e não "broll-cheio".
 */
export type IconeDaPeca =
  | "pessoa" | "pessoa-elemento" | "video" | "imagem" | "janela" | "dividida" | "cartela" | "recorte"
  | "texto" | "icone" | "numero" | "grafico" | "logo" | "seta"
  | "aproximacao" | "parado" | "afastamento"
  | "corte" | "deslize" | "flash" | "fusao" | "papel";
export type PecaDaCena = { icone: IconeDaPeca; rotulo: string };
export type EdicaoVisual = { tela: PecaDaCena; entra: PecaDaCena[]; movimento: PecaDaCena; transicao: PecaDaCena };

export function edicaoVisual(c: CenaDoPlano, plano: PlanoDeMontagem): EdicaoVisual {
  const principal = c.asset ? plano.assets.find((a) => a.id === c.asset) : undefined;
  const ehVideo = principal ? principal.tipo === "cena-em-movimento" || principal.tipo === "cena-do-narrador" : false;
  const midia = ehVideo ? "vídeo" : "imagem";
  const tela: PecaDaCena =
    c.layout === "broll-cheio"
      ? { icone: ehVideo ? "video" : "imagem", rotulo: ehVideo ? "Vídeo no lugar da sua imagem" : "Imagem no lugar da sua imagem" }
      : c.layout === "narrador-canto"
        ? { icone: "janela", rotulo: `Você em janela sobre o ${midia}` }
        : c.layout === "pip-terco"
          ? { icone: "janela", rotulo: `Você em janela, com ${ehVideo ? "o vídeo" : "a imagem"} ao lado` }
          : c.layout === "tela-dividida"
            ? { icone: "dividida", rotulo: `Tela dividida: você e ${ehVideo ? "o vídeo" : "a imagem"}` }
            : c.layout === "cartela"
              ? { icone: "cartela", rotulo: "Tela de texto, sem você (sua voz continua)" }
              : c.layout === "narrador-recortado"
                ? { icone: "recorte", rotulo: "Você recortado sobre a cor da marca" }
                : c.layout === "narrador-na-foto"
                  ? { icone: "pessoa-elemento", rotulo: "Você dentro de uma foto, com recortes em volta" }
                  : c.elementos.length
                    ? { icone: "pessoa-elemento", rotulo: "Você em tela cheia, com elemento ao lado" }
                    : { icone: "pessoa", rotulo: "Você em tela cheia" };
  const entra: PecaDaCena[] = [];
  if (principal && principal.tipo !== "icone") {
    const ideia = principal.doCliente ? principal.descricao : principal.resumo ?? "";
    entra.push({ icone: ehVideo ? "video" : "imagem", rotulo: `${ehVideo ? "Cena de cinema gerada" : "Imagem gerada"}${ideia ? `: ${ideia.slice(0, 90)}` : ""}` });
  }
  const aspas = (t: string) => `“${t}”`;
  for (const e of c.elementos) {
    if (e.tipo === "recorte") {
      const a = plano.assets.find((x) => x.id === e.asset);
      entra.push(a?.tipo === "icone" ? { icone: "logo", rotulo: `Logo de ${a.descricao}` } : { icone: "imagem", rotulo: `Objeto recortado${a?.resumo ? `: ${a.resumo.slice(0, 60)}` : ""}` });
    } else if ("texto" in e && typeof e.texto === "string") entra.push({ icone: "texto", rotulo: `Texto na tela: ${aspas(e.texto)}` });
    else if (e.tipo === "numero") entra.push({ icone: "numero", rotulo: `Número na tela: ${e.prefixo ?? ""}${e.valor}${e.sufixo ? ` ${e.sufixo}` : ""}` });
    else if (e.tipo === "icone-pop") entra.push({ icone: "icone", rotulo: `Ícone de ${e.nome.replace(/-/g, " ")}` });
    else if (e.tipo === "barras") entra.push({ icone: "grafico", rotulo: "Gráfico de barras" });
    else if (e.tipo === "seta" || e.tipo === "circulo") entra.push({ icone: "seta", rotulo: e.tipo === "seta" ? "Seta apontando" : "Círculo destacando" });
  }
  const movimento: PecaDaCena =
    c.movimento === "punch"
      ? { icone: "aproximacao", rotulo: "Aproximação rápida na palavra forte" }
      : c.movimento === "zoom-in-lento"
        ? { icone: "aproximacao", rotulo: "Aproximação lenta" }
        : c.movimento === "zoom-out"
          ? { icone: "afastamento", rotulo: "A câmera se afasta" }
          : { icone: "parado", rotulo: "Câmera parada" };
  const transicao: PecaDaCena =
    c.transicao === "deslize"
      ? { icone: "deslize", rotulo: "Entra deslizando" }
      : c.transicao === "flash"
        ? { icone: "flash", rotulo: "Entra com flash" }
        : c.transicao === "fundir"
          ? { icone: "fusao", rotulo: "Entra com fusão suave" }
          : c.transicao === "folha-de-papel"
            ? { icone: "papel", rotulo: "Uma folha de papel passa pela frente" }
            : { icone: "corte", rotulo: "Corte seco" };
  return { tela, entra, movimento, transicao };
}

export function palavrasDaCena(c: CenaDoPlano, palavras: PalavraNoCorte[]): string {
  return palavras
    .slice(c.de, c.ate + 1)
    .map((p) => p.texto)
    .join(" ");
}

export function tempoDaCena(c: CenaDoPlano, palavras: PalavraNoCorte[], duracao: number): { inicio: number; fim: number } {
  const a = palavras[c.de];
  const proxima = palavras[c.ate + 1];
  return { inicio: a ? a.inicio : 0, fim: proxima ? proxima.inicio : duracao };
}

/** A cena inteira em português, com o que a tela oferece para ela. */
export function cenaNaTela(
  plano: PlanoDeMontagem,
  indice: number,
  fala: FalaDoTrecho,
  familia: Familia,
  planoOriginal?: PlanoDeMontagem | null
): CenaNaTela {
  const c = plano.cenas[indice];
  const { inicio, fim } = tempoDaCena(c, fala.palavras, fala.duracao);
  const partes: string[] = [];
  const principal = c.asset ? plano.assets.find((a) => a.id === c.asset) : undefined;
  // O vídeo gerado em tela cheia é "o vídeo", e não "a imagem" (02/10).
  const ehVideo = principal?.tipo === "cena-em-movimento" || principal?.tipo === "cena-do-narrador";
  partes.push(c.layout === "broll-cheio" && ehVideo ? "o vídeo em tela cheia, sem você (sua voz continua)" : LAYOUT[c.layout] ?? c.layout);
  if (principal) partes.push(ideiaDoAsset(principal, familia));
  const elementos = c.elementos.map((e) => textoDoElemento(e, plano.assets, familia)).filter(Boolean);
  if (elementos.length) partes.push(`na tela: ${elementos.join("; ")}`);
  const mov = MOVIMENTO[c.movimento];
  if (mov) partes.push(mov);
  return {
    indice,
    inicio,
    fim,
    fala: palavrasDaCena(c, fala.palavras),
    descricao: partes.join(", "),
    porque: c.motivo,
    transicao: TRANSICAO[c.transicao] ?? c.transicao,
    efeito: cenaTemEfeito(c),
    ajuste: c.ajuste ?? null,
    edicao: edicaoDaCena(c, plano),
    temOriginal: Boolean(planoOriginal && originalDaCena(planoOriginal, c)),
    pedidoDaImagem:
      principal && !principal.resumo && !principal.doCliente && principal.tipo !== "icone" ? principal.descricao.slice(0, 220) : null,
    pedido: c.pedido ? { texto: c.pedido.texto, atendido: c.pedido.atendido, motivo: c.pedido.motivo ?? null } : null,
    visual: edicaoVisual(c, plano),
  };
}

/** A cena do plano original que cobre esta (mesmo começo), para desfazer. */
export function originalDaCena(original: PlanoDeMontagem, c: CenaDoPlano): CenaDoPlano | null {
  if (!c.ajuste) return null;
  return original.cenas.find((o) => o.de <= c.de && o.ate >= c.de) ?? null;
}

// ─────────────────────────────── ajustes (puros) ───────────────────────────────

const clonar = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** Tira o efeito: você em tela cheia, parado, sem nada por cima. A transição fica. */
export function removerEfeito(plano: PlanoDeMontagem, indice: number): PlanoDeMontagem {
  const p = clonar(plano);
  const c = p.cenas[indice];
  if (!c) return p;
  p.cenas[indice] = { ...c, layout: "narrador-cheio", movimento: "estatico", movimentoNa: undefined, asset: undefined, elementos: [], ajuste: "removido" };
  return semAssetsSoltos(p);
}

/**
 * O cliente reescreve a ideia. Três casos, conforme o que a cena tem:
 *   - imagem (colagem, cena de cinema, recorte): a descrição passa a ser a
 *     dele; se a mesma imagem aparece em outra cena, esta ganha uma cópia;
 *   - só texto na tela: o texto passa a ser o dele;
 *   - nada (você em tela cheia): a cena ganha uma imagem com a descrição dele,
 *     você no canto (é o "vamos gerar uma imagem de Moisés em cima").
 */
export function editarIdeia(plano: PlanoDeMontagem, indice: number, texto: string): PlanoDeMontagem {
  const p = clonar(plano);
  const c = p.cenas[indice];
  const limpo = texto.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!c || !limpo) return p;
  const asset = assetEditavel(c, p);
  if (asset) {
    const usadoEmOutra = p.cenas.some(
      (o, i) => i !== indice && (o.asset === asset.id || o.elementos.some((e) => e.tipo === "recorte" && e.asset === asset.id))
    );
    let alvo = asset;
    if (usadoEmOutra) {
      alvo = { ...asset, id: `${asset.id}-c${indice}` };
      p.assets.push(alvo);
      if (c.asset === asset.id) c.asset = alvo.id;
      c.elementos = c.elementos.map((e) => (e.tipo === "recorte" && e.asset === asset.id ? { ...e, asset: alvo.id } : e));
    }
    alvo.descricao = limpo;
    alvo.resumo = limpo;
    alvo.doCliente = true;
  } else {
    const t = c.elementos.find((e) => TIPOS_DE_TEXTO.has(e.tipo)) as { texto: string } | undefined;
    if (t) {
      t.texto = limpo.slice(0, 60);
    } else {
      const id = `cli-${indice}-${Math.abs(hash(limpo)) % 100000}`;
      p.assets.push({ id, tipo: "colagem", descricao: limpo, resumo: limpo, ancora: c.de, doCliente: true });
      c.layout = "narrador-canto";
      c.asset = id;
    }
  }
  c.ajuste = "editado";
  return p;
}

/** Troca a cena pelas cenas novas do diretor (índices já no plano inteiro) e junta os assets novos. */
export function trocarCena(plano: PlanoDeMontagem, indice: number, novo: PlanoDeMontagem, prefixo: string): PlanoDeMontagem {
  const p = clonar(plano);
  const c = p.cenas[indice];
  if (!c || !novo.cenas.length) return p;
  const id = (x?: string) => (x ? `${prefixo}-${x}` : x);
  const novosAssets = novo.assets.filter((a) => a.tipo !== "icone").map((a) => ({ ...a, id: id(a.id)!, ancora: typeof a.ancora === "number" ? a.ancora + c.de : a.ancora }));
  // Ícone de marca tem id fixo por marca: reaproveita o que já existe.
  for (const a of novo.assets.filter((a) => a.tipo === "icone")) if (!p.assets.some((x) => x.id === a.id)) p.assets.push(a);
  const icone = (x?: string) => (x && x.startsWith("icone-") ? x : id(x));
  const cenas: CenaDoPlano[] = novo.cenas.map((n) => ({
    ...n,
    de: n.de + c.de,
    ate: n.ate + c.de,
    movimentoNa: typeof n.movimentoNa === "number" ? n.movimentoNa + c.de : undefined,
    asset: icone(n.asset),
    elementos: n.elementos.map((e) => ({ ...e, palavra: e.palavra + c.de, ...(e.tipo === "recorte" ? { asset: icone(e.asset)! } : {}) })) as CenaDoPlano["elementos"],
    ajuste: "nova-ideia" as const,
  }));
  // A cobertura da fala continua sem buraco: a primeira nova começa onde a
  // antiga começava e a última termina onde ela terminava.
  cenas[0].de = c.de;
  cenas[cenas.length - 1].ate = c.ate;
  p.cenas.splice(indice, 1, ...cenas);
  p.assets.push(...novosAssets);
  return semAssetsSoltos(p);
}

/** Desfaz: a cena volta a ser a do diretor (com os assets dela). */
export function restaurarCena(plano: PlanoDeMontagem, indice: number, original: PlanoDeMontagem): PlanoDeMontagem {
  const p = clonar(plano);
  const c = p.cenas[indice];
  const o = c ? originalDaCena(original, c) : null;
  if (!c || !o) return p;
  // Tira todas as cenas de hoje que caem dentro da faixa original e põe a original.
  const dentro = p.cenas.map((x, i) => ({ x, i })).filter(({ x }) => x.de >= o.de && x.ate <= o.ate).map(({ i }) => i);
  if (!dentro.length) return p;
  const volta = clonar(o);
  delete volta.ajuste;
  p.cenas.splice(dentro[0], dentro.length, volta);
  for (const id of [volta.asset, ...volta.elementos.map((e) => (e.tipo === "recorte" ? e.asset : undefined))]) {
    if (!id || p.assets.some((a) => a.id === id)) continue;
    const a = original.assets.find((x) => x.id === id);
    if (a) p.assets.push(clonar(a));
  }
  return semAssetsSoltos(p);
}

/** Asset que nenhuma cena usa sai do plano: não se paga imagem que não vai ao ar. */
export function semAssetsSoltos(p: PlanoDeMontagem): PlanoDeMontagem {
  const usados = new Set<string>();
  for (const c of p.cenas) {
    if (c.asset) usados.add(c.asset);
    for (const e of c.elementos) if (e.tipo === "recorte") usados.add(e.asset);
  }
  return { ...p, assets: p.assets.filter((a) => usados.has(a.id)) };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ─────────────────────────────── a fala mudou (termos) ───────────────────────────────

const norm = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");

/**
 * Para cada palavra antiga, o índice da mesma palavra na lista nova.
 *
 * Existe para dois momentos em que a fala muda de lista sem mudar de conteúdo:
 * o cliente corrige um termo ("arete com" vira "Areticon" e duas palavras
 * viram uma) e o completo aprovado, que depois do corte é transcrito de novo
 * pelo próprio arquivo (o tempo de cada palavra desliza alguns centésimos por
 * emenda, e em 20 minutos isso soma segundos). Por isso o alinhamento é por
 * SEQUÊNCIA e texto, numa janela curta à frente, e nunca só por tempo.
 */
export function mapaDePalavras(antigas: PalavraNoCorte[], novas: PalavraNoCorte[]): number[] {
  const mapa: number[] = [];
  let j = 0;
  for (let i = 0; i < antigas.length; i++) {
    const alvo = norm(antigas[i].texto);
    let achou = -1;
    for (let k = j; k < Math.min(novas.length, j + 12); k++) {
      const n = norm(novas[k].texto);
      if (n === alvo || (alvo.length > 3 && (n.startsWith(alvo) || alvo.startsWith(n)) && n.length > 2)) {
        achou = k;
        break;
      }
    }
    if (achou >= 0) {
      mapa.push(achou);
      j = achou + 1;
    } else {
      mapa.push(Math.min(j, Math.max(0, novas.length - 1)));
    }
  }
  return mapa;
}

/** O plano com os índices levados para a fala nova, sem buraco e sem cena vazia. */
export function remapearPlano(plano: PlanoDeMontagem, antigas: PalavraNoCorte[], novas: PalavraNoCorte[]): PlanoDeMontagem {
  if (!novas.length) return plano;
  const mapa = mapaDePalavras(antigas, novas);
  const m = (i: number) => mapa[Math.max(0, Math.min(mapa.length - 1, i))] ?? 0;
  const ultima = novas.length - 1;
  let cenas = plano.cenas.map((c) => ({
    ...c,
    de: m(c.de),
    ate: m(c.ate),
    movimentoNa: typeof c.movimentoNa === "number" ? m(c.movimentoNa) : undefined,
    elementos: c.elementos.map((e) => ({ ...e, palavra: m(e.palavra) })) as CenaDoPlano["elementos"],
  }));
  if (!cenas.length) return plano;
  cenas[0].de = 0;
  for (let i = 1; i < cenas.length; i++) cenas[i].de = Math.max(cenas[i].de, cenas[i - 1].de + 1);
  for (let i = 0; i < cenas.length - 1; i++) cenas[i].ate = cenas[i + 1].de - 1;
  cenas[cenas.length - 1].ate = ultima;
  cenas = cenas.filter((c) => c.de <= c.ate && c.de <= ultima);
  const assets = plano.assets.map((a) => (typeof a.ancora === "number" ? { ...a, ancora: m(a.ancora) } : a));
  return { ...plano, cenas, assets };
}

// ─────────────────────────────── a tela inteira ───────────────────────────────

export type CorteNaTela = {
  indice: number;
  titulo: string;
  motivo: string;
  ideia: string;
  nota: number | null;
  /** Tempo da gravação. */
  inicio: number;
  fim: number;
  /** Duração depois da limpeza (o que vai ao ar). */
  duracao: number;
  texto: string;
  cenas: CenaNaTela[] | null;
  /** Por que não há cenas (fora dos cortes planejados, sem montagem, falha). */
  semCenas: string | null;
  /** A frase que abre o corte (01/10), no tempo do corte. */
  gancho?: GanchoNaTela | null;
  /** O que o revisor fez no plano antes de o cliente ver (01/10), em uma frase. */
  revisado?: string | null;
};

/** A revisão em uma frase para a tela (01/10): o cliente vê que alguém conferiu. */
export function revisaoNaTela(r: ResumoDaRevisao | null | undefined): string | null {
  if (!r) return null;
  if (r.resultado === "corrigido") return `O editor-chefe conferiu este plano contra o estilo e a sua fala, e refez ${r.corrigidas === 1 ? "1 cena" : `${r.corrigidas} cenas`} antes de te mostrar.`;
  if (r.resultado === "aprovado") return "O editor-chefe conferiu este plano contra o estilo e a sua fala, sem nada a refazer.";
  return null;
}

export type CompletoNaTela = {
  duracao: number;
  insercoes: CenaNaTela[];
  cenas: number;
  semCenas: string | null;
  /** A abertura com os melhores momentos (01/10). */
  abertura?: AberturaNaTela | null;
  /** As faixas de tela compartilhada no tempo do completo, para o cliente conferir. */
  telas?: Array<{ inicio: number; fim: number; mostra: string[] }>;
  /** Inserções por minuto do plano (a cobertura de ponta a ponta, 01/10). */
  porMinuto?: number[];
};

export type TelaDeRoteiro = {
  videoId: string;
  projectId: string;
  nome: string;
  status: string;
  familia: Familia;
  tema: string | null;
  resumo: string | null;
  teses: Array<{ minuto: string; frase: string }>;
  diagnostico: string | null;
  termos: string;
  trocas: Array<{ errado: string; certo: string }>;
  cortes: CorteNaTela[];
  completo: CompletoNaTela | null;
  duracaoSec: number;
  creditos: {
    /** Já pago na primeira parte. */
    roteiro: number;
    porCorte: number;
    completo: number;
    /** A abertura com os melhores momentos do completo (01/10); 0 quando desligada. */
    abertura?: number;
    novaIdeia: number;
    saldo: number | null;
    /** Admin (acesso interno): o extrato registra e o saldo não se move. */
    interno: boolean;
  };
  maxCortes: number;
  aprovadoEm: string | null;
  escolhidos: number[];
  /**
   * O vídeo já é curto (até 90 s, 02/10): a tela sugere publicar ele inteiro,
   * sem cortes, e nada vem marcado. Aprovar com zero cortes vale.
   */
  videoCurto?: boolean;
  /** "Voltar à edição" de um vídeo já aprovado (30/09): ver lib/media/reedicao.ts. */
  reedicao?: ReedicaoNaTela | null;
};

export type ReedicaoNaTela = {
  /** O cliente reabriu a edição e está mexendo (nada no ar muda até ele mandar refazer). */
  aberta: boolean;
  /** Dá para reabrir agora: vídeo pronto e nada sendo feito. */
  podeAbrir: boolean;
  /** Por que não dá agora, em português. */
  motivo: string | null;
  /** O que mudou em relação ao que está no ar, uma linha por peça. */
  mudancas: string[];
  /** Créditos do que será GERADO de novo (imagem, cena); refazer o corte e a montagem não cobra. */
  creditos: number;
  /** O que será gerado, em português ("1 imagem nova"), ou null. */
  geracao: string | null;
  /**
   * O projeto mudou de estilo depois que estes cortes foram planejados (01/10):
   * a tela oferece "Replanejar no estilo novo". Índices em `clips`.
   */
  estiloNovo?: { nome: string; cortes: number[] } | null;
};

type TrechoCru = {
  titulo?: string;
  motivo?: string;
  ideia?: string;
  nota?: number;
  inicio: number;
  fim: number;
  transcricao?: string;
  publicar?: boolean;
  roteiro?: RoteiroDoCorte | null;
};

export function cortesNaTela(trechos: TrechoCru[], familia: Familia, montagemLigada: boolean): CorteNaTela[] {
  return trechos.map((t, indice) => {
    const r = t.roteiro;
    const plano = r?.plano ?? null;
    const cenas = plano && r ? plano.cenas.map((_, i) => cenaNaTela(plano, i, r.fala, familia, r.planoOriginal)) : null;
    return {
      indice,
      titulo: t.titulo ?? `Corte ${indice + 1}`,
      motivo: t.motivo ?? "",
      ideia: t.ideia ?? "",
      nota: typeof t.nota === "number" ? t.nota : null,
      inicio: r?.inicio ?? t.inicio,
      fim: r?.fim ?? t.fim,
      duracao: r?.fala.duracao ?? t.fim - t.inicio,
      texto: r?.texto ?? t.transcricao ?? "",
      cenas,
      gancho: ganchoNaTela(r?.gancho),
      revisado: revisaoNaTela(r?.revisao),
      semCenas: cenas
        ? null
        : !montagemLigada
          ? "Este corte sai com a edição de fala e a legenda na sua linguagem, sem cenas geradas."
          : r?.erro
            ? `Não consegui planejar as cenas deste corte agora (${r.erro}). Se você escolher, o squad planeja depois da aprovação.`
            : "Planejamos as cenas dos cortes mais fortes. Se você escolher este, o squad planeja as cenas dele depois da aprovação.",
    };
  });
}

export function completoNaTela(
  c: RoteiroDoCompleto | null | undefined,
  familia: Familia,
  montagemLigada: boolean,
  duracaoSec: number,
  extra: { abertura?: AberturaDoCompleto | null; telas?: Array<{ inicio: number; fim: number; mostra: string[] }> } = {}
): CompletoNaTela {
  const abertura = aberturaNaTela(extra.abertura);
  if (!c?.plano) {
    return {
      duracao: c?.fala.duracao ?? duracaoSec,
      insercoes: [],
      cenas: 0,
      semCenas: !montagemLigada
        ? "O vídeo completo sai com a edição de fala (pausas e muletas fora), sem inserções geradas."
        : c?.erro
          ? `Não consegui planejar as inserções do completo agora (${c.erro}).`
          : "O vídeo completo sai com a edição de fala; as inserções são planejadas depois da aprovação.",
      abertura,
      telas: extra.telas,
    };
  }
  const plano = c.plano;
  const insercoes = plano.cenas
    .map((cena, i) => ({ cena, i }))
    .filter(({ cena }) => cenaEhInsercao(cena) || cena.ajuste === "removido")
    .map(({ i }) => cenaNaTela(plano, i, c.fala, familia, c.planoOriginal));
  // Inserções por minuto: o cliente vê que o vídeo está coberto do começo ao fim.
  const minutos = Math.max(1, Math.ceil(c.fala.duracao / 60));
  const porMinuto = Array.from({ length: minutos }, () => 0);
  for (const x of insercoes) if (x.efeito) porMinuto[Math.min(minutos - 1, Math.floor(x.inicio / 60))]++;
  return { duracao: c.fala.duracao, insercoes, cenas: plano.cenas.length, semCenas: null, abertura, telas: extra.telas, porMinuto };
}
