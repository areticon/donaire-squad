"use client";

import { useEffect } from "react";

/**
 * O rastro: guarda de onde a pessoa veio e avisa o servidor que ela chegou.
 *
 * Componente sem nada na tela, de propósito. Ele faz duas coisas, uma vez por
 * aba:
 *
 * 1. Grava a origem da PRIMEIRA visita num cookie de 90 dias, e só da primeira:
 *    quem chega pelo anúncio, sai e volta depois pelo Google continua sendo do
 *    anúncio, que é o que a conta de custo por cliente exige. Cookie próprio,
 *    de primeira parte, sem rastreador de terceiro.
 * 2. Manda o passo `visita` para `/api/eventos`, uma vez por sessão de
 *    navegação (`sessionStorage`), para recarregar a página não virar visita
 *    nova e inflar o denominador da conversão.
 */

const COOKIE = "dmd_origem";
const DIAS = 90;
const MARCA_DE_SESSAO = "dmd_visita_enviada";

type Origem = { origem?: string; campanha?: string; midia?: string; termo?: string };

function lerCookie(nome: string): string | null {
  const achado = document.cookie.split("; ").find((c) => c.startsWith(`${nome}=`));
  return achado ? achado.slice(nome.length + 1) : null;
}

function origemDaUrl(): Origem {
  const p = new URLSearchParams(window.location.search);
  const limpa = (v: string | null) => (v ? v.trim().slice(0, 120) : undefined);
  const origem =
    limpa(p.get("utm_source")) ??
    // Sem utm, o referenciador externo é a melhor pista que existe. O próprio
    // domínio não conta: navegar dentro do site não é uma origem nova.
    (document.referrer && !document.referrer.includes(window.location.host)
      ? new URL(document.referrer).hostname
      : undefined);
  return {
    origem,
    campanha: limpa(p.get("utm_campaign")),
    midia: limpa(p.get("utm_medium")),
    termo: limpa(p.get("utm_term")) ?? limpa(p.get("utm_content")),
  };
}

export function Rastro() {
  useEffect(() => {
    let origem: Origem = {};
    try {
      const guardada = lerCookie(COOKIE);
      if (guardada) {
        origem = JSON.parse(decodeURIComponent(guardada)) as Origem;
      } else {
        origem = origemDaUrl();
        if (origem.origem || origem.campanha) {
          const valor = encodeURIComponent(JSON.stringify(origem));
          document.cookie = `${COOKIE}=${valor}; path=/; max-age=${DIAS * 86400}; samesite=lax`;
        }
      }
    } catch {
      // Cookie bloqueado não pode impedir a página de existir.
    }

    try {
      if (sessionStorage.getItem(MARCA_DE_SESSAO)) return;
      sessionStorage.setItem(MARCA_DE_SESSAO, "1");
    } catch {
      // Navegação anônima com storage bloqueado: manda mesmo assim, uma vez.
    }

    const corpo = JSON.stringify({
      evento: "visita",
      caminho: window.location.pathname,
      ...origem,
    });
    // `keepalive` porque a pessoa pode clicar em outra coisa no mesmo segundo,
    // e requisição cancelada é visita perdida.
    void fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corpo,
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
