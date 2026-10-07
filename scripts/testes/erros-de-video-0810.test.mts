// OS ERROS DO VÍDEO (08/10/2026): o dia da semana escrita a partir do vídeo
// que ficava em "AVISO:" para sempre, a falha explícita do vídeo que só a aba
// aberta repetia, e o completo da jornada sem plano que chegava ao cliente
// como "vídeo pronto". As regras puras e a prova, no código, de que cada
// caminho pergunta a elas. Nada aqui toca banco, IA, worker ou e-mail.
// Rodar: npx tsx --test scripts/testes/erros-de-video-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  diaJaEscrito,
  diaPorTentarDeNovo,
  tentativasDoDia,
  textoDoAvisoDoDia,
  TETO_DE_TENTATIVAS_DO_DIA,
} from "@/lib/media/falha-do-dia-da-semana";
import {
  decidirFalhaExplicita,
  falhaQueRepete,
  servidorRepetindo,
  type FalhaParaDecidir,
} from "@/lib/media/falha-explicita-do-video";
import { MORTE, mensagemDeDesistencia } from "@/lib/media/video-state";
import { lerMontagem, DETALHE_DA_FALHA } from "@/lib/media/estado-da-montagem";
import { CODIGO_DA_ETAPA, NOME_DA_ETAPA_NO_AVISO } from "@/lib/notificacoes/tipos";

const ler = (p: string) => readFileSync(p, "utf8");
const TRAVESSAO = new RegExp(String.fromCharCode(0x2014));
const ESPERA = /^\S+ está (escrevendo|criando|montando)/;

// ─── o dia da semana do vídeo que falhou ───

test("as tentativas do dia: card sem falha é zero, aviso antigo (só falha) conta uma", () => {
  assert.equal(tentativasDoDia(null), 0);
  assert.equal(tentativasDoDia({ derivado: true }), 0);
  assert.equal(tentativasDoDia({ falha: "O modelo gastou o limite de 4000 tokens pensando" }), 1);
  assert.equal(tentativasDoDia({ falha: "x", tentativasDoDia: 2 }), 2);
  assert.equal(tentativasDoDia({ falha: "x", tentativasDoDia: "lixo" }), 1);
});

test("o dia com AVISO é tentado de novo até o teto, e só então conta como escrito", () => {
  const aviso = (n: number) => ({ postId: null, content: "AVISO: não consegui montar post de texto de segunda desta vez.", metadata: { falha: "x", tentativasDoDia: n } });
  assert.equal(diaPorTentarDeNovo(aviso(1).metadata), true);
  assert.equal(diaPorTentarDeNovo(aviso(TETO_DE_TENTATIVAS_DO_DIA - 1).metadata), true);
  assert.equal(diaPorTentarDeNovo(aviso(TETO_DE_TENTATIVAS_DO_DIA).metadata), false);
  assert.equal(diaJaEscrito([aviso(1)], ESPERA), false, "com tentativa sobrando o dia é escrito de novo");
  assert.equal(diaJaEscrito([aviso(TETO_DE_TENTATIVAS_DO_DIA)], ESPERA), true, "no teto o aviso fica");
  // O caso do Igor: o aviso de antes desta regra (sem contador) volta a ser tentado.
  assert.equal(diaJaEscrito([{ postId: null, content: "AVISO: não consegui montar ...", metadata: { falha: "x" } }], ESPERA), false);
});

test("o resto da regra do dia escrito não mudou", () => {
  assert.equal(diaJaEscrito([{ postId: null, content: "Lucas está escrevendo o post de texto", metadata: { aguardando: true } }], ESPERA), false);
  assert.equal(diaJaEscrito([{ postId: "p1", content: null, metadata: null }], ESPERA), true);
  assert.equal(diaJaEscrito([{ postId: null, content: "Um post de verdade, sem post ligado.", metadata: null }], ESPERA), true);
  assert.equal(diaJaEscrito([], ESPERA), false);
});

test("o card do dia só promete o que acontece, e nunca mostra o erro técnico", () => {
  const antes = textoDoAvisoDoDia({ rotulo: "carrossel", dia: "Segunda", tentativas: 1, codigo: "VID-SEM" });
  assert.match(antes, /^AVISO: /, "a tela reconhece o card de falha pelo prefixo");
  assert.match(antes, /tenta de novo sozinha/);
  assert.match(antes, /tentativa 1 de 3/);
  assert.doesNotMatch(antes, /chat deste card/, "o chat não refaz dia sem post");
  const teto = textoDoAvisoDoDia({ rotulo: "carrossel", dia: "Segunda", tentativas: TETO_DE_TENTATIVAS_DO_DIA, codigo: "VID-SEM" });
  assert.match(teto, /Paramos de tentar sozinhos/);
  assert.match(teto, /VID-SEM/);
  assert.doesNotMatch(teto, /tenta de novo sozinha/);
  assert.doesNotMatch(antes + teto, TRAVESSAO);
});

test("a semana do vídeo tem código próprio no sino", () => {
  assert.equal(CODIGO_DA_ETAPA.semana, "VID-SEM");
  assert.ok(NOME_DA_ETAPA_NO_AVISO.semana.length > 5);
});

test("a esteira usa a regra nova, conta a tentativa e chama a equipe no teto", () => {
  const pecas = ler("lib/media/pecas-da-semana.ts");
  assert.match(pecas, /if \(diaJaEscrito\(derivadosDoDia, ESPERA\)\) return;/);
  assert.doesNotMatch(pecas, /A esteira tenta de novo sozinha; se persistir, peça pelo chat deste card/);
  assert.match(pecas, /extra: \{ falha: msg\.slice\(0, 300\), tentativasDoDia: tentativas, ultimaRetomadaEm: null \}/);
  assert.match(pecas, /if \(tentativas >= TETO_DE_TENTATIVAS_DO_DIA\) \{\s*await avisarDiaQueDesistiu\(/);
  // O card que vira peça na nova tentativa perde a marca de falha.
  assert.match(pecas, /if \(!dados\.extra\?\.falha\) \{/);
  // O quadro não recria a espera ao lado do aviso.
  assert.match(ler("lib/media/quadro-do-video.ts"), /if \(diaComFalha\(dia\)\) continue;/);
  // O cron tenta os dias de novo.
  const cron = ler("app/api/cron/fila/route.ts");
  assert.match(cron, /await retomarSemanasQueFalharam\(\)/);
  assert.match(ler("lib/media/retomar-semana-do-video.ts"), /\(opcoes\.despachar \?\? despacharPasso\)\(video, "semana"\)/);
});

// ─── a falha explícita do vídeo ───

const AGORA = new Date("2026-10-08T12:00:00.000Z");
const ha = (s: number) => new Date(AGORA.getTime() - s * 1000);
const base = (over: Partial<FalhaParaDecidir> = {}): FalhaParaDecidir => ({
  status: "failed",
  attempts: 1,
  error: 'worker respondeu 503: {"erro":"Worker reiniciando; tente de novo em instantes"}',
  updatedAt: ha(120),
  temTranscricao: true,
  temTrechos: true,
  temCortes: false,
  roteiroPendente: false,
  tratada: null,
  ...over,
});

test("a primeira falha ganha uma nova tentativa pelo servidor, depois do minuto da aba", () => {
  assert.deepEqual(decidirFalhaExplicita(base({ updatedAt: ha(30) }), AGORA), { acao: "nada", porque: "esperando a aba repetir primeiro" });
  const d = decidirFalhaExplicita(base(), AGORA);
  assert.equal(d.acao, "retomar");
  if (d.acao === "retomar") {
    assert.equal(d.passo, "cortar");
    assert.equal(d.marca, ha(120).toISOString());
  }
});

test("a mesma falha não é repetida duas vezes; uma falha nova (outra marca) é", () => {
  const marca = ha(120).toISOString();
  assert.equal(decidirFalhaExplicita(base({ tratada: { marca, acao: "retomada", em: ha(60).toISOString() } }), AGORA).acao, "nada");
  assert.equal(decidirFalhaExplicita(base({ tratada: { marca: ha(9000).toISOString(), acao: "retomada" } }), AGORA).acao, "retomar");
});

test("a segunda falha não repete: avisa a equipe", () => {
  const d = decidirFalhaExplicita(base({ attempts: 2 }), AGORA);
  assert.equal(d.acao, "avisar-equipe");
  assert.equal(decidirFalhaExplicita(base({ attempts: 3 }), AGORA).acao, "avisar-equipe");
  assert.equal(decidirFalhaExplicita(base({ attempts: 2, tratada: { marca: ha(120).toISOString(), acao: "avisada" } }), AGORA).acao, "nada");
});

test("erro que não melhora repetindo fica como está", () => {
  for (const erro of [
    "Saldo insuficiente: o trabalho custa 120 créditos e você tem 3.",
    "Você já usou 500 de 500 créditos que a sua equipe liberou para você este mês.",
    "Os créditos da equipe acabaram. Peça a Bruno para adicionar mais.",
    "Nenhum trecho aproveitável nesta gravação. A fala é toda de bastidor.",
    "O agente não devolveu nenhum trecho.",
    mensagemDeDesistencia("cutting"),
    MORTE.transcribing,
  ]) {
    assert.equal(falhaQueRepete(erro), false, erro);
    assert.equal(decidirFalhaExplicita(base({ error: erro }), AGORA).acao, "nada", erro);
  }
  assert.equal(falhaQueRepete("Nenhum corte foi produzido."), true);
  assert.equal(falhaQueRepete(null), true);
});

test("falha velha e vídeo que não está em falha não são tocados", () => {
  assert.equal(decidirFalhaExplicita(base({ updatedAt: ha(2 * 86400) }), AGORA).acao, "nada");
  assert.equal(decidirFalhaExplicita(base({ status: "ready" }), AGORA).acao, "nada");
});

test("cada etapa volta pelo passo certo do piloto", () => {
  const passo = (o: Partial<FalhaParaDecidir>) => {
    const d = decidirFalhaExplicita(base(o), AGORA);
    return d.acao === "retomar" ? d.passo : d.acao;
  };
  assert.equal(passo({ temTranscricao: false, temTrechos: false }), "transcrever");
  assert.equal(passo({ temTrechos: false }), "selecionar");
  assert.equal(passo({ roteiroPendente: true }), "roteiro");
  assert.equal(passo({}), "cortar");
  assert.equal(passo({ temCortes: true }), "preparar");
});

test("o sino não diz 'parou' enquanto o servidor repete, e diz quando ninguém repete", () => {
  const v = { status: "failed", updatedAt: ha(150), attempts: 1, error: "worker respondeu 503", tratada: null };
  assert.equal(servidorRepetindo(v, AGORA), true, "ainda não tratada, mas vai ser");
  assert.equal(servidorRepetindo({ ...v, updatedAt: ha(15 * 60) }, AGORA), false, "ninguém despachou: o cliente precisa saber");
  const marca = v.updatedAt.toISOString();
  assert.equal(servidorRepetindo({ ...v, tratada: { marca, acao: "retomada", em: ha(60).toISOString() } }, AGORA), true);
  assert.equal(servidorRepetindo({ ...v, tratada: { marca, acao: "retomada", em: ha(10 * 60).toISOString() } }, AGORA), false);
  assert.equal(servidorRepetindo({ ...v, attempts: 2 }, AGORA), false);
  assert.equal(servidorRepetindo({ ...v, error: "Saldo insuficiente: x" }, AGORA), false);
});

test("o vigia das falhas toma a falha sem mexer no updatedAt, e o cron o chama antes do observador", () => {
  const vigia = ler("lib/media/vigia-das-etapas.ts");
  const corpo = vigia.slice(vigia.indexOf("export async function vigiarFalhas("), vigia.indexOf("/**\n * Uma passada do vigia."));
  assert.match(corpo, /decidirFalhaExplicita\(/);
  assert.match(corpo, /AND "updatedAt" = \$\{decisao\.marca\}::timestamp/);
  assert.doesNotMatch(corpo, /"updatedAt" = now\(\)/);
  assert.match(corpo, /noWorker === "vivo"/);
  const cron = ler("app/api/cron/fila/route.ts");
  assert.ok(cron.indexOf("await vigiarFalhas()") > 0 && cron.indexOf("await vigiarFalhas()") < cron.indexOf("await observarAvisos()"));
  assert.match(ler("lib/notificacoes/observador.ts"), /!repetindo\)/);
});

// ─── o completo da jornada sem plano ───

test("a falha sem nova tentativa diz o que houve e esconde o botão", () => {
  const detalhe = "O plano de efeitos deste vídeo não ficou pronto antes da aprovação.";
  const sem = lerMontagem({ estado: "sem-montagem", desde: AGORA.toISOString(), falhaTecnica: true, semNovaTentativa: true, detalheDoCliente: detalhe })!;
  assert.equal(sem.podeTentarDeNovo, false);
  assert.equal(sem.detalhe, detalhe);
  const comum = lerMontagem({ estado: "sem-montagem", desde: AGORA.toISOString(), falhaTecnica: true })!;
  assert.equal(comum.podeTentarDeNovo, true);
  assert.equal(comum.detalhe, DETALHE_DA_FALHA);
});

test("o completo sem o plano da jornada é falha técnica, e o e-mail da equipe sai uma vez", () => {
  const m = ler("lib/media/montagem-do-completo.ts");
  const ramo = m.slice(m.indexOf("if (!naJornada) {"), m.indexOf('estado: "dirigindo"', m.indexOf("if (!naJornada) {")));
  assert.match(ramo, /falhaTecnica: true/);
  assert.match(ramo, /semNovaTentativa: true/);
  assert.match(ramo, /detalheDoCliente:/);
  // Uma chamada só ao aviso dos admins: a de dentro de trocarEstado.
  assert.equal((m.match(/await avisarAdminsDaMontagem\(/g) ?? []).length, 1);
  // Pedir de novo uma falha sem nova tentativa não roda de novo.
  assert.match(m, /if \(m\.estado === "sem-montagem" && m\.semNovaTentativa\) \{/);
  // O sino usa a frase própria em vez de prometer o botão.
  assert.match(ler("lib/notificacoes/observador.ts"), /detalhe: v\.detalhe_montagem \?\?/);
});
