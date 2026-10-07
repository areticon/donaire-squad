// OS ERROS DA CAMPANHA (08/10/2026), a partir da campanha do Igor de 07/10:
// cinco dias falhados, zero peças, ninguém avisado, 15 cards de pesquisa
// iguais no quadro. Aqui: o código e a frase da falha, o aviso à equipe uma vez
// por fato, o card do dia reaproveitado na nova tentativa, a revisão que caiu
// sem derrubar o dia, e a prova no código de que cada caminho usa a regra.
// Nada aqui toca banco, IA ou e-mail de verdade.
// Rodar: npx tsx --test scripts/testes/erros-de-campanha-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { descreverFalhaDaCampanha, diasQueFalharamDe, textoDaFalhaParaAEquipe, type FatosDaCampanha } from "@/lib/pipeline/falha-da-campanha";
import { CODIGO_DA_CAMPANHA } from "@/lib/notificacoes/tipos";
import { cardParaReaproveitar, diaJaEntregue, JANELA_DO_MESMO_DIA_MS } from "@/lib/pipeline/card-do-dia";
import { AVISO_DE_NAO_REVISADO, PARECER_SEM_REVISAO, naoRevisado } from "@/lib/squad/sem-revisao";

const { avisarAdmins } = await import("@/lib/notificacoes/aviso-aos-admins");
type DepositoDosAdmins = import("@/lib/notificacoes/aviso-aos-admins").DepositoDosAdmins;
type Email = import("@/lib/email").Email;

const ler = (p: string) => readFileSync(p, "utf8");
/** O travessão, montado pelo código do caractere para o arquivo não conter nenhum. */
const TRAVESSAO = new RegExp(String.fromCharCode(0x2014));

const DIA_DO_IGOR = { tipo: "campanha-dia", attempts: 3, error: "Segunda-feira terminou sem nenhuma peça: nenhum redator entregou." };

// ─── o código e a frase ───

test("a campanha do Igor (zero peças, cinco dias falhados) vira CAM-SEM, sem o erro técnico na frase do cliente", () => {
  const fatos: FatosDaCampanha = {
    status: "failed",
    totalPosts: 0,
    diasQueFalharam: 5,
    trabalhosQueFalharam: [1, 2, 3, 4, 5].map((dia) => ({ ...DIA_DO_IGOR, dia })),
    ultimaMensagemDeErro: "A campanha não gerou nenhuma peça: 5 dia(s) falharam. Nada foi cobrado. Veja os avisos acima e peça de novo.",
  };
  const f = descreverFalhaDaCampanha(fatos)!;
  assert.equal(f.codigo, CODIGO_DA_CAMPANHA.semPeca);
  assert.equal(f.parcial, false);
  assert.match(f.texto, /Nada foi cobrado/);
  assert.match(f.texto, /equipe já foi avisada/);
  assert.doesNotMatch(f.texto, /redator|LinkedIn|OpenAI|Anthropic/);
  assert.doesNotMatch(f.titulo + f.texto, TRAVESSAO);
});

test("sem squad, sem rede ou sem dia (nenhum trabalho falhado) é CAM-CFG, com o motivo do log", () => {
  const f = descreverFalhaDaCampanha({
    status: "failed",
    totalPosts: 0,
    diasQueFalharam: 0,
    trabalhosQueFalharam: [],
    ultimaMensagemDeErro: "Nenhuma rede conectada para escrever (pedidas: Instagram). Conecte uma rede em Configurações do projeto e gere de novo.",
  })!;
  assert.equal(f.codigo, "CAM-CFG");
  assert.match(f.texto, /Nenhuma rede conectada/);
  assert.match(f.texto, /Nada foi cobrado/);
});

test("todos os dias mortos por tempo é CAM-PRA", () => {
  const f = descreverFalhaDaCampanha({
    status: "failed",
    totalPosts: 0,
    diasQueFalharam: 2,
    trabalhosQueFalharam: [
      { tipo: "campanha-dia", dia: 1, attempts: 3, error: "O trabalho passou do prazo em todas as tentativas." },
      { tipo: "campanha-dia", dia: 2, attempts: 3, error: "O trabalho passou do prazo em todas as tentativas." },
    ],
    ultimaMensagemDeErro: null,
  })!;
  assert.equal(f.codigo, "CAM-PRA");
});

test("parte dos dias: CAM-PAR, com as peças que saíram e sem cobrança dos dias falhados", () => {
  const f = descreverFalhaDaCampanha({
    status: "completed",
    totalPosts: 4,
    diasQueFalharam: 1,
    trabalhosQueFalharam: [{ tipo: "campanha-dia", dia: 3, attempts: 3, error: "x" }],
    ultimaMensagemDeErro: null,
  })!;
  assert.equal(f.codigo, "CAM-PAR");
  assert.equal(f.parcial, true);
  assert.equal(f.titulo, "1 dia da campanha não saiu");
  assert.match(f.texto, /4 peças estão no quadro/);
  assert.match(f.texto, /não foi cobrado/);
});

test("o vídeo por IA que falhou não conta como dia falhado (a peça já diz que o vídeo não veio)", () => {
  const fatos: FatosDaCampanha = {
    status: "completed",
    totalPosts: 5,
    diasQueFalharam: 1,
    trabalhosQueFalharam: [{ tipo: "video-ia", attempts: 3, error: "Veo recusou" }],
    ultimaMensagemDeErro: null,
  };
  assert.equal(diasQueFalharamDe(fatos), 0);
  assert.equal(descreverFalhaDaCampanha(fatos), null);
});

test("campanha concluída sem falha não avisa nada", () => {
  assert.equal(descreverFalhaDaCampanha({ status: "completed", totalPosts: 7, diasQueFalharam: 0, trabalhosQueFalharam: [], ultimaMensagemDeErro: null }), null);
  assert.equal(descreverFalhaDaCampanha({ status: "running", totalPosts: 0, diasQueFalharam: 0, trabalhosQueFalharam: [], ultimaMensagemDeErro: null }), null);
});

test("os códigos de campanha são únicos e começam por CAM-", () => {
  const codigos = Object.values(CODIGO_DA_CAMPANHA);
  assert.equal(new Set(codigos).size, codigos.length);
  for (const c of codigos) assert.match(c, /^CAM-[A-Z]{3}$/);
});

test("o e-mail da equipe leva a execução, o erro bruto de cada dia e o que o cliente leu", () => {
  const fatos: FatosDaCampanha = { status: "failed", totalPosts: 0, diasQueFalharam: 1, trabalhosQueFalharam: [{ ...DIA_DO_IGOR, dia: 1 }], ultimaMensagemDeErro: null };
  const falha = descreverFalhaDaCampanha(fatos)!;
  const corpo = textoDaFalhaParaAEquipe({ falha, runId: "cmuy5w6fv", projeto: "Igor", projectId: "p1", cliente: "igor@x.com", tema: "Lance embutido na moto", fatos, ultimasLinhas: ["O dia Segunda não pôde ser gerado"], base: "https://demandou.com" });
  assert.match(corpo, /cmuy5w6fv/);
  assert.match(corpo, /dia \(segunda\), 3 tentativa\(s\): Segunda-feira terminou sem nenhuma peça/);
  assert.match(corpo, /igor@x\.com/);
  assert.match(corpo, /O cliente leu:/);
  assert.match(corpo, /https:\/\/demandou\.com\/projects\/p1\/live/);
});

// ─── o aviso à equipe, uma vez por fato ───

function depositoEmMemoria(admins: Array<{ id: string; email: string | null }>, correioFalha = false) {
  const sino = new Set<string>();
  const enviados: Email[] = [];
  const dep: DepositoDosAdmins = {
    admins: async () => admins,
    sino: async (a) => {
      const k = `${a.userId}:${a.chave}`;
      if (sino.has(k)) return false;
      sino.add(k);
      return true;
    },
    correio: async (e) => {
      if (correioFalha) throw new Error("Resend fora do ar");
      enviados.push(e);
      return true;
    },
  };
  return { dep, enviados, sino };
}

test("cada admin recebe sino e e-mail uma vez; o mesmo fato pelo segundo caminho não manda nada", async () => {
  const { dep, enviados } = depositoEmMemoria([{ id: "a1", email: "bruno@demandou.com" }, { id: "a2", email: null }]);
  const aviso = { chave: "campanha-falhou:r1", titulo: "t", texto: "x", assunto: "Campanha falhou", corpo: "detalhe" };
  assert.deepEqual(await avisarAdmins(aviso, dep), { avisados: 2, emails: 1 });
  assert.deepEqual(await avisarAdmins(aviso, dep), { avisados: 0, emails: 0 });
  assert.equal(enviados.length, 1);
  assert.equal(enviados[0].para, "bruno@demandou.com");
});

test("o e-mail que falha não derruba quem avisou", async () => {
  const { dep } = depositoEmMemoria([{ id: "a1", email: "bruno@demandou.com" }], true);
  assert.deepEqual(await avisarAdmins({ chave: "k", titulo: "t", texto: "x", assunto: "a", corpo: "c" }, dep), { avisados: 1, emails: 0 });
});

// ─── o card do dia na nova tentativa ───

const SEG = new Date("2026-10-05T12:00:00.000Z");
const minutos = (d: Date, m: number) => new Date(d.getTime() + m * 60_000);

test("a nova tentativa reaproveita o card do mesmo dia, mesmo com a data empurrada para agora + 10 min", () => {
  const candidatos = [
    { id: "c1", scheduledDate: SEG, metadata: null },
    { id: "c2", scheduledDate: minutos(SEG, 15), metadata: null },
  ];
  assert.equal(cardParaReaproveitar(candidatos, { scheduledDate: minutos(SEG, 30) })?.id, "c1");
});

test("o mesmo dia da semana na semana seguinte (campanha quinzenal) é outro card", () => {
  assert.equal(cardParaReaproveitar([{ id: "c1", scheduledDate: SEG, metadata: null }], { scheduledDate: new Date(SEG.getTime() + 7 * 86_400_000) }), null);
  assert.ok(JANELA_DO_MESMO_DIA_MS < 7 * 86_400_000 && JANELA_DO_MESMO_DIA_MS > 86_400_000);
});

test("a adaptação de cada rede é um card: Instagram não reaproveita o do Facebook", () => {
  const candidatos = [{ id: "ig", scheduledDate: SEG, metadata: { rede: "instagram" } }];
  assert.equal(cardParaReaproveitar(candidatos, { scheduledDate: SEG, metadata: { rede: "facebook" } }), null);
  assert.equal(cardParaReaproveitar(candidatos, { scheduledDate: SEG, metadata: { rede: "instagram", x: 1 } })?.id, "ig");
  // O card sem rede (o do Lucas) não é o da adaptação.
  assert.equal(cardParaReaproveitar(candidatos, { scheduledDate: SEG }), null);
});

test("card sem data reaproveita card sem data", () => {
  assert.equal(cardParaReaproveitar([{ id: "c1", scheduledDate: null, metadata: null }], { scheduledDate: null })?.id, "c1");
  assert.equal(cardParaReaproveitar([{ id: "c1", scheduledDate: null, metadata: null }], { scheduledDate: SEG }), null);
});

test("o dia que já virou post numa tentativa anterior não é refeito", () => {
  assert.equal(diaJaEntregue([{ scheduledAt: minutos(SEG, 10) }], SEG), true);
  assert.equal(diaJaEntregue([{ scheduledAt: new Date(SEG.getTime() + 7 * 86_400_000) }], SEG), false);
  assert.equal(diaJaEntregue([{ scheduledAt: null }], SEG), false);
  assert.equal(diaJaEntregue([], SEG), false);
});

// ─── a revisão que não rodou ───

test("o parecer sem revisão não carrega veredito nem reprovação, e a marca é lida", () => {
  assert.doesNotMatch(PARECER_SEM_REVISAO, /VEREDITO/i);
  assert.doesNotMatch(PARECER_SEM_REVISAO.toLowerCase(), /reprovado/);
  assert.match(AVISO_DE_NAO_REVISADO, /NÃO REVISADO/);
  assert.doesNotMatch(PARECER_SEM_REVISAO + AVISO_DE_NAO_REVISADO, TRAVESSAO);
  assert.equal(naoRevisado({ naoRevisado: true }), true);
  assert.equal(naoRevisado({ naoRevisado: "sim" }), false);
  assert.equal(naoRevisado(null), false);
});

// ─── a prova no código ───

const EXECUTAR = ler("lib/pipeline/executar.ts");

test("saveCard procura o card da tentativa anterior antes de criar", () => {
  const corpo = EXECUTAR.slice(EXECUTAR.indexOf("async function saveCard("), EXECUTAR.indexOf("/** Parse poll content"));
  const procura = corpo.indexOf("cardParaReaproveitar(");
  const cria = corpo.indexOf("prisma.campaignCard.create(");
  assert.ok(procura > 0 && cria > procura, "a procura vem antes do create");
  assert.match(corpo, /prisma\.campaignCard\.update\(/);
});

test("o dia confere se já tem post antes de refazer", () => {
  assert.match(EXECUTAR, /diaJaEntregue\(postsJaFeitos, scheduledDate\)/);
});

test("as duas revisões da Vera pelo Claude estão protegidas, e só o saldo sobe", () => {
  const inicio = EXECUTAR.indexOf("let revisaoIndisponivel: string | null = null;");
  const fim = EXECUTAR.indexOf("// ── Paulo — Publish Card");
  assert.ok(inicio > 0 && fim > inicio);
  const trecho = EXECUTAR.slice(inicio, fim);
  assert.equal((trecho.match(/if \(ehErroDeSaldo\(err\)\) throw err;/g) ?? []).length, 2);
  assert.match(trecho, /firstOutput = PARECER_SEM_REVISAO/);
  assert.match(trecho, /while \(!revisaoIndisponivel && /);
  assert.match(trecho, /AVISO_DE_NAO_REVISADO/);
  // O post leva a marca.
  assert.match(EXECUTAR, /\.\.\.\(revisaoIndisponivel \? \{ naoRevisado: true \} : \{\}\)/);
});

test("o fecho avisa a falha, e o observador olha as campanhas falhadas", () => {
  const fecho = EXECUTAR.slice(EXECUTAR.indexOf("export async function fecharCampanha("), EXECUTAR.indexOf("function instantePrevisto("));
  assert.match(fecho, /if \(semNada \|\| falhados\) \{\s*await avisarFalhaDaCampanha\(runId\)/);
  const obs = ler("lib/notificacoes/observador.ts");
  assert.match(obs, /status: \{ in: \["completed", "failed"\] \}/);
  assert.match(obs, /avisarFalhaDaCampanha\(run\.id\)/);
});

test("a última tentativa da fila não diz que vai repetir", () => {
  const passada = ler("lib/fila/passada.ts");
  assert.match(passada, /tentativa >= MAX_TENTATIVAS\s*\?\s*`Tentativa \$\{tentativa\} d\$\{etapa\} falhou e foi a última/);
});

test("a faixa do Gestor mostra o código da campanha", () => {
  assert.match(ler("components/content/content-manager.tsx"), /lastFailedRun\.codigo \? `\$\{lastFailedRun\.codigo\} \(/);
  assert.match(ler("app/(app)/projects/[id]/live/page.tsx"), /codigo: falhaDaUltima\.codigo/);
});
