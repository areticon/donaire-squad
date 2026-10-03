import { podeUsarProjeto } from "@/lib/equipe/conta";
import { prisma } from "@/lib/db/prisma";
import { fichaDoAgente, ESPECIALISTA_DA_REDE } from "@/lib/squad/definicoes-dos-agentes";
import { askClaude } from "@/lib/claude";
import { NOME_DA_REDE } from "@/lib/pipeline/redes";
import { pecaPublicavel } from "@/lib/pipeline/guarda-de-texto";
import { debitar, saldo, SaldoInsuficiente } from "@/lib/credits";
import { custoDeRefazerPeca } from "@/lib/credits/estimativa";
import { decidirCortesia, cortesiasDeHoje, reprovadaPelaRevisora } from "@/lib/credits/cortesia";
import { FORMATO_DA_REDE } from "@/lib/pipeline/levar-para-outra-rede";
import { produzirArtePorRede } from "@/lib/media/arte-por-rede";
import { generateImage } from "@/lib/media/nano-banana";
import { desenharComFraseEmCodigo, marcaDaArte, promptDaArteSemTexto } from "@/lib/media/arte-com-frase";
import { mancheteDaPeca } from "@/lib/media/peca-de-feed";
import { desenharInfografico, extrairConteudoDoInfografico } from "@/lib/media/infographic";
import { lerNaoCitar } from "@/lib/pipeline/restricoes";

/**
 * REFAZER UMA PEÇA, e não a campanha inteira.
 *
 * Pedido do Bruno em 21/09. O botão "Recomeçar com tema" lia o tema da
 * execução e abria a JANELA DE CAMPANHA NOVA com ele preenchido: sete dias
 * inteiros para trocar uma peça. O nome prometia uma coisa e o botão fazia
 * outra, e ele ainda morava ao lado de "Arquivar campanha".
 *
 * As partes do conserto já existiam espalhadas: o chat do card EDITA texto e
 * arte com uma instrução, e `refazerCorte`/`refazerCapa` refazem mídia de
 * vídeo. O que faltava era o caminho de UMA PEÇA que escreve de novo, do zero,
 * para aquele dia e aquela rede.
 *
 * TRÊS REGRAS QUE VIERAM DO PEDIDO, e cada uma evita um defeito conhecido:
 *
 *   1. **cobra de novo.** Refazer é entrega nova: uma redação e, quando a peça
 *      tem arte, uma geração. A conta sai de `custoDeRefazerPeca`, a MESMA que
 *      a tela mostra antes do clique. Duas contas para a mesma pergunta foi o
 *      que fez a janela dizer 688 e o servidor cobrar 1.092 em 21/09;
 *   2. **substitui no lugar.** O post refeito é o MESMO post, atualizado. Foi
 *      criando peça nova a cada geração que o calendário do Bruno chegou a
 *      dezesseis posts no mesmo dia;
 *   3. **não mexe no que já saiu.** Post publicado não se refaz: o que está no
 *      ar não muda porque a plataforma reescreveu o rascunho dela.
 *
 * O texto novo nasce da MESMA pesquisa da campanha (guardada na execução), e
 * não de uma busca nova: a peça refeita precisa continuar conversando com o
 * resto da semana, e pesquisar de novo daria um dia com outro fio condutor.
 */

export type FalhaAoRefazer =
  | { erro: "nao_encontrado" }
  | { erro: "ja_publicado" }
  | { erro: "rede_desconhecida" }
  | { erro: "sem_saldo"; necessario: number; disponivel: number; mensagem?: string }
  | { erro: "texto_recusado"; motivo: string };

/** A pesquisa que a ordem 0 da campanha guardou, e que todo dia relê. */
type PesquisaGuardada = { brief?: string; bruta?: string; fontes?: Array<{ title: string; url: string }> };

/** Os tipos cuja mídia é uma arte gerada, e que por isso a Diana refaz junto. */
const GERA_ARTE = new Set(["image", "infographic", "carousel"]);

export async function refazerPeca(args: {
  postId: string;
  userId: string;
  /**
   * O que o cliente quer diferente, quando ele disse. Opcional de propósito:
   * "refazer" sem instrução é um pedido legítimo ("essa não ficou boa"), e
   * exigir um motivo seria transformar um clique num formulário.
   */
  instrucao?: string;
}): Promise<
  | { ok: true; post: { id: string; content: string; imageUrl: string | null }; custo: number; arteRefeita: boolean; cortesia?: string }
  | ({ ok: false } & FalhaAoRefazer)
> {
  const post = await prisma.post.findUnique({
    where: { id: args.postId },
    include: {
      project: { select: { id: true, userId: true, name: true, niche: true, voice: true, colorPalette: true } },
      run: { select: { id: true, topic: true, pesquisa: true, config: true } },
    },
  });
  // Dono ou membro da equipe com o projeto liberado (01/10).
  if (!post || !(await podeUsarProjeto(args.userId, post.project))) return { ok: false, erro: "nao_encontrado" };

  // Publicado e publicando ficam de fora: o que está no ar não se reescreve
  // por aqui. Para trocar uma peça publicada, o caminho é arquivar e fazer
  // outra, que é uma decisão diferente e visível.
  if (post.status === "published" || post.status === "publishing") {
    return { ok: false, erro: "ja_publicado" };
  }

  const formato = FORMATO_DA_REDE[post.platform];
  if (!formato) return { ok: false, erro: "rede_desconhecida" };

  const laminas = (post.imageUrl ?? "").split("|").filter((u) => u.trim().length > 10).length;
  const custo = custoDeRefazerPeca({ mediaType: post.mediaType, laminas });

  /**
   * PEÇA REPROVADA NÃO COBRA PARA SER REFEITA (card 525, 22/09).
   *
   * Reprovação é a plataforma dizendo, com a própria boca, que aquilo não
   * deveria ter saído assim. Cobrar a correção de um defeito reconhecido é
   * vender o conserto do próprio erro, e foi o que o Bruno apontou testando
   * como dono. A política inteira, com o porquê do teto, está em
   * lib/credits/cortesia.ts.
   */
  const cortesia = decidirCortesia(
    {
      status: post.status,
      reprovadaPelaRevisora: await reprovadaPelaRevisora({ runId: post.runId, dayOfWeek: post.dayOfWeek }),
    },
    await cortesiasDeHoje(post.projectId)
  );

  const disponivel = await saldo(args.userId);
  // Sem cobrança não se confere saldo: exigir crédito para consertar o nosso
  // erro seria a mesma cobrança com outro nome.
  if (!cortesia && disponivel < custo) return { ok: false, erro: "sem_saldo", necessario: custo, disponivel };

  const pesquisa = (post.run?.pesquisa ?? null) as PesquisaGuardada | null;
  const brief = pesquisa?.brief ?? "";
  const restricoes = await lerNaoCitar(post.projectId);

  /**
   * ESCREVER DE NOVO, e não editar o que está lá.
   *
   * O texto atual entra como o que NÃO repetir, e não como base: quem pede
   * para refazer já leu aquilo e não gostou. Editar devolveria a mesma peça
   * com outras palavras, que é o que o chat do card faz (e faz bem, quando a
   * instrução é específica).
   */
  const bruto = await askClaude(
    `Você é ${fichaDoAgente(ESPECIALISTA_DA_REDE[post.platform] ?? "lucas-linkedin")?.name ?? "Lucas LinkedIn"}, redator do squad da ${post.project.name}.
Tom de voz: ${post.project.voice ?? "profissional e direto"}. Nicho: ${post.project.niche ?? "negócios"}.
Nunca use travessão: use vírgula, dois-pontos, ponto e vírgula ou parênteses.
REGRA DE OURO: nunca invente dados, estatísticas, fontes nem promessas de mídia.${
      restricoes.length ? `\nNUNCA cite, em hipótese nenhuma: ${restricoes.join(", ")}.` : ""
    }`,
    `Escreva DE NOVO, do zero, a peça de ${NOME_DA_REDE[post.platform] ?? post.platform} deste dia.
- ${formato.instrucao}
- Mesma tese e mesmo tema do dia; o que muda é a execução: outro gancho, outra estrutura, outros exemplos.
- Use apenas fatos que estejam na pesquisa abaixo ou no texto atual. Não acrescente números novos.
- Não prometa mídia que a peça não tem: nada de "vídeo nos comentários", "gravei", "link na bio".
- NADA DE MARKDOWN: nenhuma rede renderiza ** ou ##, e o asterisco sai na cara do post. Para destacar, use a quebra de linha e a frase curta.
- Devolva SÓ o texto final, sem comentário e sem explicar o que mudou.
${args.instrucao ? `\nO QUE O CLIENTE PEDIU: ${args.instrucao}\n` : ""}
TEMA DA CAMPANHA: ${post.run?.topic ?? "(sem tema registrado)"}

TEXTO ATUAL (é o que ele NÃO quer de volta, use só como referência do assunto):
${post.content}
${brief ? `\n=== PESQUISA DA CAMPANHA ===\n${brief.slice(0, 12_000)}\n=== FIM DA PESQUISA ===` : ""}`,
    {
      maxTokens: 8000,
      usage: { operation: "refazer_peca", projectId: post.projectId, runId: post.runId ?? undefined },
    }
  );

  // A mesma guarda da esteira: o que volta como bastidor não vira peça. Foi
  // changelog de redator colado no fim do texto que publicou duas threads
  // cortadas no meio em 21/09.
  const limpo = pecaPublicavel(bruto);
  if ("recusado" in limpo) return { ok: false, erro: "texto_recusado", motivo: limpo.recusado };

  /**
   * A ARTE SAI JUNTO quando a peça tem arte.
   *
   * Uma geração só, e na proporção da rede DESTA peça: refazer a peça do
   * Instagram não redesenha a arte do LinkedIn, que continua aprovada. É a
   * diferença entre refazer uma peça e refazer o dia.
   */
  let novaImagem: string | null = null;
  let arteRefeita = false;
  if (GERA_ARTE.has(post.mediaType ?? "")) {
    try {
      /**
       * TEXTO EM ARTE É CÓDIGO (30/09): a manchete sai do texto novo, a cena
       * sai sem letra nem gente, e o infográfico é montado em código com os
       * dados do texto novo. Ver lib/media/arte-com-frase.tsx.
       */
      const marca = await marcaDaArte(post.projectId);
      const ehInfografico = post.mediaType === "infographic";
      const conteudo = ehInfografico && process.env.GEMINI_API_KEY
        ? await extrairConteudoDoInfografico(limpo.texto, post.project.niche ?? "negocios", process.env.GEMINI_API_KEY)
        : null;
      const peca = conteudo
        ? null
        : await mancheteDaPeca({
            textoDoPost: limpo.texto,
            estiloVisual: post.imagePrompt ?? "",
            nicho: post.project.niche,
            projectId: post.projectId,
            runId: post.runId ?? undefined,
          });
      const arte = await produzirArtePorRede({
        redes: [post.platform],
        contentType: ehInfografico ? "infographic" : post.mediaType === "carousel" ? "carousel" : "image",
        promptBase: peca ? promptDaArteSemTexto({ visual: peca.visual, estilo: post.imagePrompt ?? undefined, marca }) : "",
        textoEsperado: peca ? [peca.manchete] : undefined,
        textoDoPost: limpo.texto,
        projectId: post.projectId,
        runId: post.runId ?? undefined,
        desenhar: conteudo
          ? async (_p, proporcao) => {
              const url = await desenharInfografico(conteudo, "", proporcao, { estilo: "", paleta: "", marca });
              if (!url) throw new Error("o infográfico não foi montado");
              return url;
            }
          : desenharComFraseEmCodigo(peca!.manchete, marca, (prompt, proporcao) => generateImage(prompt, proporcao, "hd")),
      });
      novaImagem = arte.principal ?? null;
      arteRefeita = Boolean(novaImagem);
    } catch {
      // Arte que não saiu não derruba o texto que saiu: a peça fica com a arte
      // anterior e o cliente decide se pede de novo. Perder o texto novo por
      // causa do desenho seria cobrar duas vezes pelo mesmo trabalho.
    }
  }

  try {
    await debitar({
      // Quem pediu paga pela conta (01/10): marca o membro e conta no teto dele.
      userId: args.userId,
      quantidade: custo,
      operation: "refazer_peca",
      projectId: post.projectId,
      refId: `${post.id}:${Date.now()}`,
      note: `Peça de ${NOME_DA_REDE[post.platform] ?? post.platform} refeita${arteRefeita ? " com arte nova" : ""}`,
      cortesia: cortesia ?? undefined,
    });
  } catch (e) {
    // O teto do membro e a cota da equipe (01/10) chegam com a frase pronta, que diz a quem pedir.
    if (e instanceof SaldoInsuficiente) return { ok: false, erro: "sem_saldo", necessario: custo, disponivel, mensagem: e.equipe ? e.message : undefined };
    throw e;
  }

  const metadata = (post.metadata as Record<string, unknown> | null) ?? {};
  const atualizado = await prisma.post.update({
    where: { id: post.id },
    data: {
      content: limpo.texto,
      ...(novaImagem ? { imageUrl: novaImagem } : {}),
      /**
       * A PEÇA REFEITA VOLTA A SER RASCUNHO.
       *
       * Ela pode estar reprovada (o cliente recusou e mandou refazer, que é o
       * caminho natural) ou agendada. Nos dois casos o texto é outro, então a
       * decisão anterior não vale mais: quem aprovou não aprovou isto, e quem
       * reprovou reprovou outra coisa. Sair da fila é parte disso.
       */
      status: "draft",
      scheduledAt: post.scheduledAt,
      metadata: {
        ...metadata,
        refeitoEm: new Date().toISOString(),
        // O erro da tentativa antiga não sobrevive ao texto novo, que é a
        // mesma regra de 21/09: estado que sobrevive ao fato vira mentira.
        error: undefined,
      } as never,
    },
    select: { id: true, content: true, imageUrl: true },
  });

  /**
   * O CARD ACOMPANHA A PEÇA. Sem isto, a prévia do calendário continuaria
   * mostrando o texto antigo, e o cliente leria que nada aconteceu.
   */
  if (post.runId && post.dayOfWeek) {
    const tipoDoCard = post.platform === "twitter" ? "post_twitter" : "post_linkedin";
    await prisma.campaignCard
      .updateMany({
        where: { runId: post.runId, dayOfWeek: post.dayOfWeek, cardType: tipoDoCard, postId: post.id },
        data: { content: limpo.texto, ...(novaImagem ? { mediaUrl: novaImagem } : {}) },
      })
      .catch(() => {});
  }

  // O custo devolvido e o COBRADO, e nao o de tabela: a tela que diz "custou
  // 57" depois de nao cobrar nada estaria mentindo para o cliente sobre o
  // proprio extrato dele.
  return { ok: true, post: atualizado, custo: cortesia ? 0 : custo, arteRefeita, cortesia: cortesia?.motivo };
}
