"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { LISTA_DE_ESTILOS, type NomeDoEstilo } from "@/lib/media/estilos";

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
}: {
  projectId: string;
  inicial: string | null;
}) {
  // Sem escolha, o padrão é o acelerado, que é o mesmo padrão do back-end. Se
  // os dois discordassem, a tela mostraria um estilo e o vídeo sairia com
  // outro.
  const [escolhido, setEscolhido] = useState<NomeDoEstilo>(
    (inicial as NomeDoEstilo) ?? "acelerado"
  );
  const [salvando, setSalvando] = useState(false);

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
                background: ativo ? "var(--surface-2)" : "var(--surface)",
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
    </section>
  );
}
