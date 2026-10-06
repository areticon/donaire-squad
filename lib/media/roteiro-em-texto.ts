import type { EstadoDaJornada } from "@/lib/media/jornada/estado";
import type { JornadaNaTela } from "@/lib/media/jornada/tela";
import type { CenaDoPlano, ElementoDoPlano, PalavraNoCorte, PlanoDeMontagem, AssetDoPlano, Formato } from "@/lib/media/plano-de-montagem";
import { aberturaNaTela, ganchoNaTela, type AberturaDoCompleto, type AberturaNaTela, type GanchoDoCorte, type GanchoNaTela } from "@/lib/media/abertura-do-roteiro";
import type { TelasDaGravacao } from "@/lib/media/faixas-de-tela";
import type { ResumoDaRevisao } from "@/lib/media/revisao-tipos";
import type { PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
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
  /**
   * AS SUGESTÕES DO CLIENTE CENA A CENA NO CORTE (06/10): o mesmo campo do
   * completo, no tempo da fala deste corte. O pedido numa cena é lei: a
   * montagem o leva para a fala do corte pronto e o editor por comando o
   * atende naquele momento (ver lib/media/editor-por-comando/pedido-do-cliente.ts).
   */
  sugestoes?: SugestaoDaCena[];
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
  /**
   * AS SUGESTÕES DO CLIENTE CENA A CENA (05/10, pedido do Bruno: "preciso ver
   * cena a cena para analisar e sugerir efeitos"). Texto curto, sem IA e sem
   * custo, guardado aqui e lido pelo diretor na montagem: no editor por
   * comando entra como instrução obrigatória do trecho; no caminho antigo vai
   * ao diretor de bloco (quando o completo é dirigido na montagem) e preenche
   * o "Outra ideia" da cena. Ver lib/media/sugestoes-do-completo.ts.
   */
  sugestoes?: SugestaoDaCena[];
  /**
   * O PLANO DO EDITOR POR COMANDO (05/10, à tarde), escrito no roteiro: o JEV
   * decide as peças e o redator escreve os textos, com as âncoras na fala do
   * completo (`fala`). A montagem leva este plano para a fala transcrita do
   * arquivo pronto e não decide de novo. `plano` (cena a cena antigo) fica
   * null quando este existe; a tela mostra os trechos da fala com as peças.
   */
  comando?: {
    texto: string;
    base: string;
    plano: PlanoDoDiretor | null;
    feitoEm: string;
    erro?: string | null;
    tempos?: Record<string, number>;
    avisos?: string[];
  } | null;
};

/** Uma sugestão do cliente num trecho do completo, no tempo da fala do roteiro. */
export type SugestaoDaCena = {
  /** Índices de palavra na fala do completo (inclusivos): sobrevivem ao alinhamento com a fala da montagem. */
  de: number;
  ate: number;
  inicio: number;
  fim: number;
  /** A fala do trecho quando o cliente sugeriu (o diretor lê; a tela confere). */
  fala: string;
  texto: string;
  em: string;
};

/** A sugestão já levada para a fala de quem vai montar (o diretor lê o tempo e a fala de lá). */
export type PedidoDaCena = { inicio: number; fim: number; fala: string; texto: string };

/**
 * As sugestões no tempo de OUTRA fala (a transcrição do completo pronto, na
 * montagem): alinhamento por sequência de palavras, o mesmo do plano
 * (`mapaDePalavras`). Sem fala de origem, valem os tempos gravados.
 */
export function sugestoesNaFala(sugestoes: SugestaoDaCena[] | null | undefined, origem: PalavraNoCorte[] | null | undefined, alvo: PalavraNoCorte[]): PedidoDaCena[] {
  const lista = (sugestoes ?? []).filter((s) => s.texto.trim());
  if (!lista.length) return [];
  if (!origem?.length || !alvo.length) return lista.map((s) => ({ inicio: s.inicio, fim: s.fim, fala: s.fala, texto: s.texto }));
  const mapa = mapaDePalavras(origem, alvo);
  const m = (i: number) => mapa[Math.max(0, Math.min(mapa.length - 1, i))] ?? 0;
  return lista.map((s) => {
    const de = m(s.de);
    const ate = Math.max(de, m(s.ate));
    return { inicio: alvo[de]?.inicio ?? s.inicio, fim: alvo[ate]?.fim ?? s.fim, fala: s.fala, texto: s.texto };
  });
}

/** A sugestão que cobre um trecho (metade do menor dos dois intervalos, no mínimo). */
export function sugestaoDoTrecho(sugestoes: SugestaoDaCena[] | null | undefined, inicio: number, fim: number): SugestaoDaCena | null {
  let melhor: SugestaoDaCena | null = null;
  let maior = 0;
  for (const s of sugestoes ?? []) {
    const d = Math.min(fim, s.fim) - Math.max(inicio, s.inicio);
    const menor = Math.max(0.2, Math.min(fim - inicio, s.fim - s.inicio));
    if (d > maior && d >= menor * 0.5) {
      maior = d;
      melhor = s;
    }
  }
  return melhor;
}

/**
 * OS TRECHOS DA FALA sem plano (o completo cuja edição é escrita depois da
 * aprovação, ou o plano que falhou): frases inteiras (ponto final, pausa de
 * 0,7 s ou 28 palavras) juntas em trechos de 12 a 25 s, para o cliente ler
 * e sugerir efeito mesmo sem cena planejada.
 */
export function trechosDaFala(palavras: PalavraNoCorte[], duracao: number): Array<{ de: number; ate: number; inicio: number; fim: number; fala: string }> {
  const frases: Array<{ de: number; ate: number }> = [];
  let de = 0;
  for (let i = 0; i < palavras.length; i++) {
    const pausa = i + 1 < palavras.length ? palavras[i + 1].inicio - palavras[i].fim : Infinity;
    const fecha = i === palavras.length - 1 || /[.!?…]["”]?$/.test(palavras[i].texto) || pausa >= 0.7 || i - de + 1 >= 28;
    if (!fecha) continue;
    frases.push({ de, ate: i });
    de = i + 1;
  }
  const saida: Array<{ de: number; ate: number; inicio: number; fim: number; fala: string }> = [];
  let atual: { de: number; ate: number } | null = null;
  const fechar = () => {
    if (!atual) return;
    const proxima = palavras[atual.ate + 1];
    saida.push({ de: atual.de, ate: atual.ate, inicio: palavras[atual.de].inicio, fim: proxima ? proxima.inicio : duracao, fala: palavras.slice(atual.de, atual.ate + 1).map((p) => p.texto).join(" ") });
    atual = null;
  };
  for (const f of frases) {
    if (!atual) {
      atual = { ...f };
      continue;
    }
    const dur = palavras[f.ate].fim - palavras[atual.de].inicio;
    if (dur > 25 || palavras[atual.ate].fim - palavras[atual.de].inicio >= 12) fechar();
    if (!atual) atual = { ...f };
    else atual.ate = f.ate;
  }
  fechar();
  if (saida.length) saida[0].inicio = 0;
  return saida;
}

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
  /**
   * As retomadas (tomada errada seguida da refeita, 03/10) já estão nas
   * `remocoes`. Roteiro sem a marca é de antes da correção: quem o usa aplica
   * as retomadas por cima (`garantirRetomadasNoRoteiro`).
   */
  retomadasFeitas?: boolean;
  completo: RoteiroDoCompleto | null;
  /** Índices (em `clips`) dos cortes que o diretor planejou. */
  cortesPlanejados: number[];
  /** Custo de IA desta etapa, para o relatório. */
  custoUsd?: number;
  aprovadoEm?: string | null;
  /**
   * A decisão gravada na aprovação (06/10): os índices aprovados (no `clips`
   * de antes da aprovação) e a marca de "só o vídeo completo". Com
   * `soCompleto`, nenhum passo escolhe, corta ou põe corte no quadro
   * (lib/media/decisao-dos-cortes.ts).
   */
  cortesAprovados?: number[];
  soCompleto?: boolean;
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
  /**
   * A JORNADA OFICIAL DO EDITOR (06/10, lib/media/jornada, EDITOR_JORNADA=1):
   * a leitura do vídeo antes do plano, o plano por elemento (ideias do Sonnet,
   * decisões do JEV), as revisões do cliente e a aprovação que congela.
   */
  jornada?: EstadoDaJornada | null;
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
  /**
   * O CORTE CENA A CENA SEM PLANO (06/10, editor por comando): os trechos da
   * fala do corte, cada um com o campo "sugerir ajuste ou efeito". O pedido
   * numa cena é lei na montagem.
   */
  trechos?: TrechoDoCompletoNaTela[];
  sugestoes?: number;
};

/** A revisão em uma frase para a tela (01/10): o cliente vê que alguém conferiu. */
export function revisaoNaTela(r: ResumoDaRevisao | null | undefined): string | null {
  if (!r) return null;
  if (r.resultado === "corrigido") return `O editor-chefe conferiu este plano contra o estilo e a sua fala, e refez ${r.corrigidas === 1 ? "1 cena" : `${r.corrigidas} cenas`} antes de te mostrar.`;
  if (r.resultado === "aprovado") return "O editor-chefe conferiu este plano contra o estilo e a sua fala, sem nada a refazer.";
  return null;
}

/**
 * UM TRECHO DO COMPLETO, CENA A CENA (05/10): o tempo, a fala exata daquele
 * pedaço, a cena planejada (com as peças) quando há plano, e a sugestão que
 * o cliente deixou. Sem plano, os trechos são frases da fala.
 */
export type TrechoDoCompletoNaTela = {
  indice: number;
  de: number;
  ate: number;
  inicio: number;
  fim: number;
  fala: string;
  /** A cena planejada neste trecho; null quando a edição é escrita depois da aprovação. */
  cena: CenaNaTela | null;
  sugestao: string | null;
  /** As peças do editor por comando que entram neste trecho (05/10): o nome em português e o texto escrito. */
  pecas?: PecaDoComandoNaTela[];
};

/**
 * Um trecho do cena a cena "tem efeito" quando tem cena com efeito, peça do
 * editor por comando ou sugestão do cliente (06/10). Antes só a cena do plano
 * antigo e a sugestão contavam: no editor por comando (cena sempre null) um
 * vídeo longo com uma sugestão abria filtrado só nela, e as peças sumiam.
 */
export function trechoComEfeito(t: Pick<TrechoDoCompletoNaTela, "cena" | "sugestao" | "pecas">): boolean {
  return Boolean(t.cena?.efeito || t.sugestao || t.pecas?.length);
}

/** A lista do cena a cena do completo: filtrada nas cenas com efeito só num vídeo longo e quando o cliente não pediu todas. */
export function listaDoCenaACena<T extends Pick<TrechoDoCompletoNaTela, "cena" | "sugestao" | "pecas">>(trechos: T[], todas: boolean | null): { lista: T[]; longo: boolean; comEfeito: number } {
  const comEfeito = trechos.filter(trechoComEfeito);
  const longo = trechos.length > 24 && comEfeito.length > 0 && comEfeito.length < trechos.length;
  const verTodas = todas ?? !longo;
  return { lista: verTodas || !longo ? trechos : comEfeito, longo, comEfeito: comEfeito.length };
}

/**
 * UMA PEÇA DO EDITOR POR COMANDO NA LINHA QUE O CLIENTE APROVA (06/10; regra
 * do Bruno: "se a linha do roteiro que ele aprovou dizia 'letra vermelha' e
 * ele reclama depois que queria rosa, o erro é dele"). A linha diz o tipo, o
 * que aparece (em português, escrito pelo redator), a cor quando não é a da
 * marca, onde fica, e o pedido do cliente quando a peça nasceu dele.
 */
export type PecaDoComandoNaTela = {
  peca: string;
  rotulo: string;
  texto: string;
  inicio: number;
  tela: boolean;
  /** O tipo de elemento como o cliente lê ("imagem", "número animado"). */
  tipo?: string | null;
  /** O que aparece, em português (a cena da imagem, o texto da peça). */
  descricao?: string | null;
  /** A cor usada nesta peça quando NÃO é a da marca ("verde", "#1a73e8"). */
  cor?: string | null;
  /** Onde a peça fica ("no centro da tela", "à direita de você"). */
  onde?: string | null;
  /** O pedido do cliente que gerou a peça, como ele escreveu. */
  pedido?: string | null;
  /** O que a conferência pelo JEV concluiu sobre o pedido. */
  atendido?: "sim" | "nao" | "sem-conferencia" | null;
  motivo?: string | null;
};

/** O lado ou a posição de uma peça em português, pelas props que o plano e o resolvedor escrevem. */
export function ondeDaPeca(props: Record<string, unknown> | null | undefined): string | null {
  const p = props ?? {};
  const pedido = p.pedidoDoCliente && typeof p.pedidoDoCliente === "object" ? (p.pedidoDoCliente as { posicao?: unknown }).posicao : null;
  const v = String(pedido ?? p.posicao ?? p.lado ?? "");
  const MAPA: Record<string, string> = {
    centro: "no centro da tela",
    canto: "no canto",
    "acima-da-cabeca": "acima da sua cabeça",
    "ao-lado": "ao seu lado",
    direita: "à sua direita",
    esquerda: "à sua esquerda",
    topo: "no alto da tela",
    "topo-esquerda": "no canto de cima",
    baixo: "embaixo",
    "esquerda-meio": "à esquerda",
  };
  return MAPA[v] ?? null;
}

export type CompletoNaTela = {
  duracao: number;
  insercoes: CenaNaTela[];
  cenas: number;
  semCenas: string | null;
  /** O completo cena a cena (05/10): toda cena do plano, ou os trechos da fala sem plano. */
  trechos?: TrechoDoCompletoNaTela[];
  /** Quantas sugestões o cliente deixou. */
  sugestoes?: number;
  /** A abertura com os melhores momentos (01/10). */
  abertura?: AberturaNaTela | null;
  /** As faixas de tela compartilhada no tempo do completo, para o cliente conferir. */
  telas?: Array<{ inicio: number; fim: number; mostra: string[] }>;
  /** Inserções por minuto do plano (a cobertura de ponta a ponta, 01/10). */
  porMinuto?: number[];
  /**
   * O EDITOR POR COMANDO EM DOIS EIXOS (05/10, noite): a linguagem visual
   * escolhida, os elementos por tipo e a ESTIMATIVA de custo das imagens e
   * vídeos da Higgsfield (preço da tabela), mostrada antes de gerar.
   */
  comando?: {
    linguagem: string | null;
    porTipo: Array<{ tipo: string; nome: string; n: number }>;
    custo: { usd: number; usdPorMinuto: number; tetoUsdPorMinuto: number; imagens: number; videos: number; segundosDeVideo: number } | null;
  };
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
  /** A JORNADA OFICIAL (EDITOR_JORNADA=1): o plano por elemento do completo, para aprovar ou revisar. */
  jornada?: JornadaNaTela | null;
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
    // O CORTE CENA A CENA SEM PLANO (06/10): os trechos da fala do corte, com a sugestão do cliente em cada um.
    const palavras = r?.fala?.palavras ?? [];
    const trechosDoCorte: TrechoDoCompletoNaTela[] | undefined =
      !cenas && montagemLigada && palavras.length
        ? trechosDaFala(palavras, r!.fala.duracao).map((x, i) => ({ indice: i, ...x, cena: null, sugestao: sugestaoDoTrecho(r?.sugestoes, x.inicio, x.fim)?.texto ?? null }))
        : undefined;
    const sugestoes = (r?.sugestoes ?? []).filter((s) => s.texto.trim()).length;
    return {
      ...(trechosDoCorte ? { trechos: trechosDoCorte, sugestoes } : {}),
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
            : trechosDoCorte
              ? "A edição deste corte é escrita pelo editor depois da aprovação, pelo comando do projeto. Abaixo, a fala cena a cena: o que você pedir numa cena é feito naquela cena."
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
  const sugestoes = (c?.sugestoes ?? []).filter((s) => s.texto.trim()).length;
  if (!c?.plano) {
    // Sem plano, o cena a cena são os trechos da fala (05/10): o cliente lê e sugere mesmo assim.
    const palavras = c?.fala?.palavras ?? [];
    const trechos: TrechoDoCompletoNaTela[] = palavras.length
      ? trechosDaFala(palavras, c!.fala.duracao).map((t, indice) => ({ indice, ...t, cena: null, sugestao: sugestaoDoTrecho(c?.sugestoes, t.inicio, t.fim)?.texto ?? null }))
      : [];
    return {
      duracao: c?.fala.duracao ?? duracaoSec,
      insercoes: [],
      cenas: 0,
      semCenas: !montagemLigada
        ? "O vídeo completo sai com a edição de fala (pausas e muletas fora), sem inserções geradas."
        : c?.comando?.plano
          ? null
          : c?.erro
            ? `Não consegui planejar as inserções do completo agora (${c.erro}).`
            : c?.comando?.erro
              ? `Não consegui escrever a composição do completo agora (${c.comando.erro}).`
              : "O vídeo completo sai com a edição de fala; as inserções são planejadas depois da aprovação.",
      abertura,
      telas: extra.telas,
      trechos,
      sugestoes,
    };
  }
  const plano = c.plano;
  const todas = plano.cenas.map((_, i) => cenaNaTela(plano, i, c.fala, familia, c.planoOriginal));
  const insercoes = todas.filter((x, i) => cenaEhInsercao(plano.cenas[i]) || plano.cenas[i].ajuste === "removido");
  // O cena a cena (05/10): TODA cena do plano, com a fala e a sugestão do cliente.
  const trechos: TrechoDoCompletoNaTela[] = todas.map((cena, i) => ({
    indice: i,
    de: plano.cenas[i].de,
    ate: plano.cenas[i].ate,
    inicio: cena.inicio,
    fim: cena.fim,
    fala: cena.fala,
    cena,
    sugestao: sugestaoDoTrecho(c.sugestoes, cena.inicio, cena.fim)?.texto ?? null,
  }));
  // Inserções por minuto: o cliente vê que o vídeo está coberto do começo ao fim.
  const minutos = Math.max(1, Math.ceil(c.fala.duracao / 60));
  const porMinuto = Array.from({ length: minutos }, () => 0);
  for (const x of insercoes) if (x.efeito) porMinuto[Math.min(minutos - 1, Math.floor(x.inicio / 60))]++;
  return { duracao: c.fala.duracao, insercoes, cenas: plano.cenas.length, semCenas: null, abertura, telas: extra.telas, porMinuto, trechos, sugestoes };
}

// ─────────────────────────────── o plano aprovado em linhas ───────────────────────────────

/** Uma peça do editor por comando na linha que o cliente leu: "imagem em janela: bola de futebol, cor verde, no centro (pedido seu: ...)". */
function linhaDaPeca(p: PecaDoComandoNaTela): string {
  const partes = [p.tipo ?? p.rotulo, p.descricao || p.texto || "", p.cor ? `cor ${p.cor}` : "", p.onde ?? ""].filter((x) => x && x.trim());
  const pedido = p.pedido ? ` (pedido seu: "${p.pedido}"${p.atendido === "nao" ? ", conferência disse que não foi atendido" : ""})` : "";
  return `${partes.join(", ")}${pedido}`;
}

/** Uma cena do plano antigo: o que a tela mostra, o que entra e o pedido do cliente nela. */
function linhaDaCena(c: CenaNaTela): string {
  const pedido = c.pedido ? ` (pedido seu: "${c.pedido.texto}", ${c.pedido.atendido === "sim" ? "atendido" : c.pedido.atendido === "parcial" ? "atendido em parte" : "não atendido"})` : "";
  return `${c.descricao}${c.ajuste === "removido" ? " [efeito removido pelo cliente]" : ""}${pedido}`;
}

/**
 * O PLANO DO VÍDEO QUE O CLIENTE APROVOU, EM LINHAS (06/10): o mesmo texto da
 * tela de roteiro, "0:05 a 0:09: ...", para o feedback do Dev saber o que a
 * linha aprovada dizia ("a letra saiu vermelha" contra "a linha dizia
 * vermelho"). Só os trechos com peça ou cena com efeito, e a sugestão que o
 * cliente deixou. Puro: a captura do feedback monta a tela e chama aqui.
 */
export function linhasDoPlanoAprovado(alvo: { trechos?: TrechoDoCompletoNaTela[] | null; cenas?: CenaNaTela[] | null }, teto = 40): string[] {
  const linhas: string[] = [];
  if (alvo.cenas?.length) {
    for (const c of alvo.cenas) {
      if (!c.efeito && !c.pedido && c.ajuste !== "removido") continue;
      linhas.push(`${mmss(c.inicio)} a ${mmss(c.fim)}: ${linhaDaCena(c)}`);
    }
  } else {
    for (const t of alvo.trechos ?? []) {
      const pecas = (t.pecas ?? []).map(linhaDaPeca).filter(Boolean);
      const cena = t.cena && (t.cena.efeito || t.cena.pedido) ? linhaDaCena(t.cena) : "";
      const conteudo = [cena, ...pecas].filter(Boolean);
      if (t.sugestao) conteudo.push(`sugestão do cliente: "${t.sugestao}"`);
      if (!conteudo.length) continue;
      linhas.push(`${mmss(t.inicio)} a ${mmss(t.fim)}: ${conteudo.join("; ")}`);
    }
  }
  return linhas.slice(0, teto);
}
