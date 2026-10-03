import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { MedidaDoVideo } from "@/lib/referencias/medidas";
import type { PadraoDeRitmoDoNicho } from "@/lib/media/metas-do-estilo";
import type { NomeDaMeta } from "@/lib/media/biblias/tipos";

/**
 * O PADRÃO VISUAL E DE RITMO DO NICHO (01/10/2026), dos vídeos medidos.
 *
 * Dois cartões em ProjectMemory tipo "padrao", sem nenhum dado de terceiro
 * (só medianas e etiquetas abstratas):
 *
 *   - "ritmo:nicho": as medianas (cena, algo novo a cada N s, gancho, texto,
 *     rosto, imagem de apoio, batidas) em `medidas`. A edição lê pelo
 *     perfil do projeto (lib/media/perfil-do-projeto.ts) e ajusta as METAS da
 *     bíblia do estilo dentro da faixa de identidade (metas-do-estilo.ts).
 *   - "visual:imagem": o olhar que rende (enquadramento, luz, saturação,
 *     ambiente) em `comoAplicar`, em português. A arte já lê os cartões
 *     "visual:*" pela identidade visual, e o diretor de montagem recebe pelo
 *     perfil, para usar nas descrições de imagem e de cena.
 *
 * O que rende: os vídeos com ganho de 1 vez ou mais contra a mediana do
 * próprio perfil, quando há pelo menos 5; senão, todos. A regra de prova é a
 * dos outros cartões (5 vídeos, 2 perfis).
 */

const mediana = (xs: number[]): number | undefined => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return undefined;
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

const maisComum = (xs: string[]): string | undefined => {
  const conta = new Map<string, number>();
  for (const x of xs.filter(Boolean)) conta.set(x, (conta.get(x) ?? 0) + 1);
  return [...conta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

const NOME_DO_OLHAR: Record<string, string> = {
  close: "plano fechado",
  medio: "plano médio",
  aberto: "plano aberto",
  clara: "luz clara",
  escura: "luz escura e contrastada",
  natural: "luz natural",
  estudio: "luz de estúdio",
  alta: "cor saturada",
  media: "cor moderada",
  baixa: "cor contida",
};

export type ResultadoDoPadraoVisual = { ritmo: PadraoDeRitmoDoNicho | null; olhar: string | null; videos: number };

/** Recalcula os dois cartões do projeto a partir das medidas gravadas. */
export async function atualizarPadraoVisual(projectId: string): Promise<ResultadoDoPadraoVisual> {
  const posts = await prisma.referenciaPost.findMany({
    where: { projectId, NOT: { medidas: { equals: Prisma.DbNull } }, perfil: { status: { not: "proprio" } } },
    select: { perfilId: true, ganho: true, medidas: true },
  });
  const medidos = posts
    .map((p) => ({ perfilId: p.perfilId, ganho: p.ganho, m: p.medidas as MedidaDoVideo | null }))
    .filter((p): p is { perfilId: string; ganho: number | null; m: MedidaDoVideo } => Boolean(p.m && typeof p.m.cenaMediana === "number"));
  const perfis = new Set(medidos.map((p) => p.perfilId)).size;
  if (medidos.length < 5 || perfis < 2) {
    // Sem prova, nenhum cartão: cartão velho que ninguém confirma sai.
    await prisma.projectMemory.deleteMany({ where: { projectId, type: "padrao", key: { in: ["ritmo:nicho", "visual:imagem"] } } });
    return { ritmo: null, olhar: null, videos: medidos.length };
  }
  const rendem = medidos.filter((p) => (p.ganho ?? 0) >= 1);
  const base = rendem.length >= 5 ? rendem : medidos;
  const ms = base.map((p) => p.m);
  const bpms = ms.filter((m) => m.batidas?.bpm && m.batidas.confianca >= 1.3).map((m) => m.batidas.bpm as number);
  const valores: Partial<Record<NomeDaMeta, number>> = {
    cenaSeg: mediana(ms.map((m) => m.cenaMediana)),
    // Algo novo na tela: o corte é a mudança que dá para medir; o grafismo
    // dentro da cena não aparece na detecção de corte, então fica a mediana.
    mudancaACadaSeg: mediana(ms.map((m) => m.cenaMediana)),
    ganchoAteSeg: mediana(ms.map((m) => m.primeiroCorte ?? m.medido)),
    textoNaTela: mediana(ms.filter((m) => m.quadros).map((m) => m.quadros!.texto)),
    rostoNaTela: mediana(ms.filter((m) => m.quadros).map((m) => m.quadros!.rosto)),
    brollNaTela: mediana(ms.filter((m) => m.quadros).map((m) => m.quadros!.apoio)),
    batidasPorMinuto: bpms.length >= 3 ? mediana(bpms) : undefined,
  };
  for (const k of Object.keys(valores) as NomeDaMeta[]) if (valores[k] === undefined) delete valores[k];
  const ritmo: PadraoDeRitmoDoNicho = { videos: base.length, perfis: new Set(base.map((p) => p.perfilId)).size, medidoEm: new Date().toISOString(), valores };

  const olhares = ms.map((m) => m.olhar).filter(Boolean) as NonNullable<MedidaDoVideo["olhar"]>[];
  const tracos = [maisComum(olhares.map((o) => o.enquadramento)), maisComum(olhares.map((o) => o.luz)), maisComum(olhares.map((o) => o.saturacao))]
    .filter((x): x is string => Boolean(x))
    .map((x) => NOME_DO_OLHAR[x] ?? x);
  const ambiente = maisComum(olhares.map((o) => o.ambiente.toLowerCase()));
  const olhar = tracos.length ? `Imagens com ${tracos.join(", ")}${ambiente ? `, em ambiente tipo "${ambiente}"` : ""}.` : null;

  const agora = new Date().toISOString();
  const prova = { posts: base.length, perfis: ritmo.perfis, ganho: 1 };
  const fmt = (v: number | undefined, unidade: string) => (v === undefined ? "" : `${v.toFixed(1).replace(".", ",")} ${unidade}`);
  const cartaoDoRitmo = {
    chave: "ritmo:nicho",
    rede: "todas",
    oQueE: `Os vídeos que rendem no nicho cortam a cada ${fmt(valores.cenaSeg, "s")} e mudam a tela até ${fmt(valores.ganchoAteSeg, "s")}.`,
    prova,
    comoAplicar: "A edição ajusta o ritmo do estilo escolhido para perto disso, sem sair da identidade do estilo nem da marca.",
    oQueNaoLevar: "Nada do vídeo de quem fez: só os números do ritmo.",
    geradoEm: agora,
    medidas: ritmo,
  };
  await prisma.projectMemory.upsert({
    where: { projectId_type_key: { projectId, type: "padrao", key: "ritmo:nicho" } },
    create: { projectId, type: "padrao", key: "ritmo:nicho", value: cartaoDoRitmo as never },
    update: { value: cartaoDoRitmo as never },
  });
  if (olhar) {
    const cartaoDoOlhar = {
      chave: "visual:imagem",
      rede: "todas",
      oQueE: olhar,
      prova,
      comoAplicar: olhar,
      oQueNaoLevar: "Nenhuma imagem, rosto, logo, cenário ou post de quem fez: só os traços abstratos.",
      geradoEm: agora,
    };
    await prisma.projectMemory.upsert({
      where: { projectId_type_key: { projectId, type: "padrao", key: "visual:imagem" } },
      create: { projectId, type: "padrao", key: "visual:imagem", value: cartaoDoOlhar as never },
      update: { value: cartaoDoOlhar as never },
    });
  } else {
    await prisma.projectMemory.deleteMany({ where: { projectId, type: "padrao", key: "visual:imagem" } });
  }
  return { ritmo, olhar, videos: base.length };
}
