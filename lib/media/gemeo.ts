/**
 * O GÊMEO DIGITAL, a parte sem banco (01/10/2026).
 *
 * A tela (componente cliente) e o servidor fazem as MESMAS contas: o preço que
 * aparece antes do clique, a divisão do roteiro em pedaços e a frase da
 * autorização. Por isso tudo isso mora aqui, sem Prisma, sem fetch, sem Blob.
 * O que toca o banco e os fornecedores está em `gemeo-servidor.ts`,
 * `gemeo-fornecedores.ts` e `gemeo-passo.ts`, e a tela nunca importa de lá.
 *
 * DECISÃO DO DONO (Bruno, 01/10): o gerador é o OmniHuman 1.5 no fal.ai. Venceu
 * o teste comparativo de 01/10 (os dois Kling queimavam uma legenda falsa e
 * ilegível no rodapé; o OmniHuman saiu limpo e natural). A voz é a clonagem
 * instantânea da ElevenLabs.
 */

// ─────────────────────────────── o gerador ───────────────────────────────

export const MODELO_DO_GERADOR = "fal-ai/bytedance/omnihuman/v1.5";

/**
 * O teto da ALTA DEFINIÇÃO do OmniHuman: o áudio de cada pedido tem que ter
 * menos de 30 s (acima disso, só 720p, até 60 s). 29,5 deixa meio segundo de
 * margem para o arredondamento do lado deles.
 */
export const SEGUNDOS_MAXIMOS_DO_PEDACO = 29.5;

/**
 * O ALVO na hora de dividir o texto, bem abaixo do teto: a divisão é feita
 * ANTES da voz existir, pela régua de palavras por segundo, e uma voz mais
 * lenta que a régua estica o pedaço. 22 s pela régua viram até 26 s numa voz
 * 20% mais lenta. Se mesmo assim passar do teto, o passo da voz parte o
 * pedaço em dois e fala de novo (ver `partirAoMeio`).
 */
export const SEGUNDOS_ALVO_DO_PEDACO = 22;

/**
 * Palavras por segundo da fala, a mesma régua de `segundosDaFala` da linha
 * editorial (2,4, medida em 22/09). Usada só para ESTIMAR antes de falar; o
 * que se cobra é a duração real da voz gerada.
 */
export const PALAVRAS_POR_SEGUNDO = 2.4;

/** O roteiro mais longo que o gêmeo aceita por vez (3 min = 7 a 9 pedaços). */
export const SEGUNDOS_MAXIMOS_DO_ROTEIRO = 180;
/** Menos que isso não vale um vídeo. */
export const SEGUNDOS_MINIMOS_DO_ROTEIRO = 5;

/**
 * A instrução que acompanha a foto e a voz no pedido. Neutra de propósito
 * (sem gênero, idade ou cenário): quem descreve a pessoa é a foto. O teste de
 * 01/10 usou uma descrição do Bruno ("homem brasileiro de barba"), que não
 * serve para ninguém mais.
 */
export const INSTRUCAO_DO_GERADOR =
  "A pessoa da foto fala direto para a câmera, com calma e convicção, gestos naturais e discretos, olhar firme na lente. Sem texto nem legenda na imagem.";

// ─────────────────────────────── o preço ───────────────────────────────

/**
 * O CUSTO, em dólar por segundo de vídeo entregue:
 *
 *  - OmniHuman 1.5: US$ 0,16 por segundo de VÍDEO, e o vídeo sai um pouco
 *    mais longo que a fala (27,4 s de vídeo para 26,9 s de fala no teste de
 *    01/10, 1,9% a mais). Conta com 3%;
 *  - ElevenLabs: perto de 15 caracteres por segundo de fala em português. No
 *    plano Creator (US$ 22 por 100 mil caracteres) dá US$ 0,0033 por segundo;
 *    conta com US$ 0,004, que cobre o Starter e a fala refeita de um pedaço
 *    que passou de 30 s.
 *
 * Total: US$ 0,1688 por segundo, ou R$ 0,905 (dólar a R$ 5,36 com IOF).
 */
export const DOLAR_POR_SEGUNDO_DO_GERADOR = 0.16;
export const FOLGA_DO_VIDEO_SOBRE_A_FALA = 1.03;
export const DOLAR_POR_SEGUNDO_DA_VOZ = 0.004;
/** Mesmas premissas de `lib/credits/higgsfield-tabela.ts` e da régua de 01/10 em `lib/media/limits.ts`. */
const REAIS_POR_DOLAR = 5.36;
const REAIS_DE_CUSTO_POR_CREDITO = 0.027;

/**
 * CRÉDITOS POR SEGUNDO DE VÍDEO DO GÊMEO: 34.
 *
 * A régua da casa desde 01/10: nenhuma etapa pode custar mais de R$ 0,027 de
 * IA por crédito, que é o que deixa o Enterprise (crédito a R$ 0,094) acima de
 * 70% de margem. R$ 0,905 / R$ 0,027 = 33,5, arredondado para cima: 34.
 * Margem bruta sobre o custo do gêmeo: 71,7% no Enterprise, 73,4% no Pro
 * (R$ 0,100) e 82,3% no Starter (R$ 0,150).
 *
 * `lib/media/limits.ts` tem uma proposta antiga, CREDITOS_POR_SEGUNDO_DO_GEMEO
 * = 25, feita sobre o Kling Avatar (US$ 0,115). Com o OmniHuman (US$ 0,16)
 * ela dá R$ 0,036 por crédito, abaixo da régua; quem cobra é ESTE número.
 *
 * A edição do vídeo (transcrição, roteiro, cortes) é cobrada à parte, no
 * preço de qualquer gravação, porque o vídeo do gêmeo entra na mesma esteira.
 */
export const CREDITOS_POR_SEGUNDO_DE_GEMEO = Math.ceil(
  ((DOLAR_POR_SEGUNDO_DO_GERADOR * FOLGA_DO_VIDEO_SOBRE_A_FALA + DOLAR_POR_SEGUNDO_DA_VOZ) * REAIS_POR_DOLAR) /
    REAIS_DE_CUSTO_POR_CREDITO
);

// ─────────────────────────────── os geradores (03/10) ───────────────────────────────

/**
 * O GERADOR É PLUGÁVEL (03/10/2026). Dois hoje:
 *
 *   omnihuman  OmniHuman 1.5 no fal.ai, o de 01/10: anima UMA imagem (o melhor
 *              quadro do vídeo de treino, ou a pessoa composta num cenário)
 *              com a fala. Não treina nada; é a RESERVA, e funciona com a
 *              chave que já temos;
 *   heygen     o gêmeo TREINADO a partir do vídeo de treino (API v3 da HeyGen,
 *              "digital twin"): gesto, postura e boca aprendidos da própria
 *              pessoa; desde 04/10, os cenários são o próprio gêmeo recortado
 *              sobre um fundo profissional. É o recomendado, e liga com HEYGEN_API_KEY e
 *              GEMEO_GERADOR=heygen (ver gemeo-geradores.ts).
 *
 * A tabela mora aqui porque a tela mostra o preço ANTES do clique com a mesma
 * conta que o servidor cobra; quem decide qual gerador vale para o projeto é
 * o servidor, que manda o id para a tela.
 */
export type IdDoGerador = "omnihuman" | "heygen";

export type FichaDoGerador = {
  id: IdDoGerador;
  nome: string;
  /** US$ por segundo de VÍDEO entregue. */
  dolarPorSegundo: number;
  /** Quanto o vídeo sai mais longo que a fala. */
  folga: number;
  /** O maior pedaço de fala por pedido, em segundos. */
  tetoDoPedaco: number;
};

export const GERADORES: Record<IdDoGerador, FichaDoGerador> = {
  omnihuman: {
    id: "omnihuman",
    nome: "OmniHuman 1.5 (fal.ai)",
    dolarPorSegundo: DOLAR_POR_SEGUNDO_DO_GERADOR,
    folga: FOLGA_DO_VIDEO_SOBRE_A_FALA,
    tetoDoPedaco: SEGUNDOS_MAXIMOS_DO_PEDACO,
  },
  /**
   * HeyGen, gêmeo treinado (Avatar IV ou V): 0,1 crédito de API por segundo,
   * US$ 0,05/s na tabela oficial; o pré-pago avulso aparece a US$ 0,0667/s em
   * fontes de 2026 (o modal de preço oficial não abre sem conta). Contamos o
   * MAIOR, para a régua nunca ficar abaixo do custo real. O áudio que a HeyGen
   * anima é a mesma voz ElevenLabs aprovada (enviada pronta), então a voz
   * entra na conta como no OmniHuman. Pedido de até 10 min de áudio: o teto
   * aqui é o do texto que dividimos (22 s), e sobe sem mexer em nada.
   */
  //
  // MEDIDO EM 04/10 no saldo da conta, com o Avatar V (o motor de melhor boca,
  // padrão desde então) e o fundo trocado: US$ 0,25 por 2,85 s e US$ 1,70 por
  // 15,5 s, perto de US$ 0,11/s. Pela regra acima (contar o maior), a régua
  // passa a 0,11.
  heygen: {
    id: "heygen",
    nome: "HeyGen (gêmeo treinado)",
    dolarPorSegundo: 0.11,
    folga: 1,
    tetoDoPedaco: 120,
  },
};

/** Créditos por segundo de um gerador, pela régua da casa (R$ 0,027 de custo por crédito). */
export function creditosPorSegundo(gerador: IdDoGerador = "omnihuman"): number {
  const g = GERADORES[gerador] ?? GERADORES.omnihuman;
  return Math.ceil(((g.dolarPorSegundo * g.folga + DOLAR_POR_SEGUNDO_DA_VOZ) * REAIS_POR_DOLAR) / REAIS_DE_CUSTO_POR_CREDITO);
}

/**
 * A RESERVA: a fala só existe depois da voz gerada, e a voz pode sair mais
 * lenta que a régua. Reservamos 15% acima da estimativa, cobramos o tempo
 * REAL da fala e devolvemos a diferença na mesma hora. O cliente nunca paga
 * mais do que viu na tela; se a fala passar da reserva, a diferença é nossa.
 */
export const FOLGA_DA_RESERVA = 1.15;

export function creditosDoGemeo(segundos: number, gerador: IdDoGerador = "omnihuman"): number {
  return Math.ceil(Math.max(0, segundos)) * creditosPorSegundo(gerador);
}

export function estimarSegundos(texto: string): number {
  const palavras = texto.split(/\s+/).filter(Boolean).length;
  return palavras === 0 ? 0 : Math.max(1, Math.round(palavras / PALAVRAS_POR_SEGUNDO));
}

export type PrecoDoRoteiro = {
  /** Duração estimada da fala, em segundos. */
  segundos: number;
  /** O que se espera cobrar, pela estimativa. */
  creditosEstimados: number;
  /** O que fica reservado no pedido (o teto do que se cobra). */
  creditosReservados: number;
  pedacos: number;
};

export function precoDoRoteiro(texto: string, gerador: IdDoGerador = "omnihuman"): PrecoDoRoteiro {
  const segundos = estimarSegundos(texto);
  return {
    segundos,
    creditosEstimados: creditosDoGemeo(segundos, gerador),
    creditosReservados: creditosDoGemeo(segundos * FOLGA_DA_RESERVA, gerador),
    pedacos: dividirEmPedacos(texto).length,
  };
}

/** "1 min 20 s", "45 s". */
export function duracaoFalada(segundos: number): string {
  const s = Math.round(segundos);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

// ─────────────────────────────── a divisão do texto ───────────────────────────────

/** Texto limpo: um espaço entre palavras, sem quebras. */
export function limparTexto(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}

function frases(texto: string): string[] {
  const limpo = limparTexto(texto);
  if (!limpo) return [];
  // Fim de frase: ponto, exclamação, interrogação ou reticências, com aspas ou
  // parênteses de fechamento grudados. O que sobrar sem pontuação é a última.
  return (limpo.match(/[^.!?…]+(?:[.!?…]+["”’')\]]*|$)/g) ?? [limpo]).map((f) => f.trim()).filter(Boolean);
}

function juntarAte(partes: string[], alvo: number, separador = " "): string[] {
  const grupos: string[] = [];
  let atual = "";
  for (const p of partes) {
    const tentativa = atual ? `${atual}${separador}${p}` : p;
    if (atual && estimarSegundos(tentativa) > alvo) {
      grupos.push(atual);
      atual = p;
    } else {
      atual = tentativa;
    }
  }
  if (atual) grupos.push(atual);
  return grupos;
}

/** Frase longa demais para um pedaço: corta nas vírgulas; sem vírgula, nas palavras. */
function quebrarFraseLonga(frase: string, alvo: number): string[] {
  if (estimarSegundos(frase) <= alvo) return [frase];
  const oracoes = frase.split(/(?<=[,;:])\s+/).filter(Boolean);
  if (oracoes.length > 1) {
    return juntarAte(oracoes, alvo).flatMap((o) => (estimarSegundos(o) > alvo ? quebrarFraseLonga(o, alvo) : [o]));
  }
  const palavras = frase.split(" ");
  const porPedaco = Math.max(1, Math.floor(alvo * PALAVRAS_POR_SEGUNDO));
  const saida: string[] = [];
  for (let i = 0; i < palavras.length; i += porPedaco) saida.push(palavras.slice(i, i + porPedaco).join(" "));
  return saida;
}

/**
 * O roteiro em pedaços abaixo do teto do gerador, cortados em FIM DE FRASE.
 *
 * Fim de frase porque cada pedaço é um vídeo separado e a emenda é um corte
 * seco: cortar no meio de uma frase deixa a entonação pendurada e o gesto
 * interrompido. Só uma frase que sozinha passa do alvo é cortada por dentro
 * (na vírgula). Um último pedaço curtinho (menos de 4 s) volta para o
 * anterior quando os dois cabem juntos.
 */
export function dividirEmPedacos(texto: string, alvo = SEGUNDOS_ALVO_DO_PEDACO): string[] {
  const unidades = frases(texto).flatMap((f) => quebrarFraseLonga(f, alvo));
  const grupos = juntarAte(unidades, alvo);
  if (grupos.length > 1) {
    const ultimo = grupos[grupos.length - 1];
    const penultimo = grupos[grupos.length - 2];
    if (estimarSegundos(ultimo) < 4 && estimarSegundos(`${penultimo} ${ultimo}`) <= alvo + 3) {
      grupos.splice(grupos.length - 2, 2, `${penultimo} ${ultimo}`);
    }
  }
  return grupos;
}

/**
 * Um pedaço cuja VOZ passou do teto: parte em dois, no fim de frase mais perto
 * do meio (ou na vírgula, ou na palavra do meio). Usado depois da voz gerada.
 */
export function partirAoMeio(texto: string): [string, string] {
  const limpo = limparTexto(texto);
  const meio = limpo.length / 2;
  const cortes: number[] = [];
  for (const re of [/[.!?…]["”’')\]]*\s/g, /[,;:]\s/g, /\s/g]) {
    for (const m of limpo.matchAll(re)) cortes.push((m.index ?? 0) + m[0].length);
    if (cortes.length) break;
  }
  if (!cortes.length) return [limpo, ""];
  const melhor = cortes.reduce((a, b) => (Math.abs(b - meio) < Math.abs(a - meio) ? b : a));
  return [limpo.slice(0, melhor).trim(), limpo.slice(melhor).trim()];
}

/** O texto falado de um roteiro da linha editorial: as falas das cenas, em ordem. */
export function textoDasCenas(cenas: Array<{ fala?: string | null }> | null | undefined): string {
  return limparTexto((cenas ?? []).map((c) => c.fala ?? "").filter(Boolean).join(" "));
}

// ─────────────────────────────── o cadastro ───────────────────────────────

export const MAX_FOTOS = 5;
/**
 * A amostra de voz (01/10): o clone aprovado pelo Bruno saiu de 4 minutos dele
 * FALANDO de verdade; o de 57 s lendo um texto soou robótico. Mínimo de 1
 * minuto e até 5, com a tela pedindo de preferência 2 a 4 minutos de fala
 * natural (um vídeo, uma live, uma reunião gravada).
 */
export const SEGUNDOS_MINIMOS_DA_VOZ = 60;
export const SEGUNDOS_MAXIMOS_DA_VOZ = 300;

/**
 * O texto que a pessoa lê para a amostra de voz. Cerca de 150 palavras, ou um
 * minuto lido sem pressa. Escrito para cobrir os sons do português que a
 * clonagem mais erra (nasais, "lh", "nh", "rr", "s" entre vogais, perguntas e
 * exclamações), e neutro de assunto, para servir a qualquer negócio.
 */
export const TEXTO_PARA_LER_DA_VOZ =
  "Olá! Este é o meu jeito de falar, e é com ele que eu quero conversar com quem me acompanha. " +
  "Toda semana eu tenho alguma coisa para contar: o que aprendi com um cliente, um erro que não quero repetir, " +
  "uma ideia que nasceu numa conversa de corredor. Nem sempre dá tempo de ligar a câmera, arrumar a luz e gravar " +
  "de novo quando a frase sai torta. Por isso eu gravo agora, com calma, lendo este texto em voz alta. " +
  "Você já reparou como a gente fala diferente quando está animado? A voz sobe, acelera, e depois desce de novo. " +
  "Eu quero que o meu gêmeo tenha essa mesma vida: a pergunta com cara de pergunta, a pausa antes da conclusão, " +
  "o sorriso que aparece na voz. Amanhã, quando o roteiro estiver pronto, quem vai falar continua sendo eu. " +
  "Obrigado por ouvir até aqui. Vamos juntos, que o melhor ainda está por vir!";

/**
 * A FRASE DA AUTORIZAÇÃO, lida pela própria pessoa com a câmera aberta.
 *
 * É ela que bloqueia rosto e voz de terceiros POR CONSTRUÇÃO: a imagem e a voz
 * de alguém só podem ser usadas com a autorização dela (Código Civil, art. 20),
 * e a prova mais forte dessa autorização é a própria pessoa dizendo, em vídeo,
 * o próprio nome e o que autoriza. Fica guardada com a data e o texto lido.
 */
export function fraseDaAutorizacao(nome: string, projeto?: string | null): string {
  const quem = limparTexto(nome) || "[seu nome]";
  const onde = projeto ? ` do projeto ${limparTexto(projeto)}` : "";
  return (
    `Eu, ${quem}, autorizo a Demandou a criar e usar o meu gêmeo digital, com o meu rosto e a minha voz, ` +
    `para produzir os vídeos${onde} que eu aprovar. Sei que posso revogar esta autorização quando quiser.`
  );
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * A pessoa disse mesmo a frase? Confere a transcrição da gravação: tem que
 * aparecer "autorizo", o primeiro nome (com uma letra de tolerância, porque a
 * transcrição erra nome próprio: "Donaire" vira "Donair") e "gêmeo" ou
 * "digital". Não exige a frase inteira palavra por palavra: quem trava na
 * leitura e recomeça continua autorizando.
 */
export function conferirFalaDaAutorizacao(transcricao: string, nome: string): { ok: boolean; faltou: string[] } {
  const palavras = semAcento(transcricao).split(/[^a-z0-9]+/).filter(Boolean);
  const tem = (alvo: string) =>
    palavras.some((p) => p === alvo || (alvo.length >= 5 && Math.abs(p.length - alvo.length) <= 1 && distancia(p, alvo) <= 1));
  const faltou: string[] = [];
  const primeiro = semAcento(limparTexto(nome)).split(" ").find((p) => p.length >= 2);
  if (!tem("autorizo")) faltou.push("a palavra \"autorizo\"");
  if (primeiro && !tem(primeiro)) faltou.push("o seu nome");
  if (!tem("gemeo") && !tem("digital")) faltou.push("\"gêmeo digital\"");
  return { ok: faltou.length === 0, faltou };
}

// ─────────────────────────────── o vídeo de treino (03/10) ───────────────────────────────

/**
 * UM VÍDEO SÓ (03/10/2026, pedido do Bruno, como os concorrentes): a pessoa
 * grava cerca de 1 minuto lendo o texto que rola na tela, e esse vídeo é ao
 * mesmo tempo a PROVA (a autorização dita por ela, com o rosto na câmera), a
 * AMOSTRA DE VOZ e a AMOSTRA DE IMAGEM. Antes eram três passos (fotos, voz,
 * autorização); o cadastro antigo continua valendo para quem já fez.
 *
 * 40 s é o mínimo porque a autorização sozinha leva uns 12 s e a clonagem
 * precisa de fala de verdade depois dela; 120 s é o teto porque o arquivo
 * normalizado precisa caber em 32 MB (limite de envio da HeyGen) e porque
 * mais que isso não melhora o gêmeo de quem LÊ um texto.
 */
export const SEGUNDOS_MINIMOS_DO_TREINO = 40;
export const SEGUNDOS_MAXIMOS_DO_TREINO = 120;

/**
 * O que a pessoa lê depois da autorização: cerca de 120 palavras, uns 50 s
 * lidos com calma. Mesmo critério do texto da voz (nasais, "lh", "nh", "rr",
 * pergunta e exclamação) e com DEIXAS de gesto e olhar, porque agora a câmera
 * também está aprendendo: quem lê parado vira um gêmeo parado.
 */
export const LEITURA_DO_TREINO =
  "Agora eu falo do meu jeito, olhando para a câmera, como se fosse com um cliente. " +
  "Toda semana eu tenho alguma coisa para contar: o que aprendi numa conversa, um erro que não quero repetir, " +
  "uma ideia que nasceu no caminho de casa. Você já reparou como a gente fala diferente quando está animado? " +
  "A voz sobe, as mãos acompanham, e depois tudo desce de novo, com calma. " +
  "É essa vida que eu quero no meu gêmeo: a pergunta com cara de pergunta, a pausa antes da conclusão, " +
  "o sorriso que aparece na voz. Nem sempre dá tempo de arrumar a luz e gravar de novo quando a frase sai torta. " +
  "Por isso eu gravo agora, sem pressa, do começo ao fim. Obrigado por ouvir até aqui. " +
  "Vamos juntos, que o melhor ainda está por vir!";

/** O texto inteiro do vídeo de treino: a autorização, depois a leitura. */
export function textoDoTreino(nome: string, projeto?: string | null): string {
  return `${fraseDaAutorizacao(nome, projeto)} ${LEITURA_DO_TREINO}`;
}

/** O que o worker mediu no vídeo de treino (worker/src/gemeo.mjs, treinoDoGemeo). */
export type MedidasDoTreino = {
  duracaoSec: number;
  largura?: number | null;
  altura?: number | null;
  rosto: { quadros: number; comRosto: number; comVarios: number; virados: number };
  audio: { falaDb: number | null; ruidoDb: number | null; picoDb: number | null; falaPct: number };
};

export type ChecagemDoTreino = {
  id: "duracao" | "rosto" | "audio" | "leitura";
  /** ok: passou; aviso: passou, mas a tela recomenda gravar de novo; erro: recusado. */
  resultado: "ok" | "aviso" | "erro";
  texto: string;
};

/**
 * Quanto do texto esperado aparece na transcrição: a fração das palavras de
 * 4 letras ou mais do texto que a pessoa disse (uma letra de tolerância a
 * partir de 6 letras, porque a transcrição erra acento e nome). A ordem não
 * importa: quem tropeça e repete uma frase continua lendo o texto.
 */
export function coberturaDaLeitura(transcricao: string, texto: string): number {
  const ditas = new Set(semAcento(transcricao).split(/[^a-z0-9]+/).filter((p) => p.length >= 4));
  const esperadas = [...new Set(semAcento(texto).split(/[^a-z0-9]+/).filter((p) => p.length >= 4))];
  if (!esperadas.length) return 0;
  const lista = [...ditas];
  const achou = esperadas.filter(
    (e) => ditas.has(e) || (e.length >= 6 && lista.some((d) => Math.abs(d.length - e.length) <= 1 && distancia(d, e) <= 1))
  );
  return achou.length / esperadas.length;
}

/**
 * OS LIMITES DA CHECAGEM AUTOMÁTICA, medidos na prova de 03/10 com uma
 * gravação real do Bruno (sala comum, câmera e microfone do dia a dia):
 *
 *  - áudio: fala (percentil 90 das janelas de 50 ms) em -20 dB e fundo
 *    (percentil 5, os respiros entre palavras) em -71 dB. Com ruído rosa
 *    somado, o fundo subiu para -49 dB. Recusa acima de -42 dB (o fundo vira
 *    "ar" metálico na voz clonada), avisa entre -50 e -42; fala abaixo de
 *    -38 dB é longe do microfone; pico em 0 dB é voz estourada;
 *  - rosto: um rosto só em pelo menos 6 dos 8 quadros, e nenhum quadro com
 *    duas pessoas (o gêmeo é só de quem autorizou);
 *  - leitura: pelo menos 70% das palavras do texto e a autorização inteira
 *    ("autorizo", o nome, "gêmeo digital").
 */
export function conferirTreino(
  m: MedidasDoTreino,
  transcricao: string,
  nome: string,
  texto: string
): { ok: boolean; checagens: ChecagemDoTreino[]; cobertura: number } {
  const c: ChecagemDoTreino[] = [];
  const d = m.duracaoSec;
  c.push(
    d < SEGUNDOS_MINIMOS_DO_TREINO
      ? { id: "duracao", resultado: "erro", texto: `O vídeo tem ${duracaoFalada(d)}. Precisamos de pelo menos ${SEGUNDOS_MINIMOS_DO_TREINO} s: leia o texto inteiro, até o fim.` }
      : { id: "duracao", resultado: "ok", texto: `Duração: ${duracaoFalada(d)}.` }
  );

  const r = m.rosto;
  if (r.comVarios > 0) c.push({ id: "rosto", resultado: "erro", texto: "Aparece mais de uma pessoa no vídeo. Grave sozinho no quadro." });
  else if (r.comRosto < Math.ceil(r.quadros * 0.75))
    c.push({
      id: "rosto",
      resultado: "erro",
      texto: `O seu rosto apareceu em ${r.comRosto} de ${r.quadros} momentos. Fique de frente para a câmera o tempo todo, com luz no rosto.`,
    });
  else if (r.virados > 1) c.push({ id: "rosto", resultado: "aviso", texto: "Em alguns momentos o rosto ficou virado. Olhe para a lente enquanto lê." });
  else c.push({ id: "rosto", resultado: "ok", texto: "Rosto visível, de frente, só você no quadro." });

  const a = m.audio;
  const ruido = a.ruidoDb ?? -120;
  const pico = a.picoDb ?? -99;
  if (a.falaDb === null || a.falaDb < -38 || a.falaPct < 40)
    c.push({ id: "audio", resultado: "erro", texto: "Quase não ouvimos a sua voz. Fale mais perto do microfone, em voz alta." });
  else if (ruido > -42)
    c.push({ id: "audio", resultado: "erro", texto: "Tem barulho de fundo alto (ventilador, rua, música). Grave num lugar mais silencioso." });
  else if (ruido > -50 || pico >= -0.1)
    c.push({
      id: "audio",
      resultado: "aviso",
      texto:
        pico >= -0.1
          ? "A voz estourou em alguns trechos. Fale um pouco mais longe do microfone."
          : "Dá para ouvir um pouco de ruído de fundo. Se puder, grave num lugar mais quieto.",
    });
  else c.push({ id: "audio", resultado: "ok", texto: "Áudio limpo." });

  const cobertura = coberturaDaLeitura(transcricao, texto);
  const aut = conferirFalaDaAutorizacao(transcricao, nome);
  if (!aut.ok)
    c.push({ id: "leitura", resultado: "erro", texto: `Não ouvimos ${aut.faltou.join(" e ")}. A autorização no começo do texto precisa ser lida inteira.` });
  else if (cobertura < 0.7)
    c.push({
      id: "leitura",
      resultado: "erro",
      texto: `A fala bateu com ${Math.round(cobertura * 100)}% do texto. Leia o texto inteiro, do jeito que ele rola na tela.`,
    });
  else c.push({ id: "leitura", resultado: "ok", texto: `A fala bateu com ${Math.round(cobertura * 100)}% do texto, com a autorização inteira.` });

  return { ok: c.every((x) => x.resultado !== "erro"), checagens: c, cobertura };
}

// ─────────────────────────────── os cenários (03/10) ───────────────────────────────

/**
 * O GÊMEO EM CENÁRIOS (03/10/2026): a pessoa não fala só de frente para a
 * câmera; o roteiro pode pô-la sentada à mesa, em pé num palco, no escritório.
 *
 * CENÁRIO PROFISSIONAL (04/10/2026). O Bruno viu o primeiro vídeo com
 * cenários e reclamou de "fundo feio" (o corredor de casa do vídeo de treino)
 * e de uma "estampa na minha camisa" que ele não usa: o gerador inventou o
 * resto da roupa abaixo do recorte. Regra dele: a plataforma é profissional e
 * sempre gera vídeo profissional, cuidando do cenário. Daí três textos por
 * cenário:
 *
 *   fundo     o CENÁRIO SEM PESSOA (inglês, para o gerador de imagem), que
 *             entra ATRÁS do gêmeo treinado: na HeyGen, o gêmeo é recortado do
 *             fundo original (`remove_background`) e posto sobre esta imagem.
 *             A pessoa, a roupa e os gestos são os do vídeo de treino, sem
 *             nada inventado; só o fundo muda. É o caminho padrão;
 *   prompt    a PESSOA no cenário (inglês), para quando a imagem inteira é
 *             gerada: o look por prompt da HeyGen (GEMEO_HEYGEN_CENARIO=look)
 *             e a composição da reserva (OmniHuman). Diz e repete a mesma
 *             roupa, lisa, sem estampa, sem logo, sem texto;
 *   movimento o que acompanha o pedido do vídeo (onde o gerador aceita).
 *
 * Toda imagem gerada passa pela conferência por visão antes de ser usada
 * (`lib/media/gemeo-conferencia.ts`): fundo sóbrio, sem texto, sem estampa,
 * mesma roupa e mesmo rosto do treino. Reprovada não entra: o pedaço cai no
 * close do treino.
 */
export type IdDoCenario = "camera" | "mesa" | "palco" | "escritorio" | "estudio" | "sala";

export type Cenario = {
  id: IdDoCenario;
  nome: string;
  plano: "close" | "médio" | "aberto";
  /** Palavras que, no roteiro, pedem este cenário. */
  sinais: string[];
  /** O cenário sem pessoa, para pôr atrás do gêmeo treinado. */
  fundo: string;
  /** A pessoa no cenário, para gerar a imagem inteira (look ou composição). */
  prompt: string;
  movimento: string;
};

/**
 * A MESMA PESSOA E A MESMA ROUPA. A roupa é dita duas vezes, e as proibições
 * por extenso: o gerador inventou estampa onde a imagem de referência não
 * mostrava a camiseta inteira, e "same clothes" sozinho não segurou.
 */
const MESMA_PESSOA =
  "Keep the exact same person from the reference: same face, same identity, same hair, same beard, same skin tone, same body. " +
  "Same clothes as in the reference, unchanged: same garment, same color, same neckline. The garment is plain: no print, no graphic, no logo, no text, no pattern, no badge. " +
  "Photorealistic photo, natural skin texture, shot on a full-frame camera.";

/** O cenário sóbrio, dito para os dois usos (com e sem pessoa). */
const SOBRIO =
  "Sober, professional and tidy, soft even flattering light. No text, no letters, no signs, no logos, no posters, no screens showing content, no other people, no odd objects.";

/** O fundo sem pessoa: desfocado como numa câmera de cinema, sem nada que puxe o olho. */
const FUNDO = `Empty background plate, no people in frame. Shallow depth of field, strongly out of focus, gentle bokeh. ${SOBRIO}`;

export const CENARIOS: Cenario[] = [
  {
    id: "camera",
    nome: "Falando para a câmera",
    plano: "close",
    sinais: [],
    // 04/10: cinza médio e claro, luz por igual; o carvão da primeira prova
    // saiu escuro, com vinheta, e a conferência reprovou.
    fundo: `Professional video studio backdrop for a talking-head video: smooth seamless backdrop in a soft medium warm gray, evenly lit with a gentle lighter glow behind where the speaker stands, no dark vignette. ${FUNDO}`,
    prompt: `Head-and-shoulders shot of this person facing the camera and talking, in a professional video studio with a smooth charcoal-gray seamless backdrop, softly out of focus, soft key light. ${MESMA_PESSOA} ${SOBRIO}`,
    movimento: INSTRUCAO_DO_GERADOR,
  },
  {
    id: "mesa",
    nome: "Sentado à mesa",
    plano: "médio",
    sinais: ["mesa", "sentado", "sentada", "reunião", "notebook"],
    fundo: `Modern, well-lit home office seen at seated eye level: bookshelf with neatly arranged books in neutral tones, a green plant, soft daylight from a side window. ${FUNDO}`,
    prompt: `Medium shot of this person sitting at a clean wooden desk in a modern, well-lit office, facing the camera and talking, hands resting on the desk, a bookshelf with neutral-toned books softly blurred behind. ${MESMA_PESSOA} ${SOBRIO}`,
    movimento: "A pessoa, sentada à mesa, fala para a câmera com gestos naturais das mãos sobre a mesa. Câmera parada. Sem texto na imagem.",
  },
  {
    id: "palco",
    nome: "Em pé num palco",
    plano: "aberto",
    sinais: ["palco", "palestra", "plateia", "evento", "auditório"],
    fundo: `Conference stage seen from the audience at eye level: dark elegant stage, soft warm spotlights and a subtle blue ambient glow, out-of-focus bokeh lights. ${FUNDO}`,
    prompt: `Medium shot of this person standing on a conference stage, facing the camera and talking, soft warm stage spotlights, dark elegant background with out-of-focus bokeh lights. ${MESMA_PESSOA} ${SOBRIO}`,
    movimento: "A pessoa, em pé no palco, fala para a plateia e para a câmera, com gestos amplos e confiantes. Câmera parada. Sem texto na imagem.",
  },
  {
    id: "escritorio",
    nome: "No escritório",
    plano: "médio",
    sinais: ["escritório", "empresa", "time", "equipe"],
    fundo: `Bright modern office: glass walls, light wood, green plants, soft daylight, calm and clean. ${FUNDO}`,
    prompt: `Medium shot of this person standing in a bright modern office, facing the camera and talking, glass walls and plants softly blurred behind, soft daylight. ${MESMA_PESSOA} ${SOBRIO}`,
    movimento: "A pessoa, em pé no escritório, fala para a câmera com gestos naturais. Câmera parada. Sem texto na imagem.",
  },
  {
    id: "estudio",
    nome: "Estúdio de podcast",
    plano: "médio",
    sinais: ["podcast", "microfone", "estúdio", "entrevista"],
    fundo: `Professional podcast and video studio: dark acoustic wall panels, warm practical lamps, soft key light, no microphone in the foreground. ${FUNDO}`,
    prompt: `Medium shot of this person sitting in a professional podcast studio, facing the camera and talking, dark acoustic panels and warm practical lights softly blurred behind. ${MESMA_PESSOA} ${SOBRIO}`,
    movimento: "A pessoa, sentada no estúdio, fala olhando para a câmera, com gestos discretos. Câmera parada. Sem texto na imagem.",
  },
  {
    id: "sala",
    nome: "Na sala de casa",
    plano: "médio",
    sinais: ["casa", "sofá", "família"],
    fundo: `Tidy, elegant living room: neutral sofa, a green plant, a warm lamp, soft natural light, no picture frames. ${FUNDO}`,
    prompt: `Medium shot of this person sitting on a neutral sofa in a tidy, elegant living room, facing the camera and talking, a plant and a warm lamp softly blurred behind. ${MESMA_PESSOA} ${SOBRIO}`,
    movimento: "A pessoa, sentada no sofá, conversa com a câmera de um jeito descontraído. Câmera parada. Sem texto na imagem.",
  },
];

export const cenarioPorId = (id?: string | null): Cenario => CENARIOS.find((c) => c.id === id) ?? CENARIOS[0];

/** "auto" escolhe pelo roteiro; um id fixa o mesmo cenário no vídeo inteiro. */
export type EscolhaDeCenario = "auto" | IdDoCenario;

/**
 * O CENÁRIO DE CADA CENA, pelo roteiro. O que a cena diz manda: "No palco,
 * ..." na fala, ou "pessoa sentada à mesa" no que aparece na tela, escolhe o
 * cenário. Sem sinal, a ordem de um vídeo de quem sabe gravar: o gancho de
 * frente, em close (é o que segura o scroll), o desenvolvimento num plano
 * médio, e o fechamento de volta ao close, olho no olho. Cenas de
 * desenvolvimento seguidas alternam o plano, para o corte de uma para a
 * outra não parecer pulo.
 */
export function cenariosDasCenas(
  cenas: Array<{ fala?: string | null; naTela?: string | null; papel?: string | null }>,
  escolha: EscolhaDeCenario = "auto",
  base: IdDoCenario = "mesa"
): IdDoCenario[] {
  if (escolha !== "auto") return cenas.map(() => escolha);
  const alternado: IdDoCenario[] = [base, "camera"];
  let meio = 0;
  return cenas.map((c, i) => {
    const t = ` ${semAcento(`${c.naTela ?? ""} ${c.fala ?? ""}`).replace(/[^a-z0-9]+/g, " ")} `;
    const pedido = CENARIOS.find((x) => x.sinais.some((s) => t.includes(` ${semAcento(s)} `)));
    if (pedido) return pedido.id;
    const papel = c.papel ?? (i === 0 ? "gancho" : i === cenas.length - 1 ? "fechamento" : "desenvolvimento");
    if (papel === "gancho" || papel === "fechamento" || cenas.length === 1) return "camera";
    return alternado[meio++ % 2];
  });
}

/** Uma cena com o seu cenário, como o pedido do vídeo chega ao servidor. */
export type CenaDoGemeo = { texto: string; cenario: IdDoCenario };

/**
 * As cenas em pedaços: cada cena é dividida como o texto inteiro era
 * (fim de frase, abaixo do teto), e cada pedaço leva o cenário da sua cena.
 * Cenas seguidas no MESMO cenário se juntam antes de dividir, para não
 * criar pedaço curto à toa.
 */
export function pedacosDasCenas(cenas: CenaDoGemeo[]): Array<{ texto: string; cenario: IdDoCenario }> {
  const juntas: CenaDoGemeo[] = [];
  for (const c of cenas) {
    const texto = limparTexto(c.texto);
    if (!texto) continue;
    const ultima = juntas[juntas.length - 1];
    if (ultima && ultima.cenario === c.cenario) ultima.texto = `${ultima.texto} ${texto}`;
    else juntas.push({ texto, cenario: c.cenario });
  }
  return juntas.flatMap((c) => dividirEmPedacos(c.texto).map((texto) => ({ texto, cenario: c.cenario })));
}

// ─────────────────────────────── os tipos ───────────────────────────────

/** Uma foto enviada pelo cliente. */
export type FotoDoGemeo = { url: string; nome?: string | null; enviadaEm: string };

/** A avaliação que o worker deu a cada foto (gemeo-rosto.py). */
export type AvaliacaoDaFoto = {
  indice: number;
  rosto: boolean;
  varios?: boolean;
  nota?: number;
  motivo?: string;
};

/**
 * A foto que vai para o gerador: a melhor das enviadas, recortada no rosto.
 *   preparando  o worker ainda não olhou as fotos atuais;
 *   pronta      recortada (url);
 *   recusada    nenhuma foto serviu (motivo e avaliação de cada uma);
 *   falhou      o worker não respondeu (tenta de novo sozinho).
 */
export type FotoDoGerador = {
  estado: "preparando" | "pronta" | "recusada" | "falhou";
  desde: string;
  /** Assinatura das fotos que geraram este estado: foto nova recomeça. */
  origem: string;
  url?: string | null;
  escolhida?: number | null;
  avaliacoes?: AvaliacaoDaFoto[];
  motivo?: string | null;
  tentativas?: number;
};

/**
 * A voz:
 *   convertendo     a amostra chegou e o worker mede e converte para MP3;
 *   curta           a amostra tem menos de SEGUNDOS_MINIMOS_DA_VOZ;
 *   esperando       pronta para clonar, mas a autorização ainda não valeu
 *                   (nada é clonado antes da autorização);
 *   clonando        na fila do passo do cron;
 *   sem-permissao   a chave da ElevenLabs não tem a permissão de vozes; tenta
 *                   de novo sozinho a cada 30 min, e funciona quando liberar;
 *   pronta          clonada (voiceId);
 *   falhou          erro do fornecedor (tenta de novo até 3 vezes).
 */
export type VozDoGemeo = {
  estado: "convertendo" | "curta" | "esperando" | "clonando" | "sem-permissao" | "pronta" | "falhou";
  desde: string;
  origem: "gravada" | "arquivo" | "treino";
  amostraUrl: string;
  contentType?: string | null;
  mp3Url?: string | null;
  segundos?: number | null;
  voiceId?: string | null;
  clonadaEm?: string | null;
  motivo?: string | null;
  tentativas?: number;
  ultimaTentativa?: string | null;
  /**
   * 04/10: a AMOSTRA PARA OUVIR, a voz clonada falando uma frase curta, já
   * acelerada e nivelada como sai no vídeo. É o que a pessoa ouve antes de
   * aprovar (store privado).
   */
  previaUrl?: string | null;
  previaTentativas?: number;
  /** 04/10: quando a pessoa aprovou ESTA voz (ela vira a `vozAprovada`). */
  aprovadaEm?: string | null;
};

/**
 * A VOZ APROVADA (04/10/2026): a única que os vídeos usam. O Bruno aprovou em
 * 01/10 uma voz clonada de 4 min de fala natural; o vídeo de treino de 03/10
 * (1 min LENDO um texto) clonou outra por cima, apagou a aprovada, e o vídeo
 * seguinte saiu com uma voz que ele não reconheceu. Daí:
 *
 *  - a voz clonada (`voz`) é só CANDIDATA até a pessoa ouvir a amostra e
 *    aprovar; os vídeos só saem com uma voz aprovada;
 *  - o vídeo de treino NÃO substitui a voz aprovada: ele clona uma voz só
 *    quando ainda não há aprovada;
 *  - uma amostra nova (melhorar a voz) vira candidata, e a aprovada continua
 *    valendo até a nova ser aprovada.
 */
export type VozAprovada = {
  voiceId: string;
  aprovadaEm: string;
  origem: VozDoGemeo["origem"];
  amostraUrl?: string | null;
  segundos?: number | null;
  previaUrl?: string | null;
};

/**
 * A autorização gravada:
 *   conferindo  a gravação chegou; o passo transcreve e confere a frase;
 *   valida      a frase foi dita (data, texto e transcrição guardados);
 *   recusada    não ouvimos o nome ou o "autorizo" (motivo).
 */
export type AutorizacaoDoGemeo = {
  estado: "conferindo" | "valida" | "recusada";
  desde: string;
  videoUrl: string;
  contentType?: string | null;
  nome: string;
  texto: string;
  gravadaEm: string;
  segundos?: number | null;
  userId: string;
  userAgent?: string | null;
  transcricao?: string | null;
  motivo?: string | null;
  tentativas?: number;
};

/**
 * O vídeo de treino (03/10):
 *   preparando  o worker normaliza, tira voz, quadros e mede rosto e áudio;
 *   conferindo  medido; falta a transcrição bater com o texto;
 *   valido      passou nas quatro checagens: virou foto, voz e autorização;
 *   recusado    alguma checagem reprovou (as checagens dizem qual e por quê);
 *   falhou      o worker ou a transcrição não responderam 3 vezes.
 */
export type TreinoDoGemeo = {
  estado: "preparando" | "conferindo" | "valido" | "recusado" | "falhou";
  desde: string;
  /** A gravação original, como veio do navegador (é a prova da autorização). */
  videoUrl: string;
  contentType?: string | null;
  nome: string;
  /** O texto que estava na tela, montado pelo servidor (vale como prova). */
  texto: string;
  gravadoEm: string;
  userId: string;
  userAgent?: string | null;
  segundosNaTela?: number | null;
  /** O que o worker produziu (store privado). */
  arquivos?: { video: string; voz: string; referencia: string; foto: string | null; quadro: string | null } | null;
  medidas?: MedidasDoTreino | null;
  transcricao?: string | null;
  checagens?: ChecagemDoTreino[] | null;
  motivo?: string | null;
  tentativas?: number;
};

/**
 * O gêmeo TREINADO no fornecedor (03/10, HeyGen):
 *   enviando        o vídeo de treino está subindo;
 *   treinando       o fornecedor aprende rosto, gesto e voz (minutos);
 *   consentimento   falta a pessoa confirmar no link do fornecedor (a conta
 *                   avulsa da HeyGen exige a confirmação gravada na página
 *                   deles; Enterprise aceita o nosso vídeo);
 *   pronto          pode gerar;
 *   falhou          o fornecedor recusou (motivo); o gêmeo segue pela reserva.
 */
export type AvatarDoGemeo = {
  gerador: IdDoGerador;
  estado: "enviando" | "treinando" | "consentimento" | "pronto" | "falhou";
  desde: string;
  /** O vídeo de treino que gerou este avatar: treino novo recomeça. */
  origem: string;
  avatarId?: string | null;
  grupoId?: string | null;
  consentimentoUrl?: string | null;
  consentimentoAte?: string | null;
  motivo?: string | null;
  tentativas?: number;
  ultimaTentativa?: string | null;
};

/**
 * Um cenário pronto para um gerador: a imagem composta (OmniHuman), o look
 * (HeyGen, GEMEO_HEYGEN_CENARIO=look) ou o FUNDO que vai atrás do gêmeo
 * treinado (HeyGen, o padrão desde 04/10: `url` no nosso store e `assetId` na
 * HeyGen). `conferencia` é o parecer da visão (`gemeo-conferencia.ts`).
 */
export type CenarioPronto = {
  estado: "compondo" | "pronto" | "falhou";
  desde: string;
  /** O quadro (ou avatar) de onde saiu: treino novo recomeça. */
  origem: string;
  url?: string | null;
  lookId?: string | null;
  assetId?: string | null;
  conferencia?: { aprovado: boolean; motivos: string[] } | null;
  motivo?: string | null;
  tentativas?: number;
};

export type CadastroDoGemeo = {
  versao: 1;
  criadoEm: string;
  fotos: FotoDoGemeo[];
  foto?: FotoDoGerador | null;
  voz?: VozDoGemeo | null;
  /** 04/10: a voz que a pessoa ouviu e aprovou; a única que os vídeos usam. */
  vozAprovada?: VozAprovada | null;
  autorizacao?: AutorizacaoDoGemeo | null;
  /** 03/10: o vídeo único de treino, que preenche foto, voz e autorização. */
  treino?: TreinoDoGemeo | null;
  /** 03/10: o gêmeo treinado no fornecedor recomendado. */
  avatar?: AvatarDoGemeo | null;
  /** 03/10: os cenários já compostos, por "gerador:cenário". */
  cenarios?: Record<string, CenarioPronto> | null;
};

/** O que falta para o gêmeo poder gerar vídeo, em frases para a tela. */
export function oQueFalta(c: CadastroDoGemeo | null | undefined): string[] {
  const falta: string[] = [];
  // O CAMINHO NOVO (03/10): um vídeo só. Enquanto ele não vale, é a única
  // coisa que falta; depois, a clonagem da voz (que sai dele).
  if (c?.treino || !c?.fotos?.length) {
    if (!c?.treino) return ["o seu vídeo de treino"];
    if (c.treino.estado !== "valido") return ["a conferência do vídeo de treino"];
    if (!c.vozAprovada) falta.push(c.voz?.estado === "pronta" ? "ouvir e aprovar a sua voz" : "a clonagem da sua voz");
    if (c.foto?.estado !== "pronta") falta.push("a imagem do gêmeo");
    return falta;
  }
  if (c.foto?.estado !== "pronta") falta.push("a foto do gerador");
  if (!c?.vozAprovada) {
    if (!c?.voz) falta.push("a amostra da sua voz");
    else if (c.voz.estado !== "pronta") falta.push("a clonagem da sua voz");
    else falta.push("ouvir e aprovar a sua voz");
  }
  if (!c?.autorizacao) falta.push("a sua autorização gravada");
  else if (c.autorizacao.estado !== "valida") falta.push("a conferência da autorização");
  return falta;
}

export function gemeoAtivo(c: CadastroDoGemeo | null | undefined): boolean {
  return oQueFalta(c).length === 0;
}

/** Um pedaço do vídeo: o texto, a fala e o pedido ao gerador. */
export type PedacoDoGemeo = {
  texto: string;
  /** 03/10: o cenário deste pedaço (ausente nos pedidos antigos: "camera"). */
  cenario?: IdDoCenario | null;
  /** A fala deste pedaço, no store privado. */
  audioUrl?: string | null;
  segundos?: number | null;
  caracteres?: number | null;
  /**
   * 04/10: a fala já preparada pelo worker (acelerada 7%, nivelada, WAV 48
   * kHz): o gerador anima a boca na velocidade final e a junção usa este som.
   * Ausente nos pedidos antigos (MP3 cru, acelerado na junção).
   */
  preparada?: boolean | null;
  /** O áudio já no armazenamento do fal (o gerador só lê de lá ou de URL pública). */
  falAudioUrl?: string | null;
  requestId?: string | null;
  statusUrl?: string | null;
  responseUrl?: string | null;
  status?: string | null;
  enviadoEm?: string | null;
  /** O vídeo pronto, na URL do fal (temporária: o worker baixa ao juntar). */
  videoUrl?: string | null;
  duracaoDoVideo?: number | null;
  /**
   * 04/10: a CONFERÊNCIA do cenário no pedaço pronto (o quadro que o gerador
   * devolveu, contra o vídeo de treino). Reprovado é refeito no close.
   */
  conferencia?: { aprovado: boolean; motivos: string[] } | null;
  tentativas?: number;
  erro?: string | null;
};

/**
 * Um vídeo do gêmeo, do pedido à esteira:
 *   na-fila     pedido e créditos reservados; nada pago ainda;
 *   falando     a voz de cada pedaço e o envio ao gerador (passo do cron);
 *   gerando     o OmniHuman trabalhando (uns 8 min por pedaço, em paralelo);
 *   juntando    o worker emenda os pedaços;
 *   juntado     o MP4 final existe; falta criar o vídeo na esteira;
 *   na-esteira  virou um VideoJob, que segue como qualquer gravação;
 *   falhou / cancelada: terminais, com os créditos devolvidos.
 */
export type EstadoDoVideoDoGemeo =
  | "na-fila"
  | "falando"
  | "gerando"
  | "juntando"
  | "juntado"
  | "na-esteira"
  | "falhou"
  | "cancelada";

export type VideoDoGemeo = {
  id: string;
  estado: EstadoDoVideoDoGemeo;
  desde: string;
  criadoEm: string;
  userId: string;
  titulo: string;
  texto: string;
  roteiroId?: string | null;
  segundosEstimados: number;
  creditosReservados: number;
  creditosCobrados?: number | null;
  creditosDevolvidos?: number | null;
  /** A foto do gerador no momento do pedido (o cadastro pode mudar depois). */
  fotoUrl: string;
  falFotoUrl?: string | null;
  /** 03/10: quem gera (ausente nos pedidos antigos: "omnihuman"). */
  gerador?: IdDoGerador | null;
  /** 03/10: o avatar treinado usado (HeyGen). */
  avatarId?: string | null;
  /**
   * 03/10: a imagem (OmniHuman) ou o look (HeyGen) de cada cenário deste
   * vídeo, já do lado do fornecedor, para não subir duas vezes.
   */
  imagensDoGerador?: Partial<Record<IdDoCenario, string>> | null;
  voiceId: string;
  pedacos: PedacoDoGemeo[];
  /**
   * 04/10: a fala deste vídeo vai CRUA ao gerador e é acelerada na junção
   * (pedido que já estava andando antes da fala preparada, ou worker antigo).
   */
  falaCrua?: boolean | null;
  segundosDaFala?: number | null;
  finalUrl?: string | null;
  finalBytes?: number | null;
  finalSegundos?: number | null;
  videoJobId?: string | null;
  tentativasDeJuncao?: number;
  proximaTentativa?: string | null;
  motivo?: string | null;
};

/** O vídeo ainda está andando (a tela continua perguntando). */
export function videoEmAndamento(v: Pick<VideoDoGemeo, "estado">): boolean {
  return !["na-esteira", "falhou", "cancelada"].includes(v.estado);
}

// ─────────────────────────────── o que a tela recebe ───────────────────────────────

/** O vídeo do gêmeo como a tela vê: sem as URLs internas dos fornecedores. */
export type VideoNaTela = {
  id: string;
  estado: EstadoDoVideoDoGemeo;
  desde: string;
  criadoEm: string;
  titulo: string;
  segundosEstimados: number;
  segundosDaFala: number | null;
  creditosReservados: number;
  creditosCobrados: number | null;
  creditosDevolvidos: number | null;
  pedacos: number;
  pedacosProntos: number;
  videoJobId: string | null;
  motivo: string | null;
  gerador: IdDoGerador;
  cenarios: IdDoCenario[];
};

export function videoParaTela(v: VideoDoGemeo): VideoNaTela {
  return {
    id: v.id,
    estado: v.estado,
    desde: v.desde,
    criadoEm: v.criadoEm,
    titulo: v.titulo,
    segundosEstimados: v.segundosEstimados,
    segundosDaFala: v.segundosDaFala ?? null,
    creditosReservados: v.creditosReservados,
    creditosCobrados: v.creditosCobrados ?? null,
    creditosDevolvidos: v.creditosDevolvidos ?? null,
    pedacos: v.pedacos.length,
    pedacosProntos: v.pedacos.filter((p) => p.videoUrl).length,
    videoJobId: v.videoJobId ?? null,
    motivo: v.motivo ?? null,
    gerador: v.gerador ?? "omnihuman",
    cenarios: [...new Set(v.pedacos.map((p) => p.cenario ?? "camera"))],
  };
}

/** O cadastro como a tela vê: sem o id da voz, sem ids do fornecedor e sem a fila de vozes a apagar. */
export function cadastroParaTela(
  c: (CadastroDoGemeo & { vozesParaApagar?: string[]; avataresParaApagar?: unknown[] }) | null
): CadastroDoGemeo | null {
  if (!c) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { vozesParaApagar, avataresParaApagar, ...resto } = c;
  return {
    ...resto,
    voz: resto.voz ? { ...resto.voz, voiceId: resto.voz.voiceId ? "pronta" : null } : null,
    vozAprovada: resto.vozAprovada ? { ...resto.vozAprovada, voiceId: "aprovada" } : null,
    avatar: resto.avatar ? { ...resto.avatar, avatarId: resto.avatar.avatarId ? "pronto" : null, grupoId: null } : null,
    cenarios: resto.cenarios
      ? Object.fromEntries(Object.entries(resto.cenarios).map(([k, v]) => [k, { ...v, lookId: null, assetId: null }]))
      : null,
  };
}
