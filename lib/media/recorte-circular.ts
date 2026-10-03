/**
 * A matematica do recorte circular da foto de perfil.
 *
 * Vive fora do componente de proposito: e a parte que erra em SILENCIO. Um
 * recorte deslocado nao quebra a tela, nao gera erro e nao aparece em teste de
 * tipo. Ele so aparece como um rosto cortado na borda do circulo, e quem
 * descobre e o dono da foto.
 *
 * O modelo mental: a imagem e desenhada COBRINDO a area (como `object-fit:
 * cover`), multiplicada pelo zoom, e deslocada pelo arrasto da pessoa. O
 * deslocamento e limitado para nunca sobrar buraco dentro do circulo.
 */

export type Enquadramento = {
  /** Multiplicador do zoom, 1 = a imagem apenas cobrindo a area. */
  zoom: number;
  /** Deslocamento em pixels da AREA, a partir do centro. */
  x: number;
  y: number;
};

export type Recorte = {
  /** Coordenadas NA IMAGEM ORIGINAL, prontas para drawImage. */
  sx: number;
  sy: number;
  sLargura: number;
  sAltura: number;
};

/**
 * A escala que faz a imagem cobrir a area, antes do zoom.
 *
 * E o maior dos dois fatores, e nao o menor: com o menor a imagem CABERIA na
 * area e sobraria fundo nas laterais, que e o oposto do que um avatar precisa.
 */
export function escalaDeCobertura(
  larguraDaImagem: number,
  alturaDaImagem: number,
  ladoDaArea: number
): number {
  if (larguraDaImagem <= 0 || alturaDaImagem <= 0) return 1;
  return Math.max(ladoDaArea / larguraDaImagem, ladoDaArea / alturaDaImagem);
}

/**
 * Quanto a pessoa pode arrastar, em cada eixo, sem abrir buraco.
 *
 * Com zoom 1 numa imagem quadrada o limite e zero: nao ha o que arrastar,
 * porque a imagem cobre a area exatamente. Numa imagem retangular sobra folga
 * no lado maior, e so nele.
 */
export function limiteDoArrasto(
  larguraDaImagem: number,
  alturaDaImagem: number,
  ladoDaArea: number,
  zoom: number
): { x: number; y: number } {
  const escala = escalaDeCobertura(larguraDaImagem, alturaDaImagem, ladoDaArea) * zoom;
  const larguraNaTela = larguraDaImagem * escala;
  const alturaNaTela = alturaDaImagem * escala;
  return {
    x: Math.max(0, (larguraNaTela - ladoDaArea) / 2),
    y: Math.max(0, (alturaNaTela - ladoDaArea) / 2),
  };
}

/** Prende o enquadramento dentro do que e valido. Sempre chamar antes de usar. */
export function ajustarEnquadramento(
  enquadramento: Enquadramento,
  larguraDaImagem: number,
  alturaDaImagem: number,
  ladoDaArea: number,
  zoomMaximo = 4
): Enquadramento {
  const zoom = Math.min(Math.max(enquadramento.zoom, 1), zoomMaximo);
  const limite = limiteDoArrasto(larguraDaImagem, alturaDaImagem, ladoDaArea, zoom);
  return {
    zoom,
    x: Math.min(Math.max(enquadramento.x, -limite.x), limite.x),
    y: Math.min(Math.max(enquadramento.y, -limite.y), limite.y),
  };
}

/**
 * De volta para as coordenadas da IMAGEM ORIGINAL.
 *
 * O componente trabalha em pixels da area de preview, que e pequena. Na hora de
 * gerar o arquivo final, o recorte precisa estar na resolucao da foto, senao a
 * imagem sai do tamanho do preview e fica borrada num avatar grande.
 */
export function recorteNaImagem(
  enquadramento: Enquadramento,
  larguraDaImagem: number,
  alturaDaImagem: number,
  ladoDaArea: number
): Recorte {
  const seguro = ajustarEnquadramento(enquadramento, larguraDaImagem, alturaDaImagem, ladoDaArea);
  const escala = escalaDeCobertura(larguraDaImagem, alturaDaImagem, ladoDaArea) * seguro.zoom;

  // Lado da area, medido na imagem original.
  const ladoNaImagem = ladoDaArea / escala;

  // O centro da area, em coordenadas da imagem. O deslocamento e invertido:
  // arrastar a imagem para a direita mostra a parte ESQUERDA dela.
  const centroX = larguraDaImagem / 2 - seguro.x / escala;
  const centroY = alturaDaImagem / 2 - seguro.y / escala;

  return {
    sx: centroX - ladoNaImagem / 2,
    sy: centroY - ladoNaImagem / 2,
    sLargura: ladoNaImagem,
    sAltura: ladoNaImagem,
  };
}
