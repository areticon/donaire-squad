import { CATALOGO_DE_ESTILOS, arteDoEstilo, estiloDoCatalogo, type EstiloDoCatalogo } from "@/lib/media/catalogo-de-estilos";
import { medidaDaCor, papeisDaPaleta } from "@/lib/media/papeis-da-paleta";
import { REFERENCIAS_DE_COMANDO, type FonteDoComando } from "@/lib/media/editor-por-comando/comando";

/**
 * AS MINIATURAS DOS ESTILOS NA TELA DO COMANDO (05/10/2026, noite). Pedido
 * do Bruno: a tela "Comando do vídeo" mostra as miniaturas dos estilos do
 * catálogo como cartões; o clique PREENCHE o comando, em português, com:
 *   - a linguagem visual daquele estilo (como as peças são desenhadas);
 *   - as cores da marca do projeto, pela hierarquia de papeis-da-paleta;
 *   - o nicho e o público do projeto (setup, linha editorial);
 *   - os tipos de elemento, vídeo e efeito que combinam com o estilo, como
 *     SUGESTÃO de ritmo e densidade, nunca lista fechada (o JEV continua livre
 *     para escolher qualquer tipo em cada momento).
 * O texto fica editável. As 4 referências antigas (REFERENCIAS_DE_COMANDO)
 * viram a linguagem dos estilos que elas descreviam.
 *
 * Módulo puro: a tela (componente cliente) importa daqui.
 */

/** A referência antiga que descreve a linguagem de um estilo do catálogo. */
const REFERENCIA_DO_ESTILO: Record<string, string> = { vox: "vox-papel", lousa: "dan-martell-lousa", consorcio: "high-ticket", keynote: "tecnologico-passos" };

/** A letra que combina com o estilo (a do tema do editor). */
export function fonteDoEstilo(e: EstiloDoCatalogo): FonteDoComando {
  if (e.id === "consorcio" || e.id === "johnny-harris" || e.id === "crime-real") return "oswald";
  if (e.kit === "impacto") return "archivo";
  if (["vox", "bbc", "natgeo", "60-minutes", "wes-anderson", "depoimento", "institucional"].includes(e.id) || e.kit === "colagem") return "playfair";
  return "geist";
}

/** O nome da cor em português, para o cliente ler o comando (aproximado pelo matiz e pela luz). */
export function nomeDaCor(hex: string): string {
  const { l, s } = medidaDaCor(hex);
  const h = matiz(hex);
  if (l < 0.12) return "preto";
  if (l > 0.93) return "branco";
  if (s < 0.14) return l < 0.35 ? "grafite" : l > 0.75 ? "cinza claro" : "cinza";
  const base =
    h < 15 || h >= 345 ? (l < 0.3 ? "vinho" : "vermelho") :
    h < 40 ? (l < 0.3 ? "marrom" : "laranja") :
    h < 65 ? (l < 0.45 ? "dourado" : l > 0.8 ? "creme" : "amarelo") :
    h < 160 ? (l < 0.3 ? "verde-escuro" : "verde") :
    h < 200 ? (l < 0.3 ? "petróleo" : "verde-água") :
    h < 250 ? (l < 0.3 ? "azul-marinho" : "azul") :
    h < 290 ? "roxo" : "rosa";
  return l > 0.78 && !["creme", "branco"].includes(base) ? `${base} claro` : base;
}

function matiz(hex: string): number {
  const f = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

const RITMO_DA_BASE: Record<string, string> = {
  acelerado: "ritmo rápido, algo novo a cada 3 a 5 segundos",
  dramatico: "ritmo calmo, com respiro entre um elemento e outro",
  serio: "ritmo médio, algo novo a cada 6 a 10 segundos",
  animado: "ritmo médio para rápido",
};

const ELEMENTOS_DO_KIT: Record<EstiloDoCatalogo["kit"], string> = {
  colagem: "imagens recortadas e fotos de arquivo quando eu falar de algo concreto, marca-texto nas frases-chave, citação como manchete, linha do tempo quando houver datas",
  impacto: "a palavra da tese gigante atrás de mim, legenda de destaque nas palavras fortes, números animados, ícones pequenos ao meu lado",
  sobrio: "títulos limpos, números com a fonte quando eu disser dado, listas em passos, imagens em janela ao meu lado",
};

const MUITO_VIDEO = ["natgeo", "institucional", "depoimento", "crime-real", "vlog", "johnny-harris", "60-minutes"];
const POUCO_VIDEO = ["minimalista", "keynote", "tipografia", "carrossel-animado", "podcast", "quadro-branco"];

/** O que a marca tem, para o comando: a hierarquia das cores com o nome e o hex. */
export function coresNoComando(paleta: string[]): string {
  const p = papeisDaPaleta(paleta);
  if (!p) return "";
  const partes = [`${nomeDaCor(p.destaque)} (${p.destaque}) como destaque, só nos detalhes`, p.escuro ? `${nomeDaCor(p.escuro)} (${p.escuro}) nos títulos e textos` : "", p.claro ? `${nomeDaCor(p.claro)} (${p.claro}) nos fundos claros` : ""].filter(Boolean);
  return `Cores da minha marca: ${partes.join(", ")}${p.apoio.length ? "; as outras cores só de apoio" : ""}.`;
}

export type ContextoDoProjetoNoComando = { paleta: string[]; nicho?: string | null; publico?: string | null; nome?: string | null };

/** O nicho em uma frase curta (a primeira do setup). */
function nichoCurto(t: string | null | undefined): string {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const primeira = s.split(/(?<=[.!?])\s/)[0];
  return primeira.length > 170 ? `${primeira.slice(0, 167).replace(/\s+\S*$/, "")}...` : primeira.replace(/[.!?]$/, "");
}

/** O COMANDO preenchido pelo clique na miniatura: linguagem, cores, nicho e a sugestão de ritmo e elementos. */
export function comandoDoEstilo(id: string, ctx: ContextoDoProjetoNoComando): string {
  const e = estiloDoCatalogo(id);
  if (!e) return "";
  const ref = REFERENCIAS_DE_COMANDO.find((r) => r.id === REFERENCIA_DO_ESTILO[e.id]);
  // A linguagem sem as cores próprias da referência (amarelo, vermelho, azulado): as cores são as da marca, logo abaixo.
  const daReferencia = ref?.texto.split(/(?<=\.)\s+Ritmo/)[0].replace(/\.$/, "").replace(/\s(amarelo|vermelho|azulado|ciano)(?![a-zà-ú])/g, "");
  const linguagem = daReferencia ?? `Estilo ${e.nome}${e.referencia ? ` (${e.referencia})` : ""}: ${e.resumo.charAt(0).toLowerCase()}${e.resumo.slice(1).replace(/\.$/, "")}`;
  const nicho = nichoCurto(ctx.nicho);
  const publico = nichoCurto(ctx.publico);
  const video = MUITO_VIDEO.includes(e.id) ? "B-roll em vídeo gerado sempre que eu narrar uma ação ou um lugar" : POUCO_VIDEO.includes(e.id) ? "pouco vídeo gerado, só onde a fala pedir movimento" : "B-roll em vídeo nos momentos que pedirem movimento";
  const efeito = e.base === "acelerado" ? "zoom de soco nas palavras fortes" : e.base === "dramatico" ? "movimentos lentos e transições suaves" : "zoom leve nas palavras fortes";
  return [
    `${linguagem}.`,
    coresNoComando(ctx.paleta),
    nicho ? `O canal é sobre ${nicho.charAt(0).toLowerCase()}${nicho.slice(1)}${publico ? `, para ${publico.charAt(0).toLowerCase()}${publico.slice(1)}` : ""}: as imagens e as cenas mostram o mundo desse público, nunca imagem genérica.` : "",
    `Como sugestão, sem lista fechada: ${RITMO_DA_BASE[e.base] ?? RITMO_DA_BASE.serio}; ${ELEMENTOS_DO_KIT[e.kit]}; ${video}; ${efeito}. Onde a fala pedir outra coisa, pode usar outro tipo de elemento, e a pessoa sozinha também vale.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** As miniaturas na ordem da tela: os estilos em destaque primeiro, depois os de bíblia completa, depois o resto. */
export function miniaturasDosEstilos(): Array<{ id: string; nome: string; referencia?: string; arte: string; destaque: boolean; fonte: FonteDoComando }> {
  const peso = (e: EstiloDoCatalogo) => (e.destaque ? 0 : REFERENCIA_DO_ESTILO[e.id] ? 1 : 2);
  return [...CATALOGO_DE_ESTILOS]
    .sort((a, b) => peso(a) - peso(b))
    .map((e) => ({ id: e.id, nome: e.nome, referencia: e.referencia, arte: arteDoEstilo(e.id), destaque: Boolean(e.destaque), fonte: fonteDoEstilo(e) }));
}
