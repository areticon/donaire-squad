import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/app-shell";
import { destinoDeEntrada } from "@/lib/onboarding/portao";
import { BannerDoPlano } from "@/components/billing/banner-do-plano";
import { prisma } from "@/lib/db/prisma";
import { DescartesProvider } from "@/components/ui/descartar";
import { sementeDoCliente } from "@/lib/avisos/descartes";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  const pathnameCedo = (await headers()).get("x-pathname") ?? "";
  if (!userId) {
    // Preservar o destino importa: a volta do Stripe cai aqui se a sessão se
    // perder no caminho, e sem o redirect a pessoa relogava e aterrissava em
    // lugar nenhum (aconteceu no teste de jornada de 21/08).
    redirect(
      pathnameCedo
        ? `/sign-in?redirect=${encodeURIComponent(pathnameCedo)}`
        : "/sign-in"
    );
  }

  // O pathname vem carimbado pelo proxy: o App Router não entrega a rota
  // para um layout, e o proxy roda na borda, sem acesso ao banco. Ver
  // lib/onboarding/portao.ts para o porquê do portão existir.
  const pathname = pathnameCedo;
  const destino = await destinoDeEntrada(userId, pathname);
  if (destino.tipo === "planos") redirect("/planos?assinar=1");
  // Membro com a assinatura do dono pausada (01/10): tela própria, sem preço.
  if (destino.tipo === "equipe-pausada") redirect("/equipe-pausada");
  // Contrato assinado (ou a assinar) e ainda não pago (04/10): não é cliente ainda.
  if (destino.tipo === "aguardando-pagamento") redirect("/aguardando-pagamento");

  /**
   * A FAIXA DO PLANO ENTRA AQUI, e nao em cada pagina (22/09).
   *
   * Uma tela nova esquecer a faixa e questao de tempo, e faixa que existe em
   * sete telas e falta na oitava e pior que faixa nenhuma: o cliente aprende
   * a procurar o saldo num lugar que as vezes nao tem.
   *
   * Ela e componente de SERVIDOR renderizado dentro de um componente de
   * CLIENTE, o que so funciona porque quem monta e este layout, que e de
   * servidor: o elemento ja vai pronto como `children`.
   */
  // O item "Painel" do menu só existe para admin. O papel é lido aqui, no
  // servidor, porque a sessão do navegador não carrega o papel e o menu é
  // componente de cliente.
  //
  // A SEMENTE DOS DESCARTES (07/10) vem na mesma leva: as chaves das telas que
  // a pessoa descartou, para cada aviso já nascer escondido, sem piscar. Erro
  // vira lista vazia (lib/avisos/descartes.ts nunca lança).
  const [eu, descartados] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    sementeDoCliente(userId),
  ]);
  const ehAdmin = eu?.role === "admin";
  // O NÚMERO AO LADO DE "DEMONSTRAÇÕES" (01/10): reuniões marcadas que começam da última
  // hora até 7 dias à frente. Só roda para admin, para cliente não pagar uma
  // consulta a mais por página; leitura pura, e falha vira zero em vez de
  // derrubar o menu.
  const demonstracoesProximas = ehAdmin ? await contarDemonstracoesProximas() : 0;
  // OS CHAMADOS ABERTOS (02/10), o número ao lado de "Chamados". Mesma regra:
  // só admin, leitura pura, falha vira zero.
  const chamadosAbertos = ehAdmin ? await prisma.chamado.count({ where: { status: "aberto" } }).catch(() => 0) : 0;

  return (
    <DescartesProvider iniciais={descartados}>
      <AppShell ehAdmin={ehAdmin} demonstracoesProximas={demonstracoesProximas} chamadosAbertos={chamadosAbertos}>
        <div className="px-4 pt-4 sm:px-6 sm:pt-6">
          <BannerDoPlano userId={userId} />
        </div>
        {children}
      </AppShell>
    </DescartesProvider>
  );
}

/** Fora do componente: a regra do React não quer relógio lido durante o desenho. */
async function contarDemonstracoesProximas(): Promise<number> {
  const agora = Date.now();
  return prisma.reuniaoDeDemonstracao
    .count({
      where: { status: "marcada", inicio: { gt: new Date(agora - 60 * 60 * 1000), lt: new Date(agora + 7 * 24 * 60 * 60 * 1000) } },
    })
    .catch(() => 0);
}
