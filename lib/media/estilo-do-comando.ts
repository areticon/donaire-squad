import { estiloDoCatalogo, normalizarEscolha, type EscolhaDeEstilo } from "@/lib/media/catalogo-de-estilos";

/**
 * UMA FONTE DE VERDADE PARA O ESTILO (06/10/2026, relato do Bruno: "estou
 * tentando mudar o estilo, mas ele mantém sempre o VOX").
 *
 * Dois sistemas conviviam: a galeria nova grava o COMANDO DO VÍDEO
 * (projects.config.comandoDoVideo, com a `referencia` do cartão clicado), e o
 * cabeçalho "Como o squad edita", os efeitos sonoros, a família visual e o
 * bloco de estilo do caminho antigo liam a ESCOLHA ANTIGA
 * (Project.videoEstiloEscolha / videoStyle). Escolher na galeria não mexia na
 * escolha antiga, e tudo que lia dela continuava no estilo de antes.
 *
 * Regra daqui em diante: o comando manda. Quem lê o estilo pergunta primeiro
 * ao comando (a referência do cartão, quando é um estilo do catálogo); a
 * escolha antiga só vale quando não há comando. E, ao gravar o comando, a
 * escolha antiga é sincronizada com a mesma referência, para os leitores que
 * ainda olham só para ela nunca divergirem. Módulo PURO (sem banco).
 */

export type ComandoComReferencia = { texto: string; referencia?: string | null } | null | undefined;

/** O id do catálogo que o comando aponta (a referência do cartão), ou null quando é comando próprio. */
export function estiloIdDoComando(c: ComandoComReferencia): string | null {
  const id = c?.referencia?.trim();
  return id && estiloDoCatalogo(id) ? id : null;
}

/** O estilo que vale: o do comando quando há referência; senão o da escolha antiga. */
export function estiloQueVale(c: ComandoComReferencia, escolhaBruta: unknown, videoStyle: string | null | undefined): string {
  return estiloIdDoComando(c) ?? normalizarEscolha(escolhaBruta, videoStyle ?? null).estiloId;
}

/**
 * A escolha antiga reescrita com o estilo do comando, guardando o resto dela
 * (legenda, legenda dos cortes, inserções de IA). Devolve null quando o
 * comando não aponta um estilo do catálogo ou quando já está igual (nada a gravar).
 */
export function escolhaSincronizadaComComando(
  c: ComandoComReferencia,
  escolhaBruta: unknown,
  videoStyle: string | null | undefined
): { escolha: EscolhaDeEstilo; videoStyle: string } | null {
  const id = estiloIdDoComando(c);
  if (!id) return null;
  const atual = normalizarEscolha(escolhaBruta, videoStyle ?? null);
  const base = estiloDoCatalogo(id)?.base ?? "acelerado";
  if (atual.estiloId === id && videoStyle === base) return null;
  return { escolha: { ...atual, estiloId: id }, videoStyle: base };
}

/**
 * O ESTILO DE EDIÇÃO DO DIA DO CORTE (08/10/2026). Regra do Bruno: "sexta é um
 * vídeo curto (short, reel e tiktok) escolher o estilo". Cada dia de vídeo
 * curto da semana leva o seu estilo de edição (lib/media/semana-do-video.ts,
 * `modelo.estiloId`), e o corte que cai naquele dia é editado nele.
 *
 * Devolve a escolha do projeto reescrita no estilo do dia (as camadas que a
 * linguagem nova não aceita saem; o texto e a leitura do diretor, que eram do
 * estilo do projeto, também), ou null quando o dia não pede estilo, pede um
 * que não existe ou pede o mesmo do projeto (aí vale tudo como estava,
 * inclusive o comando). A legenda escolhida no projeto continua. Puro.
 */
export function escolhaNoEstiloDoDia(
  escolhaBruta: unknown,
  videoStyle: string | null | undefined,
  estiloDoDia: string | null | undefined
): { escolha: EscolhaDeEstilo; videoStyle: string } | null {
  const e = estiloDoDia ? estiloDoCatalogo(estiloDoDia) : undefined;
  if (!e) return null;
  const atual = normalizarEscolha(escolhaBruta, videoStyle ?? null);
  if (atual.estiloId === e.id) return null;
  const { texto: _texto, interpretacao: _leitura, ...resto } = atual;
  void _texto;
  void _leitura;
  return { escolha: normalizarEscolha({ ...resto, estiloId: e.id }), videoStyle: e.base };
}

const limpo = (t: string | null | undefined) => (t ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** O começo do texto do comando, para a tela dizer qual era (sem cortar no meio da palavra). */
export function trechoDoComando(texto: string | null | undefined, max = 70): string {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const corte = t.slice(0, max);
  const espaco = corte.lastIndexOf(" ");
  return `${(espaco > 30 ? corte.slice(0, espaco) : corte).replace(/[,.;:]+$/, "")}...`;
}

/**
 * O roteiro do completo foi planejado com OUTRO comando? Compara o texto
 * gravado no plano (`completo.comando.texto`) com o comando de agora. Sem plano
 * por comando, ou sem comando agora, não há o que refazer.
 */
export function roteiroDeOutroComando(comandoAtual: ComandoComReferencia, textoDoPlano: string | null | undefined): boolean {
  if (!comandoAtual?.texto || !textoDoPlano) return false;
  return limpo(comandoAtual.texto) !== limpo(textoDoPlano);
}
