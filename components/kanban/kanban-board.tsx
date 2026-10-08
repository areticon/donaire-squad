"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { LOGO_POR_REDE, type RedeComLogo } from "@/components/social/logos-redes";
import { ConexaoAssistida } from "@/components/social/conexao-assistida";
import { PaginaDeEmpresaLinkedIn } from "@/components/social/pagina-empresa-linkedin";
import { PAGINA_DO_LINKEDIN, type PedidoDeConexao } from "@/lib/social/textos-da-conexao";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandMarkThemed } from "@/components/brand-mark-client";
import toast from "react-hot-toast";
import {
  Lightbulb,
  Mic2,
  Palette,
  Share2,
  Calendar,
  Rocket,
  ChevronRight,
  Bot,
  Loader2,
  Building2,
  UserRound,
  Search,
  ScanSearch,
  GitCompareArrows,
  Images,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoDescartar, Descartavel, useDescarte } from "@/components/ui/descartar";
import { chaveDaDica } from "@/lib/avisos/chaves";
import { StepMarca } from "@/components/kanban/step-marca";
import { StepMateriais } from "@/components/kanban/step-materiais";
import { StepReferencias } from "@/components/kanban/step-referencias";
import { StepPerfilProprio } from "@/components/kanban/step-perfil-proprio";
import { ArrobaDoYouTube } from "@/components/projects/links-no-setup";
import { StepReferenciasDoCliente } from "@/components/kanban/step-referencias-do-cliente";
import { PorqueDoSetup } from "@/components/kanban/porque-do-setup";
import type { CampoDoSetup, RespostaDoPerfilProprio, SetupSugerido } from "@/lib/referencias/tipos-do-perfil-proprio";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  description?: string | null;
  setupStep: number;
  niche?: string | null;
  targetAudience?: string | null;
  voice?: string | null;
  colorPalette?: string | null;
  postFrequency?: string | null;
  timezone?: string;
  status: string;
  // JsonValue do Prisma: pode ser objeto, mas o tipo não garante.
  config?: unknown;
  // A marca (14/09): o que a etapa Marca mostra ja preenchido.
  logoUrl?: string | null;
  brandManualName?: string | null;
  contexts?: Array<{ id: string; type: string; title: string }>;
}

// As redes vêm primeiro, por decisão de produto de 21/08: conectar as contas
// logo na chegada é o que vai permitir à plataforma ler o perfil e
// pré-preencher o resto do assistente, e mesmo antes dessa análise existir,
// pedir a conexão de cara aumenta quantos terminam com rede conectada, sem a
// qual nada publica sozinho.
/**
 * A JORNADA DE ENTRADA (03/10/2026), pedido do Bruno para os vendedores de
 * segunda: o "momento uau" vem PRIMEIRO. A pessoa escreve as redes dela e
 * recebe o relatório do próprio perfil; depois diz até 3 referências e vê o
 * de-para; só então as etapas de sempre, que chegam PREENCHIDAS pelos dois
 * estudos, cada campo com o porquê (components/kanban/porque-do-setup.tsx).
 *
 * As etapas antigas continuam, na ordem que já tinham entre si: Marca antes
 * de Voz (17/09), Voz antes de Ideação (22/08), as regras do Roberto depois
 * da Agenda (02/10). A conexão das contas (OAuth) desceu para perto da
 * ativação: ela serve para PUBLICAR, e ler o perfil não precisa dela.
 *
 * A tela é escolhida pela CHAVE, não pelo número: até aqui os índices eram a
 * única coisa que amarrava a tela à etapa, e mexer em STEPS trocava as telas
 * de lugar em silêncio (o aviso de 17/09).
 *
 * 08/10: a etapa "Fotos e estilo" entra logo depois da Marca (decisão do
 * Bruno: fotos e estilo dos posts "no início da configuração do projeto").
 * `setupStep` é número no banco: quem estava no meio do assistente, da Voz em
 * diante, volta uma etapa (cai nesta, que é nova para ele) e segue.
 */
const STEPS = [
  { id: 0, chave: "perfil", icon: ScanSearch, label: "Seu perfil", color: "text-pink-400" },
  { id: 1, chave: "referencias", icon: GitCompareArrows, label: "Referências", color: "text-pink-400" },
  { id: 2, chave: "marca", icon: Palette, label: "Marca", color: "text-pink-400" },
  { id: 3, chave: "materiais", icon: Images, label: "Fotos e estilo", color: "text-pink-400" },
  { id: 4, chave: "voz", icon: Mic2, label: "Voz & Estilo", color: "text-purple-400" },
  { id: 5, chave: "ideacao", icon: Lightbulb, label: "Ideação", color: "text-yellow-400" },
  { id: 6, chave: "agenda", icon: Calendar, label: "Agenda", color: "text-cyan-400" },
  { id: 7, chave: "regras", icon: Search, label: "Regras", color: "text-pink-400" },
  { id: 8, chave: "redes", icon: Share2, label: "Conectar redes", color: "text-green-400" },
  { id: 9, chave: "ativacao", icon: Rocket, label: "Ativação", color: "text-orange-400" },
] as const;

type ChaveDaEtapa = (typeof STEPS)[number]["chave"];
const indiceDa = (chave: ChaveDaEtapa) => STEPS.findIndex((s) => s.chave === chave);

/**
 * Os campos do setup que cada etapa mostra com o porquê.
 *
 * As cores saíram daqui em 08/10: a sugestão das capas aparece dentro do
 * seletor de cores (components/marca/seletor-de-cores.tsx), com o porquê e
 * "Usar estas", e não preenche mais a etapa sozinha.
 */
const PORQUE_DA_ETAPA: Partial<Record<ChaveDaEtapa, CampoDoSetup[]>> = {
  voz: ["voice"],
  ideacao: ["niche", "targetAudience", "description", "references", "linhaEditorial"],
  agenda: ["postFrequency"],
};

/**
 * Os fusos que a tela oferece, com São Paulo PRIMEIRO e como padrão.
 *
 * A lista é curta de propósito. Todo produto lista UTC e as centenas de fusos
 * da base IANA, e isso é ruído para quem vende no Brasil: a escolha certa está
 * na primeira linha em 99% dos casos. Os quatro fusos brasileiros cobrem o país
 * inteiro; os três últimos existem para o cliente que mora fora.
 *
 * UTC não está na lista, e é deliberado: ninguém publica "em UTC", e oferecer
 * essa opção só cria a chance de alguém escolher e ter post saindo três horas
 * fora sem entender por quê.
 */
const FUSOS: Array<{ id: string; rotulo: string }> = [
  { id: "America/Sao_Paulo", rotulo: "Brasília, São Paulo, Sul e Nordeste (GMT-3)" },
  { id: "America/Manaus", rotulo: "Manaus, Cuiabá, Porto Velho (GMT-4)" },
  { id: "America/Rio_Branco", rotulo: "Rio Branco, Acre (GMT-5)" },
  { id: "America/Noronha", rotulo: "Fernando de Noronha (GMT-2)" },
  { id: "Europe/Lisbon", rotulo: "Lisboa (GMT+0/+1)" },
  { id: "America/New_York", rotulo: "Nova York, Miami (GMT-5/-4)" },
  { id: "Europe/London", rotulo: "Londres (GMT+0/+1)" },
];

interface KanbanBoardProps {
  project: Project;
  editMode?: boolean;
}

export function KanbanBoard({ project, editMode = false }: KanbanBoardProps) {
  const router = useRouter();

  /**
   * A VOLTA DO OAUTH (?step=N) ABRE NA ETAPA CERTA, IGUAL NO SERVIDOR E NO NAVEGADOR.
   *
   * Até 01/10 a etapa inicial vinha de `window.location`, que só existe no
   * navegador: o servidor desenhava a etapa salva no projeto (setupStep) e o
   * navegador, lendo ?step=0, desenhava a etapa 0. Os dois HTMLs diferiam e o
   * React acusava erro de hidratação na volta de toda conexão de rede.
   * `useSearchParams` dá a mesma query nos dois lados (a página é dinâmica,
   * então não precisa de Suspense), e o número é limitado às etapas que
   * existem: "abc" ou "-3" na URL caem na etapa salva.
   */
  const searchParams = useSearchParams();
  const initialStep = (() => {
    const s = Number.parseInt(searchParams?.get("step") ?? "", 10);
    if (Number.isFinite(s) && s >= 0) return Math.min(s, STEPS.length - 1);
    return Math.min(project.setupStep, STEPS.length - 1);
  })();

  const [currentStep, setCurrentStep] = useState(initialStep);
  // O "Entendi" do aviso de projeto ativo fica lembrado por pessoa (07/10);
  // antes voltava a cada visita.
  const avisoDeEdicao = useDescarte(chaveDaDica("edicao-projeto-ativo", project.id));
  const warningDismissed = avisoDeEdicao.descartado;

  // Show success toast when returning from OAuth and clean up URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("linkedin") === "success") {
      toast.success("LinkedIn conectado com sucesso!");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("twitter") === "success") {
      toast.success("X (Twitter) conectado com sucesso!");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReply, setAiReply] = useState("");

  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    niche: project.niche ?? "",
    targetAudience: project.targetAudience ?? "",
    voice: project.voice ?? "",
    // SEM PADRÃO (08/10): até aqui o vazio virava o laranja da Demandou, e o
    // "Próximo" da etapa 0 gravava esse laranja como se fosse escolha. Pela
    // fonte única de 06/10 a paleta salva manda sempre, então o logo e o
    // manual do cliente nunca viravam cor. Vazio quer dizer "não escolheu", e
    // a arte usa o logo, o manual ou o setor (lib/media/identidade-visual.ts).
    colorPalette: project.colorPalette ?? "",
    postFrequency: project.postFrequency ?? "3x por semana",
    timezone: project.timezone ?? "America/Sao_Paulo",
    // Vive dentro de config (Json) para não exigir migration: são os perfis
    // que o cliente quer modelar, e alimentam o pré-preenchimento por IA.
    references: String(
      (typeof project.config === "object" && project.config !== null
        ? (project.config as Record<string, unknown>).references
        : "") ?? ""
    ),
    // A linha editorial do setup (03/10): os pilares, um por linha. Mora no
    // config, como as referências, e entra na campanha "tudo com IA"
    // (lib/referencias/estudo-na-campanha.ts).
    linhaEditorial: String(
      (typeof project.config === "object" && project.config !== null
        ? (project.config as Record<string, unknown>).linhaEditorial
        : "") ?? ""
    ),
  });

  const set = (field: string, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  /**
   * O SETUP SUGERIDO PELOS DOIS ESTUDOS (03/10, lib/referencias/setup-sugerido.ts).
   *
   * Sai ao deixar a etapa Referências e chega nas etapas seguintes. Aplica só
   * em campo VAZIO (ou ainda no valor de fábrica, como a paleta e a
   * frequência padrão): o que a pessoa escreveu manda mais que a sugestão.
   */
  const [setupSugerido, setSetupSugerido] = useState<SetupSugerido | null>(null);
  const [montandoSetup, setMontandoSetup] = useState(false);
  const jaBuscouSetup = useRef(false);
  const DE_FABRICA: Record<string, string> = {
    postFrequency: project.postFrequency ? "" : "3x por semana",
  };
  const aplicarSetup = useCallback((sug: SetupSugerido) => {
    setSetupSugerido(sug);
    setForm((prev) => {
      const prox = { ...prev } as Record<string, string>;
      for (const [campo, valor] of Object.entries(sug.campos)) {
        // As cores das capas não preenchem (08/10): em perfil com foto de
        // pessoa elas são pele, roupa e parede. Viram sugestão no seletor.
        if (campo === "colorPalette") continue;
        if (!valor || !(campo in prox)) continue;
        const atual = String(prox[campo] ?? "").trim();
        if (!atual || atual === DE_FABRICA[campo]) prox[campo] = valor;
      }
      return prox as typeof prev;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const montarSetup = useCallback(
    async (forcar = false) => {
      setMontandoSetup(true);
      try {
        const g = await fetch(`/api/projects/${project.id}/perfil-proprio`).catch(() => null);
        const d = g?.ok ? ((await g.json()) as RespostaDoPerfilProprio) : null;
        if (!d || (!d.relatorio && !d.dePara)) return;
        // Regera só quando há estudo mais novo que a sugestão (cada geração é uma chamada paga).
        const ultimaColeta = Math.max(
          d.relatorio ? new Date(d.relatorio.geradoEm).getTime() : 0,
          ...d.referencias.map((r) => (r.ultimaColeta ? new Date(r.ultimaColeta).getTime() : 0))
        );
        const velho = !d.setup || new Date(d.setup.geradoEm).getTime() < ultimaColeta;
        if (!forcar && d.setup && !velho) {
          aplicarSetup(d.setup);
          return;
        }
        if (!d.podeEditar) return;
        const r = await fetch(`/api/projects/${project.id}/perfil-proprio`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "setup" }),
        }).catch(() => null);
        const j = r?.ok ? ((await r.json()) as { setup?: SetupSugerido }) : null;
        if (j?.setup) aplicarSetup(j.setup);
        else if (d.setup) aplicarSetup(d.setup);
      } finally {
        setMontandoSetup(false);
      }
    },
    [project.id, aplicarSetup]
  );

  /**
   * Os campos preenchidos a partir dos DOCUMENTOS que a pessoa subiu na etapa
   * Marca, e nao adivinhados a partir do formulario vazio.
   *
   * Roda uma vez por sessao do assistente, ao sair da etapa Marca, e SO
   * preenche campo que esta vazio: quem ja escreveu alguma coisa mandou mais
   * que o documento. Sobrescrever texto digitado por texto gerado e a forma
   * mais rapida de fazer alguem desconfiar da ferramenta.
   */
  const [lendoDocumentos, setLendoDocumentos] = useState(false);
  const [veioDoDocumento, setVeioDoDocumento] = useState<string[]>([]);
  const jaLeuDocumentos = useRef(false);

  const preencherComDocumentos = useCallback(async () => {
    if (jaLeuDocumentos.current) return;
    jaLeuDocumentos.current = true;
    setLendoDocumentos(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/sugerir-campos`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.pronto) {
        // "ainda lendo" nao e erro, e nao merece alarme: o documento acabou de
        // subir e a leitura acontece no servidor. Uma nova tentativa fica
        // liberada.
        if (data?.motivo === "lendo") jaLeuDocumentos.current = false;
        // "falhou" merece alarme, e essa distincao nasceu em 18/09. Antes dela,
        // documento ilegivel e documento ainda sendo lido davam a mesma tela
        // silenciosa, e quem subiu um PDF ficava esperando uma leitura que nunca
        // ia acontecer. Ausencia pede paciencia; falha pede acao.
        if (data?.motivo === "falhou") {
          toast.error("Não consegui ler o documento que você subiu. Volte na etapa Marca para ver o motivo.");
        }
        return;
      }
      const campos = (data.campos ?? {}) as Record<string, string>;
      const aplicados: string[] = [];
      setForm((prev) => {
        const proximo = { ...prev } as Record<string, string>;
        for (const [campo, valor] of Object.entries(campos)) {
          const atual = String(proximo[campo] ?? "").trim();
          if (atual.length === 0) {
            proximo[campo] = valor;
            aplicados.push(campo);
          }
        }
        return proximo as typeof prev;
      });
      if (aplicados.length > 0) setVeioDoDocumento(aplicados);
    } catch {
      jaLeuDocumentos.current = false;
    } finally {
      setLendoDocumentos(false);
    }
  }, [project.id]);

  const saveAndNext = useCallback(async () => {
    setSaving(true);
    const nextStep = currentStep + 1;
    // Ao SAIR da etapa Marca, os documentos viram campos. Aqui e nao na
    // entrada da etapa seguinte porque a leitura leva segundos: disparada
    // agora, ela corre enquanto o PATCH salva e a tela troca.
    const chaveAtual = STEPS[currentStep]?.chave;
    if (chaveAtual === "marca") void preencherComDocumentos();
    // Ao SAIR das Referências, o setup é montado a partir dos dois estudos
    // (03/10) e chega preenchido na Marca, na Voz, na Ideação e na Agenda.
    if (chaveAtual === "referencias" && !jaBuscouSetup.current) {
      jaBuscouSetup.current = true;
      void montarSetup();
    }
    // Ao SAIR da Voz, com nicho, público e voz já escritos, o estudo do nicho
    // começa em segundo plano (02/10): leva alguns minutos e assim chega
    // pronto, ou quase, na etapa Referências. Só na criação, não na edição do
    // setup, e só DEPOIS de salvar (a descoberta lê o nicho do banco); se já
    // houver um pedido vivo, a rota recusa sem gastar nada.
    //
    // 03/10: na jornada nova, as referências vêm do CLIENTE (etapa 2). O
    // Roberto só procura sozinho se a pessoa deixar as Referências sem
    // indicar nenhuma, e só na criação.
    let pedirEstudoDoNicho = false;
    if (chaveAtual === "referencias" && !editMode) {
      const g = await fetch(`/api/projects/${project.id}/perfil-proprio`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      pedirEstudoDoNicho = Boolean(g && g.ligado && !(g.referencias ?? []).length);
    }
    try {
      // A paleta NÃO vai no "Próximo" (08/10): o seletor de cores da etapa
      // Marca grava sozinho, com os papéis do book. Mandar o formulário aqui
      // gravava o laranja de fábrica já na etapa 0, ou apagava a escolha
      // feita no seletor com um valor velho.
      const { colorPalette: _paleta, ...semPaleta } = form;
      void _paleta;
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...semPaleta,
          // `references` não é coluna: persiste dentro do config (Json),
          // preservando o que já existir lá.
          config: {
            ...(typeof project.config === "object" && project.config !== null
              ? (project.config as Record<string, unknown>)
              : {}),
            references: form.references,
            linhaEditorial: form.linhaEditorial,
          },
          setupStep: nextStep,
          status: nextStep >= STEPS.length ? "active" : "setup",
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar");
      if (pedirEstudoDoNicho) {
        void fetch(`/api/projects/${project.id}/referencias/analises`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "comecar", tipo: "criacao", origem: "criacao" }),
        }).catch(() => null);
      }

      if (nextStep >= STEPS.length) {
        if (editMode) {
          toast.success("Configurações salvas!");
          router.push(`/projects/${project.id}/posts`);
        } else {
          toast.success("Projeto ativado! Vamos gerar sua primeira campanha.");
          // ?novaCampanha=1 abre direto a escolha de origem (vídeo ou tema),
          // em vez de largar quem acabou de ativar num quadro vazio.
          //
          // Para /live e não para /posts, corrigido em 13/09: /posts é a tela
          // antiga (PostsPanel), que ignora o parâmetro e cujo botão pede o
          // TEMA antes de perguntar se a campanha vem de vídeo ou de tema. O
          // Bruno viu exatamente isso: "o primeiro ponto é escolher o tema,
          // mas está errado, porque depois vai ter um tema por dia". Quem
          // trata o parâmetro é o ContentManager, que mora em /live.
          //
          // 03/10 (jornada de entrada): para a aba Criar, que é a escolha
          // das três portas (subir vídeo, gêmeo ou tudo com IA) já com o
          // projeto treinado pelos dois estudos.
          router.push(`/projects/${project.id}/criar`);
        }
      } else {
        setCurrentStep(nextStep);
      }
    } catch {
      toast.error("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }, [currentStep, form, project.id, router, editMode, preencherComDocumentos, montarSetup]);

  const askAI = useCallback(
    async (message: string) => {
      setAiLoading(true);
      setAiReply("");
      try {
        const res = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message, context: form }),
        });
        const data = await res.json();
        setAiReply(data.reply);
      } catch {
        setAiReply("Erro ao consultar o assistente. Tente novamente.");
      } finally {
        setAiLoading(false);
      }
    },
    [form]
  );

  /**
   * A IA preenche os campos em vez de só sugerir em texto (pedido do Bruno no
   * teste de 21/08: "sugerir e preencher, com opção de pedir ajuste"). Pede um
   * JSON com exatamente as chaves dos campos, aplica o que voltar e deixa a
   * pessoa editar ou pedir refinamento com uma instrução extra.
   */
  const preencherIA = useCallback(
    async (campos: string[], instrucao?: string) => {
      setAiLoading(true);
      setAiReply("");
      try {
        const res = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message:
              `Preencha os campos do projeto com uma proposta concreta e específica, pronta para uso. ` +
              `Responda SOMENTE um objeto JSON válido, sem markdown e sem texto fora dele, com as chaves: ${campos.join(", ")} ` +
              `e opcionalmente "observacao" (uma frase curta explicando as escolhas). ` +
              `Nas strings, não use quebras de linha cruas; se precisar de parágrafos, use \\n. ` +
              (instrucao ? `Leve em conta este pedido do usuário: ${instrucao}. ` : "") +
              `Use o contexto atual do projeto, especialmente as referências e inspirações se houver, e escreva em português.`,
            context: form,
          }),
        });
        const data = await res.json();
        const bruto = String(data.reply ?? "");
        // O modelo desobedece formato de vez em quando (lição da sessão de
        // 18/08): extrai o primeiro bloco {...} e valida em código.
        const bloco = bruto.match(/\{[\s\S]*\}/)?.[0];
        if (!bloco) throw new Error("resposta sem JSON");
        const obj = JSON.parse(bloco) as Record<string, unknown>;
        const aplicados: string[] = [];
        for (const campo of campos) {
          const valor = obj[campo];
          if (typeof valor === "string" && valor.trim()) {
            set(campo, valor.trim());
            aplicados.push(campo);
          }
        }
        if (aplicados.length === 0) throw new Error("JSON sem os campos pedidos");
        setAiReply(
          (typeof obj.observacao === "string" && obj.observacao.trim()) ||
            "Preenchi com uma proposta. Edite à vontade, ou me diga o que considerar e clique em Ajustar."
        );
      } catch {
        setAiReply("Não consegui montar a proposta agora. Tente de novo em instantes.");
      } finally {
        setAiLoading(false);
      }
    },
    [form]
  );

  useEffect(() => {
    if (jaBuscouSetup.current || currentStep <= indiceDa("referencias")) return;
    jaBuscouSetup.current = true;
    void montarSetup();
  }, [currentStep, montarSetup]);

  const chave = STEPS[currentStep]?.chave;
  const camposDoPorque = chave ? PORQUE_DA_ETAPA[chave] : undefined;

  const progress = Math.round(((currentStep + 1) / STEPS.length) * 100);

  return (
    // Projeto em setup toma a tela inteira, sem a sidebar em volta: usuário
    // novo merece foco total no assistente, padrão Neon/Supabase/Vercel
    // (feedback do teste de jornada de 20/08). Em modo edição (projeto ativo),
    // o layout normal da plataforma continua valendo.
    <div
      className={cn(!editMode && "fixed inset-0 z-40 overflow-y-auto")}
      style={!editMode ? { background: "var(--bg-primary)" } : undefined}
    >
      {!editMode && (
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-6 py-3 border-b backdrop-blur-sm"
          style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg-primary) 85%, transparent)" }}
        >
          <div className="flex items-center gap-2">
            <BrandMarkThemed className="h-7 w-7 rounded-md" size={28} />
            <span className="font-bold lowercase text-[var(--text-primary)]">demandou</span>
          </div>
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
          >
            Continuar depois
          </Link>
        </div>
      )}
    <div className="p-4 sm:p-8 max-w-4xl mx-auto overflow-x-hidden">
      {/* Edit mode warning */}
      {editMode && !warningDismissed && (
        // Contraste (04/10, print do Bruno: amarelo sobre bege não se lia).
        <div className="mb-6 p-4 rounded-xl flex flex-wrap items-start gap-3 border" style={{ background: "var(--bg-card)", borderColor: "#d97706" }}>
          <span className="text-lg shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Você está editando um projeto ativo</p>
            <p className="text-xs" style={{ color: "var(--text-secondary, var(--text-primary))" }}>
              Alterações no nicho, tom de voz ou público-alvo podem afetar a consistência editorial dos próximos posts gerados. Edite com cuidado e salve apenas o que for realmente necessário.
            </p>
          </div>
          <BotaoDescartar texto="Entendi" aoDescartar={() => avisoDeEdicao.descartar()} className="border" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }} />
        </div>
      )}

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] mb-1">
          {project.name}
        </h1>
        <p className="text-[var(--text-muted)]">{`Configure seu projeto em ${STEPS.length} etapas`}</p>

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--text-muted)]">
              Etapa {currentStep + 1} de {STEPS.length}
            </span>
            <span className="text-orange-400 font-medium">{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex items-center gap-1 mb-8 overflow-x-auto pb-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <button
              key={step.id}
              onClick={() => i <= currentStep && setCurrentStep(i)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all",
                // Paleta da marca (04/10, pedido do Bruno): feita em azul cheio
                // com letra branca; a atual em branco com borda azul.
                active
                  ? "border-2 border-orange-500 text-orange-500 font-semibold shadow-sm"
                  : done
                  ? "bg-orange-500 border border-orange-500 text-white cursor-pointer hover:bg-orange-600"
                  : "border border-[var(--border)] text-[var(--text-muted)] cursor-not-allowed opacity-50"
              )}
              style={active ? { background: "var(--bg-card, #fff)" } : !done ? { background: "var(--bg-elevated)" } : undefined}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              {step.label}
              {done && <span className="text-white">✓</span>}
            </button>
          );
        })}
      </div>

      {/* Step content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentStep}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
          className="border rounded-2xl p-4 sm:p-8"
          style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
        >
          {/*
            De onde vieram os campos. Sem isto a pessoa chega numa tela cheia de
            texto que ela nao escreveu e nao sabe se pode confiar: dizer que
            saiu do documento DELA e o que transforma preenchimento em revisao.
          */}
          {lendoDocumentos && currentStep >= indiceDa("voz") && (
            <div
              className="mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px]"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Lendo os seus documentos para preencher esta etapa...
            </div>
          )}
          {!lendoDocumentos && veioDoDocumento.length > 0 && currentStep >= indiceDa("voz") && (
            <Descartavel chave={chaveDaDica("veio-do-documento", project.id)}>
              <div
                className="mb-4 flex items-start gap-2 rounded-lg border py-2 pl-3 pr-1 text-[13px]"
                style={{ borderColor: "color-mix(in srgb, var(--acento) 35%, transparent)", color: "var(--text-muted)" }}
              >
                <span className="flex-1">Preenchemos a partir dos seus documentos. Leia e corrija o que não estiver do seu jeito.</span>
                <BotaoDescartar compacto />
              </div>
            </Descartavel>
          )}
          {camposDoPorque && (
            <PorqueDoSetup
              setup={setupSugerido}
              campos={camposDoPorque}
              form={form}
              set={set}
              montando={montandoSetup}
              onRefazer={setupSugerido ? () => void montarSetup(true) : undefined}
            />
          )}
          {chave === "perfil" && <StepPerfilProprio projectId={project.id} />}
          {chave === "referencias" && <StepReferenciasDoCliente projectId={project.id} />}
          {chave === "marca" && (
            <StepMarca
              projectId={project.id}
              set={set}
              logoInicial={project.logoUrl ?? null}
              manualInicial={project.brandManualName ?? null}
              documentosIniciais={project.contexts ?? []}
              sugestaoDasCapas={setupSugerido?.campos.colorPalette ? { cores: setupSugerido.campos.colorPalette, porque: setupSugerido.porque.colorPalette } : null}
            />
          )}
          {chave === "materiais" && <StepMateriais projectId={project.id} />}
          {chave === "voz" && <StepVoice form={form} set={set} preencherIA={preencherIA} aiLoading={aiLoading} projectId={project.id} />}
          {chave === "ideacao" && <StepIdeation form={form} set={set} preencherIA={preencherIA} aiLoading={aiLoading} />}
          {chave === "agenda" && <StepSchedule form={form} set={set} askAI={askAI} />}
          {chave === "regras" && <StepReferencias projectId={project.id} />}
          {chave === "redes" && <StepNetworks projectId={project.id} />}
          {chave === "ativacao" && <StepActivation project={project} form={form} />}

          {/* AI Assistant reply */}
          {(aiLoading || aiReply) && (
            <div className="mt-6 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
              <div className="flex items-center gap-2 mb-2 text-orange-400 text-sm font-medium">
                <Bot className="w-4 h-4" />
                <span className="flex-1">Assistente IA</span>
                {/* A resposta é efêmera: o X só a tira daqui (07/10); antes ela
                    seguia por todas as etapas até um pedido novo. */}
                {!aiLoading && <BotaoDescartar compacto rotulo="Fechar a resposta" aoDescartar={() => setAiReply("")} className="-my-1 -mr-1" />}
              </div>
              {aiLoading ? (
                <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Pensando...
                </div>
              ) : (
                <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto pr-2">
                  {limparMarkdown(aiReply ?? "")}
                </p>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-6">
        <Button
          variant="outline"
          onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
          disabled={currentStep === 0 || saving}
        >
          Anterior
        </Button>
        <Button onClick={saveAndNext} loading={saving}>
          {currentStep === STEPS.length - 1 ? (
            <>
              <Rocket className="w-4 h-4" />
              Ativar projeto
            </>
          ) : (
            <>
              Próxima etapa
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>
    </div>
    </div>
  );
}

/**
 * O prompt manda o modelo responder em texto puro, mas modelo desobedece de
 * vez em quando (lição da sessão de 18/08: valide em código o que você pediu
 * na instrução). Isto tira o Markdown residual antes de exibir.
 */
function limparMarkdown(texto: string): string {
  return texto
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/`{1,3}/g, "");
}

// ── Step components ──────────────────────────────────────────────────────────

const CAMPOS_IDEACAO = ["name", "description", "niche", "targetAudience"];

function StepIdeation({
  form,
  set,
  preencherIA,
  aiLoading,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  preencherIA: (campos: string[], instrucao?: string) => void;
  aiLoading: boolean;
}) {
  const [ajuste, setAjuste] = useState("");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Ideação: o que é seu projeto?
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Conte suas referências e deixe a IA propor o resto; tudo fica
          editável.
        </p>
      </div>

      <Textarea
        label="Referências e inspirações"
        value={form.references}
        onChange={(e) => set("references", e.target.value)}
        placeholder="Perfis de influenciadores e autoridades da sua área que você quer modelar. Ex: @fulano no LinkedIn, @beltrano no Instagram, canal Sicrano no YouTube..."
        className="min-h-[80px]"
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          size="sm"
          loading={aiLoading}
          onClick={() => preencherIA(CAMPOS_IDEACAO)}
        >
          <Bot className="w-3.5 h-3.5" />
          Preencher com IA
        </Button>
        <div className="flex flex-1 gap-2">
          <Input
            value={ajuste}
            onChange={(e) => setAjuste(e.target.value)}
            placeholder="Quer ajustar? Diga o que a IA deve considerar..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={aiLoading || !ajuste.trim()}
            onClick={() => preencherIA(CAMPOS_IDEACAO, ajuste.trim())}
          >
            Ajustar
          </Button>
        </div>
      </div>

      <Input
        label="Nome do projeto"
        value={form.name}
        onChange={(e) => set("name", e.target.value)}
        placeholder="Ex: Conteúdo Tech LinkedIn"
      />

      <Textarea
        label="Descrição"
        value={form.description}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Descreva o objetivo deste projeto..."
        className="min-h-[80px]"
      />

      <Input
        label="Nicho"
        value={form.niche}
        onChange={(e) => set("niche", e.target.value)}
        placeholder="Ex: Tecnologia B2B, Startups, Marketing Digital"
      />

      <Textarea
        label="Público-alvo"
        value={form.targetAudience}
        onChange={(e) => set("targetAudience", e.target.value)}
        placeholder="Quem você quer atingir? Cargo, setor, dores..."
        className="min-h-[80px]"
      />

      <Textarea
        label="Linha editorial (os pilares, um por linha)"
        value={form.linhaEditorial}
        onChange={(e) => set("linhaEditorial", e.target.value)}
        placeholder="Pilar: o que é; formato que rende; quantos por semana"
        className="min-h-[120px]"
      />
    </div>
  );
}

function StepVoice({
  form,
  set,
  preencherIA,
  aiLoading,
  projectId,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  preencherIA: (campos: string[], instrucao?: string) => void;
  aiLoading: boolean;
  projectId: string;
}) {
  const [ajuste, setAjuste] = useState("");
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Voz & Estilo: como você quer soar?
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina o tom de voz dos seus conteúdos. O assistente gera o guia automaticamente.
        </p>
      </div>

      <Textarea
        label="Tom de voz e estilo"
        value={form.voice}
        onChange={(e) => set("voice", e.target.value)}
        placeholder="Ex: Provocativo mas respeitoso. Fala de igual para igual com líderes de tecnologia. Usa dados para argumentar. Nunca condescendente..."
        className="min-h-[160px]"
      />

      <div className="grid grid-cols-2 gap-3">
        {[
          "Autoritário e técnico",
          "Provocativo e direto",
          "Educativo e acessível",
          "Inspiracional e humano",
        ].map((preset) => (
          <button
            key={preset}
            onClick={() => set("voice", `Tom: ${preset}. Linguagem clara, dados como argumento, sem jargão excessivo.`)}
            className="p-3 text-left rounded-lg border text-sm text-[var(--text-muted)] hover:border-orange-500/30 hover:text-orange-400 transition-all"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            {preset}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          size="sm"
          loading={aiLoading}
          onClick={() =>
            preencherIA(
              ["voice"],
              "o campo voice deve ser um guia de voz completo: tom, palavras proibidas, exemplos de frases, o que fazer e o que nunca fazer"
            )
          }
        >
          <Bot className="w-3.5 h-3.5" />
          Gerar e preencher o guia de voz
        </Button>
        <div className="flex flex-1 gap-2">
          <Input
            value={ajuste}
            onChange={(e) => setAjuste(e.target.value)}
            placeholder="Quer ajustar? Ex: mais provocativo, sem emojis..."
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            disabled={aiLoading || !ajuste.trim()}
            onClick={() =>
              preencherIA(
                ["voice"],
                `o campo voice deve ser um guia de voz completo (tom, palavras proibidas, exemplos, o que fazer e o que nunca fazer). Pedido do usuário: ${ajuste.trim()}`
              )
            }
          >
            Ajustar
          </Button>
        </div>
      </div>

      {/* A PRÉVIA SAIU DAQUI EM 18/09, por decisão do Bruno usando a jornada.

          Ela existia desde 18/08 com um argumento que continua verdadeiro: o
          cliente paga o cartão no começo e, sem ela, só via o produto funcionar
          no último passo do assistente.

          O que mudou não foi o argumento, foi o que ela interrompe. Desde 17/09
          a Marca vem antes, e as etapas seguintes deixaram de ser preenchimento
          e viraram revisão do que saiu do documento da pessoa. Oferecer um post
          pronto no meio disso tira a pessoa da configuração bem na hora em que
          ela está entendendo como a plataforma lê a marca dela.

          **Prova antecipada e jornada completa competem pelo mesmo momento**, e
          a decisão foi deixar a jornada terminar. O componente e a rota
          /preview continuam existindo para quando houver um lugar melhor. */}
    </div>
  );
}

function StepDesign({
  form,
  set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Design: identidade visual
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina a paleta de cores e estilo visual dos infográficos gerados.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-[var(--text-primary)] block mb-3">
          Paleta de cores (hex separados por vírgula)
        </label>
        <Input
          value={form.colorPalette}
          onChange={(e) => set("colorPalette", e.target.value)}
          placeholder="#F97316,#1e1f22,#dbdee1"
        />
        <div className="flex gap-2 mt-3">
          {form.colorPalette.split(",").map((color, i) => (
            <div
              key={i}
              className="w-8 h-8 rounded-md border border-[var(--border)]"
              style={{ backgroundColor: color.trim() }}
            />
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[var(--text-primary)]">
          Presets de paleta
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { name: "Dark Orange (padrão)", value: "#F97316,#1e1f22,#dbdee1" },
            { name: "Midnight Blue", value: "#3B82F6,#0F172A,#E2E8F0" },
            { name: "Emerald", value: "#10B981,#0D1F1A,#F0FDF4" },
            { name: "Purple Pro", value: "#8B5CF6,#0D0D1F,#F5F5FF" },
          ].map((preset) => (
            <button
              key={preset.name}
              onClick={() => set("colorPalette", preset.value)}
              className="p-2.5 text-left rounded-lg border text-xs text-[var(--text-muted)] hover:border-orange-500/30 flex items-center gap-2"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              <div className="flex gap-1">
                {preset.value.split(",").map((c, i) => (
                  <div key={i} className="w-4 h-4 rounded-sm" style={{ backgroundColor: c }} />
                ))}
              </div>
              {preset.name}
            </button>
          ))}
        </div>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Sugira uma paleta de cores e estilo visual para um projeto no nicho "${form.niche}" voltado para "${form.targetAudience}". Seja específico com códigos hex.`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Sugerir paleta ideal para meu nicho
      </Button>
    </div>
  );
}

/**
 * "1 perfil e 2 páginas", em vez de "Conta conectada".
 *
 * O plural é resolvido aqui e não no JSX porque a frase tem quatro formas
 * (1 perfil, 2 perfis, 1 página, 3 páginas) e montá-la com ternários dentro da
 * marcação produz exatamente o tipo de "1 páginas" que faz um produto parecer
 * descuidado.
 */
function resumoDasContas(contas: ContaConectada[]): string {
  const paginas = contas.filter((c) => c.accountType === "organization").length;
  const perfis = contas.length - paginas;
  const partes: string[] = [];
  if (perfis > 0) partes.push(perfis === 1 ? "1 perfil" : `${perfis} perfis`);
  if (paginas > 0) partes.push(paginas === 1 ? "1 página" : `${paginas} páginas`);
  const desligadas = contas.filter((c) => !c.isActive).length;
  const base = partes.join(" e ");
  return desligadas > 0 ? `${base}, ${desligadas} desligada${desligadas > 1 ? "s" : ""}` : base;
}

const CHAVE_CONECTANDO = "demandou:conectando-rede";
const NOME_DA_REDE_NA_TELA: Record<string, string> = {
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  instagram: "Instagram",
  facebook: "Facebook",
  youtube: "YouTube",
  tiktok: "TikTok",
};

/** Uma conta conectada, como a API de conexão devolve. */
type ContaConectada = {
  id: string;
  platform: string;
  displayName: string | null;
  username: string | null;
  isActive: boolean;
  accountType: string | null;
};

function StepNetworks({ projectId }: { projectId: string }) {
  /**
   * As contas INTEIRAS, e não só a lista de redes que têm alguma.
   *
   * Até 18/09 esta tela guardava só `platform` e mostrava um selo "conectado"
   * por rede. Achado do Bruno criando um projeto de verdade: ele tinha a página
   * do Facebook "Demandou" e as páginas de LinkedIn "demandou" e "Areticon"
   * conectadas, e a etapa dizia apenas "conectado" no LinkedIn.
   *
   * **"Conectado" não é informação quando uma rede pode ter um perfil, cinco
   * páginas, ou uma página desligada que ninguém lembra de ter desligado.** A
   * plataforma tinha feito o trabalho e a tela não contava.
   */
  const [contas, setContas] = useState<ContaConectada[]>([]);
  const connected = [...new Set(contas.filter((c) => c.isActive).map((c) => c.platform))];

  // returnTo points back to this wizard so the user returns here after OAuth
  // A etapa das contas mudou de lugar em 03/10: o número sai da chave.
  const returnTo = `/projects/${projectId}?step=${indiceDa("redes")}`;

  /**
   * A ABA QUE FICOU PARA TRÁS PERCEBE A CONEXÃO (04/10).
   *
   * No celular o login da Meta pode terminar no app do Instagram, e a volta
   * cai no navegador de dentro do app (ver app/conectado/page.tsx). A conta é
   * gravada lá, e esta aba precisa saber sem a pessoa recarregar: a consulta
   * periódica abaixo compara as contas e avisa a que chegou.
   */
  const conhecidas = useRef<Set<string> | null>(null);
  const refresh = () => {
    fetch(`/api/social/connect?projectId=${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        const lista = (d.storedAccounts ?? []) as ContaConectada[];
        const antes = conhecidas.current;
        if (antes) {
          const novas = lista.filter((c) => !antes.has(c.id));
          for (const rede of new Set(novas.map((c) => c.platform))) {
            const n = novas.filter((c) => c.platform === rede);
            const paginasDesligadas = n.filter((c) => c.accountType === "organization" && !c.isActive).length;
            toast.success(
              paginasDesligadas > 0
                ? `${NOME_DA_REDE_NA_TELA[rede] ?? rede}: ${paginasDesligadas === 1 ? "1 página encontrada" : `${paginasDesligadas} páginas encontradas`}. Ligue abaixo as que vão receber posts.`
                : `${NOME_DA_REDE_NA_TELA[rede] ?? rede} conectado com sucesso.`,
              { duration: 6000 }
            );
          }
          if (novas.length > 0) {
            try {
              sessionStorage.removeItem(CHAVE_CONECTANDO);
            } catch {}
            setPresoEm(null);
          }
        }
        conhecidas.current = new Set(lista.map((c) => c.id));
        setContas(lista);
      })
      .catch(() => undefined);
  };

  // A consulta de tempos em tempos, só com a aba visível.
  useEffect(() => {
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5000);
    return () => window.clearInterval(t);
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * "FICOU PRESO NO INSTAGRAM" (04/10). Ao clicar em Conectar, a tela anota a
   * rede e a hora. Se a pessoa volta para esta aba (voltar do navegador, ou
   * trocar de app no celular) sem a conta ter chegado, aparece a saída: tentar
   * de novo já logado (o Instagram vai direto para a autorização) ou pedir a
   * conexão assistida. Antes ela ficava no feed do Instagram sem caminho.
   */
  const [presoEm, setPresoEm] = useState<string | null>(null);
  const [paginasLinkedIn, setPaginasLinkedIn] = useState<"nenhuma" | "erro" | null>(null);
  const anotarSaida = (rede: string) => {
    try {
      sessionStorage.setItem(CHAVE_CONECTANDO, JSON.stringify({ rede, em: Date.now() }));
    } catch {}
  };
  useEffect(() => {
    const conferir = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const v = JSON.parse(sessionStorage.getItem(CHAVE_CONECTANDO) ?? "null") as { rede: string; em: number } | null;
        if (v && Date.now() - v.em < 20 * 60 * 1000 && Date.now() - v.em > 1500) setPresoEm(v.rede);
      } catch {}
    };
    conferir();
    document.addEventListener("visibilitychange", conferir);
    window.addEventListener("pageshow", conferir);
    return () => {
      document.removeEventListener("visibilitychange", conferir);
      window.removeEventListener("pageshow", conferir);
    };
  }, []);

  // Quais redes tem credencial no servidor. Perguntado em runtime de
  // proposito: ver app/api/social/providers/route.ts.
  const [prontas, setProntas] = useState<Record<string, boolean>>({});

  // CONEXÃO ASSISTIDA (01/10): rede que o cliente de fora ainda não conecta
  // sozinho mostra a caixa de pedir a conexão ao time, e não o "Conectar" que
  // levaria a uma recusa da Meta ou do TikTok. Ver lib/social/conexao-assistida.ts.
  const [assistidas, setAssistidas] = useState<string[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDeConexao[]>([]);
  const [conectarDireto, setConectarDireto] = useState(false);
  useEffect(() => {
    fetch(`/api/social/conexao-assistida?projectId=${projectId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { assistidas?: string[]; pedidos?: PedidoDeConexao[]; conectarDireto?: boolean } | null) => {
        setAssistidas(d?.assistidas ?? []);
        setPedidos(d?.pedidos ?? []);
        setConectarDireto(d?.conectarDireto === true);
      })
      .catch(() => undefined);
  }, [projectId]);

  // A conexão acontece em outra aba; quando esta volta ao foco, o status
  // verde precisa aparecer sem recarregar na mão.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", aoVoltar);
    return () => {
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", aoVoltar);
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    refresh();
    fetch("/api/social/providers")
      .then((r) => r.json())
      .then(setProntas)
      .catch(() => setProntas({}));

    // Retorno do OAuth. Antes só LinkedIn e X eram lidos aqui, então uma
    // conexão de Facebook que falhava voltava para uma tela que não dizia
    // absolutamente nada (achado do teste de 21/08: o Facebook não conectou
    // e a plataforma ficou muda, com o Bruno recarregando à toa).
    const params = new URLSearchParams(window.location.search);
    const REDES = ["linkedin", "twitter", "instagram", "facebook", "youtube", "tiktok"] as const;
    const NOMES: Record<string, string> = {
      linkedin: "LinkedIn",
      twitter: "X (Twitter)",
      instagram: "Instagram",
      facebook: "Facebook",
      youtube: "YouTube",
      tiktok: "TikTok",
    };
    const MOTIVOS: Record<string, string> = {
      "sem-pagina":
        "Nenhuma página foi liberada. Na tela da Meta, escolha Editar configurações e marque a página que o squad vai usar.",
    };

    for (const rede of REDES) {
      const estado = params.get(rede);
      if (!estado) continue;
      // Voltou pelo caminho normal: a saída anotada no clique já se resolveu.
      try {
        sessionStorage.removeItem(CHAVE_CONECTANDO);
      } catch {}
      setPresoEm(null);
      if (estado === "success") {
        toast.success(`${NOMES[rede]} conectado com sucesso.`);
        refresh();
      } else if (rede === "linkedin" && estado === "pages_success") {
        // O app de PÁGINAS volta com a contagem. Antes esta tela não lia este
        // retorno: zero páginas ou cinco, a pessoa via a mesma tela muda.
        const n = Number.parseInt(params.get("pages_count") ?? "0", 10) || 0;
        if (n > 0) {
          toast.success(
            `${n === 1 ? "1 página de empresa encontrada" : `${n} páginas de empresa encontradas`}. Ligue abaixo as que vão receber posts.`,
            { duration: 7000 }
          );
          setPaginasLinkedIn(null);
        } else {
          setPaginasLinkedIn("nenhuma");
        }
        refresh();
      } else if (rede === "linkedin" && estado === "error" && params.get("pages") === "1") {
        setPaginasLinkedIn("erro");
      } else if (estado === "error") {
        const motivo = params.get("motivo");
        toast.error(
          motivo && MOTIVOS[motivo]
            ? MOTIVOS[motivo]
            : `Não consegui conectar o ${NOMES[rede]}. Tente de novo.`,
          { duration: 8000 }
        );
      }
      // Limpa a URL para o aviso não repetir a cada recarga.
      const limpa = new URL(window.location.href);
      REDES.forEach((r) => limpa.searchParams.delete(r));
      limpa.searchParams.delete("motivo");
      limpa.searchParams.delete("pages_count");
      limpa.searchParams.delete("pages");
      window.history.replaceState({}, "", limpa.toString());
    }
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Logos oficiais em SVG, não texto dentro de um círculo. Ver
  // components/social/logos-redes.tsx.
  const conectar = (rede: string) =>
    `/api/social/${rede}/connect?projectId=${projectId}&returnTo=${encodeURIComponent(returnTo)}`;

  /**
   * O app de PÁGINAS do LinkedIn é outro app, com a Community Management API.
   *
   * A porta dele existia só na aba Configurações até 18/09, e quem fazia o
   * setup nunca descobria que podia publicar em página. Pior: o callback dele
   * ignorava o `returnTo` e mandava todo mundo para /settings, o que teria
   * cuspido a pessoa para fora do assistente no meio dele. Os dois foram
   * consertados juntos, porque um sem o outro não serve.
   */
  const [temAppDePaginas, setTemAppDePaginas] = useState(false);
  useEffect(() => {
    fetch("/api/social/linkedin/pages-available")
      .then((r) => r.json())
      .then((d) => setTemAppDePaginas(d.available === true))
      .catch(() => setTemAppDePaginas(false));
  }, []);

  const urlPaginasLinkedIn = `/api/social/linkedin/connect?projectId=${projectId}&pages=1&returnTo=${encodeURIComponent(returnTo)}`;

  const [alternando, setAlternando] = useState<string | null>(null);
  const alternarConta = async (c: ContaConectada) => {
    setAlternando(c.id);
    try {
      const r = await fetch("/api/social/connect", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, isActive: !c.isActive }),
      });
      const d = (await r.json().catch(() => ({}))) as { isActive?: boolean; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui mudar agora. Tente de novo.");
      setContas((prev) => prev.map((x) => (x.id === c.id ? { ...x, isActive: d.isActive ?? !c.isActive } : x)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui mudar agora.");
    } finally {
      setAlternando(null);
    }
  };

  const NETWORKS: Array<{
    platform: RedeComLogo;
    label: string;
    descricao: string;
    connectUrl: string;
  }> = [
    {
      platform: "linkedin",
      label: "LinkedIn",
      descricao: "Seu perfil pessoal. A página de empresa tem a porta própria, logo abaixo.",
      connectUrl: conectar("linkedin"),
    },
    { platform: "instagram", label: "Instagram", descricao: "Conta profissional, ligada a uma página do Facebook", connectUrl: conectar("instagram") },
    { platform: "twitter", label: "X (Twitter)", descricao: "Seu perfil, autorize via OAuth", connectUrl: conectar("twitter") },
    // O Facebook NÃO publica em perfil pessoal, e nunca publicou: o callback
    // importa só páginas (accountType "organization"). A descrição antiga
    // ("Publica na sua página") era verdadeira e passava despercebida, e o
    // Bruno conectou esperando o perfil. Dizer o que NÃO acontece é o que
    // evita a expectativa errada.
    { platform: "facebook", label: "Facebook", descricao: "Só páginas. O Facebook não permite publicar em perfil pessoal.", connectUrl: conectar("facebook") },
    { platform: "youtube", label: "YouTube", descricao: "Publica os vídeos do seu canal", connectUrl: conectar("youtube") },
    { platform: "tiktok", label: "TikTok", descricao: "Publica seus vídeos verticais no perfil", connectUrl: conectar("tiktok") },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Redes Sociais: conecte suas contas
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Configure as redes onde seus agentes vão publicar. Você pode pular e conectar depois.
        </p>
      </div>

      {/* Dica fixa, descartável por pessoa e por projeto (07/10). */}
      <Descartavel chave={chaveDaDica("pular-redes", projectId)}>
        <div className="flex items-start gap-2 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl text-sm text-orange-400">
          <p className="flex-1">
            💡 Você pode pular agora e conectar depois. Sem redes conectadas, os agentes criam os posts mas <strong>não publicam automaticamente</strong>.
          </p>
          <BotaoDescartar compacto className="-my-0.5 -mr-1" />
        </div>
      </Descartavel>

      <div className="grid grid-cols-1 gap-3">
        {NETWORKS.map((net) => {
          const daRede = contas.filter((c) => c.platform === net.platform);
          const isConnected = connected.includes(net.platform);
          return (
            <div
              key={net.platform}
              className="p-4 rounded-xl border"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
            <div className="flex items-center gap-4">
              {(() => {
                const Logo = LOGO_POR_REDE[net.platform];
                return <Logo />;
              })()}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text-primary)]">{net.label}</p>
                <p className="text-xs text-[var(--text-muted)]">
                  {daRede.length > 0 ? resumoDasContas(daRede) : net.descricao}
                </p>
              </div>
              {isConnected ? (
                <div className="flex items-center gap-2 shrink-0">
                  {/* A porta de PÁGINA continua disponível mesmo com o perfil
                      já conectado: são apps diferentes, e ter um não dá o
                      outro. Era justamente o caso do Bruno. */}
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-green-600 border border-green-700 text-white font-semibold">
                    conectado
                  </span>
                </div>
              ) : assistidas.includes(net.platform) ? null : prontas[net.platform] ? (
                <a
                  href={net.connectUrl}
                  onClick={() => anotarSaida(net.platform)}
                  // Mesma aba, por pedido do Bruno em 13/09: a aba nova de
                  // 21/08 deixava duas janelas da Demandou abertas e a pessoa
                  // seguia na errada. O que a aba nova protegia (o vai e vem do
                  // OAuth destruir o assistente) já é resolvido pelo `returnTo`
                  // que o `conectar()` manda: o callback volta exatamente para
                  // esta etapa, na mesma aba.
                  className="text-xs px-3 py-1.5 rounded-lg border text-[var(--text-muted)] hover:border-orange-500/40 hover:text-orange-400 transition-all"
                  style={{ borderColor: "var(--border)" }}
                >
                  {net.platform === "linkedin" ? "Conectar perfil" : "Conectar"}
                </a>
              ) : (
                <span
                  className="text-xs px-3 py-1.5 rounded-lg border text-[var(--text-muted)] opacity-60"
                  style={{ borderColor: "var(--border)" }}
                >
                  em breve
                </span>
              )}
            </div>

            {assistidas.includes(net.platform) && (
              <div className="mt-3">
                <ConexaoAssistida
                  compacta
                  projectId={projectId}
                  rede={net.platform}
                  temConta={isConnected}
                  pedido={pedidos.find((p) => p.rede === net.platform) ?? null}
                  conectarDiretoUrl={conectarDireto ? net.connectUrl : null}
                  onPedido={(p) => setPedidos((prev) => [p, ...prev.filter((x) => x.rede !== p.rede)])}
                />
              </div>
            )}

            {/* O @ do canal (06/10): a conexão do YouTube grava só o nome do canal. */}
            {net.platform === "youtube" && isConnected && (
              <div className="mt-3">
                <ArrobaDoYouTube key={daRede.map((c) => c.id).join(",")} projetoId={projectId} />
              </div>
            )}

            {net.platform === "linkedin" && (
              <PaginaDeEmpresaLinkedIn
                projectId={projectId}
                // Página de empresa pela conexão assistida (05/10): o app de
                // páginas próprio só autoriza administradores do app.
                assistida={assistidas.includes(PAGINA_DO_LINKEDIN)}
                conectarDiretoUrl={conectarDireto && temAppDePaginas ? urlPaginasLinkedIn : null}
                appLiberado={temAppDePaginas}
                urlDoApp={urlPaginasLinkedIn}
                paginas={daRede.filter((c) => c.accountType === "organization").length}
                resultado={paginasLinkedIn}
                pedido={
                  pedidos.find((p) => p.rede === (assistidas.includes(PAGINA_DO_LINKEDIN) ? PAGINA_DO_LINKEDIN : "linkedin")) ?? null
                }
                onPedido={(p) => setPedidos((prev) => [p, ...prev.filter((x) => x.rede !== p.rede)])}
                onSair={() => anotarSaida("linkedin")}
              />
            )}

            {presoEm === net.platform && !isConnected && (
              <div className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3 text-xs text-[var(--text-primary)] space-y-2">
                <p>
                  <strong>A conexão com o {net.label} não terminou.</strong> Se o login ficou parado no {net.label} (no
                  feed ou no app), tente de novo: agora que você já entrou, ele vai direto para a autorização.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`${net.connectUrl}&tentativa=2`}
                    onClick={() => anotarSaida(net.platform)}
                    className="px-3 py-1.5 rounded-lg bg-orange-500 text-white font-semibold"
                  >
                    Tentar de novo
                  </a>
                  {/* O X padrão (07/10), só local: limpa a tentativa anotada na sessão. */}
                  <BotaoDescartar
                    texto="Fechar aviso"
                    aoDescartar={() => {
                      try {
                        sessionStorage.removeItem(CHAVE_CONECTANDO);
                      } catch {}
                      setPresoEm(null);
                    }}
                    className="border"
                    style={{ borderColor: "var(--border)" }}
                  />
                </div>
                <p className="text-[var(--text-muted)]">
                  No celular, se o app do {net.label} abrir sozinho, termine a autorização nele e volte para esta tela:
                  ela atualiza sozinha.
                </p>
              </div>
            )}

            {/* CADA CONTA, com nome e tipo. É o conserto do achado de 18/09:
                um selo "conectado" escondia um perfil, duas páginas e uma
                delas desligada. */}
            {daRede.length > 0 && (
              <div className="mt-3 pl-1 space-y-1.5">
                {daRede.map((c) => (
                  <div key={c.id} className="flex items-center gap-2 text-xs">
                    {c.accountType === "organization" ? (
                      <Building2 className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                    ) : (
                      <UserRound className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)]" />
                    )}
                    <span className="text-[var(--text-muted)] shrink-0">
                      {c.accountType === "organization" ? "Página:" : "Perfil:"}
                    </span>
                    <span className="truncate text-[var(--text-primary)]">
                      {c.displayName ?? c.username ?? "sem nome"}
                    </span>
                    {/* Página nova nasce DESLIGADA de propósito, para nada ser
                        publicado no nome de uma empresa sem alguém mandar.
                        Mas desligada e silenciosa é a mesma coisa que ausente,
                        e foi assim que a "Areticon" sumiu da vista dele. */}
                    {/* Ligar e desligar AQUI (04/10): a página de empresa nasce
                        desligada, e mandar a pessoa às Configurações no meio do
                        setup para escolher a página era tirar ela da jornada. */}
                    <button
                      type="button"
                      onClick={() => alternarConta(c)}
                      disabled={alternando === c.id}
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-all disabled:opacity-50",
                        c.isActive
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-amber-500 text-white hover:bg-amber-600"
                      )}
                      title={c.isActive ? "Recebe posts. Clique para desligar." : "Não recebe posts. Clique para ligar."}
                    >
                      {c.isActive ? "ligada" : "desligada, ligar"}
                    </button>
                  </div>
                ))}
                {daRede.some((c) => !c.isActive) && (
                  <p className="text-[11px] text-[var(--text-muted)] pt-0.5">
                    Só recebe posts a conta ligada. Toque em &quot;ligar&quot; na que vai publicar.
                  </p>
                )}
              </div>
            )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        Também é possível conectar depois em{" "}
        <a href={`/projects/${projectId}/settings`} className="text-orange-400 underline">
          Configurações → Redes Sociais
        </a>.
      </p>
    </div>
  );
}

function StepSchedule({
  form,
  set,
  askAI,
}: {
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  askAI: (msg: string) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Agenda: frequência de publicação
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Defina com que frequência seus agentes vão criar e publicar conteúdo.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-[var(--text-primary)] block mb-3">
          Frequência de posts
        </label>
        <div className="grid grid-cols-2 gap-2">
          {[
            "1x por semana",
            "2x por semana",
            "3x por semana",
            "5x por semana",
            "1x por dia",
            "Personalizado",
          ].map((freq) => (
            <button
              key={freq}
              onClick={() => set("postFrequency", freq)}
              className={cn(
                "p-3 text-sm rounded-lg border transition-all",
                form.postFrequency === freq
                  ? "border-orange-500 bg-orange-500/10 text-orange-400"
                  : "text-[var(--text-muted)] hover:border-orange-500/30"
              )}
              style={form.postFrequency !== freq ? { background: "var(--bg-primary)", borderColor: "var(--border)" } : undefined}
            >
              {freq}
            </button>
          ))}
        </div>
      </div>

      {/* O fuso é uma ESCOLHA CURTA, e não um campo de texto livre.

          Era um Input onde a pessoa digitava o nome técnico do fuso. Dois
          problemas: um erro de digitação ("America/SaoPaulo") não avisava nada
          e caía no padrão em silêncio, e a lista completa de fusos do mundo é
          ruído para um produto cujo cliente está no Brasil.

          São Paulo vem primeiro e é o padrão, aqui, no formulário e no banco.
          Os outros existem para quem mora fora, que é caso real e raro. */}
      <div>
        <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">Fuso horário</label>
        <select
          value={form.timezone}
          onChange={(e) => set("timezone", e.target.value)}
          className="h-10 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
          style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          {FUSOS.map((f) => (
            <option key={f.id} value={f.id}>
              {f.rotulo}
            </option>
          ))}
          {/* O fuso que já está gravado e não está na lista continua valendo:
              trocar o campo não pode mudar o agendamento de ninguém à revelia. */}
          {!FUSOS.some((f) => f.id === form.timezone) && form.timezone && (
            <option value={form.timezone}>{form.timezone}</option>
          )}
        </select>
        <p className="mt-1.5 text-xs text-[var(--text-muted)]">
          É a hora que vale para publicar. Tudo o que você agendar sai neste horário.
        </p>
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          askAI(
            `Qual a melhor frequência e horários de publicação para um projeto no nicho "${form.niche}" no Brasil para LinkedIn e X? Considere o público "${form.targetAudience}".`
          )
        }
      >
        <Bot className="w-3.5 h-3.5" />
        Recomendar frequência ideal
      </Button>
    </div>
  );
}

function StepActivation({
  project,
  form,
}: {
  project: Project;
  form: Record<string, string>;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Ativação: tudo pronto!
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Revise as configurações e ative seu projeto.
        </p>
      </div>

      <div className="space-y-3">
        {[
          { label: "Nome do projeto", value: form.name },
          { label: "Nicho", value: form.niche || "—" },
          { label: "Público-alvo", value: form.targetAudience || "—" },
          { label: "Frequência", value: form.postFrequency },
          { label: "Fuso horário", value: form.timezone },
        ].map((item) => (
          <div
            key={item.label}
            className="flex items-start gap-4 p-3 rounded-lg border"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <span className="text-xs text-[var(--text-muted)] min-w-[120px]">
              {item.label}
            </span>
            <span className="text-sm text-[var(--text-primary)] flex-1">{item.value}</span>
          </div>
        ))}
      </div>

      <div className="p-4 bg-green-50 border border-green-600/50 rounded-xl">
        <p className="text-sm text-green-800">
          ✓ Ao clicar em &quot;Ativar projeto&quot;, seu squad de agentes estará pronto para criar e publicar conteúdo automaticamente.
        </p>
      </div>
    </div>
  );
}
