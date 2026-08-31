"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { upload } from "@vercel/blob/client";
import { Loader2, Music, X } from "lucide-react";
import { LISTA_DE_ESTILOS, type NomeDoEstilo } from "@/lib/media/estilos";
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

/** A fonte de tela mais parecida com a que o worker usa em cada estilo. */
const APROXIMACAO: Record<NomeDoEstilo, string> = {
  dramatico: "Georgia, 'Times New Roman', serif",
  acelerado: "Impact, 'Arial Narrow', sans-serif",
  serio: "Arial, Helvetica, sans-serif",
  animado: "'Comic Sans MS', 'Trebuchet MS', sans-serif",
};

export function EstiloDoProjeto({
  projectId,
  inicial,
  musicaInicial,
  termosIniciais = null,
}: {
  projectId: string;
  inicial: string | null;
  /** O nome do arquivo da trilha que o projeto já tem, se tiver. */
  musicaInicial: string | null;
  /** Os termos do negócio já cadastrados (Project.videoTerms). */
  termosIniciais?: string | null;
}) {
  // Sem escolha, o padrão é o acelerado, que é o mesmo padrão do back-end. Se
  // os dois discordassem, a tela mostraria um estilo e o vídeo sairia com
  // outro.
  const [escolhido, setEscolhido] = useState<NomeDoEstilo>(
    (inicial as NomeDoEstilo) ?? "acelerado"
  );
  const [salvando, setSalvando] = useState(false);
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

  async function escolher(nome: NomeDoEstilo) {
    if (nome === escolhido || salvando) return;
    const anterior = escolhido;
    // Muda na tela primeiro: a escolha é reversível e barata, e esperar a rede
    // para pintar o botão faz a interface parecer travada.
    setEscolhido(nome);
    setSalvando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoStyle: nome }),
      });
      if (!r.ok) throw new Error(await r.text());
      toast.success("Estilo salvo. Vale para os próximos vídeos deste projeto.");
    } catch {
      setEscolhido(anterior);
      toast.error("Não consegui salvar o estilo. Tente de novo.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="mb-6">
      <div className="mb-3">
        <h2 className="text-lg font-black" style={{ color: "var(--text-primary)" }}>
          Estilo de edição
        </h2>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Vale para todos os vídeos deste projeto. Decide a legenda, o ritmo do
          corte e a mixagem, então escolha antes de enviar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {LISTA_DE_ESTILOS.map((e) => {
          const ativo = e.nome === escolhido;
          return (
            <button
              key={e.nome}
              type="button"
              onClick={() => escolher(e.nome)}
              disabled={salvando}
              aria-pressed={ativo}
              className="rounded-xl border p-4 text-left transition disabled:opacity-60"
              style={{
                borderColor: ativo ? "var(--brand)" : "var(--border)",
                borderWidth: ativo ? 2 : 1,
                background: ativo ? "var(--bg-elevated)" : "var(--bg-surface)",
              }}
            >
              <span
                className="block text-2xl leading-tight"
                style={{
                  fontFamily: APROXIMACAO[e.nome],
                  color: "var(--text-primary)",
                  textTransform: e.legenda.caixaAlta ? "uppercase" : "none",
                }}
              >
                {e.rotulo}
              </span>
              <span
                className="mt-2 block text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {e.paraQue}
              </span>
              <span
                className="mt-3 block text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {e.legenda.palavrasPorVez === 1
                  ? "Uma palavra por vez"
                  : `${e.legenda.palavrasPorVez} palavras por vez`}
                {" · "}
                {e.respiroDoCorte <= 0.15
                  ? "corte rente"
                  : e.respiroDoCorte >= 0.4
                    ? "corte com respiro"
                    : "corte equilibrado"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-2 text-xs" style={{ color: "var(--text-muted)" }}>
        A fonte aqui é uma aproximação do que o navegador tem. A do vídeo é
        desenhada na edição.
      </p>

      {/*
        A trilha é do CLIENTE, e isso é decisão jurídica e não preguiça: quem
        baixa o arquivo define se a plataforma é ferramenta ou distribuidora.
        A dica das licenças fica na tela porque é onde a dúvida nasce.
      */}
      <div
        className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border p-4"
        style={{ borderColor: "var(--border)", background: "var(--bg-surface)" }}
      >
        <Music className="h-5 w-5 shrink-0" style={{ color: "var(--text-muted)" }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPopupAberto(true)}
              className="rounded-lg border px-3 py-1.5 text-sm font-bold"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {musica ? "Trocar" : "Escolher música"}
            </button>
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
