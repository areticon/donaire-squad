/**
 * A máquina de estados do fluxo de vídeo, num lugar só.
 *
 * Existe por causa da pior falha que este projeto teve: a Vercel derruba a
 * função no teto de tempo e o `catch` **nunca roda**, então o código não
 * consegue gravar o próprio erro. Se o estado de "rodando" for igual ao estado
 * de "pronto para rodar", a interface volta ao que era e parece que o clique
 * não aconteceu. Falha silenciosa por construção.
 *
 * O conserto tem duas partes, e as duas moram aqui:
 *
 * 1. Estado de TRABALHO é diferente de estado de ESPERA. Antes, `selecting`
 *    queria dizer as duas coisas.
 * 2. Todo estado de trabalho tem PRAZO. Quem lê declara morto o que passou
 *    dele. É a única forma de perceber um trabalho que morreu sem falar.
 *
 * **Este módulo não pode importar o Prisma.** A tela do cliente usa
 * `proximaAcao` e `estaTrabalhando`, e módulo compartilhado que puxa o driver do
 * banco manda o driver inteiro para o bundle do navegador. A varredura, que
 * precisa do banco, mora em `video-sweep.ts`, do lado do servidor.
 */

/** Estado de trabalho: alguma coisa está rodando agora. */
export const TRABALHANDO = ["transcribing", "selecting", "writing"] as const;
export type EstadoDeTrabalho = (typeof TRABALHANDO)[number];

export function estaTrabalhando(status: string): status is EstadoDeTrabalho {
  return (TRABALHANDO as readonly string[]).includes(status);
}

/**
 * Prazo de cada etapa, em segundos.
 *
 * Para o que roda na nossa função, o prazo é o `maxDuration` mais folga: se a
 * plataforma matou aos 800s, aos 830 já é certeza de que não volta mais.
 *
 * A transcrição é o caso diferente e por isso o prazo é largo: ela roda na
 * Deepgram e volta por callback, então não tem teto nosso. O prazo aqui só
 * cobre o desfecho em que o callback nunca chega (endereço inalcançável, erro
 * do lado deles, assinatura recusada). Medido: 27 minutos de vídeo voltaram em
 * cerca de 60 segundos, então 20 minutos é folga de vinte vezes.
 */
export const PRAZO_SEGUNDOS: Record<EstadoDeTrabalho, number> = {
  transcribing: 20 * 60,
  selecting: 830,
  writing: 830,
};

/** O que dizer ao cliente quando o prazo estoura. */
export const MORTE: Record<EstadoDeTrabalho, string> = {
  transcribing:
    "A transcrição não voltou no prazo. Isso costuma ser problema do serviço de transcrição, não da sua gravação. Pode tentar de novo.",
  selecting:
    "A escolha dos trechos passou do tempo permitido e foi interrompida. Gravação muito longa é a causa mais comum. Pode tentar de novo.",
  writing:
    "A redação dos posts passou do tempo permitido e foi interrompida. Pode tentar de novo.",
};

/** Quantas tentativas antes de parar de oferecer o botão de repetir. */
export const MAX_TENTATIVAS = 3;

type VideoParaLeitura = {
  id: string;
  status: string;
  startedAt: Date | null;
};

/** Já passou do prazo da etapa em que está? */
export function expirado(video: VideoParaLeitura, agora = new Date()): boolean {
  if (!estaTrabalhando(video.status)) return false;
  // Sem `startedAt` num estado de trabalho: registro velho, de antes desta
  // coluna existir. Tratar como expirado é o certo, porque ele está parado ali
  // desde sempre e ninguém vai movê-lo.
  if (!video.startedAt) return true;
  const decorrido = (agora.getTime() - video.startedAt.getTime()) / 1000;
  return decorrido > PRAZO_SEGUNDOS[video.status];
}

/**
 * Em que etapa este vídeo parou, deduzido do que ele tem gravado.
 *
 * Deduzir em vez de guardar numa coluna é de propósito: os dados já contam a
 * história sem ambiguidade, e coluna a mais é mais uma coisa para sair de
 * sincronia com a realidade.
 */
export function etapaDeRetomada(video: {
  temTranscricao: boolean;
  temTrechos: boolean;
}): "transcribe" | "select" | "write" {
  if (video.temTrechos) return "write";
  if (video.temTranscricao) return "select";
  return "transcribe";
}

/** Qual rota o botão da tela deve chamar para este estado. */
export function proximaAcao(video: {
  status: string;
  temTranscricao: boolean;
  temTrechos: boolean;
  attempts: number;
}): { rotulo: string; rota: string } | null {
  switch (video.status) {
    case "uploaded":
      return { rotulo: "Transcrever", rota: "transcribe" };
    case "transcribed":
      return { rotulo: "Escolher os trechos", rota: "select" };
    case "selected":
      return { rotulo: "Escrever os posts", rota: "write" };
    case "failed":
      if (video.attempts >= MAX_TENTATIVAS) return null;
      return { rotulo: "Tentar de novo", rota: etapaDeRetomada(video) };
    default:
      return null;
  }
}
