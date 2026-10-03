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
