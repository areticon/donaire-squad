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
