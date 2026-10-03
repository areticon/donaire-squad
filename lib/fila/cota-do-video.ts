import { prisma } from "@/lib/db/prisma";
import { enviarEmail } from "@/lib/email";
import { marcarEsperaNaPeca } from "@/lib/media/marca-do-video";
import type { PedidoDeVideoDaFila } from "@/lib/media/video-por-ia";

/**
 * A COTA DO VEO PARA A CADEIA, e não a mata.
 *
 * Achado na campanha de prova de 60 s em 21/09, e ele só apareceu porque a
 * prova foi de verdade: as sete primeiras gerações saíram, e a oitava levou
 * `HTTP 429, You exceeded your current quota`. A fila tratou como falha comum,
 * gastou as três tentativas em sequência contra um limite que se mede em
 * minutos, e o vídeo saiu com 50 s em vez de 64.
 *
 * É a MESMA família do saldo zerado da parte 148: insistir contra uma
 * dependência que não melhora enquanto se insiste. A diferença é o alcance, e
 * ela decide o desenho:
 *
 *   • saldo zerado é da plataforma inteira e não volta sozinho, então pausa
 *     TUDO e avisa quem paga a conta;
 *   • cota de vídeo é de UM fornecedor, volta sozinha em minutos, e não
 *     impede o texto nem a arte de rodarem. Pausar a campanha inteira por
 *     causa dela seria punir sete dias de trabalho por causa de um clipe.
 *
 * Então aqui se pausa só o trabalho de vídeo, sem gastar a tentativa. Quem o
 * devolve para a fila é `retomarPausados`, que já existe e roda a cada dez
 * minutos: a cadeia retoma do passo que faltou, com o checkpoint intacto, e
 * não paga de novo pelo que já saiu.
 */

/** O limite de taxa do gerador, que não é falha da peça nem do cliente. */
export function ehCotaDeVideo(e: unknown): boolean {
  const texto = e instanceof Error ? e.message : String(e);
  if (texto.includes(MARCA_DO_TETO_DO_PLANO)) return true;
  if (!/veo|vídeo|video/i.test(texto)) return false;
  return /HTTP 429|RESOURCE_EXHAUSTED|exceeded your current quota|rate limit/i.test(texto);
}

/**
 * FALHA PASSAGEIRA DO VEO ESPERA, e não gasta tentativa (28/09).
 *
 * O Google responde "internal server issue, please try again in a few
 * minutes" quando o gerador engasga. É o mesmo caso da cota: insistir no mesmo
 * segundo não adianta, e a fila gastava as três tentativas em três segundos.
 * No dia 28 foi assim que o vídeo pedido pelo Bruno virou imagem no calendário.
 *
 * Diferente da cota, isto pode ser um defeito de verdade, e não pode esperar
 * para sempre. E dez minutos entre tentativas era muito (Bruno, 28/09: "10 min
 * é muito tempo"): o engasgo do Google costuma passar em um ou dois minutos.
 * Então a espera CRESCE: 1, 2, 3 e depois 5 minutos, oito vezes, cerca de meia
 * hora no total. Cada pausa guarda `proximaEm`, e `retomarPausados` devolve o
 * trabalho na hora dele (a fila roda a cada minuto), sem esperar o relógio de
 * dez minutos da cota. Depois da oitava a fila volta às tentativas normais, e a
 * última entrega a marca de falha na peça e o estorno.
 */
export const ESPERAS_PASSAGEIRAS_MIN = [1, 2, 3, 5, 5, 5, 5, 5];
export const MAX_PAUSAS_PASSAGEIRAS = ESPERAS_PASSAGEIRAS_MIN.length;

/** Quando é a próxima tentativa depois da pausa número `vez` (1 em diante). */
export function proximaTentativa(vez: number, agora = new Date()): Date {
  const minutos = ESPERAS_PASSAGEIRAS_MIN[Math.min(vez, MAX_PAUSAS_PASSAGEIRAS) - 1] ?? 5;
  return new Date(agora.getTime() + minutos * 60_000);
}

export function ehFalhaPassageiraDoVeo(e: unknown): boolean {
  const texto = e instanceof Error ? e.message : String(e);
  if (!/veo/i.test(texto)) return false;
  // "has been processed": o trecho anterior ainda está sendo processado pelo
  // Google (28/09). Espera um minuto e passa.
  return /internal server issue|try again in a few minutes|has (not )?been processed|HTTP 50[0234]|UNAVAILABLE|INTERNAL|DEADLINE_EXCEEDED|overloaded/i.test(texto);
}

/** Quantas vezes este trabalho já pausou por falha passageira. */
export async function pausasPassageiras(trabalhoId: string): Promise<number> {
  const t = await prisma.trabalho.findUnique({ where: { id: trabalhoId }, select: { error: true } });
  try {
    const l = JSON.parse(t?.error ?? "{}") as { passageiras?: number };
    return Number(l.passageiras ?? 0);
  } catch {
    return 0;
  }
}

/**
 * O TETO DO PLANO SEGURA A GERAÇÃO, e não só avisa.
 *
 * A janela da campanha já diz, antes da escolha, quando o vídeo não cabe no
 * dia do plano. Aviso não é guarda: quem entra pela rota, pela retomada da
 * fila ou por um pedido antigo passa por cima dele, e aí UM cliente consome a
 * cota do fornecedor, que é da plataforma inteira. Foi o que aconteceu em
 * 21/09, quando um vídeo de 60 s levou nove das dez gerações do dia.
 *
 * A conferência é do trabalho INTEIRO, e não de cada extensão: ou a cadeia
 * cabe hoje, ou espera o contador zerar. Pausar no meio deixaria a peça com um
 * vídeo pela metade, que é pior que esperar.
 *
 * A pausa usa o MESMO caminho da cota do fornecedor (`pausarPelaCota`), porque
 * para a fila é o mesmo fato: esperar o dia virar. O que muda é a frase.
 */
export const MARCA_DO_TETO_DO_PLANO = "[teto-de-video-do-plano]";

export async function tetoDoPlanoEstourado(
  userId: string,
  geracoes: number
): Promise<string | null> {
  // O import é aqui dentro de propósito: este módulo é lido pela fila, e a
  // leitura da cota toca o banco por um caminho que só interessa quando há
  // vídeo de verdade para conferir.
  const { cotaDeVideoDoCliente } = await import("@/lib/media/cota-do-dia-servidor");
  const cota = await cotaDeVideoDoCliente(userId);
  if (cota.semTeto) return null;
  if (geracoes <= cota.restam) return null;
  return `${MARCA_DO_TETO_DO_PLANO} O plano ${cota.plano ?? "atual"} gera ${cota.teto} trecho(s) de vídeo por dia e ${cota.usadas} já saíram hoje; este vídeo pede ${geracoes}.`;
}

/**
 * Põe o trabalho de vídeo para esperar a cota voltar, sem contar a tentativa.
 *
 * O formato do `error` é o mesmo ledger que `lib/fila/saldo-zerado.ts` lê para
 * decidir quando retomar: ele procura `em` dentro do JSON. Reaproveitar o
 * formato é o que faz a retomada de dez minutos valer para os dois casos sem
 * um segundo relógio, e dois relógios para a mesma fila é como eles divergem.
 */
export async function pausarPelaCota(trabalhoId: string, erro: unknown, opcoes: { passageiras?: number } = {}): Promise<void> {
  const proximaEm = opcoes.passageiras ? proximaTentativa(opcoes.passageiras) : null;
  const ledger = {
    // Conta as pausas por falha passageira, para ela não esperar para sempre,
    // e diz quando voltar: a retomada lê `proximaEm` em vez dos dez minutos.
    ...(opcoes.passageiras ? { passageiras: opcoes.passageiras, proximaEm: proximaEm!.toISOString() } : {}),
    saldoZerado: true as const,
    provedor: "Anthropic" as const,
    cotaDeVideo: true,
    em: new Date().toISOString(),
    // Sem aviso por e-mail: cota de minuto volta sozinha, e um e-mail por
    // cota seria ruído em cima de algo que se resolve esperando.
    avisadoEm: new Date().toISOString(),
    detalhe: (erro instanceof Error ? erro.message : String(erro)).slice(0, 300),
  };
  await prisma.trabalho.updateMany({
    where: { id: trabalhoId, status: "rodando" },
    data: { status: "pausado", error: JSON.stringify(ledger), startedAt: null, attempts: { decrement: 1 } },
  });
  console.warn(`[fila] trabalho de vídeo ${trabalhoId} esperando a cota do Veo voltar.`);

  /**
   * A PEÇA DIZ QUE ESTÁ ESPERANDO (21/09, noite).
   *
   * O Bruno abriu o card do dia 21 e perguntou "cadê o vídeo?". O trabalho
   * estava aqui, pausado, tentando de novo a cada dez minutos, e a peça
   * mostrava o quadro sem uma palavra: a marca de falha só era escrita quando
   * o trabalho morria de vez, e pausa por cota nunca morre. A espera é um
   * estado, e estado que a tela não mostra é o cliente reprovando às cegas.
   */
  const trabalho = await prisma.trabalho.findUnique({ where: { id: trabalhoId }, select: { payload: true } });
  // A extensão guarda o pedido do vídeo em `original`; a geração, na raiz.
  const bruto = (trabalho?.payload ?? null) as (PedidoDeVideoDaFila & { original?: PedidoDeVideoDaFila }) | null;
  const pedido = bruto?.original ?? bruto;
  if (pedido) {
    await marcarEsperaNaPeca(
      pedido,
      erro,
      proximaEm ? { proximaEm: proximaEm.toISOString(), tentativa: opcoes.passageiras!, de: MAX_PAUSAS_PASSAGEIRAS } : undefined
    ).catch(() => {});
  }
}

/**
 * COTA QUE NAO VOLTA EM UMA HORA NAO E COTA, E PLANO.
 *
 * A fila trata a cota do gerador como algo que volta sozinho em minutos, e por
 * isso nao avisa ninguem: e-mail por limite de minuto seria ruido em cima de
 * algo que se resolve esperando. Em 21/09 ela nao voltou em HORAS, e a peca
 * ficou o dia inteiro com o quadro no lugar do clipe enquanto o dono nao sabia
 * de nada. Plano e decisao do dono, e ele precisa saber sem abrir o banco.
 *
 * UM e-mail por pausa, e nao um por tentativa: o ledger guarda `avisadoEm`, e
 * enquanto a mesma pausa durar ninguem recebe de novo. Sem isso o aviso viraria
 * um e-mail a cada dez minutos, que e a forma mais rapida de ensinar o dono a
 * ignorar o aviso.
 */
const UMA_HORA_MS = 60 * 60 * 1000;

type LedgerDaCota = {
  cotaDeVideo?: boolean;
  em?: string;
  avisadoEm?: string | null;
  detalhe?: string;
};

function lerLedger(bruto: string | null): LedgerDaCota | null {
  if (!bruto) return null;
  try {
    const l = JSON.parse(bruto) as LedgerDaCota;
    return l?.cotaDeVideo ? l : null;
  } catch {
    return null;
  }
}

/**
 * Avisa os admins quando existe trabalho de video esperando cota ha mais de
 * uma hora. Devolve quantos e-mails sairam. Idempotente: roda junto da
 * retomada, a cada dez minutos, e so fala uma vez por pausa.
 */
export async function avisarCotaPresa(agora = new Date()): Promise<number> {
  const pausados = await prisma.trabalho.findMany({
    where: { status: "pausado", tipo: { startsWith: "video-ia" } },
    select: { id: true, error: true },
  });

  const presos = pausados
    .map((t) => ({ id: t.id, ledger: lerLedger(t.error) }))
    .filter((t): t is { id: string; ledger: LedgerDaCota } => t.ledger !== null)
    .filter((t) => {
      const desde = new Date(t.ledger.em ?? 0).getTime();
      return agora.getTime() - desde >= UMA_HORA_MS;
    });
  if (presos.length === 0) return 0;

  // Ja avisado NESTA pausa? O `avisadoEm` nasce igual ao `em` quando a pausa e
  // criada, entao o que marca "ja falei da hora" e ele ser MAIOR que `em`.
  const naoAvisados = presos.filter((t) => {
    const em = new Date(t.ledger.em ?? 0).getTime();
    const avisado = t.ledger.avisadoEm ? new Date(t.ledger.avisadoEm).getTime() : 0;
    return avisado <= em;
  });
  if (naoAvisados.length === 0) return 0;

  const admins = await prisma.user.findMany({ where: { role: "admin" }, select: { email: true } });
  const horas = Math.floor((agora.getTime() - new Date(naoAvisados[0].ledger.em ?? 0).getTime()) / UMA_HORA_MS);
  const detalhe = naoAvisados[0].ledger.detalhe ?? "sem detalhe";

  let enviados = 0;
  for (const a of admins) {
    if (!a.email) continue;
    await enviarEmail({
      para: a.email,
      assunto: `Demandou: ${naoAvisados.length} vídeo(s) parados na cota do gerador há ${horas}h`,
      texto: [
        `${naoAvisados.length} trabalho(s) de vídeo estão esperando a cota do gerador voltar há mais de ${horas} hora(s).`,
        "",
        "Cota que não volta em uma hora não é limite de minuto, é limite de PLANO, e plano é decisão sua.",
        "",
        "Onde olhar: aistudio.google.com/rate-limit (o selo ao lado do título diz Tier 1 ou Tier 2).",
        "",
        "Enquanto isso: as peças dizem ao cliente que o vídeo está esperando, e a fila tenta sozinha a cada dez minutos. Ninguém foi cobrado pelo que não saiu.",
        "",
        `O erro, por inteiro: ${detalhe}`,
      ].join("\n"),
    });
    enviados++;
  }

  // Marca a pausa como avisada, para nao repetir enquanto ela durar.
  for (const t of naoAvisados) {
    await prisma.trabalho.update({
      where: { id: t.id },
      data: { error: JSON.stringify({ ...t.ledger, avisadoEm: agora.toISOString() }) },
    });
  }
  console.warn(`[fila] aviso de cota presa enviado para ${enviados} admin(s).`);
  return enviados;
}
