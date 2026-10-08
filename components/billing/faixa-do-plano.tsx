"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Clock } from "lucide-react";
import type { PlanoNaTela } from "@/lib/plano-na-tela";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";
import { BotaoDescartar, useDescartes } from "@/components/ui/descartar";
import { chaveDoAlertaDoPlano } from "@/lib/avisos/chaves";

/**
 * A faixa do plano, no navegador. Nasce com o retrato que o servidor mandou
 * (sem piscar "carregando") e se atualiza sozinha. Ver banner-do-plano.tsx.
 */
export function FaixaDoPlano({ inicial }: { inicial: PlanoNaTela }) {
  const [p, setP] = useState(inicial);
  // Atualiza a cada minuto com a aba à vista, e na hora em que ela volta ao
  // foco: é quando a pessoa olha o saldo depois de gerar uma campanha.
  useEffect(() => {
    let vivo = true;
    const ler = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/plano-na-tela", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: PlanoNaTela | null) => { if (vivo && d) setP(d); })
        .catch(() => {});
    };
    const t = setInterval(ler, 60_000);
    window.addEventListener("focus", ler);
    document.addEventListener("visibilitychange", ler);
    return () => { vivo = false; clearInterval(t); window.removeEventListener("focus", ler); document.removeEventListener("visibilitychange", ler); };
  }, []);
  const numero = (n: number) => n.toLocaleString("pt-BR");

  // O ALERTA SE DESCARTA (07/10): sai o laranja e a frase, e a faixa neutra,
  // com o saldo e o botão do plano, fica (é a referência fixa de créditos).
  // Volta com marca nova: outra recarga que zerou, ou o teste no último dia.
  const descartes = useDescartes();
  const chaveDoAlerta = p.alerta ? chaveDoAlertaDoPlano(p.alerta.motivo, p.alerta.marca) : null;
  const alertaDescartado = Boolean(chaveDoAlerta && descartes.ehDescartado(chaveDoAlerta));
  const emAlerta = !p.admin && !alertaDescartado && (p.creditos <= 0 || (p.emTeste && (p.diasDeTesteRestantes ?? 9) <= 2));

  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 mb-4 rounded-xl border text-sm"
      style={{
        // Alerta (saldo zerado, fim do teste) segue laranja: é o único
        // chamado de atenção da faixa. Fora dele, card branco do tema (01/10;
        // antes apontava para --surface, variável que nunca existiu).
        borderColor: emAlerta ? "color-mix(in srgb, var(--marca-laranja) 45%, transparent)" : "var(--border)",
        background: emAlerta ? "color-mix(in srgb, var(--marca-laranja) 7%, transparent)" : "var(--bg-card)",
        boxShadow: emAlerta ? undefined : "var(--shadow)",
      }}
    >
      <span className="flex items-center gap-2 font-medium" style={{ color: "var(--text-primary)" }}>
        {p.emTeste ? (
          <Clock className="w-4 h-4" style={{ color: "var(--marca-laranja)" }} aria-hidden />
        ) : (
          <Sparkles className="w-4 h-4" style={{ color: "var(--marca-laranja)" }} aria-hidden />
        )}
        {p.nome}
      </span>

      {p.emTeste && p.diasDeTesteRestantes !== null && (
        <span style={{ color: "var(--text-muted)" }}>
          {p.diasDeTesteRestantes === 0
            ? "o teste termina hoje"
            : p.diasDeTesteRestantes === 1
              ? "último dia de teste"
              : `${p.diasDeTesteRestantes} dias de teste`}
        </span>
      )}

      <span style={{ color: "var(--text-muted)" }}>
        {p.admin ? (
          "sem cobrança"
        ) : (
          <>
            <strong style={{ color: p.creditos <= 0 ? "var(--marca-laranja-texto)" : "var(--text-primary)", fontWeight: 600 }}>
              {numero(p.creditos)}
            </strong>{" "}
            crédito{p.creditos === 1 ? "" : "s"}
            {p.creditosDeVideo > 0 ? ` · ${numero(p.creditosDeVideo)} de vídeo` : ""}
            {p.equipe ? " da equipe" : ""}
          </>
        )}
      </span>

      {/* MEMBRO DA EQUIPE (01/10): de quem é a conta e, se houver, o teto dele.
          Com o saldo zerado, a frase de quem resolve, pelo nome, no lugar do
          botão de compra que o dono veria (acabamento de 01/10). */}
      {p.equipe && emAlerta && p.creditos <= 0 && (
        <span className="ml-auto text-xs font-medium" style={{ color: "var(--marca-laranja-texto)" }} role="status" id="frase-do-alerta-do-plano">
          {fraseDosCreditosDaEquipe(p.equipe.dono)}
        </span>
      )}
      {p.equipe && !(emAlerta && p.creditos <= 0) && (
        <span className="ml-auto text-xs" style={{ color: "var(--text-muted)" }}>
          Conta de <strong style={{ color: "var(--text-primary)", fontWeight: 600 }}>{p.equipe.dono}</strong>
          {p.equipe.tetoCreditos !== null
            ? ` · você usou ${numero(Math.min(p.equipe.creditosUsados, p.equipe.tetoCreditos))} de ${numero(p.equipe.tetoCreditos)} créditos liberados este mês`
            : ""}
        </span>
      )}

      {p.acao && (
        <Link
          href={p.acao.href}
          // O botão de conversão do app: é ele que fica laranja (01/10), no
          // tom que dá 4,9:1 com o texto branco.
          className="ml-auto px-3.5 py-1.5 rounded-full text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: "var(--marca-laranja-botao)", color: "#fff" }}
        >
          {p.acao.rotulo}
        </Link>
      )}
      {emAlerta && chaveDoAlerta && <BotaoDescartar chave={chaveDoAlerta} rotulo="Descartar o alerta" className="-my-2 -mr-2" />}
    </div>
  );
}
