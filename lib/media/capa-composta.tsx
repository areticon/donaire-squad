import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { ImageResponse } from "@vercel/og";
import { nomeDaCor } from "@/lib/media/direcao-de-arte";
import { estiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { papeisDaPaleta } from "@/lib/media/papeis-da-paleta";

/**
 * A CAPA COMPOSTA EM CÓDIGO (30/09/2026).
 *
 * No teste de 29/09 a capa saiu com o rosto do Bruno redesenhado: a composição
 * pedia ao modelo de imagem para "ajustar a expressão", e com essa licença ele
 * inventou um sorriso e feições que não eram dele. O próprio comentário de
 * comporCapa previa o risco e mandava voltar para composição em código.
 *
 * Agora cada camada tem um dono, e o rosto não é de nenhum modelo:
 *
 * - A PESSOA: o quadro real mais bonito como foto (escolhido no worker pelos
 *   pontos do rosto: olho aberto, boca fechada, de frente) e recortada do fundo
 *   pelo segmentador. Pixel da gravação, sem retoque.
 * - O FUNDO: o modelo de imagem, e só ele, num lugar sem ninguém.
 * - O TEXTO, a colagem, o marca-texto, a borda de adesivo e a sombra: código,
 *   nas cores e na fonte da marca, na linguagem que o cliente escolheu no
 *   catálogo (Vox vira colagem com marca-texto; Hormozi vira bloco de impacto).
 */

export type Formato = "9:16" | "16:9";

/** As três famílias de capa em que as 24 linguagens do catálogo se agrupam. */
export type FamiliaDaCapa = "colagem" | "impacto" | "sobrio";

const FAMILIA: Record<string, FamiliaDaCapa> = {
  vox: "colagem",
  "johnny-harris": "colagem",
  "crime-real": "colagem",
  "quadro-branco": "colagem",
  kurzgesagt: "colagem",
  "wes-anderson": "colagem",
  hormozi: "impacto",
  mrbeast: "impacto",
  consorcio: "impacto",
  "ali-abdaal": "impacto",
  ugc: "impacto",
  tipografia: "impacto",
  "tela-dividida": "impacto",
  "carrossel-animado": "impacto",
  vlog: "impacto",
  vhs: "impacto",
  bbc: "sobrio",
  natgeo: "sobrio",
  "60-minutes": "sobrio",
  ted: "sobrio",
  keynote: "sobrio",
  institucional: "sobrio",
  depoimento: "sobrio",
  podcast: "sobrio",
  minimalista: "sobrio",
};

export function familiaDaLinguagem(estiloId: string | null | undefined): FamiliaDaCapa {
  // O kit mora no catálogo desde 01/10 (a lousa entrou lá); o mapa acima fica
  // de reserva para id que não esteja no catálogo.
  return estiloDoCatalogo(estiloId)?.kit ?? FAMILIA[estiloId ?? ""] ?? "impacto";
}

export type CoresDaMarca = { acento: string; escuro: string; claro: string };

/**
 * "#F97316,#1e1f22,#dbdee1" vira as três cores, com padrão neutro no que
 * faltar. Os papéis seguem a hierarquia do cliente (05/10,
 * lib/media/papeis-da-paleta.ts): "#1f2f3a,#98092b,..." (marinho e vinho)
 * dá acento vinho e escuro marinho, e não o marinho como acento.
 */
export function coresDaMarca(colorPalette: string | null | undefined): CoresDaMarca {
  const p = papeisDaPaleta(colorPalette);
  return { acento: p?.destaque ?? "#F97316", escuro: p?.escuro ?? "#15171a", claro: p?.claro ?? "#f2efe8" };
}

/**
 * O fundo que o modelo de imagem desenha para cada família. Sempre SEM pessoa,
 * sem texto e sem logotipo: o que tiver gente ou letra ali compete com o
 * cliente e com a frase.
 */
export function promptDoFundo(familia: FamiliaDaCapa, cores: CoresDaMarca, cenario: string | undefined, formato: Formato): string {
  const vertical = formato === "9:16" ? "vertical 9:16" : "horizontal 16:9";
  if (familia === "colagem") {
    return `Editorial collage background, ${vertical}, in the style of an explainer video: textured off-white paper, torn paper edges, a few blurred newspaper clippings with NO legible text, simple geometric cut-outs and one bold shape in ${nomeDaCor(cores.acento)}, subtle halftone dots, flat lay, soft paper shadows. Muted neutrals plus the accent ${nomeDaCor(cores.acento)} and the dark tone ${nomeDaCor(cores.escuro)}. Absolutely no people, no faces, no hands, no readable letters, no logos. Leave the ${formato === "9:16" ? "lower half" : "right half"} calm and uncluttered.`;
  }
  if (familia === "sobrio") {
    return `Cinematic background photograph, ${vertical}: ${cenario || "a modern, tidy workspace"}, shallow depth of field, strongly blurred, soft window light, rich but restrained colors with a hint of ${nomeDaCor(cores.acento)}. No people, no faces, no text, no logos. Calm negative space on the ${formato === "9:16" ? "top third" : "left half"}.`;
  }
  return `Background photograph for a high-energy social video thumbnail, ${vertical}: ${cenario || "a modern studio with dramatic light"}, heavily blurred bokeh, dark and contrasty with a colored rim light in ${nomeDaCor(cores.acento)}. No people, no faces, no text, no logos.`;
}

type Fontes = { anton: Buffer; serif: Buffer; sans: Buffer };
let fontesEmCache: Fontes | null = null;
async function fontes(): Promise<Fontes> {
  if (fontesEmCache) return fontesEmCache;
  // As fontes moram no repositório (licença OFL, arquivos ao lado), as mesmas
  // do worker, para a capa e a legenda do vídeo falarem a mesma tipografia.
  const pasta = join(process.cwd(), "lib", "media", "fontes-da-capa");
  const [anton, serif, sans] = await Promise.all([
    readFile(join(pasta, "Anton-Regular.ttf")),
    readFile(join(pasta, "PT_Serif-Bold.ttf")),
    readFile(join(pasta, "LiberationSans-Bold.ttf")),
  ]);
  fontesEmCache = { anton, serif, sans };
  return fontesEmCache;
}

/**
 * A pessoa pronta para a colagem: aparada no contorno, com borda de adesivo
 * (branca, só na colagem) e sombra suave, as duas feitas do próprio alfa do
 * recorte. Satori não sabe desenhar contorno de imagem com transparência, então
 * isto sai pronto do sharp.
 */
export async function pessoaComAcabamento(recorte: Buffer, alturaAlvo: number, familia: FamiliaDaCapa) {
  // Apara pela caixa do ALFA, e não pelo `trim` do sharp: o pixel transparente
  // do recorte guarda a cor original do quadro, e o trim compara cor, então não
  // aparava nada e a borda de adesivo saía retangular.
  const { data, info } = await sharp(recorte).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = 0, y1 = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 24) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  // Zera a cor onde é transparente, para nenhuma sobra do fundo vazar na borda.
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] === 0) data[i] = data[i + 1] = data[i + 2] = 0;
  const aparado = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract({ left: x0, top: y0, width: Math.max(1, x1 - x0 + 1), height: Math.max(1, y1 - y0 + 1) })
    .png()
    .toBuffer();
  const redim = await sharp(aparado).resize({ height: alturaAlvo, fit: "inside" }).png().toBuffer();
  const meta = await sharp(redim).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const margem = Math.round(alturaAlvo * 0.04);
  const W = w + margem * 2;
  const H = h + margem * 2;
  // Estende a imagem INTEIRA com fundo transparente e só depois tira o alfa:
  // estender o canal sozinho preenchia a margem com 255, e a borda de adesivo
  // virava um retângulo branco em volta da pessoa.
  const estendida = await sharp(redim)
    .extend({ top: margem, bottom: margem, left: margem, right: margem, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  const alfa = await sharp(estendida).extractChannel("alpha").png().toBuffer();

  // Borda: o alfa engordado (desfoque e limiar) vira uma silhueta branca maior.
  const raioDaBorda = familia === "colagem" ? Math.max(6, Math.round(alturaAlvo * 0.012)) : 0;
  const camadas: sharp.OverlayOptions[] = [];
  const silhueta = async (sigma: number, limiar: number) =>
    sharp(alfa).blur(Math.max(0.3, sigma)).threshold(limiar).toBuffer();
  // A sombra: o alfa bem desfocado, preto, deslocado para baixo e para a direita.
  const sombraAlfa = await sharp(alfa).blur(Math.max(1, alturaAlvo * 0.012)).toBuffer();
  const sombra = await sharp({ create: { width: W, height: H, channels: 3, background: "#000000" } })
    .joinChannel(await sharp(sombraAlfa).linear(0.45, 0).toBuffer())
    .png()
    .toBuffer();
  camadas.push({ input: sombra, left: Math.round(margem * 0.25), top: Math.round(margem * 0.35) });
  if (raioDaBorda) {
    const bordaAlfa = await silhueta(raioDaBorda * 0.6, 12);
    const borda = await sharp({ create: { width: W, height: H, channels: 3, background: "#ffffff" } })
      .joinChannel(bordaAlfa)
      .png()
      .toBuffer();
    camadas.push({ input: borda, left: 0, top: 0 });
  }
  camadas.push({ input: redim, left: margem, top: margem });
  const pronto = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(camadas)
    .png()
    .toBuffer();
  return { png: pronto, largura: W, altura: H };
}

/** A palavra que ganha o destaque: a mais longa, que quase sempre carrega o sentido. */
export function palavraDeDestaque(frase: string): string {
  const palavras = frase.split(/\s+/).filter(Boolean);
  return palavras.reduce((a, b) => (b.replace(/[^\p{L}]/gu, "").length > a.replace(/[^\p{L}]/gu, "").length ? b : a), palavras[0] ?? "");
}

/** Quebra em linhas de no máximo `porLinha` caracteres, sem partir palavra. */
function linhas(frase: string, porLinha: number): string[] {
  const saida: string[] = [];
  let atual = "";
  for (const p of frase.split(/\s+/).filter(Boolean)) {
    if (!atual) atual = p;
    else if ((atual + " " + p).length <= porLinha) atual += " " + p;
    else {
      saida.push(atual);
      atual = p;
    }
  }
  if (atual) saida.push(atual);
  return saida;
}

const dataUrl = (b: Buffer, tipo = "image/png") => `data:${tipo};base64,${b.toString("base64")}`;

export type PedidoDeCapa = {
  /** A pessoa recortada (PNG com transparência), do worker. */
  recorte: Buffer | null;
  /** O quadro real inteiro: fundo de reserva quando não houver recorte. */
  quadro: Buffer | null;
  /** O fundo desenhado pelo modelo de imagem, sem ninguém. Null cai no fundo em código. */
  fundo: Buffer | null;
  frase: string;
  formato: Formato;
  familia: FamiliaDaCapa;
  cores: CoresDaMarca;
  /** O logo da marca, quando o projeto tem (canto discreto). */
  logo?: Buffer | null;
};

/**
 * Monta a capa e devolve JPEG. Sem chamada paga: tudo aqui é código.
 */
export async function montarCapa(p: PedidoDeCapa): Promise<Buffer> {
  const W = p.formato === "9:16" ? 1080 : 1280;
  const H = p.formato === "9:16" ? 1920 : 720;
  const f = await fontes();
  const { acento, escuro, claro } = p.cores;

  // ── Fundo ──
  let fundoPng: Buffer;
  if (p.fundo) {
    fundoPng = await sharp(p.fundo).resize(W, H, { fit: "cover" }).png().toBuffer();
  } else if (!p.recorte && p.quadro) {
    // Sem recorte: o próprio quadro vira o fundo, escurecido de leve. É a
    // capa "limpa", mais simples, e continua sem ninguém mexer no rosto.
    fundoPng = await sharp(p.quadro).resize(W, H, { fit: "cover", position: "attention" }).modulate({ brightness: 0.8 }).png().toBuffer();
  } else {
    const base = p.familia === "colagem" ? claro : escuro;
    fundoPng = await sharp({ create: { width: W, height: H, channels: 3, background: base } }).png().toBuffer();
  }
  if (p.familia === "impacto" && p.fundo) {
    fundoPng = await sharp(fundoPng).modulate({ brightness: 0.7 }).png().toBuffer();
  }

  // ── Pessoa ──
  const alturaDaPessoa = Math.round(p.formato === "9:16" ? H * 0.6 : H * 0.98);
  const pessoa = p.recorte ? await pessoaComAcabamento(p.recorte, alturaDaPessoa, p.familia) : null;
  const larguraMaxPessoa = p.formato === "9:16" ? W * 1.05 : W * 0.58;
  const escala = pessoa ? Math.min(1, larguraMaxPessoa / pessoa.largura) : 1;
  const pw = pessoa ? Math.round(pessoa.largura * escala) : 0;
  const ph = pessoa ? Math.round(pessoa.altura * escala) : 0;
  const px = p.formato === "9:16" ? Math.round((W - pw) / 2) : W - pw + Math.round(pw * 0.04);
  const py = H - ph + Math.round(ph * 0.03);

  // ── Texto ──
  const frase = p.frase.trim().replace(/[.!]+$/, "").toUpperCase();
  const destaque = palavraDeDestaque(frase);
  // Linhas EQUILIBRADAS: o limite sai do total dividido pelo número de linhas
  // que a frase pede, e não de um teto fixo, que deixava uma preposição sozinha
  // na última linha ("DE" solto na capa do completo, 30/09).
  const tetoPorLinha = p.formato === "9:16" ? 12 : p.familia === "sobrio" ? 18 : 14;
  const nLinhas = Math.max(1, Math.ceil(frase.length / tetoPorLinha));
  const ls = linhas(frase, Math.max(Math.ceil(frase.length / nLinhas) + 2, Math.max(...frase.split(" ").map((w) => w.length))));
  const maisLonga = Math.max(...ls.map((l) => l.length), 4);
  const larguraDoTexto = p.formato === "9:16" ? W * 0.86 : W * 0.5;
  // A Anton tem letra estreita (perto de 0,48 em de largura média em caixa
  // alta); a serifada é mais larga. O tamanho sai da linha mais longa.
  const larguraDaLetra = p.familia === "sobrio" ? 0.62 : 0.5;
  const tamanho = Math.round(Math.min(p.formato === "9:16" ? 170 : 118, larguraDoTexto / (maisLonga * larguraDaLetra)));
  const familiaDaFonte = p.familia === "sobrio" ? "Serif" : "Anton";
  const corDoTexto = p.familia === "colagem" ? escuro : "#ffffff";

  const palavra = (w: string, i: number) => {
    const ehDestaque = w === destaque;
    if (p.familia === "colagem" && ehDestaque) {
      // MARCA-TEXTO: a faixa na cor da marca por trás da palavra, torta como
      // traço de caneta, e a palavra continua escura por cima.
      return (
        <div key={i} style={{ display: "flex", position: "relative", marginRight: tamanho * 0.22 }}>
          <div style={{ position: "absolute", left: -tamanho * 0.08, right: -tamanho * 0.08, top: tamanho * 0.28, bottom: tamanho * 0.02, background: acento, opacity: 0.9, transform: "rotate(-1.5deg)", borderRadius: 4 }} />
          <span style={{ position: "relative" }}>{w}</span>
        </div>
      );
    }
    if (p.familia === "impacto" && ehDestaque) {
      return (
        <div key={i} style={{ display: "flex", background: acento, color: "#111111", padding: `0 ${tamanho * 0.12}px`, marginRight: tamanho * 0.2, transform: "rotate(-2deg)" }}>
          {w}
        </div>
      );
    }
    if (p.familia === "sobrio" && ehDestaque) {
      return (
        <span key={i} style={{ color: acento, marginRight: tamanho * 0.22 }}>
          {w}
        </span>
      );
    }
    return (
      <span key={i} style={{ marginRight: tamanho * 0.22 }}>
        {w}
      </span>
    );
  };

  const caixaDoTexto: React.CSSProperties =
    p.formato === "9:16"
      ? { position: "absolute", left: W * 0.07, right: W * 0.07, top: H * 0.07, display: "flex", flexDirection: "column", alignItems: "flex-start" }
      : { position: "absolute", left: W * 0.05, top: 0, bottom: 0, width: larguraDoTexto, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "flex-start" };

  const resposta = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", position: "relative", background: escuro }}>
        <img src={dataUrl(fundoPng)} width={W} height={H} style={{ position: "absolute", left: 0, top: 0 }} />
        {/* Escurecimento do lado do texto, só onde ele fica: a pessoa segue com a luz dela. */}
        {p.familia !== "colagem" && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: W,
              height: H,
              backgroundImage:
                p.formato === "9:16"
                  ? "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.25) 45%, rgba(0,0,0,0) 70%)"
                  : "linear-gradient(90deg, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.35) 50%, rgba(0,0,0,0) 72%)",
            }}
          />
        )}
        {/* Colagem: uma tira de papel rasgado na cor da marca atrás da pessoa. */}
        {p.familia === "colagem" && pessoa && (
          <div
            style={{
              position: "absolute",
              left: px + pw * 0.1,
              top: py + ph * 0.18,
              width: pw * 0.8,
              height: ph * 0.55,
              background: acento,
              transform: "rotate(4deg)",
              boxShadow: "0 12px 30px rgba(0,0,0,0.25)",
            }}
          />
        )}
        {pessoa && (
          <img
            src={dataUrl(pessoa.png)}
            width={pw}
            height={ph}
            style={{ position: "absolute", left: px, top: py, transform: p.familia === "colagem" ? "rotate(-2deg)" : "rotate(0deg)" }}
          />
        )}
        <div style={caixaDoTexto}>
          {p.familia === "colagem" && (
            <div style={{ display: "flex", width: tamanho * 1.2, height: tamanho * 0.12, background: escuro, marginBottom: tamanho * 0.3 }} />
          )}
          {p.familia === "sobrio" && (
            <div style={{ display: "flex", width: tamanho * 1.4, height: 6, background: acento, marginBottom: tamanho * 0.35 }} />
          )}
          {ls.map((l, li) => (
            <div
              key={li}
              style={{
                display: "flex",
                flexWrap: "wrap",
                fontFamily: familiaDaFonte,
                fontSize: tamanho,
                lineHeight: 1.08,
                color: corDoTexto,
                textShadow: p.familia === "colagem" ? "none" : "0 4px 18px rgba(0,0,0,0.55)",
                ...(p.familia === "colagem"
                  ? { background: "rgba(255,255,255,0.92)", padding: `${tamanho * 0.04}px ${tamanho * 0.18}px`, marginBottom: tamanho * 0.12, transform: `rotate(${li % 2 ? 1 : -1}deg)`, boxShadow: "0 6px 16px rgba(0,0,0,0.18)" }
                  : { marginBottom: tamanho * 0.04 }),
              }}
            >
              {l.split(" ").map((w, wi) => palavra(w, li * 10 + wi))}
            </div>
          ))}
        </div>
        {p.logo && (
          <img
            src={dataUrl(p.logo)}
            height={Math.round(H * 0.06)}
            style={{ position: "absolute", right: W * 0.04, top: H * 0.035 }}
          />
        )}
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Anton", data: f.anton, weight: 400, style: "normal" },
        { name: "Serif", data: f.serif, weight: 700, style: "normal" },
        { name: "Sans", data: f.sans, weight: 700, style: "normal" },
      ],
    }
  );
  const png = Buffer.from(await resposta.arrayBuffer());
  // JPEG porque o YouTube recusa capa acima de 2 MB, e PNG de 1080x1920 passa.
  return sharp(png).jpeg({ quality: 88, mozjpeg: true }).toBuffer();
}
