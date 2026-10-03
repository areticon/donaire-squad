import sharp from "sharp";
import { MARGEM_SEGURA, type FormatoDaRede } from "@/lib/media/formatos-das-redes";

/**
 * O RECORTE PARA O TAMANHO EXATO DE CADA REDE, e a conferência de que a arte
 * chegou inteira.
 *
 * Os dois moram juntos porque são a mesma passada de pixel: quem já abriu a
 * imagem para redimensionar é quem tem o buffer cru na mão para medir a borda.
 *
 * O caso que deu origem a isto é de 18/09: uma arte com o número "61%"
 * desenhado colado no topo, cortado pela borda, gerada pela Diana e APROVADA
 * pela Vera. Duas coisas faltavam, e as duas estão aqui: a arte não tinha o
 * formato de rede nenhuma, e ninguém mediu a margem antes de aprovar.
 */

/**
 * Deixa a imagem no tamanho exato que a rede publica.
 *
 * `cover` com recorte no centro, e não `contain`: barra preta nas laterais é
 * pior que recorte, porque a rede mostra a barra como se fosse parte da arte.
 * O recorte só é seguro porque a geração já pede a proporção certa ao modelo,
 * então o que se tira aqui é sobra de arredondamento (no pior caso, 16:9 para
 * 1,91:1, são 3,5% de cima e 3,5% de baixo), e não meia imagem.
 *
 * Sai sempre JPEG: a imagem vive como data URI dentro da coluna do post, e o
 * PNG de 2K que o modelo devolve pesa três a quatro vezes mais pelo mesmo
 * resultado visual depois de reduzido.
 */
export async function ajustarParaFormato(
  imagem: Buffer | string,
  formato: FormatoDaRede
): Promise<{ buffer: Buffer; dataUri: string; origem: { largura: number; altura: number } }> {
  const entrada = typeof imagem === "string" ? bufferDeDataUri(imagem) : imagem;
  const meta = await sharp(entrada).metadata();
  const buffer = await sharp(entrada)
    .resize(formato.largura, formato.altura, { fit: "cover", position: "centre" })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
  return {
    buffer,
    dataUri: `data:image/jpeg;base64,${buffer.toString("base64")}`,
    origem: { largura: meta.width ?? 0, altura: meta.height ?? 0 },
  };
}

export function bufferDeDataUri(uri: string): Buffer {
  const virgula = uri.indexOf(",");
  if (!uri.startsWith("data:") || virgula < 0) throw new Error("não é data URI de imagem");
  return Buffer.from(uri.slice(virgula + 1), "base64");
}

export type Lado = "topo" | "baixo" | "esquerda" | "direita";

export interface MedidaDeLado {
  /** Quantos elementos desenhados a borda corta neste lado. */
  elementos: number;
  /** O degrau mais forte encontrado numa ilha de tinta que não encosta no canto. */
  degrau: number;
  /** Quanto do lado esses elementos ocupam, em fração. */
  ocupacao: number;
  cortado: boolean;
}

export interface MedidaDeMargem {
  largura: number;
  altura: number;
  lados: Record<Lado, MedidaDeLado>;
  /** Algum lado tem elemento cortado. */
  cortado: boolean;
  /** Frase pronta para o log e para o parecer da Vera. */
  resumo: string;
}

/**
 * OS LIMIARES, E DE ONDE ELES VIERAM.
 *
 * Medidos em 19/09 contra as artes reais do banco (scripts/tmp/
 * ilhas-da-borda-1909.mts), com a arte do "61%" como caso positivo e duas
 * artes inteiras do mesmo dia como controle.
 *
 * DUAS MEDIDAS FORAM DESCARTADAS ANTES DESTA, e o descarte é o que sustenta a
 * escolha:
 *
 *   • "quanta tinta há na borda" não serve: a foto do caderno tem 18,5% da
 *     linha do topo em tinta e está inteira; a arte cortada tem 12,9%. O
 *     controle reprovaria a boa e aprovaria a ruim;
 *   • "tinta que entra para dentro" também não: a mesa de madeira embaixo da
 *     foto entra tanto quanto uma letra. Essa versão reprovou o controle.
 *
 * O QUE SEPARA É O DEGRAU: a parede de contraste na ponta da ilha de tinta.
 * Letra e número cortados têm borda dura, porque foram DESENHADOS; fundo
 * fotográfico tem gradiente. Medido, em cinza de 0 a 255:
 *
 *   arte do "61%"   cinco ilhas no topo, degraus de 154 a 178
 *   foto do caderno maior degrau de ilha sem canto: 27
 *   arte de estúdio maior degrau: 2
 *
 * 120 fica no meio da maior folga que existe entre os dois grupos.
 */
const DEGRAU_DE_CORTE = 120;
/**
 * Ilha que ENCOSTA NO CANTO não conta.
 *
 * Nas três artes medidas, toda ilha que chega ao canto é região de fundo
 * (parede, mesa, janela) e nenhuma é elemento cortado. É uma limitação
 * assumida, e não um descuido: um assunto cortado exatamente no canto passa
 * por esta medida. Ela existe para pegar o caso comum e frequente, que é texto
 * desenhado colado numa borda, e não para provar que a arte está perfeita.
 */
const IGNORAR_CANTO = true;
/** Ilha menor que isto é ruído de compressão, não elemento. */
const ILHA_MINIMA = 0.008;
/** Distância do fundo: o pixel precisa estar longe disto para ser tinta. */
const DISTANCIA_DE_TINTA = 60;
/** Profundidade da faixa que o elemento precisa atravessar para contar como elemento. */
const FUNDURA = 0.02;

/**
 * Mede se algum elemento da arte foi cortado pela borda.
 *
 * Trabalha em cinza e numa versão reduzida: o que se procura é estrutura, e
 * estrutura sobrevive à redução enquanto o ruído de JPEG não. Reduzir também
 * põe o custo em milissegundos, que importa porque isto roda dentro do teto de
 * 70 segundos da Diana.
 */
export async function medirMargem(imagem: Buffer | string): Promise<MedidaDeMargem> {
  const entrada = typeof imagem === "string" ? bufferDeDataUri(imagem) : imagem;
  const base = sharp(entrada).greyscale().resize(800, 800, { fit: "inside", withoutEnlargement: true });
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const px = (x: number, y: number) => data[y * w + x];

  const medirLado = (lado: Lado): MedidaDeLado => {
    const comprimento = lado === "topo" || lado === "baixo" ? w : h;
    const fundura = Math.max(2, Math.round((lado === "topo" || lado === "baixo" ? h : w) * FUNDURA));

    // A linha da borda, e as linhas logo atrás dela.
    const naBorda = (i: number, d: number) => {
      if (lado === "topo") return px(i, d);
      if (lado === "baixo") return px(i, h - 1 - d);
      if (lado === "esquerda") return px(d, i);
      return px(w - 1 - d, i);
    };

    const linha: number[] = [];
    for (let i = 0; i < comprimento; i++) linha.push(naBorda(i, 0));
    const fundo = [...linha].sort((a, b) => a - b)[Math.floor(linha.length / 2)];

    // TINTA QUE ENTRA: o pixel da borda está longe do fundo E continua longe,
    // do mesmo lado, por toda a faixa. Um reflexo de compressão não faz isso.
    const entra: boolean[] = linha.map((v, i) => {
      const delta = v - fundo;
      if (Math.abs(delta) <= DISTANCIA_DE_TINTA) return false;
      for (let d = 1; d <= fundura; d++) {
        const dentro = naBorda(i, d) - fundo;
        if (Math.sign(dentro) !== Math.sign(delta) || Math.abs(dentro) <= DISTANCIA_DE_TINTA * 0.6) return false;
      }
      return true;
    });

    // Cada ilha de tinta é um candidato a elemento cortado. Vira elemento se
    // tiver parede de contraste na ponta e não for região de fundo indo até o
    // canto.
    let elementos = 0;
    let degrau = 0;
    let ocupados = 0;
    let i = 0;
    while (i < comprimento) {
      if (!entra[i]) { i++; continue; }
      const ini = i;
      while (i < comprimento && entra[i]) i++;
      const fim = i - 1;
      const largura = fim - ini + 1;
      if (largura / comprimento < ILHA_MINIMA) continue;
      if (IGNORAR_CANTO && (ini === 0 || fim === comprimento - 1)) continue;
      const parede = Math.max(
        ini > 0 ? Math.abs(linha[ini] - linha[ini - 1]) : 0,
        fim < comprimento - 1 ? Math.abs(linha[fim] - linha[fim + 1]) : 0
      );
      if (parede < DEGRAU_DE_CORTE) continue;
      elementos++;
      ocupados += largura;
      if (parede > degrau) degrau = parede;
    }

    return {
      elementos,
      degrau,
      ocupacao: Number((ocupados / comprimento).toFixed(4)),
      cortado: elementos > 0,
    };
  };

  const lados: Record<Lado, MedidaDeLado> = {
    topo: medirLado("topo"),
    baixo: medirLado("baixo"),
    esquerda: medirLado("esquerda"),
    direita: medirLado("direita"),
  };

  const ruins = (Object.entries(lados) as Array<[Lado, MedidaDeLado]>).filter(([, m]) => m.cortado);
  const cortado = ruins.length > 0;
  const pct = Math.round(MARGEM_SEGURA * 100);

  return {
    largura: w,
    altura: h,
    lados,
    cortado,
    resumo: cortado
      ? `MARGEM REPROVADA: a borda corta ${ruins.reduce((s, [, m]) => s + m.elementos, 0)} elemento(s) desenhado(s) ${
          ruins.length > 1 ? "nos lados" : "no lado"
        } ${ruins.map(([l, m]) => `${l} (${m.elementos}, degrau ${m.degrau})`).join(", ")}. A arte precisa de ${pct}% livres em cada borda.`
      : `Margem conferida: nenhum elemento desenhado encosta na borda (folga pedida: ${pct}%).`,
  };
}
