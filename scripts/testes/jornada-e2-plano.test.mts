// E2 da jornada: passo 4 (ideias pelo Sonnet, decisões pelo JEV, densidade pela duração).
//   - a leitura do Gemini acontece ANTES do plano e vai no pedido do Sonnet;
//   - nenhuma peça desenhada em código no catálogo da jornada: só os 4 formatos de mídia;
//   - toda ideia tem gatilho dentro do momento e é palavra da fala;
//   - textoNaImagem só com palavras ditas ou marca citada;
//   - nenhum texto de ficha ou bíblia no pedido; nicho e marca presentes;
//   - densidade escolhida pelo JEV entre opções que dependem só da duração e do gênero lido.
// Nada aqui toca banco, IA paga ou rede.
// Rodar: npx tsx --test scripts/testes/jornada-e2-plano.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { planejarJornada } from "@/lib/media/jornada/planejar";
import { lerIdeias, pedidoDasIdeias, textoPermitido } from "@/lib/media/jornada/ideias";
import { opcoesDeDensidade, formatosPossiveis } from "@/lib/media/jornada/decisoes";
import { frasesDaFala } from "@/lib/media/jornada/linha-do-tempo";
import { FORMATOS_DA_JORNADA } from "@/lib/media/jornada/estado";
import type { ContextoDaJornada } from "@/lib/media/jornada/contexto";
import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";
import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";

const fala = "Hoje eu vou mostrar como fazer um pão de fermentação natural. O segredo é a farinha integral e quarenta e oito horas de descanso. Muita gente erra na água quente. Use o Instagram para mostrar o resultado.";
let t = 0;
const palavras = fala.split(" ").map((w) => { const p = { texto: w, inicio: +t.toFixed(2), fim: +(t + 0.35).toFixed(2) }; t += 0.42; return p; });
const duracao = t + 0.5;
const contexto: ContextoDaJornada = { marca: "Padaria Dona Rosa", nicho: "culinária caseira, pães artesanais", perfil: null, cores: { acento: "#C2410C", escuro: "#1C1917", claro: "#FAFAF9" }, estiloDoCliente: "", formato: "9:16", duracao, destino: "vídeo curto vertical (Reels, Shorts, TikTok)" };
const leitura: LeituraDoVideo = {
  versao: 1, genero: "demonstracao", generoConfianca: 0.9, cenario: "cozinha clara com bancada de madeira e farinha", formato: "9:16", pessoas: [], resumo: "uma cozinheira mostra o preparo de pão", fontes: { medicao: true, visao: "gemini" }, custoUsd: 0.002,
  trechos: [{ de: 0, ate: duracao, pessoasEmCena: [{ id: "p1", caixa: { x: 0.25, y: 0.2, w: 0.5, h: 0.8 }, rosto: { x: 0.4, y: 0.25, w: 0.2, h: 0.12 } }], movimento: "pouco", acontece: "ela sova a massa na bancada", mostra: ["massa", "farinha"], falaDe: "pão", areaLivre: [{ x: 0.05, y: 0.1, w: 0.9, h: 0.12 }, { x: 0.05, y: 0.55, w: 0.4, h: 0.3 }] }],
};

const respostaIdeias = JSON.stringify({ ideias: [
  { frase: 0, gatilho: "pão", descricao: "Um pão de fermentação natural com casca dourada e pestana aberta, sobre tábua de madeira", textoNaImagem: null, midia: "recorte", papel: "elemento", porque: "ela fala do pão" },
  { frase: 1, gatilho: "farinha", descricao: "Saco de farinha integral aberto com a farinha se espalhando em câmera lenta", textoNaImagem: "48 horas", midia: "video", papel: "elemento", porque: "o segredo" },
  { frase: 1, gatilho: "integral", descricao: "Grãos de trigo integral com o número em destaque", textoNaImagem: "farinha integral", midia: "imagem", papel: "elemento", porque: "o ingrediente" },
  { frase: 2, gatilho: "quente", descricao: "Termômetro marcando água quente demais, com um alerta", textoNaImagem: "água fervendo", midia: "recorte", papel: "elemento", porque: "o erro" },
  { frase: 3, gatilho: "Instagram", descricao: "O logo do Instagram flutuando com brilho", textoNaImagem: "Instagram", midia: "recorte", papel: "elemento", porque: "a rede citada" },
  { frase: 3, gatilho: "inexistente", descricao: "ideia com gatilho fora da frase que deve cair", textoNaImagem: null, midia: "imagem", papel: "elemento", porque: "x" },
] });

test("a leitura acontece ANTES do plano e vai no pedido do Sonnet; nicho e marca no pedido; nada de ficha ou bíblia", async () => {
  const ordem: string[] = [];
  const pedidos: string[] = [];
  const jev = async (ctx: { state: unknown }, perguntas: Record<string, PerguntaDoJev>): Promise<Record<string, RespostaDoJev>> => {
    ordem.push("jev");
    const r: Record<string, RespostaDoJev> = {};
    for (const [k, q] of Object.entries(perguntas)) {
      if (q.type === "score") r[k] = { type: "score", score: 3, legend: {}, probabilities: {}, confidence: 0.9 };
      if (q.type === "choice") {
        const ops = Object.keys(q.criteria);
        const choice = k === "densidade" ? "intensa" : ops.includes("a") ? "a" : ops[0];
        r[k] = { type: "choice", choice, probabilities: {}, confidence: 0.9 };
      }
    }
    return r;
  };
  const feito = await planejarJornada(
    { palavras, contexto },
    {
      ler: async () => { ordem.push("ler"); return { leitura, amostras: [], avisos: [], custoUsd: 0.002 }; },
      redator: async (_s, p) => { ordem.push("redator"); pedidos.push(p); return respostaIdeias; },
      jev: jev as never,
    }
  );
  assert.equal(ordem[0], "ler", "a leitura primeiro");
  assert.ok(ordem.indexOf("redator") > 0 && ordem.lastIndexOf("redator") < ordem.indexOf("jev"), "leitura, depois ideias (com os pedidos dirigidos), depois decisões");
  assert.ok(pedidos[0].includes("cozinha clara com bancada"), "a leitura vai no pedido do Sonnet");
  assert.ok(pedidos[0].includes("ela sova a massa"), "o trecho lido vai na frase");
  assert.ok(pedidos[0].includes("Padaria Dona Rosa") && pedidos[0].includes("culinária caseira"), "marca e nicho no pedido");
  for (const proibido of ["Visual treatment", "bloco de estilo", "Galileia", "hormozi", "keynote", "Vox"]) assert.ok(!pedidos[0].toLowerCase().includes(proibido.toLowerCase()), `pedido traz "${proibido}"`);
  const p = feito.plano;
  assert.ok(p.elementos.length >= 2, "o plano tem elementos");
  for (const el of p.elementos) {
    assert.ok((FORMATOS_DA_JORNADA as readonly string[]).includes(el.formato));
    const w = palavras[el.gatilho.indice];
    assert.ok(w && w.texto.replace(/[.,]/g, "") === el.gatilho.palavra, "gatilho é palavra da fala");
    assert.ok(el.gatilho.t >= el.momento.de - 1e-6 && el.gatilho.t <= el.momento.ate + 1e-6, "gatilho dentro do momento");
  }
  assert.ok(!p.elementos.some((e) => e.descricao.includes("deve cair")), "ideia com gatilho fora da frase saiu");
  assert.deepEqual(p.densidade.segundosEntreElementos, opcoesDeDensidade(duracao, "demonstracao")[0].faixa, "a densidade é a que o JEV escolheu, entre as opções da duração e do gênero");
});

test("textoNaImagem só com palavras ditas, número dito ou marca citada", () => {
  const fr = frasesDaFala(palavras);
  const ideias = lerIdeias(respostaIdeias, fr, palavras, contexto);
  const porGatilho = Object.fromEntries(ideias.map((i) => [i.gatilho.palavra, i.textoNaImagem]));
  assert.equal(porGatilho["farinha"], "48 horas", "número dito por extenso vale");
  assert.equal(porGatilho["integral"], "farinha integral");
  assert.equal(porGatilho["quente"], undefined, "'fervendo' não foi dito: a ideia feita em volta desse texto cai inteira");
  assert.equal(porGatilho["Instagram."] ?? porGatilho["Instagram"], "Instagram", "marca citada vale");
  assert.equal(textoPermitido("Padaria Dona Rosa", "qualquer fala", { papel: "elemento", marca: "Padaria Dona Rosa" }), "Padaria Dona Rosa", "a marca do projeto vale");
  assert.equal(textoPermitido("Inscreva-se", "qualquer fala", { papel: "chamada" }), "Inscreva-se", "a chamada curta vale");
});

test("catálogo da jornada: os 4 formatos de mídia e o gráfico em código (07/10), e nenhum import do catálogo antigo", () => {
  assert.deepEqual([...FORMATOS_DA_JORNADA], ["tela-cheia", "janela", "recorte-sobre", "broll", "grafico"]);
  for (const f of readdirSync("lib/media/jornada").filter((x) => x.endsWith(".ts"))) {
    const s = readFileSync(`lib/media/jornada/${f}`, "utf8");
    for (const proibido of ["editor-sob-medida/pecas", "comando-dos-estilos", "biblias", "editor-por-comando/linguagem", "editor-por-comando/elementos", "icones-de-linha", "plano-pelo-jev", "conferencia-visual", "guardas-do-completo", "diretor-de-montagem", "assets-da-montagem", "catalogo-de-estilos", "recortes-vox\"", "acentos-do-vox"]) {
      assert.ok(!s.includes(proibido), `${f} importa ${proibido}`);
    }
  }
});

test("densidade: opções só da duração e do gênero; formatos pela área livre", () => {
  // 07/10 (Bruno): vídeo curto com efeito o tempo todo; mais longo, mais espaçado.
  assert.deepEqual(opcoesDeDensidade(60, "pessoa-falando").map((x) => x.faixa), [[2, 3.5], [2.5, 4.5], [3.5, 6]]);
  assert.ok(opcoesDeDensidade(150, "pessoa-falando")[1].faixa[0] > opcoesDeDensidade(60, "pessoa-falando")[1].faixa[0]);
  assert.deepEqual(opcoesDeDensidade(1200, "pessoa-falando").map((x) => x.faixa), [[12, 20], [20, 35], [35, 60]]);
  assert.ok(opcoesDeDensidade(60, "tela")[0].faixa[0] > opcoesDeDensidade(60, "pessoa-falando")[0].faixa[0], "tela é mais espaçado");
  assert.deepEqual(formatosPossiveis("video", null, "16:9"), ["broll"]);
  assert.deepEqual(formatosPossiveis("recorte", { de: 0, ate: 1, pessoasEmCena: [], movimento: "pouco", acontece: "", mostra: [], falaDe: "", areaLivre: [] }, "9:16"), ["tela-cheia"], "sem área livre, só tela cheia");
  // Vídeo curto: com a pessoa na tela (o gráfico sempre cabe; B-roll vira imagem ao lado; tela cheia só sem lugar).
  assert.deepEqual(formatosPossiveis("grafico", null, "9:16", null, false), ["grafico"]);
  // 08/10 (Bruno): o B-roll realista volta ao vídeo curto, com teto de um a cada 20 s no plano.
  assert.deepEqual(formatosPossiveis("video", null, "9:16", { topo: 0.05, lateral: 0, baixo: 0.3 }, false), ["broll"]);
  assert.deepEqual(formatosPossiveis("imagem", null, "9:16", { topo: 0.25, lateral: 0, baixo: 0.1 }, false), ["recorte-sobre"]);
  assert.ok(!formatosPossiveis("imagem", null, "9:16", { topo: 0.25, lateral: 0, baixo: 0.1 }, false).includes("tela-cheia"));
  // 08/10 (Igor): "tela" lida do quadro inteiro, com o rosto na frente, é fundo e não tira o B-roll; tela ao lado do rosto, sim.
  const rosto = { x: 0.3, y: 0.28, w: 0.3, h: 0.19 };
  const trechoCom = (tela: { x: number; y: number; w: number; h: number }) => ({ de: 0, ate: 5, pessoasEmCena: [{ id: "p1", caixa: { x: 0.1, y: 0.2, w: 0.7, h: 0.8 }, rosto }], movimento: "pouco", acontece: "", mostra: [], falaDe: "", areaLivre: [], tela });
  assert.deepEqual(formatosPossiveis("video", trechoCom({ x: 0, y: 0, w: 1, h: 1 }) as never, "9:16", { topo: 0.1, lateral: 0, baixo: 0.2 }, false), ["broll"]);
  assert.notDeepEqual(formatosPossiveis("video", trechoCom({ x: 0.62, y: 0.1, w: 0.36, h: 0.4 }) as never, "9:16", { topo: 0.1, lateral: 0, baixo: 0.2 }, false), ["broll"]);
  const pedido = pedidoDasIdeias(frasesDaFala(palavras), contexto, null);
  assert.ok(pedido.includes("Nicho: culinária caseira"));
});

test("abertura obrigatória: algo de impacto sempre entra nos primeiros 6 s (07/10)", async () => {
  const { planoDasRespostas } = await import("@/lib/media/jornada/decisoes");
  const frase = (indice: number, inicio: number) => ({ indice, de: indice * 10, ate: indice * 10 + 5, inicio, fim: inicio + 3, texto: `frase ${indice}` });
  const ideia = (f: number, t: number, midia: "grafico" | "imagem") => ({ frase: f, gatilho: { palavra: "x", indice: f * 10, t }, descricao: `ideia da frase ${f}`, textoNaImagem: null, midia, papel: "elemento" as const, porque: "" });
  const momentos = [
    { frase: frase(0, 1), ideias: [ideia(0, 2, "grafico")], trecho: null, livre: null },
    { frase: frase(1, 12), ideias: [ideia(1, 13, "grafico")], trecho: null, livre: null },
  ];
  // O JEV deu força baixa ao começo: mesmo assim a abertura entra.
  const r = { f0: { type: "score", score: 0.4 }, i0: { type: "choice", choice: "a", confidence: 0.9 }, f1: { type: "score", score: 2.6 }, i1: { type: "choice", choice: "a", confidence: 0.9 } } as unknown as Record<string, RespostaDoJev>;
  const d = planoDasRespostas(momentos as never, r, { formato: "9:16", duracao: 40, genero: "pessoa-falando", tetoUsd: 1, novoId: (k) => `el${k + 1}` });
  const cedo = d.elementos.find((e) => e.gatilho.t < 6);
  assert.ok(cedo, "nenhum elemento nos primeiros 6 s");
  assert.equal(cedo!.papel, "abertura");
  assert.equal(cedo!.formato, "grafico");
  assert.equal(cedo!.custoUsd, 0, "o gráfico não custa geração");
});

test("cenas realistas garantidas: sem vídeo proposto no curto, um pedido dirigido só para elas (08/10)", async () => {
  const { escreverIdeias } = await import("@/lib/media/jornada/ideias");
  const longaFala = Array.from({ length: 12 }, (_, i) => `Frase número ${i} sobre o consórcio da família que comprou a casa nova.`).join(" ");
  let tt = 0;
  const pal = longaFala.split(" ").map((w) => { const p = { texto: w, inicio: +tt.toFixed(2), fim: +(tt + 0.35).toFixed(2) }; tt += 0.5; return p; });
  const frases = frasesDaFala(pal);
  const pedidos: string[] = [];
  const redator = async (_s: string, pedido: string) => {
    pedidos.push(pedido);
    if (/CENA REALISTA EM VÍDEO/.test(pedido)) {
      const f = frases.find((x) => x.inicio >= 6)!;
      return JSON.stringify({ ideias: [{ frase: f.indice, gatilho: "casa", descricao: "Família anônima abrindo a porta da casa nova ao entardecer, câmera lenta", textoNaImagem: "casa nova", midia: "video", papel: "abertura", porque: "a conquista" }] });
    }
    return JSON.stringify({ ideias: frases.slice(0, 2).map((f) => ({ frase: f.indice, gatilho: "consórcio", descricao: "Chave da casa nova em metal escovado, isolada", textoNaImagem: null, midia: "recorte", papel: "elemento", porque: "x" })) });
  };
  const { ideias } = await escreverIdeias({ frases, palavras: pal, contexto, leitura: null, redator });
  assert.ok(pedidos.some((p) => /CENA REALISTA EM VÍDEO/.test(p)), "o pedido dirigido não saiu");
  const cena = ideias.find((i) => i.midia === "video");
  assert.ok(cena, "a cena em vídeo não entrou nas ideias");
  assert.equal(cena!.papel, "elemento");
  assert.equal(cena!.textoNaImagem, null, "cena sem texto");
  assert.ok(cena!.gatilho.t >= 6, "a cena fica fora da abertura");
});

test("cena realista pontuada pelo JEV entra no lugar do gráfico do mesmo momento; teto conferido no fim (08/10)", async () => {
  const { planoDasRespostas, perguntasDoPlano } = await import("@/lib/media/jornada/decisoes");
  const frase = (indice: number, inicio: number) => ({ indice, de: indice * 10, ate: indice * 10 + 5, inicio, fim: inicio + 3, texto: `frase ${indice}` });
  const ideia = (f: number, t: number, midia: "grafico" | "recorte" | "video") => ({ frase: f, gatilho: { palavra: "x", indice: f * 10, t }, descricao: `ideia ${midia} da frase ${f}`, textoNaImagem: null, midia, papel: "elemento" as const, porque: "" });
  const momentos = [
    { frase: frase(0, 1), ideias: [ideia(0, 2, "recorte")], trecho: null, livre: { topo: 0.2, lateral: 0, baixo: 0.2 } },
    { frase: frase(1, 15), ideias: [ideia(1, 16, "grafico"), ideia(1, 16.4, "video")], trecho: null, livre: { topo: 0.2, lateral: 0, baixo: 0.2 } },
    { frase: frase(2, 30), ideias: [ideia(2, 31, "recorte")], trecho: null, livre: { topo: 0.2, lateral: 0, baixo: 0.2 } },
  ];
  const q = perguntasDoPlano(momentos as never, { formato: "9:16", duracao: 45, genero: "pessoa-falando" });
  assert.ok(q.v1_1, "a cena em vídeo ganha nota própria");
  const r = {
    f0: { type: "score", score: 2.5 }, i0: { type: "choice", choice: "a" },
    f1: { type: "score", score: 2.8 }, i1: { type: "choice", choice: "a" }, v1_1: { type: "score", score: 2.4 },
    f2: { type: "score", score: 2.2 }, i2: { type: "choice", choice: "a" },
  } as unknown as Record<string, RespostaDoJev>;
  const d = planoDasRespostas(momentos as never, r, { formato: "9:16", duracao: 45, genero: "pessoa-falando", tetoUsd: 2, novoId: (k) => `el${k + 1}` });
  const m1 = d.elementos.filter((e) => e.momento.indice === 1);
  assert.equal(m1.length, 1);
  assert.equal(m1[0].formato, "broll", "a cena pontuada entrou no lugar do gráfico");
  assert.equal(d.custoTotalUsd, +d.elementos.reduce((s, e) => s + e.custoUsd, 0).toFixed(4), "o custo é a soma dos elementos finais");
  // Teto apertado: sai o mais fraco que custa, nunca a abertura.
  const apertado = planoDasRespostas(momentos as never, r, { formato: "9:16", duracao: 45, genero: "pessoa-falando", tetoUsd: 0.4, novoId: (k) => `el${k + 1}` });
  assert.ok(apertado.custoTotalUsd <= 0.4 + 1e-9, `custo ${apertado.custoTotalUsd} acima do teto`);
  assert.ok(apertado.elementos.some((e) => e.gatilho.t < 6), "a abertura fica");
});

test("teto de gráficos: o número dito fica fora do teto e nunca vira objeto derivado (08/10)", async () => {
  const { planoDasRespostas } = await import("@/lib/media/jornada/decisoes");
  const frase = (indice: number, inicio: number) => ({ indice, de: indice * 10, ate: indice * 10 + 5, inicio, fim: inicio + 3, texto: `frase ${indice}` });
  const ideia = (f: number, t: number, midia: "grafico" | "recorte", texto: string | null = null, palavra = "x") => ({ frase: f, gatilho: { palavra, indice: f * 10, t }, descricao: `ideia ${midia} da frase ${f}`, textoNaImagem: texto, midia, papel: "elemento" as const, porque: "" });
  const livre = { topo: 0.2, lateral: 0, baixo: 0.2 };
  const momentos = [
    { frase: frase(0, 1), ideias: [ideia(0, 2, "recorte")], trecho: null, livre },
    { frase: frase(1, 8), ideias: [ideia(1, 9, "grafico", "CONSÓRCIO", "consórcio")], trecho: null, livre },
    { frase: frase(2, 15), ideias: [ideia(2, 16, "grafico", "R$ 424.757", "424757")], trecho: null, livre },
    { frase: frase(3, 25), ideias: [ideia(3, 26, "grafico", "R$ 152.638", "152638")], trecho: null, livre },
  ];
  const r = Object.fromEntries(momentos.flatMap((m) => [[`f${m.frase.indice}`, { type: "score", score: 2.5 }], [`i${m.frase.indice}`, { type: "choice", choice: "a" }]])) as unknown as Record<string, RespostaDoJev>;
  const d = planoDasRespostas(momentos as never, r, { formato: "9:16", duracao: 40, genero: "pessoa-falando", tetoUsd: 2, novoId: (k) => `el${k + 1}` });
  const numeros = d.elementos.filter((e) => e.formato === "grafico" && /\d/.test(e.textoNaImagem ?? ""));
  assert.equal(numeros.length, 2, "os dois números ditos ficam como número");
  const palavrasEmCodigo = d.elementos.filter((e) => e.formato === "grafico" && !/\d/.test(e.textoNaImagem ?? ""));
  assert.ok(palavrasEmCodigo.length <= Math.max(1, Math.floor(d.elementos.length / 3)), "o teto vale para palavra e frase");
});

test("número dito sempre aparece no curto e nenhum buraco longo fica vazio quando há reserva (08/10)", async () => {
  const { planoDasRespostas } = await import("@/lib/media/jornada/decisoes");
  const frase = (indice: number, inicio: number) => ({ indice, de: indice * 10, ate: indice * 10 + 5, inicio, fim: inicio + 3, texto: `frase ${indice}` });
  const ideia = (f: number, t: number, midia: "grafico" | "recorte", texto: string | null = null) => ({ frase: f, gatilho: { palavra: "x", indice: f * 10, t }, descricao: `ideia ${midia} da frase ${f}`, textoNaImagem: texto, midia, papel: "elemento" as const, porque: "" });
  const livre = { topo: 0.2, lateral: 0, baixo: 0.2 };
  const momentos = [
    { frase: frase(0, 1), ideias: [ideia(0, 2, "recorte")], trecho: null, livre },
    { frase: frase(1, 12), ideias: [ideia(1, 13, "recorte")], trecho: null, livre },
    { frase: frase(2, 20), ideias: [ideia(2, 21, "grafico", "R$ 152.638")], trecho: null, livre },
    { frase: frase(3, 30), ideias: [ideia(3, 31, "recorte")], trecho: null, livre },
  ];
  const r = {
    f0: { type: "score", score: 2.5 }, i0: { type: "choice", choice: "a" },
    f1: { type: "score", score: 0.5 }, i1: { type: "choice", choice: "a" }, // força baixa: vai para a reserva
    f2: { type: "score", score: 2.5 }, i2: { type: "choice", choice: "nenhuma" }, // o JEV recusou o número dito
    f3: { type: "score", score: 2.5 }, i3: { type: "choice", choice: "a" },
  } as unknown as Record<string, RespostaDoJev>;
  const d = planoDasRespostas(momentos as never, r, { formato: "9:16", duracao: 36, genero: "pessoa-falando", tetoUsd: 2, novoId: (k) => `el${k + 1}` });
  assert.ok(d.elementos.some((e) => e.textoNaImagem === "R$ 152.638"), "o número dito entrou");
  assert.ok(d.elementos.some((e) => e.momento.indice === 1), "o buraco de 2 a 21 s foi tapado pela reserva");
});
