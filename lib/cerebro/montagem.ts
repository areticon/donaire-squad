import {
  ESFERAS,
  ROTULO_DA_ESFERA,
  TETO_DE_NOTAS_NA_TELA,
  type AtoDaPeca,
  type CerebroNaTela,
  type Esfera,
  type EventoDaPeca,
  type LigacaoDoCerebro,
  type NotaDoCerebro,
  type RegistroDoCerebro,
} from "@/lib/cerebro/tipos";

/**
 * A MONTAGEM DO CÉREBRO (06/10/2026): das linhas que já existem às notas e
 * ligações da tela. Tudo aqui é PURO (sem banco, sem rede): `carregar.ts` lê
 * as linhas e entrega; a prova roda com linhas falsas.
 *
 * As ligações têm três origens, e só uma é decisão:
 *   esfera      a nota pertence à esfera (como a pasta no Donaire Brains);
 *   mesma_peca  duas notas falam do mesmo card ou post (fato do banco);
 *   jev         o JEV leu as duas e disse que tratam do mesmo assunto.
 */

// ── as linhas de entrada (só os campos que a montagem lê) ───────────────────

export type ProjetoDaFonte = {
  id: string;
  name: string;
  voice?: string | null;
  niche?: string | null;
  targetAudience?: string | null;
  colorPalette?: string | null;
  videoStyle?: string | null;
  capaEstilo?: string | null;
  updatedAt?: Date | string | null;
};

export type MemoriaDaFonte = { type: string; key: string; value: unknown; metadata?: unknown; createdAt?: Date | string | null; updatedAt?: Date | string | null };
export type ContextoDaFonte = { id: string; type: string; title: string; compiled: string; status: string; updatedAt?: Date | string | null };
export type MaterialDaFonte = { id: string; tipo: string; nome?: string | null; descricao?: string | null; etiquetas?: string[] | null; status: string; createdAt?: Date | string | null };
export type ReferenciaDaFonte = { id: string; rede: string; perfil: string; nome?: string | null; motivo?: string | null; status: string; origem?: string | null; updatedAt?: Date | string | null };
export type FeedbackDaFonte = { id: string; origem: string; texto: string; classificacao?: string | null; cardId?: string | null; postId?: string | null; videoJobId?: string | null; criadoEm?: Date | string | null };
export type DesignDaFonte = { id: string; tipo: string; comoEntrou?: string | null; updatedAt?: Date | string | null; design: { nome: string; descricao?: string | null } };
export type RoteiroDaFonte = { id: string; titulo: string; tese?: string | null; status: string; updatedAt?: Date | string | null };

export type FontesDoCerebro = {
  projeto: ProjetoDaFonte;
  memorias: MemoriaDaFonte[];
  contextos?: ContextoDaFonte[];
  materiais?: MaterialDaFonte[];
  referencias?: ReferenciaDaFonte[];
  feedbacks?: FeedbackDaFonte[];
  designs?: DesignDaFonte[];
  roteiros?: RoteiroDaFonte[];
};

// ── utilidades ──────────────────────────────────────────────────────────────

const iso = (d: Date | string | null | undefined): string | null => {
  if (!d) return null;
  const x = d instanceof Date ? d : new Date(d);
  return Number.isNaN(x.getTime()) ? null : x.toISOString();
};

/** Corta no limite de palavra, sem reticências no meio da palavra. Nunca devolve travessão. */
export function cortar(t: string | null | undefined, max: number): string {
  const s = semTravessao(String(t ?? "").replace(/\s+/g, " ").trim());
  if (s.length <= max) return s;
  const corte = s.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[,.;:]+$/, "")}...`;
}

/** Regra da casa: nenhum texto do produto sai com travessão. */
export const semTravessao = (t: string) => t.replace(/\s*[—–]\s*/g, ", ");

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

export function dataCurta(isoOuData: string | Date | null | undefined): string {
  const d = isoOuData ? new Date(isoOuData) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

const NOME_DA_REDE: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X",
  x: "X",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  youtube: "YouTube",
};
export const nomeDaRede = (r: string | null | undefined) => (r ? NOME_DA_REDE[r.toLowerCase()] ?? r : null);

// ── a nota de peça ──────────────────────────────────────────────────────────

const VERBO_DO_ATO: Record<AtoDaPeca, string> = {
  aprovou: "Aprovou",
  recusou: "Recusou",
  pediu_revisao: "Pediu revisão",
  editou_texto: "Editou o texto à mão",
  agendou: "Agendou",
  voltou_rascunho: "Voltou para rascunho",
  arquivou: "Arquivou",
  desarquivou: "Tirou do arquivo",
};

/** A esfera da peça é a do ÚLTIMO ato: aprovada e depois recusada é recusa. */
export function esferaDoAto(ato: AtoDaPeca): Esfera {
  if (ato === "aprovou" || ato === "agendou" || ato === "desarquivou") return "aprovacoes";
  if (ato === "recusou" || ato === "arquivou") return "recusas";
  return "pedidos";
}

export const idDaNotaDePeca = (e: Pick<EventoDaPeca, "alvo" | "alvoId">) => `peca:${e.alvo}:${e.alvoId}`;

export function pecasDoEvento(e: EventoDaPeca): string[] {
  return [e.cardId ? `card:${e.cardId}` : null, e.postId ? `post:${e.postId}` : null, `${e.alvo}:${e.alvoId}`].filter((x, i, a): x is string => Boolean(x) && a.indexOf(x) === i);
}

/** O mesmo ato repetido dentro desta janela é o mesmo gesto (dois cliques, card e post do mesmo dia). */
export const JANELA_DO_MESMO_ATO_MS = 2 * 60_000;

/**
 * Soma um ato ao histórico da peça. Puro. O mais novo vem primeiro; o mesmo
 * ato repetido na janela só atualiza o instante e o detalhe, em vez de virar
 * duas linhas. O estado da nota é sempre o do último ato.
 */
export function somarAto(
  atual: EventoDaPeca | null | undefined,
  novo: { ato: AtoDaPeca; quando: string; detalhe?: string | null },
  dados: Omit<EventoDaPeca, "historico">,
  historicoMaximo = 12
): EventoDaPeca {
  const anterior = atual?.historico ?? [];
  const topo = anterior[0];
  const mesmo = topo && topo.ato === novo.ato && Math.abs(new Date(novo.quando).getTime() - new Date(topo.quando).getTime()) < JANELA_DO_MESMO_ATO_MS;
  const linha = { ato: novo.ato, quando: novo.quando, ...(novo.detalhe ? { detalhe: cortar(novo.detalhe, 400) } : {}) };
  const historico = (mesmo ? [linha, ...anterior.slice(1)] : [linha, ...anterior]).slice(0, historicoMaximo);
  return {
    ...dados,
    // O que já se sabia da peça não se perde quando o ato novo chega sem o dado.
    cardId: dados.cardId ?? atual?.cardId ?? null,
    postId: dados.postId ?? atual?.postId ?? null,
    rede: dados.rede ?? atual?.rede ?? null,
    tipoDePeca: dados.tipoDePeca ?? atual?.tipoDePeca ?? null,
    trecho: dados.trecho ? cortar(dados.trecho, 280) : atual?.trecho ?? null,
    historico,
  };
}

export function notaDaPeca(e: EventoDaPeca, projectId: string): NotaDoCerebro | null {
  const ultimo = e.historico[0];
  if (!ultimo) return null;
  const quem = [nomeDaRede(e.rede), e.tipoDePeca].filter(Boolean).join(", ") || "Peça";
  const linhas = e.historico.map((h) => `${VERBO_DO_ATO[h.ato]} em ${dataCurta(h.quando)}${h.detalhe ? `: ${cortar(h.detalhe, 200)}` : ""}`);
  return {
    id: idDaNotaDePeca(e),
    fonte: "peca",
    esfera: esferaDoAto(ultimo.ato),
    titulo: cortar(`${quem}: ${e.trecho ?? VERBO_DO_ATO[ultimo.ato]}`, 90),
    texto: [linhas.join("\n"), e.trecho ? `Trecho da peça: ${cortar(e.trecho, 280)}` : ""].filter(Boolean).join("\n\n"),
    quando: ultimo.quando,
    tags: [nomeDaRede(e.rede), e.tipoDePeca, VERBO_DO_ATO[ultimo.ato].toLowerCase()].filter((x): x is string => Boolean(x)),
    link: `/projects/${projectId}/live`,
    pecas: pecasDoEvento(e),
    editavel: e.trecho ?? null,
  };
}

// ── as notas lidas das fontes que já existem ────────────────────────────────

const STATUS_DA_REGRA: Record<string, string> = { aprovada: "Aprovada", desligada: "Desligada", recusada: "Recusada" };
const ROTULO_DA_CLASSE: Record<string, string> = {
  erro_do_produto: "erro do produto",
  pedido_de_gosto: "pedido de gosto",
  atendido_como_pedido: "feito como estava aprovado",
  duvida_de_uso: "dúvida de uso",
};

function notasDoProjeto(p: ProjetoDaFonte): NotaDoCerebro[] {
  const link = `/projects/${p.id}/settings?aba=marca`;
  const quando = iso(p.updatedAt);
  const campos: Array<[string, string, string | null | undefined, string?]> = [
    ["tom:voz", "Tom de voz", p.voice],
    ["tom:nicho", "Nicho", p.niche],
    ["tom:publico", "Público", p.targetAudience],
    ["tom:cores", "Cores da marca", p.colorPalette],
    ["tom:estilo-video", "Estilo de edição", p.videoStyle, `/projects/${p.id}/settings?aba=video`],
    ["tom:capa", "Estilo da capa", p.capaEstilo, `/projects/${p.id}/settings?aba=video`],
  ];
  return campos
    .filter(([, , v]) => typeof v === "string" && v.trim())
    .map(([id, titulo, v, l]) => ({ id, fonte: "projeto" as const, esfera: "tom" as const, titulo, texto: cortar(v, 900), quando, tags: ["setup"], link: l ?? link, pecas: [] }));
}

function notasDasMemorias(projectId: string, memorias: MemoriaDaFonte[], feedbacks: FeedbackDaFonte[]): NotaDoCerebro[] {
  const saida: NotaDoCerebro[] = [];
  const textosDeFeedback = new Set(feedbacks.map((f) => normal(f.texto)));
  for (const m of memorias) {
    const v = obj(m.value);
    const meta = obj(m.metadata);
    if (m.type === "regra") {
      const status = str(v.status);
      const texto = str(v.texto);
      const id = str(v.id) ?? m.key;
      if (!texto || !status || !STATUS_DA_REGRA[status]) continue; // proposta ainda não é decisão do cliente
      const alvos = Array.isArray(v.alvos) ? (v.alvos as unknown[]).filter((a): a is string => typeof a === "string") : [];
      saida.push({
        id: `regra:${id}`,
        fonte: "regra",
        esfera: status === "recusada" ? "recusas" : "regras",
        titulo: cortar(texto, 90),
        texto: [`${STATUS_DA_REGRA[status]}${str(v.decididaEm) ? ` em ${dataCurta(str(v.decididaEm))}` : ""}.`, texto, str(v.porque) ? `Por quê: ${str(v.porque)}` : ""].filter(Boolean).join("\n"),
        quando: str(v.decididaEm) ?? str(v.propostaEm) ?? iso(m.updatedAt),
        tags: [STATUS_DA_REGRA[status].toLowerCase(), ...alvos, str(v.origem) === "cliente" ? "escrita pelo cliente" : "proposta do Roberto"],
        link: `/projects/${projectId}/training#regras-do-projeto`,
        pecas: [],
        editavel: texto,
      });
    } else if (m.type === "restricao" && m.key === "nao_citar") {
      const nomes = Array.isArray(m.value) ? (m.value as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];
      if (!nomes.length) continue;
      saida.push({
        id: "restricao:nao_citar",
        fonte: "restricao",
        esfera: "regras",
        titulo: cortar(`Nunca citar ${nomes.join(", ")}`, 90),
        texto: `O cliente proibiu citar: ${nomes.join(", ")}. A pesquisa descarta essas fontes e a Vera reprova a peça que mencionar.`,
        quando: iso(m.updatedAt),
        tags: ["restrição", ...nomes],
        link: `/projects/${projectId}/training#regras-do-projeto`,
        pecas: [],
      });
    } else if (m.type === "preference") {
      const instrucao = str(v.instruction);
      // O mesmo pedido já chegou pelo feedback do chat (que tem a resposta e a classe): não repete.
      if (!instrucao || textosDeFeedback.has(normal(instrucao))) continue;
      saida.push({
        id: `preferencia:${m.key}`,
        fonte: "preferencia",
        esfera: "pedidos",
        titulo: cortar(instrucao, 90),
        texto: `Pediu no chat da peça: ${cortar(instrucao, 600)}`,
        quando: str(meta.learnedAt) ?? iso(m.createdAt),
        tags: [str(v.cardType) ?? "chat"].filter(Boolean) as string[],
        link: `/projects/${projectId}/live`,
        pecas: [],
        editavel: instrucao,
      });
    } else if (m.type === "rejection") {
      const motivo = str(v.reason);
      if (!motivo) continue;
      const cardId = str(meta.cardId);
      saida.push({
        id: `recusa:${m.key}`,
        fonte: "recusa",
        esfera: "recusas",
        titulo: cortar(motivo, 90),
        texto: `Recusou ${str(v.cardType) ? `a peça (${str(v.cardType)})` : "a peça"} com o motivo: ${cortar(motivo, 600)}`,
        quando: str(v.timestamp) ?? iso(m.createdAt),
        tags: ["recusa", str(v.cardType)].filter(Boolean) as string[],
        link: `/projects/${projectId}/live`,
        pecas: cardId ? [`card:${cardId}`] : [],
        editavel: motivo,
      });
    } else if (m.type === "vera-pedido") {
      const status = str(v.status);
      const pedido = str(v.pedido);
      if (!pedido || (status !== "aplicado" && status !== "desfeito")) continue;
      saida.push({
        id: `vera:${str(v.id) ?? m.key}`,
        fonte: "vera",
        esfera: "decisoes",
        titulo: cortar(pedido, 90),
        texto: [`Pediu à Vera: ${cortar(pedido, 500)}`, str(v.resumo) ? `O que mudou: ${cortar(str(v.resumo), 400)}` : "", status === "desfeito" ? `Depois desfez${str(v.desfeitoEm) ? ` em ${dataCurta(str(v.desfeitoEm))}` : ""}.` : ""].filter(Boolean).join("\n"),
        quando: str(v.desfeitoEm) ?? str(v.aplicadoEm) ?? str(v.criadoEm) ?? iso(m.updatedAt),
        tags: ["Vera", status === "desfeito" ? "desfeito" : "aplicado"],
        link: null,
        pecas: [],
        editavel: pedido,
      });
    }
  }
  return saida;
}

function notasDasTabelas(f: FontesDoCerebro): NotaDoCerebro[] {
  const p = f.projeto.id;
  const saida: NotaDoCerebro[] = [];
  for (const c of f.contextos ?? []) {
    if (c.status !== "pronto" || !c.compiled.trim()) continue;
    saida.push({ id: `contexto:${c.id}`, fonte: "contexto", esfera: "materiais", titulo: cortar(c.title, 90), texto: cortar(c.compiled, 900), quando: iso(c.updatedAt), tags: ["documento", c.type], link: `/projects/${p}/training`, pecas: [] });
  }
  for (const m of f.materiais ?? []) {
    if (m.status !== "pronto") continue;
    const nome = str(m.descricao) ?? str(m.nome) ?? (m.tipo === "video" ? "Vídeo curto" : "Foto");
    saida.push({
      id: `material:${m.id}`,
      fonte: "material",
      esfera: "materiais",
      titulo: cortar(nome, 80),
      texto: [`${m.tipo === "video" ? "Vídeo" : "Foto"} que o cliente subiu.`, str(m.descricao) ?? "", m.etiquetas?.length ? `Etiquetas: ${m.etiquetas.join(", ")}` : ""].filter(Boolean).join("\n"),
      quando: iso(m.createdAt),
      tags: [m.tipo, ...(m.etiquetas ?? [])],
      link: `/projects/${p}/criar#materiais`,
      pecas: [],
    });
  }
  for (const r of f.referencias ?? []) {
    if (r.status !== "confirmado" && r.status !== "recusado") continue; // sugerido ainda não é decisão
    saida.push({
      id: `referencia:${r.id}`,
      fonte: "referencia",
      esfera: r.status === "recusado" ? "recusas" : "referencias",
      titulo: cortar(r.nome || r.perfil, 80),
      texto: [`${r.status === "recusado" ? "Recusou" : "Confirmou"} o perfil ${r.perfil} (${nomeDaRede(r.rede)}) como referência${r.origem === "cliente" ? ", indicado por ele mesmo" : ""}.`, str(r.motivo) ? `Por quê: ${cortar(r.motivo, 300)}` : ""].filter(Boolean).join("\n"),
      quando: iso(r.updatedAt),
      tags: [nomeDaRede(r.rede) ?? r.rede, r.status],
      link: `/projects/${p}/linha-editorial`,
      pecas: [],
    });
  }
  for (const fb of f.feedbacks ?? []) {
    if (!fb.texto.trim()) continue;
    const classe = fb.classificacao ?? null;
    const esfera: Esfera = classe === "erro_do_produto" || classe === "duvida_de_uso" || fb.origem === "chamado" ? "feedback" : "pedidos";
    saida.push({
      id: `feedback:${fb.id}`,
      fonte: "feedback",
      esfera,
      titulo: cortar(fb.texto, 90),
      texto: [`${fb.origem === "chamado" ? "Abriu um chamado" : "Pediu no chat da peça"}: ${cortar(fb.texto, 700)}`, classe ? `Lido pelo JEV como ${ROTULO_DA_CLASSE[classe] ?? classe}.` : ""].filter(Boolean).join("\n"),
      quando: iso(fb.criadoEm),
      tags: [fb.origem === "chamado" ? "chamado" : "chat", ...(classe ? [ROTULO_DA_CLASSE[classe] ?? classe] : [])],
      link: fb.origem === "chamado" ? null : `/projects/${p}/live`,
      pecas: [fb.cardId ? `card:${fb.cardId}` : null, fb.postId ? `post:${fb.postId}` : null, fb.videoJobId ? `video:${fb.videoJobId}` : null].filter((x): x is string => Boolean(x)),
      editavel: fb.texto,
    });
  }
  for (const d of f.designs ?? []) {
    saida.push({
      id: `design:${d.id}`,
      fonte: "design",
      esfera: "tom",
      titulo: cortar(d.design.nome, 80),
      texto: [`${d.comoEntrou === "pedido" ? "Pediu com as próprias palavras" : "Escolheu na galeria"} o design de ${d.tipo === "video" ? "vídeo" : "imagem"} "${d.design.nome}".`, str(d.design.descricao) ?? ""].filter(Boolean).join("\n"),
      quando: iso(d.updatedAt),
      tags: ["design", d.tipo === "video" ? "vídeo" : "imagem"],
      link: `/projects/${p}/settings?aba=modelos`,
      pecas: [],
    });
  }
  for (const r of f.roteiros ?? []) {
    if (r.status !== "pronto" && r.status !== "gravado" && r.status !== "descartada") continue;
    const rotulo = r.status === "descartada" ? "Descartou" : r.status === "gravado" ? "Gravou" : "Aprovou para gravar";
    saida.push({
      id: `roteiro:${r.id}`,
      fonte: "roteiro",
      esfera: r.status === "descartada" ? "recusas" : "decisoes",
      titulo: cortar(r.titulo, 90),
      texto: [`${rotulo} o roteiro "${cortar(r.titulo, 120)}".`, str(r.tese) ? `Tese: ${cortar(r.tese, 400)}` : ""].filter(Boolean).join("\n"),
      quando: iso(r.updatedAt),
      tags: ["roteiro", r.status],
      link: `/projects/${p}/linha-editorial`,
      pecas: [],
    });
  }
  return saida;
}

/** Os registros válidos (do tipo "cerebro"), pela chave da nota. */
export function lerRegistros(memorias: MemoriaDaFonte[]): Map<string, RegistroDoCerebro> {
  const mapa = new Map<string, RegistroDoCerebro>();
  for (const m of memorias) {
    if (m.type !== "cerebro") continue;
    const r = obj(m.value) as unknown as RegistroDoCerebro;
    if (!r || r.v !== 1 || typeof r.nota !== "string") continue;
    mapa.set(r.nota, { ...r, ligacoes: Array.isArray(r.ligacoes) ? r.ligacoes.filter((l) => l && typeof l.para === "string") : [] });
  }
  return mapa;
}

/** Todas as notas do cliente (sem as esferas e o centro), com a leitura do JEV quando há. */
export function notasDoCliente(f: FontesDoCerebro): NotaDoCerebro[] {
  const registros = lerRegistros(f.memorias);
  const notas = [
    ...notasDoProjeto(f.projeto),
    ...notasDasMemorias(f.projeto.id, f.memorias, f.feedbacks ?? []),
    ...notasDasTabelas(f),
  ];
  // A nota de peça só existe no registro (é o fato que não mora em outro lugar).
  for (const r of registros.values()) {
    if (r.evento) {
      const n = notaDaPeca(r.evento, f.projeto.id);
      if (n) notas.push(n);
    }
  }
  const vistos = new Set<string>();
  const unicas = notas.filter((n) => (vistos.has(n.id) ? false : (vistos.add(n.id), true)));
  for (const n of unicas) {
    const r = registros.get(n.id);
    if (r) {
      n.tema = r.tema ?? null;
      n.duradoura = r.duradoura ?? null;
      // A correção do cliente vale sobre o texto montado (só onde o registro é a fonte).
      if ((n.fonte === "peca" || n.fonte === "vera") && typeof r.correcao === "string" && r.correcao.trim()) {
        n.titulo = cortar(r.correcao, 90);
        n.texto = `${semTravessao(r.correcao.trim())}\n\n(Corrigida pelo cliente${r.corrigidaEm ? ` em ${dataCurta(r.corrigidaEm)}` : ""}.)`;
        n.corrigida = true;
        n.editavel = r.correcao.trim();
        n.tags = [...n.tags, "corrigida"];
      }
    }
  }
  return unicas;
}

const ordemPorData = (a: NotaDoCerebro, b: NotaDoCerebro) => (b.quando ?? "").localeCompare(a.quando ?? "");

/**
 * O cérebro inteiro para a tela: centro, esferas, notas e ligações. Registro
 * cuja nota não existe mais (a regra apagada, o material removido) não vira
 * nota nem ligação: estado que sobrevive ao fato vira mentira na tela.
 */
export function montarCerebro(f: FontesDoCerebro, opcoes: { teto?: number; agora?: Date } = {}): CerebroNaTela {
  const teto = opcoes.teto ?? TETO_DE_NOTAS_NA_TELA;
  const todas = notasDoCliente(f).sort(ordemPorData);
  const notas = todas.slice(0, teto);
  const cortadas = Math.max(0, todas.length - notas.length);
  const ids = new Set(notas.map((n) => n.id));
  const registros = lerRegistros(f.memorias);

  const presentes = ESFERAS.filter((e) => notas.some((n) => n.esfera === e));
  const centro: NotaDoCerebro = {
    id: "projeto",
    fonte: "projeto",
    esfera: null,
    titulo: f.projeto.name,
    texto: `O segundo cérebro de ${f.projeto.name}: ${notas.length} ${notas.length === 1 ? "nota" : "notas"} sobre o que foi pedido, aprovado, recusado e decidido aqui.`,
    quando: null,
    tags: [],
    link: null,
    pecas: [],
  };
  const hubs: NotaDoCerebro[] = presentes.map((e) => {
    const n = notas.filter((x) => x.esfera === e).length;
    return { id: `esfera:${e}`, fonte: "esfera", esfera: e, titulo: ROTULO_DA_ESFERA[e], texto: `${n} ${n === 1 ? "nota" : "notas"} em ${ROTULO_DA_ESFERA[e].toLowerCase()}.`, quando: null, tags: [], link: null, pecas: [] };
  });

  const ligacoes: LigacaoDoCerebro[] = [];
  const vistas = new Set<string>();
  const ligar = (de: string, para: string, tipo: LigacaoDoCerebro["tipo"], confianca?: number | null) => {
    if (de === para) return;
    const k = [de, para].sort().join("|");
    if (vistas.has(k)) return;
    vistas.add(k);
    ligacoes.push({ de, para, tipo, ...(confianca != null ? { confianca } : {}) });
  };

  for (const h of hubs) ligar("projeto", h.id, "esfera");
  for (const n of notas) if (n.esfera) ligar(`esfera:${n.esfera}`, n.id, "esfera");

  // Mesma peça: em estrela na nota de peça quando ela existe; senão, em fila.
  const porPeca = new Map<string, NotaDoCerebro[]>();
  for (const n of notas) for (const p of n.pecas) porPeca.set(p, [...(porPeca.get(p) ?? []), n]);
  for (const grupo of porPeca.values()) {
    if (grupo.length < 2) continue;
    const ancora = grupo.find((n) => n.fonte === "peca");
    if (ancora) for (const n of grupo) ligar(ancora.id, n.id, "mesma_peca");
    else for (let i = 1; i < grupo.length; i++) ligar(grupo[i - 1].id, grupo[i].id, "mesma_peca");
  }

  // As ligações que o JEV decidiu (só entre notas que existem hoje).
  for (const r of registros.values()) {
    if (!ids.has(r.nota)) continue;
    for (const l of r.ligacoes) if (ids.has(l.para)) ligar(r.nota, l.para, "jev", l.confianca ?? null);
  }

  return {
    projeto: { id: f.projeto.id, nome: f.projeto.name },
    notas: [centro, ...hubs, ...notas],
    ligacoes,
    cortadas,
    montadoEm: (opcoes.agora ?? new Date()).toISOString(),
  };
}

/**
 * A BUSCA NAS NOTAS: sem acento, sem diferenciar maiúscula, em título, texto,
 * etiquetas e esfera. Todas as palavras da busca precisam aparecer. Pura: a
 * tela e a Vera usam a mesma.
 */
export function buscarNotas(notas: NotaDoCerebro[], busca: string): NotaDoCerebro[] {
  const termos = normal(busca).split(" ").filter(Boolean);
  if (!termos.length) return notas;
  return notas.filter((n) => {
    const alvo = normal([n.titulo, n.texto, n.tags.join(" "), n.esfera ? ROTULO_DA_ESFERA[n.esfera] : ""].join(" "));
    return termos.every((t) => alvo.includes(t));
  });
}

/**
 * A CÓPIA DA MEMÓRIA EM TEXTO (06/10): o cliente pede cópia e recebe tudo,
 * sem o teto da tela, nota por nota com as ligações. Pura.
 */
export function cerebroEmMarkdown(c: CerebroNaTela): string {
  const porId = new Map(c.notas.map((n) => [n.id, n]));
  const vizinhos = new Map<string, string[]>();
  for (const l of c.ligacoes) {
    if (l.tipo === "esfera") continue;
    vizinhos.set(l.de, [...(vizinhos.get(l.de) ?? []), l.para]);
    vizinhos.set(l.para, [...(vizinhos.get(l.para) ?? []), l.de]);
  }
  const total = c.notas.filter((n) => n.fonte !== "esfera" && n.id !== "projeto").length;
  const linhas = [`# Segundo cérebro: ${c.projeto.nome}`, "", `Cópia gerada em ${dataCurta(c.montadoEm)}. ${total} ${total === 1 ? "nota" : "notas"}.`, ""];
  for (const e of ESFERAS) {
    const notas = c.notas.filter((n) => n.esfera === e && n.fonte !== "esfera");
    if (!notas.length) continue;
    linhas.push(`## ${ROTULO_DA_ESFERA[e]}`, "");
    for (const n of notas) {
      linhas.push(`### ${n.titulo}`);
      const meta = [n.quando ? dataCurta(n.quando) : "", n.tags.join(", "), n.tema ? `tema: ${n.tema}` : "", n.duradoura ? "vale para as próximas peças" : ""].filter(Boolean).join(" | ");
      if (meta) linhas.push(`_${meta}_`);
      linhas.push("", n.texto, "");
      const viz = (vizinhos.get(n.id) ?? []).map((id) => porId.get(id)?.titulo).filter(Boolean);
      if (viz.length) linhas.push(`Ligada a: ${viz.join("; ")}`, "");
    }
  }
  return semTravessao(linhas.join("\n"));
}
