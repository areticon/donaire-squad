"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { LOGO_POR_REDE } from "@/components/social/logos-redes";
import {
  ERRO_DO_ENDERECO,
  normalizarEnderecoDaRede,
  REDES_DO_PERFIL,
  ROTULO_DA_REDE_DO_PERFIL,
  valorNoCampo,
  type RedeDoPerfil,
  type RedesEscritas,
} from "@/lib/projeto/links-do-cliente";

/**
 * AS REDES DO CLIENTE NA TELA (06/10, pedido do Bruno: "aqui tem em cima
 * pedindo o link do YouTube e embaixo de novo, por quê? Se preencher a parte
 * de cima, os links das redes já devem ficar salvos").
 *
 * Os mesmos campos em dois lugares: no topo do setup ("Coloque aqui as suas
 * redes", que também alimenta o Estudar o meu perfil) e em Configurações, aba
 * Seus links. Os dois gravam no mesmo lugar (`Project.config.redesDoCliente`,
 * pela rota /api/projects/[id]/links), sozinhos, um instante depois de a
 * pessoa parar de digitar. Gravar aqui NUNCA dispara estudo: o estudo (pago)
 * só roda no botão do setup. A regra da fonte única está em
 * lib/projeto/links-do-cliente.ts.
 *
 * Ao abrir, cada rede mostra o que está gravado; a rede ainda não escrita
 * mostra o perfil já estudado (de antes da fonte única), e o dono grava esse
 * valor no primeiro instante, para as descrições passarem a usar.
 */

const DICA: Record<RedeDoPerfil, string> = {
  instagram: "@seuperfil ou instagram.com/seuperfil",
  tiktok: "@seuperfil",
  youtube: "@seucanal ou o link do canal",
  linkedin: "linkedin.com/in/seunome",
  facebook: "facebook.com/suapagina",
};

type Valores = Record<RedeDoPerfil, string>;
const vazios = (): Valores => Object.fromEntries(REDES_DO_PERFIL.map((r) => [r, ""])) as Valores;

/** O que vai para a rota: cada rede válida ou vazia (vazia apaga). A inválida não vai, e o que estava gravado fica. */
function paraGravar(valores: Valores): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of REDES_DO_PERFIL) {
    const bruto = (valores[r] ?? "").trim();
    if (!bruto) out[r] = "";
    else {
      const n = normalizarEnderecoDaRede(r, bruto);
      if (n) out[r] = n;
    }
  }
  return out;
}

function dosGravados(redes: RedesEscritas): Valores {
  const v = vazios();
  for (const r of REDES_DO_PERFIL) {
    const g = redes[r];
    if (g) v[r] = valorNoCampo(r, g);
  }
  return v;
}

export type RedesNaTela = {
  carregado: boolean;
  valores: Valores;
  mudar: (rede: RedeDoPerfil, valor: string) => void;
  estado: "parado" | "salvando" | "salvo" | "erro";
  /** Grava já, sem esperar o instante (antes do Estudar o meu perfil). */
  gravarAgora: () => Promise<void>;
};

export function useRedesDoCliente(projetoId: string, podeEditar = true): RedesNaTela {
  const [valores, setValores] = useState<Valores>(vazios);
  const [carregado, setCarregado] = useState(false);
  const [estado, setEstado] = useState<RedesNaTela["estado"]>("parado");
  const ultimoEnviado = useRef<string>("");
  const atuais = useRef<Valores>(valores);
  atuais.current = valores;

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projetoId}/links`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { redes?: RedesEscritas; estudadas?: RedesEscritas } | null) => {
        if (!vivo) return;
        const gravados = dosGravados(d?.redes ?? {});
        ultimoEnviado.current = JSON.stringify(paraGravar(gravados));
        const estudados = dosGravados(d?.estudadas ?? {});
        const v = vazios();
        for (const r of REDES_DO_PERFIL) v[r] = gravados[r] || estudados[r];
        setValores(v);
        setCarregado(true);
      })
      .catch(() => {
        if (vivo) setCarregado(true);
      });
    return () => {
      vivo = false;
    };
  }, [projetoId]);

  const gravar = useCallback(
    async (v: Valores) => {
      const redes = paraGravar(v);
      const chave = JSON.stringify(redes);
      if (chave === ultimoEnviado.current) return;
      setEstado("salvando");
      try {
        const r = await fetch(`/api/projects/${projetoId}/links`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ redes }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Não consegui salvar as redes.");
        ultimoEnviado.current = chave;
        setEstado("salvo");
      } catch (e) {
        setEstado("erro");
        toast.error(e instanceof Error ? e.message : "Não consegui salvar as redes.");
      }
    },
    [projetoId]
  );

  useEffect(() => {
    if (!carregado || !podeEditar) return;
    const t = window.setTimeout(() => void gravar(valores), 900);
    return () => window.clearTimeout(t);
  }, [valores, carregado, podeEditar, gravar]);

  const mudar = useCallback((rede: RedeDoPerfil, valor: string) => {
    setValores((v) => ({ ...v, [rede]: valor }));
    setEstado("parado");
  }, []);

  const gravarAgora = useCallback(async () => {
    if (podeEditar) await gravar(atuais.current);
  }, [gravar, podeEditar]);

  return { carregado, valores, mudar, estado, gravarAgora };
}

/** O aviso discreto de gravação, ao lado dos campos. */
export function EstadoDasRedes({ estado }: { estado: RedesNaTela["estado"] }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]" data-estado-das-redes={estado}>
      {estado === "salvando" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
        </>
      )}
      {estado === "salvo" && (
        <>
          <Check className="h-3 w-3 text-green-500" /> Salvo. As próximas descrições já usam.
        </>
      )}
      {estado === "erro" && "Não salvou. Confira os endereços."}
    </span>
  );
}

/**
 * SUAS REDES em Configurações, aba Seus links (06/10). Os mesmos campos do
 * topo do setup, acima das páginas (site, loja, WhatsApp). Grava sozinho e
 * só grava: o estudo do perfil continua no botão do setup.
 */
export function RedesNasConfiguracoes({ projetoId, podeEditar = true }: { projetoId: string; podeEditar?: boolean }) {
  const redes = useRedesDoCliente(projetoId, podeEditar);
  return (
    <div className="space-y-2" data-redes-nas-configuracoes>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Suas redes</p>
          <p className="text-xs text-[var(--text-muted)]">
            As mesmas do começo do projeto. Entram nas descrições dos posts: o link onde a rede aceita link, o @ onde não aceita.
          </p>
        </div>
        <EstadoDasRedes estado={redes.estado} />
      </div>
      <CamposDasRedes redes={redes} desabilitado={!podeEditar} />
    </div>
  );
}

/** Os campos das redes, um cartão por rede, com o aviso de endereço que não parece da rede. */
export function CamposDasRedes({ redes, desabilitado = false }: { redes: RedesNaTela; desabilitado?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-campos-das-redes>
      {REDES_DO_PERFIL.map((r) => {
        const Logo = LOGO_POR_REDE[r];
        const valor = redes.valores[r] ?? "";
        const valido = !valor.trim() || Boolean(normalizarEnderecoDaRede(r, valor));
        return (
          <label
            key={r}
            className="flex min-w-0 items-start gap-3 rounded-xl border p-2.5"
            style={{ background: "var(--bg-primary)", borderColor: valido ? "var(--border)" : "#f87171" }}
            data-rede-do-cliente={r}
          >
            <span className="pt-0.5">
              <Logo />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium text-[var(--text-primary)]">{ROTULO_DA_REDE_DO_PERFIL[r]}</span>
              <input
                aria-label={`Seu ${ROTULO_DA_REDE_DO_PERFIL[r]}`}
                value={valor}
                onChange={(e) => redes.mudar(r, e.target.value)}
                placeholder={DICA[r]}
                disabled={desabilitado || !redes.carregado}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--text-muted)]"
                style={{ color: "var(--text-primary)" }}
              />
              {!valido && <span className="mt-0.5 block text-[11px] leading-snug text-red-400">{ERRO_DO_ENDERECO[r]}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}
