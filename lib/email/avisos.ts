import type { Email } from "@/lib/email";
import { casca, titulo, paragrafo, botao, item, escapar, separador, MARCA } from "@/lib/email/layout";

/**
 * OS E-MAILS DE AVISO DO SINO (02/10/2026), na casca da marca.
 *
 * Moram aqui, e não em `lib/email/index.ts`, para o arquivo de envio não
 * crescer com cada aviso novo. O roteiro pronto e o vídeo pronto continuam lá
 * (nasceram em 30/09); estes são os que faltavam: as peças do vídeo e as da
 * semana esperando aprovação. Quem decide SE sai é `lib/notificacoes`, uma vez
 * por fato.
 */

function primeiroNome(nome?: string | null): string {
  return (nome ?? "").trim().split(/\s+/)[0] || "";
}

function seNaoAbrir(link: string): string {
  return paragrafo(
    `Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${MARCA.apagado}">${escapar(link)}</span>`,
    { apagado: true, tamanho: 13 }
  );
}

/**
 * OS CORTES E OS TEXTOS DO VÍDEO PRONTOS PARA APROVAR. Sai quando o quadro
 * recebe as peças, mesmo com a edição de efeitos do vídeo completo ainda
 * rodando: o cliente já pode aprovar e agendar o que ficou pronto.
 */
export function emailDePecasDoVideo(args: {
  nome?: string | null;
  arquivo: string;
  pecas: number;
  cortes: string[];
  completoAindaEditando: boolean;
  link: string;
}): Email {
  const oi = primeiroNome(args.nome);
  const frase = oi ? `${oi}, seus cortes estão prontos para aprovar` : "Seus cortes estão prontos para aprovar";
  const n = args.pecas;
  const resumo = `Os cortes de ${args.arquivo} e os textos de cada rede já estão no quadro: ${n} ${n === 1 ? "peça espera" : "peças esperam"} a sua aprovação.`;
  const depois = args.completoAindaEditando
    ? "O vídeo completo ainda está na edição com efeitos. Ele chega por último, e avisamos quando ficar pronto."
    : "Nada sai nas redes sem o seu ok.";
  const texto = [
    `${frase}.`,
    "",
    resumo,
    ...args.cortes.slice(0, 8).map((t) => `. ${t}`),
    "",
    "Assista, ajuste o que quiser e aprove para agendar.",
    depois,
    "",
    `Abrir o Gestor: ${args.link}`,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(frase + "."),
    paragrafo(
      `Os cortes de <strong style="font-weight:600">${escapar(args.arquivo)}</strong> e os textos de cada rede já estão no quadro: ${n} ${n === 1 ? "peça espera" : "peças esperam"} a sua aprovação.`
    ),
    args.cortes.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${args.cortes
          .slice(0, 8)
          .map((t) => item(t, "Corte, capa e texto de cada rede."))
          .join("")}</table>`
      : "",
    botao("Aprovar as peças", args.link),
    paragrafo("Assista, ajuste o que quiser e aprove para agendar. " + escapar(depois), { apagado: true, tamanho: 14 }),
    seNaoAbrir(args.link),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    para: "",
    assunto: oi ? `${oi}, seus cortes e textos estão no quadro: aprove e agende` : "Seus cortes e textos estão no quadro: aprove e agende",
    texto,
    html: casca({ previa: "Cortes, capas e textos no quadro, esperando o seu ok.", miolo }),
  };
}

/**
 * OS POSTS DA SEMANA PRONTOS PARA APROVAR (a campanha de texto e arte). Sai
 * quando a campanha fecha com peça entregue.
 */
export function emailDeSemanaPronta(args: { nome?: string | null; projeto: string; pecas: number; link: string }): Email {
  const oi = primeiroNome(args.nome);
  const frase = oi ? `${oi}, os posts da semana estão prontos` : "Os posts da semana estão prontos";
  const n = args.pecas;
  const corpo = `A equipe terminou a semana de ${args.projeto}: ${n} ${n === 1 ? "peça pronta" : "peças prontas"}, com texto e arte de cada rede.`;
  const texto = [
    `${frase}.`,
    "",
    corpo,
    "Nada sai nas redes sem o seu ok: revise, peça ajuste no card se precisar e aprove para agendar.",
    "",
    `Abrir o Gestor: ${args.link}`,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(frase + "."),
    paragrafo(escapar(corpo)),
    botao("Revisar e aprovar", args.link),
    paragrafo("Nada sai nas redes sem o seu ok: revise, peça ajuste no card se precisar e aprove para agendar.", { apagado: true, tamanho: 14 }),
    seNaoAbrir(args.link),
  ].join("\n");
  return {
    para: "",
    assunto: `${frase}: revise e aprove`,
    texto,
    html: casca({ previa: "Texto e arte de cada rede, esperando o seu ok.", miolo }),
  };
}

/**
 * O VÍDEO COMPLETO PRONTO, com o rodapé que diz como desligar (é o único
 * aviso por e-mail que não pede ação). Substitui `emailDeCompletoPronto` no
 * envio desde 02/10: aquele não dizia nada da versão limpa.
 *
 * `versaoLimpa`: a revisão final não aprovou os efeitos e foi ao ar a fala
 * editada, sem inserções (a tela explica e oferece pedir de novo sem custo).
 */
export function emailDeVideoPronto(args: {
  nome?: string | null;
  arquivo: string;
  link: string;
  /** "Aproveitar o roteiro" (02/10): o Gestor com a pergunta de mais peças aberta. */
  aproveitar?: string;
  configuracoes: string;
  versaoLimpa?: boolean;
}): Email {
  const oi = primeiroNome(args.nome);
  const frase = oi ? `${oi}, seu vídeo completo está pronto` : "Seu vídeo completo está pronto";
  const corpo = args.versaoLimpa
    ? `Terminei a edição de ${args.arquivo}. Na revisão final, quadro a quadro, os efeitos não passaram, e para não publicar nada com defeito entreguei a sua fala editada, com legenda e zoom. Você pode pedir os efeitos de novo no Gestor, sem pagar nada.`
    : `Terminei a edição completa de ${args.arquivo}: cortes, movimentos, elementos, imagens e transições, conferida quadro a quadro.`;
  const rodape = "Você recebe este aviso porque os e-mails de aviso estão ligados. Para receber só os pedidos de aprovação, desligue em Configurações.";
  const texto = [
    `${frase}.`,
    "",
    corpo,
    "Ele já está no quadro para você assistir, aprovar e agendar.",
    "",
    `Abrir o Gestor: ${args.link}`,
    ...(args.aproveitar ? ["", `Quer aproveitar este roteiro para gerar mais conteúdo (carrossel, imagens, posts)? ${args.aproveitar}`] : []),
    "",
    rodape,
    args.configuracoes,
    "",
    MARCA.nome,
    MARCA.site,
  ].join("\n");
  const miolo = [
    titulo(frase + "."),
    paragrafo(escapar(corpo)),
    paragrafo("Ele já está no quadro para você assistir, aprovar e agendar, direto no card do vídeo."),
    botao("Assistir e aprovar", args.link),
    seNaoAbrir(args.link),
    args.aproveitar
      ? paragrafo(
          `<strong style="font-weight:600">Quer aproveitar este roteiro para gerar mais conteúdo?</strong> Carrossel, imagens e posts para as suas redes, a partir do mesmo vídeo, com o custo em créditos antes de confirmar. <a href="${escapar(args.aproveitar)}" style="color:${MARCA.escuro};font-weight:600">Aproveitar o roteiro</a>`,
          { tamanho: 14 }
        )
      : "",
    separador(),
    paragrafo(`${escapar(rodape)} <a href="${escapar(args.configuracoes)}" style="color:${MARCA.apagado}">Abrir Configurações</a>.`, { apagado: true, tamanho: 12 }),
  ].join("\n");
  return {
    para: "",
    assunto: frase,
    texto,
    html: casca({ previa: "A edição completa terminou. Assista, aprove e agende no card.", miolo }),
  };
}
