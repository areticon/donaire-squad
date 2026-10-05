import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { centavosEmReais } from "@/lib/contratos/situacao";
import { ACESSO_EXTRA_ANUAL_CENTAVOS, MOTIVOS_DE_DESCONTO, ehMotivoDeDesconto, porcentagem } from "@/lib/contratos/preco";

/**
 * O TEXTO DO CONTRATO, montado do modelo em Markdown (02/10/2026).
 *
 * O modelo é lib/contratos/modelos/condicoes-gerais.md, cópia do texto que é
 * escrito em C:\Users\devan\Documents\Demandou\contratos\ (o script
 * scripts/contratos-copiar-modelo.mjs refaz a cópia). Para trocar o texto,
 * troque esse arquivo e publique. O quadro "Dado do Cliente" do preâmbulo é
 * preenchido aqui com os dados do contrato; o resto vai como está.
 *
 * A TRAVA DA MINUTA: enquanto o texto disser "MINUTA PARA REVISÃO JURÍDICA",
 * ele não vai para assinatura de verdade (só para o ambiente de teste do
 * provedor). Foi o próprio documento que pediu: "não deve ser assinado antes
 * dessa revisão".
 *
 * Só servidor (lê o disco). O arquivo entra na função da Vercel pelo
 * outputFileTracingIncludes do next.config.ts.
 */

const ARQUIVO = path.join(process.cwd(), "lib", "contratos", "modelos", "condicoes-gerais.md");
export const MARCA_DA_MINUTA = "MINUTA PARA REVISÃO JURÍDICA";

export type DadosDoContrato = {
  numero: number;
  empresa: string | null;
  documento: string | null;
  endereco?: string | null;
  representante: string | null;
  email: string | null;
  plano: string;
  valorCentavos: number;
  inicioVigencia: Date | null;
  acessosExtras: number;
  /**
   * A PROPOSTA COMERCIAL (04/10): preço de tabela, desconto e valor final.
   * Contrato de antes (valor digitado, sem tabela gravada) vai sem ela, e o
   * texto dele fica idêntico ao que foi assinado (o hash não muda).
   */
  proposta?: PropostaComercial | null;
};

export type PropostaComercial = {
  planoCentavos: number;
  extrasCentavos: number;
  tabelaCentavos: number;
  descontoCentavos: number;
  descontoMotivo: string | null;
  fundador: boolean;
};

const motivoPorExtenso = (m: string | null) => (ehMotivoDeDesconto(m) ? MOTIVOS_DE_DESCONTO[m].toLowerCase() : (m ?? ""));

/**
 * A seção da Proposta Comercial que vai no contrato, entre o preâmbulo e a
 * cláusula 1. Pela cláusula 2.2 ela prevalece sobre o Anexo I: é ela que diz o
 * preço de tabela, o desconto e o valor final daquela contratação.
 */
export function textoDaProposta(d: { plano: string; acessosExtras: number; proposta: PropostaComercial }): string {
  const p = d.proposta;
  const pct = p.tabelaCentavos > 0 ? (p.descontoCentavos / p.tabelaCentavos) * 100 : 0;
  const linhas: Array<[string, string]> = [[`Plano ${d.plano}, anual, preço de tabela`, centavosEmReais(p.planoCentavos)]];
  if (d.acessosExtras > 0) {
    linhas.push([`${d.acessosExtras} acesso(s) extra(s), anual, preço de tabela de ${centavosEmReais(ACESSO_EXTRA_ANUAL_CENTAVOS)} cada`, centavosEmReais(p.extrasCentavos)]);
  }
  linhas.push(["Preço de tabela", centavosEmReais(p.tabelaCentavos)]);
  linhas.push([
    p.descontoCentavos > 0 ? `Desconto (${porcentagem(pct)}, ${motivoPorExtenso(p.descontoMotivo)})` : "Desconto",
    p.descontoCentavos > 0 ? `menos ${centavosEmReais(p.descontoCentavos)}` : "nenhum",
  ]);
  linhas.push(["Valor anual final, à vista", centavosEmReais(p.tabelaCentavos - p.descontoCentavos)]);
  linhas.push(["Condição de Fundador (cláusula 5.6)", p.fundador ? "sim" : "não"]);
  const renovacao = p.fundador
    ? "Na renovação, vale o valor anual final acima, sem o reajuste da cláusula 5.4, pela Condição de Fundador (cláusula 5.6)."
    : "Na renovação, vale o valor anual final acima, com o reajuste da cláusula 5.4.";
  return [
    "## PROPOSTA COMERCIAL",
    "",
    "Esta é a Proposta Comercial desta contratação (cláusulas 1(n) e 2.2). O preço de tabela é o do Anexo I; o valor que o Cliente paga é o valor anual final.",
    "",
    "| Item | Valor |",
    "|---|---|",
    ...linhas.map(([a, b]) => `| ${a} | ${b} |`),
    "",
    renovacao,
    "",
  ].join("\n");
}

export function lerModelo(): string {
  return readFileSync(ARQUIVO, "utf8");
}

/** A versão do modelo: a linha "Versão x, de ..." do topo, ou "sem versão". */
export function versaoDoModelo(md: string): string {
  return md.match(/^Vers[aã]o\s+[^\n]+/m)?.[0]?.trim() ?? "sem versão";
}

export function ehMinuta(md: string): boolean {
  return md.includes(MARCA_DA_MINUTA);
}

const dataBR = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric" }) : "a definir");

/**
 * Preenche o quadro do Cliente. Cada linha é achada pelo RÓTULO (a primeira
 * coluna), e não pela posição: se o texto ganhar uma linha nova, as outras
 * continuam certas, e a linha que não for reconhecida fica como está.
 */
export function montarTexto(d: DadosDoContrato, md = lerModelo()): { texto: string; hash: string; versao: string; minuta: boolean } {
  const valores: Array<[RegExp, string]> = [
    [/Raz[aã]o social ou nome completo/i, d.empresa ?? "[PREENCHER]"],
    [/CNPJ ou CPF/i, d.documento ?? "[PREENCHER]"],
    [/^Endere[cç]o$/i, d.endereco ?? "[PREENCHER]"],
    [/Representante legal/i, d.representante ?? "[PREENCHER]"],
    [/E-mail para comunica/i, d.email ?? "[PREENCHER]"],
    [/Plano contratado/i, d.plano],
    // Sem data combinada, vale a cláusula 5.1: os 12 meses contam da
    // confirmação do pagamento (04/10, contrato de prospect).
    [
      /Valor anual e data de in[ií]cio/i,
      `${centavosEmReais(d.valorCentavos)}, ${d.inicioVigencia ? `a partir de ${dataBR(d.inicioVigencia)}` : "com início na confirmação do pagamento"}`,
    ],
    [/Acessos extras/i, d.acessosExtras > 0 ? String(d.acessosExtras) : "nenhum"],
  ];
  const preenchido =
    // [ \t] e não \s: \s come a quebra de linha e cola o parágrafo seguinte na tabela.
    md.replace(/^\|[ \t]*([^|\n]+?)[ \t]*\|[ \t]*([^|\n]*?)[ \t]*\|[ \t]*$/gm, (linha, rotulo: string) => {
      const achado = valores.find(([re]) => re.test(rotulo.trim()));
      return achado ? `| ${rotulo.trim()} | ${achado[1].replace(/\|/g, "/")} |` : linha;
    });
  // A Proposta Comercial entra antes da cláusula 1 (04/10). Sem a cláusula 1
  // achada, vai no fim, para nunca sumir do texto assinado.
  const proposta = d.proposta ? textoDaProposta({ plano: d.plano, acessosExtras: d.acessosExtras, proposta: d.proposta }) : "";
  const comProposta = !proposta ? preenchido : /^## 1\. /m.test(preenchido) ? preenchido.replace(/^## 1\. /m, `${proposta}\n## 1. `) : `${preenchido}\n\n${proposta}`;
  const texto = comProposta + `\n\nContrato nº ${String(d.numero).padStart(4, "0")}.\n`;
  return { texto, hash: createHash("sha256").update(texto).digest("hex"), versao: versaoDoModelo(md), minuta: ehMinuta(md) };
}

/** As condições comerciais de um lado do aditivo (antes ou depois). */
export type CondicoesComerciais = {
  plano: string;
  acessosExtras: number;
  tabelaCentavos: number | null;
  descontoCentavos: number;
  descontoMotivo: string | null;
  valorAnualCentavos: number;
  fundador: boolean;
};

export type DadosDoAditivo = {
  ordem: number;
  numeroDoContrato: number;
  assinadoEm: Date | null;
  fimVigencia: Date | null;
  empresa: string | null;
  documento: string | null;
  representante: string | null;
  email: string | null;
  antes: CondicoesComerciais;
  depois: CondicoesComerciais;
  valeDesde: Date;
  diferencaCentavos: number;
  diasRestantes: number;
  diasDaVigencia: number;
};

const descontoNaLinha = (c: CondicoesComerciais) => {
  if (c.descontoCentavos <= 0) return "nenhum";
  const pct = c.tabelaCentavos ? ` (${porcentagem((c.descontoCentavos / c.tabelaCentavos) * 100)}, ${motivoPorExtenso(c.descontoMotivo)})` : "";
  return `${centavosEmReais(c.descontoCentavos)}${pct}`;
};

/**
 * O TEXTO DO ADITIVO (04/10): curto, e só o que muda. Referencia o contrato,
 * diz o que muda, desde quando e a diferença de valor; o resto do contrato
 * continua valendo. A versão do modelo é a do próprio aditivo.
 */
export const VERSAO_DO_ADITIVO = "Aditivo, versão 1.0, de 04 de outubro de 2026";

export function montarAditivo(d: DadosDoAditivo): { texto: string; hash: string; versao: string } {
  const n = String(d.numeroDoContrato).padStart(4, "0");
  const a = d.antes;
  const b = d.depois;
  const linhas: Array<[string, string, string]> = [
    ["Plano", a.plano, b.plano],
    ["Acessos extras", a.acessosExtras > 0 ? String(a.acessosExtras) : "nenhum", b.acessosExtras > 0 ? String(b.acessosExtras) : "nenhum"],
    ["Preço de tabela anual", a.tabelaCentavos !== null ? centavosEmReais(a.tabelaCentavos) : "não informado", b.tabelaCentavos !== null ? centavosEmReais(b.tabelaCentavos) : "não informado"],
    ["Desconto", descontoNaLinha(a), descontoNaLinha(b)],
    ["Valor anual", centavosEmReais(a.valorAnualCentavos), centavosEmReais(b.valorAnualCentavos)],
    ["Condição de Fundador (cláusula 5.6)", a.fundador ? "sim" : "não", b.fundador ? "sim" : "não"],
  ];
  const diferenca =
    d.diferencaCentavos > 0
      ? `O Cliente paga à vista a diferença proporcional de **${centavosEmReais(d.diferencaCentavos)}**, referente aos ${d.diasRestantes} dias que faltam de uma Vigência de ${d.diasDaVigencia} dias (como na cláusula 4.9). A mudança passa a valer na conta depois da assinatura deste aditivo e da confirmação desse pagamento.`
      : d.diferencaCentavos < 0
        ? `A Demandou concede ao Cliente um crédito de **${centavosEmReais(-d.diferencaCentavos)}**, referente aos ${d.diasRestantes} dias que faltam de uma Vigência de ${d.diasDaVigencia} dias, abatido do valor da próxima renovação. O crédito não é devolvido em dinheiro, salvo nas hipóteses expressas do contrato. A mudança passa a valer na conta depois da assinatura deste aditivo.`
        : "A mudança não gera diferença de valor nesta Vigência. Ela passa a valer na conta depois da assinatura deste aditivo.";
  const texto = [
    `# ADITIVO Nº ${d.ordem} AO CONTRATO DEMANDOU Nº ${n}`,
    "",
    VERSAO_DO_ADITIVO,
    "",
    "**DEMANDOU TECNOLOGIA DA INFORMACAO LTDA**, CNPJ 66.140.770/0001-48, doravante \"Demandou\", e",
    "",
    `**${d.empresa ?? "[PREENCHER]"}**, ${d.documento ? `CNPJ ou CPF ${d.documento}` : "CNPJ ou CPF [PREENCHER]"}, representado por ${d.representante ?? "[PREENCHER]"} (${d.email ?? "[PREENCHER]"}), doravante \"Cliente\",`,
    "",
    `ajustam este aditivo ao Contrato Demandou nº ${n}${d.assinadoEm ? `, assinado em ${dataBR(d.assinadoEm)}` : ""}, formado pelas Condições Gerais de Contratação e pela Proposta Comercial.`,
    "",
    "## 1. O QUE MUDA",
    "",
    "| Item | Antes | Depois |",
    "|---|---|---|",
    ...linhas.map(([x, y, z]) => `| ${x} | ${y} | ${z} |`),
    "",
    "## 2. DESDE QUANDO",
    "",
    `As condições da coluna "Depois" valem a partir de ${dataBR(d.valeDesde)}, até o fim da Vigência em curso${d.fimVigencia ? `, em ${dataBR(d.fimVigencia)}` : ""}. Na renovação, vale o novo valor anual, ${b.fundador ? "sem o reajuste da cláusula 5.4, pela Condição de Fundador (cláusula 5.6)" : "com o reajuste da cláusula 5.4"}.`,
    "",
    "## 3. DIFERENÇA DE VALOR",
    "",
    diferenca,
    "",
    "## 4. O RESTO DO CONTRATO",
    "",
    "Todas as demais cláusulas do contrato continuam valendo como foram assinadas. Este aditivo passa a fazer parte da Proposta Comercial da contratação (cláusula 2.2) e é assinado eletronicamente, como o contrato (cláusula 2.3).",
    "",
    `Aditivo nº ${d.ordem} ao contrato nº ${n}.`,
    "",
  ].join("\n");
  return { texto, hash: createHash("sha256").update(texto).digest("hex"), versao: VERSAO_DO_ADITIVO };
}
