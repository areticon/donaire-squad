/**
 * A REFERÊNCIA DE ESTILO (03/10/2026): o "treinamento" de cada linguagem de
 * edição para o agente EDITOR, o que escreve a edição sob medida de cada vídeo.
 *
 * Por que existe ao lado das bíblias (lib/media/biblias): a bíblia é o
 * contrato do diretor de hoje (layouts, metas numéricas, elementos que o kit
 * já desenha). A referência é o repertório do editor novo: como o criador real
 * abre, avança e fecha, o que um quadro típico mostra, e cada elemento gráfico
 * descrito de um jeito que dê para DESENHAR EM CÓDIGO (forma, entrada,
 * duração, posição na área segura). Pesquisada em análises, tutoriais e
 * quadros medidos; as fontes ficam em `fontes`.
 *
 * Regra que vale para todas: as cores, a fonte e o logo finais são os da
 * marca do cliente. O nome do criador descreve a linguagem; o produto nunca
 * usa marca, vinheta, trilha ou rosto de terceiros.
 *
 * Módulo puro: sem banco, sem IA, sem rede.
 */

/**
 * A área segura dos dois formatos, em fração do quadro. O editor posiciona
 * todo elemento DENTRO destas margens.
 *
 * 9:16 (1080x1920): o topo perde ~13% para o nome do perfil e o áudio; a base
 * perde ~22% para a legenda da rede, o botão e a descrição; a direita perde
 * ~12% para a coluna de curtir e comentar.
 * 16:9 (1920x1080): margem de título de 5% em volta; a base perde ~8% para a
 * barra do player.
 */
export const AREA_SEGURA = {
  "9:16": { largura: 1080, altura: 1920, topo: 0.13, base: 0.22, esquerda: 0.06, direita: 0.12 },
  "16:9": { largura: 1920, altura: 1080, topo: 0.05, base: 0.08, esquerda: 0.05, direita: 0.05 },
} as const;

/** Uma família tipográfica real: do Google Fonts ou das que o worker já tem (lib/media/fontes-da-capa). */
export type FamiliaTipografica = {
  /** O que ela faz: título, rótulo, número, legenda, conceito... */
  papel: string;
  familia: string;
  pesos: string;
  origem: "google-fonts" | "local" | "google-fonts e local";
  /** A alternativa quando a marca do cliente já tem fonte própria ou a primeira falta. */
  alternativa?: string;
};

export type CorTipica = { papel: string; hex: string };

/**
 * Um elemento gráfico característico, descrito para ser desenhado em código
 * (Remotion, satori, ffmpeg).
 */
export type ElementoGrafico = {
  id: string;
  nome: string;
  /** A forma: geometria, traço, preenchimento, textura, tamanho relativo. */
  forma: string;
  /** Como entra (e sai): curva, direção, duração em ms. */
  animacao: string;
  /** Quanto tempo fica na tela, em segundos. */
  duracaoSeg: [number, number];
  /** Onde fica no 9:16, dentro de AREA_SEGURA. */
  posicao916: string;
  /** Onde fica no 16:9, dentro de AREA_SEGURA. */
  posicao169: string;
  /** O gatilho na fala que pede o elemento. */
  quando: string;
};

/** Um momento típico da fala e a edição que o estilo faz nele. */
export type MomentoExemplo = { quando: string; edicao: string };

export type ReferenciaDeEstilo = {
  /** O mesmo id do catálogo (lib/media/catalogo-de-estilos.ts). */
  id: string;
  nome: string;
  /** Quem inspira a linguagem (só para descrever). */
  inspiracao: string;
  essencia: string;
  estrutura: {
    abre: string;
    avanca: string;
    fecha: string;
  };
  ritmo: {
    /** Duração típica de um plano, em segundos. */
    cenaSeg: [number, number];
    cortesPorMinuto: [number, number];
    zoom: string;
    observacoes: string;
  };
  tipografia: {
    familias: FamiliaTipografica[];
    hierarquia: string;
    regras: string[];
  };
  paleta: {
    tipica: CorTipica[];
    /** Como a paleta cede à cor da marca do cliente. */
    marca: string;
  };
  elementos: ElementoGrafico[];
  insercoesGeradas: {
    quando: string;
    tipos: string[];
    nunca: string;
  };
  som: {
    trilha: string;
    efeitos: string[];
    mixagem: string;
  };
  nunca: string[];
  /** 5 a 10 momentos de fala com a edição correspondente. */
  momentos: MomentoExemplo[];
  /** 3 quadros típicos, para o revisor com visão comparar. */
  quadrosDeReferencia: [string, string, string];
  /** O que foi consultado para escrever (URLs e quadros medidos). */
  fontes: string[];
};

/** A primeira frase (até o primeiro ponto seguido de espaço e maiúscula), com o ponto. */
function primeiraFrase(t: string): string {
  const m = t.match(/^[\s\S]*?\.(?=\s+[A-ZÀ-Ú(]|\s*$)/);
  return m ? m[0] : t;
}

const lista = (itens: string[]) => itens.map((i) => `- ${i}`).join("\n");
const faixa = (f: [number, number]) => (f[0] === f[1] ? `${f[0]}` : `${f[0]} a ${f[1]}`);

/**
 * O texto que entra no prompt do editor, montado do objeto (curto e denso,
 * até ~1.500 palavras). Fica aqui para que todo estilo saia no mesmo molde e
 * o objeto continue a fonte única.
 */
export function textoParaOPrompt(r: ReferenciaDeEstilo): string {
  const fam = r.tipografia.familias
    .map((f) => `${f.papel}: ${f.familia} ${f.pesos}${f.alternativa ? ` (ou ${f.alternativa})` : ""}`)
    .join("; ");
  const cores = r.paleta.tipica.map((c) => `${c.papel} ${c.hex}`).join(", ");
  // No prompt, o elemento vai na forma curta (a primeira frase da forma e da
  // animação); o desenho completo fica no objeto, para o código que desenha.
  const elementos = r.elementos
    .map(
      (e) =>
        `- ${e.nome.toUpperCase()} [${e.id}]: ${primeiraFrase(e.forma)} Entrada: ${primeiraFrase(e.animacao)} Fica ${faixa(e.duracaoSeg)} s. 9:16: ${primeiraFrase(e.posicao916)} 16:9: ${primeiraFrase(e.posicao169)} Quando: ${e.quando}`
    )
    .join("\n");
  const momentos = r.momentos.map((m) => `- ${m.quando}: ${m.edicao}`).join("\n");
  return [
    `# ESTILO ${r.nome.toUpperCase()} (linguagem inspirada em ${r.inspiracao}; cores, fonte e logo são os da marca do cliente)`,
    r.essencia,
    `## Estrutura\nAbre: ${r.estrutura.abre}\nAvança: ${r.estrutura.avanca}\nFecha: ${r.estrutura.fecha}`,
    `## Ritmo\nPlano de ${faixa(r.ritmo.cenaSeg)} s; ${faixa(r.ritmo.cortesPorMinuto)} cortes por minuto. Zoom: ${r.ritmo.zoom} ${r.ritmo.observacoes}`,
    `## Tipografia\n${fam}.\n${r.tipografia.hierarquia}\n${lista(r.tipografia.regras)}`,
    `## Paleta\n${cores}.\nMarca: ${r.paleta.marca}`,
    `## Elementos gráficos (área segura 9:16: topo 13%, base 22%, direita 12%; 16:9: 5% em volta, base 8%)\n${elementos}`,
    `## Inserção gerada\n${r.insercoesGeradas.quando} Tipos: ${r.insercoesGeradas.tipos.join("; ")}. Nunca: ${r.insercoesGeradas.nunca}`,
    `## Som\nTrilha: ${r.som.trilha} Efeitos: ${r.som.efeitos.join("; ")}. Mixagem: ${r.som.mixagem}`,
    `## Nunca\n${lista(r.nunca)}`,
    `## Momentos exemplo\n${momentos}`,
  ].join("\n\n");
}

export function contarPalavras(texto: string): number {
  return texto.split(/\s+/).filter(Boolean).length;
}
