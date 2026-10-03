"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import {
  AVISO_LGPD, CARGOS, FAIXAS_FATURAMENTO, SETORES, TAMANHOS_TIME,
  emailValido, mascaraWhatsApp, whatsAppValido,
} from "@/lib/calculadora/formulario";
import { useAntiRobo } from "@/components/anti-robo/use-anti-robo";

const campo =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-orange-500";

/** Os campos do portão, na mesma ordem e com os mesmos nomes da calculadora. */
type Campo = "faturamento" | "tamanhoTime" | "setor" | "cargo" | "telefone" | "consentimentoEm";

/**
 * O FORMULÁRIO DA DEMONSTRAÇÃO (refeito em 01/10).
 *
 * Pede EXATAMENTE os campos do portão da calculadora, e uma vez só: quem já
 * os deu na calculadora nem vê este formulário (a página abre direto o
 * calendário). Quem é lead conhecido mas veio de uma captura antiga vê só os
 * campos que faltam, com o e-mail já sabido e travado.
 *
 * Antes pedia nome, empresa e objetivo e prometia "um dos sócios fala com
 * você em até 1 dia útil para marcar o horário": o horário agora é escolhido
 * no calendário logo em seguida.
 */
export function FormularioDemonstracao({
  emailConhecido = null,
  faltam = null,
  onPronto,
}: {
  emailConhecido?: string | null;
  /** Nulo = lead desconhecido, pede tudo. */
  faltam?: Campo[] | null;
  onPronto: (qualificado: boolean) => void;
}) {
  const pede = (c: Campo) => faltam === null || faltam.includes(c);
  // A defesa contra robô (01/10): isca invisível, tempo mínimo e Turnstile.
  const antiRobo = useAntiRobo();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setFormBruto] = useState({
    faturamento: "", tamanhoTime: "", setor: "", cargo: "", email: "", whatsapp: "", consentimento: false,
  });
  // Corrigir um campo apaga o aviso de erro, como na calculadora.
  const setForm = (f: typeof form) => {
    setErro(null);
    setFormBruto(f);
  };

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro(null);
    if ((pede("faturamento") && !form.faturamento) || (pede("tamanhoTime") && !form.tamanhoTime) || (pede("setor") && !form.setor) || (pede("cargo") && !form.cargo)) {
      return setErro("Escolha faturamento, tamanho do time, setor e cargo.");
    }
    if (!emailConhecido && !emailValido(form.email)) return setErro("Confira o e-mail.");
    if (pede("telefone") && !whatsAppValido(form.whatsapp)) return setErro("Confira o WhatsApp: DDD e celular com 9 dígitos.");
    if (pede("consentimentoEm") && !form.consentimento) return setErro("Marque o consentimento para seguir.");
    setEnviando(true);
    try {
      const prova = await antiRobo.prova();
      const r = await fetch("/api/demonstracao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, antiRobo: prova }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui registrar agora.");
      onPronto(Boolean(d.qualificado));
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="relative space-y-4">
      {antiRobo.campos}
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Escolha o horário da sua demonstração</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          {emailConhecido
            ? "Faltam só estes dados. Depois, o calendário com os horários livres do time."
            : "Leva 20 segundos. Depois, o calendário com os horários livres do time."}
        </p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {pede("faturamento") && (
          <Escolha id="demo-faturamento" rotulo="Faturamento mensal da empresa" valor={form.faturamento}
            opcoes={FAIXAS_FATURAMENTO.map(([v, t]) => [v, t])} mudar={(v) => setForm({ ...form, faturamento: v })} />
        )}
        {pede("tamanhoTime") && (
          <Escolha id="demo-time" rotulo="Tamanho do time" valor={form.tamanhoTime}
            opcoes={TAMANHOS_TIME.map(([v, t]) => [v, t])} mudar={(v) => setForm({ ...form, tamanhoTime: v })} />
        )}
        {pede("setor") && (
          <Escolha id="demo-setor" rotulo="Setor" valor={form.setor}
            opcoes={SETORES.map((s) => [s, s])} mudar={(v) => setForm({ ...form, setor: v })} />
        )}
        {pede("cargo") && (
          <Escolha id="demo-cargo" rotulo="Seu cargo" valor={form.cargo}
            opcoes={CARGOS.map((s) => [s, s])} mudar={(v) => setForm({ ...form, cargo: v })} />
        )}
        {!emailConhecido && (
          <label className="block text-sm text-[var(--text-muted)]">
            E-mail de trabalho
            <input
              id="demo-email" type="email" autoComplete="email" inputMode="email" value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="voce@empresa.com.br" className={`${campo} mt-1.5`}
            />
          </label>
        )}
        {pede("telefone") && (
          <label className="block text-sm text-[var(--text-muted)]">
            WhatsApp
            <input
              id="demo-whatsapp" type="tel" autoComplete="tel-national" inputMode="numeric" value={form.whatsapp}
              onChange={(e) => setForm({ ...form, whatsapp: mascaraWhatsApp(e.target.value) })}
              placeholder="(11) 98765-4321" className={`${campo} mt-1.5`}
            />
          </label>
        )}
      </div>

      {pede("consentimentoEm") && (
        <label className="flex items-start gap-3 text-xs text-[var(--text-muted)] leading-relaxed cursor-pointer">
          <input
            id="demo-consentimento" type="checkbox" checked={form.consentimento}
            onChange={(e) => setForm({ ...form, consentimento: e.target.checked })}
            className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0"
          />
          <span>
            Concordo com o uso dos meus dados para agendar a demonstração e receber o contato da Demandou. {AVISO_LGPD} Veja a{" "}
            <a href="/privacy" className="text-orange-400 hover:text-orange-300">política de privacidade</a>.
          </span>
        </label>
      )}

      {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
      <button
        type="submit"
        disabled={enviando}
        className="w-full rounded-full bg-marca-600 py-3.5 text-base font-bold text-white hover:bg-marca-700 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
      >
        {enviando ? "Enviando..." : "Ver os horários livres"}
        {!enviando && <ArrowRight className="w-4 h-4" />}
      </button>
    </form>
  );
}

function Escolha({ id, rotulo, valor, opcoes, mudar }: {
  id: string; rotulo: string; valor: string; opcoes: Array<readonly [string, string]>; mudar: (v: string) => void;
}) {
  return (
    <label className="block text-sm text-[var(--text-muted)]">
      {rotulo}
      <select id={id} value={valor} onChange={(e) => mudar(e.target.value)} className={`${campo} mt-1.5`}>
        <option value="" disabled>Escolha</option>
        {opcoes.map(([v, t]) => (
          <option key={v} value={v}>{t}</option>
        ))}
      </select>
    </label>
  );
}
