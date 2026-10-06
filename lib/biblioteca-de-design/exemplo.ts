import { sementesDaBiblioteca } from "@/lib/biblioteca-de-design/semente";
import { ordenarPorUso, type DesignDaGaleria } from "@/lib/biblioteca-de-design/tipos";

/**
 * A BIBLIOTECA DE EXEMPLO (06/10/2026): só no `next dev`, com `?exemplo=1`,
 * no mesmo espírito do painel de admin (lib/admin/exemplo-do-painel.ts).
 * Números inventados em memória: nada vem do banco nem vai para ele. Serve
 * para olhar a galeria (ordem por uso, prévia ou "prévia ainda não gerada",
 * filtros e busca) sem aplicar a migração nem a semente no banco
 * compartilhado com a produção.
 */

/** Um número estável por texto (a mesma semente dá sempre o mesmo uso). */
function usoEstavel(chave: string, teto: number): number {
  let h = 7;
  for (const c of chave) h = (h * 31 + c.charCodeAt(0)) % 100003;
  return h % teto;
}

const PEDIDOS_DE_CLIENTES: Array<Omit<DesignDaGaleria, "id" | "createdAt" | "origem" | "catalogoId" | "agrupadoEmId" | "publico"> & { agrupadoEm?: string }> = [
  {
    tipo: "video",
    nome: "Consultório claro com lousa de vidro",
    descricao: "Aula de saúde com painéis de vidro, passos numerados e número com fonte quando houver dado.",
    pedidoOriginal: "Quero um visual de clínica, claro e acolhedor, com os passos aparecendo um por um num painel de vidro ao meu lado e os números que eu falar contando na tela.",
    linguagem: "Clean clinical look, bright and warm, frosted glass panels beside the speaker, numbered steps appearing one by one, soft neutral background, crisp product lighting. Brand colors only as small accents and details, never a flat color wash.",
    previaUrl: null,
    usos: 23,
    doProjeto: true,
    meu: true,
  },
  {
    tipo: "imagem",
    nome: "Cartaz de obra com faixa de aviso",
    descricao: "Foto do canteiro em preto e branco, faixa de destaque com a manchete e um dado grande.",
    pedidoOriginal: "Post com foto da obra em preto e branco e uma faixa na cor da empresa com a frase, estilo cartaz de segurança do trabalho.",
    linguagem: "Realistic editorial photograph of a construction site converted to black and white, strong diagonal composition, one calm zone in the lower third where a solid brand-colored band with the headline is printed in code afterwards. No text, letters or logos in the image.",
    previaUrl: null,
    usos: 11,
  },
  {
    tipo: "video",
    nome: "Cozinha de restaurante, cortes rápidos",
    descricao: "Vlog de bastidor com zoom na fala e palavras-chave grandes, B-roll da cozinha gerado.",
    pedidoOriginal: "Edição rápida tipo vlog, com cortes na minha fala, palavra forte grande e cenas da cozinha quando eu falar de prato.",
    linguagem: "Energetic kitchen vlog look, handheld feel, warm tungsten light, steam and fire details, punchy keyword captions, quick B-roll of plating and pans. Brand colors only as small accents and details.",
    previaUrl: null,
    usos: 4,
    agrupadoEm: "vlog",
  },
  {
    tipo: "imagem",
    nome: "Versículo sobre papel de Bíblia",
    descricao: "Página de Bíblia antiga ao fundo, versículo em serifa e a referência em carimbo.",
    pedidoOriginal: "Arte com um versículo por cima de uma página de Bíblia antiga, com a referência bíblica como um carimbo vermelho.",
    linguagem: "Scanned aged Bible page with real tiny printed type, soft paper grain and folds, warm light, a quiet area in the center for a serif verse printed in code afterwards, a small red rubber stamp mark in one corner. No readable sentences, no logos.",
    previaUrl: null,
    usos: 2,
    doProjeto: true,
    meu: true,
  },
];

export function bibliotecaDeExemplo(): DesignDaGaleria[] {
  const base = new Date("2026-10-05T12:00:00Z").getTime();
  const sementes: DesignDaGaleria[] = sementesDaBiblioteca().map((s, i) => ({
    id: `exemplo-${s.tipo}-${s.catalogoId}`,
    tipo: s.tipo,
    nome: s.nome,
    descricao: s.descricao,
    pedidoOriginal: s.pedidoOriginal,
    linguagem: s.linguagem,
    previaUrl: s.previaUrl,
    usos: usoEstavel(s.catalogoId, 30) + (["vox", "consorcio", "lousa", "voce-na-frente-do-titulo", "jornal-com-marca-texto"].includes(s.catalogoId) ? 40 : 0),
    origem: "semente",
    agrupadoEmId: null,
    catalogoId: s.catalogoId,
    publico: true,
    doProjeto: ["vox", "voce-na-frente-do-titulo", "frase-marca-texto"].includes(s.catalogoId),
    createdAt: new Date(base - i * 3_600_000).toISOString(),
  }));
  const clientes: DesignDaGaleria[] = PEDIDOS_DE_CLIENTES.map((p, i) => ({
    id: `exemplo-cliente-${i + 1}`,
    tipo: p.tipo,
    nome: p.nome,
    descricao: p.descricao,
    linguagem: p.linguagem,
    previaUrl: p.previaUrl,
    usos: p.usos,
    origem: "cliente",
    agrupadoEmId: p.agrupadoEm ? `exemplo-video-${p.agrupadoEm}` : null,
    catalogoId: null,
    doProjeto: p.doProjeto,
    meu: p.meu,
    publico: true,
    // Como a rota manda: o pedido cru só para quem o escreveu.
    pedidoOriginal: p.meu ? p.pedidoOriginal : "",
    createdAt: new Date(base + (i + 1) * 7_200_000).toISOString(),
  }));
  return ordenarPorUso([...sementes, ...clientes]);
}
