import { geracoesDoVideo } from "@/lib/credits/video-tabela";
import { PLANOS_PUBLICOS, type PlanoId } from "@/lib/planos";

/**
 * QUANTOS VIDEOS AINDA CABEM HOJE, e por que isso e assunto da tela.
 *
 * Medido no console do Google em 21/09, no projeto do Bruno: o limite de video
 * do Gemini e **por dia e por modelo**, e no Tier 1 sao 10 geracoes (o Tier 2
 * sobe para 50). Como um clipe de 8 s e uma geracao e um video de 60 s sao
 * nove, o Tier 1 entrega dez clipes curtos OU UM video longo por dia, e esse
 * teto e da PLATAFORMA INTEIRA, nao de cada cliente.
 *
 * Ate aqui o produto descobria isso batendo: o cliente escolhia 60 s, a fila
 * pedia a nona geracao, o Google recusava com 429 e a peca ficava com o quadro
 * no lugar do clipe. O Bruno passou o dia assim, e a frase dele resume o
 * defeito: "o usuario fica sem opcao e sem saber o que esta acontecendo".
 *
 * **Cota nao e credito.** O cliente pode ter comprado creditos de video agora
 * e ainda assim nao caber, porque o limite e de uso por dia do fornecedor. Sao
 * duas contas diferentes, e a tela precisa dizer as duas.
 *
 * A contagem sai de `ai_usage`, que ja registra cada geracao do Veo com o
 * modelo e a hora: e a mesma fonte que o console mostra, sem tabela nova.
 *
 * ESTE ARQUIVO NAO TOCA NO BANCO, e isso e regra e nao estilo: a janela da
 * campanha e componente CLIENTE, e importar daqui qualquer coisa que puxe o
 * Prisma arrasta `pg`, que arrasta `dns` e `fs`, e a tela inteira quebra com
 * 500. Aconteceu em 21/09, na primeira versao desta cota, e e a mesma licao
 * que tirou a tabela de preco de `lib/stripe` em 21/09 de manha. Quem le o
 * banco e `lib/media/cota-do-dia-servidor.ts`.
 */

/**
 * O teto diario do tier em que a conta esta.
 *
 * Vem do ambiente porque ele MUDA sem deploy: o Tier 2 entra sozinho quando a
 * conta atinge o gasto, e nesse dia o numero aqui precisa acompanhar sem
 * esperar por mim. Sem a variavel, o padrao e o Tier 1, que e o pessimista
 * certo: prometer 50 e entregar 10 e pior do que o contrario.
 */
export function tetoDeVideosPorDia(): number {
  const n = Number(process.env.VIDEO_GERACOES_POR_DIA ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

/** O fuso do limite: o Google zera a contagem a meia-noite do Pacifico. */
const FUSO_DA_COTA = "America/Los_Angeles";

/**
 * O inicio do dia de cota, em UTC.
 *
 * Nao e a meia-noite do Brasil: quem zera o contador e o Google, e ele conta
 * pelo Pacifico. Usar o dia local daqui faria a tela dizer "restam 10" as 21h,
 * quando o contador do fornecedor so vira as 4h da manha.
 */
export function inicioDoDiaDeCota(agora = new Date()): Date {
  const laIso = agora.toLocaleString("en-CA", { timeZone: FUSO_DA_COTA, hour12: false });
  const [data] = laIso.split(", ");
  // A meia-noite daquele dia no Pacifico, convertida de volta para UTC.
  const meiaNoiteLocal = new Date(`${data}T00:00:00`);
  const deslocamento = agora.getTime() - new Date(agora.toLocaleString("en-US", { timeZone: FUSO_DA_COTA })).getTime();
  return new Date(meiaNoiteLocal.getTime() + deslocamento);
}

export interface CotaDeVideo {
  /** Quantas geracoes o fornecedor aceita por dia neste tier. */
  teto: number;
  /** Quantas ja foram feitas no dia de cota corrente. */
  usadas: number;
  /** Quantas ainda cabem. Nunca negativo. */
  restam: number;
  /** Quando o contador zera, em ISO. */
  zeraEm: string;
}

/**
 * A COTA DO CLIENTE, que e outra conta e tem outro dono.
 *
 * A cota acima e do FORNECEDOR e vale para a plataforma inteira. Esta e do
 * PLANO, e existe porque sem ela um cliente pedindo 60 s (nove geracoes)
 * consome o dia de todos os outros, que foi o que aconteceu em 21/09. O teto
 * do dia e sempre o MENOR dos dois.
 */
export interface CotaDoCliente {
  /** Quantas geracoes por dia o plano desta pessoa permite. */
  teto: number;
  usadas: number;
  restam: number;
  /** O nome do plano, para a frase. Null em acesso interno ou sem plano. */
  plano: string | null;
  /** Acesso interno nao tem teto de plano. */
  semTeto: boolean;
}

/** Quantas geracoes por dia o plano permite. Null quando nao ha plano na tabela. */
export function videosPorDiaDoPlano(plano: string | null | undefined): number | null {
  if (!plano || plano === "free") return null;
  return PLANOS_PUBLICOS.find((p) => p.id === plano)?.videosPorDia ?? null;
}

/** O primeiro plano acima do atual que aguenta a duracao pedida. */
export function planoQueAguenta(
  atual: string | null | undefined,
  precisa: number
): { id: PlanoId; nome: string; videosPorDia: number } | null {
  const i = PLANOS_PUBLICOS.findIndex((p) => p.id === atual);
  const achado = PLANOS_PUBLICOS.slice(i + 1).find((p) => p.videosPorDia >= precisa);
  return achado ? { id: achado.id, nome: achado.nome, videosPorDia: achado.videosPorDia } : null;
}

/**
 * O que dizer ao cliente sobre a duracao que ele escolheu.
 *
 * Devolve `null` quando cabe: aviso que aparece sempre vira paisagem, e o
 * cliente para de ler justamente no dia em que ele importa.
 *
 * A ORDEM IMPORTA. O teto do PLANO e falado primeiro, porque tem saida na mao
 * do cliente (subir de plano ou encurtar o video); o teto do FORNECEDOR e
 * espera, e espera sem saida so se anuncia quando nao ha alternativa. Dizer as
 * duas coisas juntas seria transformar um pedido de upgrade em desculpa.
 */
export function avisoDaCota(
  cota: CotaDeVideo,
  segundos: number,
  doCliente?: CotaDoCliente | null
): string | null {
  const precisa = geracoesDoVideo(segundos);

  if (doCliente && !doCliente.semTeto && precisa > doCliente.restam) {
    const sobe = planoQueAguenta(
      PLANOS_PUBLICOS.find((p) => p.nome === doCliente.plano)?.id ?? null,
      precisa
    );
    const base =
      doCliente.usadas > 0
        ? `O ${doCliente.plano ?? "seu plano"} gera até ${doCliente.teto} trecho(s) de vídeo por dia, e você já usou ${doCliente.usadas} hoje.`
        : `O ${doCliente.plano ?? "seu plano"} gera até ${doCliente.teto} trecho(s) de vídeo por dia, e este vídeo de ${segundos}s precisa de ${precisa}.`;
    const saida = sobe
      ? ` O ${sobe.nome} sobe para ${sobe.videosPorDia} por dia, o que dá vídeo de até ${duracaoDe(sobe.videosPorDia)}.`
      : " Escolha uma duração menor para hoje.";
    return base + saida;
  }

  if (precisa <= cota.restam) return null;

  const quando = new Date(cota.zeraEm).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (cota.restam === 0) {
    return `O gerador de vídeo já entregou tudo o que entrega hoje (${cota.teto} clipes). O contador zera às ${quando}: gere a campanha agora e o vídeo sai amanhã cedo, ou escolha um dia sem vídeo.`;
  }
  return `Este vídeo de ${segundos}s precisa de ${precisa} gerações e hoje ainda cabem ${cota.restam}. Escolha uma duração menor, ou gere assim mesmo: o texto e a arte saem hoje e o vídeo entra na fila para quando o contador zerar, às ${quando}.`;
}

/** A duracao que N geracoes entregam, em palavra de cliente. */
function duracaoDe(geracoes: number): string {
  if (geracoes >= 9) return "60s";
  if (geracoes >= 4) return "30s";
  if (geracoes >= 2) return "15s";
  return "8s";
}
