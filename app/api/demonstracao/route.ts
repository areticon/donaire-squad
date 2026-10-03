export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { origemDoCookie, registrarPasso } from "@/lib/funil/eventos";
import { enviarEmail } from "@/lib/email";
import { emailDemonstracaoParaSocios } from "@/lib/email/demonstracao";
import { conferirEnvio } from "@/lib/anti-robo/porta";
import { lerProva } from "@/lib/anti-robo/regras";
import {
  CARGOS, FAIXAS_FATURAMENTO, SETORES, TAMANHOS_TIME,
  digitosDoWhatsApp, emailValido, mascaraWhatsApp, whatsAppValido,
} from "@/lib/calculadora/formulario";
import { FAIXAS_ATENDIDAS, ehLeadDeTeste, idDoLeadAtual, lembrarLead } from "@/lib/agenda/lead";

/**
 * O PEDIDO DE DEMONSTRAÇÃO, que substituiu o teste grátis em 27/09/2026.
 *
 * A Demandou passou a vender só para empresas que faturam acima de R$ 100 mil
 * por mês, em contrato anual (decisão com o Matheus Gaberlini, que entrou como
 * sócio). Venda desse tamanho passa por conversa, e a conversa começa aqui.
 *
 * DESDE 01/10 ESTE É O PASSO ANTES DO CALENDÁRIO, e pede os MESMOS campos do
 * portão da calculadora (faturamento, tamanho do time, setor, cargo, e-mail,
 * WhatsApp e consentimento), uma vez só. Quem já é lead conhecido (cookie da
 * calculadora) nem passa por aqui; quem é conhecido mas veio de uma captura
 * antiga, com campos faltando, manda só os que faltam: o e-mail vem do cookie,
 * nunca do corpo, para ninguém completar o cadastro de outra pessoa.
 *
 * QUEM FATURA MENOS NÃO É DESCARTADO EM SILÊNCIO: fica gravado com a faixa, e
 * a tela responde com franqueza que ainda não é o foco. Os sócios não recebem
 * o aviso desses, para a caixa deles ser só de quem dá para atender.
 */

function daLista<T extends string>(v: unknown, lista: readonly T[]): T | null {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null;
}

export async function POST(req: NextRequest) {
  try {
    const c = (await req.json()) as Record<string, unknown>;
    const idConhecido = await idDoLeadAtual();
    const conhecido = idConhecido ? await prisma.lead.findUnique({ where: { id: idConhecido } }) : null;

    const email = conhecido?.email ?? (typeof c.email === "string" ? c.email.trim().toLowerCase() : "");

    /**
     * A DEFESA CONTRA ROBÔ (01/10). Dos três leads dos últimos 30 dias, dois
     * entraram por AQUI com o mesmo padrão das contas de robô (Gmail cheio de
     * pontos, faturamento "até 50 mil"), no mesmo minuto em que o robô criava
     * a conta. Limite por IP e por e-mail no Postgres (o `Map` em memória zerava
     * a cada instância), isca, tempo mínimo, Turnstile e e-mail recusado.
     */
    const porta = await conferirEnvio({ porta: "demonstracao", headers: req.headers, prova: lerProva(c.antiRobo), email });
    if (!porta.ok) return NextResponse.json({ error: porta.mensagem }, { status: porta.status });
    if (!emailValido(email)) return NextResponse.json({ error: "Confira o e-mail." }, { status: 400 });

    // Campo que veio vale; campo que não veio fica o que o lead já tinha.
    const faturamento = daLista(c.faturamento, FAIXAS_FATURAMENTO.map(([v]) => v)) ?? conhecido?.faturamento ?? null;
    const tamanhoTime = daLista(c.tamanhoTime, TAMANHOS_TIME.map(([v]) => v)) ?? conhecido?.tamanhoTime ?? null;
    const setor = daLista(c.setor, SETORES) ?? conhecido?.setor ?? null;
    const cargo = daLista(c.cargo, CARGOS) ?? conhecido?.cargo ?? null;
    const zapBruto = typeof c.whatsapp === "string" && c.whatsapp.trim() ? c.whatsapp : null;
    if (zapBruto && !whatsAppValido(zapBruto)) {
      return NextResponse.json({ error: "Confira o WhatsApp: DDD e celular com 9 dígitos." }, { status: 400 });
    }
    const telefone = zapBruto ? mascaraWhatsApp(digitosDoWhatsApp(zapBruto)) : conhecido?.telefone ?? null;
    if (!telefone) return NextResponse.json({ error: "Confira o WhatsApp: DDD e celular com 9 dígitos." }, { status: 400 });
    if (!faturamento || !tamanhoTime || !setor || !cargo) {
      return NextResponse.json({ error: "Escolha faturamento, tamanho do time, setor e cargo." }, { status: 400 });
    }
    const consentimentoEm = c.consentimento === true ? new Date() : conhecido?.consentimentoEm ?? null;
    if (!consentimentoEm) {
      return NextResponse.json({ error: "Precisamos do seu consentimento para usar os dados." }, { status: 400 });
    }

    const o = await origemDoCookie();
    const dados = { telefone, cargo, setor, faturamento, tamanhoTime, consentimentoEm, demoPedidaEm: new Date() };
    const lead = await prisma.lead.upsert({
      where: { email },
      // `cta` só no lead novo: quem veio da calculadora continua "calculadora".
      create: { email, ...dados, cta: "demonstracao", origem: o.origem ?? null, campanha: o.campanha ?? null },
      update: dados,
      select: { id: true, nome: true, empresa: true },
    });

    const qualificado = FAIXAS_ATENDIDAS.has(faturamento);
    await registrarPasso("contato", {
      caminho: "/demonstracao",
      meta: { fonte: "demonstracao", qualificado, faturamento, tamanhoTime, setor },
    });

    if (qualificado && !ehLeadDeTeste(email)) {
      const socios = (process.env.DEMONSTRACAO_AVISAR ?? "contato@demandou.com")
        .split(",").map((e) => e.trim()).filter(Boolean);
      const aviso = emailDemonstracaoParaSocios({
        email, telefone, cargo, setor, tamanhoTime, faturamento,
        nome: lead.nome, empresa: lead.empresa, origem: o.origem ?? null,
      });
      for (const para of socios) await enviarEmail({ ...aviso, para });
    }

    // O cookie leva ao calendário sem pedir nada de novo, nesta visita e na próxima.
    return lembrarLead(NextResponse.json({ ok: true, qualificado }), lead.id);
  } catch (err) {
    console.error("[demonstracao] falhou:", err);
    return NextResponse.json({ error: "Não consegui registrar agora. Tente de novo em instantes." }, { status: 500 });
  }
}
