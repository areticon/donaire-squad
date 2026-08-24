import { askClaude } from "@/lib/claude";
import type { Word } from "@/lib/media/transcribe";

/**
 * Os efeitos que saem da FALA: emoji e frase de destaque.
 *
 * ## A regra que o Bruno fixou, e ela é jurídica antes de ser estética
 *
 * Decidido em 23/08: só entra o que sai da fala. Nada de print de notícia, nada
 * de imagem de acervo, nada de meme baixado. Print de manchete traz direito
 * autoral e risco de manchete inventada, e os dois caem no nome do CLIENTE, que
 * é quem publica.
 *
 * ## Por que o emoji entra como IMAGEM e não como texto
 *
 * Medido em 24/08: o libass deste ffmpeg desenha emoji em preto e branco, só o
 * contorno, tanto com a fonte do sistema (formato COLR) quanto com a Noto Color
 * Emoji (formato CBDT), que ele nem chega a escolher, caindo para a Arial.
 *
 * Então o emoji entra sobreposto, de uma paleta fechada que mora no
 * repositório. A paleta fechada não é limitação, é decisão de produto: ela
 * garante que o canal do cliente tenha sempre o mesmo vocabulário visual em vez
 * do que o modelo lembrar naquele dia, e de quebra tira do caminho o emoji de
 * rosto, que competiria com o rosto que já está na tela.
 *
 * ## Por que a cada 1,5 a 2 segundos, e por que isso NÃO significa efeito
 *
 * A pesquisa de 24/08 aponta mudança visual a cada 1,5 a 2 segundos como alvo
 * de retenção em 2026. É tentador ler isso como "põe um efeito a cada dois
 * segundos", e seria o caminho mais rápido para um vídeo cansativo.
 *
 * A legenda palavra a palavra JÁ cumpre boa parte desse alvo: com fala normal,
 * ela troca de duas a três vezes por segundo. O que falta é a mudança de
 * ATENÇÃO, e é isso que o emoji e a frase de destaque fazem, em pontos
 * escolhidos e não em cadência de metrônomo.
 *
 * Por isso o teto é baixo e proporcional: **um efeito a cada 8 segundos de
 * corte**, no máximo. Um corte de 60 segundos ganha 7 momentos, não 30.
 *
 * ## O que o agente escolhe, e o que o código confere
 *
 * O agente devolve a PALAVRA em que o efeito entra, copiada da transcrição, e
 * não o segundo. É a mesma regra que resolveu a abertura e o fim do corte em
 * 24/08: quando o modelo devolve texto e número sobre a mesma coisa, o texto é
 * a fonte da verdade e o número é palpite. Aqui o número nem é pedido.
 */

export type Efeito = {
  /** O que aparece: um emoji da paleta, ou uma frase curta em caixa alta. */
  tipo: "emoji" | "frase";
  /** O emoji, ou a frase de destaque. */
  valor: string;
  /** A palavra da transcrição em que ele entra. */
  ancora: string;
  /** Por que ali, para conferência humana e para o log. */
  motivo: string;
};

/** Um efeito já colocado no tempo. */
export type EfeitoNoTempo = Efeito & {
  /** Segundo do vídeo ORIGINAL em que entra. */
  segundo: number;
};

/**
 * A paleta fechada de emoji, com o arquivo de cada um.
 *
 * São imagens e não texto, pela medição de 24/08 explicada acima. As imagens
 * vêm do projeto Noto Emoji do Google, sob Apache 2.0, e moram em
 * `worker/emoji` com o arquivo de licença ao lado.
 *
 * Nenhum rosto na lista, de propósito.
 */
export const PALETA: { emoji: string; arquivo: string; para: string }[] = [
  { emoji: "📉", arquivo: "u1f4c9.png", para: "queda, perda, piora" },
  { emoji: "📈", arquivo: "u1f4c8.png", para: "alta, crescimento, melhora" },
  { emoji: "📊", arquivo: "u1f4ca.png", para: "dado, medição, comparação" },
  { emoji: "💰", arquivo: "u1f4b0.png", para: "dinheiro que entra, faturamento" },
  { emoji: "💸", arquivo: "u1f4b8.png", para: "dinheiro que sai, custo, prejuízo" },
  { emoji: "⏱️", arquivo: "u23f1.png", para: "tempo, prazo, demora" },
  { emoji: "🔥", arquivo: "u1f525.png", para: "o ponto forte, o que pega fogo" },
  { emoji: "💡", arquivo: "u1f4a1.png", para: "a ideia, a sacada" },
  { emoji: "⚠️", arquivo: "u26a0.png", para: "o aviso, o risco, a armadilha" },
  { emoji: "✅", arquivo: "u2705.png", para: "o que funciona, o que fazer" },
  { emoji: "❌", arquivo: "u274c.png", para: "o que não funciona, o erro" },
  { emoji: "🎯", arquivo: "u1f3af.png", para: "o objetivo, o alvo, a precisão" },
  { emoji: "🚀", arquivo: "u1f680.png", para: "acelerar, escalar, lançar" },
  { emoji: "🧠", arquivo: "u1f9e0.png", para: "pensar, entender, estratégia" },
  { emoji: "📌", arquivo: "u1f4cc.png", para: "o ponto que precisa ficar" },
  { emoji: "🔑", arquivo: "u1f511.png", para: "a chave da coisa, o essencial" },
  { emoji: "⚡", arquivo: "u26a1.png", para: "rápido, energia, choque" },
  { emoji: "🏆", arquivo: "u1f3c6.png", para: "resultado, vitória, conquista" },
  { emoji: "🤝", arquivo: "u1f91d.png", para: "parceria, sociedade, acordo" },
  { emoji: "🛠️", arquivo: "u1f6e0.png", para: "ferramenta, construir, operação" },
  { emoji: "🔒", arquivo: "u1f512.png", para: "trava, segurança, o que prende" },
  { emoji: "📅", arquivo: "u1f4c5.png", para: "data, rotina, frequência" },
  { emoji: "🎧", arquivo: "u1f3a7.png", para: "ouvir, atenção, conteúdo" },
  { emoji: "👀", arquivo: "u1f440.png", para: "olhar, notar, o que ninguém vê" },
];

/** Tira o seletor de variação, que vem colado em alguns emoji e quebra a busca. */
function semVariacao(t: string): string {
  return (t ?? "").replace(/[\uFE0E\uFE0F]/g, "").trim();
}

/** O arquivo de um emoji da paleta, ou null se ele não estiver nela. */
export function arquivoDoEmoji(valor: string): string | null {
  const alvo = semVariacao(valor);
  const achado = PALETA.find((p) => semVariacao(p.emoji) === alvo);
  return achado?.arquivo ?? null;
}

const SISTEMA = `Você é o editor de um vídeo curto vertical e escolhe onde entram os REFORÇOS visuais.

Recebe a transcrição de um corte. Devolve poucos momentos, cada um com um emoji OU uma frase curta de destaque, ancorados numa palavra da própria fala.

O QUE VOCÊ PODE USAR
- Emoji: UM, e só da lista que vem junto. Ele reforça o que a pessoa ACABOU de dizer. Emoji fora da lista é descartado.
- Frase de destaque: no máximo quatro palavras, em caixa alta, tirada ou resumida da própria fala. Ela repete o ponto, ela não comenta o ponto.

O QUE VOCÊ NÃO PODE FAZER
- Não invente informação que não está na fala. Nada de número, nome ou fato novo.
- Não use emoji fora da lista. Não existe rosto na lista, e isso é de propósito: a pessoa já está na tela mostrando a cara dela.
- Não ponha efeito em transição, em conectivo, nem em palavra sem peso.
- Não repita o mesmo emoji no mesmo corte.

ONDE O EFEITO FUNCIONA
1. No NÚMERO. "Trinta por cento" pede um reforço, "e aí eu fui" não pede nada.
2. Na VIRADA. A frase em que a pessoa contraria o que ela mesma disse antes.
3. No NOME da coisa. O termo que o vídeo inteiro gira em torno.
4. No FECHO de um argumento, e não no meio dele.

QUANTIDADE
Poucos e certos. É melhor devolver três ótimos do que sete mornos. Se o corte não tiver momento que peça reforço, devolva a lista vazia, e isso é uma resposta legítima.

ÂNCORA
No campo "ancora", copie EXATAMENTE uma palavra que aparece na transcrição, do jeito que ela está escrita ali. Prefira uma palavra que apareça uma vez só no corte. O efeito vai entrar no instante em que essa palavra é dita.

Português do Brasil, sem travessão.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string:
{"efeitos":[{"tipo":"emoji","valor":"📉","ancora":"caiu","motivo":"..."}]}`;

/** Um efeito a cada tantos segundos de corte, no máximo. */
const SEGUNDOS_POR_EFEITO = 8;
/** Nunca mais que isto, por mais longo que seja o corte. */
const TETO = 7;

export async function escolherEfeitos(
  transcricao: string,
  duracaoSec: number,
  usageCtx?: { projectId?: string }
): Promise<Efeito[]> {
  if (!transcricao.trim() || duracaoSec < 8) return [];

  const quantos = Math.max(1, Math.min(TETO, Math.floor(duracaoSec / SEGUNDOS_POR_EFEITO)));
  const lista = PALETA.map((p) => `${p.emoji} ${p.para}`).join("\n");

  const resposta = await askClaude(
    SISTEMA,
    `Emoji disponíveis, e só estes:\n${lista}\n\n` +
      `Corte de ${Math.round(duracaoSec)} segundos. No máximo ${quantos} momentos.\n\n` +
      `Transcrição:\n${transcricao}`,
    {
      // Mesmo teto da abertura, e pela mesma razão medida em 23 e 24/08:
      // acrescentar exigência de julgamento ao prompt aumenta o pensamento, e
      // quando o teto não acompanha, a chamada volta sem texto nenhum, calada.
      maxTokens: 16000,
      usage: { operation: "video_efeitos", ...usageCtx },
    }
  );

  const limpo = resposta
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  const dados = JSON.parse(limpo) as { efeitos?: Efeito[] };

  // O emoji fora da paleta é DESCARTADO e não substituído. Substituir seria pôr
  // na tela um símbolo que ninguém escolheu para aquele momento, e um reforço
  // errado é pior que reforço nenhum.
  const validos = (dados.efeitos ?? []).filter((e) => {
    if (e.tipo === "emoji") {
      if (arquivoDoEmoji(e.valor)) return true;
      console.warn(`[efeitos] emoji "${e.valor}" nao esta na paleta, descartado`);
      return false;
    }
    // Frase longa demais deixa de ser destaque e vira legenda concorrente.
    return e.tipo === "frase" && (e.valor ?? "").trim().split(/\s+/).length <= 4;
  });

  return validos.slice(0, quantos);
}

/** Tira acento e pontuação, para comparar palavra com palavra sem tropeçar. */
function chave(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/**
 * Põe cada efeito no instante em que a âncora dele é dita.
 *
 * O efeito cuja âncora NÃO existe na fala do corte é descartado, e isso é
 * proposital: é a mesma trava que a abertura tem desde 24/08. Âncora inventada
 * não vira efeito no lugar errado, ela não vira efeito nenhum.
 *
 * Quando a palavra aparece mais de uma vez, fica com a PRIMEIRA dentro do
 * corte. Escolher a mais tardia arriscaria pôr o reforço depois de o assunto já
 * ter passado.
 */
export function efeitosNoTempo(
  efeitos: Efeito[],
  palavras: Word[],
  inicioDoCorte: number,
  fimDoCorte: number
): EfeitoNoTempo[] {
  const dentro = palavras.filter((p) => p.end > inicioDoCorte && p.start < fimDoCorte);
  const colocados: EfeitoNoTempo[] = [];

  for (const e of efeitos) {
    const alvo = chave(e.ancora ?? "");
    if (!alvo) continue;
    const achada = dentro.find((p) => chave(p.word) === alvo);
    if (!achada) {
      console.warn(`[efeitos] ancora "${e.ancora}" nao existe na fala do corte, descartado`);
      continue;
    }
    colocados.push({ ...e, segundo: achada.start });
  }

  // Dois efeitos colados viram poluição em vez de ritmo. Três segundos é o
  // menor intervalo em que o olho termina de ler um e começa o outro.
  colocados.sort((a, b) => a.segundo - b.segundo);
  const espacados: EfeitoNoTempo[] = [];
  for (const e of colocados) {
    if (!espacados.length || e.segundo - espacados[espacados.length - 1].segundo >= 3) {
      espacados.push(e);
    }
  }
  return espacados;
}
