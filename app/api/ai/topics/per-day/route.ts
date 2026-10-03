export const dynamic = 'force-dynamic'

/**
 * 120 segundos, declarados, e não o padrão da plataforma.
 *
 * MEDIDO EM 18/09, reproduzindo a rota com o projeto real do Bruno:
 *
 *   Gemini com Google Search   10,5 s
 *   Claude montando os temas   10,7 s
 *   total                      21,2 s
 *
 * Sem `maxDuration` a função cai no teto padrão da Vercel, que é menos que
 * isso, e ela **morria por timeout todas as vezes**. O `vercel.json` só
 * estendia o teto de `app/api/videos/**`, e esta rota nunca esteve coberta.
 *
 * O sintoma que o Bruno relatou foi "clico em Sugerir todos com IA, roda e nada
 * acontece". Nada acontecia mesmo: a função era morta no meio, e a tela engolia
 * o erro num `catch {}` vazio. **Duas decisões separadas conspiraram para tornar
 * a falha invisível**: um teto de tempo que ninguém declarou e um catch que
 * ninguém escreveu para ser lido.
 */
export const maxDuration = 120

import { auth } from "@/lib/auth/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { radarDaSemana, temasJaUsados, blocosDeNovidade, REGRAS_DE_NOVIDADE, repeteAlgum } from "@/lib/research/radar-da-semana";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { blocoDoEstudoDosPerfis } from "@/lib/referencias/estudo-na-campanha";

interface DayInput {
  dayOfWeek: string; // "1"-"7"
  dayName: string;
  contentType: string;
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, days, evitar, rejeitado, funnelStage } = (await req.json()) as {
    projectId: string;
    days: DayInput[];
    /**
     * O estagio do funil escolhido na janela (21/09).
     *
     * Sem ele o sugeridor devolvia sempre o mesmo tipo de tema, e o dia de
     * FUNDO de funil recebia uma pauta educativa que nao convida ninguem. Tema
     * e estagio sao a mesma decisao: o que se fala muda com quem esta lendo.
     */
    funnelStage?: "tofu" | "mofu" | "bofu";
    /**
     * Temas que já estão na tela e NÃO devem ser repetidos. Chega quando a
     * pessoa pede outro tema para um dia só (18/09): sem esta lista, a IA
     * devolvia para a quarta o mesmo assunto que já estava na terça, e trocar
     * um tema por outro igual ao do vizinho não é ajuste.
     */
    evitar?: string[];
    /**
     * O tema que está no campo AGORA e que a pessoa quer trocar. Ele precisa
     * chegar separado dos outros: sem isso a IA não sabe o que ela recusou e
     * devolve o mesmo assunto, que foi o que o Bruno viu em 18/09 ("carrega,
     * fala que gera, mas nada").
     */
    rejeitado?: string;
  };
  if (!projectId || !Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: "projectId and days required" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true, niche: true, targetAudience: true, voice: true, name: true,
      posts: { select: { content: true }, orderBy: { createdAt: "desc" }, take: 5 },
      /**
       * OS DOCUMENTOS DO PROJETO, que este sugeridor nunca leu (21/09).
       *
       * Queixa do Bruno: "quando eu gero as campanhas so fala de IA gerando
       * conteudo, as sugestoes sao sempre nessa linha". A causa estava aqui: o
       * prompt recebia `niche` e `targetAudience` e mais nada, e o nicho da
       * Demandou comeca com "criacao e publicacao de conteudo com agentes de
       * inteligencia artificial". O sugeridor fazia o que foi mandado fazer.
       *
       * Com os documentos, ele passa a ver a DOR que a marca resolve, a
       * municao com fonte e os territorios de pauta, que e o que decide um
       * tema bom.
       */
      contexts: { where: { status: "pronto" }, select: { title: true, compiled: true } } },
  });

  if (!project || !(await podeUsarProjeto(userId, project))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const recentTopics = project.posts.map((p) => p.content.slice(0, 60)).join("; ");

  /**
   * NOVIDADE E MEMÓRIA, no lugar da "tendência do nicho" (28/09). O radar olha
   * os últimos 14 dias do mundo do público, com datas, e fica guardado por seis
   * horas; a memória traz os temas das últimas oito semanas, que não voltam.
   * Ver lib/research/radar-da-semana.ts para as quatro causas da repetição.
   */
  const [radar, usados] = await Promise.all([
    radarDaSemana({
      projectId,
      nicho: project.niche ?? "geral",
      publico: project.targetAudience ?? "profissionais",
    }).catch(() => null),
    temasJaUsados(projectId),
  ]);
  const trendingBlock = `\n${blocosDeNovidade(radar, usados)}\n`;

  /**
   * O ESTUDO DOS PERFIS (03/10): o que rende no perfil do cliente e nas
   * referências, o de-para, a linha editorial, as tendências que combinam e
   * as regras aprovadas de roteiro e texto. Antes os temas da campanha "tudo
   * com IA" não liam nada disso. Ver lib/referencias/estudo-na-campanha.ts.
   */
  const blocoDoEstudo = await blocoDoEstudoDosPerfis(projectId, { comRegras: true });

  const daysBlock = days
    .map((d) => `- ${d.dayName} (${d.contentType === "image" ? "post com imagem" : d.contentType === "poll" ? "enquete" : d.contentType === "infographic" ? "infográfico" : d.contentType === "video" ? "vídeo" : "post de texto"})`)
    .join("\n");

  // Os temas que já estão na tela, para a IA não devolver o mesmo assunto do
  // dia vizinho quando a pessoa pede outro tema para um dia só.
  const evitarBloco =
    Array.isArray(evitar) && evitar.length > 0
      ? [
          "JÁ ESCOLHIDOS para outros dias desta mesma campanha, não repita nem faça variação do mesmo ângulo:",
          ...evitar.map((t) => `- ${String(t).slice(0, 160)}`),
        ].join("\n")
      : "";

  const blocoRejeitado = rejeitado?.trim()
    ? [
        "",
        "TEMA RECUSADO PELO CLIENTE, não repita e não faça variação dele:",
        `- ${rejeitado.trim().slice(0, 240)}`,
        "Mude o ÂNGULO, não a redação: outro recorte do nicho, outro tipo de abertura, outro exemplo. Se o tema recusado era sobre uma ferramenta, fale de processo; se era sobre processo, fale de um caso concreto.",
      ].join("\n")
    : "";

  /**
   * O CONTEXTO DA MARCA, resumido para caber no pedido.
   *
   * Um trecho por documento, e não o documento inteiro: são até 8.000
   * caracteres no total, o suficiente para a tese e as dores chegarem sem
   * transformar uma chamada de sugestão numa chamada de campanha.
   */
  const docs = (project.contexts ?? [])
    .map((c) => `## ${c.title}\n${(c.compiled ?? "").slice(0, 4000)}`)
    .join("\n\n")
    .slice(0, 8000);
  const blocoDaMarca = docs
    ? `\n=== O QUE ESTA MARCA DEFENDE (use como matéria-prima dos temas) ===\n${docs}\n=== FIM ===\n`
    : "";

  /**
   * O ESTÁGIO DO FUNIL, que muda o tipo de tema e não só o texto depois.
   *
   * Um tema de topo é uma dor com nome; um de meio é um método; um de fundo é
   * uma decisão. Pedir "um tema" sem dizer isso devolve sempre o mesmo tipo de
   * pauta educativa, que foi o que o Bruno viu.
   */
  const porFunil =
    funnelStage === "bofu"
      ? "ESTÁGIO: FUNDO DE FUNIL. Os temas são de DECISÃO: comparação honesta com a alternativa que o público usa hoje, objeção real (preço, tempo, esforço), prova, caso, o que ele ganha ao contratar. Aqui o produto pode ser o assunto."
      : funnelStage === "mofu"
        ? "ESTÁGIO: MEIO DE FUNIL. Os temas são de MÉTODO: como fazer, passo a passo, ferramenta, critério de escolha, o que medir, erro comum. O leitor já reconhece o problema e quer executar."
        : "ESTÁGIO: TOPO DE FUNIL. Os temas são DORES com nome e custo, e a direção da saída. Não são sobre a categoria do produto nem sobre a tecnologia: são sobre o que o público perde hoje e por quê.";

  const prompt = `Você é um estrategista de conteúdo. Sugira UM tema específico e atual para cada dia abaixo.
Projeto: ${project.name} | Nicho: ${project.niche} | Público: ${project.targetAudience}
${recentTopics ? `Temas recentes (evite repetir): ${recentTopics}` : ""}
${evitarBloco}${blocoRejeitado}
${blocoDaMarca}${trendingBlock}${blocoDoEstudo}
${porFunil}

Dias para gerar tema:
${daysBlock}

REGRAS:
- O tema é sobre o PROBLEMA DO PÚBLICO e o que ele ganha resolvendo, não sobre a categoria do produto nem sobre a tecnologia que o resolve. Um tema que só existe porque a ferramenta existe é tema ruim.
- Os documentos acima dão a dor, a tese e o território; a pauta da semana vem do radar (ver REGRAS DE NOVIDADE).
- Cada tema deve ser diferente dos outros (ângulos distintos)
- Se houver ESTUDO DOS PERFIS acima, os temas seguem os pilares da linha editorial e o que rende (formato, gancho, fechamento); o número do estudo nunca vira tema nem fato do post

${REGRAS_DE_NOVIDADE}
- Temas devem ser específicos, não genéricos
- Adapte ao formato do dia (imagem = visual e impactante, enquete = polarizante, etc.)

FORMATO DA RESPOSTA, uma linha por dia, sem markdown, sem numeração, sem comentários:
${days.map((d) => `${d.dayOfWeek}|tema para ${d.dayName}`).join("\n")}

A primeira coisa da linha é o número do dia, depois uma barra vertical, depois o tema. Nada antes da primeira linha e nada depois da última.`;

  /**
   * O parse, com as duas coisas que faltavam.
   *
   * O Bruno relatou em 18/09 que "para gerar os temas falhou várias vezes
   * antes de dar certo". O caminho antigo era `JSON.parse` de um regex guloso,
   * dentro de um `try` que virava 500: qualquer frase antes do JSON, qualquer
   * cerca de markdown, qualquer vírgula sobrando, e a chamada inteira morria
   * depois de 21 segundos de espera.
   */
  function lerTemas(texto: string): Record<string, string> | null {
    const temas: Record<string, string> = {};

    /**
     * LINHAS `1|tema`, que é o formato que o prompt pede desde 18/09.
     *
     * Antes o formato era JSON, e ele falhava de vez em quando: o tema é uma
     * frase escrita por um modelo, com aspas, dois-pontos e travessões dentro,
     * e basta uma aspa não escapada para o objeto inteiro virar lixo. Numa
     * medição de três chamadas de sete dias, uma morreu assim.
     *
     * Uma linha por dia não tem esse problema: não há nada para escapar.
     */
    for (const linha of texto.split("\n")) {
      const m = linha.match(/^\s*"?([1-7])"?\s*[|:]\s*(.+?)\s*$/);
      if (!m) continue;
      const tema = m[2].replace(/^["'\s]+|["',\s]+$/g, "").trim();
      if (tema.length > 5) temas[m[1]] = tema;
    }
    if (Object.keys(temas).length > 0) return temas;

    // RESERVA: JSON, para a resposta que vier no formato antigo.
    const candidatos = [texto.trim(), texto.match(/\{[\s\S]*\}/)?.[0] ?? ""];
    for (const c of candidatos) {
      if (!c.trim()) continue;
      try {
        const obj = JSON.parse(c.replace(/^```(?:json)?/i, "").replace(/```$/i, "")) as Record<string, unknown>;
        for (const [k, v] of Object.entries(obj)) {
          if (typeof v === "string" && v.trim()) temas[k] = v.trim();
        }
        if (Object.keys(temas).length > 0) return temas;
      } catch {
        // tenta o próximo candidato
      }
    }
    return null;
  }

  // DUAS TENTATIVAS. A segunda custa mais uns segundos e evita mandar a pessoa
  // clicar de novo depois de esperar meio minuto.
  let temas: Record<string, string> | null = null;
  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= 2 && !temas; tentativa++) {
    try {
      const raw = await askClaude("Você é um estrategista de conteúdo.", prompt, { maxTokens: 6000 });
      temas = lerTemas(raw);
      if (!temas) {
        ultimoErro = `resposta sem JSON utilizável (tentativa ${tentativa})`;
        // O começo e o fim da resposta, no log do servidor. Sem isto, "falhou"
        // é tudo o que se sabe, e foi assim que este defeito durou dias.
        console.error(
          `[topics/per-day] parse falhou (tentativa ${tentativa}). ${raw.length} chars.\n` +
            `início: ${raw.slice(0, 300)}\n...fim: ${raw.slice(-200)}`
        );
      }
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
    }
  }

  if (!temas) {
    return NextResponse.json({ error: `Não consegui montar os temas: ${ultimoErro}` }, { status: 502 });
  }

  /**
   * A CONFERÊNCIA DE REPETIÇÃO, depois do modelo (28/09). Pedir "não repita"
   * não basta: o modelo lê a lista e devolve o mesmo assunto com outras
   * palavras. Todo tema parecido demais com um já publicado (ou com outro dia
   * desta mesma resposta) é refeito uma vez, com o repetido nomeado.
   */
  // Em ordem de dia: entre dois dias parecidos, o PRIMEIRO fica e só o
  // segundo é refeito. Pedir os dois de novo devolvia os dois parecidos outra
  // vez (medido em 28/09: terça e sexta com "a régua subiu... 12 perguntas").
  const ordem = Object.keys(temas).sort();
  const repetidos = ordem
    .map((dia, i) => {
      const tema = temas![dia];
      const anteriores = ordem.slice(0, i).map((d) => temas![d]);
      return { dia, tema, igualA: repeteAlgum(tema, usados) ?? repeteAlgum(tema, anteriores) };
    })
    .filter((r) => r.igualA);
  if (repetidos.length > 0) {
    const refazer = `${prompt}

ATENÇÃO, SEGUNDA RODADA: estes temas repetiam algo já publicado ou outro dia, e precisam ser trocados por assuntos DIFERENTES (outro gancho do radar, outro recorte):
${repetidos.map((r) => `- dia ${r.dia}: "${r.tema.slice(0, 160)}" repete "${String(r.igualA).slice(0, 160)}"`).join("\n")}
Devolva só as linhas destes dias: ${repetidos.map((r) => r.dia).join(", ")}.`;
    try {
      const novos = lerTemas(await askClaude("Você é um estrategista de conteúdo.", refazer, { maxTokens: 3000 }));
      for (const r of repetidos) {
        const novo = novos?.[r.dia];
        const outrosDias = Object.entries(temas).filter(([d]) => d !== r.dia).map(([, t]) => t);
        if (novo && !repeteAlgum(novo, usados) && !repeteAlgum(novo, outrosDias)) temas[r.dia] = novo;
      }
    } catch {
      // Sem a segunda rodada, fica o que veio: melhor tema parecido que nenhum.
    }
  }
  // Sem travessão: regra de escrita do Bruno, e o modelo escreve com ele.
  for (const d of Object.keys(temas)) temas[d] = temas[d].replace(/\s*[—–]\s*/g, ", ").replace(/,\s*,/g, ",");
  return NextResponse.json({ topicsPerDay: temas, radar: radar ? { fontes: radar.fontes.length, geradoEm: radar.geradoEm } : null });
}
