import { conferirResposta } from "@/lib/fornecedores/aviso-de-saldo";
import { custoDaImagemPorTokens, precoDaImagem, recordImagemPorTokens, type ContextoMidia, type UsoDaImagem } from "@/lib/media/usage";
import type { ProporcaoPedida } from "@/lib/media/formatos-das-redes";

/**
 * GPT IMAGE 2, o modelo de imagem da OpenAI, usado no carrossel premium.
 *
 * Por que um segundo fornecedor de imagem, se já existe o Gemini: decisão do
 * Bruno em 18/09, e ela tem uma razão medível por trás. O carrossel é a peça
 * em que o TEXTO DENTRO DA ARTE mais importa, porque cada lâmina carrega uma
 * frase, e o Gemini erra texto com frequência. Na amostra de 18/09, uma arte
 * gerada pela esteira trazia "Rererard" e "naturelgssmeck.com" escritos em
 * letras grandes, num post que foi publicado assim.
 *
 * O preço está na conta e não é pequeno: US$ 0,165 por lâmina em alta
 * qualidade, ou R$ 0,89 no dólar a 5,40. Um carrossel de cinco lâminas custa
 * R$ 4,46, que é vinte e uma vezes o preço de uma imagem no Gemini. É por isso
 * que o carrossel tem cota própria de crédito e não entra de graça no plano.
 *
 * SEM CHAVE ELE NÃO RODA, e isso é de propósito: cair no Gemini em silêncio
 * entregaria o carrossel com o defeito que o carrossel existe para não ter.
 * Quem chama decide o que fazer com o `null`.
 */

/** Os tamanhos que a API de imagem da OpenAI aceita. Não é livre. */
const TAMANHO_ACEITO: Record<ProporcaoPedida, "1024x1024" | "1024x1536" | "1536x1024"> = {
  // 1024x1536 é 2:3, e o carrossel é 4:5. A diferença some no recorte final,
  // e é ela que obriga a margem de segurança do carrossel a ser maior: cortar
  // 2:3 para 4:5 tira 8,3% da altura, em cima da folga que já se pede.
  "4:5": "1024x1536",
  "9:16": "1024x1536",
  "16:9": "1536x1024",
  "1:1": "1024x1024",
};

/**
 * A margem que o carrossel precisa pedir ao modelo.
 *
 * 8% de folga desejada MAIS 8,3% que o recorte de 2:3 para 4:5 come de cima e
 * de baixo. Arredondado para 17%, que é a conta com uma casa de folga.
 */
export const MARGEM_DO_CARROSSEL = 0.17;

export class SemChaveDaOpenAI extends Error {
  readonly semChave = true;
  constructor() {
    super(
      "OPENAI_API_KEY não está configurada. O carrossel premium usa o GPT Image 2, " +
        "que é o modelo com o melhor texto dentro da arte. Configure a chave na Vercel " +
        "e no .env.local para ligar o carrossel."
    );
  }
}

/**
 * A chave está lá e a conta está vazia.
 *
 * Classe própria porque a resposta é DIFERENTE de não ter chave: sem chave, o
 * caminho é configurar; sem saldo, o caminho é pôr crédito na conta, e nenhuma
 * tentativa vai melhorar sozinha.
 */
export class SemSaldoNaOpenAI extends Error {
  readonly semSaldo = true;
  /** De quem é o saldo (lib/fornecedores/saldo.ts lê esta marca). */
  readonly fornecedor = "openai";
  constructor() {
    super(
      "A conta da OpenAI está sem crédito, então o GPT Image 2 não gerou a lâmina. " +
        "A chave está certa: o que falta é saldo. Adicione crédito em " +
        "platform.openai.com/settings/organization/billing e rode de novo."
    );
  }
}

/**
 * Este erro e falta de saldo?
 *
 * PERGUNTA-SE PELA PROPRIEDADE, e nunca por `instanceof`. O motivo apareceu em
 * 19/09: o mesmo modulo pode ser carregado duas vezes no mesmo processo (o tsx
 * faz isso com o sufixo `?tsx-commonjs-export-preparse`, e o Next faz por
 * fronteira de servidor), e ai existem DUAS classes com o mesmo nome. O
 * `instanceof` devolve falso, o `catch` nao reconhece o proprio erro, e o
 * fallback que deveria salvar o dia nao roda.
 *
 * E a mesma razao de `ehErroDeSaldo` em lib/claude existir do mesmo jeito.
 */
export function ehSemSaldoDaOpenAI(e: unknown): boolean {
  return Boolean(e && typeof e === "object" && "semSaldo" in e && (e as { semSaldo?: boolean }).semSaldo);
}

export function temChaveDaOpenAI(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/**
 * Gera uma imagem no GPT Image 2.
 *
 * Devolve data URI. Lança `SemChaveDaOpenAI` quando não há chave, e o erro da
 * API quando ela recusa: aqui NÃO existe cascata de fallback, e a ausência
 * dela é a lição de 18/08. A cascata do Veo trocava de modelo sozinha e
 * quadruplicava o custo sem deixar rastro, com 80% de prejuízo por operação
 * invisível porque nada era gravado. Um fornecedor, um preço, um registro.
 */
export async function gerarImagemOpenAI(
  prompt: string,
  proporcao: ProporcaoPedida,
  ctx?: ContextoMidia
): Promise<string> {
  return (await gerarImagemOpenAIComCusto(prompt, proporcao, ctx, "medium")).dataUrl;
}

/**
 * A qualidade da OpenAI e o nome gravado em `ai_usage` (01/10). "low" entrou
 * como RECUO da arte quando a Higgsfield não responde: com a frase composta em
 * código desde 30/09, o modelo não escreve mais nada na arte, e o que fazia o
 * medium valer o preço (texto certo dentro da imagem) deixou de pesar. O low
 * gasta perto de um quarto dos tokens de saída do medium.
 */
export type QualidadeDaOpenAI = "low" | "medium";
const MODELO_GRAVADO: Record<QualidadeDaOpenAI, string> = { low: "gpt-image-2-low", medium: "gpt-image-2" };

/** A imagem com quem respondeu e quanto custou, lido dos tokens da resposta. */
export async function gerarImagemOpenAIComCusto(
  prompt: string,
  proporcao: ProporcaoPedida,
  ctx: ContextoMidia | undefined,
  qualidade: QualidadeDaOpenAI
): Promise<{ dataUrl: string; modelo: string; custoUsd: number }> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw new SemChaveDaOpenAI();

  const size = TAMANHO_ACEITO[proporcao] ?? "1024x1536";
  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}` },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt,
      size,
      /**
       * MEDIUM, e não high, desde 20/09, e a decisão foi olhando as duas.
       *
       * O GPT Image 2 cobra por token de saída (US$ 30 por milhão), e a
       * qualidade decide quantos tokens uma peça gasta: high, 5.488 tokens,
       * R$ 0,90 e 84 s; medium, 1.372 tokens, R$ 0,23 e 37 s. A MESMA peça
       * (manchete e visual de uma campanha real) foi gerada nas duas e a
       * manchete saiu certa nas duas, com a mesma composição. Um quarto do
       * preço, o dobro da velocidade, sem perder nada que se veja.
       * scripts/tmp/sondar-gpt-image-qualidade.mts é a prova.
       */
      quality: qualidade,
      n: 1,
    }),
    /**
     * 300 SEGUNDOS, e o número é medido, não escolhido.
     *
     * A primeira versão punha 120 s "porque leva dezenas de segundos", e isso
     * era chute: com saldo na conta, a primeira lâmina de verdade estourou os
     * 120 s. Alta qualidade no GPT Image 2 é lenta, e o teto precisa caber no
     * pior caso, não no caso que se imagina.
     *
     * Quem chama tem o teto dele por cima: a esteira roda o carrossel dentro de
     * um trabalho da fila, com 830 s para o dia inteiro. É por isso que o
     * número de lâminas é escolha do cliente e não sobe sozinho.
     */
    signal: AbortSignal.timeout(300_000),
  });

  if (!res.ok) {
    const corpo = await res.text();
    /**
     * SEM SALDO NÃO É ERRO DE CÓDIGO, e a mensagem precisa dizer isso.
     *
     * Achado em 19/09, na primeira chamada com a chave nova: a chave
     * autenticou e a conta tinha zero. A API devolve HTTP 429, que é o mesmo
     * código de "rate limit", e um log dizendo "429" manda a pessoa procurar
     * excesso de chamadas quando o problema é a fatura. É o mesmo tipo de
     * confusão que fez a plataforma inteira parar em silêncio em 08/09, quando
     * a conta da Anthropic ficou sem saldo e todo erro virava "tente de novo".
     */
    // Desde 06/10 vira incidente e aviso ao admin, mesmo quando quem chamou
    // cai no Google em silêncio (lib/fornecedores/aviso-de-saldo.ts).
    if (await conferirResposta("openai", { status: res.status, corpo }, "arte pelo GPT Image")) {
      throw new SemSaldoNaOpenAI();
    }
    throw new Error(`GPT Image 2 recusou (HTTP ${res.status}): ${corpo.slice(0, 220)}`);
  }

  const dados = (await res.json()) as { data?: Array<{ b64_json?: string }>; usage?: UsoDaImagem };
  const b64 = dados.data?.[0]?.b64_json;
  if (!b64) throw new Error("GPT Image 2 respondeu sem imagem.");

  // O custo que a API cobrou, lido dos tokens da resposta, e não da tabela:
  // a qualidade decide o preço e a tabela só conhecia a alta (ver
  // recordImagemPorTokens em lib/media/usage.ts).
  // O mesmo número vai para `ai_usage` e de volta para quem chama. Sem
  // `usage` na resposta, a tabela de lib/media/usage.ts.
  const modelo = MODELO_GRAVADO[qualidade];
  const uso = dados.usage;
  const custoUsd = uso && (uso.output_tokens || uso.input_tokens) ? custoDaImagemPorTokens(uso) : (precoDaImagem(modelo) ?? 0);
  if (ctx) recordImagemPorTokens(modelo, uso, ctx);
  return { dataUrl: `data:image/png;base64,${b64}`, modelo, custoUsd };
}

/**
 * A EDIÇÃO COM IMAGEM DE REFERÊNCIA no GPT Image 2 (05/10/2026).
 *
 * Decisão do Bruno: a arte de post sai primeiro do GPT Image 2 ou do Gemini
 * COM A FOTO DO CLIENTE DE REFERÊNCIA, e a Higgsfield fica em terceiro
 * (lib/media/gerador-com-referencia.ts). Aqui é o `images/edits` da OpenAI:
 * a foto vai como arquivo (multipart) junto do prompt, e o modelo compõe a
 * cena mantendo a pessoa. Mesmo custo por token do `generations`, mais os
 * tokens da imagem de entrada, gravados em `ai_usage` pelo mesmo caminho.
 * Sem chave lança `SemChaveDaOpenAI`; sem saldo, `SemSaldoNaOpenAI`.
 */
export async function editarImagemOpenAIComCusto(
  prompt: string,
  referencia: { buffer: Buffer; mime: string },
  proporcao: ProporcaoPedida,
  ctx: ContextoMidia | undefined,
  qualidade: QualidadeDaOpenAI
): Promise<{ dataUrl: string; modelo: string; custoUsd: number }> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw new SemChaveDaOpenAI();
  const size = TAMANHO_ACEITO[proporcao] ?? "1024x1536";
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("size", size);
  form.append("quality", qualidade);
  form.append("n", "1");
  const extensao = referencia.mime === "image/png" ? "png" : referencia.mime === "image/webp" ? "webp" : "jpg";
  form.append("image", new Blob([new Uint8Array(referencia.buffer)], { type: referencia.mime }), `referencia.${extensao}`);
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}` },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) {
    const corpo = await res.text();
    if (await conferirResposta("openai", { status: res.status, corpo }, "arte com foto de referência pelo GPT Image")) throw new SemSaldoNaOpenAI();
    throw new Error(`GPT Image 2 (edição) recusou (HTTP ${res.status}): ${corpo.slice(0, 220)}`);
  }
  const dados = (await res.json()) as { data?: Array<{ b64_json?: string }>; usage?: UsoDaImagem };
  const b64 = dados.data?.[0]?.b64_json;
  if (!b64) throw new Error("GPT Image 2 (edição) respondeu sem imagem.");
  const modelo = `${MODELO_GRAVADO[qualidade]}-edit`;
  const uso = dados.usage;
  const custoUsd = uso && (uso.output_tokens || uso.input_tokens) ? custoDaImagemPorTokens(uso) : (precoDaImagem(MODELO_GRAVADO[qualidade]) ?? 0);
  if (ctx) recordImagemPorTokens(modelo, uso, ctx);
  return { dataUrl: `data:image/png;base64,${b64}`, modelo, custoUsd };
}
