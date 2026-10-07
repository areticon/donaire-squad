import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { Jev } from "@/lib/media/jornada/decisoes";
import type { Redator } from "@/lib/media/jornada/ideias";
import type { ElementoAprovado, Caixa } from "@/lib/media/jornada/estado";
import type { Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { entradasDosPrompts, escreverPrompts } from "@/lib/media/jornada/prompts";
import { gerarTodos, type DependenciasDaGeracao, type ElementoGerado } from "@/lib/media/jornada/geracao";
import { escreverTextos } from "@/lib/media/jornada/textos";
import { montarEdicao, type EdicaoDaJornada, type LegendaDaJornada } from "@/lib/media/jornada/montagem";
import { amostrasDoCorte, elementosNoCorte, geradoDoCompleto, paraMontarNoCorte } from "@/lib/media/jornada/corte";
import type { DirecaoDaEdicao } from "@/lib/media/jornada/direcao";

/**
 * O CORTE PELA JORNADA, do plano aprovado à edição que o worker renderiza
 * (08/10/2026). Ver lib/media/jornada/corte.ts. As mídias vêm do completo;
 * o que o completo ainda não gerou é gerado aqui (pago), e o texto em camada é
 * escrito com a fala do corte.
 */

export type MidiasDoCompleto = Record<string, { url: string | null; tipo: "imagem" | "recorte" | "video" | null; formato: string; proporcao: number | null }>;

export type CorteMontado = {
  edicao: EdicaoDaJornada;
  elementos: number;
  gerados: ElementoGerado[];
  avisos: string[];
  escolhas: Array<Record<string, unknown>>;
  trilha: boolean;
  custoUsd: number;
};

export async function montarCortePelaJornada(o: {
  aprovados: readonly ElementoAprovado[];
  falaDoPlano: Palavra[];
  falaDoCorte: Palavra[];
  duracao: number;
  fps: number;
  midiasDoCompleto: MidiasDoCompleto;
  leitura: LeituraDoVideo | null;
  rosto: Caixa | null;
  pessoa: Caixa | null;
  contexto: ContextoDaJornada;
  legenda: LegendaDaJornada;
  temTrilha: boolean;
  redator: Redator;
  jev: Jev | null;
  geracao: DependenciasDaGeracao;
  projectId: string;
  /** A direção visual do completo (08/10): o corte mantém a identidade do vídeo. */
  direcao?: DirecaoDaEdicao | null;
}): Promise<CorteMontado> {
  const avisos: string[] = [];
  const W = 1080;
  const H = 1920;
  const noCorte = elementosNoCorte(o.aprovados, o.falaDoPlano, o.falaDoCorte, o.duracao);
  const gerados = new Map<string, ElementoGerado>();
  for (const x of noCorte) {
    const g = geradoDoCompleto(x.aprovado, o.midiasDoCompleto[x.aprovado.id]);
    if (g) gerados.set(x.aprovado.id, g);
  }
  // O que o completo não tem (ainda não gerou, ou falhou): gerado aqui, no formato do corte.
  const faltando = noCorte.filter((x) => !gerados.has(x.aprovado.id)).map((x) => x.aprovado);
  let custoUsd = 0;
  if (faltando.length) {
    const entradas = entradasDosPrompts(faltando, o.leitura, "9:16");
    const { prompts, erros } = await escreverPrompts(entradas, { contexto: o.contexto, leitura: o.leitura, redator: o.redator, jev: o.jev, projectId: o.projectId });
    avisos.push(...erros);
    const porId = new Map(noCorte.map((x) => [x.aprovado.id, x.t]));
    const g = await gerarTodos(entradas.map((e) => ({ ...e, t: porId.get(e.id) ?? 0 })), prompts, o.geracao);
    custoUsd += g.custoUsd;
    for (const x of g.gerados) {
      if (x.url) gerados.set(x.id, x);
      else if (x.avisoAdmin) avisos.push(x.avisoAdmin);
    }
  }
  const { elementos, faltam } = paraMontarNoCorte(noCorte, gerados);
  if (faltam.length) avisos.push(`corte: sem mídia para ${faltam.join(", ")}`);
  // O texto em camada, escrito com a fala do corte a partir do gatilho.
  const falaEm = (de: number, ate: number) => o.falaDoCorte.filter((p) => p.inicio >= de - 0.05 && p.inicio < ate).map((p) => p.texto).join(" ");
  const entradasDoTexto = entradasDosPrompts(elementos.map((e) => e.aprovado), o.leitura, "9:16").map((x) => {
    const e = elementos.find((y) => y.aprovado.id === x.id)!;
    return { id: x.id, descricao: x.descricao, textoNaImagem: x.textoNaImagem, grafico: x.midia === "grafico", fala: falaEm(e.t - 0.15, Math.max(e.fraseAte, e.t + 7)) };
  });
  const txt = entradasDoTexto.length ? await escreverTextos(entradasDoTexto, { contexto: o.contexto, redator: o.redator }).catch((e) => ({ textos: {}, erros: [`textos: ${e instanceof Error ? e.message.slice(0, 120) : e}`] })) : { textos: {}, erros: [] };
  avisos.push(...txt.erros);
  const m = await montarEdicao({
    elementos,
    amostras: amostrasDoCorte(o.duracao, o.rosto, o.pessoa),
    formato: "9:16",
    W,
    H,
    fps: o.fps,
    duracao: o.duracao,
    palavras: o.falaDoCorte,
    legenda: o.legenda,
    cores: o.contexto.cores,
    jev: o.jev,
    projectId: o.projectId,
    temTrilha: o.temTrilha,
    textos: txt.textos,
    direcao: o.direcao ?? null,
  });
  return { edicao: m.edicao, elementos: elementos.length, gerados: [...gerados.values()], avisos: [...avisos, ...m.avisos], escolhas: m.escolhas, trilha: m.trilha, custoUsd: +custoUsd.toFixed(4) };
}
