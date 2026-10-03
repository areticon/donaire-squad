/**
 * O bastão do escritório durante a esteira do VÍDEO (item 12, 29/09).
 *
 * ## Por que existe
 *
 * O escritório só lia o run da campanha de texto (`/api/pipeline/status`). A
 * esteira do vídeo não escreve log de run: ela anda pelo status do VideoJob
 * (transcribing, selecting, cutting, cut, writing, ready). Resultado: durante
 * os 20 minutos de uma gravação o escritório ficava parado, com todo mundo
 * "sem peça nesta semana", justamente quando o cliente está olhando a tela
 * esperando alguma coisa acontecer.
 *
 * Em vez de ensinar a cena 3D um segundo idioma, este módulo TRADUZ o estado
 * do vídeo para o mesmo formato de log que a esteira de texto já grava. Assim
 * `situacaoDoSquad` continua sendo a única que decide quem está com o bastão,
 * e a passagem (um robô andando até a mesa do outro) sai de graça.
 *
 * Pura de propósito, como `estado-do-squad.ts`: sem React, sem banco. O relógio
 * entra por parâmetro para dar para testar por script.
 */

import type { LogDaEsteira } from "@/lib/squad/estado-do-squad";
import { ESPECIALISTAS_DE_REDE } from "@/lib/squad/estado-do-squad";

/** O mínimo do vídeo que a tradução precisa. É um recorte de `VideoAoVivo`. */
export type VideoParaOBastao = {
  id: string;
  status: string;
  temTranscricao: boolean;
  temTrechosComPosts?: boolean;
  temCompleto: boolean;
  /** O completo não veio (30/09): o escritório não finge que alguém monta. */
  completoFalhou?: boolean;
  radar?: unknown | null;
  criadoEm: string;
  terminadoEm?: string | null;
  rodandoHaSegundos?: number | null;
};

export type FaseDoVideo =
  | "ouvindo"
  | "escolhendo"
  | "cortando"
  | "capas"
  | "escrevendo"
  | "completo"
  // A semana pronta viajando pela Vera e pelo Paulo até a sua mesa.
  | "revisando"
  | "publicando";

/** Quem faz o quê em cada fase: o dono leva o bastão, os ajudantes trabalham junto. */
export const QUEM_FAZ: Record<Exclude<FaseDoVideo, "escrevendo">, { dono: string; ajudantes: string[]; fala: string }> = {
  ouvindo: { dono: "vitor-video", ajudantes: [], fala: "Ouvindo a gravação, palavra por palavra." },
  escolhendo: { dono: "vitor-video", ajudantes: [], fala: "Escolhendo as falas que sustentam um post sozinhas." },
  // O Vitor corta, e a Diana decide o enquadramento de cada rede.
  cortando: { dono: "vitor-video", ajudantes: ["diana-design"], fala: "Cortando, com a Diana no enquadramento." },
  capas: { dono: "diana-design", ajudantes: [], fala: "Montando as capas e os títulos de cada corte." },
  completo: { dono: "vitor-video", ajudantes: ["yan-youtube"], fala: "Editando a gravação inteira, com capítulos para o Yan." },
  revisando: { dono: "vera-veredito", ajudantes: [], fala: "Revisando a semana antes de ir para o Paulo." },
  publicando: { dono: "paulo-publicador", ajudantes: [], fala: "Arrumando a semana no calendário para você." },
};

/** Quanto tempo cada especialista de rede segura o bastão na fase de escrita. */
const VEZ_DO_REDATOR_S = 9;
/** A viagem final: Vera revisa, Paulo arruma, e só então chega na sua mesa. */
const VERA_S = 9;
const PAULO_S = 9;

/**
 * Em que fase este vídeo está, lido do status do banco.
 *
 * `cut` cobre capa E redação (as duas rodam com o vídeo parado ali); a
 * diferença sai de já haver post escrito ou não. `ready` sem o completo é o
 * Vitor ainda editando a gravação inteira.
 */
export function faseDoVideo(v: VideoParaOBastao, agora: number): FaseDoVideo | null {
  switch (v.status) {
    case "uploaded":
    case "transcribing":
      return "ouvindo";
    case "transcribed":
    case "selecting":
      return "escolhendo";
    case "selected":
    case "cutting":
      return "cortando";
    case "cut":
      return v.temTrechosComPosts ? "escrevendo" : "capas";
    case "writing":
      return "escrevendo";
    case "ready": {
      if (!v.temCompleto) return v.completoFalhou ? null : "completo";
      // Terminou há pouco: a semana ainda está no caminho até você. Terminou
      // há muito (ou não sabemos quando): o escritório já está em paz.
      const fim = v.terminadoEm ? new Date(v.terminadoEm).getTime() : NaN;
      if (Number.isNaN(fim)) return null;
      const passou = (agora - fim) / 1000;
      if (passou < 0 || passou >= VERA_S + PAULO_S) return null;
      return passou < VERA_S ? "revisando" : "publicando";
    }
    default:
      return null;
  }
}

/**
 * Qual redator está com o bastão agora.
 *
 * O status não diz qual rede está sendo escrita (os dias rodam em paralelo no
 * servidor). Revezar os seis pelo relógio mostra o que de fato acontece, um
 * texto por rede, e cada troca vira uma passagem de bastão visível.
 */
export function redatorDaVez(agora: number): string {
  const i = Math.floor(agora / 1000 / VEZ_DO_REDATOR_S) % ESPECIALISTAS_DE_REDE.length;
  return ESPECIALISTAS_DE_REDE[i];
}

const REDE: Record<string, string> = {
  "lucas-linkedin": "LinkedIn",
  "xavier-x": "X",
  "igor-instagram": "Instagram",
  "fernanda-facebook": "Facebook",
  "tiago-tiktok": "TikTok",
  "yan-youtube": "YouTube",
};

/** O nome que o log usa: `situacaoDoSquad` reconhece o agente pelo primeiro nome. */
const PRIMEIRO_NOME: Record<string, string> = {
  "vitor-video": "Vitor",
  "diana-design": "Diana",
  "roberto-radar": "Roberto",
  "vera-veredito": "Vera",
  "paulo-publicador": "Paulo",
  "lucas-linkedin": "Lucas",
  "xavier-x": "Xavier",
  "igor-instagram": "Igor",
  "fernanda-facebook": "Fernanda",
  "tiago-tiktok": "Tiago",
  "yan-youtube": "Yan",
};

export type BastaoDoVideo = {
  fase: FaseDoVideo;
  /** Quem está com o bastão. */
  dono: string;
  /** Quem trabalha junto, sem o bastão (a Diana no corte, o Roberto pesquisando). */
  ajudantes: string[];
  /** Logs no formato da esteira de texto, na ordem; o último "running" é o dono. */
  logs: LogDaEsteira[];
};

/**
 * O bastão do vídeo agora, ou nulo quando não há vídeo andando.
 *
 * Os logs contam o caminho até aqui: quem já passou fica com um log "done"
 * (vira "entregou a parte dele" na plaqueta), e o dono fica com o último
 * "running". O Roberto pesquisa em paralelo desde a transcrição até o radar
 * existir, então entra como ajudante de quem estiver com o bastão.
 */
export function bastaoDoVideo(v: VideoParaOBastao, agora: number): BastaoDoVideo | null {
  const fase = faseDoVideo(v, agora);
  if (!fase) return null;
  const quando = new Date(agora).toISOString();
  const log = (id: string, message: string, status = "done"): LogDaEsteira => ({
    agent: PRIMEIRO_NOME[id] ?? id,
    message,
    status,
    // O que já passou leva uma data antiga: log sem data conta como recente em
    // `situacaoDoSquad`, e cada mesa ficava com um balão de "Feito." no ar.
    timestamp: status === "running" ? quando : new Date(0).toISOString(),
  });

  const ordem: FaseDoVideo[] = ["ouvindo", "escolhendo", "cortando", "capas", "escrevendo", "completo", "revisando", "publicando"];
  const atual = ordem.indexOf(fase);
  const logs: LogDaEsteira[] = [];
  // O que já passou: um log "done" de cada dono anterior, com data antiga para
  // não virar balão (o balão é de quem está trabalhando agora).
  for (const f of ordem.slice(0, atual)) {
    if (f === "escrevendo") {
      for (const r of ESPECIALISTAS_DE_REDE) logs.push(log(r, `Texto do ${REDE[r]} escrito.`));
    } else {
      const q = QUEM_FAZ[f];
      logs.push(log(q.dono, "Feito."));
      for (const a of q.ajudantes) logs.push(log(a, "Feito."));
    }
  }
  if (v.radar) logs.push(log("roberto-radar", "Pesquisa entregue."));

  let dono: string;
  let ajudantes: string[];
  let fala: string;
  if (fase === "escrevendo") {
    dono = redatorDaVez(agora);
    ajudantes = [];
    fala = `Escrevendo o texto do ${REDE[dono]}, na sua voz.`;
  } else {
    ({ dono, ajudantes, fala } = QUEM_FAZ[fase]);
    ajudantes = [...ajudantes];
  }
  const pesquisando = v.temTranscricao && !v.radar && atual <= ordem.indexOf("escrevendo");
  if (pesquisando) ajudantes.push("roberto-radar");

  // Os ajudantes primeiro, o dono por último: é o último "running" que leva o bastão.
  for (const a of ajudantes) {
    const falaDoAjudante =
      a === "roberto-radar"
        ? "Pesquisando o que estão falando do seu tema, com fonte."
        : a === "diana-design"
          ? "Enquadrando cada corte para o formato da rede."
          : a === "yan-youtube"
            ? "Preparando título e capítulos do YouTube."
            : "Ajudando.";
    logs.push(log(a, falaDoAjudante, "running"));
  }
  logs.push(log(dono, fala, "running"));
  return { fase, dono, ajudantes, logs };
}

/** O vídeo que o escritório acompanha: o mais novo que ainda está andando. */
export function videoDaVez<T extends VideoParaOBastao>(videos: T[], agora: number): T | null {
  return videos.find((v) => faseDoVideo(v, agora) !== null) ?? null;
}
