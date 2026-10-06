import { createHash } from "node:crypto";
import { list, put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { dataUrlToBuffer, gerarImagem } from "@/lib/media/nano-banana";
import { lerMidia, midiaProduzida } from "@/lib/media/storage";
import { GUARDA_DA_IMAGEM_ESTILIZADA, familiaPorPalavras, type FamiliaVisual } from "@/lib/media/editor-por-comando/linguagem";
import { modeloPorId, type ModeloDeArte, type TextosDaArte } from "@/lib/modelos-de-arte/catalogo";
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
 *
 * O QUE FICA GUARDADO PARA RECOMPOR DE GRAÇA (06/10, tarde), num caminho fixo
 * por id no Blob:
 *   - a foto crua (`caminhoDaFotoBase`), ou o fundo gerado da família Vox;
 *   - a pessoa recortada (`caminhoDoRecorte`), que custa US$ 0,003 no BiRefNet
 *     e antes se perdia a cada composição;
 *   - a composição em `caminhoDaComposta`, com a assinatura do que entrou nela
 *     (modelo, textos, cores, marca, foto, recorte, versão) no nome: recompor
 *     de novo com as mesmas entradas dá o mesmo caminho, e a recomposição pula.
 * O banco guarda só a composição em `previaUrl` (não há coluna de metadata).
 *
 * OS TEXTOS DA PRÉVIA são um jogo só, coerente com a frase de exemplo
 * (lib/modelos-de-arte/textos-de-exemplo.ts, setor "previa"): a primeira
 * recomposição trocava só o título e deixava o apoio e os itens de outro
 * assunto embaixo dele.
 *
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

/** O jogo de textos de exemplo da prévia (lib/modelos-de-arte/textos-de-exemplo.ts). */
export const SETOR_DA_PREVIA = "previa";

/** A marca de exemplo: paleta neutra (escuro, acento, claro) e a letra padrão de cada modelo. */
export const MARCA_DA_PREVIA = { nome: "Sua marca", cores: { acento: "#b3001b", escuro: "#111111", claro: "#f4f1ec" } } as const;

/** O formato da prévia: post 4:5, o mesmo do book. */
export const TAMANHO_DA_PREVIA = { largura: 1080, altura: 1350 } as const;

/** Sobe quando o desenho da prévia muda de um jeito que a assinatura não enxerga (força recompor tudo). */
export const VERSAO_DA_COMPOSICAO = 2;

/** BiRefNet v2 na fal (lib/materiais/servidor.ts): ~US$ 0,003 por recorte, gravado em ai_usage por lá. */
export const CUSTO_DO_RECORTE_USD = 0.003;

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

/**
 * Os textos da prévia: o jogo "previa" inteiro (título, apoio, itens, lados,
 * número, opções, chamada), escrito em volta da mesma frase de exemplo, sem
 * chamada ao Claude. Nada é trocado campo a campo: a coerência vem do jogo.
 */
export function textosDaPrevia(modelo: ModeloDeArte): TextosDaArte {
  return textosDeExemplo(modelo, SETOR_DA_PREVIA);
}

/** O caminho fixo da foto crua (ou do fundo gerado do Vox) de uma prévia no Blob. */
export function caminhoDaFotoBase(id: string): string {
  return `biblioteca-de-design/previas/fotos/${id}.jpg`;
}

/** O caminho fixo da pessoa recortada da foto de uma prévia (PNG com alfa). */
export function caminhoDoRecorte(id: string): string {
  return `biblioteca-de-design/previas/recortes/${id}.png`;
}

/** O caminho da composição: a assinatura das entradas no nome. */
export function caminhoDaComposta(id: string, assinatura: string): string {
  return `biblioteca-de-design/previas/compostas/${id}-${assinatura}.jpg`;
}

async function lerDoCaminhoFixo(caminho: string): Promise<Buffer | null> {
  const token = midiaProduzida().token;
  const r = await list({ prefix: caminho, limit: 5, token }).catch(() => null);
  const url = r?.blobs.find((b) => b.pathname === caminho)?.url;
  return url ? lerMidia(url).catch(() => null) : null;
}

/** A foto crua guardada de uma prévia, se existe no Blob. */
export async function fotoBaseDaPrevia(id: string): Promise<Buffer | null> {
  return lerDoCaminhoFixo(caminhoDaFotoBase(id));
}

/** A pessoa recortada guardada de uma prévia, se existe no Blob. */
export async function recorteDaPrevia(id: string): Promise<Buffer | null> {
  return lerDoCaminhoFixo(caminhoDoRecorte(id));
}

/** Guarda a foto crua no caminho fixo. Devolve a URL. */
export async function guardarFotoBase(id: string, foto: Buffer): Promise<string> {
  const salvo = await put(caminhoDaFotoBase(id), foto, { ...midiaProduzida(), contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
  return salvo.url;
}

/** Guarda a pessoa recortada no caminho fixo, para nunca pagar o recorte de novo. */
export async function guardarRecorte(id: string, recorte: Buffer): Promise<string> {
  const salvo = await put(caminhoDoRecorte(id), recorte, { ...midiaProduzida(), contentType: "image/png", addRandomSuffix: false, allowOverwrite: true });
  return salvo.url;
}

/** A pessoa recortada entra neste modelo? (foto "recorte", fora da família Vox, que usa a imagem inteira como fundo). */
export function modeloPedeRecorte(modelo: ModeloDeArte): boolean {
  return !soTexto(modelo) && modelo.foto === "recorte" && !fundoInteiroDoModelo(modelo);
}

const hash = (b: Buffer | string) => createHash("sha256").update(b).digest("hex");

/** A assinatura das entradas da composição: mesma entrada, mesmo caminho. */
export function assinaturaDaPrevia(o: { modelo: ModeloDeArte; textos: TextosDaArte; foto: Buffer | null; recorte: Buffer | null }): string {
  const entradas = JSON.stringify({
    v: VERSAO_DA_COMPOSICAO,
    modelo: o.modelo.id,
    textos: o.textos,
    marca: MARCA_DA_PREVIA,
    tamanho: TAMANHO_DA_PREVIA,
    foto: o.foto ? hash(o.foto) : null,
    recorte: o.recorte ? hash(o.recorte) : null,
  });
  return hash(entradas).slice(0, 16);
}

export type PreviaComposta = { jpeg: Buffer; recorte: Buffer | null; recorteUsd: number };

/**
 * A PRÉVIA COMPOSTA de um modelo do book: a foto gerada passando pela
 * composição em código do modelo, exatamente como a esteira compõe a peça
 * (lib/media/arte-com-frase.tsx, comporFraseNaArte com modelo):
 *   - família Vox (fundo inteiro): a imagem é o fundo gerado, a tipografia em cima;
 *   - modelo com foto "recorte": a pessoa recortada da foto na frente do título,
 *     sobre a foto. `recorte` pronto é usado; sem ele, só com `pagarRecorte`
 *     (padrão) e FAL_KEY o BiRefNet roda (~US$ 0,003, registrado em ai_usage);
 *     sem recorte, a foto entra sem profundidade;
 *   - demais modelos com foto: a foto na zona do modelo;
 *   - modelo só texto: o desenho inteiro em código, sem foto.
 */
export async function comporPreviaDoModelo(o: { modelo: ModeloDeArte; foto: Buffer | null; recorte?: Buffer | null; pagarRecorte?: boolean; operation?: string }): Promise<PreviaComposta> {
  const { modelo } = o;
  const comFoto = !soTexto(modelo) && o.foto ? o.foto : null;
  let recorte = o.recorte ?? null;
  let recorteUsd = 0;
  if (comFoto && modeloPedeRecorte(modelo) && !recorte && o.pagarRecorte !== false && process.env.FAL_KEY) {
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

export type EntradaDaPrevia = { id: string; tipo: string; nome: string; catalogoId: string | null; pedidoOriginal: string | null; linguagem: string | null; previaUrl: string | null };

export type ResultadoDaRecomposicao = {
  id: string;
  nome: string;
  modelo: string | null;
  /**
   * recomposta: composição nova (gravada só com `gravar`);
   * igual: a prévia atual já é desta composição, nada a fazer;
   * sem-foto: o modelo pede foto e não há foto guardada nem alternativa;
   * sem-recorte: o modelo pede a pessoa recortada, ela não está guardada e o recorte pago não foi liberado;
   * video: entrada de vídeo, fora da recomposição.
   */
  estado: "recomposta" | "igual" | "sem-foto" | "sem-recorte" | "video";
  caminho?: string;
  previaUrl?: string;
  jpeg?: Buffer;
  recorteUsd: number;
  fotoGuardada?: boolean;
  recorteGuardado?: boolean;
};

/**
 * RECOMPÕE A PRÉVIA DE UMA ENTRADA DE IMAGEM a partir do que já foi pago,
 * sem gerar foto nova. Idempotente: a mesma entrada dá o mesmo caminho, e a
 * prévia que já aponta para ele não é tocada.
 *   - `fotoAlternativa`: a foto a usar quando o Blob não tem a foto base (o
 *     fundo do Vox guardado em disco); com `gravar`, ela vira a foto base.
 *   - `pagarRecorte`: libera o BiRefNet (US$ 0,003) para modelo com pessoa
 *     recortada sem recorte guardado; sem isso, a entrada fica "sem-recorte"
 *     (a prévia atual fica como está, em vez de piorar sem profundidade).
 *   - `aceitarSemRecorte`: compõe mesmo sem a pessoa recortada (só para olhar).
 *   - `gravar`: sobe a composição e troca `previaUrl`; sem ele, nada é escrito.
 */
export async function recomporPrevia(
  d: EntradaDaPrevia,
  o: { gravar: boolean; pagarRecorte?: boolean; aceitarSemRecorte?: boolean; fotoAlternativa?: Buffer | null }
): Promise<ResultadoDaRecomposicao> {
  if (d.tipo !== "imagem") return { id: d.id, nome: d.nome, modelo: null, estado: "video", recorteUsd: 0 };
  const modelo = modeloDaPrevia(d);
  const base = { id: d.id, nome: d.nome, modelo: modelo.id, recorteUsd: 0 };
  const precisaDeFoto = !soTexto(modelo);
  let foto: Buffer | null = null;
  let fotoGuardada = false;
  if (precisaDeFoto) {
    foto = await fotoBaseDaPrevia(d.id);
    if (!foto && o.fotoAlternativa) {
      foto = o.fotoAlternativa;
      if (o.gravar) {
        await guardarFotoBase(d.id, foto);
        fotoGuardada = true;
      }
    }
    if (!foto) return { ...base, estado: "sem-foto" };
  }
  let recorte: Buffer | null = null;
  if (foto && modeloPedeRecorte(modelo)) {
    recorte = await recorteDaPrevia(d.id);
    if (!recorte && !o.pagarRecorte && !o.aceitarSemRecorte) return { ...base, estado: "sem-recorte", fotoGuardada };
  }
  // O recorte pago, quando liberado e ainda não guardado: roda antes, para a assinatura enxergar o resultado.
  let recorteUsd = 0;
  let recorteGuardado = false;
  if (foto && modeloPedeRecorte(modelo) && !recorte && o.pagarRecorte && process.env.FAL_KEY) {
    recorte = await recortarPessoaNoFal(foto, { operation: "biblioteca-previa-recorte" }).catch(() => null);
    if (recorte) {
      recorteUsd = CUSTO_DO_RECORTE_USD;
      if (o.gravar) {
        await guardarRecorte(d.id, recorte);
        recorteGuardado = true;
      }
    }
  }
  const textos = textosDaPrevia(modelo);
  const caminho = caminhoDaComposta(d.id, assinaturaDaPrevia({ modelo, textos, foto: precisaDeFoto ? foto : null, recorte }));
  if (d.previaUrl && new URL(d.previaUrl, "https://x").pathname.replace(/^\//, "") === caminho) {
    return { ...base, estado: "igual", caminho, previaUrl: d.previaUrl, recorteUsd, fotoGuardada, recorteGuardado };
  }
  const { jpeg } = await comporPreviaDoModelo({ modelo, foto: precisaDeFoto ? foto : null, recorte, pagarRecorte: false });
  if (!o.gravar) return { ...base, estado: "recomposta", caminho, jpeg, recorteUsd, fotoGuardada, recorteGuardado };
  const salvo = await put(caminho, jpeg, { ...midiaProduzida(), contentType: "image/jpeg", addRandomSuffix: false, allowOverwrite: true });
  await prisma.designDaBiblioteca.update({
    where: { id: d.id },
    data: { previaUrl: salvo.url, ...(recorteUsd ? { previaCustoUsd: { increment: recorteUsd } } : {}) },
  });
  return { ...base, estado: "recomposta", caminho, previaUrl: salvo.url, jpeg, recorteUsd, fotoGuardada, recorteGuardado };
}

export type PreviaGerada = { id: string; nome: string; modelo: string; custoUsd: number; previaUrl: string };

/**
 * Gera as prévias pendentes, SÓ com a confirmação explícita do admin (que
 * viu o custo estimado na tela). Uma por vez, até o teto, e cada uma gravada
 * assim que sai: se a chamada cair no meio, o que foi pago fica guardado.
 * Na imagem, o que vai para `previaUrl` é a composição no modelo; a foto crua
 * fica em `caminhoDaFotoBase(id)` e a pessoa recortada em `caminhoDoRecorte(id)`.
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
      let caminho = `biblioteca-de-design/previas/${d.id}.jpg`;
      let fixo = false;
      let custoDaPrevia = img.custoUsd;
      if (d.tipo === "imagem") {
        await guardarFotoBase(d.id, foto);
        const modelo = modeloDaPrevia(d);
        const composta = await comporPreviaDoModelo({ modelo, foto });
        if (composta.recorte && composta.recorteUsd) await guardarRecorte(d.id, composta.recorte).catch(() => {});
        previa = composta.jpeg;
        custoDaPrevia += composta.recorteUsd;
        caminho = caminhoDaComposta(d.id, assinaturaDaPrevia({ modelo, textos: textosDaPrevia(modelo), foto: soTexto(modelo) ? null : foto, recorte: composta.recorte }));
        fixo = true;
      }
      const salvo = await put(caminho, previa, { ...midiaProduzida(), contentType: "image/jpeg", addRandomSuffix: !fixo, ...(fixo ? { allowOverwrite: true } : {}) });
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
