"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Video, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  MB_POR_MINUTO_RECOMENDADO,
  LIMITES_SEM_PLANO,
  TIPOS_ACEITOS,
  duracaoPorExtenso,
  validarVideo,
  creditosEmDuasPartes,
  creditosNaTela,
  CREDITOS_POR_GB_EXTRA,
  CORTES_SUGERIDOS,
  MAX_CORTES_APROVADOS,
  type LimitesDoEnvio,
  type Veredito,
} from "@/lib/media/limits";
import { CREDITOS_POR_GERACAO_HIGGSFIELD } from "@/lib/credits/higgsfield-tabela";
import { FaixaDeCota, PedidoDeUpgrade, type Estouro } from "@/components/planos/pedido-de-upgrade";
import { AvisoDeWifi, MedidorDeEnvio } from "@/components/video/medidor-de-envio";
import { BotaoDescartar } from "@/components/ui/descartar";
import { ARQUIVO_GRANDE_BYTES, emDadosMoveis } from "@/lib/media/velocidade-do-envio";

/**
 * Envio do vídeo semanal.
 *
 * A validação acontece no navegador, antes de subir um byte, porque é o único
 * lugar onde a duração e o tamanho já são conhecidos e ainda dá tempo de
 * recusar. Deixar a pessoa esperar 45 minutos de upload para descobrir que o
 * arquivo não serve seria a pior experiência possível, e é exatamente o que
 * aconteceria com a taxa de gravação padrão do OBS.
 *
 * O arquivo não passa pela nossa função: o navegador envia direto para o
 * storage. Função serverless tem limite de corpo na casa das dezenas de
 * megabytes, e um vídeo de 20 minutos passa de 1 GB.
 */

type Arquivo = { file: File; duracao: number; veredito: Veredito };

async function lerDuracao(file: File): Promise<number> {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      URL.revokeObjectURL(el.src);
      resolve(el.duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(el.src);
      resolve(0);
    };
    el.src = URL.createObjectURL(file);
  });
}

export function VideoUpload({
  projectId,
  onEnviado,
}: {
  projectId: string;
  onEnviado?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arquivo, setArquivo] = useState<Arquivo | null>(null);
  const [lendo, setLendo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  // Os bytes que já saíram, para o medidor de velocidade (item 14, 29/09).
  const [enviados, setEnviados] = useState(0);
  // Dados móveis, quando o navegador sabe dizer (só Chrome e derivados).
  const [movel, setMovel] = useState<boolean | null>(null);
  useEffect(() => setMovel(emDadosMoveis()), []);

  // Fechar a aba no meio do envio perde o arquivo: o navegador pergunta antes.
  useEffect(() => {
    if (!enviando) return;
    const segurar = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", segurar);
    return () => window.removeEventListener("beforeunload", segurar);
  }, [enviando]);
  const [erro, setErro] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  /**
   * A cota de gravacoes do ciclo, perguntada ANTES de deixar escolher arquivo.
   *
   * Existe desde 18/09, quando os limites de plano passaram a valer. A pergunta
   * acontece aqui e nao so na hora do upload porque a hora do upload e o pior
   * momento possivel para descobrir: a pessoa ja escolheu um arquivo de 900 MB e
   * ja esperou. O portao de verdade continua no servidor, que e o unico que
   * uma aba com devtools aberto nao contorna.
   */
  const [limite, setLimite] = useState<Estouro | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [renovaEm, setRenovaEm] = useState<string | null>(null);
  // Os tetos do PLANO (29/09): 1, 2 ou 5 horas. Até a resposta chegar vale o
  // maior teto, e o servidor recusa no token se passar do plano.
  const [envio, setEnvio] = useState<LimitesDoEnvio>(LIMITES_SEM_PLANO);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // /api/videos/limites, e não /api/videos/cota, que é a cota do vídeo
        // por IA: até 29/09 esta tela lia a rota errada e a oferta nunca vinha.
        const r = await fetch("/api/videos/limites");
        if (!r.ok || !vivo) return;
        const data = await r.json();
        if (data.envio) setEnvio(data.envio as LimitesDoEnvio);
        if (!data.pode && data.limite) setLimite(data.limite as Estouro);
        // Admin e quem nao tem cota nao veem contagem: mostrar "0 de 0" para
        // quem opera a plataforma seria o produto cobrando plano do dono.
        if (data.uso && !data.uso.admin && !data.uso.semPlano) {
          setRestantes(data.uso.restantes as number);
          setRenovaEm((data.uso.renovaEm as string | null) ?? null);
        }
      } catch {
        // Sem resposta, a tela segue como antes. O servidor recusa se precisar,
        // e um erro de rede aqui nao pode impedir alguem de enviar video.
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pronto]);

  async function escolher(file: File) {
    setErro(null);
    setPronto(false);
    setLendo(true);
    const duracao = await lerDuracao(file);
    setArquivo({ file, duracao, veredito: validarVideo(file.size, duracao, envio) });
    setLendo(false);
  }

  async function enviar() {
    if (!arquivo || !arquivo.veredito.ok) return;
    setEnviando(true);
    setErro(null);
    setProgresso(0);
    setEnviados(0);
    try {
      const blob = await upload(`videos/${projectId}/${arquivo.file.name}`, arquivo.file, {
        // Privado de propósito: vídeo cru do cliente é material não publicado e
        // não pode ficar alcançável por quem tiver a URL.
        access: "private",
        // Recomendado acima de 100 MB: divide em partes, sobe em paralelo e
        // repete só a parte que falhar, em vez de perder o upload inteiro.
        multipart: true,
        handleUploadUrl: "/api/videos/upload",
        clientPayload: JSON.stringify({ projectId }),
        onUploadProgress: (p) => {
          setProgresso(Math.round(p.percentage));
          setEnviados(p.loaded);
        },
      });

      // Em desenvolvimento o callback do storage não alcança o localhost, então
      // o registro também é exposto aqui. A rota é idempotente.
      const registro = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          blobUrl: blob.url,
          originalName: arquivo.file.name,
          sizeBytes: arquivo.file.size,
        }),
      });

      // A COTA CONFERIDA DE NOVO NO REGISTRO (30/09). O token foi emitido com
      // gravação livre, mas outra aba pode ter usado a última enquanto este
      // arquivo subia. Até aqui a resposta nem era lida: a tela dizia "vídeo
      // recebido" para um registro que não existia.
      if (!registro.ok) {
        const corpo = (await registro.json().catch(() => ({}))) as { error?: string; limite?: Estouro };
        if (corpo.limite?.recurso === "gravacoes") {
          setArquivo(null);
          setLimite(corpo.limite);
          return;
        }
        throw new Error(corpo.error ?? "Não consegui registrar o vídeo.");
      }

      setPronto(true);
      setArquivo(null);
      onEnviado?.();
    } catch (e) {
      // Internet que caiu no meio do envio: dizer o que houve e o que fazer,
      // em vez do texto técnico do navegador ("Failed to fetch").
      const semRede = typeof navigator !== "undefined" && navigator.onLine === false;
      const msg = e instanceof Error ? e.message : "";
      setErro(
        semRede || /fetch|network|rede|conex/i.test(msg)
          ? "A sua internet caiu durante o envio e o vídeo não chegou inteiro. Nada foi cobrado. Quando a conexão voltar, toque em \"Enviar e montar a semana\" de novo."
          : msg || "Falha ao enviar o vídeo."
      );
    } finally {
      setEnviando(false);
    }
  }

  const v = arquivo?.veredito;

  // Cota esgotada: o cartao de envio SOME e a oferta toma o lugar dele. Deixar o
  // cartao na tela, desabilitado, convida a tentar e falhar, que e o contrario
  // do que uma oferta faz.
  if (limite) return <PedidoDeUpgrade estouro={limite} />;

  return (
    <div className="space-y-4">
    {/* O aviso de penultima e ultima gravacao, que so aparece perto do fim:
        aviso que fica na tela o ciclo inteiro nao e aviso, e decoracao. */}
    {restantes !== null && restantes > 0 && restantes <= 2 && (
      <FaixaDeCota restantes={restantes} renovaEm={renovaEm} sugestao={null} />
    )}
    <div
      className="rounded-xl border p-6"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-start gap-3 mb-5">
        <Video className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
        <div>
          <h2 className="font-bold text-[var(--text-primary)]">
            Envie a gravação da semana
          </h2>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Fale do jeito que você falaria com um cliente. O squad transcreve,
            escolhe os melhores trechos e escreve o conteúdo de cada rede.
          </p>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_ACEITOS.join(",")}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void escolher(f);
        }}
      />

      {!arquivo && !pronto && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={lendo}
          className="w-full rounded-xl border border-dashed p-8 text-center transition-colors hover:border-orange-500/40"
          style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }}
        >
          {lendo ? (
            <span className="inline-flex items-center gap-2 text-[var(--text-muted)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Lendo o arquivo
            </span>
          ) : (
            <>
              <Upload className="w-6 h-6 mx-auto mb-2 text-[var(--text-muted)]" />
              <span className="block text-[var(--text-primary)] font-medium">
                Escolher vídeo
              </span>
              <span className="block text-sm text-[var(--text-muted)] mt-1">
                {/* O número vem da constante, e não escrito à mão. O limite
                    subiu de 60 para 120 em 22/08 e este texto ficou para trás,
                    prometendo metade do que a plataforma aceita. */}
                MP4, MOV, MKV ou WebM. Até {duracaoPorExtenso(envio.duracaoMaximaSeg)}
                {envio.plano ? ` no ${envio.plano}` : ""}.
              </span>
            </>
          )}
        </button>
      )}

      {pronto && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-5 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-[var(--text-primary)] font-medium">
              Vídeo recebido. O squad já começou.
            </p>
            <button
              onClick={() => {
                setPronto(false);
                inputRef.current?.click();
              }}
              className="text-sm text-orange-400 mt-1 hover:underline"
            >
              Enviar outro
            </button>
          </div>
        </div>
      )}

      {arquivo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div
            className="rounded-xl border p-4 mb-4"
            style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
          >
            <p className="text-[var(--text-primary)] font-medium truncate">
              {arquivo.file.name}
            </p>
            <p className="text-sm text-[var(--text-muted)] mt-1">
              {Math.round(arquivo.duracao / 60)} min,{" "}
              {(arquivo.file.size / 1048576).toFixed(0)} MB
            </p>
          </div>

          {v && !v.ok && (
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-4 mb-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-[var(--text-primary)] font-medium">{v.motivo}</p>
                {v.dica && (
                  <p className="text-sm text-[var(--text-muted)] mt-1">{v.dica}</p>
                )}
              </div>
            </div>
          )}

          {v && v.ok && (
            <div
              className="rounded-xl border p-4 mb-4 space-y-3"
              style={{ background: "var(--bg-primary)", borderColor: "var(--border)" }}
            >
              {/* OS CRÉDITOS EM DUAS PARTES (30/09, tela de roteiro): o cliente
                  paga no envio só o que roda antes de aprovar, e o resto só
                  depois de escolher os cortes e aprovar as cenas. Os números
                  saem de `creditosEmDuasPartes` (lib/media/limits.ts), no preço
                  em vigor desde 01/10. Desde então passam de mil, e vão com
                  separador de milhar: "3174" se lê errado, "3.174" não. */}
              {(() => {
                const partes = creditosEmDuasPartes(arquivo.duracao, arquivo.file.size);
                return (
                  <>
                    <p className="text-sm text-[var(--text-muted)]">
                      <strong className="text-[var(--text-primary)]">Primeira parte, agora no envio:</strong>{" "}
                      <strong className="text-[var(--text-primary)]">{creditosNaTela(partes.roteiro)} créditos</strong>.
                      Eu transcrevo, limpo a sua fala, escolho cerca de{" "}
                      <strong className="text-[var(--text-primary)]">{v.clipes} cortes possíveis</strong>, escrevo a
                      semana de peças e preparo o roteiro da edição para você aprovar.
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">
                      <strong className="text-[var(--text-primary)]">Segunda parte, só quando você aprovar o roteiro:</strong>{" "}
                      <strong className="text-[var(--text-primary)]">{creditosNaTela(partes.aprovacaoMax)} créditos</strong>{" "}
                      com os {CORTES_SUGERIDOS} cortes que eu sugiro, sendo {creditosNaTela(partes.completo)} do vídeo completo
                      editado (com a abertura dos melhores momentos) e {creditosNaTela(partes.porCorte)} por corte que você
                      escolher, até {MAX_CORTES_APROVADOS}. Nada de imagem, cena ou corte é gerado antes da sua aprovação.
                    </p>
                    <div className="text-xs text-[var(--text-muted)] space-y-1">
                      <p>
                        <strong className="text-[var(--text-primary)]">
                          No total, {creditosNaTela(partes.total)} créditos com {CORTES_SUGERIDOS} cortes.
                        </strong>{" "}
                        Se você não aprovar o roteiro, só a primeira parte é usada. Com 1 corte em vez de {CORTES_SUGERIDOS}, a segunda
                        parte fica {creditosNaTela(partes.porCorte * (CORTES_SUGERIDOS - 1))} créditos menor; cada corte a mais soma{" "}
                        {creditosNaTela(partes.porCorte)}.
                      </p>
                      <p>
                        Já incluso: legenda e edição na linguagem que você escolheu, as capas e o arquivo acima do
                        tamanho recomendado ({CREDITOS_POR_GB_EXTRA} créditos por GB, na primeira parte). À parte, só
                        se você escolher: a abertura com movimento de câmera por IA, {CREDITOS_POR_GERACAO_HIGGSFIELD}{" "}
                        créditos por cena gerada.
                      </p>
                    </div>
                  </>
                );
              })()}

              {/*
                Sugestão em vez de bloqueio (decisão do Bruno, 22/08). A versão
                anterior recusava o vídeo por taxa de gravação alta; agora ele
                sobe, custa mais, e a pessoa fica sabendo quanto economizaria
                gravando mais leve. Quem grava na taxa recomendada não vê nada.
              */}
              {/* Antes de começar, o que dá para dizer sem medir: o tempo é da
                  rede de quem envia, e arquivo grande pede wi-fi. A velocidade
                  de verdade aparece nos primeiros segundos do envio. */}
              {!enviando && (
                <p className="text-xs text-[var(--text-muted)]">
                  O tempo de envio depende da sua internet. Assim que começar, mostramos a velocidade da sua rede e
                  quanto falta.
                </p>
              )}
              {!enviando && (arquivo.file.size > ARQUIVO_GRANDE_BYTES || movel === true) && <AvisoDeWifi movel={movel === true} />}

              {v.sugestao && (
                <p className="text-sm text-orange-300 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  {v.sugestao}
                </p>
              )}
            </div>
          )}

          {enviando && (
            <div className="mb-4">
              <div
                className="h-2 rounded-full overflow-hidden"
                style={{ background: "var(--bg-primary)" }}
              >
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Enviando, {progresso}%
              </p>
              <MedidorDeEnvio enviados={enviados} total={arquivo.file.size} />
              {/* O ÚNICO MOMENTO QUE PEDE A PÁGINA ABERTA (03/10): o arquivo sai
                  do aparelho do cliente. Depois do envio, tudo roda nos nossos
                  servidores e o e-mail chama de volta. */}
              <p className="text-sm mt-3 rounded-lg px-3 py-2" style={{ background: "var(--bg-primary)" }}>
                <span className="font-semibold">Mantenha esta página aberta só até o envio chegar a 100%.</span> Depois
                disso pode fechar, desligar ou ficar sem internet: a edição continua nos nossos servidores e avisamos
                aqui e por e-mail quando precisarmos de você ou quando estiver pronto.
              </p>
            </div>
          )}

          <div className="flex gap-3">
            <Button onClick={enviar} disabled={!v?.ok || enviando}>
              {enviando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  Enviar e montar a semana
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setArquivo(null);
                setErro(null);
              }}
              disabled={enviando}
            >
              Escolher outro
            </Button>
          </div>
        </motion.div>
      )}

      {/* O erro do envio: X só local (07/10). */}
      {erro && (
        <p className="flex items-start gap-1 text-sm text-orange-400 mt-4">
          <span className="flex-1">{erro}</span>
          <BotaoDescartar compacto aoDescartar={() => setErro(null)} className="-my-0.5" />
        </p>
      )}

      <p className="text-xs text-[var(--text-muted)] mt-5">
        Dica que economiza o seu tempo: grave a 4 Mbps (
        {MB_POR_MINUTO_RECOMENDADO} MB por minuto). No OBS é Configurações,
        Saída, Taxa de bits do vídeo, 4000 Kbps. Para alguém falando na frente da
        câmera a imagem é a mesma, e o arquivo sobe em segundos em vez de
        minutos.
      </p>
    </div>
    </div>
  );
}
