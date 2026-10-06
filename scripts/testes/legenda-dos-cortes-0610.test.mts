// A prova da legenda dos cortes ligada por padrão (06/10, tarde): o "sem
// legenda" do projeto tira só a do completo; os cortes ficam legendados até o
// cliente tirar deles também. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/legenda-dos-cortes-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { legendaDecidida, legendaDoCorteDecidida } from "@/lib/media/legenda-escolhida";
import { normalizarEscolha } from "@/lib/media/catalogo-de-estilos";
import { edicaoDaLinguagem } from "@/lib/media/linguagem-da-edicao";

test("o \"sem\" do projeto vale para o completo; os cortes seguem legendados no automático", () => {
  assert.deepEqual(legendaDecidida({ modo: "sem" }, "colagem"), { mostrar: false });
  assert.deepEqual(legendaDoCorteDecidida({ modo: "sem" }, undefined, "colagem"), { mostrar: true, estilo: "papel", automatica: true });
});

test("o cliente pode tirar também dos cortes, ou fixar um estilo só neles", () => {
  assert.deepEqual(legendaDoCorteDecidida({ modo: "sem" }, { modo: "sem" }, "impacto"), { mostrar: false });
  assert.deepEqual(legendaDoCorteDecidida({ modo: "sem" }, { modo: "estilo", estilo: "caixa" }, "impacto"), { mostrar: true, estilo: "caixa", automatica: false });
});

test("sem o \"sem\", os cortes seguem a legenda do projeto, como antes", () => {
  assert.deepEqual(legendaDoCorteDecidida({ modo: "estilo", estilo: "marca-texto" }, undefined, "sobrio"), { mostrar: true, estilo: "marca-texto", automatica: false });
  assert.deepEqual(legendaDoCorteDecidida(undefined, undefined, "sobrio"), { mostrar: true, estilo: "limpa", automatica: true });
});

test("a escolha guardada leva a legenda dos cortes, e a edição do corte a respeita", () => {
  // O projeto de teste do Bruno (06/10): Vox com "sem legenda" guardado.
  const doBruno = { estiloId: "vox", camera: ["dolly-in"], efeitos: ["recorte"], legenda: { modo: "sem" }, insercoesIA: true };
  assert.equal(normalizarEscolha(doBruno).legendaDosCortes, undefined);
  assert.equal(edicaoDaLinguagem(doBruno, "serio", "#111111,#f97316", "corte").legenda.mostrar, true, "os cortes saem legendados");
  assert.equal(edicaoDaLinguagem(doBruno, "serio", "#111111,#f97316", "completo").legenda.mostrar, false, "o completo segue sem");
  assert.equal(edicaoDaLinguagem(doBruno, "serio", "#111111,#f97316").legenda.mostrar, false, "o padrão do parâmetro é o completo");
  const tudoSem = { ...doBruno, legendaDosCortes: { modo: "sem" } };
  assert.deepEqual(normalizarEscolha(tudoSem).legendaDosCortes, { modo: "sem" });
  assert.equal(edicaoDaLinguagem(tudoSem, "serio", "#111111,#f97316", "corte").legenda.mostrar, false);
});
