import Anthropic from "@anthropic-ai/sdk";
import { recordUsage } from "@/lib/claude/usage";
import { DEFAULT_MODEL } from "@/lib/claude";

/**
 * O agente que olha a gravação e decide como enquadrar cada corte.
 *
 * Ideia do Bruno (22/08): em vez de perguntar ao cliente que tipo de gravação
 * ele mandou, o squad tira alguns quadros, olha, e decide sozinho. Os quadros
 * são descartados depois, servem só para a decisão.
 *
 * A razão de existir veio de um teste com dado real: o corte vertical estava
 * tecnicamente perfeito (1080x1920, sem tarja preta, fundo desfocado) e mesmo
 * assim inútil, porque a gravação era um screencast de slides e o resultado era
 * um slide minúsculo boiando no meio do quadro. O tratamento certo depende do
 * que está na tela, e só quem olha sabe.
 *
 * Decidido POR TRECHO, e não por vídeo: uma gravação alterna slide e câmera, e
 * uma decisão única erraria metade dos cortes.
 *
 * O agente devolve mais que a classificação: devolve ONDE cada coisa está. Com
 * as caixas em mãos, o corte vira slide grande em cima e rosto embaixo, que é o
 * formato que Shorts de screencast usam. Só classificar deixaria o slide
 * pequeno do mesmo jeito.
 */

export type Caixa = { x: number; y: number; w: number; h: number };

/**
 * O quadro escolhido para virar capa, entre os candidatos do vídeo inteiro.
 *
 * Existe porque o quadro de DENTRO do trecho não serve: os melhores momentos de
 * fala não coincidem com os melhores momentos de imagem. Numa gravação com
 * slides, o trecho bom quase sempre cai numa tela compartilhada, e a capa saía
 * com um texto branco por cima de um slide, que é feio e não faz ninguém clicar
 * (apontado pelo Bruno em 23/08).
 *
 * A varredura cobre o vídeo todo, inclusive a abertura, que a seleção de
 * trechos descarta de propósito e é justamente onde muita gente aparece falando
 * em tela cheia.
 */
export type EscolhaDeCapa = {
  /** Índice do quadro candidato escolhido. */
  indice: number;
  /** Onde recortar para a capa, em fração do quadro. Null usa o quadro todo. */
  recorte: Caixa | null;
  motivo: string;
};

export type Enquadramento = {
  indice: number;
  cena: "pessoa" | "tela" | "misto";
  /** O tratamento que o worker deve aplicar no corte vertical. */
  vertical: "corte-central" | "tela-grande" | "empilhado";
  /** Onde está quem fala, em fração do quadro. Null quando não aparece. */
  pessoa: Caixa | null;
  /** Onde está o conteúdo de tela, em fração do quadro. Null quando não há. */
  tela: Caixa | null;
  motivo: string;
};

const SISTEMA = `Você olha quadros de uma gravação e decide como recortá-la para vídeo vertical de 9 por 16.

Para cada trecho você recebe um ou mais quadros. Diga o que há neles e onde está cada coisa.

Classifique a cena:
- "pessoa": alguém falando para a câmera, ocupando boa parte do quadro. Não há conteúdo de tela relevante.
- "tela": apresentação, slide, navegador, código ou qualquer captura de tela, SEM rosto visível.
- "misto": captura de tela E uma janela de webcam com a pessoa, geralmente pequena, num canto.

Escolha o tratamento vertical:
- "corte-central" para "pessoa": recorta o meio do quadro e a pessoa preenche a tela.
- "tela-grande" para "tela": o conteúdo é ampliado para ocupar toda a largura.
- "empilhado" para "misto": o conteúdo de tela em cima e a pessoa embaixo, os dois grandes.

Devolva as caixas em FRAÇÃO do quadro, de 0 a 1, onde x e y são o canto superior esquerdo. Exemplo: uma webcam pequena no canto inferior direito fica perto de {"x":0.78,"y":0.70,"w":0.20,"h":0.28}.

Regras das caixas:
- "pessoa" é a janela da webcam no caso misto, ou a região do rosto e tronco no caso pessoa.
- "tela" é a área do conteúdo, sem barra do navegador e sem barra de tarefas. Aperte para tirar moldura vazia, MAS NUNCA CORTE TEXTO: se houver dúvida entre apertar mais e incluir a borda inteira do conteúdo, inclua. Texto cortado na lateral é pior que uma margem sobrando, porque quem assiste não consegue ler a primeira e a última palavra de cada linha.
- Quando algo não existe na cena, use null.
- Nunca devolva caixa com w ou h menor que 0,05.

Escreva o campo "motivo" em português do Brasil, em uma frase, dizendo o que você viu. Nunca use travessão.

## Segunda tarefa: escolher a capa

Depois dos trechos, você recebe quadros numerados marcados como CANDIDATOS A CAPA, tirados do vídeo inteiro. Escolha UM para virar a capa do vídeo.

O que faz um quadro ser boa capa, em ordem:
1. O rosto da pessoa aparece GRANDE e nítido, de preferência ocupando boa parte do quadro. Capa de canal pessoal vive do rosto.
2. Ela está olhando para a câmera, ou perto disso.
3. Expressão viva: falando, gesticulando, reagindo. Não boca aberta no meio de uma sílaba, não olho fechado.
4. Boa luz e fundo limpo.

O que NÃO serve:
- Quadro só de slide, tela compartilhada ou apresentação, mesmo que tenha uma webcam pequena no canto. Rosto pequeno não vira capa.
- Pessoa desfocada, de costas, ou saindo do quadro.

No campo "recorte", diga onde cortar para a capa ficar em 16 por 9 com o rosto grande e bem posicionado, em fração do quadro. Se o quadro inteiro já serve, use null.

Se NENHUM candidato tiver rosto grande, escolha o menos ruim e diga isso no motivo.

Responda SOMENTE com JSON válido, sem cercas de código, sem quebra de linha dentro de string:
{"trechos":[{"indice":0,"cena":"misto","vertical":"empilhado","pessoa":{"x":0,"y":0,"w":0,"h":0},"tela":{"x":0,"y":0,"w":0,"h":0},"motivo":"..."}],"capa":{"indice":0,"recorte":{"x":0,"y":0,"w":0,"h":0},"motivo":"..."}}`;

let _client: Anthropic | null = null;
function cliente(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
      timeout: 300_000,
      maxRetries: 1,
    });
  }
  return _client;
}

/** Caixa que não faz sentido vira null, e o tratamento cai para o seguro. */
function caixaValida(c: unknown): Caixa | null {
  if (!c || typeof c !== "object") return null;
  const { x, y, w, h } = c as Record<string, unknown>;
  const nums = [x, y, w, h];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  const cx = x as number, cy = y as number, cw = w as number, ch = h as number;
  if (cw < 0.05 || ch < 0.05) return null;
  if (cx < 0 || cy < 0 || cx + cw > 1.001 || cy + ch > 1.001) return null;
  return { x: cx, y: cy, w: cw, h: ch };
}

export type QuadroDeTrecho = {
  indice: number;
  /** Quadros em base64, sem o prefixo `data:`. */
  quadros: string[];
  mediaType: string;
};

export async function decidirEnquadramento(
  trechos: QuadroDeTrecho[],
  usageCtx?: { projectId?: string },
  candidatosDeCapa: string[] = []
): Promise<{ enquadramentos: Enquadramento[]; capa: EscolhaDeCapa | null }> {
  if (!trechos.length) return { enquadramentos: [], capa: null };

  const conteudo: Anthropic.ContentBlockParam[] = [];
  for (const t of trechos) {
    conteudo.push({ type: "text", text: `Trecho ${t.indice}:` });
    for (const q of t.quadros) {
      conteudo.push({
        type: "image",
        source: {
          type: "base64",
          media_type: (t.mediaType || "image/jpeg") as "image/jpeg",
          data: q,
        },
      });
    }
  }
  conteudo.push({
    type: "text",
    text: `Decida o enquadramento dos ${trechos.length} trechos acima, na ordem em que aparecem.`,
  });

  if (candidatosDeCapa.length) {
    conteudo.push({
      type: "text",
      text: `Agora os CANDIDATOS A CAPA, numerados de 0 a ${candidatosDeCapa.length - 1}, tirados ao longo do vídeo inteiro:`,
    });
    candidatosDeCapa.forEach((q, i) => {
      conteudo.push({ type: "text", text: `Candidato ${i}:` });
      conteudo.push({
        type: "image",
        source: { type: "base64", media_type: "image/jpeg", data: q },
      });
    });
  }

  const stream = cliente().messages.stream(
    {
      model: DEFAULT_MODEL,
      max_tokens: 8000,
      system: SISTEMA,
      messages: [{ role: "user", content: conteudo }],
    },
    { timeout: 300_000 }
  );
  const message = await stream.finalMessage();

  // O consumo é gravado AQUI, e não no worker, porque a conta de custo do
  // projeto vive num lugar só. Worker chamando o modelo por fora seria gasto
  // invisível, que é exatamente o problema que o timeout de 90s criou hoje.
  void recordUsage(DEFAULT_MODEL, message.usage, {
    operation: "video_enquadramento",
    ...usageCtx,
  });

  const texto = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "");

  const dados = JSON.parse(texto) as { trechos?: unknown[]; capa?: Record<string, unknown> };
  const brutos = Array.isArray(dados.trechos) ? dados.trechos : [];

  let capa: EscolhaDeCapa | null = null;
  if (candidatosDeCapa.length && dados.capa) {
    const indice = Number(dados.capa.indice);
    // Índice fora da lista vira o primeiro candidato, e não erro: capa mediana
    // é melhor que trabalho abortado por um número errado.
    const valido = Number.isInteger(indice) && indice >= 0 && indice < candidatosDeCapa.length;
    capa = {
      indice: valido ? indice : 0,
      recorte: caixaValida(dados.capa.recorte),
      motivo: typeof dados.capa.motivo === "string" ? dados.capa.motivo : "",
    };
  }

  const enquadramentos: Enquadramento[] = trechos.map((t, i) => {
    const b = (brutos[i] ?? {}) as Record<string, unknown>;
    const pessoa = caixaValida(b.pessoa);
    const tela = caixaValida(b.tela);
    const cena =
      b.cena === "pessoa" || b.cena === "tela" || b.cena === "misto"
        ? b.cena
        : "pessoa";

    // O tratamento é derivado das caixas que sobreviveram à validação, e não
    // aceito do modelo direto. "empilhado" sem as duas caixas produziria um
    // recorte em cima de coordenada inventada, e isso aparece na tela do
    // cliente como vídeo torto. Cair para o tratamento seguro é melhor.
    let vertical: Enquadramento["vertical"] = "corte-central";
    if (cena === "misto" && pessoa && tela) vertical = "empilhado";
    else if (cena === "tela" || (cena === "misto" && tela)) vertical = "tela-grande";

    return {
      indice: t.indice,
      cena,
      vertical,
      pessoa,
      tela,
      motivo: typeof b.motivo === "string" ? b.motivo : "",
    };
  });

  return { enquadramentos, capa };
}
