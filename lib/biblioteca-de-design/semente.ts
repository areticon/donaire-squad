import { MODELOS_DE_ARTE, type ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
import { promptDoModelo } from "@/lib/modelos-de-arte/prompts-com-foto";
import { CATALOGO_DE_ESTILOS, arteDoEstilo, type EstiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { REFERENCIAS_DE_COMANDO } from "@/lib/media/editor-por-comando/comando";
import { FAMILIA, familiaPorPalavras } from "@/lib/media/editor-por-comando/linguagem";
import { semTravessao, type TipoDeDesign } from "@/lib/biblioteca-de-design/tipos";

/**
 * A SEMENTE DA BIBLIOTECA (06/10/2026): o catálogo de hoje vira as primeiras
 * entradas, com origem "semente", para a galeria nascer cheia e ordenada:
 *   - IMAGEM: os 53 modelos do book (lib/modelos-de-arte/catalogo.ts), com
 *     os 18 modelos com foto e a família Vox por prompt. A linguagem é o
 *     prompt do modelo (prompts-com-foto.ts ou o do catálogo); nos modelos só
 *     texto, desenhados inteiros em código, a linguagem descreve o desenho;
 *   - VÍDEO: os 27 estilos do catálogo (lib/media/catalogo-de-estilos.ts). O
 *     pedido é o comando pronto que a miniatura preenche (as 4 referências de
 *     comando onde existem); a linguagem é a semente da família visual que o
 *     comando cai (linguagem.ts), em inglês, como o bloco de estilo.
 *
 * `catalogoId` guarda o id do modelo ou do estilo: é por ele que a esteira de
 * hoje continua obedecendo (os modelos escolhidos, a miniatura do estilo), e
 * é por ele que a galeria mostra a prévia que já existe (previaGerada do Vox,
 * a arte do estilo). Os usos iniciais vêm do banco no script da semente
 * (quantos projetos usam cada modelo ou estilo), não daqui.
 *
 * Módulo puro: a tela de exemplo e o script importam daqui.
 */

export interface SementeDeDesign {
  tipo: TipoDeDesign;
  catalogoId: string;
  nome: string;
  descricao: string;
  pedidoOriginal: string;
  linguagem: string;
  previaUrl: string | null;
}

/** A referência de comando que descreve a linguagem do estilo (a mesma tabela da tela do comando). */
const REFERENCIA_DO_ESTILO: Record<string, string> = { vox: "vox-papel", lousa: "dan-martell-lousa", consorcio: "high-ticket", keynote: "tecnologico-passos" };

/** O que cada kit do worker desenha, em inglês, para a linguagem do estilo. */
const KIT_EM_INGLES: Record<EstiloDoCatalogo["kit"], string> = {
  colagem: "paper cutouts and archive photos for concrete references, highlighter strokes on key phrases, headline quotes and a paper timeline for dates",
  impacto: "the thesis word giant behind the speaker, bold caption highlights on strong words, animated numbers and small icons beside the speaker",
  sobrio: "clean titles, sourced numbers when data is spoken, step lists and images in a side window",
};

const RITMO_EM_INGLES: Record<string, string> = {
  acelerado: "fast rhythm, something new every 3 to 5 seconds",
  dramatico: "calm rhythm with breathing room between elements",
  serio: "medium rhythm, something new every 6 to 10 seconds",
  animado: "medium to fast rhythm",
};

/** A linguagem de um modelo só texto: o desenho em código, descrito em inglês. */
function linguagemDoDesenhoEmCodigo(m: ModeloDeArte): string {
  const t = m.tipografia;
  return semTravessao(
    `Drawn entirely in code, no generated image. Layout archetype "${m.arquetipo}", background "${m.fundo}", highlight "${m.destaque}", title font ${t.titulo}, text font ${t.texto}${t.caixaAlta ? ", uppercase titles" : ""}. Brand color only in the highlight, never as a wash. Headline up to ${m.maxPalavras} words.`
  );
}

function sementeDaImagem(m: ModeloDeArte): SementeDeDesign {
  const prompt = promptDoModelo(m);
  return {
    tipo: "imagem",
    catalogoId: m.id,
    nome: semTravessao(m.nome),
    descricao: semTravessao(m.paraQuem),
    pedidoOriginal: semTravessao(`${m.estrutura} ${m.foto !== "nenhuma" ? m.fotoOnde : ""} ${m.cor}`),
    linguagem: prompt ? semTravessao(prompt.replace(/\n+/g, " ")) : linguagemDoDesenhoEmCodigo(m),
    previaUrl: m.previaGerada ?? null,
  };
}

function sementeDoVideo(e: EstiloDoCatalogo): SementeDeDesign {
  const ref = REFERENCIAS_DE_COMANDO.find((r) => r.id === REFERENCIA_DO_ESTILO[e.id]);
  const pedido = ref?.texto ?? `Estilo ${e.nome}${e.referencia ? ` (${e.referencia})` : ""}: ${e.resumo}`;
  const familia = FAMILIA[familiaPorPalavras(`${e.id} ${pedido}`)];
  const linguagem = `Visual language: ${familia.semente}. On screen: ${KIT_EM_INGLES[e.kit]}; ${RITMO_EM_INGLES[e.base] ?? RITMO_EM_INGLES.serio}. Brand colors only as small accents and details, never a flat color wash.`;
  return {
    tipo: "video",
    catalogoId: e.id,
    nome: semTravessao(e.referencia ? `${e.nome} (${e.referencia})` : e.nome),
    descricao: semTravessao(e.resumo),
    pedidoOriginal: semTravessao(pedido),
    linguagem: semTravessao(linguagem),
    previaUrl: arteDoEstilo(e.id),
  };
}

/** Todas as sementes: primeiro os estilos de vídeo, depois o book de imagem, na ordem do catálogo. */
export function sementesDaBiblioteca(): SementeDeDesign[] {
  return [...CATALOGO_DE_ESTILOS.map(sementeDoVideo), ...MODELOS_DE_ARTE.map(sementeDaImagem)];
}

/** A semente de um id do catálogo (modelo do book ou estilo de vídeo). */
export function sementePorCatalogo(tipo: TipoDeDesign, catalogoId: string): SementeDeDesign | undefined {
  return sementesDaBiblioteca().find((s) => s.tipo === tipo && s.catalogoId === catalogoId);
}
