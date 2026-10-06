"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, Clapperboard, Image as ImageIcon, Library, Loader2, PenLine, Search, Sparkles, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROTULO_DO_TIPO, custoEstimadoDasPrevias, filtrarGaleria, foraDoBook, ordenarPorUso, type DesignDaGaleria, type TipoDeDesign } from "@/lib/biblioteca-de-design/tipos";

/**
 * A GALERIA DA BIBLIOTECA DE DESIGN (06/10/2026).
 *
 * Regra do Bruno: "usar os designs de cada usuário para crescer nossa
 * biblioteca e listar do mais usado para o menos na galeria; assim os
 * próprios usuários criam uma biblioteca de design com IA". A tela:
 *   - lista do MAIS USADO ao menos (a ordem vem da rota, e é a de `usos`);
 *   - mostra a PRÉVIA quando existe (a arte do estilo, a prévia gerada do
 *     Vox) e "Prévia ainda não gerada" quando não; nenhuma prévia é gerada
 *     daqui pelo cliente, porque custa;
 *   - filtra por tipo (vídeo, imagem) e busca por texto;
 *   - deixa o cliente ESCOLHER um design ("Usar este") OU ESCREVER o seu,
 *     que entra na biblioteca (o JEV compara, o Claude escreve a ficha);
 *   - para admin, a ação "Gerar prévias pendentes" mostra o custo estimado e
 *     só gera com a confirmação.
 * O nome de quem criou nunca aparece: só "feito por um cliente".
 *
 * PRIVACIDADE (06/10, vazamento): o pedido como foi escrito só aparece para
 * quem o escreveu (a rota manda vazio para os outros); o cliente pode marcar
 * "só no meu projeto" ao escrever, e tirar da galeria (ou pedir para voltar)
 * o design que ele pediu.
 *
 * `exemplo`: só no `next dev`, lê `?exemplo=1` da rota (dados em memória) e
 * não grava nada; as ações viram avisos.
 */

type Filtro = TipoDeDesign | "todos";

type Pendentes = { total: number; porTipo: Record<TipoDeDesign, number>; custo: { texto: string; minimo: number; maximo: number } };

const ROTULO_DO_FILTRO: Record<Filtro, string> = { todos: "Todos", video: "Vídeo", imagem: "Imagem" };

function rotuloDeUsos(n: number): string {
  if (n === 0) return "Ainda sem uso";
  return `${n} ${n === 1 ? "uso" : "usos"}`;
}

export function GaleriaDaBiblioteca({
  projectId,
  exemplo = false,
  titulo = "Biblioteca de designs: feita por quem usa",
  idsDoBook,
}: {
  projectId?: string | null;
  exemplo?: boolean;
  titulo?: string;
  /** Os ids do book na mesma tela (06/10): esses modelos de imagem não aparecem de novo aqui. */
  idsDoBook?: string[];
}) {
  const [designs, setDesigns] = useState<DesignDaGaleria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<DesignDaGaleria | null>(null);
  const [escrevendo, setEscrevendo] = useState(false);
  const [tipoDoPedido, setTipoDoPedido] = useState<TipoDeDesign>("video");
  const [pedido, setPedido] = useState("");
  const [soNoMeuProjeto, setSoNoMeuProjeto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [mudandoVisibilidade, setMudandoVisibilidade] = useState(false);
  const [usando, setUsando] = useState<string | null>(null);
  const [pendentes, setPendentes] = useState<Pendentes | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [gerando, setGerando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const q = new URLSearchParams();
      if (projectId) q.set("projectId", projectId);
      if (exemplo) {
        q.set("exemplo", "1");
        q.set("admin", "1");
      }
      const r = await fetch(`/api/biblioteca-de-design?${q.toString()}`);
      const d = (await r.json().catch(() => ({}))) as { designs?: DesignDaGaleria[]; ehAdmin?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error || "Não consegui carregar a biblioteca.");
      setDesigns(ordenarPorUso(foraDoBook(d.designs ?? [], idsDoBook)));
      setEhAdmin(Boolean(d.ehAdmin));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui carregar a biblioteca.");
      setDesigns([]);
    }
  }, [projectId, exemplo, idsDoBook]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // As prévias pendentes (só admin): no exemplo, contadas em memória.
  useEffect(() => {
    if (!ehAdmin || !designs) return;
    if (exemplo) {
      const porTipo: Record<TipoDeDesign, number> = { video: 0, imagem: 0 };
      for (const d of designs) if (!d.previaUrl) porTipo[d.tipo]++;
      const total = porTipo.video + porTipo.imagem;
      setPendentes({ total, porTipo, custo: custoEstimadoDasPrevias(total) });
      return;
    }
    fetch("/api/admin/biblioteca-de-design/previas")
      .then((r) => (r.ok ? r.json() : null))
      .then((p: Pendentes | null) => p && setPendentes(p))
      .catch(() => {});
  }, [ehAdmin, designs, exemplo]);

  const lista = useMemo(() => (designs ? filtrarGaleria(designs, filtro, busca) : []), [designs, filtro, busca]);
  const contagem = useMemo(() => {
    const c: Record<Filtro, number> = { todos: designs?.length ?? 0, video: 0, imagem: 0 };
    for (const d of designs ?? []) c[d.tipo]++;
    return c;
  }, [designs]);

  async function enviarPedido() {
    if (pedido.trim().length < 12) {
      toast.error("Descreva o design com pelo menos uma frase.");
      return;
    }
    if (exemplo || !projectId) {
      toast("No exemplo nada é gravado. No projeto, o pedido entra na biblioteca com nome e descrição escritos pela IA.", { id: "biblioteca-exemplo" });
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/biblioteca-de-design`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo: tipoDoPedido, pedido: pedido.trim(), soNoMeuProjeto }) });
      const d = (await r.json().catch(() => ({}))) as { design?: DesignDaGaleria; veredito?: string; soNoProjeto?: string | null; efeito?: string; error?: string };
      if (!r.ok || !d.design) throw new Error(d.error || "Não consegui registrar o pedido.");
      const ondeFicou =
        d.soNoProjeto === "pedido-do-cliente"
          ? " Ficou só no seu projeto, como você pediu."
          : d.soNoProjeto === "so-dado-do-cliente" || d.soNoProjeto === "ficha-com-dado-do-cliente"
            ? " Ficou só no seu projeto: o pedido falava da sua marca ou de alguém, e isso não vai para a galeria."
            : d.soNoProjeto === "sem-conferencia"
              ? " Ficou só no seu projeto: não deu para conferir agora se o pedido tinha algo da sua marca."
              : "";
      const frase =
        d.veredito === "igual"
          ? `Esse design já existia na biblioteca como "${d.design.nome}": ligado ao seu projeto.`
          : d.veredito === "variacao"
            ? `Entrou como "${d.design.nome}", variação de um design que já existia.${ondeFicou}`
            : d.veredito === "repetido"
              ? `Você já tinha pedido este design: "${d.design.nome}".`
              : `Entrou como "${d.design.nome}".${ondeFicou}`;
      // O que o design faz nas artes (06/10, tarde): a imagem escrita vira o modelo das próximas artes.
      toast.success(d.efeito ? `${frase} ${d.efeito}` : frase, { duration: 8000 });
      setPedido("");
      setSoNoMeuProjeto(false);
      setEscrevendo(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui registrar o pedido.");
    } finally {
      setEnviando(false);
    }
  }

  async function usar(d: DesignDaGaleria) {
    if (exemplo || !projectId) {
      toast(`No exemplo nada é gravado. No projeto, "${d.nome}" passaria a valer para ${d.tipo === "video" ? "os próximos vídeos" : "as próximas artes"}.`, { id: "biblioteca-exemplo" });
      return;
    }
    setUsando(d.id);
    try {
      const r = await fetch(`/api/projects/${projectId}/biblioteca-de-design`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: d.id }) });
      const j = (await r.json().catch(() => ({}))) as { efeito?: string; error?: string };
      if (!r.ok) throw new Error(j.error || "Não consegui usar este design.");
      toast.success(j.efeito || "Design ligado ao projeto.", { duration: 6000 });
      setDesigns((lista) => (lista ? lista.map((x) => (x.id === d.id ? { ...x, doProjeto: true } : x)) : lista));
      setAberto(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui usar este design.");
    } finally {
      setUsando(null);
    }
  }

  async function mudarVisibilidade(d: DesignDaGaleria, publico: boolean) {
    if (exemplo || !projectId) {
      toast("No exemplo nada é gravado. No projeto, o design sai da galeria dos outros e continua no seu.", { id: "biblioteca-exemplo" });
      return;
    }
    setMudandoVisibilidade(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/biblioteca-de-design`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ designId: d.id, publico }) });
      const j = (await r.json().catch(() => ({}))) as { publico?: boolean; efeito?: string; error?: string };
      if (!r.ok) throw new Error(j.error || "Não consegui mudar onde o design aparece.");
      toast.success(j.efeito || "Feito.", { duration: 6000 });
      const novo = Boolean(j.publico);
      setDesigns((lista) => (lista ? lista.map((x) => (x.id === d.id ? { ...x, publico: novo } : x)) : lista));
      setAberto((a) => (a && a.id === d.id ? { ...a, publico: novo } : a));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui mudar onde o design aparece.");
    } finally {
      setMudandoVisibilidade(false);
    }
  }

  async function gerarPrevias() {
    if (exemplo) {
      toast("No exemplo nada é gerado. No ar, a confirmação dispara a geração pelo melhor modelo de imagem e grava o custo real de cada prévia.", { id: "biblioteca-exemplo", duration: 6000 });
      setConfirmando(false);
      return;
    }
    setGerando(true);
    try {
      const r = await fetch("/api/admin/biblioteca-de-design/previas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar: true }) });
      const d = (await r.json().catch(() => ({}))) as { geradas?: unknown[]; falhas?: unknown[]; custoUsd?: number; pendentes?: Pendentes; error?: string };
      if (!r.ok) throw new Error(d.error || "Não consegui gerar as prévias.");
      toast.success(`${d.geradas?.length ?? 0} prévias geradas por US$ ${(d.custoUsd ?? 0).toFixed(2).replace(".", ",")}${d.falhas?.length ? `; ${d.falhas.length} falharam` : ""}.`, { duration: 8000 });
      if (d.pendentes) setPendentes(d.pendentes);
      setConfirmando(false);
      await carregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui gerar as prévias.");
    } finally {
      setGerando(false);
    }
  }

  const chip = (ativo: boolean) => ({
    borderColor: ativo ? "#f97316" : "var(--border)",
    background: ativo ? "rgba(249,115,22,0.10)" : "transparent",
    color: "var(--text-primary)",
  });

  return (
    <section className="space-y-3" aria-labelledby="biblioteca-de-designs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="biblioteca-de-designs" className="flex items-center gap-2 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            <Library className="h-5 w-5 text-orange-500" />
            {titulo}
          </h2>
          <p className="mt-0.5 text-sm" style={{ color: "var(--text-muted)" }}>
            Do mais usado ao menos. Cada design nasceu de um pedido: o nosso catálogo ou o que outros clientes escreveram. Escolha um ou escreva o seu: só a descrição do visual entra aqui para todo mundo, sem o seu nome, a sua marca ou o seu contato. Se preferir, ele fica só no seu projeto.
          </p>
        </div>
        <button type="button" onClick={() => setEscrevendo((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white">
          <PenLine className="h-4 w-4" /> Escrever o meu design
        </button>
      </div>

      {escrevendo && (
        <div className="space-y-2 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}>
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            Descreva o design que você quer
          </p>
          <div className="flex gap-2">
            {(["video", "imagem"] as TipoDeDesign[]).map((t) => (
              <button key={t} type="button" onClick={() => setTipoDoPedido(t)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium" style={chip(tipoDoPedido === t)} aria-pressed={tipoDoPedido === t}>
                {t === "video" ? <Clapperboard className="h-3.5 w-3.5" /> : <ImageIcon className="h-3.5 w-3.5" />} {ROTULO_DO_TIPO[t]}
              </button>
            ))}
          </div>
          <textarea
            value={pedido}
            onChange={(e) => setPedido(e.target.value)}
            rows={4}
            maxLength={1500}
            placeholder={tipoDoPedido === "video" ? 'Ex.: "visual de clínica, claro e acolhedor, com os passos num painel de vidro ao meu lado"' : 'Ex.: "foto da obra em preto e branco com uma faixa na cor da empresa e a frase por cima"'}
            className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
            style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
          />
          <label className="flex items-start gap-2 text-xs" style={{ color: "var(--text-primary)" }}>
            <input type="checkbox" checked={soNoMeuProjeto} onChange={(e) => setSoNoMeuProjeto(e.target.checked)} className="mt-0.5 accent-orange-500" />
            <span>
              <b>Só no meu projeto.</b> <span style={{ color: "var(--text-muted)" }}>Não entra na galeria dos outros clientes. Sem marcar, só a descrição do visual entra lá: o que for da sua marca, de alguém ou de contato fica de fora.</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              A IA compara com a biblioteca, escreve o nome e a descrição e guarda a linguagem para os melhores modelos de imagem. A cor da marca entra só nos detalhes.
            </p>
            <button type="button" onClick={() => void enviarPedido()} disabled={enviando} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50">
              {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {soNoMeuProjeto ? "Guardar no meu projeto" : "Entrar na biblioteca"}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5">
          {(["todos", "video", "imagem"] as Filtro[]).map((f) => (
            <button key={f} type="button" onClick={() => setFiltro(f)} className="shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors" style={chip(filtro === f)} aria-pressed={filtro === f}>
              {ROTULO_DO_FILTRO[f]} ({contagem[f]})
            </button>
          ))}
        </div>
        <label className="relative ml-auto block min-w-[200px] flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--text-muted)" }} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, descrição ou pedido"
            aria-label="Buscar na biblioteca"
            className="w-full rounded-lg border py-1.5 pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-orange-500"
            style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
          />
        </label>
      </div>

      {ehAdmin && pendentes && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <span>
            <b style={{ color: "var(--text-primary)" }}>Admin:</b> {pendentes.total} {pendentes.total === 1 ? "prévia pendente" : "prévias pendentes"} ({pendentes.porTipo.video} de vídeo, {pendentes.porTipo.imagem} de imagem). Custo estimado: {pendentes.custo.texto}
          </span>
          {pendentes.total > 0 && !confirmando && (
            <button type="button" onClick={() => setConfirmando(true)} className="rounded-lg border px-3 py-1 font-bold" style={{ borderColor: "#f97316", color: "#f97316" }}>
              Gerar prévias pendentes
            </button>
          )}
          {confirmando && (
            <span className="flex items-center gap-2">
              <span style={{ color: "var(--text-primary)" }}>Gerar até 20 agora, pelo melhor modelo de imagem, por {pendentes.custo.texto.replace(/^.*?: /, "")}?</span>
              <button type="button" onClick={() => void gerarPrevias()} disabled={gerando} className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1 font-bold text-white disabled:opacity-50">
                {gerando && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Confirmar e gerar
              </button>
              <button type="button" onClick={() => setConfirmando(false)} className="rounded-lg border px-3 py-1" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
                Cancelar
              </button>
            </span>
          )}
        </div>
      )}

      {designs === null ? (
        <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando a biblioteca
        </div>
      ) : erro ? (
        <p className="rounded-lg border px-3 py-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          {erro}
        </p>
      ) : lista.length === 0 ? (
        <p className="rounded-lg border px-3 py-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Nenhum design com esse filtro. Escreva o seu: ele entra aqui.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {lista.map((d, i) => (
            <CartaoDoDesign key={d.id} design={d} posicao={i + 1} usando={usando === d.id} aoAbrir={() => setAberto(d)} aoUsar={() => void usar(d)} />
          ))}
        </div>
      )}

      {aberto && (
        <FichaDoDesign
          design={aberto}
          usando={usando === aberto.id}
          mudando={mudandoVisibilidade}
          aoFechar={() => setAberto(null)}
          aoUsar={() => void usar(aberto)}
          aoMudarVisibilidade={(publico) => void mudarVisibilidade(aberto, publico)}
        />
      )}
    </section>
  );
}

function Previa({ design, grande = false }: { design: DesignDaGaleria; grande?: boolean }) {
  const proporcao = design.tipo === "video" ? "aspect-video" : "aspect-[4/5]";
  if (design.previaUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={design.previaUrl} alt="" loading="lazy" className={cn("block w-full object-cover", proporcao, grande ? "max-h-[420px]" : "")} style={{ background: "var(--bg-input)" }} />;
  }
  return (
    <div className={cn("flex w-full flex-col items-center justify-center gap-1 px-3 text-center", proporcao, grande ? "max-h-[420px]" : "")} style={{ background: "var(--bg-input)", color: "var(--text-muted)" }}>
      {design.tipo === "video" ? <Clapperboard className="h-6 w-6 opacity-60" /> : <ImageIcon className="h-6 w-6 opacity-60" />}
      <span className="text-[11px] font-medium leading-tight">Prévia ainda não gerada</span>
    </div>
  );
}

function Selos({ design }: { design: DesignDaGaleria }) {
  const selo = "rounded-full px-1.5 py-0.5 text-[10px] font-bold";
  return (
    <div className="flex flex-wrap gap-1">
      <span className={selo} style={{ background: "rgba(249,115,22,0.12)", color: "#c2410c" }}>
        {rotuloDeUsos(design.usos)}
      </span>
      <span className={selo} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
        {ROTULO_DO_TIPO[design.tipo]}
      </span>
      {design.origem === "cliente" && (
        <span className={cn(selo, "inline-flex items-center gap-0.5")} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <Users className="h-3 w-3" /> {design.meu ? "Seu pedido" : "Feito por um cliente"}
        </span>
      )}
      {design.origem === "cliente" && design.meu && !design.publico && (
        <span className={selo} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          Só no seu projeto
        </span>
      )}
      {design.agrupadoEmId && (
        <span className={selo} style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          Variação
        </span>
      )}
    </div>
  );
}

function CartaoDoDesign({ design, posicao, usando, aoAbrir, aoUsar }: { design: DesignDaGaleria; posicao: number; usando: boolean; aoAbrir: () => void; aoUsar: () => void }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border" style={{ borderColor: design.doProjeto ? "#f97316" : "var(--border)", background: "var(--bg-surface)" }}>
      <button type="button" onClick={aoAbrir} className="relative block w-full text-left" aria-label={`Abrir ${design.nome}`}>
        <Previa design={design} />
        <span className="absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{ background: "rgba(0,0,0,0.6)" }}>
          #{posicao}
        </span>
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="truncate text-sm font-bold leading-tight" style={{ color: "var(--text-primary)" }} title={design.nome}>
          {design.nome}
        </p>
        <p className="line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {design.descricao}
        </p>
        <Selos design={design} />
        <div className="mt-auto flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={aoUsar}
            disabled={usando}
            className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-bold", design.doProjeto ? "border" : "bg-orange-500 text-white")}
            style={design.doProjeto ? { borderColor: "#f97316", color: "#f97316" } : undefined}
          >
            {usando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : design.doProjeto ? <Check className="h-3.5 w-3.5" /> : null}
            {design.doProjeto ? "No seu projeto" : "Usar este"}
          </button>
          <button type="button" onClick={aoAbrir} className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: "var(--text-muted)" }}>
            Ver ficha
          </button>
        </div>
      </div>
    </div>
  );
}

function FichaDoDesign({
  design,
  usando,
  mudando,
  aoFechar,
  aoUsar,
  aoMudarVisibilidade,
}: {
  design: DesignDaGaleria;
  usando: boolean;
  mudando: boolean;
  aoFechar: () => void;
  aoUsar: () => void;
  aoMudarVisibilidade: (publico: boolean) => void;
}) {
  const doAutor = design.origem === "cliente" && design.meu === true;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.55)" }} onClick={aoFechar} role="dialog" aria-modal="true" aria-label={design.nome}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="min-w-0">
            <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {design.nome}
            </h3>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {design.descricao}
            </p>
            <div className="mt-2">
              <Selos design={design} />
            </div>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-full p-1.5" style={{ color: "var(--text-muted)" }}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-hidden border-y" style={{ borderColor: "var(--border)" }}>
          <Previa design={design} grande />
        </div>
        <div className="space-y-3 p-4 text-sm">
          {/* O pedido cru só chega para quem o escreveu (ou na semente do catálogo); para os outros a rota manda vazio. */}
          {design.pedidoOriginal.trim() && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                {doAutor ? "O seu pedido, como você escreveu (só você vê)" : "O pedido, como foi escrito"}
              </p>
              <p style={{ color: "var(--text-primary)" }}>{design.pedidoOriginal}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              A linguagem que os modelos de imagem recebem (em inglês)
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              {design.linguagem}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {doAutor && (
              <button
                type="button"
                onClick={() => aoMudarVisibilidade(!design.publico)}
                disabled={mudando}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {mudando && <Loader2 className="h-4 w-4 animate-spin" />}
                {design.publico ? "Tirar da galeria" : "Pôr na galeria"}
              </button>
            )}
            <button type="button" onClick={aoUsar} disabled={usando} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
              {usando ? <Loader2 className="h-4 w-4 animate-spin" /> : design.doProjeto ? <Check className="h-4 w-4" /> : null}
              {design.doProjeto ? "Já está no seu projeto" : design.tipo === "video" ? "Usar nos meus vídeos" : "Usar nas minhas artes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
