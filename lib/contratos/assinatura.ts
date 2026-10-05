/**
 * A ASSINATURA ELETRÔNICA DO CONTRATO, ATRÁS DE UMA INTERFACE (02/10/2026).
 *
 * O gestor de contratos fala com "um provedor de assinatura", e não com uma
 * marca. Hoje existe a implementação da ZapSign (a recomendada na pesquisa de
 * 02/10: API simples, aceita o texto em Markdown, ambiente de teste grátis,
 * certificado ICP-Brasil opcional). Trocar de provedor é escrever outra
 * implementação desta interface e apontar ASSINATURA_PROVEDOR para ela.
 *
 * SEM CHAVE, NADA QUEBRA: provedorDeAssinatura() devolve null, e o contrato
 * fica "aguardando provedor" até a chave existir (mesmo desenho do e-mail e do
 * WhatsApp, que sobem desligados). Ligar:
 *
 *   ASSINATURA_PROVEDOR=zapsign
 *   ZAPSIGN_API_TOKEN=<token de Configurações > Integrações > API ZapSign>
 *   ZAPSIGN_AMBIENTE=sandbox | producao   (padrão: sandbox)
 *   ASSINATURA_WEBHOOK_SEGREDO=<texto longo qualquer, o mesmo cadastrado no webhook>
 *
 * Só servidor: usa o token.
 */

export type Signatario = { nome: string; email: string };

export type EnvioParaAssinar = {
  /** Nome do documento no provedor. */
  titulo: string;
  /** O texto do contrato em Markdown. */
  markdown: string;
  /** O id do contrato aqui, para o webhook achar de volta. */
  externoId: string;
  signatarios: Signatario[];
};

export type ResultadoDoEnvio = {
  documentoId: string;
  /** Link de assinatura do primeiro signatário (também vai por e-mail). */
  linkDeAssinatura: string | null;
};

export type SituacaoNoProvedor = {
  situacao: "enviado" | "assinado" | "recusado";
  /** URL temporária do PDF assinado (a da ZapSign expira em 60 minutos). */
  pdfAssinadoUrl: string | null;
  assinadoEm: Date | null;
};

export interface ProvedorDeAssinatura {
  nome: string;
  /** "teste" no ambiente de testes do provedor, sem validade jurídica. */
  ambiente: "teste" | "producao";
  enviar(envio: EnvioParaAssinar): Promise<ResultadoDoEnvio>;
  consultar(documentoId: string): Promise<SituacaoNoProvedor>;
  /**
   * Cancela um envio que ainda não foi assinado (04/10): a versão nova do
   * contrato sai, e o link antigo não pode continuar assinável.
   */
  cancelar(documentoId: string): Promise<void>;
  /** Lê o corpo do webhook: devolve o documento a reconsultar, ou null. */
  lerWebhook(corpo: unknown): { documentoId: string; externoId: string | null; evento: string } | null;
}

export class FalhaDoProvedor extends Error {}

// ---------------------------------------------------------------------------
// ZapSign (https://docs.zapsign.com.br)
// ---------------------------------------------------------------------------

function zapsign(): ProvedorDeAssinatura | null {
  const token = process.env.ZAPSIGN_API_TOKEN;
  if (!token) return null;
  const producao = process.env.ZAPSIGN_AMBIENTE === "producao";
  const base = producao ? "https://api.zapsign.com.br/api/v1" : "https://sandbox.api.zapsign.com.br/api/v1";
  const cabecalho = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  async function pedir<T>(caminho: string, init?: RequestInit): Promise<T> {
    const r = await fetch(`${base}${caminho}`, { ...init, headers: cabecalho, signal: AbortSignal.timeout(20_000) });
    const texto = await r.text();
    if (!r.ok) throw new FalhaDoProvedor(`ZapSign ${r.status}: ${texto.slice(0, 300)}`);
    return JSON.parse(texto) as T;
  }

  type Doc = {
    token: string;
    status: string;
    signed_file?: string | null;
    last_update_at?: string | null;
    signers?: Array<{ sign_url?: string; status?: string; signed_at?: string | null }>;
  };

  return {
    nome: "zapsign",
    ambiente: producao ? "producao" : "teste",
    async enviar(e) {
      const doc = await pedir<Doc>("/docs/", {
        method: "POST",
        body: JSON.stringify({
          name: e.titulo.slice(0, 250),
          markdown_text: e.markdown,
          lang: "pt-br",
          external_id: e.externoId,
          // Recusar com motivo é melhor que o silêncio: o motivo vem no webhook.
          allow_refuse_signature: true,
          signers: e.signatarios.map((s) => ({
            name: s.nome,
            email: s.email,
            // Assinatura na tela com código por e-mail: sem custo e com uma
            // segunda prova de identidade (o e-mail é de quem assina).
            auth_mode: "assinaturaTela-tokenEmail",
            send_automatic_email: true,
          })),
        }),
      });
      return { documentoId: doc.token, linkDeAssinatura: doc.signers?.[0]?.sign_url ?? null };
    },
    async consultar(documentoId) {
      const doc = await pedir<Doc>(`/docs/${encodeURIComponent(documentoId)}/`);
      const assinado = doc.status === "signed";
      const recusado = doc.status === "refused";
      const ultima = doc.signers?.map((s) => s.signed_at).filter(Boolean).sort().at(-1) ?? null;
      return {
        situacao: assinado ? "assinado" : recusado ? "recusado" : "enviado",
        pdfAssinadoUrl: assinado ? (doc.signed_file ?? null) : null,
        assinadoEm: assinado ? new Date(ultima ?? doc.last_update_at ?? Date.now()) : null,
      };
    },
    async cancelar(documentoId) {
      // "Excluir documento" da ZapSign: o link de assinatura deixa de valer.
      const r = await fetch(`${base}/docs/${encodeURIComponent(documentoId)}/`, { method: "DELETE", headers: cabecalho, signal: AbortSignal.timeout(20_000) });
      if (!r.ok && r.status !== 404) throw new FalhaDoProvedor(`ZapSign ${r.status}: ${(await r.text()).slice(0, 300)}`);
    },
    lerWebhook(corpo) {
      const c = (corpo ?? {}) as { token?: unknown; external_id?: unknown; event_type?: unknown };
      if (typeof c.token !== "string") return null;
      return { documentoId: c.token, externoId: typeof c.external_id === "string" ? c.external_id : null, evento: String(c.event_type ?? "") };
    },
  };
}

// ---------------------------------------------------------------------------
// Simulado (04/10): SÓ fora de produção, para provar o fluxo inteiro sem chave
// da ZapSign. O envio não sai para ninguém; a assinatura chega pelo MESMO
// webhook (/api/webhooks/assinatura, com o segredo), no formato da ZapSign
// ({ token, external_id, event_type: "doc_signed" }), e a reconsulta lê o que
// o webhook deixou. Em produção, ASSINATURA_PROVEDOR=simulado devolve null:
// assinatura sem validade jurídica nunca chega a cliente de verdade.
// ---------------------------------------------------------------------------

const EVENTOS_SIMULADOS: Map<string, string> = ((globalThis as { __assinaturaSimulada?: Map<string, string> }).__assinaturaSimulada ??= new Map());

const ENVIOS_SIMULADOS: Map<string, number> = ((globalThis as { __enviosSimulados?: Map<string, number> }).__enviosSimulados ??= new Map());

function simulado(): ProvedorDeAssinatura | null {
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production") return null;
  return {
    nome: "simulado",
    ambiente: "teste",
    async enviar(e) {
      // Um id por envio: o reenvio da versão nova não pode herdar o "assinado" do envio cancelado.
      const n = (ENVIOS_SIMULADOS.get(e.externoId) ?? 0) + 1;
      ENVIOS_SIMULADOS.set(e.externoId, n);
      return { documentoId: n === 1 ? `sim_${e.externoId}` : `sim_${e.externoId}_v${n}`, linkDeAssinatura: null };
    },
    async cancelar(documentoId) {
      EVENTOS_SIMULADOS.set(documentoId, "doc_deleted");
    },
    async consultar(documentoId) {
      const evento = EVENTOS_SIMULADOS.get(documentoId);
      const assinado = evento === "doc_signed";
      return { situacao: assinado ? "assinado" : evento === "doc_refused" ? "recusado" : "enviado", pdfAssinadoUrl: null, assinadoEm: assinado ? new Date() : null };
    },
    lerWebhook(corpo) {
      const c = (corpo ?? {}) as { token?: unknown; external_id?: unknown; event_type?: unknown };
      if (typeof c.token !== "string") return null;
      const evento = String(c.event_type ?? "");
      EVENTOS_SIMULADOS.set(c.token, evento);
      return { documentoId: c.token, externoId: typeof c.external_id === "string" ? c.external_id : null, evento };
    },
  };
}

/** O provedor ligado, ou null quando falta a chave (o contrato aguarda). */
export function provedorDeAssinatura(): ProvedorDeAssinatura | null {
  const escolhido = (process.env.ASSINATURA_PROVEDOR ?? "zapsign").toLowerCase();
  if (escolhido === "zapsign") return zapsign();
  if (escolhido === "simulado") return simulado();
  return null;
}
