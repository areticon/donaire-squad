import { askClaude } from "@/lib/claude";
import type { Trecho } from "@/lib/media/select-clips";

/**
 * Passo 4: transformar cada trecho escolhido em post para as três redes.
 *
 * A regra que define este arquivo: **uma chamada por trecho, devolvendo as três
 * redes juntas.** Não é preferência de estilo, é a diferença entre margem de
 * 85% e de 25%. Uma chamada por trecho por rede levaria o trabalho completo de
 * R$ 1,50 para R$ 7,50 contra a mesma receita. Quem mexer aqui depois e quiser
 * separar por rede "para dar mais controle" precisa saber que está gastando 5x.
 *
 * O trecho chega pronto do Passo 3, com a ideia e a transcrição literal, então
 * esta chamada não relê a gravação inteira. É o que mantém o input pequeno.
 *
 * As regras e o contexto do projeto vão no prefixo cacheável, porque repetem
 * byte a byte entre os trechos do mesmo vídeo. Com 5 trechos, quatro chamadas
 * leem do cache em vez de reescrever. Ressalva conhecida: o mínimo cacheável é
 * de 1024 tokens, e projeto sem documentos de contexto não alcança, caso em que
 * a API simplesmente não cacheia e não avisa.
 */

export type PostsDoTrecho = {
  linkedin: string;
  x: string;
  instagram: string;
};

const REGRAS = `Você escreve o post a partir de um momento real de uma gravação.

A pessoa já falou. Seu trabalho não é inventar, é dar forma ao que ela disse.

Regras que não se quebram:
- Use apenas o que está na transcrição do trecho. Não invente número, cliente,
  caso, resultado ou nome. Se faltar dado, escreva com o que tem.
- Escreva na voz dela, não na sua. Se ela é direta, seja direta. Se ela usa o
  jargão do setor, mantenha o jargão.
- Nada de "neste artigo vamos explorar", "no mundo de hoje", "é fundamental
  ressaltar", "em um cenário cada vez mais". Abertura que serviria para
  qualquer post está proibida.
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Sem hashtag, a não ser que a pessoa use hashtag na fala dela.
- Português do Brasil.

Formatos, e eles são diferentes de propósito porque as redes são diferentes:
- linkedin: 900 a 1400 caracteres. A primeira linha é o gancho e precisa segurar
  sozinha, porque é só ela que aparece antes do "ver mais". Parágrafos curtos,
  com linha em branco entre eles. Fecha com a tese, não com pergunta genérica.
- x: até 240 caracteres. Uma ideia só, a mais afiada do trecho. Sem introdução.
  O limite duro da rede é 280, e post acima disso é recusado na publicação, por
  isso a folga.
- instagram: 500 a 800 caracteres, mais pessoal e mais narrativo que o LinkedIn.
  Linha em branco entre cada bloco de ideia.

Responda SOMENTE com JSON válido, sem cercas de código:
{"linkedin":"...","x":"...","instagram":"..."}`;

export function montarPrefixoCacheavel(contexto: {
  nicho?: string | null;
  publico?: string | null;
  voz?: string | null;
  marca?: string | null;
}): string {
  return [
    REGRAS,
    "",
    "Sobre quem está falando:",
    contexto.nicho ? `Nicho: ${contexto.nicho}` : "",
    contexto.publico ? `Público: ${contexto.publico}` : "",
    contexto.voz ? `Tom de voz: ${contexto.voz}` : "",
    contexto.marca ? `\nContexto da marca:\n${contexto.marca}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Limite duro da rede. Post acima disso é recusado na publicação. */
export const MAX_X = 280;

/**
 * O modelo estoura o limite do X com alguma frequência, mesmo instruído: no
 * primeiro teste real saiu um post de 286 caracteres, que a API do X recusaria.
 * Encurtar custa uma chamada pequena e só acontece quando estoura. O corte por
 * fronteira de frase é a última linha de defesa, para nunca publicar cortado no
 * meio de uma palavra.
 */
async function encurtarParaX(texto: string, prefixoCacheavel: string, usageCtx?: { projectId?: string; runId?: string }): Promise<string> {
  try {
    const menor = await askClaude(
      "Encurte o post abaixo para no máximo 240 caracteres, mantendo a ideia e a voz. Responda só com o texto, sem aspas e sem explicação.",
      texto,
      { maxTokens: 300, cachedPrefix: prefixoCacheavel, usage: { operation: "video_redacao_x", ...usageCtx } }
    );
    const limpo = menor.trim().replace(/^["']|["']$/g, "");
    if (limpo.length <= MAX_X) return limpo;
  } catch {
    // Segue para o corte, que é determinístico.
  }
  const corte = texto.slice(0, MAX_X);
  const fim = Math.max(corte.lastIndexOf("."), corte.lastIndexOf("!"), corte.lastIndexOf("?"));
  return fim > 80 ? corte.slice(0, fim + 1) : corte.trimEnd();
}

export async function escreverPosts(
  trecho: Trecho,
  prefixoCacheavel: string,
  usageCtx?: { projectId?: string; runId?: string }
): Promise<PostsDoTrecho> {
  const resposta = await askClaude(
    "Escreva os três posts a partir do trecho abaixo.",
    `Título do momento: ${trecho.titulo}
Ideia central: ${trecho.ideia}

O que a pessoa falou, literalmente:
${trecho.transcricao}`,
    {
      maxTokens: 2500,
      cachedPrefix: prefixoCacheavel,
      usage: { operation: "video_redacao", ...usageCtx },
    }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  const posts = JSON.parse(limpo) as PostsDoTrecho;
  if (!posts.linkedin || !posts.x || !posts.instagram) {
    throw new Error("O redator não devolveu as três redes.");
  }

  if (posts.x.length > MAX_X) {
    posts.x = await encurtarParaX(posts.x, prefixoCacheavel, usageCtx);
  }

  return posts;
}
