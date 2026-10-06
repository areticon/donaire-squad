// E0 da jornada oficial do editor (docs/editor-jornada-0610.md): o estado, o roteador e CADA EDIÇÃO É NOVA.
//   - duas gerações com a mesma entrada dão nomes de mídia diferentes;
//   - nenhum createHash nem allowOverwrite: true em lib/media/jornada;
//   - o roteador é o único ponto que escolhe a esteira do completo e, desligado, nada muda.
// Rodar: npx tsx --test scripts/testes/jornada-e0-estado.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { editorJornadaLigado, esteiraDoCompleto, nomeDaMidia, novaEdicaoId, GRAVACAO_DA_JORNADA, semTravessao } from "@/lib/media/jornada/estado";

const PASTA = "lib/media/jornada";
const fontes = () => readdirSync(PASTA).filter((f) => f.endsWith(".ts")).map((f) => ({ f, t: readFileSync(join(PASTA, f), "utf8") }));

test("nome de mídia único por geração: a mesma entrada nunca repete o nome", () => {
  const nomes = new Set(Array.from({ length: 300 }, () => nomeDaMidia({ videoId: "v1", edicaoId: "e1", elementoId: "el1", ext: "webp" })));
  assert.equal(nomes.size, 300);
  for (const n of nomes) assert.match(n, /^edicao\/v1\/e1\/el1-[a-z0-9]+\.webp$/);
  const ids = new Set(Array.from({ length: 300 }, () => novaEdicaoId()));
  assert.equal(ids.size, 300, "edicaoId novo a cada plano");
  assert.deepEqual(GRAVACAO_DA_JORNADA, { addRandomSuffix: true, allowOverwrite: false });
});

test("nenhum createHash nem allowOverwrite: true no caminho da jornada", () => {
  for (const { f, t } of fontes()) {
    assert.ok(!/createHash/.test(t), `${f} usa createHash`);
    assert.ok(!/allowOverwrite:\s*true/.test(t), `${f} grava por cima`);
  }
});

test("o roteador: desligado, a esteira de sempre; ligado, a jornada", () => {
  const antes = process.env.EDITOR_JORNADA;
  try {
    delete process.env.EDITOR_JORNADA;
    assert.equal(editorJornadaLigado(), false);
    assert.equal(esteiraDoCompleto({ porComando: true, sobMedida: false }), "por-comando");
    assert.equal(esteiraDoCompleto({ porComando: false, sobMedida: true }), "sob-medida");
    assert.equal(esteiraDoCompleto({ porComando: false, sobMedida: false }), "antiga");
    process.env.EDITOR_JORNADA = "1";
    assert.equal(esteiraDoCompleto({ porComando: true, sobMedida: true }), "jornada");
  } finally {
    if (antes === undefined) delete process.env.EDITOR_JORNADA;
    else process.env.EDITOR_JORNADA = antes;
  }
});

test("o roteador é chamado no roteiro e na montagem do completo", () => {
  assert.match(readFileSync("lib/media/roteiro-da-edicao.ts", "utf8"), /esteiraDoCompleto\(/);
  assert.match(readFileSync("lib/media/montagem-do-completo.ts", "utf8"), /esteiraDoCompleto\(/);
});

test("sem travessão nos textos da jornada", () => {
  assert.equal(semTravessao("a — b"), "a, b");
  for (const { f, t } of fontes()) assert.ok(!/—/.test(t), `${f} tem travessão`);
});
