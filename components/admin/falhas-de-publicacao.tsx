import { prisma } from "@/lib/db/prisma";
import { chamadoDaFalha, codigoDaFalha } from "@/lib/publish/codigos";
import { traducaoCompleta } from "@/lib/publish/codigos-admin";
import { nomeDaRede } from "@/lib/posts/estado";

/**
 * AS PUBLICAÇÕES QUE FALHARAM, NA LÍNGUA DO ADMIN (01/10/2026).
 *
 * Componente de SERVIDOR (sem "use client"): consulta o banco e lê a metade
 * técnica do dicionário (`lib/publish/codigos-admin.ts`), e nada disso desce
 * para o navegador como código. Só entra no painel de admin, que já barra
 * quem não é admin com 404.
 *
 * Mostra lado a lado o que o cliente leu (título do código) e o que é de
 * verdade (explicação técnica e frase gravada), para o atendimento do chamado
 * começar sabendo o caminho do conserto.
 */
export async function FalhasDePublicacao({
  dias = 7,
  limite = 30,
  comTitulo = true,
}: {
  dias?: number;
  limite?: number;
  /** Sem título quando mora dentro do cartão do painel gráfico (01/10). */
  comTitulo?: boolean;
}) {
  const desde = inicioDaJanela(dias);
  const falhas = await prisma.post.findMany({
    where: { status: "failed", updatedAt: { gte: desde } },
    orderBy: { updatedAt: "desc" },
    take: limite,
    select: {
      id: true,
      platform: true,
      mediaType: true,
      updatedAt: true,
      metadata: true,
      project: { select: { name: true, user: { select: { email: true } } } },
    },
  });

  return (
    <section className={comTitulo ? "mb-8" : ""}>
      {comTitulo && (
        <>
          <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
            Publicações que falharam
          </h2>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Últimos {dias} dias. O cliente lê só o título e o código; a explicação técnica é daqui e do e-mail do chamado.
          </p>
        </>
      )}
      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface)" }}>
              {["Quando", "Cliente e projeto", "Rede", "Código", "O que o cliente leu", "O que é, de verdade"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2 text-xs" style={{ color: "var(--text-muted)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {falhas.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-3 text-xs" style={{ color: "var(--text-muted)" }}>
                  Nenhuma publicação falhou no período.
                </td>
              </tr>
            )}
            {falhas.map((f) => {
              const codigo = codigoDaFalha(f.metadata);
              const t = codigo ? traducaoCompleta(codigo) : null;
              const frase = (f.metadata as { error?: unknown } | null)?.error;
              const protocolo = chamadoDaFalha(f.metadata);
              return (
                <tr key={f.id} className="border-t align-top" style={{ borderColor: "var(--border)" }} data-codigo-da-falha={codigo ?? ""}>
                  <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--text-muted)" }}>
                    {f.updatedAt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "var(--text-primary)" }}>
                    {f.project.name}
                    <div style={{ color: "var(--text-muted)" }}>{f.project.user?.email ?? "sem e-mail"}</div>
                    <div className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{f.id}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-xs" style={{ color: "var(--text-primary)" }}>
                    {nomeDaRede(f.platform)} · {f.mediaType ?? "?"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-xs font-semibold" style={{ color: codigo ? "#f87171" : "var(--text-muted)" }}>
                      {codigo ?? "sem código"}
                    </span>
                    {protocolo && (
                      <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
                        chamado {protocolo}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs min-w-[180px] max-w-[240px]" style={{ color: "var(--text-primary)" }}>
                    {t ? t.titulo : "(frase sem código, abaixo)"}
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[520px]" style={{ color: "var(--text-muted)" }}>
                    {t && <p style={{ color: "var(--text-primary)" }}>{t.tecnico}</p>}
                    {typeof frase === "string" && <p className="mt-1 italic">Gravado na peça: {frase}</p>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Fora do componente: a regra do React não quer relógio lido durante o desenho. */
function inicioDaJanela(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}
