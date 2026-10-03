import { casca, titulo, paragrafo, separador, escapar, MARCA } from "@/lib/email/layout";
import { NOME_DA_FAIXA } from "@/lib/email/demonstracao";
import { emReais, REDES, type Resultado } from "@/lib/calculadora/custos";

/** As faixas de tamanho de time, como a pessoa leu no formulário (01/10). */
export const NOME_DO_TIME: Record<string, string> = {
  so_eu: "só eu",
  "2_10": "de 2 a 10 pessoas",
  "11_50": "de 11 a 50 pessoas",
  "51_200": "de 51 a 200 pessoas",
  acima_200: "mais de 200 pessoas",
};

type Lead = {
  email: string;
  telefone: string;
  cargo: string;
  setor: string;
  faturamento: string;
  tamanhoTime: string;
  origem: string | null;
};

/**
 * O AVISO DA CALCULADORA PARA O TIME (01/10): quem simulou, quanto a conta deu
 * e o link do WhatsApp. É o mesmo formato do aviso de demonstração, porque é o
 * mesmo trabalho do outro lado: ligar enquanto a pessoa ainda está pensando no
 * número que acabou de ver.
 */
export function emailCalculadoraParaTime(l: Lead, r: Resultado) {
  const zap = l.telefone.replace(/\D/g, "");
  const linkZap = `https://wa.me/${zap.startsWith("55") ? zap : `55${zap}`}`;
  const redes = r.entradas.redes.map((id) => REDES.find((x) => x.id === id)?.nome ?? id).join(", ") || "nenhuma marcada";
  const time = r.cenarios.find((c) => c.id === "time");
  const melhor = r.economia.reduce((a, b) => (b.reais > a.reais ? b : a), r.economia[0]);
  const linhas: Array<[string, string]> = [
    ["E-mail", l.email],
    ["WhatsApp", l.telefone],
    ["Cargo", l.cargo],
    ["Setor", l.setor],
    ["Faturamento", NOME_DA_FAIXA[l.faturamento] ?? l.faturamento],
    ["Tamanho do time", NOME_DO_TIME[l.tamanhoTime] ?? l.tamanhoTime],
    ["Veio de", l.origem ?? "direto"],
  ];
  const simulou: Array<[string, string]> = [
    ["Volume por mês", `${r.volume.textos} textos, ${r.volume.artes} artes, ${r.volume.cortes} vídeos curtos, ${r.volume.longos} vídeos longos`],
    ["Redes", redes],
    ...r.cenarios.map((c) => [c.nome, `${emReais(c.mensal)} por mês`] as [string, string]),
    [`Demandou (${r.demandou.nome}${r.demandou.sobMedida ? ", sob medida" : ""})`, `${emReais(r.demandou.mensal)} por mês`],
    ["Economia contra o time próprio", time ? `${emReais(r.economia[0].reais)} por mês (${r.economia[0].porcento}%)` : "-"],
  ];
  const tabela = (pares: Array<[string, string]>) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="font-size:15px;line-height:1.6">` +
    pares.map(([k, v]) => `<tr><td style="color:${MARCA.apagado};padding:3px 12px 3px 0;white-space:nowrap;vertical-align:top">${escapar(k)}</td><td>${escapar(v)}</td></tr>`).join("") +
    `</table>`;
  const assunto = `Calculadora: ${l.cargo}, ${l.setor} (${NOME_DA_FAIXA[l.faturamento] ?? l.faturamento})`;
  const texto = [
    assunto,
    "",
    ...linhas.map(([k, v]) => `${k}: ${v}`),
    "",
    "O que simulou:",
    ...simulou.map(([k, v]) => `${k}: ${v}`),
    "",
    `Chamar no WhatsApp: ${linkZap}`,
  ].join("\n");
  const miolo = [
    titulo(escapar(assunto)),
    tabela(linhas),
    separador(),
    paragrafo("<strong>O que simulou</strong>"),
    tabela(simulou),
    separador(),
    paragrafo(`A maior diferença foi contra ${melhor.id === "time" ? "o time próprio" : melhor.id === "agencia" ? "a agência" : "o freelancer"}: ${escapar(emReais(melhor.reais))} por mês.`),
    paragrafo(`<a href="${linkZap}" style="color:${MARCA.link};font-weight:600">Chamar no WhatsApp</a>`),
  ].join("\n");
  return {
    assunto,
    texto,
    html: casca({ previa: `${l.cargo} de ${l.setor} simulou ${emReais(time?.mensal ?? 0)} por mês com time próprio.`, miolo }),
  };
}
