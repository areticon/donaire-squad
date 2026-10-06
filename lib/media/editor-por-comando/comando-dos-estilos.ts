import { CATALOGO_DE_ESTILOS, arteDoEstilo, estiloDoCatalogo, type EstiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { medidaDaCor, papeisDaPaleta } from "@/lib/media/papeis-da-paleta";
import type { FonteDoComando } from "@/lib/media/editor-por-comando/comando";
import type { FamiliaVisual } from "@/lib/media/editor-por-comando/linguagem";

/**
 * AS MINIATURAS DOS ESTILOS NA TELA DO COMANDO (05/10/2026, noite). Pedido
 * do Bruno: a tela "Comando do vídeo" mostra as miniaturas dos estilos do
 * catálogo como cartões; o clique PREENCHE o comando, em português, com:
 *   - a linguagem visual daquele estilo (como as peças são desenhadas);
 *   - as cores da marca do projeto, pela hierarquia de papeis-da-paleta;
 *   - o nicho e o público do projeto (setup, linha editorial);
 *   - os tipos de elemento, vídeo e efeito que combinam com o estilo, como
 *     SUGESTÃO de ritmo e densidade, nunca lista fechada (o JEV continua livre
 *     para escolher qualquer tipo em cada momento).
 * O texto fica editável.
 *
 * A LINGUAGEM DE CADA ESTILO, PESQUISADA (06/10/2026, pedido do Bruno às
 * 2h20: "melhorar o prompt de todos os modelos de vídeo com pesquisa, como
 * fizemos com o Vox e o Dan Martell"). Cada um dos 26 estilos do catálogo
 * tem a ficha `LINGUAGEM_DOS_ESTILOS[id]`:
 *   - `comando`: o comando pronto em português (o que a miniatura preenche;
 *     o cliente lê e edita; o JEV e o redator leem). Diz como os elementos se
 *     desenham naquela linguagem (título atrás, folha, jornal, colagem,
 *     cartão, número, marca-texto, mapa, cronologia, inserção, B-roll,
 *     frase-chave, nome de quem fala, zoom no ponto, inscrever) sem fechar
 *     lista: o JEV decide o tipo por momento; o estilo só muda o COMO;
 *   - `bloco`: o bloco de linguagem em INGLÊS para os prompts de imagem e de
 *     B-roll (materiais, luz, grão, composição, o que evitar), que a
 *     biblioteca de design grava como a linguagem da semente;
 *   - `pecas`: como cada tipo de elemento se desenha, em inglês, para o
 *     redator e para quem ler a biblioteca;
 *   - `ritmo`: a sugestão de ritmo ao JEV, nunca regra;
 *   - `familia`: a família de componentes do worker que o estilo cai;
 *   - `referencias`: as fontes reais (docs/overlays/referencias/estilos-0610.md).
 * Nada aqui é condição no código: é conteúdo. As cores de terceiros (o
 * amarelo da Vox, o ciano do Dan Martell) nunca entram: a cor é a da marca.
 *
 * Módulo puro: a tela (componente cliente) importa daqui.
 */

export type LinguagemDoEstilo = {
  familia: FamiliaVisual;
  /** O comando pronto em português (até 650 caracteres, para caber com cores, nicho e sugestão nos 1500 da tela). */
  comando: string;
  /** O bloco de linguagem em inglês para imagem e B-roll (até 900 caracteres, o teto da biblioteca). */
  bloco: string;
  /** Como cada tipo de elemento se desenha nesta linguagem (inglês). */
  pecas: string;
  /** O ritmo típico, como sugestão ao JEV. */
  ritmo: string;
  /** As referências pesquisadas em 06/10/2026. */
  referencias: string[];
};

export const LINGUAGEM_DOS_ESTILOS: Record<string, LinguagemDoEstilo> = {
  vox: {
    familia: "papel",
    comando:
      "Estilo Vox, explicativo editorial: colagem de papel recortado sobre papel envelhecido e escaneado, fotos de arquivo em preto e branco com meio-tom de impressão, borda branca de tesoura e sombra curta, recortes de jornal com tipografia de época, fita adesiva, setas e círculos à mão, título serifado sobre faixa de marca-texto na cor da marca, carimbo nas palavras fortes, gráfico de barras simples que cresce quando eu disser número, mapa antigo com círculo desenhado quando eu falar de lugar, linha do tempo de papel quando eu falar de datas. Tudo entra como recorte colado, com leve rotação, nada perfeitamente alinhado.",
    bloco:
      "Editorial paper-collage explainer look, scanned and photographed, never vector, never 3D. Materials: crumpled cream paper with real fibre grain and folds; black and white photographs printed in coarse halftone dots, hand cut with a thin white paper border and a short drop shadow; fragments of old newspaper with tiny period letterpress columns, never readable; translucent tape, pen scribbles, dashed hand-drawn arrows and circles, one dry-brush highlighter sweep, a rubber stamp with broken ink, fine black line engravings. Every element is a physical cutout at a 2 to 6 degree tilt, layered with real shadows, stepped parallax rather than smooth motion. Colour: paper cream, black ink, the brand accent only on the highlighter, tape and stamp, a thin red ballpoint for arrows. Avoid: glossy stock photos, flat vector icons, gradients, 3D render, lens flare, neon, saturated colour washes.",
    pecas:
      "Title behind the speaker: serif black type on a torn highlighter strip pinned to the paper. Window image: a halftone photo cut out with a white border, taped at a tilt. Newspaper: a torn clipping with the headline in serif and the highlighter running across it. Collage: 1 to 3 cutouts dropping in with parallax, a red thread linking two of them. Number: ink numerals on a paper card, bars as paper strips growing. Highlight caption: the spoken phrase in serif on a highlighter sweep. Map: an old engraved map, torn, the camera landing on the place and a red circle drawing itself, the name on a paper tag. Timeline: a paper strip ruler, year markers in highlighter, archive photos hanging from each mark. Quote: the newspaper treatment. Speaker name: a paper tag with typewriter type. Zoom on point: stepped push-in with a hand-drawn circle. Subscribe: a stamped paper tag.",
    ritmo: "uma tela de papel a cada 8 a 15 s no longo, 3 a 6 s cada rótulo e 6 a 12 s cada gráfico ou mapa; no corte, algo novo a cada 4 a 6 s; nunca mais de 20 s só na pessoa",
    referencias: [
      "Vox, Why do we have grass lawns e Why it's hard for Americans to retire (medição de 25/08, docs/overlays/BIBLIA-DE-ESTILO.md, sistema 1)",
      "cliptude.com/vox-style-animation (vocabulário: halftone, archival, paper-cutout, infographic, stepped cut-on-twos; evitar PowerPoint plano, 3D liso, vetor)",
      "calliopelabs.co/guides/vox-style-shorts (paleta de arquivo: creme, preto, meio-tom, vermelho, mostarda)",
      "flatpackfx.com e tutsplus, colagem Vox no After Effects (recorte à tesoura, sombra de papel, fita translúcida, parallax 2.5D)",
    ],
  },
  bbc: {
    familia: "realista",
    comando:
      "Estilo noticiário e reportagem, como a BBC: a gravação fica natural, sem filtro, e tudo que entra é sóbrio e limpo. Tarja de nome e cargo no terço inferior, fundo escuro com um filete na cor da marca, título em serifa e detalhe em sem serifa; número grande com a fonte citada embaixo; mapa simples e plano quando eu falar de região, com o lugar marcado; selo do assunto no canto; citação como declaração entre aspas. Imagens de apoio em fotografia documental de reportagem, luz disponível, cor honesta. Cortes secos, fusão só na troca de bloco. Nada de efeito, nada de emoji.",
    bloco:
      "Broadcast news photography look: documentary photojournalism, real places and real work, available light, honest true-to-life colour with moderate contrast, no filter, no stylisation, slight natural grain from a full-frame camera. Compositions are steady and informative: wide establishing shots, three-quarter views of people at work with a softly blurred background, close details of documents, machines and hands. Overlays are flat and sober: a dark lower-third strap with a thin brand-colour line, serif headline with a sans-serif detail line, clean flat maps with the place marked. Avoid: dramatic colour grades, lens flare, HDR gloss, stock-photo smiles, posed models, illustration, paper textures, neon, emoji.",
    pecas:
      "Speaker name: dark strap in the lower third, serif name, sans role, thin brand-colour rule. Title behind: no giant type; a sober headline strap instead. Number: large white numeral on a dark strap with the source in small caps beneath. Map: flat two-tone map, the region filled in the brand accent, a dot and label on the place. Timeline: a horizontal rule with dated ticks. Quote: the sentence between quotation marks on a strap, attribution beneath. Window image: a straight-edged photo panel with a thin frame. Highlight caption: a single-line strap, no animation. Subscribe: a small flat tag.",
    ritmo: "10 a 16 cortes por minuto; a tarja de nome 4 a 6 s; o número 4 a 8 s; a pessoa domina, elemento só quando a fala traz fato, nome, número ou lugar",
    referencias: [
      "newscaststudio.com, BBC News rebrand de 2019 (tarja preta com toque de cor, Reith serifada no título e sem serifa no detalhe, foco em clareza)",
      "bbc.github.io/gel/foundations/typography (hierarquia da Reith; aqui, a letra da marca)",
      "docs/estilos-de-edicao-de-video.md, ficha 2",
    ],
  },
  natgeo: {
    familia: "realista",
    comando:
      "Estilo documentário cinematográfico, como a National Geographic: a gravação fica natural, equilibrada, sem saturar. Imagens de apoio em cinema de verdade: planos abertos e aéreos, detalhe em macro, câmera lenta, luz de fim de tarde, tons terrosos e contraste de filme. Quase nenhum texto: título elegante em serifa fina, lugar e data em letra miúda no canto; mapa cinematográfico com rota que se desenha quando eu falar de caminho ou região; linha do tempo sóbria quando houver datas. Fusões longas, ritmo que respira, nada de efeito nem de legenda gritando.",
    bloco:
      "Cinematic natural-history documentary look: photographed on a cinema camera, authentic and grounded, never over-saturated. Golden-hour and blue-hour light, warm earthy tones, deep but soft contrast, fine film grain, shallow depth of field on details and wide-angle depth on landscapes. Aerial and drone perspectives, slow motion, macro texture of skin, soil, metal and water, atmosphere and haze in the distance. Composition is calm, symmetrical or following the horizon; people are small in the landscape or seen at work in silhouette. Overlays are minimal: thin serif titles, small-caps place and date, a dark cinematic map with a route drawing itself. Avoid: HDR gloss, neon, vector icons, paper textures, posed stock models, text, fast cuts.",
    pecas:
      "Title: thin serif centred or lower-left, long fade. Speaker name: small-caps name and place, no box. Number: a thin serif numeral with a hairline rule, slow count. Map: dark terrain map, the camera gliding in, a route or region tracing itself in the brand accent. Timeline: a hairline with dated marks revealed one by one. Window image: no window; full-screen cinematic insert with a slow push-in. Quote: serif italic on black with a long dissolve. Subscribe: a quiet small-caps tag.",
    ritmo: "6 a 10 cortes por minuto, planos de 6 a 12 s, B-roll em vídeo sempre que eu narrar um lugar ou uma ação; texto só na abertura, nos lugares e nas datas",
    referencias: [
      "indiewire.com, entrevista de Sophie Darlington sobre Lion (National Geographic): cor fiel, nunca sobrenatural nem saturada",
      "gasperdesouza.com, color grading de documentário a serviço da história",
      "docs/estilos-de-edicao-de-video.md, ficha 3",
    ],
  },
  "johnny-harris": {
    familia: "papel",
    comando:
      "Estilo jornalismo de mapa, como o Johnny Harris: o mapa é o personagem. Quando eu falar de lugar, região ou caminho, entra um mapa de satélite ou de relevo com grão de filme, a câmera chega do alto até o ponto, a fronteira ou a rota se desenha com traço à mão em passos, o nome vem numa etiqueta de papel. Para demografia e dados por região: o mapa recebe pontos ou áreas que acendem na cor da marca, com o número ao lado. Fotos de arquivo pregadas como num mural, setas e círculos desenhados, texturas de papel, vazamentos de luz e grão em tudo. Animação que anda em passos, não deslizando. Tarja de nome no mesmo traço.",
    bloco:
      "Documentary map-journalism look: real satellite and terrain imagery with a warm, slightly desaturated grade, heavy film grain, light leaks and dust, the handmade feel of photojournalism. Maps are the hero: top-down satellite or shaded-relief terrain, labels in a condensed sans with letterspacing, borders and routes drawn as hand-made ink lines that step in frames rather than slide, regions tinted with a flat brand-colour wash at low opacity, points as small ink dots that pop in. Photographs are pinned like evidence on a wall, slightly rotated, with paper edges and tape; arrows, circles and underlines are drawn by hand. Camera: zoom from orbit down to the place, tilt into terrain, short stepped pushes. Avoid: glossy 3D globes, vector flat icons, neon glow, smooth easing, saturated gradients, text.",
    pecas:
      "Map (the central piece): satellite or terrain, the camera descending from space to the place, border or route drawing itself stepwise, label on a paper tag; for demographics, dots or tinted regions light up in the brand colour with the number beside them. Timeline: a drawn ruler across a map or a photo wall. Collage: photos pinned with tape and thread. Newspaper: a torn clipping with a hand-drawn circle. Title behind: condensed capitals stamped stepwise. Number: ink numerals stepping up. Highlight caption: hand-drawn underline in the brand colour. Speaker name: a paper tag with condensed type. Zoom on point: stepped push-in with a drawn circle. Subscribe: a stamped tag.",
    ritmo: "18 a 28 cortes por minuto; o mapa fica 6 a 12 s e volta sempre que a fala muda de lugar; algo novo a cada 4 a 8 s; a pessoa aparece entre os mapas",
    referencias: [
      "aescripts.com, How Johnny Harris Makes Maps e Create a Johnny Harris Style Animated Map Montage (GEOlayers 3: satélite, relevo, marcadores, câmera do espaço ao lugar)",
      "fcpxfullaccess.com, Vox e Johnny Harris no Final Cut (imperfeição de propósito, texturas de papel, setas desenhadas, animação em passos, tarja no mesmo traço)",
      "motionarray.com, 3 Johnny Harris style tips (texturas, film burns, light leaks, grão)",
      "populationeducation.org, World Population dot video (pontos no mapa por coordenada e tempo: a referência para demografia)",
    ],
  },
  "crime-real": {
    familia: "papel",
    comando:
      "Estilo investigação, como série documental de crime real: tom sério, frio e escuro. Quadro de investigação com fotos de arquivo pregadas, linhas vermelhas ligando os recortes, documentos com trechos tarjados, datas e carimbos em letra de máquina de escrever, imagens de apoio em luz dura lateral e sombra pesada. Cronologia como dossiê quando houver datas; o nome de quem fala em letra de máquina; a revelação entra com um flash curto; silêncio antes da virada. Nada de cor saturada, nada de ícone bonitinho.",
    bloco:
      "True-crime documentary look: cold, dark and tense. Interview-style hard side light with deep shadows, desaturated cool grade with a slight green-teal cast, visible grain, vignette. Evidence-board materials: photographs pinned to cork or a wall with red thread connecting them, manila folders, documents with redacted black bars, typewriter type, rubber stamps, dated index cards, a desk lamp pool of light. Reconstruction imagery is anonymous and partial: hands, backs, silhouettes, corridors, rain on glass, a lit window at night. Camera: slow push-ins, static locked frames, a short white flash on reveals. Avoid: saturated colour, soft warm light, cheerful icons, neon, cartoon, smiling models, text.",
    pecas:
      "Collage: an evidence board with pinned photos and red thread. Newspaper: a torn clipping under a lamp. Timeline: a dossier strip with typewriter dates. Number: typewriter numerals stamped on a card. Title behind: bold condensed capitals in the dark with a flash. Highlight caption: a typed phrase, one word redacted then revealed. Speaker name: typewriter name on a paper tag. Map: a desaturated map with a red pin and thread. Quote: a typed statement on an index card. Window image: a photo pinned with a tilt. Subscribe: a stamped tag.",
    ritmo: "variável: lento na tensão (um elemento a cada 15 a 25 s), rápido na revelação (algo a cada 3 a 5 s); peças de 3 a 7 s; flash só na virada",
    referencias: [
      "filmmakermagazine.com, Can't Look Away: How True Crime Series are Edited (duas ou três câmeras na entrevista, arquivo, reconstituições)",
      "factualamerica.com, técnicas visuais de American Nightmare (luz atmosférica, ângulos, revelação)",
      "wikipedia, Evidence board (fotos, fio vermelho, mural de investigação); spotlightfx.com, pacote True Crime (marcadores de prova, cronologia, letra de máquina)",
    ],
  },
  "60-minutes": {
    familia: "realista",
    comando:
      "Estilo entrevista de revista, como o 60 Minutes: a conversa manda e a edição é sóbria. Fundo escuro, luz de contorno atrás de quem fala, plano e contraplano. Tarja de nome e assunto no terço inferior, limpa, com o filete na cor da marca; a frase forte vira citação entre aspas por alguns segundos; realce em quem está falando quando há duas pessoas; número grande só quando for a prova; fotos de apoio em fotografia documental de verdade, sem desenho. Cortes secos, sem trilha durante a fala, nada de efeito.",
    bloco:
      "Television news-magazine interview look: a dark seamless background, warm key light at 45 degrees, a subtle rim light on hair and shoulders, natural skin tones, moderate contrast, quiet and credible. Supporting images are documentary photographs of the person's world: offices, workshops, streets, hands and objects, available light, honest colour. Overlays are flat and restrained: a lower-third strap with the name and a thin brand-colour line, a quotation set in serif on black, a single large numeral when a figure is the proof. Avoid: dramatic colour grades, lens flare, illustration, paper, neon, fast cuts, emoji, stock smiles, text in images.",
    pecas:
      "Speaker name: lower-third strap, serif name, sans role. Speaker highlight: a soft light frame on who is talking. Quote: the sentence in serif between quotation marks, full width on black. Number: one large numeral with the source beneath. Window image: a straight photo panel with a thin frame. Title behind: not used; a topic strap instead. Timeline: a hairline with dated ticks. Map: a flat two-tone map with a dot. Subscribe: a quiet tag.",
    ritmo: "lento: 6 a 10 cortes por minuto, tarja de nome na primeira fala de cada pessoa, citação 4 a 7 s, elementos só quando a fala traz nome, número ou declaração",
    referencias: [
      "uglyhedgehog.com, a luz do 60 Minutes (fundo preto, contraluz de estúdio)",
      "documentary.org, Beyond the Talking Head (entrevista com duas câmeras, plano e contraplano)",
      "neewer.com, luz para entrevista de duas pessoas (key a 45 graus, fundo escuro flagueado)",
    ],
  },
  kurzgesagt: {
    familia: "traco",
    comando:
      "Estilo animação explicativa, como o Kurzgesagt: ilustração vetorial plana com formas arredondadas, degradês suaves e cores vivas da marca sobre fundo escuro, personagens simples sem rosto detalhado, ícones geométricos. Quando eu disser número, ele cresce grande e animado; quando eu explicar um processo, um infográfico se monta com setas e formas; quando eu comparar, dois lados em blocos de cor. Movimento contínuo de zoom e formas que se transformam, nada estático, nada de foto.",
    bloco:
      "Flat vector explainer illustration: rounded geometric shapes, clean edges, soft two-tone gradients inside each shape, no outlines or thin uniform outlines, subtle long shadows, a deep brand-dark background with vivid saturated accents from the brand palette, little glowing particles and stars for depth. Characters are simple rounded figures without detailed faces; objects are iconic and simplified; scenes are isometric or front-on with layered depth. Everything looks animated, never photographed. Avoid: photographs, realistic textures, paper grain, 3D render, neon tubes, text, gritty or dark moods.",
    pecas:
      "Number: giant rounded numerals counting up with a colour block behind. List and steps: icons in a row lighting one by one. Comparison: two colour panels with simple icons. Icon: a flat rounded symbol bouncing in beside the speaker. Title behind: rounded sans in a colour block. Map: a flat stylised map with rounded regions, the region popping up in the accent. Timeline: a curved line with rounded nodes. Quote: a rounded speech bubble. Window image: a flat illustration in a rounded card. Speaker name: a rounded pill. Subscribe: a bouncing flat button.",
    ritmo: "médio para rápido: um elemento a cada 5 a 8 s, cada um de 3 a 6 s, movimento contínuo; no corte, algo novo a cada 3 a 4 s",
    referencias: [
      "artsatmichigan.umich.edu, Simple, Bright, Beautiful: The Work of Kurzgesagt (formas arredondadas, cores vibrantes, degradê)",
      "midlibrary.io/styles/kurzgesagt (vocabulário: flat vector, gradient shading, geometric, layered)",
      "aquaproductions.tumblr.com, paleta Kurzgesagt (azul profundo, ciano, roxo, magenta, amarelo: aqui, substituída pela paleta da marca)",
    ],
  },
  "quadro-branco": {
    familia: "giz",
    comando:
      "Estilo quadro branco: fundo branco limpo e tudo que entra parece desenhado à mão com marcador, enquanto eu falo. Traço preto fino e uma cor da marca só para grifar; palavras-chave escritas à mão; setas, círculos e balões que se desenham; ícones de linha simples (lâmpada, engrenagem, pessoa); listas que aparecem item a item como se fossem escritas; números em traço de marcador; gráficos de barra desenhados; mapa como esboço de contorno quando eu falar de lugar. A mão apaga ou a câmera desliza para o lado para mudar de ideia. Sem foto, sem degradê.",
    bloco:
      "Whiteboard explainer look: a clean white board, black marker line art drawn by hand with slightly uneven strokes, visible marker texture, one brand colour used only for underlines, highlights and fills, simple line icons and stick-figure characters, hand-lettered labels, arrows and circles that appear as if being drawn. Flat, no shading, no photographs, generous empty white space, a faint marker shadow. Composition reads left to right like a lesson. Avoid: photographs, gradients, 3D, neon, paper grain, dark backgrounds, complex illustration, printed text.",
    pecas:
      "Title behind: hand-lettered marker capitals, drawn on. List and steps: items written one by one with a drawn check or number. Number: marker numerals with a drawn underline. Comparison: two drawn columns with a sketched bar. Icon: a line icon sketched in. Map: a contour sketch of the region with an X on the place. Timeline: a drawn line with ticks and years. Quote: a drawn speech bubble. Highlight caption: marker highlight in the brand colour. Speaker name: a hand-written tag. Zoom on point: a drawn circle with a push-in. Subscribe: a sketched button.",
    ritmo: "acompanha o desenho: um traço novo a cada 4 a 8 s, cada desenho fica 4 a 9 s; a tela limpa a cada ideia nova",
    referencias: [
      "truscribe.com, como construir whiteboard animation (todo desenho a serviço do ponto, ícones simples, metáforas visuais: lâmpada, engrenagem)",
      "link.springer.com, estudo sobre a mão que desenha (mais motivação do que empurrar o conteúdo pronto)",
      "b2w.tv, exemplos de whiteboard explainer 2026",
    ],
  },
  "ali-abdaal": {
    familia: "vidro",
    comando:
      "Estilo professor com imagens de apoio, como o Ali Abdaal: eu falando num ambiente claro e arrumado, cortes em salto, zoom leve de 10% nas ênfases. Texto didático: palavra-chave grande surge ao meu lado quando eu digo, título numerado por tópico, capítulos, lista que se monta item a item em cartão limpo, citação de livro em cartão com a capa ao lado, captura de tela em janela quando eu citar ferramenta. Imagem de apoio em foto clara e quente nos pontos concretos, B-roll curto nos momentos de ação. Visual limpo, claro, sem exagero.",
    bloco:
      "Bright productivity-YouTuber look: a tidy, well-lit room with daylight and warm practicals, soft shadows, clean surfaces, wood, plants, books and a desk setup, pastel-neutral palette with the brand accent on small objects. Supporting images are clean editorial photographs or simple flat illustrations of concrete things (a notebook, a timer, a laptop screen, a book stack), light and airy, slightly warm, shallow depth of field. Overlays are clean rounded cards and pop-up keywords in a friendly bold sans. Avoid: dark moody grades, heavy grain, paper collage, neon, 3D gloss, clutter, text in images.",
    pecas:
      "Keyword pop-up: a bold sans word beside the speaker, bouncing in. Title: a numbered topic card at the top. List and steps: a rounded card with items appearing one by one with a tick. Quote: a book quote in a card with the book cover beside it. Screen: a captured window with a soft shadow and a highlight box. Number: a bold numeral counting up in a card. Window image: a rounded photo card with a thin shadow. Map: a clean flat map card. Timeline: a horizontal card with dots. Speaker name: a rounded pill. Subscribe: a friendly rounded button.",
    ritmo: "15 a 25 cortes por minuto; palavra-chave 1,5 a 3 s; cartão de lista 5 a 9 s; B-roll de 2 a 4 s; zoom leve nas ênfases, nunca sem respiro",
    referencias: [
      "techbullion.com, Ali Abdaal video editing style (B-roll por ideia, tipografia explicativa, infográfico simples, sombra e animação sutil)",
      "writepanda.ai, Ali Abdaal Shorts medidos quadro a quadro (gráfico fixo no topo que muda a cada 3 a 8 s, quase sem corte de câmera)",
      "hitpaw.com, How to edit like Ali Abdaal (jump cuts, legendas, efeitos sonoros)",
    ],
  },
  lousa: {
    familia: "giz",
    comando:
      "Estilo Dan Martell, lousa de negócios: fundo quase preto com textura fina de linhas topográficas, diagramas e esquemas que se desenham em traço branco enquanto eu falo, setas, escadas, loops e fluxos; a palavra-chave sublinhada ou trocada para a cor da marca; nome do framework em itálico serifado elegante; passos numerados em blocos arredondados que acendem um a um; tabela de duas colunas com borda fina e brilho; barras verde e vermelha na comparação; anotações com linha tracejada ao meu redor; ícones das ferramentas que eu citar; cortes rápidos entre plano aberto e fechado. Energia de aula de negócios.",
    bloco:
      "Premium dark business-whiteboard look: near-black background with a subtle topographic contour-line texture, thin white hand-drawn diagram lines (loops, ladders, arrows, axes), rounded rectangles with thin brand-colour borders and a soft outer glow, numbered tiles with a brand-colour gradient, elegant white italic serif for concept names, bold white sans for titles with the key word in the brand colour, green and red used only for status bars. Supporting imagery is clean and dark: desk, laptop, glass office, product screens, with a cool rim light. Avoid: paper textures, photographs with warm clutter, cartoon, neon cyberpunk, saturated washes, text in images.",
    pecas:
      "Title behind: bold white sans with the key word in the brand colour. Diagram: white strokes drawing a loop, ladder or funnel with italic serif labels. Steps: numbered tiles lighting one by one. Number: a white numeral in a glowing rounded frame, counting. Comparison: two bars, green and red, no axis. Table: two columns with a thin glowing border. Concept: the framework name in italic serif floating beside the speaker. Highlight caption: a dark pill with the phrase, the key word underlined. Annotation: a dashed white line and bracket around the speaker. Map: a dark map with a glowing outline. Timeline: a glowing rule with tiles. Icon: a line icon of the tool cited. Subscribe: a glowing rounded button.",
    ritmo: "lousa cheia nos momentos de estrutura, 8 a 20 s cada; entre lousas, 20 a 60 s de fala limpa com no máximo uma anotação; legenda queimada só na frase de efeito",
    referencias: [
      "Dan Martell, Business is Hard Until You Build These Systems e How to Make Money Like The Top 0.001% (medição de 25/08, docs/overlays/BIBLIA-DE-ESTILO.md, sistema 2, quadros em docs/overlays/referencias/dan-martell)",
      "docs/overlays/referencias/dan-martell/bruno-0410 (quadros mandados pelo Bruno)",
    ],
  },
  ted: {
    familia: "minimalista",
    comando:
      "Estilo palestra de palco, como o TED: palco escuro, luz em quem fala, e a edição some. Nome e título na primeira fala, em letra limpa sem caixa; quando a ideia muda, um título curto centrado em tela escura; a frase-tese inteira em cartão discreto na área livre; slide pequeno ao lado com 2 a 4 itens que acendem quando eu os digo; citação em branco sobre preto; número grande só quando for a prova. Cortes entre câmeras, zoom lento de aproximação na ênfase. Nada de ícone, nada de efeito.",
    bloco:
      "Conference-stage look: a dark theatre, a warm spotlight on the speaker, a deep black background with a faint brand-colour glow, haze in the beams, the audience as soft bokeh. Supporting images are quiet and conceptual, photographed with a single light source on black: an object on a table, hands, a doorway, a window at night, lots of negative space. Overlays are typographic only: thin clean sans or serif in white on black, centred, generous margins, slow fades. Avoid: cluttered graphics, icons, paper, neon tubes, cartoon, saturated colour, fast cuts, text in images.",
    pecas:
      "Speaker name: white name and title lower-left, no box, long fade. Title: a short centred headline on black when the idea changes. Key phrase: the full thesis sentence in a quiet card in the free area. Slide: a small dark panel beside the speaker with 2 to 4 items lighting as spoken. Quote: white serif on black, centred. Number: one large thin numeral, slow count. Window image: a full-screen quiet insert with a slow push. Map: a dark minimal map with a glowing dot. Timeline: a thin white rule. Subscribe: a quiet text tag.",
    ritmo: "calmo: elementos a cada 20 a 40 s, cada um 4 a 8 s; o nome nos primeiros 10 s; o slide só quando a fala organiza em tópicos",
    referencias: [
      "blog.ted.com, Reinventing an iconic stage (o círculo vermelho virou anel de luz; palco escuro, luz no palestrante)",
      "erictnguyen.substack.com, On the Red Circle (a luz no rosto, a sala escura, a plateia como fundo)",
      "docs/estilos-de-edicao-de-video.md, ficha 10",
    ],
  },
  keynote: {
    familia: "minimalista",
    comando:
      "Estilo lançamento de produto, como o keynote da Apple: uma frase por tela, tipografia grande e fina, muito espaço vazio, fundo preto ou branco puro, cor só no produto e nos detalhes da marca. Cada recurso que eu disser vira um rótulo fino apontando para o produto; o número dito conta na tela, sozinho, gigante; a comparação é antes e depois lado a lado em silêncio; o produto gira em fundo infinito com luz de estúdio; macro de detalhe quando eu falar de acabamento. Cortes no tempo da música, rotações suaves, nenhuma câmera nervosa.",
    bloco:
      "Product-keynote look: a seamless pure black or pure white studio, the product alone, centred, floating or on a matte platform, crisp studio lighting with controlled specular highlights and soft reflections, matte and brushed materials, chamfered edges, macro detail shots with shallow focus, slow turntable rotation. Colour appears only on the product and in tiny brand accents; everything else is monochrome. Overlays are thin light sans typography with wide tracking, one sentence per screen, enormous negative space. Avoid: clutter, paper, grain, neon glow, cartoon, lens flare, handheld shake, stock people, text in images.",
    pecas:
      "Title: one thin sentence centred on black or white. Feature label: a hairline pointing from the product to a small label. Number: a giant thin numeral alone on screen, counting. Comparison: before and after side by side, no decoration. Window image: the product on black, slow rotation. Icon: a thin monoline glyph. List: features appearing one per screen. Map: a minimal dotted map with one point. Timeline: a thin rule with light ticks. Speaker name: a thin name, no box. Subscribe: a thin text tag.",
    ritmo: "preciso: cada tela tem um propósito, 5 a 10 s cada; silêncio antes da revelação; algo novo a cada 8 a 12 s",
    referencias: [
      "developer.apple.com, Keynote WWDC22 e WWDC23 (uma frase por tela, produto em estúdio, tipografia fina, espaço vazio)",
      "youmind.com, prompt Apple-style minimal cover para GPT Image 2 (preto fosco, plataforma cinza, vidro preto com reflexo, bordas chanfradas)",
      "wikipedia, Apple Inc. design motifs",
    ],
  },
  institucional: {
    familia: "realista",
    comando:
      "Estilo institucional cinematográfico: cenas de cinema do meu setor, pessoas reais trabalhando, câmera lenta, drone, luz quente de fim de tarde, grão fino de filme. Frases de valor em poucas palavras na tipografia da marca, centradas, em fusão lenta; o nome de quem fala em letra fina sem caixa; o número do resultado grande com a unidade pequena; a linha do tempo da empresa quando eu contar a história; logo só no fim. Montagem emocional com fusões, B-roll em vídeo sempre que eu narrar uma ação ou um lugar.",
    bloco:
      "Cinematic brand-film look: real people at real work, handheld but steady, anamorphic feel with gentle flares, warm golden-hour grade with soft contrast and fine film grain, slow motion on gestures and faces turned away, drone establishing shots of the site, interiors with window light and haze. Honest textures: tools, machines, fabric, screens, coffee, concrete. Overlays are sparse value statements in the brand typography, centred, with long dissolves; a thin name line; a large result numeral. Avoid: stock-photo smiles, posed handshakes, cold corporate blue, neon, cartoon, paper, clutter, text in images.",
    pecas:
      "Value phrase: a few words centred in the brand type, slow dissolve. Speaker name: thin white name and role, no box. Number: a large numeral with a small unit, slow count. Timeline: a hairline with years, revealed as the story moves. Window image: no window; a full-screen cinematic insert with a slow push. Quote: serif on a dark frame of the scene. Map: a dark terrain map with the site glowing. List: words appearing one at a time over the scene. Subscribe: a quiet tag.",
    ritmo: "médio e emocional: 10 a 16 cortes por minuto, frases de valor a cada 20 a 40 s por 4 a 7 s, B-roll de 3 a 5 s; nada que grite",
    referencias: [
      "theteam.co.uk, cinematic employer branding (história antes do polimento)",
      "herenow.film e studiobinder.com, melhores corporate videos (Microsoft AI culture film: câmera na mão, pessoas reais, sem polimento; Airbnb: grão e foco suave)",
      "docs/estilos-de-edicao-de-video.md, ficha 12",
    ],
  },
  depoimento: {
    familia: "realista",
    comando:
      "Estilo depoimento de cliente: quem grava fala para a câmera e a edição só prova o que foi dito. Tarja com nome, cargo e empresa na primeira fala, limpa, com filete na cor da marca; o resultado em número grande quando for dito, com o antes e o depois lado a lado se houver os dois; a frase forte vira citação por alguns segundos; imagens de apoio em fotografia real do negócio do cliente (a equipe trabalhando, o produto em uso), nunca cena genérica; B-roll em vídeo quando eu descrever a rotina. Cor natural, cortes secos, trilha baixa.",
    bloco:
      "Customer-testimonial look: an honest interview frame with soft window light, natural skin, a real office or shop softly blurred behind, warm neutral grade with modest contrast. Supporting images are documentary photographs of that specific business: the team at work, the product being used, the counter, the screen, the delivery, hands and details, available light, no posing. Overlays are flat and trustworthy: a lower-third strap with name, role and company, a large result numeral, a before-and-after pair, a quotation card. Avoid: stock models, fake smiles, dramatic grades, neon, cartoon, paper textures, clutter, text in images.",
    pecas:
      "Speaker name: a lower-third strap with name, role, company and a thin brand line. Number: a large result numeral with the label beneath. Comparison: before and after in two plain panels. Quote: the sentence between quotation marks in a card. Window image: a straight photo panel of the business. Highlight caption: a single underlined phrase. Timeline: a plain rule with milestones. Map: a flat map with the city marked. Subscribe: a plain tag.",
    ritmo: "a fala manda: tarja nos primeiros 5 s, número quando dito (4 a 7 s), B-roll de 3 a 5 s a cada 20 a 30 s; nunca mais de 25 s sem apoio",
    referencias: [
      "teraleap.io, 14 fixes para testimonial (nome e cargo no terço inferior; abrir com o resultado, não com apresentação)",
      "thoughtcastmedia.tv, produção de video testimonial (B-roll do cliente usando o produto como prova do que diz)",
      "contentbeta.com, 16 melhores testimonials de 2026",
    ],
  },
  vlog: {
    familia: "impacto",
    comando:
      "Estilo bastidor e vlog de fundador, como o Casey Neistat: a minha gravação é a estrela, cortes rápidos em salto, chicote de câmera entre lugares, timelapse para pular o tempo, zoom na fala. Palavras-chave grandes e grossas quando eu enfatizar; cartão de lugar e data com letra escrita à mão no canto; título do dia desenhado; lista do dia em cartão quando eu enumerar; o número dito em bloco. Cor vibrante e contrastada, energia de retenção, áudio direto. Nada de cenário trocado, nada de polimento demais.",
    bloco:
      "Founder-vlog look: handheld first-person footage, wide-angle lens, natural light with bright contrasty colour, saturated but true, slight motion blur and whip-pans, time-lapses of streets and skies, rough edges on purpose. Supporting images are candid phone-style and action-camera frames: the desk, the car, the airport, the team mid-work, a coffee on the dashboard, never posed. Overlays are bold black-and-white type blocks and hand-written notes for place and date, with a brand-colour accent. Avoid: studio polish, soft cinematic grades, paper collage, neon, cartoon, posed stock people, text in images.",
    pecas:
      "Keyword: a heavy bold word in a black or white block, punched in. Place and date card: hand-written on a small tag in the corner. Day title: a hand-drawn title over the opening shot. List: a plain bold card with items appearing on each cut. Number: a bold numeral in a block. Window image: a tilted snapshot with a thick white border. Map: a simple map with a hand-drawn route. Timeline: a scribbled line with times. Highlight caption: a bold underline. Speaker name: a hand-written tag. Subscribe: a bold hand-drawn arrow and button.",
    ritmo: "25 a 40 cortes por minuto, chicote e timelapse na troca de lugar; texto 1,5 a 3 s; algo novo a cada 3 a 5 s; o rosto e o lugar dominam",
    referencias: [
      "indepthcine.com, How Casey Neistat Changed Vlogging Forever (jump cuts como estilo, whip pan, timelapse, imperfeição de propósito)",
      "vloggingpro.com, Casey Neistat guide to filmmaking (títulos, marcadores de capítulo, stop motion feito à mão)",
      "docs/estilos-de-edicao-de-video.md, ficha 14",
    ],
  },
  podcast: {
    familia: "vidro",
    comando:
      "Estilo podcast em vídeo: a conversa manda, a edição organiza. Nome e função de cada pessoa na primeira vez que fala, numa tarja limpa de painel escuro com filete na cor da marca; realce em quem está falando quando há duas ou mais pessoas; título de capítulo quando o assunto muda; a frase forte vira citação em cartão nos cortes; o número dito em cartão ao lado; nada cobrindo rostos nem o microfone. Estúdio escuro com luz de destaque na cor da marca, legenda limpa. Visual tecnológico limpo, poucos elementos, zero efeito.",
    bloco:
      "Video-podcast studio look: a dark studio with a single brand-colour practical light in the background (an LED strip, a lamp), soft key light on faces, microphones and headphones in frame, shallow depth of field, cool neutral grade with warm skin. Supporting images are clean dark product or object shots and screen captures. Overlays are dark frosted panels with thin borders: name straps, chapter titles, quote cards, a number card, a soft light frame around who is speaking. Avoid: paper, cartoon, bright busy backgrounds, lens flare, saturated washes, emoji, text in images.",
    pecas:
      "Speaker name: a dark glass strap with name and role, thin brand line. Speaker highlight: a soft lit frame around the talking person. Chapter title: a centred glass card for 3 to 4 s. Quote: a glass card with the sentence and the name. Number: a glass card with a counting numeral. Window image: a rounded dark panel in the free area. List: a glass card with items. Map: a dark map card with a glowing dot. Timeline: a thin glass rule. Subscribe: a glass pill button.",
    ritmo: "acompanha quem fala: nome na primeira fala de cada um; capítulo a cada 3 a 8 min; citação e número só quando ditos (4 a 7 s); no corte, algo novo a cada 5 a 8 s",
    referencias: [
      "onreplay.com.au, Video Podcast Editing guide 2026 (troca por quem fala, terço inferior, título de tópico, molduras da marca)",
      "kometmedia.com, multicam podcast no Descript (nomes dos falantes, legenda no estilo da marca)",
      "docs/estilos-de-edicao-de-video.md, ficha 15",
    ],
  },
  mrbeast: {
    familia: "impacto",
    comando:
      "Estilo alta retenção, como o MrBeast: muito rápido, algo muda a cada segundo (corte, zoom, texto, som), legenda palavra a palavra grande com contorno, zoom de soco nas palavras fortes, cor saturada e contraste alto. A palavra da tese gigante atrás de mim; o número dito cresce explodindo na tela; contadores e setas grossas; emoji e ícone grande quando a fala citar algo concreto; a comparação em dois blocos de cor; B-roll de 1 a 2 s por ideia. Energia máxima, nenhuma pausa morta.",
    bloco:
      "High-retention viral look: bright, saturated, high-contrast colour that pops at feed size, punchy direct light, vivid brand accents, clean sharp detail. Supporting images are bold, simple and literal: one big object or action centred, exaggerated scale, bright backgrounds, confetti, stacks, arrows, a countdown feel. Overlays are heavy rounded bold type with thick outlines and drop shadows, word-by-word captions, giant numbers, big icons and emoji-style symbols, colour blocks. Avoid: muted or moody grades, paper, thin elegant type, slow fades, film grain, empty space, text in images.",
    pecas:
      "Title behind: giant heavy capitals with a thick outline, punched in with a shake. Number: a huge numeral exploding in with a counter. Icon: a big bold symbol popping beside the head. Comparison: two colour blocks with a cross and a check. List: bold items slamming in one per cut. Highlight caption: word-by-word caption, the key word in the brand colour. Window image: a bold framed photo with a thick white border, popping in. Map: a bright flat map with a big pin. Timeline: a bold bar filling up. Speaker name: a bold pill. Subscribe: a huge bouncing button.",
    ritmo: "40 a 60 cortes por minuto no auge, 25 a 40 em média; algo muda a cada 1 a 2 s; estímulo novo a cada 20 a 30 s; elementos de 1 a 3 s",
    referencias: [
      "vidpros.com, MrBeast editing style (cada segundo justifica a presença; estímulo novo a cada 20 a 30 s)",
      "sendshort.ai, How to edit short videos like MrBeast (23 a 38 cortes por minuto, Komika Axis nas legendas, cor saturada)",
      "washingtonpost.com, março de 2024: o próprio MrBeast desacelerou e pôs respiros entre as cenas",
    ],
  },
  hormozi: {
    familia: "impacto",
    comando:
      "Estilo corte com legenda dinâmica, como o Hormozi: legenda grande no centro, palavra a palavra, caixa alta em letra condensada pesada com contorno preto grosso, a palavra-chave da frase na cor da marca; zoom alternado entre plano médio e fechado a cada 1 a 3 s; emoji ou ícone pontual ao lado da palavra que ele amplifica; B-roll de 1 a 2 s por ideia; o número dito em bloco grande; a comparação em dois blocos com x e check. Contraste alto, energia de retenção, sem respiro morto.",
    bloco:
      "Short-form talking-head retention look: a clean contrasty frame, the speaker centred, a dark or plain background, crisp detail, bright but controlled colour. Supporting images are short literal illustrations of the idea: money, a clock, a handshake, a chart going up, a door, simple and bold, one subject, high contrast. Overlays are heavy condensed capitals with a thick black stroke and a soft shadow, the current word scaled up, the key word in the brand colour, occasional emoji-style icons, colour blocks for numbers. Avoid: soft cinematic grades, paper, elegant serif, slow fades, clutter, film grain, text in images.",
    pecas:
      "Highlight caption: 2 to 4 words at a time, centred, uppercase condensed, thick black stroke, the key word in the brand colour, each word popping with a bounce. Title behind: a condensed word stamped behind the speaker. Number: a bold numeral in a colour block. Comparison: two blocks with a red cross and a green check. Icon: a bold symbol stamped beside the word. List: bold items slamming in. Window image: a bold framed insert. Map: a flat bright map with a pin. Timeline: a bold bar. Speaker name: a bold pill. Subscribe: a bold bouncing button.",
    ritmo: "corte a cada 1 a 3 s, zoom alternado; legenda sempre; B-roll de 1 a 2 s; no curto, algo novo a cada 2 a 4 s",
    referencias: [
      "ascynd.io, Hormozi captions: fonte, cor e medidas (condensada pesada, caixa alta, contorno preto, palavra-chave em amarelo: aqui, na cor da marca)",
      "riverside.com, How to make Hormozi style videos (zoom de 10 a 20%, jump cuts a cada 1 a 3 s, emoji pontual)",
      "joyspace.ai, o estilo Hormozi em 2026",
    ],
  },
  consorcio: {
    familia: "luxo",
    comando:
      "Autoridade high ticket, luxo minimalista: a pessoa real falando desde o primeiro segundo, no escritório, no carro ou no evento, com a legenda grande em letra condensada no meio da tela, 1 a 4 palavras por vez. Preto profundo e a cor da marca como metal, pouquíssimo texto, muito respiro. A prova aparece quando é dita: o número em faixa de destaque, o selo com o meu nome, o cartão do comentário respondido; a palavra-tese gigante atrás de mim nos momentos centrais; transições lentas. Nada de dinheiro voando, carro de luxo genérico ou promessa.",
    bloco:
      "Premium authority look: deep matte black, elegant low-key lighting with a soft rim, the brand colour rendered as brushed metal or a thin metallic line, polished stone and dark wood surfaces, leather, glass, a city at night out of focus, lots of negative space. Supporting images are restrained and credible: a real office desk, a signed document, a car interior detail, a handshake seen as hands only, an event stage, never flying money or generic luxury cliches. Overlays are condensed uppercase type, a single word or number at a time, a metallic strip for the proof, a white seal with the name. Avoid: saturated colours, clutter, paper, cartoon, neon glow, fake gold sparkle, stock models, text in images.",
    pecas:
      "Caption: condensed uppercase, 1 to 4 words, mid-screen, never at the bottom. Title behind: one giant condensed word behind the speaker with depth. Number: the figure on a metallic brand-colour strip when it is spoken. Seal: a white seal with the speaker's name. Comment card: the comment being answered, in a quiet card. Comparison: two slim panels with a hairline. List: stacked slim steps lighting one by one. Window image: a slim framed insert with a metallic edge. Map: a dark map with a metallic dot. Timeline: a thin metallic rule. Subscribe: a slim metallic button.",
    ritmo: "Reels de 30 a 45 s rendem mais; fala desde o primeiro segundo; cena mediana de 7 s; a prova entra quando é dita (3 a 5 s); legenda sempre; no longo, um elemento a cada 10 a 15 s",
    referencias: [
      "Medição de 02/10/2026 em seis perfis de consórcio do Instagram, 163 posts e 18 Reels quadro a quadro (lib/media/biblias/consorcio.ts)",
      "303.london, Reels para marcas premium (texto mínimo, transições suaves, nada chamativo)",
      "filmora.wondershare.com, paletas preto e dourado (o peso do preto, o calor do metal)",
    ],
  },
  ugc: {
    familia: "impacto",
    comando:
      "Estilo nativo do TikTok, conteúdo de criador: gravação de celular em ambiente real, luz natural, câmera na mão, e a edição parece feita no próprio aplicativo. Legenda nativa grande no meio, até 8 palavras por vez; pergunta e resposta em texto na tela; print ou foto atrás de mim como tela verde quando eu comentar algo; seta e círculo quando eu apontar; emoji pontual; corte no gesto. Energia de retenção, poucos enfeites, zero polimento de estúdio.",
    bloco:
      "Native creator phone look: vertical 9:16 front-camera footage, natural indoor light, slight handheld shake, a real room with everyday clutter, true phone colour with mild oversharpening, no studio polish. Supporting images are screenshots, phone snapshots and casual product shots on a table, held in hand, slightly imperfect. Overlays are the platform's own look: rounded bold captions with a solid white or black background, big emoji-style icons, drawn arrows and circles, a green-screen style image pinned behind the speaker. Avoid: cinematic grades, film grain, paper collage, elegant serif, polished stock imagery, thin type, text in images.",
    pecas:
      "Caption: rounded bold words on a solid pill, mid-screen. Question card: the question as native text at the top, the answer below. Green screen: a screenshot or photo pinned behind the speaker. Pointer: a drawn arrow or circle on what is pointed at. Icon: a big emoji-style symbol. Number: a bold rounded numeral on a pill. List: native text lines appearing on each cut. Window image: a phone snapshot with rounded corners. Map: a phone-map screenshot with a pin. Timeline: not used; a text list instead. Speaker name: a native pill with the handle. Subscribe: a native follow button.",
    ritmo: "rápido: corte no gesto a cada 2 a 4 s, legenda sempre, print atrás por 4 a 8 s; vídeo de 7 a 60 s",
    referencias: [
      "fluxnote.io, How to create UGC style videos for ads 2026 (celular na mão, luz natural, enquadramento imperfeito, legenda com menos de 8 palavras)",
      "videoselz.com, Top 12 UGC video styles (tela verde, pergunta e resposta, reação)",
      "docs/estilos-de-edicao-de-video.md, ficha 18",
    ],
  },
  tipografia: {
    familia: "impacto",
    comando:
      "Estilo tipografia animada: o texto é o vídeo. As palavras entram no ritmo da minha voz, crescem, giram e se transformam na próxima, em letra grossa e pesada, 2 a 3 cores da marca em alto contraste, formas geométricas simples de apoio; cartelas de texto entre as falas com a frase inteira; o número dito cresce sozinho gigante; a palavra forte explode atrás de mim. Fundo chapado ou abstrato, nenhuma foto, nenhum ícone além das formas. Energia de impacto.",
    bloco:
      "Kinetic-typography look: a flat solid background in the brand dark or the brand accent, heavy geometric sans type in black or white, two or three brand colours at high contrast, simple geometric shapes (bars, circles, lines) as the only decoration, hard edges, no photographs, no textures. Motion is the content: words scale, rotate, slide and morph in sync with the voice, landing on beats. If a supporting image is needed it is an abstract geometric composition in the same colours. Avoid: photographs, gradients, paper, 3D, neon glow, cartoon characters, thin script, clutter, text in images.",
    pecas:
      "Title behind: a giant heavy word bursting behind the speaker. Text card: the full sentence on a solid card between speech, words landing one by one. Number: a giant numeral growing alone on a colour field. List: words stacking in rhythm. Comparison: two colour halves with the two words. Highlight caption: the spoken word scaling up in the accent. Icon: a geometric shape only. Window image: a geometric frame around a flat image. Map: a dotted geometric map. Timeline: a bold bar with word markers. Speaker name: a solid bar with the name. Subscribe: a solid bouncing block.",
    ritmo: "acompanha cada sílaba: palavra a cada 0,3 a 0,8 s, cartela a cada 5 a 8 s por 2 a 4 s; o texto nunca fica parado mais de 1 s",
    referencias: [
      "ikagency.com, Kinetic Typography complete guide 2026 (tempo, escala, rotação, pausa entre palavras, legível por 0,5 s)",
      "trydemotion.com, kinetic typography secrets (posição, escala, rotação e opacidade combinadas numa camada)",
      "moonb.io, 6 exemplos de tipografia cinética em vídeo de marca",
    ],
  },
  "carrossel-animado": {
    familia: "minimalista",
    comando:
      "Estilo carrossel animado: uma ideia por vez em cartelas limpas na cor da marca, como lâminas que deslizam de lado, com leve zoom dentro de cada uma e barra de progresso no topo. Título curto em cada cartela, número grande quando eu disser dado, lista com um item por cartela, antes e depois em duas cartelas seguidas, ícone de linha simples quando couber. Transição de deslize, nada de efeito, pouquíssima imagem, só onde a fala pedir.",
    bloco:
      "Animated-carousel look: flat solid slides in the brand dark, light and accent, one idea per slide, a short title, generous margins, a progress bar at the top, thin line icons, clean geometric sans, soft rounded corners, subtle slide-and-zoom motion between cards. If an image is needed it is a clean editorial photograph on a flat colour field with lots of space around it. Avoid: busy backgrounds, paper, neon, cartoon characters, 3D, grain, more than one idea per slide, text in images.",
    pecas:
      "Slide card: a flat colour card with a short title, sliding in from the right. Number: a large numeral alone on a card. List: one item per card, the counter at the top. Comparison: two cards in sequence labelled before and after. Icon: a thin line icon above the title. Title behind: not used; a card instead. Window image: a photo inside a rounded card. Map: a flat dotted map card. Timeline: cards in sequence with the year. Speaker name: a small pill on the card. Subscribe: the last card with a button.",
    ritmo: "uma ideia a cada 3 a 5 s, cada cartela 3 a 5 s, deslize de 0,4 s; vídeo de 15 a 45 s",
    referencias: [
      "framer.com, Reel Carousel (lâmina em altura cheia, barra de progresso animada no topo, deslize)",
      "yoursocial.team, carrosséis hold and scroll (mudança pequena entre lâminas, como stop motion)",
      "docs/estilos-de-edicao-de-video.md, ficha 20",
    ],
  },
  "wes-anderson": {
    familia: "papel",
    comando:
      "Estilo simetria e cor pastel, como o Wes Anderson: tudo centrado e simétrico, câmera parada ou deslizando de lado em 90 graus, tons pastel derivados da marca, cenários como maquete. Títulos centrados em letra clássica geométrica; capítulos numerados em cartela; colagem de objetos recortados e fotos de arquivo em tons suaves, dispostas como vitrine; o número dito em cartão centrado; letreiro de loja quando eu falar de lugar; linha do tempo como prateleira. Movimentos lentos, compostos, com personalidade.",
    bloco:
      "Symmetrical pastel film look: perfectly centred, frontal compositions, flat even lighting, a muted pastel palette derived from the brand colours (dusty pink, mustard, mint, powder blue, cream), vintage production design with painted walls, miniature-model sets, period props arranged like a display case, deadpan stillness. Supporting images are tableau-style still lifes and facades, straight-on, everything aligned to a grid, slight film softness. Overlays are classic geometric sans or serif titles, centred, in cream on a pastel field, numbered chapter cards, shop-sign lettering. Avoid: handheld shake, dramatic shadows, saturated neon, modern glass UI, clutter, asymmetry, text in images.",
    pecas:
      "Title: centred classic type on a pastel card. Chapter card: a numbered centred card. Collage: objects and archive photos laid out symmetrically like a display window. Number: a centred numeral in a pastel frame. List: items in a symmetric column. Map: a pastel vintage map, centred, the place circled. Timeline: a shelf-like line with evenly spaced cards. Quote: centred serif on cream. Window image: a photo in a symmetric pastel frame. Speaker name: a centred label. Subscribe: a small centred sign.",
    ritmo: "lento e composto: um elemento a cada 10 a 20 s, cada um 4 a 8 s, pan lateral de 90 graus na troca de ideia",
    referencias: [
      "pastemagazine.com, What AI misunderstands about Wes Anderson (simetria, pastel, tableau, kitsch, deadpan)",
      "kling.ai, director style prompts Wes Anderson (centered composition, pastel palette with primary accents, flat lighting, retro production design)",
      "openart.ai, Midjourney prompts for Wes Anderson (nomear os tons exatos: mostarda, rosa pastel, ciano suave)",
    ],
  },
  vhs: {
    familia: "impacto",
    comando:
      "Estilo retrô e VHS: edição de impacto com clima de fita antiga. Linhas de varredura, grão, cores desbotadas puxando para magenta e ciano, bordas arredondadas de TV, data e hora no canto em letra de videocassete, indicador REC; falha digital curta na virada; rebobinar como transição. Palavras grandes em letra de computador antigo; o número dito em contador de fita; as imagens de apoio em clima nostálgico, como fotos de álbum dos anos 80 e 90 passadas pela fita. Nostalgia, aniversário de marca, antigamente era assim.",
    bloco:
      "Retro VHS look: footage as if played from a worn videotape: soft focus, horizontal scanlines, chroma bleed with red and blue channel fringing, tracking noise bands near the bottom, faded contrast with lifted blacks, a magenta and cyan cast, rounded CRT corners, a timestamp and REC indicator feel, an occasional glitch. Supporting images look like 1980s and 1990s album snapshots and camcorder frames: flash-lit rooms, wood panelling, old monitors, cassette tapes, denim, neon signs softened by the tape. Overlays are blocky computer or VCR type in white or the brand colour with a glow bleed. Avoid: clean 4K sharpness, modern flat UI, paper collage, elegant serif, perfect colour, text in images.",
    pecas:
      "Title behind: blocky VCR capitals with chroma fringing. Timestamp: date and time in the corner in VCR type. Number: a tape-counter numeral rolling. List: lines typed in a blocky font with a blinking cursor. Comparison: two tape frames side by side. Glitch: a short tear on the reveal. Window image: a snapshot with rounded CRT corners and scanlines. Map: a scanline map with a blinking dot. Timeline: a tape ruler. Highlight caption: a blocky word with a glow bleed. Speaker name: VCR type in the lower corner. Subscribe: a blinking REC-style tag.",
    ritmo: "médio: elementos a cada 6 a 10 s, 2 a 5 s cada, falha só na virada, rebobinar na troca de bloco",
    referencias: [
      "glitchart.studio, The VHS glitch aesthetic explained (tracking, aberração cromática, scanlines, color bleed)",
      "borisfx.com, VHS effect no After Effects e no DaVinci (canais RGB deslocados, ruído, Wave Warp, timecode de VCR)",
      "docs/estilos-de-edicao-de-video.md, ficha 22",
    ],
  },
  minimalista: {
    familia: "minimalista",
    comando:
      "Estilo minimalista corporativo: visual limpo e neutro, títulos curtos em letra sem serifa com bastante espaço, ícones de linha fina, gráficos simples na cor da marca. O número dito aparece grande e sozinho; a lista em cartões brancos lado a lado; a comparação em duas colunas limpas; as etapas em linha; imagem de apoio em foto de escritório e de telas em plano limpo, poucas; B-roll só onde a fala pedir movimento. Deslizes suaves, nada de efeito, B2B e relatório.",
    bloco:
      "Minimalist corporate look: light neutral backgrounds (off-white, pale grey), clean geometric sans typography, thin line icons, flat charts in the brand colour, generous negative space, soft even light. Supporting images are calm editorial photographs of modern offices, screens, hands on keyboards, meeting rooms and architecture, neutral tones with one brand accent, shallow depth of field, anonymous people or none. Avoid: clutter, paper textures, neon, cartoon, dramatic grades, saturated washes, stock handshakes and smiles, text in images.",
    pecas:
      "Title: a short sans headline with wide margins. Number: one large numeral alone, counting. List: white cards side by side. Comparison: two clean columns with a hairline. Steps: a horizontal line with numbered dots. Icon: a thin line icon. Window image: a photo in a thin-framed panel. Map: a pale flat map with one accent dot. Timeline: a thin rule with ticks. Quote: a sans quotation on a white field. Speaker name: a thin label. Subscribe: a thin outlined button.",
    ritmo: "médio e limpo: um elemento a cada 8 a 12 s, 4 a 7 s cada, deslize suave; a pessoa e os dados dividem a tela",
    referencias: [
      "contentbeta.com, Top 10 motion graphics styles for SaaS 2026 (minimalismo com linhas finas e paleta limitada)",
      "fontfabric.com, tendências de tipografia 2026 (minimalismo gráfico intencional, espaço aberto)",
      "docs/estilos-de-edicao-de-video.md, ficha 23",
    ],
  },
  "tela-dividida": {
    familia: "impacto",
    comando:
      "Estilo tela dividida e reação: eu numa metade e o conteúdo que comento na outra (print, foto, vídeo), com moldura e rótulo em cada lado; antes e depois lado a lado com x e check na cor da marca; a comparação de números em duas colunas; seta e círculo apontando o que eu comento; zoom no ponto quando eu disser olha isso; legenda da fala grande. Cortes secos, energia de impacto, cor natural.",
    bloco:
      "Split-screen reaction look: two panels divided by a clean hard seam, the same scale on both sides, labels on each panel, a thin brand-colour frame, high clarity, natural true colour on the speaker side. Supporting images are literal: screenshots, product photos, a before-and-after pair of the same subject framed identically, charts. Overlays are bold labels, a red cross and a green check, drawn arrows and circles, a magnifier-style zoom box. Avoid: cinematic grades, paper, cartoon, neon glow, mismatched scales, clutter, text in images.",
    pecas:
      "Split: the speaker on one half, the content on the other, each with a label strap. Comparison: before and after panels with a cross and a check. Number: two columns of numerals. Pointer: a drawn arrow or circle on the content panel. Zoom on point: a framed magnifier push-in. Highlight caption: a bold caption across the seam. Window image: the content panel itself. Map: a map in the content panel with a pin. Timeline: a bar under the content panel. Speaker name: a label strap. Subscribe: a bold button on the speaker side.",
    ritmo: "rápido: corte a cada 3 a 6 s, o painel de conteúdo fica 5 a 12 s, seta e círculo quando a fala aponta; legenda sempre no curto",
    referencias: [
      "shortgenius.com, split screen editing for short-form (dois painéis, rótulo em cada lado, escala igual)",
      "aicut.pro, layouts de tela dividida no TikTok (vertical: um painel em cima do outro; antes e depois)",
      "docs/estilos-de-edicao-de-video.md, ficha 24",
    ],
  },
};

/** A ficha de linguagem de um estilo do catálogo; undefined quando o id não existe. */
export function linguagemDoEstilo(id: string | null | undefined): LinguagemDoEstilo | undefined {
  return id ? LINGUAGEM_DOS_ESTILOS[id] : undefined;
}

/** Os estilos de bíblia completa, para a ordem das miniaturas (depois dos de destaque). */
const COM_BIBLIA_COMPLETA = new Set(["vox", "lousa", "consorcio", "keynote", "hormozi", "mrbeast", "bbc"]);

/** A letra que combina com o estilo (a do tema do editor). */
export function fonteDoEstilo(e: EstiloDoCatalogo): FonteDoComando {
  if (e.id === "consorcio" || e.id === "johnny-harris" || e.id === "crime-real") return "oswald";
  if (e.kit === "impacto") return "archivo";
  if (["vox", "bbc", "natgeo", "60-minutes", "wes-anderson", "depoimento", "institucional"].includes(e.id) || e.kit === "colagem") return "playfair";
  return "geist";
}

/** O nome da cor em português, para o cliente ler o comando (aproximado pelo matiz e pela luz). */
export function nomeDaCor(hex: string): string {
  const { l, s } = medidaDaCor(hex);
  const h = matiz(hex);
  if (l < 0.12) return "preto";
  if (l > 0.93) return "branco";
  if (s < 0.14) return l < 0.35 ? "grafite" : l > 0.75 ? "cinza claro" : "cinza";
  const base =
    h < 15 || h >= 345 ? (l < 0.3 ? "vinho" : "vermelho") :
    h < 40 ? (l < 0.3 ? "marrom" : "laranja") :
    h < 65 ? (l < 0.45 ? "dourado" : l > 0.8 ? "creme" : "amarelo") :
    h < 160 ? (l < 0.3 ? "verde-escuro" : "verde") :
    h < 200 ? (l < 0.3 ? "petróleo" : "verde-água") :
    h < 250 ? (l < 0.3 ? "azul-marinho" : "azul") :
    h < 290 ? "roxo" : "rosa";
  return l > 0.78 && !["creme", "branco"].includes(base) ? `${base} claro` : base;
}

function matiz(hex: string): number {
  const f = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const RITMO_DA_BASE: Record<string, string> = {
  acelerado: "ritmo rápido, algo novo a cada 3 a 5 segundos",
  dramatico: "ritmo calmo, com respiro entre um elemento e outro",
  serio: "ritmo médio, algo novo a cada 6 a 10 segundos",
  animado: "ritmo médio para rápido",
};

const MUITO_VIDEO = ["natgeo", "institucional", "depoimento", "crime-real", "vlog", "johnny-harris", "60-minutes"];
const POUCO_VIDEO = ["minimalista", "keynote", "tipografia", "carrossel-animado", "podcast", "quadro-branco", "kurzgesagt"];

/** O que a marca tem, para o comando: a hierarquia das cores com o nome e o hex. */
export function coresNoComando(paleta: string[]): string {
  const p = papeisDaPaleta(paleta);
  if (!p) return "";
  const partes = [`${nomeDaCor(p.destaque)} (${p.destaque}) como destaque, só nos detalhes`, p.escuro ? `${nomeDaCor(p.escuro)} (${p.escuro}) nos títulos e textos` : "", p.claro ? `${nomeDaCor(p.claro)} (${p.claro}) nos fundos claros` : ""].filter(Boolean);
  return `Cores da minha marca: ${partes.join(", ")}${p.apoio.length ? "; as outras cores só de apoio" : ""}.`;
}

export type ContextoDoProjetoNoComando = { paleta: string[]; nicho?: string | null; publico?: string | null; nome?: string | null };

/** O nicho em uma frase curta (a primeira do setup). */
function nichoCurto(t: string | null | undefined): string {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const primeira = s.split(/(?<=[.!?])\s/)[0];
  return primeira.length > 170 ? `${primeira.slice(0, 167).replace(/\s+\S*$/, "")}...` : primeira.replace(/[.!?]$/, "");
}

/** O COMANDO preenchido pelo clique na miniatura: a linguagem pesquisada do estilo, as cores, o nicho e a sugestão de ritmo. Cabe nos 1500 da tela. */
export function comandoDoEstilo(id: string, ctx: ContextoDoProjetoNoComando): string {
  const e = estiloDoCatalogo(id);
  if (!e) return "";
  const ficha = LINGUAGEM_DOS_ESTILOS[e.id];
  const linguagem = ficha ? ficha.comando.replace(/\.$/, "") : `Estilo ${e.nome}${e.referencia ? ` (${e.referencia})` : ""}: ${e.resumo.charAt(0).toLowerCase()}${e.resumo.slice(1).replace(/\.$/, "")}`;
  const nicho = nichoCurto(ctx.nicho);
  const publico = nichoCurto(ctx.publico);
  const video = MUITO_VIDEO.includes(e.id) ? "B-roll em vídeo gerado sempre que eu narrar uma ação ou um lugar" : POUCO_VIDEO.includes(e.id) ? "pouco vídeo gerado, só onde a fala pedir movimento" : "B-roll em vídeo nos momentos que pedirem movimento";
  const efeito = e.base === "acelerado" ? "zoom de soco nas palavras fortes" : e.base === "dramatico" ? "movimentos lentos e transições suaves" : "zoom leve nas palavras fortes";
  const ritmo = ficha?.ritmo ?? RITMO_DA_BASE[e.base] ?? RITMO_DA_BASE.serio;
  return [
    `${linguagem}.`,
    coresNoComando(ctx.paleta),
    nicho ? `O canal é sobre ${nicho.charAt(0).toLowerCase()}${nicho.slice(1)}${publico ? `, para ${publico.charAt(0).toLowerCase()}${publico.slice(1)}` : ""}: as imagens e as cenas mostram o mundo desse público, nunca imagem genérica.` : "",
    `Como sugestão, sem lista fechada: ${ritmo}; ${video}; ${efeito}. Onde a fala pedir outra coisa, pode usar outro tipo de elemento, e a pessoa sozinha também vale.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** As miniaturas na ordem da tela: os estilos em destaque primeiro, depois os de bíblia completa, depois o resto. */
export function miniaturasDosEstilos(): Array<{ id: string; nome: string; referencia?: string; arte: string; destaque: boolean; fonte: FonteDoComando }> {
  const peso = (e: EstiloDoCatalogo) => (e.destaque ? 0 : COM_BIBLIA_COMPLETA.has(e.id) ? 1 : 2);
  return [...CATALOGO_DE_ESTILOS]
    .sort((a, b) => peso(a) - peso(b))
    .map((e) => ({ id: e.id, nome: e.nome, referencia: e.referencia, arte: arteDoEstilo(e.id), destaque: Boolean(e.destaque), fonte: fonteDoEstilo(e) }));
}
