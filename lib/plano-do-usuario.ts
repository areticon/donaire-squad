import { prisma } from "@/lib/db/prisma";
import { PLANOS_PUBLICOS, planoPublico, type PlanoId } from "@/lib/planos";
import { limiteDoTeste } from "@/lib/limites-do-plano";
import { consumoDoMembro, membroAtivo } from "@/lib/equipe/conta";
import { cicloAtual } from "@/lib/ciclo-de-credito";

/**
 * O QUE A FAIXA DO TOPO PRECISA SABER.
 *
 * Pedido do Bruno em 22/09: "toda conta deve ter banner do plano do usuário,
 * com créditos atuais (saldo) e CTA de upgrade ao lado".
 *
 * As três informações juntas não existiam em lugar nenhum: o plano morava na
 * aba de cobrança, o saldo morava na janela da campanha (e só na hora de
 * gerar), e o convite para subir de plano só aparecia quando alguém ESBARRAVA
 * num limite. Quem descobre o saldo batendo nele decide com susto, e susto no
 * meio de uma campanha é o cliente achando que o produto quebrou.
 *
 * Lê o banco, então mora longe da tela. Quem desenha é um componente de
 * SERVIDOR, e por isso não há rota nova nem espera no navegador.
 */

// O tipo mora em lib/plano-na-tela.ts, sem banco, porque a faixa do topo o
// usa no navegador. Reexportado aqui para quem já importava deste arquivo.
export type { PlanoNaTela } from "@/lib/plano-na-tela";
import type { PlanoNaTela } from "@/lib/plano-na-tela";

/** Quantos dias inteiros faltam, arredondando para cima: 0,2 dia ainda é "1 dia". */
function diasAte(fim: string, agora: Date): number {
  return Math.max(0, Math.ceil((new Date(fim).getTime() - agora.getTime()) / 86_400_000));
}

/**
 * A marca do alerta de saldo zerado (07/10): a última linha POSITIVA do extrato
 * da conta. Toda recarga gera marca nova; zerar de novo no mesmo ciclo, depois
 * de comprar, traz o alerta de volta. Leitura pura; falha vira "sem-recarga".
 */
async function marcaDaUltimaRecarga(contaId: string): Promise<string> {
  const t = await prisma.creditTransaction
    .findFirst({ where: { userId: contaId, amount: { gt: 0 } }, orderBy: { createdAt: "desc" }, select: { id: true } })
    .catch(() => null);
  return t?.id ?? "sem-recarga";
}

export async function planoDoUsuario(userIdDeQuemVe: string, agora = new Date()): Promise<PlanoNaTela> {
  // MEMBRO DA EQUIPE (01/10): o plano e o saldo são os da conta do dono, que é
  // de onde o trabalho dele sai. A faixa diz isso e não oferece compra.
  const membro = await membroAtivo(userIdDeQuemVe);
  const userId = membro?.donoId ?? userIdDeQuemVe;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, role: true, creditsBalance: true, videoCredits: true, creditsResetAt: true, name: true, email: true },
  });
  if (!user) {
    return {
      nome: "Sem plano",
      planoId: "free",
      creditos: 0,
      creditosDeVideo: 0,
      admin: false,
      emTeste: false,
      diasDeTesteRestantes: null,
      acao: { rotulo: "Escolher um plano", href: "/planos" },
    };
  }

  if (membro) {
    const ciclo = cicloAtual(user.creditsResetAt, agora);
    const { creditos } = await consumoDoMembro(userId, userIdDeQuemVe, ciclo.inicio);
    const temPlano = user.plan && user.plan !== "free";
    return {
      nome: temPlano ? (planoPublico(user.plan as PlanoId)?.nome ?? user.plan) : "Sem plano",
      planoId: user.plan,
      creditos: user.creditsBalance,
      creditosDeVideo: user.videoCredits,
      admin: user.role === "admin",
      emTeste: false,
      diasDeTesteRestantes: null,
      acao: null,
      equipe: { dono: user.name || user.email, tetoCreditos: membro.tetoCreditos, creditosUsados: creditos },
      alerta: user.role !== "admin" && user.creditsBalance <= 0 ? { motivo: "saldo-zerado", marca: await marcaDaUltimaRecarga(userId) } : null,
    };
  }

  if (user.role === "admin") {
    return {
      nome: "Acesso interno",
      planoId: "admin",
      creditos: user.creditsBalance,
      creditosDeVideo: user.videoCredits,
      admin: true,
      emTeste: false,
      diasDeTesteRestantes: null,
      acao: null,
    };
  }

  const teste = await limiteDoTeste(userId, agora);
  const temPlano = user.plan && user.plan !== "free";
  const nome = temPlano ? (planoPublico(user.plan as PlanoId)?.nome ?? user.plan) : "Sem plano";

  /**
   * O BOTÃO MUDA COM O LUGAR EM QUE A PESSOA ESTÁ.
   *
   * Oferecer "fazer upgrade" a quem já está no maior plano é propaganda, não
   * ajuda, e é a mesma lição já escrita em `proximoQueResolve`: pedido de
   * upgrade que não resolve nada queima a confiança no pedido inteiro. Quem
   * está no topo precisa de crédito, não de plano.
   */
  const ultimo = PLANOS_PUBLICOS[PLANOS_PUBLICOS.length - 1];
  const acao = !temPlano
    ? { rotulo: "Escolher um plano", href: "/planos" }
    : teste.emTeste
      ? { rotulo: "Assinar agora", href: "/settings?aba=plano" }
      : user.plan === ultimo.id
        ? { rotulo: "Comprar créditos", href: "/billing" }
        : { rotulo: "Fazer upgrade", href: "/planos" };

  const diasDeTesteRestantes = teste.terminaEm ? diasAte(teste.terminaEm, agora) : null;
  // O alerta da faixa, com a marca da ocorrência (07/10). A mesma regra de
  // antes (saldo zerado, ou teste com 2 dias ou menos); a marca é nova.
  const alerta: PlanoNaTela["alerta"] =
    user.creditsBalance <= 0
      ? { motivo: "saldo-zerado", marca: await marcaDaUltimaRecarga(userId) }
      : teste.emTeste && (diasDeTesteRestantes ?? 9) <= 2
        ? { motivo: "fim-do-teste", marca: `${teste.terminaEm ?? "sem-fim"}-${diasDeTesteRestantes ?? 0}` }
        : null;

  return {
    nome,
    planoId: user.plan,
    creditos: user.creditsBalance,
    creditosDeVideo: user.videoCredits,
    admin: false,
    emTeste: teste.emTeste,
    diasDeTesteRestantes,
    acao,
    alerta,
  };
}
