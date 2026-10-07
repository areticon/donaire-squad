// E4 da jornada: passo 6, um prompt por elemento, geração na Higgsfield, recorte, leitura só do texto, sem recuo silencioso.
//   - o pedido ao Sonnet tem a fala do momento, a leitura e o contexto do nicho; o prompt final tem o pedido literal do cliente;
//   - nenhum bloco de estilo fixo no prompt;
//   - texto errado gera de novo UMA vez; errado de novo, o elemento sai e o cliente é avisado do momento;
//   - Higgsfield falhou: a imagem sai do Nano Banana Pro, com aviso só ao admin;
//   - B-roll em vídeo só no formato B-roll; nome de mídia único por geração.
// Nada aqui toca banco, IA paga ou rede.
// Rodar: npx tsx --test scripts/testes/jornada-e4-geracao.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { entradasDosPrompts, escreverPrompts, pedidoDosPrompts, promptFinal } from "@/lib/media/jornada/prompts";
import { gerarElementoDaJornada, gerarTodos, type DependenciasDaGeracao } from "@/lib/media/jornada/geracao";
import { fatosDoTexto } from "@/lib/media/jornada/leitura-do-texto";
import { nomeDaMidia, type ElementoAprovado } from "@/lib/media/jornada/estado";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";

const ctx = (nicho: string, marca: string): ContextoDaJornada => ({ marca, nicho, perfil: null, cores: { acento: "#0EA5E9", escuro: "#0B1220", claro: "#F8FAFC" }, estiloDoCliente: "", formato: "9:16", duracao: 60, destino: "vídeo curto vertical" });
const el = (o: Partial<ElementoAprovado>): ElementoAprovado => ({
  id: "el1", momento: { indice: 0, de: 0, ate: 3, frase: "A pressão de doze por oito é o normal para um adulto." }, gatilho: { palavra: "pressão", indice: 1, t: 0.4 },
  descricao: "Um medidor de pressão digital marcando 12 por 8", textoNaImagem: "12 por 8", midia: "recorte", formato: "recorte-sobre", porque: "", custoUsd: 0.063, origem: "ia", papel: "elemento", pedidos: [], ...o,
});

test("o pedido ao Sonnet tem a fala do momento e o contexto do nicho; o prompt final tem o pedido literal do cliente", async () => {
  const entradas = entradasDosPrompts([el({ pedidos: ["troque o medidor branco por um preto"] })], null, "9:16");
  const pedido = pedidoDosPrompts(entradas, ctx("cardiologia, consultório médico", "Clínica Batimento"), null);
  assert.ok(pedido.includes("A pressão de doze por oito é o normal para um adulto."), "fala do momento");
  assert.ok(pedido.includes("cardiologia, consultório médico") && pedido.includes("Clínica Batimento"), "nicho e marca");
  assert.ok(pedido.includes("troque o medidor branco por um preto"), "pedido literal");
  let pedidoRecebido = "";
  const { prompts } = await escreverPrompts(entradas, { contexto: ctx("cardiologia", "Clínica"), leitura: null, redator: async (_s, p) => { pedidoRecebido = p; return JSON.stringify({ prompts: { el1: "A sleek black digital blood pressure monitor on a clean white desk, soft clinical daylight, shallow depth of field" } }); } });
  assert.ok(pedidoRecebido.includes("doze por oito"));
  const final = promptFinal(prompts.el1, entradas[0]);
  assert.ok(final.includes("black digital blood pressure monitor"));
  assert.ok(final.includes("troque o medidor branco por um preto"), "o pedido do cliente chega ao prompt");
  assert.ok(final.includes('"12 por 8"'), "o texto exato entre aspas");
});

test("nenhum bloco de estilo fixo: dois nichos dão prompts sem texto de estilo em comum", () => {
  const a = promptFinal("A golden key over a contract for a new apartment, warm evening light, premium mood", { textoNaImagem: null, pedidos: [], formato: "janela", midia: "imagem" });
  const b = promptFinal("Fresh sourdough loaf with an open crumb on a floured wooden board, morning window light", { textoNaImagem: null, pedidos: [], formato: "janela", midia: "imagem" });
  for (const proibido of ["Visual treatment", "Brand identity colors", "Photographic, natural light", "film grain", "collage", "luxury", "Vox"]) {
    assert.ok(!a.includes(proibido) && !b.includes(proibido), `prompt traz "${proibido}"`);
  }
  const tec = "No text, letters or numbers anywhere. No real recognizable person. High resolution, crisp, no watermark.";
  assert.equal(a.replace(tec, "").trim().length > 40, true);
  assert.notEqual(a.replace(tec, ""), b.replace(tec, ""));
  const fonte = readFileSync("lib/media/jornada/prompts.ts", "utf8");
  assert.ok(!/blocoDeEstilo|GUARDA_DA_IMAGEM|LINGUAGEM_DOS_ESTILOS|familia/i.test(fonte));
});

const png = Buffer.from("png");
function deps(o: { leituras?: string[]; higgsfieldFalha?: boolean } = {}): DependenciasDaGeracao & { chamadas: string[]; avisos: string[]; nomes: string[] } {
  const chamadas: string[] = [];
  const avisos: string[] = [];
  const nomes: string[] = [];
  const leituras = [...(o.leituras ?? [])];
  return {
    chamadas, avisos, nomes,
    imagem: async (prompt) => { chamadas.push(`higgsfield:${prompt.includes("FIX FROM") ? "refeita" : "primeira"}`); if (o.higgsfieldFalha) throw new Error("sem vaga"); return { dados: png, custoUsd: 0.06, modelo: "higgsfield-gpt-image-2.5-medium" }; },
    imagemReserva: async () => { chamadas.push("nano-banana-pro"); return { dados: png, custoUsd: 0.134, modelo: "gemini-3-pro-image-preview" }; },
    video: async () => { chamadas.push("kling"); return { dados: Buffer.from("mp4"), custoUsd: 0.336, modelo: "kling-3.0-pro" }; },
    recortar: async (p) => { chamadas.push("recorte"); return { png: p, custoUsd: 0.003 }; },
    lerTexto: async () => { chamadas.push("leitura"); return { texto: leituras.shift() ?? "", custoUsd: 0.0004 }; },
    jev: null,
    gravar: async (_d, id, ext) => { const n = nomeDaMidia({ videoId: "v", edicaoId: "e", elementoId: id, ext }); nomes.push(n); return `https://blob/${n}`; },
    medir: async () => 1,
    avisarAdmin: (_onde, d) => { avisos.push(d); },
  };
}

test("texto errado gera de novo UMA vez; certo na segunda, entra", async () => {
  const d = deps({ leituras: ["12 pr 8", "12 por 8"] });
  const g = await gerarElementoDaJornada({ ...entradasDosPrompts([el({})], null, "9:16")[0], t: 0.4 }, "A digital blood pressure monitor", d);
  assert.ok(g.url);
  assert.equal(g.rodadas, 2);
  assert.deepEqual(d.chamadas, ["higgsfield:primeira", "recorte", "leitura", "higgsfield:refeita", "recorte", "leitura"]);
  assert.equal(g.avisoCliente, null);
});

test("texto errado nas duas: o elemento sai e o cliente é avisado do momento", async () => {
  const d = deps({ leituras: ["12 pr 8", "21 por 8"] });
  const g = await gerarElementoDaJornada({ ...entradasDosPrompts([el({})], null, "9:16")[0], t: 75 }, "A digital blood pressure monitor", d);
  assert.equal(g.url, null);
  assert.equal(g.rodadas, 2);
  assert.match(g.avisoCliente ?? "", /No momento 1:15/);
  assert.equal(d.chamadas.filter((c) => c.startsWith("higgsfield")).length, 2, "nunca uma terceira geração");
});

test("Higgsfield falhou: Nano Banana Pro com aviso só ao admin", async () => {
  const d = deps({ higgsfieldFalha: true });
  const g = await gerarElementoDaJornada({ ...entradasDosPrompts([el({ textoNaImagem: null })], null, "9:16")[0], t: 1 }, "A digital blood pressure monitor", d);
  assert.ok(g.url);
  assert.equal(g.modelo, "gemini-3-pro-image-preview");
  assert.match(g.avisoAdmin ?? "", /Nano Banana Pro/);
  assert.equal(d.avisos.length, 1);
  assert.equal(g.avisoCliente, null, "o cliente não é avisado da reserva");
});

test("B-roll só no formato B-roll; nomes únicos por geração; em paralelo", async () => {
  const d = deps();
  const lista = entradasDosPrompts([el({ id: "a", textoNaImagem: null }), el({ id: "b", midia: "video", formato: "broll", textoNaImagem: null }), el({ id: "c", midia: "imagem", formato: "janela", textoNaImagem: null })], null, "9:16").map((x) => ({ ...x, t: 1 }));
  const r = await gerarTodos(lista, { a: "x".repeat(50), b: "y".repeat(50), c: "z".repeat(50) }, d);
  assert.equal(d.chamadas.filter((c) => c === "kling").length, 1);
  assert.equal(r.gerados.find((g) => g.id === "b")?.tipo, "video");
  assert.equal(new Set(d.nomes).size, d.nomes.length);
  assert.ok(d.nomes.every((n) => /^edicao\/v\/e\//.test(n)));
});

test("texto inventado (nenhum texto pedido, a arte veio com letras): gera de novo sem texto; persistiu, sai com aviso", async () => {
  const d = deps({ leituras: ["HORIZON", "HORIZON"] });
  const g = await gerarElementoDaJornada({ ...entradasDosPrompts([el({ textoNaImagem: null })], null, "9:16")[0], t: 2 }, "An abstract glowing shape", d);
  assert.equal(g.url, null);
  assert.match(g.avisoCliente ?? "", /texto que ninguém pediu/);
  const ok = await gerarElementoDaJornada({ ...entradasDosPrompts([el({ textoNaImagem: null })], null, "9:16")[0], t: 2 }, "An abstract glowing shape", deps({ leituras: ["HORIZON", ""] }));
  assert.ok(ok.url && ok.rodadas === 2);
});

test("os fatos do texto: acento esquecido é erro", () => {
  assert.equal(fatosDoTexto("Pressão", "Pressão").acentoCerto, true);
  assert.equal(fatosDoTexto("Pressao", "Pressão").acentoCerto, false);
});
