import type { PalavraNoCorte, Retangulo } from "@/lib/media/plano-de-montagem";
import { ESTILOS_DO_VOX, FICHAS, passesDaPeca, pecaContinua } from "@/lib/media/editor-sob-medida/pecas";
import { pecaNoEstiloDoComando } from "@/lib/media/editor-por-comando/diretor";
import { caixaDoCartao, cameraDeRitmo, frasesNumeradas, limparSvg, paginasDaLegenda, resolverAncora } from "@/lib/media/editor-sob-medida/resolver";
import { posicionarLegenda } from "@/lib/media/editor-sob-medida/faixa-da-legenda";
import type { CamadaResolvida, EdicaoResolvida, Enquadramento, MidiaDaInsercao, PlanoResolvido, Tema } from "@/lib/media/editor-sob-medida/tipos";
import type { PlanoDoDiretor } from "@/lib/media/editor-por-comando/diretor";
import type { LeituraDoVideo, TrechoLido } from "@/lib/media/leitura-do-video";
import { componenteDa, familiaValida } from "@/lib/media/editor-por-comando/linguagem";
import { pedidoDasProps, type PedidoNasProps } from "@/lib/media/editor-por-comando/pedido-do-cliente";
import {
  caixaLivre,
  caixaNaCamera,
  centroDe,
  cobreAlgo,
  cobreUmaPessoa,
  enquadramentoDoPonto,
  faixaLivreDoTrecho,
  ladoLivreDoTrecho,
  movimentoEm,
  quemFala,
  regiaoDoConteudo,
  regiaoDoPonto,
  rostoDoTrecho,
  trechoEm,
  zonaLivre,
} from "@/lib/media/editor-por-comando/leitura-no-plano";

/**
 * A POSIÇÃO PELO TEMPO, NÃO POR UM QUADRO (06/10/2026; regra do Bruno: o
 * editor decide pelo contexto do vídeo inteiro). Com a leitura do vídeo em
 * `ctx.leitura`, cada peça é posicionada pelo TRECHO LIDO do instante dela:
 *   - o rosto é o de QUEM FALA no trecho (com duas pessoas, o título atrás vai
 *     atrás de quem fala; a câmera de ritmo mira quem fala);
 *   - a folha, o cartão de passo, a frase-chave, o nome de quem fala, a
 *     janela de imagem e a chamada de inscrever vão para a ÁREA LIVRE medida
 *     do trecho; nenhuma cobre rosto, tela ou quadro, nem uma pessoa inteira
 *     (sem área que sirva, a peça sai, com aviso);
 *   - com TELA ou QUADRO em cena, a câmera fica aberta (o zoom cortaria o
 *     conteúdo) e o "zoom no ponto" é o único zoom: ele mira a caixa da tela
 *     ou do quadro e a moldura cai na posição da região depois do zoom;
 *   - com movimento "muito", a peça fica mais curta e o título atrás da
 *     pessoa vira a legenda de destaque da linguagem (o recorte falha).
 * Sem leitura (vídeo antigo), vale o rosto medido num quadro, como em 05/10.
 *
 * O RESOLVEDOR DO EDITOR POR COMANDO (05/10/2026): o plano do diretor (âncoras
 * na fala) vira a edição que o worker desenha (segundos e pixels), SEM as
 * regras de colisão do editor sob medida. Nada é derrubado por cruzar outra
 * peça, nada é inventado para encher buraco (o "sublinhado" genérico), nenhum
 * gancho é imposto: o diretor é o responsável pelo layout.
 *
 * O que fica aqui é só o que é medida:
 *   - a âncora vira segundo; a duração respeita o mínimo e o máximo da peça;
 *   - o plano da gravação que a peça pede (tela cheia, cartão ao lado);
 *     dois planos que se cruzam são APARADOS no encontro (o worker compõe um
 *     plano por vez), nunca removidos;
 *   - a câmera de ritmo do corte por baixo e a pedida pelo diretor por cima;
 *   - a ÚNICA checagem de sobreposição: a legenda sobe para o topo ou some
 *     quando o texto de uma peça ocupa a faixa dela (posicionarLegenda).
 *
 * O CENÁRIO (05/10, noite; regra 1 do Bruno): a gravação fica como foi
 * gravada, a não ser que o comando tenha pedido a troca com todas as letras
 * (plano.linguagem.cenario === "trocado", decidido pelo JEV). Sem o pedido:
 *   - nenhum fundo atrás da pessoa (o "fundo-colagem" não entra);
 *   - as peças de TELA CHEIA (jornal, colagem, cartões, número, citação...)
 *     não cobrem a gravação: viram uma FOLHA sobre ela (props.sobreAGravacao,
 *     no lado livre do rosto; no 9:16, na faixa livre), que entra, fica e sai
 *     por cima da pessoa, desenhada do mesmo jeito, só menor; a câmera fica
 *     aberta enquanto a folha está na tela.
 * Com o pedido, a tela cheia e o fundo valem como antes, e o fundo é a
 * imagem gerada do cenário pedido (inserção "cenario") na linguagem do vídeo.
 *
 * Módulo puro.
 */

export type ContextoDoComando = {
  palavras: PalavraNoCorte[];
  duracao: number;
  largura: number;
  altura: number;
  tema: Tema;
  rosto: Retangulo;
  comLegenda: boolean;
  logoUrl: string | null;
  insercoes: Record<string, MidiaDaInsercao>;
  /** A base do estilo do comando: peça de fora dela vira a peça do estilo ou sai (a defesa do que o diretor validou). */
  base?: string | null;
  /** A LEITURA DO VÍDEO INTEIRO (06/10), no tempo desta fala: a posição de cada peça sai do trecho lido dela. */
  leitura?: LeituraDoVideo | null;
};

const limitar = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * A CAIXA DA FOLHA NO TRECHO (06/10): a área livre medida que serve à folha
 * (no 16:9, pelo menos 26% de largura e 40% de altura; no 9:16, a faixa), do
 * lado livre e perto de quem fala; sem área medida, a conta pelo rosto de
 * quem fala (`caixaDaFolha`), desde que não cubra outro rosto, a tela ou o
 * quadro. Null: não há onde pôr a folha sem cobrir alguém ou o conteúdo.
 */
export function caixaDaFolhaNoTrecho(tr: TrechoLido | null, rosto: Retangulo, vertical: boolean, lado: string): { x: number; y: number; w: number; h: number } | null {
  if (tr) {
    const livre = caixaLivre(tr, vertical ? { minW: 0.5, minH: 0.3, maxW: 0.92, maxH: 0.44, ancora: lado === "topo" ? "topo" : "baixo" } : { minW: 0.26, minH: 0.4, maxW: 0.5, maxH: 0.72, lado: lado === "esquerda" ? "esquerda" : "direita", perto: centroDe(rosto) });
    if (livre) return livre;
  }
  const c = caixaDaFolha(rosto, vertical, lado);
  if (tr && (cobreAlgo(c, tr) || cobreUmaPessoa(c, tr))) return null;
  return c;
}

/** As posições fixas do ícone, do sublinhado e do marca-texto (fração do quadro), para a escolha da zona livre. */
const ZONAS_DO_ICONE = { direita: { x: 0.62, y: 0.07, w: 0.34, h: 0.3 }, "topo-esquerda": { x: 0.04, y: 0.06, w: 0.3, h: 0.25 }, topo: { x: 0.3, y: 0.05, w: 0.4, h: 0.22 } };
const ZONAS_DO_SUBLINHADO = { centro: { x: 0.28, y: 0.58, w: 0.44, h: 0.14 }, esquerda: { x: 0.04, y: 0.58, w: 0.42, h: 0.14 }, direita: { x: 0.54, y: 0.58, w: 0.42, h: 0.14 } };
const ZONAS_DO_MARCA_TEXTO = { topo: { x: 0.05, y: 0.09, w: 0.5, h: 0.16 }, centro: { x: 0.05, y: 0.58, w: 0.5, h: 0.16 } };
const ZONAS_DO_INSCREVER = { direita: { x: 0.62, y: 0.72, w: 0.36, h: 0.24 }, esquerda: { x: 0.02, y: 0.72, w: 0.36, h: 0.24 } };

function limparProps(v: unknown, prof = 0): unknown {
  if (prof > 4) return null;
  if (typeof v === "string") return v.replace(/\s+/g, " ").replace(/\s*—\s*/g, ", ").trim().slice(0, 220);
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "boolean") return v;
  if (Array.isArray(v)) return v.slice(0, 8).map((x) => limparProps(x, prof + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as Record<string, unknown>).slice(0, 20).map(([k, x]) => [k, k === "svg" ? limparSvg(String(x)) : limparProps(x, prof + 1)]));
  return null;
}

function sobreporCamera(base: Enquadramento[], pedidos: Enquadramento[]): Enquadramento[] {
  let saida = base.map((c) => ({ ...c }));
  for (const p of [...pedidos].sort((a, b) => a.de - b.de)) {
    const nova: Enquadramento[] = [];
    for (const c of saida) {
      if (c.ate <= p.de || c.de >= p.ate) {
        nova.push(c);
        continue;
      }
      if (c.de < p.de) nova.push({ ...c, ate: p.de });
      if (c.ate > p.ate) nova.push({ ...c, de: p.ate });
    }
    nova.push(p);
    saida = nova.sort((a, b) => a.de - b.de).filter((c) => c.ate - c.de > 0.05);
  }
  return saida;
}

/**
 * O EMPURRÃO QUE O WORKER PÕE NO VÍDEO GERADO (worker/src/edicao-sob-medida.mjs,
 * a inserção em vídeo: zoompan de 1 a 1,1 no tempo do plano, do centro). A
 * camada exata da combinada faz o mesmo empurrão, do centro, para os pontos e
 * as etiquetas ficarem presos ao fundo (06/10).
 */
export const ZOOM_DO_FUNDO_NO_WORKER = 0.1;

const PECAS_COM_FOTO: Record<string, string> = { colagem: "recortes", jornal: "foto", "mapa-antigo": "foto", censura: "figura", cronologia: "marcos" };

/**
 * O PEDIDO DO CLIENTE NA POSIÇÃO E NO TAMANHO (06/10): o que ele pediu com
 * todas as letras vale por cima da área livre e da regra de sempre. O fator
 * do tamanho alarga a caixa pedida; a posição "centro" põe a caixa no meio
 * do quadro (mesmo que cubra a pessoa: ele sabe por que pediu, e o aviso
 * registra). Genérico: nenhuma peça e nenhum estilo é citado pelo nome.
 */
export function fatorDoTamanho(p: Pick<PedidoNasProps, "tamanho"> | null | undefined): number {
  return p?.tamanho === "grande" ? 1.3 : p?.tamanho === "pequeno" ? 0.8 : 1;
}

/** A caixa centrada no quadro (fração), com o tamanho pedido. */
export function caixaNoCentro(vertical: boolean, fator: number, base: { w: number; h: number }): Retangulo {
  const w = +Math.min(0.94, base.w * fator).toFixed(4);
  const h = +Math.min(vertical ? 0.5 : 0.84, base.h * fator).toFixed(4);
  return { x: +((1 - w) / 2).toFixed(4), y: +((vertical ? 0.42 : 0.5) - h / 2).toFixed(4), w, h };
}

/**
 * A CAIXA DA FOLHA sobre a gravação (fração do quadro): no 16:9, do lado livre
 * do rosto, larga até onde o rosto começa (o corpo pode ficar por baixo, o
 * rosto nunca); no 9:16, a faixa livre inteira. O worker desenha a peça
 * dentro dela (Camadas.tsx).
 */
export function caixaDaFolha(rosto: Retangulo, vertical: boolean, lado: string): { x: number; y: number; w: number; h: number } {
  if (vertical) return { x: 0.04, y: lado === "topo" ? 0.05 : 0.5, w: 0.92, h: 0.44 };
  // A FOLHA NUNCA ENCOSTA NO ROSTO (06/10): na refeita do completo do Fé &
  // Gestão a folha ia até 2% do rosto medido num quadro só, e a pessoa, ao
  // se inclinar, entrava embaixo dela. Agora a folga é de 8% do quadro e o
  // mínimo de largura cai para 0,26: folha menor é melhor que folha no rosto.
  const margem = 0.035;
  const folga = 0.08;
  const livre = lado === "esquerda" ? rosto.x - folga : 1 - (rosto.x + rosto.w) - folga;
  const w = +Math.min(0.5, Math.max(0.26, livre - margem)).toFixed(3);
  return { x: lado === "esquerda" ? margem : +(1 - margem - w).toFixed(3), y: 0.12, w, h: 0.72 };
}

export function resolverPorComando(p: PlanoDoDiretor, ctx: ContextoDoComando): { edicao: EdicaoResolvida; avisos: string[] } {
  const avisos: string[] = [];
  const frases = frasesNumeradas(ctx.palavras);
  const D = ctx.duracao;
  const W = ctx.largura;
  const H = ctx.altura;
  const t = (a: string) => resolverAncora(a, frases, ctx.palavras);
  const x0 = Math.min(0.85, Math.max(0.15, ctx.rosto.x + ctx.rosto.w / 2));
  const y0 = Math.min(0.75, Math.max(0.2, ctx.rosto.y + ctx.rosto.h * 0.55));

  // 1. As peças, em segundos.
  const camadas: CamadaResolvida[] = [];
  const planos: PlanoResolvido[] = [];
  // O PLANO LIVRE (dois eixos, 05/10 à noite): com a linguagem no tema, nenhuma peça é trocada pelo estilo e a imagem em tela cheia vale em toda linguagem.
  const livre = Boolean(p.tema?.linguagem);
  // O cenário trocado só com o pedido explícito (regra 1); plano sem o campo (de antes de 05/10 à noite) fica com a gravação.
  const cenarioTrocado = p.linguagem?.cenario === "trocado";
  // O lado livre do rosto (16:9) e a faixa livre (9:16): onde a folha e a chamada de inscrever entram sem tapar a pessoa.
  const vertical0 = H > W;
  const ladoLivre: "esquerda" | "direita" = x0 > 0.5 ? "esquerda" : "direita";
  const faixaLivre: "topo" | "baixo" = ctx.rosto.y + ctx.rosto.h / 2 > 0.5 ? "topo" : "baixo";
  // Os enquadramentos que a leitura pede (o zoom no ponto da tela ou do quadro), por cima do ritmo.
  const pedidosDaLeitura: Enquadramento[] = [];
  for (const [k, m0] of (p.momentos ?? []).entries()) {
    const ajuste = ctx.base && !livre ? pecaNoEstiloDoComando(m0, ctx.base) : { momento: m0 };
    if (ajuste.aviso) avisos.push(ajuste.aviso);
    if (!ajuste.momento) continue;
    const m = ajuste.momento;
    const ficha = FICHAS[m.peca];
    const id = String(m.id ?? `m${k + 1}`).replace(/[^a-z0-9-]/gi, "").slice(0, 20) || `m${k + 1}`;
    if (!ficha) {
      avisos.push(`${id}: peça desconhecida "${m.peca}"`);
      continue;
    }
    const t0 = t(m.de);
    const t1 = t(m.ate);
    if (t0 === null || t1 === null) {
      avisos.push(`${id}: âncora que não está na fala (${m.de} a ${m.ate})`);
      continue;
    }
    const de = Math.max(0, t0 - 0.12);
    let ate = Math.min(D, Math.max(t1 + 0.2, de + ficha.duracao[0]));
    if (ate - de > ficha.duracao[1]) ate = de + ficha.duracao[1];
    if (ate - de < 0.6) {
      avisos.push(`${id}: curto demais no fim do vídeo`);
      continue;
    }
    let props = limparProps(m.props ?? {}) as Record<string, unknown>;
    // O PEDIDO DO CLIENTE nesta peça (06/10): cor, tamanho e posição pedidos valem por cima das regras de sempre.
    const pc = pedidoDasProps(props);
    const fator = fatorDoTamanho(pc);
    const noCentro = pc?.posicao === "centro";
    // A LEITURA DO TRECHO (06/10): a posição é decidida pelo TEMPO da peça, não por um quadro só. O rosto é o de
    // quem fala neste trecho, o lado livre é o da área livre medida, e nada cobre rosto, tela nem quadro.
    const tr = trechoEm(ctx.leitura, de);
    const rostoM = rostoDoTrecho(tr, ctx.rosto);
    const mexeMuito = movimentoEm(ctx.leitura, de, ate) === "muito";
    const ladoM: "esquerda" | "direita" = tr ? ladoLivreDoTrecho(tr, rostoM) : ladoLivre;
    const faixaM: "topo" | "baixo" = tr ? faixaLivreDoTrecho(tr, rostoM) : faixaLivre;
    const conteudo = regiaoDoConteudo(tr);
    const xM = limitar(rostoM.x + rostoM.w / 2, 0.15, 0.85);
    const yM = limitar(rostoM.y + rostoM.h * 0.55, 0.2, 0.75);
    let fichaM = ficha;
    if (mexeMuito) {
      // Com a pessoa se mexendo muito a peça fica curta, e nada vai atrás dela (o recorte em movimento falha).
      ate = Math.min(ate, de + Math.max(ficha.duracao[0], 3.2));
      if (ficha.nome === "titulo-atras") {
        const alt = componenteDa(familiaValida(p.tema?.linguagem), "legenda-destaque");
        const fichaAlt = alt ? FICHAS[alt] : null;
        if (fichaAlt) {
          fichaM = fichaAlt;
          props = { texto: String(props.texto ?? props.titulo ?? "").replace(/\*\*/g, "") };
          ate = Math.min(ate, de + fichaAlt.duracao[1]);
          avisos.push(`${id}: a pessoa se mexe muito, o título atrás virou ${alt}`);
        }
      }
    }
    // Uma caixa que cobriria rosto, tela, quadro ou uma pessoa inteira tira a peça (com aviso). A caixa PEDIDA pelo
    // cliente no centro fica (ele sabe por que pediu), com o aviso.
    const semCobrir = (caixa: Retangulo, nome: string): boolean => {
      if (!tr || !(cobreAlgo(caixa, tr) || cobreUmaPessoa(caixa, tr))) return true;
      if (noCentro) {
        avisos.push(`${id}: ${nome} no centro por pedido do cliente cobre rosto, tela ou quadro no trecho (ficou, como pedido)`);
        return true;
      }
      avisos.push(`${id}: ${nome} cobriria rosto, tela ou quadro no trecho, saiu`);
      return false;
    };
    // A janela de imagem: a url é a da inserção gerada com o id em `midia`; sem ela, a peça sai.
    if (fichaM.nome === "imagem-janela") {
      const midia = ctx.insercoes[String(props.midia ?? "")];
      if (!midia?.url) {
        avisos.push(`${id}: imagem da janela não gerada, saiu`);
        continue;
      }
      props.url = midia.url;
      props.tipo = midia.tipo;
      if (noCentro) {
        // No centro, por pedido: a caixa no meio do quadro, no tamanho pedido.
        props.caixa = caixaNoCentro(vertical0, fator, vertical0 ? { w: 0.78, h: 0.36 } : { w: 0.42, h: 0.5 });
        props.lado = "centro";
        semCobrir(props.caixa as Retangulo, "a janela");
      } else if (tr) {
        // A janela vai para a área livre do trecho (nunca sobre a tela, o quadro ou um rosto).
        const livre = caixaLivre(tr, { minW: 0.22, minH: 0.16, maxW: Math.min(0.94, (vertical0 ? 0.78 : 0.4) * fator), maxH: Math.min(0.6, (vertical0 ? 0.3 : 0.32) * fator), lado: pc?.posicao === "canto" || pc?.posicao === "acima-da-cabeca" ? ladoM : ladoM, perto: centroDe(rostoM) });
        if (livre) props.caixa = livre;
        else if (conteudo) {
          avisos.push(`${id}: sem área livre para a janela (tela ou quadro em cena), saiu`);
          continue;
        }
        props.lado = vertical0 || pc?.posicao === "acima-da-cabeca" ? "topo" : ladoM;
      } else if (pc?.posicao === "acima-da-cabeca") props.lado = "topo";
    }
    if (fichaM.eventosDe && Array.isArray(props[fichaM.eventosDe])) props[fichaM.eventosDe] = (props[fichaM.eventosDe] as unknown[]).slice(0, fichaM.maxItens ?? 6);
    const nItens = fichaM.eventosDe ? (Array.isArray(props[fichaM.eventosDe]) ? (props[fichaM.eventosDe] as unknown[]).length : 0) : fichaM.umEvento ? 1 : 0;
    const eventos = (m.eventos ?? [])
      .map((a) => t(a))
      .filter((x): x is number => x !== null)
      .map((x) => Math.max(de + 0.25, x - 0.05))
      .filter((x) => x < ate - 0.3)
      .sort((a, b) => a - b)
      .slice(0, nItens);
    // Eventos que o diretor não ancorou: espalhados no tempo da peça (a peça precisa de um por item para desenhar).
    if (nItens && eventos.length < nItens) {
      const ini = eventos.length ? eventos[eventos.length - 1] : fichaM.umEvento ? de + (ate - de) * 0.4 : de + fichaM.entrada * 0.6;
      const faltam = nItens - eventos.length;
      const passo = Math.max(0.35, (ate - 0.6 - ini) / Math.max(1, faltam));
      for (let i = 0; i < faltam; i++) eventos.push(Math.min(ate - 0.4, ini + passo * (i + (eventos.length ? 1 : 0))));
    }
    if (fichaM.nome === "titulo-atras") {
      props.cabeca = +Math.max(0.05, rostoM.y).toFixed(3);
      // Atrás de QUEM FALA (06/10): com a leitura, o título se centra no rosto de quem fala neste trecho.
      if (tr) props.centro = +(rostoM.x + rostoM.w / 2).toFixed(3);
      if (noCentro) props.centro = 0.5;
    }
    // A chamada de inscrever fica no canto de baixo que não tem rosto nem conteúdo no trecho.
    if (fichaM.nome === "inscrever") props.lado = vertical0 ? faixaM : zonaLivre(ZONAS_DO_INSCREVER, ladoM, tr);
    // O ícone, o sublinhado e o marca-texto têm posições fixas: a pedida, se não cobre ninguém no trecho; senão a livre.
    // A posição PEDIDA pelo cliente não vai para a zona livre: fica onde ele pediu.
    if (fichaM.nome === "icone" && tr && !pc?.posicao) props.posicao = zonaLivre(ZONAS_DO_ICONE, (["direita", "topo-esquerda", "topo"] as const).find((z) => z === props.posicao) ?? "topo-esquerda", tr);
    if (fichaM.nome === "icone" && pc?.posicao) props.posicao = pc.posicao === "centro" ? "centro" : pc.posicao === "acima-da-cabeca" ? "topo" : pc.posicao === "ao-lado" ? "direita" : "topo-esquerda";
    if (fichaM.nome === "sublinhado" && tr && !noCentro) props.lado = zonaLivre(ZONAS_DO_SUBLINHADO, (["centro", "esquerda", "direita"] as const).find((z) => z === props.lado) ?? "centro", tr);
    if (fichaM.nome === "sublinhado" && noCentro) props.lado = "centro";
    if (fichaM.nome === "marca-texto" && tr && !noCentro) props.posicao = zonaLivre(ZONAS_DO_MARCA_TEXTO, props.posicao === "centro" ? "centro" : "topo", tr);
    if (fichaM.nome === "marca-texto" && noCentro) props.posicao = "centro";
    // AS PEÇAS DE CONTEXTO (06/10): a caixa de cada uma vem da leitura do trecho.
    if (fichaM.nome === "nome-de-quem-fala") {
      const fala = quemFala(tr);
      const w = vertical0 ? 0.7 : 0.34;
      const h = vertical0 ? 0.1 : 0.14;
      // No terço inferior, embaixo do rosto de quem fala (o peito pode ficar por baixo; o rosto, nunca).
      let caixa: Retangulo = fala
        ? { x: +limitar(fala.caixa.x + fala.caixa.w / 2 - w / 2, 0.03, 0.97 - w).toFixed(4), y: +limitar(Math.max(fala.caixa.y + fala.caixa.h * 0.55, rostoM.y + rostoM.h + 0.06), 0.5, 0.86 - h).toFixed(4), w, h }
        : { x: 0.04, y: vertical0 ? 0.66 : 0.72, w, h };
      if (tr && cobreAlgo(caixa, tr)) caixa = caixaLivre(tr, { minW: 0.22, minH: 0.08, maxW: w, maxH: h, perto: centroDe(rostoM), ancora: "baixo" }) ?? caixa;
      if (!semCobrir(caixa, "o nome de quem fala")) continue;
      props.caixa = caixa;
    }
    if (fichaM.nome === "realce-de-quem-fala") {
      const fala = quemFala(tr);
      if (!fala) {
        avisos.push(`${id}: a leitura não diz quem fala, o realce saiu`);
        continue;
      }
      props.caixa = fala.caixa;
    }
    if (fichaM.nome === "zoom-no-ponto" || fichaM.nome === "destaque-na-tela") {
      if (!conteudo) {
        avisos.push(`${id}: sem tela nem quadro na leitura, ${fichaM.nome} saiu`);
        continue;
      }
      // A SUB-CAIXA (06/10, tarde): o zoom mira o ponto que a fala aponta neste momento, quando a leitura o traz.
      const alvoDoZoom = fichaM.nome === "zoom-no-ponto" ? regiaoDoPonto(tr, de, ate) ?? conteudo : conteudo;
      const enq = fichaM.nome === "zoom-no-ponto" ? enquadramentoDoPonto(alvoDoZoom) : null;
      if (fichaM.nome === "zoom-no-ponto" && !enq) {
        // A região já ocupa o quadro (a tela inteira, o quadro inteiro): aproximar cortaria; fica o destaque sem zoom.
        avisos.push(`${id}: a região da tela ou do quadro já é grande, o zoom no ponto virou destaque na tela`);
        fichaM = FICHAS["destaque-na-tela"] ?? fichaM;
      }
      if (enq) {
        pedidosDaLeitura.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), zoom: enq.zoom, x: enq.x, y: enq.y, movimento: "empurrao", zoomFinal: +Math.min(2, enq.zoom * 1.04).toFixed(3) });
        props.caixa = caixaNaCamera(alvoDoZoom, enq);
        props.zoom = enq.zoom;
      } else props.caixa = conteudo;
    }
    if (fichaM.nome === "cartao-de-passo" || fichaM.nome === "frase-chave") {
      const frase = fichaM.nome === "frase-chave";
      const pedido = frase ? { minW: 0.24, minH: 0.12, maxW: Math.min(0.94, (vertical0 ? 0.86 : 0.46) * fator), maxH: Math.min(0.6, (vertical0 ? 0.26 : 0.28) * fator) } : { minW: 0.2, minH: 0.12, maxW: Math.min(0.94, (vertical0 ? 0.7 : 0.36) * fator), maxH: Math.min(0.6, (vertical0 ? 0.22 : 0.26) * fator) };
      let caixa = noCentro ? caixaNoCentro(vertical0, 1, { w: pedido.maxW, h: pedido.maxH }) : caixaLivre(tr, { ...pedido, lado: ladoM, perto: centroDe(rostoM) });
      if (!caixa) {
        // Sem área livre medida (vídeo antigo): do lado livre do rosto, acima da faixa da legenda.
        const { maxW: w, maxH: h } = pedido;
        caixa = vertical0 ? { x: +((1 - w) / 2).toFixed(4), y: faixaM === "topo" ? 0.08 : 0.5, w, h } : { x: ladoM === "esquerda" ? 0.04 : +(0.96 - w).toFixed(4), y: 0.18, w, h };
      }
      if (!semCobrir(caixa, fichaM.nome)) continue;
      props.caixa = caixa;
    }
    // A PEÇA COMBINADA (06/10): com o vídeo de fundo pronto, o fundo entra como plano de inserção (entra, fica e sai,
    // como todo B-roll; o cenário do cliente não é trocado) e a camada exata vai por cima no quadro inteiro, com o
    // mesmo empurrão do worker. Sem o vídeo, a camada cai na folha sobre a gravação, com o fundo próprio dela.
    if (fichaM.nome === "camada-exata") {
      const idFundo = String(props.fundo ?? "");
      const fundo = ctx.insercoes[idFundo];
      if (fundo?.url && fundo.tipo === "video") {
        props.comFundo = true;
        props.zoomDoFundo = ZOOM_DO_FUNDO_NO_WORKER;
        camadas.push({ id, peca: fichaM.nome, de: +de.toFixed(3), ate: +ate.toFixed(3), entrada: fichaM.entrada, saida: fichaM.saida, evento: fichaM.evento, eventos: eventos.map((x) => +x.toFixed(3)), props, passes: passesDaPeca(fichaM), ...(pecaContinua(fichaM) ? { continua: true } : {}) });
        planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "insercao", midia: idFundo });
        continue;
      }
      props.comFundo = false;
      avisos.push(`${id}: o vídeo de fundo da combinada não ficou pronto, a camada entrou na folha sobre a gravação`);
    }
    let plano: "cheio" | "grafico" | "cartao" = fichaM.plano === "tela" ? "grafico" : fichaM.plano === "lado" ? "cartao" : "cheio";
    if (m.plano === "grafico" && fichaM.plano !== "tela") plano = "grafico";
    // COM TELA OU QUADRO EM CENA (06/10), a peça de lado não leva a pessoa para um cartão (o cartão esconderia o
    // conteúdo): ela entra na folha da área livre, como a peça de tela.
    if (plano === "cartao" && conteudo) plano = "grafico";
    // A FOLHA SOBRE A GRAVAÇÃO (regra 1): sem o cenário trocado, a peça de tela não cobre a pessoa.
    if (plano === "grafico" && !cenarioTrocado) {
      plano = "cheio";
      props.sobreAGravacao = true;
      props.lado = vertical0 ? faixaM : ladoM;
      // A folha na área livre do trecho (06/10): nunca sobre outro rosto, a tela ou o quadro. No centro, por pedido
      // do cliente, a folha vai para o meio do quadro no tamanho pedido.
      const folha = noCentro ? caixaNoCentro(vertical0, fator, vertical0 ? { w: 0.86, h: 0.4 } : { w: 0.5, h: 0.72 }) : caixaDaFolhaNoTrecho(tr, rostoM, vertical0, vertical0 ? faixaM : ladoM);
      if (!folha) {
        avisos.push(`${id}: sem área livre para a folha no trecho (rosto, tela ou quadro em todo lado), saiu`);
        continue;
      }
      if (noCentro) semCobrir(folha, "a folha");
      else if (fator !== 1) {
        // O tamanho pedido alarga (ou encolhe) a folha em volta do centro dela, dentro do quadro.
        const w = Math.min(0.94, folha.w * fator);
        const h = Math.min(0.9, folha.h * fator);
        folha.x = +limitar(folha.x + (folha.w - w) / 2, 0.02, 0.98 - w).toFixed(4);
        folha.y = +limitar(folha.y + (folha.h - h) / 2, 0.02, 0.98 - h).toFixed(4);
        folha.w = +w.toFixed(4);
        folha.h = +h.toFixed(4);
      }
      props.folha = folha;
    }
    if (plano === "cartao") {
      // A peça do lado livre do trecho; sem leitura, o lado que o diretor pediu.
      const lado = tr ? ladoM : props.lado === "direita" || props.posicao === "direita" ? "direita" : "esquerda";
      props.lado = lado;
    }
    camadas.push({ id, peca: fichaM.nome, de: +de.toFixed(3), ate: +ate.toFixed(3), entrada: fichaM.entrada, saida: fichaM.saida, evento: fichaM.evento, eventos: eventos.map((x) => +x.toFixed(3)), props, passes: passesDaPeca(fichaM), ...(pecaContinua(fichaM) ? { continua: true } : {}) });
    if (plano === "grafico") planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "grafico" });
    if (plano === "cartao") {
      const caixa = caixaDoCartao(W, H, props.lado === "direita" ? "direita" : "esquerda");
      planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "cartao", caixa, zoom: 1.15, x: xM, y: yM });
      camadas.push({ id: `${id}-moldura`, peca: "moldura-do-cartao", de: +de.toFixed(3), ate: +ate.toFixed(3), entrada: 0.55, saida: 0.2, evento: 0.5, eventos: [], props: { ...caixa }, passes: ["frente"] });
    }
  }

  // 2. As imagens de cinema (tela cheia, foto com movimento): onde o diretor pôs.
  // No Vox não há cena de cinema em tela cheia: a imagem é a foto de arquivo dentro das peças de papel.
  for (const [k, ins] of (ctx.base && ESTILOS_DO_VOX.includes(ctx.base) && !livre ? [] : p.insercoes ?? []).entries()) {
    const id = String(ins.id ?? `i${k + 1}`).replace(/[^a-z0-9-]/gi, "") || `i${k + 1}`;
    // A imagem de janela entra pela peça "imagem-janela", sem plano de tela cheia; o cenário vai atrás da pessoa (item 4);
    // o fundo da combinada entra junto com a camada exata dele (acima), nunca sozinho.
    if (ins.janela || (ins as { cenario?: boolean }).cenario || ins.combinada) continue;
    if (!ctx.insercoes[id]) {
      avisos.push(`${id}: imagem não gerada, ficou de fora`);
      continue;
    }
    const a = t(ins.de);
    const b = t(ins.ate);
    if (a === null || b === null) continue;
    const de = Math.max(0, a - 0.05);
    const ate = Math.min(D, Math.min(de + (ins.midia === "video" ? Math.max(5, ins.segundos ?? 5) : 5), Math.max(b + 0.2, de + 2.4)));
    planos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), tipo: "insercao", midia: id });
  }

  // 3. Planos que se cruzam: o que começa depois manda, o anterior é aparado no encontro (nunca sai).
  planos.sort((a, b) => a.de - b.de);
  for (let i = 0; i + 1 < planos.length; i++) {
    const a = planos[i];
    const b = planos[i + 1];
    if (a.ate > b.de) {
      avisos.push(`plano ${a.tipo} em ${a.de.toFixed(1)} s aparado em ${b.de.toFixed(1)} s (cruzava o seguinte)`);
      a.ate = +Math.max(a.de + 0.1, b.de).toFixed(3);
    }
  }
  const planosOk = planos.filter((x) => x.ate - x.de >= 0.1);

  // 4. O CENÁRIO atrás da pessoa recortada, SÓ com o pedido explícito do comando (regra 1 de 05/10 à noite):
  // a imagem gerada do cenário pedido; sem ela, o worker desenha o fundo na linguagem do vídeo com os recortes que as peças já pagaram.
  if (cenarioTrocado && FICHAS["fundo-colagem"]) {
    const ficha = FICHAS["fundo-colagem"];
    const cenarioUrl = ctx.insercoes.cenario?.url ?? null;
    const fotos = (p.momentos ?? []).flatMap((m) => {
      const campo = PECAS_COM_FOTO[m.peca];
      const v0 = campo ? (m.props as Record<string, unknown> | undefined)?.[campo] : null;
      const v = m.peca === "cronologia" && Array.isArray(v0) ? v0.map((x) => (x as { foto?: unknown } | null)?.foto) : v0;
      return (Array.isArray(v) ? v : v && typeof v === "object" ? [v] : []).filter((f): f is { url: string; assunto?: string } => Boolean(f && typeof (f as { url?: unknown }).url === "string"));
    });
    const recortes = fotos.slice(0, 6).map((f) => ({ url: f.url, assunto: f.assunto ?? "objeto" }));
    // Só nos trechos com a pessoa cheia (fora dos planos): sob a tela cheia ele não aparece e não precisa de render.
    let cursor = 0;
    let k = 0;
    const trechos: Array<[number, number]> = [];
    for (const pl of planosOk) {
      if (pl.de - cursor > 0.3) trechos.push([cursor, pl.de]);
      cursor = Math.max(cursor, pl.ate);
    }
    if (D - cursor > 0.3) trechos.push([cursor, D]);
    for (const [a, b] of trechos) camadas.push({ id: `fundo-${Math.round(a * 10)}`, peca: "fundo-colagem", de: +a.toFixed(3), ate: +b.toFixed(3), entrada: ficha.entrada, saida: ficha.saida, evento: ficha.evento, eventos: [], props: { semente: k++, recortes, ...(cenarioUrl ? { url: cenarioUrl } : {}) }, passes: ["atras"] });
  }
  camadas.sort((a, b) => a.de - b.de);

  // 5. A câmera: o ritmo do corte e, por cima, o que o diretor pediu.
  const pedidos: Enquadramento[] = [];
  for (const c of p.camera ?? []) {
    const a = t(c.de);
    const b = t(c.ate);
    if (a === null || b === null || b - a < 0.5) continue;
    const zoom = Math.min(2, Math.max(1, Number(c.zoom) || 1));
    pedidos.push({ de: Math.max(0, a - 0.05), ate: Math.min(D, b + 0.2), zoom, x: Math.min(0.95, Math.max(0.05, c.foco?.x ?? x0)), y: Math.min(0.95, Math.max(0.05, c.foco?.y ?? y0)), movimento: c.movimento === "empurrao" ? "empurrao" : "fixo", zoomFinal: c.movimento === "empurrao" ? zoom * 1.06 : undefined });
  }
  const vertical = H > W;
  let camera = sobreporCamera(cameraDeRitmo(frases, D, ctx.rosto, null, vertical ? ctx.palavras : undefined, ctx.tema.visual === "documental"), [...pedidos, ...pedidosDaLeitura]);
  // A CÂMERA PELO TEMPO (06/10): cada enquadramento do ritmo mira o rosto de quem fala no trecho dele; com tela ou
  // quadro em cena a câmera fica aberta (o zoom cortaria o conteúdo); com a pessoa se mexendo muito, quase aberta.
  const fixos = new Set<Enquadramento>([...pedidos, ...pedidosDaLeitura]);
  if (ctx.leitura) {
    camera = camera.map((c) => {
      if (fixos.has(c)) return c;
      const tr = trechoEm(ctx.leitura, c.de);
      const r = rostoDoTrecho(tr, ctx.rosto);
      const x = limitar(r.x + r.w / 2, 0.15, 0.85);
      const y = limitar(r.y + r.h * 0.55, 0.2, 0.75);
      if (regiaoDoConteudo(tr)) return { ...c, x, y, zoom: 1, zoomFinal: undefined, movimento: "fixo" as const };
      if (movimentoEm(ctx.leitura, c.de, c.ate) === "muito") return { ...c, x, y, zoom: Math.min(c.zoom, 1.06), zoomFinal: c.zoomFinal ? Math.min(c.zoomFinal, 1.08) : undefined };
      return { ...c, x, y };
    });
  }
  // O título atrás da pessoa mede a cabeça no quadro aberto: ali a câmera fica aberta (senão a cabeça cobre as letras).
  // A folha sobre a gravação também: fechada, o rosto andaria para baixo da folha.
  for (const c0 of camadas.filter((c) => c.peca === "titulo-atras" || c.props.sobreAGravacao))
    camera = camera.map((c) => (c.de < c0.ate && c.ate > c0.de && !fixos.has(c) ? { ...c, zoom: 1, zoomFinal: c.zoomFinal ? 1.03 : undefined } : c));
  // O soco de câmera nas ênfases, fora dos planos.
  const socos: Enquadramento[] = [];
  let ultimo = -10;
  // Sem soco onde a câmera precisa ficar aberta (o título atrás da pessoa e a folha sobre a gravação).
  const abertas = camadas.filter((c) => c.peca === "titulo-atras" || c.props.sobreAGravacao);
  for (const s0 of (p.enfases ?? []).map((a) => t(a)).filter((x): x is number => x !== null).sort((a, b) => a - b)) {
    const de = Math.max(0, s0 - 0.03);
    const ate = Math.min(D, de + 1.1);
    if (de - ultimo < 2.5 || planosOk.some((pl) => pl.de < ate && pl.ate > de) || [...pedidos, ...pedidosDaLeitura].some((pl) => pl.de < ate && pl.ate > de) || abertas.some((c) => c.de < ate && c.ate > de)) continue;
    // Sem soco sobre a tela ou o quadro (cortaria o conteúdo) nem com a pessoa se mexendo muito; o soco mira quem fala.
    const trS = trechoEm(ctx.leitura, de);
    if (ctx.leitura && (regiaoDoConteudo(trS) || movimentoEm(ctx.leitura, de, ate) === "muito")) continue;
    const rS = rostoDoTrecho(trS, ctx.rosto);
    const z = Math.min(1.32, +((camera.find((c) => c.de <= de && c.ate > de)?.zoom ?? 1) * (ctx.tema.visual === "documental" ? 1.1 : 1.18)).toFixed(3));
    socos.push({ de: +de.toFixed(3), ate: +ate.toFixed(3), zoom: z, x: ctx.leitura ? limitar(rS.x + rS.w / 2, 0.15, 0.85) : x0, y: ctx.leitura ? limitar(rS.y + rS.h * 0.55, 0.2, 0.75) : y0, movimento: "fixo" });
    ultimo = de;
  }
  if (socos.length) camera = sobreporCamera(camera, socos);

  const edicao: EdicaoResolvida = {
    versao: 1,
    largura: W,
    altura: H,
    // O FPS DAS CAMADAS (05/10): o Chrome desenha cada quadro com movimento, e no corte de
    // 42 s as camadas a 30 fps levaram ~14 min no render local. A 15 fps (o padrão aqui) o
    // Chrome desenha a metade; o vídeo continua no fps da gravação (o worker segura o quadro).
    // EDITOR_POR_COMANDO_FPS volta para 30 sem deploy de código.
    fps: Math.min(30, Math.max(10, Number(process.env.EDITOR_POR_COMANDO_FPS) || 15)),
    duracao: D,
    tema: ctx.tema,
    logoUrl: ctx.logoUrl,
    camadas,
    planos: planosOk,
    camera,
    legenda: ctx.comLegenda ? { paginas: paginasDaLegenda(ctx.palavras) } : null,
    insercoes: ctx.insercoes,
    palco: true,
  };
  // 6. A única checagem de sobreposição: texto de peça contra a legenda.
  const l = posicionarLegenda(edicao);
  if (l.movidas || l.ocultas) avisos.push(`legenda: ${l.movidas} página(s) no topo e ${l.ocultas} escondida(s) sob peça com texto`);
  return { edicao: l.edicao, avisos };
}
