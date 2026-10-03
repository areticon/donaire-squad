import { prisma } from "@/lib/db/prisma";
import { janelasValidas } from "@/lib/agenda/janelas";
import { ocupadoDoEndereco, type Intervalo } from "@/lib/agenda/ical-ocupado";
import { ocupadoNoGoogle, googleAgendaConfigurado } from "@/lib/agenda/google";
import { decifrar } from "@/lib/agenda/segredos";
import { DURACAO_MIN, dataEmSP, diaDaSemana, instanteEmSP, minutosDe, proximosDiasUteis, hhmmDe, rotuloDoDia } from "@/lib/agenda/tempo";

/**
 * OS HORÁRIOS LIVRES DO TIME (01/10).
 *
 * Para cada pessoa ativa: a grade de 30 minutos dentro das janelas semanais,
 * nos próximos 10 dias úteis, menos a antecedência mínima, menos o ocupado
 * (reuniões já marcadas no banco, agendas Google conectadas e endereço iCal),
 * com o intervalo entre reuniões como folga dos dois lados.
 *
 * QUANDO UMA FONTE DE FORA FALHA, A PESSOA SOME DA AGENDA naquele pedido, e o
 * erro fica gravado na conta para o /admin mostrar. Mostrar como livre quem
 * não conseguimos ler é marcar reunião por cima de compromisso.
 */

export type PessoaComContas = Awaited<ReturnType<typeof pessoasAtivas>>[number];

export async function pessoasAtivas() {
  return prisma.pessoaDoTime.findMany({
    where: { ativo: true },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    include: { contasGoogle: true },
  });
}

function sobrepoe(a: Intervalo, b: Intervalo): boolean {
  return a.inicio < b.fim && b.inicio < a.fim;
}

/**
 * Tudo em que a pessoa está ocupada entre `de` e `ate`. `ignorar` é a reunião
 * que está sendo remarcada: o horário antigo dela não pode bloquear o novo.
 */
export async function ocupadoDaPessoa(
  p: PessoaComContas,
  de: Date,
  ate: Date,
  ignorar?: string | null
): Promise<{ ok: true; intervalos: Intervalo[] } | { ok: false; erro: string }> {
  const intervalos: Intervalo[] = [];
  const doBanco = await prisma.reuniaoDeDemonstracao.findMany({
    where: { pessoaId: p.id, status: "marcada", inicio: { lt: ate }, fim: { gt: de }, ...(ignorar ? { id: { not: ignorar } } : {}) },
    select: { inicio: true, fim: true },
  });
  intervalos.push(...doBanco);

  try {
    if (p.fonte === "google") {
      if (!googleAgendaConfigurado()) throw new Error("Fonte google sem GOOGLE_AGENDA_CLIENT_ID neste ambiente.");
      if (!p.contasGoogle.length) throw new Error("Fonte google sem conta conectada.");
      for (const c of p.contasGoogle) {
        const agendas = Array.isArray(c.agendas) ? (c.agendas as unknown[]).filter((x): x is string => typeof x === "string") : [];
        try {
          // Evento da própria demonstração já está no banco; o freeBusy também
          // o devolve, e somar duas vezes o mesmo intervalo não muda nada.
          intervalos.push(...(await ocupadoNoGoogle(c.refreshTokenCifrado, agendas.length ? agendas : ["primary"], de, ate)));
          if (c.ultimoErro) await prisma.contaGoogleDoTime.update({ where: { id: c.id }, data: { ultimoErro: null, ultimoErroEm: null } });
        } catch (e) {
          const erro = e instanceof Error ? e.message : String(e);
          await prisma.contaGoogleDoTime.update({ where: { id: c.id }, data: { ultimoErro: erro.slice(0, 500), ultimoErroEm: new Date() } }).catch(() => {});
          throw e;
        }
      }
    }
    if (p.icalCifrado) intervalos.push(...(await ocupadoDoEndereco(decifrar(p.icalCifrado), de, ate)));
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[agenda] ocupado de ${p.nome} não pôde ser lido: ${erro}`);
    return { ok: false, erro };
  }
  return { ok: true, intervalos };
}

/** A grade de inícios possíveis da pessoa (antes de tirar o ocupado). */
export function gradeDaPessoa(p: Pick<PessoaComContas, "janelas" | "antecedenciaMin">, dias: string[], agora: Date): Date[] {
  const janelas = janelasValidas(p.janelas);
  const minimo = agora.getTime() + p.antecedenciaMin * 60_000;
  const out: Date[] = [];
  for (const d of dias) {
    const semana = diaDaSemana(d);
    for (const j of janelas.filter((x) => x.dia === semana)) {
      // Começa no primeiro meio-hora cheio da janela: "9h10" vira "9h30".
      let m = Math.ceil(minutosDe(j.inicio) / 30) * 30;
      for (; m + DURACAO_MIN <= minutosDe(j.fim); m += 30) {
        const inicio = instanteEmSP(d, hhmmDe(m));
        if (inicio.getTime() >= minimo) out.push(inicio);
      }
    }
  }
  return out;
}

export function livreNoHorario(inicio: Date, ocupado: Intervalo[], intervaloMin: number): boolean {
  const folga = intervaloMin * 60_000;
  const alvo = { inicio: new Date(inicio.getTime() - folga), fim: new Date(inicio.getTime() + DURACAO_MIN * 60_000 + folga) };
  return !ocupado.some((o) => sobrepoe(alvo, o));
}

export type DiaDaAgenda = { data: string; rotulo: string; horarios: Array<{ inicio: string; pessoas: string[] }> };

/**
 * Os horários livres de uma pessoa (ou do time inteiro), agrupados por dia.
 * Cada horário diz QUEM está livre nele: a marcação escolhe entre esses.
 */
export async function horariosLivres(opcoes: { pessoaId?: string | null; ignorar?: string | null; agora?: Date } = {}): Promise<{
  dias: DiaDaAgenda[];
  pessoas: Array<{ id: string; nome: string }>;
  indisponiveis: string[];
}> {
  const agora = opcoes.agora ?? new Date();
  const todas = await pessoasAtivas();
  const alvo = opcoes.pessoaId ? todas.filter((p) => p.id === opcoes.pessoaId) : todas;
  const dias = proximosDiasUteis(agora);
  const de = instanteEmSP(dias[0], "00:00");
  const ate = instanteEmSP(dias[dias.length - 1], "23:59");

  const porInicio = new Map<number, string[]>();
  const indisponiveis: string[] = [];
  await Promise.all(
    alvo.map(async (p) => {
      const ocupado = await ocupadoDaPessoa(p, de, ate, opcoes.ignorar);
      if (!ocupado.ok) {
        indisponiveis.push(p.nome);
        return;
      }
      for (const inicio of gradeDaPessoa(p, dias, agora)) {
        if (!livreNoHorario(inicio, ocupado.intervalos, p.intervaloMin)) continue;
        const lista = porInicio.get(inicio.getTime()) ?? [];
        lista.push(p.id);
        porInicio.set(inicio.getTime(), lista);
      }
    })
  );

  const porDia = new Map<string, DiaDaAgenda>(dias.map((d) => [d, { data: d, rotulo: rotuloDoDia(d), horarios: [] }]));
  for (const t of [...porInicio.keys()].sort((a, b) => a - b)) {
    const inicio = new Date(t);
    porDia.get(dataEmSP(inicio))?.horarios.push({ inicio: inicio.toISOString(), pessoas: porInicio.get(t)! });
  }
  return {
    dias: [...porDia.values()],
    // Só o primeiro nome vai para a tela pública: o lead escolhe "com quem",
    // não precisa do sobrenome nem do e-mail de ninguém.
    pessoas: todas.map((p) => ({ id: p.id, nome: p.nome.split(/\s+/)[0] })),
    indisponiveis,
  };
}
