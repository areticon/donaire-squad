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

const SISTEMA = `Você é o editor de vídeo e motion designer sênior da Demandou. Você não aplica um template: você ESCREVE a edição de um vídeo específico, peça por peça, como foi escrito o vídeo de pitch da nossa landing.

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
6. Inserção gerada: só onde nenhuma peça e nenhum quadro da gravação mostra o que é dito, e a imagem agrega (um lugar, uma época, um objeto que não está na sala). Escreva o pedido como briefing de fotógrafo, em inglês: assunto, lugar, luz, lente, enquadramento, clima; sem texto na imagem, sem marca, sem pessoa real; figura bíblica só se a fala é sobre ela, de costas ou em plano aberto, com roupa da época. No máximo 1 por minuto, e zero se não agregar.

# DENSIDADE (o pitch tem forma na tela quase o tempo todo; não economize)
- Peças cobrindo de 65% a 85% do tempo; uma peça nova a cada 4 a 8 s. Um vídeo de 4 min pede 30 a 45 momentos; um bloco de 5 min, 35 a 55.
- Nenhum trecho de mais de 8 s sem peça, a não ser emoção, história pessoal ou oração.
- Entre duas peças grandes, uma pequena (palavra-chave, sublinhado, rótulo) mantém o ritmo; o respiro sem nada fica para emoção, história pessoal e oração, e nunca passa de 10 s.
- COMPOSIÇÃO, não só legenda grande: o pitch alterna a pessoa cheia com a pessoa em CARTÃO ao lado de um painel, e com telas de gráfico. Mire em cerca de 40% das peças sobre a pessoa, 35% ao lado (painel-lateral, checklist, barras, progresso, desenho) e 25% de tela cheia. Título em cima da pessoa o tempo todo é a edição pobre que estamos substituindo.
- Peças de TELA CHEIA somando no máximo 25% do tempo, nenhuma acima de 8 s.
- Use a variedade do catálogo: num trecho de 5 min, pelo menos 7 tipos de peça diferentes.
- Peça curta não é peça ruim: palavra-chave, sublinhado e rótulo dão ritmo entre as maiores.

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
  "insercoes": [ { "id": "i1", "de": "F30:barco", "ate": "F31/fim", "briefing": "...", "porque": "..." } ]
}

# O CATÁLOGO DE PEÇAS
${catalogoNoPrompt()}`;

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
    SISTEMA,
    `${sistemaExtra}\n\n${mensagem}`,
    quadros.map((q) => ({ base64: q.base64, rotulo: `Quadro da gravação em ${q.t.toFixed(1)} s:` })),
    {
      model: e.modelo ?? MODELO_DO_EDITOR,
      maxTokens: 32000,
      effort: "medium",
      timeoutMs: 300_000,
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
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const j = (await chamar(ctx, `# A FALA, NUMERADA
${fala}

# A TAREFA
${tarefa}`, quadros, e, "editor-sob-medida")) as EdicaoDoEditor;
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
      };
    } catch (err) {
      ultimoErro = err instanceof Error ? err.message.slice(0, 160) : String(err);
    }
  }
  return { leitura: "", momentos: [], camera: [], insercoes: [], erro: ultimoErro || "falhou" };
}

/** Junta as partes na edição do vídeo inteiro. */
export function juntarPartes(partes: ParteDaEdicao[]): EdicaoDoEditor {
  return {
    leitura: partes.map((p) => p.leitura).filter(Boolean)[0] ?? "",
    momentos: partes.flatMap((p) => p.momentos),
    camera: partes.flatMap((p) => p.camera ?? []),
    insercoes: partes.flatMap((p) => p.insercoes ?? []),
  };
}

/** A edição do vídeo inteiro (blocos em paralelo). */
export async function escreverEdicao(e: EntradaDoEditor): Promise<{ edicao: EdicaoDoEditor; blocos: number; erros: string[] }> {
  const blocos = blocosDoEditor(e.frases, e.duracao);
  const partes = await Promise.all(blocos.map((b, k) => escreverBloco(e, b, k, blocos.length)));
  return { edicao: juntarPartes(partes), blocos: blocos.length, erros: partes.filter((p) => p.erro).map((p, k) => `parte ${k + 1}: ${p.erro}`) };
}

export type DefeitoDaRevisao = { momento: string | null; t: number; tipo: string; descricao: string; conserto: string };

/**
 * O CONSERTO: o editor recebe os defeitos que o revisor viu nos quadros e
 * devolve, para cada momento com defeito, a peça refeita ou a remoção. O resto
 * da edição não muda (o que passou fica).
 */
export async function consertarEdicao(
  e: EntradaDoEditor,
  edicao: EdicaoDoEditor,
  defeitos: DefeitoDaRevisao[],
  quadrosDoDefeito: Array<{ t: number; base64: string }>
): Promise<{ edicao: EdicaoDoEditor; trocados: number; removidos: number }> {
  const ids = [...new Set(defeitos.map((d) => d.momento).filter((x): x is string => Boolean(x)))];
  const alvo = edicao.momentos.filter((m) => ids.includes(String(m.id)));
  const semMomento = defeitos.filter((d) => !d.momento);
  if (!alvo.length && !semMomento.length) return { edicao, trocados: 0, removidos: 0 };
  const fala = falaNumerada(e.frases);
  const msg = [
    `# A FALA, NUMERADA\n${fala}`,
    `# A EDIÇÃO ATUAL DOS MOMENTOS COM DEFEITO\n${JSON.stringify(alvo, null, 1)}`,
    `# O QUE O REVISOR VIU NO VÍDEO RENDERIZADO (os quadros acima são os do defeito)\n${defeitos.map((d) => `- ${d.momento ?? "sem peça"} em ${d.t.toFixed(1)} s, ${d.tipo}: ${d.descricao} (sugestão: ${d.conserto})`).join("\n")}`,
    `# A TAREFA\nConserte cada momento com defeito: reescreva a peça (outra peça, outro texto, outro tempo, outro lado) ou remova. Defeito sem peça (por exemplo, "falta algo aqui" ou câmera ruim) pode virar um momento novo ou uma câmera. Responda só o JSON: { "momentos": [momentos refeitos, com o MESMO id do que substituem; ids novos para os novos], "remover": ["ids"], "camera": [] }`,
  ].join("\n\n");
  const r = (await chamar(contexto(e), msg, quadrosDoDefeito.slice(0, 16), e, "editor-sob-medida-conserto")) as { momentos?: MomentoDoEditor[]; remover?: string[]; camera?: EdicaoDoEditor["camera"] };
  const novos = (r.momentos ?? []).filter((m) => m && m.peca && m.de && m.ate);
  const remover = new Set((r.remover ?? []).map(String));
  const porId = new Map(novos.map((m) => [String(m.id), m]));
  let trocados = 0;
  const momentos = edicao.momentos
    .filter((m) => !remover.has(String(m.id)))
    .map((m) => {
      const n = porId.get(String(m.id));
      if (n) {
        trocados++;
        porId.delete(String(m.id));
        return n;
      }
      return m;
    });
  // O momento com defeito que o editor não refez nem removeu sai: só fica o que passou.
  const restantes = momentos.filter((m) => !(ids.includes(String(m.id)) && !novos.some((n) => String(n.id) === String(m.id))));
  const removidos = edicao.momentos.length - restantes.length;
  return {
    edicao: { ...edicao, momentos: [...restantes, ...porId.values()], camera: [...(edicao.camera ?? []), ...(r.camera ?? [])] },
    trocados,
    removidos: Math.max(0, removidos),
  };
}
