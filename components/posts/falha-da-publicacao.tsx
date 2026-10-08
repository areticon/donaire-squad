"use client";

import { useState } from "react";
import { AlertCircle, Archive } from "lucide-react";
import { TRADUCAO_DOS_CODIGOS, type CodigoDePublicacao } from "@/lib/publish/codigos";
import { abrirChamado as abrirJanelaDeChamado } from "@/lib/suporte/abrir-chamado";
import { BotaoDescartar, Descartavel } from "@/components/ui/descartar";

/**
 * A CHAVE DO DESCARTE da falha de publicação de um post (07/10), em
 * lib/avisos/chaves.ts: a marca é a do erro gravado (ou do código da ponte), a
 * mesma regra de ocorrência de `chamadoDaFalha`: uma falha nova muda a frase,
 * e o aviso volta. Nunca o updatedAt, que muda a cada métrica ou sincronização.
 */
export { chaveDoPostQueFalhou } from "@/lib/avisos/chaves";

/**
 * O AVISO RECOLHIDO (07/10): descartado o cartão da falha, fica uma linha sem
 * cor de alerta, com o Arquivar quando há. O post continua "falhou" no quadro
 * e em Posts.
 */
export function LinhaDaPublicacaoRecolhida({ rede, onArquivar }: { rede?: string | null; onArquivar?: () => Promise<void> | void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2 border" style={{ borderColor: "var(--border)" }} data-falha-recolhida>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        A publicação {rede ? `no ${rede} ` : ""}falhou.
      </p>
      {onArquivar && (
        <button
          type="button"
          onClick={() => void onArquivar()}
          className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:border-red-400/50 hover:text-red-400"
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
          title="Tira este post do Gestor. Tem volta: Posts, aba Arquivados."
        >
          <Archive className="w-3 h-3" />
          Arquivar
        </button>
      )}
    </div>
  );
}

/**
 * O CARTÃO DA FALHA DE PUBLICAÇÃO (01/10/2026): o código PUB-* traduzido.
 *
 * Antes, o cliente via a frase gravada cortada em 90 caracteres, e o código
 * (que fica no fim da frase) era justamente o que sumia. Aqui ele lê o que
 * aconteceu, o que pode fazer e o código, com o botão de chamado quando o
 * chamado ajuda. O detalhe técnico nunca chega aqui: ele está em
 * `lib/publish/codigos-admin.ts` e vai para o e-mail do chamado e o painel do
 * admin (regra de 21/09: o cliente recebe código e caminho).
 *
 * Recebe só dados prontos (código, protocolo, motivo da rede): este componente
 * não importa nada que toque o banco.
 */
export function FalhaDaPublicacao({
  postId,
  codigo,
  protocolo: protocoloInicial,
  motivoDaRede,
  compacto,
  onChamado,
  onArquivar,
  chave,
  rede,
}: {
  postId: string;
  codigo: CodigoDePublicacao;
  /** O chamado já aberto para esta mesma falha, quando há. */
  protocolo?: string | null;
  /** O motivo que a própria rede deu (já filtrado no servidor), quando veio. */
  motivoDaRede?: string | null;
  /** Versão de uma linha a menos, para listas apertadas. */
  compacto?: boolean;
  onChamado?: (protocolo: string) => void;
  /**
   * Arquivar o post que falhou (01/10, pedido do Bruno: "os posts que falham,
   * eu não consigo arquivar"). O cartão explicava e abria chamado, mas a saída
   * de quem só quer limpar o Gestor não estava aqui. Quem passa a função
   * cuida do toast e de atualizar o quadro.
   */
  onArquivar?: () => Promise<void> | void;
  /**
   * A chave do descarte (07/10, `chaveDoPostQueFalhou`). Descartado, o cartão
   * recolhe numa linha com o Arquivar. Sem chave, o X esconde só nesta visita.
   */
  chave?: string | null;
  /** O nome da rede, para a linha recolhida ("A publicação no LinkedIn falhou"). */
  rede?: string | null;
}) {
  const t = TRADUCAO_DOS_CODIGOS[codigo];
  const [protocolo, setProtocolo] = useState<string | null>(protocoloInicial ?? null);
  const [abrindo, setAbrindo] = useState(false);
  const [arquivando, setArquivando] = useState(false);

  // Desde 02/10 o botão abre a janela de ajuda com o código e a peça já
  // preenchidos (lib/suporte/abrir-chamado.ts); o chamado ganha número (#0012)
  // e o diagnóstico continua sendo montado no servidor.
  function abrirChamado() {
    setAbrindo(true);
    abrirJanelaDeChamado({
      categoria: "problema",
      codigo,
      postId,
      aoAbrir: (p) => {
        setProtocolo(p);
        onChamado?.(p);
      },
    });
    setTimeout(() => setAbrindo(false), 400);
  }

  return (
    <Descartavel chave={chave} modo="recolher" compacto={<LinhaDaPublicacaoRecolhida rede={rede} onArquivar={onArquivar} />}>
    <div
      className="flex items-start gap-2.5 rounded-xl px-4 py-3 border"
      style={{ borderColor: "rgba(248,113,113,0.3)", background: "rgba(185,28,28,0.06)" }}
      data-codigo-da-falha={codigo}
    >
      <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-red-400">{t.titulo}</p>
        <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {t.explicacao}
          {motivoDaRede ? ` Motivo informado pela rede: ${motivoDaRede}.` : ""}
        </p>
        {!compacto && (
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: "var(--text-secondary, var(--text-muted))" }}>
            <b className="font-semibold">O que fazer:</b> {t.oQueFazer}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span
            className="text-[10px] font-semibold px-1.5 py-[2px] rounded font-mono"
            style={{ background: "var(--bg-primary)", border: "1px solid var(--border)", color: "var(--text-secondary, var(--text-muted))" }}
            title="Informe este código se falar com o suporte"
          >
            {codigo}
          </span>
          {t.chamado &&
            (protocolo ? (
              <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                Chamado aberto: <b className="font-mono">{protocolo}</b>. Você recebe a resposta por e-mail.
              </span>
            ) : (
              <button
                type="button"
                disabled={abrindo}
                onClick={() => abrirChamado()}
                className="text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                {abrindo ? "Abrindo..." : "Abrir chamado"}
              </button>
            ))}
          {onArquivar && (
            <button
              type="button"
              data-arquivar-falha
              disabled={arquivando}
              onClick={async () => {
                setArquivando(true);
                try {
                  await onArquivar();
                } finally {
                  setArquivando(false);
                }
              }}
              className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-1 rounded-md border transition-all hover:border-red-400/50 hover:text-red-400 disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              title="Tira este post do Gestor. Tem volta: Posts, aba Arquivados."
            >
              <Archive className="w-3 h-3" />
              {arquivando ? "Arquivando..." : "Arquivar"}
            </button>
          )}
        </div>
      </div>
      <BotaoDescartar compacto />
    </div>
    </Descartavel>
  );
}
