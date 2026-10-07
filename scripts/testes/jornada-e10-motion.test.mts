// E10 da jornada: o motion escrito na hora (protótipo de 07/10/2026). A trava do código que o Claude escreve:
//   - precisa da função criar(raiz, ctx) e de animar (.animate ou atualizar);
//   - nada de rede, relógio, armazenamento, imagem externa ou Math.random (comentário que só cita não conta);
//   - sintaxe fechada; texto escrito à mão só com as palavras permitidas;
//   - a peça do worker está registrada e sombreia os nomes perigosos.
// Nada aqui toca banco, IA paga ou rede. Rodar: npx tsx --test scripts/testes/jornada-e10-motion.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { conferirCodigo, extrairCodigo, escreverMotion, pedidoDoMotion, type EntradaDoMotion } from "@/lib/media/jornada/motion";

const entrada: EntradaDoMotion = {
  id: "el5",
  papel: "numero",
  fala: "no valor de 424757 reais",
  textos: { titulo: "", destaque: "", numero: "R$ 424.757", numeroPartes: { antes: "R$ ", valor: 424757, casas: 0, depois: "" }, itens: [] },
  caixa: { largura: 929, altura: 230, onde: "no alto" },
  duracao: 4.5,
  fundo: "parede clara",
};
const bom = 'function criar(raiz, ctx) {\n  // sem requestAnimationFrame: o sistema posiciona o tempo\n  const n = document.createElement("div");\n  raiz.appendChild(n);\n  n.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, fill: "both" });\n  return { atualizar(t) { n.textContent = ctx.textos.numeroPartes.antes + Math.round(ctx.textos.numeroPartes.valor * Math.min(1, t)).toLocaleString("pt-BR"); } };\n}';

test("o código bom passa; comentário que só cita um nome proibido não derruba", () => {
  assert.equal(conferirCodigo(bom, entrada), null);
  assert.equal(extrairCodigo("texto antes\n```js\n" + bom + "\n```\ndepois"), bom);
});

test("o que é proibido é recusado", () => {
  const casos: Array<[string, RegExp]> = [
    ["function criar(raiz, ctx) { requestAnimationFrame(() => 1); }", /requestAnimationFrame/],
    ["function criar(raiz, ctx) { fetch('https://x'); raiz.animate([], {}); }", /fetch/],
    ['function criar(raiz, ctx) { const i = document.createElement("img"); i.src = "https://x/a.png"; i.animate([], {}); }', /src/],
    ["function criar(raiz, ctx) { const r = Math.random(); raiz.animate([], {}); }", /random/],
    ["function criar(raiz, ctx) { window.top.x = 1; raiz.animate([], {}); }", /window/],
  ];
  for (const [codigo, motivo] of casos) assert.match(String(conferirCodigo(codigo, entrada)), motivo);
  assert.match(String(conferirCodigo("function criar(raiz, ctx) { raiz.animate([{}], {}) ", entrada)), /sintaxe/);
  assert.match(String(conferirCodigo("function outra(a) { a.animate([], {}); }", entrada)), /criar/);
  assert.match(String(conferirCodigo("function criar(raiz, ctx) { raiz.textContent = 'x'; }", entrada)), /não anima/);
});

test("texto escrito à mão fora do permitido é recusado (o número e a frase vêm de ctx.textos)", () => {
  const inventado = 'function criar(raiz, ctx) { const d = document.createElement("div"); d.textContent = "Dinheiro voando agora"; raiz.appendChild(d); d.animate([], {}); }';
  assert.match(String(conferirCodigo(inventado, entrada)), /fora do permitido/);
});

test("recusado duas vezes, a peça não sai (a montagem fica com a peça de reserva)", async () => {
  let chamadas = 0;
  const r = await escreverMotion(entrada, { marca: "X", nicho: null, fonte: "Geist", direcao: null, corDaMarca: "#0046eb", vizinhos: [] }, async () => {
    chamadas++;
    return "```js\nfunction criar(raiz, ctx) { setTimeout(() => 1); }\n```";
  });
  assert.equal(chamadas, 2);
  assert.equal(r.codigo, null);
  assert.match(String(r.motivo), /setTimeout/);
});

test("o pedido leva os textos exatos, a caixa e os vizinhos; a peça do worker está registrada e sombreia a rede", () => {
  const p = pedidoDoMotion(entrada, { marca: "Consórcio X", nicho: "consórcio", fonte: "Geist", direcao: null, corDaMarca: "#0046eb", vizinhos: ["R$ 2.645 (número contando)"] });
  assert.ok(p.includes('"numero":"R$ 424.757"') && p.includes("929 x 230 px") && p.includes("R$ 2.645"));
  const camadas = readFileSync("worker/remotion/src/sob-medida/Camadas.tsx", "utf8");
  assert.match(camadas, /"jornada-motion": MotionEscrito/);
  const peca = readFileSync("worker/remotion/src/jornada/MotionEscrito.tsx", "utf8");
  for (const nome of ["fetch", "XMLHttpRequest", "setTimeout", "requestAnimationFrame", "localStorage"]) assert.ok(peca.includes(`"${nome}"`), `a peça não sombreia ${nome}`);
  assert.ok(!/"eval"/.test(peca), "eval não pode ser parâmetro em modo estrito (quebrou a 1ª prova)");
});
