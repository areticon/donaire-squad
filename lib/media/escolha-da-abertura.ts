import { askClaude } from "@/lib/claude";
import { bibliaDoEstilo } from "@/lib/media/biblias";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import {
  ajustarMomento,
  escolherMomentos,
  montarMomento,
  REGRAS_DA_ABERTURA,
  type AberturaDoCompleto,
  type GanchoDoCorte,
  type MomentoDaAbertura,
} from "@/lib/media/abertura-do-roteiro";

/**
 * O DIRETOR ESCOLHE OS MELHORES MOMENTOS (01/10/2026), pela transcrição. Uma
 * chamada para a abertura do completo e uma para os ganchos de todos os cortes
 * planejados, em paralelo com o resto do roteiro. Escolher frase é
 * julgamento: esforço médio (o alto não muda a escolha e custa o triplo,
 * medido na escolha de ganchos de 23/08). A parte pura (bordas, ajuste,
 * trocar) está em lib/media/abertura-do-roteiro.ts.
 */

/** Nota mínima do diretor para um momento ENTRAR na abertura (abaixo, só reserva). */
const MIN_FORCA = 7;

/**
 * Saudação, despedida, bênção de encerramento, pedido de inscrição ou de
 * curtida, frase de transição (01/10). Conferido no texto do momento e no
 * soco, sem acento e em minúsculas.
 */
const FRACOS = new RegExp(
  [
    "\\b(ola|oi|fala|e ai),? (pessoal|galera|gente|amigos|turma)\\b",
    "\\bbom dia\\b", "\\bboa tarde\\b", "\\bboa noite\\b", "\\bsejam? bem.?vind",
    "\\btchau\\b", "\\bate (a proxima|logo|mais)\\b", "\\bum (grande )?abraco\\b", "\\bbeijos?\\b", "\\bvaleu\\b",
    "\\bobrigad[oa] por (assistir|ver|ficar)\\b", "\\bpor hoje (e|eh) (so|isso)\\b", "\\b(entao|e) (e|eh) isso\\b",
    "\\bdeus (te |vos |os |lhes )?abencoe", "\\bfiquem? com deus\\b", "\\bamem\\b", "\\bem nome de jesus\\b",
    "\\binscrev", "\\bsininho\\b", "\\b(deixa|deixe|da|de) (o |um |seu )?(like|joinha|curtida)\\b", "\\bcompartilh(a|e) (esse|este) video\\b",
    "\\b(entao )?vamos (la|comecar)\\b", "\\bbora (la|comecar)\\b", "\\bantes de (comecar|mais nada)\\b", "\\bsem mais delongas\\b",
  ].join("|")
);

export function momentoFraco(texto: string, soco?: string | null): boolean {
  const n = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9\s.]/g, " ").replace(/\s+/g, " ");
  return FRACOS.test(n(texto)) || (soco ? FRACOS.test(n(soco)) : false);
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** A fala em linhas de frase, cada palavra com o índice ("0:42 | 120:Eu 121:levei"). */
function falaNumerada(palavras: PalavraNoCorte[]): string {
  const linhas: string[] = [];
  let atual: string[] = [];
  let inicio = 0;
  palavras.forEach((p, i) => {
    if (!atual.length) inicio = p.inicio;
    atual.push(`${i}:${p.texto}`);
    const pausa = (palavras[i + 1]?.inicio ?? Infinity) - p.fim;
    if (/[.!?]$/.test(p.texto) || pausa > 0.7 || atual.length >= 28) {
      linhas.push(`${mmss(inicio)} | ${atual.join(" ")}`);
      atual = [];
    }
  });
  if (atual.length) linhas.push(`${mmss(inicio)} | ${atual.join(" ")}`);
  return linhas.join("\n");
}

/**
 * A ABERTURA POR ESTILO (01/10, decisão do Bruno). Até aqui todo completo
 * abria com o trailer de cortes rápidos do MrBeast, inclusive o de telejornal
 * e o de igreja. Agora a bíblia do estilo diz o tipo (trailer, frase-tese,
 * pergunta, teaser calmo, promessa), a duração de cada momento e da abertura
 * inteira, e se ela já vem ligada. A passagem visual por estilo (fusão no
 * lugar do flash) é do worker, na Fase 2b; até lá, os estilos de passagem por
 * fusão vêm com a abertura DESLIGADA (o cliente liga na tela se quiser).
 */
function sistemaDoCompleto(estiloId?: string | null): string {
  const b = bibliaDoEstilo(estiloId);
  const a = b.abertura;
  const [min, max] = a.momentoSeg;
  const palavras = Math.max(8, Math.round(max * 2.8));
  const candidatos = a.tipo === "trailer" ? 14 : 8;
  const abre =
    a.tipo === "trailer"
      ? `Você é o editor de abertura de um canal grande do YouTube (escola MrBeast): o vídeo começa com os MELHORES MOMENTOS do próprio vídeo, frases inteiras e curtas de ${min} a ${max} segundos, em ritmo rápido, antes do conteúdo. É o trailer: quem chega decide em 3 segundos se fica.`
      : `Você é o editor de abertura de um vídeo na linguagem ${b.nome}. A abertura deste estilo: ${a.descricao} Cada momento dura de ${min} a ${max} segundos e a abertura inteira fica perto de ${a.totalAlvoSeg} s.`;
  return `${abre}

Você recebe o tema do vídeo e a fala inteira, cada palavra com o índice. Escolha ${candidatos} momentos candidatos, do mais forte para o menos forte.

Um bom momento de abertura:
1. Está ligado ao TEMA PRINCIPAL do vídeo (não a um desvio).
2. É uma frase forte que se sustenta sozinha: ${a.tipo === "pergunta" ? "a PERGUNTA que o vídeo responde, ou o que está em jogo," : a.tipo === "promessa" ? "a PROMESSA do vídeo (de preferência com número)," : "uma afirmação que contraria o senso comum, um número, uma promessa, uma virada, uma emoção,"} nunca "então", "bom, gente", "como eu falei", pergunta retórica fraca ou frase que depende do contexto anterior.
3. É uma FRASE INTEIRA: começa no INÍCIO de uma frase (logo depois de um ponto ou de uma pausa) e termina no FIM dela (no ponto final), de ${min} a ${max} segundos falada, NO MÁXIMO ${palavras} palavras. Nunca um pedaço de frase: "que era a empresa deles, eles tinham" e "E isso não é colocar" estão errados. Se a frase inteira passa do tempo, escolha outra frase; o código descarta pedaço de frase.`;
}

const SISTEMA_DO_COMPLETO_FIM = `
4. Os momentos vêm de partes DIFERENTES do vídeo; nunca dois da mesma frase.
5. Evite os trechos em que a pessoa só lê o que está na tela.
6. Cada momento traz uma ideia DIFERENTE: dois momentos sobre a mesma palavra (dois "estagiário") cansam.
7. NUNCA escolha saudação ("olá", "bom dia, pessoal"), despedida ("tchau", "até a próxima"), bênção de encerramento ("Deus abençoe vocês", "amém"), pedido de inscrição, curtida ou compartilhamento, nem frase de transição ("então vamos lá", "antes de começar"). Nem os primeiros segundos nem o fim do vídeo, onde moram as saudações e as despedidas.
8. Dê a cada momento uma "forca" de 1 a 10 (10 = prende qualquer um em 2 s). Seja duro: frase que só faz sentido com o contexto não passa de 5. Se o vídeo tem poucos momentos fortes, devolva poucos: abertura curta é melhor que abertura com momento fraco.

Para cada momento, "soco": de 1 a 4 palavras DITAS e SEGUIDAS dentro do momento, com sentido fechado, para aparecer grandes na tela (ex.: "DOZE MESES", "DOZE MESES EM VINTE DIAS", "NÃO ESCALA", "CONTEXTO É REI"). O soco NUNCA termina em preposição, artigo, conjunção, advérbio solto ou verbo que pede complemento ("em", "do", "de", "bem", "não sabia"): "DOZE MESES EM" e "MOISÉS NÃO SABIA" estão errados.

Português do Brasil, sem travessão. Responda SOMENTE com JSON válido, sem cerca de código:
{"momentos":[{"de":120,"ate":126,"soco":"...","forca":8,"porque":"uma frase sobre por que prende"}]}`;

/**
 * Os melhores momentos do completo. `evitar(t)`: instante (tempo da fala) em
 * tela compartilhada; momento ali vai para o fim da fila (a abertura é rosto e
 * voz, e a tela sem contexto não prende).
 */
export async function escolherAberturaDoCompleto(p: {
  projectId: string;
  referencia: string;
  palavras: PalavraNoCorte[];
  tema?: string | null;
  resumo?: string | null;
  teses?: Array<{ minuto: string; frase: string }>;
  evitar?: (t: number) => boolean;
  /** A linguagem do projeto (01/10): a bíblia diz o tipo de abertura. */
  estiloId?: string | null;
}): Promise<AberturaDoCompleto> {
  const feitoEm = new Date().toISOString();
  const abertura = bibliaDoEstilo(p.estiloId).abertura;
  if (p.palavras.length < 60) return { momentos: [], reservas: [], feitoEm, erro: "fala curta demais para uma abertura" };
  const usuario = [
    p.tema ? `TEMA PRINCIPAL: ${p.tema}` : "",
    p.resumo ? `Resumo: ${p.resumo}` : "",
    p.teses?.length ? `Teses do vídeo:\n${p.teses.map((t) => `- ${t.minuto} ${t.frase}`).join("\n")}` : "",
    `Fala (minuto | índice:palavra):\n${falaNumerada(p.palavras)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const resposta = await askClaude(sistemaDoCompleto(p.estiloId) + SISTEMA_DO_COMPLETO_FIM, usuario, {
    effort: "medium",
    maxTokens: 16000,
    usage: { projectId: p.projectId, operation: "roteiro-abertura" },
  });
  const dados = extrairJson(resposta) as { momentos?: Array<{ de?: number; ate?: number; soco?: string; porque?: string; forca?: number }> };
  // A duração de cada momento é a da bíblia do estilo (01/10).
  const R = { ...REGRAS_DA_ABERTURA, momentoMin: abertura.momentoSeg[0], momentoMax: abertura.momentoSeg[1] };
  // Fortes (forca >= MIN_FORCA) na ordem do diretor; no fim da fila, os fortes
  // em tela compartilhada ou com soco repetido; à parte, os médios, só reserva.
  const candidatos: MomentoDaAbertura[] = [];
  const naTela: MomentoDaAbertura[] = [];
  const medios: MomentoDaAbertura[] = [];
  const total = p.palavras.at(-1)?.fim ?? 0;
  for (const m of dados.momentos ?? []) {
    if (typeof m.de !== "number" || typeof m.ate !== "number") continue;
    const ajuste = ajustarMomento(p.palavras, Math.round(m.de), Math.round(Math.max(m.de, m.ate)), R.momentoMin, R.momentoMax);
    if (!ajuste) continue;
    // A CONFERÊNCIA EM CÓDIGO (01/10): a abertura do vídeo cmuon0yxo saiu com a
    // despedida ("Deus abençoe vocês, amém", soco "AMÉM"). Saudação,
    // despedida, bênção, pedido de inscrição e transição saem pelo texto, e
    // os 5% iniciais e os 8% finais da gravação saem pela posição; momento
    // médio pela nota do diretor só fica de reserva, fraco sai.
    const texto = p.palavras.slice(ajuste.de, ajuste.ate + 1).map((w) => w.texto).join(" ");
    const noComeco = total >= 60 && p.palavras[ajuste.de].inicio / total < 0.05;
    const noFim = total >= 60 && p.palavras[ajuste.ate].fim / total > 0.92;
    if (momentoFraco(texto, m.soco) || noComeco || noFim) continue;
    const forca = typeof m.forca === "number" ? m.forca : 7;
    if (forca < 5) continue;
    const momento = montarMomento(p.palavras, ajuste.de, ajuste.ate, m.soco, m.porque);
    const todos = [...candidatos, ...naTela, ...medios];
    if (todos.some((c) => momento.inicio < c.fim && momento.fim > c.inicio)) continue;
    if (forca < MIN_FORCA) {
      medios.push(momento);
      continue;
    }
    // O mesmo soco duas vezes ("ESTAGIÁRIO" e "ESTAGIÁRIO") vai para o fim da fila.
    if (todos.some((c) => c.soco === momento.soco)) naTela.push(momento);
    else if (p.evitar?.((momento.inicio + momento.fim) / 2)) naTela.push(momento);
    else candidatos.push(momento);
  }
  // Poucos momentos fortes: abertura menor (só com os fortes) ou nenhuma, em
  // vez de completar com frase fraca. O trailer precisa de pelo menos 3.
  const fortes = [...candidatos, ...naTela];
  const minimo = abertura.tipo === "trailer" ? 3 : 1;
  if (fortes.length < minimo) {
    return { momentos: [], reservas: [...fortes, ...medios], feitoEm, erro: `poucos momentos fortes (${fortes.length}); o vídeo segue sem abertura`, tipo: abertura.tipo, passagem: abertura.passagem };
  }
  const somaDosFortes = fortes.reduce((s, c) => s + c.fim - c.inicio, 0);
  const escolhidos = escolherMomentos(fortes, Math.min(abertura.totalAlvoSeg, somaDosFortes), abertura.totalMaxSeg);
  const momentos = escolhidos.momentos;
  const reservas = [...escolhidos.reservas, ...medios];
  if (!momentos.length) return { momentos: [], reservas, feitoEm, erro: "o diretor não achou frases curtas e fortes" };
  // A passagem do estilo (fusão no telejornal e no keynote) o worker desenha
  // desde a Fase 2b (worker/src/abertura-de-impacto.mjs, `passagem`).
  const ligada = abertura.ligadaPorPadrao;
  return { momentos, reservas, feitoEm, erro: null, ...(ligada ? {} : { desligada: true }), tipo: abertura.tipo, passagem: abertura.passagem };
}

const SISTEMA_DOS_CORTES = `Você é o editor de cortes curtos (Reels, Shorts, TikTok) de um canal grande. Cada corte vai começar com um GANCHO: uma frase forte do próprio corte, de 3 a 5 segundos, tocada ANTES do começo do corte, com zoom e som de impacto. Depois dela o corte começa normalmente.

Para cada corte, escolha 3 frases candidatas, da mais forte para a menos forte. Uma boa frase de gancho:
1. Se sustenta sozinha e abre curiosidade (promessa, número, virada, afirmação que contraria o senso comum).
2. É uma FRASE INTEIRA de 3 a 6 segundos falada (em geral de 8 a 18 palavras): começa no início da frase e termina no ponto final dela. Pedaço de frase é descartado pelo código.
3. NÃO é a frase de abertura do corte (ela tocaria duas vezes seguidas): escolha do meio ou do fim.

"soco": de 1 a 4 palavras DITAS e SEGUIDAS na frase, com sentido fechado, para aparecerem grandes na tela. Nunca termina em preposição, artigo, conjunção, advérbio solto ou verbo que pede complemento ("em", "do", "bem", "não sabia").

Sem travessão. Responda SOMENTE com JSON válido, sem cerca de código:
{"cortes":[{"corte":0,"frases":[{"de":40,"ate":52,"soco":"..."}]}]}`;

/** Os ganchos de vários cortes numa chamada. Devolve por índice do corte; corte sem frase boa fica de fora. */
export async function escolherGanchosDosCortes(p: {
  projectId: string;
  cortes: Array<{ indice: number; titulo?: string | null; palavras: PalavraNoCorte[] }>;
  /** A linguagem do projeto (01/10): o gancho só vem ligado quando a bíblia liga a abertura. */
  estiloId?: string | null;
}): Promise<Map<number, GanchoDoCorte>> {
  const saida = new Map<number, GanchoDoCorte>();
  const desligado = !bibliaDoEstilo(p.estiloId).abertura.ligadaPorPadrao;
  const validos = p.cortes.filter((c) => c.palavras.length >= 20);
  if (!validos.length) return saida;
  const usuario = validos
    .map((c) => `CORTE ${c.indice}${c.titulo ? `: ${c.titulo}` : ""}\n${falaNumerada(c.palavras)}`)
    .join("\n\n");
  const resposta = await askClaude(SISTEMA_DOS_CORTES, usuario, {
    effort: "medium",
    maxTokens: 12000,
    usage: { projectId: p.projectId, operation: "roteiro-ganchos" },
  });
  const dados = extrairJson(resposta) as { cortes?: Array<{ corte?: number; frases?: Array<{ de?: number; ate?: number; soco?: string }> }> };
  const R = REGRAS_DA_ABERTURA;
  for (const item of dados.cortes ?? []) {
    const c = validos.find((x) => x.indice === item.corte);
    if (!c) continue;
    const frases: MomentoDaAbertura[] = [];
    for (const f of item.frases ?? []) {
      if (typeof f.de !== "number" || typeof f.ate !== "number") continue;
      const ajuste = ajustarMomento(c.palavras, Math.round(f.de), Math.round(Math.max(f.de, f.ate)), R.ganchoMin, R.ganchoMax);
      if (!ajuste) continue;
      const m = montarMomento(c.palavras, ajuste.de, ajuste.ate, f.soco);
      // A frase dos primeiros segundos tocaria duas vezes seguidas.
      if (m.inicio < R.ganchoDepoisDe) continue;
      // Despedida, saudação ou pedido de inscrição não é gancho (01/10).
      if (momentoFraco(c.palavras.slice(ajuste.de, ajuste.ate + 1).map((w) => w.texto).join(" "), f.soco)) continue;
      if (frases.some((x) => m.inicio < x.fim && m.fim > x.inicio)) continue;
      frases.push(m);
    }
    if (frases.length) saida.set(c.indice, { ...frases[0], reservas: frases.slice(1), ...(desligado ? { desligado: true } : {}) });
  }
  return saida;
}
