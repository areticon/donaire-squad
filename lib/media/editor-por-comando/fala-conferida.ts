import { conferirFala, janelasMantidasPeloUsuario, type ConferenciaDaFala, type MantidoPeloUsuario } from "@/lib/media/guarda-da-fala";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import type { Word } from "@/lib/media/transcribe";

/**
 * A FALA CONFERIDA ANTES DO DIRETOR (05/10/2026), só no editor por comando.
 *
 * O Bruno, na prova do Vox de Fé & Gestão: "no começo eu erro o nome Marta e
 * Maria e repito, e o erro não foi cortado". A fala do corte vem do roteiro
 * aprovado (ou da edição gravada), feita com a limpeza da gravação na regra
 * "na dúvida, NÃO corta". O caminho antigo ainda tinha a GUARDA NA SAÍDA
 * (lib/media/guarda-da-fala.ts), que o worker chama depois do render final e
 * apara o arquivo. No editor por comando isso chega tarde: a composição do
 * diretor é escrita sobre a fala, e aparar depois do render corta peça no
 * meio. E a prova local (montarSobMedida direto) nem passava pela guarda.
 *
 * Então a MESMA conferência da guarda (retomadas na regra "na dúvida corta a
 * tentativa incompleta" + gagueira colada) roda aqui, sobre a fala do corte,
 * ANTES do diretor: o que sai vira buraco no `manter` (o worker emenda a
 * gravação sem o tropeço) e as palavras andam para trás. A guarda na saída
 * continua no final, e não acha mais o que já saiu.
 *
 * Interruptor: FALA_CONFERIDA_NO_COMANDO=0 desliga (a fala segue como veio).
 */

export function falaConferidaLigada(): boolean {
  return process.env.FALA_CONFERIDA_NO_COMANDO !== "0";
}

export type FalaDoCorte = { manter: Array<{ de: number; ate: number }>; palavras: PalavraNoCorte[]; duracao: number };

type Intervalo = { de: number; ate: number };

/** Une e ordena intervalos (no tempo do corte). */
function unidos(xs: Intervalo[]): Intervalo[] {
  const ord = xs.filter((x) => x.ate - x.de > 0.001).sort((a, b) => a.de - b.de);
  const saida: Intervalo[] = [];
  for (const x of ord) {
    const u = saida[saida.length - 1];
    if (u && x.de <= u.ate + 0.001) u.ate = Math.max(u.ate, x.ate);
    else saida.push({ ...x });
  }
  return saida;
}

/**
 * Tira da fala os trechos `remover` (no TEMPO DO CORTE): o `manter` (no tempo
 * da gravação, relativo ao início do trecho) perde os pedaços que tocam neles,
 * as palavras de dentro saem e as de depois andam para trás. Devolve também
 * `tempo`, que leva um instante da fala velha para a nova (o gancho aprovado
 * usa). Só aritmética: sem rede, sem custo.
 */
export function tirarDaFala(fala: FalaDoCorte, remover: Intervalo[]): { fala: FalaDoCorte; tempo: (t: number) => number; tirados: number } {
  const rs = unidos(remover.map((r) => ({ de: Math.max(0, r.de), ate: Math.min(fala.duracao, r.ate) })));
  if (!rs.length) return { fala, tempo: (t) => t, tirados: 0 };
  // O manter novo: cada intervalo da gravação perde o que cai dentro de uma remoção.
  const manter: Intervalo[] = [];
  let c = 0;
  for (const m of fala.manter) {
    const len = m.ate - m.de;
    let cursor = c;
    for (const r of rs) {
      if (r.ate <= cursor || r.de >= c + len) continue;
      if (r.de > cursor) manter.push({ de: m.de + (cursor - c), ate: m.de + (r.de - c) });
      cursor = Math.max(cursor, Math.min(c + len, r.ate));
    }
    if (cursor < c + len) manter.push({ de: m.de + (cursor - c), ate: m.ate });
    c += len;
  }
  const limpo = manter.filter((m) => m.ate - m.de >= 0.05).map((m) => ({ de: +m.de.toFixed(3), ate: +m.ate.toFixed(3) }));
  const tempo = (t: number) => {
    let menos = 0;
    for (const r of rs) {
      if (t >= r.ate) menos += r.ate - r.de;
      else if (t > r.de) menos += t - r.de;
    }
    return +(t - menos).toFixed(3);
  };
  const dentro = (w: PalavraNoCorte) => rs.some((r) => (w.inicio + w.fim) / 2 > r.de && (w.inicio + w.fim) / 2 < r.ate);
  const palavras = fala.palavras.filter((w) => !dentro(w)).map((w) => ({ texto: w.texto, inicio: tempo(w.inicio), fim: Math.max(tempo(w.inicio) + 0.05, tempo(w.fim)) }));
  const duracao = +limpo.reduce((s, m) => s + (m.ate - m.de), 0).toFixed(3);
  return { fala: { manter: limpo, palavras, duracao }, tempo, tirados: rs.reduce((s, r) => s + (r.ate - r.de), 0) };
}

export type FalaConferida = {
  fala: FalaDoCorte;
  /** Leva um instante da fala que entrou para a fala conferida. */
  tempo: (t: number) => number;
  /** O que saiu, legível (texto, motivo e quem decidiu). */
  sobras: ConferenciaDaFala["sobras"];
  erro?: string;
};

/**
 * A conferência da fala do corte antes do diretor. `conferir` é a da guarda
 * (JEV e, na dúvida, o Claude: centavos por corte); o teste passa outra.
 * Nunca lança: falhou, a fala segue como veio.
 */
export async function conferirFalaDoCorte(
  fala: FalaDoCorte,
  opcoes: {
    projectId?: string | null;
    /** O que o cliente devolveu no controle do corte: não sai de novo. */
    mantidos?: MantidoPeloUsuario[] | null;
    conferir?: (palavras: Word[], o: { projectId?: string | null; protegido?: Intervalo[] }) => Promise<Pick<ConferenciaDaFala, "remover" | "sobras">>;
  } = {}
): Promise<FalaConferida> {
  const igual: FalaConferida = { fala, tempo: (t) => t, sobras: [] };
  if (!falaConferidaLigada() || fala.palavras.length < 10) return igual;
  try {
    const palavras: Word[] = fala.palavras.map((w) => ({ word: w.texto, start: w.inicio, end: w.fim, confidence: 1 }));
    const protegido = opcoes.mantidos?.length ? janelasMantidasPeloUsuario(palavras, opcoes.mantidos) : [];
    const r = await (opcoes.conferir ?? conferirFala)(palavras, { projectId: opcoes.projectId, protegido });
    if (!r.remover.length) return igual;
    const t = tirarDaFala(fala, r.remover);
    // Trava: a conferência não pode levar mais de um quinto da fala (seria defeito dela, não tropeço).
    if (t.tirados > fala.duracao * 0.2) return { ...igual, erro: `conferência tiraria ${t.tirados.toFixed(1)} s de ${fala.duracao.toFixed(1)} s; a fala segue como veio` };
    return { fala: t.fala, tempo: t.tempo, sobras: r.sobras };
  } catch (e) {
    return { ...igual, erro: `conferência da fala falhou: ${e instanceof Error ? e.message.slice(0, 160) : e}` };
  }
}
