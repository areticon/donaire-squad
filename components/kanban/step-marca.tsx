"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { AlertTriangle, Check, FileText, Image as ImageIcon, Loader2, Plus, Trash2, Upload } from "lucide-react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * A etapa Marca do assistente, no lugar da antiga Design.
 *
 * Pedido do Bruno em 13/09, aprovado no canvas em 14/09: a etapa so tinha
 * paleta em hex e quatro presets. Aqui: as cores da pessoa, o logo, o manual
 * de marca, e os documentos que a IA deve ler. Os documentos ja existiam na
 * aba Treinamento (ProjectContext), escondidos; agora entram onde a pessoa
 * ainda esta com a marca na cabeca, e Treinamento continua como o lugar de
 * editar depois.
 *
 * O logo e o manual sobem direto no Blob e o navegador espelha no PATCH, pelo
 * mesmo motivo da trilha (em desenvolvimento o storage nao alcanca o
 * localhost). A compilacao do PDF pela IA acontece no servidor, no
 * onUploadCompleted, e so em producao.
 */

/**
 * O estado de leitura de cada documento, que ate 18/09 nao existia: a lista
 * escrevia "compilado" em verde no instante do upload, a partir de um item
 * inventado aqui na memoria da aba, com um id falso.
 *
 * Medido naquele dia: os dois PDFs do Bruno estavam no storage e o banco tinha
 * ZERO documentos. O verde estava descrevendo uma coisa que nunca aconteceu, e
 * o id falso era a razao de nao haver como remover: nao havia o que remover.
 *
 * "lendo" e "falhou" precisam ser estados SEPARADOS porque pedem coisas opostas
 * de quem esta na tela: um pede esperar, o outro pede agir. Foi exatamente essa
 * confusao, ausencia tratada como falha, que produziu o defeito da foto de
 * perfil em 17/09.
 */
type Documento = { id: string; type: string; title: string; status?: string; erro?: string | null };

/** Um PDF que subiu e ainda nao voltou do servidor como documento de verdade. */
type Pendente = { chave: string; type: string; title: string };

/**
 * O selo de estado, com a frase que a pessoa precisa, nao o nome tecnico.
 *
 * "lido pela IA" e nao "compilado": compilado e o nosso vocabulario, e o que
 * importa para quem esta ali e se a IA ja conhece aquele material. E a diferenca
 * entre "não consegui ler" e ausencia de selo e a diferenca entre um documento
 * que precisa de acao e um que so precisa de tempo.
 */
function EstadoDoDocumento({ status }: { status?: string }) {
  const base = "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold";

  if (status === "falhou") {
    return (
      <span className={`${base} bg-red-500/15 text-red-400`}>
        <AlertTriangle className="h-3 w-3" />
        não consegui ler
      </span>
    );
  }
  if (status === "lendo") {
    return (
      <span className={`${base} bg-yellow-500/15 text-yellow-400`}>
        <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
        a IA está lendo
      </span>
    );
  }
  if (status === "enviado") {
    return <span className={`${base} bg-[var(--bg-elevated)] text-[var(--text-muted)]`}>enviado</span>;
  }
  return (
    <span className={`${base} bg-green-500/15 text-green-400`}>
      <Check className="h-3 w-3" />
      lido pela IA
    </span>
  );
}

const TIPOS: Array<{ id: string; rotulo: string; dica: string }> = [
  // Contexto do negocio PRIMEIRO, acrescentado em 17/09 a pedido do Bruno: e o
  // documento que responde o que a marca faz, para quem e como fala, e e dele
  // que a etapa seguinte tira nicho, publico e voz. Sem esta opcao, quem tinha
  // um documento de contexto precisava chama-lo de "linha editorial" ou de
  // "referencias", e o rotulo errado muda como a IA le o conteudo.
  { id: "business", rotulo: "Contexto do negócio", dica: "O que você faz, para quem, como cobra, o que te diferencia" },
  { id: "editorial", rotulo: "Linha editorial", dica: "Pilares, temas, ângulos, narrativa" },
  { id: "references", rotulo: "Referências", dica: "Perfis que inspiram, posts de referência" },
  { id: "regulations", rotulo: "Regulamentações", dica: "Leis, normas do setor, o que não pode" },
  { id: "examples", rotulo: "Exemplos de posts", dica: "Posts que funcionaram, formatos preferidos" },
];

export function StepMarca({
  projectId,
  form,
  set,
  logoInicial,
  manualInicial,
  documentosIniciais,
}: {
  projectId: string;
  form: Record<string, string>;
  set: (f: string, v: string) => void;
  logoInicial: string | null;
  manualInicial: string | null;
  documentosIniciais: Documento[];
}) {
  const [logo, setLogo] = useState<string | null>(logoInicial);
  const [manual, setManual] = useState<string | null>(manualInicial);
  const [documentos, setDocumentos] = useState<Documento[]>(documentosIniciais);
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [subindo, setSubindo] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [duplicata, setDuplicata] = useState<{ arquivo: File; existente: Documento } | null>(null);

  const [novoTipo, setNovoTipo] = useState("editorial");
  const [novoTitulo, setNovoTitulo] = useState("");
  const [novoTexto, setNovoTexto] = useState("");
  const [salvandoTexto, setSalvandoTexto] = useState(false);

  const inputLogo = useRef<HTMLInputElement>(null);
  const inputManual = useRef<HTMLInputElement>(null);
  const inputDoc = useRef<HTMLInputElement>(null);

  const cores = form.colorPalette.split(",").map((c) => c.trim()).filter(Boolean);
  const trocarCor = (i: number, valor: string) => {
    const novas = [...cores];
    novas[i] = valor;
    set("colorPalette", novas.join(","));
  };

  /**
   * O LOGO vai por outro caminho desde 17/09: rota propria, upload pela funcao,
   * store PUBLICO.
   *
   * Ele subia junto com o manual, pelo navegador, para o store privado. So que
   * a tag <img> nao manda credencial: a URL privada devolve 403 e o logo nunca
   * aparecia, desde o primeiro upload. O manual continua privado de proposito,
   * porque e material interno lido pela IA e nunca exibido.
   */
  async function subirLogo(arquivo: File) {
    if (arquivo.size > 5 * 1024 * 1024) {
      toast.error("O logo pode ter no máximo 5 MB.");
      return;
    }
    setSubindo("logo");
    try {
      const corpo = new FormData();
      corpo.append("logo", arquivo);
      const res = await fetch(`/api/projects/${projectId}/logo`, { method: "POST", body: corpo });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "erro");
      setLogo(data.url as string);
      toast.success("Logo salvo.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui subir o logo.");
    } finally {
      setSubindo(null);
    }
  }

  async function subir(kind: "manual", arquivo: File) {
    const limite = 20;
    if (arquivo.size > limite * 1024 * 1024) {
      toast.error(`O arquivo pode ter no máximo ${limite} MB.`);
      return;
    }
    setSubindo(kind);
    try {
      const blob = await upload(`marca/${projectId}/${kind}/${arquivo.name}`, arquivo, {
        access: "private",
        handleUploadUrl: `/api/projects/${projectId}/marca`,
        clientPayload: JSON.stringify({ kind, title: arquivo.name }),
      });
      // O espelho do onUploadCompleted (ver o comentario do topo).
      await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandManualUrl: blob.url, brandManualName: arquivo.name }),
      });
      {
        setManual(arquivo.name);
        toast.success("Manual salvo. A IA está lendo e ele entra nas próximas campanhas.");
      }
    } catch {
      toast.error("Não consegui subir o arquivo. Tente de novo.");
    } finally {
      setSubindo(null);
    }
  }

  /**
   * A lista vem do SERVIDOR, e nunca mais de um palpite local.
   *
   * O item otimista com `id: pdf-${Date.now()}` era a razao de o botao de apagar
   * ser impossivel: o id nao existia em lugar nenhum, entao nao havia o que
   * chamar. Agora a unica fonte da lista e o banco, e o que ainda nao chegou la
   * aparece separado, como pendente, dizendo a verdade sobre si.
   */
  const recarregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/context`);
      if (!r.ok) return;
      const data = await r.json();
      const lista = (data.contexts ?? []) as Documento[];
      setDocumentos(lista);
      // O pendente que ja virou documento de verdade sai da fila de espera. O
      // par tipo + titulo e o que a rota grava, entao e por ele que se casa.
      setPendentes((p) => p.filter((x) => !lista.some((d) => d.type === x.type && d.title === x.title)));
    } catch {
      // Falha de rede aqui nao merece alarme: a proxima volta do relogio tenta
      // de novo, e o que esta na tela continua valendo.
    }
  }, [projectId]);

  /**
   * Enquanto houver documento sendo lido ou PDF que ainda nao apareceu, perguntar
   * ao servidor de tres em tres segundos.
   *
   * Existe porque a compilacao roda FORA da requisicao do upload, no
   * `onUploadCompleted`, que o storage chama de servidor para servidor. Quem
   * sobe o arquivo nao fica sabendo do resultado por nenhum outro caminho: sem
   * isto, a unica forma de ver o estado real seria recarregar a pagina na mao.
   */
  useEffect(() => {
    const esperando = pendentes.length > 0 || documentos.some((d) => d.status === "lendo");
    if (!esperando) return;
    const t = setInterval(() => void recarregar(), 3000);
    return () => clearInterval(t);
  }, [pendentes.length, documentos, recarregar]);

  /**
   * O mesmo arquivo, no mesmo tipo, ja esta na lista?
   *
   * Nome de arquivo e tipo, e nao so nome: "referencias.pdf" como Linha
   * editorial e como Referencias sao dois documentos legitimos, e o rotulo muda
   * como a IA le o conteudo (parte 126).
   */
  function jaExiste(nome: string, tipo: string): Documento | undefined {
    return documentos.find((d) => d.title === nome && d.type === tipo);
  }

  async function subirDocumento(arquivo: File, decisao?: { trocar?: Documento; forcar?: boolean }) {
    if (arquivo.size > 20 * 1024 * 1024) {
      toast.error("O PDF pode ter no máximo 20 MB.");
      return;
    }
    const trocar = decisao?.trocar;
    // AVISA, NAO BARRA. Subir o mesmo arquivo duas vezes e quase sempre engano,
    // mas as vezes e versao nova do mesmo documento, e barrar de vez impediria o
    // caso legitimo. Aceitar em silencio foi o que produziu os dois
    // demandou.pdf de 17/09.
    //
    // `forcar` e `trocar` sao as duas saidas do aviso, e as duas precisam pular
    // esta conferencia: sem isso, "Subir assim mesmo" cairia no mesmo aviso de
    // novo, para sempre.
    const repetido = trocar || decisao?.forcar ? undefined : jaExiste(arquivo.name, novoTipo);
    if (repetido) {
      setDuplicata({ arquivo, existente: repetido });
      return;
    }
    setDuplicata(null);
    setSubindo("documento");
    try {
      // Trocar e apagar o antigo ANTES de subir o novo, e nao depois: se o
      // upload falhar no meio, a pessoa fica sem os dois e sobe de novo, que e
      // recuperavel. Na ordem inversa uma falha na remocao deixaria os dois, que
      // e exatamente o estado que este botao existe para evitar.
      if (trocar) await apagarDocumento(trocar.id, { silencioso: true });

      await upload(`marca/${projectId}/documentos/${arquivo.name}`, arquivo, {
        access: "private",
        handleUploadUrl: `/api/projects/${projectId}/marca`,
        clientPayload: JSON.stringify({ kind: "documento", type: novoTipo, title: arquivo.name }),
      });
      // A compilacao roda no servidor depois do upload. Ate a linha existir no
      // banco o arquivo fica como PENDENTE, sem botao de apagar, porque ainda
      // nao ha nada para apagar. O relogio acima busca o resto.
      setPendentes((p) => [{ chave: `${Date.now()}`, type: novoTipo, title: arquivo.name }, ...p]);
      toast.success("PDF enviado. A IA está lendo.");
      void recarregar();
    } catch {
      toast.error("Não consegui subir o PDF. Tente de novo.");
    } finally {
      setSubindo(null);
    }
  }

  /** Tira o documento do projeto, e o PDF sai junto do storage (a rota cuida). */
  async function apagarDocumento(contextId: string, opcoes?: { silencioso?: boolean }) {
    setApagando(contextId);
    try {
      const r = await fetch(`/api/projects/${projectId}/context`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contextId }),
      });
      if (!r.ok) throw new Error("erro");
      setDocumentos((d) => d.filter((x) => x.id !== contextId));
      setConfirmando(null);
      if (!opcoes?.silencioso) toast.success("Documento removido.");
    } catch {
      toast.error("Não consegui remover o documento. Tente de novo.");
    } finally {
      setApagando(null);
    }
  }

  async function salvarTexto() {
    if (!novoTitulo.trim() || !novoTexto.trim()) return;
    setSalvandoTexto(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/context`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: novoTipo, title: novoTitulo.trim(), rawInput: novoTexto.trim() }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "erro");
      // O texto colado e compilado NA PROPRIA requisicao, entao aqui o "pronto"
      // nao e palpite: a resposta so volta depois de o documento existir. Quem
      // nunca podia afirmar isso era o PDF, que compila no servidor depois.
      setDocumentos((d) => [
        {
          id: data.context?.id ?? `t-${Date.now()}`,
          type: novoTipo,
          title: novoTitulo.trim(),
          status: data.context?.status ?? "pronto",
        },
        ...d,
      ]);
      setNovoTitulo("");
      setNovoTexto("");
      toast.success("Documento salvo e compilado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não consegui salvar.");
    } finally {
      setSalvandoTexto(false);
    }
  }

  async function tirar(o: "logo" | "manual") {
    // O logo tem rota propria desde 17/09, porque vive no store publico. Sair
    // pela rota antiga deixaria o arquivo la e o banco apontando para nada.
    const url =
      o === "logo"
        ? `/api/projects/${projectId}/logo`
        : `/api/projects/${projectId}/marca?o=manual`;
    await fetch(url, { method: "DELETE" });
    if (o === "logo") setLogo(null);
    else setManual(null);
  }

  const rotuloDoTipo = (t: string) => TIPOS.find((x) => x.id === t)?.rotulo ?? (t === "brand" ? "Manual de marca" : t);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-[var(--text-primary)] mb-1">
          Marca: o que a IA precisa saber para parecer você
        </h2>
        <p className="text-sm text-[var(--text-muted)]">
          Cores, logo e os documentos que definem a sua identidade. Quanto mais contexto aqui, menos
          correção depois.
        </p>
      </div>

      {/* Cores */}
      <section className="rounded-xl border p-6 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div>
          <p className="text-base font-bold text-[var(--text-primary)]">Suas cores</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">Clique numa cor para trocar. Vão para imagens, carrosséis e legendas.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          {cores.map((cor, i) => (
            <label key={`${cor}-${i}`} className="flex flex-col items-center gap-1.5 cursor-pointer">
              <span
                className="block h-14 w-14 rounded-xl border"
                style={{ background: cor, borderColor: i === 0 ? "var(--accent-orange)" : "var(--border)", borderWidth: i === 0 ? 2 : 1 }}
              />
              <input
                type="color"
                value={/^#[0-9a-f]{6}$/i.test(cor) ? cor : "#000000"}
                onChange={(e) => trocarCor(i, e.target.value)}
                className="sr-only"
              />
              <span className="text-[11px] font-mono text-[var(--text-muted)]">{cor.toUpperCase()}</span>
            </label>
          ))}
          {cores.length < 5 && (
            <button
              type="button"
              onClick={() => set("colorPalette", [...cores, "#888888"].join(","))}
              className="flex flex-col items-center gap-1.5"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-xl border border-dashed" style={{ borderColor: "var(--border)" }}>
                <Plus className="h-4 w-4 text-[var(--text-muted)]" />
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">adicionar</span>
            </button>
          )}
        </div>
        <Input
          label="Ou cole os hex, separados por vírgula"
          value={form.colorPalette}
          onChange={(e) => set("colorPalette", e.target.value)}
          className="font-mono"
        />
      </section>

      {/* Logo e manual */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="rounded-xl border p-6 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div>
            <p className="text-base font-bold text-[var(--text-primary)]">Logo</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">PNG ou SVG com fundo transparente. Entra na capa do vídeo e nas peças.</p>
          </div>
          <input ref={inputLogo} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && void subirLogo(e.target.files[0])} />
          {logo ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo} alt="Logo" className="h-12 max-w-[160px] object-contain" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => inputLogo.current?.click()} loading={subindo === "logo"}>Trocar</Button>
                <Button variant="ghost" size="sm" onClick={() => void tirar("logo")}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputLogo.current?.click()}
              disabled={subindo === "logo"}
              className="flex h-[140px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
            >
              <ImageIcon className="h-6 w-6 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">{subindo === "logo" ? "Subindo..." : "Clique para escolher"}</span>
              <span className="text-[11px] text-[var(--text-muted)]">até 5 MB</span>
            </button>
          )}
        </section>

        <section className="rounded-xl border p-6 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
          <div>
            <p className="text-base font-bold text-[var(--text-primary)]">Manual de marca</p>
            <p className="text-sm text-[var(--text-muted)] mt-1">PDF. A IA lê tipografia, tom e o que não pode.</p>
          </div>
          <input ref={inputManual} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && void subir("manual", e.target.files[0])} />
          {manual ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border p-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="h-[18px] w-[18px] shrink-0 text-orange-400" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{manual}</p>
                  <p className="text-[11px] text-green-400">lido pela IA</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => inputManual.current?.click()} loading={subindo === "manual"}>Trocar</Button>
                <Button variant="ghost" size="sm" onClick={() => void tirar("manual")}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputManual.current?.click()}
              disabled={subindo === "manual"}
              className="flex h-[140px] w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed"
              style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}
            >
              <Upload className="h-6 w-6 text-[var(--text-muted)]" />
              <span className="text-sm font-medium text-[var(--text-primary)]">{subindo === "manual" ? "Subindo..." : "Clique para escolher"}</span>
              <span className="text-[11px] text-[var(--text-muted)]">PDF, até 20 MB. Sem manual, a IA se vira com o logo e as cores.</span>
            </button>
          )}
        </section>
      </div>

      {/* Documentos para a IA */}
      <section className="rounded-xl border p-6 space-y-4" style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div>
          <p className="text-base font-bold text-[var(--text-primary)]">Documentos para a IA aprender com você</p>
          <p className="text-sm text-[var(--text-muted)] mt-1">
            Apresentações, artigos seus, normas do setor, posts que deram certo. PDF ou texto colado. Tudo entra no contexto de toda campanha.
          </p>
        </div>

        {(documentos.length > 0 || pendentes.length > 0) && (
          <div className="space-y-2">
            {documentos.map((d) =>
              confirmando === d.id ? (
                // A LINHA VIRA A PERGUNTA, em vez de um modal por cima. O nome do
                // arquivo fica na frente enquanto a pessoa decide, que e o unico
                // jeito de ela nao apagar o documento errado numa lista de cinco
                // nomes parecidos. A frase diz a CONSEQUENCIA, nao a acao.
                <div
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-3.5 py-3"
                  style={{ background: "var(--bg-input)", borderColor: "#f87171" }}
                >
                  <span className="text-sm text-[var(--text-primary)]">
                    Apagar <b className="font-semibold">{d.title}</b>? Ele sai das próximas campanhas.
                  </span>
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setConfirmando(null)}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void apagarDocumento(d.id)}
                      loading={apagando === d.id}
                      className="!bg-red-700 hover:!bg-red-800 !text-white"
                    >
                      Apagar
                    </Button>
                  </div>
                </div>
              ) : (
                <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{rotuloDoTipo(d.type)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--text-primary)]">{d.title}</p>
                      {d.status === "falhou" && d.erro && (
                        <p className="truncate text-[11px] text-[var(--text-muted)]">{d.erro}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <EstadoDoDocumento status={d.status} />
                    <button
                      type="button"
                      onClick={() => setConfirmando(d.id)}
                      aria-label={`Apagar ${d.title}`}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-red-500/15 hover:text-red-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500"
                    >
                      <Trash2 className="h-[15px] w-[15px]" />
                    </button>
                  </div>
                </div>
              )
            )}

            {/* O PDF que subiu e ainda nao virou linha no banco. Sem botao de
                apagar de proposito: ainda nao ha o que apagar, e oferecer um
                botao que nao tem alvo foi metade do defeito de 17/09. */}
            {pendentes.map((p) => (
              <div key={p.chave} className="flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3" style={{ background: "var(--bg-input)", borderColor: "var(--border)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>{rotuloDoTipo(p.type)}</span>
                  <span className="truncate text-sm text-[var(--text-primary)]">{p.title}</span>
                </div>
                <EstadoDoDocumento status="enviado" />
              </div>
            ))}
          </div>
        )}

        {duplicata && (
          <div
            className="flex gap-3 rounded-xl border px-3.5 py-3"
            style={{ background: "rgba(161,98,7,.14)", borderColor: "rgba(250,204,21,.35)" }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 text-yellow-400 mt-0.5" />
            <div className="space-y-2.5 min-w-0">
              <p className="text-sm text-[var(--text-primary)]">
                Voce ja tem um <b className="font-semibold">{duplicata.existente.title}</b> como{" "}
                {rotuloDoTipo(duplicata.existente.type).toLowerCase()}.
                <span className="mt-1 block text-[12.5px] text-[var(--text-muted)]">
                  Subir de novo põe o mesmo texto duas vezes no contexto de toda campanha. Se for
                  uma versão nova, troque pelo novo.
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setDuplicata(null)}>
                  Cancelar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void subirDocumento(duplicata.arquivo, { forcar: true })}
                  loading={subindo === "documento"}
                >
                  Subir assim mesmo
                </Button>
                <Button
                  size="sm"
                  onClick={() => void subirDocumento(duplicata.arquivo, { trocar: duplicata.existente })}
                  loading={subindo === "documento"}
                >
                  Trocar pelo novo
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[180px_1fr]">
          <select
            value={novoTipo}
            onChange={(e) => setNovoTipo(e.target.value)}
            className="h-10 rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            style={{ background: "var(--bg-input)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {TIPOS.map((t) => (
              <option key={t.id} value={t.id}>{t.rotulo}</option>
            ))}
          </select>
          <Input value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} placeholder="Título, ex.: Pilares de conteúdo 2026" />
        </div>
        <Textarea
          value={novoTexto}
          onChange={(e) => setNovoTexto(e.target.value)}
          placeholder="Cole o texto aqui, ou suba um PDF pelo botão ao lado."
          className="min-h-[96px]"
        />
        {/* O `value = ""` depois de ler o arquivo e obrigatorio aqui: sem ele,
            escolher o MESMO arquivo de novo nao dispara onChange (o valor nao
            mudou), e o aviso de duplicata deixaria a pessoa presa, sem conseguir
            nem repetir de proposito. */}
        <input
          ref={inputDoc}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            e.target.value = "";
            if (arquivo) void subirDocumento(arquivo);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void salvarTexto()} loading={salvandoTexto} disabled={!novoTitulo.trim() || !novoTexto.trim()}>
            Salvar texto
          </Button>
          <Button variant="outline" onClick={() => inputDoc.current?.click()} loading={subindo === "documento"}>
            <Upload className="h-3.5 w-3.5" />
            Subir PDF como {rotuloDoTipo(novoTipo).toLowerCase()}
          </Button>
        </div>
      </section>
    </div>
  );
}
