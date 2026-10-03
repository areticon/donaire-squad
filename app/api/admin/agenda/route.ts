export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import { janelasValidas } from "@/lib/agenda/janelas";
import { cifrar, decifrar } from "@/lib/agenda/segredos";
import { cancelarReuniao } from "@/lib/agenda/reunioes";
import { listarAgendas } from "@/lib/agenda/google";
import { ocupadoDoEndereco } from "@/lib/agenda/ical-ocupado";
import { instanteEmSP, proximosDiasUteis } from "@/lib/agenda/tempo";
import { numeroDoWhatsapp } from "@/lib/whatsapp/numero";

/**
 * AS AÇÕES DO /admin/agenda (01/10): configurar as pessoas do time e as
 * fontes de disponibilidade, e mexer nas reuniões marcadas.
 *
 * Só admin (papel lido do banco); quem não é recebe 404. Endereço iCal e
 * token do Google nunca voltam para a tela: o admin vê "configurado" e pode
 * trocar ou remover, não ler.
 */

const texto = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const inteiro = (v: unknown, min: number, max: number, padrao: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : padrao;
};
const emailOk = (v: string | null) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export async function POST(req: NextRequest) {
  const admin = await exigirAdmin();
  if (!admin) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  const c = (await req.json()) as Record<string, unknown>;

  try {
    switch (c.acao) {
      case "salvarPessoa": {
        const nome = texto(c.nome, 80);
        if (!nome) return NextResponse.json({ error: "Dê um nome." }, { status: 400 });
        const emailUsuario = texto(c.emailUsuario)?.toLowerCase() ?? null;
        const emailAgenda = texto(c.emailAgenda)?.toLowerCase() ?? null;
        if (!emailOk(emailUsuario) || !emailOk(emailAgenda)) return NextResponse.json({ error: "Confira os e-mails." }, { status: 400 });
        const fonte = c.fonte === "google" ? "google" : "manual";
        const janelas = janelasValidas(c.janelas);
        const linkSala = texto(c.linkSala, 300);
        if (linkSala && !/^https:\/\//i.test(linkSala)) return NextResponse.json({ error: "A sala precisa ser um link https." }, { status: 400 });
        // iCal: undefined = mantém, "" = remove, texto = troca (cifrado).
        let icalCifrado: string | null | undefined;
        if (typeof c.ical === "string") {
          const ical = c.ical.trim();
          if (ical && !/^(https|webcal):\/\//i.test(ical)) return NextResponse.json({ error: "O endereço iCal começa com https:// ou webcal://." }, { status: 400 });
          icalCifrado = ical ? cifrar(ical) : null;
        }
        // WhatsApp da pessoa para a régua de alertas (01/10): vazio = só e-mail.
        const whatsappBruto = texto(c.whatsapp, 30);
        const whatsapp = whatsappBruto ? numeroDoWhatsapp(whatsappBruto) : null;
        if (whatsappBruto && !whatsapp) return NextResponse.json({ error: "Confira o WhatsApp: DDD e número (ou +código do país)." }, { status: 400 });
        const usuario = emailUsuario ? await prisma.user.findUnique({ where: { email: emailUsuario }, select: { id: true } }) : null;
        const dados = {
          nome, emailUsuario, emailAgenda, fonte, janelas,
          userId: usuario?.id ?? null,
          ativo: c.ativo !== false,
          antecedenciaMin: inteiro(c.antecedenciaMin, 0, 7 * 24 * 60, 180),
          intervaloMin: inteiro(c.intervaloMin, 0, 120, 15),
          linkSala,
          whatsapp,
          observacao: texto(c.observacao, 300),
          ordem: inteiro(c.ordem, 0, 99, 0),
          ...(icalCifrado !== undefined ? { icalCifrado } : {}),
        };
        const id = texto(c.id, 40);
        const p = id
          ? await prisma.pessoaDoTime.update({ where: { id }, data: dados, select: { id: true } })
          : await prisma.pessoaDoTime.create({ data: dados, select: { id: true } });
        return NextResponse.json({ ok: true, id: p.id });
      }

      case "testarIcal": {
        const p = await prisma.pessoaDoTime.findUnique({ where: { id: String(c.pessoaId) } });
        if (!p?.icalCifrado) return NextResponse.json({ error: "Sem endereço iCal." }, { status: 400 });
        const dias = proximosDiasUteis(new Date());
        const ocupado = await ocupadoDoEndereco(decifrar(p.icalCifrado), instanteEmSP(dias[0], "00:00"), instanteEmSP(dias[dias.length - 1], "23:59"));
        return NextResponse.json({ ok: true, blocos: ocupado.length });
      }

      case "salvarConta": {
        const contaId = String(c.contaId);
        const agendas = Array.isArray(c.agendas)
          ? [...new Set((c.agendas as unknown[]).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 30)
          : [];
        const conta = await prisma.contaGoogleDoTime.update({ where: { id: contaId }, data: { agendas: agendas.length ? agendas : ["primary"] } });
        if (c.principal === true) {
          await prisma.contaGoogleDoTime.updateMany({ where: { pessoaId: conta.pessoaId, id: { not: conta.id } }, data: { principal: false } });
          await prisma.contaGoogleDoTime.update({ where: { id: conta.id }, data: { principal: true } });
        }
        return NextResponse.json({ ok: true });
      }

      case "listarAgendas": {
        const conta = await prisma.contaGoogleDoTime.findUnique({ where: { id: String(c.contaId) } });
        if (!conta) return NextResponse.json({ error: "Conta não encontrada." }, { status: 404 });
        return NextResponse.json({ ok: true, agendas: await listarAgendas(conta.refreshTokenCifrado) });
      }

      case "removerConta": {
        await prisma.contaGoogleDoTime.delete({ where: { id: String(c.contaId) } });
        return NextResponse.json({ ok: true });
      }

      case "cancelarReuniao": {
        const ok = await cancelarReuniao(String(c.id), "admin");
        return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Já estava cancelada." }, { status: 409 });
      }

      // A pessoa do time marcou que a reunião começou (01/10): segura o aviso
      // de atraso e libera o agradecimento ao lead depois do fim.
      case "comecou": {
        await prisma.reuniaoDeDemonstracao.updateMany({ where: { id: String(c.id), comecouEm: null, status: { in: ["marcada", "realizada"] } }, data: { comecouEm: new Date() } });
        return NextResponse.json({ ok: true });
      }

      case "statusReuniao": {
        const status = c.status === "realizada" || c.status === "faltou" ? c.status : null;
        if (!status) return NextResponse.json({ error: "Status inválido." }, { status: 400 });
        await prisma.reuniaoDeDemonstracao.updateMany({ where: { id: String(c.id), status: { in: ["marcada", "realizada", "faltou"] } }, data: { status } });
        return NextResponse.json({ ok: true });
      }
    }
    return NextResponse.json({ error: "Ação desconhecida." }, { status: 400 });
  } catch (e) {
    console.error("[admin/agenda] falhou:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Falhou." }, { status: 500 });
  }
}
