import type { LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { duracaoEditada, frasesDaFala, reprojetarNoTempo, type Frase, type Palavra, type Pedaco } from "@/lib/media/jornada/linha-do-tempo";
import type { AmostraDaJornada, ElementoProposto, EstadoDaJornada, RevisaoDoElemento } from "@/lib/media/jornada/estado";

/**
 * A JORNADA ACOMPANHA O CORTE DO CLIENTE NO VÍDEO COMPLETO (08/10). Módulo puro.
 *
 * O pedido do Bruno: "às vezes o usuário não quer um corte de um vídeo
 * pequeno, ele quer o vídeo mas sem o começo, sem o fim, ou um pequeno corte
 * no meio que a IA deixou passar". Cortar a fala do completo muda a lista de
 * palavras em que o plano por elemento foi escrito: cada elemento guarda a
 * palavra que o chama (`gatilho.indice`) e a frase do momento
 * (`momento.indice`) NA FALA DO ROTEIRO. Se a fala muda e os índices ficam,
 * o número ou a imagem entram uns 20 s antes ou depois da fala.
 *
 * Aqui os elementos vão para a fala nova pela CONTA EXATA DE ÍNDICES (o mapa
 * de `mapaExatoEntreFalas`: o que ficou é a mesma palavra da gravação, o que
 * saiu é null), nunca por alinhamento de texto:
 *
 *   - a palavra do gatilho ficou: o elemento entra nela;
 *   - a palavra do gatilho saiu: entra na palavra viva mais perto DENTRO do
 *     mesmo momento (no empate, a de depois);
 *   - o momento inteiro saiu: o elemento sai, com a revisão "removido: a fala
 *     foi cortada por você" e um aviso que o cliente lê;
 *   - a frase do momento é refeita na fala nova (`frasesDaFala`), porque a
 *     montagem acha o momento pelo índice da frase na fala que ela recebe.
 *
 * Vale para o plano e para o aprovado (congelado): só MOVE no tempo, sem
 * acrescentar nem trocar elemento; o único que sai é o que não tem mais fala.
 * A leitura do vídeo e as amostras, que só existem no tempo editado, passam
 * pela gravação (`reprojetarNoTempo`).
 */

export const MOTIVO_DA_FALA_CORTADA = "removido: a fala foi cortada por você";

export type ElementoQueSaiu = { id: string; descricao: string; frase: string; inicio: number };

export type CorteNaJornada = {
  /** `mapa[i]`: a posição na fala nova da palavra i da fala antiga, ou null se ela saiu. */
  mapa: ReadonlyArray<number | null>;
  /** A fala em que o plano foi escrito (a do roteiro) e a fala depois do corte. */
  falaVelha: Palavra[];
  falaNova: Palavra[];
  /** Os pedaços da gravação de cada fala, para levar a leitura e as amostras. */
  manterVelho: Pedaco[];
  manterNovo: Pedaco[];
  agora?: string;
};

const semPontuacao = (s: string) => s.replace(/[.,!?;:…"“”]+$/g, "").replace(/^["“]+/, "");

/**
 * As palavras (na fala antiga) do momento de um elemento. Pelo TEMPO do
 * momento, e não pelo índice da frase: o fatiamento em frases mudou em 07/10
 * (12 palavras, era 22), e o índice de um plano feito antes aponta para outra
 * frase hoje. O gatilho fica sempre dentro.
 */
export function palavrasDoMomento(el: Pick<ElementoProposto, "momento" | "gatilho">, fala: Palavra[]): [number, number] {
  const g = Math.max(0, Math.min(fala.length - 1, el.gatilho.indice));
  let de = g;
  let ate = g;
  for (let k = 0; k < fala.length; k++) {
    if (fala[k].inicio < el.momento.de - 0.05 || fala[k].inicio >= el.momento.ate + 0.05) continue;
    de = Math.min(de, k);
    ate = Math.max(ate, k);
  }
  return [de, ate];
}

/** A posição na fala nova em que o elemento entra, ou null quando a fala do momento saiu inteira. */
export function gatilhoNaFalaNova(el: Pick<ElementoProposto, "momento" | "gatilho">, mapa: ReadonlyArray<number | null>, falaVelha: Palavra[]): number | null {
  const g = el.gatilho.indice;
  const direto = mapa[g];
  if (direto !== null && direto !== undefined) return direto;
  const [de, ate] = palavrasDoMomento(el, falaVelha);
  for (let d = 1; d <= Math.max(g - de, ate - g); d++) {
    const depois = mapa[g + d];
    if (g + d <= ate && depois !== null && depois !== undefined) return depois;
    const antes = mapa[g - d];
    if (g - d >= de && antes !== null && antes !== undefined) return antes;
  }
  return null;
}

function levarElemento<T extends ElementoProposto>(el: T, c: CorteNaJornada, frasesNovas: Frase[]): T | null {
  const k = gatilhoNaFalaNova(el, c.mapa, c.falaVelha);
  if (k === null) return null;
  const f = frasesNovas.find((x) => k >= x.de && k <= x.ate);
  const w = c.falaNova[k];
  if (!f || !w) return null;
  const mesma = c.mapa[el.gatilho.indice] === k;
  return {
    ...el,
    momento: { indice: f.indice, de: f.inicio, ate: f.fim, frase: f.texto },
    gatilho: { palavra: mesma ? el.gatilho.palavra : semPontuacao(w.texto), indice: k, t: w.inicio },
  };
}

/** A leitura do vídeo no tempo editado novo: o trecho cuja imagem saiu inteira sai junto. */
export function leituraNoCorteNovo(leitura: LeituraDoVideo, manterVelho: Pedaco[], manterNovo: Pedaco[]): LeituraDoVideo {
  const fim = duracaoEditada(manterNovo);
  const trechos: TrechoLido[] = [];
  for (const t of leitura.trechos) {
    const de = reprojetarNoTempo(t.de, manterVelho, manterNovo, { lado: "inicio" });
    const ate = reprojetarNoTempo(t.ate, manterVelho, manterNovo, { lado: "fim" }) ?? fim;
    if (de === null || ate - de < 0.2) continue;
    const pontos = (t.pontos ?? [])
      .map((p) => ({ ...p, t: reprojetarNoTempo(p.t, manterVelho, manterNovo, { estrito: true }) }))
      .filter((p): p is typeof p & { t: number } => p.t !== null && p.t >= de && p.t <= ate);
    const { pontos: _antigos, ...resto } = t;
    void _antigos;
    trechos.push({ ...resto, de, ate, ...(pontos.length ? { pontos } : {}) });
  }
  return { ...leitura, trechos };
}

/** As amostras (rosto e corpo a cada ~2 s) no tempo editado novo; a do quadro que saiu não existe mais. */
export function amostrasNoCorteNovo(amostras: AmostraDaJornada[], manterVelho: Pedaco[], manterNovo: Pedaco[]): AmostraDaJornada[] {
  const saida: AmostraDaJornada[] = [];
  for (const a of amostras) {
    const t = reprojetarNoTempo(a.t, manterVelho, manterNovo, { estrito: true });
    if (t !== null) saida.push({ ...a, t });
  }
  return saida;
}

/**
 * O estado inteiro da jornada levado para a fala nova. O de entrada não é
 * tocado. Devolve os elementos que saíram (o momento deles foi cortado), para
 * a tela e a mensagem ao cliente dizerem quais.
 */
export function levarJornadaParaFalaNova(estado: EstadoDaJornada, c: CorteNaJornada): { estado: EstadoDaJornada; sairam: ElementoQueSaiu[]; movidos: number } {
  const e = JSON.parse(JSON.stringify(estado)) as EstadoDaJornada;
  const frasesNovas = frasesDaFala(c.falaNova);
  const agora = c.agora ?? new Date().toISOString();
  const sairam = new Map<string, ElementoQueSaiu>();
  let movidos = 0;
  // O que o cliente já tinha removido na revisão não "sai pelo corte" (revisão de 08/10): a mensagem dizia que saiu um elemento que ele mesmo já tinha tirado.
  const jaRemovido = (id: string) => e.revisao[id]?.acao === "removido";
  const levarLista = <T extends ElementoProposto>(lista: T[], descricaoDe: (el: T) => string): T[] => {
    const saida: T[] = [];
    for (const el of lista) {
      const novo = levarElemento(el, c, frasesNovas);
      if (!novo) {
        if (!sairam.has(el.id) && !jaRemovido(el.id)) sairam.set(el.id, { id: el.id, descricao: descricaoDe(el), frase: el.momento.frase, inicio: el.gatilho.t });
        continue;
      }
      if (novo.gatilho.indice !== el.gatilho.indice || novo.momento.indice !== el.momento.indice) movidos++;
      saida.push(novo);
    }
    return saida.sort((a, b) => a.gatilho.t - b.gatilho.t);
  };
  if (e.plano) {
    const elementos = levarLista(e.plano.elementos, (el) => e.revisao[el.id]?.descricaoAprovada ?? el.descricao);
    const custoQueSaiu = e.plano.elementos.filter((el) => sairam.has(el.id)).reduce((s, el) => s + (el.custoUsd ?? 0), 0);
    e.plano = {
      ...e.plano,
      elementos,
      duracao: duracaoEditada(c.manterNovo),
      custoTotalUsd: Math.max(0, +(e.plano.custoTotalUsd - custoQueSaiu).toFixed(4)),
    };
  }
  if (e.aprovado) e.aprovado = { ...e.aprovado, elementos: levarLista(e.aprovado.elementos, (el) => el.descricao) };
  // O que saiu fica dito na revisão do elemento (o cliente vê o porquê) e nos avisos.
  for (const s of sairam.values()) {
    const rev: RevisaoDoElemento = e.revisao[s.id] ?? { id: s.id, acao: "removido", pedidos: [], descricaoAprovada: s.descricao, textoNaImagemAprovado: null };
    e.revisao[s.id] = { ...rev, acao: "removido", pedidos: [...rev.pedidos, { texto: MOTIVO_DA_FALA_CORTADA, em: agora }] };
  }
  if (sairam.size) e.avisos = [...(e.avisos ?? []), ...[...sairam.values()].map((s) => `O elemento "${s.descricao.slice(0, 80)}" saiu: a fala dele foi cortada por você.`)].slice(-30);
  if (e.midiasMantidas) e.midiasMantidas = Object.fromEntries(Object.entries(e.midiasMantidas).filter(([id]) => !sairam.has(id)));
  if (e.ajuste) e.ajuste = { ...e.ajuste, afetados: e.ajuste.afetados.filter((id) => !sairam.has(id)) };
  if (e.leitura) e.leitura = leituraNoCorteNovo(e.leitura, c.manterVelho, c.manterNovo);
  if (e.amostras?.length) e.amostras = amostrasNoCorteNovo(e.amostras, c.manterVelho, c.manterNovo);
  return { estado: e, sairam: [...sairam.values()], movidos };
}
