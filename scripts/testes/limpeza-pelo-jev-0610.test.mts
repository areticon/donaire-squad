// A prova do "JEV decide a limpeza e as retomadas" (06/10, tarde): sem o
// interruptor explícito, o Claude não é chamado nem na dúvida nem na queda do
// JEV. Roda sem chave de JEV e sem chave do Claude: nada aqui toca IA ou rede.
// Rodar: npx tsx --test scripts/testes/limpeza-pelo-jev-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.TYPESAFE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.LIMPEZA_PELO_JEV;
delete process.env.RETOMADAS_PELO_JEV;
delete process.env.RETOMADAS_DUVIDA_NO_CLAUDE;

const { claudeNasRetomadas, cortaNaDuvida, decidirRetomadas, limpezaNoClaude, muletasPeloJev } = await import("@/lib/media/decidir-retomadas");
const { detectarHesitacao } = await import("@/lib/media/limpeza");

function fala(texto: string) {
  return texto.split(" ").map((word, i) => ({ word, start: i * 0.4, end: i * 0.4 + 0.35, confidence: 0.99 }));
}

test("os interruptores: o Claude só com pedido explícito", () => {
  assert.deepEqual(claudeNasRetomadas(), { tudo: false, duvida: false });
  assert.equal(limpezaNoClaude(), false);
  process.env.RETOMADAS_DUVIDA_NO_CLAUDE = "1";
  process.env.LIMPEZA_PELO_JEV = "0";
  assert.deepEqual(claudeNasRetomadas(), { tudo: false, duvida: true });
  assert.equal(limpezaNoClaude(), true);
  delete process.env.RETOMADAS_DUVIDA_NO_CLAUDE;
  delete process.env.LIMPEZA_PELO_JEV;
});

test("a dúvida do JEV: fora da guarda nunca corta; na guarda, só quando ele pende para refez", () => {
  assert.equal(cortaNaDuvida(0.6, 0.7, false), false);
  assert.equal(cortaNaDuvida(0.6, 0.7, true), true);
  assert.equal(cortaNaDuvida(0.45, 0.9, true), false);
  assert.equal(cortaNaDuvida(0.6, 0.3, true), false);
  assert.equal(cortaNaDuvida(null, 0.9, true), false, "sem leitura do JEV, não corta");
});

test("sem JEV, a limpeza de muleta não chama o Claude: devolve vazio", async () => {
  const palavras = fala(
    Array.from({ length: 12 }, () => "então é assim, aí eu voltei para casa e falei com ela sobre o assunto do dia").join(" ")
  );
  assert.equal(await muletasPeloJev(palavras), null, "sem JEV não há decisão do JEV");
  assert.deepEqual(await detectarHesitacao(palavras), [], "e o Claude não entra no lugar");
});

test("sem JEV, as retomadas saem só pelo código, com zero chamadas ao Claude", async () => {
  const p = fala("hoje eu quero falar de foco e eu evitei usar a palavra e eu evitei usar a palavra produtividade porque ela cansa todo mundo que trabalha muito");
  const r = await decidirRetomadas(p);
  assert.equal(r.claudeChamadas, 0);
  assert.ok(r.remocoes.length >= 1, "a tomada refeita provada em código sai");
  assert.ok(r.decisoes.every((d) => d.quem === "codigo" || d.quem === "nenhum" || d.quem.endsWith("+veto")), JSON.stringify(r.decisoes.map((d) => d.quem)));
});
