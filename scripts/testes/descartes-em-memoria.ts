// O banco dos DESCARTES DOS AVISOS em memória (07/10/2026): as notificações do
// sino e a tabela avisos_descartados, com as regras que o Postgres garante e
// que os testes precisam ver (único por pessoa e chave, ON CONFLICT DO NOTHING,
// o NOT EXISTS do sino, o teto das lidas). Nada aqui toca o banco real: a SQL
// de verdade roda em scripts/testes/descartar-avisos-sql-0710.test.mts, só no
// banco de dev.
import type { DepositoDosDescartes } from "@/lib/avisos/descartes";
import { CHAVES_DO_SINO_COM_FAIXA } from "@/lib/avisos/chaves";
import type { DepositoDoNotificar, DepositoDoSino, LinhaDoSino } from "@/lib/notificacoes";

export type NotificacaoEmMemoria = LinhaDoSino & { userId: string; chave: string; emailEm: Date | null };
export type DescarteEmMemoria = { id: string; userId: string; chave: string; descartadoEm: Date };

export function descartesEmMemoria(inicio: { notificacoes?: Array<Partial<NotificacaoEmMemoria> & { userId: string; chave: string }> } = {}) {
  let seq = 0;
  let relogio = Date.UTC(2026, 9, 7, 12, 0, 0);
  const proximo = () => new Date((relogio += 1000));
  const notificacoes: NotificacaoEmMemoria[] = (inicio.notificacoes ?? []).map((n) => ({
    id: `n${++seq}`,
    tipo: "falha",
    titulo: "Aviso",
    texto: "Texto",
    link: null,
    codigo: null,
    lidaEm: null,
    createdAt: proximo(),
    emailEm: null,
    ...n,
  }));
  const descartes: DescarteEmMemoria[] = [];
  /** O que cada chamada fez, para o teste conferir (nenhum delete em notificações, por exemplo). */
  const chamadas: string[] = [];

  const tem = (userId: string, chave: string) => descartes.some((d) => d.userId === userId && d.chave === chave);

  const deposito: DepositoDosDescartes = {
    async descartadas(userId, chaves) {
      chamadas.push("descartadas");
      return descartes.filter((d) => d.userId === userId && chaves.includes(d.chave)).map((d) => d.chave);
    },
    async comPrefixo(userId, prefixos, limite) {
      chamadas.push("comPrefixo");
      return descartes
        .filter((d) => d.userId === userId && prefixos.some((p) => d.chave.startsWith(p)))
        .sort((a, b) => b.descartadoEm.getTime() - a.descartadoEm.getTime())
        .slice(0, limite)
        .map((d) => d.chave);
    },
    async quantas(userId, prefixos) {
      return descartes.filter((d) => d.userId === userId && prefixos.some((p) => d.chave.startsWith(p))).length;
    },
    async apagarMaisAntigas(userId, quantas, prefixos) {
      chamadas.push("apagarMaisAntigas");
      const velhas = descartes
        .filter((d) => d.userId === userId && prefixos.some((p) => d.chave.startsWith(p)))
        .sort((a, b) => a.descartadoEm.getTime() - b.descartadoEm.getTime())
        .slice(0, Math.max(0, quantas));
      for (const v of velhas) descartes.splice(descartes.indexOf(v), 1);
      return velhas.length;
    },
    async gravar(userId, chaves) {
      chamadas.push("gravar");
      let novas = 0;
      for (const chave of chaves) {
        if (tem(userId, chave)) continue; // ON CONFLICT DO NOTHING
        descartes.push({ id: `d${++seq}`, userId, chave, descartadoEm: proximo() });
        novas++;
      }
      return novas;
    },
    async marcarLidas(userId, chaves) {
      chamadas.push("marcarLidas");
      let n = 0;
      for (const x of notificacoes) {
        if (x.userId === userId && chaves.includes(x.chave) && !x.lidaEm) {
          x.lidaEm = proximo();
          n++;
        }
      }
      return n;
    },
    async apagar(userId, chaves) {
      chamadas.push("apagar");
      const antes = descartes.length;
      for (let i = descartes.length - 1; i >= 0; i--) if (descartes[i].userId === userId && chaves.includes(descartes[i].chave)) descartes.splice(i, 1);
      return antes - descartes.length;
    },
    async chavesDasNotificacoes(userId, ids) {
      return notificacoes.filter((n) => n.userId === userId && ids.includes(n.id)).map((n) => n.chave);
    },
    async gravarLidas(userId, limite) {
      chamadas.push("gravarLidas");
      // Como a SQL: menos as que também são faixa na tela (NOT LIKE).
      const lidas = notificacoes
        .filter((n) => n.userId === userId && n.lidaEm && !CHAVES_DO_SINO_COM_FAIXA.some((p) => n.chave.startsWith(p)))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limite);
      return deposito.gravar(userId, lidas.map((n) => n.chave));
    },
  };

  const sino: DepositoDoSino = {
    async comDescartes(userId, limite) {
      chamadas.push("sino:comDescartes");
      const minhas = notificacoes.filter((n) => n.userId === userId && !tem(userId, n.chave));
      return {
        linhas: [...minhas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limite),
        naoLidas: minhas.filter((n) => !n.lidaEm).length,
        todas: notificacoes.filter((n) => n.userId === userId).length,
      };
    },
    async semDescartes(userId, limite) {
      chamadas.push("sino:semDescartes");
      const minhas = notificacoes.filter((n) => n.userId === userId);
      return {
        linhas: [...minhas].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limite),
        naoLidas: minhas.filter((n) => !n.lidaEm).length,
      };
    },
  };

  const emails: string[] = [];
  const notificar: DepositoDoNotificar = {
    async criar(d) {
      if (notificacoes.some((n) => n.userId === d.userId && n.chave === d.chave)) {
        throw Object.assign(new Error("Unique constraint failed on the fields: (`userId`,`chave`)"), { code: "P2002" });
      }
      const n: NotificacaoEmMemoria = { id: `n${++seq}`, tipo: d.tipo, titulo: d.titulo, texto: d.texto, link: d.link, codigo: d.codigo, lidaEm: null, createdAt: proximo(), userId: d.userId, chave: d.chave, emailEm: null };
      notificacoes.push(n);
      return { id: n.id };
    },
    async dono() {
      return { email: "dono@exemplo.com", name: "Dono", emailsDeAviso: true };
    },
    async enviar(e) {
      emails.push(e.para);
      return true;
    },
    async marcarEmail(id) {
      const n = notificacoes.find((x) => x.id === id);
      if (n) n.emailEm = proximo();
    },
  };

  /** Um depósito que falha sempre com este erro (a tabela que ainda não existe, por exemplo). */
  const quebrado = (erro: unknown): DepositoDosDescartes => {
    const lanca = async () => {
      throw erro;
    };
    return {
      descartadas: lanca,
      comPrefixo: lanca,
      quantas: lanca,
      apagarMaisAntigas: lanca,
      gravar: lanca,
      marcarLidas: deposito.marcarLidas,
      apagar: lanca,
      chavesDasNotificacoes: deposito.chavesDasNotificacoes,
      gravarLidas: lanca,
    };
  };

  return { deposito, sino, notificar, notificacoes, descartes, chamadas, emails, quebrado };
}
