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
  assert.deepEqual(ordem.slice(0, 3), ["ler", "redator", "jev"], "leitura, depois ideias, depois decisões");
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
  assert.equal(porGatilho["quente"], null, "'fervendo' não foi dito: o texto cai");
  assert.equal(porGatilho["Instagram."] ?? porGatilho["Instagram"], "Instagram", "marca citada vale");
  assert.equal(textoPermitido("Padaria Dona Rosa", "qualquer fala", { papel: "elemento", marca: "Padaria Dona Rosa" }), "Padaria Dona Rosa", "a marca do projeto vale");
  assert.equal(textoPermitido("Inscreva-se", "qualquer fala", { papel: "chamada" }), "Inscreva-se", "a chamada curta vale");
});

test("nenhuma peça desenhada em código no catálogo da jornada: só os 4 formatos de mídia, e nenhum import do catálogo antigo", () => {
  assert.deepEqual([...FORMATOS_DA_JORNADA], ["tela-cheia", "janela", "recorte-sobre", "broll"]);
  for (const f of readdirSync("lib/media/jornada").filter((x) => x.endsWith(".ts"))) {
    const s = readFileSync(`lib/media/jornada/${f}`, "utf8");
    for (const proibido of ["editor-sob-medida/pecas", "comando-dos-estilos", "biblias", "editor-por-comando/linguagem", "editor-por-comando/elementos", "icones-de-linha", "plano-pelo-jev", "conferencia-visual", "guardas-do-completo", "diretor-de-montagem", "assets-da-montagem", "catalogo-de-estilos", "recortes-vox\"", "acentos-do-vox"]) {
      assert.ok(!s.includes(proibido), `${f} importa ${proibido}`);
    }
  }
});

test("densidade: opções só da duração e do gênero; formatos pela área livre", () => {
  assert.deepEqual(opcoesDeDensidade(60, "pessoa-falando").map((x) => x.faixa), [[3, 5], [5, 8], [8, 12]]);
  assert.deepEqual(opcoesDeDensidade(1200, "pessoa-falando").map((x) => x.faixa), [[12, 20], [20, 35], [35, 60]]);
  assert.ok(opcoesDeDensidade(60, "tela")[0].faixa[0] > opcoesDeDensidade(60, "pessoa-falando")[0].faixa[0], "tela é mais espaçado");
  assert.deepEqual(formatosPossiveis("video", null, "16:9"), ["broll"]);
  assert.deepEqual(formatosPossiveis("recorte", { de: 0, ate: 1, pessoasEmCena: [], movimento: "pouco", acontece: "", mostra: [], falaDe: "", areaLivre: [] }, "9:16"), ["tela-cheia"], "sem área livre, só tela cheia");
  const pedido = pedidoDasIdeias(frasesDaFala(palavras), contexto, null);
  assert.ok(pedido.includes("Nicho: culinária caseira"));
});
