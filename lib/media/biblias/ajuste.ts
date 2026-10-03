import type { Fundo, PlanoDeMontagem } from "@/lib/media/plano-de-montagem";
import type { BibliaDoEstilo } from "@/lib/media/biblias/tipos";

/**
 * O QUE A BÍBLIA GARANTE EM CÓDIGO (01/10/2026), depois do validador.
 *
 * Regra da casa: o que dá para garantir em código não fica na mão do modelo.
 * No vídeo MrBeast do Bruno, 26 de 33 cenas saíram em fundo escuro; o prompt
 * novo pede a cor da marca, mas a proporção é número, e número se confere.
 * Aqui o fundo que passa do teto da bíblia vira o fundo preferido do kit,
 * alternando, e dois fundos escuros seguidos são quebrados quando a bíblia
 * limita o escuro.
 */

/** A ordem de preferência de fundo de cada kit (o primeiro é a base). */
const PREFERIDOS: Record<BibliaDoEstilo["kit"], Fundo[]> = {
  colagem: ["papel", "papel-marca", "escuro"],
  impacto: ["papel-marca", "escuro"],
  sobrio: ["escuro", "papel", "papel-marca"],
};

export function ajustarAoEstilo(plano: PlanoDeMontagem, b: BibliaDoEstilo): { plano: PlanoDeMontagem; avisos: string[] } {
  const cenas = plano.cenas.map((c) => ({ ...c }));
  const avisos: string[] = [];
  // Só as cenas em que o fundo aparece (o B-roll cobre o quadro inteiro).
  const comFundo = cenas.map((c, i) => ({ c, i })).filter(({ c }) => c.layout !== "broll-cheio");
  if (!comFundo.length) return { plano, avisos };
  const preferidos = PREFERIDOS[b.kit];

  for (const [fundo, max] of Object.entries(b.paleta.fundosMax) as Array<[Fundo, number]>) {
    const usam = comFundo.filter(({ c }) => c.fundo === fundo);
    const teto = Math.floor(max * comFundo.length);
    if (usam.length <= teto) continue;
    const alternativas = preferidos.filter((f) => f !== fundo && (b.paleta.fundosMax[f] ?? 1) > 0);
    if (!alternativas.length) continue;
    // Troca o excedente espalhado pelo vídeo (passo n/p >= 1: posições distintas).
    const precisa = usam.length - teto;
    let trocados = 0;
    for (let j = 0; j < precisa; j++) {
      const k = Math.min(usam.length - 1, Math.floor(((j + 0.5) * usam.length) / precisa));
      cenas[usam[k].i].fundo = alternativas[trocados % alternativas.length];
      trocados++;
    }
    if (trocados) avisos.push(`bíblia ${b.id}: ${trocados} fundo(s) "${fundo}" trocados (teto de ${Math.round(max * 100)}% das cenas com fundo)`);
  }

  // Dois escuros seguidos quando a bíblia limita o escuro (MrBeast: nunca).
  const tetoEscuro = b.paleta.fundosMax.escuro;
  if (tetoEscuro !== undefined && tetoEscuro <= 0.3) {
    let quebrados = 0;
    for (let k = 1; k < comFundo.length; k++) {
      const atual = cenas[comFundo[k].i];
      const antes = cenas[comFundo[k - 1].i];
      if (atual.fundo === "escuro" && antes.fundo === "escuro") {
        atual.fundo = preferidos[0] === "escuro" ? preferidos[1] : preferidos[0];
        quebrados++;
      }
    }
    if (quebrados) avisos.push(`bíblia ${b.id}: ${quebrados} fundo(s) escuro(s) seguido(s) quebrados`);
  }
  return { plano: { ...plano, cenas }, avisos };
}
