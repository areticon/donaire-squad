import type { Jev } from "@/lib/media/jornada/decisoes";
import type { Redator } from "@/lib/media/jornada/ideias";
import type { Frase, Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { pedirElementoNovo, pedirMudanca } from "@/lib/media/jornada/revisao";
import { semTravessao, type EstadoDaJornada } from "@/lib/media/jornada/estado";

/**
 * O PASSO 8 DA JORNADA (E6): "pedir ajuste" no card do vídeo pronto volta ao
 * passo 5 com o texto do cliente como pedido. O JEV decide a qual elemento o
 * texto se refere (ou se pede um elemento novo); o pedido entra pelo mesmo
 * caminho da revisão (o Sonnet reescreve a descrição). O plano é REABERTO
 * (o cliente vê e aprova de novo) e só os elementos afetados são gerados de
 * novo: os outros já são DESTA edição e ficam com a mídia que tinham.
 */

export type MidiaMantida = { url: string; tipo: "imagem" | "recorte" | "video"; formato: string; proporcao: number | null };

export type AjusteFeito = { estado: EstadoDaJornada; afetados: string[]; mantidas: Record<string, MidiaMantida> };

export async function ajusteNoPlano(
  estado: EstadoDaJornada,
  texto: string,
  o: { jev: Jev; redator: Redator; projectId?: string | null; palavras: Palavra[]; frases: Frase[]; midiasDaEdicao: Record<string, MidiaMantida> }
): Promise<AjusteFeito> {
  if (!estado.aprovado || !estado.plano) throw new Error("o vídeo não tem plano aprovado para ajustar");
  const pedido = semTravessao(String(texto ?? "").trim()).slice(0, 500);
  if (!pedido) throw new Error("escreva o ajuste");
  const vivos = estado.aprovado.elementos;
  // A QUAL ELEMENTO O PEDIDO SE REFERE: o JEV escolhe (ou "novo", um elemento que não existe ainda).
  let alvo = "novo";
  try {
    const r = await o.jev(
      { projectId: o.projectId, etapa: "jornada-ajuste", state: { tarefa: "achar o elemento do vídeo a que o pedido de ajuste do cliente se refere" } },
      { a: { type: "choice", instructions: { pergunta: "A qual elemento o pedido do cliente se refere?", pedido }, criteria: { ...Object.fromEntries(vivos.map((e) => [e.id, `${e.descricao} (na fala "${e.momento.frase.slice(0, 80)}")`])), novo: "a nenhum: o cliente pede um elemento novo" } } }
    );
    const x = r.a;
    if (x && x.type === "choice" && (x.confidence ?? 0) >= 0.35) alvo = x.choice;
  } catch {
    // Sem o JEV: o pedido vira elemento novo no momento mais citado (abaixo).
  }
  // Reabre: o plano volta a ser o aprovado, editável, com as revisões de antes.
  let aberto: EstadoDaJornada = { ...JSON.parse(JSON.stringify(estado)), aprovado: null };
  const afetados: string[] = [];
  if (alvo !== "novo" && vivos.some((e) => e.id === alvo)) {
    aberto = await pedirMudanca(aberto, alvo, pedido, { jev: o.jev, redator: o.redator, projectId: o.projectId }, { palavras: o.palavras, frases: o.frases });
    afetados.push(alvo);
  } else {
    // O momento: a frase que mais divide palavras com o pedido.
    const termos = new Set(pedido.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => w.length >= 4));
    const nota = (f: Frase) => f.texto.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter((w) => termos.has(w)).length;
    const frase = [...o.frases].sort((a, b) => nota(b) - nota(a))[0];
    if (!frase) throw new Error("sem fala para pôr o elemento");
    const antes = new Set(aberto.plano!.elementos.map((e) => e.id));
    aberto = await pedirElementoNovo(aberto, frase, pedido, { jev: o.jev, redator: o.redator, projectId: o.projectId }, { palavras: o.palavras, formato: aberto.plano!.formato });
    afetados.push(...aberto.plano!.elementos.filter((e) => !antes.has(e.id)).map((e) => e.id));
  }
  const mantidas = Object.fromEntries(Object.entries(o.midiasDaEdicao).filter(([id]) => !afetados.includes(id)));
  return { estado: { ...aberto, midiasMantidas: mantidas, ajuste: { texto: pedido, em: new Date().toISOString(), afetados } }, afetados, mantidas };
}
