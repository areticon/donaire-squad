"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { segundosDaEtapa } from "@/lib/media/tempos-medidos";
import { upload } from "@vercel/blob/client";
import {
  Camera,
  Mic,
  ShieldCheck,
  Clapperboard,
  Plus,
  X,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Upload,
  Trash2,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CREDITOS_POR_SEGUNDO_DE_GEMEO,
  MAX_FOTOS,
  SEGUNDOS_MAXIMOS_DA_VOZ,
  SEGUNDOS_MAXIMOS_DO_ROTEIRO,
  SEGUNDOS_MINIMOS_DA_VOZ,
  SEGUNDOS_MINIMOS_DO_ROTEIRO,
  TEXTO_PARA_LER_DA_VOZ,
  duracaoFalada,
  fraseDaAutorizacao,
  gemeoAtivo,
  oQueFalta,
  precoDoRoteiro,
  textoDasCenas,
  videoEmAndamento,
  type CadastroDoGemeo,
  type VideoNaTela,
} from "@/lib/media/gemeo";
import { creditosDoRoteiro } from "@/lib/media/limits";
import { Gravador } from "@/components/gemeo/gravador";
import { fraseDosCreditosDaEquipe } from "@/lib/equipe/regras";

/**
 * A TELA DO GÊMEO DIGITAL (01/10/2026): o cadastro e os vídeos, numa página.
 *
 * Melhora a porta "em teste" de 29/09 mantendo o desenho aprovado dos três
 * passos (fotos, voz, autorização gravada pela própria pessoa) e acrescenta o
 * quarto, que é o motivo de tudo: gerar um vídeo a partir de um roteiro. O
 * preço aparece ANTES do clique, na mesma conta que o servidor cobra
 * (`lib/media/gemeo.ts`).
 *
 * Esta tela nunca chama fornecedor pago: ela envia arquivos ao storage e
 * grava pedidos. Quem recorta, converte, confere, clona e gera é o passo do
 * cron, e a tela pergunta o estado a cada poucos segundos enquanto há algo
 * andando.
 */

type Estado = {
  cadastro: CadastroDoGemeo | null;
  videos: VideoNaTela[];
  saldo: number;
  acessoInterno: boolean;
  nome: string;
  projeto: string;
  /**
   * MEMBRO DA EQUIPE (01/10, acabamento): o cadastro (rosto, voz e a
   * autorização) é de quem administra a conta, e a revogação também. O membro
   * pede vídeos ao gêmeo pronto. Null para o dono.
   */
  equipe?: { dono: string } | null;
};

type RoteiroDaLinha = { id: string; titulo: string; status: string; cenas: Array<{ fala?: string }> };

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
  const [nomeDaAutorizacao, setNomeDaAutorizacao] = useState(inicial.cadastro?.autorizacao?.nome ?? inicial.nome ?? "");
  const entradaDeFoto = useRef<HTMLInputElement | null>(null);
  const entradaDeVoz = useRef<HTMLInputElement | null>(null);
  const c = estado.cadastro;
  const arquivo = (u?: string | null) => (u ? `/api/projects/${projectId}/gemeo/arquivo?u=${encodeURIComponent(u)}` : "");

  const recarregar = useCallback(async () => {
    const r = await fetch(`/api/projects/${projectId}/gemeo`, { cache: "no-store" });
    if (r.ok) setEstado((await r.json()) as Estado);
  }, [projectId]);

  // Pergunta enquanto algo anda do lado do servidor.
  const andando = useMemo(() => {
    const cad = estado.cadastro;
    return Boolean(
      cad?.foto?.estado === "preparando" ||
        cad?.foto?.estado === "falhou" ||
        ["convertendo", "clonando", "esperando", "sem-permissao", "falhou"].includes(cad?.voz?.estado ?? "") ||
        cad?.autorizacao?.estado === "conferindo" ||
        estado.videos.some(videoEmAndamento)
    );
  }, [estado]);
  useEffect(() => {
    if (!andando) return;
    const t = setInterval(() => void recarregar(), 6000);
    return () => clearInterval(t);
  }, [andando, recarregar]);

  async function enviar(tipo: "foto" | "voz" | "autorizacao", blob: Blob, corpo: Record<string, unknown>) {
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

  async function mandarFotos(lista: FileList | null) {
    if (!lista?.length) return;
    const livres = MAX_FOTOS - (c?.fotos.length ?? 0);
    const fotos = Array.from(lista).slice(0, Math.max(0, livres));
    if (!fotos.length) return toast.error(`São no máximo ${MAX_FOTOS} fotos.`);
    setEnviando("foto");
    try {
      for (const f of fotos) {
        if (f.size > 15 * 1024 * 1024) {
          toast.error(`${f.name} passa de 15 MB.`);
          continue;
        }
        await enviar("foto", f, { nome: f.name });
      }
      toast.success("Fotos recebidas. Escolhendo a melhor para o gêmeo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar a foto.");
    } finally {
      setEnviando(null);
      if (entradaDeFoto.current) entradaDeFoto.current.value = "";
    }
  }

  async function tirarFoto(url: string) {
    setEnviando("foto");
    try {
      await fetch(`/api/projects/${projectId}/gemeo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "remover-foto", url }),
      });
      await recarregar();
    } finally {
      setEnviando(null);
    }
  }

  async function mandarVoz(blob: Blob, origem: "gravada" | "arquivo") {
    setEnviando("voz");
    try {
      await enviar("voz", blob, { origem });
      toast.success("Voz recebida. Conferindo a duração e a qualidade.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar a voz.");
    } finally {
      setEnviando(null);
      if (entradaDeVoz.current) entradaDeVoz.current.value = "";
    }
  }

  async function mandarAutorizacao(blob: Blob, segundos: number) {
    setEnviando("autorizacao");
    try {
      await enviar("autorizacao", blob, { nome: nomeDaAutorizacao, segundos });
      toast.success("Autorização recebida. Conferindo se a frase foi dita.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar a autorização.");
    } finally {
      setEnviando(null);
    }
  }

  async function revogar() {
    if (!window.confirm("Revogar o seu gêmeo digital? As fotos, a voz clonada e a autorização serão apagadas. Os vídeos que já estão no Gestor continuam lá.")) return;
    setEnviando("revogar");
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Gêmeo revogado. Apagamos as fotos, a voz e a autorização.");
      await recarregar();
    } catch {
      toast.error("Não consegui revogar agora. Tente de novo.");
    } finally {
      setEnviando(null);
    }
  }

  const ativo = gemeoAtivo(c);
  const falta = oQueFalta(c);
  const frase = fraseDaAutorizacao(nomeDaAutorizacao, estado.projeto);
  const doMembro = estado.equipe ?? null;

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
                <strong style={{ color: "var(--text-primary)" }}>O gêmeo deste projeto ainda não está pronto.</strong> As fotos, a voz e a
                autorização são cadastradas por {doMembro.dono}, que administra a conta.
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
          onPedido={recarregar}
          donoDaEquipe={doMembro.dono}
        />
        {estado.videos.length > 0 && <ListaDeVideos projectId={projectId} videos={estado.videos} onMudou={recarregar} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* O RESUMO: pronto, ou o que falta. */}
      <div
        className="flex items-start gap-3 rounded-xl border px-4 py-3"
        style={{ background: "var(--bg-elevated)", borderColor: ativo ? "rgb(34 197 94 / 0.4)" : "var(--border)" }}
      >
        {ativo ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" /> : <Clock className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />}
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {ativo ? (
            <>
              <strong style={{ color: "var(--text-primary)" }}>O seu gêmeo está pronto.</strong> Escolha um roteiro no passo 4 e ele grava por você.
            </>
          ) : (
            <>
              <strong style={{ color: "var(--text-primary)" }}>Para o gêmeo ficar pronto, falta:</strong> {falta.join(", ")}. Os passos podem ser feitos em
              qualquer ordem; a voz só é clonada depois que a autorização valer.
            </>
          )}
        </p>
      </div>

      {/* PASSO 1: AS FOTOS */}
      <Passo numero={1} Icone={Camera} titulo="Fotos suas" pronto={c?.foto?.estado === "pronta"}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          De 1 a {MAX_FOTOS} fotos de frente, com boa luz, só você na imagem, do jeito que você aparece para os seus clientes. A
          plataforma escolhe a melhor e recorta em volta do rosto.
        </p>
        <div className="flex flex-wrap gap-3">
          {(c?.fotos ?? []).map((f, i) => {
            const aval = c?.foto?.avaliacoes?.find((a) => a.indice === i);
            const escolhida = c?.foto?.estado === "pronta" && c.foto.escolhida === i;
            return (
              <div key={f.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={arquivo(f.url)}
                  alt={`Foto ${i + 1}`}
                  className={cn("h-28 w-28 rounded-lg border object-cover", escolhida && "ring-2 ring-orange-500")}
                  style={{ borderColor: "var(--border)" }}
                />
                <button
                  type="button"
                  aria-label="Tirar foto"
                  disabled={Boolean(enviando)}
                  onClick={() => void tirarFoto(f.url)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                {escolhida && <span className="absolute bottom-1 left-1 rounded bg-orange-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">escolhida</span>}
                {aval?.motivo && <p className="mt-1 w-28 text-[11px] leading-tight text-orange-400">{aval.motivo}</p>}
              </div>
            );
          })}
          {(c?.fotos.length ?? 0) < MAX_FOTOS && (
            <button
              type="button"
              disabled={Boolean(enviando)}
              onClick={() => entradaDeFoto.current?.click()}
              className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-xs disabled:opacity-50"
              style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
            >
              {enviando === "foto" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
              {enviando === "foto" ? "Enviando..." : "Adicionar"}
            </button>
          )}
          <input ref={entradaDeFoto} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => void mandarFotos(e.target.files)} />
        </div>
        {c?.foto && (
          <div className="flex items-center gap-3">
            {c.foto.estado === "pronta" && c.foto.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={arquivo(c.foto.url)} alt="Foto do gerador" className="h-20 w-20 rounded-lg object-cover" />
            )}
            <Situacao
              tom={c.foto.estado === "pronta" ? "ok" : c.foto.estado === "recusada" ? "erro" : "andando"}
              texto={
                c.foto.estado === "pronta"
                  ? "Esta é a foto que o gêmeo vai animar: recortada no rosto, em quadrado."
                  : c.foto.estado === "recusada"
                    ? c.foto.motivo ?? "Nenhuma foto serviu."
                    : c.foto.estado === "falhou"
                      ? c.foto.motivo ?? "Tentando de novo."
                      : "Escolhendo a melhor foto e recortando no rosto..."
              }
            />
          </div>
        )}
      </Passo>

      {/* PASSO 2: A VOZ */}
      <Passo numero={2} Icone={Mic} titulo="De 2 a 4 minutos da sua voz" pronto={c?.voz?.estado === "pronta"}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          A voz mais natural sai de você falando de verdade, não lendo. O melhor é enviar um áudio ou trecho de vídeo seu de 2 a 4 minutos,
          só com a sua voz, sem música e sem outra pessoa (uma aula, uma live, uma reunião gravada). Se não tiver, grave pelo navegador lendo o
          texto abaixo em voz alta, sem pressa, num lugar silencioso, por pelo menos 1 minuto.
        </p>
        <blockquote className="rounded-lg border px-4 py-3 text-[15px] leading-relaxed" style={{ borderColor: "var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
          {TEXTO_PARA_LER_DA_VOZ}
        </blockquote>
        <div className="flex flex-wrap items-start gap-4">
          <Gravador
            // Remonta depois do envio: o gravador volta ao começo em vez de
            // continuar oferecendo "Usar esta gravação" para o que já foi.
            key={c?.voz?.amostraUrl ?? "sem-voz"}
            video={false}
            rotulo={c?.voz ? "Gravar de novo" : "Gravar pelo navegador"}
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
            <Upload className="h-4 w-4" /> Enviar um arquivo
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
        {c?.voz && (
          <div className="flex flex-col gap-2">
            {c.voz.mp3Url && <audio src={arquivo(c.voz.mp3Url)} controls className="w-full max-w-[520px]" />}
            <Situacao
              tom={c.voz.estado === "pronta" ? "ok" : ["curta", "falhou"].includes(c.voz.estado) ? "erro" : c.voz.estado === "sem-permissao" ? "espera" : "andando"}
              texto={
                {
                  convertendo: "Conferindo a gravação...",
                  curta: c.voz.motivo ?? "A gravação ficou curta.",
                  esperando: `Amostra de ${duracaoFalada(c.voz.segundos ?? 0)} recebida. A voz é clonada assim que a sua autorização valer (passo 3).`,
                  clonando: "Clonando a sua voz...",
                  "sem-permissao": c.voz.motivo ?? "Esperando o fornecedor de voz liberar a clonagem.",
                  pronta: `Voz clonada a partir de ${duracaoFalada(c.voz.segundos ?? 0)} de gravação.`,
                  falhou: c.voz.motivo ?? "Não consegui clonar a voz.",
                }[c.voz.estado]
              }
            />
          </div>
        )}
      </Passo>

      {/* PASSO 3: A AUTORIZAÇÃO */}
      <Passo numero={3} Icone={ShieldCheck} titulo="A sua autorização, gravada por você" pronto={c?.autorizacao?.estado === "valida"}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Com a câmera aberta, leia a frase com o seu nome. É isso que garante que ninguém crie um gêmeo com o rosto ou a voz de outra
          pessoa: a lei só permite usar a imagem e a voz de alguém com a autorização dela (Código Civil, art. 20). Guardamos o vídeo, a
          data e o texto lido. Você pode revogar quando quiser, e tudo é apagado.
        </p>
        {/* O ACEITE DAS REGRAS DO GÊMEO (01/10/2026). Uma frase, sem caixa de
            marcar: gravar a autorização já é o ato de aceite, e o fluxo dos
            três passos não muda. O link leva direto à seção do gêmeo nos
            Termos, onde estão a proibição de clonar outra pessoa, figura
            pública ou menor, e as consequências. */}
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Ao gravar, você declara que o rosto e a voz são seus e aceita as{" "}
          <Link href="/terms#gemeo" target="_blank" className="font-semibold text-orange-400 underline-offset-2 hover:underline">
            regras do gêmeo digital nos Termos de Uso
          </Link>
          : é proibido clonar outra pessoa, figura pública ou menor, e você responde pelo que gerar e publicar.
        </p>
        <label className="flex max-w-[520px] flex-col gap-1 text-sm" style={{ color: "var(--text-muted)" }}>
          O seu nome completo
          <input
            value={nomeDaAutorizacao}
            onChange={(e) => setNomeDaAutorizacao(e.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
          />
        </label>
        <blockquote className="max-w-[640px] rounded-lg border-l-4 border-orange-500 px-4 py-3 text-base font-medium leading-relaxed" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
          &ldquo;{frase}&rdquo;
        </blockquote>
        {nomeDaAutorizacao.trim().length >= 3 ? (
          <Gravador
            key={c?.autorizacao?.videoUrl ?? "sem-autorizacao"}
            video
            rotulo={c?.autorizacao ? "Gravar a autorização de novo" : "Abrir a câmera e gravar"}
            minSegundos={5}
            maxSegundos={60}
            enviando={enviando === "autorizacao"}
            onPronto={(blob, s) => void mandarAutorizacao(blob, s)}
          />
        ) : (
          <p className="text-sm text-orange-400">Escreva o seu nome completo para liberar a gravação.</p>
        )}
        {c?.autorizacao && (
          <div className="flex flex-col gap-2">
            <video src={arquivo(c.autorizacao.videoUrl)} controls playsInline className="aspect-video w-full max-w-[360px] rounded-lg bg-black" />
            <Situacao
              tom={c.autorizacao.estado === "valida" ? "ok" : c.autorizacao.estado === "recusada" ? "erro" : "andando"}
              texto={
                c.autorizacao.estado === "valida"
                  ? `Autorização de ${c.autorizacao.nome}, gravada em ${new Date(c.autorizacao.gravadaEm).toLocaleString("pt-BR")}.`
                  : c.autorizacao.estado === "recusada"
                    ? c.autorizacao.motivo ?? "A gravação não valeu. Grave de novo."
                    : "Conferindo se a frase foi dita..."
              }
            />
          </div>
        )}
      </Passo>

      {/* PASSO 4: GERAR */}
      <GerarVideo projectId={projectId} ativo={ativo} falta={falta} saldo={estado.saldo} acessoInterno={estado.acessoInterno} roteiroInicial={roteiroInicial} onPedido={recarregar} />

      {estado.videos.length > 0 && <ListaDeVideos projectId={projectId} videos={estado.videos} onMudou={recarregar} />}

      {c && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Revogar apaga as fotos, a voz clonada no fornecedor e a gravação da autorização. Fica só o registro de que você autorizou e
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
  Icone: typeof Camera;
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
}) {
  const [roteiros, setRoteiros] = useState<RoteiroDaLinha[]>([]);
  const [escolhido, setEscolhido] = useState<string>(roteiroInicial ?? "");
  const [texto, setTexto] = useState("");
  const [titulo, setTitulo] = useState("");
  const [pedindo, setPedindo] = useState(false);
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

  const preco = useMemo(() => precoDoRoteiro(texto), [texto]);
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
        body: JSON.stringify({ texto, titulo, roteiroId: escolhido || null }),
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
    <Passo numero={4} Icone={Clapperboard} titulo="Gerar um vídeo do gêmeo">
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
          placeholder="O que o seu gêmeo vai falar. Escreva como você fala: frases curtas, uma ideia por frase."
          className="rounded-lg border px-3 py-2 text-[15px] leading-relaxed"
          style={{ borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-primary)" }}
        />
      </div>

      {texto.trim() && (
        <div className="flex flex-col gap-1 rounded-lg px-4 py-3 text-sm" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
          <p>
            <strong style={{ color: "var(--text-primary)" }}>
              Este roteiro de cerca de {duracaoFalada(preco.segundos)} custa {fmt(preco.creditosEstimados)} créditos
            </strong>{" "}
            ({CREDITOS_POR_SEGUNDO_DE_GEMEO} por segundo de vídeo, em {preco.pedacos} {preco.pedacos === 1 ? "pedaço" : "pedaços"}).
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
      <ul className="flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
        {videos.map((v) => {
          const andando = videoEmAndamento(v);
          return (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" style={{ color: "var(--text-primary)" }}>
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
