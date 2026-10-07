/**
 * O estado da MONTAGEM (editor completo) de um corte, do jeito que a tela lê.
 *
 * Módulo puro, sem banco: quem lê são o painel dos cortes e o card do Vitor no
 * quadro, que são componentes de cliente. O trabalho mora em
 * `lib/media/montagem-nos-cortes.ts`.
 */

export type EstadoDaMontagem =
  /** O corte chegou e espera o passo da fila. */
  | "na-fila"
  /** O diretor (Claude) está escrevendo o plano e as imagens estão sendo geradas. */
  | "dirigindo"
  /** Plano e imagens prontos; esperando as cenas em movimento da Higgsfield. */
  | "gerando"
  /** Pedido no worker; o Remotion está renderizando. */
  | "montando"
  /** O corte na tela já é a versão montada. */
  | "pronto"
  /** Seguiu sem montagem, com o motivo gravado (o corte original vale). */
  | "sem-montagem";

/** O que fica em `clips[i].montagem` e espelhado no card do Vitor como `montagem`. */
export type MontagemDoCorte = {
  estado: EstadoDaMontagem;
  /** Quando o estado atual começou: é o que separa trabalho vivo de morto. */
  desde: string;
  /** Hash curto do vertical de origem: muda se o corte for refeito. */
  origem?: string;
  /** O plano do diretor (PlanoDeMontagem) e os assets gerados, para a refação. */
  plano?: unknown;
  assets?: unknown;
  papelUrl?: string | null;
  /** Custo de IA estimado desta montagem (diretor, imagens, cenas). */
  custoUsd?: number;
  /** Chave do vídeo montado no Blob e a URL que voltou do worker. */
  chave?: string;
  montadoUrl?: string;
  tentativas?: number;
  /** Quantas vezes o diretor falhou neste corte (uma nova chance automática). */
  tentativasDoDiretor?: number;
  /** Não tentar de novo antes disto (ISO): dá tempo de o worker esvaziar. */
  esperarAte?: string | null;
  /** Tempos do worker (s): preparo, recorte, render. */
  tempos?: Record<string, number>;
  motivo?: string | null;
  /**
   * A montagem DESISTIU por erro técnico (render, worker, prazo), depois das
   * novas tentativas automáticas (01/10, parte 240). Separa o "falhou, dá para
   * tentar de novo" do "não se aplica" (ex.: vídeo sem plano). É o que liga o
   * aviso claro e o botão "Tentar a montagem de novo" na tela.
   */
  falhaTecnica?: boolean;
  /**
   * Pedir de novo não resolve esta falha (08/10, o completo aprovado sem o
   * plano da jornada): sem o botão, e com a frase própria em `detalheDoCliente`.
   */
  semNovaTentativa?: boolean;
  detalheDoCliente?: string | null;
  /** Quando os admins foram avisados por e-mail desta desistência (uma vez). */
  avisadoEm?: string | null;
  /** A conferência das imagens contra o perfil do projeto (02/10). */
  assetsConferidos?: { em: string; reprovados: Array<{ id: string; motivo: string }>; erro?: string } | null;
  /**
   * A revisão visual do corte pronto (02/10, lib/media/revisao-visual.ts).
   * Tipo aberto aqui: este módulo é lido pela tela e não importa o servidor.
   */
  revisaoVisual?: {
    rodadas: number;
    pendente: boolean;
    historico: Array<{ em: string; rodada: number; quadros: number; defeitos: unknown[]; consertadas: number[]; momentosTirados: number[]; erro?: string | null }>;
    segura?: boolean;
    final?: boolean;
    motivo?: string | null;
  } | null;
  /** O render que espera a revisão visual (ainda não trocou o vertical do cliente). */
  candidato?: { url: string; bytes: number; tempos?: Record<string, number> } | null;
  /** Uma passada do cron está revisando este corte. */
  trabalhando?: boolean;
  /** O plano com as inserções, guardado quando a versão segura foi ao ar (o "pedir de novo" volta a ele). */
  planoAntesDaSegura?: unknown;
  /**
   * O EDITOR SOB MEDIDA no corte (03/10, lib/media/montagem-nos-cortes.ts):
   * usa os estados de sempre ("dirigindo" enquanto o editor escreve,
   * "montando" na prévia, na revisão e no final). `desistiu`: o caminho novo
   * falhou e o corte voltou à montagem de sempre (a reserva). Tipo aberto
   * aqui: este módulo é lido pela tela.
   */
  sobMedida?: { fase: "editar" | "previa" | "revisar" | "final"; desistiu?: string | null; rodada?: number; [k: string]: unknown } | null;
};

/** O que a tela diz quando a montagem de efeitos desistiu por erro técnico. */
export const ROTULO_DA_FALHA = "A montagem de efeitos falhou; o vídeo abaixo tem só a edição de fala";
/** A versão segura (02/10): a revisão visual não conseguiu consertar a montagem e entregou a fala editada, sem inserções. */
export const ROTULO_DA_SEGURA = "A montagem de efeitos não passou na nossa revisão; entregamos a versão limpa, sem inserções";
export const DETALHE_DA_SEGURA =
  "Conferimos o vídeo pronto quadro a quadro e tentamos consertar duas vezes. Para não publicar nada com defeito, foi ao ar a sua fala editada, com legenda e zoom. Você pode pedir a montagem de novo sem pagar nada.";
export const DETALHE_DA_FALHA =
  "Tentamos três vezes sozinhos, a última com menos carga, e não deu. Você pode pedir de novo sem pagar nada; a equipe já foi avisada.";

const TRABALHANDO: EstadoDaMontagem[] = ["na-fila", "dirigindo", "gerando", "montando"];
/** Nenhum estado de trabalho vive mais que isto na tela (o passo desiste antes). */
const PRAZO_NA_TELA_MS = 60 * 60_000;

export function lerMontagem(
  bruto: unknown
): { estado: EstadoDaMontagem; trabalhando: boolean; rotulo: string; detalhe: string | null; podeTentarDeNovo?: boolean } | null {
  if (!bruto || typeof bruto !== "object") return null;
  const m = bruto as MontagemDoCorte;
  if (!m.estado) return null;
  const idade = Date.now() - new Date(m.desde ?? 0).getTime();
  // Estado que sobrevive ao fato vira mentira na tela: trabalho parado além
  // do prazo não é mostrado como "montando".
  const trabalhando = TRABALHANDO.includes(m.estado) && idade < PRAZO_NA_TELA_MS;
  if (trabalhando) {
    const detalhe =
      m.estado === "na-fila"
        ? "Na fila da edição."
        : m.estado === "dirigindo"
          ? "O diretor está escrevendo o plano cena a cena e a Diana gera as colagens."
          : m.estado === "gerando"
            ? "Esperando as cenas em movimento."
            : "Renderizando o vídeo com as cenas, os recortes e a legenda.";
    return { estado: m.estado, trabalhando, rotulo: "Vitor e Diana montando a edição", detalhe };
  }
  if (m.estado === "pronto") return { estado: m.estado, trabalhando: false, rotulo: "Edição completa pronta", detalhe: null };
  // NUNCA "FINALIZADO" SEM EDIÇÃO EM SILÊNCIO (01/10, parte 240): o Bruno leu
  // "edição finalizada" num completo que tinha voltado sem efeitos porque o
  // render quebrou. Falha técnica é dita com todas as letras, com a saída.
  if (m.falhaTecnica) {
    // A falha sem nova tentativa diz o que houve de verdade (08/10): a frase
    // padrão fala em "três tentativas" e oferece o botão, e nenhum dos dois
    // vale para ela.
    if (m.semNovaTentativa) return { estado: m.estado, trabalhando: false, rotulo: ROTULO_DA_FALHA, detalhe: m.detalheDoCliente ?? m.motivo ?? DETALHE_DA_FALHA, podeTentarDeNovo: false };
    return { estado: m.estado, trabalhando: false, rotulo: ROTULO_DA_FALHA, detalhe: DETALHE_DA_FALHA, podeTentarDeNovo: true };
  }
  // Estado parado além do prazo também é falha, e não "montando" para sempre.
  if (TRABALHANDO.includes(m.estado)) {
    return { estado: "sem-montagem", trabalhando: false, rotulo: ROTULO_DA_FALHA, detalhe: "A montagem parou no meio e não voltou. Você pode pedir de novo sem pagar nada.", podeTentarDeNovo: true };
  }
  return { estado: m.estado, trabalhando: false, rotulo: "Corte sem a edição completa", detalhe: m.motivo ?? null };
}
