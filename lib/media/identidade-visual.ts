import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";
import { lerMidia } from "@/lib/media/storage";
import { familiaDaLinguagem, type CoresDaMarca, type FamiliaDaCapa } from "@/lib/media/capa-composta";
import { linguagemDoProjeto } from "@/lib/media/direcao-de-arte";
import { papeisDaPaleta } from "@/lib/media/papeis-da-paleta";
import { regrasAprovadas } from "@/lib/referencias/regras";

/**
 * A IDENTIDADE VISUAL DE CADA PROJETO, de onde toda arte nasce (01/10/2026).
 *
 * Existe por causa da queixa do Bruno em 01/10: "todas as artes que gerou até
 * agora estão iguais, está replicando tudo igual para Areticon, Demandou e
 * Empreendedorismo Cristão". Medido no banco, as três tinham a mesma arte por
 * quatro motivos que se somavam:
 *
 *   1. A MESMA PALETA. Os quatro projetos do banco tinham "#F97316,#1e1f22,
 *      #dbdee1", que é o laranja da própria Demandou e o padrão que a tela de
 *      configuração preenche e grava (configuracao-do-projeto.tsx e
 *      kanban-board.tsx). Ninguém escolheu essa cor: ela era o vazio. A
 *      igreja e a empresa de energia saíam com a marca da Demandou.
 *   2. A MESMA FAMÍLIA. A composição em código tinha três famílias, e
 *      `familiaDaLinguagem` devolve "impacto" para Hormozi, MrBeast e para
 *      quem não escolheu nada. Os três projetos caíam em "impacto": fundo
 *      carvão, letra Anton branca em caixa alta, palavra num bloco laranja,
 *      arte embaixo dissolvendo no escuro.
 *   3. A MESMA CENA. A cena era escrita só com a frase e o nicho, sob as
 *      regras "sem gente, sem tela, sem documento, fundo escuro sumindo no
 *      preto". O que sobra disso é sempre a natureza-morta de mesa de madeira
 *      com luminária, livro aberto e lampião, fosse curtailment ou evangelho.
 *   4. A MESMA LETRA. Uma fonte para todos, sem olhar o manual nem o setor.
 *
 * O que este arquivo decide, para QUALQUER cliente (do consultório ao
 * escritório de advocacia):
 *
 *   - AS CORES, nesta ordem: a paleta da configuração quando o cliente de fato
 *     escolheu (diferente do padrão da plataforma); senão os códigos de cor do
 *     manual da marca; senão as cores tiradas do logo; senão a paleta do setor.
 *     O banco não é alterado: a paleta efetiva é calculada a cada arte, e a
 *     origem vai junto para a tela poder dizer "sugerida, confirme".
 *   - O SETOR, lido do nicho, do nome e do público, sem chamada paga: ele traz
 *     o mundo do cliente (cenários e objetos), a luz, o que nunca aparece, a
 *     tipografia e a família de composição de quem não escolheu linguagem.
 *   - A FAMÍLIA, respeitando a escolha: a linguagem do vídeo escolhida pelo
 *     cliente manda; sem escolha, vale a do setor (consultório não é pôster de
 *     agência).
 *   - A TIPOGRAFIA: o que o manual disser; senão a do setor.
 */

/** As famílias da arte parada: as três da capa e a "claro", só da arte. */
export type FamiliaDaArte = FamiliaDaCapa | "claro";

/** As três letras que temos no repositório (licença OFL, lib/media/fontes-da-capa). */
export type Tipografia = "condensada" | "serifada" | "sem-serifa";

/** O padrão do formulário, que é a marca da Demandou e não do cliente. */
export const PALETA_PADRAO_DA_PLATAFORMA = "#F97316,#1e1f22,#dbdee1";

export interface SetorVisual {
  id: string;
  nome: string;
  /** Palavras (sem acento, minúsculas) que denunciam o setor no nicho, nome e público. */
  palavras: RegExp;
  /** Peso de desempate: setor específico ganha do genérico ("negócios"). */
  peso: number;
  cores: CoresDaMarca;
  familia: FamiliaDaArte;
  tipografia: Tipografia;
  /** Em inglês: lugares, objetos e materiais do mundo do cliente. Sem ponto final no meio (ver lookSemTexto). */
  mundo: string;
  /** Em inglês: luz e clima. */
  luz: string;
  /** Em inglês: o que não pode aparecer, para não parecer outro tipo de negócio. */
  evitar: string;
  /** Em inglês: a direção de arte de quem não escolheu estilo nenhum. */
  estilo: string;
}

/**
 * Os setores. A lista não precisa ser completa, precisa ser DIFERENTE entre
 * si: o genérico ("negocios") fica por último e com peso menor, e é a rede
 * para quem não se encaixa em nenhum.
 */
export const SETORES: SetorVisual[] = [
  {
    id: "saude",
    nome: "saúde",
    palavras: /\b(medic\w*|clinica\w*|consultorio\w*|saude|hospital\w*|odonto\w*|dentist\w*|fisioterap\w*|nutri(cao|cionista)\w*|psicolog\w*|psiquiat\w*|terapi\w*|enfermag\w*|pediatr\w*|cardiolog\w*|dermatolog\w*|ortoped\w*|exame\w*|paciente\w*|check-?up|veterinar\w*)\b/,
    peso: 1.3,
    cores: { acento: "#0E8C8C", escuro: "#123B4A", claro: "#F3F8F8" },
    familia: "claro",
    tipografia: "sem-serifa",
    mundo:
      "a bright, spotless consultation room, a stethoscope resting on crisp folded linen, medical instruments neatly lined on a white tray, a glass of water and a small green plant by a window, an empty examination bed with fresh paper, a wall-mounted blood pressure gauge, an anatomical model of a heart or spine, clean pharmacy shelves with unlabeled bottles",
    luz: "soft, even daylight, airy and calm, cool clean whites with gentle shadows, reassuring and hygienic",
    evitar: "dramatic dark moody lighting, neon, fire, megaphones, rockets, social media icons, anything that looks like a marketing agency or a startup",
    estilo:
      "Clean healthcare editorial photography: bright, calm and trustworthy, soft daylight, white and pale surfaces, precise and uncluttered composition, a single clear subject, gentle depth of field.",
  },
  {
    id: "juridico",
    nome: "jurídico",
    palavras: /\b(advoga\w*|advocacia|juridic\w*|direito\w*|tribuna\w*|oab|contrat\w*|trabalhist\w*|tributari\w*|sucess(ao|oes|orio)|inventario\w*|heranca\w*|divorcio\w*|processo\w*|lei|leis|juiz\w*|cartorio\w*|notari\w*)\b/,
    peso: 1.3,
    cores: { acento: "#B08D57", escuro: "#16233B", claro: "#F5F1E8" },
    familia: "sobrio",
    tipografia: "serifada",
    mundo:
      "a law library with tall shelves of bound volumes with plain spines, brass scales of justice on a walnut desk, a wooden gavel, a fountain pen on a leather desk pad, sealed envelopes with a wax seal, marble columns of a courthouse, a classic office with tall windows and heavy curtains, a closed briefcase",
    luz: "warm, controlled side light, deep shadows, rich wood and leather tones, serious and dignified",
    evitar: "playful or cartoon look, neon, bright saturated pop colors, startup or marketing props, casual clutter",
    estilo:
      "Classic, restrained editorial photography of a law practice: dignified composition, deep navy and ivory tones with a touch of brass, warm side light, timeless materials (wood, leather, marble, paper), no gimmicks.",
  },
  {
    id: "fe",
    nome: "fé e igreja",
    palavras: /\b(igreja\w*|crista\w*|cristao\w*|crist(o|ianismo)|fe|deus|biblia\w*|biblic\w*|evangel\w*|ministerio\w*|pastor\w*|gospel|catolic\w*|paroquia\w*|culto\w*|sermao|sermoes|oracao|louvor|jesus|reino)\b/,
    peso: 1.4,
    cores: { acento: "#C8963E", escuro: "#2A2119", claro: "#F4ECDF" },
    familia: "sobrio",
    tipografia: "serifada",
    mundo:
      "an old wooden fishing boat resting on the shore of a calm lake at dawn, fishing nets drying on a post, a simple stone chapel among hills, morning light through a plain window onto a worn wooden bench, olive branches, a loaf of bread and a clay jar, a path through a golden wheat field, a small shop door opening at sunrise, a carpenter's workbench with hand tools",
    luz: "warm golden-hour light, hopeful and quiet, earthy tones, soft haze",
    evitar: "kitsch religious clip art, glowing crosses, neon, dark horror mood, stock-photo hands raised, corporate office cliches",
    estilo:
      "Warm, contemplative documentary photography: golden natural light, earthy textures (wood, stone, linen, bread, water), wide breathing compositions, hopeful and grounded, never kitsch.",
  },
  {
    id: "energia",
    nome: "energia",
    palavras: /\b(energia\w*|solar\w*|eolic\w*|renovave\w*|curtailment|usina\w*|geracao|geradora\w*|eletric\w*|transmissao|subestac\w*|aneel|ons|ccee|megawatt\w*|fotovolta\w*|hidreletric\w*|bess|bateria\w*)\b/,
    peso: 1.3,
    cores: { acento: "#F2B33D", escuro: "#0D2A3F", claro: "#EEF3F6" },
    familia: "sobrio",
    tipografia: "sem-serifa",
    mundo:
      "rows of solar panels stretching across a dry plain, wind turbines on a ridge, high-voltage transmission towers and power lines against a wide sky, a substation with transformers and insulators, close-up of cables and connectors, an aerial view of a solar farm, a meteorological mast, a control room cabinet with indicator lights",
    luz: "clear, crisp daylight or blue hour, big sky, technical precision, clean industrial tones",
    evitar: "fantasy sci-fi effects, glowing magic circles, fire, cozy desk props, marketing agency cliches",
    estilo:
      "Precise industrial and aerial photography of energy infrastructure: wide skies, geometric rows and lines, crisp light, engineering-grade clarity, calm and credible.",
  },
  // CONSÓRCIO (02/10, Gaberlini Consórcios): antes caía em "finanças", que é o
  // mundo do investidor (moedas, cofre, gráfico). O vendedor de consórcio vive
  // de outra coisa: o bem conquistado (a chave da casa, do carro), o contrato
  // assinado, a mesa de atendimento. E tem guarda própria de regulação (Banco
  // Central), em lib/media/perfil-do-projeto.ts. Peso maior que finanças: a
  // palavra "consórcio" casa nos dois, e aqui o específico ganha.
  {
    id: "consorcio",
    nome: "consórcio",
    palavras: /\b(consorc\w*|contempla\w*|carta de credito|cartas de credito|administradora de consorcio\w*)\b/,
    peso: 1.5,
    cores: { acento: "#D62839", escuro: "#14213D", claro: "#F5F3EE" },
    familia: "impacto",
    tipografia: "condensada",
    mundo:
      "a set of new house keys on a wooden desk next to a signed contract and a pen, car keys resting on a closed folder, a bright modern sales office with a meeting table and two empty chairs, a small house model beside a calculator, a calendar on a desk, a neat folder of documents with no readable text, the front door of a new house in daylight, a parked new car in a clean showroom without logos",
    luz: "clean bright daylight, warm and confident, credible and real",
    evitar: "piles of cash, money flying, gold bars, luxury sports cars, yachts, mansions, casino or lottery imagery, neon, dark dramatic mood, anything that looks like a get-rich-quick ad",
    estilo:
      "Credible real-life business photography: bright natural light, the concrete good being acquired (keys, house, car) and the paperwork of a real deal, warm and trustworthy, never flashy.",
  },
  {
    id: "financas",
    nome: "finanças",
    palavras: /\b(financ\w*|contab\w*|investiment\w*|banco\w*|credito\w*|consorcio\w*|seguro\w*|seguradora\w*|imposto\w*|fiscal\w*|patrimoni\w*|previdencia\w*|planejamento financeiro)\b/,
    peso: 1.2,
    cores: { acento: "#1F8A5B", escuro: "#10212E", claro: "#F2F5F1" },
    familia: "claro",
    tipografia: "sem-serifa",
    mundo:
      "neatly stacked coins, a closed ledger and a calculator on a clean desk, a glass office facade reflecting the sky, a small plant growing from a jar of coins, a safe deposit box, keys on a table, a house model, a piggy bank on a shelf",
    luz: "clean, bright and balanced light, orderly and reassuring",
    evitar: "piles of cash, gambling imagery, neon, dark dramatic mood",
    estilo:
      "Clean, orderly editorial photography: balanced composition, bright neutral surfaces, precise details, calm confidence.",
  },
  {
    id: "educacao",
    nome: "educação",
    palavras: /\b(escola\w*|educa\w*|ensino\w*|professor\w*|aluno\w*|faculdade\w*|universidad\w*|curso\w*|aula\w*|alfabetiza\w*|pedagog\w*|vestibular\w*)\b/,
    peso: 1.1,
    cores: { acento: "#2F6FDB", escuro: "#1B2440", claro: "#F7F5EF" },
    familia: "claro",
    tipografia: "sem-serifa",
    mundo:
      "a sunlit classroom with an empty blank chalkboard, stacked books with plain covers, sharpened pencils in a cup, a globe, a backpack on a chair, a library corner with reading lamps, colorful building blocks",
    luz: "bright, warm daylight, friendly and optimistic",
    evitar: "dark moody mood, neon, corporate cliches",
    estilo: "Bright, friendly editorial photography: warm daylight, tidy and colorful details, optimistic and clear.",
  },
  {
    id: "alimentacao",
    nome: "alimentação",
    palavras: /\b(restaurante\w*|padaria\w*|cafe|cafeteria\w*|gastronom\w*|comida\w*|confeitar\w*|culinari\w*|cozinha\w*|pizzaria\w*|hamburguer\w*|doceria\w*|buffet)\b/,
    peso: 1.2,
    cores: { acento: "#D2462E", escuro: "#2A1C15", claro: "#FAF3E7" },
    familia: "sobrio",
    tipografia: "serifada",
    mundo:
      "a flour-dusted wooden counter with fresh bread, steam rising from a cup, a rustic kitchen with copper pans, a market crate of vegetables, a plated dish on linen, an oven with glowing embers",
    luz: "warm, appetizing natural light, rich textures",
    evitar: "clinical cold light, neon, office props",
    estilo: "Appetizing food and kitchen photography: warm light, rich textures, close and inviting.",
  },
  {
    id: "beleza",
    nome: "beleza e estética",
    palavras: /\b(salao\w*|beleza|estetica\w*|cabel\w*|maquiag\w*|spa|cosmetic\w*|unha\w*|manicure|barbearia\w*|skincare)\b/,
    peso: 1.2,
    cores: { acento: "#C46F7E", escuro: "#2E2328", claro: "#FBF1EF" },
    familia: "claro",
    tipografia: "serifada",
    mundo:
      "a calm salon interior with a round mirror, folded towels and glass bottles without labels, dried flowers in a vase, marble and soft fabric, brushes in a cup, a robe on a hook",
    luz: "soft, flattering diffused light, pastel and creamy tones",
    evitar: "harsh contrast, neon, office props, dark dramatic mood",
    estilo: "Soft, elegant beauty editorial photography: diffused light, creamy tones, marble and fabric textures.",
  },
  {
    id: "imoveis",
    nome: "imóveis e construção",
    palavras: /\b(imobiliari\w*|imove\w*|construc\w*|construtora\w*|arquitet\w*|incorporadora\w*|engenharia civil|obra\w*|reforma\w*|condominio\w*|loteamento\w*)\b/,
    peso: 1.2,
    cores: { acento: "#C2703D", escuro: "#1E2A32", claro: "#F1EEE9" },
    familia: "sobrio",
    tipografia: "sem-serifa",
    mundo:
      "a bright empty living room with large windows, a modern facade at dusk, architectural blueprints rolled on a table without readable marks, a hard hat on concrete, a staircase with strong lines, keys hanging on a door",
    luz: "natural light with strong architectural lines, warm interiors, clean exteriors",
    evitar: "neon, cartoon look, marketing agency props",
    estilo: "Architectural photography: strong lines, natural light, spacious and aspirational.",
  },
  {
    id: "industria",
    nome: "indústria e logística",
    palavras: /\b(industri\w*|fabrica\w*|manufatur\w*|logistic\w*|transport\w*|metalurg\w*|maquina\w*|galpao\w*|armazem\w*|frota\w*|caminh(ao|oes))\b/,
    peso: 1.2,
    cores: { acento: "#E0A100", escuro: "#1C2329", claro: "#ECEEF0" },
    familia: "impacto",
    tipografia: "condensada",
    mundo:
      "a factory floor with machines and steel beams, sparks from a welding station, stacked pallets in a warehouse, a conveyor belt, a forklift, shipping containers at a port, a truck on an open highway",
    luz: "strong directional industrial light, steel and concrete tones, energetic",
    evitar: "soft pastel decor, cozy desk props, cartoon look",
    estilo: "Bold industrial photography: steel, concrete and motion, strong directional light, energetic and solid.",
  },
  {
    id: "agro",
    nome: "agronegócio",
    palavras: /\b(agro\w*|fazenda\w*|agricult\w*|pecuari\w*|rural\w*|lavoura\w*|safra\w*|gado|plantio\w*|colheita\w*)\b/,
    peso: 1.2,
    cores: { acento: "#7FA142", escuro: "#243020", claro: "#F4F1E4" },
    familia: "sobrio",
    tipografia: "sem-serifa",
    mundo:
      "an open crop field at sunrise, rows of soybeans or corn, a tractor on red soil, a silo against the sky, cattle on a green pasture, a rustic farm gate, rich soil in close-up",
    luz: "golden natural light, wide horizons, earthy greens and browns",
    evitar: "office props, neon, cartoon look",
    estilo: "Wide documentary photography of the field: golden light, big horizons, earthy and authentic.",
  },
  {
    id: "marketing",
    nome: "marketing e conteúdo",
    palavras: /\b(marketing|conteudo\w*|redes sociais|social media|influenc\w*|criador\w*|agencia\w*|trafego|publicidade|branding|autoridade|presenca digital|audiencia|engajamento|copywrit\w*|post\w*|youtube|instagram|linkedin)\b/,
    peso: 1,
    cores: { acento: "#F97316", escuro: "#1E1F22", claro: "#F2EFE8" },
    familia: "impacto",
    tipografia: "condensada",
    mundo:
      "a creator studio with a microphone on a boom arm and a switched-off ring light, a camera on a tripod, a wall of blank sticky notes in a weekly grid shape, a stage with an empty spotlight, a crowd-less auditorium, a megaphone resting on a stool, paper planes",
    luz: "punchy contrast, colored rim light, energetic",
    evitar: "medical, legal or religious imagery",
    estilo: "Bold, high-contrast creator-studio photography: one strong object, colored rim light, punchy and direct.",
  },
  {
    id: "tecnologia",
    nome: "tecnologia",
    palavras: /\b(software\w*|saas|tecnologia\w*|startup\w*|aplicativo\w*|inteligencia artificial|dados|cloud|ciberseg\w*|automac\w*|ti)\b/,
    peso: 1,
    cores: { acento: "#4C6FFF", escuro: "#0F1630", claro: "#F1F3FA" },
    familia: "claro",
    tipografia: "sem-serifa",
    mundo:
      "a minimal workspace with a closed laptop and a keyboard, server racks with indicator lights, a circuit board in macro, fiber optic cables, a clean meeting room with a whiteboard left blank, modular cubes",
    luz: "cool, clean light, crisp and modern",
    evitar: "fantasy sci-fi holograms, neon overload, cozy rustic props",
    estilo: "Clean, modern technology photography: crisp cool light, minimal surfaces, precise geometric details.",
  },
  {
    id: "negocios",
    nome: "negócios",
    palavras: /\b(negocio\w*|empres\w*|empreend\w*|gestao|consultor\w*|lideranc\w*|vendas|comercial|b2b|estrategi\w*|mentoria\w*)\b/,
    peso: 0.6,
    cores: { acento: "#2D5BD7", escuro: "#141A26", claro: "#F4F3EF" },
    familia: "claro",
    tipografia: "sem-serifa",
    mundo:
      "a bright meeting room with a long table and empty chairs, a storefront at opening time, a handshake-free deal symbolized by two coffee cups facing each other, a city skyline from an office window, a staircase going up, a compass on a map without labels",
    luz: "clean, natural daylight, confident and calm",
    evitar: "neon, fantasy effects, dark horror mood",
    estilo: "Clean editorial business photography: natural daylight, calm confident composition, one clear subject.",
  },
];

/** Sem acento e em minúsculas: as palavras do setor são escritas assim. */
function semAcento(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * O setor do projeto, por pontuação: o nicho pesa 3, o nome 2 e o público 1,
 * vezes o peso do setor. O público pesa pouco de propósito: a Demandou fala
 * PARA pastores e professores, e nem por isso é uma igreja.
 */
export function setorDoProjeto(d: { name?: string | null; niche?: string | null; targetAudience?: string | null }): SetorVisual {
  const textos: Array<[string, number]> = [
    [semAcento(d.niche ?? ""), 3],
    [semAcento(d.name ?? ""), 2],
    [semAcento(d.targetAudience ?? ""), 1],
  ];
  let melhor: SetorVisual | null = null;
  let melhorNota = 0;
  for (const s of SETORES) {
    let nota = 0;
    const global = new RegExp(s.palavras.source, "g");
    for (const [t, peso] of textos) nota += (t.match(global)?.length ?? 0) * peso;
    nota *= s.peso;
    if (nota > melhorNota) {
      melhor = s;
      melhorNota = nota;
    }
  }
  return melhor ?? SETORES[SETORES.length - 1];
}

// ── Cor ──────────────────────────────────────────────────────────────────────

function hexDe(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hslDe(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === R ? ((G - B) / d) % 6 : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h = (h * 60 + 360) % 360;
  return { h, s, l };
}

function hexDoHsl(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return hexDe((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** "#F97316,#1e1f22,#dbdee1" em três cores, ou null quando não há nenhuma válida. */
function coresDaPaleta(texto: string | null | undefined): CoresDaMarca | null {
  const cores = (texto ?? "").split(",").map((c) => c.trim()).filter((c) => /^#[0-9a-f]{6}$/i.test(c) || /^#[0-9a-f]{3}$/i.test(c));
  if (!cores.length) return null;
  // A paleta é uma lista livre (a tela deixa somar cores). Os papéis saem da
  // HIERARQUIA do cliente (lib/media/papeis-da-paleta.ts, 05/10): as duas
  // primeiras são as principais; o destaque é a primeira que é cor de verdade,
  // e a outra principal assume o escuro (ou o claro). O remapeio de 05/10 de
  // madrugada pegava "o mais escuro da lista inteira", o que podia tirar a
  // segunda cor principal do papel dela; agora o resto da lista só completa.
  const p = papeisDaPaleta(cores);
  if (!p) return null;
  return completarCores(p.destaque, p.escuro, p.claro);
}

/** Completa o que faltar a partir do tom do acento, em vez de cair no carvão de todo mundo. */
function completarCores(acento: string, escuro?: string, claro?: string): CoresDaMarca {
  const c = acento.replace("#", "");
  const full = c.length === 3 ? c.split("").map((x) => x + x).join("") : c;
  const { h } = hslDe(parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16));
  return {
    acento: `#${full}`,
    escuro: escuro ?? hexDoHsl(h, 0.18, 0.11),
    claro: claro ?? hexDoHsl(h, 0.3, 0.95),
  };
}

/**
 * As cores do logo, medidas nos pixels, sem IA. O acento é o matiz saturado
 * que mais aparece; o escuro, a média dos pixels escuros quando eles são
 * parte do desenho (letra preta, contorno), senão um tom muito escuro do
 * próprio acento. Logo só preto e branco não tem acento: devolve null e o
 * acento vem do setor.
 */
export async function coresDoLogo(logo: Buffer): Promise<{ acento: string; escuro?: string } | null> {
  const { data, info } = await sharp(logo).resize(64, 64, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const baldes = new Map<number, { n: number; r: number; g: number; b: number }>();
  let opacos = 0;
  const escuros = { n: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < data.length; i += info.channels) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a < 128) continue;
    opacos++;
    const { h, s, l } = hslDe(r, g, b);
    if (l < 0.22) {
      escuros.n++; escuros.r += r; escuros.g += g; escuros.b += b;
      continue;
    }
    if (s < 0.35 || l > 0.85) continue;
    const k = Math.floor(h / 15);
    const atual = baldes.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    atual.n++; atual.r += r; atual.g += g; atual.b += b;
    baldes.set(k, atual);
  }
  if (!opacos) return null;
  const maior = [...baldes.values()].sort((a, b) => b.n - a.n)[0];
  if (!maior || maior.n < opacos * 0.03) return null;
  const acento = hexDe(maior.r / maior.n, maior.g / maior.n, maior.b / maior.n);
  // Fundo preto chapado num JPG não é cor da marca: só conta escuro que é
  // pedaço do desenho (entre 5% e 70% dos pixels opacos).
  const escuro = escuros.n > opacos * 0.05 && escuros.n < opacos * 0.7 ? hexDe(escuros.r / escuros.n, escuros.g / escuros.n, escuros.b / escuros.n) : undefined;
  return { acento, escuro };
}

/** Códigos de cor escritos no manual da marca (texto compilado pela IA). */
export function coresDoManual(textos: string[]): CoresDaMarca | null {
  const vistos: string[] = [];
  for (const t of textos) {
    for (const m of t.matchAll(/#[0-9a-f]{6}\b/gi)) {
      const c = m[0].toUpperCase();
      if (!vistos.includes(c)) vistos.push(c);
      if (vistos.length >= 3) break;
    }
  }
  if (!vistos.length) return null;
  // O acento é a PRIMEIRA cor com cor de verdade (manual lista a principal
  // primeiro: no da Demandou, "#ef6122" vem antes do "âmbar de apoio
  // #d97706", e escolher a mais saturada pegava o apoio). O escuro é a mais
  // escura; o claro, a mais clara.
  const info = vistos.map((c) => ({ c, ...hslDe(parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)) }));
  const acento = info.find((x) => x.s > 0.25 && x.l > 0.2 && x.l < 0.85) ?? info[0];
  const resto = info.filter((x) => x !== acento);
  const escuro = resto.filter((x) => x.l < 0.3).sort((a, b) => a.l - b.l)[0];
  const claro = resto.filter((x) => x.l > 0.8).sort((a, b) => b.l - a.l)[0];
  return completarCores(acento.c, escuro?.c, claro?.c);
}

/**
 * A tipografia que o manual descreve, quando descreve. O manual decide
 * SERIFA OU NÃO; dentro das sem serifa, a condensada (Anton) também é sem
 * serifa, então "sem serifa com peso alto" num setor de letra condensada
 * continua condensada. Só "condensada" escrita força a condensada.
 */
export function tipografiaDoManual(textos: string[], doSetor: Tipografia): Tipografia | null {
  const t = semAcento(textos.join("\n"));
  const condensada = /\bcondensad\w*|\bcompressed\b|\banton\b|\boswald\b|\bbebas\b|\bimpact\b/.test(t);
  if (/sem serifa|sans[- ]?serif|\bsans\b|grotesk|helvetica|\binter\b|montserrat|roboto|arial|poppins|open sans/.test(t)) {
    if (condensada) return "condensada";
    return doSetor === "condensada" ? "condensada" : "sem-serifa";
  }
  if (/serifad|\bserif\b|garamond|playfair|times new roman|georgia|merriweather|\blora\b|baskerville/.test(t)) return "serifada";
  if (condensada) return "condensada";
  return null;
}

// ── A identidade inteira ─────────────────────────────────────────────────────

export type OrigemDasCores = "configuracao" | "manual" | "logo" | "logo-e-setor" | "setor";

export interface IdentidadeVisual {
  setor: SetorVisual;
  cores: CoresDaMarca;
  origemDasCores: OrigemDasCores;
  familia: FamiliaDaArte;
  origemDaFamilia: "linguagem-do-video" | "setor";
  tipografia: Tipografia;
  /** O público, em português, para quem escreve a cena saber para quem desenha. */
  publico?: string;
  /** O tom de voz do projeto, em português, pelo mesmo motivo. */
  tom?: string;
  /**
   * O PADRÃO VISUAL DO NICHO, medido nos perfis de referência (trilho da
   * Apify, lib/referencias). Cada item é o "comoAplicar" de um cartão
   * ProjectMemory tipo "padrao" com chave "visual:*" (tipo de capa,
   * enquadramento, quantidade de texto, composição). Só traços abstratos:
   * nunca a imagem do concorrente como referência. Em 01/10 o estudo ainda
   * só etiqueta texto (gancho, estrutura, chamada, formato, duração), então
   * a lista vem vazia; quando o estudo passar a etiquetar a parte visual, a
   * arte já lê. Uso de rosto não entra: a arte continua sem pessoas.
   */
  padroesVisuais?: string[];
  /**
   * As REGRAS DO PROJETO que o cliente aprovou para a arte (02/10,
   * lib/referencias/regras.ts), em português. Valem abaixo das regras da casa
   * (arte sem pessoas e sem texto dentro da imagem).
   */
  regrasDaArte?: string[];
  /** Em português, para o log e a tela. */
  resumo: string;
}

/** Tudo o que a identidade lê. Serve tanto ao projeto do banco quanto a um projeto montado em memória. */
export interface DadosDaIdentidade {
  name?: string | null;
  niche?: string | null;
  targetAudience?: string | null;
  voice?: string | null;
  colorPalette?: string | null;
  videoEstiloEscolha?: unknown;
  /** O arquivo do logo, já baixado. */
  logo?: Buffer | null;
  /** Os textos compilados do manual e dos documentos da marca. */
  textosDaMarca?: string[];
  /** O "comoAplicar" dos cartões de padrão visual do nicho (ver IdentidadeVisual). */
  padroesVisuais?: string[];
  /** As regras aprovadas para a arte (ver IdentidadeVisual). */
  regrasDaArte?: string[];
}

const ROTULO_DA_ORIGEM: Record<OrigemDasCores, string> = {
  configuracao: "cores escolhidas na configuração",
  manual: "cores do manual da marca (sugeridas, confirme na configuração)",
  logo: "cores tiradas do logo (sugeridas, confirme na configuração)",
  "logo-e-setor": "cor do logo com tons do setor (sugeridas, confirme na configuração)",
  setor: "cores sugeridas para o setor, porque o projeto ainda não tem paleta, logo nem manual (confirme na configuração)",
};

export async function identidadeDe(d: DadosDaIdentidade): Promise<IdentidadeVisual> {
  const setor = setorDoProjeto(d);
  const textos = d.textosDaMarca ?? [];

  // As cores. FONTE ÚNICA (06/10): a paleta salva em Configurações manda
  // sempre que existe, mesmo quando é igual ao padrão da plataforma (o
  // projeto Demandou usa exatamente essas cores, e a regra antiga, que tratava
  // o padrão como "não escolhida", mostrava na identidade as cores do setor,
  // do manual ou do logo). Manual, logo e setor só valem sem paleta salva.
  let cores: CoresDaMarca | null = null;
  let origemDasCores: OrigemDasCores = "setor";
  const daConfiguracao = coresDaPaleta(d.colorPalette);
  if (daConfiguracao) {
    cores = daConfiguracao;
    origemDasCores = "configuracao";
  }
  if (!cores) {
    const doManual = coresDoManual(textos);
    if (doManual) {
      cores = doManual;
      origemDasCores = "manual";
    }
  }
  if (!cores && d.logo) {
    const doLogo = await coresDoLogo(d.logo).catch(() => null);
    if (doLogo) {
      cores = completarCores(doLogo.acento, doLogo.escuro);
      origemDasCores = "logo";
    } else {
      // Logo sem cor (preto e branco): o escuro e o claro do setor, mais sóbrios.
      origemDasCores = "logo-e-setor";
    }
  }
  if (!cores) cores = setor.cores;

  // A família: a linguagem que o cliente escolheu manda; sem escolha, o setor.
  const linguagem = linguagemDoProjeto(d.videoEstiloEscolha);
  const familia: FamiliaDaArte = linguagem ? familiaDaLinguagem(linguagem.estilo.id) : setor.familia;
  const tipografia = tipografiaDoManual(textos, setor.tipografia) ?? setor.tipografia;

  return {
    setor,
    cores,
    origemDasCores,
    familia,
    origemDaFamilia: linguagem ? "linguagem-do-video" : "setor",
    tipografia,
    publico: d.targetAudience?.trim() || undefined,
    tom: d.voice?.trim() || undefined,
    padroesVisuais: d.padroesVisuais?.filter(Boolean).slice(0, 4),
    regrasDaArte: d.regrasDaArte?.filter(Boolean).slice(0, 8),
    resumo: `setor ${setor.nome}; ${ROTULO_DA_ORIGEM[origemDasCores]}; composição ${familia}${linguagem ? ` (da linguagem ${linguagem.estilo.nome})` : " (do setor)"}; letra ${tipografia}`,
  };
}

/**
 * A identidade de um projeto do banco. Só leitura, com cache de 10 minutos
 * por processo: o carrossel pede a marca por lâmina, e baixar o logo dez vezes
 * para a mesma resposta seria desperdício.
 */
const cache = new Map<string, { em: number; valor: Promise<IdentidadeVisual> }>();

export function identidadeDoProjeto(projectId: string): Promise<IdentidadeVisual> {
  const guardado = cache.get(projectId);
  if (guardado && Date.now() - guardado.em < 10 * 60_000) return guardado.valor;
  const valor = (async () => {
    const p = await prisma.project.findUnique({
      where: { id: projectId },
      select: {
        name: true,
        niche: true,
        targetAudience: true,
        voice: true,
        colorPalette: true,
        videoEstiloEscolha: true,
        logoUrl: true,
        contexts: { where: { status: "pronto", type: { in: ["brand", "business"] } }, select: { compiled: true }, take: 4 },
        // Os cartões de padrão VISUAL do nicho (chave "visual:*"). Os de texto
        // (gancho, estrutura, chamada) não servem à arte: a frase é composta
        // em código e o texto do post já os usa.
        memories: { where: { type: "padrao", key: { startsWith: "visual:" } }, select: { value: true }, take: 4 },
      },
    });
    const logo = p?.logoUrl ? await lerMidia(p.logoUrl).catch(() => null) : null;
    const regrasDaArte = (await regrasAprovadas(projectId, ["arte"])).map((r) => r.texto);
    return identidadeDe({
      regrasDaArte,
      name: p?.name,
      niche: p?.niche,
      targetAudience: p?.targetAudience,
      voice: p?.voice,
      colorPalette: p?.colorPalette,
      videoEstiloEscolha: p?.videoEstiloEscolha,
      logo,
      // Só o trecho que fala de cor e letra: o manual inteiro tem códigos de
      // cor de exemplo e nomes de fonte em outros contextos.
      textosDaMarca: (p?.contexts ?? []).map((c) => trechoVisual(c.compiled)).filter(Boolean),
      padroesVisuais: (p?.memories ?? [])
        .map((m) => (m.value as { comoAplicar?: unknown } | null)?.comoAplicar)
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0),
    });
  })();
  cache.set(projectId, { em: Date.now(), valor });
  valor.catch(() => cache.delete(projectId));
  return valor;
}

/** As linhas do manual que falam de cor, paleta, fonte ou tipografia, e as vizinhas. */
function trechoVisual(texto: string): string {
  const linhas = texto.split(/\r?\n/);
  const saida: string[] = [];
  linhas.forEach((l, i) => {
    if (/\b(cor|cores|paleta|color|hex|tipograf|fonte|font|typeface)\w*/i.test(l)) saida.push(...linhas.slice(i, i + 4));
  });
  return saida.join("\n").slice(0, 3000);
}

/** Esquece a identidade guardada (depois de trocar logo, paleta ou manual). */
export function esquecerIdentidade(projectId: string): void {
  cache.delete(projectId);
}

// ── Variedade dentro do mesmo projeto ────────────────────────────────────────

function hash(texto: string): number {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * O enquadramento da cena. Sem ele, a mesma regra ("um objeto no centro com
 * espaço em volta") dava sempre a mesma foto. Escolhido pela frase, para a
 * retentativa do mesmo dia repetir e dias diferentes variarem.
 */
const ENQUADRAMENTOS = [
  "wide establishing shot of the place, the subject small in a large environment",
  "macro close-up of one telling detail, shallow depth of field",
  "overhead flat lay seen from directly above, objects arranged with intent",
  "low angle looking up, the subject strong against the sky or ceiling",
  "symmetrical frontal view, calm and architectural",
  "three-quarter view with layered foreground, middle ground and background",
  "outdoor view at the time of day that fits the idea, natural horizon",
];

export function enquadramentoDaPeca(frase: string): string {
  return ENQUADRAMENTOS[hash(`enq:${frase}`) % ENQUADRAMENTOS.length];
}

/**
 * A variação do layout dentro da família: 0 texto primeiro (em cima ou à
 * esquerda), 1 arte primeiro, 2 arte na peça inteira com o texto por cima
 * (só onde a família comporta). Também pela frase.
 */
export function varianteDaPeca(frase: string, familia: FamiliaDaArte): number {
  const opcoes = familia === "impacto" ? 3 : 2;
  return hash(`var:${frase}`) % opcoes;
}
