import type { TipoDeElemento } from "@/lib/media/editor-por-comando/elementos";
import type { CaixaNoQuadro, LeituraDoVideo, PessoaLida, TrechoLido } from "@/lib/media/leitura-do-video";

/**
 * A LEITURA NO PLANO (06/10/2026): o que o editor tira da leitura do vídeo
 * inteiro para decidir pelo CONTEXTO, e não por um quadro só. Regra do Bruno
 * (06/10, 01h): "sem adivinhar o que o usuário quer, de pastor a médico, a IA
 * deve trazer o resultado certo"; o editor tem de servir a qualquer vídeo
 * (uma pessoa com quadro branco, duas conversando em pé, tela compartilhada,
 * palestra, cozinha, vlog), não só ao de ontem (uma pessoa parada no
 * escritório, o rosto medido num quadro).
 *
 * Tudo aqui é MEDIDA e texto para o JEV e para o redator:
 *   - o trecho lido de um instante (`trechoEm`), quem fala nele, o rosto de
 *     quem fala, o que não pode ser coberto (rostos, tela, quadro);
 *   - a área livre do trecho onde uma peça cabe (`caixaLivre`), e a prova de
 *     que uma caixa não cobre ninguém nem o quadro (`cobreAlgo`);
 *   - os tipos de elemento que o trecho permite (`tiposPossiveis`): o zoom no
 *     ponto só existe com tela ou quadro em cena, o nome de quem fala só com
 *     uma pessoa nomeada, o realce de quem fala só com duas ou mais;
 *   - o resumo da leitura e o contexto do trecho, em texto, para o estado do
 *     JEV e para o pedido do redator;
 *   - a caixa de uma região depois do zoom da câmera (`caixaNaCamera`, a mesma
 *     conta do `recorte` do worker) e a leitura levada para o tempo e o quadro
 *     de um corte (`leituraNoCorte`).
 *
 * Nada aqui olha o nome de um estilo. Sem leitura (vídeo antigo), cada função
 * devolve o que o chamador já fazia antes. Módulo puro.
 */

export type Retangulo = CaixaNoQuadro;

const limitar = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const arred = (v: number) => +v.toFixed(4);

/** As duas caixas se cruzam (fração do quadro). */
export const cruza = (a: Retangulo, b: Retangulo): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** A caixa com folga `f` (fração do quadro) em volta. */
export const comFolga = (r: Retangulo, f: number): Retangulo => ({ x: r.x - f, y: r.y - f, w: r.w + 2 * f, h: r.h + 2 * f });

export const area = (r: Retangulo): number => Math.max(0, r.w) * Math.max(0, r.h);

/** A caixa presa dentro do quadro (0 a 1). */
export function dentroDoQuadro(r: Retangulo): Retangulo {
  const x = limitar(r.x);
  const y = limitar(r.y);
  return { x: arred(x), y: arred(y), w: arred(limitar(r.x + r.w) - x), h: arred(limitar(r.y + r.h) - y) };
}

/** A interseção de duas caixas, ou null. */
export function intersecao(a: Retangulo, b: Retangulo): Retangulo | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 - x > 0.005 && y1 - y > 0.005 ? { x: arred(x), y: arred(y), w: arred(x1 - x), h: arred(y1 - y) } : null;
}

const caixaValida = (c: unknown): c is Retangulo => {
  const r = c as Retangulo | null;
  return Boolean(r && typeof r === "object" && [r.x, r.y, r.w, r.h].every((v) => typeof v === "number" && Number.isFinite(v)) && r.w > 0 && r.h > 0);
};

// ─────────────────────────────── o trecho de um instante ───────────────────────────────

/** O trecho lido que cobre o instante `t`; fora de todos, o mais perto. Sem leitura, null. */
export function trechoEm(l: LeituraDoVideo | null | undefined, t: number): TrechoLido | null {
  const ts = l?.trechos;
  if (!ts?.length) return null;
  const dentro = ts.find((x) => t >= x.de && t < x.ate);
  if (dentro) return dentro;
  let melhor: TrechoLido | null = null;
  let dist = Infinity;
  for (const x of ts) {
    const d = t < x.de ? x.de - t : t - x.ate;
    if (d < dist) {
      dist = d;
      melhor = x;
    }
  }
  return melhor;
}

/** Os trechos lidos que cruzam o intervalo. */
export function trechosEntre(l: LeituraDoVideo | null | undefined, de: number, ate: number): TrechoLido[] {
  return (l?.trechos ?? []).filter((x) => x.de < ate && x.ate > de);
}

/** O maior movimento entre os trechos do intervalo ("parado" sem leitura). */
export function movimentoEm(l: LeituraDoVideo | null | undefined, de: number, ate: number): TrechoLido["movimento"] {
  const ordem = { parado: 0, pouco: 1, muito: 2 } as const;
  const ts = trechosEntre(l, de, ate);
  const um = ts.length ? ts : [trechoEm(l, de)].filter((x): x is TrechoLido => Boolean(x));
  return um.reduce<TrechoLido["movimento"]>((m, t) => (ordem[t.movimento] > ordem[m] ? t.movimento : m), "parado");
}

export type PessoaEmCena = TrechoLido["pessoasEmCena"][number];

/** Quem está falando no trecho: a marcada como falando; sozinha, a única; senão null. */
export function quemFala(tr: TrechoLido | null | undefined): PessoaEmCena | null {
  const ps = (tr?.pessoasEmCena ?? []).filter((p) => caixaValida(p.caixa));
  if (!ps.length) return null;
  return ps.find((p) => p.falando) ?? (ps.length === 1 ? ps[0] : null);
}

/** A ficha da pessoa (nome, papel) pelo id da leitura. */
export function fichaDaPessoa(l: LeituraDoVideo | null | undefined, id: string | null | undefined): PessoaLida | null {
  if (!id) return null;
  return l?.pessoas?.find((p) => p.id === id) ?? null;
}

/** O rosto de uma pessoa em cena: o medido, ou o alto da caixa dela (a cabeça mora no terço de cima, no meio). */
export function rostoDaPessoa(p: PessoaEmCena): Retangulo {
  if (caixaValida(p.rosto)) return p.rosto;
  const c = p.caixa;
  return { x: arred(c.x + c.w * 0.2), y: arred(c.y + c.h * 0.02), w: arred(c.w * 0.6), h: arred(Math.min(c.h * 0.35, c.w * 0.9)) };
}

/** O rosto de quem fala no trecho (ou o rosto medido de sempre, `padrao`, sem leitura ou sem pessoa). */
export function rostoDoTrecho(tr: TrechoLido | null | undefined, padrao: Retangulo): Retangulo {
  const p = quemFala(tr) ?? (tr?.pessoasEmCena ?? []).find((x) => caixaValida(x.caixa)) ?? null;
  return p ? rostoDaPessoa(p) : padrao;
}

/** Os rostos de todas as pessoas em cena. */
export const rostosEmCena = (tr: TrechoLido | null | undefined): Retangulo[] => (tr?.pessoasEmCena ?? []).filter((p) => caixaValida(p.caixa)).map(rostoDaPessoa);

/** As caixas das pessoas em cena (o corpo inteiro). */
export const pessoasEmCena = (tr: TrechoLido | null | undefined): Retangulo[] => (tr?.pessoasEmCena ?? []).filter((p) => caixaValida(p.caixa)).map((p) => p.caixa);

/** A tela ou o quadro em cena (a região que nunca é coberta). */
export function regiaoDoConteudo(tr: TrechoLido | null | undefined): Retangulo | null {
  if (!tr) return null;
  if (caixaValida(tr.tela)) return tr.tela;
  if (caixaValida(tr.quadro)) return tr.quadro;
  return null;
}

/**
 * O QUE UMA PEÇA NUNCA COBRE no trecho: os rostos (com folga de 3% do
 * quadro), a tela compartilhada e o quadro. Os corpos podem ficar por baixo
 * de uma peça pequena (o nome de quem fala vai no peito); o rosto, nunca.
 */
export function proibidas(tr: TrechoLido | null | undefined, folgaDoRosto = 0.03): Retangulo[] {
  const saida = rostosEmCena(tr).map((r) => comFolga(r, folgaDoRosto));
  const conteudo = regiaoDoConteudo(tr);
  if (conteudo) saida.push(conteudo);
  return saida;
}

/** A caixa cobre algo proibido no trecho (rosto, tela, quadro). Sem trecho, false. */
export function cobreAlgo(caixa: Retangulo, tr: TrechoLido | null | undefined): boolean {
  return proibidas(tr).some((p) => cruza(caixa, p));
}

/** A caixa cobre uma pessoa INTEIRA (mais de 60% do corpo dela): nunca. */
export function cobreUmaPessoa(caixa: Retangulo, tr: TrechoLido | null | undefined): boolean {
  return pessoasEmCena(tr).some((p) => {
    const i = intersecao(caixa, p);
    return Boolean(i) && area(i!) > 0.6 * area(p);
  });
}

// ─────────────────────────────── a área livre ───────────────────────────────

export type Lado = "esquerda" | "direita";
export type Faixa = "topo" | "baixo";

export const ladoDaCaixa = (c: Retangulo): Lado => (c.x + c.w / 2 < 0.5 ? "esquerda" : "direita");
export const faixaDaCaixa = (c: Retangulo): Faixa => (c.y + c.h / 2 < 0.5 ? "topo" : "baixo");

/** As áreas livres do trecho, válidas, da maior para a menor. */
export function areasLivres(tr: TrechoLido | null | undefined): Retangulo[] {
  return (tr?.areaLivre ?? []).filter(caixaValida).map(dentroDoQuadro).filter((a) => area(a) > 0.002).sort((a, b) => area(b) - area(a));
}

export type PedidoDeCaixa = {
  /** O menor tamanho que serve (fração do quadro). */
  minW: number;
  minH: number;
  /** O maior tamanho que a peça usa (fração do quadro); a caixa escolhida é cortada a ele. */
  maxW: number;
  maxH: number;
  /** Prefere a área deste lado, ou a mais perto deste ponto (quem fala). */
  lado?: Lado | null;
  perto?: { x: number; y: number } | null;
  /** Ancora a caixa cortada neste canto da área livre (padrão: a borda mais perto de `perto`, senão o centro). */
  ancora?: "centro" | "topo" | "baixo";
};

/**
 * A CAIXA LIVRE para uma peça: a maior área livre do trecho em que o tamanho
 * mínimo cabe, cortada ao tamanho máximo e ancorada do lado pedido (ou perto
 * de quem fala). Devolve null quando nenhuma área livre serve: quem chama
 * decide o recuo (a conta antiga pelo rosto) ou tira a peça.
 */
export function caixaLivre(tr: TrechoLido | null | undefined, p: PedidoDeCaixa): Retangulo | null {
  const todas = areasLivres(tr);
  // A área que serve inteira; senão, uma até 15% menor que o mínimo (peça um pouco menor é melhor que peça nenhuma).
  const areas = [1, 0.85].map((f) => todas.filter((a) => a.w >= p.minW * f - 1e-6 && a.h >= p.minH * f - 1e-6)).find((l) => l.length) ?? [];
  if (!areas.length) return null;
  const pontos = (a: Retangulo) => {
    let s = area(a);
    if (p.lado && ladoDaCaixa(a) === p.lado) s *= 1.6;
    if (p.perto) s /= 1 + Math.hypot(a.x + a.w / 2 - p.perto.x, a.y + a.h / 2 - p.perto.y);
    return s;
  };
  const a = [...areas].sort((x, y) => pontos(y) - pontos(x))[0];
  const w = Math.min(a.w, p.maxW);
  const h = Math.min(a.h, p.maxH);
  // Horizontal: encostada na borda da área mais perto de quem fala (a peça fica ao lado da pessoa), senão no centro.
  let x = a.x + (a.w - w) / 2;
  if (p.perto) x = p.perto.x < a.x + a.w / 2 ? a.x : a.x + a.w - w;
  const ancora = p.ancora ?? (p.perto ? (p.perto.y < a.y + a.h / 2 ? "topo" : "baixo") : "centro");
  const y = ancora === "topo" ? a.y : ancora === "baixo" ? a.y + a.h - h : a.y + (a.h - h) / 2;
  return dentroDoQuadro({ x, y, w, h });
}

/**
 * A ZONA LIVRE entre as posições fixas de uma peça (o ícone no canto, o
 * sublinhado no peito, o marca-texto no topo): a preferida, se não cobre
 * rosto, tela nem quadro no trecho; senão a primeira que não cobre; sem
 * nenhuma livre (ou sem leitura), a preferida.
 */
export function zonaLivre<K extends string>(zonas: Record<K, Retangulo>, preferida: K, tr: TrechoLido | null | undefined): K {
  if (!tr) return preferida;
  if (!cobreAlgo(zonas[preferida], tr)) return preferida;
  const livre = (Object.keys(zonas) as K[]).find((k) => !cobreAlgo(zonas[k], tr));
  return livre ?? preferida;
}

/** O centro de uma caixa. */
export const centroDe = (r: Retangulo): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/** O lado livre do quadro no trecho: o da maior área livre; sem leitura, o oposto do rosto. */
export function ladoLivreDoTrecho(tr: TrechoLido | null | undefined, rosto: Retangulo): Lado {
  const a = areasLivres(tr)[0];
  if (a) return ladoDaCaixa(a);
  return rosto.x + rosto.w / 2 > 0.5 ? "esquerda" : "direita";
}

/** A faixa livre (9:16) no trecho: a da maior área livre; sem leitura, a oposta ao rosto. */
export function faixaLivreDoTrecho(tr: TrechoLido | null | undefined, rosto: Retangulo): Faixa {
  const a = areasLivres(tr)[0];
  if (a) return faixaDaCaixa(a);
  return rosto.y + rosto.h / 2 > 0.5 ? "topo" : "baixo";
}

// ─────────────────────────────── os tipos que o trecho permite ───────────────────────────────

/**
 * OS TIPOS QUE O TRECHO PERMITE. Sem leitura: os de sempre (o vídeo antigo
 * segue igual). Com leitura, entram os tipos de contexto que fazem sentido no
 * que a câmera mostra: o zoom no ponto e o destaque só com tela ou quadro em
 * cena; o nome de quem fala só quando a pessoa que fala tem nome ou papel na
 * leitura; o realce de quem fala só com duas ou mais pessoas; o cartão de
 * passo, a frase-chave e o slide sempre (o JEV decide se cabem na fala).
 * Regra explícita de medida, não de gosto: o JEV escolhe entre os possíveis.
 */
export function tiposPossiveis(base: TipoDeElemento[], l: LeituraDoVideo | null | undefined, tr: TrechoLido | null | undefined): TipoDeElemento[] {
  if (!l) return base;
  const saida: TipoDeElemento[] = [...base];
  const fala = quemFala(tr);
  const ficha = fichaDaPessoa(l, fala?.id);
  if (fala && ficha && (ficha.nome || ficha.papel)) saida.push("nome-de-quem-fala");
  if (pessoasEmCena(tr).length >= 2) saida.push("realce-de-quem-fala");
  if (regiaoDoConteudo(tr)) saida.push("zoom-no-ponto", "destaque-na-tela");
  saida.push("cartao-de-passo", "frase-chave", "slide");
  // Com tela ou quadro em cena, a peça de tela cheia, a combinada (vídeo de fundo em tela cheia) e o texto atrás da pessoa não cabem: cobririam o conteúdo.
  const semConteudo: TipoDeElemento[] = regiaoDoConteudo(tr) ? ["impacto", "texto-atras", "combinada"] : [];
  // Com a pessoa se mexendo muito, o recorte atrás dela falha: nada de profundidade.
  if (tr?.movimento === "muito") semConteudo.push("texto-atras");
  const ordem = saida.filter((t, i) => saida.indexOf(t) === i && !semConteudo.includes(t));
  // "nada" sempre por último, como na lista de sempre.
  return [...ordem.filter((t) => t !== "nada"), ...(ordem.includes("nada") ? ["nada" as const] : [])];
}

// ─────────────────────────────── o texto para o JEV e para o redator ───────────────────────────────

const NOME_DO_GENERO: Record<LeituraDoVideo["genero"], string> = {
  "pessoa-falando": "uma pessoa falando para a câmera",
  "apresentacao-com-quadro": "uma pessoa apresentando com um quadro (lousa ou quadro branco)",
  conversa: "duas ou mais pessoas conversando",
  podcast: "podcast (pessoas em volta de uma mesa, microfones)",
  palestra: "palestra para um público",
  tela: "tela compartilhada (a pessoa pequena ou ausente)",
  vlog: "vlog (câmera na mão, lugares)",
  demonstracao: "demonstração (as mãos, um objeto, uma receita, um processo)",
  outro: "outro",
};

const nomeDaPessoa = (p: PessoaLida | null, id: string) => (p ? [p.nome, p.papel].filter(Boolean).join(", ") || p.descricao.slice(0, 60) || id : id);

/** O resumo da leitura para o estado do JEV e para o redator (vazio sem leitura). */
export function resumoDaLeitura(l: LeituraDoVideo | null | undefined): string {
  if (!l) return "";
  const pessoas = (l.pessoas ?? []).map((p) => `${p.id}: ${nomeDaPessoa(p, p.id)}${p.descricao ? ` (${p.descricao.slice(0, 90)})` : ""}`).join("; ");
  return [
    `LEITURA DO VÍDEO INTEIRO: gênero "${NOME_DO_GENERO[l.genero] ?? l.genero}" (confiança ${Math.round((l.generoConfianca ?? 0) * 100)}%).`,
    l.cenario ? `Cenário da gravação: ${l.cenario.slice(0, 220)}.` : "",
    pessoas ? `Pessoas: ${pessoas}.` : "",
    l.resumo ? `Resumo: ${l.resumo.slice(0, 300)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const descricaoDaArea = (a: Retangulo): string => {
  const lado = a.x + a.w / 2 < 0.38 ? "à esquerda" : a.x + a.w / 2 > 0.62 ? "à direita" : "no centro";
  const faixa = a.y + a.h / 2 < 0.38 ? "em cima" : a.y + a.h / 2 > 0.62 ? "embaixo" : "no meio";
  return `${lado} ${faixa} (${Math.round(a.w * 100)}% x ${Math.round(a.h * 100)}% do quadro)`;
};

/** O contexto de UM trecho para a pergunta do JEV e para o pedido do redator (vazio sem trecho). */
export function contextoDoTrecho(l: LeituraDoVideo | null | undefined, tr: TrechoLido | null | undefined): string {
  if (!l || !tr) return "";
  const fala = quemFala(tr);
  const pessoas = (tr.pessoasEmCena ?? []).map((p) => `${nomeDaPessoa(fichaDaPessoa(l, p.id), p.id)}${p.id === fala?.id ? " (falando)" : ""}`).join("; ");
  const conteudo = caixaValida(tr.tela) ? "tela compartilhada em cena" : caixaValida(tr.quadro) ? "quadro em cena" : "";
  const livres = areasLivres(tr).slice(0, 3).map(descricaoDaArea).join(", ");
  return [
    `EM CENA AGORA: ${tr.acontece || "sem descrição"}.`,
    tr.mostra?.length ? `A imagem mostra: ${tr.mostra.slice(0, 6).join(", ")}.` : "",
    pessoas ? `Pessoas em cena: ${pessoas}.` : "Ninguém em cena.",
    conteudo ? `${conteudo[0].toUpperCase()}${conteudo.slice(1)}: a peça nunca cobre.` : "",
    tr.falaDe ? `A fala é sobre: ${tr.falaDe.slice(0, 160)}.` : "",
    `Movimento: ${tr.movimento}.`,
    livres ? `Área livre para peças: ${livres}.` : "Sem área livre medida.",
  ]
    .filter(Boolean)
    .join(" ");
}

// ─────────────────────────────── a câmera ───────────────────────────────

/**
 * A caixa de uma região DEPOIS do zoom da câmera: a mesma conta do `recorte`
 * do worker (recorte de 1/zoom do quadro, centrado no foco, preso às bordas).
 * É com ela que a moldura do zoom no ponto cai no lugar certo da tela.
 */
export function caixaNaCamera(caixa: Retangulo, enq: { zoom: number; x: number; y: number }): Retangulo {
  const z = Math.max(1, Math.min(2.2, enq.zoom || 1));
  const w = 1 / z;
  const h = 1 / z;
  const cx = limitar(enq.x - w / 2, 0, 1 - w);
  const cy = limitar(enq.y - h / 2, 0, 1 - h);
  return { x: arred((caixa.x - cx) * z), y: arred((caixa.y - cy) * z), w: arred(caixa.w * z), h: arred(caixa.h * z) };
}

/**
 * O enquadramento que aproxima uma região: ela passa a ocupar ~70% do quadro,
 * sem nunca sair dele (zoom até 2). Null quando a região já é grande demais
 * para aproximar (zoom abaixo de 1,08: a tela inteira compartilhada, o quadro
 * inteiro): aí o que cabe é o destaque sem zoom, e o resolvedor troca.
 */
export function enquadramentoDoPonto(regiao: Retangulo): { zoom: number; x: number; y: number } | null {
  const w = Math.max(0.05, regiao.w);
  const h = Math.max(0.05, regiao.h);
  const zoom = +Math.min(2, 0.7 / w, 0.7 / h, 1 / w, 1 / h).toFixed(3);
  if (zoom < 1.08) return null;
  return { zoom, x: arred(limitar(regiao.x + regiao.w / 2, 0.05, 0.95)), y: arred(limitar(regiao.y + regiao.h / 2, 0.05, 0.95)) };
}

// ─────────────────────────────── a leitura num corte ───────────────────────────────

/** Uma caixa da gravação levada para dentro de um quadro (o 9:16 do corte), presa às bordas; null se ficou fora. */
export function caixaNoQuadro(r: Retangulo, q: Retangulo): Retangulo | null {
  const i = intersecao(r, q);
  if (!i) return null;
  return dentroDoQuadro({ x: (i.x - q.x) / q.w, y: (i.y - q.y) / q.h, w: i.w / q.w, h: i.h / q.h });
}

/**
 * A LEITURA DE UM CORTE: os trechos no tempo do corte (pelos intervalos
 * mantidos, como `noTempoDoCorte`) e as caixas dentro do quadro 9:16 que o
 * corte recorta da gravação. A pessoa que ficou fora do quadro sai do trecho;
 * a área livre é a parte dela dentro do quadro.
 */
export function leituraNoCorte(l: LeituraDoVideo, quadro: Retangulo, inicioDoCorte: number, manter: Array<{ de: number; ate: number }>): LeituraDoVideo {
  const trechos: TrechoLido[] = [];
  let acumulado = 0;
  for (const m of manter) {
    const de = inicioDoCorte + m.de;
    const ate = inicioDoCorte + m.ate;
    for (const t of l.trechos ?? []) {
      const a = Math.max(t.de, de);
      const b = Math.min(t.ate, ate);
      if (b - a < 0.05) continue;
      const pessoas = (t.pessoasEmCena ?? [])
        .map((p) => {
          const caixa = caixaValida(p.caixa) ? caixaNoQuadro(p.caixa, quadro) : null;
          if (!caixa || area(caixa) < 0.01) return null;
          const rosto = caixaValida(p.rosto) ? caixaNoQuadro(p.rosto, quadro) : null;
          return { ...p, caixa, rosto };
        })
        .filter((p): p is NonNullable<typeof p> => Boolean(p));
      trechos.push({
        ...t,
        de: +(acumulado + (a - de)).toFixed(3),
        ate: +(acumulado + (b - de)).toFixed(3),
        pessoasEmCena: pessoas,
        tela: caixaValida(t.tela) ? caixaNoQuadro(t.tela, quadro) : null,
        quadro: caixaValida(t.quadro) ? caixaNoQuadro(t.quadro, quadro) : null,
        areaLivre: (t.areaLivre ?? []).filter(caixaValida).map((x) => caixaNoQuadro(x, quadro)).filter((x): x is Retangulo => Boolean(x && area(x) > 0.01)),
      });
    }
    acumulado += m.ate - m.de;
  }
  return { ...l, formato: "9:16", trechos };
}
