import Link from "next/link";
import { numero, PERIODOS, type Periodo } from "@/lib/admin/tipos-do-painel";

/**
 * AS PEÇAS GRÁFICAS DO PAINEL DE GESTÃO (01/10), desenhadas no servidor.
 *
 * Pedido do Bruno: "o funil, os dados, tudo deve ser gráfico". O projeto não
 * usa biblioteca de gráfico (ver components/painel/graficos.tsx: SVG puro,
 * sem 90 KB a mais no navegador), e este arquivo segue a mesma linha: funil,
 * rosca, barras e medidor em HTML e SVG, com o texto sempre em HTML para ler
 * no celular. Só o gráfico no tempo, que precisa de balão e de medir a
 * largura, é componente de cliente (grafico-no-tempo.tsx).
 *
 * Regras que valem para todas as peças:
 *  - a cor diz QUAL série; o número sempre está escrito ao lado, em cor de
 *    texto (o pêssego e o azul claro ficam abaixo de 3:1 no tema claro);
 *  - a cor segue a coisa, não a posição: --painel-1 a 5 têm dono fixo;
 *  - sem dado, a peça não some: desenha a forma vazia e explica o que a
 *    preenche, porque o banco hoje tem quase só a conta do Bruno.
 */

export function Cartao({
  titulo,
  subtitulo,
  acao,
  children,
  className = "",
}: {
  titulo: string;
  subtitulo?: React.ReactNode;
  acao?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border p-4 sm:p-5 min-w-0 ${className}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            {titulo}
          </h2>
          {subtitulo && (
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {subtitulo}
            </p>
          )}
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** O estado vazio: diz o que falta e o que vai aparecer aqui. */
export function Vazio({ titulo, texto, compacto = false }: { titulo: string; texto: string; compacto?: boolean }) {
  return (
    <div
      className={`rounded-xl border border-dashed text-center ${compacto ? "px-3 py-4" : "px-4 py-8"}`}
      style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
        {titulo}
      </p>
      <p className="text-xs mt-1 max-w-md mx-auto" style={{ color: "var(--text-muted)" }}>
        {texto}
      </p>
    </div>
  );
}

/**
 * O SELETOR DE PERÍODO: três links, sem JavaScript. O período mora na URL
 * (?dias=7), então dá para mandar o link do painel já no recorte certo.
 */
export function SeletorDePeriodo({ atual, extra = "" }: { atual: Periodo; extra?: string }) {
  return (
    <nav
      aria-label="Período do painel"
      className="inline-flex rounded-xl border p-1 gap-1"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)" }}
    >
      {PERIODOS.map((p) => {
        const ativo = p === atual;
        return (
          <Link
            key={p}
            href={`/admin?dias=${p}${extra}`}
            aria-current={ativo ? "true" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
              ativo ? "bg-[var(--acento-forte)] text-white" : "text-[var(--text-muted)] hover:bg-[var(--realce-2)] hover:text-[var(--text-primary)]"
            }`}
          >
            {p} dias
          </Link>
        );
      })}
    </nav>
  );
}

/** Um número grande com o rótulo em cima e a nota embaixo. */
export function Numero({ rotulo, valor, nota, children }: { rotulo: string; valor: string; nota?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div
      className="rounded-2xl border p-4 min-w-0"
      style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", boxShadow: "var(--shadow)" }}
    >
      <p className="rotulo mb-1">{rotulo}</p>
      <p className="text-2xl font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
        {valor}
      </p>
      {nota && (
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {nota}
        </p>
      )}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O FUNIL
// ─────────────────────────────────────────────────────────────────────────────

type PassoDesenhado = { passo: string; pessoas: number; eventos: number };

const NOME_DO_PASSO: Record<string, string> = {
  visita: "Visitas",
  cadastro: "Cadastro confirmado",
  checkout: "Checkout",
  assinatura: "Assinatura",
  "ativação": "Ativação",
  demo: "Testou a demo pública",
  contato: "Deixou contato",
};

const EXPLICA_O_PASSO: Record<string, string> = {
  visita: "pessoas diferentes na landing",
  cadastro: "e-mail confirmado, sem robô e sem conta interna",
  checkout: "abriram o pagamento",
  assinatura: "assinaram (teste com cartão conta)",
  "ativação": "geraram a 1ª campanha ou enviaram o 1º vídeo",
};

/**
 * O funil desenhado como funil: cada passo é um trapézio que afina até o
 * tamanho do seguinte, e entre eles vai a taxa de passagem.
 *
 * A largura é a RAIZ da proporção, e não a proporção: com 400 visitas e 2
 * assinaturas, a escala linear deixaria o fundo do funil com 0,5% da largura,
 * invisível. O número exato está sempre escrito ao lado. O trecho que mais
 * vaza ganha o laranja: é para lá que o olho deve ir.
 */
export function Funil({
  passos,
  portas,
  dias,
}: {
  passos: PassoDesenhado[];
  portas: Array<{ nome: string; pessoas: number; nota: string }>;
  dias: number;
}) {
  const ordem = ["visita", "cadastro", "checkout", "assinatura", "ativação"];
  const principais = ordem
    .map((p) => passos.find((x) => x.passo === p))
    .filter((p): p is PassoDesenhado => Boolean(p));
  const topo = Math.max(1, ...principais.map((p) => p.pessoas));
  const vazio = principais.every((p) => p.pessoas === 0);
  // Vazio, o funil sai com o desenho de sempre (cada passo um pouco menor),
  // em cinza, para a tela mostrar o que vai existir ali.
  // Passo com zero vira um fio (8%), e não o piso de 24%: o piso existe para o
  // passo pequeno continuar visível, não para zero parecer alguma coisa.
  const larguras = principais.map((p, i) =>
    vazio ? 1 - i * 0.17 : p.pessoas === 0 ? 0.08 : 0.24 + 0.76 * Math.sqrt(p.pessoas / topo)
  );

  const taxas = principais.map((p, i) => {
    if (i === 0) return null;
    const antes = principais[i - 1].pessoas;
    return antes > 0 ? Math.round((p.pessoas / antes) * 100) : null;
  });
  // O maior vazamento: a menor taxa abaixo de 100%.
  const candidatas = taxas.map((t, i) => ({ t, i })).filter((x) => x.t !== null && x.t < 100) as Array<{ t: number; i: number }>;
  const pior = candidatas.length ? candidatas.reduce((a, b) => (b.t < a.t ? b : a)).i : -1;

  return (
    <div>
      <div className="space-y-0">
        {principais.map((p, i) => {
          const de = larguras[i];
          // O trapézio só afina, nunca abre: quando um passo tem mais gente
          // que o anterior (a pessoa entrou sem passar por ele), o degrau
          // aparece como degrau, e a frase do meio explica.
          const ate = i + 1 < larguras.length ? Math.min(de, larguras[i + 1]) : de * 0.86;
          const poligono = `polygon(${((1 - de) / 2) * 100}% 0, ${((1 + de) / 2) * 100}% 0, ${((1 + ate) / 2) * 100}% 100%, ${((1 - ate) / 2) * 100}% 100%)`;
          const taxa = taxas[i];
          return (
            <div key={p.passo}>
              {i > 0 && (
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(9.5rem,40%)] sm:grid-cols-[minmax(0,1fr)_14rem] gap-3 items-center">
                  <p
                    className="text-center text-[11px] font-semibold py-0.5 tabular-nums"
                    style={{ color: i === pior ? "var(--marca-laranja-texto)" : "var(--text-muted)" }}
                  >
                    {taxa === null
                      ? "sem base para a taxa"
                      : taxa > 100
                        ? "entraram sem passar pelo anterior"
                        : `${taxa}% seguiram${i === pior ? " · onde mais vaza" : ""}`}
                  </p>
                  <span />
                </div>
              )}
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(9.5rem,40%)] sm:grid-cols-[minmax(0,1fr)_14rem] gap-3 items-center">
                <div
                  className="h-11 sm:h-12"
                  title={`${NOME_DO_PASSO[p.passo] ?? p.passo}: ${p.pessoas} pessoas`}
                  style={{
                    clipPath: poligono,
                    // Um tom só (é magnitude, não identidade), clareando um
                    // pouco a cada passo para o olho descer o funil.
                    background: vazio ? "var(--painel-neutro)" : "var(--painel-1)",
                    opacity: vazio ? 0.6 : 1 - i * 0.12,
                  }}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                    {NOME_DO_PASSO[p.passo] ?? p.passo}
                  </p>
                  <p className="text-lg font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
                    {numero(p.pessoas)}
                    {p.passo !== "cadastro" && p.passo !== "ativação" && p.eventos !== p.pessoas && (
                      <span className="ml-1.5 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                        {p.eventos} evento(s)
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] leading-tight hidden sm:block" style={{ color: "var(--text-muted)" }}>
                    {EXPLICA_O_PASSO[p.passo]}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {vazio && (
        <p className="mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
          Nada passou pelo funil nos últimos {dias} dias. Ele se desenha sozinho quando a landing receber visitas: cada
          visita, cadastro confirmado, checkout, assinatura e primeira campanha entra aqui, com a taxa entre um passo e
          outro.
        </p>
      )}

      {/* As portas laterais não são fila: a pessoa pode testar a demo e nunca
          visitar, ou pedir demonstração sem deixar contato. Por isso ficam
          fora do funil, com a proporção sobre as visitas. */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
        {portas.map((porta) => (
          <div key={porta.nome} className="rounded-xl border px-3 py-2" style={{ borderColor: "var(--border)", background: "var(--bg-input)" }}>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              {porta.nome}
            </p>
            <p className="text-sm font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>
              {numero(porta.pessoas)}{" "}
              <span className="text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                {porta.nota}
              </span>
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROSCA, BARRA EMPILHADA, BARRAS HORIZONTAIS E MEDIDOR
// ─────────────────────────────────────────────────────────────────────────────

export type Fatia = { nome: string; valor: number; cor: string; nota?: string };

/** A rosca: partes de um todo, com o total no meio e a lista ao lado. */
export function Rosca({
  fatias,
  centro,
  rotuloDoCentro,
  formatar = numero,
  vazio,
}: {
  fatias: Fatia[];
  centro: string;
  rotuloDoCentro: string;
  formatar?: (n: number) => string;
  vazio?: { titulo: string; texto: string };
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  const R = 52, ESP = 16, C = 2 * Math.PI * R;
  const visiveis = fatias.filter((f) => f.valor > 0);
  const GAP = visiveis.length > 1 ? 2.5 : 0;
  let andou = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative shrink-0" style={{ width: 132, height: 132 }}>
        <svg width={132} height={132} viewBox="0 0 132 132" role="img" aria-label={`${rotuloDoCentro}: ${centro}`}>
          <circle cx={66} cy={66} r={R} fill="none" strokeWidth={ESP} style={{ stroke: "var(--bg-input)" }} />
          {total > 0 &&
            visiveis.map((f) => {
              const tam = (f.valor / total) * C;
              const el = (
                <circle
                  key={f.nome}
                  cx={66}
                  cy={66}
                  r={R}
                  fill="none"
                  strokeWidth={ESP}
                  strokeDasharray={`${Math.max(0.5, tam - GAP)} ${C}`}
                  strokeDashoffset={-andou}
                  transform="rotate(-90 66 66)"
                  style={{ stroke: f.cor }}
                >
                  <title>{`${f.nome}: ${formatar(f.valor)}`}</title>
                </circle>
              );
              andou += tam;
              return el;
            })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-5">
          <span className="text-base font-bold tabular-nums leading-tight" style={{ color: "var(--text-primary)" }}>
            {centro}
          </span>
          <span className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
            {rotuloDoCentro}
          </span>
        </div>
      </div>
      <div className="w-full min-w-0">
        {total === 0 && vazio ? (
          <Vazio titulo={vazio.titulo} texto={vazio.texto} compacto />
        ) : (
          <ul className="space-y-1.5">
            {fatias.map((f) => (
              <li key={f.nome} className="flex items-center justify-between gap-3 text-xs">
                <span className="flex items-center gap-2 min-w-0" style={{ color: "var(--text-muted)" }}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: f.cor }} />
                  <span className="truncate">{f.nome}</span>
                </span>
                <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  <strong style={{ color: "var(--text-primary)" }}>{formatar(f.valor)}</strong>
                  {f.nota ? ` ${f.nota}` : total > 0 ? ` · ${Math.round((f.valor / total) * 100)}%` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** Uma barra só, partida nas partes de um todo, com a legenda embaixo. */
export function BarraEmpilhada({ partes, rotulo }: { partes: Fatia[]; rotulo: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full gap-[2px]"
        role="img"
        aria-label={`${rotulo}: ${partes.map((p) => `${p.nome} ${p.valor}`).join(", ")}`}
        style={{ background: "var(--bg-input)" }}
      >
        {total > 0 &&
          partes
            .filter((p) => p.valor > 0)
            .map((p) => (
              <div key={p.nome} title={`${p.nome}: ${p.valor}`} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />
            ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {partes.map((p) => (
          <li key={p.nome} className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="h-2 w-2 rounded-[2px]" style={{ background: p.cor }} />
            {p.nome}
            <strong className="tabular-nums" style={{ color: "var(--text-primary)" }}>
              {p.valor}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Barras horizontais: uma linha por item, o número escrito na ponta. */
export function BarrasHorizontais({
  linhas,
  cor = "var(--painel-1)",
  formatar = numero,
}: {
  linhas: Array<{ nome: string; valor: number; nota?: string; cor?: string }>;
  cor?: string;
  formatar?: (n: number) => string;
}) {
  const max = Math.max(1, ...linhas.map((l) => l.valor));
  return (
    <ul className="space-y-2.5">
      {linhas.map((l) => (
        <li key={l.nome}>
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {l.nome}
            </span>
            <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--text-primary)" }}>{formatar(l.valor)}</strong>
              {l.nota ? ` ${l.nota}` : ""}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }}>
            <div className="h-full rounded-full" style={{ width: `${(l.valor / max) * 100}%`, background: l.cor ?? cor }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * DE ONDE VÊM: uma linha por origem e campanha, com três barras na mesma
 * escala (visitantes, cadastros, assinaturas). A escala é uma só de
 * propósito: a barra de cadastro pequena ao lado da de visita grande É a
 * informação.
 */
export function Origens({
  linhas,
}: {
  linhas: Array<{ origem: string; campanha: string | null; visitas: number; cadastros: number; assinaturas: number }>;
}) {
  const max = Math.max(1, ...linhas.flatMap((l) => [l.visitas, l.cadastros, l.assinaturas]));
  const series = [
    { chave: "visitas" as const, nome: "Visitantes", cor: "var(--painel-1)" },
    { chave: "cadastros" as const, nome: "Cadastros", cor: "var(--painel-3)" },
    { chave: "assinaturas" as const, nome: "Assinaturas", cor: "var(--painel-2)" },
  ];
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {series.map((s) => (
          <span key={s.chave} className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.cor }} />
            {s.nome}
          </span>
        ))}
      </div>
      <ul className="space-y-3">
        {linhas.map((l) => (
          <li key={`${l.origem}|${l.campanha ?? ""}`} className="grid grid-cols-1 sm:grid-cols-[11rem_minmax(0,1fr)] gap-x-3 gap-y-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: "var(--text-primary)" }}>
                {l.origem}
              </p>
              <p className="text-[11px] truncate" style={{ color: "var(--text-muted)" }}>
                {l.campanha ?? "sem campanha"}
              </p>
            </div>
            <div className="space-y-[3px]">
              {series.map((s) => (
                <div key={s.chave} className="flex items-center gap-2" title={`${s.nome}: ${l[s.chave]}`}>
                  <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(l[s.chave] / max) * 100}%`, background: s.cor }} />
                  </div>
                  <span className="w-10 text-right text-[11px] font-semibold tabular-nums" style={{ color: "var(--text-primary)" }}>
                    {l[s.chave]}
                  </span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O medidor: quanto de um teto já foi usado. Laranja a partir de 80%. */
export function Medidor({ valor, teto, rotulo }: { valor: number; teto: number; rotulo: string }) {
  const p = teto > 0 ? Math.min(1, valor / teto) : 0;
  return (
    <div role="meter" aria-valuemin={0} aria-valuemax={teto} aria-valuenow={valor} aria-label={rotulo}>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-input)" }}>
        <div className="h-full rounded-full" style={{ width: `${p * 100}%`, background: p >= 0.8 ? "var(--painel-2)" : "var(--painel-1)" }} />
      </div>
    </div>
  );
}
