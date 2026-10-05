/**
 * OS PROMPTS DA FAMÍLIA VOX (05/10/2026): o modelo por prompt.
 *
 * Decisão do Bruno em 05/10, depois de ver a folha vox-0510.png: "o estilo
 * Vox ficou muito aquém do original". Desenhar a colagem inteira em código
 * (papel de pintas, jornal de barrinhas cinzas, meio-tom de trama) não chega
 * perto do original. Então, nos modelos COMPLEXOS, quem desenha o visual é o
 * próprio modelo de imagem que já gera as artes (GPT Image 2 na OpenAI, GPT
 * Image 2.5 na Higgsfield, Nano Banana no Google), a partir de um prompt
 * escrito com a linguagem Vox lida nas referências
 * (docs/overlays/referencias/vox-posts/FONTES.md). Os modelos simples seguem
 * em código.
 *
 * GERAÇÃO HÍBRIDA, para a legibilidade: o modelo de imagem gera SÓ o fundo e
 * a colagem, na paleta da marca, SEM NENHUM TEXTO, e deixa uma zona quieta
 * (papel quase vazio) onde a tipografia entra depois, em código, como hoje
 * (lib/modelos-de-arte/desenho-vox.tsx, modo "fundo gerado"). Assim o texto
 * nunca sai errado, e o visual sai do melhor desenhista que temos.
 *
 * A foto do cliente entra como IMAGEM DE REFERÊNCIA quando o gerador aceita
 * (edição com imagem de entrada: GPT Image 2.5 na Higgsfield, Nano Banana);
 * sem foto, o prompt descreve um figurante anônimo ou só objetos.
 *
 * As variáveis (preenchidas por lib/modelos-de-arte/prompt-do-modelo.ts):
 *   {destaque}  o nome da cor de destaque da marca (o lugar do amarelo Vox)
 *   {fundo}     o nome da cor de fundo aprovada
 *   {titulo}    o nome da cor de título aprovada
 *   {paleta}    a paleta inteira em uma linha
 *   {manchete}  o texto do título (para o modelo compor em volta; NUNCA escrever)
 *   {palavra}   a palavra em destaque do título
 *   {foto}      a descrição da foto do cliente (ou do figurante anônimo)
 *   {formato}   o formato da peça (post 4:5, carrossel, story 9:16)
 *
 * Arquivo puro: só strings. Componente de cliente pode importar.
 */

/**
 * A LINGUAGEM VOX, extraída das referências (o quadro vox-01, o feed do Bruno,
 * o "before / after", o rosto em pedaços de jornal, o "style edit" em papel, e
 * os tutoriais de colagem animada listados em FONTES.md). O que faz o
 * original ser o original:
 *   - papel amassado e ESCANEADO, com grão de verdade, vincos e dobras;
 *   - recortes de jornal antigo com TEXTO IMPRESSO de verdade (tipografia de
 *     época, pequena, nunca legível como frase; nunca barrinhas cinzas);
 *   - fotos em meio-tom (halftone de impressão) em preto e branco, com borda
 *     branca de recorte à tesoura e sombra projetada curta;
 *   - pincelada de marca-texto com borda irregular e tinta falhada (nunca um
 *     retângulo);
 *   - setas, círculos e sublinhados à mão com traço de caneta, trêmulo;
 *   - rabiscos e anotações de caneta vermelha;
 *   - gravuras antigas a traço (trem, câmera, cérebro, mapa, engrenagem);
 *   - fita adesiva translúcida segurando os recortes;
 *   - carimbo com tinta falhada;
 *   - camadas com profundidade e leve rotação, nada perfeitamente alinhado;
 *   - cores: papel creme ou cinza, preto, UMA cor de destaque (aqui a da
 *     marca, no lugar do amarelo Vox) e o vermelho de caneta.
 */
export const LINGUAGEM_VOX = `Editorial paper-collage in the style of an explainer-journalism cutout animation frame, scanned and photographed, not vector, not illustration, not 3D.
Materials: a sheet of crumpled, creased, scanned paper with real fibre grain and soft folds; fragments of genuine old newspaper pages with real period letterpress type in tiny columns (never readable as sentences, never grey bars); black and white photographs printed in coarse halftone dots, cut out by hand with a thin white paper border and a short drop shadow; strips of translucent sticky tape holding cutouts down; thin pen scribbles and underlines; old line engravings (a steam train, a bellows camera, a brain, a compass, a gear, a map) in fine black ink; a rubber-stamp impression with broken, uneven ink; one highlighter sweep with a ragged, dry-brush edge.
Colour: the paper is pale grey-cream; ink is black; ONE accent colour, {destaque}, is used for the highlighter sweep, the torn paper strip and the stamp (exactly where a classic explainer collage would use yellow); a thin red ballpoint-pen red is allowed for arrows and circles; the brand palette is {paleta}, and nothing else is saturated.
Layering: every element sits as a physical cutout at a slight rotation of 2 to 6 degrees, overlapping, with real shadows and torn or scissor edges; a few elements bleed off the page.
Absolutely NO text, letters, numbers, words, captions, watermarks or logos drawn anywhere; the headline "{manchete}" will be printed on top in code afterwards, so leave the headline zone as described below almost empty: plain crumpled paper with only faint creases and grain.`;

/** Os prompts por id do modelo. Cada um tem composição própria e a zona quieta para o título. */
export const PROMPTS_VOX: Record<string, string> = {
  "papel-com-titulo-e-faixa-rasgada": `${LINGUAGEM_VOX}
Composition for a {formato}: the TOP 42% of the page is the headline zone, empty crumpled grey paper. In the lower half, {foto}, printed in black and white coarse halftone, cut out with a white paper border and drop shadow, bust to waist, centered, bleeding off the bottom edge. A torn strip of {destaque} paper, ragged on both long edges, crosses the figure diagonally at the mouth or chest, held by two pieces of translucent tape. A small hand-drawn pen scribble near the shoulder and a tiny line engraving of a compass in one upper corner, nothing else; keep it sparse like a magazine opinion page.`,

  "papel-com-foto-rasgada": `${LINGUAGEM_VOX}
Composition for a {formato}: the TOP 40% is the headline zone, empty crumpled grey paper. Below it, a photograph of {foto}, printed in black and white halftone, pasted on a piece of torn white paper with ragged edges, slightly rotated, held at the top by a strip of {destaque} tape. On the photo, a hand-drawn rectangle in {destaque} marker with uneven, wobbly strokes circles one detail, and a red ballpoint arrow with a shaky line points at it from the side. A faint coffee-ring stain and two small pen scribbles on the paper around it.`,

  "jornal-com-marca-texto": `${LINGUAGEM_VOX}
Composition for a {formato}: the whole page is an old yellowed newspaper page, creased and scanned, with real period letterpress columns, thin column rules and a small engraving of a steam train at the bottom edge; the type is tiny and never readable. Pasted on the upper left, a torn piece of plain cream paper covering about 60% of the width and 42% of the height: this is the headline zone, keep it empty. On the right, from mid-height to the bottom edge, {foto}, printed in black and white halftone, cut out with a white paper border and shadow, overlapping the newspaper. A hand-drawn dashed red pen arrow curves from the headline zone toward the figure. A thin {destaque} highlighter sweep with a dry ragged edge runs across one newspaper column near the figure. The lower left corner stays quiet for a round sticker that will be added later.`,

  "antes-e-depois-em-papel": `${LINGUAGEM_VOX}
Composition for a {formato}: one black and white photograph of {foto} fills the whole page edge to edge. The left half is the clean photograph; the right half is the SAME photograph printed in coarse halftone dots, as if torn from a newspaper, and the seam between the halves is a straight vertical bar of {destaque} paper slightly left of center with a torn feel on its edges. Across the top 24% of the page, a torn strip of crumpled grey paper with ragged lower edge is pasted over the photo: this is the headline zone, keep it empty. No other elements; the contrast between the two halves is the whole idea.`,

  "rosto-em-pedacos-de-jornal": `${LINGUAGEM_VOX}
Composition for a {formato}: the TOP 30% is the headline zone, empty crumpled grey paper. Below, two big torn-paper blocks overlap: one of {destaque} paper and one of {fundo} paper, ragged edges, rotated a few degrees. In front of them, {foto}, frontal, printed in black and white halftone, cut out with a white border, bust to shoulders, filling the lower 65% of the page and bleeding off the bottom. Parts of the face are covered by small pieces of old newspaper with real tiny type, glued at odd angles and held with translucent tape; dashed red pen circles and short {destaque} pen strokes radiate around the head. Bold, loud, like a zine cover.`,

  "capa-de-carrossel-em-papel": `${LINGUAGEM_VOX}
Composition for a {formato}, the cover of a carousel: the TOP 45% is the headline zone, empty crumpled grey paper. {foto}, printed in black and white halftone and cut out with a white border, stands small at the lower right, about a third of the page height, bleeding off the bottom. In the lower left there is a small torn strip of cream paper and a hand-drawn red pen arrow with a shaky line curving toward the figure, pointing right. A fine line engraving of a bellows camera sits near the lower left edge, and a few pen scribbles and a small {destaque} highlighter dash are scattered, sparse. The upper right area beside the headline zone stays quiet for a round sticker that will be added later.`,

  "infografico-em-papel": `${LINGUAGEM_VOX}
Composition for a {formato}, an infographic background with no photographs: crumpled grey paper, scanned, with faint dotted grid lines like graph paper in places. The TOP 28% is the headline zone, empty. The CENTER of the page, a wide column covering 70% of the width, stays nearly empty too, because four numbered items will be printed there later. Around the edges only: small old line engravings (a gear, a lightbulb, a hand pointing, a magnifying glass) in fine black ink, a {destaque} highlighter dash, a hand-drawn dashed red pen line running down the left margin with small circles on it, a piece of translucent tape in one corner and a tiny newspaper fragment in another. Calm and sparse, like a notebook page prepared for notes.`,

  "frase-com-carimbo-e-foto": `${LINGUAGEM_VOX}
Composition for a {formato}: the TOP 48% is the headline zone, empty crumpled grey paper. In the lower left, a small square photograph of {foto}, printed in black and white halftone, on a thick white paper frame like an instant print, tilted about 5 degrees, held by a strip of {destaque} tape at the top. To its right, the impression of a blank rectangular rubber stamp in {destaque} ink, broken and uneven, with nothing written inside, rotated slightly. A red ballpoint underline and a small line engraving of a brain near the lower right corner, and one faint coffee-ring stain. Sparse, with lots of paper showing.`,
};

/** A descrição do figurante quando o cliente não mandou foto (nunca pessoa real). */
export const FIGURANTE_ANONIMO = "an anonymous fictional adult, modestly dressed, expressive gesture, plain studio background, never a real or famous person";
/** A descrição do objeto quando o modelo pede documento, tela ou detalhe e não há foto. */
export const OBJETO_ANONIMO = "a spreadsheet printout, a notebook page and a pen on a desk, seen from above";
