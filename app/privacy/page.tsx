import type { Metadata } from "next";
import Link from "next/link";
import { BrandMarkImg } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Política de Privacidade — demandou",
  description:
    "Saiba como a demandou coleta, utiliza e protege seus dados pessoais em conformidade com a LGPD (Lei nº 13.709/2018).",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <BrandMarkImg variant="dark" size={28} />
            <span className="font-semibold text-[#f5f5f5]">demandou</span>
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1 text-sm text-[#9ca3af] transition-colors hover:text-orange-500"
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
          <h1 className="mb-3 text-3xl font-bold text-[#f5f5f5]">
            Política de Privacidade
          </h1>
          <p className="text-sm text-[#9ca3af]">
            Última atualização: 09/04/2026
          </p>
        </div>

        <div className="space-y-10 text-[#d1d5db] leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              1. Identificação do Controlador
            </h2>
            <p className="mb-3">
              Esta Política de Privacidade é aplicável à plataforma{" "}
              <strong className="text-[#f5f5f5]">demandou</strong>, operada por:
            </p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-5 space-y-1 text-sm">
              <p><span className="text-[#9ca3af]">Razão Social:</span> DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</p>
              <p><span className="text-[#9ca3af]">Nome Fantasia:</span> DEMANDOU</p>
              <p><span className="text-[#9ca3af]">CNPJ:</span> 66.140.770/0001-48</p>
              <p><span className="text-[#9ca3af]">Endereço:</span> Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150</p>
              <p><span className="text-[#9ca3af]">Natureza Jurídica:</span> Sociedade Empresária Limitada (ME)</p>
              <p><span className="text-[#9ca3af]">E-mail:</span>{" "}
                <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                  contato@demandou.com
                </a>
              </p>
            </div>
            <p className="mt-3 text-sm">
              Para os fins da Lei nº 13.709/2018 (LGPD), a demandou atua como{" "}
              <strong className="text-[#f5f5f5]">controladora</strong> dos dados pessoais tratados por meio desta plataforma.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              2. Dados que Coletamos
            </h2>
            <p className="mb-4">
              Coletamos as seguintes categorias de dados pessoais durante o uso da plataforma:
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">2.1 Dados de cadastro</h3>
                <p className="text-sm">
                  Nome completo e endereço de e-mail, fornecidos no momento do registro na plataforma (via Clerk).
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">2.2 Dados de uso</h3>
                <p className="text-sm">
                  Informações sobre como você utiliza a plataforma: páginas acessadas, funcionalidades utilizadas, frequência de acesso, logs de erros e dados de diagnóstico.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">2.3 Tokens de redes sociais</h3>
                <p className="text-sm">
                  Tokens de acesso OAuth fornecidos voluntariamente para integração com plataformas de redes sociais (LinkedIn, X/Twitter), necessários para publicação de conteúdo em seu nome.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">2.4 Conteúdo gerado</h3>
                <p className="text-sm">
                  Textos, rascunhos, posts e demais conteúdos criados ou editados por você na plataforma, incluindo insumos fornecidos para a geração de conteúdo por inteligência artificial.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">2.5 Dados de pagamento</h3>
                <p className="text-sm">
                  Dados de cobrança e histórico de transações, processados diretamente pelo Stripe. Não armazenamos dados de cartão de crédito em nossos servidores.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">2.6 Dados técnicos</h3>
                <p className="text-sm">
                  Endereço IP, tipo e versão de navegador, sistema operacional, fuso horário e outros dados técnicos coletados automaticamente.
                </p>
              </div>
            </div>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              3. Finalidade do Tratamento
            </h2>
            <p className="mb-3">Utilizamos seus dados pessoais para as seguintes finalidades:</p>
            <ul className="space-y-2 text-sm list-none">
              {[
                "Operar e fornecer os serviços da plataforma demandou",
                "Autenticar sua identidade e gerenciar sua conta",
                "Processar pagamentos e gerenciar assinaturas",
                "Gerar conteúdo por meio de inteligência artificial com base nos seus insumos",
                "Publicar conteúdo nas redes sociais conectadas, conforme sua solicitação",
                "Enviar notificações sobre o serviço, atualizações e alertas relacionados à sua conta",
                "Melhorar continuamente a plataforma e desenvolver novos recursos",
                "Detectar e prevenir fraudes, abusos e violações de segurança",
                "Cumprir obrigações legais e regulatórias aplicáveis",
                "Exercer ou defender direitos em processos administrativos ou judiciais",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-orange-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              4. Base Legal (LGPD)
            </h2>
            <p className="mb-4">
              O tratamento dos seus dados pessoais está fundamentado nas seguintes hipóteses previstas no art. 7º da LGPD:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                <p className="mb-1 font-medium text-[#f5f5f5]">Execução de contrato (art. 7º, V)</p>
                <p>Tratamento necessário para a prestação dos serviços contratados, incluindo autenticação, armazenamento de dados, publicação de conteúdo e processamento de pagamentos.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                <p className="mb-1 font-medium text-[#f5f5f5]">Legítimo interesse (art. 7º, IX)</p>
                <p>Melhorias contínuas da plataforma, segurança, prevenção a fraudes e comunicações sobre o serviço, desde que não violem seus direitos e liberdades fundamentais.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                <p className="mb-1 font-medium text-[#f5f5f5]">Consentimento (art. 7º, I)</p>
                <p>Para finalidades específicas não cobertas pelas bases acima, como envio de comunicações de marketing. O consentimento pode ser revogado a qualquer momento.</p>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                <p className="mb-1 font-medium text-[#f5f5f5]">Cumprimento de obrigação legal (art. 7º, II)</p>
                <p>Retenção de dados para fins fiscais, contábeis e atendimento a requisições de autoridades competentes.</p>
              </div>
            </div>
          </section>

          {/* 5 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              5. Compartilhamento de Dados
            </h2>
            <p className="mb-4">
              Seus dados podem ser compartilhados com os seguintes fornecedores e parceiros, estritamente na medida necessária para a prestação dos serviços:
            </p>
            <div className="space-y-3">
              {[
                {
                  name: "Clerk",
                  role: "Autenticação e gerenciamento de identidade",
                  detail: "Armazena e gerencia credenciais de acesso, sessões e dados de perfil.",
                },
                {
                  name: "Stripe",
                  role: "Processamento de pagamentos",
                  detail: "Responsável pelo processamento seguro de cobranças, assinaturas e histórico financeiro.",
                },
                {
                  name: "Anthropic / Google",
                  role: "Inteligência artificial",
                  detail: "Seus insumos (prompts e contextos) são enviados para modelos de linguagem a fim de gerar conteúdo. Consulte as políticas de privacidade de cada fornecedor.",
                },
                {
                  name: "Vercel",
                  role: "Hospedagem e infraestrutura",
                  detail: "Plataforma de implantação e distribuição da aplicação web.",
                },
                {
                  name: "Pusher",
                  role: "Comunicação em tempo real",
                  detail: "Utilizado para notificações e atualizações em tempo real dentro da plataforma.",
                },
                {
                  name: "Neon / Prisma",
                  role: "Banco de dados",
                  detail: "Armazenamento persistente dos dados da plataforma em banco de dados PostgreSQL gerenciado.",
                },
              ].map((item) => (
                <div key={item.name} className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                  <p className="mb-1">
                    <strong className="text-orange-500">{item.name}</strong>{" "}
                    <span className="text-[#9ca3af]">— {item.role}</span>
                  </p>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              Não vendemos, alugamos ou comercializamos seus dados pessoais com terceiros para fins de marketing. O compartilhamento ocorre apenas com os prestadores de serviço listados acima e, quando exigido, com autoridades públicas.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              6. Retenção de Dados
            </h2>
            <p className="mb-3">
              Mantemos seus dados pessoais pelo período necessário para as finalidades descritas nesta política:
            </p>
            <ul className="space-y-2 text-sm list-none">
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[#f5f5f5]">Dados de conta e uso:</strong> enquanto sua conta permanecer ativa na plataforma.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[#f5f5f5]">Dados fiscais e financeiros:</strong> por 5 (cinco) anos após o encerramento da conta, em cumprimento às obrigações legais tributárias e contábeis (Código Tributário Nacional e legislação correlata).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[#f5f5f5]">Logs de acesso:</strong> por 6 (seis) meses, conforme exigido pelo Marco Civil da Internet (Lei nº 12.965/2014).
                </span>
              </li>
            </ul>
            <p className="mt-3 text-sm">
              Após o término dos prazos acima, os dados serão excluídos de forma segura ou anonimizados.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              7. Seus Direitos como Titular
            </h2>
            <p className="mb-4">
              Nos termos da LGPD, você possui os seguintes direitos em relação aos seus dados pessoais:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { right: "Acesso", desc: "Confirmar a existência de tratamento e obter cópia dos seus dados." },
                { right: "Correção", desc: "Solicitar a atualização de dados incompletos, inexatos ou desatualizados." },
                { right: "Anonimização ou exclusão", desc: "Solicitar a eliminação de dados desnecessários ou tratados em desconformidade." },
                { right: "Portabilidade", desc: "Receber seus dados em formato estruturado e interoperável." },
                { right: "Revogação do consentimento", desc: "Retirar o consentimento a qualquer momento, sem prejuízo das atividades anteriores." },
                { right: "Oposição", desc: "Opor-se ao tratamento realizado com fundamento em outras bases legais, em casos de descumprimento." },
                { right: "Informação", desc: "Saber com quais entidades seus dados são compartilhados." },
                { right: "Revisão de decisões automatizadas", desc: "Solicitar revisão de decisões tomadas exclusivamente por meios automatizados." },
              ].map((item) => (
                <div key={item.right} className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm">
                  <p className="mb-1 font-medium text-[#f5f5f5]">{item.right}</p>
                  <p className="text-[#9ca3af]">{item.desc}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              Para exercer seus direitos, entre em contato pelo e-mail{" "}
              <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                contato@demandou.com
              </a>
              . Responderemos em até 15 dias úteis, conforme prazo previsto na LGPD.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              8. Cookies e Rastreamento
            </h2>
            <p className="mb-3">
              Utilizamos cookies e tecnologias similares para garantir o funcionamento da plataforma e melhorar sua experiência:
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">Cookies essenciais</h3>
                <p>Necessários para autenticação, segurança de sessão e funcionamento básico da plataforma. Não podem ser desativados.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">Cookies de desempenho</h3>
                <p>Coletam informações anônimas sobre como os usuários interagem com a plataforma, permitindo identificar e corrigir problemas.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[#f5f5f5]">Cookies de terceiros</h3>
                <p>Nossos provedores de serviço (como Clerk e Stripe) podem definir seus próprios cookies. Consulte as políticas de privacidade de cada fornecedor para mais informações.</p>
              </div>
            </div>
            <p className="mt-3 text-sm">
              Você pode configurar seu navegador para recusar cookies, mas isso pode afetar o funcionamento de partes da plataforma.
            </p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              9. Segurança dos Dados
            </h2>
            <p className="mb-3">
              Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra acesso não autorizado, perda, alteração ou divulgação indevida, incluindo:
            </p>
            <ul className="space-y-2 text-sm list-none">
              {[
                "Criptografia de dados em trânsito (TLS/HTTPS) e em repouso",
                "Controle de acesso baseado em funções (RBAC), com princípio do menor privilégio",
                "Autenticação gerenciada por fornecedor especializado (Clerk)",
                "Monitoramento contínuo de atividades suspeitas",
                "Banco de dados hospedado em infraestrutura segura e gerenciada (Neon)",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-orange-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Em caso de incidente de segurança que possa acarretar risco ou dano relevante a você, notificaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados nos prazos legais aplicáveis.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              10. Menores de Idade
            </h2>
            <p className="text-sm">
              A plataforma demandou é destinada exclusivamente a pessoas com{" "}
              <strong className="text-[#f5f5f5]">18 anos ou mais</strong>. Não coletamos conscientemente dados pessoais de menores de 18 anos. Caso identifiquemos que dados de um menor foram fornecidos sem autorização, os excluiremos imediatamente. Se você acredita que isso ocorreu, entre em contato com a gente pelo e-mail{" "}
              <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                contato@demandou.com
              </a>
              .
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              11. Alterações nesta Política
            </h2>
            <p className="mb-3 text-sm">
              Podemos atualizar esta Política de Privacidade periodicamente para refletir mudanças nos nossos serviços, na legislação aplicável ou nas nossas práticas de tratamento de dados.
            </p>
            <p className="text-sm">
              Quando realizarmos alterações relevantes, notificaremos você por e-mail ou por meio de aviso destacado na plataforma com antecedência mínima de{" "}
              <strong className="text-[#f5f5f5]">30 dias</strong> antes da entrada em vigor. O uso continuado da plataforma após esse prazo implica a aceitação da nova versão.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[#f5f5f5]">
              12. Contato e DPO
            </h2>
            <p className="mb-3 text-sm">
              Para dúvidas, solicitações relacionadas aos seus dados pessoais ou para exercer seus direitos como titular, entre em contato com nosso Encarregado pelo Tratamento de Dados Pessoais (DPO):
            </p>
            <div className="rounded-lg border border-white/10 bg-white/5 p-5 text-sm space-y-1">
              <p><span className="text-[#9ca3af]">Empresa:</span> DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</p>
              <p><span className="text-[#9ca3af]">E-mail:</span>{" "}
                <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                  contato@demandou.com
                </a>
              </p>
              <p><span className="text-[#9ca3af]">Endereço:</span> Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150</p>
            </div>
            <p className="mt-3 text-sm">
              Você também pode apresentar reclamação à{" "}
              <strong className="text-[#f5f5f5]">Autoridade Nacional de Proteção de Dados (ANPD)</strong> em{" "}
              <a
                href="https://www.gov.br/anpd"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-500 hover:underline"
              >
                www.gov.br/anpd
              </a>
              .
            </p>
          </section>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 text-center text-xs text-[#9ca3af]">
        <p>DEMANDOU TECNOLOGIA DA INFORMACAO LTDA — CNPJ 66.140.770/0001-48</p>
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
