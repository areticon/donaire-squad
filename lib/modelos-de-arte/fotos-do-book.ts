import manifesto from "@/lib/modelos-de-arte/fotos-do-book.json";

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
}

interface FotoDoManifesto {
  id: number;
  tipo: string;
  g: string;
  p: string;
}

const SETORES = manifesto.setores as Record<string, FotoDoManifesto[]>;
const RESERVA = manifesto.reserva as FotoDoManifesto[];
const PESSOAS = manifesto.pessoas as Array<{ id: number; fundo: string; recorte: string }>;

/** A ordem em que os tipos se alternam na vitrine. */
const RODIZIO: TipoDaFoto[] = ["pessoa", "ambiente", "produto", "comida", "arquitetura", "planta"];

/** Um número estável a partir de um texto, para variar entre projetos sem sortear a cada abertura. */
function semente(t: string): number {
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
  // As pessoas do recorte não se repetem como foto de outro modelo.
  const usadas = new Set<number>(PESSOAS.map((x) => x.id));
  const saida: FotoDaPrevia[] = [];
  const total = doSetor.length + reserva.length - PESSOAS.length;
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

/** A pessoa de banco para o "Você na frente do título", quando o cliente não tem foto recortada. */
export function pessoaDeBanco(projectId: string): PessoaDaPrevia | null {
  if (!PESSOAS.length) return null;
  const p = PESSOAS[semente(projectId) % PESSOAS.length];
  // "?v=2": o enquadramento mudou em 05/10 no mesmo caminho do Blob; a versão fura o cache.
  return { fundo: `${p.fundo}?v=2`, recorte: `${p.recorte}?v=2`, origem: "banco" };
}
