import { AvatarDoAgente } from "@/components/escritorio/avatar-do-agente";
import { rotuloDaFonte } from "@/lib/analytics/fontes-da-leitura";
import { NOMES_DAS_REDES } from "@/lib/posts/estado";
import {
  CAMPOS_DA_REDE,
  numeroCurto,
  ROTULO_DO_RESULTADO,
  tempoCurto,
  type CampoDoResultado,
  type ResultadoDaRede,
} from "@/lib/painel/resultado-das-redes";

/**
 * UM AGENTE NO BLOCO "O SEU SQUAD NOS ÚLTIMOS 30 DIAS" (06/10).
 *
 * Pedido do Bruno: os números do cartão "precisam ser reais", com curtidas,
 * comentários, visualizações e tempo. O especialista de rede mostra o
 * RESULTADO da rede dele (lib/painel/resultado-das-redes.ts): o número de quem
 * viu em destaque, a lista do que a rede mede, e "sem medição ainda" no que
 * nenhuma fonte trouxe, nunca um zero que ninguém mediu. Pesquisa, mídia,
 * cortes, revisão e publicação mostram o trabalho conferido no banco.
 *
 * O número fica na cor do texto e a cor do agente vai no filete de cima: a
 * cor diz de quem é, o texto diz quanto (regra de gráfico do projeto).
 */

export type AgenteNoPainel = {
  id: string;
  nome: string;
  papel: string;
  cor: string;
  numero: number;
  unidade: string;
  rede: string | null;
  resultado: ResultadoDaRede | null;
};

const SEM_MEDICAO = "sem medição ainda";

function valorDoCampo(r: ResultadoDaRede, c: CampoDoResultado): string | null {
  const v = r.totais[c];
  if (typeof v !== "number") return null;
  return c === "tempoMedioSeg" ? tempoCurto(v) : numeroCurto(v);
}

function Cabeca({ a }: { a: AgenteNoPainel }) {
  return (
    <>
      <AvatarDoAgente agenteId={a.id} tamanho={44} />
      <p className="text-xs font-semibold mt-1.5 leading-tight" style={{ color: "var(--text-primary)" }}>{a.nome.split(" ")[0]}</p>
      <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{a.papel}</p>
    </>
  );
}

export function CartaoDoAgente({ a }: { a: AgenteNoPainel }) {
  const estilo = { background: "var(--bg-input)", boxShadow: `inset 0 2px 0 ${a.cor}` };

  if (!a.rede || !a.resultado) {
    return (
      <div className="flex flex-col items-center text-center rounded-lg px-2 py-3" style={estilo}>
        <Cabeca a={a} />
        <p className="text-xl font-black tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>{a.numero.toLocaleString("pt-BR")}</p>
        <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{a.unidade}</p>
      </div>
    );
  }

  const r = a.resultado;
  const campos = CAMPOS_DA_REDE[a.rede] ?? [];
  const destaque = r.vistos?.campo ?? null;
  const fontes = Object.keys(r.fontes).map(rotuloDaFonte);
  const dica = r.medidos
    ? `${NOMES_DAS_REDES[a.rede] ?? a.rede}, últimos 30 dias: ${r.medidos} de ${r.publicados} posts medidos (${[...new Set(fontes)].join(", ")}).`
    : `${NOMES_DAS_REDES[a.rede] ?? a.rede}, últimos 30 dias: nenhum post medido ainda.`;

  return (
    <div className="flex flex-col items-center text-center rounded-lg px-2 py-3" style={estilo} title={dica}>
      <Cabeca a={a} />
      {r.publicados === 0 ? (
        <>
          <p className="text-xl font-black tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>0</p>
          <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>posts no ar em 30 dias</p>
        </>
      ) : (
        <>
          {r.vistos ? (
            <>
              <p className="text-xl font-black tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>{numeroCurto(r.vistos.valor)}</p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
                {ROTULO_DO_RESULTADO[r.vistos.campo][r.vistos.valor === 1 ? 0 : 1]}
                {/* Quando só parte dos posts traz o campo (perfil pessoal do LinkedIn não dá impressão), a conta diz em quantos. */}
                {(r.postsComCampo[r.vistos.campo] ?? 0) < r.medidos ? ` em ${r.postsComCampo[r.vistos.campo]} de ${r.medidos} posts` : ""}
              </p>
            </>
          ) : r.interacoes !== null ? (
            <>
              <p className="text-xl font-black tabular-nums mt-1" style={{ color: "var(--text-primary)" }}>{numeroCurto(r.interacoes)}</p>
              <p className="text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>{r.interacoes === 1 ? "interação" : "interações"}</p>
            </>
          ) : (
            <p className="text-xs font-semibold mt-2" style={{ color: "var(--text-muted)" }}>{SEM_MEDICAO}</p>
          )}
          <p className="text-[10px] leading-tight mt-1" style={{ color: "var(--text-muted)" }}>
            {r.publicados} post{r.publicados === 1 ? "" : "s"} no ar · {r.medidos} medido{r.medidos === 1 ? "" : "s"}
          </p>
          <dl className="mt-2 w-full space-y-0.5 text-[10px] leading-tight">
            {campos
              .filter((c) => c !== destaque)
              .map((c) => {
                const v = valorDoCampo(r, c);
                return (
                  <div key={c} className="flex items-baseline justify-between gap-1.5 text-left">
                    <dt className="truncate" style={{ color: "var(--text-muted)" }}>{ROTULO_DO_RESULTADO[c][1]}</dt>
                    <dd className={`shrink-0 tabular-nums ${v ? "font-semibold" : "italic"}`} style={{ color: v ? "var(--text-primary)" : "var(--text-muted)" }}>
                      {v ?? "sem medição"}
                    </dd>
                  </div>
                );
              })}
          </dl>
        </>
      )}
      <p className="mt-auto pt-2 text-[10px] leading-tight" style={{ color: "var(--text-muted)" }}>
        {a.numero.toLocaleString("pt-BR")} {a.unidade}
      </p>
    </div>
  );
}
