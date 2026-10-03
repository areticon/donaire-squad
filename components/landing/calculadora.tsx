"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calculator, Lock, ArrowRight, Users, Building2, UserRound, Check } from "lucide-react";
import { useAntiRobo } from "@/components/anti-robo/use-anti-robo";
import { LogoLinkedIn, LogoX, LogoInstagram, LogoFacebook, LogoYouTube, LogoTikTok } from "@/components/social/logos-redes";
import {
  calcular, emReais, ENTRADAS_PADRAO, FONTES, LIMITES, PREDEFINICOES, REDES, volumeDoMes,
  type Entradas, type RedeId, type Resultado,
} from "@/lib/calculadora/custos";
import {
  AVISO_LGPD, CARGOS, FAIXAS_FATURAMENTO, SETORES, TAMANHOS_TIME,
  emailValido, mascaraWhatsApp, whatsAppValido,
} from "@/lib/calculadora/formulario";

/**
 * A CALCULADORA DA LANDING (01/10), pedido do Bruno: "o usuário simula quanto
 * gastaria se postasse todo dia", contra time próprio, agência e freelancer
 * por peça, e o resultado só aparece depois que ele deixa os dados.
 *
 * OS CONTROLES SÃO LIVRES E O RESULTADO É FECHADO. Mexer nos controles antes
 * do formulário é o que faz a pessoa querer o número: ela já investiu na
 * simulação dela. Formulário antes do primeiro controle é pedir dado sem ter
 * dado nada.
 *
 * NADA DO RESULTADO VAI PARA A TELA ANTES DO CADASTRO, nem borrado: número
 * borrado no HTML é número entregue a quem abre o inspetor.
 *
 * A conta vive em lib/calculadora/custos.ts, módulo puro: a mesma função roda
 * aqui e na rota, e o e-mail do time mostra o número que a pessoa viu.
 */

const LOGOS: Record<RedeId, (p: { className?: string }) => React.ReactElement> = {
  linkedin: LogoLinkedIn,
  instagram: LogoInstagram,
  facebook: LogoFacebook,
  x: LogoX,
  youtube: LogoYouTube,
  tiktok: LogoTikTok,
};

const CONTROLES: Array<{ campo: keyof Omit<Entradas, "redes">; titulo: string; dica: string; unidade: string }> = [
  { campo: "textosSemana", titulo: "Posts escritos", dica: "LinkedIn, X, legenda longa, artigo", unidade: "por semana" },
  { campo: "artesSemana", titulo: "Artes e carrosséis", dica: "Imagem, carrossel, infográfico", unidade: "por semana" },
  { campo: "cortesSemana", titulo: "Vídeos curtos editados", dica: "Reels, Shorts, TikTok, com legenda", unidade: "por semana" },
  { campo: "longosMes", titulo: "Vídeos longos editados", dica: "YouTube, aula, podcast", unidade: "por mês" },
];

const ICONE = { time: Users, agencia: Building2, freela: UserRound } as const;

/** Guardado só neste navegador, para quem volta não preencher de novo. */
const CHAVE = "dmd_calculadora_liberada";

const campo =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:outline-none focus:border-orange-500";

export function Calculadora() {
  const [entradas, setEntradas] = useState<Entradas>(ENTRADAS_PADRAO);
  const [liberada, setLiberada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // A defesa contra robô (01/10): isca invisível, tempo mínimo e Turnstile.
  const antiRobo = useAntiRobo();
  const [erro, setErro] = useState<string | null>(null);
  const [form, setFormBruto] = useState({
    faturamento: "", tamanhoTime: "", setor: "", cargo: "", email: "", whatsapp: "", consentimento: false,
  });
  // Corrigir um campo apaga o aviso de erro: aviso velho na tela depois da
  // correção faz a pessoa achar que ainda está errado (visto na prova de 01/10).
  const setForm = (f: typeof form) => {
    setErro(null);
    setFormBruto(f);
  };

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAVE) === "1") setLiberada(true);
    } catch {
      /* navegador sem armazenamento: a pessoa preenche de novo, e tudo bem */
    }
  }, []);

  const resultado: Resultado = useMemo(() => calcular(entradas), [entradas]);
  const volume = useMemo(() => volumeDoMes(entradas), [entradas]);
  const predefinicao = PREDEFINICOES.find(
    (p) => JSON.stringify(p.entradas) === JSON.stringify({ ...entradas, redes: [...entradas.redes] })
  )?.id;

  function mudar(c: keyof Omit<Entradas, "redes">, v: number) {
    setEntradas((e) => ({ ...e, [c]: v }));
  }

  function alternarRede(id: RedeId) {
    setEntradas((e) => {
      const tem = e.redes.includes(id);
      // A ordem segue a lista de REDES, para a predefinição ser reconhecida.
      const redes = REDES.map((r) => r.id).filter((r) => (r === id ? !tem : e.redes.includes(r)));
      return { ...e, redes };
    });
  }

  async function liberar(ev: React.FormEvent) {
    ev.preventDefault();
    setErro(null);
    if (!form.faturamento || !form.tamanhoTime || !form.setor || !form.cargo) return setErro("Escolha faturamento, tamanho do time, setor e cargo.");
    if (!emailValido(form.email)) return setErro("Confira o e-mail.");
    if (!whatsAppValido(form.whatsapp)) return setErro("Confira o WhatsApp: DDD e celular com 9 dígitos.");
    if (!form.consentimento) return setErro("Marque o consentimento para ver o resultado.");
    setEnviando(true);
    try {
      const prova = await antiRobo.prova();
      const r = await fetch("/api/calculadora", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, entradas, antiRobo: prova }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui registrar agora.");
      try {
        window.localStorage.setItem(CHAVE, "1");
      } catch {
        /* sem armazenamento, só não lembra na próxima visita */
      }
      setLiberada(true);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section id="calculadora" className="relative py-24 lg:py-32 scroll-mt-16">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-center mb-12"
        >
          <div className="selo mb-6">
            <Calculator className="w-3.5 h-3.5" />
            <span>Calculadora</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Quanto custa <span className="text-orange-500">postar todo dia</span> com gente?
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Escolha o volume e as redes. A conta compara time próprio, agência e freelancer por peça com o
            plano da Demandou que cobre o mesmo volume.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
          {/* ── Controles ── */}
          <div className="lg:col-span-2 bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-7">
            <p className="text-sm font-semibold text-[var(--text-primary)] mb-3">Comece por um ritmo</p>
            <div className="flex flex-wrap gap-2 mb-7">
              {PREDEFINICOES.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEntradas(p.entradas)}
                  aria-pressed={predefinicao === p.id}
                  className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                    predefinicao === p.id
                      ? "border-orange-500 bg-orange-500/15 text-orange-300"
                      : "border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {p.nome}
                </button>
              ))}
            </div>

            <div className="space-y-6">
              {CONTROLES.map((c) => {
                const valor = entradas[c.campo];
                const max = LIMITES[c.campo];
                return (
                  <div key={c.campo}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <label htmlFor={`calc-${c.campo}`} className="font-semibold text-[var(--text-primary)]">
                        {c.titulo}
                      </label>
                      <span className="text-sm text-[var(--text-muted)] whitespace-nowrap">
                        <strong className="text-2xl font-black text-orange-400 tabular-nums mr-1">{valor}</strong>
                        {c.unidade}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mb-2">{c.dica}</p>
                    <input
                      id={`calc-${c.campo}`}
                      type="range"
                      min={0}
                      max={max}
                      step={1}
                      value={valor}
                      onChange={(e) => mudar(c.campo, Number(e.target.value))}
                      className="w-full accent-orange-500 h-2 cursor-pointer"
                    />
                  </div>
                );
              })}

              <div>
                <p className="font-semibold text-[var(--text-primary)] mb-1">Em quais redes</p>
                <p className="text-xs text-[var(--text-muted)] mb-3">Cada rede pede legenda, formato e horário próprios.</p>
                <div className="flex flex-wrap gap-2">
                  {REDES.map((r) => {
                    const Logo = LOGOS[r.id];
                    const ativa = entradas.redes.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => alternarRede(r.id)}
                        aria-pressed={ativa}
                        aria-label={r.nome}
                        title={r.nome}
                        className={`relative rounded-xl p-1 border-2 transition-all ${
                          ativa ? "border-orange-500" : "border-transparent opacity-40 grayscale hover:opacity-70"
                        }`}
                      >
                        <Logo />
                        {ativa && (
                          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-7 pt-5 border-t border-[var(--border)] text-sm text-[var(--text-muted)]">
              Isso dá <strong className="text-[var(--text-primary)]">{volume.pecas} peças</strong> e{" "}
              <strong className="text-[var(--text-primary)]">{volume.publicacoes} publicações</strong> por mês.
            </div>
          </div>

          {/* ── Resultado ── */}
          <div className="lg:col-span-3">
            {liberada ? (
              <ResultadoAberto r={resultado} />
            ) : (
              <form
                onSubmit={liberar}
                noValidate
                className="relative bg-[var(--bg-surface)] border border-orange-500/40 rounded-2xl p-5 sm:p-7"
              >
                {antiRobo.campos}
                <div className="flex items-start gap-3 mb-5">
                  <span className="w-10 h-10 rounded-xl bg-orange-500/15 flex items-center justify-center shrink-0">
                    <Lock className="w-5 h-5 text-orange-400" />
                  </span>
                  <div>
                    <p className="text-xl font-black text-[var(--text-primary)]">Veja a sua conta</p>
                    <p className="text-sm text-[var(--text-muted)]">
                      Quanto {volume.pecas} peças por mês em {Math.max(1, entradas.redes.length)}{" "}
                      {entradas.redes.length === 1 ? "rede custam" : "redes custam"} com time próprio, agência e
                      freelancer, e quanto a Demandou economiza. Leva 20 segundos.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Escolha id="calc-faturamento" rotulo="Faturamento mensal da empresa" valor={form.faturamento}
                    opcoes={FAIXAS_FATURAMENTO.map(([v, t]) => [v, t])} mudar={(v) => setForm({ ...form, faturamento: v })} />
                  <Escolha id="calc-time" rotulo="Tamanho do time" valor={form.tamanhoTime}
                    opcoes={TAMANHOS_TIME.map(([v, t]) => [v, t])} mudar={(v) => setForm({ ...form, tamanhoTime: v })} />
                  <Escolha id="calc-setor" rotulo="Setor" valor={form.setor}
                    opcoes={SETORES.map((s) => [s, s])} mudar={(v) => setForm({ ...form, setor: v })} />
                  <Escolha id="calc-cargo" rotulo="Seu cargo" valor={form.cargo}
                    opcoes={CARGOS.map((s) => [s, s])} mudar={(v) => setForm({ ...form, cargo: v })} />
                  <label className="block text-sm text-[var(--text-muted)]">
                    E-mail de trabalho
                    <input
                      id="calc-email" type="email" autoComplete="email" inputMode="email" value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="voce@empresa.com.br" className={`${campo} mt-1.5`}
                    />
                  </label>
                  <label className="block text-sm text-[var(--text-muted)]">
                    WhatsApp
                    <input
                      id="calc-whatsapp" type="tel" autoComplete="tel-national" inputMode="numeric" value={form.whatsapp}
                      onChange={(e) => setForm({ ...form, whatsapp: mascaraWhatsApp(e.target.value) })}
                      placeholder="(11) 98765-4321" className={`${campo} mt-1.5`}
                    />
                  </label>
                </div>

                <label className="mt-5 flex items-start gap-3 text-xs text-[var(--text-muted)] leading-relaxed cursor-pointer">
                  <input
                    id="calc-consentimento" type="checkbox" checked={form.consentimento}
                    onChange={(e) => setForm({ ...form, consentimento: e.target.checked })}
                    className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0"
                  />
                  <span>
                    Concordo com o uso dos meus dados para receber o resultado e o contato da Demandou. {AVISO_LGPD} Veja a{" "}
                    <a href="/privacy" className="text-orange-400 hover:text-orange-300">política de privacidade</a>.
                  </span>
                </label>

                {erro && <p role="alert" className="mt-4 text-sm text-red-400">{erro}</p>}

                <button
                  type="submit"
                  disabled={enviando}
                  className="mt-5 w-full rounded-full bg-marca-600 py-3.5 text-base font-bold text-white hover:bg-marca-700 transition-colors disabled:opacity-60 inline-flex items-center justify-center gap-2"
                >
                  {enviando ? "Calculando..." : "Ver a minha conta"}
                  {!enviando && <ArrowRight className="w-4 h-4" />}
                </button>
              </form>
            )}
          </div>
        </div>

        <details className="mt-8 max-w-4xl mx-auto text-sm text-[var(--text-muted)]">
          <summary className="cursor-pointer text-[var(--text-primary)] font-semibold">De onde vêm os números</summary>
          <div className="mt-3 space-y-3 leading-relaxed">
            <p>
              Salários de nível pleno com carteira assinada e 80% de encargos e benefícios (férias, 13º, FGTS,
              INSS patronal, vale-refeição e transporte). Sem ferramentas, equipamento nem gestor. Quanto cada
              pessoa entrega por mês (2 textos, 3 artes ou 3 vídeos curtos por dia útil; um vídeo longo a cada
              2,5 dias) é premissa nossa, generosa com o time humano. O que a agência cobra além do pacote e por
              rede a mais também é estimativa nossa, porque nenhuma fonte publica.
            </p>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
              {FONTES.map((f) => (
                <li key={f.item}>
                  {f.item}:{" "}
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-orange-300">
                    {f.fonte}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </section>
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

function ResultadoAberto({ r }: { r: Resultado }) {
  const maior = Math.max(...r.cenarios.map((c) => c.mensal), r.demandou.mensal, 1);
  const anual = r.demandou.mensal * 12;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-4">
      {r.cenarios.map((c) => {
        const Icone = ICONE[c.id];
        const eco = r.economia.find((e) => e.id === c.id)!;
        return (
          <div key={c.id} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="flex items-center gap-2 font-bold text-[var(--text-primary)]">
                <Icone className="w-4 h-4 text-orange-400" /> {c.nome}
              </p>
              <p className="text-2xl font-black text-[var(--text-primary)] tabular-nums">
                {emReais(c.mensal)}<span className="text-sm font-normal text-[var(--text-muted)]"> por mês</span>
              </p>
            </div>
            <div className="mt-3 h-2.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-[var(--text-muted)]"
                initial={{ width: 0 }}
                animate={{ width: `${(c.mensal / maior) * 100}%` }}
                transition={{ duration: 0.6 }}
              />
            </div>
            <p className="mt-3 text-sm">
              <span className="text-green-400 font-semibold">
                Com a Demandou, {emReais(eco.reais)} a menos por mês ({eco.porcento}%)
              </span>
            </p>
            <details className="mt-2 text-sm text-[var(--text-muted)]">
              <summary className="cursor-pointer">Ver a conta</summary>
              <ul className="mt-2 space-y-1">
                {c.linhas.map((l) => (
                  <li key={l.rotulo} className="flex justify-between gap-4">
                    <span>{l.rotulo}</span>
                    <span className="tabular-nums text-[var(--text-primary)]">{emReais(l.valor)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs">{c.nota}</p>
            </details>
          </div>
        );
      })}

      <div className="bg-[var(--bg-surface)] border-2 border-orange-500 rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-bold text-[var(--text-primary)]">
            Demandou, plano {r.demandou.nome}
            {r.demandou.sobMedida && <span className="ml-2 text-xs font-semibold text-orange-300">acima disso, sob medida</span>}
          </p>
          <p className="text-3xl font-black text-orange-400 tabular-nums">
            {r.demandou.sobMedida ? "a partir de " : ""}{emReais(r.demandou.mensal)}
            <span className="text-sm font-normal text-[var(--text-muted)]"> por mês</span>
          </p>
        </div>
        <div className="mt-3 h-2.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-[linear-gradient(90deg,#ffc59a,#ef6122)]"
            initial={{ width: 0 }}
            animate={{ width: `${(r.demandou.mensal / maior) * 100}%` }}
            transition={{ duration: 0.6 }}
          />
        </div>
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          O mesmo volume, nas mesmas redes, com pesquisa, revisão e publicação. Contrato anual de {emReais(anual)}.
          Contra o time próprio, são <strong className="text-[var(--text-primary)]">{emReais(r.economia[0].reais * 12)}</strong> a menos no ano.
        </p>
        <Link
          href="/demonstracao?cta=calculadora"
          className="mt-5 inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-marca-600 px-6 py-3 text-sm font-bold text-white hover:bg-marca-700 transition-colors"
        >
          Agendar reunião <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </motion.div>
  );
}
