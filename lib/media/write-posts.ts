import { askClaude } from "@/lib/claude";
import type { Trecho } from "@/lib/media/select-clips";
import { MAX_X } from "@/lib/media/limits";

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
- Português do Brasil.`;

/**
 * O formato das três redes com marcadores fica FORA das regras gerais desde
 * 29/09. O prefixo também serve aos redatores da semana (pecas-da-semana.ts),
 * que pedem UM texto só; com o "===LINKEDIN===" no prefixo cacheado, o modelo
 * obedecia ao prefixo e não ao pedido, e o marcador saiu colado no post de
 * sexta do teste do cliente.
 */
const FORMATO_DAS_TRES_REDES = `Formatos, e eles são diferentes de propósito porque as redes são diferentes:
- linkedin: 900 a 1400 caracteres. A primeira linha é o gancho e precisa segurar
  sozinha, porque é só ela que aparece antes do "ver mais". Parágrafos curtos,
  com linha em branco entre eles. Fecha com a tese, não com pergunta genérica.
- x: até 240 caracteres. Uma ideia só, a mais afiada do trecho. Sem introdução.
  O limite duro da rede é 280, e post acima disso é recusado na publicação, por
  isso a folga.
- instagram: 500 a 800 caracteres, mais pessoal e mais narrativo que o LinkedIn.
  Linha em branco entre cada bloco de ideia.

Responda exatamente neste formato, sem nada antes nem depois:

===LINKEDIN===
o post do linkedin aqui
===X===
o post do x aqui
===INSTAGRAM===
o post do instagram aqui`;

export function montarPrefixoCacheavel(
  contexto: {
    nicho?: string | null;
    publico?: string | null;
    voz?: string | null;
    marca?: string | null;
    /** O bloco dos links do cliente (lib/projeto/links-do-cliente.ts), 03/10. */
    links?: string | null;
  },
  opcoes: { tresRedes?: boolean } = {}
): string {
  return [
    opcoes.tresRedes === false ? REGRAS : `${REGRAS}\n\n${FORMATO_DAS_TRES_REDES}`,
    "",
    "Sobre quem está falando:",
    contexto.nicho ? `Nicho: ${contexto.nicho}` : "",
    contexto.publico ? `Público: ${contexto.publico}` : "",
    contexto.voz ? `Tom de voz: ${contexto.voz}` : "",
    contexto.marca ? `\nContexto da marca:\n${contexto.marca}` : "",
    contexto.links ? contexto.links : "",
  ]
    .filter(Boolean)
    .join("\n");
}

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
      { maxTokens: 4000, cachedPrefix: prefixoCacheavel, usage: { operation: "video_redacao_x", ...usageCtx } }
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

/**
 * Separa as três redes por marcador, e não por JSON, de propósito.
 *
 * A versão em JSON falhava de forma intermitente: o modelo emitia quebra de
 * linha crua dentro da string, o que invalida o JSON, e post de LinkedIn é
 * cheio de quebra de linha. Um em cada três trechos morria assim no primeiro
 * teste com dado real, e o pior é que não falhava sempre, então passava no
 * teste e quebrava em produção de vez em quando.
 *
 * Marcador não tem esse problema: não existe caractere para escapar.
 *
 * O marcador é lido com folga desde 29/09: o modelo nem sempre devolve
 * "===LINKEDIN===" exato. Já vieram "=== LinkedIn ===", "**===X===**",
 * "## Instagram" e o marcador na mesma linha do texto. A leitura antiga
 * procurava a string exata, e o que escapava dela ia parar dentro do post.
 */
const NOMES_DAS_REDES: Record<string, keyof PostsDoTrecho> = {
  linkedin: "linkedin",
  x: "x",
  twitter: "x",
  "x twitter": "x",
  "twitter x": "x",
  instagram: "instagram",
};

// "===LINKEDIN===", "== X ==", "**=== Instagram ===**", com ou sem texto
// depois na mesma linha (o que vem depois é o começo do post).
const MARCADOR_COM_IGUAIS = /^[ \t]*[#>*_`\s]*={2,}[ \t]*[*_]*[ \t]*([a-zà-ú /()]+?)[ \t]*[*_]*[ \t]*={2,}[*_`]*[ \t:]*/gim;
// "## LinkedIn", "**X**", "INSTAGRAM:", sozinhos na linha. Sem os iguais, só
// vale como marcador se a linha não tiver mais nada, para não confundir com
// uma frase do post que comece com o nome da rede.
const MARCADOR_EM_TITULO = /^[ \t]*(?:#{1,6}[ \t]*)?[*_]{0,2}[ \t]*(linkedin|x|twitter|x \(twitter\)|instagram)[ \t]*[*_]{0,2}[ \t]*:?[ \t]*$/gim;

function redeDoMarcador(nome: string): keyof PostsDoTrecho | undefined {
  const chave = nome.toLowerCase().replace(/[()]/g, " ").replace(/\s*\/\s*/g, " ").replace(/\s+/g, " ").trim();
  return NOMES_DAS_REDES[chave];
}

function acharMarcadores(texto: string) {
  const achados: Array<{ rede: keyof PostsDoTrecho; inicio: number; depois: number }> = [];
  for (const re of [MARCADOR_COM_IGUAIS, MARCADOR_EM_TITULO]) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const rede = redeDoMarcador(m[1]);
      if (!rede || m.index === undefined) continue;
      // O mesmo trecho casado pelas duas expressões conta uma vez só.
      if (achados.some((a) => a.inicio === m.index)) continue;
      achados.push({ rede, inicio: m.index, depois: m.index + m[0].length });
    }
  }
  return achados.sort((a, b) => a.inicio - b.inicio);
}

/**
 * O texto de UMA rede quando o redator devolveu as três mesmo assim.
 *
 * Foi o que aconteceu na sexta do teste de 29/09: o pedido era um post de
 * LinkedIn, o modelo seguiu o formato de três redes do prefixo, e a peça
 * saiu com "===LINKEDIN===" no topo e as versões do X e do Instagram
 * coladas no fim. Sem marcador nenhum, devolve o texto limpo como veio.
 */
export function textoDaRede(bruto: string, rede: string): string {
  const texto = bruto.trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  const achados = acharMarcadores(texto);
  if (!achados.length) return limparMarcadores(texto);
  const alvo: keyof PostsDoTrecho = rede === "instagram" ? "instagram" : rede === "twitter" || rede === "x" ? "x" : "linkedin";
  const i = Math.max(0, achados.findIndex((a) => a.rede === alvo));
  const fim = achados[i + 1]?.inicio ?? texto.length;
  const secao = limparMarcadores(texto.slice(achados[i].depois, fim));
  // Texto antes do primeiro marcador (raro) só vale se a seção veio vazia.
  return secao || limparMarcadores(texto.slice(0, achados[0].inicio));
}

export function separarPorMarcador(bruto: string): PostsDoTrecho {
  const texto = bruto.trim().replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "");
  const achados = acharMarcadores(texto);

  const posts: PostsDoTrecho = { linkedin: "", x: "", instagram: "" };
  achados.forEach((a, i) => {
    // Rede repetida: vale a primeira, que é a que o formato pediu.
    if (posts[a.rede]) return;
    const fim = achados[i + 1]?.inicio ?? texto.length;
    posts[a.rede] = limparMarcadores(texto.slice(a.depois, fim));
  });

  const faltando = Object.entries(posts)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (faltando.length) {
    throw new Error(`O redator não devolveu: ${faltando.join(", ")}.`);
  }
  return posts;
}

// Qualquer "===ALGUMA COISA===" no começo de uma linha: rede, "POST",
// "LEGENDA", "THREAD". O que vier depois na mesma linha é texto e fica.
const QUALQUER_MARCADOR = /^[ \t]*[#>*_`]*[ \t]*={2,}[ \t]*[*_]*[^=\n]{0,40}?[*_]*[ \t]*={2,}[*_`]*[ \t:]*/gm;
// Rótulo solto no topo do texto ("LinkedIn:", "## Post do Instagram",
// "**Legenda**"): só é tirado quando é a primeira linha e não tem mais nada.
const ROTULO_NO_TOPO = /^[ \t]*(?:#{1,6}[ \t]*)?[*_]{0,2}[ \t]*(?:post|legenda|texto|thread|enquete)?[ \t]*(?:d[oae][ \t]+)?(?:linkedin|x|twitter|instagram|facebook|post|legenda|thread|enquete)[ \t]*[*_]{0,2}[ \t]*:?[ \t]*$/i;

/**
 * A última barreira antes do banco: nenhum marcador de seção chega ao texto
 * de uma peça. Vale para os três posts deste arquivo e para tudo que os
 * redatores da semana escrevem (teste de 29/09: "===LINKEDIN===" na
 * primeira linha do post de sexta, pronto para publicar).
 */
export function limparMarcadores(texto: string): string {
  const linhas = texto
    .replace(QUALQUER_MARCADOR, "")
    .replace(/^[ \t]*=+[ \t]*$/gm, "")
    .split("\n");
  // Tira as linhas vazias e os rótulos soltos do topo, um de cada vez.
  while (linhas.length && (!linhas[0].trim() || ROTULO_NO_TOPO.test(linhas[0]))) linhas.shift();
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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
      maxTokens: 6000,
      cachedPrefix: prefixoCacheavel,
      usage: { operation: "video_redacao", ...usageCtx },
    }
  );

  const posts = separarPorMarcador(resposta);

  if (posts.x.length > MAX_X) {
    posts.x = limparMarcadores(await encurtarParaX(posts.x, prefixoCacheavel, usageCtx));
  }

  return posts;
}
