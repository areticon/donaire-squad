import { frasesDaFala, type Palavra } from "@/lib/media/jornada/linha-do-tempo";
import type { EstadoDaJornada, FormatoDaJornada } from "@/lib/media/jornada/estado";

/**
 * A JORNADA NA TELA DE ROTEIRO (E3): a fala com os elementos no lugar, cada um
 * com a descrição, o formato, a palavra-gatilho e o custo, e as ações por
 * elemento (aprovar, remover, pedir mudança em texto livre) e por momento sem
 * elemento (pedir um elemento novo). Módulo puro.
 */

export const NOME_DO_FORMATO: Record<FormatoDaJornada, string> = {
  "tela-cheia": "imagem em tela cheia",
  janela: "imagem em janela ao seu lado",
  "recorte-sobre": "elemento recortado sobre a gravação",
  broll: "B-roll em vídeo",
};

export type ElementoNaTela = {
  id: string;
  inicio: number;
  frase: string;
  gatilho: string;
  descricao: string;
  textoNaImagem: string | null;
  formato: string;
  custoUsd: number;
  origem: "ia" | "usuario";
  papel: string;
  estado: "aprovado" | "removido" | "alterado" | "novo";
  pedidos: string[];
  porque: string;
};

export type JornadaNaTela = {
  lendo: boolean;
  erro: string | null;
  elementos: ElementoNaTela[];
  /** As frases sem elemento, para o "pedir um elemento aqui". */
  momentosLivres: Array<{ indice: number; inicio: number; texto: string }>;
  custoTotalUsd: number;
  densidade: string | null;
  leitura: string | null;
  aprovado: boolean;
};

export function jornadaNaTela(e: EstadoDaJornada | null | undefined, palavras: Palavra[] | null | undefined): JornadaNaTela | null {
  if (!e) return null;
  const elementos: ElementoNaTela[] = (e.plano?.elementos ?? []).map((el) => {
    const rev = e.revisao[el.id];
    return {
      id: el.id,
      inicio: el.gatilho.t,
      frase: el.momento.frase,
      gatilho: el.gatilho.palavra,
      descricao: rev?.descricaoAprovada ?? el.descricao,
      textoNaImagem: rev ? rev.textoNaImagemAprovado : el.textoNaImagem,
      formato: NOME_DO_FORMATO[el.formato],
      custoUsd: el.custoUsd,
      origem: el.origem,
      papel: el.papel,
      estado: rev?.acao ?? "aprovado",
      pedidos: (rev?.pedidos ?? []).map((p) => p.texto),
      porque: el.porque,
    };
  });
  const ocupados = new Set((e.plano?.elementos ?? []).map((el) => el.momento.indice));
  const momentosLivres = palavras?.length ? frasesDaFala(palavras).filter((f) => !ocupados.has(f.indice)).map((f) => ({ indice: f.indice, inicio: f.inicio, texto: f.texto })) : [];
  const vivos = elementos.filter((x) => x.estado !== "removido");
  return {
    lendo: !e.plano && !e.erro,
    erro: e.erro ?? null,
    elementos,
    momentosLivres,
    custoTotalUsd: +vivos.reduce((s, x) => s + x.custoUsd, 0).toFixed(2),
    densidade: e.plano ? `um elemento a cada ${e.plano.densidade.segundosEntreElementos[0]} a ${e.plano.densidade.segundosEntreElementos[1]} s` : null,
    leitura: e.leitura ? `${e.leitura.cenario}. ${e.leitura.resumo}`.slice(0, 400) : null,
    aprovado: Boolean(e.aprovado),
  };
}
