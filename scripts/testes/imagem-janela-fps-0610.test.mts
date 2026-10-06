// A prova da janela de imagem e do fps das camadas (06/10, diagnóstico de cmux0hoxk, vertical 478x850 a 29,58):
// a janela não vira miniatura (mínimo relativo ao quadro), a legenda dela não repete o título nem começa cortada,
// e as camadas são desenhadas na taxa da gravação. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/imagem-janela-fps-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { caixaDaJanela, legendaDaJanela, textosDaPeca, LARGURA_MINIMA_DA_JANELA } from "@/lib/media/editor-por-comando/janela-de-imagem";
import type { TrechoLido } from "@/lib/media/leitura-do-video";
import { fpsDasCamadas, linhaCondensada } from "../../worker/src/edicao-sob-medida.mjs";

const ROSTO = { x: 0.3, y: 0.38, w: 0.4, h: 0.26 };
const trecho = (areaLivre: TrechoLido["areaLivre"]): TrechoLido => ({
  de: 0, ate: 60, pessoasEmCena: [{ id: "p1", caixa: { x: 0.15, y: 0.3, w: 0.7, h: 0.7 }, rosto: ROSTO, falando: true }], tela: null, quadro: null, movimento: "parado", acontece: "fala para a câmera", mostra: [], falaDe: "o que eles fazem", areaLivre,
});

test("vertical: a área livre estreita (a de 22% que virou miniatura) não serve; vai a faixa acima do rosto, larga", () => {
  const c = caixaDaJanela(trecho([{ x: 0.02, y: 0.03, w: 0.24, h: 0.2 }]), ROSTO, true);
  assert.ok(c, "a janela tem lugar");
  assert.ok(c!.w >= LARGURA_MINIMA_DA_JANELA.vertical, `largura ${c!.w}`);
  assert.ok(c!.y + c!.h <= ROSTO.y, "não desce sobre o rosto");
  assert.ok(c!.h >= 0.17);
});

test("vertical: área livre larga medida é usada inteira na largura", () => {
  const c = caixaDaJanela(trecho([{ x: 0.04, y: 0.04, w: 0.92, h: 0.3 }]), ROSTO, true);
  assert.ok(c && c.w >= 0.88, JSON.stringify(c));
});

test("vertical: rosto ocupando a altura toda, sem faixa nem área: a janela sai (miniatura nunca)", () => {
  assert.equal(caixaDaJanela(trecho([]), { x: 0.1, y: 0.12, w: 0.8, h: 0.62 }, true), null);
});

test("horizontal: sem área de 34% da largura, a janela sai", () => {
  assert.equal(caixaDaJanela(trecho([{ x: 0.7, y: 0.1, w: 0.2, h: 0.5 }]), ROSTO, false), null);
  assert.ok(caixaDaJanela(trecho([{ x: 0.55, y: 0.1, w: 0.42, h: 0.7 }]), ROSTO, false));
});

const fala = (frase: string, t0 = 10, passo = 0.3) => frase.split(" ").map((texto, i) => ({ texto, inicio: t0 + i * passo, fim: t0 + i * passo + 0.25 }));

test("legenda da janela: com título na tela no mesmo tempo, sai (repetia O QUE ELES ESTÃO FAZENDO)", () => {
  const palavras = fala("Olha. O que eles estão fazendo agora");
  const r = legendaDaJanela("o que eles estão fazendo", palavras, 10, 13, textosDaPeca({ titulo: "O QUE ELES **ESTÃO FAZENDO**" }));
  assert.deepEqual(r, { legenda: "", motivo: "titulo-na-tela" });
});

test("legenda da janela: com a legenda da fala ligada, sai (ela já diz a frase)", () => {
  const r = legendaDaJanela("O que eles estão", fala("Olha. O que eles estão fazendo agora"), 10, 13, [], true);
  assert.deepEqual(r, { legenda: "", motivo: "legenda-da-fala" });
});

test("legenda da janela: trecho com palavra faltando (o eles estão fazendo) não é fala; sai", () => {
  const r = legendaDaJanela("o eles estão fazendo", fala("Olha. O que eles estão fazendo agora"), 10, 13, []);
  assert.equal(r.motivo, "fora-da-fala");
  assert.equal(r.legenda, "");
});

test("legenda da janela: começando no meio da frase sai; no começo da frase fica", () => {
  const palavras = fala("Olha. O que eles estão fazendo agora");
  assert.equal(legendaDaJanela("eles estão fazendo", palavras, 10, 13, []).motivo, "meio-da-frase");
  assert.deepEqual(legendaDaJanela("O que eles estão", palavras, 10, 13, []), { legenda: "O que eles estão", motivo: null });
});

test("fps das camadas: o da gravação (29,58 fica 29,58); 60 vira 30; 50 vira 25; o env força, nunca acima da base", () => {
  delete process.env.SOB_MEDIDA_FPS_CAMADAS;
  assert.equal(fpsDasCamadas(29.58), 29.58);
  assert.equal(fpsDasCamadas(60), 30);
  assert.equal(fpsDasCamadas(50), 25);
  assert.equal(fpsDasCamadas(24), 24);
  process.env.SOB_MEDIDA_FPS_CAMADAS = "15";
  assert.equal(fpsDasCamadas(29.58), 15);
  process.env.SOB_MEDIDA_FPS_CAMADAS = "60";
  assert.equal(fpsDasCamadas(29.58), 29.58);
  delete process.env.SOB_MEDIDA_FPS_CAMADAS;
});

test("linha condensada na taxa da gravação: um quadro de camada por quadro do vídeo, a soma bate com a duração", () => {
  const fps = 29.58;
  const c = { de: 1, ate: 4, entrada: 0.7, saida: 0.3, evento: 0.6, eventos: [] };
  const { exibir } = linhaCondensada([c], 140.67, fps);
  const soma = exibir.reduce((s: number, e: { seg: number }) => s + e.seg, 0);
  assert.ok(Math.abs(soma * fps - Math.ceil(140.67 * fps)) < 1e-6, `quadros ${soma * fps}`);
  const ativos = exibir.filter((e: { tipo: string; seg: number }) => e.tipo === "quadro" && Math.abs(e.seg - 1 / fps) < 1e-9);
  assert.ok(ativos.length >= Math.floor(0.7 * fps), "a entrada é desenhada quadro a quadro na taxa do vídeo");
});
