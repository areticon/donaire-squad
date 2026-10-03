import { prisma } from "@/lib/db/prisma";
import { modeloPorId } from "@/lib/modelos-de-arte/catalogo";

/**
 * A ESCOLHA DE MODELOS DO PROJETO (03/10/2026): os ids do book que o cliente
 * marcou. Mora em `ProjectMemory` (tipo "estilo", chave "modelos-de-arte"), ao
 * lado da direção visual própria (lib/media/estilo-do-cliente.ts), sem coluna
 * nova. Vale para todas as artes do projeto até ele mudar em Configurações.
 */

export const TIPO_DA_ESCOLHA = "estilo";
export const CHAVE_DA_ESCOLHA = "modelos-de-arte";

export interface EscolhaDeModelos {
  ids: string[];
  em: string;
}

export async function lerModelosEscolhidos(projectId: string): Promise<EscolhaDeModelos | null> {
  const m = await prisma.projectMemory.findUnique({
    where: { projectId_type_key: { projectId, type: TIPO_DA_ESCOLHA, key: CHAVE_DA_ESCOLHA } },
    select: { value: true },
  });
  const v = m?.value as Partial<EscolhaDeModelos> | null;
  const ids = Array.isArray(v?.ids) ? v!.ids.filter((id): id is string => typeof id === "string" && Boolean(modeloPorId(id))) : [];
  if (!ids.length) return null;
  return { ids, em: typeof v?.em === "string" ? v.em : "" };
}

export async function salvarModelosEscolhidos(projectId: string, ids: string[]): Promise<EscolhaDeModelos | null> {
  const validos = [...new Set(ids)].filter((id) => Boolean(modeloPorId(id))).slice(0, 12);
  if (!validos.length) {
    await prisma.projectMemory
      .delete({ where: { projectId_type_key: { projectId, type: TIPO_DA_ESCOLHA, key: CHAVE_DA_ESCOLHA } } })
      .catch(() => {});
    return null;
  }
  const valor: EscolhaDeModelos = { ids: validos, em: new Date().toISOString() };
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO_DA_ESCOLHA, key: CHAVE_DA_ESCOLHA } },
    create: { projectId, type: TIPO_DA_ESCOLHA, key: CHAVE_DA_ESCOLHA, value: valor as never },
    update: { value: valor as never },
  });
  return valor;
}
