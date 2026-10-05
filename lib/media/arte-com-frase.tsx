import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ImageResponse } from "@vercel/og";
import { askClaude, ehErroDeSaldo } from "@/lib/claude";
import { ehSemSaldoDaOpenAI, SemChaveDaOpenAI } from "@/lib/media/gpt-image";
import { palavraDeDestaque, type CoresDaMarca } from "@/lib/media/capa-composta";
import { nomeDaCor } from "@/lib/media/direcao-de-arte";
import { larguraEmCorpos } from "@/lib/media/metricas-de-fonte";
import type { ProporcaoPedida } from "@/lib/media/formatos-das-redes";
import {
  enquadramentoDaPeca,
  identidadeDoProjeto,
  varianteDaPeca,
  type FamiliaDaArte,
  type IdentidadeVisual,
  type Tipografia,
} from "@/lib/media/identidade-visual";
import { IdentidadeNaoAprovada, LETRAS, coresDaIdentidade, type LetraId, type PapeisEscolhidos } from "@/lib/modelos-de-arte/identidade";
import { estadoDaIdentidade } from "@/lib/modelos-de-arte/identidade-aprovada";
import { tratamentoDasFotos, type TratamentoDaFoto } from "@/lib/modelos-de-arte/tratamento";
import { aplicarTratamento } from "@/lib/media/tratamento-da-foto";

/**
 * TEXTO EM ARTE GERADA POR IA É SEMPRE CÓDIGO (30/09/2026).
 *
 * A arte de quarta do teste de 30/09 saiu com a frase certa no topo e, embaixo,
 * quatro "passos" que ninguém pediu: "Linicar as informações", "Recalhar
 * ideias", fotos de gente desconhecida numa reunião. A causa tinha duas metades:
 *
 *   1. o prompt pedia ao modelo de imagem para ESCREVER a frase, e quem escreve
 *      uma frase se sente autorizado a escrever outras;
 *   2. a linguagem do vídeo do projeto (Ali Abdaal) diz "numbered points with
 *      simple icons and one supporting photo per point", e o modelo obedeceu:
 *      inventou os pontos, os números e as fotos.
 *
 * É a mesma lição da capa (lib/media/capa-composta.tsx): cada camada tem um
 * dono. O modelo de imagem desenha SÓ a arte, sem letra, número, rótulo nem
 * pessoa. A frase entra aqui, em código, com as fontes do repositório, as
 * cores da marca (Project.colorPalette) e o layout da família da linguagem
 * escolhida (colagem, impacto, sóbrio). Erro de escrita passa a ser
 * impossível, e não improvável.
 */

/**
 * A marca de uma peça. Até 01/10 eram só família e cores, e as cores eram a
 * paleta gravada (o laranja padrão da Demandou em todos os projetos). Desde
 * 01/10 a marca carrega a IDENTIDADE do projeto (lib/media/identidade-visual.ts):
 * as cores efetivas, a letra, o setor com o mundo do cliente, o público e o
 * tom. Os campos novos são opcionais para quem monta a marca à mão (scripts,
 * infográfico) continuar compilando.
 */
export type MarcaDaArte = {
  familia: FamiliaDaArte;
  /** Com `papeis` (05/10): as cores exatamente nos papéis que o cliente aprovou. */
  cores: CoresDaMarca & { papeis?: PapeisEscolhidos };
  tipografia?: Tipografia;
  identidade?: IdentidadeVisual;
  /** A letra aprovada pelo cliente (05/10, lib/modelos-de-arte/identidade.ts). */
  letra?: LetraId;
  /**
   * A TRAVA DA IDENTIDADE (05/10): false quando o projeto ainda não aprovou
   * modelo, letra e papéis das cores. Com false, nenhuma arte paga sai
   * (desenharComFraseEmCodigo e o carrossel lançam IdentidadeNaoAprovada).
   * Ausente em marca montada à mão (scripts, infográfico de teste): sem trava.
   */
  identidadeAprovada?: boolean;
  /**
   * O TRATAMENTO DA FOTO (05/10, lib/modelos-de-arte/tratamento.ts): com
   * "duotone" ou "pb", a cena gerada (ou a foto real) é tratada em código
   * antes de o texto entrar, e cada pixel dela vira uma cor da paleta. Vem da
   * identidade ("Fotos: nas cores da marca") ou do pedido do chat ("somente
   * preto e vermelho"). Null ou ausente: a foto fica com as cores dela.
   */
  tratamento?: TratamentoDaFoto | null;
  /** Fixa o layout (o carrossel usa o mesmo em todas as lâminas). Sem isto, sai da frase. */
  variante?: number;
  /**
   * O BOOK DE MODELOS (03/10, lib/modelos-de-arte): os modelos que o cliente
   * escolheu. Com eles a peça sai no molde de um deles (o mesmo desenho da
   * prévia que ele aprovou), e não na composição da família.
   */
  modelos?: string[];
  /** Um modelo fixo para todas as lâminas do carrossel. */
  modeloFixo?: string;
  /** A lâmina do carrossel, para os pontinhos e o "arraste". */
  pagina?: { i: number; total: number };
  /** O nome da marca e o logo em PNG, para o modelo assinar a peça. */
  nomeDaMarca?: string;
  logoDoModelo?: { src: string; proporcao: number } | null;
  /** O texto do post, de onde o modelo tira itens, lados e número. */
  contexto?: string;
  projectId?: string;
  /**
   * A BIBLIOTECA DE MATERIAIS (03/10, lib/materiais): as fotos reais do
   * cliente que podem virar arte. Com elas, a peça usa a foto que serve ao
   * post ANTES de pagar imagem gerada.
   */
  materiais?: import("@/lib/materiais/escolha").MaterialDaMarca[];
};

/** A identidade do projeto em forma de marca da peça. */
export function marcaDaIdentidade(identidade: IdentidadeVisual): MarcaDaArte {
  return { familia: identidade.familia, cores: identidade.cores, tipografia: identidade.tipografia, identidade };
}

/** A marca do projeto: família respeitando a escolha, cores efetivas, letra e setor. */
export async function marcaDaArte(projectId?: string | null, opcoes?: { runId?: string }): Promise<MarcaDaArte> {
  if (!projectId) {
    // Sem projeto não há identidade: a marca neutra do setor genérico, e não
    // mais o laranja da Demandou.
    const { identidadeDe } = await import("@/lib/media/identidade-visual");
    return marcaDaIdentidade(await identidadeDe({}));
  }
  const marca = marcaDaIdentidade(await identidadeDoProjeto(projectId));
  // Os modelos escolhidos no book (03/10). Sem escolha, nada muda.
  const { lerModelosEscolhidos } = await import("@/lib/modelos-de-arte/escolha");
  const { materiaisDaMarca } = await import("@/lib/materiais/escolha");
  const { prisma } = await import("@/lib/db/prisma");
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, logoUrl: true, colorPalette: true } });
  const [escolha, materiais, identidade] = await Promise.all([
    lerModelosEscolhidos(projectId).catch(() => null),
    materiaisDaMarca(projectId, opcoes?.runId).catch(() => []),
    // A IDENTIDADE APROVADA (05/10): letra e papéis das cores que o cliente
    // viu e aprovou. Lida a cada peça (sem cache): aprovou agora, vale agora.
    estadoDaIdentidade(projectId, p?.colorPalette).catch(() => null),
  ]);
  if (materiais.length) marca.materiais = materiais;
  marca.projectId = projectId;
  marca.identidadeAprovada = Boolean(identidade?.aprovada);
  if (identidade?.aprovada) {
    // As cores EXATAMENTE nos papéis aprovados: o fundo é o fundo, o título é
    // o título, o destaque é o destaque. Nenhum agente escolhe outra cor da
    // paleta para o fundo (a queixa de 05/10: fundo laranja que ninguém pediu).
    const cores = coresDaIdentidade(identidade.papeis);
    marca.cores = cores;
    marca.letra = identidade.letra;
    marca.tipografia = LETRAS[identidade.letra].familia;
    if (marca.identidade) marca.identidade = { ...marca.identidade, cores, tipografia: marca.tipografia };
    // As fotos como o cliente aprovou: naturais, preto e branco ou nas cores da marca.
    marca.tratamento = tratamentoDasFotos(identidade.fotos);
  }
  if (!escolha && !materiais.length) return marca;
  const { lerMidia } = await import("@/lib/media/storage");
  const { logoParaArte } = await import("@/lib/modelos-de-arte/compor");
  const logo = p?.logoUrl ? await lerMidia(p.logoUrl).catch(() => null) : null;
  return { ...marca, modelos: escolha?.ids, nomeDaMarca: p?.name ?? "", logoDoModelo: await logoParaArte(logo), projectId };
}

/**
 * A TRAVA (05/10): marca de projeto sem identidade aprovada não gera arte
 * paga. Lança antes de qualquer chamada ao modelo de imagem; o chamador que
 * sabe esperar (a esteira) nem chega aqui, e os outros (chat do card, refazer)
 * devolvem a mensagem ao cliente.
 */
export function exigirIdentidadeAprovada(marca: MarcaDaArte): void {
  if (marca.projectId && marca.identidadeAprovada === false) throw new IdentidadeNaoAprovada();
}

/** O modelo do book com a pessoa recortada na frente do título. */
export const MODELO_COM_PROFUNDIDADE = "voce-na-frente-do-titulo";

/**
 * O MODELO quando a peça vai sair de uma foto real do cliente (03/10): entre
 * os modelos escolhidos, só os que têm lugar para foto; foto de pessoa vai para
 * "Você na frente do título" quando ele está escolhido ou quando o cliente não
 * escolheu modelo nenhum. Devolve `usar: false` quando os modelos escolhidos
 * não têm foto: a escolha do cliente manda, e a foto fica para outra peça.
 */
export async function modeloParaOMaterial(
  marca: MarcaDaArte,
  material: import("@/lib/materiais/escolha").MaterialDaMarca,
  largura: number,
  altura: number,
  frase: string
): Promise<{ usar: boolean; modelo: import("@/lib/modelos-de-arte/catalogo").ModeloDeArte | null }> {
  const { modeloPorId } = await import("@/lib/modelos-de-arte/catalogo");
  if (marca.modeloFixo) {
    const m = modeloPorId(marca.modeloFixo);
    return { usar: !m || m.foto !== "nenhuma", modelo: m ?? null };
  }
  const ids = marca.modelos ?? [];
  const pessoa = material.etiquetas.includes("pessoa");
  if (pessoa && (!ids.length || ids.includes(MODELO_COM_PROFUNDIDADE))) return { usar: true, modelo: modeloPorId(MODELO_COM_PROFUNDIDADE) ?? null };
  if (!ids.length) return { usar: true, modelo: null };
  const comFoto = ids.filter((id) => (modeloPorId(id)?.foto ?? "nenhuma") !== "nenhuma" && (pessoa || id !== MODELO_COM_PROFUNDIDADE));
  if (!comFoto.length) return { usar: false, modelo: null };
  const { modeloParaAPeca } = await import("@/lib/modelos-de-arte/compor");
  const m = modeloParaAPeca({ ids: comFoto, largura, altura, frase, contexto: marca.contexto, carrossel: Boolean(marca.pagina) });
  return { usar: Boolean(m), modelo: m };
}

const usosMarcados = new Set<string>();

/**
 * A ARTE A PARTIR DA FOTO REAL (03/10). Escolhe o material que serve à frase,
 * trata a foto (luz e cor no quadro inteiro), recorta a pessoa quando o modelo
 * pede profundidade e compõe a frase. Nenhuma imagem gerada é paga. Null
 * quando nada serve, e a peça segue o caminho de antes.
 */
export async function arteComMaterialDoCliente(o: {
  frase: string;
  marca: MarcaDaArte;
  largura: number;
  altura: number;
  material?: import("@/lib/materiais/escolha").MaterialDaMarca | null;
}): Promise<{ jpeg: Buffer; materialId: string; modelo: string | null; recorte: boolean } | null> {
  if (!o.marca.materiais?.length && !o.material) return null;
  const { escolherMaterial, registrarPecaComMaterial } = await import("@/lib/materiais/escolha");
  const material =
    o.material ??
    (await escolherMaterial({ materiais: o.marca.materiais ?? [], frase: o.frase, contexto: o.marca.contexto, projectId: o.marca.projectId }));
  if (!material) return null;
  const { usar, modelo } = await modeloParaOMaterial(o.marca, material, o.largura, o.altura, o.frase);
  if (!usar) return null;
  const { lerMidia } = await import("@/lib/media/storage");
  const { tratarFoto, recorteDoMaterial, marcarUso } = await import("@/lib/materiais/servidor");
  const original = await lerMidia(material.url).catch(() => null);
  if (!original) return null;
  const foto = await tratarFoto(original, material.luz);
  const recorte = modelo?.foto === "recorte" && material.etiquetas.includes("pessoa") ? await recorteDoMaterial(material.id) : null;
  const jpeg = await comporFraseNaArte({
    arte: foto,
    frase: o.frase,
    marca: modelo ? { ...o.marca, modeloFixo: modelo.id } : { ...o.marca, modelos: undefined },
    largura: o.largura,
    altura: o.altura,
    recorte,
  });
  registrarPecaComMaterial(o.frase);
  const chaveDoUso = `${material.id}|${o.frase}`;
  if (!usosMarcados.has(chaveDoUso)) {
    usosMarcados.add(chaveDoUso);
    void marcarUso(material.id);
  }
  return { jpeg, materialId: material.id, modelo: modelo?.id ?? null, recorte: Boolean(recorte) };
}

/** O modelo do book que vale para esta peça, quando a marca tem modelos. */
export async function modeloDaMarca(marca: MarcaDaArte, largura: number, altura: number, frase: string) {
  if (!marca.modelos?.length && !marca.modeloFixo) return null;
  const { modeloParaAPeca } = await import("@/lib/modelos-de-arte/compor");
  return modeloParaAPeca({ ids: marca.modelos, fixo: marca.modeloFixo, largura, altura, frase, contexto: marca.contexto, carrossel: Boolean(marca.pagina) });
}

/** Os textos extras do modelo, uma vez por (modelo, frase): a mesma peça em outra proporção não paga de novo. */
const textosEmCache = new Map<string, Promise<import("@/lib/modelos-de-arte/catalogo").TextosDaArte>>();
async function textosDaPecaNoModelo(modelo: import("@/lib/modelos-de-arte/catalogo").ModeloDeArte, frase: string, marca: MarcaDaArte) {
  const chave = `${modelo.id}|${frase}`;
  let v = textosEmCache.get(chave);
  if (!v) {
    const { textosDoModelo } = await import("@/lib/modelos-de-arte/compor");
    v = textosDoModelo({ modelo, frase, contexto: marca.contexto, projectId: marca.projectId });
    textosEmCache.set(chave, v);
    if (textosEmCache.size > 200) textosEmCache.delete(textosEmCache.keys().next().value as string);
  }
  return v;
}

/** O layout desta peça: variante fixada na marca ou tirada da frase. */
export function layoutDaPeca(marca: MarcaDaArte, frase: string): { variante: number; arteInteira: boolean } {
  const variante = marca.variante ?? varianteDaPeca(frase, marca.familia);
  return { variante, arteInteira: marca.familia === "sobrio" || (marca.familia === "impacto" && variante === 2) };
}

/**
 * Tira do estilo tudo o que puxa letra, número ou gente.
 *
 * As linguagens do catálogo foram escritas para a arte que ESCREVIA ("modern
 * sans-serif", "numbered points", "a real team at work"). Mandar isso inteiro
 * junto de "sem texto" é dar duas ordens opostas, e o modelo escolhe uma. Fica
 * o que é luz, cor, material e humor; sai o resto.
 */
const PUXA_TEXTO_OU_GENTE =
  /typograph|typeface|\btype\b|font|serif|text|word|letter|headline|title|caption|label|quote|number|numbered|indicator|slide|page|sticker|timestamp|annotat|handwrit|chart|graph|diagram|\bmap\b|document|newspaper|clipping|print|zine|people|person|portrait|customer|team|face|character|figure|human|interview|subject|logo|wordmark|brand|monogram|mascot|channel|placeholder|point|step|card|grid|screen|redaction|evidence|microphone|thumbnail|arrow|circle|emoji/i;

export function lookSemTexto(estilo: string): string {
  // O mundo do cliente vai inteiro, numa linha própria do prompt (01/10);
  // aqui ele sairia picado pelas vírgulas e repetido.
  return estilo
    .replace(/CLIENT'S WORLD:[^.]*\./g, " ")
    .split(/(?<=[.;:])\s+|,\s+/)
    .map((s) => s.trim().replace(/[.;:]+$/, ""))
    .filter((s) => s.length > 2 && !PUXA_TEXTO_OU_GENTE.test(s))
    .join(", ");
}

const BASE_DA_FAMILIA: Record<FamiliaDaArte, string> = {
  colagem: "editorial cut-paper collage artwork: textured off-white paper, torn paper edges, flat cut shapes, subtle halftone texture, soft paper shadows, flat lay",
  impacto: "bold, high-contrast artwork: one strong object as the hero, dramatic light, clean graphic composition, punchy color",
  sobrio: "cinematic, restrained photograph: natural light, shallow depth of field, rich but calm color, lots of air",
  claro: "bright, clean editorial photograph: soft daylight, light and airy surfaces, crisp details, calm and trustworthy",
};

/**
 * A proporção que se pede ao modelo: a da ZONA da arte, e não a da peça
 * inteira. Quando a arte ocupa a peça inteira (família sóbria, ou a variante
 * de arte inteira do impacto), pede-se a proporção da peça: até 01/10 a sóbria
 * pedia 16:9 e cortava para 4:5, jogando fora quase metade da cena.
 */
export function proporcaoDaArte(largura: number, altura: number, marca?: MarcaDaArte, frase?: string): ProporcaoPedida {
  if (marca && frase !== undefined && layoutDaPeca(marca, frase).arteInteira) {
    const r = largura / altura;
    return r > 1.2 ? "16:9" : r > 0.95 ? "1:1" : "4:5";
  }
  // Peça em pé ou quadrada: a arte ocupa uma faixa larga. Peça deitada: a
  // arte ocupa uma metade, quase quadrada.
  return largura / altura > 1.2 ? "1:1" : "16:9";
}

/** O tamanho em pixel de cada proporção pedida, antes do recorte da rede. */
export const TAMANHO_DA_PROPORCAO: Record<ProporcaoPedida, { largura: number; altura: number }> = {
  "1:1": { largura: 1080, altura: 1080 },
  "4:5": { largura: 1080, altura: 1350 },
  "16:9": { largura: 1600, altura: 900 },
  "9:16": { largura: 1080, altura: 1920 },
};

/**
 * O fundo que a arte precisa ter para casar com a peça composta. Sem isso a
 * emenda vira uma faixa: impacto assenta no escuro, colagem no papel, claro
 * no tom claro da marca, e a arte inteira vai até a borda.
 */
function fundoDaArte(marca: MarcaDaArte, arteInteira: boolean): string {
  const { escuro, claro, papeis } = marca.cores;
  if (arteInteira) return FUNDO_INTEIRO;
  // O fundo aprovado (05/10): a cena assenta na cor que o cliente chamou de
  // fundo, e não na que o modelo achar que combina.
  if (papeis) return `Background: plain ${nomeDaCor(papeis.fundo)}, evenly lit, so the image blends into a ${nomeDaCor(papeis.fundo)} page.`;
  if (marca.familia === "colagem") return `Background: plain ${nomeDaCor(claro)} paper, evenly lit.`;
  if (marca.familia === "claro") return `Background: plain, bright ${nomeDaCor(claro)}, evenly lit, so the image blends into a light page.`;
  return `Background: plain, very dark ${nomeDaCor(escuro)}, fading to black at the edges, so the image blends into a dark page.`;
}
/** O setor como o modelo de imagem entende, em inglês. */
const SETOR_EM_INGLES: Record<string, string> = {
  saude: "healthcare and medical practice",
  juridico: "law firm",
  fe: "faith-based (Christian church and ministry)",
  energia: "renewable energy and power generation",
  consorcio: "consortium sales and credit for buying a home or a car (Brazilian consórcio)",
  financas: "finance and accounting",
  educacao: "education",
  alimentacao: "food and hospitality",
  beleza: "beauty and wellness",
  imoveis: "real estate and construction",
  industria: "industry and logistics",
  agro: "agribusiness",
  marketing: "content creation and marketing",
  tecnologia: "technology",
  negocios: "business consulting",
};
const FUNDO_INTEIRO = "Background: FULL-BLEED, the scene continues to every edge of the frame; keep one calmer, less detailed area where a headline can sit.";

/**
 * O prompt da arte SEM TEXTO, na forma de 02/10 (prova A/B em
 * scripts/tmp/ab-0210): a cena vem primeiro e inteira, o mundo do cliente
 * entra como sugestão (até aqui era "draw from it so it is obvious", e a
 * arte da Demandou virava um estúdio entulhado de ring light, microfone,
 * megafone, post-its e aviõezinhos de papel), o estilo e a cor da marca como
 * direção, e a guarda em uma frase no fim. O muro de "ABSOLUTE RULES" (três
 * listas de negativas) saiu: o juiz por visão deu 17 a 22 de 25 para a arte
 * com o muro e 24 para a mesma frase pedida como um diretor de arte pede.
 * Quem barra texto e gente continua sendo a conferência (`conferirArte`).
 */
export function promptDaArteSemTexto(o: { visual: string; estilo?: string; marca: MarcaDaArte; frase?: string }): string {
  const look = o.estilo ? lookSemTexto(o.estilo) : "";
  const { acento, escuro, claro } = o.marca.cores;
  const id = o.marca.identidade;
  const setor = id?.setor;
  const arteInteira = o.frase !== undefined ? layoutDaPeca(o.marca, o.frase).arteInteira : o.marca.familia === "sobrio";
  return [
    `Artwork for a social media post${setor ? ` of a ${SETOR_EM_INGLES[setor.id] ?? "business"} brand` : ""}: one scene, one clear focal subject, told with objects, places, materials, light and symbols.`,
    `Scene: ${o.visual}`,
    // O MUNDO DO CLIENTE (01/10) entra ANTES, em quem escreve a cena
    // (`cenaDaFrase` e o redator da manchete recebem `setor.mundo`): a cena
    // já chega no ramo certo. Repetir a lista aqui (até 02/10) devolvia o
    // estúdio inteiro em cima de uma cena que pedia um objeto só. Fica a luz.
    ...(setor ? [`Light and mood: ${setor.luz}.`] : []),
    `Framing: ${enquadramentoDaPeca(o.frase ?? o.visual)}.`,
    `Look: ${BASE_DA_FAMILIA[o.marca.familia]}.${look ? ` Mood from the brand's visual language: ${look}.` : ""}`,
    o.marca.cores.papeis
      ? // Os papéis aprovados (05/10): cada cor no lugar que o cliente deu, sem o modelo redistribuir a paleta.
        `Colour: natural to the scene, leaning toward ${nomeDaCor(o.marca.cores.papeis.destaque)} as the one accent; the page behind it is ${nomeDaCor(o.marca.cores.papeis.fundo)} and the text that will be added is ${nomeDaCor(o.marca.cores.papeis.titulo)}, so keep the scene from fighting those two.`
      : `Colour: natural to the scene, leaning toward ${nomeDaCor(acento)} as the accent, ${nomeDaCor(escuro)} as the dark tone and ${nomeDaCor(claro)} as the light tone.`,
    fundoDaArte(o.marca, arteInteira),
    // O padrão visual medido no nicho (trilho de referências), quando existir.
    // Traço abstrato, nunca a peça de outra marca.
    ...(id?.padroesVisuais?.length
      ? [`What performs visually in this niche, measured (Portuguese notes, apply only the abstract composition traits, never a specific post, brand, logo or face): ${id.padroesVisuais.join(" | ")}`]
      : []),
    // As regras que o cliente aprovou para a arte (02/10, lib/referencias/regras.ts).
    ...(id?.regrasDaArte?.length
      ? [`Rules the client approved for this project's art (Portuguese; the guard below still wins): ${id.regrasDaArte.join(" | ")}`]
      : []),
    // O que é do setor (para não parecer outro ramo) e o clichê da mesa com
    // luminária ficam como direção curta, em uma linha.
    `Steer clear of${setor ? ` ${setor.evitar}, and of` : ""} the generic desk with a lamp, open notebook, lantern or coffee mug unless the scene asks for it.`,
    `The headline is added later in code, so the image carries no words, numbers or interface panels; no people (suggest them with objects: an empty chair, a coat on a hook, a door left open); no logos.`,
  ].join("\n");
}

/**
 * A cena, em inglês, de uma frase em português. Para quem só tem a frase (a
 * semana do vídeo): escrever a cena é uma chamada curta de texto, e mandar a
 * frase em português ao modelo de imagem era convidá-lo a escrevê-la.
 */
export async function cenaDaFrase(
  frase: string,
  nicho: string | null | undefined,
  usage?: { projectId?: string; runId?: string; operation?: string },
  /**
   * A identidade do projeto (01/10). Com ela a cena sai do mundo do cliente,
   * pensada para o público dele e no tom dele, e não da mesa com luminária
   * que servia a qualquer nicho.
   */
  identidade?: IdentidadeVisual
): Promise<string> {
  // O mundo do cliente é CENÁRIO, não lista de compras (02/10, prova A/B): com
  // "pick places and objects from here", a Demandou saía sempre como o estúdio
  // de criador entulhado (ring light, microfone, megafone, post-its, aviões
  // de papel), fosse qual fosse a frase. Um diretor de arte acha UMA metáfora
  // para a frase (um objeto, uma situação) e só então decide o cenário.
  const contexto = identidade
    ? [
        `Sector: ${identidade.setor.nome} (Portuguese label).`,
        `The client's world, as setting cues only (use at most one or two of these, and only if they serve the metaphor): ${identidade.setor.mundo}.`,
        identidade.publico ? `Who will see this post (Portuguese): ${identidade.publico.slice(0, 400)}` : "",
        identidade.tom ? `Brand tone of voice (Portuguese): ${identidade.tom.slice(0, 200)}` : "",
        `Framing to use: ${enquadramentoDaPeca(frase)}.`,
        identidade.padroesVisuais?.length ? `Measured visual traits that perform in this niche (Portuguese, abstract only): ${identidade.padroesVisuais.join(" | ")}` : "",
        identidade.regrasDaArte?.length ? `Rules the client approved for this project's art (Portuguese; never against the rules above): ${identidade.regrasDaArte.join(" | ")}` : "",
        `Steer clear of ${identidade.setor.evitar}, and of the generic desk with a lamp, open notebook, lantern or coffee mug.`,
      ].filter(Boolean).join("\n")
    : "";
  const bruto = await askClaude(
    "You are an advertising art director briefing a photographer. Find ONE visual metaphor for the sentence: one object or one simple situation that carries the idea on its own (the way a great print ad does), and describe it as a photo brief in English, at most 45 words: subject, setting, light, lens and mood. One clear focal subject, nothing cluttered, no list of props. Tell the idea with objects, places, materials and light only, so the scene works without people in it and without any writing. Return only the description.",
    `Niche: ${nicho ?? "business"}\n${contexto ? `${contexto}\n` : ""}The Portuguese sentence the scene must evoke (do NOT write it in the scene): "${frase}"`,
    { maxTokens: 4000, effort: "low", usage: { operation: "cena_da_frase", ...usage } }
  );
  return bruto.replace(/\s+/g, " ").trim().slice(0, 400);
}

type Fontes = { anton: Buffer; serif: Buffer; sans: Buffer; sansRegular: Buffer };
let fontesEmCache: Fontes | null = null;
export async function fontesDaArte(): Promise<Fontes> {
  if (fontesEmCache) return fontesEmCache;
  // As mesmas fontes da capa (licença OFL, arquivos ao lado): o feed e o vídeo
  // falam a mesma tipografia.
  const pasta = join(process.cwd(), "lib", "media", "fontes-da-capa");
  const [anton, serif, sans, sansRegular] = await Promise.all([
    readFile(join(pasta, "Anton-Regular.ttf")),
    readFile(join(pasta, "PT_Serif-Bold.ttf")),
    readFile(join(pasta, "LiberationSans-Bold.ttf")),
    readFile(join(pasta, "LiberationSans-Regular.ttf")),
  ]);
  fontesEmCache = { anton, serif, sans, sansRegular };
  return fontesEmCache;
}

export function fontesDoSatori(f: Fontes) {
  return [
    { name: "Anton", data: f.anton, weight: 400 as const, style: "normal" as const },
    { name: "Serif", data: f.serif, weight: 700 as const, style: "normal" as const },
    { name: "Sans", data: f.sans, weight: 700 as const, style: "normal" as const },
    { name: "Sans", data: f.sansRegular, weight: 400 as const, style: "normal" as const },
  ];
}

/** A palavra do destaque: número primeiro (é o que mais segura o olho), senão a mais longa. */
export function destaqueDaFrase(frase: string): string {
  const comNumero = frase.split(/\s+/).find((w) => /\d/.test(w));
  return comNumero ?? palavraDeDestaque(frase);
}

/**
 * Quebra a frase no MAIOR corpo que cabe na caixa, medindo cada palavra pela
 * métrica real da fonte (lib/media/metricas-de-fonte.ts), e equilibra as
 * linhas para nenhuma preposição ficar sozinha na última.
 */
export function encaixarFrase(o: {
  frase: string;
  fonte: "Anton" | "PT Serif" | "Liberation Sans";
  largura: number;
  altura: number;
  entrelinha: number;
  corpoMaximo: number;
  /** Folga horizontal por linha, em corpos (faixa de papel, bloco do destaque). */
  folga: number;
}): { linhas: string[]; corpo: number } {
  const palavras = o.frase.split(/\s+/).filter(Boolean);
  const espaco = 0.26;
  const larguraDe = (ws: string[]) => ws.reduce((s, w) => s + larguraEmCorpos(w, o.fonte), 0) + espaco * (ws.length - 1) + o.folga;
  const quebrar = (limite: number): string[][] => {
    const saida: string[][] = [];
    let atual: string[] = [];
    for (const w of palavras) {
      if (atual.length && larguraDe([...atual, w]) > limite) {
        saida.push(atual);
        atual = [w];
      } else atual.push(w);
    }
    if (atual.length) saida.push(atual);
    return saida;
  };
  for (let corpo = o.corpoMaximo; corpo >= 18; corpo -= 2) {
    const limite = o.largura / corpo;
    const ls = quebrar(limite);
    if (ls.some((l) => larguraDe(l) > limite)) continue;
    if (ls.length * corpo * o.entrelinha > o.altura) continue;
    // Equilíbrio: aperta o limite enquanto o número de linhas não muda.
    let melhor = ls;
    for (let l = limite * 0.98; l > limite * 0.5; l *= 0.98) {
      const t = quebrar(l);
      if (t.length !== ls.length || t.some((x) => larguraDe(x) > l)) break;
      melhor = t;
    }
    return { linhas: melhor.map((l) => l.join(" ")), corpo };
  }
  return { linhas: [o.frase], corpo: 18 };
}

const dataUrl = (b: Buffer, tipo = "image/png") => `data:${tipo};base64,${b.toString("base64")}`;

/** Luminância relativa de um hex (0 escuro, 1 claro), para decidir contraste. */
function luminancia(hex: string): number {
  const c = hex.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c.slice(0, 6);
  const canal = (i: number) => {
    const v = parseInt(full.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * canal(0) + 0.7152 * canal(2) + 0.0722 * canal(4);
}

/** A letra que cada tipografia usa no Satori e na medida. */
const LETRA: Record<Tipografia, { satori: string; medida: "Anton" | "PT Serif" | "Liberation Sans" }> = {
  condensada: { satori: "Anton", medida: "Anton" },
  serifada: { satori: "Serif", medida: "PT Serif" },
  "sem-serifa": { satori: "Sans", medida: "Liberation Sans" },
};

/**
 * Compõe a frase sobre a arte, no tamanho final da peça, e devolve JPEG.
 * Sem chamada paga: tudo aqui é código.
 *
 * O desenho por família segue a capa, e desde 01/10 tem uma quarta:
 * - colagem: fundo de papel na cor clara, a arte vira uma foto colada e torta
 *   com borda branca, a frase em tiras de papel com marca-texto na palavra;
 * - impacto: fundo escuro, a arte numa faixa que se dissolve nele, a frase em
 *   caixa alta pesada com a palavra num bloco da cor da marca;
 * - sóbrio: a arte ocupa tudo e escurece do lado do texto, um fio da cor da
 *   marca acima da frase;
 * - claro (01/10): fundo claro da marca, a arte num quadro de cantos
 *   arredondados, frase escura em caixa normal com a palavra na cor da marca.
 *   É a cara de consultório, escola e escritório, que no "impacto" pareciam
 *   pôster de agência.
 *
 * VARIEDADE (01/10): até aqui toda peça tinha o texto em cima e a arte
 * embaixo. Agora cada frase tira uma variante do layout (texto primeiro, arte
 * primeiro e, no impacto, arte na peça inteira), e a LETRA vem da identidade
 * (manual ou setor), em vez de Anton para todo cliente.
 */
export async function comporFraseNaArte(p: {
  arte: Buffer | null;
  frase: string;
  marca: MarcaDaArte;
  largura: number;
  altura: number;
  /** A pessoa recortada da foto real (PNG), para o modelo com profundidade. */
  recorte?: Buffer | null;
}): Promise<Buffer> {
  // O TRATAMENTO DA FOTO (05/10): antes de qualquer composição, a cena vira
  // dois tons da marca (ou preto e branco) quando a identidade ou o pedido do
  // cliente exige a paleta estrita. Em código, sem pagar imagem nova. Se o
  // tratamento falhar, a foto segue natural: pior sair sem tratar que sem foto.
  if (p.arte && p.marca.tratamento) {
    p = {
      ...p,
      arte: await aplicarTratamento(p.arte, p.marca.tratamento, { escuro: p.marca.cores.escuro, destaque: p.marca.cores.acento }).catch((e) => {
        console.warn("[arte-com-frase] o tratamento da foto não entrou, a foto segue natural:", e instanceof Error ? e.message : e);
        return p.arte;
      }),
    };
  }
  // O MODELO DO BOOK (03/10): quando o cliente escolheu modelos, a peça sai no
  // molde de um deles, com o mesmo desenho da prévia que ele viu.
  const modelo = await modeloDaMarca(p.marca, p.largura, p.altura, p.frase);
  if (modelo) {
    const { comporNoModelo } = await import("@/lib/modelos-de-arte/compor");
    return comporNoModelo({
      modelo,
      textos: await textosDaPecaNoModelo(modelo, p.frase, p.marca),
      cores: p.marca.cores,
      largura: p.largura,
      altura: p.altura,
      foto: p.arte,
      logo: p.marca.logoDoModelo,
      marca: p.marca.nomeDaMarca || "Sua marca",
      pagina: p.marca.pagina ?? null,
      recorte: p.recorte ?? null,
      letra: p.marca.letra ?? null,
    });
  }
  const W = p.largura;
  const H = p.altura;
  const { familia } = p.marca;
  const { acento, escuro, claro } = p.marca.cores;
  const f = await fontesDaArte();
  const deitada = W / H > 1.2;
  // Margem de 8% do lado menor: o recorte para a rede (16:9 para 1,91:1) tira
  // até 3,5% de cada lado, e o texto precisa sobrar inteiro.
  const m = Math.round(Math.min(W, H) * 0.08);
  const { variante, arteInteira } = layoutDaPeca(p.marca, p.frase);
  // Texto em cima (ou à esquerda) na variante 0; nas outras, a arte vem antes
  // e o texto fecha a peça embaixo (ou à direita).
  const textoNoInicio = variante === 0;

  // ── As duas zonas ──
  const zonaTexto = deitada
    ? textoNoInicio
      ? { x: m, y: m, w: Math.round(W * 0.52) - m, h: H - 2 * m }
      : { x: Math.round(W * 0.48) + m, y: m, w: Math.round(W * 0.52) - 2 * m, h: H - 2 * m }
    : textoNoInicio
      ? { x: m, y: m, w: W - 2 * m, h: Math.round(H * 0.46) - m }
      : { x: m, y: Math.round(H * 0.54), w: W - 2 * m, h: Math.round(H * 0.46) - m };
  const zonaArte = deitada
    ? textoNoInicio
      ? { x: Math.round(W * 0.5), y: 0, w: W - Math.round(W * 0.5), h: H }
      : { x: 0, y: 0, w: Math.round(W * 0.5), h: H }
    : textoNoInicio
      ? { x: 0, y: Math.round(H * 0.44), w: W, h: H - Math.round(H * 0.44) }
      : { x: 0, y: 0, w: W, h: Math.round(H * 0.56) };

  // ── Texto ──
  // Sem tipografia na marca (quem monta a marca à mão), vale o de antes:
  // serifa no sóbrio e Anton no resto.
  const tipografia: Tipografia = p.marca.tipografia ?? (familia === "sobrio" ? "serifada" : "condensada");
  const letra = LETRA[tipografia];
  const maiuscula = familia === "impacto" || tipografia === "condensada";
  const frase = (maiuscula ? p.frase.toUpperCase() : p.frase).trim().replace(/[.!]+$/, "");
  const destaque = destaqueDaFrase(frase);
  const encaixe = encaixarFrase({
    frase,
    fonte: letra.medida,
    largura: zonaTexto.w,
    altura: zonaTexto.h - (familia === "impacto" ? 0 : Math.min(W, H) * 0.06),
    entrelinha: familia === "colagem" ? 1.3 : tipografia === "condensada" ? 1.12 : 1.2,
    corpoMaximo: Math.round(Math.min(W, H) * (deitada ? 0.1 : tipografia === "condensada" ? 0.11 : 0.095)),
    folga: familia === "colagem" ? 0.5 : 0.3,
  });
  const s = encaixe.corpo;
  // Com os papéis aprovados (05/10), o fundo e o título são os que o cliente
  // escolheu, em qualquer família; "claro" passa a ser "o fundo aprovado é claro".
  const papeis = p.marca.cores.papeis;
  const fundoClaro = papeis ? luminancia(papeis.fundo) > 0.42 : familia === "colagem" || familia === "claro";
  const corDoTexto = papeis ? papeis.titulo : fundoClaro ? escuro : "#ffffff";
  // Contraste do destaque: acento claro some no fundo claro, acento escuro
  // some no fundo escuro. Nesses casos a palavra fica na cor do texto e o
  // acento vira o sublinhado.
  const lumAcento = luminancia(acento);
  const destaqueColorido = fundoClaro ? lumAcento < 0.45 : lumAcento > 0.18;

  // ── Arte ──
  const ladoDoTexto = deitada ? (textoNoInicio ? "esquerda" : "direita") : textoNoInicio ? "cima" : "baixo";
  const grau: Record<string, number> = { cima: 180, baixo: 0, esquerda: 90, direita: 270 };
  let fundoPng: Buffer | null = null;
  let artePng: Buffer | null = null;
  const molduraClara = Math.round(m * 0.6);
  const tamanhoDaColagem = { w: Math.round(zonaArte.w * (deitada ? 0.8 : 0.78)), h: Math.round(zonaArte.h * (deitada ? 0.72 : 0.8)) };
  if (p.arte) {
    if (arteInteira) {
      fundoPng = await sharp(p.arte).resize(W, H, { fit: "cover", position: "attention" }).png().toBuffer();
    } else if (familia === "colagem") {
      artePng = await sharp(p.arte).resize(tamanhoDaColagem.w, tamanhoDaColagem.h, { fit: "cover", position: "attention" }).png().toBuffer();
    } else if (familia === "claro") {
      artePng = await sharp(p.arte)
        .resize(zonaArte.w - 2 * molduraClara, zonaArte.h - 2 * molduraClara, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
    } else {
      artePng = await sharp(p.arte).resize(zonaArte.w, zonaArte.h, { fit: "cover", position: "attention" }).png().toBuffer();
    }
  }

  const palavra = (w: string, i: number) => {
    const ehDestaque = w === destaque;
    if (familia === "colagem" && ehDestaque) {
      return (
        <div key={i} style={{ display: "flex", position: "relative", marginRight: s * 0.26 }}>
          <div style={{ position: "absolute", left: -s * 0.08, right: -s * 0.08, top: s * 0.3, bottom: s * 0.02, background: acento, opacity: lumAcento < 0.25 ? 0.45 : 0.9, transform: "rotate(-1.5deg)", borderRadius: 4 }} />
          <span style={{ position: "relative" }}>{w}</span>
        </div>
      );
    }
    if (familia === "impacto" && ehDestaque) {
      return (
        <div key={i} style={{ display: "flex", background: acento, color: lumAcento > 0.35 ? "#111111" : "#ffffff", padding: `0 ${s * 0.12}px`, marginRight: s * 0.26, transform: "rotate(-2deg)" }}>
          {w}
        </div>
      );
    }
    if ((familia === "sobrio" || familia === "claro") && ehDestaque) {
      return (
        <div key={i} style={{ display: "flex", flexDirection: "column", marginRight: s * 0.26 }}>
          <span style={{ color: destaqueColorido ? acento : corDoTexto }}>{w}</span>
          {!destaqueColorido && <div style={{ display: "flex", height: Math.max(4, s * 0.07), background: acento, marginTop: -s * 0.06 }} />}
        </div>
      );
    }
    return (
      <span key={i} style={{ marginRight: s * 0.26 }}>
        {w}
      </span>
    );
  };

  const fundoDaPeca = papeis ? papeis.fundo : fundoClaro ? claro : escuro;
  const fioNoTopo = familia === "sobrio" || familia === "claro";
  const resposta = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: fundoDaPeca }}>
        {fundoPng && <img src={dataUrl(fundoPng)} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }} />}
        {arteInteira && (
          // A arte inteira escurece do lado do texto, mais forte no impacto,
          // que precisa da letra branca pesada legível em qualquer cena.
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: W,
              height: H,
              backgroundImage:
                familia === "impacto"
                  ? `linear-gradient(${grau[ladoDoTexto]}deg, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.7) 42%, rgba(0,0,0,0.15) 75%)`
                  : `linear-gradient(${grau[ladoDoTexto]}deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0.05) 80%)`,
            }}
          />
        )}
        {familia === "impacto" && !arteInteira && artePng && (
          <div style={{ position: "absolute", left: zonaArte.x, top: zonaArte.y, width: zonaArte.w, height: zonaArte.h, display: "flex" }}>
            <img src={dataUrl(artePng)} width={zonaArte.w} height={zonaArte.h} />
            {/* A arte se dissolve no fundo escuro do lado do texto, sem linha dura. */}
            <div
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: zonaArte.w,
                height: zonaArte.h,
                backgroundImage: `linear-gradient(${grau[ladoDoTexto]}deg, ${escuro} 0%, rgba(0,0,0,0) ${deitada ? 35 : 30}%)`,
              }}
            />
          </div>
        )}
        {familia === "claro" && artePng && (
          <div
            style={{
              position: "absolute",
              display: "flex",
              left: zonaArte.x + molduraClara,
              top: zonaArte.y + molduraClara,
              width: zonaArte.w - 2 * molduraClara,
              height: zonaArte.h - 2 * molduraClara,
              borderRadius: Math.round(m * 0.35),
              overflow: "hidden",
              boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
            }}
          >
            <img src={dataUrl(artePng)} width={zonaArte.w - 2 * molduraClara} height={zonaArte.h - 2 * molduraClara} />
          </div>
        )}
        {familia === "colagem" && artePng && (
          <div
            style={{
              position: "absolute",
              display: "flex",
              left: zonaArte.x + (zonaArte.w - tamanhoDaColagem.w) / 2,
              top: zonaArte.y + (zonaArte.h - tamanhoDaColagem.h) / 2,
              transform: textoNoInicio ? "rotate(2deg)" : "rotate(-2deg)",
            }}
          >
            {/* A tira de papel na cor da marca atrás da foto colada. */}
            <div style={{ position: "absolute", left: -m * 0.4, top: m * 0.5, width: "70%", height: "60%", background: acento, transform: "rotate(-5deg)" }} />
            <div style={{ display: "flex", padding: Math.round(m * 0.18), background: "#ffffff", boxShadow: "0 14px 34px rgba(0,0,0,0.28)" }}>
              <img src={dataUrl(artePng)} width={tamanhoDaColagem.w} height={tamanhoDaColagem.h} />
            </div>
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: zonaTexto.x,
            top: zonaTexto.y,
            width: zonaTexto.w,
            height: zonaTexto.h,
            display: "flex",
            flexDirection: "column",
            justifyContent: deitada ? "center" : textoNoInicio ? "flex-start" : "flex-end",
            alignItems: "flex-start",
          }}
        >
          {familia === "colagem" && <div style={{ display: "flex", width: s * 1.2, height: s * 0.12, background: escuro, marginBottom: s * 0.3 }} />}
          {fioNoTopo && <div style={{ display: "flex", width: s * 1.6, height: Math.max(6, Math.round(s * 0.08)), background: acento, marginBottom: s * 0.4 }} />}
          {encaixe.linhas.map((l, li) => (
            <div
              key={li}
              style={{
                display: "flex",
                fontFamily: letra.satori,
                fontWeight: 700,
                fontSize: s,
                lineHeight: tipografia === "condensada" ? 1.08 : 1.14,
                color: corDoTexto,
                ...(familia === "colagem"
                  ? {
                      background: "rgba(255,255,255,0.94)",
                      padding: `${s * 0.04}px ${s * 0.18}px`,
                      marginBottom: s * 0.14,
                      transform: `rotate(${li % 2 ? 0.8 : -0.8}deg)`,
                      boxShadow: "0 6px 16px rgba(0,0,0,0.16)",
                    }
                  : { marginBottom: s * 0.04, textShadow: arteInteira ? "0 3px 14px rgba(0,0,0,0.5)" : "none" }),
              }}
            >
              {l.split(" ").map((w, wi) => palavra(w, li * 20 + wi))}
            </div>
          ))}
        </div>
      </div>
    ),
    { width: W, height: H, fonts: fontesDoSatori(f) }
  );
  const png = Buffer.from(await resposta.arrayBuffer());
  return sharp(png).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
}

function bufferDe(uri: string): Buffer {
  const i = uri.indexOf(",");
  return Buffer.from(uri.slice(i + 1), "base64");
}

/**
 * O `desenhar` de `produzirArtePorRede` com a frase em código.
 *
 * Recebe o desenhista de sempre (GPT Image, Gemini) e devolve outro com a mesma
 * assinatura: pede a arte SEM TEXTO na proporção da zona da arte e compõe a
 * frase no tamanho da proporção da peça. O recorte e a conferência de
 * `produzirArtePorRede` seguem iguais, agora sobre a peça composta.
 */
export function desenharComFraseEmCodigo(
  frase: string,
  marca: MarcaDaArte,
  desenhista: (prompt: string, proporcao: ProporcaoPedida) => Promise<string>
): (prompt: string, proporcao: ProporcaoPedida) => Promise<string> {
  return async (prompt, proporcao) => {
    // A TRAVA (05/10): sem identidade aprovada, nada pago sai daqui.
    exigirIdentidadeAprovada(marca);
    const { largura, altura } = TAMANHO_DA_PROPORCAO[proporcao];
    // O MATERIAL DO CLIENTE PRIMEIRO (03/10): a foto real que serve ao post,
    // tratada e composta, sem pagar imagem nova. Falhou, segue o de antes.
    if (marca.materiais?.length) {
      const doCliente = await arteComMaterialDoCliente({ frase, marca, largura, altura }).catch((e) => {
        console.warn("[arte-com-frase] o material do cliente não entrou:", e instanceof Error ? e.message : e);
        return null;
      });
      if (doCliente) return `data:image/jpeg;base64,${doCliente.jpeg.toString("base64")}`;
    }
    // MODELO DO BOOK (03/10): modelo sem foto não paga imagem nenhuma; modelo
    // com foto pede a cena na proporção da zona da foto, na direção dele.
    const modelo = await modeloDaMarca(marca, largura, altura, frase);
    if (modelo) {
      const { proporcaoDaFotoDoModelo, direcaoDaFotoDoModelo } = await import("@/lib/modelos-de-arte/compor");
      const proporcaoDaFoto = proporcaoDaFotoDoModelo(modelo, largura, altura);
      let foto: Buffer | null = null;
      if (proporcaoDaFoto) {
        try {
          foto = bufferDe(await desenhista(`${prompt}${direcaoDaFotoDoModelo(modelo)}`, proporcaoDaFoto));
        } catch (err) {
          if (ehErroDeSaldo(err) || ehSemSaldoDaOpenAI(err) || err instanceof SemChaveDaOpenAI) throw err;
          console.warn("[arte-com-frase] a foto do modelo não veio, a peça sai com o tom da marca:", err instanceof Error ? err.message : err);
        }
      }
      const jpeg = await comporFraseNaArte({ arte: foto, frase, marca, largura, altura });
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }
    let arte: Buffer | null = null;
    // O layout sai da frase. Quando ele pede a arte na peça inteira e o
    // prompt veio montado sem saber disso (a esteira monta o prompt antes de
    // ter a manchete composta), o fundo chapado vira cena até a borda.
    const { arteInteira } = layoutDaPeca(marca, frase);
    const pedido = arteInteira && !prompt.includes("FULL-BLEED") ? `${prompt}\n${FUNDO_INTEIRO} (This overrides the plain background above.)` : prompt;
    try {
      arte = bufferDe(await desenhista(pedido, proporcaoDaArte(largura, altura, marca, frase)));
    } catch (err) {
      // Sem arte, a peça ainda sai: a frase na marca, sobre o fundo da marca.
      // Erro de saldo sobe, porque é a plataforma parada e a fila precisa saber.
      const msg = err instanceof Error ? `${err.name} ${err.message}` : String(err);
      if (ehErroDeSaldo(err) || ehSemSaldoDaOpenAI(err) || err instanceof SemChaveDaOpenAI) throw err;
      console.warn("[arte-com-frase] a arte não veio, a peça sai só com a frase:", msg);
    }
    const jpeg = await comporFraseNaArte({ arte, frase, marca, largura, altura });
    return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  };
}

/**
 * A peça pronta, de uma vez, para quem não passa por `produzirArtePorRede`
 * (a semana do vídeo): cena, arte sem texto e frase composta no tamanho da
 * rede. Devolve data URI JPEG.
 */
export async function pecaComFraseEmCodigo(o: {
  frase: string;
  marca: MarcaDaArte;
  largura: number;
  altura: number;
  visual: string;
  estilo?: string;
  desenhista: (prompt: string, proporcao: ProporcaoPedida) => Promise<string>;
}): Promise<string> {
  const desenhar = desenharComFraseEmCodigo(o.frase, o.marca, o.desenhista);
  const bruto = await desenhar(promptDaArteSemTexto({ visual: o.visual, estilo: o.estilo, marca: o.marca, frase: o.frase }), o.largura / o.altura > 1.2 ? "16:9" : o.largura === o.altura ? "1:1" : "4:5");
  // O composto sai na proporção pedida; o ajuste final deixa no pixel exato da rede.
  const jpeg = await sharp(bufferDe(bruto)).resize(o.largura, o.altura, { fit: "cover", position: "centre" }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
}
