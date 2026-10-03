/**
 * O FORMATO DE CADA REDE, num lugar só.
 *
 * Existe por causa da medição de 18/09: as dez últimas imagens publicadas
 * saíram TODAS em 1376x768, em Instagram, Facebook, LinkedIn e X. Esse tamanho
 * não é de rede nenhuma, é o padrão do modelo de imagem quando ninguém pede
 * nada. A esteira gerava uma arte por dia e a mesma arte ia para as quatro
 * redes, então o erro era invisível: nenhuma tela mostrava o corte que cada
 * rede faz depois.
 *
 * Duas ideias sustentam este arquivo, e elas são diferentes:
 *
 *   1. a PROPORÇÃO é o que se pede ao modelo, e é o que custa dinheiro. Cada
 *      proporção pedida é uma geração a mais;
 *   2. o TAMANHO EXATO é o que se entrega para a rede, e sai de recorte local
 *      com o sharp, que é de graça.
 *
 * Por isso LinkedIn, Facebook e X compartilham uma geração só (os três são
 * paisagem) e o Instagram tem a dele (retrato 4:5). Dois modelos de imagem por
 * dia, e não quatro: gerar uma arte por REDE seria pagar quatro vezes por uma
 * diferença que o recorte resolve.
 *
 * Fontes dos tamanhos, conferidas em 18/09 e registradas no card 509:
 * Instagram 1080x1350 (4:5) ou 1080x1080; LinkedIn 1200x627 ou quadrado;
 * Facebook 1200x630; X 1600x900; carrossel 1080x1350 com TODAS as lâminas na
 * mesma proporção.
 */

/** As proporções que a API de imagem do Google aceita e que a gente usa. */
export type ProporcaoPedida = "1:1" | "4:5" | "16:9" | "9:16";

export interface FormatoDaRede {
  /** O que se pede ao modelo. Redes que compartilham isto compartilham a arte. */
  proporcao: ProporcaoPedida;
  /** O que a rede recebe, em pixel, depois do recorte. */
  largura: number;
  altura: number;
  /** Para log e para o card: "Instagram 1080x1350 (4:5)". */
  rotulo: string;
}

/**
 * A MARGEM DE SEGURANÇA, em fração do lado menor.
 *
 * 8% é o que a arte precisa deixar livre em cada borda para sobreviver ao
 * recorte de proporção mais agressivo que a gente faz (16:9 para 1,91:1 tira
 * 3,5% de cima e 3,5% de baixo) e ainda chegar na rede com folga visível.
 *
 * Não é estética: é a conta do recorte mais a folga. A arte do "61%" de 18/09
 * tinha ZERO, e o número chegou cortado ao cliente.
 */
export const MARGEM_SEGURA = 0.08;

const PAISAGEM_LI: FormatoDaRede = { proporcao: "16:9", largura: 1200, altura: 627, rotulo: "LinkedIn 1200x627" };
const PAISAGEM_FB: FormatoDaRede = { proporcao: "16:9", largura: 1200, altura: 630, rotulo: "Facebook 1200x630" };
const PAISAGEM_X: FormatoDaRede  = { proporcao: "16:9", largura: 1600, altura: 900, rotulo: "X 1600x900" };
const RETRATO_IG: FormatoDaRede  = { proporcao: "4:5",  largura: 1080, altura: 1350, rotulo: "Instagram 1080x1350 (4:5)" };
const VERTICAL: FormatoDaRede    = { proporcao: "9:16", largura: 1080, altura: 1920, rotulo: "vertical 1080x1920 (9:16)" };

/**
 * O CARROSSEL É 4:5 EM TODAS AS REDES, e isso não é preferência.
 *
 * O Instagram trava a proporção da PRIMEIRA lâmina para o carrossel inteiro:
 * lâmina fora do padrão entra recortada, e o recorte cai sempre no mesmo lugar
 * em todas as seguintes. Misturar proporção dentro de um carrossel é a forma
 * mais rápida de entregar dez peças tortas de uma vez.
 */
const CARROSSEL: FormatoDaRede = { proporcao: "4:5", largura: 1080, altura: 1350, rotulo: "carrossel 1080x1350 (4:5)" };

/** Redes que aceitam carrossel. O X não aceita, e o YouTube não tem feed de imagem. */
export const REDES_COM_CARROSSEL = ["instagram", "linkedin", "facebook"] as const;

/** Quantas lâminas cada rede aceita num carrossel. */
export const MAXIMO_DE_LAMINAS: Record<string, number> = {
  instagram: 20,
  linkedin: 20,
  facebook: 10,
};

/**
 * O formato que uma peça precisa ter, dada a rede e o tipo de conteúdo.
 *
 * Rede desconhecida cai no formato do LinkedIn, que é o mais conservador dos
 * paisagem: 1,91:1 cabe recortado em quase tudo. Nunca devolve `undefined`,
 * porque um `undefined` aqui volta a ser "o tamanho que o modelo quiser", que
 * é exatamente o defeito que este arquivo existe para matar.
 */
export function formatoDaPeca(platform: string, contentType?: string): FormatoDaRede {
  const rede = (platform ?? "").toLowerCase();
  const tipo = (contentType ?? "image").toLowerCase();

  if (tipo === "carousel") return CARROSSEL;
  if (tipo === "video" || tipo === "reels" || tipo === "stories") {
    // O X publica vídeo em paisagem; o resto das redes usa o vertical.
    return rede === "twitter" || rede === "x" || rede === "linkedin" ? PAISAGEM_X : VERTICAL;
  }

  switch (rede) {
    case "instagram":
      return RETRATO_IG;
    case "facebook":
      return PAISAGEM_FB;
    case "twitter":
    case "x":
      return PAISAGEM_X;
    case "youtube":
      return { proporcao: "16:9", largura: 1280, altura: 720, rotulo: "YouTube 1280x720" };
    case "linkedin":
    default:
      return PAISAGEM_LI;
  }
}

export interface GrupoDeFormato {
  proporcao: ProporcaoPedida;
  /** As redes que saem desta geração, cada uma com o recorte final dela. */
  redes: Array<{ platform: string; formato: FormatoDaRede }>;
}

/**
 * Agrupa as redes do dia por PROPORÇÃO, que é a unidade de custo.
 *
 * Quatro redes viram dois grupos no caso comum (paisagem e retrato), ou seja
 * duas chamadas ao modelo de imagem em vez de uma. É mais caro que hoje e mais
 * barato que o óbvio: uma arte por rede seriam quatro.
 *
 * A ordem é estável (a proporção de mais redes primeiro) porque o log da
 * execução é lido por gente, e lista que troca de ordem a cada run não se lê.
 */
export function gruposDeFormato(platforms: string[], contentType?: string): GrupoDeFormato[] {
  const porProporcao = new Map<ProporcaoPedida, GrupoDeFormato>();
  for (const platform of platforms) {
    const formato = formatoDaPeca(platform, contentType);
    const grupo = porProporcao.get(formato.proporcao) ?? { proporcao: formato.proporcao, redes: [] };
    grupo.redes.push({ platform, formato });
    porProporcao.set(formato.proporcao, grupo);
  }
  return [...porProporcao.values()].sort(
    (a, b) => b.redes.length - a.redes.length || a.proporcao.localeCompare(b.proporcao)
  );
}

/**
 * O pedaço de prompt que manda o modelo respeitar a margem.
 *
 * Vai em INGLÊS porque é o idioma dos prompts de imagem do projeto inteiro, e
 * porque o modelo obedece instrução de composição melhor em inglês.
 *
 * Diz a proporção por extenso além do número: "vertical portrait" pesa mais na
 * composição do que "4:5" sozinho, que o modelo às vezes trata como sugestão.
 */
export function instrucaoDeFormato(proporcao: ProporcaoPedida, margem: number = MARGEM_SEGURA): string {
  const forma =
    proporcao === "4:5" ? "vertical portrait (taller than wide)"
    : proporcao === "9:16" ? "tall vertical (story format)"
    : proporcao === "1:1" ? "perfect square"
    : "horizontal landscape (wider than tall)";
  // `margem` é parâmetro porque o recorte não é igual em toda peça: o carrossel
  // nasce em 2:3 no GPT Image 2 e termina em 4:5, e esse recorte sozinho come
  // 8,3% da altura. Pedir os mesmos 8% ali deixaria a arte com folga zero.
  const pct = Math.round(margem * 100);
  return [
    `COMPOSITION FORMAT: ${forma}, aspect ratio ${proporcao}.`,
    `SAFE MARGIN — MANDATORY: keep every piece of text, every number, every logo and every`,
    `important subject fully inside the central area, at least ${pct}% away from all four edges.`,
    `Nothing readable may touch or be clipped by the frame border. Leave the outer ${pct}% as`,
    `background, texture or empty space only. This image will be cropped slightly by each social`,
    `network, and anything near the edge gets cut off.`,
  ].join("\n");
}
