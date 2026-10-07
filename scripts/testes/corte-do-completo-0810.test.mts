// O CONTROLE DO CORTE NO VÍDEO COMPLETO (08/10/2026). O pedido do Bruno: "às
// vezes o usuário não quer um corte de um vídeo pequeno, ele quer o vídeo mas
// sem o começo, sem o fim, ele quer fazer um pequeno corte no meio que a IA
// deixou passar". Aqui só o que é puro (nada de banco, IA, worker ou mídia):
//   - o mapa exato entre a fala antiga e a nova (índice da gravação, nunca texto);
//   - os elementos da jornada levados para a fala nova: o que ficou, o que perdeu
//     a palavra do gatilho, o que perdeu o momento inteiro, o que o cliente devolveu;
//   - a leitura e as amostras passando pela gravação;
//   - as remoções do completo como complemento exato do que o player toca;
//   - a refação depois da entrega: pronto fecha, falha volta o que estava no ar;
//   - a guarda da fala protege o que o cliente devolveu no completo;
//   - a prova, no código, de que cada ponta usa o registro próprio do completo.
// Rodar: npx tsx --test scripts/testes/corte-do-completo-0810.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { frasesDaFala, mapaExatoEntreFalas, reprojetarNoTempo, tempoEditado, tempoNaGravacao, type Palavra } from "@/lib/media/jornada/linha-do-tempo";
import { levarJornadaParaFalaNova, MOTIVO_DA_FALA_CORTADA } from "@/lib/media/jornada/fala-cortada";
import { aprovarJornada } from "@/lib/media/jornada/revisao";
import type { ElementoProposto, EstadoDaJornada } from "@/lib/media/jornada/estado";
import { mapaDePalavras } from "@/lib/media/roteiro-em-texto";
import {
  calcularCorte,
  elementosQueSaem,
  escolhaDoCompleto,
  manterDoCompletoNoAr,
  mesmaEscolha,
  motivoDaIA,
  noTempoDoCorte,
  palavrasNaFala,
  remocoesDoCompleto,
  type Intervalo,
  type PalavraDoControle,
} from "@/lib/media/controle-do-corte";
import {
  comCorteQueNaoSaiu,
  editadoNoAr,
  estadoComRecorte,
  levarTrecho,
  montagemDoRecorte,
  moverAbertura,
  MOTIVO_DO_CORTE_QUE_NAO_SAIU,
  type CompletoDoCliente,
} from "@/lib/media/corte-do-completo";
import { alvoDaGuarda, pedidoDaGuarda } from "@/lib/media/guarda-da-fala";
import type { LeituraDoVideo } from "@/lib/media/leitura-do-video";

// Sem o CR do checkout do Windows: os testes procuram trechos com LF.
const ler = (p: string) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

// ─────────────────────────────── uma gravação de mentira ───────────────────────────────

/** 200 palavras de 0,3 s, 0,1 s entre elas, frase de 8 palavras com ponto e pausa de 0,7 s. */
function gravacao(n = 200): { palavras: PalavraDoControle[]; dur: number } {
  let t = 1.0;
  const palavras: PalavraDoControle[] = [];
  for (let i = 0; i < n; i++) {
    const fimDeFrase = i % 8 === 7;
    palavras.push({ i, texto: `p${i}${fimDeFrase ? "." : ""}`, inicio: +t.toFixed(3), fim: +(t + 0.3).toFixed(3), ia: null });
    t += 0.4 + (fimDeFrase ? 0.7 : 0);
  }
  return { palavras, dur: +(t + 1).toFixed(3) };
}

/** O complemento das remoções em [0, dur] (o que o worker emenda, worker/src/ffmpeg.mjs `intervalosQueFicam`). */
function complemento(remocoes: Intervalo[], dur: number): Intervalo[] {
  const r = [...remocoes].sort((a, b) => a.de - b.de);
  const saida: Intervalo[] = [];
  let t = 0;
  for (const x of r) {
    if (x.de > t + 1e-6) saida.push({ de: t, ate: x.de });
    t = Math.max(t, x.ate);
  }
  if (dur > t + 1e-6) saida.push({ de: t, ate: dur });
  return saida;
}

/** `indicesDaFala` (lib/media/ajuste-pelo-chat.ts) para o completo: começo da palavra num pedaço mantido. */
function indicesNaFala(palavras: PalavraDoControle[], manter: Intervalo[]): number[] {
  return palavras.filter((p) => noTempoDoCorte(p.inicio, 0, manter) !== null).map((p) => p.i);
}

/** A fala (tempo editado) das palavras de índices `idx`, a mesma conta de `falaDoCorte`. */
function falaDe(palavras: PalavraDoControle[], idx: number[], manter: Intervalo[]): Palavra[] {
  return idx.map((i) => {
    const p = palavras[i];
    const a = noTempoDoCorte(p.inicio, 0, manter)!;
    const b = noTempoDoCorte(p.fim, 0, manter) ?? a + Math.min(0.4, p.fim - p.inicio);
    return { texto: p.texto, inicio: +a.toFixed(3), fim: +Math.max(a + 0.05, b).toFixed(3) };
  });
}

const iguais = (a: Intervalo[], b: Intervalo[], tol = 0.002) => a.length === b.length && a.every((x, k) => Math.abs(x.de - b[k].de) < tol && Math.abs(x.ate - b[k].ate) < tol);

// ─────────────────────────────── o tempo, nos dois sentidos ───────────────────────────────

test("tempoNaGravacao é a inversa de tempoEditado, e a emenda escolhe o lado", () => {
  const manter = [{ de: 0, ate: 2 }, { de: 3, ate: 5 }, { de: 6.5, ate: 10 }];
  for (const g of [0.5, 1.9, 3.2, 4.99, 7, 9.5]) assert.equal(tempoNaGravacao(tempoEditado(g, manter)!, manter), g);
  assert.equal(tempoNaGravacao(2, manter, "inicio"), 3, "na emenda, o começo fica com o pedaço seguinte");
  assert.equal(tempoNaGravacao(2, manter, "fim"), 2, "e o fim, com o anterior");
  assert.equal(tempoNaGravacao(-1, manter), 0);
  assert.equal(tempoNaGravacao(99, manter), 10);
  // Corte novo tira [3, 5]: o instante 2,5 do tempo antigo (gravação 3,5) não existe mais.
  const novo = [{ de: 0, ate: 2 }, { de: 6.5, ate: 10 }];
  assert.equal(reprojetarNoTempo(2.5, manter, novo, { estrito: true }), null);
  assert.equal(reprojetarNoTempo(2.5, manter, novo), 2, "sem `estrito`, cai no começo do pedaço seguinte");
  assert.equal(reprojetarNoTempo(5, manter, novo), 3, "gravação 7 vira 3 no tempo novo");
});

test("o mapa exato: a mesma palavra da gravação, null para a que saiu", () => {
  assert.deepEqual(mapaExatoEntreFalas([10, 11, 12, 13, 20], [11, 13, 15, 20]), [null, 0, null, 1, 3]);
  assert.deepEqual(mapaExatoEntreFalas([], [1, 2]), []);
});

// ─────────────────────────────── a jornada acompanha o corte ───────────────────────────────

test("os elementos da jornada vão para a fala nova pela palavra da gravação (começo, meio, fim e devolvido)", () => {
  const { palavras, dur } = gravacao();
  // A limpeza da IA tirou a palavra 50 (um gaguejo).
  const remocoesDaIA = [{ de: palavras[50].inicio - 0.05, ate: palavras[50].fim + 0.05, motivo: "gaguejo" }];
  for (const p of palavras) p.ia = motivoDaIA(p, remocoesDaIA);
  const manterVelho = complemento(remocoesDaIA, dur);
  const velhos = indicesNaFala(palavras, manterVelho);
  assert.ok(!velhos.includes(50));
  const falaVelha = falaDe(palavras, velhos, manterVelho);
  const posVelha = (i: number) => velhos.indexOf(i);
  const frasesVelhas = frasesDaFala(falaVelha);
  const elemento = (id: string, palavra: number, custoUsd = 0.06): ElementoProposto => {
    const k = posVelha(palavra);
    const f = frasesVelhas.find((x) => k >= x.de && k <= x.ate)!;
    return {
      id,
      momento: { indice: f.indice, de: f.inicio, ate: f.fim, frase: f.texto },
      gatilho: { palavra: `p${palavra}`, indice: k, t: falaVelha[k].inicio },
      descricao: `elemento na palavra ${palavra}`,
      textoNaImagem: null,
      midia: "imagem",
      formato: "janela",
      porque: "",
      custoUsd,
      origem: "ia",
      papel: "elemento",
    };
  };
  const elementos = [elemento("el4", 10), elemento("el5", 60), elemento("el1", 100), elemento("el2", 130), elemento("el3", 160)];
  const leitura: LeituraDoVideo = {
    versao: 1, genero: "pessoa-falando", generoConfianca: 0.9, cenario: "escritório", formato: "16:9", pessoas: [], resumo: "", fontes: { medicao: true, visao: null }, custoUsd: 0,
    trechos: [
      { de: 0, ate: 5, pessoasEmCena: [], movimento: "parado", acontece: "abertura", mostra: [], falaDe: "", areaLivre: [] },
      { de: 40, ate: 48, pessoasEmCena: [], movimento: "parado", acontece: "meio", mostra: [], falaDe: "", areaLivre: [], pontos: [{ t: 44, caixa: { x: 0, y: 0, w: 0.1, h: 0.1 }, oQue: "slide" }] },
    ],
  };
  const plano = { versao: 1 as const, edicaoId: "e1", estiloDoCliente: "", densidade: { segundosEntreElementos: [5, 8] as [number, number], porque: "" }, elementos, custoTotalUsd: 0.3, feitoEm: "x", formato: "16:9" as const, duracao: falaVelha.at(-1)!.fim };
  const estado: EstadoDaJornada = aprovarJornada({ versao: 1, edicaoId: "e1", leitura, amostras: [{ t: 2, rostos: [], corpos: [] }, { t: 44, rostos: [], corpos: [] }], plano, revisao: {}, aprovado: null, avisos: [] }, "2026-10-08T00:00:00.000Z");

  // O CLIENTE: começa na palavra 16 (tira as duas primeiras frases), termina na 191 (tira a última),
  // tira a frase inteira de 128 a 135, tira só a palavra 160 e devolve o gaguejo (50) que a IA tirou.
  const atual = escolhaDoCompleto(palavras, manterVelho);
  assert.equal(atual.comecar, 0);
  assert.equal(atual.terminar, 199);
  assert.deepEqual(atual.fora, [50], "o que a IA tirou aparece fora");
  const fora = [128, 129, 130, 131, 132, 133, 134, 135, 160];
  const escolha = { comecar: 16, terminar: 191, fora, finoInicio: 0, finoFim: 0 };
  const calc = calcularCorte(palavras, remocoesDaIA, escolha, dur);
  const manterNovo = manterDoCompletoNoAr(calc, palavras);
  const novos = indicesNaFala(palavras, manterNovo);
  assert.deepEqual(novos, [...palavrasNaFala(palavras, calc)], "a tela e o servidor contam a fala do mesmo jeito");
  assert.ok(novos.includes(50), "o devolvido entra");
  assert.ok(!novos.includes(160) && !novos.includes(130) && !novos.includes(10));
  const falaNova = falaDe(palavras, novos, manterNovo);
  const mapa = mapaExatoEntreFalas(velhos, novos);

  const { estado: e, sairam, movidos } = levarJornadaParaFalaNova(estado, { mapa, falaVelha, falaNova, manterVelho, manterNovo, agora: "2026-10-08T10:00:00.000Z" });
  assert.deepEqual(sairam.map((s) => s.id).sort(), ["el2", "el4"], "o momento inteiro saiu: o elemento sai");
  assert.ok(movidos >= 3);
  for (const id of ["el2", "el4"]) {
    assert.equal(e.revisao[id].acao, "removido");
    assert.ok(e.revisao[id].pedidos.some((p) => p.texto === MOTIVO_DA_FALA_CORTADA));
  }
  assert.ok((e.avisos ?? []).some((a) => /a fala dele foi cortada por você/.test(a)));
  const naGravacao = (el: ElementoProposto) => novos[el.gatilho.indice];
  const frasesNovas = frasesDaFala(falaNova);
  for (const lista of [e.plano!.elementos, e.aprovado!.elementos]) {
    assert.deepEqual(lista.map((x) => x.id), ["el5", "el1", "el3"], "plano e aprovado andam juntos");
    const porId = new Map(lista.map((x) => [x.id, x]));
    assert.equal(naGravacao(porId.get("el1")!), 100, "a mesma palavra da gravação depois do corte do começo");
    assert.equal(naGravacao(porId.get("el5")!), 60, "a palavra devolvida antes dele não o empurra para o lado errado");
    assert.equal(naGravacao(porId.get("el3")!), 161, "a palavra do gatilho saiu: a viva mais perto no mesmo momento, a de depois");
    assert.equal(porId.get("el3")!.gatilho.palavra, "p161");
    for (const el of lista) {
      const f = frasesNovas[el.momento.indice];
      assert.ok(el.gatilho.indice >= f.de && el.gatilho.indice <= f.ate, `${el.id}: o momento é a frase da fala nova que tem o gatilho`);
      assert.equal(el.momento.de, f.inicio);
      assert.equal(el.gatilho.t, falaNova[el.gatilho.indice].inicio);
    }
  }
  assert.equal(e.plano!.custoTotalUsd, 0.18, "o custo dos que saíram sai do total");
  // A leitura: o trecho do começo (cortado) sai; o do meio passa pela gravação.
  assert.equal(e.leitura!.trechos.length, 1);
  const t = e.leitura!.trechos[0];
  assert.equal(t.acontece, "meio");
  assert.equal(t.de, tempoEditado(tempoNaGravacao(40, manterVelho)!, manterNovo));
  assert.equal(t.pontos?.[0].t, tempoEditado(tempoNaGravacao(44, manterVelho)!, manterNovo));
  assert.deepEqual(e.amostras!.map((a) => a.t), [tempoEditado(tempoNaGravacao(44, manterVelho)!, manterNovo)], "a amostra do quadro cortado não existe mais");
  // O de entrada não foi tocado.
  assert.equal(estado.plano!.elementos.length, 5);
});

test("conta exata contra alinhamento de texto: tirar 150 palavras do começo", () => {
  // Fala de vocabulário curto (o "que", "e", "o" que o alinhamento casa do lado errado).
  const vocab = ["que", "e", "o", "a", "de", "não", "um", "para"];
  let semente = 7;
  const aleatorio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const n = 3000;
  const velhos = Array.from({ length: n }, (_, i) => i);
  const texto = velhos.map(() => vocab[Math.floor(aleatorio() * vocab.length)]);
  const novos = velhos.slice(150);
  const exato = mapaExatoEntreFalas(velhos, novos);
  // Exato: toda palavra que ficou vai para a mesma palavra da gravação, e as 150 saem.
  assert.equal(exato.filter((x) => x === null).length, 150);
  assert.ok(exato.every((x, i) => x === null || novos[x] === velhos[i]));
  // O alinhamento por texto (mapaDePalavras) erra palavras depois do corte: é o que o mapa de 08/10 mediu.
  const P = (idx: number[]) => idx.map((i) => ({ texto: texto[i], inicio: i, fim: i + 0.5 }));
  const porTexto = mapaDePalavras(P(velhos), P(novos));
  let erradas = 0;
  for (let i = 150; i < n; i++) if (novos[porTexto[i]] !== velhos[i]) erradas++;
  assert.ok(erradas > 0, `o alinhamento por texto errou ${erradas} palavras`);
});

// ─────────────────────────────── as contas do completo ───────────────────────────────

test("o completo: a escolha de hoje é lida do que está no ar, e calcular de novo dá o mesmo", () => {
  const { palavras, dur } = gravacao(80);
  const remocoesDaIA = [{ de: 0, ate: palavras[0].inicio - 0.15, motivo: "silêncio antes de começar" }, { de: palavras[79].fim + 0.3, ate: dur, motivo: "silêncio no fim" }];
  for (const p of palavras) p.ia = motivoDaIA(p, remocoesDaIA);
  const manter = complemento(remocoesDaIA, dur);
  const atual = escolhaDoCompleto(palavras, manter);
  const calc = calcularCorte(palavras, remocoesDaIA, atual, dur);
  assert.ok(iguais(manterDoCompletoNoAr(calc), manter, 0.06), "a leitura do que está no ar volta ao mesmo vídeo");
  assert.ok(mesmaEscolha(escolhaDoCompleto(palavras, manterDoCompletoNoAr(calc)), atual), "ler de novo dá a mesma escolha");
});

test("o completo: tirar o começo, o fim e um trecho do meio vira o complemento exato do que o player toca", () => {
  const { palavras, dur } = gravacao(80);
  const remocoesDaIA = [{ de: palavras[30].inicio - 0.05, ate: palavras[30].fim + 0.05, motivo: "muleta" }];
  for (const p of palavras) p.ia = motivoDaIA(p, remocoesDaIA);
  const calc = calcularCorte(palavras, remocoesDaIA, { comecar: 8, terminar: 71, fora: [40, 41, 42, 43, 44, 45, 46, 47, 30], finoInicio: -0.2, finoFim: 0.3 }, dur);
  const manter = manterDoCompletoNoAr(calc, palavras);
  const remocoes = remocoesDoCompleto(calc, dur, palavras);
  assert.equal(remocoes[0].de, 0, "o começo escolhido vira remoção a partir do zero");
  assert.equal(remocoes[0].motivo, "antes do começo escolhido");
  assert.ok(Math.abs(remocoes.at(-1)!.ate - dur) < 1e-6, "e o fim, remoção até a duração");
  assert.equal(remocoes.at(-1)!.motivo, "depois do fim escolhido");
  assert.ok(iguais(complemento(remocoes, dur), manter, 1e-6), "o worker emenda exatamente o que o player tocou");
  assert.ok(remocoes.some((r) => r.motivo === "pedido do cliente"), "o trecho do meio é do cliente");
  const naFala = palavrasNaFala(palavras, calc);
  assert.ok(!naFala.has(7) && naFala.has(8) && !naFala.has(44) && !naFala.has(30) && naFala.has(71) && !naFala.has(72));
  // O aviso antes de aplicar: o elemento cujo momento saiu inteiro.
  const elementos = [
    { id: "a", descricao: "no trecho tirado", gatilho: 42, palavras: [40, 41, 42, 43, 44, 45, 46, 47], t: palavras[42].inicio },
    { id: "b", descricao: "meio tirado", gatilho: 50, palavras: [44, 45, 50, 51], t: palavras[50].inicio },
  ];
  assert.deepEqual(elementosQueSaem(elementos, naFala).map((e) => e.id), ["a"]);
});

// ─────────────────────────────── o que anda junto com a fala ───────────────────────────────

test("a abertura e as sugestões vão para a fala nova; o momento cortado sai", () => {
  const mapa = [null, null, 0, 1, 2, null, 3, 4, 5];
  const novas = Array.from({ length: 6 }, (_, k) => ({ inicio: k, fim: k + 0.8 }));
  const a = moverAbertura(
    { momentos: [{ de: 2, ate: 4, inicio: 2, fim: 4.8, frase: "x", soco: "X" }, { de: 4, ate: 6, inicio: 4, fim: 6.8, frase: "y", soco: "Y" }], reservas: [{ de: 7, ate: 8, inicio: 7, fim: 8.8, frase: "z", soco: "Z" }], feitoEm: "x" },
    mapa,
    novas
  );
  assert.deepEqual(a.momentos.map((m) => [m.de, m.ate]), [[0, 2]], "a frase com palavra cortada sai da abertura (ela repete a frase como foi dita)");
  assert.deepEqual(a.reservas.map((m) => [m.de, m.ate]), [[4, 5]]);
  assert.deepEqual(levarTrecho({ de: 0, ate: 5, inicio: 0, fim: 5.8, texto: "s" }, mapa, novas), { de: 0, ate: 2, inicio: 0, fim: 2.8, texto: "s" });
  assert.equal(levarTrecho({ de: 0, ate: 1, inicio: 0, fim: 1.8 }, mapa, novas), null);
});

// ─────────────────────────────── a refação depois da entrega ───────────────────────────────

test("a base do corte entra na fila sem tirar o editado do ar; pronto fecha, falha volta tudo", () => {
  const cdc = (refazendo: CompletoDoCliente["refazendo"]): CompletoDoCliente => ({ manter: [{ de: 1, ate: 9 }], remocoes: [], doCliente: [], mantidosPeloUsuario: [], refacoes: 1, ultima: null, refazendo });
  const roteiroAntes = { versao: 1, remocoes: [], completoDoCliente: null, marca: "antes" } as Record<string, unknown>;
  const refazendo = { em: "t0", base: null, refacao: 1, creditos: 0, userId: "u1", roteiroAnterior: roteiroAntes };
  const noAr = { estado: "pronto", desde: "d0", montadoUrl: "https://blob/completo-editado-1.mp4", fala: { palavras: [], duracao: 9 }, roteiro: { versao: 1, marca: "depois", completoDoCliente: cdc(refazendo) } };
  assert.equal(editadoNoAr(noAr, "https://blob/completo-editado-1.mp4"), true);
  assert.equal(editadoNoAr(noAr, "https://blob/base.mp4"), false, "com a base no ar, o corte vai ao ar como sempre");

  const fila = montagemDoRecorte(noAr, { url: "https://blob/base-nova.mp4", bytes: 10 }, { origem: "h", agora: "d1" }) as Record<string, any>;
  assert.equal(fila.estado, "na-fila");
  assert.equal(fila.baseUrl, "https://blob/base-nova.mp4");
  assert.deepEqual(fila.completoOriginal, { url: "https://blob/base-nova.mp4", bytes: 10 }, "a próxima refeita parte da base com o corte");
  assert.equal(fila.montadoUrl, "https://blob/completo-editado-1.mp4", "o editado de antes continua sendo o que está no ar");
  assert.equal(fila.roteiro.completoDoCliente.refazendo.base, "https://blob/base-nova.mp4");
  assert.equal(fila.recorteDoCliente.anterior.estado, "pronto");
  assert.equal(fila.recorteDoCliente.anterior.roteiro, undefined, "o estado guardado não carrega o roteiro duas vezes");

  // No meio do caminho, nada muda.
  const andando = { ...fila, estado: "dirigindo", desde: "d2" };
  assert.equal(estadoComRecorte(andando as any).estado, andando);

  // Pronto: a marca e o roteiro anterior saem.
  const pronto = estadoComRecorte({ ...fila, estado: "pronto", desde: "d3", montadoUrl: "https://blob/completo-editado-2.mp4" } as any);
  assert.equal(pronto.desfeito, null);
  assert.equal((pronto.estado as any).recorteDoCliente, null);
  assert.equal((pronto.estado as any).roteiro.completoDoCliente.refazendo, null);
  assert.equal((pronto.estado as any).montadoUrl, "https://blob/completo-editado-2.mp4");

  // Falha: volta o estado de antes (o editado no ar, o roteiro de antes) e a refação é devolvida.
  const falhou = estadoComRecorte({ ...fila, estado: "sem-montagem", desde: "d4", motivo: "render quebrou", falhaTecnica: true } as any);
  const voltou = falhou.estado as any;
  assert.equal(falhou.desfeito?.refacao, 1);
  assert.equal(falhou.voltou, true);
  assert.equal(voltou.estado, "pronto");
  assert.equal(voltou.desde, "d4", "o desde é novo: o card vê a troca");
  assert.equal(voltou.montadoUrl, "https://blob/completo-editado-1.mp4");
  assert.equal(voltou.motivo, MOTIVO_DO_CORTE_QUE_NAO_SAIU);
  assert.equal(voltou.roteiro.marca, "antes", "o roteiro volta ao de antes do corte");
  assert.equal(voltou.roteiro.completoDoCliente.naoSaiu.motivo, "render quebrou", "e o controle diz que o último corte não saiu");
  assert.equal(voltou.recorteDoCliente, null);
  assert.equal(voltou.recorteQueNaoSaiu.motivo, "render quebrou");

  // Sem nada de corte, a troca é a de sempre.
  const comum = { estado: "sem-montagem", desde: "d5" };
  assert.deepEqual(estadoComRecorte(comum as any), { estado: comum, desfeito: null, voltou: false });
  assert.equal(comCorteQueNaoSaiu(null, { em: "x", motivo: null }), null);
});

// ─────────────────────────────── a guarda da fala ───────────────────────────────

test("a guarda da fala protege o que o cliente devolveu no completo", () => {
  const antes = process.env.GUARDA_DA_FALA;
  delete process.env.GUARDA_DA_FALA;
  try {
    assert.equal(pedidoDaGuarda("v1", "base do completo", "https://app", "completo")!.url, "https://app/api/videos/v1/guarda-da-fala?completo=1");
    assert.equal(pedidoDaGuarda("v1", "corte 2", "https://app", 2)!.url, "https://app/api/videos/v1/guarda-da-fala?corte=2");
    assert.equal(pedidoDaGuarda("v1", "completo editado", "https://app")!.url, "https://app/api/videos/v1/guarda-da-fala");
  } finally {
    if (antes !== undefined) process.env.GUARDA_DA_FALA = antes;
  }
  assert.equal(alvoDaGuarda(new URLSearchParams("completo=1")), "completo");
  assert.equal(alvoDaGuarda(new URLSearchParams("")), "completo", "o editado e o sob medida do completo vêm sem marca desde 03/10");
  assert.equal(alvoDaGuarda(new URLSearchParams("corte=3")), 3);
  assert.equal(alvoDaGuarda(new URLSearchParams("corte=x")), "completo");
});

// ─────────────────────────────── a prova, no código ───────────────────────────────

test("no código: cada ponta usa o registro próprio do completo, e a base do corte não troca o editado", () => {
  const pedido = ler("lib/media/pedido-de-corte.ts");
  assert.match(pedido, /remocoes: remocoesDoCompleto\.map/, "o corpo `remocoes` do completo é o do cliente");
  assert.match(pedido, /pedidoDaGuarda\(video\.id, "base do completo", opcoes\.appUrl, "completo"\)/);
  assert.match(pedido, /intervalosDoTrecho\(remocoes, inicio, fim, palavras\)/, "os trechos continuam com a limpeza de sempre");
  assert.match(ler("app/api/videos/[id]/cortar/route.ts"), /remocoesDoCompleto: aprovado\?\.completoDoCliente\?\.remocoes/);
  assert.match(ler("lib/media/pedido-do-completo.ts"), /remocoesDoCompleto: doCliente,/);
  assert.match(ler("app/api/videos/[id]/refazer-completo/route.ts"), /corpoDoSoCompleto\(/);
  const cb = ler("app/api/videos/[id]/cortar-callback/route.ts");
  const recebe = cb.indexOf("receberBaseDoCorteDoCompleto(id");
  const troca = cb.indexOf("completoUrl: atrasado.completo.url");
  assert.ok(recebe > 0 && troca > recebe, "a base do corte é tratada antes de qualquer troca do completoUrl");
  assert.ok(cb.indexOf("desfazerCorteDoCompletoSemBase(id, atrasado.erros") > 0, "o completo que não veio desfaz o corte em vez de gravar erro");
  assert.match(ler("lib/media/montagem-do-completo.ts"), /const \{ estado: novo, desfeito, voltou \} = estadoComRecorte\(pedido\)/);
  assert.match(ler("lib/media/roteiro-da-edicao.ts"), /if \(r\.completoDoCliente\?\.manter\?\.length\) return r\.completoDoCliente\.manter;/);
  assert.match(ler("app/api/videos/[id]/guarda-da-fala/route.ts"), /mantidosDoCompleto\(id\)/);
});
