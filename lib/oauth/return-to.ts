/**
 * Valida o parâmetro `returnTo` dos fluxos de OAuth.
 *
 * Sem validação existia redirecionamento aberto: os callbacks montam a URL
 * final como `${appUrl}${returnTo}`, então `returnTo=@site-de-golpe.com`
 * produz `https://demandou.com@site-de-golpe.com`, que o navegador lê como
 * usuário "demandou.com" no host "site-de-golpe.com". É o truque clássico de
 * phishing: o link exibe o nosso domínio e leva para outro.
 *
 * Estava atrás de login, então não era alcançável por um robô, mas
 * redirecionamento aberto é item de checklist de revisão de site marcado como
 * enganoso, e o conserto é barato.
 *
 * Regra: só caminho relativo do próprio site. Precisa começar com uma única
 * barra, e não pode conter nada que mude o host.
 */
export function returnToSeguro(
  valor: string | null | undefined,
  padrao: string
): string {
  if (!valor) return padrao;
  if (!valor.startsWith("/")) return padrao;
  // "//host" e "/\host" viram protocolo relativo e trocam o destino.
  if (valor.startsWith("//") || valor.startsWith("/\\")) return padrao;
  // Nada de host embutido, credencial embutida ou escape por barra invertida.
  if (valor.includes("://") || valor.includes("@") || valor.includes("\\")) {
    return padrao;
  }
  // Espaço e caractere de controle são usados para enganar parser de URL.
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(valor)) return padrao;
  return valor;
}
