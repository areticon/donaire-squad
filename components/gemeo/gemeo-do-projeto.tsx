"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { segundosDaEtapa } from "@/lib/media/tempos-medidos";
import { upload } from "@vercel/blob/client";
import {
  Video,
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
  RefreshCw,
  Camera,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BotaoDescartar, Descartavel } from "@/components/ui/descartar";
import { chaveDaSituacaoDoGemeo, chaveDoResumoDoGemeo, ocorrenciaDoGemeo } from "@/lib/avisos/chaves";
import {
  CENARIOS,
  LADO_MINIMO_DA_FOTO,
  ORIENTACOES_DA_FOTO,
  SEGUNDOS_MAXIMOS_DA_VOZ,
  SEGUNDOS_MAXIMOS_DO_ROTEIRO,
  SEGUNDOS_MAXIMOS_DO_TREINO,
  SEGUNDOS_MINIMOS_DA_VOZ,
  SEGUNDOS_MINIMOS_DO_ROTEIRO,
  SEGUNDOS_MINIMOS_DO_TREINO,
  autorizacaoValida,
  cenarioPorId,
  cenariosDasCenas,
  creditosPorSegundo,
  duracaoFalada,
  fraseDaAutorizacao,
  gemeoAtivo,
  geradorTemCenarios,
  limparTexto,
  oQueFalta,
  precoDoRoteiro,
  resolucaoDaFoto,
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
 * 05/10: O CADASTRO VOLTA A SER FOTO + VOZ + AUTORIZAÇÃO (decisão do Bruno,
 * depois de ver o gêmeo pelo quadro do vídeo de treino sair envelhecido e com
 * a mão deformada). Uma foto só, de alta qualidade, com orientações na tela e
 * checagem de resolução antes de enviar (o rosto e o enquadramento são
 * conferidos pelo servidor); a amostra de voz como já existia; e a autorização
 * gravada pela câmera em 15 s. O vídeo de treino de 03/10 continua, como
 * caminho AVANÇADO e opcional: é ele que cria o gêmeo treinado com os gestos
 * da pessoa (HeyGen, uma vaga por conta).
 *
 * O preço aparece ANTES do clique, na mesma conta que o servidor cobra
 * (`lib/media/gemeo.ts`), com o gerador que o servidor diz valer para o
 * projeto. Esta tela nunca chama fornecedor pago: ela envia arquivos ao
 * storage e grava pedidos. Quem confere, clona, cria o avatar e gera é o
 * passo do cron, e a tela pergunta o estado a cada poucos segundos enquanto
 * há algo andando.
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
  /** 05/10: o erro do fornecedor por extenso, só para admin. */
  erroTecnico?: string | null;
};

type RoteiroDaLinha = { id: string; titulo: string; status: string; cenas: Array<{ fala?: string; naTela?: string; papel?: string }> };

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

/** A autorização gravada pela câmera: a frase leva uns 12 s lida com calma. */
const SEGUNDOS_MINIMOS_DA_AUTORIZACAO = 5;
const SEGUNDOS_MAXIMOS_DA_AUTORIZACAO = 60;

function extensao(tipo: string): string {
  const t = tipo.split(";")[0];
  return (
    { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav", "video/webm": "webm", "video/mp4": "mp4" } as Record<string, string>
  )[t] ?? "bin";
}

/** As medidas da foto no navegador, antes de enviar (null quando o navegador não lê o arquivo). */
async function medirImagem(arquivo: Blob): Promise<{ largura: number; altura: number } | null> {
  try {
    const bmp = await createImageBitmap(arquivo);
    const medidas = { largura: bmp.width, altura: bmp.height };
    bmp.close();
    return medidas;
  } catch {
    return null;
  }
}

export function GemeoDoProjeto({ projectId, inicial, roteiroInicial }: { projectId: string; inicial: Estado; roteiroInicial?: string | null }) {
  const [estado, setEstado] = useState<Estado>(inicial);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [nomeDaAutorizacao, setNomeDaAutorizacao] = useState(
    inicial.cadastro?.autorizacao?.nome ?? inicial.cadastro?.treino?.nome ?? inicial.nome ?? ""
  );
  const [avancado, setAvancado] = useState(() => Boolean(inicial.cadastro?.treino || inicial.cadastro?.avatar));
  const entradaDeFoto = useRef<HTMLInputElement | null>(null);
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
        // 05/10: o gêmeo de foto sendo criado no gerador.
        cad?.avatarFoto?.estado === "criando" ||
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

  async function enviar(tipo: "foto" | "voz" | "autorizacao" | "treino", blob: Blob, corpo: Record<string, unknown>) {
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

  /**
   * A FOTO (05/10): uma só, de alta qualidade. A resolução é conferida aqui,
   * antes de subir (foto pequena nem sai do navegador); rosto e enquadramento,
   * no servidor. A nova substitui a anterior (`unica`).
   */
  async function mandarFoto(f: File) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) return toast.error("Envie a foto em JPG, PNG ou WebP.");
    if (f.size > 15 * 1024 * 1024) return toast.error("A foto passa de 15 MB. Envie uma versão um pouco menor (sem reduzir abaixo de 1024 px).");
    setEnviando("foto");
    try {
      const m = await medirImagem(f);
      if (m) {
        const r = resolucaoDaFoto(m.largura, m.altura);
        if (r.resultado === "erro") return toast.error(r.texto, { duration: 8000 });
      }
      await enviar("foto", f, { nome: f.name.slice(0, 120), unica: true });
      toast.success("Foto recebida. Conferindo rosto e enquadramento.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar a foto.");
    } finally {
      setEnviando(null);
      if (entradaDeFoto.current) entradaDeFoto.current.value = "";
    }
  }

  /** A amostra de fala natural (01/10): a voz é clonada dela depois da autorização valer. */
  async function mandarVoz(blob: Blob, origem: "gravada" | "arquivo") {
    if (blob.size > 300 * 1024 * 1024) return toast.error("O arquivo passa de 300 MB. Envie um trecho de 2 a 4 minutos.");
    setEnviando("voz");
    try {
      await enviar("voz", blob, { origem });
      toast.success(c?.vozAprovada ? "Recebido. Clonamos a voz nova e preparamos uma amostra para você ouvir antes de usar." : "Recebido. A voz é clonada assim que a autorização valer, e você ouve antes de aprovar.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar o áudio.");
    } finally {
      setEnviando(null);
      if (entradaDeVoz.current) entradaDeVoz.current.value = "";
    }
  }

  /** A autorização pela câmera (01/10, de volta em 05/10): a frase dita pela própria pessoa. */
  async function mandarAutorizacao(blob: Blob, segundos: number) {
    setEnviando("autorizacao");
    try {
      await enviar("autorizacao", blob, { nome: nomeDaAutorizacao, segundos });
      toast.success("Gravação recebida. Conferindo se a frase foi dita.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui enviar a gravação.");
    } finally {
      setEnviando(null);
    }
  }

  /** O vídeo de treino, gravado aqui ou enviado do celular (03/10; avançado desde 05/10). */
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

  /** 05/10: o gêmeo treinado ficou sem vaga na HeyGen; reabre o pedido. */
  async function tentarDeNovo() {
    setEnviando("tentar-de-novo");
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "tentar-de-novo" }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) throw new Error(d.error ?? "Não consegui tentar agora.");
      toast.success("Pedimos o seu gêmeo de novo. Avisamos quando ficar pronto.");
      await recarregar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui tentar agora.");
    } finally {
      setEnviando(null);
    }
  }

  async function revogar() {
    if (!window.confirm("Revogar o seu gêmeo digital? A foto, a voz clonada, o gêmeo no gerador, o vídeo de treino e a autorização serão apagados. Os vídeos que já estão no Gestor continuam lá.")) return;
    setEnviando("revogar");
    try {
      const r = await fetch(`/api/projects/${projectId}/gemeo`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      toast.success("Gêmeo revogado. Apagamos a foto, a voz, o vídeo de treino e a autorização.");
      await recarregar();
    } catch {
      toast.error("Não consegui revogar agora. Tente de novo.");
    } finally {
      setEnviando(null);
    }
  }

  const ativo = gemeoAtivo(c);
  const falta = oQueFalta(c);
  const doMembro = estado.equipe ?? null;
  const nomeOk = nomeDaAutorizacao.trim().length >= 3;
  // 03/10: o estado do gêmeo numa frase, o mesmo das Configurações e dos avisos.
  const situacao = situacaoDoGemeo(c);
  // O ÚLTIMO PASSO (03/10): do vídeo de treino aceito até a confirmação no
  // gerador, na mesma sequência da tela, para o cadastro parecer um passo só.
  const ultimoPasso = c?.treino?.estado === "valido" && (esperandoGerador || faltaUmPasso(situacao));
  const renovou = (cad: CadastroDoGemeo | null) => {
    if (cad) setEstado((e) => ({ ...e, cadastro: cad }));
    else void recarregar();
  };
  const fotoPronta = c?.foto?.estado === "pronta" && Boolean(c.foto.url);
  const autorizada = autorizacaoValida(c);
  const gerador = estado.gerador ?? "omnihuman";

  // MEMBRO DA EQUIPE: sem o cadastro e sem revogar. Ele vê se o gêmeo está
  // pronto e pede o vídeo; quem cadastra é o dono (01/10).
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
                <strong style={{ color: "var(--text-primary)" }}>O gêmeo deste projeto ainda não está pronto.</strong> A foto, a voz e a autorização são
                de {doMembro.dono}, que administra a conta.
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
          gerador={gerador}
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
      {/* O resumo se descarta (07/10): a seção do passo que falta, logo
          abaixo, é a ação, e continua. */}
      <Descartavel chave={chaveDoResumoDoGemeo(projectId, ultimoPasso ? "ultimo-passo" : ativo ? "pronto" : "falta", ocorrenciaDoGemeo(c))}>
      {ultimoPasso ? (
        <div
          className="flex items-start gap-3 rounded-xl border px-4 py-3"
          style={{ background: "var(--bg-elevated)", borderColor: "rgb(249 115 22 / 0.55)" }}
        >
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-orange-400" />
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            <strong style={{ color: "var(--text-primary)" }}>Falta o último passo do gêmeo treinado: confirmar pela câmera (30 s).</strong>{" "}
            <a href="#ultimo-passo" className="font-semibold text-orange-400 underline-offset-2 hover:underline">
              Ir para o último passo
            </a>
          </p>
          <BotaoDescartar compacto className="ml-auto" />
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
          <BotaoDescartar compacto className="ml-auto" />
        </div>
      )}
      </Descartavel>

      {/* PASSO 1: A FOTO (05/10). Uma só, de alta qualidade: é ela que o
          gerador anima, e a foto decide metade do resultado. */}
      <Passo numero={1} Icone={Camera} titulo="Uma foto do seu rosto" pronto={fotoPronta}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          O gêmeo é gerado a partir desta foto: é o seu rosto em todos os vídeos. Quanto melhor a foto, mais parecido e mais natural ele
          sai. Como tirar:
        </p>
        <ul className="flex flex-col gap-1 pl-5 text-sm leading-relaxed" style={{ color: "var(--text-muted)", listStyle: "disc" }}>
          {ORIENTACOES_DA_FOTO.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-start gap-4">
          {(c?.foto?.url || c?.fotos?.[0]?.url) && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={arquivo(c.foto?.estado === "pronta" && c.foto.url ? c.foto.url : c.fotos[0]?.url)}
              alt="A sua foto"
              className="h-36 w-36 rounded-lg object-cover"
              style={{ background: "var(--bg-elevated)" }}
            />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={Boolean(enviando)}
                onClick={() => entradaDeFoto.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {enviando === "foto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {fotoPronta || c?.fotos?.length ? "Trocar a foto" : "Enviar a minha foto"}
              </button>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                JPG, PNG ou WebP, até 15 MB, pelo menos {LADO_MINIMO_DA_FOTO} px no lado menor.
              </span>
              <input
                ref={entradaDeFoto}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void mandarFoto(f);
                }}
              />
            </div>
            {c?.foto?.estado === "preparando" && <Situacao tom="andando" texto="Conferindo a foto: resolução, rosto e enquadramento..." />}
            {c?.foto?.estado === "falhou" && <Situacao tom="andando" texto={c.foto.motivo ?? "Conferindo a foto de novo em instantes..."} />}
            {(c?.foto?.checagens ?? []).map((k) => (
              <Situacao key={k.id} tom={k.resultado === "ok" ? "ok" : k.resultado === "aviso" ? "espera" : "erro"} texto={k.texto} />
            ))}
            {c?.foto?.estado === "recusada" && (
              <>
                {!c.foto.checagens?.length && <Situacao tom="erro" texto={c.foto.motivo ?? "A foto não serviu."} chave={chaveDaSituacaoDoGemeo(projectId, "foto", "recusada", c.foto.origem)} />}
                <p className="text-sm text-orange-400">A foto não valeu. Corrija o que está marcado acima e envie outra.</p>
              </>
            )}
            {fotoPronta && !c?.foto?.checagens?.length && <Situacao tom="ok" texto={c?.foto?.origem.startsWith("treino:") ? "Imagem tirada do vídeo de treino. Uma foto enviada fica melhor." : "Foto pronta para o gerador."} />}
            {/* O GÊMEO DE FOTO NO GERADOR (05/10): criado pelo servidor assim
                que a foto vale; enquanto não existe, os vídeos saem pela reserva. */}
            {c?.avatarFoto && (
              <Situacao
                tom={c.avatarFoto.estado === "pronto" ? "ok" : c.avatarFoto.estado === "falhou" ? "erro" : "andando"}
                chave={c.avatarFoto.estado === "falhou" ? chaveDaSituacaoDoGemeo(projectId, "avatar-foto", "falhou", `${c.foto?.origem ?? ""}|${c.avatarFoto.motivo ?? ""}`) : null}
                texto={
                  {
                    criando: "Preparando o seu gêmeo no gerador a partir da foto. Leva um minuto.",
                    pronto: "Gêmeo de foto pronto no gerador: boca, olhar e expressão animados a partir desta foto.",
                    falhou: `${c.avatarFoto.motivo ?? "O gerador não aceitou a foto."} Os vídeos continuam saindo pela reserva, com a sua foto.`,
                  }[c.avatarFoto.estado]
                }
              />
            )}
          </div>
        </div>
      </Passo>

      {/* PASSO 2: A VOZ (01/10). A amostra de fala natural; a voz clonada é
          candidata até a pessoa ouvir a amostra e aprovar (04/10). */}
      <Passo numero={2} Icone={Headphones} titulo="A sua voz" pronto={Boolean(c?.vozAprovada)}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          Envie de 2 a 4 minutos de você falando do seu jeito: uma conversa, uma aula, uma live, um áudio longo. A voz clonada de uma
          leitura costuma soar menos natural. Mínimo de {SEGUNDOS_MINIMOS_DA_VOZ} s; vale um vídeo, que usamos só o som. A voz só entra nos
          vídeos depois que você ouvir a amostra e aprovar.
        </p>
        <div className="flex flex-wrap items-start gap-3">
          <Gravador
            key={c?.voz?.amostraUrl ?? "sem-voz"}
            video={false}
            rotulo={c?.voz ? "Gravar outra amostra" : "Gravar falando do meu jeito"}
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
        <div className="flex flex-col gap-2">
          {c?.vozAprovada && (
            <div className="flex flex-col gap-1.5">
              <Situacao tom="ok" texto={`Voz aprovada por você em ${new Date(c.vozAprovada.aprovadaEm).toLocaleDateString("pt-BR")}. Os vídeos saem com ela.`} />
              {c.vozAprovada.previaUrl && <audio src={arquivo(c.vozAprovada.previaUrl)} controls preload="none" className="h-9 w-full max-w-[360px]" />}
            </div>
          )}
          {c?.voz && !(c.vozAprovada && c.voz.estado === "pronta" && c.voz.aprovadaEm) && (
            <Situacao
              tom={c.voz.estado === "pronta" ? "espera" : ["curta", "falhou"].includes(c.voz.estado) ? "erro" : c.voz.estado === "sem-permissao" ? "espera" : "andando"}
              chave={["curta", "falhou"].includes(c.voz.estado) ? chaveDaSituacaoDoGemeo(projectId, "voz", c.voz.estado, `${c.voz.motivo ?? ""}|${c.voz.segundos ?? ""}`) : null}
              texto={
                {
                  convertendo: "Conferindo a gravação da voz...",
                  curta: c.voz.motivo ?? "A gravação ficou curta.",
                  esperando: "A voz é clonada assim que a autorização (passo 3) valer.",
                  clonando: c.vozAprovada ? "Clonando a voz nova. A aprovada continua nos vídeos até você aprovar a nova." : "Clonando a sua voz...",
                  "sem-permissao": c.voz.motivo ?? "Esperando o fornecedor de voz liberar a clonagem.",
                  pronta: `${c.vozAprovada ? "Voz nova" : "Voz"} clonada a partir de ${duracaoFalada(c.voz.segundos ?? 0)} de gravação. Ouça e aprove antes de usar.`,
                  falhou: c.voz.motivo ?? "Não consegui clonar a voz.",
                }[c.voz.estado]
              }
            />
          )}
          {c?.voz?.estado === "pronta" && !c.voz.aprovadaEm && (
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
        </div>
      </Passo>

      {/* PASSO 3: A AUTORIZAÇÃO (01/10, de volta em 05/10). A pessoa diz a
          frase com a câmera aberta: é o que permite usar rosto e voz. */}
      <Passo numero={3} Icone={ShieldCheck} titulo="A sua autorização, pela câmera (15 s)" pronto={autorizada}>
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
          A lei só permite usar a imagem e a voz de alguém com a autorização dela (Código Civil, art. 20). Grave você mesmo dizendo a frase
          abaixo, olhando para a câmera. Fica guardada com a data e o texto lido, e nada é clonado antes dela valer. Você pode revogar quando
          quiser, e tudo é apagado.
        </p>
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
        {nomeOk ? (
          <>
            <p className="rounded-lg px-3 py-2 text-sm leading-relaxed" style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}>
              {fraseDaAutorizacao(nomeDaAutorizacao, estado.projeto)}
            </p>
            <Gravador
              key={c?.autorizacao?.videoUrl ?? "sem-autorizacao"}
              video
              roteiro={fraseDaAutorizacao(nomeDaAutorizacao, estado.projeto)}
              rotulo={c?.autorizacao ? "Gravar a autorização de novo" : "Abrir a câmera e gravar a frase"}
              minSegundos={SEGUNDOS_MINIMOS_DA_AUTORIZACAO}
              maxSegundos={SEGUNDOS_MAXIMOS_DA_AUTORIZACAO}
              enviando={enviando === "autorizacao"}
              onPronto={(blob, s) => void mandarAutorizacao(blob, s)}
            />
          </>
        ) : (
          <p className="text-sm text-orange-400">Escreva o seu nome completo para liberar a gravação.</p>
        )}
        {c?.autorizacao && (
          <Situacao
            tom={c.autorizacao.estado === "valida" ? "ok" : c.autorizacao.estado === "recusada" ? "erro" : "andando"}
            chave={c.autorizacao.estado === "recusada" ? chaveDaSituacaoDoGemeo(projectId, "autorizacao", "recusada", `${c.autorizacao.gravadaEm ?? ""}|${c.autorizacao.motivo ?? ""}`) : null}
            texto={
              {
                conferindo: "Conferindo se a frase foi dita...",
                valida: `Autorização de ${c.autorizacao.nome}, gravada em ${new Date(c.autorizacao.gravadaEm).toLocaleString("pt-BR")}.`,
                recusada: c.autorizacao.motivo ?? "Não ouvimos a frase. Grave de novo.",
              }[c.autorizacao.estado]
            }
          />
        )}
        {!c?.autorizacao && c?.treino?.estado === "valido" && (
          <Situacao tom="ok" texto={`Autorização de ${c.treino.nome}, dita no vídeo de treino em ${new Date(c.treino.gravadoEm).toLocaleString("pt-BR")}.`} />
        )}
      </Passo>

      {/* AVANÇADO (05/10): o vídeo de treino, que cria o gêmeo TREINADO com os
          gestos da pessoa (HeyGen). Opcional: o gêmeo de foto já funciona sem ele. */}
      <section className="flex flex-col gap-4 rounded-xl border p-5" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <button type="button" onClick={() => setAvancado((v) => !v)} className="flex w-full items-center gap-2 text-left">
          <ChevronDown className={cn("h-4 w-4 transition-transform", avancado ? "" : "-rotate-90")} style={{ color: "var(--text-muted)" }} />
          <Video className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
            Avançado: vídeo de treino, para um gêmeo com os seus gestos
          </h2>
          {c?.avatar?.estado === "pronto" && <CheckCircle2 className="h-4 w-4 text-green-500" />}
        </button>
        {avancado && (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Opcional. Com um vídeo de cerca de 1 minuto lendo o texto que rola abaixo da imagem, o gerador treina um gêmeo que aprende os seus
              gestos, a sua postura e o seu jeito de falar, e pode aparecer em cenários (mesa, palco, escritório). Esse gêmeo ocupa uma vaga
              na conta do gerador e pede uma confirmação pela câmera na página dele. Sem ele, os vídeos saem pela sua foto. Num lugar
              silencioso, com luz no rosto, só você no quadro, do peito para cima. Leve de {SEGUNDOS_MINIMOS_DO_TREINO} s a{" "}
              {SEGUNDOS_MAXIMOS_DO_TREINO / 60} min.
            </p>
            {nomeOk ? (
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
              <p className="text-sm text-orange-400">Escreva o seu nome completo no passo 3 para liberar a gravação.</p>
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
                {c.treino.estado === "falhou" && (
                  <Situacao
                    tom="erro"
                    texto={c.treino.motivo ?? "Não consegui conferir o vídeo. Grave de novo."}
                    chave={chaveDaSituacaoDoGemeo(projectId, "treino", "falhou", `${c.treino.gravadoEm ?? ""}|${c.treino.motivo ?? ""}`)}
                  />
                )}
                {c.treino.estado === "recusado" && (
                  <p className="text-sm text-orange-400">O vídeo não valeu. Corrija o que está marcado acima e grave de novo.</p>
                )}
                {c.treino.estado === "valido" && (
                  <Situacao tom="ok" texto={`Vídeo de treino aceito, gravado em ${new Date(c.treino.gravadoEm).toLocaleString("pt-BR")}.`} />
                )}
              </div>
            )}

            {/* O ÚLTIMO PASSO (03/10): logo depois do vídeo de treino aceito, a
                confirmação que o gerador exige. */}
            {ultimoPasso && (
              <section
                id="ultimo-passo"
                className="flex scroll-mt-48 flex-col gap-3 rounded-xl border p-5 lg:scroll-mt-28"
                style={{ background: "var(--bg-elevated)", borderColor: "rgb(249 115 22 / 0.55)" }}
              >
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-400" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
                      Último passo do gêmeo treinado: confirme pela câmera (30 s)
                    </h3>
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

            {c?.avatar && (
              <Situacao
                tom={c.avatar.estado === "pronto" ? "ok" : c.avatar.estado === "falhou" ? (c.avatar.semVaga ? "espera" : "erro") : c.avatar.estado === "consentimento" ? "espera" : "andando"}
                // A falha do treino se descarta (07/10); sem vaga, o "Tentar de
                // novo" logo abaixo fica (é a ação, e o aviso recolhe nele).
                chave={c.avatar.estado === "falhou" ? chaveDaSituacaoDoGemeo(projectId, "avatar", c.avatar.semVaga ? "sem-vaga" : "falhou", c.avatar.origem) : null}
                texto={
                  {
                    enviando: "Enviando o vídeo para treinar o seu gêmeo...",
                    treinando: "Treinando o seu gêmeo com o vídeo: rosto, gestos e boca. Leva alguns minutos.",
                    consentimento: "Treinado. Falta você confirmar pela câmera, no último passo acima.",
                    pronto: "Gêmeo treinado com os seus gestos. Os vídeos saem por ele.",
                    falhou: `${c.avatar.motivo ?? "O gerador não treinou o gêmeo."} Os vídeos continuam saindo pela sua foto.`,
                  }[c.avatar.estado]
                }
              />
            )}
            {/* SEM VAGA (05/10): o gêmeo nasce assim que a vaga liberar; o botão é para não esperar o passo. */}
            {c?.avatar?.estado === "falhou" && c.avatar.semVaga && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={Boolean(enviando)}
                  onClick={() => void tentarDeNovo()}
                  className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                  style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                >
                  {enviando === "tentar-de-novo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Tentar de novo
                </button>
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Também tentamos sozinhos a cada poucas horas.
                </span>
              </div>
            )}
            {estado.erroTecnico && c?.avatar?.estado === "falhou" && (
              <Descartavel chave={null}>
                <div className="flex items-start gap-1">
                  <p className="flex-1 break-words text-xs" style={{ color: "var(--text-muted)" }}>
                    Só para admin: {estado.erroTecnico}
                  </p>
                  <BotaoDescartar compacto />
                </div>
              </Descartavel>
            )}
          </div>
        )}
      </section>

      {/* PASSO 4: GERAR */}
      <GerarVideo
        projectId={projectId}
        ativo={ativo}
        falta={falta}
        saldo={estado.saldo}
        acessoInterno={estado.acessoInterno}
        roteiroInicial={roteiroInicial}
        onPedido={() => recarregar()}
        gerador={gerador}
        numero={4}
      />

      {estado.videos.length > 0 && <ListaDeVideos projectId={projectId} videos={estado.videos} onMudou={() => recarregar()} />}

      {c && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3" style={{ borderColor: "var(--border)" }}>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Revogar apaga a foto, a voz clonada, o gêmeo no fornecedor, o vídeo de treino e a gravação da autorização. Fica só o registro de
            que você autorizou e revogou, com as datas.
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

/**
 * Uma linha de situação de um passo do gêmeo. Com `chave` (07/10: as falhas
 * que não se resolvem sozinhas), ganha o X: o aviso some, e a ação do passo
 * ("Tentar de novo", enviar de novo) continua onde está.
 */
function Situacao({ tom, texto, chave }: { tom: "ok" | "erro" | "andando" | "espera"; texto: string; chave?: string | null }) {
  const Icone = tom === "ok" ? CheckCircle2 : tom === "erro" ? AlertTriangle : tom === "espera" ? Clock : Loader2;
  const linha = (
    <p className={cn("flex items-start gap-1.5 text-sm", tom === "ok" ? "text-green-500" : tom === "erro" ? "text-orange-400" : "")} style={tom === "andando" || tom === "espera" ? { color: "var(--text-muted)" } : undefined}>
      <Icone className={cn("mt-0.5 h-4 w-4 shrink-0", tom === "andando" && "animate-spin")} />
      <span className="flex-1">{texto}</span>
      {chave && <BotaoDescartar compacto className="-my-0.5" />}
    </p>
  );
  if (!chave) return linha;
  return <Descartavel chave={chave}>{linha}</Descartavel>;
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
  numero = 4,
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
  // 05/10: o gêmeo de foto sai sempre no busto da foto; o seletor de cenário some.
  const comCenarios = geradorTemCenarios(gerador);

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
   * parágrafo por cena. Sem cenários no gerador, tudo vai de frente.
   */
  const roteiro = roteiros.find((r) => r.id === escolhido) ?? null;
  const cenas: CenaDoGemeo[] = useMemo(() => {
    const doRoteiro = roteiro && limparTexto(textoDasCenas(roteiro.cenas)) === limparTexto(texto) ? roteiro.cenas.filter((x) => x.fala?.trim()) : null;
    const base = doRoteiro ?? texto.split(/\n\s*\n/).map((t) => ({ fala: t }));
    const lista = base.filter((x) => x.fala?.trim());
    const ids = cenariosDasCenas(lista, comCenarios ? cenario : "camera");
    return lista.map((x, i) => ({ texto: limparTexto(x.fala ?? ""), cenario: ids[i] }));
  }, [roteiro, texto, cenario, comCenarios]);
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
        {comCenarios ? (
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
        ) : (
          <p className="max-w-[640px] text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
            O vídeo sai de frente para a câmera, no enquadramento da sua foto, com câmera fixa e expressão natural. Cenários (mesa,
            palco, escritório) ficam para o gêmeo treinado, no caminho avançado.
          </p>
        )}
        {comCenarios && cenas.length > 1 && (
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
                {/* `break-words`: o motivo pode trazer um caminho ou código sem espaço, que
                    alargava a página inteira no celular (506px numa tela de 390, 05/10). */}
                {v.motivo && <p className="break-words text-xs text-orange-400">{v.motivo}</p>}
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
