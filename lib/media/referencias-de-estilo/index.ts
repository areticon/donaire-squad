import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";
import { LOUSA } from "@/lib/media/referencias-de-estilo/lousa";
import { HORMOZI } from "@/lib/media/referencias-de-estilo/hormozi";
import { DOCUMENTARIO } from "@/lib/media/referencias-de-estilo/documentario";
import { JOHNNY_HARRIS } from "@/lib/media/referencias-de-estilo/johnny-harris";
import { CRIME_REAL } from "@/lib/media/referencias-de-estilo/crime-real";

/**
 * AS REFERÊNCIAS DE ESTILO (03/10/2026): o repertório do agente editor, uma
 * por linguagem do catálogo (lib/media/catalogo-de-estilos.ts), pelo mesmo id.
 * Ver tipos.ts para o que cada uma traz. Módulo puro.
 */
export const REFERENCIAS_DE_ESTILO: Record<string, ReferenciaDeEstilo> = {
  lousa: LOUSA,
  hormozi: HORMOZI,
  documentario: DOCUMENTARIO,
  "johnny-harris": JOHNNY_HARRIS,
  "crime-real": CRIME_REAL,
};

export function referenciaDoEstilo(id: string | null | undefined): ReferenciaDeEstilo | undefined {
  return id ? REFERENCIAS_DE_ESTILO[id] : undefined;
}

/** O texto pronto para o prompt do editor, ou null quando o estilo ainda não tem referência. */
export function textoDaReferencia(id: string | null | undefined): string | null {
  const r = referenciaDoEstilo(id);
  return r ? textoParaOPrompt(r) : null;
}

export { textoParaOPrompt, AREA_SEGURA, contarPalavras } from "@/lib/media/referencias-de-estilo/tipos";
export type { ReferenciaDeEstilo, ElementoGrafico, MomentoExemplo, FamiliaTipografica } from "@/lib/media/referencias-de-estilo/tipos";
