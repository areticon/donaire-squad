import { prisma } from "@/lib/db/prisma";
import { askClaude } from "@/lib/claude";
import { ATORES, estimativaDoAtor, rodarAtor } from "@/lib/referencias/apify";
import { Caixa, redesLigadas } from "@/lib/referencias/config";
import { perfilCanonico, urlDoPerfil } from "@/lib/referencias/coletar";
import { canaisDoNicho } from "@/lib/referencias/youtube";
import { buscaComGoogle, regraDaBusca, territorioDoProjeto, type Radar } from "@/lib/research/radar-da-semana";
import type { RedeDeReferencia } from "@/lib/referencias/tipos";

/**
 * O ROBERTO SUGERE PERFIS DE REFERÊNCIA (01/10).
 *
 * Pedido do Bruno: "mapear os perfis famosos e relevantes do mesmo nicho (o
 * que estão fazendo)". Cada rede tem o seu caminho barato até um candidato:
 *   • Instagram: os posts das hashtags do nicho (quem aparece com mais
 *     interação) e, dos melhores, o perfil com seguidores e os perfis
 *     relacionados que o próprio Instagram mostra;
 *   • TikTok: a busca do nicho, agrupada por criador;
 *   • LinkedIn: páginas de EMPRESA achadas pela busca no Google (perfil
 *     pessoal fica de fora, pelo risco jurídico);
 *   • YouTube: a busca de canais da API oficial;
 *   • X: os autores com plateia que o radar da semana já achou (custo zero).
 * Depois o Haiku separa o que é do nicho e escreve o motivo. Nada é coletado
 * aqui além do necessário para sugerir; o cliente confirma até 10 por conta.
 */

type Candidato = { rede: RedeDeReferencia; perfil: string; nome: string; seguidores: number | null; pista: string };

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Quem tem plateia. Na primeira prova (01/10) a hashtag trouxe perfis de 31 a
 * 191 seguidores: quem posta na hashtag não é quem é referência. Sugestão do
 * Roberto só com 5 mil seguidores ou mais (o cliente pode indicar menor).
 */
export const MIN_SEGUIDORES_SUGESTAO = 5000;

/**
 * Os nomes FAMOSOS de uma rede pela busca do Google (Gemini): é o caminho
 * barato para "os perfis famosos e relevantes do nicho", que hashtag e busca
 * da própria rede não dão. A rede depois confirma se o perfil existe e quantos
 * seguidores tem.
 */
async function famososPeloGoogle(rede: "instagram" | "tiktok", assunto: string, publico: string): Promise<string[]> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return [];
  const nomeDaRede = rede === "instagram" ? "Instagram" : "TikTok";
  const r = await buscaComGoogle(
    `${regraDaBusca(new Date(), 3650)}\nOs perfis de ${nomeDaRede} mais conhecidos e seguidos no Brasil que publicam sobre ${assunto} para ${publico} (criadores, especialistas e empresas de referência). Até 8 itens no formato: - @usuario | NOME | POR QUE É REFERÊNCIA`,
    chave,
    "radar"
  );
  return r.itens
    .map((i) => i.texto.match(/@([A-Za-z0-9._]{2,30})/)?.[1]?.toLowerCase().replace(/\.$/, ""))
    .filter((u): u is string => Boolean(u));
}

async function doInstagram(termos: string[], assunto: string, publico: string, caixa: Caixa, avisos: string[]): Promise<Candidato[]> {
  const hashtags = termos.map((t) => semAcento(t.toLowerCase()).replace(/[^a-z0-9]/g, "")).filter((h) => h.length >= 4).slice(0, 3);
  const n = 30;
  const famosos = await famososPeloGoogle("instagram", assunto, publico).catch(() => [] as string[]);
  const porDono = new Map<string, number>();
  if (hashtags.length && caixa.cabe(estimativaDoAtor(ATORES.instagramHashtag, n) + estimativaDoAtor(ATORES.instagramPerfil, 12))) {
    const r = await rodarAtor<{ ownerUsername?: string; likesCount?: number; commentsCount?: number; videoPlayCount?: number }>(
      ATORES.instagramHashtag,
      { hashtags, resultsType: "posts", resultsLimit: Math.ceil(n / hashtags.length) },
      { maxItens: n, maxUsd: caixa.teto - caixa.gasto }
    );
    caixa.anotar(r.custoUsd);
    if (r.erro) avisos.push(`Instagram (hashtag): ${r.erro}`);
    for (const i of r.itens) {
      if (!i.ownerUsername) continue;
      const peso = Math.max(0, i.likesCount ?? 0) + 2 * (i.commentsCount ?? 0) + (i.videoPlayCount ?? 0) / 20;
      porDono.set(i.ownerUsername.toLowerCase(), (porDono.get(i.ownerUsername.toLowerCase()) ?? 0) + peso);
    }
  }
  const daHashtag = [...porDono].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([u]) => u);
  const conferir = [...new Set([...famosos.slice(0, 8), ...daHashtag])].slice(0, 12);
  if (!conferir.length || !caixa.cabe(estimativaDoAtor(ATORES.instagramPerfil, conferir.length))) return [];
  const pr = await rodarAtor<{ username?: string; fullName?: string; followersCount?: number; biography?: string; private?: boolean; relatedProfiles?: Array<{ username?: string; full_name?: string }> }>(
    ATORES.instagramPerfil,
    { usernames: conferir },
    { maxItens: conferir.length, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(pr.custoUsd);
  if (pr.erro) avisos.push(`Instagram (perfil): ${pr.erro}`);
  const saida: Candidato[] = [];
  for (const p of pr.itens) {
    if (!p.username || p.private || (p.followersCount ?? 0) < MIN_SEGUIDORES_SUGESTAO) continue;
    const origem = famosos.includes(p.username.toLowerCase()) ? "citado como referência na busca do Google" : `apareceu nas hashtags ${hashtags.join(", ")}`;
    saida.push({ rede: "instagram", perfil: p.username.toLowerCase(), nome: p.fullName ?? p.username, seguidores: p.followersCount ?? null, pista: `bio: ${(p.biography ?? "").slice(0, 160)}; ${origem}` });
  }
  return saida;
}

async function doTiktok(termos: string[], assunto: string, publico: string, caixa: Caixa, avisos: string[]): Promise<Candidato[]> {
  const n = 20;
  // Em 01/10 a busca da rede trouxe só criadores em inglês: os famosos
  // brasileiros vêm da busca do Google e o ator confere se existem.
  const famosos = (await famososPeloGoogle("tiktok", assunto, publico).catch(() => [] as string[])).slice(0, 8);
  const conferidos: Candidato[] = [];
  if (famosos.length && caixa.cabe(estimativaDoAtor(ATORES.tiktok, famosos.length))) {
    const f = await rodarAtor<{ authorMeta?: { name?: string; nickName?: string; fans?: number; signature?: string } }>(
      ATORES.tiktok,
      { profiles: famosos, resultsPerPage: 1 },
      { maxItens: famosos.length, maxUsd: caixa.teto - caixa.gasto }
    );
    caixa.anotar(f.custoUsd);
    for (const i of f.itens) {
      const a = i.authorMeta;
      if (a?.name && (a.fans ?? 0) >= MIN_SEGUIDORES_SUGESTAO)
        conferidos.push({ rede: "tiktok", perfil: a.name.toLowerCase(), nome: a.nickName ?? a.name, seguidores: a.fans ?? null, pista: `bio: ${(a.signature ?? "").slice(0, 140)}; citado como referência na busca do Google` });
    }
  }
  const busca = termos.slice(0, 2);
  if (!busca.length || !caixa.cabe(estimativaDoAtor(ATORES.tiktok, n))) return [];
  const r = await rodarAtor<{ authorMeta?: { name?: string; nickName?: string; fans?: number; signature?: string }; playCount?: number }>(
    ATORES.tiktok,
    { searchQueries: busca, resultsPerPage: Math.ceil(n / busca.length) },
    { maxItens: n, maxUsd: caixa.teto - caixa.gasto }
  );
  caixa.anotar(r.custoUsd);
  if (r.erro) avisos.push(`TikTok: ${r.erro}`);
  const porAutor = new Map<string, Candidato & { peso: number }>();
  for (const i of r.itens) {
    const a = i.authorMeta;
    if (!a?.name) continue;
    const atual = porAutor.get(a.name);
    porAutor.set(a.name, {
      rede: "tiktok",
      perfil: a.name.toLowerCase(),
      nome: a.nickName ?? a.name,
      seguidores: a.fans ?? null,
      pista: `bio: ${(a.signature ?? "").slice(0, 140)}; apareceu na busca ${busca.join(", ")}`,
      peso: (atual?.peso ?? 0) + (i.playCount ?? 0),
    });
  }
  const daBusca = [...porAutor.values()]
    .filter((c) => (c.seguidores ?? 0) >= MIN_SEGUIDORES_SUGESTAO)
    .sort((a, b) => b.peso - a.peso)
    .slice(0, 4)
    .map(({ peso: _peso, ...c }) => c);
  return [...conferidos, ...daBusca];
}

async function doLinkedin(subtemas: string[], publico: string): Promise<Candidato[]> {
  const chave = process.env.GEMINI_API_KEY;
  if (!chave) return [];
  // "site:linkedin.com/company" e o mercado em volta, não o nicho exato: em
  // 01/10 o pedido pelo nicho estreito ("autoridade digital para vendedores de
  // conhecimento") voltou três empresas sem página achada; pelo mercado,
  // vieram oito páginas reais.
  const r = await buscaComGoogle(
    `${regraDaBusca(new Date(), 3650)}\nPesquise site:linkedin.com/company as páginas de EMPRESA mais seguidas no LinkedIn, no Brasil, que publicam sobre ${subtemas.slice(0, 4).join(", ")} (o mercado de quem atende ${publico}). Empresas conhecidas do setor contam. Só página de empresa, nunca perfil pessoal, e só com o endereço que o Google mostrou. Até 8 itens no formato: - NOME | https://www.linkedin.com/company/SLUG | POR QUE É REFERÊNCIA`,
    chave,
    "radar"
  );
  return r.itens
    .map((i): Candidato | null => {
      const m = i.texto.match(/linkedin\.com\/company\/([^/\s|]+)/i);
      if (!m) return null;
      const partes = i.texto.split(" | ");
      return { rede: "linkedin" as const, perfil: perfilCanonico("linkedin", `https://www.linkedin.com/company/${m[1]}/`), nome: partes[0].slice(0, 80), seguidores: null, pista: (partes[2] ?? "").slice(0, 160) };
    })
    .filter((c): c is Candidato => Boolean(c));
}

async function doYoutube(termos: string[]): Promise<Candidato[]> {
  const saida: Candidato[] = [];
  for (const t of termos.slice(0, 2)) {
    const canais = await canaisDoNicho(t, 5);
    for (const c of (canais ?? []).filter((c) => (c.seguidores ?? 0) >= MIN_SEGUIDORES_SUGESTAO)) saida.push({ rede: "youtube", perfil: perfilCanonico("youtube", c.perfil), nome: c.nome, seguidores: c.seguidores, pista: `canal achado na busca "${t}"` });
  }
  return saida;
}

async function doX(projectId: string): Promise<Candidato[]> {
  const m = await prisma.projectMemory.findUnique({ where: { projectId_type_key: { projectId, type: "radar", key: "semana" } }, select: { value: true } });
  const radar = m?.value as Radar | undefined;
  return (radar?.itens ?? [])
    .filter((i) => i.origem === "x")
    .map((i): Candidato | null => {
      const a = i.texto.match(/^@(\w+) \(([\d.]+) seguidores\)/);
      return a ? { rede: "x" as const, perfil: a[1].toLowerCase(), nome: `@${a[1]}`, seguidores: Number(a[2].replace(/\./g, "")), pista: `apareceu no radar do X: ${i.texto.slice(0, 140)}` } : null;
    })
    .filter((c): c is Candidato => Boolean(c) && (c!.seguidores ?? 0) >= MIN_SEGUIDORES_SUGESTAO);
}

export type ResultadoDaDescoberta = { sugeridos: number; candidatos: number; custoUsd: number; avisos: string[] };

export async function sugerirPerfis(projectId: string, opcoes?: { caixa?: Caixa }): Promise<ResultadoDaDescoberta> {
  const ligadas = redesLigadas();
  const caixa = opcoes?.caixa ?? new Caixa();
  const avisos: string[] = [];
  const p = await prisma.project.findUniqueOrThrow({ where: { id: projectId }, select: { niche: true, targetAudience: true } });
  const t = await territorioDoProjeto(projectId, p.niche ?? "negócios", p.targetAudience ?? "empresários");
  const termos = t.termosX?.length ? t.termosX : t.subtemas;

  const tarefas: Array<Promise<Candidato[]>> = [];
  if (ligadas.includes("instagram")) tarefas.push(doInstagram(termos, t.assunto, t.publico, caixa, avisos));
  if (ligadas.includes("tiktok")) tarefas.push(doTiktok(termos, t.assunto, t.publico, caixa, avisos));
  if (ligadas.includes("linkedin")) tarefas.push(doLinkedin(t.subtemas, t.publico));
  if (ligadas.includes("youtube")) tarefas.push(doYoutube(termos));
  if (ligadas.includes("x")) tarefas.push(doX(projectId));
  const brutos = (await Promise.allSettled(tarefas)).flatMap((r) => (r.status === "fulfilled" ? r.value : []));

  const existentes = await prisma.referenciaPerfil.findMany({ where: { projectId }, select: { rede: true, perfil: true } });
  const ja = new Set(existentes.map((e) => `${e.rede}:${e.perfil}`));
  const candidatos = brutos.filter((c, i, arr) => !ja.has(`${c.rede}:${c.perfil}`) && arr.findIndex((x) => x.rede === c.rede && x.perfil === c.perfil) === i);
  if (!candidatos.length) return { sugeridos: 0, candidatos: 0, custoUsd: caixa.gasto, avisos };

  // O Haiku separa o que é do nicho (e tira fã-clube, perfil pessoal sem
  // conteúdo e concorrente direto pequeno) e escreve o motivo em uma frase.
  let escolhidos: Array<{ n: number; motivo: string }> = [];
  try {
    const lista = candidatos
      .map((c, i) => `${i + 1}. [${c.rede}] ${c.nome} (${c.perfil}${c.seguidores ? `, ${c.seguidores.toLocaleString("pt-BR")} seguidores` : ""}): ${c.pista}`)
      .join("\n");
    const bruto = await askClaude(
      "Você escolhe perfis de referência de conteúdo para uma marca estudar o FORMATO do que dá certo. Nunca use travessão. Responda só com JSON.",
      `ASSUNTO DA MARCA: ${t.assunto}\nPÚBLICO: ${t.publico}\n\nCANDIDATOS:\n${lista}\n\nEscolha até 12 que publicam com frequência sobre o assunto ou para esse público, preferindo as maiores audiências, e no máximo 4 da mesma rede. Fora: fã-clube, celebridade sem relação, perfil pessoal sem conteúdo, loja, perfil de notícia genérica. "motivo": em uma frase, o que vale estudar ali.\nResponda {"escolhidos":[{"n":1,"motivo":"..."}]}`,
      { model: "claude-haiku-4-5", maxTokens: 4000, usage: { projectId, operation: "referencias_sugestao" } }
    );
    escolhidos = (JSON.parse(bruto.slice(bruto.indexOf("{"), bruto.lastIndexOf("}") + 1)) as { escolhidos?: typeof escolhidos }).escolhidos ?? [];
  } catch (e) {
    avisos.push(`a escolha dos candidatos falhou: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
  }

  // A descoberta também custa (hashtag, perfis e busca do TikTok na Apify):
  // entra no registro de gasto do projeto como uma coleta "descoberta".
  await prisma.referenciaColeta
    .create({ data: { projectId, rede: "varias", fonte: "descoberta", itens: candidatos.length, custoUsd: caixa.gasto, status: "ok", erro: avisos.join("; ").slice(0, 300) || null } })
    .catch(() => {});
  let sugeridos = 0;
  for (const e of escolhidos.slice(0, 12)) {
    const c = candidatos[Number(e.n) - 1];
    if (!c) continue;
    await prisma.referenciaPerfil
      .create({
        data: {
          projectId,
          rede: c.rede,
          perfil: c.perfil,
          nome: c.nome.slice(0, 120),
          url: urlDoPerfil(c.rede, c.perfil),
          motivo: String(e.motivo ?? "").replace(/\s*[—–]\s*/g, ", ").slice(0, 400),
          seguidores: c.seguidores ? Math.round(c.seguidores) : null,
          status: "sugerido",
          origem: "roberto",
        },
      })
      .then(() => sugeridos++)
      .catch(() => {});
  }
  return { sugeridos, candidatos: candidatos.length, custoUsd: Math.round(caixa.gasto * 10000) / 10000, avisos };
}
