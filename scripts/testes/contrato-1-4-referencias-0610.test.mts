// Contrato versão 1.4 (06/10/2026): sai a garantia de 30 dias, fica só o
// arrependimento de 7 dias, e as cláusulas 9 a 24 viram 8 a 23. Confere toda
// referência "cláusula N.N" do modelo contra a cláusula que existe e o assunto
// dela, as anotações de revisão, e que contrato já enviado continua no modelo
// com que saiu. Sem banco: só o modelo em Markdown e os módulos puros.
// Rodar: npx tsx --test scripts/testes/contrato-1-4-referencias-0610.test.mts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const { limparAnotacoes, lerModelo, lerModeloDaVersao, versaoDoModelo, montarTexto, clausulaDoCancelamento, ModeloNaoGuardado } = await import("@/lib/contratos/modelo");

const BRUTO = readFileSync("lib/contratos/modelos/condicoes-gerais.md", "utf8").replace(/\r\n/g, "\n");

/** As cláusulas do modelo: "7" (título) e "7.3" (item), cada uma com o seu texto. */
function clausulas(md: string): Map<string, string> {
  const mapa = new Map<string, string>();
  let atual: string | null = null;
  for (const linha of md.split("\n")) {
    const t = linha.match(/^## (\d+)\. (.+)$/);
    if (t) {
      atual = t[1];
      mapa.set(t[1], t[2]);
      continue;
    }
    if (/^## /.test(linha)) {
      atual = null;
      continue;
    }
    const i = linha.match(/^\*\*(\d+)\.(\d+)\.(.*)$/);
    if (i) {
      atual = `${i[1]}.${i[2]}`;
      mapa.set(atual, i[3]);
      continue;
    }
    if (atual && atual.includes(".")) mapa.set(atual, `${mapa.get(atual)}\n${linha}`);
  }
  return mapa;
}

const NUM = String.raw`\d+(?:\.\d+)?(?:\([a-z]\))?`;
/** Toda referência "cláusula(s) N.N[, N.N e N.N | a N.N]" do texto, número por número. */
function referencias(md: string): Array<{ alvo: string; trecho: string }> {
  const lista = new RegExp(String.raw`cl[aá]usulas?\s+(${NUM}(?:(?:,\s*|\s+e\s+|\s+a\s+)${NUM})*)`, "gi");
  const saida: Array<{ alvo: string; trecho: string }> = [];
  for (const m of md.matchAll(lista)) for (const alvo of m[1].match(new RegExp(NUM, "g")) ?? []) saida.push({ alvo, trecho: m[0] });
  return saida;
}

/**
 * O ASSUNTO DE CADA CLÁUSULA CITADA, na numeração da 1.4. Toda referência do
 * texto tem de cair numa destas, e a cláusula tem de falar disso. Referência
 * nova a uma cláusula fora da lista faz o teste falhar de propósito: alguém
 * confere o assunto e acrescenta aqui.
 */
const ASSUNTO: Record<string, RegExp> = {
  "1.1(p)": /Intera[cç][oõ]es\*\*/,
  "1.1(r)": /Biblioteca de Design\*\*/,
  "3": /^OBJETO/,
  "3.6": /melhorar, alterar ou substituir funcionalidades/,
  "4.8": /ajustar quantos Cr[eé]ditos/,
  "4.9": /Acessos extras/,
  "5.3": /desist[eê]ncia da renova[cç][aã]o/,
  "5.4": /Reajuste anual/,
  "6.5": /Valores em atraso/,
  "7": /^DIREITO DE ARREPENDIMENTO \(7 DIAS\)$/,
  "7.3": /Benef[ií]cios Presenciais s[oó] s[aã]o agendados ou emitidos a partir do 8º/,
  "8": /^CANCELAMENTO E RESCIS[AÃ]O$/,
  "8.2": /Rescis[aã]o antecipada pelo Cliente/,
  "8.5": /Rescis[aã]o pelo Cliente sem multa/,
  "8.5(b)": /\(b\) a disponibilidade mensal/,
  "8.5(c)": /\(c\) houver altera[cç][aã]o destas Condi[cç][oõ]es/,
  "8.6": /Rescis[aã]o pela Demandou por inadimplemento/,
  "8.7": /Rescis[aã]o pela Demandou por viola[cç][aã]o/,
  "8.8": /Na rescis[aã]o por viola[cç][aã]o/,
  "8.9": /Descontinua[cç][aã]o pela Demandou/,
  "8.11": /Efeitos do encerramento/,
  "9": /^CONTE[UÚ]DO E RESPONSABILIDADE DO CLIENTE$/,
  "9.9": /Ressarcimento/,
  "10": /^INTELIG[EÊ]NCIA ARTIFICIAL$/,
  "10.4": /Propriedade do Conte[uú]do Gerado/,
  "10.5": /Licen[cç]a [aà] Demandou/,
  "10.6": /Sem treino de modelos/,
  "10.7": /dados de uso agregados/,
  "10.9": /Mem[oó]ria do Projeto/,
  "10.10": /Melhoria da Plataforma a partir das Intera[cç][oõ]es/,
  "10.10(d)": /\(d\) os trechos s[aã]o guardados por at[eé] 24/,
  "10.11": /Oposi[cç][aã]o/,
  "11": /^G[EÊ]MEO DIGITAL$/,
  "12.2(d)": /\(d\) \*\*Melhoria da Plataforma e Biblioteca de Design\*\*/,
  "12.9": /Elimina[cç][aã]o ao fim do contrato/,
  "13": /^INTEGRA[CÇ][OÕ]ES COM REDES SOCIAIS/,
  "14": /^DISPONIBILIDADE, MANUTEN[CÇ][AÃ]O E SUPORTE$/,
  "15.1": /Teto/,
  "15.2": /Danos exclu[ií]dos/,
  "15.3": /Exce[cç][oõ]es/,
  "16.4": /Biblioteca de Design\.\*\*/,
  "16.7": /Retirada e modelo s[oó] do Cliente/,
  "16.8": /Uso da galeria pelo Cliente/,
  "17": /^BENEF[IÍ]CIOS PRESENCIAIS: DEMANDA DAY E DEMANDA CAST$/,
  "17.2(a)": /\(a\) s[aã]o liberados a partir do 8º \(oitavo\) dia/,
  "17.4": /Se o Demanda Day n[aã]o acontecer/,
  "21": /^ALTERA[CÇ][OÕ]ES DESTAS CONDI[CÇ][OÕ]ES$/,
};

/** O texto da cláusula citada; para "8.5(b)", o da 8.5; para "1.1(p)", o da 1.1. */
function textoDoAlvo(mapa: Map<string, string>, alvo: string): string | undefined {
  return mapa.get(alvo.replace(/\([a-z]\)$/, ""));
}

test("versão 1.4, de 06/10/2026, no topo do modelo", () => {
  assert.equal(versaoDoModelo(BRUTO), "Versão 1.4, de 06 de outubro de 2026");
  assert.equal(versaoDoModelo(lerModelo()), "Versão 1.4, de 06 de outubro de 2026");
});

test("as cláusulas vão de 1 a 23, sem buraco, e cada item segue a ordem", () => {
  const titulos = [...BRUTO.matchAll(/^## (\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(titulos, Array.from({ length: 23 }, (_, i) => i + 1));
  const mapa = clausulas(BRUTO);
  for (const n of titulos) {
    const itens = [...mapa.keys()].filter((k) => k.startsWith(`${n}.`)).map((k) => Number(k.split(".")[1]));
    assert.deepEqual(itens, itens.map((_, i) => i + 1), `itens da cláusula ${n} fora de ordem: ${itens}`);
  }
});

test("a garantia de 30 dias saiu inteira; o arrependimento de 7 dias ficou", () => {
  const limpo = limparAnotacoes(BRUTO);
  assert.doesNotMatch(limpo, /garantia de 30|GARANTIA DE 30|31º|trig[eé]simo primeiro|sem nenhuma pe[cç]a publicada/i);
  assert.doesNotMatch(limpo, /garantia (pr[oó]pria|desta cl[aá]usula|contratual)/i);
  assert.match(limpo, /## 7\. DIREITO DE ARREPENDIMENTO \(7 DIAS\)/);
  assert.match(limpo, /art\. 49 do C[oó]digo de Defesa do Consumidor/);
  assert.match(limpo, /\*\*8\.2\. Rescis[aã]o antecipada pelo Cliente\.\*\* Depois do prazo da cl[aá]usula 7, se/);
  assert.match(limpo, /reembolsos devidos pelas cl[aá]usulas 5\.3, 7 e 8\./);
  assert.match(limpo, /Se o mesmo pedido for feito dentro dos 7 primeiros dias \(cl[aá]usula 7\), o reembolso [eé] integral/);
});

test("toda referência 'cláusula N.N' aponta para cláusula que existe, com o assunto certo", () => {
  const mapa = clausulas(BRUTO);
  const refs = referencias(BRUTO);
  assert.ok(refs.length > 60, `poucas referências achadas (${refs.length})`);
  const erros: string[] = [];
  for (const { alvo, trecho } of refs) {
    const texto = textoDoAlvo(mapa, alvo);
    if (texto === undefined) {
      erros.push(`"${trecho}": a cláusula ${alvo} não existe`);
      continue;
    }
    const assunto = ASSUNTO[alvo];
    if (!assunto) {
      erros.push(`"${trecho}": a cláusula ${alvo} não está na tabela de assuntos do teste (confira e acrescente)`);
      continue;
    }
    if (!assunto.test(texto)) erros.push(`"${trecho}": a cláusula ${alvo} não fala de ${assunto} (diz: ${texto.slice(0, 90)})`);
  }
  assert.deepEqual(erros, []);
});

test("nenhuma referência sobrou com a numeração antiga (24 não existe; 9.10, 9.11 e 13.10 eram da 1.3)", () => {
  const alvos = new Set(referencias(BRUTO).map((r) => r.alvo));
  for (const velho of ["24", "22", "18", "9.2", "9.5", "9.6", "9.7", "9.8", "11.9", "11.10", "13.9", "17.8"]) {
    assert.ok(!alvos.has(velho), `ainda há referência à cláusula ${velho}`);
  }
});

test("anotações: as da 1.3 continuam, a da 1.4 entrou, e nenhuma vai para o cliente", () => {
  const notas = BRUTO.match(/\[REVISAR COM ADVOGADO[^\]]*\]/g) ?? [];
  const da13 = readFileSync("lib/contratos/modelos/historico/condicoes-gerais-1.3.md", "utf8").match(/\[REVISAR COM ADVOGADO[^\]]*\]/g) ?? [];
  assert.equal(notas.length, da13.length + 3, "esperava as notas da 1.3 mais 3 da 1.4 (topo, 7.3 e Anexo III)");
  assert.ok(notas.some((n) => /vers[aã]o 1\.4 retira a garantia de 30 dias/.test(n)));
  assert.ok(notas.some((n) => /vers[aã]o 1\.3 acrescenta/.test(n)));
  const limpo = lerModelo();
  assert.doesNotMatch(limpo, /\[(REVISAR|CONFIRMAR)/);
  assert.doesNotMatch(limpo, /ADVOGADO/);
});

test("nenhum travessão no modelo", () => {
  assert.ok(!BRUTO.includes("—"));
});

test("contrato novo sai na 1.4; o restante parcelado cita a cláusula 8.6 (inadimplemento)", () => {
  assert.equal(clausulaDoCancelamento(lerModelo()), "8");
  const t = montarTexto({
    numero: 9, empresa: "X", documento: "1", endereco: "R", representante: "A", email: "a@b.c", plano: "Pro", valorCentavos: 100, inicioVigencia: null, acessosExtras: 0,
    condicao: { entradaCentavos: 10, restanteCentavos: 90, parcelas: 3, parcelaCentavos: 30, formaDaEntrada: "pix", formaDoRestante: "cartao_recorrente", primeiraParcelaEm: null, links: { entrada: null, restante: "https://x/r" }, chavePix: null },
  });
  assert.equal(t.versao, "Versão 1.4, de 06 de outubro de 2026");
  assert.match(t.texto, /cl[aá]usulas 6\.5 e 8\.6\./);
  assert.doesNotMatch(t.texto, /GARANTIA DE 30 DIAS/);
});

test("contrato que já saiu fica no modelo com que saiu (1.2 e 1.3 guardados sem edição)", () => {
  // O conteúdo das versões guardadas não muda nunca: o hash dos contratos enviados depende dele.
  const sha = (f: string) => createHash("sha256").update(readFileSync(f, "utf8").replace(/\r\n/g, "\n")).digest("hex");
  assert.equal(sha("lib/contratos/modelos/historico/condicoes-gerais-1.2.md"), "927e9ab1c78e0cda615703e198a23d6431f1dea6c1d0e00eb6ac8588f93473dd");
  assert.equal(sha("lib/contratos/modelos/historico/condicoes-gerais-1.3.md"), "7c15923a7498dd60186d0ac68a239523b4f3d49c0481bc668fce66acd3faa65f");
  const v13 = lerModeloDaVersao("Versão 1.3, de 06 de outubro de 2026");
  assert.equal(versaoDoModelo(v13), "Versão 1.3, de 06 de outubro de 2026");
  assert.match(v13, /## 8\. GARANTIA DE 30 DIAS/);
  assert.equal(clausulaDoCancelamento(v13), "9");
  const v12 = lerModeloDaVersao("Versão 1.2, de 04 de outubro de 2026");
  assert.equal(versaoDoModelo(v12), "Versão 1.2, de 04 de outubro de 2026");
  // Sem versão gravada (rascunho que nunca saiu), vale o modelo do dia.
  assert.equal(versaoDoModelo(lerModeloDaVersao(null)), "Versão 1.4, de 06 de outubro de 2026");
  // Versão que não está guardada é recusada, nunca trocada por outra.
  assert.throws(() => lerModeloDaVersao("Versão 1.1, de 02 de outubro de 2026"), ModeloNaoGuardado);
  // O mesmo contrato montado na 1.3 dá o mesmo texto de antes (restante cita 9.6).
  const dados = {
    numero: 2, empresa: "X", documento: "1", endereco: "R", representante: "A", email: "a@b.c", plano: "Pro", valorCentavos: 100, inicioVigencia: null, acessosExtras: 0,
    condicao: { entradaCentavos: 10, restanteCentavos: 90, parcelas: 3, parcelaCentavos: 30, formaDaEntrada: "pix" as const, formaDoRestante: "cartao_recorrente" as const, primeiraParcelaEm: null, links: { entrada: null, restante: "https://x/r" }, chavePix: null },
  };
  const t13 = montarTexto(dados, v13);
  assert.match(t13.texto, /cl[aá]usulas 6\.5 e 9\.6\./);
  assert.equal(t13.versao, "Versão 1.3, de 06 de outubro de 2026");
});
