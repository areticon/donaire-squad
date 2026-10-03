import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { conferirEnvio } from "@/lib/anti-robo/porta";

/**
 * ESTE E-MAIL JÁ TEM CONTA?
 *
 * ## Por que esta rota existe
 *
 * Medido em 23/09: o `sign-up` do better-auth responde **HTTP 200 com um
 * objeto de usuário** quando o e-mail já existe. Ele não cria nada, não manda
 * e-mail e não altera a conta antiga (conferido no banco: nome, senha e data
 * de alteração intactos). É proteção contra enumeração de e-mail, e do lado do
 * servidor está certa.
 *
 * Do lado de quem se cadastrou, é uma mentira: a tela dizia "sua conta foi
 * criada", nenhum e-mail chegava, e a pessoa ficava presa para sempre, sem
 * saber que bastava entrar. O Bruno bateu nisso em 23/09 com o próprio e-mail.
 *
 * E a resposta falsa é INDISTINGUÍVEL da verdadeira: as duas voltam com
 * `token: null` e `createdAt` de agora. Não dá para descobrir pela resposta,
 * então a pergunta precisa ser feita antes.
 *
 * ## A troca que estou fazendo, dita por inteiro
 *
 * Responder "este e-mail tem conta" devolve a enumeração que o better-auth
 * evitava: alguém pode descobrir quais endereços têm conta aqui. É o que
 * Stripe, Notion e praticamente todo produto de assinatura fazem, porque o
 * custo do outro lado é maior: um cliente que não consegue entrar e não sabe
 * por quê é um cliente perdido, e ninguém abre chamado para isso, apenas some.
 *
 * O que sobra da proteção: limite por IP, para a enumeração não ser feita em
 * massa. Descobrir um endereço é barato; varrer uma lista, não.
 *
 * A rota NÃO diz nada além de sim ou não. Nome, plano e papel não saem daqui.
 */

// Consultas por IP: uma pessoa digita um e-mail, não trinta. O número (10 por minuto) mora em lib/anti-robo/porta.ts desde 01/10. O
// contador saiu de um `Map` em memória, que zerava a cada instância da Vercel,
// para o Postgres.
export async function POST(req: NextRequest) {
  const porta = await conferirEnvio({ porta: "email_existe", headers: req.headers });
  if (!porta.ok) {
    // Silêncio é a resposta certa aqui: quem varre não ganha sinal nenhum.
    return NextResponse.json({ existe: false }, { status: 200 });
  }

  let email = "";
  try {
    const corpo = (await req.json()) as { email?: unknown };
    email = typeof corpo.email === "string" ? corpo.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ existe: false });
  }
  if (!email || !email.includes("@")) return NextResponse.json({ existe: false });

  const achou = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  return NextResponse.json({ existe: Boolean(achou) });
}
