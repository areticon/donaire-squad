export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";
import { normalizarTelefone } from "@/lib/demo/telefone";
import { registrarPasso } from "@/lib/funil/eventos";

/**
 * O contato que a pessoa deixa na demonstração pública.
 *
 * Ela acabou de ver o próprio texto virar três posts. É o único instante em
 * que um desconhecido está com a prova na mão, e até 08/09 o produto o deixava
 * ir embora sem pedir nada. Aqui ele deixa o e-mail e RECEBE o resultado, que é
 * a troca honesta: o e-mail não é pedágio para ver o que já viu, é o jeito de
 * levar o texto para onde ele vai ser usado.
 *
 * Guarda no `demo_runs` que já existe, e não numa tabela nova de lead: a rodada
 * já tem o texto cru, o resultado e o custo. Separar o contato disso obrigaria
 * a casar duas tabelas para responder "o que essa pessoa escreveu".
 */

const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TETO_POR_IP_DIA = 5;

export async function POST(req: NextRequest) {
  const corpo = (await req.json().catch(() => ({}))) as {
    rodadaId?: string;
    email?: string;
    nome?: string;
    telefone?: string;
    consentimento?: boolean;
  };
  const email = (corpo.email ?? "").trim().toLowerCase().slice(0, 160);
  const nome = (corpo.nome ?? "").trim().slice(0, 80) || null;

  if (!EMAIL_VALIDO.test(email)) {
    return NextResponse.json({ error: "Confere o e-mail, ele parece incompleto." }, { status: 400 });
  }

  // O TELEFONE E OPCIONAL, o e-mail nao.
  //
  // O e-mail e o canal de entrega dos textos, ou seja, a troca honesta da
  // tela: a pessoa da o endereco e recebe o que veio buscar. O telefone e para
  // a venda, que e interesse nosso, entao ele nao pode ser pedagio. Campo
  // obrigatorio a mais derruba a conversao da unica etapa que hoje converte.
  //
  // Vazio nao e erro: e a pessoa dizendo nao, e a rota segue com o e-mail.
  const telefoneCru = (corpo.telefone ?? "").trim();
  let telefone: string | null = null;
  if (telefoneCru) {
    const r = normalizarTelefone(telefoneCru);
    // Digitou e errou e diferente de nao digitar: aqui a pessoa QUER deixar o
    // telefone, entao guardar torto seria pior que recusar, porque o erro so
    // apareceria no dia de mandar a mensagem.
    if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
    telefone = r.e164;
  }

  // O consentimento so vale acompanhado de telefone: marcar a caixa sem
  // deixar numero nao autoriza nada, porque nao ha canal.
  const consentimentoEm = telefone && corpo.consentimento === true ? new Date() : null;

  // Telefone sem consentimento nao e guardado. A pessoa pode ter digitado e
  // mudado de ideia sobre a caixa, e guardar o numero assim mesmo seria
  // coletar dado para uma finalidade que ela recusou.
  if (telefone && !consentimentoEm) telefone = null;

  const ipHash = hashIp(extrairIp(req.headers));
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const jaDeixou = await prisma.demoRun.count({
    where: { ipHash, email: { not: null }, createdAt: { gte: desde } },
  });
  if (jaDeixou >= TETO_POR_IP_DIA) {
    return NextResponse.json({ error: "Já mandamos os textos para você hoje." }, { status: 429 });
  }

  // A rodada é procurada pelo id E pelo IP: sem o segundo filtro, alguém com
  // um id de rodada alheia receberia por e-mail o texto que outra pessoa
  // escreveu.
  const rodada = corpo.rodadaId
    ? await prisma.demoRun.findFirst({ where: { id: corpo.rodadaId, ipHash } })
    : await prisma.demoRun.findFirst({ where: { ipHash }, orderBy: { createdAt: "desc" } });

  if (!rodada || !rodada.output) {
    return NextResponse.json(
      { error: "Não achei o texto desta rodada. Gere de novo e tente outra vez." },
      { status: 404 }
    );
  }

  // A pessoa JA recebeu os textos desta rodada?
  //
  // O formulario tem duas etapas (nome e e-mail primeiro, telefone depois de
  // enviar), e as duas batem nesta rota, na MESMA rodada. Sem esta pergunta, a
  // segunda etapa mandaria o mesmo e-mail de novo, e o unico sinal seria a
  // pessoa recebendo duas vezes. A resposta vem do banco e nao de um campo do
  // corpo: campo que o cliente manda, o cliente escolhe.
  const jaRecebeu = Boolean(rodada.email);

  await prisma.demoRun.update({
    where: { id: rodada.id },
    data: {
      email,
      nome,
      // A segunda etapa nao pode APAGAR o que a primeira gravou: ela manda o
      // telefone e nao repete o resto.
      ...(telefone ? { telefone, consentimentoEm } : {}),
    },
  });

  // O passo do funil, com o que decide se o campo de telefone fica: quantos
  // deixam contato, e quantos deixam telefone junto. Nunca sobe erro (ver
  // registrarPasso): medir nao pode derrubar a entrega.
  await registrarPasso("contato", {
    ipHash,
    caminho: "/",
    meta: {
      telefone: Boolean(telefone),
      consentimento: Boolean(consentimentoEm),
      nome: Boolean(nome),
      // Qual etapa gerou este evento. Sem isto, a segunda etapa contaria como
      // um contato novo e a conversao da demo apareceria dobrada.
      etapa: jaRecebeu ? "telefone" : "email",
    },
  });

  const posts = rodada.output as { linkedin?: string; x?: string; instagram?: string };
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  const texto = [
    nome ? `Oi, ${nome}.` : "Oi.",
    "",
    "Aqui estão os três textos que o squad escreveu a partir do que você mandou.",
    "",
    "LINKEDIN",
    posts.linkedin ?? "",
    "",
    "X",
    posts.x ?? "",
    "",
    "INSTAGRAM",
    posts.instagram ?? "",
    "",
    "Isso saiu sem o squad saber nada sobre você. Dentro da plataforma ele estuda seu nicho, seu público e a sua voz, pesquisa o assunto antes de escrever, corta o seu vídeo e publica no dia certo.",
    "",
    `Sete dias grátis: ${base}/planos`,
    "",
    "demandou. postou.",
  ].join("\n");

  // O resultado do envio IMPORTA. `enviarEmail` nunca lanca, de proposito, e
  // ignorar o retorno era construir de novo a falha em silencio que este
  // projeto ja pagou tres vezes: a pessoa deixa o e-mail, a tela agradece, e
  // nada chega. Provado no caminho real em 08/09 (chegou na caixa de entrada,
  // vindo de contato@demandou.com); esta guarda existe para o dia em que
  // parar de chegar.
  if (jaRecebeu) {
    // Segunda etapa: o telefone entrou, os textos ja foram. Nada a enviar.
    return NextResponse.json({ ok: true, telefone: Boolean(telefone) });
  }

  const saiu = await enviarEmail({
    para: email,
    assunto: "Seus três textos, prontos para publicar",
    texto,
  });

  if (!saiu) {
    console.error(`[demo/contato] o e-mail para ${email} NAO saiu (rodada ${rodada.id})`);
    return NextResponse.json(
      { error: "Guardei seu contato, mas o e-mail não saiu agora. Vou mandar assim que voltar." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
