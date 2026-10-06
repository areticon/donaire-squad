import type { Jev } from "@/lib/media/jornada/decisoes";
import { CRITERIO_DO_FORMATO, custoDoElementoDaJornada, midiaDoFormato } from "@/lib/media/jornada/decisoes";
import { textoPermitido, type Redator } from "@/lib/media/jornada/ideias";
import { primeiroJson } from "@/lib/media/jornada/json";
import type { Frase, Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { FORMATOS_DA_JORNADA, semTravessao, type ElementoAprovado, type ElementoProposto, type EstadoDaJornada, type FormatoDaJornada, type RevisaoDoElemento } from "@/lib/media/jornada/estado";

/**
 * O PASSO 5 DA JORNADA (E3): o usuário aprova ou revisa, ELEMENTO A ELEMENTO.
 *
 * Pedido em texto livre ("troque a Ferrari vermelha por uma preta"): o JEV
 * decide a INTENÇÃO (mudar o conteúdo, mudar o tempo, remover, mudar o
 * formato); o Sonnet reescreve só a descrição daquele elemento (uma chamada
 * curta); o código aplica o que não é texto. A descrição nova aparece na tela
 * ANTES de aprovar. O pedido fica gravado, literal, por id.
 *
 * APROVAR CONGELA: o que vai ao ar é exatamente a lista aprovada. Nenhum
 * passo depois acrescenta, tira ou troca elemento.
 */

export class PlanoCongelado extends Error {
  constructor() {
    super("O plano já foi aprovado e está congelado: nada muda na lista de elementos.");
  }
}

export type DependenciasDaRevisao = { jev: Jev; redator: Redator; projectId?: string | null; agora?: () => string };

const agoraDe = (d: DependenciasDaRevisao) => (d.agora ? d.agora() : new Date().toISOString());

const INTENCOES = { conteudo: "mudar o que aparece no elemento (objeto, cor, cena, texto)", tempo: "mudar quando o elemento entra (outra palavra, mais cedo, mais tarde)", remover: "tirar o elemento do vídeo", formato: "mudar como ele entra (tela cheia, janela, recortado sobre a gravação, vídeo)" } as const;
type Intencao = keyof typeof INTENCOES;

const normal = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const SISTEMA_DA_REVISAO = `Você reescreve a descrição de UM elemento visual de um vídeo, atendendo ao pedido do cliente. Mude só o que o pedido pede; o resto da descrição fica. Português do Brasil, uma frase concreta e visual, sem travessão.
Se o pedido muda o texto que a arte deve trazer, escreva o texto novo em "textoNaImagem" (até 5 palavras); senão repita o atual.
Responda só com JSON: {"descricao":"...","textoNaImagem":null}`;

function pedidoDaRevisao(el: ElementoProposto, pedidos: string[]): string {
  return `ELEMENTO ATUAL: ${el.descricao}\nTEXTO NA ARTE ATUAL: ${el.textoNaImagem ? `"${el.textoNaImagem}"` : "nenhum"}\nFALA DO MOMENTO: "${el.momento.frase}"\nPEDIDOS DO CLIENTE, em ordem (o último manda): ${pedidos.map((p) => `"${p}"`).join("; ")}`;
}

function clonar(e: EstadoDaJornada): EstadoDaJornada {
  return JSON.parse(JSON.stringify(e)) as EstadoDaJornada;
}

function revisaoDe(e: EstadoDaJornada, el: ElementoProposto): RevisaoDoElemento {
  return e.revisao[el.id] ?? { id: el.id, acao: "aprovado", pedidos: [], descricaoAprovada: el.descricao, textoNaImagemAprovado: el.textoNaImagem };
}

/** O JEV confere se a descrição nova atende ao pedido (sim ou não). */
async function atende(d: DependenciasDaRevisao, pedido: string, descricao: string): Promise<boolean> {
  try {
    const r = await d.jev({ projectId: d.projectId, etapa: "jornada-revisao-confere", state: { pedido, descricao } }, { a: { type: "noul", instructions: "A descrição do elemento atende ao pedido do cliente?" } });
    const x = r.a;
    return !(x && x.type === "noul" && typeof x.noul === "number" && x.noul < 0.35);
  } catch {
    return true;
  }
}

/**
 * Um pedido de mudança num elemento. Devolve o estado novo (o de entrada não
 * é tocado). Lança `PlanoCongelado` depois da aprovação.
 */
export async function pedirMudanca(estado: EstadoDaJornada, id: string, texto: string, d: DependenciasDaRevisao, ctx: { palavras: Palavra[]; frases: Frase[]; marca?: string | null }): Promise<EstadoDaJornada> {
  if (estado.aprovado) throw new PlanoCongelado();
  const pedido = semTravessao(String(texto ?? "").trim()).slice(0, 500);
  if (!pedido) throw new Error("escreva o pedido");
  const e = clonar(estado);
  const el = e.plano?.elementos.find((x) => x.id === id);
  if (!el) throw new Error("elemento não encontrado");
  const rev = revisaoDe(e, el);
  rev.pedidos.push({ texto: pedido, em: agoraDe(d) });
  // A INTENÇÃO, pelo JEV.
  let intencao: Intencao = "conteudo";
  try {
    const r = await d.jev({ projectId: d.projectId, etapa: "jornada-revisao", state: { elemento: el.descricao, fala: el.momento.frase, formato: el.formato } }, { i: { type: "choice", instructions: { pergunta: "O que o cliente quer com este pedido?", pedido }, criteria: { ...INTENCOES } } });
    const x = r.i;
    if (x && x.type === "choice" && (x.confidence ?? 0) >= 0.4 && x.choice in INTENCOES) intencao = x.choice as Intencao;
  } catch {
    // Sem o JEV, o pedido é tratado como conteúdo (o texto do cliente chega ao Sonnet, nada some).
  }
  if (intencao === "remover") {
    rev.acao = "removido";
    e.revisao[id] = rev;
    return e;
  }
  if (intencao === "tempo") {
    // O código acha, na frase do momento, a palavra que o pedido cita.
    const termos = new Set(normal(pedido).split(" ").filter((w) => w.length >= 3));
    const f = ctx.frases.find((x) => x.indice === el.momento.indice);
    if (f) {
      for (let k = f.de; k <= f.ate; k++) {
        if (termos.has(normal(ctx.palavras[k].texto))) {
          el.gatilho = { palavra: ctx.palavras[k].texto.replace(/[.,!?;:]+$/, ""), indice: k, t: ctx.palavras[k].inicio };
          break;
        }
      }
    }
    rev.acao = "alterado";
    e.revisao[id] = rev;
    return e;
  }
  if (intencao === "formato") {
    try {
      const r = await d.jev({ projectId: d.projectId, etapa: "jornada-revisao-formato", state: { elemento: el.descricao, pedido } }, { f: { type: "choice", instructions: "Qual formato o cliente pediu?", criteria: { ...CRITERIO_DO_FORMATO } } });
      const x = r.f;
      if (x && x.type === "choice" && (FORMATOS_DA_JORNADA as readonly string[]).includes(x.choice)) {
        el.formato = x.choice as FormatoDaJornada;
        el.midia = midiaDoFormato(el.formato);
        el.custoUsd = custoDoElementoDaJornada(el.midia, Boolean(el.textoNaImagem));
      }
    } catch {
      // Sem o JEV, o formato fica.
    }
    rev.acao = "alterado";
    e.revisao[id] = rev;
    return e;
  }
  // CONTEÚDO: o Sonnet reescreve a descrição; o JEV confere; uma reescrita a mais se não atende.
  const pedidos = rev.pedidos.map((p) => p.texto);
  let descricao = el.descricao;
  let textoNaArte = el.textoNaImagem;
  for (let vez = 0; vez < 2; vez++) {
    const resp = await d.redator(SISTEMA_DA_REVISAO, pedidoDaRevisao({ ...el, descricao }, vez ? [...pedidos, `${pedido} (a versão anterior não atendeu; atenda exatamente)`] : pedidos));
    let j: Record<string, unknown> = {};
    try {
      j = primeiroJson(resp) as Record<string, unknown>;
    } catch {
      j = { descricao: resp };
    }
    descricao = semTravessao(String(j.descricao ?? descricao).trim()).slice(0, 400) || descricao;
    // O texto da arte pedido pelo cliente vale (as palavras dele contam como ditas).
    textoNaArte = j.textoNaImagem === undefined ? textoNaArte : textoPermitido(j.textoNaImagem as string | null, `${el.momento.frase} ${pedido}`, { papel: el.papel, marca: ctx.marca });
    if (await atende(d, pedido, descricao)) break;
  }
  el.descricao = descricao;
  el.textoNaImagem = textoNaArte;
  el.custoUsd = custoDoElementoDaJornada(el.midia, Boolean(textoNaArte));
  rev.acao = "alterado";
  rev.descricaoAprovada = descricao;
  rev.textoNaImagemAprovado = textoNaArte;
  e.revisao[id] = rev;
  return e;
}

/** Remover e restaurar não chamam IA. */
export function removerElemento(estado: EstadoDaJornada, id: string, agora = new Date().toISOString()): EstadoDaJornada {
  if (estado.aprovado) throw new PlanoCongelado();
  const e = clonar(estado);
  const el = e.plano?.elementos.find((x) => x.id === id);
  if (!el) throw new Error("elemento não encontrado");
  const rev = revisaoDe(e, el);
  rev.acao = "removido";
  rev.pedidos.push({ texto: "remover", em: agora });
  e.revisao[id] = rev;
  return e;
}

export function restaurarElemento(estado: EstadoDaJornada, id: string): EstadoDaJornada {
  if (estado.aprovado) throw new PlanoCongelado();
  const e = clonar(estado);
  const el = e.plano?.elementos.find((x) => x.id === id);
  const rev = el ? e.revisao[id] : null;
  if (rev && rev.acao === "removido") rev.acao = rev.pedidos.some((p) => p.texto !== "remover") ? "alterado" : "aprovado";
  return e;
}

export const SISTEMA_DO_NOVO = `Você escreve a descrição de UM elemento visual novo para um momento de um vídeo, a partir do pedido do cliente e da fala daquele momento. Português do Brasil, uma frase concreta e visual, sem travessão. Diga também a mídia ("recorte", "imagem" ou "video") e, se o pedido pede texto na arte, o texto (até 5 palavras).
Responda só com JSON: {"descricao":"...","midia":"recorte","textoNaImagem":null}`;

/** Um elemento novo pedido pelo cliente num momento sem elemento. */
export async function pedirElementoNovo(estado: EstadoDaJornada, frase: Frase, texto: string, d: DependenciasDaRevisao, ctx: { palavras: Palavra[]; marca?: string | null; formato: "9:16" | "16:9" }): Promise<EstadoDaJornada> {
  if (estado.aprovado) throw new PlanoCongelado();
  const pedido = semTravessao(String(texto ?? "").trim()).slice(0, 500);
  if (!pedido) throw new Error("escreva o pedido");
  const e = clonar(estado);
  if (!e.plano) throw new Error("sem plano");
  const resp = await d.redator(SISTEMA_DO_NOVO, `FALA DO MOMENTO: "${frase.texto}"\nPEDIDO DO CLIENTE: "${pedido}"`);
  let j: Record<string, unknown> = {};
  try {
    j = primeiroJson(resp) as Record<string, unknown>;
  } catch {
    j = { descricao: pedido };
  }
  const midiaPedida = j.midia === "video" ? "video" : j.midia === "imagem" ? "imagem" : "recorte";
  const formato: FormatoDaJornada = midiaPedida === "video" ? "broll" : midiaPedida === "imagem" ? "janela" : "recorte-sobre";
  const k = frase.de;
  const textoNaArte = textoPermitido(j.textoNaImagem as string | null, `${frase.texto} ${pedido}`, { papel: "elemento", marca: ctx.marca });
  const id = `u${Date.now().toString(36)}`;
  const el: ElementoProposto = {
    id,
    momento: { indice: frase.indice, de: frase.inicio, ate: frase.fim, frase: frase.texto },
    gatilho: { palavra: ctx.palavras[k].texto.replace(/[.,!?;:]+$/, ""), indice: k, t: ctx.palavras[k].inicio },
    descricao: semTravessao(String(j.descricao ?? pedido)).slice(0, 400),
    textoNaImagem: textoNaArte,
    midia: midiaDoFormato(formato),
    formato,
    porque: "pedido do cliente",
    custoUsd: custoDoElementoDaJornada(midiaDoFormato(formato), Boolean(textoNaArte)),
    origem: "usuario",
    papel: "elemento",
  };
  e.plano.elementos = [...e.plano.elementos, el].sort((a, b) => a.gatilho.t - b.gatilho.t);
  e.revisao[id] = { id, acao: "novo", pedidos: [{ texto: pedido, em: agoraDe(d) }], descricaoAprovada: el.descricao, textoNaImagemAprovado: textoNaArte };
  return e;
}

/** Os elementos que vão ao ar se o cliente aprovar agora (sem os removidos), com o pedido literal. */
export function elementosDaAprovacao(estado: EstadoDaJornada): ElementoAprovado[] {
  return (estado.plano?.elementos ?? [])
    .filter((el) => estado.revisao[el.id]?.acao !== "removido")
    .map((el) => {
      const rev = estado.revisao[el.id];
      return {
        ...el,
        descricao: rev?.descricaoAprovada ?? el.descricao,
        textoNaImagem: rev ? rev.textoNaImagemAprovado : el.textoNaImagem,
        pedidos: (rev?.pedidos ?? []).map((p) => p.texto).filter((t) => t !== "remover"),
      };
    });
}

function congelar<T>(o: T): T {
  if (o && typeof o === "object") {
    for (const v of Object.values(o as Record<string, unknown>)) congelar(v);
    Object.freeze(o);
  }
  return o;
}

/** APROVAR CONGELA o plano: a lista aprovada é a que vai ao ar, imutável. */
export function aprovarJornada(estado: EstadoDaJornada, agora = new Date().toISOString()): EstadoDaJornada {
  if (estado.aprovado) return estado;
  if (!estado.plano) throw new Error("sem plano para aprovar");
  return { ...clonar(estado), aprovado: { em: agora, elementos: elementosDaAprovacao(estado) }, ajuste: estado.ajuste ?? null };
}

/** O que vai ao ar: exatamente a lista aprovada, congelada. Antes da aprovação, lança. */
export function elementosAprovados(estado: Pick<EstadoDaJornada, "aprovado">): readonly ElementoAprovado[] {
  if (!estado.aprovado) throw new Error("o plano ainda não foi aprovado");
  return congelar(JSON.parse(JSON.stringify(estado.aprovado.elementos)) as ElementoAprovado[]);
}
