import { representanteComCargo } from "@/lib/contratos/cargo";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { centavosEmReais } from "@/lib/contratos/situacao";
import { ACESSO_EXTRA_ANUAL_CENTAVOS, MOTIVOS_DE_DESCONTO, ehMotivoDeDesconto, porcentagem } from "@/lib/contratos/preco";
import { condicaoPorExtenso, type FormaDaEntrada, type FormaDoRestante } from "@/lib/contratos/condicao";

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
  /** O cargo do representante (06/10): entra como "Nome, Cargo"; sem ele, só o nome (contrato de antes). */
  cargo?: string | null;
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
  /**
   * A CONDIÇÃO DE PAGAMENTO parcelada (05/10): entrada no Pix mais parcelas no
   * cartão em crédito recorrente. Null é à vista, e o texto fica como sempre.
   */
  condicao?: CondicaoNoTexto | null;
};

export type CondicaoNoTexto = {
  entradaCentavos: number;
  restanteCentavos: number;
  parcelas: number;
  parcelaCentavos: number;
  formaDaEntrada: FormaDaEntrada;
  formaDoRestante: FormaDoRestante;
  primeiraParcelaEm: Date | null;
  /** Os links que não vencem: o da entrada só existe quando ela é no cartão pelo Stripe. */
  links: { entrada: string | null; restante: string };
  /** A chave Pix da Demandou, quando configurada. */
  chavePix: string | null;
};

/** Como a entrada é paga, por extenso, para o texto do contrato. */
function paragrafoDaEntrada(c: CondicaoNoTexto): string {
  if (c.formaDaEntrada === "cartao_stripe") return "A entrada é paga no cartão de crédito, à vista, pelo link do Stripe indicado abaixo.";
  const meio = c.formaDaEntrada === "pix" ? `via Pix${c.chavePix ? ` (chave Pix ${c.chavePix})` : ""}` : c.formaDaEntrada === "boleto" ? "por boleto emitido pela Demandou" : "por transferência bancária";
  return `A entrada é paga ${meio} diretamente à Demandou, e o Cliente envia o comprovante.`;
}

/** Como o restante é cobrado, por extenso, para o texto do contrato. */
function paragrafoDoRestante(c: CondicaoNoTexto, clausulaDoCancelamento = "9"): string {
  if (c.formaDoRestante === "cartao_recorrente") {
    return `O restante é cobrado automaticamente, uma parcela por mês, no cartão de crédito que o Cliente cadastrar pelo Stripe: cada mês cobra só a parcela daquele mês, e a cobrança se encerra sozinha depois da ${c.parcelas}ª parcela. Não é o parcelamento do emissor do cartão da cláusula 6.3. O acesso é liberado (cláusula 6.4) e a Vigência conta (cláusula 5.1) a partir da confirmação da entrada, com o cartão das parcelas cadastrado. Parcela não paga no vencimento segue as cláusulas 6.5 e ${clausulaDoCancelamento}.6.`;
  }
  if (c.formaDoRestante === "cartao_parcelado_emissor") {
    return `O restante é pago de uma vez no cartão de crédito pelo link do Stripe, com o parcelamento do emissor do cartão (cláusula 6.3) em até ${c.parcelas} vezes, escolhido pelo Cliente na tela de pagamento; o emissor reserva o total no limite do cartão. O acesso é liberado (cláusula 6.4) e a Vigência conta (cláusula 5.1) a partir da confirmação da entrada e do restante.`;
  }
  return "O restante é pago à vista no cartão de crédito pelo link do Stripe. O acesso é liberado (cláusula 6.4) e a Vigência conta (cláusula 5.1) a partir da confirmação da entrada e do restante.";
}

/**
 * A CONDIÇÃO DE PAGAMENTO por extenso, com as duas partes, as formas e os
 * links. Vale pela cláusula 6.2 ("outro meio que a Demandou indicar na
 * Proposta Comercial") e, pela cláusula 2.2, prevalece sobre o "anual e à
 * vista" das condições gerais.
 */
export function textoDaCondicao(c: CondicaoNoTexto, clausulaDoCancelamento = "9"): string {
  const linkDoRestante = c.formaDoRestante === "cartao_recorrente" ? `Cadastrar o cartão das parcelas (restante): ${c.links.restante}` : `Pagar o restante: ${c.links.restante}`;
  return [
    "### Condição de pagamento",
    "",
    `${condicaoPorExtenso(c)}. A entrada (${centavosEmReais(c.entradaCentavos)}) mais o restante (${centavosEmReais(c.restanteCentavos)}) somam o valor anual final desta Proposta Comercial.`,
    "",
    paragrafoDaEntrada(c),
    "",
    paragrafoDoRestante(c, clausulaDoCancelamento),
    "",
    ...(c.links.entrada ? [`Pagar a entrada: ${c.links.entrada}`, ""] : []),
    linkDoRestante,
    "",
  ].join("\n");
}

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
export function textoDaProposta(d: { plano: string; acessosExtras: number; proposta: PropostaComercial; parcelado?: boolean }): string {
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
  // No parcelado (05/10) o "à vista" sai do rótulo: a condição vem logo abaixo.
  linhas.push([d.parcelado ? "Valor anual final" : "Valor anual final, à vista", centavosEmReais(p.tabelaCentavos - p.descontoCentavos)]);
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

/**
 * AS ANOTAÇÕES DE REVISÃO (05/10): o modelo em Documents traz notas entre
 * colchetes para quem revisa ("[CONFIRMAR razão social...]", "[CONFIRMAR o
 * nome do encarregado.]"). O Bruno viu o contrato nº 1 na ZapSign com elas e
 * reclamou, com razão: nota de revisão não vai para o cliente. Saem daqui
 * todas as notas que começam com um verbo de revisão em maiúsculas; os
 * marcadores "[PREENCHER]" do quadro são tratados em montarTexto.
 */
export function limparAnotacoes(md: string): string {
  return md
    .replace(/[ \t]*\[(?:CONFIRMAR|REVISAR|VERIFICAR|CHECAR|AJUSTAR|NOTA)\b[^\]]*\]/g, "")
    .replace(/[ \t]+$/gm, "");
}

/**
 * Lê um arquivo de modelo. A quebra de linha vira "\n" sempre: o git guarda o
 * modelo com LF (é o que a Vercel lê), e o checkout do Windows o devolve com
 * CRLF; sem isso, o hash calculado na máquina do Bruno não bate com o de
 * produção.
 */
function lerArquivoDeModelo(arquivo: string): string {
  return limparAnotacoes(readFileSync(arquivo, "utf8").replace(/\r\n/g, "\n"));
}

export function lerModelo(): string {
  return lerArquivoDeModelo(ARQUIVO);
}

/**
 * OS MODELOS JÁ USADOS (06/10/2026): contrato que já saiu para assinatura
 * guarda a versão do modelo (`modeloVersao`) e o hash do texto (`textoHash`),
 * e o texto dele é sempre remontado do modelo DAQUELA versão, nunca do modelo
 * do dia. Foi o que permitiu trocar o modelo para a 1.4 (sem a garantia de 30
 * dias) sem mexer no contrato que o cliente já recebeu: reenvio, "Ver o
 * texto", PDF e versão nova continuam na versão com que ele saiu.
 *
 * Cada versão vira um arquivo em lib/contratos/modelos/historico/ no dia em
 * que o modelo muda, copiado sem nenhuma edição. A chave é o número da linha
 * "Versão x, de ..." do topo.
 */
const HISTORICO: Record<string, string> = {
  "1.2": "condicoes-gerais-1.2.md",
  "1.3": "condicoes-gerais-1.3.md",
};

export class ModeloNaoGuardado extends Error {}

/** O número da versão ("1.3") a partir da linha "Versão 1.3, de 06 de outubro de 2026". */
export function numeroDaVersao(versao: string | null | undefined): string | null {
  return versao?.match(/Vers[aã]o\s+(\d+(?:\.\d+)*)/)?.[1] ?? null;
}

/**
 * O modelo com que um contrato deve ser montado: o da versão gravada nele, se
 * houver; senão (contrato que ainda não saiu), o modelo atual. Versão gravada
 * que não está guardada é erro: nada é remontado com outro texto.
 */
export function lerModeloDaVersao(versaoGravada: string | null | undefined): string {
  const atual = lerModelo();
  if (!versaoGravada || versaoDoModelo(atual) === versaoGravada) return atual;
  const n = numeroDaVersao(versaoGravada);
  const arquivo = n ? HISTORICO[n] : undefined;
  if (!arquivo) {
    throw new ModeloNaoGuardado(`O contrato saiu na "${versaoGravada}", e esse texto não está guardado em lib/contratos/modelos/historico. Ele não é remontado com outro modelo.`);
  }
  const md = lerArquivoDeModelo(path.join(path.dirname(ARQUIVO), "historico", arquivo));
  if (versaoDoModelo(md) !== versaoGravada) {
    throw new ModeloNaoGuardado(`O arquivo ${arquivo} diz "${versaoDoModelo(md)}", e o contrato saiu na "${versaoGravada}".`);
  }
  return md;
}

/** O número da cláusula de cancelamento do modelo (9 até a versão 1.3, 8 desde a 1.4). */
export function clausulaDoCancelamento(md: string): string {
  return md.match(/^## (\d+)\. CANCELAMENTO E RESCIS/m)?.[1] ?? "9";
}

/** Os dados do cliente que o contrato não sai sem (05/10): o quadro do preâmbulo nunca vai com "[PREENCHER]". */
export const CAMPOS_OBRIGATORIOS: Array<[keyof Pick<DadosDoContrato, "empresa" | "documento" | "endereco" | "representante" | "email">, string]> = [
  ["empresa", "razão social ou nome completo"],
  ["documento", "CNPJ ou CPF"],
  ["endereco", "endereço"],
  ["representante", "representante legal"],
  ["email", "e-mail para comunicações contratuais"],
];

/** Os nomes, por extenso, do que ainda falta preencher no contrato. Vazio quando está completo. */
export function camposQueFaltam(d: Pick<DadosDoContrato, "empresa" | "documento" | "endereco" | "representante" | "email">): string[] {
  return CAMPOS_OBRIGATORIOS.filter(([campo]) => !String(d[campo] ?? "").trim()).map(([, nome]) => nome);
}

/** O que aparece no lugar de um dado que falta, só na prévia do rascunho: o envio é barrado antes. */
const NAO_INFORMADO = "não informado";

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
    [/Raz[aã]o social ou nome completo/i, d.empresa?.trim() || NAO_INFORMADO],
    [/CNPJ ou CPF/i, d.documento?.trim() || NAO_INFORMADO],
    [/^Endere[cç]o$/i, d.endereco?.trim() || NAO_INFORMADO],
    [/Representante legal/i, representanteComCargo(d.representante, d.cargo) ?? NAO_INFORMADO],
    [/E-mail para comunica/i, d.email?.trim() || NAO_INFORMADO],
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
  const proposta =
    (d.proposta ? textoDaProposta({ plano: d.plano, acessosExtras: d.acessosExtras, proposta: d.proposta, parcelado: Boolean(d.condicao) }) : d.condicao ? "## PROPOSTA COMERCIAL\n\n" : "") +
    (d.condicao ? textoDaCondicao(d.condicao, clausulaDoCancelamento(md)) : "");
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
  cargo?: string | null;
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
    `**${d.empresa ?? NAO_INFORMADO}**, CNPJ ou CPF ${d.documento ?? NAO_INFORMADO}, representado por ${representanteComCargo(d.representante, d.cargo) ?? NAO_INFORMADO} (${d.email ?? NAO_INFORMADO}), doravante \"Cliente\",`,
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
