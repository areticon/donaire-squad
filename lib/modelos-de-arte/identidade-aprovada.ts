import { prisma } from "@/lib/db/prisma";
import { identidadeDoProjeto } from "@/lib/media/identidade-visual";
import { lerModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";
import {
  LETRA_PADRAO,
  designDepoisDaMudanca,
  designQueVale,
  identidadeAprovada,
  letraValida,
  normalizarPapeis,
  paletaParaOsPapeis,
  papeisNaPaleta,
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
    // O design da biblioteca como estilo dos posts (08/10); ausente nos registros antigos.
    design: typeof v.design === "string" && v.design ? v.design : null,
  };
}

/**
 * A paleta que os papéis podem usar: a salva em Configurações (fonte única,
 * 06/10); só sem ela, a identidade efetiva (manual, logo ou setor). Com paleta
 * salva, nem lê a identidade efetiva: o cache de 10 min por processo dela era
 * o que fazia a tela mostrar cores diferentes a cada instância.
 */
export async function paletaDoProjetoParaOsPapeis(projectId: string, colorPalette?: string | null): Promise<string[]> {
  const paleta = colorPalette === undefined ? (await prisma.project.findUnique({ where: { id: projectId }, select: { colorPalette: true } }))?.colorPalette : colorPalette;
  const salva = paletaParaOsPapeis(paleta, { acento: "", escuro: "", claro: "" });
  if (salva.length) return salva;
  const identidade = await identidadeDoProjeto(projectId);
  return paletaParaOsPapeis(null, identidade.cores);
}

/**
 * Grava letra e papéis (o que vier) e, com `aprovar`, carimba a aprovação com
 * os modelos de agora. Sem `aprovar`, qualquer mudança apaga o carimbo.
 * `modelosMudaram` é a escolha de modelos avisando que mudou: só derruba.
 *
 * `design` (08/10): o design da biblioteca que vira o estilo dos posts (o
 * cliente escreveu no quadro de chat ou escolheu da biblioteca); null volta
 * para o book. Com `aprovar` e design, a aprovação vale sem modelo do book.
 * Trocar os modelos do book tira o design (quem mexe no book quer o book).
 */
export async function salvarIdentidadeVisual(
  projectId: string,
  mudanca: { letra?: unknown; papeis?: unknown; fotos?: unknown; aprovar?: boolean; modelosMudaram?: boolean; design?: string | null }
): Promise<IdentidadeVisualEscolhida> {
  const atual = await lerIdentidadeVisual(projectId);
  const letra: LetraId = letraValida(mudanca.letra) ? mudanca.letra : (atual?.letra ?? LETRA_PADRAO);
  const papeisNovos = normalizarPapeis(mudanca.papeis);
  // Só grava cor que existe na paleta salva de agora (06/10): um clique numa
  // cor velha (tela aberta antes de trocar a paleta) não grava cor fantasma.
  const paletaAgora = await paletaDoProjetoParaOsPapeis(projectId);
  const papeis: PapeisEscolhidos = papeisNaPaleta(papeisNovos ?? atual?.papeis ?? papeisPadrao(paletaAgora), paletaAgora).papeis;
  // As fotos (05/10): trocar também derruba a aprovação, pela mesma regra da letra.
  const fotos: FotosDaIdentidade = fotosValidas(mudanca.fotos) ? mudanca.fotos : (atual?.fotos ?? FOTOS_PADRAO);
  const design = designDepoisDaMudanca(atual?.design, mudanca);
  const mudou =
    Boolean(mudanca.modelosMudaram) ||
    design !== (atual?.design ?? null) ||
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
    design,
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
  /** O design da biblioteca que é o estilo dos posts (08/10), ou null quando vale o book. */
  design: string | null;
}

/** Tudo o que a tela e a geração precisam saber da identidade de um projeto. */
export async function estadoDaIdentidade(projectId: string, colorPalette?: string | null): Promise<EstadoDaIdentidade> {
  const [registro, escolha, paleta] = await Promise.all([lerIdentidadeVisual(projectId), lerModelosEscolhidos(projectId).catch(() => null), paletaDoProjetoParaOsPapeis(projectId, colorPalette)]);
  const modelos = escolha?.ids ?? [];
  const aprovada = identidadeAprovada(registro, modelos, paleta);
  return {
    registro,
    letra: registro?.letra ?? LETRA_PADRAO,
    // Os papéis gravados encaixados na paleta salva: cor que saiu da paleta vira o padrão (e a aprovação cai).
    papeis: registro ? papeisNaPaleta(registro.papeis, paleta).papeis : papeisPadrao(paleta),
    fotos: registro?.fotos ?? FOTOS_PADRAO,
    paleta,
    modelos,
    aprovada,
    // Aprovada, vale o design só se a aprovação veio depois da última escolha
    // do book (08/10, revisão: a Vera troca o book direto na memória). Sem
    // aprovação, o design gravado aparece para o "Aprovar de novo".
    design: aprovada ? designQueVale(registro, escolha?.em) : (registro?.design ?? null),
  };
}

/**
 * A PALETA MUDOU EM CONFIGURAÇÕES (06/10): a identidade acompanha. Os papéis
 * cuja cor continua na paleta ficam; os que apontavam para uma cor que saiu
 * passam ao padrão da hierarquia, e só então a aprovação cai (pede aprovação
 * de novo só quando algo realmente mudou). Sem identidade gravada, nada a
 * fazer: a tela já lê a paleta salva.
 */
export async function alinharIdentidadeAPaleta(projectId: string): Promise<{ mudou: boolean }> {
  const atual = await lerIdentidadeVisual(projectId);
  if (!atual) return { mudou: false };
  const paleta = await paletaDoProjetoParaOsPapeis(projectId);
  const { papeis, mudou } = papeisNaPaleta(atual.papeis, paleta);
  if (!mudou) return { mudou: false };
  await salvarIdentidadeVisual(projectId, { papeis });
  return { mudou: true };
}
