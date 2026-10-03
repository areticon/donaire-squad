import { prisma } from "@/lib/db/prisma";
import { achadosDoProjeto } from "@/lib/referencias/achados";
import { deParaDoProjeto } from "@/lib/referencias/de-para";
import { lerRelatorio } from "@/lib/referencias/perfil-proprio";
import { lerTendencias } from "@/lib/referencias/tendencias";
import { padroesDoProjeto } from "@/lib/editorial/fontes-da-linha";
import { blocoDasRegrasDoProjeto } from "@/lib/referencias/regras";

/**
 * O ESTUDO DOS PERFIS DENTRO DA CAMPANHA "TUDO COM IA" (03/10/2026).
 *
 * Até aqui a linha editorial lia os cartões de padrão das referências e a
 * campanha não lia nada do estudo: os temas do dia (app/api/ai/topics/per-day)
 * e o conteúdo (lib/pipeline/executar.ts) nasciam só do radar e dos
 * documentos. Pedido do Bruno: "os achados, as regras aprovadas e as
 * tendências entram na geração das ideias e do conteúdo".
 *
 * Um bloco só, com: quem é o cliente e o que rende no perfil DELE (relatório
 * da jornada de entrada), o que as referências fazem que ele não faz
 * (de-para), o que rende no nicho (achados, os fortes primeiro), os moldes
 * (cartões de padrão), a linha editorial do setup e as tendências da semana
 * que combinam com o projeto.
 *
 * OS NÚMEROS DAQUI NÃO SÃO FATO DE POST: são do estudo de desempenho, não
 * pesquisa sobre o mundo. O bloco diz isso com todas as letras, porque a régua
 * do lastro (executar.ts) corta número sem fonte, e porque "reels renderam 3x"
 * dito num post seria falso fora daqui. Molde sim, conteúdo não: nunca frase,
 * caso, número ou nome de quem fez.
 *
 * Vazio quando o projeto não tem estudo nenhum: projeto antigo segue igual.
 * Falha de leitura vira vazio: estudo nunca derruba campanha.
 */
export async function blocoDoEstudoDosPerfis(projectId: string, opcoes: { comRegras?: boolean } = {}): Promise<string> {
  try {
    const [relatorio, dePara, { achados }, padroes, tendencias, projeto, regras] = await Promise.all([
      lerRelatorio(projectId).catch(() => null),
      deParaDoProjeto(projectId).catch(() => null),
      achadosDoProjeto(projectId).catch(() => ({ achados: [] as Awaited<ReturnType<typeof achadosDoProjeto>>["achados"] })),
      padroesDoProjeto(projectId).catch(() => []),
      lerTendencias(projectId).catch(() => null),
      prisma.project.findUnique({ where: { id: projectId }, select: { config: true } }).catch(() => null),
      opcoes.comRegras ? blocoDasRegrasDoProjeto(projectId, ["roteiro", "redacao"]) : Promise.resolve(""),
    ]);
    const partes: string[] = [];

    if (relatorio) {
      const q = relatorio.quemE;
      const linhas = [
        q ? `Quem é: ${q.pessoa}. Produto: ${q.produto}. Objetivo do conteúdo: ${q.objetivo}. Público: ${q.publico}.` : null,
        q?.linguagem ? `Como ele fala nos posts: ${q.linguagem}` : null,
        relatorio.melhorPost ? `O post que mais rendeu no perfil dele: ${relatorio.melhorPost.formato}, tema "${relatorio.melhorPost.tema ?? "?"}". ${relatorio.melhorPost.porQue}` : null,
        relatorio.oQueRende.length ? `O que rende no perfil dele: ${relatorio.oQueRende.slice(0, 4).join(" ")}` : null,
      ].filter(Boolean);
      if (linhas.length) partes.push(`O PERFIL DO CLIENTE:\n${linhas.map((l) => `- ${l}`).join("\n")}`);
    }

    if (dePara?.linhas.length) {
      const fortes = dePara.linhas.filter((l) => l.prioridade !== "baixa").slice(0, 5);
      if (fortes.length) partes.push(`O QUE AS REFERÊNCIAS FAZEM QUE ELE NÃO FAZ (puxe a campanha para esse lado):\n${fortes.map((l) => `- ${l.frase}${l.prova ? ` (rende: ${l.prova})` : ""}`).join("\n")}`);
    }

    if (achados.length) {
      const ordem = [...achados].sort((a, b) => (a.forca === b.forca ? 0 : a.forca === "forte" ? -1 : 1)).filter((a) => a.tipo !== "destaque");
      const lista = ordem.slice(0, 6).map((a) => `- ${a.frase} (${a.amostra.posts} posts de ${a.amostra.perfis} perfis, ${a.forca === "forte" ? "forte" : "indício"})`);
      if (lista.length) partes.push(`O QUE RENDE NO NICHO (medido nos perfis de referência):\n${lista.join("\n")}`);
    }

    if (padroes.length) {
      partes.push(`MOLDES QUE RENDEM (a forma, nunca o conteúdo de quem fez):\n${padroes.slice(0, 5).map((p) => `- ${p.oQueE} Como aplicar: ${p.comoAplicar}`).join("\n")}`);
    }

    const cfg = (projeto?.config ?? {}) as Record<string, unknown>;
    const linha = typeof cfg.linhaEditorial === "string" ? cfg.linhaEditorial.trim() : "";
    if (linha) partes.push(`A LINHA EDITORIAL DO PROJETO (pilares aprovados no setup; distribua os dias entre eles):\n${linha.slice(0, 1200)}`);

    const combinam = (tendencias?.itens ?? []).filter((t) => t.combina).slice(0, 3);
    if (combinam.length) {
      partes.push(
        `TENDÊNCIAS DA SEMANA QUE COMBINAM COM O PROJETO (use em no máximo um dia, com o tema do cliente):\n${combinam
          .map((t) => `- ${t.nome}: ${t.oQueE}${t.sugestao?.tema ? ` Sugestão: ${t.sugestao.tema}` : ""}`)
          .join("\n")}`
      );
    }

    if (!partes.length && !regras) return "";
    return `\n\n=== O ESTUDO DOS PERFIS (desempenho medido nas redes do cliente e das referências) ===
Use para ESCOLHER temas, formatos, ganchos e fechamentos. Os números abaixo são do estudo de desempenho e NUNCA entram no texto do post como fato (não são pesquisa sobre o mercado). Nunca copie frase, caso, número ou nome de quem fez.
${partes.join("\n\n")}${regras}
=== FIM DO ESTUDO DOS PERFIS ===\n`;
  } catch (e) {
    console.warn(`[estudo-na-campanha][${projectId}] ${e instanceof Error ? e.message : e}`);
    return "";
  }
}
