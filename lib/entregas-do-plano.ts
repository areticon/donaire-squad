/**
 * O QUE CADA PLANO ENTREGA POR MÊS, em unidades que o cliente entende (06/10).
 *
 * Decisão do Bruno de 06/10/2026: o cliente entende minutos de vídeo, vídeos,
 * peças, armazenamento e marcas; crédito sai do primeiro plano e fica só numa
 * ajuda discreta ("Como contamos"). Este módulo é o ÚNICO lugar onde essa
 * conversão acontece. A landing, /planos, a aba Plano de Configurações, a
 * faixa de prova e a calculadora leem daqui.
 *
 * NENHUM NÚMERO É ESCRITO À MÃO. Tudo sai de:
 *  - `lib/planos.ts`: saldo mensal (creditosPorMes), carteira do vídeo por IA,
 *    gravações por mês, duração máxima, armazenamento, marcas do plano;
 *  - `lib/media/limits.ts`: o preço real da gravação em duas partes
 *    (`creditosEmDuasPartes`: roteiro com a semana escrita, completo, cortes
 *    sugeridos e abertura), o mesmo que a tela de envio mostra e o servidor
 *    cobra;
 *  - `lib/media/semana-do-video.ts`: a semana sugerida (`normalizarSemana`
 *    sem nada guardado), que diz quantas peças de feed uma gravação rende;
 *  - `lib/credits/video-tabela.ts`: o vídeo por IA, por geração e não por
 *    segundo (memória preco-por-chamada-nao-por-tempo);
 *  - `lib/equipe/regras.ts`: acessos inclusos e marcas que o servidor aplica.
 *
 * A PREMISSA, uma só por cartão (duas promessas no mesmo cartão valem menos
 * que nenhuma, lição de 03/09): o cliente usa TODAS as gravações do plano, com
 * a mesma duração, na semana sugerida (vídeo completo, os cortes sugeridos e as
 * peças de feed) e com a abertura ligada, que é o padrão. A duração é a maior
 * que faz todas caberem no saldo, limitada pela duração máxima do plano.
 *
 * Sem banco e sem SDK: componente de cliente importa daqui.
 */
import { PLANOS_PUBLICOS, reais, type PlanoId, type PlanoPublico } from "@/lib/planos";
import { CORTES_SUGERIDOS, CREDITOS_POR_CORTE_APROVADO, creditosEmDuasPartes } from "@/lib/media/limits";
import { custoDoVideo, geracoesDoVideo, SEGUNDOS_DA_PRIMEIRA_GERACAO, SEGUNDOS_POR_EXTENSAO } from "@/lib/credits/video-tabela";
import { ACESSO_EXTRA, ACESSOS_INCLUSOS, marcasDaConta } from "@/lib/equipe/regras";
import { normalizarSemana } from "@/lib/media/semana-do-video";

/** Créditos de UMA gravação de N minutos, com a semana sugerida. É a conta da tela de envio. */
export function creditosDaGravacao(minutos: number): number {
  return creditosEmDuasPartes(minutos * 60).total;
}

/** A semana sugerida a quem não escolheu nada: quantos dias de corte e de peça de feed. */
function semanaSugerida(): { cortes: number; feed: number; formatosDoFeed: string[] } {
  const semana = normalizarSemana(null);
  const dias = Object.values(semana.dias).filter((d): d is NonNullable<typeof d> => Boolean(d));
  const feed = dias.filter((d) => d.formato !== "short");
  return { cortes: dias.length - feed.length, feed: feed.length, formatosDoFeed: feed.map((d) => d.formato) };
}

/** Formatos de feed que levam arte; o resto é texto. "free" conta como arte, o caso mais caro. */
const FORMATOS_COM_ARTE = new Set(["image", "carousel", "infographic", "free"]);

/** Duração do vídeo por IA que o cartão usa como unidade. */
export const SEGUNDOS_DO_VIDEO_POR_IA = 30;

export type EntregasDoPlano = {
  planoId: PlanoId;
  /** Gravações por mês (o teto que o servidor aplica). */
  gravacoes: number;
  /** A maior duração por gravação que cabe no saldo com todas as gravações usadas. */
  minutosPorGravacao: number;
  /** gravacoes x minutosPorGravacao. */
  minutosDeVideo: number;
  completos: number;
  cortes: number;
  /** completos + cortes. */
  videos: number;
  /** Imagens, carrosséis e textos da semana sugerida. */
  pecasDoFeed: number;
  /** Das peças de feed: as que são texto puro (texto, thread, enquete). */
  textosDoFeed: number;
  /** Das peças de feed: as que levam arte (imagem, carrossel, infográfico). */
  artesDoFeed: number;
  /** videos + pecasDoFeed. */
  pecas: number;
  videosPorIaCheia: number;
  videosPorIaRapida: number;
  armazenamentoGb: number;
  /** Marcas que o servidor deixa criar (marcasDaConta, sem acesso extra). */
  marcas: number;
  acessos: number;
  duracaoMaximaMin: number;
  /** Para a ajuda "Como contamos": o saldo e o que uma gravação usa. */
  conta: {
    saldoMensal: number;
    creditosPorGravacao: number;
    sobraDoSaldo: number;
    carteiraDeVideo: number;
  };
};

export function entregasDoPlano(plano: PlanoPublico): EntregasDoPlano {
  const semana = semanaSugerida();
  // Os cortes cobrados na conta são os SUGERIDOS (3), os mesmos da tela de
  // envio. A semana sugerida tem 3 dias de vídeo curto: um corte por dia.
  const cortesPorGravacao = CORTES_SUGERIDOS;
  const gravacoes = plano.gravacoesPorMes;
  const saldo = plano.creditosPorMes;

  let minutos = 0;
  for (let m = plano.duracaoMaximaMin; m >= 1; m--) {
    if (gravacoes * creditosDaGravacao(m) <= saldo) {
      minutos = m;
      break;
    }
  }
  const porGravacao = minutos ? creditosDaGravacao(minutos) : 0;
  const completos = minutos ? gravacoes : 0;
  const cortes = completos * cortesPorGravacao;
  const pecasDoFeed = completos * semana.feed;
  const artesPorGravacao = semana.formatosDoFeed.filter((f) => FORMATOS_COM_ARTE.has(f)).length;

  return {
    planoId: plano.id,
    gravacoes,
    minutosPorGravacao: minutos,
    minutosDeVideo: gravacoes * minutos,
    completos,
    cortes,
    videos: completos + cortes,
    pecasDoFeed,
    textosDoFeed: pecasDoFeed - completos * artesPorGravacao,
    artesDoFeed: completos * artesPorGravacao,
    pecas: completos + cortes + pecasDoFeed,
    videosPorIaCheia: Math.floor(plano.creditosDeVideoPorMes / custoDoVideo(SEGUNDOS_DO_VIDEO_POR_IA, "cheio")),
    videosPorIaRapida: Math.floor(plano.creditosDeVideoPorMes / custoDoVideo(SEGUNDOS_DO_VIDEO_POR_IA, "rapido")),
    armazenamentoGb: plano.armazenamentoGb,
    marcas: marcasDaConta(plano.marcas, plano.id, 0),
    acessos: ACESSOS_INCLUSOS[plano.id] ?? 1,
    duracaoMaximaMin: plano.duracaoMaximaMin,
    conta: {
      saldoMensal: saldo,
      creditosPorGravacao: porGravacao,
      sobraDoSaldo: saldo - gravacoes * porGravacao,
      carteiraDeVideo: plano.creditosDeVideoPorMes,
    },
  };
}

export const ENTREGAS: Record<PlanoId, EntregasDoPlano> = Object.fromEntries(
  PLANOS_PUBLICOS.map((p) => [p.id, entregasDoPlano(p)])
) as Record<PlanoId, EntregasDoPlano>;

function plural(n: number, um: string, varios: string): string {
  return `${reais(n)} ${n === 1 ? um : varios}`;
}

/** "1 hora", "2 horas", "45 minutos". */
export function duracaoDaGravacao(min: number): string {
  if (min % 60 === 0) return plural(min / 60, "hora", "horas");
  return plural(min, "minuto", "minutos");
}

export type NumeroDoCartao = { id: string; valor: string; rotulo: string; detalhe: string };

/** Os seis números do cartão, na ordem em que o cliente pensa. */
export function numerosDoCartao(plano: PlanoPublico): NumeroDoCartao[] {
  const e = ENTREGAS[plano.id];
  return [
    {
      id: "minutos",
      valor: `${reais(e.minutosDeVideo)} min`,
      rotulo: "de vídeo editado por mês",
      detalhe: `${plural(e.gravacoes, "gravação", "gravações")} de até ${e.minutosPorGravacao} minutos`,
    },
    {
      id: "videos",
      valor: reais(e.videos),
      rotulo: "vídeos prontos",
      detalhe: `${plural(e.completos, "completo", "completos")} e ${plural(e.cortes, "corte vertical", "cortes verticais")} legendados`,
    },
    {
      id: "pecas",
      valor: reais(e.pecasDoFeed),
      rotulo: "peças para o feed",
      detalhe: "imagens, carrosséis e textos na voz da empresa",
    },
    {
      id: "ia",
      valor: reais(e.videosPorIaCheia),
      // Espaço que não quebra: sem ele o "s" caía sozinho na linha de baixo.
      rotulo: `vídeos por IA de ${SEGUNDOS_DO_VIDEO_POR_IA} s`,
      detalhe: `na qualidade cheia, ou ${e.videosPorIaRapida} na rápida`,
    },
    {
      id: "armazenamento",
      valor: `${reais(e.armazenamentoGb)} GB`,
      rotulo: "de armazenamento",
      detalhe: "gravações, vídeos e artes guardados",
    },
    {
      id: "marcas",
      valor: reais(e.marcas),
      rotulo: e.marcas === 1 ? "marca ou porta-voz" : "marcas ou porta-vozes",
      detalhe: `${plural(e.acessos, "acesso", "acessos")}, contando o seu`,
    },
  ];
}

/** A lista de baixo do cartão: a duração máxima da gravação e o que não é número. */
export function listaDoCartao(plano: PlanoPublico): string[] {
  return [`Gravações de até ${duracaoDaGravacao(plano.duracaoMaximaMin)} cada`, ...plano.features];
}

/**
 * A lista do cartão em texto corrido, para telas que mostram só linhas
 * (aba Plano de Configurações): os números primeiro, depois o resto.
 */
export function itensDoCartao(plano: PlanoPublico): string[] {
  const e = ENTREGAS[plano.id];
  return [
    `${reais(e.minutosDeVideo)} minutos de vídeo editado por mês, em ${plural(e.gravacoes, "gravação", "gravações")}`,
    `${reais(e.videos)} vídeos prontos e ${reais(e.pecasDoFeed)} peças para o feed por mês`,
    `${e.videosPorIaCheia} vídeos por IA de ${SEGUNDOS_DO_VIDEO_POR_IA} s na qualidade cheia (${e.videosPorIaRapida} na rápida)`,
    `${reais(e.armazenamentoGb)} GB de armazenamento`,
    `${plural(e.marcas, "marca ou porta-voz", "marcas ou porta-vozes")} e ${plural(e.acessos, "acesso", "acessos")}`,
    ...listaDoCartao(plano),
  ];
}

/** O acesso extra, sem crédito na frase: o saldo dele dito em cortes. */
export function fraseDoAcessoExtra(): string {
  const cortes = Math.floor(ACESSO_EXTRA.creditosPorMes / CREDITOS_POR_CORTE_APROVADO);
  return (
    `Precisa de mais gente? Cada acesso extra custa R$ ${reais(ACESSO_EXTRA.precoMensal)} por mês e soma ` +
    `${plural(ACESSO_EXTRA.gravacoesPorMes, "gravação", "gravações")} por mês e saldo para mais ${cortes} cortes. ` +
    `Todos os acessos usam o saldo do plano, e você vê quanto cada pessoa usou.`
  );
}

/** As linhas da ajuda "Como contamos", o único lugar da vitrine onde crédito aparece. */
export function comoContamos(): { linhas: string[]; tabela: Array<{ plano: string; saldo: string; porGravacao: string; minutos: string }> } {
  const semana = semanaSugerida();
  const exemplo = 30;
  return {
    linhas: [
      `Cada plano tem um saldo mensal de produção, medido em créditos. O cartão mostra o que esse saldo vira na prática.`,
      `A conta supõe todas as gravações do mês com a mesma duração e a semana sugerida: um vídeo completo, ${CORTES_SUGERIDOS} cortes verticais e ${semana.feed} peças para o feed por gravação.`,
      `Uma gravação de ${exemplo} minutos com essa semana usa ${reais(creditosDaGravacao(exemplo))} créditos. Gravar mais longo ou aprovar mais cortes usa mais saldo; gravar mais curto sobra saldo para outros cortes e peças.`,
      `O vídeo por IA tem carteira própria e é contado por geração: ${SEGUNDOS_DO_VIDEO_POR_IA} segundos pedem ${geracoesDoVideo(SEGUNDOS_DO_VIDEO_POR_IA)} gerações (os ${SEGUNDOS_DA_PRIMEIRA_GERACAO} segundos iniciais e extensões de ${SEGUNDOS_POR_EXTENSAO}).`,
      `Ajustes pelo chat, abertura por IA nos cortes e o gêmeo digital usam o mesmo saldo e não entram nos números do cartão.`,
    ],
    tabela: PLANOS_PUBLICOS.map((p) => {
      const e = ENTREGAS[p.id];
      return {
        plano: p.nome,
        saldo: reais(e.conta.saldoMensal),
        porGravacao: reais(e.conta.creditosPorGravacao),
        minutos: `${e.gravacoes} x ${e.minutosPorGravacao} min`,
      };
    }),
  };
}
