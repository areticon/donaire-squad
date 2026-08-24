/**
 * Os estilos de edição, escolhidos uma vez por projeto.
 *
 * Ideia do Bruno em 24/08: "dar a opção para o usuário mudar o tipo de filtro,
 * efeito, fontes dos textos, talvez isso vir até antes, ele escolhe se o vídeo é
 * dramático, mais acelerado, mais animado, mais sério, e aí isso muda o tipo da
 * legenda, do áudio, a velocidade, a precisão dos cortes".
 *
 * Ele está certo sobre a ORDEM: o estilo precisa ser conhecido antes da edição,
 * porque decide legenda, ritmo e som. E fica no projeto, e não no upload, porque
 * canal com estilo diferente a cada vídeo não constrói reconhecimento.
 *
 * ## O que a pesquisa fixou, e o que ficou por conta do estilo
 *
 * Pesquisado em 24/08, e vale para TODOS os estilos, então não é opção:
 *
 * - **85% assiste sem som.** Legenda não é enfeite, é o canal principal.
 * - **Palavra a palavra é o padrão de 2026**, com a palavra falada em destaque.
 * - **Alto contraste**: branco com contorno preto, ou amarelo com contorno
 *   preto. Qualquer outra combinação perde legibilidade sobre imagem variável.
 * - **Terço inferior central.** Acima disso briga com o rosto, abaixo some sob
 *   a interface do aplicativo.
 * - **Mudança visual a cada 1,5 a 2 segundos** é o alvo de retenção.
 *
 * O que varia por estilo é o RITMO, o peso da tipografia e a agressividade do
 * movimento. O que não varia é a legibilidade.
 */

export type NomeDoEstilo = "dramatico" | "acelerado" | "serio" | "animado";

export type Estilo = {
  nome: NomeDoEstilo;
  /** Como aparece na tela de escolha. */
  rotulo: string;
  /** Uma frase dizendo para que serve, na hora de escolher. */
  paraQue: string;

  legenda: {
    /**
     * O nome da fonte, exatamente como o fontconfig do contêiner a conhece.
     *
     * Não é pilha de alternativas ao estilo do navegador: o libass trata a
     * string inteira como um nome só, então "Impact,Arial Black,sans-serif"
     * não cai para a segunda, ele simplesmente não acha nada e substitui em
     * silêncio.
     *
     * Foi o que aconteceu até 24/08. Verificado no vídeo completo de produção:
     * o estilo pedia Arial e o quadro mostra DejaVu Sans Bold, porque o
     * contêiner Debian não tem nenhuma fonte da Microsoft e tinha só a família
     * DejaVu, que entrou de carona numa dependência. Os quatro estilos sairiam
     * com a MESMA tipografia, e a escolha do cliente não mudaria nada na tela.
     *
     * Agora cada nome aqui existe no contêiner porque o Dockerfile o instala, e
     * a construção da imagem FALHA se o libass precisar substituir qualquer um.
     */
    fonte: string;
    /**
     * O MAIOR corpo que uma linha pode ter, em pixels de um quadro de 1080x1920.
     *
     * É um teto e não um valor fixo: a legenda mede cada linha antes de
     * desenhar e entra no maior corpo que ainda cabe na largura útil. Palavra
     * curta sobe até este número, frase longa desce até caber.
     *
     * Os dois lados foram medidos em 24/08 no corte real. Corpo fixo grande faz
     * a palavra mais longa da gravação vazar a tela, e no modo de uma palavra
     * por vez a quebra automática não salva, porque não há espaço onde quebrar.
     * Corpo fixo pequeno o bastante para a pior palavra caber deixa a palavra
     * MEDIANA ocupando 13% da largura, que some num telefone.
     *
     * Por isso o teto sobe conforme o estilo mostra MENOS palavras por vez: uma
     * palavra sozinha pode ser enorme, quatro palavras não.
     */
    corpo: number;
    /** Cor do texto normal, em BGR do ASS (que é invertido em relação ao web). */
    cor: string;
    /** Cor da palavra que está sendo falada agora. */
    corDoDestaque: string;
    /** Espessura do contorno. Abaixo de 3 some sobre fundo claro. */
    contorno: number;
    /** Quantas palavras por vez na tela. */
    palavrasPorVez: number;
    /** Distância do rodapé, em pixels. */
    margemDeBaixo: number;
    /** Caixa alta muda muito o peso percebido. */
    caixaAlta: boolean;
    /**
     * Se a fonte deve ser pedida em negrito.
     *
     * Existe porque metade das fontes instaladas tem UM peso so. Pedir negrito
     * a uma fonte que nao tem versao negrito faz o libass ENGROSSAR o desenho
     * por conta, e o resultado e a letra borrada, com o contorno comendo o
     * miolo. Anton e Bangers ja nascem pesadas e pedem `false`; PT Serif e
     * Liberation Sans tem a versao negrito de verdade e pedem `true`.
     */
    negrito: boolean;
  };

  ritmo: {
    /** Segundos entre um movimento de câmera e o próximo. */
    intervaloDeMovimento: number;
    /** Quanto o zoom avança em cada movimento, em fração. */
    forcaDoZoom: number;
  };

  som: {
    /** Volume da trilha por baixo da voz, em fração. */
    volumeDaTrilha: number;
    /** Quanto a trilha abaixa quando a pessoa fala. */
    abaixarSobAVoz: number;
  };

  /**
   * Quanto respiro fica em volta da fala nos cortes, em segundos.
   *
   * Estilo acelerado corta rente, dramático deixa a pausa respirar. É o
   * parâmetro que o Bruno chamou de "precisão dos cortes".
   */
  respiroDoCorte: number;
};

/**
 * Distância do rodapé até a legenda, em pixels de um quadro de 1920.
 *
 * A pesquisa manda pôr legenda no terço inferior central, e a razão dela é
 * desviar do rosto e da interface do aplicativo. Nesta composição o rosto ESTÁ
 * no terço inferior, porque a pessoa recortada fica encostada na base.
 *
 * Medido no corte real em 24/08: a silhueta ocupa de y=1183 a y=1870. Com 420
 * de margem a legenda cai em y≈1500, em cima da boca. Com 800 ela pousa logo
 * acima da cabeça, que é onde o olho já está indo, e ainda desvia da interface
 * do TikTok e do Reels, que vive embaixo e à direita.
 *
 * Ou seja: obedece à INTENÇÃO da regra (não cobrir o rosto, não sumir sob a
 * interface) em vez de obedecer ao número dela.
 */
const BASE_LEGENDA = {
  contorno: 4,
  margemDeBaixo: 800,
} as const;

export const ESTILOS: Record<NomeDoEstilo, Estilo> = {
  dramatico: {
    nome: "dramatico",
    rotulo: "Dramático",
    paraQue: "História pessoal, virada, confissão. Ritmo lento, deixa a frase pousar.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "PT Serif",
      corpo: 132,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H0060C0FF", // âmbar quente
      // Três palavras por vez, e não uma: no ritmo lento, palavra solta piscando
      // briga com a fala em vez de acompanhar.
      palavrasPorVez: 3,
      caixaAlta: false,
      negrito: true,
    },
    ritmo: { intervaloDeMovimento: 4, forcaDoZoom: 0.03 },
    som: { volumeDaTrilha: 0.18, abaixarSobAVoz: 0.6 },
    // Meio segundo de respiro: em história pessoal a pausa É conteúdo, e cortar
    // rente transforma emoção em pressa.
    respiroDoCorte: 0.5,
  },

  acelerado: {
    nome: "acelerado",
    rotulo: "Acelerado",
    paraQue: "Dica, lista, opinião forte. Corte curto, palavra a palavra, sem sobra.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Anton",
      corpo: 260,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H0000E5FF", // amarelo, o par de maior contraste da pesquisa
      palavrasPorVez: 1,
      caixaAlta: true,
      negrito: false,
    },
    // 1,6s está dentro da faixa de 1,5 a 2 que a pesquisa aponta como alvo.
    ritmo: { intervaloDeMovimento: 1.6, forcaDoZoom: 0.08 },
    som: { volumeDaTrilha: 0.28, abaixarSobAVoz: 0.5 },
    respiroDoCorte: 0.08,
  },

  serio: {
    nome: "serio",
    rotulo: "Sério e técnico",
    paraQue: "Autoridade, dado, análise. Quase sem efeito, para o argumento mandar.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Liberation Sans",
      corpo: 92,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H00F0F0F0", // quase sem destaque: aqui ele distrairia
      palavrasPorVez: 4,
      caixaAlta: false,
      negrito: true,
      contorno: 3,
    },
    ritmo: { intervaloDeMovimento: 6, forcaDoZoom: 0.02 },
    som: { volumeDaTrilha: 0.12, abaixarSobAVoz: 0.75 },
    respiroDoCorte: 0.3,
  },

  animado: {
    nome: "animado",
    rotulo: "Animado e leve",
    paraQue: "Bastidor, humor, conteúdo descontraído. Cor forte e movimento solto.",
    legenda: {
      ...BASE_LEGENDA,
      fonte: "Bangers",
      corpo: 190,
      cor: "&H00FFFFFF",
      corDoDestaque: "&H00FF66CC", // rosa
      palavrasPorVez: 2,
      caixaAlta: true,
      negrito: false,
      contorno: 5,
    },
    ritmo: { intervaloDeMovimento: 2.2, forcaDoZoom: 0.06 },
    som: { volumeDaTrilha: 0.3, abaixarSobAVoz: 0.45 },
    respiroDoCorte: 0.15,
  },
};

/**
 * O estilo do projeto, com queda para o acelerado.
 *
 * Acelerado e não dramático como padrão: ele é o que a pesquisa mostra
 * funcionando na maior variedade de conteúdo, e quem não escolheu estilo
 * provavelmente também não pensou no ritmo.
 */
export function estiloDoProjeto(nome: string | null | undefined): Estilo {
  const chave = (nome ?? "").trim().toLowerCase() as NomeDoEstilo;
  return ESTILOS[chave] ?? ESTILOS.acelerado;
}

/** Os quatro, para montar a tela de escolha sem repetir a lista. */
export const LISTA_DE_ESTILOS = Object.values(ESTILOS);
