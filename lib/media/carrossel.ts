import { askClaude } from "@/lib/claude";
import { gerarImagem } from "@/lib/media/nano-banana";
import { avisoDoRecuoDaArte } from "@/lib/media/peca-de-feed";
import { ajustarParaFormato } from "@/lib/media/margem-de-seguranca";
import { formatoDaPeca, MAXIMO_DE_LAMINAS, REDES_COM_CARROSSEL } from "@/lib/media/formatos-das-redes";
import {
  roteiroGuardado,
  guardarRoteiro,
  laminaGuardada,
  guardarLamina,
} from "@/lib/media/checkpoint-do-carrossel";
import { arteComMaterialDoCliente, comporFraseNaArte, layoutDaPeca, marcaDaArte, modeloDaMarca, modeloParaOMaterial, promptDaArteSemTexto, proporcaoDaArte, type MarcaDaArte } from "@/lib/media/arte-com-frase";
import type { MaterialDaMarca } from "@/lib/materiais/escolha";

/**
 * O CARROSSEL, que existia no código e nunca existiu no produto.
 *
 * Estado até 18/09: `carousel` estava em `CONTENT_TYPES`, escondido do seletor
 * por `VISIBLE_CONTENT_TYPES`, e a esteira "gerava" um chamando o modelo de
 * imagem três vezes com "slide 2, continuation" e "slide 3, call to action"
 * colados no fim do mesmo prompt. Isso não é carrossel: são três imagens
 * parecidas e sem fio condutor, no formato errado, com o texto que o modelo
 * quisesse desenhar.
 *
 * O que um carrossel é, e o que este arquivo entrega:
 *
 *   1. UM ROTEIRO antes de qualquer imagem. Lâmina 1 para, lâmina 2 explica,
 *      as do meio desenvolvem e a última pede a ação. Cada lâmina tem a frase
 *      que vai desenhada nela, escrita por quem escreve texto, e não pelo
 *      modelo de imagem;
 *   2. TODAS AS LÂMINAS NA MESMA PROPORÇÃO, 1080x1350. O Instagram trava a
 *      proporção da primeira lâmina para o carrossel inteiro: uma lâmina fora
 *      do padrão entra recortada e leva as seguintes junto;
 *   3. GPT IMAGE 2, porque o carrossel é a peça em que o texto DENTRO da arte
 *      mais importa, e é onde o modelo de imagem do Gemini mais erra.
 *      Mudou em 01/10: a frase é composta em código desde 30/09, o modelo só
 *      desenha a cena, e a lâmina segue o seletor IMAGEM_ARTE (GPT Image 2.5
 *      baixa pela Higgsfield), com o recuo de toda arte (lib/media/nano-banana.ts).
 */

export interface LaminaDoCarrossel {
  /** A frase que vai desenhada na lâmina, em português. */
  frase: string;
  /** O que a lâmina mostra, em inglês, para o modelo de imagem. */
  visual: string;
}

/** As redes do dia que aceitam carrossel. O X não aceita. */
export function redesQueAceitamCarrossel(redes: string[]): string[] {
  return redes.filter((r) => (REDES_COM_CARROSSEL as readonly string[]).includes(r));
}

/** Quantas lâminas cabem em TODAS as redes escolhidas. */
export function laminasPermitidas(redes: string[]): number {
  const aceitam = redesQueAceitamCarrossel(redes);
  if (aceitam.length === 0) return 0;
  return Math.min(...aceitam.map((r) => MAXIMO_DE_LAMINAS[r] ?? 10));
}

/**
 * O roteiro, escrito antes de qualquer imagem.
 *
 * Sai de uma chamada de texto, e não do modelo de imagem, porque a frase de
 * cada lâmina é COPY: ela precisa carregar o argumento do post, respeitar as
 * regras do cliente e não inventar número. Modelo de imagem não faz nada
 * disso; ele desenha o que ouve.
 */
export async function roteiroDoCarrossel(opcoes: {
  textoDoPost: string;
  laminas: number;
  estiloVisual: string;
  nicho?: string | null;
  projectId?: string;
  runId?: string;
  /**
   * A chave do checkpoint, estável entre tentativas da fila (run + dia).
   *
   * Com ela o roteiro é escrito UMA vez por dia de campanha. Sem ela o Claude
   * escreve de novo a cada retentativa, e como ele não é determinístico as
   * lâminas já desenhadas deixam de casar com a sequência nova. Ver
   * lib/media/checkpoint-do-carrossel.ts.
   */
  chave?: string;
}): Promise<LaminaDoCarrossel[]> {
  const n = Math.max(3, Math.min(opcoes.laminas, 20));

  if (opcoes.chave) {
    const guardado = await roteiroGuardado(opcoes.chave);
    if (guardado) return guardado.slice(0, n);
  }
  const bruto = await askClaude(
    `Você escreve carrossel para rede social. Um carrossel é uma sequência: a primeira lâmina faz a pessoa parar, as do meio entregam o argumento uma ideia por vez, e a última pede uma ação.

Responda SÓ com JSON, sem texto antes nem depois, neste formato exato:
[{"frase":"...","visual":"..."}]

Regras que não se negociam:
- exatamente ${n} lâminas;
- "frase" em PORTUGUÊS, no máximo 12 palavras, é o que vai DESENHADO na lâmina. Nunca uma frase cortada pela metade;
- "visual" em INGLÊS, descrevendo a cena da lâmina: composição, luz, materiais, mood. Coerente entre as lâminas: mesma paleta, mesmo tratamento, mesma família tipográfica;
- NUNCA invente número, percentual, data ou nome que não esteja no post abaixo. Sem dado, a lâmina fala qualitativo;
- a última lâmina pede UMA ação, e só uma;
- nada de travessão em português.`,
    `ESTILO VISUAL OBRIGATÓRIO (em inglês, aplique nas ${n} lâminas):
${opcoes.estiloVisual}

NICHO: ${opcoes.nicho ?? "negócios"}

POST QUE ESTE CARROSSEL ACOMPANHA:
${opcoes.textoDoPost.slice(0, 3000)}`,
    {
      maxTokens: 8192,
      usage: { projectId: opcoes.projectId, runId: opcoes.runId, operation: "carrossel_roteiro" },
    }
  );

  // O modelo devolve JSON dentro de cerca ou com texto em volta com alguma
  // frequência. Peneirar aqui é mais barato que uma retentativa, e o formato
  // errado tem que quebrar alto, não virar carrossel de uma lâmina.
  const recorte = bruto.slice(bruto.indexOf("["), bruto.lastIndexOf("]") + 1);
  let lido: unknown;
  try {
    lido = JSON.parse(recorte);
  } catch {
    throw new Error("O roteiro do carrossel não veio como JSON válido.");
  }
  if (!Array.isArray(lido) || lido.length === 0) throw new Error("O roteiro do carrossel veio vazio.");

  const laminas = (lido as Array<Record<string, unknown>>)
    .map((l) => ({ frase: String(l.frase ?? "").trim(), visual: String(l.visual ?? "").trim() }))
    .filter((l) => l.frase && l.visual);

  if (laminas.length < 3) throw new Error(`O roteiro do carrossel veio com ${laminas.length} lâmina(s) válida(s).`);
  const escolhidas = laminas.slice(0, n);
  if (opcoes.chave) await guardarRoteiro(opcoes.chave, escolhidas);
  return escolhidas;
}

export interface CarrosselPronto {
  /** As lâminas, na ordem, já em 1080x1350. */
  urls: string[];
  roteiro: LaminaDoCarrossel[];
  avisos: string[];
  /** Quantas lâminas tiveram que ser refeitas por margem. */
  refeitas: number;
}

/**
 * Desenha o carrossel inteiro.
 *
 * Uma arte só serve as três redes que aceitam carrossel, porque as três usam a
 * MESMA proporção. É o contrário da imagem livre, em que cada proporção é uma
 * geração: aqui o formato é um só por definição do Instagram.
 *
 * `permitirGemini` não decide mais nada desde 01/10 (ver o corpo): ficou só
 * para não quebrar quem chama.
 */
export class CarrosselNaoCoube extends Error {
  /** Quantas lâminas ficaram prontas e guardadas antes de o tempo acabar. */
  readonly prontas: number;
  constructor(prontas: number, total: number) {
    super(
      `O carrossel não coube no tempo desta tentativa: ${prontas} de ${total} lâmina(s) prontas e guardadas. ` +
        `A próxima tentativa continua de onde esta parou, sem pagar as lâminas de novo.`
    );
    this.name = "CarrosselNaoCoube";
    this.prontas = prontas;
  }
}

export async function desenharCarrossel(opcoes: {
  roteiro: LaminaDoCarrossel[];
  estiloVisual: string;
  permitirGemini?: boolean;
  projectId?: string;
  runId?: string;
  /** A chave do checkpoint, a MESMA passada ao roteiro. Ver o módulo do checkpoint. */
  chave?: string;
  /**
   * O instante (epoch ms) em que esta tentativa precisa ter acabado.
   *
   * Sem isso a função é MORTA pela plataforma aos 800 s e tudo que ela
   * desenhou some junto. Com isso ela para por conta própria, deixa o que já
   * fez guardado no checkpoint e devolve um erro que diz isso em português.
   */
  prazoEm?: number;
  /**
   * Chamado quando cada lâmina fica pronta, para a esteira poder logar.
   *
   * Na prova de 19/09 este arquivo passou 800 segundos sem escrever UMA linha
   * de log, e foi o que tornou o defeito difícil de achar: pelo log, a esteira
   * simplesmente parava depois do roteiro. Silêncio dentro de um trabalho com
   * prazo é defeito por si só.
   */
  aoTerminarLamina?: (i: number, total: number, reaproveitada: boolean) => void | Promise<void>;
  /** Família da linguagem e cores da marca. Sem isto, lidas do projeto. */
  marca?: MarcaDaArte;
}): Promise<CarrosselPronto> {
  const formato = formatoDaPeca("instagram", "carousel");
  // A instrução de formato não vai mais ao modelo: ele desenha só a arte, na
  // proporção da zona da arte, e a frase é composta em código (30/09).
  const marcaDoProjeto = opcoes.marca ?? (await marcaDaArte(opcoes.projectId, { runId: opcoes.runId }));
  // Um layout só para o carrossel inteiro, tirado da primeira lâmina (01/10):
  // a variedade de layout é entre peças, não entre lâminas da mesma peça.
  const ancora = opcoes.roteiro[0]?.frase ?? "";
  const marca: MarcaDaArte = { ...marcaDoProjeto, variante: layoutDaPeca(marcaDoProjeto, ancora).variante };
  // O MODELO DO BOOK (03/10): um só para o carrossel inteiro, escolhido pela
  // primeira lâmina; o roteiro inteiro é o contexto dos textos extras.
  // OS MATERIAIS DO CLIENTE (03/10, lib/materiais): cada lâmina leva a foto
  // real que serve à frase dela, sem repetir no mesmo carrossel. Escolhidos em
  // fila, antes de desenhar, para as lâminas em paralelo não pegarem a mesma.
  const materialDaLamina: Array<MaterialDaMarca | null> = opcoes.roteiro.map(() => null);
  if (marca.materiais?.length) {
    const { escolherMaterial } = await import("@/lib/materiais/escolha");
    const usados = new Set<string>();
    const fio = opcoes.roteiro.map((l) => l.frase).join(" | ");
    for (let i = 0; i < opcoes.roteiro.length; i++) {
      const m = await escolherMaterial({ materiais: marca.materiais, frase: opcoes.roteiro[i].frase, contexto: fio, projectId: opcoes.projectId, evitar: usados, chave: `carrossel:${i}` }).catch(() => null);
      materialDaLamina[i] = m;
      if (m) usados.add(m.id);
    }
  }
  const comPagina = { ...marca, pagina: { i: 0, total: opcoes.roteiro.length } };
  const doMaterial = materialDaLamina[0] ?? materialDaLamina.find(Boolean) ?? null;
  const modeloPeloMaterial = doMaterial ? await modeloParaOMaterial(comPagina, doMaterial, formato.largura, formato.altura, ancora) : null;
  const modeloDoCarrossel = modeloPeloMaterial?.usar && modeloPeloMaterial.modelo ? modeloPeloMaterial.modelo : await modeloDaMarca(comPagina, formato.largura, formato.altura, ancora);
  if (modeloDoCarrossel) {
    marca.modeloFixo = modeloDoCarrossel.id;
    marca.contexto = marca.contexto ?? opcoes.roteiro.map((l) => l.frase).join("\n");
  }
  const { proporcaoDaFotoDoModelo, direcaoDaFotoDoModelo } = await import("@/lib/modelos-de-arte/compor");
  const proporcaoDaFoto = modeloDoCarrossel ? proporcaoDaFotoDoModelo(modeloDoCarrossel, formato.largura, formato.altura) : null;
  const proporcaoArte = proporcaoDaFoto ?? proporcaoDaArte(formato.largura, formato.altura, marca, ancora);
  // Desde 01/10 não há mais "premium" nem queda decidida aqui: a lâmina vai
  // ao seletor da arte, e a fila, o recuo e o registro de quem respondeu
  // moram em lib/media/nano-banana.ts. `permitirGemini` ficou por
  // compatibilidade (todo chamador passava true). O aviso não nomeia
  // fornecedor: vai para o log da execução, que o cliente lê.
  const avisos: string[] = [`Carrossel de ${opcoes.roteiro.length} lâminas, ${formato.rotulo}.`];
  const urls: string[] = new Array(opcoes.roteiro.length);
  const refeitas = 0; // sem retentativa por margem desde 30/09 (a frase é composta em código)

  /**
   * O prompt de uma lâmina, com a posição dela na sequência.
   *
   * O corpo do prompt saiu daqui em 19/09 e virou `promptDePecaDeFeed`, em
   * lib/media/peca-de-feed.ts. Não foi arrumação: era ESTE prompt que fazia o
   * carrossel sair como post enquanto a imagem avulsa saía como dashboard em
   * inglês, e ele estava escrito num lugar só, dentro do carrossel. Uma regra
   * que define o que é um post não pode morar dentro de um tipo de peça.
   */
  const promptDaLamina = (i: number) => {
    // TEXTO EM ARTE É CÓDIGO (30/09): o sábado do teste de 30/09 saiu com
    // passos numerados de 1 a 4 que ninguém pediu e fotos de estranhos em
    // todas as lâminas. O modelo desenha só a cena; a frase vem depois.
    const lamina = opcoes.roteiro[i];
    return promptDaArteSemTexto({
      visual: `${lamina.visual} (the same visual treatment across every slide of this carousel)`,
      estilo: opcoes.estiloVisual,
      marca,
      // A frase da lâmina varia o enquadramento; o layout já está fixo na marca.
      frase: lamina.frase,
    });
  };

  /**
   * Desenha UMA lâmina, com a retentativa por margem.
   *
   * A primeira lâmina sai sozinha, antes das outras: se o modelo principal
   * estiver fora, é ela que abre o recuo (lib/media/imagem-higgsfield.ts), e
   * as seguintes já vão direto à reserva em vez de cada uma pagar a espera.
   */
  async function desenharUma(i: number): Promise<string> {
    const base = promptDaLamina(i);
    const ctx = { projectId: opcoes.projectId, runId: opcoes.runId, operation: "carrossel_lamina" };
    let uri: string | null = null;

    /**
     * JÁ DESENHADA NUMA TENTATIVA ANTERIOR? NÃO PAGA DE NOVO.
     *
     * Esta é a linha que o defeito de 19/09 pediu. A retentativa da fila é
     * normal e esperada; o que não pode é ela custar o preço cheio outra vez.
     */
    if (opcoes.chave) {
      const guardada = await laminaGuardada(opcoes.chave, i, opcoes.roteiro[i].frase);
      if (guardada) {
        await opcoes.aoTerminarLamina?.(i, opcoes.roteiro.length, true);
        return guardada;
      }
    }

    // UMA tentativa desde 30/09. A retentativa existia para frase desenhada
    // que a borda cortava; com a frase composta em código dentro da margem,
    // isso deixou de acontecer, e a arte encostar na borda é de propósito.
    // A FOTO REAL DA LÂMINA (03/10): composta sem imagem paga.
    const material = materialDaLamina[i];
    if (material) {
      const r = await arteComMaterialDoCliente({
        frase: opcoes.roteiro[i].frase,
        marca: modeloDoCarrossel ? { ...marca, pagina: { i, total: opcoes.roteiro.length } } : marca,
        largura: formato.largura,
        altura: formato.altura,
        material,
      }).catch(() => null);
      if (r) uri = (await ajustarParaFormato(r.jpeg, formato)).dataUri;
    }
    if (!uri) {
      // Modelo do book sem foto (lista, citação, só texto): nenhuma imagem paga.
      let arte: Buffer | null = null;
      if (!modeloDoCarrossel || proporcaoDaFoto) {
        const prompt = modeloDoCarrossel ? `${base}${direcaoDaFotoDoModelo(modeloDoCarrossel)}` : base;
        const r = await gerarImagem(prompt, proporcaoArte, "hd", ctx, { tipo: "arte" });
        const bruta = r.dataUrl;
        const aviso = avisoDoRecuoDaArte(r.modelo);
        if (aviso && !avisos.includes(aviso)) avisos.push(aviso);
        arte = Buffer.from(bruta.slice(bruta.indexOf(",") + 1), "base64");
      }

      const composta = await comporFraseNaArte({
        arte,
        frase: opcoes.roteiro[i].frase,
        marca: modeloDoCarrossel ? { ...marca, pagina: { i, total: opcoes.roteiro.length } } : marca,
        largura: formato.largura,
        altura: formato.altura,
      });
      uri = (await ajustarParaFormato(composta, formato)).dataUri;
    }

    // Guardar ANTES de devolver, e não no fim do carrossel inteiro: se a
    // função morrer na lâmina seguinte, esta já está paga e salva.
    if (opcoes.chave && uri) await guardarLamina(opcoes.chave, i, opcoes.roteiro[i].frase, uri);
    await opcoes.aoTerminarLamina?.(i, opcoes.roteiro.length, false);
    return uri!;
  }

  /** Ainda dá tempo de encarar mais uma leva? */
  function acabouOTempo(): boolean {
    if (!opcoes.prazoEm) return false;
    // A folga é o tempo de UMA lâmina com a retentativa de margem (medido em
    // 19/09: 69 s a lâmina, até duas por lâmina). Entrar numa leva sem essa
    // folga é começar algo que a plataforma vai matar no meio.
    return Date.now() + 150_000 > opcoes.prazoEm;
  }

  /**
   * A PRIMEIRA LÂMINA SAI SOZINHA, E AS OUTRAS EM PARALELO.
   *
   * Medido em 19/09, com saldo na conta: uma lâmina no GPT Image 2 em alta
   * qualidade leva **69 segundos**. Em sequência, cinco lâminas são 5,8
   * minutos e dez são 11,6. O dia da campanha tem 830 segundos no total para
   * OS CINCO AGENTES, então dez lâminas em sequência não cabem: o teto de
   * lâminas passaria a ser o orçamento da fila, e não o que o Instagram
   * aceita.
   *
   * As lâminas são independentes (cada uma é uma chamada com o próprio
   * prompt), então o paralelo é de graça em qualidade. Em levas de TRÊS, e não
   * todas de uma vez, porque dez chamadas simultâneas de imagem é o tipo de
   * rajada que fornecedor nenhum gosta, e uma recusa por excesso custaria mais
   * tempo do que o paralelo economiza.
   *
   * A primeira fica de fora da leva: é ela que descobre a falta de saldo e
   * abre o recuo para as outras (01/10: o recuo é o da arte, em nano-banana.ts).
   */
  urls[0] = await desenharUma(0);

  const POR_LEVA = 3;
  for (let inicio = 1; inicio < opcoes.roteiro.length; inicio += POR_LEVA) {
    if (acabouOTempo()) {
      throw new CarrosselNaoCoube(urls.filter(Boolean).length, opcoes.roteiro.length);
    }
    const leva = [];
    for (let i = inicio; i < Math.min(inicio + POR_LEVA, opcoes.roteiro.length); i++) {
      leva.push(desenharUma(i).then((uri) => ({ i, uri })));
    }
    for (const { i, uri } of await Promise.all(leva)) urls[i] = uri;
  }

  return { urls, roteiro: opcoes.roteiro, avisos, refeitas };
}
