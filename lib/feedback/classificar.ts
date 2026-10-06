import { decidirChoice, jevLigado, perguntarAoJev, type PerguntaDoJev, type RespostaDoJev } from "@/lib/jev/cliente";
import {
  CLASSIFICACOES,
  CONFIANCA_MINIMA,
  CRITERIO_DA_CLASSIFICACAO,
  ehClassificacao,
  semEmail,
  type Classificacao,
  type ContextoDoFeedback,
  type Origem,
} from "@/lib/feedback/regras";

/**
 * A CLASSIFICAÇÃO DO FEEDBACK É DO JEV, NUNCA DO CLAUDE (06/10/2026).
 *
 * Regra do Bruno (05/10): "o Claude só escreve texto; toda decisão vai para o
 * JEV". Aqui o JEV responde duas perguntas sobre um estado só, num pedido só:
 *
 *   1. `classificacao` (choice): erro do produto, pedido de gosto, atendido
 *      como pedido ou dúvida de uso. O estado leva o que o cliente TINHA
 *      APROVADO antes (a linha do roteiro, a frase da arte, a cor da marca):
 *      é o que separa "a letra saiu vermelha e eu queria rosa" (gosto, ou
 *      atendido como pedido se a linha aprovada dizia vermelho) de "a palavra
 *      de destaque não apareceu na hora" (erro do produto).
 *   2. `grupo` (choice): "mesmo problema de X" contra os grupos abertos, ou
 *      "novo". É o que permite contar "cinco clientes esta semana".
 *
 * "NÃO SEI" É RESPOSTA: confiança abaixo de CONFIANCA_MINIMA deixa o feedback
 * sem classe e sem grupo, e o painel mostra isso. Nunca vira erro do produto
 * por padrão.
 *
 * `perguntar` é injetável para a prova rodar com o JEV trocado por respostas
 * fixas (scripts/testes/feedback-do-produto-0610.test.mts).
 */

export type Perguntar = typeof perguntarAoJev;

export type GrupoAberto = { id: string; titulo: string; classificacao: string; exemplos?: string[] };

export type FeedbackParaClassificar = {
  texto: string;
  origem: Origem;
  contexto: ContextoDoFeedback | null;
};

export type Classificado = {
  classificacao: Classificacao | null;
  confianca: number | null;
  /** O id do grupo aberto parecido, "novo" para abrir um, ou null quando o JEV não soube. */
  grupo: string | "novo" | null;
  confiancaDoGrupo: number | null;
};

export const SEM_CLASSE: Classificado = { classificacao: null, confianca: null, grupo: null, confiancaDoGrupo: null };

/** Até quantos grupos abertos o JEV compara de uma vez (o estado vai inteiro em cada pedido). */
export const TETO_DE_GRUPOS = 40;

/** O estado que o JEV lê: o pedido, o que a plataforma fez e o que estava aprovado antes. Sem e-mail. */
export function estadoDoFeedback(f: FeedbackParaClassificar, grupos: GrupoAberto[]): Record<string, unknown> {
  const c = f.contexto ?? {};
  const aprovado = Object.fromEntries(
    Object.entries(c.aprovadoAntes ?? {})
      .filter(([, v]) => typeof v === "string" && v.trim())
      .map(([k, v]) => [k, semEmail(String(v)).slice(0, 600)])
  );
  return {
    contexto:
      "Um cliente de uma plataforma que produz posts, artes e vídeos editados escreveu no chat de uma peça (ou abriu um chamado). A plataforma precisa separar o que é ERRO DELA (defeito de código, sincronia, elemento que não apareceu, texto cortado) do que é PREFERÊNCIA do cliente, do que ela fez EXATAMENTE como o cliente tinha aprovado antes, e do que é só DÚVIDA de uso.",
    origem: f.origem === "chamado" ? "chamado de suporte" : "chat da peça",
    pedido_do_cliente: semEmail(f.texto).slice(0, 2000),
    peca: {
      tipo: c.tipoDePeca ?? "não informado",
      rede: c.rede ?? "não informada",
      estilo: c.estilo ?? "não informado",
    },
    o_que_a_plataforma_fez: {
      acoes: c.oQueAPlataformaFez ?? [],
      resposta: c.respostaDaPlataforma ? semEmail(c.respostaDaPlataforma).slice(0, 800) : "sem resposta registrada",
      resultado: c.resultado ?? "desconhecido",
    },
    o_que_o_cliente_tinha_aprovado_antes: Object.keys(aprovado).length ? aprovado : "nada registrado",
    ...(c.codigo ? { codigo_de_erro_na_tela: c.codigo } : {}),
    grupos_abertos: grupos.slice(0, TETO_DE_GRUPOS).map((g) => ({
      id: g.id,
      problema: g.titulo,
      classificacao: g.classificacao,
      ...(g.exemplos?.length ? { exemplos: g.exemplos.slice(0, 2).map((e) => semEmail(e).slice(0, 200)) } : {}),
    })),
  };
}

/** As perguntas do lote: a classe sempre; o grupo só quando há grupo aberto para comparar. */
export function perguntasDaClassificacao(grupos: GrupoAberto[]): Record<string, PerguntaDoJev> {
  const perguntas: Record<string, PerguntaDoJev> = {
    classificacao: {
      type: "choice",
      instructions:
        "Leia `pedido_do_cliente`, `o_que_a_plataforma_fez` e `o_que_o_cliente_tinha_aprovado_antes`. Em qual classe o pedido cai? Escolha `atendido_como_pedido` quando o que saiu é o que estava aprovado antes (por exemplo, o cliente reclama da cor e a linha aprovada dizia essa cor). Escolha `erro_do_produto` só quando a plataforma falhou em algo que prometeu: sincronia, tempo, elemento que não apareceu, texto cortado, erro ou travamento.",
      criteria: Object.fromEntries(CLASSIFICACOES.map((c) => [c, CRITERIO_DA_CLASSIFICACAO[c]])),
    },
  };
  const abertos = grupos.slice(0, TETO_DE_GRUPOS);
  if (abertos.length) {
    perguntas.grupo = {
      type: "choice",
      instructions:
        "Compare `pedido_do_cliente` com cada item de `grupos_abertos`. Se o cliente está descrevendo o MESMO problema de um grupo (a mesma falha ou o mesmo tipo de pedido, mesmo que com outras palavras ou em outra peça), responda o id desse grupo. Se é um assunto diferente de todos, responda `novo`.",
      criteria: {
        ...Object.fromEntries(abertos.map((g) => [g.id, `Mesmo problema de: ${g.titulo}`])),
        novo: "Nenhum dos grupos abertos descreve este problema: é um assunto novo.",
      },
    };
  }
  return perguntas;
}

/** Lê as respostas do JEV com a margem de "não sei". Pura, para a prova. */
export function lerClassificacao(respostas: Record<string, RespostaDoJev>, grupos: GrupoAberto[]): Classificado {
  const r = respostas.classificacao;
  const classe = decidirChoice(r, CLASSIFICACOES, "__nao_sei__" as unknown as Classificacao, CONFIANCA_MINIMA);
  const classificacao = ehClassificacao(classe) ? classe : null;
  const confianca = r && r.type === "choice" && typeof r.confidence === "number" ? r.confidence : null;
  if (!classificacao) return { ...SEM_CLASSE, confianca };

  const idsDosGrupos = grupos.slice(0, TETO_DE_GRUPOS).map((g) => g.id);
  const rg = respostas.grupo;
  let grupo: Classificado["grupo"] = idsDosGrupos.length ? null : "novo";
  let confiancaDoGrupo: number | null = null;
  if (rg && rg.type === "choice") {
    confiancaDoGrupo = typeof rg.confidence === "number" ? rg.confidence : null;
    const escolha = decidirChoice(rg, [...idsDosGrupos, "novo"], "novo", CONFIANCA_MINIMA);
    // Um grupo de outra classe não é "o mesmo problema": abre um novo.
    const g = grupos.find((x) => x.id === escolha);
    grupo = escolha === "novo" || !g ? "novo" : g.classificacao === classificacao ? g.id : "novo";
  }
  return { classificacao, confianca, grupo, confiancaDoGrupo };
}

/**
 * Classifica e agrupa um feedback pelo JEV. Com o JEV desligado, devolve
 * SEM_CLASSE: o registro fica gravado para classificar depois.
 */
export async function classificarFeedback(p: {
  feedback: FeedbackParaClassificar;
  gruposAbertos: GrupoAberto[];
  projectId?: string | null;
  perguntar?: Perguntar;
}): Promise<Classificado> {
  const perguntar = p.perguntar ?? perguntarAoJev;
  if (!jevLigado() || !p.feedback.texto.trim()) return SEM_CLASSE;
  try {
    const respostas = await perguntar(
      { projectId: p.projectId ?? null, etapa: "feedback-do-produto", state: estadoDoFeedback(p.feedback, p.gruposAbertos) },
      perguntasDaClassificacao(p.gruposAbertos)
    );
    return lerClassificacao(respostas, p.gruposAbertos);
  } catch (e) {
    console.warn("[feedback] JEV falhou (fica sem classe):", e instanceof Error ? e.message : e);
    return SEM_CLASSE;
  }
}
