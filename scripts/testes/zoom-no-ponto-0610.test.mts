// A prova da sub-caixa do zoom no ponto (06/10, tarde): a visão devolve os
// pontos da tela ou do quadro que a fala aponta, a junção guarda só os de
// dentro do conteúdo, o corte os leva para o tempo e o quadro dele, e o zoom
// mira o ponto em vez da tela inteira. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/zoom-no-ponto-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { juntarLeitura, leituraEmTexto, leituraNoIntervalo, pontosDaVisao, pontosNoConteudo, type LeituraDoVideo, type TrechoLido, type VisaoDoVideo } from "@/lib/media/leitura-do-video";
import { caixaNaCamera, enquadramentoDoPonto, leituraNoCorte, regiaoDoPonto } from "@/lib/media/editor-por-comando/leitura-no-plano";

const TELA = { x: 0.05, y: 0.1, w: 0.6, h: 0.7 };
const trecho = (extra: Partial<TrechoLido> = {}): TrechoLido => ({
  de: 10, ate: 30, pessoasEmCena: [{ id: "p1", caixa: { x: 0.7, y: 0.2, w: 0.25, h: 0.7 } }], tela: TELA, quadro: null, movimento: "parado", acontece: "explica o código", mostra: ["tela"], falaDe: "a função", areaLivre: [], ...extra,
});

test("os pontos crus da visão: só números válidos, caixa presa ao quadro, até 4", () => {
  const cru = [
    { segundo: 12, x: 0.1, y: 0.2, w: 0.2, h: 0.05, oQue: "linha 12 do código." },
    { segundo: "x", x: 0.1, y: 0.2, w: 0.2, h: 0.05, oQue: "inválido" },
    { segundo: 14, x: 0.9, y: 0.9, w: 0.5, h: 0.5, oQue: "passa da borda" },
    { segundo: 15, x: 0.1, y: 0.1, w: 0.001, h: 0.2, oQue: "fino demais" },
    ...Array.from({ length: 6 }, (_, i) => ({ segundo: 20 + i, x: 0.1, y: 0.1, w: 0.1, h: 0.1, oQue: `p${i}` })),
  ];
  const p = pontosDaVisao(cru);
  assert.equal(p.length, 4);
  assert.deepEqual(p[0], { t: 12, caixa: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 }, oQue: "linha 12 do código" });
  assert.deepEqual(p[1].caixa, { x: 0.9, y: 0.9, w: 0.1, h: 0.1 });
  assert.deepEqual(pontosDaVisao("nada"), []);
});

test("só ficam os pontos dentro da tela ou do quadro, recortados, e no tempo do trecho", () => {
  const pontos = [
    { t: 12, caixa: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 }, oQue: "dentro" },
    { t: 13, caixa: { x: 0.6, y: 0.2, w: 0.2, h: 0.1 }, oQue: "metade fora" },
    { t: 14, caixa: { x: 0.75, y: 0.3, w: 0.1, h: 0.1 }, oQue: "no rosto, fora da tela" },
    { t: 50, caixa: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 }, oQue: "fora do tempo" },
  ];
  const r = pontosNoConteudo(pontos, TELA, 10, 30);
  assert.deepEqual(r.map((p) => p.oQue), ["dentro", "metade fora"]);
  assert.equal(r[1].caixa.x + r[1].caixa.w, 0.65, "recortado na borda da tela");
  assert.deepEqual(pontosNoConteudo(pontos, null, 10, 30), [], "sem tela nem quadro, nenhum ponto");
});

test("a junção com a visão grava os pontos no trecho e o texto do JEV os mostra", () => {
  const resumo = { trechos: [trecho()], pessoas: [{ id: "p1", descricao: "à direita" }], formato: "16:9", visaoGeral: { pessoasTipicas: 1, comQuadro: 0, comTela: 1 } } as never;
  const visao: VisaoDoVideo = {
    modelo: "gemini-2.5-flash", genero: "tela", generoConfianca: 0.9, cenario: "escritório", pessoas: [], resumo: "aula de código", custoUsd: 0, tokens: { entrada: 0, saida: 0 },
    trechos: [{ i: 0, acontece: "mostra o editor", mostra: ["tela"], falaDe: "a função soma", temTela: true, temQuadro: false, quemFala: ["p1"], pontos: [{ t: 12, caixa: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 }, oQue: "a função soma" }] }],
  };
  const l = juntarLeitura(resumo, visao, { medicao: true });
  assert.equal(l.trechos[0].pontos?.length, 1);
  assert.match(leituraEmTexto(l), /A fala aponta: 0:12 a função soma/);
  const sem = juntarLeitura(resumo, { ...visao, trechos: [{ ...visao.trechos[0], temTela: false, temQuadro: false }] }, { medicao: true });
  assert.equal(sem.trechos[0].pontos, undefined, "a visão disse que não há tela: nenhum ponto");
});

test("o zoom mira a sub-caixa do ponto, não a tela inteira", () => {
  const tr = trecho({ pontos: [{ t: 12, caixa: { x: 0.1, y: 0.2, w: 0.2, h: 0.05 }, oQue: "linha" }, { t: 25, caixa: { x: 0.4, y: 0.6, w: 0.2, h: 0.15 }, oQue: "outra" }] });
  const daTela = enquadramentoDoPonto(TELA);
  const alvo = regiaoDoPonto(tr, 11.5, 15)!;
  assert.equal(alvo.w, 0.2);
  assert.equal(alvo.h, 0.18, "a altura cresce até o mínimo, dentro da tela");
  assert.ok(alvo.x >= TELA.x && alvo.y >= TELA.y && alvo.x + alvo.w <= TELA.x + TELA.w + 1e-9 && alvo.y + alvo.h <= TELA.y + TELA.h + 1e-9);
  const enq = enquadramentoDoPonto(alvo)!;
  assert.ok(enq.zoom > (daTela?.zoom ?? 1), `aproxima mais que a tela inteira (${enq.zoom} contra ${daTela?.zoom})`);
  assert.ok(Math.abs(enq.x - 0.2) < 0.01, "a câmera mira o ponto");
  const moldura = caixaNaCamera(alvo, enq);
  assert.ok(moldura.w > alvo.w, "a moldura fica maior depois do zoom");
  // O momento de outro ponto mira o outro; sem ponto no tempo, a tela inteira.
  assert.ok(Math.abs((regiaoDoPonto(tr, 24.5, 28)!.x + regiaoDoPonto(tr, 24.5, 28)!.w / 2) - 0.5) < 0.01);
  assert.deepEqual(regiaoDoPonto(tr, 16, 20), TELA);
  assert.deepEqual(regiaoDoPonto(trecho(), 11, 15), TELA, "leitura sem pontos: como antes");
  assert.equal(regiaoDoPonto(trecho({ tela: null }), 11, 15), null);
});

test("o corte e o intervalo levam os pontos para o tempo deles", () => {
  const l: LeituraDoVideo = { versao: 1, genero: "tela", generoConfianca: 1, cenario: "", formato: "16:9", pessoas: [], resumo: "", fontes: { medicao: true, visao: null }, custoUsd: 0, trechos: [trecho({ pontos: [{ t: 12, caixa: { x: 0.3, y: 0.3, w: 0.1, h: 0.1 }, oQue: "linha" }, { t: 28, caixa: { x: 0.3, y: 0.3, w: 0.1, h: 0.1 }, oQue: "fora do corte" }] })] };
  const noIntervalo = leituraNoIntervalo(l, 10, 20);
  assert.deepEqual(noIntervalo.trechos[0].pontos?.map((p) => p.t), [2]);
  const corte = leituraNoCorte(l, { x: 0.2, y: 0, w: 0.35, h: 1 }, 10, [{ de: 1, ate: 6 }]);
  assert.equal(corte.trechos[0].pontos?.length, 1);
  assert.equal(corte.trechos[0].pontos?.[0].t, 1, "12 s da gravação = 1 s do corte (começa em 11)");
  const c = corte.trechos[0].pontos![0].caixa;
  assert.ok(Math.abs(c.x - (0.3 - 0.2) / 0.35) < 0.001, "a caixa no quadro 9:16 do corte");
});
