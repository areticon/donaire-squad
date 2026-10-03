import { askClaude } from "@/lib/claude";
import { prisma } from "@/lib/db/prisma";
import { generateImage, dataUrlToBuffer } from "@/lib/media/nano-banana";
import { lerMidia } from "@/lib/media/storage";
import { recortarQuadro } from "@/lib/media/recorte-do-quadro";
import { acentuarFrases } from "@/lib/media/acentuacao";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { coresDaMarca, familiaDaLinguagem, montarCapa, promptDoFundo } from "@/lib/media/capa-composta";
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
export type Expressao = ExpressaoDaCapa;

/**
 * O estilo visual da capa (ver lib/media/estilos-de-capa.ts):
 *
 * - "impacto": a pessoa recortada sobre fundo novo, frase enorme com uma
 *   palavra destacada em bloco de cor. É o que sempre foi.
 * - "limpo": a foto real, fundo original levemente escurecido, frase curta em
 *   tipografia fina. Para quem acha thumbnail de YouTuber espalhafatosa.
 * - "manchete": fundo chapado na cor da marca, pessoa de um lado, título em
 *   duas linhas do outro, como capa de programa.
 */
export type { EstiloDeCapa } from "@/lib/media/estilos-de-capa";
import type { ClimaDaCapa, EstiloDeCapa, ExpressaoDaCapa } from "@/lib/media/estilos-de-capa";

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
- Português do Brasil com acentuação completa, inclusive na frase da capa: "Sua IA ainda é estagiária", nunca "Sua IA ainda e estagiaria".
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
  // A frase da capa sem acento (30/09): ver lib/media/acentuacao.ts.
  const [fraseAcentuada] = await acentuarFrases([(dados.fraseDaCapa ?? trecho.titulo ?? "").slice(0, 60)], usageCtx);

  return {
    // O corte de 100 acontece aqui e não no prompt: o modelo é instruído mas
    // não garante, e título estourado é recusado pelo YouTube na publicação,
    // depois de o cliente já ter aprovado.
    titulo: (dados.titulo ?? trecho.titulo ?? "").slice(0, 100),
    descricao: dados.descricao ?? trecho.ideia ?? "",
    fraseDaCapa: fraseAcentuada,
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
  "alegre",
  "misterioso",
  "dramatico",
  "divertido",
  "provocativo",
];

/**
 * A capa: a pessoa REAL recortada, sobre um fundo novo, com a frase composta
 * em código na linguagem e nas cores da marca.
 *
 * Evoluiu em quatro passos, cada um por uma crítica do Bruno com o resultado
 * na mão:
 *
 * 1. Primeiro pegava um quadro qualquer do trecho e escrevia texto branco em
 *    cima. Numa gravação com slides, caía numa tela compartilhada.
 * 2. Depois passou a varrer o vídeo inteiro procurando rosto. Melhorou muito,
 *    mas a foto ainda era um quadro de vídeo cru: boca aberta, olho fechado.
 * 3. Então o modelo de imagem passou a recortar a pessoa e AJUSTAR A EXPRESSÃO.
 *    O comentário daqui avisava: isso dá ao modelo licença para redesenhar o
 *    rosto, e se um dia saísse outra pessoa, o caminho era voltar à composição
 *    em código. Saiu (teste de 29/09: sorriso inventado, feições trocadas).
 * 4. Agora (30/09): o worker escolhe o quadro pelos pontos do rosto (olho
 *    aberto, boca fechada, de frente) e recorta a pessoa com o segmentador;
 *    o modelo de imagem desenha SÓ o fundo, sem ninguém; a frase, o
 *    marca-texto, a colagem e a sombra são código (lib/media/capa-composta.tsx).
 *    O rosto da capa é pixel da gravação.
 *
 * `expressao` e `clima` continuam aceitos para não quebrar quem chama, mas não
 * mexem mais no rosto: o clima só muda a luz do fundo.
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
    /** Instrução de ajuste vinda do CLIENTE: entra no fundo, nunca no rosto. */
    ajuste?: string;
    /** O estilo da capa do completo, quando o cliente escolheu um (limpo, manchete, impacto). */
    estilo?: EstiloDeCapa;
    clima?: ClimaDaCapa;
    corDaMarca?: string | null;
    /** De onde veio o quadro: o worker recorta a pessoa a partir dele. */
    quadroUrl?: string | null;
    /** A pessoa já recortada (PNG), quando o corte chegou com ela. */
    recorteUrl?: string | null;
    /** Onde guardar o recorte que o worker fizer agora. */
    chaveDoRecorte?: string;
  } = {}
): Promise<string | null> {
  const formato = opcoes.formato ?? "9:16";
  const projeto = opcoes.usageCtx?.projectId
    ? await prisma.project.findUnique({
        where: { id: opcoes.usageCtx.projectId },
        select: { colorPalette: true, videoEstiloEscolha: true, videoStyle: true },
      })
    : null;
  const escolha = normalizarEscolha(projeto?.videoEstiloEscolha, projeto?.videoStyle);
  const cores = coresDaMarca(projeto?.colorPalette ?? (opcoes.corDaMarca ? `${opcoes.corDaMarca}` : null));
  // A linguagem do catálogo manda; o estilo de capa escolhido para o completo
  // ajusta por cima quando existe ("limpo" mantém o cenário real).
  let familia = familiaDaLinguagem(escolha.estiloId);
  if (opcoes.estilo === "manchete") familia = "sobrio";
  if (opcoes.estilo === "impacto" && familia === "sobrio") familia = "impacto";
  const limpo = opcoes.estilo === "limpo";

  const quadro = quadroBase64 ? Buffer.from(quadroBase64, "base64") : null;
  let recorte: Buffer | null = null;
  if (!limpo) {
    if (opcoes.recorteUrl) recorte = await lerMidia(opcoes.recorteUrl);
    if (!recorte && opcoes.quadroUrl) {
      const feito = await recortarQuadro(
        opcoes.quadroUrl,
        opcoes.chaveDoRecorte ?? `cortes/recortes/${Date.now()}.png`
      );
      if (feito) recorte = await lerMidia(feito.url);
    }
  }

  // O fundo, e só o fundo, vem do modelo de imagem. Falhou, fica o fundo em
  // código (papel na cor clara da marca, ou o tom escuro): a capa sai igual.
  let fundo: Buffer | null = null;
  if (!limpo) {
    try {
      const cenario = [opcoes.cenario?.trim(), opcoes.ajuste ? `(pedido do cliente: ${opcoes.ajuste})` : ""]
        .filter(Boolean)
        .join(" ");
      const url = await generateImage(
        promptDoFundo(familia, cores, cenario || `ambiente coerente com ${opcoes.nicho ?? "negócios"}`, formato),
        formato,
        "standard",
        { operation: "video_capa_fundo", projectId: opcoes.usageCtx?.projectId }
      );
      fundo = dataUrlToBuffer(url);
    } catch (e) {
      console.warn(`[capa] fundo por IA falhou, sigo com o fundo em código: ${e instanceof Error ? e.message : e}`);
    }
  }

  const jpeg = await montarCapa({
    recorte,
    quadro,
    fundo,
    frase,
    formato,
    familia: limpo ? "sobrio" : familia,
    cores,
  });
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
