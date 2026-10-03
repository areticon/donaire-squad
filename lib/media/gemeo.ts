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

/**
 * A RESERVA: a fala só existe depois da voz gerada, e a voz pode sair mais
 * lenta que a régua. Reservamos 15% acima da estimativa, cobramos o tempo
 * REAL da fala e devolvemos a diferença na mesma hora. O cliente nunca paga
 * mais do que viu na tela; se a fala passar da reserva, a diferença é nossa.
 */
export const FOLGA_DA_RESERVA = 1.15;

export function creditosDoGemeo(segundos: number): number {
  return Math.ceil(Math.max(0, segundos)) * CREDITOS_POR_SEGUNDO_DE_GEMEO;
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

export function precoDoRoteiro(texto: string): PrecoDoRoteiro {
  const segundos = estimarSegundos(texto);
  return {
    segundos,
    creditosEstimados: creditosDoGemeo(segundos),
    creditosReservados: creditosDoGemeo(segundos * FOLGA_DA_RESERVA),
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
  origem: "gravada" | "arquivo";
  amostraUrl: string;
  contentType?: string | null;
  mp3Url?: string | null;
  segundos?: number | null;
  voiceId?: string | null;
  clonadaEm?: string | null;
  motivo?: string | null;
  tentativas?: number;
  ultimaTentativa?: string | null;
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

export type CadastroDoGemeo = {
  versao: 1;
  criadoEm: string;
  fotos: FotoDoGemeo[];
  foto?: FotoDoGerador | null;
  voz?: VozDoGemeo | null;
  autorizacao?: AutorizacaoDoGemeo | null;
};

/** O que falta para o gêmeo poder gerar vídeo, em frases para a tela. */
export function oQueFalta(c: CadastroDoGemeo | null | undefined): string[] {
  const falta: string[] = [];
  if (!c?.fotos?.length) falta.push("as suas fotos");
  else if (c.foto?.estado !== "pronta") falta.push("a foto do gerador");
  if (!c?.voz) falta.push("a amostra da sua voz");
  else if (c.voz.estado !== "pronta") falta.push("a clonagem da sua voz");
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
  /** A fala deste pedaço, no store privado. */
  audioUrl?: string | null;
  segundos?: number | null;
  caracteres?: number | null;
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
  voiceId: string;
  pedacos: PedacoDoGemeo[];
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
  };
}

/** O cadastro como a tela vê: sem o id da voz e sem a fila de vozes a apagar. */
export function cadastroParaTela(c: (CadastroDoGemeo & { vozesParaApagar?: string[] }) | null): CadastroDoGemeo | null {
  if (!c) return null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { vozesParaApagar, ...resto } = c;
  return { ...resto, voz: resto.voz ? { ...resto.voz, voiceId: resto.voz.voiceId ? "pronta" : null } : null };
}
