import { prisma } from "@/lib/db/prisma";
import { agentePorId } from "@/lib/squad/estado-do-squad";
import { placarDeErros } from "@/lib/squad/licoes-da-vera";

/**
 * AS SUGESTÕES DO SQUAD PARA O DOCUMENTO DO PROJETO (29/09/2026).
 *
 * Pedido do Bruno: os agentes "podem ir pedir feedback para o usuário das
 * entregas e dar sugestões para melhorar o projeto (documento que orienta todo
 * o trabalho)". O documento é o contexto do projeto (`ProjectContext`), que
 * entra no prompt de todos os agentes em toda campanha.
 *
 * ## Sugestão sai de dado, e nunca de palpite
 *
 * Um agente que "opina" sobre o negócio do cliente vira uma fonte a mais de
 * coisa inventada, e o produto inteiro é construído contra isso (ver o papo de
 * café no escritório, que é só de ofício pelo mesmo motivo). Então cada
 * sugestão aqui nasce de um fato medido no próprio projeto:
 *
 * 1. um agente que a Vera reprovou duas vezes ou mais pelo mesmo tipo de erro
 *    (as lições dela): a regra vira parte do documento, e deixa de depender da
 *    memória de 30 dias;
 * 2. uma peça que VOCÊ recusou com motivo escrito: o motivo vira regra;
 * 3. um buraco no projeto (sem tom de voz, sem documento da marca).
 *
 * Aceitar escreve a regra no documento "Aprendizados do squad"; recusar guarda a
 * recusa para a mesma sugestão não voltar.
 */

export type { Sugestao } from "@/lib/squad/tipo-da-sugestao";
import type { Sugestao } from "@/lib/squad/tipo-da-sugestao";

const TIPO_DECIDIDA = "sugestao";
export const TITULO_DO_DOCUMENTO = "Aprendizados do squad";

/** Um id estável para a mesma sugestão, para a recusa valer da próxima vez. */
function idDe(texto: string): string {
  let h = 0;
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h).toString(36);
}

export async function sugestoesDoSquad(projectId: string): Promise<Sugestao[]> {
  const [placar, recusas, projeto, decididas] = await Promise.all([
    placarDeErros(projectId).catch(() => []),
    prisma.projectMemory.findMany({
      where: { projectId, type: "rejection" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { value: true },
    }),
    prisma.project.findUnique({
      where: { id: projectId },
      select: { voice: true, contexts: { where: { status: "pronto" }, select: { id: true }, take: 1 } },
    }),
    prisma.projectMemory.findMany({ where: { projectId, type: TIPO_DECIDIDA }, select: { key: true, value: true } }),
  ]);
  // A decisão sobre a lição de um agente vale 14 dias; depois, se ele seguir
  // errando, a Vera pode trazer de novo. As outras decisões valem para sempre.
  const QUATORZE_DIAS = 14 * 24 * 3600 * 1000;
  const jaDecididas = new Set(
    decididas
      .filter((d) => {
        if (!d.key.startsWith("licao-")) return true;
        const quando = (d.value as { quando?: string } | null)?.quando;
        return !quando || Date.now() - new Date(quando).getTime() < QUATORZE_DIAS;
      })
      .map((d) => d.key)
  );
  const lista: Sugestao[] = [];

  // 1. Quem a Vera reprovou duas vezes ou mais: ela mesma traz a sugestão.
  for (const p of placar.filter((x) => x.erros >= 2)) {
    const agente = agentePorId(p.agentId);
    const regra = `${agente?.papel ? `${agente.papel}: ` : ""}evitar o que a revisão reprovou, "${p.ultimo.replace(/["“”]/g, "")}"`;
    lista.push({
      // Um id por AGENTE, e não por erro (30/09): com o id do último erro, cada
      // reprovação nova da Vera trazia de volta a mesma sugestão já aceita.
      id: `licao-${p.agentId}`,
      agenteId: "vera-veredito",
      fala: `${agente?.primeiroNome ?? "Um colega"} errou ${p.erros} vezes este mês. Posso pôr a regra no documento do projeto?`,
      regra,
      porque: `Reprovei ${agente?.artigo === "A" ? "a" : "o"} ${agente?.primeiroNome ?? "agente"} ${p.erros} vezes nos últimos 30 dias. Escrita no documento, a regra vale para sempre, e não só enquanto a lição é recente.`,
    });
  }

  // 2. O que você recusou com motivo: quem fez a peça traz.
  for (const r of recusas) {
    const v = r.value as { reason?: string; agentId?: string } | null;
    const motivo = v?.reason?.trim();
    if (!motivo || motivo.length < 12) continue;
    const agente = agentePorId(v?.agentId) ?? agentePorId("lucas-linkedin");
    lista.push({
      id: `recusa-${idDe(motivo)}`,
      agenteId: agente!.id,
      fala: "Você recusou uma peça minha. Quer que isso vire regra do projeto?",
      regra: `Pedido do cliente: ${motivo}`,
      porque: `Você recusou uma peça com este motivo: "${motivo.slice(0, 160)}". Como regra do documento, todo o squad passa a seguir.`,
    });
  }

  // 3. Buracos do projeto.
  if (projeto && !projeto.voice?.trim()) {
    lista.push({
      id: "falta-voz",
      agenteId: "lucas-linkedin",
      fala: "O documento do projeto não diz o seu tom de voz. Me ajuda?",
      regra: null,
      porque: "Sem o tom de voz escrito, cada redator adivinha o seu jeito de falar.",
      link: "setup",
    });
  }
  if (projeto && projeto.contexts.length === 0) {
    lista.push({
      id: "falta-documento",
      agenteId: "roberto-radar",
      fala: "Não temos nenhum documento da sua marca. Pode subir um?",
      regra: null,
      porque: "Os documentos da marca (manual, apresentação, site) são a lente de toda pesquisa e todo texto.",
      link: "training",
    });
  }

  return lista.filter((s) => !jaDecididas.has(s.id));
}

/**
 * Aceita ou recusa. Aceitar com regra escreve no documento "Aprendizados do
 * squad" (tipo "editorial", já pronto, então entra na próxima campanha).
 */
export async function decidirSugestao(projectId: string, id: string, acao: "aceitar" | "recusar"): Promise<{ escrito: boolean }> {
  const sugestao = (await sugestoesDoSquad(projectId)).find((s) => s.id === id);
  let escrito = false;
  if (acao === "aceitar" && sugestao?.regra) {
    const linha = `- ${sugestao.regra}`;
    const doc = await prisma.projectContext.findFirst({ where: { projectId, title: TITULO_DO_DOCUMENTO } });
    const cabecalho = "Regras que o squad aprendeu com a revisão da Vera e com as suas recusas. Valem para todos os agentes.";
    if (doc) {
      await prisma.projectContext.update({
        where: { id: doc.id },
        data: { rawInput: `${doc.rawInput}\n${linha}`, compiled: `${doc.compiled}\n${linha}`, status: "pronto" },
      });
    } else {
      await prisma.projectContext.create({
        data: {
          projectId,
          type: "editorial",
          title: TITULO_DO_DOCUMENTO,
          rawInput: `${cabecalho}\n${linha}`,
          compiled: `## ${TITULO_DO_DOCUMENTO}\n${cabecalho}\n${linha}`,
          status: "pronto",
        },
      });
    }
    escrito = true;
  }
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO_DECIDIDA, key: id } },
    create: { projectId, type: TIPO_DECIDIDA, key: id, value: { acao, quando: new Date().toISOString() } },
    update: { value: { acao, quando: new Date().toISOString() } },
  });
  return { escrito };
}
