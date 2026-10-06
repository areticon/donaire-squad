// A prova pura de "o estilo manda na legenda e nas peças" (06/10/2026, noite), sem IA paga:
//   - a legenda "Automática" segue o comando do estilo (posição, tamanho, letra, palavras por vez), e só o
//     estilo fixado pelo cliente passa por cima;
//   - a guarda não rebaixa: o título atrás com a pessoa se mexendo e a folha sem área livre vão para a frente,
//     na versão escolhida pelo JEV, sem cobrir o rosto;
//   - a palavra-tese nunca é interjeição: candidatas da fala e escolha do JEV (simulado).
// Rodar: npx tsx --test scripts/testes/estilo-manda-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  candidatasATese,
  caixaDaVersao,
  faixaPrincipalDaLegenda,
  legendaDasRespostas,
  legendaDesenhada,
  legendaPorPalavras,
  legendaQueVale,
  paginasNoEstilo,
  pecaNaFrente,
  teseServe,
} from "@/lib/media/editor-por-comando/estilo-manda";
import { linguagemDoEstilo } from "@/lib/media/editor-por-comando/comando-dos-estilos";
import { resolverPorComando } from "@/lib/media/editor-por-comando/resolver";
import { escolherTeses, type EntradaDoPlanoPeloJev, type MomentoDecidido } from "@/lib/media/editor-por-comando/plano-pelo-jev";
import { temaDoEstilo } from "@/lib/media/editor-sob-medida";
import type { PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import type { LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { legendaSobMedida } from "../../worker/src/edicao-sob-medida.mjs";

const COMANDO = linguagemDoEstilo("consorcio")?.comando ?? "";

test("a legenda do estilo sai do texto do comando (reserva sem JEV)", () => {
  const l = legendaPorPalavras(COMANDO)!;
  assert.ok(l, "o comando do estilo fala da legenda");
  assert.equal(l.posicao, "centro");
  assert.equal(l.tamanho, "grande");
  assert.equal(l.letra, "condensada");
  assert.equal(l.palavras, 4);
  assert.equal(l.caixaAlta, true);
  assert.equal(legendaPorPalavras("Estilo documental, fusões longas, cor natural."), null);
});

test("só o estilo de legenda fixado pelo cliente passa por cima do estilo", () => {
  assert.equal(legendaQueVale(null, null, COMANDO)?.posicao, "centro");
  assert.equal(legendaQueVale("limpa", null, COMANDO)?.posicao, "baixo");
  assert.equal(legendaQueVale("limpa", null, COMANDO)?.origem, "cliente");
  // A do plano (decidida pelo JEV) vale sobre a leitura do texto.
  assert.equal(legendaQueVale(null, { posicao: "topo", tamanho: "medio", letra: "limpa", palavras: 3, caixaAlta: false, origem: "jev" }, COMANDO)?.posicao, "topo");
  assert.equal(legendaQueVale(null, null, "nada de legenda dita aqui"), null);
});

test("as respostas do JEV decidem a legenda; o que ele não diz fica com o texto", () => {
  const ch = (choice: string, confidence = 0.8) => ({ type: "choice" as const, choice, probabilities: {}, confidence });
  const recuo = legendaPorPalavras(COMANDO);
  const l = legendaDasRespostas({ legendaPosicao: ch("centro"), legendaTamanho: ch("nao-diz"), legendaLetra: ch("condensada"), legendaPalavras: ch("1-2") }, recuo)!;
  assert.equal(l.posicao, "centro");
  assert.equal(l.tamanho, "grande");
  assert.equal(l.palavras, 2);
  assert.equal(l.origem, "jev");
  assert.deepEqual(legendaDasRespostas({}, recuo), recuo);
});

const palavras = "olha isso o consórcio contemplado rende 3 mil reais por mês para quem planeja com disciplina e paciência".split(" ").map((texto, i) => ({ texto, inicio: i * 0.4, fim: i * 0.4 + 0.35 }));

test("as páginas no estilo: até 4 palavras, caixa alta, sem passar do teto de letras", () => {
  const p = paginasNoEstilo(palavras, { palavras: 4, tamanho: "grande", caixaAlta: true }, true);
  assert.ok(p.every((x) => x.texto.split(" ").length <= 4));
  assert.ok(p.every((x) => x.texto === x.texto.toLocaleUpperCase("pt-BR")));
  assert.ok(p.every((x) => x.texto.length <= 22 || x.texto.split(" ").length === 1));
});

test("a legenda do centro fica abaixo do rosto e a faixa dela é a principal", () => {
  const d = legendaDesenhada(legendaPorPalavras(COMANDO)!, { x: 0.3, y: 0.18, w: 0.4, h: 0.26 }, true);
  assert.equal(d.posicao, "centro");
  assert.ok(d.y! >= 0.18 + 0.26);
  const f = faixaPrincipalDaLegenda(d)!;
  assert.equal(f[0], d.y);
});

test("o worker desenha a legenda do estilo: Anton, contorno, no meio, caixa alta", () => {
  const ed = { tema: {}, legenda: { estilo: { posicao: "centro", tamanho: "grande", letra: "condensada", caixaAlta: true, y: 0.5 }, paginas: [{ inicio: 0, fim: 1, texto: "rende três mil" }] } };
  const ass = legendaSobMedida(ed, 1080, 1920, 0, 5);
  assert.match(ass, /Style: Leg,Anton,92,/);
  assert.match(ass, /,8,\d+,\d+,960,1/);
  assert.match(ass, /RENDE TRÊS MIL/);
  // Sem o estilo, a legenda de sempre, byte a byte.
  const sempre = legendaSobMedida({ tema: {}, legenda: { paginas: [{ inicio: 0, fim: 1, texto: "oi" }] } }, 1080, 1920, 0, 5);
  assert.match(sempre, /Style: Leg,Geist SemiBold,54,&H00FFFFFF,&H00FFFFFF,&H281F1106,&H00000000,0,0,0,0,100,100,0,0,3,14,0,2,80,80,384,1/);
});

test("a versão na frente: a do JEV quando cabe, a seguinte quando cobriria o rosto", () => {
  const rostoBaixo = { x: 0.3, y: 0.3, w: 0.4, h: 0.22 };
  const a = pecaNaFrente({ texto: "Disciplina", apoio: "o que faz a carta sair", naFrente: "caixa-no-topo" }, rostoBaixo, true)!;
  assert.equal(a.versao, "caixa-no-topo");
  assert.equal(a.peca, "frase-chave");
  assert.equal(a.doJev, true);
  // Rosto colado no topo: a caixa do topo cobriria; vai o cartão abaixo do rosto.
  const rostoAlto = { x: 0.3, y: 0.08, w: 0.4, h: 0.22 };
  const b = pecaNaFrente({ texto: "Disciplina", naFrente: "caixa-no-topo" }, rostoAlto, true)!;
  assert.equal(b.versao, "cartao-embaixo");
  assert.equal(b.peca, "cartao-de-passo");
  const c = caixaDaVersao("cartao-embaixo", rostoAlto, true);
  assert.ok(c.y >= rostoAlto.y + rostoAlto.h);
  // O número vira o texto principal da versão na frente.
  const n = pecaNaFrente({ valor: 3, prefixo: "R$ ", sufixo: " mil", rotulo: "por mês" }, rostoAlto, true)!;
  assert.equal(n.props.titulo, "R$ 3 mil");
});

const trecho = (movimento: TrechoLido["movimento"]): TrechoLido => ({
  de: 0, ate: 30, pessoasEmCena: [{ id: "p1", caixa: { x: 0.08, y: 0.12, w: 0.84, h: 0.88 }, falando: true } as TrechoLido["pessoasEmCena"][number]], tela: null, quadro: null, movimento, acontece: "fala para a câmera", mostra: [], falaDe: "consórcio", areaLivre: [],
});
const leitura = (movimento: TrechoLido["movimento"]): LeituraDoVideo => ({ versao: 1, genero: "pessoa-falando", generoConfianca: 0.9, cenario: "carro", formato: "9:16", pessoas: [], trechos: [trecho(movimento)], resumo: "", fontes: { medicao: true, visao: null }, custoUsd: 0 });
const ctx = (movimento: TrechoLido["movimento"]) => ({ palavras, duracao: 9, largura: 1080, altura: 1920, tema: temaDoEstilo("consorcio", { acento: "#c9a227", escuro: "#0b0b0b", claro: "#f5f5f5" }), rosto: { x: 0.3, y: 0.2, w: 0.4, h: 0.24 }, comLegenda: true, logoUrl: null, insercoes: {}, leitura: leitura(movimento), legenda: legendaPorPalavras(COMANDO) });

test("resolvedor: com a pessoa se mexendo, o título atrás vai para a frente (não vira sublinhado)", () => {
  const plano: PlanoDoDiretor = { leitura: "", tema: { linguagem: "luxo" }, momentos: [{ id: "j0", peca: "titulo-atras", de: "F0", ate: "F0/fim", props: { texto: "DISCIPLINA", apoio: "faz a carta sair", naFrente: "cartao-embaixo" } }], insercoes: [], enfases: [] };
  const r = resolverPorComando(plano, ctx("muito"));
  const c = r.edicao.camadas.find((x) => x.id === "j0")!;
  assert.ok(c, JSON.stringify(r.avisos));
  assert.notEqual(c.peca, "sublinhado");
  assert.notEqual(c.peca, "titulo-atras");
  assert.ok(r.avisos.some((a) => /foi para a frente/.test(a)), r.avisos.join(" | "));
  // A legenda vem no estilo.
  assert.equal(r.edicao.legenda?.estilo?.posicao, "centro");
  assert.equal(r.edicao.legenda?.estilo?.letra, "condensada");
});

test("resolvedor: sem área livre para a folha do número, ele vai para a frente em vez de sair", () => {
  const plano: PlanoDoDiretor = { leitura: "", tema: { linguagem: "luxo" }, momentos: [{ id: "j31", peca: "numero", de: "F0", ate: "F0/fim", props: { valor: 3, prefixo: "R$ ", sufixo: " mil", apoio: "por mês" } }], insercoes: [], enfases: [] };
  const r = resolverPorComando(plano, ctx("parado"));
  const c = r.edicao.camadas.find((x) => x.id === "j31");
  assert.ok(c, r.avisos.join(" | "));
  assert.ok(!r.avisos.some((a) => /saiu/.test(a)), r.avisos.join(" | "));
});

test("a tese nunca é interjeição; as candidatas saem da fala", () => {
  assert.equal(teseServe("OLHA ISSO"), false);
  assert.equal(teseServe("DISCIPLINA"), true);
  const c = candidatasATese("olha isso, o consórcio contemplado rende 3 mil reais por mês, olha");
  assert.equal(c[0], "3 MIL");
  assert.ok(!c.some((x) => /OLHA|ISSO/.test(x)));
  assert.ok(c.includes("CONSÓRCIO"));
});

test("escolherTeses: o JEV escolhe entre as candidatas e troca a interjeição do redator", async () => {
  const m = { id: "j9", tipo: "texto-atras", variante: "impacto", peca: "titulo-atras", midia: null, f0: 0, f1: 0, de: "F0", ate: "F0/fim", fala: "olha isso, o consórcio contemplado rende 3 mil reais", inicio: 0, fim: 3, tela: false, custo: 0 } as unknown as MomentoDecidido;
  const textos: Record<string, Record<string, unknown>> = { j9: { texto: "OLHA ISSO" } };
  const avisos: string[] = [];
  const jev = async (_c: unknown, perguntas: Record<string, { criteria?: Record<string, string> }>) => {
    const crit = perguntas.tese_j9.criteria!;
    const k = Object.entries(crit).find(([, v]) => v === "CONSÓRCIO")![0];
    return { tese_j9: { type: "choice" as const, choice: k, probabilities: {}, confidence: 0.9 } };
  };
  const e = { comando: { texto: COMANDO }, simulacao: { jev } } as unknown as EntradaDoPlanoPeloJev;
  await escolherTeses(e, [m], textos, avisos);
  assert.equal(textos.j9.texto, "CONSÓRCIO");
  assert.ok(avisos.some((a) => /escolha do JEV/.test(a)));
});
