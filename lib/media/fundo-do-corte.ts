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
 * ## Por que o fundo é escuro e vazio de propósito
 *
 * Ele existe para a pessoa recortada saltar, e não para ser olhado. Fundo com
 * detalhe competindo com o rosto é o erro clássico de corte vertical: quem
 * assiste não sabe para onde olhar e sai. Por isso o prompt pede profundidade
 * sem assunto, e reserva o centro.
 */

export type FundoDoCorte = {
  /** Data URL da imagem, pronta para virar arquivo. */
  imagem: string;
  /** O que foi pedido, para conferência humana e para o log. */
  descricao: string;
};

/**
 * Gera um fundo alinhado ao nicho de quem gravou.
 *
 * Devolve `null` quando não dá. Mesma regra do resto do fluxo de vídeo: sem
 * fundo o corte sai com cor sólida, que é pior mas existe. Entregar corte
 * mediano é melhor que não entregar corte porque o gerador de imagem teve um
 * dia ruim.
 */
export async function gerarFundoDoCorte(
  nicho: string | null | undefined,
  assunto: string,
  usageCtx?: { projectId?: string }
): Promise<FundoDoCorte | null> {
  const area = (nicho ?? "").trim() || "negócios e tecnologia";

  const prompt = `Crie um FUNDO para um vídeo vertical de rede social. É só o fundo: nenhuma pessoa aparece nele.

CONTEXTO
- Quem grava trabalha com ${area}.
- O assunto do vídeo é: ${assunto}

O QUE O FUNDO PRECISA SER
- Um ambiente com profundidade, fotográfico, com desfoque de fundo forte, como se tivesse sido feito com lente aberta.
- Escuro, em tons dessaturados e frios. A pessoa vai ser sobreposta por cima e precisa saltar.
- Iluminação com uma fonte lateral suave, criando um leve gradiente do canto para o centro.
- Coerente com ${area}, mas SUGERIDO, nunca literal.

REGRAS QUE MANDAM SOBRE O RESTO
- NENHUMA pessoa, rosto, mão ou silhueta humana.
- NENHUM texto, letra, número, logotipo ou marca.
- Nada de objeto nítido e reconhecível no centro: o terço central inferior fica reservado para a pessoa, então mantenha essa área calma e sem detalhe.
- Nada de moldura, borda, vinheta forte, colagem ou divisão em painéis.
- Sem elementos brilhantes ou saturados que puxem o olho para longe do centro.

Formato: vertical 9 por 16, imagem cheia, sem barras.`;

  try {
    const imagem = await generateImage(prompt, "9:16", "standard", {
      operation: "video_fundo_corte",
      ...usageCtx,
    });
    if (!imagem) return null;
    return { imagem, descricao: `fundo de ${area} para: ${assunto}` };
  } catch (e) {
    console.error(
      `[fundo] não consegui gerar o fundo do corte: ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
    return null;
  }
}
