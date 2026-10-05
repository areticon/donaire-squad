import { contraste, papeisDaPaleta } from "@/lib/media/papeis-da-paleta";

/**
 * OS ACENTOS DA MARCA NO VOX (05/10/2026), pela HIERARQUIA da paleta
 * (lib/media/papeis-da-paleta.ts), e não pela cor "que combina mais" com o
 * papel: o marca-texto e a faixa do título são o DESTAQUE principal (com
 * letra clara quando ele é escuro), o texto e os títulos vão na outra cor
 * principal quando ela é escura, e o carimbo também. As cores de apoio
 * (dourado, creme, verde) não entram. Cada uso confere o contraste; o que não
 * passa volta ao do Vox.
 *
 * Ex.: Fé & Gestão (#1f2f3a,#98092b,#df931b,#e0daa3,#9fb982) dá marca-texto
 * vinho #98092b com letra creme, títulos e carimbo marinho #1f2f3a e fio vinho.
 * Com a paleta de 05/10 (#B3001B,#111111): faixa e marca-texto no vermelho,
 * letra creme por cima, títulos e carimbo no preto.
 *
 * Módulo PURO: a prévia do estilo (componente de cliente) e o editor por
 * comando (servidor) fazem a MESMA conta, para a prévia mostrar o que o vídeo
 * vai usar. Morava em lib/media/editor-por-comando/index.ts, que importa o
 * banco e não pode ir para o navegador.
 */

/** O papel envelhecido das peças Vox (a média de worker/fontes/vox/papel.jpg), para medir contraste. */
export const PAPEL_DO_VOX = "#e6d8b8";
export const TINTA_DO_VOX = "#16130e";
export const CREME_DO_VOX = "#fff8ec";

export type AcentosDoVox = {
  /** A faixa do marca-texto (e a tarja dos olhos). */
  realce?: string;
  /** A letra por cima do realce: a que dá contraste de leitura (4,5:1 ou mais). */
  tintaNoRealce?: string;
  /** Títulos e texto escuro sobre o papel. */
  tinta?: string;
  /** A tinta do carimbo. */
  carimbo?: string;
  /** O fio entre recortes e o marco da linha do tempo. */
  fio?: string;
};

export function acentosDoVox(paleta: string[]): AcentosDoVox {
  const p = papeisDaPaleta(paleta);
  if (!p) return {};
  const realce = p.destaque;
  // A letra no realce: a mais legível entre o creme e a tinta do Vox (ou o escuro da marca).
  const opcoes = [CREME_DO_VOX, p.escuro ?? TINTA_DO_VOX, TINTA_DO_VOX];
  const tintaNoRealce = opcoes.sort((a, b) => contraste(b, realce) - contraste(a, realce))[0];
  const saida: AcentosDoVox = { realce, tintaNoRealce };
  // O escuro principal (a segunda cor, ou a primeira quando ela é tinta) escreve os títulos e o carimbo.
  if (p.escuro && contraste(p.escuro, PAPEL_DO_VOX) >= 7) saida.tinta = p.escuro;
  const carimbo = [p.segunda, realce].find((c) => c && contraste(c, PAPEL_DO_VOX) >= 4.5);
  if (carimbo) saida.carimbo = carimbo;
  if (contraste(realce, PAPEL_DO_VOX) >= 3) saida.fio = realce;
  return saida;
}

/**
 * Os acentos COMPLETOS para desenhar (a prévia e as peças): o que a hierarquia
 * não fixou cai no padrão do Vox, e a tinta do realce nunca fica sem valor.
 */
export function acentosParaDesenhar(paleta: string[]): Required<AcentosDoVox> {
  const a = acentosDoVox(paleta);
  const realce = a.realce ?? "#f2c230";
  return {
    realce,
    tintaNoRealce: a.tintaNoRealce ?? (contraste(CREME_DO_VOX, realce) >= contraste(TINTA_DO_VOX, realce) ? CREME_DO_VOX : TINTA_DO_VOX),
    tinta: a.tinta ?? TINTA_DO_VOX,
    carimbo: a.carimbo ?? realce,
    fio: a.fio ?? TINTA_DO_VOX,
  };
}
