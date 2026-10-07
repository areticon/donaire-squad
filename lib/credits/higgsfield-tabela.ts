/**
 * A TABELA DA ABERTURA POR IA (Higgsfield), sem banco.
 *
 * Mora separada de `lib/media/higgsfield.ts` pelo mesmo motivo de
 * `video-tabela.ts`: a tela (componente cliente) precisa mostrar o preço com a
 * MESMA conta que o servidor cobra, e aquele módulo importa Blob e Prisma.
 *
 * Aprovado pelo dono em 29/09/2026: Kling 3.0 Pro, imagem para vídeo, sem som,
 * 3 s por geração, US$ 0,336 cada, cobrado à parte do preço da edição.
 *
 * A conversão para crédito usa as premissas da casa. Desde 01/10: dólar a
 * R$ 5,36 já com IOF e no máximo R$ 0,027 de custo de IA por crédito, a régua
 * do preço de 01/10 em `lib/media/limits.ts` (é o que deixa o Enterprise acima
 * de 70% de margem). US$ 0,336 vira R$ 1,80, que são 66,7 créditos,
 * arredondado para cima: 67.
 *
 * Até 30/09: dólar a R$ 5,40 e R$ 0,031 por crédito, 59 créditos.
 */

export const DOLAR_POR_GERACAO_HIGGSFIELD = 0.336;
// Até 30/09: export const REAIS_POR_DOLAR = 5.4;
// Até 30/09: export const REAIS_POR_CREDITO = 0.031;
export const REAIS_POR_DOLAR = 5.36;
export const REAIS_POR_CREDITO = 0.027;

export const CREDITOS_POR_GERACAO_HIGGSFIELD = Math.ceil(
  (DOLAR_POR_GERACAO_HIGGSFIELD * REAIS_POR_DOLAR) / REAIS_POR_CREDITO
);

/**
 * Efeitos que o worker desenha sem IA (clarão, falha digital, luz vazada são
 * sobreposições curtas no ffmpeg): escolher só esses não pede Higgsfield.
 */
export const EFEITOS_SO_NO_FFMPEG = ["glitch", "flash", "luz-vazada"];

type EscolhaMinima = { camera?: string[] | null; efeitos?: string[] | null } | null | undefined;

/**
 * Quantas gerações cada corte pede, pela escolha do projeto.
 *
 *  - ABERTURA: sempre que o cliente escolheu algum movimento de câmera ou
 *    algum efeito que só a IA faz. Sem movimento escolhido, usa a aproximação
 *    lenta (dolly in), que é o movimento neutro de abertura;
 *  - CENA DE APOIO: só quando há efeito de IA escolhido. Sem efeito, ela seria
 *    o mesmo quadro com outro movimento, e cobrar por isso é cobrar repetição.
 */
export function geracoesPorCorte(escolha: EscolhaMinima): { abertura: boolean; apoio: boolean; total: number } {
  const camera = (escolha?.camera ?? []).filter(Boolean);
  const efeitosIa = (escolha?.efeitos ?? []).filter((e) => e && !EFEITOS_SO_NO_FFMPEG.includes(e));
  const abertura = camera.length > 0 || efeitosIa.length > 0;
  const apoio = efeitosIa.length > 0;
  return { abertura, apoio, total: Number(abertura) + Number(apoio) };
}

/** Créditos por corte, pela escolha. Zero quando a escolha não pede IA. */
export function creditosDaAberturaPorCorte(escolha: EscolhaMinima): number {
  return geracoesPorCorte(escolha).total * CREDITOS_POR_GERACAO_HIGGSFIELD;
}

// ─────────────────────────────── os preços por geração (05/10) ───────────────────────────────

/**
 * O PREÇO CHEIO DE CADA GERAÇÃO NA HIGGSFIELD, em dólar, numa tabela PURA
 * (05/10/2026, editor por comando): a tela de aprovação do roteiro mostra a
 * estimativa do vídeo antes de gerar, com a MESMA conta que o servidor usa.
 * `lib/media/higgsfield.ts` (vídeo) e `lib/media/imagem-higgsfield.ts`
 * (imagem) leem daqui, para não existir uma segunda cópia do preço.
 *
 * Vídeo: US$ por segundo, sem som gerado (levantado em 29/09 nas páginas de
 * cada modelo; a API cobra em dólar, falha não é cobrada). Imagem: US$ por
 * imagem na configuração que a montagem pede (o medium do GPT Image 2.5 é
 * estimativa, a conferir no painel; ver imagem-higgsfield.ts).
 */
export const DOLAR_POR_SEGUNDO_DE_VIDEO = {
  "kling-std": 0.084,
  "kling-pro": 0.112,
  "seedance-25": 0.4622,
} as const;

/** Com som gerado (a edição não usa; fica para comparar). */
export const DOLAR_POR_SEGUNDO_DE_VIDEO_COM_SOM = {
  "kling-std": 0.126,
  "kling-pro": 0.168,
  "seedance-25": 0.4622,
} as const;

/** A faixa de segundos que cada modelo de vídeo aceita (e cobra). */
export const SEGUNDOS_DO_VIDEO = {
  "kling-std": { min: 3, max: 15 },
  "kling-pro": { min: 3, max: 15 },
  "seedance-25": { min: 4, max: 30 },
} as const;

export const DOLAR_POR_IMAGEM = {
  "higgsfield-gpt-image-2.5-low": 0.025,
  "higgsfield-gpt-image-2.5-medium": 0.06,
  // HIGH (07/10, jornada do editor em qualidade alta por decisão do Bruno): 2,8x o medium na prova A/B de 02/10; estimativa, a conferir no painel.
  "higgsfield-gpt-image-2.5-high": 0.168,
  "higgsfield-recraft-v4.1": 0.035,
  "higgsfield-grok-imagine-2.0": 0.08,
} as const;

/** O recorte do fundo (BiRefNet na fal) das fotos de papel. */
export const DOLAR_POR_RECORTE = 0.003;

/** O que a edição usa: a imagem é a "colagem" (GPT Image 2.5 medium) e o vídeo o Kling 3.0 Pro. */
export const IMAGEM_DA_EDICAO = "higgsfield-gpt-image-2.5-medium" as const;
export const VIDEO_DA_EDICAO = "kling-pro" as const;

/** O custo de UM vídeo da edição com `segundos` (arredondado para a faixa que o modelo cobra). */
export function dolarDoVideoDaEdicao(segundos: number, modelo: keyof typeof DOLAR_POR_SEGUNDO_DE_VIDEO = VIDEO_DA_EDICAO): number {
  const f = SEGUNDOS_DO_VIDEO[modelo];
  const cobrados = Math.min(f.max, Math.max(f.min, Math.ceil(segundos)));
  return +(cobrados * DOLAR_POR_SEGUNDO_DE_VIDEO[modelo]).toFixed(4);
}
