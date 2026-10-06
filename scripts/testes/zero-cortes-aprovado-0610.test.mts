// ZERO CORTES APROVADO É ZERO CORTES (06/10/2026, vídeo cmux0hoxk do Bruno).
// A regra pura (lib/media/decisao-dos-cortes.ts) e a prova, no código de cada
// passo, de que todos perguntam a ela antes de escolher, cortar ou pôr corte
// no quadro. Nada aqui toca banco, IA, worker ou mídia.
// Rodar: npx tsx --test scripts/testes/zero-cortes-aprovado-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { listaDaAprovacao, podeTerCardDeCorte, soCompletoAprovado, trechosParaCortar } from "@/lib/media/decisao-dos-cortes";

const ler = (p: string) => readFileSync(p, "utf8");
const APROVADO = "2026-10-06T18:39:38.507Z";

test("aprovar só o completo grava lista vazia mesmo com índice no pedido (o caso do vídeo cmux0hoxk)", () => {
  assert.deepEqual(listaDaAprovacao([0], true, 1), []);
  assert.deepEqual(listaDaAprovacao([0, 1, 2], true, 3), []);
});

test("sem soCompleto, a lista é a escolhida, limpa e ordenada", () => {
  assert.deepEqual(listaDaAprovacao([2, 0, 2, 9, -1, 1.5, "x"], false, 3), [0, 2]);
  assert.deepEqual(listaDaAprovacao(undefined, false, 3), []);
});

test("a decisão só vale depois da aprovação", () => {
  assert.equal(soCompletoAprovado(null), false);
  assert.equal(soCompletoAprovado({ soCompleto: true }), false);
  assert.equal(soCompletoAprovado({ aprovadoEm: APROVADO, soCompleto: true }), true);
  assert.equal(soCompletoAprovado({ aprovadoEm: APROVADO, cortesAprovados: [] }), true);
  assert.equal(soCompletoAprovado({ aprovadoEm: APROVADO, cortesAprovados: [0] }), false);
  // Roteiro aprovado antes de 06/10 (sem os campos novos) segue como antes.
  assert.equal(soCompletoAprovado({ aprovadoEm: APROVADO }), false);
});

test("o corte manda zero trechos ao worker com soCompleto, mesmo que clips tenha um trecho", () => {
  const clips = [{ titulo: "Time trabalhando pra você vinte e quatro horas", inicio: 51.285, fim: 94.83 }];
  assert.deepEqual(trechosParaCortar(clips, { aprovadoEm: APROVADO, soCompleto: true, cortesAprovados: [] }), []);
  assert.deepEqual(trechosParaCortar(clips, { aprovadoEm: APROVADO, cortesAprovados: [0] }), clips);
  assert.deepEqual(trechosParaCortar(null, null), []);
});

test("o quadro não aceita card de corte com soCompleto", () => {
  assert.equal(podeTerCardDeCorte({ aprovadoEm: APROVADO, soCompleto: true }), false);
  assert.equal(podeTerCardDeCorte({ aprovadoEm: APROVADO, cortesAprovados: [0] }), true);
  assert.equal(podeTerCardDeCorte(null), true);
});

// ─── cada passo pergunta à regra (prova no código, sem rodar a esteira) ───

test("a aprovação grava soCompleto e cortesAprovados e usa a lista da regra", () => {
  const s = ler("lib/media/roteiro-da-edicao.ts");
  assert.match(s, /const lista = listaDaAprovacao\(escolhidos, Boolean\(opcoes\.soCompleto\), trechos\.length\)/);
  assert.match(s, /cortesAprovados: lista,\s*\n\s*soCompleto,/);
});

test("a rota de aprovação repassa soCompleto do pedido", () => {
  const s = ler("app/api/videos/[id]/roteiro/aprovar/route.ts");
  assert.match(s, /soCompleto: corpo\.soCompleto === true/);
});

test("a tela manda soCompleto nos dois botões de zero cortes", () => {
  const s = ler("components/video/tela-de-roteiro.tsx");
  assert.match(s, /aprovar\(\[\], true\)/);
  assert.match(s, /soCompleto \? \{ escolhidos: \[\], soCompleto: true \}/);
  assert.match(s, /async function aprovar\(lista: number\[\], soCompleto = lista\.length === 0\)/);
});

test("o corte filtra os trechos pela decisão antes de montar o pedido ao worker", () => {
  const s = ler("app/api/videos/[id]/cortar/route.ts");
  assert.match(s, /const trechos = trechosParaCortar\(/);
  assert.ok(s.indexOf("trechosParaCortar(") < s.indexOf("montarPedidoDeCorte("));
});

test("o aviso do worker com soCompleto vai pelo caminho do só completo (nenhum corte gravado)", () => {
  const s = ler("app/api/videos/[id]/cortar-callback/route.ts");
  assert.match(s, /soCompletoAprovado\(await lerDecisaoDosCortes\(id\)/);
  assert.ok(s.indexOf("soCompletoAprovado(") < s.indexOf("const atualizados = trechos.map"));
});

test("a sincronização do quadro não cria card de corte com soCompleto", () => {
  const s = ler("lib/media/sincronizar-quadro.ts");
  assert.match(s, /podeTerCardDeCorte\(decisao\) \?/);
});

test("a seleção não escolhe trecho de novo para vídeo aprovado só o completo", () => {
  const s = ler("app/api/videos/[id]/select/route.ts");
  const guarda = s.indexOf("soCompletoAprovado(");
  assert.ok(guarda > 0);
  assert.ok(guarda < s.indexOf("selecionarTrechos("));
});

test("a semana do vídeo e a abertura do quadro não criam card de corte", () => {
  for (const p of ["lib/media/semana-do-video.ts", "lib/media/quadro-do-video.ts"]) {
    assert.doesNotMatch(ler(p), /video_clip/, p);
  }
});
