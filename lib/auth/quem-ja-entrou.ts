import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/server";

type Params = Record<string, string | string[] | undefined>;

function um(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v ? v : null;
}

export type JaConectado = {
  /** O e-mail da sessão aberta, para a pessoa saber em qual conta está. */
  email: string;
  /** Para onde "continuar com esta conta" leva. Só caminho interno. */
  continuar: string;
};

/**
 * QUEM JÁ ESTÁ LOGADO NÃO PREENCHE CADASTRO DE NOVO, E PODE TROCAR DE CONTA.
 *
 * Achado pelo Bruno em 23/09: confirmou o e-mail, caiu na escolha de plano,
 * clicou no Essencial e a tela pediu para criar conta outra vez. Com plano na
 * URL, a sessão aberta vai direto ao checkout dele, e isso vale para /planos,
 * o preço da landing e qualquer link antigo.
 *
 * SEM plano na URL, a página NÃO redireciona, e isso também foi achado em
 * 23/09, do jeito ruim: a primeira versão mandava todo logado para o
 * dashboard. O Bruno estava, sem saber, na conta de teste que criou numa guia
 * anônima; tentou entrar como administrador, a tela de login o devolvia ao
 * dashboard dessa conta de teste, o portão o mandava ao checkout, e não havia
 * caminho para sair. Quem abre a tela de login quer, quase sempre, trocar de
 * conta. Então a página mostra em qual conta a pessoa está e oferece as duas
 * saídas: continuar, ou sair e entrar com outra.
 */
export async function quemJaEntrou(searchParams: Promise<Params>): Promise<JaConectado | null> {
  const user = await currentUser();
  if (!user) return null;
  const sp = await searchParams;
  const plano = um(sp.plan);
  if (plano) {
    const ciclo = um(sp.ciclo);
    redirect(
      `/billing/start?plan=${encodeURIComponent(plano)}${ciclo ? `&ciclo=${encodeURIComponent(ciclo)}` : ""}`
    );
  }
  const destino = um(sp.redirect);
  return {
    email: user.email,
    // Só caminho interno: "//outro.site" e URL absoluta levariam a pessoa para
    // fora com a sessão aberta, que é o redirecionamento aberto clássico.
    continuar: destino && destino.startsWith("/") && !destino.startsWith("//") ? destino : "/dashboard",
  };
}
