import { prisma } from "@/lib/db/prisma";
import { carregarNotas } from "@/lib/cerebro/carregar";
import { lerNotaPeloJev, type Perguntar } from "@/lib/cerebro/jev";
import { cortar, idDaNotaDePeca, notaDaPeca, somarAto } from "@/lib/cerebro/montagem";
import { HISTORICO_MAXIMO, TIPO_DO_REGISTRO, type AtoDaPeca, type EventoDaPeca, type FonteDaNota, type NotaDoCerebro, type RegistroDoCerebro } from "@/lib/cerebro/tipos";

/**
 * A CAPTURA DO CÉREBRO (06/10/2026): o que acontece no produto vira nota, e o
 * JEV lê a nota em seguida.
 *
 * NUNCA TRAVA QUEM CHAMA: as rotas chamam dentro de `after()`; tudo aqui
 * engole o próprio erro e vira log. A nota é gravada ANTES da leitura do JEV,
 * para o fato ficar guardado mesmo quando o JEV está lento, desligado ou fora.
 *
 * DUAS PORTAS:
 *   registrarAtoNaPeca  aprovar, recusar, revisar, editar, agendar, arquivar:
 *                       o fato que não morava em lugar nenhum vira o evento
 *                       da nota de peça (uma por peça, com histórico);
 *   registrarNota       a nota de uma fonte que já existe (feedback, recusa
 *                       com motivo, regra decidida, pedido à Vera): só a
 *                       leitura do JEV é gravada, nunca uma cópia da fonte.
 *
 * Só servidor.
 */

/** Fontes que não mudam depois de gravadas: só elas guardam resumo no registro. */
const FONTES_IMUTAVEIS: FonteDaNota[] = ["peca", "feedback", "recusa", "vera", "preferencia"];

const onde = (projectId: string, nota: string) => ({ projectId_type_key: { projectId, type: TIPO_DO_REGISTRO, key: nota } });

/**
 * Lê, muda e grava um registro com a guarda de concorrência: a escrita só vale
 * se a linha não mudou desde a leitura (card e post do mesmo dia chegam juntos).
 */
async function mudarRegistro(projectId: string, nota: string, mudar: (atual: RegistroDoCerebro | null) => RegistroDoCerebro | null): Promise<RegistroDoCerebro | null> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const linha = await prisma.projectMemory.findUnique({ where: onde(projectId, nota), select: { id: true, value: true, updatedAt: true } });
    const atual = linha ? (linha.value as unknown as RegistroDoCerebro) : null;
    const novo = mudar(atual && atual.v === 1 ? atual : null);
    if (!novo) return atual;
    if (linha) {
      const r = await prisma.projectMemory.updateMany({ where: { id: linha.id, updatedAt: linha.updatedAt }, data: { value: novo as never } });
      if (r.count === 1) return novo;
    } else {
      try {
        await prisma.projectMemory.create({ data: { projectId, type: TIPO_DO_REGISTRO, key: nota, value: novo as never } });
        return novo;
      } catch {
        // Outro pedido criou a linha no meio: lê de novo e soma.
      }
    }
  }
  console.warn(`[cerebro] ${projectId}/${nota}: desisti depois de 4 colisões`);
  return null;
}

const registroVazio = (nota: string, quando: string): RegistroDoCerebro => ({ v: 1, nota, tema: null, duradoura: null, confianca: null, ligacoes: [], lidoEm: null, quando });

/** A leitura do JEV gravada no registro (só os campos dela; o evento e o resumo ficam). */
async function lerEGravar(projectId: string, nota: NotaDoCerebro, perguntar?: Perguntar): Promise<void> {
  const todas = await carregarNotas(projectId);
  const leitura = await lerNotaPeloJev({ nova: nota, todas, projectId, perguntar });
  if (!leitura.lida) return;
  const agora = new Date().toISOString();
  await mudarRegistro(projectId, nota.id, (atual) => ({
    ...(atual ?? registroVazio(nota.id, agora)),
    esfera: nota.esfera,
    tema: leitura.tema,
    duradoura: leitura.duradoura,
    confianca: leitura.confianca,
    ligacoes: leitura.ligacoes,
    lidoEm: agora,
  }));
}

type DadosDaPeca = { rede: string | null; tipoDePeca: string | null; trecho: string | null; cardId: string | null; postId: string | null };

function tipoDaPeca(cardType: string | null | undefined, mediaType: string | null | undefined): string | null {
  if (cardType === "video_clip") return "corte de vídeo";
  if (cardType === "video_completo") return "vídeo completo";
  if (mediaType === "video") return "vídeo";
  if (mediaType === "carousel") return "carrossel";
  if (mediaType === "image" || cardType === "media") return "arte";
  if (cardType === "publish") return "dia da campanha";
  if (cardType === "research") return "pesquisa";
  return "post";
}

async function dadosDaPeca(projectId: string, a: { cardId?: string | null; postId?: string | null }): Promise<DadosDaPeca | null> {
  if (a.postId) {
    const p = await prisma.post.findUnique({ where: { id: a.postId }, select: { projectId: true, platform: true, mediaType: true, content: true } });
    if (!p || p.projectId !== projectId) return null;
    return { rede: p.platform, tipoDePeca: tipoDaPeca(null, p.mediaType), trecho: p.content, cardId: a.cardId ?? null, postId: a.postId };
  }
  if (a.cardId) {
    const c = await prisma.campaignCard.findUnique({ where: { id: a.cardId }, select: { projectId: true, postId: true, cardType: true, mediaType: true, content: true, metadata: true } });
    if (!c || c.projectId !== projectId) return null;
    const meta = (c.metadata as Record<string, unknown> | null) ?? {};
    const rede = typeof meta.platform === "string" ? meta.platform : c.cardType === "post_linkedin" ? "linkedin" : c.cardType === "post_twitter" ? "twitter" : null;
    const trecho = c.content && !c.content.startsWith("AVISO:") && c.content !== "infographic" ? c.content : null;
    return { rede, tipoDePeca: tipoDaPeca(c.cardType, c.mediaType), trecho, cardId: a.cardId, postId: c.postId ?? null };
  }
  return null;
}

/**
 * UM ATO DO CLIENTE NUMA PEÇA. A nota é da peça (post quando há, senão card):
 * aprovar e depois recusar a mesma peça muda o estado da nota, não cria duas.
 */
export async function registrarAtoNaPeca(a: {
  projectId: string;
  ato: AtoDaPeca;
  cardId?: string | null;
  postId?: string | null;
  detalhe?: string | null;
  perguntar?: Perguntar;
}): Promise<void> {
  try {
    const dados = await dadosDaPeca(a.projectId, a);
    if (!dados) return;
    const alvo: EventoDaPeca["alvo"] = dados.postId ? "post" : "card";
    const alvoId = (dados.postId ?? dados.cardId)!;
    const nota = idDaNotaDePeca({ alvo, alvoId });
    const agora = new Date().toISOString();
    let esferaAntes: string | null = null;
    const gravado = await mudarRegistro(a.projectId, nota, (atual) => {
      esferaAntes = atual?.esfera ?? null;
      const evento = somarAto(atual?.evento ?? null, { ato: a.ato, quando: agora, detalhe: a.detalhe ?? null }, { alvo, alvoId, ...dados }, HISTORICO_MAXIMO);
      const n = notaDaPeca(evento, a.projectId);
      // A correção do cliente continua valendo depois de um ato novo: o resumo é o texto dele.
      const resumo = atual?.correcao ? atual.resumo ?? null : n ? cortar(n.texto, 400) : null;
      return { ...(atual ?? registroVazio(nota, agora)), evento, resumo, esfera: n?.esfera ?? null, quando: agora };
    });
    if (!gravado?.evento) return;
    const n = notaDaPeca(gravado.evento, a.projectId);
    // O JEV relê quando a peça mudou de esfera (aprovada virou recusada) ou nunca foi lida.
    if (n && (!gravado.lidoEm || esferaAntes !== n.esfera || a.ato === "editou_texto")) await lerEGravar(a.projectId, n, a.perguntar);
  } catch (e) {
    console.warn(`[cerebro] ato ${a.ato} não registrado (ignorado): ${e instanceof Error ? e.message : e}`);
  }
}

/**
 * A NOTA DE UMA FONTE QUE JÁ EXISTE (feedback, recusa, regra, pedido à Vera):
 * grava o registro com a leitura do JEV. A fonte continua sendo a verdade.
 */
export async function registrarNota(projectId: string, notaId: string, opcoes: { perguntar?: Perguntar } = {}): Promise<void> {
  try {
    const todas = await carregarNotas(projectId);
    const nota = todas.find((n) => n.id === notaId);
    if (!nota) return;
    const agora = new Date().toISOString();
    await mudarRegistro(projectId, nota.id, (atual) => ({
      ...(atual ?? registroVazio(nota.id, agora)),
      esfera: nota.esfera,
      // Corrigida pelo cliente: o resumo já é a correção dele e não volta ao texto antigo.
      // O resumo é o que entra no prompt: as palavras do cliente (o texto editável
      // da fonte), não as linhas que a montagem acrescenta. A peça usa o texto
      // inteiro, que é o histórico dos atos.
      resumo: atual?.corrigidaEm ? atual.resumo ?? null : FONTES_IMUTAVEIS.includes(nota.fonte) ? cortar(nota.fonte === "peca" ? nota.texto : nota.editavel ?? nota.texto, 400) : null,
      quando: nota.quando ?? agora,
    }));
    const leitura = await lerNotaPeloJev({ nova: nota, todas, projectId, perguntar: opcoes.perguntar });
    if (!leitura.lida) return;
    await mudarRegistro(projectId, nota.id, (atual) => ({
      ...(atual ?? registroVazio(nota.id, agora)),
      tema: leitura.tema,
      duradoura: leitura.duradoura,
      confianca: leitura.confianca,
      ligacoes: leitura.ligacoes,
      lidoEm: new Date().toISOString(),
    }));
  } catch (e) {
    console.warn(`[cerebro] nota ${notaId} não registrada (ignorado): ${e instanceof Error ? e.message : e}`);
  }
}
