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
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[var(--bg-primary)]/90 backdrop-blur-sm">
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
            Última atualização: 03/09/2026
          </p>
        </div>

        <div className="space-y-10 text-[#d1d5db] leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              1. Partes
            </h2>
            <p className="mb-3 text-sm">
              Este instrumento regula a relação contratual entre:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Prestadora de Serviços</p>
                <p>
                  <strong>DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</strong>, inscrita no CNPJ sob nº 66.140.770/0001-48, com sede na Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150, doravante denominada{" "}
                  <strong className="text-orange-500">&quot;demandou&quot;</strong>.
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
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
            <p className="text-sm">
              Caso não concorde com qualquer disposição destes Termos, não utilize a plataforma. A demandou se reserva o direito de recusar o acesso a qualquer Usuário que não cumpra estes Termos.
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
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-orange-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              A demandou se reserva o direito de adicionar, modificar ou descontinuar funcionalidades a qualquer momento, com aviso prévio quando aplicável.
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
                A demandou se reserva o direito de suspender ou encerrar contas que violem estes Termos ou que apresentem comportamento suspeito, sem necessidade de aviso prévio em casos graves.
              </p>
            </div>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              5. Planos e Pagamentos
            </h2>
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.1 Assinatura</h3>
                <p>
                  A demandou oferece planos de assinatura com{" "}
                  <strong className="text-[var(--text-primary)]">ciclo mensal ou anual</strong>, com diferentes níveis de recursos. Os valores vigentes são os exibidos na página de planos no momento da contratação e podem ser alterados com aviso prévio de 30 dias, valendo apenas para o ciclo seguinte.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.2 Período de teste gratuito</h3>
                <p>
                  Planos elegíveis incluem período de teste gratuito de{" "}
                  <strong className="text-[var(--text-primary)]">7 (sete) dias corridos</strong>, contados da contratação. O cadastro de um cartão de crédito válido é exigido para iniciar o teste. Ao término do período de teste, a primeira cobrança é realizada automaticamente, salvo se o Usuário cancelar antes do fim do teste, hipótese em que{" "}
                  <strong className="text-[var(--text-primary)]">nada será cobrado</strong>.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.3 Cobrança e renovação automática</h3>
                <p>
                  As assinaturas são cobradas antecipadamente no início de cada período de faturamento (mês ou ano, conforme o ciclo contratado) e renovadas automaticamente, salvo cancelamento pelo Usuário antes do término do período vigente. O processamento é realizado pelo Stripe.
                </p>
                <p className="mt-2">
                  <strong className="text-[var(--text-primary)]">No ciclo anual</strong>, o Usuário contrata 12 meses de serviço e paga, de uma só vez, o equivalente a 10 mensalidades. O desconto é a contrapartida direta desse compromisso de permanência. O valor é cobrado integralmente na contratação e os créditos do plano são repostos mensalmente ao longo dos 12 meses.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.4 Cancelamento</h3>
                <p>
                  O Usuário pode cancelar sua assinatura{" "}
                  <strong className="text-[var(--text-primary)]">a qualquer momento</strong>, pelo portal de gerenciamento de assinatura (acessível na página de plano e billing) ou pelo e-mail{" "}
                  <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                    contato@demandou.com
                  </a>
                  , sem multa e sem taxa de cancelamento. O cancelamento interrompe a renovação seguinte: o Usuário mantém acesso à plataforma e aos créditos já repostos até o fim do período de faturamento já pago (fim do mês vigente no ciclo mensal; fim dos 12 meses contratados no ciclo anual). No ciclo anual, como o período inteiro já foi pago e o acesso permanece disponível até o fim dele, não há cobrança adicional de qualquer espécie em razão do cancelamento.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.5 Direito de arrependimento (art. 49 do CDC)</h3>
                <p className="mb-2">
                  Em conformidade com o art. 49 do Código de Defesa do Consumidor, o Usuário consumidor pode desistir da contratação no prazo de{" "}
                  <strong className="text-[var(--text-primary)]">7 (sete) dias corridos a contar da primeira cobrança</strong> de cada nova contratação (mensal ou anual), com direito a{" "}
                  <strong className="text-[var(--text-primary)]">reembolso integral</strong> do valor pago, pelo mesmo meio de pagamento. Para exercer o direito, basta solicitar pelo portal de assinatura ou pelo e-mail{" "}
                  <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                    contato@demandou.com
                  </a>
                  .
                </p>
                <p>
                  Como o período de teste gratuito antecede a primeira cobrança, na prática o Usuário dispõe do teste inteiro sem custo e de mais 7 dias após a primeira cobrança para desistir com devolução integral.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.6 Garantia de 30 dias</h3>
                <p className="mb-2">
                  Além do direito de arrependimento do item 5.5, a demandou oferece uma garantia própria: se, nos{" "}
                  <strong className="text-[var(--text-primary)]">30 (trinta) dias corridos a contar da primeira cobrança</strong>{" "}
                  de uma nova assinatura, o Usuário não tiver publicado por meio da plataforma nenhuma peça que ele mesmo tenha aprovado, poderá solicitar o cancelamento com{" "}
                  <strong className="text-[var(--text-primary)]">reembolso integral</strong> do valor pago naquela contratação, pelo mesmo meio de pagamento, bastando pedir pelo portal de assinatura ou pelo e-mail{" "}
                  <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                    contato@demandou.com
                  </a>
                  .
                </p>
                <p>
                  A garantia vale uma vez por Usuário, na primeira contratação, e não se aplica a renovações nem a assinaturas em que o Usuário já tenha publicado conteúdo aprovado por ele. A publicação de conteúdo aprovado é o sinal de que o serviço foi prestado e aceito; a partir dela vale o item 5.7.
                </p>
              </div>
              <div>
                <h3 className="mb-2 font-medium text-[var(--text-primary)]">5.7 Política de reembolso após os prazos de arrependimento e garantia</h3>
                <p>
                  Decorridos os prazos dos itens 5.5 e 5.6,{" "}
                  <strong className="text-[var(--text-primary)]">não há reembolso proporcional</strong> por período não utilizado do ciclo já pago; o cancelamento vale para a renovação seguinte, conforme item 5.4. Cobranças indevidas ou em duplicidade serão estornadas integralmente. Situações excepcionais serão analisadas individualmente pelo e-mail de contato.
                </p>
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
                  "Os créditos são vinculados ao período de assinatura vigente e expiram ao fim de cada ciclo de faturamento.",
                  "Créditos não utilizados não são acumulados para o período seguinte, salvo disposição expressa em contrário no plano contratado.",
                  "Créditos não são reembolsáveis em dinheiro, seja no cancelamento ou em qualquer outra hipótese.",
                  "A demandou pode ajustar o custo em créditos de operações específicas mediante aviso prévio.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-orange-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              7. Uso Aceitável
            </h2>
            <p className="mb-3 text-sm">
              O Usuário compromete-se a utilizar a plataforma apenas para fins lícitos e em conformidade com estes Termos. São expressamente proibidos:
            </p>
            <ul className="space-y-2 text-sm list-none">
              {[
                "Envio ou publicação de spam, mensagens em massa não solicitadas ou qualquer forma de comunicação abusiva",
                "Criação ou disseminação de desinformação, fake news ou conteúdo enganoso",
                "Publicação de conteúdo ilegal, difamatório, obsceno, ameaçador, discriminatório ou que incite violência",
                "Violação de direitos autorais, marcas registradas ou outros direitos de propriedade intelectual de terceiros",
                "Uso da plataforma para assédio, bullying ou perseguição a indivíduos ou grupos",
                "Tentativa de acessar sistemas, dados ou contas de outros usuários sem autorização",
                "Uso de bots, scrapers ou qualquer automatização não autorizada além das funcionalidades nativas da plataforma",
                "Revenda, sublicenciamento ou exploração comercial não autorizada dos serviços",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-orange-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              A demandou pode remover conteúdo e suspender contas que violem estas regras, sem aviso prévio em casos graves, e colaborar com autoridades competentes quando exigido por lei.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              8. Conteúdo Gerado pela IA
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                A demandou utiliza modelos de linguagem de terceiros (Anthropic, Google e outros) para auxiliar na criação de conteúdo. O Usuário reconhece e concorda que:
              </p>
              <ul className="space-y-2 list-none">
                {[
                  "O conteúdo gerado por IA pode conter imprecisões, erros ou informações desatualizadas. A demandou não garante a exatidão, completude ou adequação do conteúdo gerado.",
                  "O Usuário é o único responsável por revisar, editar e aprovar todo o conteúdo antes de publicá-lo. A publicação de conteúdo é sempre uma ação iniciada pelo Usuário.",
                  "O Usuário é integralmente responsável pelo conteúdo publicado nas redes sociais por meio da plataforma, incluindo eventuais violações legais ou de políticas de terceiros.",
                  "A demandou não se responsabiliza por danos decorrentes da publicação de conteúdo gerado por IA sem a devida revisão do Usuário.",
                ].map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="mt-1 text-orange-500 shrink-0">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              9. Integrações com Redes Sociais
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                A plataforma permite integração com redes sociais como <strong className="text-[var(--text-primary)]">LinkedIn</strong> e{" "}
                <strong className="text-[var(--text-primary)]">X (Twitter)</strong>, mediante autorização OAuth fornecida pelo Usuário.
              </p>
              <p>Ao conectar suas contas de redes sociais, o Usuário reconhece que:</p>
              <ul className="space-y-2 list-none">
                {[
                  "Concede à demandou permissão para publicar conteúdo em seu nome nas plataformas conectadas, conforme sua instrução.",
                  "É exclusivamente responsável por cumprir os Termos de Uso, Políticas de Conteúdo e demais regras de cada plataforma (LinkedIn, X/Twitter e outras).",
                  "A demandou não se responsabiliza pela suspensão, banimento ou qualquer penalidade aplicada por redes sociais em decorrência do conteúdo publicado pelo Usuário.",
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

          {/* 10 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              10. Propriedade Intelectual
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">10.1 Plataforma</h3>
                <p>
                  Todo o código-fonte, design, marca, logotipo, interfaces, algoritmos, documentação e demais elementos da plataforma demandou são de propriedade exclusiva da DEMANDOU TECNOLOGIA DA INFORMACAO LTDA ou de seus licenciantes, protegidos pela legislação de propriedade intelectual aplicável. É vedada qualquer reprodução, cópia ou uso não autorizado.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">10.2 Conteúdo do Usuário</h3>
                <p>
                  O conteúdo criado e publicado pelo Usuário por meio da plataforma (incluindo textos, imagens, vídeos enviados e demais materiais) pertence ao próprio Usuário. A demandou não reivindica propriedade sobre o conteúdo gerado pelo Usuário.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">10.3 Licença limitada</h3>
                <p>
                  O Usuário concede à demandou uma licença limitada, não exclusiva e não transferível para processar e armazenar seu conteúdo exclusivamente para fins de operação e melhoria da plataforma.
                </p>
              </div>
            </div>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              11. Limitação de Responsabilidade
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                Na máxima extensão permitida pela legislação brasileira aplicável, a responsabilidade total da demandou perante o Usuário, por qualquer causa e independentemente da natureza da ação, será limitada ao{" "}
                <strong className="text-[var(--text-primary)]">valor efetivamente pago pelo Usuário nos últimos 3 (três) meses</strong> anteriores ao evento que originou a reclamação.
              </p>
              <p>A demandou não será responsável por:</p>
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

          {/* 12 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              12. Disponibilidade do Serviço
            </h2>
            <div className="space-y-3 text-sm">
              <p>
                A demandou envidará seus melhores esforços para manter a plataforma disponível de forma contínua. No entanto,{" "}
                <strong className="text-[var(--text-primary)]">não há garantia formal de SLA (Service Level Agreement)</strong>: o serviço é fornecido &quot;como está&quot; e &quot;conforme disponível&quot;.
              </p>
              <p>
                Eventuais interrupções para manutenção programada serão comunicadas com antecedência razoável. A demandou não se responsabiliza por interrupções decorrentes de falhas em serviços de terceiros, casos fortuitos ou de força maior.
              </p>
            </div>
          </section>

          {/* 13 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              13. Cancelamento e Rescisão
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">13.1 Pelo Usuário</h3>
                <p>
                  O Usuário pode cancelar sua assinatura e encerrar o uso da plataforma a qualquer momento, conforme os itens 5.4 e 5.5. O acesso permanece ativo até o fim do período de faturamento já pago.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">13.2 Pela demandou</h3>
                <p>
                  A demandou pode suspender ou encerrar o acesso do Usuário em caso de violação destes Termos, inadimplência ou uso fraudulento, com ou sem aviso prévio, dependendo da gravidade.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">13.3 Exclusão de dados</h3>
                <p>
                  Após o encerramento da conta, os dados do Usuário serão excluídos no prazo de{" "}
                  <strong className="text-[var(--text-primary)]">90 (noventa) dias</strong>, ressalvados os dados que devem ser mantidos por obrigação legal (conforme Política de Privacidade, seção 6).
                </p>
              </div>
            </div>
          </section>

          {/* 14 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              14. Alterações nos Termos
            </h2>
            <p className="mb-3 text-sm">
              A demandou pode revisar estes Termos periodicamente. Alterações relevantes serão comunicadas ao Usuário com antecedência mínima de{" "}
              <strong className="text-[var(--text-primary)]">30 (trinta) dias</strong> antes de entrarem em vigor, por e-mail ou por aviso na plataforma.
            </p>
            <p className="text-sm">
              O uso continuado da plataforma após o término do prazo de notificação implica a aceitação dos novos Termos. Caso não concorde, o Usuário pode cancelar sua conta antes da data de vigência das alterações.
            </p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              15. Lei Aplicável e Foro
            </h2>
            <p className="mb-3 text-sm">
              Estes Termos são regidos e interpretados de acordo com as leis da República Federativa do Brasil, em especial o{" "}
              <strong className="text-[var(--text-primary)]">Código de Defesa do Consumidor (Lei nº 8.078/1990)</strong>, o{" "}
              <strong className="text-[var(--text-primary)]">Marco Civil da Internet (Lei nº 12.965/2014)</strong> e a{" "}
              <strong className="text-[var(--text-primary)]">LGPD (Lei nº 13.709/2018)</strong>.
            </p>
            <p className="text-sm">
              Fica eleito o{" "}
              <strong className="text-[var(--text-primary)]">Foro da Comarca de São Paulo/SP</strong> para dirimir quaisquer controvérsias decorrentes ou relacionadas a estes Termos, com renúncia expressa a qualquer outro, por mais privilegiado que seja.
            </p>
          </section>

          {/* 16 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              16. Contato
            </h2>
            <p className="mb-3 text-sm">
              Para dúvidas, sugestões ou reclamações relacionadas a estes Termos ou ao uso da plataforma, entre em contato:
            </p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm space-y-1">
              <p><span className="text-[var(--text-muted)]">Empresa:</span> DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</p>
              <p><span className="text-[var(--text-muted)]">E-mail:</span>{" "}
                <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                  contato@demandou.com
                </a>
              </p>
              <p><span className="text-[var(--text-muted)]">Endereço:</span> Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150</p>
            </div>
            <p className="mt-4 text-sm">
              Tentaremos responder em até 5 dias úteis. Para assuntos urgentes de segurança ou violações graves, mencione no assunto do e-mail.
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-[var(--text-muted)]">
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
