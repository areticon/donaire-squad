/**
 * Gera as tres opcoes a partir de Hoje.dc.html, trocando so o que muda:
 * o rotulo do topo, o bloco de preco, o rotulo do botao e a nota de caixa.
 *
 *   node docs/design/fundador-anual/montar-artboards.mjs
 *
 * Existe para a lista de itens do plano nao ser copiada quatro vezes a mao:
 * onze linhas repetidas em quatro arquivos divergem na primeira correcao, que
 * e exatamente a doenca que lib/planos.ts foi criado para curar.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const base = readFileSync(join(aqui, "Hoje.dc.html"), "utf8");

const ROTULO_HOJE = "Como está no ar hoje";
const PRECO_HOJE = `      <div style="display: flex; align-items: baseline; gap: 8px;">
        <span style="font-size: 18px; color: #9599a6; text-decoration: line-through;">R$ 697</span>
        <span style="font-size: 48px; font-weight: 900; color: #dcdde2; line-height: 1;">397</span>
        <span style="font-size: 14px; color: #9599a6;">/mês</span>
      </div>
      <p style="margin: 6px 0 0; font-size: 14px; color: #f6803d;">Fundador: 10 de 10 vagas. Esse preço fica para sempre.</p>`;
const BOTAO_HOJE = "Garantir vaga de fundador";
const NOTA_HOJE = `    Cobra R$ 397 por mês, para sempre. Dez fundadores põem R$ 3.970 por mês na recorrência e R$ 3.970 no caixa do dia 1.`;

/** Uma linha de apoio dentro do bloco de preco, no cinza do corpo. */
const linha = (texto, cor = "#9599a6", peso = "400") =>
  `      <p style="margin: 6px 0 0; font-size: 14px; font-weight: ${peso}; color: ${cor};">${texto}</p>`;

const opcoes = [
  {
    arquivo: "OpcaoA.dc.html",
    rotulo: "Opção A: o número grande continua sendo 397",
    preco: [
      `      <div style="display: flex; align-items: baseline; gap: 8px;">`,
      `        <span style="font-size: 18px; color: #9599a6; text-decoration: line-through;">R$ 697</span>`,
      `        <span style="font-size: 48px; font-weight: 900; color: #dcdde2; line-height: 1;">397</span>`,
      `        <span style="font-size: 14px; color: #9599a6;">/mês</span>`,
      `      </div>`,
      linha("Fundador: 10 de 10 vagas. Esse preço fica para sempre.", "#f6803d"),
      linha("R$ 4.764 cobrados uma vez por ano"),
    ].join("\n"),
    botao: "Garantir vaga de fundador",
    nota: `    O cartão não muda de cara, e a promessa que já está no ar continua inteira. O risco mora no tamanho da letra: o valor que sai do cartão de crédito é a menor linha do bloco.`,
  },
  {
    arquivo: "OpcaoB.dc.html",
    rotulo: "Opção B: o número grande é o que você paga",
    preco: [
      `      <div style="display: flex; align-items: baseline; gap: 8px;">`,
      `        <span style="font-size: 18px; color: #9599a6; text-decoration: line-through;">R$ 6.970</span>`,
      `        <span style="font-size: 48px; font-weight: 900; color: #dcdde2; line-height: 1;">4.764</span>`,
      `        <span style="font-size: 14px; color: #9599a6;">/ano</span>`,
      `      </div>`,
      linha("Fundador: 10 de 10 vagas. Esse preço fica para sempre.", "#f6803d"),
      linha("Equivale a R$ 397 por mês"),
    ].join("\n"),
    botao: "Garantir vaga de fundador",
    nota: `    Honesto no primeiro olhar, e ninguém se surpreende no extrato. O custo está escrito no próprio lib/planos.ts: número de quatro dígitos assusta, e a comparação com os R$ 697 de lista fica mais difícil de fazer de cabeça.`,
  },
  {
    arquivo: "Main.dc.html",
    rotulo: "Opção C: 397 na vitrine, R$ 4.764 no botão",
    preco: [
      `      <div style="display: flex; align-items: baseline; gap: 8px;">`,
      `        <span style="font-size: 18px; color: #9599a6; text-decoration: line-through;">R$ 697</span>`,
      `        <span style="font-size: 48px; font-weight: 900; color: #dcdde2; line-height: 1;">397</span>`,
      `        <span style="font-size: 14px; color: #9599a6;">/mês</span>`,
      `      </div>`,
      linha("Fundador: 10 de 10 vagas. Esse preço fica para sempre.", "#f6803d", "600"),
      linha("Cobrado uma vez por ano, e é o que trava o preço"),
    ].join("\n"),
    botao: "Garantir vaga, R$ 4.764 no ano",
    nota: `    O número que vende continua sendo 397, e o número que se paga está dentro do botão: não dá para clicar sem ter lido. Tira a sensação de isca sem entregar a comparação com o preço de lista.`,
  },
];

for (const o of opcoes) {
  let saida = base;
  saida = saida.replace(ROTULO_HOJE, o.rotulo);
  saida = saida.replace(PRECO_HOJE, o.preco);
  saida = saida.replace(`>${BOTAO_HOJE}</button>`, `>${o.botao}</button>`);
  saida = saida.replace(NOTA_HOJE, o.nota);

  // Sem esta conferencia, uma troca que nao casa passa calada e o artboard sai
  // identico ao de referencia, que e o erro mais caro possivel num canvas de
  // comparacao: tres opcoes iguais parecem decisao tomada.
  for (const [nome, trecho] of [["rotulo", o.rotulo], ["preco", o.preco.split("\n")[1]], ["botao", o.botao], ["nota", o.nota.trim().slice(0, 30)]]) {
    if (!saida.includes(trecho)) throw new Error(`${o.arquivo}: a troca de ${nome} nao casou`);
  }

  writeFileSync(join(aqui, o.arquivo), saida);
  console.log(`escrito ${o.arquivo}`);
}
