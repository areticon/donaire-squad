// OS BLOCOS DE ESTILO SÓ COM TRATAMENTO NAS SEMENTES DA BIBLIOTECA (06/10/2026, tarde).
//
// Os 26 blocos de LINGUAGEM_DOS_ESTILOS (comando-dos-estilos.ts) foram
// reescritos para conter só o tratamento visual (luz, cor, textura, lente,
// grão, composição, acabamento), sem objeto nem assunto. As sementes de vídeo
// já gravadas na biblioteca (DesignDaBiblioteca, origem "semente", tipo
// "video") guardam a linguagem antiga em `linguagem`. Este script grava nelas
// a linguagem da semente de hoje (sementePorCatalogo), só onde está diferente.
//
// Só mexe em `linguagem` das sementes de vídeo do catálogo; nunca em entrada
// de cliente, nunca em imagem. Rodar de novo não muda nada (idempotente).
// NENHUMA chamada paga. Nenhum SET de sessão: só updateMany pelo Prisma.
//
// SEM --gravar NÃO ESCREVE NADA (ensaio: mostra o que mudaria).
//
// Uso (da raiz do repositório):
//   npx tsx scripts/tmp/blocos-so-tratamento-0610.mts            # ensaio
//   npx tsx scripts/tmp/blocos-so-tratamento-0610.mts --gravar   # grava
import { readFileSync, existsSync } from "node:fs";

for (const arq of ["C:/Users/devan/opensquad-app/.env.local", ".env.local"]) {
  if (!existsSync(arq)) continue;
  for (const l of readFileSync(arq, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  break;
}

const gravar = process.argv.slice(2).includes("--gravar");

const { prisma } = await import("../../lib/db/prisma");
const { sementePorCatalogo } = await import("../../lib/biblioteca-de-design/semente");
const { CATALOGO_DE_ESTILOS } = await import("../../lib/media/catalogo-de-estilos");

const gravadas = await prisma.designDaBiblioteca.findMany({
  where: { origem: "semente", tipo: "video", catalogoId: { in: CATALOGO_DE_ESTILOS.map((e) => e.id) } },
  select: { id: true, catalogoId: true, linguagem: true },
});
console.log(`${gravar ? "GRAVANDO" : "ENSAIO (nada é escrito)"}: ${gravadas.length} semente(s) de vídeo do catálogo no banco (o catálogo tem ${CATALOGO_DE_ESTILOS.length}).`);

let mudam = 0;
for (const d of gravadas) {
  const nova = d.catalogoId ? sementePorCatalogo("video", d.catalogoId)?.linguagem : undefined;
  if (!nova) {
    console.log(`sem semente  ${d.id}  ${d.catalogoId}`);
    continue;
  }
  if (nova === d.linguagem) {
    console.log(`igual        ${d.catalogoId}`);
    continue;
  }
  mudam++;
  console.log(`muda         ${d.catalogoId}  (${d.linguagem.split(/\s+/).length} -> ${nova.split(/\s+/).length} palavras)`);
  // Só troca se ainda é a linguagem lida agora (ninguém mexeu no meio).
  if (gravar) await prisma.designDaBiblioteca.updateMany({ where: { id: d.id, origem: "semente", linguagem: d.linguagem }, data: { linguagem: nova } });
}
const faltam = CATALOGO_DE_ESTILOS.filter((e) => !gravadas.some((d) => d.catalogoId === e.id)).map((e) => e.id);
if (faltam.length) console.log(`ainda não gravadas (garantirSemente cria com a linguagem nova quando forem usadas): ${faltam.join(", ")}`);
console.log(`\nresumo: ${mudam} mudam, ${gravadas.length - mudam} já estão iguais.${gravar ? "" : " Nada foi escrito; rode com --gravar."}`);
await prisma.$disconnect();
