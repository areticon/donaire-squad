import { gemeoAtivo, type AvatarDoGemeo, type CadastroDoGemeo } from "@/lib/media/gemeo";

/**
 * EM QUE PÉ ESTÁ O GÊMEO, numa frase (03/10/2026).
 *
 * O pedido do Bruno: o gêmeo ficou parado esperando a confirmação na HeyGen, e
 * ele não achou onde aprovar ("devo fingir que vou gerar outro conteúdo para
 * chegar na tela do gêmeo?"). A mesma leitura do cadastro agora alimenta a
 * seção "Gêmeo digital" das Configurações, o selo "Falta um passo" no topo do
 * projeto e o texto dos avisos (sino e e-mail), para os três nunca dizerem
 * coisas diferentes.
 *
 * Módulo PURO: a tela importa daqui. Nada de banco.
 */

export type FaseDoGemeo =
  | "sem-gemeo"
  | "conferindo"
  | "refazer"
  | "treinando"
  | "falta-um-passo"
  | "link-vencido"
  | "pronto"
  | "reserva";

export type SituacaoDoGemeo = {
  fase: FaseDoGemeo;
  titulo: string;
  texto: string;
  tom: "ok" | "espera" | "andando" | "erro" | "neutro";
  /** O link do fornecedor para confirmar, quando ainda vale. */
  confirmarUrl: string | null;
  /** "domingo, 19h": até quando o link vale. */
  prazo: string | null;
};

const FUSO = "America/Sao_Paulo";

/**
 * "domingo, 19h", "hoje, 19h". A hora é ARREDONDADA PARA BAIXO: o prazo que
 * guardamos já é uma hora antes do da HeyGen, e dizer 19h para 19h05 nunca
 * faz ninguém chegar atrasado.
 */
export function prazoFalado(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  const dia = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: FUSO });
  const semana = d.toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "long" }).replace(/-feira$/, "");
  const hora = Number(d.toLocaleString("pt-BR", { timeZone: FUSO, hour: "2-digit", hour12: false }));
  return `${dia(d) === dia(agora) ? "hoje" : semana}, ${hora}h`;
}

/** O link de confirmação passou do prazo (o passo do cron renova sozinho, mas pode demorar ou falhar). */
export function linkVencido(a: Pick<AvatarDoGemeo, "consentimentoAte"> | null | undefined, agora = Date.now()): boolean {
  return Boolean(a?.consentimentoAte && new Date(a.consentimentoAte).getTime() <= agora);
}

/** Faltam até 3 h para o link vencer, e a pessoa ainda não confirmou. */
export function hojeDoLembrete(a: Pick<AvatarDoGemeo, "consentimentoAte"> | null | undefined, agora = Date.now()): boolean {
  if (!a?.consentimentoAte) return false;
  const falta = new Date(a.consentimentoAte).getTime() - agora;
  return falta > 0 && falta <= 3 * 3600_000;
}

export function situacaoDoGemeo(c: CadastroDoGemeo | null | undefined, agora: Date = new Date()): SituacaoDoGemeo {
  const base = { confirmarUrl: null, prazo: null };
  const t = c?.treino;
  const a = c?.avatar;
  const ativo = gemeoAtivo(c);

  if (a?.estado === "consentimento") {
    if (linkVencido(a, agora.getTime()) || !a.consentimentoUrl) {
      return {
        ...base,
        fase: "link-vencido",
        tom: "espera",
        titulo: "Falta um passo: o link de confirmação venceu",
        texto: "O gerador de vídeo pede que você confirme, pela câmera, que autoriza o seu gêmeo. O link dura 24 horas e este passou do prazo. Peça um link novo: leva 30 segundos.",
      };
    }
    const prazo = prazoFalado(a.consentimentoAte!, agora);
    return {
      fase: "falta-um-passo",
      tom: "espera",
      titulo: "Falta um passo: confirmar pela câmera",
      texto: "O seu gêmeo está treinado. O gerador de vídeo pede que você confirme, pela câmera, que autoriza o seu gêmeo. Leva 30 segundos.",
      confirmarUrl: a.consentimentoUrl,
      prazo,
    };
  }
  if (a?.estado === "enviando" || a?.estado === "treinando") {
    return {
      ...base,
      fase: "treinando",
      tom: "andando",
      titulo: "Treinando o seu gêmeo",
      texto: "O gerador está aprendendo rosto, gestos e boca com o seu vídeo de treino. Leva alguns minutos, e avisamos quando precisar de você.",
    };
  }
  if (a?.estado === "pronto" && ativo) {
    return { ...base, fase: "pronto", tom: "ok", titulo: "Gêmeo pronto", texto: "Treinado com os seus gestos. Os vídeos do gêmeo saem por ele." };
  }
  if (a?.estado === "falhou" && ativo) {
    return {
      ...base,
      fase: "reserva",
      tom: "neutro",
      titulo: "Gêmeo ativo pela imagem do vídeo de treino",
      texto: `${a.motivo ?? "O gerador não treinou o gêmeo."} Os vídeos continuam saindo, pela imagem do vídeo de treino.`,
    };
  }
  if (ativo) return { ...base, fase: "pronto", tom: "ok", titulo: "Gêmeo pronto", texto: "Você já pode gerar vídeos com o seu rosto e a sua voz." };
  if (t?.estado === "preparando" || t?.estado === "conferindo") {
    return { ...base, fase: "conferindo", tom: "andando", titulo: "Conferindo o vídeo de treino", texto: "Estamos conferindo luz, enquadramento, som e a frase da autorização. Leva alguns minutos." };
  }
  if (t?.estado === "recusado" || t?.estado === "falhou") {
    return { ...base, fase: "refazer", tom: "erro", titulo: "O vídeo de treino precisa ser refeito", texto: t.motivo ?? "O vídeo não passou nas checagens. Abra a tela do gêmeo para ver o que corrigir." };
  }
  if (t?.estado === "valido") {
    return { ...base, fase: "conferindo", tom: "andando", titulo: "Preparando o seu gêmeo", texto: "O vídeo de treino valeu. Estamos preparando a imagem e clonando a voz." };
  }
  return {
    ...base,
    fase: "sem-gemeo",
    tom: "neutro",
    titulo: "Você ainda não tem um gêmeo digital",
    texto: "Para as semanas sem tempo de gravar: o gêmeo fala o roteiro da sua linha editorial com o seu rosto e a sua voz. Basta um vídeo de cerca de 1 minuto lendo o texto que aparece na tela.",
  };
}

/** O selo do topo do projeto: só quando falta a pessoa agir. */
export function faltaUmPasso(s: SituacaoDoGemeo): boolean {
  return s.fase === "falta-um-passo" || s.fase === "link-vencido";
}
