import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { CAMADAS_DE_APOIO, ESTILOS_DO_VOX, FICHAS, PECAS, pecaNoEstilo, type FichaDaPeca, type PlanoDaPeca } from "@/lib/media/editor-sob-medida/pecas";
import type { Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { EdicaoDoEditor, MomentoDoEditor, Visual } from "@/lib/media/editor-sob-medida/tipos";
import type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";

/**
 * O DIRETOR DO EDITOR POR COMANDO (05/10/2026): o Opus lê a fala com os
 * tempos, o comando do cliente, a letra e as cores, e o catálogo das peças
 * Remotion que já existem (o nome, quando usar e as props de cada uma), e
 * ESCREVE o plano da composição daquele vídeo. Não há catálogo de estilos nem
 * regra que derrube peça depois: o diretor é o responsável pelo layout. O que
 * sai daqui é JSON validado (peça conhecida, props obrigatórias, âncoras na
 * fala); nenhum código do modelo executa.
 *
 * O mesmo diretor CORRIGE: recebe o plano que escreveu e as notas do revisor
 * por quadro e devolve o plano inteiro de novo.
 */

export const MODELO_DO_DIRETOR = process.env.EDITOR_POR_COMANDO_MODELO || "claude-opus-5";

/** O que o diretor escreve além da edição de sempre: o acabamento e o fundo. */
export type PlanoDoDiretor = EdicaoDoEditor & {
  tema?: { visual?: Visual; acabamento?: "tecnologico" | "luxo"; fundoColagem?: boolean };
};

export type EntradaDoDiretor = {
  frases: Frase[];
  duracao: number;
  formato: "9:16" | "16:9";
  comando: ComandoDoVideo;
  /** As cores e a letra já decididas (o código aplica; o diretor só sabe quais são). */
  cores: { acento: string; escuro: string; claro: string };
  fonte: string;
  /** Perfil do projeto e marca, em texto curto. */
  perfil?: string | null;
  titulo?: string | null;
  /** Quantas imagens geradas cabem no teto de custo deste vídeo. */
  imagens: number;
  quadros?: Array<{ t: number; base64: string }>;
  projectId?: string | null;
  timeoutMs?: number;
  /** A base do estilo classificada do comando (vox, lousa, consorcio...): o catálogo e a validação só aceitam as peças dela. */
  base: string;
  /** No completo: o bloco que este diretor escreve (frases f0 a f1 de `total` blocos em paralelo). */
  bloco?: { f0: number; f1: number; k: number; total: number } | null;
};

const NOME_DO_PLANO: Record<PlanoDaPeca, string> = {
  sobre: "SOBRE A PESSOA (ela segue cheia na tela)",
  lado: "AO LADO (a pessoa vai para um cartão do outro lado)",
  tela: "TELA CHEIA (cobre a gravação; a voz continua)",
};

/**
 * AS PEÇAS DO ESTILO DO COMANDO (05/10, segunda volta). A primeira prova
 * misturou estilos: o diretor recebeu o catálogo inteiro e pôs "pergaminho" e
 * "frase-impacto" (fundo azul escuro de outro acabamento) no meio do Vox, e o
 * Bruno reprovou. Agora cada base tem só as peças dela:
 *   - vox: só as de papel (worker/remotion/src/sob-medida/pecas/vox.tsx);
 *   - lousa e consorcio: as genéricas que valem nelas mais as da lousa;
 *   - o resto: só as genéricas (nenhuma peça de acabamento próprio).
 */
export function pecasDoEstilo(base: string): FichaDaPeca[] {
  const semApoio = PECAS.filter((p) => !CAMADAS_DE_APOIO.has(p.nome));
  if (ESTILOS_DO_VOX.includes(base)) return semApoio.filter((p) => p.estilos?.includes(base));
  return semApoio.filter((p) => pecaNoEstilo(p, base));
}

/** O texto curto que uma peça de fora carrega (para virar a peça do estilo). */
function textoDaPeca(props: Record<string, unknown>): string {
  for (const k of ["texto", "titulo", "manchete", "frase", "citacao", "palavra", "rotulo", "pergunta"]) {
    const v = props[k];
    if (typeof v === "string" && v.trim()) return v.replace(/\*\*/g, "").replace(/[.!]+$/, "").split(/\s+/).slice(0, 5).join(" ");
  }
  return "";
}

/**
 * Peça fora do estilo: no Vox vira MARCA-TEXTO de papel com o texto dela (nunca
 * fundo escuro de outro acabamento); sem texto, ou fora do Vox, cai.
 */
export function pecaNoEstiloDoComando(m: MomentoDoEditor, base: string): { momento: MomentoDoEditor | null; aviso?: string } {
  if (pecasDoEstilo(base).some((p) => p.nome === m.peca)) return { momento: m };
  const texto = textoDaPeca((m.props ?? {}) as Record<string, unknown>);
  if (ESTILOS_DO_VOX.includes(base) && texto.length >= 3) return { momento: { ...m, peca: "marca-texto", eventos: undefined, plano: undefined, props: { texto, posicao: "topo" } }, aviso: `${m.id}: "${m.peca}" fora do estilo virou marca-texto` };
  return { momento: null, aviso: `${m.id}: "${m.peca}" fora do estilo ${base}, saiu` };
}

/** O catálogo do estilo do comando (só as peças que existem nele). */
export function catalogoDoDiretor(base: string): string {
  return (["sobre", "lado", "tela"] as PlanoDaPeca[])
    .filter((pl) => pecasDoEstilo(base).some((p) => p.plano === pl))
    .map(
      (pl) =>
        `## ${NOME_DO_PLANO[pl]}\n` +
        pecasDoEstilo(base).filter((p) => p.plano === pl)
          .map((p) => `- ${p.nome}${p.estilos ? ` [acabamento ${p.estilos.includes("vox") ? "papel/Vox" : "lousa"}]` : ""} (${p.duracao[0]} a ${p.duracao[1]} s${p.eventosDe ? `; um evento por item de "${p.eventosDe}"` : p.umEvento ? "; um evento" : ""}${p.continua || p.plano === "tela" ? "; render contínuo" : ""}): ${p.quando}\n    props: ${p.props}`)
          .join("\n")
    )
    .join("\n\n");
}

const SISTEMA = `Você é o diretor de motion design da Demandou. O cliente descreveu, com as palavras dele, o vídeo que quer (o COMANDO). Você lê a fala com os tempos e ESCREVE a composição deste vídeo usando as peças Remotion que existem (o catálogo abaixo). O código desenha cada peça com a letra e as cores escolhidas; você escolhe a peça, o instante, o lugar e o texto.

# O COMANDO MANDA
- Tudo que o comando pede e o catálogo consegue desenhar, você usa: se pede papel recortado e colagem, as peças de papel (colagem, jornal, mapa-antigo, cronologia, censura, marca-texto, carimbo) dominam; se pede tecnológico passo a passo, passos-foco, linha-do-tempo, numero, barras, painel-lateral; se pede luxo minimalista, pouco texto, titulo-atras, numero, frase-impacto, muito respiro; se pede lousa, as peças de lousa.
- Não misture acabamentos que brigam (papel do Vox com vidro tecnológico) a não ser que o comando peça.
- Você é responsável pelo LAYOUT: nenhum código vai derrubar ou mover peça depois. Duas peças de tela cheia nunca ao mesmo tempo; uma peça de lado e uma de tela nunca ao mesmo tempo; peça sobre a pessoa pode conviver com outra sobre a pessoa só se ficarem em lugares diferentes (topo e centro). Deixe 0,2 s entre uma peça e a próxima que ocupa o mesmo lugar.
- A LEGENDA da fala ocupa a faixa de baixo do quadro (no vertical, o terço de baixo). Texto de peça sobre a pessoa vai no topo ou no centro, nunca embaixo.

# RITMO E FORMA
- Cada coisa importante que a voz diz ganha forma no instante em que é dita: lista vira passos que acendem um a um (eventos na palavra de cada item); número dito vira número; lugar dito vira mapa; data vira cronologia; citação vira jornal; polêmica vira censura.
- No corte vertical curto: algo novo a cada 3 a 8 s, os 2 primeiros segundos com o gancho (a frase-chave na tela), nenhum trecho de mais de 6 s só com o rosto, telas cheias de no máximo 6 s e somando no máximo 45% do tempo. Peças de tela têm render caro: prefira 4 a 7 telas num corte de 60 s, intercaladas com a pessoa.
- Texto curto, do próprio falante, em português do Brasil, sem travessão, sem ponto final em título. Destaque com **asteriscos** em 1 a 3 palavras. Nunca invente número, nome, dado ou promessa.

# IMAGENS GERADAS
- Fotos que as peças de papel pedem (recortes, foto, figura, marcos[].foto) são geradas: "descricao" em INGLÊS, concreta, de objeto, lugar, prédio, estátua genérica ou figura anônima de época. NUNCA pessoa real, famosa ou histórica identificável, nunca nome próprio na descrição.
- "insercoes" são imagens de cinema em tela cheia (briefing de foto em inglês, sem pessoas reconhecíveis, sem texto). O total de imagens novas (fotos das peças + inserções) cabe no teto informado na tarefa; acima disso, a peça usa uma foto de reserva.

# FUNDO ATRÁS DA PESSOA
- "tema.fundoColagem": true põe a colagem de papel ATRÁS da pessoa recortada nos trechos em que ela está cheia (só combina com o acabamento de papel). Custa render: use só se o comando pede colagem/papel.

# ÂNCORAS (o tempo é sempre da fala, nunca em segundos)
A fala vem numerada por frase: F12 é a frase 12, com o segundo em que começa.
- "F12" = começo da frase 12; "F12/fim" = fim dela; "F12:palavra" = começo daquela palavra na frase 12; "F12:palavra/fim" = fim dela; "F12:que#2" = a segunda ocorrência.
- "de" é a palavra que pede a peça; "ate" é quando ela sai; "eventos" um por item, na palavra em que cada item é dito.

# RESPOSTA
Só um JSON, sem texto antes ou depois:
{
  "leitura": "o que é o vídeo e como o comando vira forma, em 2 frases",
  "tema": { "visual": "vidro" | "impacto" | "documental", "acabamento": "tecnologico" | "luxo", "fundoColagem": false },
  "momentos": [ { "id": "m1", "peca": "...", "de": "F0:palavra", "ate": "F1/fim", "eventos": [], "props": { ... }, "porque": "curto" } ],
  "camera": [ { "de": "F4", "ate": "F4/fim", "zoom": 1.4, "foco": { "x": 0.5, "y": 0.4 }, "porque": "..." } ],
  "insercoes": [ { "id": "i1", "de": "F6:mar", "ate": "F6/fim", "briefing": "...", "porque": "..." } ],
  "enfases": ["F3:palavra"]
}
"visual" é o acabamento das peças genéricas: "documental" (papel, serifa), "impacto" (blocos fortes), "vidro" (tecnológico, painéis translúcidos). "acabamento" só vale para as peças de lousa.

# O CATÁLOGO DAS PEÇAS REMOTION
Este catálogo tem SÓ as peças do estilo do comando; não existe outra peça. Peça com outro nome sai do vídeo.
`;

function falaNumerada(frases: Frase[], bloco?: EntradaDoDiretor["bloco"]): string {
  return frases
    .map((f, k) => ({ f, k }))
    .filter(({ k }) => !bloco || (k >= bloco.f0 && k <= bloco.f1))
    .map(({ f, k }) => `F${k} [${f.inicio.toFixed(1)}s] ${f.texto}`)
    .join("\n");
}

/** A tarefa: o vídeo inteiro, ou só o bloco (o completo vai em blocos de ~5 min em paralelo). */
function tarefa(e: EntradaDoDiretor): string {
  const b = e.bloco;
  if (!b || b.total <= 1) return `Escreva a composição do vídeo inteiro (F0 a F${e.frases.length - 1}) seguindo o comando do cliente.`;
  return `O vídeo foi dividido em ${b.total} partes, escritas em paralelo por diretores com o mesmo comando. VOCÊ ESCREVE SÓ A PARTE ${b.k + 1}: de F${b.f0} a F${b.f1} (${e.frases[b.f0]?.inicio.toFixed(0)} s a ${e.frases[b.f1]?.fim.toFixed(0)} s). Todas as âncoras dentro desse intervalo; ids com o prefixo "b${b.k + 1}-". ${b.k === 0 ? "É o começo: abra forte." : ""}${b.k === b.total - 1 ? "É o fim: feche na chamada final, se houver." : ""} Num trecho longo o ritmo é o de vídeo de YouTube: algo novo a cada 6 a 15 s, telas cheias somando no máximo 30% do tempo.`;
}

/** Só os momentos com a âncora de início dentro do bloco. */
function dentroDoBloco(plano: PlanoDoDiretor, b: EntradaDoDiretor["bloco"]): PlanoDoDiretor {
  if (!b || b.total <= 1) return plano;
  const dentro = (a: string) => {
    const n = Number(String(a).match(/^F(\d+)/)?.[1] ?? -1);
    return n >= b.f0 && n <= b.f1;
  };
  const pre = (id: unknown, k: number, l: string) => `b${b.k + 1}-${String(id ?? `${l}${k + 1}`).replace(/^b\d+-/, "")}`.slice(0, 20);
  return {
    ...plano,
    momentos: plano.momentos.filter((m) => dentro(m.de)).map((m, k) => ({ ...m, id: pre(m.id, k, "m") })),
    camera: (plano.camera ?? []).filter((c) => dentro(c.de)),
    insercoes: (plano.insercoes ?? []).filter((x) => dentro(x.de)).map((x, k) => ({ ...x, id: pre(x.id, k, "i") })),
    enfases: (plano.enfases ?? []).filter(dentro),
  };
}

function contextoDaTarefa(e: EntradaDoDiretor): string {
  return [
    `FORMATO: ${e.formato === "9:16" ? "vertical 9:16 (celular): as peças no alto e no meio; a base é da legenda e da interface da rede" : "deitado 16:9"}. DURAÇÃO: ${e.duracao.toFixed(1)} s.`,
    e.titulo ? `TÍTULO DO CORTE: ${e.titulo}` : "",
    e.perfil ?? "",
    `# O COMANDO DO CLIENTE\n"${e.comando.texto}"`,
    `# AS RESPOSTAS DO CLIENTE\n- Letra dos títulos: ${e.fonte}\n- Cores: acento ${e.cores.acento}, escuro ${e.cores.escuro}, claro ${e.cores.claro} (${e.comando.cores.tipo === "marca" ? "as da marca do projeto" : "escolhidas para este vídeo"})`,
    `# TETO DE IMAGENS NOVAS NESTE VÍDEO: ${e.imagens}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

// ─────────────────────────────── a validação ───────────────────────────────

/** As props de topo que a ficha pede sem "?" (o texto da ficha, separado por vírgula fora de parênteses). */
export function propsObrigatorias(peca: string): string[] {
  const f = FICHAS[peca];
  if (!f || /^nenhuma/i.test(f.props.trim())) return [];
  const partes: string[] = [];
  let prof = 0;
  let aspas = false;
  let atual = "";
  for (const ch of f.props) {
    if (ch === "'" || ch === '"') aspas = !aspas;
    if (!aspas && "([{".includes(ch)) prof++;
    if (!aspas && ")]}".includes(ch)) prof = Math.max(0, prof - 1);
    if (ch === "," && prof === 0 && !aspas) {
      partes.push(atual);
      atual = "";
    } else atual += ch;
  }
  partes.push(atual);
  return partes
    .map((p) => p.trim().match(/^([a-zA-Z]+)(\?)?/))
    .filter((m): m is RegExpMatchArray => Boolean(m && !m[2]))
    .map((m) => m[1]);
}

const ANCORA = /^F\d+(:[^/#]+(#\d+)?)?(\/fim)?$/;
const vazio = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && !v.length);

/**
 * O SCHEMA do plano: peça que existe e não é de apoio, âncoras no formato,
 * props obrigatórias presentes. O que não passa SAI com o motivo (o revisor
 * vê o vídeo depois e o diretor corrige); nada é inventado no lugar.
 */
export function validarPlano(bruto: unknown, base: string): { plano: PlanoDoDiretor; avisos: string[] } {
  const j = (bruto && typeof bruto === "object" ? bruto : {}) as Record<string, unknown>;
  const avisos: string[] = [];
  const momentos: MomentoDoEditor[] = [];
  const lista = Array.isArray(j.momentos) ? j.momentos : [];
  lista.forEach((m0, k) => {
    const m = (m0 && typeof m0 === "object" ? m0 : {}) as Record<string, unknown>;
    const id = String(m.id ?? `m${k + 1}`).replace(/[^a-z0-9-]/gi, "").slice(0, 20) || `m${k + 1}`;
    const peca0 = String(m.peca ?? "");
    if (!FICHAS[peca0] || CAMADAS_DE_APOIO.has(peca0)) return avisos.push(`${id}: peça "${peca0}" não existe`);
    // Peça fora do estilo do comando: vira a peça do estilo (no Vox, marca-texto) ou sai.
    const ajuste = pecaNoEstiloDoComando({ id, peca: peca0, de: "", ate: "", props: (m.props ?? {}) as Record<string, unknown> }, base);
    if (ajuste.aviso) avisos.push(ajuste.aviso);
    if (!ajuste.momento) return;
    const peca = ajuste.momento.peca;
    if (peca !== peca0) {
      m.props = ajuste.momento.props;
      m.eventos = undefined;
      m.plano = undefined;
    }
    const de = String(m.de ?? "").trim();
    const ate = String(m.ate ?? "").trim();
    if (!ANCORA.test(de) || !ANCORA.test(ate)) return avisos.push(`${id}: âncora fora do formato (${de} a ${ate})`);
    const props = (m.props && typeof m.props === "object" && !Array.isArray(m.props) ? m.props : {}) as Record<string, unknown>;
    const faltam = propsObrigatorias(peca).filter((p) => vazio(props[p]));
    if (faltam.length) return avisos.push(`${id}: ${peca} sem ${faltam.join(", ")}`);
    const eventos = Array.isArray(m.eventos) ? m.eventos.map(String).filter((a) => ANCORA.test(a)) : undefined;
    const plano = ["cheio", "grafico", "cartao"].includes(String(m.plano)) ? (m.plano as MomentoDoEditor["plano"]) : undefined;
    momentos.push({ id, peca, de, ate, ...(eventos?.length ? { eventos } : {}), ...(plano ? { plano } : {}), props, porque: typeof m.porque === "string" ? m.porque.slice(0, 200) : undefined });
  });
  const tema0 = (j.tema && typeof j.tema === "object" ? j.tema : {}) as Record<string, unknown>;
  const tema: PlanoDoDiretor["tema"] = {
    visual: ["vidro", "impacto", "documental"].includes(String(tema0.visual)) ? (tema0.visual as Visual) : undefined,
    acabamento: tema0.acabamento === "luxo" ? "luxo" : tema0.acabamento === "tecnologico" ? "tecnologico" : undefined,
    fundoColagem: tema0.fundoColagem === true,
  };
  const camera = (Array.isArray(j.camera) ? j.camera : [])
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : {}))
    .filter((c) => ANCORA.test(String(c.de ?? "")) && ANCORA.test(String(c.ate ?? "")) && Number(c.zoom) >= 1)
    .map((c) => ({
      de: String(c.de),
      ate: String(c.ate),
      zoom: Math.min(2, Number(c.zoom)),
      foco: c.foco && typeof c.foco === "object" ? { x: Number((c.foco as { x?: unknown }).x) || 0.5, y: Number((c.foco as { y?: unknown }).y) || 0.4 } : undefined,
      movimento: c.movimento === "empurrao" ? ("empurrao" as const) : ("fixo" as const),
    }));
  // No Vox a imagem é a foto de arquivo dentro do papel: nenhuma cena de cinema em tela cheia.
  const insercoes = (Array.isArray(j.insercoes) && !ESTILOS_DO_VOX.includes(base) ? j.insercoes : [])
    .map((x) => (x && typeof x === "object" ? (x as Record<string, unknown>) : {}))
    .filter((x) => ANCORA.test(String(x.de ?? "")) && ANCORA.test(String(x.ate ?? "")) && typeof x.briefing === "string" && x.briefing.length > 10)
    .map((x, k) => ({ id: String(x.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "").slice(0, 20) || `i${k + 1}`, de: String(x.de), ate: String(x.ate), briefing: String(x.briefing).slice(0, 900) }));
  const enfases = (Array.isArray(j.enfases) ? j.enfases : []).map(String).filter((a) => ANCORA.test(a));
  return { plano: { leitura: typeof j.leitura === "string" ? j.leitura.slice(0, 600) : "", tema, momentos, camera, insercoes, enfases }, avisos };
}

// ─────────────────────────────── as chamadas ───────────────────────────────

async function chamar(mensagem: string, e: EntradaDoDiretor, operacao: string): Promise<unknown> {
  const quadros = (e.quadros ?? []).slice(0, 4);
  const r = await askClaudeComImagens(
    SISTEMA + catalogoDoDiretor(e.base),
    mensagem,
    quadros.map((q) => ({ base64: q.base64, rotulo: `Quadro da gravação em ${q.t.toFixed(1)} s:` })),
    { model: MODELO_DO_DIRETOR, maxTokens: 24000, effort: "medium", timeoutMs: e.timeoutMs ?? 240_000, usage: { projectId: e.projectId ?? undefined, operation: operacao } }
  );
  return extrairJson(r);
}

/** O plano da composição (uma chamada; a segunda só se a primeira não validou nada). */
export async function escreverPlano(e: EntradaDoDiretor): Promise<{ plano: PlanoDoDiretor; avisos: string[]; erro?: string }> {
  const msg = `${contextoDaTarefa(e)}\n\n# A FALA, NUMERADA\n${falaNumerada(e.frases, e.bloco)}\n\n# A TAREFA\n${tarefa(e)}`;
  let erro = "";
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const v = validarPlano(await chamar(msg, e, "editor-por-comando-diretor"), e.base);
      v.plano = dentroDoBloco(v.plano, e.bloco);
      if (v.plano.momentos.length) return v;
      erro = `plano sem momentos válidos (${v.avisos.slice(0, 3).join("; ")})`;
    } catch (err) {
      erro = err instanceof Error ? err.message.slice(0, 200) : String(err);
    }
  }
  return { plano: { momentos: [] }, avisos: [], erro };
}

export type NotaDoRevisor = { t: number; momento: string | null; problema: string; conserto: string };

/** O diretor corrige o próprio plano com as notas do revisor (devolve o plano inteiro). */
export async function corrigirPlano(e: EntradaDoDiretor, plano: PlanoDoDiretor, notas: NotaDoRevisor[], resumo: string): Promise<{ plano: PlanoDoDiretor; avisos: string[]; erro?: string }> {
  const msg = `${contextoDaTarefa(e)}\n\n# A FALA, NUMERADA\n${falaNumerada(e.frases, e.bloco)}\n\n# O PLANO QUE VOCÊ ESCREVEU\n${JSON.stringify(plano)}\n\n# O QUE O REVISOR VIU NO VÍDEO RENDERIZADO (contra o comando do cliente)\n${resumo}\n${notas.map((n) => `- ${n.t.toFixed(1)} s${n.momento ? ` (${n.momento})` : ""}: ${n.problema} -> ${n.conserto}`).join("\n")}\n\n# A TAREFA\nCorrija o plano: resolva cada nota (troque a peça, mova, encurte, reescreva o texto, mude o lugar), mantenha o que está bom e devolva o plano INTEIRO no mesmo formato JSON.`;
  try {
    const v = validarPlano(await chamar(msg, { ...e, quadros: [] }, "editor-por-comando-correcao"), e.base);
    v.plano = dentroDoBloco(v.plano, e.bloco);
    if (v.plano.momentos.length) return v;
    return { plano, avisos: v.avisos, erro: "correção sem momentos válidos" };
  } catch (err) {
    return { plano, avisos: [], erro: err instanceof Error ? err.message.slice(0, 200) : String(err) };
  }
}
