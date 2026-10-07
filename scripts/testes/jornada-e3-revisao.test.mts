// E3 da jornada: passo 5, revisão por elemento e plano congelado na aprovação.
//   - o pedido fica gravado por id, literal;
//   - a descrição nova contém os termos do pedido e aparece antes de aprovar;
//   - depois de aprovado, nenhum passo muda a lista de elementos (o congelado é imutável).
// Rodar: npx tsx --test scripts/testes/jornada-e3-revisao.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { aprovarJornada, elementosAprovados, elementosDaAprovacao, pedirElementoNovo, pedirMudanca, PlanoCongelado, removerElemento } from "@/lib/media/jornada/revisao";
import { frasesDaFala } from "@/lib/media/jornada/linha-do-tempo";
import { jornadaNaTela } from "@/lib/media/jornada/tela";
import type { EstadoDaJornada } from "@/lib/media/jornada/estado";
import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";

const fala = "Eu comprei uma Ferrari vermelha no ano passado. Depois vendi tudo e abri a empresa.";
let t = 0;
const palavras = fala.split(" ").map((w) => { const p = { texto: w, inicio: +t.toFixed(2), fim: +(t + 0.3).toFixed(2) }; t += 0.4; return p; });
const frases = frasesDaFala(palavras);

const estado = (): EstadoDaJornada => ({
  versao: 1, edicaoId: "e1", leitura: null, amostras: [], revisao: {}, aprovado: null,
  plano: {
    versao: 1, edicaoId: "e1", estiloDoCliente: "", densidade: { segundosEntreElementos: [5, 8], porque: "" }, custoTotalUsd: 0.12, feitoEm: "x", formato: "9:16", duracao: t,
    elementos: [
      { id: "el1", momento: { indice: 0, de: 0, ate: 3, frase: frases[0].texto }, gatilho: { palavra: "Ferrari", indice: 3, t: 1.2 }, descricao: "Uma Ferrari vermelha acelerando numa estrada de serra ao entardecer", textoNaImagem: null, midia: "recorte", formato: "recorte-sobre", porque: "", custoUsd: 0.063, origem: "ia", papel: "elemento" },
      { id: "el2", momento: { indice: 1, de: 3.6, ate: 6, frase: frases[1].texto }, gatilho: { palavra: "empresa", indice: 14, t: 5.6 }, descricao: "Fachada de um escritório novo com placa", textoNaImagem: null, midia: "imagem", formato: "janela", porque: "", custoUsd: 0.06, origem: "ia", papel: "elemento" },
    ],
  },
});

const jevConteudo = async (_c: unknown, q: Record<string, PerguntaDoJev>): Promise<Record<string, RespostaDoJev>> => {
  const r: Record<string, RespostaDoJev> = {};
  for (const [k, p] of Object.entries(q)) {
    if (p.type === "choice") r[k] = { type: "choice", choice: "conteudo", probabilities: {}, confidence: 0.9 };
    if (p.type === "noul") r[k] = { type: "noul", noul: 0.9 };
  }
  return r;
};

test("pedido gravado por id, literal; a descrição nova contém os termos do pedido", async () => {
  const pedidos: string[] = [];
  const redator = async (_s: string, p: string) => { pedidos.push(p); return JSON.stringify({ descricao: "Uma Ferrari preta acelerando numa estrada de serra ao entardecer", textoNaImagem: null }); };
  const novo = await pedirMudanca(estado(), "el1", "troque a Ferrari vermelha por uma preta", { jev: jevConteudo as never, redator, agora: () => "2026-10-07T00:00:00Z" }, { palavras, frases });
  assert.deepEqual(novo.revisao.el1.pedidos, [{ texto: "troque a Ferrari vermelha por uma preta", em: "2026-10-07T00:00:00Z" }]);
  assert.equal(novo.revisao.el1.acao, "alterado");
  assert.match(novo.revisao.el1.descricaoAprovada, /preta/);
  assert.ok(pedidos[0].includes("troque a Ferrari vermelha por uma preta"), "o pedido literal vai ao Sonnet");
  // A tela mostra a descrição nova antes de aprovar.
  const tela = jornadaNaTela(novo, palavras)!;
  assert.match(tela.elementos[0].descricao, /preta/);
  assert.deepEqual(tela.elementos[0].pedidos, ["troque a Ferrari vermelha por uma preta"]);
});

test("a aprovação congela: a lista aprovada é a que vai ao ar e nada mais a muda", async () => {
  let e = removerElemento(estado(), "el2");
  const redator = async () => JSON.stringify({ descricao: "Ferrari preta", textoNaImagem: null });
  e = await pedirMudanca(e, "el1", "troque a Ferrari vermelha por uma preta", { jev: jevConteudo as never, redator }, { palavras, frases });
  const aprovado = aprovarJornada(e);
  const lista = elementosAprovados(aprovado);
  assert.deepEqual(lista.map((x) => x.id), ["el1"], "o removido não vai");
  assert.equal(lista[0].descricao, "Ferrari preta");
  assert.deepEqual(lista[0].pedidos, ["troque a Ferrari vermelha por uma preta"]);
  assert.ok(Object.isFrozen(lista) && Object.isFrozen(lista[0]), "congelado");
  assert.throws(() => (lista as unknown as unknown[]).push({}), TypeError);
  await assert.rejects(() => pedirMudanca(aprovado, "el1", "outra coisa", { jev: jevConteudo as never, redator }, { palavras, frases }), PlanoCongelado);
  await assert.rejects(() => pedirElementoNovo(aprovado, frases[1], "um foguete", { jev: jevConteudo as never, redator }, { palavras, formato: "9:16" }), PlanoCongelado);
  assert.throws(() => removerElemento(aprovado, "el1"), PlanoCongelado);
  assert.deepEqual(elementosDaAprovacao(e).map((x) => x.id), ["el1"]);
});

test("a intenção 'remover' pelo JEV tira o elemento; 'novo' entra com o pedido do cliente", async () => {
  const jevRemove = async (_c: unknown, q: Record<string, PerguntaDoJev>) => Object.fromEntries(Object.keys(q).map((k) => [k, { type: "choice", choice: "remover", probabilities: {}, confidence: 0.95 }]));
  const r = await pedirMudanca(estado(), "el2", "tira isso", { jev: jevRemove as never, redator: async () => "{}" }, { palavras, frases });
  assert.equal(r.revisao.el2.acao, "removido");
  const n = await pedirElementoNovo(estado(), frases[1], "um troféu dourado", { jev: jevConteudo as never, redator: async () => JSON.stringify({ descricao: "Um troféu dourado brilhando", midia: "recorte", textoNaImagem: null }) }, { palavras, formato: "9:16" });
  const novo = n.plano!.elementos.find((x) => x.origem === "usuario")!;
  assert.equal(novo.descricao, "Um troféu dourado brilhando");
  assert.equal(n.revisao[novo.id].acao, "novo");
});
