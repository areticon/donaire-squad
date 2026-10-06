import { list, put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { dataUrlToBuffer, gerarImagem } from "@/lib/media/nano-banana";
import { lerMidia, midiaProduzida } from "@/lib/media/storage";
import { GUARDA_DA_IMAGEM_ESTILIZADA, familiaPorPalavras, type FamiliaVisual } from "@/lib/media/editor-por-comando/linguagem";
import { modeloPorId, type Arquetipo, type ModeloDeArte, type TextosDaArte } from "@/lib/modelos-de-arte/catalogo";
import { comporNoModelo } from "@/lib/modelos-de-arte/compor";
import { fundoInteiroDoModelo, soTexto } from "@/lib/modelos-de-arte/prompts-com-foto";
import { textosDeExemplo } from "@/lib/modelos-de-arte/textos-de-exemplo";
import { recortarPessoaNoFal } from "@/lib/materiais/servidor";
import { custoEstimadoDasPrevias, type TipoDeDesign } from "@/lib/biblioteca-de-design/tipos";

/**
 * AS PRÉVIAS DA BIBLIOTECA (06/10/2026): cada entrada ganha UMA imagem de
 * exemplo gerada pelo melhor modelo de imagem (gpt-image 2 primeiro, Gemini
 * depois, Higgsfield em terceiro: a ordem de lib/media/nano-banana.ts). Até
 * ser gerada, a galeria mostra "prévia ainda não gerada".
 *
 * REGRA DO BRUNO: nenhum gasto pago sem o OK dele e o valor antes. Então:
 *   - `previasPendentes()` só conta e estima (US$ 0,05 a 0,10 por prévia);
 *   - `gerarPreviasPendentes()` exige `confirmar: true` (o admin leu o custo
 *     e clicou), tem teto por chamada e grava o custo real de cada prévia em
 *     `previaCustoUsd` e em ai_usage (operation "biblioteca-previa").
 *
 * A PRÉVIA É A ARTE COMPOSTA, NÃO A FOTO (06/10, 02h45): as 45 primeiras
 * prévias de imagem saíram como a foto crua do modelo de imagem ("Você sobre
 * o mapa" era um retrato em fundo escuro, sem mapa nem frase). A prévia certa
 * de um modelo do book é a foto PASSANDO pela composição em código do modelo
 * (frase de exemplo, mapa, tira de papel, marca-texto, selo), igual ao que o
 * cliente recebe: `comporNoModelo`, o mesmo de lib/media/arte-com-frase.tsx.
 * A foto crua fica guardada no Blob num caminho fixo por id
 * (`caminhoDaFotoBase`), para recompor sem pagar imagem nova; o banco guarda
 * só a composição em `previaUrl` (não há coluna de metadata na tabela).
 * Nos estilos de vídeo a prévia é a arte do estilo (/estilos) ou a imagem
 * gerada, aceitável por ora.
 */

export const TETO_DE_PREVIAS_POR_CHAMADA = 20;

export async function previasPendentes(): Promise<{ total: number; porTipo: Record<TipoDeDesign, number>; custo: ReturnType<typeof custoEstimadoDasPrevias> }> {
  const grupos = await prisma.designDaBiblioteca.groupBy({ by: ["tipo"], where: { previaUrl: null, publico: true }, _count: { _all: true } }).catch(() => []);
  const porTipo: Record<TipoDeDesign, number> = { video: 0, imagem: 0 };
  for (const g of grupos) if (g.tipo === "video" || g.tipo === "imagem") porTipo[g.tipo] = g._count._all;
  const total = porTipo.video + porTipo.imagem;
  return { total, porTipo, custo: custoEstimadoDasPrevias(total) };
}

/** As variáveis dos prompts do book ({destaque}, {manchete}...) preenchidas com um exemplo neutro. */
function preencherVariaveis(linguagem: string): string {
  const v: Record<string, string> = {
    destaque: "warm orange",
    fundo: "deep charcoal",
    titulo: "off-white",
    paleta: "charcoal, off-white and a warm orange accent",
    manchete: "an example headline",
    palavra: "example",
    foto: "an anonymous professional seen from the chest up",
    formato: "4:5 portrait post",
    cena: "a calm workspace with natural light",
  };
  return linguagem.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
}

/** O prompt da prévia: um quadro de exemplo na linguagem do design, sem texto. */
export function promptDaPrevia(d: { tipo: string; linguagem: string; descricao: string }): string {
  const base = preencherVariaveis(d.linguagem).replace(/\s+/g, " ").trim();
  if (d.tipo === "video") {
    return `A single frame from a social video edited in this visual language, the presenter seen from the chest up on the left third, one graphic element of the style on the right: ${base}${GUARDA_DA_IMAGEM_ESTILIZADA}`;
  }
  return `${base}${/no text/i.test(base) ? "" : GUARDA_DA_IMAGEM_ESTILIZADA}`;
}

// ───────────────────────── a composição da prévia ─────────────────────────

/** A frase de exemplo, neutra, em português; a curta para os modelos de até 6 palavras. */
export const FRASE_DA_PREVIA = "O essencial bem feito vale mais que o volume";
export const FRASE_CURTA_DA_PREVIA = "O essencial bem feito";

/** A marca de exemplo: paleta neutra (escuro, acento, claro) e a letra padrão de cada modelo. */
export const MARCA_DA_PREVIA = { nome: "Sua marca", cores: { acento: "#b3001b", escuro: "#111111", claro: "#f4f1ec" } } as const;

/** O formato da prévia: post 4:5, o mesmo do book. */
export const TAMANHO_DA_PREVIA = { largura: 1080, altura: 1350 } as const;

/** BiRefNet v2 na fal (lib/materiais/servidor.ts): ~US$ 0,003 por recorte, gravado em ai_usage por lá. */
const CUSTO_DO_RECORTE_USD = 0.003;

/** O modelo genérico para a entrada de cliente sem modelo nem família reconhecível: foto crua com a frase na faixa escura. */
export const MODELO_GENERICO_DA_PREVIA = "foto-legenda-escura";

/**
 * O modelo do book mais próximo de cada família visual (lib/media/editor-por-
 * comando/linguagem.ts), para as entradas criadas por cliente (origem
 * "cliente", sem catalogoId): a família sai das palavras do pedido e da
 * linguagem. Só modelos COM lugar para foto, para a imagem gerada aparecer.
 */
const MODELO_POR_FAMILIA: Record<FamiliaVisual, string> = {
  papel: "foto-pb-com-tira-de-papel",
  vidro: "foto-escura-texto-no-centro",
  neon: "foto-escura-texto-no-centro",
  luxo: "foto-escura-texto-no-centro",
  giz: "foto-legenda-clara",
  realista: "foto-legenda-escura",
  traco: "polaroid-legenda-a-mao",
  minimalista: "foto-legenda-clara",
  impacto: "foto-inteira-degrade",
};

/** O modelo que compõe a prévia de uma entrada de imagem: o do catálogo, ou o mais próximo pela família, ou o genérico. */
export function modeloDaPrevia(d: { catalogoId?: string | null; pedidoOriginal?: string | null; linguagem?: string | null }): ModeloDeArte {
  const doCatalogo = d.catalogoId ? modeloPorId(d.catalogoId) : undefined;
  if (doCatalogo) return doCatalogo;
  const familia = familiaPorPalavras(`${d.pedidoOriginal ?? ""} ${d.linguagem ?? ""}`);
  return modeloPorId(MODELO_POR_FAMILIA[familia]) ?? modeloPorId(MODELO_GENERICO_DA_PREVIA)!;
}

/** Os arquétipos cujo título não é uma frase livre (o dado, o verbete, a enquete...): fica o exemplo do book. */
const TITULO_DO_EXEMPLO = new Set<Arquetipo>(["dado", "dado-barra", "dois-lados", "vox-antes-depois", "verbete", "enquete", "caixa-pergunta", "print-conversa"]);

/**
 * Os textos da prévia: o jogo de exemplo do book (itens, lados, número,
 * opções, chamada: lib/modelos-de-arte/textos-de-exemplo.ts, setor
 * "negocios") com a frase neutra no título, sem chamada ao Claude.
 */
export function textosDaPrevia(modelo: ModeloDeArte): TextosDaArte {
  const base = textosDeExemplo(modelo, "negocios");
  if (TITULO_DO_EXEMPLO.has(modelo.arquetipo)) return base;
  return { ...base, titulo: modelo.maxPalavras <= 6 ? FRASE_CURTA_DA_PREVIA : FRASE_DA_PREVIA };
}

/** O caminho fixo da foto crua de uma prévia no Blob (sem sufixo, sobrescrito a cada geração). */
export function caminhoDaFotoBase(id: string): string {
  return `biblioteca-de-design/previas/fotos/${id}.jpg`;
}

/** A foto crua guardada de uma prévia, se existe no Blob. */
export async function fotoBaseDaPrevia(id: string): Promise<Buffer | null> {
  const token = midiaProduzida().token;
  const r = await list({ prefix: caminhoDaFotoBase(id), limit: 1, token }).catch(() => null);
  const url = r?.blobs[0]?.url;
  return url ? lerMidia(url).catch(() => null) : null;
}

/** Guarda a foto crua no caminho fixo. Devolve a URL. */
export async function guardarFotoBase(id: string, foto: Buffer): Promise<string> {
  const salvo = await put(caminhoDaFotoBase(id), foto, { ...midiaProduzida(), contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
  return salvo.url;
}

export type PreviaComposta = { jpeg: Buffer; recorte: Buffer | null; recorteUsd: number };

/**
 * A PRÉVIA COMPOSTA de um modelo do book: a foto gerada passando pela
 * composição em código do modelo, exatamente como a esteira compõe a peça
 * (lib/media/arte-com-frase.tsx, comporFraseNaArte com modelo):
 *   - família Vox (fundo inteiro): a imagem é o fundo gerado, a tipografia em cima;
 *   - modelo com foto "recorte": a pessoa recortada da foto (BiRefNet, o mesmo
 *     da esteira, ~US$ 0,003, registrado em ai_usage) na frente do título,
 *     sobre a foto; sem FAL_KEY ou sem pessoa, a foto entra sem profundidade;
 *   - demais modelos com foto: a foto na zona do modelo;
 *   - modelo só texto: o desenho inteiro em código, sem foto.
 * `recorte` pronto evita pagar o recorte de novo (a recomposição guarda o dela).
 */
export async function comporPreviaDoModelo(o: { modelo: ModeloDeArte; foto: Buffer | null; recorte?: Buffer | null; operation?: string }): Promise<PreviaComposta> {
  const { modelo } = o;
  const comFoto = !soTexto(modelo) && o.foto ? o.foto : null;
  let recorte = o.recorte ?? null;
  let recorteUsd = 0;
  if (comFoto && modelo.foto === "recorte" && !fundoInteiroDoModelo(modelo) && !recorte && process.env.FAL_KEY) {
    recorte = await recortarPessoaNoFal(comFoto, { operation: o.operation ?? "biblioteca-previa-recorte" }).catch((e) => {
      console.warn("[biblioteca-de-design] a pessoa não foi recortada da prévia; a foto entra sem profundidade:", e instanceof Error ? e.message : e);
      return null;
    });
    if (recorte) recorteUsd = CUSTO_DO_RECORTE_USD;
  }
  const fundoInteiro = comFoto && fundoInteiroDoModelo(modelo);
  const jpeg = await comporNoModelo({
    modelo,
    textos: textosDaPrevia(modelo),
    cores: MARCA_DA_PREVIA.cores,
    largura: TAMANHO_DA_PREVIA.largura,
    altura: TAMANHO_DA_PREVIA.altura,
    foto: fundoInteiro ? null : comFoto,
    fundoGerado: fundoInteiro ? comFoto : null,
    recorte: fundoInteiro ? null : recorte,
    logo: null,
    marca: MARCA_DA_PREVIA.nome,
    pagina: null,
    letra: null,
    ajustes: null,
  });
  return { jpeg, recorte, recorteUsd };
}

export type PreviaGerada = { id: string; nome: string; modelo: string; custoUsd: number; previaUrl: string };

/**
 * Gera as prévias pendentes, SÓ com a confirmação explícita do admin (que
 * viu o custo estimado na tela). Uma por vez, até o teto, e cada uma gravada
 * assim que sai: se a chamada cair no meio, o que foi pago fica guardado.
 * Na imagem, o que vai para `previaUrl` é a composição no modelo; a foto crua
 * fica em `caminhoDaFotoBase(id)`.
 */
export async function gerarPreviasPendentes(o: { confirmar: boolean; teto?: number; tipo?: TipoDeDesign; adminEmail: string }): Promise<{ geradas: PreviaGerada[]; falhas: Array<{ id: string; erro: string }>; custoUsd: number }> {
  if (o.confirmar !== true) throw new Error("A geração das prévias custa e só roda com a confirmação do admin.");
  const teto = Math.max(1, Math.min(TETO_DE_PREVIAS_POR_CHAMADA, o.teto ?? TETO_DE_PREVIAS_POR_CHAMADA));
  const pendentes = await prisma.designDaBiblioteca.findMany({
    where: { previaUrl: null, publico: true, ...(o.tipo ? { tipo: o.tipo } : {}) },
    orderBy: [{ usos: "desc" }, { createdAt: "asc" }],
    take: teto,
    select: { id: true, tipo: true, nome: true, descricao: true, linguagem: true, pedidoOriginal: true, catalogoId: true },
  });
  const geradas: PreviaGerada[] = [];
  const falhas: Array<{ id: string; erro: string }> = [];
  let custoUsd = 0;
  for (const d of pendentes) {
    try {
      const img = await gerarImagem(promptDaPrevia(d), d.tipo === "video" ? "16:9" : "4:5", "standard", { operation: "biblioteca-previa" }, { tipo: "arte" });
      const foto = dataUrlToBuffer(img.dataUrl);
      let previa = foto;
      let custoDaPrevia = img.custoUsd;
      if (d.tipo === "imagem") {
        await guardarFotoBase(d.id, foto);
        const composta = await comporPreviaDoModelo({ modelo: modeloDaPrevia(d), foto });
        previa = composta.jpeg;
        custoDaPrevia += composta.recorteUsd;
      }
      const salvo = await put(`biblioteca-de-design/previas/${d.id}.jpg`, previa, { ...midiaProduzida(), contentType: "image/jpeg", addRandomSuffix: true });
      await prisma.designDaBiblioteca.update({ where: { id: d.id }, data: { previaUrl: salvo.url, previaCustoUsd: custoDaPrevia } });
      custoUsd += custoDaPrevia;
      geradas.push({ id: d.id, nome: d.nome, modelo: img.modelo, custoUsd: custoDaPrevia, previaUrl: salvo.url });
      console.log(`[biblioteca-de-design] prévia de "${d.nome}" por ${img.modelo}, US$ ${custoDaPrevia.toFixed(3)} (pedida por ${o.adminEmail})`);
    } catch (e) {
      falhas.push({ id: d.id, erro: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return { geradas, falhas, custoUsd: +custoUsd.toFixed(4) };
}
