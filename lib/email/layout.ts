/**
 * A CASCA DOS E-MAILS DA DEMANDOU.
 *
 * Existe para os e-mails do produto terem uma cara só, e para a próxima
 * mensagem não nascer com o cabeçalho copiado e um pixel fora do lugar. Quem
 * escreve um e-mail novo escreve só o MIOLO.
 *
 * ## As regras de e-mail que o navegador não ensina
 *
 * Cliente de e-mail não é navegador. O Outlook desenha com o motor do Word,
 * o Gmail apaga `<style>` de dentro do corpo em parte dos casos, e nenhum dos
 * dois entende flexbox nem grid. Por isso aqui tudo é TABELA com estilo
 * embutido: é feio de escrever e é o que chega igual nos dois.
 *
 * ## Por que continua sóbrio, mesmo agora que tem logo
 *
 * O desenho anterior era propositalmente seco, e o motivo está escrito no
 * histórico: o domínio já foi marcado pelo Google como página enganosa uma
 * vez. Classificador de phishing pune três coisas, e nenhuma delas é "ter
 * logo": pune imagem demais com texto de menos, pune urgência inventada
 * ("sua conta será excluída em 24h") e pune link cujo texto não bate com o
 * destino. Então este layout tem UMA imagem, um botão só, o endereço escrito
 * por extenso embaixo dele, e nenhuma contagem regressiva.
 *
 * O texto puro continua obrigatório, e por isso `Email.texto` não é opcional:
 * mensagem só-HTML pontua pior em filtro de spam.
 *
 * ## O rodapé com CNPJ e endereço não é enfeite
 *
 * Remetente identificável é critério de reputação nos provedores grandes, e é
 * o que separa e-mail transacional de disparo anônimo.
 */

/** A marca, num lugar só. */
export const MARCA = {
  nome: "Demandou",
  site: "https://demandou.com",
  /**
   * PNG no domínio da marca: cliente de e-mail não desenha SVG.
   *
   * É a marca de 25/08 (o "pd" laranja com contorno branco), de volta em
   * 01/10 depois do logo B: o arquivo oficial copiado de "demandou marca/antigo"
   * para o mesmo caminho, que o checkout do Stripe também lê. O ?v= é para o
   * proxy de imagem do Gmail, que guarda a imagem pelo endereço e mostraria o
   * logo B em e-mail novo; os e-mails antigos, sem o ?v=, pegam o arquivo do
   * caminho e também voltam ao logo laranja.
   */
  logo: "https://demandou.com/brand-mark-on-light.png?v=marca-0110b",
  /**
   * Cores do rebranding de 01/10: marinho de base, laranja só no botão (que é
   * a única ação do e-mail, então é a conversão). O laranja é o #c4470f e não
   * o da marca porque texto branco sobre ele dá 4,9:1; sobre o #ef6122, 3,3:1.
   */
  laranja: "#c4470f",
  /** Link em texto (WhatsApp, por exemplo): marinho médio, 11,5:1. */
  link: "#1e3a5f",
  escuro: "#0a1f3b",
  texto: "#1d2939",
  apagado: "#4f596b",
  borda: "#e4e7ec",
  fundo: "#f7f8fa",
  razaoSocial: "DEMANDOU TECNOLOGIA DA INFORMACAO LTDA",
  cnpj: "66.140.770/0001-48",
  endereco: "Rua Pais Leme, 215, conj. 1713, Pinheiros, São Paulo/SP, 05424-150",
} as const;

/** Escapa o que entra no HTML. Nome e e-mail vêm do cadastro, ou seja, de fora. */
export function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * O botão, em tabela.
 *
 * Um `<a>` com padding some no Outlook, que ignora padding em elemento em
 * linha. Tabela com célula colorida é o jeito que sobrevive nos dois mundos.
 */
export function botao(texto: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px">
  <tr>
    <td align="center" bgcolor="${MARCA.laranja}" style="border-radius:999px">
      <a href="${escapar(url)}" style="display:inline-block;padding:14px 28px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:999px">${escapar(texto)}</a>
    </td>
  </tr>
</table>`;
}

/** Um item da lista do que a pessoa ganha. Sem bullet nativo, que varia demais. */
export function item(titulo: string, detalhe: string): string {
  return `<tr>
  <td style="padding:0 0 14px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="8" valign="top" style="padding:7px 12px 0 0">
          <div style="width:6px;height:6px;border-radius:3px;background:${MARCA.escuro};font-size:0;line-height:0">&nbsp;</div>
        </td>
        <td style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:${MARCA.texto}">
          <strong style="font-weight:600">${escapar(titulo)}</strong><br>
          <span style="color:${MARCA.apagado};font-size:14px">${escapar(detalhe)}</span>
        </td>
      </tr>
    </table>
  </td>
</tr>`;
}

/**
 * Monta o e-mail inteiro em volta do miolo.
 *
 * `previa` é o texto que o aplicativo mostra ao lado do assunto, antes de
 * abrir. Sem ele, o cliente de e-mail usa o primeiro texto que encontrar, que
 * costuma ser "Se você não consegue ver esta mensagem".
 *
 * O nome ao lado da marca imita o logotipo de antes (01/10): Montserrat em
 * peso 800 quando o aparelho tem a fonte, e o sistema em negrito quando não
 * tem, porque cliente de e-mail não baixa fonte de fora.
 */
export function casca(args: { previa: string; miolo: string }): string {
  const { previa, miolo } = args;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapar(MARCA.nome)}</title>
</head>
<body style="margin:0;padding:0;background:${MARCA.fundo};-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0">${escapar(previa)}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${MARCA.fundo}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;width:100%">

        <tr>
          <td align="center" style="padding:0 0 24px">
            <a href="${MARCA.site}" style="text-decoration:none">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding-right:10px">
                    <img src="${MARCA.logo}" width="36" height="36" alt="" style="display:block;border:0">
                  </td>
                  <td style="font-family:Montserrat,'Segoe UI',system-ui,-apple-system,Roboto,Helvetica,Arial,sans-serif;font-size:21px;font-weight:800;letter-spacing:-0.2px;color:${MARCA.escuro}">demandou.</td>
                </tr>
              </table>
            </a>
          </td>
        </tr>

        <tr>
          <td style="background:#ffffff;border:1px solid ${MARCA.borda};border-radius:16px;padding:36px 32px">
            ${miolo}
          </td>
        </tr>

        <tr>
          <td style="padding:24px 8px 0;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${MARCA.apagado}">
            <a href="${MARCA.site}" style="color:${MARCA.apagado};text-decoration:none">${MARCA.nome.toLowerCase()}.com</a><br>
            ${escapar(MARCA.razaoSocial)}, CNPJ ${MARCA.cnpj}<br>
            ${escapar(MARCA.endereco)}<br>
            <span style="color:#98a2b3">Você recebeu este e-mail porque alguém usou este endereço para criar uma conta na ${escapar(MARCA.nome)}.</span>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Um parágrafo do miolo, com o tipo e o espaçamento já certos. */
export function paragrafo(html: string, opcoes?: { apagado?: boolean; tamanho?: number }): string {
  const cor = opcoes?.apagado ? MARCA.apagado : MARCA.texto;
  const tamanho = opcoes?.tamanho ?? 16;
  return `<p style="margin:0 0 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:${tamanho}px;line-height:1.6;color:${cor}">${html}</p>`;
}

/** O título do miolo. */
export function titulo(texto: string): string {
  return `<h1 style="margin:0 0 12px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;line-height:1.3;font-weight:600;color:${MARCA.escuro}">${escapar(texto)}</h1>`;
}

/** A linha fina que separa o convite do rodapé da mensagem. */
export function separador(): string {
  return `<div style="height:1px;background:${MARCA.borda};margin:8px 0 20px;font-size:0;line-height:0">&nbsp;</div>`;
}
