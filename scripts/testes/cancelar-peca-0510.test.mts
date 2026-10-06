// "Cancelar esta peça" (05/10/2026, 21:05): o caso real do Fé & Gestão, com o
// banco trocado por mocks. O Bruno cancelou o carrossel de segunda pela janela
// do card do Paulo (sem postId), a tela mandou o dia inteiro em postIds e o
// servidor levou o vídeo completo junto. Nada aqui toca banco, IA ou mídia.
// Rodar: npx tsx --test scripts/testes/cancelar-peca-0510.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cancelarPeca,
  cardsIrmaosParaArquivar,
  pecaDoCard,
  postsDaPecaDoCard,
  type CardDaPeca,
  type CardIrmao,
  type DepsDaPeca,
  type PostDaPeca,
} from "@/lib/pipeline/cancelar-campanha";
import type { Aviso } from "@/lib/notificacoes";

// ─── o run cmuvv1pvu, segunda (dia 1), como estava às 21:05 ───

const RUN = "cmuvv1pvu000204l356jnrwia";
const PROJETO = "cmuuvwllb000004l1iqjm1yi2";
const VIDEO = "cmuvv0jje000004l3w6kd1jtw";

const postIg: PostDaPeca = { id: "cmuvv3ash002y04l3nvws7iei", status: "draft", runId: RUN, dayOfWeek: 1, metadata: { videoJobId: VIDEO } };
const postX: PostDaPeca = { id: "cmuvv3dps003104l3fvncxqnh", status: "draft", runId: RUN, dayOfWeek: 1, metadata: { videoJobId: VIDEO } };
const postYoutube: PostDaPeca = {
  id: "cmuvx2ff9000004jqbsjhbo5n",
  status: "draft",
  runId: RUN,
  dayOfWeek: 1,
  metadata: { origem: "video", videoJobId: VIDEO, gravacaoCompleta: true },
};
// Um corte de terça, para provar que outro dia nunca entra.
const postCorteTerca: PostDaPeca = { id: "cmuvw66fe000904levaya6tb1", status: "draft", runId: RUN, dayOfWeek: 2, metadata: { videoJobId: VIDEO, trechoIndice: 0 } };

const cardPaulo: CardDaPeca = {
  id: "cmuvv4i2c004604l3el723l8p",
  runId: RUN,
  projectId: PROJETO,
  postId: null,
  status: "pending",
  content: "Publicação do dia: revise a prévia de cada rede e publique daqui.",
  cardType: "publish",
  dayOfWeek: 1,
  metadata: { videoJobId: VIDEO },
  project: { userId: "bruno" },
};
const cardVitorCompleto: CardDaPeca = {
  id: "cmuvx2ffv000104jqxvc17pdq",
  runId: RUN,
  projectId: PROJETO,
  postId: postYoutube.id,
  status: "pending",
  content: "Vídeo completo",
  cardType: "video_clip",
  dayOfWeek: 1,
  metadata: { videoJobId: VIDEO, destino: "youtube", completo: true },
  project: { userId: "bruno" },
};
const irmaosDeSegunda: CardIrmao[] = [
  { id: "cmuvv1pxw000504l39fb100hs", cardType: "media", postId: postIg.id }, // Diana
  { id: "cmuvv1pxg000404l3zxm4iqk1", cardType: "post_linkedin", postId: postIg.id }, // Igor
  { id: cardVitorCompleto.id, cardType: "video_clip", postId: postYoutube.id }, // Vitor, o completo
];

// ─── a regra pura ───

test("a peça do card do Paulo (sem post) é a de texto; a do card do Vitor é a do completo", () => {
  assert.equal(pecaDoCard(cardPaulo, [postIg, postX, postYoutube]), "texto");
  assert.equal(pecaDoCard(cardVitorCompleto, [postIg, postX, postYoutube]), `completo:${VIDEO}`);
  // Card de vídeo cujo post não veio na lista fala só por si, nunca pelo dia.
  assert.equal(pecaDoCard({ ...cardVitorCompleto, postId: "x" }, []), `video:${cardVitorCompleto.id}`);
});

test("dos posts do dia inteiro, só os da peça de texto ficam para o card do Paulo", () => {
  const ficam = postsDaPecaDoCard(cardPaulo, [postIg, postX, postYoutube, postCorteTerca]).map((p) => p.id);
  assert.deepEqual(ficam, [postIg.id, postX.id]);
});

test("para o card do completo, só o post do YouTube; o carrossel do mesmo dia fica", () => {
  const ficam = postsDaPecaDoCard(cardVitorCompleto, [postIg, postX, postYoutube]).map((p) => p.id);
  assert.deepEqual(ficam, [postYoutube.id]);
});

test("post de outra campanha, mesmo da mesma peça e dia, nunca entra", () => {
  const deOutroRun: PostDaPeca = { ...postX, id: "outro", runId: "run-velho" };
  const ficam = postsDaPecaDoCard(cardPaulo, [postIg, deOutroRun]).map((p) => p.id);
  assert.deepEqual(ficam, [postIg.id]);
});

test("os irmãos que saem junto são os ligados aos posts cancelados, e nunca os de vídeo", () => {
  assert.deepEqual(cardsIrmaosParaArquivar(irmaosDeSegunda, [postIg.id, postX.id]), ["cmuvv1pxw000504l39fb100hs", "cmuvv1pxg000404l3zxm4iqk1"]);
  // Mesmo que o post do YouTube estivesse na lista, o card do Vitor não sai.
  assert.deepEqual(cardsIrmaosParaArquivar(irmaosDeSegunda, [postYoutube.id]), []);
});

// ─── a execução, com o banco trocado por mocks ───

type Chamadas = { cancelados: string[]; arquivados: string[]; runsArquivados: string[]; avisos: Aviso[] };

function deps(opcoes: { card?: CardDaPeca | null; posts?: PostDaPeca[]; irmaos?: CardIrmao[]; vivosDepois?: number; pode?: boolean } = {}) {
  const c: Chamadas = { cancelados: [], arquivados: [], runsArquivados: [], avisos: [] };
  const posts = opcoes.posts ?? [postIg, postX, postYoutube];
  const d: DepsDaPeca = {
    async lerCard() {
      return opcoes.card === undefined ? cardPaulo : opcoes.card;
    },
    async podeUsar() {
      return opcoes.pode ?? true;
    },
    async lerPosts(ids) {
      return posts.filter((p) => ids.includes(p.id));
    },
    async cancelarPosts(ids) {
      c.cancelados.push(...ids);
      return ids.length;
    },
    async lerCardsDosPosts(_runId, postIds) {
      return (opcoes.irmaos ?? irmaosDeSegunda).filter((i) => i.postId && postIds.includes(i.postId));
    },
    async arquivarCards(ids) {
      c.arquivados.push(...ids);
      return ids.length;
    },
    async cardsVivos() {
      return opcoes.vivosDepois ?? 1;
    },
    async arquivarRun(runId) {
      c.runsArquivados.push(runId);
      return true;
    },
    async nomeDe() {
      return "Bruno Donaire";
    },
    async avisar(a) {
      c.avisos.push(a);
    },
  };
  return { d, c };
}

test("O CASO DE 21:05: a janela do Paulo manda o dia inteiro; só o carrossel sai, o completo fica, o run fica", async () => {
  const { d, c } = deps();
  const r = await cancelarPeca(cardPaulo.id, "bruno", [postIg.id, postX.id, postYoutube.id], d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(c.cancelados.sort(), [postIg.id, postX.id].sort());
  assert.equal(c.cancelados.includes(postYoutube.id), false, "o post do YouTube nunca é cancelado por esta porta");
  assert.deepEqual(c.arquivados.sort(), [cardPaulo.id, "cmuvv1pxw000504l39fb100hs", "cmuvv1pxg000404l3zxm4iqk1"].sort());
  assert.equal(c.arquivados.includes(cardVitorCompleto.id), false, "o card do vídeo completo fica no quadro");
  assert.deepEqual(c.runsArquivados, [], "run com card vivo (o do vídeo) nunca vai para o Arquivo");
  assert.deepEqual(r.quadro, { cardsArquivados: 3, postsCancelados: 2, runArquivado: false });
  assert.equal(c.avisos.length, 1);
  assert.match(c.avisos[0].texto, /cancelada por Bruno Donaire\. 2 posts saíram da fila\./);
  assert.equal(c.avisos[0].texto.includes("—"), false);
});

test("a mesma lista vinda do quadro (só a peça) dá o mesmo resultado", async () => {
  const { d, c } = deps();
  const r = await cancelarPeca(cardPaulo.id, "bruno", [postIg.id, postX.id], d);
  assert.equal(r.ok, true);
  assert.deepEqual(c.cancelados.sort(), [postIg.id, postX.id].sort());
  assert.equal(c.arquivados.includes(cardVitorCompleto.id), false);
});

test("cancelar pelo card do completo: só o YouTube sai, o carrossel fica, e o card de vídeo não é arquivado", async () => {
  const { d, c } = deps({ card: cardVitorCompleto });
  const r = await cancelarPeca(cardVitorCompleto.id, "bruno", [postIg.id, postX.id, postYoutube.id], d);
  assert.equal(r.ok, true);
  assert.deepEqual(c.cancelados, [postYoutube.id]);
  assert.deepEqual(c.arquivados, []);
  assert.deepEqual(c.runsArquivados, []);
});

test("o run só vai para o Arquivo quando não sobra card vivo nenhum", async () => {
  const { d, c } = deps({ vivosDepois: 0 });
  const r = await cancelarPeca(cardPaulo.id, "bruno", [postIg.id, postX.id], d);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.quadro.runArquivado, true);
  assert.deepEqual(c.runsArquivados, [RUN]);
});

test("peça inteira no ar: 409 e nada muda", async () => {
  const { d, c } = deps({ posts: [{ ...postIg, status: "published" }, { ...postX, status: "scheduled" }, postYoutube] });
  const r = await cancelarPeca(cardPaulo.id, "bruno", [postIg.id, postX.id, postYoutube.id], d);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 409);
  assert.deepEqual(c.cancelados, []);
  assert.deepEqual(c.arquivados, []);
});

test("uma rede no ar e outra não: a que não saiu é cancelada, o card do Paulo sai, e o sino diz o que ficou", async () => {
  const { d, c } = deps({ posts: [{ ...postIg, status: "published" }, postX, postYoutube] });
  const r = await cancelarPeca(cardPaulo.id, "bruno", [postIg.id, postX.id, postYoutube.id], d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(c.cancelados, [postX.id]);
  assert.equal(r.ficou, "1 post já estava no ar ou na fila e ficou.");
  assert.equal(c.arquivados.includes(cardVitorCompleto.id), false);
});

test("card já arquivado: 409; card de outro projeto: 404", async () => {
  const ja = deps({ card: { ...cardPaulo, status: "archived" } });
  const r1 = await cancelarPeca(cardPaulo.id, "bruno", [], ja.d);
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.status, 409);
  const fora = deps({ pode: false });
  const r2 = await cancelarPeca(cardPaulo.id, "intruso", [postIg.id], fora.d);
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.status, 404);
  assert.deepEqual(fora.c.cancelados, []);
});
