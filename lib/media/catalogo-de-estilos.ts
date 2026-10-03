import type { NomeDoEstilo } from "@/lib/media/estilos";
import { normalizarLegenda, type EscolhaDaLegenda } from "@/lib/media/legenda-escolhida";

/**
 * O CATÁLOGO DE ESTILOS DE EDIÇÃO, em camadas (29/09/2026).
 *
 * O Bruno testou a tela e reprovou: "o estilo da edição continua as mesmas
 * categorias que eu falei para mudar, a lista deve ser igual à da Higgsfield
 * com artes de exemplo para o usuário saber qual o estilo, fora que as
 * sugestões que eu dei não aparecem (estilo Vox, BBC, National Geo)". A ficha
 * de cada estilo está em docs/estilos-de-edicao-de-video.md; aqui fica o que a
 * tela e a edição precisam: nome, grupo, a frase que explica, a arte de exemplo
 * e a BASE.
 *
 * ## A base, e por que ela existe
 *
 * O worker de hoje executa quatro perfis de legenda, ritmo e som (os de
 * `lib/media/estilos.ts`). Cada linguagem do catálogo aponta para o perfil mais
 * próximo, que é o que os cortes usam enquanto o editor novo (que lê a ficha
 * inteira) não chega. A escolha completa fica guardada no projeto
 * (`videoEstiloEscolha`) para o editor novo ler sem pedir de novo.
 *
 * Regra que vale para todos: as cores, a fonte e o logo são os da marca.
 * "Estilo Vox" é a linguagem da Vox com as cores do cliente. Os nomes de
 * referência servem só para descrever a linguagem; o produto nunca usa marca,
 * vinheta ou trilha de terceiros.
 *
 * Módulo puro: a tela (cliente) importa daqui.
 */

export type EstiloDoCatalogo = {
  id: string;
  nome: string;
  /** "estilo Vox": a referência que o cliente reconhece, quando existe. */
  referencia?: string;
  grupo: GrupoDeEstilo;
  resumo: string;
  base: NomeDoEstilo;
  /**
   * O kit de desenho que o worker tem hoje para a linguagem (01/10): colagem,
   * impacto ou sóbrio. Era o mapa FAMILIA de capa-composta.tsx; mora aqui para
   * a tela (cliente) também saber, sem importar módulo de servidor.
   */
  kit: "colagem" | "impacto" | "sobrio";
  /** A arte de exemplo, quando não é /estilos/<id>.webp. */
  arte?: string;
};

/**
 * Os estilos com BÍBLIA COMPLETA (01/10, lib/media/biblias): os outros saem
 * da bíblia do kit, com o selo "beta" na tela. Lista pura, para a tela.
 */
// "consorcio" (02/10): a bíblia do vendedor de consórcio e crédito, medida nos
// Reels do nicho, para a Gaberlini Consórcios.
export const ESTILOS_COM_BIBLIA = ["hormozi", "mrbeast", "consorcio", "vox", "bbc", "keynote", "lousa"] as const;

export function estiloEmBeta(id: string): boolean {
  return !(ESTILOS_COM_BIBLIA as readonly string[]).includes(id);
}

export type GrupoDeEstilo = "Jornalismo e explicação" | "Educação" | "Negócios e marca" | "Redes e retenção" | "Estética";

export const GRUPOS: GrupoDeEstilo[] = ["Jornalismo e explicação", "Educação", "Negócios e marca", "Redes e retenção", "Estética"];

export const CATALOGO_DE_ESTILOS: EstiloDoCatalogo[] = [
  { id: "vox", nome: "Explicativo editorial", referencia: "estilo Vox", grupo: "Jornalismo e explicação", resumo: "Colagem de recortes, marca-texto nas frases-chave e gráficos simples. Para explicar um tema do mercado.", base: "serio", kit: "colagem" },
  { id: "bbc", nome: "Telejornal e reportagem", referencia: "estilo BBC", grupo: "Jornalismo e explicação", resumo: "Sóbrio, com tarja de nome e cargo, número grande com fonte. Notícia da empresa com credibilidade.", base: "serio", kit: "sobrio" },
  { id: "natgeo", nome: "Documentário cinematográfico", referencia: "estilo National Geographic", grupo: "Jornalismo e explicação", resumo: "Ritmo calmo de documentário, cenas de cinema geradas e tarjas limpas. História da empresa, obra, campo.", base: "dramatico", kit: "sobrio" },
  { id: "johnny-harris", nome: "Jornalismo de mapa", referencia: "estilo Johnny Harris", grupo: "Jornalismo e explicação", resumo: "Colagem com setas e círculos desenhados à mão sobre as imagens de apoio. Mercado por região, logística, expansão.", base: "serio", kit: "colagem" },
  { id: "crime-real", nome: "Investigação", referencia: "estilo série documental", grupo: "Jornalismo e explicação", resumo: "Colagem em tom sério, imagens de apoio em luz dura e revelação com flash. Estudo de caso, antes e depois.", base: "dramatico", kit: "colagem" },
  { id: "60-minutes", nome: "Entrevista de revista", referencia: "estilo 60 Minutes", grupo: "Jornalismo e explicação", resumo: "Edição sóbria de entrevista: você em primeiro plano, tarja com o assunto e frases-chave em citação. Fundador ou especialista.", base: "dramatico", kit: "sobrio" },
  { id: "kurzgesagt", nome: "Animação explicativa", referencia: "estilo Kurzgesagt", grupo: "Educação", resumo: "Colagem explicativa com números grandes animados e gráficos simples nas cores da marca. Conceito, processo, como funciona.", base: "animado", kit: "colagem" },
  { id: "quadro-branco", nome: "Quadro branco", grupo: "Educação", resumo: "Fundo claro, setas e círculos à mão e frases-chave grifadas na cor da marca. Método e passo a passo.", base: "animado", kit: "colagem" },
  { id: "ali-abdaal", nome: "Professor com imagens de apoio", referencia: "estilo Ali Abdaal", grupo: "Educação", resumo: "Você falando, palavras-chave grandes e imagem de apoio nos pontos concretos. Aula, dicas, método.", base: "acelerado", kit: "impacto" },
  // A lousa de negócios (01/10): a bíblia do Dan Martell medida em 25/08
  // (docs/overlays/BIBLIA-DE-ESTILO.md), desenhada hoje pelo kit sóbrio.
  { id: "lousa", nome: "Lousa de negócios", referencia: "estilo Dan Martell", grupo: "Educação", resumo: "Lousa preta, título com a palavra-chave na cor da marca, passos revelados um a um, você no canto. Método, framework, aula de negócios.", base: "serio", kit: "sobrio" },
  { id: "ted", nome: "Palestra de palco", referencia: "estilo TED", grupo: "Educação", resumo: "Fundo escuro, você em destaque, títulos e citações limpas quando a ideia muda. Palestra e evento.", base: "serio", kit: "sobrio" },
  { id: "keynote", nome: "Lançamento de produto", referencia: "estilo keynote da Apple", grupo: "Negócios e marca", resumo: "Uma frase por tela, muito espaço vazio, cor só no produto. Produto ou serviço novo.", base: "serio", kit: "sobrio" },
  { id: "institucional", nome: "Institucional cinematográfico", grupo: "Negócios e marca", resumo: "Cenas de cinema do seu setor, ritmo calmo e frases de valor em destaque. Quem somos, recrutamento.", base: "dramatico", kit: "sobrio" },
  { id: "depoimento", nome: "Depoimento de cliente", grupo: "Negócios e marca", resumo: "Quem grava fala para a câmera, com imagens de apoio do setor e o resultado em número grande. Prova social.", base: "dramatico", kit: "sobrio" },
  { id: "vlog", nome: "Bastidor e vlog de fundador", referencia: "estilo Casey Neistat", grupo: "Negócios e marca", resumo: "Cortes rápidos, zoom na fala e palavras-chave grandes; a sua gravação é a estrela. Rotina, evento, um dia na empresa.", base: "acelerado", kit: "impacto" },
  { id: "podcast", nome: "Podcast em vídeo", grupo: "Negócios e marca", resumo: "Conversa gravada com legenda limpa, títulos de capítulo e citações. Podcast e evento longo.", base: "serio", kit: "sobrio" },
  { id: "mrbeast", nome: "Alta retenção", referencia: "estilo MrBeast", grupo: "Redes e retenção", resumo: "Muito rápido, legenda palavra a palavra, zoom e efeito sonoro em cada corte. Alcance.", base: "acelerado", kit: "impacto" },
  { id: "hormozi", nome: "Corte com legenda dinâmica", referencia: "estilo Hormozi", grupo: "Redes e retenção", resumo: "Legenda grande no centro, palavra-chave na cor da marca, zoom alternado. Reels, Shorts, TikTok.", base: "acelerado", kit: "impacto" },
  // O do vendedor de consórcio (02/10): bíblia completa (lib/media/biblias/consorcio.ts),
  // medida em seis perfis do nicho. A arte de exemplo é um quadro da prova real.
  { id: "consorcio", nome: "Autoridade em consórcio", referencia: "Reels de consórcio e crédito", grupo: "Negócios e marca", resumo: "O valor em faixa de destaque, selo com o seu nome, legenda grande e comentário respondido na tela. Sem promessa de contemplação.", base: "acelerado", kit: "impacto" },
  { id: "ugc", nome: "Nativo do TikTok", grupo: "Redes e retenção", resumo: "Gravação de celular em ambiente real, legenda grande e poucos enfeites. Humaniza a marca.", base: "animado", kit: "impacto" },
  { id: "tipografia", nome: "Tipografia animada", grupo: "Redes e retenção", resumo: "Palavras grandes entram no ritmo da voz, com cartelas de texto entre as falas. Frase de impacto, manifesto.", base: "animado", kit: "impacto" },
  { id: "carrossel-animado", nome: "Carrossel animado", grupo: "Redes e retenção", resumo: "Cartelas de texto na cor da marca, uma ideia por vez, com deslize entre elas. Dicas em lista.", base: "animado", kit: "impacto" },
  { id: "wes-anderson", nome: "Simetria e cor pastel", referencia: "estilo Wes Anderson", grupo: "Estética", resumo: "Colagem em tons suaves da marca e títulos centrados. Marca com personalidade.", base: "dramatico", kit: "colagem" },
  { id: "vhs", nome: "Retrô e VHS", grupo: "Estética", resumo: "Edição de impacto com imagens de apoio em clima retrô. Nostalgia, aniversário de marca.", base: "animado", kit: "impacto" },
  { id: "minimalista", nome: "Minimalista corporativo", grupo: "Estética", resumo: "Visual limpo, títulos curtos e gráficos simples na cor da marca. B2B, relatório.", base: "serio", kit: "sobrio" },
  { id: "tela-dividida", nome: "Tela dividida e reação", grupo: "Estética", resumo: "Você numa metade e uma imagem de apoio na outra, com x e check na comparação. Antes e depois.", base: "acelerado", kit: "impacto" },
];

/** A arte de exemplo de cada estilo (gerada em 29/09, scripts/tmp/gerar-estilos-2909.mjs). */
export function arteDoEstilo(id: string): string {
  return estiloDoCatalogo(id)?.arte ?? `/estilos/${id}.webp`;
}

export type OpcaoDeCamada = { id: string; nome: string; resumo: string };

/**
 * AS CAMADAS, no desenho da Higgsfield: o que se soma à linguagem.
 * Valem para as cenas geradas por IA e para as transições da edição; o
 * material gravado pelo cliente recebe a linguagem.
 */
export const MOVIMENTOS_DE_CAMERA: OpcaoDeCamada[] = [
  { id: "dolly-in", nome: "Aproximação lenta", resumo: "A câmera anda até o assunto (dolly in)." },
  { id: "dolly-out", nome: "Afastamento lento", resumo: "A câmera recua e revela o lugar (dolly out)." },
  { id: "crash-zoom", nome: "Zoom de impacto", resumo: "Zoom rápido na palavra forte (crash zoom)." },
  { id: "vertigo", nome: "Efeito Vertigo", resumo: "O fundo estica enquanto o assunto fica (dolly zoom)." },
  { id: "grua-sobe", nome: "Grua subindo", resumo: "Sobe e abre o plano, bom para fechamento." },
  { id: "grua-desce", nome: "Grua descendo", resumo: "Desce até o assunto, bom para abertura." },
  { id: "orbita", nome: "Órbita 360", resumo: "Gira em volta do produto ou da pessoa." },
  { id: "arco", nome: "Arco lateral", resumo: "Meia volta ao redor, dá profundidade." },
  { id: "pan", nome: "Panorâmica", resumo: "Varre o lugar de um lado ao outro." },
  { id: "whip-pan", nome: "Chicote", resumo: "Giro rápido que vira transição (whip pan)." },
  { id: "na-mao", nome: "Câmera na mão", resumo: "Tremor leve de quem está lá." },
  { id: "drone-fpv", nome: "Drone em voo", resumo: "Voo rápido e baixo pelo lugar (FPV)." },
  { id: "recuo-aereo", nome: "Recuo aéreo", resumo: "Sobe e se afasta até ver a cidade." },
  { id: "de-cima", nome: "Plano de cima", resumo: "Visto de cima, como mapa." },
  { id: "bullet-time", nome: "Tempo congelado", resumo: "O momento para e a câmera gira (bullet time)." },
  { id: "timelapse", nome: "Timelapse", resumo: "Horas em segundos." },
  { id: "hiperlapso", nome: "Hiperlapso", resumo: "Timelapse com a câmera andando." },
  { id: "foco", nome: "Troca de foco", resumo: "O foco passa de um plano ao outro." },
  { id: "atraves", nome: "Através do objeto", resumo: "A câmera passa por dentro de algo e sai do outro lado." },
  { id: "estatica", nome: "Estática", resumo: "Parada, o assunto é que se move." },
];

export const EFEITOS: OpcaoDeCamada[] = [
  { id: "mundo-congelado", nome: "Mundo congelado", resumo: "Tudo para, só você se move." },
  { id: "clones", nome: "Clones", resumo: "Várias versões de você na mesma cena." },
  { id: "sumir", nome: "Desaparecer", resumo: "Some em partículas." },
  { id: "derreter", nome: "Derreter", resumo: "A cena escorre para a próxima." },
  { id: "lidar", nome: "Transição de varredura", resumo: "A cena vira nuvem de pontos e remonta (lidar)." },
  { id: "zoom-da-terra", nome: "Zoom da Terra", resumo: "Do espaço até o endereço." },
  { id: "particulas", nome: "Partículas", resumo: "Brilho e pontos no ar." },
  { id: "colagem", nome: "Colagem de recortes", resumo: "Papel, sombra e textura, como revista." },
  { id: "quadrinho", nome: "Quadrinho", resumo: "Vira página de quadrinho." },
  { id: "recorte", nome: "Recorte de papel", resumo: "A pessoa recortada sobre fundo de papel." },
  { id: "glitch", nome: "Glitch", resumo: "Falha digital curta, boa para virada." },
  { id: "flash", nome: "Flash branco", resumo: "Clarão curto na revelação." },
  { id: "luz-vazada", nome: "Luz vazada", resumo: "Vazamento de luz quente de filme." },
];

export const LOOKS: OpcaoDeCamada[] = [
  { id: "natural", nome: "Natural", resumo: "Cor como gravada, só equilibrada." },
  { id: "cinema-quente", nome: "Cinema quente", resumo: "Tons terrosos, contraste de filme." },
  { id: "frio-escuro", nome: "Frio e escuro", resumo: "Azulado, sombras fortes." },
  { id: "pastel", nome: "Pastel", resumo: "Cores suaves derivadas da marca." },
  { id: "pb-destaque", nome: "Preto e branco com destaque", resumo: "Tudo cinza, só a cor da marca." },
  { id: "filme-16mm", nome: "Filme 16 mm", resumo: "Granulado e bordas suaves." },
  { id: "vhs", nome: "Fita VHS", resumo: "Linhas, desbotado, magenta e ciano." },
  { id: "ilustrado", nome: "Ilustrado", resumo: "A imagem real com traço de ilustração." },
  { id: "papel", nome: "Papel e colagem", resumo: "Textura de papel sobre a cena." },
  { id: "pintura", nome: "Pintura", resumo: "Pinceladas sobre a imagem." },
  { id: "alto-contraste", nome: "Alto contraste", resumo: "Saturado e marcado, para rede social." },
];

/** O que o projeto guarda (Project.videoEstiloEscolha). */
export type EscolhaDeEstilo = {
  estiloId: string;
  camera: string[];
  efeitos: string[];
  look: string | null;
  /** O que o cliente escreveu, quando escreveu o próprio estilo. */
  texto?: string;
  /** A leitura do diretor, que a tela mostrou antes de o cliente confirmar. */
  interpretacao?: string;
  /**
   * Com ou sem legenda, e em qual estilo (30/09). Mora no mesmo Json para não
   * precisar de migração; sem nada guardado é "auto", o comportamento de antes.
   * Ver lib/media/legenda-escolhida.ts.
   */
  legenda: EscolhaDaLegenda;
  /**
   * INSERÇÕES DE IA ligadas de propósito (03/10). O padrão de todo estilo é
   * o corte limpo profissional (cartelas, punch-in, legenda; nenhuma imagem
   * nem cena gerada): decisão do Bruno depois do custo e da demora do plano
   * cena a cena. Com isto ligado, o diretor cena a cena volta a planejar
   * imagem e cena de cinema para a linguagem escolhida, e a tela mostra o
   * custo. Mesmo Json, sem migração; ausente é falso.
   */
  insercoesIA?: boolean;
};

/**
 * O custo estimado por minuto das inserções de IA, para a tela (03/10):
 * ~2 imagens por minuto a US$ 0,07 a 0,10 cada, mais o diretor cena a cena
 * (~US$ 0,25 por bloco de 2,5 min), mais até 4 cenas de cinema por vídeo. Em
 * reais, com a conta de 02/10 (US$ 46,75 em 190 chamadas só do diretor).
 */
export const CUSTO_DAS_INSERCOES_IA = { porMinutoUsd: 0.3, texto: "cerca de US$ 0,30 por minuto de vídeo, mais as cenas de cinema" };

export function estiloDoCatalogo(id: string | null | undefined): EstiloDoCatalogo | undefined {
  return CATALOGO_DE_ESTILOS.find((e) => e.id === id);
}

/**
 * O que cada kit NÃO aceita das camadas (01/10). Papel e recorte são da
 * colagem; o sóbrio (telejornal, keynote, lousa) não tem falha digital,
 * clone nem quadrinho; o keynote também não tem câmera nervosa.
 */
const CAMADAS_RECUSADAS: Record<EstiloDoCatalogo["kit"], { efeitos: string[]; looks: string[]; camera: string[] }> = {
  colagem: { efeitos: [], looks: [], camera: [] },
  impacto: { efeitos: ["colagem", "recorte"], looks: ["papel"], camera: [] },
  sobrio: { efeitos: ["colagem", "recorte", "quadrinho", "glitch", "clones", "derreter"], looks: ["papel", "vhs", "alto-contraste"], camera: [] },
};
const CAMERA_RECUSADA_NO_ESTILO: Record<string, string[]> = { keynote: ["na-mao", "whip-pan", "crash-zoom"], lousa: ["na-mao", "whip-pan", "crash-zoom", "drone-fpv"] };

/** As camadas escolhidas que a linguagem aceita; as outras saem (na troca de estilo e na leitura). */
export function camadasCompativeis(
  estiloId: string,
  c: { camera: string[]; efeitos: string[]; look: string | null }
): { camera: string[]; efeitos: string[]; look: string | null } {
  const kit = estiloDoCatalogo(estiloId)?.kit ?? "impacto";
  const r = CAMADAS_RECUSADAS[kit];
  const semCamera = [...r.camera, ...(CAMERA_RECUSADA_NO_ESTILO[estiloId] ?? [])];
  return {
    camera: c.camera.filter((x) => !semCamera.includes(x)),
    efeitos: c.efeitos.filter((x) => !r.efeitos.includes(x)),
    look: c.look && !r.looks.includes(c.look) ? c.look : null,
  };
}

/** Lê a escolha guardada, com o padrão (corte com legenda dinâmica) no que faltar. */
export function normalizarEscolha(bruta: unknown, baseAtual?: string | null): EscolhaDeEstilo {
  const b = (bruta && typeof bruta === "object" ? bruta : {}) as Record<string, unknown>;
  const ids = (v: unknown, validos: OpcaoDeCamada[]) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && validos.some((o) => o.id === x)) : [];
  // Projeto antigo, com só o perfil de legenda: o estilo do catálogo mais parecido.
  const doPerfil: Record<string, string> = { dramatico: "natgeo", acelerado: "hormozi", serio: "bbc", animado: "ugc" };
  const estiloId = estiloDoCatalogo(b.estiloId as string)?.id ?? doPerfil[baseAtual ?? ""] ?? "hormozi";
  // As camadas que a linguagem aceita (01/10): o projeto do Bruno trocou Vox
  // por MrBeast e continuou com "colagem" e "recorte de papel" guardados, que
  // viravam textura de papel no corte e "o cliente escolheu colagem" no prompt
  // de uma linguagem que proíbe papel. Filtrar na LEITURA conserta também o
  // que já está gravado, sem mexer no banco.
  const compativeis = camadasCompativeis(estiloId, {
    camera: ids(b.camera, MOVIMENTOS_DE_CAMERA),
    efeitos: ids(b.efeitos, EFEITOS),
    look: typeof b.look === "string" && LOOKS.some((l) => l.id === b.look) ? (b.look as string) : null,
  });
  return {
    estiloId,
    camera: compativeis.camera,
    efeitos: compativeis.efeitos,
    look: compativeis.look,
    texto: typeof b.texto === "string" ? b.texto.slice(0, 600) : undefined,
    interpretacao: typeof b.interpretacao === "string" ? b.interpretacao.slice(0, 1200) : undefined,
    legenda: normalizarLegenda(b.legenda),
    ...(b.insercoesIA === true ? { insercoesIA: true } : {}),
  };
}
