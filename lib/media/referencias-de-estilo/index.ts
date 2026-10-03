import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";
import { SESSENTA_MINUTOS } from "@/lib/media/referencias-de-estilo/60-minutes";
import { ALI_ABDAAL } from "@/lib/media/referencias-de-estilo/ali-abdaal";
import { BBC } from "@/lib/media/referencias-de-estilo/bbc";
import { CARROSSEL_ANIMADO } from "@/lib/media/referencias-de-estilo/carrossel-animado";
import { CONSORCIO } from "@/lib/media/referencias-de-estilo/consorcio";
import { CRIME_REAL } from "@/lib/media/referencias-de-estilo/crime-real";
import { DEPOIMENTO } from "@/lib/media/referencias-de-estilo/depoimento";
import { DOCUMENTARIO } from "@/lib/media/referencias-de-estilo/documentario";
import { HORMOZI } from "@/lib/media/referencias-de-estilo/hormozi";
import { INSTITUCIONAL } from "@/lib/media/referencias-de-estilo/institucional";
import { JOHNNY_HARRIS } from "@/lib/media/referencias-de-estilo/johnny-harris";
import { KEYNOTE } from "@/lib/media/referencias-de-estilo/keynote";
import { KURZGESAGT } from "@/lib/media/referencias-de-estilo/kurzgesagt";
import { LOUSA } from "@/lib/media/referencias-de-estilo/lousa";
import { MINIMALISTA } from "@/lib/media/referencias-de-estilo/minimalista";
import { MRBEAST } from "@/lib/media/referencias-de-estilo/mrbeast";
import { NATGEO } from "@/lib/media/referencias-de-estilo/natgeo";
import { PODCAST } from "@/lib/media/referencias-de-estilo/podcast";
import { QUADRO_BRANCO } from "@/lib/media/referencias-de-estilo/quadro-branco";
import { TED } from "@/lib/media/referencias-de-estilo/ted";
import { TELA_DIVIDIDA } from "@/lib/media/referencias-de-estilo/tela-dividida";
import { TIPOGRAFIA } from "@/lib/media/referencias-de-estilo/tipografia";
import { UGC } from "@/lib/media/referencias-de-estilo/ugc";
import { VHS } from "@/lib/media/referencias-de-estilo/vhs";
import { VLOG } from "@/lib/media/referencias-de-estilo/vlog";
import { VOX } from "@/lib/media/referencias-de-estilo/vox";
import { WES_ANDERSON } from "@/lib/media/referencias-de-estilo/wes-anderson";

/**
 * AS REFERÊNCIAS DE ESTILO (03/10/2026): o repertório do agente editor, uma
 * por linguagem do catálogo (lib/media/catalogo-de-estilos.ts), pelo mesmo id.
 * Ver tipos.ts para o que cada uma traz. Módulo puro.
 */
export const REFERENCIAS_DE_ESTILO: Record<string, ReferenciaDeEstilo> = {
  "60-minutes": SESSENTA_MINUTOS,
  "ali-abdaal": ALI_ABDAAL,
  "bbc": BBC,
  "carrossel-animado": CARROSSEL_ANIMADO,
  "consorcio": CONSORCIO,
  "crime-real": CRIME_REAL,
  "depoimento": DEPOIMENTO,
  "documentario": DOCUMENTARIO,
  "hormozi": HORMOZI,
  "institucional": INSTITUCIONAL,
  "johnny-harris": JOHNNY_HARRIS,
  "keynote": KEYNOTE,
  "kurzgesagt": KURZGESAGT,
  "lousa": LOUSA,
  "minimalista": MINIMALISTA,
  "mrbeast": MRBEAST,
  "natgeo": NATGEO,
  "podcast": PODCAST,
  "quadro-branco": QUADRO_BRANCO,
  "ted": TED,
  "tela-dividida": TELA_DIVIDIDA,
  "tipografia": TIPOGRAFIA,
  "ugc": UGC,
  "vhs": VHS,
  "vlog": VLOG,
  "vox": VOX,
  "wes-anderson": WES_ANDERSON,
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
