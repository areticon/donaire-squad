/**
 * A aparência dos bonecos de massinha do escritório 3D.
 *
 * Nasceu em 28/09/2026, quando o robô único recolorido saiu: o Bruno pediu que
 * os agentes tivessem a cara da arte de massinha e que o usuário pudesse
 * PERSONALIZAR o próprio avatar ("escolher cabelo, corpo homem ou mulher,
 * etc"). Por isso o boneco é montado por partes, e cada parte é uma escolha.
 *
 * Módulo puro, sem React e sem banco: a tela de personalizar (cliente), a rota
 * que grava a escolha (servidor) e a cena 3D importam daqui.
 */

export type Corpo = "homem" | "mulher";
export type EstiloDeCabelo = "curto" | "cacheado" | "coque" | "chanel" | "longo" | "careca";
export type Acessorio = "nenhum" | "fone" | "fonePescoco" | "headset" | "bone";

export type Aparencia = {
  corpo: Corpo;
  pele: string;
  cabelo: EstiloDeCabelo;
  corDoCabelo: string;
  roupa: string;
  calca: string;
  oculos: boolean;
  barba: boolean;
  acessorio: Acessorio;
  /** Cor do boné, quando o acessório é boné. */
  corDoAcessorio: string;
};

/** As opções que a tela de personalizar oferece, com o nome que a pessoa lê. */
export const OPCOES = {
  corpo: [
    { valor: "homem", rotulo: "Homem" },
    { valor: "mulher", rotulo: "Mulher" },
  ],
  cabelo: [
    { valor: "curto", rotulo: "Curto" },
    { valor: "cacheado", rotulo: "Cacheado" },
    { valor: "chanel", rotulo: "Chanel" },
    { valor: "longo", rotulo: "Longo" },
    { valor: "coque", rotulo: "Coque" },
    { valor: "careca", rotulo: "Careca" },
  ],
  acessorio: [
    { valor: "nenhum", rotulo: "Nenhum" },
    { valor: "fone", rotulo: "Fone" },
    { valor: "headset", rotulo: "Headset" },
    { valor: "bone", rotulo: "Boné" },
  ],
  pele: ["#f3d0b5", "#e8b995", "#d9a27e", "#c98b66", "#a86b48", "#8d5a3b", "#5e3a26"],
  corDoCabelo: ["#141414", "#3b2a20", "#6b4a32", "#9a6a45", "#b4532a", "#d9b56a", "#9ca3af"],
  roupa: ["#ef6122", "#1d4ed8", "#3b82f6", "#0ea5e9", "#22c55e", "#a855f7", "#f43f5e", "#eab308", "#111827", "#f3f4f6"],
  calca: ["#1f2937", "#374151", "#1e3a8a", "#78716c", "#e5e7eb"],
} as const;

/**
 * Cada agente igual ao busto dele na arte de massinha
 * (public/agentes/<id>-avatar.webp): mesma pele, cabelo, acessório e a cor
 * dele na roupa.
 */
export const APARENCIA_DOS_AGENTES: Record<string, Aparencia> = {
  "roberto-radar": { corpo: "homem", pele: "#d9a27e", cabelo: "curto", corDoCabelo: "#2b2b2b", roupa: "#3b82f6", calca: "#374151", oculos: true, barba: false, acessorio: "nenhum", corDoAcessorio: "#2b2b33" },
  "lucas-linkedin": { corpo: "homem", pele: "#e8b995", cabelo: "curto", corDoCabelo: "#9a6a45", roupa: "#1d4ed8", calca: "#1f2937", oculos: false, barba: true, acessorio: "nenhum", corDoAcessorio: "#2b2b33" },
  // O Tiago foi do X para o TikTok em 29/09 e levou a cara dele junto.
  "tiago-tiktok": { corpo: "homem", pele: "#8d5a3b", cabelo: "cacheado", corDoCabelo: "#141414", roupa: "#0ea5e9", calca: "#1f2937", oculos: false, barba: false, acessorio: "fonePescoco", corDoAcessorio: "#60a5fa" },
  // Os especialistas que entraram em 29/09, cada um na cor dele.
  "xavier-x": { corpo: "homem", pele: "#f3d0b5", cabelo: "curto", corDoCabelo: "#141414", roupa: "#475569", calca: "#1f2937", oculos: true, barba: true, acessorio: "nenhum", corDoAcessorio: "#2b2b33" },
  "igor-instagram": { corpo: "homem", pele: "#c98b66", cabelo: "curto", corDoCabelo: "#3b2a20", roupa: "#db2777", calca: "#374151", oculos: false, barba: false, acessorio: "bone", corDoAcessorio: "#111827" },
  "fernanda-facebook": { corpo: "mulher", pele: "#e8b995", cabelo: "longo", corDoCabelo: "#6b4a32", roupa: "#6366f1", calca: "#1f2937", oculos: false, barba: false, acessorio: "nenhum", corDoAcessorio: "#2b2b33" },
  "yan-youtube": { corpo: "homem", pele: "#a86b48", cabelo: "careca", corDoCabelo: "#141414", roupa: "#dc2626", calca: "#1f2937", oculos: false, barba: true, acessorio: "fone", corDoAcessorio: "#111827" },
  "diana-design": { corpo: "mulher", pele: "#c98b66", cabelo: "chanel", corDoCabelo: "#141414", roupa: "#a855f7", calca: "#1f2937", oculos: false, barba: false, acessorio: "nenhum", corDoAcessorio: "#2b2b33" },
  "vitor-video": { corpo: "homem", pele: "#d7a07a", cabelo: "curto", corDoCabelo: "#2a1f18", roupa: "#f43f5e", calca: "#374151", oculos: false, barba: true, acessorio: "bone", corDoAcessorio: "#2b2b33" },
  "vera-veredito": { corpo: "mulher", pele: "#efc2a4", cabelo: "coque", corDoCabelo: "#b4532a", roupa: "#eab308", calca: "#374151", oculos: true, barba: false, acessorio: "nenhum", corDoAcessorio: "#2b2b33" },
  "paulo-publicador": { corpo: "homem", pele: "#d49a72", cabelo: "curto", corDoCabelo: "#161616", roupa: "#22c55e", calca: "#1f2937", oculos: false, barba: false, acessorio: "headset", corDoAcessorio: "#1f2937" },
  // O Dev da Demandou (06/10): verde-petróleo da plataforma, óculos, fone no pescoço.
  "davi-dev": { corpo: "homem", pele: "#e8b995", cabelo: "cacheado", corDoCabelo: "#3b2a20", roupa: "#0f766e", calca: "#1f2937", oculos: true, barba: false, acessorio: "fonePescoco", corDoAcessorio: "#111827" },
};

/**
 * O avatar de quem ainda não personalizou. Veste o LARANJA DA MARCA, que nenhum
 * agente usa: é uma das marcas de que este boneco é você, e não um funcionário
 * (ver `Voce` na cena).
 */
export const APARENCIA_PADRAO_DO_USUARIO: Aparencia = {
  corpo: "homem",
  pele: "#d9a27e",
  cabelo: "curto",
  corDoCabelo: "#3b2a20",
  roupa: "#ef6122",
  calca: "#1f2937",
  oculos: false,
  barba: false,
  acessorio: "nenhum",
  corDoAcessorio: "#2b2b33",
};

const COR = /^#[0-9a-fA-F]{6}$/;

/**
 * Lê uma aparência vinda de fora (banco, corpo de requisição) e devolve uma
 * válida, com o padrão em cada campo que faltar ou vier errado. Nunca lança:
 * uma aparência corrompida vira o padrão, e não uma cena quebrada.
 */
export function normalizarAparencia(bruta: unknown, padrao: Aparencia = APARENCIA_PADRAO_DO_USUARIO): Aparencia {
  const b = (bruta && typeof bruta === "object" ? bruta : {}) as Record<string, unknown>;
  const umDe = <T extends string>(v: unknown, validos: readonly { valor: string }[], p: T): T =>
    typeof v === "string" && validos.some((o) => o.valor === v) ? (v as T) : p;
  const cor = (v: unknown, p: string) => (typeof v === "string" && COR.test(v) ? v : p);
  return {
    corpo: umDe<Corpo>(b.corpo, OPCOES.corpo, padrao.corpo),
    pele: cor(b.pele, padrao.pele),
    cabelo: umDe<EstiloDeCabelo>(b.cabelo, OPCOES.cabelo, padrao.cabelo),
    corDoCabelo: cor(b.corDoCabelo, padrao.corDoCabelo),
    roupa: cor(b.roupa, padrao.roupa),
    calca: cor(b.calca, padrao.calca),
    oculos: typeof b.oculos === "boolean" ? b.oculos : padrao.oculos,
    barba: typeof b.barba === "boolean" ? b.barba : padrao.barba,
    // "fonePescoco" é do Tiago e não está na lista da tela, mas é válido.
    acessorio: umDe<Acessorio>(b.acessorio, [...OPCOES.acessorio, { valor: "fonePescoco" }], padrao.acessorio),
    corDoAcessorio: cor(b.corDoAcessorio, padrao.corDoAcessorio),
  };
}
