/**
 * O QUE O SINO E A TELA DIVIDEM (02/10/2026).
 *
 * Módulo PURO: não toca banco nem lê segredo. O sino é componente de cliente
 * e importa daqui; o servidor importa as mesmas definições para nunca divergir
 * delas. Quem grava mora em `lib/notificacoes/index.ts`.
 */

/**
 * "gemeo" (03/10): o gêmeo digital pede a pessoa (a confirmação pela câmera
 * no gerador, e o lembrete antes do link vencer). "gemeo-aviso": o gêmeo
 * ficou pronto ou o gerador recusou o treino, sem ação obrigatória.
 */
// "cancelado" (05/10): o cliente cancelou um vídeo pela faixa; o registro fica no sino.
export const TIPOS_DE_NOTIFICACAO = ["roteiro", "pecas", "campanha", "completo", "falha", "estorno", "gemeo", "gemeo-aviso", "cancelado"] as const;
export type TipoDeNotificacao = (typeof TIPOS_DE_NOTIFICACAO)[number];

/**
 * Os tipos que PEDEM a ação da pessoa. O e-mail deles sai sempre, mesmo com
 * os avisos desligados em Configurações: sem ele o trabalho fica parado
 * esperando alguém que não sabe que é esperado.
 */
export const TIPOS_DE_APROVACAO: readonly TipoDeNotificacao[] = ["roteiro", "pecas", "campanha", "gemeo"];

/** Uma notificação do jeito que a rota entrega ao sino. */
export type NotificacaoNaTela = {
  id: string;
  tipo: TipoDeNotificacao | string;
  titulo: string;
  texto: string;
  link: string | null;
  codigo: string | null;
  lida: boolean;
  criadaEm: string;
};

/**
 * O CÓDIGO DE CADA ETAPA DO VÍDEO QUE PODE FALHAR, o que a pessoa informa ao
 * abrir um chamado (regra de 21/09: o cliente recebe código e caminho; o
 * detalhe técnico fica com a equipe). As chaves são as de `etapaDeRetomada`
 * (lib/media/video-state.ts), mais o completo e os efeitos.
 */
export const CODIGO_DA_ETAPA = {
  transcribe: "VID-TRA",
  select: "VID-SEL",
  roteiro: "VID-ROT",
  cortar: "VID-COR",
  write: "VID-TXT",
  completo: "VID-CMP",
  efeitos: "VID-EFX",
  // A semana escrita a partir do vídeo (08/10): o dia que falhou três vezes
  // para de ser tentado sozinho e vira chamado com este código.
  semana: "VID-SEM",
} as const;

/** O nome da etapa no texto do aviso ("A transcrição parou"). */
export const NOME_DA_ETAPA_NO_AVISO: Record<keyof typeof CODIGO_DA_ETAPA, string> = {
  transcribe: "A transcrição",
  select: "A escolha dos trechos",
  roteiro: "O roteiro",
  cortar: "O corte",
  write: "A redação dos posts",
  completo: "O vídeo completo",
  efeitos: "A montagem dos efeitos",
  semana: "A semana escrita a partir do vídeo",
};

/**
 * O CÓDIGO DA CAMPANHA QUE FALHOU (08/10). Até aqui só o vídeo tinha código: a
 * campanha do Igor de 07/10 fechou com zero peças e ninguém soube, nem o
 * cliente (só a faixa do Gestor, para quem abrisse) nem a equipe. O cliente
 * informa o código no chamado; o motivo técnico vai no e-mail da equipe.
 * Quem escolhe o código é `descreverFalhaDaCampanha` (lib/pipeline/falha-da-campanha.ts).
 */
export const CODIGO_DA_CAMPANHA = {
  /** Nenhum dia entregou peça. */
  semPeca: "CAM-SEM",
  /** Parte dos dias entregou, parte não. */
  parcial: "CAM-PAR",
  /** A campanha nem começou: sem squad, sem rede conectada ou sem dia para gerar. */
  configuracao: "CAM-CFG",
  /** Os dias passaram do tempo do servidor em todas as tentativas. */
  prazo: "CAM-PRA",
} as const;
export type CodigoDaCampanha = (typeof CODIGO_DA_CAMPANHA)[keyof typeof CODIGO_DA_CAMPANHA];

/** O evento de janela que pede ao sino para olhar de novo (a faixa do vídeo dispara quando o estado muda). */
export const EVENTO_DO_SINO = "demandou:notificacoes";

export function pedirLeituraDoSino(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENTO_DO_SINO));
}

/** "há 3 min", "há 2 h", "ontem": o tempo do jeito que se fala. */
export function haQuanto(iso: string, agora = Date.now()): string {
  const s = Math.max(0, Math.round((agora - new Date(iso).getTime()) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d} dias`;
}
