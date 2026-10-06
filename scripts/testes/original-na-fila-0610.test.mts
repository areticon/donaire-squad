// A prova do original na fila do completo (06/10, tarde): o estado "na-fila"
// leva o completoOriginal certo e um editado nunca vira original.
// Rodar: npx tsx --test scripts/testes/original-na-fila-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { originalDaBase } from "@/lib/media/montagem-do-completo";

const BASE = "https://blob/cortes/v/completo-JDX4.mp4";
const EDITADO = "https://blob/cortes/v/completo-editado-1Ylj.mp4";

test("refeita com o original gravado: o mesmo original segue, com o tamanho", () => {
  assert.deepEqual(originalDaBase(BASE, { url: BASE, bytes: 123 }, EDITADO, BigInt(999)), { url: BASE, bytes: 123 });
});

test("refeita com o original perdido (passada 3): a base vira o original de novo", () => {
  assert.deepEqual(originalDaBase(BASE, null, EDITADO, BigInt(999)), { url: BASE, bytes: null });
});

test("original gravado errado (um editado): troca pela base", () => {
  assert.deepEqual(originalDaBase(BASE, { url: EDITADO, bytes: 5 }, EDITADO, BigInt(999)), { url: BASE, bytes: null });
});

test("completo novo do worker: a base nova é o original, com o tamanho do completoUrl", () => {
  const novo = "https://blob/cortes/v/completo-NOVO.mp4";
  assert.deepEqual(originalDaBase(novo, { url: BASE, bytes: 123 }, novo, BigInt(777)), { url: novo, bytes: 777 });
});

test("base editada (último recurso): nunca grava editado como original", () => {
  assert.equal(originalDaBase(EDITADO, null, EDITADO, BigInt(1)), null);
  assert.deepEqual(originalDaBase(EDITADO, { url: BASE, bytes: 1 }, EDITADO, BigInt(1)), { url: BASE, bytes: 1 });
});
