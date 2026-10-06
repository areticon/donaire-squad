/**
 * O CONTEXTO DO VÍDEO PARA A JORNADA (decisão 8 do Bruno, 06/10): o que se
 * sabe da empresa, da marca e do nicho entra nos pedidos ao Sonnet (ideias no
 * passo 4, prompts no passo 6) como CONTEXTO em linguagem natural, nunca como
 * regra de código, ficha, família ou kit. O estilo do cliente é o comando que
 * ele escreveu, literal; sem comando, não existe estilo padrão escondido.
 * Módulo puro.
 */

export type CoresDaJornada = { acento: string; escuro: string; claro: string };

export type ContextoDaJornada = {
  /** O nome da empresa ou do projeto. */
  marca: string | null;
  /** O nicho do projeto, como o cliente escreveu. */
  nicho: string | null;
  /** O perfil do projeto em texto curto (público, tom), quando existe. */
  perfil: string | null;
  cores: CoresDaJornada;
  /** O comando de estilo do cliente, literal ("" quando ele não escreveu). */
  estiloDoCliente: string;
  formato: "9:16" | "16:9";
  /** Duração do vídeo editado, em s. */
  duracao: number;
  /** Onde o vídeo vai: o completo vai ao YouTube; o vertical curto às redes de vídeo curto. */
  destino: string;
};

/** O destino pelo formato e pela duração (só para o texto do pedido; a IA decide o que fazer com ele). */
export function destinoDoVideo(formato: "9:16" | "16:9", duracao: number): string {
  if (formato === "9:16" && duracao <= 180) return "vídeo curto vertical (Reels, Shorts, TikTok)";
  if (formato === "9:16") return "vídeo vertical longo (YouTube e redes)";
  return duracao >= 300 ? "vídeo longo horizontal no YouTube" : "vídeo horizontal curto (YouTube e LinkedIn)";
}

/** O contexto em texto, para os pedidos ao Sonnet. Sem travessão. */
export function contextoEmTexto(c: ContextoDaJornada): string {
  const min = Math.floor(c.duracao / 60);
  const seg = Math.round(c.duracao % 60);
  return [
    `Empresa ou marca: ${c.marca?.trim() || "não informada"}.`,
    `Nicho: ${c.nicho?.trim() || "não informado (deduza pela fala e pela leitura do vídeo)"}.`,
    c.perfil?.trim() ? `Perfil do projeto: ${c.perfil.trim().slice(0, 900)}` : null,
    `Cores da marca (use só em realces e detalhes): acento ${c.cores.acento}, escuro ${c.cores.escuro}, claro ${c.cores.claro}.`,
    c.estiloDoCliente.trim()
      ? `Estilo pedido pelo cliente, nas palavras dele: "${c.estiloDoCliente.trim().slice(0, 1200)}".`
      : "O cliente não escreveu estilo: decida pelo nicho, pela marca e pela leitura do vídeo.",
    `Formato ${c.formato}, duração ${min} min ${seg} s, destino: ${c.destino}.`,
  ]
    .filter(Boolean)
    .join("\n");
}
