import * as SI from "simple-icons";

/**
 * OS ÍCONES DE MARCA (04/10/2026, regra nova do dono): quando a fala cita uma
 * ferramenta ou empresa (Claude, Notion, Google Drive, Instagram), a peça usa
 * o ícone oficial dela; a responsabilidade pelo uso da marca fica com o
 * cliente, no contrato e nos termos. A fonte é o Simple Icons (pacote
 * `simple-icons` 16.33.0, licença CC0-1.0 para os SVGs; a marca em si
 * continua do dono dela, ver DISCLAIMER.md do pacote), empacotado no worker.
 * Sem a marca na biblioteca, a peça cai no ícone genérico do catálogo.
 * Foto ou perfil de pessoa real que não seja o cliente continua proibido.
 */

export type Marca = { titulo: string; slug: string; hex: string; path: string };

const norm = (s: string) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\+/g, "plus")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

/** Como o falante diz a marca, quando não bate com o título da biblioteca. */
const APELIDOS: Record<string, string> = {
  drive: "googledrive",
  googledrive: "googledrive",
  planilhasgoogle: "googlesheets",
  googleplanilhas: "googlesheets",
  planilhas: "googlesheets",
  googledocs: "googledocs",
  docs: "googledocs",
  agenda: "googlecalendar",
  googleagenda: "googlecalendar",
  insta: "instagram",
  ig: "instagram",
  whats: "whatsapp",
  zap: "whatsapp",
  wpp: "whatsapp",
  claudecode: "claude",
  claudeai: "claude",
  face: "facebook",
  yt: "youtube",
  tiktokshop: "tiktok",
  meet: "googlemeet",
  googlemeet: "googlemeet",
  gemini: "googlegemini",
  googlegemini: "googlegemini",
  x: "x",
  twitter: "x",
};

let indice: Map<string, Marca> | null = null;

function montarIndice(): Map<string, Marca> {
  const m = new Map<string, Marca>();
  for (const v of Object.values(SI) as unknown[]) {
    const i = v as { title?: string; slug?: string; hex?: string; path?: string };
    if (!i || typeof i !== "object" || !i.slug || !i.path) continue;
    const marca: Marca = { titulo: String(i.title ?? i.slug), slug: i.slug, hex: `#${i.hex ?? "000000"}`, path: i.path };
    m.set(i.slug, marca);
    const t = norm(marca.titulo);
    if (t && !m.has(t)) m.set(t, marca);
  }
  return m;
}

/** A marca pelo nome dito ("Google Drive", "notion", "Claude Code"); null quando a biblioteca não tem. */
export function marcaPorNome(nome: unknown): Marca | null {
  if (typeof nome !== "string" || !nome.trim()) return null;
  indice ??= montarIndice();
  const n = norm(nome);
  if (!n) return null;
  const direto = indice.get(APELIDOS[n] ?? n);
  if (direto) return direto;
  // "o Notion AI", "Claude Code": tenta a primeira palavra e o nome sem o sufixo.
  const palavras = String(nome).split(/\s+/).map(norm).filter(Boolean);
  for (let k = palavras.length - 1; k >= 1; k--) {
    const pedaco = palavras.slice(0, k).join("");
    const achou = indice.get(APELIDOS[pedaco] ?? pedaco);
    if (achou) return achou;
  }
  return null;
}

/** Luz relativa da cor da marca (para decidir se o ícone escuro precisa de contorno no fundo escuro). */
export function luzDaMarca(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
