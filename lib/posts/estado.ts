/**
 * O ESTADO de um post, com uma palavra e uma cor so, em toda tela.
 *
 * Existe porque em 10/09 o Bruno nao conseguia dizer o que ia sair e o que
 * nao: o quadro dizia "2 posts prontos" (texto gravado na geracao, que nao
 * muda nunca), o card dizia "na fila", a fila do Paulo dizia "pendente", e a
 * Agenda do menu nao existia. Cada tela tinha o seu vocabulario, e nenhum
 * respondia a pergunta dele.
 *
 * Quatro estados, e nada alem deles. O que precisa de acao do cliente e o
 * rascunho ("nao sai") e a falha ("o que fazer"); os outros dois sao noticia.
 * Estado e DERIVADO do dado no momento de mostrar, nunca texto guardado.
 */

export type PostParaEstado = {
  id: string;
  platform: string;
  mediaType?: string | null;
  status: string;
  scheduledAt?: string | Date | null;
  publishedAt?: string | Date | null;
  externalUrl?: string | null;
  socialAccountId?: string | null;
  metadata?: unknown;
};

export type ChaveDeEstado = "publicado" | "agendado" | "rascunho" | "falhou" | "publicando";

export type Estado = {
  chave: ChaveDeEstado;
  /** A palavra curta, a mesma em toda tela. */
  rotulo: string;
  /** O que o cliente precisa saber alem da palavra. */
  detalhe: string;
  cor: string;
  /** O que ele pode fazer, quando ha o que fazer. */
  acao?: "agendar" | "reconectar" | "tentar";
};

export const CORES: Record<ChaveDeEstado, string> = {
  publicado: "#4ade80",
  agendado: "#60a5fa",
  publicando: "#60a5fa",
  rascunho: "#9599a6",
  falhou: "#f87171",
};

export const NOMES_DAS_REDES: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X",
  instagram: "Instagram",
  youtube: "YouTube",
  facebook: "Facebook",
};

export function nomeDaRede(platform: string): string {
  return NOMES_DAS_REDES[platform] ?? platform;
}

const data = (v: string | Date | null | undefined): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

export function horaCurta(d: Date): string {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export function diaCurto(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

/** "em 2 h 14 min", "em 40 min", ou vazio quando ja passou. */
export function faltaQuanto(alvo: Date, agora: Date = new Date()): string {
  const ms = alvo.getTime() - agora.getTime();
  if (ms <= 0) return "";
  const min = Math.round(ms / 60000);
  if (min < 60) return `em ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  if (h < 24) return resto ? `em ${h} h ${resto} min` : `em ${h} h`;
  const dias = Math.floor(h / 24);
  return `em ${dias} dia${dias > 1 ? "s" : ""}`;
}

export function estadoDoPost(p: PostParaEstado, agora: Date = new Date()): Estado {
  const meta = (p.metadata as { error?: string; erro?: string; url?: string } | null) ?? null;
  const publicadoEm = data(p.publishedAt);
  const agendadoPara = data(p.scheduledAt);

  if (p.status === "published") {
    return {
      chave: "publicado",
      rotulo: "Publicado",
      detalhe: publicadoEm ? `${diaCurto(publicadoEm)} às ${horaCurta(publicadoEm)}` : "no ar",
      cor: CORES.publicado,
    };
  }
  if (p.status === "failed") {
    const motivo = meta?.error ?? meta?.erro;
    return {
      chave: "falhou",
      rotulo: "Falhou",
      detalhe: motivo ? motivo.slice(0, 90) : "a rede recusou o post",
      cor: CORES.falhou,
      acao: /token|autoriza|expir|reconect/i.test(motivo ?? "") ? "reconectar" : "tentar",
    };
  }
  if (p.status === "publishing") {
    return { chave: "publicando", rotulo: "Publicando", detalhe: "saindo agora", cor: CORES.publicando };
  }
  if (p.status === "scheduled" && agendadoPara) {
    const falta = faltaQuanto(agendadoPara, agora);
    return {
      chave: "agendado",
      rotulo: "Agendado",
      detalhe: falta
        ? `sai sozinho ${diaCurto(agendadoPara)} às ${horaCurta(agendadoPara)}, ${falta}`
        : `sai sozinho nos próximos minutos`,
      cor: CORES.agendado,
    };
  }
  if (!p.socialAccountId) {
    return {
      chave: "rascunho",
      rotulo: "Rascunho",
      detalhe: `não sai: conecte o ${nomeDaRede(p.platform)} em Configurações`,
      cor: CORES.rascunho,
      acao: "reconectar",
    };
  }
  return {
    chave: "rascunho",
    rotulo: "Rascunho",
    detalhe: "não sai enquanto você não agendar ou publicar",
    cor: CORES.rascunho,
    acao: "agendar",
  };
}

export type ResumoDoDia = {
  total: number;
  porEstado: Record<ChaveDeEstado, number>;
  /** O estado que manda no mini-card: falha ganha de tudo, depois rascunho, depois agendado, depois publicado. */
  dominante: ChaveDeEstado | null;
  /** O proximo horario em que algo sai, se houver. */
  proximo: Date | null;
  redes: string[];
  /** Uma frase para o mini-card do quadro. */
  titulo: string;
  linha: string;
  rodape: string;
  cor: string;
};

export function resumoDoDia(posts: PostParaEstado[], agora: Date = new Date()): ResumoDoDia {
  const porEstado: Record<ChaveDeEstado, number> = { publicado: 0, agendado: 0, publicando: 0, rascunho: 0, falhou: 0 };
  const redes = new Set<string>();
  let proximo: Date | null = null;
  for (const p of posts) {
    const e = estadoDoPost(p, agora);
    porEstado[e.chave]++;
    redes.add(nomeDaRede(p.platform));
    const quando = data(p.scheduledAt);
    if (e.chave === "agendado" && quando && (!proximo || quando < proximo)) proximo = quando;
  }
  const lista = [...redes];
  const redesTexto = lista.length <= 1 ? lista.join("") : `${lista.slice(0, -1).join(", ")} e ${lista[lista.length - 1]}`;
  const vazio: ResumoDoDia = { total: 0, porEstado, dominante: null, proximo: null, redes: lista, titulo: "", linha: "", rodape: "", cor: CORES.rascunho };
  if (!posts.length) return vazio;

  if (porEstado.falhou) {
    const falho = posts.map((p) => estadoDoPost(p, agora)).find((e) => e.chave === "falhou")!;
    return { ...vazio, total: posts.length, dominante: "falhou", cor: CORES.falhou, titulo: "Falhou", linha: falho.detalhe, rodape: falho.acao === "reconectar" ? "reconectar e tentar" : "tentar de novo" };
  }
  if (porEstado.rascunho) {
    const n = porEstado.rascunho;
    return { ...vazio, total: posts.length, dominante: "rascunho", cor: CORES.rascunho, titulo: "Rascunho · não sai", linha: `${n} post${n > 1 ? "s" : ""} esperando você`, rodape: "agendar ou publicar" };
  }
  if (porEstado.agendado || porEstado.publicando) {
    const quando = proximo ? horaCurta(proximo) : "";
    const falta = proximo ? faltaQuanto(proximo, agora) : "";
    return { ...vazio, total: posts.length, dominante: "agendado", proximo, cor: CORES.agendado, titulo: quando ? `Agendado · sai ${quando}` : "Agendado", linha: `${redesTexto}, sozinho`, rodape: falta || (proximo ? diaCurto(proximo) : "") };
  }
  const primeiro = posts.map((p) => data(p.publishedAt)).filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
  return { ...vazio, total: posts.length, dominante: "publicado", cor: CORES.publicado, titulo: primeiro ? `Publicado ${horaCurta(primeiro)}` : "Publicado", linha: `${redesTexto} no ar`, rodape: "ver posts" };
}
