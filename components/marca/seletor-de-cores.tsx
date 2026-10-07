"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Loader2, Pipette, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { medidaDaCor } from "@/lib/media/papeis-da-paleta";
import { NEUTROS, checarContraste, type ChecagemDeContraste, type PapeisEscolhidos, type PapelDaCor } from "@/lib/modelos-de-arte/identidade";
import {
  MAXIMO_DE_APOIO,
  PAPEL_DA_VAGA,
  chaveDasVagas,
  destaqueNoVideo,
  ehPaletaDeFabrica,
  normalizarHex,
  normalizarPaleta,
  paletaDasVagas,
  papeisDasVagas,
  papeisDepoisDeGravar,
  porCorNaVaga,
  previaDasVagas,
  trocaDerrubaAprovacao,
  vagasDaPaleta,
  type CoresDaTela,
  type OrigemDaSugestao,
  type PapelDaVaga,
  type VagasDeCor,
} from "@/lib/marca/cores-da-marca";

/**
 * O SELETOR DE CORES DA MARCA (08/10/2026), o mesmo no setup (etapa Marca) e
 * em Configurações > Marca e voz.
 *
 * Substitui os quadrados de 56 px do setup e o campo "Paleta, separada por
 * vírgula" de Configurações, que o Bruno achou difíceis de operar. O desenho:
 *
 * - Cada cor numa VAGA com o papel escrito (Principal, Fundo, Texto, Apoio).
 *   Trocar o papel é um "Trocar com", e não editar a ordem de uma string.
 * - A KEY de cada vaga é o id da vaga, nunca a cor. Com a cor na key (como era
 *   em step-marca.tsx), cada movimento do seletor nativo recriava o elemento,
 *   e o Chrome fechava o seletor no primeiro arraste.
 * - Um campo hex por vaga, que aceita com ou sem #, 3 ou 6 dígitos, e diz na
 *   própria vaga quando não reconhece.
 * - Sugestões do logo, do manual e das capas, com "Usar estas".
 * - Prévia aplicada (fundo, título com a palavra marcada, botão) e a checagem
 *   de contraste do book, com a troca sugerida num clique.
 * - Grava sozinho (como o book), na ordem que os leitores esperam, com os
 *   papéis do book juntos. Se a troca derrubaria uma identidade APROVADA, a
 *   tela segura e pergunta antes: aprovação não cai por um arraste distraído.
 */

type Vaga = { id: string; papel: PapelDaVaga; cor: string | null };

const PAPEIS_FIXOS = ["principal", "fundo", "texto"] as const;

/** O papel do book com o nome que esta tela usa (o "título" do book é o Texto daqui). */
const PAPEL_DO_BOOK_NA_TELA: Record<PapelDaCor, string> = { fundo: "o Fundo", titulo: "o Texto", destaque: "a Principal" };

const numero = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });

/** A checagem do book dita com os nomes desta tela. */
function fraseDoContraste(c: ChecagemDeContraste): string {
  if (c.papel === "titulo") {
    return c.ok ? `Texto sobre o fundo: ${numero(c.razao)}:1, lê bem.` : `Texto sobre o fundo: ${numero(c.razao)}:1, abaixo do mínimo de ${numero(c.minimo)}:1 para ler.`;
  }
  return c.ok
    ? `Principal sobre o fundo: ${numero(c.razao)}:1, aparece.`
    : `Principal sobre o fundo: ${numero(c.razao)}:1, some no fundo (mínimo ${numero(c.minimo)}:1); na arte, a palavra marcada sai sublinhada.`;
}

/** Os neutros que fundo e texto podem usar num clique (os mesmos do book). */
const ATALHOS = [
  { cor: "#ffffff", nome: "Branco" },
  { cor: "#141414", nome: "Quase preto" },
];

function nomeDaVaga(v: Vaga, lista: Vaga[]): string {
  if (v.papel !== "apoio") return PAPEL_DA_VAGA[v.papel].nome;
  const n = lista.filter((x) => x.papel === "apoio").findIndex((x) => x.id === v.id) + 1;
  return `Apoio ${n}`;
}

function paraVagas(lista: Vaga[]): VagasDeCor {
  const de = (id: string) => lista.find((x) => x.id === id)?.cor ?? null;
  return {
    principal: de("principal"),
    fundo: de("fundo"),
    texto: de("texto"),
    apoio: lista.filter((x) => x.papel === "apoio" && x.cor).map((x) => x.cor as string),
  };
}

export function SeletorDeCores({
  projectId,
  logoUrl,
  sugestaoDasCapas,
  aoGravar,
}: {
  projectId: string;
  /** O logo de agora: quando muda (subiu, trocou, saiu), as sugestões são refeitas. */
  logoUrl?: string | null;
  /** A sugestão das capas que o setup acabou de montar e que talvez ainda não esteja na resposta. */
  sugestaoDasCapas?: { cores: string; porque?: string } | null;
  /** Avisado a cada gravação, com a string gravada (o setup mantém o formulário igual). */
  aoGravar?: (paleta: string) => void;
}) {
  const [dados, setDados] = useState<CoresDaTela | null>(null);
  const [falhaAoCarregar, setFalhaAoCarregar] = useState(false);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "erro">("");
  const [mensagemDeErro, setMensagemDeErro] = useState("");
  const [confirmouDerrubar, setConfirmouDerrubar] = useState(false);
  const [aprovacaoCaiu, setAprovacaoCaiu] = useState(false);
  const [anterior, setAnterior] = useState<Vaga[] | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, string>>({});
  const [erros, setErros] = useState<Record<string, string>>({});
  const [temContaGotas, setTemContaGotas] = useState(false);

  const proximoId = useRef(1);
  const novoIdDeApoio = () => `apoio-${proximoId.current++}`;
  /** O que está gravado no banco: a chave (para saber se mudou) e as vagas (para desfazer). */
  const [chaveGravada, setChaveGravada] = useState("");
  const vagasGravadas = useRef<Vaga[]>([]);
  const tocou = useRef(false);
  const ultimaGravacao = useRef(0);

  const montarLista = useCallback((v: VagasDeCor): Vaga[] => {
    return [
      { id: "principal", papel: "principal", cor: v.principal },
      { id: "fundo", papel: "fundo", cor: v.fundo },
      { id: "texto", papel: "texto", cor: v.texto },
      ...v.apoio.map((cor) => ({ id: `apoio-${proximoId.current++}`, papel: "apoio" as const, cor })),
    ];
  }, []);

  // O conta-gotas do navegador (Chrome e Edge), para pegar a cor do logo na tela.
  useEffect(() => {
    setTemContaGotas(typeof window !== "undefined" && "EyeDropper" in window);
  }, []);

  // Carrega na entrada e de novo quando o logo muda: o logo novo traz sugestão nova.
  useEffect(() => {
    let vivo = true;
    setFalhaAoCarregar(false);
    fetch(`/api/projects/${projectId}/cores`)
      .then((r) => (r.ok ? (r.json() as Promise<CoresDaTela>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        // Só troca as vagas se a pessoa ainda não mexeu: o logo que acabou de
        // subir não pode apagar a cor que ela está escolhendo.
        if (!tocou.current) {
          const lista = montarLista(d.vagas);
          setVagas(lista);
          setChaveGravada(chaveDasVagas(d.vagas));
          vagasGravadas.current = lista;
        }
      })
      .catch(() => vivo && setFalhaAoCarregar(true));
    return () => {
      vivo = false;
    };
  }, [projectId, logoUrl, montarLista]);

  const atuais = useMemo(() => paraVagas(vagas), [vagas]);
  const chave = useMemo(() => chaveDasVagas(atuais), [atuais]);
  const mudou = dados !== null && chave !== chaveGravada;
  const derruba = dados ? trocaDerrubaAprovacao(dados.identidade, atuais) : false;
  const segurando = mudou && derruba && !confirmouDerrubar;
  const podeMudar = Boolean(dados?.podeMudar);

  const gravar = useCallback(
    async (v: VagasDeCor, lista: Vaga[]) => {
      const paleta = paletaDasVagas(v);
      if (!paleta.length) return;
      const papeis = papeisDasVagas(v);
      const minha = ++ultimaGravacao.current;
      setEstado("guardando");
      try {
        const r = await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colorPalette: paleta.join(","), ...(papeis ? { papeisDaMarca: papeis } : {}) }),
        });
        const corpo = (await r.json().catch(() => ({}))) as {
          error?: string;
          identidade?: { aprovadaAntes: boolean; aprovadaAgora: boolean; papeis: PapeisEscolhidos | null };
        };
        if (!r.ok) throw new Error(corpo.error ?? "Não consegui guardar as cores.");
        // Uma gravação mais nova já saiu: esta resposta não manda mais na tela.
        if (minha !== ultimaGravacao.current) return;
        setChaveGravada(chaveDasVagas(v));
        vagasGravadas.current = lista;
        setEstado("guardado");
        setMensagemDeErro("");
        setConfirmouDerrubar(false);
        const ident = corpo.identidade;
        if (ident?.aprovadaAntes && !ident.aprovadaAgora) setAprovacaoCaiu(true);
        setDados((d) =>
          d
            ? {
                ...d,
                paleta,
                escolhida: true,
                deFabrica: ehPaletaDeFabrica(paleta),
                efetivas: { ...d.efetivas, cores: paleta, origem: "configuracao", rotulo: "as cores que você escolheu" },
                identidade: { ...d.identidade, aprovada: ident?.aprovadaAgora ?? d.identidade.aprovada, papeis: ident?.papeis ?? papeis ?? d.identidade.papeis },
              }
            : d
        );
        aoGravar?.(paleta.join(","));
      } catch (e) {
        if (minha !== ultimaGravacao.current) return;
        setEstado("erro");
        setMensagemDeErro(e instanceof Error ? e.message : "Não consegui guardar as cores.");
      }
    },
    [projectId, aoGravar]
  );

  // Grava sozinho, com um pequeno atraso: um arraste no seletor vira um PATCH.
  useEffect(() => {
    if (!dados || !podeMudar || !mudou || segurando || !atuais.principal) return;
    const t = setTimeout(() => void gravar(atuais, vagas), 600);
    return () => clearTimeout(t);
  }, [dados, podeMudar, mudou, segurando, atuais, vagas, gravar]);

  /** Toda edição da pessoa passa por aqui: marca que ela mexeu e tira o "desfazer" da sugestão. */
  const editar = useCallback((f: (l: Vaga[]) => Vaga[], manterAnterior = false) => {
    tocou.current = true;
    if (!manterAnterior) setAnterior(null);
    setVagas((l) => f(l));
  }, []);

  const porCor = (id: string, cor: string | null) => {
    editar((l) => l.map((x) => (x.id === id ? { ...x, cor } : x)));
    setRascunhos((r) => {
      if (!(id in r)) return r;
      const { [id]: _fora, ...resto } = r;
      void _fora;
      return resto;
    });
    setErros((e) => {
      if (!(id in e)) return e;
      const { [id]: _fora, ...resto } = e;
      void _fora;
      return resto;
    });
  };

  const trocarCom = (id: string, outro: string) => {
    editar((l) => {
      const a = l.find((x) => x.id === id);
      const b = l.find((x) => x.id === outro);
      if (!a || !b) return l;
      return l.map((x) => (x.id === id ? { ...x, cor: b.cor } : x.id === outro ? { ...x, cor: a.cor } : x));
    });
  };

  const confirmarHex = (id: string) => {
    const texto = rascunhos[id];
    if (texto === undefined) return;
    const cor = normalizarHex(texto);
    if (cor) porCor(id, cor);
    else setErros((e) => ({ ...e, [id]: "Não reconheci essa cor. Use 6 dígitos, como #F97316 (com ou sem #, ou 3 dígitos, como #F73)." }));
  };

  const pegarDaTela = async (id: string) => {
    try {
      const Conta = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
      const { sRGBHex } = await new Conta().open();
      const cor = normalizarHex(sRGBHex);
      if (cor) porCor(id, cor);
    } catch {
      // Esc no conta-gotas não é erro: a pessoa desistiu.
    }
  };

  const usarCores = (cores: string[]) => {
    const lista = montarLista(vagasDaPaleta(cores, null));
    setAnterior(vagas);
    editar(() => lista, true);
    setRascunhos({});
    setErros({});
  };

  const desfazer = () => {
    editar(() => vagasGravadas.current);
    setConfirmouDerrubar(false);
    setRascunhos({});
    setErros({});
  };

  // As sugestões: as da rota e, no setup, a das capas que acabou de ser montada.
  const sugestoes = useMemo<OrigemDaSugestao[]>(() => {
    const daRota = dados?.sugestoes ?? [];
    const extra = sugestaoDasCapas ? normalizarPaleta(sugestaoDasCapas.cores).cores : [];
    if (!extra.length || daRota.some((s) => s.origem === "capas")) return daRota;
    return [...daRota, { origem: "capas", titulo: "Das capas do seu Instagram", cores: extra, porque: sugestaoDasCapas?.porque }];
  }, [dados, sugestaoDasCapas]);

  const previa = previaDasVagas(atuais);
  const paletaAtual = paletaDasVagas(atuais);
  const papeisDaPrevia: PapeisEscolhidos = { fundo: previa.fundo, titulo: previa.titulo, destaque: previa.destaque };
  const checagens = atuais.principal && atuais.fundo && atuais.texto ? checarContraste(papeisDaPrevia, paletaAtual) : [];
  const noVideo = destaqueNoVideo(atuais);
  const principal = normalizarHex(atuais.principal);
  const papeisQueMudam = useMemo(() => {
    if (!dados?.identidade.papeis) return [] as PapelDaCor[];
    const depois = papeisDepoisDeGravar(atuais, dados.identidade.papeis);
    return (["fundo", "titulo", "destaque"] as PapelDaCor[]).filter((p) => depois && depois[p] !== dados.identidade.papeis![p]);
  }, [atuais, dados]);

  if (falhaAoCarregar && !dados) {
    return (
      <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <AlertTriangle className="h-4 w-4 text-yellow-500" /> Não consegui carregar as suas cores. Recarregue a página.
      </p>
    );
  }
  if (!dados) {
    return (
      <p className="flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> Carregando as suas cores...
      </p>
    );
  }

  const apoios = vagas.filter((v) => v.papel === "apoio");
  const doLogo = sugestoes.find((s) => s.origem === "logo");
  const iguais = (cores: string[]) => paletaDasVagas(vagasDaPaleta(cores, null)).join(",") === paletaAtual.join(",");

  return (
    <div className="space-y-4">
      {/* A linha de estado: de onde vêm as cores e se já gravou. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12.5px]" style={{ color: "var(--text-muted)" }}>
          {dados.escolhida || mudou ? "Cada cor tem um papel. Mudou aqui, vale nas próximas artes, carrosséis e legendas." : podeMudar ? "" : `Enquanto não há escolha, a arte usa ${dados.efetivas.rotulo}.`}
        </p>
        <span aria-live="polite" className="flex items-center gap-1.5 text-xs" style={{ color: estado === "erro" ? "#f87171" : "var(--text-muted)" }}>
          {estado === "guardando" && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> Guardando...
            </>
          )}
          {estado === "guardado" && !mudou && (
            <>
              <Check className="h-3.5 w-3.5 text-green-500" /> Salvo
            </>
          )}
          {estado === "erro" && (
            <>
              {mensagemDeErro || "Não consegui guardar."}
              <button type="button" onClick={() => void gravar(atuais, vagas)} className="font-semibold underline">
                Tentar de novo
              </button>
            </>
          )}
        </span>
      </div>

      {/* Sem escolha ainda: dizer de onde vêm as cores e deixar confirmar num clique. */}
      {!dados.escolhida && podeMudar && !mudou && atuais.principal && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Estas são {dados.efetivas.rotulo}. Ficam como suas quando você confirmar ou mudar uma delas.
          </p>
          <Button size="sm" onClick={() => void gravar(atuais, vagas)} loading={estado === "guardando"}>
            Confirmar estas cores
          </Button>
        </div>
      )}

      {/* As de fábrica: o laranja da Demandou que o assistente gravava sozinho até 08/10. */}
      {dados.deFabrica && !mudou && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ background: "rgba(161,98,7,.12)", borderColor: "rgba(250,204,21,.35)" }}>
          <p className="flex items-start gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            Estas são as cores de fábrica da Demandou, e não as da sua marca. Escolha as suas{doLogo ? " ou use as do seu logo" : ""}.
          </p>
          {doLogo && podeMudar && (
            <Button size="sm" variant="outline" onClick={() => usarCores(doLogo.cores)}>
              Usar as do logo
            </Button>
          )}
        </div>
      )}

      {/* A troca que derrubaria a identidade aprovada espera a pessoa decidir.
          Fica em cima das vagas, à vista de quem está arrastando o seletor. */}
      {segurando && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ background: "rgba(161,98,7,.14)", borderColor: "rgba(250,204,21,.35)" }}>
          <p className="flex min-w-0 flex-1 items-start gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            <span>
              Sua identidade visual está aprovada. Esta troca muda{" "}
              {papeisQueMudam.length ? papeisQueMudam.map((p) => PAPEL_DO_BOOK_NA_TELA[p]).join(", ").replace(/, ([^,]*)$/, " e $1") : "as cores"} das artes, e a
              identidade vai pedir aprovação de novo
              {dados.identidade.aguardando > 0 ? ` (${dados.identidade.aguardando === 1 ? "1 arte esperando" : `${dados.identidade.aguardando} artes esperando`})` : ""}.
            </span>
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={desfazer}>
              Desfazer
            </Button>
            <Button size="sm" onClick={() => setConfirmouDerrubar(true)}>
              Trocar mesmo assim
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="min-w-0 space-y-3">
          {/* As três vagas com papel. */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PAPEIS_FIXOS.map((id) => {
              const v = vagas.find((x) => x.id === id);
              if (!v) return null;
              return (
                <CartaoDaVaga
                  key={v.id}
                  vaga={v}
                  nome={PAPEL_DA_VAGA[v.papel].nome}
                  dica={PAPEL_DA_VAGA[v.papel].dica}
                  // Só troca entre duas vagas com cor: trocar com uma vaga vazia esvaziaria um papel.
                  outras={vagas.filter((x) => x.id !== v.id && x.cor && v.cor).map((x) => ({ id: x.id, nome: nomeDaVaga(x, vagas), cor: x.cor }))}
                  rascunho={rascunhos[v.id]}
                  erro={erros[v.id]}
                  desabilitada={!podeMudar}
                  temContaGotas={temContaGotas}
                  atalhos={v.papel === "principal" ? [] : ATALHOS}
                  aoEscolher={(cor) => porCor(v.id, cor)}
                  aoDigitar={(t) => {
                    setRascunhos((r) => ({ ...r, [v.id]: t }));
                    // Seis dígitos completos já valem enquanto digita (a prévia acompanha); o resto espera sair do campo.
                    if (/^#?[0-9a-f]{6}$/i.test(t.trim())) {
                      const cor = normalizarHex(t);
                      if (cor) editar((l) => l.map((x) => (x.id === v.id ? { ...x, cor } : x)));
                    }
                  }}
                  aoConfirmarHex={() => confirmarHex(v.id)}
                  aoTrocarCom={(outro) => trocarCom(v.id, outro)}
                  aoPegarDaTela={() => void pegarDaTela(v.id)}
                />
              );
            })}
          </div>

          {/* As de apoio: tirar, trocar de papel, e somar até três. */}
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
              Cores de apoio
            </p>
            {apoios.length > 0 && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {apoios.map((v) => (
                  <CartaoDaVaga
                    key={v.id}
                    vaga={v}
                    nome={nomeDaVaga(v, vagas)}
                    dica={PAPEL_DA_VAGA.apoio.dica}
                    compacta
                    outras={vagas.filter((x) => x.id !== v.id && x.cor && v.cor).map((x) => ({ id: x.id, nome: nomeDaVaga(x, vagas), cor: x.cor }))}
                    rascunho={rascunhos[v.id]}
                    erro={erros[v.id]}
                    desabilitada={!podeMudar}
                    temContaGotas={temContaGotas}
                    atalhos={[]}
                    aoEscolher={(cor) => porCor(v.id, cor)}
                    aoDigitar={(t) => {
                      setRascunhos((r) => ({ ...r, [v.id]: t }));
                      if (/^#?[0-9a-f]{6}$/i.test(t.trim())) {
                        const cor = normalizarHex(t);
                        if (cor) editar((l) => l.map((x) => (x.id === v.id ? { ...x, cor } : x)));
                      }
                    }}
                    aoConfirmarHex={() => confirmarHex(v.id)}
                    aoTrocarCom={(outro) => trocarCom(v.id, outro)}
                    aoPegarDaTela={() => void pegarDaTela(v.id)}
                    aoRemover={() => editar((l) => l.filter((x) => x.id !== v.id))}
                  />
                ))}
              </div>
            )}
            {apoios.length < MAXIMO_DE_APOIO && podeMudar && (
              <button
                type="button"
                onClick={() => editar((l) => [...l, { id: novoIdDeApoio(), papel: "apoio", cor: null }])}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-xs font-medium transition-colors hover:border-orange-500 hover:text-orange-500"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar cor de apoio
              </button>
            )}
          </div>

          {/* As sugestões: do logo, do manual e das capas. */}
          {sugestoes.length > 0 && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                Achei estas cores
              </p>
              <ul className="space-y-2">
                {sugestoes.map((s) => (
                  <li key={s.origem} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2.5" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                          {s.titulo}
                        </span>
                        <span className="flex gap-1" aria-label={s.cores.join(", ")}>
                          {s.cores.map((c) => (
                            <span key={c} className="h-5 w-5 rounded-full border" style={{ background: c, borderColor: "var(--border)" }} title={c.toUpperCase()} />
                          ))}
                        </span>
                      </div>
                      {s.porque && (
                        <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
                          {s.porque}
                        </p>
                      )}
                    </div>
                    {iguais(s.cores) ? (
                      <span className="text-xs font-semibold text-green-500">Em uso</span>
                    ) : (
                      podeMudar && (
                        <Button size="sm" variant="outline" onClick={() => usarCores(s.cores)}>
                          Usar estas
                        </Button>
                      )
                    )}
                  </li>
                ))}
              </ul>
              {anterior && (
                <button type="button" onClick={() => editar(() => anterior)} className="inline-flex items-center gap-1 text-xs font-medium text-orange-500 hover:underline">
                  <RotateCcw className="h-3 w-3" /> Voltar às cores de antes
                </button>
              )}
            </div>
          )}
        </div>

        {/* A prévia aplicada, na hora: fundo, título com a palavra marcada e botão. */}
        <aside className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            Prévia
          </p>
          <div className="overflow-hidden rounded-xl border" style={{ background: previa.fundo, borderColor: "var(--border)" }} aria-label="Prévia das cores numa arte">
            <div className="space-y-2.5 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: previa.titulo, opacity: 0.7 }}>
                Sua marca
              </p>
              <p className="text-lg font-extrabold leading-tight" style={{ color: previa.titulo }}>
                O título do post com a{" "}
                <span
                  style={
                    previa.destaqueSublinhado
                      ? { textDecorationLine: "underline", textDecorationColor: previa.destaque, textDecorationThickness: 3, textUnderlineOffset: 4 }
                      : { color: previa.destaque }
                  }
                >
                  palavra marcada
                </span>
              </p>
              <p className="text-xs leading-snug" style={{ color: previa.titulo, opacity: 0.85 }}>
                Uma linha de apoio, do jeito que a legenda da arte entra.
              </p>
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex rounded-full px-3.5 py-1.5 text-xs font-bold" style={{ background: previa.destaque, color: previa.letraDoBotao }}>
                  Saiba mais
                </span>
                {atuais.apoio.length > 0 && (
                  <span className="flex gap-1">
                    {atuais.apoio.map((c) => (
                      <span key={c} className="h-3 w-3 rounded-full" style={{ background: c }} />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>
          {/* O contraste, com a troca sugerida num clique (a mesma regra do book). */}
          {checagens.length > 0 && (
            <ul className="space-y-1">
              {checagens.map((c) => (
                <li key={c.papel} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]" style={{ color: c.ok ? "var(--text-muted)" : "#ea580c" }}>
                  {c.ok ? <Check className="h-3.5 w-3.5 shrink-0 text-green-500" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                  <span className="min-w-0 flex-1">{fraseDoContraste(c)}</span>
                  {/* Branco ou preto como Principal não é sugestão: destaque é cor da marca. */}
                  {!c.ok && c.sugestao && podeMudar && !(c.papel === "destaque" && (NEUTROS as readonly string[]).includes(c.sugestao)) && (
                    <button
                      type="button"
                      onClick={() => editar((l) => montarListaMantendoIds(l, porCorNaVaga(paraVagas(l), c.papel === "titulo" ? "texto" : "principal", c.sugestao!)))}
                      className="rounded border px-1.5 py-0.5 font-semibold"
                      style={{ borderColor: "currentColor" }}
                    >
                      Usar {c.sugestao.toUpperCase()}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {/* O vídeo lê pela hierarquia: quando ela escolhe outra cor, a tela diz. */}
          {principal && noVideo && noVideo !== principal && (
            <p className="flex items-start gap-1.5 text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-yellow-500" />
              <span>
                No vídeo, a palavra acesa da legenda sai em{" "}
                <span className="inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: noVideo }} /> {noVideo.toUpperCase()}: a Principal é{" "}
                {medidaDaCor(principal).l < 0.5 ? "escura" : "clara"} demais para destaque.
              </span>
            </p>
          )}
        </aside>
      </div>

      {aprovacaoCaiu && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-primary)" }}>
            Cores trocadas. Aprove a identidade de novo para as artes saírem nas cores novas
            {dados.identidade.aguardando > 0 ? ` (${dados.identidade.aguardando === 1 ? "1 arte esperando" : `${dados.identidade.aguardando} artes esperando`})` : ""}.
          </p>
          <a href={`/projects/${projectId}/settings?aba=modelos`} className="text-sm font-semibold text-orange-500 hover:underline">
            Aprovar em Modelos de arte
          </a>
        </div>
      )}

      {!podeMudar && (
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          Só quem administra a conta muda as cores da marca.
        </p>
      )}
    </div>
  );
}

/**
 * As vagas novas sobre os ids de antes: a sugestão de contraste troca cores
 * entre vagas, e recriar as vagas (ids novos) fecharia um seletor aberto.
 * A vaga de apoio que ficou sem cor na troca sai.
 */
function montarListaMantendoIds(l: Vaga[], v: VagasDeCor): Vaga[] {
  const apoio = [...v.apoio];
  const saida: Vaga[] = [];
  for (const x of l) {
    if (x.papel !== "apoio") saida.push({ ...x, cor: v[x.papel as (typeof PAPEIS_FIXOS)[number]] });
    else if (!x.cor) saida.push(x);
    else {
      const cor = apoio.shift();
      if (cor) saida.push({ ...x, cor });
    }
  }
  return saida;
}

function CartaoDaVaga({
  vaga,
  nome,
  dica,
  compacta = false,
  outras,
  rascunho,
  erro,
  desabilitada,
  temContaGotas,
  atalhos,
  aoEscolher,
  aoDigitar,
  aoConfirmarHex,
  aoTrocarCom,
  aoPegarDaTela,
  aoRemover,
}: {
  vaga: Vaga;
  nome: string;
  dica: string;
  compacta?: boolean;
  outras: Array<{ id: string; nome: string; cor: string | null }>;
  rascunho?: string;
  erro?: string;
  desabilitada: boolean;
  temContaGotas: boolean;
  atalhos: Array<{ cor: string; nome: string }>;
  aoEscolher: (cor: string) => void;
  aoDigitar: (texto: string) => void;
  aoConfirmarHex: () => void;
  aoTrocarCom: (outro: string) => void;
  aoPegarDaTela: () => void;
  aoRemover?: () => void;
}) {
  const idDoNome = `vaga-${vaga.id}-nome`;
  const idDoErro = `vaga-${vaga.id}-erro`;
  const cor = vaga.cor;
  return (
    <div role="group" aria-labelledby={idDoNome} className="flex flex-col gap-2 rounded-xl border p-3" style={{ background: "var(--bg-input)", borderColor: erro ? "#f87171" : "var(--border)" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p id={idDoNome} className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {nome}
          </p>
          {!compacta && (
            <p className="mt-0.5 text-[11.5px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {dica}
            </p>
          )}
        </div>
        {aoRemover && !desabilitada && (
          <button
            type="button"
            onClick={aoRemover}
            aria-label={`Tirar ${nome}`}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-red-500/15 hover:text-red-400"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* A amostra É o seletor: o input nativo cobre a amostra, transparente,
            e o Chrome abre o seletor ao lado dela. A key da vaga é o id, então
            arrastar não recria o input (o defeito de 08/10). */}
        <label
          className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border ${desabilitada ? "" : "cursor-pointer"}`}
          // Borda sempre: no tema escuro, um fundo marinho some no cartão sem ela.
          style={{ background: cor ?? "transparent", borderColor: "var(--border)", borderStyle: cor ? "solid" : "dashed" }}
          title={desabilitada ? undefined : "Abrir o seletor de cor"}
        >
          {!cor && <Plus className="h-4 w-4" style={{ color: "var(--text-muted)" }} />}
          <input
            type="color"
            value={cor ?? "#888888"}
            disabled={desabilitada}
            onChange={(e) => aoEscolher(e.target.value)}
            aria-label={`Escolher a cor: ${nome}`}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
          />
        </label>
        <input
          type="text"
          value={rascunho ?? (cor ?? "").toUpperCase()}
          disabled={desabilitada}
          placeholder="#RRGGBB"
          spellCheck={false}
          autoComplete="off"
          maxLength={9}
          aria-label={`Código da cor: ${nome}`}
          aria-invalid={Boolean(erro)}
          aria-describedby={erro ? idDoErro : undefined}
          onChange={(e) => aoDigitar(e.target.value)}
          onBlur={aoConfirmarHex}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              aoConfirmarHex();
            }
          }}
          className="h-9 min-w-0 flex-1 rounded-md border px-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-60"
          style={{ background: "var(--bg-card)", borderColor: erro ? "#f87171" : "var(--border)", color: "var(--text-primary)" }}
        />
      </div>
      {erro && (
        <p id={idDoErro} className="text-[11px] leading-snug text-red-400">
          {erro}
        </p>
      )}

      {!desabilitada && (atalhos.length > 0 || outras.length > 0 || temContaGotas) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {temContaGotas && (
            <button
              type="button"
              onClick={aoPegarDaTela}
              aria-label={`Pegar da tela a cor: ${nome}`}
              title="Pegar uma cor da tela (do seu logo, por exemplo)"
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-orange-500 hover:text-orange-500"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              <Pipette className="h-3 w-3" /> Pegar da tela
            </button>
          )}
          {atalhos.map((a) => (
            <button
              key={a.cor}
              type="button"
              onClick={() => aoEscolher(a.cor)}
              aria-pressed={cor === a.cor}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors hover:border-orange-500"
              style={{ borderColor: cor === a.cor ? "var(--accent-orange)" : "var(--border)", color: "var(--text-muted)" }}
            >
              <span className="h-2.5 w-2.5 rounded-full border" style={{ background: a.cor, borderColor: "var(--border)" }} />
              {a.nome}
            </button>
          ))}
          {outras.length > 0 && (
            <label className="relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              <ArrowLeftRight className="h-3 w-3" />
              <span>Trocar com</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) aoTrocarCom(e.target.value);
                }}
                aria-label={`Trocar ${nome} de lugar com outra cor`}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              >
                <option value="">Trocar com...</option>
                {outras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                    {o.cor ? ` (${o.cor.toUpperCase()})` : " (vazia)"}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
