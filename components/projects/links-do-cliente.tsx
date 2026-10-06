"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Link2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lerLinks, normalizarUrl, MAX_LINKS, TIPOS_DE_LINK, type LinkDoCliente, type TipoDeLink } from "@/lib/projeto/links-do-cliente";

/**
 * SEUS LINKS, em Configurações (03/10, pedido do Bruno).
 *
 * O cliente cadastra site, loja, produtos, afiliados, WhatsApp e agenda, com
 * rótulo, prioridade e (opcional) a chamada que prefere. Os agentes que
 * escrevem distribuem esses links onde a rede aceita link: descrição do
 * YouTube, LinkedIn pelo primeiro comentário, Facebook e X no texto. Instagram
 * e TikTok não recebem URL na legenda (não é clicável), e a bio não é mexida.
 * A regra inteira está em lib/projeto/links-do-cliente.ts.
 */
type Linha = { id: string; rotulo: string; url: string; tipo: TipoDeLink; prioridade: 1 | 2 | 3; cta: string };

const novaLinha = (): Linha => ({ id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, rotulo: "", url: "", tipo: "site", prioridade: 2, cta: "" });

const ESTILO_DO_SELECT = {
  background: "var(--bg-input)",
  borderColor: "var(--border)",
  color: "var(--text-primary)",
} as const;

export function LinksDoCliente({ projetoId, config }: { projetoId: string; config: unknown }) {
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    lerLinks(config).map((l) => ({ id: l.id, rotulo: l.rotulo, url: l.url, tipo: l.tipo, prioridade: l.prioridade, cta: l.cta ?? "" }))
  );
  const [salvando, setSalvando] = useState(false);

  const mudar = (id: string, campos: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...campos } : l)));
  const mover = (i: number, d: -1 | 1) =>
    setLinhas((ls) => {
      const j = i + d;
      if (j < 0 || j >= ls.length) return ls;
      const c = [...ls];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  async function salvar() {
    const invalidas = linhas.filter((l) => l.url.trim() && !normalizarUrl(l.url, l.tipo));
    if (invalidas.length) {
      toast.error(`Confira ${invalidas.length === 1 ? "o endereço" : "os endereços"}: ${invalidas.map((l) => l.rotulo || l.url).join(", ")}.`);
      return;
    }
    setSalvando(true);
    try {
      const links: Array<Omit<LinkDoCliente, "cta"> & { cta?: string }> = linhas
        .filter((l) => l.url.trim())
        .map((l) => ({ id: l.id, rotulo: l.rotulo, url: l.url, tipo: l.tipo, prioridade: l.prioridade, cta: l.cta || undefined }));
      const res = await fetch(`/api/projects/${projetoId}/links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ links }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Não consegui salvar.");
      setLinhas((d.links as LinkDoCliente[]).map((l) => ({ id: l.id, rotulo: l.rotulo, url: l.url, tipo: l.tipo, prioridade: l.prioridade, cta: l.cta ?? "" })));
      toast.success(d.links.length ? `${d.links.length} ${d.links.length === 1 ? "link salvo" : "links salvos"}. Os próximos textos já usam.` : "Links apagados.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-links-do-cliente>
      {linhas.length === 0 && (
        <div className="rounded-lg border border-dashed px-4 py-6 text-center text-[13px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Nenhum link ainda. Comece pelo principal: o site, a loja ou o WhatsApp de atendimento.
        </div>
      )}
      {linhas.map((l, i) => {
        const valida = !l.url.trim() || Boolean(normalizarUrl(l.url, l.tipo));
        return (
          <div key={l.id} className="flex flex-col gap-2.5 rounded-lg border p-3.5" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }} data-link={i}>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[150px_1fr_150px]">
              <select
                aria-label="Tipo do link"
                value={l.tipo}
                onChange={(e) => mudar(l.id, { tipo: e.target.value as TipoDeLink })}
                className="h-10 rounded-md border px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
                style={ESTILO_DO_SELECT}
              >
                {TIPOS_DE_LINK.map((t) => (
                  <option key={t.id} value={t.id}>{t.rotulo}</option>
                ))}
              </select>
              <Input
                aria-label="Endereço"
                value={l.url}
                onChange={(e) => mudar(l.id, { url: e.target.value })}
                placeholder={l.tipo === "whatsapp" ? "11 99999-9999 ou wa.me/55..." : "https://seusite.com.br"}
                style={valida ? undefined : { borderColor: "#f87171" }}
              />
              <select
                aria-label="Prioridade"
                value={l.prioridade}
                onChange={(e) => mudar(l.id, { prioridade: Number(e.target.value) as 1 | 2 | 3 })}
                className="h-10 rounded-md border px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
                style={ESTILO_DO_SELECT}
              >
                <option value={1}>Principal</option>
                <option value={2}>Secundário</option>
                <option value={3}>De vez em quando</option>
              </select>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1fr_1fr_auto]">
              <Input aria-label="Rótulo" value={l.rotulo} onChange={(e) => mudar(l.id, { rotulo: e.target.value })} placeholder="Rótulo (ex.: Curso de vendas)" />
              <Input aria-label="Chamada" value={l.cta} onChange={(e) => mudar(l.id, { cta: e.target.value })} placeholder="Chamada, opcional (ex.: Agende uma conversa)" />
              <div className="flex items-center gap-1 justify-end">
                <button type="button" onClick={() => mover(i, -1)} disabled={i === 0} className="p-2 rounded-md border disabled:opacity-30" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} aria-label="Subir">
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => mover(i, 1)} disabled={i === linhas.length - 1} className="p-2 rounded-md border disabled:opacity-30" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} aria-label="Descer">
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button type="button" onClick={() => setLinhas((ls) => ls.filter((x) => x.id !== l.id))} className="p-2 rounded-md border hover:text-red-400" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }} aria-label="Remover">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {!valida && <p className="text-[11px] text-red-400">Este endereço não parece um link válido.</p>}
          </div>
        );
      })}

      <div className="flex flex-col gap-3 rounded-[10px] p-4 sm:flex-row sm:items-center sm:justify-between" style={{ background: "var(--bg-elevated)" }}>
        <p className="flex items-start gap-2 text-[12.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
          <Link2 className="w-4 h-4 shrink-0 mt-0.5 text-orange-400" />
          <span>
            Vão na descrição do YouTube, no primeiro comentário do LinkedIn, no texto do Facebook e no fim da thread do X, com chamada para a ação.
            Instagram e TikTok não recebem link na legenda, e a sua bio não é mexida.
          </span>
        </p>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" onClick={() => setLinhas((ls) => [...ls, novaLinha()])} disabled={linhas.length >= MAX_LINKS}>
            <Plus className="w-4 h-4" />
            {linhas.length ? "Adicionar outro link" : "Adicionar link"}
          </Button>
          <Button loading={salvando} onClick={() => void salvar()} data-salvar-links>
            Salvar
          </Button>
        </div>
      </div>
    </div>
  );
}
