/**
 * O QUE CADA CÓDIGO DE FALHA DE PUBLICAÇÃO QUER DIZER, PARA O CLIENTE (01/10/2026).
 *
 * `lib/publish/via-blotato.ts` e `lib/publish/oauth-post.ts` gravam no post a
 * frase da falha com um código no fim ("... (código PUB-FMT)"). Até aqui a tela
 * cortava a frase em 90 caracteres e o código, que fica no fim, sumia; e o
 * chamado tratava toda peça como "vídeo não gerado". Este dicionário é a fonte
 * única do que cada código significa na tela do cliente.
 *
 * ## POR QUE O DETALHE TÉCNICO MORA EM OUTRO ARQUIVO
 *
 * Este módulo é importado por componentes de cliente, e tudo que ele exporta
 * vai parar no JavaScript que o navegador baixa. A regra da casa (21/09) é que
 * o cliente recebe código e caminho (o chamado), e o detalhe interno, com nome
 * de fornecedor e script de conserto, é só do admin. Se a explicação técnica
 * morasse aqui, qualquer pessoa leria o nome do fornecedor no código-fonte da
 * página. Então a metade técnica vive em `lib/publish/codigos-admin.ts`, que só
 * o servidor importa, e o tipo `Record<CodigoDePublicacao, ...>` de lá obriga
 * as duas metades a cobrir os mesmos códigos.
 *
 * Nada aqui toca o banco: é texto puro, seguro para cliente e servidor.
 */

/** Os códigos que as rotas de publicação gravam. Mantenha igual a `CodigoDaPonte`. */
export const CODIGOS_DE_PUBLICACAO = ["PUB-INT", "PUB-CFG", "PUB-LIM", "PUB-MID", "PUB-FMT", "PUB-REDE", "PUB-ESP"] as const;

export type CodigoDePublicacao = (typeof CODIGOS_DE_PUBLICACAO)[number];

export type TraducaoParaOCliente = {
  /** Uma linha curta, o que aparece no lugar do código cru. */
  titulo: string;
  /** O que aconteceu, em português de gente, sem fornecedor e sem jargão. */
  explicacao: string;
  /** O que o cliente pode fazer agora. */
  oQueFazer: string;
  /**
   * Vale oferecer o botão de chamado? Falso só quando esperar resolve sozinho:
   * chamado aberto por espera é fila de atendimento sem nada a atender.
   */
  chamado: boolean;
};

export const TRADUCAO_DOS_CODIGOS: Record<CodigoDePublicacao, TraducaoParaOCliente> = {
  "PUB-INT": {
    titulo: "Publicação fora do ar nesta rede",
    explicacao:
      "A ligação da plataforma com esta rede está indisponível agora. O problema é do nosso lado: a sua conta e a sua peça estão certas.",
    oQueFazer:
      "Não precisa mudar nada na peça. Abra um chamado com o código e avisamos quando voltar; tentar de novo agora não muda o resultado.",
    chamado: true,
  },
  "PUB-CFG": {
    titulo: "Conta ainda não pronta para publicar",
    explicacao:
      "A rede foi conectada, mas a configuração dela do nosso lado ainda não terminou (por exemplo, falta ligar a página da empresa).",
    oQueFazer: "Abra um chamado com o código. Terminamos a configuração e avisamos para você publicar de novo.",
    chamado: true,
  },
  "PUB-LIM": {
    titulo: "A rede pediu para esperar",
    explicacao: "A rede recebeu muitas publicações em pouco tempo e pediu uma pausa antes da próxima.",
    oQueFazer: "Espere alguns minutos e publique de novo. Não precisa abrir chamado.",
    chamado: false,
  },
  "PUB-MID": {
    titulo: "Não conseguimos preparar a imagem ou o vídeo",
    explicacao:
      "A imagem ou o vídeo desta peça não ficou pronto para envio: o arquivo não abriu, passou do tamanho que a conexão aceita ou está num formato que a rede não recebe.",
    oQueFazer: "Publique de novo. Se repetir, abra um chamado com o código.",
    chamado: true,
  },
  "PUB-FMT": {
    titulo: "A rede não aceita a peça neste formato",
    explicacao:
      "Cada rede tem as suas regras: o Instagram exige imagem, o YouTube e o TikTok só recebem vídeo, e alguns tipos de peça (como a enquete) não saem por esta conexão.",
    oQueFazer:
      "Troque o tipo da peça para o que a rede aceita (imagem, carrossel ou vídeo) e publique de novo. Se a peça já está no formato certo, abra um chamado com o código.",
    chamado: true,
  },
  "PUB-REDE": {
    titulo: "A rede recusou a publicação",
    explicacao:
      "A peça chegou à rede, e a própria rede não aceitou. Quando ela explica o motivo (vídeo curto demais, proporção não aceita), ele aparece na mensagem da peça.",
    oQueFazer: "Ajuste a peça conforme o motivo e publique de novo. Se repetir, abra um chamado com o código.",
    chamado: true,
  },
  "PUB-ESP": {
    titulo: "A rede não confirmou a publicação",
    explicacao:
      "A peça foi enviada, mas a rede não respondeu se publicou. Ela pode já estar no seu perfil.",
    oQueFazer:
      "Confira o seu perfil na rede antes de publicar de novo, para a peça não sair repetida. Se não estiver lá, publique de novo; na dúvida, abra um chamado com o código.",
    chamado: true,
  },
};

const PADRAO = /\bPUB-[A-Z]+\b/;

/** É um dos códigos conhecidos? Código desconhecido não ganha tradução inventada. */
export function ehCodigoDePublicacao(v: unknown): v is CodigoDePublicacao {
  return typeof v === "string" && (CODIGOS_DE_PUBLICACAO as readonly string[]).includes(v);
}

/**
 * O código gravado no post. Lê primeiro o campo estruturado (`metadata.ponte.codigo`,
 * gravado pelo cron) e depois o fim da frase (`metadata.error`), que é onde as
 * duas rotas de publicação o põem.
 */
export function codigoDaFalha(metadata: unknown): CodigoDePublicacao | null {
  const m = (metadata ?? null) as { error?: unknown; erro?: unknown; ponte?: { codigo?: unknown } } | null;
  if (!m) return null;
  if (ehCodigoDePublicacao(m.ponte?.codigo)) return m.ponte.codigo;
  const texto = typeof m.error === "string" ? m.error : typeof m.erro === "string" ? m.erro : "";
  const achado = texto.match(PADRAO)?.[0];
  return ehCodigoDePublicacao(achado) ? achado : null;
}

/** Atalho para a tela: o código e o que ele quer dizer, ou nada. */
export function traduzirFalha(metadata: unknown): ({ codigo: CodigoDePublicacao } & TraducaoParaOCliente) | null {
  const codigo = codigoDaFalha(metadata);
  return codigo ? { codigo, ...TRADUCAO_DOS_CODIGOS[codigo] } : null;
}

/**
 * O protocolo do chamado já aberto para ESTA falha, se houver.
 *
 * O chamado fica gravado na peça (`metadata.chamadoDaPublicacao`) junto com a
 * frase da falha a que ele se refere. Se a peça falhar de novo por outro
 * motivo, a frase muda e o botão volta: um chamado antigo não pode calar uma
 * falha nova (é a marca de estado que sobrevive ao fato).
 */
export function chamadoDaFalha(metadata: unknown): string | null {
  const m = (metadata ?? null) as { error?: unknown; chamadoDaPublicacao?: { protocolo?: unknown; erro?: unknown } } | null;
  const c = m?.chamadoDaPublicacao;
  if (!c || typeof c.protocolo !== "string") return null;
  return c.erro === m?.error ? c.protocolo : null;
}

/**
 * O motivo que a REDE deu, quando a frase o trouxe ("Motivo informado pela
 * rede: ..."). Esse trecho já passou pelo filtro de `motivoDaRede` em
 * via-blotato.ts, que corta qualquer menção a fornecedor, plano ou chave.
 */
export function motivoDaRedeNaFrase(metadata: unknown): string | null {
  const m = (metadata ?? null) as { error?: unknown } | null;
  const texto = typeof m?.error === "string" ? m.error : "";
  const achado = texto.match(/Motivo informado pela rede: (.+?)\.(?:\s|$)/);
  return achado ? achado[1] : null;
}
