import { prisma } from "@/lib/db/prisma";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A FILA DE TRABALHOS: o que demora sai do ciclo da requisição.
 *
 * O problema que ela resolve, medido e não suposto: até 10/09 a campanha
 * inteira rodava dentro da requisição que o cliente disparou. Cada dia com
 * imagem, revisão da Vera e correção leva perto de 2,5 minutos, então o teto
 * de 800 s da plataforma cabia cinco dias e o sexto ficava de fora com o log
 * dizendo "concluído parcialmente". O teto da plataforma estava decidindo
 * quantos dias o produto entrega, que é uma decisão de produto tomada por
 * ninguém. Subir o teto só empurra o mesmo problema para o dia seguinte.
 *
 * Três regras sustentam o desenho:
 *
 * 1. **A unidade é o dia, não a campanha.** O dia já era a unidade de falha
 *    desde 09/09 (o que falha sozinho tem que poder ser retomado sozinho);
 *    agora é também a unidade de tempo. Cada dia tem os seus 800 s.
 * 2. **Dentro de um grupo, um de cada vez e em ordem.** A pesquisa do Roberto
 *    é a ordem 0 e os dias vêm depois, então nenhum dia começa antes de a
 *    pesquisa existir, e dois dias da mesma semana nunca escrevem ao mesmo
 *    tempo (é a mesma pesquisa e a mesma memória de não repetir ângulo).
 *    Grupos DIFERENTES rodam em paralelo, que é o que faltava quando dois
 *    clientes geravam ao mesmo tempo.
 * 3. **Todo trabalho tem prazo.** Quem lê declara morto o que passou dele. É a
 *    única forma de perceber uma função derrubada pela plataforma: ela não
 *    consegue gravar o próprio erro. A lição é a mesma da máquina de estados
 *    do vídeo, e o custo de não a ter foi falha silenciosa por construção.
 *
 * Este módulo é do SERVIDOR (puxa o Prisma). A tela não importa daqui.
 */

export type TipoDeTrabalho = "campanha-pesquisa" | "campanha-dia";

/** pendente e o único estado que a fila pega; rodando é o único que expira. */
export type StatusDoTrabalho =
  | "pendente"
  | "rodando"
  | "concluido"
  | "falhou"
  | "cancelado";

/**
 * Prazo de cada tipo, em segundos: o teto da função mais folga.
 *
 * Se a plataforma matou aos 800 s, aos 830 já é certeza de que não volta mais.
 * Prazo curto demais ressuscita trabalho que ainda está vivo e o faz rodar
 * duas vezes; prazo longo demais deixa o cliente esperando um morto.
 */
export const PRAZO_SEGUNDOS: Record<TipoDeTrabalho, number> = {
  "campanha-pesquisa": 830,
  "campanha-dia": 830,
};

/**
 * Quantas tentativas antes de desistir.
 *
 * Três é o mesmo número do vídeo, e existe para a fila não repetir para sempre
 * um trabalho que falha sozinho: erro de programação não melhora na quarta
 * tentativa, só queima crédito da API.
 */
export const MAX_TENTATIVAS = 3;

export type PedidoDeTrabalho = {
  tipo: TipoDeTrabalho;
  grupo: string;
  ordem: number;
  userId: string;
  projectId?: string | null;
  payload?: Record<string, unknown>;
};

/** Põe trabalhos na fila. Um pedido só, uma transação: ou entram todos, ou nenhum. */
export async function enfileirar(pedidos: PedidoDeTrabalho[]): Promise<number> {
  if (pedidos.length === 0) return 0;
  const { count } = await prisma.trabalho.createMany({
    data: pedidos.map((p) => ({
      tipo: p.tipo,
      grupo: p.grupo,
      ordem: p.ordem,
      userId: p.userId,
      projectId: p.projectId ?? null,
      payload: (p.payload ?? {}) as object,
    })),
  });
  return count;
}

export type TrabalhoReservado = {
  id: string;
  tipo: TipoDeTrabalho;
  grupo: string;
  ordem: number;
  attempts: number;
  userId: string;
  projectId: string | null;
  payload: Record<string, unknown>;
};

/**
 * Pega o próximo trabalho e o marca como rodando, num passo que duas execuções
 * simultâneas não conseguem ganhar as duas.
 *
 * A reserva é o `updateMany` com o status no FILTRO, o mesmo padrão do cron de
 * publicação: quem escreve primeiro muda a linha, e o segundo recebe count 0 e
 * segue para outro trabalho. Ler e depois escrever não bastaria, porque a
 * corrida passa exatamente por baixo do intervalo entre as duas coisas.
 *
 * O candidato é o pendente de menor ordem cujo GRUPO não tem ninguém rodando.
 * Sem essa condição, os sete dias da semana sairiam todos ao mesmo tempo, cada
 * um sem saber o que o outro escreveu.
 */
export async function reservarProximo(): Promise<TrabalhoReservado | null> {
  // Até 20 candidatos por rodada: o suficiente para atravessar uma fila cheia
  // de grupos ocupados sem varrer a tabela inteira.
  const candidatos = await prisma.trabalho.findMany({
    where: { status: "pendente" },
    orderBy: [{ ordem: "asc" }, { createdAt: "asc" }],
    take: 20,
    select: {
      id: true,
      tipo: true,
      grupo: true,
      ordem: true,
      attempts: true,
      userId: true,
      projectId: true,
      payload: true,
    },
  });

  for (const c of candidatos) {
    // Um de cada vez por grupo. A pergunta é feita agora, e não no filtro de
    // cima, porque ela depende de OUTRA linha do mesmo grupo.
    const ocupado = await prisma.trabalho.count({
      where: { grupo: c.grupo, status: "rodando" },
    });
    if (ocupado > 0) continue;

    // Nenhum trabalho de ordem menor pode estar pendente à frente deste: a
    // pesquisa do Roberto (ordem 0) tem que terminar antes do primeiro dia.
    const anteriorPendente = await prisma.trabalho.count({
      where: { grupo: c.grupo, status: "pendente", ordem: { lt: c.ordem } },
    });
    if (anteriorPendente > 0) continue;

    const { count } = await prisma.trabalho.updateMany({
      where: { id: c.id, status: "pendente" },
      data: {
        status: "rodando",
        startedAt: new Date(),
        attempts: { increment: 1 },
        error: null,
      },
    });
    if (count === 1) {
      return {
        id: c.id,
        tipo: c.tipo as TipoDeTrabalho,
        grupo: c.grupo,
        ordem: c.ordem,
        attempts: c.attempts + 1,
        userId: c.userId,
        projectId: c.projectId,
        payload: (c.payload ?? {}) as Record<string, unknown>,
      };
    }
  }

  return null;
}

export async function concluir(id: string): Promise<void> {
  await prisma.trabalho.updateMany({
    where: { id, status: "rodando" },
    data: { status: "concluido", finishedAt: new Date(), error: null },
  });
}

/**
 * Marca a falha. Volta para a fila enquanto houver tentativa; depois disso
 * fica em falhou, com o motivo escrito.
 */
export async function falhar(id: string, motivo: string): Promise<void> {
  const t = await prisma.trabalho.findUnique({
    where: { id },
    select: { attempts: true },
  });
  const acabaram = (t?.attempts ?? MAX_TENTATIVAS) >= MAX_TENTATIVAS;
  await prisma.trabalho.updateMany({
    where: { id, status: "rodando" },
    data: {
      status: acabaram ? "falhou" : "pendente",
      error: motivo.slice(0, 2000),
      finishedAt: acabaram ? new Date() : null,
      startedAt: null,
    },
  });
}

/**
 * Declara mortos os trabalhos que passaram do prazo e devolve quantos voltaram
 * para a fila.
 *
 * Este é o único mecanismo que enxerga uma função derrubada no teto de tempo,
 * porque nesse desfecho o `catch` nunca roda e o código não grava o próprio
 * erro. Sem isto, um trabalho morto fica "rodando" para sempre e trava o grupo
 * inteiro, já que o grupo só deixa um rodar por vez.
 */
export async function ressuscitarMortos(agora = new Date()): Promise<number> {
  const rodando = await prisma.trabalho.findMany({
    where: { status: "rodando" },
    select: { id: true, tipo: true, startedAt: true, attempts: true },
  });
  let devolvidos = 0;
  for (const t of rodando) {
    const prazo = PRAZO_SEGUNDOS[t.tipo as TipoDeTrabalho] ?? 830;
    // Sem `startedAt` num estado de trabalho: linha de antes desta coluna ter
    // valor, ou reserva que morreu no meio. Tratar como morto é o certo,
    // porque ninguém vai movê-la.
    const decorrido = t.startedAt
      ? (agora.getTime() - t.startedAt.getTime()) / 1000
      : Infinity;
    if (decorrido <= prazo) continue;

    const acabaram = t.attempts >= MAX_TENTATIVAS;
    const { count } = await prisma.trabalho.updateMany({
      where: { id: t.id, status: "rodando" },
      data: {
        status: acabaram ? "falhou" : "pendente",
        startedAt: null,
        finishedAt: acabaram ? new Date() : null,
        error: acabaram
          ? "O trabalho passou do prazo em todas as tentativas."
          : "O trabalho passou do prazo e voltou para a fila.",
      },
    });
    if (count === 1 && !acabaram) devolvidos++;
  }
  return devolvidos;
}

/** Cancela o que ainda não rodou de um grupo. O que já está rodando termina. */
export async function cancelarGrupo(grupo: string): Promise<number> {
  const { count } = await prisma.trabalho.updateMany({
    where: { grupo, status: "pendente" },
    data: { status: "cancelado", finishedAt: new Date() },
  });
  return count;
}

/** Como anda um grupo, para a tela e para quem fecha a campanha. */
export async function estadoDoGrupo(grupo: string): Promise<{
  pendentes: number;
  rodando: number;
  concluidos: number;
  falhados: number;
  acabou: boolean;
}> {
  const linhas = await prisma.trabalho.groupBy({
    by: ["status"],
    where: { grupo },
    _count: { _all: true },
  });
  const de = (s: string) =>
    linhas.find((l) => l.status === s)?._count._all ?? 0;
  const pendentes = de("pendente");
  const rodando = de("rodando");
  return {
    pendentes,
    rodando,
    concluidos: de("concluido"),
    falhados: de("falhou"),
    acabou: pendentes === 0 && rodando === 0,
  };
}

/**
 * A assinatura que autoriza uma chamada de máquina à fila.
 *
 * `PILOTO_SECRET` primeiro, pelo mesmo motivo do piloto do vídeo: assinar
 * sessão de gente e assinar chamada de máquina são finalidades diferentes, e
 * o segredo de auth em produção está marcado como sensível na Vercel, então
 * ele não sai de lá nem para o dono da conta. Com segredo próprio a fila é
 * testável pela linha de comando sem ninguém precisar ler o que protege o
 * login de todo mundo.
 */
export function assinarFila(): string {
  const segredo =
    process.env.PILOTO_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "demandou";
  return createHmac("sha256", segredo).update("fila").digest("hex");
}

export function assinaturaDaFilaValida(assinatura: string | null): boolean {
  if (!assinatura) return false;
  const esperada = assinarFila();
  if (assinatura.length !== esperada.length) return false;
  return timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada));
}

/**
 * Acorda a fila agora, sem esperar o cron.
 *
 * O cron de um minuto é a rede de segurança, não o relógio do produto: quem
 * acabou de pedir uma campanha não deve esperar até 60 s para o primeiro dia
 * começar. Esta chamada é disparada e esquecida de propósito, porque quem
 * cutuca não tem nada a fazer com a resposta e não pode ficar preso a ela.
 */
export function cutucar(): void {
  // A mesma base do piloto do vídeo, e não uma parecida.
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const url = `${base}/api/cron/fila?sig=${assinarFila()}`;
  void fetch(url, { method: "POST" }).catch((e) => {
    // Falhar aqui não perde trabalho nenhum: ele está no banco, e o cron pega
    // no próximo minuto. Por isso é aviso, e não erro.
    console.warn("[fila] não consegui cutucar a fila:", e);
  });
}
