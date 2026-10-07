// E8 da jornada (08/10): número na tela só com o VALOR EXATO dito, e no formato brasileiro.
// Caso real: no vídeo do Igor (cmuy4y17i, 07/10) o redator escreveu "2.645" e a conferência aceitou porque a
// fala tinha "dois" em algum lugar; o desenho ainda leu "2.645" como 2,645 e mostrou "2,6".
// Rodar: npx tsx --test scripts/testes/jornada-e8-numeros.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { numeroFoiDito, numerosPorExtenso, partesDoNumero, valorDoNumero } from "@/lib/media/jornada/numeros";
import { conferirTexto } from "@/lib/media/jornada/textos";

test("valor do número no formato brasileiro", () => {
  assert.equal(valorDoNumero("2.645"), 2645);
  assert.equal(valorDoNumero("R$ 424.757"), 424757);
  assert.equal(valorDoNumero("2,5"), 2.5);
  assert.equal(valorDoNumero("424.757,30"), 424757.3);
  assert.equal(valorDoNumero("88%"), 88);
  assert.equal(valorDoNumero("24h"), 24);
  assert.deepEqual(partesDoNumero("R$ 2.645"), { antes: "R$ ", valor: 2645, casas: 0, depois: "" });
});

test("números por extenso", () => {
  assert.deepEqual(numerosPorExtenso("uma parcela de dois mil seiscentos e quarenta e cinco reais"), [1, 2645]);
  assert.deepEqual(numerosPorExtenso("crédito de quatrocentos e vinte e quatro mil setecentos e cinquenta e sete"), [424757]);
  assert.deepEqual(numerosPorExtenso("em vinte e quatro horas"), [24]);
});

test("número só se o valor exato foi dito", () => {
  const fala = "ele pagava uma parcela de dois mil seiscentos e quarenta e cinco reais por mês";
  assert.ok(numeroFoiDito("2.645", fala));
  assert.ok(numeroFoiDito("R$ 2.645", fala));
  assert.ok(!numeroFoiDito("2.465", fala), "valor trocado não passa");
  assert.ok(numeroFoiDito("2", "falei de dois anos e nada mais"), "dois foi dito");
  assert.ok(!numeroFoiDito("88%", fala), "número não dito não passa");
  assert.equal(conferirTexto({ titulo: "Parcela que cabia no bolso", numero: "2.645" }, fala)!.numero, "2.645");
  assert.equal(conferirTexto({ titulo: "Parcela que cabia no bolso", numero: "2.900" }, "dois anos depois ele dobrou")!.numero, undefined);
});

test("número na legenda legível", async () => {
  const { numeroNaLegenda } = await import("@/lib/media/jornada/numeros");
  assert.equal(numeroNaLegenda("424757"), "424.757");
  assert.equal(numeroNaLegenda("152638,"), "152.638,");
  assert.equal(numeroNaLegenda("2026"), "2026", "ano fica como está");
  assert.equal(numeroNaLegenda("moto"), "moto");
});
