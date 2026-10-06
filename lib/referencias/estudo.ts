import { prisma } from "@/lib/db/prisma";
import { idsQueOEstudoLe } from "@/lib/referencias/limite";
import { coletarReferencia, dadosDoInstagram } from "@/lib/referencias/coletar";
import { ATORES } from "@/lib/referencias/apify";
import { Caixa, RETENCAO_DIAS, maxItensPorPerfil, redesLigadas } from "@/lib/referencias/config";
import { atualizarPadroes, etiquetarPosts } from "@/lib/referencias/padroes";
import type { CartaoDePadrao, PostDeReferencia, RedeDeReferencia } from "@/lib/referencias/tipos";
import { medirVideosDoProjeto } from "@/lib/referencias/medidas";
import { atualizarPadraoVisual } from "@/lib/referencias/padrao-visual";

/**
 * O ESTUDO DE REFERÊNCIAS DE UM PROJETO (01/10): coleta os perfis
 * confirmados, grava os posts no formato único, etiqueta, calcula o ganho e
 * reescreve os cartões de padrão.
 *
 * Roda num clique do dono ("Estudar agora"), nunca sozinho: a cobrança da
 * Apify é por item, e o trabalho semanal pela fila só deve entrar depois que
 * o Bruno decidir o pacote (pesquisa de 01/10, cenário enxuto de R$ 34 por
 * cliente por mês com 10 referências).
 */

/** Apaga o dado bruto de terceiro vencido (90 dias). Os cartões ficam. */
export async function limparReferenciasVelhas(): Promise<number> {
  const r = await prisma.referenciaPost.deleteMany({ where: { apagarEm: { lt: new Date() } } });
  return r.count;
}

export type ResultadoDoEstudo = {
  perfis: number;
  posts: number;
  custoUsd: number;
  etiquetados: number;
  padroes: CartaoDePadrao[];
  apagados: number;
  avisos: string[];
  /** Vídeos medidos nesta execução (01/10). */
  medidos?: number;
  padraoVisual?: Awaited<ReturnType<typeof atualizarPadraoVisual>> | null;
  /**
   * Perfis lidos com sucesso nesta execução e o motivo de cada um que ficou
   * de fora (01/10). `falhas` é texto para a TELA (sem fornecedor); `avisos`
   * é o detalhe nosso, para o log.
   */
  lidos?: number;
  falhas?: string[];
};

/** Etapas do estudo, para a tela mostrar "estudando 2 de 5" (lib/referencias/andamento.ts). */
export type PassoDoEstudo = { etapa: "coletando" | "etiquetando" | "medindo"; atual: number; total: number; perfil: string | null };

const NOME_DA_REDE: Record<RedeDeReferencia, string> = { instagram: "Instagram", tiktok: "TikTok", linkedin: "LinkedIn", youtube: "YouTube", x: "X" };

/** Como o perfil aparece na mensagem: "Instagram @anatex", "LinkedIn mlabs". */
export function rotuloDoPerfil(rede: RedeDeReferencia, perfil: string): string {
  const nome = rede === "linkedin" ? (perfil.match(/\/(?:company|school|showcase)\/([^/?#]+)/i)?.[1] ?? perfil) : perfil.startsWith("@") || perfil.startsWith("UC") ? perfil : `@${perfil}`;
  return `${NOME_DA_REDE[rede] ?? rede} ${nome}`;
}

/**
 * O motivo da coleta que não deu certo, para a TELA DO CLIENTE (01/10).
 *
 * Regra de 21/09 (lib/media/falha-do-video.ts): o cliente nunca lê o nome do
 * fornecedor nem que a nossa conta está sem saldo. Ele recebe o que aconteceu
 * com o perfil, se adianta tentar de novo e um CÓDIGO para o chamado. O erro
 * cru (resposta da Apify, "fetch failed") fica em referencias_coletas.erro e
 * no log da função, que é onde o Bruno diagnostica.
 *
 *   REF-402  saldo ou limite do mês do serviço de leitura acabou
 *   REF-401  a chave do serviço foi recusada
 *   REF-CFG  a leitura da rede está desligada (sem chave configurada)
 *   REF-TMP  a leitura passou do prazo e foi abortada
 *   REF-NET  não alcançou o serviço (rede fora ou lenta)
 *   REF-500  o serviço falhou por conta própria
 */
export function motivoDaColeta(rede: RedeDeReferencia, status: string, erroCru?: string): string | null {
  if (status === "ok") return null;
  if (status === "vazio") {
    return rede === "linkedin"
      ? "a página não mostrou nenhum post público (confira se o link é da página de empresa certa)"
      : "a coleta voltou vazia (perfil privado ou fora do ar?)";
  }
  if (status === "sem_orcamento") return "não lido nesta vez: o limite de leitura deste estudo acabou antes dele; ele entra no próximo";
  const e = erroCru ?? "";
  if (/só página de empresa/i.test(e)) return "no LinkedIn só dá para estudar página de empresa (o link com /company/)";
  if (/canal não encontrado/i.test(e)) return "não achei o canal no YouTube agora (confira o @ do canal) ou o YouTube não respondeu; tente de novo mais tarde";
  if (/perfil não encontrado/i.test(e)) return "não achei esse perfil no X (confira o @)";
  if (/_TOKEN ausente/i.test(e)) return "a leitura desta rede está desligada no momento (código REF-CFG)";
  if (/\b402\b|usage|limit|credit|not-enough|exceed|insufficient/i.test(e)) return "a leitura de perfis está indisponível no momento (código REF-402); já estamos tratando, e tentar de novo agora não muda o resultado";
  if (/\b40[13]\b|token|unauthori[sz]ed|forbidden/i.test(e)) return "a leitura de perfis está indisponível no momento (código REF-401); já estamos tratando";
  if (/prazo esgotado/i.test(e)) return "a leitura deste perfil demorou demais e foi interrompida para não gastar à toa (código REF-TMP); tente de novo mais tarde";
  if (/fetch failed|ENOTFOUND|ECONN|EAI_AGAIN|socket|network|timeout|aborted/i.test(e)) return "não consegui alcançar o serviço de leitura agora, a rede caiu ou ficou lenta (código REF-NET); tente de novo em instantes";
  return "a leitura deste perfil falhou do lado do serviço de leitura (código REF-500); tente de novo mais tarde";
}

/**
 * Até quando ainda começa a ler um perfil (7 min): a leitura mais lenta leva
 * uns 5 min, e a função morre aos 800 s. Perfil que sobra fica para o próximo
 * clique, com aviso, em vez de a plataforma matar o estudo no meio.
 */
const ULTIMO_PERFIL_MS = 420_000;
/** Até quando ainda começa a medir um vídeo (9 min): cada medida leva até 4 min. */
const ULTIMA_MEDIDA_MS = 540_000;

/**
 * Grava os posts de uma coleta no formato único (upsert por perfil e id
 * externo). Usado pelo estudo das referências e pelo estudo do perfil do
 * próprio cliente (03/10, lib/referencias/perfil-proprio.ts). Devolve quantos.
 */
export async function gravarPostsDaColeta(
  projectId: string,
  perfilId: string,
  rede: RedeDeReferencia,
  lista: PostDeReferencia[],
  midias?: Map<string, string>
): Promise<number> {
  const apagarEm = new Date(Date.now() + RETENCAO_DIAS * 24 * 3600_000);
  let n = 0;
  for (const post of lista) {
    const dados = {
      url: post.url,
      formato: post.formato,
      legenda: post.legenda,
      duracaoSeg: post.duracaoSeg,
      publicadoEm: post.publicadoEm ? new Date(post.publicadoEm) : null,
      curtidas: post.curtidas,
      comentarios: post.comentarios,
      visualizacoes: post.visualizacoes,
      compartilhamentos: post.compartilhamentos,
      seguidoresDoAutor: post.seguidoresDoAutor !== null ? Math.round(post.seguidoresDoAutor) : null,
      // Áudio, hashtags, salvamentos e capa (02/10, lib/referencias/extras-da-coleta.ts).
      ...(post.extras ? { extras: post.extras as never } : {}),
    };
    await prisma.referenciaPost.upsert({
      where: { perfilId_externoId: { perfilId, externoId: post.externoId } },
      // Os números mudam a cada leitura; a etiqueta e o prazo de apagar, não.
      update: dados,
      create: { ...dados, perfilId, projectId, rede, externoId: post.externoId, apagarEm },
    });
    if (post.midiaUrl && midias) midias.set(`${perfilId}:${post.externoId}`, post.midiaUrl);
    n++;
  }
  return n;
}

export async function estudarReferencias(
  projectId: string,
  opcoes?: {
    maxItens?: number;
    caixa?: Caixa;
    medir?: boolean;
    limiteDeMedidas?: number;
    aoAvancar?: (passo: PassoDoEstudo) => Promise<void> | void;
    /**
     * Só os perfis sem coleta desde esta data (03/10): a jornada de entrada
     * troca as referências e estuda só as novas, sem pagar de novo as que
     * acabaram de ser lidas.
     */
    soSemColetaDesde?: Date;
  }
): Promise<ResultadoDoEstudo> {
  const inicioDoEstudo = Date.now();
  const ligadas = redesLigadas();
  const avisos: string[] = [];
  const apagados = await limparReferenciasVelhas();
  const projeto = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { niche: true, targetAudience: true } });
  // Só as que cabem no plano (06/10): as mais recentes, até o limite. Projeto
  // de antes da regra guarda as outras, mas o estudo não paga para lê-las.
  const noLimite = await idsQueOEstudoLe(projectId);
  const perfis = await prisma.referenciaPerfil.findMany({
    where: {
      projectId,
      status: "confirmado",
      id: { in: noLimite },
      ...(opcoes?.soSemColetaDesde ? { OR: [{ ultimaColeta: null }, { ultimaColeta: { lt: opcoes.soSemColetaDesde } }] } : {}),
    },
    orderBy: { updatedAt: "asc" },
  });
  const caixa = opcoes?.caixa ?? new Caixa();
  const maxItens = opcoes?.maxItens ?? maxItensPorPerfil();
  let posts = 0;
  // O arquivo de cada vídeo desta coleta, só em memória, para a medida (01/10).
  const midias = new Map<string, string>();

  let lidos = 0;
  const falhas: string[] = [];
  for (const [i, p] of perfis.entries()) {
    const rede = p.rede as RedeDeReferencia;
    if (!ligadas.includes(rede)) {
      avisos.push(`${rede} desligada (REFERENCIAS_REDES)`);
      continue;
    }
    if (Date.now() - inicioDoEstudo > ULTIMO_PERFIL_MS) {
      falhas.push(`o tempo deste estudo acabou antes de ${perfis.length - i} perfil(is); clique em Estudar agora de novo para ler o resto`);
      break;
    }
    await opcoes?.aoAvancar?.({ etapa: "coletando", atual: i + 1, total: perfis.length, perfil: rotuloDoPerfil(rede, p.perfil) });
    const r = await coletarReferencia(rede, p.perfil, { maxItens, caixa });
    await prisma.referenciaColeta.create({
      data: { projectId, perfilId: p.id, rede, fonte: r.fonte, itens: r.posts.length, custoUsd: r.custoUsd, status: r.status, erro: r.erro?.slice(0, 300) },
    });
    const motivo = motivoDaColeta(rede, r.status, r.erro);
    if (motivo) falhas.push(`${rotuloDoPerfil(rede, p.perfil)}: ${motivo}`);
    else lidos++;
    if (r.status === "sem_orcamento") {
      // O detalhe (teto em dólar) é nosso; a tela já recebeu o motivo em `falhas`.
      avisos.push(`teto de gasto da execução (US$ ${caixa.teto.toFixed(2)}) atingido antes de ${rede}/${p.perfil}`);
      if (i + 1 < perfis.length) falhas.push(`mais ${perfis.length - i - 1} perfil(is) ficaram para o próximo estudo`);
      break;
    }
    // Coleta que volta vazia ou com erro não apaga o que já existe nem grava
    // zero: "não lido" não é "ninguém viu" (lição de 28/09).
    await prisma.referenciaPerfil.update({
      where: { id: p.id },
      data: {
        ultimoErro: motivo ? motivo.slice(0, 300) : null,
        ...(r.status === "ok" ? { ultimaColeta: new Date() } : {}),
        ...(r.posts[0]?.seguidoresDoAutor ? { seguidores: Math.round(r.posts[0].seguidoresDoAutor) } : {}),
      },
    });
    posts += await gravarPostsDaColeta(projectId, p.id, rede, r.posts, midias);
  }

  // OS SEGUIDORES DO INSTAGRAM (03/10): o ator de posts não traz, e o de-para
  // da jornada de entrada precisa da taxa de engajamento para comparar uma
  // conta pequena com uma grande. Uma execução para todos, só quem ainda não tem.
  const semSeguidores = perfis.filter((p) => p.rede === "instagram" && !p.seguidores && ligadas.includes("instagram"));
  if (semSeguidores.length) {
    const d = await dadosDoInstagram(semSeguidores.map((p) => p.perfil), caixa);
    if (d.custoUsd > 0 || d.erro) {
      await prisma.referenciaColeta.create({
        data: { projectId, rede: "instagram", fonte: `apify:${ATORES.instagramPerfil}`, itens: d.dados.length, custoUsd: d.custoUsd, status: d.dados.length ? "ok" : d.erro === "sem_orcamento" ? "sem_orcamento" : "erro", erro: d.erro?.slice(0, 300) },
      });
    }
    for (const x of d.dados) {
      const alvo = semSeguidores.find((p) => p.perfil === x.perfil);
      if (alvo && x.seguidores) await prisma.referenciaPerfil.update({ where: { id: alvo.id }, data: { seguidores: Math.round(x.seguidores), ...(x.nome ? { nome: x.nome } : {}) } });
    }
  }

  await opcoes?.aoAvancar?.({ etapa: "etiquetando", atual: perfis.length, total: perfis.length, perfil: null });
  const etiquetados = await etiquetarPosts(projectId);
  const padroes = await atualizarPadroes(projectId, { nicho: projeto.niche ?? "", publico: projeto.targetAudience ?? "" });

  // A MEDIDA DOS VÍDEOS (01/10): Instagram e YouTube, baixar, medir e apagar
  // no worker; aqui só os números. Depois o padrão visual e de ritmo do nicho
  // (cartões "ritmo:nicho" e "visual:imagem"), que a edição e a arte leem.
  // Nunca derruba o estudo: sem worker, os cartões de texto continuam.
  let medidos = 0;
  let custoDaMedida = 0;
  let padraoVisual: Awaited<ReturnType<typeof atualizarPadraoVisual>> | null = null;
  if (opcoes?.medir !== false) {
    try {
      await opcoes?.aoAvancar?.({ etapa: "medindo", atual: perfis.length, total: perfis.length, perfil: null });
      // O prazo é para COMEÇAR a última medida (até 9 min do início): ela leva
      // até 4 min, e a função morre aos 800 s. Antes era "pelo menos 60 s", que
      // deixava uma medida começar aos 11 min e a plataforma matar o estudo.
      const m = await medirVideosDoProjeto(projectId, { midias, limite: opcoes?.limiteDeMedidas ?? 40, prazoMs: Math.max(0, ULTIMA_MEDIDA_MS - (Date.now() - inicioDoEstudo)) });
      medidos = m.medidos;
      custoDaMedida = m.custoUsd;
      avisos.push(...m.avisos);
      padraoVisual = await atualizarPadraoVisual(projectId);
    } catch (e) {
      avisos.push(`medida dos vídeos: ${e instanceof Error ? e.message.slice(0, 120) : "falhou"}`);
    }
  }
  return {
    perfis: perfis.length,
    posts,
    custoUsd: Math.round((caixa.gasto + custoDaMedida) * 10000) / 10000,
    etiquetados,
    padroes,
    apagados,
    avisos: [...new Set(avisos)],
    medidos,
    padraoVisual,
    lidos,
    falhas,
  };
}

/** Quanto o projeto gastou em coletas no mês corrente (Apify e X). */
export async function gastoDoMes(projectId: string): Promise<number> {
  const inicio = new Date();
  inicio.setDate(1);
  inicio.setHours(0, 0, 0, 0);
  const r = await prisma.referenciaColeta.aggregate({ where: { projectId, createdAt: { gte: inicio } }, _sum: { custoUsd: true } });
  return Number(r._sum.custoUsd ?? 0);
}
