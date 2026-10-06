import { FICHAS, ehApoio } from "@/lib/media/editor-sob-medida/pecas";
import type { CamadaResolvida, EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
import { faixaPrincipalDaLegenda } from "@/lib/media/editor-por-comando/estilo-manda";

/**
 * ZONAS EXCLUSIVAS DA LEGENDA NO 9:16 (05/10/2026).
 *
 * No teste do Bruno de 05/10 (vídeo cmuums24z, cortes 0 e 1) a legenda e o
 * texto das peças saíram um em cima do outro: "Maria nos pés de Jesus" sobre o
 * título do gancho, "né? E" sobre "Michelangelo", o item da lista cortado pela
 * legenda. A causa: a legenda era desenhada SEMPRE no mesmo lugar (o ASS do
 * worker, alinhada embaixo a 20% da base, de ~0,70 a ~0,82 da altura), e o
 * corte manda o título e a pergunta para o PEITO (`arejarCorte`, a 0,63 da
 * altura), que é exatamente a faixa dela. Nada no caminho conferia as duas.
 *
 * A regra agora: cada página da legenda olha as peças com texto que estão na
 * tela no tempo dela e escolhe uma faixa LIVRE:
 *   - "baixo": a de sempre, quando nenhuma peça usa a faixa de baixo;
 *   - "topo": acima da cabeça, quando a faixa de baixo está ocupada e a de
 *     cima livre;
 *   - "oculta": as duas ocupadas, ou uma tela cheia com texto (a peça já é o
 *     texto daquele instante; é o mesmo critério da lousa).
 *
 * As faixas das peças são as do desenho no worker
 * (worker/remotion/src/sob-medida/pecas e base.tsx `margens`): margem de cima
 * 0,13 da altura, base 0,76, título do corte a 0,63. Peça nova sem faixa
 * conhecida conta como "embaixo" (o lado seguro: a legenda sobe).
 *
 * Módulo puro: só o 16:9 fica como estava (a legenda do completo mora no pé
 * do quadro, abaixo das peças).
 */

export type FaixaDaLegenda = "baixo" | "topo" | "oculta";

/** Faixa vertical, em fração da altura do quadro: [de, ate]. */
type Faixa = [number, number];

/** Onde a legenda mora em cada posição, no 9:16 (a conta do ASS do worker, com folga para duas linhas). */
export const FAIXAS_DA_LEGENDA_9X16: Record<"baixo" | "topo", Faixa> = {
  baixo: [0.69, 0.83],
  topo: [0.035, 0.12],
};

const TELA = "tela" as const;

/** A folga em volta da caixa medida da peça (fração da altura). */
const FOLGA = 0.02;

/**
 * A faixa que a peça ocupa no 9:16, ou "tela" (ocupa o quadro inteiro), ou
 * null (não tem texto que brigue com a legenda: seta, círculo, apoio).
 */
export function faixaDaPeca(c: Pick<CamadaResolvida, "peca" | "props">): Faixa | typeof TELA | null {
  if (ehApoio(c)) return null;
  const pos = String((c.props ?? {}).posicao ?? "");
  // A FOLHA SOBRE A GRAVAÇÃO (05/10, noite): a peça de tela desenhada numa faixa (topo ou baixo), a pessoa na outra.
  if ((c.props ?? {}).sobreAGravacao) return String((c.props ?? {}).lado) === "topo" ? [0.03, 0.5] : [0.5, 0.95];
  // A PEÇA COM CAIXA MEDIDA (06/10, noite): a caixa que o resolvedor deu (área livre, versão na frente) é a faixa dela.
  const cx = (c.props ?? {}).caixa as { y?: unknown; h?: unknown } | undefined;
  // Com folga de 0,02 em cada lado (06/10, noite; vídeo cmux4417u): sombra, borda e a entrada animada passam da caixa,
  // e a legenda encostada na peça já lia como "legenda sobreposta ao texto da peça". Vale para TODA peça com caixa:
  // as vetoriais (titulo-em-caixa, cartoes-em-linha, icone-com-frase, comparacao-lado-a-lado, interface-de-edicao),
  // as versões na frente (caixa no topo, cartão embaixo, título no topo), o nome de quem fala, a frase-chave.
  if (cx && typeof cx.y === "number" && typeof cx.h === "number" && c.peca !== "zoom-no-ponto" && c.peca !== "destaque-na-tela" && c.peca !== "realce-de-quem-fala") return [+Math.max(0, cx.y - FOLGA).toFixed(4), +Math.min(1, cx.y + cx.h + FOLGA).toFixed(4)];
  if (c.peca === "inscrever") return String((c.props ?? {}).lado) === "topo" ? [0.05, 0.2] : [0.78, 0.92];
  switch (c.peca) {
    // Sem texto próprio na faixa da legenda.
    case "seta":
    case "circulo":
    case "transicao":
      return null;
    // No peito (TituloSemTarja a 0,63) ou no topo.
    case "titulo":
      return pos === "baixo" ? [0.6, 0.88] : [0.1, 0.45];
    case "pergunta-resposta":
      return pos === "baixo" ? [0.58, 0.88] : [0.12, 0.5];
    case "rotulo-inferior":
      return [0.6, 0.84];
    case "sublinhado":
      return [0.55, 0.74];
    case "palavra-chave":
    case "capitulo":
      return [0.1, 0.32];
    case "titulo-atras":
      return [0.08, 0.48];
    case "icone":
      return pos === "centro" ? [0.34, 0.62] : [0.1, 0.4];
    case "marca-texto":
      return pos === "centro" ? [0.6, 0.8] : [0.08, 0.26];
    case "carimbo":
      return [0.18, 0.34];
    case "chat":
      return [0.55, 0.82];
    case "legenda-destaque":
      return [0.64, 0.8];
    case "palavra-gigante":
    case "marca-brilho":
      return [0.12, 0.5];
    case "fecho":
      return TELA;
  }
  // A vetorial sem caixa medida (plano antigo): pela altura máxima dela, abaixo do rosto (o título, no alto).
  if (c.peca === "titulo-em-caixa") return [0.04, 0.2];
  if (VETORIAIS_DE_CONTEUDO.has(c.peca)) return [0.45, 0.82];
  const ficha = FICHAS[c.peca];
  if (!ficha) return [0.55, 0.88];
  if (ficha.plano === "tela") return TELA;
  // Ao lado, no 9:16: a peça ocupa o alto e o cartão da pessoa fica embaixo dela, acima da legenda.
  if (ficha.plano === "lado") return [0.08, 0.66];
  return [0.55, 0.88];
}

const VETORIAIS_DE_CONTEUDO = new Set(["icone-com-frase", "comparacao-lado-a-lado", "cartoes-em-linha", "interface-de-edicao"]);

const cruza = (a: Faixa, b: Faixa) => a[0] < b[1] && b[0] < a[1];

/** A faixa de uma página da legenda no tempo [inicio, fim], dadas as peças e os planos. */
export function faixaDaPagina(
  pagina: { inicio: number; fim: number },
  camadas: Array<Pick<CamadaResolvida, "peca" | "props" | "de" | "ate">>,
  planos: Array<{ de: number; ate: number; tipo: string }>,
  /** A faixa da posição principal do estilo (estilo-manda.ts); sem ela, a de baixo de sempre. */
  principal: Faixa = FAIXAS_DA_LEGENDA_9X16.baixo
): FaixaDaLegenda {
  const { inicio, fim } = pagina;
  // Tela cheia (o plano gráfico): a peça cobre o quadro, a legenda some.
  if (planos.some((p) => p.tipo === "grafico" && p.de < fim && p.ate > inicio)) return "oculta";
  const ocupadas: Faixa[] = [];
  for (const c of camadas) {
    if (!(c.de < fim && c.ate > inicio)) continue;
    const f = faixaDaPeca(c);
    if (f === TELA) return "oculta";
    if (f) ocupadas.push(f);
  }
  if (!ocupadas.some((f) => cruza(f, principal))) return "baixo";
  if (!ocupadas.some((f) => cruza(f, FAIXAS_DA_LEGENDA_9X16.topo))) return "topo";
  return "oculta";
}

/**
 * A edição com a faixa de cada página da legenda decidida. Roda DEPOIS de
 * tudo que mexe nas peças (arejar, adensar, gancho do segundo 0), porque é a
 * posição final delas que conta. No 16:9 devolve a edição como veio.
 */
export function posicionarLegenda(ed: EdicaoResolvida): { edicao: EdicaoResolvida; movidas: number; ocultas: number } {
  if (!ed.legenda?.paginas?.length || ed.altura <= ed.largura) return { edicao: ed, movidas: 0, ocultas: 0 };
  let movidas = 0;
  let ocultas = 0;
  const paginas = ed.legenda.paginas.map((p) => {
    const faixa = faixaDaPagina(p, ed.camadas, ed.planos ?? [], faixaPrincipalDaLegenda(ed.legenda?.estilo) ?? FAIXAS_DA_LEGENDA_9X16.baixo);
    if (faixa === "topo") movidas++;
    if (faixa === "oculta") ocultas++;
    return { ...p, faixa };
  });
  return { edicao: { ...ed, legenda: { ...ed.legenda, paginas } }, movidas, ocultas };
}

