import { prisma } from "@/lib/db/prisma";
import { CHAVES_DO_SINO_COM_FAIXA, PREFIXOS_COM_FIM, PREFIXOS_DA_SEMENTE, PREFIXOS_SEM_FIM } from "@/lib/avisos/chaves";

/**
 * O DESCARTE DOS AVISOS, NO SERVIDOR (07/10/2026).
 *
 * O pedido do Bruno: "toda notificação precisa ter a opção de descartar". A
 * tabela `avisos_descartados` guarda UMA linha por pessoa e por ocorrência de
 * um fato (a chave de lib/avisos/chaves.ts). O que mora aqui:
 *
 * - perguntar quais chaves de uma lista já foram descartadas (a página do
 *   Gestor e a consulta da faixa dos vídeos);
 * - a SEMENTE do cliente: as chaves das telas que a pessoa descartou, para a
 *   tela nascer sem o aviso (sem piscar) em qualquer página;
 * - descartar e desfazer, e o descarte pelo sino (por id da notificação).
 *
 * ## A LINHA DO SINO NUNCA É APAGADA
 *
 * A chave única de notificacoes é a trava do e-mail (lib/notificacoes): apagar
 * a linha deixaria o mesmo fato avisar de novo. Descartar grava a linha aqui
 * (pela tela, marca também a notificação do mesmo fato como lida); o sino
 * filtra pelo NOT EXISTS.
 *
 * ## A TABELA PODE AINDA NÃO EXISTIR
 *
 * A migração entra pelo build (scripts/build.mjs). Até ela chegar, toda
 * leitura vira "nada descartado" e a tela desenha como antes; toda escrita
 * devolve `lembrado: false` e não lança, e a tela esconde só nesta visita, com
 * o aviso honesto. Nenhuma função daqui lança.
 *
 * Toda função recebe `dep` opcional (como lib/notificacoes/aviso-aos-admins.ts):
 * os testes trocam o banco por um depósito em memória.
 */

/** Quantas chaves uma consulta pergunta de uma vez (o IN). */
export const TETO_POR_CONSULTA = 500;
/** Quantas chaves com fim natural a semente leva para o cliente (as mais recentes). */
export const TETO_DA_SEMENTE = 2000;
/** A cota da semente para os avisos sem fim natural (dicas, cores de fábrica), à parte das recentes. */
export const COTA_DOS_SEM_FIM = 500;
/**
 * Quantas linhas DAS TELAS uma pessoa pode ter. As chaves só do sino não
 * contam: elas entram pelo id de uma notificação que existe (o sino e o
 * "Limpar as lidas"), e a rota das telas não as aceita, então não há sufixo
 * inventado que encha a tabela por ali.
 */
export const TETO_POR_PESSOA = 5000;
/** Quantas saem de uma vez quando a pessoa chega ao teto: folga para o teto não pesar a cada descarte. */
export const FOLGA_DO_TETO = 100;
/** Quantas notificações lidas o "Limpar as lidas" descarta de uma vez. */
export const TETO_DAS_LIDAS = 500;

export type DepositoDosDescartes = {
  /** As chaves desta lista que a pessoa já descartou. */
  descartadas(userId: string, chaves: string[]): Promise<string[]>;
  /** As chaves da pessoa que começam por algum destes prefixos, mais recentes primeiro. */
  comPrefixo(userId: string, prefixos: readonly string[], limite: number): Promise<string[]>;
  /** Quantas linhas da pessoa começam por algum destes prefixos. */
  quantas(userId: string, prefixos: readonly string[]): Promise<number>;
  /** Apaga as `quantas` linhas MAIS ANTIGAS da pessoa entre estes prefixos. Devolve quantas saíram. */
  apagarMaisAntigas(userId: string, quantas: number, prefixos: readonly string[]): Promise<number>;
  /** Grava (ON CONFLICT DO NOTHING). Devolve quantas linhas novas. */
  gravar(userId: string, chaves: string[]): Promise<number>;
  /** Marca como lidas as notificações da pessoa com estas chaves (só as ainda não lidas). */
  marcarLidas(userId: string, chaves: string[]): Promise<number>;
  /** Apaga os descartes (desfazer). Nunca mexe em notificacoes. */
  apagar(userId: string, chaves: string[]): Promise<number>;
  /** As chaves das notificações com estes ids, SÓ das linhas da própria pessoa. */
  chavesDasNotificacoes(userId: string, ids: string[]): Promise<string[]>;
  /**
   * Descarta as `limite` notificações lidas mais recentes da pessoa, MENOS as
   * que têm faixa na tela (CHAVES_DO_SINO_COM_FAIXA). Devolve quantas linhas novas.
   */
  gravarLidas(userId: string, limite: number): Promise<number>;
};

const algumPrefixo = (prefixos: readonly string[]) => prefixos.map((p) => ({ chave: { startsWith: p } }));

function depositoPadrao(): DepositoDosDescartes {
  return {
    async descartadas(userId, chaves) {
      const linhas = await prisma.avisoDescartado.findMany({ where: { userId, chave: { in: chaves } }, select: { chave: true } });
      return linhas.map((l) => l.chave);
    },
    async comPrefixo(userId, prefixos, limite) {
      const linhas = await prisma.avisoDescartado.findMany({
        where: { userId, OR: algumPrefixo(prefixos) },
        orderBy: { descartadoEm: "desc" },
        take: limite,
        select: { chave: true },
      });
      return linhas.map((l) => l.chave);
    },
    quantas: (userId, prefixos) => prisma.avisoDescartado.count({ where: { userId, OR: algumPrefixo(prefixos) } }),
    async apagarMaisAntigas(userId, quantas, prefixos) {
      if (quantas <= 0) return 0;
      const velhas = await prisma.avisoDescartado.findMany({
        where: { userId, OR: algumPrefixo(prefixos) },
        orderBy: { descartadoEm: "asc" },
        take: quantas,
        select: { id: true },
      });
      if (!velhas.length) return 0;
      const r = await prisma.avisoDescartado.deleteMany({ where: { userId, id: { in: velhas.map((v) => v.id) } } });
      return r.count;
    },
    async gravar(userId, chaves) {
      const r = await prisma.avisoDescartado.createMany({ data: chaves.map((chave) => ({ userId, chave })), skipDuplicates: true });
      return r.count;
    },
    async marcarLidas(userId, chaves) {
      const r = await prisma.notificacao.updateMany({ where: { userId, chave: { in: chaves }, lidaEm: null }, data: { lidaEm: new Date() } });
      return r.count;
    },
    async apagar(userId, chaves) {
      const r = await prisma.avisoDescartado.deleteMany({ where: { userId, chave: { in: chaves } } });
      return r.count;
    },
    async chavesDasNotificacoes(userId, ids) {
      const linhas = await prisma.notificacao.findMany({ where: { userId, id: { in: ids } }, select: { chave: true } });
      return linhas.map((l) => l.chave);
    },
    async gravarLidas(userId, limite) {
      // UMA instrução, sem ler as lidas na memória: as mais recentes, com o id
      // gerado pelo Postgres (a PK é TEXT e aceita o uuid ao lado do cuid).
      // As duas chaves que também são faixa na tela (a montagem e a campanha
      // que falharam) ficam de fora: limpar o sino não some com a faixa do
      // Gestor que a pessoa não descartou. O teste confere que são só duas.
      const [faixa1, faixa2] = CHAVES_DO_SINO_COM_FAIXA;
      return prisma.$executeRaw`
        INSERT INTO "avisos_descartados" ("id", "userId", "chave", "descartadoEm")
        SELECT gen_random_uuid()::text, n."userId", n."chave", CURRENT_TIMESTAMP
        FROM (
          SELECT "userId", "chave" FROM "notificacoes"
          WHERE "userId" = ${userId} AND "lidaEm" IS NOT NULL
            AND "chave" NOT LIKE ${`${faixa1}%`} AND "chave" NOT LIKE ${`${faixa2}%`}
          ORDER BY "createdAt" DESC
          LIMIT ${limite}
        ) n
        ON CONFLICT ("userId", "chave") DO NOTHING`;
    },
  };
}

/**
 * A TABELA (OU A COLUNA) AINDA NÃO EXISTE? Percorre o erro e as causas até 5
 * níveis: no Prisma 7 com @prisma/adapter-pg o $queryRaw falha como P2010, com
 * o código do Postgres dentro de `meta.driverAdapterError.cause`, e não em
 * `meta.code`. Procura P2021/P2022, 42P01/42703, TableDoesNotExist e
 * ColumnNotFound, e a frase do Postgres.
 */
export function faltaATabela(e: unknown): boolean {
  const vistos = new Set<unknown>();
  const fila: Array<{ v: unknown; nivel: number }> = [{ v: e, nivel: 0 }];
  while (fila.length) {
    const { v, nivel } = fila.shift()!;
    if (!v || typeof v !== "object" || vistos.has(v) || nivel > 5) continue;
    vistos.add(v);
    const o = v as Record<string, unknown>;
    const code = typeof o.code === "string" ? o.code : null;
    const originalCode = typeof o.originalCode === "string" ? o.originalCode : null;
    const kind = typeof o.kind === "string" ? o.kind : null;
    const mensagem = typeof o.message === "string" ? o.message : typeof o.originalMessage === "string" ? o.originalMessage : "";
    if (code === "P2021" || code === "P2022") return true;
    if (code === "42P01" || code === "42703" || originalCode === "42P01" || originalCode === "42703") return true;
    if (kind === "TableDoesNotExist" || kind === "ColumnNotFound") return true;
    if (/(relation|column) .* does not exist/i.test(mensagem)) return true;
    for (const k of ["cause", "meta", "driverAdapterError"]) if (o[k]) fila.push({ v: o[k], nivel: nivel + 1 });
  }
  return false;
}

let jaAvisouDaTabela = false;

/** O registro da leitura que falhou: tabela ausente avisa uma vez por processo; o resto é erro. */
export function registrarFalhaDosDescartes(onde: string, e: unknown): void {
  if (faltaATabela(e)) {
    if (!jaAvisouDaTabela) {
      jaAvisouDaTabela = true;
      console.warn(`[avisos] a tabela avisos_descartados ainda não existe (${onde}); a tela segue sem os descartes até a migração.`);
    }
    return;
  }
  console.error(`[avisos] ${onde} falhou:`, e instanceof Error ? e.message : e);
}

const unicas = (chaves: readonly string[]) => [...new Set(chaves.filter((c) => typeof c === "string" && c.length > 0))];

/** Quais destas chaves a pessoa descartou. Nunca lança: erro vira conjunto vazio. */
export async function descartadasEntre(userId: string, chaves: readonly string[], dep: DepositoDosDescartes = depositoPadrao()): Promise<Set<string>> {
  const lista = unicas(chaves);
  if (!userId || !lista.length) return new Set();
  try {
    const saida = new Set<string>();
    for (let i = 0; i < lista.length; i += TETO_POR_CONSULTA) {
      for (const c of await dep.descartadas(userId, lista.slice(i, i + TETO_POR_CONSULTA))) saida.add(c);
    }
    return saida;
  } catch (e) {
    registrarFalhaDosDescartes("descartadasEntre", e);
    return new Set();
  }
}

/**
 * A SEMENTE DO CLIENTE: as chaves das telas que a pessoa descartou, sem corte
 * de data. Duas leituras: os avisos SEM FIM NATURAL (dicas, cores de fábrica)
 * têm cota própria, para nunca saírem da semente empurrados pelos recentes (o
 * aviso descartado há meses voltaria); os outros vão os mais recentes
 * primeiro, até 2000. As chaves só do sino ficam de fora: o servidor já as
 * filtra na lista do sino.
 */
export async function sementeDoCliente(userId: string, dep: DepositoDosDescartes = depositoPadrao()): Promise<string[]> {
  if (!userId) return [];
  try {
    const [semFim, recentes] = await Promise.all([dep.comPrefixo(userId, PREFIXOS_SEM_FIM, COTA_DOS_SEM_FIM), dep.comPrefixo(userId, PREFIXOS_COM_FIM, TETO_DA_SEMENTE)]);
    return [...new Set([...semFim, ...recentes])];
  } catch (e) {
    registrarFalhaDosDescartes("sementeDoCliente", e);
    return [];
  }
}

const daTela = (c: string) => PREFIXOS_DA_SEMENTE.some((p) => c.startsWith(p));

/**
 * Descarta, para ESTA pessoa (nunca para o dono do projeto: o membro que
 * descarta não some com o aviso do dono). Idempotente. Marca como lidas as
 * notificações do sino com as mesmas chaves, só quando ainda não lidas (o
 * descarte pelo próprio sino passa `marcarLidas: false`: o NOT EXISTS já tira
 * o item da lista e da contagem, e o Desfazer devolve o item como estava).
 *
 * O TETO: as chaves das telas contam até 5000 por pessoa. No teto, as mais
 * antigas COM FIM NATURAL saem primeiro (com folga), e o descarte novo cabe;
 * dica e aviso sem fim nunca saem. `lembrado: false` só quando não gravou
 * (tabela ausente, teto só de avisos sem fim, erro): a tela esconde só nesta visita.
 */
export async function descartar(
  userId: string,
  chaves: readonly string[],
  dep: DepositoDosDescartes = depositoPadrao(),
  opcoes: { marcarLidas?: boolean } = {}
): Promise<{ lembrado: boolean }> {
  const lista = unicas(chaves);
  if (!userId) return { lembrado: false };
  if (!lista.length) return { lembrado: true };
  let lembrado = false;
  try {
    const contam = lista.filter(daTela).length;
    let cabe = true;
    if (contam) {
      let ocupadas = await dep.quantas(userId, PREFIXOS_DA_SEMENTE);
      const excesso = ocupadas + contam - TETO_POR_PESSOA;
      if (excesso > 0) ocupadas -= await dep.apagarMaisAntigas(userId, excesso + FOLGA_DO_TETO, PREFIXOS_COM_FIM);
      cabe = ocupadas + contam <= TETO_POR_PESSOA;
    }
    if (!cabe) {
      console.warn(`[avisos] ${userId} chegou ao teto de ${TETO_POR_PESSOA} descartes sem fim natural; o novo vale só na tela.`);
    } else {
      await dep.gravar(userId, lista);
      lembrado = true;
    }
  } catch (e) {
    registrarFalhaDosDescartes("descartar", e);
  }
  // O sino do mesmo fato sai do contador mesmo sem a tabela: marcar como lida
  // não apaga nada e não depende dela.
  if (opcoes.marcarLidas !== false) {
    try {
      await dep.marcarLidas(userId, lista);
    } catch (e) {
      console.error("[avisos] marcar lidas no descarte falhou:", e instanceof Error ? e.message : e);
    }
  }
  return { lembrado };
}

/** Desfaz o descarte. Não mexe em lidaEm: o que foi lido continua lido. */
export async function desfazerDescarte(userId: string, chaves: readonly string[], dep: DepositoDosDescartes = depositoPadrao()): Promise<{ lembrado: boolean }> {
  const lista = unicas(chaves);
  if (!userId) return { lembrado: false };
  if (!lista.length) return { lembrado: true };
  try {
    await dep.apagar(userId, lista);
    return { lembrado: true };
  } catch (e) {
    registrarFalhaDosDescartes("desfazerDescarte", e);
    return { lembrado: false };
  }
}

/**
 * O descarte pelo sino: lê as chaves SÓ das linhas da própria pessoa e
 * descarta, sem marcar como lida (o Desfazer devolve a não lida não lida).
 */
export async function descartarNotificacoes(
  userId: string,
  ids: readonly string[],
  dep: DepositoDosDescartes = depositoPadrao()
): Promise<{ chaves: string[]; lembrado: boolean }> {
  const lista = unicas(ids);
  if (!userId || !lista.length) return { chaves: [], lembrado: true };
  let chaves: string[] = [];
  try {
    chaves = await dep.chavesDasNotificacoes(userId, lista.slice(0, TETO_POR_CONSULTA));
  } catch (e) {
    console.error("[avisos] leitura das notificações para descartar falhou:", e instanceof Error ? e.message : e);
    return { chaves: [], lembrado: false };
  }
  if (!chaves.length) return { chaves: [], lembrado: true };
  const r = await descartar(userId, chaves, dep, { marcarLidas: false });
  return { chaves, lembrado: r.lembrado };
}

/**
 * O desfazer do sino: pelo id, só nas linhas da própria pessoa. `lembrado:
 * false` quando o servidor não desfez (a tela avisa que o item pode sumir de
 * novo ao recarregar).
 */
export async function restaurarNotificacoes(userId: string, ids: readonly string[], dep: DepositoDosDescartes = depositoPadrao()): Promise<{ chaves: string[]; lembrado: boolean }> {
  const lista = unicas(ids);
  if (!userId || !lista.length) return { chaves: [], lembrado: true };
  try {
    const chaves = await dep.chavesDasNotificacoes(userId, lista.slice(0, TETO_POR_CONSULTA));
    if (!chaves.length) return { chaves, lembrado: true };
    const r = await desfazerDescarte(userId, chaves, dep);
    return { chaves, lembrado: r.lembrado };
  } catch (e) {
    console.error("[avisos] restaurar notificações falhou:", e instanceof Error ? e.message : e);
    return { chaves: [], lembrado: false };
  }
}

/**
 * "Limpar as lidas" do sino: as 500 lidas mais recentes, numa instrução só,
 * menos as que também são faixa na tela (essas saem só pelo X de cada uma).
 * Sem teto: as chaves só do sino vêm de notificações que existem.
 */
export async function descartarLidas(userId: string, dep: DepositoDosDescartes = depositoPadrao()): Promise<{ quantas: number; lembrado: boolean }> {
  if (!userId) return { quantas: 0, lembrado: false };
  try {
    const quantas = await dep.gravarLidas(userId, TETO_DAS_LIDAS);
    return { quantas, lembrado: true };
  } catch (e) {
    registrarFalhaDosDescartes("descartarLidas", e);
    return { quantas: 0, lembrado: false };
  }
}
