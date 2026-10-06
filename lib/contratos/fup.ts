/**
 * O ACOMPANHAMENTO (FUP, follow-up) DAS COBRANÇAS DE CONTRATO (05/10/2026),
 * a parte PURA: a cadência, a conta do próximo acompanhamento, os nomes na
 * tela e os textos de WhatsApp. Sem banco e sem rede: a tela do admin, a
 * régua do cron e a prova usam a mesma conta. O que lê e grava mora em
 * lib/contratos/cobrancas.ts.
 *
 * O que cai em cobrança:
 *  - "assinatura": contrato enviado e sem assinatura;
 *  - "entrada": contrato assinado e sem pagamento (a entrada ou o valor à vista);
 *  - "parcela": uma parcela do cartão falhou e ainda não foi paga.
 *
 * A CADÊNCIA PADRÃO, contada do envio (ou da assinatura, ou do atraso): D+1,
 * D+3, D+7 e D+14, e daí a cada 7 dias. O próximo acompanhamento é a primeira
 * data da cadência depois do último acompanhamento feito (por qualquer canal,
 * manual ou automático). Quando ela já passou, o acompanhamento está VENCIDO
 * e o painel avisa.
 */

export const MOTIVOS_DA_COBRANCA = ["assinatura", "entrada", "parcela"] as const;
export type MotivoDaCobranca = (typeof MOTIVOS_DA_COBRANCA)[number];

export const NOME_DO_MOTIVO: Record<MotivoDaCobranca, string> = {
  assinatura: "Enviado, sem assinatura",
  entrada: "Assinado, sem pagamento",
  parcela: "Parcela em atraso",
};

export const CANAIS_DO_FUP = ["ligacao", "whatsapp", "email"] as const;
export type CanalDoFup = (typeof CANAIS_DO_FUP)[number];
export const NOME_DO_CANAL: Record<CanalDoFup, string> = { ligacao: "Ligação", whatsapp: "WhatsApp", email: "E-mail" };

export function ehCanalDoFup(v: unknown): v is CanalDoFup {
  return typeof v === "string" && (CANAIS_DO_FUP as readonly string[]).includes(v);
}

/** O que aconteceu no acompanhamento, na língua do vendedor. */
export const RESULTADOS_DO_FUP = {
  sem_resposta: "Sem resposta",
  mensagem_enviada: "Mensagem enviada, aguardando",
  conversou: "Conversou, segue em análise",
  vai_assinar: "Vai assinar",
  vai_pagar: "Vai pagar",
  pediu_prazo: "Pediu prazo",
  pediu_mudanca: "Pediu mudança no contrato",
  recusou: "Recusou",
} as const;
export type ResultadoDoFup = keyof typeof RESULTADOS_DO_FUP;

export function ehResultadoDoFup(v: unknown): v is ResultadoDoFup {
  return typeof v === "string" && v in RESULTADOS_DO_FUP;
}

export type Cadencia = {
  /** Os dias depois da base com acompanhamento marcado. */
  dias: number[];
  /** Depois do último dia marcado, a cada quantos dias. */
  depois: number;
};

export const CADENCIA_PADRAO: Cadencia = { dias: [1, 3, 7, 14], depois: 7 };

/** Até quantos dias depois da base o acompanhamento AUTOMÁTICO ainda sai. Depois disso, só o vendedor. */
export const TETO_DO_AUTOMATICO_EM_DIAS = 60;

export const DIA = 24 * 60 * 60 * 1000;

/** As datas da cadência a partir da base, até o teto (inclusive). */
export function datasDaCadencia(base: Date, cadencia: Cadencia = CADENCIA_PADRAO, tetoEmDias = TETO_DO_AUTOMATICO_EM_DIAS): Date[] {
  const dias = [...cadencia.dias].filter((d) => d > 0).sort((a, b) => a - b);
  if (!dias.length) return [];
  let ultimo = dias[dias.length - 1];
  while (cadencia.depois > 0 && ultimo + cadencia.depois <= tetoEmDias) {
    ultimo += cadencia.depois;
    dias.push(ultimo);
  }
  return dias.filter((d) => d <= tetoEmDias).map((d) => new Date(base.getTime() + d * DIA));
}

export type ContaDoFup = {
  /** O próximo acompanhamento previsto. */
  proximoEm: Date;
  /** O passo da cadência (1 = D+1); null depois do teto (segue a cada `depois` dias). */
  passo: number | null;
  vencido: boolean;
  /** Dias de atraso do acompanhamento (0 quando não venceu). */
  diasVencido: number;
  /** Dias desde a base (o envio, a assinatura ou o atraso). */
  diasSemResposta: number;
};

/**
 * A CONTA DO PRÓXIMO ACOMPANHAMENTO: a primeira data da cadência depois do
 * último acompanhamento feito (ou depois da base, quando nenhum foi feito).
 * Passado o teto, segue a cada `depois` dias contados do último.
 */
export function contaDoFup(base: Date, ultimoFupEm: Date | null, agora = new Date(), cadencia: Cadencia = CADENCIA_PADRAO): ContaDoFup {
  const referencia = ultimoFupEm && ultimoFupEm.getTime() > base.getTime() ? ultimoFupEm : base;
  const datas = datasDaCadencia(base, cadencia);
  const indice = datas.findIndex((d) => d.getTime() > referencia.getTime());
  const proximoEm = indice >= 0 ? datas[indice] : new Date(referencia.getTime() + Math.max(1, cadencia.depois) * DIA);
  const vencido = proximoEm.getTime() <= agora.getTime();
  return {
    proximoEm,
    passo: indice >= 0 ? indice + 1 : null,
    vencido,
    diasVencido: vencido ? Math.floor((agora.getTime() - proximoEm.getTime()) / DIA) : 0,
    diasSemResposta: Math.max(0, Math.floor((agora.getTime() - base.getTime()) / DIA)),
  };
}

/**
 * O PASSO AUTOMÁTICO QUE VENCEU: o último passo da cadência cuja data já
 * chegou (se o cron ficou parado e dois passos venceram, só o mais recente
 * sai: preferimos perder um a mandar dois). null quando nenhum venceu ou
 * quando a base já passou do teto.
 */
export function passoAutomaticoDevido(base: Date, agora = new Date(), cadencia: Cadencia = CADENCIA_PADRAO): { passo: number; em: Date; inicioDaJanela: Date } | null {
  const datas = datasDaCadencia(base, cadencia);
  let indice = -1;
  for (let i = 0; i < datas.length; i++) if (datas[i].getTime() <= agora.getTime()) indice = i;
  if (indice < 0) return null;
  return { passo: indice + 1, em: datas[indice], inicioDaJanela: indice > 0 ? datas[indice - 1] : base };
}

/**
 * O HORÁRIO EM QUE O AUTOMÁTICO SAI: de segunda a sexta, das 8h às 18h59 de
 * Brasília. Fora disso o passo espera a próxima janela (o cliente não recebe
 * cobrança de madrugada nem no fim de semana).
 */
export function horarioComercial(agora = new Date()): boolean {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour12: false, weekday: "short", hour: "numeric" }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0") % 24;
  if (dia === "Sat" || dia === "Sun") return false;
  return hora >= 8 && hora < 19;
}

/** "tel:+5511987654321" para o número no formato da Meta (só dígitos, com 55). */
export function linkDeLigacao(numero: string | null): string | null {
  return numero ? `tel:+${numero.replace(/\D/g, "")}` : null;
}

/** "https://wa.me/5511987654321?text=..." com a mensagem pronta (ou só o número). */
export function linkDoWhatsapp(numero: string | null, texto?: string | null): string | null {
  if (!numero) return null;
  const n = numero.replace(/\D/g, "");
  return texto ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : `https://wa.me/${n}`;
}

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type DadosDaMensagem = {
  motivo: MotivoDaCobranca;
  nome: string | null;
  numero: number;
  plano: string;
  valorCentavos: number;
  /** O link de assinatura (assinatura) ou de pagamento (entrada), quando há. */
  link: string | null;
  closerNome: string | null;
};

/**
 * A MENSAGEM DE WHATSAPP, curta e cordial, para o vendedor mandar do próprio
 * celular (o botão abre o wa.me com ela pronta). É a mesma que o envio
 * automático usará quando o WhatsApp da cobrança for ligado (ver o TODO em
 * lib/contratos/cobrancas.ts).
 */
export function textoDoWhatsapp(d: DadosDaMensagem): string {
  const primeiro = (d.nome ?? "").trim().split(/\s+/)[0] || "";
  const oi = primeiro ? `Olá, ${primeiro}!` : "Olá!";
  const n = String(d.numero).padStart(4, "0");
  const quem = d.closerNome ? ` Aqui é ${d.closerNome.split(/\s+/)[0]}, da Demandou.` : " Aqui é da Demandou.";
  const linhas: string[] = [`${oi}${quem}`];
  if (d.motivo === "assinatura") {
    linhas.push(`Passando para saber se ficou alguma dúvida no contrato nº ${n} (plano ${d.plano}). Ele está pronto para assinar${d.link ? ` neste link: ${d.link}` : ""}.`);
    linhas.push("Se preferir, me diga um horário e eu ligo para alinhar.");
  } else if (d.motivo === "entrada") {
    linhas.push(`O contrato nº ${n} (plano ${d.plano}, ${reais(d.valorCentavos)} por ano) já está assinado. Falta só o pagamento para liberar o acesso${d.link ? `: ${d.link}` : "."}`);
    linhas.push("Se já pagou, me manda o comprovante que eu registro na hora.");
  } else {
    linhas.push(`Uma parcela do contrato nº ${n} não entrou no cartão. O sistema tenta de novo sozinho, mas se o cartão mudou é só me avisar que eu mando o link para atualizar.`);
  }
  linhas.push("Obrigado!");
  return linhas.join("\n");
}
