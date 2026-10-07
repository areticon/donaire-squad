// A REVISÃO DO CONTROLE DO CORTE NO COMPLETO (08/10/2026). O que a revisão
// achou e consertou, só no que é puro (nada de banco, IA, worker ou mídia):
//   - o aviso repetido do worker (e a segunda base do mesmo corte) não toma o
//     lugar do editado: com o editado no ar, o `completoUrl` nunca é a base do
//     corte, e a rota não reconhecia o repetido pela URL;
//   - o corte que não saiu é desfeito pela marca `voltou`, mesmo sem a marca
//     da refação (sem ela, a edição inteira era devolvida com a de antes no ar);
//   - a refação velha que nunca voltou não vira "o roteiro de antes";
//   - nada mais mexe na edição do completo enquanto o corte anda;
//   - o elemento que o cliente já tinha removido não "sai pelo corte".
// Rodar: npx tsx --test scripts/testes/corte-do-completo-revisao-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  baseDoCorte,
  corteDoCompletoAndando,
  estadoComRecorte,
  montagemDoRecorte,
  REFAZENDO_VALE_MS,
  roteiroAntesDoCorte,
  type CompletoDoCliente,
} from "@/lib/media/corte-do-completo";
import { levarJornadaParaFalaNova, MOTIVO_DA_FALA_CORTADA } from "@/lib/media/jornada/corte";
import { frasesDaFala, type Palavra } from "@/lib/media/jornada/linha-do-tempo";
import type { ElementoProposto, EstadoDaJornada } from "@/lib/media/jornada/estado";

const ler = (p: string) => readFileSync(p, "utf8");
/** O estado da montagem como a prova o lê (só os campos que ela confere). */
type Lido = { montadoUrl?: string; baseUrl?: string; completoOriginal?: { url: string } | null; roteiro: { completoDoCliente: CompletoDoCliente } };
const AGORA = Date.parse("2026-10-08T12:00:00.000Z");
const haMinutos = (m: number) => new Date(AGORA - m * 60_000).toISOString();

const cdc = (extra: Partial<CompletoDoCliente>): CompletoDoCliente => ({
  manter: [{ de: 1, ate: 9 }],
  remocoes: [],
  doCliente: [],
  mantidosPeloUsuario: [],
  refacoes: 1,
  ultima: null,
  ...extra,
});
const refazendo = (base: string | null, minutos = 5, roteiroAnterior: Record<string, unknown> | null = null) => ({
  em: haMinutos(minutos),
  base,
  refacao: 1,
  creditos: 0,
  userId: "u1",
  roteiroAnterior,
});

// ─────────────────────────────── a base que o worker devolve ───────────────────────────────

test("a base do corte vai para a montagem uma vez só: o repetido e a segunda não tomam o lugar do editado", () => {
  const B1 = "https://blob/completo-b1.mp4";
  const B2 = "https://blob/completo-b2.mp4";
  // O corte andando, a base ainda não chegou: é a do corte.
  assert.equal(baseDoCorte(B1, cdc({ refazendo: refazendo(null) }), { baseUrl: "https://blob/base-velha.mp4" }, AGORA), "do-corte");
  // O worker repetiu o aviso depois que a base já foi para a montagem.
  assert.equal(baseDoCorte(B1, cdc({ refazendo: refazendo(B1) }), { baseUrl: B1, completoOriginal: { url: B1 } }, AGORA), "repetida");
  // Repetido depois de a montagem ficar pronta (a marca já saiu, a base ficou como original).
  assert.equal(baseDoCorte(B1, cdc({ refazendo: null }), { baseUrl: B1, completoOriginal: { url: B1 } }, AGORA), "repetida");
  // Repetido depois de o corte voltar atrás (a montagem voltou para a base de antes).
  assert.equal(baseDoCorte(B1, cdc({ refazendo: null, naoSaiu: { em: "x", motivo: "render", base: B1 } }), { baseUrl: "https://blob/base-velha.mp4" }, AGORA), "repetida");
  // O pedido saiu duas vezes: a montagem já trabalha na primeira base do mesmo corte.
  assert.equal(baseDoCorte(B2, cdc({ refazendo: refazendo(B1) }), { baseUrl: B1 }, AGORA), "segunda");
  // A marca velha (o worker morreu sem aviso) não segura mais nada: caminho de sempre.
  assert.equal(baseDoCorte(B2, cdc({ refazendo: refazendo(null, (REFAZENDO_VALE_MS + 60_000) / 60_000) }), { baseUrl: "https://blob/base-velha.mp4" }, AGORA), "comum");
  // Sem corte do cliente: caminho de sempre; mas o repetido da base da montagem também é reconhecido.
  assert.equal(baseDoCorte(B2, null, { baseUrl: B1 }, AGORA), "comum");
  assert.equal(baseDoCorte(B1, null, { baseUrl: "x", completoOriginal: { url: B1 } }, AGORA), "repetida");
});

test("o corte anda por um prazo: depois dele, a marca não trava mais nada", () => {
  assert.equal(corteDoCompletoAndando(cdc({ refazendo: refazendo(null, 1) }), AGORA), true);
  assert.equal(corteDoCompletoAndando(cdc({ refazendo: refazendo("https://blob/b.mp4", 30) }), AGORA), true, "com a base na montagem, ainda anda");
  assert.equal(corteDoCompletoAndando(cdc({ refazendo: refazendo(null, 5 * 60) }), AGORA), false);
  assert.equal(corteDoCompletoAndando(cdc({ refazendo: null }), AGORA), false);
  assert.equal(corteDoCompletoAndando(null, AGORA), false);
});

// ─────────────────────────────── a volta atrás ───────────────────────────────

test("o corte que não saiu volta pela marca `voltou`, mesmo sem a marca da refação, e guarda a base para o repetido", () => {
  const noAr = { estado: "pronto", desde: "d0", montadoUrl: "https://blob/completo-editado-1.mp4", baseUrl: "https://blob/base-velha.mp4", roteiro: { versao: 1, completoDoCliente: cdc({ refazendo: null }) } };
  const fila = montagemDoRecorte(noAr, { url: "https://blob/base-nova.mp4", bytes: 1 }, { origem: "h", agora: "d1" }) as Record<string, unknown>;
  const r = estadoComRecorte({ ...fila, estado: "sem-montagem", desde: "d2", motivo: "render quebrou" } as never);
  assert.equal(r.voltou, true, "voltou: quem chama não devolve a edição inteira");
  assert.equal(r.desfeito, null, "sem a marca, não há refação a devolver");
  const e = r.estado as unknown as Lido;
  assert.equal(e.montadoUrl, "https://blob/completo-editado-1.mp4");
  assert.equal(e.baseUrl, "https://blob/base-velha.mp4", "a montagem volta para a base de antes");
  assert.equal(e.roteiro.completoDoCliente.naoSaiu?.base, "https://blob/base-nova.mp4", "a base que não saiu fica marcada");
  assert.equal(baseDoCorte("https://blob/base-nova.mp4", e.roteiro.completoDoCliente, e, AGORA), "repetida");
});

test("a montagem do corte tomada por outra que sai com a mesma base fecha a refação", () => {
  const B = "https://blob/base-do-corte.mp4";
  const pronto = { estado: "pronto", desde: "d3", baseUrl: B, montadoUrl: "https://blob/completo-editado-2.mp4", roteiro: { versao: 1, completoDoCliente: cdc({ refazendo: refazendo(B) }) } };
  const r = estadoComRecorte(pronto as never);
  assert.equal((r.estado as unknown as Lido).roteiro.completoDoCliente.refazendo, null);
  assert.equal(r.voltou, false);
  // Outra base: a marca fica (é de outro trabalho).
  const outra = estadoComRecorte({ ...pronto, baseUrl: "https://blob/outra.mp4" } as never);
  assert.ok((outra.estado as unknown as Lido).roteiro.completoDoCliente.refazendo);
});

test("o roteiro de antes de um corte é o que está no ar, e não o de uma refação velha que nunca voltou", () => {
  const r0 = { versao: 1, marca: "no ar", completoDoCliente: null };
  const semMarca = { versao: 1, marca: "agora", completoDoCliente: cdc({ refazendo: null }) };
  assert.equal(roteiroAntesDoCorte(semMarca), semMarca);
  const comVelha = { versao: 1, marca: "a velha", completoDoCliente: cdc({ refazendo: refazendo(null, 6 * 60, r0) }) };
  assert.equal((roteiroAntesDoCorte(comVelha) as unknown as { marca: string }).marca, "no ar");
  const semAnterior = { versao: 1, marca: "x", completoDoCliente: cdc({ refazendo: refazendo(null, 6 * 60, null) }) };
  assert.equal(roteiroAntesDoCorte(semAnterior).completoDoCliente?.refazendo, null);
});

// ─────────────────────────────── a jornada ───────────────────────────────

test("o elemento que o cliente já tinha removido não sai 'pelo corte': só o que estava valendo é avisado", () => {
  // 20 palavras, frase de 5 com ponto: frases [0-4], [5-9], [10-14], [15-19].
  const falaVelha: Palavra[] = Array.from({ length: 20 }, (_, i) => ({ texto: `w${i}${i % 5 === 4 ? "." : ""}`, inicio: +(i * 0.5).toFixed(3), fim: +(i * 0.5 + 0.3).toFixed(3) }));
  const frases = frasesDaFala(falaVelha);
  assert.equal(frases.length, 4);
  const el = (id: string, k: number): ElementoProposto => {
    const f = frases.find((x) => k >= x.de && k <= x.ate)!;
    return { id, momento: { indice: f.indice, de: f.inicio, ate: f.fim, frase: f.texto }, gatilho: { palavra: `w${k}`, indice: k, t: falaVelha[k].inicio }, descricao: `elemento ${id}`, textoNaImagem: null, midia: "imagem", formato: "janela", porque: "", custoUsd: 0.05, origem: "ia", papel: "elemento" };
  };
  const estado: EstadoDaJornada = {
    versao: 1,
    edicaoId: "e1",
    leitura: null,
    amostras: null,
    plano: { versao: 1, edicaoId: "e1", estiloDoCliente: "", densidade: { segundosEntreElementos: [5, 8], porque: "" }, elementos: [el("ja", 7), el("vale", 8), el("fica", 12)], custoTotalUsd: 0.15, feitoEm: "x", formato: "16:9", duracao: 10 },
    revisao: { ja: { id: "ja", acao: "removido", pedidos: [{ texto: "tira esse", em: "x" }], descricaoAprovada: "elemento ja", textoNaImagemAprovado: null } },
    aprovado: null,
    avisos: [],
  };
  // O cliente tira a frase inteira de 5 a 9.
  const mapa = falaVelha.map((_, i) => (i < 5 ? i : i <= 9 ? null : i - 5));
  const falaNova: Palavra[] = falaVelha.filter((_, i) => i < 5 || i > 9).map((p, k) => ({ ...p, inicio: +(k * 0.5).toFixed(3), fim: +(k * 0.5 + 0.3).toFixed(3) }));
  const { estado: e, sairam } = levarJornadaParaFalaNova(estado, { mapa, falaVelha, falaNova, manterVelho: [{ de: 0, ate: 10 }], manterNovo: [{ de: 0, ate: 2.45 }, { de: 4.95, ate: 10 }], agora: "2026-10-08T10:00:00.000Z" });
  assert.deepEqual(sairam.map((s) => s.id), ["vale"], "só o que estava valendo é avisado");
  assert.deepEqual(e.plano!.elementos.map((x) => x.id), ["fica"]);
  assert.equal(e.plano!.elementos[0].gatilho.indice, 7, "o que ficou anda pela palavra da gravação (12 vira 7)");
  assert.ok(!e.revisao.ja.pedidos.some((p) => p.texto === MOTIVO_DA_FALA_CORTADA), "a revisão do já removido não ganha o motivo do corte");
  assert.ok(e.revisao.vale.pedidos.some((p) => p.texto === MOTIVO_DA_FALA_CORTADA));
  assert.ok(!(e.avisos ?? []).some((a) => a.includes("elemento ja")), "nem aviso");
});

// ─────────────────────────────── a prova, no código ───────────────────────────────

test("no código: a rota recebe a base pelo `baseDoCorte`, a volta não devolve a edição inteira e nada mais mexe enquanto o corte anda", () => {
  const servidor = ler("lib/media/controle-do-completo-servidor.ts");
  assert.match(servidor, /const tipo = baseDoCorte\(base\.url, r\?\.completoDoCliente/);
  assert.match(servidor, /if \(tipo === "repetida" \|\| tipo === "segunda"\)/);
  assert.match(servidor, /roteiroAnterior: roteiroAntesDoCorte\(l\.r\)/);
  const montagem = ler("lib/media/montagem-do-completo.ts");
  assert.match(montagem, /if \(!voltou\) \{\s*await estornarEdicaoNaoEntregue/);
  assert.match(montagem, /if \(lido\.recorteDoCliente && lido\.montadoUrl && lido\.montadoUrl === v\.completoUrl/);
  assert.match(ler("lib/media/ajuste-pelo-chat.ts"), /\|\| corteDoCompletoAndando\(m\?\.roteiro\?\.completoDoCliente\)/);
  assert.match(ler("lib/media/roteiro-da-edicao.ts"), /if \(corteDoCompletoAndando\(r\.completoDoCliente\)\) return false;/);
});
