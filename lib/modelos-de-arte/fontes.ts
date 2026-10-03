/**
 * As fontes do BOOK DE MODELOS (03/10/2026), todas do Google Fonts (licença OFL).
 *
 * A mesma fonte vive em dois lugares, e é isso que faz a prévia ser a arte:
 *   - no navegador, pelo CSS do Google Fonts (`URL_DAS_FONTES`);
 *   - no servidor, pelo TTF estático em lib/media/fontes-da-capa/modelos, que o
 *     Satori registra com o MESMO nome de família e peso.
 * As larguras de cada caractere (lib/modelos-de-arte/metricas.ts) saem desses
 * TTF, e o encaixe do texto usa a mesma conta nos dois lados.
 *
 * Este arquivo é puro (sem banco, sem fs): a galeria, que é componente de
 * cliente, importa daqui.
 */

export type FonteId =
  | "Anton-400"
  | "BebasNeue-400"
  | "Oswald-700"
  | "ArchivoBlack-400"
  | "Montserrat-800"
  | "Montserrat-500"
  | "Inter-700"
  | "Inter-400"
  | "Poppins-700"
  | "Poppins-400"
  | "PlayfairDisplay-700"
  | "PlayfairDisplay-400i"
  | "DMSerifDisplay-400"
  | "SpaceGrotesk-700"
  | "Caveat-700"
  | "PermanentMarker-400"
  | "JetBrainsMono-500";

export interface Fonte {
  id: FonteId;
  /** O nome da família, igual no CSS e no registro do Satori. */
  familia: string;
  peso: 400 | 500 | 700 | 800;
  italico: boolean;
  /** Para a ficha do modelo. */
  rotulo: string;
}

export const FONTES: Record<FonteId, Fonte> = {
  "Anton-400": { id: "Anton-400", familia: "Anton", peso: 400, italico: false, rotulo: "Anton" },
  "BebasNeue-400": { id: "BebasNeue-400", familia: "Bebas Neue", peso: 400, italico: false, rotulo: "Bebas Neue" },
  "Oswald-700": { id: "Oswald-700", familia: "Oswald", peso: 700, italico: false, rotulo: "Oswald Bold" },
  "ArchivoBlack-400": { id: "ArchivoBlack-400", familia: "Archivo Black", peso: 400, italico: false, rotulo: "Archivo Black" },
  "Montserrat-800": { id: "Montserrat-800", familia: "Montserrat", peso: 800, italico: false, rotulo: "Montserrat ExtraBold" },
  "Montserrat-500": { id: "Montserrat-500", familia: "Montserrat", peso: 500, italico: false, rotulo: "Montserrat Medium" },
  "Inter-700": { id: "Inter-700", familia: "Inter", peso: 700, italico: false, rotulo: "Inter Bold" },
  "Inter-400": { id: "Inter-400", familia: "Inter", peso: 400, italico: false, rotulo: "Inter" },
  "Poppins-700": { id: "Poppins-700", familia: "Poppins", peso: 700, italico: false, rotulo: "Poppins Bold" },
  "Poppins-400": { id: "Poppins-400", familia: "Poppins", peso: 400, italico: false, rotulo: "Poppins" },
  "PlayfairDisplay-700": { id: "PlayfairDisplay-700", familia: "Playfair Display", peso: 700, italico: false, rotulo: "Playfair Display Bold" },
  "PlayfairDisplay-400i": { id: "PlayfairDisplay-400i", familia: "Playfair Display", peso: 400, italico: true, rotulo: "Playfair Display Itálico" },
  "DMSerifDisplay-400": { id: "DMSerifDisplay-400", familia: "DM Serif Display", peso: 400, italico: false, rotulo: "DM Serif Display" },
  "SpaceGrotesk-700": { id: "SpaceGrotesk-700", familia: "Space Grotesk", peso: 700, italico: false, rotulo: "Space Grotesk Bold" },
  "Caveat-700": { id: "Caveat-700", familia: "Caveat", peso: 700, italico: false, rotulo: "Caveat (letra à mão)" },
  "PermanentMarker-400": { id: "PermanentMarker-400", familia: "Permanent Marker", peso: 400, italico: false, rotulo: "Permanent Marker (pincel)" },
  "JetBrainsMono-500": { id: "JetBrainsMono-500", familia: "JetBrains Mono", peso: 500, italico: false, rotulo: "JetBrains Mono" },
};

/** O CSS do Google Fonts com todas as fontes do book, para a galeria. */
export const URL_DAS_FONTES =
  "https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Oswald:wght@700&family=Archivo+Black" +
  "&family=Montserrat:wght@500;800&family=Inter:wght@400;700&family=Poppins:wght@400;700" +
  "&family=Playfair+Display:ital,wght@0,700;1,400&family=DM+Serif+Display&family=Space+Grotesk:wght@700" +
  "&family=Caveat:wght@700&family=Permanent+Marker&family=JetBrains+Mono:wght@500&display=swap";

/** O estilo de texto de uma fonte, igual no navegador e no Satori. */
export function estiloDaFonte(id: FonteId): { fontFamily: string; fontWeight: number; fontStyle: "normal" | "italic" } {
  const f = FONTES[id];
  return { fontFamily: f.familia, fontWeight: f.peso, fontStyle: f.italico ? "italic" : "normal" };
}
