// E6 da jornada: "pedir ajuste" no card do vídeo pronto volta ao passo 5 com o texto.
//   - needs_revision com texto gera o pedido no elemento a que ele se refere (o JEV acha qual);
//   - só os afetados são gerados de novo: as mídias desta edição que o pedido não tocou ficam.
// Rodar: npx tsx --test scripts/testes/jornada-e6-ajuste.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ajusteNoPlano } from "@/lib/media/jornada/ajuste";
import { aprovarJornada } from "@/lib/media/jornada/revisao";
import { frasesDaFala } from "@/lib/media/jornada/linha-do-tempo";
import { montarPelaJornada } from "@/lib/media/jornada/montar-servidor";
import type { EstadoDaJornada } from "@/lib/media/jornada/estado";
import type { DependenciasDaGeracao } from "@/lib/media/jornada/geracao";

const fala = "Eu comprei uma Ferrari vermelha no ano passado. Depois vendi tudo e abri a empresa.";
let t = 0;
const palavras = fala.split(" ").map((w) => { const p = { texto: w, inicio: +t.toFixed(2), fim: +(t + 0.3).toFixed(2) }; t += 0.4; return p; });
const frases = frasesDaFala(palavras);
const base: EstadoDaJornada = {
  versao: 1, edicaoId: "e1", leitura: null, amostras: [], revisao: {}, aprovado: null,
  plano: { versao: 1, edicaoId: "e1", estiloDoCliente: "", densidade: { segundosEntreElementos: [5, 8], porque: "" }, custoTotalUsd: 0.12, feitoEm: "x", formato: "9:16", duracao: t, elementos: [
    { id: "el1", momento: { indice: 0, de: 0, ate: 3, frase: frases[0].texto }, gatilho: { palavra: "Ferrari", indice: 3, t: 1.2 }, descricao: "Uma Ferrari vermelha", textoNaImagem: null, midia: "recorte", formato: "recorte-sobre", porque: "", custoUsd: 0.063, origem: "ia", papel: "elemento" },
    { id: "el2", momento: { indice: 1, de: 3.6, ate: 6, frase: frases[1].texto }, gatilho: { palavra: "empresa", indice: 14, t: 5.6 }, descricao: "Fachada de escritório", textoNaImagem: null, midia: "imagem", formato: "janela", porque: "", custoUsd: 0.06, origem: "ia", papel: "elemento" },
  ] },
};

test("o ajuste do card vira pedido no elemento certo, reabre o plano e mantém as mídias que não tocou", async () => {
  const aprovado = aprovarJornada(base);
  const jev = async (_c: unknown, q: Record<string, { type: string }>) => Object.fromEntries(Object.entries(q).map(([k, p]) => [k, p.type === "noul" ? { type: "noul", noul: 0.9 } : { type: "choice", choice: k === "a" ? "el1" : "conteudo", probabilities: {}, confidence: 0.9 }]));
  const feito = await ajusteNoPlano(aprovado, "a Ferrari tem que ser preta", {
    jev: jev as never,
    redator: async () => JSON.stringify({ descricao: "Uma Ferrari preta", textoNaImagem: null }),
    palavras, frases,
    midiasDaEdicao: { el1: { url: "https://blob/el1.webp", tipo: "recorte", formato: "recorte-sobre", proporcao: 1 }, el2: { url: "https://blob/el2.webp", tipo: "imagem", formato: "janela", proporcao: 0.75 } },
  });
  assert.deepEqual(feito.afetados, ["el1"]);
  assert.equal(feito.estado.aprovado, null, "volta ao passo 5: o plano reabre");
  assert.equal(feito.estado.revisao.el1.descricaoAprovada, "Uma Ferrari preta");
  assert.deepEqual(feito.estado.revisao.el1.pedidos.map((p) => p.texto), ["a Ferrari tem que ser preta"]);
  assert.deepEqual(Object.keys(feito.mantidas), ["el2"], "só a afetada é gerada de novo");

  // Aprovado de novo, a montagem gera só a afetada.
  const reaprovado = aprovarJornada(feito.estado);
  const geradas: string[] = [];
  const deps: DependenciasDaGeracao = {
    imagem: async () => { geradas.push("img"); return { dados: Buffer.from("x"), custoUsd: 0.06, modelo: "m" }; },
    imagemReserva: async () => ({ dados: Buffer.from("x"), custoUsd: 0.13, modelo: "r" }),
    video: async () => ({ dados: Buffer.from("x"), custoUsd: 0.3, modelo: "v" }),
    recortar: async (p) => ({ png: p, custoUsd: 0.003 }),
    lerTexto: async () => ({ texto: "", custoUsd: 0 }),
    gravar: async (_d, id) => `https://blob/novo-${id}.webp`,
    medir: async () => 1,
    avisarAdmin: () => {},
  };
  const m = await montarPelaJornada({
    estado: { aprovado: reaprovado.aprovado, leitura: null, midiasMantidas: reaprovado.midiasMantidas },
    falaDoPlano: palavras, falaDoRender: palavras, duracao: t + 1, formato: "9:16", W: 1080, H: 1920, fps: 30, amostras: [],
    contexto: { marca: "x", nicho: "y", perfil: null, cores: { acento: "#f00", escuro: "#000", claro: "#fff" }, estiloDoCliente: "", formato: "9:16", duracao: t, destino: "curto" },
    legenda: { mostrar: false }, temTrilha: false, jev: null, geracao: deps,
    redator: async () => JSON.stringify({ prompts: { el1: "A glossy black sports car, studio light, isolated, clean background" } }),
  });
  assert.equal(geradas.length, 1, "uma geração só: a do elemento afetado");
  assert.equal(m.gerados.find((g) => g.id === "el2")?.url, "https://blob/el2.webp", "a mídia mantida é desta mesma edição");
});

test("o card do completo com needs_revision e texto chama o ajuste da jornada (atrás do interruptor)", () => {
  const s = readFileSync("app/api/campaign-cards/[id]/route.ts", "utf8");
  assert.match(s, /status === "needs_revision" && pedido\?\.trim\(\) && meta\.completo && meta\.videoJobId && editorJornadaLigado\(\)/);
  assert.match(s, /reabrirJornadaComAjuste\(/);
});
