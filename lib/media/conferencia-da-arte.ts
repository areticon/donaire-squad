import { askClaudeComImagem } from "@/lib/claude";
import { medirMargem, type MedidaDeMargem } from "@/lib/media/margem-de-seguranca";
import { MARGEM_SEGURA, type FormatoDaRede } from "@/lib/media/formatos-das-redes";

/**
 * A CONFERÊNCIA DA ARTE, ANTES DE ELA VIRAR PEÇA.
 *
 * O caso de origem é de 18/09: a Diana gerou uma imagem com o número "61%"
 * desenhado colado no topo, cortado pela borda; a Vera aprovou; a peça foi
 * publicada em quatro redes. A Vera aprovou porque tudo o que ela recebia
 * sobre a arte era a frase "GERADA com sucesso". Ninguém tinha olhado a
 * imagem, e ninguém tinha medido nada.
 *
 * São duas conferências, e as duas precisam existir porque erram coisas
 * diferentes:
 *
 *   • a RÉGUA (geometria, local, milissegundos, custo zero) pega elemento
 *     desenhado que a borda corta. Foi calibrada contra a arte do "61%" e
 *     contra duas artes inteiras do mesmo dia. Não sabe ler;
 *   • o OLHO (o modelo vendo a imagem) lê. Pega o que a régua não vê: texto
 *     embolado, palavra inventada, número que contradiz o post. Na amostra de
 *     18/09 uma arte trazia "Rererard" e "naturelgssmeck.com" escritos em
 *     letras grandes, e nenhuma medida geométrica acusaria isso.
 *
 * A régua manda mais que o olho: se a geometria reprovou, está reprovado, o
 * olho falando o contrário ou não falando nada. O olho só ACRESCENTA motivo.
 * É o contrário do que a intuição pede, e é de propósito: a régua é
 * determinística e foi calibrada contra o caso real; o olho é opinião.
 */

export interface VereditoDaArte {
  aprovada: boolean;
  /** Frase pronta para o log, o card e o parecer da Vera. */
  motivo: string;
  medida: MedidaDeMargem;
  /** O que o olho disse, quando ele foi chamado e respondeu. */
  parecerDoOlho?: string;
}

const SISTEMA_DO_OLHO = `Você confere ARTE de rede social antes de ela ir ao ar em nome de um cliente pagante.

Você recebe a imagem e o texto do post que ela acompanha. Responda SEMPRE neste formato, sem nada antes nem depois:

VEREDITO: APROVADA
ou
VEREDITO: REPROVADA
MOTIVO: <uma frase, direta, dizendo o que está errado e onde>

REPROVE quando encontrar qualquer um destes:
1. texto, número, logotipo ou assunto principal CORTADO pela borda da imagem, mesmo que só um pedaço;
2. texto ilegível, embolado, com letras repetidas ou palavras que não existem no idioma (o gerador de imagem escreve errado com frequência: "Rererard", "naturelgssmeck.com", "vaoor");
3. número na arte que CONTRADIZ um número do post;
4. texto tão perto da borda que uma diferença de enquadramento o cortaria;
5. QUALQUER texto além do TEXTO PERMITIDO, quando ele for informado: rótulo, passo numerado ("1", "2", "3"), legenda, balão de fala, placa, tela com escrita, mesmo que em português correto. Leia a imagem inteira, canto por canto, e compare palavra por palavra;
6. qualquer palavra que não exista em português (ex.: "Linicar", "Recalhar", "chocoers"), mesmo pequena, mesmo num canto ou dentro de um desenho;
7. PESSOAS, quando a arte não pode ter gente: rosto, corpo, mão, silhueta ou personagem ilustrado, em foto ou desenho. Arte gerada por IA não mostra estranhos em nome do cliente.

APROVE arte sem texto nenhum, desde que o assunto principal esteja inteiro. Fundo, textura, parede, mesa e céu podem tocar a borda: não são elementos, são fundo.

Não comente estilo, gosto, paleta nem composição. A pergunta é se esta arte pode ir ao ar sem envergonhar quem assina.`;

/**
 * Confere uma arte já ajustada ao formato final da rede.
 *
 * Recebe a imagem DEPOIS do recorte, e não antes, porque o que o cliente vê é
 * o recorte: uma arte perfeita que o recorte corta é uma arte cortada.
 *
 * Nunca lança. Falha de rede no olho vira arte aprovada pela régua, e não
 * campanha parada: a régua sozinha já é mais do que existia antes.
 */
export async function conferirArte(
  dataUri: string,
  opcoes: {
    formato: FormatoDaRede;
    /** O texto do post, para o olho notar número que não bate. */
    textoDoPost?: string;
    /**
     * O ÚNICO texto que pode aparecer na arte (30/09). Quando a frase é
     * composta em código, é ela; qualquer outra palavra é invenção do modelo
     * de imagem ("Linicar as informações", na quarta do teste de 30/09).
     * Lista vazia quer dizer arte sem texto nenhum.
     */
    textoEsperado?: string[];
    /** Gente na arte é permitida? Padrão: não. Arte gerada não mostra estranhos. */
    permitirPessoas?: boolean;
    /** A régua de margem vale? Padrão: sim. Ver o comentário no veredito. */
    usarRegua?: boolean;
    /** Sem isto o olho não é chamado. Desligar é legítimo (custo, tempo). */
    usarOlho?: boolean;
    projectId?: string;
    runId?: string;
  }
): Promise<VereditoDaArte> {
  const medida = await medirMargem(dataUri);

  let parecerDoOlho: string | undefined;
  let olhoReprovou: string | undefined;

  if (opcoes.usarOlho !== false) {
    try {
      const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
      const resposta = await askClaudeComImagem(
        SISTEMA_DO_OLHO,
        [
          `Formato final desta arte: ${opcoes.formato.rotulo}.`,
          `Margem de segurança pedida ao gerador: ${Math.round(MARGEM_SEGURA * 100)}% em cada borda.`,
          opcoes.textoEsperado
            ? opcoes.textoEsperado.length
              ? `\nTEXTO PERMITIDO NA ARTE (e nenhum outro; caixa alta ou baixa não importa):\n${opcoes.textoEsperado.map((t) => `"${t}"`).join("\n")}\nEsse texto foi composto em código, com a margem medida: não reprove por margem nem por borda dele (regras 1 e 4 valem só para o resto da arte).`
              : "\nTEXTO PERMITIDO NA ARTE: nenhum. Qualquer letra ou número reprova."
            : "",
          opcoes.permitirPessoas ? "\nPessoas são permitidas nesta arte." : "\nEsta arte NÃO pode ter pessoas (regra 7).",
          opcoes.textoDoPost ? `\nTEXTO DO POST QUE ELA ACOMPANHA:\n${opcoes.textoDoPost.slice(0, 1200)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        base64,
        "image/jpeg",
        {
          // Tarefa de leitura, não de julgamento profundo: o esforço baixo faz
          // a conferência custar centavos e responder em poucos segundos, que
          // é o que permite chamá-la em toda arte de toda campanha.
          effort: "low",
          maxTokens: 4096,
          timeoutMs: 45_000,
          usage: { projectId: opcoes.projectId, runId: opcoes.runId, operation: "conferencia_da_arte" },
        }
      );
      parecerDoOlho = resposta.trim();
      if (/VEREDITO:\s*REPROVADA/i.test(parecerDoOlho)) {
        olhoReprovou = parecerDoOlho.match(/MOTIVO:\s*(.+)/i)?.[1]?.trim() ?? "o revisor visual reprovou a arte";
      }
    } catch (err) {
      // Falha do olho não reprova nem aprova: some do parecer.
      console.warn("[conferirArte] o olho não respondeu:", err instanceof Error ? err.message : err);
    }
  }

  // A régua existe para frase DESENHADA que a borda corta. Na peça com a frase
  // composta em código (30/09) a frase fica dentro da margem por construção,
  // e a arte sangrar na borda é de propósito: ali a régua só reprovaria à toa.
  const reguaConta = opcoes.usarRegua !== false;
  const motivos = [reguaConta && medida.cortado ? medida.resumo : null, olhoReprovou ? `O revisor visual reprovou: ${olhoReprovou}` : null].filter(
    Boolean
  ) as string[];

  return {
    aprovada: motivos.length === 0,
    motivo: motivos.length ? motivos.join(" ") : medida.resumo,
    medida,
    parecerDoOlho,
  };
}

/**
 * O que acrescentar ao prompt quando a arte foi reprovada e vai ser refeita.
 *
 * Diz o que deu errado em vez de repetir a regra: repetir a mesma instrução
 * que já falhou é o jeito mais confiável de receber o mesmo erro de volta.
 */
export function pedidoDeCorrecao(veredito: VereditoDaArte): string {
  const lados = (Object.entries(veredito.medida.lados) as Array<[string, { cortado: boolean }]>)
    .filter(([, m]) => m.cortado)
    .map(([l]) => ({ topo: "top", baixo: "bottom", esquerda: "left", direita: "right" })[l] ?? l);
  const pct = Math.round(MARGEM_SEGURA * 100);
  return [
    `\n\nPREVIOUS ATTEMPT WAS REJECTED. What went wrong: ${veredito.motivo}`,
    lados.length
      ? `Elements were clipped by the ${lados.join(" and ")} edge${lados.length > 1 ? "s" : ""}.`
      : "",
    `Redo the composition SMALLER and MORE CENTERED: shrink the whole subject so there is at least`,
    `${pct * 2}% of empty background on every side. No text, number or logo anywhere near the frame.`,
    `If the previous attempt had text, prefer an image with NO text at all — the caption carries the words.`,
  ]
    .filter(Boolean)
    .join(" ");
}
