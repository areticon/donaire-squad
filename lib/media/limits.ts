/**
 * Limites do upload de vídeo, e o porquê de cada número.
 *
 * DECISÃO DE 22/08/2026 (Bruno): não limitar o cliente, cobrar por ele. Vídeo
 * maior custa mais créditos, e não é recusado. A versão anterior barrava por
 * taxa de gravação e por tamanho, e o Bruno esbarrou no próprio produto ao
 * tentar subir a gravação de 27 minutos que abre o canal dele. Resolver o
 * nosso problema de margem com o tempo do cliente é o caminho errado.
 *
 * O QUE CONTINUA SENDO LIMITE, E NÃO É NOSSO: a Deepgram, que transcreve,
 * aceita no máximo 2 GB por arquivo e recomenda extrair o áudio de vídeos
 * grandes. Acima disso a transcrição falha, então aceitar seria prometer o que
 * não entregamos. O teto abaixo é o dela, não o nosso, e a mensagem diz isso.
 * O conserto de raiz (extrair o áudio antes de transcrever, o que derrubaria o
 * arquivo de gigabytes para dezenas de megabytes) tem card no planner.
 *
 * Onde o custo mora, e é contraintuitivo: não é a transcrição nem a IA, é a
 * transferência. Blob acima de 512 MB nunca entra em cache, então todo acesso
 * paga, e store privado paga duas vezes, porque a função busca no store e
 * depois entrega ao navegador. Por isso o crédito extra é cobrado por GB, que
 * é onde o custo realmente escala, e não por minuto.
 */

/** O que a gente recomenda gravar, que é onde a margem fica saudável. */
export const MB_POR_MINUTO_RECOMENDADO = 30; // 4 Mbps

/**
 * Teto da Deepgram, com folga de 100 MB para o overhead do multipart.
 * Não é escolha nossa: acima disso a transcrição não acontece.
 */
export const MAX_BYTES = 1_900 * 1024 * 1024;

/**
 * Duração máxima. Subiu de 60 para 120 minutos em 22/08: a 4 Mbps, 60 minutos
 * dão 1,8 GB e ainda cabem; acima disso o próprio teto de bytes barra antes,
 * com mensagem melhor.
 */
export const MAX_DURACAO_SEGUNDOS = 120 * 60;

export const TIPOS_ACEITOS = [
  "video/mp4",
  "video/quicktime",
  "video/x-matroska",
  "video/webm",
];

/**
 * Limite duro de caracteres do X. Post acima disso é recusado na publicação.
 *
 * Mora aqui, e não junto do redator, porque a tela de aprovação precisa dele
 * para avisar antes de o cliente tentar publicar. O módulo do redator importa
 * o cliente do Claude, que importa o Prisma, que arrasta o driver do Postgres
 * para o bundle do navegador e quebra o build.
 */
export const MAX_X = 280;

/** Créditos do trabalho: 2 por minuto de vídeo mais 4 por clipe entregue. */
export const CREDITOS_POR_MINUTO = 2;
export const CREDITOS_POR_CLIPE = 4;

/**
 * Créditos por GB acima do que a gravação recomendada geraria.
 *
 * De onde vem o 20: transferência sai por volta de R$ 0,60 por GB no desenho
 * atual (Blob transfer mais Fast Origin, e store privado paga as duas pernas),
 * e um crédito equivale a cerca de R$ 0,028 de custo variável na calibração da
 * Opção B. R$ 0,60 dividido por R$ 0,028 dá 21, arredondado para baixo. Ou
 * seja: cobre o custo mantendo a mesma margem dos outros créditos, sem punir.
 */
export const CREDITOS_POR_GB_EXTRA = 20;

/**
 * Folga antes de cobrar excedente. Sem ela, quem grava exatamente na taxa
 * recomendada leva 1 crédito a mais pelo arredondamento do contêiner e ainda
 * vê uma sugestão inútil de "economize 1 crédito" (pego no teste da mudança).
 * 150 MB cobre a variação de contêiner, faixa de áudio e metadados.
 */
export const TOLERANCIA_GB = 0.15;

/** Abaixo disso a sugestão não aparece: economia de 1 ou 2 créditos é ruído. */
export const ECONOMIA_MINIMA_PARA_SUGERIR = 5;

/** Quantos clipes um vídeo dessa duração rende. Sublinear de propósito: */
/** momento bom não escala junto com o tempo de gravação. */
export function clipesEstimados(duracaoSegundos: number): number {
  const minutos = duracaoSegundos / 60;
  return Math.max(3, Math.min(Math.round(minutos / 4), 15));
}

/** Bytes que a gravação recomendada geraria para essa duração. */
export function bytesRecomendados(duracaoSegundos: number): number {
  return (duracaoSegundos / 60) * MB_POR_MINUTO_RECOMENDADO * 1048576;
}

/**
 * Créditos do trabalho. O excedente de transferência entra só quando existe:
 * quem grava na taxa recomendada paga exatamente o mesmo de antes.
 */
export function creditosEstimados(
  duracaoSegundos: number,
  bytes?: number
): number {
  const minutos = Math.ceil(duracaoSegundos / 60);
  const base =
    minutos * CREDITOS_POR_MINUTO +
    clipesEstimados(duracaoSegundos) * CREDITOS_POR_CLIPE;

  if (!bytes) return base;

  const excedenteGb = Math.max(
    0,
    (bytes - bytesRecomendados(duracaoSegundos)) / 1073741824 - TOLERANCIA_GB
  );
  return base + Math.ceil(excedenteGb * CREDITOS_POR_GB_EXTRA);
}

export type Veredito =
  | {
      ok: true;
      mbPorMinuto: number;
      creditos: number;
      /** Quanto custaria gravando na taxa recomendada, para comparar. */
      creditosSeRecomendado: number;
      /** Preenchido quando vale sugerir gravar mais leve. */
      sugestao?: string;
      clipes: number;
    }
  | { ok: false; motivo: string; dica?: string };

/**
 * Roda no navegador, antes de subir um byte. O navegador já sabe a duração
 * (metadados do elemento video) e o tamanho do arquivo, então dá para avisar
 * na hora, com instrução, em vez de deixar a pessoa esperar o upload inteiro
 * para descobrir o custo.
 *
 * Desde 22/08 só recusa o que tecnicamente não funciona. Taxa de gravação alta
 * deixou de ser recusa e virou preço.
 */
export function validarVideo(bytes: number, duracaoSegundos: number): Veredito {
  if (!duracaoSegundos || !Number.isFinite(duracaoSegundos)) {
    return {
      ok: false,
      motivo: "Não consegui ler a duração desse arquivo.",
      dica: "Tente exportar em MP4. Alguns arquivos gravados por tela vêm sem os metadados de duração.",
    };
  }

  if (duracaoSegundos > MAX_DURACAO_SEGUNDOS) {
    const min = Math.round(duracaoSegundos / 60);
    return {
      ok: false,
      motivo: `Esse vídeo tem ${min} minutos, e o limite é de ${MAX_DURACAO_SEGUNDOS / 60}.`,
      dica: "Corte no trecho mais forte e envie de novo. Vídeo muito longo rende mais repetição que conteúdo novo.",
    };
  }

  if (bytes > MAX_BYTES) {
    const gb = (bytes / 1073741824).toFixed(2);
    const minutos = Math.round(duracaoSegundos / 60);
    const estimadoRecomendado = (
      bytesRecomendados(duracaoSegundos) / 1073741824
    ).toFixed(2);
    return {
      ok: false,
      motivo: `O arquivo tem ${gb} GB, e o serviço de transcrição aceita no máximo 1,9 GB.`,
      dica: `Não é limite nosso, é do serviço que transcreve. Gravando a 4000 Kbps no OBS (Configurações, Saída, Taxa de bits do vídeo), esses ${minutos} minutos ficariam em cerca de ${estimadoRecomendado} GB, com a mesma imagem para alguém falando.`,
    };
  }

  const mbPorMinuto = bytes / 1048576 / (duracaoSegundos / 60);
  const creditos = creditosEstimados(duracaoSegundos, bytes);
  const creditosSeRecomendado = creditosEstimados(
    duracaoSegundos,
    bytesRecomendados(duracaoSegundos)
  );

  const economia = creditos - creditosSeRecomendado;
  const sugestao =
    economia >= ECONOMIA_MINIMA_PARA_SUGERIR
      ? `Gravando a 4000 Kbps no OBS, esse mesmo vídeo custaria ${creditosSeRecomendado} créditos em vez de ${creditos}, com a mesma imagem. Você economiza ${economia}.`
      : undefined;

  return {
    ok: true,
    mbPorMinuto,
    creditos,
    creditosSeRecomendado,
    sugestao,
    clipes: clipesEstimados(duracaoSegundos),
  };
}
