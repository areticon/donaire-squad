// A PRIVACIDADE DOS DESIGNS JÁ GRAVADOS NA BIBLIOTECA (06/10/2026, vazamento).
//
// Antes da correção, todo pedido de cliente entrava com publico = true, e a
// ficha de reserva (sem o redator) copiava o pedido cru na linguagem. Este
// script tira da galeria o que pode expor o cliente. Só muda público para
// privado, nunca o contrário: rodar de novo não muda nada (idempotente).
//
// CUSTO:
//   - sem --conferir: NENHUMA chamada paga. Tira da galeria toda ficha de
//     reserva (pedido cru na linguagem); com --tudo, tira todas as entradas de
//     cliente (o padrão seguro, se não quiser pagar nem o JEV);
//   - com --conferir: o JEV confere cada ficha pública de cliente (a mesma
//     conferência da entrada nova). Custo estimado no topo da execução:
//     ~US$ 0,00003 por entrada (US$ 42 por bilhão de tokens, ~700 tokens).
//
// SEM --gravar NÃO ESCREVE NADA (ensaio).
//
// Em 06/10 à tarde a produção tinha ZERO entradas de cliente (só as 79
// sementes): hoje ele não muda nada. Serve para rodar logo antes de publicar
// a correção, se algum cliente pediu design no meio-tempo.
//
// Uso (da raiz do repositório):
//   npx tsx scripts/tmp/privacidade-biblioteca-0610.mts              # ensaio
//   npx tsx scripts/tmp/privacidade-biblioteca-0610.mts --gravar     # tira as fichas de reserva
//   npx tsx scripts/tmp/privacidade-biblioteca-0610.mts --gravar --tudo
//   npx tsx scripts/tmp/privacidade-biblioteca-0610.mts --gravar --conferir
import { readFileSync, existsSync } from "node:fs";

for (const arq of ["C:/Users/devan/opensquad-app/.env.local", ".env.local"]) {
  if (!existsSync(arq)) continue;
  for (const l of readFileSync(arq, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  break;
}

const args = process.argv.slice(2);
const gravar = args.includes("--gravar");
const tudo = args.includes("--tudo");
const conferir = args.includes("--conferir");

const { prisma } = await import("../../lib/db/prisma");
const { fichaEstaLimpa, MARCA_DA_RESERVA } = await import("../../lib/biblioteca-de-design/privacidade");
const { jevLigado } = await import("../../lib/jev/cliente");

const publicas = await prisma.designDaBiblioteca.findMany({
  where: { origem: "cliente", publico: true },
  select: { id: true, tipo: true, nome: true, descricao: true, linguagem: true, criadoPorProjectId: true },
  orderBy: { createdAt: "asc" },
});
console.log(`${gravar ? "GRAVANDO" : "ENSAIO (nada é escrito)"}: ${publicas.length} entrada(s) de cliente na galeria pública.`);
if (conferir) {
  console.log(`--conferir: o JEV confere ${publicas.length} ficha(s), custo estimado US$ ${(publicas.length * 0.00003).toFixed(5)}.${jevLigado() ? "" : " O JEV está desligado aqui: sem conferência, toda ficha conta como não conferida e sai da galeria."}`);
}

let tiradas = 0;
for (const d of publicas) {
  let motivo: string | null = null;
  if (d.linguagem.includes(MARCA_DA_RESERVA)) motivo = "ficha de reserva com o pedido cru";
  else if (tudo) motivo = "--tudo";
  else if (conferir && !(await fichaEstaLimpa({ nome: d.nome, descricao: d.descricao, linguagem: d.linguagem, projectId: d.criadoPorProjectId }))) motivo = "o JEV não deu a ficha como limpa";
  if (!motivo) {
    console.log(`fica       ${d.id}  ${d.tipo}  "${d.nome}"`);
    continue;
  }
  tiradas++;
  console.log(`sai        ${d.id}  ${d.tipo}  "${d.nome}"  (${motivo})`);
  // Só público para privado; o projeto que pediu continua com o design.
  if (gravar) await prisma.designDaBiblioteca.updateMany({ where: { id: d.id, publico: true }, data: { publico: false } });
}
console.log(`\nresumo: ${tiradas} saem da galeria, ${publicas.length - tiradas} ficam.${gravar ? "" : " Nada foi escrito; rode com --gravar."}`);
await prisma.$disconnect();
