/**
 * MONTA A VERSÃO 1.4 DAS CONDIÇÕES GERAIS a partir da 1.3 (06/10/2026).
 *
 *   node scripts/contratos-modelo-1.4.mjs
 *
 * Pedido do Bruno: sai a garantia de 30 dias (cláusula 8 da 1.3) e fica só o
 * direito de arrependimento de 7 dias do art. 49 do CDC (cláusula 7). As
 * cláusulas 9 a 24 viram 8 a 23, e toda referência cruzada ("cláusula 9.6",
 * "cláusulas 9.2, 9.5, 9.8 e 9.9", "17.4 a 17.8", "1.1(p)") é renumerada aqui,
 * por regra, e não à mão. A conferência fica em
 * scripts/testes/contrato-1-4-referencias-0610.test.mts.
 *
 * Lê a 1.3 guardada em lib/contratos/modelos/historico/condicoes-gerais-1.3.md
 * e grava lib/contratos/modelos/condicoes-gerais.md. Rodar de novo dá o mesmo
 * resultado.
 */
import { readFileSync, writeFileSync } from "node:fs";

const ORIGEM = "lib/contratos/modelos/historico/condicoes-gerais-1.3.md";
const DESTINO = "lib/contratos/modelos/condicoes-gerais.md";

let md = readFileSync(ORIGEM, "utf8").replace(/\r\n/g, "\n");

/** Troca exata, uma vez só; falha alto se o trecho não estiver lá. */
function trocar(de, para) {
  const n = md.split(de).length - 1;
  if (n !== 1) throw new Error(`Esperava achar 1 vez, achei ${n}: ${de.slice(0, 80)}`);
  md = md.replace(de, para);
}

const NOTA_14 = "[REVISAR COM ADVOGADO ANTES DE ASSINAR: mudança da versão 1.4, de 06/10/2026, com a retirada da garantia de 30 dias, ainda sem revisão jurídica.]";

// 1. Ajustes de conteúdo, ainda na numeração da 1.3.
trocar(
  "**7.3.** Para que o arrependimento não se confunda com uso, os Benefícios Presenciais só são agendados ou emitidos a partir do 8º (oitavo) dia da contratação.",
  `**7.3.** Para que o arrependimento não se confunda com uso, os Benefícios Presenciais só são agendados ou emitidos a partir do 8º (oitavo) dia da contratação, depois de encerrado o prazo de arrependimento. ${NOTA_14}`,
);
trocar(
  "**9.2. Rescisão antecipada pelo Cliente.** Depois dos prazos das cláusulas 7 e 8, se o Cliente",
  "**9.2. Rescisão antecipada pelo Cliente.** Depois do prazo da cláusula 7, se o Cliente",
);
trocar(
  "Também não limitam os reembolsos devidos pelas cláusulas 5.3, 7, 8 e 9.",
  "Também não limitam os reembolsos devidos pelas cláusulas 5.3, 7 e 9.",
);
trocar(
  "(a) são liberados conforme as cláusulas 7.3 e 8.5;",
  "(a) são liberados a partir do 8º (oitavo) dia da contratação, conforme a cláusula 7.3;",
);
trocar(
  "Se o mesmo pedido for feito dentro dos 7 primeiros dias (cláusula 7), ou dentro de 30 dias sem nenhuma peça publicada (cláusula 8), o reembolso é integral: R$ 47.964,00.",
  `Se o mesmo pedido for feito dentro dos 7 primeiros dias (cláusula 7), o reembolso é integral: R$ 47.964,00. ${NOTA_14}`,
);

// 2. A cláusula 8 sai inteira (do título até o título da 9).
const ini = md.indexOf("## 8. GARANTIA DE 30 DIAS");
const fim = md.indexOf("## 9. CANCELAMENTO E RESCISÃO");
if (ini < 0 || fim < ini) throw new Error("Não achei a cláusula 8 da 1.3.");
md = md.slice(0, ini) + md.slice(fim);
if (/garantia de 30|31º|trigésimo primeiro/i.test(md.replace(/\[REVISAR[^\]]*\]/g, ""))) throw new Error("Sobrou menção à garantia de 30 dias.");

// 3. Renumeração: toda cláusula de 9 a 24 desce um número.
const novo = (n) => (n >= 9 ? n - 1 : n);
// Títulos "## 9. CANCELAMENTO" e marcadores "**9.1.**" / "**9.1. Nome.**".
md = md.replace(/^## (\d+)\. /gm, (_, n) => `## ${novo(Number(n))}. `);
md = md.replace(/^\*\*(\d+)\.(\d+)\./gm, (_, n, m) => `**${novo(Number(n))}.${m}.`);
// Referências: "cláusula(s)" seguido de uma lista de números ("9.2, 9.5, 9.8 e 9.9",
// "17.4 a 17.8", "9.5(b)", "1.1(p) a 1.1(r)", "18").
const NUM = String.raw`\d+(?:\.\d+)?(?:\([a-z]\))?`;
const LISTA = new RegExp(String.raw`(cl[aá]usulas?\s+)(${NUM}(?:(?:,\s*|\s+e\s+|\s+a\s+)${NUM})*)`, "gi");
md = md.replace(LISTA, (_, palavra, lista) => palavra + lista.replace(new RegExp(NUM, "g"), (tok) => tok.replace(/^\d+/, (n) => String(novo(Number(n))))));

// 4. Versão e anotação da mudança (a da 1.3 fica, já renumerada).
trocar("Versão 1.3, de 06 de outubro de 2026", "Versão 1.4, de 06 de outubro de 2026");
trocar(
  "[REVISAR COM ADVOGADO ANTES DE ASSINAR: a versão 1.3 acrescenta",
  "[REVISAR COM ADVOGADO ANTES DE ASSINAR: a versão 1.4 retira a garantia de 30 dias (o antigo item 8 da versão 1.3) e deixa só o direito de arrependimento de 7 dias do art. 49 do Código de Defesa do Consumidor (cláusula 7). Do antigo item 9 em diante, a numeração desce um número (o 9 vira 8, e assim até o 24, que vira 23), com as referências cruzadas renumeradas; mudam as cláusulas 7.3, 8.2, 15.3 e 17.2(a) e o Anexo III. Nada disso passou por advogado.]\n\n[REVISAR COM ADVOGADO ANTES DE ASSINAR: a versão 1.3 acrescenta",
);

if (md.includes("—")) throw new Error("Travessão no texto.");
writeFileSync(DESTINO, md, "utf8");
console.log(`Gravado ${DESTINO} (${md.length} caracteres).`);
