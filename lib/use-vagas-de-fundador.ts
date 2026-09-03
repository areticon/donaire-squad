"use client";

import { useEffect, useState } from "react";

/**
 * Quantas vagas de fundador restam, para telas de cliente (/planos e
 * /billing), que não podem importar lib/stripe. Vem de /api/planos/fundador,
 * que pergunta ao Stripe. Até a resposta chegar a tela mostra o preço de
 * lista: errar para o lado de prometer menos nunca gera reclamação.
 */
export function useVagasDeFundador(): number {
  const [vagas, setVagas] = useState(0);
  useEffect(() => {
    fetch("/api/planos/fundador")
      .then((r) => (r.ok ? r.json() : { vagas: 0 }))
      .then((d) => setVagas(Number(d.vagas) || 0))
      .catch(() => setVagas(0));
  }, []);
  return vagas;
}
