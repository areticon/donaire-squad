"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import toast from "react-hot-toast";
import { Check, Loader2, X, LayoutTemplate, Palette, Sparkles, AlertTriangle, ArrowLeft } from "lucide-react";
import { avisoDaTroca, fraseDaAprovacao, type OQueMudou } from "@/lib/modelos-de-arte/espera-da-identidade";
import { cn } from "@/lib/utils";
import {
  LETRAS,
  ROTULO_DO_PAPEL,
  checarContraste,
  opcoesDoPapel,
  type ChecagemDeContraste,
  type LetraId,
  type PapeisEscolhidos,
  type PapelDaCor,
} from "@/lib/modelos-de-arte/identidade";
import {
  MODELOS_DE_ARTE,
  agruparPorUso,
  ROTULO_DO_FORMATO,
  TAMANHO_DO_FORMATO,
  modeloPorId,
  type FormatoDoModelo,
  type ModeloDeArte,
} from "@/lib/modelos-de-arte/catalogo";
import { desenharModelo, type CoresDoDesenho } from "@/lib/modelos-de-arte/desenho";
import { contraste } from "@/lib/media/papeis-da-paleta";
import { FONTES, URL_DAS_FONTES } from "@/lib/modelos-de-arte/fontes";
import { textosDeExemplo } from "@/lib/modelos-de-arte/textos-de-exemplo";
import { FOTOS_DA_IDENTIDADE, tratamentoDasFotos, type FotosDaIdentidade, type TratamentoDaFoto } from "@/lib/modelos-de-arte/tratamento";

/**
 * O BOOK DE MODELOS NA TELA (03/10/2026).
 *
 * Pedido do Bruno: "o que gera rejeição é o cliente não saber o que vem e vir
 * uma surpresa; escolher antes é o mais inteligente". Cada modelo aparece JÁ na
 * marca do cliente (as cores efetivas, o logo e o nome dele), com um texto de
 * exemplo do nicho e uma foto de exemplo no lugar da foto. O desenho é
 * o mesmo que compõe a arte de verdade no servidor (lib/modelos-de-arte/desenho.tsx),
 * então a prévia é instantânea, de graça, e a arte sai parecida com ela.
 *
 * A escolha (um ou mais) grava no projeto a cada toque e vale para as próximas
 * artes; muda-se aqui mesmo, no Criar, na campanha ou em Configurações.
 *
 * AS FOTOS (05/10): cada modelo com foto ganha uma foto DIFERENTE, de banco
 * gratuito e curado (lib/modelos-de-arte/fotos-do-book.ts, servidas pela rota),
 * primeiro as do setor do cliente e depois a reserva variada, alternando
 * pessoas, ambientes, produtos, comida, arquitetura e plantas. O cartão usa a
 * versão leve; a ficha, a grande. O "Você na frente do título" usa a foto real
 * do cliente já recortada ou uma pessoa de banco recortada, nunca silhueta.
 * As cores são as da paleta do projeto (marca.cores, da identidade visual).
 *
 * A IDENTIDADE APROVADA (05/10, lib/modelos-de-arte/identidade.ts): a queixa
 * do Bruno foi arte gerada antes de ele aprovar estilo, letra e cores, com
 * fundo laranja e texto vinho sem contraste. Agora, abaixo do book, o cliente
 * escolhe a LETRA (quatro), os PAPÉIS das cores da paleta (fundo, título,
 * destaque; a hierarquia da marca vem preenchida), vê a prévia ao vivo com o
 * texto dele nos modelos escolhidos, lê a checagem de contraste (4,5:1 para o
 * título) e aperta "Aprovar e gerar". Sem isso a esteira não gasta com arte.
 *
 * 06/10, O BOOK ORGANIZADO: a marca (letra, cores, fotos, aprovação) vem no
 * INÍCIO da página; depois o book por uso (lib/modelos-de-arte/catalogo.ts,
 * USOS_DOS_MODELOS), cada modelo UMA vez, já nas cores da marca, com o nome,
 * o para quê, o selo de escolhido e a contagem por grupo e no topo. A segunda
 * vitrine (prévia ao vivo dos escolhidos) saiu: o texto do cliente entra nos
 * próprios cartões. As cores vêm da paleta salva em Configurações (fonte
 * única, lib/modelos-de-arte/identidade.ts).
 */

interface MarcaDaGaleria {
  nome: string;
  cores: CoresDoDesenho;
  logoUrl: string | null;
  setor: string;
  setorNome: string;
  arroba?: string;
}

/** Uma foto de prévia, nas duas versões (ver lib/modelos-de-arte/fotos-do-book.ts). */
interface FotoDaPrevia {
  p: string;
  g: string;
  tipo: string;
}

/** A pessoa recortada da prévia dos modelos com recorte. */
interface PessoaDaPrevia {
  fundo: string;
  recorte: string;
  origem: "cliente" | "banco";
  rotulo?: string;
}

/**
 * O que a prévia precisa além da marca: a foto de cada modelo, a pessoa do
 * cliente (quando ele tem foto recortada; tem prioridade) e as pessoas de banco
 * sorteadas para o projeto (uma por modelo com recorte, sem repetir na tela).
 */
interface MidiaDaGaleria {
  fotos: FotoDaPrevia[];
  pessoa: PessoaDaPrevia | null;
  pessoas: PessoaDaPrevia[];
}

/** Os modelos com foto, na ordem do catálogo: a posição de cada um escolhe a foto dele. */
const POSICAO_DA_FOTO = new Map(
  MODELOS_DE_ARTE.filter((m) => m.foto !== "nenhuma" && m.foto !== "recorte").map((m, i) => [m.id, i] as const)
);

/** Os modelos com pessoa recortada, na ordem do catálogo: a posição escolhe a pessoa de banco. */
const POSICAO_DA_PESSOA = new Map(MODELOS_DE_ARTE.filter((m) => m.foto === "recorte").map((m, i) => [m.id, i] as const));

/** A pessoa do modelo: a do cliente quando existe; senão a de banco da posição do modelo (05/10). */
function pessoaDoModelo(modelo: ModeloDeArte, midia: MidiaDaGaleria): PessoaDaPrevia | null {
  if (modelo.foto !== "recorte") return null;
  if (midia.pessoa) return midia.pessoa;
  if (!midia.pessoas.length) return null;
  return midia.pessoas[(POSICAO_DA_PESSOA.get(modelo.id) ?? 0) % midia.pessoas.length];
}

/** A foto do modelo: uma diferente para cada modelo; sem lista, a foto antiga do setor. */
function fotoDoModelo(modelo: ModeloDeArte, midia: MidiaDaGaleria, setor: string, grande: boolean): string | null {
  if (modelo.foto === "nenhuma" || modelo.foto === "recorte") return null;
  const i = POSICAO_DA_FOTO.get(modelo.id) ?? 0;
  const f = midia.fotos.length ? midia.fotos[i % midia.fotos.length] : null;
  return f ? (grande ? f.g : f.p) : `/modelos-de-arte/fotos/${setor}.jpg`;
}

/** As fontes do book entram uma vez na página. */
function useFontesDoBook() {
  useEffect(() => {
    if (document.getElementById("fontes-do-book")) return;
    const l = document.createElement("link");
    l.id = "fontes-do-book";
    l.rel = "stylesheet";
    l.href = URL_DAS_FONTES;
    document.head.appendChild(l);
  }, []);
}

/** A proporção do logo, medida no navegador (o desenho precisa dela). */
function useProporcaoDoLogo(url: string | null | undefined): number | null {
  const [p, setP] = useState<number | null>(null);
  useEffect(() => {
    if (!url) return;
    const img = new Image();
    img.onload = () => setP(img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1);
    img.src = url;
  }, [url]);
  return url ? p : null;
}

/** A largura de um elemento, para escalar a prévia de 1080 px até o cartão. */
function useLargura<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** O formato em que a galeria mostra o modelo: o primeiro que ele atende. */
function formatoDeVitrine(m: ModeloDeArte): FormatoDoModelo {
  return m.formatos.includes("post") ? "post" : m.formatos.includes("carrossel") ? "carrossel" : m.formatos[0];
}

/** A prévia de um modelo, desenhada em 1080 px e reduzida para caber na caixa. */
export function PreviaDoModelo({
  modelo,
  formato,
  marca,
  midia,
  grande = false,
  logoProporcao,
  caixa,
  letra,
  titulo,
  tratamento,
}: {
  modelo: ModeloDeArte;
  formato: FormatoDoModelo;
  marca: MarcaDaGaleria;
  midia: MidiaDaGaleria;
  /** Na ficha, a foto em 1280 px; no cartão, a leve. */
  grande?: boolean;
  logoProporcao: number | null;
  /** A caixa onde a prévia cabe inteira (largura e altura em px). */
  caixa: { largura: number; altura: number };
  /** A letra escolhida (05/10); sem ela, a do modelo. */
  letra?: LetraId | null;
  /** O título do cliente no lugar do exemplo (a prévia ao vivo). */
  titulo?: string;
  /** As fotos tratadas (05/10): preto e branco ou nas cores da marca. */
  tratamento?: TratamentoDaFoto | null;
}) {
  const { largura: W, altura: H } = TAMANHO_DO_FORMATO[formato];
  const escala = Math.min(caixa.largura / W, caixa.altura / H);
  const pessoa = pessoaDoModelo(modelo, midia);
  const desenho = useMemo(
    () =>
      desenharModelo({
        modelo,
        textos: titulo?.trim() ? { ...textosDeExemplo(modelo, marca.setor), titulo: titulo.trim() } : textosDeExemplo(modelo, marca.setor),
        cores: marca.cores,
        letra: letra ?? null,
        largura: W,
        altura: H,
        // Modelos com recorte: a pessoa (a do cliente ou a de banco sorteada
        // para este modelo) na frente do título, sobre o fundo dela desfocado.
        foto: modelo.foto === "recorte" ? (pessoa?.fundo ?? null) : fotoDoModelo(modelo, midia, marca.setor, grande),
        fundoDesfocado: modelo.foto === "recorte" ? (pessoa?.fundo ?? null) : null,
        recorte: modelo.foto === "recorte" ? (pessoa?.recorte ?? null) : null,
        logo: marca.logoUrl && logoProporcao ? marca.logoUrl : null,
        logoProporcao,
        marca: marca.nome,
        arroba: marca.arroba,
        pagina: formato === "carrossel" ? { i: 0, total: 5 } : null,
        tratamento: tratamento ?? null,
      }),
    [modelo, formato, marca, midia, pessoa, grande, logoProporcao, W, H, letra, titulo, tratamento]
  );
  if (!caixa.largura) return null;
  // O MODELO POR PROMPT (05/10, lib/modelos-de-arte/prompts-vox.ts): a prévia
  // é um exemplo gerado uma vez pelo modelo de imagem (`previaGerada`); até
  // ela existir, o desenho em código com o selo que avisa o que vem.
  const porPrompt = Boolean(modelo.prompt);
  return (
    <div style={{ width: W * escala, height: H * escala, overflow: "hidden", position: "relative", borderRadius: 6, boxShadow: "0 1px 6px rgba(0,0,0,0.18)" }}>
      {porPrompt && modelo.previaGerada ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={modelo.previaGerada} alt="" style={{ width: W * escala, height: H * escala, objectFit: "cover", display: "block" }} />
      ) : (
        <div style={{ width: W, height: H, transform: `scale(${escala})`, transformOrigin: "top left", position: "absolute", left: 0, top: 0 }}>{desenho}</div>
      )}
      {porPrompt && !modelo.previaGerada && (
        <span
          className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold leading-tight"
          style={{ background: "rgba(0,0,0,0.72)", color: "#ffd166", maxWidth: "92%" }}
        >
          Exemplo gerado pelo modelo de imagem ao escolher
        </span>
      )}
    </div>
  );
}

function CartaoDoModelo({
  modelo,
  marca,
  midia,
  logoProporcao,
  escolhido,
  podeMudar,
  aoAlternar,
  aoAbrir,
  letra,
  titulo,
  tratamento,
}: {
  modelo: ModeloDeArte;
  marca: MarcaDaGaleria;
  midia: MidiaDaGaleria;
  logoProporcao: number | null;
  escolhido: boolean;
  podeMudar: boolean;
  aoAlternar: () => void;
  aoAbrir: () => void;
  letra: LetraId;
  /** O título do cliente (a prévia com o texto dele vale para o book inteiro, 06/10). */
  titulo?: string;
  tratamento?: TratamentoDaFoto | null;
}) {
  const [ref, w] = useLargura<HTMLDivElement>();
  return (
    <div
      data-modelo-do-book={modelo.id}
      data-escolhido={escolhido ? "sim" : "nao"}
      className={cn("group flex flex-col overflow-hidden rounded-xl border text-left transition", escolhido ? "ring-2 ring-orange-500" : "hover:border-orange-500/50")}
      style={{ borderColor: escolhido ? "var(--brand)" : "var(--border)", background: "var(--bg-surface)" }}
    >
      <button type="button" onClick={aoAbrir} className="relative block w-full" aria-label={`Ver o modelo ${modelo.nome}`}>
        <div ref={ref} className="flex aspect-[4/5] w-full items-center justify-center" style={{ background: "var(--bg-elevated)" }}>
          <PreviaDoModelo modelo={modelo} formato={formatoDeVitrine(modelo)} marca={marca} midia={midia} logoProporcao={logoProporcao} letra={letra} titulo={titulo} tratamento={tratamento} caixa={{ largura: w * 0.92, altura: (w * 5) / 4 * 0.92 }} />
        </div>
        {escolhido && (
          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-orange-500 text-white shadow">
            <Check className="h-4 w-4" />
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="text-sm font-semibold leading-tight" style={{ color: "var(--text-primary)" }}>
          {modelo.nome}
        </p>
        <p className="line-clamp-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {modelo.paraQuem}
        </p>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5 pt-1">
          <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {modelo.formatos.map((f) => ROTULO_DO_FORMATO[f]).join(" · ")}
          </span>
          <button
            type="button"
            disabled={!podeMudar}
            onClick={aoAlternar}
            aria-pressed={escolhido}
            className={cn(
              "rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50",
              escolhido ? "bg-orange-500 text-white" : "border hover:border-orange-500"
            )}
            style={escolhido ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {escolhido ? (
              <span className="flex items-center gap-1">
                <Check className="h-3.5 w-3.5" /> Escolhido
              </span>
            ) : (
              "Escolher"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A ficha do modelo, com a prévia grande e os formatos. */
function FichaDoModelo({
  modelo,
  marca,
  midia,
  logoProporcao,
  escolhido,
  podeMudar,
  aoAlternar,
  aoFechar,
  letra,
}: {
  modelo: ModeloDeArte;
  marca: MarcaDaGaleria;
  midia: MidiaDaGaleria;
  logoProporcao: number | null;
  escolhido: boolean;
  podeMudar: boolean;
  aoAlternar: () => void;
  aoFechar: () => void;
  letra: LetraId;
}) {
  const [formato, setFormato] = useState<FormatoDoModelo>(formatoDeVitrine(modelo));
  const [ref, w] = useLargura<HTMLDivElement>();
  const linhas: Array<[string, string]> = [
    ["A quem serve", modelo.paraQuem],
    ["Estrutura", modelo.estrutura],
    ["Tipografia", `${FONTES[modelo.tipografia.titulo].rotulo} no título, ${FONTES[modelo.tipografia.texto].rotulo} no texto${modelo.tipografia.caixaAlta ? ", em caixa alta" : ""}; a letra que você escolher (${LETRAS[letra].nome}) entra por cima`],
    ["Cor", modelo.cor],
    ["Foto", modelo.fotoOnde],
    ["Regras do texto", modelo.regrasDeTexto],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={aoFechar} role="dialog" aria-modal="true" aria-label={modelo.nome}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-y-auto rounded-t-2xl border sm:rounded-2xl md:flex-row"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div ref={ref} className="flex items-center justify-center p-4 md:w-1/2" style={{ background: "var(--bg-elevated)" }}>
          <PreviaDoModelo modelo={modelo} formato={formato} marca={marca} midia={midia} grande logoProporcao={logoProporcao} letra={letra} caixa={{ largura: w - 32, altura: Math.min(560, typeof window !== "undefined" ? window.innerHeight * 0.55 : 560) }} />
        </div>
        <div className="flex flex-col gap-3 p-5 md:w-1/2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-500">{modelo.categoria}</p>
              <h3 className="text-lg font-bold leading-tight" style={{ color: "var(--text-primary)" }}>
                {modelo.nome}
              </h3>
            </div>
            <button type="button" onClick={aoFechar} className="rounded-lg p-1.5 hover:bg-[var(--bg-elevated)]" aria-label="Fechar">
              <X className="h-5 w-5" style={{ color: "var(--text-muted)" }} />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {modelo.formatos.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFormato(f)}
                className={cn("rounded-lg px-2.5 py-1 text-xs font-medium", formato === f ? "bg-orange-500 text-white" : "border")}
                style={formato === f ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {ROTULO_DO_FORMATO[f]}
              </button>
            ))}
          </div>
          <dl className="space-y-2">
            {linhas.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  {k}
                </dt>
                <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {v}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {modelo.foto === "recorte"
              ? midia.pessoa
                ? "Prévia com a sua foto da biblioteca de materiais; na arte entra a foto que combinar com o post."
                : "Prévia com uma pessoa de banco de imagem; na sua arte entra a SUA foto da biblioteca de materiais, recortada."
              : `Texto e foto de exemplo do seu nicho (${marca.setorNome}); na sua arte entram o texto do post e uma foto feita para ele. Números do exemplo são ilustrativos.`}
          </p>
          <button
            type="button"
            disabled={!podeMudar}
            onClick={aoAlternar}
            className={cn("mt-1 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50", escolhido ? "border" : "bg-orange-500 text-white")}
            style={escolhido ? { borderColor: "var(--border)", color: "var(--text-primary)" } : undefined}
          >
            {escolhido ? "Tirar dos meus modelos" : "Usar este modelo nas minhas artes"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** O estado da identidade, como a rota devolve. */
interface IdentidadeDaTela {
  letra: LetraId;
  papeis: PapeisEscolhidos;
  /** As fotos: naturais, preto e branco ou nas cores da marca (05/10). */
  fotos: FotosDaIdentidade;
  paleta: string[];
  aprovada: boolean;
  aprovadaEm: string | null;
  /** Quantas artes de campanha ficaram esperando a aprovação. */
  aguardando: number;
  /** Quantas artes o "Aprovar e gerar" está desenhando agora (05/10). */
  gerando?: number;
}

/**
 * A CAIXA DE CONFIRMAÇÃO depois de "Aprovar e gerar" (05/10, noite). O
 * Bruno clicou e o botão ficou girando minutos com "Gerando..."; ele não
 * sabia se tinha dado certo nem para onde ir. A aprovação agora responde na
 * hora, e esta caixa confirma e manda de volta ao quadro, onde a arte cai.
 */
function ConfirmacaoDaAprovacao({ projectId, frase, aoFicar, compacta }: { projectId: string; frase: string; aoFicar: () => void; compacta: boolean }) {
  return (
    <div role="status" className="rounded-lg border p-3" style={{ borderColor: "rgba(34,197,94,0.5)", background: "rgba(34,197,94,0.08)" }} data-confirmacao-da-aprovacao>
      <p className={cn("flex items-start gap-2 font-semibold", compacta ? "text-xs" : "text-sm")} style={{ color: "var(--text-primary)" }}>
        <Check className="mt-[2px] h-4 w-4 shrink-0 text-green-500" />
        <span>{frase}</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-2 pl-6">
        <Link href={`/projects/${projectId}/live`} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao quadro
        </Link>
        <button type="button" onClick={aoFicar} className="rounded-lg border px-3 py-1.5 text-xs font-medium" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          Ficar aqui
        </button>
      </div>
    </div>
  );
}

/** Uma bolinha de cor escolhível, com o anel quando é a escolhida. */
function Bolinha({ cor, escolhida, aoEscolher, rotulo, desabilitada }: { cor: string; escolhida: boolean; aoEscolher: () => void; rotulo: string; desabilitada: boolean }) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      disabled={desabilitada}
      aria-label={rotulo}
      aria-pressed={escolhida}
      title={cor}
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition disabled:opacity-50", escolhida ? "ring-2 ring-orange-500 ring-offset-2" : "hover:scale-105")}
      style={{ background: cor, borderColor: "var(--border)", ["--tw-ring-offset-color" as string]: "var(--bg-card)" }}
    >
      {escolhida && <Check className="h-4 w-4" style={{ color: contraste(cor, "#141414") > contraste(cor, "#ffffff") ? "#141414" : "#ffffff" }} />}
    </button>
  );
}

/**
 * A IDENTIDADE DO CLIENTE (05/10): letra, papéis das cores, o texto dele e a
 * checagem de contraste, com o "Aprovar e gerar". Desde 06/10 fica no INÍCIO
 * da página, antes do book, e não desenha uma segunda vitrine: o texto do
 * cliente entra nos próprios cartões do book.
 */
function IdentidadeDoCliente({
  identidade,
  escolha,
  podeMudar,
  estado,
  aprovando,
  aoMudarLetra,
  aoMudarPapel,
  aoMudarFotos,
  aoAprovar,
  compacta,
  confirmacao,
  aoFecharConfirmacao,
  projectId,
  titulo,
  aoMudarTitulo,
  aoVerEscolhidos,
}: {
  identidade: IdentidadeDaTela;
  escolha: string[];
  podeMudar: boolean;
  estado: string;
  aprovando: boolean;
  aoMudarLetra: (l: LetraId) => void;
  aoMudarPapel: (papel: PapelDaCor, cor: string) => void;
  aoMudarFotos: (f: FotosDaIdentidade) => void;
  aoAprovar: () => void;
  compacta: boolean;
  /** A confirmação depois de aprovar (05/10), até o cliente escolher ficar ou voltar ao quadro. */
  confirmacao?: string | null;
  aoFecharConfirmacao?: () => void;
  projectId: string;
  /** O título do cliente: entra em todos os modelos do book logo abaixo (06/10). */
  titulo: string;
  aoMudarTitulo: (t: string) => void;
  /** Mostra só os escolhidos no book. */
  aoVerEscolhidos: () => void;
}) {
  const checagens = useMemo(() => checarContraste(identidade.papeis, identidade.paleta), [identidade.papeis, identidade.paleta]);
  const tituloReprovado = checagens.some((c) => c.papel === "titulo" && !c.ok);
  // Os escolhidos, só pelo nome: a prévia de cada um já está no book abaixo,
  // nas cores da marca; repetir as imagens aqui era o "book duas vezes" (06/10).
  const escolhidos = escolha.map((id) => modeloPorId(id)).filter((m): m is ModeloDeArte => Boolean(m));
  const opcoesDe = (papel: PapelDaCor) => opcoesDoPapel(papel, identidade.paleta);
  // Fotos (06/10, cores da marca só nos detalhes): naturais ou preto e branco.
  // Tingir a foto na cor da marca só aparece para quem já tinha escolhido.
  const opcoesDeFotos = (Object.keys(FOTOS_DA_IDENTIDADE) as FotosDaIdentidade[]).filter((id) => id !== "marca" || identidade.fotos === "marca");
  const podeAprovar = podeMudar && escolha.length > 0 && !tituloReprovado && !aprovando;

  return (
    <section className="space-y-3 rounded-xl border p-3 sm:p-4" style={{ borderColor: identidade.aprovada ? "var(--brand)" : "var(--border)", background: "var(--bg-surface)" }} aria-labelledby="identidade-do-cliente">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 id="identidade-do-cliente" className={cn("flex items-center gap-2 font-semibold", compacta ? "text-xs" : "text-base")} style={{ color: "var(--text-primary)" }}>
            <Palette className={cn("text-orange-500", compacta ? "h-3.5 w-3.5" : "h-4 w-4")} />
            Sua identidade: letra e cores
          </h3>
          <p className={cn(compacta ? "text-[10px]" : "text-xs", "mt-0.5")} style={{ color: "var(--text-muted)" }}>
            As cores são as da sua paleta em Configurações, na aba Marca. Diga onde cada uma entra e escolha a letra: o book abaixo muda na hora. Aprove, e só depois os agentes gastam com arte.
          </p>
        </div>
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            data-selo-da-identidade={identidade.aprovada ? "aprovada" : "aguardando"}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={identidade.aprovada ? { background: "rgba(34,197,94,0.15)", color: "#16a34a" } : { background: "rgba(249,115,22,0.15)", color: "#ea580c" }}
          >
            {identidade.aprovada ? "Aprovada" : "Aguardando a sua aprovação"}
          </span>
          {/* As artes que esperam a aprovação (05/10): o número aparece aqui e no botão. */}
          {identidade.aguardando > 0 && (
            <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(251,191,36,0.18)", color: "#b45309" }} title="Artes de campanha que ficaram sem desenho até você aprovar a identidade">
              {identidade.aguardando === 1 ? "1 arte esperando" : `${identidade.aguardando} artes esperando`}
            </span>
          )}
          {(identidade.gerando ?? 0) > 0 && (
            <span className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: "rgba(192,132,252,0.18)", color: "#7e22ce" }}>
              <Loader2 className="h-3 w-3 animate-spin" /> {identidade.gerando === 1 ? "1 arte sendo gerada" : `${identidade.gerando} artes sendo geradas`}
            </span>
          )}
        </span>
      </div>

      {confirmacao && aoFecharConfirmacao && <ConfirmacaoDaAprovacao projectId={projectId} frase={confirmacao} aoFicar={aoFecharConfirmacao} compacta={compacta} />}

      {/* A letra: quatro opções, cada uma escrita na própria fonte. */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Letra
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(LETRAS) as LetraId[]).map((id) => {
            const l = LETRAS[id];
            const f = FONTES[l.titulo];
            const ativa = identidade.letra === id;
            return (
              <button
                key={id}
                type="button"
                disabled={!podeMudar}
                onClick={() => aoMudarLetra(id)}
                aria-pressed={ativa}
                className={cn("rounded-lg border p-2.5 text-left transition disabled:opacity-50", ativa ? "border-orange-500 bg-orange-500/10" : "hover:border-orange-500/50")}
                style={{ borderColor: ativa ? undefined : "var(--border)" }}
              >
                <span className="block truncate text-lg leading-tight" style={{ fontFamily: f.familia, fontWeight: f.peso, color: "var(--text-primary)", textTransform: l.caixaAlta ? "uppercase" : "none" }}>
                  {l.nome}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug" style={{ color: "var(--text-muted)" }}>
                  {l.descricao}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Os papéis: fundo, título e destaque, cada um a partir da paleta. */}
      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Onde cada cor entra
        </p>
        {(["fundo", "titulo", "destaque"] as PapelDaCor[]).map((papel) => (
          <div key={papel} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-medium" style={{ color: "var(--text-primary)" }}>
              {ROTULO_DO_PAPEL[papel]}
            </span>
            <div className="flex flex-wrap gap-1.5">
              {opcoesDe(papel).map((cor) => (
                <Bolinha key={`${papel}-${cor}`} cor={cor} escolhida={identidade.papeis[papel] === cor} aoEscolher={() => aoMudarPapel(papel, cor)} rotulo={`${ROTULO_DO_PAPEL[papel]} em ${cor}`} desabilitada={!podeMudar} />
              ))}
            </div>
          </div>
        ))}
        {/* A checagem de contraste: o mínimo WCAG para texto é 4,5:1. */}
        <ul className="space-y-1">
          {checagens.map((c: ChecagemDeContraste) => (
            <li key={c.papel} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" style={{ color: c.ok ? "var(--text-muted)" : "#ea580c" }}>
              {c.ok ? <Check className="h-3.5 w-3.5 shrink-0 text-green-500" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
              <span>{c.mensagem}</span>
              {!c.ok && c.sugestao && podeMudar && (
                <button type="button" onClick={() => aoMudarPapel(c.papel, c.sugestao!)} className="rounded border px-1.5 py-0.5 font-semibold" style={{ borderColor: "currentColor" }}>
                  Usar {c.sugestao}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* As fotos (05/10): naturais, preto e branco ou nas cores da marca, com a prévia abaixo. */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Fotos
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Como as fotos entram nas artes">
          {opcoesDeFotos.map((id) => {
            const f = FOTOS_DA_IDENTIDADE[id];
            const ativa = identidade.fotos === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={ativa}
                disabled={!podeMudar}
                onClick={() => aoMudarFotos(id)}
                title={f.descricao}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50", ativa ? "border-orange-500 bg-orange-500/10" : "hover:border-orange-500/50")}
                style={{ borderColor: ativa ? undefined : "var(--border)", color: "var(--text-primary)" }}
              >
                {f.nome}
              </button>
            );
          })}
        </div>
        <p className="mt-1 text-[10px]" style={{ color: "var(--text-muted)" }}>
          {FOTOS_DA_IDENTIDADE[identidade.fotos].descricao}
        </p>
      </div>

      {/* O texto do cliente vale para o book inteiro (06/10): sem segunda vitrine aqui. */}
      <div>
        <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }} htmlFor="titulo-da-previa">
          Prévia com o seu texto
        </label>
        <input
          id="titulo-da-previa"
          value={titulo}
          onChange={(e) => aoMudarTitulo(e.target.value.slice(0, 90))}
          placeholder="Escreva um título seu para ver em todos os modelos abaixo (opcional)"
          className="w-full rounded-lg border px-3 py-2 text-sm"
          style={{ background: "var(--bg-input, var(--bg-elevated))", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
      </div>

      {/* Os escolhidos, pelo nome, com a contagem. */}
      <div data-escolhidos-da-identidade>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
          Seus modelos ({escolhidos.length})
        </p>
        {escolhidos.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {escolhidos.map((m) => (
              <span key={m.id} className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium" style={{ borderColor: "var(--brand)", color: "var(--text-primary)" }}>
                <Check className="h-3 w-3 text-orange-500" /> {m.nome}
              </span>
            ))}
            <button type="button" onClick={aoVerEscolhidos} className="px-1 text-[11px] font-semibold text-orange-500 hover:underline">
              Ver só os escolhidos
            </button>
          </div>
        ) : (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Nenhum ainda. Escolha no book abaixo os modelos que combinam com você.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!podeAprovar}
          onClick={aoAprovar}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {aprovando ? <Loader2 className="h-4 w-4 animate-spin" /> : identidade.aprovada && identidade.aguardando === 0 ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {identidade.aguardando > 0 ? `Aprovar e gerar (${identidade.aguardando} ${identidade.aguardando === 1 ? "arte esperando" : "artes esperando"})` : identidade.aprovada ? "Identidade aprovada" : "Aprovar e gerar"}
        </button>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {!podeMudar
            ? "Só o dono da conta aprova a identidade."
            : estado
              ? estado
              : escolha.length === 0
                ? "Falta escolher um modelo."
                : tituloReprovado
                  ? "Troque a cor do título ou do fundo antes de aprovar."
                  : identidade.aprovada
                    ? `Aprovada${identidade.aprovadaEm ? ` em ${new Date(identidade.aprovadaEm).toLocaleDateString("pt-BR")}` : ""}. Mudou algo? Aprove de novo.`
                    : "Nada é gerado nem cobrado antes de você aprovar."}
        </span>
      </div>
    </section>
  );
}

export function GaleriaDeModelos({
  projectId,
  variante = "completa",
  aoMudarAprovacao,
}: {
  projectId: string;
  /** "compacta": dentro da janela da campanha, com a lista rolando em menos altura. */
  variante?: "completa" | "compacta";
  /** Avisa a tela de fora (a janela da campanha) se a identidade está aprovada. */
  aoMudarAprovacao?: (aprovada: boolean) => void;
}) {
  useFontesDoBook();
  const [dados, setDados] = useState<{ marca: MarcaDaGaleria; podeMudar: boolean; midia: MidiaDaGaleria } | null>(null);
  const [escolha, setEscolha] = useState<string[]>([]);
  const [identidade, setIdentidade] = useState<IdentidadeDaTela | null>(null);
  // O filtro do book (06/10): "todos", "escolhidos" ou o id de um uso.
  const [filtro, setFiltro] = useState<string>("todos");
  const [titulo, setTitulo] = useState("");
  const tituloDoBook = useDeferredValue(titulo);
  const [aberto, setAberto] = useState<string | null>(null);
  const [estado, setEstado] = useState<"" | "guardando" | "guardado" | "erro">("");
  const [estadoDaIdentidade, setEstadoDaIdentidade] = useState<string>("");
  const [aprovando, setAprovando] = useState(false);
  // A confirmação depois de aprovar (05/10): a frase da caixa, até o cliente fechá-la.
  const [confirmacao, setConfirmacao] = useState<string | null>(null);
  const salvo = useRef<string>("");
  const identidadeSalva = useRef<string>("");
  const logoProporcao = useProporcaoDoLogo(dados?.marca.logoUrl);

  const aplicarIdentidade = useCallback(
    (i: IdentidadeDaTela | null | undefined) => {
      if (!i) return;
      setIdentidade(i);
      identidadeSalva.current = JSON.stringify({ letra: i.letra, papeis: i.papeis, fotos: i.fotos });
      aoMudarAprovacao?.(i.aprovada);
    },
    [aoMudarAprovacao]
  );

  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/modelos-de-arte`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo || !d) return;
        setDados({ marca: d.marca, podeMudar: Boolean(d.podeMudar), midia: { fotos: Array.isArray(d.fotos) ? d.fotos : [], pessoa: d.pessoa ?? null, pessoas: Array.isArray(d.pessoas) ? d.pessoas : [] } });
        setEscolha(d.escolha ?? []);
        salvo.current = JSON.stringify(d.escolha ?? []);
        aplicarIdentidade(d.identidade);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [projectId, aplicarIdentidade]);

  // Grava a cada mudança, com um pequeno atraso: vários toques viram um PUT.
  useEffect(() => {
    const atual = JSON.stringify(escolha);
    if (!dados || atual === salvo.current) return;
    const t = setTimeout(async () => {
      setEstado("guardando");
      try {
        const r = await fetch(`/api/projects/${projectId}/modelos-de-arte`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: escolha }) });
        if (!r.ok) throw new Error();
        salvo.current = atual;
        setEstado("guardado");
        // Mudar os modelos derruba a aprovação: a rota devolve o estado novo.
        aplicarIdentidade(((await r.json()) as { identidade?: IdentidadeDaTela }).identidade);
      } catch {
        setEstado("erro");
      }
    }, 400);
    return () => clearTimeout(t);
  }, [escolha, dados, projectId, aplicarIdentidade]);

  // A letra, os papéis e as fotos também gravam a cada mudança (e derrubam a aprovação).
  useEffect(() => {
    if (!dados || !identidade) return;
    const atual = JSON.stringify({ letra: identidade.letra, papeis: identidade.papeis, fotos: identidade.fotos });
    if (atual === identidadeSalva.current) return;
    const t = setTimeout(async () => {
      setEstadoDaIdentidade("Guardando...");
      try {
        const r = await fetch(`/api/projects/${projectId}/modelos-de-arte`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ letra: identidade.letra, papeis: identidade.papeis, fotos: identidade.fotos }) });
        if (!r.ok) throw new Error();
        aplicarIdentidade(((await r.json()) as { identidade?: IdentidadeDaTela }).identidade);
        setEstadoDaIdentidade("");
      } catch {
        setEstadoDaIdentidade("Não consegui guardar; tente de novo.");
      }
    }, 500);
    return () => clearTimeout(t);
  }, [identidade, dados, projectId, aplicarIdentidade]);

  /**
   * O AVISO NA HORA (05/10, noite): trocar modelo, letra, cores ou fotos
   * derruba a aprovação, e a tela diz isso no ato (toast e selo "Aguardando"),
   * com quantas artes estão esperando. Só avisa quando a troca muda algo que
   * o cliente precisa saber: a identidade estava aprovada, ou há arte esperando.
   */
  const avisarTroca = useCallback(
    (oQue: OQueMudou) => {
      const i = identidade;
      if (!i || (!i.aprovada && i.aguardando === 0)) return;
      toast(avisoDaTroca(oQue, i.aguardando, i.aprovada), { id: "identidade-mudou", duration: 5000 });
      setConfirmacao(null);
    },
    [identidade]
  );
  const alternar = useCallback(
    (id: string) => {
      avisarTroca("modelo");
      setEscolha((e) => (e.includes(id) ? e.filter((x) => x !== id) : [...e, id]));
      setIdentidade((i) => (i ? { ...i, aprovada: false } : i));
    },
    [avisarTroca]
  );
  const mudarLetra = useCallback(
    (letra: LetraId) => {
      avisarTroca("letra");
      setIdentidade((i) => (i ? { ...i, letra, aprovada: false } : i));
    },
    [avisarTroca]
  );
  const mudarPapel = useCallback(
    (papel: PapelDaCor, cor: string) => {
      avisarTroca("cores");
      setIdentidade((i) => (i ? { ...i, papeis: { ...i.papeis, [papel]: cor }, aprovada: false } : i));
    },
    [avisarTroca]
  );
  const mudarFotos = useCallback(
    (fotos: FotosDaIdentidade) => {
      avisarTroca("fotos");
      setIdentidade((i) => (i ? { ...i, fotos, aprovada: false } : i));
    },
    [avisarTroca]
  );

  /**
   * Aprova com o que está na tela e, se havia arte esperando, PEDE a geração.
   * A resposta vem na hora (05/10, noite): o POST só marca o que vai ser
   * desenhado e responde; a arte é feita depois, cai no quadro, e a caixa de
   * confirmação diz isso e oferece "Voltar ao quadro". Antes o clique
   * esperava a imagem sair, e o botão girava minutos sem dizer nada.
   */
  const aprovar = useCallback(async () => {
    if (!identidade) return;
    setAprovando(true);
    setEstadoDaIdentidade("Aprovando...");
    try {
      const r = await fetch(`/api/projects/${projectId}/modelos-de-arte`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: escolha, letra: identidade.letra, papeis: identidade.papeis, fotos: identidade.fotos, aprovar: true }),
      });
      const d = (await r.json()) as { identidade?: IdentidadeDaTela; error?: string };
      if (!r.ok) throw new Error(d.error || "Não consegui aprovar.");
      aplicarIdentidade(d.identidade);
      let iniciadas = 0;
      if ((d.identidade?.aguardando ?? 0) > 0) {
        const g = await fetch(`/api/projects/${projectId}/modelos-de-arte`, { method: "POST" });
        const gd = (await g.json()) as { frase?: string; error?: string; iniciadas?: number; identidade?: IdentidadeDaTela };
        if (!g.ok) throw new Error(gd.error || "Não consegui pedir as artes que esperavam.");
        aplicarIdentidade(gd.identidade);
        iniciadas = gd.iniciadas ?? 0;
      }
      const frase = fraseDaAprovacao(iniciadas);
      setConfirmacao(frase);
      setEstadoDaIdentidade("");
      toast.success(frase, { id: "identidade-aprovada" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não consegui aprovar.";
      setEstadoDaIdentidade(msg);
      toast.error(msg, { id: "identidade-aprovada" });
    } finally {
      setAprovando(false);
    }
  }, [identidade, escolha, projectId, aplicarIdentidade]);

  if (!dados) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando o book de modelos
      </div>
    );
  }

  const { podeMudar, midia } = dados;
  // As prévias já saem nos papéis escolhidos (fundo, título, destaque) e na letra.
  const marca: MarcaDaGaleria = identidade ? { ...dados.marca, cores: { ...dados.marca.cores, papeis: identidade.papeis } } : dados.marca;
  const letra: LetraId = identidade?.letra ?? "moderna";
  const tratamento = identidade ? tratamentoDasFotos(identidade.fotos) : null;
  // O BOOK POR USO (06/10): cada modelo uma vez, no grupo do que ele serve.
  const grupos = agruparPorUso(MODELOS_DE_ARTE);
  const gruposNaTela =
    filtro === "todos"
      ? grupos
      : filtro === "escolhidos"
        ? agruparPorUso(MODELOS_DE_ARTE.filter((m) => escolha.includes(m.id)))
        : grupos.filter((g) => g.uso.id === filtro);
  const modeloAberto = aberto ? modeloPorId(aberto) : undefined;
  const compacta = variante === "compacta";
  const avisoDoGuardar = !podeMudar ? "Só o dono da conta muda os modelos." : estado === "guardando" ? "Guardando..." : estado === "guardado" ? "Guardado no projeto." : estado === "erro" ? "Não consegui guardar; tente de novo." : "";
  const papeis = [marca.cores.papeis?.fundo ?? marca.cores.escuro, marca.cores.papeis?.titulo ?? marca.cores.claro, marca.cores.papeis?.destaque ?? marca.cores.acento];

  return (
    <section className="space-y-4" aria-labelledby="book-de-modelos">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="book-de-modelos" className={cn("flex items-center gap-2 font-semibold", compacta ? "text-xs" : "text-lg")} style={{ color: "var(--text-primary)" }}>
            <LayoutTemplate className={cn("text-orange-500", compacta ? "h-3.5 w-3.5" : "h-5 w-5")} />
            Book de modelos: sua arte vai ficar assim
          </h2>
          <p className={cn(compacta ? "text-[10px]" : "text-sm", "mt-0.5")} style={{ color: "var(--text-muted)" }}>
            Primeiro a sua marca (letra e cores); depois cada modelo, uma vez só, já nas suas cores, separado pelo que ele serve. Escolha um ou mais: as próximas artes saem nesses moldes.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" title="As cores nos papéis escolhidos: fundo, título e destaque" data-cores-do-book>
            {papeis.map((c, i) => (
              <span key={`${c}-${i}`} className="h-5 w-5 rounded-full border" style={{ background: c, borderColor: "var(--border)" }} />
            ))}
          </span>
          <span
            data-contagem-de-escolhidos={escolha.length}
            className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={escolha.length ? { background: "rgba(249,115,22,0.15)", color: "#ea580c" } : { background: "var(--bg-elevated)", color: "var(--text-muted)" }}
          >
            {escolha.length === 1 ? "1 escolhido" : `${escolha.length} escolhidos`}
          </span>
        </div>
      </div>

      {/* 1. A MARCA NO INÍCIO (06/10): letra, cores, fotos e aprovação, antes do book. */}
      {identidade && (
        <IdentidadeDoCliente
          identidade={identidade}
          escolha={escolha}
          podeMudar={podeMudar}
          estado={estadoDaIdentidade}
          aprovando={aprovando}
          aoMudarLetra={mudarLetra}
          aoMudarPapel={mudarPapel}
          aoMudarFotos={mudarFotos}
          aoAprovar={aprovar}
          compacta={compacta}
          confirmacao={confirmacao}
          aoFecharConfirmacao={() => setConfirmacao(null)}
          projectId={projectId}
          titulo={titulo}
          aoMudarTitulo={setTitulo}
          aoVerEscolhidos={() => setFiltro("escolhidos")}
        />
      )}

      {/* 2. O BOOK, por uso, cada modelo uma vez. */}
      <div className="space-y-3">
        <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="Filtrar o book">
          {[
            { id: "todos", nome: "Todos", n: MODELOS_DE_ARTE.length },
            { id: "escolhidos", nome: "Escolhidos", n: escolha.length },
            ...grupos.map((g) => ({ id: g.uso.id, nome: g.uso.nome, n: g.modelos.length })),
          ].map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={filtro === c.id}
              onClick={() => setFiltro(c.id)}
              className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors", filtro === c.id ? "bg-orange-500 text-white" : "border hover:border-orange-500/50")}
              style={filtro === c.id ? undefined : { borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              {c.nome} ({c.n})
            </button>
          ))}
        </div>
        {avisoDoGuardar && (
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            {avisoDoGuardar}
          </p>
        )}

        {gruposNaTela.length === 0 ? (
          <p className="rounded-lg border px-3 py-6 text-center text-sm" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
            Nenhum modelo escolhido ainda. Toque em &quot;Escolher&quot; nos que combinam com a sua marca.
          </p>
        ) : (
          <div className={cn("space-y-5", compacta && "max-h-[440px] overflow-y-auto pr-1")}>
            {gruposNaTela.map(({ uso, modelos }) => {
              const escolhidosNoGrupo = modelos.filter((m) => escolha.includes(m.id)).length;
              return (
                <section key={uso.id} aria-labelledby={`uso-${uso.id}`} data-uso-do-book={uso.id}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b pb-1.5" style={{ borderColor: "var(--border)" }}>
                    <div className="min-w-0">
                      <h3 id={`uso-${uso.id}`} className={cn("font-semibold", compacta ? "text-xs" : "text-sm")} style={{ color: "var(--text-primary)" }}>
                        {uso.nome}
                      </h3>
                      <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {uso.serve}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium" style={{ color: escolhidosNoGrupo ? "#ea580c" : "var(--text-muted)" }}>
                      {escolhidosNoGrupo} de {modelos.length} escolhidos
                    </span>
                  </div>
                  <div className={cn("grid gap-3", compacta ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4")}>
                    {modelos.map((m) => (
                      <CartaoDoModelo
                        key={m.id}
                        modelo={m}
                        marca={marca}
                        midia={midia}
                        logoProporcao={logoProporcao}
                        escolhido={escolha.includes(m.id)}
                        podeMudar={podeMudar}
                        aoAlternar={() => alternar(m.id)}
                        aoAbrir={() => setAberto(m.id)}
                        letra={letra}
                        titulo={tituloDoBook}
                        tratamento={tratamento}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {escolha.length === 0 && (
          <p className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
            Sem modelo escolhido, nenhuma arte é gerada: escolha ao menos um e aprove a identidade acima.
          </p>
        )}
      </div>

      {modeloAberto && (
        <FichaDoModelo
          modelo={modeloAberto}
          marca={marca}
          midia={midia}
          logoProporcao={logoProporcao}
          escolhido={escolha.includes(modeloAberto.id)}
          podeMudar={podeMudar}
          aoAlternar={() => alternar(modeloAberto.id)}
          aoFechar={() => setAberto(null)}
          letra={letra}
        />
      )}
    </section>
  );
}
