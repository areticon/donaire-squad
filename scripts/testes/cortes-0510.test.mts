// Testes de lógica dos três defeitos do teste do Bruno de 05/10/2026 (vídeo cmuums24z):
// estilo ignorado, legenda sobre o texto das peças e recorte do cliente desfeito.
// Rodar: npx tsx --test scripts/testes/cortes-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { faixaDaPagina, posicionarLegenda } from "@/lib/media/editor-sob-medida/faixa-da-legenda";
import { garantirGancho } from "@/lib/media/editor-sob-medida/corte";
import { resolverEdicao, temaDoEstilo } from "@/lib/media/editor-sob-medida/resolver";
import { bordasDoCliente, motivoParaQuemEscolheu } from "@/lib/media/estado-da-revisao-do-corte";
import type { CamadaResolvida, EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
import { legendaSobMedida } from "../../worker/src/edicao-sob-medida.mjs";

const camada = (peca: string, de: number, ate: number, props: Record<string, unknown> = {}): CamadaResolvida => ({
  id: `${peca}-${de}`, peca, de, ate, entrada: 0.5, saida: 0.3, evento: 0.6, eventos: [], props,
});

const edicao9x16 = (camadas: CamadaResolvida[], paginas: Array<{ inicio: number; fim: number; texto: string }>, planos: EdicaoResolvida["planos"] = []): EdicaoResolvida => ({
  versao: 1, largura: 1080, altura: 1920, fps: 30, duracao: 20,
  tema: { ...temaDoEstilo("vox", { acento: "#E3000F", escuro: "#1e1f22", claro: "#dbdee1" }), escuroLegenda: "#06111F" },
  logoUrl: null, camadas, planos, camera: [], legenda: { paginas }, insercoes: {},
});

// ─── 2. legenda e texto de peça em zonas exclusivas ───

test("legenda: sem peça na tela, fica embaixo", () => {
  assert.equal(faixaDaPagina({ inicio: 1, fim: 2 }, [], []), "baixo");
});

test("legenda: título do gancho no peito (o caso do corte 0, 'Maria nos pés de Jesus') sobe para o topo", () => {
  const titulo = camada("titulo", 0, 3, { titulo: "**Marta,** Maria e os nãos", posicao: "baixo" });
  assert.equal(faixaDaPagina({ inicio: 1.99, fim: 4.3 }, [titulo], []), "topo");
});

test("legenda: peça embaixo e peça em cima ao mesmo tempo, a legenda sai", () => {
  const embaixo = camada("rotulo-inferior", 3, 7, { nome: "Marta e Maria" });
  const emCima = camada("marca-texto", 3, 6, { texto: "MICHELANGELO", posicao: "topo" });
  assert.equal(faixaDaPagina({ inicio: 4, fim: 5 }, [embaixo, emCima], []), "oculta");
});

test("legenda: tela cheia (plano gráfico) esconde a legenda", () => {
  assert.equal(faixaDaPagina({ inicio: 7.5, fim: 8.5 }, [camada("colagem", 7, 10)], [{ de: 7, ate: 10, tipo: "grafico" }]), "oculta");
});

test("legenda: peça só no topo não tira a legenda de baixo", () => {
  assert.equal(faixaDaPagina({ inicio: 1, fim: 2 }, [camada("carimbo", 0.5, 2.5, { texto: "CANTINHO" })], []), "baixo");
});

test("legenda: peça de apoio (fundo de colagem) não conta", () => {
  assert.equal(faixaDaPagina({ inicio: 1, fim: 2 }, [camada("fundo-colagem", 0, 20)], []), "baixo");
});

test("legenda: página que só encosta na peça (sem cruzar no tempo) fica embaixo", () => {
  assert.equal(faixaDaPagina({ inicio: 3, fim: 4 }, [camada("titulo", 0, 3, { posicao: "baixo" })], []), "baixo");
});

test("posicionarLegenda marca cada página e conta as que mudaram", () => {
  const ed = edicao9x16(
    [camada("titulo", 0, 3, { posicao: "baixo" }), camada("sublinhado", 8, 10, { texto: "Excelência" })],
    [
      { inicio: 0.4, fim: 2, texto: "Jesus com Marta e Maria?" },
      { inicio: 4.3, fim: 6.8, texto: "Marta querendo fazer monte de coisa" },
      { inicio: 8.5, fim: 9.5, texto: "fazer bem feito" },
    ]
  );
  const r = posicionarLegenda(ed);
  assert.deepEqual(r.edicao.legenda!.paginas.map((p) => p.faixa), ["topo", "baixo", "topo"]);
  assert.equal(r.movidas, 2);
  assert.equal(r.ocultas, 0);
});

test("posicionarLegenda não mexe no 16:9", () => {
  const ed = { ...edicao9x16([camada("titulo", 0, 3, { posicao: "baixo" })], [{ inicio: 0.5, fim: 2, texto: "oi" }]), largura: 1920, altura: 1080 };
  assert.equal(posicionarLegenda(ed).edicao, ed);
});

test("worker: a página 'topo' sai no estilo de cima e a 'oculta' não sai", () => {
  const ed = edicao9x16([], [
    { inicio: 0.5, fim: 1.5, texto: "embaixo", faixa: "baixo" } as never,
    { inicio: 2, fim: 3, texto: "em cima", faixa: "topo" } as never,
    { inicio: 4, fim: 5, texto: "some", faixa: "oculta" } as never,
    { inicio: 6, fim: 7, texto: "antigo sem faixa" },
  ]);
  const ass = legendaSobMedida(ed, 1080, 1920, 0, 20) as string;
  // 08/10: a faixa de cima fica dentro da área segura do vertical (11% da altura = 211 px), não sob a interface do Reels.
  assert.match(ass, /Style: LegTopo,.*,8,\d+,\d+,211,1/);
  assert.match(ass, /,Leg,,0,0,0,,embaixo/);
  assert.match(ass, /,LegTopo,,0,0,0,,em cima/);
  assert.doesNotMatch(ass, /some/);
  assert.match(ass, /,Leg,,0,0,0,,antigo sem faixa/);
});

// ─── 1. o estilo escolhido manda ───

const palavras = "Tem uma história de Michelangelo pintando o teto da Capela Sistina num cantinho que ninguém via e ele disse eu e Deus estamos vendo".split(" ").map((texto, i) => ({ texto, inicio: i * 0.5, fim: i * 0.5 + 0.4 }));
const ctxVox = {
  palavras, duracao: palavras.length * 0.5, largura: 1080, altura: 1920,
  tema: temaDoEstilo("vox", { acento: "#E3000F", escuro: "#1e1f22", claro: "#dbdee1" }),
  rosto: { x: 0.3, y: 0.2, w: 0.4, h: 0.25 }, estiloId: "vox", comLegenda: true, logoUrl: null, insercoes: {}, ritmo: "corte" as const,
};

test("estilo: no Vox, peça genérica de outro estilo (título, rótulo) não vai ao ar", () => {
  const r = resolverEdicao(
    { momentos: [
      { id: "m1", peca: "titulo", de: "F0", ate: "F0/fim", props: { titulo: "Uma **história**" } },
      { id: "m2", peca: "rotulo-inferior", de: "F0", ate: "F0/fim", props: { nome: "Michelangelo" } },
      { id: "m3", peca: "carimbo", de: "F0", ate: "F0/fim", props: { texto: "MICHELANGELO" } },
    ] },
    ctxVox
  );
  const pecas = r.edicao.camadas.map((c) => c.peca);
  assert.ok(!pecas.includes("titulo"), `saiu título genérico: ${pecas}`);
  assert.ok(!pecas.includes("rotulo-inferior"), `saiu rótulo genérico: ${pecas}`);
  assert.ok(pecas.includes("carimbo"));
  assert.ok(r.avisos.some((a) => a.includes("fora do estilo vox")));
});

test("estilo: fora do Vox o título continua valendo", () => {
  const r = resolverEdicao({ momentos: [{ id: "m1", peca: "titulo", de: "F0", ate: "F0/fim", props: { titulo: "Uma **história**" } }] }, { ...ctxVox, estiloId: "hormozi", tema: temaDoEstilo("hormozi", { acento: "#E3000F", escuro: "#1e1f22", claro: "#dbdee1" }) });
  assert.ok(r.edicao.camadas.some((c) => c.peca === "titulo"));
});

test("estilo: o gancho do segundo 0 no Vox é o marca-texto, mesmo sem peça de papel na edição", () => {
  const ed = edicao9x16([], []);
  const g = garantirGancho(ed, "Vou fazer tudo? Não.", { entrada: 1.5, saida: 0.3, evento: 0.6 }, "vox");
  assert.equal(g.edicao.camadas[0].peca, "marca-texto");
  const g2 = garantirGancho(ed, "Vou fazer tudo? Não.", { entrada: 1.5, saida: 0.3, evento: 0.6 }, "hormozi");
  assert.equal(g2.edicao.camadas[0].peca, "titulo");
});

// ─── 3. o recorte do cliente é soberano ───

test("recorte: corte com controle do corte tem bordas do cliente", () => {
  // O registro real do corte 1 de cmuums24z.
  const t = { controleDoCorte: { ultima: { em: "2026-10-05T03:37:24.890Z", escolha: { comecar: 662, terminar: 858 }, mudancas: ["começa 104 palavras depois"] }, refacoes: 0 } };
  assert.equal(bordasDoCliente(t), true);
  assert.equal(bordasDoCliente({}), false);
  assert.equal(bordasDoCliente({ controleDoCorte: null }), false);
  assert.equal(bordasDoCliente(null), false);
});

test("recorte: o motivo da revisão chega ao cliente dizendo que o corte ficou como ele escolheu", () => {
  const m = motivoParaQuemEscolheu("Começa com 'Tem uma história, né?' sem contexto.");
  assert.match(m, /como você escolheu/);
  assert.match(m, /Tem uma história/);
  assert.doesNotMatch(m, /[–—]/);
});
