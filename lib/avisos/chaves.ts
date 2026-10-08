import { etapaDeRetomada } from "@/lib/media/video-state";

/**
 * AS CHAVES DOS AVISOS DESCARTÁVEIS (07/10/2026).
 *
 * O pedido do Bruno, com o print da faixa da montagem que não saía da tela:
 * "toda notificação precisa ter a opção de descartar". O descarte é lembrado
 * no servidor, por pessoa e por OCORRÊNCIA do fato: a mesma falha descartada
 * não volta ao recarregar nem em outro aparelho, e uma falha nova da mesma
 * peça (outro `desde`, outra etapa, outro incidente) volta a aparecer.
 *
 * Módulo PURO, sem banco: a tela importa daqui para montar a chave do que ela
 * desenha, e o servidor importa as mesmas funções para perguntar ao banco o
 * que já foi descartado. As duas pontas nunca divergem.
 *
 * ## O FORMATO
 *
 * "<prefixo>:<id do fato>:<marca da ocorrência>". A marca é o que muda quando
 * o fato acontece de novo: o `desde` da montagem, a etapa com o `attempts`, o
 * runId, o id do incidente, a última recarga. Todo construtor normaliza: cada
 * parte troca espaço por "-", perde os caracteres de controle e cabe em 120;
 * texto livre e lista viram `marca()` (FNV-1a de 32 bits em 8 hex); a chave
 * inteira cabe em 300. Sem a marca, o construtor devolve null e a tela usa um
 * X só local (esconde nesta visita, sem lembrar).
 *
 * ## O MESMO FATO NO SINO E NA TELA
 *
 * Só em dois casos a chave é a mesma das notificações do sino (e por isso
 * descartar num lugar tira do outro): a montagem de efeitos que falhou e a
 * campanha que falhou. Pedido de aprovação NUNCA divide a chave: no sino ele é
 * "roteiro:" e "pecas:", no cartão da esteira é "video:roteiro:" e
 * "video:pecas:". Descartar o lembrete não some com a porta da ação.
 */

/** Os prefixos das chaves que o sino grava (lib/notificacoes, aviso de saldo, aviso aos admins). */
export const PREFIXOS_DO_SINO = [
  "roteiro",
  "pecas",
  "pecas-extra",
  "campanha",
  "completo",
  "falha",
  "estorno",
  "gemeo-consentimento",
  "gemeo-lembrete",
  "gemeo-pronto",
  "gemeo-sem-vaga",
  "gemeo-falhou",
  "cancelado",
  "saldo",
  "saldo-voltou",
  "admin",
] as const;

/** Os prefixos das chaves que só as telas gravam (faixas, cartões, dicas). */
export const PREFIXOS_DAS_TELAS = [
  "montagem-segura",
  "montagem-motivo",
  "revisao-corte",
  "abertura-ia",
  "campanha-cancelada",
  "video",
  "vigia",
  "dica",
  "visita-peca",
  "sugestao",
  "estilo-aguardando",
  "arte-falhou",
  "andamento-parado",
  "nao-revisado",
  "video-da-peca",
  "dia-reprovado",
  "pedido-parou",
  "jornada-projeto-vazio",
  "publicacao-falhou",
  "reconectar",
  "plano-alerta",
  "creditos-acabando",
  "comprar-creditos-auto",
  "saldo-fornecedor",
  "gemeo-falta-um-passo",
  "gemeo-resumo",
  "gemeo-situacao",
  "gemeo-config",
  "estudo",
  "acima-do-plano",
  "cores-de-fabrica",
  "confirmar-cores",
  "aprovacao-caiu",
  "artes-esperando",
  "cota",
  "conta-reconectar",
  "linkedin-paginas",
  "conexao-assistida",
  "roteiro-tela",
  "estilo-novo",
  "plano-pendente",
  "cena-pedido",
  "estilo-mudou",
  "propostas-roberto",
  "portao",
  "corte-nao-aplicado",
] as const;

/**
 * As duas chaves do sino que também têm faixa na tela (a montagem e a campanha
 * que falharam): descartar num lugar tira do outro. O "Limpar as lidas" do sino
 * deixa estas de fora, para não sumir com a faixa que a pessoa não descartou.
 */
export const CHAVES_DO_SINO_COM_FAIXA: readonly string[] = ["falha:efeitos:", "falha:campanha:"];

/**
 * O que vai na semente do cliente (o conjunto que a tela recebe ao abrir): as
 * chaves das telas, mais as duas do sino que também têm faixa. As outras
 * chaves do sino ficam de fora: o servidor já as filtra na lista do sino, e
 * elas não podem empurrar para fora do teto as chaves que as telas precisam.
 * É também o que a rota /api/avisos/descartes aceita (`ehChaveDasTelas`).
 */
export const PREFIXOS_DA_SEMENTE: readonly string[] = [...PREFIXOS_DAS_TELAS.map((p) => `${p}:`), ...CHAVES_DO_SINO_COM_FAIXA];

/**
 * Os avisos SEM FIM NATURAL: dicas fixas e escolhas que não mudam sozinhas. O
 * descarte deles vale para sempre, então eles têm cota própria na semente e
 * nunca saem para abrir espaço no teto da pessoa.
 */
export const PREFIXOS_SEM_FIM: readonly string[] = ["dica:", "cores-de-fabrica:", "confirmar-cores:", "jornada-projeto-vazio:", "portao:", "acima-do-plano:"];

/**
 * Os da semente que TÊM fim natural (a falha, a visita, a ocorrência marcada):
 * no teto, os mais antigos destes saem primeiro, e o descarte novo cabe.
 */
export const PREFIXOS_COM_FIM: readonly string[] = PREFIXOS_DA_SEMENTE.filter((p) => !PREFIXOS_SEM_FIM.includes(p));

const TODOS = new Set<string>([...PREFIXOS_DO_SINO, ...PREFIXOS_DAS_TELAS]);

/** O teto de uma chave (o mesmo de notificacoes.chave). */
export const TAMANHO_DA_CHAVE = 300;
/** O teto de cada parte da chave. */
export const TAMANHO_DA_PARTE = 120;

const CONTROLE = /[\u0000-\u001f\u007f]/g;

/** Uma parte da chave: sem espaço (vira "-"), sem caractere de controle, até 120. */
export function parte(x: string | number): string {
  return String(x).replace(/\s+/g, "-").replace(CONTROLE, "").slice(0, TAMANHO_DA_PARTE);
}

/**
 * A MARCA de um texto livre: FNV-1a de 32 bits em 8 hex. Determinística, curta
 * e sem espaço, para caber na chave o motivo de uma falha ou o pedido de uma
 * cena sem que dois textos longos parecidos colidam pelo corte.
 */
export function marca(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** A marca de uma lista: ordenada, unida por vírgula, e então `marca()`. */
export function marcaDaLista(ids: readonly string[]): string {
  return marca([...ids].sort().join(","));
}

type Parte = string | number | null | undefined;

/** Monta a chave, ou null quando falta alguma parte (a marca da ocorrência, quase sempre). */
function montar(prefixo: string, ...partes: Parte[]): string | null {
  if (partes.some((p) => p === null || p === undefined || p === "")) return null;
  return [prefixo, ...partes.map((p) => parte(p as string | number))].join(":").slice(0, TAMANHO_DA_CHAVE);
}

/**
 * É uma chave que a rota aceita? Até 300 caracteres, sem espaço nem quebra de
 * linha, e com um prefixo conhecido (do sino ou das telas).
 */
export function ehChaveDeAviso(c: unknown): c is string {
  if (typeof c !== "string" || !c.length || c.length > TAMANHO_DA_CHAVE) return false;
  if (/\s/.test(c) || new RegExp(CONTROLE.source).test(c)) return false;
  const i = c.indexOf(":");
  if (i <= 0 || i === c.length - 1) return false;
  return TODOS.has(c.slice(0, i));
}

/**
 * É uma chave que as TELAS gravam? A rota /api/avisos/descartes aceita só
 * estas: as chaves só do sino entram pelo sino, pelo id de uma notificação que
 * existe, e por isso não enchem a tabela com sufixo inventado.
 */
export function ehChaveDasTelas(c: unknown): c is string {
  return ehChaveDeAviso(c) && PREFIXOS_DA_SEMENTE.some((p) => c.startsWith(p));
}

// ─── A montagem de efeitos (a faixa do print, o card da peça e o sino) ───

/**
 * A falha da montagem de efeitos: byte a byte a chave que o observador grava no
 * sino (lib/notificacoes/observador.ts, `falha:${etapa}:${video}:${marca}`).
 * O `desde` é o texto cru do banco (o ISO que a montagem gravou). Sem ele, null.
 */
export function chaveDaMontagem(videoJobId: string, alvo: "completo" | number, desde: string | null | undefined): string | null {
  if (!desde) return null;
  return alvo === "completo" ? montar("falha", "efeitos", videoJobId, desde) : montar("falha", "efeitos", videoJobId, `corte-${alvo}`, desde);
}

/** A versão segura que foi ao ar (a revisão visual não consertou a montagem). */
export function chaveDaMontagemSegura(videoJobId: string, alvo: "completo" | number, desde: string | null | undefined): string | null {
  return montar("montagem-segura", videoJobId, alvo, desde);
}

/** "Corte sem a edição completa", com o motivo, no card. */
export function chaveDoMotivoDaMontagem(cardId: string, desde: string | null | undefined): string | null {
  return montar("montagem-motivo", cardId, desde);
}

/** A revisão do corte pela Vera que terminou sem conserto. */
export function chaveDaRevisaoDoCorte(cardId: string, ocorrencia: string | number | null | undefined): string | null {
  return montar("revisao-corte", cardId, ocorrencia);
}

/** A abertura por IA que terminou sem sair. */
export function chaveDaAberturaIa(cardId: string, estado: string, desde: string | null | undefined): string | null {
  return montar("abertura-ia", cardId, estado, desde);
}

// ─── A campanha ───

/** A campanha que falhou (a mesma do sino) ou que foi cancelada. */
export function chaveDaCampanha(runId: string, status: string): string | null {
  if (status === "failed") return montar("falha", "campanha", runId);
  if (status === "cancelled") return montar("campanha-cancelada", runId);
  return null;
}

// ─── A esteira do vídeo ───

export type VideoParaChave = {
  id: string;
  criadoEm: string;
  inicioDaRodada?: string | null;
  terminadoEm?: string | null;
  attempts: number;
  temTranscricao: boolean;
  temTrechos: boolean;
  temCortes?: boolean;
  roteiroPendente?: boolean;
};

export type ChavesDoVideo = {
  /** O vídeo que parou: a etapa de retomada e o attempts marcam a ocorrência. */
  falhou: string;
  completoFalhou: string;
  roteiro: string;
  pecas: string;
  pronto: string;
};

/**
 * AS CINCO CHAVES POSSÍVEIS DO CARTÃO DE UM VÍDEO. Quem decide qual delas o
 * cartão usa é o cliente (a leitura que só avança); o servidor pergunta as
 * cinco ao banco de uma vez, e a tela acha a dela no conjunto.
 *
 * O "falhou" leva a etapa de retomada E o attempts: o attempts volta a zero a
 * cada etapa que dá certo e sobe de novo na seguinte, então só ele repetiria a
 * chave de uma falha nova em outra etapa (a transcrição falha com 1, a seleção
 * falha com 1). A etapa é a mesma conta do código da falha no cartão e do
 * observador do sino (`etapaDeRetomada`).
 */
export function chavesCandidatasDoVideo(v: VideoParaChave): ChavesDoVideo {
  const rodada = v.inicioDaRodada ?? v.criadoEm;
  const etapa = etapaDeRetomada(v);
  return {
    falhou: montar("video", "falhou", v.id, rodada, etapa, v.attempts) as string,
    completoFalhou: montar("video", "completo-falhou", v.id, rodada) as string,
    roteiro: montar("video", "roteiro", v.id, rodada) as string,
    pecas: montar("video", "pecas", v.id, rodada) as string,
    pronto: montar("video", "pronto", v.id, v.terminadoEm ?? rodada) as string,
  };
}

/** A lista das cinco, para perguntar ao banco. */
export function listaDasChavesDoVideo(v: VideoParaChave): string[] {
  return Object.values(chavesCandidatasDoVideo(v));
}

/** O aviso do vigia (retomada ou passou do prazo). */
export function chaveDoVigia(videoId: string, status: string, retomada: number | "prazo"): string | null {
  return montar("vigia", videoId, status, retomada);
}

// ─── Dicas fixas (descarte permanente por pessoa) ───

/** "dica:<nome>" ou "dica:<nome>:<projectId>". */
export function chaveDaDica(nome: string, ...contexto: Parte[]): string | null {
  if (!contexto.length) return montar("dica", nome);
  return montar("dica", nome, ...contexto);
}

// ─── Escritório ───

export function chaveDaVisitaDaPeca(agentId: string, postId: string): string | null {
  return montar("visita-peca", agentId, postId);
}

export function chaveDaSugestao(sugestaoId: string): string | null {
  return montar("sugestao", sugestaoId);
}

// ─── Quadro e modal do card ───

/**
 * "Aguardando o estilo dos posts", por projeto e por LOTE de peças que espera
 * (a campanha, ou o vídeo, de onde as peças vieram): um X esconde a frase nos
 * cartões daquele lote, e a espera nova (a aprovação caiu numa troca de cores
 * e outra leva de peças nasceu esperando) volta a explicar o botão.
 */
export function chaveDoEstiloAguardando(projectId: string, lote: string | null | undefined): string | null {
  return montar("estilo-aguardando", projectId, lote);
}

/** A arte que não saiu: a marca é `arteFalhou.em` (lib/modelos-de-arte/espera-da-identidade.ts). */
export function chaveDaArteQueFalhou(postId: string, em: string | null | undefined): string | null {
  return montar("arte-falhou", postId, em);
}

export function chaveDoAndamentoParado(runId: string, dia: number | string, fase: string): string | null {
  return montar("andamento-parado", runId, dia, fase);
}

export function chaveDoNaoRevisado(cardId: string, postIds: readonly string[]): string | null {
  if (!postIds.length) return null;
  return montar("nao-revisado", cardId, marcaDaLista(postIds));
}

export function chaveDoVideoDaPeca(postId: string, codigo: string | null | undefined, tentativa: number | string | null | undefined): string | null {
  return montar("video-da-peca", postId, codigo || "sem-codigo", tentativa ?? 0);
}

export function chaveDoDiaReprovado(cardId: string, postIds: readonly string[]): string | null {
  return montar("dia-reprovado", cardId, marcaDaLista(postIds));
}

export function chaveDoPedidoQueParou(cardId: string, pedidoId: string | null | undefined): string | null {
  return montar("pedido-parou", cardId, pedidoId);
}

export function chaveDaJornadaDoProjetoVazio(projectId: string): string | null {
  return montar("jornada-projeto-vazio", projectId);
}

// ─── Posts e publicação ───

/**
 * A publicação que falhou. A marca é a do erro (a mesma regra de ocorrência
 * de `chamadoDaFalha`, lib/publish/codigos.ts: uma falha nova muda a frase),
 * e nunca o updatedAt, que muda a cada métrica ou sincronização.
 */
export function chaveDaPublicacao(postId: string, erro: string | null | undefined): string | null {
  return montar("publicacao-falhou", postId, marca(erro ?? "sem-erro"));
}

/** A chave da falha de um post, lida do metadata dele (o erro gravado, ou o código da ponte). */
export function chaveDoPostQueFalhou(postId: string, metadata: unknown): string | null {
  const m = (metadata ?? null) as { error?: unknown; ponte?: { codigo?: unknown } } | null;
  const erro = typeof m?.error === "string" ? m.error : typeof m?.ponte?.codigo === "string" ? m.ponte.codigo : null;
  return chaveDaPublicacao(postId, erro);
}

export function chaveDaReconexaoDoPost(postId: string, socialAccountId: string | null | undefined, needsReconnectAt: string | null | undefined): string | null {
  return montar("reconectar", postId, socialAccountId, needsReconnectAt);
}

// ─── Plano e créditos ───

export function chaveDoAlertaDoPlano(motivo: string | null | undefined, marcaDoAlerta: string | null | undefined): string | null {
  return montar("plano-alerta", motivo, marcaDoAlerta);
}

/** Os créditos acabando (ou, para o membro da equipe, zerados), lembrado até a próxima recarga. */
export function chaveDosCreditosAcabando(marcaDaRecarga: string | null | undefined, faixa: "acabando" | "zerado" = "acabando"): string | null {
  return faixa === "zerado" ? montar("creditos-acabando", marcaDaRecarga, "zerado") : montar("creditos-acabando", marcaDaRecarga);
}

export function chaveDaCompraAutomatica(marcaDaRecarga: string | null | undefined, faixa: "acabando" | "zerado"): string | null {
  return montar("comprar-creditos-auto", marcaDaRecarga, faixa);
}

// ─── Admin ───

export function chaveDoSaldoDoFornecedor(incidenteId: string): string | null {
  return montar("saldo-fornecedor", incidenteId);
}

// ─── Gêmeo ───

/**
 * O selo "Falta um passo no gêmeo". A ocorrência (o grupo do treino, ou a
 * origem) entra só como `marca()`: a chave desce ao navegador, e o id do
 * fornecedor nunca desce (a mesma regra de cadastroParaTela).
 */
export function chaveDoGemeoFaltaUmPasso(projectId: string, ocorrencia: string | null | undefined, lembrete = false): string | null {
  if (!ocorrencia) return null;
  const m = marca(ocorrencia);
  return lembrete ? montar("gemeo-falta-um-passo", projectId, m, "lembrete") : montar("gemeo-falta-um-passo", projectId, m);
}

/**
 * O resumo do gêmeo na tela dele. A ocorrência é o que muda quando o fato se
 * repete (a origem da foto, o prazo do link): o grupoId do fornecedor não
 * desce ao navegador (cadastroParaTela).
 */
export function chaveDoResumoDoGemeo(projectId: string, fase: string, ocorrencia: string | null | undefined): string | null {
  return montar("gemeo-resumo", projectId, fase, marca(ocorrencia ?? ""));
}

/** A marca da ocorrência do gêmeo na tela: a origem do treino ou da foto e o prazo do link. */
export function ocorrenciaDoGemeo(c: { avatar?: { origem?: string | null; consentimentoAte?: string | null } | null; foto?: { origem?: string | null } | null } | null | undefined): string {
  return [c?.avatar?.origem ?? "", c?.avatar?.consentimentoAte ?? "", c?.foto?.origem ?? ""].join("|");
}

export function chaveDaSituacaoDoGemeo(projectId: string, parteDoGemeo: string, estado: string, origem: string | null | undefined): string | null {
  return montar("gemeo-situacao", projectId, parteDoGemeo, estado, marca(origem ?? ""));
}

export function chaveDoGemeoNasConfiguracoes(projectId: string, fase: string, ocorrencia: string | null | undefined): string | null {
  return montar("gemeo-config", projectId, fase, marca(ocorrencia ?? ""));
}

// ─── Setup, referências, marca ───

export function chaveDoEstudo(projectId: string, id: string | null | undefined, estado: string): string | null {
  return montar("estudo", projectId, id, estado);
}

export function chaveDoAcimaDoPlano(projectId: string, plano: string | null | undefined): string | null {
  return montar("acima-do-plano", projectId, plano || "sem-plano");
}

export function chaveDasCoresDeFabrica(projectId: string): string | null {
  return montar("cores-de-fabrica", projectId);
}

export function chaveDeConfirmarCores(projectId: string): string | null {
  return montar("confirmar-cores", projectId);
}

export function chaveDaAprovacaoQueCaiu(projectId: string, instante: string | number | null | undefined): string | null {
  return montar("aprovacao-caiu", projectId, instante);
}

export function chaveDaCorNoVideo(projectId: string, cor: string | null | undefined): string | null {
  return chaveDaDica("cor-no-video", projectId, cor ? cor.replace(/^#/, "").toLowerCase() : null);
}

export function chaveDasArtesEsperando(projectId: string, aprovadaEm: string | null | undefined): string | null {
  return montar("artes-esperando", projectId, aprovadaEm);
}

// ─── Envio, redes ───

export function chaveDaCota(renovaEm: string | null | undefined, restantes: number): string | null {
  return montar("cota", renovaEm, restantes);
}

export function chaveDaContaAReconectar(accountId: string, needsReconnectAt: string | null | undefined): string | null {
  return montar("conta-reconectar", accountId, needsReconnectAt);
}

export function chaveDasPaginasDoLinkedin(projectId: string, resultado: string): string | null {
  return montar("linkedin-paginas", projectId, resultado);
}

export function chaveDaConexaoAssistida(rede: string, pedidoEm: string | null | undefined): string | null {
  return montar("conexao-assistida", rede, pedidoEm);
}

// ─── Tela de roteiro ───

export function chaveDoAvisoDoRoteiro(videoId: string, tipo: string, rodada: string | null | undefined): string | null {
  return montar("roteiro-tela", videoId, tipo, rodada);
}

export function chaveDoEstiloNovo(videoId: string, estilo: string | null | undefined): string | null {
  return montar("estilo-novo", videoId, estilo);
}

/** O plano de efeitos lendo ou com erro. Com erro, a `marca()` do erro: um erro novo volta. */
export function chaveDoPlanoPendente(videoId: string, estado: string, ocorrencia?: string | null): string | null {
  return ocorrencia ? montar("plano-pendente", videoId, estado, marca(ocorrencia)) : montar("plano-pendente", videoId, estado);
}

export function chaveDoPedidoDaCena(videoId: string, indice: number, pedido: string | null | undefined): string | null {
  if (!pedido) return null;
  return montar("cena-pedido", videoId, indice, marca(pedido));
}

/**
 * "O seu último corte no vídeo completo não pôde ser aplicado" (o controle do
 * corte): a ocorrência é a `marca()` do aviso, que leva o motivo daquela vez.
 */
export function chaveDoCorteNaoAplicado(videoId: string, aviso: string | null | undefined): string | null {
  if (!aviso) return null;
  return montar("corte-nao-aplicado", videoId, marca(aviso));
}

export function chaveDoEstiloQueMudou(videoId: string, planejadoEm: string | null | undefined, estilo: string | null | undefined): string | null {
  return montar("estilo-mudou", videoId, planejadoEm, estilo);
}

// ─── Outros ───

export function chaveDasPropostasDoRoberto(projectId: string, ids: readonly string[]): string | null {
  if (!ids.length) return null;
  return montar("propostas-roberto", projectId, marcaDaLista(ids));
}

export function chaveDoPortao(nome: string): string | null {
  return montar("portao", nome);
}
