"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
// Só TIPOS dos módulos de servidor: o import de tipo some na compilação, e o
// módulo, que lê o banco, nunca chega ao navegador (mesma regra do CRM).
import type { ContaDoProjeto } from "@/lib/admin/blotato-vinculos";
import type { PedidoParaOAdmin } from "@/lib/social/conexao-assistida";
import { NOME_DA_REDE } from "@/lib/social/textos-da-conexao";

/**
 * A TELA DE LIGAR CONTAS DA PONTE A PROJETOS (01/10). Ver
 * app/(app)/admin/redes/page.tsx para o porquê. As travas (Facebook exige
 * página, a conta tem que ser do projeto, a rede tem que bater) moram no
 * servidor, em lib/admin/blotato-vinculos.ts; aqui a tela só evita o clique
 * que já se sabe que vai ser recusado.
 */

type ContaDaPonte = {
  id: string;
  platform: string;
  nome: string | null;
  usuario: string | null;
  paginas: Array<{ id: string; nome: string | null }>;
  erroDasPaginas: string | null;
};
type Projeto = { id: string; nome: string; dono: string; donoNome: string | null };

const caixa = { background: "var(--bg-card)", borderColor: "var(--border)" } as const;
const campo = "w-full rounded-lg border px-3 py-2 text-sm bg-transparent";
const estiloCampo = { borderColor: "var(--border)", color: "var(--text-primary)", background: "var(--bg-primary)" } as const;

function rede(p: string) {
  return NOME_DA_REDE[p] ?? p;
}
function rotuloDaConta(c: ContaDaPonte) {
  return `${rede(c.platform)} · ${c.nome ?? "(sem nome)"}${c.usuario ? ` @${c.usuario}` : ""} (${c.id})`;
}
function data(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function RedesDosClientes({
  ponte,
  erroDaPonte,
  contas,
  projetos,
  pedidos,
  ambiente,
  projetoInicial,
}: {
  ponte: ContaDaPonte[];
  erroDaPonte: string | null;
  contas: ContaDoProjeto[];
  projetos: Projeto[];
  pedidos: PedidoParaOAdmin[];
  ambiente: { ponteLigada: boolean; redesPelaPonte: string | null; contasPelaPonte: string | null; assistidas: string[] };
  projetoInicial: string | null;
}) {
  const router = useRouter();
  const [projectId, setProjectId] = useState(projetoInicial && projetos.some((p) => p.id === projetoInicial) ? projetoInicial : "");
  const [buscaProjeto, setBuscaProjeto] = useState("");
  const [contaId, setContaId] = useState("");
  const [paginaId, setPaginaId] = useState("");
  const [socialId, setSocialId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [filtro, setFiltro] = useState("");

  const conta = ponte.find((c) => c.id === contaId) ?? null;
  const projetosFiltrados = useMemo(() => {
    const q = buscaProjeto.trim().toLowerCase();
    const lista = q
      ? projetos.filter((p) => `${p.nome} ${p.dono} ${p.donoNome ?? ""}`.toLowerCase().includes(q))
      : projetos;
    // O escolhido continua na lista mesmo fora do filtro, senão o select perde o valor.
    const escolhido = projetos.find((p) => p.id === projectId);
    return escolhido && !lista.includes(escolhido) ? [escolhido, ...lista] : lista;
  }, [buscaProjeto, projetos, projectId]);
  const contasDoProjetoNaRede = contas.filter((c) => c.projectId === projectId && conta && c.platform === conta.platform);
  const exigePagina = conta?.platform === "facebook";
  const oferecePagina = conta && (conta.platform === "facebook" || conta.platform === "linkedin") && conta.paginas.length > 0;

  /** Onde cada vínculo da ponte já está ligado, para não ligar a mesma conta no projeto errado sem ver. */
  const ondeEstaLigada = useMemo(() => {
    const m = new Map<string, ContaDoProjeto[]>();
    for (const c of contas) {
      if (!c.vinculo) continue;
      const base = c.vinculo.split(":")[0];
      m.set(base, [...(m.get(base) ?? []), c]);
    }
    return m;
  }, [contas]);

  async function ligar() {
    if (!projectId || !contaId) return toast.error("Escolha o projeto e a conta.");
    if (exigePagina && !paginaId) return toast.error("Facebook precisa da página.");
    setEnviando(true);
    try {
      const res = await fetch("/api/admin/redes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, contaId, paginaId: paginaId || undefined, socialId: socialId || undefined }),
      });
      const d = (await res.json().catch(() => ({}))) as { error?: string; criada?: boolean; nome?: string };
      if (!res.ok) throw new Error(d.error ?? "Falha ao ligar.");
      toast.success(`${d.criada ? "Conta criada e ligada" : "Conta ligada"}: ${d.nome ?? ""}`);
      setContaId("");
      setPaginaId("");
      setSocialId("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao ligar.");
    } finally {
      setEnviando(false);
    }
  }

  async function desligar(c: ContaDoProjeto) {
    const aviso = c.temToken
      ? `Tirar o vínculo de "${c.nome}"? Ela volta a publicar pela API própria.`
      : `"${c.nome}" só publica pela ponte. Desligar APAGA a conta do projeto "${c.projeto}" (os posts guardam para onde iam). Continuar?`;
    if (!window.confirm(aviso)) return;
    const res = await fetch("/api/admin/redes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socialId: c.id }),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string; apagada?: boolean };
    if (!res.ok) return toast.error(d.error ?? "Falha ao desligar.");
    toast.success(d.apagada ? "Conta apagada do projeto." : "Vínculo tirado.");
    router.refresh();
  }

  const contasFiltradas = useMemo(() => {
    const q = filtro.trim().toLowerCase();
    if (!q) return contas;
    return contas.filter((c) => `${c.projeto} ${c.dono} ${c.platform} ${c.nome}`.toLowerCase().includes(q));
  }, [contas, filtro]);
  const porProjeto = useMemo(() => {
    const m = new Map<string, ContaDoProjeto[]>();
    for (const c of contasFiltradas) m.set(c.projectId, [...(m.get(c.projectId) ?? []), c]);
    return [...m.entries()];
  }, [contasFiltradas]);

  const pendentes = pedidos.filter((p) => !p.atendido);

  return (
    <div className="space-y-6">
      {/* O AMBIENTE: o que a variável liga hoje, para ninguém adivinhar. */}
      <div className="rounded-2xl border p-4 text-sm grid gap-1" style={caixa}>
        <p style={{ color: "var(--text-primary)" }}>
          Ponte:{" "}
          <strong className={ambiente.ponteLigada ? "text-green-400" : "text-red-400"}>
            {ambiente.ponteLigada ? "ligada (chave presente)" : "desligada (sem BLOTATO_API_KEY)"}
          </strong>
        </p>
        <p style={{ color: "var(--text-muted)" }}>
          PUBLICAR_VIA_BLOTATO: <code>{ambiente.redesPelaPonte ?? "(não definida)"}</code>
          {ambiente.contasPelaPonte ? (
            <>
              {" "}
              · PUBLICAR_VIA_BLOTATO_CONTAS: <code>{ambiente.contasPelaPonte}</code>
            </>
          ) : null}
        </p>
        <p style={{ color: "var(--text-muted)" }}>
          Conexão assistida na tela do cliente:{" "}
          {ambiente.assistidas.length ? ambiente.assistidas.map(rede).join(", ") : "nenhuma rede (o cliente vê Conectar em todas)"}
        </p>
        <p style={{ color: "var(--text-muted)" }}>
          Conta ligada SEM token próprio sai pela ponte sempre. Conta com token só sai pela ponte se a rede (ou o id
          dela) estiver na variável.
        </p>
      </div>

      {/* PEDIDOS do botão "Conexão assistida". */}
      <section className="rounded-2xl border p-4" style={caixa}>
        <h2 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Pedidos de conexão assistida {pendentes.length > 0 && <span className="text-orange-400">({pendentes.length} pendentes)</span>}
        </h2>
        {pedidos.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhum pedido nos últimos 30 dias.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-sm">
              <thead>
                <tr className="text-left text-xs" style={{ color: "var(--text-muted)" }}>
                  <th className="py-1 pr-3">Quando</th>
                  <th className="py-1 pr-3">Cliente</th>
                  <th className="py-1 pr-3">Projeto</th>
                  <th className="py-1 pr-3">Rede</th>
                  <th className="py-1 pr-3">Recado</th>
                  <th className="py-1 pr-3">Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={`${p.em}-${p.rede}`} className="border-t" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <td className="py-1.5 pr-3 whitespace-nowrap">{data(p.em)}</td>
                    <td className="py-1.5 pr-3">{p.email}</td>
                    <td className="py-1.5 pr-3">{p.projeto}</td>
                    <td className="py-1.5 pr-3">{rede(p.rede)}</td>
                    <td className="py-1.5 pr-3 max-w-[260px] truncate" title={p.nota ?? ""}>
                      {p.nota ?? "-"}
                    </td>
                    <td className="py-1.5 pr-3">
                      {p.atendido ? <span className="text-green-400">conectada</span> : <span className="text-orange-400">pendente</span>}
                    </td>
                    <td className="py-1.5">
                      <button
                        className="text-xs text-orange-400 hover:text-orange-300"
                        onClick={() => {
                          setProjectId(p.projectId);
                          setSocialId("");
                          const daRede = ponte.filter((c) => c.platform === p.rede);
                          setContaId(daRede.length === 1 ? daRede[0].id : "");
                          document.getElementById("ligar-conta")?.scrollIntoView({ behavior: "smooth" });
                        }}
                      >
                        Ligar agora
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* LIGAR */}
      <section id="ligar-conta" className="rounded-2xl border p-4" style={caixa}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Ligar uma conta da ponte a um projeto
          </h2>
          <div className="flex gap-3 text-xs">
            <a href="https://my.blotato.com/settings" target="_blank" rel="noreferrer" className="text-orange-400 hover:text-orange-300">
              Abrir o painel da ponte
            </a>
            <button className="text-orange-400 hover:text-orange-300" onClick={() => router.refresh()}>
              Atualizar a lista
            </button>
          </div>
        </div>
        {erroDaPonte ? (
          <p className="text-sm text-red-400 mb-3">Não li as contas da ponte: {erroDaPonte}</p>
        ) : ponte.length === 0 ? (
          <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
            Nenhuma conta conectada no painel da ponte ainda.
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="text-xs grid gap-1" style={{ color: "var(--text-muted)" }}>
            Projeto do cliente
            <input
              value={buscaProjeto}
              onChange={(e) => setBuscaProjeto(e.target.value)}
              placeholder="Buscar por projeto, e-mail ou nome"
              className={campo}
              style={estiloCampo}
            />
            <select value={projectId} onChange={(e) => { setProjectId(e.target.value); setSocialId(""); }} className={campo} style={estiloCampo} aria-label="Projeto">
              <option value="">Escolha o projeto</option>
              {projetosFiltrados.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} · {p.donoNome ? `${p.donoNome} ` : ""}{p.dono}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs grid gap-1 content-start" style={{ color: "var(--text-muted)" }}>
            Conta conectada na ponte
            <select
              value={contaId}
              onChange={(e) => { setContaId(e.target.value); setPaginaId(""); setSocialId(""); }}
              className={campo}
              style={estiloCampo}
              aria-label="Conta da ponte"
            >
              <option value="">Escolha a conta</option>
              {ponte.map((c) => (
                <option key={c.id} value={c.id}>
                  {rotuloDaConta(c)}
                </option>
              ))}
            </select>
            {conta && ondeEstaLigada.get(conta.id)?.length ? (
              <span className="text-[11px] text-yellow-500">
                Já ligada em: {ondeEstaLigada.get(conta.id)!.map((c) => `${c.projeto} (${c.nome})`).join("; ")}
              </span>
            ) : null}
          </label>

          {oferecePagina && (
            <label className="text-xs grid gap-1" style={{ color: "var(--text-muted)" }}>
              {exigePagina ? "Página do Facebook (obrigatória)" : "Página da empresa (vazio publica no perfil)"}
              <select value={paginaId} onChange={(e) => setPaginaId(e.target.value)} className={campo} style={estiloCampo} aria-label="Página">
                <option value="">{exigePagina ? "Escolha a página" : "Perfil pessoal (sem página)"}</option>
                {conta!.paginas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome ?? "(sem nome)"} ({s.id})
                  </option>
                ))}
              </select>
            </label>
          )}
          {conta && exigePagina && conta.paginas.length === 0 && (
            <p className="text-xs text-red-400">
              Esta conta do Facebook não trouxe página nenhuma{conta.erroDasPaginas ? ` (${conta.erroDasPaginas})` : ""}. Reconecte no painel
              da ponte marcando a página.
            </p>
          )}

          {conta && projectId && (
            <label className="text-xs grid gap-1" style={{ color: "var(--text-muted)" }}>
              Conta do projeto
              <select value={socialId} onChange={(e) => setSocialId(e.target.value)} className={campo} style={estiloCampo} aria-label="Conta do projeto">
                <option value="">Criar conta nova, só pela ponte</option>
                {contasDoProjetoNaRede.map((c) => (
                  <option key={c.id} value={c.id}>
                    Ligar a que já existe: {c.nome} ({c.temToken ? "com token" : "sem token"})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <button
          onClick={ligar}
          disabled={enviando || !projectId || !contaId || (exigePagina && !paginaId)}
          className="mt-3 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {enviando ? "Ligando..." : "Ligar"}
        </button>
      </section>

      {/* CONTAS DA PONTE, com páginas e onde cada uma está ligada. */}
      {ponte.length > 0 && (
        <section className="rounded-2xl border p-4" style={caixa}>
          <h2 className="text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
            Contas conectadas na ponte ({ponte.length})
          </h2>
          <div className="grid gap-2">
            {ponte.map((c) => (
              <div key={c.id} className="text-sm border-t pt-2" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                <span className="font-medium">{rotuloDaConta(c)}</span>
                {c.paginas.length > 0 && (
                  <span style={{ color: "var(--text-muted)" }}>
                    {" "}· páginas: {c.paginas.map((s) => `${s.nome ?? "(sem nome)"} (${s.id})`).join(", ")}
                  </span>
                )}
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {ondeEstaLigada.get(c.id)?.length
                    ? `Ligada em: ${ondeEstaLigada.get(c.id)!.map((x) => `${x.projeto} · ${x.nome} [${x.vinculo}]`).join("; ")}`
                    : "Não ligada a nenhum projeto."}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* POR ONDE CADA CONTA PUBLICA */}
      <section className="rounded-2xl border p-4" style={caixa}>
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Por onde cada conta publica
          </h2>
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder="Filtrar por projeto, e-mail ou rede"
            className="rounded-lg border px-3 py-1.5 text-sm bg-transparent w-full sm:w-72"
            style={estiloCampo}
          />
        </div>
        {porProjeto.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Nenhuma conta.
          </p>
        )}
        <div className="space-y-4">
          {porProjeto.map(([pid, lista]) => (
            <div key={pid}>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {lista[0].projeto} <span className="font-normal text-xs" style={{ color: "var(--text-muted)" }}>· {lista[0].dono} · {pid}</span>
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[52rem] text-sm mt-1">
                  <tbody>
                    {lista.map((c) => (
                      <tr key={c.id} className="border-t" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                        <td className="py-1.5 pr-3 whitespace-nowrap">{rede(c.platform)}</td>
                        <td className="py-1.5 pr-3">
                          {c.nome}
                          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                            {" "}{c.accountType === "organization" ? "página" : "perfil"}
                            {c.ativa ? "" : " · inativa"}
                            {c.precisaReconectar ? " · rede recusou o token" : ""}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-xs whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                          token {c.temToken ? "sim" : "não"} · vínculo {c.vinculo ?? "-"}
                        </td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${c.caminho === "blotato" ? "bg-orange-500/15 text-orange-400" : "bg-sky-500/15 text-sky-400"}`}
                            title={c.motivo}
                          >
                            {c.caminho === "blotato" ? "pela ponte" : "API própria"}
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 text-xs" style={{ color: "var(--text-muted)" }}>
                          {c.motivo}
                        </td>
                        <td className="py-1.5 text-right">
                          {c.vinculo && (
                            <button className="text-xs text-red-400 hover:text-red-300" onClick={() => desligar(c)}>
                              {c.temToken ? "Tirar vínculo" : "Desligar e apagar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
