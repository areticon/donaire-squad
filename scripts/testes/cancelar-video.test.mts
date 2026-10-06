// Testes do "Cancelar este vídeo" (05/10/2026): a regra pura e a execução com
// o banco trocado por mocks. Nada aqui toca banco, IA ou mídia.
// Rodar: npx tsx --test scripts/testes/cancelar-video.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STATUS_CANCELADO,
  TEXTO_DA_CONFIRMACAO,
  TEXTO_DA_CONFIRMACAO_PRONTO,
  textoDaConfirmacao,
  videoPronto,
  acertoDaReservaNoCancelamento,
  avisoDoQueTerminaSozinho,
  creditosDaGravacaoCancelada,
  gemeoNaoComecou,
  idDoGemeoNaFaixa,
  midiasDoGemeoParaApagar,
  podeCancelarGemeo,
  podeCancelarGravacao,
  registroDoCancelamento,
} from "@/lib/media/cancelamento";
import { cancelarVideo, type DepsDoCancelamento, type GravacaoParaCancelar } from "@/lib/media/cancelar-video";
import type { VideoDoGemeo } from "@/lib/media/gemeo";
import type { Aviso } from "@/lib/notificacoes";

// ─── a regra pura ───

test("o texto da confirmação é o combinado", () => {
  assert.equal(TEXTO_DA_CONFIRMACAO, "Cancelar este vídeo? O que já foi gerado é descartado e os créditos ainda não gastos não são cobrados.");
});

test("o id da linha do gêmeo na faixa é reconhecido; o da gravação, não", () => {
  assert.equal(idDoGemeoNaFaixa("gemeo-gmuvhnmz00d8ef79f"), "gmuvhnmz00d8ef79f");
  assert.equal(idDoGemeoNaFaixa("cmuuxtket000406p29d1yboyz"), null);
  assert.equal(idDoGemeoNaFaixa("gemeo-"), null);
});

test("cancela o que espera o cliente (roteiro), o que anda e o pronto (06/10); não cancela o já cancelado", () => {
  assert.deepEqual(podeCancelarGravacao({ status: "roteiro", finishedAt: null, edicaoAndando: false }), { pode: true });
  assert.deepEqual(podeCancelarGravacao({ status: "cutting", finishedAt: null, edicaoAndando: false }), { pode: true });
  assert.deepEqual(podeCancelarGravacao({ status: "ready", finishedAt: null, edicaoAndando: false }), { pode: true });
  // Pronto, mas a montagem de efeitos ainda roda: ainda é "em andamento".
  assert.deepEqual(podeCancelarGravacao({ status: "ready", finishedAt: new Date(), edicaoAndando: true }), { pode: true });
  // O pronto (06/10, tarde): cancela, com a confirmação própria.
  assert.deepEqual(podeCancelarGravacao({ status: "ready", finishedAt: new Date(), edicaoAndando: false }), { pode: true });
  assert.equal(videoPronto({ status: "ready", finishedAt: new Date(), edicaoAndando: false }), true);
  assert.equal(videoPronto({ status: "ready", finishedAt: new Date(), edicaoAndando: true }), false);
  assert.equal(textoDaConfirmacao(true), TEXTO_DA_CONFIRMACAO_PRONTO);
  assert.equal(textoDaConfirmacao(false), TEXTO_DA_CONFIRMACAO);
  assert.match(TEXTO_DA_CONFIRMACAO_PRONTO, /publicado ou está agendado continua/);
  assert.ok(!TEXTO_DA_CONFIRMACAO_PRONTO.includes(String.fromCharCode(0x2014)), "sem travessão");
  const ja = podeCancelarGravacao({ status: STATUS_CANCELADO, finishedAt: null, edicaoAndando: false });
  assert.equal(ja.pode, false);
});

test("avisa o que termina sozinho fora daqui: corte no worker, montagem no cron; no roteiro, nada", () => {
  assert.match(avisoDoQueTerminaSozinho({ status: "cutting", edicaoAndando: false })!, /corte .* termina sozinho/);
  assert.match(avisoDoQueTerminaSozinho({ status: "transcribing", edicaoAndando: false })!, /transcrição/);
  assert.match(avisoDoQueTerminaSozinho({ status: "ready", edicaoAndando: true })!, /montagem/);
  assert.equal(avisoDoQueTerminaSozinho({ status: "roteiro", edicaoAndando: false }), null);
});

test("créditos da gravação: sem estorno inventado; a primeira parte fica, a segunda não é cobrada", () => {
  assert.match(creditosDaGravacaoCancelada({ status: "roteiro", creditsCharged: 615 }), /primeira parte .* fica cobrada\. A segunda parte, da edição, não é cobrada/);
  assert.match(creditosDaGravacaoCancelada({ status: "cutting", creditsCharged: 3000 }), /fica como está/);
  assert.equal(creditosDaGravacaoCancelada({ status: "roteiro", creditsCharged: 0 }), "Nada foi cobrado por este vídeo.");
});

test("o registro diz quem e quando, sem travessão", () => {
  const r = registroDoCancelamento("Bruno", new Date("2026-10-05T13:00:00.000Z"));
  assert.match(r, /^Cancelado por Bruno em 05\/10\/2026,? 10:00\.$/);
  assert.equal(r.includes("—"), false);
  assert.match(registroDoCancelamento(null, new Date()), /^Cancelado pelo cliente em /);
});

const gemeoBase: VideoDoGemeo = {
  id: "g1",
  estado: "gerando",
  desde: "2026-10-05T10:00:00.000Z",
  criadoEm: "2026-10-05T10:00:00.000Z",
  userId: "u1",
  titulo: "Ser cristão não te obriga a ter negócio cristão",
  texto: "...",
  segundosEstimados: 60,
  creditosReservados: 2414,
  gerador: "omnihuman",
  fotoUrl: "https://x.blob.vercel-storage.com/gemeo/p1/foto.jpg",
  voiceId: "v1",
  pedacos: [
    { texto: "a", audioUrl: "https://x.blob.vercel-storage.com/gemeo/p1/fala-1.mp3", segundos: 20, requestId: "r1", videoUrl: "https://fal.media/p1.mp4" },
    { texto: "b", audioUrl: "https://x.blob.vercel-storage.com/gemeo/p1/fala-2.mp3", segundos: 15, requestId: "r2" },
    { texto: "c" },
  ],
};

test("gêmeo: só o que ainda grava se cancela; nada começou só na fila sem fala nem pedido", () => {
  assert.deepEqual(podeCancelarGemeo({ estado: "gerando" }), { pode: true });
  assert.equal(podeCancelarGemeo({ estado: "na-esteira" }).pode, false);
  assert.equal(podeCancelarGemeo({ estado: "cancelada" }).pode, false);
  assert.equal(podeCancelarGemeo({ estado: "falhou" }).pode, false);
  assert.equal(gemeoNaoComecou({ estado: "na-fila", pedacos: [{ texto: "a" }] }), true);
  assert.equal(gemeoNaoComecou({ estado: "na-fila", pedacos: [{ texto: "a", audioUrl: "x" }] }), false);
  assert.equal(gemeoNaoComecou({ estado: "falando", pedacos: [{ texto: "a" }] }), false);
});

test("gêmeo: o acerto da reserva segue a regra do passo (cobra o falado, devolve o resto), uma vez só", () => {
  const porSegundo = (s: number) => s * 34;
  const a = acertoDaReservaNoCancelamento(gemeoBase, porSegundo);
  assert.equal(a.segundosFalados, 35);
  assert.equal(a.devido, 35 * 34);
  assert.equal(a.volta, 2414 - 35 * 34);
  // Nunca mais que a reserva.
  const caro = acertoDaReservaNoCancelamento({ ...gemeoBase, creditosReservados: 100 }, porSegundo);
  assert.equal(caro.devido, 100);
  assert.equal(caro.volta, 0);
  // Acerto já feito pelo passo: nada mais volta.
  const feito = acertoDaReservaNoCancelamento({ ...gemeoBase, creditosCobrados: 1802 }, porSegundo);
  assert.equal(feito.volta, 0);
  assert.equal(feito.devido, 1802);
});

test("gêmeo: o que já foi gerado vai para o lixo; o vídeo juntado que virou gravação fica", () => {
  const urls = midiasDoGemeoParaApagar({ ...gemeoBase, finalUrl: "https://x.blob.vercel-storage.com/gemeo/p1/final.mp4" });
  assert.deepEqual(urls, [
    "https://x.blob.vercel-storage.com/gemeo/p1/fala-1.mp3",
    "https://fal.media/p1.mp4",
    "https://x.blob.vercel-storage.com/gemeo/p1/fala-2.mp3",
    "https://x.blob.vercel-storage.com/gemeo/p1/final.mp4",
  ]);
  const naEsteira = midiasDoGemeoParaApagar({ ...gemeoBase, finalUrl: "https://x/final.mp4", videoJobId: "c1" });
  assert.equal(naEsteira.includes("https://x/final.mp4"), false);
});

// ─── a execução, com o banco trocado por mocks ───

type Chamadas = { marcadas: string[]; quadros: string[]; avisos: Aviso[]; estornos: Array<{ quantia: number; sufixo: string }>; apagadas: string[]; gemeosCancelados: string[] };

function deps(opcoes: { gravacao?: GravacaoParaCancelar | null; gemeo?: VideoDoGemeo | null; marcar?: boolean; antesDeComecar?: boolean; estornoDevolve?: number } = {}) {
  const c: Chamadas = { marcadas: [], quadros: [], avisos: [], estornos: [], apagadas: [], gemeosCancelados: [] };
  const d: DepsDoCancelamento = {
    async lerGravacao() {
      return opcoes.gravacao ?? null;
    },
    async marcarGravacaoCancelada(id, statusLido, registro) {
      c.marcadas.push(`${id}:${statusLido}:${registro}`);
      return opcoes.marcar ?? true;
    },
    async fecharQuadro(videoId) {
      c.quadros.push(videoId);
      return { cardsArquivados: 3, postsCancelados: 2, runsArquivados: 1 };
    },
    async nomeDe() {
      return "Bruno";
    },
    async avisar(a) {
      c.avisos.push(a);
    },
    async lerGemeo() {
      return opcoes.gemeo ? { projectId: "p1", video: opcoes.gemeo } : null;
    },
    async cancelarGemeoAntesDeComecar(_p, id) {
      c.gemeosCancelados.push(`antes:${id}`);
      return opcoes.antesDeComecar ?? true;
    },
    async marcarGemeoCancelado(_p, id, motivo) {
      c.gemeosCancelados.push(`andando:${id}`);
      return opcoes.gemeo && opcoes.gemeo.estado !== "cancelada" ? { ...opcoes.gemeo, estado: "cancelada", motivo } : null;
    },
    async estornarGemeo(_p, _v, quantia, sufixo) {
      c.estornos.push({ quantia, sufixo });
      return opcoes.estornoDevolve ?? quantia;
    },
    async apagar(urls) {
      c.apagadas.push(...urls);
    },
  };
  return { d, c };
}

const gravacaoNoRoteiro: GravacaoParaCancelar = {
  id: "cmuuxtket000406p29d1yboyz",
  projectId: "p1",
  userId: "u1",
  status: "roteiro",
  originalName: "Gêmeo digital - Ser cristão não te obriga a ter 'negócio cristão'.mp4",
  createdAt: new Date("2026-10-05T10:37:52.277Z"),
  rodadaEm: null,
  finishedAt: null,
  creditsCharged: 615,
  edicaoAndando: false,
};

test("gravação parada no roteiro: marca cancelado, fecha o quadro, avisa no sino, sem estorno", async () => {
  const { d, c } = deps({ gravacao: gravacaoNoRoteiro });
  const r = await cancelarVideo(gravacaoNoRoteiro.id, "u1", d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.tipo, "gravacao");
  assert.equal(r.aviso, null);
  assert.equal(r.creditosDevolvidos, 0);
  assert.deepEqual(r.quadro, { cardsArquivados: 3, postsCancelados: 2, runsArquivados: 1 });
  assert.equal(c.marcadas.length, 1);
  assert.match(c.marcadas[0], /^cmuuxtket000406p29d1yboyz:roteiro:Cancelado por Bruno em /);
  assert.deepEqual(c.quadros, [gravacaoNoRoteiro.id]);
  assert.equal(c.avisos.length, 1);
  assert.equal(c.avisos[0].tipo, "cancelado");
  assert.equal(c.avisos[0].chave, `cancelado:${gravacaoNoRoteiro.id}:2026-10-05T10:37:52.277Z`);
  assert.match(c.avisos[0].texto, /cancelado por Bruno\. 3 cards saíram do quadro\./);
  assert.equal(c.avisos[0].email, undefined);
  assert.equal(c.estornos.length, 0);
});

test("gravação cortando no worker: cancela e avisa que o corte termina sozinho e é descartado", async () => {
  const { d } = deps({ gravacao: { ...gravacaoNoRoteiro, status: "cutting" } });
  const r = await cancelarVideo(gravacaoNoRoteiro.id, "u1", d);
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.aviso ?? "", /termina sozinho e é descartado/);
});

test("gravação pronta (06/10): cancela, fecha o quadro e diz que nada mais é cobrado", async () => {
  const { d, c } = deps({ gravacao: { ...gravacaoNoRoteiro, status: "ready", finishedAt: new Date() } });
  const r = await cancelarVideo(gravacaoNoRoteiro.id, "u1", d);
  assert.equal(r.ok, true);
  assert.equal(c.marcadas.length, 1);
  assert.equal(c.quadros.length, 1);
  if (r.ok) {
    assert.equal(r.aviso, null);
    assert.equal(r.creditosDevolvidos, 0);
    if (gravacaoNoRoteiro.creditsCharged > 0) assert.match(r.creditos, /nada mais é cobrado/);
  }
});

test("gravação de outro projeto (ou inexistente): 404", async () => {
  const { d } = deps({ gravacao: null });
  const r = await cancelarVideo("x", "u2", d);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.status, 404);
});

test("duas abas: a segunda vê o status trocado e leva 409 sem fechar o quadro de novo", async () => {
  const { d, c } = deps({ gravacao: gravacaoNoRoteiro, marcar: false });
  const r = await cancelarVideo(gravacaoNoRoteiro.id, "u1", d);
  assert.equal(r.ok, false);
  assert.equal(c.quadros.length, 0);
  assert.equal(c.avisos.length, 0);
});

test("gêmeo na fila sem nada começado: a porta que já existia, com tudo de volta", async () => {
  const naFila: VideoDoGemeo = { ...gemeoBase, estado: "na-fila", pedacos: [{ texto: "a" }, { texto: "b" }] };
  const { d, c } = deps({ gemeo: naFila });
  const r = await cancelarVideo("gemeo-g1", "u1", d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.tipo, "gemeo");
  assert.equal(r.creditosDevolvidos, 2414);
  assert.deepEqual(c.gemeosCancelados, ["antes:g1"]);
  assert.equal(c.estornos.length, 0);
  assert.equal(c.avisos[0].chave, "cancelado:gemeo:g1");
});

test("gêmeo gerando: marca cancelada, acerta a reserva pelo falado, apaga o gerado e avisa que o pedaço termina sozinho", async () => {
  const { d, c } = deps({ gemeo: gemeoBase });
  const r = await cancelarVideo("gemeo-g1", "u1", d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.deepEqual(c.gemeosCancelados, ["andando:g1"]);
  assert.deepEqual(c.estornos, [{ quantia: 2414 - 35 * 34, sufixo: "acerto" }]);
  assert.equal(r.creditosDevolvidos, 2414 - 35 * 34);
  assert.match(r.aviso ?? "", /gerador já estava fazendo termina sozinho/);
  assert.equal(c.apagadas.length, 3);
  assert.match(r.creditos, /1190 créditos.*1224 da reserva voltaram/);
});

test("gêmeo com o acerto já feito pelo passo: cancela sem devolver de novo", async () => {
  const { d, c } = deps({ gemeo: { ...gemeoBase, creditosCobrados: 1802 } });
  const r = await cancelarVideo("gemeo-g1", "u1", d);
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(c.estornos.length, 0);
  assert.equal(r.creditosDevolvidos, 0);
  assert.match(r.creditos, /fica cobrado; não há mais nada a cobrar/);
});

test("gêmeo que já virou gravação: 409 apontando a faixa", async () => {
  const { d } = deps({ gemeo: { ...gemeoBase, estado: "na-esteira", videoJobId: "c1" } });
  const r = await cancelarVideo("gemeo-g1", "u1", d);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /já entrou na edição/);
});
