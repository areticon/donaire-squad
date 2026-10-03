import { askClaude } from "@/lib/claude";
import { prisma } from "@/lib/db/prisma";
import { jevLigado, perguntarAoJev, usoVazio, type PerguntaDoJev, type UsoDoJev } from "@/lib/jev/cliente";
import { CHAMADAS, ESTRUTURAS, GANCHOS } from "@/lib/referencias/padroes";
import { RECURSOS, TONS } from "@/lib/referencias/tipos-das-analises";

/**
 * AS ETIQUETAS DE VALOR FIXO PELO JEV (03/10/2026).
 *
 * Etiquetar um post com gancho, estrutura e chamada (padroes.ts), ou com tom e
 * recurso (etiquetas-extras.ts), é CLASSIFICAÇÃO com opções fixas: a decisão
 * do Bruno de 02/10 manda isso para o JEV (choice, uma pergunta por dimensão
 * por post, as opções como criteria). O que é ESCRITA continua no Haiku: o
 * tema em 4 palavras e o molde em 12 não são escolha numa lista.
 *
 * Como em decidir-retomadas.ts, o JEV só decide quando está confiante
 * (confidence >= 0,5), dimensão por dimensão. A dimensão em dúvida vai ao
 * Haiku na MESMA chamada que escreve o tema (ou o molde): o post leva a marca
 * [ETIQUETAR: ...] com as dimensões que faltam, e o Haiku escolhe nas mesmas
 * listas do caminho antigo. JEV fora do ar: todas as dimensões vão ao Haiku
 * (é o caminho antigo numa chamada só). Haiku falhou: devolve null e quem
 * chama roda o caminho antigo inteiro. Nunca grava no banco.
 *
 * ## O que a medição mandou (03/10, 40 posts reais julgados um a um)
 * A concordância com as etiquetas antigas do Haiku é baixa (gancho 15 de 29
 * confiantes, estrutura 13 de 31, recurso 10 de 31), mas nas discordâncias
 * confiantes o JEV estava certo bem mais vezes do que o Haiku: o Haiku chamava
 * de "depoimento" qualquer post pessoal, e de "pergunta" a legenda que só
 * TERMINA com pergunta. Ver scripts/tmp/etiquetas-prova-0310.mts.
 *
 * Interruptor: ETIQUETAS_PELO_JEV=0 volta tudo ao Haiku antigo (e
 * JEV_LIGADO=0, ou a falta da chave, também).
 */

export function etiquetasPeloJev(): boolean {
  return jevLigado() && process.env.ETIQUETAS_PELO_JEV !== "0";
}

/** A confiança mínima do choice para o JEV decidir sozinho (medida em 03/10). */
const CONFIANCA_MINIMA = 0.5;
const POSTS_POR_ESTADO = 20;

export type PostParaEtiquetar = { id: string; formato: string; duracaoSeg: number | null; legenda: string | null; audio?: string };

/** `reserva` é o valor do caminho antigo quando a resposta não está na lista. */
type Dimensao = { nome: string; pergunta: string; opcoes: Record<string, string>; reserva: string };

const DIMENSOES_DE_FORMA: Dimensao[] = [
  {
    nome: "gancho",
    reserva: "outro",
    pergunta: "Como a PRIMEIRA frase da legenda prende a atenção?",
    opcoes: {
      pergunta: "abre com uma pergunta",
      numero: "abre com um número ou estatística",
      contraintuitivo: "abre contrariando o senso comum",
      historia: "abre contando uma história ou situação vivida",
      promessa: "abre prometendo um resultado ou benefício",
      lista: "abre anunciando uma lista (ex.: 5 dicas, 3 erros)",
      polemica: "abre com provocação ou opinião polêmica",
      outro: "nenhum desses: aviso, anúncio, saudação, legenda curta ou só hashtags",
    },
  },
  {
    nome: "estrutura",
    reserva: "outro",
    pergunta: "Qual é a estrutura do post inteiro?",
    opcoes: {
      problema_solucao: "apresenta um problema e a solução",
      lista: "lista de itens, dicas ou passos soltos",
      antes_depois: "compara antes e depois",
      bastidor: "mostra bastidor, rotina ou dia a dia",
      tutorial: "passo a passo ensinando a fazer algo",
      opiniao: "opinião ou reflexão direta",
      caso: "conta um caso, história ou resultado concreto",
      outro: "nenhum desses: anúncio, convite, aviso ou legenda sem estrutura",
    },
  },
  {
    nome: "cta",
    reserva: "nenhuma",
    pergunta: "Como o post TERMINA, que ação ele pede?",
    opcoes: {
      comentar: "pede para comentar ou responder",
      salvar: "pede para salvar",
      compartilhar: "pede para compartilhar ou marcar alguém",
      link: "manda para um link, a bio, inscrição, compra ou contato",
      seguir: "pede para seguir o perfil",
      nenhuma: "não pede ação nenhuma",
    },
  },
];

const DIMENSOES_EXTRAS: Dimensao[] = [
  {
    nome: "tom",
    reserva: "educativo",
    pergunta: "Qual é o tom do post?",
    opcoes: {
      humor: "humor, piada, leveza",
      serio: "sério, institucional, informativo",
      inspirador: "inspirador, motivacional",
      educativo: "educativo, ensina algo",
      polemico: "polêmico, provocador",
      emocional: "emocional, toca o sentimento",
    },
  },
  {
    nome: "recurso",
    reserva: "nenhum",
    pergunta: "Qual é o principal truque de FORMA do post?",
    opcoes: {
      meme: "meme ou formato de meme",
      trend_de_audio: "trend de áudio, música em alta",
      bordao: "bordão ou frase de efeito repetida",
      pov: "POV, ponto de vista encenado",
      react: "reação a outro conteúdo",
      depoimento: "depoimento de cliente ou pessoa",
      bastidor: "bastidor, mostra como é feito",
      texto_na_tela: "texto na tela carrega a mensagem",
      nenhum: "nenhum recurso especial",
    },
  },
];

// As opções acima são as mesmas listas de padroes.ts e tipos-das-analises.ts;
// se alguém mudar lá, o TypeScript não acusa, então a conferência é aqui.
for (const [d, lista] of [
  [DIMENSOES_DE_FORMA[0], GANCHOS],
  [DIMENSOES_DE_FORMA[1], ESTRUTURAS],
  [DIMENSOES_DE_FORMA[2], CHAMADAS],
  [DIMENSOES_EXTRAS[0], TONS],
  [DIMENSOES_EXTRAS[1], RECURSOS],
] as const) {
  const faltando = (lista as readonly string[]).filter((v) => !(v in d.opcoes));
  if (faltando.length) console.warn(`[etiquetas-jev] a dimensão ${d.nome} não tem as opções ${faltando.join(", ")}`);
}

export type EtiquetasDoJev = {
  /** As etiquetas completas por id do post, já validadas contra as listas. */
  etiquetas: Map<string, Record<string, string>>;
  /** Quem decidiu cada dimensão, por post (para a prova e o log). */
  quem: Map<string, Record<string, "jev" | "haiku">>;
  /** Toda resposta do JEV (escolha e confiança). */
  respostas: Map<string, Record<string, { escolha: string; confianca: number }>>;
  uso: UsoDoJev;
  jevFalhou: boolean;
};

function itemDoEstado(p: PostParaEtiquetar) {
  return {
    id: p.id,
    formato: `${p.formato}${p.duracaoSeg ? `, ${p.duracaoSeg}s` : ""}${p.audio ? `, ${p.audio}` : ""}`,
    legenda: (p.legenda ?? "").replace(/\s+/g, " ").slice(0, 500) || "(sem legenda)",
  };
}

/** O JEV escolhe cada dimensão de cada post; guarda só as confiantes. */
async function classificar(
  projectId: string | null,
  etapa: string,
  posts: PostParaEtiquetar[],
  dims: Dimensao[],
  uso: UsoDoJev
): Promise<{ decididas: Map<string, Record<string, string>>; respostas: EtiquetasDoJev["respostas"]; falhou: boolean }> {
  const decididas = new Map<string, Record<string, string>>();
  const respostas: EtiquetasDoJev["respostas"] = new Map();
  let falhou = false;
  for (let i = 0; i < posts.length; i += POSTS_POR_ESTADO) {
    const lote = posts.slice(i, i + POSTS_POR_ESTADO);
    const state = {
      contexto: "Posts de redes sociais (legenda e formato). Cada item de `posts` tem um id. Etiquete pela FORMA, nunca pelo conteúdo.",
      posts: lote.map(itemDoEstado),
    };
    const perguntas: Record<string, PerguntaDoJev> = {};
    for (const p of lote) {
      for (const d of dims) {
        perguntas[`${d.nome}:${p.id}`] = { type: "choice", instructions: `No post de id "${p.id}": ${d.pergunta}`, criteria: { ...d.opcoes } };
      }
    }
    try {
      const r = await perguntarAoJev({ projectId, etapa, state, uso }, perguntas);
      for (const p of lote) {
        const et: Record<string, string> = {};
        const vistas: Record<string, { escolha: string; confianca: number }> = {};
        for (const d of dims) {
          const resp = r[`${d.nome}:${p.id}`];
          if (!resp || resp.type !== "choice") continue;
          vistas[d.nome] = { escolha: resp.choice, confianca: resp.confidence ?? 0 };
          if (resp.choice in d.opcoes && (resp.confidence ?? 0) >= CONFIANCA_MINIMA) et[d.nome] = resp.choice;
        }
        respostas.set(p.id, vistas);
        decididas.set(p.id, et);
      }
    } catch (e) {
      console.error(`[etiquetas-jev] JEV falhou, as dimensões vão ao Haiku: ${e instanceof Error ? e.message : e}`);
      falhou = true;
    }
  }
  return { decididas, respostas, falhou };
}

/**
 * UM Haiku por lote: escreve o texto livre (tema ou molde) de todo post e
 * escolhe, nas listas de sempre, só as dimensões que o JEV deixou em dúvida.
 */
async function etiquetarComJev(
  projectId: string | null,
  posts: PostParaEtiquetar[],
  cfg: { etapa: string; operation: string; dims: Dimensao[]; campo: "tema" | "molde"; instrucao: string; teto: number },
  uso: UsoDoJev
): Promise<EtiquetasDoJev | null> {
  const etiquetas: EtiquetasDoJev["etiquetas"] = new Map();
  const quem: EtiquetasDoJev["quem"] = new Map();
  if (!posts.length) return { etiquetas, quem, respostas: new Map(), uso, jevFalhou: false };
  const { decididas, respostas, falhou } = await classificar(projectId, cfg.etapa, posts, cfg.dims, uso);
  const faltam = (p: PostParaEtiquetar) => cfg.dims.filter((d) => !decididas.get(p.id)?.[d.nome]);
  const lista = posts
    .map((p, k) => {
      const f = faltam(p);
      const it = itemDoEstado(p);
      return `${k + 1}. ${f.length ? `[ETIQUETAR: ${f.map((d) => d.nome).join(", ")}] ` : ""}[${it.formato}] ${it.legenda}`;
    })
    .join("\n");
  const algumFalta = posts.some((p) => faltam(p).length);
  const listas = cfg.dims.map((d) => `- ${d.nome}: ${Object.keys(d.opcoes).join(", ")}`).join("\n");
  try {
    const bruto = await askClaude(
      "Você etiqueta posts de redes sociais pela FORMA, nunca pelo conteúdo. Nunca use travessão. Responda só com JSON.",
      `Para cada post, devolva ${cfg.campo}: ${cfg.instrucao}` +
        (algumFalta
          ? `\n\nNos posts marcados com [ETIQUETAR: ...], devolva também as dimensões listadas na marca, escolhendo só destas palavras:\n${listas}`
          : "") +
        `\n\nPOSTS:\n${lista}\n\nResponda {"posts":[{"n":1,"${cfg.campo}":"..."${algumFalta ? `,"<dimensão da marca>":"..."` : ""}}]}`,
      { model: "claude-haiku-4-5", maxTokens: 4000, usage: { projectId: projectId ?? undefined, operation: cfg.operation } }
    );
    const j = JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { posts?: Array<{ n?: number } & Record<string, unknown>> };
    for (const e of j.posts ?? []) {
      const p = posts[Number(e.n) - 1];
      if (!p) continue;
      const et: Record<string, string> = { ...(decididas.get(p.id) ?? {}) };
      const q: Record<string, "jev" | "haiku"> = {};
      for (const d of cfg.dims) {
        if (et[d.nome]) {
          q[d.nome] = "jev";
          continue;
        }
        const v = e[d.nome];
        et[d.nome] = typeof v === "string" && v in d.opcoes ? v : d.reserva;
        q[d.nome] = "haiku";
      }
      et[cfg.campo] = String(e[cfg.campo] ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, cfg.teto);
      etiquetas.set(p.id, et);
      quem.set(p.id, q);
    }
    return { etiquetas, quem, respostas, uso, jevFalhou: falhou };
  } catch (e) {
    console.warn(`[etiquetas-jev] o Haiku falhou, o lote volta ao caminho antigo: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/** Gancho, estrutura e chamada pelo JEV; o tema (e a dúvida) pelo Haiku. Null: rode o caminho antigo. */
export function etiquetasDeFormaPeloJev(projectId: string | null, posts: PostParaEtiquetar[], uso: UsoDoJev = usoVazio()): Promise<EtiquetasDoJev | null> {
  return etiquetarComJev(
    projectId,
    posts,
    {
      etapa: "referencias-etiquetas",
      operation: "referencias_etiquetas",
      dims: DIMENSOES_DE_FORMA,
      campo: "tema",
      instrucao: "o assunto em até 4 palavras, genérico (sem nome de pessoa nem de marca)",
      teto: 60,
    },
    uso
  );
}

/**
 * O lote de padroes.ts pelo JEV, já gravado. Devolve quantos gravou, ou null
 * quando o JEV está desligado ou o Haiku falhou (aí roda o caminho antigo).
 */
export async function gravarFormaPeloJev(projectId: string, lote: PostParaEtiquetar[]): Promise<number | null> {
  if (!etiquetasPeloJev()) return null;
  const r = await etiquetasDeFormaPeloJev(projectId, lote);
  if (!r) return null;
  let feitos = 0;
  for (const [id, et] of r.etiquetas) {
    const etiquetas = { gancho: et.gancho, estrutura: et.estrutura, cta: et.cta, tema: et.tema ?? "" };
    await prisma.referenciaPost.update({ where: { id }, data: { etiquetas: etiquetas as never } });
    feitos++;
  }
  return feitos;
}

/** O lote de etiquetas-extras.ts pelo JEV, somado ao que o post já tem. Null: caminho antigo. */
export async function gravarExtrasPeloJev(projectId: string, lote: Array<PostParaEtiquetar & { etiquetas: unknown }>): Promise<number | null> {
  if (!etiquetasPeloJev()) return null;
  const r = await etiquetasExtrasPeloJev(projectId, lote);
  if (!r) return null;
  let feitos = 0;
  for (const p of lote) {
    const et = r.etiquetas.get(p.id);
    if (!et) continue;
    const atual = (p.etiquetas ?? {}) as Record<string, unknown>;
    await prisma.referenciaPost.update({ where: { id: p.id }, data: { etiquetas: { ...atual, tom: et.tom, recurso: et.recurso, molde: et.molde ?? "" } as never } });
    feitos++;
  }
  return feitos;
}

/** Tom e recurso pelo JEV; o molde (e a dúvida) pelo Haiku. Null: rode o caminho antigo. */
export function etiquetasExtrasPeloJev(projectId: string | null, posts: PostParaEtiquetar[], uso: UsoDoJev = usoVazio()): Promise<EtiquetasDoJev | null> {
  return etiquetarComJev(
    projectId,
    posts,
    {
      etapa: "referencias-etiquetas-extras",
      operation: "referencias_etiquetas_extras",
      dims: DIMENSOES_EXTRAS,
      campo: "molde",
      instrucao:
        'o roteiro em até 12 palavras, ABSTRATO, sem nome de pessoa, marca, número ou frase do autor (ex.: "pergunta provocativa, três erros comuns, convite para comentar")',
      teto: 120,
    },
    uso
  );
}
