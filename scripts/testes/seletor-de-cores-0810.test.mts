// O seletor de cores da marca (08/10/2026). A queixa do Bruno: "o seletor de
// cores da marca ficou ruim, é difícil de operar". Aqui a parte pura: hex
// normalizado, as vagas por papel, a ordem que os leitores esperam na string,
// os papéis do book alinhados e quando a troca derruba a aprovação. Mais duas
// guardas de código: a key da vaga não leva a cor (o seletor nativo fechava no
// primeiro arraste) e o assistente não grava mais o laranja da Demandou.
// Nada aqui toca banco, IA, rede ou imagem paga.
// Rodar: npx tsx --test scripts/testes/seletor-de-cores-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAXIMO_DE_CORES,
  PALETA_DE_FABRICA,
  destaqueNoVideo,
  ehPaletaDeFabrica,
  normalizarHex,
  normalizarPaleta,
  paletaDasVagas,
  papeisDasVagas,
  papeisDepoisDeGravar,
  porCorNaVaga,
  previaDasVagas,
  trocaDerrubaAprovacao,
  vagasDaPaleta,
  type VagasDeCor,
} from "@/lib/marca/cores-da-marca";
import { PALETA_PADRAO_DA_PLATAFORMA } from "@/lib/media/identidade-visual";
import { contraste, medidaDaCor, papeisDaPaleta } from "@/lib/media/papeis-da-paleta";
import { papeisNaPaleta, papeisPadrao } from "@/lib/modelos-de-arte/identidade";

const FABRICA = ["#f97316", "#1e1f22", "#dbdee1"];
// A paleta do Fé & Gestão, na ordem em que o cliente gravou (05/10).
const FE_E_GESTAO = "#1f2f3a,#98092b,#df931b,#e0daa3,#9fb982";

test("hex: aceita com ou sem #, 3 ou 6 dígitos, e normaliza para #rrggbb minúsculo", () => {
  assert.equal(normalizarHex("#F97316"), "#f97316");
  assert.equal(normalizarHex("f97316"), "#f97316");
  assert.equal(normalizarHex("  #abc "), "#aabbcc");
  assert.equal(normalizarHex("ABC"), "#aabbcc");
  for (const ruim of ["", "#12345", "##abc", "#aabbccdd", "azul", "#ggg", "rgb(1,2,3)"]) assert.equal(normalizarHex(ruim), null, ruim);
});

test("paleta: separa por vírgula, ponto e vírgula ou espaço, tira repetida e aponta o que não é cor", () => {
  assert.deepEqual(normalizarPaleta("#F97316, 1e1f22;#DBDEE1 #f97316"), { cores: FABRICA, invalidas: [] });
  assert.deepEqual(normalizarPaleta("#F97316,azul,#1e1f22").invalidas, ["azul"]);
  assert.deepEqual(normalizarPaleta(null), { cores: [], invalidas: [] });
  const muitas = normalizarPaleta(["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"]);
  assert.equal(muitas.cores.length, MAXIMO_DE_CORES);
});

test("as de fábrica são as mesmas do padrão da plataforma (a tela não pode importar o módulo com sharp)", () => {
  assert.deepEqual([...PALETA_DE_FABRICA], normalizarPaleta(PALETA_PADRAO_DA_PLATAFORMA).cores);
  assert.equal(ehPaletaDeFabrica("#F97316,#1e1f22,#dbdee1"), true);
  assert.equal(ehPaletaDeFabrica("#1e1f22,#F97316,#dbdee1"), false);
});

test("vagas da paleta padrão: Principal laranja, Fundo carvão, Texto cinza, e a string volta igual", () => {
  const v = vagasDaPaleta(FABRICA);
  assert.deepEqual(v, { principal: "#f97316", fundo: "#1e1f22", texto: "#dbdee1", apoio: [] });
  assert.deepEqual(paletaDasVagas(v), FABRICA);
  // As vagas sem papel gravado são o mesmo padrão que o book mostra.
  assert.deepEqual(papeisDasVagas(v), papeisPadrao(FABRICA));
});

test("Fé & Gestão: a hierarquia acha o vinho como Principal, e a string sai na ordem que os leitores esperam", () => {
  const v = vagasDaPaleta(FE_E_GESTAO);
  assert.equal(v.principal, "#98092b");
  assert.equal(v.fundo, "#1f2f3a");
  assert.equal(v.texto, "#e0daa3");
  assert.deepEqual(v.apoio, ["#df931b", "#9fb982"]);
  const string = paletaDasVagas(v);
  assert.deepEqual(string, ["#98092b", "#1f2f3a", "#e0daa3", "#df931b", "#9fb982"]);
  // A hierarquia (vídeo, capa) lê o mesmo que a tela mostra.
  const h = papeisDaPaleta(string)!;
  assert.equal(h.destaque, "#98092b");
  assert.equal(h.escuro, "#1f2f3a");
  assert.equal(h.claro, "#e0daa3");
});

test("fundo claro com texto escuro: a string continua [principal, escura, clara] para a posição e a hierarquia", () => {
  const v: VagasDeCor = { principal: "#2563eb", fundo: "#ffffff", texto: "#0f172a", apoio: ["#22c55e"] };
  const string = paletaDasVagas(v);
  assert.deepEqual(string, ["#2563eb", "#0f172a", "#ffffff", "#22c55e"]);
  // direcao-de-arte lê [acento, "dark tone", "light neutral"] pela posição.
  assert.ok(medidaDaCor(string[1]).l < medidaDaCor(string[2]).l);
  const h = papeisDaPaleta(string)!;
  assert.equal(h.destaque, "#2563eb");
  assert.equal(h.escuro, "#0f172a");
  assert.equal(h.claro, "#ffffff");
  // E o book recebe exatamente o que a tela chamou de Fundo e Texto.
  assert.deepEqual(papeisDasVagas(v), { destaque: "#2563eb", fundo: "#ffffff", titulo: "#0f172a" });
});

test("com papéis gravados no book, as vagas mostram o que a arte usa (inclusive o branco do título)", () => {
  const papeis = { fundo: "#1e1f22", titulo: "#ffffff", destaque: "#f97316" };
  const v = vagasDaPaleta(FABRICA, papeis);
  assert.deepEqual(v, { principal: "#f97316", fundo: "#1e1f22", texto: "#ffffff", apoio: ["#dbdee1"] });
  // Gravar de novo sem mexer em papel nenhum não muda os papéis.
  assert.deepEqual(papeisDepoisDeGravar(v, papeis), papeis);
  assert.deepEqual(papeisNaPaleta(papeisDasVagas(v), paletaDasVagas(v)), { papeis, mudou: false });
});

test("vaga vazia: sem as três cores, os papéis não vão juntos e o book só se alinha à paleta", () => {
  const v = vagasDaPaleta("#ff0000");
  assert.equal(v.principal, "#ff0000");
  assert.equal(papeisDasVagas(v), null);
  assert.deepEqual(paletaDasVagas(v), ["#ff0000"]);
  assert.equal(papeisDepoisDeGravar(v, null), null);
});

test("aprovação: trocar cor de apoio não derruba; trocar Fundo e Texto de lugar ou a Principal derruba", () => {
  const papeis = { fundo: "#1e1f22", titulo: "#dbdee1", destaque: "#f97316" };
  const identidade = { aprovada: true, papeis };
  const base: VagasDeCor = { principal: "#f97316", fundo: "#1e1f22", texto: "#dbdee1", apoio: [] };
  assert.equal(trocaDerrubaAprovacao(identidade, base), false);
  assert.equal(trocaDerrubaAprovacao(identidade, { ...base, apoio: ["#22c55e"] }), false);
  assert.equal(trocaDerrubaAprovacao(identidade, { ...base, fundo: "#dbdee1", texto: "#1e1f22" }), true);
  assert.equal(trocaDerrubaAprovacao(identidade, { ...base, principal: "#e3000f" }), true);
  // Sem aprovação não há o que avisar.
  assert.equal(trocaDerrubaAprovacao({ aprovada: false, papeis }, { ...base, principal: "#e3000f" }), false);
});

test("a sugestão de contraste com uma cor que já é da marca troca as vagas, sem duplicar", () => {
  const v: VagasDeCor = { principal: "#f97316", fundo: "#1e1f22", texto: "#2a2b2e", apoio: ["#dbdee1"] };
  // "Use #dbdee1 no texto": a cor estava no apoio, o texto antigo vai para lá.
  assert.deepEqual(porCorNaVaga(v, "texto", "#DBDEE1"), { principal: "#f97316", fundo: "#1e1f22", texto: "#dbdee1", apoio: ["#2a2b2e"] });
  // Cor que já é o Fundo: Principal e Fundo trocam.
  assert.deepEqual(porCorNaVaga(v, "principal", "#1e1f22"), { principal: "#1e1f22", fundo: "#f97316", texto: "#2a2b2e", apoio: ["#dbdee1"] });
  // Cor nova: só entra.
  assert.equal(porCorNaVaga(v, "texto", "#ffffff").texto, "#ffffff");
  // Inválida: nada muda.
  assert.deepEqual(porCorNaVaga(v, "texto", "branco"), v);
  // Apoio vazio não rouba a cor de um papel.
  const comVazio: VagasDeCor = { ...v, apoio: [] };
  assert.deepEqual(porCorNaVaga(comVazio, { apoio: 0 }, "#f97316"), comVazio);
});

test("Principal escura demais: o vídeo acende outra cor, e a tela sabe qual", () => {
  const v: VagasDeCor = { principal: "#1f2f3a", fundo: "#ffffff", texto: "#141414", apoio: ["#98092b"] };
  const noVideo = destaqueNoVideo(v);
  assert.notEqual(noVideo, "#1f2f3a");
  assert.equal(noVideo, "#98092b");
  assert.equal(destaqueNoVideo({ principal: "#f97316", fundo: "#1e1f22", texto: "#dbdee1", apoio: [] }), "#f97316");
});

test("prévia: o botão lê sobre a Principal, e o destaque que some no fundo vira sublinhado", () => {
  const p = previaDasVagas({ principal: "#f97316", fundo: "#1e1f22", texto: "#dbdee1", apoio: [] });
  assert.equal(p.fundo, "#1e1f22");
  assert.equal(p.titulo, "#dbdee1");
  assert.ok(contraste(p.letraDoBotao, p.destaque) >= 3, `letra do botão ${p.letraDoBotao}`);
  assert.equal(p.destaqueSublinhado, false);
  assert.equal(previaDasVagas({ principal: "#262626", fundo: "#1e1f22", texto: "#ffffff", apoio: [] }).destaqueSublinhado, true);
  // Sem fundo nem texto ainda, a prévia não quebra.
  const vazia = previaDasVagas({ principal: "#f97316", fundo: null, texto: null, apoio: [] });
  assert.ok(contraste(vazia.titulo, vazia.fundo) >= 4.5);
});

test("guarda: a vaga do seletor tem key pelo id, nunca pela cor (o seletor nativo fechava no arraste)", () => {
  const codigo = readFileSync("components/marca/seletor-de-cores.tsx", "utf8");
  assert.match(codigo, /key=\{v\.id\}/);
  assert.doesNotMatch(codigo, /key=\{`\$\{cor\}/);
  const etapa = readFileSync("components/kanban/step-marca.tsx", "utf8");
  assert.doesNotMatch(etapa, /type="color"/, "a etapa Marca usa o seletor único");
  assert.match(etapa, /<SeletorDeCores/);
  assert.match(readFileSync("components/projects/configuracao-do-projeto.tsx", "utf8"), /<SeletorDeCores/);
});

test("guarda: o assistente e Configurações não gravam mais o laranja da Demandou como escolha", () => {
  const quadro = readFileSync("components/kanban/kanban-board.tsx", "utf8");
  assert.doesNotMatch(quadro, /colorPalette: project\.colorPalette \?\? "#/);
  // O "Próximo" manda o formulário sem a paleta.
  assert.match(quadro, /const \{ colorPalette: _paleta, \.\.\.semPaleta \} = form;/);
  assert.match(quadro, /\.\.\.semPaleta,/);
  const config = readFileSync("components/projects/configuracao-do-projeto.tsx", "utf8");
  assert.doesNotMatch(config, /colorPalette: projeto\.colorPalette \?\? "#/);
});
