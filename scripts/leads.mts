/**
 * Quem deixou contato na demonstração pública, pronto para colar no Notion.
 *
 *   npx tsx --env-file=.env.local scripts/leads.mts            # 7 dias
 *   npx tsx --env-file=.env.local scripts/leads.mts 30         # 30 dias
 *   npx tsx --env-file=.env.local scripts/leads.mts 7 --tabela # só a tabela
 *
 * É a ponte entre o banco e a base "Prospects da Demandou" enquanto não
 * existir integração, e evita consulta a mão no Supabase.
 *
 * O TEXTO CRU importa mais que o contato, e por isso ele vem inteiro na ficha
 * e não só na tabela. É o que a pessoa escreveu com as próprias palavras antes
 * de saber que alguém ia ler, então é ele que diz se ela já grava vídeo, o que
 * ela vende e com que dor. A primeira frase da abordagem sai daí, e não do
 * e-mail dela.
 */
import { prisma } from "../lib/db/prisma";
import { telefoneLegivel } from "../lib/demo/telefone";

const dias = Number(process.argv[2] ?? 7);
const soTabela = process.argv.includes("--tabela");
const desde = new Date(Date.now() - dias * 86400_000);

const leads = await prisma.demoRun.findMany({
  where: { email: { not: null }, createdAt: { gte: desde } },
  orderBy: { createdAt: "desc" },
  select: {
    id: true,
    nome: true,
    email: true,
    telefone: true,
    consentimentoEm: true,
    input: true,
    convertedUserId: true,
    createdAt: true,
  },
});

if (leads.length === 0) {
  console.log(`\nNinguém deixou contato na demo nos últimos ${dias} dias.\n`);
  process.exit(0);
}

// Quem virou cadastro DEPOIS: o campo é preenchido no cadastro, e é a única
// medida honesta de que a demo puxou cliente, em vez de só puxar e-mail.
const viraram = leads.filter((l) => l.convertedUserId).length;
const comTelefone = leads.filter((l) => l.telefone).length;

const dataCurta = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

/** Uma linha só, para caber na célula da tabela. */
function resumir(texto: string, limite = 90): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1)}…`;
}

if (!soTabela) {
  console.log(`\nCONTATOS DA DEMO, últimos ${dias} dias`);
  console.log(`${leads.length} pessoa(s), ${comTelefone} com telefone, ${viraram} viraram cadastro\n`);

  for (const l of leads) {
    console.log("─".repeat(78));
    console.log(`${l.nome ?? "(sem nome)"}  ${l.email}`);
    const canais = [
      l.telefone ? telefoneLegivel(l.telefone) : null,
      l.consentimentoEm ? "autorizou WhatsApp" : null,
      l.convertedUserId ? "JÁ SE CADASTROU" : null,
    ].filter(Boolean);
    console.log(`${dataCurta(l.createdAt)}${canais.length ? "  ·  " + canais.join("  ·  ") : ""}`);
    console.log("");
    console.log("O que ela escreveu na demo:");
    console.log(l.input.trim().split("\n").map((linha) => `  ${linha}`).join("\n"));
    console.log("");
  }
}

// A tabela é colável na base do Notion: cabeçalho e linhas separadas por
// tabulação, que é o que o Notion entende ao colar.
console.log("─".repeat(78));
console.log("COLE ISTO NA BASE Prospects da Demandou:\n");
console.log(["Nome", "E-mail", "Telefone", "WhatsApp", "Virou cadastro", "Data", "O que falou"].join("\t"));
for (const l of leads) {
  console.log(
    [
      l.nome ?? "",
      l.email ?? "",
      l.telefone ? telefoneLegivel(l.telefone) : "",
      l.consentimentoEm ? "sim" : "não",
      l.convertedUserId ? "sim" : "não",
      dataCurta(l.createdAt),
      resumir(l.input),
    ].join("\t")
  );
}
console.log("");

await prisma.$disconnect();
