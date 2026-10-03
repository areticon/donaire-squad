import { Film, Scissors, LayoutGrid, Palette, UserRound, CalendarCheck } from "lucide-react";

/**
 * O QUE OFERECEMOS, numa faixa curta (02/10, pedido do Matheus). Seis itens,
 * os seis que a plataforma entrega hoje, na mesma plataforma. As seis redes
 * são as da calculadora (LinkedIn, Instagram, Facebook, X, YouTube e TikTok).
 */
const ITENS = [
  { icon: Film, texto: "Edição de vídeos" },
  { icon: Scissors, texto: "Cortes para Reels, Shorts e TikTok" },
  { icon: LayoutGrid, texto: "Posts e carrosséis" },
  { icon: Palette, texto: "Artes" },
  { icon: UserRound, texto: "Gêmeo digital" },
  { icon: CalendarCheck, texto: "Agenda e publicação em 6 redes" },
];

export function OQueOferecemos() {
  return (
    <section aria-label="O que a Demandou faz" className="relative pb-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-sm font-semibold text-[var(--text-muted)] mb-4">Tudo na mesma plataforma:</p>
        <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {ITENS.map((i) => (
            <li key={i.texto} className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-3 min-w-0">
              <i.icon className="w-5 h-5 text-orange-400 shrink-0" />
              <span className="text-sm font-semibold text-[var(--text-primary)] leading-snug">{i.texto}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
