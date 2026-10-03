import { Clock, Wallet, CalendarX, ArrowDown } from "lucide-react";
import { calcular, emReais, PREDEFINICOES } from "@/lib/calculadora/custos";

/**
 * A DOR E A ECONOMIA (01/10), logo depois do vídeo de pitch.
 *
 * O vídeo conta a história em 85 segundos; esta seção deixa a mesma história
 * parada para quem lê em vez de assistir: tempo, custo e inconstância, e o
 * exemplo de quem posta todo dia em quatro redes.
 *
 * O EXEMPLO É O MESMO DO VÍDEO E SAI DA MESMA FUNÇÃO da calculadora
 * (lib/calculadora/custos.ts, predefinição "Todo dia"). Número escrito à mão
 * aqui divergiria do vídeo e da calculadora na primeira mudança de preço. O
 * que fica atrás do formulário é a conta da PRÓPRIA empresa, com o volume e as
 * redes dela; o exemplo é a isca para ela querer fazer a dela.
 *
 * Componente de servidor: a conta roda no build, sem JavaScript no navegador.
 */

const DORES = [
  {
    icon: Clock,
    titulo: "Tempo",
    numero: "~5 h",
    sufixo: "por semana",
    texto: "só criando e aprovando conteúdo, a tarefa que mais toma o tempo de quem cuida das redes.",
    fonte: "Sprout Social Index, 2024",
  },
  {
    icon: Wallet,
    titulo: "Custo",
    numero: "+80%",
    sufixo: "sobre o salário",
    texto: "é o que encargos e benefícios somam a cada pessoa contratada com carteira para fazer conteúdo.",
    fonte: "Contajá e salario.com.br, 2026",
  },
  {
    icon: CalendarX,
    titulo: "Inconstância",
    numero: "11",
    sufixo: "contatos",
    texto: "antes de alguém decidir comprar. Quando a semana aperta e o perfil some, a conta recomeça do zero.",
    fonte: "Regra 7-11-4, Daniel Priestley (heurística de mercado)",
  },
];

export function Dor() {
  // O exemplo é o ritmo "todo dia, em todas as redes": é onde o time próprio
  // fica cheio de verdade (dois editores, dois social medias), e é a conta do
  // "até 88%" do vídeo de pitch. Desde 01/10 a seção fala em ECONOMIA, nunca no
  // preço do plano (pedido do Bruno): o preço mora na tabela, mais abaixo.
  const exemplo = calcular(PREDEFINICOES.find((p) => p.id === "todo_dia_forte")!.entradas);
  const barras = [
    ...exemplo.cenarios.map((c) => ({ nome: c.nome, valor: c.mensal, nosso: false })),
    { nome: "Com a Demandou", valor: exemplo.demandou.mensal, nosso: true },
  ];
  const maior = Math.max(...barras.map((b) => b.valor));
  const melhor = exemplo.economia[0];

  return (
    <section id="dor" className="relative py-24 lg:py-28">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border)] to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <div className="selo mb-6">
            <span>O problema</span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-black text-[var(--text-primary)] mb-4">
            Postar todo dia é <span className="text-orange-500">um segundo emprego</span>.
          </h2>
          <p className="text-xl text-[var(--text-muted)] max-w-2xl mx-auto">
            Gravar, editar, escrever, desenhar e publicar em quatro redes. Ou você monta um time, ou contrata
            agência, ou paga freelancer por peça. Ou some.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          {DORES.map((d) => (
            <div key={d.titulo} className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl p-7 flex flex-col">
              <p className="flex items-center gap-2 text-sm font-semibold text-orange-400 mb-4">
                <d.icon className="w-4 h-4" /> {d.titulo}
              </p>
              <p className="mb-2">
                <span className="text-5xl font-black text-[var(--text-primary)]">{d.numero}</span>{" "}
                <span className="text-[var(--text-muted)]">{d.sufixo}</span>
              </p>
              <p className="text-[var(--text-muted)] leading-relaxed flex-1">{d.texto}</p>
              <p className="mt-4 text-xs text-[var(--text-muted)] opacity-75">{d.fonte}</p>
            </div>
          ))}
        </div>

        <div className="bg-[var(--bg-surface)] border border-orange-500/40 rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
            <div>
              <p className="text-sm text-orange-400 font-semibold mb-1">A conta de quem posta todo dia, nas 6 redes</p>
              <p className="text-2xl lg:text-3xl font-black text-[var(--text-primary)]">
                Até {melhor.porcento}% a menos que um time próprio.
              </p>
            </div>
            <p className="text-sm text-[var(--text-muted)] max-w-sm">
              {exemplo.volume.pecas} peças por mês: {exemplo.volume.textos} posts escritos, {exemplo.volume.artes} artes,{" "}
              {exemplo.volume.cortes} vídeos curtos e {exemplo.volume.longos} vídeos longos.
            </p>
          </div>
          <div className="space-y-3">
            {barras.map((b) => (
              <div key={b.nome} className="grid grid-cols-[minmax(0,1fr)] sm:grid-cols-[200px_minmax(0,1fr)_140px] items-center gap-x-4 gap-y-1">
                <span className={`text-sm font-semibold ${b.nosso ? "text-orange-400" : "text-[var(--text-primary)]"}`}>{b.nome}</span>
                <span className="h-3 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <span
                    className={`block h-full rounded-full ${b.nosso ? "bg-[linear-gradient(90deg,#ffc59a,#ef6122)]" : "bg-[var(--text-muted)]"}`}
                    style={{ width: `${Math.max(3, (b.valor / maior) * 100)}%` }}
                  />
                </span>
                <span className={`text-sm sm:text-right font-bold tabular-nums ${b.nosso ? "text-orange-400" : "text-[var(--text-primary)]"}`}>
                  {b.nosso ? `${melhor.porcento}% a menos` : `${emReais(b.valor)}/mês`}
                </span>
              </div>
            ))}
          </div>
          <a
            href="#calculadora"
            className="mt-7 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-3 text-sm font-bold text-white hover:bg-orange-600 transition-colors"
          >
            Fazer a conta da minha empresa <ArrowDown className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
