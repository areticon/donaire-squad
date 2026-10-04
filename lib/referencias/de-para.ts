import { prisma } from "@/lib/db/prisma";
import { achadosDoProjeto, type PostParaAchado } from "@/lib/referencias/achados";
import { faixaDeDuracao } from "@/lib/referencias/padroes";
import { interacaoDoPost, mediana, NOME_DO_FORMATO, postsParaAchado, postsPorSemana, taxaDeEngajamento } from "@/lib/referencias/perfil-proprio";
import { rotuloDoPerfil } from "@/lib/referencias/estudo";
import type { RedeDeReferencia } from "@/lib/referencias/tipos";
import type { Achado, EtiquetasExtras } from "@/lib/referencias/tipos-das-analises";
import { STATUS_DO_PERFIL_PROPRIO, type DeParaDoPerfil, type FatiaDoPerfil, type LinhaDoDePara, type ResumoDoPerfilNoDePara } from "@/lib/referencias/tipos-do-perfil-proprio";

/**
 * O DE-PARA (03/10/2026), a segunda tela da jornada de entrada: o que as
 * referências fazem que o cliente não faz, com os dois números lado a lado.
 *
 * SEM IA: cada número é contado pelo código a partir dos posts gravados (o
 * mesmo princípio dos achados, lib/referencias/achados.ts). A comparação é de
 * HÁBITO (frequência, mix de formato, como abre, como fecha, duração, áudio),
 * que não depende do tamanho da conta; o resultado (engajamento) vai por
 * seguidor, nunca em número absoluto: 2 mil curtidas numa conta de 1 milhão é
 * pior que 200 numa de 5 mil.
 *
 * O LADO DAS REFERÊNCIAS é a MEDIANA dos perfis (cada perfil pesa um), para um
 * perfil que posta 30 vezes não falar pelos outros dois.
 *
 * A PRIORIDADE junta as duas provas: diferença grande no hábito E um achado
 * das referências dizendo que aquilo rende (o mesmo contraste dentro do
 * perfil dos gráficos). Diferença sem prova é "média"; o resto é "baixa".
 */

type Post = PostParaAchado & { legenda: string | null; seguidoresDoAutor: number | null };

const et = (p: PostParaAchado) => (p.etiquetas ?? {}) as Record<string, unknown> & EtiquetasExtras;
const VIDEO = new Set(["reel", "video", "short"]);
const GANCHO_FORTE = new Set(["pergunta", "numero", "contraintuitivo", "polemica", "promessa"]);
const NOME_DO_GANCHO: Record<string, string> = {
  pergunta: "com uma pergunta",
  numero: "com um número",
  contraintuitivo: "contrariando o senso comum",
  historia: "contando uma história",
  promessa: "com uma promessa de resultado",
  lista: "anunciando uma lista",
  polemica: "com uma polêmica",
};
const NOME_DO_TOM: Record<string, string> = { humor: "com humor", serio: "em tom sério", inspirador: "em tom inspirador", educativo: "em tom educativo", polemico: "em tom polêmico", emocional: "em tom emotivo" };

const pct = (parte: number, todo: number) => (todo ? Math.round((parte / todo) * 100) : null);
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** A medida de um perfil (um conjunto de posts). */
type Medidas = {
  porSemana: number | null;
  videoPct: number | null;
  carrosselPct: number | null;
  pedeAcaoPct: number | null;
  ganchoFortePct: number | null;
  duracaoMediana: number | null;
  musicaPct: number | null;
  hashtags: number | null;
  rostoPct: number | null;
  textoNaArtePct: number | null;
  taxa: number | null;
  medianaVisualizacoes: number | null;
  medianaInteracao: number | null;
  ganchoPct: Record<string, number>;
  tomPct: Record<string, number>;
};

function medir(posts: Post[], seguidores: number | null): Medidas {
  const total = posts.length;
  const comCta = posts.filter((p) => et(p).cta);
  const comGancho = posts.filter((p) => et(p).gancho);
  const videos = posts.filter((p) => VIDEO.has(p.formato));
  const comAudio = videos.filter((p) => p.extras?.audio);
  const comArte = posts.filter((p) => et(p).arte?.estilo);
  const contar = (lista: Post[], f: (p: Post) => string | null) => {
    const m: Record<string, number> = {};
    for (const p of lista) {
      const v = f(p);
      if (v) m[v] = (m[v] ?? 0) + 1;
    }
    for (const k of Object.keys(m)) m[k] = Math.round((m[k] / lista.length) * 100);
    return m;
  };
  return {
    porSemana: postsPorSemana(posts.map((p) => p.publicadoEm)).porSemana,
    videoPct: pct(videos.length, total),
    carrosselPct: pct(posts.filter((p) => p.formato === "carrossel").length, total),
    pedeAcaoPct: comCta.length >= 3 ? pct(comCta.filter((p) => et(p).cta !== "nenhuma").length, comCta.length) : null,
    ganchoFortePct: comGancho.length >= 3 ? pct(comGancho.filter((p) => GANCHO_FORTE.has(String(et(p).gancho))).length, comGancho.length) : null,
    duracaoMediana: mediana(videos.map((p) => p.duracaoSeg ?? NaN)),
    musicaPct: comAudio.length >= 3 ? pct(comAudio.filter((p) => !p.extras!.audio!.original).length, comAudio.length) : null,
    hashtags: mediana(posts.filter((p) => p.extras?.hashtags).map((p) => p.extras!.hashtags!.length)),
    rostoPct: comArte.length >= 3 ? pct(comArte.filter((p) => et(p).arte!.rosto).length, comArte.length) : null,
    textoNaArtePct: comArte.length >= 3 ? pct(comArte.filter((p) => et(p).arte!.texto === "muito").length, comArte.length) : null,
    taxa: taxaDeEngajamento(posts, seguidores),
    medianaVisualizacoes: mediana(posts.map((p) => (p.visualizacoes && p.visualizacoes > 0 ? p.visualizacoes : NaN))),
    medianaInteracao: mediana(posts.map((p) => interacaoDoPost(p) ?? NaN)),
    ganchoPct: comGancho.length >= 3 ? contar(comGancho, (p) => String(et(p).gancho)) : {},
    tomPct: contar(posts.filter((p) => et(p).tom), (p) => String(et(p).tom)),
  };
}

/** A porcentagem de cada formato num conjunto de posts. */
function pctDosFormatos(posts: Post[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of posts) m.set(p.formato, (m.get(p.formato) ?? 0) + 1);
  for (const [k, n] of m) m.set(k, posts.length ? (n / posts.length) * 100 : 0);
  return m;
}

/**
 * O mix de formatos dos dois lados (03/10, painel executivo). O das
 * referências é a média das porcentagens de cada perfil: um perfil que posta
 * 30 reels não fala pelos outros dois.
 */
function mixDosFormatos(proprios: Post[], refs: Post[][]): { voce: FatiaDoPerfil[]; referencias: FatiaDoPerfil[] } {
  const fatias = (m: Map<string, number>, contagem: (k: string) => number): FatiaDoPerfil[] =>
    [...m.entries()]
      .map(([chave, pct]) => ({ chave, nome: NOME_DO_FORMATO[chave] ?? chave, posts: contagem(chave), pct: Math.round(pct), vezes: null }))
      .filter((f) => f.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  const seu = pctDosFormatos(proprios);
  const deCada = refs.filter((r) => r.length).map(pctDosFormatos);
  const media = new Map<string, number>();
  for (const m of deCada) for (const [k, v] of m) media.set(k, (media.get(k) ?? 0) + v / deCada.length);
  return {
    voce: fatias(seu, (k) => proprios.filter((p) => p.formato === k).length),
    referencias: fatias(media, (k) => refs.flat().filter((p) => p.formato === k).length),
  };
}

/** A mediana de uma medida entre os perfis de referência (cada perfil pesa um). */
function dasReferencias(lista: Medidas[], f: (m: Medidas) => number | null): number | null {
  const xs = lista.map(f).filter((x): x is number => x !== null && Number.isFinite(x));
  const m = mediana(xs);
  return m === null ? null : Math.round(m * 10) / 10;
}

/** O achado das referências que diz que aquilo rende, se houver. */
function provaDe(achados: Achado[], chaves: string[]): Achado | null {
  return achados.find((a) => chaves.includes(a.chave) && a.sentido === "melhor") ?? null;
}

/** A linha, com a prioridade decidida pela diferença e pela prova. */
function linha(
  chave: string,
  medida: string,
  voce: number | null,
  elas: number | null,
  unidade: string,
  frase: string,
  prova: Achado | null,
  opcoes: { pontos?: boolean; minimo?: number } = {}
): LinhaDoDePara | null {
  if (voce === null || elas === null) return null;
  // Zero dos dois lados não diz nada (o Instagram nem sempre devolve as hashtags).
  if (voce === 0 && elas === 0) return null;
  // Diferença em pontos percentuais (para %) ou em vezes (para o resto).
  const grande = opcoes.pontos ? Math.abs(elas - voce) >= (opcoes.minimo ?? 20) : Math.max(elas, voce) / Math.max(Math.min(elas, voce), 0.1) >= (opcoes.minimo ?? 1.6);
  const elasMais = elas > voce;
  // Onde você já faz mais (ou rende mais) não é "o que elas fazem que você não faz": vai para as outras medidas.
  const prioridade: LinhaDoDePara["prioridade"] = !grande || !elasMais ? "baixa" : prova ? "alta" : "media";
  return { chave, medida, voce, elas, unidade, frase, prioridade, prova: prova ? prova.frase : null };
}

/** O de-para, puro (sem banco), para o teste com dados reais. */
export function calcularDePara(proprios: Post[], refs: Map<string, { rotulo: string; url: string | null; seguidores: number | null; posts: Post[] }>, seguidoresDoCliente: number | null, achados: Achado[]): DeParaDoPerfil {
  const voce = medir(proprios, seguidoresDoCliente);
  const deCada = [...refs.values()].filter((r) => r.posts.length > 0).map((r) => ({ r, m: medir(r.posts, r.seguidores) }));
  const ms = deCada.map((x) => x.m);
  const R = (f: (m: Medidas) => number | null) => dasReferencias(ms, f);
  const linhas: Array<LinhaDoDePara | null> = [];

  const freqElas = R((m) => m.porSemana);
  linhas.push(
    linha("frequencia", "Posts por semana", voce.porSemana, freqElas, "por semana", `As referências postam ${n1(freqElas ?? 0)} vezes por semana; você posta ${n1(voce.porSemana ?? 0)}.`, null, { minimo: 1.5 })
  );

  const taxaElas = R((m) => m.taxa);
  linhas.push(
    linha("engajamento", "Engajamento por seguidor", voce.taxa, taxaElas, "%", `Cada post das referências recebe curtidas e comentários de ${n1(taxaElas ?? 0)}% dos seguidores; os seus, de ${n1(voce.taxa ?? 0)}%.`, null, { minimo: 1.5 })
  );

  const videoElas = R((m) => m.videoPct);
  linhas.push(
    linha("video", "Vídeo no mix", voce.videoPct, videoElas, "%", `Vídeo é ${videoElas}% do que as referências postam; no seu perfil, ${voce.videoPct}%.`, provaDe(achados, ["formato:reel", "formato:video", "formato:short"]), { pontos: true })
  );

  const carElas = R((m) => m.carrosselPct);
  linhas.push(
    linha("carrossel", "Carrossel no mix", voce.carrosselPct, carElas, "%", `Carrossel é ${carElas}% do que as referências postam; no seu perfil, ${voce.carrosselPct}%.`, provaDe(achados, ["formato:carrossel"]), { pontos: true })
  );

  const ctaElas = R((m) => m.pedeAcaoPct);
  linhas.push(
    linha(
      "chamada",
      "Fecha pedindo uma ação",
      voce.pedeAcaoPct,
      ctaElas,
      "%",
      `${ctaElas}% dos posts das referências terminam pedindo uma ação (comentar, salvar, seguir, clicar); ${voce.pedeAcaoPct}% dos seus.`,
      provaDe(achados, ["chamada:comentar", "chamada:salvar", "chamada:compartilhar", "chamada:seguir", "chamada:link"]),
      { pontos: true }
    )
  );

  const gfElas = R((m) => m.ganchoFortePct);
  linhas.push(
    linha(
      "gancho",
      "Abre com gancho forte",
      voce.ganchoFortePct,
      gfElas,
      "%",
      `${gfElas}% dos posts das referências abrem com pergunta, número, promessa ou algo que contraria o senso comum; ${voce.ganchoFortePct}% dos seus.`,
      provaDe(achados, ["gancho:pergunta", "gancho:numero", "gancho:contraintuitivo", "gancho:polemica", "gancho:promessa"]),
      { pontos: true }
    )
  );

  // O gancho mais usado pelas referências, comparado um a um.
  const somaGancho: Record<string, number[]> = {};
  for (const m of ms) for (const [k, v] of Object.entries(m.ganchoPct)) (somaGancho[k] ??= []).push(v);
  const topGancho = Object.entries(somaGancho)
    .filter(([k]) => NOME_DO_GANCHO[k])
    .map(([k, vs]) => ({ k, v: mediana([...vs, ...Array(Math.max(0, ms.length - vs.length)).fill(0)]) ?? 0 }))
    .sort((a, b) => b.v - a.v)[0];
  if (topGancho && topGancho.v >= 20) {
    const seu = voce.ganchoPct[topGancho.k] ?? (Object.keys(voce.ganchoPct).length ? 0 : null);
    linhas.push(
      linha(`gancho:${topGancho.k}`, `Abre ${NOME_DO_GANCHO[topGancho.k]}`, seu, Math.round(topGancho.v), "%", `As referências abrem ${Math.round(topGancho.v)}% dos posts ${NOME_DO_GANCHO[topGancho.k]}; você, ${seu ?? 0}%.`, provaDe(achados, [`gancho:${topGancho.k}`]), { pontos: true })
    );
  }

  // O tom dominante das referências.
  const somaTom: Record<string, number[]> = {};
  for (const m of ms) for (const [k, v] of Object.entries(m.tomPct)) (somaTom[k] ??= []).push(v);
  const topTom = Object.entries(somaTom)
    .map(([k, vs]) => ({ k, v: mediana([...vs, ...Array(Math.max(0, ms.length - vs.length)).fill(0)]) ?? 0 }))
    .sort((a, b) => b.v - a.v)[0];
  if (topTom && NOME_DO_TOM[topTom.k] && topTom.v >= 25) {
    const seu = voce.tomPct[topTom.k] ?? (Object.keys(voce.tomPct).length ? 0 : null);
    linhas.push(
      linha(`tom:${topTom.k}`, `Posts ${NOME_DO_TOM[topTom.k]}`, seu, Math.round(topTom.v), "%", `${Math.round(topTom.v)}% dos posts das referências são ${NOME_DO_TOM[topTom.k]}; ${seu ?? 0}% dos seus.`, provaDe(achados, [`tom:${topTom.k}`]), { pontos: true })
    );
  }

  const durElas = R((m) => m.duracaoMediana);
  if (durElas !== null && voce.duracaoMediana !== null) {
    const faixa = faixaDeDuracao(Math.round(durElas));
    linhas.push(
      linha("duracao", "Duração dos vídeos", Math.round(voce.duracaoMediana), Math.round(durElas), "s", `Os vídeos das referências duram ${Math.round(durElas)} s na mediana; os seus, ${Math.round(voce.duracaoMediana)} s.`, faixa ? provaDe(achados, [`duracao:${faixa}`]) : null, { minimo: 1.5 })
    );
  }

  const musElas = R((m) => m.musicaPct);
  linhas.push(
    linha("musica", "Vídeo com música por baixo", voce.musicaPct, musElas, "%", `${musElas}% dos vídeos das referências têm música por baixo; ${voce.musicaPct}% dos seus.`, null, { pontos: true, minimo: 25 })
  );

  const rostoElas = R((m) => m.rostoPct);
  linhas.push(
    linha("rosto", "Rosto na capa", voce.rostoPct, rostoElas, "%", `${rostoElas}% das capas das referências mostram um rosto; ${voce.rostoPct}% das suas.`, null, { pontos: true, minimo: 25 })
  );

  const textoElas = R((m) => m.textoNaArtePct);
  linhas.push(
    linha("texto-na-arte", "Muito texto na arte", voce.textoNaArtePct, textoElas, "%", `${textoElas}% das artes das referências têm muito texto escrito; ${voce.textoNaArtePct}% das suas.`, null, { pontos: true, minimo: 25 })
  );

  const hashElas = R((m) => m.hashtags);
  linhas.push(linha("hashtags", "Hashtags por post", voce.hashtags, hashElas, "", `As referências usam ${n1(hashElas ?? 0)} hashtags por post; você usa ${n1(voce.hashtags ?? 0)}.`, null, { minimo: 2 }));

  const ordem = { alta: 0, media: 1, baixa: 2 };
  const validas = linhas.filter((l): l is LinhaDoDePara => l !== null);
  const distancia = (l: LinhaDoDePara) => (l.unidade === "%" ? Math.abs((l.elas ?? 0) - (l.voce ?? 0)) / 100 : Math.abs(Math.log(Math.max(l.elas ?? 0.1, 0.1) / Math.max(l.voce ?? 0.1, 0.1))));
  validas.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade] || distancia(b) - distancia(a));

  const resumo = (rotulo: string, url: string | null, seguidores: number | null, posts: Post[], m: Medidas): ResumoDoPerfilNoDePara => ({
    rotulo,
    url,
    seguidores,
    posts: posts.length,
    porSemana: m.porSemana,
    medianaVisualizacoes: m.medianaVisualizacoes,
    medianaInteracao: m.medianaInteracao,
    taxaDeEngajamento: m.taxa,
  });
  return {
    geradoEm: new Date().toISOString(),
    voce: resumo("Você", null, seguidoresDoCliente, proprios, voce),
    referencias: deCada.map(({ r, m }) => resumo(r.rotulo, r.url, r.seguidores, r.posts, m)),
    linhas: validas,
    manchetes: validas.filter((l) => l.prioridade !== "baixa").slice(0, 3).map((l) => l.frase),
    mix: mixDosFormatos(proprios, deCada.map(({ r }) => r.posts)),
  };
}

/** O de-para do projeto, lido do banco agora (barato: algumas centenas de linhas). Null sem os dois lados. */
export async function deParaDoProjeto(projectId: string): Promise<DeParaDoPerfil | null> {
  const [proprios, perfisRef, perfisProprios] = await Promise.all([
    postsParaAchado({ projectId, perfil: { status: STATUS_DO_PERFIL_PROPRIO } }),
    prisma.referenciaPerfil.findMany({ where: { projectId, status: "confirmado" }, select: { id: true, rede: true, perfil: true, url: true, seguidores: true } }),
    prisma.referenciaPerfil.findMany({ where: { projectId, status: STATUS_DO_PERFIL_PROPRIO }, select: { seguidores: true, rede: true } }),
  ]);
  if (!proprios.length || !perfisRef.length) return null;
  const postsRef = await postsParaAchado({ projectId, perfilId: { in: perfisRef.map((p) => p.id) } });
  if (!postsRef.length) return null;
  const refs = new Map<string, { rotulo: string; url: string | null; seguidores: number | null; posts: Post[] }>();
  for (const p of perfisRef) {
    refs.set(p.id, {
      rotulo: rotuloDoPerfil(p.rede as RedeDeReferencia, p.perfil),
      url: p.url,
      // O TikTok e o YouTube trazem seguidores no post; o Instagram, pelo perfil.
      seguidores: p.seguidores ?? postsRef.find((x) => x.perfilId === p.id && x.seguidoresDoAutor)?.seguidoresDoAutor ?? null,
      posts: postsRef.filter((x) => x.perfilId === p.id),
    });
  }
  // Seguidores do cliente: a maior conta lida (a comparação é por rede principal).
  const seguidores = perfisProprios.map((p) => p.seguidores ?? 0).sort((a, b) => b - a)[0] || proprios.find((p) => p.seguidoresDoAutor)?.seguidoresDoAutor || null;
  const { achados } = await achadosDoProjeto(projectId);
  return calcularDePara(proprios, refs, seguidores, achados);
}
