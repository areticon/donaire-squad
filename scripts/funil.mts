/**
 * O funil da Demandou, do primeiro clique ate a assinatura.
 *
 *   npx tsx --env-file=.env.local scripts/funil.mts [dias] [gasto em reais]
 *
 * Exemplos:
 *   npx tsx --env-file=.env.local scripts/funil.mts            # 7 dias
 *   npx tsx --env-file=.env.local scripts/funil.mts 30         # 30 dias
 *   npx tsx --env-file=.env.local scripts/funil.mts 14 2000    # com o gasto em anuncio
 *
 * O gasto e opcional e serve para uma conta so, a que decide o negocio: quanto
 * custou cada cadastro e cada assinatura. Sem ele o relatorio mostra volume e
 * conversao, que e o suficiente para o dia a dia.
 */
import { prisma } from "../lib/db/prisma";

const dias = Number(process.argv[2] ?? 7);
const gasto = process.argv[3] ? Number(process.argv[3]) : null;
const desde = new Date(Date.now() - dias * 86400_000);

const eventos = await prisma.funnelEvent.findMany({
  where: { createdAt: { gte: desde } },
  select: { evento: true, origem: true, campanha: true, userId: true, valorCents: true, createdAt: true },
});

const PASSOS = ["visita", "demo", "cadastro", "checkout", "assinatura"] as const;
const conta = (e: string, filtro?: (x: (typeof eventos)[number]) => boolean) =>
  eventos.filter((x) => x.evento === e && (!filtro || filtro(x))).length;

console.log(`\nFUNIL DOS ULTIMOS ${dias} DIAS (desde ${desde.toISOString().slice(0, 10)})\n`);
const visitas = conta("visita");
let anterior = 0;
for (const p of PASSOS) {
  const n = conta(p);
  const doTopo = visitas ? ((n / visitas) * 100).toFixed(1) + "%" : "-";
  const doAnterior = anterior ? ((n / anterior) * 100).toFixed(1) + "%" : "-";
  console.log(`  ${p.padEnd(11)} ${String(n).padStart(6)}   ${doTopo.padStart(7)} do topo   ${doAnterior.padStart(7)} do passo anterior`);
  anterior = n;
}

const receita = eventos
  .filter((e) => e.evento === "assinatura")
  .reduce((soma, e) => soma + (e.valorCents ?? 0), 0);
if (receita) console.log(`\n  receita no periodo: R$ ${(receita / 100).toFixed(2)}`);

// Por origem: e o unico corte que muda decisao de midia paga.
const porOrigem = new Map<string, { visita: number; cadastro: number; assinatura: number }>();
for (const e of eventos) {
  const chave = e.origem ?? "direto";
  const linha = porOrigem.get(chave) ?? { visita: 0, cadastro: 0, assinatura: 0 };
  if (e.evento === "visita") linha.visita++;
  if (e.evento === "cadastro") linha.cadastro++;
  if (e.evento === "assinatura") linha.assinatura++;
  porOrigem.set(chave, linha);
}
if (porOrigem.size) {
  console.log("\nPOR ORIGEM (primeira visita)\n");
  const ordenado = [...porOrigem.entries()].sort((a, b) => b[1].visita - a[1].visita);
  for (const [origem, l] of ordenado.slice(0, 12)) {
    const conv = l.visita ? ((l.cadastro / l.visita) * 100).toFixed(1) + "%" : "-";
    console.log(`  ${origem.slice(0, 28).padEnd(30)} ${String(l.visita).padStart(5)} visitas  ${String(l.cadastro).padStart(4)} cadastros (${conv})  ${String(l.assinatura).padStart(3)} assinaturas`);
  }
}

// Contagem de gente, que vem das tabelas de verdade e nao dos eventos: usuario
// e assinatura sao fatos, evento e medida, e quando os dois divergem quem manda
// e o fato.
const [usuariosNovos, pagantes] = await Promise.all([
  prisma.user.count({ where: { createdAt: { gte: desde } } }),
  prisma.user.count({ where: { plan: { not: "free" } } }),
]);
console.log(`\nNO BANCO: ${usuariosNovos} usuarios criados no periodo | ${pagantes} pagantes hoje`);

if (gasto !== null) {
  const cadastros = conta("cadastro");
  const assinaturas = conta("assinatura");
  console.log(`\nCOM R$ ${gasto.toFixed(2)} de anuncio no periodo:`);
  console.log(`  custo por cadastro:   ${cadastros ? "R$ " + (gasto / cadastros).toFixed(2) : "sem cadastro ainda"}`);
  console.log(`  custo por assinatura: ${assinaturas ? "R$ " + (gasto / assinaturas).toFixed(2) : "sem assinatura ainda"}`);
  console.log(`  o teto viavel, com o plano Autoridade anual, e R$ 710 por cliente.`);
}

const demo = await prisma.demoRun.count({ where: { createdAt: { gte: desde } } });
const comEmail = await prisma.demoRun.count({ where: { createdAt: { gte: desde }, email: { not: null } } });
console.log(`\nDEMO PUBLICA: ${demo} rodadas | ${comEmail} deixaram e-mail`);
console.log("");
await prisma.$disconnect();
