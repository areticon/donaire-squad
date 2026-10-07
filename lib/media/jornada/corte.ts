import type { Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { frasesDaFala } from "@/lib/media/jornada/linha-do-tempo";
import type { AmostraDaJornada, Caixa, ElementoAprovado } from "@/lib/media/jornada/estado";
import type { ElementoGerado } from "@/lib/media/jornada/geracao";
import type { ElementoParaMontar } from "@/lib/media/jornada/montagem";

/**
 * O CORTE PELA JORNADA (08/10/2026). Até aqui os cortes (os vídeos curtos)
 * nunca passavam pela jornada: iam pelo editor por comando, com peças
 * desenhadas em código e o "curtir e se inscrever" estourando a tela, e por
 * isso "saíam iguais a ontem" mesmo com o completo mudando (projeto Igor,
 * 07/10). Agora o corte usa o MESMO plano aprovado pelo cliente: os elementos
 * cujo gatilho foi dito dentro do corte, no tempo do corte, com as mídias já
 * geradas para o completo (o corte não paga a imagem duas vezes).
 *
 * O elemento é achado no corte pela SEQUÊNCIA de palavras em volta do gatilho
 * (o gatilho e as vizinhas, em ordem), e não pelo alinhamento guloso da fala
 * inteira: num corte, a fala do plano é o vídeo todo e a do corte é um pedaço,
 * e palavras comuns ("que", "o") casavam do lado errado. Módulo puro.
 */

const normal = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * Onde a palavra `indice` da fala do plano está na fala do corte: a janela de
 * até 3 palavras antes e 3 depois tem de casar em sequência (no mínimo 4
 * palavras, ou a fala inteira do corte se ela for menor). -1 quando não está.
 */
export function indiceNoCorte(falaDoPlano: Palavra[], falaDoCorte: Palavra[], indice: number): number {
  const plano = falaDoPlano.map((p) => normal(p.texto));
  const corte = falaDoCorte.map((p) => normal(p.texto));
  if (!plano[indice]) return -1;
  let melhor = -1;
  let melhorCasadas = 0;
  for (let k = 0; k < corte.length; k++) {
    if (corte[k] !== plano[indice]) continue;
    let casadas = 1;
    for (let d = 1; d <= 3; d++) {
      if (indice - d >= 0 && k - d >= 0 && plano[indice - d] === corte[k - d]) casadas++;
      if (indice + d < plano.length && k + d < corte.length && plano[indice + d] === corte[k + d]) casadas++;
    }
    if (casadas > melhorCasadas) {
      melhorCasadas = casadas;
      melhor = k;
    }
  }
  const minimo = Math.min(4, corte.length);
  return melhorCasadas >= minimo ? melhor : -1;
}

/**
 * Os elementos aprovados que entram no corte, com o gatilho e a frase no
 * tempo do corte. A frase vai do começo dela no corte (ou do começo do corte)
 * ao fim dela (ou ao fim do corte).
 */
export function elementosNoCorte(
  aprovados: readonly ElementoAprovado[],
  falaDoPlano: Palavra[],
  falaDoCorte: Palavra[],
  duracaoDoCorte: number
): Array<{ aprovado: ElementoAprovado; t: number; fraseDe: number; fraseAte: number }> {
  const frases = frasesDaFala(falaDoPlano);
  const saida: Array<{ aprovado: ElementoAprovado; t: number; fraseDe: number; fraseAte: number }> = [];
  for (const el of aprovados) {
    const k = indiceNoCorte(falaDoPlano, falaDoCorte, el.gatilho.indice);
    if (k < 0) continue;
    const t = falaDoCorte[k].inicio;
    const f = frases.find((x) => x.indice === el.momento.indice);
    const kDe = f ? indiceNoCorte(falaDoPlano, falaDoCorte, f.de) : -1;
    const kAte = f ? indiceNoCorte(falaDoPlano, falaDoCorte, f.ate) : -1;
    const fraseDe = kDe >= 0 && kDe <= k ? falaDoCorte[kDe].inicio : Math.max(0, t - 0.3);
    const fraseAte = kAte >= k ? falaDoCorte[kAte].fim : Math.min(duracaoDoCorte, falaDoCorte[k].fim + 1.5);
    saida.push({ aprovado: el, t, fraseDe, fraseAte });
  }
  return saida.sort((a, b) => a.t - b.t);
}

/** As amostras do corte: o rosto e a pessoa medidos no quadro do corte, a cada 2 s (o corte não tem medição própria). */
export function amostrasDoCorte(duracao: number, rosto: Caixa | null, pessoa: Caixa | null): AmostraDaJornada[] {
  const saida: AmostraDaJornada[] = [];
  for (let t = 0; t <= duracao + 1e-9; t += 2) saida.push({ t: +t.toFixed(2), rostos: rosto ? [rosto] : [], corpos: pessoa ? [pessoa] : [], tela: null, quadro: null });
  return saida;
}

/** A mídia gravada do completo vira o "gerado" do corte, sem custo (ou o gráfico, que não tem mídia). */
export function geradoDoCompleto(
  el: ElementoAprovado,
  midia: { url: string | null; tipo: "imagem" | "recorte" | "video" | null; formato: string; proporcao: number | null } | undefined
): ElementoGerado | null {
  if (el.formato === "grafico" || midia?.formato === "grafico") {
    return { id: el.id, url: null, tipo: null, formato: "grafico", proporcao: null, custoUsd: 0, modelo: "grafico em código", rodadas: 0, prompt: "", avisoAdmin: null, avisoCliente: null, tempos: { gerar: 0, recorte: 0, leitura: 0 } };
  }
  if (!midia?.url || !midia.tipo) return null;
  return { id: el.id, url: midia.url, tipo: midia.tipo, formato: midia.formato as ElementoGerado["formato"], proporcao: midia.proporcao, custoUsd: 0, modelo: "mantida do completo", rodadas: 0, prompt: "", avisoAdmin: null, avisoCliente: null, tempos: { gerar: 0, recorte: 0, leitura: 0 } };
}

/** Junta o elemento no tempo do corte com a mídia dele (os que não têm mídia ficam de fora, com o id na lista de faltas). */
export function paraMontarNoCorte(
  noCorte: ReturnType<typeof elementosNoCorte>,
  gerados: Map<string, ElementoGerado>
): { elementos: ElementoParaMontar[]; faltam: string[] } {
  const elementos: ElementoParaMontar[] = [];
  const faltam: string[] = [];
  for (const x of noCorte) {
    const g = gerados.get(x.aprovado.id);
    if (!g) {
      faltam.push(x.aprovado.id);
      continue;
    }
    elementos.push({ aprovado: x.aprovado, gerado: g, t: x.t, fraseDe: x.fraseDe, fraseAte: x.fraseAte });
  }
  return { elementos, faltam };
}
