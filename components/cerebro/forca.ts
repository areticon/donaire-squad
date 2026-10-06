/**
 * A SIMULAÇÃO DE FORÇAS DO GRAFO (06/10/2026), a mesma ideia do d3-force do
 * Donaire Brains, escrita aqui para não trazer dependência nova: repulsão
 * entre todos, mola nas ligações, atração ao centro e colisão. O cérebro tem
 * teto de 600 notas na tela, então a repulsão direta (n²) cabe num quadro.
 *
 * Pura e sem DOM: a tela chama `passo()` a cada quadro enquanto `alpha` não
 * esfria, e pode reaquecer ao arrastar uma nota.
 */

export type NoDaForca = { id: string; x: number; y: number; vx: number; vy: number; r: number; fx?: number | null; fy?: number | null };
export type MolaDaForca = { a: NoDaForca; b: NoDaForca; distancia: number; forca: number };

export type Simulacao = {
  nos: NoDaForca[];
  molas: MolaDaForca[];
  alpha: number;
  alvoDoAlpha: number;
  repulsao: number;
  centroX: number;
  centroY: number;
  passo: () => boolean;
  reaquecer: (alpha?: number) => void;
};

const ALPHA_MINIMO = 0.004;
const DECAIMENTO = 1 - Math.pow(ALPHA_MINIMO, 1 / 320);
const ATRITO = 0.42;

/**
 * `centroX` e `centroY` separados: na tela em pé (celular) a atração lateral
 * mais forte deixa o grafo alto e estreito, e ele ocupa a tela em vez de virar
 * uma faixa no meio com branco em cima e embaixo.
 */
export function criarSimulacao(nos: NoDaForca[], molas: MolaDaForca[], opcoes: { repulsao?: number; centroX?: number; centroY?: number } = {}): Simulacao {
  const grau = new Map<NoDaForca, number>();
  for (const m of molas) {
    grau.set(m.a, (grau.get(m.a) ?? 0) + 1);
    grau.set(m.b, (grau.get(m.b) ?? 0) + 1);
  }
  const sim: Simulacao = {
    nos,
    molas,
    alpha: 1,
    alvoDoAlpha: 0,
    repulsao: opcoes.repulsao ?? 60,
    centroX: opcoes.centroX ?? 0.045,
    centroY: opcoes.centroY ?? 0.045,
    reaquecer(alpha = 0.5) {
      sim.alpha = Math.max(sim.alpha, alpha);
    },
    passo() {
      if (sim.alpha < ALPHA_MINIMO && sim.alvoDoAlpha === 0) return false;
      sim.alpha += (sim.alvoDoAlpha - sim.alpha) * DECAIMENTO;
      const a = sim.alpha;

      // Molas: puxam cada par para a distância da ligação; o nó com mais
      // ligações se mexe menos (o mesmo viés do d3).
      for (const m of molas) {
        let dx = m.b.x + m.b.vx - m.a.x - m.a.vx;
        let dy = m.b.y + m.b.vy - m.a.y - m.a.vy;
        const d = Math.hypot(dx, dy) || 1e-6;
        const k = ((d - m.distancia) / d) * a * m.forca;
        dx *= k;
        dy *= k;
        const ga = grau.get(m.a) ?? 1;
        const gb = grau.get(m.b) ?? 1;
        const vies = ga / (ga + gb);
        m.b.vx -= dx * vies;
        m.b.vy -= dy * vies;
        m.a.vx += dx * (1 - vies);
        m.a.vy += dy * (1 - vies);
      }

      // Repulsão e colisão, par a par.
      const n = nos.length;
      for (let i = 0; i < n; i++) {
        const p = nos[i];
        for (let j = i + 1; j < n; j++) {
          const q = nos[j];
          let dx = q.x - p.x;
          let dy = q.y - p.y;
          let d2 = dx * dx + dy * dy;
          if (d2 === 0) {
            dx = (Math.random() - 0.5) * 1e-3;
            dy = (Math.random() - 0.5) * 1e-3;
            d2 = dx * dx + dy * dy;
          }
          if (d2 < 360_000) {
            const f = (sim.repulsao * a) / d2;
            p.vx -= dx * f;
            p.vy -= dy * f;
            q.vx += dx * f;
            q.vy += dy * f;
          }
          const minimo = p.r + q.r + 2;
          if (d2 < minimo * minimo) {
            const d = Math.sqrt(d2);
            const empurra = ((minimo - d) / d) * 0.35;
            p.vx -= dx * empurra;
            p.vy -= dy * empurra;
            q.vx += dx * empurra;
            q.vy += dy * empurra;
          }
        }
      }

      for (const p of nos) {
        p.vx -= p.x * sim.centroX * a;
        p.vy -= p.y * sim.centroY * a;
        if (p.fx != null && p.fy != null) {
          p.x = p.fx;
          p.y = p.fy;
          p.vx = 0;
          p.vy = 0;
          continue;
        }
        p.vx *= 1 - ATRITO;
        p.vy *= 1 - ATRITO;
        p.x += p.vx;
        p.y += p.vy;
      }
      return true;
    },
  };
  return sim;
}
