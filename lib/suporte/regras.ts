/**
 * AS REGRAS DO CHAMADO QUE A TELA E O SERVIDOR DIVIDEM (02/10/2026).
 *
 * Módulo PURO: não toca banco, não lê segredo. A janela de ajuda, a página
 * "Meus chamados" e o painel do admin são componentes de cliente e importam
 * daqui; o servidor importa as mesmas regras para nunca divergir delas.
 */

export const CATEGORIAS = ["problema", "duvida", "cobranca", "sugestao"] as const;
export type Categoria = (typeof CATEGORIAS)[number];

export const NOME_DA_CATEGORIA: Record<Categoria, string> = {
  problema: "Problema técnico",
  duvida: "Dúvida",
  cobranca: "Cobrança",
  sugestao: "Sugestão",
};

export const STATUS = ["aberto", "andamento", "resolvido"] as const;
export type StatusDoChamado = (typeof STATUS)[number];

export const NOME_DO_STATUS: Record<StatusDoChamado, string> = {
  aberto: "Aberto",
  andamento: "Em andamento",
  resolvido: "Resolvido",
};

/** Um usuário não abre mais do que isto por hora (pedido de 02/10). */
export const LIMITE_POR_HORA = 10;
export const TEXTO_MINIMO = 5;
export const TEXTO_MAXIMO = 4000;
/** O print vai pela função (multipart): 4 MB cabe no limite de corpo da Vercel. */
export const PRINT_MAXIMO = 4 * 1024 * 1024;
export const TIPOS_DO_PRINT = ["image/png", "image/jpeg", "image/webp"];

export function ehCategoria(v: unknown): v is Categoria {
  return typeof v === "string" && (CATEGORIAS as readonly string[]).includes(v);
}

export function ehStatus(v: unknown): v is StatusDoChamado {
  return typeof v === "string" && (STATUS as readonly string[]).includes(v);
}

/** "#0012": o número que a pessoa fala no WhatsApp e lê no e-mail. */
export function protocoloDoChamado(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

/**
 * Conta como RECLAMAÇÃO no painel: cobrança, problema técnico, ou marcado à
 * mão pelo admin. Dúvida e sugestão não são reclamação.
 */
export function contaComoReclamacao(c: { categoria: string; reclamacao: boolean }): boolean {
  return c.reclamacao || c.categoria === "cobranca" || c.categoria === "problema";
}

/**
 * O link do WhatsApp com a mensagem já escrita. `numero` vem do servidor
 * (SUPORTE_WHATSAPP, só dígitos com o 55); sem ele, não há botão.
 */
export function linkDoWhatsapp(numero: string, protocolo: string, texto: string): string {
  const resumo = texto.replace(/\s+/g, " ").trim().slice(0, 160);
  const msg = `Chamado ${protocolo}: ${resumo}${texto.trim().length > 160 ? "..." : ""}`;
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
}

/** O que a janela manda como contexto automático (lido do navegador). */
export type ContextoDaTela = {
  pagina?: string;
  projectId?: string | null;
  videoId?: string | null;
  postId?: string | null;
  navegador?: string;
  tela?: string;
};

/**
 * Projeto, vídeo e post lidos do endereço: /projects/<id>/..., e ?video= ou
 * ?post= (ou ?videoId= / ?postId=) quando a tela os põe na URL.
 */
export function contextoDoEndereco(pathname: string, busca: string): Pick<ContextoDaTela, "projectId" | "videoId" | "postId"> {
  const projeto = pathname.match(/^\/projects\/([^/?#]+)/)?.[1];
  const sp = new URLSearchParams(busca);
  const video = sp.get("video") ?? sp.get("videoId") ?? pathname.match(/\/videos?\/([a-z0-9]{20,})/i)?.[1] ?? null;
  const post = sp.get("post") ?? sp.get("postId") ?? null;
  return {
    projectId: projeto && projeto !== "new" ? projeto : null,
    videoId: video,
    postId: post,
  };
}

/** Um chamado como a tela recebe: sem diagnóstico, sem nota interna ("Meus chamados"). */
export type ChamadoNaTela = {
  id: string;
  protocolo: string;
  categoria: string;
  status: string;
  texto: string;
  codigo: string | null;
  temPrint: boolean;
  criadoEm: string;
  atualizadoEm: string;
  eventos: Array<{ id: string; tipo: string; lado: string; autorNome: string | null; texto: string | null; de: string | null; para: string | null; em: string }>;
};

/** O chamado no painel do admin: com diagnóstico, contexto e quem abriu. */
export type ChamadoNoPainel = ChamadoNaTela & {
  numero: number;
  reclamacao: boolean;
  diagnostico: string | null;
  contexto: unknown;
  cliente: { id: string; nome: string | null; email: string };
};
