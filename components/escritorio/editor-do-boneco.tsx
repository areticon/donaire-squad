"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimadorDoBoneco, BonecoDeMassinha } from "@/components/escritorio/boneco-de-massinha";
import { OPCOES, type Aparencia } from "@/lib/squad/aparencia-do-boneco";

/**
 * O EDITOR DO SEU BONECO (28/09/2026).
 *
 * Pedido do Bruno: "o avatar do usuário deve ter a opção de personalizar,
 * escolher cabelo, corpo homem ou mulher, etc". A prévia é o MESMO boneco da
 * sala, com o mesmo código, então o que se escolhe aqui é exatamente o que
 * anda no escritório. Gira devagar para mostrar o cabelo por trás, e acena ao
 * abrir, que é o jeito de dizer "este é você".
 *
 * Só entra no navegador, carregado sob demanda pelo escritório 3D.
 */

function Previa({ aparencia }: { aparencia: Aparencia }) {
  const animador = useMemo(() => {
    const a = new AnimadorDoBoneco();
    a.tocar("Idle");
    return a;
  }, []);
  const giro = useRef<THREE.Group>(null);
  useEffect(() => {
    const t = setTimeout(() => animador.tocar("Wave", true), 400);
    return () => clearTimeout(t);
  }, [animador]);
  useFrame((st) => {
    if (giro.current) giro.current.rotation.y = Math.sin(st.clock.elapsedTime * 0.6) * 0.7;
  });
  return (
    <group ref={giro} position={[0, -0.62, 0]}>
      <BonecoDeMassinha aparencia={aparencia} animador={animador} />
      {/* o chão da prévia, um disco na cor da marca */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.001, 0]}>
        <circleGeometry args={[0.55, 40]} />
        <meshStandardMaterial color="#ef6122" transparent opacity={0.18} />
      </mesh>
    </group>
  );
}

function Amostras({ cores, valor, aoEscolher, rotulo }: { cores: readonly string[]; valor: string; aoEscolher: (c: string) => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={rotulo}>
      {cores.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={valor === c}
          aria-label={c}
          onClick={() => aoEscolher(c)}
          className={cn("h-7 w-7 rounded-full border transition-transform hover:scale-110", valor === c && "ring-2 ring-orange-500 ring-offset-2 ring-offset-[var(--bg-surface)]")}
          style={{ background: c, borderColor: "var(--border)" }}
        />
      ))}
    </div>
  );
}

function Fichas<T extends string>({ opcoes, valor, aoEscolher, rotulo }: { opcoes: readonly { valor: string; rotulo: string }[]; valor: T; aoEscolher: (v: T) => void; rotulo: string }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={valor === o.valor}
          onClick={() => aoEscolher(o.valor as T)}
          className="rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors"
          style={{
            borderColor: valor === o.valor ? "var(--accent-orange)" : "var(--border)",
            background: valor === o.valor ? "color-mix(in srgb, var(--accent-orange) 12%, transparent)" : "transparent",
            color: "var(--text-primary)",
          }}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

function Linha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>{titulo}</p>
      {children}
    </div>
  );
}

export default function EditorDoBoneco({
  inicial,
  aoFechar,
  aoSalvar,
}: {
  inicial: Aparencia;
  aoFechar: () => void;
  aoSalvar: (a: Aparencia) => void;
}) {
  const [a, setA] = useState<Aparencia>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const muda = <K extends keyof Aparencia>(k: K, v: Aparencia[K]) => setA((x) => ({ ...x, [k]: v }));

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch("/api/account/boneco", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aparencia: a }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Não consegui salvar.");
      aoSalvar(d.aparencia as Aparencia);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui salvar.");
      setSalvando(false);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 p-3 backdrop-blur-[2px]" role="dialog" aria-label="Personalizar meu avatar">
      <div
        className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-xl sm:flex-row"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
      >
        <div className="relative h-56 shrink-0 sm:h-auto sm:w-64" style={{ background: "radial-gradient(90% 80% at 50% 30%, var(--bg-elevated), var(--bg-primary))" }}>
          <Canvas camera={{ position: [0, 0.15, 3.2], fov: 32 }} dpr={[1, 1.5]}>
            <ambientLight intensity={0.8} />
            <directionalLight position={[2, 3, 3]} intensity={1.4} />
            <Previa aparencia={a} />
          </Canvas>
          <p className="pointer-events-none absolute bottom-2 left-0 right-0 text-center text-[11px]" style={{ color: "var(--text-muted)" }}>
            é assim que você anda pelo escritório
          </p>
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Personalizar meu avatar</p>
            <button type="button" onClick={aoFechar} aria-label="Fechar" className="rounded-lg p-1.5 hover:bg-[var(--realce-2)]" style={{ color: "var(--text-muted)" }}>
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto px-4 py-3">
            <Linha titulo="Corpo">
              <Fichas opcoes={OPCOES.corpo} valor={a.corpo} aoEscolher={(v) => muda("corpo", v)} rotulo="Corpo" />
            </Linha>
            <Linha titulo="Pele">
              <Amostras cores={OPCOES.pele} valor={a.pele} aoEscolher={(c) => muda("pele", c)} rotulo="Pele" />
            </Linha>
            <Linha titulo="Cabelo">
              <Fichas opcoes={OPCOES.cabelo} valor={a.cabelo} aoEscolher={(v) => muda("cabelo", v)} rotulo="Estilo do cabelo" />
              <Amostras cores={OPCOES.corDoCabelo} valor={a.corDoCabelo} aoEscolher={(c) => muda("corDoCabelo", c)} rotulo="Cor do cabelo" />
            </Linha>
            <Linha titulo="Roupa">
              <Amostras cores={OPCOES.roupa} valor={a.roupa} aoEscolher={(c) => muda("roupa", c)} rotulo="Cor da roupa" />
            </Linha>
            <Linha titulo="Calça">
              <Amostras cores={OPCOES.calca} valor={a.calca} aoEscolher={(c) => muda("calca", c)} rotulo="Cor da calça" />
            </Linha>
            <Linha titulo="Detalhes">
              <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--text-primary)" }}>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={a.oculos} onChange={(e) => muda("oculos", e.target.checked)} className="accent-orange-500" />
                  Óculos
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={a.barba} onChange={(e) => muda("barba", e.target.checked)} className="accent-orange-500" />
                  Barba
                </label>
              </div>
            </Linha>
            <Linha titulo="Acessório">
              <Fichas opcoes={OPCOES.acessorio} valor={a.acessorio === "fonePescoco" ? "fone" : a.acessorio} aoEscolher={(v) => muda("acessorio", v)} rotulo="Acessório" />
            </Linha>
            {erro && <p className="text-sm" style={{ color: "var(--badge-danger-text)" }}>{erro}</p>}
          </div>
          <div className="flex justify-end gap-2 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <Button variant="outline" onClick={aoFechar} disabled={salvando}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar meu avatar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
