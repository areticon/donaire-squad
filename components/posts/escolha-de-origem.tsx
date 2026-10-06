"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Lightbulb, UserRound, Video, Sparkles, FileUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { gemeoAtivo } from "@/lib/media/gemeo";

/**
 * As TRÊS portas da campanha: o seu vídeo, o seu gêmeo digital, ou tudo com IA.
 *
 * Um componente só, usado em vários lugares, por decisão do Bruno em 13/09
 * (canvas "Jornada da primeira campanha"): a escolha é uma, e cada porta recebe
 * um callback; quem renderiza decide o que abrir.
 *
 * ## Por que três, desde 29/09
 *
 * O Bruno resumiu a plataforma assim: "tem muitas funcionalidades, mas no final
 * são 3 caminhos de entrada (decisão do usuário): subir um vídeo para editar e
 * gerar cortes, criar um clone digital e gerar tudo com IA". E a sugestão da
 * plataforma é INTERCALAR, preferindo o vídeo do próprio cliente quando houver:
 * dá mais engajamento e é mais barato. Por isso a porta do vídeo vem primeiro,
 * destacada e com o selo de recomendada, e a frase de intercalar fica embaixo
 * das três, não escondida numa ajuda.
 *
 * `variante="tela"` é a versão cheia, com título, para a aba Criar e a primeira
 * campanha. `variante="janela"` é a versão compacta, dentro da jornada.
 *
 * ## A quarta porta, desde 06/10
 *
 * "Conteúdo pronto seu": a arte do Canva ou o vídeo que o cliente já tem,
 * posto num dia do quadro sem edição nenhuma. Pedido do Bruno: "ele clica
 * em adicionar conteúdo em qualquer dia da semana e tem as opções: vídeo,
 * gêmeo, IA, e um conteúdo pronto seu". Só aparece quando quem renderiza
 * passa `onPronto` (o quadro e a aba Posts); a aba Criar segue com três.
 */
export function EscolhaDeOrigem({
  onVideo,
  onTema,
  onGemeo,
  onPronto,
  variante = "janela",
  titulo,
}: {
  onVideo: () => void;
  onTema: () => void;
  /** Sem callback, a porta do gêmeo aparece como "em breve", sem clique. */
  onGemeo?: () => void;
  /** A porta do conteúdo pronto (06/10). Sem callback, ela não aparece. */
  onPronto?: () => void;
  variante?: "tela" | "janela";
  /** Título da versão cheia. O padrão é o da primeira campanha. */
  titulo?: string;
}) {
  const cheia = variante === "tela";
  const quatro = Boolean(onPronto);

  /**
   * MEMBRO DA EQUIPE (01/10, acabamento): o gêmeo é cadastrado por quem
   * administra a conta, então "Só você pode criar o seu" seria um convite que
   * a API recusa. O membro vê de quem é o cadastro e, com o gêmeo pronto, usa.
   * Lido aqui, pelo projeto da URL, para as quatro telas que usam as portas
   * não precisarem passar nada: a faixa do topo já pede o mesmo resumo.
   */
  const params = useParams<{ id?: string }>();
  const projectId = typeof params?.id === "string" ? params.id : null;
  const [doMembro, setDoMembro] = useState<{ dono: string; pronto: boolean } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let vivo = true;
    fetch("/api/plano-na-tela", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (p: { equipe?: { dono?: string } | null } | null) => {
        const dono = p?.equipe?.dono;
        if (!vivo || typeof dono !== "string") return;
        const g = await fetch(`/api/projects/${projectId}/gemeo`, { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (vivo) setDoMembro({ dono, pronto: gemeoAtivo(g?.cadastro ?? null) });
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [projectId]);

  return (
    <div className={cn("flex flex-col", cheia ? "gap-8 items-center" : "gap-4")}>
      {cheia ? (
        <div className="flex flex-col items-center gap-2.5 text-center">
          <h2 className="text-3xl font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            {titulo ?? "Como você quer criar esta semana?"}
          </h2>
          <p className="max-w-[620px] text-base leading-relaxed" style={{ color: "var(--text-muted)" }}>
            São três caminhos, e a escolha vale só para esta campanha. O resto (revisão,
            agenda e publicação) é igual nos três.
          </p>
        </div>
      ) : (
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            De onde vem o conteúdo desta campanha?
          </h3>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            O seu vídeo, o seu gêmeo digital ou tudo criado pela IA.
          </p>
        </div>
      )}

      <div className={cn("grid grid-cols-1 gap-4", quatro ? (cheia ? "md:grid-cols-2 xl:grid-cols-4" : "md:grid-cols-2") : "md:grid-cols-3", cheia && "w-full max-w-[1080px]")}>
        {/* Porta 1: o vídeo do cliente. Destacada e recomendada: vídeo é o produto
            (22/08), e é o caminho que mais engaja e menos custa (29/09). */}
        <Porta
          destaque
          selo="Recomendado"
          icone={<Video className="h-[22px] w-[22px] text-orange-400" />}
          titulo="Editar o meu vídeo"
          texto="Você sobe uma gravação (ou várias câmeras). O squad edita o vídeo completo, tira os cortes verticais e escreve a semana a partir do que você falou."
          itens={["vídeo completo editado", "cortes para reels e shorts", "posts da semana"]}
          acao="Começar pelo vídeo"
          onClick={onVideo}
        />

        {/* Porta 2: o gêmeo digital. A sua cara e a sua voz, sem câmera.
            Desde 01/10 leva ao fluxo real (cadastro e geração), e não mais à
            página "em teste": o texto diz o que a pessoa vai fazer lá. */}
        {doMembro ? (
          <Porta
            selo="Novo"
            icone={<UserRound className="h-[22px] w-[22px]" style={{ color: "var(--text-muted)" }} />}
            titulo="O gêmeo digital da equipe"
            texto={
              doMembro.pronto
                ? `O gêmeo da equipe, cadastrado por ${doMembro.dono}, já está pronto. Escolha um roteiro e ele fala sem câmera; o vídeo segue para a edição como uma gravação.`
                : `O gêmeo da equipe é cadastrado por ${doMembro.dono}: fotos, um minuto de voz e a autorização gravada. Quando estiver pronto, você usa o gêmeo para falar o roteiro sem câmera.`
            }
            itens={["rosto cadastrado", "voz cadastrada", "a partir do roteiro"]}
            acao={!onGemeo ? "Em breve" : doMembro.pronto ? "Usar o gêmeo da equipe" : "Ver o gêmeo da equipe"}
            onClick={onGemeo}
          />
        ) : (
          <Porta
            selo="Novo"
            icone={<UserRound className="h-[22px] w-[22px]" style={{ color: "var(--text-muted)" }} />}
            titulo="O meu gêmeo digital"
            texto="Sem tempo de gravar? Com fotos suas, alguns minutos da sua voz e a sua autorização gravada, o gêmeo fala o roteiro com o seu rosto e a sua voz, e o vídeo segue para a edição como uma gravação sua. Só você pode criar o seu."
            itens={["seu rosto", "sua voz", "a partir do roteiro"]}
            acao={onGemeo ? "Criar ou usar o meu gêmeo" : "Em breve"}
            onClick={onGemeo}
          />
        )}

        {/* Porta 3: tudo com IA, sem gravação. */}
        <Porta
          icone={<Lightbulb className="h-[22px] w-[22px]" style={{ color: "var(--text-muted)" }} />}
          titulo="Gerar tudo com IA"
          texto="Sem gravação. O squad sugere um tema por dia no seu nicho, pesquisa com fontes, escreve na sua voz e cria artes, carrosséis e vídeos. Você aprova cada peça."
          itens={["texto", "imagem", "carrossel", "vídeo por IA"]}
          acao="Começar com IA"
          onClick={onTema}
        />

        {/* Porta 4 (06/10): o conteúdo que o cliente já tem pronto. Não passa
            por redator, Diana nem esteira: sobe, ganha legenda (dele ou da
            IA) e espera a aprovação no quadro. */}
        {onPronto && (
          <Porta
            icone={<FileUp className="h-[22px] w-[22px]" style={{ color: "var(--text-muted)" }} />}
            titulo="Conteúdo pronto seu"
            texto="Suba aqui as suas artes e os seus vídeos prontos (a arte do evento feita no Canva, o vídeo que você já gravou e editou). Nada é editado: entra no quadro como está, e a IA pode escrever a legenda."
            itens={["imagem", "carrossel", "vídeo pronto"]}
            acao="Subir o meu conteúdo"
            onClick={onPronto}
          />
        )}
      </div>

      {/* A SUGESTÃO DA PLATAFORMA, à vista (29/09). Não é trava: é o conselho
          de quem vê os números de todos os clientes. */}
      <div
        className={cn("flex items-start gap-3 rounded-xl border px-4 py-3", cheia && "w-full max-w-[1080px]")}
        style={{ background: "var(--bg-elevated)", borderColor: "var(--border)" }}
      >
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <strong style={{ color: "var(--text-primary)" }}>A nossa sugestão: intercale.</strong> Nas
          semanas em que você grava, comece pelo vídeo: ele rende mais engajamento e custa menos
          créditos. Nas outras, o gêmeo digital ou a IA mantêm a sua presença no ar.
        </p>
      </div>
    </div>
  );
}

function Porta({
  destaque = false,
  selo,
  icone,
  titulo,
  texto,
  itens,
  acao,
  onClick,
}: {
  destaque?: boolean;
  selo?: string;
  icone: React.ReactNode;
  titulo: string;
  texto: string;
  itens: string[];
  acao: string;
  onClick?: () => void;
}) {
  const desligada = !onClick;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desligada}
      className={cn(
        "relative flex flex-col gap-4 rounded-xl border p-5 text-left transition-colors",
        destaque ? "border-orange-500 bg-orange-500/10 hover:bg-orange-500/15" : "hover:border-orange-500/40",
        desligada && "cursor-not-allowed opacity-70 hover:border-[var(--border)]"
      )}
      style={destaque ? undefined : { background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      {selo && (
        <span
          className={cn(
            "absolute right-4 top-4 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            destaque ? "bg-orange-500 text-white" : "bg-orange-500/15 text-orange-400"
          )}
        >
          {selo}
        </span>
      )}
      <div
        className={cn("flex h-10 w-10 items-center justify-center rounded-xl", destaque && "bg-orange-500/15")}
        style={destaque ? undefined : { background: "var(--bg-elevated)" }}
      >
        {icone}
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
          {titulo}
        </span>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {texto}
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {itens.map((t) => (
          <span
            key={t}
            className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", destaque && "bg-orange-500/15 text-orange-400")}
            style={destaque ? undefined : { background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            {t}
          </span>
        ))}
      </div>
      <span
        className={cn(
          "mt-auto flex h-10 items-center justify-center rounded text-sm font-semibold",
          destaque ? "bg-orange-500 text-white" : "border"
        )}
        style={destaque ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
      >
        {acao}
      </span>
    </button>
  );
}
