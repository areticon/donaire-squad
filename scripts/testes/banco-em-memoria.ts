// Um banco EM MEMÓRIA com a forma do Prisma que lib/credits, lib/equipe/conta e
// lib/admin/conceder-creditos usam (06/10/2026). Nada aqui toca o banco real.
//
// As transações rodam UMA DE CADA VEZ (fila), que é o que a trava de conselho
// do Postgres garante para a mesma chave: assim o teste de "dois pedidos
// juntos" prova a regra de idempotência, e não a sorte da ordem.

type Linha = Record<string, unknown>;

function casa(linha: Linha, where: Linha | undefined): boolean {
  if (!where) return true;
  for (const [k, cond] of Object.entries(where)) {
    const v = linha[k];
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ("path" in c) {
        let atual: unknown = v;
        for (const p of c.path as string[]) atual = (atual as Record<string, unknown> | null | undefined)?.[p];
        if (atual !== c.equals) return false;
        continue;
      }
      if ("gt" in c && !((v as number) > (c.gt as number))) return false;
      if ("gte" in c && !((v as number) >= (c.gte as number))) return false;
      if ("lt" in c && !((v as number) < (c.lt as number))) return false;
      continue;
    }
    if (v !== cond) return false;
  }
  return true;
}

function escolher(linha: Linha | undefined, select?: Record<string, boolean>): Linha | null {
  if (!linha) return null;
  if (!select) return { ...linha };
  return Object.fromEntries(Object.keys(select).map((k) => [k, linha[k]]));
}

function tabela(linhas: Linha[], prefixo: string) {
  let seq = 0;
  return {
    linhas,
    async findFirst(a: { where?: Linha; select?: Record<string, boolean> } = {}) {
      return escolher(linhas.find((l) => casa(l, a.where)), a.select);
    },
    async findUnique(a: { where: Linha; select?: Record<string, boolean> }) {
      return escolher(linhas.find((l) => casa(l, a.where)), a.select);
    },
    async findUniqueOrThrow(a: { where: Linha; select?: Record<string, boolean> }) {
      const l = linhas.find((x) => casa(x, a.where));
      if (!l) throw new Error(`${prefixo}: não encontrado`);
      return escolher(l, a.select);
    },
    async findMany(a: { where?: Linha } = {}) {
      return linhas.filter((l) => casa(l, a.where)).map((l) => ({ ...l }));
    },
    async create(a: { data: Linha; select?: Record<string, boolean> }) {
      const l = { id: `${prefixo}${++seq}`, createdAt: new Date(), ...a.data };
      linhas.push(l);
      return escolher(l, a.select);
    },
    async update(a: { where: Linha; data: Linha; select?: Record<string, boolean> }) {
      const l = linhas.find((x) => casa(x, a.where));
      if (!l) throw new Error(`${prefixo}: não encontrado para atualizar`);
      aplicar(l, a.data);
      return escolher(l, a.select);
    },
    async updateMany(a: { where: Linha; data: Linha }) {
      const alvo = linhas.filter((x) => casa(x, a.where));
      for (const l of alvo) aplicar(l, a.data);
      return { count: alvo.length };
    },
  };
}

function aplicar(l: Linha, data: Linha) {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const o = v as Record<string, number>;
      if ("increment" in o) l[k] = (l[k] as number) + o.increment;
      else if ("decrement" in o) l[k] = (l[k] as number) - o.decrement;
      else l[k] = v;
    } else l[k] = v;
  }
}

export function bancoEmMemoria(inicio: { users: Linha[]; membros?: Linha[] }) {
  const user = tabela(inicio.users.map((u) => ({ role: "user", plan: "free", creditsBalance: 0, videoCredits: 0, creditsResetAt: null, name: null, ...u })), "u");
  const creditTransaction = tabela([], "tx");
  const membroDaEquipe = tabela(inicio.membros ?? [], "m");
  const acaoDeAdmin = tabela([], "a");
  let fila: Promise<unknown> = Promise.resolve();
  const db = {
    user,
    creditTransaction,
    membroDaEquipe,
    acaoDeAdmin,
    // A trava de conselho: aqui não faz nada, porque a fila já serializa.
    async $queryRaw() {
      return [];
    },
    async $transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
      const vez = fila.then(() => fn(db));
      fila = vez.catch(() => undefined);
      return vez;
    },
  };
  return db;
}
