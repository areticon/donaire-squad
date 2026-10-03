export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { casca, paragrafo, titulo, escapar, MARCA } from "@/lib/email/layout";
import { assinaturaDaMetaValida, ehPedidoDeParar, ehPedidoDeVoltar, mensagensDoWebhook } from "@/lib/whatsapp/entrada";
import { enviarTextoNaJanela } from "@/lib/whatsapp/enviar";
import { numeroNaTela } from "@/lib/whatsapp/numero";

/**
 * O WEBHOOK DE ENTRADA DO WHATSAPP (01/10). PRONTO E DESLIGADO: sem
 * WHATSAPP_VERIFY_TOKEN a Meta não consegue nem assinar, e sem
 * WHATSAPP_APP_SECRET todo POST é recusado.
 *
 * Duas coisas acontecem aqui:
 *  1. OPT-OUT: o lead que responde PARAR (ou parecido) entra em
 *     whatsapp_bloqueios e nenhum alerta sai mais para o número dele
 *     (lib/whatsapp/enviar.ts confere antes de cada envio). VOLTAR desfaz.
 *  2. RESPOSTA DO LEAD: a Cloud API não tem caixa de entrada; o que o lead
 *     escreve só existe aqui. Sem repassar, "é só responder esta mensagem"
 *     seria mentira. O texto vai por e-mail para quem atende a reunião mais
 *     recente do lead (ou para DEMONSTRACAO_AVISAR).
 *
 * Fica em /api/webhooks, que o proxy já deixa passar sem sessão.
 */

/** A verificação do cadastro do webhook no painel da Meta (GET com hub.challenge). */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;
  if (esperado && p.get("hub.mode") === "subscribe" && p.get("hub.verify_token") === esperado) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Não autorizado" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const cru = await req.text();
  if (!assinaturaDaMetaValida(cru, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }
  let corpo: unknown;
  try {
    corpo = JSON.parse(cru);
  } catch {
    return NextResponse.json({ ok: true });
  }

  // A Meta reenvia o que não recebe 200 rápido: tudo aqui é curto, e erro de
  // um item não impede o 200 (senão a mesma mensagem volta por dias).
  for (const m of mensagensDoWebhook(corpo)) {
    try {
      if (ehPedidoDeParar(m.texto)) {
        await prisma.bloqueioDeWhatsapp.upsert({
          where: { numero: m.de },
          create: { numero: m.de, palavra: m.texto.slice(0, 60) },
          update: {},
        });
        await enviarTextoNaJanela(m.de, "Pronto, você não recebe mais avisos da Demandou por aqui. Os avisos por e-mail continuam. Se mudar de ideia, responda VOLTAR.");
        continue;
      }
      if (ehPedidoDeVoltar(m.texto)) {
        await prisma.bloqueioDeWhatsapp.deleteMany({ where: { numero: m.de } });
        await enviarTextoNaJanela(m.de, "Combinado, os avisos da sua demonstração voltam a chegar por aqui.");
        continue;
      }
      await repassarAoTime(m.de, m.texto);
    } catch (e) {
      console.error("[whatsapp] entrada falhou:", e);
    }
  }
  return NextResponse.json({ ok: true });
}

/** O lead respondeu: quem atende a reunião dele precisa ler. */
async function repassarAoTime(numero: string, texto: string) {
  if (!texto.trim()) return;
  // O banco guarda a máscara da tela, sem o 55: compara pelos últimos 8 dígitos
  // e confirma o DDD, para achar o lead sem depender do formato salvo.
  const fim = numero.slice(-8);
  const ddd = numero.startsWith("55") ? numero.slice(2, 4) : "";
  const candidatos = await prisma.lead.findMany({
    where: { telefone: { contains: `${fim.slice(0, 4)}-${fim.slice(4)}` } },
    select: { id: true, email: true, nome: true, empresa: true, telefone: true },
    take: 5,
  });
  const lead = candidatos.find((l) => (l.telefone ?? "").replace(/\D/g, "").startsWith(ddd)) ?? candidatos[0] ?? null;
  const reuniao = lead
    ? await prisma.reuniaoDeDemonstracao.findFirst({ where: { leadId: lead.id }, orderBy: { inicio: "desc" }, include: { pessoa: true } })
    : null;
  if (reuniao?.teste) return;
  const destinos = reuniao?.pessoa.emailAgenda
    ? [reuniao.pessoa.emailAgenda]
    : (process.env.DEMONSTRACAO_AVISAR ?? "contato@demandou.com").split(",").map((e) => e.trim()).filter(Boolean);
  const quem = lead ? lead.nome || lead.empresa || lead.email : numeroNaTela(numero);
  const zap = `https://wa.me/${numero}`;
  const assunto = `${quem} respondeu no WhatsApp`;
  for (const para of destinos) {
    await enviarEmail({
      para,
      assunto,
      texto: [`${quem} (${numeroNaTela(numero)}) escreveu no WhatsApp da Demandou:`, "", texto, "", `Responder (abre a conversa no seu WhatsApp): ${zap}`].join("\n"),
      html: casca({
        previa: texto.slice(0, 120),
        miolo: [
          titulo("Resposta no WhatsApp."),
          paragrafo(`${escapar(quem)} (${escapar(numeroNaTela(numero))}) escreveu:`),
          paragrafo(`<em>${escapar(texto)}</em>`),
          paragrafo(`<a href="${zap}" style="color:${MARCA.link};font-weight:600">Responder pelo WhatsApp</a>`, { tamanho: 14 }),
        ].join("\n"),
      }),
    });
  }
}
