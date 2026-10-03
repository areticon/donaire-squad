"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Aparencia } from "@/lib/squad/aparencia-do-boneco";

/**
 * O BONECO DE MASSINHA do escritório 3D (28/09/2026).
 *
 * Substitui o robô único recolorido (o Robot Expressive do three.js) por um
 * boneco montado por partes, no estilo da arte de massinha dos agentes: cabeça
 * grande, olhos redondos, superfícies foscas. Montado por partes porque o
 * Bruno pediu o avatar do usuário PERSONALIZÁVEL (corpo, cabelo, pele, roupa,
 * óculos, barba, acessório), e um modelo pronto não troca de cabelo.
 *
 * ## Mesmos comandos do robô
 *
 * O `AnimadorDoBoneco` entende os nomes dos clipes do modelo antigo
 * ("Sitting", "Walking", "Running", "Idle", "Wave", "Yes", "No",
 * "ThumbsUp"). Assim toda a lógica da cena (andar até a mesa do próximo,
 * cobrar, tomar café, o seu avatar) continuou igual: só o corpo mudou.
 *
 * As poses de base (sentado, parado, andando, correndo) ficam em laço; os
 * gestos (acenar, sim, não, joinha) rodam uma vez POR CIMA da base, mexendo só
 * braço e cabeça. Um agente sentado acena sentado, sem levantar.
 */

const BASES = ["Sitting", "Idle", "Walking", "Running"] as const;
const DURACAO_DO_GESTO: Record<string, number> = { Wave: 1.8, Yes: 1.2, No: 1.3, ThumbsUp: 1.5 };

export type Humor = "neutro" | "irritado" | "triste" | "surpreso";

export class AnimadorDoBoneco {
  base: (typeof BASES)[number] = "Sitting";
  gesto: string | null = null;
  inicioDoGesto = 0;
  relogio = 0;
  parado = false;
  aoTerminar: (() => void) | null = null;

  /** Mesmo contrato do `tocar` do robô: base em laço, gesto uma vez. */
  tocar(nome: string, _umaVez = false, reduzido = false) {
    void _umaVez;
    this.parado = reduzido;
    if ((BASES as readonly string[]).includes(nome)) {
      this.base = nome as (typeof BASES)[number];
      this.gesto = null;
      return;
    }
    if (DURACAO_DO_GESTO[nome]) {
      this.gesto = nome;
      this.inicioDoGesto = this.relogio;
    }
  }

  /** Falso quando um gesto de uma vez acabou; base em laço está sempre rodando. */
  rodando(): boolean {
    return this.gesto !== null;
  }

  avancar(dt: number) {
    this.relogio += dt;
    if (this.gesto && this.relogio - this.inicioDoGesto > DURACAO_DO_GESTO[this.gesto]) {
      this.gesto = null;
      this.aoTerminar?.();
    }
  }
}

const suave = (atual: number, alvo: number, k: number) => atual + (alvo - atual) * k;

function Material({ cor, rugosidade = 0.78 }: { cor: string; rugosidade?: number }) {
  return <meshStandardMaterial color={cor} roughness={rugosidade} />;
}

/** Os fios do cabelo, pelo estilo. Tudo relativo ao centro da cabeça. */
function Cabelo({ a }: { a: Aparencia }) {
  const R = 0.172;
  if (a.cabelo === "careca") return null;
  const tampa = (
    <mesh position={[0, 0.02, -0.005]} scale={[1.06, 1.02, 1.07]}>
      <sphereGeometry args={[R, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      <Material cor={a.corDoCabelo} rugosidade={0.85} />
    </mesh>
  );
  // A parte de trás da cabeça, até a nuca.
  const nuca = (fim: number, escala = 1.07) => (
    <mesh scale={[escala, 1.02, escala]}>
      <sphereGeometry args={[R, 28, 16, Math.PI, Math.PI, 0, Math.PI * fim]} />
      <Material cor={a.corDoCabelo} rugosidade={0.85} />
    </mesh>
  );
  switch (a.cabelo) {
    case "curto":
      return (
        <group>
          {tampa}
          {nuca(0.62)}
          {/* o topete, para o curto não virar capacete */}
          <mesh position={[0.02, 0.15, 0.08]} scale={[1.3, 0.55, 0.9]}>
            <sphereGeometry args={[0.07, 12, 10]} />
            <Material cor={a.corDoCabelo} rugosidade={0.85} />
          </mesh>
        </group>
      );
    case "cacheado":
      return (
        <group>
          {tampa}
          {nuca(0.6)}
          {[
            [0, 0.17, 0.02], [0.1, 0.14, 0.06], [-0.1, 0.14, 0.06], [0.14, 0.08, -0.04], [-0.14, 0.08, -0.04],
            [0.06, 0.15, -0.1], [-0.06, 0.15, -0.1], [0, 0.1, 0.12], [0.1, 0.05, 0.1], [-0.1, 0.05, 0.1],
          ].map(([x, y, z], k) => (
            <mesh key={k} position={[x, y, z]}>
              <sphereGeometry args={[0.062, 10, 8]} />
              <Material cor={a.corDoCabelo} rugosidade={0.9} />
            </mesh>
          ))}
        </group>
      );
    case "coque":
      return (
        <group>
          {tampa}
          {nuca(0.64)}
          <mesh position={[0, 0.17, -0.1]}>
            <sphereGeometry args={[0.075, 14, 12]} />
            <Material cor={a.corDoCabelo} rugosidade={0.85} />
          </mesh>
        </group>
      );
    case "chanel":
    case "longo":
      return (
        <group>
          {tampa}
          {nuca(0.9, 1.13)}
          {/* as laterais descem até o queixo */}
          {[-1, 1].map((l) => (
            <mesh key={l} position={[l * 0.155, -0.05, 0.02]} scale={[0.45, 1.25, 0.9]}>
              <sphereGeometry args={[0.1, 12, 10]} />
              <Material cor={a.corDoCabelo} rugosidade={0.85} />
            </mesh>
          ))}
          {/* a franja */}
          <mesh position={[0, 0.11, 0.135]} scale={[1.7, 0.55, 0.6]}>
            <sphereGeometry args={[0.08, 14, 10]} />
            <Material cor={a.corDoCabelo} rugosidade={0.85} />
          </mesh>
          {a.cabelo === "longo" && (
            <mesh position={[0, -0.2, -0.1]} scale={[1.6, 2.2, 0.7]}>
              <sphereGeometry args={[0.1, 14, 12]} />
              <Material cor={a.corDoCabelo} rugosidade={0.85} />
            </mesh>
          )}
        </group>
      );
    default:
      return tampa;
  }
}

function Rosto({ a, humor, sobrancelhas, boca }: {
  a: Aparencia;
  humor: Humor;
  sobrancelhas: React.RefObject<THREE.Group | null>;
  boca: React.RefObject<THREE.Group | null>;
}) {
  void humor;
  return (
    <group>
      {/* olhos grandes e redondos, com o brilho da arte */}
      {[-1, 1].map((l) => (
        <group key={l} position={[l * 0.062, 0.02, 0.152]}>
          <mesh scale={[1, 1.1, 0.6]}>
            <sphereGeometry args={[0.036, 16, 12]} />
            <meshStandardMaterial color="#ffffff" roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, 0.018]} scale={[1, 1.1, 0.6]}>
            <sphereGeometry args={[0.024, 14, 10]} />
            <meshStandardMaterial color="#141414" roughness={0.3} />
          </mesh>
          <mesh position={[0.008, 0.01, 0.03]}>
            <sphereGeometry args={[0.006, 8, 6]} />
            <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.4} />
          </mesh>
        </group>
      ))}
      {/* sobrancelhas: é por elas que o humor aparece */}
      <group ref={sobrancelhas}>
        {[-1, 1].map((l) => (
          <mesh key={l} name={l < 0 ? "esq" : "dir"} position={[l * 0.062, 0.078, 0.158]}>
            <boxGeometry args={[0.055, 0.012, 0.012]} />
            <Material cor={a.corDoCabelo} />
          </mesh>
        ))}
      </group>
      {/* nariz de massinha */}
      <mesh position={[0, -0.02, 0.172]} scale={[1, 0.9, 0.8]}>
        <sphereGeometry args={[0.022, 12, 10]} />
        <meshStandardMaterial color={new THREE.Color(a.pele).multiplyScalar(0.92)} roughness={0.8} />
      </mesh>
      {/* boca: um arco que vira sorriso, reta ou "o" */}
      <group ref={boca} position={[0, -0.07, 0.155]}>
        <mesh name="sorriso" rotation-z={Math.PI}>
          <torusGeometry args={[0.03, 0.007, 6, 16, Math.PI]} />
          <meshStandardMaterial color="#6b2f2a" roughness={0.6} />
        </mesh>
        <mesh name="o" visible={false}>
          <sphereGeometry args={[0.018, 10, 8]} />
          <meshStandardMaterial color="#3a1714" roughness={0.6} />
        </mesh>
      </group>
      {a.barba && (
        <mesh position={[0, -0.01, 0]} scale={[1.05, 1.05, 1.05]}>
          <sphereGeometry args={[0.172, 24, 14, 0, Math.PI, Math.PI * 0.58, Math.PI * 0.36]} />
          <Material cor={a.corDoCabelo} rugosidade={0.9} />
        </mesh>
      )}
      {a.oculos && (
        <group position={[0, 0.02, 0.172]}>
          {[-1, 1].map((l) => (
            <mesh key={l} position={[l * 0.064, 0, 0]}>
              <torusGeometry args={[0.042, 0.007, 8, 24]} />
              <meshStandardMaterial color="#3b2a20" roughness={0.4} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.04, 0.008, 0.008]} />
            <meshStandardMaterial color="#3b2a20" />
          </mesh>
        </group>
      )}
    </group>
  );
}

function Acessorio({ a }: { a: Aparencia }) {
  if (a.acessorio === "nenhum") return null;
  if (a.acessorio === "bone") {
    return (
      <group rotation-y={Math.PI}>
        <mesh position={[0, 0.045, 0]} scale={[1.1, 0.9, 1.1]}>
          <sphereGeometry args={[0.172, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <Material cor={a.corDoAcessorio} />
        </mesh>
        <mesh position={[0, 0.06, 0.2]} rotation-x={0.12}>
          <boxGeometry args={[0.2, 0.018, 0.13]} />
          <Material cor={a.corDoAcessorio} />
        </mesh>
      </group>
    );
  }
  const pescoco = a.acessorio === "fonePescoco";
  return (
    <group position={pescoco ? [0, -0.21, 0.02] : [0, 0, 0]} rotation-x={pescoco ? -1.2 : 0}>
      <mesh>
        <torusGeometry args={[0.19, 0.016, 8, 28, Math.PI]} />
        <Material cor={a.acessorio === "headset" ? "#1f2937" : a.corDoAcessorio} rugosidade={0.5} />
      </mesh>
      {[-1, 1].map((l) => (
        <mesh key={l} position={[l * 0.185, 0, 0]} rotation-z={Math.PI / 2}>
          <cylinderGeometry args={[0.055, 0.055, 0.045, 18]} />
          <Material cor={a.acessorio === "headset" ? "#1f2937" : a.corDoAcessorio} rugosidade={0.5} />
        </mesh>
      ))}
      {a.acessorio === "headset" && (
        <mesh position={[-0.14, -0.1, 0.1]} rotation={[0.9, 0, 0.6]}>
          <cylinderGeometry args={[0.006, 0.006, 0.18, 6]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
      )}
    </group>
  );
}

/**
 * O boneco. A origem fica nos PÉS quando em pé; sentado, o corpo desce até o
 * quadril encostar no assento (quem chama já sobe o grupo para a altura da
 * cadeira, como fazia com o robô).
 */
export function BonecoDeMassinha({
  aparencia: a,
  animador,
  humor = "neutro",
}: {
  aparencia: Aparencia;
  animador: AnimadorDoBoneco;
  humor?: Humor;
}) {
  const mulher = a.corpo === "mulher";
  const ombroX = mulher ? 0.165 : 0.195;
  const corpo = useRef<THREE.Group>(null);
  const cabeca = useRef<THREE.Group>(null);
  const coxaE = useRef<THREE.Group>(null);
  const coxaD = useRef<THREE.Group>(null);
  const joelhoE = useRef<THREE.Group>(null);
  const joelhoD = useRef<THREE.Group>(null);
  const bracoE = useRef<THREE.Group>(null);
  const bracoD = useRef<THREE.Group>(null);
  const cotoveloE = useRef<THREE.Group>(null);
  const cotoveloD = useRef<THREE.Group>(null);
  const sobrancelhas = useRef<THREE.Group>(null);
  const boca = useRef<THREE.Group>(null);
  const corDaMao = useMemo(() => a.pele, [a.pele]);

  useFrame((_, dt) => {
    const passo = Math.min(dt, 0.05);
    animador.avancar(animador.parado ? 0 : passo);
    const t = animador.relogio;
    const k = 1 - Math.exp(-passo * 10);
    const base = animador.base;
    const sentado = base === "Sitting";
    const andando = base === "Walking" || base === "Running";
    const ritmo = base === "Running" ? 13 : 8;
    const amp = base === "Running" ? 0.9 : 0.55;
    const s = Math.sin(t * ritmo);

    // pernas
    const coxa = sentado ? -Math.PI / 2 : andando ? s * amp : 0;
    const joelho = sentado ? Math.PI / 2 : andando ? Math.max(0, -s) * amp * 1.1 : 0;
    const coxa2 = sentado ? -Math.PI / 2 : andando ? -s * amp : 0;
    const joelho2 = sentado ? Math.PI / 2 : andando ? Math.max(0, s) * amp * 1.1 : 0;
    if (coxaE.current) coxaE.current.rotation.x = suave(coxaE.current.rotation.x, coxa, k);
    if (coxaD.current) coxaD.current.rotation.x = suave(coxaD.current.rotation.x, coxa2, k);
    if (joelhoE.current) joelhoE.current.rotation.x = suave(joelhoE.current.rotation.x, joelho, k);
    if (joelhoD.current) joelhoD.current.rotation.x = suave(joelhoD.current.rotation.x, joelho2, k);

    // corpo: desce no assento, balança ao andar, respira parado
    if (corpo.current) {
      const y = sentado ? -0.46 : andando ? Math.abs(s) * 0.03 : Math.sin(t * 2) * 0.006;
      corpo.current.position.y = suave(corpo.current.position.y, y, k);
      corpo.current.rotation.x = suave(corpo.current.rotation.x, base === "Running" ? 0.18 : 0, k);
    }

    // braços: digitando sentado, balançando andando, soltos parado
    let be = { x: sentado ? -0.95 : andando ? -s * amp * 0.8 : 0.05, z: 0.08 };
    let bd = { x: sentado ? -0.95 : andando ? s * amp * 0.8 : 0.05, z: -0.08 };
    let ce = sentado ? -0.55 + Math.sin(t * 14) * 0.06 : andando ? -0.3 : -0.1;
    let cd = sentado ? -0.55 + Math.sin(t * 14 + 1.5) * 0.06 : andando ? -0.3 : -0.1;
    let cabecaX = 0;
    let cabecaY = 0;

    // gestos, por cima da base
    const g = animador.gesto;
    const tg = t - animador.inicioDoGesto;
    if (g === "Wave") {
      bd = { x: -0.3, z: -2.5 };
      cd = -0.2;
      bd.z += Math.sin(tg * 10) * 0.25;
    } else if (g === "ThumbsUp") {
      bd = { x: -1.3, z: -0.2 };
      cd = -1.1;
    } else if (g === "Yes") {
      cabecaX = Math.sin(tg * 11) * 0.22;
    } else if (g === "No") {
      cabecaY = Math.sin(tg * 11) * 0.38;
      be = { x: be.x, z: 0.35 };
      bd = { x: bd.x, z: -0.35 };
      ce = -0.5;
      cd = -0.5;
    }
    if (bracoE.current) {
      bracoE.current.rotation.x = suave(bracoE.current.rotation.x, be.x, k);
      bracoE.current.rotation.z = suave(bracoE.current.rotation.z, be.z, k);
    }
    if (bracoD.current) {
      bracoD.current.rotation.x = suave(bracoD.current.rotation.x, bd.x, k);
      bracoD.current.rotation.z = suave(bracoD.current.rotation.z, bd.z, k);
    }
    if (cotoveloE.current) cotoveloE.current.rotation.x = suave(cotoveloE.current.rotation.x, ce, k);
    if (cotoveloD.current) cotoveloD.current.rotation.x = suave(cotoveloD.current.rotation.x, cd, k);
    if (cabeca.current) {
      cabeca.current.rotation.x = suave(cabeca.current.rotation.x, cabecaX, k);
      cabeca.current.rotation.y = suave(cabeca.current.rotation.y, cabecaY, k);
    }

    // o humor: sobrancelhas e boca
    if (sobrancelhas.current) {
      const inclina = humor === "irritado" ? 0.35 : humor === "triste" ? -0.3 : 0;
      const sobe = humor === "surpreso" ? 0.025 : 0;
      for (const m of sobrancelhas.current.children) {
        const lado = m.name === "esq" ? 1 : -1;
        m.rotation.z = suave(m.rotation.z, -lado * inclina, k);
        m.position.y = suave(m.position.y, 0.078 + sobe, k);
      }
    }
    if (boca.current) {
      const [sorriso, o] = boca.current.children;
      if (sorriso && o) {
        o.visible = humor === "surpreso";
        sorriso.visible = humor !== "surpreso";
        // triste vira o arco para baixo; irritado achata.
        sorriso.rotation.z = humor === "triste" ? 0 : Math.PI;
        sorriso.scale.y = humor === "irritado" ? 0.3 : 1;
      }
    }
  });

  const perna = (lado: number, coxa: React.RefObject<THREE.Group | null>, joelho: React.RefObject<THREE.Group | null>) => (
    <group ref={coxa} position={[lado * 0.085, 0.48, 0]}>
      <mesh position={[0, -0.12, 0]}>
        <capsuleGeometry args={[mulher ? 0.058 : 0.064, 0.13, 6, 12]} />
        <Material cor={a.calca} />
      </mesh>
      <group ref={joelho} position={[0, -0.24, 0]}>
        <mesh position={[0, -0.1, 0]}>
          <capsuleGeometry args={[mulher ? 0.052 : 0.058, 0.12, 6, 12]} />
          <Material cor={a.calca} />
        </mesh>
        {/* sapato */}
        <mesh position={[0, -0.21, 0.035]} scale={[1, 0.6, 1.5]}>
          <sphereGeometry args={[0.062, 12, 10]} />
          <Material cor="#2a2a33" rugosidade={0.6} />
        </mesh>
      </group>
    </group>
  );

  const braco = (lado: number, ombro: React.RefObject<THREE.Group | null>, cotovelo: React.RefObject<THREE.Group | null>) => (
    <group ref={ombro} position={[lado * ombroX, 0.8, 0]}>
      <mesh position={[0, -0.1, 0]}>
        <capsuleGeometry args={[0.05, 0.11, 6, 12]} />
        <Material cor={a.roupa} />
      </mesh>
      <group ref={cotovelo} position={[0, -0.2, 0]}>
        <mesh position={[0, -0.08, 0]}>
          <capsuleGeometry args={[0.045, 0.09, 6, 12]} />
          <Material cor={a.roupa} />
        </mesh>
        <mesh position={[0, -0.17, 0]}>
          <sphereGeometry args={[0.045, 12, 10]} />
          <Material cor={corDaMao} />
        </mesh>
      </group>
    </group>
  );

  return (
    <group>
      <group ref={corpo}>
        {perna(-1, coxaE, joelhoE)}
        {perna(1, coxaD, joelhoD)}
        {/* quadril e tronco */}
        <mesh position={[0, 0.52, 0]} scale={[mulher ? 1.12 : 1, 0.7, 0.85]}>
          <sphereGeometry args={[0.15, 18, 14]} />
          <Material cor={a.calca} />
        </mesh>
        <mesh position={[0, 0.7, 0]} scale={[mulher ? 0.95 : 1.1, 1, 0.82]}>
          <capsuleGeometry args={[0.15, 0.2, 8, 18]} />
          <Material cor={a.roupa} />
        </mesh>
        {braco(-1, bracoE, cotoveloE)}
        {braco(1, bracoD, cotoveloD)}
        {/* pescoço e cabeça grande, como na arte */}
        <mesh position={[0, 0.88, 0]}>
          <cylinderGeometry args={[0.05, 0.055, 0.06, 12]} />
          <Material cor={a.pele} />
        </mesh>
        <group ref={cabeca} position={[0, 1.06, 0]}>
          <mesh scale={[1, 1.04, 0.98]}>
            <sphereGeometry args={[0.172, 28, 20]} />
            <Material cor={a.pele} rugosidade={0.7} />
          </mesh>
          {[-1, 1].map((l) => (
            <mesh key={l} position={[l * 0.168, 0, 0]} scale={[0.5, 1, 0.8]}>
              <sphereGeometry args={[0.04, 10, 8]} />
              <Material cor={a.pele} rugosidade={0.7} />
            </mesh>
          ))}
          <Rosto a={a} humor={humor} sobrancelhas={sobrancelhas} boca={boca} />
          <Cabelo a={a} />
          <Acessorio a={a} />
        </group>
      </group>
    </group>
  );
}
