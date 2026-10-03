export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirAdmin } from "@/lib/admin/guarda";
import { lerCrm } from "@/lib/admin/crm";
import { CrmClientes } from "@/components/admin/crm-clientes";

/**
 * O CRM (pedido do Bruno em 23/09). A leitura desce pronta do servidor, e a
 * tela de cliente só filtra e abre a ficha; as ações vão para
 * /api/admin/usuarios, que confere o papel de admin a cada chamada.
 */
export default async function ClientesPage() {
  if (!(await exigirAdmin())) notFound();
  const { clientes, leuStripe } = await lerCrm();
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-baseline justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
          Clientes
        </h1>
        <Link href="/admin" className="text-sm text-orange-400 hover:text-orange-300">
          Voltar ao painel
        </Link>
      </div>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        Leads, contas e assinaturas num lugar só. A situação de quem assina vem do Stripe; clique numa conta para ver a
        ficha e agir.
      </p>
      <CrmClientes clientes={clientes} leuStripe={leuStripe} />
    </div>
  );
}
