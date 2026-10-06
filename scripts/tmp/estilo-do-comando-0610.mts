/**
 * O ESTILO DO PROJETO DO RELATO, ALINHADO AO COMANDO (06/10/2026).
 *
 * O Bruno escolheu "Autoridade high ticket" na galeria (comandoDoVideo com
 * referencia "consorcio", que é de fato o id desse cartão no catálogo), mas a
 * escolha antiga (videoEstiloEscolha / videoStyle) ficou no Vox, e o
 * cabeçalho, os efeitos e a família visual liam dela. O código novo
 * sincroniza ao salvar o comando; este script faz o mesmo para o projeto que
 * já tinha o comando gravado antes do conserto.
 *
 * O que faz, por projeto:
 *   1. lê o comando e confere se a referencia é um id do catálogo (avisa se não for);
 *   2. reescreve a escolha antiga com o estilo do comando, guardando legenda,
 *      legenda dos cortes e inserções de IA (UPDATE pelo Prisma, nunca SET de sessão);
 *   3. diz se o roteiro do completo de cada vídeo em "roteiro" foi planejado
 *      com outro comando (o botão "Refazer o roteiro no estilo novo" aparece na tela).
 *
 * IDEMPOTENTE: com a escolha já igual, não grava nada. SEM --aplicar, só lê.
 *
 *   npx tsx --env-file=.env.local scripts/tmp/estilo-do-comando-0610.mts
 *   npx tsx --env-file=.env.local scripts/tmp/estilo-do-comando-0610.mts --aplicar
 *   (opcional) outro projeto: --projeto <id>
 */
import { prisma } from "../../lib/db/prisma";
import { normalizarComando } from "../../lib/media/editor-por-comando/comando";
import { escolhaSincronizadaComComando, estiloIdDoComando, roteiroDeOutroComando, trechoDoComando } from "../../lib/media/estilo-do-comando";
import { estiloDoCatalogo, normalizarEscolha } from "../../lib/media/catalogo-de-estilos";

const args = process.argv.slice(2);
const aplicar = args.includes("--aplicar");
const i = args.indexOf("--projeto");
const projectId = i >= 0 ? args[i + 1] : "cmu7hmu0j000004jrh2yc5udb";

async function main() {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true, config: true, videoEstiloEscolha: true, videoStyle: true } });
  if (!p) throw new Error(`projeto ${projectId} não encontrado`);
  const comando = normalizarComando((p.config as { comandoDoVideo?: unknown } | null)?.comandoDoVideo ?? null);
  const antiga = normalizarEscolha(p.videoEstiloEscolha, p.videoStyle);
  console.log(`Projeto: ${p.name} (${p.id})`);
  console.log(`  escolha antiga: ${antiga.estiloId} (${estiloDoCatalogo(antiga.estiloId)?.nome ?? "?"}), videoStyle ${p.videoStyle}`);
  if (!comando) {
    console.log("  sem comando gravado: nada a alinhar.");
    return;
  }
  console.log(`  comando: "${trechoDoComando(comando.texto, 90)}" origem ${comando.origem ?? "?"}, referencia ${comando.referencia ?? "nenhuma"}`);
  const id = estiloIdDoComando(comando);
  if (comando.referencia && !id) console.log(`  ATENÇÃO: a referencia "${comando.referencia}" não é um id do catálogo.`);
  if (id) console.log(`  referencia confere: ${id} é o cartão "${estiloDoCatalogo(id)!.nome}".`);

  const nova = escolhaSincronizadaComComando(comando, p.videoEstiloEscolha, p.videoStyle);
  if (!nova) console.log("  escolha antiga já alinhada ao comando (ou comando próprio sem cartão): nada a gravar.");
  else if (!aplicar) console.log(`  FARIA: escolha antiga ${antiga.estiloId} -> ${nova.escolha.estiloId}, videoStyle ${p.videoStyle} -> ${nova.videoStyle}. Rode com --aplicar.`);
  else {
    await prisma.project.update({ where: { id: p.id }, data: { videoEstiloEscolha: nova.escolha as never, videoStyle: nova.videoStyle } });
    console.log(`  GRAVADO: escolha antiga ${antiga.estiloId} -> ${nova.escolha.estiloId}, videoStyle -> ${nova.videoStyle}.`);
  }

  const videos = await prisma.$queryRaw<Array<{ id: string; status: string; t: string | null }>>`
    SELECT id, status, "completoMontagem" #>> '{roteiro,completo,comando,texto}' AS t
    FROM video_jobs WHERE "projectId" = ${p.id} AND status IN ('roteiro', 'roteirizando') ORDER BY "createdAt" DESC LIMIT 20`;
  for (const v of videos) {
    const outro = roteiroDeOutroComando(comando, v.t);
    console.log(`  vídeo ${v.id} (${v.status}): ${v.t ? (outro ? `planejado com outro comando ("${trechoDoComando(v.t, 60)}"): a tela mostra "Refazer o roteiro no estilo novo"` : "planejado com o comando de agora") : "sem plano por comando ainda"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
