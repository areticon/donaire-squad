// A prova pura da CONFERÊNCIA VISUAL (06/10/2026), sem chamada paga: o olho (Gemini) e o juiz (JEV) são simulados.
//   - etapa 1: imagem boa passa; colagem em painéis é refeita UMA vez com a cena reescrita; a refeita ainda ruim sai;
//     a decisão é do juiz (o olho só descreve);
//   - etapa 2: quadros a cada ~2,5 s e no começo das peças; os problemas descritos viram peça reprovada só quando o juiz diz;
//   - o id da camada volta ao id do plano.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cenaReescrita, conferirImagensGeradas, conferirVideoPronto, idNoPlano, instantesDaConferencia, type Juiz, type Olho } from "@/lib/media/conferencia-visual";
import type { EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";

const palavras = "a padaria abre às cinco da manhã com pão quente para o bairro inteiro".split(" ").map((texto, i) => ({ texto, inicio: i * 0.5, fim: i * 0.5 + 0.45 }));

const descricao = (o: Partial<Record<string, unknown>>) => ({ colagem: false, paineis: 1, temTexto: false, textoLido: "", pessoaReconhecivel: false, assunto: "pão quente no balcão", proibidosVistos: [], defeitos: "", ...o });

test("etapa 1: aprova, refaz uma vez e tira o que continua ruim", async () => {
  const urls: Record<string, ReturnType<typeof descricao>> = {
    "boa.png": descricao({}),
    "colagem.png": descricao({ colagem: true, paineis: 3, assunto: "três fotos genéricas de escritório" }),
    "colagem-refeita.png": descricao({}),
    "texto.png": descricao({ temTexto: true, textoLido: "PADARIA" }),
    "texto-refeita.png": descricao({ temTexto: true, textoLido: "PAO" }),
  };
  const olhadas: string[] = [];
  const olho: Olho = async (p) => {
    const url = p.imagens[0].base64;
    olhadas.push(url);
    return { json: urls[url], custoUsd: 0.0007 };
  };
  // O juiz: aprova quando a descrição é limpa; refaz na primeira; tira a refeita ainda ruim.
  const juiz: Juiz = async (_ctx, perguntas) =>
    Object.fromEntries(
      Object.entries(perguntas).map(([k, q]) => {
        const d = (q.instructions as { descricaoDaImagem: ReturnType<typeof descricao> }).descricaoDaImagem;
        const limpa = d.paineis === 1 && !d.temTexto;
        const opcoes = Object.keys((q as { criteria: Record<string, string> }).criteria);
        const escolha = limpa ? "aprovar" : opcoes.includes("refazer") ? "refazer" : "trocar";
        return [k, { type: "choice", choice: escolha, probabilities: { [escolha]: 0.9 }, confidence: 0.9 }];
      })
    );
  const briefings: Record<string, string> = {};
  const r = await conferirImagensGeradas({
    insercoes: { i1: { url: "boa.png", tipo: "imagem" }, i2: { url: "colagem.png", tipo: "imagem" }, i3: { url: "texto.png", tipo: "imagem" }, v1: { url: "v.mp4", tipo: "video" } },
    plano: [
      { id: "i1", de: "F0", ate: "F0/fim", briefing: "warm bakery" },
      { id: "i2", de: "F0:pão", ate: "F0/fim", briefing: "office stock" },
      { id: "i3", de: "F0", ate: "F0/fim", briefing: "shop front" },
      { id: "v1", de: "F0", ate: "F0/fim", briefing: "video", midia: "video" },
    ],
    palavras,
    comando: "estilo documentário, nada de escritório",
    gerar: async (ins) => {
      briefings[String(ins.id)] = ins.briefing;
      return { midia: { url: ins.id === "i2" ? "colagem-refeita.png" : "texto-refeita.png", tipo: "imagem" }, custoUsd: 0.04 };
    },
    olho,
    juiz,
    baixar: async (url) => ({ base64: url }),
  });
  assert.equal(r.insercoes.i1.url, "boa.png");
  assert.equal(r.insercoes.i2.url, "colagem-refeita.png");
  assert.equal(r.insercoes.i3, undefined);
  assert.deepEqual(r.tiradas, ["i3"]);
  assert.equal(r.insercoes.v1.tipo, "video", "vídeo não passa pela etapa 1");
  assert.ok(!olhadas.includes("v.mp4"));
  assert.match(briefings.i2, /^ONE single scene/);
  assert.match(briefings.i2, /pão quente/);
  assert.match(briefings.i2, /office stock$/);
  assert.equal(r.custoImagensUsd, 0.08);
  assert.equal(olhadas.length, 5, "3 olhadas + 2 refeitas, nunca uma terceira");
  assert.ok(r.custoVisaoUsd > 0);
});

test("etapa 1: sem descrição (olho falhou), a imagem fica e ninguém refaz", async () => {
  const r = await conferirImagensGeradas({
    insercoes: { i1: { url: "x.png", tipo: "imagem" } },
    plano: [{ id: "i1", de: "F0", ate: "F0/fim", briefing: "b" }],
    palavras,
    comando: "",
    gerar: async () => assert.fail("não deve refazer"),
    olho: async () => {
      throw new Error("fora do ar");
    },
    juiz: async () => ({}),
    baixar: async (u) => ({ base64: u }),
  });
  assert.equal(r.insercoes.i1.url, "x.png");
  assert.equal(r.erros.length, 1);
});

test("cena reescrita: genérica, sem cortar o fim do estilo", () => {
  const s = cenaReescrita("STYLE BLOCK", descricao({ temTexto: true, proibidosVistos: ["escritório"] }), "a padaria");
  assert.match(s, /no text/);
  assert.match(s, /Do not show: escritório/);
  assert.doesNotMatch(s, /single scene/, "uma cena só já era");
  assert.ok(s.endsWith("STYLE BLOCK"));
  assert.doesNotMatch(s, new RegExp(String.fromCharCode(0x2014)));
});

const edicao = (): EdicaoResolvida =>
  ({
    versao: 1,
    largura: 1080,
    altura: 1920,
    fps: 30,
    duracao: 12,
    camadas: [
      { id: "m1-moldura", peca: "imagem-janela", de: 2, ate: 5, entrada: 0.3, saida: 0.3, eventos: [], evento: 0, props: { legenda: "pão quente" } },
      { id: "m2", peca: "titulo", de: 7, ate: 9, entrada: 0.3, saida: 0.3, eventos: [], evento: 0, props: { texto: "5 da manhã" } },
    ],
  }) as unknown as EdicaoResolvida;

test("etapa 2: instantes a cada 2,5 s e no começo de cada peça", () => {
  const ins = instantesDaConferencia(edicao());
  const ts = ins.map((x) => x.t);
  assert.ok(ts.includes(2.5) && ts.includes(7.5), JSON.stringify(ts));
  assert.equal(ins.find((x) => x.t === 2.5)?.momento, "m1-moldura");
  assert.equal(ins.find((x) => x.t === 0.8)?.momento, null);
});

test("etapa 2: o juiz reprova, o olho só descreve", async () => {
  let pedidos = 0;
  const olho: Olho = async (p) => {
    assert.equal(p.resolucao, "media");
    // Problema no quadro da peça m2 e um quadro vazio sem peça (a gravação do cliente: nunca reprova).
    const k2 = p.imagens.findIndex((im) => /peça: titulo/.test(im.rotulo ?? ""));
    const k0 = p.imagens.findIndex((im) => /nenhuma/.test(im.rotulo ?? ""));
    return { json: { quadros: [{ k: k2, problemas: [{ tipo: "texto-sobreposto", descricao: "legenda em cima do título" }] }, { k: k0, problemas: [{ tipo: "quadro-vazio", descricao: "preto" }] }] }, custoUsd: 0.001 };
  };
  const juiz: Juiz = async (_c, perguntas) => {
    pedidos++;
    return Object.fromEntries(Object.keys(perguntas).map((k) => [k, { type: "noul", noul: 0.8 }]));
  };
  const r = await conferirVideoPronto({ edicao: edicao(), palavras, comando: "", obterQuadros: async (ts) => ts.map((t) => ({ t, base64: "x" })), olho, juiz });
  assert.equal(pedidos, 1);
  assert.deepEqual(r.reprovadas.map((x) => x.momento), ["m2"]);
  assert.equal(r.notas[0].momento, "m2");
  assert.equal(r.erro, null);
  assert.ok(r.problemas.some((x) => x.momento === null), "o quadro vazio fica no histórico");

  const nao: Juiz = async (_c, perguntas) => Object.fromEntries(Object.keys(perguntas).map((k) => [k, { type: "noul", noul: 0.2 }]));
  const r2 = await conferirVideoPronto({ edicao: edicao(), palavras, comando: "", obterQuadros: async (ts) => ts.map((t) => ({ t, base64: "x" })), olho, juiz: nao });
  assert.equal(r2.reprovadas.length, 0);
});

test("etapa 2: sem quadros, nada é reprovado e o erro fica escrito", async () => {
  const r = await conferirVideoPronto({ edicao: edicao(), palavras, comando: "", obterQuadros: async () => { throw new Error("worker fora"); }, olho: async () => assert.fail(), juiz: async () => ({}) });
  assert.equal(r.reprovadas.length, 0);
  assert.match(r.erro ?? "", /worker fora/);
});

test("id da camada volta ao plano", () => {
  const ids = new Set(["m1", "m2", "i3-img"]);
  assert.equal(idNoPlano("m1-moldura", ids), "m1");
  assert.equal(idNoPlano("m2", ids), "m2");
  assert.equal(idNoPlano("i3-img", ids), "i3-img");
  assert.equal(idNoPlano("fundo-20", ids), null);
});
