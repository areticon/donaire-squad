// A prova do estilo com uma fonte de verdade (06/10, relato do Bruno: "estou
// tentando mudar o estilo, mas ele mantém sempre o VOX"). O comando do vídeo
// manda; a escolha antiga só vale sem comando. Nada aqui toca banco, IA ou rede.
// Rodar: npx tsx --test scripts/testes/estilo-do-comando-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumoDaEdicao } from "@/lib/media/edicao-escolhida";
import { escolhaSincronizadaComComando, estiloIdDoComando, estiloQueVale, roteiroDeOutroComando } from "@/lib/media/estilo-do-comando";
import { CATALOGO_DE_ESTILOS, estiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { completoNaTela, listaDoCenaACena } from "@/lib/media/roteiro-em-texto";

// O projeto do relato: escolha antiga no Vox, comando novo na "Autoridade high ticket".
const escolhaVox = { estiloId: "vox", camera: ["dolly-in"], efeitos: ["recorte"], legenda: { modo: "sem" }, insercoesIA: true };
const comandoHighTicket = { texto: "Autoridade high ticket, luxo minimalista, preto e dourado.", referencia: "consorcio", origem: "referencia" };
const textoVox = "Explicativo editorial no estilo Vox, colagem de papel, recortes e mapas antigos.";

test("(a) o cabeçalho e os efeitos leem do comando, não da escolha antiga", () => {
  const r = resumoDaEdicao({ videoEstiloEscolha: escolhaVox, videoStyle: "editorial", comando: comandoHighTicket });
  assert.equal(r.estiloId, "consorcio");
  assert.equal(r.estilo, "Autoridade high ticket");
  assert.equal(r.doPadrao, false);
  assert.match(r.efeitos, /Autoridade high ticket/);
  assert.doesNotMatch(`${r.estilo} ${r.referencia} ${r.efeitos}`, /Vox|Explicativo editorial/);
  // A legenda continua vindo da escolha guardada (é dela).
  assert.match(r.legenda, /.+/);
});

test("(a) sem comando, a escolha antiga segue valendo (reserva)", () => {
  const r = resumoDaEdicao({ videoEstiloEscolha: escolhaVox, videoStyle: "editorial" });
  assert.equal(r.estiloId, "vox");
  assert.equal(r.doPadrao, true);
  assert.equal(estiloQueVale(null, escolhaVox, "editorial"), "vox");
});

test("(a) comando próprio, sem cartão, aparece como comando próprio e não como Vox", () => {
  const r = resumoDaEdicao({ videoEstiloEscolha: escolhaVox, videoStyle: "editorial", comando: { texto: "Tudo em neon verde, ritmo de videoclipe." } });
  assert.equal(r.estilo, "comando próprio do projeto");
  assert.match(r.referencia ?? "", /neon verde/);
  assert.doesNotMatch(r.efeitos, /Vox/);
});

test("(a) gravar o comando sincroniza a escolha antiga com o mesmo estilo, guardando legenda e inserções", () => {
  const s = escolhaSincronizadaComComando(comandoHighTicket, escolhaVox, "editorial");
  assert.ok(s);
  assert.equal(s.escolha.estiloId, "consorcio");
  assert.equal(s.videoStyle, estiloDoCatalogo("consorcio")!.base);
  assert.deepEqual(s.escolha.legenda, { modo: "sem" });
  assert.equal(s.escolha.insercoesIA, true);
  // Já igual: nada a gravar (idempotente).
  assert.equal(escolhaSincronizadaComComando(comandoHighTicket, s.escolha, s.videoStyle), null);
  // Comando próprio não mexe na escolha antiga.
  assert.equal(escolhaSincronizadaComComando({ texto: "qualquer coisa" }, escolhaVox, "editorial"), null);
  // Referência que não existe no catálogo também não.
  assert.equal(escolhaSincronizadaComComando({ texto: "x", referencia: "nao-existe" }, escolhaVox, "editorial"), null);
});

test("(b) o cartão \"Autoridade high ticket\" é o id consorcio do catálogo, e todo cartão tem id próprio", () => {
  const ht = CATALOGO_DE_ESTILOS.filter((e) => e.nome === "Autoridade high ticket");
  assert.equal(ht.length, 1);
  assert.equal(ht[0].id, "consorcio");
  assert.equal(estiloIdDoComando(comandoHighTicket), "consorcio");
  const ids = CATALOGO_DE_ESTILOS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, "id repetido no catálogo");
  const nomes = CATALOGO_DE_ESTILOS.map((e) => e.nome);
  assert.equal(new Set(nomes).size, nomes.length, "nome de cartão repetido no catálogo");
});

test("(c) roteiro planejado com outro comando fica marcado para refazer, com o botão", () => {
  assert.equal(roteiroDeOutroComando(comandoHighTicket, textoVox), true);
  assert.equal(roteiroDeOutroComando(comandoHighTicket, `  ${comandoHighTicket.texto.toUpperCase()} `), false, "mesmo texto com espaço e caixa diferentes não é troca");
  assert.equal(roteiroDeOutroComando(comandoHighTicket, null), false, "sem plano por comando, nada a refazer");
  assert.equal(roteiroDeOutroComando(null, textoVox), false);
  const r = resumoDaEdicao({ videoEstiloEscolha: escolhaVox, videoStyle: "editorial", comando: comandoHighTicket, comandoDoRoteiro: textoVox, estiloDoRoteiro: "vox" });
  assert.equal(r.refazerRoteiro, true);
  assert.match(r.planejadoEm ?? "", /Explicativo editorial/);
  const igual = resumoDaEdicao({ videoEstiloEscolha: escolhaVox, videoStyle: "editorial", comando: comandoHighTicket, comandoDoRoteiro: comandoHighTicket.texto, estiloDoRoteiro: "vox" });
  assert.equal(igual.refazerRoteiro, false);
  assert.equal(igual.planejadoEm, null);
});

test("nenhum texto novo da tela leva travessão", () => {
  const r = resumoDaEdicao({ videoEstiloEscolha: escolhaVox, videoStyle: "editorial", comando: comandoHighTicket, comandoDoRoteiro: textoVox });
  assert.doesNotMatch(JSON.stringify(r), /—/);
});

// (d) O cena a cena do completo não depende da abertura.
function falaDe(n: number) {
  const palavras = Array.from({ length: n }, (_, i) => ({ texto: i % 8 === 7 ? `fim${i}.` : `palavra${i}`, inicio: i * 0.5, fim: i * 0.5 + 0.4 }));
  return { palavras, duracao: n * 0.5 };
}

test("(d) cena a cena do completo com a abertura LIGADA é o mesmo que com ela desligada", () => {
  const fala = falaDe(400);
  const completo = { fala, blocos: [], plano: null, insercoes: 0, estiloId: "consorcio" };
  const momento = { de: 10, ate: 17, inicio: 5, fim: 8.9, frase: "frase forte", soco: "FORTE" };
  const ligada = { momentos: [momento], reservas: [], feitoEm: "2026-10-06T17:37:00Z" };
  const comAbertura = completoNaTela(completo as never, "sobrio", true, 200, { abertura: ligada as never });
  const semAbertura = completoNaTela(completo as never, "sobrio", true, 200, { abertura: { ...ligada, desligada: true } as never });
  assert.ok((comAbertura.trechos?.length ?? 0) > 0, "com a abertura ligada, o cena a cena aparece");
  assert.equal(comAbertura.abertura?.ativa, true);
  assert.deepEqual(comAbertura.trechos, semAbertura.trechos);
});

test("(d) num vídeo longo, as peças do comando contam como efeito: nada some do cena a cena", () => {
  const trechos = Array.from({ length: 30 }, (_, i) => ({ indice: i, cena: null, pecas: i % 3 === 0 ? [{ peca: "titulo" }] : undefined, sugestao: i === 4 ? "um zoom" : null }));
  const { lista, longo, comEfeito } = listaDoCenaACena(trechos as never[], null);
  assert.equal(longo, true);
  assert.equal(comEfeito, 11, "10 com peça e 1 com sugestão");
  assert.equal(lista.length, 11);
  assert.equal(listaDoCenaACena(trechos as never[], true).lista.length, 30);
  const todasComPeca = trechos.map((t) => ({ ...t, pecas: [{ peca: "titulo" }] }));
  assert.equal(listaDoCenaACena(todasComPeca as never[], null).lista.length, 30);
});
