import { put } from "@vercel/blob";
import { prisma } from "@/lib/db/prisma";
import { dataUrlToBuffer, gerarImagem } from "@/lib/media/nano-banana";
import { midiaProduzida } from "@/lib/media/storage";
import { GUARDA_DA_IMAGEM_ESTILIZADA } from "@/lib/media/editor-por-comando/linguagem";
import { custoEstimadoDasPrevias, type TipoDeDesign } from "@/lib/biblioteca-de-design/tipos";

/**
 * AS PRÉVIAS DA BIBLIOTECA (06/10/2026): cada entrada ganha UMA imagem de
 * exemplo gerada pelo melhor modelo de imagem (gpt-image 2 primeiro, Gemini
 * depois, Higgsfield em terceiro: a ordem de lib/media/nano-banana.ts). Até
 * ser gerada, a galeria mostra "prévia ainda não gerada".
 *
 * REGRA DO BRUNO: nenhum gasto pago sem o OK dele e o valor antes. Então:
 *   - `previasPendentes()` só conta e estima (US$ 0,05 a 0,10 por prévia);
 *   - `gerarPreviasPendentes()` exige `confirmar: true` (o admin leu o custo
 *     e clicou), tem teto por chamada e grava o custo real de cada prévia em
 *     `previaCustoUsd` e em ai_usage (operation "biblioteca-previa").
 * Nesta frente nenhuma prévia foi gerada: a ação está pronta, aguardando.
 */

export const TETO_DE_PREVIAS_POR_CHAMADA = 20;

export async function previasPendentes(): Promise<{ total: number; porTipo: Record<TipoDeDesign, number>; custo: ReturnType<typeof custoEstimadoDasPrevias> }> {
  const grupos = await prisma.designDaBiblioteca.groupBy({ by: ["tipo"], where: { previaUrl: null, publico: true }, _count: { _all: true } }).catch(() => []);
  const porTipo: Record<TipoDeDesign, number> = { video: 0, imagem: 0 };
  for (const g of grupos) if (g.tipo === "video" || g.tipo === "imagem") porTipo[g.tipo] = g._count._all;
  const total = porTipo.video + porTipo.imagem;
  return { total, porTipo, custo: custoEstimadoDasPrevias(total) };
}

/** As variáveis dos prompts do book ({destaque}, {manchete}...) preenchidas com um exemplo neutro. */
function preencherVariaveis(linguagem: string): string {
  const v: Record<string, string> = {
    destaque: "warm orange",
    fundo: "deep charcoal",
    titulo: "off-white",
    paleta: "charcoal, off-white and a warm orange accent",
    manchete: "an example headline",
    palavra: "example",
    foto: "an anonymous professional seen from the chest up",
    formato: "4:5 portrait post",
    cena: "a calm workspace with natural light",
  };
  return linguagem.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? "");
}

/** O prompt da prévia: um quadro de exemplo na linguagem do design, sem texto. */
export function promptDaPrevia(d: { tipo: string; linguagem: string; descricao: string }): string {
  const base = preencherVariaveis(d.linguagem).replace(/\s+/g, " ").trim();
  if (d.tipo === "video") {
    return `A single frame from a social video edited in this visual language, the presenter seen from the chest up on the left third, one graphic element of the style on the right: ${base}${GUARDA_DA_IMAGEM_ESTILIZADA}`;
  }
  return `${base}${/no text/i.test(base) ? "" : GUARDA_DA_IMAGEM_ESTILIZADA}`;
}

export type PreviaGerada = { id: string; nome: string; modelo: string; custoUsd: number; previaUrl: string };

/**
 * Gera as prévias pendentes, SÓ com a confirmação explícita do admin (que
 * viu o custo estimado na tela). Uma por vez, até o teto, e cada uma gravada
 * assim que sai: se a chamada cair no meio, o que foi pago fica guardado.
 */
export async function gerarPreviasPendentes(o: { confirmar: boolean; teto?: number; tipo?: TipoDeDesign; adminEmail: string }): Promise<{ geradas: PreviaGerada[]; falhas: Array<{ id: string; erro: string }>; custoUsd: number }> {
  if (o.confirmar !== true) throw new Error("A geração das prévias custa e só roda com a confirmação do admin.");
  const teto = Math.max(1, Math.min(TETO_DE_PREVIAS_POR_CHAMADA, o.teto ?? TETO_DE_PREVIAS_POR_CHAMADA));
  const pendentes = await prisma.designDaBiblioteca.findMany({
    where: { previaUrl: null, publico: true, ...(o.tipo ? { tipo: o.tipo } : {}) },
    orderBy: [{ usos: "desc" }, { createdAt: "asc" }],
    take: teto,
    select: { id: true, tipo: true, nome: true, descricao: true, linguagem: true },
  });
  const geradas: PreviaGerada[] = [];
  const falhas: Array<{ id: string; erro: string }> = [];
  let custoUsd = 0;
  for (const d of pendentes) {
    try {
      const img = await gerarImagem(promptDaPrevia(d), d.tipo === "video" ? "16:9" : "4:5", "standard", { operation: "biblioteca-previa" }, { tipo: "arte" });
      const salvo = await put(`biblioteca-de-design/previas/${d.id}.jpg`, dataUrlToBuffer(img.dataUrl), { ...midiaProduzida(), contentType: "image/jpeg", addRandomSuffix: true });
      await prisma.designDaBiblioteca.update({ where: { id: d.id }, data: { previaUrl: salvo.url, previaCustoUsd: img.custoUsd } });
      custoUsd += img.custoUsd;
      geradas.push({ id: d.id, nome: d.nome, modelo: img.modelo, custoUsd: img.custoUsd, previaUrl: salvo.url });
      console.log(`[biblioteca-de-design] prévia de "${d.nome}" por ${img.modelo}, US$ ${img.custoUsd.toFixed(3)} (pedida por ${o.adminEmail})`);
    } catch (e) {
      falhas.push({ id: d.id, erro: e instanceof Error ? e.message.slice(0, 160) : String(e) });
    }
  }
  return { geradas, falhas, custoUsd: +custoUsd.toFixed(4) };
}
