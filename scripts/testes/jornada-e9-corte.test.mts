// E9 da jornada (08/10): o corte usa o plano aprovado do vídeo e as mídias do completo.
// Caso real: os cortes do Igor (07/10) saíram pelo editor antigo, com "curtir e se inscrever" de código
// estourando a tela, porque a jornada só valia para o completo.
// Rodar: npx tsx --test scripts/testes/jornada-e9-corte.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { amostrasDoCorte, elementosNoCorte, geradoDoCompleto, indiceNoCorte, paraMontarNoCorte } from "@/lib/media/jornada/corte";
import type { ElementoAprovado } from "@/lib/media/jornada/estado";

const fala = (texto: string, t0 = 0) => texto.split(" ").map((w, i) => ({ texto: w, inicio: +(t0 + i * 0.4).toFixed(2), fim: +(t0 + i * 0.4 + 0.3).toFixed(2) }));
const plano = fala("o que eu quero te mostrar hoje é que a moto saiu sem entrada e o carro da família veio depois que o lance foi dado no momento certo");
// O corte começa em "a moto" e termina em "da família", com outro tempo.
const corte = fala("a moto saiu sem entrada e o carro da família");

const el = (id: string, indice: number, formato: ElementoAprovado["formato"] = "recorte-sobre"): ElementoAprovado => ({
  id,
  momento: { indice: 0, de: 0, ate: 3, frase: "f" },
  gatilho: { palavra: plano[indice].texto, indice, t: plano[indice].inicio },
  descricao: "d",
  textoNaImagem: null,
  midia: formato === "grafico" ? "grafico" : "recorte",
  formato,
  porque: "",
  custoUsd: 0,
  origem: "ia",
  papel: "elemento",
  pedidos: [],
});

test("o gatilho é achado no corte pela sequência de palavras, no tempo do corte", () => {
  const iMoto = plano.findIndex((p) => p.texto === "moto");
  assert.equal(indiceNoCorte(plano, corte, iMoto), 1);
  const iCarro = plano.findIndex((p) => p.texto === "carro");
  assert.equal(indiceNoCorte(plano, corte, iCarro), 7);
  // "lance" não foi dito no corte.
  const iLance = plano.findIndex((p) => p.texto === "lance");
  assert.equal(indiceNoCorte(plano, corte, iLance), -1);
  // "que" aparece no plano mas não no corte: palavra comum não casa do lado errado.
  assert.equal(indiceNoCorte(plano, corte, 1), -1);
});

test("só os elementos ditos no corte entram, com a mídia do completo e sem custo", () => {
  const els = [el("moto", plano.findIndex((p) => p.texto === "moto")), el("lance", plano.findIndex((p) => p.texto === "lance")), el("carro", plano.findIndex((p) => p.texto === "carro"), "grafico")];
  const noCorte = elementosNoCorte(els, plano, corte, 5);
  assert.deepEqual(noCorte.map((x) => x.aprovado.id), ["moto", "carro"]);
  assert.equal(noCorte[0].t, corte[1].inicio);
  const midias = { moto: { url: "https://blob/moto.webp", tipo: "recorte" as const, formato: "recorte-sobre", proporcao: 1.6 } };
  const gerados = new Map(noCorte.map((x) => [x.aprovado.id, geradoDoCompleto(x.aprovado, midias[x.aprovado.id as "moto"])]).filter((x): x is [string, NonNullable<ReturnType<typeof geradoDoCompleto>>] => Boolean(x[1])));
  const { elementos, faltam } = paraMontarNoCorte(noCorte, gerados);
  assert.deepEqual(faltam, []);
  assert.equal(elementos.find((e) => e.aprovado.id === "moto")!.gerado.custoUsd, 0);
  assert.equal(elementos.find((e) => e.aprovado.id === "carro")!.gerado.formato, "grafico");
  assert.equal(amostrasDoCorte(5, { x: 0.3, y: 0.2, w: 0.4, h: 0.3 }, null).length, 3);
});
