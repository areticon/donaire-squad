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
 * A ASSINATURA DA DEMANDOU (05/10), opcional: com as duas variáveis abaixo, o
 * documento vai com dois signatários (o cliente primeiro, a Demandou depois)
 * e só vira "assinado" quando os dois assinarem.
 *
 *   CONTRATOS_ASSINANTE_NOME=<quem assina pela Demandou>
 *   CONTRATOS_ASSINANTE_EMAIL=<e-mail dessa pessoa>
 *
 * Só servidor: usa o token.
 */

export type Signatario = { nome: string; email: string };

export type EnvioParaAssinar = {
  /** Nome do documento no provedor. */
  titulo: string;
  /** O texto do contrato em Markdown: o que vai quando não há PDF, e a reserva se o PDF falhar. */
  markdown: string;
  /**
   * O PDF DA DEMANDOU (05/10): o contrato diagramado por nós (capa com a
   * logomarca, tabelas de verdade, rodapé com página N de M), gerado em
   * lib/contratos/pdf.ts. Com ele, o provedor recebe o arquivo pronto e não
   * desenha nada a partir do Markdown.
   */
  pdf?: Buffer | null;
  /** O id do contrato aqui, para o webhook achar de volta. */
  externoId: string;
  /** Na ordem de assinar: o cliente primeiro; a Demandou, quando configurada, depois. */
  signatarios: Signatario[];
};

export type ResultadoDoEnvio = {
  documentoId: string;
  /** Link de assinatura do primeiro signatário (também vai por e-mail). */
  linkDeAssinatura: string | null;
};

export type SituacaoNoProvedor = {
  /** "assinado" só quando TODOS os signatários assinaram (05/10). */
  situacao: "enviado" | "assinado" | "recusado";
  /** URL temporária do PDF assinado (a da ZapSign expira em 60 minutos). */
  pdfAssinadoUrl: string | null;
  assinadoEm: Date | null;
  /** Quantos já assinaram, de quantos. Para a trilha dizer "falta a Demandou". */
  assinaturas?: { feitas: number; total: number };
};

/**
 * A ASSINATURA DA DEMANDOU (05/10): o segundo signatário, opcional. Com
 * CONTRATOS_ASSINANTE_NOME e CONTRATOS_ASSINANTE_EMAIL definidos, todo
 * documento sai com dois signatários, o cliente primeiro e a Demandou depois,
 * e só vira "assinado" quando os dois assinarem. Sem as variáveis, continua
 * um só, como sempre foi.
 */
export function assinanteDaDemandou(): Signatario | null {
  const nome = process.env.CONTRATOS_ASSINANTE_NOME?.trim();
  const email = process.env.CONTRATOS_ASSINANTE_EMAIL?.trim().toLowerCase();
  if (!nome || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return { nome, email };
}

/** Os signatários de um documento: o cliente e, quando configurada, a Demandou. */
export function signatariosDoDocumento(cliente: Signatario): Signatario[] {
  const demandou = assinanteDaDemandou();
  // A mesma pessoa dos dois lados (teste com o próprio e-mail) assina uma vez só.
  if (!demandou || demandou.email === cliente.email.trim().toLowerCase()) return [cliente];
  return [cliente, demandou];
}

/** A marca na tela de assinatura da ZapSign: a logomarca pública e o laranja da Demandou. */
function marcaDaDemandou() {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "https://demandou.com").replace(/\/$/, "");
  return { brand_name: "Demandou", brand_primary_color: "#ef6122", brand_logo: `${base}/logo.png` };
}

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

  // A API responde em inglês ("signed") e a documentação dos SDKs em
  // português ("assinado"); aceitar os dois custa nada e evita um contrato
  // que nunca vira assinado por causa de uma palavra.
  const docAssinado = (s: string) => s === "signed" || s === "assinado";
  const docRecusado = (s: string) => s === "refused" || s === "recusado";
  const signatarioAssinou = (s: { status?: string; signed_at?: string | null }) => Boolean(s.signed_at) || s.status === "signed" || s.status === "assinou";

  return {
    nome: "zapsign",
    ambiente: producao ? "producao" : "teste",
    async enviar(e) {
      const ordenado = e.signatarios.length > 1;
      const doc = await pedir<Doc>("/docs/", {
        method: "POST",
        body: JSON.stringify({
          name: e.titulo.slice(0, 250),
          // O PDF da Demandou (05/10) quando existe; o Markdown é a reserva.
          ...(e.pdf ? { base64_pdf: e.pdf.toString("base64") } : { markdown_text: e.markdown }),
          lang: "pt-br",
          external_id: e.externoId,
          ...marcaDaDemandou(),
          // Recusar com motivo é melhor que o silêncio: o motivo vem no webhook.
          allow_refuse_signature: true,
          // Dois signatários assinam em ordem: o cliente primeiro, a Demandou depois.
          signature_order_active: ordenado,
          signers: e.signatarios.map((s, i) => ({
            name: s.nome,
            email: s.email,
            // Assinatura na tela com código por e-mail: sem custo e com uma
            // segunda prova de identidade (o e-mail é de quem assina).
            auth_mode: "assinaturaTela-tokenEmail",
            send_automatic_email: true,
            ...(ordenado ? { order_group: i } : {}),
          })),
        }),
      });
      return { documentoId: doc.token, linkDeAssinatura: doc.signers?.[0]?.sign_url ?? null };
    },
    async consultar(documentoId) {
      const doc = await pedir<Doc>(`/docs/${encodeURIComponent(documentoId)}/`);
      const signers = doc.signers ?? [];
      const feitas = signers.filter(signatarioAssinou).length;
      // O documento só é "assinado" quando o provedor fecha E todos assinaram (05/10):
      // com a Demandou como segunda signatária, a assinatura do cliente sozinha não basta.
      const assinado = docAssinado(doc.status) && (signers.length === 0 || feitas === signers.length);
      const recusado = docRecusado(doc.status);
      const ultima = signers.map((s) => s.signed_at).filter(Boolean).sort().at(-1) ?? null;
      return {
        situacao: assinado ? "assinado" : recusado ? "recusado" : "enviado",
        pdfAssinadoUrl: assinado ? (doc.signed_file ?? null) : null,
        assinadoEm: assinado ? new Date(ultima ?? doc.last_update_at ?? Date.now()) : null,
        assinaturas: { feitas, total: signers.length },
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
