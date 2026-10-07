import type { Remocao } from "@/lib/media/edicao";
import type { EscolhaDoCorte, Intervalo } from "@/lib/media/controle-do-corte";
import type { AberturaDoCompleto, MomentoDaAbertura } from "@/lib/media/abertura-do-roteiro";

/**
 * O CORTE DO CLIENTE NO VÍDEO COMPLETO (08/10/2026). Módulo puro: sem banco,
 * sem IA, sem rede.
 *
 * O pedido do Bruno: "deve ter o controle de corte, os mesmos recursos para o
 * vídeo inteiro; às vezes o usuário não quer um corte de um vídeo pequeno, ele
 * quer o vídeo mas sem o começo, sem o fim, ele quer fazer um pequeno corte no
 * meio que a IA deixou passar". A conta é a do controle dos cortes
 * (lib/media/controle-do-corte.ts); aqui ficam o registro próprio do completo
 * e o que precisa andar junto quando a fala dele muda.
 *
 * ## Um registro próprio
 *
 * O completo era a gravação inteira menos `roteiro.remocoes`, a lista da
 * limpeza, que é a MESMA dos cortes. Gravar nela o que o cliente tirou do
 * completo mudaria os cortes também. Então o corte do completo mora em
 * `roteiro.completoDoCliente`: os pedaços que vão ao ar e o complemento deles
 * (o que o worker tira de 0 à duração). `roteiro.remocoes` continua sendo a
 * limpeza da IA: a base dos cortes e o que a tela mostra riscado.
 *
 * ## Depois da entrega, o editado não sai do ar
 *
 * Refazer o completo trocava o `completoUrl` pela base nova na hora, e o
 * cliente via o vídeo sem nenhum efeito por dezenas de minutos (e para sempre,
 * se a montagem falhasse). Com o corte do cliente, a base nova vai direto para
 * a fila da montagem (`montagemDoRecorte`), e o editado de antes fica no ar até
 * o novo ficar pronto. Se a montagem não sai, tudo volta como estava
 * (`estadoComRecorte`): a montagem, o roteiro e a refação, que não conta.
 */

export type MantidoNoCompleto = { de: number; ate: number; texto: string; antes?: string; depois?: string };

/** A refação do completo em andamento (depois da entrega). */
export type RefazendoOCompleto = {
  em: string;
  /** A base nova que o worker devolveu; null enquanto ele trabalha. */
  base: string | null;
  refacao: number;
  /** Créditos cobrados nesta refação (zero na cortesia), para devolver se ela não sair. */
  creditos: number;
  userId: string;
  /** O roteiro de antes deste corte (sem esta marca), para voltar se o completo novo não sair. */
  roteiroAnterior: Record<string, unknown> | null;
};

/** `completoMontagem.roteiro.completoDoCliente`. */
export type CompletoDoCliente = {
  /** O que vai ao ar, no tempo da gravação (o mesmo que o player tocou). */
  manter: Intervalo[];
  /** O complemento de `manter` de 0 à duração: é o que vai ao worker como `remocoes` do completo. */
  remocoes: Remocao[];
  /** Só o que o cliente tirou (a IA tinha deixado). */
  doCliente: Remocao[];
  /** O que ele devolveu da limpeza de propósito: a guarda da fala não tira (lib/media/guarda-da-fala.ts). */
  mantidosPeloUsuario: MantidoNoCompleto[];
  /** Refações depois da entrega (antes da aprovação, aplicar não conta). */
  refacoes: number;
  ultima: { em: string; escolha: EscolhaDoCorte; mudancas: string[]; duracao: number; creditos?: number; sairam?: string[] } | null;
  refazendo?: RefazendoOCompleto | null;
  /**
   * A última refação voltou atrás (a base ou a montagem falhou): o controle diz
   * ao cliente. `base`: o arquivo daquele corte, para um aviso repetido do
   * worker não pô-lo no ar depois (`baseDoCorte`).
   */
  naoSaiu?: { em: string; motivo: string | null; base?: string | null } | null;
};

/**
 * Por quanto tempo a marca da refação vale (08/10): uma refação do completo
 * leva perto de 0,6 min por minuto de gravação na base, mais a montagem.
 * Passado isto, o trabalho morreu sem aviso e a marca não trava mais nada.
 */
export const REFAZENDO_VALE_MS = 4 * 3600_000;

/**
 * UM CORTE DO CLIENTE NO COMPLETO ESTÁ ANDANDO (revisão de 08/10): o worker
 * refaz a base ou a montagem edita em cima dela. Enquanto anda, nada mais
 * mexe na edição do completo (o chat do Vitor, a volta à edição, o ajuste
 * pedido no card): a base do corte só não tira o editado do ar se a montagem
 * de agora ainda for a que está no ar quando ela chegar.
 */
export function corteDoCompletoAndando(cdc: Pick<CompletoDoCliente, "refazendo"> | null | undefined, agora = Date.now()): boolean {
  const r = cdc?.refazendo;
  return Boolean(r && agora - new Date(r.em).getTime() < REFAZENDO_VALE_MS);
}

/**
 * O roteiro que está no ar antes de um corte novo, para voltar se ele não
 * sair (revisão de 08/10). Com uma refação velha que nunca voltou (o worker
 * morreu sem aviso), o que está no ar é o roteiro de ANTES dela, e não o dela:
 * voltar para o dela poria na tela uma fala que nunca foi ao ar.
 */
export function roteiroAntesDoCorte<R extends { completoDoCliente?: CompletoDoCliente | null }>(r: R): R {
  const cdc = r.completoDoCliente;
  if (!cdc?.refazendo) return r;
  if (cdc.refazendo.roteiroAnterior) return cdc.refazendo.roteiroAnterior as unknown as R;
  return { ...r, completoDoCliente: { ...cdc, refazendo: null } };
}

/**
 * A BASE QUE O WORKER DEVOLVEU, vista pelo corte do cliente (revisão de
 * 08/10). Com o editado no ar, o `completoUrl` nunca é a base do corte, então
 * a rota não reconhece um aviso repetido pela URL, e um repetido tomaria o
 * lugar do editado e apagaria o arquivo dele. O worker repete o aviso quando a
 * resposta demora ou falha (worker/src/index.mjs, `avisar`), e o pedido só do
 * completo pode sair duas vezes (a retomada depois de um reinício, o botão de
 * refazer o completo).
 *
 * - "do-corte": a base do corte em andamento, que ainda não chegou: vai para a montagem;
 * - "repetida": uma base que este vídeo já recebeu (a da montagem, a do corte
 *   em andamento ou a do corte que não saiu): nada muda;
 * - "segunda": outra base do MESMO corte, que já tem a sua na montagem: nada
 *   muda (o arquivo extra pode sair);
 * - "comum": nenhuma das anteriores, o caminho de sempre.
 */
export function baseDoCorte(
  base: string,
  cdc: Pick<CompletoDoCliente, "refazendo" | "naoSaiu"> | null | undefined,
  montagem: { baseUrl?: string | null; completoOriginal?: { url: string } | null } | null | undefined,
  agora = Date.now()
): "do-corte" | "repetida" | "segunda" | "comum" {
  const ref = cdc?.refazendo;
  if (ref?.base === base || cdc?.naoSaiu?.base === base || montagem?.baseUrl === base || montagem?.completoOriginal?.url === base) return "repetida";
  if (!corteDoCompletoAndando(cdc, agora)) return "comum";
  return ref?.base ? "segunda" : "do-corte";
}

/**
 * O roteiro de antes com a marca de que o último corte não saiu. Sem corte
 * anterior, nasce um registro vazio (sem `manter`, o completo continua sendo a
 * gravação menos a limpeza) só para levar o aviso.
 */
export function comCorteQueNaoSaiu<R extends { completoDoCliente?: CompletoDoCliente | null } | null | undefined>(r: R, naoSaiu: { em: string; motivo: string | null; base?: string | null }): R {
  if (!r) return r;
  const cdc: CompletoDoCliente = r.completoDoCliente ?? { manter: [], remocoes: [], doCliente: [], mantidosPeloUsuario: [], refacoes: 0, ultima: null };
  return { ...r, completoDoCliente: { ...cdc, refazendo: null, naoSaiu } };
}

// ─────────────────────────────── o que anda junto com a fala ───────────────────────────────

/** A posição viva mais perto de `k` no mapa, olhando para a frente primeiro e sem passar de [de, ate]. */
function vivaEntre(mapa: ReadonlyArray<number | null>, de: number, ate: number, direcao: 1 | -1): number | null {
  if (direcao === 1) {
    for (let k = de; k <= ate; k++) if (mapa[k] !== null && mapa[k] !== undefined) return mapa[k] as number;
  } else {
    for (let k = ate; k >= de; k--) if (mapa[k] !== null && mapa[k] !== undefined) return mapa[k] as number;
  }
  return null;
}

/**
 * Um momento da abertura (frase inteira, índices na fala do completo) levado
 * para a fala nova; null se alguma palavra dele saiu, porque a abertura repete
 * a frase como foi dita. O mesmo critério do gancho dos cortes
 * (lib/media/controle-do-corte-servidor.ts).
 */
export function moverMomento(m: MomentoDaAbertura, mapa: ReadonlyArray<number | null>, novas: Array<{ inicio: number; fim: number }>): MomentoDaAbertura | null {
  const de = mapa[m.de];
  const ate = mapa[m.ate];
  if (de == null || ate == null || ate - de !== m.ate - m.de) return null;
  for (let k = m.de; k <= m.ate; k++) if (mapa[k] == null) return null;
  return { ...m, de, ate, inicio: +Math.max(0, novas[de].inicio - 0.05).toFixed(3), fim: +(novas[ate].fim + 0.05).toFixed(3) };
}

/** A abertura do completo na fala nova: o momento cuja frase foi cortada sai (e o "trocar" da tela puxa uma reserva). */
export function moverAbertura(a: AberturaDoCompleto, mapa: ReadonlyArray<number | null>, novas: Array<{ inicio: number; fim: number }>): AberturaDoCompleto {
  const leva = (lista: MomentoDaAbertura[]) => lista.map((m) => moverMomento(m, mapa, novas)).filter((m): m is MomentoDaAbertura => Boolean(m));
  return { ...a, momentos: leva(a.momentos), reservas: leva(a.reservas ?? []) };
}

/**
 * Um trecho por índices de palavra (inclusivos) levado para a fala nova: as
 * pontas vão para a primeira e a última palavra que ficaram dentro dele; null
 * se nenhuma ficou. É o caso da sugestão cena a cena e dos blocos do diretor.
 */
export function levarTrecho<T extends { de: number; ate: number; inicio?: number; fim?: number }>(
  t: T,
  mapa: ReadonlyArray<number | null>,
  novas: Array<{ inicio: number; fim: number }>
): T | null {
  const de = vivaEntre(mapa, t.de, t.ate, 1);
  const ate = vivaEntre(mapa, t.de, t.ate, -1);
  if (de === null || ate === null || !novas[de] || !novas[ate]) return null;
  return { ...t, de, ate, ...("inicio" in t ? { inicio: novas[de].inicio } : {}), ...("fim" in t ? { fim: novas[ate].fim } : {}) };
}

// ─────────────────────────────── a refação depois da entrega ───────────────────────────────

export const MOTIVO_DO_CORTE_QUE_NAO_SAIU = "Não consegui aplicar o seu corte no vídeo completo: o vídeo segue como estava, e esta refação não contou.";

/** A marca na montagem de que a base na fila é a de um corte do cliente, com o estado que estava no ar. */
export type RecorteNaMontagem = { em: string; anterior: Record<string, unknown> | null };

type MontagemComRecorte = {
  estado: string;
  desde: string;
  motivo?: string | null;
  montadoUrl?: string;
  roteiro?: ({ completoDoCliente?: CompletoDoCliente | null } & Record<string, unknown>) | null;
  recorteDoCliente?: RecorteNaMontagem | null;
};

/** O roteiro sem a marca da refação (e sem o roteiro anterior que ela carrega). */
export function semRefazendo<R extends MontagemComRecorte["roteiro"]>(r: R): R {
  if (!r?.completoDoCliente?.refazendo) return r;
  return { ...r, completoDoCliente: { ...r.completoDoCliente, refazendo: null } };
}

/** O editado está no ar? Só nesse caso a base do corte espera a montagem (senão ela vai ao ar como sempre). */
export function editadoNoAr(m: Pick<MontagemComRecorte, "estado" | "montadoUrl"> | null | undefined, completoUrl: string | null | undefined): boolean {
  return Boolean(m && m.estado === "pronto" && m.montadoUrl && completoUrl && completoUrl === m.montadoUrl);
}

/**
 * A montagem que entra na fila com a base do corte do cliente: a base nova
 * vira a base e o original (a próxima refeita parte dela, com o corte), o
 * editado de antes continua sendo o `montadoUrl` (é ele que está no ar), e o
 * estado inteiro de antes fica guardado para voltar se a montagem não sair.
 */
export function montagemDoRecorte<M extends MontagemComRecorte>(
  m: M,
  base: { url: string; bytes: number | null },
  o: { origem: string; agora: string }
): MontagemComRecorte & Record<string, unknown> {
  const { roteiro, recorteDoCliente: _velho, ...anterior } = m as M & Record<string, unknown>;
  void _velho;
  const cdc = roteiro?.completoDoCliente;
  return {
    estado: "na-fila",
    desde: o.agora,
    origem: o.origem,
    baseUrl: base.url,
    completoOriginal: { url: base.url, bytes: base.bytes },
    ...(m.montadoUrl ? { montadoUrl: m.montadoUrl } : {}),
    ...(roteiro
      ? { roteiro: cdc?.refazendo ? { ...roteiro, completoDoCliente: { ...cdc, refazendo: { ...cdc.refazendo, base: base.url } } } : roteiro }
      : {}),
    recorteDoCliente: { em: o.agora, anterior: anterior as Record<string, unknown> },
  };
}

/**
 * O estado que a montagem grava, visto pelo corte do cliente. Puro: é chamado
 * na troca de estado da montagem do completo (lib/media/montagem-do-completo.ts).
 *
 * - Pronto: o corte foi ao ar; a marca e o roteiro anterior saem.
 * - Sem montagem: o corte NÃO foi ao ar. Volta o estado de antes (o editado
 *   no ar, a fala e os elementos de antes), com o motivo dito, e devolve a
 *   refação para quem chama estornar.
 * - Qualquer outro: como veio.
 *
 * `voltou` diz que o corte foi desfeito, mesmo quando a marca da refação se
 * perdeu no caminho (revisão de 08/10): sem ela, quem chama devolvia a edição
 * inteira de um vídeo cuja edição de antes voltou ao ar.
 */
export function estadoComRecorte<M extends MontagemComRecorte>(novo: M): { estado: M; desfeito: RefazendoOCompleto | null; voltou: boolean } {
  const r = novo.recorteDoCliente;
  if (!r) {
    // A montagem do corte foi tomada por outra (a refeita forçada pelo admin) e saiu com a mesma base: a marca da refação não vale mais.
    const ref = novo.roteiro?.completoDoCliente?.refazendo;
    if (novo.estado === "pronto" && ref?.base && ref.base === (novo as Record<string, unknown>).baseUrl) return { estado: { ...novo, roteiro: semRefazendo(novo.roteiro) }, desfeito: null, voltou: false };
    return { estado: novo, desfeito: null, voltou: false };
  }
  if (novo.estado === "pronto") return { estado: { ...novo, recorteDoCliente: null, roteiro: semRefazendo(novo.roteiro) }, desfeito: null, voltou: false };
  if (novo.estado !== "sem-montagem") return { estado: novo, desfeito: null, voltou: false };
  const refazendo = novo.roteiro?.completoDoCliente?.refazendo ?? null;
  const base = refazendo?.base ?? (typeof (novo as Record<string, unknown>).baseUrl === "string" ? ((novo as Record<string, unknown>).baseUrl as string) : null);
  const naoSaiu = { em: novo.desde, motivo: novo.motivo ?? null, base };
  const roteiroAnterior = comCorteQueNaoSaiu((refazendo?.roteiroAnterior as M["roteiro"] | null | undefined) ?? semRefazendo(novo.roteiro), naoSaiu);
  if (!r.anterior) return { estado: { ...novo, recorteDoCliente: null, roteiro: roteiroAnterior }, desfeito: refazendo, voltou: true };
  const voltou = {
    ...(r.anterior as Partial<M>),
    desde: novo.desde,
    roteiro: roteiroAnterior,
    motivo: MOTIVO_DO_CORTE_QUE_NAO_SAIU,
    recorteDoCliente: null,
    recorteQueNaoSaiu: naoSaiu,
  } as unknown as M;
  return { estado: voltou, desfeito: refazendo, voltou: true };
}
