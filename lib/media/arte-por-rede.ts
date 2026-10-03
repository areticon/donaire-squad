import { gruposDeFormato, instrucaoDeFormato, type FormatoDaRede, type ProporcaoPedida } from "@/lib/media/formatos-das-redes";
import { ajustarParaFormato } from "@/lib/media/margem-de-seguranca";
import { conferirArte, pedidoDeCorrecao } from "@/lib/media/conferencia-da-arte";
import { textoPermitidoComModelo } from "@/lib/modelos-de-arte/registro";

/**
 * UMA ARTE POR PROPORÇÃO, UM RECORTE POR REDE, E UMA CONFERÊNCIA ANTES DE
 * ENTREGAR.
 *
 * Isto é o conserto do card 509, e ele tem três partes que só juntas resolvem:
 *
 *   1. o dia publica em quatro redes e elas não têm o mesmo formato. Gerar uma
 *      arte e mandar para todas é o que produzia 1376x768 em Instagram,
 *      Facebook, LinkedIn e X ao mesmo tempo;
 *   2. gerar uma arte por REDE seria pagar quatro vezes pelo que o recorte
 *      resolve. Então gera-se uma por PROPORÇÃO (duas, no caso comum) e
 *      recorta-se para o tamanho exato de cada rede;
 *   3. a arte é conferida DEPOIS do recorte, que é o que o cliente vê, e não
 *      antes. Reprovada, ela é refeita uma vez, com o motivo da reprovação no
 *      prompt.
 *
 * Fica fora da esteira, num arquivo próprio, porque a esteira não pode crescer
 * mais e porque este pedaço precisa de teste próprio, sem banco e sem run.
 */

export interface ArteDoDia {
  /** A arte final de cada rede, já no tamanho que ela publica. */
  porRede: Record<string, string>;
  /**
   * Uma arte para quem só sabe lidar com uma (o card da Diana, telas antigas).
   * É a da rede de maior alcance entre as do dia, na ordem da lista.
   */
  principal?: string;
  /** O que aconteceu, em português, para o log da execução e para a Vera. */
  avisos: string[];
  /** Ficou alguma arte reprovada mesmo depois de refazer. */
  algumaReprovada: boolean;
}

export interface PedidoDeArte {
  redes: string[];
  contentType: string;
  /** O prompt visual que a Diana escreveu. A instrução de formato entra aqui. */
  promptBase: string;
  /**
   * Quem sabe desenhar. Recebe o prompt já com a instrução de formato e a
   * proporção pedida, e devolve um data URI.
   *
   * É um parâmetro, e não um `if`, porque imagem livre e infográfico nascem de
   * caminhos diferentes (um modelo de imagem contra uma extração estruturada) e
   * têm exatamente a mesma necessidade de formato.
   */
  desenhar: (prompt: string, proporcao: ProporcaoPedida) => Promise<string>;
  /**
   * O OUTRO modelo, para quando a reprovação foi de ESCRITA.
   *
   * Existe por uma medição de 19/09: a arte do dia foi reprovada por "Erros de
   * escrita nos títulos", foi refeita, e a refeita veio errada de novo. Refazer
   * no MESMO modelo que acabou de errar a mesma coisa é esperar sorte: cada
   * gerador de imagem tem a sua fraqueza com texto, e ela não muda entre duas
   * chamadas seguidas.
   *
   * Só entra quando o motivo fala de escrita. Trocar de modelo numa reprovação
   * de MARGEM seria piorar de propósito: quem acerta texto normalmente é quem
   * está desenhando, e a margem se resolve com instrução, não com modelo.
   */
  desenharAlternativo?: (prompt: string, proporcao: ProporcaoPedida) => Promise<string>;
  textoDoPost?: string;
  /**
   * O único texto que a arte pode ter: a frase composta em código (30/09).
   * Vai para a conferência, que reprova qualquer outra palavra desenhada.
   */
  textoEsperado?: string[];
  usarOlho?: boolean;
  projectId?: string;
  runId?: string;
}

/**
 * A rede do grupo que sofre o recorte mais violento.
 *
 * É nela que a conferência roda, porque o que passa no recorte mais apertado
 * passa nos outros: um recorte mais suave contém tudo o que o mais apertado
 * continha, e mais um pouco. Confere-se uma vez por grupo em vez de uma por
 * rede, e ainda assim ninguém recebe arte pior que a conferida.
 */
function piorRecorte(redes: Array<{ platform: string; formato: FormatoDaRede }>, proporcao: ProporcaoPedida) {
  const alvo = proporcao === "4:5" ? 4 / 5 : proporcao === "9:16" ? 9 / 16 : proporcao === "1:1" ? 1 : 16 / 9;
  return [...redes].sort(
    (a, b) =>
      Math.abs(b.formato.largura / b.formato.altura - alvo) - Math.abs(a.formato.largura / a.formato.altura - alvo)
  )[0];
}

export async function produzirArtePorRede(pedido: PedidoDeArte): Promise<ArteDoDia> {
  const redes = pedido.redes.length ? pedido.redes : ["linkedin"];
  const grupos = gruposDeFormato(redes, pedido.contentType);
  const porRede: Record<string, string> = {};
  const avisos: string[] = [];
  let algumaReprovada = false;

  for (const grupo of grupos) {
    const nomes = grupo.redes.map((r) => r.platform).join(", ");
    const instrucao = instrucaoDeFormato(grupo.proporcao);
    const pior = piorRecorte(grupo.redes, grupo.proporcao);

    let bruto: string | null = null;
    let veredito: Awaited<ReturnType<typeof conferirArte>> | null = null;

    /**
     * TRÊS TENTATIVAS, desde 20/09. Eram duas, e o teto era TEMPO: o dia tem
     * 800 s e uma geração em alta qualidade levava perto de 90. Com a
     * qualidade média a geração leva 37 s e custa R$ 0,23, então três
     * tentativas em duas proporções cabem com folga (perto de 220 s).
     *
     * O que decidiu: na campanha de prova de 20/09 o revisor visual pegou um
     * "Foi" duplicado na manchete na segunda tentativa, e a arte foi ao ar
     * assim mesmo, porque não havia terceira. Cada tentativa leva o motivo da
     * anterior.
     */
    const TENTATIVAS = 3;
    for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
      const prompt =
        tentativa === 1
          ? `${pedido.promptBase}\n\n${instrucao}`
          : `${pedido.promptBase}\n\n${instrucao}${pedidoDeCorrecao(veredito!)}`;

      /** A reprovação foi de ESCRITA? Então o modelo é parte do problema. */
      const erroDeEscrita =
        tentativa > 1 &&
        /escrit|ortogr|letra|palavra|texto ileg|embolad|soletr|grafia|duplicad|repeti/i.test(veredito?.motivo ?? "");
      const desenhista =
        erroDeEscrita && pedido.desenharAlternativo ? pedido.desenharAlternativo : pedido.desenhar;
      if (erroDeEscrita && pedido.desenharAlternativo) {
        avisos.push(`A reprovação foi de escrita, então a arte ${grupo.proporcao} foi refeita no outro modelo.`);
      }
      bruto = await desenhista(prompt, grupo.proporcao);

      const { dataUri } = await ajustarParaFormato(bruto, pior.formato);
      veredito = await conferirArte(dataUri, {
        formato: pior.formato,
        textoDoPost: pedido.textoDoPost,
        // Com um modelo do book (03/10), o texto que o código compôs além da
        // manchete (itens, lados, cabeçalho) também é permitido.
        textoEsperado: textoPermitidoComModelo(pedido.textoEsperado),
        // Com a frase composta em código, a margem é garantida pelo layout.
        usarRegua: !pedido.textoEsperado,
        // O infográfico é montado em código desde 30/09: todo texto dele vem
        // da extração, e nenhum modelo de imagem desenha nada. O olho ali só
        // estranhava conteúdo legítimo do vídeo que não está no post ("Jetro",
        // na sexta do teste) e fazia a peça idêntica ser refeita três vezes.
        usarOlho: pedido.contentType === "infographic" ? false : pedido.usarOlho,
        projectId: pedido.projectId,
        runId: pedido.runId,
      });

      if (veredito.aprovada) {
        if (tentativa > 1) avisos.push(`A arte ${grupo.proporcao} foi refeita ${tentativa - 1} vez(es) e a tentativa ${tentativa} passou.`);
        break;
      }
      if (tentativa < TENTATIVAS) {
        avisos.push(`Refazendo a arte ${grupo.proporcao} (${nomes}), tentativa ${tentativa + 1}: ${veredito.motivo}`);
      } else {
        algumaReprovada = true;
        avisos.push(`A arte ${grupo.proporcao} (${nomes}) continua com problema depois de ${TENTATIVAS} tentativas: ${veredito.motivo}`);
      }
    }

    // Recorta para cada rede do grupo a partir da arte que ficou.
    for (const { platform, formato } of grupo.redes) {
      const { dataUri } = await ajustarParaFormato(bruto!, formato);
      porRede[platform] = dataUri;
    }
    avisos.push(`${nomes}: ${grupo.redes.map((r) => r.formato.rotulo).join(" · ")}.`);
  }

  // A principal serve as telas que só sabem mostrar uma arte. A ordem não é
  // alfabética: é a de alcance da peça visual no produto.
  const preferencia = ["instagram", "linkedin", "facebook", "twitter", "youtube"];
  const principal = preferencia.map((p) => porRede[p]).find(Boolean) ?? Object.values(porRede)[0];

  return { porRede, principal, avisos, algumaReprovada };
}
