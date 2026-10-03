/**
 * A LINHA DO TEMPO DO VÍDEO, INTEIRA E HONESTA (02/10/2026).
 *
 * O relato do Bruno que fez este módulo: "o usuário fica esperando chegar no
 * final, ali em Vídeo completo, mas quando chega ali ainda aparece a tarja
 * roxa dizendo que a edição final com os efeitos está sendo feita". A faixa
 * tinha oito marcos e acabava no "Vídeo completo"; depois dele vinham, fora da
 * linha, a montagem com efeitos e a revisão visual, numa tarja à parte, e a
 * aprovação do roteiro era uma caixa laranja no lugar da linha. Quem olhava a
 * linha via o fim, e o fim não era o fim.
 *
 * Agora TODAS as etapas reais estão na linha, na ordem em que acontecem:
 *
 *   (no vídeo do gêmeo: Sua voz, Seu vídeo, Juntar), Ouvindo, Pesquisando
 *   (em paralelo), Escolhendo, Roteiro, Aprovar roteiro (esperando você),
 *   Cortando, Capas, Escrevendo, Edição da fala, Efeitos, Abertura e
 *   montagem, Revisão final, Vídeo completo, Aprovar peças (esperando você).
 *
 * Todas aparecem desde o primeiro segundo, e o último ponto só fica verde
 * quando nada mais está rodando. O relógio de cada etapa é o MEDIDO, pelo
 * alto (lib/media/tempos-medidos.ts).
 *
 * Módulo PURO: a faixa é componente de cliente e lê daqui. O que precisa do
 * banco (o estado da montagem, os posts esperando aprovação) chega pronto em
 * `linha`, montado por `lib/media/linha-do-tempo-servidor.ts`.
 */

import { segundosDaEdicao, segundosDaEtapa } from "@/lib/media/tempos-medidos";

/** O que o servidor manda além do estado do vídeo (02/10). */
export type ExtrasDaLinha = {
  /** A tela de roteiro está ligada (ROTEIRO_ANTES_DE_GERAR). */
  roteiroLigado: boolean;
  /** A montagem com efeitos existe para este vídeo (ligada ou já tem estado). */
  efeitosLigados: boolean;
  /** A revisão visual final está ligada. */
  revisaoLigada: boolean;
  /** A montagem do vídeo completo, quando existe. */
  completo: {
    estado: string | null;
    /** Um render pronto esperando a revisão quadro a quadro. */
    revisando: boolean;
    /** Rodadas de conserto já feitas pela revisão (teto 2). */
    rodadas: number;
    /** Foi ao ar a versão limpa (a revisão não aprovou os efeitos). */
    segura: boolean;
    falhaTecnica: boolean;
  } | null;
  /** Cortes com a montagem de efeitos rodando (fora da revisão). */
  cortesEmEfeitos: number;
  /** Cortes com o render pronto esperando a revisão visual. */
  cortesEmRevisao: number;
  /** Peças deste vídeo no quadro esperando o ok do cliente (posts em rascunho). */
  postsParaAprovar: number;
};

/**
 * O VÍDEO DO GÊMEO DIGITAL antes de virar gravação (02/10): a voz, os pedaços
 * gerados em paralelo e a junção. Depois disso ele entra na esteira como
 * qualquer gravação, e a linha continua dali.
 */
export type GemeoNaLinha = {
  estado: string;
  pedacos: number;
  pedacosProntos: number;
};

/** O mínimo do vídeo que a linha lê (a `VideoAoVivo` da faixa cabe aqui). */
export type EntradaDaLinha = {
  gemeo?: GemeoNaLinha | null;
  status: string;
  durationSec: number | null;
  trechosEscolhidos: number;
  cortesProntos: number;
  temTranscricao: boolean;
  temTrechos: boolean;
  temCortes: boolean;
  temTrechosComPosts: boolean;
  temCompleto: boolean;
  completoFalhou?: boolean;
  edicoesEmAndamento?: number;
  etapaDoCompleto?: string | null;
  radar?: unknown;
  roteiro?: { existe: boolean; aprovado: boolean } | null;
  roteiroPendente?: boolean;
  linha?: ExtrasDaLinha | null;
};

export type ChaveDoPasso =
  | "gemeo-voz"
  | "gemeo-pedacos"
  | "gemeo-juntar"
  | "ouvindo"
  | "pesquisando"
  | "escolhendo"
  | "roteiro"
  | "aprovar-roteiro"
  | "cortando"
  | "capas"
  | "escrevendo"
  | "edicao-da-fala"
  | "efeitos"
  | "montagem"
  | "revisao"
  | "pronto"
  | "aprovar-pecas";

/**
 * feito: terminou. agora: rodando. voce: parado ESPERANDO O CLIENTE.
 * falta: ainda não começou. falhou: parou com erro. pulado: não se aplica a
 * este vídeo (ex.: a pesquisa que não rodou), dito como é, e não como feito.
 */
export type EstadoDoPasso = "feito" | "agora" | "voce" | "falta" | "falhou" | "pulado";

export type Passo = {
  chave: ChaveDoPasso;
  rotulo: string;
  detalhe: string;
  estado: EstadoDoPasso;
  /** O número curto embaixo do marco ("3 de 5 prontos", "rodada 1 de 2"). */
  nota: string | null;
  /** Corre ao lado da linha principal (não decide qual é a etapa atual). */
  paralelo?: boolean;
  /** O peso do passo no relógio, em segundos medidos e pelo alto (a lista do celular mostra "até N min"). */
  previstoSegundos?: number;
};

export type LeituraDaLinha = {
  passos: Passo[];
  /** Índice do passo atual (o primeiro rodando, esperando você ou que falhou). */
  atual: number;
  /** Nada mais roda: o último marco de trabalho ficou verde. */
  fim: boolean;
  /** Qual aprovação espera o cliente, se alguma. */
  esperandoVoce: "roteiro" | "pecas" | null;
  /** O que está acontecendo agora, numa frase ("Cortando e enquadrando: 3 de 5"). */
  agora: string;
  /** A parte do cliente acabou e ele pode fechar a tela (nada espera por ele). */
  podeSair: boolean;
  /** De que relógio é a promessa: o gêmeo gravando, o roteiro ou a edição. */
  relogio: "gemeo" | "roteiro" | "edicao";
  /** A promessa inteira deste relógio, em segundos, medida e pelo alto (lib/media/tempos-medidos.ts). */
  totalSegundos: number;
  /** Quanto da promessa ainda resta quando o passo atual terminar, em segundos. */
  restaDepoisDoAtualSegundos: number;
};

const ANDANDO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando", "montando"];
const PLANEJANDO = ["na-fila", "preparando", "dirigindo", "ilustrando", "gerando"];

const DETALHES: Record<ChaveDoPasso, { rotulo: string; detalhe: string }> = {
  "gemeo-voz": { rotulo: "Sua voz", detalhe: "O seu gêmeo fala o roteiro com a sua voz" },
  "gemeo-pedacos": { rotulo: "Seu vídeo", detalhe: "O seu rosto falando, gerado em pedaços ao mesmo tempo" },
  "gemeo-juntar": { rotulo: "Juntar", detalhe: "Os pedaços emendados num vídeo só, que entra na edição" },
  ouvindo: { rotulo: "Ouvindo", detalhe: "Palavra por palavra, com marcação de tempo" },
  pesquisando: { rotulo: "Pesquisando", detalhe: "O que você disse, o que estão falando, dados com fonte" },
  escolhendo: { rotulo: "Escolhendo", detalhe: "Procurando as falas que sustentam um post sozinhas" },
  roteiro: { rotulo: "Roteiro", detalhe: "Planejando cada cena em texto, para você aprovar antes de gerarmos" },
  "aprovar-roteiro": { rotulo: "Aprovar roteiro", detalhe: "Você escolhe os cortes e aprova; só então geramos" },
  cortando: { rotulo: "Cortando", detalhe: "Enquadrando cada corte para o formato de cada rede" },
  capas: { rotulo: "Capas", detalhe: "Escrevendo os títulos e montando as capas" },
  escrevendo: { rotulo: "Escrevendo", detalhe: "Um texto por rede, na sua voz" },
  "edicao-da-fala": { rotulo: "Edição da fala", detalhe: "A gravação inteira sem pausas e repetições, com capítulos" },
  efeitos: { rotulo: "Efeitos", detalhe: "O plano de cada cena, as imagens e os elementos" },
  montagem: { rotulo: "Abertura e montagem", detalhe: "A abertura, os efeitos, a legenda e o som no vídeo" },
  revisao: { rotulo: "Revisão final", detalhe: "Conferimos o vídeo pronto quadro a quadro antes de entregar" },
  pronto: { rotulo: "Vídeo completo", detalhe: "Tudo entregue no quadro" },
  "aprovar-pecas": { rotulo: "Aprovar peças", detalhe: "Você assiste, ajusta e aprova para agendar" },
};

/**
 * O PESO de cada passo no relógio, em SEGUNDOS medidos (lib/media/tempos-medidos.ts),
 * pelo alto. Cada relógio reparte a etapa medida entre os passos que ela cobre:
 * o roteiro medido cobre ouvir, escolher e planejar; a "base" cobre cortes,
 * capas, textos e a edição da fala.
 */
function pesosDoRelogio(relogio: LeituraDaLinha["relogio"], d: number | null): Partial<Record<ChaveDoPasso, number>> {
  if (relogio === "gemeo") {
    return { "gemeo-voz": segundosDaEtapa("gemeoVoz", d), "gemeo-pedacos": segundosDaEtapa("gemeoPedacos", d), "gemeo-juntar": segundosDaEtapa("gemeoJuntar", d) };
  }
  if (relogio === "roteiro") {
    const r = segundosDaEtapa("roteiro", d);
    return { ouvindo: r * 0.15, escolhendo: r * 0.25, roteiro: r * 0.6 };
  }
  const b = segundosDaEtapa("base", d);
  return {
    cortando: b * 0.6,
    capas: b * 0.1,
    escrevendo: b * 0.1,
    "edicao-da-fala": b * 0.2,
    efeitos: segundosDaEtapa("efeitos", d),
    montagem: segundosDaEtapa("montagem", d),
    revisao: segundosDaEtapa("revisao", d),
  };
}

export function lerLinhaDoTempo(v: EntradaDaLinha, etapaLocal: string | null = null): LeituraDaLinha {
  const s = v.status;
  const x = v.linha ?? null;
  const ce = x?.completo ?? null;
  const g = v.gemeo ?? null;
  const gemeoGravando = Boolean(g && g.estado !== "na-esteira");
  const estadoDoCompleto = ce?.estado ?? v.etapaDoCompleto ?? null;
  const roteiroLigado = x?.roteiroLigado ?? Boolean(v.roteiro?.existe || v.roteiroPendente || ["roteirizando", "roteiro", "aprovando"].includes(s));
  const efeitosLigados = x?.efeitosLigados ?? Boolean(estadoDoCompleto);
  const revisaoLigada = efeitosLigados && (x?.revisaoLigada ?? false);
  const pendenteDoRoteiro = Boolean(v.roteiroPendente);
  const falhou = s === "failed";
  const revisandoCompleto = Boolean(ce?.revisando);
  const consertando = Boolean(ce && ce.rodadas > 0 && ANDANDO.includes(ce.estado ?? "") && !ce.revisando);
  const cortesEmEfeitos = x?.cortesEmEfeitos ?? 0;
  const cortesEmRevisao = x?.cortesEmRevisao ?? 0;
  const postsParaAprovar = x?.postsParaAprovar ?? 0;
  const edicoes = v.edicoesEmAndamento ?? 0;

  // O TRABALHO ACABOU de verdade: nada de corte, completo, efeito ou revisão rodando.
  const trabalhoAcabou =
    !gemeoGravando &&
    s === "ready" &&
    v.temCompleto &&
    edicoes === 0 &&
    !revisandoCompleto &&
    !consertando &&
    cortesEmEfeitos === 0 &&
    cortesEmRevisao === 0;

  const passos: Passo[] = [];
  const add = (chave: ChaveDoPasso, estado: EstadoDoPasso, nota: string | null = null, paralelo = false) =>
    passos.push({ chave, ...DETALHES[chave], estado, nota, paralelo });

  // ── O gêmeo digital, antes de virar gravação ─────────────────────────────
  if (g) {
    const e = g.estado;
    const pedacosFeitos = !gemeoGravando || ["juntando", "juntado"].includes(e);
    add("gemeo-voz", !gemeoGravando || ["gerando", "juntando", "juntado"].includes(e) ? "feito" : e === "falhou" ? "falhou" : "agora");
    add(
      "gemeo-pedacos",
      pedacosFeitos ? "feito" : e === "gerando" ? "agora" : e === "falhou" ? "falta" : "falta",
      g.pedacos > 0 ? `${pedacosFeitos ? g.pedacos : g.pedacosProntos} de ${g.pedacos}` : null
    );
    add("gemeo-juntar", !gemeoGravando ? "feito" : ["juntando", "juntado"].includes(e) ? "agora" : "falta");
  }
  const antes = gemeoGravando; // nada da esteira começou ainda

  // Ouvindo
  add("ouvindo", antes ? "falta" : v.temTranscricao ? "feito" : falhou ? "falhou" : ["uploaded", "transcribing"].includes(s) ? "agora" : "falta");

  // Pesquisando, em paralelo com a escolha (o Roberto roda da mesma transcrição).
  const radar = v.radar as { teses?: number; fontes?: number } | null | undefined;
  add(
    "pesquisando",
    antes ? "falta" : radar ? "feito" : !v.temTranscricao ? "falta" : trabalhoAcabou ? "pulado" : falhou ? "falta" : "agora",
    radar && typeof radar.teses === "number" ? `${radar.teses} ${radar.teses === 1 ? "tese" : "teses"}, ${radar.fontes ?? 0} ${radar.fontes === 1 ? "fonte" : "fontes"}` : null,
    true
  );

  // Escolhendo
  const escolhaFeita = v.temTrechos && !["transcribed", "selecting"].includes(s);
  add(
    "escolhendo",
    antes ? "falta" : escolhaFeita ? "feito" : ["transcribed", "selecting"].includes(s) ? "agora" : falhou && v.temTranscricao ? "falhou" : "falta",
    v.trechosEscolhidos > 0 ? `${v.trechosEscolhidos} ${v.trechosEscolhidos === 1 ? "momento" : "momentos"}` : null
  );

  // Roteiro e a aprovação dele
  if (roteiroLigado) {
    const roteiroFeito = (Boolean(v.roteiro?.existe) && s !== "roteirizando") || v.temCortes || Boolean(v.roteiro?.aprovado);
    add(
      "roteiro",
      antes ? "falta" : roteiroFeito ? "feito" : s === "roteirizando" || (s === "selected" && pendenteDoRoteiro) ? "agora" : falhou && v.temTrechos && pendenteDoRoteiro ? "falhou" : "falta"
    );
    const aprovado = Boolean(v.roteiro?.aprovado) || v.temCortes;
    add(
      "aprovar-roteiro",
      antes ? "falta" : aprovado ? "feito" : s === "roteiro" ? "voce" : s === "aprovando" ? "agora" : "falta",
      aprovado && v.roteiro?.aprovado ? "aprovado" : s === "roteiro" ? "esperando você" : null
    );
  }

  // Cortando
  const corteRodando = s === "cutting" || (s === "selected" && !pendenteDoRoteiro);
  add(
    "cortando",
    antes ? "falta" : v.temCortes && !corteRodando ? "feito" : corteRodando ? "agora" : falhou && v.temTrechos && !v.temCortes && !pendenteDoRoteiro ? "falhou" : "falta",
    v.cortesProntos > 0
      ? corteRodando
        ? `${v.cortesProntos} de ${v.trechosEscolhidos} pronto${v.cortesProntos === 1 ? "" : "s"}`
        : `${v.cortesProntos} ${v.cortesProntos === 1 ? "corte" : "cortes"}`
      : null
  );

  // Capas e textos
  const textosProntos = v.temTrechosComPosts || s === "ready";
  add("capas", antes ? "falta" : textosProntos || s === "writing" || etapaLocal === "escrevendo" ? "feito" : s === "cut" ? "agora" : "falta");
  add(
    "escrevendo",
    antes ? "falta" : textosProntos ? "feito" : s === "writing" || (s === "cut" && etapaLocal === "escrevendo") ? "agora" : falhou && v.temCortes ? "falhou" : "falta"
  );

  // A edição da fala do vídeo inteiro: o worker faz junto com os cortes.
  add(
    "edicao-da-fala",
    antes ? "falta" : v.temCompleto ? "feito" : v.completoFalhou ? "falhou" : ["cutting", "cut", "writing", "ready"].includes(s) ? "agora" : "falta",
    null,
    true
  );

  // Efeitos, abertura e montagem, e a revisão final: na linha DESDE O INÍCIO
  // (pedido de 02/10), e não como "uma parte depois" que aparece no fim.
  if (efeitosLigados) {
    let efeitos: EstadoDoPasso = "falta";
    let notaDosEfeitos: string | null = null;
    let montagem: EstadoDoPasso = "falta";
    let notaDaMontagem: string | null = null;
    if (antes) {
      // nada
    } else if (estadoDoCompleto === "pronto") {
      efeitos = "feito";
      montagem = "feito";
    } else if (estadoDoCompleto === "sem-montagem") {
      efeitos = ce?.falhaTecnica ? "falhou" : "pulado";
      montagem = ce?.falhaTecnica ? "falhou" : "pulado";
      if (ce?.falhaTecnica) notaDaMontagem = "só a fala editada";
    } else if (consertando || revisandoCompleto) {
      efeitos = "feito";
      montagem = "feito";
    } else if (estadoDoCompleto === "montando") {
      efeitos = "feito";
      montagem = "agora";
      notaDaMontagem = "renderizando";
    } else if (PLANEJANDO.includes(estadoDoCompleto ?? "")) {
      efeitos = "agora";
      notaDosEfeitos =
        estadoDoCompleto === "gerando" || estadoDoCompleto === "ilustrando"
          ? "criando imagens"
          : estadoDoCompleto === "dirigindo" || estadoDoCompleto === "preparando"
            ? "planejando"
            : "na fila";
    } else if (v.temCompleto && edicoes > 0) {
      efeitos = "agora"; // na fila, antes de ganhar estado
      notaDosEfeitos = "na fila";
    }
    if (!antes && efeitos !== "agora" && montagem !== "agora" && cortesEmEfeitos > 0) {
      efeitos = "agora";
      notaDosEfeitos = `${cortesEmEfeitos} ${cortesEmEfeitos === 1 ? "corte" : "cortes"}`;
    }
    add("efeitos", efeitos, notaDosEfeitos);
    add("montagem", montagem, notaDaMontagem);

    if (revisaoLigada) {
      let revisao: EstadoDoPasso = "falta";
      let notaDaRevisao: string | null = null;
      if (antes) {
        // nada
      } else if (revisandoCompleto || cortesEmRevisao > 0) {
        revisao = "agora";
        notaDaRevisao = "quadro a quadro";
      } else if (consertando) {
        revisao = "agora";
        notaDaRevisao = `consertando, ${Math.min(ce!.rodadas, 2)} de 2`;
      } else if (estadoDoCompleto === "pronto") {
        revisao = "feito";
        notaDaRevisao = ce?.segura ? "versão limpa" : null;
      } else if (estadoDoCompleto === "sem-montagem") revisao = "pulado";
      add("revisao", revisao, notaDaRevisao);
    }
  }

  // O fim: só verde quando nada mais roda.
  add("pronto", trabalhoAcabou ? "feito" : v.completoFalhou && s === "ready" ? "falhou" : "falta");
  add(
    "aprovar-pecas",
    trabalhoAcabou ? (postsParaAprovar > 0 ? "voce" : "feito") : "falta",
    postsParaAprovar > 0 ? `${postsParaAprovar} esperando` : null
  );

  // Qual é a etapa atual: a primeira da linha principal rodando, esperando o
  // cliente ou parada com erro. Os paralelos só contam se forem os únicos.
  const ehAtual = (p: Passo) => p.estado === "agora" || p.estado === "voce" || p.estado === "falhou";
  let atual = passos.findIndex((p) => !p.paralelo && ehAtual(p));
  if (atual < 0) atual = passos.findIndex((p) => ehAtual(p));
  if (atual < 0) atual = passos.findIndex((p) => p.estado === "falta");
  if (atual < 0) atual = passos.length - 1;
  const passoAtual = passos[atual];

  const esperandoVoce: LeituraDaLinha["esperandoVoce"] =
    passos.find((p) => p.chave === "aprovar-roteiro")?.estado === "voce"
      ? "roteiro"
      : passos.find((p) => p.chave === "aprovar-pecas")?.estado === "voce"
        ? "pecas"
        : null;

  // O RELÓGIO: o gêmeo gravando, o roteiro (até a aprovação) ou a edição.
  // "aprovando" já é a edição: o cliente aprovou e a cobrança está saindo.
  const relogio: LeituraDaLinha["relogio"] = gemeoGravando
    ? "gemeo"
    : roteiroLigado && !v.roteiro?.aprovado && !v.temCortes && s !== "aprovando"
      ? "roteiro"
      : "edicao";
  const pesos = pesosDoRelogio(relogio, v.durationSec);
  const presentes = passos.filter((p) => pesos[p.chave] !== undefined);
  const totalSegundos = Math.round(presentes.reduce((t, p) => t + (pesos[p.chave] ?? 0), 0));
  const posicao = presentes.findIndex((p) => p.chave === passoAtual.chave);
  // Passo fora do relógio (a aprovação do roteiro sendo processada, por
  // exemplo): antes do primeiro, resta tudo; depois do último, nada.
  const depois =
    posicao >= 0
      ? presentes.slice(posicao + 1)
      : passos.indexOf(passoAtual) < passos.indexOf(presentes[0] ?? passoAtual)
        ? presentes
        : [];
  const restaDepoisDoAtualSegundos = Math.round(depois.reduce((t, p) => t + (pesos[p.chave] ?? 0), 0));

  return {
    passos: passos.map((p) => (pesos[p.chave] !== undefined ? { ...p, previstoSegundos: Math.round(pesos[p.chave]!) } : p)),
    atual,
    fim: trabalhoAcabou,
    esperandoVoce,
    agora: fraseDoAgora(passoAtual, v, { estadoDoCompleto, cortesEmEfeitos, revisandoCompleto, consertando, rodadas: ce?.rodadas ?? 0, postsParaAprovar }),
    podeSair: !esperandoVoce && !trabalhoAcabou && !falhou && !v.completoFalhou,
    relogio,
    totalSegundos,
    restaDepoisDoAtualSegundos,
  };
}

/**
 * QUANTO FALTA ATÉ O FIM DE TUDO, pelo alto (02/10): o que resta do relógio
 * atual mais os relógios que ainda vêm (o gêmeo gravando ainda tem roteiro e
 * edição pela frente; o roteiro ainda tem a edição). É o número do lugar
 * guardado do vídeo completo no quadro, que antes tinha uma conta própria.
 * `passou`: já passou da promessa do relógio atual (a tela diz isso, e não
 * "terminando agora").
 */
export function faltamAteOFim(v: EntradaDaLinha & { criadoEm: string; inicioDaRodada?: string }, agoraMs: number): { segundos: number; passou: boolean } {
  const l = lerLinhaDoTempo(v);
  const inicio = new Date(v.inicioDaRodada ?? v.criadoEm).getTime();
  const decorrido = Math.max(0, (agoraMs - inicio) / 1000);
  const doRelogio = Math.max(l.totalSegundos - decorrido, l.restaDepoisDoAtualSegundos, 0);
  const efeitos = Boolean(v.linha?.efeitosLigados);
  const revisao = Boolean(v.linha?.revisaoLigada);
  const edicao = segundosDaEdicao(v.durationSec, { efeitos, revisao });
  const depois = l.relogio === "gemeo" ? segundosDaEtapa("roteiro", v.durationSec) + edicao : l.relogio === "roteiro" ? edicao : 0;
  return { segundos: Math.round(doRelogio + depois), passou: decorrido > l.totalSegundos };
}

function fraseDoAgora(
  p: Passo,
  v: EntradaDaLinha,
  c: { estadoDoCompleto: string | null; cortesEmEfeitos: number; revisandoCompleto: boolean; consertando: boolean; rodadas: number; postsParaAprovar: number }
): string {
  if (p.estado === "falhou") return `${p.rotulo}: parou. O que já ficou pronto continua guardado.`;
  switch (p.chave) {
    case "gemeo-voz":
      return "Gravando o roteiro com a sua voz.";
    case "gemeo-pedacos":
      return v.gemeo && v.gemeo.pedacos > 0
        ? `Gerando o vídeo com o seu rosto: ${v.gemeo.pedacosProntos} de ${v.gemeo.pedacos} pedaços prontos, todos ao mesmo tempo.`
        : "Gerando o vídeo com o seu rosto.";
    case "gemeo-juntar":
      return "Juntando os pedaços num vídeo só; em seguida ele entra na edição.";
    case "ouvindo":
      return "Ouvindo a gravação palavra por palavra.";
    case "pesquisando":
      return "Pesquisando o que estão falando sobre o seu tema, com fonte.";
    case "escolhendo":
      return "Escolhendo as falas que sustentam um post sozinhas.";
    case "roteiro":
      return "Planejando cada cena em texto, para você aprovar antes de gerarmos.";
    case "aprovar-roteiro":
      return p.estado === "voce" ? "O roteiro está pronto e espera a sua aprovação." : "Recebendo a sua aprovação e preparando a edição.";
    case "cortando":
      return v.cortesProntos > 0 ? `Cortando e enquadrando: ${v.cortesProntos} de ${v.trechosEscolhidos} cortes prontos.` : "Cortando e enquadrando cada corte para cada rede.";
    case "capas":
      return "Escrevendo os títulos e montando as capas.";
    case "escrevendo":
      return "Escrevendo um texto por rede, na sua voz.";
    case "edicao-da-fala":
      return "Editando a gravação inteira: tirando pausas e repetições.";
    case "efeitos":
      if (c.estadoDoCompleto === "gerando" || c.estadoDoCompleto === "ilustrando") return "Criando as imagens e as cenas dos efeitos.";
      if (c.estadoDoCompleto === "dirigindo" || c.estadoDoCompleto === "preparando") return "Planejando os efeitos do vídeo completo, cena a cena.";
      if (c.cortesEmEfeitos > 0 && !ANDANDO.includes(c.estadoDoCompleto ?? "")) return `Montando os efeitos ${c.cortesEmEfeitos === 1 ? "de 1 corte" : `de ${c.cortesEmEfeitos} cortes`}.`;
      return "Na fila da edição com efeitos.";
    case "montagem":
      return "Renderizando o vídeo completo com a abertura, os efeitos, a legenda e o som.";
    case "revisao":
      if (c.consertando) return `Consertando o que a revisão achou e montando de novo (rodada ${Math.min(c.rodadas, 2)} de 2).`;
      return "Conferindo o vídeo pronto quadro a quadro antes de entregar.";
    case "pronto":
      return "Tudo pronto.";
    case "aprovar-pecas":
      return c.postsParaAprovar > 0
        ? `${c.postsParaAprovar} ${c.postsParaAprovar === 1 ? "peça espera" : "peças esperam"} a sua aprovação no quadro abaixo.`
        : "Tudo aprovado.";
  }
}

/**
 * A ETAPA EXIBIDA SÓ AVANÇA (03/10, pedido do Bruno: "as etapas pulam, voltam e
 * piscam").
 *
 * A leitura acima é honesta com o banco a cada consulta, e o banco oscila: o
 * vigia relança uma etapa que já tinha terminado, a montagem de efeitos volta
 * a "na-fila" por um instante entre duas rodadas, um passo paralelo some e
 * reaparece. Lida a cada 4 s, cada oscilação virava a bolinha voltando um
 * marco e voltando de novo. Para quem olha, isso é a máquina dando ré.
 *
 * A regra: a tela guarda a etapa mais adiantada que já mostrou e os marcos
 * que já pintou de verde nesta rodada, e nunca desenha menos do que isso. A
 * leitura nova só pode empurrar para frente. A memória é por CHAVE do passo, e
 * não por índice, porque a lista de passos muda de tamanho (o gêmeo, os
 * efeitos e a revisão entram quando o vídeo os tem). Uma falha passa por cima
 * da regra: parar com erro não é voltar, é o que aconteceu, e a tela diz. A
 * rodada nova (refazer) começa a memória do zero.
 */
export type MemoriaDaLinha = { rodada: string; atual: ChaveDoPasso | null; feitos: ChaveDoPasso[] };

export function linhaQueSoAvanca(
  l: LeituraDaLinha,
  memoria: MemoriaDaLinha | null,
  rodada: string
): { leitura: LeituraDaLinha; memoria: MemoriaDaLinha } {
  const mem = memoria && memoria.rodada === rodada ? memoria : { rodada, atual: null, feitos: [] as ChaveDoPasso[] };
  if (l.passos.some((p) => p.estado === "falhou")) {
    return { leitura: l, memoria: { rodada, atual: l.passos[l.atual]?.chave ?? mem.atual, feitos: mem.feitos } };
  }
  const piso = mem.atual ? l.passos.findIndex((p) => p.chave === mem.atual && !p.paralelo) : -1;
  const atual = Math.max(l.atual, piso);
  const feitos = new Set(mem.feitos);
  const passos = l.passos.map((p, i): Passo => {
    if (p.estado === "pulado") return p;
    if (feitos.has(p.chave) || (!p.paralelo && i < atual)) return { ...p, estado: "feito" };
    // Empurrado para frente pela memória: o marco segurado está "agora", e
    // não "falta", mesmo que a leitura desta consulta diga que ele não começou.
    if (i === atual && atual > l.atual && p.estado === "falta") return { ...p, estado: "agora" };
    return p;
  });
  for (const p of passos) if (p.estado === "feito") feitos.add(p.chave);
  const empurrado = atual > l.atual;
  const passoAtual = passos[atual];
  const leitura: LeituraDaLinha = {
    ...l,
    passos,
    atual,
    esperandoVoce: empurrado && passoAtual?.estado !== "voce" ? null : l.esperandoVoce,
    agora: empurrado && passoAtual ? `${passoAtual.detalhe}.` : l.agora,
  };
  return { leitura, memoria: { rodada, atual: passoAtual?.chave ?? mem.atual, feitos: [...feitos] } };
}

/** Duas memórias iguais (para a tela só regravar quando algo avançou). */
export function mesmaMemoria(a: MemoriaDaLinha | null, b: MemoriaDaLinha | null): boolean {
  if (!a || !b) return a === b;
  return a.rodada === b.rodada && a.atual === b.atual && a.feitos.length === b.feitos.length && a.feitos.every((f) => b.feitos.includes(f));
}
