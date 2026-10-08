"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Headset, CheckCircle2 } from "lucide-react";
import { BotaoDescartar, useDescarte } from "@/components/ui/descartar";
import { chaveDaConexaoAssistida } from "@/lib/avisos/chaves";
import { Button } from "@/components/ui/button";
import { NOME_DA_REDE, O_QUE_PREPARAR, POR_QUE_ASSISTIDA, type PedidoDeConexao } from "@/lib/social/textos-da-conexao";

/**
 * A CAIXA DA CONEXÃO ASSISTIDA (01/10), no lugar do "Conectar" da rede que o
 * cliente de fora ainda não consegue conectar sozinho (app da rede sem
 * aprovação). Ver lib/social/conexao-assistida.ts.
 *
 * Só importa textos puros e componentes de tela: componente de cliente nunca
 * importa módulo que toca o banco.
 *
 * Três estados: sem pedido (explica e pede), pedido feito (diz quando e o que
 * vem depois, para a pessoa não clicar de novo achando que não foi) e conta já
 * conectada (uma linha discreta para pedir outra conta).
 */
export function ConexaoAssistida({
  projectId,
  rede,
  pedido: pedidoRecebido,
  temConta,
  conectarDiretoUrl,
  onPedido,
  compacta = false,
}: {
  projectId: string;
  rede: string;
  pedido: PedidoDeConexao | null;
  temConta: boolean;
  /** Só para admin: o OAuth próprio, que funciona para quem tem papel no app. */
  conectarDiretoUrl?: string | null;
  onPedido: (p: PedidoDeConexao) => void;
  /** No assistente do projeto o espaço é menor: sem o texto longo. */
  compacta?: boolean;
}) {
  // Conta já conectada encerra o pedido (04/10, print do Bruno: a faixa
  // "Pedido enviado" ficava em cima da conta já ligada pelo admin).
  const pedido = temConta ? null : pedidoRecebido;
  const [aberta, setAberta] = useState(!temConta && !compacta);
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nomeRede = NOME_DA_REDE[rede] ?? rede;

  async function pedir() {
    setEnviando(true);
    try {
      const res = await fetch("/api/social/conexao-assistida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, rede, nota }),
      });
      const d = (await res.json().catch(() => ({}))) as { pedidoEm?: string; jaPedido?: boolean; error?: string };
      if (!res.ok || !d.pedidoEm) throw new Error(d.error ?? "Não consegui registrar o pedido agora.");
      onPedido({ rede, pedidoEm: d.pedidoEm });
      toast.success(
        d.jaPedido
          ? `Seu pedido do ${nomeRede} já estava com a gente. Vamos te chamar por e-mail.`
          : `Pedido enviado. Vamos te chamar por e-mail para conectar o ${nomeRede}.`,
        { duration: 6000 }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui registrar o pedido agora.");
    } finally {
      setEnviando(false);
    }
  }

  const quando = pedido
    ? new Date(pedido.pedidoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "";
  // O "Pedido enviado" se descarta (07/10) no modo RECOLHER: sai o texto longo
  // e a cor, e fica uma linha discreta com a data. Sumir de vez deixava a
  // seção da rede vazia (sem conta, o painel não mostra o "Conectar" na rede
  // assistida), sem dizer que há um pedido aberto.
  const avisoDoPedido = useDescarte(pedido ? chaveDaConexaoAssistida(rede, pedido.pedidoEm) : null);
  if (pedido && avisoDoPedido.descartado) {
    return (
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-xs ${compacta ? "" : "mb-3"}`} style={{ color: "var(--text-muted)" }} data-conexao-assistida={rede} data-recolhida>
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Conexão assistida pedida em {quando}.</span>
        {conectarDiretoUrl && (
          <a href={conectarDiretoUrl} className="text-[11px] underline hover:text-orange-400">
            Admin: conectar direto
          </a>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border p-3 sm:p-4 ${compacta ? "" : "mb-3"}`}
      style={{ background: "var(--bg-card)", borderColor: "color-mix(in srgb, var(--acento) 35%, transparent)" }}
      data-conexao-assistida={rede}
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
          {pedido ? <CheckCircle2 className="w-4 h-4" /> : <Headset className="w-4 h-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Conexão assistida
          </p>
          {pedido ? (
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Pedido enviado em {quando}. Vamos te chamar por e-mail para marcar 15 minutos e conectar o {nomeRede} junto
              com você.
            </p>
          ) : temConta && !aberta ? (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              Para conectar outra conta do {nomeRede}, peça uma nova conexão assistida.
            </p>
          ) : (
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              {compacta && !aberta ? "Conectamos junto com você numa chamada de 15 minutos." : POR_QUE_ASSISTIDA}
            </p>
          )}
        </div>
        {!pedido && !aberta && (
          <Button size="sm" variant="outline" className="ml-11 text-xs shrink-0 sm:ml-0" onClick={() => setAberta(true)}>
            {temConta ? "Pedir outra" : "Conexão assistida"}
          </Button>
        )}
        {pedido && <BotaoDescartar compacto aoDescartar={() => avisoDoPedido.descartar()} />}
      </div>

      {!pedido && aberta && (
        <div className="mt-3 space-y-2 sm:pl-11">
          {O_QUE_PREPARAR[rede] && (
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary, var(--text-muted))" }}>
              <strong style={{ color: "var(--text-primary)" }}>Tenha à mão:</strong> {O_QUE_PREPARAR[rede]} Na chamada, você
              mesmo entra na sua conta: nunca pedimos a sua senha.
            </p>
          )}
          <textarea
            value={nota}
            onChange={(e) => setNota(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="Melhor dia e horário para a chamada (opcional)"
            className="w-full rounded-lg border px-3 py-2 text-xs outline-none focus:border-orange-500"
            style={{ background: "var(--bg-input, var(--bg-primary))", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" className="text-xs" onClick={pedir} disabled={enviando}>
              {enviando ? "Enviando..." : "Pedir a conexão"}
            </Button>
            {temConta && (
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setAberta(false)}>
                Agora não
              </Button>
            )}
          </div>
        </div>
      )}

      {conectarDiretoUrl && (
        <p className="text-[11px] mt-2 sm:pl-11" style={{ color: "var(--text-muted)" }}>
          Admin:{" "}
          <a href={conectarDiretoUrl} className="underline hover:text-orange-400">
            conectar direto pelo app da Demandou
          </a>{" "}
          (só funciona para quem tem papel no app da rede).
        </p>
      )}
    </div>
  );
}
