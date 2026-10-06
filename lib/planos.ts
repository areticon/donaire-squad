/**
 * A tabela de planos que o cliente vê. Módulo sem Stripe de propósito: a
 * landing, a página /planos e a tela de billing são componentes de cliente,
 * e importar lib/stripe ali arrastaria o SDK do Stripe para o bundle do
 * navegador (armadilha já paga, ver PROJETO.md). Até 02/09 cada uma dessas
 * telas tinha uma cópia manual da tabela, e as três divergiam entre si.
 *
 * Tabela de 02/09/2026: Essencial R$ 397, Autoridade R$ 697, Estúdio R$ 1.997.
 * O porquê está no comentário de PLANS em lib/stripe/index.ts. Aqui só o que
 * a tela mostra.
 *
 * As chaves "pro", "business" e "studio" ficam: são o valor gravado em
 * User.plan e o nome das variáveis de ambiente dos preços no Stripe.
 */
import { marcasDaConta } from "@/lib/equipe/regras";

export type PlanoId = "pro" | "business" | "studio";

export const TRIAL_DAYS = 7;

/** Nos primeiros 30 dias, se não publicar nada que aprovou, devolvemos tudo. */
export const GARANTIA_DIAS = 30;

/**
 * Fundador: os 10 primeiros no Autoridade travam R$ 397 por mês para sempre,
 * pagando R$ 4.764 uma vez por ano.
 *
 * POR QUE ANUAL, decidido em 14/09: até aqui a oferta era um CUPOM de R$ 300
 * fixos, e valor fixo não sabe em que preço está caindo. O mesmo cupom era a
 * oferta no Autoridade mensal, virava R$ 97 por mês no Essencial de R$ 397 (o
 * vazamento do card 370) e virava 4,3% no anual de R$ 6.970, ou seja oferta
 * nenhuma no ciclo que põe dinheiro no caixa. Um price próprio só existe onde
 * foi colocado, e não há código para digitar.
 *
 * `mensal` continua sendo 397 de propósito: é o número que a vitrine mostra,
 * porque é a promessa que vende. O que se PAGA, `anual`, vive dentro do botão,
 * e essa divisão foi a decisão do canvas (opção C): não dá para clicar sem ter
 * lido o valor da cobrança, e a comparação com os R$ 697 de lista sobrevive.
 */
export const FUNDADOR = {
  plano: "business" as PlanoId,
  /** O equivalente mensal, que é o número grande do cartão. */
  mensal: 397,
  /** O que é cobrado de uma vez, 12 x 397. */
  anual: 4764,
  vagas: 10,
};

/**
 * As três frases da oferta moram aqui pelo mesmo motivo que a tabela mora:
 * a landing, /planos e a aba Plano de /settings desenham o mesmo cartão, e
 * quando cada uma tinha a sua cópia as três divergiram.
 */
export const FUNDADOR_COBRANCA = "Cobrado uma vez por ano, e é o que trava o preço";

export function fundadorBotao(): string {
  return `Garantir vaga, R$ ${reais(FUNDADOR.anual)} no ano`;
}

export function fundadorVagas(vagas: number): string {
  return `Fundador: ${vagas} de ${FUNDADOR.vagas} vagas. Esse preço fica para sempre.`;
}

/**
 * O que o cartão do MENSAL diz enquanto a vaga existe só no anual.
 *
 * Existe porque a regra inverteu: até 14/09 o fundador só aparecia no mensal, e
 * agora só existe no anual. Sem esta linha, quem chega pelo anúncio da vaga e
 * cai na chave em "Mensal" vê uma tela que finge que a oferta não existe.
 */
export function fundadorNoAnual(): string {
  return `As ${FUNDADOR.vagas} vagas de fundador existem no anual, por R$ ${reais(FUNDADOR.mensal)} por mês travados para sempre.`;
}

export type PlanoPublico = {
  id: PlanoId;
  nome: string;
  descricao: string;
  /** Em reais, inteiro. */
  mensal: number;
  /** O anual é sempre 10 mensalidades: dois meses de desconto. */
  anual: number;
  gravacoesPorMes: number;
  marcas: number;
  /**
   * Quantas GERACOES de video por IA este plano pode pedir por dia.
   *
   * Nao e capricho de tabela: o fornecedor de video limita a plataforma
   * INTEIRA por dia (10 no Tier 1, 50 no Tier 2, medido no console em 21/09),
   * e um clipe de 8 s e uma geracao enquanto um video de 60 s sao nove. Sem um
   * teto por cliente, UM cliente pedindo 60 s consome o dia de todos, o que
   * foi exatamente o que aconteceu em 21/09.
   *
   * Os numeros dizem, na pratica, a duracao maxima que cada plano produz por
   * dia: 2 geracoes sao 15 s, 4 sao 30 s e 9 sao 60 s. E assim que o teto
   * vira argumento de plano em vez de parede sem explicacao.
   */
  videosPorDia: number;
  /**
   * Quanto o cliente pode guardar, em gigabytes.
   *
   * MEDIDO em 22/09 antes de escrever o numero: o Blob inteiro tinha 10,75 GB
   * em 19 arquivos, e praticamente tudo e gravacao bruta, entre 0,8 e 1,8 GB
   * por projeto. Uma gravacao pesa perto de 900 MB, entao o teto e o que o
   * proprio plano promete por mes multiplicado por seis meses de historico,
   * arredondado para cima. O card 470 pedia medir antes justamente para o teto
   * nao sufocar cliente pagante nem deixar de proteger a conta.
   */
  armazenamentoGb: number;
  /**
   * A gravação mais longa que o plano aceita, em minutos (decisão de 29/09).
   *
   * Até aqui era 2 h para todo mundo, e o Enterprise vende podcast e evento
   * longo, que passam disso. 1 h, 2 h e 5 h separam os planos pelo tipo de
   * conteúdo, e não só pelo volume: quem grava aula de 40 minutos cabe no
   * Starter, quem grava podcast de três horas precisa do Enterprise.
   */
  duracaoMaximaMin: number;
  /**
   * O maior ARQUIVO aceito, em gigabytes.
   *
   * Sai da duração: a 4 Mbps (a taxa recomendada) uma hora dá 1,8 GB, e o teto
   * dá o dobro de folga para quem grava a 8 Mbps. O teto de 1,9 GB da Deepgram
   * deixou de mandar aqui em 29/09: acima dele o worker extrai só o áudio antes
   * de transcrever.
   */
  arquivoMaximoGb: number;
  /**
   * O SALDO MENSAL DE PRODUÇÃO, em créditos (06/10). Morava só em
   * `lib/stripe/index.ts` (`credits`), que a tela não pode importar; por isso
   * a vitrine falava em "o dobro de saldo" sem número. Agora mora aqui e o
   * Stripe deriva dele: um lugar só. O cliente NÃO vê este número no cartão;
   * ele vira minutos, vídeos e peças em `lib/entregas-do-plano.ts`.
   */
  creditosPorMes: number;
  /** A carteira separada do vídeo por IA, em créditos de vídeo (era `videoCredits`). */
  creditosDeVideoPorMes: number;
  /**
   * Quantos perfis de referência cada projeto estuda (decisão do Bruno, 06/10).
   * Vem de REFERENCIAS_POR_PROJETO, logo abaixo; a regra completa (teste,
   * admin, membro e o teto da conta) está em referenciasDoPlano.
   */
  referenciasPorProjeto: number;
  destaque: boolean;
  /**
   * Só o que NÃO é número (06/10). Acessos, marcas, minutos, vídeos, peças,
   * vídeo por IA, armazenamento e duração da gravação saem de
   * `lib/entregas-do-plano.ts`, calculados dos limites e do consumo reais.
   * Escritos à mão aqui, eles já tinham divergido do código ("cerca de 44
   * peças" contra 28 na semana sugerida; "1 marca" contra 2 aplicadas).
   */
  features: string[];
  /**
   * Os ENTREGÁVEIS DE VALOR (02/10, pedido do Bruno): o que vem com o plano e
   * não é a plataforma, mostrado num bloco de destaque acima da lista para não
   * se perder entre as linhas de volume. Ficam fora de `features` de propósito:
   * a calculadora lê `features` atrás de "cerca de N peças" (pecasDoPlano).
   */
  extras?: ExtraDoPlano[];
};

export type ExtraDoPlano = {
  /** "Demanda Day" ou "Demanda Cast", escritos assim, como o Bruno nomeou. */
  marca: string;
  /** A quantidade, que é o que muda de um plano para o outro. */
  titulo: string;
  texto: string;
};

/**
 * O Demanda Day: imersão presencial. O texto é um só; o número de ingressos é
 * o que muda (1 no Pro, 3 no Enterprise).
 */
function demandaDay(ingressos: number): ExtraDoPlano {
  return {
    marca: "Demanda Day",
    titulo: ingressos === 1 ? "1 ingresso para o Demanda Day" : `${ingressos} ingressos para o Demanda Day`,
    texto:
      "Imersão presencial com alguns dos maiores nomes do mercado empresarial: um dia de conteúdo de valor, acesso e networking de alto nível.",
  };
}

/**
 * O Demanda Cast, do Pro para cima. O Bruno escreveu "90 dias de posts"; o
 * texto não promete prazo porque a conta da plataforma não fecha: uma gravação
 * rende cerca de 11 peças (4 gravações, cerca de 44 no Starter), perto de uma
 * semana de publicação, e não três meses.
 */
const DEMANDA_CAST: ExtraDoPlano = {
  marca: "Demanda Cast",
  titulo: "1 hora de gravação no Demanda Cast",
  texto:
    "O estúdio de conteúdo da Demandou. Você sai com o primeiro conteúdo gravado com qualidade de estúdio, pronto para a plataforma cortar em vídeos e posts para as suas redes.",
};

/** A frase do Starter que aponta para os extras, sem fingir que ele os tem. */
export const EXTRAS_A_PARTIR_DO_PRO = "Demanda Day e Demanda Cast vêm a partir do Pro.";

/**
 * REFERÊNCIAS POR PROJETO, POR PLANO (06/10/2026, decisão do Bruno): 3 no
 * Starter, 6 no Pro, 10 no Enterprise. Até aqui era 3 fixo para todo mundo
 * (MAX_REFERENCIAS_POR_PROJETO), e projeto de antes do teto aparecia como
 * "5 de 3". Este é o ÚNICO lugar do número: a tabela de planos, o servidor
 * (lib/limites-do-plano.ts) e as telas leem daqui.
 */
export const REFERENCIAS_POR_PROJETO: Record<PlanoId, number> = {
  pro: 3, // Starter
  business: 6, // Pro
  studio: 10, // Enterprise
};

/** A linha do cartão do plano, a mesma nas três telas que mostram planos. */
export function linhaDasReferencias(n: number): string {
  return `${n} perfis de referência estudados por projeto`;
}

/** O limite de referências que vale para uma conta, já resolvido. */
export type LimiteDeReferencias = {
  /** Perfis confirmados por projeto. */
  porProjeto: number;
  /** Perfis confirmados somando os projetos da conta (o que a tela mostra). */
  porConta: number;
  /** Conta interna: o servidor não barra pela conta; a tela mostra o do Enterprise. */
  semTetoNaConta: boolean;
  /** O nome do plano que deu o número ("Starter", "Pro", "Enterprise"). */
  plano: string;
};

/**
 * O LIMITE DE REFERÊNCIAS DE UMA CONTA (06/10), sem banco: o servidor resolve
 * quem é a conta (membro usa o plano do dono, ver lib/equipe/conta.ts) e chama
 * aqui com o plano, o papel e o teste.
 *
 * - Starter ("pro") 3, Pro ("business") 6, Enterprise ("studio") 10;
 * - em teste grátis vale o Starter, qualquer que seja o plano escolhido: o
 *   teste é para provar o produto, e cada referência a mais é leitura paga;
 * - sem plano ("free") ou plano desconhecido também cai no Starter (o portão
 *   de entrada já manda essa pessoa para /planos; aqui só não pode quebrar);
 * - admin (acesso interno) fica com o número do Enterprise por projeto e sem
 *   teto na conta, como nos outros limites do plano.
 *
 * O TETO DA CONTA é o do projeto vezes as marcas que a conta pode ter
 * (marcasDaConta, que já soma os acessos inclusos e os extras): cada projeto
 * permitido pode encher a sua cota, e nada além disso. Starter 3 x 2 = 6,
 * Pro 6 x 5 = 30, Enterprise 10 x 10 = 100. Substitui o 15 fixo de 03/10.
 */
export function referenciasDoPlano(args: {
  plan: string | null | undefined;
  admin?: boolean;
  emTeste?: boolean;
  acessosExtras?: number;
}): LimiteDeReferencias {
  if (args.admin) {
    const topo = planoPublico("studio");
    return { porProjeto: topo.referenciasPorProjeto, porConta: topo.referenciasPorProjeto * marcasDaConta(topo.marcas, topo.id, 0), semTetoNaConta: true, plano: topo.nome };
  }
  const conhecido = PLANOS_PUBLICOS.find((p) => p.id === args.plan);
  const vale = !conhecido || args.emTeste ? planoPublico("pro") : conhecido;
  // No teste não há acesso extra cobrado; fora dele, cada extra é mais uma marca.
  const extras = conhecido && !args.emTeste ? Math.max(0, args.acessosExtras ?? 0) : 0;
  return {
    porProjeto: vale.referenciasPorProjeto,
    porConta: vale.referenciasPorProjeto * marcasDaConta(vale.marcas, vale.id, extras),
    semTetoNaConta: false,
    plano: vale.nome,
  };
}

/**
 * A TABELA DE 27/09/2026, feita com o Matheus Gaberlini, que entrou como sócio.
 *
 * Público: empresas que faturam acima de R$ 100 mil por mês. Só contrato
 * ANUAL, pago à vista uma vez por ano: conteúdo só dá resultado com tempo, e
 * quem pagava mês a mês desistia no terceiro mês, antes de ver o resultado.
 * Não há teste grátis; a entrada é uma demonstração agendada com os sócios.
 *
 * Os ids internos continuam "pro", "business" e "studio" (são o valor gravado
 * em User.plan e o nome das variáveis dos preços no Stripe). O que o cliente
 * vê é Starter, Pro e Enterprise. Cuidado com a coincidência: o id "pro" é o
 * STARTER, e o plano chamado Pro tem o id "business".
 *
 * `mensal` é o número da vitrine; `anual` é o que se cobra, doze vezes ele,
 * sem desconto, porque não existe mais a alternativa mensal para comparar.
 *
 * O que ainda está em implantação vem escrito assim na própria linha: o
 * cliente paga um ano adiantado, e prometer sem dizer que falta seria vender o
 * que não existe.
 */
export const PLANOS_PUBLICOS: PlanoPublico[] = [
  {
    id: "pro",
    nome: "Starter",
    descricao: "A autoridade da sua empresa publicada toda semana, em todas as redes",
    mensal: 2997,
    anual: 35964,
    gravacoesPorMes: 4,
    marcas: 1,
    videosPorDia: 4,
    armazenamentoGb: 48,
    duracaoMaximaMin: 60,
    arquivoMaximoGb: 4,
    // Saldo e carteira de vídeo do Starter (vieram de lib/stripe/index.ts em
    // 06/10, sem mudar valor). O porquê de cada número continua comentado lá.
    creditosPorMes: 20000,
    creditosDeVideoPorMes: 4160,
    referenciasPorProjeto: REFERENCIAS_POR_PROJETO.pro,
    destaque: false,
    features: [
      linhaDasReferencias(REFERENCIAS_POR_PROJETO.pro),
      // 06/10: as linhas de número (acessos, marca, gravações e peças, vídeos
      // por IA, duração) saíram daqui e são calculadas em
      // lib/entregas-do-plano.ts. O histórico das decisões está no git.
      "Três jeitos de começar: o seu vídeo, o seu gêmeo digital ou tudo com IA",
      "Vídeo completo editado e cortes verticais legendados, em 6 estilos de edição",
      "Vídeo por IA com narração em português",
      "Pesquisa com fontes, revisão e publicação agendada",
      "LinkedIn, Instagram, Facebook, X, YouTube e TikTok",
      "Reunião de implantação para ensinar a voz da empresa",
    ],
  },
  {
    id: "business",
    nome: "Pro",
    descricao: "Duas vozes da empresa e o dobro de presença nas redes",
    mensal: 3997,
    anual: 47964,
    gravacoesPorMes: 8,
    marcas: 2,
    videosPorDia: 6,
    armazenamentoGb: 96,
    duracaoMaximaMin: 120,
    arquivoMaximoGb: 8,
    creditosPorMes: 40000,
    creditosDeVideoPorMes: 8320,
    referenciasPorProjeto: REFERENCIAS_POR_PROJETO.business,
    destaque: true,
    features: [
      linhaDasReferencias(REFERENCIAS_POR_PROJETO.business),
      // 06/10: números em lib/entregas-do-plano.ts (ver o Starter).
      "Tudo do Starter",
      "Acessos para vendedores, consultores ou corretores",
      "Relatório mensal do que rendeu",
    ],
    extras: [demandaDay(1), DEMANDA_CAST],
  },
  {
    id: "studio",
    nome: "Enterprise",
    descricao: "A empresa e o time comercial inteiro com autoridade nas redes",
    mensal: 5667,
    anual: 68004,
    gravacoesPorMes: 16,
    marcas: 5,
    videosPorDia: 9,
    armazenamentoGb: 192,
    duracaoMaximaMin: 300,
    arquivoMaximoGb: 20,
    creditosPorMes: 60000,
    creditosDeVideoPorMes: 20800,
    referenciasPorProjeto: REFERENCIAS_POR_PROJETO.studio,
    destaque: false,
    features: [
      linhaDasReferencias(REFERENCIAS_POR_PROJETO.studio),
      // 06/10: números em lib/entregas-do-plano.ts (ver o Starter).
      "Tudo do Pro",
      "Acessos e marcas para o time comercial inteiro",
      "Gravações longas, para podcast e evento",
      "Reunião mensal de estratégia e gerente dedicado",
    ],
    extras: [demandaDay(3), DEMANDA_CAST],
  },
];

/** O faturamento mínimo do cliente, que a demonstração confere antes de agendar. */
export const FATURAMENTO_MINIMO_MENSAL = 100_000;

export function planoPublico(id: PlanoId): PlanoPublico {
  return PLANOS_PUBLICOS.find((p) => p.id === id)!;
}

/** "397" e "1.997": inteiro com separador de milhar, sem centavos. */
export function reais(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/**
 * O mensal equivalente do anual, arredondado: R$ 3.970 em 12 vezes dá "331".
 * O card mostra esse número em destaque e o total do ano em letra pequena:
 * número grande de quatro dígitos assusta, e o que vende o anual é a economia.
 */
export function mensalDoAnual(plano: PlanoPublico): number {
  // Desde 27/09 o anual é doze vezes o mensal, sem desconto.
  return Math.round(plano.anual / 12);
}

/**
 * Os itens que o cartao mostra, com "Tudo do Essencial" ja resolvido.
 *
 * Existe porque, enquanto ha vaga de fundador, o Essencial sai das duas telas
 * (o cupom leva o Autoridade ao preco de lista dele, e dois cartoes com o mesmo
 * numero fazem a pagina argumentar contra o proprio plano de entrada). Com o
 * Essencial fora, "Tudo do Essencial" vira referencia a um cartao que ninguem
 * ve, e o plano MAIS caro aparece com a lista MAIS curta, que e o contrario do
 * que a lista existe para mostrar.
 *
 * Mora aqui, e nao em cada tela, pela regra da casa: a landing e /planos ja
 * dividem a mesma tabela justamente porque, quando cada uma tinha a sua copia,
 * as duas divergiram.
 */
export function itensDoPlano(plano: PlanoPublico, essencialVisivel: boolean): string[] {
  if (essencialVisivel || plano.id !== FUNDADOR.plano) return plano.features;
  const essencial = PLANOS_PUBLICOS.find((p) => p.id === "pro");
  if (!essencial) return plano.features;

  const saida: string[] = [];
  for (const item of plano.features) {
    if (item !== "Tudo do Essencial") {
      saida.push(item);
      continue;
    }
    for (const herdado of essencial.features) {
      // VOLUME NAO SE HERDA. Cada plano declara o proprio, e herdar produzia
      // um cartao dizendo "4 gravacoes por mes viram cerca de 44 pecas" e,
      // duas linhas abaixo, "2 gravacoes por mes viram cerca de 22 pecas".
      // Duas promessas diferentes sobre a mesma coisa no mesmo cartao valem
      // menos que nenhuma: quem le escolhe a menor e desconfia do resto.
      if (/gravaç(ão|ões) por mês/i.test(herdado)) continue;
      if (!saida.includes(herdado) && !plano.features.includes(herdado)) saida.push(herdado);
    }
  }
  return saida;
}
