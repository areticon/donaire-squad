import { MODELOS_DE_ARTE, type Arquetipo, type ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";
import { promptDoModelo } from "@/lib/modelos-de-arte/prompts-com-foto";
import { CATALOGO_DE_ESTILOS, arteDoEstilo, type EstiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { LINGUAGEM_DOS_ESTILOS } from "@/lib/media/editor-por-comando/comando-dos-estilos";
import { FAMILIA, familiaPorPalavras } from "@/lib/media/editor-por-comando/linguagem";
import { semTravessao, type TipoDeDesign } from "@/lib/biblioteca-de-design/tipos";

/**
 * A SEMENTE DA BIBLIOTECA (06/10/2026): o catálogo de hoje vira as primeiras
 * entradas, com origem "semente", para a galeria nascer cheia e ordenada:
 *   - IMAGEM: os 53 modelos do book (lib/modelos-de-arte/catalogo.ts), com
 *     os 18 modelos com foto e a família Vox por prompt. A linguagem é o
 *     prompt do modelo (prompts-com-foto.ts ou o do catálogo); nos modelos só
 *     texto, desenhados inteiros em código, a linguagem descreve o desenho
 *     pelo arquétipo (DESENHO_DO_ARQUETIPO), em inglês, como um brief de
 *     design;
 *   - VÍDEO: os 26 estilos do catálogo (lib/media/catalogo-de-estilos.ts). O
 *     pedido é o comando pronto que a miniatura preenche e a linguagem é o
 *     bloco pesquisado de cada estilo (LINGUAGEM_DOS_ESTILOS, 06/10:
 *     materiais, luz, grão, composição, o que evitar), em inglês, como o
 *     bloco de estilo dos prompts de imagem e de B-roll.
 *
 * `catalogoId` guarda o id do modelo ou do estilo: é por ele que a esteira de
 * hoje continua obedecendo (os modelos escolhidos, a miniatura do estilo), e
 * é por ele que a galeria mostra a prévia que já existe (previaGerada do Vox,
 * a arte do estilo). Os usos iniciais vêm do banco no script da semente
 * (quantos projetos usam cada modelo ou estilo), não daqui.
 *
 * ATENÇÃO: `garantirSemente` (registro.ts) só CRIA a entrada; as 79 já
 * gravadas em 06/10 de madrugada continuam com a linguagem antiga até um
 * script de atualização rodar (pendência registrada no HANDOFF).
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

/**
 * O desenho em código de cada arquétipo só texto, descrito como brief de
 * design (inglês), para a galeria e para o redator da biblioteca compararem
 * um pedido novo com o que já existe. Sem imagem gerada: é layout, tipografia
 * e a cor da marca nos detalhes.
 */
const DESENHO_DO_ARQUETIPO: Partial<Record<Arquetipo, string>> = {
  frase: "A single headline, large and centred, set in the brand typography with tight leading, one or two words emphasised by the highlight; nothing else on the page.",
  citacao: "A quotation in large serif with oversized opening quotation marks as the only ornament, the author line small beneath, generous margins.",
  lista: "A numbered list of 3 to 5 short items stacked with a thin rule between them, the number in the brand colour, the title above.",
  checklist: "A checklist of 3 to 6 items with a drawn tick in the brand colour before each, left aligned, the title above.",
  passos: "Steps in a horizontal line connected by a thin rule, each with a numbered dot in the brand colour and a short label beneath.",
  "dois-lados": "Two columns divided by a vertical hairline, a label at the top of each (before and after, avoid and do, myth and truth), short items in each column, a cross and a check in the brand colour.",
  dado: "One giant numeral in the brand typography filling the upper half, the unit small beside it, a one-line explanation beneath.",
  "dado-barra": "A large numeral with a flat progress bar beneath it filled in the brand colour, the label under the bar.",
  "print-post": "A screenshot-style card of a text post: avatar circle, name and handle, the text in a plain sans, small reaction icons beneath, on a flat brand-colour field.",
  "print-conversa": "A chat screenshot with two or three speech bubbles, the sent ones in the brand colour and the received ones in grey, the time small above.",
  tipografia: "Giant uppercase typography bleeding off the edges, one word per line, a block of brand colour behind the key word.",
  "marca-texto": "A handwritten-feel headline on cream paper with a ragged highlighter stroke in the brand colour under the key phrase.",
  caderno: "A notebook page with faint ruled lines, the headline in a casual handwriting face, a marker underline in the brand colour.",
  "caixa-pergunta": "A story-style question box centred on a brand-colour field, the question in bold sans, an empty answer line beneath.",
  enquete: "Two stacked poll options with a thin outline, the question above in bold sans, the first option tinted in the brand colour.",
  "capa-tipografica": "A reels cover made of typography only: a short title in heavy type filling the frame, the key word on a brand-colour block, a small handle at the bottom.",
  "capa-carrossel": "A carousel cover with the title large and left aligned, a drawn arrow pointing right in the brand colour, a highlighter stroke under the key word.",
  depoimento: "A testimonial card with five stars in the brand colour, the quotation in serif, the name and role beneath in small caps.",
  oferta: "An offer layout with the headline above, the price or benefit large in the middle and a solid brand-colour button with a short call to action.",
  verbete: "A dictionary entry: the term in bold serif, the phonetic line in italics, the definition in a plain sans, a thin rule above and below.",
  "frase-dupla": "A large headline with a smaller complementary sentence beneath in a lighter weight, both left aligned, the highlight on one word.",
  "textura-tipografica": "The key word repeated as a faint texture across the whole background, the headline large and legible in front of it, the brand colour on one line.",
};

/** A linguagem de um modelo só texto: o desenho em código, descrito em inglês como brief de design. */
function linguagemDoDesenhoEmCodigo(m: ModeloDeArte): string {
  const t = m.tipografia;
  const desenho = DESENHO_DO_ARQUETIPO[m.arquetipo] ?? `Layout archetype "${m.arquetipo}".`;
  return semTravessao(
    `Drawn entirely in code, no generated image. ${desenho} Background "${m.fundo}", highlight "${m.destaque}", title font ${t.titulo}, text font ${t.texto}${t.caixaAlta ? ", uppercase titles" : ""}. Brand colour only in the highlight and small details, never as a wash. Headline up to ${m.maxPalavras} words, Brazilian Portuguese, no dash.`
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
  const ficha = LINGUAGEM_DOS_ESTILOS[e.id];
  const pedido = ficha?.comando ?? `Estilo ${e.nome}${e.referencia ? ` (${e.referencia})` : ""}: ${e.resumo}`;
  // Sem ficha (estilo novo no catálogo sem pesquisa), a semente da família que as palavras do pedido indicam.
  const linguagem = ficha?.bloco ?? `Visual language: ${FAMILIA[familiaPorPalavras(`${e.id} ${pedido}`)].semente}. Brand colors only as small accents and details, never a flat color wash.`;
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
