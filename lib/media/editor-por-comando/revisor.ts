import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev } from "@/lib/jev/cliente";
import { ehApoio } from "@/lib/media/editor-sob-medida/pecas";
import type { EdicaoResolvida } from "@/lib/media/editor-sob-medida/tipos";
import type { NotaDoRevisor } from "@/lib/media/editor-por-comando/diretor";

/**
 * O REVISOR DO EDITOR POR COMANDO (05/10/2026): olha quadros AMOSTRADOS do
 * vídeo já renderizado contra o comando do cliente, como foi feito na landing
 * (o olho no resultado, não no plano). Duas partes:
 *   1. VER: um modelo com visão (Sonnet, uma chamada só para todos os
 *      quadros) descreve cada quadro e aponta o problema e o conserto;
 *   2. DECIDIR: o JEV (sem visão, meio segundo) decide, quadro a quadro, se
 *      o problema descrito pede correção (fere o comando, texto ilegível ou
 *      cortado, peça cobrindo outra ou a legenda). Sem o JEV, vale o "grave"
 *      que o próprio olho marcou.
 * Nada aqui mexe na edição: as notas voltam ao diretor, que corrige o plano.
 */

export const MODELO_DO_REVISOR = process.env.EDITOR_POR_COMANDO_REVISOR || "claude-sonnet-5";

/** Os instantes amostrados: o meio de cada peça (até `teto`) e um trecho só de rosto, se houver. */
export function instantesDaRevisao(ed: EdicaoResolvida, teto = 10): Array<{ t: number; momento: string | null }> {
  const pecas = ed.camadas.filter((c) => !ehApoio(c)).sort((a, b) => a.de - b.de);
  const escolhidas = pecas.length <= teto ? pecas : Array.from({ length: teto }, (_, k) => pecas[Math.floor(((k + 0.5) * pecas.length) / teto)]);
  const saida: Array<{ t: number; momento: string | null }> = escolhidas.map((c) => ({ t: +Math.min(c.ate - 0.2, c.de + Math.max(0.9, (c.ate - c.de) * 0.6)).toFixed(2), momento: c.id }));
  // O maior trecho sem peça: o rosto sozinho também é julgado.
  let cursor = 0;
  let maior: [number, number] = [0, 0];
  for (const c of pecas) {
    if (c.de - cursor > maior[1] - maior[0]) maior = [cursor, c.de];
    cursor = Math.max(cursor, c.ate);
  }
  if (ed.duracao - cursor > maior[1] - maior[0]) maior = [cursor, ed.duracao];
  if (maior[1] - maior[0] > 3 && saida.length < teto + 1) saida.push({ t: +((maior[0] + maior[1]) / 2).toFixed(2), momento: null });
  return saida.sort((a, b) => a.t - b.t);
}

export type ResultadoDaRevisao = {
  quadros: number;
  notas: NotaDoRevisor[];
  /** Todas as observações do olho, aprovadas ou não (para o relatório). */
  vistas: Array<{ t: number; momento: string | null; descricao: string; problema: string | null; grave: boolean; corrigir: boolean; probabilidade: number | null }>;
  resumo: string;
  nota: number | null;
  erro?: string;
  ms: number;
};

const SISTEMA = `Você revisa um vídeo curto editado contra o COMANDO do cliente (o que ele pediu com as palavras dele). Você vê quadros do vídeo PRONTO, cada um com o instante e a peça que deveria estar na tela.

Para cada quadro diga, em português e curto:
- "descricao": o que se vê (peças, textos lidos letra por letra, imagem, a pessoa);
- "problema": o que está errado, ou null. Conta como problema: o quadro não parece o que o comando pediu (estilo, acabamento, cores, letra); texto ilegível, cortado pela borda, com palavra errada ou inventada; uma peça cobrindo outra ou cobrindo a legenda; legenda em cima de texto da peça; imagem feia, deformada ou com pessoa real reconhecível; tela vazia ou peça faltando no instante;
- "conserto": o que o diretor deve fazer (trocar a peça, mover, encurtar, reescrever o texto, tirar a imagem);
- "grave": true quando o problema é visível para qualquer pessoa e estraga o quadro.
No fim, "nota" de 0 a 10 para o quanto o vídeo atende o comando, e "resumo" em uma frase.

Responda só JSON: {"quadros":[{"t":1.2,"descricao":"...","problema":null,"conserto":"","grave":false}],"nota":8,"resumo":"..."}`;

export async function revisarPorComando(p: {
  edicao: EdicaoResolvida;
  comando: string;
  obterQuadros: (instantes: number[]) => Promise<Array<{ t: number; base64: string }>>;
  projectId?: string | null;
  teto?: number;
}): Promise<ResultadoDaRevisao> {
  const t0 = Date.now();
  const alvos = instantesDaRevisao(p.edicao, p.teto ?? 10);
  const quadros = await p.obterQuadros(alvos.map((a) => a.t)).catch(() => []);
  if (!quadros.length) return { quadros: 0, notas: [], vistas: [], resumo: "", nota: null, erro: "sem quadros do vídeo", ms: Date.now() - t0 };
  const pecaEm = (t: number) => alvos.reduce((m, a) => (Math.abs(a.t - t) < Math.abs(m.t - t) ? a : m), alvos[0]);
  const descricaoDaPeca = (id: string | null) => {
    const c = id ? p.edicao.camadas.find((x) => x.id === id) : null;
    return c ? `${c.peca} ${JSON.stringify(c.props).slice(0, 160)}` : "nenhuma peça (só a pessoa)";
  };
  let bruto: { quadros?: Array<{ t?: number; descricao?: string; problema?: string | null; conserto?: string; grave?: boolean }>; nota?: number; resumo?: string };
  try {
    const r = await askClaudeComImagens(
      SISTEMA,
      `# O COMANDO DO CLIENTE\n"${p.comando}"\n\nRevise os ${quadros.length} quadros acima.`,
      quadros.map((q) => ({ base64: q.base64, rotulo: `Quadro em ${q.t.toFixed(1)} s (peça prevista: ${descricaoDaPeca(pecaEm(q.t).momento)}):` })),
      { model: MODELO_DO_REVISOR, maxTokens: 8000, timeoutMs: 120_000, usage: { projectId: p.projectId ?? undefined, operation: "editor-por-comando-revisor" } }
    );
    bruto = extrairJson(r) as typeof bruto;
  } catch (e) {
    return { quadros: quadros.length, notas: [], vistas: [], resumo: "", nota: null, erro: e instanceof Error ? e.message.slice(0, 200) : String(e), ms: Date.now() - t0 };
  }
  const vistas0 = (bruto.quadros ?? []).map((q, k) => {
    const t = Number.isFinite(Number(q.t)) ? Number(q.t) : quadros[k]?.t ?? 0;
    return { t, momento: pecaEm(t).momento, descricao: String(q.descricao ?? "").slice(0, 400), problema: q.problema ? String(q.problema).slice(0, 300) : null, conserto: String(q.conserto ?? "").slice(0, 300), grave: Boolean(q.grave) };
  });
  // DECIDIR pelo JEV: o problema descrito pede correção? (sem visão: decide sobre a descrição do olho).
  const comProblema = vistas0.filter((v) => v.problema);
  const probs: Record<string, number | null> = {};
  if (comProblema.length && jevLigado()) {
    const perguntas: Record<string, PerguntaDoJev> = Object.fromEntries(
      comProblema.map((v, k) => [
        `q${k}`,
        {
          type: "noul",
          instructions: `Num vídeo editado, o revisor viu no quadro de ${v.t.toFixed(1)} s: "${v.descricao}". Problema apontado: "${v.problema}". Isso fere o comando do cliente, deixa texto ilegível ou cortado, ou põe uma coisa cobrindo outra, a ponto de valer refazer esse trecho?`,
        },
      ])
    );
    try {
      const r = await perguntarAoJev({ projectId: p.projectId, etapa: "editor-por-comando-revisor", state: { comando: p.comando } }, perguntas);
      comProblema.forEach((v, k) => (probs[`${v.t}`] = probabilidadeDeSim(r[`q${k}`])));
    } catch {
      // Sem o JEV, vale o "grave" do olho.
    }
  }
  const vistas = vistas0.map((v) => {
    const pr = probs[`${v.t}`] ?? null;
    const corrigir = Boolean(v.problema) && (pr === null ? v.grave : pr >= 0.5);
    return { t: v.t, momento: v.momento, descricao: v.descricao, problema: v.problema, grave: v.grave, corrigir, probabilidade: pr, conserto: v.conserto };
  });
  const notas: NotaDoRevisor[] = vistas.filter((v) => v.corrigir).map((v) => ({ t: v.t, momento: v.momento, problema: v.problema ?? "", conserto: v.conserto }));
  return {
    quadros: quadros.length,
    notas,
    vistas: vistas.map(({ conserto: _c, ...v }) => (void _c, v)),
    resumo: String(bruto.resumo ?? "").slice(0, 300),
    nota: Number.isFinite(Number(bruto.nota)) ? Number(bruto.nota) : null,
    ms: Date.now() - t0,
  };
}
