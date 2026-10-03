import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import type { Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
import type { DefeitoDaRevisao } from "@/lib/media/editor-sob-medida/editor";

/**
 * O REVISOR COM VISÃO DO EDITOR SOB MEDIDA (03/10/2026): olha os quadros da
 * PRÉVIA renderizada (não o plano em texto) e julga cada peça contra a fala
 * daquele instante e contra a referência do estilo: texto legível, nada
 * cobrindo a demonstração ou o rosto sem motivo, peça coerente com o que é
 * dito, acabamento. Cada peça é vista pelo menos uma vez, já assentada.
 */

const POR_CHAMADA = 12;

const SISTEMA = `Você é o diretor de arte que aprova a edição de vídeo antes de ir ao ar. A régua é o vídeo de pitch da landing da Demandou: hierarquia clara (rótulo, título, apoio), peça desenhada para o que é dito, legível no celular, nas cores da marca, nada mal alinhado ou cortado.

Cada quadro vem com o instante, a peça que está na tela (ou nenhuma) e a frase que está sendo dita. Para cada quadro, procure DEFEITOS reais:
- "ilegivel": texto pequeno demais para o celular, cortado na borda, sobreposto a outro texto, baixo contraste;
- "cobre": a peça cobre o rosto ou algo que a pessoa está mostrando (objeto, tela) quando não devia;
  (o TÍTULO GIGANTE ATRÁS DA PESSOA é proposital: a pessoa recortada passa na frente dele e esconde parte das letras; só é defeito se a palavra ficar impossível de ler)
- "incoerente": a peça não tem a ver com a frase dita, ou mostra dado/número/nome que a fala não diz;
- "feio": desalinhado, vazio demais, apertado, amador, fora do estilo de referência;
- "vazio": tela sem pessoa e sem conteúdo;
- "imagem": inserção gerada inadequada (estranha, gente sensual, texto deformado, fora do setor).
A legenda pequena embaixo é esperada e não é defeito. Peça entrando ou saindo (meio transparente) não é defeito.
Seja exigente com o que é defeito de verdade e não invente: um quadro bom não tem defeito.

Responda só JSON:
{ "defeitos": [ { "k": 0, "tipo": "ilegivel", "descricao": "curta, o que está errado", "conserto": "o que fazer" } ], "nota": 0 a 10 (o conjunto destes quadros contra a régua do pitch e a referência), "falta": "uma frase: o que mais falta para chegar no pitch" }`;

export type ResultadoDaRevisao = {
  defeitos: DefeitoDaRevisao[];
  quadros: number;
  nota: number | null;
  falta: string[];
  erro?: string | null;
};

/** Os instantes a olhar: cada peça assentada (e depois do último passo) e uma amostra a cada `passo` s. */
export function instantesDaRevisaoSobMedida(ed: EdicaoResolvida, passo = 20, soIds?: string[] | null): Array<{ t: number; momento: string | null }> {
  const saida: Array<{ t: number; momento: string | null }> = [];
  for (const c of ed.camadas) {
    if (c.peca === "moldura-do-cartao") continue;
    if (soIds && !soIds.includes(c.id)) continue;
    const assentado = Math.min(c.ate - 0.2, c.de + c.entrada + 0.35);
    saida.push({ t: assentado, momento: c.id });
    const ult = c.eventos.at(-1);
    if (ult !== undefined && ult + c.evento + 0.2 < c.ate - 0.2 && ult - assentado > 1) saida.push({ t: ult + c.evento + 0.15, momento: c.id });
  }
  if (!soIds) {
    for (let t = passo / 2; t < ed.duracao; t += passo) {
      const ocupado = ed.camadas.some((c) => t >= c.de && t < c.ate);
      if (!ocupado) saida.push({ t, momento: null });
    }
  }
  return saida.sort((a, b) => a.t - b.t);
}

function fraseEm(frases: Frase[], t: number): string {
  const f = frases.find((x) => t >= x.inicio - 0.2 && t <= x.fim + 0.4) ?? frases.find((x) => x.inicio > t);
  return f ? f.texto.slice(0, 220) : "";
}

export async function revisarPrevia(p: {
  edicao: EdicaoResolvida;
  frases: Frase[];
  obterQuadros: (instantes: number[]) => Promise<Array<{ t: number; base64: string }>>;
  referencia: string;
  /** Deslocamento do arquivo (abertura na frente); a prévia não tem. */
  deslocamento?: number;
  soIds?: string[] | null;
  projectId?: string | null;
  modelo?: string;
  /** Amostra dos trechos sem peça, em segundos (20 no completo; o corte curto olha mais de perto). */
  passo?: number;
}): Promise<ResultadoDaRevisao & { olhados: Array<{ t: number; momento: string | null; base64: string }> }> {
  const alvo = instantesDaRevisaoSobMedida(p.edicao, p.passo ?? 20, p.soIds);
  const desloc = p.deslocamento ?? 0;
  const defeitos: DefeitoDaRevisao[] = [];
  const notas: number[] = [];
  const falta: string[] = [];
  let erro: string | null = null;
  let olhados: Array<{ t: number; momento: string | null; base64: string }> = [];
  try {
    const q = await p.obterQuadros(alvo.map((a) => a.t + desloc));
    olhados = q.map((x) => {
      const a = alvo.find((y) => Math.abs(y.t + desloc - x.t) < 0.01) ?? alvo[0];
      return { t: x.t - desloc, momento: a?.momento ?? null, base64: x.base64 };
    });
    const lotes: Array<typeof olhados> = [];
    for (let i = 0; i < olhados.length; i += POR_CHAMADA) lotes.push(olhados.slice(i, i + POR_CHAMADA));
    const pecaDe = (id: string | null) => (id ? p.edicao.camadas.find((c) => c.id === id) : null);
    await Promise.all(
      lotes.map(async (lote) => {
        const resposta = await askClaudeComImagens(
          SISTEMA,
          `# REFERÊNCIA DO ESTILO\n${p.referencia.slice(0, 2500)}\n\nConfira os ${lote.length} quadros acima (k de 0 a ${lote.length - 1}).`,
          lote.map((q, k) => {
            const c = pecaDe(q.momento);
            return { base64: q.base64, rotulo: `k=${k}, ${q.t.toFixed(1)} s, peça: ${c ? `${c.id} (${c.peca}: ${JSON.stringify(c.props).slice(0, 160)})` : "nenhuma"}; fala: "${fraseEm(p.frases, q.t)}"` };
          }),
          { model: p.modelo, effort: "low", maxTokens: 6000, timeoutMs: 180_000, usage: { projectId: p.projectId ?? undefined, operation: "editor-sob-medida-revisao" } }
        );
        const j = extrairJson(resposta) as { defeitos?: Array<{ k?: number; tipo?: string; descricao?: string; conserto?: string }>; nota?: number; falta?: string };
        if (typeof j.nota === "number") notas.push(j.nota);
        if (j.falta) falta.push(String(j.falta).slice(0, 240));
        for (const d of j.defeitos ?? []) {
          const q = typeof d.k === "number" ? lote[d.k] : undefined;
          if (!q) continue;
          defeitos.push({ momento: q.momento, t: q.t, tipo: String(d.tipo ?? "feio"), descricao: String(d.descricao ?? "").slice(0, 220), conserto: String(d.conserto ?? "").slice(0, 220) });
        }
      })
    );
  } catch (e) {
    erro = e instanceof Error ? e.message.slice(0, 200) : "falhou";
  }
  return {
    defeitos,
    quadros: olhados.length,
    nota: notas.length ? +(notas.reduce((s, x) => s + x, 0) / notas.length).toFixed(1) : null,
    falta,
    erro,
    olhados,
  };
}
