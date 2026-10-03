import { Suspense } from "react";
import { headers } from "next/headers";
import { getSessionCookie } from "better-auth/cookies";
import { PlanosConteudo } from "./conteudo";

/**
 * A página de planos. O conteúdo é de cliente (lê a sessão e a query); este
 * invólucro de servidor existe só para decidir a cor ANTES da primeira pintura
 * (01/10): visitante sem sessão vê a página no escuro, como a landing de onde
 * veio; quem tem sessão segue o tema do app. Olhar só o cookie, e não abrir a
 * sessão no banco, basta: é a mesma checagem otimista do proxy.ts, e o pior
 * caso (cookie vencido) é ver a página no tema do app em vez do escuro.
 */
export default async function PlanosPage() {
  const temSessao = Boolean(getSessionCookie(await headers()));
  // useSearchParams precisa de Suspense em torno, senão o build reclama de
  // pré-renderização.
  return (
    <Suspense>
      <PlanosConteudo vitrine={!temSessao} />
    </Suspense>
  );
}
