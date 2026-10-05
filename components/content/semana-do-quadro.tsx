"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock, Loader2, Plus, AlertCircle, X, Building2, UserRound, Archive, ChevronLeft, ChevronRight, Maximize2, Play, Scissors, Eye } from "lucide-react";
import type { EsperaDoCorte } from "@/lib/media/espera-do-corte";
import { cn } from "@/lib/utils";
import { RedeIcone } from "@/components/social/rede-icone";
import { estadoDoPost, horaCurta, NOMES_DAS_REDES, type PostParaEstado } from "@/lib/posts/estado";
import type { EtiquetaDaPeca } from "@/lib/posts/etiqueta-da-peca";
import type { AndamentoDoDia } from "@/lib/pipeline/andamento-dos-dias";

/**
 * A semana, um cartão por dia, e dentro de cada dia as PEÇAS PRONTAS.
 *
 * ## O que mudou em 18/09 à noite
 *
 * A primeira versão do calendário listava os cards da esteira: "Pesquisa",
 * "Preview", "Publicação". O Bruno reprovou: "no calendário deve ter somente
 * as peças prontas, finais, igual um card do Trello, com data e hora prevista,
 * se está aprovado, agendado, publicado, rejeitado, e os símbolos das redes
 * (perfis e páginas)".
 *
 * Então cada peça aqui é um POST FINAL com suas adaptações: o texto do LinkedIn
 * que sai na página, no perfil, no Facebook e no Instagram é UMA peça com
 * quatro destinos; a thread do X é outra; o corte de vídeo, outra. Quem
 * agrupa é a tela (`content-manager.tsx`); aqui só se desenha.
 *
 * ## O que ela não mostra
 *
 * O processo. Pesquisa, revisão e publicação são trabalho dos agentes, e
 * moram no escritório e na ficha de cada um.
 */

/** A capa é um vídeo? O dia de vídeo guarda o mp4 na peça desde 19/09. */
// A rota de mídia do vídeo não termina em .mp4 e também é vídeo (29/09).
const ehVideoNaCapa = (url: string) =>
  /\.(mp4|webm)(\?|$)/i.test(url) ||
  url.startsWith("data:video/") ||
  /\/api\/videos\/[^/]+\/midia\?.*tipo=(vertical|horizontal|completo)(&|$)/.test(url);

/**
 * "fazendo" entrou em 29/09: a peça que o squad ainda está escrevendo ou
 * desenhando dizia "esperando você", e o cliente clicava para aprovar algo
 * que não existia. Esperando você é só a peça PRONTA que falta aprovar.
 */
export type EstadoDaPeca = "fazendo" | "esperando" | "aprovado" | "agendado" | "publicado" | "rejeitado" | "falhou" | "guardado";

export type DestinoDaPeca = {
  plataforma: string;
  /** Perfil ou página, quando a conta é conhecida. */
  tipo: "perfil" | "pagina" | null;
  nome: string | null;
};

/**
 * A MÍDIA DA PEÇA, para ver sem sair do calendário.
 *
 * Pedido do Bruno em 21/09: "no card da semana precisa ter a opção de ver a
 * arte, de clicar, ampliar, de ver o vídeo, o carrossel, não quero ir lá na
 * Diana para ver". A capa vira botão e abre o visor com a peça inteira:
 * imagem ampliada, vídeo com controles, carrossel lâmina a lâmina.
 */
export type MidiaDaPeca = {
  tipo: "imagem" | "video" | "carrossel";
  urls: string[];
  /** O quadro de abertura do vídeo, quando existe. */
  poster?: string | null;
};

export type PecaDoDia = {
  id: string;
  /** A primeira linha do texto, ou o tipo quando não há texto. */
  titulo: string;
  /** "Post", "Corte de vídeo", "Vídeo completo". */
  tipo: string;
  /** "18:00", quando houver hora prevista. */
  hora: string | null;
  /** O instante em milissegundos, só para ordenar. */
  quando?: number;
  /** "era de quinta", quando a peça caiu num dia que não é o dela. */
  origem?: string | null;
  estado: EstadoDaPeca;
  destinos: DestinoDaPeca[];
  /** A imagem da peça, quando houver. */
  capa: string | null;
  /** O que o visor mostra ao clicar na capa. Sem ela, a capa só ilustra. */
  midia?: MidiaDaPeca | null;
  /**
   * O QUE A PEÇA É, e para onde ela vai (21/09).
   *
   * "Post" dizia que aquilo era uma publicação, o que quem olha o calendário
   * já sabia. Esta etiqueta diz carrossel, vídeo, enquete, artigo ou thread, e
   * quando o destino não é o feed diz também reel ou story. Opcional porque a
   * peça guardada e a virtual não têm tipo no banco.
   */
  etiqueta?: EtiquetaDaPeca | null;
};

export type DiaDaSemana = {
  dayOfWeek: number;
  /** "Seg", "Ter". */
  curto: string;
  /** O número do dia no mês. */
  numero: string;
  hoje: boolean;
  /** "Vídeo", "Carrossel". Nulo quando o dia não tem formato definido. */
  formato: string | null;
  pecas: PecaDoDia[];
  /** Em que ponto a geração deste dia está (28/09). Nulo sem campanha. */
  andamento?: AndamentoDoDia | null;
  /**
   * O lugar guardado do corte (05/10): o plano marca vídeo curto neste dia e
   * o corte ainda não chegou. Ver lib/media/espera-do-corte.ts.
   */
  esperasDoCorte?: EsperaDoCorte[];
};

/**
 * O CARTÃO DE ESPERA DO CORTE (05/10).
 *
 * Dia de vídeo curto sem corte pronto ficava vazio, e o cliente achava que o
 * plano tinha pulado o dia. Este cartão guarda o lugar: diz que o corte chega
 * aqui, em que pé ele está e em que redes ele sai. Tracejado de propósito, para
 * não ser lido como peça pronta; quando o corte chega, o cartão de verdade
 * entra no lugar dele. As cores vêm da escala orange-*, que desenha o azul da
 * marca, e o mesmo par de ícone e cor da faixa do andamento.
 */
function CartaoDaEsperaDoCorte({
  e,
  onVerVideo,
  onAbrirCorte,
}: {
  e: EsperaDoCorte;
  onVerVideo?: () => void;
  onAbrirCorte?: (cardId: string, data: string) => void;
}) {
  const andando = e.estado === "cortando";
  // O CORTE JÁ PRONTO (05/10): nada de "chega aqui". O cartão diz que está
  // pronto e abre o próprio corte, sem rolar a tela até a faixa e voltar.
  const pronto = e.estado === "aprovar" && Boolean(e.corte);
  const Icone = pronto ? Eye : andando ? Loader2 : Clock;
  const conteudo = (
    <>
      <span className="flex items-center gap-1.5">
        <span
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-orange-500/35 bg-orange-500/10 text-orange-400"
          aria-hidden
        >
          <Scissors className="h-3 w-3" />
        </span>
        <span className="text-[11.5px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {pronto ? "Corte pronto: aprovar" : "O corte do seu vídeo chega aqui"}
        </span>
      </span>
      {e.redes.length > 0 && (
        <span className="flex flex-wrap items-center gap-1.5" aria-label="Redes deste dia">
          {e.redes.map((r) => (
            <RedeIcone key={r} plataforma={r} className="h-3.5 w-3.5" />
          ))}
        </span>
      )}
      <span
        className={cn(
          "flex items-center gap-1 text-[10.5px] font-semibold",
          pronto || andando ? "text-orange-400" : "text-[var(--text-muted)]"
        )}
      >
        <Icone className={cn("h-3 w-3 shrink-0", andando && "animate-spin motion-reduce:animate-none")} />
        {e.rotulo}
      </span>
      <span className="line-clamp-3 text-[10px] leading-snug" style={{ color: "var(--text-muted)" }} title={e.detalhe}>
        {e.detalhe}
      </span>
      {andando && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden">
          <span className="block h-full w-1/3 animate-[correBarra_1.4s_ease-in-out_infinite] motion-reduce:hidden" style={{ background: "var(--accent-orange)" }} />
        </span>
      )}
    </>
  );
  const classe =
    "relative flex w-full flex-col gap-1.5 overflow-hidden rounded-lg border border-dashed px-2.5 py-2 text-left transition-colors";
  const estilo = {
    background: "var(--bg-input)",
    borderColor: pronto ? "rgba(246,128,61,.55)" : "var(--border)",
  };
  const aoClicar = pronto ? (onAbrirCorte && e.corte ? () => onAbrirCorte(e.corte!.cardId, e.corte!.data) : undefined) : onVerVideo;
  return aoClicar ? (
    <button
      type="button"
      data-espera-do-corte={e.estado}
      onClick={aoClicar}
      title={pronto ? "Assistir e aprovar o corte" : "Ver a gravação e os cortes, na faixa do vídeo"}
      className={cn(classe, "hover:border-orange-500/60")}
      style={estilo}
    >
      {conteudo}
    </button>
  ) : (
    <div data-espera-do-corte={e.estado} role="status" className={classe} style={estilo}>
      {conteudo}
    </div>
  );
}

/**
 * A FAIXA DO ANDAMENTO, no topo do dia (28/09).
 *
 * Pedido do Bruno: "o usuário fica sem saber se travou, se acabou ou se
 * finalizou". Três estados que a tela precisa separar: ANDANDO (ícone girando
 * e o passo: "Carrossel: lâmina 4 de 5 pronta"), NA FILA (relógio, parado de
 * propósito) e PARADO (âmbar, com os minutos sem novidade). Pronto não mostra
 * faixa: a peça no cartão já é a resposta.
 */
function FaixaDoAndamento({ a }: { a: AndamentoDoDia }) {
  if (a.fase === "pronto") return null;
  const naFila = a.fase === "fila";
  const cor = a.parado ? "#f59e0b" : naFila ? "var(--text-muted)" : "var(--accent-orange)";
  return (
    <div
      role="status"
      className="relative flex items-start gap-1.5 rounded-md border px-1.5 py-1.5"
      style={{ borderColor: a.parado ? "rgba(245,158,11,.5)" : "var(--border)", background: a.parado ? "rgba(245,158,11,.08)" : "var(--bg-input)" }}
    >
      {naFila ? (
        <Clock className="mt-[1px] h-3 w-3 shrink-0" style={{ color: cor }} />
      ) : a.parado ? (
        <AlertCircle className="mt-[1px] h-3 w-3 shrink-0" style={{ color: cor }} />
      ) : (
        <Loader2 className="mt-[1px] h-3 w-3 shrink-0 animate-spin" style={{ color: cor }} />
      )}
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold leading-tight" style={{ color: a.parado ? "#b45309" : "var(--text-primary)" }}>
          {a.detalhe}
        </p>
        {a.parado && (
          <p className="mt-0.5 text-[9.5px] leading-tight" style={{ color: "var(--text-muted)" }}>
            Sem novidade há {a.minutos} min. A fila retoma sozinha; se passar de 15 min, abra o card e peça ajuda.
          </p>
        )}
      </div>
      {!naFila && !a.parado && (
        // A barrinha que corre: movimento é o que diz "está andando".
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden rounded-b-md">
          <span className="block h-full w-1/3 animate-[correBarra_1.4s_ease-in-out_infinite] motion-reduce:hidden" style={{ background: "var(--accent-orange)" }} />
        </span>
      )}
    </div>
  );
}

const ESTADO: Record<EstadoDaPeca, { rotulo: string; cor: string; classe: string }> = {
  fazendo: { rotulo: "o squad está fazendo", cor: "#c084fc", classe: "text-purple-400" },
  esperando: { rotulo: "esperando você", cor: "#f6803d", classe: "text-orange-400" },
  aprovado: { rotulo: "aprovado", cor: "#4ade80", classe: "text-green-400" },
  agendado: { rotulo: "agendado", cor: "#60a5fa", classe: "text-blue-400" },
  publicado: { rotulo: "publicado", cor: "#4ade80", classe: "text-green-400" },
  rejeitado: { rotulo: "rejeitado", cor: "#f87171", classe: "text-red-400" },
  falhou: { rotulo: "falhou", cor: "#f87171", classe: "text-red-400" },
  guardado: { rotulo: "guardado, não sai", cor: "#9599a6", classe: "text-[var(--text-muted)]" },
};

function IconeDoEstado({ estado }: { estado: EstadoDaPeca }) {
  if (estado === "publicado" || estado === "aprovado") return <Check className="h-3 w-3 shrink-0" />;
  if (estado === "rejeitado") return <X className="h-3 w-3 shrink-0" />;
  if (estado === "falhou") return <AlertCircle className="h-3 w-3 shrink-0" />;
  if (estado === "guardado") return <Archive className="h-3 w-3 shrink-0" />;
  if (estado === "fazendo") return <Loader2 className="h-3 w-3 shrink-0 animate-spin motion-reduce:animate-none" />;
  if (estado === "agendado") return <Loader2 className="h-3 w-3 shrink-0" />;
  return <Clock className="h-3 w-3 shrink-0" />;
}

/**
 * UM SELO POR REDE, com o número de contas quando há mais de uma (21/09).
 *
 * O Bruno olhou um dia com cinco ícones em quatro redes e leu defeito. Estava
 * certo: o projeto tem perfil E página no LinkedIn, e nada na tela dizia isso.
 *
 * Duas tentativas antes desta, e as duas na tela real:
 *
 *   1. o nome da conta ao lado de cada ícone repetido: os destinos viraram uma
 *      COLUNA de oito linhas e tomaram o cartão inteiro;
 *   2. uma frase embaixo ("3 contas no LinkedIn, 2 contas no Instagram…"):
 *      quatro linhas de texto num cartão de 110 pixels.
 *
 * Agrupar resolve as duas coisas de uma vez: nove ícones viram quatro selos,
 * e o "×3" diz por que aquela rede aparece mais de uma vez. As contas, uma a
 * uma, continuam no rótulo do selo.
 */
function agruparDestinos(destinos: DestinoDaPeca[]): Array<{ plataforma: string; contas: DestinoDaPeca[] }> {
  const porRede = new Map<string, DestinoDaPeca[]>();
  for (const d of destinos) porRede.set(d.plataforma, [...(porRede.get(d.plataforma) ?? []), d]);
  return [...porRede.entries()].map(([plataforma, contas]) => ({ plataforma, contas }));
}

function SeloDaRede({ plataforma, contas }: { plataforma: string; contas: DestinoDaPeca[] }) {
  const nomeDaRede = NOMES_DAS_REDES[plataforma] ?? plataforma;
  const rotulo =
    contas.length === 1
      ? `${nomeDaRede}${contas[0].nome ? `: ${contas[0].nome}` : ""}${contas[0].tipo ? ` (${contas[0].tipo === "pagina" ? "página" : "perfil"})` : ""}`
      : `${nomeDaRede}, ${contas.length} contas: ${contas
          .map((c) => `${c.nome ?? "conta"}${c.tipo ? ` (${c.tipo === "pagina" ? "página" : "perfil"})` : ""}`)
          .join(", ")}`;
  const unica = contas.length === 1 ? contas[0] : null;

  return (
    <span className="inline-flex items-center gap-0.5" title={rotulo} aria-label={rotulo}>
      <span className="relative inline-flex h-4 w-4 items-center justify-center">
        <RedeIcone plataforma={plataforma} className="h-3.5 w-3.5" />
        {/* O glifo de perfil ou página só faz sentido com UMA conta: com duas,
            quem diz o que são é o rótulo, e o número toma o lugar dele. */}
        {unica?.tipo && (
          <span
            className="absolute -bottom-1 -right-1 flex h-2.5 w-2.5 items-center justify-center rounded-full border"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)", color: "var(--text-muted)" }}
          >
            {unica.tipo === "pagina" ? <Building2 className="h-[7px] w-[7px]" /> : <UserRound className="h-[7px] w-[7px]" />}
          </span>
        )}
      </span>
      {/* Uma string só: o React separa nós de texto adjacentes no HTML, e o
          "×2" chegava partido em dois. */}
      {contas.length > 1 && (
        <span className="text-[9.5px] font-semibold leading-none" style={{ color: "var(--text-muted)" }}>
          {`×${contas.length}`}
        </span>
      )}
    </span>
  );
}

function CartaoDaPeca({ p, onAbrir, onVerMidia, onArquivar }: { p: PecaDoDia; onAbrir: () => void; onVerMidia?: () => void; onArquivar?: () => void }) {
  const e = ESTADO[p.estado];
  const temVisor = Boolean(p.midia && onVerMidia);
  // A CAPA QUE NÃO CARREGA (03/10): o vídeo do gêmeo sem capa ainda devolvia
  // 404 e o cartão mostrava o ícone de imagem quebrada. Com vídeo, o primeiro
  // quadro do próprio mp4 entra no lugar; sem vídeo, a capa some.
  const [capaFalhou, setCapaFalhou] = useState(false);
  const videoDaPeca = p.midia?.tipo === "video" ? p.midia.urls[0] : null;
  const capa = capaFalhou ? videoDaPeca : p.capa;
  return (
    // Um `div` com DOIS botões, e não um botão só: a capa abre o visor da
    // mídia e o corpo abre o card. Botão dentro de botão não existe em HTML.
    <div
      className="group/peca relative flex w-full flex-col overflow-hidden rounded-lg border text-left transition-all hover:-translate-y-[1px] hover:border-orange-500/45"
      style={{ background: "var(--bg-elevated)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
    >
      {/* a faixa do estado, à esquerda, como a etiqueta de um card do Trello */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-[3px]" style={{ background: e.cor }} />
      {/* A TARJA DE ORIGEM fica sobre a capa, e não na linha do tipo: o cartão
          do dia tem uns 110px, e "Post · era de quinta" quebrava o rodapé em
          quatro linhas. */}
      {p.origem && (
        <span
          className="absolute right-1.5 top-1.5 z-10 rounded px-1.5 py-[2px] text-[9.5px] font-semibold"
          style={{ background: "rgba(0,0,0,.72)", color: "#f6803d", backdropFilter: "blur(2px)" }}
          title="O horário deste dia já tinha passado quando a campanha rodou, então ela saiu no dia seguinte."
        >
          {p.origem}
        </span>
      )}
      {capa && (
        <button
          type="button"
          data-capa
          onClick={temVisor ? onVerMidia : onAbrir}
          aria-label={temVisor ? `Ver ${p.midia!.tipo === "video" ? "o vídeo" : p.midia!.tipo === "carrossel" ? "o carrossel" : "a arte"} de ${p.titulo}` : p.titulo}
          className="relative block w-full"
        >
          {/* `object-top`, e não o centro: a miniatura tem 56px de altura e a
              arte do Instagram e do Facebook é vertical (4:5, 9:16), então o
              recorte centrado comia a MANCHETE, que nas nossas peças fica
              sempre no topo. O Bruno viu "1 gravação parada virou 15
              publicações" cortada aqui em 19/09 e achou que a Diana tinha
              gerado a arte cortada; a arte estava inteira, quem cortava era
              esta linha. */}
          {ehVideoNaCapa(capa) || (capaFalhou && videoDaPeca) ? (
            // Peça de vídeo sem quadro guardado: o próprio mp4, mudo e parado
            // no primeiro frame. Um `<img src="...mp4">` seria imagem quebrada.
            <video src={capa} muted playsInline preload="metadata" className="h-14 w-full object-cover object-top" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={capa} alt="" className="h-14 w-full object-cover object-top" loading="lazy" onError={() => setCapaFalhou(true)} />
          )}
          {temVisor && (
            <span
              className="absolute bottom-1 right-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] font-semibold"
              style={{ background: "rgba(0,0,0,.62)", color: "#fff" }}
            >
              {p.midia!.tipo === "video" ? <Play className="h-2.5 w-2.5" /> : <Maximize2 className="h-2.5 w-2.5" />}
              {p.midia!.tipo === "video" ? "vídeo" : p.midia!.tipo === "carrossel" ? `${p.midia!.urls.length} lâminas` : "ampliar"}
            </span>
          )}
        </button>
      )}
      <button
        type="button"
        onClick={onAbrir}
        // A hora antes da aprovação é proposta, e o rótulo diz isso (29/09).
        title={`${p.tipo}${p.hora ? (p.estado === "agendado" ? `, agendado para ${p.hora}` : p.estado === "esperando" || p.estado === "fazendo" ? `, sai ${p.hora} se você aprovar` : `, ${p.hora}`) : ""}: ${p.titulo}`}
        className="flex w-full flex-col gap-1.5 px-2.5 pb-2 pt-1.5 pl-3 text-left"
      >
        {/* Os selos ficam sozinhos na linha: com cinco destinos eles ocupam a
            largura toda do cartão, e a hora, que dividia esta linha até
            18/09, era simplesmente empurrada para fora da tela. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {agruparDestinos(p.destinos).map((g) => (
            <SeloDaRede key={g.plataforma} plataforma={g.plataforma} contas={g.contas} />
          ))}
        </div>
        {/* A ETIQUETA DO TIPO, antes do texto: quem varre a semana procurando
            "que dia sai o carrossel?" lê isto e não precisa abrir card nenhum.
            O formato só aparece quando não é feed, porque feed é o comum e
            dizer o comum em todo cartão é ruído. */}
        {p.etiqueta && (
          <span className="flex flex-wrap items-center gap-1">
            <span
              className="rounded px-1.5 py-[1px] text-[9.5px] font-semibold"
              style={{ background: "var(--bg-primary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              {/* Uma string só, e não dois nós de texto colados: o React separa
                  nós adjacentes no HTML e a etiqueta chegava partida em dois. */}
              {p.etiqueta.detalhe ? `${p.etiqueta.tipo} · ${p.etiqueta.detalhe}` : p.etiqueta.tipo}
            </span>
            {p.etiqueta.formato && (
              <span
                className="rounded px-1.5 py-[1px] text-[9.5px] font-semibold text-orange-400"
                style={{ background: "rgba(246,128,61,.10)", border: "1px solid rgba(246,128,61,.35)" }}
                title={
                  p.etiqueta.formato === "Story"
                    ? "Story: some em 24 horas"
                    : "Reel: vertical, 9:16"
                }
              >
                {p.etiqueta.formato}
              </span>
            )}
          </span>
        )}
        <span className="line-clamp-2 text-[11.5px] font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
          {p.titulo}
        </span>
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 text-[10.5px]">
          <span style={{ color: "var(--text-muted)" }}>
            {p.tipo}
            {p.hora && <b className="font-semibold tabular-nums"> · {p.hora}</b>}
          </span>
          <span className={cn("flex items-center gap-1 font-semibold", e.classe)}>
            <IconeDoEstado estado={p.estado} />
            {e.rotulo}
          </span>
        </span>
      </button>
      {/* ARQUIVAR A PEÇA QUE FALHOU, aqui mesmo (01/10, pedido do Bruno: "os
          posts que falham, eu não consigo arquivar, preciso conseguir, para
          limpar o gestor"). Fica fora do botão que abre o card: botão dentro
          de botão não existe. Arquivar tem volta (Posts, aba Arquivados). */}
      {p.estado === "falhou" && onArquivar && (
        <button
          type="button"
          data-arquivar-peca
          onClick={onArquivar}
          className="flex items-center justify-center gap-1 border-t px-2 py-1 text-[10.5px] font-medium transition-colors hover:bg-red-500/10 hover:text-red-400"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          title="Arquivar os posts desta peça que falharam. Tem volta: Posts, aba Arquivados."
        >
          <Archive className="h-3 w-3" />
          Arquivar
        </button>
      )}
    </div>
  );
}

/**
 * O VISOR: a mídia da peça em tamanho de ver.
 *
 * Imagem ampliada, vídeo com controles (o mp4 do dia, com o quadro de
 * abertura como poster), carrossel lâmina a lâmina com setas e contador.
 * Fecha no fundo, no X e no Esc. Puro de propósito: recebe a mídia e
 * desenha, e é assim que o renderToString prova os três casos.
 */
export function VisorDeMidia({ midia, titulo, onFechar }: { midia: MidiaDaPeca; titulo: string; onFechar: () => void }) {
  const [indice, setIndice] = useState(0);
  const urls = midia.urls;
  const atual = urls[Math.min(indice, urls.length - 1)] ?? "";
  useEffect(() => {
    const tecla = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") onFechar();
      if (midia.tipo === "carrossel" && ev.key === "ArrowRight") setIndice((i) => Math.min(i + 1, urls.length - 1));
      if (midia.tipo === "carrossel" && ev.key === "ArrowLeft") setIndice((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [midia.tipo, urls.length, onFechar]);

  return (
    <div
      data-visor
      role="dialog"
      aria-label={`Mídia de ${titulo}`}
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      // Fundo opaco e SEM desfoque (30/09). O `backdrop-filter` obrigava o
      // navegador a refazer o desfoque da tela inteira a cada quadro do vídeo
      // por cima: medido no Gestor, o corte derrubava 179 a 262 de 360 quadros
      // em 12 s, e sem o desfoque, zero. É o "travando" que o Bruno viu.
      style={{ background: "rgba(0,0,0,.9)" }}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onFechar();
      }}
    >
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar"
        className="absolute right-4 top-4 rounded-lg p-2 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="flex max-h-full max-w-5xl flex-col items-center gap-3">
        {midia.tipo === "video" ? (
          <video
            src={atual}
            poster={midia.poster ?? undefined}
            controls
            autoPlay
            playsInline
            className="max-h-[82vh] max-w-full rounded-xl bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={atual} alt={titulo} className="max-h-[82vh] max-w-full rounded-xl object-contain" />
        )}
        {midia.tipo === "carrossel" && urls.length > 1 && (
          <div className="flex items-center gap-3 text-sm text-white">
            <button
              type="button"
              onClick={() => setIndice((i) => Math.max(i - 1, 0))}
              disabled={indice === 0}
              aria-label="Lâmina anterior"
              className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <span className="tabular-nums">{indice + 1} / {urls.length}</span>
            <button
              type="button"
              onClick={() => setIndice((i) => Math.min(i + 1, urls.length - 1))}
              disabled={indice === urls.length - 1}
              aria-label="Próxima lâmina"
              className="rounded-full p-2 hover:bg-white/10 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
        <p className="max-w-2xl text-center text-xs text-white/70">{titulo}</p>
      </div>
    </div>
  );
}

export function SemanaDoQuadro({
  dias,
  onAbrirDia,
  onAbrirPeca,
  onArquivarPeca,
  onVerVideo,
  onAbrirCorte,
}: {
  dias: DiaDaSemana[];
  /** Clicar no vazio de um dia: é por onde se põe algo naquele dia. */
  onAbrirDia: (dayOfWeek: number) => void;
  onAbrirPeca: (pecaId: string) => void;
  /** Arquivar os posts com falha da peça (01/10). Sem ele, o botão não aparece. */
  onArquivarPeca?: (pecaId: string) => void;
  /** Levar o cliente à faixa do vídeo, a partir do cartão de espera do corte (05/10). */
  onVerVideo?: () => void;
  /** Abrir o corte pronto que o cartão "Corte pronto: aprovar" aponta (05/10). */
  onAbrirCorte?: (cardId: string, data: string) => void;
}) {
  // A peça cuja mídia está aberta no visor. Estado da semana, e não do
  // cartão, porque o visor cobre a tela inteira.
  const [visor, setVisor] = useState<PecaDoDia | null>(null);
  return (
    <>
    {visor?.midia && <VisorDeMidia midia={visor.midia} titulo={visor.titulo} onFechar={() => setVisor(null)} />}
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
      {dias.map((dia, i) => (
        <motion.div
          key={dia.dayOfWeek}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.42, delay: i * 0.045, ease: [0.2, 0.7, 0.3, 1] }}
          className={cn(
            "group relative flex min-h-[200px] flex-col gap-2 overflow-hidden rounded-xl border p-2.5 transition-all duration-200",
            "hover:border-orange-500/45"
          )}
          style={{
            background: "var(--bg-card)",
            borderColor: dia.hoje ? "color-mix(in srgb, var(--acento) 60%, transparent)" : "var(--border)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-70"
            style={{
              backgroundImage:
                "linear-gradient(var(--linha-malha) 1px, transparent 1px), linear-gradient(90deg, var(--linha-malha) 1px, transparent 1px)",
              backgroundSize: "22px 22px",
              maskImage: "radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 78%)",
              WebkitMaskImage: "radial-gradient(120% 90% at 50% 0%, #000 20%, transparent 78%)",
            }}
          />
          {dia.hoje && (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-[2px] motion-reduce:hidden"
              style={{
                background: "linear-gradient(90deg, transparent, var(--accent-orange), transparent)",
                animation: "varreDia 3.4s ease-in-out infinite",
              }}
            />
          )}

          <div className="relative flex items-baseline justify-between gap-1.5 px-0.5">
            <span
              className={cn(
                "text-[11px] font-extrabold uppercase tracking-[.07em]",
                dia.hoje ? "text-orange-400" : "text-[var(--text-muted)]"
              )}
            >
              {dia.curto}
              {dia.hoje && " · hoje"}
            </span>
            <span
              className={cn(
                "text-[21px] font-extrabold leading-none tabular-nums",
                dia.hoje ? "text-orange-400" : "text-[var(--text-primary)]"
              )}
            >
              {dia.numero}
            </span>
          </div>

          {dia.formato && (
            <span
              className="relative self-start rounded-md border px-1.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[.03em]"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {dia.formato}
            </span>
          )}

          {dia.andamento && <FaixaDoAndamento a={dia.andamento} />}

          {dia.pecas.length > 0 || dia.esperasDoCorte?.length ? (
            <div className="relative flex flex-col gap-2">
              {dia.pecas.map((p) => (
                <CartaoDaPeca key={p.id} p={p} onAbrir={() => onAbrirPeca(p.id)} onVerMidia={p.midia ? () => setVisor(p) : undefined} onArquivar={onArquivarPeca ? () => onArquivarPeca(p.id) : undefined} />
              ))}
              {/* O lugar do corte que ainda não chegou (05/10), depois das
                  peças prontas: quando o corte chega, ele vira peça e o
                  cartão de espera some. */}
              {dia.esperasDoCorte?.map((e) => (
                <CartaoDaEsperaDoCorte key={e.id} e={e} onVerVideo={onVerVideo} onAbrirCorte={onAbrirCorte} />
              ))}
            </div>
          ) : dia.andamento && dia.andamento.fase !== "pronto" ? null : (
            <button
              type="button"
              onClick={() => onAbrirDia(dia.dayOfWeek)}
              className="relative mt-auto flex w-full items-center justify-center gap-1 rounded-lg border border-dashed px-2 py-2 text-[11px] text-[var(--text-muted)] transition-colors hover:border-orange-500/50 hover:text-orange-400"
              style={{ borderColor: "var(--border)" }}
            >
              <Plus className="h-3 w-3" />
              pôr algo aqui
            </button>
          )}
        </motion.div>
      ))}
    </div>
    </>
  );
}

/**
 * A próxima coisa que vai acontecer nesta semana.
 *
 * É a única informação que justifica voltar nesta tela amanhã: "sete peças" é
 * um número que não pede ação nenhuma, e "a próxima sai hoje às 18:00" é.
 */
export function proximaPeca(posts: PostParaEstado[], agora: Date = new Date()): string | null {
  let cedo: Date | null = null;
  for (const p of posts) {
    const e = estadoDoPost(p, agora);
    if (e.chave !== "agendado" || !p.scheduledAt) continue;
    const quando = new Date(p.scheduledAt);
    if (Number.isNaN(quando.getTime()) || quando <= agora) continue;
    if (!cedo || quando < cedo) cedo = quando;
  }
  if (!cedo) return null;

  const hojeBrt = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const diaDaPeca = cedo.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return diaDaPeca === hojeBrt
    ? `hoje às ${horaCurta(cedo)}`
    : `${cedo.toLocaleDateString("pt-BR", { weekday: "long", timeZone: "America/Sao_Paulo" })} às ${horaCurta(cedo)}`;
}
