import { modeloPorId, type ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
export { registrarModeloDoCliente } from "@/lib/modelos-de-arte/catalogo";

/**
 * O MODELO POR PROMPT DO CLIENTE (06/10/2026, tarde).
 *
 * A biblioteca de design (lib/biblioteca-de-design) guarda o design de imagem
 * que o cliente ESCREVEU: o pedido dele e a `linguagem` em inglês que o
 * redator escreveu a partir do pedido. Até aqui a esteira de artes só
 * desenhava os modelos do book; o design escrito ficava ligado ao projeto e
 * nunca saía. Agora ele vira um modelo de arte de verdade:
 *
 *   - o VISUAL é gerado pelo melhor modelo de imagem da conta, com a
 *     linguagem do cliente como direção literal (nada de estilo fixo nosso
 *     por cima: o "Realistic editorial photograph" dos modelos do book não
 *     entra, porque o cliente pode ter pedido ilustração, aquarela, colagem);
 *   - a TIPOGRAFIA entra em código, como em todo modelo com foto, na
 *     composição genérica de foto inteira com a manchete embaixo (a mesma
 *     estrutura do "Foto inteira com manchete no degradê"), com a letra e as
 *     cores aprovadas na identidade. É a única estrutura, para qualquer
 *     design: nenhuma condição por estilo.
 *
 * O id é "design-<id da biblioteca>". O catálogo é estático, então o modelo
 * é registrado no processo (`registrarModeloDoCliente`) quando a marca da peça
 * é lida (lib/media/arte-com-frase.tsx, marcaDaArte), e `modeloPorId` o acha
 * dali em diante.
 *
 * Puro: sem banco. A prova roda sem rede (scripts/testes/modelo-do-cliente-0610.test.mts).
 */

export const PREFIXO_DO_DESIGN = "design-";

/** O molde da composição (estrutura, letra de reserva, campos): o modelo genérico de foto inteira. */
const MOLDE = "foto-inteira-degrade";

export function idDoModeloDoDesign(designId: string): string {
  return `${PREFIXO_DO_DESIGN}${designId}`;
}

export function designDoModelo(modeloId: string | null | undefined): string | null {
  return modeloId && modeloId.startsWith(PREFIXO_DO_DESIGN) && modeloId.length > PREFIXO_DO_DESIGN.length ? modeloId.slice(PREFIXO_DO_DESIGN.length) : null;
}

/** O prompt do design do cliente: a linguagem dele, a cena da frase, a paleta e a zona quieta da manchete. Sem texto desenhado. */
export function promptDoDesign(linguagem: string): string {
  const direcao = linguagem.replace(/\s+/g, " ").trim().slice(0, 900);
  return [
    `Image for a social media post. Visual language requested by the client, follow it literally (medium, technique, mood, framing): ${direcao}`,
    "Scene: {cena}",
    "Brand palette for accents: {paleta}, as details only, never a colour wash unless the visual language above asks for it.",
    "Composition for a {formato}: full-bleed frame, the subject in the upper half, the lower third calmer and darker because the headline sits there over a {fundo} gradient.",
    'Absolutely NO text, letters, numbers, captions, watermarks or logos anywhere: the headline "{manchete}" is printed on top in code afterwards.',
  ].join("\n");
}

/** O design da biblioteca como modelo de arte. Null sem linguagem (nada para desenhar). */
export function modeloDoDesign(d: { id: string; nome: string; descricao: string; linguagem: string }): ModeloDeArte | null {
  const molde = modeloPorId(MOLDE);
  if (!molde || !d.linguagem?.trim()) return null;
  return {
    ...molde,
    id: idDoModeloDoDesign(d.id),
    nome: d.nome || "Seu design",
    paraQuem: "O design que você escreveu para a sua marca.",
    categoria: "Com foto",
    estrutura: `${d.descricao || "O seu design"}. A imagem ocupa a peça inteira e a manchete entra embaixo, na sua letra.`,
    fotoOnde: "A peça inteira, de borda a borda.",
    fotoPrompt: undefined,
    prompt: promptDoDesign(d.linguagem),
    previaGerada: undefined,
    inspiracao: "Design escrito pelo cliente na biblioteca de design.",
  };
}

/**
 * O design do cliente vale para as artes? Só quando é o design de imagem mais
 * recente do projeto, é do cliente (sem catalogoId: não é modelo do book) e
 * foi ligado DEPOIS da última escolha no book (quem escolheu modelos do book
 * depois volta para eles). Puro, para a prova.
 */
export function designDoClienteVale(o: { catalogoId: string | null; ligadoEm: Date | string; escolhaDoBookEm?: string | null }): boolean {
  if (o.catalogoId) return false;
  if (!o.escolhaDoBookEm) return true;
  const ligado = new Date(o.ligadoEm).getTime();
  const book = new Date(o.escolhaDoBookEm).getTime();
  return Number.isNaN(book) || ligado > book;
}
