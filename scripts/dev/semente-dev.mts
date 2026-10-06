/**
 * Semente mínima do banco de DEV (06/10/2026).
 *
 * Cria (ou confere, se já existe: pode rodar quantas vezes quiser) só o que o
 * ensaio precisa para entrar e trabalhar:
 *   - a conta admin do Bruno (bruno.donaire@demandou.com, role admin);
 *   - uma conta de cliente de teste (bruno.donaire+cliente-dev@demandou.com,
 *     plano pro, 5.000 créditos, conta interna), para provar como cliente;
 *   - um projeto ativo em cada conta, com o squad padrão (FICHAS_DOS_AGENTES).
 *
 * NUNCA copia dado de cliente da produção (Lei Geral de Proteção de Dados).
 * A senha das duas contas vem de DEMANDOU_SEMENTE_SENHA, nunca do código.
 *
 * Rodar SEMPRE pelo envoltório, que carrega o .env.dev.local e passa a trava:
 *   DEMANDOU_SEMENTE_SENHA=... node scripts/dev/com-env-dev.mjs npx tsx scripts/dev/semente-dev.mts
 */
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db/prisma";
import { FICHAS_DOS_AGENTES } from "@/lib/squad/definicoes-dos-agentes";
import { ambienteAtual, ehBancoDeProducao } from "@/lib/ambiente/trava-do-banco.mjs";

// Dupla conferência, além da trava que o prisma já passou ao ser importado.
if (ambienteAtual() !== "dev") throw new Error("[semente] só roda com DEMANDOU_AMBIENTE=dev (use scripts/dev/com-env-dev.mjs)");
if (ehBancoDeProducao(process.env.DATABASE_URL) || ehBancoDeProducao(process.env.DIRECT_URL)) {
  throw new Error("[semente] o banco é o de PRODUÇÃO; nada foi escrito");
}
const senha = process.env.DEMANDOU_SEMENTE_SENHA ?? "";
if (senha.length < 10) throw new Error("[semente] DEMANDOU_SEMENTE_SENHA ausente ou curta (mínimo 10 caracteres)");

type Conta = { email: string; nome: string; role: string; plan: string; creditos: number; projeto: string };

const CONTAS: Conta[] = [
  { email: "bruno.donaire@demandou.com", nome: "Bruno Donaire", role: "admin", plan: "free", creditos: 0, projeto: "O essencial bem feito (dev)" },
  { email: "bruno.donaire+cliente-dev@demandou.com", nome: "Cliente de teste", role: "user", plan: "pro", creditos: 5000, projeto: "Projeto do cliente de teste" },
];

async function semearConta(c: Conta) {
  const user = await prisma.user.upsert({
    where: { email: c.email },
    update: {},
    create: {
      email: c.email,
      name: c.nome,
      emailVerified: true,
      role: c.role,
      plan: c.plan,
      creditsBalance: c.creditos,
      contaInterna: true,
    },
  });

  const credencial = await prisma.account.findFirst({ where: { userId: user.id, providerId: "credential" } });
  if (!credencial) {
    await prisma.account.create({
      data: { userId: user.id, accountId: user.id, providerId: "credential", password: await hashPassword(senha) },
    });
  }

  let projeto = await prisma.project.findFirst({ where: { userId: user.id, name: c.projeto } });
  if (!projeto) {
    projeto = await prisma.project.create({
      data: {
        userId: user.id,
        name: c.projeto,
        description: "Projeto de ensaio do ambiente de dev. Sem dado de cliente.",
        status: "active",
        niche: "Gestão e empreendedorismo",
        targetAudience: "Donos de pequenas empresas",
        voice: "Direto, prático, sem jargão",
      },
    });
  }
  const agentes = await prisma.projectAgent.count({ where: { projectId: projeto.id } });
  if (agentes === 0) {
    await prisma.projectAgent.createMany({ data: FICHAS_DOS_AGENTES.map((a) => ({ ...a, projectId: projeto.id })) });
  }
  console.log(`[semente] ${c.email}: usuário ${user.id}, projeto ${projeto.id} (${c.projeto})`);
}

for (const c of CONTAS) await semearConta(c);
await prisma.$disconnect();
console.log("[semente] pronta");
