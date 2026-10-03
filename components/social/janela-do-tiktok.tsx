"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LogoTikTok } from "@/components/social/logos-redes";
// Só tipos: o módulo do TikTok roda no servidor, e `import type` some do
// pacote do navegador.
import type { InfoDoCriador, OpcoesDoTikTok, PrivacidadeDoTikTok } from "@/lib/oauth/tiktok";

/**
 * A janela de publicar no TikTok.
 *
 * Existe porque o TikTok só aprova app de publicação direta que siga as regras
 * de interface dele, e a auditoria confere cada uma no vídeo de demonstração:
 *
 * 1. mostrar o nome (e a foto) da conta que vai receber o vídeo, lido na hora;
 * 2. a pessoa escolhe quem pode ver numa lista SEM valor padrão, com as
 *    opções que a própria conta permite;
 * 3. comentário, dueto e costura começam desligados, e ficam travados quando
 *    a conta desligou no app;
 * 4. declaração de conteúdo comercial, desligada de início, com "Sua marca" e
 *    "Conteúdo de marca" e o rótulo que cada um gera;
 * 5. a frase de consentimento com os links das políticas;
 * 6. prévia do vídeo e conferência da duração máxima da conta;
 * 7. aviso de que o TikTok leva alguns minutos para processar.
 *
 * Nada aqui tem padrão escolhido pelo produto, de propósito. Uma escolha nossa
 * no lugar da pessoa é exatamente o que a auditoria reprova.
 */

export type PostParaTikTok = { id: string; content: string; imageUrl: string | null };

const ROTULO_DA_PRIVACIDADE: Record<PrivacidadeDoTikTok, string> = {
  PUBLIC_TO_EVERYONE: "Todo mundo",
  MUTUAL_FOLLOW_FRIENDS: "Amigos (quem segue você e é seguido de volta)",
  FOLLOWER_OF_CREATOR: "Seguidores",
  SELF_ONLY: "Somente eu",
};

const LINK_MUSICA = "https://www.tiktok.com/legal/page/global/music-usage-confirmation/en";
const LINK_MARCA = "https://www.tiktok.com/legal/page/global/bc-policy/en";

export function JanelaDoTikTok({
  projectId,
  posts,
  acao,
  onConcluir,
  onCancelar,
}: {
  projectId: string;
  posts: PostParaTikTok[];
  acao: "publicar" | "agendar";
  /** Chamado depois que as escolhas foram gravadas em todos os posts. */
  onConcluir: () => void;
  onCancelar: () => void;
}) {
  const [criador, setCriador] = useState<InfoDoCriador | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [privacidade, setPrivacidade] = useState<PrivacidadeDoTikTok | "">("");
  const [comentario, setComentario] = useState(false);
  const [dueto, setDueto] = useState(false);
  const [costura, setCostura] = useState(false);
  const [comercial, setComercial] = useState(false);
  const [suaMarca, setSuaMarca] = useState(false);
  const [deMarca, setDeMarca] = useState(false);
  const [duracoes, setDuracoes] = useState<Record<string, number>>({});
  const [gravando, setGravando] = useState(false);

  // Lido toda vez que a janela abre, sem cache: a regra do TikTok pede a
  // informação fresca, porque ela muda por conta e com o tempo.
  useEffect(() => {
    let vivo = true;
    fetch(`/api/social/tiktok/criador?projectId=${encodeURIComponent(projectId)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!vivo) return;
        if (!r.ok) setErro(d.error ?? "Não consegui ler a conta do TikTok.");
        else setCriador(d as InfoDoCriador);
      })
      .catch(() => vivo && setErro("Não consegui falar com o TikTok. Tente de novo."));
    return () => {
      vivo = false;
    };
  }, [projectId]);

  // Conteúdo de marca não pode ser "somente eu" (regra do TikTok). Se a
  // pessoa marcar depois de ter escolhido, a escolha cai e ela escolhe de novo,
  // em vez de o produto trocar por outra sozinho.
  const somenteEuTravado = comercial && deMarca;
  const privacidadeValida = privacidade !== "" && !(somenteEuTravado && privacidade === "SELF_ONLY");

  const longos = criador
    ? posts.filter((p) => (duracoes[p.id] ?? 0) > criador.duracaoMaximaSeg)
    : [];
  const comercialIncompleto = comercial && !suaMarca && !deMarca;
  const pode = Boolean(criador) && privacidadeValida && !comercialIncompleto && longos.length === 0 && !gravando;

  async function confirmar() {
    if (!pode || !privacidade) return;
    setGravando(true);
    setErro(null);
    const opcoes: OpcoesDoTikTok = {
      privacidade: privacidade as PrivacidadeDoTikTok,
      permitirComentario: comentario,
      permitirDueto: dueto,
      permitirCostura: costura,
      suaMarca: comercial && suaMarca,
      conteudoDeMarca: comercial && deMarca,
    };
    try {
      for (const p of posts) {
        const r = await fetch(`/api/posts/${p.id}/tiktok`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opcoes),
        });
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Não consegui gravar as escolhas.");
      }
      onConcluir();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui gravar as escolhas.");
      setGravando(false);
    }
  }

  const rotuloDoComercial = deMarca
    ? "O vídeo vai ser marcado como \"Parceria paga\"."
    : suaMarca
      ? "O vídeo vai ser marcado como \"Conteúdo promocional\"."
      : null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Publicar no TikTok"
    >
      <div
        className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border shadow-xl"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5">
            <LogoTikTok className="!w-7 !h-7" />
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {acao === "publicar" ? "Publicar no TikTok" : "Agendar no TikTok"}
            </p>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* 1. A conta que recebe o vídeo */}
          {!criador && !erro && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
              <Loader2 className="w-4 h-4 animate-spin" /> Lendo a sua conta do TikTok…
            </div>
          )}
          {criador && (
            <div className="flex items-center gap-3">
              {criador.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={criador.avatarUrl} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full" style={{ background: "var(--realce-2)" }} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                  {criador.nome || "Sua conta"}
                </p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
                  {criador.usuario ? `@${criador.usuario} · ` : ""}o vídeo vai para esta conta
                </p>
              </div>
            </div>
          )}

          {/* 6. Prévia, e a duração conferida contra o teto da conta */}
          <div className={posts.length > 1 ? "grid grid-cols-2 gap-2" : ""}>
            {posts.map((p) => (
              <div key={p.id} className="space-y-1.5">
                {p.imageUrl && (
                  <video
                    // #t=0.1 faz o navegador mostrar o primeiro quadro em vez
                    // de um retângulo preto até a pessoa apertar o play.
                    src={`${p.imageUrl}#t=0.1`}
                    controls
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                      const d = (e.currentTarget as HTMLVideoElement).duration;
                      if (Number.isFinite(d)) setDuracoes((x) => ({ ...x, [p.id]: d }));
                    }}
                    className="w-full max-h-72 rounded-xl bg-black object-contain"
                  />
                )}
                <p className="text-xs line-clamp-3" style={{ color: "var(--text-muted)" }}>{p.content}</p>
              </div>
            ))}
          </div>
          {criador && longos.length > 0 && (
            <p className="text-xs" style={{ color: "var(--badge-danger-text)" }}>
              Esta conta do TikTok aceita vídeos de até {criador.duracaoMaximaSeg} segundos, e{" "}
              {longos.length === 1 ? "este vídeo passa disso" : `${longos.length} vídeos passam disso`}. Desmarque o TikTok
              para {longos.length === 1 ? "ele" : "eles"} ou use um corte mais curto.
            </p>
          )}

          {/* 2. Quem pode ver, sem valor padrão */}
          <label className="block">
            <span className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Quem pode ver este vídeo
            </span>
            <select
              value={privacidade}
              onChange={(e) => setPrivacidade(e.target.value as PrivacidadeDoTikTok)}
              disabled={!criador}
              className="w-full rounded-lg border px-3 py-2.5 text-sm"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <option value="" disabled>
                Escolha
              </option>
              {(criador?.privacidades ?? []).map((op) => (
                <option key={op} value={op} disabled={somenteEuTravado && op === "SELF_ONLY"}>
                  {ROTULO_DA_PRIVACIDADE[op] ?? op}
                  {somenteEuTravado && op === "SELF_ONLY" ? " (indisponível para conteúdo de marca)" : ""}
                </option>
              ))}
            </select>
          </label>

          {/* 3. Interações, desligadas de início */}
          <fieldset>
            <legend className="text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
              Permitir que as pessoas
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {[
                { rotulo: "Comentem", valor: comentario, mudar: setComentario, travado: criador?.comentarioDesligado },
                { rotulo: "Façam dueto", valor: dueto, mudar: setDueto, travado: criador?.duetoDesligado },
                { rotulo: "Costurem (stitch)", valor: costura, mudar: setCostura, travado: criador?.costuraDesligada },
              ].map((i) => (
                <label
                  key={i.rotulo}
                  className={`inline-flex items-center gap-2 text-sm ${i.travado ? "opacity-50" : ""}`}
                  style={{ color: "var(--text-primary)" }}
                  title={i.travado ? "Desligado nas configurações da sua conta do TikTok" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={i.valor && !i.travado}
                    disabled={!criador || Boolean(i.travado)}
                    onChange={(e) => i.mudar(e.target.checked)}
                    className="accent-orange-500"
                  />
                  {i.rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          {/* 4. Conteúdo comercial */}
          <div className="rounded-xl border p-3.5 space-y-2.5" style={{ borderColor: "var(--border)" }}>
            <label className="flex items-start justify-between gap-3 text-sm" style={{ color: "var(--text-primary)" }}>
              <span>
                <span className="font-medium block">Divulgar conteúdo comercial</span>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Ligue se o vídeo promove você, uma marca, um produto ou um serviço.
                </span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={comercial}
                disabled={!criador}
                onChange={(e) => {
                  setComercial(e.target.checked);
                  if (!e.target.checked) {
                    setSuaMarca(false);
                    setDeMarca(false);
                  }
                }}
                className="mt-1 accent-orange-500"
              />
            </label>
            {comercial && (
              <div className="space-y-2 pl-0.5">
                <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                  <input type="checkbox" checked={suaMarca} onChange={(e) => setSuaMarca(e.target.checked)} className="mt-1 accent-orange-500" />
                  <span>
                    Sua marca
                    <span className="block text-xs" style={{ color: "var(--text-muted)" }}>Você está promovendo o seu próprio negócio.</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
                  <input
                    type="checkbox"
                    checked={deMarca}
                    onChange={(e) => {
                      setDeMarca(e.target.checked);
                      if (e.target.checked && privacidade === "SELF_ONLY") setPrivacidade("");
                    }}
                    className="mt-1 accent-orange-500"
                  />
                  <span>
                    Conteúdo de marca
                    <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
                      Você está promovendo outra marca ou um terceiro, em troca de algo.
                    </span>
                  </span>
                </label>
                {rotuloDoComercial && (
                  <p className="text-xs font-medium" style={{ color: "var(--accent-orange)" }}>{rotuloDoComercial}</p>
                )}
                {comercialIncompleto && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Marque pelo menos uma das opções para continuar.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 5. Consentimento */}
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {comercial && deMarca ? (
              <>
                Ao publicar, você concorda com a{" "}
                <a href={LINK_MARCA} target="_blank" rel="noreferrer" className="underline">Política de Conteúdo de Marca</a> e a{" "}
                <a href={LINK_MUSICA} target="_blank" rel="noreferrer" className="underline">Confirmação de Uso de Música</a> do TikTok.
              </>
            ) : (
              <>
                Ao publicar, você concorda com a{" "}
                <a href={LINK_MUSICA} target="_blank" rel="noreferrer" className="underline">Confirmação de Uso de Música</a> do TikTok.
              </>
            )}
          </p>

          {/* 7. O que acontece depois */}
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {acao === "publicar"
              ? "Depois de enviado, o TikTok leva alguns minutos para processar o vídeo antes de ele aparecer no seu perfil."
              : "No horário agendado o vídeo é enviado com estas escolhas, e o TikTok leva alguns minutos para processar antes de ele aparecer no seu perfil."}
          </p>

          {erro && (
            <p className="text-sm" style={{ color: "var(--badge-danger-text)" }}>{erro}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t" style={{ borderColor: "var(--border)" }}>
          <Button variant="outline" onClick={onCancelar} disabled={gravando}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!pode}>
            {gravando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {acao === "publicar" ? "Publicar no TikTok" : "Agendar no TikTok"}
          </Button>
        </div>
      </div>
    </div>
  );
}
