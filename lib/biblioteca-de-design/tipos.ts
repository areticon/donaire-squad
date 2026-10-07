/**
 * A BIBLIOTECA DE DESIGN FEITA PELOS USUÁRIOS (06/10/2026): os tipos puros.
 *
 * Regra do Bruno (06/10, 1h): "sobre os designs, tanto de vídeo quanto de
 * imagem, tem um campo para o usuário pedir o que quer; devemos usar os
 * designs de cada usuário para crescer nossa biblioteca e listar do mais
 * usado para o menos na galeria; assim os próprios usuários criam uma
 * biblioteca de design com IA; todo design deve ser gerado pelos melhores
 * modelos de IA".
 *
 * O que uma entrada guarda:
 *   - o PEDIDO ORIGINAL, como o cliente escreveu (português, do jeito dele);
 *   - a LINGUAGEM, em inglês, que o redator (Claude) escreveu a partir do
 *     pedido: no vídeo é o bloco de estilo que vai em todo prompt de imagem e
 *     de vídeo do Remotion (lib/media/editor-por-comando/linguagem.ts); na
 *     imagem é o prompt base do modelo de imagem (gpt-image / Gemini);
 *   - nome curto e descrição de uma linha (o cliente lê na galeria);
 *   - a prévia gerada (nula até o admin mandar gerar; cada prévia custa);
 *   - os usos (a ordem da galeria: do mais usado ao menos).
 *
 * Quem decide se um pedido é igual, variação ou novo é o JEV; quem escreve
 * nome, descrição e linguagem é o Claude; o código só grava e conta.
 *
 * Módulo puro: a tela (componente de cliente) importa daqui.
 */

export type TipoDeDesign = "video" | "imagem";

export const TIPOS_DE_DESIGN: TipoDeDesign[] = ["video", "imagem"];

export const ROTULO_DO_TIPO: Record<TipoDeDesign, string> = { video: "Vídeo", imagem: "Imagem" };

export function tipoValido(v: unknown): v is TipoDeDesign {
  return v === "video" || v === "imagem";
}

export type OrigemDoDesign = "semente" | "cliente";

/** O veredito do JEV sobre um pedido novo diante da biblioteca. */
export type VereditoDaComparacao = { veredito: "igual"; designId: string } | { veredito: "variacao"; designId: string } | { veredito: "novo" };

/** Uma entrada da biblioteca como a galeria lê (sem o nome de quem criou). */
export interface DesignDaGaleria {
  id: string;
  tipo: TipoDeDesign;
  nome: string;
  descricao: string;
  pedidoOriginal: string;
  linguagem: string;
  previaUrl: string | null;
  usos: number;
  origem: OrigemDoDesign;
  agrupadoEmId: string | null;
  catalogoId: string | null;
  /** Este projeto já usa (escolheu ou pediu) este design. */
  doProjeto?: boolean;
  /** O cliente deste projeto escreveu este pedido. */
  meu?: boolean;
  /** Está na galeria de todos (falso: só no projeto de quem pediu). */
  publico: boolean;
  createdAt: string;
}

/**
 * O PEDIDO CRU SÓ PARA QUEM O ESCREVEU (06/10, vazamento): o texto como o
 * cliente escreveu pode ter marca, nome, rosto ou contato. Os outros clientes
 * veem só a ficha (nome, descrição, linguagem), escrita a partir dos trechos
 * que o JEV disse que são só visual. A semente (o catálogo) não tem dado de
 * cliente e mostra o pedido.
 */
export function podeVerOPedido(d: Pick<DesignDaGaleria, "origem" | "meu">): boolean {
  return d.origem === "semente" || d.meu === true;
}

/**
 * O texto que vira o comando do vídeo de quem escolhe um design: o pedido,
 * quando é dele ou da semente; a descrição do visual, quando o design veio de
 * outro cliente. Nunca o pedido cru de outra pessoa.
 */
export function textoParaOComando(d: Pick<DesignDaGaleria, "origem" | "meu" | "pedidoOriginal" | "descricao" | "nome">): string {
  if (podeVerOPedido(d) && d.pedidoOriginal.trim()) return d.pedidoOriginal;
  return `${d.nome}: ${d.descricao}`;
}

/** O que o redator escreve a partir do pedido (uma chamada). */
export interface FichaDoDesign {
  nome: string;
  descricao: string;
  linguagem: string;
}

/** Tetos de texto: nome curto, descrição de uma linha, linguagem de um parágrafo. */
export const TETO = { nome: 48, descricao: 160, linguagem: 900, pedido: 1500 } as const;

/**
 * SEM TRAVESSÃO em texto nenhum (regra do Bruno): o em dash vira vírgula; o
 * hífen com espaços em volta também, porque é o travessão disfarçado.
 */
export function semTravessao(t: string): string {
  return String(t ?? "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s+-\s+/g, ", ")
    .replace(/,\s*,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
}

/** O nome, a descrição e a linguagem dentro dos tetos e sem travessão. */
export function normalizarFicha(f: Partial<FichaDoDesign> | null | undefined): FichaDoDesign | null {
  const nome = semTravessao(String(f?.nome ?? "")).replace(/[."]+$/g, "").slice(0, TETO.nome).trim();
  const descricao = semTravessao(String(f?.descricao ?? "")).slice(0, TETO.descricao).trim();
  const linguagem = semTravessao(String(f?.linguagem ?? "")).slice(0, TETO.linguagem).trim();
  if (nome.length < 3 || descricao.length < 8 || linguagem.split(" ").length < 8) return null;
  return { nome, descricao, linguagem };
}

// ─────────────────────── o modelo é só o modelo ───────────────────────

/**
 * O MODELO É SÓ O MODELO (08/10/2026). Regra do Bruno, literal: "incentivar o
 * usuário criar o seu estilo, a partir de um texto ou um áudio, e isso vai
 * alimentar a biblioteca para todos os demais (nunca usar fotos reais, dados
 * reais nos modelos); essa parte só cria o modelo, depois no quadro a IA
 * coloca o conteúdo dentro do modelo".
 *
 * O que entra na biblioteca de todos é o MOLDE: a linguagem visual, o layout,
 * a tipografia e as cores como papéis (destaque, fundo, título), nunca o
 * conteúdo. A foto real e o dado do cliente (nome, marca, número, contato,
 * rosto, produto fotografado) entram só no quadro, post a post, quando a IA
 * preenche o modelo escolhido.
 *
 * Quem separa o visual do dado do cliente é o JEV (privacidade.ts). Aqui fica
 * a regra final, pura, que decide o que é gravado e se é público:
 *   - a entrada pública guarda como pedido SÓ os trechos que o JEV disse que
 *     são visual (o pedido cru, com marca e contato, fica fora da linha);
 *   - nenhuma prévia nasce com a entrada (a prévia é gerada depois, pelo
 *     admin, com texto de exemplo e sem foto de ninguém);
 *   - uma rede de segurança em código: texto com contato, link, arquivo de
 *     imagem ou o nome do projeto ou de quem pediu nunca é público, mesmo que
 *     a conferência tenha passado. Ela só tira da galeria, nunca publica.
 */

/** A ficha de reserva (sem o redator) copia o pedido cru e é marcada com isto: nunca é pública. */
export const MARCA_DA_RESERVA = "As the client described it";

/** Por que a entrada ficou só no projeto (null quando entrou na galeria). */
export type MotivoDeFicarNoProjeto = "pedido-do-cliente" | "so-dado-do-cliente" | "ficha-com-dado-do-cliente" | "sem-conferencia" | null;

/** O que se sabe de quem pediu, para a rede de segurança: o nome do projeto, o de quem pediu, o e-mail. */
export interface DadosDoCliente {
  nomes?: Array<string | null | undefined>;
}

/** Contato, link e arquivo de imagem: nunca são descrição de visual. */
const PADROES_DE_DADO: Array<[RegExp, string]> = [
  [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, "e-mail"],
  [/(^|[\s(])@[\w.]{2,}/, "perfil de rede"],
  [/\bhttps?:\/\/|\bwww\.|\b[\w-]+\.(com|com\.br|br|net|org|io|app|me)\b/i, "site ou link"],
  [/\bblob:|\b[\w-]+\.(jpe?g|png|webp|gif|heic)\b/i, "arquivo de imagem"],
  [/\+?\d[\d\s().-]{7,}\d/, "telefone"],
];

/** Palavras genéricas de nome de negócio, que sozinhas não identificam ninguém. */
const PALAVRAS_GENERICAS = new Set(
  "clinica estudio studio consultoria marketing digital negocios academia escola empresa projeto grupo agencia store design conteudo oficial brasil servicos solucoes advocacia imoveis consorcios consorcio".split(" ")
);

/**
 * O texto carrega dado do cliente? Devolve o motivo (para o log) ou null.
 * Nome do projeto e de quem pediu contam inteiros; do nome da pessoa, cada
 * palavra de 4 letras ou mais; do nome do projeto, as palavras de 5 letras ou
 * mais que não são genéricas. Puro.
 */
export function dadoDoClienteNoTexto(texto: string, dados?: DadosDoCliente | null): string | null {
  const t = String(texto ?? "");
  for (const [re, motivo] of PADROES_DE_DADO) if (re.test(t)) return motivo;
  const alvo = ` ${textoDeBusca(t).replace(/[^a-z0-9]+/g, " ")} `;
  const nomes = (dados?.nomes ?? []).map((n) => textoDeBusca(String(n ?? "")).replace(/[^a-z0-9]+/g, " ").trim()).filter((n) => n.length >= 3);
  for (const [i, nome] of nomes.entries()) {
    if (alvo.includes(` ${nome} `)) return "nome do cliente";
    // O primeiro nome é o do projeto (genérico às vezes); os outros são de pessoa.
    const minimo = i === 0 ? 5 : 4;
    for (const palavra of nome.split(" ")) {
      if (palavra.length >= minimo && !PALAVRAS_GENERICAS.has(palavra) && alvo.includes(` ${palavra} `)) return "nome do cliente";
    }
  }
  return null;
}

/** A ficha escrita pela IA, como a entrada a recebe. */
export interface EntradaParaAGaleria {
  /** O pedido cru, como o cliente escreveu (ou falou). */
  pedido: string;
  soNoMeuProjeto?: boolean;
  /** A separação do JEV; null quando ela não rodou (só no meu projeto). */
  separacao: { visual: string[]; peloJev: boolean } | null;
  ficha: FichaDoDesign;
  fichaPor: "redator" | "reserva";
  /** A conferência do JEV na ficha escrita (falso: não conferiu ou citou o cliente). */
  fichaLimpa: boolean;
  dados?: DadosDoCliente | null;
}

/** O que é gravado na biblioteca. */
export interface EntradaDecidida {
  publico: boolean;
  motivo: MotivoDeFicarNoProjeto;
  /** O pedido que vai para a linha: na pública, só os trechos de visual. */
  pedidoGravado: string;
  nome: string;
  descricao: string;
  linguagem: string;
  /** Sempre nula ao nascer: o modelo não leva foto de ninguém. */
  previaUrl: null;
}

/** O pedido que fica na linha pública: só os trechos que o JEV disse que são visual. Puro. */
export function pedidoSoVisual(visual: string[]): string {
  return semTravessao(visual.map((v) => v.replace(/[.;\s]+$/, "")).join(". ")).slice(0, TETO.pedido);
}

/**
 * A REGRA FINAL de uma entrada nova (08/10). Só é pública quando TUDO passa:
 * o cliente não pediu "só no meu projeto", o JEV separou e achou visual, a
 * ficha é do redator (a reserva copia o pedido cru), o JEV conferiu a ficha
 * e a rede de segurança não achou dado do cliente na ficha nem no pedido
 * visual. Pública, a linha guarda só o pedido visual. Puro.
 */
export function entradaParaAGaleria(e: EntradaParaAGaleria): EntradaDecidida {
  const base = { nome: e.ficha.nome, descricao: e.ficha.descricao, linguagem: e.ficha.linguagem, previaUrl: null } as const;
  const privada = (motivo: Exclude<MotivoDeFicarNoProjeto, null>): EntradaDecidida => ({ ...base, publico: false, motivo, pedidoGravado: semTravessao(e.pedido).slice(0, TETO.pedido) });
  if (e.soNoMeuProjeto) return privada("pedido-do-cliente");
  if (!e.separacao?.peloJev) return privada("sem-conferencia");
  if (!e.separacao.visual.length) return privada("so-dado-do-cliente");
  if (e.fichaPor !== "redator" || e.ficha.linguagem.includes(MARCA_DA_RESERVA)) return privada("sem-conferencia");
  const visual = pedidoSoVisual(e.separacao.visual);
  if ([e.ficha.nome, e.ficha.descricao, e.ficha.linguagem, visual].some((t) => dadoDoClienteNoTexto(t, e.dados))) return privada("ficha-com-dado-do-cliente");
  if (!e.fichaLimpa) return privada("ficha-com-dado-do-cliente");
  return { ...base, publico: true, motivo: null, pedidoGravado: visual };
}

/** A busca na galeria: sem acento, minúsculas. */
export function textoDeBusca(t: string): string {
  return String(t ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Ordena do mais usado ao menos; empate pelo mais novo. */
export function ordenarPorUso<T extends { usos: number; createdAt: string }>(lista: T[]): T[] {
  return [...lista].sort((a, b) => b.usos - a.usos || (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}

/** Filtra por tipo e por busca (nome, descrição e pedido, que chega vazio quando é de outro cliente). */
/**
 * NADA DUAS VEZES NA MESMA TELA (06/10): em Configurações > Modelos de arte o
 * book já mostra cada modelo de imagem do catálogo, nas cores da marca. A
 * biblioteca logo abaixo tira esses (design de imagem cujo catalogoId é um id
 * do book) e fica com o que o book não tem: os estilos de vídeo e os designs
 * escritos pelos clientes.
 */
export function foraDoBook<T extends Pick<DesignDaGaleria, "tipo" | "catalogoId">>(lista: T[], idsDoBook: Iterable<string> | null | undefined): T[] {
  const ids = new Set(idsDoBook ?? []);
  if (!ids.size) return lista;
  return lista.filter((d) => !(d.tipo === "imagem" && d.catalogoId && ids.has(d.catalogoId)));
}

export function filtrarGaleria<T extends DesignDaGaleria>(lista: T[], tipo: TipoDeDesign | "todos", busca: string): T[] {
  const b = textoDeBusca(busca);
  return lista.filter((d) => (tipo === "todos" || d.tipo === tipo) && (!b || textoDeBusca(`${d.nome} ${d.descricao} ${d.pedidoOriginal}`).includes(b)));
}

/**
 * O CUSTO ESTIMADO DE UMA PRÉVIA, para o admin confirmar antes de gerar:
 * gpt-image 2 em qualidade média sai entre US$ 0,05 e 0,10 por imagem (o
 * retrato em qualidade alta é US$ 0,165; o Gemini 3 Pro, US$ 0,134, é a
 * reserva). Nenhuma prévia é gerada sem o OK, e o número aparece na tela.
 */
export const CUSTO_DA_PREVIA_USD = { minimo: 0.05, maximo: 0.1 } as const;

export function custoEstimadoDasPrevias(quantas: number): { minimo: number; maximo: number; texto: string } {
  const minimo = +(quantas * CUSTO_DA_PREVIA_USD.minimo).toFixed(2);
  const maximo = +(quantas * CUSTO_DA_PREVIA_USD.maximo).toFixed(2);
  const dolar = (v: number) => `US$ ${v.toFixed(2).replace(".", ",")}`;
  return { minimo, maximo, texto: quantas ? `${quantas} ${quantas === 1 ? "prévia" : "prévias"}: entre ${dolar(minimo)} e ${dolar(maximo)} (gpt-image 2 em qualidade média)` : "Nenhuma prévia pendente." };
}
