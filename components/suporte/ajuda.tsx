"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckCircle2, ImagePlus, LifeBuoy, MessageCircle, X } from "lucide-react";
import { EVENTO_DA_AJUDA, type PedidoDeChamado } from "@/lib/suporte/abrir-chamado";
import {
  CATEGORIAS,
  NOME_DA_CATEGORIA,
  PRINT_MAXIMO,
  TEXTO_MAXIMO,
  TIPOS_DO_PRINT,
  contextoDoEndereco,
  type Categoria,
} from "@/lib/suporte/regras";

/**
 * A JANELA DE AJUDA (02/10/2026), montada uma vez no esqueleto da plataforma.
 *
 * Pedido para a segunda dos 10 vendedores: pedir ajuda e falar com uma pessoa
 * tem que ser rápido. Por isso a janela pede só três coisas (o que aconteceu,
 * a categoria e, se quiser, um print) e junta sozinha o resto: a página, o
 * projeto, o vídeo ou o post abertos e o navegador. Plano e e-mail o servidor
 * lê da conta, sem confiar no navegador.
 *
 * Abre pelo botão flutuante, pelo item "Ajuda" do menu e pelo evento de
 * lib/suporte/abrir-chamado.ts (o cartão de erro abre já com o código).
 * Não importa nada que toque o banco.
 */

type Enviado = { protocolo: string; whatsapp: string | null; respostaDoDev: string | null };

export function Ajuda() {
  const pathname = usePathname();
  const [aberta, setAberta] = useState(false);
  const [categoria, setCategoria] = useState<Categoria | null>(null);
  const [texto, setTexto] = useState("");
  const [codigo, setCodigo] = useState<string | null>(null);
  const [postId, setPostId] = useState<string | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [print, setPrint] = useState<File | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState<Enviado | null>(null);
  const aoAbrir = useRef<PedidoDeChamado["aoAbrir"]>(undefined);
  const isca = useRef<HTMLInputElement>(null);
  const campoDoTexto = useRef<HTMLTextAreaElement>(null);

  const abrir = useCallback((p: PedidoDeChamado = {}) => {
    setEnviado(null);
    setErro(null);
    setPrint(null);
    setCategoria(p.categoria ?? (p.codigo ? "problema" : null));
    setCodigo(p.codigo ?? null);
    setPostId(p.postId ?? null);
    setVideoId(p.videoId ?? null);
    setTexto(p.texto ?? (p.codigo ? `Apareceu o código ${p.codigo} na tela. ` : ""));
    aoAbrir.current = p.aoAbrir;
    setAberta(true);
  }, []);

  useEffect(() => {
    const ouvir = (e: Event) => abrir((e as CustomEvent<PedidoDeChamado>).detail ?? {});
    window.addEventListener(EVENTO_DA_AJUDA, ouvir);
    return () => window.removeEventListener(EVENTO_DA_AJUDA, ouvir);
  }, [abrir]);

  useEffect(() => {
    if (!aberta) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };
    window.addEventListener("keydown", aoTeclar);
    const t = setTimeout(() => campoDoTexto.current?.focus(), 50);
    return () => {
      window.removeEventListener("keydown", aoTeclar);
      clearTimeout(t);
    };
  }, [aberta]);

  function escolherPrint(f: File | null) {
    setErro(null);
    if (!f) return setPrint(null);
    if (!TIPOS_DO_PRINT.includes(f.type)) return setErro("O print precisa ser PNG, JPG ou WEBP.");
    if (f.size > PRINT_MAXIMO) return setErro("O print pode ter no máximo 4 MB.");
    setPrint(f);
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!categoria) return setErro("Escolha a categoria.");
    if (texto.trim().length < 5) return setErro("Conte em poucas palavras o que aconteceu.");
    setEnviando(true);
    try {
      const doEndereco = contextoDoEndereco(window.location.pathname, window.location.search);
      const fd = new FormData();
      fd.set("categoria", categoria);
      fd.set("texto", texto.trim());
      if (codigo) fd.set("codigo", codigo);
      if (postId) fd.set("postId", postId);
      fd.set("site", isca.current?.value ?? "");
      fd.set(
        "contexto",
        JSON.stringify({
          pagina: window.location.pathname + window.location.search,
          ...doEndereco,
          postId: postId ?? doEndereco.postId,
          videoId: videoId ?? doEndereco.videoId,
          navegador: navigator.userAgent,
          tela: `${window.innerWidth}x${window.innerHeight}`,
        })
      );
      if (print) fd.set("print", print);
      const r = await fetch("/api/suporte/chamados", { method: "POST", body: fd });
      const d = (await r.json().catch(() => ({}))) as { protocolo?: string; whatsapp?: string | null; respostaDoDev?: string | null; error?: string };
      if (!r.ok || !d.protocolo) throw new Error(d.error ?? "Não consegui enviar o chamado. Tente de novo.");
      setEnviado({ protocolo: d.protocolo, whatsapp: d.whatsapp ?? null, respostaDoDev: d.respostaDoDev ?? null });
      aoAbrir.current?.(d.protocolo);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui enviar o chamado.");
    } finally {
      setEnviando(false);
    }
  }

  // Na página "Meus chamados" o botão flutuante sobra: a página já é a ajuda.
  const semFlutuante = pathname === "/chamados";

  return (
    <>
      {!semFlutuante && (
        <button
          type="button"
          onClick={() => abrir()}
          data-ajuda-flutuante
          aria-label="Ajuda: abrir um chamado"
          title="Precisa de ajuda? Abra um chamado"
          className="fixed bottom-4 right-4 z-30 inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold shadow-lg transition-colors hover:bg-[var(--realce-2)] print:hidden"
          style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          <LifeBuoy className="h-4 w-4" style={{ color: "var(--marca-laranja-botao)" }} />
          <span>Ajuda</span>
        </button>
      )}

      {aberta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4" role="presentation">
          <button type="button" aria-label="Fechar" className="absolute inset-0 bg-[#02162a]/60" onClick={() => setAberta(false)} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ajuda-titulo"
            className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border p-5 shadow-2xl"
            style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
          >
            <button
              type="button"
              onClick={() => setAberta(false)}
              aria-label="Fechar"
              className="absolute right-3 top-3 rounded-lg p-2 hover:bg-[var(--realce-2)]"
              style={{ color: "var(--text-muted)" }}
            >
              <X className="h-4 w-4" />
            </button>

            {enviado ? (
              <div className="text-center py-2" data-chamado-enviado={enviado.protocolo}>
                <CheckCircle2 className="mx-auto h-10 w-10" style={{ color: "var(--badge-success-text)" }} />
                <h2 id="ajuda-titulo" className="mt-3 text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
                  Chamado {enviado.protocolo} aberto
                </h2>
                <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                  {enviado.respostaDoDev ? "Entrou na fila de melhoria do produto." : "Recebemos o seu pedido."} A resposta chega por e-mail e fica em Meus chamados.
                  {enviado.whatsapp ? " Se for urgente, fale agora com uma pessoa pelo WhatsApp:" : ""}
                </p>
                {/* O chamado direto no Dev (06/10): o Davi responde na hora. */}
                {enviado.respostaDoDev && (
                  <p
                    data-resposta-do-dev
                    className="mt-3 rounded-xl border px-3 py-2 text-left text-xs leading-relaxed"
                    style={{ borderColor: "color-mix(in srgb, #0f766e 45%, transparent)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                  >
                    <b style={{ color: "#0f766e" }}>Davi Dev:</b> {enviado.respostaDoDev}
                  </p>
                )}
                <div className="mt-5 flex flex-col gap-2">
                  {enviado.whatsapp && (
                    <a
                      href={enviado.whatsapp}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                      style={{ background: "#1f8f4e" }}
                    >
                      <MessageCircle className="h-4 w-4" />
                      Falar no WhatsApp agora
                    </a>
                  )}
                  <Link
                    href="/chamados"
                    onClick={() => setAberta(false)}
                    className="rounded-xl border px-4 py-2.5 text-sm font-semibold hover:bg-[var(--realce-2)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    Ver meus chamados
                  </Link>
                  <button type="button" onClick={() => setAberta(false)} className="text-sm py-1" style={{ color: "var(--text-muted)" }}>
                    Fechar
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={enviar} noValidate>
                <h2 id="ajuda-titulo" className="text-lg font-semibold pr-8" style={{ color: "var(--text-primary)" }}>
                  Como podemos ajudar?
                </h2>
                <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Uma pessoa do nosso time lê cada chamado. Você recebe um número e a resposta por e-mail.
                </p>

                <fieldset className="mt-4">
                  <legend className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    Sobre o quê?
                  </legend>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {CATEGORIAS.map((c) => {
                      const ativa = categoria === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={ativa}
                          onClick={() => setCategoria(c)}
                          className={`rounded-xl border px-3 py-2 text-sm font-medium text-left transition-colors ${ativa ? "text-white" : "hover:bg-[var(--realce-2)]"}`}
                          style={{
                            borderColor: ativa ? "transparent" : "var(--border)",
                            background: ativa ? "var(--acento-forte)" : "var(--bg-input)",
                            color: ativa ? "#ffffff" : "var(--text-primary)",
                          }}
                        >
                          {NOME_DA_CATEGORIA[c]}
                        </button>
                      );
                    })}
                  </div>
                  {categoria === "melhoria" && (
                    <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      Vai direto para o Davi, dev da Demandou: conte o que a plataforma fez de errado ou o que faria o produto melhor para você. Ajuste de uma peça só é mais rápido pelo chat da própria peça.
                    </p>
                  )}
                </fieldset>

                <label className="mt-4 block text-sm font-medium" style={{ color: "var(--text-primary)" }} htmlFor="ajuda-texto">
                  O que aconteceu?
                </label>
                {codigo && (
                  <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
                    Código do erro: <b className="font-mono">{codigo}</b> (vai junto, com o detalhe técnico, para o nosso time)
                  </p>
                )}
                <textarea
                  id="ajuda-texto"
                  ref={campoDoTexto}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  maxLength={TEXTO_MAXIMO}
                  rows={4}
                  placeholder="Ex.: cliquei em publicar e o post do Instagram não saiu."
                  className="mt-1.5 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
                />

                {/* O campo isca: invisível para gente (e para leitor de tela), robô preenche. */}
                <input ref={isca} type="text" name="site" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 opacity-0" />

                <div className="mt-3">
                  <label
                    className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-sm hover:bg-[var(--realce-2)]"
                    style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
                  >
                    <ImagePlus className="h-4 w-4" />
                    <span className="truncate max-w-[16rem]">{print ? print.name : "Anexar print (opcional)"}</span>
                    <input type="file" accept={TIPOS_DO_PRINT.join(",")} className="sr-only" onChange={(e) => escolherPrint(e.target.files?.[0] ?? null)} />
                  </label>
                  {print && (
                    <button type="button" onClick={() => setPrint(null)} className="ml-2 text-xs underline" style={{ color: "var(--text-muted)" }}>
                      tirar
                    </button>
                  )}
                </div>

                <p className="mt-3 text-[11px]" style={{ color: "var(--text-muted)" }}>
                  Junto vão a página em que você está, o projeto, o vídeo ou o post abertos, o navegador, o seu plano e o seu e-mail, para não precisarmos perguntar.
                </p>

                {erro && (
                  <p role="alert" className="mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(185,28,28,0.08)", color: "var(--badge-danger-text)" }}>
                    {erro}
                  </p>
                )}

                <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <Link href="/chamados" onClick={() => setAberta(false)} className="text-sm text-center" style={{ color: "var(--text-muted)" }}>
                    Ver meus chamados
                  </Link>
                  <button
                    type="submit"
                    disabled={enviando}
                    className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                    style={{ background: "var(--marca-laranja-botao)" }}
                  >
                    {enviando ? "Enviando..." : "Enviar chamado"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
