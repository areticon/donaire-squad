import { prisma } from "@/lib/db/prisma";
import { decidirRegra } from "@/lib/referencias/regras";
import { cortar, semTravessao } from "@/lib/cerebro/montagem";
import { acoesDaNota, TIPO_DO_REGISTRO, type FonteDaNota, type RegistroDoCerebro } from "@/lib/cerebro/tipos";

/**
 * CORRIGIR, APAGAR E ENCERRAR (06/10/2026). Os termos dizem que a memória do
 * projeto é exclusiva do cliente: ele consulta, corrige, apaga e pede cópia, e
 * ela é apagada no encerramento. Aqui moram as três escritas do cérebro que
 * o CLIENTE pede (a captura, em `captura.ts`, é a do produto).
 *
 * A REGRA DE OURO: corrigir ou apagar vai para a FONTE. Apagar o feedback
 * apaga a linha do feedback; apagar a regra apaga a regra. Esconder a nota e
 * deixar o dado onde estava seria dizer ao cliente que apagou o que continua
 * guardado. Só a peça e o pedido à Vera, cuja fonte é o próprio registro do
 * cérebro, são corrigidos no registro.
 *
 * Só servidor; quem chama já conferiu que a pessoa é o dono do projeto.
 */

export type ResultadoDaEdicao = { ok: true } | { ok: false; motivo: string };

const fonteDe = (notaId: string): FonteDaNota | null => {
  const f = notaId.split(":")[0];
  const conhecidas: FonteDaNota[] = ["peca", "regra", "restricao", "contexto", "material", "referencia", "feedback", "preferencia", "recusa", "vera", "design", "roteiro"];
  if (notaId.startsWith("tom:")) return "projeto";
  return (conhecidas as string[]).includes(f) ? (f as FonteDaNota) : null;
};

/** O id da linha da fonte, sem o prefixo ("regra:abc" -> "abc"; "peca:post:x" -> "post:x"). */
const resto = (notaId: string) => notaId.slice(notaId.indexOf(":") + 1);

const ondeRegistro = (projectId: string, nota: string) => ({ projectId_type_key: { projectId, type: TIPO_DO_REGISTRO, key: nota } });

async function mudarValorDaMemoria(projectId: string, type: string, key: string, mudar: (v: Record<string, unknown>) => Record<string, unknown>): Promise<boolean> {
  const linha = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type, key } }, select: { value: true } });
  if (!linha) return false;
  const v = (linha.value && typeof linha.value === "object" ? linha.value : {}) as Record<string, unknown>;
  await prisma.projectMemory.update({ where: { projectId_type_key: { projectId, type, key } }, data: { value: mudar(v) as never } });
  return true;
}

/** O resumo do registro acompanha a correção: é ele que entra no prompt dos agentes. */
async function corrigirResumo(projectId: string, notaId: string, texto: string, noRegistro: boolean): Promise<void> {
  const linha = await prisma.projectMemory.findUnique({ where: ondeRegistro(projectId, notaId), select: { value: true } });
  const agora = new Date().toISOString();
  const atual = (linha?.value as unknown as RegistroDoCerebro | undefined) ?? null;
  const novo: RegistroDoCerebro = {
    ...(atual && atual.v === 1 ? atual : { v: 1, nota: notaId, tema: null, duradoura: null, confianca: null, ligacoes: [], lidoEm: null, quando: agora }),
    resumo: cortar(texto, 400),
    corrigidaEm: agora,
    ...(noRegistro ? { correcao: texto } : {}),
  };
  await prisma.projectMemory.upsert({
    where: ondeRegistro(projectId, notaId),
    create: { projectId, type: TIPO_DO_REGISTRO, key: notaId, value: novo as never },
    update: { value: novo as never },
  });
}

export async function corrigirNota(projectId: string, notaId: string, textoBruto: string): Promise<ResultadoDaEdicao> {
  const texto = semTravessao(String(textoBruto ?? "").trim()).slice(0, 2000);
  if (texto.length < 2) return { ok: false, motivo: "Escreva o texto corrigido." };
  const fonte = fonteDe(notaId);
  if (!fonte || acoesDaNota(fonte).corrigir !== "aqui") return { ok: false, motivo: "Esta nota se corrige na tela onde ela mora." };
  const id = resto(notaId);
  switch (fonte) {
    case "regra": {
      const r = await decidirRegra(projectId, id, { acao: "editar", texto });
      if (!r) return { ok: false, motivo: "Essa regra não existe mais." };
      return { ok: true };
    }
    case "feedback": {
      const r = await prisma.feedbackDoProduto.updateMany({ where: { id, projectId }, data: { texto } });
      if (!r.count) return { ok: false, motivo: "Esse pedido não existe mais." };
      await corrigirResumo(projectId, notaId, texto, false);
      return { ok: true };
    }
    case "preferencia": {
      if (!(await mudarValorDaMemoria(projectId, "preference", id, (v) => ({ ...v, instruction: texto })))) return { ok: false, motivo: "Esse pedido não existe mais." };
      await corrigirResumo(projectId, notaId, texto, false);
      return { ok: true };
    }
    case "recusa": {
      if (!(await mudarValorDaMemoria(projectId, "rejection", id, (v) => ({ ...v, reason: texto })))) return { ok: false, motivo: "Essa recusa não existe mais." };
      await corrigirResumo(projectId, notaId, texto, false);
      return { ok: true };
    }
    case "peca":
    case "vera": {
      if (fonte === "vera") {
        const existe = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type: "vera-pedido", key: id } }, select: { id: true } });
        if (!existe) return { ok: false, motivo: "Esse pedido não existe mais." };
      } else {
        const existe = await prisma.projectMemory.findUnique({ where: ondeRegistro(projectId, notaId), select: { id: true } });
        if (!existe) return { ok: false, motivo: "Essa nota não existe mais." };
      }
      await corrigirResumo(projectId, notaId, texto, true);
      return { ok: true };
    }
    default:
      return { ok: false, motivo: "Esta nota se corrige na tela onde ela mora." };
  }
}

/** Tira a nota apagada das ligações das outras (senão o registro guardaria o id de algo que não existe). */
async function tirarDasLigacoes(projectId: string, notaId: string): Promise<void> {
  const linhas = await prisma.projectMemory.findMany({ where: { projectId, type: TIPO_DO_REGISTRO }, select: { id: true, value: true } });
  for (const l of linhas) {
    const r = l.value as unknown as RegistroDoCerebro;
    if (!Array.isArray(r?.ligacoes) || !r.ligacoes.some((x) => x?.para === notaId)) continue;
    await prisma.projectMemory.update({ where: { id: l.id }, data: { value: { ...r, ligacoes: r.ligacoes.filter((x) => x?.para !== notaId) } as never } });
  }
}

export async function apagarNota(projectId: string, notaId: string): Promise<ResultadoDaEdicao> {
  const fonte = fonteDe(notaId);
  if (!fonte || acoesDaNota(fonte).apagar !== "aqui") return { ok: false, motivo: "Esta nota se apaga na tela onde ela mora." };
  const id = resto(notaId);
  switch (fonte) {
    case "feedback":
      await prisma.feedbackDoProduto.deleteMany({ where: { id, projectId } });
      break;
    case "preferencia":
      await prisma.projectMemory.deleteMany({ where: { projectId, type: "preference", key: id } });
      break;
    case "recusa":
      await prisma.projectMemory.deleteMany({ where: { projectId, type: "rejection", key: id } });
      break;
    case "vera":
      await prisma.projectMemory.deleteMany({ where: { projectId, type: "vera-pedido", key: id } });
      break;
    case "regra":
      await prisma.projectMemory.deleteMany({ where: { projectId, type: "regra", key: id } });
      break;
    case "restricao":
      await prisma.projectMemory.deleteMany({ where: { projectId, type: "restricao", key: "nao_citar" } });
      break;
    case "peca":
      break; // a fonte é o próprio registro, apagado abaixo
    default:
      return { ok: false, motivo: "Esta nota se apaga na tela onde ela mora." };
  }
  await prisma.projectMemory.deleteMany({ where: { projectId, type: TIPO_DO_REGISTRO, key: notaId } });
  await tirarDasLigacoes(projectId, notaId);
  return { ok: true };
}

/**
 * O FIM DA MEMÓRIA DO PROJETO: o que não sai em cascata com o projeto.
 *
 * `project_memories`, documentos, materiais, referências e roteiros têm chave
 * estrangeira com cascata e somem com o projeto. O feedback do produto e o elo
 * com a biblioteca de design guardam o projectId sem chave estrangeira (são de
 * 06/10, lidos pelo painel do admin), então ficariam para trás: saem aqui. Na
 * biblioteca pública, o design que nasceu do pedido deste cliente perde o elo
 * com o projeto e com a conta (a galeria nunca mostrou o nome).
 *
 * Chamada ao apagar o projeto. O encerramento do contrato, quando tiver rotina
 * própria, chama esta mesma função para cada projeto da conta.
 */
export async function apagarMemoriaDoProjeto(projectId: string): Promise<{ feedbacks: number; designs: number; registros: number }> {
  const ignorar = <T,>(p: Promise<T>, padrao: T) => p.catch((e: unknown) => (console.warn(`[cerebro] encerrar ${projectId}: ${e instanceof Error ? e.message : e}`), padrao));
  const [fb, ds, , rg] = await Promise.all([
    ignorar(prisma.feedbackDoProduto.deleteMany({ where: { projectId } }), { count: 0 }),
    ignorar(prisma.designDoProjeto.deleteMany({ where: { projectId } }), { count: 0 }),
    ignorar(prisma.designDaBiblioteca.updateMany({ where: { criadoPorProjectId: projectId }, data: { criadoPorProjectId: null, criadoPorUserId: null } }), { count: 0 }),
    ignorar(prisma.projectMemory.deleteMany({ where: { projectId, type: TIPO_DO_REGISTRO } }), { count: 0 }),
  ]);
  return { feedbacks: fb.count, designs: ds.count, registros: rg.count };
}
