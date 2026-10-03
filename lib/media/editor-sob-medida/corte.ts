import type { Retangulo } from "@/lib/media/plano-de-montagem";
import type { EdicaoResolvida, PlanoResolvido } from "@/lib/media/editor-sob-medida/tipos";

/**
 * O EDITOR SOB MEDIDA NO CORTE (03/10/2026): o vídeo curto vertical passa
 * pelo mesmo editor do completo (lib/media/montagem-nos-cortes.ts liga), com
 * o que muda num corte de 30 a 90 s:
 *
 *   - a base é o trecho limpo da GRAVAÇÃO (o worker emenda pela edição gravada,
 *     sem legenda nem efeito) recortado em 9:16 em volta da pessoa
 *     (`quadroDoCorte`); o rosto que a câmera segue é medido nesse quadro;
 *   - o gancho mora nos primeiros 2 s e a densidade é alta (peça em 70% do
 *     tempo ou mais): `INSTRUCOES_DO_CORTE`;
 *   - o editor e o revisor olham de mais perto (`instantesDoCorte`, passo de
 *     6 s na revisão) e cada chamada cabe na passada do cron.
 *
 * Módulo puro.
 */

/** Fração mínima do corte com peça na tela (o pedido do dono: corte é curto). */
export const DENSIDADE_DO_CORTE = 0.7;

/** Os instantes que o editor vê no corte: um a cada 3 s, no máximo 30. */
export function instantesDoCorte(duracao: number): number[] {
  const passo = Math.max(3, duracao / 30);
  const saida: number[] = [];
  for (let t = 0.6; t < duracao - 0.3; t += passo) saida.push(+t.toFixed(2));
  return saida;
}

/**
 * O QUADRO 9:16 do corte dentro da gravação, em fração dela: altura inteira
 * (gravação deitada) com a largura de 9:16 centrada na pessoa e presa às
 * bordas; na gravação em pé mais alta que 9:16 (celular de 19,5:9), a largura
 * inteira e a sobra tirada 35% de cima, como o corte simples
 * (worker/src/ffmpeg.mjs, montarFiltroVertical).
 */
export function quadroDoCorte(fonte: { largura: number; altura: number }, pessoa: Retangulo | null | undefined): Retangulo {
  const W = Math.max(1, fonte.largura);
  const H = Math.max(1, fonte.altura);
  const alvo = 9 / 16;
  if (W / H > alvo) {
    const w = (H * alvo) / W;
    const centro = pessoa ? pessoa.x + pessoa.w / 2 : 0.5;
    const x = Math.min(1 - w, Math.max(0, centro - w / 2));
    return { x: +x.toFixed(4), y: 0, w: +w.toFixed(4), h: 1 };
  }
  const h = Math.min(1, (W / alvo) / H);
  return { x: 0, y: +((1 - h) * 0.35).toFixed(4), w: 1, h: +h.toFixed(4) };
}

/** Uma caixa em fração da gravação levada para fração do quadro do corte. */
export function noQuadroDoCorte(r: Retangulo, q: Retangulo): Retangulo {
  const x = (r.x - q.x) / q.w;
  const y = (r.y - q.y) / q.h;
  const w = r.w / q.w;
  const h = r.h / q.h;
  const x0 = Math.min(1, Math.max(0, x));
  const y0 = Math.min(1, Math.max(0, y));
  return { x: +x0.toFixed(4), y: +y0.toFixed(4), w: +Math.min(1 - x0, Math.max(0.02, w - (x0 - x))).toFixed(4), h: +Math.min(1 - y0, Math.max(0.02, h - (y0 - y))).toFixed(4) };
}

/**
 * O que o editor recebe a mais no corte. Vale sobre as regras gerais de
 * densidade do prompt (as do vídeo longo).
 */
export function instrucoesDoCorte(p: { duracao: number; titulo?: string | null }): string {
  const s = Math.round(p.duracao);
  return [
    `# ESTE É UM CORTE CURTO VERTICAL (${s} s, 9:16, Reels, Shorts e TikTok). As regras abaixo valem sobre as de densidade do vídeo longo.`,
    p.titulo ? `Título do corte: "${p.titulo}".` : "",
    `- GANCHO NOS PRIMEIROS 2 SEGUNDOS: a primeira peça entra em F0, na primeira palavra, e é a mais forte do corte: um "titulo" (ou "frase-impacto" curta, ou "pergunta-resposta") com a promessa ou a tensão do trecho, nas palavras do falante. Quem rola o feed decide ali se fica.`,
    `- DENSIDADE ALTA: peça na tela em pelo menos ${Math.round(DENSIDADE_DO_CORTE * 100)}% do tempo (mire em 80%), uma peça nova a cada 3 a 6 s, nenhum trecho de mais de 4 s sem peça. Num corte de ${s} s isso é de ${Math.max(6, Math.round(s / 6))} a ${Math.max(8, Math.round(s / 3.5))} momentos. Emende: o "ate" de uma peça cai perto do "de" da próxima.`,
    `- Use a duração toda de cada peça: título e ícone ficam até o fim da frase que os pede (até 6 s), painel e lista até o último item dito.`,
    `- Tela cheia no máximo 30% do tempo, nenhuma acima de 6 s, e NUNCA duas seguidas: entre duas peças de tela cheia o rosto volta por pelo menos 2 s (uma peça sobre a pessoa ou ao lado). O rosto é o que segura o corte.`,
    `- No 9:16 a cabeça ocupa o terço de cima: o título sobre a pessoa vai no peito (o código posiciona), então título de no máximo 6 palavras e 2 linhas.`,
    `- ÁREA SEGURA do 9:16: nada encostado nas bordas; a faixa da direita e o rodapé são da interface da rede (curtir, comentar, a legenda do post). O código posiciona as peças; você mantém os textos CURTOS (título até 6 palavras).`,
    `- Inserção gerada: no máximo 1 no corte inteiro, e só se agregar de verdade.`,
    `- Sem "fecho" com marca no fim, a menos que a pessoa faça uma chamada para ação no próprio trecho.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * O ADENSAMENTO do corte, depois da resolução: a peça "sobre a pessoa" que
 * acaba antes da hora estica até perto da próxima (respeitando o teto da
 * peça), sem mexer em tela cheia nem em cartão. Só fecha buracos curtos que
 * o modelo deixou entre duas peças; não inventa peça nova.
 */
export function adensarCorte(ed: EdicaoResolvida, maximo: Record<string, number>): { edicao: EdicaoResolvida; esticadas: number } {
  const comPlano = (de: number, ate: number) => (ed.planos ?? []).some((p) => p.de < ate && p.ate > de);
  const reais = ed.camadas.filter((c) => c.peca !== "moldura-do-cartao").sort((a, b) => a.de - b.de);
  let esticadas = 0;
  const camadas = ed.camadas.map((c) => ({ ...c }));
  for (let i = 0; i < reais.length; i++) {
    const c = camadas.find((x) => x.id === reais[i].id)!;
    if (comPlano(c.de, c.ate)) continue;
    const prox = reais[i + 1];
    const limite = Math.min(prox ? prox.de - 0.15 : ed.duracao, c.de + (maximo[c.peca] ?? c.ate - c.de));
    if (limite - c.ate > 0.3 && !comPlano(c.ate, limite)) {
      c.ate = +limite.toFixed(3);
      esticadas++;
    }
  }
  return { edicao: { ...ed, camadas }, esticadas };
}

/**
 * O ROSTO NO CORTE (prova de 03/10, corte 0 de cmurtv2zg): no 9:16 a cabeça
 * mora no terço de cima, e o título de três linhas no topo cobriu os olhos
 * quando a pessoa se inclinou. No corte:
 *   - o TÍTULO e a PERGUNTA E RESPOSTA sobre a pessoa descem para o peito
 *     (posição "baixo", acima da interface da rede);
 *   - duas peças de TELA CHEIA nunca encostam: a segunda começa 1,5 s depois
 *     da primeira (o rosto volta entre elas) ou cai, se ficar curta demais.
 *     Na prova, pergaminho, frase e cartões somaram 12 s sem rosto.
 */
export function arejarCorte(ed: EdicaoResolvida, minimo: Record<string, number>): { edicao: EdicaoResolvida; mudancas: string[] } {
  const mudancas: string[] = [];
  let camadas = ed.camadas.map((c) => ({ ...c, props: { ...c.props } }));
  let planos = [...(ed.planos ?? [])].sort((a, b) => a.de - b.de);
  const sobPlano = (c: { de: number; ate: number }) => planos.some((p) => p.de < c.ate && p.ate > c.de);
  for (const c of camadas) {
    if ((c.peca === "titulo" || c.peca === "pergunta-resposta") && !sobPlano(c) && c.props.posicao !== "baixo") {
      c.props.posicao = "baixo";
      mudancas.push(`${c.id}: ${c.peca} desceu para o peito`);
    }
  }
  const fora = new Set<string>();
  let fimDaTela = -Infinity;
  planos = planos.flatMap((p): PlanoResolvido[] => {
    if (p.tipo !== "grafico") return [p];
    const c = camadas.find((x) => Math.abs(x.de - p.de) < 0.01 && !fora.has(x.id) && x.peca !== "moldura-do-cartao");
    if (p.de - fimDaTela < 1.2 && c) {
      const novoDe = +(fimDaTela + 1.5).toFixed(3);
      if (p.ate - novoDe >= Math.max(1.8, minimo[c.peca] ?? 2)) {
        c.de = novoDe;
        c.eventos = c.eventos.map((e) => Math.max(e, novoDe + 0.25));
        mudancas.push(`${c.id}: tela cheia começou 1,5 s depois da anterior`);
        fimDaTela = p.ate;
        return [{ ...p, de: novoDe }];
      }
      fora.add(c.id);
      mudancas.push(`${c.id}: tela cheia colada na anterior, saiu`);
      return [];
    }
    fimDaTela = p.ate;
    return [p];
  });
  camadas = camadas.filter((c) => !fora.has(c.id));
  return { edicao: { ...ed, camadas, planos }, mudancas };
}

/** Fração do corte com peça (sem a moldura do cartão). */
export function densidadeDoCorte(ed: EdicaoResolvida): number {
  const D = Math.max(1, ed.duracao);
  const soma = ed.camadas.filter((c) => c.peca !== "moldura-do-cartao").reduce((s, c) => s + (c.ate - c.de), 0);
  return +(soma / D).toFixed(3);
}
