import { prisma } from "@/lib/db/prisma";
import { componentesDoEnvio, IDIOMA_DOS_MODELOS, MODELOS, textoDoModelo, type ChaveDoModelo } from "@/lib/whatsapp/modelos";

/**
 * O ENVIO PELO WHATSAPP (01/10), pela API oficial do WhatsApp Business da Meta
 * (Cloud API). PRONTO E DESLIGADO: liga quando existirem WHATSAPP_TOKEN e
 * WHATSAPP_PHONE_NUMBER_ID. Sem elas, cada envio vira SIMULADO: devolve o
 * texto que teria saído, escreve no log e não quebra nada. O e-mail da régua
 * sai igual, com ou sem WhatsApp.
 *
 * NUNCA LANÇA, pelo mesmo motivo de lib/email: o alerta é acessório da
 * reunião, e uma falha da Meta não pode derrubar a marcação nem o cron.
 *
 * O BLOQUEIO (quem respondeu PARAR) é conferido aqui, no último passo, para
 * nenhum caminho novo esquecer de conferir. Só vale para lead: o número do
 * time é da casa.
 */

const API = "https://graph.facebook.com";

export function whatsappLigado(): boolean {
  return Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID) && process.env.WHATSAPP_SIMULAR !== "1";
}

function versao(): string {
  // v26.0 é a versão atual da Graph API em out/2026; a Meta mantém cada versão
  // por cerca de 2 anos. Troca pela variável, sem deploy de código.
  return process.env.WHATSAPP_API_VERSION || "v26.0";
}

export type ResultadoDoWhatsapp = {
  canal: "whatsapp";
  para: string;
  modelo: string;
  ok: boolean;
  simulado?: boolean;
  bloqueado?: boolean;
  id?: string;
  erro?: string;
  texto: string;
};

export async function numeroBloqueado(numero: string): Promise<boolean> {
  const b = await prisma.bloqueioDeWhatsapp.findUnique({ where: { numero } }).catch(() => null);
  return Boolean(b);
}

/**
 * Manda um modelo aprovado. `simular` força o modo simulado (reunião de teste).
 * `lado` decide se o bloqueio vale (lead) ou não (time).
 */
export async function enviarModelo(args: {
  para: string;
  chave: ChaveDoModelo;
  valores: string[];
  sufixos?: string[];
  lado: "lead" | "time";
  simular?: boolean;
}): Promise<ResultadoDoWhatsapp> {
  const m = MODELOS[args.chave];
  const texto = textoDoModelo(args.chave, args.valores, args.sufixos);
  const base = { canal: "whatsapp" as const, para: args.para, modelo: m.nome, texto };

  if (args.lado === "lead" && (await numeroBloqueado(args.para))) {
    return { ...base, ok: false, bloqueado: true, erro: "O número pediu para não receber (PARAR)." };
  }
  if (args.simular || !whatsappLigado()) {
    console.log(`[whatsapp] SIMULADO (${m.nome}) para ${args.para}:\n${texto}`);
    return { ...base, ok: true, simulado: true };
  }
  try {
    const r = await fetch(`${API}/${versao()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: args.para,
        type: "template",
        template: { name: m.nome, language: { code: IDIOMA_DOS_MODELOS }, components: componentesDoEnvio(args.chave, args.valores, args.sufixos) },
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const d = (await r.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string; code?: number; error_data?: { details?: string } } };
    if (!r.ok || !d.messages?.[0]?.id) {
      // 132001 = modelo não existe (ou não aprovado) nesse idioma; 132000 =
      // número de parâmetros diferente do cadastrado; 131026 = o número não
      // tem WhatsApp. O código vai junto para o registro do alerta.
      const erro = `${d.error?.code ?? r.status}: ${d.error?.error_data?.details ?? d.error?.message ?? "sem detalhe"}`.slice(0, 300);
      console.error(`[whatsapp] ${m.nome} para ${args.para} falhou: ${erro}`);
      return { ...base, ok: false, erro };
    }
    return { ...base, ok: true, id: d.messages[0].id };
  } catch (e) {
    const erro = e instanceof Error ? e.message : String(e);
    console.error(`[whatsapp] ${m.nome} para ${args.para} falhou: ${erro}`);
    return { ...base, ok: false, erro: erro.slice(0, 300) };
  }
}

/**
 * Texto livre: SÓ dentro das 24 horas depois que a pessoa escreveu (janela de
 * atendimento). Usado para confirmar o PARAR, que é sempre resposta a ela.
 */
export async function enviarTextoNaJanela(para: string, texto: string): Promise<boolean> {
  if (!whatsappLigado()) {
    console.log(`[whatsapp] SIMULADO (texto livre) para ${para}: ${texto}`);
    return true;
  }
  try {
    const r = await fetch(`${API}/${versao()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: para, type: "text", text: { body: texto } }),
      signal: AbortSignal.timeout(10_000),
    });
    return r.ok;
  } catch {
    return false;
  }
}
