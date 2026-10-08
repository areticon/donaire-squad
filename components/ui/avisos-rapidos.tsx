"use client";

import { Toaster, ToastBar, toast } from "react-hot-toast";
import { BotaoDescartar } from "@/components/ui/descartar";

/**
 * OS TOASTS COM X (07/10/2026). Pedido do Bruno: "toda notificação precisa ter
 * a opção de descartar". Um render só no Toaster cobre todos os `toast()`,
 * `toast.success` e `toast.error` da plataforma, inclusive os que trazem
 * "Desfazer": o X fica separado e só fecha, nunca desfaz.
 *
 * Arquivo de cliente porque função não atravessa a fronteira do servidor para
 * o cliente (app/layout.tsx é de servidor). Sem persistência: toast é efêmero,
 * e a duração continua a de sempre.
 *
 * REGRA: `toast.custom` NÃO passa por este render e ficaria sem X. Não usar;
 * se um dia precisar, o X vai dentro do próprio conteúdo.
 */
export function AvisosRapidos() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        style: {
          background: "var(--bg-elevated)",
          color: "var(--text-primary)",
          border: "1px solid var(--border)",
        },
      }}
    >
      {(t) => (
        <ToastBar toast={t}>
          {({ icon, message }) => (
            <>
              {icon}
              {message}
              {t.type !== "loading" && <BotaoDescartar compacto aoDescartar={() => toast.dismiss(t.id)} className="-mr-1" />}
            </>
          )}
        </ToastBar>
      )}
    </Toaster>
  );
}
