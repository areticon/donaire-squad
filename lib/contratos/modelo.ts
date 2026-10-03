import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { centavosEmReais } from "@/lib/contratos/situacao";

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
};

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
    [/Valor anual e data de in[ií]cio/i, `${centavosEmReais(d.valorCentavos)}, a partir de ${dataBR(d.inicioVigencia)}`],
    [/Acessos extras/i, d.acessosExtras > 0 ? String(d.acessosExtras) : "nenhum"],
  ];
  const texto =
    // [ \t] e não \s: \s come a quebra de linha e cola o parágrafo seguinte na tabela.
    md.replace(/^\|[ \t]*([^|\n]+?)[ \t]*\|[ \t]*([^|\n]*?)[ \t]*\|[ \t]*$/gm, (linha, rotulo: string) => {
      const achado = valores.find(([re]) => re.test(rotulo.trim()));
      return achado ? `| ${rotulo.trim()} | ${achado[1].replace(/\|/g, "/")} |` : linha;
    }) + `\n\nContrato nº ${String(d.numero).padStart(4, "0")}.\n`;
  return { texto, hash: createHash("sha256").update(texto).digest("hex"), versao: versaoDoModelo(md), minuta: ehMinuta(md) };
}
