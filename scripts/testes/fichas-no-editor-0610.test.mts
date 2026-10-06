// A prova do card 714 (06/10/2026): a ficha pesquisada do estilo chega INTEIRA ao editor.
//   - `baseDoBlocoDeEstilo` lê a ficha direto (miniatura sem edição: inteira; comando editado ou estilo
//     identificado pelo JEV: base do redator) e, sem ficha, a linguagem do design do projeto na biblioteca;
//   - `escreverBlocoDeEstilo`, para os 26 estilos vindos da miniatura, devolve o bloco da ficha palavra por
//     palavra, mais o ajuste do redator e as cores; sem o redator, a ficha e as cores (nunca a família);
//   - o plano inteiro (`escreverPlanoPeloJev`) com o JEV e o redator SIMULADOS: o bloco da ficha vai em todo
//     prompt de imagem do plano, as peças da ficha vão no pedido ao redator dos momentos e o ritmo da ficha
//     vai como sugestão no pedido de decisão ao JEV;
//   - o plano reaproveitado de antes de 06/10 (sem as peças gravadas) as reganha pelo estilo do comando;
//   - `comandoPadrao` (projeto sem comando) sai da ficha, com a referência do estilo.
// Nada aqui toca banco, IA paga ou rede.
// Rodar: npx tsx --test scripts/testes/fichas-no-editor-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_DE_ESTILOS } from "@/lib/media/catalogo-de-estilos";
import { LINGUAGEM_DOS_ESTILOS, comandoDoEstilo } from "@/lib/media/editor-por-comando/comando-dos-estilos";
import { FAMILIA, GUARDA_DA_IMAGEM_ESTILIZADA, GUARDA_DO_VIDEO_ESTILIZADO, TETO_DO_BRIEFING_ESTILIZADO, blocoDeEstiloDeReserva, coresNoPrompt, promptDaMidia } from "@/lib/media/editor-por-comando/linguagem";
import { baseDoBlocoDeEstilo, escreverBlocoDeEstilo, escreverPlanoPeloJev, linguagemComFicha, type EntradaDoPlanoPeloJev } from "@/lib/media/editor-por-comando/plano-pelo-jev";
import { comandoPadrao } from "@/lib/media/editor-por-comando";
import { frasesNumeradas } from "@/lib/media/editor-sob-medida/resolver";
import type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import type { perguntarAoJev } from "@/lib/jev/cliente";

delete process.env.TYPESAFE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const TRAVESSAO = /[\u2014\u2013]|\s-\s/;
const PALETA = ["#1F3A5F", "#F2C230", "#F6F1E7"];
const NICHO = "Consultoria de gestão para pequenas empresas de serviços que querem organizar a operação e vender mais";

/** O comando como a miniatura grava: o texto da ficha, origem "referencia" e a referência do estilo. */
function comandoDaMiniatura(id: string): ComandoDoVideo {
  return { texto: comandoDoEstilo(id, { paleta: PALETA, nicho: NICHO }), fonte: "geist", cores: { tipo: "marca" }, origem: "referencia", referencia: id };
}

function entrada(comando: ComandoDoVideo, extra: Partial<EntradaDoPlanoPeloJev> = {}): EntradaDoPlanoPeloJev {
  return { frases: [], duracao: 60, formato: "16:9", comando, base: "keynote", nicho: NICHO, marca: "Passo Firme Consultoria", paleta: PALETA, projectId: null, ...extra };
}

/** O redator simulado: guarda o pedido e responde no formato que o sistema pede. */
type Pedido = { sistema: string; usuario: string };
function redatorSimulado(pedidos: Pedido[]) {
  return async (sistema: string, usuario: string): Promise<string> => {
    pedidos.push({ sistema, usuario });
    if (sistema.includes('{"ajuste":"..."}')) return JSON.stringify({ ajuste: "Subjects come from small service businesses: the front desk, the team board, the invoice on the counter, the owner at work." });
    if (sistema.includes('{"bloco":"..."}')) return JSON.stringify({ bloco: "Rewritten finish that keeps the researched materials, light, grain and composition of the style, adapted to small service businesses and to the brand." });
    // O redator dos momentos: uma props para cada id pedido, com todos os campos que as fichas pedem.
    const ids = [...usuario.matchAll(/^- id (\S+?),/gm)].map((m) => m[1]);
    return JSON.stringify({
      momentos: ids.map((id) => ({
        id,
        props: { cena: "a small bakery owner checking a handwritten order book at the counter", oQueAparece: "dona da padaria conferindo pedidos", texto: "Organize antes de vender", titulo: "Organize antes", frase: "Organize antes de vender", palavra: "organize", legenda: "organize antes" },
      })),
    });
  };
}
const redatorQueFalha = async (): Promise<string> => {
  throw new Error("sem IA paga nesta prova");
};

test("a base do bloco: ficha inteira da miniatura, ficha reescrita no comando editado, linguagem da biblioteca sem ficha", () => {
  const vox = baseDoBlocoDeEstilo(entrada(comandoDaMiniatura("vox")));
  assert.deepEqual(vox && { de: vox.de, estilo: vox.estilo, inteira: vox.inteira, texto: vox.texto }, { de: "ficha", estilo: "vox", inteira: true, texto: LINGUAGEM_DOS_ESTILOS.vox.bloco });
  // O cliente editou o texto da miniatura: a ficha continua a base, mas o redator reescreve (o comando dele vale).
  const editado = baseDoBlocoDeEstilo(entrada({ ...comandoDaMiniatura("vox"), texto: "Estilo Vox, mas com neon roxo", origem: "escrito" }));
  assert.equal(editado?.de, "ficha");
  assert.equal(editado?.inteira, false);
  // O estilo identificado pelo JEV num comando escrito: ficha como base do redator.
  const peloJev = baseDoBlocoDeEstilo(entrada({ texto: "mapas de satélite e rotas", fonte: "geist", cores: { tipo: "marca" }, origem: "escrito" }), "johnny-harris");
  assert.equal(peloJev?.estilo, "johnny-harris");
  assert.equal(peloJev?.inteira, false);
  // Sem ficha: a linguagem do design do projeto na biblioteca, inteira (travessão vira vírgula).
  const escrito: ComandoDoVideo = { texto: "quero tudo em aquarela suave com bordas manchadas", fonte: "geist", cores: { tipo: "marca" }, origem: "escrito" };
  const linguagem = "Soft watercolour wash on cold-press paper \u2014 pigment blooms and hard dried edges, muted earth palette, white paper left open, loose pencil underdrawing visible.";
  const bib = baseDoBlocoDeEstilo(entrada(escrito, { designGravado: { linguagem } }));
  assert.equal(bib?.de, "biblioteca");
  assert.equal(bib?.inteira, true);
  assert.ok(bib && !TRAVESSAO.test(bib.texto));
  assert.ok(bib?.texto.startsWith("Soft watercolour wash on cold-press paper, pigment blooms"));
  // Linguagem curta demais e nenhuma ficha: nada (fica a família).
  assert.equal(baseDoBlocoDeEstilo(entrada(escrito, { designGravado: { linguagem: "watercolour" } })), null);
  assert.equal(baseDoBlocoDeEstilo(entrada(escrito)), null);
  // Referência que não existe no catálogo não vira ficha.
  assert.equal(baseDoBlocoDeEstilo(entrada({ ...escrito, origem: "referencia", referencia: "vox-papel" })), null);
});

test("os 26 estilos da miniatura: o bloco da ficha vai inteiro, com o ajuste e as cores; sem o redator, a ficha e as cores", async () => {
  assert.equal(CATALOGO_DE_ESTILOS.length, 26);
  for (const est of CATALOGO_DE_ESTILOS) {
    const ficha = LINGUAGEM_DOS_ESTILOS[est.id];
    const pedidos: Pedido[] = [];
    const e = entrada(comandoDaMiniatura(est.id), { simulacao: { redator: redatorSimulado(pedidos) } });
    const cores = coresNoPrompt(e.paleta, e.cores);
    const r = await escreverBlocoDeEstilo(e, ficha.familia);
    assert.equal(r.origem, "redator", est.id);
    assert.equal(r.base, "ficha", est.id);
    assert.equal(r.estilo, est.id);
    assert.ok(r.bloco.startsWith(ficha.bloco), `${est.id}: o bloco não começa pela ficha inteira`);
    assert.ok(r.bloco.includes("small service businesses"), `${est.id}: sem o ajuste do redator`);
    assert.ok(r.bloco.endsWith(cores), `${est.id}: sem as cores da marca no fim`);
    assert.ok(!TRAVESSAO.test(r.bloco), `${est.id}: travessão no bloco`);
    // O redator recebeu a ficha inteira e o pedido de AJUSTE (não de reescrita).
    assert.equal(pedidos.length, 1);
    assert.ok(pedidos[0].sistema.includes("Você NÃO reescreve esse bloco"));
    assert.ok(pedidos[0].usuario.includes(ficha.bloco), `${est.id}: a ficha não foi inteira ao redator`);
    // Sem o redator: a ficha e as cores, nunca a semente genérica da família.
    const reserva = await escreverBlocoDeEstilo({ ...e, simulacao: { redator: redatorQueFalha } }, ficha.familia);
    assert.equal(reserva.origem, "reserva");
    assert.equal(reserva.bloco, `${ficha.bloco} ${cores}`);
    assert.ok(!reserva.bloco.includes(FAMILIA[ficha.familia].semente));
  }
});

test("comando editado: o redator reescreve a partir da ficha inteira (bloco e peças) e a reserva guarda a ficha e o texto do cliente", async () => {
  const pedidos: Pedido[] = [];
  const comando: ComandoDoVideo = { ...comandoDaMiniatura("johnny-harris"), texto: "Estilo mapa do Johnny Harris, mas só com mapas noturnos e luzes de cidade", origem: "escrito" };
  const e = entrada(comando, { simulacao: { redator: redatorSimulado(pedidos) } });
  const r = await escreverBlocoDeEstilo(e, "papel");
  assert.equal(r.origem, "redator");
  assert.equal(r.base, "ficha");
  assert.ok(pedidos[0].sistema.includes('{"bloco":"..."}'));
  assert.ok(pedidos[0].usuario.includes(LINGUAGEM_DOS_ESTILOS["johnny-harris"].bloco), "a ficha (bloco) não foi ao redator");
  assert.ok(pedidos[0].usuario.includes(LINGUAGEM_DOS_ESTILOS["johnny-harris"].pecas), "a ficha (peças) não foi ao redator");
  const reserva = await escreverBlocoDeEstilo({ ...e, simulacao: { redator: redatorQueFalha } }, "papel");
  assert.ok(reserva.bloco.startsWith(LINGUAGEM_DOS_ESTILOS["johnny-harris"].bloco));
  assert.ok(reserva.bloco.includes("mapas noturnos e luzes de cidade"));
  // Sem ficha e sem biblioteca, a reserva é a da família, como sempre foi.
  const semNada: ComandoDoVideo = { texto: "quero tudo limpo e moderno", fonte: "geist", cores: { tipo: "marca" }, origem: "escrito" };
  const e2 = entrada(semNada, { simulacao: { redator: redatorQueFalha } });
  const r2 = await escreverBlocoDeEstilo(e2, "minimalista");
  assert.equal(r2.base, null);
  assert.equal(r2.bloco, blocoDeEstiloDeReserva("minimalista", semNada.texto, e2.nicho, coresNoPrompt(e2.paleta, e2.cores)));
});

test("a linguagem do design do projeto na biblioteca vira o bloco, inteira", async () => {
  const pedidos: Pedido[] = [];
  const linguagem = "Soft watercolour wash on cold-press paper, pigment blooms and hard dried edges, muted earth palette, white paper left open, loose pencil underdrawing visible, never digital gradients.";
  const e = entrada({ texto: "quero tudo em aquarela suave com bordas manchadas", fonte: "geist", cores: { tipo: "marca" }, origem: "escrito" }, { designGravado: { linguagem }, simulacao: { redator: redatorSimulado(pedidos) } });
  const r = await escreverBlocoDeEstilo(e, "papel");
  assert.equal(r.base, "biblioteca");
  assert.equal(r.estilo, null);
  assert.ok(r.bloco.startsWith(linguagem));
  assert.ok(pedidos[0].usuario.includes(linguagem));
});

// ─── o plano inteiro com o JEV e o redator simulados ───

/** Uma fala de ~40 s, em frases curtas, com tempo por palavra. */
function fala(): Array<{ texto: string; inicio: number; fim: number }> {
  const frases = [
    "Toda pequena empresa de serviços perde dinheiro no balcão.",
    "Eu vi isso numa padaria em Campinas no ano passado.",
    "O caderno de pedidos estava cheio e ninguém conferia nada.",
    "Em três meses a dona organizou a operação em quatro passos.",
    "Primeiro ela anotou cada pedido no mesmo lugar.",
    "Depois ela olhou os números toda sexta feira.",
    "O faturamento subiu trinta por cento.",
    "Organize antes de vender mais.",
  ];
  const palavras: Array<{ texto: string; inicio: number; fim: number }> = [];
  let t = 0.3;
  for (const f of frases) {
    for (const w of f.split(" ")) {
      palavras.push({ texto: w, inicio: +t.toFixed(2), fim: +(t + 0.38).toFixed(2) });
      t += 0.42;
    }
    t += 0.6;
  }
  return palavras;
}

/** O JEV simulado: escolhe pela chave da pergunta e guarda o estado de cada pedido. */
function jevSimulado(estados: Array<{ etapa: string; state: unknown }>, familia: string, estilo: string): typeof perguntarAoJev {
  return async (ctx, perguntas) => {
    estados.push({ etapa: ctx.etapa, state: ctx.state });
    const saida: Record<string, any> = {};
    for (const [k, q] of Object.entries(perguntas)) {
      if (q.type === "noul") saida[k] = { type: "noul", noul: /^(t|c|p)_/.test(k) ? 0.95 : 0.05 };
      else if (q.type === "score") saida[k] = { type: "score", score: 0.5, legend: {}, probabilities: {}, confidence: 0.5 };
      else {
        const opcoes = Object.keys(q.criteria);
        const j = Number(k.split("_")[1] ?? 0);
        const quer =
          k === "familia" ? familia : k === "estilo" ? estilo : k.startsWith("tipo_") ? (j % 2 === 0 ? "imagem" : "impacto") : k.startsWith("forma_") ? "tela-cheia" : opcoes[0];
        const choice = opcoes.includes(quer) ? quer : opcoes[0];
        saida[k] = { type: "choice", choice, probabilities: Object.fromEntries(opcoes.map((o) => [o, o === choice ? 0.9 : 0.1 / Math.max(1, opcoes.length - 1)])), confidence: 0.9 };
      }
    }
    return saida;
  };
}

test("o plano inteiro: o bloco da ficha em todo prompt de imagem, as peças no redator dos momentos, o ritmo no JEV", async () => {
  for (const id of ["johnny-harris", "vhs", "hormozi"]) {
    const ficha = LINGUAGEM_DOS_ESTILOS[id];
    const palavras = fala();
    const pedidos: Pedido[] = [];
    const estados: Array<{ etapa: string; state: unknown }> = [];
    const e = entrada(comandoDaMiniatura(id), {
      frases: frasesNumeradas(palavras as never),
      palavras,
      duracao: palavras[palavras.length - 1].fim + 0.5,
      simulacao: { jev: jevSimulado(estados, ficha.familia, id), redator: redatorSimulado(pedidos) },
    });
    const r = await escreverPlanoPeloJev(e);
    const ling = r.plano.linguagem as (typeof r.plano.linguagem & { estiloDoCatalogo?: string; pecasDoEstilo?: string; baseDoBloco?: string }) | undefined;
    assert.ok(ling, `${id}: plano sem linguagem (${r.erro ?? ""} ${r.avisos.join("; ")})`);
    assert.equal(ling.estiloDoCatalogo, id);
    assert.equal(ling.pecasDoEstilo, ficha.pecas);
    assert.equal(ling.baseDoBloco, "ficha");
    assert.ok(ling.blocoDeEstilo.startsWith(ficha.bloco), `${id}: o bloco do plano não é a ficha inteira`);
    // O redator dos momentos recebeu as peças da ficha inteiras e o bloco inteiro.
    const doRedator = pedidos.filter((p) => p.sistema.startsWith("Você é o REDATOR"));
    assert.ok(doRedator.length >= 1, `${id}: o redator dos momentos não foi chamado`);
    for (const p of doRedator) {
      assert.ok(p.usuario.includes(`COMO CADA ELEMENTO SE DESENHA NO ESTILO "${id}"`), `${id}: sem o título das peças no redator`);
      assert.ok(p.usuario.includes(ficha.pecas), `${id}: as peças da ficha não chegaram inteiras ao redator`);
      assert.ok(p.usuario.includes(ficha.bloco), `${id}: o bloco da ficha não chegou inteiro ao redator`);
    }
    // Todo prompt de imagem e de vídeo do plano leva a ficha inteira.
    const insercoes = r.plano.insercoes ?? [];
    assert.ok(insercoes.length >= 1, `${id}: o plano saiu sem imagem (${r.avisos.join("; ")})`);
    for (const x of insercoes) {
      const b = String(x.briefing);
      assert.ok(b.includes(ficha.bloco), `${id}: o prompt de ${x.id} não leva a ficha inteira`);
      // Nada cortado pelo teto: o ajuste, as cores e a guarda chegam ao fim do prompt.
      assert.ok(b.includes("small service businesses"), `${id}: o ajuste foi cortado em ${x.id}`);
      assert.ok(b.includes(coresNoPrompt(e.paleta, e.cores)), `${id}: as cores foram cortadas em ${x.id}`);
      assert.ok(b.endsWith(GUARDA_DA_IMAGEM_ESTILIZADA), `${id}: a guarda foi cortada em ${x.id}`);
      assert.ok(b.length <= TETO_DO_BRIEFING_ESTILIZADO);
    }
    // O JEV recebeu o ritmo da ficha como sugestão nos pedidos de decisão.
    const plano = estados.filter((s) => s.etapa === "editor-por-comando-plano");
    assert.ok(plano.length >= 1);
    for (const s of plano) assert.ok(String(s.state).includes(ficha.ritmo), `${id}: o JEV não recebeu o ritmo da ficha`);
    console.log(`\n=== ${id}: ${insercoes.length} imagem(ns), ${r.plano.momentos.length} peça(s), ${doRedator.length} pedido(s) ao redator ===\nPROMPT DA PRIMEIRA IMAGEM: ${String(insercoes[0].briefing).slice(0, 400)}...\n`);
  }
});

test("o pior caso cabe no teto: a maior ficha, o ajuste no máximo, as cores e uma cena longa de vídeo", () => {
  const maior = Object.values(LINGUAGEM_DOS_ESTILOS).reduce((a, b) => (b.bloco.length > a.bloco.length ? b : a));
  const cores = coresNoPrompt(["#1F3A5F", "#F2C230", "#F6F1E7", "#2E7D32", "#B71C1C"], null);
  const bloco = `${maior.bloco} ${"x".repeat(299)}. ${cores}`;
  const cena = "y".repeat(500);
  const video = promptDaMidia(cena, { blocoDeEstilo: bloco }, "video");
  assert.ok(video.endsWith(GUARDA_DO_VIDEO_ESTILIZADO));
  assert.ok(video.length <= TETO_DO_BRIEFING_ESTILIZADO, `o prompt de vídeo do pior caso tem ${video.length} caracteres (teto ${TETO_DO_BRIEFING_ESTILIZADO})`);
  console.log(`\npior caso: ficha de ${maior.bloco.length}, bloco de ${bloco.length}, prompt de vídeo de ${video.length} caracteres\n`);
});

test("o plano reaproveitado de antes de 06/10 reganha as peças da ficha pelo estilo do comando", () => {
  const antiga = { familia: "papel" as const, nome: "Papel", blocoDeEstilo: "old block", origemDoBloco: "redator" as const, fonte: "playfair" as const, cores: "", nicho: null };
  const com = linguagemComFicha(antiga, "vox") as typeof antiga & { estiloDoCatalogo?: string; pecasDoEstilo?: string };
  assert.equal(com.estiloDoCatalogo, "vox");
  assert.equal(com.pecasDoEstilo, LINGUAGEM_DOS_ESTILOS.vox.pecas);
  assert.equal(com.blocoDeEstilo, "old block", "o bloco aprovado pelo cliente não muda");
  // A linguagem que já gravou o estilo fica com ele; sem estilo nenhum, fica como veio.
  const gravada = linguagemComFicha({ ...antiga, estiloDoCatalogo: "lousa" } as typeof antiga, "vox") as typeof antiga & { estiloDoCatalogo?: string };
  assert.equal(gravada.estiloDoCatalogo, "lousa");
  assert.deepEqual(linguagemComFicha(antiga, null), antiga);
});

test("projeto sem comando: o comando padrão sai da ficha, com a referência do estilo", () => {
  const vhs = comandoPadrao({ estiloId: "vhs", camera: [], efeitos: [], look: null } as never);
  assert.equal(vhs.texto, LINGUAGEM_DOS_ESTILOS.vhs.comando);
  assert.equal(vhs.origem, "referencia");
  assert.equal(vhs.referencia, "vhs");
  const base = baseDoBlocoDeEstilo(entrada(vhs));
  assert.equal(base?.inteira, true);
  // O texto que o cliente escreveu na escolha entra junto e vale sobre a ficha (a ficha vira base do redator).
  const proprio = comandoPadrao({ estiloId: "vox", texto: "sem mapas, só jornal", camera: [], efeitos: [], look: null } as never);
  assert.ok(proprio.texto.endsWith("sem mapas, só jornal"));
  assert.equal(proprio.origem, "escrito");
  assert.equal(baseDoBlocoDeEstilo(entrada(proprio))?.inteira, false);
});
