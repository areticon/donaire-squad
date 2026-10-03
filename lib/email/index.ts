import { Resend } from "resend";
import { TRIAL_DAYS, FUNDADOR } from "@/lib/planos";
import { casca, titulo, paragrafo, botao, item, separador, escapar, MARCA } from "@/lib/email/layout";

/**
 * O envio de e-mail transacional da Demandou.
 *
 * ## Por que Resend, e não o SMTP do Titan
 *
 * O Titan já hospeda contato@demandou.com e sabe mandar e-mail, mas SMTP em
 * função serverless é uma combinação ruim: a conexão é longa e com estado, o
 * runtime da Vercel derruba socket ocioso, e o erro que aparece quando isso
 * acontece é de rede, não de e-mail. O Resend é HTTP, já está no custo fixo do
 * projeto e a dependência já estava no `package.json` desde antes, sem nunca
 * ter sido usada.
 *
 * ## Ele sobe antes da credencial existir, de propósito
 *
 * Mesmo padrão dos provedores sociais em `lib/auth`: sem `RESEND_API_KEY` o
 * módulo não quebra, ele apenas se declara desligado. Isso importa porque quem
 * liga `emailVerification` no better-auth sem ter como MANDAR o e-mail tranca
 * o cadastro inteiro: o usuário se cadastra, nunca recebe nada e nunca entra.
 * Por isso `emailHabilitado()` existe e é consultado antes de exigir
 * verificação.
 */

let _resend: Resend | null = null;

/** Se o envio está configurado. Quem exige e-mail verificado precisa checar. */
export function emailHabilitado(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function cliente(): Resend {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

/**
 * O remetente. Precisa ser de domínio verificado no Resend, senão a API
 * responde 403 e o e-mail nunca sai.
 */
function remetente(): string {
  return process.env.EMAIL_REMETENTE ?? "Demandou <contato@demandou.com>";
}

export type Email = {
  para: string;
  assunto: string;
  /** Corpo em texto puro. Obrigatório, e não um enfeite: ver o comentário. */
  texto: string;
  html?: string;
  /**
   * Anexos (01/10, convite da demonstração). O convite de calendário vai com
   * tipo "text/calendar; method=REQUEST": é isso que faz o Gmail e o Outlook
   * mostrarem os botões de aceitar, em vez de um arquivo para baixar.
   */
  anexos?: Array<{ nome: string; conteudo: string; tipo?: string }>;
};

/**
 * Manda um e-mail. Devolve se saiu, e NUNCA lança.
 *
 * Não lançar é decisão de produto, não preguiça: este envio é chamado de dentro
 * do cadastro, e uma falha do provedor de e-mail não pode derrubar o cadastro
 * de quem está entrando. O usuário fica sem o e-mail e pede outro; ele não
 * leva um erro na cara por causa de um serviço de terceiro.
 */
export async function enviarEmail(email: Email): Promise<boolean> {
  if (!emailHabilitado()) {
    console.warn(
      `[email] RESEND_API_KEY ausente, "${email.assunto}" para ${email.para} NÃO foi enviado`
    );
    return false;
  }

  try {
    const { data, error } = await cliente().emails.send({
      from: remetente(),
      to: email.para,
      subject: email.assunto,
      // Texto SEMPRE, html opcional. E-mail só-HTML pontua pior em filtro de
      // spam, e o domínio já foi marcado pelo Google como página enganosa uma
      // vez: não vale economizar quatro linhas de texto para piorar isso.
      text: email.texto,
      ...(email.html ? { html: email.html } : {}),
      ...(email.anexos?.length
        ? {
            attachments: email.anexos.map((a) => ({
              filename: a.nome,
              content: Buffer.from(a.conteudo, "utf8"),
              ...(a.tipo ? { contentType: a.tipo } : {}),
            })),
          }
        : {}),
    });

    if (error) {
      console.error(`[email] Resend recusou "${email.assunto}": ${error.message}`);
      return false;
    }
    console.log(`[email] "${email.assunto}" enviado para ${email.para} (${data?.id})`);
    return true;
  } catch (e) {
    console.error(
      `[email] falha ao enviar "${email.assunto}": ` +
        (e instanceof Error ? e.message : "motivo desconhecido")
    );
    return false;
  }
}

/**
 * BOAS-VINDAS E CONFIRMAÇÃO, na mesma peça.
 *
 * Pedido do Bruno em 22/09: "um boas-vindas misturado com validação". A troca
 * vale a pena porque o e-mail de confirmação é o ÚNICO que quase todo mundo
 * abre: ele chega no segundo em que a pessoa está mais interessada, e usá-lo
 * só para dizer "clique aqui" é desperdiçar a melhor abertura do funil.
 *
 * A ordem é deliberada: primeiro o motivo de confirmar (o que vem depois do
 * clique), depois o botão, depois o que ela ganha. Quem já ia clicar clica na
 * primeira dobra; quem estava em dúvida lê a lista e clica na segunda.
 *
 * O QUE NÃO TEM, e é de propósito: contagem regressiva, "última chance",
 * imagem de fundo, pixel de rastreio e mais de um botão. O domínio já foi
 * marcado pelo Google como página enganosa uma vez, e é exatamente esse
 * desenho que classificador de phishing pune. A sobriedade anterior não foi
 * abandonada, ela ganhou tipografia.
 *
 * A promessa do teste está escrita aqui porque é onde ela é lida: cartão
 * agora, sete dias, cancelou antes não paga. Deixar isso só no checkout é
 * deixar a pessoa descobrir a regra no momento de digitar o cartão.
 */
export function emailDeConfirmacao(nome: string, url: string, vagasDeFundador = 0): Email {
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0] || "";
  const saudacao = primeiroNome ? `Boas-vindas, ${primeiroNome}` : "Boas-vindas à Demandou";

  const texto = [
    `${saudacao}.`,
    "",
    "Falta um passo para a sua conta ficar de pé: confirmar este e-mail.",
    "",
    url,
    "",
    "O link vale por 1 hora. Passou disso, é só pedir outro na tela de entrada.",
    "",
    "Depois de confirmar, o que acontece:",
    ". Você contrata o plano combinado na demonstração, em contrato anual.",
    ". Nos primeiros 30 dias, se a empresa não publicar nada que aprovou, devolvemos tudo.",
    ". Você conta sobre a empresa uma vez, e a equipe de agentes escreve, cria a arte e publica nas redes, sem tomar a sua agenda.",
    "",
    ...(vagasDeFundador > 0
      ? [
          "",
          `Você chegou a tempo: as ${FUNDADOR.vagas} primeiras contas travam o Autoridade por R$ ${FUNDADOR.mensal} por mês, para sempre, no plano anual. ${vagasDeFundador === 1 ? "Resta 1 vaga" : `Restam ${vagasDeFundador} vagas`}.`,
        ]
      : []),
    "",
    "Se não foi você que criou esta conta, pode ignorar este e-mail. Sem a confirmação, a conta não é ativada.",
    "",
    `${MARCA.nome}`,
    MARCA.site,
  ].join("\n");

  const miolo = [
    titulo(saudacao + "."),
    paragrafo("Falta um passo para a sua conta ficar de pé: confirmar que este e-mail é seu."),
    botao("Confirmar meu e-mail", url),
    paragrafo(
      `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(url)}</span>`,
      { apagado: true, tamanho: 13 }
    ),
    paragrafo("O link vale por 1 hora. Passou disso, é só pedir outro na tela de entrada.", { apagado: true, tamanho: 13 }),
    separador(),
    paragrafo("<strong style=\"font-weight:600\">O que acontece depois</strong>", { tamanho: 15 }),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">`,
    item(
      "Você contrata o plano combinado",
      "O plano que vocês montaram na demonstração, em contrato anual."
    ),
    item(
      "Garantia de 30 dias",
      "Se nos primeiros 30 dias a empresa não publicar nada que aprovou, devolvemos tudo."
    ),
    item(
      "Você conta sobre a empresa uma vez",
      "A equipe de agentes pesquisa, escreve, cria a arte e publica nas redes, com a voz da empresa e sem tomar a sua agenda."
    ),
    `</table>`,
    separador(),
    /**
     * A VAGA DE FUNDADOR SÓ APARECE QUANDO EXISTE.
     *
     * O número vem do Stripe, contado na hora do envio, e não de uma promessa
     * escrita no molde. Anunciar "restam 10 vagas" num e-mail que continua
     * saindo depois de as dez acabarem transforma escassez de verdade em
     * escassez de mentira, e o cliente descobre no checkout, que é o pior
     * lugar possível.
     */
    vagasDeFundador > 0
      ? paragrafo(
          `<strong style="font-weight:600">Você chegou a tempo.</strong> As ${FUNDADOR.vagas} primeiras contas travam o Autoridade por R$ ${FUNDADOR.mensal} por mês, para sempre, no plano anual. ${vagasDeFundador === 1 ? "Resta 1 vaga" : `Restam ${vagasDeFundador} vagas`}.`,
          { tamanho: 15 }
        )
      : "",
    vagasDeFundador > 0 ? separador() : "",
    paragrafo(
      "Se não foi você que criou esta conta, pode ignorar este e-mail. Sem a confirmação, a conta não é ativada.",
      { apagado: true, tamanho: 13 }
    ),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    para: "",
    assunto: `Confirme seu e-mail e comece na ${MARCA.nome}`,
    texto,
    html: casca({
      previa: "Falta um passo para a sua conta ficar de pé: confirmar este e-mail.",
      miolo,
    }),
  };
}

/**
 * DEFINIR OU TROCAR A SENHA, num molde só com duas vozes.
 *
 * Entrou em 23/09 junto com o CRM do painel. Até ali não existia recuperação
 * de senha nenhuma: a tela "esse e-mail já tem conta" mandava a pessoa
 * "recuperar o acesso" num caminho que não existia.
 *
 * `convite` é a mesma mecânica usada para outro momento: quando o admin cria a
 * conta de alguém pelo painel, essa pessoa nunca teve senha, e um e-mail
 * dizendo "você pediu para trocar a senha" seria mentira e cara de golpe. O
 * link é o mesmo; o texto diz o que aconteceu de verdade.
 */
export function emailDeSenha(args: { nome: string; url: string; convite: boolean }): Email {
  const primeiroNome = (args.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiroNome ? `Olá, ${primeiroNome}` : "Olá";
  const assunto = args.convite
    ? `Sua conta na ${MARCA.nome} está pronta`
    : `Trocar a senha da sua conta na ${MARCA.nome}`;
  const abertura = args.convite
    ? `Criamos uma conta na ${MARCA.nome} para você. Falta só escolher a sua senha para entrar.`
    : "Recebemos um pedido para trocar a senha da sua conta. Se foi você, é só escolher a nova.";
  const acao = args.convite ? "Escolher minha senha" : "Trocar minha senha";
  const rodape = args.convite
    ? "Se você não esperava este convite, pode ignorar este e-mail."
    : "Se não foi você, ignore este e-mail: a senha atual continua valendo.";

  const texto = [`${oi}.`, "", abertura, "", args.url, "", "O link vale por 1 hora.", "", rodape, "", MARCA.nome, MARCA.site].join("\n");
  const miolo = [
    titulo(`${oi}.`),
    paragrafo(abertura),
    botao(acao, args.url),
    paragrafo(
      `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(args.url)}</span>`,
      { apagado: true, tamanho: 13 }
    ),
    paragrafo("O link vale por 1 hora.", { apagado: true, tamanho: 13 }),
    separador(),
    paragrafo(rodape, { apagado: true, tamanho: 13 }),
  ].join("\n");

  return { para: "", assunto, texto, html: casca({ previa: abertura, miolo }) };
}

/**
 * O ROTEIRO FICOU PRONTO (30/09). Na casca da marca, como o de boas-vindas:
 * o primeiro envio saiu em texto puro e o Bruno achou "parecendo spam". O
 * cliente subiu o vídeo e saiu da frente; este e-mail é o que o traz de volta
 * para escolher os cortes antes de gastarmos.
 */
export function emailDeRoteiroPronto(args: { nome?: string | null; arquivo: string; cortes: string[]; link: string }): Email {
  const primeiro = (args.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `${primeiro}, seu roteiro está pronto` : "Seu roteiro está pronto";
  const n = args.cortes.length;
  const texto = [
    `${oi}.`,
    "",
    `Terminei o roteiro da edição de ${args.arquivo}. Separei ${n} ${n === 1 ? "corte possível" : "cortes possíveis"} com a fala exata de cada um e planejei as cenas em texto.`,
    ...args.cortes.map((t) => `. ${t}`),
    "",
    "Agora é com você: confira se cada corte pegou a fala certa, corrija alguma palavra se precisar, troque o que não gostou e escolha os que vão ao ar (até 8). Só depois da sua aprovação eu gero imagens, cenas e cortes.",
    "",
    `Abrir o roteiro: ${args.link}`,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(oi + "."),
    paragrafo(
      `Terminei o roteiro da edição de <strong style="font-weight:600">${escapar(args.arquivo)}</strong>. Separei ${n} ${n === 1 ? "corte possível" : "cortes possíveis"} com a fala exata de cada um e planejei as cenas em texto.`
    ),
    n
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${args.cortes
          .slice(0, 8)
          .map((t) => item(t, "Fala e cenas prontas para você revisar."))
          .join("")}</table>`
      : "",
    botao("Revisar e aprovar o roteiro", args.link),
    paragrafo(
      "Confira se cada corte pegou a fala certa, corrija alguma palavra se precisar e escolha os que vão ao ar (até 8). Só depois da sua aprovação eu gero imagens, cenas e cortes, e uso o restante dos créditos.",
      { apagado: true, tamanho: 14 }
    ),
    paragrafo(
      `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(args.link)}</span>`,
      { apagado: true, tamanho: 13 }
    ),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    para: "",
    assunto: `${oi}: escolha os cortes e aprove`,
    texto,
    html: casca({ previa: "Separei os cortes com a fala exata. Revise e aprove antes de eu gerar.", miolo }),
  };
}

/** O VÍDEO COMPLETO FICOU PRONTO, com a mesma casca (30/09). */
export function emailDeCompletoPronto(args: { nome?: string | null; arquivo: string; link: string }): Email {
  const primeiro = (args.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `${primeiro}, seu vídeo completo está pronto` : "Seu vídeo completo está pronto";
  const texto = [
    `${oi}.`,
    "",
    `Terminei a edição completa de ${args.arquivo}: cortes, movimentos, elementos, imagens e transições. Ele já está no quadro para você assistir, aprovar e agendar.`,
    "",
    `Abrir o Gestor: ${args.link}`,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(oi + "."),
    paragrafo(
      `Terminei a edição completa de <strong style="font-weight:600">${escapar(args.arquivo)}</strong>: cortes, movimentos, elementos, imagens e transições.`
    ),
    paragrafo("Ele já está no quadro para você assistir, aprovar e agendar, direto no card do vídeo."),
    botao("Assistir e aprovar", args.link),
    paragrafo(
      `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(args.link)}</span>`,
      { apagado: true, tamanho: 13 }
    ),
  ].join("\n");
  return {
    para: "",
    assunto: oi,
    texto,
    html: casca({ previa: "A edição completa terminou. Assista, aprove e agende no card.", miolo }),
  };
}
