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
 *
 * ## Por que o fundo pede f/4 e não f/1.8
 *
 * A primeira versão do prompt novo pedia "85mm em f/1.8, o fundo inteiro
 * suavemente desfocado". É o vocabulário certo para retrato e o errado para
 * isto: uma foto em que NADA está nítido não parece profundidade de campo, ela
 * parece resolução baixa. Foi o que o Bruno viu em 24/08, e ele perguntou se o
 * problema era o modelo.
 *
 * Não era. Medido com o mesmo prompt nos dois modelos de imagem, olhando o
 * bloco mais nítido de cada imagem, que é o que diz se existe algum plano em
 * foco:
 *
 *   flash  bloco mais nítido 8,15     pro  bloco mais nítido 4,56
 *
 * O Pro custa 3,4 vezes mais e não é mais nítido. Trocar de modelo teria
 * gastado mais para não resolver nada.
 *
 * O que resolveu foi pedir um PLANO EM FOCO, medido com o mesmo modelo:
 *
 *   f/1.8, fundo inteiro desfocado    bloco mais nítido  2,23
 *   f/4 com a parede em foco          bloco mais nítido 14,98
 *
 * Seis vezes e meia mais detalhe, sem mudar de modelo e sem custar um centavo
 * a mais.
 */

export type FundoDoCorte = {
  /** Data URL da imagem, pronta para virar arquivo. */
  imagem: string;
  /** O que foi pedido, para conferência humana e para o log. */
  descricao: string;
  /**
   * O brilho que o fundo DEVERIA ter, de 0 a 255, medido na gravação original.
   * Quem compõe corrige por gama a diferença que o modelo deixou.
   */
  brilhoAlvo: number;
};

/** Acima disto, o fundo original é considerado claro. */
const CLARO = 150;

/**
 * A direção de arte de cada estilo de edição.
 *
 * O estilo já decide legenda, ritmo e som; passa a decidir também a CARA do
 * fundo. Um canal acelerado e um canal sério não deveriam ter a mesma arte, e
 * amarrar isso ao estilo dá identidade sem pedir mais uma escolha ao cliente.
 */
const DIRECAO_POR_ESTILO: Record<string, string> = {
  dramatico:
    "Luz cinematográfica e abstrata: véus e feixes de luz suaves atravessando em diagonal, " +
    "névoa luminosa com profundidade real entre camadas, atmosfera de palco premium.",
  acelerado:
    "Grandes formas geométricas minimalistas e ousadas (círculos, arcos, faixas curvas) nas cores " +
    "da paleta, algumas chapadas e outras com gradiente sutil, sobrepostas com transparências, " +
    "composição assimétrica com energia.",
  serio:
    "Gradiente de estúdio minimalista e quase monocromático nas cores da paleta, com um brilho " +
    "suave vindo de cima e cantos levemente mais densos. Sobriedade absoluta, nada chamativo.",
  animado:
    "Formas orgânicas arredondadas e leves nas cores da paleta, fluindo pelas bordas com " +
    "transparências e um grão fino, alegres sem serem infantis.",
};

/**
 * Gera a ARTE de fundo dos cortes verticais.
 *
 * ## Por que arte, e não fotografia de ambiente
 *
 * A primeira versão pedia "um ambiente real de trabalho" e o modelo entregava
 * exatamente isso: uma sala. Sala fotorrealista atrás de pessoa recortada é
 * fundo de reunião do Teams, e foi assim que o Bruno descreveu em 24/08. A
 * visão dele, que é a certa: "a ideia do fundo com nano banana é ter uma arte
 * incrível, irresistível, profissional, algo que mostre que é profissional, um
 * design de verdade".
 *
 * Então o prompt pede uma peça de DESIGN: abstrata, nas cores da MARCA do
 * projeto, com a direção de arte vindo do estilo de edição. Nenhum móvel,
 * nenhum lugar, nada que dispute realidade com a pessoa.
 *
 * ## As regras que continuam valendo, e por quê
 *
 * O brilho segue casado ao da gravação original (a sacada do halo, medida em
 * 24/08: a borda da máscara mistura a pessoa com a parede que estava atrás
 * dela, e o contraste entre essa parede e o fundo novo é o que faz o halo
 * aparecer). O centro fica calmo porque é onde a pessoa e a legenda moram. E o
 * resultado é conferido pelo worker, que corrige por gama o que o modelo errar.
 */
export async function gerarFundoDoCorte(
  contexto: {
    /** As cores da marca do projeto, como "#10B981,#0D1F1A,#F0FDF4". */
    paleta?: string | null;
    /** O estilo de edição, que dá a direção de arte. */
    estilo?: string | null;
    /** Brilho médio do fundo atrás da pessoa na gravação, de 0 a 255. */
    brilhoDoOriginal?: number | null;
  },
  usageCtx?: { projectId?: string }
): Promise<FundoDoCorte | null> {
  const alvo = Math.max(0, Math.min(255, Math.round(contexto.brilhoDoOriginal ?? 200)));
  const claro = alvo >= CLARO;

  const cores = (contexto.paleta ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-f]{3,8}$/i.test(c));
  const paleta = cores.length
    ? `as cores da marca: ${cores.join(", ")}`
    : "uma paleta sóbria de dois tons complementares, escolhida por você";

  const direcao =
    DIRECAO_POR_ESTILO[(contexto.estilo ?? "").trim().toLowerCase()] ??
    DIRECAO_POR_ESTILO.acelerado;

  const prompt = `Arte de fundo para vídeo vertical de rede social, criada por um designer gráfico sênior.

É um DESIGN ABSTRATO, não é uma fotografia e não é um lugar: nenhum móvel, nenhuma sala, nenhum objeto reconhecível.

A COMPOSIÇÃO
- ${direcao}
- Usa ${paleta}, ${
    claro
      ? "dominada pelo tom mais CLARO da paleta: a imagem inteira é luminosa e arejada."
      : "dominada pelo tom mais ESCURO da paleta: a imagem é densa e elegante, sem preto chapado."
  }
- Textura de grão fino de filme sobre tudo, para acabamento premium.
- O terço central do quadro mais limpo e calmo que as bordas: é onde a pessoa e a legenda vão morar.

QUALIDADE
Acabamento de identidade visual de agência, como um slide de marca de tecnologia premium. Nítido, intencional, sem ruído de compressão, sem banding.

PROIBIDO: pessoa, rosto, texto, letra, número, logotipo, móvel, sala, janela, objeto reconhecível, paisagem, moldura, divisão em painéis.

Vertical 9 por 16, imagem cheia até as bordas.`;

  try {
    // `hd` pede 2K ao modelo (1536x2752), o menor tamanho que dispensa
    // ampliação para chegar em 1080x1920.
    const imagem = await generateImage(prompt, "9:16", "hd", {
      operation: "video_fundo_corte",
      ...usageCtx,
    });
    if (!imagem) return null;
    return {
      imagem,
      descricao:
        `arte ${contexto.estilo ?? "acelerado"} ${claro ? "clara" : "escura"} ` +
        `com ${cores.length ? cores.join(" ") : "paleta livre"} (brilho alvo ${alvo})`,
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
