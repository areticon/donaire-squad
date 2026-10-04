import { askClaudeComImagens } from "@/lib/claude";
import { extrairJson } from "@/lib/media/diretor-de-montagem";
import type { PalavraNoCorte } from "@/lib/media/plano-de-montagem";
import { catalogoNoPrompt } from "@/lib/media/editor-sob-medida/pecas";
import type { Frase } from "@/lib/media/editor-sob-medida/resolver";
import type { EdicaoDoEditor, MomentoDoEditor } from "@/lib/media/editor-sob-medida/tipos";

/**
 * O AGENTE EDITOR (03/10/2026): lê a fala inteira, olha os quadros da
 * gravação, conhece a marca, o setor e a referência do estilo, e ESCREVE a
 * edição do vídeo como o programa do pitch da landing foi escrito: peça por
 * peça, cada uma no instante da palavra que a pede, desenhada para o que está
 * sendo dito. O código (resolver.ts) cuida do que é medível; aqui mora o
 * julgamento.
 *
 * Vídeo longo vai em blocos de ~5 min em paralelo, cada um com a fala
 * inteira (para saber onde está no argumento) e os quadros do próprio bloco.
 */

/**
 * OPUS 5 como padrão (medido em 03/10, mesmo vídeo de 4 min): 40 peças e 66%
 * do tempo com peça, estrutura de capítulos, painéis e fluxo, por US$ 0,32;
 * o Sonnet 5 fez 27 peças e 44% por US$ 0,15. A diferença é ~US$ 0,04 por
 * minuto de vídeo, e a edição é o produto. EDITOR_SOB_MEDIDA_MODELO troca.
 */
export const MODELO_DO_EDITOR = process.env.EDITOR_SOB_MEDIDA_MODELO || "claude-opus-5";
const BLOCO_SEG = 300;

const sistemaDoEditor = (estiloId?: string | null) => `Você é o editor de vídeo e motion designer sênior da Demandou. Você não aplica um template: você ESCREVE a edição de um vídeo específico, peça por peça, como foi escrito o vídeo de pitch da nossa landing.

# O QUE FEZ O PITCH SER BOM (a régua)
- Cada coisa importante que a voz diz GANHA FORMA na tela, no instante em que é dita: falou de três saídas, entram três cartões, um por um, cada um na palavra dele; falou de 88%, o número conta até 88; falou "Roberto", a câmera vai até o Roberto.
- Hierarquia sempre: rótulo pequeno (selo), título curto com UMA palavra em destaque, apoio menor. Nunca parágrafo na tela.
- O desenho é do ASSUNTO, não decorativo: três passos viram linha do tempo ou escada; dinheiro em vídeo de tecnologia vira o cifrão futurista; versículo lido ou citado vira PERGAMINHO (com a referência, "Lucas 5:4"); lugares viram mapa; uma objeção vira pergunta e resposta; um conceito sem peça vira um DESENHO seu (SVG simples).
- Ritmo: algo novo a cada 5 a 10 segundos; peças de tela cheia alternam com a pessoa; nunca a mesma peça duas vezes seguidas.
- Respiro: a pessoa falando, sem nada, é parte da edição. Emoção, história pessoal e oração ficam com o rosto.
- Tudo nas cores e letras da marca do cliente (o código aplica; você só escolhe peças e textos).

# COMO VOCÊ TRABALHA
1. Leia a fala inteira e entenda o vídeo: o que é (aula, tour, pregação, depoimento, pitch), para quem, qual o fio. Escreva isso em "leitura".
2. Marque os momentos que PEDEM forma: listas, passos, números, comparações, lugares, citações e versículos, objetos mostrados, a tese, as viradas, o começo de cada parte, a chamada final.
3. Para cada um, escolha a peça do catálogo que melhor DESENHA aquilo e escreva o texto dela com as palavras do próprio falante, curtas. Nada de inventar número, nome, dado ou promessa que não foi dito.
4. Use os QUADROS: eles mostram o que a câmera vê. Se a pessoa mostra um objeto ou lugar, NUNCA cubra a demonstração com peça de tela, de lado ou inserção. Seta, círculo e câmera com foco só com a CÂMERA PARADA (tripé: o mesmo fundo nos quadros vizinhos) e o objeto visível no mesmo lugar nos quadros daquele trecho; em gravação de mão (tour, selfie andando, o quadro muda a cada segundo) o objeto foge do alvo: nomeie o que se vê com rótulo inferior ou palavra-chave, sem apontar.
5. Câmera: o código já alterna aberto, médio e fechado no ritmo das frases. Você só pede câmera quando ela deve ir a um lugar (o objeto mostrado, um detalhe), com zoom de 1,3 a 1,8 e o foco certo.
6. INSERÇÃO CINEMATOGRÁFICA (vídeo gerado na Higgsfield, 3 a 5 s, entra com zoom através e luz): onde a fala pede IMAGEM que a gravação não tem: uma metáfora visual ("a tenda que se alarga", "a semente no chão seco"), um lugar, uma época, uma cena bíblica, um objeto. Escreva o pedido como briefing de diretor de fotografia, em inglês: assunto, lugar, luz, lente, enquadramento, movimento de câmera (slow dolly in, aerial pull back, macro rack focus), clima, cor. NUNCA pessoa real ou rosto reconhecível: gente só de costas, em silhueta, mãos, ou plano aberto em que ninguém é identificável; figura bíblica só se a fala é sobre ela, de costas ou em plano aberto, com roupa da época. Sem texto, sem marca. FREQUÊNCIA: no vídeo longo, 1 a cada 45 a 60 s de fala (nos trechos de história, metáfora, lugar e virada, não em lista ou número), sempre onde a fala PEDE imagem; "de" na palavra que pede a imagem, 3 a 5 s de duração.

7. B-ROLL REAL (vídeo de banco, imagem DE VERDADE): vídeo profissional corta para imagem real várias vezes por minuto. Sempre que a fala cita um OBJETO, um LUGAR, uma AÇÃO ou uma METÁFORA VISUAL que existe no mundo (pão, estrada, cidade à noite, mãos trabalhando, relógio, escada, mar, obra, escritório, colheita, teto de igreja), peça um B-roll em "broll": "consulta" em INGLÊS, CURTA e CONCRETA, de 2 a 4 palavras, do jeito que se busca num banco de vídeo ("hands kneading dough", "church ceiling fresco", "busy office desk", "sunrise over field"). Nada abstrato ("success", "faith", "productivity" não acham imagem boa): traduza a ideia numa cena filmável. A imagem mostra o que a frase DIZ (o objeto, o lugar, a ação ditos ou a cena narrada), nunca uma associação solta: quem vê precisa ligar a imagem à palavra na hora. Duração de 1,5 a 3 s ("de" na palavra que pede a imagem, "ate" 2 a 3 s depois). FREQUÊNCIA: 1 a cada 15 a 25 s de fala no vídeo longo. Nunca sobre uma demonstração da pessoa, nem colado em tela cheia ou cartão (a pessoa volta entre eles). O que NÃO existe em banco (cena bíblica, figura histórica, conceito, época) vai em "insercoes" (gerado na Higgsfield), não em "broll".
8. ZOOM DE SOCO: em "enfases", as palavras-chave da fala que merecem um soco de câmera (o número, o nome, a palavra da tese, a virada), uma a cada 4 a 8 s, como âncoras de palavra ("F3:melhor"). O código fecha a câmera de uma vez nessa palavra.

# DENSIDADE (o pitch tem forma na tela quase o tempo todo; não economize)
- Peças cobrindo de 65% a 85% do tempo; uma peça nova a cada 4 a 8 s. Um vídeo de 4 min pede 30 a 45 momentos; um bloco de 5 min, 35 a 55.
- Nenhum trecho de mais de 8 s sem peça, a não ser emoção, história pessoal ou oração.
- Entre duas peças grandes, uma pequena (palavra-chave, sublinhado, rótulo) mantém o ritmo; o respiro sem nada fica para emoção, história pessoal e oração, e nunca passa de 10 s.
- COMPOSIÇÃO, não só legenda grande: o pitch alterna a pessoa cheia com a pessoa em CARTÃO ao lado de um painel, e com telas de gráfico. Mire em cerca de 40% das peças sobre a pessoa, 35% ao lado (painel-lateral, checklist, barras, progresso, desenho) e 25% de tela cheia. Título em cima da pessoa o tempo todo é a edição pobre que estamos substituindo.
- Peças de TELA CHEIA somando no máximo 25% do tempo, nenhuma acima de 8 s.
- Use a variedade do catálogo: num trecho de 5 min, pelo menos 7 tipos de peça diferentes.
- Peça curta não é peça ruim: palavra-chave, sublinhado e rótulo dão ritmo entre as maiores.

# ACABAMENTO DE CINEMA (o dono reprovou a edição de cartões chapados: "parece um PPT")
O código desenha cada peça com vidro, luz, palco com câmera e tipografia cinética; você escolhe peças que DÃO esse acabamento:
- PROFUNDIDADE: "titulo-atras" põe a palavra-tese gigante ATRÁS da pessoa recortada. Use na ideia central de cada parte (1 a cada 1 a 2 min no longo), com a pessoa no meio do quadro.
- DADOS QUE IMPRESSIONAM: número dito vira "numero" (contador de rolo), "progresso" (anel), "barras" ou "grafico-linha" (evolução no tempo); N passos numerados viram "passos-foco" (um aceso, os outros desfocados) ou "linha-do-tempo" (a câmera percorre); níveis viram "escada" (3D). Não deixe número dito passar sem peça.
- IMAGEM DE CINEMA: as inserções (item 6) são a camada da Higgsfield; o vídeo sem nenhuma inserção fica parecendo slide.
- Telas cheias têm palco próprio com câmera e transição (íris, luz, zoom): a troca rosto e tela já é transição de verdade, não se preocupe com ela.

# ÂNCORAS (o tempo é sempre da fala, nunca em segundos)
A fala vem numerada por frase: F12 é a frase 12.
- "F12" = começo da frase 12; "F12/fim" = fim da frase 12.
- "F12:Diana" = começo da palavra Diana na frase 12; "F12:Diana/fim" = fim dela; "F12:que#2" = a segunda ocorrência.
- "de" é quando a peça aparece (a palavra que a pede); "ate" é quando sai (o fim da frase em que o assunto acaba).
- "eventos": um por item da lista, na palavra em que cada item é dito, na ordem.
- Peças não se sobrepõem: uma acaba antes da próxima começar.

# TEXTO NA TELA
Português do Brasil, sem travessão, sem ponto final em título, palavras do falante. Destaque com **asteriscos** em 1 a 3 palavras. Nunca escreva o que a legenda já mostra palavra por palavra: a peça resume, nomeia, organiza.

# RESPOSTA
Só um JSON, sem texto antes ou depois:
{
  "leitura": "o que é este vídeo, para quem, o fio, em 2 ou 3 frases",
  "momentos": [
    { "id": "m1", "peca": "linha-do-tempo", "de": "F12:três", "ate": "F15/fim", "eventos": ["F13:primeiro", "F14:segundo", "F15:terceiro"], "props": { ... }, "porque": "curto" }
  ],
  "camera": [ { "de": "F20:mesa", "ate": "F21/fim", "zoom": 1.5, "foco": { "x": 0.62, "y": 0.7 }, "porque": "ele mostra a mesa" } ],
  "insercoes": [ { "id": "i1", "de": "F30:barco", "ate": "F31/fim", "briefing": "...", "porque": "..." } ],
  "broll": [ { "id": "b1", "de": "F8:pão", "ate": "F8/fim", "consulta": "hands kneading dough", "porque": "ele fala do pão" } ],
  "enfases": ["F3:melhor", "F9:excelência"]
}

# O CATÁLOGO DE PEÇAS
${catalogoNoPrompt(estiloId)}`;

/**
 * O BLOCO DE 5 MIN DO COMPLETO (03/10, à noite): o juiz reprovou 124 de 131
 * peças do completo de cmurtv2zg por "parece slide" e "cartão chapado"; muita
 * peça fraca num bloco longo vira muito conserto. O bloco pede menos peças e
 * mais FORTES, variadas, com imagem real entre elas.
 */
export const INSTRUCOES_DO_BLOCO_LONGO = `# ESTE BLOCO DE ~5 MIN (vale sobre as regras gerais de densidade)
- Peças FORTES e VARIADAS: de 22 a 32 momentos no bloco, cada um desenhado para o que é dito. Nada de cartão escuro com texto em cima da pessoa (o juiz reprova como "parece slide"): prefira "titulo-atras" (2 a 3 no bloco, na ideia central de cada parte), "numero", "barras", "progresso", "passos-foco", "linha-do-tempo", "comparacao", "pergaminho" para versículo, "frase-impacto" na virada, "palavra-chave" e "sublinhado" para o ritmo entre as grandes.
- No máximo 4 "titulo" e 3 "painel-lateral" no bloco; nunca a mesma peça duas vezes seguidas; pelo menos 9 tipos de peça diferentes.
- Peça ou imagem real em 45% a 60% do tempo do bloco, alguma troca visual a cada 10 a 15 s, e nunca mais de 20 s seguidos só do rosto (a não ser oração ou emoção forte).
- B-ROLL em "broll": de 12 a 18 no bloco, um a cada 15 a 25 s, onde a fala cita algo filmável; é o que mais tira o vídeo da cara de slide.
- Texto curto: título com até 5 palavras, rótulo com até 3. Texto grande e legível no celular vale mais que texto completo.`;

export type EntradaDoEditor = {
  palavras: PalavraNoCorte[];
  frases: Frase[];
  duracao: number;
  formato: "16:9" | "9:16";
  /** A referência do estilo (lib/media/referencias-de-estilo) ou o resumo da bíblia. */
  referencia: string;
  /** O perfil do projeto (perfilNoPrompt) e a marca. */
  perfil: string;
  /** O roteiro aprovado e os pedidos do cliente, quando há. */
  roteiro?: string | null;
  /** Os quadros da gravação, com o instante. */
  quadros: Array<{ t: number; base64: string }>;
  projectId?: string | null;
  referenciaDeUso: string;
  modelo?: string;
  /** O estilo escolhido: o catálogo leva só as peças dele (as da lousa vão para lousa e consorcio). Sem o campo, o catálogo inteiro, com as da lousa marcadas. */
  estiloId?: string | null;
  /** Regras a mais para a tarefa (o corte curto vertical, lib/media/editor-sob-medida/corte.ts). */
  instrucoes?: string | null;
  /** Prazo de cada chamada (padrão 300 s) e tentativas do bloco (padrão 2): o corte cabe na passada do cron. */
  timeoutMs?: number;
  tentativas?: number;
};

function falaNumerada(frases: Frase[], de = 0, ate = Infinity): string {
  return frases
    .map((f, k) => ({ f, k }))
    .filter(({ f }) => f.fim > de && f.inicio < ate)
    .map(({ f, k }) => `F${k} [${f.inicio.toFixed(1)}s] ${f.texto}`)
    .join("\n");
}

function contexto(e: EntradaDoEditor): string {
  return [
    `FORMATO: ${e.formato === "9:16" ? "vertical 9:16 (celular): as peças ficam no alto e no meio; a base é da legenda e da interface da rede" : "deitado 16:9 (YouTube)"}. DURAÇÃO: ${(e.duracao / 60).toFixed(1)} min.`,
    e.perfil,
    `# REFERÊNCIA DO ESTILO ESCOLHIDO (a linguagem que o cliente escolheu; adapte ao catálogo de peças)\n${e.referencia}`,
    e.roteiro ? `# O ROTEIRO APROVADO PELO CLIENTE\n${e.roteiro}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Os blocos de edição de um vídeo (em frases inteiras). */
export function blocosDoEditor(frases: Frase[], duracao: number): Array<{ de: number; ate: number; f0: number; f1: number }> {
  const n = Math.max(1, Math.round(duracao / BLOCO_SEG));
  const alvo = duracao / n;
  const saida: Array<{ de: number; ate: number; f0: number; f1: number }> = [];
  let f0 = 0;
  for (let b = 0; b < n; b++) {
    let f1 = frases.length - 1;
    if (b < n - 1) {
      const lim = (b + 1) * alvo;
      f1 = Math.max(f0, frases.findIndex((f) => f.fim >= lim));
      if (f1 < 0) f1 = frases.length - 1;
    }
    saida.push({ de: frases[f0]?.inicio ?? 0, ate: b === n - 1 ? duracao : frases[f1].fim, f0, f1 });
    f0 = f1 + 1;
    if (f0 >= frases.length) break;
  }
  return saida;
}

async function chamar(sistemaExtra: string, mensagem: string, quadros: Array<{ t: number; base64: string }>, e: EntradaDoEditor, operacao: string): Promise<unknown> {
  const resposta = await askClaudeComImagens(
    sistemaDoEditor(e.estiloId),
    `${sistemaExtra}\n\n${mensagem}`,
    quadros.map((q) => ({ base64: q.base64, rotulo: `Quadro da gravação em ${q.t.toFixed(1)} s:` })),
    {
      model: e.modelo ?? MODELO_DO_EDITOR,
      maxTokens: 32000,
      effort: "medium",
      timeoutMs: e.timeoutMs ?? 300_000,
      cachedPrefix: undefined,
      usage: { projectId: e.projectId ?? undefined, operation: operacao },
    }
  );
  return extrairJson(resposta);
}

export type BlocoDoEditor = { de: number; ate: number; f0: number; f1: number };
export type ParteDaEdicao = EdicaoDoEditor & { erro?: string };

/** Um bloco do vídeo no editor (duas tentativas). */
export async function escreverBloco(e: EntradaDoEditor, b: BlocoDoEditor, k: number, total: number): Promise<ParteDaEdicao> {
  const ctx = contexto(e);
  const quadros = e.quadros.filter((q) => q.t >= b.de - 1 && q.t <= b.ate + 1);
  const fala = falaNumerada(e.frases);
  const tarefa =
    total === 1
      ? `Edite o vídeo inteiro (F0 a F${e.frases.length - 1}).`
      : `O vídeo foi dividido em ${total} partes, editadas em paralelo. VOCÊ EDITA SÓ A PARTE ${k + 1}: de F${b.f0} a F${b.f1} (${b.de.toFixed(0)} s a ${b.ate.toFixed(0)} s). Todas as âncoras dentro desse intervalo. ${k === 0 ? "É o começo: abra forte (título ou rótulo de quem fala nos primeiros segundos)." : ""}${k === total - 1 ? "É o fim: feche com a peça fecho na chamada final, se houver chamada." : ""}`;
  let ultimoErro = "";
  for (let tentativa = 0; tentativa < (e.tentativas ?? 2); tentativa++) {
    try {
      const j = (await chamar(ctx, `# A FALA, NUMERADA
${fala}

# A TAREFA
${tarefa}

${e.instrucoes ?? INSTRUCOES_DO_BLOCO_LONGO}`, quadros, e, e.instrucoes ? "editor-sob-medida-corte" : "editor-sob-medida")) as EdicaoDoEditor;
      if (!Array.isArray(j?.momentos)) throw new Error("resposta sem momentos");
      const dentro = (a: string) => {
        const n = Number(String(a).match(/\d+/)?.[0] ?? -1);
        return n >= b.f0 && n <= b.f1 + 1;
      };
      return {
        leitura: j.leitura ?? "",
        momentos: j.momentos.filter((m) => dentro(m.de)).map((m, i) => ({ ...m, id: `p${k + 1}-${String(m.id ?? i + 1).replace(/^p\d+-/, "")}` })),
        camera: (j.camera ?? []).filter((c) => dentro(c.de)),
        insercoes: (j.insercoes ?? []).filter((x) => dentro(x.de)).map((x, i) => ({ ...x, id: `p${k + 1}-${String(x.id ?? `i${i + 1}`).replace(/^p\d+-/, "")}` })),
        broll: (Array.isArray(j.broll) ? j.broll : []).filter((x) => x && x.consulta && dentro(x.de)).map((x, i) => ({ ...x, id: `p${k + 1}-${String(x.id ?? `b${i + 1}`).replace(/^p\d+-/, "")}` })),
        enfases: (Array.isArray(j.enfases) ? j.enfases : []).map(String).filter(dentro),
      };
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message.slice(0, 160) : String(err);
    }
  }
  return { leitura: "", momentos: [], camera: [], insercoes: [], broll: [], enfases: [], erro: ultimoErro || "falhou" };
}

/** Junta as partes na edição do vídeo inteiro. */
export function juntarPartes(partes: ParteDaEdicao[]): EdicaoDoEditor {
  return {
    leitura: partes.map((p) => p.leitura).filter(Boolean)[0] ?? "",
    momentos: partes.flatMap((p) => p.momentos),
    camera: partes.flatMap((p) => p.camera ?? []),
    insercoes: partes.flatMap((p) => p.insercoes ?? []),
    broll: partes.flatMap((p) => p.broll ?? []),
    enfases: partes.flatMap((p) => p.enfases ?? []),
  };
}

/** A edição do vídeo inteiro (blocos em paralelo). */
export async function escreverEdicao(e: EntradaDoEditor): Promise<{ edicao: EdicaoDoEditor; blocos: number; erros: string[] }> {
  const blocos = blocosDoEditor(e.frases, e.duracao);
  const partes = await Promise.all(blocos.map((b, k) => escreverBloco(e, b, k, blocos.length)));
  return { edicao: juntarPartes(partes), blocos: blocos.length, erros: partes.filter((p) => p.erro).map((p, k) => `parte ${k + 1}: ${p.erro}`) };
}

export type DefeitoDaRevisao = { momento: string | null; t: number; tipo: string; descricao: string; conserto: string; nota?: number };

/** Os defeitos que podem TIRAR a peça (espelho de DEFEITOS_GRAVES em corte.ts). */
const GRAVES = new Set(["ilegivel", "cobre", "incoerente", "imagem"]);
/** Quantos defeitos cada chamada de conserto recebe (as chamadas vão em paralelo). */
const CONSERTO_POR_CHAMADA = 10;

type RespostaDoConserto = { momentos?: MomentoDoEditor[]; remover?: string[]; camera?: EdicaoDoEditor["camera"]; broll?: EdicaoDoEditor["broll"] };

/**
 * O CONSERTO CONSERTA, NÃO APAGA (03/10, à noite). O completo de cmurtv2zg
 * saiu quase sem edição: o editor escreveu 131 peças, o juiz pôs defeito em
 * 124 (127 deles de "qualidade", nota abaixo de 7), o conserto numa chamada só
 * refez uma parte, e o código apagava toda peça com defeito que não voltasse
 * refeita: sobraram 37 peças e 12,7% do tempo com peça. Agora:
 *   - os defeitos vão em grupos de 10, em paralelo, cada grupo com a fala em
 *     volta dele e os quadros dele;
 *   - a peça que o conserto não devolveu FICA como estava (defeito de
 *     qualidade não apaga nada);
 *   - só defeito GRAVE (ilegível, cobrindo, incoerente, imagem ruim) remove,
 *     e o editor põe outra peça ou um B-roll no lugar; sem substituto, o
 *     resolvedor preenche o buraco (sublinhado da ênfase) e a câmera segue.
 * `brollNovos`: os ids dos B-rolls que o conserto pediu (quem chama busca).
 */
export async function consertarEdicao(
  e: EntradaDoEditor,
  edicao: EdicaoDoEditor,
  defeitos: DefeitoDaRevisao[],
  quadrosDoDefeito: Array<{ t: number; base64: string }>
): Promise<{ edicao: EdicaoDoEditor; trocados: number; removidos: number; brollNovos: string[]; erros: string[] }> {
  const ids = [...new Set(defeitos.map((d) => d.momento).filter((x): x is string => Boolean(x)))];
  if (!ids.length && !defeitos.some((d) => !d.momento)) return { edicao, trocados: 0, removidos: 0, brollNovos: [], erros: [] };
  const graves = new Set(defeitos.filter((d) => d.momento && GRAVES.has(d.tipo)).map((d) => String(d.momento)));
  const ordenados = [...defeitos].sort((a, b) => a.t - b.t);
  const grupos: DefeitoDaRevisao[][] = [];
  for (let i = 0; i < ordenados.length; i += CONSERTO_POR_CHAMADA) grupos.push(ordenados.slice(i, i + CONSERTO_POR_CHAMADA));
  const tDe = (m: { de: string }) => e.frases[Number(String(m.de).match(/\d+/)?.[0] ?? -1)]?.inicio ?? -1;
  const selo = Date.now().toString(36).slice(-4);
  const erros: string[] = [];
  const respostas = await Promise.all(
    grupos.map(async (g, gi): Promise<RespostaDoConserto | null> => {
      const t0 = Math.min(...g.map((d) => d.t)) - 45;
      const t1 = Math.max(...g.map((d) => d.t)) + 45;
      const idsDoGrupo = new Set(g.map((d) => d.momento).filter(Boolean).map(String));
      const alvo = edicao.momentos.filter((m) => idsDoGrupo.has(String(m.id)));
      const vizinhos = edicao.momentos.filter((m) => !idsDoGrupo.has(String(m.id)) && tDe(m) >= t0 && tDe(m) <= t1);
      const pagas = [
        ...(edicao.insercoes ?? []).filter((x) => tDe(x) >= t0 && tDe(x) <= t1).map((x) => `- inserção ${x.id}: ${x.de} a ${x.ate}`),
        ...(edicao.broll ?? []).filter((x) => tDe(x) >= t0 && tDe(x) <= t1).map((x) => `- B-roll ${x.id} "${x.consulta}": ${x.de} a ${x.ate}`),
      ];
      const msg = [
        `# A FALA EM VOLTA DOS DEFEITOS (numeração do vídeo inteiro)\n${falaNumerada(e.frases, t0, t1)}`,
        `# OS MOMENTOS COM DEFEITO (a edição atual deles)\n${JSON.stringify(alvo, null, 1)}`,
        vizinhos.length ? `# AS PEÇAS VIZINHAS QUE PASSARAM (não mexa; a sua não pode se sobrepor a elas)\n${vizinhos.map((m) => `- ${m.id} ${m.peca}: ${m.de} a ${m.ate}`).join("\n")}` : "",
        `# O QUE O REVISOR VIU NO VÍDEO RENDERIZADO (os quadros acima são os do defeito)\n${g.map((d) => `- ${d.momento ?? "sem peça"} em ${d.t.toFixed(1)} s, ${d.tipo}${GRAVES.has(d.tipo) ? " (GRAVE)" : ""}: ${d.descricao} (sugestão: ${d.conserto})`).join("\n")}`,
        pagas.length ? `# IMAGENS JÁ PAGAS NESTE TRECHO (fique com elas: peça de tela cheia ou de lado não entra por cima, e o rosto volta 1 s entre elas)\n${pagas.join("\n")}` : "",
        `# A TAREFA: CONSERTE, NÃO APAGUE
- Para CADA momento com defeito, devolva a peça REFEITA com o MESMO id, subindo o nível como o revisor pediu: outra peça mais forte do catálogo quando o defeito é "parece slide" ou "cartão chapado" (titulo-atras, numero, passos-foco, barras, comparacao, frase-impacto, pergaminho), texto mais curto com a palavra-chave em **destaque**, outro lado, outro tempo. Varie: não troque tudo pela mesma peça.
- "remover" só para defeito GRAVE sem conserto possível. Todo id removido ganha um SUBSTITUTO no mesmo trecho: outra peça (id novo) ou um B-roll em "broll" (consulta concreta em inglês, 2 a 4 palavras, 1,5 a 3 s, na palavra que cita o objeto, o lugar ou a ação).
- Defeito "vazio" ou sem peça: um momento novo (id novo) ou um B-roll no trecho.
- A densidade do vídeo é o que está em jogo: o vídeo final precisa de peça ou imagem em quase metade do tempo. Momento que você não devolver fica como está.
Responda só o JSON: { "momentos": [refeitos com o MESMO id; novos com id novo], "remover": ["ids"], "broll": [ { "id": "b1", "de": "F8:pão", "ate": "F8/fim", "consulta": "hands kneading dough" } ], "camera": [] }`,
      ]
        .filter(Boolean)
        .join("\n\n");
      const quadros = quadrosDoDefeito.filter((q) => g.some((d) => Math.abs(d.t - q.t) < 0.05)).slice(0, 12);
      try {
        // O conserto é pontual e vai no Sonnet 5: no Opus custou US$ 0,34 num vídeo de 4 min sem ganho visível (03/10).
        return (await chamar(contexto(e), msg, quadros, { ...e, modelo: process.env.EDITOR_SOB_MEDIDA_MODELO_CONSERTO || "claude-sonnet-5" }, "editor-sob-medida-conserto")) as RespostaDoConserto;
      } catch (err) {
        erros.push(`grupo ${gi + 1}: ${err instanceof Error ? err.message.slice(0, 120) : err}`);
        return null;
      }
    })
  );
  const refeitos = new Map<string, MomentoDoEditor>();
  const novos: MomentoDoEditor[] = [];
  const remover = new Set<string>();
  const brolls: NonNullable<EdicaoDoEditor["broll"]> = [];
  const cameras: NonNullable<EdicaoDoEditor["camera"]> = [];
  respostas.forEach((r, gi) => {
    if (!r) return;
    (r.momentos ?? [])
      .filter((m) => m && m.peca && m.de && m.ate)
      .forEach((m, i) => {
        const id = String(m.id ?? "");
        if (ids.includes(id)) refeitos.set(id, m);
        else novos.push({ ...m, id: `c${selo}-${gi}n${i}` });
      });
    // Só o defeito grave tira a peça.
    for (const id of (r.remover ?? []).map(String)) if (graves.has(id)) remover.add(id);
    (Array.isArray(r.broll) ? r.broll : []).filter((b) => b && b.consulta && b.de && b.ate).forEach((b, i) => brolls.push({ ...b, id: `c${selo}-${gi}b${i}` }));
    cameras.push(...(r.camera ?? []));
  });
  let trocados = 0;
  let removidos = 0;
  const momentos = edicao.momentos.flatMap((m) => {
    const id = String(m.id);
    if (remover.has(id)) {
      removidos++;
      return [];
    }
    const n = refeitos.get(id);
    if (n) {
      trocados++;
      return [{ ...n, id }];
    }
    // Grave que não voltou refeito sai (o buraco o resolvedor preenche); o resto fica como estava.
    if (graves.has(id)) {
      removidos++;
      return [];
    }
    return [m];
  });
  return {
    edicao: { ...edicao, momentos: [...momentos, ...novos], camera: [...(edicao.camera ?? []), ...cameras], broll: [...(edicao.broll ?? []), ...brolls] },
    trocados,
    removidos,
    brollNovos: brolls.map((b) => String(b.id)),
    erros,
  };
}

/**
 * A DENSIDADE NUNCA CAI NO CONSERTO (03/10, à noite): o corte 0 de cmurtv2zg
 * teve 57% de peça numa rodada e 34% na seguinte. Se a edição consertada
 * ficou mais vazia que a anterior (medida pela resolução de quem chama), as
 * peças boas da anterior voltam: primeiro as que sumiram sem defeito grave;
 * se ainda faltar, a edição anterior inteira sem as graves, com o que o
 * conserto trouxe de novo. Fica a opção mais densa.
 */
export function manterDensidade(
  anterior: EdicaoDoEditor,
  nova: EdicaoDoEditor,
  graves: Set<string>,
  medir: (e: EdicaoDoEditor) => number
): { edicao: EdicaoDoEditor; antes: number; depois: number; motivo: string | null } {
  const antes = medir(anterior);
  const d1 = medir(nova);
  if (d1 >= antes - 0.01) return { edicao: nova, antes, depois: d1, motivo: null };
  const idsNova = new Set(nova.momentos.map((m) => String(m.id)));
  const idsAnt = new Set(anterior.momentos.map((m) => String(m.id)));
  const devolvidas: EdicaoDoEditor = { ...nova, momentos: [...nova.momentos, ...anterior.momentos.filter((m) => !idsNova.has(String(m.id)) && !graves.has(String(m.id)))] };
  const daAnterior: EdicaoDoEditor = {
    ...nova,
    momentos: [...anterior.momentos.filter((m) => !graves.has(String(m.id))), ...nova.momentos.filter((m) => !idsAnt.has(String(m.id)) || graves.has(String(m.id)))],
  };
  const opcoes = [
    { e: nova, d: d1, motivo: null as string | null },
    { e: devolvidas, d: medir(devolvidas), motivo: "as peças que sumiram sem defeito grave voltaram" },
    { e: daAnterior, d: medir(daAnterior), motivo: "a edição anterior voltou (sem as peças graves), com o que o conserto trouxe de novo" },
  ].sort((a, b) => b.d - a.d);
  return { edicao: opcoes[0].e, antes, depois: opcoes[0].d, motivo: opcoes[0].motivo };
}
