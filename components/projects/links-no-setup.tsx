"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Link2, Loader2, Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LOGO_POR_REDE } from "@/components/social/logos-redes";
import { MAX_LINKS, normalizarArrobaDoYouTube, normalizarUrl, tipoPeloEndereco, type LinkDoCliente } from "@/lib/projeto/links-do-cliente";

/**
 * OS LINKS NO INÍCIO DO PROJETO (06/10, pedido do Bruno).
 *
 * Na primeira etapa do setup, junto das redes, o cliente cadastra quantas
 * páginas quiser (site, empresa, produto, WhatsApp, loja), UMA DE CADA VEZ:
 * nome e endereço, "Adicionar outro link" e remover cada um. Vão para o mesmo
 * lugar que Configurações usa (`Project.config.linksDoCliente`, pela rota
 * /api/projects/[id]/links) e dali entram sozinhos nas descrições
 * (lib/media/elo-da-campanha.ts). Depois, adicionar ou remover é em
 * Configurações, aba Seus links.
 *
 * Grava sozinho, um instante depois de a pessoa parar de digitar: no setup
 * ninguém lembra de um botão Salvar antes do Próximo. A lista parte do que
 * está NO BANCO (GET da rota), e não do projeto de quando a página abriu, para
 * nunca devolver um link já apagado. O que o cliente já tinha cadastrado com
 * tipo, prioridade e chamada mantém tudo isso; só nome e endereço aparecem aqui.
 */
type Linha = { id: string; rotulo: string; url: string; original?: LinkDoCliente };

const novaLinha = (): Linha => ({ id: `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, rotulo: "", url: "" });

/** O que vai para a rota: só as linhas com endereço válido. */
function paraGravar(linhas: Linha[]): Array<Partial<LinkDoCliente>> {
  const temPrincipal = linhas.some((l) => l.original?.prioridade === 1);
  let primeiro = !temPrincipal;
  return linhas
    .filter((l) => l.url.trim() && normalizarUrl(l.url, tipoPeloEndereco(l.url)))
    .map((l) => {
      // O tipo escolhido em Configurações (site, loja, agenda...) fica; o que
      // veio só do endereço acompanha o endereço quando ele muda.
      const tipoDoOriginal = l.original?.tipo;
      const tipo = tipoDoOriginal && tipoDoOriginal !== "outro" && tipoDoOriginal !== "whatsapp" ? tipoDoOriginal : tipoPeloEndereco(l.url);
      // Sem principal na lista, o primeiro link vira o principal: é ele que vai
      // primeiro na descrição e no primeiro comentário do LinkedIn.
      const prioridade = l.original?.prioridade ?? (primeiro ? 1 : 2);
      primeiro = false;
      return {
        id: l.id,
        rotulo: l.rotulo.trim() || l.original?.rotulo || "",
        url: l.url.trim(),
        tipo,
        prioridade,
        ...(l.original?.cta ? { cta: l.original.cta } : {}),
      };
    });
}

export function LinksNoSetup({ projetoId, podeEditar = true }: { projetoId: string; podeEditar?: boolean }) {
  const [linhas, setLinhas] = useState<Linha[] | null>(null);
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo" | "erro">("parado");
  const ultimoEnviado = useRef<string>("");

  useEffect(() => {
    fetch(`/api/projects/${projetoId}/links`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { links?: LinkDoCliente[] } | null) => {
        const ls = (d?.links ?? []).map((l) => ({ id: l.id, rotulo: l.rotulo, url: l.url, original: l }));
        ultimoEnviado.current = JSON.stringify(paraGravar(ls));
        setLinhas(ls.length ? ls : [novaLinha()]);
      })
      .catch(() => setLinhas([novaLinha()]));
  }, [projetoId]);

  const gravar = useCallback(
    async (ls: Linha[]) => {
      const links = paraGravar(ls);
      const chave = JSON.stringify(links);
      if (chave === ultimoEnviado.current) return;
      setEstado("salvando");
      try {
        const r = await fetch(`/api/projects/${projetoId}/links`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ links }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Não consegui salvar os links.");
        ultimoEnviado.current = chave;
        // O que voltou gravado vira a base das linhas (tipo e prioridade inclusive).
        const gravados = new Map((d.links as LinkDoCliente[]).map((l) => [l.id, l]));
        setLinhas((atuais) => (atuais ?? []).map((l) => (gravados.has(l.id) ? { ...l, original: gravados.get(l.id) } : l)));
        setEstado("salvo");
      } catch (e) {
        setEstado("erro");
        toast.error(e instanceof Error ? e.message : "Não consegui salvar os links.");
      }
    },
    [projetoId]
  );

  // Grava um instante depois da última mudança.
  useEffect(() => {
    if (!linhas || !podeEditar) return;
    const t = window.setTimeout(() => void gravar(linhas), 900);
    return () => window.clearTimeout(t);
  }, [linhas, gravar, podeEditar]);

  const mudar = (id: string, campos: Partial<Linha>) => setLinhas((ls) => (ls ?? []).map((l) => (l.id === id ? { ...l, ...campos } : l)));

  if (!linhas) {
    return (
      <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando os seus links...
      </p>
    );
  }

  return (
    <div className="space-y-2.5" data-links-no-setup>
      {linhas.map((l, i) => {
        const valida = !l.url.trim() || Boolean(normalizarUrl(l.url, tipoPeloEndereco(l.url)));
        return (
          <div key={l.id} className="space-y-1" data-link-setup={i}>
            <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[minmax(0,200px)_1fr_auto]">
              <Input
                aria-label="Nome do link"
                value={l.rotulo}
                onChange={(e) => mudar(l.id, { rotulo: e.target.value })}
                placeholder="Nome (ex.: Loja, WhatsApp)"
                disabled={!podeEditar}
                className="col-span-2 sm:col-span-1"
              />
              <Input
                aria-label="Endereço do link"
                value={l.url}
                onChange={(e) => mudar(l.id, { url: e.target.value })}
                onBlur={() => {
                  // Sem https, a tela completa: "minhaloja.com.br" vira o endereço inteiro.
                  const n = normalizarUrl(l.url, tipoPeloEndereco(l.url));
                  if (n && n !== l.url.trim()) mudar(l.id, { url: n });
                }}
                placeholder="seusite.com.br ou wa.me/5511999999999"
                disabled={!podeEditar}
                style={valida ? undefined : { borderColor: "#f87171" }}
              />
              <button
                type="button"
                onClick={() => setLinhas((ls) => {
                  const resto = (ls ?? []).filter((x) => x.id !== l.id);
                  return resto.length ? resto : [novaLinha()];
                })}
                disabled={!podeEditar}
                className="flex h-10 w-10 items-center justify-center rounded-md border hover:text-red-400 disabled:opacity-40"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                aria-label="Remover este link"
                title="Remover este link"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {!valida && <p className="text-[11px] text-red-400">Este endereço não parece um link. Confira se está completo.</p>}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setLinhas((ls) => [...(ls ?? []), novaLinha()])}
          disabled={!podeEditar || linhas.length >= MAX_LINKS || linhas.some((l) => !l.url.trim())}
          data-adicionar-link
        >
          <Plus className="h-4 w-4" />
          Adicionar outro link
        </Button>
        <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
          {estado === "salvando" && (
            <>
              <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
            </>
          )}
          {estado === "salvo" && (
            <>
              <Check className="h-3 w-3 text-green-500" /> Salvo. Os próximos textos já usam.
            </>
          )}
          {estado === "erro" && "Não salvou. Confira os endereços."}
        </span>
      </div>
    </div>
  );
}

/**
 * O @ DO CANAL NO YOUTUBE (06/10). A conexão do YouTube grava o nome do canal,
 * não o @, e sem o @ a descrição não consegue mostrar o endereço do canal. Este
 * campo aparece só quando há conta do YouTube conectada sem @ (ou quando o @
 * já foi escrito, para poder trocar), e grava em `config.arrobaDoYouTube`.
 */
export function ArrobaDoYouTube({ projetoId, podeEditar = true }: { projetoId: string; podeEditar?: boolean }) {
  const [canal, setCanal] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(false);
  const [valor, setValor] = useState("");
  const gravado = useRef("");
  const [estado, setEstado] = useState<"parado" | "salvando" | "salvo">("parado");

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetch(`/api/social/connect?projectId=${projetoId}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/projects/${projetoId}/links`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([contas, links]) => {
      if (!vivo) return;
      const yt = ((contas?.storedAccounts ?? []) as Array<{ platform: string; username: string | null; displayName: string | null }>).filter(
        (c) => c.platform === "youtube"
      );
      const semArroba = yt.find((c) => !(c.username ?? "").trim().startsWith("@"));
      const atual = (links?.arrobaDoYouTube as string | null) ?? "";
      gravado.current = atual;
      setValor(atual ? `@${atual}` : "");
      setCanal(semArroba ? (semArroba.displayName ?? semArroba.username ?? null) : null);
      setMostrar(Boolean(semArroba) || Boolean(atual));
    });
    return () => {
      vivo = false;
    };
  }, [projetoId]);

  const salvar = async () => {
    const bruto = valor.trim();
    const arroba = bruto ? normalizarArrobaDoYouTube(bruto) : "";
    if (bruto && !arroba) {
      toast.error("Esse @ não parece o de um canal. Escreva como aparece no YouTube, por exemplo @seucanal.");
      return;
    }
    if ((arroba ?? "") === gravado.current) return;
    setEstado("salvando");
    try {
      const r = await fetch(`/api/projects/${projetoId}/links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ arrobaDoYouTube: arroba ?? "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error ?? "Não consegui salvar o @.");
      gravado.current = d.arrobaDoYouTube ?? "";
      setValor(d.arrobaDoYouTube ? `@${d.arrobaDoYouTube}` : "");
      setEstado("salvo");
    } catch (e) {
      setEstado("parado");
      toast.error(e instanceof Error ? e.message : "Não consegui salvar o @.");
    }
  };

  if (!mostrar) return null;
  const Logo = LOGO_POR_REDE.youtube;
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }} data-arroba-do-youtube>
      <div className="flex items-start gap-3">
        <Logo />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-xs font-medium text-[var(--text-primary)]">@ do seu canal no YouTube (opcional)</p>
          <p className="text-[11px] leading-snug text-[var(--text-muted)]">
            {canal ? `O YouTube conectou o canal "${canal}" pelo nome, sem o @.` : "O YouTube conectou o canal pelo nome, sem o @."} Com o @, as descrições
            mostram o endereço do seu canal.
          </p>
          <div className="flex items-center gap-2">
            <Input
              aria-label="@ do seu canal no YouTube"
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setEstado("parado");
              }}
              onBlur={() => void salvar()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void salvar();
              }}
              placeholder="@seucanal"
              disabled={!podeEditar}
              className="max-w-[260px]"
            />
            {estado === "salvando" && <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />}
            {estado === "salvo" && <Check className="h-3.5 w-3.5 text-green-500" />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** O cabeçalho da seção de links na primeira etapa do setup. */
export function SecaoDeLinksNoSetup({ projetoId, podeEditar = true }: { projetoId: string; podeEditar?: boolean }) {
  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
          <Link2 className="h-4 w-4 text-orange-400" />
          Seus links (opcional)
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Além das redes, coloque as páginas para onde quer levar quem lê: site, empresa, produtos, WhatsApp, loja. Um de cada vez, quantos quiser. Eles
          entram sozinhos nas descrições dos posts. Pode pular; depois é só ir em Configurações, Seus links, para adicionar ou remover.
        </p>
      </div>
      <ArrobaDoYouTube projetoId={projetoId} podeEditar={podeEditar} />
      <LinksNoSetup projetoId={projetoId} podeEditar={podeEditar} />
    </section>
  );
}
