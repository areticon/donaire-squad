// A prova do modelo por prompt do cliente (06/10, tarde): o design de imagem
// escrito na biblioteca vira modelo de arte, com a linguagem dele no prompt,
// e a esteira o acha pelo id. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/modelo-do-cliente-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { modeloDaPeca, modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import { designDoClienteVale, designDoModelo, idDoModeloDoDesign, modeloDoDesign, registrarModeloDoCliente } from "@/lib/modelos-de-arte/modelo-do-cliente";
import { preencherPromptDoModelo } from "@/lib/modelos-de-arte/prompt-do-modelo";
import { preencherCena, promptDoModelo, soTexto } from "@/lib/modelos-de-arte/prompts-com-foto";

const DESIGN = { id: "cmdesign123", nome: "Aquarela de cozinha", descricao: "Ilustração em aquarela com cores quentes", linguagem: "Loose watercolor illustration on textured paper, warm ochre and terracotta washes, visible brush strokes, hand-drawn kitchen props." };

test("o design vira modelo com prompt próprio, sem a foto editorial do book", () => {
  const m = modeloDoDesign(DESIGN)!;
  assert.equal(m.id, "design-cmdesign123");
  assert.equal(designDoModelo(m.id), "cmdesign123");
  assert.equal(idDoModeloDoDesign("x"), "design-x");
  assert.equal(soTexto(m), false, "tem imagem gerada");
  const prompt = promptDoModelo(m)!;
  assert.ok(prompt.includes("Loose watercolor illustration"), "a linguagem do cliente vai literal");
  assert.ok(!prompt.includes("Realistic editorial photograph"), "o estilo fixo do book não entra");
  assert.ok(/NO text/.test(prompt), "o modelo de imagem não escreve a manchete");
  assert.equal(modeloDoDesign({ ...DESIGN, linguagem: "  " }), null);
});

test("o prompt preenchido leva a cena, a paleta e a manchete, sem chave sobrando", () => {
  const m = modeloDoDesign(DESIGN)!;
  const cores = { acento: "#c2410c", escuro: "#1c1917", claro: "#fafaf9" } as never;
  const final = preencherCena(preencherPromptDoModelo({ ...m, prompt: promptDoModelo(m)! }, { cores, titulo: "Pão de fermentação natural em casa", formato: "post" }), "a rustic sourdough loaf on a wooden board");
  assert.ok(final.includes("a rustic sourdough loaf"));
  assert.ok(final.includes("Pão de fermentação natural em casa"));
  assert.ok(!/\{\w+\}/.test(final), final);
});

test("registrado no processo, o catálogo acha o modelo e a peça sai nele", () => {
  const m = modeloDoDesign(DESIGN)!;
  assert.equal(modeloPorId(m.id), undefined, "antes de registrar, não existe");
  registrarModeloDoCliente(m);
  assert.equal(modeloPorId(m.id)?.nome, "Aquarela de cozinha");
  for (const formato of ["post", "carrossel", "story"] as const) assert.equal(modeloDaPeca([m.id], formato, "qualquer frase")?.id, m.id, formato);
});

test("vale só o design do cliente mais recente que a escolha do book", () => {
  assert.equal(designDoClienteVale({ catalogoId: null, ligadoEm: "2026-10-06T15:00:00Z", escolhaDoBookEm: null }), true);
  assert.equal(designDoClienteVale({ catalogoId: null, ligadoEm: "2026-10-06T15:00:00Z", escolhaDoBookEm: "2026-10-06T14:00:00Z" }), true);
  assert.equal(designDoClienteVale({ catalogoId: null, ligadoEm: "2026-10-06T13:00:00Z", escolhaDoBookEm: "2026-10-06T14:00:00Z" }), false, "escolheu o book depois: volta ao book");
  assert.equal(designDoClienteVale({ catalogoId: "foto-inteira-degrade", ligadoEm: "2026-10-06T15:00:00Z" }), false, "semente do book segue pela escolha");
});
