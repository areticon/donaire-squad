/**
 * AS MARCAS CITADAS NA FALA (30/09/2026). Pedido do dono, olhando o editor
 * reprovado: "quando cito ChatGPT, o logo aparecer". Nos tutoriais de
 * referência (Claude + Higgsfield) todo produto nomeado vira o ícone dele,
 * recortado como papel, na palavra em que é dito.
 *
 * ## Por que o ícone NÃO é gerado por IA
 *
 * Logotipo gerado sai torto (letra errada, forma parecida mas não igual), e
 * logo errado de marca conhecida é o defeito que o espectador vê primeiro.
 * Aqui o desenho é o SVG oficial de pacote aberto, renderizado em código
 * (lib/media/icones-de-marca.ts): custo zero e sempre igual.
 *
 * Fontes (licença conferida em 30/09, os SVGs ficam copiados em
 * lib/media/icones-de-marca-svg.ts pelo scripts/gerar-icones-de-marca.mts):
 *   - @iconify-json/logos (CC0, coleção de Gil Barbara): logos coloridos;
 *   - @iconify-json/vscode-icons (MIT): os do Office (Excel, PowerPoint...),
 *     que o simple-icons tirou a pedido da Microsoft;
 *   - simple-icons (CC0): monocromáticos, na cor oficial da marca.
 * A marca continua sendo de quem é dono; o uso é nominativo (o narrador cita o
 * produto e o ícone identifica o produto citado), nunca como selo de parceria.
 *
 * ## Detecção por código, escolha pelo diretor
 *
 * O código acha as menções (palavra e índice) e entrega a lista pronta ao
 * diretor; o diretor decide em que cena e zona o ícone entra, e o validador só
 * aceita ícone de marca que foi DITA naquela cena. Mesma regra do texto na
 * tela: nada aparece que não saiu da boca do cliente.
 */

/**
 * A mesma normalização de lib/media/plano-de-montagem.ts (minúsculas, sem
 * acento, sem pontuação), copiada para não criar importação circular: o
 * validador do plano importa este módulo.
 */
function normalizarPalavra(p: string): string {
  return p.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");
}

export type FonteDoIcone = { pacote: "logos" | "vscode-icons" | "simple-icons"; icone: string };

export type MarcaConhecida = {
  id: string;
  nome: string;
  /** Sequências já normalizadas (minúsculas, sem acento), separadas por espaço. */
  apelidos: string[];
  /**
   * Formas que a transcrição produz por engano e que só valem PERTO de outra
   * marca de IA: o Whisper escreve "Cloud" quando o narrador diz "Claude"
   * ("o ChatGPT ou o Cloud ali no chat", corte 0 de 29/09). Sozinho, "cloud"
   * é nuvem e não vira logo de ninguém.
   */
  duvidosos?: string[];
  fonte: FonteDoIcone;
};

export const MARCAS: MarcaConhecida[] = [
  { id: "chatgpt", nome: "ChatGPT", apelidos: ["chatgpt", "chat gpt", "gpt", "openai", "open ai"], fonte: { pacote: "logos", icone: "openai-icon" } },
  { id: "claude", nome: "Claude", apelidos: ["claude", "anthropic"], duvidosos: ["cloud", "claud", "clode", "clod"], fonte: { pacote: "logos", icone: "claude-icon" } },
  { id: "gemini", nome: "Gemini", apelidos: ["gemini", "google gemini"], fonte: { pacote: "logos", icone: "google-gemini-icon" } },
  { id: "perplexity", nome: "Perplexity", apelidos: ["perplexity"], fonte: { pacote: "logos", icone: "perplexity-icon" } },
  { id: "deepseek", nome: "DeepSeek", apelidos: ["deepseek", "deep seek"], fonte: { pacote: "logos", icone: "deepseek-icon" } },
  { id: "grok", nome: "Grok", apelidos: ["grok"], fonte: { pacote: "logos", icone: "grok-icon" } },
  { id: "midjourney", nome: "Midjourney", apelidos: ["midjourney", "mid journey"], fonte: { pacote: "logos", icone: "midjourney" } },
  { id: "lovable", nome: "Lovable", apelidos: ["lovable"], fonte: { pacote: "logos", icone: "lovable-icon" } },
  { id: "cursor", nome: "Cursor", apelidos: [], duvidosos: ["cursor"], fonte: { pacote: "logos", icone: "cursor-icon" } },
  { id: "n8n", nome: "n8n", apelidos: ["n8n", "n8n.io"], fonte: { pacote: "logos", icone: "n8n-icon" } },
  { id: "zapier", nome: "Zapier", apelidos: ["zapier"], fonte: { pacote: "logos", icone: "zapier-icon" } },
  { id: "google", nome: "Google", apelidos: ["google"], fonte: { pacote: "logos", icone: "google-icon" } },
  { id: "gmail", nome: "Gmail", apelidos: ["gmail"], fonte: { pacote: "logos", icone: "google-gmail" } },
  { id: "google-drive", nome: "Google Drive", apelidos: ["google drive"], fonte: { pacote: "logos", icone: "google-drive" } },
  { id: "google-sheets", nome: "Google Sheets", apelidos: ["google sheets", "planilha do google", "planilhas do google"], fonte: { pacote: "simple-icons", icone: "googlesheets" } },
  { id: "google-meet", nome: "Google Meet", apelidos: ["google meet"], fonte: { pacote: "logos", icone: "google-meet" } },
  { id: "notion", nome: "Notion", apelidos: ["notion"], fonte: { pacote: "logos", icone: "notion-icon" } },
  { id: "excel", nome: "Excel", apelidos: ["excel"], fonte: { pacote: "vscode-icons", icone: "file-type-excel" } },
  { id: "powerpoint", nome: "PowerPoint", apelidos: ["powerpoint", "power point", "ppt"], fonte: { pacote: "vscode-icons", icone: "file-type-powerpoint" } },
  { id: "word", nome: "Word", apelidos: ["microsoft word"], duvidosos: ["word"], fonte: { pacote: "vscode-icons", icone: "file-type-word" } },
  { id: "outlook", nome: "Outlook", apelidos: ["outlook"], fonte: { pacote: "vscode-icons", icone: "file-type-outlook" } },
  { id: "teams", nome: "Microsoft Teams", apelidos: ["microsoft teams"], duvidosos: ["teams"], fonte: { pacote: "logos", icone: "microsoft-teams" } },
  { id: "microsoft", nome: "Microsoft", apelidos: ["microsoft"], fonte: { pacote: "logos", icone: "microsoft-icon" } },
  { id: "windows", nome: "Windows", apelidos: ["windows"], fonte: { pacote: "logos", icone: "microsoft-windows-icon" } },
  { id: "apple", nome: "Apple", apelidos: ["apple"], fonte: { pacote: "logos", icone: "apple" } },
  { id: "android", nome: "Android", apelidos: ["android"], fonte: { pacote: "logos", icone: "android-icon" } },
  { id: "youtube", nome: "YouTube", apelidos: ["youtube", "you tube"], fonte: { pacote: "logos", icone: "youtube-icon" } },
  { id: "instagram", nome: "Instagram", apelidos: ["instagram", "insta"], fonte: { pacote: "logos", icone: "instagram-icon" } },
  { id: "linkedin", nome: "LinkedIn", apelidos: ["linkedin", "linked in"], fonte: { pacote: "logos", icone: "linkedin-icon" } },
  { id: "whatsapp", nome: "WhatsApp", apelidos: ["whatsapp", "whats app", "zap", "zapzap"], fonte: { pacote: "logos", icone: "whatsapp-icon" } },
  { id: "tiktok", nome: "TikTok", apelidos: ["tiktok", "tik tok"], fonte: { pacote: "logos", icone: "tiktok-icon" } },
  { id: "x", nome: "X (Twitter)", apelidos: ["twitter"], fonte: { pacote: "logos", icone: "x" } },
  { id: "facebook", nome: "Facebook", apelidos: ["facebook"], fonte: { pacote: "logos", icone: "facebook" } },
  { id: "meta", nome: "Meta", apelidos: ["meta ai"], fonte: { pacote: "logos", icone: "meta-icon" } },
  { id: "slack", nome: "Slack", apelidos: ["slack"], fonte: { pacote: "logos", icone: "slack-icon" } },
  { id: "trello", nome: "Trello", apelidos: ["trello"], fonte: { pacote: "logos", icone: "trello" } },
  { id: "figma", nome: "Figma", apelidos: ["figma"], fonte: { pacote: "logos", icone: "figma" } },
  { id: "spotify", nome: "Spotify", apelidos: ["spotify"], fonte: { pacote: "logos", icone: "spotify-icon" } },
  { id: "netflix", nome: "Netflix", apelidos: ["netflix"], fonte: { pacote: "logos", icone: "netflix-icon" } },
  { id: "shopify", nome: "Shopify", apelidos: ["shopify"], fonte: { pacote: "logos", icone: "shopify" } },
  { id: "hubspot", nome: "HubSpot", apelidos: ["hubspot", "hub spot"], fonte: { pacote: "simple-icons", icone: "hubspot" } },
];

const POR_ID = new Map(MARCAS.map((m) => [m.id, m]));

export function marcaPorId(id: unknown): MarcaConhecida | null {
  return typeof id === "string" ? POR_ID.get(id.trim().toLowerCase()) ?? null : null;
}

/** Marcas de IA: é perto delas que um "cloud" da transcrição vira Claude. */
const DE_IA = new Set(["chatgpt", "claude", "gemini", "perplexity", "deepseek", "grok", "midjourney", "lovable", "cursor", "n8n", "zapier", "notion"]);

export type MencaoDeMarca = {
  marca: string;
  nome: string;
  /** Índice da PRIMEIRA palavra da menção na fala (é a âncora do ícone). */
  palavra: number;
  /** Quantas palavras a menção ocupa ("power point" = 2). */
  tamanho: number;
  /** Veio de forma duvidosa confirmada pela vizinhança ("Cloud" perto de "ChatGPT"). */
  inferida?: boolean;
};

/**
 * Todas as menções de marca na fala, em ordem. Procura a sequência mais longa
 * primeiro ("google drive" antes de "google"), e uma palavra só pertence a
 * uma menção.
 */
export function marcasNaFala(palavras: { texto: string }[]): MencaoDeMarca[] {
  const norm = palavras.map((p) => normalizarPalavra(p.texto));
  const certas: MencaoDeMarca[] = [];
  const duvidosas: MencaoDeMarca[] = [];
  const usadas = new Set<number>();
  for (let i = 0; i < norm.length; i++) {
    if (usadas.has(i) || !norm[i]) continue;
    let achou: { m: MarcaConhecida; n: number; duvidosa: boolean } | null = null;
    for (let n = 3; n >= 1 && !achou; n--) {
      if (i + n > norm.length) continue;
      const seq = norm.slice(i, i + n).join(" ");
      const colado = norm.slice(i, i + n).join("");
      for (const m of MARCAS) {
        const apelidos = m.apelidos.map((a) => a.split(" ").map(normalizarPalavra).join(" "));
        if (apelidos.includes(seq) || (n > 1 && apelidos.includes(colado))) {
          achou = { m, n, duvidosa: false };
          break;
        }
        if (n === 1 && (m.duvidosos ?? []).includes(seq)) achou = { m, n, duvidosa: true };
      }
    }
    if (!achou) continue;
    for (let k = i; k < i + achou.n; k++) usadas.add(k);
    const mencao: MencaoDeMarca = { marca: achou.m.id, nome: achou.m.nome, palavra: i, tamanho: achou.n };
    (achou.duvidosa ? duvidosas : certas).push(mencao);
  }
  // A duvidosa só vale com uma marca de IA certa a até 8 palavras.
  for (const d of duvidosas) {
    const perto = certas.some((c) => DE_IA.has(c.marca) && c.marca !== d.marca && Math.abs(c.palavra - d.palavra) <= 8);
    if (perto) certas.push({ ...d, inferida: true });
  }
  return certas.sort((a, b) => a.palavra - b.palavra);
}
