import { notFound } from "next/navigation";
import { GaleriaDaBiblioteca } from "@/components/biblioteca-de-design/galeria-da-biblioteca";

/**
 * A GALERIA DA BIBLIOTECA COM DADOS DE EXEMPLO (06/10/2026): só no
 * `next dev`, fora do app logado, para olhar a tela sem sessão e sem tocar
 * no banco (compartilhado com a produção). Em produção é 404. Mesmo espírito
 * do `?exemplo=1` do painel de admin.
 */
export const dynamic = "force-dynamic";

export default function PaginaDeExemploDaBiblioteca() {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6" style={{ background: "var(--bg-base)", color: "var(--text-primary)" }}>
      <p className="mb-3 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
        Dados de exemplo, só no ambiente local: a semente do catálogo com usos inventados em memória, mais quatro pedidos de clientes fictícios. Nada vem do banco nem vai para ele.
      </p>
      <section className="rounded-xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <GaleriaDaBiblioteca exemplo />
      </section>
    </main>
  );
}
