import sharp from "sharp";
import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { GUARDA_DE_IMAGEM, type PerfilDoProjeto } from "@/lib/media/perfil-do-projeto";
import { ASSETS_EM_VIDEO } from "@/lib/media/plano-de-montagem";
import type { AssetGerado } from "@/lib/media/assets-da-montagem";
import type { ObterQuadros } from "@/lib/media/demonstracao";

/**
 * A IMAGEM GERADA CONFERIDA CONTRA O PERFIL DO PROJETO (02/10/2026).
 *
 * Numa pregação cristã, a colagem "crowded sunny beach" do completo cmuqc9r7z
 * saiu com gente de biquíni em primeiro plano. O pedido proibia gente, e o
 * modelo de imagem desenhou assim mesmo; ninguém olhou antes de montar. Aqui
 * TODA imagem e todo vídeo gerado (um quadro do meio) passa por um modelo com
 * visão, contra a guarda de imagem de todo projeto e as guardas do setor, e a
 * reprovada sai: a cena volta para a pessoa (a resolução trata asset sem URL
 * como ausente). Junto, a RESOLUÇÃO: imagem menor que o quadro não é ampliada
 * para tela cheia (`pequenaParaTelaCheia`).
 *
 * Uma chamada para até 12 imagens, reduzidas a 512 px: centavos por vídeo.
 */

const SISTEMA = `Você confere imagens geradas por IA antes de entrarem no vídeo de um cliente. Cada imagem vem com o rótulo "Imagem k".

Reprove a imagem que tiver QUALQUER um destes:
- pessoa de roupa de banho, biquíni, sunga, roupa íntima, peito à mostra, roupa justa ou reveladora, pose sensual ou sugestiva;
- algo que conflite com as guardas do cliente abaixo;
- texto, letra ou número legível em destaque;
- rosto de pessoa em primeiro plano;
- imagem quebrada, borrada, deformada ou sem assunto claro.
Aprove o resto (lugar, objeto, paisagem, multidão ao longe vestida normalmente).

PEDIDO EXPLÍCITO DO CLIENTE: quando o rótulo da imagem traz "pedido do cliente", ele pediu aquilo (ex.: Jesus falando com a multidão, Moisés, gente com roupa da época). Aí APROVE pessoas, rostos, figuras históricas ou bíblicas e símbolos religiosos que o pedido traz, desde que a representação seja respeitosa e reverente. Continue reprovando o vulgar, o sensual, a roupa reveladora, a caricatura, o deboche, texto legível e qualquer pessoa real contemporânea identificável (político, celebridade).

Sem travessão. Responda SOMENTE com JSON válido, sem cerca de código:
{"imagens":[{"k":0,"aprovada":true,"motivo":"curto, em português"}]}`;

export type ConferenciaDaImagem = { aprovada: boolean; motivo: string; largura?: number; altura?: number };

/** A imagem é pequena demais para a tela cheia do quadro (02/10: nunca ampliar imagem de baixa resolução). */
export function pequenaParaTelaCheia(img: { largura?: number; altura?: number }, quadro: { largura: number; altura: number }): boolean {
  if (!img.largura || !img.altura) return false;
  // Cobrir o quadro (object-fit: cover) pede a escala do lado que mais falta.
  const escala = Math.max(quadro.largura / img.largura, quadro.altura / img.altura);
  return escala > 1.12;
}

async function baixar(url: string): Promise<Buffer> {
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status} em ${url.slice(-40)}`);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Confere os assets gerados. Devolve a lista com a reprovada SEM URL (origem
 * "reprovado", com o motivo) e as medidas de cada imagem. Falha da conferência
 * (rede, modelo) deixa o asset como está e escreve o erro: a guarda é rede de
 * segurança, a revisão visual do vídeo pronto olha de novo.
 */
export async function conferirAssets(
  assets: AssetGerado[],
  p: {
    perfil: PerfilDoProjeto | null;
    projectId?: string | null;
    quadroDoVideo?: (url: string) => ObterQuadros;
    /** Id do asset para o pedido do cliente (02/10): a conferência não reprova o que ele pediu com respeito. */
    pedidos?: Record<string, string>;
  }
): Promise<{ assets: AssetGerado[]; reprovados: Array<{ id: string; motivo: string }>; erro?: string }> {
  const alvo = assets.filter((a) => a.url && a.tipo !== "icone" && !a.conferencia);
  if (!alvo.length) return { assets, reprovados: [] };
  const imagens: Array<{ id: string; base64: string; largura?: number; altura?: number }> = [];
  for (const a of alvo) {
    try {
      let bruto: Buffer | null = null;
      if (ASSETS_EM_VIDEO.includes(a.tipo)) {
        if (!p.quadroDoVideo) continue;
        const q = (await p.quadroDoVideo(a.url!)([1.2]))[0];
        if (!q) continue;
        bruto = Buffer.from(q.base64, "base64");
      } else bruto = await baixar(a.url!);
      const meta = await sharp(bruto).metadata();
      const pequena = await sharp(bruto).flatten({ background: "#ffffff" }).resize({ width: 512, height: 512, fit: "inside" }).jpeg({ quality: 78 }).toBuffer();
      imagens.push({ id: a.id, base64: pequena.toString("base64"), ...(ASSETS_EM_VIDEO.includes(a.tipo) ? {} : { largura: meta.width, altura: meta.height }) });
    } catch {
      // Sem a imagem, não há o que conferir: fica como está.
    }
  }
  const guardas = [GUARDA_DE_IMAGEM, ...(p.perfil?.guardas ?? []), p.perfil?.evitarNaImagem ? `Evitar na imagem: ${p.perfil.evitarNaImagem}` : ""].filter(Boolean);
  const veredito = new Map<string, ConferenciaDaImagem>();
  let erro: string | undefined;
  try {
    for (let i = 0; i < imagens.length; i += 12) {
      const lote = imagens.slice(i, i + 12);
      const resposta = await askClaudeComImagens(
        SISTEMA,
        `Cliente: ${p.perfil?.nome ?? "projeto"}${p.perfil ? `, setor ${p.perfil.setor.nome}` : ""}.\nGuardas do cliente:\n${guardas.map((g) => `- ${g}`).join("\n")}\n\nConfira as ${lote.length} imagens acima (k de 0 a ${lote.length - 1}).`,
        lote.map((im, k) => ({ base64: im.base64, rotulo: `Imagem ${k}${p.pedidos?.[im.id] ? ` (pedido do cliente: "${p.pedidos[im.id].slice(0, 200)}")` : ""}` })),
        { effort: "low", maxTokens: 3000, timeoutMs: 120_000, usage: { projectId: p.projectId ?? undefined, operation: "montagem-conferencia-imagem" } }
      );
      const dados = extrairJson(resposta) as { imagens?: Array<{ k?: number; aprovada?: boolean; motivo?: string }> };
      for (const r of dados.imagens ?? []) {
        const im = typeof r.k === "number" ? lote[r.k] : undefined;
        if (!im) continue;
        veredito.set(im.id, { aprovada: r.aprovada !== false, motivo: String(r.motivo ?? "").slice(0, 160), largura: im.largura, altura: im.altura });
      }
    }
  } catch (e) {
    erro = e instanceof Error ? e.message.slice(0, 200) : "falhou";
  }
  const reprovados: Array<{ id: string; motivo: string }> = [];
  const saida = assets.map((a) => {
    const v = veredito.get(a.id);
    if (!v) return a;
    if (!v.aprovada) {
      reprovados.push({ id: a.id, motivo: v.motivo });
      return { ...a, url: null, origem: "reprovado" as const, conferencia: v, erro: `reprovada na conferência: ${v.motivo}` };
    }
    return { ...a, conferencia: v };
  });
  return { assets: saida, reprovados, ...(erro ? { erro } : {}) };
}
