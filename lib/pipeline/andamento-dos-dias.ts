/**
 * EM QUE PONTO CADA DIA DA CAMPANHA ESTÁ, lido do registro da execução (28/09).
 *
 * Pedido do Bruno: "a geração das artes precisa ter um [carregando], algo
 * mostrando que está acontecendo nos cards, o usuário fica sem saber se
 * travou, se acabou ou se finalizou". O calendário mostrava o dia vazio (ou
 * o cartão sem capa) do começo ao fim da geração, e o registro dizia tudo:
 * "Segunda-feira 28: video", "Criando imagem para Terça-feira 29",
 * "Lâmina 4/5 pronta", "Vídeo de 30s: geração 1 de 4 pronta".
 *
 * Função PURA, sem banco: o registro já chega na tela a cada 4 segundos pela
 * rota de status, e ler o texto aqui evita uma coluna nova para um estado que
 * existe por minutos.
 */

export type FaseDoDia = "fila" | "texto" | "arte" | "revisao" | "video" | "pronto";

export type AndamentoDoDia = {
  fase: FaseDoDia;
  /** A frase que a tela mostra: "Carrossel: lâmina 4 de 5". */
  detalhe: string;
  /** Sem registro novo há mais de 5 minutos com a campanha rodando. */
  parado: boolean;
  /** Minutos desde o último registro deste dia. */
  minutos: number;
};

type Linha = { agent?: string; message?: string; status?: string; timestamp?: string };

const DIAS: Array<[RegExp, number]> = [
  [/segunda-feira/i, 1],
  [/ter[çc]a-feira/i, 2],
  [/quarta-feira/i, 3],
  [/quinta-feira/i, 4],
  [/sexta-feira/i, 5],
  [/s[áa]bado/i, 6],
  [/domingo/i, 7],
];

function diaCitado(texto: string): number | null {
  for (const [re, d] of DIAS) if (re.test(texto)) return d;
  return null;
}

const CINCO_MINUTOS = 5 * 60_000;

export function andamentoDosDias(
  logs: unknown,
  statusDaExecucao: string | null | undefined,
  agora: Date = new Date()
): Record<number, AndamentoDoDia> {
  const linhas = (Array.isArray(logs) ? logs : []) as Linha[];
  const saida: Record<number, AndamentoDoDia & { em: number }> = {};
  const rodando = statusDaExecucao === "running";
  let diaAtual: number | null = null;
  let diaDoVideo: number | null = null;
  let ultimo = 0;

  const marcar = (d: number | null, fase: FaseDoDia, detalhe: string, em: number) => {
    if (!d) return;
    // Pronto não volta atrás, a não ser pelo vídeo, que nasce depois do dia.
    if (saida[d]?.fase === "pronto" && fase !== "video" && fase !== "pronto") return;
    saida[d] = { fase, detalhe, parado: false, minutos: 0, em };
  };

  for (const l of linhas) {
    const msg = l.message ?? "";
    const em = l.timestamp ? new Date(l.timestamp).getTime() : ultimo;
    if (em) ultimo = em;

    // "7 dia(s) na fila: Segunda-feira 28, Terça-feira 29, ..."
    if (/dia\(s\) na fila:/i.test(msg)) {
      for (const [re, d] of DIAS) if (re.test(msg)) marcar(d, "fila", "Na fila", em);
      continue;
    }
    // O começo de um dia: "Segunda-feira 28: video, escolha sua."
    const inicio = msg.match(/^([A-Za-zÀ-ú-]+(?:-feira)? \d{1,2}):/);
    if (l.agent === "Sistema" && inicio && diaCitado(inicio[1])) {
      if (diaAtual && diaAtual !== diaCitado(inicio[1]) && saida[diaAtual]?.fase !== "video") marcar(diaAtual, "pronto", "Pronto", em);
      diaAtual = diaCitado(inicio[1]);
      marcar(diaAtual, "texto", "Escrevendo os textos", em);
      continue;
    }

    const citado = diaCitado(msg) ?? diaAtual;
    if (/Criando imagem para/i.test(msg)) marcar(citado, "arte", "Criando a arte", em);
    else if (/Roteiro do carrossel/i.test(msg)) marcar(citado, "arte", "Criando o carrossel", em);
    else if (/L[âa]mina (\d+)\/(\d+) pronta/i.test(msg)) {
      const [, k, n] = msg.match(/L[âa]mina (\d+)\/(\d+) pronta/i)!;
      marcar(diaAtual, "arte", `Carrossel: lâmina ${k} de ${n} pronta`, em);
    } else if (/Criando v[íi]deo para|Gerando o quadro/i.test(msg)) marcar(citado, "arte", "Criando o quadro do vídeo", em);
    else if (/infogr[áa]fico/i.test(msg) && l.agent === "Diana Design") marcar(citado, "arte", "Criando o infográfico", em);
    else if (l.agent === "Vera Veredito" && /Iniciando/i.test(msg)) marcar(diaAtual, "revisao", "Vera revisando", em);
    // "Vídeo de Segunda-feira 28 na fila", com o dia no texto. Sem o dia não é
    // isto: "geração 1 de 4 pronta. A próxima entra na fila" também diz "na
    // fila", e a primeira versão mandava o vídeo para o último dia escrito.
    else if (/V[íi]deo de .+ na fila/i.test(msg) && diaCitado(msg)) {
      diaDoVideo = diaCitado(msg);
      marcar(diaDoVideo, "video", "Vídeo na fila do gerador", em);
    } else if (/Refazendo o v[íi]deo/i.test(msg)) {
      marcar(diaDoVideo ?? diaAtual, "video", "Refazendo o vídeo", em);
    } else if (/gera[çc][ãa]o (\d+) de (\d+) pronta/i.test(msg)) {
      const [, k, n] = msg.match(/gera[çc][ãa]o (\d+) de (\d+) pronta/i)!;
      marcar(diaDoVideo, "video", `Vídeo: trecho ${k} de ${n} pronto`, em);
    } else if (/gerador de v[íi]deo do Google teve uma falha/i.test(msg)) {
      const min = msg.match(/em (\d+) min/)?.[1];
      marcar(diaDoVideo, "video", `O gerador do Google falhou; nova tentativa em ${min ?? "alguns"} min`, em);
    } else if (/V[íi]deo de \d+s pronto|O v[íi]deo saiu com/i.test(msg)) marcar(diaDoVideo, "pronto", "Pronto", em);
  }

  // Campanha encerrada: o que não é vídeo em andamento está pronto.
  if (!rodando) {
    for (const d of Object.keys(saida).map(Number)) {
      // O vídeo pode seguir depois do fecho (refeito a pedido), mas vídeo sem
      // registro há 40 minutos numa campanha fechada já não está andando.
      const velho = agora.getTime() - (saida[d].em || 0) > 40 * 60_000;
      if (saida[d].fase !== "video" || velho) saida[d] = { ...saida[d], fase: "pronto", detalhe: "Pronto" };
    }
  }

  const final: Record<number, AndamentoDoDia> = {};
  for (const [d, a] of Object.entries(saida)) {
    const idade = agora.getTime() - (a.em || agora.getTime());
    const ativo = a.fase !== "pronto" && a.fase !== "fila";
    final[Number(d)] = {
      fase: a.fase,
      detalhe: a.detalhe,
      minutos: Math.max(0, Math.floor(idade / 60_000)),
      // O vídeo anda depois do fecho da campanha (refeito a pedido), e um
      // trecho leva até 5 minutos: parado é 8 minutos sem novidade.
      parado: a.fase === "video" ? ativo && idade > 8 * 60_000 : rodando && ativo && idade > CINCO_MINUTOS,
    };
  }
  return final;
}
