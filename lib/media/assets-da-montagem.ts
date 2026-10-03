import { createHash } from "node:crypto";
import sharp from "sharp";
import { head, put } from "@vercel/blob";
import { gerarImagem, comporSobreImagemComCusto, dataUrlToBuffer, type AspectRatio } from "@/lib/media/nano-banana";
import { ARTE_DA_LINGUAGEM, nomeDaCor } from "@/lib/media/direcao-de-arte";
import { askClaudeComImagem } from "@/lib/claude";
import { midiaProduzida } from "@/lib/media/storage";
import { CAMERA_NO_PROMPT, EFEITO_NO_PROMPT, concluirSePronto, pedirGeracao, custoDaGeracao, MODELO_PADRAO } from "@/lib/media/higgsfield";
import { adesivoDaMarca, caminhoDoAdesivo, temIcone } from "@/lib/media/icones-de-marca";
import type { CoresDaMarca, FamiliaDaCapa } from "@/lib/media/capa-composta";
import type { ContextoMidia } from "@/lib/media/usage";
import {
  ASSETS_EM_VIDEO,
  intervaloDaCena,
  type AssetDoPlano,
  type Formato,
  type PalavraNoCorte,
  type PlanoDeMontagem,
  type Retangulo,
} from "@/lib/media/plano-de-montagem";

/**
 * OS ASSETS DA MONTAGEM (30/09/2026): o que o diretor pediu para gerar.
 *
 * - colagem: imagem inteira pelo `gerarImagem` (desde 01/10, GPT Image 2.5
 *   baixa pela Higgsfield, US$ 0,025; o Nano Banana 2 a US$ 0,101 em 2K é o
 *   recuo. Ver lib/media/imagem-higgsfield.ts).
 * - elemento: um objeto solto, gerado sobre verde chapado e recortado aqui por
 *   cor (caminho (b) da regra 6 da Bíblia de estilo: nenhum dos modelos
 *   devolve transparência). Desde 01/10 pelo Recraft V4.1 (US$ 0,035), que
 *   recebe o verde como parâmetro. Borda branca de papel ajuda: ela separa o
 *   objeto do verde e o recorte não franja.
 * - icone: logo oficial de marca citada, renderizado em código (custo zero;
 *   lib/media/icones-de-marca.ts). Nunca gerado por IA.
 * - cena-em-movimento: cena de CINEMA (Kling 3.0 Pro, texto para vídeo) pela
 *   Higgsfield, com request_id gravado antes de tudo (lib/media/higgsfield.ts),
 *   nunca a espera do SDK.
 * - cena-do-narrador: o cenário real do narrador, SEM a pessoa, recriado em
 *   vídeo (Kling 3.0 Pro, imagem para vídeo) com o efeito escolhido. A pessoa
 *   sai do quadro antes (o Grok Imagine 2.0 edita o quadro desde 01/10, com o
 *   Nano Banana Pro de recuo), porque rosto do cliente
 *   passando por IA de vídeo é rosto que muda, e o único rosto na tela é o
 *   pixel da gravação.
 *
 * ## Reaproveitamento
 *
 * Cada asset é guardado no Blob público numa chave que é o HASH do prompt
 * final. O mesmo pedido (mesma descrição, mesma linguagem, mesmas cores) não é
 * pago duas vezes: nem entre cenas, nem numa segunda rodada do mesmo corte,
 * nem entre cortes do mesmo projeto. Além disso, cada projeto tem um CATÁLOGO
 * de recortes (descrição e URL): o diretor recebe a lista e, usando a mesma
 * descrição, o recorte sai de graça (gap 9 da auditoria de 30/09: a
 * referência tem 5 a 9 recortes por quadro, e isso só cabe no custo se eles
 * forem reaproveitados).
 *
 * ## A guarda, em UMA frase no fim de todo prompt (02/10, prova A/B)
 *
 * Até 02/10 cada pedido levava um muro de negativas (duas frases de 90
 * palavras proibindo letra, rótulo, número, pessoa, mão, silhueta, biquíni),
 * mais paleta "mandatory" e, no MrBeast, "extremely saturated, no dark
 * background, no moody lighting". A prova A/B de 02/10 (scripts/tmp/ab-0210,
 * 9 pares julgados por visão com critérios fixos) mostrou o efeito: o pedido
 * com o muro saiu como ilustração saturada de banco de IA (13 a 20 de 25),
 * e o MESMO assunto escrito como um diretor de arte escreve direto na
 * Higgsfield (descrição positiva, luz, lente, atmosfera, cor da marca como
 * sugestão) saiu como fotografia (23 a 24 de 25). A praia com biquíni de
 * 02/10 nasceu COM a proibição de pessoas no prompt: o muro não barra nada;
 * quem barra é a conferência por visão (lib/media/conferencia-da-imagem.ts)
 * e a checagem de texto legível (`textoLegivel`), que continuam.
 *
 * O que sobrou no prompt é o que é de lei ou de marca: sem palavra legível
 * (texto é código; letra falsa em português é o defeito mais visível), sem
 * logotipo, sem pessoa real identificável, roupa discreta. Em uma frase.
 */

/**
 * Sem gente: a cena é lugar e objeto; o único rosto na tela é o pixel da
 * gravação. A roupa vem como frase POSITIVA: na prova de 02/10 a "praia
 * cheia" pedida pelo diretor saiu de biquíni com "no people" (muro ou frase),
 * e saiu vestida quando o prompt descreveu a roupa.
 */
const GUARDA_SEM_PESSOAS =
  "Keep it clean for a brand video: a place without people (if a crowd is part of the scene, everyone is fully and modestly dressed in everyday clothes, seen from behind), no readable words or logos anywhere.";
/**
 * GENTE PEDIDA PELO CLIENTE (02/10): "um vídeo de Jesus falando com a
 * multidão, com roupas da época". Com o pedido explícito (asset `comPessoas`),
 * pessoas entram: anônimas ou bíblicas, roupa discreta, reverência.
 */
const GUARDA_COM_PESSOAS =
  "People are welcome here as the client asked: anonymous or biblical figures in modest period clothing, a sacred figure shown with reverence (wide shot, from behind or in soft profile), never a real public figure; no readable words or logos anywhere.";
/** A guarda da imagem; com gente pedida pelo cliente, a de respeito. */
export const proibidoDaImagem = (comPessoas?: boolean) => (comPessoas ? GUARDA_COM_PESSOAS : GUARDA_SEM_PESSOAS);


/** Fallback quando a linguagem não tem ficha em ARTE_DA_LINGUAGEM. */
// Direção, não ordem: luz, lente e material, escritos como um diretor de
// arte escreve. Sem "no paper, no collage": o que a família NÃO é não ajuda o
// modelo a desenhar o que ela é.
const DIRECAO_DA_FAMILIA: Record<FamiliaDaCapa, string> = {
  colagem:
    "Editorial cut-paper collage in the language of a premium explainer video, flat lay seen from straight above: torn paper shapes, cut-out objects with thick white paper borders casting soft drop shadows, halftone-printed paper textures, craft paper and cardboard, paper-strip arrows",
  impacto:
    "Bold, high-contrast photograph for a high-retention social video: one clear hero object, hard directional light, deep clean shadows, rich colour, crisp and modern, 50mm lens",
  sobrio:
    "Cinematic documentary photograph: natural light, 35mm lens, shallow depth of field, calm breathing composition, credible and restrained, natural muted colour",
};

/**
 * O olhar de IMAGEM de cada linguagem fora da colagem (30/09). A ficha de
 * ARTE_DA_LINGUAGEM é de CAPA: a do Hormozi pede "palavras enormes no centro",
 * a da BBC "tarja de título e um número"; mandada ao modelo de imagem da
 * montagem, ela pedia justamente o texto que a montagem proíbe (texto é
 * código). Aqui fica só o que é imagem: luz, cor, composição.
 */
const IMAGEM_DA_LINGUAGEM: Record<string, string> = {
  hormozi: "one hero object, hard contrasty light on a plain dark background, bold and direct",
  mrbeast: "vivid clean bright colours, one clear hero object, strong contrast, playful energy",
  consorcio: "real credible business photography, the concrete good (house keys, car keys, a signed contract), clean bright daylight, trustworthy, never flashy",
  "ali-abdaal": "bright clean desk-setup aesthetic, soft pastel light, friendly and modern",
  ugc: "authentic smartphone-photo look, natural daylight, casual real-life setting",
  tipografia: "minimal graphic backdrop, one strong simple shape, flat color",
  "tela-dividida": "clean modern product-style scene, even light, simple background",
  "carrossel-animado": "clean flat graphic scene, soft shadows, friendly colors",
  vlog: "warm handheld real-life photo, natural light, candid",
  vhs: "retro 90s camcorder look, soft chroma bleed, warm faded colors",
  bbc: "credible news photography, natural color, moderate contrast, calm composition",
  natgeo: "wide breathing documentary photograph of a real place, rich warm earthy color, golden natural light, cinematic contrast",
  "60-minutes": "warm low-key natural light against a dark background, serious and human",
  ted: "clean bright stage-like light, simple composed scene, optimistic",
  keynote: "minimal premium product-launch look, dark gradient background, soft spotlight",
  institucional: "clean corporate photography, bright neutral light, orderly composition",
  depoimento: "warm intimate natural light, soft background, human and honest",
  podcast: "warm studio ambience, soft practical lights, shallow depth of field",
  minimalista: "light clean neutral background, lots of white space, precise and calm",
};

/**
 * A direção de arte: na colagem, a ficha da linguagem escolhida (é imagem e
 * capa ao mesmo tempo); nas outras famílias, a base da família mais o olhar
 * de imagem da linguagem.
 */
/**
 * A direção de imagem PRÓPRIA de um estilo com bíblia (01/10), que troca a
 * base da família em vez de somar a ela. O MrBeast herdava a base do impacto
 * ("dramatic light", fundo escuro) e saía sombrio; o keynote e a lousa
 * herdavam a "fotografia documental" do sóbrio, que é o oposto de um objeto
 * isolado em fundo puro e de uma lousa vazia.
 */
const DIRECAO_PROPRIA: Record<string, string> = {
  // "Extremely saturated" (até 02/10) virava ilustração plástica; o vivo do
  // MrBeast é luz cheia e cor limpa numa foto real, e isso se descreve.
  mrbeast:
    "Bright, vivid high-retention photograph of a real place or object: one big hero subject filling the frame, bright daylight or clean studio light, punchy but true-to-life colour, playful energy, crisp and instantly readable at phone size",
  keynote:
    "Minimal premium product-launch photograph: one single isolated object on a pure black or pure white seamless background, soft studio light with a subtle reflection, enormous negative space, calm and precise",
  // O consórcio (02/10): setor regulado, a bíblia pede prova real e luz de
  // dia; a modéstia fica como direção curta, nunca como lista.
  consorcio:
    "Credible real-life business photograph: one concrete object of the deal (new house keys, car keys, a signed contract with a pen, a house model on a desk), bright natural daylight, clean modern office or home setting, warm and trustworthy, modest and credible rather than flashy, instantly readable at phone size",
  lousa:
    "Minimal dark elegant photograph: one object in soft side light on a near-black matte background, lots of empty space, calm and premium",
};

function direcao(familia: FamiliaDaCapa, estiloId?: string | null): string {
  if (estiloId && DIRECAO_PROPRIA[estiloId]) return DIRECAO_PROPRIA[estiloId];
  if (familia === "colagem") return (estiloId && ARTE_DA_LINGUAGEM[estiloId]?.en) || DIRECAO_DA_FAMILIA.colagem;
  const olhar = estiloId ? IMAGEM_DA_LINGUAGEM[estiloId] : undefined;
  return olhar ? `${DIRECAO_DA_FAMILIA[familia]}; ${olhar}` : DIRECAO_DA_FAMILIA[familia];
}

/**
 * A cor da marca como SUGESTÃO (02/10). "Mandatory" e "graded toward the
 * accent" tingiam a cena inteira de laranja (a estante, a mesa e o café de
 * 02/10 saíram monocromáticos); a prova mostrou que a cor natural da cena com
 * o acento num detalhe é o que parece foto.
 */
function cores(marca: CoresDaMarca, familia: FamiliaDaCapa = "colagem"): string {
  if (familia !== "colagem") {
    return `Colour: natural to the scene, with the brand accent ${nomeDaCor(marca.acento)} welcome in one or two details or in the light, and ${nomeDaCor(marca.escuro)} in the shadows.`;
  }
  // "Tinta e recortes P&B" é vocabulário de colagem.
  return `Colour: the brand accent ${nomeDaCor(marca.acento)} on a few key shapes, ${nomeDaCor(marca.escuro)} in the ink, black-and-white photo cutouts and shadows, ${nomeDaCor(marca.claro)} neutrals.`;
}

/** O enquadramento, como um diretor pede: "vertical 9:16", não "Composition 9:16". */
function enquadramento(proporcao: AspectRatio): string {
  return proporcao === "9:16" ? "vertical 9:16 frame" : proporcao === "16:9" ? "wide 16:9 frame" : proporcao === "1:1" ? "square frame" : `${proporcao} frame`;
}

/**
 * A colagem inteira (02/10, forma nova): o SUJEITO vem primeiro e é o
 * substantivo dito, literal (gap 2: "fala mapa, aparece um mapa"); depois a
 * direção da família ou do estilo (luz, lente, material), a cor da marca como
 * sugestão, o enquadramento, e a guarda em uma frase. Na colagem a base de
 * papel claro vem logo depois do estilo, porque na ordem antiga a descrição
 * do diretor ("near-black background") ganhava da base.
 */
export function promptDaColagem(descricao: string, familia: FamiliaDaCapa, marca: CoresDaMarca, proporcao: AspectRatio, estiloId?: string | null, comPessoas?: boolean): string {
  const papel = familia === "colagem" ? " Background: warm kraft paper or off-white paper, with torn paper sheets and blurred newsprint strips." : "";
  // A ÂNCORA DE FOTO REAL (02/10): foi o que separou a prova B da A. A
  // descrição do diretor chega como lista de adjetivos ("vivid, saturated"),
  // e sem lente e material o modelo devolve ilustração plástica. Vale nas
  // famílias fotográficas; a colagem é papel e gravura por definição.
  const foto = familia === "colagem" ? "" : " Shot like a real photograph: 35mm or 50mm lens, real materials and textures, true-to-life colour, natural shadows.";
  return `${descricao}.${foto} ${direcao(familia, estiloId)}.${papel} ${cores(marca, familia)} ${enquadramento(proporcao)}, generous negative space, full bleed. ${proibidoDaImagem(comPessoas)}`;
}

/**
 * Um objeto só, para recortar. Na colagem é GRAVURA de enciclopédia com leve
 * aquarela (a tesoura, o olho, a câmera antiga da referência), não foto de
 * produto: o "microchip fotográfico" de 29/09 era o oposto da linguagem. O
 * verde chapado e a borda são especificação técnica do recorte, não negativa.
 */
export function promptDoElemento(descricao: string, familia: FamiliaDaCapa, marca: CoresDaMarca): string {
  const acabamento =
    familia === "colagem"
      ? `a detailed vintage engraving illustration of ${descricao}, fine black ink linework with a light watercolor tint, like a plate from an old encyclopedia, cut out as a paper sticker with a thick clean white paper border (about 4% of its width) all around`
      : familia === "impacto"
        ? // Ícone pop de retenção (Hormozi, MrBeast): cartum brilhante de contorno
          // escuro, sem a borda branca de adesivo de papel da colagem.
          `${descricao}, as a bold glossy vibrant cartoon icon with clean simple shapes and a thick dark outline, without a white border`
        : `${descricao}, as a clean realistic cutout photograph, without a border`;
  return `A single isolated object: ${acabamento}. Centered, fully visible with margin on every side, flat even lighting, nothing cast on the background. The background is a perfectly uniform flat pure chroma green (#00FF00) with nothing else on it; the object itself contains no green. Accent details may use ${nomeDaCor(marca.acento)}. ${GUARDA_SEM_PESSOAS}`;
}

export const PROMPT_DO_PAPEL =
  "Seamless texture of blank off-white recycled paper seen straight on, fine paper fibers, very subtle grain and soft uneven tone, evenly lit, flat and empty, edge to edge. " +
  GUARDA_SEM_PESSOAS;

/** O acabamento de cor da cena de cinema, por família; o papel fica por conta do Remotion. */
const ACABAMENTO_DA_CENA: Record<FamiliaDaCapa, string> = {
  colagem: "muted warm film grade with deep shadows and one warm accent",
  impacto: "high contrast punchy saturated grade, hard light, energetic",
  sobrio: "natural documentary grade, calm and credible, slow deliberate movement",
};

/** O acabamento da cena de cinema de um estilo com bíblia (01/10), no lugar do da família. */
const ACABAMENTO_PROPRIO: Record<string, string> = {
  mrbeast: "bright, vivid clean colour, bright even light, energetic fast action",
  keynote: "soft studio light on a pure black or white seamless background, minimal, slow elegant movement",
  lousa: "dark elegant low-key light, soft side light, minimal",
  consorcio: "clean bright natural daylight, real and trustworthy, steady confident movement",
};

/**
 * A CENA DE CINEMA (gap 1). Antes pedia "stop-motion cut-paper collage", que o
 * Kling faz mal e não é o que o dono viu nos tutoriais: lá, quando a pessoa
 * fala "mapa", aparece um mapa com cara de filme. Base única para toda
 * família (live-action, 35 mm, profundidade de campo), a família só muda a
 * cor, e câmera e efeito vêm do catálogo, escolhidos pelo diretor por cena.
 *
 * Desde 02/10 a cena vem PRIMEIRO (é o que o Kling pesa mais), o acabamento e
 * a câmera depois, a cor da marca como sugestão, e a guarda em uma frase. O
 * modelo e o preset são os que um usuário direto usa: Kling 3.0 Pro, 1080p,
 * sem parâmetro de qualidade abaixo do padrão deles (lib/media/higgsfield.ts).
 */
export function promptDaCenaEmMovimento(
  descricao: string,
  familia: FamiliaDaCapa,
  marca: CoresDaMarca,
  camera: string | null,
  segundos: number,
  efeito?: string | null,
  formato: Formato = "9:16",
  estiloId?: string | null,
  comPessoas?: boolean
): string {
  const acabamento = (estiloId && ACABAMENTO_PROPRIO[estiloId]) || `natural light, ${ACABAMENTO_DA_CENA[familia]}`;
  const partes = [
    `Cinematic ${formato === "9:16" ? "vertical" : "widescreen 16:9"} live-action b-roll, ${Math.round(segundos)} seconds, shot on 35mm film: ${descricao}.`,
    `${acabamento}, shallow depth of field, soft film grain, with the brand accent ${nomeDaCor(marca.acento)} welcome in a detail.`,
  ];
  partes.push(`Camera: ${camera && CAMERA_NO_PROMPT[camera] ? CAMERA_NO_PROMPT[camera] : "slow cinematic camera move"}.`);
  if (efeito && EFEITO_NO_PROMPT[efeito] && !EFEITO_NO_PROMPT[efeito].noFfmpeg) partes.push(`Effect: ${EFEITO_NO_PROMPT[efeito].prompt.replace(/the subject/g, "the main object")}.`);
  partes.push(proibidoDaImagem(comPessoas));
  return partes.join(" ");
}

/** O quadro do narrador sem o narrador: instrução de edição para o Nano Banana. */
export const PROMPT_DO_CENARIO_VAZIO =
  "Recreate the room of this photo as a vertical 9:16 photograph with NO person in it: remove the person completely (head, body, hands, hair, clothes, shadow) and rebuild what is behind them. Keep the same wall texture and color, the same furniture, shelves and objects, the same light and colors, and bring the objects that sit at the left and right edges closer so they still appear in the vertical frame. Book spines and any printed matter stay blurred with no readable letters. The result is an empty room with nobody in it. Do not add text, letters, logos, people or new objects.";

/** No 16:9 (completo) o quadro já é horizontal: só tira a pessoa, sem recompor. */
const PROMPT_DO_CENARIO_VAZIO_16X9 =
  "Edit this photo: remove the person completely (head, body, hands, hair, clothes, shadow) and rebuild what is behind them. Keep everything else identical: the same wall, furniture, shelves and objects, the same light and colors, the same horizontal framing. Book spines and any printed matter stay blurred with no readable letters. The result is an empty room with nobody in it. Do not add text, letters, logos, people or new objects.";

/** A recriação do cenário (gap 11): a sala real, vazia, com câmera e efeito. */
export function promptDoCenarioDoNarrador(descricao: string, camera: string | null, efeito: string | null): string {
  const partes = ["Cinematic shot of this exact empty room, photorealistic, keep the room, objects and light exactly as in the image."];
  if (descricao) partes.push(`What happens: ${descricao}.`);
  partes.push(`Camera: ${camera && CAMERA_NO_PROMPT[camera] ? CAMERA_NO_PROMPT[camera] : "slow dolly in"}.`);
  const e = efeito && EFEITO_NO_PROMPT[efeito] && !EFEITO_NO_PROMPT[efeito].noFfmpeg ? EFEITO_NO_PROMPT[efeito].prompt : EFEITO_NO_PROMPT.sumir.prompt;
  partes.push(`Effect: ${e.replace(/the subject/g, "the shelves and objects of the room")}.`);
  partes.push("The room stays empty the whole time, with nobody entering; no readable words or logos.");
  return partes.join(" ");
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 20);

/** A URL de um asset já guardado, ou null. `head` estoura quando não existe. */
async function jaGuardado(caminho: string): Promise<string | null> {
  try {
    const { token } = midiaProduzida();
    const meta = await head(caminho, { token });
    return meta.url;
  } catch {
    return null;
  }
}

async function guardar(caminho: string, dados: Buffer, contentType: string): Promise<string> {
  const { url } = await put(caminho, dados, { ...midiaProduzida(), contentType, addRandomSuffix: false, allowOverwrite: true });
  return url;
}

/**
 * Tira o verde chapado e devolve PNG com transparência, aparado no objeto.
 *
 * O "quão verde" de cada pixel é G menos o maior entre R e B: o verde puro dá
 * perto de 255, o branco da borda de papel dá zero. Entre 25 e 90 a
 * transparência é gradual (borda macia, sem serrilhado), e o despill puxa o G
 * das bordas para o nível dos outros canais, que é o que tira o halo verde.
 */
export async function recortarPorCor(imagem: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(imagem).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = Buffer.from(data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i], g = px[i + 1], b = px[i + 2];
    const verde = g - Math.max(r, b);
    const alfa = verde >= 90 ? 0 : verde <= 25 ? 255 : Math.round(255 * (1 - (verde - 25) / 65));
    px[i + 3] = Math.min(px[i + 3], alfa);
    if (verde > 0) px[i + 1] = Math.max(r, b);
  }
  fundoPelaBorda(px, info.width, info.height);
  const semFundo = await sharp(px, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  // Apara no objeto (a margem que o prompt pediu vira borda transparente inútil).
  const aparado = await sharp(semFundo).trim({ threshold: 5 }).png().toBuffer().catch(() => semFundo);
  return sharp(aparado).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/**
 * Segunda chance quando o modelo NÃO pintou o fundo de verde puro (prova de
 * 30/09: o disquete veio num cáqui chapado, e o recorte saiu como um quadrado
 * opaco). Se os cantos continuam opacos depois do verde, a cor do fundo é a
 * dos cantos, e some tudo o que é parecido com ela E está ligado à borda
 * (inundação a partir das bordas): o miolo do objeto, mesmo de cor parecida,
 * fica, porque a borda branca de papel o separa do fundo.
 */
function fundoPelaBorda(px: Buffer, w: number, h: number): void {
  const canto = (x0: number, y0: number) => {
    const soma = [0, 0, 0, 0];
    for (let y = y0; y < y0 + 8; y++) for (let x = x0; x < x0 + 8; x++) {
      const i = (y * w + x) * 4;
      soma[0] += px[i]; soma[1] += px[i + 1]; soma[2] += px[i + 2]; soma[3] += px[i + 3];
    }
    return soma.map((v) => v / 64);
  };
  if (w < 32 || h < 32) return;
  const cantos = [canto(0, 0), canto(w - 8, 0), canto(0, h - 8), canto(w - 8, h - 8)];
  const opacos = cantos.filter((c) => c[3] > 128);
  if (opacos.length < 3) return;
  const cor = [0, 1, 2].map((k) => opacos.reduce((s, c) => s + c[k], 0) / opacos.length);
  const dist = (i: number) => Math.hypot(px[i] - cor[0], px[i + 1] - cor[1], px[i + 2] - cor[2]);
  const PERTO = 28;
  const LONGE = 64;
  const visto = new Uint8Array(w * h);
  const fila: number[] = [];
  for (let x = 0; x < w; x++) fila.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) fila.push(y * w, y * w + w - 1);
  while (fila.length) {
    const p = fila.pop()!;
    if (visto[p]) continue;
    visto[p] = 1;
    const d = dist(p * 4);
    if (d >= LONGE) continue;
    px[p * 4 + 3] = Math.min(px[p * 4 + 3], d <= PERTO ? 0 : Math.round((255 * (d - PERTO)) / (LONGE - PERTO)));
    const x = p % w;
    if (x > 0) fila.push(p - 1);
    if (x < w - 1) fila.push(p + 1);
    if (p >= w) fila.push(p - w);
    if (p < w * (h - 1)) fila.push(p + w);
  }
}

/** A proporção de cada imagem, pelo lugar em que ela aparece no plano. */
function proporcaoDoAsset(plano: PlanoDeMontagem, id: string): AspectRatio {
  const usos = plano.cenas.filter((c) => c.asset === id).map((c) => c.layout);
  if (plano.formato === "9:16") return usos.includes("broll-cheio") ? "9:16" : "1:1";
  return usos.includes("broll-cheio") || usos.includes("narrador-canto") ? "16:9" : "1:1";
}

// ─────────────────────────────── catálogo de recortes do projeto ───────────────────────────────

/**
 * Sobe quando o prompt do elemento muda de linguagem: o catálogo antigo (foto
 * de produto, 29/09) não pode voltar à tela como se fosse gravura.
 */
const VERSAO_DO_CATALOGO = 2;

export type RecorteDoCatalogo = { descricao: string; url: string; criadoEm: string };

const caminhoDoCatalogo = (projectId: string) => `montagem/projeto/${projectId.replace(/[^a-zA-Z0-9_-]/g, "")}/recortes-v${VERSAO_DO_CATALOGO}.json`;

/** Os recortes já gerados neste projeto. Vazio quando não há (ou o Blob falha): catálogo é atalho, nunca requisito. */
export async function recortesDoProjeto(projectId: string | null | undefined): Promise<RecorteDoCatalogo[]> {
  if (!projectId) return [];
  const url = await jaGuardado(caminhoDoCatalogo(projectId));
  if (!url) return [];
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return [];
    const lista = (await r.json()) as RecorteDoCatalogo[];
    return Array.isArray(lista) ? lista.filter((x) => x && typeof x.descricao === "string" && typeof x.url === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Acrescenta os recortes novos ao catálogo. Dois cortes gravando ao mesmo
 * tempo podem perder a entrada um do outro (o último grava por cima); o custo
 * disso é gerar de novo um recorte uma vez, então não vale uma trava.
 */
async function acrescentarAoCatalogo(projectId: string, novos: RecorteDoCatalogo[]): Promise<void> {
  if (!novos.length) return;
  const atual = await recortesDoProjeto(projectId);
  const chave = (d: string) => d.trim().toLowerCase();
  const vistos = new Set(atual.map((x) => chave(x.descricao)));
  const juntos = [...atual, ...novos.filter((x) => !vistos.has(chave(x.descricao)))].slice(-200);
  await guardar(caminhoDoCatalogo(projectId), Buffer.from(JSON.stringify(juntos)), "application/json");
}

// ─────────────────────────────── geração ───────────────────────────────

export type AssetGerado = {
  id: string;
  tipo: AssetDoPlano["tipo"];
  url: string | null;
  /**
   * "reaproveitado" não custou nada nesta rodada. "reprovado" (02/10): a
   * conferência com visão contra o perfil do projeto recusou
   * (lib/media/conferencia-da-imagem.ts); a URL sai e a cena volta à pessoa.
   */
  origem: "gerado" | "reaproveitado" | "falhou" | "pendente" | "reprovado";
  custoEstimadoUsd: number;
  /** O veredito da conferência e as medidas da imagem (02/10). */
  conferencia?: { aprovada: boolean; motivo: string; largura?: number; altura?: number };
  /** Cena da Higgsfield: a chave do pedido guardado, para consultar depois. */
  chave?: string;
  erro?: string;
};

export type OpcoesDosAssets = {
  familia: FamiliaDaCapa;
  marca: CoresDaMarca;
  /** Id do VideoJob: referência da Higgsfield (idempotência por corte). */
  referencia: string;
  palavras: PalavraNoCorte[];
  duracao: number;
  /** Movimento de câmera do catálogo quando o diretor não escolheu um para a cena. */
  camera?: string | null;
  /** Os movimentos que o cliente escolheu: fallback por cena, girando. */
  cameras?: string[];
  /** Linguagem do catálogo (ex.: "vox"): a ficha de arte dela manda no prompt. */
  estiloId?: string | null;
  /** Projeto: dono do catálogo de recortes. Sem ele não há catálogo. */
  projectId?: string | null;
  /**
   * Um quadro REAL da gravação do corte (a capa serve), para o cenário do
   * narrador. Sem ele, a cena-do-narrador falha e o layout cai no narrador.
   */
  quadroDoNarradorUrl?: string | null;
  /** Onde está a pessoa no quadro (fração): vai como dica para a edição que a tira. */
  pessoa?: Retangulo | null;
  ctx: ContextoMidia;
  /** Prazo para esperar as cenas da Higgsfield (padrão 8 min). */
  prazoDasCenasMs?: number;
  /** Olhar cada imagem nova atrás de texto legível (padrão sim; ~US$ 0,01 por imagem). */
  conferirTexto?: boolean;
};

/**
 * Quanto tempo a montagem espera a Higgsfield nas imagens (01/10). O passo
 * "dirigindo" é dado como morto em 10 min (PASSO_MORTO_MS), e o diretor já
 * leva perto de 2: depois desta janela, toda imagem que falta vai direto ao
 * Google, que entrega em ~20 s. Antes de 01/10 o custo daqui era uma
 * constante (0,039 por imagem, 0,134 por edição); agora é o de quem
 * respondeu, que `gerarImagem` devolve.
 */
const JANELA_DA_HIGGSFIELD_MS = 5 * 60_000;
/**
 * Segundos pagos por cena de cinema: o broll-cheio dura 2 a 4 s e o canto que
 * vem depois repete a mesma mídia; mais que 4 s é pagar tela que não aparece.
 */
const SEGUNDOS_DA_CENA = { min: 3, max: 4 };

/** Quanto tempo de tela o asset tem no plano, somando as cenas que o usam. */
function segundosNaTela(plano: PlanoDeMontagem, id: string, o: OpcoesDosAssets): number {
  const total = plano.cenas
    .filter((c) => c.asset === id)
    .reduce((s, c) => {
      const t = intervaloDaCena(c, o.palavras, o.duracao);
      return s + (t.fim - t.inicio);
    }, 0);
  return Math.max(SEGUNDOS_DA_CENA.min, Math.min(SEGUNDOS_DA_CENA.max, Math.ceil(total || SEGUNDOS_DA_CENA.min)));
}

/**
 * O quadro vertical do cenário, sem a pessoa, pelo Nano Banana, guardado no
 * Blob pelo hash do quadro (a segunda rodada não paga).
 *
 * Vai o quadro INTEIRO e o modelo recompõe em 9:16. Na prova de 30/09 o
 * recorte 9:16 em volta da pessoa deixou só a parede lisa atrás dela (as
 * prateleiras ficam nas bordas do 16:9), e parede lisa recriada em vídeo não
 * é o "cenário recriado" da referência.
 */
export async function cenarioVazio(o: OpcoesDosAssets, formato: Formato = "9:16", higgsfieldAte?: number): Promise<{ url: string; custo: number }> {
  if (!o.quadroDoNarradorUrl) throw new Error("sem quadro real do corte para recriar o cenário");
  const r = await fetch(o.quadroDoNarradorUrl, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`quadro do corte respondeu HTTP ${r.status}`);
  const original = Buffer.from(await r.arrayBuffer());
  const instrucao = formato === "9:16" ? PROMPT_DO_CENARIO_VAZIO : PROMPT_DO_CENARIO_VAZIO_16X9;
  const caminho = `montagem/cenario/${hash(original.toString("base64") + instrucao)}.jpg`;
  const existe = await jaGuardado(caminho);
  if (existe) return { url: existe, custo: 0 };
  const quadro = await sharp(original).jpeg({ quality: 92 }).toBuffer();
  // A dica de onde a pessoa está ajuda o modelo a não deixar sobra (ombro,
  // cadeira com sombra) na borda do que ele apagou.
  const onde = o.pessoa
    ? ` The person occupies roughly from ${Math.round(o.pessoa.x * 100)}% to ${Math.round((o.pessoa.x + o.pessoa.w) * 100)}% of the width and from ${Math.round(o.pessoa.y * 100)}% of the height down.`
    : "";
  // A Higgsfield recebe o quadro pela URL (a mesma capa pública); o Nano
  // Banana, se for o recuo, recebe os bytes.
  const editado = await comporSobreImagemComCusto(instrucao + onde, quadro.toString("base64"), "image/jpeg", { ...o.ctx, operation: "montagem-cenario" }, formato, {
    imagemUrl: o.quadroDoNarradorUrl,
    higgsfieldAte,
  });
  if (!editado) throw new Error("nenhum modelo devolveu o cenário sem a pessoa");
  const pronto = await sharp(dataUrlToBuffer(editado.dataUrl)).jpeg({ quality: 90 }).toBuffer();
  return { url: await guardar(caminho, pronto, "image/jpeg"), custo: editado.custoUsd };
}

const SISTEMA_DO_TEXTO = `Você confere imagens geradas para um vídeo. A regra: a imagem não pode ter NENHUMA palavra, letra ou número LEGÍVEL, em nenhuma língua (rótulos, legendas, títulos, nomes de período como "Morning", números num relógio ou calendário).
Não conta como texto: rabisco ilegível, jornal ou documento desfocado sem palavra que se leia, formas que lembram letras mas não formam palavra, os numerais do mostrador de um relógio (algarismos ou romanos), que são desenho e não língua, e a letra MIÚDA de recortes de jornal ou documento usados como textura de fundo (mesmo que uma palavra solta se leia de perto). Conta sempre: rótulo, legenda, título, palavra em destaque ou texto grande o bastante para ser lido no vídeo.
Responda SÓ com JSON: {"texto": true|false, "palavras": "as palavras legíveis, separadas por barra, ou vazio"}`;

/**
 * Texto legível na imagem, pelo mesmo olho da conferência de arte
 * (askClaudeComImagem, esforço baixo, imagem reduzida a 768 px): devolve as
 * palavras achadas, ou null. Falha na checagem conta como "sem texto": ela é
 * rede de segurança, e não pode derrubar a montagem.
 */
export async function textoLegivel(imagem: Buffer, ctx: ContextoMidia): Promise<string | null> {
  try {
    const pequena = await sharp(imagem).flatten({ background: "#C9AD85" }).resize({ width: 768, height: 768, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    const resposta = await askClaudeComImagem(SISTEMA_DO_TEXTO, "Esta imagem tem palavra, letra ou número legível?", pequena.toString("base64"), "image/jpeg", {
      effort: "low",
      maxTokens: 1500,
      timeoutMs: 45_000,
      usage: { projectId: ctx.projectId, operation: "montagem-texto-na-imagem" },
    });
    const j = JSON.parse(resposta.slice(resposta.indexOf("{"), resposta.lastIndexOf("}") + 1)) as { texto?: boolean; palavras?: string };
    return j.texto ? (j.palavras || "texto").slice(0, 120) : null;
  } catch {
    return null;
  }
}

/** Gera (ou reaproveita) tudo que o plano pede. Falha num asset não derruba os outros. */
export async function gerarAssetsDaMontagem(plano: PlanoDeMontagem, o: OpcoesDosAssets): Promise<{ assets: AssetGerado[]; papelUrl: string | null }> {
  const emVideo = (t: AssetDoPlano["tipo"]) => ASSETS_EM_VIDEO.includes(t);
  const imagens = plano.assets.filter((a) => !emVideo(a.tipo) && a.tipo !== "icone");
  const icones = plano.assets.filter((a) => a.tipo === "icone");
  const cenas = plano.assets.filter((a) => emVideo(a.tipo));
  const higgsfieldAte = Date.now() + JANELA_DA_HIGGSFIELD_MS;

  // As cenas da Higgsfield saem PRIMEIRO: são as que demoram, e correm em
  // paralelo com as imagens. Câmera: a que o diretor escolheu para a cena;
  // sem isso, gira pelas que o cliente escolheu (nunca a primeira repetida em
  // todas, defeito de 29/09). O cenário do narrador tem desintegração
  // ("sumir") quando o diretor não pediu outro efeito: é o da referência.
  const cameras = o.cameras?.length ? o.cameras : o.camera ? [o.camera] : [];
  const pedidos = await Promise.all(
    cenas.map(async (a, k) => {
      const segundos = segundosNaTela(plano, a.id, o);
      const camera = a.camera ?? cameras[k % Math.max(1, cameras.length)] ?? null;
      try {
        if (a.tipo === "cena-do-narrador") {
          const cenario = await cenarioVazio(o, plano.formato, higgsfieldAte);
          const prompt = promptDoCenarioDoNarrador(a.descricao, camera, a.efeito ?? "sumir");
          const chave = `montagem-${a.id}-${hash(prompt + cenario.url)}`;
          await pedirGeracao({ prompt, segundos, imagemUrl: cenario.url, referencia: o.referencia, chave });
          return { a, chave, custo: custoDaGeracao(MODELO_PADRAO, segundos) + cenario.custo, erro: undefined as string | undefined };
        }
        const efeito = a.efeito ?? null;
        const prompt = promptDaCenaEmMovimento(a.descricao, o.familia, o.marca, camera, segundos, efeito, plano.formato, o.estiloId, a.comPessoas);
        const chave = `montagem-${a.id}-${hash(prompt)}`;
        await pedirGeracao({ prompt, segundos, proporcao: plano.formato, referencia: o.referencia, chave });
        return { a, chave, custo: custoDaGeracao(MODELO_PADRAO, segundos), erro: undefined as string | undefined };
      } catch (e) {
        return { a, chave: "", custo: 0, erro: e instanceof Error ? e.message : String(e) };
      }
    })
  );
  // A textura de papel só existe na colagem (30/09): no impacto e no sóbrio
  // o fundo é cor chapada, e papel por baixo era Vox chumbado.
  const papel = (async () => {
    if (o.familia !== "colagem") return null;
    const caminho = `montagem/papel/${hash(PROMPT_DO_PAPEL)}.jpg`;
    const existe = await jaGuardado(caminho);
    if (existe) return existe;
    try {
      const img = dataUrlToBuffer((await gerarImagem(PROMPT_DO_PAPEL, "9:16", "hd", { ...o.ctx, operation: "montagem-papel" }, { higgsfieldAte })).dataUrl);
      return guardar(caminho, await sharp(img).jpeg({ quality: 88 }).toBuffer(), "image/jpeg");
    } catch {
      return null;
    }
  })();

  // Ícones: código, sem IA, um arquivo por marca para todos os projetos.
  const iconesProntos: AssetGerado[] = await Promise.all(
    icones.map(async (a): Promise<AssetGerado> => {
      const marca = a.marca ?? "";
      if (!temIcone(marca)) return { id: a.id, tipo: a.tipo, url: null, origem: "falhou", custoEstimadoUsd: 0, erro: `marca sem ícone: ${marca}` };
      try {
        const caminho = caminhoDoAdesivo(marca);
        const existe = await jaGuardado(caminho);
        if (existe) return { id: a.id, tipo: a.tipo, url: existe, origem: "reaproveitado", custoEstimadoUsd: 0 };
        const url = await guardar(caminho, await adesivoDaMarca(marca), "image/png");
        return { id: a.id, tipo: a.tipo, url, origem: "gerado", custoEstimadoUsd: 0 };
      } catch (e) {
        return { id: a.id, tipo: a.tipo, url: null, origem: "falhou", custoEstimadoUsd: 0, erro: e instanceof Error ? e.message : String(e) };
      }
    })
  );

  // O catálogo do projeto: a mesma descrição sai de graça.
  // Só na colagem: o catálogo são gravuras com borda de papel, e um recorte
  // de Hormozi com a mesma descrição sairia gravura.
  const catalogo = o.familia === "colagem" ? await recortesDoProjeto(o.projectId) : [];
  const doCatalogo = new Map(catalogo.map((x) => [x.descricao.trim().toLowerCase(), x.url]));
  const novosNoCatalogo: RecorteDoCatalogo[] = [];

  // Imagens em lotes de 3: o Gemini devolve 429 com rajada maior.
  const geradas: AssetGerado[] = [];
  for (let i = 0; i < imagens.length; i += 3) {
    const lote = await Promise.all(
      imagens.slice(i, i + 3).map(async (a): Promise<AssetGerado> => {
        if (a.tipo === "elemento") {
          const pronto = doCatalogo.get(a.descricao.trim().toLowerCase());
          if (pronto) return { id: a.id, tipo: a.tipo, url: pronto, origem: "reaproveitado", custoEstimadoUsd: 0 };
        }
        const proporcao = proporcaoDoAsset(plano, a.id);
        const prompt = a.tipo === "elemento" ? promptDoElemento(a.descricao, o.familia, o.marca) : promptDaColagem(a.descricao, o.familia, o.marca, proporcao, o.estiloId, a.comPessoas);
        const caminho = `montagem/assets/${hash(prompt + proporcao)}.${a.tipo === "elemento" ? "png" : "jpg"}`;
        const existe = await jaGuardado(caminho);
        if (existe) {
          if (a.tipo === "elemento") novosNoCatalogo.push({ descricao: a.descricao, url: existe, criadoEm: new Date().toISOString() });
          return { id: a.id, tipo: a.tipo, url: existe, origem: "reaproveitado", custoEstimadoUsd: 0 };
        }
        try {
          // O custo é o de quem respondeu (Higgsfield ou o recuo no Google),
          // somado a cada tentativa.
          let custo = 0;
          const gerar = async (p: string) => {
            const r = await gerarImagem(p, a.tipo === "elemento" ? "1:1" : proporcao, "hd", { ...o.ctx, operation: `montagem-${a.tipo}` }, { higgsfieldAte });
            custo += r.custoUsd;
            return dataUrlToBuffer(r.dataUrl);
          };
          let bruta = await gerar(prompt);
          // Texto legível na imagem: UMA nova tentativa com a palavra achada
          // proibida por nome. Se a segunda também vier com texto, fica a de
          // menos palavras (a checagem é atalho, nunca bloqueio).
          if (o.conferirTexto !== false) {
            const achado = await textoLegivel(bruta, o.ctx);
            if (achado) {
              const segunda = await gerar(`${prompt} A previous attempt wrote the words "${achado}" in the image; this time draw NO words at all.`).catch(() => null);
              if (segunda) {
                const deNovo = await textoLegivel(segunda, o.ctx);
                if (!deNovo || deNovo.length < achado.length) bruta = segunda;
              }
            }
          }
          const pronta = a.tipo === "elemento" ? await recortarPorCor(bruta) : await sharp(bruta).jpeg({ quality: 88 }).toBuffer();
          const url = await guardar(caminho, pronta, a.tipo === "elemento" ? "image/png" : "image/jpeg");
          if (a.tipo === "elemento") novosNoCatalogo.push({ descricao: a.descricao, url, criadoEm: new Date().toISOString() });
          return { id: a.id, tipo: a.tipo, url, origem: "gerado", custoEstimadoUsd: custo };
        } catch (e) {
          return { id: a.id, tipo: a.tipo, url: null, origem: "falhou", custoEstimadoUsd: 0, erro: e instanceof Error ? e.message : String(e) };
        }
      })
    );
    geradas.push(...lote);
  }
  if (o.projectId && o.familia === "colagem") await acrescentarAoCatalogo(o.projectId, novosNoCatalogo).catch(() => undefined);

  // Espera as cenas: consulta de status é gratuita. Cena que não fica pronta
  // no prazo segue "pendente" (o request_id está gravado; a próxima rodada
  // recupera sem pagar de novo) e o validador troca o layout por outro.
  const prazo = Date.now() + (o.prazoDasCenasMs ?? 8 * 60_000);
  const cenasProntas: AssetGerado[] = [];
  for (const p of pedidos) {
    if (p.erro) {
      cenasProntas.push({ id: p.a.id, tipo: p.a.tipo, url: null, origem: "falhou", custoEstimadoUsd: 0, erro: p.erro });
      continue;
    }
    // Consulta uma vez sempre; com prazo, repete até ele. Na esteira o prazo
    // é zero: quem volta a olhar é o passo seguinte da fila, nunca uma espera
    // longa dentro da função.
    let pronto: Awaited<ReturnType<typeof concluirSePronto>> = null;
    do {
      pronto = await concluirSePronto(o.referencia, p.chave, { ...o.ctx, operation: "montagem-cena" }).catch(() => null);
      if (pronto?.blobUrl || ["failed", "nsfw", "canceled", "cancelled"].includes(pronto?.status ?? "")) break;
      if (Date.now() + 10_000 < prazo) await new Promise((r) => setTimeout(r, 10_000));
    } while (Date.now() < prazo);
    cenasProntas.push(
      pronto?.blobUrl
        ? { id: p.a.id, tipo: p.a.tipo, url: pronto.blobUrl, origem: "gerado", custoEstimadoUsd: p.custo, chave: p.chave }
        : { id: p.a.id, tipo: p.a.tipo, url: null, origem: pronto?.status === "failed" ? "falhou" : "pendente", custoEstimadoUsd: p.custo, erro: pronto?.status, chave: p.chave }
    );
  }

  return { assets: [...geradas, ...iconesProntos, ...cenasProntas], papelUrl: await papel };
}

/** O mapa que `resolverMontagem` pede: só assets com URL. */
export function urlsDosAssets(assets: AssetGerado[]): Record<string, { url: string; tipo: "imagem" | "video" }> {
  return Object.fromEntries(
    assets
      .filter((a) => a.url)
      .map((a) => [a.id, { url: a.url as string, tipo: ASSETS_EM_VIDEO.includes(a.tipo) ? ("video" as const) : ("imagem" as const) }])
  );
}
