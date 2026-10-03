"use client";

import { Building2, UserRound } from "lucide-react";
import { RedeIcone, COR_DA_REDE } from "@/components/social/rede-icone";
import { cn } from "@/lib/utils";

/**
 * O selo de uma conta: a foto, o nome e o que ela é.
 *
 * ## Por que existe
 *
 * Pedido do Bruno em 18/09: "quando clico no card não fica claro se são da
 * página ou do perfil, precisa trazer foto, logo e nome, e para as demais
 * redes a mesma coisa". A linha antiga dizia `demandou (página)` em texto
 * cinza de 10px, do lado direito, e o projeto dele tem DUAS contas de LinkedIn
 * com o mesmo ícone: uma página e um perfil. O ícone da rede sozinho não
 * distingue, e é por ele que o olho procura.
 *
 * ## O desenho
 *
 * A foto é o que identifica (a logo da página, o rosto da pessoa), e o ícone
 * da rede vira um selo pequeno sobre ela, porque a rede é a informação
 * secundária: com o avatar na tela, ninguém confunde a página da empresa com o
 * perfil do dono. Sem foto, a inicial no fundo da cor da rede.
 */

export type ContaParaSelo = {
  id?: string;
  platform: string;
  displayName: string | null;
  accountType: string;
  avatarUrl?: string | null;
};

export function ehPagina(conta: { accountType: string }): boolean {
  return conta.accountType === "organization";
}

export function rotuloDaConta(conta: ContaParaSelo): string {
  return `${conta.displayName ?? conta.platform} (${ehPagina(conta) ? "página" : "perfil"})`;
}

/** Só a foto com o selo da rede, para linhas apertadas. */
export function FotoDaConta({
  conta,
  tamanho = 28,
  className,
}: {
  conta: ContaParaSelo;
  tamanho?: number;
  className?: string;
}) {
  const inicial = (conta.displayName ?? conta.platform).trim().charAt(0).toUpperCase();
  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: tamanho, height: tamanho }}
      title={rotuloDaConta(conta)}
    >
      {conta.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={conta.avatarUrl}
          alt=""
          className="h-full w-full rounded-full object-cover"
          style={{ border: "1px solid var(--border)" }}
          loading="lazy"
          // A foto vem do CDN da rede e expira sem avisar. Quando ela morre, o
          // que fica é a inicial, e não um quadrado quebrado.
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const irmao = e.currentTarget.nextElementSibling as HTMLElement | null;
            if (irmao) irmao.style.display = "flex";
          }}
        />
      ) : null}
      <span
        className="h-full w-full items-center justify-center rounded-full text-[11px] font-bold text-white"
        style={{
          display: conta.avatarUrl ? "none" : "flex",
          background: COR_DA_REDE[conta.platform] ?? "var(--bg-elevated)",
        }}
      >
        {inicial}
      </span>
      {/* o selo da rede, sobre a foto */}
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full"
        style={{
          width: Math.round(tamanho * 0.46),
          height: Math.round(tamanho * 0.46),
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
        }}
      >
        <RedeIcone plataforma={conta.platform} className="h-[9px] w-[9px]" />
      </span>
    </span>
  );
}

/** A foto com o nome e o tipo, em uma linha. */
export function SeloDaConta({
  conta,
  tamanho = 28,
  className,
}: {
  conta: ContaParaSelo;
  tamanho?: number;
  className?: string;
}) {
  const pagina = ehPagina(conta);
  return (
    <span className={cn("flex min-w-0 items-center gap-2", className)}>
      <FotoDaConta conta={conta} tamanho={tamanho} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[11.5px] font-semibold" style={{ color: "var(--text-primary)" }}>
          {conta.displayName ?? conta.platform}
        </span>
        <span className="flex items-center gap-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {pagina ? <Building2 className="h-2.5 w-2.5" /> : <UserRound className="h-2.5 w-2.5" />}
          {pagina ? "página" : "perfil"}
        </span>
      </span>
    </span>
  );
}
