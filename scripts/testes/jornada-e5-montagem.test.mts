// E5 da jornada: passo 7, opções pelo código, escolha pelo JEV, render só com "mídia na caixa" e a legenda.
//   - nenhuma caixa cruza o rosto em amostra alguma do intervalo; caixa dentro da área segura (nada nos 10% de cima do vertical);
//   - entrada a até 0,15 s do gatilho; a legenda segue a escolha do cliente (e a caixa cede a ela);
//   - nenhum elemento desenhado em código: a única peça é "jornada-midia", e a composição dela não importa peça de pecas/*;
//   - o grafo do ffmpeg da jornada sem vignette, noise nem transição; sons só os que a IA decidiu;
//   - a montagem lê só a lista aprovada; nenhuma chamada da seção C no caminho novo.
// Rodar: npx tsx --test scripts/testes/jornada-e5-montagem.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { AREA_SEGURA, caixasCandidatas, legendaDaJornada, montarEdicao, protegidasNoIntervalo, temposDoElemento, type ElementoParaMontar } from "@/lib/media/jornada/montagem";
import type { AmostraDaJornada, ElementoAprovado } from "@/lib/media/jornada/estado";
import type { ElementoGerado } from "@/lib/media/jornada/geracao";
import { grafoDoLote, transicoesDaEdicao } from "../../worker/src/edicao-sob-medida.mjs";

const cruza = (a: { x: number; y: number; w: number; h: number }, b: typeof a) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// A pessoa se mexe: o rosto anda da esquerda para o centro no intervalo.
const amostras: AmostraDaJornada[] = Array.from({ length: 12 }, (_, i) => ({ t: i * 2, rostos: [{ x: 0.3 + i * 0.01, y: 0.34, w: 0.32, h: 0.16 }], corpos: [{ x: 0.25, y: 0.52, w: 0.5, h: 0.48 }] }));

test("nenhuma caixa cruza o rosto em amostra alguma; todas dentro da área segura e fora da legenda", () => {
  for (const formato of ["9:16", "16:9"] as const) {
    const W = formato === "9:16" ? 1080 : 1920;
    const H = formato === "9:16" ? 1920 : 1080;
    const protegidas = protegidasNoIntervalo(amostras, 4, 12);
    const legenda: [number, number] = formato === "9:16" ? [0.68, 0.83] : [0.83, 0.97];
    const cs = caixasCandidatas({ formato, W, H, proporcao: 2.5, protegidas, corpos: amostras[0].corpos, legenda, janela: false });
    assert.ok(cs.length >= 1, `${formato}: ao menos uma opção`);
    const seg = AREA_SEGURA[formato];
    for (const { caixa: c } of cs) {
      for (const a of amostras.filter((x) => x.t >= 4 - 1.2 && x.t <= 12 + 1.2)) for (const r of a.rostos) assert.ok(!cruza(c, r), `${formato}: caixa sobre o rosto em t=${a.t}`);
      assert.ok(c.y >= seg.topo - 1e-9 && c.x >= seg.esquerda - 1e-9 && c.x + c.w <= 1 - seg.direita + 1e-9 && c.y + c.h <= 1 - seg.base + 1e-9, `${formato}: fora da área segura`);
      assert.ok(!(c.y < legenda[1] && c.y + c.h > legenda[0]), "a caixa cede à legenda");
    }
    if (formato === "9:16") for (const { caixa } of cs) assert.ok(caixa.y >= 0.1, "nada nos 10% de cima do vertical");
  }
});

test("entrada a até 0,15 s do gatilho", () => {
  const t = temposDoElemento({ formato: "recorte-sobre", t: 10, fraseDe: 9.2, fraseAte: 12 }, 20, 60);
  assert.ok(Math.abs(t.gatilho.de - 10) <= 0.15);
  assert.ok(t.gatilho.ate - t.gatilho.de >= 2 && t.gatilho.ate - t.gatilho.de <= 4.5);
  const perto = temposDoElemento({ formato: "tela-cheia", t: 10, fraseDe: 9.2, fraseAte: 15 }, 11.5, 60);
  assert.ok(perto.gatilho.ate <= 11.5 - 0.25 + 1e-9, "nunca encosta no próximo");
});

test("a legenda segue a escolha do cliente", () => {
  const palavras = "eu gosto muito de pão quente de manhã".split(" ").map((w, i) => ({ texto: w, inicio: i * 0.4, fim: i * 0.4 + 0.3 }));
  assert.deepEqual(legendaDaJornada({ mostrar: false }, palavras, "9:16", null), { legenda: null, faixa: null });
  const papel = legendaDaJornada({ mostrar: true, estilo: "papel", automatica: false }, palavras, "9:16", null);
  assert.equal((papel.legenda!.estilo as { desenho?: string }).desenho, "papel");
  assert.ok(papel.legenda!.paginas.length >= 2);
  const auto = legendaDaJornada({ mostrar: true, estilo: "limpa", automatica: true }, palavras, "16:9", null);
  assert.equal(auto.legenda!.estilo, undefined, "a Automática é a do vídeo da landing, igual para todo nicho");
});

const aprovado = (id: string, formato: ElementoAprovado["formato"], t: number): ElementoAprovado => ({ id, momento: { indice: 0, de: t - 0.5, ate: t + 2, frase: "frase" }, gatilho: { palavra: "x", indice: 0, t }, descricao: "d", textoNaImagem: null, midia: formato === "broll" ? "video" : formato === "recorte-sobre" ? "recorte" : "imagem", formato, porque: "", custoUsd: 0, origem: "ia", papel: "elemento", pedidos: [] });
const gerado = (id: string, formato: ElementoAprovado["formato"], url: string | null = `https://blob/${id}.webp`): ElementoGerado => ({ id, url, tipo: formato === "broll" ? "video" : formato === "recorte-sobre" ? "recorte" : "imagem", formato, proporcao: formato === "recorte-sobre" ? 2.5 : 1, custoUsd: 0.06, modelo: "m", rodadas: 1, prompt: "p", avisoAdmin: null, avisoCliente: null, tempos: { gerar: 0, recorte: 0, leitura: 0 } });

test("a edição: só 'jornada-midia' nas camadas, tela cheia e B-roll como inserção, sons só os escolhidos, elemento sem mídia fica fora", async () => {
  const els: ElementoParaMontar[] = [
    { aprovado: aprovado("a", "recorte-sobre", 3), gerado: gerado("a", "recorte-sobre"), t: 3, fraseDe: 2.5, fraseAte: 5 },
    { aprovado: aprovado("b", "broll", 9), gerado: gerado("b", "broll", "https://blob/b.mp4"), t: 9, fraseDe: 8.8, fraseAte: 11 },
    { aprovado: aprovado("c", "tela-cheia", 15), gerado: gerado("c", "tela-cheia"), t: 15, fraseDe: 14.5, fraseAte: 17 },
    { aprovado: aprovado("d", "janela", 20), gerado: gerado("d", "janela", null), t: 20, fraseDe: 19.5, fraseAte: 22 },
  ];
  const jev = async (_c: unknown, q: Record<string, { type: string; criteria?: Record<string, string> }>) =>
    Object.fromEntries(Object.entries(q).map(([k, p]) => [k, { type: "choice", choice: k.startsWith("s_") ? (k === "s_a" ? "pop" : "nenhum") : Object.keys(p.criteria ?? {})[0], probabilities: {}, confidence: 0.9 }]));
  const m = await montarEdicao({ elementos: els, amostras, formato: "9:16", W: 1080, H: 1920, fps: 30, duracao: 24, palavras: [{ texto: "oi", inicio: 0, fim: 0.3 }], legenda: { mostrar: true, estilo: "papel", automatica: false }, cores: { acento: "#f00", escuro: "#000", claro: "#fff" }, jev: jev as never, temTrilha: false });
  assert.ok(m.edicao.camadas.every((c) => c.peca === "jornada-midia"), "nenhuma peça desenhada em código");
  assert.deepEqual(m.edicao.camadas.map((c) => c.id), ["a"]);
  assert.deepEqual(Object.keys(m.edicao.insercoes).sort(), ["b", "c"]);
  assert.equal(m.edicao.insercoes.b.tipo, "video");
  assert.deepEqual(m.edicao.sons.map((s) => s.som), ["pop"]);
  assert.ok(!m.edicao.camadas.some((c) => c.id === "d") && !m.edicao.insercoes.d, "elemento sem mídia não entra (o aviso do cliente saiu na geração)");
  assert.equal(m.edicao.jornada, true);
  const camada = m.edicao.camadas[0] as { de: number; props: { caixa: { x: number; y: number; w: number; h: number } } };
  assert.ok(Math.abs(camada.de - 3) <= 0.15);
});

test("o grafo do ffmpeg da jornada: sem vignette, noise, eq nem transição sobre a gravação", () => {
  const ed = { versao: 1, jornada: true, largura: 1080, altura: 1920, fps: 30, duracao: 10, camadas: [], planos: [{ tipo: "insercao", midia: "c", de: 2, ate: 4 }], camera: [], insercoes: {}, legenda: null };
  assert.deepEqual(transicoesDaEdicao(ed), []);
  const g = grafoDoLote(ed, { de: 0, ate: 10, lista: "l.txt" }, { W: 1080, H: 1920, fps: 30, escala: 1, fundos: { liso: "f.png" }, insercoes: { c: { tipo: "imagem", arquivo: "c.png" } }, base: "b.mp4", mascara: () => "m.png", matte: null, quadrosDaBase: 300 });
  assert.ok(!/vignette|noise|eq=|gblur/.test(g.grafo), g.grafo.slice(-400));
  const antigo = grafoDoLote({ ...ed, jornada: undefined }, { de: 0, ate: 10, lista: "l.txt" }, { W: 1080, H: 1920, fps: 30, escala: 1, fundos: { liso: "f.png" }, insercoes: { c: { tipo: "imagem", arquivo: "c.png" } }, base: "b.mp4", mascara: () => "m.png", matte: null, quadrosDaBase: 300 });
  assert.match(antigo.grafo, /vignette/, "o caminho antigo continua igual com a jornada desligada");
  const w = readFileSync("worker/src/edicao-sob-medida.mjs", "utf8");
  assert.match(w, /ed\.jornada \? \(Array\.isArray\(ed\.sons\)/, "sons da jornada: só os que a IA decidiu");
});

test("a composição da jornada não importa peça de pecas/* e não desenha conteúdo", () => {
  const s = readFileSync("worker/remotion/src/jornada/MidiaNaCaixa.tsx", "utf8");
  assert.ok(!/from "\.\.\/sob-medida\/pecas/.test(s) && !/from "\.\.\/sob-medida\/(kit|base|icones|marcas)"/.test(s));
  assert.ok(!/<svg|<text|innerText|fontSize|letterSpacing/.test(s), "nenhum desenho, nenhum texto");
  assert.match(readFileSync("worker/remotion/src/sob-medida/Camadas.tsx", "utf8"), /"jornada-midia": MidiaNaCaixa/);
});

test("a montagem lê só a lista aprovada; nenhuma chamada da seção C no caminho novo", () => {
  const ms = readFileSync("lib/media/jornada/montar-servidor.ts", "utf8");
  assert.match(ms, /elementosAprovados\(/);
  assert.ok(!/plano\.elementos/.test(ms));
  const proibidas = ["conferirVideoPronto", "conferirImagensGeradas", "replanejarMomentosPorComando", "desistirDoSobMedida", "cobrirBuracos", "decidirInscrever", "escreverBlocoDeEstilo", "blocoDeEstiloDeReserva", "promptDaMidia", "temaDoEstilo", "legendaQueVale", "posicionarLegenda", "guardasDoCompleto", "efeitosDaEdicao", "cameraDeRitmo", "bibliaDoEstilo", "montarAberturaDeImpacto", "gerarImagem(", "pecaNoEstiloDoComando", "tirarFotosSemImagem", "semCruzamento", "escolherTeses", "comandoPadrao", "normalizarEscolha"];
  for (const f of readdirSync("lib/media/jornada").filter((x) => x.endsWith(".ts"))) {
    const s = readFileSync(`lib/media/jornada/${f}`, "utf8");
    for (const p of proibidas) assert.ok(!s.includes(p), `${f} chama ${p}`);
  }
  // O bloco da jornada na montagem do completo também.
  const mc = readFileSync("lib/media/montagem-do-completo.ts", "utf8");
  const ini = mc.indexOf("// ─────────────────────────────── 2c. a jornada oficial (E5)");
  const fim = mc.indexOf("/** A edição sob medida desiste e o completo volta à esteira de sempre");
  const bloco = mc.slice(ini, fim);
  assert.ok(ini > 0 && fim > ini);
  for (const p of proibidas) assert.ok(!bloco.includes(p), `a montagem da jornada chama ${p}`);
  assert.match(bloco, /guardaDaFala: null/);
  assert.match(bloco, /escala: 1/, "sem prévia, sem segundo render automático");
});
