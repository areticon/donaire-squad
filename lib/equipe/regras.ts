/**
 * AS REGRAS DO ACESSO DE EQUIPE (01/10/2026), num arquivo SEM banco.
 *
 * Sem banco de propósito: a tela de Configurações (componente de cliente)
 * mostra os mesmos números que o servidor aplica, e componente de cliente não
 * importa módulo que toca o banco. Quando cada lado tinha a sua cópia de uma
 * tabela, as cópias divergiram (a lição da tabela de planos de 02/09).
 *
 * Decisão do Bruno de 01/10, com o simulador de acessos na mão:
 * - todos os acessos gastam da cota do DONO (créditos, gravações e carteira de
 *   vídeo); quando ela acaba, ninguém gera até renovar ou recarregar. É isso
 *   que segura a margem: o gasto nunca passa do que o plano paga;
 * - acessos inclusos, contando o dono: Starter 2, Pro 5, Enterprise 10;
 * - acesso extra a R$ 197 por mês, que soma 2.000 créditos e 1 gravação por
 *   mês à cota (cada crédito extra custa no pior caso R$ 0,027 de IA: R$ 54
 *   contra R$ 197, 72,6% de margem no acesso extra).
 */

/** Acessos inclusos por plano, CONTANDO o dono. Chaves são o `User.plan`. */
export const ACESSOS_INCLUSOS: Record<string, number> = {
  pro: 2, // Starter
  business: 5, // Pro
  studio: 10, // Enterprise
};

export const ACESSO_EXTRA = {
  precoMensal: 197,
  creditosPorMes: 2000,
  gravacoesPorMes: 1,
} as const;

/** Acessos que a conta pode ter ao todo (dono incluso). Sem plano: só o dono. */
export function acessosDaConta(plan: string | null | undefined, extras: number, admin = false): number {
  // Acesso interno não tem cobrança nem cota; o teto aqui é só para a tela
  // não prometer infinito.
  if (admin) return 50;
  const inclusos = plan ? (ACESSOS_INCLUSOS[plan] ?? 1) : 1;
  return inclusos + Math.max(0, extras);
}

/**
 * Quantas MARCAS (projetos) a conta pode ter com a equipe (01/10, aprovado):
 * a maior entre as marcas do plano e os acessos inclusos, mais uma por acesso
 * extra. Sem isso, o Enterprise venderia 10 acessos e só 5 marcas, e o dono que
 * cria um projeto por vendedor esbarraria na sexta. Marca não tem custo próprio:
 * o custo vem de créditos e gravações, que continuam travados na cota.
 */
export function marcasDaConta(marcasDoPlano: number, plan: string | null | undefined, extras: number): number {
  const inclusos = plan ? (ACESSOS_INCLUSOS[plan] ?? 0) : 0;
  return Math.max(marcasDoPlano, inclusos) + Math.max(0, extras);
}

/** Créditos por ciclo da conta: os do plano mais os dos acessos extras. */
export function creditosDoCiclo(creditosDoPlano: number, extras: number): number {
  return creditosDoPlano + Math.max(0, extras) * ACESSO_EXTRA.creditosPorMes;
}

/** Gravações por ciclo da conta: as do plano mais as dos acessos extras. */
export function gravacoesDoCiclo(gravacoesDoPlano: number, extras: number): number {
  return gravacoesDoPlano + Math.max(0, extras) * ACESSO_EXTRA.gravacoesPorMes;
}

function plural(n: number, um: string, varios: string): string {
  return n === 1 ? um : varios;
}

/** A frase do teto de gravações do membro, aprovada no pedido de 01/10. */
export function fraseDoTetoDeGravacoes(usadas: number, teto: number): string {
  const u = Math.min(usadas, teto);
  return `Você já usou ${u} de ${teto} ${plural(teto, "gravação", "gravações")} que a sua equipe liberou para você este mês.`;
}

/** A frase do teto de créditos do membro, no mesmo molde. */
export function fraseDoTetoDeCreditos(usados: number, teto: number, precisa?: number): string {
  const n = (v: number) => v.toLocaleString("pt-BR");
  const u = Math.min(usados, teto);
  const pedido = precisa ? ` Este trabalho precisa de ${n(precisa)}.` : "";
  return `Você já usou ${n(u)} de ${n(teto)} créditos que a sua equipe liberou para você este mês.${pedido}`;
}

/**
 * A frase de quando a cota DA CONTA acabou, para quem é membro: ele não vê
 * cobrança nem pode comprar, então "faça upgrade" seria um botão sem porta.
 */
export function fraseDaCotaDaEquipe(args: { usadas: number; limite: number; renovaEm: string | null; diaEMes: (iso: string) => string; dono?: string | null }): string {
  const u = Math.min(args.usadas, args.limite);
  const libera = args.renovaEm ? ` A próxima libera em ${args.diaEMes(args.renovaEm)}.` : "";
  return `A sua equipe já usou ${u} de ${args.limite} ${plural(args.limite, "gravação", "gravações")} deste mês.${libera} Para liberar mais, fale com ${quem(args.dono)}.`;
}

/*
 * AS FRASES DO MEMBRO (01/10, acabamento do acesso de equipe). Moram aqui, sem
 * banco, porque o servidor (erro de débito, recusa de rota) e a tela (faixa do
 * topo, janela da campanha) precisam dizer a MESMA coisa. Quando cada lado
 * escrevia a sua, o membro lia "compre mais créditos" num lugar e "fale com
 * quem administra" no outro, e nenhuma das duas dizia com QUEM falar.
 */

/** Quem não sabe o nome do dono ainda precisa de uma frase que funcione. */
function quem(dono: string | null | undefined): string {
  return dono && dono.trim() ? dono.trim() : "quem administra a conta";
}

/**
 * Os créditos da conta não cobrem o que o membro pediu. Sem botão de compra:
 * membro não vê cobrança, e quem resolve é o dono. Com o número quando há,
 * porque "acabaram" é mentira quando ainda sobram 50 e o trabalho custa 120.
 */
export function fraseDosCreditosDaEquipe(dono: string | null | undefined, conta?: { necessario: number; disponivel: number }): string {
  const n = (v: number) => v.toLocaleString("pt-BR");
  if (conta && conta.disponivel > 0) {
    return `Os créditos da equipe não cobrem este trabalho: ele custa ${n(conta.necessario)} e a conta tem ${n(conta.disponivel)}. Peça a ${quem(dono)} para adicionar mais.`;
  }
  return `Os créditos da equipe acabaram. Peça a ${quem(dono)} para adicionar mais.`;
}

/** O que o membro faz num projeto liberado. A recusa e a tela repetem a lista. */
export const O_QUE_O_MEMBRO_FAZ =
  "Como membro da equipe, você sobe vídeos, aprova roteiros, gera campanhas e edita e agenda os posts deste projeto.";

/** A recusa de quando o membro tenta mexer no que é configuração do projeto. */
export function fraseSoODono(dono: string | null | undefined, oQue = "mudar as configurações deste projeto"): string {
  return `Só ${quem(dono)}, que administra a conta, pode ${oQue}. ${O_QUE_O_MEMBRO_FAZ}`;
}

/**
 * A tela do membro quando a assinatura do dono caiu (sem preço, sem plano).
 * A conta não guarda nome de empresa, então a equipe é chamada pelo nome do
 * dono, e a segunda menção usa o primeiro nome para a frase não repetir.
 */
export function fraseDaAssinaturaPausada(dono: string | null | undefined): string {
  const nome = dono?.trim();
  if (!nome) return "A assinatura da sua equipe está pausada. Fale com quem administra a conta para reativar.";
  const primeiro = nome.includes("@") ? nome : nome.split(/\s+/)[0];
  return `A assinatura da equipe de ${nome} está pausada. Fale com ${primeiro} para reativar.`;
}

export type PapelNaEquipe = "dono" | "membro";

/*
 * O QUE A TELA DA EQUIPE RECEBE (01/10). Os tipos moram aqui, sem banco, para
 * a aba Equipe (componente de cliente) poder usá-los; quem monta é
 * lib/equipe/convites.ts, no servidor.
 */
export type MembroNoPainel = {
  id: string;
  email: string;
  nome: string | null;
  status: "convidado" | "ativo";
  convitevencido: boolean;
  todosOsProjetos: boolean;
  projetos: string[];
  tetoGravacoes: number | null;
  tetoCreditos: number | null;
  consumo: { creditos: number; gravacoes: number };
};

export type PainelDaEquipe = {
  papel: "dono";
  plano: string | null;
  acessos: { inclusos: number; extras: number; total: number; ocupados: number };
  conta: {
    nome: string;
    creditos: number;
    creditosDoCiclo: number;
    creditosDeVideo: number;
    gravacoesUsadas: number;
    gravacoesDoCiclo: number;
    renovaEm: string | null;
    /** O dono também gasta: o consumo dele no ciclo, para o painel fechar. */
    consumoDoDono: { creditos: number; gravacoes: number };
    /** O que membros que já saíram gastaram neste ciclo. */
    consumoDeQuemSaiu: { creditos: number; gravacoes: number };
  };
  projetos: { id: string; nome: string }[];
  membros: MembroNoPainel[];
};

export type EquipeNaTela = PainelDaEquipe | { papel: "membro"; dono: string; tetoGravacoes: number | null; tetoCreditos: number | null; consumo: { creditos: number; gravacoes: number } };


