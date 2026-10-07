import { mapaDePalavras } from "@/lib/media/roteiro-em-texto";
import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Jev } from "@/lib/media/jornada/decisoes";
import type { Redator } from "@/lib/media/jornada/ideias";
import { entradasDosPrompts, escreverPrompts } from "@/lib/media/jornada/prompts";
import { gerarTodos, type DependenciasDaGeracao, type ElementoGerado } from "@/lib/media/jornada/geracao";
import { montarEdicao, type EdicaoDaJornada, type LegendaDaJornada } from "@/lib/media/jornada/montagem";
import { frasesDaFala, levarIndice, type Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { elementosAprovados } from "@/lib/media/jornada/revisao";
import { escreverTextos, type TextoDoElemento } from "@/lib/media/jornada/textos";
import type { AmostraDaJornada, EstadoDaJornada } from "@/lib/media/jornada/estado";

/**
 * OS PASSOS 6 E 7 DA JORNADA, juntos (E5): da lista APROVADA (congelada) à
 * edição que o worker renderiza. Usado pela montagem do completo e pela prova
 * local. Nada aqui acrescenta, tira ou troca elemento: o que entra é
 * `elementosAprovados(estado)`; o único que pode faltar é o que a geração não
 * entregou (com o aviso ao cliente do momento, decisão 1 do Bruno).
 */

export type EntradaDaMontagemDaJornada = {
  estado: Pick<EstadoDaJornada, "aprovado" | "leitura" | "midiasMantidas">;
  /** A fala em que o plano foi escrito (a do roteiro) e a fala do arquivo que vai ao render. */
  falaDoPlano: Palavra[];
  falaDoRender: Palavra[];
  duracao: number;
  formato: "9:16" | "16:9";
  W: number;
  H: number;
  fps: number;
  /** A medição do arquivo do render (rosto, corpo, tela e quadro a cada ~2 s), no tempo dele. */
  amostras: AmostraDaJornada[];
  contexto: ContextoDaJornada;
  legenda: LegendaDaJornada;
  temTrilha: boolean;
  redator: Redator;
  jev: Jev | null;
  geracao: DependenciasDaGeracao;
  projectId?: string | null;
};

export type MontagemDaJornada = {
  edicao: EdicaoDaJornada;
  gerados: ElementoGerado[];
  avisosDoCliente: string[];
  avisosDoAdmin: string[];
  escolhas: Array<Record<string, unknown>>;
  prompts: Record<string, string>;
  /** O texto em camada que o Claude escreveu, por elemento (07/10). */
  textos: Record<string, TextoDoElemento>;
  trilha: boolean;
  custoUsd: { geracao: number };
  tempos: Record<string, number>;
};

function trechoEmTexto(leitura: LeituraDoVideo | null, t: number): string | null {
  const tr = leitura?.trechos?.find((x) => t >= x.de && t < x.ate);
  return tr ? `${tr.acontece}${tr.mostra.length ? `; mostra ${tr.mostra.join(", ")}` : ""}` : null;
}

export async function montarPelaJornada(e: EntradaDaMontagemDaJornada): Promise<MontagemDaJornada> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const marcar = (n: string) => {
    tempos[n] = +((Date.now() - t) / 1000).toFixed(1);
    t = Date.now();
  };
  // A LISTA APROVADA, congelada: é exatamente ela que vai ao ar.
  const aprovados = elementosAprovados(e.estado);
  // O tempo do plano levado para a fala do arquivo do render (alinhamento por sequência de palavras).
  const mesmaFala = e.falaDoPlano.length === e.falaDoRender.length && e.falaDoPlano.every((p, i) => p.texto === e.falaDoRender[i].texto);
  const mapa = mesmaFala ? [] : mapaDePalavras(e.falaDoPlano, e.falaDoRender);
  const frases = frasesDaFala(e.falaDoPlano);
  const noRender = (indice: number) => e.falaDoRender[levarIndice(mapa, indice)] ?? e.falaDoRender.at(-1)!;
  const tempoDe = aprovados.map((el) => {
    const f = frases.find((x) => x.indice === el.momento.indice);
    return {
      id: el.id,
      t: noRender(el.gatilho.indice).inicio,
      fraseDe: f ? noRender(f.de).inicio : noRender(el.gatilho.indice).inicio,
      fraseAte: f ? noRender(f.ate).fim : noRender(el.gatilho.indice).fim + 1.5,
    };
  });
  const porId = new Map(tempoDe.map((x) => [x.id, x]));
  // PASSO 6: um prompt por elemento (Sonnet) e a geração (Higgsfield), em paralelo.
  const entradas = entradasDosPrompts(aprovados, e.estado.leitura ?? null, e.formato);
  const paraGerar = entradas.filter((x) => x.midia !== "grafico");
  // O TEXTO EM CAMADA (07/10), escrito junto com os prompts: a fala A PARTIR da palavra que chama o elemento (o que foi dito antes
  // não pode virar item: o elemento ainda não está na tela) e o que vem logo depois (os itens enumerados).
  const falaEm = (de: number, ate: number) => e.falaDoRender.filter((p) => p.inicio >= de - 0.05 && p.inicio < ate).map((p) => p.texto).join(" ");
  const [{ prompts, erros }, txt] = await Promise.all([
    // O gráfico (07/10) é desenhado em código: não tem prompt de imagem nem geração.
    escreverPrompts(paraGerar, { contexto: e.contexto, leitura: e.estado.leitura ?? null, redator: e.redator, jev: e.jev, projectId: e.projectId }),
    escreverTextos(
      entradas.map((x) => {
        const tp = porId.get(x.id);
        return { id: x.id, descricao: x.descricao, textoNaImagem: x.textoNaImagem, grafico: x.midia === "grafico", fala: tp ? falaEm(tp.t - 0.15, Math.max(tp.fraseAte, tp.t + 7)) : x.fala };
      }),
      { contexto: e.contexto, redator: e.redator }
    ).catch((err) => ({ textos: {} as Record<string, TextoDoElemento>, erros: [`textos: ${err instanceof Error ? err.message.slice(0, 120) : err}`] })),
  ]);
  erros.push(...txt.erros);
  marcar("prompts");
  // O AJUSTE DO CARD (E6): as mídias desta edição que o pedido não tocou ficam; só as afetadas são geradas de novo.
  const mantidas = e.estado.midiasMantidas ?? {};
  const g = await gerarTodos(
    paraGerar.filter((x) => !mantidas[x.id]).map((x) => ({ ...x, t: porId.get(x.id)?.t ?? 0 })),
    prompts,
    e.geracao
  );
  for (const [id, m] of Object.entries(mantidas)) {
    if (!entradas.some((x) => x.id === id)) continue;
    g.gerados.push({ id, url: m.url, tipo: m.tipo, formato: m.formato as ElementoGerado["formato"], proporcao: m.proporcao, custoUsd: 0, modelo: "mantida desta edição", rodadas: 0, prompt: "", avisoAdmin: null, avisoCliente: null, tempos: { gerar: 0, recorte: 0, leitura: 0 } });
  }
  marcar("geracao");
  // NUNCA ENTREGAR VAZIO EM SILÊNCIO (07/10): plano aprovado com elementos e nenhuma mídia gerada é
  // falha da esteira, não um vídeo. Para aqui com o motivo, para o admin ver e o vídeo poder ser refeito.
  // Os gráficos não têm mídia: entram como "gerados" sem url, e a montagem os desenha pelo texto.
  for (const x of entradas.filter((y) => y.midia === "grafico")) g.gerados.push({ id: x.id, url: null, tipo: null, formato: "grafico", proporcao: null, custoUsd: 0, modelo: "grafico em código", rodadas: 0, prompt: "", avisoAdmin: null, avisoCliente: null, tempos: { gerar: 0, recorte: 0, leitura: 0 } });
  if (paraGerar.length > 0 && !g.gerados.some((x) => x.url) && !entradas.some((x) => x.midia === "grafico")) {
    throw new Error(`nenhum dos ${paraGerar.length} elementos aprovados foi gerado (${[...erros, ...g.gerados.map((x) => x.avisoAdmin).filter(Boolean)].slice(0, 3).join("; ")})`);
  }
  const geradoDe = new Map(g.gerados.map((x) => [x.id, x]));
  // PASSO 7: as opções pelo código, a escolha pelo JEV, a edição.
  const m = await montarEdicao({
    elementos: aprovados.map((el) => ({ aprovado: el, gerado: geradoDe.get(el.id)!, t: porId.get(el.id)!.t, fraseDe: porId.get(el.id)!.fraseDe, fraseAte: porId.get(el.id)!.fraseAte })).filter((x) => x.gerado),
    amostras: e.amostras,
    formato: e.formato,
    W: e.W,
    H: e.H,
    fps: e.fps,
    duracao: e.duracao,
    palavras: e.falaDoRender,
    legenda: e.legenda,
    cores: e.contexto.cores,
    jev: e.jev,
    projectId: e.projectId,
    temTrilha: e.temTrilha,
    leituraDoTrecho: (x) => trechoEmTexto(e.estado.leitura ?? null, x),
    textos: txt.textos,
  });
  marcar("montagem");
  return {
    edicao: m.edicao,
    gerados: g.gerados,
    avisosDoCliente: [...g.gerados.map((x) => x.avisoCliente).filter((x): x is string => Boolean(x)), ...m.avisosDoCliente],
    avisosDoAdmin: [...erros, ...g.gerados.map((x) => x.avisoAdmin).filter((x): x is string => Boolean(x)), ...m.avisos],
    escolhas: m.escolhas,
    prompts,
    textos: txt.textos,
    trilha: m.trilha,
    custoUsd: { geracao: g.custoUsd },
    tempos,
  };
}
