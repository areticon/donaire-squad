import { casca, titulo, paragrafo, botao, separador, escapar, MARCA } from "@/lib/email/layout";
import type { Email } from "@/lib/email";

/**
 * O CONVITE PARA A EQUIPE (01/10), na casca da marca como os outros e-mails.
 *
 * Diz quem convidou e o que a pessoa vai poder fazer, porque convite de
 * plataforma que a pessoa não conhece, sem nome de quem chama, tem cara de
 * golpe. O link leva à página do convite, que pede para entrar ou criar a
 * conta com ESTE e-mail.
 */
export function emailDeConviteDaEquipe(args: {
  quemConvida: string;
  empresa?: string | null;
  nome?: string | null;
  url: string;
  validoAte: Date;
}): Email {
  const primeiro = (args.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}` : "Olá";
  const quem = args.empresa ? `${args.quemConvida} (${args.empresa})` : args.quemConvida;
  const abertura = `${quem} convidou você para a equipe na ${MARCA.nome}, a plataforma que transforma as suas gravações em conteúdo para as redes.`;
  const detalhe =
    "Você entra com o seu próprio login e usa os projetos que a equipe liberar para você. O consumo sai da conta da empresa: você não paga nada.";
  const ate = args.validoAte.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
  const rodape = "Se você não esperava este convite, pode ignorar este e-mail.";

  const texto = [`${oi}.`, "", abertura, "", detalhe, "", args.url, "", `O convite vale até ${ate}.`, "", rodape, "", MARCA.nome, MARCA.site].join("\n");
  const miolo = [
    titulo(`${oi}.`),
    paragrafo(escapar(abertura)),
    paragrafo(escapar(detalhe)),
    botao("Aceitar o convite", args.url),
    paragrafo(
      `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(args.url)}</span>`,
      { apagado: true, tamanho: 13 }
    ),
    paragrafo(`O convite vale até ${ate}.`, { apagado: true, tamanho: 13 }),
    separador(),
    paragrafo(rodape, { apagado: true, tamanho: 13 }),
  ].join("\n");

  return { para: "", assunto: `${args.quemConvida} convidou você para a equipe na ${MARCA.nome}`, texto, html: casca({ previa: abertura, miolo }) };
}
