// A prova da privacidade da biblioteca de design (06/10/2026, vazamento):
//   - o pedido cru só aparece para quem o escreveu (ou na semente);
//   - o comando de quem escolhe o design de outro cliente recebe o nome e a
//     descrição do visual, nunca o pedido cru;
//   - o pedido é cortado em trechos para o JEV decidir um por um;
//   - sem o JEV, nada é público (separação vazia, ficha não conferida).
// Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/biblioteca-privacidade-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { podeVerOPedido, textoParaOComando } from "@/lib/biblioteca-de-design/tipos";
import { fichaEstaLimpa, separarVisualDoCliente, trechosDoPedido } from "@/lib/biblioteca-de-design/privacidade";

delete process.env.TYPESAFE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const PEDIDO = "Visual claro e acolhedor com painel de vidro. Logo da Clínica Sorriso no canto, meu WhatsApp (11) 99999-0000 embaixo; foto do Dr. Paulo sorrindo";

test("o pedido cru só para o autor ou na semente", () => {
  assert.equal(podeVerOPedido({ origem: "cliente", meu: false }), false);
  assert.equal(podeVerOPedido({ origem: "cliente", meu: undefined }), false);
  assert.equal(podeVerOPedido({ origem: "cliente", meu: true }), true);
  assert.equal(podeVerOPedido({ origem: "semente", meu: false }), true);
});

test("o comando de quem escolhe o design de outro cliente não leva o pedido cru", () => {
  const d = { origem: "cliente" as const, meu: false, pedidoOriginal: PEDIDO, nome: "Clínica clara com vidro", descricao: "Painéis de vidro claros ao lado de quem fala." };
  const texto = textoParaOComando(d);
  assert.ok(!texto.includes("Sorriso") && !texto.includes("99999") && !texto.includes("Paulo"), texto);
  assert.equal(texto, "Clínica clara com vidro: Painéis de vidro claros ao lado de quem fala.");
  assert.equal(textoParaOComando({ ...d, meu: true }), PEDIDO);
  // Pedido vazio (como a rota manda para os outros) também cai na descrição.
  assert.ok(textoParaOComando({ ...d, meu: true, pedidoOriginal: "" }).startsWith("Clínica clara"));
});

test("o pedido vira trechos, um por frase ou oração", () => {
  const t = trechosDoPedido(PEDIDO);
  assert.ok(t.length >= 4, JSON.stringify(t));
  assert.ok(t.some((x) => x.includes("Sorriso")));
  assert.ok(t.some((x) => /painel de vidro/.test(x)));
  assert.ok(t.every((x) => !/[—–]/.test(x)));
});

test("sem o JEV nada é público", async () => {
  const s = await separarVisualDoCliente({ pedido: PEDIDO });
  assert.equal(s.peloJev, false);
  assert.deepEqual(s.visual, []);
  assert.equal(await fichaEstaLimpa({ nome: "x", descricao: "y", linguagem: "z" }), false);
});
