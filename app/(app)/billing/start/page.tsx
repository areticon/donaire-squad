"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";

/**
 * Ponte entre o cadastro e o checkout: quem escolheu um plano antes de criar
 * a conta chega aqui logado e é levado direto ao Stripe daquele plano, sem
 * parada no dashboard. Existe como página (e não como redirect no servidor)
 * porque o checkout é um POST autenticado que devolve URL externa.
 */
function BillingStart() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const indo = useRef(false);

  useEffect(() => {
    if (indo.current) return;
    indo.current = true;
    const planId = searchParams.get("plan") ?? "pro";
    const ciclo = searchParams.get("ciclo") === "anual" ? "anual" : undefined;
    (async () => {
      try {
        const res = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planId, ciclo }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        window.location.href = data.url;
      } catch (err) {
        console.error(err);
        toast.error("Não consegui abrir o checkout. Você pode assinar pela página de plano.");
        router.replace("/billing");
      }
    })();
  }, [router, searchParams]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center gap-3" style={{ color: "var(--text-muted)" }}>
      <Loader2 className="w-5 h-5 animate-spin" />
      Preparando seu teste grátis...
    </div>
  );
}

export default function BillingStartPage() {
  return (
    <Suspense>
      <BillingStart />
    </Suspense>
  );
}
