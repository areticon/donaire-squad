"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EscolhaDeOrigem } from "@/components/posts/escolha-de-origem";
import { EstiloDoProjeto } from "@/components/video/estilo-do-projeto";
import { SemanaDoVideoPlanejador } from "@/components/video/semana-do-video";
import { VideoUpload } from "@/components/video/video-upload";
import { LISTA_DE_ESTILOS, type NomeDoEstilo } from "@/lib/media/estilos";

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
 */

type Origem = "video" | "tema";

const PASSOS_DO_VIDEO = [
  { chave: "origem", titulo: "De onde vem o conteúdo" },
  { chave: "estilo", titulo: "Como o squad edita" },
  { chave: "trilha", titulo: "Trilha e termos do seu negócio" },
  { chave: "semana", titulo: "O que sai em cada dia" },
  { chave: "envio", titulo: "Envie a gravação" },
] as const;

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
  /**
   * Quem já escolheu "Editar o meu vídeo" na aba Criar (29/09) não precisa ver
   * a escolha de novo: a jornada abre no passo seguinte.
   */
  comecarNoVideo?: boolean;
}) {
  const router = useRouter();
  const passoInicial = comecarNoVideo ? (estilo ? PASSOS_DO_VIDEO.length - 1 : 1) : 0;
  const [passo, setPasso] = useState(passoInicial);
  // Cada abertura recomeça do passo certo. Ajuste durante o render, e não em
  // efeito: é o jeito do React de derivar estado de uma prop que mudou.
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
    // A pessoa continua podendo rever, pelo botão da linha de resumo.
    if (passo === 0 && pulaParaOEnvio) {
      setPasso(total - 1);
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
                    <SemanaDoVideoPlanejador projectId={projectId} inicial={semana} redesConectadas={redesConectadas} />
                  )}

                  {passo === 4 && (
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
              {passo > 0 && passo < total - 1 && <Button onClick={avancar}>Continuar</Button>}
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
