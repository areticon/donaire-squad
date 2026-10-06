import { representanteComCargo } from "@/lib/contratos/cargo";
import { readFileSync } from "node:fs";
import path from "node:path";
import { centavosEmReais } from "@/lib/contratos/situacao";

/**
 * O CONTRATO DIAGRAMADO (05/10/2026): o texto em Markdown vira uma página HTML
 * com a cara da Demandou, e essa página vira o PDF que vai para assinatura
 * (lib/contratos/pdf.ts) e que o admin vê em "Ver o texto".
 *
 * Existe porque o Bruno abriu o contrato nº 1 na ZapSign e viu o Markdown cru:
 * barras de tabela, anotações de revisão, nada de logomarca. Aqui:
 *
 *   - a capa traz a logomarca, o número do contrato, as partes e o resumo da
 *     contratação (plano, valor, vigência, condição de pagamento);
 *   - as tabelas do Markdown viram tabelas de verdade;
 *   - cada cláusula numerada ganha o seu título; o resto do texto vai como
 *     está, sem interpretar nada além de título, parágrafo, lista, tabela e
 *     negrito (o modelo não usa mais que isso);
 *   - o rodapé "Contrato nº X, versão N, página N de M" é desenhado pelo
 *     Chrome na hora de imprimir (rodapeDoContrato).
 *
 * O conversor de Markdown é propositalmente pequeno: o texto é nosso, o
 * formato é conhecido, e uma biblioteca inteira só para isso seria mais
 * superfície para errar. Só servidor (lê a logomarca do disco).
 */

export type CapaDoContrato = {
  numero: number;
  /** A versão do contrato (cada edição antes de assinar soma 1). */
  versao: number;
  /** A versão do modelo das Condições Gerais ("Versão 1.2, de 04 de outubro de 2026"). */
  versaoDoModelo: string;
  hash: string;
  empresa: string | null;
  documento: string | null;
  endereco: string | null;
  representante: string | null;
  /** O cargo do representante (06/10): a linha sai como "Nome, Cargo". */
  cargo?: string | null;
  email: string | null;
  plano: string;
  valorCentavos: number;
  inicioVigencia: Date | null;
  acessosExtras: number;
  /** A condição de pagamento por extenso ("Entrada de R$ ... mais 11 parcelas de ..."), ou null à vista. */
  condicao: string | null;
  /** O ambiente de teste do provedor marca a capa, para ninguém confundir com o valido. */
  teste?: boolean;
};

const DEMANDOU = {
  razao: "DEMANDOU TECNOLOGIA DA INFORMACAO LTDA",
  cnpj: "66.140.770/0001-48",
  endereco: "Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05424-150",
  email: "contato@demandou.com",
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const dataBR = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }) : null);

/** A logomarca para fundo claro, embutida na página (o PDF não busca nada na rede). */
let logoEmCache: string | null = null;
export function logomarcaEmbutida(): string {
  if (logoEmCache) return logoEmCache;
  const arquivo = path.join(process.cwd(), "public", "logo-light.svg");
  const svg = readFileSync(arquivo, "utf8").replace(/^﻿/, "");
  logoEmCache = `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
  return logoEmCache;
}

/** Negrito e links dentro de uma linha já escapada. */
function linhaEmHtml(texto: string): string {
  return esc(texto)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+)/g, (url) => `<a href="${url}">${url}</a>`);
}

/** O número de uma cláusula de título ("## 4. PLANOS" vira 4 + "PLANOS"; "## ANEXO I: X" fica inteiro). */
function tituloDaClausula(texto: string): string {
  const m = texto.match(/^(\d+)\.\s+(.+)$/);
  if (m) return `<span class="num">${m[1]}</span><span class="nome">${linhaEmHtml(m[2])}</span>`;
  return `<span class="nome">${linhaEmHtml(texto)}</span>`;
}

function tabelaEmHtml(linhas: string[]): string {
  const celulas = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim());
  const [cabecalho, , ...corpo] = linhas;
  const th = celulas(cabecalho);
  const tr = corpo.map((l) => `<tr>${celulas(l).map((c, i) => `<td${i === 0 ? ' class="primeira"' : ""}>${linhaEmHtml(c)}</td>`).join("")}</tr>`);
  return `<table class="t${th.length > 3 ? " larga" : ""}"><thead><tr>${th.map((c) => `<th>${linhaEmHtml(c)}</th>`).join("")}</tr></thead><tbody>${tr.join("")}</tbody></table>`;
}

/**
 * O Markdown do contrato em HTML. Reconhece o que o modelo usa: "#", "##" e
 * "###" de título, "- " de lista, "|" de tabela, linha em branco entre
 * parágrafos e "**negrito**". Qualquer outra linha é parágrafo.
 */
export function markdownEmHtml(md: string): string {
  const linhas = md.replace(/\r\n/g, "\n").split("\n");
  const saida: string[] = [];
  let paragrafo: string[] = [];
  let lista: string[] = [];
  let tabela: string[] = [];
  const fecharParagrafo = () => {
    if (paragrafo.length) saida.push(`<p>${linhaEmHtml(paragrafo.join(" "))}</p>`);
    paragrafo = [];
  };
  const fecharLista = () => {
    if (lista.length) saida.push(`<ul>${lista.map((i) => `<li>${linhaEmHtml(i)}</li>`).join("")}</ul>`);
    lista = [];
  };
  const fecharTabela = () => {
    if (tabela.length >= 2) saida.push(tabelaEmHtml(tabela));
    tabela = [];
  };
  const fecharTudo = () => {
    fecharParagrafo();
    fecharLista();
    fecharTabela();
  };
  for (const crua of linhas) {
    const l = crua.trimEnd();
    if (!l.trim()) {
      fecharTudo();
      continue;
    }
    if (l.startsWith("|")) {
      fecharParagrafo();
      fecharLista();
      tabela.push(l);
      continue;
    }
    fecharTabela();
    const h = l.match(/^(#{1,3})\s+(.+)$/);
    if (h) {
      fecharTudo();
      const nivel = h[1].length;
      if (nivel === 1) saida.push(`<h1>${linhaEmHtml(h[2])}</h1>`);
      else if (nivel === 2) saida.push(`<h2>${tituloDaClausula(h[2])}</h2>`);
      else saida.push(`<h3>${linhaEmHtml(h[2])}</h3>`);
      continue;
    }
    if (/^-\s+/.test(l)) {
      fecharParagrafo();
      lista.push(l.replace(/^-\s+/, ""));
      continue;
    }
    fecharLista();
    paragrafo.push(l.trim());
  }
  fecharTudo();
  return saida.join("\n");
}

/** A capa: logomarca, número, partes e resumo. */
function capaEmHtml(c: CapaDoContrato): string {
  const n = String(c.numero).padStart(4, "0");
  const linha = (rotulo: string, valor: string | null) => `<tr><th>${esc(rotulo)}</th><td>${valor ? esc(valor) : '<span class="falta">não informado</span>'}</td></tr>`;
  const vigencia = c.inicioVigencia ? `12 meses a partir de ${dataBR(c.inicioVigencia)}` : "12 meses, contados da confirmação do pagamento";
  return `
<section class="capa">
  <div class="topo">
    <img class="logo" src="${logomarcaEmbutida()}" alt="Demandou" />
    ${c.teste ? '<span class="selo-teste">Ambiente de teste, sem validade jurídica</span>' : ""}
  </div>
  <div class="titulo">
    <p class="sobre">Licença de uso da plataforma Demandou</p>
    <h1>Contrato nº ${n}</h1>
    <p class="sub">Condições Gerais de Contratação e Proposta Comercial</p>
  </div>
  <div class="partes">
    <div class="parte">
      <h4>Licenciante</h4>
      <table class="dados">
        ${linha("Razão social", DEMANDOU.razao)}
        ${linha("CNPJ", DEMANDOU.cnpj)}
        ${linha("Endereço", DEMANDOU.endereco)}
        ${linha("E-mail", DEMANDOU.email)}
      </table>
    </div>
    <div class="parte">
      <h4>Cliente</h4>
      <table class="dados">
        ${linha("Razão social ou nome", c.empresa)}
        ${linha("CNPJ ou CPF", c.documento)}
        ${linha("Endereço", c.endereco)}
        ${linha("Representante legal", representanteComCargo(c.representante, c.cargo))}
        ${linha("E-mail contratual", c.email)}
      </table>
    </div>
  </div>
  <div class="resumo">
    <h4>Resumo da contratação</h4>
    <table class="dados">
      ${linha("Plano", `${c.plano}, anual`)}
      ${linha("Valor anual", centavosEmReais(c.valorCentavos))}
      ${linha("Vigência", vigencia)}
      ${linha("Acessos extras", c.acessosExtras > 0 ? String(c.acessosExtras) : "nenhum")}
      ${c.condicao ? linha("Condição de pagamento", c.condicao) : linha("Pagamento", "anual, à vista")}
    </table>
  </div>
  <p class="rodape-da-capa">${esc(c.versaoDoModelo)} · versão ${c.versao} deste contrato · identificador do texto ${esc(c.hash.slice(0, 12))}</p>
</section>`;
}

const CSS = `
:root { --tinta: #22222a; --cinza: #5f5f6b; --linha: #d8d8de; --fundo: #f4f4f6; --laranja: #ef6122; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { font-family: "Geist", "Inter", "Liberation Sans", Arial, Helvetica, sans-serif; color: var(--tinta); font-size: 10.5pt; line-height: 1.5; }
a { color: var(--tinta); text-decoration: underline; text-decoration-color: var(--laranja); word-break: break-all; }
p { margin: 0 0 7pt; text-align: justify; hyphens: auto; }
strong { font-weight: 600; }
h1 { font-size: 15pt; font-weight: 700; letter-spacing: 0.01em; margin: 0 0 6pt; text-transform: uppercase; }
h2 { display: flex; align-items: baseline; gap: 8pt; font-size: 11.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.02em; margin: 18pt 0 8pt; padding-top: 6pt; border-top: 1.5px solid var(--laranja); break-after: avoid; page-break-after: avoid; }
h2 .num { color: var(--laranja); font-variant-numeric: tabular-nums; min-width: 18pt; }
h3 { font-size: 10.5pt; font-weight: 700; margin: 12pt 0 5pt; break-after: avoid; page-break-after: avoid; }
ul { list-style: none; margin: 0 0 7pt; padding-left: 16pt; }
li { margin: 0 0 3pt; text-align: justify; }
table.t { width: 100%; border-collapse: collapse; margin: 4pt 0 10pt; font-size: 9.5pt; line-height: 1.35; break-inside: auto; }
table.t th, table.t td { border: 1px solid var(--linha); padding: 4.5pt 6pt; vertical-align: top; text-align: left; }
table.t th { background: var(--fundo); font-weight: 600; }
table.t td.primeira { font-weight: 500; }
table.t.larga { font-size: 8.8pt; }
table.t tr { break-inside: avoid; page-break-inside: avoid; }
thead { display: table-header-group; }
.capa { break-after: page; page-break-after: always; min-height: 240mm; display: flex; flex-direction: column; }
.capa .topo { display: flex; align-items: center; justify-content: space-between; margin-bottom: 26mm; }
.capa .logo { height: 16mm; width: auto; }
.selo-teste { font-size: 8pt; font-weight: 600; color: #a43a0c; border: 1px solid #a43a0c; border-radius: 4pt; padding: 2pt 6pt; text-transform: uppercase; letter-spacing: 0.04em; }
.capa .titulo { margin-bottom: 14mm; }
.capa .sobre { color: var(--cinza); font-size: 10pt; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 4pt; text-align: left; }
.capa h1 { font-size: 26pt; text-transform: none; letter-spacing: -0.01em; margin: 0 0 4pt; }
.capa .sub { font-size: 12pt; color: var(--cinza); margin: 0; text-align: left; }
.capa .partes { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; margin-bottom: 8mm; }
.capa h4 { margin: 0 0 4pt; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: var(--laranja); }
table.dados { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
table.dados th, table.dados td { border-bottom: 1px solid var(--linha); padding: 4pt 0; vertical-align: top; text-align: left; }
table.dados th { font-weight: 500; color: var(--cinza); width: 38%; padding-right: 8pt; }
.capa .resumo table.dados th { width: 26%; }
.falta { color: #a43a0c; font-style: italic; }
.rodape-da-capa { margin-top: auto; padding-top: 10mm; font-size: 8.5pt; color: var(--cinza); text-align: left; }
.corpo > h1 { font-size: 13pt; margin-top: 0; }
.corpo > h1 + p { color: var(--cinza); }
.fecho { margin-top: 18pt; padding-top: 8pt; border-top: 1px solid var(--linha); font-size: 9pt; color: var(--cinza); }
`;

/**
 * A página inteira: capa mais o texto. `fontesCss` é o @font-face que quem
 * imprime quer injetar (o worker tem as fontes instaladas e não precisa; o
 * teste local aponta para os arquivos .ttf).
 */
export function htmlDoContrato(capa: CapaDoContrato, markdown: string, fontesCss = ""): string {
  const n = String(capa.numero).padStart(4, "0");
  // A última linha do texto ("Contrato nº 0001.") vira o fecho, discreto.
  const corpo = markdownEmHtml(markdown).replace(/<p>Contrato nº \d+\.<\/p>\s*$/, (m) => m.replace("<p>", '<p class="fecho">'));
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Contrato Demandou nº ${n}</title>
<style>${fontesCss}${CSS}</style>
</head>
<body>
${capaEmHtml(capa)}
<section class="corpo">
${corpo}
</section>
</body>
</html>`;
}

/** O rodapé que o Chrome desenha em cada página: número, versão e "página N de M". */
export function rodapeDoContrato(c: Pick<CapaDoContrato, "numero" | "versao" | "versaoDoModelo">): { cabecalho: string; rodape: string } {
  const n = String(c.numero).padStart(4, "0");
  const estilo = 'font-family: Geist, Inter, \'Liberation Sans\', Arial, sans-serif; font-size: 7.5pt; color: #6b6b75; width: 100%; padding: 0 16mm; display: flex; justify-content: space-between; align-items: baseline;';
  return {
    cabecalho: "<div></div>",
    rodape: `<div style="${estilo}"><span>Contrato Demandou nº ${n}, versão ${c.versao} · Condições Gerais ${esc(c.versaoDoModelo)}</span><span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span></div>`,
  };
}
