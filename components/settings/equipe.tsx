"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Users, Mail, Trash2, RotateCw, Pencil, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ACESSO_EXTRA, type EquipeNaTela, type MembroNoPainel, type PainelDaEquipe } from "@/lib/equipe/regras";

/**
 * A ABA EQUIPE das Configurações (01/10/2026).
 *
 * Para o DONO: quantos acessos o plano dá, a cota da conta (que todos gastam),
 * o convite, e o PAINEL DE CONSUMO por membro, com projetos liberados, teto do
 * mês e remover. Para o MEMBRO: de quem é a conta e quanto ele usou.
 *
 * Componente de cliente sem banco: os tipos e números vêm de
 * lib/equipe/regras.ts, e as mudanças vão por /api/equipe.
 */

const n = (v: number) => v.toLocaleString("pt-BR");
const cartao = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const campo = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent";
const entrada = { borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-input)" } as const;

function dia(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

function Barra({ usado, total }: { usado: number; total: number }) {
  const p = total > 0 ? Math.min(100, Math.round((usado / total) * 100)) : 0;
  return (
    <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }} aria-hidden>
      <div className="h-full rounded-full bg-azul-500" style={{ width: `${p}%` }} />
    </div>
  );
}

async function chamar(url: string, metodo: string, corpo?: unknown) {
  const r = await fetch(url, {
    method: metodo,
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error ?? "Não consegui salvar agora.");
  return d as { equipe?: PainelDaEquipe; link?: string; emailEnviado?: boolean };
}

export function Equipe({ inicial }: { inicial: EquipeNaTela }) {
  if (inicial.papel === "membro") {
    const m = inicial;
    return (
      <section className="rounded-xl border p-6 space-y-3" style={cartao}>
        <p className="rotulo">Sua equipe</p>
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          Você faz parte da equipe de <span className="destaque">{m.dono}</span>
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          O que você gera sai da cota da conta da equipe. Plano, cobrança e convites ficam com quem administra a conta.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Uso rotulo="Seus créditos neste mês" usado={m.consumo.creditos} teto={m.tetoCreditos} />
          <Uso rotulo="Suas gravações neste mês" usado={m.consumo.gravacoes} teto={m.tetoGravacoes} />
        </div>
      </section>
    );
  }
  return <PainelDoDono inicial={inicial} />;
}

function Uso({ rotulo, usado, teto }: { rotulo: string; usado: number; teto: number | null }) {
  return (
    <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
        {n(usado)}
        {teto !== null && <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}> de {n(teto)} liberados</span>}
      </p>
      {teto !== null && <Barra usado={usado} total={teto} />}
      {teto === null && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Sem teto próprio: vale a cota da conta.</p>}
    </div>
  );
}

type Form = { projetos: string[]; todosOsProjetos: boolean; tetoGravacoes: string; tetoCreditos: string };

function CamposDoMembro({ f, setF, projetos }: { f: Form; setF: (f: Form) => void; projetos: PainelDaEquipe["projetos"] }) {
  return (
    <div className="space-y-3">
      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium mb-1" style={{ color: "var(--text-muted)" }}>Projetos que a pessoa vê e usa</legend>
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
          <input type="checkbox" checked={f.todosOsProjetos} onChange={(e) => setF({ ...f, todosOsProjetos: e.target.checked })} />
          Todos os projetos, inclusive os que eu criar depois
        </label>
        {!f.todosOsProjetos && (
          <div className="flex flex-wrap gap-2">
            {projetos.length === 0 && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>Crie o projeto da pessoa (a marca dela) e libere aqui.</p>
            )}
            {projetos.map((p) => {
              const marcado = f.projetos.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => setF({ ...f, projetos: marcado ? f.projetos.filter((x) => x !== p.id) : [...f.projetos, p.id] })}
                  className="rounded-full border px-3 py-1 text-xs transition-colors"
                  style={marcado ? { background: "var(--azul-600)", borderColor: "var(--azul-600)", color: "#fff" } : { borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  {p.nome}
                </button>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
          <span>Teto de gravações por mês (opcional)</span>
          <input inputMode="numeric" value={f.tetoGravacoes} onChange={(e) => setF({ ...f, tetoGravacoes: e.target.value.replace(/\D/g, "") })} placeholder="Sem teto" className={campo} style={entrada} />
        </label>
        <label className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
          <span>Teto de créditos por mês (opcional)</span>
          <input inputMode="numeric" value={f.tetoCreditos} onChange={(e) => setF({ ...f, tetoCreditos: e.target.value.replace(/\D/g, "") })} placeholder="Sem teto" className={campo} style={entrada} />
        </label>
      </div>
    </div>
  );
}

const formVazio: Form = { projetos: [], todosOsProjetos: false, tetoGravacoes: "", tetoCreditos: "" };
const corpoDoForm = (f: Form) => ({
  projetos: f.projetos,
  todosOsProjetos: f.todosOsProjetos,
  tetoGravacoes: f.tetoGravacoes ? Number(f.tetoGravacoes) : null,
  tetoCreditos: f.tetoCreditos ? Number(f.tetoCreditos) : null,
});

function PainelDoDono({ inicial }: { inicial: PainelDaEquipe }) {
  const [eq, setEq] = useState(inicial);
  const [email, setEmail] = useState("");
  const [nome, setNome] = useState("");
  const [form, setForm] = useState<Form>(formVazio);
  const [enviando, setEnviando] = useState(false);
  const [ultimoLink, setUltimoLink] = useState<string | null>(null);
  const livres = Math.max(0, eq.acessos.total - eq.acessos.ocupados);
  const c = eq.conta;

  async function convidar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    try {
      const d = await chamar("/api/equipe", "POST", { email, nome, ...corpoDoForm(form) });
      if (d.equipe) setEq(d.equipe);
      setUltimoLink(d.link ?? null);
      toast.success(d.emailEnviado ? `Convite enviado para ${email}.` : "Convite criado. Copie o link abaixo e mande para a pessoa.");
      setEmail("");
      setNome("");
      setForm(formVazio);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* O RESUMO: acessos e a cota que todos dividem. */}
      <section className="rounded-xl border p-6 space-y-4" style={cartao}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="rotulo">Equipe {eq.plano ? `· ${eq.plano}` : ""}</p>
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
              {eq.acessos.ocupados} de {eq.acessos.total} acessos em uso
            </h2>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {eq.acessos.inclusos} inclusos no plano, contando o seu
              {eq.acessos.extras > 0 ? `, mais ${eq.acessos.extras} acesso${eq.acessos.extras > 1 ? "s" : ""} extra${eq.acessos.extras > 1 ? "s" : ""}` : ""}.
            </p>
          </div>
          <Users className="h-6 w-6 shrink-0" style={{ color: "var(--azul-500)" }} aria-hidden />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Créditos da conta</p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {n(c.creditos)} <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>de {n(c.creditosDoCiclo)} no ciclo</span>
            </p>
            <Barra usado={Math.max(0, c.creditosDoCiclo - c.creditos)} total={c.creditosDoCiclo} />
          </div>
          <div className="rounded-lg border p-3 space-y-1.5" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>Gravações da conta neste mês</p>
            <p className="text-lg font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {n(c.gravacoesUsadas)} <span className="text-sm font-normal" style={{ color: "var(--text-muted)" }}>de {n(c.gravacoesDoCiclo)}</span>
            </p>
            <Barra usado={c.gravacoesUsadas} total={c.gravacoesDoCiclo} />
          </div>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Todos da equipe gastam desta cota. Quando ela acaba, ninguém gera até a renovação{c.renovaEm ? ` (por volta de ${dia(c.renovaEm)})` : ""} ou uma recarga.
          Precisa de mais gente? Cada acesso extra custa R$ {ACESSO_EXTRA.precoMensal} por mês e soma {n(ACESSO_EXTRA.creditosPorMes)} créditos e{" "}
          {ACESSO_EXTRA.gravacoesPorMes} gravação por mês à cota; peça ao time da Demandou.
        </p>
      </section>

      {/* O CONVITE */}
      <section className="rounded-xl border p-6 space-y-4" style={cartao}>
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Convidar para a equipe</h3>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            A pessoa recebe um link por e-mail e entra com o próprio login. Ela não vê cobrança nem convida ninguém.
          </p>
        </div>
        {livres === 0 ? (
          <p className="text-sm" style={{ color: "var(--marca-laranja-texto)" }}>
            Todos os {eq.acessos.total} acessos estão em uso. Remova alguém ou peça um acesso extra.
          </p>
        ) : (
          <form onSubmit={convidar} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
                <span>E-mail</span>
                <input id="convite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vendedor@empresa.com.br" className={campo} style={entrada} />
              </label>
              <label className="text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
                <span>Nome (opcional)</span>
                <input id="convite-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Como a pessoa se chama" className={campo} style={entrada} />
              </label>
            </div>
            <CamposDoMembro f={form} setF={setForm} projetos={eq.projetos} />
            <Button type="submit" loading={enviando} disabled={!email}>
              <Mail className="h-4 w-4" /> Mandar convite
            </Button>
          </form>
        )}
        {ultimoLink && (
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--border)" }}>
            <code className="min-w-0 flex-1 truncate text-xs" style={{ color: "var(--text-muted)" }}>{ultimoLink}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(ultimoLink).then(() => toast.success("Link copiado."), () => toast.error("Não consegui copiar."))}
            >
              <Copy className="h-3.5 w-3.5" /> Copiar link
            </Button>
          </div>
        )}
      </section>

      {/* O PAINEL DE CONSUMO */}
      <section className="rounded-xl border p-6 space-y-3" style={cartao}>
        <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>Consumo neste mês</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                <th className="pb-2 pr-3 font-medium">Pessoa</th>
                <th className="pb-2 pr-3 font-medium">Créditos</th>
                <th className="pb-2 pr-3 font-medium">Gravações</th>
                <th className="pb-2 font-medium">Projetos</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>{c.nome} <span className="text-xs" style={{ color: "var(--text-muted)" }}>(você)</span></td>
                <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>{n(c.consumoDoDono.creditos)}</td>
                <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>{n(c.consumoDoDono.gravacoes)}</td>
                <td className="py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>Todos</td>
              </tr>
              {eq.membros.map((m) => (
                <LinhaDoMembro key={m.id} m={m} projetos={eq.projetos} aoMudar={setEq} />
              ))}
              {(c.consumoDeQuemSaiu.creditos > 0 || c.consumoDeQuemSaiu.gravacoes > 0) && (
                <tr className="border-t" style={{ borderColor: "var(--border)" }}>
                  <td className="py-2.5 pr-3 text-xs" style={{ color: "var(--text-muted)" }}>Quem saiu da equipe neste mês</td>
                  <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>{n(c.consumoDeQuemSaiu.creditos)}</td>
                  <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>{n(c.consumoDeQuemSaiu.gravacoes)}</td>
                  <td className="py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>Acesso removido</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {eq.membros.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Ninguém na equipe ainda. Convide acima.</p>
        )}
      </section>
    </div>
  );
}

function LinhaDoMembro({ m, projetos, aoMudar }: { m: MembroNoPainel; projetos: PainelDaEquipe["projetos"]; aoMudar: (e: PainelDaEquipe) => void }) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [f, setF] = useState<Form>({
    projetos: m.projetos,
    todosOsProjetos: m.todosOsProjetos,
    tetoGravacoes: m.tetoGravacoes ? String(m.tetoGravacoes) : "",
    tetoCreditos: m.tetoCreditos ? String(m.tetoCreditos) : "",
  });

  async function agir(metodo: string, corpo: unknown, ok: string) {
    setOcupado(true);
    try {
      const d = await chamar(`/api/equipe/membros/${m.id}`, metodo, corpo);
      if (d.equipe) aoMudar(d.equipe);
      toast.success(ok);
      setEditando(false);
      setConfirmando(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  const nomesDosProjetos = m.todosOsProjetos
    ? "Todos"
    : m.projetos.map((id) => projetos.find((p) => p.id === id)?.nome).filter(Boolean).join(", ") || "Nenhum liberado";
  const situacao = m.status === "ativo" ? null : m.convitevencido ? "Convite vencido" : "Convite enviado";

  return (
    <>
      <tr className="border-t align-top" style={{ borderColor: "var(--border)" }}>
        <td className="py-2.5 pr-3">
          <p style={{ color: "var(--text-primary)" }}>{m.nome || m.email}</p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {m.nome ? m.email : ""}
            {situacao && (
              <span className="ml-1 rounded-full px-2 py-0.5 text-[11px]" style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
                {situacao}
              </span>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditando((v) => !v)}>
              <Pencil className="h-3.5 w-3.5" /> Ajustar
            </Button>
            {m.status === "convidado" && (
              <Button size="sm" variant="ghost" loading={ocupado} onClick={() => void agir("POST", { acao: "reenviar" }, "Convite reenviado com um link novo.")}>
                <RotateCw className="h-3.5 w-3.5" /> Reenviar
              </Button>
            )}
            {confirmando ? (
              <>
                <Button size="sm" variant="destructive" loading={ocupado} onClick={() => void agir("DELETE", undefined, "Acesso removido.")}>
                  Confirmar: tirar o acesso
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmando(false)}>Voltar</Button>
              </>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmando(true)}>
                <Trash2 className="h-3.5 w-3.5" /> Remover
              </Button>
            )}
          </div>
        </td>
        <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>
          {n(m.consumo.creditos)}
          {m.tetoCreditos !== null && <span className="text-xs" style={{ color: "var(--text-muted)" }}> de {n(m.tetoCreditos)}</span>}
        </td>
        <td className="py-2.5 pr-3" style={{ color: "var(--text-primary)" }}>
          {n(m.consumo.gravacoes)}
          {m.tetoGravacoes !== null && <span className="text-xs" style={{ color: "var(--text-muted)" }}> de {n(m.tetoGravacoes)}</span>}
        </td>
        <td className="py-2.5 text-xs" style={{ color: "var(--text-muted)" }}>{nomesDosProjetos}</td>
      </tr>
      {editando && (
        <tr>
          <td colSpan={4} className="pb-4">
            <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}>
              <CamposDoMembro f={f} setF={setF} projetos={projetos} />
              <Button size="sm" loading={ocupado} onClick={() => void agir("PATCH", corpoDoForm(f), "Acesso atualizado.")}>
                Salvar
              </Button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
