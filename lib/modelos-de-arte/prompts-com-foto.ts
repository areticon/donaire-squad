import type { ModeloDeArte } from "@/lib/modelos-de-arte/catalogo";

/**
 * TODO MODELO COM FOTO É GERADO PELO MELHOR MODELO DE IMAGEM (05/10/2026).
 *
 * Decisão do Bruno, 05/10, depois do post de Fé & Gestão montado em código com
 * a foto do cliente cortada nos olhos: "tirando os modelos que são praticamente
 * somente texto, precisa todos serem gerados pelos melhores modelos de IA; é
 * dinheiro e credibilidade jogados fora". A família Vox já tinha o prompt no
 * catálogo (lib/modelos-de-arte/prompts-vox.ts); aqui ficam os prompts dos
 * DEMAIS modelos com foto, e as regras puras que a esteira usa para decidir:
 *
 *   - `soTexto(modelo)`: o modelo é só texto (não há lugar para foto); sai
 *     inteiro em código, sem imagem paga;
 *   - `promptDoModelo(modelo)`: o prompt do modelo (o do catálogo, ou o deste
 *     arquivo); null só nos modelos só texto;
 *   - `fotoDoClienteEntra(modelo)`: a foto REAL do cliente (biblioteca ou o
 *     melhor quadro do vídeo) só entra como referência do gerador quando o
 *     modelo tem o lugar de "você" (foto "recorte"). Nos outros, a foto do
 *     cliente não aparece: "quando eu falei que queria usar essa foto em algum
 *     post?" (Bruno, 05/10);
 *   - `fundoInteiroDoModelo(modelo)`: a imagem gerada é o fundo inteiro da peça
 *     (família Vox, modo "fundo gerado") ou vai para a zona da foto do modelo.
 *
 * As variáveis são as de lib/modelos-de-arte/prompt-do-modelo.ts ({destaque},
 * {fundo}, {titulo}, {paleta}, {manchete}, {palavra}, {foto}, {formato}) mais
 * {cena}, a metáfora visual da frase em inglês (cenaDaFrase), preenchida por
 * `preencherCena`. A tipografia nunca é desenhada pelo modelo: entra em código.
 *
 * Arquivo puro: só strings e funções sem banco. Componente de cliente pode importar.
 */

/** O que todo prompt com foto repete: fotografia de verdade, sem texto, sem logo. */
const BASE_COM_FOTO =
  "Realistic editorial photograph for a social media post, shot on a full-frame camera, natural believable light, true-to-life materials and places, one clear focal subject, nothing cluttered. Brand palette for any accent in the scene: {paleta}. Absolutely NO text, letters, numbers, captions, watermarks, logos or interface panels anywhere: the headline \"{manchete}\" is printed on top in code afterwards.";

/** O que todo prompt com a pessoa de referência repete: a mesma pessoa, sem redesenhar o rosto. */
const PESSOA_DE_REFERENCIA =
  "The person is {foto}. Keep their exact likeness, face, skin, hair, age and clothing as in the reference photograph; never beautify, never change the expression into a fake smile, never replace them with another person. Eyes open, mouth closed or gently speaking, looking at the camera.";

/**
 * Os prompts por id, para os modelos com foto que não são da família Vox.
 * Cada um descreve a composição do modelo e a zona quieta onde a tipografia
 * entra depois (conforme `estrutura` e `fotoOnde` do catálogo).
 */
export const PROMPTS_COM_FOTO: Record<string, string> = {
  "voce-na-frente-do-titulo": `${BASE_COM_FOTO}
${PESSOA_DE_REFERENCIA}
Composition for a {formato}: a confident half-body portrait, centered, from the chest up, filling the lower 70% of the frame and bleeding off the bottom edge. The background is a softly blurred real environment in deep {fundo} tones with a faint {destaque} rim light on the shoulders, calm and almost empty in the upper third, because a giant headline will pass behind the person there. Plain enough behind the head and shoulders for a clean cut-out.`,

  "voce-com-palavra-em-bloco": `${BASE_COM_FOTO}
${PESSOA_DE_REFERENCIA}
Composition for a {formato}, vertical portrait framing: the person from the waist up, slightly off-center, occupying the upper two thirds; dramatic directional light, the background a real room fading into deep {fundo} shadow toward the bottom, where the lower third stays calm and dark for a stacked headline. Plain tones around the silhouette for a clean cut-out.`,

  "preto-e-branco-com-uma-palavra": `${BASE_COM_FOTO}
${PESSOA_DE_REFERENCIA}
Composition for a {formato}: a striking portrait with hard contrasty studio light, the person centered from the chest up, hands or gesture allowed, against a plain seamless backdrop with no objects. The image will be converted to black and white in code and one giant word will pass behind the person, so keep the backdrop even and the silhouette crisp.`,

  "voce-sobre-o-mapa": `${BASE_COM_FOTO}
${PESSOA_DE_REFERENCIA}
Composition for a {formato}: a vertical three-quarter portrait of the person standing or seated, framed from the hips up, positioned in the right half of the frame, lit softly from the front, against a plain seamless {fundo} backdrop with nothing else, for an easy cut-out. The left half and the top stay completely empty.`,

  "foto-legenda-escura": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: wide horizontal framing, the subject in the upper two thirds, rich but calm colour, a slightly darker lower edge so the image blends into a {fundo} band below it. No people.`,

  "foto-legenda-clara": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: bright, airy daylight, light surfaces, crisp detail, the subject centered with generous breathing room on every side, so the photo reads well inside a rounded frame over a {titulo} page. No people.`,

  "foto-inteira-degrade": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: full-bleed cinematic frame, the subject in the upper half, the lower third naturally darker and calmer (shadow, floor, dark surface) because a headline in capitals sits there over a {fundo} gradient. No people.`,

  "foto-meia-meia": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a balanced, centered composition that survives both a square and a tall crop, soft even light, a quiet background, the colours leaning toward {destaque} as the single accent. No people.`,

  "polaroid-legenda-a-mao": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a candid instant-camera snapshot, square framing, warm natural colour, slight film grain and soft vignette, the subject slightly off-center as in a real snapshot. No people's faces.`,

  "colagem-fita-adesiva": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: one strong, simple subject on a quiet background, slightly desaturated print look with a little grain, high enough contrast to read when cut out and printed small on paper. No people's faces.`,

  "manchete-de-jornal": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a documentary news photograph, wide frame, available light, honest colour, the subject in the middle with context around it, like a front-page photo under a headline. No people's faces.`,

  "capa-de-revista": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a magazine-cover still life, full-bleed, the subject in the lower two thirds, a clean, calm upper area for a masthead, polished studio light with the brand accent {destaque} somewhere in the scene. No people.`,

  "capa-reels-com-foto": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: vertical full-bleed frame, the subject in the upper half, the middle of the frame calm and uncluttered because a solid {destaque} title box sits there, darker toward the bottom. No people.`,

  "titulo-em-faixas-solidas": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: vertical frame, one strong subject in the upper half with dramatic light, the lower third calm and dark so stacked solid {destaque} headline bars read over it. No people.`,

  "foto-escura-texto-no-centro": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a moody low-key scene in dark {fundo} tones, the subject at the edges or in the background, lots of empty negative space in the center of the frame where a centered headline will sit under a dark veil. No people.`,

  "foto-de-palco-sem-texto": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a wide stage or event atmosphere, dramatic spotlights and haze, deep {fundo} shadows with {destaque} light, the scene carrying the message by itself; silhouettes allowed, no recognizable faces.`,

  "capa-escura-com-objeto": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a product or object still life, the object perfectly centered and filling about 60% of a square frame, on a dark neutral backdrop close to {fundo}, soft studio light with a {destaque} rim, because the photo goes inside a large circle. No people.`,

  "foto-pb-com-tira-de-papel": `${BASE_COM_FOTO}
Scene: {cena}
Composition for a {formato}: a documentary frame with strong textures and directional light, deep shadows and bright highlights, the subject slightly above center, because the image will be converted to black and white in code and a paper strip with the headline is taped over the lower half. No people's faces.`,
};

/** O modelo é "praticamente só texto": não tem lugar para foto. Sai inteiro em código, sem imagem paga. */
export function soTexto(modelo: Pick<ModeloDeArte, "foto"> | null | undefined): boolean {
  return !modelo || modelo.foto === "nenhuma";
}

/**
 * O prompt do modelo: o do catálogo (família Vox) ou o deste arquivo. Null só
 * nos modelos só texto, que não pedem imagem.
 */
export function promptDoModelo(modelo: Pick<ModeloDeArte, "id" | "foto" | "prompt"> | null | undefined): string | null {
  if (!modelo || soTexto(modelo)) return null;
  return modelo.prompt ?? PROMPTS_COM_FOTO[modelo.id] ?? null;
}

/**
 * A foto REAL do cliente (biblioteca de materiais ou o melhor quadro do vídeo)
 * só entra quando o modelo tem o lugar de "você": foto "recorte". Nos demais
 * modelos a foto do cliente nunca aparece, nem como referência.
 */
export function fotoDoClienteEntra(modelo: Pick<ModeloDeArte, "foto"> | null | undefined): boolean {
  return modelo?.foto === "recorte";
}

/** A imagem gerada é o fundo inteiro da peça (família Vox, modo "fundo gerado"), e não a foto da zona. */
export function fundoInteiroDoModelo(modelo: Pick<ModeloDeArte, "arquetipo"> | null | undefined): boolean {
  return Boolean(modelo?.arquetipo.startsWith("vox-"));
}

/** Preenche {cena} (a metáfora visual da frase, em inglês). Sem cena, a linha some. */
export function preencherCena(prompt: string, cena: string | null | undefined): string {
  const c = (cena ?? "").replace(/\s+/g, " ").trim();
  if (c) return prompt.replace(/\{cena\}/g, c.slice(0, 400));
  return prompt.replace(/^Scene: \{cena\}\n?/m, "").replace(/\{cena\}/g, "");
}

/** Os ids dos modelos com foto que têm prompt (do catálogo ou daqui), para a prova. */
export function modelosComPrompt(modelos: Array<Pick<ModeloDeArte, "id" | "foto" | "prompt">>): string[] {
  return modelos.filter((m) => promptDoModelo(m)).map((m) => m.id);
}
