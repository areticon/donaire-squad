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

/**
 * A expressão que a capa deve mostrar.
 *
 * Quem escolhe é o agente que leu a fala, e não o de imagem: a emoção certa sai
 * do CONTEÚDO do trecho, e o modelo de imagem só vê um quadro parado.
 *
 * Existe porque o quadro real quase sempre pega a pessoa no meio de uma sílaba,
 * de boca aberta ou de olho fechado (apontado pelo Bruno em 23/08). Um quadro
 * ao lado a postura já mudou, então escolher melhor ajuda mas não resolve: em
 * vídeo de fala contínua, a maioria dos quadros é ruim como foto.
 */
export type Expressao =
  | "confiante"
  | "serio"
  | "curioso"
  | "surpreso"
  | "preocupado";

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
  /** A emoção que a capa deve transmitir, tirada do que a pessoa falou. */
  expressao: Expressao;
  /** O fundo novo, descrito em uma frase, alinhado ao nicho do cliente. */
  cenario: string;
};

const SISTEMA = `Você escreve o que acompanha um corte de vídeo curto.

Recebe o momento que o squad escolheu: o título de trabalho, a tese e o que a pessoa falou.

Devolva três coisas, e cada uma tem um trabalho diferente:

1. "titulo": no máximo 100 caracteres, para a pessoa decidir se clica. Diga a tese, não o assunto. "Consultoria não escala e eu levei dois anos pra aceitar" é título. "Sobre consultoria" não é nada.

2. "descricao": de 2 a 4 frases, na voz de quem falou, contando o que a pessoa vai encontrar ali. Sem "neste vídeo você vai aprender". Termine com uma pergunta ou uma provocação que caiba nos comentários.

3. "fraseDaCapa": no máximo 6 PALAVRAS, para ler de relance num celular pequeno. É o que vai escrito por cima da imagem. Frase de impacto, não resumo. Prefira contraste ("Consultoria não escala") a descrição ("Sobre modelos de negócio").

4. "expressao": a emoção que o rosto da pessoa deve transmitir na capa, escolhida pelo que ela falou. Um destes valores exatos:
   - "confiante": ela afirma algo que sabe, sorriso leve e olhar firme. É o padrão quando em dúvida.
   - "serio": ela nomeia um erro, uma perda ou uma verdade dura.
   - "curioso": ela levanta uma pergunta ou promete revelar algo.
   - "surpreso": ela conta algo contraintuitivo, um número que choca.
   - "preocupado": ela alerta sobre um risco.

5. "cenario": em UMA frase, descreva um fundo novo para a capa, alinhado ao nicho do cliente. Ambiente real e moderno, não abstração. Exemplo para nicho de finanças: "escritório moderno desfocado com luz quente e uma janela grande ao fundo". Nada de texto no fundo, nada de logotipo, nada de pessoas ao fundo.

Regras de escrita:
- Português do Brasil.
- Nunca use travessão. Use vírgula, dois-pontos, ponto e vírgula ou parênteses.
- Nunca invente fato, número ou nome que não esteja no que a pessoa falou.
- Nada de emoji no título nem na frase da capa.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string:
{"titulo":"...","descricao":"...","fraseDaCapa":"...","expressao":"confiante","cenario":"..."}`;

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
    // "confiante" é o padrão porque é a expressão que menos erra: funciona para
    // quase qualquer conteúdo e não promete drama que o vídeo não entrega.
    expressao: EXPRESSOES.includes(dados.expressao as Expressao)
      ? (dados.expressao as Expressao)
      : "confiante",
    cenario: dados.cenario ?? "",
  };
}

const EXPRESSOES: Expressao[] = [
  "confiante",
  "serio",
  "curioso",
  "surpreso",
  "preocupado",
];

/** Como pedir cada expressão ao modelo de imagem, sem ambiguidade. */
const COMO_MOSTRAR: Record<Expressao, string> = {
  confiante:
    "confiante e tranquila: boca FECHADA com um sorriso leve, olhos abertos e focados na câmera, queixo levemente erguido",
  serio:
    "séria e direta: boca FECHADA sem sorrir, sobrancelhas levemente baixas, olhar firme na câmera",
  curioso:
    "intrigada: boca FECHADA, uma sobrancelha levemente erguida, cabeça um pouco inclinada, olhar na câmera",
  surpreso:
    "surpresa de verdade: olhos bem abertos, sobrancelhas erguidas, boca levemente entreaberta como quem acabou de descobrir algo (nunca escancarada)",
  preocupado:
    "preocupada: boca FECHADA, testa levemente franzida, olhar atento na câmera",
};

/**
 * A capa: a pessoa recortada, com expressão ajustada, sobre um fundo novo.
 *
 * Evoluiu em três passos, cada um por uma crítica do Bruno com o resultado na
 * mão:
 *
 * 1. Primeiro pegava um quadro qualquer do trecho e escrevia texto branco em
 *    cima. Numa gravação com slides, caía numa tela compartilhada.
 * 2. Depois passou a varrer o vídeo inteiro procurando rosto. Melhorou muito,
 *    mas a foto ainda era um quadro de vídeo cru: boca aberta no meio de uma
 *    sílaba, olho fechado, fundo da sala.
 * 3. Agora a pessoa é RECORTADA, a expressão é ajustada ao tom do conteúdo, e o
 *    fundo é substituído por um cenário alinhado ao nicho do cliente.
 *
 * ATENÇÃO AO RISCO QUE ISTO CRIA. Até o passo 2, a trava contra o modelo trocar
 * a pessoa por alguém inventado era a instrução de não alterar o rosto. Pedir
 * mudança de expressão remove essa trava, e o modelo passa a ter licença para
 * redesenhar feições. A compensação é a seção IDENTIDADE do prompt, primeira e
 * mais longa, mas ela é instrução, não garantia.
 *
 * Se algum dia sair uma capa com outra pessoa, o caminho certo NÃO é ajustar o
 * prompt de novo: é voltar para sobreposição de texto em código sobre a foto
 * real, que é mais feia e nunca inventa gente. Publicar o rosto errado de um
 * cliente é um dano que capa bonita nenhuma compensa.
 */
export async function comporCapa(
  quadroBase64: string,
  frase: string,
  opcoes: {
    expressao?: Expressao;
    cenario?: string;
    nicho?: string | null;
    usageCtx?: { projectId?: string };
    /** "9:16" para capa de corte vertical; "16:9" para thumb de YouTube. */
    formato?: "9:16" | "16:9";
    /** Instrução de ajuste vinda do CLIENTE, com prioridade sobre o padrão. */
    ajuste?: string;
  } = {}
): Promise<string | null> {
  // A palavra destacada é a mais longa da frase, que quase sempre é a que
  // carrega o sentido ("consultoria", "escala", "sozinho"). Deixar o modelo
  // escolher produzia destaque em preposição.
  const palavras = frase.split(/\s+/).filter(Boolean);
  const destaque = palavras.reduce((a, b) => (b.length > a.length ? b : a), palavras[0] ?? "");

  const expressao = COMO_MOSTRAR[opcoes.expressao ?? "confiante"];
  const cenario =
    opcoes.cenario?.trim() ||
    `ambiente de trabalho moderno e limpo, coerente com ${opcoes.nicho ?? "negócios"}, desfocado`;

  const prompt = `Monte a THUMBNAIL de um vídeo de YouTube usando a pessoa desta captura.

IDENTIDADE, e esta é a regra que manda sobre todas as outras
- A pessoa da imagem é uma PESSOA REAL e específica. O resultado precisa ser reconhecível como ela por quem a conhece.
- Preserve sem alterar: formato do rosto, olhos, nariz, boca, orelhas, barba, cabelo (corte e cor), tom de pele, idade aparente e roupa.
- Você pode mudar SOMENTE a expressão facial e a direção do olhar. Nada mais no rosto.
- Se não conseguir ajustar a expressão mantendo a mesma pessoa, mantenha a expressão original. É melhor uma foto imperfeita que uma pessoa diferente.
- Nunca substitua por um modelo genérico, nunca embeleze traços, nunca rejuvenesça, nunca mude o formato do corpo.

EXPRESSÃO
- Ajuste o rosto para ficar ${expressao}.
- Corrija defeitos de quadro parado de vídeo: se a boca estiver aberta no meio de uma palavra, feche; se os olhos estiverem fechados ou semicerrados, abra; se o olhar estiver perdido, traga para a câmera.
- O resultado tem que parecer uma FOTO, não um quadro pausado.

RECORTE E FUNDO
- Recorte a pessoa do fundo original com borda limpa, inclusive no cabelo.
- Descarte o cenário original por completo.
- Fundo novo: ${cenario}
- O fundo entra desfocado e mais escuro que a pessoa, para ela saltar. Nada de texto, logotipo ou outras pessoas no fundo.
- Ilumine a pessoa de forma coerente com o fundo novo, com uma leve luz de contorno separando ela do cenário.

TEXTO
- Escreva exatamente: "${frase}"
- Corpo ENORME, ocupando de um terço a metade da largura da imagem. Se em dúvida, aumente.
- Sem serifa, muito pesada, condensada, em caixa alta.
- Destaque a palavra "${destaque}" com um bloco de cor sólida atrás dela, em contraste com o resto.
- O texto NUNCA pode cobrir o rosto. Ponha no espaço vazio ao lado ou acima.

NÃO FAÇA
- Nada de marca d'água, moldura, setas, círculos vermelhos ou emoji.
- Nada de texto além da frase pedida.
- Nada de mãos ou dedos deformados: se a mão original ficar estranha no recorte, corte o enquadramento acima dela.

${opcoes.ajuste ? `AJUSTE PEDIDO PELO CLIENTE, com prioridade sobre qualquer regra acima que conflite (exceto a identidade da pessoa, que é intocável): ${opcoes.ajuste}
` : ""}Formato final: ${opcoes.formato === "9:16" ? "9 por 16, VERTICAL como um Reels" : "16 por 9"}, cheio, sem barras.`;

  return comporSobreImagem(
    prompt,
    quadroBase64,
    "image/jpeg",
    { operation: "video_capa", ...opcoes.usageCtx },
    // A capa do corte acompanha o formato do corte. A paisagem num quadro
    // 9:16 foi a "capa errada" que o Bruno viu duas vezes (31/08).
    opcoes.formato ?? "9:16"
  );
}
