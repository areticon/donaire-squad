/**
 * OS LINKS DO CLIENTE (03/10, pedido do Bruno).
 *
 * O cliente cadastra em Configurações os links dele (site, loja, produto,
 * afiliado, WhatsApp, agenda), cada um com rótulo e prioridade, e os agentes
 * que escrevem distribuem esses links ONDE A REDE ACEITA LINK, com chamada para
 * a ação. Sem isto, todo post terminava sem caminho para o leitor agir, e o
 * cliente colava o link à mão depois.
 *
 * Mora em `Project.config.linksDoCliente` (JSON, sem migração), porque é
 * configuração da marca lida inteira junto do projeto.
 *
 * As regras por rede (o que cada uma faz com um link):
 *   - YouTube: descrição aceita link clicável; vão todos, em ordem de prioridade;
 *   - LinkedIn: link no texto derruba o alcance; o principal vai no PRIMEIRO
 *     COMENTÁRIO, e o texto chama para ele;
 *   - Facebook: aceita link no texto; um só, o mais ligado ao assunto;
 *   - X: um link no último tweet da thread, quando fizer sentido;
 *   - Instagram e TikTok: link na legenda não é clicável; nenhuma URL no
 *     texto. A bio NÃO é mexida pelos agentes (é do cliente).
 *
 * Puro: a tela, a rota e os prompts usam as mesmas funções.
 */
export const TIPOS_DE_LINK = [
  { id: "site", rotulo: "Site" },
  { id: "loja", rotulo: "Loja" },
  { id: "produto", rotulo: "Produto" },
  { id: "afiliado", rotulo: "Afiliado" },
  { id: "whatsapp", rotulo: "WhatsApp" },
  { id: "agenda", rotulo: "Agenda" },
  { id: "outro", rotulo: "Outro" },
] as const;
export type TipoDeLink = (typeof TIPOS_DE_LINK)[number]["id"];

export type LinkDoCliente = {
  id: string;
  rotulo: string;
  url: string;
  tipo: TipoDeLink;
  /** 1 = principal, 2 = secundário, 3 = de vez em quando. */
  prioridade: 1 | 2 | 3;
  /** A chamada que o cliente prefere ("Agende uma conversa"), opcional. */
  cta?: string;
};

export const MAX_LINKS = 12;

/** Aceita "wa.me/55...", "www.site.com" e telefone puro no WhatsApp; devolve https ou nulo. */
export function normalizarUrl(bruta: string, tipo?: TipoDeLink): string | null {
  let u = (bruta ?? "").trim();
  if (!u) return null;
  if (tipo === "whatsapp" && /^[+\d\s().-]{8,}$/.test(u)) u = `https://wa.me/${u.replace(/\D/g, "")}`;
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, "")}`;
  try {
    const url = new URL(u);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Lê os links de `Project.config`, descartando o que não for válido. */
export function lerLinks(config: unknown): LinkDoCliente[] {
  const bruto = (config as { linksDoCliente?: unknown } | null | undefined)?.linksDoCliente;
  if (!Array.isArray(bruto)) return [];
  const vistos = new Set<string>();
  const links: LinkDoCliente[] = [];
  for (const b of bruto) {
    const x = b as Partial<LinkDoCliente> | null;
    if (!x || typeof x.url !== "string") continue;
    const tipo = TIPOS_DE_LINK.some((t) => t.id === x.tipo) ? (x.tipo as TipoDeLink) : "outro";
    const url = normalizarUrl(x.url, tipo);
    if (!url || vistos.has(url)) continue;
    vistos.add(url);
    const prioridade = x.prioridade === 1 || x.prioridade === 2 || x.prioridade === 3 ? x.prioridade : 2;
    links.push({
      id: typeof x.id === "string" && x.id ? x.id : url,
      rotulo: (typeof x.rotulo === "string" && x.rotulo.trim() ? x.rotulo.trim() : TIPOS_DE_LINK.find((t) => t.id === tipo)!.rotulo).slice(0, 60),
      url,
      tipo,
      prioridade,
      ...(typeof x.cta === "string" && x.cta.trim() ? { cta: x.cta.trim().slice(0, 80) } : {}),
    });
    if (links.length >= MAX_LINKS) break;
  }
  return links.sort((a, b) => a.prioridade - b.prioridade);
}

const PRIORIDADE: Record<number, string> = { 1: "principal", 2: "secundário", 3: "de vez em quando" };

/**
 * O bloco do prompt dos redatores: os links COMO DADO, e a regra de cada rede.
 * Vazio quando o cliente não cadastrou link nenhum (nada muda no prompt).
 */
export function blocoDosLinks(links: LinkDoCliente[]): string {
  if (!links.length) return "";
  const lista = links
    .map((l) => `- ${l.rotulo} (${TIPOS_DE_LINK.find((t) => t.id === l.tipo)?.rotulo ?? l.tipo}, ${PRIORIDADE[l.prioridade]}): ${l.url}${l.cta ? `. Chamada preferida: "${l.cta}"` : ""}`)
    .join("\n");
  return `

LINKS DO CLIENTE (cadastrados por ele; use EXATAMENTE estas URLs, nunca invente outra):
${lista}

ONDE CADA REDE ACEITA LINK, e como usar:
- YouTube (descrição): pode listar os links, o principal primeiro, cada um com uma chamada curta.
- LinkedIn: NÃO ponha URL no texto (derruba o alcance). Quando fizer sentido chamar para o link principal, escreva no fim do texto uma chamada para o primeiro comentário ("o link está no primeiro comentário"); o sistema põe o link principal lá.
- Facebook: no máximo UM link no texto, o mais ligado ao assunto, com chamada para a ação.
- X: no máximo um link, só no último tweet da thread, e só quando fizer sentido com o tema.
- Instagram e TikTok: NENHUMA URL na legenda (não é clicável). Não escreva "link na bio".
- Prefira o link principal; use outro só quando ele combinar mais com o assunto da peça (um produto citado, a agenda numa peça que convida a conversar). Em conteúdo de topo de funil, a chamada é leve (saber mais, conversar), nunca "compre agora".`;
}

/** O link que vai no primeiro comentário do LinkedIn: o principal. */
export function linkDoPrimeiroComentario(links: LinkDoCliente[]): LinkDoCliente | null {
  return links[0] ?? null;
}

/** A seção de links da descrição do YouTube, montada sem IA (o completo e os Shorts). */
export function secaoDeLinksDoYouTube(links: LinkDoCliente[]): string {
  if (!links.length) return "";
  return ["Links:", ...links.map((l) => `${l.cta ?? l.rotulo}: ${l.url}`)].join("\n");
}

/**
 * O PRIMEIRO COMENTÁRIO DO LINKEDIN com o link do cliente, quando o texto
 * chama para ele ("o link está no primeiro comentário"). O link vai antes das
 * fontes: é o que o leitor foi buscar. Sem link cadastrado, ou com o texto sem
 * chamada para o comentário, o comentário fica como estava.
 */
export function primeiroComentarioComLink(
  comentario: string | null | undefined,
  conteudo: string,
  links: LinkDoCliente[]
): string | null {
  const atual = comentario?.trim() || null;
  const link = linkDoPrimeiroComentario(links);
  if (!link || !/coment[aá]rio/i.test(conteudo)) return atual;
  if (atual?.includes(link.url)) return atual;
  const linha = `${link.cta ?? link.rotulo}: ${link.url}`;
  return atual ? `${linha}\n\n${atual}` : linha;
}
