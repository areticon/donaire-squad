// A prova dos textos e do caminho das prévias da biblioteca (06/10/2026,
// card 711): um jogo de textos só, coerente com a frase de exemplo, sem
// travessão e sem o assunto de outro setor; e a assinatura da composição,
// que torna a recomposição idempotente. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/previas-da-biblioteca-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { MODELOS_DE_ARTE, modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import { assinaturaDaPrevia, caminhoDaComposta, modeloPedeRecorte, textosDaPrevia } from "@/lib/biblioteca-de-design/previas";

test("os textos da prévia: um jogo só, coerente com a frase, sem travessão nem assunto de outro setor", () => {
  for (const m of MODELOS_DE_ARTE) {
    const t = textosDaPrevia(m);
    const tudo = JSON.stringify(t);
    assert.ok(!/[—–]/.test(tudo), `${m.id}: travessão`);
    assert.ok(!/Indicação|indicação|Cliente bem atendido|Pós-venda|Atenda bem/.test(tudo), `${m.id}: texto do jogo "negocios": ${tudo}`);
    assert.ok(t.titulo.trim().length > 0, `${m.id}: sem título`);
  }
});

test("a assinatura muda com a entrada e repete com a mesma entrada", () => {
  const m = modeloPorId("foto-legenda-escura")!;
  const foto = Buffer.from("foto-a");
  const a = assinaturaDaPrevia({ modelo: m, textos: textosDaPrevia(m), foto, recorte: null });
  assert.equal(a, assinaturaDaPrevia({ modelo: m, textos: textosDaPrevia(m), foto: Buffer.from("foto-a"), recorte: null }));
  assert.notEqual(a, assinaturaDaPrevia({ modelo: m, textos: textosDaPrevia(m), foto: Buffer.from("foto-b"), recorte: null }));
  assert.notEqual(a, assinaturaDaPrevia({ modelo: m, textos: { ...textosDaPrevia(m), titulo: "outra" }, foto, recorte: null }));
  assert.match(caminhoDaComposta("abc", a), /^biblioteca-de-design\/previas\/compostas\/abc-[0-9a-f]{16}\.jpg$/);
});

test("só os modelos de pessoa recortada fora do Vox pedem o recorte", () => {
  assert.equal(modeloPedeRecorte(modeloPorId("voce-na-frente-do-titulo")!), true);
  assert.equal(modeloPedeRecorte(modeloPorId("frase-fundo-escuro")!), false);
  for (const m of MODELOS_DE_ARTE.filter((x) => x.arquetipo.startsWith("vox-"))) assert.equal(modeloPedeRecorte(m), false, m.id);
});
