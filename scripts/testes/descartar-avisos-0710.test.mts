// O DESCARTE DOS AVISOS (07/10/2026). Pedido do Bruno, com o print da faixa da
// montagem que não saía da tela: "toda notificação precisa ter a opção de
// descartar". Aqui: a chave de cada ocorrência (e a ocorrência nova que volta),
// o descarte por pessoa, o sino que nunca apaga a linha, a tabela que ainda
// não existe, a semente do cliente, a fila do provider e, no código, o controle
// de descarte em cada superfície do inventário. Nada aqui toca banco, rede,
// IA ou e-mail: o banco é um depósito em memória (descartes-em-memoria.ts).
// Rodar: npx tsx --test scripts/testes/descartar-avisos-0710.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  CHAVES_DO_SINO_COM_FAIXA,
  PREFIXOS_COM_FIM,
  PREFIXOS_DAS_TELAS,
  PREFIXOS_DA_SEMENTE,
  PREFIXOS_DO_SINO,
  PREFIXOS_SEM_FIM,
  chaveDaArteQueFalhou,
  chaveDoCorteNaoAplicado,
  chaveDoEstiloAguardando,
  chaveDoGemeoFaltaUmPasso,
  chaveDoPlanoPendente,
  ehChaveDasTelas,
  chaveDaCampanha,
  chaveDaMontagem,
  chaveDaMontagemSegura,
  chaveDaPublicacao,
  chaveDaSituacaoDoGemeo,
  chaveDasPropostasDoRoberto,
  chaveDoAlertaDoPlano,
  chaveDoDiaReprovado,
  chaveDoNaoRevisado,
  chaveDoPedidoDaCena,
  chaveDoPostQueFalhou,
  chaveDoVigia,
  chavesCandidatasDoVideo,
  ehChaveDeAviso,
  marca,
  marcaDaLista,
  type VideoParaChave,
} from "@/lib/avisos/chaves";
import {
  COTA_DOS_SEM_FIM,
  descartadasEntre,
  descartar,
  descartarLidas,
  descartarNotificacoes,
  desfazerDescarte,
  faltaATabela,
  restaurarNotificacoes,
  sementeDoCliente,
  TETO_DAS_LIDAS,
  TETO_POR_PESSOA,
} from "@/lib/avisos/descartes";
import { esperaDaIdentidade } from "@/lib/modelos-de-arte/espera-da-identidade";
import { criarFilaDosDescartes, estaDescartada, unirSemente } from "@/lib/avisos/fila-dos-descartes";
import { descartesEmMemoria } from "./descartes-em-memoria";

// Sem o CR do checkout do Windows: os testes procuram trechos com LF.
const ler = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** O travessão, montado pelo código do caractere para o arquivo não conter nenhum. */
const TRAVESSAO = new RegExp(String.fromCharCode(0x2014));
const silenciar = async <T,>(fn: () => Promise<T>): Promise<T> => {
  const { warn, error } = console;
  console.warn = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

// ─── a chave da montagem: a mesma do sino, byte a byte ───

test("a chave da montagem é byte a byte a que o observador grava no sino, no completo e no corte", () => {
  const video = "cmvideo123";
  const desde = "2026-10-07T14:03:11.512Z";
  // O que o sino grava: avisos.ts monta `falha:${etapa}:${video}:${marca}`, e o
  // observador passa a marca do completo (o texto cru) e a do corte.
  assert.equal(chaveDaMontagem(video, "completo", desde), `falha:efeitos:${video}:${desde}`);
  assert.equal(chaveDaMontagem(video, 2, desde), `falha:efeitos:${video}:corte-2:${desde}`);
  const avisos = ler("lib/notificacoes/avisos.ts");
  assert.match(avisos, /chave: `falha:\$\{p\.etapa\}:\$\{v\.id\}:\$\{p\.marca\}`/);
  const observador = ler("lib/notificacoes/observador.ts");
  assert.match(observador, /etapa: "efeitos",\s*marca: v\.mdesde!/);
  assert.match(observador, /marca: `corte-\$\{i\}:\$\{m\.desde\}`/);
  assert.match(observador, /"completoMontagem" ->> 'desde' AS mdesde/);
  // A página do Gestor lê o mesmo texto cru, sem passar por Date.
  const pagina = ler("app/(app)/projects/[id]/live/page.tsx");
  assert.match(pagina, /"completoMontagem" ->> 'desde' AS desde/);
  assert.match(pagina, /desde: desdeDoCompleto\.get\(v\.id\) \?\? null/);
  assert.match(pagina, /const desde = t\.montagem\?\.desde \?\? null;/);
});

test("a montagem que falha de novo (outro desde) volta: chave nova; sem desde, null", () => {
  const a = chaveDaMontagem("v1", "completo", "2026-10-07T14:00:00.000Z");
  const b = chaveDaMontagem("v1", "completo", "2026-10-07T15:30:00.000Z");
  assert.ok(a && b);
  assert.notEqual(a, b);
  assert.equal(chaveDaMontagem("v1", "completo", null), null);
  assert.equal(chaveDaMontagem("v1", 0, undefined), null);
  assert.equal(chaveDaMontagem("v1", 0, ""), null);
  assert.equal(chaveDaMontagemSegura("v1", 0, null), null);
  assert.notEqual(chaveDaMontagemSegura("v1", 0, "x"), chaveDaMontagem("v1", 0, "x"), "a versão segura não se confunde com a falha");
});

test("a campanha: a falha usa a chave do sino; a cancelada tem a dela", () => {
  assert.equal(chaveDaCampanha("run1", "failed"), "falha:campanha:run1");
  assert.equal(chaveDaCampanha("run1", "cancelled"), "campanha-cancelada:run1");
  assert.equal(chaveDaCampanha("run1", "completed"), null);
  assert.match(ler("lib/notificacoes/avisos.ts"), /chave: `falha:campanha:\$\{runId\}`/);
});

// ─── o cartão do vídeo: as cinco chaves possíveis ───

const video = (x: Partial<VideoParaChave> = {}): VideoParaChave => ({
  id: "vid1",
  criadoEm: "2026-10-07T10:00:00.000Z",
  inicioDaRodada: "2026-10-07T10:00:00.000Z",
  terminadoEm: null,
  attempts: 1,
  temTranscricao: false,
  temTrechos: false,
  temCortes: false,
  roteiroPendente: false,
  ...x,
});

test("o vídeo que parou: a chave muda quando muda a etapa com o mesmo attempts", () => {
  // A transcrição falha com attempts 1; o servidor repete, passa; a seleção falha com attempts 1.
  const naTranscricao = chavesCandidatasDoVideo(video({ attempts: 1 })).falhou;
  const naSelecao = chavesCandidatasDoVideo(video({ attempts: 1, temTranscricao: true })).falhou;
  assert.notEqual(naTranscricao, naSelecao);
  assert.match(naTranscricao, /:transcribe:1$/);
  assert.match(naSelecao, /:select:1$/);
});

test("o vídeo que parou: a chave muda quando o attempts sobe na mesma etapa", () => {
  const um = chavesCandidatasDoVideo(video({ attempts: 1, temTranscricao: true })).falhou;
  const dois = chavesCandidatasDoVideo(video({ attempts: 2, temTranscricao: true })).falhou;
  assert.notEqual(um, dois);
});

test("o pronto é estável entre duas consultas de 4 s, e cada tipo do cartão tem chave própria", () => {
  const v = video({ status: "ready", temTranscricao: true, temTrechos: true, temCortes: true, terminadoEm: "2026-10-07T10:40:00.000Z" } as Partial<VideoParaChave>);
  const primeira = chavesCandidatasDoVideo(v);
  const segunda = chavesCandidatasDoVideo({ ...v });
  assert.deepEqual(primeira, segunda);
  assert.equal(new Set(Object.values(primeira)).size, 5, "falhou, completo-falhou, roteiro, peças e pronto: cinco chaves");
  assert.ok(primeira.roteiro.startsWith("video:roteiro:") && primeira.pecas.startsWith("video:pecas:"));
  // Pedido de aprovação nunca divide a chave com o sino ("roteiro:", "pecas:").
  assert.ok(!primeira.roteiro.startsWith("roteiro:"));
  for (const c of Object.values(primeira)) assert.ok(ehChaveDeAviso(c), c);
});

test("o servidor e a tela montam as mesmas chaves do cartão (o mesmo construtor nas duas pontas)", () => {
  const status = ler("app/api/videos/status/route.ts");
  assert.match(status, /listaDasChavesDoVideo/);
  assert.match(status, /descartadasEntre\(userId,/);
  assert.match(status, /descartados: \[\.\.\.descartados\]/);
  const esteira = ler("components/video/esteira-do-video.tsx");
  assert.match(esteira, /chavesCandidatasDoVideo\(v\)/);
  assert.match(esteira, /registrarRef\.current\(descartados\)/);
  const pagina = ler("app/(app)/projects/[id]/live/page.tsx");
  assert.match(pagina, /listaDasChavesDoVideo\(v\)/);
  // O card da peça e a faixa usam o mesmo construtor da montagem.
  assert.match(ler("components/content/content-manager.tsx"), /chaveDaMontagem\(metaMo\.videoJobId, alvoMo, brutoMo\?\.desde\)/);
});

// ─── a normalização ───

test("texto livre, acento, espaço e listas longas viram chaves válidas, determinísticas e distintas", () => {
  const motivo = "A geração não terminou no tempo esperado, com espaço e acentuação";
  const k1 = chaveDaSituacaoDoGemeo("p1", "avatar", "falhou", motivo);
  const pedidoLongo = "Quero uma cena com o produto girando ".repeat(30);
  const k2 = chaveDoPedidoDaCena("v1", 3, pedidoLongo);
  const ids = Array.from({ length: 40 }, (_, i) => `cmpost${String(i).padStart(4, "0")}aaaaaaaaaaaaaaaa`);
  const k3 = chaveDoNaoRevisado("card1", ids);
  const k4 = chaveDasPropostasDoRoberto("p1", ids);
  const k5 = chaveDoDiaReprovado("card1", ids);
  const k6 = chaveDaPublicacao("post1", "PUB-TOK: o token expirou em 06/10, reconecte a rede");
  const k7 = chaveDaArteQueFalhou("post1", "2026-10-07T10:00:00.000Z");
  const k8 = chaveDoAlertaDoPlano("saldo-zerado", "cmtx123");
  const k9 = chaveDoVigia("v1", "cutting", "prazo");
  for (const k of [k1, k2, k3, k4, k5, k6, k7, k8, k9]) {
    assert.ok(k && ehChaveDeAviso(k), `chave inválida: ${k}`);
    assert.ok(k.length <= 300);
    assert.doesNotMatch(k, /\s/);
  }
  assert.equal(chaveDoPedidoDaCena("v1", 3, pedidoLongo), k2, "o corte é determinístico");
  assert.equal(chaveDoNaoRevisado("card1", [...ids].reverse()), k3, "a lista é ordenada antes da marca");
  assert.notEqual(chaveDoNaoRevisado("card1", ids.slice(0, 39)), k3, "duas listas diferentes, duas marcas");
  assert.notEqual(marcaDaLista(["a", "b"]), marcaDaLista(["a", "c"]));
  assert.match(marca("qualquer coisa"), /^[0-9a-f]{8}$/);
  assert.equal(chaveDoPedidoDaCena("v1", 0, null), null, "sem a marca, null: o X é só local");
});

test("a falha de publicação marca o erro (nunca o updatedAt): erro novo, chave nova", () => {
  const a = chaveDoPostQueFalhou("p1", { error: "PUB-TOK token expirou" });
  const b = chaveDoPostQueFalhou("p1", { error: "PUB-REDE a rede recusou" });
  const c = chaveDoPostQueFalhou("p1", { ponte: { codigo: "PUB-INT" } });
  assert.ok(a && b && c);
  assert.notEqual(a, b);
  assert.equal(chaveDoPostQueFalhou("p1", { error: "PUB-TOK token expirou", updatedAt: "outro" }), a);
});

test("ehChaveDeAviso aceita os prefixos do sino e das telas, e recusa o resto", () => {
  for (const p of [...PREFIXOS_DO_SINO, ...PREFIXOS_DAS_TELAS]) assert.ok(ehChaveDeAviso(`${p}:x`), p);
  assert.equal(ehChaveDeAviso(""), false);
  assert.equal(ehChaveDeAviso("dica:" + "x".repeat(300)), false);
  assert.equal(ehChaveDeAviso("desconhecido:x"), false);
  assert.equal(ehChaveDeAviso("dica:com espaço"), false);
  assert.equal(ehChaveDeAviso("dica:com\nquebra"), false);
  assert.equal(ehChaveDeAviso("dica:"), false);
  assert.equal(ehChaveDeAviso(":x"), false);
  assert.equal(ehChaveDeAviso(42), false);
  // A semente leva as das telas e só as duas do sino que têm faixa.
  assert.ok(PREFIXOS_DA_SEMENTE.includes("falha:efeitos:") && PREFIXOS_DA_SEMENTE.includes("falha:campanha:"));
  assert.ok(!PREFIXOS_DA_SEMENTE.includes("falha:") && !PREFIXOS_DA_SEMENTE.includes("roteiro:"));
});

test("varredura: toda chave passada ao sino em lib/ tem prefixo em PREFIXOS_DO_SINO", () => {
  const arquivos: string[] = [];
  const andar = (d: string) => {
    for (const nome of readdirSync(d)) {
      const p = join(d, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (p.endsWith(".ts")) arquivos.push(p);
    }
  };
  andar("lib");
  const sino = new Set<string>(PREFIXOS_DO_SINO);
  const achados: Array<{ arquivo: string; prefixo: string }> = [];
  for (const arquivo of arquivos) {
    const texto = ler(arquivo);
    // As chamadas a notificar({ ... }) e ao depósito do sino do aviso de saldo:
    // o objeto inteiro (chaves balanceadas) e cada template da linha `chave:`
    // (inclusive o ternário de "pecas" e "pecas-extra").
    for (const m of texto.matchAll(/(?:notificar|avisarNoSino)\(\{/g)) {
      let nivel = 0;
      let fim = m.index! + m[0].length - 1;
      for (; fim < texto.length; fim++) {
        if (texto[fim] === "{") nivel++;
        else if (texto[fim] === "}" && --nivel === 0) break;
      }
      const objeto = texto.slice(m.index!, fim);
      for (const linha of objeto.matchAll(/chave:([^\n]*)/g)) {
        for (const c of linha[1].matchAll(/`([a-z-]+):/g)) achados.push({ arquivo, prefixo: c[1] });
      }
    }
    // O aviso de saldo monta a chave antes (`const chave = \`saldo:...\``).
    if (/avisarNoSino|notificar\(/.test(texto)) {
      for (const c of texto.matchAll(/const chave = `([a-z-]+):/g)) achados.push({ arquivo, prefixo: c[1] });
    }
  }
  assert.ok(achados.length >= 15, `achou só ${achados.length} chaves: a varredura não está lendo o código`);
  const fora = achados.filter((a) => !sino.has(a.prefixo));
  assert.deepEqual(fora, [], "prefixo de sino fora da lista: o Desfazer e o Limpar as lidas falhariam com 400");
  // E o aviso aos admins prefixa tudo com "admin:".
  assert.match(ler("lib/notificacoes/aviso-aos-admins.ts"), /chave: `admin:\$\{aviso\.chave\}`/);
});

// ─── o servidor, com o banco em memória ───

test("descartar é idempotente e marca como lidas só as notificações da própria pessoa", async () => {
  const chave = "falha:efeitos:v1:2026-10-07T14:00:00.000Z";
  const b = descartesEmMemoria({
    notificacoes: [
      { userId: "dono", chave },
      { userId: "outra", chave },
    ],
  });
  assert.deepEqual(await descartar("dono", [chave], b.deposito), { lembrado: true });
  assert.deepEqual(await descartar("dono", [chave, chave], b.deposito), { lembrado: true });
  assert.equal(b.descartes.length, 1, "uma linha só, por mais que descarte de novo");
  assert.ok(b.notificacoes.find((n) => n.userId === "dono")!.lidaEm, "o sino do mesmo fato saiu do contador");
  assert.equal(b.notificacoes.find((n) => n.userId === "outra")!.lidaEm, null, "a notificação de outra pessoa não muda");
  assert.equal(b.notificacoes.length, 2, "nenhuma linha do sino é apagada");
});

test("o membro descarta para ele: o dono continua vendo", async () => {
  const b = descartesEmMemoria();
  const x = "falha:campanha:run1";
  await descartar("membro", [x], b.deposito);
  assert.deepEqual([...(await descartadasEntre("dono", [x], b.deposito))], []);
  assert.deepEqual([...(await descartadasEntre("membro", [x], b.deposito))], [x]);
});

test("desfazer apaga a linha do descarte e não mexe no lidaEm", async () => {
  const chave = "falha:campanha:run1";
  const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave }] });
  await descartar("u1", [chave], b.deposito);
  const lida = b.notificacoes[0].lidaEm;
  assert.ok(lida);
  assert.deepEqual(await desfazerDescarte("u1", [chave], b.deposito), { lembrado: true });
  assert.equal(b.descartes.length, 0);
  assert.equal(b.notificacoes[0].lidaEm, lida, "o que foi lido continua lido");
});

const SEM_TABELA: Array<[string, unknown]> = [
  ["P2021", Object.assign(new Error("The table `public.avisos_descartados` does not exist in the current database."), { code: "P2021" })],
  ["P2022", Object.assign(new Error("The column `chave` does not exist"), { code: "P2022" })],
  ["meta.code 42P01", Object.assign(new Error("Raw query failed"), { code: "P2010", meta: { code: "42P01" } })],
  ["cause.originalCode 42P01", Object.assign(new Error("falhou"), { cause: { originalCode: "42P01" } })],
  [
    "P2010 do adapter-pg",
    Object.assign(new Error("Raw query failed. Code: `P2010`"), {
      code: "P2010",
      meta: { driverAdapterError: { cause: { originalCode: "42P01", kind: "TableDoesNotExist", originalMessage: 'relation "avisos_descartados" does not exist' } } },
    }),
  ],
  ["a frase do Postgres", new Error('relation "avisos_descartados" does not exist')],
];

for (const [nome, erro] of SEM_TABELA) {
  test(`sem a tabela (${nome}): ninguém lança, a leitura vem vazia e a escrita devolve lembrado:false`, async () => {
    assert.equal(faltaATabela(erro), true);
    const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "falha:campanha:r1" }] });
    const dep = b.quebrado(erro);
    await silenciar(async () => {
      assert.deepEqual([...(await descartadasEntre("u1", ["falha:campanha:r1"], dep))], []);
      assert.deepEqual(await sementeDoCliente("u1", dep), []);
      assert.deepEqual(await descartar("u1", ["falha:campanha:r1"], dep), { lembrado: false });
      assert.deepEqual(await desfazerDescarte("u1", ["falha:campanha:r1"], dep), { lembrado: false });
      assert.deepEqual(await descartarLidas("u1", dep), { quantas: 0, lembrado: false });
    });
    assert.ok(b.notificacoes[0].lidaEm, "o sino do mesmo fato sai do contador mesmo sem a tabela");
  });
}

test("faltaATabela não confunde a chave repetida nem a rede caindo com tabela ausente", () => {
  assert.equal(faltaATabela(Object.assign(new Error("Unique constraint failed"), { code: "P2002" })), false);
  assert.equal(faltaATabela(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:5432"), { code: "ECONNREFUSED" })), false);
  assert.equal(faltaATabela(null), false);
  assert.equal(faltaATabela("texto"), false);
});

test("o teto por pessoa: com 5000 linhas, o descarte novo vale só na tela", async () => {
  const b = descartesEmMemoria();
  for (let i = 0; i < 5000; i++) b.descartes.push({ id: `x${i}`, userId: "u1", chave: `dica:x${i}`, descartadoEm: new Date(0) });
  assert.deepEqual(await silenciar(() => descartar("u1", ["dica:nova"], b.deposito)), { lembrado: false });
  assert.deepEqual(await descartar("u2", ["dica:nova"], b.deposito), { lembrado: true }, "o teto é de cada pessoa");
});

// ─── a semente do cliente ───

test("a semente não leva chaves só do sino, leva a dica de 90 dias atrás, e o Limpar as lidas não a empurra para fora", async () => {
  const b = descartesEmMemoria({
    notificacoes: Array.from({ length: 600 }, (_, i) => ({ userId: "u1", chave: `estorno:tx${i}`, lidaEm: new Date(Date.UTC(2026, 9, 1)) })),
  });
  // Descartada há 90 dias: sem corte de data, continua na semente.
  b.descartes.push({ id: "antiga", userId: "u1", chave: "cores-de-fabrica:p1", descartadoEm: new Date(Date.UTC(2026, 6, 9)) });
  await descartar("u1", ["falha:efeitos:v1:2026-10-07T14:00:00.000Z", "roteiro:v1:r1", "saldo:openai:inc1:j1"], b.deposito);
  const r = await descartarLidas("u1", b.deposito);
  assert.equal(r.quantas, TETO_DAS_LIDAS, "o Limpar as lidas descarta as 500 mais recentes, numa leva só");
  assert.ok(b.descartes.length > 500);
  const semente = await sementeDoCliente("u1", b.deposito);
  assert.ok(semente.includes("cores-de-fabrica:p1"));
  assert.ok(semente.includes("falha:efeitos:v1:2026-10-07T14:00:00.000Z"), "a chave da faixa continua na semente");
  assert.ok(!semente.some((c) => c.startsWith("roteiro:") || c.startsWith("saldo:") || c.startsWith("estorno:")), "as do sino ficam de fora");
});

// ─── o cliente: a fila e o conjunto ───

test("a fila: descartar e logo desfazer, com o POST lento, termina com a chave NÃO descartada no servidor", async () => {
  const servidor = new Set<string>();
  const ordem: string[] = [];
  let soltarPost: () => void = () => {};
  const postLento = new Promise<void>((r) => (soltarPost = r));
  const fila = criarFilaDosDescartes(async (metodo, chaves) => {
    ordem.push(`${metodo}:começou`);
    if (metodo === "POST") {
      await postLento;
      for (const c of chaves) servidor.add(c);
    } else {
      for (const c of chaves) servidor.delete(c);
    }
    ordem.push(`${metodo}:terminou`);
    return true;
  });
  const pedido = fila.descartar(["dica:pode-sair"]);
  assert.ok(pedido);
  assert.equal(fila.descartar(["dica:pode-sair"]), null, "o segundo clique, com o primeiro na fila, é ignorado");
  fila.desfazer(["dica:pode-sair"]);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(ordem, ["POST:começou"], "o DELETE espera a resposta do POST");
  soltarPost();
  await fila.esvaziar();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ordem, ["POST:começou", "POST:terminou", "DELETE:começou", "DELETE:terminou"]);
  assert.equal(servidor.has("dica:pode-sair"), false);
  assert.equal(await pedido.lembrado, true);
});

test("o conjunto da tela: esconde a falha descartada, mostra a ocorrência nova, e o Desfazer vence a semente depois do refresh", () => {
  const velha = chaveDaMontagem("v1", "completo", "2026-10-07T14:00:00.000Z")!;
  const nova = chaveDaMontagem("v1", "completo", "2026-10-07T16:00:00.000Z")!;
  const vazio = new Set<string>();
  let semente = unirSemente(vazio, [velha]);
  const estado = { semente, registradas: vazio, descartadas: vazio, desfeitas: vazio as ReadonlySet<string>, locais: vazio };
  assert.equal(estaDescartada(velha, estado), true, "o conjunto exato esconde a falha descartada");
  assert.equal(estaDescartada(nova, estado), false, "a mesma peça com desde novo aparece");
  // Desfazer, e o router.refresh traz a semente de antes (o DELETE ainda na fila).
  semente = unirSemente(semente, [velha]);
  assert.equal(estaDescartada(velha, { ...estado, semente, desfeitas: new Set([velha]) }), false, "o Desfazer traz o item de volta");
  assert.equal(estaDescartada(null, estado), false);
  assert.equal(estaDescartada(velha, { ...estado, semente: vazio, locais: new Set([velha]) }), true, "escondido só nesta visita");
});

// ─── no código: cada superfície do inventário tem o controle de descarte ───

/** [arquivo, o que precisa aparecer nele]. */
const SUPERFICIES: Array<[string, RegExp[]]> = [
  ["components/video/aviso-da-montagem.tsx", [/<BotaoDescartar/, /texto="Descartar todas"/, /descartes\.ehDescartado\(f\.chave\)/, /data-lista-de-avisos/, /variasPecas \? null :/]],
  ["components/content/content-manager.tsx", [
    /chaveDaCampanha\(lastFailedRun\.id, lastFailedRun\.status\)/,
    /banner-dismissed-\$\{runDaFaixa\}/,
    /esconderLocal\(\[chaveDaFaixaDaCampanha\]\)/,
    /chaveDaRevisaoDoCorte\(/,
    /chaveDaAberturaIa\(/,
    /chaveDoMotivoDaMontagem\(/,
    /chaveDoNaoRevisado\(/,
    /chaveDoVideoDaPeca\(/,
    /chaveDoDiaReprovado\(/,
    /chaveDoPedidoQueParou\(/,
    /chaveDaJornadaDoProjetoVazio\(/,
    /chaveDoPostQueFalhou\(/,
    /LinhaDaPublicacaoRecolhida/,
  ]],
  ["components/video/esteira-do-video.tsx", [
    // O X de todo cartão só descarta (o vídeo que parou inclusive); apagar é
    // o botão próprio, com a confirmação, só para o dono.
    /<BotaoDescartar chave=\{descarte\.chave\} descricaoId=\{idDoTitulo\}/,
    /aoApagar=\{podeApagar \? \(\) => apagar\(v\) : undefined\}/,
    /data-acao="apagar-video"/,
    /data-confirmar-apagar/,
    /Sim, apagar o vídeo/,
    /"Vídeo apagado\."/,
    /chaveDoVigia\(/,
    /CHAVE_PODE_SAIR/,
    /setSemConexaoDescartada\(true\)/,
    /setErroDaAcao\(null\)\} /,
    /setAvisoDaAcao\(null\)\} /,
    /recolhido=/,
  ]],
  ["components/video/aproveitar-roteiro.tsx", [/<BotaoDescartar/]],
  ["components/escritorio/escritorio.tsx", [
    /chaveDaVisitaDaPeca\(/,
    /chaveDaSugestao\(/,
    /rotulo="Dispensar a visita"/,
    /CHAVE_DOS_CONTROLES/,
    /aoFecharFalaDaMesa=\{\(\) => setFalaDaMesa\(null\)\}/,
    // A visita e a fala não cobrem o "Personalizar meu avatar"; a dica não segura o toque.
    /left-3 top-14 z-10[^"]*sm:right-3 sm:top-3/,
    /pointer-events-none absolute bottom-2 right-3/,
    /className="pointer-events-auto"/,
    // O dono da peça pela mesma regra da contagem do squad.
    /donoDaPeca\(p\)\?\.id === agentId/,
  ]],
  ["components/escritorio/escritorio-do-squad.tsx", [/rotulo="Fechar a fala"/, /aoDescartar=\{aoFecharFala\}/]],
  ["components/escritorio/escritorio-de-massinha.tsx", [/aoFecharFalaDaMesa/]],
  ["components/content/semana-do-quadro.tsx", [/chaveDoEstiloAguardando\(/, /chaveDaArteQueFalhou\(/, /modo=\{botao \? "recolher" : "sumir"\}/, /useDescarte\(andamento\.parado \? chave : null\)/]],
  ["components/posts/falha-da-publicacao.tsx", [/<Descartavel chave=\{chave\} modo="recolher"/, /<BotaoDescartar/]],
  ["components/posts/posts-panel.tsx", [/CHAVE_DA_APROVACAO_OBRIGATORIA/, /CHAVE_DE_SALVAR_A_MIDIA/, /chaveDaReconexaoDoPost\(/, /chave=\{post\.chaveDaFalha\}/]],
  ["components/billing/faixa-do-plano.tsx", [/chaveDoAlertaDoPlano\(/, /<BotaoDescartar/]],
  ["components/billing/credit-balance.tsx", [/chaveDosCreditosAcabando\(/, /chaveDaCompraAutomatica\(/, /searchParams\.delete\("creditos"\)/, /"sem-recarga", "zerado"\)/]],
  ["components/billing/comprar-creditos.tsx", [/chaveDoAutomatico/, /descartes\.descartar\(\[chaveDoAutomatico\]/]],
  ["components/admin/faixa-de-saldo-na-tela.tsx", [/chaveDoSaldoDoFornecedor\(/, /data-saldo-recolhido/]],
  ["components/admin/agenda-do-time.tsx", [/searchParams\.delete\("google"\)/, /<BotaoDescartar/]],
  ["components/gemeo/selo-do-gemeo.tsx", [/<BotaoDescartar/, /<\/Link>\s*<BotaoDescartar/]],
  ["app/(app)/projects/[id]/layout.tsx", [/chaveDoGemeoFaltaUmPasso\(/, /hojeDoLembrete\(/]],
  ["components/gemeo/gemeo-do-projeto.tsx", [/chaveDoResumoDoGemeo\(/, /chaveDaSituacaoDoGemeo\(/, /data-foto-recusada/, /data-foto-checagens/, /chaveDaSituacaoDoGemeo\(projectId, "video", v\.estado/]],
  ["components/gemeo/gemeo-nas-configuracoes.tsx", [/chaveDoGemeoNasConfiguracoes\(/, /<BotaoDescartar/]],
  ["components/kanban/kanban-board.tsx", [/"edicao-projeto-ativo"/, /"veio-do-documento"/, /texto="Fechar aviso"/, /chaveDaDica\("pular-redes", projectId\)/, /aoDescartar=\{\(\) => setAiReply\(""\)\}/]],
  ["components/kanban/step-perfil-proprio.tsx", [/chaveDoEstudo\(/, /"estudo-desligado"/]],
  ["components/kanban/step-referencias.tsx", [/"estudo-desligado"/]],
  ["components/kanban/step-referencias-do-cliente.tsx", [/chaveDoAcimaDoPlano\(/, /chaveDoEstudo\(/, /chaveDaDica\("estudo-desligado", projectId\)/]],
  ["components/posts/escolha-de-origem.tsx", [/chaveDaDica\("intercalar"\)/, /<BotaoDescartar/]],
  ["components/video/controle-do-corte.tsx", [/chaveDoCorteNaoAplicado\(videoId, dados\.aviso\)/, /aoDescartar=\{\(\) => setErro\(null\)\}/]],
  ["components/video/video-upload.tsx", [/aoDescartar=\{\(\) => setErro\(null\)\}/]],
  ["components/kanban/setup-preview.tsx", [/aoDescartar=\{\(\) => setErro\(null\)\}/]],
  ["components/settings/avisos-por-email.tsx", [/aoDescartar=\{\(\) => setErro\(null\)\}/]],
  // O X do erro de guardar não faz a linha dizer "Guardado" sem ter guardado.
  ["components/video/catalogo-de-estilos.tsx", [/setErroFechado\(true\)/, /erro && !erroFechado/]],
  ["components/video/semana-do-video.tsx", [/setErroFechado\(true\)/, /erroFechado \? null/]],
  ["components/editorial/referencias.tsx", [/chaveDoAcimaDoPlano\(/, /chaveDoEstudo\(projectId, estudo\.iniciadoEm, "falhou"\)/]],
  ["components/editorial/analises-das-referencias.tsx", [/chaveDoEstudo\(/, /modo=\{continuar \? "recolher" : "sumir"\}/]],
  ["components/marca/seletor-de-cores.tsx", [/chaveDasCoresDeFabrica\(/, /chaveDeConfirmarCores\(/, /chaveDaCorNoVideo\(/, /chaveDaAprovacaoQueCaiu\(/, /setErroDeLeituraFechado\(true\)/]],
  ["components/estilo-dos-posts/estilo-dos-posts.tsx", [/chaveDasArtesEsperando\(/]],
  ["components/estilo-dos-posts/modelos-dos-posts.tsx", [/<AvisoDescartavel/]],
  ["components/posts/janela-do-conteudo-pronto.tsx", [/<AvisoDescartavel/, /setErro\(null\)/]],
  ["components/video/medidor-de-envio.tsx", [/<BotaoDescartar/]],
  ["components/posts/campaign-setup-modal.tsx", [/"aviso-dias-de-video"/, /<FraseDescartavel>/, /<AvisoDescartavel/]],
  ["components/planos/pedido-de-upgrade.tsx", [/chaveDaCota\(/]],
  ["components/social/social-connect-panel.tsx", [/chaveDaContaAReconectar\(/, /"instagram-conta-logada"/, /window\.history\.replaceState/]],
  ["components/social/pagina-empresa-linkedin.tsx", [/chaveDasPaginasDoLinkedin\(/]],
  ["components/social/conexao-assistida.tsx", [/chaveDaConexaoAssistida\(/, /data-recolhida/, /Conexão assistida pedida em/]],
  ["components/video/tela-de-roteiro.tsx", [
    /chaveDoAvisoDoRoteiro\(/,
    /chaveDoEstiloNovo\(/,
    /chaveDoPlanoPendente\(/,
    /chaveDoPedidoDaCena\(/,
    /esperando o plano de efeitos/,
    /aria-describedby=\{planoPendente \? "motivo-do-aprovar"/,
    // O "parou" leva a marca da falha; o erro do plano na seção tem X.
    /chaveDoAvisoDoRoteiro\(tela\.videoId, "parou", marcaDaFalha\)/,
    /chaveDoPlanoPendente\(videoDaTela, "secao-erro", jornada\.erro\)/,
  ]],
  ["components/video/como-o-squad-edita.tsx", [/chaveDoEstiloQueMudou\(/]],
  ["components/equipe/aviso-so-o-dono.tsx", [/"somente-leitura"/, /Somente leitura/]],
  ["components/training/training-panel.tsx", [/"treinamento-como-funciona"/]],
  ["components/editorial/regras-do-projeto.tsx", [/chaveDasPropostasDoRoberto\(/]],
  ["components/projects/configuracao-do-projeto.tsx", [/"refazer-setup"/]],
  ["app/planos/conteudo.tsx", [/chaveDoPortao\("planos"\)/, /<DescartesProvider>/]],
  ["components/auth/auth-form.tsx", [/searchParams\.delete\("error"\)/, /<BotaoDescartar/]],
  ["components/notificacoes/sino.tsx", [/descartar: \[n\.id\]/, /restaurar: \[n\.id\]/, /descartarLidas: true/, /Limpar as lidas/, /Nada novo por aqui\./, /descartes\.registrar\(d\.chaves\)/, /mutacoes\.current !== mutacoesNoInicio/]],
  ["components/ui/avisos-rapidos.tsx", [/<ToastBar/, /toast\.dismiss\(t\.id\)/]],
];

for (const [arquivo, padroes] of SUPERFICIES) {
  test(`superfície com o controle de descarte: ${arquivo}`, () => {
    const texto = ler(arquivo);
    for (const p of padroes) assert.match(texto, p, `${arquivo} sem ${p}`);
    // Todo controle novo é o mesmo componente: o desenho e o nome acessível iguais.
    assert.match(texto, /BotaoDescartar|Descartavel|AvisoDescartavel|FraseDescartavel|descartar|ToastBar|SeloDoGemeo/);
  });
}

test("o Toaster da raiz é o que tem o X, e ninguém usa toast.custom", () => {
  const raiz = ler("app/layout.tsx");
  assert.match(raiz, /<AvisosRapidos \/>/);
  assert.doesNotMatch(raiz, /<Toaster/);
  const varrer = (d: string): string[] =>
    readdirSync(d).flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? varrer(p) : /\.(tsx|ts)$/.test(p) ? [p] : [];
    });
  for (const p of [...varrer("components"), ...varrer("app")]) {
    if (p.endsWith("avisos-rapidos.tsx")) continue;
    assert.doesNotMatch(ler(p), /toast\.custom\(/, `${p} usa toast.custom, que não passa pelo X do Toaster`);
  }
});

test("o provider da raiz envolve o app com a semente, e o Gestor aninha o conjunto exato", () => {
  const layout = ler("app/(app)/layout.tsx");
  assert.match(layout, /sementeDoCliente\(userId\)/);
  assert.match(layout, /<DescartesProvider iniciais=\{descartados\}>/);
  const pagina = ler("app/(app)/projects/[id]/live/page.tsx");
  assert.match(pagina, /descartadasEntre\(userId, chavesDaTela\)/);
  assert.match(pagina, /<DescartesProvider iniciais=\{descartadosDaTela\}>/);
  // O servidor não tira nada das props: a página não filtra as falhas descartadas.
  assert.doesNotMatch(pagina, /falhasDaMontagem\.filter/);
  const provider = ler("components/ui/descartar.tsx");
  assert.equal((provider.match(/aria-live="polite"/g) ?? []).length, 1, "uma região aria-live só, na raiz");
  assert.match(provider, /aria-label=\{texto \? undefined : nome\}/);
  assert.match(provider, /"Descartar aviso"/);
  assert.match(provider, /touch-manipulation/);
  assert.match(provider, /focus-visible:ring-2/);
});

test("nenhum texto novo do descarte usa travessão", () => {
  for (const p of [
    "lib/avisos/chaves.ts",
    "lib/avisos/descartes.ts",
    "lib/avisos/rota-dos-descartes.ts",
    "lib/avisos/fila-dos-descartes.ts",
    "lib/notificacoes/rota-do-sino.ts",
    "components/ui/descartar.tsx",
    "components/ui/avisos-rapidos.tsx",
    "components/admin/faixa-de-saldo-na-tela.tsx",
    "components/gemeo/selo-do-gemeo.tsx",
    "app/api/avisos/descartes/route.ts",
    "prisma/migrations/20261007120000_avisos_descartados/migration.sql",
  ]) {
    assert.doesNotMatch(ler(p), TRAVESSAO, p);
  }
});

test("a migração é aditiva, idempotente e com os nomes que o Prisma gera", () => {
  const sql = ler("prisma/migrations/20261007120000_avisos_descartados/migration.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS "avisos_descartados"/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS "avisos_descartados_userId_chave_key"/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS "avisos_descartados_userId_descartadoEm_idx"/);
  assert.match(sql, /EXCEPTION WHEN duplicate_object THEN NULL;/);
  assert.match(sql, /ON DELETE CASCADE/);
  assert.doesNotMatch(sql, /DROP|ALTER TABLE "notificacoes"/);
  const schema = ler("prisma/schema.prisma");
  assert.match(schema, /model AvisoDescartado \{[\s\S]*@@unique\(\[userId, chave\]\)[\s\S]*@@index\(\[userId, descartadoEm\]\)[\s\S]*@@map\("avisos_descartados"\)/);
  assert.match(schema, /avisosDescartados AvisoDescartado\[\]/);
});

// ─── a revisão de 07/10 (os achados dos revisores) ───

test("a rota das telas aceita só as chaves das telas: a do sino entra pelo sino, pelo id", () => {
  assert.equal(ehChaveDasTelas("dica:pode-sair"), true);
  assert.equal(ehChaveDasTelas("falha:efeitos:v1:2026-10-07T14:00:00.000Z"), true, "a montagem tem faixa: as duas pontas");
  assert.equal(ehChaveDasTelas("falha:campanha:r1"), true);
  for (const c of ["roteiro:v1:r1", "saldo:openai:x", "admin:qualquer", "falha:transcribe:v1:x", "estorno:t1"]) assert.equal(ehChaveDasTelas(c), false, c);
  for (const p of PREFIXOS_DAS_TELAS) assert.ok(ehChaveDasTelas(`${p}:x`), p);
  assert.deepEqual([...CHAVES_DO_SINO_COM_FAIXA], ["falha:efeitos:", "falha:campanha:"], "a SQL do Limpar as lidas deixa de fora exatamente estas duas");
});

test("a rota recusa a chave só do sino com 400 (não enche a tabela com sufixo inventado)", async () => {
  const { responderAosDescartes } = await import("@/lib/avisos/rota-dos-descartes");
  const b = descartesEmMemoria();
  const r = await responderAosDescartes({ metodo: "POST", userId: "u1", contentType: "application/json", corpo: async () => ({ chaves: ["roteiro:inventado:1"] }) }, b.deposito);
  assert.equal(r.status, 400);
  assert.equal(b.descartes.length, 0);
});

test("o teto: com 5000 das telas COM fim natural, as mais antigas saem e o descarte novo é lembrado", async () => {
  const b = descartesEmMemoria();
  for (let i = 0; i < TETO_POR_PESSOA; i++) b.descartes.push({ id: `x${i}`, userId: "u1", chave: `video:falhou:v${i}:r:transcribe:1`, descartadoEm: new Date(Date.UTC(2026, 0, 1) + i * 1000) });
  b.descartes.push({ id: "dica-velha", userId: "u1", chave: "dica:pode-sair", descartadoEm: new Date(Date.UTC(2025, 0, 1)) });
  assert.deepEqual(await descartar("u1", ["publicacao-falhou:p1:abcd1234"], b.deposito), { lembrado: true });
  assert.ok(b.descartes.some((d) => d.chave === "publicacao-falhou:p1:abcd1234"));
  assert.ok(!b.descartes.some((d) => d.chave === "video:falhou:v0:r:transcribe:1"), "a mais antiga com fim natural saiu");
  assert.ok(b.descartes.some((d) => d.chave === "dica:pode-sair"), "a dica (sem fim) nunca sai, por mais antiga");
  assert.ok(b.descartes.filter((d) => d.userId === "u1").length <= TETO_POR_PESSOA);
});

test("o teto: as chaves só do sino não contam, e só os avisos sem fim travam o descarte", async () => {
  const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "roteiro:v1:r1" }] });
  for (let i = 0; i < TETO_POR_PESSOA; i++) b.descartes.push({ id: `d${i}`, userId: "u1", chave: `dica:x${i}`, descartadoEm: new Date(0) });
  // Só avisos sem fim: o descarte novo de tela vale só na tela.
  assert.deepEqual(await silenciar(() => descartar("u1", ["video:pecas:v1:r1"], b.deposito)), { lembrado: false });
  // A notificação do sino descartada pelo X dela: chave só do sino, não conta no teto.
  const id = b.notificacoes[0].id;
  assert.deepEqual(await descartarNotificacoes("u1", [id], b.deposito), { chaves: ["roteiro:v1:r1"], lembrado: true });
  // E os 600 estornos do Limpar as lidas não empurram nada: não contam.
  const c = descartesEmMemoria({ notificacoes: Array.from({ length: 600 }, (_, i) => ({ userId: "u1", chave: `estorno:t${i}`, lidaEm: new Date() })) });
  await descartarLidas("u1", c.deposito);
  assert.equal(await c.deposito.quantas("u1", PREFIXOS_DA_SEMENTE), 0);
});

test("a semente tem cota para os avisos sem fim: a dica antiga não sai empurrada por 2000 recentes", async () => {
  const b = descartesEmMemoria();
  b.descartes.push({ id: "antiga", userId: "u1", chave: "dica:pode-sair", descartadoEm: new Date(Date.UTC(2026, 0, 1)) });
  b.descartes.push({ id: "cores", userId: "u1", chave: "cores-de-fabrica:p1", descartadoEm: new Date(Date.UTC(2026, 0, 2)) });
  for (let i = 0; i < 2100; i++) b.descartes.push({ id: `v${i}`, userId: "u1", chave: `video:pronto:v${i}:r`, descartadoEm: new Date(Date.UTC(2026, 9, 1) + i * 1000) });
  const semente = await sementeDoCliente("u1", b.deposito);
  assert.ok(semente.includes("dica:pode-sair") && semente.includes("cores-de-fabrica:p1"));
  assert.ok(semente.length <= 2000 + COTA_DOS_SEM_FIM);
  assert.equal(new Set(semente).size, semente.length, "sem repetida");
  // As duas listas não se cruzam e juntas são a semente inteira.
  assert.ok(PREFIXOS_SEM_FIM.every((p) => PREFIXOS_DA_SEMENTE.includes(p)));
  assert.equal(PREFIXOS_SEM_FIM.length + PREFIXOS_COM_FIM.length, PREFIXOS_DA_SEMENTE.length);
});

test("Limpar as lidas deixa de fora a montagem e a campanha que falharam (a faixa do Gestor fica)", async () => {
  const montagem = "falha:efeitos:v1:2026-10-07T14:00:00.000Z";
  const b = descartesEmMemoria({
    notificacoes: [
      { userId: "u1", chave: montagem, lidaEm: new Date() },
      { userId: "u1", chave: "falha:campanha:r1", lidaEm: new Date() },
      { userId: "u1", chave: "estorno:t1", lidaEm: new Date() },
    ],
  });
  assert.deepEqual(await descartarLidas("u1", b.deposito), { quantas: 1, lembrado: true });
  assert.deepEqual(
    b.descartes.map((d) => d.chave),
    ["estorno:t1"]
  );
  const sql = ler("lib/avisos/descartes.ts");
  assert.match(sql, /"chave" NOT LIKE \$\{`\$\{faixa1\}%`\} AND "chave" NOT LIKE \$\{`\$\{faixa2\}%`\}/);
  assert.match(sql, /const \[faixa1, faixa2\] = CHAVES_DO_SINO_COM_FAIXA;/);
});

test("o Desfazer do sino devolve o item como estava: a não lida volta não lida", async () => {
  const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "roteiro:v1:r1" }] });
  const id = b.notificacoes[0].id;
  await descartarNotificacoes("u1", [id], b.deposito);
  assert.equal(b.notificacoes[0].lidaEm, null, "o descarte pelo sino não marca como lida");
  assert.deepEqual(await restaurarNotificacoes("u1", [id], b.deposito), { chaves: ["roteiro:v1:r1"], lembrado: true });
  assert.equal(b.notificacoes[0].lidaEm, null);
  assert.equal(b.descartes.length, 0);
  // O descarte pela TELA continua marcando a notificação do mesmo fato como lida.
  const c = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "falha:campanha:r1" }] });
  await descartar("u1", ["falha:campanha:r1"], c.deposito);
  assert.ok(c.notificacoes[0].lidaEm);
});

test("o restaurar que falha no servidor diz lembrado:false (a tela avisa)", async () => {
  const b = descartesEmMemoria({ notificacoes: [{ userId: "u1", chave: "roteiro:v1:r1" }] });
  const dep = b.quebrado(new Error("Connection terminated unexpectedly"));
  const r = await silenciar(() => restaurarNotificacoes("u1", [b.notificacoes[0].id], dep));
  assert.deepEqual(r, { chaves: ["roteiro:v1:r1"], lembrado: false });
});

test("a fila: o 'só nesta tela' não aparece para o aviso já desfeito, e o Desfazer que falha avisa", async () => {
  // 1) O POST falha DEPOIS de a pessoa ter desfeito: nada de "Descartado só nesta tela".
  let soltar: (ok: boolean) => void = () => {};
  const fila = criarFilaDosDescartes((metodo) => (metodo === "POST" ? new Promise<boolean>((r) => (soltar = r)) : Promise.resolve(true)));
  const pedido = fila.descartar(["dica:a"])!;
  fila.desfazer(["dica:a"]);
  await new Promise((r) => setTimeout(r, 0));
  soltar(false);
  assert.equal(await pedido.soNaTela, false, "já desfeito: o aviso está de volta, o toast seria mentira");
  // 2) Sem Desfazer, o POST que falha avisa.
  const fila2 = criarFilaDosDescartes(async () => false);
  assert.equal(await fila2.descartar(["dica:b"])!.soNaTela, true);
  // 3) O DELETE que falha depois de um POST lembrado avisa; sem POST lembrado, não.
  const fila3 = criarFilaDosDescartes(async (metodo) => metodo === "POST");
  await fila3.descartar(["dica:c"])!.lembrado;
  assert.equal(await fila3.desfazer(["dica:c"]).falhou, true);
  const fila4 = criarFilaDosDescartes(async () => false);
  await fila4.descartar(["dica:d"])!.lembrado;
  assert.equal(await fila4.desfazer(["dica:d"]).falhou, false, "nada foi lembrado: nada some ao recarregar");
  // 4) A chave que veio da semente (descartada em outra visita): o DELETE que falha avisa.
  const fila5 = criarFilaDosDescartes(async () => false);
  assert.equal(await fila5.desfazer(["dica:da-semente"]).falhou, true);
  assert.equal(await fila5.desfazer(["dica:da-semente"], { soNaTela: true }).falhou, false);
});

test("o provider usa a fila para os dois toasts honestos, e a importação do descarte antigo é silenciosa", () => {
  const provider = ler("components/ui/descartar.tsx");
  assert.match(provider, /pedido\.soNaTela\.then/);
  assert.match(provider, /FRASE_DESFAZER_SO_NESTA_TELA/);
  assert.match(provider, /if \(!silencioso\) anunciar\("Aviso descartado\."\)/);
  const gestor = ler("components/content/content-manager.tsx");
  assert.match(gestor, /\{ desfazivel: false, silencioso: true \}\)\.then\(\(lembrado\) =>/);
  // A entrada antiga só sai depois de o servidor lembrar.
  assert.doesNotMatch(gestor, /if \(tinha\) localStorage\.removeItem\(antiga\);/);
});

test("o sino: o Desfazer espera o descarte do mesmo item, e o vazio explica para quem nunca recebeu nada", () => {
  const sino = ler("components/notificacoes/sino.tsx");
  assert.match(sino, /await pendentes\.current\.get\(n\.id\)\?\.catch\(\(\) => \{\}\);/);
  assert.match(sino, /if \(ultimaOp\.current\.get\(n\.id\) !== "descartar"\) return;/);
  assert.match(sino, /Nada por aqui ainda\. Avisamos quando o roteiro pedir a sua aprovação e quando o vídeo ficar pronto\./);
  assert.match(sino, /n\.lida && !n\.temFaixa/);
});

test("o selo do gêmeo não leva o id do fornecedor ao navegador", () => {
  const grupo = "grupo-do-fornecedor-123";
  const k = chaveDoGemeoFaltaUmPasso("p1", grupo)!;
  assert.ok(k && !k.includes(grupo), k);
  assert.equal(k, `gemeo-falta-um-passo:p1:${marca(grupo)}`);
  assert.equal(chaveDoGemeoFaltaUmPasso("p1", grupo, true), `gemeo-falta-um-passo:p1:${marca(grupo)}:lembrete`);
  assert.equal(chaveDoGemeoFaltaUmPasso("p1", null), null);
});

test("as ocorrências novas voltam: o plano com erro novo, o corte não aplicado e a espera do estilo por lote", () => {
  assert.notEqual(chaveDoPlanoPendente("v1", "erro", "falhou A"), chaveDoPlanoPendente("v1", "erro", "falhou B"));
  assert.equal(chaveDoPlanoPendente("v1", "lendo"), "plano-pendente:v1:lendo");
  const a = chaveDoCorteNaoAplicado("v1", "O seu último corte não pôde ser aplicado: motivo A");
  const b = chaveDoCorteNaoAplicado("v1", "O seu último corte não pôde ser aplicado: motivo B");
  assert.ok(a && b && a !== b && ehChaveDasTelas(a));
  assert.equal(chaveDoCorteNaoAplicado("v1", null), null);
  assert.notEqual(chaveDoEstiloAguardando("p1", "run1"), chaveDoEstiloAguardando("p1", "run2"));
  assert.equal(chaveDoEstiloAguardando("p1", null), null);
  // O lote da espera: a campanha, senão o vídeo, senão o próprio post.
  const meta = { aguardandoIdentidade: true };
  assert.deepEqual(esperaDaIdentidade({ id: "post1", runId: "run1", metadata: meta }), { estado: "aguardando", lote: "run1" });
  assert.deepEqual(esperaDaIdentidade({ id: "post1", metadata: { ...meta, videoJobId: "vid1" } }), { estado: "aguardando", lote: "vid1" });
  assert.deepEqual(esperaDaIdentidade({ id: "post1", metadata: meta }), { estado: "aguardando", lote: "post1" });
  // O "parou" da tela de roteiro leva a marca da falha (rodada, tentativa e erro).
  assert.match(ler("lib/media/roteiro-da-edicao.ts"), /falha: v\.status === "failed" \? marcaDoAviso\(/);
  assert.match(ler("lib/media/roteiro-da-edicao.ts"), /\$\{video\.attempts\}\|\$\{video\.error \?\? ""\}/);
});

test("apagar o vídeo que parou é só do dono: o servidor recusa o membro com 403", () => {
  const rota = ler("app/api/videos/[id]/dispensar/route.ts");
  assert.match(rota, /if \(!acesso\.interno && video\.project\.userId !== acesso\.userId\)/);
  assert.match(rota, /status: 403/);
  assert.match(ler("app/(app)/projects/[id]/live/page.tsx"), /souDono=\{project\.userId === userId\}/);
  assert.doesNotMatch(ler("components/video/esteira-do-video.tsx"), /Dispensar e apagar o vídeo/);
});
