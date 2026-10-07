"use client";

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Mic, Send, Square, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DesignDaGaleria } from "@/lib/biblioteca-de-design/tipos";
import type { EstadoDoEstiloDosPosts } from "@/lib/estilo-dos-posts/tipos";

/**
 * CRIE O SEU ESTILO, FALANDO OU ESCREVENDO (08/10/2026).
 *
 * Regra do Bruno, literal: "vamos promover, incentivar o usuário criar o seu
 * estilo, a partir de um texto ou um áudio, e isso vai alimentar a biblioteca
 * para todos os demais (nunca usar fotos reais, dados reais nos modelos);
 * essa parte só cria o modelo, depois no quadro a IA coloca o conteúdo dentro
 * do modelo selecionado ou criado".
 *
 * Um quadro de chat. A primeira mensagem é o estilo, as seguintes são
 * ajustes ("mais escuro", "sem pessoa"); cada envio vira o pedido da
 * biblioteca de design (o JEV compara e separa o visual do dado do cliente, o
 * Claude escreve a ficha). O microfone grava no navegador, a rota ./voz
 * transcreve (a mesma Deepgram do comando falado do vídeo) e o texto entra na
 * conversa como a mensagem do cliente, pelo MESMO caminho do texto escrito.
 *
 * O padrão é compartilhar: o modelo entra na biblioteca de todos, só com o
 * visual. "Só no meu projeto" continua, desmarcado.
 *
 * `paraOPost`: a escolha de um dia da campanha (components/estilo-dos-posts/
 * modelos-dos-posts.tsx). O modelo é criado e vai para quem chamou, sem virar
 * o estilo do projeto. Sem ele (o passo Estilo dos posts), o dono aprova o
 * modelo como o estilo do projeto.
 */

type Mensagem = { de: "cliente" | "squad"; texto: string; falada?: boolean };

// 08/10, revisão: sem prometer "foto sua" aqui. O estilo vira o MODELO (a
// linguagem da imagem gerada, o layout, a letra e o papel das cores); foto
// real da pessoa só entra no quadro, pela Biblioteca de materiais.
const BOAS_VINDAS =
  "Como você quer que os seus posts fiquem? Fale ou escreva do jeito que vier: o clima, as cores, se quer ilustração, colagem, fotografia de cena, só tipografia, algo que você viu e gostou. Eu monto o modelo, e no quadro a IA coloca o conteúdo de cada post dentro dele.";

/**
 * O tamanho mínimo do que se escreve (08/10, revisão): a primeira mensagem é
 * o estilo e precisa de uma frase (a rota recusa menos de 12 letras); depois
 * dela, ajuste curto vale ("azul", "sem pessoa").
 */
const MINIMO_DO_PEDIDO = 12;
const MINIMO_DO_AJUSTE = 3;

const EXEMPLOS = [
  "Fundo escuro, letra grande e branca, a cor da marca só no destaque",
  "Ilustração leve, cores claras, nada de foto de banco",
  "Colagem de papel com recortes, estilo revista",
];

export type EstiloCriado = { design: DesignDaGaleria; aprovado?: boolean; efeito?: string; estado?: EstadoDoEstiloDosPosts };

export function CriarEstilo({
  projectId,
  paraOPost = false,
  aoCriar,
}: {
  projectId: string;
  paraOPost?: boolean;
  aoCriar?: (r: EstiloCriado) => void;
}) {
  const [conversa, setConversa] = useState<Mensagem[]>([{ de: "squad", texto: BOAS_VINDAS }]);
  const [texto, setTexto] = useState("");
  const [soNoMeuProjeto, setSoNoMeuProjeto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [transcrevendo, setTranscrevendo] = useState(false);
  const gravador = useRef<MediaRecorder | null>(null);
  const pedacos = useRef<Blob[]>([]);
  const fimDaConversa = useRef<HTMLDivElement>(null);
  // A fala chega depois que a gravação para, por um retorno criado quando ela
  // começou: a conversa e a escolha do "só no meu projeto" são lidas na hora.
  const conversaAtual = useRef(conversa);
  const soNoMeuProjetoAtual = useRef(soNoMeuProjeto);
  useEffect(() => {
    conversaAtual.current = conversa;
    soNoMeuProjetoAtual.current = soNoMeuProjeto;
  });

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: "nearest" });
  }, [conversa.length]);

  // Fechar a tela no meio da gravação desliga o microfone, sem mandar nada:
  // quem fechou desistiu daquela fala (e transcrever custa).
  const desmontado = useRef(false);
  useEffect(() => {
    desmontado.current = false;
    return () => {
      desmontado.current = true;
      if (gravador.current?.state === "recording") gravador.current.stop();
    };
  }, []);

  const jaTemPedido = conversa.some((m) => m.de === "cliente");
  const minimo = jaTemPedido ? MINIMO_DO_AJUSTE : MINIMO_DO_PEDIDO;
  const ocupado = enviando || transcrevendo;

  async function enviar(mensagem?: string, falada = false) {
    const nova = (mensagem ?? texto).replace(/\s+/g, " ").trim();
    const minimoAgora = conversaAtual.current.some((m) => m.de === "cliente") ? MINIMO_DO_AJUSTE : MINIMO_DO_PEDIDO;
    if (nova.length < minimoAgora) {
      toast.error(falada ? "Não entendi uma frase inteira. Grave de novo, contando como quer os posts." : "Conte com pelo menos uma frase como você quer os posts.");
      return;
    }
    const doCliente = [...conversaAtual.current.filter((m) => m.de === "cliente").map((m) => m.texto), nova];
    setConversa((c) => [...c, { de: "cliente", texto: nova, falada }]);
    if (!falada) setTexto("");
    setEnviando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/estilo-dos-posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversa: doCliente, soNoMeuProjeto: soNoMeuProjetoAtual.current, paraOPost }),
      });
      const d = (await r.json().catch(() => ({}))) as { design?: DesignDaGaleria; aprovado?: boolean; efeito?: string; estado?: EstadoDoEstiloDosPosts; error?: string };
      if (!r.ok || !d.design) throw new Error(d.error || "Não consegui registrar o estilo.");
      const ficha = `Ficou assim: ${d.design.nome}. ${d.design.descricao}`.trim();
      const ajuste = `Quer ajustar? Fale ou escreva aqui, por exemplo: "mais escuro", "sem pessoa", "mais colorido".`;
      const resposta = d.aprovado ? `${ficha}\n\n${d.efeito ?? "Modelo pronto."}\n\n${ajuste}` : `${ficha}\n\n${d.efeito ?? "Não consegui usar este modelo."}`;
      setConversa((c) => [...c, { de: "squad", texto: resposta }]);
      aoCriar?.({ design: d.design, aprovado: d.aprovado, efeito: d.efeito, estado: d.estado });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Não consegui registrar o estilo.";
      // A mensagem que falhou sai da conversa (08/10, revisão): ela volta para
      // a caixa de texto, e reenviada entrava duas vezes no pedido.
      setConversa((c) => {
        const i = c.map((m) => m.de).lastIndexOf("cliente");
        const sem = i >= 0 ? [...c.slice(0, i), ...c.slice(i + 1)] : c;
        return [...sem, { de: "squad", texto: `${msg} O que você ${falada ? "falou" : "escreveu"} continua na caixa: confira e mande de novo.` }];
      });
      setTexto(nova);
    } finally {
      setEnviando(false);
    }
  }

  /** Grava no navegador; ao parar, a fala vira texto e segue o caminho do texto escrito. */
  async function alternarGravacao() {
    if (gravando) {
      gravador.current?.stop();
      return;
    }
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Este navegador não grava áudio. Escreva como você quer.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      pedacos.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) pedacos.current.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (desmontado.current) return;
        setGravando(false);
        const audio = new Blob(pedacos.current, { type: rec.mimeType || "audio/webm" });
        setTranscrevendo(true);
        try {
          const r = await fetch(`/api/projects/${projectId}/estilo-dos-posts/voz`, { method: "POST", headers: { "Content-Type": audio.type }, body: audio });
          const d = (await r.json().catch(() => ({}))) as { texto?: string; error?: string };
          if (!r.ok || !d.texto) throw new Error(d.error || "Não consegui transcrever.");
          setTranscrevendo(false);
          await enviar(d.texto, true);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Não consegui transcrever.");
        } finally {
          setTranscrevendo(false);
        }
      };
      gravador.current = rec;
      rec.start();
      setGravando(true);
    } catch {
      toast.error("Não consegui abrir o microfone. Confira a permissão do navegador, ou escreva.");
    }
  }

  return (
    <div className="space-y-2">
      <div className="max-h-72 space-y-2 overflow-y-auto rounded-lg border p-3" style={{ borderColor: "var(--border)", background: "var(--bg-primary)" }} aria-live="polite">
        {conversa.map((m, i) => (
          <div key={i} className={cn("flex", m.de === "cliente" ? "justify-end" : "justify-start")}>
            <p
              className="max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[13px] leading-snug"
              style={m.de === "cliente" ? { background: "#f97316", color: "#fff" } : { background: "var(--bg-elevated)", color: "var(--text-primary)" }}
            >
              {m.falada && <Mic className="mr-1 inline h-3 w-3 align-[-1px]" aria-label="falado" />}
              {m.texto}
            </p>
          </div>
        ))}
        {(enviando || transcrevendo) && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> {transcrevendo ? "Ouvindo o que você falou" : "Montando o modelo (leva uns segundos)"}
          </div>
        )}
        <div ref={fimDaConversa} />
      </div>
      {!jaTemPedido && (
        <div className="flex flex-wrap gap-1.5">
          {EXEMPLOS.map((ex) => (
            <button key={ex} type="button" onClick={() => setTexto(ex)} className="rounded-full border px-2.5 py-1 text-[11px]" style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
              {ex}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => void alternarGravacao()}
          disabled={ocupado}
          aria-label={gravando ? "Parar e mandar o que eu falei" : "Falar como eu quero"}
          title={gravando ? "Parar e mandar" : "Falar como eu quero"}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50"
          style={gravando ? { background: "#dc2626", borderColor: "#dc2626", color: "#fff" } : { borderColor: "#f97316", color: "#f97316" }}
        >
          {transcrevendo ? <Loader2 className="h-4 w-4 animate-spin" /> : gravando ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          <span className="hidden sm:inline">{gravando ? "Parar" : "Falar"}</span>
        </button>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !ocupado && !gravando) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={2}
          maxLength={600}
          placeholder={gravando ? "Gravando: fale como você quer e toque em Parar" : jaTemPedido ? "Quer ajustar? Ex.: mais escuro, sem pessoa, mais colorido" : "Ou escreva como você quer os seus posts"}
          aria-label="Como você quer os seus posts"
          className="min-w-0 flex-1 resize-y rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
          style={{ borderColor: "var(--border)", background: "var(--bg-input)", color: "var(--text-primary)" }}
        />
        <button type="button" onClick={() => void enviar()} disabled={ocupado || gravando || texto.trim().length < minimo} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white disabled:opacity-50" aria-label="Enviar">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">Enviar</span>
        </button>
      </div>
      <p className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-500" />
        <span>
          <b style={{ color: "var(--text-primary)" }}>O seu estilo vira um modelo na biblioteca de todos.</b> Entra só o visual (a linguagem, o layout, a letra e o papel de cada cor), nunca as suas fotos, o seu nome, a sua marca ou os seus dados: esses entram só nos seus posts, no quadro.
        </span>
      </p>
      <label className="flex items-start gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
        <input type="checkbox" checked={soNoMeuProjeto} onChange={(e) => setSoNoMeuProjeto(e.target.checked)} className="mt-0.5 accent-orange-500" />
        <span>Prefere guardar só para você? Marque <b style={{ color: "var(--text-primary)" }}>Só no meu projeto</b>.</span>
      </label>
    </div>
  );
}
