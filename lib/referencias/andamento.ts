import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { estudarReferencias, type ResultadoDoEstudo } from "@/lib/referencias/estudo";
import type { EstudoNaTela } from "@/lib/referencias/tipos";

/**
 * O ANDAMENTO DO "ESTUDAR AGORA" (01/10), gravado para a tela acompanhar.
 *
 * Por que existe: até 01/10 o estudo rodava DENTRO da requisição do clique.
 * Medido em produção no projeto Demandou: o POST entrou às 02:24:08 UTC e só
 * voltou às 02:29:30 (5 min 22 s: coleta, etiqueta, cartões e a medida de 22
 * vídeos). Esse tempo todo o botão só girava, sem dizer em que perfil estava,
 * e qualquer corte no meio (teto de 800 s da função, publicação, aba fechada,
 * rede do celular trocando) deixava a pessoa sem resposta nenhuma.
 *
 * Agora o clique só dispara: a rota grava "estudando" aqui, responde na hora
 * e roda o estudo em `after`. A tela consulta este estado a cada poucos
 * segundos (GET ?estudo=1) e mostra "estudando 2 de 5", o resumo no fim ou o
 * motivo da falha.
 *
 * Fica em `project_memories` (tipo "referencias-estudo"), o mesmo lugar do
 * gêmeo, para não precisar de migração. Uma linha por projeto, reescrita a
 * cada estudo: o erro de um estudo some quando o próximo começa.
 *
 * A única falha que o código não consegue gravar é a função morta pela
 * plataforma: o `catch` nunca roda. Por isso quem LÊ declara morto o estudo
 * que passou do prazo (a mesma regra da fila, lib/fila/trabalhos.ts).
 */

const TIPO = "referencias-estudo";
const CHAVE = "atual";

/** A função morre aos 800 s (maxDuration da rota); 830 é certeza de que não volta. */
export const PRAZO_DO_ESTUDO_MS = 830_000;

const onde = (projectId: string) => ({ projectId_type_key: { projectId, type: TIPO, key: CHAVE } });

function morreuNoPrazo(e: EstudoNaTela, agora = Date.now()): boolean {
  return e.estado === "estudando" && agora - new Date(e.iniciadoEm).getTime() > PRAZO_DO_ESTUDO_MS;
}

/** O estado do último estudo do projeto (ou null se nunca estudou por aqui). */
export async function lerEstudo(projectId: string): Promise<EstudoNaTela | null> {
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId), select: { id: true, value: true, updatedAt: true } });
  if (!linha) return null;
  const e = linha.value as unknown as EstudoNaTela;
  if (!morreuNoPrazo(e)) return e;
  const morto: EstudoNaTela = {
    ...e,
    estado: "falhou",
    terminadoEm: new Date().toISOString(),
    etapa: null,
    erro:
      "O estudo passou do tempo máximo (13 minutos) e foi interrompido no meio" +
      (e.perfil ? ` (estava em ${e.perfil})` : "") +
      ". O que já tinha sido lido ficou guardado; clique em Estudar agora para continuar.",
  };
  // Grava só se ninguém mexeu desde a leitura (outro estudo pode ter começado).
  await prisma.projectMemory
    .updateMany({ where: { id: linha.id, updatedAt: linha.updatedAt }, data: { value: morto as unknown as Prisma.InputJsonValue } })
    .catch(() => {});
  return morto;
}

export type Andamento = {
  estudo: EstudoNaTela;
  avancar: (parcial: Partial<EstudoNaTela>) => Promise<void>;
  terminar: (fim: { resumo: string; avisos: string[] } | { erro: string; avisos?: string[] }) => Promise<void>;
};

/**
 * Marca o começo de um estudo. Devolve null se já há um estudo vivo no
 * projeto (dois cliques, duas abas): o segundo não começa outro por cima.
 */
export async function comecarEstudo(projectId: string, total: number): Promise<Andamento | null> {
  const estudo: EstudoNaTela = {
    estado: "estudando",
    iniciadoEm: new Date().toISOString(),
    terminadoEm: null,
    etapa: "coletando",
    atual: 0,
    total,
    perfil: null,
    resumo: null,
    erro: null,
    avisos: [],
  };
  const valor = () => estudo as unknown as Prisma.InputJsonValue;
  const linha = await prisma.projectMemory.findUnique({ where: onde(projectId), select: { id: true, value: true, updatedAt: true } });
  if (linha) {
    const anterior = linha.value as unknown as EstudoNaTela;
    if (anterior.estado === "estudando" && !morreuNoPrazo(anterior)) return null;
    // A reserva é o updatedAt no FILTRO: de dois cliques ao mesmo tempo, só um muda a linha.
    const r = await prisma.projectMemory.updateMany({ where: { id: linha.id, updatedAt: linha.updatedAt }, data: { value: valor() } });
    if (r.count === 0) return null;
  } else {
    try {
      await prisma.projectMemory.create({ data: { projectId, type: TIPO, key: CHAVE, value: valor() } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return null;
      throw e;
    }
  }

  // O andamento nunca derruba o estudo: se a gravação falhar, o estudo segue.
  const gravar = async () => {
    await prisma.projectMemory.update({ where: onde(projectId), data: { value: valor() } }).catch((e) => {
      console.error(`[referencias][andamento] ${e instanceof Error ? e.message : e}`);
    });
  };
  return {
    estudo,
    avancar: async (parcial) => {
      Object.assign(estudo, parcial);
      await gravar();
    },
    terminar: async (fim) => {
      Object.assign(estudo, {
        estado: "erro" in fim ? "falhou" : "pronto",
        terminadoEm: new Date().toISOString(),
        etapa: null,
        perfil: null,
        resumo: "resumo" in fim ? fim.resumo : null,
        erro: "erro" in fim ? fim.erro : null,
        avisos: (fim.avisos ?? []).slice(0, 8),
      } satisfies Partial<EstudoNaTela>);
      await gravar();
    },
  };
}

/**
 * Roda o estudo gravando o andamento, e SEMPRE termina o estado: pronto com
 * o resumo, ou falhou com o motivo. É o que a rota chama em `after` e o que o
 * teste local chama igual. O detalhe técnico vai para o log; a tela recebe só
 * o que é do cliente (regra de 21/09, lib/media/falha-do-video.ts).
 */
export async function rodarEstudo(
  projectId: string,
  andamento: Andamento,
  opcoes?: Omit<Parameters<typeof estudarReferencias>[1], "aoAvancar">
): Promise<ResultadoDoEstudo | null> {
  const t0 = Date.now();
  try {
    const r = await estudarReferencias(projectId, { ...opcoes, aoAvancar: (p) => andamento.avancar(p) });
    const falhas = r.falhas ?? [];
    console.log(
      `[referencias][estudar][${projectId}] ${Math.round((Date.now() - t0) / 1000)}s, ${r.lidos ?? 0}/${r.perfis} perfis, ${r.posts} posts, ${r.padroes.length} padrões, ${r.medidos ?? 0} medidos, US$ ${r.custoUsd}` +
        (r.avisos.length ? ` | avisos: ${r.avisos.join(" ; ")}` : "")
    );
    if (!r.lidos && falhas.length) {
      await andamento.terminar({ erro: "Nenhum perfil pôde ser lido desta vez. Veja o motivo de cada um abaixo.", avisos: falhas });
    } else {
      const partes = [`${r.lidos ?? 0} de ${r.perfis} perfis lidos`, `${r.posts} posts estudados`, `${r.padroes.length} padrões encontrados`];
      if (r.medidos) partes.push(`${r.medidos} vídeos medidos`);
      await andamento.terminar({ resumo: partes.join(", ") + ".", avisos: falhas });
    }
    return r;
  } catch (e) {
    console.error(`[referencias][estudar][${projectId}] falhou em ${Math.round((Date.now() - t0) / 1000)}s:`, e);
    await andamento.terminar({
      erro: "Não consegui terminar o estudo agora (código REF-500). Os perfis já lidos ficaram guardados; tente de novo em alguns minutos e, se repetir, abra um chamado com o código.",
    });
    return null;
  }
}
