import { redirect } from "next/navigation";

/**
 * Plano e cobrança passaram a morar em /settings, dentro das configurações da
 * conta (pedido do Bruno em 12/09/2026: "a tela de plano deveria ser
 * configurações da conta, ali ele tem a opção de cancelar, ajustar").
 *
 * A rota fica de pé como redirect porque ela está em link de e-mail, na volta
 * do checkout do Stripe e no portão de entrada (lib/onboarding/portao.ts a
 * isenta). Matar o endereço quebraria quem já pagou.
 */
export default function BillingRedirectPage() {
  redirect("/settings?aba=plano");
}
