import { Resend } from "resend";

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
 * O e-mail de confirmação de cadastro.
 *
 * Sóbrio de propósito. E-mail de confirmação com muita imagem, muito botão e
 * urgência inventada é exatamente o desenho que classificador de phishing
 * pune, e o domínio já tem histórico com o Google. Aqui vai o essencial: quem
 * mandou, por que, um link, e o que fazer se não foi você.
 */
export function emailDeConfirmacao(nome: string, url: string): Email {
  const primeiroNome = (nome ?? "").trim().split(/\s+/)[0] || "olá";

  const texto = [
    `${primeiroNome}, confirme seu e-mail para ativar sua conta na Demandou.`,
    "",
    url,
    "",
    "O link vale por 1 hora. Depois disso é só pedir outro na tela de entrada.",
    "",
    "Se não foi você que criou esta conta, ignore este e-mail: sem a confirmação, a conta não é ativada.",
    "",
    "Demandou",
    "https://demandou.com",
  ].join("\n");

  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.6;color:#18181b;max-width:520px">
<p>${escapar(primeiroNome)}, confirme seu e-mail para ativar sua conta na Demandou.</p>
<p><a href="${escapar(url)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Confirmar meu e-mail</a></p>
<p style="color:#52525b;font-size:13px">Ou copie este endereço: <br>${escapar(url)}</p>
<p style="color:#52525b;font-size:13px">O link vale por 1 hora. Depois disso é só pedir outro na tela de entrada.</p>
<p style="color:#52525b;font-size:13px">Se não foi você que criou esta conta, ignore este e-mail: sem a confirmação, a conta não é ativada.</p>
<p style="color:#71717a;font-size:12px">Demandou · <a href="https://demandou.com" style="color:#71717a">demandou.com</a></p>
</div>`;

  return {
    para: "",
    assunto: "Confirme seu e-mail na Demandou",
    texto,
    html,
  };
}

/** Escapa o que entra no HTML. O nome vem do cadastro, ou seja, do usuário. */
function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
