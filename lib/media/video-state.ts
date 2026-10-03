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
/**
 * "roteirizando" (30/09): a limpeza de fala e o diretor em texto preparam a
 * TELA DE ROTEIRO, que o cliente aprova antes de a esteira gerar imagem, cena,
 * corte e montagem. O estado de ESPERA correspondente é "roteiro".
 */
export const TRABALHANDO = ["transcribing", "selecting", "writing", "cutting", "roteirizando"] as const;
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
  // O corte roda no worker, que não tem teto de tempo nosso. Uma gravação de 2
  // horas recodifica em torno de 30 minutos, e o prazo aqui cobre só o desfecho
  // em que o aviso do worker nunca chega.
  cutting: 90 * 60,
  // A rota do roteiro tem teto de 800 s e se re-despacha para continuar o
  // vídeo longo (e renova o `startedAt` a cada volta); o prazo só pega a
  // função morta sem ter re-despachado.
  roteirizando: 830,
};

/** O que dizer ao cliente quando o prazo estoura. */
export const MORTE: Record<EstadoDeTrabalho, string> = {
  transcribing:
    "A transcrição não voltou no prazo. Isso costuma ser problema do serviço de transcrição, não da sua gravação. Pode tentar de novo.",
  selecting:
    "A escolha dos trechos passou do tempo permitido e foi interrompida. Gravação muito longa é a causa mais comum. Pode tentar de novo.",
  writing:
    "A redação dos posts passou do tempo permitido e foi interrompida. Pode tentar de novo.",
  cutting:
    "O corte da gravação não voltou no prazo. Pode tentar de novo, e nada do que já foi feito se perde.",
  roteirizando:
    "O roteiro da edição passou do tempo permitido e foi interrompido. Pode tentar de novo: o que já foi planejado fica guardado.",
};

/** Quantas tentativas antes de parar de oferecer o botão de repetir. */
export const MAX_TENTATIVAS = 3;

/**
 * O VIGIA DAS ETAPAS (01/10): quantas vezes o servidor retoma SOZINHO uma
 * etapa que passou do prazo, antes de desistir e pedir o clique do cliente.
 *
 * Nasceu do incidente de 01/10: um deploy do worker reiniciou o servidor no
 * meio de um corte, o aviso de volta nunca veio, e o vídeo do Bruno ficou mais
 * de uma hora em "cutting" porque a cura dependia da aba aberta (e a internet
 * dele tinha caído). Duas retomadas cobrem o reinício e um soluço; a terceira
 * parada seguida já é defeito, e repetir sem fim só esconderia o defeito.
 *
 * Mora aqui, e não em `vigia-das-etapas.ts`, porque a tela também lê: este
 * módulo não importa o banco.
 */
export const MAX_RETOMADAS = 2;

/** O registro gravado na coluna `retomadas` do vídeo, por etapa de trabalho. */
export type RetomadaDaEtapa = {
  /** Retomadas automáticas desde o último clique do cliente. */
  n: number;
  /** Quando foi a última retomada (ISO). */
  em?: string;
  /** "prazo": passou do prazo sem aviso; "reiniciado": o worker avisou que reiniciou. */
  motivo?: "prazo" | "reiniciado";
  /** Quantas vezes o vigia já desistiu desta etapa (só para a investigação). */
  desistencias?: number;
};
export type RetomadasDoVideo = Partial<Record<string, RetomadaDaEtapa>>;

/** O nome da etapa no texto do cliente, com artigo ("O corte parou..."). */
export const NOME_DA_ETAPA: Record<EstadoDeTrabalho, string> = {
  transcribing: "A transcrição",
  selecting: "A escolha dos trechos",
  writing: "A redação dos posts",
  cutting: "O corte",
  roteirizando: "O roteiro",
};

/**
 * A mensagem de quando o vigia desiste (terceira parada). Diz o que aconteceu,
 * que nada se perdeu e o que fazer, sem nome de fornecedor nem termo técnico.
 */
export function mensagemDeDesistencia(etapa: EstadoDeTrabalho): string {
  return (
    `${NOME_DA_ETAPA[etapa]} parou três vezes nos nossos servidores. ` +
    "Paramos de tentar sozinhos; clique em tentar de novo. " +
    "O que já ficou pronto continua guardado e nada foi cobrado em dobro."
  );
}

type VideoParaLeitura = {
  id: string;
  status: string;
  startedAt: Date | null;
  durationSec?: number | null;
  sizeBytes?: bigint | number | null;
};

/**
 * O prazo desta etapa PARA ESTE VÍDEO, em segundos (29/09).
 *
 * Com os tetos de 1, 2 e 5 horas por plano, prazo fixo deixou de servir: uma
 * gravação de 5 h com três câmeras leva horas no worker, e os 90 minutos de
 * antes a declarariam morta no meio do trabalho. `PRAZO_SEGUNDOS` continua
 * sendo o piso.
 *
 * - Corte: 30 minutos mais 0,6 s por segundo de gravação. Medido: 2 h
 *   recodificam em cerca de 30 min, ou seja 0,25 s por segundo; 0,6 cobre a
 *   multicâmera e ainda deixa folga para o aviso de volta.
 * - Transcrição de arquivo acima de 1,9 GB: 20 minutos mais 4 minutos por GB,
 *   porque o worker baixa o arquivo inteiro antes de separar o áudio.
 */
export function prazoDaEtapa(video: VideoParaLeitura): number {
  const piso = estaTrabalhando(video.status) ? PRAZO_SEGUNDOS[video.status] : 0;
  const dur = video.durationSec ?? 0;
  const gb = Number(video.sizeBytes ?? 0) / 1073741824;
  if (video.status === "cutting") return Math.max(piso, 30 * 60 + Math.round(dur * 0.6));
  if (video.status === "transcribing" && gb > 1.8) return Math.max(piso, 20 * 60 + Math.round(gb * 240));
  return piso;
}

/**
 * A PROMESSA DE TEMPO ao cliente (30/09): cada minuto de gravação leva cerca
 * de 1,5 minuto para os agentes editarem, com um piso de 6 minutos porque
 * gravação curta ainda paga subir, transcrever e escrever.
 *
 * O fator é o alvo que o Bruno fixou em 30/09 (22 min de vídeo prontos em 33),
 * e não uma média medida: a faixa do Gestor conta para trás a partir dele, e
 * o worker foi acelerado para caber nele (ver worker/src/ffmpeg.mjs, tratamento
 * e passe 1 do completo).
 */
export const MINUTOS_POR_MINUTO = 1.5;

export function estimativaDaRodadaSegundos(duracaoSec: number | null | undefined): number {
  const base = duracaoSec ?? 900;
  return Math.max(6 * 60, Math.round(base * MINUTOS_POR_MINUTO));
}

/**
 * Até quando o vídeo completo pode demorar antes de a faixa desistir de
 * esperar e dizer que ele não veio: o dobro da promessa, e nunca menos que a
 * promessa mais 20 minutos. Existe porque, sem prazo, um completo que morreu
 * no worker virava contagem infinita (196 minutos no teste de 29/09).
 */
export function prazoDoCompletoSegundos(duracaoSec: number | null | undefined): number {
  const promessa = estimativaDaRodadaSegundos(duracaoSec);
  return Math.max(promessa * 2, promessa + 20 * 60);
}

/** Já passou do prazo da etapa em que está? */
export function expirado(video: VideoParaLeitura, agora = new Date()): boolean {
  if (!estaTrabalhando(video.status)) return false;
  // Sem `startedAt` num estado de trabalho: registro velho, de antes desta
  // coluna existir. Tratar como expirado é o certo, porque ele está parado ali
  // desde sempre e ninguém vai movê-lo.
  if (!video.startedAt) return true;
  const decorrido = (agora.getTime() - video.startedAt.getTime()) / 1000;
  return decorrido > prazoDaEtapa(video);
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
  temCortes?: boolean;
  /**
   * O roteiro precisa ser feito (ou terminado) antes de cortar: a falha foi
   * no "roteirizando", ou a seleção acabou e o roteiro nem começou (30/09).
   */
  roteiroPendente?: boolean;
}): "transcribe" | "select" | "write" | "cortar" | "roteiro" {
  if (video.temCortes) return "write";
  if (video.temTrechos && video.roteiroPendente) return "roteiro";
  if (video.temTrechos) return "cortar";
  if (video.temTranscricao) return "select";
  return "transcribe";
}

/** Qual rota o botão da tela deve chamar para este estado. */
export function proximaAcao(video: {
  status: string;
  temTranscricao: boolean;
  temTrechos: boolean;
  temCortes?: boolean;
  roteiroPendente?: boolean;
  attempts: number;
}): { rotulo: string; rota: string } | null {
  switch (video.status) {
    case "uploaded":
      return { rotulo: "Transcrever", rota: "transcribe" };
    case "transcribed":
      return { rotulo: "Escolher os trechos", rota: "select" };
    case "selected":
      if (video.roteiroPendente) return { rotulo: "Montar o roteiro", rota: "roteiro" };
      return { rotulo: "Cortar os vídeos", rota: "cortar" };
    case "cut":
      return { rotulo: "Escrever os posts", rota: "write" };
    case "failed":
      if (video.attempts >= MAX_TENTATIVAS) return null;
      return { rotulo: "Tentar de novo", rota: etapaDeRetomada(video) };
    default:
      return null;
  }
}

/**
 * O roteiro ainda precisa ser feito antes de cortar (30/09)? Vale para o
 * vídeo parado em "selected" (a seleção terminou e o passo do roteiro não
 * veio) e para a falha antes do corte. Com o roteiro aprovado, o próximo passo
 * volta a ser o corte.
 */
export function roteiroPendenteDe(v: {
  status: string;
  temTrechos: boolean;
  temCortes: boolean;
  roteiroLigado: boolean;
  roteiroAprovado: boolean;
}): boolean {
  return v.roteiroLigado && v.temTrechos && !v.temCortes && !v.roteiroAprovado && (v.status === "selected" || v.status === "failed");
}
