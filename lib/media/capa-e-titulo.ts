import { askClaude } from "@/lib/claude";
import { comporSobreImagem } from "@/lib/media/nano-banana";
import type { Trecho } from "@/lib/media/select-clips";

/**
 * O que acompanha cada corte: título, descrição e a capa.
 *
 * Decisão do Bruno em 23/08: "se ele gosta e pede para seguir, aí deve gerar
 * título, descrição, thumbnail, tudo automático. O trabalho do usuário deve ser
 * aprovar apenas."
 *
 * E a capa é COMPOSIÇÃO sobre o quadro real da gravação, não arte gerada do
 * zero (opção A, escolhida por ele). Motivo de resultado: capa sem o rosto de
 * quem fala rende menos em canal pessoal, e o rosto já está no quadro.
 */

export type TextoDoCorte = {
  /** Até 100 caracteres, que é o teto do YouTube. */
  titulo: string;
  /** O que vai na descrição do vídeo, ou na legenda do Reels. */
  descricao: string;
  /**
   * A frase curta que aparece ESCRITA na capa. Não é o título: título é para
   * ler na listagem, a frase da capa é para ler de relance num celular.
   */
  fraseDaCapa: string;
};

const SISTEMA = `Você escreve o que acompanha um corte de vídeo curto.

Recebe o momento que o squad escolheu: o título de trabalho, a tese e o que a pessoa falou.

Devolva três coisas, e cada uma tem um trabalho diferente:

1. "titulo": no máximo 100 caracteres, para a pessoa decidir se clica. Diga a tese, não o assunto. "Consultoria não escala e eu levei dois anos pra aceitar" é título. "Sobre consultoria" não é nada.

2. "descricao": de 2 a 4 frases, na voz de quem falou, contando o que a pessoa vai encontrar ali. Sem "neste vídeo você vai aprender". Termine com uma pergunta ou uma provocação que caiba nos comentários.

3. "fraseDaCapa": no máximo 6 PALAVRAS, para ler de relance num celular pequeno. É o que vai escrito por cima da imagem. Frase de impacto, não resumo. Prefira contraste ("Consultoria não escala") a descrição ("Sobre modelos de negócio").

Regras de escrita:
- Português do Brasil.
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Nunca invente fato, número ou nome que não esteja no que a pessoa falou.
- Nada de emoji no título nem na frase da capa.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string:
{"titulo":"...","descricao":"...","fraseDaCapa":"..."}`;

export async function escreverTextoDoCorte(
  trecho: Trecho,
  contexto: { nicho?: string | null; publico?: string | null; voz?: string | null },
  usageCtx?: { projectId?: string }
): Promise<TextoDoCorte> {
  const perfil = [
    contexto.nicho ? `Nicho: ${contexto.nicho}` : "",
    contexto.publico ? `Público: ${contexto.publico}` : "",
    contexto.voz ? `Tom de voz: ${contexto.voz}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const resposta = await askClaude(
    SISTEMA,
    `${perfil ? perfil + "\n\n" : ""}Título de trabalho: ${trecho.titulo}
Tese: ${trecho.ideia}

O que a pessoa falou, literalmente:
${trecho.transcricao}`,
    { maxTokens: 4000, usage: { operation: "video_capa_texto", ...usageCtx } }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  const dados = JSON.parse(limpo) as Partial<TextoDoCorte>;

  return {
    // O corte de 100 acontece aqui e não no prompt: o modelo é instruído mas
    // não garante, e título estourado é recusado pelo YouTube na publicação,
    // depois de o cliente já ter aprovado.
    titulo: (dados.titulo ?? trecho.titulo ?? "").slice(0, 100),
    descricao: dados.descricao ?? trecho.ideia ?? "",
    fraseDaCapa: (dados.fraseDaCapa ?? trecho.titulo ?? "").slice(0, 60),
  };
}

/**
 * A capa: o quadro real da gravação, com a frase escrita por cima.
 *
 * O prompt descreve ACABAMENTO, e não conteúdo, de propósito. Pedir cena nova
 * faria o modelo substituir a pessoa por alguém inventado, que é o oposto do
 * que a decisão do Bruno quis. Aqui ele só põe texto, contraste e enquadramento
 * em cima do que já existe.
 *
 * Devolve null quando não dá. Nesse caso a capa continua sendo o quadro real
 * sem tratamento, que é pior mas honesto, em vez de uma arte genérica sem o
 * cliente dentro.
 */
export async function comporCapa(
  quadroBase64: string,
  frase: string,
  usageCtx?: { projectId?: string }
): Promise<string | null> {
  const prompt = `Esta é uma captura real de um vídeo. Mantenha a pessoa e a cena exatamente como estão, sem substituir, redesenhar nem alterar o rosto.

Trate esta imagem como capa de vídeo, fazendo apenas isto:
1. Escreva o texto "${frase}" em letras grandes, muito legíveis, em português, com boa margem das bordas. Posicione onde não cobrir o rosto da pessoa.
2. Use tipografia pesada, sem serifa, branca com contorno ou sombra escura, para ler em miniatura pequena.
3. Aumente levemente o contraste e a saturação da imagem para ela se destacar numa lista de vídeos.
4. Não adicione logotipos, marcas d'água, molduras, setas, círculos vermelhos nem elementos decorativos.

O resultado deve continuar sendo claramente a mesma foto, com o texto aplicado por cima.`;

  return comporSobreImagem(prompt, quadroBase64, "image/jpeg", {
    operation: "video_capa",
    ...usageCtx,
  });
}
