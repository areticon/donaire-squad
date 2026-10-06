export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { askClaude, askClaudeComImagem } from "@/lib/claude";
import { debitar, saldo, SaldoInsuficiente } from "@/lib/credits";
import { CREDIT_COSTS } from "@/lib/credits/tabela";
import { montarPrefixoCacheavel } from "@/lib/media/write-posts";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { NOME_DA_REDE } from "@/lib/pipeline/redes";
import { blocoDosLinks, lerLinks } from "@/lib/projeto/links-do-cliente";

/**
 * A LEGENDA DO CONTEÚDO PRONTO, pedida à IA (06/10/2026).
 *
 * Uma chamada só, na persona do projeto (nicho, público, tom de voz e os
 * links do cliente, o mesmo prefixo que os redatores da semana usam), com o
 * que o cliente escreveu sobre o conteúdo ("evento com os palestrantes X e Y
 * em 20/10", "promoção de carta de consórcio", "receita de bolo"). Devolve
 * UMA legenda, que o cliente edita na janela antes de salvar; nada aqui
 * grava post.
 *
 * A IA LÊ A IMAGEM (acréscimo do Bruno, 06/10 02h20): a janela manda junto a
 * primeira lâmina (ou o quadro de abertura do vídeo) reduzida a JPEG, e a
 * mesma chamada que escreve a legenda olha a peça: o que está escrito na
 * arte (nome do evento, data, preço) entra na legenda sem o cliente ter que
 * digitar de novo. É UMA chamada de visão (Sonnet, ~US$ 0,01), só quando o
 * cliente pede a legenda, gravada em ai_usage na operação
 * `legenda_conteudo_pronto`. Não gera nem edita imagem nenhuma.
 *
 * Custa o que a esteira cobra por texto (`CREDIT_COSTS.post_text`), pelo
 * mesmo `debitar`: operação de IA fora do extrato é prejuízo invisível. O
 * saldo é conferido antes da chamada, e a cobrança só sai depois de a
 * legenda passar na guarda de texto.
 */
const MAX_IMAGEM_BASE64 = 1_400_000; // ~1 MB de JPEG, o que a janela manda em 1024 px

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const projeto = await prisma.project.findUnique({
    where: { id },
    select: { id: true, userId: true, name: true, niche: true, targetAudience: true, voice: true, config: true },
  });
  if (!projeto || !(await podeUsarProjeto(userId, projeto))) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const b = (await req.json().catch(() => ({}))) as { descricao?: unknown; tipo?: unknown; redes?: unknown; arquivos?: unknown; imagem?: unknown };
  const descricao = typeof b.descricao === "string" ? b.descricao.trim().slice(0, 1000) : "";
  if (!descricao) return NextResponse.json({ error: "Conte em uma ou duas frases o que é este conteúdo: a IA escreve a legenda a partir disso." }, { status: 400 });
  const tipo = b.tipo === "video" ? "vídeo" : b.tipo === "carousel" ? "carrossel de imagens" : "imagem";
  const redes = [...new Set((Array.isArray(b.redes) ? b.redes : []).filter((r): r is string => typeof r === "string").map((r) => r.toLowerCase()))];
  const nomes = redes.map((r) => NOME_DA_REDE[r] ?? r);
  const nomesDosArquivos = (Array.isArray(b.arquivos) ? b.arquivos : []).filter((a): a is string => typeof a === "string").slice(0, 10);
  // A imagem: só JPEG em base64 puro, até o teto. Qualquer outra coisa é ignorada.
  const imagem = typeof b.imagem === "string" && b.imagem.length > 0 && b.imagem.length <= MAX_IMAGEM_BASE64 && /^[A-Za-z0-9+/=]+$/.test(b.imagem) ? b.imagem : null;

  const custo = CREDIT_COSTS.post_text;
  const disponivel = await saldo(userId);
  if (disponivel < custo) {
    return NextResponse.json({ error: `A legenda pela IA custa ${custo} créditos e você tem ${disponivel}.`, necessario: custo, disponivel }, { status: 402 });
  }

  const temRedeDeHashtag = redes.some((r) => r === "instagram" || r === "tiktok");
  const sistema = [
    `Você é Lucas, redator do squad. Escreve a legenda de uma peça que o PRÓPRIO cliente fez (arte ou vídeo pronto). ${imagem ? `Você está vendo ${tipo === "vídeo" ? "o quadro de abertura do vídeo" : tipo === "carrossel de imagens" ? "a primeira lâmina do carrossel" : "a arte"}: leia o que está escrito nela (nome, data, preço, chamada) e use, sem inventar o que não está lá.` : "Você não viu a peça: escreve só com o que ele contou."} Nunca use travessão: use vírgula, dois-pontos ou parênteses.`,
    "",
    montarPrefixoCacheavel(
      { nicho: projeto.niche, publico: projeto.targetAudience, voz: projeto.voice, links: blocoDosLinks(lerLinks(projeto.config)) },
      { tresRedes: false }
    ),
  ].join("\n");
  const pedido = `Escreva UMA legenda para esta peça, que vai sair como ${tipo}${nomes.length ? ` em ${nomes.join(", ")}` : ""}.

O que o cliente contou sobre a peça:
"""
${descricao}
"""
${nomesDosArquivos.length ? `Arquivos: ${nomesDosArquivos.join(", ")}` : ""}

Regras:
- Entre 300 e 900 caracteres. A primeira linha é o gancho e precisa segurar sozinha.
- Use SÓ o que o cliente contou${imagem ? " e o que está escrito na peça" : ""}: nomes, datas, lugares e números vêm dali, nunca de você. Se ninguém disse a data, não invente.
- Não descreva a imagem nem o vídeo ("na foto acima", "neste vídeo"): quem lê já está vendo.
- Nada de "neste post", "é fundamental", "no mundo de hoje" nem abertura que serviria para qualquer peça.
- Parágrafos curtos, linha em branco entre eles. Fecha com um convite concreto quando o cliente contou o que a pessoa deve fazer (inscrever-se, chamar, visitar); senão, fecha com a ideia.
- ${temRedeDeHashtag ? "No máximo 3 hashtags, só na última linha." : "Sem hashtag."}
- Devolva só a legenda, sem título, sem aspas e sem explicar o que fez.`;
  const opcoes = { maxTokens: 4000, usage: { projectId: projeto.id, operation: "legenda_conteudo_pronto" }, timeoutMs: 45_000 };
  const bruto = imagem ? await askClaudeComImagem(sistema, pedido, imagem, "image/jpeg", opcoes) : await askClaude(sistema, pedido, opcoes);

  const limpo = pecaPublicavel(bruto);
  if ("recusado" in limpo) return NextResponse.json({ error: `A legenda não passou na guarda de texto (${limpo.recusado}). Tente de novo com outra descrição.` }, { status: 422 });
  const legenda = limpo.texto.replace(/\s*[—–]\s*/g, ", ").trim();

  try {
    await debitar({
      userId,
      quantidade: custo,
      operation: "legenda_conteudo_pronto",
      projectId: projeto.id,
      note: `Legenda pela IA para conteúdo pronto (${tipo})`,
    });
  } catch (e) {
    if (e instanceof SaldoInsuficiente) return NextResponse.json({ error: e.message, necessario: custo, disponivel }, { status: 402 });
    throw e;
  }

  return NextResponse.json({ legenda, creditos: custo });
}
