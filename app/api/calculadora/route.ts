export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { origemDoCookie, registrarPasso } from "@/lib/funil/eventos";
import { enviarEmail } from "@/lib/email";
import { emailCalculadoraParaTime } from "@/lib/email/calculadora";
import { conferirEnvio } from "@/lib/anti-robo/porta";
import { lerProva } from "@/lib/anti-robo/regras";
import { calcular } from "@/lib/calculadora/custos";
import { ehLeadDeTeste, lembrarLead } from "@/lib/agenda/lead";
import {
  CARGOS, FAIXAS_FATURAMENTO, SETORES, TAMANHOS_TIME,
  digitosDoWhatsApp, emailValido, mascaraWhatsApp, whatsAppValido,
} from "@/lib/calculadora/formulario";

/**
 * O PORTÃO DA CALCULADORA (01/10).
 *
 * A calculadora da landing só mostra o resultado depois deste cadastro, e o
 * cadastro é o dado que o time de vendas mais quer: faturamento, tamanho do
 * time, setor, cargo, e-mail e WhatsApp, junto com o que a pessoa simulou.
 *
 * A CONTA É REFEITA AQUI, com as entradas podadas, e não copiada do navegador:
 * o e-mail do time mostra o número que a mesma função calculou na tela, e um
 * corpo forjado não grava "economia de R$ 1 milhão" no lead.
 *
 * O CONSENTIMENTO É OBRIGATÓRIO (LGPD, art. 7º, I) e vai carimbado com a hora
 * em `consentimentoEm`. Sem a marca a rota recusa: o carimbo é a prova.
 *
 * O MESMO E-MAIL VOLTANDO ATUALIZA o lead, como na captura e na demonstração,
 * e o time recebe o aviso de novo, porque quem volta para simular outra vez
 * está mais quente do que da primeira.
 */

function daLista<T extends string>(v: unknown, lista: readonly T[]): T | null {
  return typeof v === "string" && (lista as readonly string[]).includes(v) ? (v as T) : null;
}

export async function POST(req: NextRequest) {
  try {
    const c = (await req.json()) as Record<string, unknown>;
    const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";

    /**
     * A DEFESA CONTRA ROBÔ (01/10): limite por IP e por e-mail no Postgres (o
     * `Map` em memória que estava aqui zerava a cada instância da Vercel),
     * isca, tempo mínimo, Turnstile quando ligado e e-mail descartável. Antes
     * de qualquer validação, para o robô não ganhar nem a mensagem de erro.
     */
    const porta = await conferirEnvio({ porta: "calculadora", headers: req.headers, prova: lerProva(c.antiRobo), email });
    if (!porta.ok) return NextResponse.json({ error: porta.mensagem }, { status: porta.status });
    const telefoneBruto = typeof c.whatsapp === "string" ? c.whatsapp : "";
    const faturamento = daLista(c.faturamento, FAIXAS_FATURAMENTO.map(([v]) => v));
    const tamanhoTime = daLista(c.tamanhoTime, TAMANHOS_TIME.map(([v]) => v));
    const setor = daLista(c.setor, SETORES);
    const cargo = daLista(c.cargo, CARGOS);

    if (!emailValido(email)) return NextResponse.json({ error: "Confira o e-mail." }, { status: 400 });
    if (!whatsAppValido(telefoneBruto)) {
      return NextResponse.json({ error: "Confira o WhatsApp: DDD e celular com 9 dígitos." }, { status: 400 });
    }
    if (!faturamento || !tamanhoTime || !setor || !cargo) {
      return NextResponse.json({ error: "Preencha faturamento, tamanho do time, setor e cargo." }, { status: 400 });
    }
    if (c.consentimento !== true) {
      return NextResponse.json({ error: "Precisamos do seu consentimento para usar os dados." }, { status: 400 });
    }

    const resultado = calcular((c.entradas ?? {}) as Record<string, unknown>);
    const telefone = mascaraWhatsApp(digitosDoWhatsApp(telefoneBruto));
    const o = await origemDoCookie();
    const momento = new Date();
    const dados = {
      telefone,
      cargo,
      setor,
      faturamento,
      tamanhoTime,
      cta: "calculadora",
      calculadora: JSON.parse(JSON.stringify(resultado)),
      calculadoraEm: momento,
      consentimentoEm: momento,
    };
    const lead = await prisma.lead.upsert({
      where: { email },
      create: { email, ...dados, origem: o.origem ?? null, campanha: o.campanha ?? null },
      update: dados,
      select: { id: true },
    });

    await registrarPasso("contato", {
      caminho: "/#calculadora",
      meta: {
        fonte: "calculadora",
        faturamento,
        tamanhoTime,
        setor,
        plano: resultado.demandou.planoId,
        economiaTime: resultado.economia[0]?.reais ?? 0,
      },
    });

    // O aviso vai para quem administra a Demandou (papel admin) e para a lista
    // da demonstração. Falha de e-mail não derruba o resultado da pessoa:
    // `enviarEmail` nunca lança, e o lead já está gravado.
    const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
    const lista = (process.env.DEMONSTRACAO_AVISAR ?? "contato@demandou.com").split(",").map((e) => e.trim());
    const destinos = [...new Set([...admins.map((a) => a.email), ...lista].filter(Boolean).map((e) => e.toLowerCase()))];
    const aviso = emailCalculadoraParaTime(
      { email, telefone, cargo, setor, faturamento, tamanhoTime, origem: o.origem ?? null },
      resultado
    );
    // Lead de teste (e-mail .invalid, ver lib/agenda/lead.ts) não avisa ninguém.
    if (!ehLeadDeTeste(email)) await Promise.all(destinos.map((para) => enviarEmail({ ...aviso, para })));

    // O AGENDAMENTO (01/10): o cookie httpOnly com o id assinado do lead faz o
    // botão "Agendar demonstração" abrir direto o calendário, sem pedir de novo
    // o que a pessoa acabou de preencher aqui.
    return lembrarLead(NextResponse.json({ ok: true, resultado }), lead.id);
  } catch (err) {
    console.error("[calculadora] falhou:", err);
    return NextResponse.json({ error: "Não consegui registrar agora. Tente de novo em instantes." }, { status: 500 });
  }
}
