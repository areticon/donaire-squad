import type { Metadata } from "next";
import Link from "next/link";
import { BrandMarkImg } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Termos de Uso da demandou",
  description:
    "Termos de Uso e Condições de Serviço da plataforma demandou. Leia antes de usar a plataforma.",
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg-primary)]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandMarkImg variant="dark" size={28} />
            <span className="font-semibold text-[var(--text-primary)]">demandou</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-[var(--text-muted)] transition-colors hover:text-orange-500"
          >
            ← Voltar ao início
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="mb-10">
          <p className="mb-2 text-sm font-medium uppercase tracking-widest text-orange-500">
            Legal
          </p>
          <h1 className="mb-3 text-3xl font-bold text-[var(--text-primary)]">
            Termos de Uso e Condições de Serviço
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Última atualização: 04/10/2026
          </p>
        </div>

        {/* Cor do texto pelo token do tema (01/10): o cinza fixo #d1d5db era
            do tema escuro e sumia no fundo claro que virou o padrão.
            02/10/2026: estes Termos, a Política de Privacidade e a minuta das
            Condições Gerais de Contratação (Documents\Demandou\contratos)
            foram alinhados para dizer a mesma coisa; a tabela de coerência
            está em contratos\coerencia.md. Mudou um, confere os outros dois. */}
        <div className="space-y-10 text-[var(--text-muted)] leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              1. Partes
            </h2>
            <p className="mb-3 text-sm">
              Este instrumento regula a relação contratual entre:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Prestadora de Serviços</p>
                <p>
                  <strong>DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</strong>, inscrita no CNPJ sob nº 66.140.770/0001-48, com sede na Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150, doravante denominada{" "}
                  <strong className="text-orange-500">&quot;demandou&quot;</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Usuário</p>
                <p>
                  Pessoa física maior de 18 anos ou pessoa jurídica devidamente representada, que acessa ou utiliza a plataforma demandou, doravante denominada{" "}
                  <strong className="text-[var(--text-primary)]">&quot;Usuário&quot;</strong>.
                </p>
              </div>
            </div>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              2. Aceitação dos Termos
            </h2>
            <p className="mb-3 text-sm">
              Ao criar uma conta, acessar ou utilizar qualquer funcionalidade da plataforma demandou, o Usuário declara ter lido, compreendido e concordado integralmente com estes Termos de Uso e com a nossa{" "}
              <Link href="/privacy" className="text-orange-500 hover:underline">
                Política de Privacidade
              </Link>
              .
            </p>
            <p className="mb-3 text-sm">
              Caso não concorde com qualquer disposição destes Termos, não utilize a plataforma. A demandou se reserva o direito de recusar o acesso a qualquer Usuário que não cumpra estes Termos.
            </p>
            <p className="text-sm">
              Quando houver Condições Gerais de Contratação ou proposta comercial aceitas na contratação, elas prevalecem sobre estes Termos naquilo que regularem de forma específica. Nenhum desses documentos reduz direitos que a lei garante ao Usuário.
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              3. Descrição do Serviço
            </h2>
            <p className="mb-3 text-sm">
              A demandou é uma plataforma SaaS (Software as a Service) voltada para a{" "}
              <strong className="text-[var(--text-primary)]">criação e publicação automatizada de conteúdo para redes sociais com auxílio de inteligência artificial</strong>.
            </p>
            <p className="mb-3 text-sm">Os serviços incluem, sem limitação:</p>
            <ul className="space-y-2 text-sm list-none">
              {[
                "Criação de conteúdo textual e visual por meio de agentes de IA configuráveis",
                "Transformação de vídeos enviados pelo Usuário em conteúdo para redes sociais, incluindo transcrição de áudio, seleção de trechos e redação de posts",
                "Agendamento e publicação automática de posts em redes sociais conectadas",
                "Gestão de projetos e múltiplos perfis de redes sociais",
                "Dashboard analítico de desempenho",
                "Calendário editorial integrado",
                "Gêmeo digital: vídeos com o rosto e a voz da própria pessoa titular, gerados a partir de fotos, de uma amostra de voz e de uma autorização gravada por ela (seção 9)",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-orange-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              A contratação é uma <strong className="text-[var(--text-primary)]">licença de uso de software</strong>, e não um serviço de agência: a demandou não gere as redes do Usuário, não responde comentários, não gere anúncios e não decide o que publicar. O resultado comercial depende do Usuário, e a demandou{" "}
              <strong className="text-[var(--text-primary)]">não promete</strong> vendas, clientes, seguidores, alcance, engajamento ou qualquer outro resultado.
            </p>
            <p className="mt-3 text-sm">
              A demandou pode melhorar, alterar ou substituir funcionalidades e fornecedores, desde que não reduza de forma relevante o que o plano contratado entrega. Se reduzir, o Usuário pode encerrar o contrato sem multa (item 5.8).
            </p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              4. Cadastro e Conta
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Para utilizar a plataforma, o Usuário deve criar uma conta fornecendo informações verdadeiras, precisas, atuais e completas. A manutenção dessas informações atualizadas é responsabilidade exclusiva do Usuário.
              </p>
              <p>
                O Usuário é integralmente responsável por manter a confidencialidade de suas credenciais de acesso (e-mail e senha) e por todas as atividades realizadas sob sua conta. Em caso de acesso não autorizado ou suspeita de comprometimento da conta, o Usuário deve notificar imediatamente a demandou pelo e-mail{" "}
                <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                  contato@demandou.com
                </a>
                .
              </p>
              <p>
                É vedada a criação de contas em nome de terceiros sem autorização expressa, o compartilhamento de credenciais entre múltiplos usuários e a criação de contas com fins fraudulentos ou abusivos.
              </p>
              <p>
                A demandou se reserva o direito de suspender ou encerrar contas que violem estes Termos ou que apresentem comportamento suspeito, conforme o item 7.3, sem necessidade de aviso prévio nos casos graves.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">Acessos de equipe.</strong> Quem administra a conta pode convidar membros até o número de acessos do plano mais os acessos extras contratados, e definir em quais projetos cada um trabalha e quanto do saldo pode usar. Todos os acessos usam o mesmo saldo da conta. Quem administra a conta{" "}
                <strong className="text-[var(--text-primary)]">responde pelos atos dos membros que convidou</strong>, inclusive pelo conteúdo que eles aprovarem e publicarem, e deve remover o acesso de quem deixar a empresa. Cada acesso é pessoal.
              </p>
            </div>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              5. Planos e Pagamentos
            </h2>
            <div className="space-y-4 text-sm">
              {/* Seção 5 reescrita em 02/10/2026 para bater com a minuta das
                  Condições Gerais de Contratação (cláusulas 4, 5, 6, 7, 8, 9 e
                  18). A regra de reembolso do painel (lib/admin/crm.ts) ainda
                  conhece só arrependimento e garantia; a janela da renovação
                  (5.3) e o reembolso parcial (5.7) são feitos à mão até lá. */}
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.1 Planos, preço e reajuste</h3>
                <p>
                  A demandou oferece planos para empresas, todos em{" "}
                  <strong className="text-[var(--text-primary)]">contrato anual</strong>, com diferentes níveis de recursos. Os valores vigentes são os exibidos na página de planos ou combinados na proposta comercial no momento da contratação, e não mudam durante os 12 meses contratados. Na renovação, o valor é reajustado pela variação acumulada do IPCA (Índice Nacional de Preços ao Consumidor Amplo, do IBGE) nos 12 meses anteriores; se o índice for negativo, o valor fica igual. Aumento acima do IPCA só vale para a renovação seguinte, com aviso de pelo menos 60 (sessenta) dias, e o Usuário pode recusar a renovação sem custo.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.2 Contratação e pagamento</h3>
                <p className="mb-2">
                  A contratação começa por uma demonstração com a equipe da demandou, na qual o plano é definido. Não há período de teste gratuito. O contrato funciona assim:
                </p>
                <ul className="mb-2 space-y-2 list-none">
                  {[
                    "O contrato tem duração de 12 (doze) meses, contados da confirmação do pagamento.",
                    "O valor dos 12 meses é pago à vista, de uma só vez, no ato da contratação, por cartão de crédito processado pelo Stripe, ou por outro meio indicado na proposta comercial. Se o Usuário parcelar a compra com o emissor do cartão, esse parcelamento é entre ele e o banco; para a demandou, o pagamento é à vista.",
                    "Os créditos, as gravações e as cotas de vídeo do plano são repostos a cada ciclo mensal ao longo dos 12 meses, e não acumulam de um mês para o outro.",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p>
                  Assinaturas contratadas antes de 27/09/2026, inclusive as que tiveram período de teste ou cobrança mensal, seguem as condições vigentes na data em que foram contratadas até a renovação seguinte.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.3 Renovação automática</h3>
                <p>
                  Ao fim dos 12 meses, o contrato é renovado automaticamente por mais 12 meses, com nova cobrança anual à vista no mesmo meio de pagamento, salvo se o Usuário pedir a não renovação antes do fim do período vigente. A demandou avisa por e-mail com antecedência mínima de 30 (trinta) dias, informando a data, o valor e como cancelar. Mesmo depois da cobrança da renovação, o Usuário pode desistir dela em até{" "}
                  <strong className="text-[var(--text-primary)]">7 (sete) dias corridos</strong>, com reembolso integral, desde que não tenha usado gravações ou créditos do novo período.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.4 Não renovação</h3>
                <p>
                  O Usuário pode pedir para não renovar{" "}
                  <strong className="text-[var(--text-primary)]">a qualquer momento</strong>, pelo portal de gerenciamento de assinatura (na página de plano e billing) ou pelo e-mail{" "}
                  <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                    contato@demandou.com
                  </a>
                  , sem multa e sem custo. O Usuário mantém o acesso e a reposição mensal até o fim dos 12 meses já pagos, e a renovação seguinte não acontece.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.5 Direito de arrependimento (7 dias)</h3>
                <p className="mb-2">
                  Como a contratação é feita pela internet, o Usuário pode desistir em até{" "}
                  <strong className="text-[var(--text-primary)]">7 (sete) dias corridos a contar da confirmação do pagamento</strong> de cada nova contratação, com{" "}
                  <strong className="text-[var(--text-primary)]">reembolso integral</strong>, sem precisar dar motivo. A demandou aplica esse direito, previsto no art. 49 do Código de Defesa do Consumidor, a todos os Usuários, inclusive empresas. Basta pedir pelo portal de assinatura ou pelo e-mail{" "}
                  <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                    contato@demandou.com
                  </a>
                  ; a demandou solicita o estorno ao Stripe em até 5 (cinco) dias úteis, e o prazo para o valor aparecer na fatura depende do emissor do cartão. O mesmo vale para pacotes de crédito de vídeo comprados à parte e ainda não usados.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.6 Garantia de 30 dias</h3>
                <p className="mb-2">
                  Além do arrependimento, a demandou oferece uma garantia própria: se, nos{" "}
                  <strong className="text-[var(--text-primary)]">30 (trinta) dias corridos a contar da confirmação do primeiro pagamento</strong>, o Usuário não tiver publicado nenhuma peça que ele mesmo aprovou, poderá cancelar com{" "}
                  <strong className="text-[var(--text-primary)]">reembolso integral</strong> do valor pago naquela contratação, pelo mesmo caminho e no mesmo prazo do item 5.5.
                </p>
                <p>
                  Conta como publicação tanto a publicação pela plataforma de uma peça aprovada quanto o uso público, por outro meio, de conteúdo gerado pela plataforma. A garantia vale uma vez por Usuário (mesmo CNPJ ou CPF e empresas do mesmo grupo), na primeira contratação, e não se aplica a renovações. Ela se soma à garantia legal do Código de Defesa do Consumidor, sem substituí-la.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.7 Encerramento antecipado, com reembolso proporcional</h3>
                <p className="mb-2">
                  Depois dos prazos dos itens 5.5 e 5.6, se o Usuário preferir encerrar o contrato antes do fim dos 12 meses e receber de volta o período restante, o reembolso é calculado assim:
                </p>
                <ul className="mb-2 space-y-2 list-none">
                  {[
                    "Saldo: o valor anual pago, dividido por 12, multiplicado pelo número de ciclos mensais ainda não iniciados na data do pedido. O ciclo em curso conta como usado.",
                    "Multa por encerramento antecipado: 20% (vinte por cento) desse saldo, que compensa os custos de aquisição e de implantação e o preço anual, que pressupõe os 12 meses.",
                    "Reembolso: o saldo menos a multa e menos eventuais valores em aberto, pago em até 30 (trinta) dias, pelo mesmo meio de pagamento ou por transferência para conta do Usuário.",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p>
                  Exemplo: no plano Pro (R$ 47.964 por ano), um pedido feito durante o 4º ciclo deixa 8 ciclos não iniciados, ou R$ 31.976; a multa é de R$ 6.395,20 e o reembolso, de R$ 25.580,80. A multa nunca incide sobre o período já usado. O acesso termina no fim do ciclo em curso, e o Demanda Day e o Demanda Cast não usados se encerram, sem reembolso em dinheiro. Cobranças indevidas ou em duplicidade são estornadas integralmente.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.8 Encerramento sem multa</h3>
                <p className="mb-2">O Usuário pode encerrar sem multa, com reembolso integral do saldo do item 5.7, quando:</p>
                <ul className="space-y-2 list-none">
                  {[
                    "A demandou descumprir obrigação contratual e não corrigir em 15 (quinze) dias após ser avisada",
                    "A disponibilidade mensal da plataforma ficar abaixo de 95% por 2 meses seguidos ou 3 meses no mesmo ano de contrato (seção 13)",
                    "Uma mudança destes Termos ou do plano reduzir de forma relevante o que o plano entrega",
                    "Houver incidente de segurança com dados do Usuário causado por culpa da demandou",
                    "O Usuário tiver objeção fundamentada a um novo fornecedor que receba o seu conteúdo e as partes não chegarem a uma solução",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.9 Acessos extras</h3>
                <p>
                  Além dos acessos incluídos no plano, o Usuário pode contratar acessos extras. Como o plano, o acesso extra é anual: custa R$ 2.364 por ano (o equivalente a R$ 197 por mês) e soma, a cada ciclo mensal, 2.000 créditos, 1 gravação e 1 marca ao saldo da conta. Contratado no meio do contrato, é cobrado à vista, proporcionalmente ao período que falta até o fim dos 12 meses em curso, e depois renova junto com o plano.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.10 Demanda Day e Demanda Cast</h3>
                <p className="mb-2">
                  Os planos Pro e Enterprise incluem, por ano de contrato, ingressos para o Demanda Day (1 no Pro, 3 no Enterprise), uma imersão presencial organizada pela demandou, e 1 hora de gravação no Demanda Cast. As regras:
                </p>
                <ul className="space-y-2 list-none">
                  {[
                    "São liberados a partir do 31º dia da contratação. O Usuário pode pedir a liberação antes, a partir do 8º dia, ciente de que, ao usar um deles, deixa de ter direito à garantia do item 5.6 (o arrependimento do item 5.5 não muda).",
                    "Devem ser usados dentro do ano de contrato em que foram concedidos, não acumulam para o ano seguinte e não viram dinheiro, créditos ou desconto se não forem usados.",
                    "Demanda Day: data, local e programação definidos pela demandou e divulgados com pelo menos 30 dias de antecedência. O ingresso é nominal e pode ser passado a outro sócio, administrador ou colaborador da empresa do Usuário, avisando até 5 dias antes; não pode ser vendido nem cedido a terceiros. O ingresso não usado na data se perde. Se nenhuma edição acontecer no ano de contrato, o ingresso vale para a edição seguinte.",
                    "Demanda Cast: a gravação acontece em estúdio parceiro indicado pela demandou ou nas salas do escritório parceiro no Helbor Patteo Mogilar (Torre 3, salas 212 e 213, Av. Prefeito Carlos Ferreira Lopes, 635, Vila Mogilar, Mogi das Cruzes/SP). O endereço é informado no agendamento, feito com pelo menos 10 dias úteis de antecedência; a demandou pode trocar o local avisando com pelo menos 10 dias de antecedência, e o Usuário pode remarcar se o novo local não servir. O Usuário pode remarcar uma vez com 48 horas de aviso; falta sem aviso faz o benefício se perder.",
                    "O deslocamento até o Demanda Day e o Demanda Cast (transporte, estacionamento, hospedagem e alimentação) corre por conta do Usuário. A estrutura de gravação no Demanda Cast corre por conta da demandou.",
                    "Gravar no Demanda Cast, por si só, não consome nenhuma gravação do plano. Só se o Usuário enviar esse vídeo à plataforma para editar, o envio conta como 1 gravação do mês e consome os créditos da edição, como qualquer outra gravação.",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              6. Créditos
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Alguns planos incluem <strong className="text-[var(--text-primary)]">créditos</strong>, unidades de consumo utilizadas para geração de conteúdo por IA e outras operações na plataforma.
              </p>
              <ul className="space-y-2 list-none">
                {[
                  "Os créditos do plano são repostos a cada ciclo mensal e não acumulam: o que não for usado em um ciclo não passa para o seguinte. A reposição completa o saldo até o limite do plano.",
                  "Créditos de vídeo de pacotes comprados à parte não são apagados na reposição e valem enquanto houver contrato. No fim do contrato, o saldo de pacote não usado expira, salvo quando o contrato terminar por culpa da demandou ou por descontinuação, casos em que é reembolsado proporcionalmente.",
                  "Quando uma operação é cobrada e não é entregue por falha técnica da plataforma ou de um fornecedor, os créditos da parte não entregue voltam ao saldo. A plataforma devolve automaticamente nos casos que identifica; nos demais, o Usuário pode pedir em até 30 dias, pelo e-mail de contato. A nova tentativa de uma operação que falhou por culpa da demandou não é cobrada.",
                  "Não há devolução quando a operação foi entregue e o Usuário apenas preferiu outro resultado, quando ele mesmo cancelou a operação depois de iniciada, ou quando a geração violou estes Termos (item 7.3).",
                  "Créditos não têm valor em dinheiro e não são reembolsáveis em espécie, salvo nos casos expressos nestes Termos, e não podem ser vendidos nem transferidos para outra conta.",
                  "A demandou pode ajustar quantos créditos cada operação consome, com aviso de 30 dias, sem impedir o Usuário de fazer, em cada ciclo, o número de gravações do seu plano.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-orange-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 7
              Reescrita em 01/10/2026, quando o gêmeo digital entrou: a lista
              antiga misturava conteúdo proibido com uso proibido da plataforma
              e não dizia o que acontece com quem viola. Agora são três partes:
              o que não pode ser gerado ou publicado, o que não pode ser feito
              com a plataforma, e a consequência, para que a recusa de uma
              geração ou a suspensão de uma conta tenha regra escrita antes. */}
          <section id="uso-aceitavel" className="scroll-mt-24">
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              7. Uso Aceitável e Conteúdo Proibido
            </h2>
            <p className="mb-3 text-sm">
              O Usuário compromete-se a utilizar a plataforma apenas para fins lícitos e em conformidade com estes Termos.
            </p>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">7.1 Conteúdo proibido</h3>
                <p className="mb-2">
                  É proibido gerar, aprovar ou publicar pela plataforma, em texto, imagem, vídeo ou voz, conteúdo:
                </p>
                <ul className="space-y-2 list-none">
                  {[
                    "Ofensivo, difamatório, calunioso, injurioso, obsceno ou ameaçador",
                    "Discriminatório ou preconceituoso em razão de raça, cor, etnia, religião, origem, gênero, orientação sexual, deficiência ou idade",
                    "Que configure discurso de ódio ou incite hostilidade contra pessoas ou grupos",
                    "De assédio, bullying, intimidação ou perseguição a indivíduos ou grupos",
                    "Violento, que faça apologia da violência ou de crime, ou que incentive dano a si ou a outras pessoas",
                    "Sexual ou de nudez, em qualquer hipótese, e, com tolerância zero, qualquer conteúdo que sexualize menores de 18 anos",
                    "Enganoso ou fraudulento, inclusive golpes, promessas falsas, falsa identidade e conteúdo que faça uma pessoa parecer dizer ou fazer o que ela não disse nem fez",
                    "De desinformação, inclusive notícias falsas e conteúdo que engane sobre saúde, eleições ou fatos de interesse público",
                    "Que viole direito autoral, marca registrada, direito de imagem ou outro direito de terceiros",
                    "Que viole os termos de uso e as políticas de conteúdo das redes sociais onde for publicado",
                    "Ilegal por qualquer outro motivo, segundo a legislação brasileira",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">7.2 Uso proibido da plataforma</h3>
                <ul className="space-y-2 list-none">
                  {[
                    "Envio ou publicação de spam, mensagens em massa não solicitadas ou qualquer forma de comunicação abusiva",
                    "Tentativa de acessar sistemas, dados ou contas de outros usuários sem autorização",
                    "Uso de bots, scrapers ou qualquer automatização não autorizada além das funcionalidades nativas da plataforma",
                    "Tentativa de contornar os filtros, as conferências ou as travas de segurança da plataforma, inclusive as do gêmeo digital",
                    "Revenda, sublicenciamento ou exploração comercial não autorizada dos serviços",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">7.3 Consequências</h3>
                <p className="mb-2">
                  Diante de violação ou de indício razoável de violação destes Termos, a demandou pode, conforme a gravidade e sem prejuízo de outras medidas cabíveis (fora dos casos graves, avisando antes e dando 5 dias para correção; são casos graves conteúdo sexual envolvendo menores, uso de rosto ou voz de outra pessoa sem autorização dela, fraude, golpe, ameaça, discurso de ódio e ordem de autoridade):
                </p>
                <ul className="mb-2 space-y-2 list-none">
                  {[
                    "Recusar a geração de um conteúdo, inclusive depois de iniciada",
                    "Remover da plataforma o conteúdo que viole estas regras, e cancelar o agendamento da sua publicação",
                    "Suspender ou revogar o gêmeo digital do projeto",
                    "Suspender a conta enquanto apura o caso, ou encerrar o contrato",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <p className="mb-2">
                  Os créditos já usados em gerações que violaram estes Termos{" "}
                  <strong className="text-[var(--text-primary)]">não são reembolsados</strong>, nem em créditos nem em dinheiro. Se o contrato for encerrado por violação, o Usuário recebe o saldo calculado como no item 5.7, com a multa de 20%, descontados os prejuízos comprovados que a violação causou à demandou, como condenações, acordos e custos de defesa.
                </p>
                <p>
                  A demandou colabora com as autoridades competentes quando exigido por lei ou por ordem judicial, nos termos da seção 5.1 da{" "}
                  <Link href="/privacy" className="text-orange-500 hover:underline">
                    Política de Privacidade
                  </Link>
                  , e pode preservar os registros necessários para isso.
                </p>
              </div>
            </div>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              8. Conteúdo Gerado pela IA e Responsabilidade do Usuário
            </h2>
            <div className="space-y-3 text-sm">
              {/* A responsabilidade vem antes da lista e em destaque (01/10):
                  com voz e vídeo de gêmeo na plataforma, "quem responde pelo que
                  sai" deixou de ser detalhe de rodapé. */}
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4">
                <p>
                  O Usuário é o{" "}
                  <strong className="text-[var(--text-primary)]">único responsável</strong> por todo conteúdo que gera, aprova e publica por meio da plataforma, seja texto, imagem, vídeo ou voz, inclusive perante terceiros, perante as redes sociais onde ele é publicado e perante as autoridades. A plataforma é a ferramenta; a decisão de aprovar e publicar é sempre do Usuário.
                </p>
              </div>
              <p>
                A demandou utiliza modelos de inteligência artificial de terceiros (Anthropic, OpenAI, Google e os demais fornecedores listados na{" "}
                <Link href="/privacy#fornecedores" className="text-orange-500 hover:underline">
                  Política de Privacidade
                </Link>
                ) para auxiliar na criação de conteúdo. Esses modelos funcionam por probabilidade: o mesmo pedido pode gerar resultados diferentes, e o resultado pode trazer erros, fontes mal interpretadas, nomes errados ou afirmações que parecem verdadeiras e não são. O Usuário reconhece e concorda que:
              </p>
              <ul className="space-y-2 list-none">
                {[
                  "O conteúdo gerado por IA pode conter imprecisões, erros ou informações desatualizadas. A demandou não garante a exatidão, completude ou adequação do conteúdo gerado.",
                  "O Usuário é o único responsável por revisar, editar e aprovar todo o conteúdo antes de publicá-lo. A publicação de conteúdo é sempre uma ação iniciada pelo Usuário.",
                  "O Usuário é integralmente responsável pelo conteúdo publicado nas redes sociais por meio da plataforma, incluindo eventuais violações legais ou de políticas de terceiros, e responde por reclamações de terceiros decorrentes dele.",
                  "A demandou não se responsabiliza por danos decorrentes da publicação de conteúdo gerado por IA sem a devida revisão do Usuário.",
                  "O Usuário garante que tem autorização de todas as pessoas que aparecem ou falam nas suas gravações e materiais. Quando indica perfis públicos de referência para a pesquisa, usa essas referências como inspiração, sem copiar texto, imagem ou vídeo de terceiros.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-orange-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {/* Setores regulados (02/10/2026, cláusula 10.4 da minuta): o
                  público de vendedores e corretores é o que mais publica
                  promessa proibida, como contemplação garantida em consórcio. */}
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">8.1 Setores regulados</h3>
                <p className="mb-2">
                  O Usuário que atua em setor com regras próprias de publicidade é o responsável por cumpri-las e por não prometer o que a lei ou o órgão regulador do seu setor proíbe. A plataforma não conhece nem verifica as regras de cada setor. Exemplos:
                </p>
                <ul className="space-y-2 list-none">
                  {[
                    "Consórcio, crédito e serviços financeiros: o consórcio segue a Lei nº 11.795/2008 e a fiscalização do Banco Central do Brasil. Não se pode prometer contemplação garantida ou em data certa, apresentar consórcio como financiamento ou investimento, nem prometer aprovação de crédito ou rentabilidade garantida.",
                    "Saúde: profissionais e estabelecimentos seguem as regras de publicidade dos seus conselhos, como o Conselho Federal de Medicina, e da Anvisa. Não se pode prometer cura ou resultado garantido, nem usar \"antes e depois\" fora do que o conselho permite.",
                    "Outros setores, como advocacia, mercado imobiliário, alimentos e suplementos, bebidas alcoólicas, apostas e educação, também têm limites próprios que o Usuário deve observar.",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {/* Marcas e imagens de terceiros (04/10/2026, cláusula 10.10 das
                  Condições Gerais): o cliente pede "faça um post citando a
                  marca X"; quem responde pelo uso é quem pediu e aprovou. */}
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">8.2 Marcas, logotipos, nomes e imagens de terceiros</h3>
                <p>
                  O Usuário é o responsável pelo uso de marcas, logotipos, nomes comerciais, nomes de pessoas e imagens de terceiros que ele citar, enviar ou pedir nos conteúdos. A demandou apenas executa o que o Usuário pede e aprova, e não verifica se ele tem direito a esse uso. Ao pedir ou aprovar uma peça com esses elementos, o Usuário garante que tem a autorização do titular ou que o uso é apenas informativo ou nominativo, como citar um produto, uma empresa ou uma pessoa para identificá-los, sem sugerir parceria, patrocínio ou endosso que não existam. Reclamações de terceiros sobre esse uso são de responsabilidade do Usuário, que responde por elas e ressarce a demandou se ela for acionada por esse motivo.
                </p>
              </div>
            </div>
          </section>

          {/* 9
              O GÊMEO DIGITAL (01/10/2026). Âncora própria (#gemeo) porque a
              tela de cadastro do gêmeo aponta para cá na hora da autorização.
              A regra central é a mesma que a tela já aplica: só a própria
              pessoa, com a autorização gravada por ela (Código Civil, art. 20),
              e o rosto e a voz tratados como dado biométrico (Lei Geral de
              Proteção de Dados, art. 5º, II, e art. 11). */}
          <section id="gemeo" className="scroll-mt-24">
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              9. Gêmeo Digital (rosto e voz)
            </h2>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">9.1 O que é</h3>
                <p>
                  O gêmeo digital é o recurso que gera vídeos com o rosto e a voz de uma pessoa, a partir de fotos, de uma amostra de voz e de uma autorização gravada em vídeo por essa mesma pessoa no cadastro do projeto.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">9.2 Só da própria pessoa titular</h3>
                <p>
                  Só é permitido criar o gêmeo da{" "}
                  <strong className="text-[var(--text-primary)]">própria pessoa titular</strong> do rosto e da voz, e somente depois que ela mesma gravar a autorização exigida no cadastro, lendo em voz alta a frase com o próprio nome. Quando o Usuário é uma empresa, o gêmeo de um sócio, representante ou colaborador só pode ser criado se essa pessoa fizer, ela mesma, a gravação da autorização.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">9.3 O que é proibido</h3>
                <ul className="space-y-2 list-none">
                  {[
                    "Clonar ou tentar clonar o rosto ou a voz de outra pessoa, com ou sem o conhecimento dela, sem que ela mesma grave a autorização",
                    "Criar gêmeo de figura pública (artista, político, autoridade, influenciador ou celebridade), ainda que a partir de material disponível na internet",
                    "Criar gêmeo de menor de 18 anos, em qualquer hipótese, mesmo com autorização dos pais ou responsáveis",
                    "Simular a autorização com gravação de terceiros, gravação editada, voz ou rosto gerados por inteligência artificial, ou qualquer outro artifício",
                    "Usar o gêmeo para fazer a pessoa parecer dizer o que ela não disse, para enganar terceiros, ou para qualquer conteúdo proibido no item 7.1",
                  ].map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 text-orange-500 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">9.4 Base legal</h3>
                <p className="mb-2">
                  A imagem e a voz de uma pessoa só podem ser usadas com a autorização dela, nos termos do{" "}
                  <strong className="text-[var(--text-primary)]">art. 20 do Código Civil (Lei nº 10.406/2002)</strong>. A autorização gravada no cadastro é o registro dessa autorização, com data, nome e o texto lido.
                </p>
                <p>
                  O rosto e a voz usados para criar o gêmeo são{" "}
                  <strong className="text-[var(--text-primary)]">dados biométricos</strong>, que a Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018) classifica como dados pessoais sensíveis (art. 5º, II). O tratamento se apoia no consentimento específico e destacado do titular (art. 11, I), dado na autorização gravada. A finalidade, o prazo de guarda, os fornecedores envolvidos e a exclusão estão descritos na{" "}
                  <Link href="/privacy#gemeo" className="text-orange-500 hover:underline">
                    Política de Privacidade
                  </Link>
                  .
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">9.5 Revogação</h3>
                <p>
                  O titular pode revogar o gêmeo a qualquer momento, na própria tela do gêmeo. A revogação apaga as fotos, a voz clonada e a gravação da autorização; fica guardado apenas o registro de que a autorização foi dada e revogada, com as datas. Apagar o projeto ou encerrar o contrato também revoga o gêmeo. Quando o Usuário é uma empresa, ele deve revogar na hora o gêmeo de quem deixar a empresa ou pedir. Os vídeos já gerados continuam no projeto até o Usuário apagá-los, e os já publicados continuam nas redes até serem apagados lá.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">9.6 Conferência e consequências</h3>
                <p>
                  A demandou confere a autorização gravada antes de clonar a voz e pode recusar, suspender ou revogar um gêmeo quando houver indício de uso do rosto ou da voz de outra pessoa, de figura pública ou de menor, aplicando o item 7.3. O Usuário responde, perante a pessoa retratada e perante terceiros, pelo uso indevido de imagem ou voz alheia.
                </p>
              </div>
            </div>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              10. Integrações com Redes Sociais
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                A plataforma permite integração com{" "}
                <strong className="text-[var(--text-primary)]">LinkedIn</strong>,{" "}
                <strong className="text-[var(--text-primary)]">Instagram</strong>,{" "}
                <strong className="text-[var(--text-primary)]">Facebook</strong>,{" "}
                <strong className="text-[var(--text-primary)]">YouTube</strong>,{" "}
                <strong className="text-[var(--text-primary)]">X (Twitter)</strong> e{" "}
                <strong className="text-[var(--text-primary)]">TikTok</strong>, mediante autorização OAuth fornecida pelo Usuário. A publicação ocorre apenas nas contas que o Usuário conectou, apenas com o conteúdo que ele aprovou peça a peça, e no momento que ele agendou.
              </p>
              <p>Ao conectar suas contas de redes sociais, o Usuário reconhece que:</p>
              <ul className="space-y-2 list-none">
                {[
                  "Concede à demandou permissão para publicar conteúdo em seu nome nas plataformas conectadas, conforme sua instrução.",
                  "É exclusivamente responsável por cumprir os Termos de Uso, Políticas de Conteúdo e demais regras de cada plataforma (LinkedIn, Instagram, Facebook, YouTube, X/Twitter, TikTok e outras).",
                  "Pode desconectar qualquer rede a qualquer momento, pela tela de configurações do projeto ou pelo painel da própria rede, e que a desconexão apaga o token de acesso e encerra na hora a capacidade da plataforma de publicar naquela conta.",
                  "A demandou não se responsabiliza pela suspensão, banimento ou qualquer penalidade aplicada por redes sociais em decorrência do conteúdo publicado pelo Usuário.",
                  "As redes são empresas independentes. A demandou não responde por mudança de regra, de algoritmo ou de interface das redes, por bloqueio ou limitação de alcance da conta, por indisponibilidade ou recusa de publicação pela rede, nem pela desativação de uma integração pela própria rede. Nesses casos, a demandou busca alternativa razoável, e o Usuário pode baixar as peças e publicá-las manualmente.",
                  "Para publicar, a plataforma usa as interfaces oficiais das redes e, em algumas redes, um intermediário técnico de publicação listado na Política de Privacidade.",
                  "Pode revogar as permissões a qualquer momento, tanto pela demandou quanto diretamente nas configurações de cada rede social.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-orange-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              11. Propriedade Intelectual
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">11.1 Plataforma</h3>
                <p>
                  Todo o código-fonte, design, marca, logotipo, interfaces, algoritmos, documentação e demais elementos da plataforma demandou são de propriedade exclusiva da DEMANDOU TECNOLOGIA DA INFORMACAO LTDA ou de seus licenciantes, protegidos pela legislação de propriedade intelectual aplicável. É vedada qualquer reprodução, cópia ou uso não autorizado.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">11.2 Conteúdo do Usuário</h3>
                <p>
                  O conteúdo enviado pelo Usuário (gravações, textos, fotos, marcas e demais materiais) pertence a ele, e o conteúdo gerado pela plataforma a partir dele também, na medida em que a lei permitir proteção sobre ele. A demandou transfere ao Usuário quaisquer direitos que possa ter sobre o conteúdo gerado e não reivindica propriedade sobre ele.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">11.3 Licença limitada</h3>
                <p>
                  O Usuário concede à demandou uma licença limitada, não exclusiva, gratuita e pelo prazo do contrato, apenas para armazenar, processar, transmitir aos fornecedores e publicar nas redes conectadas, quando o Usuário mandar, o seu conteúdo e o conteúdo gerado, com a única finalidade de operar a plataforma para o próprio Usuário. A marca, o logotipo e a identidade visual do Usuário são usados só dentro da plataforma, para gerar o conteúdo dele.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">11.4 Sem treino de modelos</h3>
                <p>
                  A demandou não usa o conteúdo do Usuário nem o conteúdo gerado para treinar modelos de inteligência artificial, próprios ou de terceiros, sem consentimento expresso e separado do Usuário, e contrata e configura os fornecedores para que não usem esses dados para treinar modelos (ver a{" "}
                  <Link href="/privacy#treino" className="text-orange-500 hover:underline">
                    Política de Privacidade
                  </Link>
                  ). Para medir e melhorar a plataforma, usa apenas dados de uso agregados e anonimizados, como volume de operações e taxas de erro, sem acesso ao conteúdo das peças.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">11.5 Marca e imagem do Usuário</h3>
                <p>
                  A demandou não usa o nome, a marca, a imagem, a voz ou o conteúdo do Usuário na sua própria divulgação sem autorização específica e por escrito, que o Usuário pode negar ou revogar sem qualquer efeito no contrato.
                </p>
              </div>
            </div>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              12. Limitação de Responsabilidade
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                A responsabilidade total da demandou perante o Usuário, por todas as causas relacionadas ao contrato, somadas, fica limitada ao{" "}
                <strong className="text-[var(--text-primary)]">valor efetivamente pago pelo Usuário nos 12 (doze) meses anteriores ao fato</strong> que originou o pedido.
              </p>
              <p>
                Essa limitação e as exclusões abaixo{" "}
                <strong className="text-[var(--text-primary)]">não se aplicam</strong> aos danos causados por dolo ou culpa grave da demandou, nem às hipóteses em que a lei não admite limitação, e não reduzem os reembolsos previstos na seção 5.
              </p>
              <p>Ressalvado o parágrafo acima, a demandou não será responsável por:</p>
              <ul className="space-y-2 list-none">
                {[
                  "Danos indiretos, incidentais, especiais, consequenciais ou punitivos",
                  "Lucros cessantes, perda de dados ou perda de oportunidades de negócio",
                  "Falhas ou interrupções de serviços de terceiros (redes sociais, provedores de IA, infraestrutura)",
                  "Conteúdo publicado pelo Usuário que viole direitos de terceiros ou a legislação aplicável",
                  "Danos resultantes do uso inadequado da plataforma pelo Usuário",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-orange-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              13. Disponibilidade do Serviço
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                A demandou busca manter a plataforma disponível em pelo menos{" "}
                <strong className="text-[var(--text-primary)]">99% do tempo em cada mês</strong>. Não entram nessa conta a manutenção programada avisada, falhas das redes sociais e de fornecedores fora do controle razoável da demandou, problemas na internet ou nos equipamentos do Usuário e casos fortuitos ou de força maior.
              </p>
              <p>
                Essa meta não gera multa, crédito ou desconto. Se a disponibilidade mensal ficar abaixo de 95% por 2 meses seguidos ou 3 meses no mesmo ano de contrato, o Usuário pode encerrar sem multa (item 5.8).
              </p>
              <p>
                Manutenções que deixem a plataforma fora do ar são avisadas com pelo menos 48 (quarenta e oito) horas de antecedência, por e-mail ou aviso na plataforma, e feitas preferencialmente fora do horário comercial. Manutenções de emergência, para corrigir falhas ou riscos de segurança, podem ser feitas sem aviso, com comunicação assim que possível.
              </p>
            </div>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              14. Cancelamento e Rescisão
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">14.1 Pelo Usuário</h3>
                <p>
                  O Usuário pode, a qualquer momento, pedir a não renovação, mantendo o acesso até o fim dos 12 meses já pagos (item 5.4), ou encerrar antes com reembolso proporcional (item 5.7), quando o acesso termina no fim do ciclo mensal em curso. Os casos de arrependimento, garantia e encerramento sem multa estão nos itens 5.5, 5.6 e 5.8.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">14.2 Pela demandou</h3>
                <p>
                  Em caso de violação destes Termos ou uso fraudulento, a demandou age conforme o item 7.3. Se houver valor devido e não pago, inclusive por contestação indevida de cobrança no cartão, a demandou avisa o Usuário, pode suspender o acesso 5 dias depois do aviso e, se a situação não se resolver em 30 dias da suspensão, encerrar o contrato e cobrar o devido. A demandou também pode descontinuar a plataforma ou um plano, avisando com pelo menos 60 dias e reembolsando integralmente o saldo não usado, sem multa.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">14.3 Exclusão de dados</h3>
                <p>
                  Após o encerramento do contrato, o Usuário tem 30 (trinta) dias para baixar o seu conteúdo. Depois disso, a demandou elimina o conteúdo, o conteúdo gerado e os acessos às redes conectadas em até 60 (sessenta) dias, num total de até{" "}
                  <strong className="text-[var(--text-primary)]">90 (noventa) dias</strong>, ressalvados os dados que devem ser mantidos por obrigação legal (conforme Política de Privacidade, seção 6). Os dados do gêmeo digital são apagados no encerramento, sem esperar esse prazo.
                </p>
              </div>
            </div>
          </section>

          {/* 15 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              15. Alterações nos Termos
            </h2>
            <p className="mb-3 text-sm">
              A demandou pode revisar estes Termos periodicamente. Alterações relevantes serão comunicadas ao Usuário com antecedência mínima de{" "}
              <strong className="text-[var(--text-primary)]">30 (trinta) dias</strong> antes de entrarem em vigor, por e-mail ou por aviso na plataforma.
            </p>
            <p className="mb-3 text-sm">
              Mudanças de preço, de limites do plano ou que reduzam direitos do Usuário só valem a partir da renovação seguinte; durante o ano em curso continua valendo a versão aceita, salvo mudança exigida por lei ou que seja apenas favorável ao Usuário.
            </p>
            <p className="text-sm">
              O uso continuado da plataforma após o término do prazo de notificação implica a aceitação dos novos Termos. Caso não concorde, o Usuário pode não renovar, sem custo, e, se a mudança reduzir de forma relevante o que o plano entrega, encerrar sem multa (item 5.8).
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              16. Lei Aplicável e Foro
            </h2>
            <p className="mb-3 text-sm">
              Estes Termos são regidos e interpretados de acordo com as leis da República Federativa do Brasil, em especial o{" "}
              <strong className="text-[var(--text-primary)]">Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong>, o{" "}
              <strong className="text-[var(--text-primary)]">Marco Civil da Internet (Lei nº 12.965/2014)</strong> e a{" "}
              <strong className="text-[var(--text-primary)]">Lei Geral de Proteção de Dados (LGPD, Lei nº 13.709/2018)</strong>, além do <strong className="text-[var(--text-primary)]">Código Civil (Lei nº 10.406/2002)</strong>.
            </p>
            <p className="text-sm">
              Fica eleito o{" "}
              <strong className="text-[var(--text-primary)]">Foro da Comarca de São Paulo/SP</strong>, sede da demandou, para dirimir controvérsias decorrentes ou relacionadas a estes Termos. Quando o Usuário for consumidor, ele poderá propor a ação no foro do seu domicílio. Antes de recorrer ao Judiciário, as partes procurarão resolver a divergência por negociação direta, pelo e-mail de contato, por até 30 dias, sem prejuízo de medida urgente nem do acesso à Justiça.
            </p>
          </section>

          {/* 17 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              17. Contato
            </h2>
            <p className="mb-3 text-sm">
              Para dúvidas, sugestões ou reclamações relacionadas a estes Termos ou ao uso da plataforma, entre em contato:
            </p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-5 text-sm space-y-1">
              <p><span className="text-[var(--text-muted)]">Empresa:</span> DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</p>
              <p><span className="text-[var(--text-muted)]">E-mail:</span>{" "}
                <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                  contato@demandou.com
                </a>
              </p>
              <p><span className="text-[var(--text-muted)]">Endereço:</span> Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150</p>
            </div>
            <p className="mt-4 text-sm">
              O suporte atende por este e-mail e pelos canais indicados na plataforma, em dias úteis. Para assuntos urgentes de segurança ou violações graves, mencione no assunto do e-mail.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 text-center text-xs text-[var(--text-muted)]">
        <p>DEMANDOU TECNOLOGIA DA INFORMACAO LTDA · CNPJ 66.140.770/0001-48</p>
        <p className="mt-1">Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150</p>
        <div className="mt-3 flex justify-center gap-4">
          <Link href="/privacy" className="hover:text-orange-500 transition-colors">
            Privacidade
          </Link>
          <Link href="/terms" className="hover:text-orange-500 transition-colors">
            Termos de Uso
          </Link>
        </div>
      </footer>
    </div>
  );
}
