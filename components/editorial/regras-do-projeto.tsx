"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, ChevronDown, ListChecks, Loader2, Pencil, Plus, Power, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FraseDescartavel } from "@/components/ui/descartar";
import { chaveDasPropostasDoRoberto } from "@/lib/avisos/chaves";
import { MiniGraficoDoAchado } from "@/components/editorial/graficos-das-referencias";
import {
  ALVOS_DA_REGRA,
  ROTULO_DO_ALVO,
  type Achado,
  type AlvoDaRegra,
  type RegraDoProjeto,
  type RespostaDasAnalises,
} from "@/lib/referencias/tipos-das-analises";

/**
 * AS REGRAS DO PROJETO NA TELA (02/10/2026), num componente só.
 *
 * Mora em dois lugares, com a MESMA lógica: na linha editorial, dentro das
 * análises das referências (onde o Roberto propõe), e na aba Treinamento
 * (pedido do Bruno: "um lugar óbvio para gerenciar"), com o filtro por área e
 * o "Escrever uma regra minha". Toda decisão vai para a mesma rota
 * (/api/projects/[id]/referencias/regras) e quem chamou recarrega.
 *
 * Cada regra mostra ao lado o achado que a sustenta, com um gráfico pequeno do
 * número dele quando o achado ainda existe no último estudo.
 */

type AoDecidir = (id: string, acao: string, extra?: { texto?: string; alvos?: AlvoDaRegra[] }) => Promise<void>;

export function CartaoDaRegra({
  r,
  achadoAtual,
  podeEditar,
  aoDecidir,
}: {
  r: RegraDoProjeto;
  /** O achado do último estudo com a mesma chave, para o gráfico pequeno. */
  achadoAtual?: Achado;
  podeEditar: boolean;
  aoDecidir: AoDecidir;
}) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(r.texto);
  const [alvos, setAlvos] = useState<AlvoDaRegra[]>(r.alvos);
  const [ocupado, setOcupado] = useState(false);
  const decidir = async (acao: string, extra?: { texto?: string; alvos?: AlvoDaRegra[] }) => {
    setOcupado(true);
    try {
      await aoDecidir(r.id, acao, extra);
      setEditando(false);
    } finally {
      setOcupado(false);
    }
  };
  const valendo = r.status === "aprovada";
  return (
    <div className={cn("grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]", valendo && "border-emerald-500/40")} style={valendo ? undefined : { borderColor: "var(--border)" }}>
      <div className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          {valendo && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Valendo</span>}
          {r.status === "proposta" && <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-300">Proposta do Roberto</span>}
          {r.status === "desligada" && <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">Desligada</span>}
          {r.origem === "cliente" && <span className="rounded-full bg-zinc-500/15 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:text-zinc-300">Sua regra</span>}
          {(editando ? alvos : r.alvos).map((a) => (
            <span key={a} className="rounded-full border px-2 py-0.5 text-[10px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              {ROTULO_DO_ALVO[a]}
            </span>
          ))}
        </div>
        {editando ? (
          <div className="space-y-2">
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={220}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            />
            <div className="flex flex-wrap gap-1.5">
              {ALVOS_DA_REGRA.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAlvos((xs) => (xs.includes(a) ? xs.filter((x) => x !== a) : [...xs, a]))}
                  className={cn("rounded-full border px-2.5 py-1 text-xs", alvos.includes(a) ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300" : "")}
                  style={alvos.includes(a) ? undefined : { borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {ROTULO_DO_ALVO[a]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {r.texto}
          </p>
        )}
        {r.porque && !editando && (
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {r.porque}
          </p>
        )}
        {r.textoOriginal && !editando && (
          <p className="mt-1 text-[11px] italic" style={{ color: "var(--text-muted)" }}>
            Você editou. O Roberto tinha proposto: {r.textoOriginal}
          </p>
        )}
        {podeEditar && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {editando ? (
              <>
                <button type="button" disabled={ocupado} onClick={() => void decidir("editar", { texto, alvos })} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                  {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar e aprovar
                </button>
                <button type="button" onClick={() => { setEditando(false); setTexto(r.texto); setAlvos(r.alvos); }} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                {r.status === "proposta" && (
                  <button type="button" disabled={ocupado} onClick={() => void decidir("aprovar")} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
                    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Aprovar
                  </button>
                )}
                {r.status !== "recusada" && (
                  <button type="button" onClick={() => setEditando(true)} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <Pencil className="h-3.5 w-3.5" /> Editar
                  </button>
                )}
                {r.status === "proposta" && (
                  <button type="button" disabled={ocupado} onClick={() => void decidir("recusar")} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    <X className="h-3.5 w-3.5" /> Recusar
                  </button>
                )}
                {valendo && (
                  <button type="button" disabled={ocupado} onClick={() => void decidir("desligar")} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                    <Power className="h-3.5 w-3.5" /> Desligar
                  </button>
                )}
                {(r.status === "desligada" || r.status === "recusada") && (
                  <button type="button" disabled={ocupado} onClick={() => void decidir("religar")} className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                    <Power className="h-3.5 w-3.5" /> {r.status === "recusada" ? "Aprovar mesmo assim" : "Religar"}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      <div className="rounded-lg p-2.5 text-xs" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
        <p className="mb-1 flex items-center gap-1 font-semibold uppercase tracking-wide" style={{ fontSize: 10 }}>
          <ListChecks className="h-3 w-3" /> O que sustenta
        </p>
        {r.achado ? (
          <>
            <p style={{ color: "var(--text-primary)" }}>{r.achado.frase}</p>
            {achadoAtual?.vezes !== null && achadoAtual?.vezes !== undefined && (
              <MiniGraficoDoAchado
                vezes={achadoAtual.vezes}
                forca={achadoAtual.forca}
                rotulo={
                  achadoAtual.tipo === "conversa"
                    ? "comentários por curtida, contra o segundo formato"
                    : achadoAtual.tipo === "salvamento"
                      ? "salvamentos por visualização, contra o segundo formato"
                      : "contra o resto do perfil, no último estudo"
                }
              />
            )}
            <p className="mt-1">
              {r.achado.forca === "forte" ? "Forte" : "Indício"}: {r.achado.amostra.posts} posts de {r.achado.amostra.perfis} {r.achado.amostra.perfis === 1 ? "perfil" : "perfis"}.
            </p>
          </>
        ) : (
          <p>Regra sua: não depende de achado.</p>
        )}
      </div>
    </div>
  );
}


const FILTROS: Array<{ id: "todas" | AlvoDaRegra; rotulo: string }> = [{ id: "todas", rotulo: "Todas" }, ...ALVOS_DA_REGRA.map((a) => ({ id: a, rotulo: ROTULO_DO_ALVO[a] }))];

/**
 * A lista de regras: o filtro por área, as abertas (propostas, valendo e
 * desligadas), as recusadas recolhidas e o "Escrever uma regra minha".
 * Quem chama passa as regras e recarrega em `aoMudar`.
 */
export function ListaDeRegras({
  projectId,
  regras,
  achados = [],
  podeEditar,
  aoMudar,
}: {
  projectId: string;
  regras: RegraDoProjeto[];
  achados?: Achado[];
  podeEditar: boolean;
  aoMudar: () => Promise<void> | void;
}) {
  const [filtro, setFiltro] = useState<"todas" | AlvoDaRegra>("todas");
  const [verRecusadas, setVerRecusadas] = useState(false);
  const [escrevendo, setEscrevendo] = useState(false);
  const [texto, setTexto] = useState("");
  const [alvos, setAlvos] = useState<AlvoDaRegra[]>(["roteiro", "redacao"]);
  const [salvando, setSalvando] = useState(false);
  const porChave = useMemo(() => new Map(achados.map((a) => [a.chave, a])), [achados]);

  const decidir: AoDecidir = async (id, acao, extra) => {
    const r = await fetch(`/api/projects/${projectId}/referencias/regras/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, ...extra }),
    });
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      toast.error(j.error ?? "Não consegui salvar agora.");
      return;
    }
    if (acao === "aprovar" || acao === "editar" || acao === "religar") toast.success("Regra valendo: a equipe passa a seguir a partir da próxima peça.");
    await aoMudar();
  };

  async function criar() {
    setSalvando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/referencias/regras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, alvos }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        toast.error(j.error ?? "Não consegui salvar agora.");
        return;
      }
      setTexto("");
      setEscrevendo(false);
      toast.success("Regra salva e valendo.");
      await aoMudar();
    } finally {
      setSalvando(false);
    }
  }

  const naArea = (r: RegraDoProjeto) => filtro === "todas" || r.alvos.includes(filtro);
  const abertas = regras.filter((r) => r.status !== "recusada" && naArea(r));
  const recusadas = regras.filter((r) => r.status === "recusada" && naArea(r));
  const contagem = (id: "todas" | AlvoDaRegra) => regras.filter((r) => r.status !== "recusada" && (id === "todas" || r.alvos.includes(id))).length;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
        Regras valendo entram em tudo o que a equipe faz neste projeto.
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {FILTROS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFiltro(f.id)}
            className={cn("rounded-full border px-2.5 py-1 text-xs", filtro === f.id ? "border-orange-500 bg-orange-500/10 font-semibold text-orange-600 dark:text-orange-300" : "")}
            style={filtro === f.id ? undefined : { borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            {f.rotulo} ({contagem(f.id)})
          </button>
        ))}
        {podeEditar && !escrevendo && (
          <button
            type="button"
            onClick={() => {
              setEscrevendo(true);
              if (filtro !== "todas") setAlvos([filtro]);
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            <Plus className="h-3.5 w-3.5" /> Escrever uma regra minha
          </button>
        )}
      </div>
      {podeEditar && escrevendo && (
        <form
          className="space-y-2 rounded-lg border p-3"
          style={{ borderColor: "var(--border)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (texto.trim()) void criar();
          }}
        >
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            maxLength={220}
            autoFocus
            placeholder="Ex.: nunca usar gíria de internet nos títulos"
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-500"
            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Vale para:
            </span>
            {ALVOS_DA_REGRA.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAlvos((xs) => (xs.includes(a) ? xs.filter((x) => x !== a) : [...xs, a]))}
                className={cn("rounded-full border px-2.5 py-1 text-xs", alvos.includes(a) ? "border-orange-500 bg-orange-500/10 text-orange-600 dark:text-orange-300" : "")}
                style={alvos.includes(a) ? undefined : { borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {ROTULO_DO_ALVO[a]}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button type="submit" disabled={salvando || !texto.trim() || !alvos.length} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">
              {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Salvar regra
            </button>
            <button type="button" onClick={() => setEscrevendo(false)} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {abertas.length === 0 && !escrevendo && (
        <p className="rounded-lg border border-dashed p-3 text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {filtro === "todas" ? "Nenhuma regra ainda." : `Nenhuma regra para ${ROTULO_DO_ALVO[filtro].toLowerCase()}.`}
        </p>
      )}
      <div className="space-y-2">
        {abertas.map((r) => (
          <CartaoDaRegra key={`${r.id}:${r.status}:${r.texto}`} r={r} achadoAtual={r.achado ? porChave.get(r.achado.chave) : undefined} podeEditar={podeEditar} aoDecidir={decidir} />
        ))}
      </div>
      {recusadas.length > 0 && (
        <div>
          <button type="button" onClick={() => setVerRecusadas(!verRecusadas)} className="inline-flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", verRecusadas && "rotate-180")} />
            Recusadas ({recusadas.length}): não voltam nas próximas propostas
          </button>
          {verRecusadas && (
            <div className="mt-2 space-y-2">
              {recusadas.map((r) => (
                <CartaoDaRegra key={`${r.id}:${r.status}`} r={r} podeEditar={podeEditar} aoDecidir={decidir} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * As regras na aba Treinamento: busca as análises do projeto e mostra a mesma
 * lista. Sem estudo de referências, a lista serve igual para as regras do
 * próprio cliente.
 */
export function RegrasDoProjetoPainel({ projectId }: { projectId: string }) {
  const [d, setD] = useState<RespostaDasAnalises | null>(null);
  const carregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/referencias/analises`).catch(() => null);
    if (r?.ok) setD((await r.json()) as RespostaDasAnalises);
  }, [projectId]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  const valendo = d?.regras.filter((r) => r.status === "aprovada").length ?? 0;
  const propostas = d?.regras.filter((r) => r.status === "proposta").length ?? 0;
  return (
    <section id="regras-do-projeto" className="scroll-mt-24 rounded-xl border p-4 sm:p-5" style={{ borderColor: "var(--border)", background: "var(--bg-card)" }}>
      <h2 className="flex items-center gap-2 text-base font-semibold" style={{ color: "var(--text-primary)" }}>
        <Sparkles className="h-4 w-4 text-orange-500" /> Regras do projeto
      </h2>
      <p className="mb-3 mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
        {d ? `${valendo} valendo` : ""}
        {/* Só a frase das propostas se descarta (07/10); Aprovar e Recusar ficam na lista. */}
        {d && propostas ? (
          <FraseDescartavel chave={chaveDasPropostasDoRoberto(projectId, d.regras.filter((r) => r.status === "proposta").map((r) => r.id))}>
            {`, ${propostas} propostas do Roberto esperando você`}
          </FraseDescartavel>
        ) : null}
        {d ? ". " : ""}
        As propostas nascem do estudo das referências, em Linha editorial; aqui você aprova, edita, desliga ou escreve as suas.
      </p>
      {!d ? (
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <ListaDeRegras projectId={projectId} regras={d.regras} achados={d.achados} podeEditar={d.podeEditar} aoMudar={carregar} />
      )}
    </section>
  );
}
