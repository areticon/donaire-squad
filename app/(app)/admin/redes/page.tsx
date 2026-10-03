export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { exigirAdmin } from "@/lib/admin/guarda";
import { lerContasDaPonte, lerContasDosProjetos, type ContaDaPonte } from "@/lib/admin/blotato-vinculos";
import { pedidosRecentes, redesDeConexaoAssistida } from "@/lib/social/conexao-assistida";
import { blotatoLigado } from "@/lib/publish/roteador";
import { RedesDosClientes } from "@/components/admin/redes-dos-clientes";

/**
 * REDES DOS CLIENTES (01/10): ligar uma conta da ponte (Blotato) a um projeto
 * sem terminal, e ver por onde cada conta de cada projeto publica.
 *
 * Existe para o dia do primeiro cliente: o time conecta a rede dele no painel
 * da ponte durante a chamada e, na mesma hora, liga a conta ao projeto aqui.
 * Antes isso era o script scripts/blotato-contas.mts, que chama as mesmas
 * funções (lib/admin/blotato-vinculos.ts).
 *
 * Server component: a leitura desce pronta e o componente de cliente só
 * escolhe e chama /api/admin/redes. Quem não é admin recebe 404.
 */
export default async function RedesDosClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ projeto?: string }>;
}) {
  if (!(await exigirAdmin())) notFound();
  const { projeto } = await searchParams;

  let ponte: ContaDaPonte[] = [];
  let erroDaPonte: string | null = null;
  if (blotatoLigado()) {
    try {
      ponte = await lerContasDaPonte();
    } catch (e) {
      erroDaPonte = e instanceof Error ? e.message : String(e);
    }
  } else {
    erroDaPonte = "BLOTATO_API_KEY ausente neste ambiente: a ponte está desligada.";
  }

  const [contas, projetos, pedidos] = await Promise.all([
    lerContasDosProjetos(),
    prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, user: { select: { email: true, name: true } } },
    }),
    pedidosRecentes(),
  ]);

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Redes dos clientes
        </h1>
        <Link href="/admin" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar ao painel
        </Link>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Conexão assistida: conecte a rede do cliente no painel da ponte (my.blotato.com/settings) e ligue a conta ao
        projeto aqui. O cliente nunca vê o nome da ponte.
      </p>
      <RedesDosClientes
        ponte={ponte.map((c) => ({
          id: c.id,
          platform: c.platform,
          nome: c.fullname ?? null,
          usuario: c.username ?? null,
          paginas: c.paginas,
          erroDasPaginas: c.erroDasPaginas ?? null,
        }))}
        erroDaPonte={erroDaPonte}
        contas={contas}
        projetos={projetos.map((p) => ({ id: p.id, nome: p.name, dono: p.user.email, donoNome: p.user.name ?? null }))}
        pedidos={pedidos}
        ambiente={{
          ponteLigada: blotatoLigado(),
          redesPelaPonte: process.env.PUBLICAR_VIA_BLOTATO?.trim() || null,
          contasPelaPonte: process.env.PUBLICAR_VIA_BLOTATO_CONTAS?.trim() || null,
          assistidas: redesDeConexaoAssistida(),
        }}
        projetoInicial={projeto ?? null}
      />
    </div>
  );
}
