// A prova da linguagem pesquisada dos 26 estilos de vídeo (06/10/2026):
//   - cada estilo do catálogo tem ficha (comando em português, bloco em inglês,
//     peças, ritmo, família, referências), nos tetos da tela (1500) e da
//     biblioteca (900), sem travessão e sem cor de terceiros;
//   - as palavras do comando levam à família certa pela reserva sem o JEV;
//   - a semente da biblioteca grava o bloco pesquisado;
//   - `escreverBlocoDeEstilo` com o redator SIMULADO (sem IA paga) mostra o
//     bloco que sairia para 5 estilos, e a reserva quando o redator falha.
// Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/estilos-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGO_DE_ESTILOS } from "@/lib/media/catalogo-de-estilos";
import { LINGUAGEM_DOS_ESTILOS, comandoDoEstilo, linguagemDoEstilo } from "@/lib/media/editor-por-comando/comando-dos-estilos";
import { FAMILIA, FAMILIAS, ROTULO_DO_TRATAMENTO, blocoDeEstiloDeReserva, coresNoPrompt, familiaPorPalavras, promptDaMidia } from "@/lib/media/editor-por-comando/linguagem";
import { escreverBlocoDeEstilo, type EntradaDoPlanoPeloJev } from "@/lib/media/editor-por-comando/plano-pelo-jev";
import { sementesDaBiblioteca } from "@/lib/biblioteca-de-design/semente";
import { TETO } from "@/lib/biblioteca-de-design/tipos";
import type { askClaude } from "@/lib/claude";

delete process.env.TYPESAFE_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const TRAVESSAO = /[—–]|\s-\s/;
// O amarelo da Vox e do Hormozi e o ciano medido do Dan Martell nunca entram: a cor é a da marca. ("magenta e ciano" do VHS é o tom físico da fita, não cor de referência.)
const CORES_DE_TERCEIROS = /\b(amarelo|yellow|#12d4ea|#f4fa15|#ffd93d)\b/i;
const PALETA = ["#1F3A5F", "#F2C230", "#F6F1E7"];
const NICHO_LONGO = "Clínica de ortopedia esportiva que atende corredores amadores e atletas de fim de semana com lesão de joelho, tornozelo e quadril na zona sul de São Paulo";
const PUBLICO_LONGO = "Corredores amadores de 30 a 55 anos que treinam para maratona e meia maratona e têm medo de parar por causa de dor";

test("os 26 estilos do catálogo têm ficha de linguagem, nos tetos e sem travessão", () => {
  assert.equal(CATALOGO_DE_ESTILOS.length, 26);
  for (const e of CATALOGO_DE_ESTILOS) {
    const f = LINGUAGEM_DOS_ESTILOS[e.id];
    assert.ok(f, `sem ficha: ${e.id}`);
    assert.ok(f.comando.length <= 650, `${e.id}: comando com ${f.comando.length} caracteres (teto 650)`);
    assert.ok(f.bloco.length <= TETO.linguagem, `${e.id}: bloco com ${f.bloco.length} caracteres (teto ${TETO.linguagem})`);
    const palavras = f.bloco.split(/\s+/).length;
    assert.ok(palavras >= 30 && palavras <= 65, `${e.id}: bloco com ${palavras} palavras (só tratamento, uns 50 a 60)`);
    assert.ok(/avoid/i.test(f.bloco), `${e.id}: bloco sem a lista do que evitar`);
    assert.ok(f.pecas.split(" ").length >= 40, `${e.id}: peças curtas demais`);
    assert.ok(f.referencias.length >= 2, `${e.id}: menos de duas referências`);
    assert.ok(FAMILIAS.some((x) => x.id === f.familia), `${e.id}: família inválida`);
    for (const [campo, texto] of Object.entries({ comando: f.comando, bloco: f.bloco, pecas: f.pecas, ritmo: f.ritmo })) {
      assert.ok(!TRAVESSAO.test(texto), `${e.id}: travessão em ${campo}`);
      assert.ok(!CORES_DE_TERCEIROS.test(texto), `${e.id}: cor de terceiros em ${campo}`);
    }
  }
  assert.equal(Object.keys(LINGUAGEM_DOS_ESTILOS).length, 26);
});

/**
 * O BLOCO É SÓ TRATAMENTO (06/10/2026, tarde): o bloco do consorcio listava
 * escritório, documento, interior de carro, aperto de mão, palco e cidade à
 * noite, e as 7 imagens do vídeo saíram isso. Nenhum bloco nomeia objeto ou
 * lugar como assunto; a "Avoid" fica curta.
 */
const ASSUNTOS = /(office|desk|handshake|car|cars|interior|stage|city|cities|street|streets|newspaper|map|maps|document|documents|laptop|screen|screens|book|books|plant|plants|microphone|microphones|headphones|money|clock|airport|coffee|cork|folder|folders|window at night|corridor|machine|machines|tools|meeting room|confetti|cassette|product photo)/i;

test("os 26 blocos são só tratamento visual: sem objeto nem lugar como assunto, Avoid curta", () => {
  for (const e of CATALOGO_DE_ESTILOS) {
    const b = LINGUAGEM_DOS_ESTILOS[e.id].bloco;
    const achado = b.match(ASSUNTOS);
    assert.ok(!achado, `${e.id}: o bloco nomeia "${achado?.[0]}" como assunto`);
    const evitar = b.split(/avoid:/i)[1] ?? "";
    assert.ok(evitar.split(",").length <= 8, `${e.id}: Avoid longa (${evitar.split(",").length} itens)`);
  }
});

test("as palavras do comando levam à família da ficha pela reserva sem o JEV", () => {
  for (const e of CATALOGO_DE_ESTILOS) {
    const f = LINGUAGEM_DOS_ESTILOS[e.id];
    assert.equal(familiaPorPalavras(f.comando), f.familia, `${e.id}: as palavras do comando caem em "${familiaPorPalavras(f.comando)}", a ficha diz "${f.familia}"`);
  }
});

test("o comando preenchido pela miniatura cabe nos 1500 da tela com nicho e público longos", () => {
  for (const e of CATALOGO_DE_ESTILOS) {
    const t = comandoDoEstilo(e.id, { paleta: PALETA, nicho: NICHO_LONGO, publico: PUBLICO_LONGO });
    assert.ok(t.length <= 1500, `${e.id}: comando preenchido com ${t.length} caracteres`);
    assert.ok(t.includes("Cores da minha marca"), `${e.id}: sem as cores`);
    assert.ok(t.includes("O canal é sobre"), `${e.id}: sem o nicho`);
    assert.ok(t.includes("Como sugestão, sem lista fechada"), `${e.id}: sem a sugestão de ritmo`);
    assert.ok(!TRAVESSAO.test(t), `${e.id}: travessão no comando preenchido`);
  }
  // O exemplo do Bruno: o estilo de mapa para quem fala de demografia pede o mapa animado como elemento central.
  const mapa = comandoDoEstilo("johnny-harris", { paleta: PALETA, nicho: "Demografia e migração no Brasil" });
  assert.match(mapa, /mapa de satélite ou de relevo/);
  assert.match(mapa, /demografia e dados por região/);
  assert.match(mapa, /pontos ou áreas que acendem na cor da marca/);
  assert.equal(linguagemDoEstilo("nao-existe"), undefined);
  assert.equal(comandoDoEstilo("nao-existe", { paleta: PALETA }), "");
});

test("limite conhecido: a reserva por palavras lê o nicho junto com o estilo (só sem JEV)", () => {
  // familiaPorPalavras testa as famílias em ordem fixa sobre o texto inteiro; o nicho "clínica"
  // no comando preenchido puxa um estilo de impacto para "realista" quando o JEV está desligado.
  // Em produção o JEV decide pela ficha da família; registrado aqui para o próximo agente.
  assert.equal(familiaPorPalavras(comandoDoEstilo("hormozi", { paleta: PALETA, nicho: NICHO_LONGO })), "realista");
  assert.equal(familiaPorPalavras(comandoDoEstilo("hormozi", { paleta: PALETA, nicho: "Consultoria de gestão para pequenas empresas de serviços" })), "impacto");
});

test("a semente da biblioteca grava o comando e o bloco pesquisado de cada estilo", () => {
  const videos = sementesDaBiblioteca().filter((s) => s.tipo === "video");
  assert.equal(videos.length, 26);
  for (const s of videos) {
    const f = LINGUAGEM_DOS_ESTILOS[s.catalogoId];
    assert.equal(s.pedidoOriginal, f.comando);
    assert.equal(s.linguagem, f.bloco);
    assert.ok(s.linguagem.length <= TETO.linguagem);
  }
  const imagens = sementesDaBiblioteca().filter((s) => s.tipo === "imagem");
  assert.equal(imagens.length, 53);
  for (const s of imagens) {
    assert.ok(s.linguagem.split(" ").length >= 12, `${s.catalogoId}: linguagem curta`);
    assert.ok(!TRAVESSAO.test(s.linguagem), `${s.catalogoId}: travessão`);
  }
  const frase = imagens.find((s) => s.catalogoId === "frase-fundo-escuro")!;
  assert.match(frase.linguagem, /A single headline, large and centred/);
});

// ─── o redator simulado: o bloco que sairia, sem IA paga ───

// Nicho sem palavra de família (ver o limite conhecido acima), para a prova olhar só o estilo.
const NICHO_NEUTRO = "Consultoria de gestão para pequenas empresas de serviços que querem organizar a operação e vender mais";
const entrada = (id: string): EntradaDoPlanoPeloJev => ({
  frases: [],
  duracao: 600,
  formato: "16:9",
  comando: { texto: comandoDoEstilo(id, { paleta: PALETA, nicho: NICHO_NEUTRO, publico: "Donos de pequenas empresas de serviços" }), fonte: "geist", cores: { tipo: "marca" } },
  base: "serio",
  nicho: NICHO_NEUTRO,
  marca: "Passo Firme Consultoria",
  paleta: PALETA,
  projectId: null,
});

/**
 * O redator de mentira escreve como o Sonnet escreveria se fosse fiel: pega
 * as sementes da família e o acabamento pedido no comando, e devolve um
 * parágrafo em inglês de 35 a 60 palavras, no JSON pedido. Guarda o pedido
 * recebido para a prova conferir o que o produto manda.
 */
const pedidos: Array<{ sistema: string; usuario: string }> = [];
const redatorSimulado: typeof askClaude = async (sistema, usuario) => {
  pedidos.push({ sistema, usuario });
  const sementes = usuario.match(/sementes: (.+?)\)\.\n/)?.[1] ?? "";
  const comando = usuario.match(/Comando do cliente: "(.+?)"\n/)?.[1] ?? "";
  const estilo = comando.split(":")[0].replace(/^Estilo /, "").toLowerCase();
  const bloco = `Finish for every image and clip of this video: ${sementes.split(";")[0]}, in the ${estilo} language the client asked for, matching the client's field and the recording it sits beside, with the brand colour only on small details.`;
  return JSON.stringify({ bloco });
};
const redatorQueFalha: typeof askClaude = async () => {
  throw new Error("sem IA paga nesta prova");
};

const CINCO = ["vox", "johnny-harris", "lousa", "natgeo", "hormozi"];

test("escreverBlocoDeEstilo com o redator simulado: o bloco de 5 estilos, e a reserva quando o redator falha", async () => {
  for (const id of CINCO) {
    const e = entrada(id);
    const familia = LINGUAGEM_DOS_ESTILOS[id].familia;
    assert.equal(familiaPorPalavras(e.comando.texto), familia, `${id}: a reserva sem JEV cai em outra família`);
    const r = await escreverBlocoDeEstilo(e, familia, redatorSimulado);
    assert.equal(r.origem, "redator");
    assert.ok(r.bloco.split(" ").length >= 12);
    assert.match(r.bloco, /#[0-9a-f]{6}/i, `${id}: o bloco saiu sem as cores da marca`);
    assert.ok(!TRAVESSAO.test(r.bloco));
    // O pedido ao redator carrega as sementes novas da família e o comando pesquisado.
    const ultimo = pedidos[pedidos.length - 1];
    assert.ok(ultimo.usuario.includes(FAMILIA[familia].semente), `${id}: o pedido não leva a semente da família`);
    assert.ok(ultimo.usuario.includes(LINGUAGEM_DOS_ESTILOS[id].comando.slice(0, 80)), `${id}: o pedido não leva o comando do estilo`);
    const reserva = await escreverBlocoDeEstilo(e, familia, redatorQueFalha);
    assert.equal(reserva.origem, "reserva");
    assert.equal(reserva.bloco, blocoDeEstiloDeReserva(familia, e.comando.texto, e.nicho, coresNoPrompt(e.paleta, e.cores)));
    const prompt = promptDaMidia("A runner's knee being examined on a clinic table, hands only", { blocoDeEstilo: r.bloco }, "imagem");
    assert.match(prompt, /No text, no letters/);
    console.log(`\n=== ${id} (família ${familia}) ===\nREDATOR SIMULADO: ${r.bloco}\nRESERVA SEM REDATOR: ${reserva.bloco}\nBLOCO PESQUISADO (biblioteca): ${LINGUAGEM_DOS_ESTILOS[id].bloco}\n`);
  }
});

test("o prompt da mídia: a cena primeiro como assunto, o bloco marcado como só tratamento, a guarda contra grade e colagem", () => {
  const cena = "A laptop screen showing a video editing timeline with clips being cut, close-up. Hands resting on the trackpad";
  const bloco = LINGUAGEM_DOS_ESTILOS.consorcio.bloco;
  for (const midia of ["imagem", "video"] as const) {
    const p = promptDaMidia(cena, { blocoDeEstilo: bloco }, midia);
    assert.ok(p.startsWith(cena), "a cena não abre o prompt");
    assert.ok(p.indexOf(ROTULO_DO_TRATAMENTO) > cena.length && p.indexOf(ROTULO_DO_TRATAMENTO) < p.indexOf(bloco), "o rótulo do tratamento não fica entre a cena e o bloco");
    assert.match(p, /not a grid, not a split panel, not a collage of separate pictures/);
    assert.ok(!TRAVESSAO.test(p));
  }
});
