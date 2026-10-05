/**
 * O EDITOR POR COMANDO (05/10/2026): o que o cliente escreve (ou fala) para
 * descrever o vídeo que quer, e as poucas escolhas que refinam o comando.
 *
 * Decisão do Bruno às 3h30 de 05/10: o editor sob medida com catálogo de
 * estilos e regras que derrubam peças estava saindo pior que o vídeo feito à
 * mão. O jeito novo é o dos vídeos "Claude + Remotion + Higgsfield": o
 * cliente dá um COMANDO ("estilo Vox, recortes de papel, colagem"), responde
 * no máximo duas perguntas (a letra e as cores), e um diretor escreve a
 * composição daquele vídeo.
 *
 * Módulo PURO (a tela importa daqui): nada de banco, nada de env.
 */

/** As quatro letras que o Remotion já carrega (worker/remotion/src/sob-medida/base.tsx). */
export type FonteDoComando = "geist" | "playfair" | "oswald" | "archivo";

export type FichaDaFonte = {
  id: FonteDoComando;
  nome: string;
  resumo: string;
  /** A família no Remotion. */
  familia: string;
  peso: number;
  caixaAlta: boolean;
  /** A família parecida que o navegador mostra na tela (a amostra é aproximada). */
  amostraCss: string;
  amostraPeso: number;
};

export const FONTES_DO_COMANDO: FichaDaFonte[] = [
  { id: "playfair", nome: "Serifa editorial", resumo: "jornal, documentário, Vox", familia: "Playfair Display", peso: 700, caixaAlta: false, amostraCss: "'Playfair Display', Georgia, 'Times New Roman', serif", amostraPeso: 700 },
  { id: "geist", nome: "Moderna limpa", resumo: "tecnologia, aula, produto", familia: "Geist", peso: 600, caixaAlta: false, amostraCss: "Geist, 'Segoe UI', Inter, system-ui, sans-serif", amostraPeso: 600 },
  { id: "oswald", nome: "Condensada", resumo: "manchete, luxo sóbrio, autoridade", familia: "Oswald", peso: 600, caixaAlta: true, amostraCss: "Oswald, 'Arial Narrow', 'Roboto Condensed', sans-serif", amostraPeso: 600 },
  { id: "archivo", nome: "Impacto grosso", resumo: "retenção, Hormozi, MrBeast", familia: "Archivo Black", peso: 400, caixaAlta: true, amostraCss: "'Archivo Black', 'Arial Black', Impact, sans-serif", amostraPeso: 900 },
];

export const fichaDaFonte = (id: string | null | undefined): FichaDaFonte => FONTES_DO_COMANDO.find((f) => f.id === id) ?? FONTES_DO_COMANDO[1];

/** As cores: as da marca do projeto (padrão) ou uma paleta escolhida. */
export type CoresDoComando = { tipo: "marca" } | { tipo: "outra"; acento: string; escuro: string; claro: string };

export const PALETAS_PRONTAS: Array<{ id: string; nome: string; acento: string; escuro: string; claro: string }> = [
  { id: "papel", nome: "Papel e marca-texto", acento: "#F2C230", escuro: "#1C1A17", claro: "#F1E9D8" },
  { id: "tecnologia", nome: "Azul tecnologia", acento: "#2F80FF", escuro: "#0A1222", claro: "#EAF2FF" },
  { id: "luxo", nome: "Preto e dourado", acento: "#C9A24A", escuro: "#0B0B0D", claro: "#F4EFE4" },
  { id: "energia", nome: "Laranja energia", acento: "#FF6A1A", escuro: "#141414", claro: "#FFF4EC" },
];

export type ComandoDoVideo = {
  /** O comando do cliente, em texto (a voz chega aqui já transcrita). */
  texto: string;
  fonte: FonteDoComando;
  cores: CoresDoComando;
  /** De onde veio: escrito, falado, uma referência pronta ou o ajudante. */
  origem?: "escrito" | "voz" | "referencia" | "ajudante";
  /** A referência pronta clicada, quando houve. */
  referencia?: string | null;
  atualizadoEm?: string;
};

/** AS REFERÊNCIAS clicáveis: comandos prontos, cada um com a letra e as cores que combinam. */
export const REFERENCIAS_DE_COMANDO: Array<{ id: string; nome: string; resumo: string; texto: string; fonte: FonteDoComando; paleta: string }> = [
  {
    id: "vox-papel",
    nome: "Vox, papel recortado",
    resumo: "colagem de arquivo, jornal, mapa antigo, marca-texto amarelo",
    texto:
      "Estilo Vox: colagem de papel recortado sobre papel envelhecido, fotos de arquivo em preto e branco recortadas com borda de papel e sombra, recortes de jornal com manchete, mapa antigo com círculo vermelho quando eu falar de lugar, linha do tempo de papel quando eu falar de datas, o título serifado preto sobre faixa de marca-texto amarelo, carimbo vermelho nas palavras fortes. Ritmo de documentário: uma tela de papel a cada 8 a 12 segundos, intercalada comigo falando com a colagem atrás de mim.",
    fonte: "playfair",
    paleta: "papel",
  },
  {
    id: "tecnologico-passos",
    nome: "Tecnológico, passo a passo",
    resumo: "vidro, azul, passos numerados, números que contam",
    texto:
      "Tecnológico e didático, passo a passo: cada etapa que eu disser vira um passo numerado que acende na hora; números ditos contam na tela; comparações viram antes e depois; painéis de vidro ao meu lado com ícones simples; fundo escuro azulado com brilho ciano. Limpo, sem exagero, uma ideia por tela.",
    fonte: "geist",
    paleta: "tecnologia",
  },
  {
    id: "high-ticket",
    nome: "High ticket, luxo minimalista",
    resumo: "preto e dourado, pouco texto, muito respiro",
    texto:
      "High ticket, luxo minimalista: preto profundo e dourado metálico, tipografia elegante, pouquíssimo texto (uma palavra ou número por vez), muito respiro, a palavra-tese gigante atrás de mim nos momentos centrais, transições lentas. Passa autoridade e exclusividade, nada de efeito barato.",
    fonte: "oswald",
    paleta: "luxo",
  },
  {
    id: "dan-martell-lousa",
    nome: "Dan Martell, lousa",
    resumo: "quadro branco, diagramas desenhados, palavra sublinhada",
    texto:
      "Estilo Dan Martell de lousa: diagramas e esquemas desenhados à mão que se constroem enquanto eu falo, setas, escadas e fluxos, palavra-chave sublinhada, frameworks com 3 ou 4 itens que entram um a um, cortes de câmera rápidos entre aberto e fechado. Energia de aula de negócios.",
    fonte: "geist",
    paleta: "tecnologia",
  },
];

/** O AJUDANTE: poucas escolhas viram um comando escrito. */
export const OPCOES_DO_AJUDANTE = {
  clima: [
    { id: "documental", texto: "documentário explicativo, como a Vox" },
    { id: "didatico", texto: "aula didática e organizada" },
    { id: "luxo", texto: "autoridade premium, luxo minimalista" },
    { id: "energia", texto: "energia alta de retenção, como os shorts virais" },
  ],
  visual: [
    { id: "papel", texto: "colagem de papel recortado e fotos de arquivo" },
    { id: "vidro", texto: "painéis de vidro e gráficos limpos" },
    { id: "lousa", texto: "diagramas desenhados como lousa" },
    { id: "tipografia", texto: "tipografia grande, palavra por palavra" },
  ],
  ritmo: [
    { id: "calmo", texto: "ritmo calmo, com respiro" },
    { id: "medio", texto: "ritmo médio, algo novo a cada 6 a 10 segundos" },
    { id: "rapido", texto: "ritmo rápido, algo novo a cada 3 a 5 segundos" },
  ],
  imagens: [
    { id: "sim", texto: "com imagens geradas onde a fala pedir imagem" },
    { id: "pouco", texto: "poucas imagens, foco nos textos e gráficos" },
  ],
} as const;

export type EscolhasDoAjudante = { clima?: string; visual?: string; ritmo?: string; imagens?: string; extra?: string };

export function montarComando(e: EscolhasDoAjudante): string {
  const pega = (lista: ReadonlyArray<{ id: string; texto: string }>, id?: string) => lista.find((x) => x.id === id)?.texto;
  const partes = [
    pega(OPCOES_DO_AJUDANTE.clima, e.clima),
    pega(OPCOES_DO_AJUDANTE.visual, e.visual),
    pega(OPCOES_DO_AJUDANTE.ritmo, e.ritmo),
    pega(OPCOES_DO_AJUDANTE.imagens, e.imagens),
    e.extra?.trim(),
  ].filter(Boolean);
  if (!partes.length) return "";
  const t = partes.join("; ");
  return `${t.charAt(0).toUpperCase()}${t.slice(1)}.`;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Lê o comando guardado; null quando não há texto. */
export function normalizarComando(bruto: unknown): ComandoDoVideo | null {
  const b = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const texto = typeof b.texto === "string" ? b.texto.replace(/\s+/g, " ").trim().slice(0, 1500) : "";
  if (texto.length < 3) return null;
  const c = (b.cores && typeof b.cores === "object" ? b.cores : {}) as Record<string, unknown>;
  const cores: CoresDoComando =
    c.tipo === "outra" && [c.acento, c.escuro, c.claro].every((x) => typeof x === "string" && HEX.test(x as string))
      ? { tipo: "outra", acento: String(c.acento), escuro: String(c.escuro), claro: String(c.claro) }
      : { tipo: "marca" };
  const origem = ["escrito", "voz", "referencia", "ajudante"].includes(String(b.origem)) ? (b.origem as ComandoDoVideo["origem"]) : "escrito";
  return {
    texto,
    fonte: fichaDaFonte(typeof b.fonte === "string" ? b.fonte : null).id,
    cores,
    origem,
    referencia: typeof b.referencia === "string" ? b.referencia.slice(0, 40) : null,
    atualizadoEm: typeof b.atualizadoEm === "string" ? b.atualizadoEm : undefined,
  };
}
