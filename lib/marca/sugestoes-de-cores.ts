import { prisma } from "@/lib/db/prisma";
import { lerMidia } from "@/lib/media/storage";
import { completarCores, coresDoLogo, coresDoManual, trechoVisual } from "@/lib/media/identidade-visual";
import { normalizarPaleta, type OrigemDaSugestao } from "@/lib/marca/cores-da-marca";

/**
 * AS SUGESTÕES DO SELETOR DE CORES (08/10/2026): "achei estas cores" no logo,
 * no manual e nas capas do Instagram, cada grupo com "Usar estas".
 *
 * Até 08/10 o logo e o manual só viravam cor quando o projeto NÃO tinha paleta
 * salva (lib/media/identidade-visual.ts, fonte única de 06/10), e o assistente
 * gravava o laranja da Demandou já na etapa 0: na prática coresDoLogo nunca
 * rodava para quem passou pelo setup. Agora a tela oferece as cores do que a
 * pessoa subiu, e quem decide é ela.
 *
 * Só leitura e sem custo: o logo é medido em pixels (sharp, 64 px), o manual
 * já está compilado no banco, e as capas são o estudo que já foi pago.
 */
export async function sugestoesDeCores(projectId: string, logoUrl: string | null | undefined): Promise<OrigemDaSugestao[]> {
  const [doLogo, doManual, dasCapas] = await Promise.all([
    sugestaoDoLogo(logoUrl).catch(() => null),
    sugestaoDoManual(projectId).catch(() => null),
    sugestaoDasCapas(projectId).catch(() => null),
  ]);
  return [doLogo, doManual, dasCapas].filter((s): s is OrigemDaSugestao => Boolean(s && s.cores.length));
}

async function sugestaoDoLogo(logoUrl: string | null | undefined): Promise<OrigemDaSugestao | null> {
  if (!logoUrl) return null;
  const arquivo = await lerMidia(logoUrl);
  if (!arquivo) return null;
  const medidas = await coresDoLogo(arquivo);
  if (!medidas) return null;
  // O escuro e o claro que o logo não tem saem do tom do próprio acento, como
  // a identidade faz quando usa o logo (e não do carvão de todo mundo).
  const c = completarCores(medidas.acento, medidas.escuro);
  return { origem: "logo", titulo: "Do seu logo", cores: normalizarPaleta([c.acento, c.escuro, c.claro]).cores };
}

async function sugestaoDoManual(projectId: string): Promise<OrigemDaSugestao | null> {
  const docs = await prisma.projectContext.findMany({
    where: { projectId, status: "pronto", type: { in: ["brand", "business"] } },
    select: { compiled: true },
    take: 4,
  });
  const textos = docs.map((d) => trechoVisual(d.compiled)).filter(Boolean);
  const c = textos.length ? coresDoManual(textos) : null;
  if (!c) return null;
  return { origem: "manual", titulo: "Do seu manual de marca", cores: normalizarPaleta([c.acento, c.escuro, c.claro]).cores };
}

/**
 * As cores que mais aparecem nas capas, do estudo do perfil (03/10). Entram
 * como SUGESTÃO, e não mais preenchendo a etapa sozinhas: em perfil com foto
 * de pessoa, a cor dominante é pele, roupa e parede, e não a marca (o mapa de
 * 08/10).
 */
async function sugestaoDasCapas(projectId: string): Promise<OrigemDaSugestao | null> {
  const linhas = await prisma.projectMemory.findMany({
    where: { projectId, type: "perfil_proprio", key: { in: ["setup", "relatorio"] } },
    select: { key: true, value: true },
  });
  const setup = linhas.find((l) => l.key === "setup")?.value as { campos?: { colorPalette?: string }; porque?: { colorPalette?: string } } | undefined;
  const relatorio = linhas.find((l) => l.key === "relatorio")?.value as { visual?: { cores?: unknown } } | undefined;
  const doSetup = normalizarPaleta(setup?.campos?.colorPalette ?? "").cores;
  const doRelatorio = Array.isArray(relatorio?.visual?.cores) ? normalizarPaleta(relatorio.visual.cores.map(String)).cores : [];
  const cores = doSetup.length ? doSetup : doRelatorio.slice(0, 3);
  if (!cores.length) return null;
  return { origem: "capas", titulo: "Das capas do seu Instagram", cores, porque: setup?.porque?.colorPalette };
}
