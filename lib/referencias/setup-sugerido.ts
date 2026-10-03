import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { achadosDoProjeto } from "@/lib/referencias/achados";
import { deParaDoProjeto } from "@/lib/referencias/de-para";
import { custoDeIaDesde, lerRelatorio } from "@/lib/referencias/perfil-proprio";
import { rotuloDoPerfil } from "@/lib/referencias/estudo";
import type { RedeDeReferencia } from "@/lib/referencias/tipos";
import type { CampoDoSetup, DeParaDoPerfil, RelatorioDoPerfil, SetupSugerido } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O SETUP PREENCHIDO PELOS DOIS ESTUDOS (03/10/2026), a terceira parte da
 * jornada de entrada.
 *
 * Uma chamada de Sonnet lê o relatório do perfil do cliente, o de-para e os
 * achados das referências e devolve os campos do setup que já existem no
 * assistente (nicho, público, descrição, voz, cores, frequência, referências)
 * e a LINHA EDITORIAL, cada um com o porquê em uma frase que começa por "Vou
 * treinar o time assim porque": é o que transforma texto que a pessoa não
 * escreveu em revisão de um diagnóstico dela.
 *
 * O modelo NÃO conta nada: os números entram prontos (do relatório e do
 * de-para, contados pelo código) e o porquê só pode citar o que está ali.
 * A frequência é uma das opções da tela; as cores saem do relatório quando
 * existem, e o modelo só completa.
 *
 * Gravado em ProjectMemory ("perfil_proprio", chave "setup"). O assistente
 * aplica só nos campos VAZIOS: texto que a pessoa escreveu manda mais que a
 * sugestão (a regra da leitura de documentos, kanban-board.tsx).
 */

const FREQUENCIAS = ["1x por semana", "2x por semana", "3x por semana", "5x por semana", "1x por dia"];
const CAMPOS: CampoDoSetup[] = ["niche", "targetAudience", "description", "voice", "colorPalette", "postFrequency", "references", "linhaEditorial"];
const HEX = /#[0-9a-f]{6}/gi;
const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ").trim();

/** O custo da chamada, lido do ai_usage. A gravação do uso é assíncrona (void): espera até 3 s por ela. */
async function custoGravado(projectId: string, inicio: Date): Promise<number> {
  for (let i = 0; i < 6; i++) {
    const c = await custoDeIaDesde(projectId, inicio, ["perfil_proprio_setup"]);
    if (c > 0) return c;
    await new Promise((ok) => setTimeout(ok, 500));
  }
  return 0;
}

export async function lerSetupSugerido(projectId: string): Promise<SetupSugerido | null> {
  const linha = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type: "perfil_proprio", key: "setup" } }, select: { value: true } });
  return (linha?.value as unknown as SetupSugerido | undefined) ?? null;
}

function resumoDoRelatorio(r: RelatorioDoPerfil): string {
  const n = r.numeros;
  const linhas = [
    `Redes lidas: ${r.redes.map((x) => `${rotuloDoPerfil(x.rede, x.perfil)} (${x.seguidores ?? "?"} seguidores, ${x.lidos} posts lidos)`).join("; ")}`,
    r.nome ? `Nome: ${r.nome}` : null,
    r.bio ? `Bio: ${r.bio}` : null,
    `Posts lidos: ${n.posts}; ${n.porSemana ?? "?"} por semana; engajamento mediano ${n.taxaDeEngajamento ?? "?"}% dos seguidores; mediana de ${n.medianaVisualizacoes ?? "?"} visualizações e ${n.medianaCurtidas ?? "?"} curtidas`,
    r.melhorPost ? `Melhor post: ${r.melhorPost.formato} de ${r.melhorPost.publicadoEm?.slice(0, 10) ?? "?"}, ${r.melhorPost.porQue} Tema: ${r.melhorPost.tema ?? "?"}. Legenda: ${r.melhorPost.legenda ?? ""}` : null,
    `Formatos: ${r.formatos.map((f) => `${f.nome} ${f.pct}%${f.vezes ? ` (rende ${f.vezes}x)` : ""}`).join(", ")}`,
    `Temas: ${r.temas.map((f) => `${f.nome} (${f.posts})`).join(", ")}`,
    `Tons: ${r.tons.map((f) => `${f.nome} ${f.pct}%`).join(", ")}`,
    `Ganchos: ${r.ganchos.map((f) => `${f.nome} ${f.pct}%`).join(", ")}`,
    r.oQueRende.length ? `O que rende no perfil dele: ${r.oQueRende.join(" ")}` : null,
    r.visual ? `Visual: cores ${r.visual.cores.join(", ") || "?"}; ${r.visual.estilo}; artes ${r.visual.artes.map((a) => `${a.nome} ${a.pct}%`).join(", ")}` : null,
    r.quemE ? `Quem é: ${r.quemE.pessoa} | Produto: ${r.quemE.produto} | Objetivo: ${r.quemE.objetivo} | Público: ${r.quemE.publico} | Linguagem: ${r.quemE.linguagem} | Temas: ${r.quemE.temas.join(", ")}` : null,
  ];
  return linhas.filter(Boolean).join("\n");
}

function resumoDoDePara(d: DeParaDoPerfil): string {
  return [
    `Referências: ${d.referencias.map((r) => `${r.rotulo} (${r.seguidores ?? "?"} seguidores, ${r.porSemana ?? "?"} posts por semana, engajamento ${r.taxaDeEngajamento ?? "?"}%)`).join("; ")}`,
    ...d.linhas.map((l) => `- [${l.prioridade}] ${l.frase}${l.prova ? ` Prova: ${l.prova}` : ""}`),
  ].join("\n");
}

/**
 * Gera (ou regera) o setup sugerido. Funciona só com o relatório do perfil
 * (cliente que pulou as referências); com o de-para, fica mais preciso.
 */
export async function gerarSetupSugerido(projectId: string): Promise<SetupSugerido | null> {
  const inicio = new Date();
  const [projeto, relatorio, dePara, { achados }, refs] = await Promise.all([
    prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { name: true, niche: true, targetAudience: true, description: true, voice: true, colorPalette: true } }),
    lerRelatorio(projectId),
    deParaDoProjeto(projectId).catch(() => null),
    achadosDoProjeto(projectId).catch(() => ({ achados: [] })),
    prisma.referenciaPerfil.findMany({ where: { projectId, status: "confirmado" }, select: { rede: true, perfil: true, url: true } }),
  ]);
  if (!relatorio && !dePara) return null;
  const listaDeRefs = refs.map((r) => `${rotuloDoPerfil(r.rede as RedeDeReferencia, r.perfil)}${r.url ? ` (${r.url})` : ""}`).join(", ");
  const blocoAchados = achados
    .slice(0, 10)
    .map((a) => `- ${a.frase} (${a.amostra.posts} posts de ${a.amostra.perfis} perfis, ${a.forca})`)
    .join("\n");

  const sistema =
    "Você é o estrategista de conteúdo que monta o setup de um cliente novo numa plataforma em que um time de agentes de IA escreve, desenha e edita o conteúdo dele. Escreve em português do Brasil, concreto, sem jargão. Nunca usa travessão (use vírgula, dois-pontos ou parênteses). Não inventa número nem fato: só usa os números que estão no diagnóstico. Responda só com JSON.";
  const pedido = `PROJETO: ${projeto.name}
O QUE JÁ ESTÁ ESCRITO NO SETUP (pode estar vazio): nicho "${projeto.niche ?? ""}", público "${projeto.targetAudience ?? ""}"

=== DIAGNÓSTICO DO PERFIL DO CLIENTE (números contados pela plataforma) ===
${relatorio ? resumoDoRelatorio(relatorio) : "(o perfil do cliente não foi lido)"}

=== DE-PARA: O QUE AS REFERÊNCIAS FAZEM QUE ELE NÃO FAZ ===
${dePara ? resumoDoDePara(dePara) : "(o cliente não indicou referências)"}

=== O QUE RENDE NAS REFERÊNCIAS (achados com número) ===
${blocoAchados || "(sem achados ainda)"}

Monte o setup do projeto. Devolva:
{
 "niche": "o nicho em uma frase específica (mercado, o que vende, onde atua)",
 "targetAudience": "o público em 2 ou 3 frases: quem é, o que quer, o que trava a compra",
 "description": "o objetivo do conteúdo em 2 frases",
 "voice": "o guia de voz completo, em até 900 caracteres: tom, pessoa do discurso, tamanho das frases, palavras e bordões que ele já usa, o que nunca fazer; parta da LINGUAGEM REAL dele no diagnóstico, não de um modelo genérico",
 "colorPalette": "3 cores em hexadecimal separadas por vírgula, a primeira a de destaque; use as cores do diagnóstico",
 "postFrequency": "uma destas, exatamente: ${FREQUENCIAS.join(" | ")}",
 "linhaEditorial": "3 a 5 pilares, um por linha, cada um com nome, do que trata, o formato que rende e quantos por semana. Exemplo de UMA linha (não copie o conteúdo): 'Bastidores do negócio: o dia a dia por trás da empresa; reel contando um caso, fechando com pergunta; 1 por semana'. Os formatos e a frequência saem do de-para e dos achados, e a soma bate com a frequência escolhida",
 "porque": {
   "niche": "Vou treinar o time assim porque ...",
   "targetAudience": "...", "description": "...", "voice": "...", "colorPalette": "...", "postFrequency": "...", "linhaEditorial": "..."
 }
}
Cada "porque" é UMA frase que começa com "Vou treinar o time assim porque o diagnóstico mostrou" e cita o número ou o fato do diagnóstico que levou à escolha.`;

  try {
    const bruto = await askClaude(sistema, pedido, { maxTokens: 12_000, effort: "medium", usage: { projectId, operation: "perfil_proprio_setup" } });
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as Record<string, unknown> & { porque?: Record<string, unknown> };
    const campos: SetupSugerido["campos"] = {};
    const porque: SetupSugerido["porque"] = {};
    for (const c of CAMPOS) {
      const v = j[c];
      if (typeof v === "string" && v.trim()) campos[c] = semTravessao(v).slice(0, 2000);
      const p = j.porque?.[c];
      if (typeof p === "string" && p.trim()) porque[c] = semTravessao(p).slice(0, 400);
    }
    // A frequência só vale se for uma das opções da tela.
    if (campos.postFrequency && !FREQUENCIAS.includes(campos.postFrequency)) delete campos.postFrequency;
    // As cores: as do relatório mandam; o modelo só completa até 3.
    const doRelatorio = relatorio?.visual?.cores ?? [];
    const doModelo = (campos.colorPalette ?? "").match(HEX) ?? [];
    const cores = [...new Set([...doRelatorio, ...doModelo].map((c) => c.toLowerCase()))].slice(0, 3);
    if (cores.length) {
      campos.colorPalette = cores.join(",");
      // O porquê das cores é escrito pelo código: o modelo citava cores que a
      // regra acima tinha trocado (visto na prova de 03/10).
      if (doRelatorio.length) porque.colorPalette = `Vou treinar o time assim porque o diagnóstico mostrou que ${cores.filter((c) => doRelatorio.includes(c)).join(", ")} são as cores que mais aparecem nas capas dos seus posts.`;
    } else delete campos.colorPalette;
    // As referências que o cliente deu, para o campo "Referências e inspirações".
    if (listaDeRefs) {
      campos.references = listaDeRefs;
      porque.references = `Vou treinar o time assim porque são os perfis que você indicou e que o estudo comparou com o seu${dePara?.manchetes[0] ? `: ${dePara.manchetes[0].replace(/\.$/, "")}` : ""}.`;
    }
    const setup: SetupSugerido = {
      geradoEm: new Date().toISOString(),
      campos,
      porque,
      custo: { apifyUsd: 0, iaUsd: await custoGravado(projectId, inicio), estimado: false },
    };
    await prisma.projectMemory.upsert({
      where: { projectId_type_key: { projectId, type: "perfil_proprio", key: "setup" } },
      create: { projectId, type: "perfil_proprio", key: "setup", value: setup as never },
      update: { value: setup as never },
    });
    return setup;
  } catch (e) {
    console.error(`[setup-sugerido][${projectId}] ${e instanceof Error ? e.message : e}`);
    return null;
  }
}
