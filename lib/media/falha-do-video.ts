/**
 * QUANDO O VÍDEO NÃO SAI, A PEÇA DIZ O QUE ACONTECEU, E NADA ALÉM DISSO.
 *
 * Achado em 21/09, no relato do Bruno: "rejeitei o post do dia 21 porque
 * estava sem vídeo". Ele estava certo, e o que a tela não dizia era tudo.
 *
 * O que houve de verdade: a Diana escreveu no log "Vídeo de Segunda-feira 21
 * na fila", o trabalho foi criado, e o Veo recusou as três tentativas com HTTP
 * 403 e a mensagem "Lightning dunning decision is deny for project", que é a
 * conta de faturamento do Google recusando por cobrança. Os créditos foram
 * estornados, e a peça ficou `mediaType: video` com o QUADRO dentro, calada.
 *
 * ## O QUE O CLIENTE VÊ, E O QUE ELE NÃO VÊ
 *
 * Correção do Bruno, no mesmo dia, depois de ler a primeira versão desta
 * mensagem: **"quem tem que saber sobre saldo das APIs sou eu, não os
 * clientes"**. A primeira versão dizia, na tela do cliente, que a conta de
 * faturamento do Gemini estava com pagamento pendente. Isso é operação
 * interna, e um cliente que lê aquilo aprende três coisas que não lhe dizem
 * respeito: qual fornecedor a plataforma usa, que a conta dela está em
 * atraso, e que o problema não tem prazo.
 *
 * Então a divisão é esta, e ela vale para qualquer falha de fornecedor:
 *
 *   • o CLIENTE recebe o que mudou para ele (a peça saiu sem vídeo), se o
 *     crédito voltou, se adianta tentar de novo, e um CÓDIGO;
 *   • o código é o que ele informa ao abrir um chamado, e é o que chega no
 *     e-mail do Bruno junto com o detalhe técnico de verdade;
 *   • o detalhe técnico NUNCA entra no que a tela recebe. Ele já vive onde
 *     precisa viver: no registro do trabalho da fila.
 *
 * A única exceção é a falta de crédito de VÍDEO do próprio cliente: essa é
 * informação dele, sobre a carteira dele, e vira convite para comprar.
 */

/** O código que o cliente informa e que o e-mail do chamado traduz. */
export type CodigoDaFalha = "VID-402" | "VID-429" | "VID-CRD" | "VID-500";

export interface FalhaDoVideo {
  /** O código curto que aparece na tela e no assunto do chamado. */
  codigo: CodigoDaFalha;
  /** O que a tela mostra ao cliente. Sem fornecedor, sem conta, sem fatura. */
  mensagem: string;
  /** Refazer agora adianta? Cobrança recusada não melhora com insistência. */
  vaiAdiantarTentarDeNovo: boolean;
  /** O cliente resolve sozinho (crédito dele) ou é caso de chamado? */
  resolveSozinho: boolean;
  /**
   * O que o e-mail do chamado diz ao Bruno, em uma linha. NÃO vai para a tela:
   * quem monta o e-mail lê isto junto com o erro bruto do trabalho da fila.
   */
  interno: string;
}

/**
 * Lê o erro do fornecedor e devolve o que a peça vai dizer.
 *
 * A ordem importa: cobrança recusada e cota estourada parecem a mesma coisa de
 * longe (as duas vêm do mesmo fornecedor, as duas param o vídeo) e são opostas
 * no que se deve fazer. Cota volta sozinha; cobrança não volta até alguém
 * pagar. O cliente não precisa saber qual das duas é, mas precisa saber se
 * vale tentar de novo, e são os dois códigos que dizem isso.
 */
export function lerFalhaDoVideo(erro: unknown): FalhaDoVideo {
  const texto = erro instanceof Error ? erro.message : String(erro ?? "");

  // COBRANÇA RECUSADA no provedor. "Dunning" é o processo de cobrança de conta
  // inadimplente, e a mensagem vem literalmente assim na resposta do Veo.
  if (/dunning|PERMISSION_DENIED|billing|403/i.test(texto) && !/quota|rate limit|429/i.test(texto)) {
    return {
      codigo: "VID-402",
      mensagem:
        "O vídeo desta peça não pôde ser gerado agora, por uma indisponibilidade do nosso gerador de vídeo. " +
        "Seus créditos de vídeo foram devolvidos e o texto e a arte continuam prontos. " +
        "Já estamos tratando, e tentar de novo agora não muda o resultado.",
      vaiAdiantarTentarDeNovo: false,
      resolveSozinho: false,
      interno: "O provedor de vídeo recusou por COBRANÇA (403 / dunning): a conta de faturamento está com pagamento pendente ou suspensa. Nenhum vídeo por IA sai até isso ser regularizado.",
    };
  }

  // COTA, que é a que volta sozinha.
  if (/quota|rate limit|429|RESOURCE_EXHAUSTED/i.test(texto)) {
    return {
      codigo: "VID-429",
      mensagem:
        "O vídeo desta peça não pôde ser gerado agora: o gerador de vídeo atingiu o limite de uso do momento. " +
        "Seus créditos de vídeo foram devolvidos. Isso costuma se resolver em minutos, então gerar de novo mais tarde normalmente funciona.",
      vaiAdiantarTentarDeNovo: true,
      resolveSozinho: false,
      interno: "Cota do provedor de vídeo estourada (429 / RESOURCE_EXHAUSTED). Volta sozinha; vale conferir o limite por minuto e por dia da chave no console.",
    };
  }

  // A CARTEIRA DE VÍDEO DO CLIENTE. Esta é dele, e por isso é dita por inteiro.
  if (/saldo|cr[ée]dito/i.test(texto)) {
    return {
      codigo: "VID-CRD",
      // Pedido de membro da equipe (01/10): o erro do débito já diz a quem
      // pedir, pelo nome; membro não compra pacote.
      mensagem: /da equipe/i.test(texto)
        ? `O vídeo desta peça não foi gerado: ${texto} Depois, gere a peça de novo.`
        : "O vídeo desta peça não foi gerado por falta de créditos de vídeo na sua conta. " +
          "Compre um pacote de vídeo e gere a peça de novo.",
      vaiAdiantarTentarDeNovo: true,
      resolveSozinho: true,
      interno: "Carteira de vídeo do cliente zerada. Não é problema nosso: é venda de pacote.",
    };
  }

  return {
    codigo: "VID-500",
    mensagem:
      "O vídeo desta peça não pôde ser gerado por uma falha técnica. " +
      "Seus créditos de vídeo foram devolvidos, o texto e a arte continuam prontos, e você pode tentar gerar de novo.",
    vaiAdiantarTentarDeNovo: true,
    resolveSozinho: false,
    interno: `Falha não classificada na geração de vídeo: ${texto.slice(0, 300)}`,
  };
}

/** O que fica gravado na peça: o que a TELA pode mostrar, e nada além. */
export function marcaParaAPeca(falha: FalhaDoVideo): {
  codigo: CodigoDaFalha;
  motivo: string;
  em: string;
  podeTentarDeNovo: boolean;
  resolveSozinho: boolean;
} {
  return {
    codigo: falha.codigo,
    motivo: falha.mensagem,
    em: new Date().toISOString(),
    podeTentarDeNovo: falha.vaiAdiantarTentarDeNovo,
    resolveSozinho: falha.resolveSozinho,
  };
}
