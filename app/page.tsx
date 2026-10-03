import type { Metadata } from "next";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { FaixaDeProva } from "@/components/landing/faixa-de-prova";
import { OQueOferecemos } from "@/components/landing/o-que-oferecemos";
import { Equipe } from "@/components/landing/equipe";
import { SolucaoPronta } from "@/components/landing/solucao-pronta";
import { Referencias } from "@/components/landing/referencias";
import { DemandaDay } from "@/components/landing/demanda-day";
import { VideoPitch } from "@/components/landing/video-pitch";
import { Dor } from "@/components/landing/dor";
import { TresCasos } from "@/components/landing/tres-casos";
import { Calculadora } from "@/components/landing/calculadora";
import { OQueElesFazem } from "@/components/landing/o-que-eles-fazem";
import { Why } from "@/components/landing/why";
import { Features } from "@/components/landing/features";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Exemplos } from "@/components/landing/exemplos";
import { Entrega } from "@/components/landing/entrega";
import { Formatos } from "@/components/landing/formatos";
import { Valor } from "@/components/landing/valor";
import { Pricing } from "@/components/landing/pricing";
import { vagasDeFundador } from "@/lib/stripe";
import { Footer } from "@/components/landing/footer";
import { Rastro } from "@/components/landing/rastro";
import { CapturaModal } from "@/components/landing/captura";

export const metadata: Metadata = {
  // Sem o "postou" desde 01/10; fala com o dono da empresa (ver app/layout.tsx).
  title: "demandou. O marketing da sua empresa trabalhando 24 horas por dia, sem tomar a agenda do dono.",
  description:
    "O marketing da sua empresa trabalhando todo dia: alguns minutos de vídeo viram uma semana de conteúdo no LinkedIn, no Instagram e nas outras redes, com a voz da empresa e a sua aprovação. Custa menos que um analista e tem a constância de uma agência.",
};

// A landing é regenerada a cada minuto, não a cada visita: a contagem de
// vagas de fundador vem do Stripe, e uma chamada por visita seria pagar API
// para mostrar o mesmo número. Um minuto de atraso depois da décima venda é
// aceitável; o checkout confere de novo e nunca aplica desconto sem vaga.
export const revalidate = 60;

export default async function HomePage() {
  const vagas = await vagasDeFundador();
  return (
    // data-theme="dark" trava a landing no escuro, seja qual for o tema salvo
    // na plataforma. As variáveis CSS herdam do ancestral mais próximo, então
    // este atributo vence o do <html> para tudo aqui dentro. Sem isso, quem
    // escolhia o claro no app via a landing misturar texto claro de variável
    // com fundo escuro fixo, ilegível. Tema é preferência de quem usa a
    // plataforma; a landing é a vitrine, e vitrine tem uma cara só.
    <main data-theme="dark" className="bg-[var(--bg-primary)] min-h-screen">
      {/* Sem nada na tela: guarda a origem da primeira visita e conta que
          alguem chegou. Ver components/landing/rastro.tsx. */}
      <Rastro />
      {/* A janela de captura mora aqui, montada uma vez, e qualquer CTA da
          página a abre pela loja em lib/captura/store. Fica no topo do main e
          não dentro de uma seção para o fundo escuro cobrir a página inteira. */}
      <CapturaModal />
      <Navbar />
      <Hero />
      {/* As referências de mercado com logo, logo abaixo da hero (02/10,
          noite, decisão do Bruno). Ver components/landing/referencias.tsx. */}
      <Referencias />
      {/* A faixa de prova (02/10): as frases de número do Bruno, com a conta
          do Starter lida do código. Ver components/landing/faixa-de-prova.tsx. */}
      <FaixaDeProva />
      {/* Rodada do Matheus (02/10, noite): a faixa do que oferecemos, a equipe
          com rosto, as referências de mercado e o Demanda Day. */}
      <OQueOferecemos />
      {/* A HISTÓRIA EM QUATRO PASSOS, logo depois da hero (01/10, pedido do
          Bruno): o vídeo de pitch conta tudo em 85 segundos; a dor e a conta
          ficam paradas para quem lê; os três jeitos de começar respondem
          "como"; e a calculadora fecha com o número da própria empresa, atrás
          do formulário que alimenta o time de vendas. O resto da página
          continua como prova para quem quer ver mais antes de decidir. */}
      <VideoPitch />
      <Dor />
      <TresCasos />
      <Equipe />
      <SolucaoPronta />
      <Calculadora />
      {/* O clipe da plataforma em largura quase total, com os balões legendando
          o que cada agente faz. Entrou em 19/09 no lugar da DEMONSTRAÇÃO
          GRATUITA, que ficava aqui e foi removida a pedido do Bruno por duas
          razões que se somam: ela gerava custo de API por visitante anônimo, e
          mostrava um post solto para três redes, que não é nem de perto o que
          a plataforma entrega. Prova errada custa caro duas vezes. */}
      <OQueElesFazem />
      <Why />
      <Features />
      <HowItWorks />
      {/* A prova vem DEPOIS de explicar o fluxo e ANTES do preço: quem chegou
          até aqui já entendeu o que a plataforma faz, e o que decide a compra é
          ver o resultado. Preço antes da prova é pedir decisão sem argumento. */}
      <Exemplos />
      {/* A prova de formato vem logo depois dos exemplos, e antes da entrega:
          quem acabou de ver as peças é quem tem a pergunta "isso cabe no meu
          feed?" na cabeça. Seção nova em 19/09, junto do conserto de formato. */}
      <Formatos />
      <Entrega />
      {/* A conta de horas e de reais vem entre a prova e o preço: o plano de
          R$ 2.997 por mês (tabela de 27/09) só se lê direito para quem acabou de
          ver que está comprando um time de conteúdo inteiro. */}
      <Valor />
      <DemandaDay />
      <Pricing vagasDeFundador={vagas} />
      <Footer />
    </main>
  );
}
