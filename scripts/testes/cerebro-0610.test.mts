// A prova do segundo cérebro do cliente (06/10/2026): a montagem das notas a
// partir das fontes que já existem, a nota de peça com histórico, a leitura
// pelo JEV (trocado por respostas fixas), o bloco que entra no prompt dos
// agentes, a cópia e o que o cliente pode corrigir e apagar. Nada aqui toca
// banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/cerebro-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import type { PerguntaDoJev, RespostaDoJev } from "@/lib/jev/cliente";
import { buscarNotas, cerebroEmMarkdown, montarCerebro, notaDaPeca, notasDoCliente, somarAto, type FontesDoCerebro } from "@/lib/cerebro/montagem";
import { escolherCandidatas, estadoDaNota, lerLeitura, lerNotaPeloJev, perguntasDaNota, PISO_DA_LIGACAO, type Perguntar } from "@/lib/cerebro/jev";
import { blocoDaMemoria } from "@/lib/cerebro/contexto";
import { acoesDaNota, type EventoDaPeca, type NotaDoCerebro, type RegistroDoCerebro } from "@/lib/cerebro/tipos";

const P = "proj1";
const registro = (r: Partial<RegistroDoCerebro> & { nota: string }): { type: string; key: string; value: RegistroDoCerebro } => ({
  type: "cerebro",
  key: r.nota,
  value: { v: 1, tema: null, duradoura: null, confianca: null, ligacoes: [], lidoEm: null, quando: "2026-10-05T12:00:00.000Z", ...r },
});

const evento: EventoDaPeca = {
  alvo: "post",
  alvoId: "post9",
  cardId: "card9",
  postId: "post9",
  rede: "linkedin",
  tipoDePeca: "post",
  trecho: "Cinco erros que travam a sua empresa",
  historico: [
    { ato: "recusou", quando: "2026-10-05T15:00:00.000Z", detalhe: "longo demais" },
    { ato: "aprovou", quando: "2026-10-05T10:00:00.000Z" },
  ],
};

function fontes(): FontesDoCerebro {
  return {
    projeto: { id: P, name: "Projeto Teste", voice: "Direto, sem gírias.", niche: "Consultoria", targetAudience: null, colorPalette: "#112233", updatedAt: "2026-10-01T00:00:00.000Z" },
    memorias: [
      { type: "regra", key: "r1", value: { id: "r1", texto: "Nunca use emoji", porque: "o público é formal", alvos: ["redacao"], status: "aprovada", origem: "cliente", propostaEm: "2026-10-02T00:00:00.000Z", decididaEm: "2026-10-02T01:00:00.000Z" } },
      { type: "regra", key: "r2", value: { id: "r2", texto: "Proposta sem decisão", porque: "x", alvos: ["redacao"], status: "proposta", origem: "roberto", propostaEm: "2026-10-02T00:00:00.000Z" } },
      { type: "restricao", key: "nao_citar", value: ["Volt Robotics"], updatedAt: "2026-09-21T00:00:00.000Z" },
      { type: "preference", key: "feedback_post_1", value: { instruction: "Deixe mais curto", cardType: "post_linkedin" }, metadata: { learnedAt: "2026-10-03T00:00:00.000Z" } },
      { type: "preference", key: "feedback_post_2", value: { instruction: "Tire os emojis, por favor", cardType: "post_linkedin" }, metadata: { learnedAt: "2026-10-03T00:00:00.000Z" } },
      { type: "rejection", key: "rej_1", value: { reason: "Imagem genérica demais", cardType: "media", timestamp: "2026-10-04T00:00:00.000Z" }, metadata: { cardId: "card9" } },
      { type: "vera-pedido", key: "v1", value: { id: "v1", pedido: "Troque a cor da marca para azul", resumo: "Cor da marca", status: "aplicado", criadoEm: "2026-10-04T10:00:00.000Z", aplicadoEm: "2026-10-04T10:01:00.000Z" } },
      { type: "vera-pedido", key: "v2", value: { id: "v2", pedido: "Só proposto", status: "proposto", criadoEm: "2026-10-04T10:00:00.000Z" } },
      registro({ nota: "peca:post:post9", evento }),
      // A regra r9 foi apagada: o registro dela não pode virar nota nem ligação.
      registro({ nota: "regra:r9", ligacoes: [{ para: "regra:r1", confianca: 0.9 }] }),
      registro({ nota: "feedback:f1", tema: "texto", duradoura: true, ligacoes: [{ para: "regra:r1", confianca: 0.88 }, { para: "regra:r9", confianca: 0.95 }] }),
    ],
    contextos: [
      { id: "c1", type: "brand", title: "Manual da marca", compiled: "Cores, tom e público.", status: "pronto", updatedAt: "2026-09-30T00:00:00.000Z" },
      { id: "c2", type: "brand", title: "Ainda lendo", compiled: "", status: "lendo" },
    ],
    materiais: [{ id: "m1", tipo: "foto", nome: "IMG_1.jpg", descricao: "A fundadora na loja", etiquetas: ["pessoa", "local"], status: "pronto", createdAt: "2026-10-01T00:00:00.000Z" }],
    referencias: [
      { id: "ref1", rede: "instagram", perfil: "@exemplo", nome: "Exemplo", motivo: "Mesmo nicho", status: "confirmado", origem: "roberto", updatedAt: "2026-10-01T00:00:00.000Z" },
      { id: "ref2", rede: "tiktok", perfil: "@sugerido", status: "sugerido" },
    ],
    feedbacks: [
      { id: "f1", origem: "chat", texto: "Tire os emojis, por favor", classificacao: "pedido_de_gosto", cardId: "card9", postId: "post9", criadoEm: "2026-10-05T16:00:00.000Z" },
      { id: "f2", origem: "chamado", texto: "O vídeo travou no upload", classificacao: "erro_do_produto", criadoEm: "2026-10-05T17:00:00.000Z" },
    ],
    designs: [{ id: "d1", tipo: "imagem", comoEntrou: "escolhido", updatedAt: "2026-10-02T00:00:00.000Z", design: { nome: "Editorial limpo", descricao: "Fundo claro" } }],
    roteiros: [
      { id: "ro1", titulo: "Por que o caixa some", tese: "Tese A", status: "gravado", updatedAt: "2026-10-02T00:00:00.000Z" },
      { id: "ro2", titulo: "Ideia solta", status: "ideia" },
    ],
  };
}

test("a montagem lê cada fonte que já existe, sem duplicar e sem o que não é decisão do cliente", () => {
  const notas = notasDoCliente(fontes());
  const ids = new Set(notas.map((n) => n.id));
  for (const id of ["tom:voz", "tom:nicho", "tom:cores", "regra:r1", "restricao:nao_citar", "recusa:rej_1", "vera:v1", "contexto:c1", "material:m1", "referencia:ref1", "feedback:f1", "feedback:f2", "design:d1", "roteiro:ro1", "peca:post:post9"]) {
    assert.ok(ids.has(id), `faltou ${id}`);
  }
  // Proposta, pedido só proposto, referência sugerida, roteiro em ideia, documento lendo: não são decisão.
  for (const id of ["regra:r2", "vera:v2", "referencia:ref2", "roteiro:ro2", "contexto:c2", "tom:publico"]) assert.ok(!ids.has(id), `não devia ter ${id}`);
  // A preferência repetida pelo feedback do chat não vira duas notas; a outra fica.
  assert.ok(!ids.has("preferencia:feedback_post_2"));
  assert.ok(ids.has("preferencia:feedback_post_1"));
  // O registro da regra apagada não vira nota.
  assert.ok(!ids.has("regra:r9"));
  const f1 = notas.find((n) => n.id === "feedback:f1")!;
  assert.equal(f1.esfera, "pedidos");
  assert.equal(f1.duradoura, true);
  assert.equal(notas.find((n) => n.id === "feedback:f2")!.esfera, "feedback");
});

test("a nota de peça fica na esfera do ÚLTIMO ato (aprovada e depois recusada é recusa)", () => {
  const n = notaDaPeca(evento, P)!;
  assert.equal(n.esfera, "recusas");
  assert.match(n.texto, /Recusou em .*: longo demais/);
  assert.match(n.texto, /Aprovou em/);
  assert.deepEqual(n.pecas.sort(), ["card:card9", "post:post9"]);
});

test("somarAto junta o mesmo gesto na janela e guarda o que já se sabia da peça", () => {
  const dados = { alvo: "post" as const, alvoId: "p1", postId: "p1", cardId: null, rede: null, tipoDePeca: null, trecho: null };
  const a = somarAto(null, { ato: "aprovou", quando: "2026-10-05T10:00:00.000Z" }, { ...dados, rede: "linkedin", trecho: "Texto" });
  const b = somarAto(a, { ato: "aprovou", quando: "2026-10-05T10:00:40.000Z" }, dados);
  assert.equal(b.historico.length, 1, "o mesmo ato em 40s é o mesmo gesto");
  assert.equal(b.rede, "linkedin");
  assert.equal(b.trecho, "Texto");
  const c = somarAto(b, { ato: "recusou", quando: "2026-10-05T11:00:00.000Z", detalhe: "não gostei" }, dados);
  assert.equal(c.historico.length, 2);
  assert.equal(c.historico[0].ato, "recusou");
  const d = somarAto(c, { ato: "recusou", quando: "2026-10-05T12:00:00.000Z" }, dados);
  assert.equal(d.historico.length, 3, "o mesmo ato fora da janela é outro gesto");
});

test("as ligações: esfera, mesma peça (fato) e JEV só entre notas que existem", () => {
  const c = montarCerebro(fontes(), { agora: new Date("2026-10-06T00:00:00.000Z") });
  const tem = (a: string, b: string, tipo?: string) => c.ligacoes.some((l) => ((l.de === a && l.para === b) || (l.de === b && l.para === a)) && (!tipo || l.tipo === tipo));
  assert.ok(c.notas.some((n) => n.id === "projeto"));
  assert.ok(tem("projeto", "esfera:regras", "esfera"));
  assert.ok(tem("esfera:regras", "regra:r1", "esfera"));
  // Feedback e recusa do card9 se ligam à nota da peça, em estrela.
  assert.ok(tem("peca:post:post9", "feedback:f1", "mesma_peca"));
  assert.ok(tem("peca:post:post9", "recusa:rej_1", "mesma_peca"));
  // A ligação que o JEV decidiu aparece; a que aponta para a regra apagada não.
  assert.ok(tem("feedback:f1", "regra:r1", "jev"));
  assert.ok(!c.ligacoes.some((l) => l.de === "regra:r9" || l.para === "regra:r9"));
  // Nenhum texto sai com travessão.
  for (const n of c.notas) assert.ok(!/[—–]/.test(n.titulo + n.texto), `travessão em ${n.id}`);
});

test("o teto da tela corta as mais antigas e conta quantas ficaram de fora", () => {
  const c = montarCerebro(fontes(), { teto: 5 });
  assert.equal(c.notas.filter((n) => n.fonte !== "esfera" && n.id !== "projeto").length, 5);
  assert.ok(c.cortadas > 0);
  const tudo = montarCerebro(fontes(), { teto: Number.POSITIVE_INFINITY });
  assert.equal(tudo.cortadas, 0);
});

test("as candidatas do JEV: sem a própria nota, sem esferas, sem a mesma peça, regras e tom primeiro", () => {
  const todas = notasDoCliente(fontes());
  const nova = todas.find((n) => n.id === "feedback:f2")!;
  const cand = escolherCandidatas(nova, todas, 4);
  assert.equal(cand.length, 4);
  assert.ok(!cand.some((n) => n.id === nova.id));
  assert.ok(cand.slice(0, 2).every((n) => n.esfera === "regras" || n.esfera === "tom"));
  const daPeca = todas.find((n) => n.id === "feedback:f1")!;
  assert.ok(!escolherCandidatas(daPeca, todas).some((n) => n.id === "peca:post:post9" || n.id === "recusa:rej_1"), "a mesma peça já se liga por fato");
});

test("as perguntas: tema sempre, duradoura só onde o cliente diz um gosto, uma por candidata", () => {
  const todas = notasDoCliente(fontes());
  const pedido = todas.find((n) => n.id === "feedback:f1")!;
  const material = todas.find((n) => n.id === "material:m1")!;
  const cand = escolherCandidatas(pedido, todas, 3);
  const p1 = perguntasDaNota(pedido, cand);
  assert.ok(p1.tema && p1.duradoura && p1.liga_0 && p1.liga_2 && !p1.liga_3);
  assert.ok(!perguntasDaNota(material, cand).duradoura);
  const estado = estadoDaNota(pedido, cand) as { notas_existentes: unknown[]; nota_nova: { titulo: string } };
  assert.equal(estado.notas_existentes.length, 3);
  assert.equal(estado.nota_nova.titulo, pedido.titulo);
});

test("a leitura respeita o 'não sei': tema com confiança baixa e ligação abaixo do piso ficam de fora", () => {
  const cand = [{ id: "a" }, { id: "b" }, { id: "c" }] as NotaDoCerebro[];
  const r: Record<string, RespostaDoJev> = {
    tema: { type: "choice", choice: "texto", probabilities: {}, confidence: 0.9 },
    duradoura: { type: "noul", noul: 0.82 },
    liga_0: { type: "noul", noul: 0.95 },
    liga_1: { type: "noul", noul: PISO_DA_LIGACAO - 0.01 },
    liga_2: { type: "noul", noul: 0.71 },
  };
  const l = lerLeitura(r, cand);
  assert.equal(l.tema, "texto");
  assert.equal(l.duradoura, true);
  assert.deepEqual(l.ligacoes.map((x) => x.para), ["a", "c"]);
  const duvida = lerLeitura({ tema: { type: "choice", choice: "arte", probabilities: {}, confidence: 0.3 }, duradoura: { type: "noul", noul: 0.5 } }, cand);
  assert.equal(duvida.tema, null);
  assert.equal(duvida.duradoura, null);
  assert.deepEqual(duvida.ligacoes, []);
});

test("JEV desligado: a nota fica sem leitura e nada é perguntado; ligado: lê pelo JEV injetado", async () => {
  const todas = notasDoCliente(fontes());
  const nova = todas.find((n) => n.id === "feedback:f2")!;
  const chamadas: Array<{ etapa: string; perguntas: Record<string, PerguntaDoJev> }> = [];
  const falso: Perguntar = async (ctx, perguntas) => {
    chamadas.push({ etapa: ctx.etapa, perguntas });
    const saida: Record<string, RespostaDoJev> = { tema: { type: "choice", choice: "produto", probabilities: {}, confidence: 0.8 }, liga_0: { type: "noul", noul: 0.9 } };
    return saida;
  };
  delete process.env.TYPESAFE_API_KEY;
  const desligado = await lerNotaPeloJev({ nova, todas, projectId: P, perguntar: falso });
  assert.equal(desligado.lida, false);
  assert.equal(chamadas.length, 0);
  process.env.TYPESAFE_API_KEY = "teste";
  delete process.env.JEV_LIGADO;
  const lida = await lerNotaPeloJev({ nova, todas, projectId: P, perguntar: falso });
  assert.equal(lida.lida, true);
  assert.equal(lida.tema, "produto");
  assert.equal(lida.ligacoes.length, 1);
  assert.equal(chamadas[0].etapa, "cerebro-do-cliente");
  delete process.env.TYPESAFE_API_KEY;
});

test("o bloco do prompt: só o duradouro do tema de quem escreve, a correção do cliente vale, pedidos do chat com teto", () => {
  const base = { v: 1 as const, confianca: 0.9, ligacoes: [], lidoEm: "2026-10-05T00:00:00.000Z" };
  const registros: RegistroDoCerebro[] = [
    { ...base, nota: "feedback:1", esfera: "pedidos", tema: "texto", duradoura: true, resumo: "Pediu no chat da peça: nunca use emoji", quando: "2026-10-05T10:00:00.000Z" },
    { ...base, nota: "feedback:2", esfera: "pedidos", tema: "arte", duradoura: true, resumo: "Pediu: fundo sempre claro", quando: "2026-10-05T11:00:00.000Z" },
    { ...base, nota: "feedback:3", esfera: "pedidos", tema: "texto", duradoura: false, resumo: "Troque a palavra X neste post", quando: "2026-10-05T12:00:00.000Z" },
    { ...base, nota: "peca:post:1", esfera: "recusas", tema: "texto", duradoura: true, resumo: "texto velho", correcao: "Textos longos demais não", corrigidaEm: "2026-10-06T00:00:00.000Z", quando: "2026-10-05T09:00:00.000Z" },
  ];
  const texto = blocoDaMemoria({ registros, alvo: "texto" });
  assert.match(texto, /MEMÓRIA DO CLIENTE/);
  assert.match(texto, /nunca use emoji/);
  assert.match(texto, /Textos longos demais não/);
  assert.ok(!texto.includes("texto velho"), "a correção substitui o resumo");
  assert.ok(!texto.includes("fundo sempre claro"), "arte não entra no prompt de texto");
  assert.ok(!texto.includes("palavra X"), "ajuste pontual não entra");
  assert.match(blocoDaMemoria({ registros, alvo: "arte" }), /fundo sempre claro/);
  const comChat = blocoDaMemoria({ registros: [], alvo: "texto", pedidosDoChat: Array.from({ length: 9 }, (_, i) => ({ instrucao: `pedido número ${i}`, quando: null })) });
  assert.equal((comChat.match(/Pediu no chat/g) ?? []).length, 6);
  assert.equal(blocoDaMemoria({ registros: [], alvo: "texto" }), "");
  assert.ok(!/[—–]/.test(texto));
});

test("os termos: o que se corrige e apaga aqui, o que vai para a tela de origem", () => {
  assert.deepEqual(acoesDaNota("feedback"), { corrigir: "aqui", apagar: "aqui" });
  assert.deepEqual(acoesDaNota("peca"), { corrigir: "aqui", apagar: "aqui" });
  assert.deepEqual(acoesDaNota("regra"), { corrigir: "aqui", apagar: "aqui" });
  assert.equal(acoesDaNota("material").apagar, "material");
  assert.equal(acoesDaNota("contexto").apagar, "contexto");
  assert.equal(acoesDaNota("projeto").corrigir, "tela");
  assert.deepEqual(acoesDaNota("esfera"), { corrigir: null, apagar: null });
});

test("a correção do cliente numa nota de peça muda o texto da nota", () => {
  const f = fontes();
  f.memorias = f.memorias.map((m) => (m.key === "peca:post:post9" ? registro({ nota: "peca:post:post9", evento, correcao: "Na verdade recusei pelo tom", corrigidaEm: "2026-10-06T00:00:00.000Z" }) : m));
  const n = notasDoCliente(f).find((x) => x.id === "peca:post:post9")!;
  assert.equal(n.corrigida, true);
  assert.match(n.texto, /Na verdade recusei pelo tom/);
  assert.equal(n.editavel, "Na verdade recusei pelo tom");
});

test("a cópia leva tudo, por esfera, com as ligações e sem travessão; a busca ignora acento", () => {
  const c = montarCerebro(fontes(), { teto: Number.POSITIVE_INFINITY });
  const md = cerebroEmMarkdown(c);
  assert.match(md, /^# Segundo cérebro: Projeto Teste/);
  assert.match(md, /## Regras/);
  assert.match(md, /Nunca use emoji/);
  assert.match(md, /Ligada a: /);
  assert.ok(!/[—–]/.test(md));
  const achadas = buscarNotas(c.notas, "genérica IMAGEM");
  assert.deepEqual(achadas.map((n) => n.id), ["recusa:rej_1"]);
  assert.equal(buscarNotas(c.notas, "").length, c.notas.length);
});
