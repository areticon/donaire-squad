import { askClaude } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { FAMILIA, familiaPorPalavras } from "@/lib/media/editor-por-comando/linguagem";
import { normalizarFicha, semTravessao, TETO, type FichaDoDesign, type TipoDeDesign } from "@/lib/biblioteca-de-design/tipos";

/**
 * O REDATOR DA BIBLIOTECA (06/10/2026): o Claude SÓ ESCREVE. A partir do
 * pedido do cliente (português, do jeito dele) ele devolve, numa chamada:
 *   - o NOME curto do design (português, até 6 palavras, sem nome de marca
 *     de terceiros nem de pessoa);
 *   - a DESCRIÇÃO de uma linha (português, o que o cliente vê na galeria);
 *   - a LINGUAGEM em inglês: no vídeo, o bloco de estilo que vai em todo
 *     prompt de imagem e de vídeo (acabamento, material, luz, textura,
 *     enquadramento), nunca a cena; na imagem, o prompt base do modelo de
 *     imagem, com a composição e a zona quieta onde a tipografia entra em
 *     código, sem texto desenhado.
 * Nada de decisão aqui: igual, variação ou novo é o JEV (comparacao.ts).
 *
 * Sem o Claude (chave fora, limite, erro), a RESERVA monta a ficha com as
 * palavras do próprio pedido e a semente da família visual: a biblioteca
 * nunca fica sem a entrada.
 */

export const MODELO_DO_REDATOR_DA_BIBLIOTECA = process.env.BIBLIOTECA_REDATOR || process.env.EDITOR_POR_COMANDO_REDATOR || "claude-sonnet-5";

const SISTEMA = `Você escreve a FICHA de um design que um cliente pediu para os vídeos ou para as artes dele, para entrar numa biblioteca de designs que outros clientes também veem.

Responda só JSON: {"nome":"...","descricao":"...","linguagem":"..."}

Regras:
- "nome": em português, curto (3 a 6 palavras), descritivo do visual, sem nome de marca de terceiros, sem nome de pessoa, sem o nome do cliente.
- "descricao": em português, UMA linha (até 140 caracteres), diz o que aparece na tela e para que serve.
- "linguagem": em INGLÊS, um parágrafo de 40 a 80 palavras. Para VÍDEO: o bloco de estilo que vai no fim de todo prompt de imagem e de vídeo gerado, descrevendo só o acabamento (técnica, material, luz, textura, enquadramento, ritmo), nunca a cena. Para IMAGEM: o prompt base do modelo de imagem, com a composição da peça e uma zona quieta onde a tipografia entra depois em código; a imagem nunca tem texto, letras, logos nem marca d'água.
- A cor da marca entra só nos detalhes e acentos, nunca tingindo a foto inteira. Escreva "brand colors only as small accents" na linguagem.
- Fidelidade ao pedido: traduza o que o cliente quis, sem inventar outro estilo.
- Sem travessão (o sinal "—") em texto nenhum; use vírgula ou dois-pontos.
- Sem pessoa real reconhecível, sem artista vivo, sem marca de terceiros.`;

export type EntradaDoRedator = {
  tipo: TipoDeDesign;
  pedido: string;
  nicho?: string | null;
  publico?: string | null;
  /** Quando o JEV disse que é variação: o design de referência, para a ficha dizer o que muda. */
  variacaoDe?: { nome: string; descricao: string; linguagem: string } | null;
  projectId?: string | null;
};

/** A reserva sem o redator: as palavras do pedido e a semente da família. */
export function fichaDeReserva(e: EntradaDoRedator): FichaDoDesign {
  const pedido = semTravessao(e.pedido).slice(0, TETO.pedido);
  const palavras = pedido.replace(/[.,;:!?"]/g, " ").split(/\s+/).filter((p) => p.length > 2);
  const nome = palavras.slice(0, 5).join(" ") || (e.tipo === "video" ? "Design de vídeo" : "Design de imagem");
  const descricao = pedido.length > TETO.descricao ? `${pedido.slice(0, TETO.descricao - 3).replace(/\s+\S*$/, "")}...` : pedido;
  const familia = FAMILIA[familiaPorPalavras(pedido)];
  const linguagem =
    e.tipo === "video"
      ? `Visual language: ${familia.semente}. As the client described it (Portuguese): "${pedido.slice(0, 280)}". ${e.nicho ? `Audience and field: ${semTravessao(e.nicho).slice(0, 120)}. ` : ""}Brand colors only as small accents and details, never a flat color wash.`
      : `Realistic editorial image for a social media post in this visual language: ${familia.semente}. As the client described it (Portuguese): "${pedido.slice(0, 280)}". One clear focal subject and a quiet zone where the headline is printed in code afterwards. Absolutely no text, letters, logos or watermarks. Brand colors only as small accents and details.`;
  return normalizarFicha({ nome: nome.charAt(0).toUpperCase() + nome.slice(1), descricao, linguagem }) ?? { nome: "Design do cliente", descricao: pedido.slice(0, 120) || "Pedido do cliente.", linguagem };
}

/** O redator escreve a ficha (uma chamada curta); sem ele, a reserva. */
export async function escreverFichaDoDesign(e: EntradaDoRedator): Promise<{ ficha: FichaDoDesign; origem: "redator" | "reserva"; erro?: string }> {
  const reserva = fichaDeReserva(e);
  const pedido = semTravessao(e.pedido).slice(0, TETO.pedido);
  if (!process.env.ANTHROPIC_API_KEY) return { ficha: reserva, origem: "reserva", erro: "sem chave" };
  const mensagem = [
    `Tipo do design: ${e.tipo === "video" ? "VÍDEO (bloco de estilo do editor)" : "IMAGEM (prompt base do modelo de imagem)"}.`,
    `Pedido do cliente: "${pedido}"`,
    e.nicho ? `Nicho do projeto: ${semTravessao(e.nicho).slice(0, 200)}` : "",
    e.publico ? `Público: ${semTravessao(e.publico).slice(0, 200)}` : "",
    e.variacaoDe ? `Este pedido é uma VARIAÇÃO do design "${e.variacaoDe.nome}" (${e.variacaoDe.descricao}). Linguagem dele: ${e.variacaoDe.linguagem.slice(0, 400)}. Escreva a ficha do que muda, mantendo o que é igual.` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const r = await askClaude(SISTEMA, mensagem, {
      model: MODELO_DO_REDATOR_DA_BIBLIOTECA,
      maxTokens: 4000,
      effort: "low",
      timeoutMs: 60_000,
      usage: { projectId: e.projectId ?? undefined, operation: "biblioteca-de-design-ficha" },
    });
    const j = extrairJson(r) as Partial<FichaDoDesign>;
    const ficha = normalizarFicha(j);
    if (!ficha) return { ficha: reserva, origem: "reserva", erro: "ficha incompleta" };
    if (!/accent/i.test(ficha.linguagem)) ficha.linguagem = `${ficha.linguagem} Brand colors only as small accents and details.`.slice(0, TETO.linguagem);
    return { ficha, origem: "redator" };
  } catch (err) {
    return { ficha: reserva, origem: "reserva", erro: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
}
