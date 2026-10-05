import { askClaude } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import { decidirChoice, jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import type { FichaDaPeca } from "@/lib/media/editor-sob-medida/pecas";
import type { Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { MomentoDoEditor } from "@/lib/media/editor-sob-medida/tipos";
import type { ComandoDoVideo } from "@/lib/media/editor-por-comando/comando";
import { pecasDoEstilo, validarPlano, type PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import type { PedidoDaCena } from "@/lib/media/roteiro-em-texto";

/**
 * O PLANO PELO JEV (05/10/2026, à tarde). Regra do Bruno: "mude o diretor
 * para o JEV; LLM somente para texto que precisa ser criado, não escolhas,
 * decisões, nada". Então:
 *
 *   1. O JEV DECIDE, frase a frase da fala (lib/jev/cliente.ts, meio segundo
 *      por lote de 40 perguntas): esta frase pede uma TELA de papel ou de
 *      gráfico, ou só uma peça sobre a pessoa, ou nada; qual peça do estilo
 *      desenha o que ela diz; e se há uma palavra forte para o soco de câmera.
 *      O código aplica as regras explícitas de ritmo (quantas telas por
 *      minuto, o espaço entre peças, a duração de cada ficha) e monta o
 *      esqueleto: peça, frase de entrada, frase de saída.
 *   2. O REDATOR (Sonnet, UMA chamada por bloco de ~5 min, todos em paralelo)
 *      só ESCREVE os textos das peças decididas: título, palavras de
 *      destaque, manchete, a descrição em inglês da foto de arquivo. Nenhuma
 *      decisão de peça, lugar ou tempo passa por ele.
 *   3. O JEV CONFERE cada texto escrito (curto, claro, sem dado inventado);
 *      o que reprova sai antes do render. Nenhuma rodada de correção por LLM.
 *
 * O caminho do diretor Opus (diretor.ts) continua atrás de
 * EDITOR_POR_COMANDO_DIRETOR=opus, para comparar.
 */

export const MODELO_DO_REDATOR = process.env.EDITOR_POR_COMANDO_REDATOR || "claude-sonnet-5";

/** O diretor por LLM (Opus) só quando pedido de propósito; o padrão é o JEV decidir. */
export function diretorPorLlm(): boolean {
  return process.env.EDITOR_POR_COMANDO_DIRETOR === "opus";
}

export type EntradaDoPlanoPeloJev = {
  frases: Frase[];
  duracao: number;
  formato: "9:16" | "16:9";
  comando: ComandoDoVideo;
  /** A base do estilo já classificada (vox, lousa, consorcio, keynote...). */
  base: string;
  titulo?: string | null;
  perfil?: string | null;
  projectId?: string | null;
  /** Os pedidos do cliente cena a cena (tela de roteiro), no tempo desta fala. */
  pedidos?: PedidoDaCena[];
};

/** Um momento decidido pelo JEV, antes do texto. */
export type MomentoDecidido = {
  id: string;
  peca: string;
  /** Índices das frases que a peça cobre (inclusivos). */
  f0: number;
  f1: number;
  inicio: number;
  fim: number;
  tela: boolean;
  /** O pedido do cliente que caiu aqui, quando houve. */
  pedido?: string | null;
};

// ─────────────────────────────── as regras de ritmo ───────────────────────────────

/**
 * O RITMO EXPLÍCITO (as regras que antes moravam no prompt do diretor):
 *   corte (vertical curto): algo novo a cada 3 a 8 s; telas de no máximo 6 s,
 *     somando até 45% do tempo, com 4 s de rosto entre duas; sem tela nos 2
 *     primeiros segundos (o gancho é texto sobre a pessoa).
 *   longo (YouTube): tela a cada 40 a 60 s, sobre a pessoa a cada 10 a 15 s;
 *     telas de no máximo 8 s.
 */
function regras(formato: "9:16" | "16:9", duracao: number) {
  const curto = duracao <= 95 || formato === "9:16";
  return curto
    ? { espacoSobre: 3, espacoTela: 4, telaMaxSeg: 6, telasMaxFracao: 0.45, telaDepoisDe: 2, probTela: 0.55, probSobre: 0.5, minFraseTela: 1.2, minFraseSobre: 0.8 }
    : { espacoSobre: 10, espacoTela: 40, telaMaxSeg: 8, telasMaxFracao: 0.2, telaDepoisDe: 3, probTela: 0.6, probSobre: 0.55, minFraseTela: 2, minFraseSobre: 1.2 };
}

const nomeDaPeca = (p: FichaDaPeca) => `${p.nome}: ${p.quando.replace(/\s+/g, " ").slice(0, 220)}`;

/**
 * AS DECISÕES DO JEV, frase a frase, num lote só (o cliente divide em
 * pedidos de 40 e roda 4 em paralelo). Sem JEV (sem chave), nenhuma peça
 * é decidida: o vídeo sai com a pessoa, a legenda e a câmera de ritmo.
 */
export async function decidirPeloJev(e: EntradaDoPlanoPeloJev): Promise<{ momentos: MomentoDecidido[]; enfases: string[]; avisos: string[]; perguntas: number }> {
  const avisos: string[] = [];
  const R = regras(e.formato, e.duracao);
  const pecas = pecasDoEstilo(e.base);
  const deTela = pecas.filter((p) => p.plano === "tela" && p.nome !== "fecho");
  const sobre = pecas.filter((p) => p.plano !== "tela");
  if (!jevLigado()) return { momentos: [], enfases: [], avisos: ["JEV desligado: o vídeo sai sem peças"], perguntas: 0 };
  if (!e.frases.length) return { momentos: [], enfases: [], avisos: [], perguntas: 0 };

  // As perguntas: por frase, a tela, a peça sobre a pessoa e a palavra forte.
  const perguntas: Record<string, PerguntaDoJev> = {};
  const contexto = (k: number) => {
    const ant = e.frases[k - 1]?.texto ? `Frase anterior: "${e.frases[k - 1].texto.slice(0, 160)}". ` : "";
    return `${ant}FRASE AVALIADA (${e.frases[k].inicio.toFixed(0)} s): "${e.frases[k].texto.slice(0, 260)}".`;
  };
  const criteriosTela = Object.fromEntries([...deTela.map((p) => [p.nome, nomeDaPeca(p)]), ["nenhuma", "nenhuma: a frase não pede tela cheia (é transição, emoção, conversa solta, ou o rosto basta)"]]);
  const criteriosSobre = Object.fromEntries([...sobre.map((p) => [p.nome, nomeDaPeca(p)]), ["nenhuma", "nenhuma: nada a destacar nesta frase"]]);
  e.frases.forEach((f, k) => {
    const dur = f.fim - f.inicio;
    if (dur >= R.minFraseTela && deTela.length) {
      perguntas[`tela_${k}`] = { type: "noul", instructions: `${contexto(k)} Esta frase conta um FATO, uma HISTÓRIA, um LUGAR, uma DATA, uma CITAÇÃO, uma LISTA ou um NÚMERO que mereça uma tela cheia ilustrada no estilo pedido pelo cliente, tirando o rosto da tela por alguns segundos?` };
      perguntas[`qualtela_${k}`] = { type: "choice", instructions: `${contexto(k)} Se esta frase ganhasse uma TELA CHEIA, qual peça desenha melhor o que ela diz?`, criteria: criteriosTela };
    }
    if (dur >= R.minFraseSobre && sobre.length) {
      perguntas[`sobre_${k}`] = { type: "noul", instructions: `${contexto(k)} Esta frase tem uma FRASE-CHAVE, um NÚMERO, um VEREDITO ou uma DEFINIÇÃO que valha um destaque curto na tela, com a pessoa continuando a falar?` };
      perguntas[`qualsobre_${k}`] = { type: "choice", instructions: `${contexto(k)} Se esta frase ganhasse um destaque curto SOBRE a pessoa, qual peça serve?`, criteria: criteriosSobre };
    }
    if (dur >= 0.6) perguntas[`enfase_${k}`] = { type: "noul", instructions: `${contexto(k)} Há nesta frase UMA palavra forte (o número, o nome, a palavra da tese, a virada) que mereça um soco de câmera?` };
  });
  let r: Record<string, RespostaDoJev> = {};
  try {
    r = await perguntarAoJev(
      {
        projectId: e.projectId,
        etapa: "editor-por-comando-plano",
        state: { comando: e.comando.texto, estilo: e.base, formato: e.formato, titulo: e.titulo ?? "", regra: "Decida só pelo que a frase DIZ; peça de tela cheia é para fato, história, lugar, data, citação, lista ou número; destaque sobre a pessoa é para a frase-chave, o número, o veredito." },
      },
      perguntas
    );
  } catch (err) {
    return { momentos: [], enfases: [], avisos: [`JEV falhou: ${err instanceof Error ? err.message.slice(0, 120) : err}`], perguntas: Object.keys(perguntas).length };
  }

  // O ritmo: o código monta o esqueleto a partir das respostas.
  const momentos: MomentoDecidido[] = [];
  const enfases: string[] = [];
  const nomesTela = deTela.map((p) => p.nome);
  const nomesSobre = sobre.map((p) => p.nome);
  let fimDaUltima = -10;
  let fimDaUltimaTela = -10;
  let segundosDeTela = 0;
  const pedidoNaFrase = (f: Frase) => (e.pedidos ?? []).find((p) => p.inicio < f.fim && p.fim > f.inicio)?.texto ?? null;
  e.frases.forEach((f, k) => {
    const pedido = pedidoNaFrase(f);
    const forcado = Boolean(pedido && !/sem efeito|sem peça|sem nada|deixa limpo/i.test(pedido));
    const semEfeito = Boolean(pedido && /sem efeito|sem peça|sem nada|deixa limpo/i.test(pedido));
    if (semEfeito) return;
    const pTela = probabilidadeDeSim(r[`tela_${k}`]) ?? 0;
    const pSobre = probabilidadeDeSim(r[`sobre_${k}`]) ?? 0;
    const qualTela = decidirChoice(r[`qualtela_${k}`], [...nomesTela, "nenhuma"], "nenhuma", 0.3);
    const qualSobre = decidirChoice(r[`qualsobre_${k}`], [...nomesSobre, "nenhuma"], "nenhuma", 0.3);
    const dur = f.fim - f.inicio;
    const podeTela = f.inicio >= R.telaDepoisDe && f.inicio - fimDaUltimaTela >= R.espacoTela && (segundosDeTela + Math.min(dur, R.telaMaxSeg)) / e.duracao <= R.telasMaxFracao;
    const podeSobre = f.inicio - fimDaUltima >= R.espacoSobre;
    let peca: string | null = null;
    let tela = false;
    if (qualTela !== "nenhuma" && (pTela >= R.probTela || forcado) && (podeTela || forcado) && f.inicio >= R.telaDepoisDe) {
      peca = qualTela;
      tela = true;
    } else if (qualSobre !== "nenhuma" && (pSobre >= R.probSobre || forcado) && (podeSobre || forcado)) {
      peca = qualSobre;
    }
    if (peca) {
      const ficha = pecas.find((p) => p.nome === peca)!;
      const fim = Math.min(f.fim, f.inicio + (tela ? Math.min(R.telaMaxSeg, ficha.duracao[1]) : ficha.duracao[1]));
      momentos.push({ id: `j${k}`, peca, f0: k, f1: k, inicio: f.inicio, fim: Math.max(fim, f.inicio + ficha.duracao[0]), tela, pedido });
      fimDaUltima = Math.max(fim, f.inicio + ficha.duracao[0]);
      if (tela) {
        fimDaUltimaTela = fimDaUltima;
        segundosDeTela += fimDaUltima - f.inicio;
      }
    }
    if ((probabilidadeDeSim(r[`enfase_${k}`]) ?? 0) >= 0.6) enfases.push(`F${k}`);
  });
  // O GANCHO DO CORTE (regra explícita): o vertical curto abre com texto na tela nos 3
  // primeiros segundos. Sem peça ali, a frase de abertura ganha a peça sobre a pessoa
  // que o JEV escolheu para ela (ou a primeira do estilo, o marca-texto no Vox).
  const curto = e.duracao <= 95 || e.formato === "9:16";
  if (curto && sobre.length && e.frases[0] && !momentos.some((m) => m.inicio < 3)) {
    const f = e.frases[0];
    const escolhida = decidirChoice(r["qualsobre_0"], [...nomesSobre, "nenhuma"], "nenhuma", 0.3);
    const peca = escolhida !== "nenhuma" ? escolhida : nomesSobre.includes("marca-texto") ? "marca-texto" : nomesSobre[0];
    const ficha = pecas.find((p) => p.nome === peca)!;
    momentos.unshift({ id: "j0", peca, f0: 0, f1: 0, inicio: f.inicio, fim: Math.max(f.inicio + ficha.duracao[0], Math.min(f.fim, f.inicio + ficha.duracao[1])), tela: false, pedido: pedidoNaFrase(f) });
    momentos.sort((a, b) => a.inicio - b.inicio);
  }
  // Duas peças não se cruzam: a que entra enquanto a anterior ainda está na tela sai (a anterior manda).
  const limpos: MomentoDecidido[] = [];
  for (const m of momentos) {
    const ant = limpos[limpos.length - 1];
    if (ant && m.inicio < ant.fim + 0.2) {
      avisos.push(`${m.id}: cruzava ${ant.id}, saiu`);
      continue;
    }
    limpos.push(m);
  }
  return { momentos: limpos, enfases, avisos, perguntas: Object.keys(perguntas).length };
}

// ─────────────────────────────── o redator ───────────────────────────────

const SISTEMA_DO_REDATOR = `Você é o REDATOR das peças de um vídeo. As decisões já foram tomadas por outro sistema: qual peça entra, em que frase, por quanto tempo. Você NÃO escolhe nem muda nada disso. Você só ESCREVE o texto de cada peça, nas props que a ficha dela pede.

Regras do texto:
- Português do Brasil, com as palavras do próprio falante; curto (título até 5 palavras, rótulo até 3, manchete até 9). Sem travessão, sem ponto final em título. Destaque com **asteriscos** em 1 a 3 palavras quando a ficha pede.
- Nunca invente número, nome, dado ou promessa que a fala não diz.
- Descrição de foto ("descricao") em INGLÊS, concreta (objeto, lugar, prédio, estátua genérica, figura anônima de época); NUNCA pessoa real, famosa ou histórica identificável, nunca nome próprio.
- Lista (itens, passos, recortes, marcos): só o que a fala diz, na ordem dita, até o máximo da ficha.
- Quando houver PEDIDO DO CLIENTE no momento, o texto atende ao pedido.

Responda só JSON: {"momentos":[{"id":"j12","props":{...}}]} com um item por momento recebido, na ordem.`;

type MomentoParaRedator = MomentoDecidido & { ficha: FichaDaPeca; fala: string };

/** Uma chamada do redator para um bloco de momentos. */
async function redigirBloco(e: EntradaDoPlanoPeloJev, lista: MomentoParaRedator[], falaDoBloco: string): Promise<Record<string, Record<string, unknown>>> {
  if (!lista.length) return {};
  const pedido = [
    `COMANDO DO CLIENTE: "${e.comando.texto}"`,
    e.titulo ? `TÍTULO: ${e.titulo}` : "",
    e.perfil ?? "",
    `# A FALA DESTE BLOCO\n${falaDoBloco}`,
    `# OS MOMENTOS (escreva só as props de cada um)\n${lista
      .map((m) => `- id ${m.id}, peça "${m.peca}" (${m.inicio.toFixed(0)} s a ${m.fim.toFixed(0)} s), sobre a fala: "${m.fala.slice(0, 300)}"${m.pedido ? `\n  PEDIDO DO CLIENTE: "${m.pedido}"` : ""}\n  props da ficha: ${m.ficha.props}`)
      .join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const resposta = await askClaude(SISTEMA_DO_REDATOR, pedido, {
    model: MODELO_DO_REDATOR,
    maxTokens: 12000,
    effort: "low",
    timeoutMs: 180_000,
    usage: { projectId: e.projectId ?? undefined, operation: "editor-por-comando-redator" },
  });
  const j = extrairJson(resposta) as { momentos?: Array<{ id?: unknown; props?: unknown }> };
  const saida: Record<string, Record<string, unknown>> = {};
  for (const m of j?.momentos ?? []) if (typeof m?.id === "string" && m.props && typeof m.props === "object") saida[m.id] = m.props as Record<string, unknown>;
  return saida;
}

/** O texto de uma peça, para a conferência (o primeiro campo de texto das props). */
function textoDasProps(props: Record<string, unknown>): string {
  for (const k of ["texto", "titulo", "manchete", "frase", "palavra", "rotulo", "lugar"]) {
    const v = props[k];
    if (typeof v === "string" && v.trim()) return v.replace(/\*\*/g, "").trim();
  }
  return "";
}

/**
 * O PLANO INTEIRO PELO JEV E PELO REDATOR: as decisões (JEV), os textos (uma
 * chamada do Sonnet por bloco de ~5 min, em paralelo) e a conferência dos
 * textos (JEV). Devolve o plano no mesmo formato do diretor (validado por
 * `validarPlano`), para o resolvedor e a tela de roteiro.
 */
export async function escreverPlanoPeloJev(e: EntradaDoPlanoPeloJev): Promise<{ plano: PlanoDoDiretor; avisos: string[]; tempos: Record<string, number>; erro?: string }> {
  const tempos: Record<string, number> = {};
  let t = Date.now();
  const d = await decidirPeloJev(e);
  tempos.jev = +((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();
  const pecas = pecasDoEstilo(e.base);
  const fichaDe = (n: string) => pecas.find((p) => p.nome === n)!;
  const lista: MomentoParaRedator[] = d.momentos.map((m) => ({ ...m, ficha: fichaDe(m.peca), fala: e.frases.slice(m.f0, m.f1 + 1).map((f) => f.texto).join(" ") }));
  // Os blocos do redator: ~5 min de fala cada, em paralelo.
  const BLOCO = 300;
  const n = Math.max(1, Math.round(e.duracao / BLOCO));
  const blocos = Array.from({ length: n }, (_, k) => ({ de: (k * e.duracao) / n, ate: ((k + 1) * e.duracao) / n }));
  const textos: Record<string, Record<string, unknown>> = {};
  const erros: string[] = [];
  await Promise.all(
    blocos.map(async (b) => {
      const doBloco = lista.filter((m) => m.inicio >= b.de && m.inicio < b.ate);
      if (!doBloco.length) return;
      const fala = e.frases.filter((f) => f.fim > b.de && f.inicio < b.ate).map((f) => `[${f.inicio.toFixed(0)}s] ${f.texto}`).join("\n");
      try {
        Object.assign(textos, await redigirBloco(e, doBloco, fala));
      } catch (err) {
        erros.push(`redator: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
      }
    })
  );
  tempos.redator = +((Date.now() - t) / 1000).toFixed(1);
  t = Date.now();
  // O esqueleto com os textos vira o plano do mesmo formato do diretor (âncoras de frase).
  const bruto = {
    leitura: `Plano decidido pelo JEV (${d.momentos.length} momentos, ${d.perguntas} perguntas) e escrito pelo redator.`,
    tema: { visual: undefined, fundoColagem: e.base === "vox" },
    momentos: lista.map((m) => ({ id: m.id, peca: m.peca, de: `F${m.f0}`, ate: `F${m.f1}/fim`, props: textos[m.id] ?? {} })),
    enfases: d.enfases,
  };
  const v = validarPlano(bruto, e.base);
  // A CONFERÊNCIA DOS TEXTOS PELO JEV: o que ficou longo, confuso ou inventado sai.
  const comTexto = v.plano.momentos.filter((m) => textoDasProps((m.props ?? {}) as Record<string, unknown>));
  if (comTexto.length && jevLigado()) {
    try {
      const perguntas: Record<string, PerguntaDoJev> = Object.fromEntries(
        comTexto.map((m) => {
          const fala = lista.find((x) => x.id === m.id)?.fala ?? "";
          return [m.id, { type: "noul", instructions: `A fala do trecho é: "${fala.slice(0, 300)}". O texto que vai à tela é: "${textoDasProps((m.props ?? {}) as Record<string, unknown>).slice(0, 160)}". Esse texto é curto, claro, nas palavras do falante, e não inventa dado, nome ou número que a fala não diz?` }];
        })
      );
      const r = await perguntarAoJev({ projectId: e.projectId, etapa: "editor-por-comando-conferencia", state: { comando: e.comando.texto } }, perguntas);
      const reprovados = new Set(comTexto.filter((m) => (probabilidadeDeSim(r[String(m.id)]) ?? 1) <= 0.35).map((m) => String(m.id)));
      if (reprovados.size) {
        v.avisos.push(`conferência: ${reprovados.size} texto(s) reprovado(s) pelo JEV saíram (${[...reprovados].join(", ")})`);
        v.plano.momentos = v.plano.momentos.filter((m) => !reprovados.has(String(m.id)));
      }
    } catch (err) {
      v.avisos.push(`conferência falhou: ${err instanceof Error ? err.message.slice(0, 100) : err}`);
    }
  }
  tempos.conferencia = +((Date.now() - t) / 1000).toFixed(1);
  const semProps = lista.filter((m) => !textos[m.id]).length;
  if (semProps) v.avisos.push(`${semProps} momento(s) sem texto do redator saíram`);
  return { plano: v.plano, avisos: [...d.avisos, ...erros, ...v.avisos].slice(0, 40), tempos, erro: !v.plano.momentos.length ? (d.momentos.length ? "o redator não devolveu textos" : "o JEV não decidiu nenhuma peça") : undefined };
}

/** Os momentos decididos como o tipo do editor (para quem precisa só do esqueleto). */
export function esqueletoComoMomentos(m: MomentoDecidido[]): MomentoDoEditor[] {
  return m.map((x) => ({ id: x.id, peca: x.peca, de: `F${x.f0}`, ate: `F${x.f1}/fim`, props: {} }));
}
