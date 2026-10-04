import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { debitar, creditar } from "@/lib/credits";
import { apagarMidias } from "@/lib/media/faxina";
import { apagarVoz } from "@/lib/media/gemeo-fornecedores";
import { apagarGemeoNaHeygen, geradorPreferido } from "@/lib/media/gemeo-geradores";
import {
  CENARIOS,
  MAX_FOTOS,
  SEGUNDOS_MAXIMOS_DO_ROTEIRO,
  SEGUNDOS_MINIMOS_DO_ROTEIRO,
  dividirEmPedacos,
  duracaoFalada,
  fraseDaAutorizacao,
  gemeoAtivo,
  limparTexto,
  oQueFalta,
  pedacosDasCenas,
  precoDoRoteiro,
  textoDoTreino,
  videoEmAndamento,
  type CadastroDoGemeo,
  type CenaDoGemeo,
  type IdDoCenario,
  type IdDoGerador,
  type VideoDoGemeo,
} from "@/lib/media/gemeo";

/**
 * O GÊMEO DIGITAL NO BANCO (01/10/2026): cadastro, pedido de vídeo, revogação.
 *
 * ## Por projeto, e não por usuário
 *
 * O gêmeo mora no PROJETO porque o projeto é a marca, e o rosto de uma marca é
 * uma pessoa só. Quem atende mais de uma marca (agência, Enterprise) tem um
 * projeto por cliente, e cada cliente grava a PRÓPRIA autorização no projeto
 * dele: num cadastro por usuário, o rosto do dono da conta apareceria nos
 * vídeos de todos os clientes. Revogar um projeto também não derruba o gêmeo
 * dos outros. O custo é pequeno: a mesma pessoa em dois projetos grava duas
 * vezes (e ocupa duas vagas de voz na ElevenLabs).
 *
 * ## Por que em `project_memories`, e não num modelo novo
 *
 * O cadastro é UM documento por projeto (fotos, voz, autorização), lido e
 * escrito inteiro, e os vídeos do gêmeo são poucos por projeto e vivem pouco
 * (do pedido à esteira, menos de uma hora; depois o VideoJob é o registro).
 * A tabela de memória do projeto já tem JSON, a chave única (projeto, tipo,
 * chave) e o apagamento em cascata com o projeto. Nenhuma migração, e nada aqui
 * entra em prompt: os leitores da memória filtram pelo tipo.
 *
 *   tipo "gemeo"            chave "cadastro"      o CadastroDoGemeo
 *   tipo "gemeo-video"      chave = id do vídeo   um VideoDoGemeo
 *   tipo "gemeo-revogacao"  chave = data          o registro da revogação
 *
 * Do SERVIDOR. A tela importa só de `lib/media/gemeo.ts`.
 */

export const TIPO_CADASTRO = "gemeo";
export const CHAVE_CADASTRO = "cadastro";
export const TIPO_VIDEO = "gemeo-video";
export const TIPO_REVOGACAO = "gemeo-revogacao";
export const OPERACAO_DO_GEMEO = "gemeo_video";
export const OPERACAO_DO_ESTORNO = "gemeo_video_estorno";

export const agora = () => new Date().toISOString();

/**
 * O cadastro guardado, mais a lista de vozes que ainda precisam ser apagadas
 * na ElevenLabs e de gêmeos treinados a apagar na HeyGen (03/10).
 */
export type CadastroGuardado = CadastroDoGemeo & { vozesParaApagar?: string[]; avataresParaApagar?: string[] };

// ─────────────────────────────── memória com trava ───────────────────────────────

/**
 * Lê e muda um documento da memória do projeto DENTRO de uma trava por
 * documento. A tela (foto nova) e o passo do cron (foto recortada) escrevem
 * no mesmo cadastro, e ler e depois escrever sem trava perderia uma das duas
 * escritas. `mudar` devolve o novo valor, `null` para apagar ou `undefined`
 * para não mexer. É síncrona de propósito: nada de rede dentro da trava.
 */
export async function mudarMemoria<T>(
  projectId: string,
  type: string,
  key: string,
  mudar: (atual: T | null) => T | null | undefined
): Promise<T | null> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`select 1 as ok from (select pg_advisory_xact_lock(hashtext(${`gemeo:${projectId}:${type}:${key}`}))) as trava`;
      const onde = { projectId_type_key: { projectId, type, key } };
      const linha = await tx.projectMemory.findUnique({ where: onde, select: { value: true } });
      const atual = (linha?.value ?? null) as T | null;
      const novo = mudar(atual);
      if (novo === undefined) return atual;
      if (novo === null) {
        if (linha) await tx.projectMemory.delete({ where: onde });
        return null;
      }
      const value = novo as unknown as object;
      await tx.projectMemory.upsert({ where: onde, create: { projectId, type, key, value }, update: { value } });
      return novo;
    },
    { maxWait: 15_000, timeout: 20_000 }
  );
}

export async function lerCadastro(projectId: string): Promise<CadastroGuardado | null> {
  const l = await prisma.projectMemory.findUnique({
    where: { projectId_type_key: { projectId, type: TIPO_CADASTRO, key: CHAVE_CADASTRO } },
    select: { value: true },
  });
  return (l?.value ?? null) as CadastroGuardado | null;
}

export function mudarCadastro(projectId: string, mudar: (c: CadastroGuardado | null) => CadastroGuardado | null | undefined) {
  return mudarMemoria<CadastroGuardado>(projectId, TIPO_CADASTRO, CHAVE_CADASTRO, mudar);
}

export async function lerVideo(projectId: string, id: string): Promise<VideoDoGemeo | null> {
  const l = await prisma.projectMemory.findUnique({
    where: { projectId_type_key: { projectId, type: TIPO_VIDEO, key: id } },
    select: { value: true },
  });
  return (l?.value ?? null) as VideoDoGemeo | null;
}

export function mudarVideo(projectId: string, id: string, mudar: (v: VideoDoGemeo | null) => VideoDoGemeo | null | undefined) {
  return mudarMemoria<VideoDoGemeo>(projectId, TIPO_VIDEO, id, mudar);
}

export async function listarVideos(projectId: string): Promise<VideoDoGemeo[]> {
  const linhas = await prisma.projectMemory.findMany({
    where: { projectId, type: TIPO_VIDEO },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { value: true },
  });
  return linhas.map((l) => l.value as unknown as VideoDoGemeo);
}

// ─────────────────────────────── o cadastro ───────────────────────────────

function cadastroVazio(): CadastroGuardado {
  return { versao: 1, criadoEm: agora(), fotos: [], foto: null, voz: null, autorizacao: null };
}

/** A assinatura das fotos: foto nova ou removida recomeça a escolha. */
function origemDasFotos(urls: string[]): string {
  return createHash("sha256").update(urls.join("|")).digest("hex").slice(0, 12);
}

/**
 * A URL que o navegador diz ter enviado é mesmo deste projeto, no nosso store?
 * Sem esta conferência, quem conhece a URL de outro cliente a registraria como
 * a sua foto (e a revogação apagaria o arquivo do outro).
 */
export function urlDoProjeto(url: unknown, projectId: string): url is string {
  return (
    typeof url === "string" &&
    url.startsWith("https://") &&
    url.includes(".blob.vercel-storage.com/") &&
    url.includes(`/gemeo/${projectId}/`)
  );
}

export class ErroDoCadastro extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroDoCadastro";
  }
}

export async function adicionarFoto(projectId: string, url: string, nome?: string | null): Promise<CadastroGuardado> {
  if (!urlDoProjeto(url, projectId)) throw new ErroDoCadastro("Arquivo fora do projeto.");
  let cheio = false as boolean;
  const c = await mudarCadastro(projectId, (atual) => {
    const c = atual ?? cadastroVazio();
    if (c.fotos.some((f) => f.url === url)) return undefined;
    if (c.fotos.length >= MAX_FOTOS) {
      cheio = true;
      return undefined;
    }
    const fotos = [...c.fotos, { url, nome: nome ?? null, enviadaEm: agora() }];
    return { ...c, fotos, foto: { estado: "preparando", desde: agora(), origem: origemDasFotos(fotos.map((f) => f.url)), url: c.foto?.url ?? null } };
  });
  if (cheio) {
    await apagarMidias([url], `gemeo-foto-recusada/${projectId}`);
    throw new ErroDoCadastro(`São no máximo ${MAX_FOTOS} fotos. Tire uma antes de mandar outra.`);
  }
  return c!;
}

export async function removerFoto(projectId: string, url: string): Promise<CadastroGuardado | null> {
  let tirou = false;
  let recorteAntigo = null as string | null;
  const c = await mudarCadastro(projectId, (atual) => {
    if (!atual || !atual.fotos.some((f) => f.url === url)) return undefined;
    tirou = true;
    recorteAntigo = atual.foto?.url ?? null;
    const fotos = atual.fotos.filter((f) => f.url !== url);
    return {
      ...atual,
      fotos,
      foto: fotos.length
        ? { estado: "preparando", desde: agora(), origem: origemDasFotos(fotos.map((f) => f.url)), url: atual.foto?.url ?? null }
        : null,
    };
  });
  // A foto recortada antiga fica até a nova ficar pronta (o passo apaga na
  // troca); sem foto nenhuma, sai agora.
  if (tirou) await apagarMidias([url, ...(c && !c.fotos.length ? [recorteAntigo] : [])], `gemeo-foto/${projectId}`);
  return c;
}

export async function registrarVoz(
  projectId: string,
  args: { url: string; origem: "gravada" | "arquivo"; contentType?: string | null }
): Promise<CadastroGuardado> {
  if (!urlDoProjeto(args.url, projectId)) throw new ErroDoCadastro("Arquivo fora do projeto.");
  const antigos: string[] = [];
  const c = await mudarCadastro(projectId, (atual) => {
    const c = atual ?? cadastroVazio();
    if (c.voz?.amostraUrl === args.url) return undefined;
    const vozesParaApagar = [...(c.vozesParaApagar ?? [])];
    // 04/10: a voz APROVADA não sai com a amostra nova. A nova vira candidata;
    // a aprovada continua nos vídeos até a pessoa ouvir e aprovar a nova.
    const aprovada = c.vozAprovada;
    if (c.voz) {
      if (c.voz.amostraUrl !== aprovada?.amostraUrl) antigos.push(c.voz.amostraUrl, ...(c.voz.mp3Url ? [c.voz.mp3Url] : []));
      if (c.voz.previaUrl && c.voz.previaUrl !== aprovada?.previaUrl) antigos.push(c.voz.previaUrl);
      // Voz candidata substituída: sai da ElevenLabs no passo.
      if (c.voz.voiceId && c.voz.voiceId !== aprovada?.voiceId) vozesParaApagar.push(c.voz.voiceId);
    }
    return {
      ...c,
      vozesParaApagar,
      voz: { estado: "convertendo", desde: agora(), origem: args.origem, amostraUrl: args.url, contentType: args.contentType ?? null, tentativas: 0 },
    };
  });
  if (antigos.length) await apagarMidias(antigos, `gemeo-voz/${projectId}`);
  return c!;
}

/**
 * APROVAR A VOZ (04/10/2026): a pessoa ouviu a amostra da voz clonada e
 * aprovou. Ela vira a voz dos vídeos; a aprovada antes dela (se era outra)
 * sai da ElevenLabs no passo. Só vale para a voz pronta e com a amostra para
 * ouvir: ninguém aprova o que não ouviu.
 */
export async function aprovarVoz(projectId: string): Promise<CadastroGuardado> {
  let recusa: string | null = null;
  const antigos: string[] = [];
  const c = await mudarCadastro(projectId, (atual) => {
    const v = atual?.voz;
    if (!atual || !v || v.estado !== "pronta" || !v.voiceId) {
      recusa = "A voz ainda não está pronta para aprovar.";
      return undefined;
    }
    if (!v.previaUrl) {
      recusa = "A amostra da voz ainda está sendo preparada. Ouça antes de aprovar.";
      return undefined;
    }
    const anterior = atual.vozAprovada;
    if (anterior?.voiceId === v.voiceId) return undefined;
    if (anterior) {
      if (anterior.amostraUrl && anterior.amostraUrl !== v.amostraUrl) antigos.push(anterior.amostraUrl);
      if (anterior.previaUrl && anterior.previaUrl !== v.previaUrl) antigos.push(anterior.previaUrl);
    }
    const quando = agora();
    return {
      ...atual,
      vozesParaApagar: [...(atual.vozesParaApagar ?? []), ...(anterior ? [anterior.voiceId] : [])],
      voz: { ...v, aprovadaEm: quando },
      vozAprovada: { voiceId: v.voiceId, aprovadaEm: quando, origem: v.origem, amostraUrl: v.amostraUrl, segundos: v.segundos ?? null, previaUrl: v.previaUrl },
    };
  });
  if (recusa) throw new ErroDoCadastro(recusa);
  if (antigos.length) await apagarMidias(antigos, `gemeo-voz/${projectId}`);
  return c ?? (await lerCadastro(projectId))!;
}

export async function registrarAutorizacao(
  projectId: string,
  args: { url: string; nome: string; userId: string; segundos?: number | null; contentType?: string | null; userAgent?: string | null }
): Promise<CadastroGuardado> {
  if (!urlDoProjeto(args.url, projectId)) throw new ErroDoCadastro("Arquivo fora do projeto.");
  const nome = limparTexto(args.nome).slice(0, 120);
  if (nome.length < 3) throw new ErroDoCadastro("Escreva o seu nome completo antes de gravar.");
  const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  // O texto é montado AQUI, e não aceito da tela: é ele que vale como prova
  // do que foi autorizado, e não pode ser o que um navegador diz que mostrou.
  const texto = fraseDaAutorizacao(nome, projeto?.name);
  const antigos: string[] = [];
  const c = await mudarCadastro(projectId, (atual) => {
    const c = atual ?? cadastroVazio();
    if (c.autorizacao?.videoUrl === args.url) return undefined;
    if (c.autorizacao) antigos.push(c.autorizacao.videoUrl);
    return {
      ...c,
      autorizacao: {
        estado: "conferindo",
        desde: agora(),
        videoUrl: args.url,
        contentType: args.contentType ?? null,
        nome,
        texto,
        gravadaEm: agora(),
        segundos: args.segundos ?? null,
        userId: args.userId,
        userAgent: args.userAgent?.slice(0, 300) ?? null,
        tentativas: 0,
      },
    };
  });
  if (antigos.length) await apagarMidias(antigos, `gemeo-autorizacao/${projectId}`);
  return c!;
}

/**
 * O VÍDEO DE TREINO (03/10): um vídeo só, que vira foto, voz e autorização
 * depois das checagens (passo do cron, `cuidarDoTreino`). Como na
 * autorização, o texto que vale como prova é montado AQUI, nunca aceito da
 * tela. Treino novo substitui o anterior: o gêmeo treinado antigo entra na
 * fila de apagar, e os arquivos do treino e dos cenários anteriores saem.
 * A voz antiga sai quando a nova for registrada (`aplicarTreino`).
 */
export async function registrarTreino(
  projectId: string,
  args: { url: string; nome: string; userId: string; segundos?: number | null; contentType?: string | null; userAgent?: string | null }
): Promise<CadastroGuardado> {
  if (!urlDoProjeto(args.url, projectId)) throw new ErroDoCadastro("Arquivo fora do projeto.");
  const nome = limparTexto(args.nome).slice(0, 120);
  if (nome.length < 3) throw new ErroDoCadastro("Escreva o seu nome completo antes de gravar.");
  const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  const texto = textoDoTreino(nome, projeto?.name);
  const antigos: unknown[] = [];
  const c = await mudarCadastro(projectId, (atual) => {
    const c = atual ?? cadastroVazio();
    if (c.treino?.videoUrl === args.url) return undefined;
    if (c.treino) antigos.push(c.treino.videoUrl, ...Object.values(c.treino.arquivos ?? {}));
    for (const cen of Object.values(c.cenarios ?? {})) antigos.push(cen.url);
    const avataresParaApagar = [...(c.avataresParaApagar ?? [])];
    if (c.avatar?.grupoId) avataresParaApagar.push(c.avatar.grupoId);
    return {
      ...c,
      avataresParaApagar,
      avatar: null,
      cenarios: null,
      treino: {
        estado: "preparando",
        desde: agora(),
        videoUrl: args.url,
        contentType: args.contentType ?? null,
        nome,
        texto,
        gravadoEm: agora(),
        userId: args.userId,
        userAgent: args.userAgent?.slice(0, 300) ?? null,
        segundosNaTela: args.segundos ?? null,
        tentativas: 0,
      },
    };
  });
  if (antigos.length) await apagarMidias(antigos, `gemeo-treino/${projectId}`);
  return c!;
}

// ─────────────────────────────── créditos ───────────────────────────────

/** Quanto este vídeo de fato tirou do saldo (zero para acesso interno e cortesia). */
export async function cobradoDoVideo(id: string): Promise<{ cobrado: number; devolvido: number }> {
  const linhas = await prisma.creditTransaction.findMany({
    where: { OR: [{ operation: OPERACAO_DO_GEMEO, refId: id }, { operation: OPERACAO_DO_ESTORNO, refId: { startsWith: `${id}:` } }] },
    select: { amount: true, operation: true },
  });
  const cobrado = -linhas.filter((l) => l.operation === OPERACAO_DO_GEMEO && l.amount < 0).reduce((s, l) => s + l.amount, 0);
  const devolvido = linhas.filter((l) => l.operation === OPERACAO_DO_ESTORNO && l.amount > 0).reduce((s, l) => s + l.amount, 0);
  return { cobrado, devolvido };
}

/**
 * Devolve créditos de um vídeo, uma vez por motivo (`sufixo` entra no refId).
 * Nunca devolve mais do que saiu: quem não pagou (acesso interno) não recebe.
 */
export async function estornarVideo(v: Pick<VideoDoGemeo, "id" | "userId">, quantia: number, sufixo: string, nota: string): Promise<number> {
  if (quantia <= 0) return 0;
  const refId = `${v.id}:${sufixo}`;
  const ja = await prisma.creditTransaction.findFirst({ where: { operation: OPERACAO_DO_ESTORNO, refId }, select: { id: true } });
  if (ja) return 0;
  const { cobrado, devolvido } = await cobradoDoVideo(v.id);
  const pode = Math.min(quantia, cobrado - devolvido);
  if (pode <= 0) return 0;
  await creditar({ userId: v.userId, quantidade: pode, operation: OPERACAO_DO_ESTORNO, refId, note: nota.slice(0, 300) });
  return pode;
}

// ─────────────────────────────── o pedido ───────────────────────────────

export class ErroDoPedido extends Error {
  constructor(mensagem: string, readonly status = 400) {
    super(mensagem);
    this.name = "ErroDoPedido";
  }
}

/**
 * O gerador deste cadastro (03/10): o gêmeo treinado (HeyGen) só quando o
 * ambiente pede, a chave existe e o avatar do projeto está pronto; senão a
 * reserva (OmniHuman). A tela recebe o id pelo GET e mostra o preço dele.
 */
export function geradorDoCadastro(c: CadastroGuardado | null): IdDoGerador {
  return geradorPreferido() === "heygen" && c?.avatar?.gerador === "heygen" && c.avatar.estado === "pronto" && c.avatar.avatarId
    ? "heygen"
    : "omnihuman";
}

/**
 * Pede um vídeo do gêmeo: confere o cadastro, RESERVA os créditos e põe na
 * fila. Nada pago a fornecedor acontece aqui; quem fala e gera é o passo do
 * cron (`gemeo-passo.ts`), que roda a cada minuto e é cutucado logo depois.
 *
 * Cobra ANTES de gerar, pela regra do vídeo por IA: gerar primeiro deixaria
 * o custo na nossa conta se o cliente não tiver saldo.
 */
export async function pedirVideoDoGemeo(args: {
  projectId: string;
  userId: string;
  texto: string;
  titulo?: string | null;
  roteiroId?: string | null;
  /**
   * 03/10: as cenas com o cenário de cada uma (roteiro da linha editorial).
   * Sem cenas, o texto inteiro vai no `cenario` (padrão: de frente para a
   * câmera, como antes).
   */
  cenas?: CenaDoGemeo[] | null;
  cenario?: IdDoCenario | null;
}): Promise<VideoDoGemeo> {
  const cadastro = await lerCadastro(args.projectId);
  if (!gemeoAtivo(cadastro)) {
    throw new ErroDoPedido(`O seu gêmeo ainda não está pronto. Falta: ${oQueFalta(cadastro).join(", ")}.`, 409);
  }
  const ids = new Set<string>(CENARIOS.map((c) => c.id));
  const cenas: CenaDoGemeo[] = (args.cenas ?? [])
    .map((c) => ({ texto: limparTexto(String(c?.texto ?? "")), cenario: (ids.has(String(c?.cenario)) ? c.cenario : "camera") as IdDoCenario }))
    .filter((c) => c.texto);
  const texto = cenas.length ? limparTexto(cenas.map((c) => c.texto).join(" ")) : limparTexto(args.texto);
  const cenarioUnico: IdDoCenario = args.cenario && ids.has(args.cenario) ? args.cenario : "camera";
  // QUEM GERA (03/10): o gêmeo treinado quando ele está pronto para este
  // projeto; senão a reserva. O preço é o do gerador, e a tela faz a mesma
  // conta com o id que o GET manda.
  const gerador = geradorDoCadastro(cadastro);
  const preco = precoDoRoteiro(texto, gerador);
  if (preco.segundos < SEGUNDOS_MINIMOS_DO_ROTEIRO) throw new ErroDoPedido("O roteiro está curto demais para um vídeo.");
  if (preco.segundos > SEGUNDOS_MAXIMOS_DO_ROTEIRO) {
    throw new ErroDoPedido(
      `O roteiro tem cerca de ${duracaoFalada(preco.segundos)} de fala. O gêmeo fala até ${duracaoFalada(SEGUNDOS_MAXIMOS_DO_ROTEIRO)} por vídeo: divida em dois.`
    );
  }
  let roteiroId: string | null = null;
  let titulo = limparTexto(args.titulo ?? "").slice(0, 120);
  if (args.roteiroId) {
    const r = await prisma.roteiro.findFirst({ where: { id: args.roteiroId, projectId: args.projectId }, select: { id: true, titulo: true } });
    if (r) {
      roteiroId = r.id;
      titulo ||= r.titulo;
    }
  }
  titulo ||= texto.split(" ").slice(0, 8).join(" ");

  const id = `g${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  await debitar({
    userId: args.userId,
    quantidade: preco.creditosReservados,
    operation: OPERACAO_DO_GEMEO,
    projectId: args.projectId,
    refId: id,
    note: `Gêmeo digital: cerca de ${duracaoFalada(preco.segundos)} de fala (reserva; o que a fala real não usar volta)`,
  });

  const video: VideoDoGemeo = {
    id,
    estado: "na-fila",
    desde: agora(),
    criadoEm: agora(),
    userId: args.userId,
    titulo,
    texto,
    roteiroId,
    segundosEstimados: preco.segundos,
    creditosReservados: preco.creditosReservados,
    fotoUrl: cadastro!.foto!.url!,
    // 04/10: só a voz que a pessoa ouviu e aprovou (`gemeoAtivo` exige).
    voiceId: cadastro!.vozAprovada!.voiceId,
    gerador,
    avatarId: gerador === "heygen" ? cadastro!.avatar!.avatarId! : null,
    pedacos: (cenas.length ? pedacosDasCenas(cenas) : dividirEmPedacos(texto).map((t) => ({ texto: t, cenario: cenarioUnico }))).map((p) => ({
      ...p,
      tentativas: 0,
    })),
  };
  try {
    await mudarVideo(args.projectId, id, () => video);
  } catch (e) {
    await estornarVideo(video, preco.creditosReservados, "nao-criado", "O pedido do gêmeo não foi gravado; os créditos voltaram.");
    throw e;
  }
  return video;
}

/** Cancela um vídeo que ainda não começou (nada pago): devolve tudo. */
export async function cancelarVideoDoGemeo(projectId: string, id: string): Promise<boolean> {
  let cancelou = null as VideoDoGemeo | null;
  await mudarVideo(projectId, id, (v) => {
    if (!v || v.estado !== "na-fila" || v.pedacos.some((p) => p.audioUrl || p.requestId)) return undefined;
    cancelou = { ...v, estado: "cancelada", desde: agora(), motivo: "Cancelado por você antes de começar." };
    return cancelou;
  });
  if (!cancelou) return false;
  await estornarVideo(cancelou, cancelou.creditosReservados, "cancelado", "Vídeo do gêmeo cancelado antes de começar.");
  return true;
}

// ─────────────────────────────── a revogação ───────────────────────────────

/**
 * REVOGAR APAGA TUDO: fotos, foto recortada, amostra de voz, voz clonada na
 * ElevenLabs, a gravação da autorização e as falas dos vídeos. Os vídeos que
 * já entraram na esteira ficam: são do cliente, e ele os apaga como apaga
 * qualquer vídeo. Vídeo do gêmeo ainda em andamento é cancelado, com os
 * créditos de volta (o que já foi pago ao gerador fica por nossa conta).
 *
 * Fica um REGISTRO MÍNIMO, sem rosto e sem voz: quem autorizou, quando, e
 * quando revogou. É a prova de que a autorização existiu e foi respeitada.
 * Se a ElevenLabs não apagar a voz agora (chave sem permissão, rede), o id
 * fica nesse registro e o passo do cron tenta de novo até conseguir.
 */
export async function revogarGemeo(projectId: string, motivo: string): Promise<{ apagados: number; vozApagada: boolean }> {
  const cadastro = await lerCadastro(projectId);
  const videos = await listarVideos(projectId);
  const urls: unknown[] = [];

  for (const v of videos) {
    for (const p of v.pedacos ?? []) urls.push(p.audioUrl);
    if (videoEmAndamento(v)) {
      await mudarVideo(projectId, v.id, (atual) =>
        atual && videoEmAndamento(atual) ? { ...atual, estado: "cancelada", desde: agora(), motivo: "O gêmeo foi revogado." } : undefined
      );
      // O vídeo juntado mas ainda fora da esteira também sai.
      if (v.finalUrl && !v.videoJobId) urls.push(v.finalUrl);
      const { cobrado, devolvido } = await cobradoDoVideo(v.id);
      await estornarVideo(v, cobrado - devolvido, "revogado", "O gêmeo foi revogado; os créditos do vídeo em andamento voltaram.");
    }
  }

  const vozes = [
    ...new Set([
      ...(cadastro?.vozesParaApagar ?? []),
      ...(cadastro?.voz?.voiceId ? [cadastro.voz.voiceId] : []),
      ...(cadastro?.vozAprovada?.voiceId ? [cadastro.vozAprovada.voiceId] : []),
    ]),
  ];
  const pendentes: string[] = [];
  for (const voz of vozes) {
    try {
      await apagarVoz(voz);
    } catch (e) {
      console.error(`[gemeo][${projectId}] não apaguei a voz agora, fica para o passo:`, e instanceof Error ? e.message : e);
      pendentes.push(voz);
    }
  }

  // O gêmeo treinado na HeyGen (03/10) sai junto; o que não sair agora fica
  // no registro da revogação, como a voz, e o passo tenta de novo.
  const avatares = [...(cadastro?.avataresParaApagar ?? []), ...(cadastro?.avatar?.grupoId ? [cadastro.avatar.grupoId] : [])];
  const avataresPendentes: string[] = [];
  for (const grupo of avatares) {
    try {
      await apagarGemeoNaHeygen(grupo);
    } catch (e) {
      console.error(`[gemeo][${projectId}] não apaguei o gêmeo treinado agora, fica para o passo:`, e instanceof Error ? e.message : e);
      avataresPendentes.push(grupo);
    }
  }

  if (cadastro) {
    urls.push(
      ...cadastro.fotos.map((f) => f.url),
      cadastro.foto?.url,
      cadastro.voz?.amostraUrl,
      cadastro.voz?.mp3Url,
      cadastro.voz?.previaUrl,
      cadastro.vozAprovada?.amostraUrl,
      cadastro.vozAprovada?.previaUrl,
      cadastro.autorizacao?.videoUrl,
      cadastro.treino?.videoUrl,
      ...Object.values(cadastro.treino?.arquivos ?? {}),
      ...Object.values(cadastro.cenarios ?? {}).map((c) => c.url)
    );
  }
  // A VARREDURA DA PASTA (01/10): além do que o cadastro aponta, tudo o que
  // estiver em `gemeo/<projeto>/` sai, menos o vídeo final que já virou
  // VideoJob (esse é do cliente). Pega o que ficou órfão no caminho: recorte
  // de foto descartado, fala de pedaço refeito, envio que não foi registrado.
  try {
    const { list } = await import("@vercel/blob");
    const naEsteira = new Set(
      (await prisma.videoJob.findMany({ where: { projectId, blobUrl: { contains: `/gemeo/${projectId}/` } }, select: { blobUrl: true } })).map((v) => v.blobUrl)
    );
    let cursor: string | undefined;
    do {
      const pagina = await list({ prefix: `gemeo/${projectId}/`, cursor, token: process.env.BLOB_READ_WRITE_TOKEN });
      for (const b of pagina.blobs) if (!naEsteira.has(b.url)) urls.push(b.url);
      cursor = pagina.hasMore ? pagina.cursor : undefined;
    } while (cursor);
  } catch (e) {
    console.error(`[gemeo][${projectId}] varredura da pasta na revogação:`, e instanceof Error ? e.message : e);
  }
  const apagados = await apagarMidias(urls, `gemeo-revogacao/${projectId}`);

  await prisma.projectMemory.deleteMany({ where: { projectId, type: TIPO_CADASTRO } });
  // Os vídeos terminais saem da lista; o registro deles é o VideoJob e o extrato.
  await prisma.projectMemory.deleteMany({ where: { projectId, type: TIPO_VIDEO } });
  if (cadastro || pendentes.length || avataresPendentes.length) {
    await prisma.projectMemory.create({
      data: {
        projectId,
        type: TIPO_REVOGACAO,
        key: agora(),
        value: {
          nome: cadastro?.autorizacao?.nome ?? cadastro?.treino?.nome ?? null,
          autorizadaEm: cadastro?.autorizacao?.gravadaEm ?? cadastro?.treino?.gravadoEm ?? null,
          textoAutorizado: cadastro?.autorizacao?.texto ?? null,
          revogadaEm: agora(),
          motivo,
          vozesParaApagar: pendentes,
          avataresParaApagar: avataresPendentes,
        },
      },
    });
  }
  return { apagados, vozApagada: pendentes.length === 0 && avataresPendentes.length === 0 };
}
