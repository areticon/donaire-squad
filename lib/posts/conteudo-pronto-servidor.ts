import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { podeUsarProjeto } from "@/lib/equipe/conta";
import { formatoValido } from "@/lib/publish/formato-de-destino";
import { FUSO_PADRAO } from "@/lib/fuso";
import { deCampos } from "@/lib/posts/horario-da-peca";
import {
  conferirParaRede,
  ocorrenciasDaSerie,
  tipoDaPeca,
  type ArquivoMedido,
  type PedidoDeConteudoPronto,
  type Recorrencia,
} from "@/lib/posts/conteudo-pronto";

/**
 * O CONTEÚDO PRONTO VIRA PEÇA DO QUADRO (06/10/2026).
 *
 * O arquivo já subiu ao Blob público pelo navegador (a mesma rota assinada do
 * material de campanha, /api/campanha/material). Aqui ele vira o que o quadro
 * e o publicador entendem, sem IA e sem crédito de geração:
 *
 *   • um `PipelineRun` próprio, já concluído (`status: "completed"`), porque
 *     card de campanha exige run e porque cancelar ou arquivar esta peça não
 *     pode levar junto a campanha da semana. Sem `weekStart` de propósito: o
 *     run da semana (o que a rota de status devolve como `run`) continua sendo
 *     o da campanha, e este não rouba o lugar dele. Quando há recorrência, o
 *     run é o registro-pai da série, e `config.recorrencia` guarda a regra;
 *   • por OCORRÊNCIA (uma, ou uma por semana ou mês até a data fim), um
 *     `Post` por conta e lugar (feed, reel, story), `draft`, com a mídia em
 *     `imageUrl` do jeito que o publicador lê (lâminas coladas com "|", vídeo
 *     com a extensão no nome), e `metadata.origem = "cliente"`;
 *   • os cards que o quadro desenha, por ocorrência: o do redator (o título
 *     e o texto), o da Diana quando é imagem ou carrossel (a capa) e o do
 *     Paulo (a porta da peça, com "Publicar agora" e "Deixar agendado").
 *     Nenhum deles espera o squad (não há o que escrever nem desenhar); todos
 *     ficam `pending`, como na esteira, e quem decide é o cliente no Paulo.
 *
 * Dali em diante a peça segue pelos caminhos de sempre: aprovar, agendar,
 * publicar por rede, arquivar, cancelar. A série inteira se cancela por
 * `cancelarSerie`.
 */

export type ResultadoDoConteudoPronto =
  | { ok: true; runId: string; postIds: string[]; cardIds: string[]; ocorrencias: number }
  | { ok: false; status: number; erro: string };

/** A URL está no store da plataforma e dentro da pasta deste projeto? */
function urlDaPastaDoProjeto(u: unknown, projectId: string): u is string {
  if (typeof u !== "string") return false;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && url.hostname.endsWith(".blob.vercel-storage.com") && url.pathname.startsWith(`/conteudo-pronto/${projectId}/`);
  } catch {
    return false;
  }
}

function arquivoMedido(bruto: unknown): (ArquivoMedido & { url: string }) | null {
  const a = bruto as Partial<ArquivoMedido & { url: string }> | null;
  if (!a || typeof a.url !== "string" || typeof a.mime !== "string") return null;
  return {
    url: a.url,
    nome: typeof a.nome === "string" ? a.nome.slice(0, 160) : "arquivo",
    mime: a.mime,
    bytes: Number(a.bytes) || 0,
    largura: Number(a.largura) || 0,
    altura: Number(a.altura) || 0,
    segundos: typeof a.segundos === "number" && Number.isFinite(a.segundos) ? a.segundos : undefined,
  };
}

function recorrenciaLida(bruto: unknown): Recorrencia | null {
  const r = bruto as Partial<Recorrencia> | null;
  if (!r || r.tipo === "nenhuma" || !r.tipo) return null;
  if (r.tipo !== "semanal" && r.tipo !== "mensal") return null;
  const ate = typeof r.ate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.ate) ? r.ate : null;
  return { tipo: r.tipo, ate };
}

/** O dia da semana (1=Seg … 7=Dom) do instante, em Brasília. */
export function diaDaSemanaEmBrasilia(d: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: FUSO_PADRAO, weekday: "short" }).format(d);
  const i = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(nome);
  return i < 0 ? 1 : i + 1;
}

const TOLERANCIA_DO_PASSADO_MS = 60_000;

export async function criarConteudoPronto(args: { userId: string; projectId: string; pedido: unknown }): Promise<ResultadoDoConteudoPronto> {
  const projeto = await prisma.project.findUnique({
    where: { id: args.projectId },
    select: {
      id: true,
      userId: true,
      socialAccounts: { where: { isActive: true }, select: { id: true, platform: true, displayName: true } },
    },
  });
  if (!projeto || !(await podeUsarProjeto(args.userId, projeto))) return { ok: false, status: 404, erro: "Projeto não encontrado." };

  const p = (args.pedido ?? {}) as Partial<PedidoDeConteudoPronto>;

  // Os arquivos: medidos pela janela, conferidos aqui de novo.
  const arquivos = (Array.isArray(p.arquivos) ? p.arquivos : []).map(arquivoMedido).filter((a): a is ArquivoMedido & { url: string } => a !== null);
  if (arquivos.length === 0) return { ok: false, status: 400, erro: "Nenhum arquivo chegou." };
  for (const a of arquivos) {
    if (!urlDaPastaDoProjeto(a.url, projeto.id)) return { ok: false, status: 400, erro: "Arquivo fora da pasta deste projeto." };
  }
  const peca = tipoDaPeca(arquivos);
  if ("erro" in peca) return { ok: false, status: 400, erro: peca.erro };
  const tipo = peca.tipo;
  const posterUrl = urlDaPastaDoProjeto(p.posterUrl, projeto.id) ? p.posterUrl : null;

  // Os destinos: conta do projeto, lugar que a rede tem, e o veredito das regras.
  const contas = new Map(projeto.socialAccounts.map((c) => [c.id, c]));
  const vistos = new Set<string>();
  const destinos: Array<{ conta: { id: string; platform: string; displayName: string | null }; formato: ReturnType<typeof formatoValido> }> = [];
  for (const d of Array.isArray(p.destinos) ? p.destinos : []) {
    const conta = typeof d?.socialAccountId === "string" ? contas.get(d.socialAccountId) : undefined;
    if (!conta) return { ok: false, status: 400, erro: "Uma das contas escolhidas não é deste projeto." };
    const formato = formatoValido(conta.platform, d.formato);
    const chave = `${conta.id}@${formato}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const veredito = conferirParaRede(conta.platform, formato, arquivos, tipo);
    if (veredito.bloqueios.length) {
      return { ok: false, status: 400, erro: `${conta.displayName ?? conta.platform}: ${veredito.bloqueios[0]}` };
    }
    destinos.push({ conta, formato });
  }
  if (destinos.length === 0) return { ok: false, status: 400, erro: "Escolha pelo menos uma rede." };

  // A primeira saída e a série: campos de Brasília, como a janela manda.
  const data = typeof p.data === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.data) ? p.data : null;
  const hora = typeof p.hora === "string" && /^\d{2}:\d{2}$/.test(p.hora) ? p.hora : null;
  if (!data || !hora) return { ok: false, status: 400, erro: "Escolha data e hora." };
  const primeira = deCampos(data, hora);
  if (Number.isNaN(primeira.getTime())) return { ok: false, status: 400, erro: "Data ou hora inválida." };
  if (primeira.getTime() < Date.now() - TOLERANCIA_DO_PASSADO_MS) return { ok: false, status: 400, erro: "A data já passou. Escolha uma data e hora futuras." };
  const recorrencia = recorrenciaLida(p.recorrencia);
  if (recorrencia?.ate && recorrencia.ate < data) return { ok: false, status: 400, erro: "A data fim da série vem antes da primeira saída." };
  const ocorrencias = ocorrenciasDaSerie({ data, hora }, recorrencia).map((o) => deCampos(o.data, o.hora));

  const legenda = (typeof p.legenda === "string" ? p.legenda : "").replace(/\s*[—–]\s*/g, ", ").trim().slice(0, 5000);
  const descricao = typeof p.descricao === "string" ? p.descricao.trim().slice(0, 1000) : "";
  const nomeDaPeca = arquivos[0].nome.replace(/\.[^.]+$/, "");
  const imageUrl = arquivos.map((a) => a.url).join("|");
  const segundos = tipo === "video" ? arquivos[0].segundos ?? null : null;

  const run = await prisma.pipelineRun.create({
    data: {
      projectId: projeto.id,
      status: "completed",
      topic: `Conteúdo pronto: ${nomeDaPeca}`,
      campaignMode: recorrencia ? "recurring" : "single",
      // Sem weekStart: ver o cabeçalho. A data da peça está nos posts e nos cards.
      weekStart: null,
      config: {
        origem: "cliente",
        conteudoPronto: true,
        tipo,
        arquivos: arquivos.map((a) => a.url),
        ...(recorrencia ? { recorrencia: { ...recorrencia, primeira: data, hora, ocorrencias: ocorrencias.length } } : {}),
      } as Prisma.InputJsonValue,
      endedAt: new Date(),
      logs: [],
    },
    select: { id: true },
  });

  // O YouTube vai primeiro: é o post que o card do Paulo aponta, e a peça de
  // vídeo do quadro abre pelo card que aponta para ela.
  const ordenados = [...destinos].sort((a, b) => (a.conta.platform === "youtube" ? -1 : 0) - (b.conta.platform === "youtube" ? -1 : 0));
  const postIds: string[] = [];
  const cardIds: string[] = [];
  const textoDoCard = legenda || `Conteúdo pronto: ${nomeDaPeca}`;

  for (const [indice, quando] of ocorrencias.entries()) {
    const dayOfWeek = diaDaSemanaEmBrasilia(quando);
    const marcaDaSerie = recorrencia ? { recorrencia: { tipo: recorrencia.tipo, ate: recorrencia.ate ?? null, indice, total: ocorrencias.length, serieRunId: run.id } } : {};
    const idsDaOcorrencia: string[] = [];
    for (const d of ordenados) {
      const post = await prisma.post.create({
        data: {
          projectId: projeto.id,
          runId: run.id,
          platform: d.conta.platform,
          socialAccountId: d.conta.id,
          content: legenda,
          mediaType: tipo,
          imageUrl,
          status: "draft",
          dayOfWeek,
          scheduledAt: quando,
          metadata: {
            origem: "cliente",
            conteudoPronto: true,
            formato: d.formato,
            // Material próprio: nenhuma geração para cobrar (a mesma marca que a
            // campanha usa quando o cliente sobe a mídia do dia).
            midiaPropria: true,
            ...(posterUrl ? { capaUrl: posterUrl } : {}),
            ...(segundos ? { segundosDoVideo: Math.round(segundos) } : {}),
            ...(descricao ? { descricaoDoCliente: descricao } : {}),
            arquivos: arquivos.map((a) => ({ nome: a.nome, mime: a.mime, bytes: a.bytes, largura: a.largura, altura: a.altura })),
            ...marcaDaSerie,
          } as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      postIds.push(post.id);
      idsDaOcorrencia.push(post.id);
    }

    const base = { runId: run.id, projectId: projeto.id, dayOfWeek, scheduledDate: quando };
    const metaDoCard = { origem: "cliente", conteudoPronto: true, ...marcaDaSerie };

    // O card do redator: é dele que o quadro tira o título da peça. Não há o
    // que escrever (o texto é do cliente), e ele fica `pending` como os cards
    // do redator da esteira: os cards chegam ao quadro um a um (useUmaAUma),
    // e um card "approved" na frente do Paulo fazia a peça dizer "aprovado"
    // por dois segundos antes de dizer "esperando você" (prova de 06/10).
    const redator = await prisma.campaignCard.create({
      data: {
        ...base,
        agentId: "lucas-linkedin",
        agentName: "Lucas LinkedIn",
        cardType: "post_linkedin",
        mediaType: tipo,
        content: textoDoCard,
        status: "pending",
        postId: idsDaOcorrencia[0],
        metadata: {
          ...metaDoCard,
          ...(posterUrl ? { thumb: posterUrl } : {}),
          ...(segundos ? { segundosDoVideo: Math.round(segundos) } : {}),
        } as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    cardIds.push(redator.id);

    // O card da Diana, quando é imagem ou carrossel: a capa no quadro e o
    // visor com as lâminas, no mesmo desenho dos cards de hoje. Vídeo não tem:
    // a capa vem do próprio post (o quadro de abertura em `thumb`).
    if (tipo !== "video") {
      const diana = await prisma.campaignCard.create({
        data: {
          ...base,
          agentId: "diana-design",
          agentName: "Diana Design",
          cardType: "media",
          mediaType: tipo,
          content: tipo === "carousel" ? `Carrossel do cliente, ${arquivos.length} lâminas: ${arquivos.map((a) => a.nome).join(", ")}` : `Arte do cliente: ${arquivos[0].nome}`,
          mediaUrl: imageUrl,
          status: "pending",
          postId: idsDaOcorrencia[0],
          metadata: metaDoCard as Prisma.InputJsonValue,
        },
        select: { id: true },
      });
      cardIds.push(diana.id);
    }

    // O card do Paulo: a porta da peça. Pendente até o cliente aprovar.
    const paulo = await prisma.campaignCard.create({
      data: {
        ...base,
        agentId: "paulo-publicador",
        agentName: "Paulo Publicador",
        cardType: "publish",
        content: `${idsDaOcorrencia.length} post(s) do seu conteúdo pronto, esperando a sua aprovação.`,
        status: "pending",
        postId: idsDaOcorrencia[0],
        metadata: metaDoCard as Prisma.InputJsonValue,
      },
      select: { id: true },
    });
    cardIds.push(paulo.id);
  }

  return { ok: true, runId: run.id, postIds, cardIds, ocorrencias: ocorrencias.length };
}

/**
 * CANCELAR A SÉRIE (ou a peça única) do conteúdo pronto: os posts que ainda
 * não saíram viram `cancelled` (o arquivo de Posts, com volta), os cards do
 * run vão para o arquivo e o run também. O que já foi publicado fica, e o
 * que está publicando agora também: cancelar no meio do envio não para a
 * rede, só mentiria na tela.
 */
export async function cancelarSerie(args: { userId: string; projectId: string; runId: string }): Promise<{ ok: true; cancelados: number; ficaram: number } | { ok: false; status: number; erro: string }> {
  const projeto = await prisma.project.findUnique({ where: { id: args.projectId }, select: { id: true, userId: true } });
  if (!projeto || !(await podeUsarProjeto(args.userId, projeto))) return { ok: false, status: 404, erro: "Projeto não encontrado." };
  const run = await prisma.pipelineRun.findFirst({ where: { id: args.runId, projectId: projeto.id }, select: { id: true, config: true } });
  if (!run || !(run.config as { conteudoPronto?: unknown } | null)?.conteudoPronto) return { ok: false, status: 404, erro: "Esta série não é de conteúdo pronto." };

  const cancelados = await prisma.post.updateMany({
    where: { runId: run.id, status: { in: ["draft", "scheduled", "failed", "rejected"] } },
    data: { status: "cancelled" },
  });
  const ficaram = await prisma.post.count({ where: { runId: run.id, status: { in: ["published", "publishing"] } } });
  await prisma.campaignCard.updateMany({ where: { runId: run.id, NOT: { status: "archived" } }, data: { status: "archived" } });
  await prisma.pipelineRun.update({ where: { id: run.id }, data: { archived: true, archivedAt: new Date() } });
  return { ok: true, cancelados: cancelados.count, ficaram };
}
