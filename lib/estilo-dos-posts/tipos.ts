import { TETO } from "@/lib/biblioteca-de-design/tipos";

/**
 * O ESTILO DOS POSTS (08/10/2026): os tipos e as regras puras.
 *
 * As decisões do Bruno, literais:
 *   - "isso precisa ser um quadro de chat para o usuário escrever como ele
 *     quer o estilo dos posts, ou ele pode escolher estilos da biblioteca";
 *   - "o usuário gera a campanha toda e só no final descobre que está
 *     faltando aprovar o estilo, as artes; está muito confuso".
 *
 * Então o estilo dos posts é UM passo, com duas portas (escrever no chat ou
 * escolher da biblioteca), e escrever ou escolher JÁ É a aprovação: o
 * registro mora na identidade aprovada (lib/modelos-de-arte/identidade.ts,
 * campo `design`). O passo aparece no assistente do projeto, antes de gerar
 * a campanha por tema e antes de enviar a gravação, sempre que há dia de
 * arte e o estilo não está aprovado.
 *
 * Quem escreve a ficha do design a partir do chat é o Claude (o redator da
 * biblioteca); quem compara com a biblioteca é o JEV. Aqui só se junta o que
 * o cliente escreveu e se decide o que a tela mostra.
 *
 * Módulo puro: a tela (componente de cliente) importa daqui.
 */

/** O design que é o estilo dos posts, como a tela mostra. */
export interface DesignDoEstilo {
  id: string;
  nome: string;
  descricao: string;
  previaUrl: string | null;
}

/** O estado do estilo dos posts de um projeto (GET /api/projects/[id]/estilo-dos-posts). */
export interface EstadoDoEstiloDosPosts {
  aprovada: boolean;
  aprovadaEm: string | null;
  /** O design da biblioteca aprovado como estilo, quando é ele que manda. */
  design: DesignDoEstilo | null;
  /** Os modelos do book escolhidos (quando o estilo é o book). */
  modelos: Array<{ id: string; nome: string }>;
  /** Artes de campanhas antigas que esperavam o estilo para sair. */
  aguardando: number;
  /** Só o dono muda o estilo, como a direção visual. */
  podeMudar: boolean;
}

/**
 * O pedido que vai à biblioteca a partir das mensagens do chat: a primeira é
 * o estilo, as seguintes são ajustes ("mais escuro", "sem pessoa"), e o
 * último ajuste manda. Cabe no teto do pedido: passando, saem os ajustes mais
 * antigos, nunca o primeiro pedido nem o último ajuste.
 */
export function pedidoDaConversa(mensagens: string[], teto: number = TETO.pedido): string {
  const limpas = mensagens.map((m) => String(m ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!limpas.length) return "";
  const [primeira, ...ajustes] = limpas;
  const montar = (lista: string[]) =>
    lista.length ? `${primeira.replace(/[.;\s]+$/, "")}. Ajustes pedidos depois, na ordem (o último manda): ${lista.map((a, i) => `${i + 1}) ${a.replace(/[.;\s]+$/, "")}`).join("; ")}.` : primeira;
  let lista = ajustes;
  let pedido = montar(lista);
  while (pedido.length > teto && lista.length > 1) {
    lista = lista.slice(1);
    pedido = montar(lista);
  }
  if (pedido.length <= teto) return pedido;
  // Nem o primeiro pedido com o último ajuste cabe: o primeiro encolhe.
  const fim = lista.length ? `. Ajuste pedido depois (manda): ${lista[lista.length - 1]}.` : "";
  return `${primeira.slice(0, Math.max(0, teto - fim.length)).trim()}${fim}`.slice(0, teto);
}

/** A linha que diz como os posts saem hoje. */
export function resumoDoEstilo(e: Pick<EstadoDoEstiloDosPosts, "aprovada" | "design" | "modelos"> | null | undefined): string {
  if (!e?.aprovada) return "O estilo dos posts ainda não foi escolhido.";
  if (e.design) return `Seus posts saem no estilo "${e.design.nome}".`;
  const nomes = e.modelos.map((m) => `"${m.nome}"`);
  if (!nomes.length) return "Seus posts saem no estilo aprovado.";
  if (nomes.length === 1) return `Seus posts saem no modelo ${nomes[0]}.`;
  return `Seus posts saem nos modelos ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}.`;
}

/**
 * A campanha (ou a semana do vídeo) precisa do passo do estilo antes de
 * gerar? Só quando há dia de arte e o estilo sabidamente NÃO está aprovado.
 * Enquanto o estado não chegou (null), não trava: o servidor ainda segura a
 * arte, sem gastar, como rede de segurança.
 */
export function precisaEscolherEstilo(o: { temArte: boolean; aprovada: boolean | null | undefined }): boolean {
  return o.temArte && o.aprovada === false;
}
