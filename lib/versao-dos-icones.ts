/**
 * VERSÃO DOS ÍCONES NO ENDEREÇO (01/10/2026), para furar o cache do navegador.
 *
 * Depois da troca para o logo B, a aba continuava mostrando o logo antigo: o
 * navegador guarda o favicon por muito tempo e só baixa de novo quando o
 * ENDEREÇO muda. O nome do arquivo é o mesmo de antes, então o parâmetro ?v=
 * é o que diz "isto é outro arquivo". Trocou o logo, troque este valor.
 *
 * Usado por app/layout.tsx (ícones, imagem de compartilhamento). O manifesto
 * é estático (public/manifest.webmanifest) e repete este valor à mão no ?v=
 * de cada ícone: trocou aqui, troque lá. Vive fora do layout porque o Next só
 * aceita exportações conhecidas (metadata, viewport...) num arquivo de layout.
 */
// "marca-0110b": a volta ao logo de 25/08 (01/10, depois do logo B). Valor
// novo para o navegador que guardou o favicon do logo B baixar o de agora.
export const VERSAO_DOS_ICONES = "marca-0110b";

/** O endereço do arquivo público com a versão do logo. */
export function comVersao(url: string): string {
  return `${url}?v=${VERSAO_DOS_ICONES}`;
}
