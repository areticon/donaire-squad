import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { avisoDeVencimentoAoAdmin, avisoDeVencimentoAoCliente } from "@/lib/email/contratos";
import { nomeDoPlano } from "@/lib/contratos/contratos";
import { avisoDevido, diasParaVencer, situacaoDoContrato } from "@/lib/contratos/situacao";

/**
 * A RÉGUA DOS CONTRATOS (02/10/2026), no cron de 1 minuto (app/api/cron/fila),
 * no mesmo desenho da régua da demonstração (lib/agenda/regua.ts):
 *
 *  - a situação guardada acompanha o relógio (vigente, a vencer, vencido),
 *    com um evento na trilha a cada mudança;
 *  - os avisos de 60, 30 e 7 dias e o de vencido saem por e-mail para o
 *    cliente e para o Bruno, UMA vez: o aviso é reservado em
 *    contratos_alertas com a chave (contrato, tipo, fim da vigência) por
 *    INSERT ... ON CONFLICT DO NOTHING antes de enviar. Quem inseriu envia.
 *    Se a função morrer depois de reservar, o aviso não sai: preferimos
 *    perder um a mandar dois.
 *
 * A consulta é pequena (contratos assinados que vencem nos próximos 61 dias
 * ou venceram há pouco) e roda a cada passada sem custo que se note.
 */

const DIA = 24 * 60 * 60 * 1000;

async function destinosDoAdmin(): Promise<string[]> {
  const fixo = (process.env.CONTRATOS_EMAIL ?? process.env.SUPORTE_EMAIL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fixo.length) return fixo;
  return (await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } })).map((a) => a.email).filter(Boolean);
}

export async function avancarContratos(agora = new Date()): Promise<{ olhados: number; mudancas: number; avisos: number; repostos: number }> {
  const contratos = await prisma.contrato.findMany({
    where: {
      status: { in: ["assinado", "vigente", "a_vencer", "vencido"] },
      fimVigencia: { not: null, lte: new Date(agora.getTime() + 61 * DIA), gt: new Date(agora.getTime() - 10 * DIA) },
    },
    include: { user: { select: { email: true, name: true } } },
    take: 200,
  });
  // Os assinados que começaram a valer (o início chegou) também mudam de
  // situação, mesmo longe do fim.
  const comecando = await prisma.contrato.findMany({
    // Só os pagos (04/10): assinado sem pagamento continua aguardando, e o
    // relógio não o transforma em vigente.
    where: { status: "assinado", inicioVigencia: { lte: agora }, pagoEm: { not: null } },
    select: { id: true, status: true, inicioVigencia: true, fimVigencia: true, pagoEm: true },
    take: 200,
  });

  let mudancas = 0;
  let avisos = 0;
  for (const c of [...comecando, ...contratos]) {
    const nova = situacaoDoContrato(c, agora);
    if (nova !== c.status) {
      const r = await prisma.contrato.updateMany({ where: { id: c.id, status: c.status }, data: { status: nova } });
      if (r.count) {
        mudancas++;
        await prisma.eventoDoContrato.create({ data: { contratoId: c.id, tipo: "situacao", autor: "sistema", detalhe: { de: c.status, para: nova } } });
        c.status = nova;
      }
    }
  }

  const admins = contratos.length ? await destinosDoAdmin() : [];
  for (const c of contratos) {
    const tipo = avisoDevido(c, agora);
    if (!tipo || !c.fimVigencia) continue;
    const reservado = await prisma.alertaDoContrato.createMany({ data: [{ contratoId: c.id, tipo, fimVigencia: c.fimVigencia }], skipDuplicates: true });
    if (reservado.count !== 1) continue;
    const dias = Math.max(0, diasParaVencer(c, agora) ?? 0);
    const plano = nomeDoPlano(c.plano);
    const paraCliente = c.signatarioEmail ?? c.user.email;
    const envios = await Promise.all([
      enviarEmail({
        ...avisoDeVencimentoAoCliente({ nome: c.signatarioNome ?? c.user.name, numero: c.numero, plano, fim: c.fimVigencia, dias, valorCentavos: c.valorCentavos, renovacaoAutomatica: c.renovacaoAutomatica }),
        para: paraCliente,
      }).then((ok) => ({ para: paraCliente, lado: "cliente", ok })),
      ...admins.map((para) =>
        enviarEmail({
          ...avisoDeVencimentoAoAdmin({
            cliente: c.empresa ?? c.user.name ?? c.user.email,
            numero: c.numero,
            plano,
            fim: c.fimVigencia!,
            dias,
            valorCentavos: c.valorCentavos,
            renovacaoAutomatica: c.renovacaoAutomatica,
            userId: c.userId,
          }),
          para,
        }).then((ok) => ({ para, lado: "admin", ok }))
      ),
    ]);
    await prisma.alertaDoContrato
      .update({ where: { contratoId_tipo_fimVigencia: { contratoId: c.id, tipo, fimVigencia: c.fimVigencia } }, data: { situacao: "enviado", detalhe: envios } })
      .catch(() => {});
    await prisma.eventoDoContrato.create({ data: { contratoId: c.id, tipo: `aviso_${tipo}`, autor: "sistema", detalhe: { dias, envios } } });
    avisos++;
  }
  // Os créditos mensais de quem pagou por contrato fora do Stripe (04/10).
  const { reporCreditosDosContratos } = await import("@/lib/contratos/pagamento");
  const repostos = await reporCreditosDosContratos(agora).catch((e) => {
    console.error("[contratos] reposição dos contratos falhou:", e);
    return 0;
  });
  // As COBRANÇAS (05/10): o e-mail de acompanhamento dos contratos enviados
  // sem assinatura e assinados sem pagamento, na cadência e em horário
  // comercial. Falha não derruba a régua. Ver lib/contratos/cobrancas.ts.
  const { avancarCobrancas } = await import("@/lib/contratos/cobrancas");
  await avancarCobrancas(agora).catch((e) => console.error("[contratos] régua das cobranças falhou:", e));
  return { olhados: contratos.length + comecando.length, mudancas, avisos, repostos };
}
