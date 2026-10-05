/**
 * O TRATAMENTO DA FOTO DA CENA (05/10/2026), a parte PURA.
 *
 * O caso do Bruno no projeto Fé & Gestão (paleta #B3001B e #111111): no chat
 * do card do Paulo ele pediu "mude as cores, deixe somente preto e vermelho, e
 * use o papel rasgado como contraste". O pedido rodou inteiro (três cenas
 * novas, três imagens pagas), o Paulo respondeu "Refiz as 3 lâminas" e, para o
 * cliente, as lâminas "continuam as mesmas, com cores fora da paleta". E
 * estavam mesmo: a cena fotográfica que a IA gera tem as cores dela (madeira
 * laranja, céu, papel creme), o prompt só PEDE que ela se incline para o
 * destaque, e nenhuma linha de código garantia a paleta. Pedir de novo ao
 * modelo de imagem é pagar outra vez pelo mesmo acaso.
 *
 * A regra agora: quando o cliente exige PALETA ESTRITA ("somente preto e
 * vermelho", "só as cores da marca", "use só a paleta"), a foto recebe um
 * tratamento em código, sem IA, antes de o texto ser composto:
 *
 *   - "duotone": a foto vira dois tons, o escuro e o destaque da marca
 *     (sombra no escuro, luz no destaque). Cada pixel passa a ser uma cor da
 *     paleta, por construção;
 *   - "pb": preto e branco, para quem pediu assim ou para a marca sem cor de
 *     destaque; o papel e as tiras do modelo dão o contraste.
 *
 * A escolha fica gravada no metadata do post e do card (`tratamento`), para
 * as próximas regerações respeitarem, e existe também como opção da
 * identidade visual (Configurações, Modelos: "Fotos: naturais, preto e branco,
 * nas cores da marca"), com prévia.
 *
 * Este arquivo não importa banco, fs nem sharp: a galeria (componente de
 * cliente) lê daqui os rótulos e a leitura do pedido. O pixel é tratado em
 * lib/media/tratamento-da-foto.ts.
 */

export type TratamentoDaFoto = "duotone" | "pb";

/** A opção como o cliente escolhe na identidade. */
export type FotosDaIdentidade = "naturais" | "pb" | "marca";

export const FOTOS_DA_IDENTIDADE: Record<FotosDaIdentidade, { nome: string; descricao: string }> = {
  naturais: { nome: "Naturais", descricao: "A foto com as cores dela." },
  pb: { nome: "Preto e branco", descricao: "A foto sem cor; a paleta fica no fundo, no título e no destaque." },
  marca: { nome: "Nas cores da marca", descricao: "A foto em dois tons: o fundo e o destaque da sua paleta." },
};

export const FOTOS_PADRAO: FotosDaIdentidade = "naturais";

export function fotosValidas(v: unknown): v is FotosDaIdentidade {
  return typeof v === "string" && v in FOTOS_DA_IDENTIDADE;
}

export function tratamentoValido(v: unknown): v is TratamentoDaFoto {
  return v === "duotone" || v === "pb";
}

/** O tratamento que a opção da identidade pede. */
export function tratamentoDasFotos(fotos: FotosDaIdentidade | null | undefined): TratamentoDaFoto | null {
  return fotos === "marca" ? "duotone" : fotos === "pb" ? "pb" : null;
}

/** Como o tratamento é contado ao cliente, na resposta do chat. */
export const NOME_DO_TRATAMENTO: Record<TratamentoDaFoto, string> = {
  duotone: "em duotone nas cores da marca",
  pb: "em preto e branco",
};

/** O modelo do book de colagem com foto (categoria "Colagem e papel"). */
export const MODELO_DE_PAPEL = "colagem-fita-adesiva";

// ── A leitura do pedido, por palavra ─────────────────────────────────────────

const NOMES_DE_COR = "preto|preta|branco|branca|vermelho|vermelha|azul|verde|amarelo|amarela|laranja|roxo|roxa|rosa|cinza|dourado|dourada|bege|marrom|vinho|escarlate";
const SO = "(?:somente|s[oó]|apenas|unicamente|exclusivamente)";

/**
 * O cliente exige paleta estrita? Vale "somente preto e vermelho", "só as
 * cores da marca", "use só a paleta", "apenas cores da marca", "nada fora da
 * paleta". "Mude a cor para vermelho" não é estrito: é uma cor a mais.
 */
export function pedidoDePaletaEstrita(texto: string): boolean {
  const t = texto.toLowerCase();
  if (new RegExp(`\\b${SO}\\s+(?:em\\s+|com\\s+|o\\s+|a\\s+|as\\s+|os\\s+)?(?:${NOMES_DE_COR})\\b`, "i").test(t)) return true;
  if (new RegExp(`\\b${SO}\\s+(?:a\\s+|as\\s+|o\\s+|os\\s+|na\\s+|nas\\s+|com\\s+a\\s+|com\\s+as\\s+|com\\s+os\\s+)?(?:cores?|paleta|tons?)\\b`, "i").test(t)) return true;
  if (/\b(?:cores?|paleta|tons?)\s+da\s+marca\b/i.test(t) && new RegExp(`\\b${SO}\\b`, "i").test(t)) return true;
  if (/\b(?:nada|nenhuma\s+cor)\s+fora\s+da\s+(?:paleta|marca)\b/i.test(t)) return true;
  if (/\bpaleta\s+estrita\b/i.test(t)) return true;
  return false;
}

/** O cliente pediu preto e branco de fato (e não preto E vermelho). */
export function pedidoDePretoEBranco(texto: string): boolean {
  return /\bpreto\s+e\s+branco\b|\bp\s*&\s*b\b|\bp\/b\b|\bmonocrom/i.test(texto);
}

/** O cliente pediu papel, colagem, recorte, rasgado: o modelo de colagem do book. */
export function pedidoDePapel(texto: string): boolean {
  return /\bpap[eé]is?\b|\bpapel\b|\bcolagem\b|\brecort|\brasgad|\bfita\s+adesiva\b|\bcut.?out\b/i.test(texto);
}

/**
 * O tratamento que um pedido do chat exige. Null quando o cliente não falou
 * em paleta estrita: a foto segue como o projeto manda (a identidade ou o que
 * já estava gravado no post).
 */
export function tratamentoDoPedido(texto: string, marcaTemDestaque = true): TratamentoDaFoto | null {
  if (pedidoDePretoEBranco(texto)) return "pb";
  if (!pedidoDePaletaEstrita(texto)) return null;
  return marcaTemDestaque ? "duotone" : "pb";
}
