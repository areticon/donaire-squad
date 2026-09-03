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

/** Fundador: os 10 primeiros no Autoridade travam R$ 397 por mês para sempre. */
export const FUNDADOR = { plano: "business" as PlanoId, mensal: 397, vagas: 10 };

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
  destaque: boolean;
  features: string[];
};

export const PLANOS_PUBLICOS: PlanoPublico[] = [
  {
    id: "pro",
    nome: "Essencial",
    descricao: "Uma gravação a cada quinze dias vira a quinzena inteira nas suas redes",
    mensal: 397,
    anual: 3970,
    gravacoesPorMes: 2,
    marcas: 1,
    destaque: false,
    features: [
      `${TRIAL_DAYS} dias grátis para testar`,
      "2 gravações por mês viram cerca de 22 peças",
      "Cortes verticais com legenda e capa",
      "Vídeo completo editado, com capa do seu rosto",
      "Textos, imagens e carrosséis para 5 redes",
      "Pesquisa com fontes antes de cada texto",
      "Publicação agendada nas suas redes",
      "1 marca",
    ],
  },
  {
    id: "business",
    nome: "Autoridade",
    descricao: "Uma gravação por semana vira o mês inteiro nas suas redes",
    mensal: 697,
    anual: 6970,
    gravacoesPorMes: 4,
    marcas: 1,
    destaque: true,
    features: [
      `${TRIAL_DAYS} dias grátis para testar`,
      "4 gravações por mês viram cerca de 44 peças",
      "Tudo do Essencial",
      "De 26 a 36 horas de edição e escrita por mês, feitas",
      "Relatório mensal do que rendeu",
      "Suporte prioritário",
      "1 marca",
    ],
  },
  {
    id: "studio",
    nome: "Estúdio",
    descricao: "Para social media e agência: cinco marcas na mesma esteira",
    mensal: 1997,
    anual: 19970,
    gravacoesPorMes: 16,
    marcas: 5,
    destaque: false,
    features: [
      "16 gravações por mês, divididas entre as marcas",
      "Tudo do Autoridade",
      "5 marcas, cada uma com sua voz e sua paleta",
      "Onboarding dedicado",
      "Suporte prioritário",
    ],
  },
];

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
  return Math.round(plano.anual / 12);
}
