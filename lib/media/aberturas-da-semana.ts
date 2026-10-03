/**
 * Nenhum dia da semana abre com o gancho de outro dia.
 *
 * No teste de 29/09 a terça, a quinta (thread do X) e o domingo (enquete)
 * abriram com a mesma frase ("Se você usa ChatGPT só no chat, o máximo que
 * você tem é um estagiário"). Não foi azar: os dias são escritos em paralelo,
 * todos recebem a mesma transcrição, e a frase mais forte do vídeo atrai todos
 * os redatores para ela. Pedir "não repita" no prompt não basta, porque um dia
 * não vê o que o outro está escrevendo ao mesmo tempo.
 *
 * Por isso a prova é feita em código: cada dia escreve em paralelo, mas o
 * registro da abertura passa por uma fila de um só. Quem chega e encontra
 * abertura parecida já registrada escreve de novo, dentro da fila, sabendo
 * exatamente quais aberturas estão tomadas. Se ainda assim repetir, o ajuste
 * final é determinístico (tirar o parágrafo de abertura), para a semana nunca
 * sair com o mesmo gancho duas vezes.
 */

const PALAVRAS_VAZIAS = new Set([
  "que", "com", "para", "por", "uma", "uns", "umas", "dos", "das", "nos", "nas", "the",
  "voce", "voces", "isso", "esse", "essa", "este", "esta", "mais", "mas", "nao", "sim",
  "como", "quando", "onde", "tem", "ter", "seu", "sua", "seus", "suas", "meu", "minha",
  "ele", "ela", "eles", "elas", "foi", "ser", "sao", "era", "vai", "ate", "sem", "sobre",
]);

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A abertura de uma peça: a primeira frase da primeira linha com texto, sem a
 * numeração da thread ("1/") nem rótulo de enquete. É o que aparece antes do
 * "ver mais", então é o que o leitor compara entre um dia e outro.
 */
export function aberturaDe(texto: string): string {
  const linha =
    texto
      .split("\n")
      .map((l) => l.replace(/^\s*(\d+\s*[/)]|[-*•>#]+)\s*/, "").replace(/^(TEXTO_INTRO|PERGUNTA)\s*:\s*/i, "").trim())
      .find((l) => l.length > 0) ?? "";
  // Primeira frase, mas nunca curta demais: "Pense nisso." sozinho não
  // identifica gancho nenhum, então junta com a seguinte.
  const frases = linha.split(/(?<=[.!?])\s+/);
  let abertura = frases[0] ?? "";
  for (let i = 1; i < frases.length && abertura.length < 40; i++) abertura += ` ${frases[i]}`;
  return abertura.slice(0, 200);
}

function palavras(texto: string): Set<string> {
  return new Set(
    normalizar(texto)
      .split(" ")
      .filter((p) => p.length >= 3 && !PALAVRAS_VAZIAS.has(p))
  );
}

/**
 * Duas aberturas são "a mesma" quando começam igual ou quando a menor está
 * quase toda dentro da maior. A medida é a sobreposição sobre o MENOR conjunto
 * de palavras, e não Jaccard: o X encurta e o LinkedIn alonga a mesma frase
 * ("ChatGPT" contra "ChatGPT ou Claude"), e Jaccard deixava passar isso.
 */
export function aberturasParecidas(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  const inicioA = na.split(" ").slice(0, 6).join(" ");
  const inicioB = nb.split(" ").slice(0, 6).join(" ");
  if (inicioA.split(" ").length >= 5 && inicioA === inicioB) return true;
  const pa = palavras(a);
  const pb = palavras(b);
  const menor = Math.min(pa.size, pb.size);
  if (menor < 3) return false;
  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / menor >= 0.6;
}

/** O bloco que vai no pedido ao redator, com as aberturas que não pode usar. */
export function instrucaoDeAberturas(tomadas: string[]): string {
  if (!tomadas.length) return "";
  return (
    `\n\nABERTURAS JÁ USADAS NESTA SEMANA (outros dias e cortes do mesmo vídeo). É PROIBIDO abrir com qualquer uma delas, ` +
    `com paráfrase delas ou com a mesma ideia de gancho. Abra com um gancho novo, tirado do ângulo DESTE dia:\n` +
    tomadas.map((t) => `- "${t}"`).join("\n")
  );
}

/**
 * Último recurso quando a nova tentativa ainda repete: tira o parágrafo de
 * abertura, desde que sobre texto de verdade. Devolve null quando não dá.
 */
function semOParagrafoDeAbertura(texto: string): string | null {
  const blocos = texto.split(/\n\s*\n/);
  if (blocos.length < 3) return null;
  const resto = blocos.slice(1).join("\n\n").trim();
  return resto.length >= 300 ? resto : null;
}

export class AberturasDaSemana {
  private registradas: Array<{ dia: string; abertura: string }> = [];
  private fila: Promise<unknown> = Promise.resolve();

  /** `iniciais`: aberturas que já existem antes de a semana ser escrita (títulos dos cortes, dias já escritos). */
  constructor(iniciais: Array<{ dia: string; abertura: string }> = []) {
    this.registradas = iniciais.filter((i) => i.abertura.trim().length > 0);
  }

  tomadas(): string[] {
    return this.registradas.map((r) => r.abertura);
  }

  private repetida(abertura: string): { dia: string; abertura: string } | undefined {
    return this.registradas.find((r) => aberturasParecidas(r.abertura, abertura));
  }

  /**
   * Escreve a peça de um dia garantindo abertura inédita na semana.
   *
   * `escrever` recebe o bloco de proibições para somar ao pedido. A primeira
   * tentativa corre em paralelo com os outros dias; a conferência e a
   * eventual reescrita correm na fila, uma de cada vez, para que dois dias
   * nunca registrem a mesma abertura ao mesmo tempo.
   *
   * `extrair` diz de onde sai a abertura (o texto inteiro, o intro da enquete,
   * a legenda do carrossel) e `ajustar` diz se o último recurso de
   * tirar o parágrafo de abertura faz sentido para esse formato.
   */
  async escrever<T>(
    dia: string,
    escrever: (proibicoes: string) => Promise<T>,
    extrair: (peca: T) => string,
    opcoes: { ajustar?: (peca: T, ajuste: (texto: string) => string | null) => T | null } = {}
  ): Promise<T> {
    let peca: T = await escrever(instrucaoDeAberturas(this.tomadas()));
    const vez = this.fila.then(async () => {
      let abertura = aberturaDe(extrair(peca));
      let conflito = this.repetida(abertura);
      if (conflito) {
        console.warn(`[semana] ${dia} abriu igual a ${conflito.dia} ("${abertura.slice(0, 80)}"); escrevendo de novo`);
        peca = await escrever(instrucaoDeAberturas(this.tomadas()));
        abertura = aberturaDe(extrair(peca));
        conflito = this.repetida(abertura);
      }
      if (conflito && opcoes.ajustar) {
        const ajustada = opcoes.ajustar(peca, semOParagrafoDeAbertura);
        if (ajustada) {
          const nova = aberturaDe(extrair(ajustada));
          if (!this.repetida(nova)) {
            peca = ajustada;
            abertura = nova;
            conflito = undefined;
          }
        }
      }
      if (conflito) console.warn(`[semana] ${dia} segue parecido com ${conflito.dia} depois da nova tentativa`);
      this.registradas.push({ dia, abertura });
    });
    // A fila anda mesmo se esta vez falhar; o erro volta para quem pediu.
    this.fila = vez.catch(() => {});
    await vez;
    return peca;
  }
}
