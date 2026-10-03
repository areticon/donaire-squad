"use client";

import { useCallback, useEffect, useId, useRef } from "react";
import type { ProvaDoNavegador } from "@/lib/anti-robo/regras";

/**
 * A DEFESA CONTRA ROBÔ, DO LADO DA TELA (01/10).
 *
 * Um gancho só para os quatro formulários públicos (cadastro, captura da
 * landing, calculadora e demonstração), para a regra ser a mesma nos quatro.
 * Ele entrega duas coisas:
 *
 * - `campos`: o campo isca invisível e, quando a chave existir, a caixa do
 *   Turnstile. Vai dentro do <form>;
 * - `prova()`: chamada no envio, devolve o que o servidor confere.
 *
 * QUEM É GENTE NÃO PERCEBE NADA, e foi a condição do pedido: o cadastro de
 * pessoa de verdade não pode ficar mais difícil. A isca não aparece nem para
 * leitor de tela (aria-hidden e fora do tab); o tempo mínimo é esperado AQUI,
 * em silêncio, antes de enviar, então o preenchimento automático do navegador
 * em um segundo vira um "Aguarde..." de dois segundos, e não um erro; e o
 * Turnstile no modo "só se precisar" fica invisível na quase totalidade das
 * visitas.
 *
 * Não importa nada que toque o banco: só o tipo da prova, de um módulo puro.
 */

/** Um pouco acima dos 3 s que o servidor exige, para o relógio não brigar. */
const ESPERA_MINIMA_MS = 3_500;
/** Tela aberta há horas pede carimbo novo; o servidor recusa depois de 12 h. */
const RENOVAR_DEPOIS_MS = 6 * 60 * 60 * 1000;
/** Quanto o envio espera o Turnstile terminar, quando ele está ligado. */
const ESPERA_DO_TURNSTILE_MS = 8_000;

const CHAVE_DO_SITE = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

type Carimbo = { valor: string; recebidoEm: number };

type Turnstile = {
  render: (el: HTMLElement, opcoes: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function buscarCarimbo(): Promise<Carimbo | null> {
  try {
    const r = await fetch("/api/anti-robo", { cache: "no-store" });
    const d = (await r.json()) as { carimbo?: unknown };
    return typeof d.carimbo === "string" ? { valor: d.carimbo, recebidoEm: Date.now() } : null;
  } catch {
    return null;
  }
}

/** O script da Cloudflare, carregado uma vez por página, e só se a chave existir. */
let scriptDoTurnstile: Promise<void> | null = null;
function carregarTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptDoTurnstile) {
    scriptDoTurnstile = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => {
        scriptDoTurnstile = null;
        reject(new Error("turnstile"));
      };
      document.head.appendChild(s);
    });
  }
  return scriptDoTurnstile;
}

export function useAntiRobo() {
  const carimbo = useRef<Carimbo | null>(null);
  const pedido = useRef<Promise<Carimbo | null> | null>(null);
  const isca = useRef<HTMLInputElement>(null);
  const caixa = useRef<HTMLDivElement>(null);
  const token = useRef("");
  const widget = useRef<string | null>(null);
  const idDaIsca = useId();

  const garantirCarimbo = useCallback(async (): Promise<Carimbo | null> => {
    if (carimbo.current) return carimbo.current;
    if (!pedido.current) {
      pedido.current = buscarCarimbo().then((c) => {
        carimbo.current = c;
        pedido.current = null;
        return c;
      });
    }
    return pedido.current;
  }, []);

  // O carimbo é pedido quando a tela abre: o tempo mínimo começa a contar aqui.
  useEffect(() => {
    void garantirCarimbo();
  }, [garantirCarimbo]);

  // O Turnstile só existe com a chave pública no ambiente (desligado por padrão).
  useEffect(() => {
    if (!CHAVE_DO_SITE) return;
    let vivo = true;
    carregarTurnstile()
      .then(() => {
        if (!vivo || !caixa.current || !window.turnstile || widget.current) return;
        widget.current = window.turnstile.render(caixa.current, {
          sitekey: CHAVE_DO_SITE,
          // Só aparece quando a Cloudflare precisa de um clique; no resto, invisível.
          appearance: "interaction-only",
          "refresh-expired": "auto",
          language: "pt-br",
          callback: (t: string) => {
            token.current = t;
          },
          "expired-callback": () => {
            token.current = "";
          },
          "error-callback": () => {
            token.current = "";
          },
        });
      })
      .catch(() => {
        // Sem o script, o envio vai sem token e o servidor decide; as outras
        // camadas continuam valendo.
      });
    return () => {
      vivo = false;
      if (widget.current && window.turnstile) window.turnstile.remove(widget.current);
      widget.current = null;
    };
  }, []);

  const prova = useCallback(async (): Promise<ProvaDoNavegador> => {
    let c = carimbo.current;
    if (!c || Date.now() - c.recebidoEm > RENOVAR_DEPOIS_MS) {
      carimbo.current = null;
      c = await garantirCarimbo();
    }
    if (c) {
      const falta = c.recebidoEm + ESPERA_MINIMA_MS - Date.now();
      if (falta > 0) await esperar(falta);
    }
    if (CHAVE_DO_SITE && !token.current) {
      const ate = Date.now() + ESPERA_DO_TURNSTILE_MS;
      while (!token.current && Date.now() < ate) await esperar(250);
    }
    const resultado: ProvaDoNavegador = {
      isca: isca.current?.value ?? "",
      carimbo: c?.valor,
      turnstile: token.current || undefined,
    };
    // O token do Turnstile vale para UM envio. Se o servidor recusar por outro
    // motivo e a pessoa enviar de novo, ela precisa de um token novo.
    if (widget.current && window.turnstile) {
      token.current = "";
      window.turnstile.reset(widget.current);
    }
    return resultado;
  }, [garantirCarimbo]);

  const campos = (
    <>
      {/* A ISCA: fora da tela, fora do tab e escondida do leitor de tela. O
          nome "website" é de propósito o que robô de formulário adora preencher. */}
      <div
        aria-hidden="true"
        style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}
      >
        <label htmlFor={idDaIsca}>Deixe este campo em branco</label>
        <input ref={isca} id={idDaIsca} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      {CHAVE_DO_SITE && <div ref={caixa} className="flex justify-center empty:hidden" />}
    </>
  );

  return { campos, prova };
}
