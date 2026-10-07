"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Check, Clapperboard, Library, Loader2, Palette, Pencil, RefreshCw, Wand2 } from "lucide-react";
import { GaleriaDaBiblioteca } from "@/components/biblioteca-de-design/galeria-da-biblioteca";
import { CriarEstilo } from "@/components/estilo-dos-posts/criar-estilo";
import type { DesignDaGaleria } from "@/lib/biblioteca-de-design/tipos";
import { CATALOGO_DE_ESTILOS, estiloEmDestaque } from "@/lib/media/catalogo-de-estilos";
import { modeloPorId } from "@/lib/modelos-de-arte/catalogo";
import {
  designServeAoPost,
  escolhaDoDesign,
  modeloServeAoPost,
  oQueOPostPede,
  padraoDaImagemDoEstado,
  postsSemModelo,
  preencherModelos,
  ROTULO_DO_POST,
  type EstadoDoEstiloDosPosts,
  type ModeloDoPost,
  type ModelosDosPosts,
  type PostVisual,
} from "@/lib/estilo-dos-posts/tipos";

/**
 * O MODELO DE CADA POST (08/10/2026).
 *
 * Decisão do Bruno, literal: "o modelo precisa ser escolhido por post (quarta
 * é um carrossel, precisa escolher o modelo), quinta é uma foto (escolher
 * modelo) etc... sexta é um vídeo curto (short, reel e tiktok) escolher o
 * estilo". E: "essa parte só cria o modelo, depois no quadro a IA coloca o
 * conteúdo dentro do modelo selecionado ou criado".
 *
 * Uma linha por dia com peça visual, dizendo o tipo do post e o modelo dele:
 *   - foto e carrossel: o modelo de arte. A primeira porta é CRIAR o seu
 *     (falando ou escrevendo, components/estilo-dos-posts/criar-estilo.tsx),
 *     a alternativa é a biblioteca, só com os modelos que servem àquele tipo;
 *   - vídeo curto (Shorts, Reels, TikTok): o estilo de edição, do mesmo
 *     catálogo que a jornada do vídeo já usa;
 *   - infográfico e vídeo por IA: não há modelo a escolher, e a linha diz
 *     que o dia sai nas cores e na letra da marca.
 * Cada dia vem PREENCHIDO com o último modelo usado naquele tipo de post
 * (senão o estilo dos posts do projeto); a pessoa vê e troca. Quem chama
 * guarda a escolha onde a campanha guarda os dias e só gera com todos os dias
 * escolhidos (`postsSemModelo`).
 *
 * Membro da equipe também escolhe e cria: o modelo vale para o post e não
 * muda o estilo do projeto, que é do dono.
 */

const formatosDoBook = (catalogoId: string) => modeloPorId(catalogoId)?.formatos;

/** O tipo do "último usado" de cada formato. */
function tipoDoUltimo(formato: PostVisual["formato"]): "image" | "carousel" | "short" | null {
  if (formato === "image" || formato === "carousel" || formato === "short") return formato;
  return null;
}

export function ModelosDosPosts({
  projectId,
  posts,
  valor,
  aoMudar,
  aoCarregar,
  explicacao,
}: {
  projectId: string;
  /** Os posts visuais da campanha (o dia e o formato de cada um). */
  posts: PostVisual[];
  /** As escolhas de agora, pela chave do dia. */
  valor: ModelosDosPosts;
  aoMudar: (novo: ModelosDosPosts) => void;
  /**
   * A leitura do projeto terminou (true) ou falhou (false). Quem chama não
   * tranca a geração quando ela falha: o servidor ainda segura a arte sem
   * modelo, sem gastar, como sempre.
   */
  aoCarregar?: (ok: boolean) => void;
  /** Uma linha sobre por que a lista aparece aqui. */
  explicacao?: string;
}) {
  const [estado, setEstado] = useState<EstadoDoEstiloDosPosts | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);
  const [porta, setPorta] = useState<"criar" | "biblioteca">("criar");
  // Quem chama recria as funções a cada desenho; a leitura não repete por isso.
  const atual = useRef({ valor, aoMudar, aoCarregar, posts });
  useEffect(() => {
    atual.current = { valor, aoMudar, aoCarregar, posts };
  });

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/estilo-dos-posts`, { cache: "no-store" });
      const d = (await r.json().catch(() => ({}))) as EstadoDoEstiloDosPosts & { error?: string };
      if (!r.ok) throw new Error(d.error || "Não consegui ler os modelos do projeto.");
      setEstado(d);
      atual.current.aoCarregar?.(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui ler os modelos do projeto.");
      atual.current.aoCarregar?.(false);
    }
  }, [projectId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O PREENCHIMENTO: com o estado lido, todo dia sem escolha recebe o último
  // modelo daquele tipo (ou o estilo do projeto). Roda de novo quando um dia
  // novo aparece; dia que já tem escolha não muda.
  const chaveDosPosts = posts.map((p) => `${p.chave}:${p.formato}`).join("|");
  useEffect(() => {
    if (!estado) return;
    const { valor: v, aoMudar: mudar, posts: ps } = atual.current;
    const preenchido = preencherModelos(ps, v, { ultimos: estado.ultimos, padraoDaImagem: padraoDaImagemDoEstado(estado), padraoDaEdicao: estado.edicao });
    if (JSON.stringify(preenchido) !== JSON.stringify(v)) mudar(preenchido);
  }, [estado, chaveDosPosts]);

  const faltam = useMemo(() => postsSemModelo(posts, valor), [posts, valor]);

  function escolher(post: PostVisual, modelo: ModeloDoPost, fechar = true) {
    atual.current.aoMudar({ ...atual.current.valor, [post.chave]: modelo });
    if (fechar) setAberto(null);
    // A próxima escolha deste tipo de post vem com este modelo (não trava nada se falhar).
    const tipo = tipoDoUltimo(post.formato);
    if (tipo) {
      void fetch(`/api/projects/${projectId}/estilo-dos-posts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, modelo }),
      }).catch(() => undefined);
    }
  }

  if (!posts.length) return null;

  return (
    <section className="space-y-2 rounded-xl border p-4" style={{ borderColor: faltam.length ? "rgba(234,88,12,0.45)" : "var(--border)", background: "var(--bg-surface)" }} aria-label="O modelo de cada post">
      <div>
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          <Palette className="h-4 w-4 text-orange-500" /> O modelo de cada post
          {faltam.length > 0 ? (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(249,115,22,0.15)", color: "#ea580c" }}>
              {faltam.length === 1 ? "Falta 1 dia" : `Faltam ${faltam.length} dias`}
            </span>
          ) : (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(34,197,94,0.15)", color: "#16a34a" }}>
              Todos escolhidos
            </span>
          )}
        </h3>
        <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
          {explicacao ?? "Cada dia com peça visual tem o seu modelo. No quadro, a IA coloca o conteúdo daquele dia dentro dele. Veio preenchido com o último modelo usado em cada tipo de post (ou com o estilo do projeto): confira e troque o que quiser."}
        </p>
      </div>

      {erro && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          <span>{erro} Você ainda pode seguir: o dia sem modelo sai no estilo do projeto ou, sem estilo aprovado, espera a escolha sem gastar crédito de imagem.</span>
          <button type="button" onClick={() => void carregar()} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
            <RefreshCw className="h-3.5 w-3.5" /> Tentar de novo
          </button>
        </div>
      )}

      <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
        {posts.map((post) => {
          const pede = oQueOPostPede(post.formato);
          const escolhido = valor[post.chave];
          const ok = modeloServeAoPost(escolhido, pede);
          const estaAberto = aberto === post.chave;
          return (
            <li key={post.chave} className="py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
                    {post.rotulo} <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· {ROTULO_DO_POST[post.formato]}</span>
                  </p>
                  <p className="flex items-center gap-1 text-xs" style={{ color: ok ? "var(--text-muted)" : "#ea580c" }}>
                    {ok ? <Check className="h-3.5 w-3.5 text-green-600" /> : null}
                    {pede === "marca"
                      ? post.formato === "infographic"
                        ? "Desenhado nas cores e na letra da sua marca (não há modelo a escolher)."
                        : post.formato === "video"
                          ? "O vídeo segue o estilo visual da mídia da campanha, e a capa sai nas cores e na letra da sua marca."
                          : "A capa sai no estilo do projeto, nas cores e na letra da sua marca."
                      : ok
                        ? `${pede === "edicao" ? "Estilo de edição" : "Modelo"}: ${escolhido?.nome ?? "escolhido"}`
                        : pede === "edicao"
                          ? "Falta escolher o estilo de edição"
                          : "Falta escolher o modelo"}
                  </p>
                </div>
                {pede !== "marca" && (
                  <button
                    type="button"
                    onClick={() => {
                      setAberto(estaAberto ? null : post.chave);
                      setPorta("criar");
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold"
                    style={ok ? { borderColor: "var(--border)", color: "var(--text-primary)" } : { borderColor: "#f97316", background: "#f97316", color: "#fff" }}
                    aria-expanded={estaAberto}
                  >
                    {estaAberto ? "Fechar" : ok ? <><Pencil className="h-3.5 w-3.5" /> Trocar</> : "Escolher"}
                  </button>
                )}
              </div>

              {estaAberto && pede === "modelo" && (
                <div className="mt-2 space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                  <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={`O modelo de ${post.rotulo}`}>
                    {(
                      [
                        ["criar", "Crie o seu estilo, falando ou escrevendo", Wand2],
                        ["biblioteca", "Ou escolha da biblioteca", Library],
                      ] as const
                    ).map(([id, rotulo, Icone]) => (
                      <button
                        key={id}
                        type="button"
                        role="tab"
                        aria-selected={porta === id}
                        onClick={() => setPorta(id)}
                        className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold"
                        style={porta === id ? { borderColor: "#f97316", background: "rgba(249,115,22,0.10)", color: "var(--text-primary)" } : { borderColor: "var(--border)", color: "var(--text-muted)" }}
                      >
                        <Icone className="h-3.5 w-3.5" /> {rotulo}
                      </button>
                    ))}
                  </div>
                  {porta === "criar" ? (
                    <CriarEstilo
                      projectId={projectId}
                      paraOPost
                      aoCriar={(r) => {
                        // O modelo criado já vale para este post; a conversa fica aberta para ajustar.
                        escolher(post, escolhaDoDesign(r.design), false);
                        toast.success(`"${r.design.nome}" é o modelo de ${post.rotulo}.`, { id: `modelo-${post.chave}` });
                      }}
                    />
                  ) : (
                    <GaleriaDaBiblioteca
                      projectId={projectId}
                      tipoFixo="imagem"
                      semEscrever
                      titulo={`Modelos para ${ROTULO_DO_POST[post.formato].toLowerCase()}`}
                      descricao="Do mais usado ao menos: os modelos do nosso book e os que outros clientes criaram. A IA coloca o conteúdo do dia dentro do modelo."
                      filtrar={(d: DesignDaGaleria) => designServeAoPost(d, post.formato, formatosDoBook)}
                      rotuloDoUsar="Usar neste post"
                      aoEscolher={async (d) => escolher(post, escolhaDoDesign(d))}
                    />
                  )}
                </div>
              )}

              {estaAberto && pede === "edicao" && (
                <div className="mt-2 space-y-2 rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}>
                  <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    <Clapperboard className="h-3.5 w-3.5" /> O estilo de edição do corte que sai neste dia. O vídeo completo segue o estilo do projeto.
                  </p>
                  <div className="grid max-h-72 grid-cols-1 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {[...CATALOGO_DE_ESTILOS]
                      .sort((a, b) => Number(estiloEmDestaque(b.id)) - Number(estiloEmDestaque(a.id)))
                      .map((e) => {
                        const ativo = escolhido?.estiloId === e.id;
                        return (
                          <button
                            key={e.id}
                            type="button"
                            onClick={() => escolher(post, { estiloId: e.id, nome: e.nome })}
                            className="rounded-lg border p-2 text-left"
                            style={ativo ? { borderColor: "#f97316", background: "rgba(249,115,22,0.10)" } : { borderColor: "var(--border)" }}
                            aria-pressed={ativo}
                          >
                            <span className="block text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                              {e.nome}
                              {e.referencia ? <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> ({e.referencia})</span> : null}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
                              {e.resumo}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {!estado && !erro && (
        <p className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo os modelos que você já usou
        </p>
      )}
    </section>
  );
}
