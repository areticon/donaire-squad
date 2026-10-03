"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { upload } from "@vercel/blob/client";
import { Loader2, Music, X } from "lucide-react";
import type { NomeDoEstilo } from "@/lib/media/estilos";
import { CatalogoDeEstilos } from "@/components/video/catalogo-de-estilos";
import { EscolherMusica } from "@/components/video/escolher-musica";

/**
 * A escolha do estilo de edição do projeto.
 *
 * ## Por que fica aqui e não no envio de cada vídeo
 *
 * Decisão do Bruno em 24/08: o estilo mora no PROJETO, porque canal com estilo
 * diferente a cada vídeo não constrói reconhecimento. E ele vem ANTES da
 * edição, porque é o estilo que decide legenda, ritmo e som.
 *
 * Por isso a escolha aparece na tela de vídeo, logo acima do envio: é o último
 * lugar onde o cliente passa antes de a edição começar, e ele vê a decisão em
 * vez de ter que procurá-la em configurações.
 *
 * ## Por que cada opção mostra a fonte de verdade
 *
 * Porque a diferença entre os quatro estilos é, sobretudo, tipográfica. Uma
 * lista de nomes ("Dramático", "Acelerado") pede que o cliente adivinhe. O
 * nome escrito NA FONTE do estilo mostra a diferença sem explicar nada.
 *
 * As fontes usadas na edição vivem no contêiner do worker e não no navegador,
 * então aqui entram as alternativas mais próximas que o sistema tem. É uma
 * aproximação, e está dito na tela: prometer o pixel exato numa prévia que não
 * é o vídeo seria a mesma família de erro que medir o encanamento e chamar de
 * produto pronto.
 */

export function EstiloDoProjeto({
  projectId,
  inicial,
  musicaInicial,
  termosIniciais = null,
  mostrar = "tudo",
}: {
  projectId: string;
  inicial: string | null;
  /** O nome do arquivo da trilha que o projeto já tem, se tiver. */
  musicaInicial: string | null;
  /** Os termos do negócio já cadastrados (Project.videoTerms). */
  termosIniciais?: string | null;
  /**
   * Qual pedaço aparece. Existe desde 18/09, quando a configuração do vídeo
   * virou uma jornada em passos: o estilo ganha um passo só dele, e a trilha e
   * os termos dividem o seguinte.
   *
   * Uma PROP e não três componentes porque os três blocos dividem o mesmo
   * estado e as mesmas funções de salvar. Quebrar em componentes exigiria
   * levantar esse estado para fora, que é trabalho de encanamento para entregar
   * exatamente a mesma coisa. A tela de Configurações continua pedindo "tudo",
   * e nada muda para ela.
   */
  mostrar?: "tudo" | "estilo" | "trilha-e-termos";
}) {
  const verEstilo = mostrar === "tudo" || mostrar === "estilo";
  const verResto = mostrar === "tudo" || mostrar === "trilha-e-termos";
  // Sem escolha, o padrão é o acelerado, que é o mesmo padrão do back-end. Se
  // os dois discordassem, a tela mostraria um estilo e o vídeo sairia com
  // outro.
  const [escolhido, setEscolhido] = useState<NomeDoEstilo>(
    (inicial as NomeDoEstilo) ?? "acelerado"
  );
  const [musica, setMusica] = useState<string | null>(musicaInicial);
  const [subindoMusica, setSubindoMusica] = useState(false);
  const [popupAberto, setPopupAberto] = useState(false);
  const [termos, setTermos] = useState(termosIniciais ?? "");
  const [termosSalvos, setTermosSalvos] = useState(termosIniciais ?? "");

  /**
   * Os termos do negócio que a legenda precisa acertar. Pedido do Bruno em
   * 30/08, depois de a legenda escrever o nome da empresa dele errado: o
   * cliente cadastra uma vez, a transcrição nova recebe os termos como
   * reforço, e a correção determinística conserta o que ainda escapar, valendo
   * também para gravação já transcrita. Salva ao sair do campo, sem botão.
   */
  async function salvarTermos() {
    const limpo = termos.trim();
    if (limpo === termosSalvos.trim()) return;
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoTerms: limpo || null }),
      });
      if (!r.ok) throw new Error();
      setTermosSalvos(limpo);
      toast.success("Termos salvos. Valem para a próxima transcrição e para o próximo corte.");
    } catch {
      toast.error("Não consegui salvar os termos. Tente de novo.");
    }
  }

  async function subirMusica(arquivo: File) {
    if (arquivo.size > 40 * 1024 * 1024) {
      toast.error("A trilha pode ter no máximo 40 MB.");
      return;
    }
    setSubindoMusica(true);
    try {
      const blob = await upload(`musica/${projectId}/${arquivo.name}`, arquivo, {
        access: "private",
        handleUploadUrl: `/api/projects/${projectId}/musica`,
        // Em partes, como o vídeo (29/09). O envio de uma peça só (o padrão)
        // ficava pendurado para sempre no store privado, sem resposta nem erro:
        // reproduzido com um MP3 de 100 KB, preso em "Enviando a faixa...".
        multipart: true,
      });
      // O espelho do onUploadCompleted: em desenvolvimento o storage não
      // alcança o localhost, então o navegador grava também. Os dois escrevem
      // a mesma coisa.
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoMusicUrl: blob.url, videoMusicName: arquivo.name }),
      });
      setMusica(arquivo.name);
      setPopupAberto(false);
      toast.success("Trilha salva. Entra nos próximos cortes, no volume do estilo.");
    } catch {
      toast.error("Não consegui subir a trilha. Tente de novo.");
    } finally {
      setSubindoMusica(false);
    }
  }

  async function tirarMusica() {
    setSubindoMusica(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/musica`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setMusica(null);
      toast.success("Trilha removida. Os próximos cortes saem sem música.");
    } catch {
      toast.error("Não consegui remover a trilha.");
    } finally {
      setSubindoMusica(false);
    }
  }

  return (
    <section className="mb-6">
      {/* O catálogo em camadas (29/09) no lugar dos quatro cartões. A linguagem
          escolhida decide o perfil de legenda dos cortes, que volta por
          `aoMudarBase` para a trilha sugerir o clima certo. */}
      {verEstilo && <CatalogoDeEstilos projectId={projectId} aoMudarBase={setEscolhido} />}

      {verResto && (
      <>
      {/*
        A trilha é do CLIENTE, e isso é decisão jurídica e não preguiça: quem
        baixa o arquivo define se a plataforma é ferramenta ou distribuidora.
        A dica das licenças fica na tela porque é onde a dúvida nasce.
      */}
      <div
        className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      >
        <Music className="h-5 w-5 shrink-0 self-start sm:self-center" style={{ color: "var(--text-muted)" }} />
        {/* min-w de 12rem: com min-w-0 o texto nunca quebrava a linha e virava
            uma coluna de uma palavra no celular (03/10); assim os botões descem. */}
        <div className="min-w-[min(100%,12rem)] flex-1">
          <p className="break-words text-sm font-bold" style={{ color: "var(--text-primary)" }}>
            {musica ? musica : "Trilha dos cortes"}
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {musica
              ? "Toca por baixo da voz, no volume do estilo, e abaixa quando você fala."
              : "Suba uma faixa que você tem direito de usar (da sua assinatura, própria, ou CC BY). Sem trilha, os cortes saem só com a voz."}
          </p>
        </div>
        {subindoMusica ? (
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--text-muted)" }} />
        ) : (
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button
              type="button"
              onClick={() => setPopupAberto(true)}
              className="flex-1 whitespace-nowrap rounded-lg border px-2 sm:px-3 py-2 text-center text-sm font-bold sm:flex-none sm:py-1.5"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {musica ? "Buscar outra" : "Buscar música"}
            </button>
            {/* SUBIR DIRETO, sem passar pela janela das bibliotecas (29/09): o
                Bruno clicava no botão de dentro da janela e o seletor não abria
                no Chrome dele, e o envio de vídeo, que tem o seletor na própria
                tela, funcionava. Quem já baixou a faixa sobe por aqui. */}
            <label
              className="flex-1 cursor-pointer whitespace-nowrap rounded-lg bg-orange-500 px-2 sm:px-3 py-2 text-center text-sm font-bold text-white sm:flex-none sm:py-1.5"
              aria-disabled={subindoMusica}
            >
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac"
                className="sr-only"
                disabled={subindoMusica}
                onChange={(e) => {
                  const arquivo = e.target.files?.[0];
                  if (arquivo) void subirMusica(arquivo);
                  e.target.value = "";
                }}
              />
              {subindoMusica ? "Enviando..." : musica ? "Trocar arquivo" : "Subir arquivo"}
            </label>
            {musica && (
              <button
                type="button"
                onClick={() => void tirarMusica()}
                aria-label="Remover trilha"
                className="rounded-lg border p-1.5"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/*
        O glossário do cliente. Fica no mesmo cartão do estilo porque é decisão
        de PROJETO, como o estilo e a trilha: os nomes do negócio não mudam de
        um vídeo para outro.
      */}
      <div
        className="mt-4 rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      >
        <label
          htmlFor={`termos-${projectId}`}
          className="text-sm font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Termos do seu negócio
        </label>
        <p className="mb-2 text-xs" style={{ color: "var(--text-muted)" }}>
          Escreva alguns termos da sua área que a transcrição costuma errar: o
          nome da sua empresa, dos seus produtos, siglas e jargões. Separe por
          vírgula. A legenda passa a escrevê-los exatamente como você escreveu
          aqui.
        </p>
        <textarea
          id={`termos-${projectId}`}
          value={termos}
          onChange={(e) => setTermos(e.target.value)}
          onBlur={() => void salvarTermos()}
          rows={2}
          placeholder="Ex.: o nome da sua empresa, sua sigla do setor, seu produto"
          className="w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
          style={{
            borderColor: "var(--border)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      </>
      )}

      <EscolherMusica
        aberto={popupAberto}
        estilo={escolhido}
        subindo={subindoMusica}
        onFechar={() => setPopupAberto(false)}
        onEnviar={(arquivo) => void subirMusica(arquivo)}
      />
    </section>
  );
}
