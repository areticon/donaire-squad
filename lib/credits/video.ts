import { prisma } from "@/lib/db/prisma";
import { SaldoInsuficiente } from "@/lib/credits";
import { contaPagante, nomeDoDono } from "@/lib/equipe/conta";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";
import { debitoIsento } from "@/lib/credits/isencao";

/**
 * A CARTEIRA DE VÍDEO, separada da carteira do plano.
 *
 * Gêmea de `lib/credits`, e a duplicação é deliberada: as duas mexem em colunas
 * diferentes e uma não pode virar a outra por engano. A regra que vale mais
 * que o código é a mesma de lá, e por isso está repetida aqui: nunca mexa em
 * `videoCredits` fora deste arquivo, porque saldo sem linha de extrato é
 * dinheiro que some do relatório.
 *
 * POR QUE DUAS CARTEIRAS, e não um saldo com preço alto: a conta de 18/09.
 * Um vídeo de 8 segundos com narração custa de R$ 6,48 (Veo 3.1 rápido) a
 * R$ 17,28 (cheio). No plano Essencial de R$ 397, quatro vídeos cheios por
 * campanha custam R$ 431 por mês, ou 108,6% do preço do plano. Com um saldo
 * só, nada impediria o cliente de drenar o plano inteiro em vídeo e deixar a
 * margem negativa sem ninguém ter escolhido isso.
 *
 * Foi exatamente a falta dessa conta que tirou o Veo do produto em 18/08, com
 * 80% de prejuízo por operação, invisível porque nada era gravado.
 */

/**
 * Quantos créditos de vídeo o usuário tem agora. Para membro da equipe, a
 * carteira é a do dono (01/10): a equipe gasta da mesma cota de vídeo.
 */
export async function saldoDeVideo(userId: string): Promise<number> {
  const { contaId } = await contaPagante(userId);
  const u = await prisma.user.findUnique({
    where: { id: contaId },
    select: { videoCredits: true },
  });
  return u?.videoCredits ?? 0;
}

/**
 * Debita da carteira de VÍDEO. Lança `SaldoInsuficiente` sem cobrar nada.
 *
 * A condição de saldo vive no `where`, como na carteira do plano: se outra
 * requisição debitou no meio, esta não encontra a linha e nada é cobrado duas
 * vezes. O `decrement` do Postgres é atômico, então a corrida não existe.
 */
export async function debitarVideo(args: {
  userId: string;
  quantidade: number;
  operation: string;
  projectId?: string;
  refId?: string;
  note?: string;
}): Promise<{ balance: number; txId: string }> {
  const { quantidade, operation, projectId, refId, note } = args;
  if (quantidade <= 0) throw new Error("Quantidade a debitar precisa ser positiva.");

  return prisma.$transaction(async (tx) => {
    // Quem paga é a conta (o dono, quando quem pediu é membro). Ver lib/equipe/conta.ts (01/10).
    const { contaId: userId, autorId } = await contaPagante(args.userId, tx);
    // Admin sem débito só com ADMIN_SEM_DEBITO=1 (06/10): o trabalho acontece,
    // o extrato registra a linha de valor zero e o saldo não se move. Mesma
    // regra da carteira do plano (lib/credits/isencao.ts).
    const dono = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, videoCredits: true },
    });
    if (dono && debitoIsento(dono.role)) {
      const t = await tx.creditTransaction.create({
        data: {
          userId,
          autorId,
          projectId,
          amount: 0,
          operation,
          carteira: "video",
          refId,
          balance: dono.videoCredits,
          note: `${note ? `${note}. ` : ""}Acesso interno: custaria ${quantidade} créditos de vídeo`,
        },
        select: { id: true },
      });
      return { balance: dono.videoCredits, txId: t.id };
    }

    const atualizados = await tx.user.updateMany({
      where: { id: userId, videoCredits: { gte: quantidade } },
      data: { videoCredits: { decrement: quantidade } },
    });

    if (atualizados.count === 0) {
      const disponivel = (await tx.user.findUnique({ where: { id: userId }, select: { videoCredits: true } }))?.videoCredits ?? 0;
      const falta = new SaldoInsuficiente(quantidade, disponivel);
      // Membro da equipe (01/10, acabamento): a frase diz a quem pedir, pelo
      // nome, e marca o erro para ninguém emendar um convite de compra.
      if (autorId) {
        const nomeDono = (await nomeDoDono(userId, tx)) ?? "quem administra a conta";
        falta.message = fraseDosCreditosDaEquipe(nomeDono, { necessario: quantidade, disponivel });
        falta.equipe = { dono: nomeDono };
      }
      throw falta;
    }

    const u = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { videoCredits: true },
    });

    const t = await tx.creditTransaction.create({
      data: {
        userId,
        autorId,
        projectId,
        amount: -quantidade,
        operation,
        carteira: "video",
        refId,
        balance: u.videoCredits,
        note,
      },
      select: { id: true },
    });

    return { balance: u.videoCredits, txId: t.id };
  });
}

/**
 * Credita a carteira de vídeo: compra de pacote ou estorno.
 *
 * O estorno importa mais do que parece aqui: um vídeo custa de 6 a 17 reais de
 * custo variável, e um trabalho cobrado que falha depois sem devolução é a
 * reclamação mais cara que este produto pode gerar.
 */
export async function creditarVideo(args: {
  userId: string;
  quantidade: number;
  operation: string;
  refId?: string;
  note?: string;
}): Promise<{ balance: number }> {
  const { quantidade, operation, refId, note } = args;
  if (quantidade <= 0) throw new Error("Quantidade a creditar precisa ser positiva.");

  return prisma.$transaction(async (tx) => {
    // O estorno volta para a carteira de quem pagou (01/10, acesso de equipe).
    const { contaId: userId, autorId } = await contaPagante(args.userId, tx);
    const u = await tx.user.update({
      where: { id: userId },
      data: { videoCredits: { increment: quantidade } },
      select: { videoCredits: true },
    });

    await tx.creditTransaction.create({
      data: {
        userId,
        autorId,
        amount: quantidade,
        operation,
        carteira: "video",
        refId,
        balance: u.videoCredits,
        note,
      },
    });

    return { balance: u.videoCredits };
  });
}

/**
 * OS PACOTES DE CRÉDITO DE VÍDEO vivem em `video-tabela.ts`, sem banco, para a
 * janela da campanha calcular o preço com a MESMA função que cobra aqui. Este
 * módulo só reexporta, para quem já importava daqui continuar valendo.
 *
 * Desde 21/09 o crédito é POR GERAÇÃO: um vídeo de 60 s são 9 gerações do Veo
 * (8 s mais 8 extensões de 7 s), 1.755 créditos no rápido. A conta antiga,
 * proporcional aos segundos, dizia 1.463 e subestimava a cadeia.
 */
export {
  CREDITOS_DE_VIDEO,
  DURACOES_DE_VIDEO,
  custoDoVideo,
  geracoesDoVideo,
  segundosEntregues,
  creditosPorGeracao,
  normalizarDuracao,
} from "@/lib/credits/video-tabela";

/**
 * Este lancamento ja foi feito?
 *
 * Gemea de `jaCobrado`, mas para CREDITO: o Stripe reenvia webhook, e creditar
 * duas vezes pela mesma compra e dinheiro dado. A diferenca e o sinal do
 * `amount`, e por isso ela nao pode ser a mesma funcao.
 */
export async function jaCreditado(operation: string, refId: string): Promise<boolean> {
  const t = await prisma.creditTransaction.findFirst({
    where: { operation, refId, amount: { gt: 0 } },
    select: { id: true },
  });
  return Boolean(t);
}

/**
 * O VÍDEO INCLUÍDO NO PLANO, reposto a cada ciclo (tabela de 27/09), vive em
 * `concederCiclo` (lib/credits/ciclo.ts) desde 05/10. A função que morava
 * aqui lia o saldo e DEPOIS creditava, fora de transação: duas chegadas
 * simultâneas leram zero e a conta ganhou a cota em dobro. Completar até a
 * cota só é seguro com a leitura dentro da trava, junto com o crédito do plano.
 */
