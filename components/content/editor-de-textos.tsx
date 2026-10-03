"use client";

import { useState } from "react";
import { Loader2, Pencil, Sparkles, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import { RedeIcone } from "@/components/social/rede-icone";
import { separarCampos, juntarCampos, limparHashtags, ROTULO_DO_CAMPO, type CampoDoTexto, type CamposDoTexto } from "@/lib/posts/campos-do-texto";
import { CREDIT_COSTS } from "@/lib/credits/tabela";

/**
 * OS TEXTOS DA PEÇA, EDITÁVEIS NO CARD (03/10, pedido do Bruno).
 *
 * Cada rede da peça mostra os campos dela: título e descrição no YouTube,
 * legenda nas outras, e as hashtags em todas. O cliente troca uma palavra,
 * reescreve à mão ou pede à IA (com instrução opcional). A IA só SUGERE: o
 * texto dela entra no campo, e quem grava é o "Salvar", depois de ler.
 * Post publicado não se edita aqui: o texto da rede já saiu.
 *
 * A divisão em campos e a volta para um texto só moram em
 * lib/posts/campos-do-texto.ts, a mesma regra que o publicador do YouTube lê
 * (primeira linha é o título).
 */
export type PostDoEditor = { id: string; platform: string; content: string; status: string };

const NOME: Record<string, string> = {
  linkedin: "LinkedIn", twitter: "X", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok", youtube: "YouTube",
};

export function EditorDeTextos({ posts, aoSalvar }: { posts: PostDoEditor[]; aoSalvar: (id: string, conteudo: string) => void }) {
  const vivos = posts.filter((p) => !["cancelled", "rejected"].includes(p.status));
  const [aberto, setAberto] = useState<string | null>(null);
  if (vivos.length === 0) return null;
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)" }} data-editor-de-textos>
      <div className="px-4 py-2.5" style={{ background: "var(--bg-elevated)", borderBottom: "1px solid var(--border)" }}>
        <p className="text-xs font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
          <Pencil className="w-3.5 h-3.5 text-orange-400" />
          Textos desta peça
        </p>
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
          Abra a rede para trocar uma palavra, reescrever à mão ou pedir para a IA reescrever.
        </p>
      </div>
      {vivos.map((p) => (
        <TextoDaRede key={p.id} post={p} aberto={aberto === p.id} aoAbrir={() => setAberto(aberto === p.id ? null : p.id)} aoSalvar={aoSalvar} />
      ))}
    </div>
  );
}

function TextoDaRede({ post, aberto, aoAbrir, aoSalvar }: { post: PostDoEditor; aberto: boolean; aoAbrir: () => void; aoSalvar: (id: string, conteudo: string) => void }) {
  const original = separarCampos(post.content, post.platform);
  const [campos, setCampos] = useState<CamposDoTexto>(original);
  const [salvando, setSalvando] = useState(false);
  const publicado = post.status === "published" || post.status === "publishing";
  const mudou = juntarCampos(campos, post.platform) !== juntarCampos(original, post.platform);
  const resumo = (original.titulo || original.corpo).split("\n")[0].slice(0, 80);

  async function salvar() {
    setSalvando(true);
    try {
      const conteudo = juntarCampos(campos, post.platform);
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: conteudo }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Não consegui salvar.");
      aoSalvar(post.id, conteudo);
      toast.success(`Texto do ${NOME[post.platform] ?? post.platform} salvo. É esta versão que vai ao ar.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const camposDaRede: Array<{ campo: CampoDoTexto; valor: string; linhas: number; mudar: (v: string) => void }> = [
    ...(post.platform === "youtube"
      ? [{ campo: "titulo" as const, valor: campos.titulo ?? "", linhas: 1, mudar: (v: string) => setCampos({ ...campos, titulo: v }) }]
      : []),
    {
      campo: post.platform === "youtube" ? ("descricao" as const) : ("legenda" as const),
      valor: campos.corpo,
      linhas: 7,
      mudar: (v: string) => setCampos({ ...campos, corpo: v }),
    },
    { campo: "hashtags" as const, valor: campos.hashtags, linhas: 1, mudar: (v: string) => setCampos({ ...campos, hashtags: v }) },
  ];

  return (
    <div style={{ background: "var(--bg-primary)", borderBottom: "1px solid var(--border)" }} data-texto-da-rede={post.platform}>
      <button type="button" onClick={aoAbrir} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left hover:bg-[var(--realce-1)]">
        <RedeIcone plataforma={post.platform} className="w-4 h-4 shrink-0" />
        <span className="text-xs font-semibold shrink-0" style={{ color: "var(--text-primary)" }}>{NOME[post.platform] ?? post.platform}</span>
        <span className="text-[11px] truncate flex-1 min-w-0" style={{ color: "var(--text-muted)" }}>{resumo || "sem texto"}</span>
        <span className="text-[10px] font-semibold text-orange-400 shrink-0">{aberto ? "Fechar" : publicado ? "Ver" : "Editar"}</span>
      </button>
      {aberto && (
        <div className="px-4 pb-3 space-y-3">
          {publicado && (
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>Este post já foi publicado: o texto na rede não muda mais por aqui.</p>
          )}
          {camposDaRede.map((c) => (
            <CampoEditavel
              key={c.campo}
              postId={post.id}
              campo={c.campo}
              valor={c.valor}
              linhas={c.linhas}
              somenteLeitura={publicado}
              contexto={juntarCampos(campos, post.platform)}
              aoMudar={c.mudar}
            />
          ))}
          {!publicado && (
            <div className="flex items-center justify-end gap-2">
              {mudou && (
                <button
                  type="button"
                  onClick={() => setCampos(original)}
                  className="text-xs px-3 py-1.5 rounded-lg border"
                  style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  Desfazer
                </button>
              )}
              <button
                type="button"
                data-salvar-texto
                disabled={!mudou || salvando}
                onClick={() => void salvar()}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-orange-500 text-white disabled:opacity-40"
              >
                {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Salvar texto
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CampoEditavel({
  postId,
  campo,
  valor,
  linhas,
  somenteLeitura,
  contexto,
  aoMudar,
}: {
  postId: string;
  campo: CampoDoTexto;
  valor: string;
  linhas: number;
  somenteLeitura: boolean;
  contexto: string;
  aoMudar: (v: string) => void;
}) {
  const [pedindo, setPedindo] = useState(false);
  const [instrucao, setInstrucao] = useState("");
  const [reescrevendo, setReescrevendo] = useState(false);
  const custo = CREDIT_COSTS.post_text;

  async function reescrever() {
    setReescrevendo(true);
    try {
      const res = await fetch(`/api/posts/${postId}/reescrever`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campo, texto: valor, instrucao, contexto }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Não consegui reescrever.");
      aoMudar(d.texto);
      setPedindo(false);
      setInstrucao("");
      toast.success(`${ROTULO_DO_CAMPO[campo]} reescrito. Leia e clique em Salvar texto para valer.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui reescrever.");
    } finally {
      setReescrevendo(false);
    }
  }

  return (
    <div className="space-y-1" data-campo={campo}>
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold" style={{ color: "var(--text-muted)" }}>{ROTULO_DO_CAMPO[campo]}</label>
        {!somenteLeitura && (
          <button
            type="button"
            onClick={() => setPedindo(!pedindo)}
            className="flex items-center gap-1 text-[11px] font-medium text-orange-400 hover:underline"
            data-pedir-ia={campo}
          >
            <Sparkles className="w-3 h-3" />
            Pedir para a IA reescrever
          </button>
        )}
      </div>
      {linhas === 1 ? (
        <input
          value={valor}
          readOnly={somenteLeitura}
          onChange={(e) => aoMudar(e.target.value)}
          onBlur={(e) => campo === "hashtags" && aoMudar(limparHashtags(e.target.value))}
          placeholder={campo === "hashtags" ? "#marketing #vendas" : undefined}
          className="w-full text-sm px-3 py-2 rounded-lg border outline-none focus:border-orange-500/60"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
      ) : (
        <textarea
          value={valor}
          readOnly={somenteLeitura}
          onChange={(e) => aoMudar(e.target.value)}
          rows={linhas}
          className="w-full text-sm px-3 py-2 rounded-lg border outline-none resize-y leading-relaxed focus:border-orange-500/60"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
      )}
      {pedindo && !somenteLeitura && (
        <div className="flex flex-col sm:flex-row gap-2 rounded-lg border p-2" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
          <input
            value={instrucao}
            onChange={(e) => setInstrucao(e.target.value)}
            placeholder="Instrução opcional: mais curto, sem pergunta no fim, tom mais direto..."
            className="flex-1 min-w-0 text-xs px-2.5 py-1.5 rounded-md border outline-none"
            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && !reescrevendo && void reescrever()}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={reescrevendo}
              onClick={() => void reescrever()}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-md bg-orange-500 text-white disabled:opacity-50 whitespace-nowrap"
              data-reescrever={campo}
            >
              {reescrevendo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
              Reescrever · {custo} créditos
            </button>
            <button type="button" onClick={() => setPedindo(false)} className="p-1.5 rounded-md border" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} aria-label="Fechar">
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
