import { createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Caixa, redesLigadas } from "@/lib/referencias/config";
import { sugerirPerfis } from "@/lib/referencias/descobrir";
import { comecarEstudo, lerEstudo, rodarEstudo } from "@/lib/referencias/andamento";
import { etiquetarExtras } from "@/lib/referencias/etiquetas-extras";
import { achadosDoProjeto } from "@/lib/referencias/achados";
import { proporRegras, CUSTO_DAS_PROPOSTAS_USD } from "@/lib/referencias/regras";
import { buscarTendencias, estimativaDasTendencias, lerTendencias, liberadaEm } from "@/lib/referencias/tendencias";
import { cabeNoMes, tetoPorExecucaoUsd } from "@/lib/referencias/tetos";
import { MAX_REFERENCIAS_POR_CONTA } from "@/lib/referencias/tipos";
import type { EstadoDaAnalise, EtapaDaAnalise } from "@/lib/referencias/tipos-das-analises";

/**
 * AS ANÁLISES DAS REFERÊNCIAS EM SEGUNDO PLANO (02/10/2026).
 *
 * Um pedido ("estudar o nicho" na criação do projeto, "atualizar as regras"
 * ou "buscar tendências" no painel) vira uma lista de ETAPAS gravada em
 * ProjectMemory (tipo "analise_ref", chave "estado"). A rota responde 202 na
 * hora e o trabalho anda em `after`, nunca preso ao clique.
 *
 * O TEMPO: a função morre aos 800 s. O estudo sozinho já usa quase tudo (7
 * min para ler perfis e 9 para medir vídeos, lib/referencias/estudo.ts), então
 * ele SEMPRE começa numa execução nova: antes dele e depois dele, a execução
 * passa a vez para outra, com um POST assinado para a mesma rota
 * ("continuar"). Os grupos ficam:
 *     [descobrir, confirmar]  [estudar]  [etiquetar, regras, tendencias]
 * Cada grupo cabe com folga nos 800 s.
 *
 * QUEM MORRE: a única falha que o código não grava é a função derrubada pela
 * plataforma. Por isso o estado leva `prazoEm` (renovado a cada etapa), e
 * quem LÊ declara parado o que passou dele (a regra da fila,
 * lib/fila/trabalhos.ts). A tela mostra "parou no meio" e o botão continua
 * de onde parou. Erro gravado some quando o próximo pedido começa.
 *
 * O DINHEIRO: cada etapa paga é uma execução com o seu caixa de US$ 0,30, e
 * nenhuma começa se o mês já passou do teto (lib/referencias/tetos.ts).
 */

const TIPO = "analise_ref";
const CHAVE = "estado";
/** A função morre aos 800 s; 830 é certeza de que não volta. */
const PRAZO_MS = 830_000;
/** Etapas que pedem uma execução só para elas (o estudo). */
const PESADAS: EtapaDaAnalise[] = ["estudar"];
/** Quantos perfis a criação confirma sozinha (o cliente tira qualquer um depois). */
const CONFIRMAR_NA_CRIACAO = 4;

const onde = (projectId: string) => ({ projectId_type_key: { projectId, type: TIPO, key: CHAVE } });

export const PEDIDOS: Record<"criacao" | "analisar" | "tendencias", EtapaDaAnalise[]> = {
  criacao: ["descobrir", "confirmar", "estudar", "etiquetar", "regras", "tendencias"],
  analisar: ["etiquetar", "regras"],
  tendencias: ["tendencias"],
};

/** A assinatura do POST interno "continuar" (finalidade própria, como a do piloto). */
export function assinarContinuacao(projectId: string): string {
  const segredo = process.env.PILOTO_SECRET ?? process.env.BETTER_AUTH_SECRET ?? "demandou";
  return createHmac("sha256", segredo).update(`analise-ref:${projectId}`).digest("hex");
}

export function continuacaoValida(projectId: string, assinatura: string | null): boolean {
  if (!assinatura) return false;
  const esperada = assinarContinuacao(projectId);
  return assinatura.length === esperada.length && timingSafeEqual(Buffer.from(assinatura), Buffer.from(esperada));
}

type EstadoGravado = EstadoDaAnalise & { base?: string | null; userId?: string };

export async function lerAnalise(projectId: string): Promise<{ estado: EstadoGravado | null; parado: boolean }> {
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId), select: { value: true } });
  const estado = (linha?.value as unknown as EstadoGravado | undefined) ?? null;
  if (!estado) return { estado: null, parado: false };
  const parado = estado.status === "rodando" && Date.now() > new Date(estado.prazoEm).getTime();
  return { estado, parado };
}

async function gravar(projectId: string, e: EstadoGravado) {
  await prisma.projectMemory.update({ where: onde(projectId), data: { value: e as unknown as Prisma.InputJsonValue } }).catch((err) => {
    console.error(`[analise-ref][${projectId}] não gravei o estado: ${err instanceof Error ? err.message : err}`);
  });
}

/**
 * Registra um pedido. Devolve null se já há um vivo (dois cliques, duas
 * abas): o segundo não começa outro por cima. O erro do pedido anterior some
 * aqui, quando o novo começa.
 */
export async function pedirAnalise(
  projectId: string,
  opcoes: { tipo: keyof typeof PEDIDOS; origem: EstadoDaAnalise["origem"]; base: string; userId: string }
): Promise<EstadoGravado | null> {
  const agora = new Date();
  const etapas = PEDIDOS[opcoes.tipo];
  const estado: EstadoGravado = {
    status: "rodando",
    etapa: etapas[0],
    etapas,
    origem: opcoes.origem,
    pedidoEm: agora.toISOString(),
    prazoEm: new Date(agora.getTime() + PRAZO_MS).toISOString(),
    terminadoEm: null,
    erro: null,
    avisos: [],
    custo: { apifyUsd: 0, iaUsdEstimado: 0 },
    base: opcoes.base,
    userId: opcoes.userId,
  };
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId), select: { id: true, value: true, updatedAt: true } });
  if (linha) {
    const anterior = linha.value as unknown as EstadoGravado;
    const vivo = anterior.status === "rodando" && Date.now() <= new Date(anterior.prazoEm).getTime();
    if (vivo) return null;
    // A reserva é o updatedAt no FILTRO: de dois cliques ao mesmo tempo, só um muda a linha.
    const r = await prisma.projectMemory.updateMany({ where: { id: linha.id, updatedAt: linha.updatedAt }, data: { value: estado as unknown as Prisma.InputJsonValue } });
    if (r.count === 0) return null;
  } else {
    try {
      await prisma.projectMemory.create({ data: { projectId, type: TIPO, key: CHAVE, value: estado as unknown as Prisma.InputJsonValue } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
  }
  return estado;
}

/** Retoma um pedido parado (função morta) ou que falhou, de onde ele estava. */
export async function retomarAnalise(projectId: string, base: string): Promise<EstadoGravado | null> {
  const { estado, parado } = await lerAnalise(projectId);
  if (!estado || !(parado || estado.status === "erro")) return null;
  const retomado: EstadoGravado = { ...estado, status: "rodando", terminadoEm: null, prazoEm: new Date(Date.now() + PRAZO_MS).toISOString(), base, erro: null };
  await gravar(projectId, retomado);
  return retomado;
}

/** Passa a vez para uma execução nova (POST assinado na mesma rota). */
async function passarAVez(projectId: string, base: string): Promise<boolean> {
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/api/projects/${projectId}/referencias/analises`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-analise-assinatura": assinarContinuacao(projectId) },
      body: JSON.stringify({ acao: "continuar" }),
      signal: AbortSignal.timeout(30_000),
    });
    return r.status === 202;
  } catch (e) {
    console.error(`[analise-ref][${projectId}] não consegui passar a vez: ${e instanceof Error ? e.message : e}`);
    return false;
  }
}

/** Uma etapa. Devolve avisos para a tela (sem fornecedor nem dólar) e o custo. */
async function rodarEtapa(projectId: string, etapa: EtapaDaAnalise, estado: EstadoGravado): Promise<{ avisos: string[]; apifyUsd?: number; iaUsd?: number }> {
  switch (etapa) {
    case "descobrir": {
      if (!redesLigadas().length) return { avisos: ["o estudo de referências está desligado nesta conta"] };
      const ja = await prisma.referenciaPerfil.count({ where: { projectId, status: { in: ["confirmado", "sugerido"] } } });
      if (ja >= 4) return { avisos: [] };
      const mes = await cabeNoMes(0.2);
      if (!mes.cabe) return { avisos: ["a busca de perfis ficou para depois: o limite de leitura do mês acabou (código REF-MES)"] };
      const caixa = new Caixa(tetoPorExecucaoUsd());
      const r = await sugerirPerfis(projectId, { caixa });
      if (r.avisos.length) console.warn(`[analise-ref][${projectId}] descoberta: ${r.avisos.join(" ; ")}`);
      return { avisos: r.sugeridos ? [] : ["não achei perfis novos do seu nicho agora; você pode indicar os seus no painel"], apifyUsd: r.custoUsd };
    }
    case "confirmar": {
      const confirmados = await prisma.referenciaPerfil.count({ where: { projectId, status: "confirmado" } });
      if (confirmados >= 3) return { avisos: [] };
      const projeto = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { userId: true } });
      const naConta = await prisma.referenciaPerfil.count({ where: { status: "confirmado", project: { userId: projeto.userId } } });
      const vagas = Math.min(CONFIRMAR_NA_CRIACAO - confirmados, MAX_REFERENCIAS_POR_CONTA - naConta);
      if (vagas <= 0) return { avisos: [`a conta já tem ${MAX_REFERENCIAS_POR_CONTA} perfis confirmados; o estudo usa os que já estão lá`] };
      const ligadas = redesLigadas();
      const sugeridos = await prisma.referenciaPerfil.findMany({ where: { projectId, status: "sugerido", origem: "roberto" }, orderBy: { seguidores: "desc" } });
      // Uma rede de cada antes de repetir: o estudo compara formatos de redes diferentes.
      const escolhidos: typeof sugeridos = [];
      for (const rodada of [0, 1, 2]) {
        for (const s of sugeridos) {
          if (escolhidos.length >= vagas || escolhidos.includes(s) || !ligadas.includes(s.rede as never)) continue;
          if (escolhidos.filter((e) => e.rede === s.rede).length > rodada) continue;
          escolhidos.push(s);
        }
      }
      if (escolhidos.length) await prisma.referenciaPerfil.updateMany({ where: { id: { in: escolhidos.map((e) => e.id) } }, data: { status: "confirmado" } });
      return { avisos: escolhidos.length ? [`confirmei ${escolhidos.length} perfis sugeridos pelo Roberto; tire qualquer um em Linha editorial, Perfis de referência`] : [] };
    }
    case "estudar": {
      const perfis = await prisma.referenciaPerfil.count({ where: { projectId, status: "confirmado" } });
      if (!perfis) return { avisos: ["nenhum perfil confirmado para estudar ainda"] };
      // Estudo recente (menos de 6 h) não paga de novo.
      const ultimo = await lerEstudo(projectId);
      if (ultimo?.estado === "pronto" && ultimo.terminadoEm && Date.now() - new Date(ultimo.terminadoEm).getTime() < 6 * 3600_000) return { avisos: [] };
      const mes = await cabeNoMes(0.25);
      if (!mes.cabe) return { avisos: ["o estudo ficou para depois: o limite de leitura do mês acabou (código REF-MES)"] };
      const andamento = await comecarEstudo(projectId, perfis);
      if (!andamento) return { avisos: ["já havia um estudo rodando; as análises usam o que ele trouxer"] };
      const r = await rodarEstudo(projectId, andamento, { caixa: new Caixa(tetoPorExecucaoUsd()), limiteDeMedidas: 16 });
      return { avisos: (r?.falhas ?? []).slice(0, 3), apifyUsd: r?.custoUsd ?? 0 };
    }
    case "etiquetar": {
      const r = await etiquetarExtras(projectId);
      return { avisos: [], iaUsd: r.custoUsd };
    }
    case "regras": {
      const { achados } = await achadosDoProjeto(projectId);
      if (!achados.length) return { avisos: ["ainda não há posts suficientes para propor regras"] };
      const r = await proporRegras(projectId, achados);
      estado.regrasEm = new Date().toISOString();
      return { avisos: r.novas.length ? [] : ["nenhuma regra nova desta vez: as que fazem sentido já estão na lista"], iaUsd: CUSTO_DAS_PROPOSTAS_USD };
    }
    case "tendencias": {
      // Na criação, uma busca das últimas 24 h serve; no painel, o pedido é explícito.
      const anterior = await lerTendencias(projectId);
      if (estado.origem === "criacao" && liberadaEm(anterior)) return { avisos: [] };
      const r = await buscarTendencias(projectId, { forcar: true });
      const est = estimativaDasTendencias();
      return { avisos: r.itens.length ? [] : ["não achei tendências com prova suficiente nesta semana"], apifyUsd: Math.max(0, r.custoUsd - est.iaUsd), iaUsd: est.iaUsd };
    }
    default:
      return { avisos: [] };
  }
}

/**
 * Roda as etapas que faltam, a partir da etapa gravada. Chamada em `after` pela
 * rota (no pedido e em cada "continuar"). Sempre termina o estado: pronto, erro
 * com a mensagem para o cliente, ou a vez passada para a execução seguinte.
 */
export async function rodarAnalise(projectId: string): Promise<void> {
  const inicio = Date.now();
  const { estado } = await lerAnalise(projectId);
  if (!estado || estado.status !== "rodando") return;
  const e: EstadoGravado = { ...estado, prazoEm: new Date(Date.now() + PRAZO_MS).toISOString() };
  await gravar(projectId, e);
  let i = Math.max(0, e.etapas.indexOf(e.etapa));
  let rodouAlguma = false;
  try {
    for (; i < e.etapas.length; i++) {
      const etapa = e.etapas[i];
      // A etapa pesada começa sempre numa execução nova, e a que vem depois dela também.
      const anteriorPesada = rodouAlguma && PESADAS.includes(e.etapas[i - 1]);
      if (rodouAlguma && (PESADAS.includes(etapa) || anteriorPesada || Date.now() - inicio > 420_000) && e.base) {
        e.etapa = etapa;
        await gravar(projectId, e);
        if (await passarAVez(projectId, e.base)) return;
        // Não conseguiu passar a vez: segue aqui mesmo, se ainda couber.
        if (Date.now() - inicio > 300_000) throw new Error("não consegui continuar em segundo plano");
      }
      e.etapa = etapa;
      e.prazoEm = new Date(Date.now() + PRAZO_MS).toISOString();
      await gravar(projectId, e);
      const t0 = Date.now();
      const r = await rodarEtapa(projectId, etapa, e);
      console.log(`[analise-ref][${projectId}] ${etapa} em ${Math.round((Date.now() - t0) / 1000)}s${r.apifyUsd ? `, Apify US$ ${r.apifyUsd.toFixed(3)}` : ""}${r.iaUsd ? `, IA ~US$ ${r.iaUsd.toFixed(3)}` : ""}`);
      e.avisos = [...new Set([...e.avisos, ...r.avisos])].slice(0, 8);
      e.custo = {
        apifyUsd: Math.round((e.custo.apifyUsd + (r.apifyUsd ?? 0)) * 1000) / 1000,
        iaUsdEstimado: Math.round((e.custo.iaUsdEstimado + (r.iaUsd ?? 0)) * 1000) / 1000,
      };
      rodouAlguma = true;
    }
    e.status = "pronto";
    e.etapa = "pronto";
    e.terminadoEm = new Date().toISOString();
    await gravar(projectId, e);
  } catch (err) {
    console.error(`[analise-ref][${projectId}] ${e.etapa} falhou:`, err);
    e.status = "erro";
    e.terminadoEm = new Date().toISOString();
    e.erro = `Não consegui terminar a etapa "${e.etapa}" agora (código REF-ANL). O que já foi feito ficou guardado; clique em continuar em alguns minutos e, se repetir, abra um chamado com o código.`;
    await gravar(projectId, e);
  }
}
