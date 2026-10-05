// A regra de sobreposição de campanhas (05/10/2026): uma campanha nova nunca
// arquiva peça de outra por conta própria. Nada aqui toca banco.
// Rodar: npx tsx --test scripts/testes/sobreposicao-de-campanha-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  avisoDeSobreposicao,
  datasDaCampanha,
  diasComPecaExistente,
  janelaDaCampanha,
  substituiRascunhos,
} from "@/lib/pipeline/sobreposicao-de-campanha";

test("o caso de 05/10: o post único de segunda não substitui nada, nem com a opção marcada", () => {
  assert.equal(substituiRascunhos({ campaignMode: "single", weekStart: "2026-10-05" }), false);
  assert.equal(substituiRascunhos({ campaignMode: "single", weekStart: "2026-10-05", substituirRascunhos: true }), false);
});

test("a campanha de semana só substitui com a escolha explícita da pessoa", () => {
  assert.equal(substituiRascunhos({ campaignMode: "weekly", weekStart: "2026-10-05" }), false);
  assert.equal(substituiRascunhos({ campaignMode: "weekly", weekStart: "2026-10-05", substituirRascunhos: false }), false);
  assert.equal(substituiRascunhos({ campaignMode: "weekly", weekStart: "2026-10-05", substituirRascunhos: true }), true);
  assert.equal(substituiRascunhos({ campaignMode: "biweekly", weekStart: "2026-10-05", substituirRascunhos: true }), true);
});

test("a campanha recorrente nunca substitui", () => {
  assert.equal(substituiRascunhos({ campaignMode: "recurring", weekStart: "2026-10-05", substituirRascunhos: true }), false);
});

test("a janela é a semana (ou a quinzena) a partir do weekStart", () => {
  const semana = janelaDaCampanha({ campaignMode: "weekly", weekStart: "2026-10-05" });
  assert.equal(semana.inicio.toISOString(), "2026-10-05T00:00:00.000Z");
  assert.equal(semana.fim.toISOString(), "2026-10-12T00:00:00.000Z");
  const quinzena = janelaDaCampanha({ campaignMode: "biweekly", weekStart: "2026-10-05" });
  assert.equal(quinzena.fim.toISOString(), "2026-10-19T00:00:00.000Z");
});

test("as datas da campanha saem dos dias escolhidos, em uma ou duas semanas", () => {
  assert.deepEqual(datasDaCampanha("2026-10-05", [1, 3, 5], 1), ["2026-10-05", "2026-10-07", "2026-10-09"]);
  assert.deepEqual(datasDaCampanha("2026-10-05", [5, 1], 2), ["2026-10-05", "2026-10-09", "2026-10-12", "2026-10-16"]);
  // Dia fora de 1..7 não entra.
  assert.deepEqual(datasDaCampanha("2026-10-05", [0, 8, 2], 1), ["2026-10-06"]);
});

test("o aviso conta só peça viva de OUTRA campanha nos dias que a nova vai gerar", () => {
  const pecas = [
    // Os seis posts do vídeo de 05/10, em rascunho: dois na segunda, um na quarta, um na sexta, dois no sábado.
    { runId: "video", status: "draft", scheduledAt: new Date("2026-10-05T12:00:00Z") },
    { runId: "video", status: "draft", scheduledAt: new Date("2026-10-05T12:00:00Z") },
    { runId: "video", status: "draft", scheduledAt: new Date("2026-10-07T12:00:00Z") },
    { runId: "video", status: "draft", scheduledAt: new Date("2026-10-09T12:00:00Z") },
    { runId: "video", status: "draft", scheduledAt: new Date("2026-10-10T12:00:00Z") },
    { runId: "video", status: "draft", scheduledAt: new Date("2026-10-10T12:00:00Z") },
    // Publicado e cancelado não contam; sem data também não.
    { runId: "velho", status: "published", scheduledAt: new Date("2026-10-07T12:00:00Z") },
    { runId: "velho", status: "cancelled", scheduledAt: new Date("2026-10-05T12:00:00Z") },
    { runId: "velho", status: "draft", scheduledAt: null },
  ];
  // Campanha nova de segunda e quarta: a sexta e o sábado ficam de fora.
  assert.deepEqual(diasComPecaExistente(pecas, ["2026-10-05", "2026-10-07"]), [
    { data: "2026-10-05", quantas: 2 },
    { data: "2026-10-07", quantas: 1 },
  ]);
  // A própria campanha (run atual) não é sobreposição.
  assert.deepEqual(diasComPecaExistente(pecas, ["2026-10-05"], "video"), []);
  // Dia sem peça: nada a avisar.
  assert.deepEqual(diasComPecaExistente(pecas, ["2026-10-06"]), []);
});

test("a frase do aviso diz os dias e deixa claro que nada é tocado", () => {
  assert.equal(avisoDeSobreposicao([]), null);
  assert.equal(
    avisoDeSobreposicao([{ data: "2026-10-05", quantas: 2 }]),
    "Já existe 2 peças em 05/10. A campanha nova é somada ao dia; nada do que está lá é tocado."
  );
  assert.match(avisoDeSobreposicao([{ data: "2026-10-05", quantas: 2 }, { data: "2026-10-07", quantas: 1 }])!, /05\/10, 07\/10 \(3 no total\)/);
});
