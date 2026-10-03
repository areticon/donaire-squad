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
  destaque: boolean;
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
    destaque: false,
    features: [
      // Os acessos (01/10, noite, pedido do Bruno: "colocar a quantidade de contas
      // para cada plano"). O número vem de ACESSOS_INCLUSOS em lib/equipe/regras.ts,
      // que é o que o servidor aplica; mudou lá, muda aqui.
      "2 acessos, contando o seu: você e mais uma pessoa do time",
      "1 marca ou porta-voz",
      "4 gravações ou campanhas por mês, cerca de 44 peças",
      // A PROMESSA EM VÍDEOS é contada na qualidade CHEIA (28/09). O saldo é em
      // créditos de vídeo (4.160 aqui = 2 x 2.080). Reduzido pela metade no mesmo
      // dia, decisão do Bruno: vídeo por IA custa caro e o resultado ainda não
      // compensa; o incentivo passa a ser o cliente subir o próprio vídeo.
      // Antes: 8.320 (4 x 2.080). Regra do Bruno: "um cliente starter
      // no pior caso tem que conseguir gerar pelo menos 4 videos na qualidade alta".
      // Quem escolhe o Rápido rende 2,7 vezes mais vídeos com o mesmo saldo:
      // prometer "4 vídeos" sem dizer a qualidade é promessa que o saldo não cumpre.
      // O custo por crédito é o mesmo nas duas, então a margem não muda.
      // 01/10, noite: saiu "e vídeos seus sem limite". Cada gravação gasta
      // créditos do saldo (3.174 numa de 22 min com 3 cortes), então havia limite.
      "Três jeitos de começar: o seu vídeo, o seu gêmeo digital ou tudo com IA",
      "Vídeo completo editado e cortes verticais legendados, em 6 estilos de edição",
      "2 vídeos por IA de 30 s por mês na qualidade Cheia (5 na Rápida), com narração em português",
      "Gravações de até 1 hora",
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
    destaque: true,
    features: [
      "5 acessos, contando o seu, para vendedores, consultores ou corretores",
      "2 marcas ou porta-vozes",
      "8 gravações ou campanhas por mês, cerca de 90 peças",
      "4 vídeos por IA de 30 s por mês na qualidade Cheia (10 na Rápida)",
      // 01/10, noite: saiu "4 vídeos com edição de estúdio (em implantação)".
      // Não existia como recurso; os estilos de edição valem para todos os planos.
      "O dobro de saldo do Starter para gravações longas e o gêmeo digital",
      "Gravações de até 2 horas",
      "Tudo do Starter",
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
    destaque: false,
    features: [
      "10 acessos, contando o seu, para o time comercial inteiro",
      "5 marcas ou porta-vozes, como o time de vendas",
      "16 gravações ou campanhas por mês, cerca de 180 peças",
      "10 vídeos por IA de 30 s por mês na qualidade Cheia (26 na Rápida)",
      "O triplo de saldo do Starter, para o time inteiro gravar ou usar o gêmeo",
      "Gravações de até 5 horas, para podcast e evento",
      "Tudo do Pro",
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
