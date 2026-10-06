// A prova do feedback do produto (06/10/2026): a classificação pelo JEV
// (trocado por respostas fixas), a leitura com a margem de "não sei", o
// agrupamento, a contagem por grupo e o prompt do briefing. Nada aqui toca
// banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/feedback-do-produto-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import {
  classificarFeedback,
  estadoDoFeedback,
  lerClassificacao,
  perguntasDaClassificacao,
  type GrupoAberto,
  type Perguntar,
} from "@/lib/feedback/classificar";
import { CLASSIFICACOES, contarPorGrupo, fraseDaContagem, melhoraOProduto, modulosDoTipoDeCard, ordemDoPainel, semEmail, tituloDoGrupo } from "@/lib/feedback/regras";
import { promptDoBriefing } from "@/lib/feedback/briefing";

// O JEV de mentira: cada pergunta recebe a resposta marcada; o resto fica sem
// resposta (que para o código é "não sei"). Guarda o que foi perguntado.
function jevFixo(
  respostas: Record<string, { choice: string; confidence?: number }>,
  chamadas: Array<{ etapa: string; state: unknown; perguntas: Record<string, PerguntaDoJev> }> = []
): Perguntar {
  return async (ctx, perguntas) => {
    chamadas.push({ etapa: ctx.etapa, state: ctx.state, perguntas });
    const saida: Record<string, RespostaDoJev> = {};
    for (const k of Object.keys(perguntas)) {
      const r = respostas[k];
      if (r) saida[k] = { type: "choice", choice: r.choice, probabilities: {}, confidence: r.confidence ?? 0.9 };
    }
    return saida;
  };
}

process.env.TYPESAFE_API_KEY = "teste";
delete process.env.JEV_LIGADO;

const grupos: GrupoAberto[] = [
  { id: "g-sinc", titulo: "O áudio está descasado da boca a partir do meio do vídeo", classificacao: "erro_do_produto", exemplos: ["a voz não bate com a imagem"] },
  { id: "g-cor", titulo: "A letra apareceu vermelha mas eu queria rosa", classificacao: "atendido_como_pedido" },
];

// ─── os quatro casos do pedido do Bruno ───

test("caso 1, sincronia: erro do produto, no grupo da sincronia", async () => {
  const chamadas: Array<{ etapa: string; state: unknown; perguntas: Record<string, PerguntaDoJev> }> = [];
  const r = await classificarFeedback({
    feedback: {
      texto: "O áudio está descasado da boca depois do minuto 8, dá para ver que a fala vem antes.",
      origem: "chat",
      contexto: { tipoDePeca: "vídeo completo", oQueAPlataformaFez: ["video"], respostaDaPlataforma: "Refiz a montagem.", resultado: "feito", modulos: modulosDoTipoDeCard("video_completo") },
    },
    gruposAbertos: grupos,
    perguntar: jevFixo({ classificacao: { choice: "erro_do_produto", confidence: 0.92 }, grupo: { choice: "g-sinc", confidence: 0.88 } }, chamadas),
  });
  assert.equal(r.classificacao, "erro_do_produto");
  assert.equal(r.grupo, "g-sinc");
  assert.equal(melhoraOProduto(r.classificacao), true);
  // Uma chamada só, com as duas perguntas, na etapa certa.
  assert.equal(chamadas.length, 1);
  assert.equal(chamadas[0].etapa, "feedback-do-produto");
  assert.deepEqual(Object.keys(chamadas[0].perguntas).sort(), ["classificacao", "grupo"]);
  const p = chamadas[0].perguntas.classificacao;
  assert.equal(p.type, "choice");
  if (p.type === "choice") assert.deepEqual(Object.keys(p.criteria).sort(), [...CLASSIFICACOES].sort());
});

test("caso 2, cor contra a linha aprovada: atendido como pedido, e o estado leva o que estava aprovado", async () => {
  const chamadas: Array<{ etapa: string; state: unknown; perguntas: Record<string, PerguntaDoJev> }> = [];
  const r = await classificarFeedback({
    feedback: {
      texto: "A letra apareceu vermelha mas eu queria rosa.",
      origem: "chat",
      contexto: {
        tipoDePeca: "imagem",
        oQueAPlataformaFez: ["arte"],
        respostaDaPlataforma: "Refiz a arte com o vermelho #E3000F como cor de destaque.",
        resultado: "feito",
        aprovadoAntes: { linhaDoRoteiro: "título em vermelho sobre a foto", corDaMarca: "#E3000F", textoDaPeca: "Fale com o cliente bruno@exemplo.com hoje" },
      },
    },
    gruposAbertos: grupos,
    perguntar: jevFixo({ classificacao: { choice: "atendido_como_pedido", confidence: 0.84 }, grupo: { choice: "g-cor", confidence: 0.8 } }, chamadas),
  });
  assert.equal(r.classificacao, "atendido_como_pedido");
  assert.equal(r.grupo, "g-cor");
  assert.equal(melhoraOProduto(r.classificacao), false);
  const estado = chamadas[0].state as Record<string, unknown>;
  const aprovado = estado.o_que_o_cliente_tinha_aprovado_antes as Record<string, string>;
  assert.equal(aprovado.linhaDoRoteiro, "título em vermelho sobre a foto");
  assert.equal(aprovado.corDaMarca, "#E3000F");
  // O e-mail nunca vai para o estado.
  assert.ok(!JSON.stringify(estado).includes("bruno@exemplo.com"));
  assert.ok(aprovado.textoDaPeca.includes("[e-mail]"));
});

test("caso 3, dúvida: dúvida de uso, grupo novo", async () => {
  const r = await classificarFeedback({
    feedback: { texto: "Como eu troco o dia de publicação do post de sexta?", origem: "chamado", contexto: { tipoDePeca: "chamado", categoriaDoChamado: "duvida" } },
    gruposAbertos: grupos,
    perguntar: jevFixo({ classificacao: { choice: "duvida_de_uso", confidence: 0.9 }, grupo: { choice: "novo", confidence: 0.95 } }),
  });
  assert.equal(r.classificacao, "duvida_de_uso");
  assert.equal(r.grupo, "novo");
  assert.equal(melhoraOProduto(r.classificacao), false);
});

test("caso 4, pedido de gosto: não melhora o produto; grupo de outra classe vira novo", async () => {
  // O JEV apontou o grupo da sincronia (erro do produto) para um pedido de
  // gosto: classes diferentes não são "o mesmo problema", abre um novo.
  const r = await classificarFeedback({
    feedback: { texto: "troca 'minha preta' por 'minha amiga' na legenda", origem: "chat", contexto: { tipoDePeca: "post de texto", oQueAPlataformaFez: ["texto"], resultado: "feito" } },
    gruposAbertos: grupos,
    perguntar: jevFixo({ classificacao: { choice: "pedido_de_gosto", confidence: 0.9 }, grupo: { choice: "g-sinc", confidence: 0.9 } }),
  });
  assert.equal(r.classificacao, "pedido_de_gosto");
  assert.equal(r.grupo, "novo");
  assert.equal(melhoraOProduto(r.classificacao), false);
});

// ─── a margem de "não sei" ───

test("confiança baixa deixa sem classe e sem grupo (nunca vira erro do produto por padrão)", () => {
  const r = lerClassificacao({ classificacao: { type: "choice", choice: "erro_do_produto", probabilities: {}, confidence: 0.3 } }, grupos);
  assert.equal(r.classificacao, null);
  assert.equal(r.grupo, null);
  assert.equal(r.confianca, 0.3);
});

test("sem grupo aberto a pergunta do grupo não vai, e o grupo é novo", () => {
  const perguntas = perguntasDaClassificacao([]);
  assert.deepEqual(Object.keys(perguntas), ["classificacao"]);
  const r = lerClassificacao({ classificacao: { type: "choice", choice: "erro_do_produto", probabilities: {}, confidence: 0.9 } }, []);
  assert.equal(r.classificacao, "erro_do_produto");
  assert.equal(r.grupo, "novo");
});

test("JEV fora do ar: fica sem classe, sem lançar", async () => {
  const r = await classificarFeedback({
    feedback: { texto: "o corte travou", origem: "chat", contexto: null },
    gruposAbertos: grupos,
    perguntar: async () => {
      throw new Error("JEV respondeu 529");
    },
  });
  assert.equal(r.classificacao, null);
  assert.equal(r.grupo, null);
});

test("o estado leva os grupos abertos com id, problema e classe", () => {
  const estado = estadoDoFeedback({ texto: "x", origem: "chat", contexto: null }, grupos) as { grupos_abertos: Array<{ id: string; problema: string; classificacao: string }> };
  assert.deepEqual(
    estado.grupos_abertos.map((g) => g.id),
    ["g-sinc", "g-cor"]
  );
  assert.equal(estado.grupos_abertos[0].classificacao, "erro_do_produto");
});

// ─── a contagem por grupo ───

test("cinco clientes esta semana: clientes distintos e ocorrências, na semana e no mês", () => {
  const agora = new Date("2026-10-06T12:00:00Z");
  const ha = (dias: number) => new Date(agora.getTime() - dias * 86_400_000);
  const feedbacks = [
    { grupoId: "g-sinc", userId: "u1", criadoEm: ha(0.5) },
    { grupoId: "g-sinc", userId: "u1", criadoEm: ha(1) }, // o mesmo cliente duas vezes
    { grupoId: "g-sinc", userId: "u2", criadoEm: ha(2) },
    { grupoId: "g-sinc", userId: "u3", criadoEm: ha(3) },
    { grupoId: "g-sinc", userId: "u4", criadoEm: ha(5) },
    { grupoId: "g-sinc", userId: "u5", criadoEm: ha(6.5) },
    { grupoId: "g-sinc", userId: "u6", criadoEm: ha(12) }, // fora da semana, dentro do mês
    { grupoId: "g-sinc", userId: "u7", criadoEm: ha(45) }, // fora do mês
    { grupoId: "g-cor", userId: "u1", criadoEm: ha(1) },
    { grupoId: null, userId: "u9", criadoEm: ha(1) }, // sem grupo: não conta em grupo nenhum
  ];
  const c = contarPorGrupo(feedbacks, agora);
  assert.deepEqual(c.get("g-sinc")?.semana, { clientes: 5, ocorrencias: 6 });
  assert.deepEqual(c.get("g-sinc")?.mes, { clientes: 6, ocorrencias: 7 });
  assert.deepEqual(c.get("g-sinc")?.total, { clientes: 7, ocorrencias: 8 });
  assert.deepEqual(c.get("g-cor")?.semana, { clientes: 1, ocorrencias: 1 });
  assert.equal(c.has("null"), false);
  assert.equal(fraseDaContagem({ clientes: 5, ocorrencias: 6 }), "5 clientes, 6 vezes");
  assert.equal(fraseDaContagem({ clientes: 1, ocorrencias: 1 }), "1 cliente, 1 vez");
  assert.equal(fraseDaContagem({ clientes: 0, ocorrencias: 0 }), "nenhum");
});

test("a ordem do painel: aberto antes, erro do produto antes, mais clientes na semana antes", () => {
  const base = { mes: { clientes: 0, ocorrencias: 0 } };
  const lista = [
    { id: "gosto", situacao: "aberto", classificacao: "pedido_de_gosto", semana: { clientes: 9, ocorrencias: 9 }, ...base },
    { id: "aprovado", situacao: "aprovado", classificacao: "erro_do_produto", semana: { clientes: 9, ocorrencias: 9 }, ...base },
    { id: "erro2", situacao: "aberto", classificacao: "erro_do_produto", semana: { clientes: 2, ocorrencias: 2 }, ...base },
    { id: "erro5", situacao: "aberto", classificacao: "erro_do_produto", semana: { clientes: 5, ocorrencias: 7 }, ...base },
    { id: "descartado", situacao: "nao_e_produto", classificacao: "erro_do_produto", semana: { clientes: 9, ocorrencias: 9 }, ...base },
  ];
  lista.sort(ordemDoPainel);
  assert.deepEqual(
    lista.map((g) => g.id),
    ["erro5", "erro2", "gosto", "aprovado", "descartado"]
  );
});

// ─── o título, o e-mail e o briefing ───

test("título do grupo: uma linha curta, sem e-mail", () => {
  assert.equal(tituloDoGrupo("  O áudio\nestá descasado  "), "O áudio está descasado");
  assert.ok(tituloDoGrupo("x".repeat(200)).endsWith("..."));
  assert.equal(semEmail("fale com joao.silva+x@empresa.com.br amanhã"), "fale com [e-mail] amanhã");
  assert.equal(tituloDoGrupo("manda para ana@x.com"), "manda para [e-mail]");
});

test("o prompt do briefing tem as quatro partes, os módulos e nenhum e-mail", () => {
  const { sistema, usuario } = promptDoBriefing({
    titulo: "O áudio está descasado da boca",
    classificacao: "erro_do_produto",
    contagem: { clientes: 5, ocorrencias: 7 },
    exemplos: [
      { texto: "a voz vem antes da boca, escrevo de maria@cliente.com", origem: "chat", contexto: { tipoDePeca: "vídeo completo", modulos: modulosDoTipoDeCard("video_completo"), respostaDaPlataforma: "Refiz.", resultado: "feito" } },
      { texto: "no corte 2 também", origem: "chamado", contexto: { modulos: ["worker/src/edicao-sob-medida.mjs"] } },
    ],
  });
  for (const parte of ["O que o cliente vê", "O que deveria ver", "Onde no código provavelmente está", "Como provar"]) assert.ok(sistema.includes(parte), parte);
  assert.ok(usuario.includes("lib/media/montagem-do-completo.ts"));
  assert.ok(usuario.includes("5 cliente(s), 7 ocorrência(s)"));
  assert.ok(!usuario.includes("maria@cliente.com"));
  const travessao = String.fromCharCode(0x2014);
  assert.ok(!sistema.includes(travessao) && !usuario.includes(travessao), "sem travessão");
});

// ─── o plano do vídeo no contexto (06/10, tarde) ───

test("o plano aprovado do vídeo vira linhas com tempo, cor, lugar e pedido, e chega inteiro ao JEV", async () => {
  const { linhasDoPlanoAprovado } = await import("@/lib/media/roteiro-em-texto");
  const linhas = linhasDoPlanoAprovado({
    trechos: [
      { indice: 0, de: 0, ate: 10, inicio: 0, fim: 14, fala: "abertura", cena: null, sugestao: null },
      {
        indice: 1, de: 11, ate: 30, inicio: 65, fim: 80, fala: "a bola", cena: null, sugestao: "quero a bola maior",
        pecas: [{ peca: "imagem-janela", rotulo: "imagem em janela", texto: "bola de futebol", inicio: 66, tela: false, tipo: "imagem", descricao: "bola de futebol", cor: "vermelho", onde: "no centro da tela", pedido: "bola no meio com letra vermelha", atendido: "sim", motivo: null }],
      },
    ],
  });
  assert.equal(linhas.length, 1, "trecho sem peça nem sugestão fica de fora");
  assert.ok(linhas[0].startsWith("1:05 a 1:20: imagem, bola de futebol, cor vermelho, no centro da tela"), linhas[0]);
  assert.ok(linhas[0].includes('pedido seu: "bola no meio com letra vermelha"'));
  assert.ok(linhas[0].includes('sugestão do cliente: "quero a bola maior"'));

  const plano = Array.from({ length: 60 }, (_, i) => `${i}:00 a ${i}:10: título "frase ${i}" em vermelho`).join("\n");
  const estado = estadoDoFeedback({ texto: "queria rosa", origem: "chat", contexto: { aprovadoAntes: { planoDoVideo: plano, textoDaPeca: "y".repeat(900) } } }, []) as { o_que_o_cliente_tinha_aprovado_antes: Record<string, string> };
  assert.ok(estado.o_que_o_cliente_tinha_aprovado_antes.planoDoVideo.length > 600, "o plano passa do teto de 600 de um texto de peça");
  assert.ok(estado.o_que_o_cliente_tinha_aprovado_antes.planoDoVideo.length <= 3000);
  assert.equal(estado.o_que_o_cliente_tinha_aprovado_antes.textoDaPeca.length, 600);
});
