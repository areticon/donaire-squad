// E1 da jornada: a leitura do vídeo ANTES do plano, em trechos finos, levada para o tempo editado.
//   - tempoEditado contra remoções conhecidas;
//   - nenhum trecho lido passa de 10 s (e todos alinham ao fim de uma frase ou à partição de uma frase longa);
//   - a leitura e as amostras vão para o tempo editado; trecho todo removido sai.
// Rodar: npx tsx --test scripts/testes/jornada-e1-leitura.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { amostrasNoTempoEditado, duracaoEditada, frasesDaFala, leituraNoTempoEditado, limitesFinos, manterDasRemocoes, tempoEditado } from "@/lib/media/jornada/linha-do-tempo";
import { resumirMedida, resumoSemMedida, type LeituraDoVideo } from "@/lib/media/leitura-do-video";

const palavrasDe = (texto: string, passo = 0.4, pausaEm: number[] = []) => {
  let t = 0;
  return texto.split(" ").map((w, i) => {
    if (pausaEm.includes(i)) t += 0.9;
    const p = { texto: w, inicio: +t.toFixed(3), fim: +(t + passo * 0.8).toFixed(3) };
    t += passo;
    return p;
  });
};

test("tempoEditado: remoções conhecidas", () => {
  const manter = manterDasRemocoes([{ de: 2, ate: 3 }, { de: 5, ate: 6.5 }], 10);
  assert.deepEqual(manter, [{ de: 0, ate: 2 }, { de: 3, ate: 5 }, { de: 6.5, ate: 10 }]);
  assert.equal(tempoEditado(1, manter), 1);
  assert.equal(tempoEditado(2.5, manter), 2, "dentro da remoção cai no começo do pedaço seguinte");
  assert.equal(tempoEditado(4, manter), 3);
  assert.equal(tempoEditado(7, manter), 4.5);
  assert.equal(tempoEditado(10, manter), 7.5);
  assert.equal(tempoEditado(11, manter), null);
  assert.equal(duracaoEditada(manter), 7.5);
});

test("trechos finos: nenhum passa de 10 s, cobrem o vídeo e fecham em fim de frase", () => {
  const texto = Array.from({ length: 60 }, (_, i) => (i % 9 === 8 ? `palavra${i}.` : `palavra${i}`)).join(" ");
  const palavras = palavrasDe(texto, 0.45);
  const dur = palavras.at(-1)!.fim + 0.5;
  const lim = limitesFinos(palavras, dur);
  assert.ok(lim.length >= 3);
  assert.equal(lim[0].de, 0);
  assert.ok(Math.abs(lim.at(-1)!.ate - dur) < 0.01);
  for (const l of lim) assert.ok(l.ate - l.de <= 10 + 1e-6, `trecho de ${l.ate - l.de} s`);
  for (let i = 1; i < lim.length; i++) assert.equal(lim[i].de, lim[i - 1].ate, "sem buraco");
  const fins = new Set(frasesDaFala(palavras).map((f) => f.fim));
  const alinhados = lim.slice(0, -1).filter((l) => fins.has(l.ate)).length;
  assert.ok(alinhados >= lim.length - 2, "quase todos fecham em fim de frase");
  // Uma frase longa sem pontuação (25 s): partida em pedaços de até 10 s.
  const longa = palavrasDe(Array.from({ length: 60 }, (_, i) => `x${i}`).join(" "), 0.42).map((p) => ({ ...p }));
  for (const l of limitesFinos(longa, 26)) assert.ok(l.ate - l.de <= 10 + 1e-6);
});

test("a medição resumida usa as fronteiras finas (nenhum trecho lido passa de 10 s)", () => {
  const amostras = Array.from({ length: 30 }, (_, i) => ({ t: i * 2, mov: 3, luz: 0.5, pessoas: [{ caixa: [0.3, 0.1, 0.4, 0.9], rosto: [0.42, 0.15, 0.16, 0.2], boca: 0.1 }], tela: null, quadro: null }));
  const palavras = palavrasDe(Array.from({ length: 120 }, (_, i) => (i % 11 === 10 ? `w${i}.` : `w${i}`)).join(" "), 0.48);
  const lim = limitesFinos(palavras, 60);
  const r = resumirMedida({ ok: true, largura: 1920, altura: 1080, fps: 30, duracao: 60, modo: "chave", amostras }, { palavras, duracao: 60 }, { limites: lim });
  assert.equal(r.trechos.length, lim.length);
  for (const t of r.trechos) assert.ok(t.ate - t.de <= 10 + 1e-6);
  const s = resumoSemMedida(60, "16:9", { palavras, duracao: 60 }, { limites: lim });
  for (const t of s.trechos) assert.ok(t.ate - t.de <= 10 + 1e-6);
});

test("leitura e amostras no tempo editado", () => {
  const manter = manterDasRemocoes([{ de: 10, ate: 20 }], 40);
  const leitura: LeituraDoVideo = {
    versao: 1, genero: "pessoa-falando", generoConfianca: 0.9, cenario: "cozinha", formato: "9:16", pessoas: [], resumo: "", fontes: { medicao: true, visao: "x" }, custoUsd: 0,
    trechos: [
      { de: 0, ate: 8, pessoasEmCena: [], movimento: "pouco", acontece: "a", mostra: [], falaDe: "a", areaLivre: [] },
      { de: 11, ate: 19, pessoasEmCena: [], movimento: "pouco", acontece: "removido", mostra: [], falaDe: "b", areaLivre: [] },
      { de: 22, ate: 30, pessoasEmCena: [], movimento: "pouco", acontece: "c", mostra: [], falaDe: "c", areaLivre: [] },
    ],
  };
  const e = leituraNoTempoEditado(leitura, manter);
  assert.deepEqual(e.trechos.map((t) => [t.de, t.ate, t.acontece]), [[0, 8, "a"], [12, 20, "c"]]);
  const am = amostrasNoTempoEditado({ amostras: [{ t: 4, mov: 1, luz: 1, pessoas: [{ caixa: [0, 0, 1, 1], rosto: [0.4, 0.1, 0.2, 0.2], boca: null }], tela: null, quadro: null }, { t: 15, mov: 1, luz: 1, pessoas: [], tela: null, quadro: null }, { t: 25, mov: 1, luz: 1, pessoas: [], tela: null, quadro: null }] }, manter);
  assert.deepEqual(am.map((a) => a.t), [4, 10, 15]);
  assert.equal(am[0].rostos.length, 1);
});
