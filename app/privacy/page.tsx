import type { Metadata } from "next";
import Link from "next/link";
import { BrandMarkImg } from "@/components/brand-mark";

export const metadata: Metadata = {
  title: "Política de Privacidade da demandou",
  description:
    "Saiba como a demandou coleta, utiliza e protege seus dados pessoais em conformidade com a LGPD (Lei nº 13.709/2018).",
};

export default function PrivacyPage() {
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
            Política de Privacidade
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Última atualização: 06/10/2026
          </p>
        </div>

        {/* Cor do texto pelo token do tema (01/10): o cinza fixo #d1d5db era
            do tema escuro e sumia no fundo claro que virou o padrão. */}
        <div className="space-y-10 text-[var(--text-muted)] leading-relaxed">

          {/* 1 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              1. Identificação do Controlador
            </h2>
            <p className="mb-3">
              Esta Política de Privacidade é aplicável à plataforma{" "}
              <strong className="text-[var(--text-primary)]">demandou</strong>, operada por:
            </p>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-5 space-y-1 text-sm">
              <p><span className="text-[var(--text-muted)]">Razão Social:</span> DEMANDOU TECNOLOGIA DA INFORMACAO LTDA</p>
              <p><span className="text-[var(--text-muted)]">Nome Fantasia:</span> DEMANDOU</p>
              <p><span className="text-[var(--text-muted)]">CNPJ:</span> 66.140.770/0001-48</p>
              <p><span className="text-[var(--text-muted)]">Endereço:</span> Rua Pais Leme, 215, Conj. 1713, Pinheiros, São Paulo/SP, CEP 05.424-150</p>
              <p><span className="text-[var(--text-muted)]">Natureza Jurídica:</span> Sociedade Empresária Limitada (ME)</p>
              <p><span className="text-[var(--text-muted)]">E-mail:</span>{" "}
                <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                  contato@demandou.com
                </a>
              </p>
            </div>
            {/* Papéis separados em 02/10/2026, para bater com a cláusula 13.2
                da minuta das Condições Gerais de Contratação. */}
            <p className="mt-3 text-sm">
              Para os fins da Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais, LGPD), a demandou atua como{" "}
              <strong className="text-[var(--text-primary)]">controladora</strong> dos dados de cadastro, cobrança, acesso e uso da conta, e dos dados do gêmeo digital, cujo consentimento é dado pela própria pessoa (item 2.9).
            </p>
            <p className="mt-3 text-sm">
              Já os dados pessoais que estão <strong className="text-[var(--text-primary)]">dentro do conteúdo do cliente</strong>, como pessoas que aparecem nas gravações ou clientes citados em posts, são de responsabilidade da empresa cliente, que é a controladora deles. Para esses dados, a demandou atua como{" "}
              <strong className="text-[var(--text-primary)]">operadora</strong>: trata apenas para executar o serviço, conforme as instruções do cliente, e encaminha a ele os pedidos de titulares que chegarem a nós.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              2. Dados que Coletamos
            </h2>
            <p className="mb-4">
              Coletamos as seguintes categorias de dados pessoais durante o uso da plataforma:
            </p>
            <div className="space-y-4">
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.1 Dados de cadastro</h3>
                <p className="text-sm">
                  Nome completo, endereço de e-mail e senha, fornecidos no momento do registro. A autenticação é própria da plataforma e a senha é armazenada exclusivamente na forma de hash criptográfico, nunca em texto legível.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.2 Dados de uso</h3>
                <p className="text-sm">
                  Informações sobre como você utiliza a plataforma: páginas acessadas, funcionalidades utilizadas, frequência de acesso, logs de erros e dados de diagnóstico.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.3 Conexão das suas redes sociais</h3>
                <p className="text-sm">
                  Quando você conecta uma rede, recebemos dela um token de acesso e os dados mínimos para identificar a conta conectada. As redes suportadas e o que recebemos de cada uma:
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li><strong className="text-[var(--text-primary)]">LinkedIn:</strong> seu identificador, nome, foto e e-mail do perfil, e a lista das Páginas de empresa em que você é administrador. Usados para publicar o que você aprovou e para mostrar na tela em qual conta a publicação vai sair.</li>
                  <li><strong className="text-[var(--text-primary)]">Instagram e Facebook (Meta):</strong> seu identificador, nome de usuário e foto, e a lista das Páginas e contas profissionais que você administra. Usados para publicar o que você aprovou nessas contas.</li>
                  <li><strong className="text-[var(--text-primary)]">YouTube (Google):</strong> o identificador e o nome do seu canal, para enviar os vídeos que você aprovou.</li>
                  <li><strong className="text-[var(--text-primary)]">X (Twitter):</strong> seu identificador e nome de usuário, para publicar o que você aprovou.</li>
                  <li><strong className="text-[var(--text-primary)]">TikTok:</strong> seu identificador, nome de exibição, nome de usuário e foto, e as opções de publicação da sua conta (quem pode ver, se comentários, dueto e costura estão liberados e a duração máxima de vídeo). Usados para publicar os vídeos que você aprovou, com as escolhas que você fez na hora de publicar, e para mostrar em qual conta o vídeo vai sair.</li>
                </ul>
                <p className="mt-2 text-sm">
                  Nada é publicado sem a sua aprovação explícita de cada peça. Não lemos, não armazenamos e não exibimos comentários, mensagens ou dados de perfil de outras pessoas. Não usamos esses dados para publicidade, e o conteúdo de uma conta nunca é mostrado a outro cliente.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.4 Conteúdo gerado</h3>
                <p className="text-sm">
                  Textos, rascunhos, posts e demais conteúdos criados ou editados por você na plataforma, incluindo insumos fornecidos para a geração de conteúdo por inteligência artificial.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.5 Vídeos e áudio</h3>
                <p className="text-sm">
                  Arquivos de vídeo enviados por você para transformação em conteúdo, e as transcrições de áudio geradas a partir deles. Os arquivos são armazenados em repositório privado, sem acesso público, e processados apenas para as finalidades do serviço.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.6 Dados da demonstração pública</h3>
                <p className="text-sm">
                  Na demonstração gratuita da página inicial, o texto e a profissão informados são enviados ao provedor de IA para gerar o exemplo e ficam registrados junto com o resultado, para operação e melhoria do serviço.
                </p>
                <p className="mt-2 text-sm">
                  Se você pedir para receber os textos por e-mail, o e-mail e o nome que você informar ficam gravados na mesma rodada, ou seja, vinculados ao texto que você escreveu. O telefone é opcional: ele só é gravado se você preencher o campo e marcar a caixa de consentimento para contato por WhatsApp, que vem desmarcada.
                </p>
                <p className="mt-2 text-sm">
                  Finalidades: entregar a você os textos gerados e, havendo consentimento, falar com você sobre a plataforma. Base legal: consentimento (art. 7º, I, da LGPD), manifestado quando você preenche o formulário, e registrado separadamente para o contato por WhatsApp. Você pode revogar o consentimento e pedir a exclusão a qualquer momento pelo contato da seção 13.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.7 Dados de pagamento</h3>
                <p className="text-sm">
                  Dados de cobrança e histórico de transações, processados diretamente pelo Stripe. O cartão é informado no checkout do Stripe na contratação anual e fica guardado por ele, para a cobrança à vista e para as renovações. Não recebemos nem armazenamos o número do cartão em nossos servidores: guardamos apenas o identificador de cliente do Stripe, o plano contratado e a situação da assinatura.
                </p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.8 Dados técnicos</h3>
                <p className="text-sm">
                  Endereço IP, tipo e versão de navegador, sistema operacional, fuso horário e outros dados técnicos coletados automaticamente.
                </p>
              </div>
              {/* O GÊMEO DIGITAL (01/10/2026). Rosto e voz são dado biométrico,
                  que a Lei Geral de Proteção de Dados trata como dado sensível:
                  a política precisa dizer o que é coletado, para quê, com quem
                  é compartilhado, até quando fica e como sai. Âncora própria
                  porque os Termos de Uso (seção 9) apontam para cá. */}
              <div id="gemeo" className="scroll-mt-24">
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.9 Rosto e voz do gêmeo digital (dado biométrico)</h3>
                <p className="text-sm">
                  Só se você cadastrar um gêmeo digital: de 1 a 5 fotos do seu rosto (das quais recortamos o rosto usado no vídeo), uma amostra da sua voz, a voz clonada a partir dela, e o vídeo da sua autorização, com o nome, a data e o texto que você leu. Rosto e voz usados para identificar e reproduzir uma pessoa são{" "}
                  <strong className="text-[var(--text-primary)]">dados pessoais sensíveis</strong> (art. 5º, II, da LGPD).
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li><strong className="text-[var(--text-primary)]">Finalidade:</strong> exclusivamente gerar os vídeos do gêmeo que você pedir no seu projeto e conferir que a autorização foi gravada pela própria pessoa. Não usamos esses dados para treinar modelos, para publicidade, nem para identificar você em outro lugar.</li>
                  <li><strong className="text-[var(--text-primary)]">Base legal:</strong> o seu consentimento específico e destacado (art. 11, I, da LGPD), dado na autorização gravada.</li>
                  <li><strong className="text-[var(--text-primary)]">Retenção:</strong> até você revogar o gêmeo (ou apagar o projeto, ou encerrar o contrato, que revogam junto).</li>
                  <li><strong className="text-[var(--text-primary)]">Exclusão:</strong> ao revogar, apagamos as fotos, a amostra de voz, a voz clonada (inclusive na ElevenLabs) e o vídeo da autorização. Fica só o registro de que você autorizou e revogou, com as datas, para provar que o uso foi autorizado enquanto valeu. Os vídeos já gerados ficam no projeto até você apagá-los.</li>
                  <li><strong className="text-[var(--text-primary)]">Operadores:</strong> a ElevenLabs recebe a amostra para clonar a voz e o texto de cada vídeo para falar com ela; a fal.ai recebe a foto do rosto e o áudio de cada trecho para gerar o vídeo. As duas atuam só sob as nossas instruções e para essa finalidade (seção 5).</li>
                </ul>
              </div>
              {/* A coleta pela Apify (02/10/2026): lib/referencias/apify.ts e
                  lib/analytics/fonte-apify.ts. Só números saem da medição;
                  nomes de quem curtiu ou comentou não são gravados. */}
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.10 Perfis públicos de referência e números das publicações</h3>
                <p className="text-sm">
                  Quando você indica perfis públicos de referência (do seu mercado ou de concorrentes) para a pesquisa, coletamos, por meio da Apify, apenas publicações públicas desses perfis, com textos, legendas e números de curtidas, comentários e visualizações, para analisar o que funciona no seu mercado. Também usamos essa coleta para ler os números das publicações do seu próprio perfil quando a rede não os entrega pela conexão oficial.
                </p>
                <p className="mt-2 text-sm">
                  Não gravamos comentários, nomes ou perfis de quem curtiu, comentou ou foi marcado: guardamos só a publicação e os números da conta de referência ou do seu post. A base legal é o legítimo interesse (art. 7º, IX, da LGPD), limitado a dados que os próprios titulares tornaram públicos (art. 7º, § 4º), e a finalidade é só a análise de conteúdo para o seu projeto. O conteúdo coletado serve de referência e não é republicado.
                </p>
              </div>
              {/* O PRODUTO APRENDE COM QUEM USA (06/10/2026): iguais aos itens
                  11.6 a 11.8 dos Termos e às cláusulas 11.9 a 11.11, 13.2(d) e
                  17.4 a 17.8 das Condições Gerais (versão 1.3; na 1.4, de 06/10, são 10.9 a 10.11, 12.2(d) e 16.4 a 16.8). */}
              <div id="interacoes" className="scroll-mt-24">
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.11 Suas interações e a memória do seu projeto</h3>
                <p className="text-sm">
                  Guardamos o que você e a sua equipe fazem na plataforma: configurações, pedidos, ajustes, aprovações, recusas, comentários no chat dos cards, chamados de suporte, materiais enviados, campanhas, pesquisas e os resultados das publicações. Isso forma a memória do seu projeto, que a plataforma consulta para que o próximo roteiro, a próxima arte e a próxima edição já partam do que você aprovou e recusou antes.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li><strong className="text-[var(--text-primary)]">Finalidade:</strong> personalizar o conteúdo do seu próprio projeto. A memória é exclusiva da sua conta, nunca é mostrada a outro cliente e nunca é usada para gerar conteúdo para outra pessoa.</li>
                  <li><strong className="text-[var(--text-primary)]">Papel e base legal:</strong> a memória faz parte do conteúdo do cliente. Para os dados pessoais que estão nela, a demandou atua como operadora (seção 1); para os seus dados de usuário, a base é a execução do contrato (art. 7º, V, da LGPD).</li>
                  <li><strong className="text-[var(--text-primary)]">Seus controles:</strong> consultar, corrigir e apagar itens da memória, na plataforma quando o recurso estiver disponível ou pelo e-mail da seção 13, e pedir uma cópia dela.</li>
                  <li><strong className="text-[var(--text-primary)]">Retenção:</strong> enquanto o contrato estiver ativo; no encerramento, segue os mesmos 30 dias para baixar e até 60 dias para eliminar do restante do conteúdo (seção 6).</li>
                </ul>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.12 Comentários e pedidos que melhoram o produto para todos</h3>
                <p className="text-sm">
                  Os comentários do chat, os chamados de suporte, os pedidos de design e os padrões de aprovação e recusa também ajudam a melhorar a demandou para todos os clientes. Um modelo automático de decisão classifica cada comentário (erro do produto, pedido de ajuste, dúvida de uso) e agrupa os parecidos, e a equipe usa esses grupos para corrigir erros, ajustar as instruções e os padrões da plataforma e decidir o que construir. Essa classificação não gera nenhum efeito sobre a sua conta, o seu plano ou o seu conteúdo.
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  <li><strong className="text-[var(--text-primary)]">O que a equipe vê:</strong> o trecho do comentário e o tipo de tela em que ele foi feito, sem o nome da conta e sem e-mail ou telefone. O registro guarda a qual conta pertence só para podermos responder a você e apagar o que você pedir.</li>
                  <li><strong className="text-[var(--text-primary)]">O que nunca entra:</strong> a sua marca, o seu logotipo, rosto, voz, gêmeo digital, gravações, fotos e materiais. Não mostramos o comentário de um cliente a outro, não vendemos esses dados e não os usamos para treinar modelos de inteligência artificial (item 5.3).</li>
                  <li><strong className="text-[var(--text-primary)]">Papel e base legal:</strong> nesse uso a demandou é controladora dos trechos de comentário, e a base é o legítimo interesse (art. 7º, IX, da LGPD) de melhorar o serviço que você contratou, com a coleta reduzida ao mínimo e os cuidados acima.</li>
                  <li><strong className="text-[var(--text-primary)]">Como não participar:</strong> você pode se opor a esse uso a qualquer momento pelo e-mail da seção 13, sem mudança de preço nem de plano. A oposição não desliga a memória do seu projeto (item 2.11), que serve só a você.</li>
                  <li><strong className="text-[var(--text-primary)]">Retenção:</strong> os trechos ficam por até 24 meses, ou até o fim do contrato somado aos prazos da seção 6, o que vier primeiro. Depois, ficam só contagens sem texto, que não identificam ninguém.</li>
                </ul>
              </div>
              <div id="biblioteca" className="scroll-mt-24">
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">2.13 Biblioteca de design</h3>
                <p className="text-sm">
                  A biblioteca de design é a galeria de modelos de vídeo e de imagem que fica disponível para todos os clientes. Quando você descreve um design, registramos nela apenas a descrição do visual: um nome curto, uma descrição e as instruções de estilo. A prévia é gerada com conteúdo de exemplo, como uma pessoa anônima e uma frase de exemplo, e a galeria não mostra quem criou o modelo.
                </p>
                <p className="mt-2 text-sm">
                  Nunca vão para a biblioteca: a sua marca, logotipo, nome da empresa, cores e identidade visual próprias, o rosto, a voz e o gêmeo digital de qualquer pessoa, as suas gravações, fotos, materiais, textos das peças, a memória do projeto e qualquer dado de contato. Se o pedido citar marca, pessoa ou contato, esses trechos ficam só no seu projeto. Você pode pedir que um design fique só no seu projeto e pode retirar da galeria um design que nasceu do seu pedido, como descrito no item 11.8 dos Termos de Uso.
                </p>
              </div>
            </div>
          </section>

          {/* 3 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              3. Finalidade do Tratamento
            </h2>
            <p className="mb-3">Utilizamos seus dados pessoais para as seguintes finalidades:</p>
            <ul className="space-y-2 text-sm list-none">
              {[
                "Operar e fornecer os serviços da plataforma demandou",
                "Autenticar sua identidade e gerenciar sua conta, incluindo a confirmação do seu e-mail no cadastro",
                "Controlar o plano contratado e seus limites, e avisar sobre a renovação e o saldo de créditos",
                "Pesquisar referências públicas e medir os números das publicações, quando você usar esses recursos (item 2.10)",
                "Processar pagamentos e gerenciar assinaturas",
                "Gerar conteúdo por meio de inteligência artificial com base nos seus insumos",
                "Gerar os vídeos do seu gêmeo digital, quando você o cadastrar e autorizar (item 2.9)",
                "Publicar conteúdo nas redes sociais conectadas, conforme sua solicitação",
                "Enviar notificações sobre o serviço, atualizações e alertas relacionados à sua conta",
                "Manter a memória do seu projeto, para que o conteúdo seguinte parta do que você aprovou e recusou antes (item 2.11)",
                "Melhorar continuamente a plataforma e desenvolver novos recursos, com dados de uso agregados e com trechos de comentários e pedidos sem identificação, sem treinar modelos com o seu conteúdo (itens 2.12 e 5.3)",
                "Manter a biblioteca de design, só com a descrição do visual e nunca com a sua marca, rosto, voz ou materiais (item 2.13)",
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
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              4. Base Legal (LGPD)
            </h2>
            <p className="mb-4">
              O tratamento dos seus dados pessoais está fundamentado nas seguintes hipóteses previstas no art. 7º da LGPD:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Execução de contrato (art. 7º, V)</p>
                <p>Tratamento necessário para a prestação dos serviços contratados, incluindo autenticação, armazenamento de dados, memória do projeto (item 2.11), publicação de conteúdo e processamento de pagamentos.</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Legítimo interesse (art. 7º, IX)</p>
                <p>Melhorias contínuas da plataforma, inclusive a partir dos seus comentários, chamados e pedidos de design, sem identificação (item 2.12), a biblioteca de design (item 2.13), segurança, prevenção a fraudes e comunicações sobre o serviço, desde que não violem seus direitos e liberdades fundamentais. Você pode se opor ao uso dos seus comentários para melhorar o produto a qualquer momento, sem mudança de preço nem de plano.</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Consentimento (art. 7º, I)</p>
                <p>Para finalidades específicas não cobertas pelas bases acima, como o envio de comunicações de marketing, a entrega dos textos gerados na demonstração pública e o contato comercial por WhatsApp, quando você marca a caixa correspondente. O consentimento pode ser revogado a qualquer momento.</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Consentimento específico para dado sensível (art. 11, I)</p>
                <p>Para o rosto e a voz do gêmeo digital (item 2.9). O consentimento é dado pela própria pessoa, na autorização gravada em vídeo, e vale só para essa finalidade. Revogar apaga os dados, conforme o item 2.9.</p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1 font-medium text-[var(--text-primary)]">Cumprimento de obrigação legal (art. 7º, II)</p>
                <p>Retenção de dados para fins fiscais, contábeis e atendimento a requisições de autoridades competentes.</p>
              </div>
            </div>
          </section>

          {/* 5 */}
          {/* Lista conferida no código e nos nomes das variáveis de ambiente em
              02/10/2026, igual ao Anexo II da minuta do contrato. O Pusher está
              nas dependências mas não é usado (sem chave e sem chamada), por
              isso não aparece; entrou em uso, entra aqui. */}
          <section id="fornecedores" className="scroll-mt-24">
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              5. Compartilhamento de Dados
            </h2>
            <p className="mb-4">
              Seus dados podem ser compartilhados com os seguintes fornecedores e parceiros, estritamente na medida necessária para a prestação dos serviços:
            </p>
            <div className="space-y-3">
              {[
                {
                  name: "Stripe",
                  role: "Processamento de pagamentos",
                  detail: "Responsável pelo processamento seguro de cobranças, assinaturas e histórico financeiro.",
                },
                {
                  name: "Anthropic",
                  role: "Inteligência artificial: pesquisa, roteiro e redação",
                  detail: "Recebe textos, transcrições e instruções do projeto para pesquisar o tema e escrever posts, roteiros e legendas.",
                },
                {
                  name: "OpenAI",
                  role: "Inteligência artificial: imagens do carrossel",
                  detail: "Recebe os textos e as instruções das artes para gerar as imagens do carrossel.",
                },
                {
                  name: "Google (Gemini e Veo)",
                  role: "Inteligência artificial: texto, imagem e vídeo",
                  detail: "Recebe textos, instruções e imagens de referência para gerar textos, imagens e os vídeos por inteligência artificial.",
                },
                {
                  name: "TypeSafe",
                  role: "Inteligência artificial: modelo de decisão",
                  detail: "Não escreve texto: responde perguntas de escolha e classificação sobre o seu projeto, como quais trechos da gravação entram na edição, se a arte confere com o texto, se um pedido de design já existe na biblioteca e de que tipo é um comentário do chat. Recebe só o trecho necessário para cada pergunta.",
                },
                {
                  name: "Higgsfield",
                  role: "Efeitos e cenas na edição",
                  detail: "Recebe quadros dos seus vídeos e as instruções do estilo escolhido para gerar aberturas, cenas de apoio e imagens.",
                },
                {
                  name: "Apify",
                  role: "Coleta de publicações públicas",
                  detail: "Recebe os endereços dos perfis públicos de referência que você indicar, e o link das suas publicações, para trazer as publicações públicas e os números (item 2.10).",
                },
                {
                  name: "Blotato",
                  role: "Intermediário técnico de publicação",
                  detail: "Em algumas redes, enquanto a aprovação do nosso aplicativo na rede não sai, recebe a peça que você aprovou e a identificação da conta conectada, só para publicá-la.",
                },
                {
                  name: "Deepgram",
                  role: "Transcrição de áudio",
                  detail: "O áudio dos vídeos enviados por você é processado para gerar a transcrição usada na criação de conteúdo. Cada pedido vai marcado para ficar fora do programa de treino da Deepgram, e o áudio fica lá só pelo tempo do processamento.",
                },
                {
                  name: "ElevenLabs",
                  role: "Voz do gêmeo digital",
                  detail: "Só se você cadastrar um gêmeo: recebe a amostra da sua voz para criar a voz clonada e o texto de cada vídeo para falar com ela. A voz clonada é apagada lá quando você revoga o gêmeo.",
                },
                {
                  name: "fal.ai",
                  role: "Vídeo do gêmeo digital",
                  detail: "Só se você cadastrar um gêmeo: recebe a foto do seu rosto e o áudio de cada trecho para gerar o vídeo que você pediu.",
                },
                {
                  name: "Supabase",
                  role: "Banco de dados",
                  detail: "Armazenamento persistente dos dados da plataforma em banco de dados PostgreSQL gerenciado.",
                },
                {
                  name: "Vercel",
                  role: "Hospedagem, infraestrutura e arquivos",
                  detail: "Plataforma de implantação da aplicação web e armazenamento privado dos arquivos de vídeo enviados.",
                },
                {
                  name: "Railway",
                  role: "Processamento de vídeo",
                  detail: "Servidor onde os cortes e o vídeo completo são renderizados. Recebe o arquivo enviado por você apenas durante o processamento.",
                },
                {
                  name: "Resend",
                  role: "Envio de e-mail",
                  detail: "Entrega dos e-mails transacionais da plataforma, como confirmação de cadastro, aviso de renovação e avisos de publicação. Recebe o seu nome, e-mail e o texto da mensagem.",
                },
                {
                  name: "LinkedIn, Meta (Facebook e Instagram), Google (YouTube), X e TikTok",
                  role: "Publicação nas suas redes",
                  detail: "Recebem o conteúdo que VOCÊ aprovou, para publicá-lo nas contas que você conectou. O envio acontece apenas nas contas que você escolheu e no momento que você agendou.",
                },
                {
                  name: "Meta, Google, LinkedIn e TikTok",
                  role: "Medição de anúncios",
                  detail: "Somente se você aceitar os cookies de anúncio. Recebem dados de navegação nas nossas páginas públicas para medir de onde vêm os visitantes. Nunca recebem o conteúdo dos seus projetos, suas gravações ou os dados das suas redes conectadas.",
                },
              ].map((item) => (
                <div key={item.name} className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                  <p className="mb-1">
                    <strong className="text-orange-500">{item.name}</strong>{" "}
                    <span className="text-[var(--text-muted)]">· {item.role}</span>
                  </p>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm">
              Não vendemos, alugamos ou comercializamos seus dados pessoais com terceiros para fins de marketing. O compartilhamento ocorre apenas com os prestadores de serviço listados acima e, quando exigido, com autoridades públicas.
            </p>

            {/* Pedidos de autoridade pública.
                Escrita em 14/09/2026, no App Review da Meta. A tela de
                tratamento de dados pergunta quais processos a empresa aplica a
                pedidos de autoridade, e a política não descrevia nenhum: dizia
                só que o compartilhamento acontece "quando exigido". Marcar as
                caixas sem ter o processo seria declaração sem lastro, então o
                Bruno decidiu adotar os quatro compromissos e eles passam a
                viver aqui, onde o cliente e o revisor conseguem ler. */}
            <h3 className="mt-6 mb-3 text-base font-semibold text-[var(--text-primary)]">
              5.1. Pedidos de autoridades públicas
            </h3>
            <p className="mb-3 text-sm">
              Quando uma autoridade pública nos pede dados pessoais de um cliente ou de terceiros, aplicamos quatro regras, sempre, em qualquer país:
            </p>
            <ul className="mb-3 list-disc space-y-2 pl-5 text-sm">
              <li>
                <strong className="text-[var(--text-primary)]">Analisamos a legitimidade do pedido.</strong> Conferimos se ele vem de autoridade competente, se indica a base legal e se descreve com precisão o que está sendo requisitado. Pedido genérico, sem base legal ou fora da competência de quem assina não é atendido como está.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Contestamos o que consideramos ilegal.</strong> Se o pedido for ilegal, desproporcional ou exceder a competência da autoridade, nós o recusamos ou o contestamos pelas vias cabíveis, em vez de cumprir por precaução.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Entregamos o mínimo necessário.</strong> Fornecemos apenas os dados estritamente descritos no pedido, pelo período nele indicado. Não ampliamos o escopo por conveniência nossa nem de quem pede.
              </li>
              <li>
                <strong className="text-[var(--text-primary)]">Registramos cada pedido.</strong> Guardamos o pedido, nossa resposta, o fundamento jurídico da decisão e quem participou dela, para que a nossa conduta seja auditável depois.
              </li>
            </ul>
            <p className="text-sm">
              Sempre que a lei permitir, avisamos o titular antes de entregar qualquer dado, para que ele possa exercer os próprios direitos. Quando a lei proibir o aviso, cumprimos a proibição e registramos o motivo.
            </p>

            {/* Transferência internacional e treino (02/10/2026), iguais às
                cláusulas 11.6 e 13.5 da minuta do contrato. */}
            <h3 className="mt-6 mb-3 text-base font-semibold text-[var(--text-primary)]">
              5.2. Transferência internacional
            </h3>
            <p className="mb-3 text-sm">
              Vários dos fornecedores acima processam dados fora do Brasil, principalmente nos Estados Unidos. Fazemos essas transferências com base nos mecanismos do art. 33 da LGPD, incluindo cláusulas contratuais com os fornecedores, conforme a regulamentação da Autoridade Nacional de Proteção de Dados (ANPD), e cada fornecedor recebe só o necessário para a sua função.
            </p>

            <h3 id="treino" className="mt-6 mb-3 scroll-mt-24 text-base font-semibold text-[var(--text-primary)]">
              5.3. Sem treino de modelos com os seus dados
            </h3>
            <p className="mb-3 text-sm">
              Não usamos o seu conteúdo nem o conteúdo gerado para treinar modelos de inteligência artificial, nossos ou de terceiros, sem o seu consentimento expresso e separado. Contratamos e configuramos os fornecedores para não usarem os seus dados para treinar modelos. Na transcrição, por exemplo, cada pedido à Deepgram vai marcado para ficar fora do programa de treino dela.
            </p>
            <p className="text-sm">
              Treinar um modelo é diferente de melhorar a plataforma. Para medir e melhorar a demandou, usamos dados de uso agregados, como volume de operações, tempo de processamento e taxas de erro, e os trechos de comentários, chamados e pedidos de design descritos no item 2.12, sem identificação, para corrigir erros, ajustar as nossas instruções e os nossos padrões e decidir o que construir. Nenhum desses dados é enviado a um fornecedor para treinar modelo.
            </p>
          </section>

          {/* 6 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              6. Retenção de Dados
            </h2>
            <p className="mb-3">
              Mantemos seus dados pessoais pelo período necessário para as finalidades descritas nesta política:
            </p>
            <ul className="space-y-2 text-sm list-none">
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Dados de conta e uso:</strong> enquanto sua conta permanecer ativa na plataforma.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Conteúdo, gravações e acessos às redes, depois do fim do contrato:</strong> você tem 30 (trinta) dias para baixar o seu conteúdo; depois, eliminamos tudo em até 60 (sessenta) dias, inclusive nos fornecedores sob o nosso controle.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Dados fiscais e financeiros:</strong> por 5 (cinco) anos após o encerramento da conta, em cumprimento às obrigações legais tributárias e contábeis (Código Tributário Nacional e legislação correlata).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Logs de acesso:</strong> por 6 (seis) meses, conforme exigido pelo Marco Civil da Internet (Lei nº 12.965/2014).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Rosto e voz do gêmeo digital:</strong> até você revogar o gêmeo ou apagar o projeto; na revogação, são apagados, e fica só o registro da autorização e da revogação, com as datas (item 2.9).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Memória do projeto:</strong> enquanto o contrato estiver ativo; no encerramento, segue o prazo do conteúdo (30 dias para baixar e até 60 para eliminar), e você pode apagar itens antes disso (item 2.11).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Trechos de comentários, chamados e pedidos usados para melhorar o produto:</strong> por até 24 (vinte e quatro) meses, ou até o fim do contrato somado ao prazo do conteúdo, o que vier primeiro, ou antes, se você se opuser; depois, ficam só contagens sem texto (item 2.12).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Modelos da biblioteca de design:</strong> enquanto a biblioteca existir, porque guardam só a descrição do visual, sem dado pessoal, salvo se você retirar da galeria um modelo que nasceu do seu pedido (item 2.13).
                </span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 text-orange-500 shrink-0">•</span>
                <span>
                  <strong className="text-[var(--text-primary)]">Contato deixado na demonstração pública:</strong> por 24 (vinte e quatro) meses contados do último contato entre nós, ou até você revogar o consentimento ou pedir a exclusão, o que vier primeiro.
                </span>
              </li>
            </ul>
            <p className="mt-3 text-sm">
              Após o término dos prazos acima, os dados serão excluídos de forma segura ou anonimizados.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              7. Seus Direitos como Titular
            </h2>
            <p className="mb-4">
              Nos termos da LGPD, você possui os seguintes direitos em relação aos seus dados pessoais:
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[
                { right: "Acesso", desc: "Confirmar a existência de tratamento e obter cópia dos seus dados." },
                { right: "Correção", desc: "Solicitar a atualização de dados incompletos, inexatos ou desatualizados." },
                { right: "Anonimização ou exclusão", desc: "Solicitar a eliminação de dados desnecessários ou tratados em desconformidade." },
                { right: "Portabilidade", desc: "Receber seus dados em formato estruturado e interoperável." },
                { right: "Revogação do consentimento", desc: "Retirar o consentimento a qualquer momento, sem prejuízo das atividades anteriores." },
                { right: "Oposição", desc: "Opor-se ao tratamento realizado com fundamento em outras bases legais, em casos de descumprimento, e ao uso dos seus comentários para melhorar o produto (item 2.12), sem precisar dar motivo." },
                { right: "Informação", desc: "Saber com quais entidades seus dados são compartilhados." },
                { right: "Revisão de decisões automatizadas", desc: "Solicitar revisão de decisões tomadas exclusivamente por meios automatizados." },
              ].map((item) => (
                <div key={item.right} className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                  <p className="mb-1 font-medium text-[var(--text-primary)]">{item.right}</p>
                  <p className="text-[var(--text-muted)]">{item.desc}</p>
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
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              8. Cookies e Rastreamento
            </h2>
            <p className="mb-3">
              Utilizamos cookies e tecnologias similares para garantir o funcionamento da plataforma e melhorar sua experiência:
            </p>
            <div className="space-y-3 text-sm">
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">Cookies essenciais</h3>
                <p>Necessários para autenticação, segurança de sessão e funcionamento básico da plataforma. Não podem ser desativados.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">Cookies de desempenho</h3>
                <p>Coletam informações anônimas sobre como os usuários interagem com a plataforma, permitindo identificar e corrigir problemas.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">Cookies de terceiros</h3>
                <p>Nossos provedores de serviço (como o Stripe, no checkout) podem definir seus próprios cookies. Consulte as políticas de privacidade de cada fornecedor para mais informações.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-[var(--text-primary)]">Cookies de anúncio, só com o seu sim</h3>
                <p>
                  Usamos os pixels de medição da Meta, do Google, do LinkedIn e do TikTok nas nossas páginas públicas, para saber de qual anúncio veio cada visitante. Eles só são carregados <strong className="text-[var(--text-primary)]">depois</strong> de você aceitar no aviso que aparece na primeira visita. A base legal é o consentimento (art. 7º, I, da LGPD), e recusar não tira nenhuma funcionalidade: o site inteiro funciona igual.
                </p>
                <p className="mt-2">
                  Para mudar de ideia depois, apague os dados do site no seu navegador. O aviso aparece de novo na próxima visita e a sua nova resposta passa a valer. Dentro da plataforma, já autenticado, nenhum pixel de anúncio é carregado.
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm">
              Você pode configurar seu navegador para recusar cookies, mas isso pode afetar o funcionamento de partes da plataforma.
            </p>
          </section>

          {/*
            Exclusão, com âncora própria.

            Existe como seção numerada e endereçável de propósito: a Meta exige
            uma "Data Deletion Instructions URL" no App Review, e o Google e o
            LinkedIn perguntam a mesma coisa em campo separado do formulário.
            Apontar os três para https://demandou.com/privacy#exclusao é melhor
            que três páginas soltas que envelhecem em ritmos diferentes.
          */}
          <section id="exclusao" className="scroll-mt-24">
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              9. Como apagar seus dados
            </h2>
            <p className="mb-3">
              Você pode apagar seus dados a qualquer momento, de quatro formas, conforme o que quiser remover:
            </p>
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1">
                  <strong className="text-orange-500">Desconectar uma rede social</strong>
                </p>
                <p>
                  Dentro da plataforma, em Configurações do projeto, aba Redes sociais, clique em desconectar na rede desejada. O token de acesso é apagado do nosso banco na hora, e a partir daí não temos mais como publicar nem ler nada naquela conta. Revogar o acesso pelo painel da própria rede também funciona, e tira o nosso acesso imediatamente, mas apagar o token guardado aqui depende de a rede nos avisar da revogação: o Facebook e o Instagram avisam, e nesse caso apagamos na hora; o Google, o LinkedIn e o X não avisam, e o token fica guardado sem servir para nada até você desconectar na plataforma ou pedir a exclusão da conta.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1">
                  <strong className="text-orange-500">Revogar o gêmeo digital</strong>
                </p>
                <p>
                  Na tela do gêmeo do projeto, clique em revogar. Apagamos na hora as fotos, a amostra de voz, a voz clonada e o vídeo da autorização, e a voz clonada também é apagada na ElevenLabs. Fica só o registro de que você autorizou e revogou, com as datas.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1">
                  <strong className="text-orange-500">Apagar um projeto</strong>
                </p>
                <p>
                  Apagar o projeto remove com ele as redes conectadas, os posts, as gravações enviadas, as transcrições geradas e o gêmeo digital, se houver.
                </p>
              </div>
              <div className="rounded-lg border border-[var(--border)] bg-[var(--realce-1)] p-4 text-sm">
                <p className="mb-1">
                  <strong className="text-orange-500">Apagar a conta inteira</strong>
                </p>
                <p>
                  Escreva para{" "}
                  <strong className="text-[var(--text-primary)]">contato@demandou.com</strong> do
                  e-mail cadastrado, pedindo a exclusão. Confirmamos a identidade e apagamos tudo em
                  até 15 dias corridos, incluindo tokens, gravações, transcrições, conteúdo gerado e
                  dados cadastrais. Permanecem apenas os registros que a lei obriga a guardar, como
                  os fiscais das cobranças já emitidas.
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm">
              Em qualquer dos casos, os posts que já foram publicados nas suas redes continuam lá,
              porque passam a pertencer à sua conta naquela plataforma. Para tirá-los do ar, apague
              na própria rede.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              10. Segurança dos Dados
            </h2>
            <p className="mb-3">
              Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados pessoais contra acesso não autorizado, perda, alteração ou divulgação indevida, incluindo:
            </p>
            <ul className="space-y-2 text-sm list-none">
              {[
                "Criptografia de dados em trânsito (TLS/HTTPS) e em repouso",
                "Senhas armazenadas exclusivamente como hash criptográfico",
                "Controle de acesso com princípio do menor privilégio",
                "Arquivos de vídeo em armazenamento privado, sem acesso público",
                "Banco de dados hospedado em infraestrutura segura e gerenciada (Supabase)",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1 text-orange-500 shrink-0">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              Em caso de incidente de segurança que possa acarretar risco ou dano relevante a você, notificaremos a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares afetados nos prazos legais aplicáveis. Se o incidente puder afetar dados que estão dentro do conteúdo de uma empresa cliente, avisamos essa empresa em até 48 (quarenta e oito) horas da ciência, para que ela cumpra as obrigações dela.
            </p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              11. Menores de Idade
            </h2>
            <p className="text-sm">
              A plataforma demandou é destinada exclusivamente a pessoas com{" "}
              <strong className="text-[var(--text-primary)]">18 anos ou mais</strong>. Não coletamos conscientemente dados pessoais de menores de 18 anos. Caso identifiquemos que dados de um menor foram fornecidos sem autorização, os excluiremos imediatamente. Se você acredita que isso ocorreu, entre em contato com a gente pelo e-mail{" "}
              <a href="mailto:contato@demandou.com" className="text-orange-500 hover:underline">
                contato@demandou.com
              </a>
              .
            </p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              12. Alterações nesta Política
            </h2>
            <p className="mb-3 text-sm">
              Podemos atualizar esta Política de Privacidade periodicamente para refletir mudanças nos nossos serviços, na legislação aplicável ou nas nossas práticas de tratamento de dados.
            </p>
            <p className="text-sm">
              Quando realizarmos alterações relevantes, notificaremos você por e-mail ou por meio de aviso destacado na plataforma com antecedência mínima de{" "}
              <strong className="text-[var(--text-primary)]">30 dias</strong> antes da entrada em vigor. O uso continuado da plataforma após esse prazo implica a aceitação da nova versão.
            </p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="mb-4 text-xl font-semibold text-[var(--text-primary)]">
              13. Contato e Encarregado de Dados
            </h2>
            <p className="mb-3 text-sm">
              Para dúvidas, solicitações relacionadas aos seus dados pessoais ou para exercer seus direitos como titular, entre em contato com nosso Encarregado pelo Tratamento de Dados Pessoais (o DPO, sigla em inglês de Data Protection Officer):
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
            <p className="mt-3 text-sm">
              Você também pode apresentar reclamação à{" "}
              <strong className="text-[var(--text-primary)]">Autoridade Nacional de Proteção de Dados (ANPD)</strong> em{" "}
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
