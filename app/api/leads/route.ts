export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { origemDoCookie, registrarPasso } from "@/lib/funil/eventos";
import { lembrarLead } from "@/lib/agenda/lead";
import { conferirEnvio } from "@/lib/anti-robo/porta";
import { lerProva } from "@/lib/anti-robo/regras";

/**
 * A CAPTURA DE LEAD DA LANDING.
 *
 * Nasce da decisão de 19/09 de rodar campanha forte de anúncios com meta de
 * 5.000 leads na primeira semana.
 *
 * TRÊS PERGUNTAS, e não cinco. A dosagem é decisão de produto, tomada com o
 * número na frente: numa campanha fria cada campo a mais corta conversão, e o
 * que está DEPOIS do cadastro já foi ganho.
 *
 * AS PERGUNTAS MUDARAM NO MESMO DIA EM QUE NASCERAM, e a correção é de
 * premissa. A primeira versão perguntava "o que você vende?", e isso pressupõe
 * que a pessoa vende alguma coisa: um pastor não vende, um professor não
 * vende. A pergunta certa é o que a pessoa FAZ, e a resposta não cabe em três
 * botões, cabe numa linha escrita por ela.
 *
 * AS RESPOSTAS SÃO TODAS OPCIONAIS, e o e-mail não. Um lead com e-mail e sem
 * ficha vale muito mais que nenhum lead: barrar o cadastro por causa de uma
 * resposta de múltipla escolha é trocar conversão por um campo de banco.
 */

const CRIA = ["toda_semana", "as_vezes", "parei", "nunca"];
const OBJETIVO = ["clientes", "autoridade", "alcance", "constancia"];
const CTA = ["hero", "navbar", "demo", "preco", "formatos", "rodape", "equipe", "referencias", "valor", "demanda-day", "oferecemos"];

function daLista(valor: unknown, lista: string[]): string | null {
  return typeof valor === "string" && lista.includes(valor) ? valor : null;
}

/** Um e-mail plausível. Não valida existência: isso quem faz é o envio. */
function emailValido(v: unknown): v is string {
  return typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 200;
}

export async function POST(req: NextRequest) {
  try {
    const corpo = await req.json();
    const email = typeof corpo?.email === "string" ? corpo.email.trim().toLowerCase() : "";
    if (!emailValido(email)) {
      return NextResponse.json({ error: "Preciso de um e-mail válido para mandar o acesso." }, { status: 400 });
    }

    // A DEFESA CONTRA ROBÔ (01/10): esta rota não tinha limite nenhum. Agora
    // passa pela mesma porta do cadastro, com isca, tempo mínimo e limite.
    const porta = await conferirEnvio({ porta: "lead", headers: req.headers, prova: lerProva(corpo?.antiRobo), email });
    if (!porta.ok) return NextResponse.json({ error: porta.mensagem }, { status: porta.status });

    const o = await origemDoCookie();
    // `faz` é texto livre, então ele é o único que precisa de poda: 120
    // caracteres cobrem qualquer profissão e fecham a porta para alguém colar
    // um texto inteiro no campo.
    const faz = typeof corpo?.faz === "string" ? corpo.faz.trim().slice(0, 120) : "";
    const dados = {
      faz: faz.length ? faz : null,
      cria: daLista(corpo?.cria, CRIA),
      objetivo: daLista(corpo?.objetivo, OBJETIVO),
      cta: daLista(corpo?.cta, CTA),
      origem: o.origem ?? null,
      campanha: o.campanha ?? null,
    };

    /**
     * O MESMO E-MAIL VOLTANDO ATUALIZA, e não vira uma segunda linha.
     *
     * Quem chega por dois anúncios diferentes é UMA pessoa. Sem o `upsert`, a
     * contagem da primeira semana mentiria para cima justamente na semana em
     * que ela decide se o tráfego pago continua.
     *
     * A ORIGEM SÓ É GRAVADA SE AINDA NÃO HOUVER UMA: a primeira visita é a que
     * paga o CAC, e sobrescrever com a última apagaria o anúncio que trouxe a
     * pessoa e daria o crédito ao que ela clicou depois.
     */
    const lead = await prisma.lead.upsert({
      where: { email },
      create: { email, ...dados },
      update: {
        // `?? undefined` e não `?? null`: quem volta e responde menos que da
        // primeira vez não pode APAGAR o que já tinha respondido.
        faz: dados.faz ?? undefined,
        cria: dados.cria ?? undefined,
        objetivo: dados.objetivo ?? undefined,
        cta: dados.cta ?? undefined,
      },
      select: { id: true, createdAt: true, updatedAt: true },
    });

    // O funil não distingue "lead novo" de "lead que voltou" pelo evento, e sim
    // pela meta: os dois são contatos, e contar só o primeiro esconderia o
    // retorno, que é sinal de intenção.
    const novo = lead.createdAt.getTime() === lead.updatedAt.getTime();
    await registrarPasso("contato", {
      caminho: "/",
      meta: { fonte: "landing", novo, ...dados },
    });

    // O AGENDAMENTO (01/10): quem deixou o e-mail aqui chega à demonstração
    // identificado (cookie httpOnly com o id assinado) e preenche só o que falta.
    return lembrarLead(NextResponse.json({ ok: true, novo }), lead.id);
  } catch (err) {
    console.error("[leads] falhou:", err);
    return NextResponse.json({ error: "Não consegui guardar agora. Tente de novo." }, { status: 500 });
  }
}
