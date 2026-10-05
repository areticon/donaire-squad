import manifesto from "@/lib/modelos-de-arte/fotos-do-book.json";
import { MODELOS_DE_ARTE } from "@/lib/modelos-de-arte/catalogo";

/**
 * AS FOTOS DAS PRÉVIAS DO BOOK (05/10/2026).
 *
 * Reclamação do Bruno: todas as prévias usavam a mesma foto (uma por setor,
 * em public/modelos-de-arte/fotos) e o "Você na frente do título" mostrava uma
 * silhueta preta. Agora cada modelo com foto ganha uma foto diferente, de alta
 * resolução e de graça (Pixabay, curada a olho e guardada no Blob público por
 * scripts/fotos-do-book): primeiro as do setor do cliente, intercaladas com uma
 * reserva variada (pessoas de banco, ambientes, produtos, plantas, comida,
 * arquitetura), alternando o tipo para a vitrine não repetir assunto. Nada é
 * gerado e nada é pago; o manifesto é estático, então a tela abre na hora.
 *
 * AS PESSOAS (05/10, segunda queixa, com print): todas as prévias com pessoa
 * recortada mostravam a MESMA mulher (de óculos, lendo um livro), inclusive nos
 * 18 modelos novos. Agora o banco tem mais de vinte pessoas fictícias de banco
 * gratuito, recortadas de graça no computador (scripts/fotos-do-book/pessoas.mts),
 * variadas em sexo, idade, etnia, traje e pose, e o SORTEIO é por projeto E por
 * modelo: a ordem das pessoas muda com o projeto e cada modelo da galeria pega
 * a pessoa da posição dele, de modo que dois modelos na mesma tela nunca
 * mostram a mesma pessoa. A foto real do cliente, quando existe recortada,
 * continua tendo prioridade (a rota manda `pessoa` com origem "cliente").
 */

export type TipoDaFoto = "pessoa" | "ambiente" | "produto" | "planta" | "comida" | "arquitetura";

export interface FotoDaPrevia {
  /** A versão leve, para o cartão da galeria (540 px). */
  p: string;
  /** A versão grande, para a ficha do modelo (1280 px). */
  g: string;
  tipo: TipoDaFoto;
}

/** A pessoa recortada da prévia: fundo e recorte do mesmo tamanho, alinhados. */
export interface PessoaDaPrevia {
  fundo: string;
  recorte: string;
  /** "cliente": a foto real do cliente; "banco": pessoa fictícia de banco de imagem. */
  origem: "cliente" | "banco";
  /** A pose e o perfil (só nas de banco), para a galeria variar a pose entre vizinhos. */
  rotulo?: string;
  /** "rosto": cabeça e ombros; "corpo": meio corpo ou inteiro (só nas de banco). */
  enquadramento?: "rosto" | "corpo";
}

interface FotoDoManifesto {
  id: number;
  tipo: string;
  g: string;
  p: string;
}

interface PessoaDoManifesto {
  id: number;
  fundo: string;
  recorte: string;
  rotulo?: string;
  enquadramento?: string;
}

/**
 * Os modelos cujo título fica EMBAIXO, por cima da pessoa: um rosto em close
 * ficaria escondido atrás do texto, então nessas posições entra alguém de
 * meio corpo ou corpo inteiro. A posição é a ordem do modelo entre os modelos
 * com recorte, a mesma que a galeria usa.
 */
const ARQUETIPOS_QUE_PEDEM_CORPO = new Set(["retrato-bloco"]);
const POSICOES_QUE_PEDEM_CORPO = MODELOS_DE_ARTE.filter((m) => m.foto === "recorte")
  .map((m, i) => (ARQUETIPOS_QUE_PEDEM_CORPO.has(m.arquetipo) ? i : -1))
  .filter((i) => i >= 0);

const SETORES = manifesto.setores as Record<string, FotoDoManifesto[]>;
const RESERVA = manifesto.reserva as FotoDoManifesto[];
const PESSOAS = manifesto.pessoas as PessoaDoManifesto[];

/** A ordem em que os tipos se alternam na vitrine. */
const RODIZIO: TipoDaFoto[] = ["pessoa", "ambiente", "produto", "comida", "arquitetura", "planta"];

/** Um número estável a partir de um texto, para variar entre projetos sem sortear a cada abertura. */
export function semente(t: string): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return Math.abs(h);
}

/**
 * As fotos da vitrine, em ordem: as do setor antes das da reserva, alternando o
 * tipo. Sem repetir foto. O projeto desloca o começo da reserva, para dois
 * clientes do mesmo setor não verem exatamente a mesma sequência.
 */
export function fotosDaVitrine(setor: string, projectId: string): FotoDaPrevia[] {
  const doSetor = SETORES[setor] ?? [];
  const desloca = semente(projectId) % Math.max(1, RESERVA.length);
  const reserva = [...RESERVA.slice(desloca), ...RESERVA.slice(0, desloca)];
  // As pessoas do recorte não se repetem como foto de outro modelo (só conta
  // as que também estão nas listas de fotos; as demais pessoas não entram aqui).
  const idsDePessoa = new Set<number>(PESSOAS.map((x) => x.id));
  const usadas = new Set<number>(idsDePessoa);
  const saida: FotoDaPrevia[] = [];
  const total = [...doSetor, ...reserva].filter((f) => !idsDePessoa.has(f.id)).length;
  let volta = 0;
  while (saida.length < total && volta < total * RODIZIO.length) {
    const tipo = RODIZIO[volta % RODIZIO.length];
    volta++;
    const f = doSetor.find((x) => x.tipo === tipo && !usadas.has(x.id)) ?? reserva.find((x) => x.tipo === tipo && !usadas.has(x.id));
    if (!f) continue;
    usadas.add(f.id);
    saida.push({ p: f.p, g: f.g, tipo: f.tipo as TipoDaFoto });
  }
  return saida;
}

/** Um embaralhamento estável (Fisher-Yates com semente): a mesma semente dá a mesma ordem. */
function embaralhar<T>(lista: T[], s: number): T[] {
  const saida = [...lista];
  let x = s >>> 0 || 1;
  for (let i = saida.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = x % (i + 1);
    [saida[i], saida[j]] = [saida[j], saida[i]];
  }
  return saida;
}

/** A primeira palavra do rótulo ("homem", "mulher", "médica"...), para alternar o perfil entre vizinhos. */
const perfil = (p: PessoaDoManifesto) => (p.rotulo ?? "").split(" ")[0];

/**
 * As pessoas de banco para o projeto, em ordem: embaralhadas pela semente do
 * projeto e depois alternadas para dois vizinhos não terem o mesmo perfil
 * (homem, mulher) nem a mesma pose. A galeria dá a cada modelo com recorte a
 * pessoa da posição dele nesta lista: sem repetição na mesma tela.
 */
export function pessoasDeBanco(projectId: string): PessoaDaPrevia[] {
  if (!PESSOAS.length) return [];
  const fila = embaralhar(PESSOAS, semente(`pessoas:${projectId}`));
  const saida: PessoaDoManifesto[] = [];
  while (fila.length) {
    const anterior = saida[saida.length - 1];
    const pedeCorpo = POSICOES_QUE_PEDEM_CORPO.includes(saida.length);
    const serve = (p: PessoaDoManifesto) => (!pedeCorpo || p.enquadramento !== "rosto") && (!anterior || (perfil(p) !== perfil(anterior) && p.rotulo !== anterior.rotulo));
    let i = fila.findIndex(serve);
    if (i < 0) i = pedeCorpo ? fila.findIndex((p) => p.enquadramento !== "rosto") : -1;
    saida.push(fila.splice(i >= 0 ? i : 0, 1)[0]);
  }
  // "?v=2": o enquadramento mudou em 05/10 no mesmo caminho do Blob; a versão fura o cache.
  return saida.map((p) => ({ fundo: `${p.fundo}?v=2`, recorte: `${p.recorte}?v=2`, origem: "banco" as const, rotulo: p.rotulo, enquadramento: p.enquadramento === "rosto" ? "rosto" : "corpo" }));
}

/** A pessoa de banco de uma posição (o modelo da galeria passa a posição dele). */
export function pessoaDeBanco(projectId: string, posicao = 0): PessoaDaPrevia | null {
  const lista = pessoasDeBanco(projectId);
  return lista.length ? lista[posicao % lista.length] : null;
}
