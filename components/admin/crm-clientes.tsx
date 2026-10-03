"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { NOME_DO_SEGMENTO, type Segmento } from "@/lib/admin/segmentos";
// Só TIPOS de crm.ts: o import de tipo some na compilação, e o módulo, que lê
// o banco, nunca chega ao navegador.
import type { ClienteDoCrm, FichaDoCliente } from "@/lib/admin/crm";

/**
 * O CRM DO PAINEL (pedido do Bruno em 23/09).
 *
 * Duas metades: a LISTA, que responde "quem está em que pé" por segmento e por
 * plano, e a FICHA, que abre de lado e é onde se age sobre uma conta. As
 * travas das ações moram no servidor (lib/admin/acoes.ts); a tela só mostra
 * antes do clique o que cada uma vai fazer e por que algumas estão fechadas.
 */

const ORDEM: Segmento[] = ["lead", "sem_plano", "teste", "pagante", "cancelando", "inadimplente", "ex_cliente", "cortesia", "interno", "robo"];

const COR: Record<Segmento, string> = {
  lead: "#a78bfa",
  sem_plano: "#9599a6",
  teste: "#fbbf24",
  pagante: "#4ade80",
  cancelando: "#fb923c",
  inadimplente: "#f87171",
  ex_cliente: "#9599a6",
  cortesia: "#60a5fa",
  interno: "#9599a6",
  robo: "#6b7280",
};

const reais = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
const data = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "nunca";

const caixa = { borderColor: "var(--border)", background: "var(--surface)" } as const;
const fraco = { color: "var(--text-muted)" } as const;
const forte = { color: "var(--text-primary)" } as const;
const campo =
  "w-full rounded-lg border px-3 py-2 text-sm bg-transparent focus:outline-none focus:border-orange-500";
const botaoPrimario =
  "rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50";
const botaoSecundario = "rounded-lg border px-3 py-2 text-sm hover:border-orange-500 disabled:opacity-50";

function Pilula({ s }: { s: Segmento }) {
  return (
    <span
      className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap"
      style={{ color: COR[s], background: `${COR[s]}1f` }}
    >
      {NOME_DO_SEGMENTO[s]}
    </span>
  );
}

function linhaDaAssinatura(c: ClienteDoCrm): string {
  const a = c.assinatura;
  if (!a) return c.plano !== "free" ? `${c.planoNome}, sem Stripe` : "";
  const valor = `${reais(a.valorMensal)}/mês${a.ciclo === "anual" ? " (anual)" : ""}`;
  if (a.status === "trialing") return `${a.planoNome} · ${valor} · teste até ${data(a.fimDoTeste)}`;
  if (a.status === "canceled") return `${a.planoNome} · encerrada`;
  if (a.cancelaNoFim) return `${a.planoNome} · ${valor} · acaba ${data(a.fimDoPeriodo)}`;
  return `${a.planoNome} · ${valor} · renova ${data(a.fimDoPeriodo)}`;
}

export function CrmClientes({ clientes, leuStripe }: { clientes: ClienteDoCrm[]; leuStripe: boolean }) {
  const [segmento, setSegmento] = useState<Segmento | "todos">("todos");
  const [plano, setPlano] = useState<string>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [convidando, setConvidando] = useState(false);

  const contagem = useMemo(() => {
    const m = new Map<Segmento, number>();
    for (const c of clientes) m.set(c.segmento, (m.get(c.segmento) ?? 0) + 1);
    return m;
  }, [clientes]);

  /** O que entra por mês das assinaturas pagas, e quanto está em teste. */
  const receita = useMemo(() => {
    let mrr = 0;
    let emTeste = 0;
    const porPlano = new Map<string, { pagantes: number; teste: number }>();
    for (const c of clientes) {
      const a = c.assinatura;
      if (!a || !["pagante", "teste", "cancelando", "inadimplente"].includes(c.segmento)) continue;
      const nome = a.planoNome;
      const atual = porPlano.get(nome) ?? { pagantes: 0, teste: 0 };
      if (a.status === "trialing") {
        emTeste += a.valorMensal;
        atual.teste++;
      } else if (a.status === "active") {
        mrr += a.valorMensal;
        atual.pagantes++;
      }
      porPlano.set(nome, atual);
    }
    return { mrr, emTeste, porPlano: [...porPlano.entries()] };
  }, [clientes]);

  const visiveis = clientes.filter((c) => {
    if (segmento !== "todos" && c.segmento !== segmento) return false;
    if (plano !== "todos" && (c.assinatura?.planoNome ?? c.planoNome) !== plano) return false;
    const q = busca.trim().toLowerCase();
    return !q || c.email.toLowerCase().includes(q) || (c.nome ?? "").toLowerCase().includes(q);
  });

  const planosNaLista = [...new Set(clientes.map((c) => c.assinatura?.planoNome ?? c.planoNome))].sort();

  return (
    <div>
      {!leuStripe && (
        <p className="mb-4 rounded-xl border p-3 text-sm" style={{ borderColor: "#f87171", color: "#f87171" }}>
          Não consegui ler o Stripe agora: os segmentos de teste, pagante e cancelando podem estar errados.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <div className="rounded-2xl border p-4" style={caixa}>
          <p className="text-xs mb-1" style={fraco}>Recorrente por mês</p>
          <p className="text-xl font-semibold" style={forte}>{reais(receita.mrr)}</p>
          <p className="text-xs mt-1" style={fraco}>{contagem.get("pagante") ?? 0} pagantes ativos</p>
        </div>
        <div className="rounded-2xl border p-4" style={caixa}>
          <p className="text-xs mb-1" style={fraco}>Em teste agora</p>
          <p className="text-xl font-semibold" style={forte}>{contagem.get("teste") ?? 0}</p>
          <p className="text-xs mt-1" style={fraco}>{reais(receita.emTeste)}/mês se todos ficarem</p>
        </div>
        <div className="rounded-2xl border p-4" style={caixa}>
          <p className="text-xs mb-1" style={fraco}>Saindo ou com problema</p>
          <p className="text-xl font-semibold" style={forte}>
            {(contagem.get("cancelando") ?? 0) + (contagem.get("inadimplente") ?? 0)}
          </p>
          <p className="text-xs mt-1" style={fraco}>
            {contagem.get("cancelando") ?? 0} cancelando, {contagem.get("inadimplente") ?? 0} com cobrança falhando
          </p>
        </div>
        <div className="rounded-2xl border p-4" style={caixa}>
          <p className="text-xs mb-1" style={fraco}>Por plano</p>
          {receita.porPlano.length === 0 && <p className="text-sm" style={fraco}>Nenhuma assinatura viva.</p>}
          {receita.porPlano.map(([nome, n]) => (
            <p key={nome} className="text-sm" style={forte}>
              {nome}: {n.pagantes} pagando{n.teste ? `, ${n.teste} em teste` : ""}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => setSegmento("todos")}
          className="rounded-full border px-3 py-1 text-xs"
          style={{ ...caixa, color: segmento === "todos" ? "var(--acento)" : "var(--text-muted)", borderColor: segmento === "todos" ? "var(--acento)" : "var(--border)" }}
        >
          Todos {clientes.length}
        </button>
        {ORDEM.filter((s) => contagem.get(s)).map((s) => (
          <button
            key={s}
            onClick={() => setSegmento(s)}
            className="rounded-full border px-3 py-1 text-xs"
            style={{ ...caixa, color: segmento === s ? COR[s] : "var(--text-muted)", borderColor: segmento === s ? COR[s] : "var(--border)" }}
          >
            {NOME_DO_SEGMENTO[s]} {contagem.get(s)}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <input
          id="crm-busca"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className={`${campo} max-w-xs`}
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
        <select
          id="crm-plano"
          value={plano}
          onChange={(e) => setPlano(e.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{ ...caixa, color: "var(--text-primary)" }}
        >
          <option value="todos">Todos os planos</option>
          {planosNaLista.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <button onClick={() => setConvidando(true)} className={`${botaoPrimario} ml-auto`}>
          Convidar pessoa
        </button>
      </div>

      {convidando && <Convite onFechar={() => setConvidando(false)} />}

      <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--border)" }}>
        <table className="w-full min-w-[48rem] text-sm">
          <thead>
            <tr style={{ background: "var(--surface)" }}>
              {["Pessoa", "Situação", "Plano e cobrança", "Créditos", "Uso", "Desde"].map((h) => (
                <th key={h} className="text-left font-medium px-3 py-2 text-xs whitespace-nowrap" style={fraco}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-xs" style={fraco}>Ninguém neste filtro.</td></tr>
            )}
            {visiveis.map((c) => (
              <tr
                key={`${c.id ?? "lead"}-${c.email}`}
                onClick={() => c.id && setAberto(c.id)}
                className={`border-t ${c.id ? "cursor-pointer hover:bg-[var(--realce-1)]" : ""}`}
                style={{ borderColor: "var(--border)" }}
              >
                <td className="px-3 py-2">
                  <span style={forte}>{c.nome ?? c.email}</span>
                  <br />
                  <span className="text-xs" style={fraco}>{c.nome ? c.email : ""}{c.origem ? `${c.nome ? " · " : ""}${c.origem}` : ""}</span>
                </td>
                <td className="px-3 py-2"><Pilula s={c.segmento} /></td>
                <td className="px-3 py-2 text-xs" style={forte}>
                  {c.segmento === "lead" ? <span style={fraco}>{c.pista ?? "sem conta"}</span> : linhaDaAssinatura(c) || <span style={fraco}>nunca assinou</span>}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap" style={fraco}>{c.id ? c.creditos.toLocaleString("pt-BR") : ""}</td>
                <td className="px-3 py-2 text-xs whitespace-nowrap" style={fraco}>
                  {c.id ? `${c.publicados} publicado(s) · última campanha ${data(c.ultimaCampanha)}` : ""}
                </td>
                <td className="px-3 py-2 text-xs whitespace-nowrap" style={fraco}>{data(c.cadastroEm)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {aberto && <Ficha id={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}

/** Chamada às rotas do admin, devolvendo a mensagem de recusa como texto. */
async function chamar(url: string, corpo: unknown, metodo = "POST") {
  const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Falhou.");
  return d;
}

function Convite({ onFechar }: { onFechar: () => void }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<"user" | "admin">("user");
  const [estado, setEstado] = useState<{ ok?: string; erro?: string; indo?: boolean }>({});

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setEstado({ indo: true });
    try {
      await chamar("/api/admin/usuarios", { email, nome, papel });
      setEstado({ ok: `Conta criada. ${email} recebe agora o link para escolher a senha.` });
      router.refresh();
    } catch (err) {
      setEstado({ erro: (err as Error).message });
    }
  }

  return (
    <form onSubmit={enviar} className="mb-4 rounded-2xl border p-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto_auto_auto] items-end" style={caixa}>
      <label className="text-xs" style={fraco}>
        E-mail
        <input id="convite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${campo} mt-1`} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
      </label>
      <label className="text-xs" style={fraco}>
        Nome
        <input id="convite-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={`${campo} mt-1`} style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
      </label>
      <label className="text-xs" style={fraco}>
        Acesso
        <select id="convite-papel" value={papel} onChange={(e) => setPapel(e.target.value as "user" | "admin")} className="mt-1 block rounded-lg border px-3 py-2 text-sm" style={{ ...caixa, color: "var(--text-primary)" }}>
          <option value="user">Cliente</option>
          <option value="admin">Admin (interno)</option>
        </select>
      </label>
      <button type="submit" disabled={estado.indo} className={botaoPrimario}>{estado.indo ? "Criando..." : "Criar e mandar convite"}</button>
      <button type="button" onClick={onFechar} className={botaoSecundario} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Fechar</button>
      {(estado.ok || estado.erro) && (
        <p className="md:col-span-5 text-sm" style={{ color: estado.ok ? "#4ade80" : "#f87171" }}>{estado.ok ?? estado.erro}</p>
      )}
      <p className="md:col-span-5 text-xs" style={fraco}>
        A conta nasce sem plano e com o e-mail confirmado. A pessoa escolhe a senha pelo link, que vale por 1 hora e pode ser reenviado pela ficha.
      </p>
    </form>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-4 mt-4" style={{ borderColor: "var(--border)" }}>
      <h3 className="text-sm font-semibold mb-2" style={forte}>{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * A FICHA DE UMA CONTA, com as ações.
 *
 * Toda ação que mexe em dinheiro ou apaga dado tem confirmação DENTRO da tela
 * (o navegador do artefato e alguns navegadores não mostram `confirm()`), e o
 * botão diz o valor ou o efeito antes do clique.
 */
function Ficha({ id, onFechar }: { id: string; onFechar: () => void }) {
  const router = useRouter();
  const [ficha, setFicha] = useState<FichaDoCliente | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ ok?: string; erro?: string }>({});
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState<string | null>(null);

  const [creditos, setCreditos] = useState("");
  const [motivoCreditos, setMotivoCreditos] = useState("");
  const [cortesia, setCortesia] = useState("pro");
  const [extras, setExtras] = useState("");
  const [motivoExtras, setMotivoExtras] = useState("");
  const [motivoCortesia, setMotivoCortesia] = useState("");
  const [motivoReembolso, setMotivoReembolso] = useState("");
  const [excecao, setExcecao] = useState(false);
  const [confirmaEmail, setConfirmaEmail] = useState("");

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/usuarios/${id}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Não consegui abrir a ficha.");
        if (vivo) setFicha(d);
      })
      .catch((e) => vivo && setErroGeral((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [id]);

  async function agir(corpo: Record<string, unknown>, sucesso: string) {
    setOcupado(true);
    setAviso({});
    try {
      const d = await chamar(`/api/admin/usuarios/${id}`, corpo);
      setConfirmar(null);
      if (d.excluida) {
        router.refresh();
        onFechar();
        return;
      }
      setFicha(d.ficha);
      setAviso({ ok: sucesso });
      router.refresh();
    } catch (err) {
      setAviso({ erro: (err as Error).message });
    } finally {
      setOcupado(false);
    }
  }

  const entrada = { borderColor: "var(--border)", color: "var(--text-primary)" };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button aria-label="Fechar ficha" className="absolute inset-0 bg-black/50" onClick={onFechar} />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto p-5 border-l" style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={forte}>{ficha?.nome ?? ficha?.email ?? "Abrindo..."}</h2>
            {ficha && <p className="text-xs break-all" style={fraco}>{ficha.email} · desde {data(ficha.cadastroEm)}{ficha.emailVerificado ? "" : " · e-mail não confirmado"}</p>}
          </div>
          <button onClick={onFechar} className={botaoSecundario} style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>Fechar</button>
        </div>

        {erroGeral && <p className="mt-4 text-sm" style={{ color: "#f87171" }}>{erroGeral}</p>}
        {aviso.ok && <p className="mt-4 text-sm" style={{ color: "#4ade80" }}>{aviso.ok}</p>}
        {aviso.erro && <p className="mt-4 text-sm" style={{ color: "#f87171" }}>{aviso.erro}</p>}

        {ficha && (
          <>
            <Secao titulo="Resumo">
              <p className="text-sm" style={forte}>
                {ficha.creditos.toLocaleString("pt-BR")} créditos · {ficha.creditosDeVideo} de vídeo · {ficha.publicados} peça(s) publicada(s) · {ficha.projetos.length} marca(s)
              </p>
              <p className="text-xs mt-1" style={fraco}>
                Plano liberado no produto: {ficha.plano === "free" ? "nenhum" : ficha.plano} · acesso {ficha.papel === "admin" ? "interno (admin)" : "de cliente"}
              </p>
            </Secao>

            <Secao titulo="Assinatura no Stripe">
              {!ficha.assinatura && <p className="text-sm" style={fraco}>Nunca assinou.</p>}
              {ficha.assinatura && (
                <>
                  <p className="text-sm" style={forte}>
                    {ficha.assinatura.planoNome} {ficha.assinatura.ciclo} · {reais(ficha.assinatura.valor)} por {ficha.assinatura.ciclo === "anual" ? "ano" : "mês"}
                  </p>
                  <p className="text-xs mt-1" style={fraco}>
                    Situação: {ficha.assinatura.status}
                    {ficha.assinatura.status === "trialing" ? `, teste até ${data(ficha.assinatura.fimDoTeste)}` : ""}
                    {ficha.assinatura.fimDoPeriodo && ficha.assinatura.status !== "canceled"
                      ? `, ${ficha.assinatura.cancelaNoFim ? "acaba" : "renova"} em ${data(ficha.assinatura.fimDoPeriodo)}`
                      : ""}
                  </p>
                  {ficha.stripeCustomerId && (
                    <a href={`https://dashboard.stripe.com/customers/${ficha.stripeCustomerId}`} target="_blank" rel="noreferrer" className="text-xs text-orange-400 hover:text-orange-300">
                      Abrir no Stripe
                    </a>
                  )}
                  {ficha.temAssinaturaViva && (
                    <div className="mt-3">
                      <button
                        disabled={ocupado}
                        onClick={() =>
                          agir(
                            { acao: "cancelar_no_fim", desfazer: ficha.assinatura!.cancelaNoFim },
                            ficha.assinatura!.cancelaNoFim ? "Renovação reativada." : "Cancelada no fim do período. O acesso continua até lá."
                          )
                        }
                        className={botaoSecundario}
                        style={entrada}
                      >
                        {ficha.assinatura.cancelaNoFim ? "Reativar a renovação" : `Cancelar no fim do período (${data(ficha.assinatura.fimDoPeriodo)})`}
                      </button>
                      <p className="text-xs mt-1" style={fraco}>
                        Termos 5.4: usa até o fim do que pagou e não renova. Em teste, nada é cobrado.
                      </p>
                    </div>
                  )}
                </>
              )}
            </Secao>

            {ficha.assinatura && ficha.reembolso.regra !== "nada_pago" && (
              <Secao titulo="Reembolso">
                <p className="text-sm" style={forte}>
                  Pago nesta contratação: {reais(ficha.reembolso.pago)}, primeira cobrança em {data(ficha.reembolso.primeiraCobranca)}.
                </p>
                <p className="text-xs mt-1" style={{ color: ficha.reembolso.regra === "fora_da_regra" ? "#fb923c" : "#4ade80" }}>
                  {ficha.reembolso.explicacao}
                </p>
                <textarea
                  id="motivo-reembolso"
                  value={motivoReembolso}
                  onChange={(e) => setMotivoReembolso(e.target.value)}
                  placeholder="Motivo (fica no registro e no Stripe)"
                  rows={2}
                  className={`${campo} mt-2`}
                  style={entrada}
                />
                {ficha.reembolso.regra === "fora_da_regra" && (
                  <label className="flex items-center gap-2 text-xs mt-2" style={fraco}>
                    <input id="reembolso-excecao" type="checkbox" checked={excecao} onChange={(e) => setExcecao(e.target.checked)} />
                    Reembolsar como exceção (termos 5.7)
                  </label>
                )}
                {confirmar === "reembolso" ? (
                  <div className="flex gap-2 mt-2">
                    <button
                      disabled={ocupado}
                      onClick={() => agir({ acao: "reembolsar", motivo: motivoReembolso, excecao }, `Reembolso de ${reais(ficha.reembolso.pago)} feito e assinatura encerrada.`)}
                      className={botaoPrimario}
                      style={{ background: "#dc2626" }}
                    >
                      {ocupado ? "Devolvendo..." : `Confirmar: devolver ${reais(ficha.reembolso.pago)} e encerrar agora`}
                    </button>
                    <button onClick={() => setConfirmar(null)} className={botaoSecundario} style={entrada}>Voltar</button>
                  </div>
                ) : (
                  <button
                    disabled={ocupado || !motivoReembolso.trim() || (ficha.reembolso.regra === "fora_da_regra" && !excecao)}
                    onClick={() => setConfirmar("reembolso")}
                    className={`${botaoSecundario} mt-2`}
                    style={entrada}
                  >
                    Reembolsar tudo e encerrar a assinatura
                  </button>
                )}
              </Secao>
            )}

            <Secao titulo="Créditos">
              <div className="flex gap-2">
                <input
                  id="ajuste-creditos"
                  inputMode="numeric"
                  value={creditos}
                  onChange={(e) => setCreditos(e.target.value)}
                  placeholder="+500 ou -200"
                  className={`${campo} max-w-[130px]`}
                  style={entrada}
                />
                <input
                  id="motivo-creditos"
                  value={motivoCreditos}
                  onChange={(e) => setMotivoCreditos(e.target.value)}
                  placeholder="Motivo (aparece no extrato do cliente)"
                  className={campo}
                  style={entrada}
                />
              </div>
              <button
                disabled={ocupado || !Number(creditos) || !motivoCreditos.trim()}
                onClick={() => agir({ acao: "creditos", quantidade: Number(creditos), motivo: motivoCreditos }, "Créditos ajustados.").then(() => { setCreditos(""); setMotivoCreditos(""); })}
                className={`${botaoSecundario} mt-2`}
                style={entrada}
              >
                {Number(creditos) > 0 ? `Dar ${Number(creditos)} créditos` : Number(creditos) < 0 ? `Tirar ${-Number(creditos)} créditos` : "Ajustar créditos"}
              </button>
            </Secao>

            {/* ACESSOS DE EQUIPE (01/10): ativação manual do acesso extra enquanto
                o preço não existe no Stripe. Ver lib/admin/acoes.ts. */}
            <Secao titulo="Acessos da equipe">
              <p className="text-sm" style={forte}>
                {ficha.membroDe
                  ? `Membro da equipe de ${ficha.membroDe}.`
                  : `${ficha.membrosAtivos} membro(s) ativo(s) · ${ficha.acessosExtras} acesso(s) extra(s) ativado(s)`}
              </p>
              {!ficha.membroDe && (
                <>
                  <div className="flex gap-2 mt-2">
                    <input
                      id="acessos-extras"
                      inputMode="numeric"
                      value={extras}
                      onChange={(e) => setExtras(e.target.value)}
                      placeholder={String(ficha.acessosExtras)}
                      className={`${campo} max-w-[110px]`}
                      style={entrada}
                    />
                    <input
                      id="motivo-extras"
                      value={motivoExtras}
                      onChange={(e) => setMotivoExtras(e.target.value)}
                      placeholder="Motivo (pedido, nota da venda)"
                      className={campo}
                      style={entrada}
                    />
                  </div>
                  <button
                    disabled={ocupado || extras.trim() === "" || !motivoExtras.trim()}
                    onClick={() =>
                      agir({ acao: "acessos_extras", quantidade: Number(extras), motivo: motivoExtras }, "Acessos extras atualizados.").then(() => {
                        setExtras("");
                        setMotivoExtras("");
                      })
                    }
                    className={`${botaoSecundario} mt-2`}
                    style={entrada}
                  >
                    {extras.trim() === "" ? "Definir acessos extras" : `Definir ${Number(extras)} acesso(s) extra(s)`}
                  </button>
                  <p className="text-xs mt-1" style={fraco}>
                    R$ 197 por mês cada, cobrado por fora até o preço existir no Stripe. Cada acesso a mais soma 2.000 créditos na hora e em toda renovação, e 1 gravação por mês.
                  </p>
                </>
              )}
            </Secao>

            <Secao titulo="Plano de cortesia">
              {ficha.temAssinaturaViva ? (
                <p className="text-xs" style={fraco}>
                  Fechado: esta conta paga pelo Stripe, e o plano dela é o que ela assina. Trocar plano pago é pela própria pessoa, ou no painel do Stripe.
                </p>
              ) : (
                <>
                  <div className="flex gap-2">
                    <select id="cortesia-plano" value={cortesia} onChange={(e) => setCortesia(e.target.value)} className="rounded-lg border px-3 py-2 text-sm" style={{ ...caixa, color: "var(--text-primary)" }}>
                      <option value="pro">Starter</option>
                      <option value="business">Pro</option>
                      <option value="studio">Enterprise</option>
                      <option value="free">Tirar a cortesia</option>
                    </select>
                    <input id="motivo-cortesia" value={motivoCortesia} onChange={(e) => setMotivoCortesia(e.target.value)} placeholder="Motivo (parceiro, compensação, teste interno)" className={campo} style={entrada} />
                  </div>
                  <button
                    disabled={ocupado || !motivoCortesia.trim()}
                    onClick={() => agir({ acao: "cortesia", plano: cortesia, motivo: motivoCortesia }, cortesia === "free" ? "Cortesia retirada." : "Plano de cortesia liberado, com os créditos do plano.")}
                    className={`${botaoSecundario} mt-2`}
                    style={entrada}
                  >
                    {cortesia === "free" ? "Tirar a cortesia" : "Liberar sem cobrança"}
                  </button>
                  <p className="text-xs mt-1" style={fraco}>Sem Stripe e sem prazo: fica até alguém tirar. Repõe os créditos do plano uma vez.</p>
                </>
              )}
            </Secao>

            <Secao titulo="Acesso">
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={ocupado}
                  onClick={() => agir({ acao: "papel", papel: ficha.papel === "admin" ? "user" : "admin" }, "Acesso alterado.")}
                  className={botaoSecundario}
                  style={entrada}
                >
                  {ficha.papel === "admin" ? "Tirar acesso de admin" : "Dar acesso de admin"}
                </button>
                <button disabled={ocupado} onClick={() => agir({ acao: "link_de_senha" }, "Link de senha enviado para o e-mail da conta.")} className={botaoSecundario} style={entrada}>
                  Mandar link de senha
                </button>
              </div>
            </Secao>

            <Secao titulo="Excluir a conta">
              {ficha.temAssinaturaViva ? (
                <p className="text-xs" style={fraco}>Fechado enquanto houver assinatura viva. Cancele (ou reembolse e encerre) antes.</p>
              ) : (
                <>
                  <p className="text-xs mb-2" style={fraco}>
                    Apaga a conta, as marcas, as campanhas e os posts. O cliente no Stripe fica, porque o histórico de cobrança é obrigação legal. Não tem volta.
                  </p>
                  <input id="confirma-exclusao" value={confirmaEmail} onChange={(e) => setConfirmaEmail(e.target.value)} placeholder={`Digite ${ficha.email} para confirmar`} className={campo} style={entrada} />
                  <button
                    disabled={ocupado || confirmaEmail.trim().toLowerCase() !== ficha.email.toLowerCase()}
                    onClick={() => agir({ acao: "excluir", confirmacao: confirmaEmail }, "Conta excluída.")}
                    className={`${botaoPrimario} mt-2`}
                    style={{ background: "#dc2626" }}
                  >
                    Excluir para sempre
                  </button>
                </>
              )}
            </Secao>

            <Secao titulo="Extrato de créditos">
              {ficha.extrato.length === 0 && <p className="text-xs" style={fraco}>Sem movimentação.</p>}
              <ul className="space-y-1">
                {ficha.extrato.map((t, i) => (
                  <li key={i} className="text-xs flex justify-between gap-3" style={fraco}>
                    <span>{data(t.quando)} · {t.operacao}{t.nota ? ` · ${t.nota}` : ""}</span>
                    <span style={{ color: t.quantidade < 0 ? "#f87171" : "#4ade80" }} className="whitespace-nowrap">
                      {t.quantidade > 0 ? "+" : ""}{t.quantidade} → {t.saldo}
                    </span>
                  </li>
                ))}
              </ul>
            </Secao>

            <Secao titulo="O que o admin já fez aqui">
              {ficha.acoes.length === 0 && <p className="text-xs" style={fraco}>Nada ainda.</p>}
              <ul className="space-y-1">
                {ficha.acoes.map((a, i) => (
                  <li key={i} className="text-xs" style={fraco}>
                    {data(a.quando)} · {a.acao} · por {a.admin}
                  </li>
                ))}
              </ul>
            </Secao>
          </>
        )}
      </aside>
    </div>
  );
}
