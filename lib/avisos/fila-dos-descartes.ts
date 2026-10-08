/**
 * A FILA E O CONJUNTO DOS DESCARTES NA TELA (07/10/2026), sem React, para o
 * provider (components/ui/descartar.tsx) e para os testes usarem a mesma regra.
 *
 * - FILA POR CHAVE: descartar e desfazer da mesma chave saem em ordem. O
 *   DELETE espera a resposta do POST anterior: sem isto, com o POST lento e o
 *   Desfazer rápido, o DELETE chegava primeiro, o POST gravava por último, e o
 *   aviso desfeito sumia no próximo carregamento.
 * - Um segundo descartar da mesma chave, com o primeiro na fila, é ignorado.
 * - O CONJUNTO: o que a tela esconde é a soma do que o servidor mandou (a
 *   semente e o registrado) e do que a pessoa descartou nesta visita, menos o
 *   que ela desfez nesta visita. O desfeito vence a semente: depois de um
 *   router.refresh, a semente pode ainda trazer a chave (o DELETE na fila), e
 *   o Desfazer não pode ser engolido por ela.
 */

export type Envio = (metodo: "POST" | "DELETE", chaves: string[]) => Promise<boolean>;

export function criarFilaDosDescartes(enviar: Envio) {
  const filas = new Map<string, Promise<unknown>>();
  const ultima = new Map<string, "descartar" | "desfazer">();
  /** O POST mais recente de cada chave lembrou no servidor? Sem registro (a semente), sim. */
  const lembradoDe = new Map<string, Promise<boolean>>();

  function enfileirar<T>(chaves: readonly string[], op: () => Promise<T>): Promise<T> {
    const antes = Promise.all(chaves.map((c) => filas.get(c) ?? Promise.resolve()));
    const agora = antes.then(op, op);
    const segura = agora.catch(() => undefined);
    for (const c of chaves) filas.set(c, segura);
    return agora;
  }

  const aindaE = (lista: readonly string[], op: "descartar" | "desfazer") => lista.some((c) => ultima.get(c) === op);

  return {
    /**
     * Descarta. Devolve as chaves novas (as que não estavam já descartadas na
     * fila), a promessa do POST (true quando o servidor lembrou) e
     * `soNaTela`: true quando o servidor NÃO lembrou e a pessoa ainda não
     * desfez (é quando a tela diz "Descartado só nesta tela"). Null quando
     * não havia nada novo.
     */
    descartar(chaves: readonly string[]): { novas: string[]; lembrado: Promise<boolean>; soNaTela: Promise<boolean> } | null {
      const novas = [...new Set(chaves.filter((c) => c && ultima.get(c) !== "descartar"))];
      if (!novas.length) return null;
      for (const c of novas) ultima.set(c, "descartar");
      const lembrado = enfileirar(novas, () => enviar("POST", novas)).catch(() => false);
      for (const c of novas) lembradoDe.set(c, lembrado);
      return { novas, lembrado, soNaTela: lembrado.then((ok) => !ok && aindaE(novas, "descartar")) };
    },
    /**
     * Desfaz: o DELETE sai depois de toda operação pendente das mesmas chaves.
     * `falhou`: true quando o DELETE não desfez um descarte que o servidor
     * tinha lembrado, e a pessoa não descartou de novo (é quando a tela avisa
     * que o aviso pode sumir ao recarregar).
     */
    desfazer(chaves: readonly string[], opcoes?: { soNaTela?: boolean }): { lista: string[]; feito: Promise<boolean>; falhou: Promise<boolean> } {
      const lista = [...new Set(chaves.filter(Boolean))];
      for (const c of lista) ultima.set(c, "desfazer");
      if (opcoes?.soNaTela || !lista.length) {
        for (const c of lista) lembradoDe.delete(c);
        return { lista, feito: Promise.resolve(true), falhou: Promise.resolve(false) };
      }
      const antes = Promise.all(lista.map((c) => lembradoDe.get(c) ?? Promise.resolve(true)));
      const feito = enfileirar(lista, () => enviar("DELETE", lista)).catch(() => false);
      const falhou = Promise.all([feito, antes]).then(([ok, lembradas]) => !ok && lembradas.some(Boolean) && aindaE(lista, "desfazer"));
      return { lista, feito, falhou };
    },
    /**
     * A última operação pedida para a chave: a resposta atrasada de um
     * descarte não reabre o toast de um aviso que a pessoa já desfez.
     */
    ultimaOperacao(chave: string): "descartar" | "desfazer" | undefined {
      return ultima.get(chave);
    },
    /** Espera tudo o que está na fila (para os testes). */
    async esvaziar(): Promise<void> {
      await Promise.all([...filas.values()]);
    },
  };
}

export type EstadoDosDescartes = {
  semente: ReadonlySet<string>;
  registradas: ReadonlySet<string>;
  descartadas: ReadonlySet<string>;
  desfeitas: ReadonlySet<string>;
  locais: ReadonlySet<string>;
};

/** A tela esconde esta chave? */
export function estaDescartada(c: string | null | undefined, e: EstadoDosDescartes): boolean {
  if (!c) return false;
  if (e.locais.has(c) || e.descartadas.has(c)) return true;
  if (e.desfeitas.has(c)) return false;
  return e.semente.has(c) || e.registradas.has(c);
}

/** A semente só cresce numa visita: a união do que o servidor já mandou com o que mandou agora. */
export function unirSemente(antes: ReadonlySet<string>, agora: readonly string[]): Set<string> {
  const s = new Set(antes);
  for (const c of agora) s.add(c);
  return s;
}
