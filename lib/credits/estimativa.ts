/**
 * QUANTO UMA CAMPANHA VAI COBRAR, e a conta é UMA só.
 *
 * Este módulo existe por causa de 21/09: a janela da campanha dizia "esta
 * campanha cobra do plano 688 créditos" e, ao confirmar, o servidor recusava
 * dizendo que a campanha custava mais do que o cliente tinha. Duas contas
 * diferentes para a mesma pergunta, e a pior parte é que o cliente decidiu
 * olhando a que estava errada.
 *
 * As duas divergiam em tudo o que importa:
 *
 *   • a janela somava um preço fixo por TIPO de peça (imagem 8, infográfico 5)
 *     que vinha de agosto e não existe mais em lugar nenhum;
 *   • a janela ignorava as REDES. O texto é cobrado por rede, e um dia em
 *     quatro redes custa quatro redações. Era a maior parte da conta, e ela
 *     simplesmente não estava lá;
 *   • o servidor usava `estimarCampanha`, com os preços de verdade.
 *
 * Aqui não há preço novo: é a MESMA `estimarCampanha` do servidor, movida para
 * um arquivo sem banco para a tela poder importar. A regra que fica é a mesma
 * do crédito de vídeo em `lib/credits/video-tabela.ts`: **conta que existe em
 * dois lugares é conta que vai divergir**, e quando diverge é sempre o cliente
 * que descobre.
 */
import { CREDIT_COSTS } from "@/lib/credits/tabela";
import { formatoDaPeca, gruposDeFormato } from "@/lib/media/formatos-das-redes";

/** Os tipos cuja mídia é uma arte por proporção. */
const GERA_ARTE = new Set(["image", "infographic"]);

/** O custo da mídia de uma peça, em créditos. A unidade é a GERAÇÃO. */
export function custoDaMidia(mediaType: string | null, laminas?: number): number {
  switch (mediaType) {
    case "image":
    case "infographic":
      return CREDIT_COSTS.imagem_geracao;
    case "carousel":
      return CREDIT_COSTS.carousel_lamina * Math.max(3, laminas ?? 3);
    default:
      return 0;
  }
}

export type DiaDaCampanha = {
  /** O tipo de peça daquele dia: text, image, carousel, video, free... */
  tipo: string | undefined;
  /** As redes daquele dia, quando são conhecidas. */
  redes?: string[];
};

/**
 * A estimativa de uma campanha, em créditos do plano.
 *
 * Superestima de propósito: assume que todo dia agendado vira post em todas as
 * redes conectadas e que "livre" custa como imagem, que é o cenário mais caro.
 * Barrar quem não tem saldo é o objetivo; deixar passar quem tem é o efeito
 * colateral aceitável, porque a cobrança real acontece depois, pelo que foi
 * entregue.
 *
 * O VÍDEO NÃO ENTRA. Ele sai da carteira de vídeo, e misturar as duas contas
 * numa linha só foi o que fez a janela dizer um número e o erro dizer outro.
 */
export function estimarCampanha(args: {
  dias: DiaDaCampanha[];
  /** Quantas redes a campanha publica, quando o dia não diz. */
  redesConectadas: number;
  laminasDoCarrossel?: number;
  /** Quantas semanas: a quinzenal roda a mesma semana duas vezes. */
  semanas?: number;
}): number {
  const redes = Math.max(1, args.redesConectadas);
  const semanas = Math.max(1, args.semanas ?? 1);
  const porSemana = args.dias.reduce((soma, dia) => {
    const midia = dia.tipo === "free" ? "image" : (dia.tipo ?? "text");
    const redesDoDia = dia.redes?.length ? dia.redes.length : redes;
    const texto = CREDIT_COSTS.post_text * redesDoDia;

    if (midia === "carousel") {
      return soma + texto + custoDaMidia("carousel", args.laminasDoCarrossel);
    }
    if (GERA_ARTE.has(midia)) {
      // Quantas GERAÇÕES, e não quantas redes: a esteira desenha uma arte por
      // PROPORÇÃO e recorta para cada rede do grupo. Quem recebe recorte não
      // paga geração.
      const geracoes = dia.redes?.length
        ? gruposDeFormato(dia.redes, midia).length
        : Math.min(2, redes);
      return soma + texto + custoDaMidia(midia) * geracoes;
    }
    // Vídeo, enquete, thread e artigo: só o texto sai do plano.
    return soma + texto;
  }, 0);
  return porSemana * semanas;
}

/**
 * O QUE CUSTA REFAZER UMA PEÇA (21/09).
 *
 * Refazer é ENTREGA NOVA: o redator escreve de novo e, quando a peça tem arte,
 * a Diana desenha de novo. Os dois custam o mesmo que custaram da primeira
 * vez, então a conta é a mesma tabela, sem desconto e sem preço próprio.
 *
 * Uma peça, e não um dia: aqui é uma rede só, então o texto conta UMA vez. E
 * a arte é uma geração só, porque a peça refeita tem uma proporção só, a da
 * rede dela.
 *
 * O VÍDEO NÃO ENTRA, como em `estimarCampanha`: ele sai da carteira de vídeo,
 * e misturar as duas contas numa linha só foi o que fez a janela dizer um
 * número e o servidor dizer outro em 21/09. Refazer um dia de vídeo refaz o
 * texto e a arte do quadro; o clipe se refaz pelo caminho do vídeo.
 */
export function custoDeRefazerPeca(args: {
  mediaType: string | null | undefined;
  /** Quantas lâminas o carrossel tem, contadas na peça que existe. */
  laminas?: number;
}): number {
  return CREDIT_COSTS.post_text + custoDaMidia(args.mediaType ?? "text", args.laminas);
}

/** O que cada dia custa, para a tela abrir a conta linha a linha. */
export function detalharCampanha(args: {
  dias: DiaDaCampanha[];
  redesConectadas: number;
  laminasDoCarrossel?: number;
  semanas?: number;
}): Array<{ tipo: string; creditos: number }> {
  const semanas = Math.max(1, args.semanas ?? 1);
  return args.dias.map((dia) => ({
    tipo: dia.tipo ?? "text",
    creditos:
      estimarCampanha({ ...args, dias: [dia], semanas: 1 }) * semanas,
  }));
}

export { formatoDaPeca };
