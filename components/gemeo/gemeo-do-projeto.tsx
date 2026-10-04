"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { segundosDaEtapa } from "@/lib/media/tempos-medidos";
import { upload } from "@vercel/blob/client";
import {
  Video,
  Sparkles,
  ShieldCheck,
  Clapperboard,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  Trash2,
  ArrowRight,
  Headphones,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CENARIOS,
  SEGUNDOS_MAXIMOS_DA_VOZ,
  SEGUNDOS_MAXIMOS_DO_ROTEIRO,
  SEGUNDOS_MAXIMOS_DO_TREINO,
  SEGUNDOS_MINIMOS_DA_VOZ,
  SEGUNDOS_MINIMOS_DO_ROTEIRO,
  SEGUNDOS_MINIMOS_DO_TREINO,
  cenarioPorId,
  cenariosDasCenas,
  creditosPorSegundo,
  duracaoFalada,
  gemeoAtivo,
  limparTexto,
  oQueFalta,
  precoDoRoteiro,
  textoDasCenas,
  textoDoTreino,
  videoEmAndamento,
  type CadastroDoGemeo,
  type CenaDoGemeo,
  type EscolhaDeCenario,
  type IdDoGerador,
  type VideoNaTela,
} from "@/lib/media/gemeo";
import { creditosDoRoteiro } from "@/lib/media/limits";
import { Gravador } from "@/components/gemeo/gravador";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";
import { faltaUmPasso, situacaoDoGemeo } from "@/lib/media/gemeo-situacao";
import { ConfirmacaoDoGemeo } from "@/components/gemeo/confirmacao-do-gemeo";

/**
 * A TELA DO GÊMEO DIGITAL (01/10/2026): o cadastro e os vídeos, numa página.
 *
 * 03/10: o cadastro virou UM VÍDEO SÓ (a pessoa lê o texto que rola, que
 * começa com a autorização), no lugar dos três passos de fotos, voz e
 * autorização; o cadastro antigo continua valendo para quem já tinha. E o
 * vídeo gerado pode pôr a pessoa em cenários (mesa, palco, escritório),
 * escolhidos pelo roteiro. O preço aparece ANTES do clique, na mesma conta
 * que o servidor cobra (`lib/media/gemeo.ts`), com o gerador que o servidor
 * diz valer para o projeto.
 *
 * Esta tela nunca chama fornecedor pago: ela envia arquivos ao storage e
 * grava pedidos. Quem confere, clona, treina e gera é o passo do cron, e a
 * tela pergunta o estado a cada poucos segundos enquanto há algo andando.
 */

type Estado = {
  cadastro: CadastroDoGemeo | null;
  videos: VideoNaTela[];
  saldo: number;
  acessoInterno: boolean;
  nome: string;
  projeto: string;
  /** Quem gera os vídeos deste projeto (03/10): muda o preço por segundo. */
  gerador?: IdDoGerador;
  /**
   * MEMBRO DA EQUIPE (01/10, acabamento): o cadastro (rosto, voz e a
   * autorização) é de quem administra a conta, e a revogação também. O membro
   * pede vídeos ao gêmeo pronto. Null para o dono.
   */
  equipe?: { dono: string } | null;
};

type RoteiroDaLinha = { id: string; titulo: string; status: string; cenas: Array<{ fala?: string; naTela?: string; papel?: string }> };

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

function extensao(tipo: string): string {
  const t = tipo.split(";")[0];
  return (
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav", "video/webm": "webm", "video/mp4": "mp4" } as Record<string, string>
  )[t] ?? "bin";
}

export function GemeoDoProjeto({ projectId, inicial, roteiroInicial }: { projectId: string; inicial: Estado; roteiroInicial?: string | null }) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [nomeDaAutorizacao, setNomeDaAutorizacao] = useState(
    inicial.cadastro?.treino?.nome ?? inicial.cadastro?.autorizacao?.nome ?? inicial.nome ?? ""
  );
  const entradaDeTreino = useRef<HTMLInputElement | null>(null);
  const entradaDeVoz = useRef<HTMLInputElement | null>(null);
  const c = estado.cadastro;
  const arquivo = (u?: string | null) => (u ? `/api/projects/${projectId}/gemeo/arquivo?u=${encodeURIComponent(u)}` : "");

  /**
   * `conferir` (03/10): pergunta ao gerador agora, sem esperar o cron, se o
   * gêmeo terminou de treinar ou se a confirmação já valeu. Avisa quando o
   * gêmeo fica pronto aqui na frente da pessoa.
   */
  const roteador = useRouter();
  const estadoAtual = useRef(estado);
  estadoAtual.current = estado;
  const recarregar = useCallback(
    async (conferir = false) => {
      const r = await fetch(`/api/projects/${projectId}/gemeo${conferir ? "?conferir=1" : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const novo = (await r.json()) as Estado;
      const antes = estadoAtual.current.cadastro?.avatar?.estado;
      setEstado(novo);
      if (antes === "consentimento" && novo.cadastro?.avatar?.estado === "pronto") {
        toast.success("Confirmação recebida: o seu gêmeo está pronto.");
        // O selo "Falta um passo" do topo é do servidor: some com o refresh.
        roteador.refresh();
      }
    },
    [projectId, roteador]
  );

  // O gêmeo esperando o gerador: treinando, ou esperando a confirmação.
  const esperandoGerador = ["enviando", "treinando", "consentimento"].includes(estado.cadastro?.avatar?.estado ?? "");
  // Pergunta enquanto algo anda do lado do servidor.
  const andando = useMemo(() => {
    const cad = estado.cadastro;
    return Boolean(
      cad?.foto?.estado === "preparando" ||
        cad?.foto?.estado === "falhou" ||
        ["convertendo", "clonando", "esperando", "sem-permissao", "falhou"].includes(cad?.voz?.estado ?? "") ||
        // 04/10: a amostra para ouvir ainda sendo preparada.
        (cad?.voz?.estado === "pronta" && !cad.voz.previaUrl && (cad.voz.previaTentativas ?? 0) < 3) ||
        cad?.autorizacao?.estado === "conferindo" ||
        ["preparando", "conferindo"].includes(cad?.treino?.estado ?? "") ||
        estado.videos.some(videoEmAndamento)
    );
  }, [estado]);
  useEffect(() => {
    if (!andando && !esperandoGerador) return;
    // O gerador é consultado a cada 12 s; o resto do cadastro, a cada 6 s.
    const t = setInterval(() => void recarregar(esperandoGerador), andando ? 6000 : 12_000);
    return () => clearInterval(t);
  }, [andando, esperandoGerador, recarregar]);

  // A VOLTA DA CONFIRMAÇÃO (03/10): a página do gerador devolve a pessoa para
  // esta tela (ou ela volta para a aba). Em vez de esperar o cron, a tela
  // confere na hora e diz que está conferindo.
  const [conferindo, setConferindo] = useState(() => inicial.cadastro?.avatar?.estado === "consentimento");
  const conferirAgora = useCallback(async () => {
    setConferindo(true);
    try {
      await recarregar(true);
    } finally {
      setConferindo(false);
    }
  }, [recarregar]);
  useEffect(() => {
    if (!["treinando", "consentimento"].includes(inicial.cadastro?.avatar?.estado ?? "")) {
      setConferindo(false);
      return;
    }
    void conferirAgora();
    // Só na chegada: o intervalo cuida do resto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (estado.cadastro?.avatar?.estado !== "consentimento") return;
    const voltou = () => {
      if (document.visibilityState === "visible") void conferirAgora();
    };
    document.addEventListener("visibilitychange", voltou);
    return () => document.removeEventListener("visibilitychange", voltou);
  }, [estado.cadastro?.avatar?.estado, conferirAgora]);

  async function enviar(tipo: "treino" | "voz", blob: Blob, corpo: Record<string, unknown>) {
    const contentType = (blob.type || "application/octet-stream").split(";")[0];
    const enviado = await upload(`gemeo/${projectId}/${tipo}-${Date.now()}.${extensao(contentType)}`, blob, {
      access: "private",
      handleUploadUrl: `/api/projects/${projectId}/gemeo/upload`,
      clientPayload: JSON.stringify({ tipo }),
      contentType,
      // Em partes, como a trilha e o vídeo: o envio de uma peça só ficava
      // pendurado no store privado (29/09).
      multipart: true,
    });
    const r = await fetch(`/api/projects/${projectId}/gemeo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: tipo, url: enviado.url, contentType, ...corpo }),
    });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) throw new Error(d.error ?? "Não consegui guardar.");
    await recarregar();
  }

  /** O vídeo de treino, gravado aqui ou enviado do celular (03/10). */
  async function mandarTreino(blob: Blob, segundos: number | null) {
    if (blob.size > 500 * 1024 * 1024) return toast.error("O vídeo passa de 500 MB. Grave em resolução menor ou corte o excesso.");
    setEnviando("treino");
    try {
      await enviar("treino", blob, { nome: nomeDaAutorizacao, segundos });
      toast.success("Vídeo recebido. Conferindo duração, rosto, áudio e a leitura.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar o vídeo.");
    } finally {
      setEnviando(null);
      if (entradaDeTreino.current) entradaDeTreino.current.value = "";
    }
  }

  /** 04/10: a amostra de fala natural, para melhorar a voz (vira candidata; a aprovada continua). */
  async function mandarVoz(blob: Blob, origem: "gravada" | "arquivo") {
    if (blob.size > 300 * 1024 * 1024) return toast.error("O arquivo passa de 300 MB. Envie um trecho de 2 a 4 minutos.");
    setEnviando("voz");
    try {
      await enviar("voz", blob, { origem });
      toast.success("Recebido. Clonamos a voz nova e preparamos uma amostra para você ouvir antes de usar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar o áudio.");
    } finally {
      setEnviando(null);
      if (entradaDeVoz.current) entradaDeVoz.current.value = "";
    }
  }

  async function aprovarVoz() {
    setEnviando("aprovar-voz");
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "aprovar-voz" }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui aprovar agora.");
      toast.success("Voz aprovada. Os próximos vídeos saem com ela.");
      await recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui aprovar agora.");
    } finally {
      setEnviando(null);
    }
  }

  async function revogar() {
    if (!window.confirm("Revogar o seu gêmeo digital? O vídeo de treino, a voz clonada, o gêmeo treinado e a autorização serão apagados. Os vídeos que já estão no Gestor continuam lá.")) return;
    setEnviando("revogar");
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Gêmeo revogado. Apagamos o vídeo de treino, a voz e a autorização.");
      await recarregar();
    } catch {
      toast.error("Não consegui revogar agora. Tente de novo.");
    } finally {
      setEnviando(null);
    }
  }

  const ativo = gemeoAtivo(c);
  const falta = oQueFalta(c);
  /** Cadastro de antes de 03/10 (fotos, voz e autorização separadas), sem vídeo de treino. */
  const legado = Boolean(c && !c.treino && c.fotos?.length);
  const doMembro = estado.equipe ?? null;
  // 03/10: o estado do gêmeo numa frase, o mesmo das Configurações e dos avisos.
  const situacao = situacaoDoGemeo(c);
  // O ÚLTIMO PASSO (03/10): do vídeo de treino aceito até a confirmação no
  // gerador, na mesma sequência da tela, para o cadastro parecer um passo só.
  const ultimoPasso = c?.treino?.estado === "valido" && (esperandoGerador || faltaUmPasso(situacao));
  const renovou = (cad: CadastroDoGemeo | null) => {
    if (cad) setEstado((e) => ({ ...e, cadastro: cad }));
    else void recarregar();
  };

  // MEMBRO DA EQUIPE: sem os três passos do cadastro e sem revogar. Ele vê se
  // o gêmeo está pronto e pede o vídeo; quem cadastra é o dono (01/10).
  if (doMembro) {
    return (
      <div className="flex flex-col gap-6">
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{ background: "var(--bg-elevated)", borderColor: ativo ? "rgb(34 197 94 / 0.4)" : "var(--border)" }}
        >
          {ativo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />}
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {ativo ? (
              <>
                <strong style={{ color: "var(--text-primary)" }}>O gêmeo deste projeto está pronto.</strong> Escolha um roteiro abaixo e ele grava.
              </>
            ) : (
              <>
                <strong style={{ color: "var(--text-primary)" }}>O gêmeo deste projeto ainda não está pronto.</strong> O vídeo de treino, com a
                autorização, é gravado por {doMembro.dono}, que administra a conta.
              </>
            )}{" "}
            O cadastro e a revogação do gêmeo ficam com {doMembro.dono}.
          </p>
        </div>
        <GerarVideo
          projectId={projectId}
          ativo={ativo}
          falta={falta}
          saldo={estado.saldo}
          acessoInterno={estado.acessoInterno}
          roteiroInicial={roteiroInicial}
          onPedido={() => recarregar()}
          donoDaEquipe={doMembro.dono}
          gerador={estado.gerador ?? "omnihuman"}
          numero={1}
        />
        {estado.videos.length > 0 && <ListaDeVideos projectId={projectId} videos={estado.videos} onMudou={() => recarregar()} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* O RESUMO: pronto, ou o que falta. Com o gêmeo esperando a
          confirmação no gerador (03/10), o resumo vira o passo que falta. */}
      {ultimoPasso ? (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{ background: "var(--bg-elevated)", borderColor: "rgb(249 115 22 / 0.55)" }}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Falta o último passo: confirmar pela câmera (30 s).</strong>{" "}
            <a href="#ultimo-passo" className="font-semibold text-orange-400 underline-offset-2 hover:underline">
              Ir para o último passo
            </a>
          </p>
        </div>
      ) : (
      <div
        className="flex items-start gap-3 rounded-xl border px-4 py-3"
        style={{ background: "var(--bg-elevated)", borderColor: ativo ? "rgb(34 197 94 / 0.4)" : "var(--border)" }}
      >
        {ativo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />}
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {ativo ? (
            <>
              <strong style={{ color: "var(--text-primary)" }}>O seu gêmeo está pronto.</strong> Escolha um roteiro abaixo e ele grava por você.
            </>
          ) : (
            <>
              <strong style={{ color: "var(--text-primary)" }}>Para o gêmeo ficar pronto, falta:</strong> {falta.join(", ")}.
            </>
          )}
        </p>
      </div>
      )}

      {/* PASSO 1: O VÍDEO DE TREINO (03/10). Um vídeo só, lendo o texto que
          rola: é a autorização, a amostra de voz e a amostra de imagem. As
          checagens (duração, rosto, áudio e a fala batendo com o texto)
          aparecem aqui assim que o servidor termina. */}
      <Passo numero={1} Icone={Video} titulo="Um vídeo de 1 minuto lendo o texto" pronto={c?.treino?.estado === "valido"}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Grave um vídeo só, de frente para a câmera, lendo em voz alta o texto que rola abaixo da imagem. Ele começa com a sua
          autorização e serve para tudo: é a prova de que é você (a lei só permite usar a imagem e a voz de alguém com a autorização
          dela, Código Civil, art. 20), é a amostra da sua voz e é a amostra do seu rosto e dos seus gestos. Num lugar silencioso, com
          luz no rosto, só você no quadro, olhando para perto da lente. Leve de {SEGUNDOS_MINIMOS_DO_TREINO} s a{" "}
          {SEGUNDOS_MAXIMOS_DO_TREINO / 60} min. Você pode revogar quando quiser, e tudo é apagado.
        </p>
        {legado && (
          <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
            O seu gêmeo foi cadastrado com fotos e áudio separados e continua funcionando. Gravar o vídeo de treino substitui esse
            cadastro: o gêmeo passa a ter os seus gestos e pode aparecer em cenários.
          </p>
        )}
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Ao gravar, você declara que o rosto e a voz são seus e aceita as{" "}
          <Link href="/terms#gemeo" target="_blank" className="font-semibold text-orange-400 underline-offset-2 hover:underline">
            regras do gêmeo digital nos Termos de Uso
          </Link>
          : é proibido clonar outra pessoa, figura pública ou menor, e você responde pelo que gerar e publicar.
        </p>
        <label className="flex max-w-[520px] flex-col gap-1 text-sm" style={{ color: "var(--text-muted)" }}>
          O seu nome completo (entra na autorização)
          <input
            value={nomeDaAutorizacao}
            onChange={(e) => setNomeDaAutorizacao(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
          />
        </label>
        {nomeDaAutorizacao.trim().length >= 3 ? (
          <div className="flex flex-wrap items-start gap-4">
            <Gravador
              key={c?.treino?.videoUrl ?? "sem-treino"}
              video
              roteiro={textoDoTreino(nomeDaAutorizacao, estado.projeto)}
              rotulo={c?.treino ? "Gravar o vídeo de novo" : "Abrir a câmera e gravar"}
              minSegundos={SEGUNDOS_MINIMOS_DO_TREINO}
              maxSegundos={SEGUNDOS_MAXIMOS_DO_TREINO}
              enviando={enviando === "treino"}
              onPronto={(blob, s) => void mandarTreino(blob, s)}
            />
            <button
              type="button"
              disabled={Boolean(enviando)}
              onClick={() => entradaDeTreino.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
            >
              <Upload className="h-4 w-4" /> Enviar um vídeo gravado no celular
            </button>
            <input
              ref={entradaDeTreino}
              type="file"
              accept="video/mp4,video/quicktime,video/webm"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void mandarTreino(f, null);
              }}
            />
          </div>
        ) : (
          <p className="text-sm text-orange-400">Escreva o seu nome completo para liberar a gravação.</p>
        )}
        {c?.treino && (
          <div className="flex flex-col gap-2">
            <video src={arquivo(c.treino.videoUrl)} controls playsInline className="aspect-video w-full max-w-[360px] rounded-lg bg-black" />
            {["preparando", "conferindo"].includes(c.treino.estado) && (
              <Situacao
                tom="andando"
                texto={
                  c.treino.estado === "preparando"
                    ? "Conferindo o vídeo: duração, rosto e áudio..."
                    : "Conferindo se a fala bate com o texto e se a autorização foi dita..."
                }
              />
            )}
            {(c.treino.checagens ?? []).map((k) => (
              <Situacao key={k.id} tom={k.resultado === "ok" ? "ok" : k.resultado === "aviso" ? "espera" : "erro"} texto={k.texto} />
            ))}
            {c.treino.estado === "falhou" && <Situacao tom="erro" texto={c.treino.motivo ?? "Não consegui conferir o vídeo. Grave de novo."} />}
            {c.treino.estado === "recusado" && (
              <p className="text-sm text-orange-400">O vídeo não valeu. Corrija o que está marcado acima e grave de novo.</p>
            )}
            {c.treino.estado === "valido" && (
              <Situacao tom="ok" texto={`Autorização de ${c.treino.nome}, gravada em ${new Date(c.treino.gravadoEm).toLocaleString("pt-BR")}.`} />
            )}
          </div>
        )}
      </Passo>

      {/* O ÚLTIMO PASSO (03/10): logo depois do vídeo de treino aceito, a
          confirmação que o gerador exige. Enquanto ele treina, o lugar do
          botão já aparece; na volta da página dele, a tela confere na hora. */}
      {ultimoPasso && (
        <section
          id="ultimo-passo"
          className="flex scroll-mt-48 flex-col gap-3 rounded-xl border p-5 lg:scroll-mt-28"
          style={{ background: "var(--bg-card)", borderColor: "rgb(249 115 22 / 0.55)" }}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                Último passo: confirme pela câmera (30 s)
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                É uma exigência do gerador de vídeo: ele só usa o seu rosto depois que você mesmo confirma, na página dele.
              </p>
            </div>
          </div>
          <div className="pl-8">
            {conferindo && c?.avatar?.estado === "consentimento" ? (
              <p className="inline-flex items-center gap-2 text-sm" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="h-4 w-4 animate-spin text-orange-400" /> Conferindo a sua confirmação...
              </p>
            ) : c?.avatar?.estado === "consentimento" ? (
              <ConfirmacaoDoGemeo projectId={projectId} situacao={situacao} onRenovou={renovou} />
            ) : (
              <p className="inline-flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-orange-400" />
                O gerador está treinando o seu gêmeo com o vídeo. O botão aparece aqui em alguns minutos; pode fechar a tela, avisamos
                por e-mail.
              </p>
            )}
          </div>
        </section>
      )}

      {/* PASSO 2: O GÊMEO. O que sai do vídeo de treino: a imagem, a voz
          clonada e (com o gerador treinado ligado) o gêmeo treinado. */}
      {(c?.treino?.estado === "valido" || legado) && (
        <Passo numero={2} Icone={Sparkles} titulo="O seu gêmeo" pronto={ativo && (!c?.avatar || c.avatar.estado === "pronto")}>
          <div className="flex flex-wrap items-start gap-4">
            {c?.foto?.estado === "pronta" && c.foto.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={arquivo(c.foto.url)} alt="A imagem do gêmeo" className="h-24 w-24 rounded-lg object-cover" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              {/* A VOZ (04/10): a aprovada é a única dos vídeos; a clonada é
                  candidata até a pessoa ouvir a amostra e aprovar. */}
              {c?.vozAprovada && (
                <div className="flex flex-col gap-1.5">
                  <Situacao tom="ok" texto={`Voz aprovada por você em ${new Date(c.vozAprovada.aprovadaEm).toLocaleDateString("pt-BR")}. Os vídeos saem com ela.`} />
                  {c.vozAprovada.previaUrl && <audio src={arquivo(c.vozAprovada.previaUrl)} controls preload="none" className="h-9 w-full max-w-[360px]" />}
                </div>
              )}
              {c?.voz && !(c.vozAprovada && c.voz.estado === "pronta" && c.voz.aprovadaEm) && (
                <Situacao
                  tom={c.voz.estado === "pronta" ? "espera" : ["curta", "falhou"].includes(c.voz.estado) ? "erro" : c.voz.estado === "sem-permissao" ? "espera" : "andando"}
                  texto={
                    {
                      convertendo: "Conferindo a gravação da voz...",
                      curta: c.voz.motivo ?? "A gravação ficou curta.",
                      esperando: "A voz é clonada assim que a autorização valer.",
                      clonando: c.vozAprovada ? "Clonando a voz nova. A aprovada continua nos vídeos até você aprovar a nova." : "Clonando a sua voz...",
                      "sem-permissao": c.voz.motivo ?? "Esperando o fornecedor de voz liberar a clonagem.",
                      pronta: `${c.vozAprovada ? "Voz nova" : "Voz"} clonada a partir de ${duracaoFalada(c.voz.segundos ?? 0)} de gravação. Ouça e aprove antes de usar.`,
                      falhou: c.voz.motivo ?? "Não consegui clonar a voz.",
                    }[c.voz.estado]
                  }
                />
              )}
              {c?.voz?.estado === "pronta" && !c.voz.aprovadaEm && !doMembro && (
                <div className="flex flex-wrap items-center gap-3">
                  {c.voz.previaUrl ? (
                    <audio src={arquivo(c.voz.previaUrl)} controls preload="none" className="h-9 w-full max-w-[360px]" />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-sm" style={{ color: "var(--text-muted)" }}>
                      <Loader2 className="h-4 w-4 animate-spin" /> Preparando a amostra para você ouvir...
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={Boolean(enviando) || !c.voz.previaUrl}
                    onClick={() => void aprovarVoz()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {enviando === "aprovar-voz" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Aprovar esta voz
                  </button>
                </div>
              )}
              {c?.avatar && (
                <Situacao
                  tom={c.avatar.estado === "pronto" ? "ok" : c.avatar.estado === "falhou" ? "erro" : c.avatar.estado === "consentimento" ? "espera" : "andando"}
                  texto={
                    {
                      enviando: "Enviando o vídeo para treinar o seu gêmeo...",
                      treinando: "Treinando o seu gêmeo com o vídeo: rosto, gestos e boca. Leva alguns minutos.",
                      consentimento: "Treinado. Falta você confirmar pela câmera, no último passo acima.",
                      pronto: "Gêmeo treinado com os seus gestos. Os vídeos saem por ele.",
                      falhou: `${c.avatar.motivo ?? "O gerador não treinou o gêmeo."} Os vídeos continuam saindo pela imagem do vídeo de treino.`,
                    }[c.avatar.estado]
                  }
                />
              )}
              {c?.avatar && c.avatar.estado !== "pronto" && c.avatar.estado !== "falhou" && ativo && (
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Enquanto isso, você já pode gerar vídeos: eles saem pela imagem do vídeo de treino.
                </p>
              )}
            </div>
          </div>
          {/* MELHORAR A VOZ (04/10): a voz clonada de um texto lido soa menos
              natural que a de uma conversa. A amostra nova vira candidata: a
              aprovada continua nos vídeos até a pessoa ouvir e aprovar a nova. */}
          <div className="flex flex-col gap-2 rounded-lg border px-4 py-3" style={{ borderColor: "var(--border)" }}>
            <p className="flex items-start gap-2 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              <Headphones className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
              <span>
                <strong style={{ color: "var(--text-primary)" }}>Melhorar a voz.</strong> A voz clonada de um texto lido costuma soar menos natural.
                Para ficar mais parecida com você, envie de 2 a 4 minutos de você falando do seu jeito: uma conversa, uma aula, uma live, um
                áudio longo. A voz nova só entra nos vídeos depois que você ouvir e aprovar.
              </span>
            </p>
            <div className="flex flex-wrap items-start gap-3">
              <Gravador
                key={c?.voz?.amostraUrl ?? "sem-voz"}
                video={false}
                rotulo="Gravar falando do meu jeito"
                minSegundos={SEGUNDOS_MINIMOS_DA_VOZ}
                maxSegundos={SEGUNDOS_MAXIMOS_DA_VOZ}
                enviando={enviando === "voz"}
                onPronto={(blob) => void mandarVoz(blob, "gravada")}
              />
              <button
                type="button"
                disabled={Boolean(enviando)}
                onClick={() => entradaDeVoz.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
              >
                {enviando === "voz" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar um áudio ou vídeo
              </button>
              <input
                ref={entradaDeVoz}
                type="file"
                accept="audio/*,video/mp4,video/quicktime,video/webm"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void mandarVoz(f, "arquivo");
                }}
              />
            </div>
          </div>
        </Passo>
      )}

      {/* PASSO 3: GERAR */}
      <GerarVideo
        projectId={projectId}
        ativo={ativo}
        falta={falta}
        saldo={estado.saldo}
        acessoInterno={estado.acessoInterno}
        roteiroInicial={roteiroInicial}
        onPedido={() => recarregar()}
        gerador={estado.gerador ?? "omnihuman"}
        numero={legado || c?.treino?.estado === "valido" ? 3 : 2}
      />

      {estado.videos.length > 0 && <ListaDeVideos projectId={projectId} videos={estado.videos} onMudou={() => recarregar()} />}

      {c && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Revogar apaga o vídeo de treino, a voz clonada, o gêmeo treinado no fornecedor e a gravação da autorização. Fica só o registro de que você autorizou e
            revogou, com as datas.
          </p>
          <button
            type="button"
            disabled={Boolean(enviando)}
            onClick={() => void revogar()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/50 px-3 py-2 text-sm font-semibold text-red-400 disabled:opacity-50"
          >
            {enviando === "revogar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Revogar o meu gêmeo
          </button>
        </div>
      )}
    </div>
  );
}

function Passo({
  numero,
  Icone,
  titulo,
  pronto,
  children,
}: {
  numero: number;
  Icone: typeof Video;
  titulo: string;
  pronto?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
            pronto ? "bg-green-500/15 text-green-500" : "bg-orange-500/15 text-orange-400"
          )}
        >
          {pronto ? <CheckCircle2 className="h-4 w-4" /> : numero}
        </span>
        <Icone className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          {titulo}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Situacao({ tom, texto }: { tom: "ok" | "erro" | "andando" | "espera"; texto: string }) {
  const Icone = tom === "ok" ? CheckCircle2 : tom === "erro" ? AlertTriangle : tom === "espera" ? Clock : Loader2;
  return (
    <p className={cn("flex items-start gap-1.5 text-sm", tom === "ok" ? "text-green-500" : tom === "erro" ? "text-orange-400" : "")} style={tom === "andando" || tom === "espera" ? { color: "var(--text-muted)" } : undefined}>
      <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", tom === "andando" && "animate-spin")} />
      <span>{texto}</span>
    </p>
  );
}

function GerarVideo({
  projectId,
  ativo,
  falta,
  saldo,
  acessoInterno,
  roteiroInicial,
  onPedido,
  donoDaEquipe = null,
  gerador = "omnihuman",
  numero = 3,
}: {
  projectId: string;
  ativo: boolean;
  falta: string[];
  saldo: number;
  acessoInterno: boolean;
  roteiroInicial?: string | null;
  onPedido: () => Promise<void>;
  /** Nome do dono, quando quem vê é membro da equipe (01/10): muda a frase do saldo. */
  donoDaEquipe?: string | null;
  gerador?: IdDoGerador;
  numero?: number;
}) {
  const [roteiros, setRoteiros] = useState<RoteiroDaLinha[]>([]);
  const [escolhido, setEscolhido] = useState<string>(roteiroInicial ?? "");
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [pedindo, setPedindo] = useState(false);
  /** 03/10: "auto" escolhe o cenário de cada cena pelo roteiro; um id fixa o vídeo inteiro. */
  const [cenario, setCenario] = useState<EscolhaDeCenario>("auto");
  const router = useRouter();

  useEffect(() => {
    void (async () => {
      const r = await fetch(`/api/projects/${projectId}/linha-editorial`);
      const d = (await r.json().catch(() => ({}))) as { roteiros?: RoteiroDaLinha[] };
      const lista = (d.roteiros ?? []).filter((x) => Array.isArray(x.cenas) && x.cenas.length > 0 && x.status !== "descartada");
      setRoteiros(lista);
      const inicial = lista.find((x) => x.id === roteiroInicial);
      if (inicial) {
        setTexto(textoDasCenas(inicial.cenas));
        setTitulo(inicial.titulo);
      }
    })();
  }, [projectId, roteiroInicial]);

  const preco = useMemo(() => precoDoRoteiro(texto, gerador), [texto, gerador]);

  /**
   * AS CENAS COM O SEU CENÁRIO. Roteiro da linha editorial com o texto
   * intocado: uma cena por cena do roteiro (com o papel e o que aparece na
   * tela, que é o que a escolha automática lê). Texto escrito ou mexido: um
   * parágrafo por cena.
   */
  const roteiro = roteiros.find((r) => r.id === escolhido) ?? null;
  const cenas: CenaDoGemeo[] = useMemo(() => {
    const doRoteiro = roteiro && limparTexto(textoDasCenas(roteiro.cenas)) === limparTexto(texto) ? roteiro.cenas.filter((x) => x.fala?.trim()) : null;
    const base = doRoteiro ?? texto.split(/\n\s*\n/).map((t) => ({ fala: t }));
    const lista = base.filter((x) => x.fala?.trim());
    const ids = cenariosDasCenas(lista, cenario);
    return lista.map((x, i) => ({ texto: limparTexto(x.fala ?? ""), cenario: ids[i] }));
  }, [roteiro, texto, cenario]);
  const edicao = preco.segundos ? creditosDoRoteiro(preco.segundos) : 0;
  const longo = preco.segundos > SEGUNDOS_MAXIMOS_DO_ROTEIRO;
  const curto = preco.segundos < SEGUNDOS_MINIMOS_DO_ROTEIRO;
  const semSaldo = !acessoInterno && preco.creditosReservados > saldo;

  async function pedir() {
    setPedindo(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto, titulo, roteiroId: escolhido || null, cenas }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui pedir o vídeo.");
      toast.success("Pedido feito. Acompanhe no escritório: a equipe já começou.");
      setTexto("");
      setTitulo("");
      setEscolhido("");
      await onPedido();
      // DIRETO PARA O ESCRITÓRIO (02/10, pedido do Bruno): a página dos
      // agentes mostra a geração passo a passo (voz, pedaços, junção) na mesma
      // linha do tempo da edição, com o aviso de que ele pode sair.
      router.push(`/projects/${projectId}/live`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui pedir o vídeo.");
    } finally {
      setPedindo(false);
    }
  }

  return (
    <Passo numero={numero} Icone={Clapperboard} titulo="Gerar um vídeo do gêmeo">
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
        Escolha um roteiro da sua linha editorial ou escreva o seu. O gêmeo fala o texto com a sua voz e o seu rosto, e o vídeo entra no
        Gestor como uma gravação sua: transcrição, roteiro para aprovar, cortes e edição, com a sua aprovação em cada passo.
      </p>
      <div className="flex flex-col gap-3">
        <select
          value={escolhido}
          onChange={(e) => {
            setEscolhido(e.target.value);
            const r = roteiros.find((x) => x.id === e.target.value);
            if (r) {
              setTexto(textoDasCenas(r.cenas));
              setTitulo(r.titulo);
            }
          }}
          className="max-w-[640px] rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        >
          <option value="">{roteiros.length ? "Escolher um roteiro da linha editorial..." : "Nenhum roteiro na linha editorial ainda: escreva abaixo"}</option>
          {roteiros.map((r) => (
            <option key={r.id} value={r.id}>
              {r.titulo}
              {r.status === "gravado" ? " (já gravado)" : ""}
            </option>
          ))}
        </select>
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título do vídeo (opcional)"
          className="max-w-[640px] rounded-lg border px-3 py-2 text-sm"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={7}
          placeholder="O que o seu gêmeo vai falar. Escreva como você fala: frases curtas, uma ideia por frase. Deixe uma linha em branco entre as cenas."
          className="rounded-lg border px-3 py-2 text-[15px] leading-relaxed"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
        {/* O CENÁRIO (03/10): onde o gêmeo aparece em cada cena. */}
        <label className="flex max-w-[640px] flex-col gap-1 text-sm" style={{ color: "var(--text-muted)" }}>
          Onde o seu gêmeo aparece
          <select
            value={cenario}
            onChange={(e) => setCenario(e.target.value as EscolhaDeCenario)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
          >
            <option value="auto">Pelo roteiro: close no gancho e no fechamento, outros planos no meio</option>
            {CENARIOS.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome} (plano {x.plano}) no vídeo inteiro
              </option>
            ))}
          </select>
        </label>
        {cenas.length > 1 && (
          <ol className="flex max-w-[640px] flex-col gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
            {cenas.map((x, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 font-semibold" style={{ color: "var(--text-primary)" }}>
                  Cena {i + 1}: {cenarioPorId(x.cenario).nome}
                </span>
                <span className="truncate">{x.texto}</span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {texto.trim() && (
        <div className="flex flex-col gap-1 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <p>
            <strong style={{ color: "var(--text-primary)" }}>
              Este roteiro de cerca de {duracaoFalada(preco.segundos)} custa {fmt(preco.creditosEstimados)} créditos
            </strong>{" "}
            ({creditosPorSegundo(gerador)} por segundo de vídeo, em {preco.pedacos} {preco.pedacos === 1 ? "pedaço" : "pedaços"}).
          </p>
          <p>
            Reservamos até {fmt(preco.creditosReservados)} e cobramos o tempo real da fala; o que sobrar volta na hora. Depois, a edição segue o
            preço de qualquer gravação (a primeira parte, cerca de {fmt(edicao)} créditos).
            {acessoInterno ? " Acesso interno: nada é debitado." : donoDaEquipe ? ` A equipe tem ${fmt(saldo)} créditos.` : ` Você tem ${fmt(saldo)} créditos.`}
          </p>
          {longo && <p className="text-orange-400">O gêmeo fala até {duracaoFalada(SEGUNDOS_MAXIMOS_DO_ROTEIRO)} por vídeo. Divida este roteiro em dois.</p>}
          {semSaldo && (
            <p className="text-orange-400">
              {donoDaEquipe
                ? fraseDosCreditosDaEquipe(donoDaEquipe, { necessario: preco.creditosReservados, disponivel: saldo })
                : "O seu saldo não cobre a reserva deste vídeo."}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={!ativo || !texto.trim() || longo || curto || semSaldo || pedindo}
          onClick={() => void pedir()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pedindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clapperboard className="h-4 w-4" />}
          {texto.trim() && !longo && !curto ? `Gerar o vídeo (${fmt(preco.creditosEstimados)} créditos)` : "Gerar o vídeo"}
        </button>
        {!ativo && (
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            {donoDaEquipe
              ? `Disponível quando ${donoDaEquipe} terminar o cadastro do gêmeo.`
              : `Disponível quando o gêmeo estiver pronto (falta: ${falta.join(", ")}).`}
          </span>
        )}
        <Link href={`/projects/${projectId}/linha-editorial`} className="text-sm font-semibold text-orange-400 hover:underline">
          Abrir a linha editorial
        </Link>
      </div>
    </Passo>
  );
}

const ROTULO: Record<VideoNaTela["estado"], string> = {
  "na-fila": "Na fila",
  falando: "Falando com a sua voz",
  gerando: "Gerando o vídeo",
  juntando: "Juntando os pedaços",
  juntado: "Entrando no Gestor",
  "na-esteira": "No Gestor",
  falhou: "Não deu certo",
  cancelada: "Cancelado",
};

function ListaDeVideos({ projectId, videos, onMudou }: { projectId: string; videos: VideoNaTela[]; onMudou: () => Promise<void> }) {
  async function cancelar(id: string) {
    const r = await fetch(`/api/projects/${projectId}/gemeo/videos?video=${encodeURIComponent(id)}`, { method: "DELETE" });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) toast.error(d.error ?? "Não consegui cancelar.");
    else toast.success("Cancelado. Os créditos voltaram.");
    await onMudou();
  }
  return (
    <section className="flex flex-col gap-3 rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
      <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
        Vídeos do gêmeo
      </h2>
      <ul className="flex flex-col divide-y divide-[var(--border)]">
        {videos.map((v) => {
          const andando = videoEmAndamento(v);
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
              {/* min-w de 14rem: com min-w-0 o selo e o link roubavam a largura e o
                  título virava "Se ..." no celular (03/10); assim eles descem. */}
              <div className="min-w-[min(100%,14rem)] flex-1">
                <p className="line-clamp-2 break-words font-medium" style={{ color: "var(--text-primary)" }}>
                  {v.titulo}
                </p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {new Date(v.criadoEm).toLocaleString("pt-BR")} · cerca de {duracaoFalada(v.segundosDaFala ?? v.segundosEstimados)}
                  {v.creditosCobrados != null ? ` · ${fmt(v.creditosCobrados)} créditos` : ` · ${fmt(v.creditosReservados)} reservados`}
                  {v.creditosDevolvidos ? ` · ${fmt(v.creditosDevolvidos)} devolvidos` : ""}
                </p>
                {v.motivo && <p className="text-xs text-orange-400">{v.motivo}</p>}
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                  v.estado === "na-esteira" ? "bg-green-500/15 text-green-500" : v.estado === "falhou" || v.estado === "cancelada" ? "bg-red-500/10 text-red-400" : "bg-orange-500/15 text-orange-400"
                )}
              >
                {andando && <Loader2 className="h-3 w-3 animate-spin" />}
                {ROTULO[v.estado]}
                {v.estado === "gerando" ? ` (${v.pedacosProntos} de ${v.pedacos})` : ""}
              </span>
              {v.estado === "na-fila" && (
                <button type="button" onClick={() => void cancelar(v.id)} className="text-xs font-semibold hover:underline" style={{ color: "var(--text-muted)" }}>
                  Cancelar
                </button>
              )}
              {(v.estado === "na-esteira" || andando) && (
                <Link href={`/projects/${projectId}/live`} className="inline-flex items-center gap-1 text-sm font-semibold text-orange-400 hover:underline">
                  Acompanhar no escritório <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        O gêmeo grava em até {Math.ceil((segundosDaEtapa("gemeoVoz", null) + segundosDaEtapa("gemeoPedacos", null) + segundosDaEtapa("gemeoJuntar", null)) / 60)} minutos
        (os pedaços são gerados ao mesmo tempo), e depois o vídeo entra na edição. Pode fechar esta página: avisamos aqui e por e-mail
        quando precisarmos de você ou quando estiver pronto.
      </p>
    </section>
  );
}
