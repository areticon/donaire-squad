import { designsDoProjeto } from "@/lib/biblioteca-de-design/registro";
import type { DesignDaGaleria } from "@/lib/biblioteca-de-design/tipos";
import { artesAguardandoIdentidade } from "@/lib/media/artes-aguardando-identidade";
import { modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import { lerModelosEscolhidos, salvarModelosEscolhidos } from "@/lib/modelos-de-arte/escolha";
import { contarArtesEsperando } from "@/lib/modelos-de-arte/espera-da-identidade";
import { estadoDaIdentidade, salvarIdentidadeVisual } from "@/lib/modelos-de-arte/identidade-aprovada";
import type { EstadoDoEstiloDosPosts } from "@/lib/estilo-dos-posts/tipos";

/**
 * O ESTILO DOS POSTS NO BANCO (08/10/2026): escrever ou escolher um design de
 * imagem na biblioteca É a aprovação do estilo dos posts (decisão do Bruno:
 * "um quadro de chat para o usuário escrever como ele quer o estilo dos
 * posts, ou ele pode escolher estilos da biblioteca"). Até aqui o design
 * escrito virava modelo, mas a trava das artes continuava fechada, porque a
 * aprovação exigia um modelo do book.
 *
 * Sem coluna nova: o design aprovado vai no registro da identidade
 * (ProjectMemory estilo/identidade-visual, campo `design`), e a letra e os
 * papéis das cores seguem os gravados (ou o padrão da paleta da Marca).
 */

type DesignParaAprovar = Pick<DesignDaGaleria, "id" | "nome" | "tipo" | "catalogoId" | "linguagem">;

/**
 * Aprova o estilo dos posts a partir de um design da biblioteca. Modelo do
 * book (semente com `catalogoId`): entra nos modelos escolhidos (com
 * `substituir`, vira o único) e a identidade é aprovada com o book. Design
 * escrito por cliente: vira o estilo, sem modelo do book.
 */
export async function aprovarEstiloPeloDesign(projectId: string, design: DesignParaAprovar, o: { substituir?: boolean } = {}): Promise<{ aprovado: boolean; efeito: string }> {
  if (design.tipo !== "imagem") return { aprovado: false, efeito: "Esse design é de vídeo: ele vale para os cortes, não para os posts." };
  if (design.catalogoId) {
    if (!modeloPorId(design.catalogoId)) return { aprovado: false, efeito: "Esse modelo saiu do book. Escolha outro ou escreva como você quer." };
    const atual = await lerModelosEscolhidos(projectId);
    const ids = o.substituir ? [design.catalogoId] : [...new Set([...(atual?.ids ?? []), design.catalogoId])];
    if (JSON.stringify(atual?.ids ?? []) !== JSON.stringify(ids)) await salvarModelosEscolhidos(projectId, ids);
    await salvarIdentidadeVisual(projectId, { aprovar: true, design: null });
    return { aprovado: true, efeito: `Estilo aprovado: os posts saem no modelo "${design.nome}", com a sua letra e as suas cores.` };
  }
  if (!design.linguagem?.trim()) return { aprovado: false, efeito: "O design entrou, mas a descrição do visual não saiu. Escreva de novo com um pouco mais de detalhe." };
  await salvarIdentidadeVisual(projectId, { aprovar: true, design: design.id });
  return { aprovado: true, efeito: `Estilo aprovado: os posts saem em "${design.nome}", do jeito que você descreveu. A imagem é gerada nessa linguagem e a manchete entra na sua letra, nas suas cores.` };
}

/** O design aprovado, entre os ligados ao projeto (ligado, ele é legível pelo projeto mesmo fora da galeria). */
export async function designAprovadoDoProjeto(projectId: string, designId: string | null | undefined): Promise<DesignDaGaleria | null> {
  if (!designId) return null;
  const ligados = await designsDoProjeto(projectId).catch(() => []);
  return ligados.find((d) => d.id === designId) ?? null;
}

/** O estado que o passo do estilo mostra. */
export async function estadoDoEstiloDosPosts(projectId: string, podeMudar: boolean): Promise<EstadoDoEstiloDosPosts> {
  const [estado, aguardando] = await Promise.all([estadoDaIdentidade(projectId), artesAguardandoIdentidade(projectId).catch(() => [])]);
  const design = await designAprovadoDoProjeto(projectId, estado.design);
  return {
    aprovada: estado.aprovada,
    aprovadaEm: estado.registro?.aprovadaEm ?? null,
    design: design ? { id: design.id, nome: design.nome, descricao: design.descricao, previaUrl: design.previaUrl } : null,
    modelos: design ? [] : estado.modelos.map((id) => ({ id, nome: modeloPorId(id)?.nome ?? id })),
    aguardando: contarArtesEsperando(aguardando),
    podeMudar,
  };
}
