import { CODIGO_DA_CAMPANHA, type CodigoDaCampanha } from "@/lib/notificacoes/tipos";

/**
 * A CAMPANHA QUE FALHOU, EM PALAVRAS (08/10/2026).
 *
 * O caso que criou isto: a campanha do Igor de 07/10 ("Lance embutido na
 * moto...") fechou com zero peças, os cinco dias falhados em 0,1 s cada, e
 * ninguém foi avisado. O observador do cron só olhava campanha concluída; o
 * motivo existia no log da execução e em `trabalhos.error`, e só quem abrisse
 * o Gestor via a faixa "A geração parou (timeout, troca de aba ou erro)".
 *
 * Aqui mora só a DECISÃO (puro, sem banco): qual código, o que o cliente lê e
 * o que a equipe lê. Quem grava e manda é `avisarFalhaDaCampanha`
 * (lib/notificacoes/avisos.ts), chamada no fecho da campanha e conferida
 * pelo observador do cron.
 *
 * A divisão de sempre (regra de 21/09): o cliente recebe o que mudou para ele
 * e um código, sem nome de fornecedor nem termo técnico; o motivo técnico vai
 * no e-mail da equipe.
 */

/** Um trabalho da fila que terminou em "falhou". */
export type TrabalhoQueFalhou = {
  tipo: string;
  /** O dia da semana do payload (1 a 7), quando é um dia. */
  dia?: number | null;
  attempts: number;
  error: string | null;
};

export type FatosDaCampanha = {
  /** "failed" ou "completed": o que o fecho gravou. */
  status: string;
  totalPosts: number;
  diasQueFalharam: number;
  trabalhosQueFalharam: TrabalhoQueFalhou[];
  /** A última linha de erro do log da execução (já escrita para o cliente). */
  ultimaMensagemDeErro: string | null;
};

export type FalhaDaCampanha = {
  codigo: CodigoDaCampanha;
  titulo: string;
  texto: string;
  /** A campanha entregou parte das peças. */
  parcial: boolean;
};

/** A frase de "passou do prazo" que só `ressuscitarMortos` escreve (lib/fila/trabalhos.ts). */
const PRAZO = /passou do prazo/i;

const plural = (n: number, um: string, varios: string) => (n === 1 ? um : varios);

/**
 * Quantos DIAS falharam. Conta pelos trabalhos de dia, e não pelo número do
 * fecho: `estadoDoGrupo` soma qualquer trabalho falhado do grupo, inclusive o
 * vídeo por IA, e o vídeo que não saiu já é dito na própria peça (videoFalhou).
 * Sem a lista (trabalhos apagados), vale o número do fecho.
 */
export function diasQueFalharamDe(f: Pick<FatosDaCampanha, "diasQueFalharam" | "trabalhosQueFalharam">): number {
  if (!f.trabalhosQueFalharam.length) return f.diasQueFalharam;
  return f.trabalhosQueFalharam.filter((t) => t.tipo === "campanha-dia").length;
}

/**
 * O que dizer desta campanha, ou null quando não houve falha a avisar.
 *
 * A ordem importa: a falha de configuração (sem squad, sem rede, sem dia) não
 * tem dia falhado na fila, o motivo está só no log e é escrito para o
 * cliente; "prazo" é quando TODO dia que falhou morreu por tempo; o resto é
 * "nenhuma peça" ou "parte dos dias".
 */
export function descreverFalhaDaCampanha(f: FatosDaCampanha): FalhaDaCampanha | null {
  const falhou = f.status === "failed";
  const dias = diasQueFalharamDe(f);
  if (!falhou && dias === 0) return null;
  if (f.status !== "failed" && f.status !== "completed") return null;

  // A FALHA DE CONFIGURAÇÃO PODE VIR NO MEIO (revisão de 08/10): a rede que
  // caiu na quarta marca a execução como falha dentro do dia, depois de
  // segunda e terça terem virado post. Com peças no quadro, "não começou" e
  // "não gerou nenhuma peça" seriam mentira; a frase conta as que saíram. O
  // fecho não cobra execução falhada, então "nada foi cobrado" vale nos dois.
  if (falhou && dias === 0) {
    const motivo = f.ultimaMensagemDeErro?.trim() || (f.totalPosts > 0 ? "A campanha parou no meio." : "A campanha parou antes do primeiro dia.");
    const jaSairam = f.totalPosts > 0 ? ` ${plural(f.totalPosts, "A peça que já saiu está", `As ${f.totalPosts} peças que já saíram estão`)} no quadro esperando o seu ok.` : "";
    return {
      codigo: CODIGO_DA_CAMPANHA.configuracao,
      titulo: f.totalPosts > 0 ? "A campanha parou no meio" : "A campanha não começou",
      texto: `${motivo}${jaSairam}${/nada foi cobrado/i.test(motivo) ? "" : " Nada foi cobrado."}`,
      parcial: f.totalPosts > 0,
    };
  }

  const erros = f.trabalhosQueFalharam.filter((t) => !t.tipo.startsWith("video-ia")).map((t) => t.error ?? "");
  const todosPorPrazo = erros.length > 0 && erros.every((e) => PRAZO.test(e));

  if (f.totalPosts === 0) {
    return {
      codigo: todosPorPrazo ? CODIGO_DA_CAMPANHA.prazo : CODIGO_DA_CAMPANHA.semPeca,
      titulo: "A campanha não gerou nenhuma peça",
      texto: todosPorPrazo
        ? "A geração dos dias não terminou a tempo nas três tentativas de cada um. Nada foi cobrado e a equipe já foi avisada. Você pode pedir de novo com o mesmo tema; se repetir, abra um chamado com o código."
        : `${dias > 0 ? `Tentamos cada dia três vezes e ${plural(dias, "ele não saiu", "nenhum saiu")}.` : "A campanha parou antes de entregar qualquer peça."} Nada foi cobrado e a equipe já foi avisada com o motivo. Você pode pedir de novo com o mesmo tema; se repetir, abra um chamado com o código.`,
      parcial: false,
    };
  }

  return {
    codigo: todosPorPrazo ? CODIGO_DA_CAMPANHA.prazo : CODIGO_DA_CAMPANHA.parcial,
    titulo: `${dias} ${plural(dias, "dia da campanha não saiu", "dias da campanha não saíram")}`,
    texto: `As outras ${f.totalPosts} ${plural(f.totalPosts, "peça está", "peças estão")} no quadro esperando o seu ok. ${plural(dias, "O dia que falhou não foi cobrado", "Os dias que falharam não foram cobrados")} e a equipe já foi avisada.`,
    parcial: true,
  };
}

const NOME_DO_DIA = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

/**
 * O corpo do e-mail da EQUIPE: tudo o que o cliente não vê, numa ordem que dá
 * para ler no celular (o que houve, de quem, cada trabalho com o erro bruto).
 */
export function textoDaFalhaParaAEquipe(p: {
  falha: FalhaDaCampanha;
  runId: string;
  projeto: string;
  projectId: string;
  cliente: string;
  tema: string | null;
  fatos: FatosDaCampanha;
  ultimasLinhas: string[];
  base: string;
}): string {
  const trabalhos = p.fatos.trabalhosQueFalharam.map((t) => {
    const onde = t.tipo === "campanha-dia" && t.dia ? `dia (${NOME_DO_DIA[t.dia] ?? t.dia})` : t.tipo;
    return `- ${onde}, ${t.attempts} tentativa(s): ${(t.error ?? "sem erro gravado").slice(0, 400)}`;
  });
  return [
    `${p.falha.titulo} (${p.falha.codigo}). Status gravado: ${p.fatos.status}, ${p.fatos.totalPosts} peça(s) entregue(s), ${diasQueFalharamDe(p.fatos)} dia(s) falhado(s).`,
    "",
    `Projeto: ${p.projeto} (${p.base}/projects/${p.projectId}/live)`,
    `Cliente: ${p.cliente}`,
    `Execução: ${p.runId}`,
    `Tema: ${(p.tema ?? "(sem tema)").slice(0, 300)}`,
    "",
    trabalhos.length ? "Trabalhos que falharam na fila:" : "Nenhum trabalho da fila falhou: o motivo está no log da execução.",
    ...trabalhos,
    ...(p.ultimasLinhas.length ? ["", "Últimas linhas de aviso do log:", ...p.ultimasLinhas.map((l) => `- ${l.slice(0, 300)}`)] : []),
    "",
    `O cliente leu: "${p.falha.texto}"`,
  ].join("\n");
}
