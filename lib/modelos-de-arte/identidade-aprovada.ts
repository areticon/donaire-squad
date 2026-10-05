import { prisma } from "@/lib/db/prisma";
import { PALETA_PADRAO_DA_PLATAFORMA, identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { lerModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";
import {
  LETRA_PADRAO,
  identidadeAprovada,
  letraValida,
  normalizarPapeis,
  paletaParaOsPapeis,
  papeisPadrao,
  type IdentidadeVisualEscolhida,
  type LetraId,
  type PapeisEscolhidos,
} from "@/lib/modelos-de-arte/identidade";
import { FOTOS_PADRAO, fotosValidas, type FotosDaIdentidade } from "@/lib/modelos-de-arte/tratamento";

/**
 * O REGISTRO DA IDENTIDADE APROVADA (05/10/2026), no banco.
 *
 * Mora em `ProjectMemory` (tipo "estilo", chave "identidade-visual"), ao lado
 * da escolha de modelos (lib/modelos-de-arte/escolha.ts), sem coluna nova. A
 * regra do que conta como aprovada é pura e vive em identidade.ts; aqui só se
 * lê e grava. Qualquer mudança (letra, papéis ou modelos) derruba a
 * aprovação: o que os agentes geram tem que ser exatamente o que o cliente
 * viu e aprovou.
 */

export const TIPO_DA_IDENTIDADE = "estilo";
export const CHAVE_DA_IDENTIDADE = "identidade-visual";

export async function lerIdentidadeVisual(projectId: string): Promise<IdentidadeVisualEscolhida | null> {
  const m = await prisma.projectMemory
    .findUnique({ where: { projectId_type_key: { projectId, type: TIPO_DA_IDENTIDADE, key: CHAVE_DA_IDENTIDADE } }, select: { value: true } })
    .catch(() => null);
  const v = m?.value as Partial<IdentidadeVisualEscolhida> | null;
  if (!v || !letraValida(v.letra)) return null;
  const papeis = normalizarPapeis(v.papeis);
  if (!papeis) return null;
  return {
    letra: v.letra,
    papeis,
    fotos: fotosValidas(v.fotos) ? v.fotos : FOTOS_PADRAO,
    aprovadaEm: typeof v.aprovadaEm === "string" ? v.aprovadaEm : null,
    modelos: Array.isArray(v.modelos) ? v.modelos.filter((x): x is string => typeof x === "string") : [],
  };
}

/** A paleta que os papéis podem usar, do projeto (configuração, senão a identidade efetiva). */
export async function paletaDoProjetoParaOsPapeis(projectId: string, colorPalette?: string | null): Promise<string[]> {
  const identidade = await identidadeDoProjeto(projectId);
  const paleta = colorPalette === undefined ? (await prisma.project.findUnique({ where: { id: projectId }, select: { colorPalette: true } }))?.colorPalette : colorPalette;
  return paletaParaOsPapeis(paleta, identidade.cores, PALETA_PADRAO_DA_PLATAFORMA);
}

/**
 * Grava letra e papéis (o que vier) e, com `aprovar`, carimba a aprovação com
 * os modelos de agora. Sem `aprovar`, qualquer mudança apaga o carimbo.
 * `modelosMudaram` é a escolha de modelos avisando que mudou: só derruba.
 */
export async function salvarIdentidadeVisual(
  projectId: string,
  mudanca: { letra?: unknown; papeis?: unknown; fotos?: unknown; aprovar?: boolean; modelosMudaram?: boolean }
): Promise<IdentidadeVisualEscolhida> {
  const atual = await lerIdentidadeVisual(projectId);
  const letra: LetraId = letraValida(mudanca.letra) ? mudanca.letra : (atual?.letra ?? LETRA_PADRAO);
  const papeisNovos = normalizarPapeis(mudanca.papeis);
  const papeis: PapeisEscolhidos = papeisNovos ?? atual?.papeis ?? papeisPadrao(await paletaDoProjetoParaOsPapeis(projectId));
  // As fotos (05/10): trocar também derruba a aprovação, pela mesma regra da letra.
  const fotos: FotosDaIdentidade = fotosValidas(mudanca.fotos) ? mudanca.fotos : (atual?.fotos ?? FOTOS_PADRAO);
  const mudou =
    Boolean(mudanca.modelosMudaram) ||
    letra !== atual?.letra ||
    fotos !== (atual?.fotos ?? FOTOS_PADRAO) ||
    JSON.stringify(papeis) !== JSON.stringify(atual?.papeis ?? null);
  const escolha = mudanca.aprovar ? await lerModelosEscolhidos(projectId) : null;
  const valor: IdentidadeVisualEscolhida = {
    letra,
    papeis,
    fotos,
    aprovadaEm: mudanca.aprovar ? new Date().toISOString() : mudou ? null : (atual?.aprovadaEm ?? null),
    modelos: mudanca.aprovar ? (escolha?.ids ?? []) : (atual?.modelos ?? []),
  };
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: TIPO_DA_IDENTIDADE, key: CHAVE_DA_IDENTIDADE } },
    create: { projectId, type: TIPO_DA_IDENTIDADE, key: CHAVE_DA_IDENTIDADE, value: valor as never },
    update: { value: valor as never },
  });
  return valor;
}

export interface EstadoDaIdentidade {
  registro: IdentidadeVisualEscolhida | null;
  /** Letra e papéis a mostrar: os gravados, senão o padrão da hierarquia. */
  letra: LetraId;
  papeis: PapeisEscolhidos;
  /** As fotos: naturais, preto e branco ou nas cores da marca (05/10). */
  fotos: FotosDaIdentidade;
  paleta: string[];
  modelos: string[];
  aprovada: boolean;
}

/** Tudo o que a tela e a geração precisam saber da identidade de um projeto. */
export async function estadoDaIdentidade(projectId: string, colorPalette?: string | null): Promise<EstadoDaIdentidade> {
  const [registro, escolha, paleta] = await Promise.all([lerIdentidadeVisual(projectId), lerModelosEscolhidos(projectId).catch(() => null), paletaDoProjetoParaOsPapeis(projectId, colorPalette)]);
  const modelos = escolha?.ids ?? [];
  return {
    registro,
    letra: registro?.letra ?? LETRA_PADRAO,
    papeis: registro?.papeis ?? papeisPadrao(paleta),
    fotos: registro?.fotos ?? FOTOS_PADRAO,
    paleta,
    modelos,
    aprovada: identidadeAprovada(registro, modelos, paleta),
  };
}
