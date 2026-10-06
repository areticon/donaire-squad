/**
 * O estado de cada agente do squad, derivado dos dados e não da tela.
 *
 * ## Por que existe
 *
 * Em 18/09 o Bruno abriu o Gestor novo e disse: "agora ficamos sem saber onde
 * estão os agentes". A matriz antiga tinha uma LINHA por agente e, ao virar
 * calendário por dia, os agentes sumiram da tela. O escritório 3D os traz de
 * volta, mas o escritório só desenha: quem sabe o que cada agente está fazendo
 * é esta função, que cruza as peças da semana com o log da esteira.
 *
 * Pura de propósito. Sem React, sem DOM, sem three: dá para testar por script,
 * com cenário de controle, antes de encostar no navegador.
 */

import { ID_ANTIGO } from "@/lib/squad/definicoes-dos-agentes";

export type EstadoDoAgente = "trabalhando" | "pronto" | "esperando" | "aviso" | "ocioso";

export type Agente = {
  id: string;
  nome: string;
  /** O primeiro nome, que é como o log da esteira o chama. */
  primeiroNome: string;
  /**
   * "O" ou "A".
   *
   * Existe porque um agente fala dos outros: no escritório dá para chegar
   * perto de alguém e pedir um comentário sobre um colega. A primeira versão
   * montava a frase com "O" fixo e saiu "O Vera reprova mais do que aprova",
   * visto no protótipo. Não é firula: é a diferença entre um squad e sete
   * campos de banco.
   */
  artigo: "O" | "A";
  papel: string;
  /** A cor do agente no escritório, e a mesma da matriz antiga. */
  cor: string;
  cardTypes: string[];
};

/**
 * O squad, na ordem em que a esteira passa o bastão.
 *
 * Reorganizado em 29/09 (pedido do Bruno): um especialista por rede, porque a
 * plataforma passou a publicar em seis. O Tiago saiu do X para o TikTok e o X
 * ficou com o Xavier. A Vera virou GERENTE do time: continua sendo quem revisa,
 * e agora também supervisiona a semana inteira e retreina quem mais erra (ver
 * `lib/squad/licoes-da-vera.ts`).
 *
 * Os especialistas de Instagram, Facebook e TikTok não têm `cardTypes`: as
 * peças deles são gravadas como `post_linkedin` com a rede em `metadata`
 * (herança de quando o Lucas adaptava tudo), e o dono é reconhecido pelo
 * `agentId`. Ver `donoDaPeca`.
 */
export const AGENTES: Agente[] = [
  { id: "roberto-radar", artigo: "O", nome: "Roberto Radar", primeiroNome: "Roberto", papel: "Pesquisa", cor: "#3b82f6", cardTypes: ["research"] },
  { id: "lucas-linkedin", artigo: "O", nome: "Lucas LinkedIn", primeiroNome: "Lucas", papel: "LinkedIn", cor: "#1d4ed8", cardTypes: ["post_linkedin"] },
  { id: "xavier-x", artigo: "O", nome: "Xavier X", primeiroNome: "Xavier", papel: "X", cor: "#475569", cardTypes: ["post_twitter"] },
  { id: "igor-instagram", artigo: "O", nome: "Igor Instagram", primeiroNome: "Igor", papel: "Instagram", cor: "#db2777", cardTypes: [] },
  { id: "fernanda-facebook", artigo: "A", nome: "Fernanda Facebook", primeiroNome: "Fernanda", papel: "Facebook", cor: "#6366f1", cardTypes: [] },
  { id: "tiago-tiktok", artigo: "O", nome: "Tiago TikTok", primeiroNome: "Tiago", papel: "TikTok", cor: "#0ea5e9", cardTypes: [] },
  { id: "yan-youtube", artigo: "O", nome: "Yan YouTube", primeiroNome: "Yan", papel: "YouTube", cor: "#dc2626", cardTypes: [] },
  { id: "diana-design", artigo: "A", nome: "Diana Design", primeiroNome: "Diana", papel: "Mídia", cor: "#a855f7", cardTypes: ["media"] },
  { id: "vitor-video", artigo: "O", nome: "Vitor Vídeo", primeiroNome: "Vitor", papel: "Cortes", cor: "#f43f5e", cardTypes: ["video_clip", "video_completo"] },
  { id: "vera-veredito", artigo: "A", nome: "Vera Veredito", primeiroNome: "Vera", papel: "Gerente do time", cor: "#eab308", cardTypes: ["preview"] },
  { id: "paulo-publicador", artigo: "O", nome: "Paulo Publicador", primeiroNome: "Paulo", papel: "Publicação", cor: "#22c55e", cardTypes: ["publish"] },
];

/** Os especialistas por rede, na ordem do bastão. É a "mesa comprida" do escritório. */
export const ESPECIALISTAS_DE_REDE = ["lucas-linkedin", "xavier-x", "igor-instagram", "fernanda-facebook", "tiago-tiktok", "yan-youtube"];

/**
 * De quem é esta peça.
 *
 * Pelo `agentId` quando ele é de um agente conhecido; pelo tipo só quando não
 * é. A ordem importa desde 29/09: o Igor, a Fernanda e o Tiago gravam peças do
 * tipo `post_linkedin`, e a regra antiga ("id OU tipo") dava todas elas ao
 * Lucas, que vem antes na lista.
 */
export function donoDaPeca(peca: { agentId?: string | null; cardType: string }): Agente | undefined {
  return agentePorId(peca.agentId) ?? AGENTES.find((a) => a.cardTypes.includes(peca.cardType));
}

/**
 * A arte de cada agente, no estilo 3D de massinha aprovado pelo Bruno em
 * 28/09/2026 (referências em docs/design/referencias-3d, geração em
 * scripts/tmp/gerar-elenco-3d-2809.mjs). Três versões por agente, todas com
 * fundo transparente: o busto pequeno (160 px) para círculos de lista, o busto
 * grande (512 px) para fichas, e a cena na mesa para o escritório.
 *
 * O caminho é montado pelo id, então agente novo precisa da arte gerada com o
 * mesmo id; sem arte, quem desenha cai na inicial na cor do agente.
 */
export function arteDoAgente(id: string): { avatar: string; avatarPequeno: string; mesa: string } | null {
  const agente = agentePorId(id);
  if (!agente) return null;
  return {
    avatar: `/agentes/${agente.id}-avatar.webp`,
    avatarPequeno: `/agentes/${agente.id}-avatar-p.webp`,
    mesa: `/agentes/${agente.id}-mesa.webp`,
  };
}

/**
 * O DEV DA DEMANDOU (06/10/2026). Fora de `AGENTES` de propósito: a lista
 * acima é o squad do CLIENTE (ordem do bastão, mesa comprida, project_agents,
 * landing). O Davi trabalha para a plataforma: aparece no escritório de todo
 * projeto, numa baia própria com a placa da Demandou, sem peça e sem bastão.
 * Ver lib/squad/definicoes-dos-agentes.ts (FICHA_DO_DEV) e lib/feedback.
 */
export const AGENTE_DEV: Agente = { id: "davi-dev", artigo: "O", nome: "Davi Dev", primeiroNome: "Davi", papel: "Dev da Demandou", cor: "#0f766e", cardTypes: [] };

/**
 * Acha o agente pelo id, aceitando os ids antigos que ainda circulam em peça
 * gravada e em tela velha ("daniela-design" era a Diana antes do nome atual, e
 * "tiago-twitter" era o X, que desde 29/09 é do Xavier).
 */
export function agentePorId(id: string | null | undefined): Agente | undefined {
  if (!id) return undefined;
  const normalizado = ID_ANTIGO[id] ?? id;
  if (normalizado === AGENTE_DEV.id) return AGENTE_DEV;
  return AGENTES.find((a) => a.id === normalizado);
}

export type PecaDoSquad = {
  id: string;
  agentId: string;
  cardType: string;
  status: string;
  /**
   * O card ainda é de espera (o agente está escrevendo ou desenhando). Não
   * entra em "peças esperando você": não há o que aprovar ainda (29/09).
   * Opcional porque nem toda origem sabe dizer (lib/squad/peca-em-producao).
   */
  emProducao?: boolean;
};

export type LogDaEsteira = {
  agent: string;
  message: string;
  status: string;
  /** ISO, gravado pelo `appendLog`. Decide por quanto tempo o balão fica no ar. */
  timestamp?: string;
  /**
   * Para quem este log é dirigido, quando ele é uma cobrança de um agente a
   * outro. A Vera grava isto ao reprovar um dia (parte 133). Sem o campo, a
   * tela sabe que alguém reprovou e não sabe de quem é a mesa para onde ir.
   */
  para?: string;
};

/** Uma coisa que um agente faz COM outro: entregar o bastão, ou cobrar. */
export type Cena = {
  de: string;
  /** O agentId de quem recebe, ou "voce" quando a semana chega na nossa mesa. */
  para: string;
  humor: "entrega" | "bronca";
  /** O que quem anda diz no caminho. */
  fala: string;
  /**
   * Quantos segundos fica no destino. A visita à sua sala (29/09) espera você
   * ler e responder; a entrega de bastão é rápida.
   */
  demora?: number;
};

export type SituacaoDoAgente = {
  agente: Agente;
  estado: EstadoDoAgente;
  /** A linha que aparece embaixo do nome: "3 peças esperando você". */
  detalhe: string;
  pecas: number;
  pendentes: number;
};

export type SituacaoDoSquad = {
  agentes: SituacaoDoAgente[];
  /** Quem está com o bastão agora, quando a esteira está rodando. */
  trabalhando: string | null;
  /**
   * O que cada agente está dizendo agora, pelo agentId. É o log mais recente
   * dele, e é o que vira balão de fala no escritório.
   */
  falas: Record<string, string>;
  /**
   * A cobrança mais recente de um agente a outro, quando existe. O escritório
   * transforma isto em alguém atravessando a sala irritado.
   */
  bronca: { de: string; para: string; motivo: string } | null;
};

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? `1 ${um}` : `${n} ${varios}`;
}

/** O log chama o agente por nome completo ou pelo primeiro nome. */
function logEhDoAgente(log: LogDaEsteira, agente: Agente): boolean {
  const nome = log.agent.trim().toLowerCase();
  return nome === agente.nome.toLowerCase() || nome.startsWith(agente.primeiroNome.toLowerCase());
}

function pecaEhDoAgente(peca: PecaDoSquad, agente: Agente): boolean {
  return donoDaPeca(peca)?.id === agente.id;
}

/** Quanto tempo o balão de um agente parado fica no ar depois do log dele. */
const FALA_DURA_MS = 14_000;

export function situacaoDoSquad({
  pecas,
  logs,
  rodando,
  agora = Date.now(),
}: {
  pecas: PecaDoSquad[];
  logs: LogDaEsteira[];
  rodando: boolean;
  /** Injetável para o teste não depender do relógio. */
  agora?: number;
}): SituacaoDoSquad {
  // O bastão está com quem tem o ÚLTIMO log "running". A esteira escreve em
  // ordem, então o último é o agente da vez; os anteriores já entregaram.
  const ultimoRodando = rodando ? [...logs].reverse().find((l) => l.status === "running") : undefined;
  const agenteDaVez = ultimoRodando ? AGENTES.find((a) => logEhDoAgente(ultimoRodando, a)) : undefined;

  const agentes = AGENTES.map((agente): SituacaoDoAgente => {
    const minhas = pecas.filter((p) => pecaEhDoAgente(p, agente) && p.status !== "archived");
    const pendentes = minhas.filter((p) => !p.emProducao && (p.status === "pending" || p.status === "needs_revision")).length;
    const rejeitadas = minhas.filter((p) => p.status === "rejected").length;
    const meusLogs = logs.filter((l) => logEhDoAgente(l, agente));
    const ultimoLog = meusLogs.at(-1);

    if (rodando) {
      if (agenteDaVez?.id === agente.id) {
        return { agente, estado: "trabalhando", detalhe: ultimoRodando?.message ?? "trabalhando agora", pecas: minhas.length, pendentes };
      }
      if (ultimoLog && (ultimoLog.status === "warning" || ultimoLog.status === "error")) {
        return { agente, estado: "aviso", detalhe: ultimoLog.message, pecas: minhas.length, pendentes };
      }
      // Já passou por aqui: tem log próprio e o bastão seguiu, ou tem peça salva.
      if (meusLogs.length > 0 || minhas.length > 0) {
        return {
          agente,
          estado: "pronto",
          detalhe: minhas.length > 0 ? `entregou ${plural(minhas.length, "peça", "peças")}` : "entregou a parte dele",
          pecas: minhas.length,
          pendentes,
        };
      }
      return { agente, estado: "esperando", detalhe: "esperando a vez", pecas: 0, pendentes: 0 };
    }

    if (minhas.length === 0) {
      return { agente, estado: "ocioso", detalhe: "sem peça nesta semana", pecas: 0, pendentes: 0 };
    }
    if (rejeitadas > 0 && pendentes === 0) {
      return { agente, estado: "aviso", detalhe: `${plural(rejeitadas, "peça rejeitada", "peças rejeitadas")}`, pecas: minhas.length, pendentes };
    }
    if (pendentes > 0) {
      return { agente, estado: "pronto", detalhe: `${plural(pendentes, "peça esperando você", "peças esperando você")}`, pecas: minhas.length, pendentes };
    }
    return { agente, estado: "pronto", detalhe: `${plural(minhas.length, "peça aprovada", "peças aprovadas")}`, pecas: minhas.length, pendentes };
  });

  /**
   * A fala de cada um. O Bruno pediu em 18/09 que "todos os agentes devem ter
   * um chat", e não só quem está com o bastão.
   *
   * O balão de quem NÃO está trabalhando some depois de alguns segundos. Sete
   * balões permanentes deixariam de ser conversa e virariam um mural: o que
   * faz a sala parecer viva é a fala aparecer e passar.
   */
  const falas: Record<string, string> = {};
  for (const agente of AGENTES) {
    const ultimo = logs.filter((l) => logEhDoAgente(l, agente)).at(-1);
    if (!ultimo?.message) continue;
    const comBastao = agenteDaVez?.id === agente.id;
    const quando = ultimo.timestamp ? new Date(ultimo.timestamp).getTime() : NaN;
    const recente = Number.isNaN(quando) ? true : agora - quando < FALA_DURA_MS;
    if (comBastao || recente) falas[agente.id] = ultimo.message;
  }

  // A bronca: o log mais recente que tem destinatário. Ela vale por um tempo
  // curto (o escritório a consome uma vez), então basta o último.
  const cobranca = [...logs].reverse().find((l) => l.para && AGENTES.some((a) => a.id === l.para));
  const quemCobra = cobranca ? AGENTES.find((a) => logEhDoAgente(cobranca, a)) : undefined;
  const bronca =
    cobranca && quemCobra && quemCobra.id !== cobranca.para
      ? { de: quemCobra.id, para: cobranca.para!, motivo: cobranca.message }
      : null;

  return { agentes, trabalhando: agenteDaVez?.id ?? null, falas, bronca };
}
