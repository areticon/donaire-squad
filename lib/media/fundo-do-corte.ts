import { generateImage } from "@/lib/media/nano-banana";

/**
 * O fundo dos cortes verticais, gerado por IA.
 *
 * ## Por que imagem, e não vídeo gerado
 *
 * O Bruno pediu fundo cinematográfico e sugeriu o Seedance 2.5. Fui ver o preço
 * antes de instalar, em 24/08:
 *
 *   480p   US$ 0,138 por segundo
 *   720p   US$ 0,296
 *   1080p  US$ 0,532
 *
 * Os cortes saem em 1080x1920. Um vídeo com sete cortes, com fundo de trinta
 * segundos em 720p, custaria **R$ 336**. O trabalho de vídeo rende **R$ 4,48**.
 * Mesmo um laço de cinco segundos repetido dá R$ 56 por vídeo, doze vezes a
 * receita.
 *
 * É a mesma conta que matou o Veo em 18/08: R$ 18,05 de custo contra R$ 10,00 de
 * receita. Com a margem atual, vídeo gerado por segundo não fecha, e não é
 * questão de gosto.
 *
 * Imagem resolve: custa centavos, sai em resolução alta, e **fundo de corte não
 * precisa se mexer**. O que se mexe é a pessoa. O movimento entra em ffmpeg, com
 * zoom lento, que custa zero.
 *
 * ## O brilho do fundo é a sacada do Bruno, e ela foi medida
 *
 * Em 24/08 ele olhou o recorte e disse: "o recorte do fundo fica com um borrado
 * branco, porque o fundo original era branco. O agente deve saber disso: se o
 * fundo original é branco, então o fundo do reels deve ser cinematográfico, mas
 * branco, para diminuir o efeito ruim do borrado."
 *
 * Ele está certo, e o número é maior do que parecia. A parede da gravação dele
 * tem brilho **241 de 255**. O fundo gerado pelo prompt antigo tinha **49**. A
 * borda da máscara é semitransparente por construção, então cada pixel da borda
 * mistura os dois, e uma diferença de quase 200 pontos vira um anel branco
 * gritante em volta da silhueta. Medido no corte de produção: anel em 136
 * contra 91 do fundo ao redor.
 *
 * Casar o brilho não melhora o recorte, ele tira do halo o contraste que o faz
 * aparecer. É a solução certa porque ataca a causa e não o sintoma.
 *
 * ## Por que a instrução de "reservar espaço" saiu do prompt
 *
 * O prompt anterior pedia: "o terço central inferior fica reservado para a
 * pessoa, então mantenha essa área calma e sem detalhe". O modelo obedeceu ao
 * pé da letra e desenhou um RETÂNGULO VAZIO. Medido na imagem que foi para
 * produção: 768x1376, com o maior salto de brilho na linha 727, que é 53% da
 * altura, e abaixo dela a variação média era de 0,22 por linha. Quase metade da
 * imagem era uma área chapada, com borda dura atravessando o quadro.
 *
 * Era isso o "amador demais, imagem distorcida" que ele descreveu, e a culpa era
 * nossa e não do modelo.
 *
 * A troca que resolveu: dizer o que a fotografia É, em vocabulário de
 * fotografia, em vez de proibir conteúdo numa região. "A metade de baixo é uma
 * superfície contínua e fora de foco" produz um piso desfocado; "mantenha essa
 * área sem detalhe" produz um buraco. Medido nas duas versões, mesmo assunto:
 *
 *   prompt antigo   brilho  49, 13% das linhas chapadas, maior salto 13
 *   prompt novo     brilho 207,  0% das linhas chapadas, maior salto 11
 */

export type FundoDoCorte = {
  /** Data URL da imagem, pronta para virar arquivo. */
  imagem: string;
  /** O que foi pedido, para conferência humana e para o log. */
  descricao: string;
  /**
   * O brilho que o fundo DEVERIA ter, de 0 a 255, medido na gravação original.
   *
   * Vai junto porque o modelo chega perto e não acerta: pedindo claro ele
   * devolveu 194 e 207 em duas tentativas, contra um alvo de 241. Quem compõe
   * corrige a diferença que sobrou, que é aritmética e não deve depender de o
   * modelo ter um bom dia.
   */
  brilhoAlvo: number;
};

/** Acima disto, o fundo original é considerado claro. */
const CLARO = 150;

/**
 * Gera um fundo alinhado ao nicho de quem gravou e ao brilho da gravação.
 *
 * Devolve `null` quando não dá. Mesma regra do resto do fluxo de vídeo: sem
 * fundo o corte sai com a composição antiga, que é pior mas existe. Entregar
 * corte mediano é melhor que não entregar corte porque o gerador de imagem teve
 * um dia ruim.
 */
export async function gerarFundoDoCorte(
  nicho: string | null | undefined,
  assunto: string,
  /**
   * Brilho médio do fundo ATRÁS da pessoa na gravação, de 0 a 255. Sem medição,
   * cai em 200: o caso comum é gravar em casa ou no escritório com luz, e errar
   * para o lado claro custa menos, porque halo claro sobre fundo claro some e
   * halo claro sobre fundo escuro grita.
   */
  brilhoDoOriginal: number | null | undefined,
  usageCtx?: { projectId?: string }
): Promise<FundoDoCorte | null> {
  const area = (nicho ?? "").trim() || "negócios e tecnologia";
  const alvo = Math.max(0, Math.min(255, Math.round(brilhoDoOriginal ?? 200)));
  const claro = alvo >= CLARO;

  const prompt = `Fotografia de um ambiente vazio, para servir de fundo de um vídeo vertical.

A CENA
- Um ambiente real de trabalho, coerente com ${area}, sugerido e nunca literal.
- O assunto do vídeo é: ${assunto}
- Fotografada de dentro do ambiente, à altura dos olhos, com a parede de fundo a três ou quatro metros da câmera.
- Lente de 85mm em f/1.8: o fundo inteiro fica suavemente desfocado, com bokeh limpo e sem duplicar contornos.
- ${
    claro
      ? "Ambiente CLARO e arejado, paredes claras, luz natural difusa entrando de uma janela lateral fora do quadro. A imagem inteira é luminosa, em tons claros e neutros, sem sombra pesada em nenhum canto."
      : "Ambiente ESCURO e discreto, paredes escuras, uma única luz lateral suave. Tons frios e dessaturados, sem preto chapado e sem sombra sem informação."
  }
- A metade de baixo do quadro é uma superfície contínua e fora de foco, como um tampo ou um piso visto de perto, sem nenhum objeto em cima dela.

O QUE NÃO PODE APARECER
- Nenhuma pessoa, rosto, mão ou silhueta.
- Nenhum texto, letra, número, logotipo ou marca.
- Nenhuma linha horizontal dura atravessando o quadro, nenhuma faixa de cor sólida, nenhuma divisão em painéis.
- Nenhuma moldura, borda ou vinheta.

ENQUADRAMENTO
Vertical 9 por 16, imagem cheia até as bordas, sem barras e sem margens.`;

  try {
    // `hd` aqui pede 2K ao modelo, que devolve 1536x2752. É o menor tamanho que
    // dispensa ampliação para chegar em 1080x1920.
    const imagem = await generateImage(prompt, "9:16", "hd", {
      operation: "video_fundo_corte",
      ...usageCtx,
    });
    if (!imagem) return null;
    return {
      imagem,
      descricao:
        `fundo ${claro ? "claro" : "escuro"} de ${area} para: ${assunto} ` +
        `(brilho alvo ${alvo})`,
      brilhoAlvo: alvo,
    };
  } catch (e) {
    console.error(
      `[fundo] não consegui gerar o fundo do corte: ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
    return null;
  }
}
