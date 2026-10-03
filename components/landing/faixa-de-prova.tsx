import { PLANOS_PUBLICOS } from "@/lib/planos";
import { pecasDoPlano, REDES } from "@/lib/calculadora/custos";

/**
 * A FAIXA DE PROVA (02/10, pedido do Bruno), logo abaixo da hero: as frases
 * de número dele, ajustadas ao que a plataforma entrega.
 *
 * As referências eram "30 dias de posts 100% prontos em 3 horas de trabalho" e
 * "3 horas do seu dia viram 30 conteúdos prontos e agendados". A conta real do
 * Starter: 4 gravações de 20 a 30 minutos (no máximo 2 horas no mês), mais a
 * aprovação, viram cerca de 44 peças; desde 02/10 a página diz 3 horas. Os números saem do código, não da mão:
 * peças de pecasDoPlano (a mesma leitura da calculadora), gravações do plano e
 * redes da lista da calculadora. Mudou o plano, a faixa acompanha.
 *
 * Componente de servidor, sem JavaScript no navegador.
 */
export function FaixaDeProva() {
  const starter = PLANOS_PUBLICOS[0];
  const pecas = pecasDoPlano(starter);
  // AS 3 HORAS (02/10, noite, pedido do Matheus, que prefere o número que sabe
  // ser real): 4 gravações de até 30 minutos são 2 h; a aprovação das cerca de
  // 44 peças, perto de 1 minuto e meio cada, fecha a terceira hora.
  const horasGravando = Math.round((starter.gravacoesPorMes * 30) / 60);
  const horas = horasGravando + 1;
  const numeros = [
    // "3 horas de trabalho no mês" (02/10, noite, texto aprovado pelo Matheus).
    { n: `${horas} horas`, rotulo: "de trabalho no mês", detalhe: `${starter.gravacoesPorMes} gravações de até 30 minutos e a aprovação` },
    { n: `~${pecas}`, rotulo: "peças prontas", detalhe: "vídeos, cortes, posts e carrosséis" },
    { n: `${REDES.length}`, rotulo: "redes, cada uma no formato dela", detalhe: REDES.map((r) => r.nome).join(", ") },
    // Saiu "0 post sem a sua aprovação" (02/10, noite, pedido do Matheus).
  ];
  return (
    <section aria-label="O que a plataforma entrega por mês" className="relative pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-orange-500/30 bg-[var(--bg-surface)] p-6 sm:p-8">
          {/* A frase de plataforma ("A plataforma que gera 30 dias de conteúdo
              em 3 horas") subiu para o selo da hero (02/10, noite, pedido do
              Matheus). Aqui fica a prova da conta, sem repetir a frase. */}
          <h2 className="text-center text-3xl sm:text-5xl font-black tracking-tight text-[var(--text-primary)] leading-[1.08] mb-8 max-w-4xl mx-auto">
            As suas {horas} horas no mês{" "}
            <span className="text-orange-500">viram isto.</span>
          </h2>
          {/* Três itens: uma coluna no celular, três a partir de 640 px, sem vão. */}
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {numeros.map((x) => (
              <div key={x.rotulo} className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)]/40 p-4 min-w-0">
                <dt className="sr-only">{x.rotulo}</dt>
                <dd>
                  <p className="text-3xl sm:text-4xl font-black text-orange-400 tabular-nums leading-none">{x.n}</p>
                  <p className="mt-2 text-sm font-semibold text-[var(--text-primary)] leading-snug">{x.rotulo}</p>
                  <p className="mt-1 text-xs text-[var(--text-muted)] leading-snug">{x.detalhe}</p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-5 text-center text-xs text-[var(--text-muted)]">
            Números do Starter, o plano de entrada. No Pro e no Enterprise o volume dobra e quadruplica.
          </p>
        </div>
      </div>
    </section>
  );
}
