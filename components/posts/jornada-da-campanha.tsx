"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EscolhaDeOrigem } from "@/components/posts/escolha-de-origem";
import { EstiloDoProjeto } from "@/components/video/estilo-do-projeto";
import { SemanaDoVideoPlanejador } from "@/components/video/semana-do-video";
import { VideoUpload } from "@/components/video/video-upload";
import { ModelosDosPosts } from "@/components/estilo-dos-posts/modelos-dos-posts";
import { LISTA_DE_ESTILOS, type NomeDoEstilo } from "@/lib/media/estilos";
import { modelosDaSemana, normalizarSemana, planoParaGravar, postsVisuaisDaSemana, semanaComModelos, type SemanaDoVideo } from "@/lib/media/semana-do-video";
import { postsSemModelo } from "@/lib/estilo-dos-posts/tipos";

/**
 * A jornada de criar uma campanha, em passos, igual à de criar um projeto.
 *
 * ## O que ela substitui, e por quê
 *
 * Até 18/09 as duas portas da campanha levavam a lugares de naturezas
 * diferentes. A porta do TEMA abria uma janela em etapas, com barra de
 * progresso. A porta do VÍDEO abria um painel DENTRO da página, com estilo de
 * edição, trilha, termos do negócio e o planejador da semana empilhados, quatro
 * decisões de uma vez.
 *
 * Pior: esse painel **abria sozinho** em todo projeto sem gravação e sem card,
 * que é exatamente o estado de quem acabou de terminar o setup. E a escolha
 * entre as duas portas só aparecia quando a URL trazia `?novaCampanha=1`, que o
 * menu não traz. Então quem criava um projeto caía numa tela com a porta do
 * vídeo escancarada, sem ter escolhido nada, e com quatro formulários abertos.
 *
 * Veredito do Bruno em 18/09, olhando a própria tela: "essa tela está poluída".
 *
 * ## A decisão
 *
 * **Uma pergunta por passo, e a mesma moldura das duas portas.** Nada aqui é
 * funcionalidade nova: os cinco passos são os componentes que já existiam,
 * servidos um por vez. O trabalho é de moldura e de ordem, e por isso o risco
 * é baixo.
 *
 * ## O pedágio que ela evita
 *
 * Os passos 2, 3 e 4 gravam no PROJETO, não na campanha, e continuam valendo
 * para as próximas gravações. Quem já configurou uma vez **pula direto para o
 * envio**, com uma linha dizendo o que está valendo e um botão para rever.
 * Perguntar as mesmas quatro coisas toda semana transformaria a jornada em
 * pedágio, e pedágio semanal é o tipo de atrito que faz alguém parar de gravar.
 *
 * ## O estilo dos posts (08/10)
 *
 * O caso do Igor: o projeto já tinha estilo de edição, a jornada pulava para o
 * envio, a semana padrão tinha imagem e carrossel, e o único aviso do estilo
 * das artes morava no passo da semana, que foi pulado. As artes nasceram
 * "aguardando a sua identidade visual" e ele só descobriu no quadro. Agora há
 * o passo "Como ficam os posts" antes do envio, e o pulo NÃO passa por cima
 * dele enquanto houver dia de arte e o estilo não estiver aprovado. Aprovado
 * (pelo chat ou pela biblioteca), a jornada segue sozinha para o envio.
 *
 * ## O modelo de cada post (08/10, à tarde)
 *
 * Regra do Bruno: "o modelo precisa ser escolhido por post (quarta é um
 * carrossel, precisa escolher o modelo), quinta é uma foto (escolher modelo)
 * etc... sexta é um vídeo curto (short, reel e tiktok) escolher o estilo". O
 * passo dos posts virou "O modelo de cada post": cada dia com peça visual
 * mostra o tipo e o modelo dele (o vídeo curto, o estilo de edição), já
 * preenchido com o último usado naquele tipo. A escolha mora no dia, dentro
 * de `videoSemana` (sem coluna nova), e vai congelada no run. O passo aparece
 * sempre que a semana tem dia visual (a pessoa vê o que vai sair), e o pulo e
 * o "Continuar" só seguem com todos os dias escolhidos. Membro e dono
 * escolhem igual: o modelo do post não muda o estilo do projeto.
 */

type Origem = "video" | "tema";

const PASSOS_DO_VIDEO = [
  { chave: "origem", titulo: "De onde vem o conteúdo" },
  { chave: "estilo", titulo: "Como o squad edita" },
  { chave: "trilha", titulo: "Trilha e termos do seu negócio" },
  { chave: "semana", titulo: "O que sai em cada dia" },
  { chave: "posts", titulo: "O modelo de cada post" },
  { chave: "envio", titulo: "Envie a gravação" },
] as const;

const PASSO_DOS_POSTS = PASSOS_DO_VIDEO.findIndex((p) => p.chave === "posts");

export function JornadaDaCampanha({
  aberto,
  projectId,
  estilo,
  musica,
  termos,
  semana,
  redesConectadas,
  onFechar,
  onEnviado,
  onEscolherTema,
  onEscolherPronto,
  comecarNoVideo = false,
}: {
  aberto: boolean;
  projectId: string;
  estilo: string | null;
  musica: string | null;
  termos: string | null;
  /** Project.videoSemana, o formato de cada dia a partir do vídeo. */
  semana: unknown;
  /** As redes com conta ativa: o passo 4 só marca rede conectada (30/09). */
  redesConectadas?: string[];
  onFechar: () => void;
  /** A gravação subiu: quem chama fecha a jornada e recarrega a esteira. */
  onEnviado: () => void;
  /** A porta do tema delega para a janela que já existe. */
  onEscolherTema: () => void;
  /** A quarta porta (06/10): o conteúdo pronto do cliente. Sem ela, três portas. */
  onEscolherPronto?: () => void;
  /**
   * Quem já escolheu "Editar o meu vídeo" na aba Criar (29/09) não precisa ver
   * a escolha de novo: a jornada abre no passo seguinte.
   */
  comecarNoVideo?: boolean;
}) {
  const router = useRouter();

  /**
   * A SEMANA DESTA JORNADA (08/10): o planejador do passo da semana avisa cada
   * troca (e salva sozinho), e o passo dos modelos grava a escolha de cada dia
   * no mesmo `videoSemana`. Fica aqui, e não só no planejador, para os dois
   * passos verem a mesma semana: voltar do passo dos modelos para o da semana
   * mostrava o plano da abertura, sem o que a pessoa tinha acabado de trocar.
   * Muda quando o projeto manda outra semana (a tela recarregou).
   */
  const [semanaAtual, setSemanaAtual] = useState<SemanaDoVideo>(() => normalizarSemana(semana));
  const [semanaDoProjeto, setSemanaDoProjeto] = useState(semana);
  if (semana !== semanaDoProjeto) {
    setSemanaDoProjeto(semana);
    setSemanaAtual(normalizarSemana(semana));
  }
  const ultimaSalva = useRef(JSON.stringify(planoParaGravar(normalizarSemana(semana))));
  const filaDeGravacao = useRef<Promise<unknown>>(Promise.resolve());
  /** Grava a semana no projeto, uma gravação depois da outra (a ordem dos cliques é a ordem no banco). */
  function salvarSemana(s: SemanaDoVideo) {
    const plano = JSON.stringify(planoParaGravar(s));
    if (plano === ultimaSalva.current) return;
    ultimaSalva.current = plano;
    filaDeGravacao.current = filaDeGravacao.current
      .then(() => fetch(`/api/projects/${projectId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoSemana: JSON.parse(plano) }) }))
      .then((r) => {
        if (r && !r.ok) throw new Error();
      })
      .catch(() => {
        ultimaSalva.current = "";
        toast.error("Não consegui guardar o modelo de cada dia. A escolha continua na tela; troque de novo para tentar.", { id: "modelos-da-semana" });
      });
  }

  /**
   * O MODELO DE CADA POST ANTES DO ENVIO (08/10). Os posts visuais da semana
   * e os que ainda não têm escolha. Se a leitura dos modelos falhar, nada
   * tranca: o dia sem modelo espera a escolha no servidor, sem gastar.
   */
  const postsDaSemana = postsVisuaisDaSemana(semanaAtual);
  const [modelosFalharam, setModelosFalharam] = useState(false);
  const faltamModelos = modelosFalharam ? [] : postsSemModelo(postsDaSemana, modelosDaSemana(semanaAtual));
  const temPostsVisuais = postsDaSemana.length > 0;

  const passoInicial = comecarNoVideo ? (estilo ? PASSOS_DO_VIDEO.length - 1 : 1) : 0;
  const [passo, setPasso] = useState(passoInicial);
  // Cada abertura recomeça do passo certo. Ajuste durante o render, e não em
  // efeito: é o jeito do React de derivar estado de uma prop que mudou.
  // 08/10: o envio não espera mais leitura nenhuma do servidor (a conferência
  // dos modelos sai da semana na tela), então o cartão de envio não pisca.
  const [abertoAntes, setAbertoAntes] = useState(aberto);
  if (aberto !== abertoAntes) {
    setAbertoAntes(aberto);
    if (aberto) setPasso(passoInicial);
  }

  /**
   * Este projeto já foi configurado para vídeo?
   *
   * O critério é ter estilo escolhido. Trilha é opcional de propósito (sem
   * trilha o corte sai só com voz), e termos do negócio também, então exigir os
   * três marcaria como "novo" um projeto que só não quis trilha.
   */
  const jaConfigurado = Boolean(estilo);

  /**
   * COTA DE GRAVAÇÕES ESGOTADA, sabida ANTES dos passos de configuração (30/09).
   *
   * Sem isto, quem já usou as 4 gravações do Starter escolhia estilo, trilha e
   * a semana inteira para descobrir só no último passo que não podia enviar:
   * três telas de trabalho jogadas fora. Esgotada, a jornada vai direto ao
   * passo do envio, onde a oferta com a data de liberação toma o lugar do
   * cartão de envio (components/planos/pedido-de-upgrade.tsx). Falha de rede
   * aqui não muda nada: o servidor recusa no token e no registro.
   */
  const [semGravacao, setSemGravacao] = useState(false);
  useEffect(() => {
    if (!aberto) return;
    let vivo = true;
    fetch("/api/videos/limites")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (vivo && d && !d.pode && d.limite?.recurso === "gravacoes") setSemGravacao(true);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [aberto]);
  const pulaParaOEnvio = jaConfigurado || semGravacao;
  if (semGravacao && passo > 0 && passo < PASSOS_DO_VIDEO.length - 1) setPasso(PASSOS_DO_VIDEO.length - 1);
  // O pulo não passa por cima do modelo de cada post (08/10): chegou ao envio
  // com dia visual sem escolha, volta para o passo dos modelos. Sem gravação
  // disponível nada é gerado, então não há o que escolher.
  if (!semGravacao && faltamModelos.length > 0 && passo === PASSOS_DO_VIDEO.length - 1) setPasso(PASSO_DOS_POSTS);

  /**
   * Reabrir a jornada reabre no COMEÇO, e não onde parou da última vez: quem
   * fechou no passo 4 e voltou depois está começando outra coisa.
   *
   * Feito na CHAVE do elemento, e não com setState dentro de efeito. As duas
   * formas funcionam, mas o efeito renderiza a jornada uma vez no passo antigo
   * antes de corrigir, e o React avisa sobre isso com razão: é um render a
   * mais e um piscar da tela errada. Trocar a chave faz o React remontar do
   * zero, que é exatamente o que "reabrir" quer dizer.
   */

  const total = PASSOS_DO_VIDEO.length;
  const atual = PASSOS_DO_VIDEO[passo];

  function avancar() {
    // O PULO: do passo 1 direto para o envio, quando já há estilo no projeto.
    // A pessoa continua podendo rever, pelo botão da linha de resumo. Com o
    // estilo dos posts faltando, o pulo para no passo dele (08/10).
    if (passo === 0 && pulaParaOEnvio) {
      setPasso(faltamModelos.length > 0 && !semGravacao ? PASSO_DOS_POSTS : total - 1);
      return;
    }
    // Da semana, o que ficou na tela vai para o projeto (o planejador grava
    // com atraso, e sair do passo cancelava a última troca), e o passo dos
    // modelos aparece sempre que a semana tem dia visual.
    if (passo === PASSO_DOS_POSTS - 1) {
      salvarSemana(semanaAtual);
      setPasso(temPostsVisuais ? PASSO_DOS_POSTS : total - 1);
      return;
    }
    setPasso((p) => Math.min(p + 1, total - 1));
  }

  function voltar() {
    // A volta desfaz o pulo pelo mesmo caminho, senão quem pulou para o envio
    // voltaria para o planejador da semana, uma tela que ele nunca viu.
    if (passo === total - 1 && pulaParaOEnvio) {
      setPasso(0);
      return;
    }
    // O mesmo no passo dos modelos, quando o pulo parou nele (08/10).
    if (passo === PASSO_DOS_POSTS && pulaParaOEnvio) {
      setPasso(0);
      return;
    }
    // Do envio, sem dia visual na semana, volta direto para a semana.
    if (passo === total - 1 && !temPostsVisuais) {
      setPasso(PASSO_DOS_POSTS - 1);
      return;
    }
    if (passo === 0) {
      onFechar();
      return;
    }
    setPasso((p) => p - 1);
  }

  const rotuloDoEstilo =
    LISTA_DE_ESTILOS.find((e) => e.nome === ((estilo as NomeDoEstilo) ?? "acelerado"))?.rotulo ??
    "Acelerado";

  return (
    <AnimatePresence>
      {aberto && (
        <motion.div
          key="jornada-campanha"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
          onClick={(e) => {
            if (e.target === e.currentTarget) onFechar();
          }}
        >
          <motion.div
            key={aberto ? "aberta" : "fechada"}
            initial={{ opacity: 0, y: 14, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.99 }}
            transition={{ duration: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
            className="w-full max-w-[880px] overflow-hidden rounded-2xl border shadow-2xl"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
          >
            {/* Cabeçalho com a barra de progresso, igual à do assistente de
                projeto e à da campanha por tema: a mesma moldura em toda
                jornada é o que faz as três parecerem o mesmo produto. */}
            <div className="border-b px-5 py-4" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15.5px] font-bold" style={{ color: "var(--text-primary)" }}>
                    Nova campanha
                  </p>
                  <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                    {atual.titulo}, passo {passo + 1} de {total}
                  </p>
                </div>
                <button
                  onClick={onFechar}
                  title="Fechar"
                  className="shrink-0 rounded-lg p-1 transition-colors hover:bg-[var(--realce-2)]"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-3 flex gap-1.5">
                {PASSOS_DO_VIDEO.map((p, i) => (
                  <span
                    key={p.chave}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors duration-300",
                      i === passo ? "bg-orange-500" : i < passo ? "bg-orange-500/55" : ""
                    )}
                    style={i > passo ? { background: "var(--border)" } : undefined}
                  />
                ))}
              </div>
            </div>

            <div className="max-h-[calc(100vh-15rem)] overflow-y-auto px-5 py-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={atual.chave}
                  initial={{ opacity: 0, x: 18 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -18 }}
                  transition={{ duration: 0.18 }}
                >
                  {passo === 0 && (
                    <EscolhaDeOrigem
                      variante="janela"
                      onVideo={() => avancar()}
                      onTema={() => {
                        onFechar();
                        onEscolherTema();
                      }}
                      onGemeo={() => router.push(`/projects/${projectId}/gemeo`)}
                      onPronto={
                        onEscolherPronto
                          ? () => {
                              onFechar();
                              onEscolherPronto();
                            }
                          : undefined
                      }
                    />
                  )}

                  {passo === 1 && (
                    <EstiloDoProjeto
                      projectId={projectId}
                      inicial={estilo}
                      musicaInicial={musica}
                      termosIniciais={termos}
                      mostrar="estilo"
                    />
                  )}

                  {passo === 2 && (
                    <EstiloDoProjeto
                      projectId={projectId}
                      inicial={estilo}
                      musicaInicial={musica}
                      termosIniciais={termos}
                      mostrar="trilha-e-termos"
                    />
                  )}

                  {passo === 3 && (
                    <SemanaDoVideoPlanejador
                      projectId={projectId}
                      inicial={semanaAtual}
                      redesConectadas={redesConectadas}
                      // O planejador grava sozinho, com atraso; ao sair do passo a
                      // jornada grava de novo o que ficou na tela (avancar).
                      aoMudar={setSemanaAtual}
                    />
                  )}

                  {passo === PASSO_DOS_POSTS && (
                    <div className="space-y-3">
                      <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                        Cada dia com foto, carrossel ou vídeo curto tem o seu modelo, e no quadro a IA coloca o conteúdo daquele dia dentro dele. Veio preenchido com o último modelo usado em cada tipo de post (ou com o estilo do projeto): confira, troque o que quiser e siga para o envio. Prefere sem arte? Volte e troque esses dias por texto.
                      </p>
                      <ModelosDosPosts
                        projectId={projectId}
                        posts={postsDaSemana}
                        valor={modelosDaSemana(semanaAtual)}
                        aoMudar={(m) => {
                          const nova = semanaComModelos(semanaAtual, m);
                          setSemanaAtual(nova);
                          salvarSemana(nova);
                        }}
                        aoCarregar={(ok) => setModelosFalharam(!ok)}
                      />
                    </div>
                  )}

                  {passo === total - 1 && (
                    <div className="space-y-4">
                      {/* O RESUMO de quem pulou. Sem ele, o pulo esconderia
                          quatro decisões que valem para esta gravação, e a
                          pessoa descobriria o estilo errado no vídeo pronto. */}
                      {jaConfigurado && !semGravacao && (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                          style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
                        >
                          <p className="text-[13px]" style={{ color: "var(--text-primary)" }}>
                            Editando no estilo <b className="font-semibold">{rotuloDoEstilo}</b>
                            {musica ? (
                              <>, com a trilha <b className="font-semibold">{musica}</b></>
                            ) : (
                              <>, sem trilha</>
                            )}
                            .
                          </p>
                          <Button variant="outline" size="sm" onClick={() => setPasso(1)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Rever
                          </Button>
                        </div>
                      )}
                      {/* O que cada post vai usar (08/10), com o mesmo "Rever" do resumo. */}
                      {temPostsVisuais && !semGravacao && (
                        <div
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
                          style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
                        >
                          <p className="min-w-0 flex-1 text-[13px]" style={{ color: "var(--text-primary)" }}>
                            {postsDaSemana
                              .map((p) => {
                                const m = modelosDaSemana(semanaAtual)[p.chave];
                                return `${p.rotulo.split(",")[0]}: ${m?.marca ? "nas cores da marca" : m?.nome ?? "sem modelo"}`;
                              })
                              .join(" · ")}
                          </p>
                          <Button variant="outline" size="sm" onClick={() => setPasso(PASSO_DOS_POSTS)}>
                            <Pencil className="h-3.5 w-3.5" />
                            Rever
                          </Button>
                        </div>
                      )}
                      <VideoUpload projectId={projectId} onEnviado={onEnviado} />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <div
              className="flex items-center justify-between gap-3 border-t px-5 py-3.5"
              style={{ borderColor: "var(--border)" }}
            >
              <Button variant="outline" onClick={voltar}>
                {passo === 0 ? (
                  "Cancelar"
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4" />
                    Voltar
                  </>
                )}
              </Button>
              {/* O passo 0 avança pelo clique na porta, e o último não tem
                  "continuar": quem avança dali é o upload terminando. Um botão
                  que não faz nada em duas das cinco telas ensina a ignorá-lo. */}
              {passo > 0 && passo < total - 1 && (
                // No passo dos modelos, só segue com todo dia visual escolhido (08/10).
                <Button onClick={avancar} disabled={passo === PASSO_DOS_POSTS && faltamModelos.length > 0}>
                  Continuar
                </Button>
              )}
              {passo === total - 1 && (
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  A jornada termina quando a gravação subir.
                </span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
