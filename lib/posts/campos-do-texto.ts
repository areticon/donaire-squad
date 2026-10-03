/**
 * OS CAMPOS DO TEXTO DE UMA PEÇA (03/10, pedido do Bruno: "título, descrição,
 * legenda e hashtags de toda peça abrem editáveis no card").
 *
 * O post guarda um texto só (`content`). O publicador do YouTube lê a PRIMEIRA
 * LINHA como título e o resto como descrição (lib/publish/oauth-post.ts), e as
 * hashtags moram no fim do texto em toda rede. Separar aqui, e juntar de volta
 * na mesma forma, deixa o cliente trocar uma palavra do título sem mexer na
 * descrição, e sem aprender a regra da primeira linha.
 *
 * Puro: a tela e a rota de reescrita usam a mesma divisão.
 */
export type CampoDoTexto = "titulo" | "descricao" | "legenda" | "hashtags";

export type CamposDoTexto = {
  /** Só no YouTube: a primeira linha. */
  titulo: string | null;
  /** O corpo: descrição no YouTube, legenda nas outras redes. */
  corpo: string;
  /** As hashtags do fim, separadas por espaço ("#a #b"). */
  hashtags: string;
};

/** Uma linha feita SÓ de hashtags (o bloco do fim). */
function soHashtags(linha: string): boolean {
  const t = linha.trim();
  return t.length > 0 && t.split(/\s+/).every((w) => /^#[\p{L}\p{N}_]+$/u.test(w));
}

export function separarCampos(conteudo: string, plataforma: string): CamposDoTexto {
  const linhas = (conteudo ?? "").replace(/\r\n/g, "\n").split("\n");
  // As linhas de hashtag do FIM; hashtag no meio de frase fica no corpo.
  const tags: string[] = [];
  while (linhas.length && (soHashtags(linhas[linhas.length - 1]) || linhas[linhas.length - 1].trim() === "")) {
    const l = linhas.pop()!;
    if (l.trim()) tags.unshift(l.trim());
  }
  let titulo: string | null = null;
  if (plataforma === "youtube") {
    titulo = (linhas.shift() ?? "").trim();
    while (linhas.length && linhas[0].trim() === "") linhas.shift();
  }
  return { titulo, corpo: linhas.join("\n").trim(), hashtags: tags.join(" ") };
}

/** Normaliza as hashtags digitadas: "marketing, #vendas" vira "#marketing #vendas". */
export function limparHashtags(texto: string): string {
  return texto
    .split(/[\s,;]+/)
    .map((w) => w.trim().replace(/^#+/, ""))
    .filter((w) => w.length > 0)
    .map((w) => `#${w}`)
    .join(" ");
}

export function juntarCampos(c: CamposDoTexto, plataforma: string): string {
  const partes: string[] = [];
  if (plataforma === "youtube") partes.push((c.titulo ?? "").replace(/\n+/g, " ").trim());
  if (c.corpo.trim()) partes.push(c.corpo.trim());
  const tags = limparHashtags(c.hashtags);
  if (tags) partes.push(tags);
  return partes.join("\n\n");
}

export const ROTULO_DO_CAMPO: Record<CampoDoTexto, string> = {
  titulo: "Título",
  descricao: "Descrição",
  legenda: "Legenda",
  hashtags: "Hashtags",
};
