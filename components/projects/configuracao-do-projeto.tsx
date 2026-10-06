"use client";

import { useEffect, useState } from "react";
import { Check, Info, Music, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SocialConnectPanel } from "@/components/social/social-connect-panel";
import { AvisoSoODono } from "@/components/equipe/aviso-so-o-dono";
import { LinksDoCliente } from "@/components/projects/links-do-cliente";
import { RedesNasConfiguracoes } from "@/components/projects/redes-do-cliente";
import { GaleriaDeModelos } from "@/components/modelos-de-arte/galeria-de-modelos";
import { GaleriaDaBiblioteca } from "@/components/biblioteca-de-design/galeria-da-biblioteca";
import { MODELOS_DE_ARTE } from "@/lib/modelos-de-arte/catalogo";

/** Os ids do book: a biblioteca na mesma aba não repete esses modelos (06/10). */
const IDS_DO_BOOK = MODELOS_DE_ARTE.map((m) => m.id);
import { BibliotecaDeMateriais } from "@/components/materiais/biblioteca-de-materiais";
import { GemeoNasConfiguracoes } from "@/components/gemeo/gemeo-nas-configuracoes";
import type { CadastroDoGemeo } from "@/lib/media/gemeo";
import { faltaUmPasso, situacaoDoGemeo } from "@/lib/media/gemeo-situacao";
import {
  creditosDaSemana,
  diaComFormato,
  DIAS_DA_SEMANA,
  FORMATOS,
  normalizarSemana,
  planoParaGravar,
  type ChaveDoDia,
  type FormatoDoDia,
  type SemanaDoVideo,
} from "@/lib/media/semana-do-video";
import toast from "react-hot-toast";

/**
 * Configuração do projeto, uma seção por assunto e um Salvar em cada.
 *
 * Por que isto existe, corrigindo a premissa do card 401: estes campos SEMPRE
 * puderam ser mudados, pela aba "Editar setup", que reabre o assistente em modo
 * de edição. O defeito real é que o assistente só grava ao AVANÇAR de etapa e
 * só confirma na última, então trocar uma palavra do tom de voz obrigava a
 * percorrer as seis telas de novo. Aqui cada seção salva sozinha, e o
 * assistente continua existindo para quem está começando do zero.
 */

type Projeto = {
  id: string;
  name: string;
  niche: string | null;
  targetAudience: string | null;
  voice: string | null;
  colorPalette: string | null;
  videoStyle: string | null;
  capaEstilo: string | null;
  videoMusicName: string | null;
  videoTerms: string | null;
  videoSemana: unknown;
  /** Onde moram os links do cliente (03/10): `config.linksDoCliente`. */
  config?: unknown;
};

const ABAS = [
  { id: "redes", rotulo: "Redes sociais" },
  { id: "marca", rotulo: "Marca e voz" },
  { id: "modelos", rotulo: "Modelos de arte" },
  { id: "materiais", rotulo: "Seus materiais" },
  { id: "video", rotulo: "Vídeo e semana" },
  { id: "links", rotulo: "Seus links" },
  // 03/10: o gêmeo tinha uma porta só, dentro de Criar; quem precisava
  // confirmar no gerador não achava onde ("devo fingir que vou gerar outro
  // conteúdo?"). Aqui ele tem endereço fixo: ?aba=gemeo.
  { id: "gemeo", rotulo: "Gêmeo digital" },
] as const;

const TONS = [
  "Autoritário e técnico",
  "Provocativo e direto",
  "Educativo e acessível",
  "Inspirador e humano",
];

const ESTILOS_DE_VIDEO = [
  { id: "dramatico", nome: "Dramático", dica: "Deixa a pausa respirar. Para história pessoal, onde o silêncio é conteúdo." },
  { id: "acelerado", nome: "Acelerado", dica: "Corta rente, sem respiro. É o padrão, e o que mais segura atenção em Shorts." },
  { id: "serio", nome: "Sério e técnico", dica: "Legenda sem destaque colorido, que aqui só distrairia." },
  { id: "animado", nome: "Animado e leve", dica: "Ritmo alto e cor forte na legenda. Para conteúdo leve." },
];

const ESTILOS_DE_CAPA = [
  { id: "impacto", nome: "Impacto", dica: "Seu rosto grande, frase curta em cima, contraste alto." },
  { id: "limpo", nome: "Limpo", dica: "Pouco texto, respiro, cara de canal editorial." },
  { id: "manchete", nome: "Manchete", dica: "A frase manda, o rosto entra menor. Para conteúdo de dado e notícia." },
];

/** Cartão de escolha única, usado pelo estilo de edição e pelo de capa. */
function Opcao({
  nome,
  dica,
  escolhido,
  onClick,
}: {
  nome: string;
  dica: string;
  escolhido: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors"
      style={{
        background: "var(--bg-input)",
        borderColor: escolhido ? "var(--accent-orange)" : "var(--border)",
      }}
    >
      {escolhido && (
        <Check className="absolute right-3 top-3 h-4 w-4 text-orange-500" strokeWidth={3} />
      )}
      <span
        className="text-sm font-bold"
        style={{ color: escolhido ? "var(--accent-orange)" : "var(--text-primary)" }}
      >
        {nome}
      </span>
      <span className="text-xs leading-[1.45]" style={{ color: "var(--text-muted)" }}>
        {dica}
      </span>
    </button>
  );
}

function Secao({
  titulo,
  descricao,
  acao,
  children,
}: {
  titulo: string;
  descricao: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="flex flex-col gap-5 rounded-xl border p-6"
      style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            {titulo}
          </h2>
          <p className="mt-1 text-[13px]" style={{ color: "var(--text-muted)" }}>
            {descricao}
          </p>
        </div>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function ConfiguracaoDoProjeto({
  projeto,
  contasSociais,
  somenteLeitura = null,
  gemeo = null,
}: {
  projeto: Projeto;
  /** O cadastro do gêmeo como a tela vê (`cadastroParaTela`), para a aba "Gêmeo digital". */
  gemeo?: { cadastro: CadastroDoGemeo | null } | null;
  // O painel de redes tem tipo próprio e vem inteiro do servidor.
  contasSociais: Parameters<typeof SocialConnectPanel>[0]["initialAccounts"];
  /**
   * MEMBRO DA EQUIPE (01/10, acabamento): tudo à vista e nada clicável, com o
   * aviso de quem muda. As abas continuam trocando, porque ler a voz e as redes
   * da marca ajuda o membro a produzir; só o conteúdo de cada aba fica inerte
   * (`inert` desliga clique, foco e teclado, inclusive nos links de Conectar).
   */
  somenteLeitura?: { dono: string } | null;
}) {
  const [aba, setAba] = useState<string>("redes");
  // A aba pelo endereço (?aba=links), para o link "cadastre seus links" cair
  // direto nela (03/10).
  useEffect(() => {
    const pedida = new URLSearchParams(window.location.search).get("aba");
    if (pedida && ABAS.some((a) => a.id === pedida)) setAba(pedida);
  }, []);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [preenchendo, setPreenchendo] = useState<string | null>(null);

  const [form, setForm] = useState({
    niche: projeto.niche ?? "",
    targetAudience: projeto.targetAudience ?? "",
    voice: projeto.voice ?? "",
    colorPalette: projeto.colorPalette ?? "#F97316,#1e1f22,#dbdee1",
    videoStyle: projeto.videoStyle ?? "acelerado",
    capaEstilo: projeto.capaEstilo ?? "impacto",
    videoTerms: projeto.videoTerms ?? "",
  });
  // O plano de 30/09 guarda formato E redes por dia; aqui só se troca o
  // formato, e as redes do dia seguem as sugeridas do formato novo (a escolha
  // fina das redes fica no passo 4 da Nova campanha).
  const [semana, setSemana] = useState<SemanaDoVideo>(() => normalizarSemana(projeto.videoSemana));

  const set = (campo: string, valor: string) => setForm((p) => ({ ...p, [campo]: valor }));

  /** Salva só os campos desta seção. O resto do projeto não é tocado. */
  async function salvar(secao: string, campos: Record<string, unknown>) {
    setSalvando(secao);
    try {
      const res = await fetch(`/api/projects/${projeto.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campos),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "erro");
      toast.success("Salvo.");
    } catch {
      toast.error("Não consegui salvar. Tente de novo.");
    } finally {
      setSalvando(null);
    }
  }

  /**
   * O mesmo assistente do setup, agora por seção.
   *
   * `/api/ai/assist` devolve TEXTO, não campos estruturados, então o JSON é
   * pedido no prompt e validado aqui. É a mesma defesa do assistente do setup,
   * escrita depois de o modelo desobedecer o formato em 18/08: extrai o
   * primeiro bloco entre chaves e confere campo a campo, em vez de confiar.
   */
  async function preencherComIA(secao: string, campos: string[], instrucao: string) {
    setPreenchendo(secao);
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:
            `Preencha os campos do projeto com uma proposta concreta e específica, pronta para uso. ` +
            `Responda SOMENTE um objeto JSON válido, sem markdown e sem texto fora dele, com as chaves: ${campos.join(", ")}. ` +
            `Nas strings, não use quebras de linha cruas; se precisar de parágrafos, use \\n. ` +
            `${instrucao} Escreva em português do Brasil.`,
          context: form,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");
      const bloco = String(data.reply ?? "").match(/\{[\s\S]*\}/)?.[0];
      if (!bloco) throw new Error("a IA respondeu fora do formato");
      const obj = JSON.parse(bloco) as Record<string, unknown>;
      const aplicados = campos.filter(
        (c) => typeof obj[c] === "string" && String(obj[c]).trim()
      );
      if (!aplicados.length) throw new Error("a IA não devolveu estes campos");
      setForm((p) => ({
        ...p,
        ...Object.fromEntries(aplicados.map((c) => [c, String(obj[c]).trim()])),
      }));
      toast.success("Preenchido. Confira antes de salvar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui preencher.");
    } finally {
      setPreenchendo(null);
    }
  }

  const cores = form.colorPalette.split(",").map((c) => c.trim()).filter(Boolean);

  const pedeConfirmacao = faltaUmPasso(situacaoDoGemeo(gemeo?.cadastro ?? null));

  // Custo em créditos da semana escolhida, além do texto.
  const custoDaSemana = creditosDaSemana({ ...semana, inicio: null });

  return (
    <div className="flex flex-col gap-6">
      {somenteLeitura && <AvisoSoODono dono={somenteLeitura.dono} oQue="as configurações deste projeto" />}
      {/* Em grade 2x2 no celular (03/10): em fila, a quarta aba ficava fora da
          tela e a terceira cortada no meio da palavra ("Vídeo e s"). */}
      <div className="grid grid-cols-2 gap-1 border-b sm:flex sm:overflow-x-auto" style={{ borderColor: "var(--border)" }}>
        {ABAS.map((a) => {
          const atual = a.id === aba;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className="shrink-0 px-3.5 py-2.5 text-sm transition-colors"
              style={
                atual
                  ? {
                      color: "var(--accent-orange)",
                      fontWeight: 600,
                      borderBottom: "2px solid var(--accent-orange)",
                      marginBottom: -1,
                    }
                  : { color: "var(--text-muted)", fontWeight: 500 }
              }
            >
              {a.rotulo}
              {a.id === "gemeo" && pedeConfirmacao && (
                <span className="ml-1.5 inline-block h-2 w-2 rounded-full bg-orange-500 align-middle" aria-label="falta um passo" />
              )}
            </button>
          );
        })}
      </div>

      <div
        className="flex flex-col gap-6"
        inert={Boolean(somenteLeitura)}
        aria-disabled={somenteLeitura ? true : undefined}
        style={somenteLeitura ? { opacity: 0.8 } : undefined}
      >
      {aba === "redes" && (
        <SocialConnectPanel project={projeto} initialAccounts={contasSociais} />
      )}

      {/* O BOOK DE MODELOS (03/10): mudar de modelo depois mora aqui. */}
      {aba === "modelos" && (
        <>
          {/* O BOOK primeiro (06/10): a marca no início e cada modelo uma vez, nas cores da marca. */}
          <section className="rounded-xl border p-4 sm:p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <GaleriaDeModelos projectId={projeto.id} />
          </section>
          {/* A BIBLIOTECA DE DESIGN (06/10) abaixo, sem os modelos que o book já mostrou: estilos de vídeo e designs escritos pelos clientes. */}
          <section className="rounded-xl border p-4 sm:p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
            <GaleriaDaBiblioteca projectId={projeto.id} idsDoBook={IDS_DO_BOOK} titulo="Mais designs: estilos de vídeo e pedidos dos clientes" />
          </section>
        </>
      )}

      {aba === "gemeo" && <GemeoNasConfiguracoes projectId={projeto.id} cadastro={gemeo?.cadastro ?? null} />}

      {/* SEUS MATERIAIS (03/10): a mesma biblioteca do Criar. */}
      {aba === "materiais" && (
        <section className="rounded-xl border p-6" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <BibliotecaDeMateriais projectId={projeto.id} />
        </section>
      )}

      {aba === "links" && (
        <Secao
          titulo="Seus links"
          descricao="As suas redes e as suas páginas (site, loja, produtos, afiliados, WhatsApp e agenda). O squad coloca o link certo onde a rede aceita link, com uma chamada para a ação."
        >
          <div className="flex flex-col gap-4">
            {/* As redes (06/10, fonte única): os mesmos campos do topo do setup, gravando no mesmo lugar. */}
            <RedesNasConfiguracoes projetoId={projeto.id} podeEditar={!somenteLeitura} />
            <p className="-mb-2 text-sm font-medium text-[var(--text-primary)]">Suas páginas</p>
            <LinksDoCliente projetoId={projeto.id} config={projeto.config} />
          </div>
        </Secao>
      )}

      {aba === "marca" && (
        <>
          <Secao
            titulo="Sobre o que você fala"
            descricao="O squad usa isto para escolher o ângulo de cada post e para decidir se um trecho da sua gravação vale um corte."
            acao={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                loading={preenchendo === "nicho"}
                onClick={() =>
                  preencherComIA(
                    "nicho",
                    ["niche", "targetAudience"],
                    "Refine o nicho e o público-alvo deste projeto, em português do Brasil, de forma específica e sem jargão de marketing."
                  )
                }
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                Preencher com IA
              </Button>
            }
          >
            <Input
              label="Nicho"
              value={form.niche}
              onChange={(e) => set("niche", e.target.value)}
              placeholder="Ex: Energia renovável e regulação do setor elétrico"
            />
            <Textarea
              label="Público-alvo"
              value={form.targetAudience}
              onChange={(e) => set("targetAudience", e.target.value)}
              placeholder="Quem você quer atingir? Cargo, setor, dores..."
              className="min-h-[80px]"
            />
            <div>
              <Button
                loading={salvando === "nicho"}
                onClick={() =>
                  salvar("nicho", { niche: form.niche, targetAudience: form.targetAudience })
                }
              >
                Salvar
              </Button>
            </div>
          </Secao>

          <Secao
            titulo="Como você soa"
            descricao="Tom, palavras proibidas e exemplos de frase. É o que separa um texto seu de um texto de robô."
            acao={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                loading={preenchendo === "voz"}
                onClick={() =>
                  preencherComIA(
                    "voz",
                    ["voice"],
                    "O campo voice deve ser um guia de voz completo: tom, palavras proibidas, exemplos de frases, o que fazer e o que nunca fazer."
                  )
                }
              >
                <Sparkles className="h-3.5 w-3.5 text-orange-400" />
                Preencher com IA
              </Button>
            }
          >
            <Textarea
              label="Tom de voz e estilo"
              value={form.voice}
              onChange={(e) => set("voice", e.target.value)}
              placeholder="Ex: Direto, sem rodeio, de igual para igual com quem decide. Número sempre com fonte..."
              className="min-h-[150px]"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {TONS.map((tom) => (
                <button
                  key={tom}
                  type="button"
                  onClick={() =>
                    set(
                      "voice",
                      `Tom: ${tom}. Linguagem clara, dados como argumento, sem jargão excessivo.`
                    )
                  }
                  className="rounded-lg border p-3 text-left text-sm transition-colors hover:border-orange-500/30 hover:text-orange-400"
                  style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-muted)" }}
                >
                  {tom}
                </button>
              ))}
            </div>
            <div>
              <Button loading={salvando === "voz"} onClick={() => salvar("voz", { voice: form.voice })}>
                Salvar
              </Button>
            </div>
          </Secao>

          <Secao titulo="Suas cores" descricao="Usadas nas imagens, nos carrosséis e na legenda dos cortes.">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <Input
                  label="Paleta, separada por vírgula"
                  value={form.colorPalette}
                  onChange={(e) => set("colorPalette", e.target.value)}
                  className="font-mono"
                  placeholder="#F97316,#1e1f22,#dbdee1"
                />
              </div>
              <div className="flex gap-2">
                {cores.slice(0, 5).map((cor, i) => (
                  <div
                    key={`${cor}-${i}`}
                    className="h-10 w-10 rounded-lg border"
                    style={{ background: cor, borderColor: "var(--border)" }}
                    title={cor}
                  />
                ))}
              </div>
            </div>
            <div>
              <Button
                loading={salvando === "cores"}
                onClick={() => salvar("cores", { colorPalette: form.colorPalette })}
              >
                Salvar
              </Button>
            </div>
          </Secao>

          <div
            className="flex items-center gap-3 rounded-xl border p-4"
            style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}
          >
            <Info className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--text-muted)" }} />
            <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
              Prefere rever tudo do começo, com o assistente perguntando etapa por etapa?{" "}
              <a href={`/projects/${projeto.id}/setup`} className="font-semibold text-orange-400">
                Refazer o setup guiado
              </a>
            </p>
          </div>
        </>
      )}

      {aba === "video" && (
        <>
          <Secao
            titulo="Como seus cortes são editados"
            descricao="Vale para todo vídeo deste projeto. Canal que muda de estilo a cada vídeo não constrói reconhecimento."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ESTILOS_DE_VIDEO.map((e) => (
                <Opcao
                  key={e.id}
                  nome={e.nome}
                  dica={e.dica}
                  escolhido={form.videoStyle === e.id}
                  onClick={() => set("videoStyle", e.id)}
                />
              ))}
            </div>
            <div>
              <Button
                loading={salvando === "estilo"}
                onClick={() => salvar("estilo", { videoStyle: form.videoStyle })}
              >
                Salvar
              </Button>
            </div>
          </Secao>

          <Secao
            titulo="A capa do vídeo completo"
            descricao="Capa igual em todo vídeo é o que faz seu canal ser reconhecido na listagem do YouTube."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {ESTILOS_DE_CAPA.map((e) => (
                <Opcao
                  key={e.id}
                  nome={e.nome}
                  dica={e.dica}
                  escolhido={form.capaEstilo === e.id}
                  onClick={() => set("capaEstilo", e.id)}
                />
              ))}
            </div>
            <div>
              <Button
                loading={salvando === "capa"}
                onClick={() => salvar("capa", { capaEstilo: form.capaEstilo })}
              >
                Salvar
              </Button>
            </div>
          </Secao>

          <Secao
            titulo="Trilha e palavras da sua área"
            descricao="A trilha é sua: a Demandou é ferramenta de edição, como o CapCut, e nunca distribui música."
          >
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                Trilha dos cortes
              </label>
              <div
                className="flex h-14 items-center justify-between gap-4 rounded-md border px-4"
                style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Music className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--text-muted)" }} />
                  <span className="truncate text-sm" style={{ color: "var(--text-primary)" }}>
                    {projeto.videoMusicName ?? "Nenhuma trilha enviada"}
                  </span>
                </div>
                <a
                  href={`/projects/${projeto.id}/live`}
                  className="shrink-0 text-[13px] font-medium text-orange-400"
                >
                  {projeto.videoMusicName ? "Trocar" : "Enviar"}
                </a>
              </div>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                O envio do arquivo acontece no Gestor de Conteúdo, junto da gravação.
              </span>
            </div>

            <Textarea
              label="Termos do seu negócio"
              value={form.videoTerms}
              onChange={(e) => set("videoTerms", e.target.value)}
              placeholder="Escreva alguns termos da sua área, nomes da sua empresa e dos seus produtos, separados por vírgula"
              className="min-h-[72px]"
            />
            <span className="-mt-3 text-xs" style={{ color: "var(--text-muted)" }}>
              É o que impede a legenda de sair com o nome errado.
            </span>

            <div>
              <Button
                loading={salvando === "termos"}
                onClick={() => salvar("termos", { videoTerms: form.videoTerms })}
              >
                Salvar
              </Button>
            </div>
          </Secao>

          <Secao
            titulo="Sua semana padrão"
            descricao="O que sai em cada dia a partir de uma gravação. O vídeo completo vai para o YouTube no primeiro dia, e os cortes nos dias de Vídeo curto. As redes de cada dia você escolhe na Nova campanha."
          >
            {/* Desde 30/09 a segunda também é um dia de escolha: a campanha
                começa no dia da gravação, e não mais na segunda do vídeo. */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4 lg:grid-cols-7">
              {DIAS_DA_SEMANA.map(({ dia, nome }) => {
                const chave = String(dia) as ChaveDoDia;
                const doDia = semana.dias[chave] ?? null;
                return (
                  <div key={dia} className="flex flex-col gap-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                      {nome}
                    </span>
                    <select
                      value={doDia?.formato ?? ""}
                      onChange={(e) => {
                        const formato = e.target.value as FormatoDoDia | "";
                        setSemana((p) => ({
                          ...p,
                          dias: {
                            ...p.dias,
                            // O mesmo formato mantém as redes que já estavam marcadas.
                            [chave]: formato === "" ? null : formato === doDia?.formato ? doDia : diaComFormato(formato),
                          },
                        }));
                      }}
                      className="h-10 rounded-md border px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-orange-500"
                      style={{
                        background: "var(--bg-input)",
                        borderColor: "var(--border)",
                        color: "var(--text-primary)",
                      }}
                    >
                      <option value="">Sem post</option>
                      {FORMATOS.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.rotulo}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <div
              className="flex flex-col gap-3 rounded-[10px] p-4 sm:flex-row sm:items-center sm:justify-between"
              style={{ background: "var(--bg-elevated)" }}
            >
              <span className="text-[13px]" style={{ color: "var(--text-muted)" }}>
                Esta semana custa{" "}
                <span className="font-bold" style={{ color: "var(--text-primary)" }}>
                  {custoDaSemana} créditos
                </span>{" "}
                além do texto.
              </span>
              <Button
                className="shrink-0"
                loading={salvando === "semana"}
                onClick={() => salvar("semana", { videoSemana: planoParaGravar(semana) })}
              >
                Salvar
              </Button>
            </div>
          </Secao>
        </>
      )}
      </div>
    </div>
  );
}
