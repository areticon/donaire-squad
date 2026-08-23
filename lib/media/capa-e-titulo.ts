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
 * A capa: o quadro com o ROSTO, tratado como thumbnail de YouTube.
 *
 * O prompt foi refeito em 23/08 depois de uma crítica do Bruno com exemplo na
 * mão. A primeira versão pegava um quadro qualquer do trecho, que numa gravação
 * com slides caía numa tela compartilhada, e escrevia um texto branco simples
 * por cima. O resultado era feio e ninguém clicaria.
 *
 * Duas coisas mudaram por causa disso:
 *
 * 1. O quadro vem de uma varredura do vídeo INTEIRO procurando rosto grande,
 *    e não de dentro do trecho. Ver `EscolhaDeCapa` em `enquadramento.ts`.
 * 2. O prompt descreve o padrão de thumbnail que funciona, e não "escreva um
 *    texto em cima". As referências que o Bruno mandou (canal do Dan Martell)
 *    têm todas o mesmo esqueleto: pouquíssimas palavras em corpo enorme,
 *    contraste alto, uma palavra destacada em bloco de cor, a pessoa grande
 *    olhando para a câmera, e o texto nunca cobrindo o rosto.
 *
 * O que continua valendo: é COMPOSIÇÃO, não geração. A pessoa não pode ser
 * substituída, e a instrução de preservar o rosto é a primeira do prompt.
 */
export async function comporCapa(
  quadroBase64: string,
  frase: string,
  usageCtx?: { projectId?: string }
): Promise<string | null> {
  // A palavra destacada é a mais longa da frase, que quase sempre é a que
  // carrega o sentido ("consultoria", "escala", "sozinho"). Deixar o modelo
  // escolher produzia destaque em preposição.
  const palavras = frase.split(/\s+/).filter(Boolean);
  const destaque = palavras.reduce((a, b) => (b.length > a.length ? b : a), palavras[0] ?? "");

  const prompt = `Você está montando a THUMBNAIL de um vídeo de YouTube a partir desta captura real.

REGRA MAIS IMPORTANTE: a pessoa da imagem é uma pessoa real. Mantenha o rosto, o corpo, a roupa e a identidade dela exatamente como estão. Não substitua, não redesenhe o rosto, não troque por outra pessoa, não gere alguém novo.

Faça o seguinte, no estilo das thumbnails que funcionam em canal pessoal:

TEXTO
- Escreva exatamente: "${frase}"
- Corpo ENORME, ocupando de um terço a metade da largura da imagem. Se em dúvida, aumente.
- Fonte sem serifa, muito pesada, condensada, em caixa alta.
- Branco com contorno escuro grosso, OU preto sobre um bloco de cor sólida.
- Destaque a palavra "${destaque}" com um bloco de cor sólida atrás dela (amarelo forte ou o laranja da marca), em contraste com o resto do texto.
- O texto NUNCA pode cobrir o rosto da pessoa. Ponha acima, abaixo ou ao lado, no espaço vazio.

PESSOA
- Ela precisa aparecer grande e nítida, com o rosto bem visível.
- Aumente o contraste e a nitidez dela para separar do fundo.

FUNDO
- Simplifique. Escureça, desfoque levemente ou limpe elementos que competem com o rosto e com o texto.
- Se houver conteúdo de tela ou slide atrás, deixe apenas como textura de fundo, sem tentar manter o texto dele legível.

NÃO FAÇA
- Nada de logotipo, marca d'água, moldura, borda arredondada, setas, círculos vermelhos ou emoji.
- Nada de texto além da frase pedida. Nenhuma legenda extra, nenhuma assinatura.
- Não invente números nem promessas que não estejam na frase.

Formato final: 16 por 9, cheio, sem barras.`;

  return comporSobreImagem(prompt, quadroBase64, "image/jpeg", {
    operation: "video_capa",
    ...usageCtx,
  });
}
