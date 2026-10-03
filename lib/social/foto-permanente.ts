import { put } from "@vercel/blob";
import { midiaProduzida } from "@/lib/media/storage";

/**
 * Guarda uma cópia da foto da conta no nosso armazenamento e devolve o
 * endereço permanente.
 *
 * Existe porque a foto que as redes devolvem na conexão é um link ASSINADO do
 * CDN delas (Instagram, Facebook, TikTok e LinkedIn), que expira em dias. Em
 * 28/09 as fotos do Instagram e do Facebook apareciam quebradas em
 * Configurações, com o texto alternativo cortado no lugar, bem na tela que
 * entra no vídeo da auditoria do TikTok. Copiar na hora da conexão, enquanto o
 * link ainda vale, resolve de vez.
 *
 * Falhar aqui nunca derruba a conexão: sem cópia, fica o link original, e a
 * tela ainda tem a salvaguarda da inicial (FotoDaConta).
 */
// Os retornos de OAuth gravam a foto nos dois ramos do upsert (atualizar e
// criar); a mesma URL na mesma execução reaproveita a cópia em vez de subir de
// novo.
const jaCopiadas = new Map<string, Promise<string | null>>();

export function fotoPermanente(
  urlDaRede: string | null | undefined,
  plataforma: string,
  idNaRede: string
): Promise<string | null> {
  if (!urlDaRede) return Promise.resolve(null);
  const chave = `${plataforma}:${urlDaRede}`;
  const pronta = jaCopiadas.get(chave);
  if (pronta) return pronta;
  const copia = copiar(urlDaRede, plataforma, idNaRede);
  jaCopiadas.set(chave, copia);
  // Não cresce sem limite numa função que fica quente por horas.
  if (jaCopiadas.size > 200) jaCopiadas.delete(jaCopiadas.keys().next().value as string);
  return copia;
}

async function copiar(urlDaRede: string, plataforma: string, idNaRede: string): Promise<string | null> {
  // Já é nossa: nada a copiar.
  if (urlDaRede.includes(".blob.vercel-storage.com")) return urlDaRede;
  try {
    const r = await fetch(urlDaRede, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) return urlDaRede;
    const tipo = r.headers.get("content-type") ?? "image/jpeg";
    if (!tipo.startsWith("image/")) return urlDaRede;
    const bytes = Buffer.from(await r.arrayBuffer());
    // Nome estável por conta e sufixo aleatório: reconectar grava uma foto nova
    // (a pessoa pode ter trocado) sem depender de sobrescrever a antiga.
    const seguro = idNaRede.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) || "conta";
    const { url } = await put(`fotos-de-conta/${plataforma}-${seguro}.jpg`, bytes, {
      ...midiaProduzida(),
      contentType: tipo,
      addRandomSuffix: true,
    });
    return url;
  } catch (e) {
    console.warn(`[foto-permanente] não copiei a foto de ${plataforma}:`, e);
    return urlDaRede;
  }
}
