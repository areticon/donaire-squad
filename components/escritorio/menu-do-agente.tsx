"use client";

import { useEffect, useRef, useState } from "react";
import { AGENTES, type Agente } from "@/lib/squad/estado-do-squad";
import { EVENTO_ABRIR_VERA, ID_DA_VERA } from "@/lib/vera/tipos";

/**
 * O menu que abre quando você para ao lado de um agente no escritório.
 *
 * ## De onde veio
 *
 * Pedido do Bruno em 18/09: o avatar dele precisa "andar pela sala, chegar
 * perto de um agente e abrir opções: perguntar algo, ver os trabalhos dele,
 * comentar sobre outro agente". São exatamente estas três, e a quarta que NÃO
 * existe é "mandar refazer": ajuste de peça se pede no chat do card, onde
 * existe o texto e o histórico. Um agente que aceita no meio da sala uma ordem
 * que não tem como cumprir é o defeito da parte 135, o Paulo dizendo ter
 * trocado a imagem que nunca trocou.
 *
 * ## Onde ele mora, e por quê
 *
 * Este menu é ancorado em VOCÊ, e não no agente. É a lição da parte 136
 * aplicada antes de doer: o balão de fala era filho do grupo da mesa, que é
 * fixo, e sobrava sobre a cadeira vazia quando o dono levantava. O agente pode
 * levantar no meio da conversa (ele entrega, é chamado pela Vera, vai ao café),
 * e um menu preso a ele iria junto.
 *
 * ## A resposta fica AQUI DENTRO
 *
 * A primeira versão punha a resposta no balão do agente, e o menu, que nasce
 * acima de você, cobria exatamente esse balão: você perguntava e o painel
 * tapava a resposta. Visto no protótipo. Os dois canais têm assunto próprio:
 * **o balão é o que ele está fazendo, o menu é o que ele está te respondendo.**
 */

export type Turno = {
  de: "voce" | "agente";
  texto: string;
  /**
   * O que o agente FEZ nesta resposta, quando ele agiu.
   *
   * Desde 19/09 ele pode devolver uma peça para ajuste sozinho. A ação vem
   * separada do texto de propósito: dita na fala ela se perde no meio da
   * conversa, e o cliente descobre a mudança no quadro no dia seguinte sem
   * saber quem mexeu.
   */
  fez?: string[];
};

export function MenuDoAgente({
  agente,
  /** O histórico desta conversa, que vive fora para sobreviver ao menu fechar. */
  conversa,
  pensando,
  onPerguntar,
  onComentarSobre,
  onVerTrabalhos,
  onFechar,
}: {
  agente: Agente;
  conversa: Turno[];
  pensando: boolean;
  onPerguntar: (pergunta: string) => void;
  onComentarSobre: (outroId: string) => void;
  onVerTrabalhos: () => void;
  onFechar: () => void;
}) {
  const [tela, setTela] = useState<"opcoes" | "perguntar" | "sobre">("opcoes");
  const campo = useRef<HTMLInputElement>(null);
  const fim = useRef<HTMLDivElement>(null);

  // Nota: quem monta este menu passa `key={agente.id}`, e é isso que zera a
  // tela ao trocar de agente sem fechar o menu (dois ficam lado a lado). Com um
  // efeito no lugar da chave, o campo de pergunta de um continuaria aberto para
  // o outro por um render.
  useEffect(() => {
    if (tela === "perguntar") campo.current?.focus();
  }, [tela]);
  useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [conversa.length, pensando]);

  const dele = agente.artigo === "A" ? "dela" : "dele";
  const aoAgente = agente.artigo === "A" ? "à" : "ao";

  return (
    <div
      className="w-[228px] overflow-hidden rounded-xl border shadow-2xl"
      style={{
        borderColor: agente.cor,
        background: "color-mix(in srgb, var(--bg-primary) 94%, transparent)",
        backdropFilter: "blur(8px)",
      }}
      role="dialog"
      aria-label={`Falar com ${agente.nome}`}
      /*
       * TODO EVENTO DE PONTEIRO PARA AQUI, e isto não é zelo: é um defeito
       * visto na tela.
       *
       * O React Three Fiber não escuta no `<canvas>`, escuta no DIV que o
       * envolve, e o `Html` do drei renderiza justamente dentro desse div.
       * Resultado: clicar num botão do menu disparava o botão E borbulhava
       * para o R3F, que fazia o raycast, achava o chão atrás do menu e mandava
       * o avatar andar até lá. O menu saía de alcance e fechava sozinho, então
       * o que se via era "cliquei em perguntar e o menu sumiu".
       *
       * `onPointerDown` sozinho não bastava: o clique do R3F nasce do par
       * down/up, e o arraste da câmera usa o move.
       */
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerMove={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <header className="flex items-center gap-2 border-b px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: agente.cor }} />
        <b className="text-[11.5px] font-bold" style={{ color: "var(--text-primary)" }}>
          {agente.nome}
        </b>
        <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          · {agente.papel}
        </span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="ml-auto text-[13px] leading-none"
          style={{ color: "var(--text-muted)" }}
        >
          ×
        </button>
      </header>

      {conversa.length > 0 && (
        <div className="flex max-h-[132px] flex-col gap-1.5 overflow-auto border-b px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
          {conversa.map((t, i) => (
            <p key={i} className="text-[11px] leading-snug" style={{ color: "var(--text-primary)" }}>
              <b
                className="block text-[9.5px] font-bold uppercase tracking-[.05em]"
                style={{ color: t.de === "agente" ? agente.cor : "var(--text-muted)" }}
              >
                {t.de === "agente" ? agente.primeiroNome : "Você"}
              </b>
              {t.texto}
              {/* O QUE ELE FEZ, separado do que ele disse. Ver o comentário de
                  `Turno.fez`: ação de agente precisa aparecer, senão o cliente
                  encontra a peça mudada no dia seguinte sem saber por quem. */}
              {t.fez?.map((f, j) => (
                <span
                  key={j}
                  className="mt-1 block rounded-md px-2 py-1 text-[10px] font-medium"
                  style={{ background: `${agente.cor}1f`, color: agente.cor }}
                >
                  ✓ {f}
                </span>
              ))}
            </p>
          ))}
          {pensando && (
            <p className="text-[11px] italic" style={{ color: "var(--text-muted)" }}>
              {agente.primeiroNome} está pensando…
            </p>
          )}
          <div ref={fim} />
        </div>
      )}

      {tela === "opcoes" && (
        <div className="flex flex-col">
          {/* A VERA É A GERENTE (04/10): com ela não é só pergunta, é pedido
              que ela executa. A conversa dela abre a janela da gerente, que
              mostra o que vai mudar e pede o ok, em vez deste menu pequeno. */}
          {agente.id === ID_DA_VERA ? (
            <Opcao
              onClick={() => {
                window.dispatchEvent(new CustomEvent(EVENTO_ABRIR_VERA));
                onFechar();
              }}
              cor={agente.cor}
              rotulo="Pedir algo à gerente"
              dica="ela aplica"
            />
          ) : (
            <Opcao onClick={() => setTela("perguntar")} cor={agente.cor} rotulo="Perguntar algo" dica="fala" />
          )}
          <Opcao onClick={onVerTrabalhos} cor={agente.cor} rotulo={`Ver os trabalhos ${dele}`} dica="ficha" />
          <Opcao onClick={() => setTela("sobre")} cor={agente.cor} rotulo="Comentar sobre outro agente" />
        </div>
      )}

      {tela === "perguntar" && (
        <>
          <form
            className="flex gap-1.5 px-2.5 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              const texto = campo.current?.value.trim() ?? "";
              if (!texto || pensando) return;
              onPerguntar(texto);
              if (campo.current) campo.current.value = "";
            }}
          >
            <input
              ref={campo}
              type="text"
              maxLength={300}
              placeholder={`Pergunte ${aoAgente} ${agente.primeiroNome}…`}
              aria-label="Pergunta"
              disabled={pensando}
              className="min-w-0 flex-1 rounded-md border px-2 py-1.5 text-[11.5px] outline-none"
              style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
            />
            <button
              type="submit"
              disabled={pensando}
              className="rounded-md px-2.5 py-1.5 text-[11.5px] font-bold text-white disabled:opacity-50"
              style={{ background: agente.cor }}
            >
              Ir
            </button>
          </form>
          <Voltar onClick={() => setTela("opcoes")} />
        </>
      )}

      {tela === "sobre" && (
        <>
          <div className="flex max-h-[148px] flex-col overflow-auto">
            {AGENTES.filter((o) => o.id !== agente.id).map((o) => (
              <Opcao key={o.id} onClick={() => { onComentarSobre(o.id); setTela("opcoes"); }} cor={agente.cor} rotulo={o.nome} />
            ))}
          </div>
          <Voltar onClick={() => setTela("opcoes")} />
        </>
      )}
    </div>
  );
}

function Opcao({ onClick, cor, rotulo, dica }: { onClick: () => void; cor: string; rotulo: string; dica?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 border-t px-2.5 py-2 text-left text-[11.5px] first:border-t-0 hover:bg-[color-mix(in_srgb,var(--cor)_14%,transparent)]"
      style={{ borderColor: "var(--border)", color: "var(--text-primary)", ["--cor" as string]: cor }}
    >
      {rotulo}
      {dica && (
        <small className="ml-auto text-[10px]" style={{ color: "var(--text-muted)" }}>
          {dica}
        </small>
      )}
    </button>
  );
}

function Voltar({ onClick }: { onClick: () => void }) {
  return (
    <div className="border-t px-2.5 py-1.5" style={{ borderColor: "var(--border)" }}>
      <button type="button" onClick={onClick} className="text-[10.5px]" style={{ color: "var(--text-muted)" }}>
        ← voltar
      </button>
    </div>
  );
}
