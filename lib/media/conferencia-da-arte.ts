import { askClaudeComImagem } from "@/lib/claude";
import { jevLigado, perguntarAoJev, probabilidadeDeSim, type PerguntaDoJev, type UsoDoJev } from "@/lib/jev/cliente";
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
  /** Quem julgou o olho (03/10): o Sonnet vendo a imagem, ou o Haiku descrevendo e o JEV decidindo. */
  olhoPor?: "sonnet" | "haiku+jev";
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

// ───────────────────── o olho em duas partes (03/10) ─────────────────────

/**
 * O OLHO EM DUAS PARTES (03/10/2026): VER e DECIDIR separados.
 *
 * Decisão do Bruno de 02/10: decisão sobre texto vai ao JEV, e o JEV não vê
 * imagem. Então um modelo barato com visão (Haiku) só TRANSCREVE e DESCREVE a
 * arte (texto letra por letra, com os erros; gente; o que a borda corta), e o
 * JEV decide cada regra do SISTEMA_DO_OLHO sobre essa descrição. Decide só
 * quem está confiante: alguma regra >= 0,7 reprova, todas <= 0,3 aprova; o
 * meio, e qualquer falha, cai no Sonnet de sempre.
 *
 * ## O que a medição mandou: DESLIGADO por padrão (03/10, 31 artes reais)
 * Economiza 41% (US$ 0,177 contra US$ 0,104 nas 31 artes, contando a dúvida
 * que volta ao Sonnet), mas é duas vezes mais lento (3,3 s contra 1,7 s por
 * arte) e erra justamente o caso para o qual o olho existe: o Haiku CONSERTA
 * a palavra ao transcrever. Na arte cmu7hm4zq estava escrito "syetem for
 * tired days"; o Haiku leu "system", e o JEV aprovou uma arte com palavra
 * errada. Na primeira rodada o Haiku ainda inventou uma pessoa numa cadeira
 * vazia (reprovação falsa, que custa uma arte nova, uns US$ 0,04, mais do
 * que a economia de 17 conferências). A economia, US$ 0,0024 por arte (uns
 * US$ 0,50 por mês no volume de setembro), não paga arte errada no ar.
 * Fica o código para medir de novo com um modelo de visão melhor.
 *
 * Interruptor: CONFERENCIA_PELO_JEV=1 liga (e precisa do JEV ligado); sem
 * ele, o Sonnet confere como sempre. Prova: scripts/tmp/conferencia-prova-0310.mts.
 */
export function conferenciaPeloJev(): boolean {
  return jevLigado() && process.env.CONFERENCIA_PELO_JEV === "1";
}

const MODELO_DA_DESCRICAO = process.env.CONFERENCIA_MODELO_DA_DESCRICAO || "claude-haiku-4-5";
const REPROVA = 0.7;
const APROVA = 0.3;

const SISTEMA_DA_DESCRICAO = `Você TRANSCREVE e DESCREVE uma arte de rede social. Você não julga e não corrige nada.

Leia a imagem inteira, canto por canto: manchete, texto pequeno, rótulo, placa, tela, embalagem, balão, número, logotipo, texto dentro de desenho.
Copie cada texto LETRA POR LETRA, exatamente como está desenhado, COM os erros: o gerador de imagem troca e repete letras ("Rererard", "vaoor", "estratgia" no lugar de "estratégia", "o o"), e o seu trabalho é copiar o erro, não o que a palavra deveria ser. Leia cada palavra letra a letra antes de escrever. Nunca conserte palavra. Letra que não dá para ler vira "?". Símbolo desenhado (ícone de interrogação, seta) não é texto.

"borda": "cortado" só quando a borda da IMAGEM corta letras; "perto" só quando o texto encosta na borda da IMAGEM (menos de 3% de folga); senão "longe". A borda de um cartão ou caixa dentro da arte não conta.
"pessoas": só o que você VÊ com clareza: rosto, corpo, mão, silhueta humana ou personagem. Cadeira vazia, roupa sem corpo, estátua sem rosto humano, sombra indefinida: "nenhuma".

Responda SOMENTE com JSON válido, sem cerca de código:
{"textos":[{"texto":"...","onde":"topo, centro, base, canto superior esquerdo...","borda":"longe | perto | cortado"}],
 "pessoas":"nenhuma" ou o que aparece (rosto, corpo, mão, silhueta, personagem ilustrado; foto ou desenho),
 "cortado":"nada" ou o elemento (não o fundo) que a borda da imagem corta,
 "assunto":"o assunto principal em poucas palavras"}
Sem texto nenhum na arte, "textos" é [].`;

type DescricaoDaArte = {
  textos?: Array<{ texto?: string; onde?: string; borda?: string }>;
  pessoas?: string;
  cortado?: string;
  assunto?: string;
};

/** Palavras normalizadas (caixa e pontuação fora; acento fica, porque acento errado é erro). */
function palavras(t: string): string[] {
  return t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * O olho barato: Haiku descreve, JEV decide. `decidido` falso quer dizer
 * dúvida (alguma regra entre 0,3 e 0,7): quem chama vai ao Sonnet.
 */
async function olharPeloJev(
  base64: string,
  opcoes: Parameters<typeof conferirArte>[1]
): Promise<{ decidido: boolean; parecer?: string; reprovou?: string; descricao: DescricaoDaArte; notas: Record<string, number | null> }> {
  const bruto = await askClaudeComImagem(SISTEMA_DA_DESCRICAO, `Formato da arte: ${opcoes.formato.rotulo}. Transcreva e descreva.`, base64, "image/jpeg", {
    model: MODELO_DA_DESCRICAO,
    maxTokens: 4096,
    timeoutMs: 45_000,
    usage: { projectId: opcoes.projectId, runId: opcoes.runId, operation: "conferencia_da_arte_descricao" },
  });
  const limpo = bruto.trim().replace(/^```(?:json)?\s*/i, "").replace(/```$/, "");
  const descricao = JSON.parse(limpo.slice(limpo.indexOf("{"), limpo.lastIndexOf("}") + 1)) as DescricaoDaArte;
  const textos = (descricao.textos ?? []).filter((t) => String(t?.texto ?? "").trim());

  // Em código, o que é contagem: as palavras da arte que não estão no texto permitido.
  const permitidas = new Set((opcoes.textoEsperado ?? []).flatMap(palavras));
  const foraDoPermitido = opcoes.textoEsperado ? textos.flatMap((t) => palavras(String(t.texto))).filter((w) => !permitidas.has(w)) : [];

  const state = {
    contexto:
      "Conferência de uma arte de rede social antes de ir ao ar em nome de um cliente. Quem viu a imagem transcreveu o texto LETRA POR LETRA, com os erros, sem corrigir. Fundo, textura, parede, mesa e céu tocando a borda não contam: não são elementos.",
    formato: opcoes.formato.rotulo,
    textoPermitido: opcoes.textoEsperado
      ? opcoes.textoEsperado.length
        ? `${opcoes.textoEsperado.map((t) => `"${t}"`).join(" ")} (composto em código: a borda dele não conta)`
        : "nenhum: qualquer letra ou número reprova"
      : "não informado",
    palavrasForaDoTextoPermitido: opcoes.textoEsperado ? foraDoPermitido : "não se aplica",
    pessoasPermitidas: Boolean(opcoes.permitirPessoas),
    textoDoPost: opcoes.textoDoPost ? opcoes.textoDoPost.slice(0, 1200) : "não informado",
    descricaoDaArte: { ...descricao, textos },
  };
  const regras: Record<string, { pergunta: string; motivo: string }> = {
    cortado: {
      pergunta:
        "Pela descrição, algum texto, número, logotipo ou o assunto principal está CORTADO pela borda da imagem (campo cortado diferente de \"nada\", ou texto com borda \"cortado\"), ou algum texto que NÃO é o texto permitido tem borda \"perto\"?",
      motivo: "elemento cortado ou encostado na borda",
    },
    escrita: {
      pergunta:
        "Algum texto transcrito tem palavra que não existe em português (ou no idioma do texto), letras repetidas, letras embaralhadas, texto embolado ou letra ilegível (\"?\")? Nome próprio, sigla e hashtag corretos não contam.",
      motivo: "texto com palavra que não existe ou escrita errada",
    },
  };
  if (opcoes.textoEsperado) {
    regras.extra = {
      pergunta:
        "Há na arte QUALQUER texto além do texto permitido (rótulo, número, passo numerado, legenda, placa, tela com escrita), comparando palavra por palavra e ignorando caixa e pontuação? A lista palavrasForaDoTextoPermitido ajuda: vazia quer dizer que não há.",
      motivo: "texto além do permitido",
    };
  }
  if (opcoes.textoDoPost) {
    regras.numero = { pergunta: "Algum número escrito na arte CONTRADIZ um número do texto do post?", motivo: "número na arte que contradiz o post" };
  }
  if (!opcoes.permitirPessoas) {
    regras.pessoas = {
      pergunta: "A descrição mostra PESSOA na arte: rosto, corpo, mão, silhueta ou personagem ilustrado, em foto ou desenho?",
      motivo: "a arte tem pessoa, e esta arte não pode ter",
    };
  }
  const perguntas: Record<string, PerguntaDoJev> = Object.fromEntries(
    Object.entries(regras).map(([k, r]) => [k, { type: "noul", instructions: r.pergunta } as PerguntaDoJev])
  );
  const respostas = await perguntarAoJev({ projectId: opcoes.projectId, etapa: "conferencia-da-arte", state, uso: opcoes.usoDoJev }, perguntas);
  const notas: Record<string, number | null> = Object.fromEntries(Object.keys(regras).map((k) => [k, probabilidadeDeSim(respostas[k])]));

  const quebradas = Object.keys(regras).filter((k) => (notas[k] ?? 0.5) >= REPROVA);
  if (quebradas.length) {
    const detalhe = (k: string) =>
      k === "pessoas"
        ? `: ${descricao.pessoas}`
        : k === "cortado"
          ? `: ${descricao.cortado && descricao.cortado !== "nada" ? descricao.cortado : textos.filter((t) => t.borda !== "longe").map((t) => `"${t.texto}"`).join(", ")}`
          : k === "extra" && foraDoPermitido.length
            ? `: "${foraDoPermitido.slice(0, 6).join(" ")}"`
            : k === "escrita"
              ? `: ${textos.map((t) => `"${t.texto}"`).join(", ").slice(0, 200)}`
              : "";
    const reprovou = quebradas.map((k) => `${regras[k].motivo}${detalhe(k)}`).join("; ");
    return { decidido: true, reprovou, parecer: `VEREDITO: REPROVADA\nMOTIVO: ${reprovou}`, descricao, notas };
  }
  if (Object.values(notas).every((n) => n !== null && n <= APROVA)) {
    return { decidido: true, parecer: "VEREDITO: APROVADA", descricao, notas };
  }
  return { decidido: false, descricao, notas };
}

/** Só para a prova (scripts/tmp/conferencia-prova-0310.mts): o olho barato sem o resto. */
export const olharPeloJevParaProva = olharPeloJev;

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
    /** Acumulador do uso do JEV (a prova mede por aqui). */
    usoDoJev?: UsoDoJev;
  }
): Promise<VereditoDaArte> {
  const medida = await medirMargem(dataUri);

  let parecerDoOlho: string | undefined;
  let olhoReprovou: string | undefined;
  let olhoPor: VereditoDaArte["olhoPor"];

  // 03/10: o Haiku descreve, o JEV decide; a dúvida e a falha caem no Sonnet abaixo.
  if (opcoes.usarOlho !== false && conferenciaPeloJev()) {
    const r = await olharPeloJev(dataUri.slice(dataUri.indexOf(",") + 1), opcoes).catch((e: unknown) => {
      console.warn("[conferirArte] Haiku+JEV falhou, vai ao Sonnet:", e instanceof Error ? e.message : e);
      return null;
    });
    if (r?.decidido) {
      parecerDoOlho = r.parecer;
      olhoReprovou = r.reprovou;
      olhoPor = "haiku+jev";
    }
  }

  if (opcoes.usarOlho !== false && !olhoPor) {
    olhoPor = "sonnet";
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
    olhoPor,
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
