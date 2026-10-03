/**
 * OS MODELOS DE MENSAGEM DO WHATSAPP DA RÉGUA DA DEMONSTRAÇÃO (01/10).
 *
 * POR QUE MODELO: na API oficial do WhatsApp Business (Cloud API da Meta), só
 * dá para INICIAR conversa com mensagem de modelo aprovado. Texto livre só
 * vale dentro das 24 horas depois que a pessoa escreveu para o número. Todo
 * alerta da régua inicia conversa, então todos são modelos.
 *
 * CATEGORIA "UTILITY" (utilidade): aviso de algo que a pessoa pediu (a reunião
 * que ela marcou), sem promoção. É a categoria barata (cerca de R$ 0,035 por
 * mensagem no Brasil em out/2026) e a que não exige consentimento de
 * marketing. Por isso nenhum texto aqui oferece plano, desconto ou novidade:
 * a Meta reclassifica para "marketing" (quase 10 vezes mais caro) o modelo de
 * utilidade que vende.
 *
 * REGRAS DA META que os textos respeitam: variável nunca no começo nem no fim
 * do corpo, duas variáveis nunca encostadas, valor de variável sem quebra de
 * linha e sem mais de 4 espaços seguidos, rodapé de até 60 caracteres, botão
 * de link com a parte variável só no fim do endereço. Sem travessão.
 *
 * ESTE ARQUIVO É A FONTE: docs/whatsapp-modelos-da-agenda.md (para cadastrar à
 * mão no WhatsApp Manager) e scripts/whatsapp-modelos.mts (para cadastrar pela
 * API) saem daqui. Mudou um texto aqui, o modelo precisa ser cadastrado de
 * novo (e aprovado) com o MESMO nome, senão o envio falha com "modelo não
 * encontrado" ou "parâmetros não batem".
 */

export const SITE_DOS_MODELOS = "https://demandou.com";
export const IDIOMA_DOS_MODELOS = "pt_BR";
const RODAPE_DO_LEAD = "Responda PARAR para não receber mais avisos.";

export type BotaoDeModelo = {
  texto: string;
  /** Endereço fixo, ou terminado em {{1}} quando o fim muda a cada envio. */
  url: string;
  /** Exemplo do fim variável, exigido pela Meta no cadastro. */
  exemplo?: string;
};

export type ModeloDeWhatsapp = {
  nome: string;
  para: "lead" | "time";
  quando: string;
  categoria: "UTILITY";
  corpo: string;
  /** O que entra em cada {{n}}, na ordem. */
  variaveis: string[];
  exemplo: string[];
  rodape?: string;
  botoes?: BotaoDeModelo[];
};

const TOKEN_EXEMPLO = "cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp";
const gerenciar: BotaoDeModelo = { texto: "Remarcar ou cancelar", url: `${SITE_DOS_MODELOS}/demonstracao/reuniao/{{1}}`, exemplo: TOKEN_EXEMPLO };
const sala: BotaoDeModelo = { texto: "Entrar na sala", url: `${SITE_DOS_MODELOS}/demonstracao/sala/{{1}}`, exemplo: TOKEN_EXEMPLO };
const painel: BotaoDeModelo = { texto: "Abrir o painel", url: `${SITE_DOS_MODELOS}/admin/agenda` };

export const MODELOS = {
  // ---------------------------------------------------------------- lead
  confirmada: {
    nome: "demandou_demo_confirmada",
    para: "lead",
    quando: "Na hora da marcação",
    categoria: "UTILITY",
    corpo:
      "Sua demonstração da Demandou está confirmada para {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. O convite também foi para o seu e-mail, e avisamos por aqui antes da reunião, com o link da sala.",
    variaveis: ["dia e hora", "quem atende", "link do Meet"],
    exemplo: ["segunda-feira, 5 de outubro, às 10:00", "Bruno Donaire", "https://meet.google.com/abc-defg-hij"],
    rodape: RODAPE_DO_LEAD,
    botoes: [gerenciar],
  },
  remarcada: {
    nome: "demandou_demo_remarcada",
    para: "lead",
    quando: "Na hora da remarcação",
    categoria: "UTILITY",
    corpo:
      "Sua demonstração da Demandou mudou para {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. O convite novo foi para o seu e-mail.",
    variaveis: ["dia e hora", "quem atende", "link do Meet"],
    exemplo: ["terça-feira, 6 de outubro, às 14:30", "Matheus Gaberlini", "https://meet.google.com/abc-defg-hij"],
    rodape: RODAPE_DO_LEAD,
    botoes: [gerenciar],
  },
  cancelada: {
    nome: "demandou_demo_cancelada",
    para: "lead",
    quando: "Na hora do cancelamento",
    categoria: "UTILITY",
    corpo: "Sua demonstração da Demandou de {{1}} foi cancelada. Quando quiser, escolha outro horário pelo botão abaixo.",
    variaveis: ["dia e hora"],
    exemplo: ["segunda-feira, 5 de outubro, às 10:00"],
    rodape: RODAPE_DO_LEAD,
    botoes: [{ texto: "Escolher outro horário", url: `${SITE_DOS_MODELOS}/demonstracao` }],
  },
  vespera: {
    nome: "demandou_demo_vespera",
    para: "lead",
    quando: "24 horas antes",
    categoria: "UTILITY",
    corpo:
      "Lembrete: sua demonstração da Demandou é amanhã, {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. Se precisar mudar, use o botão abaixo.",
    variaveis: ["dia e hora", "quem atende", "link do Meet"],
    exemplo: ["segunda-feira, 5 de outubro, às 10:00", "Bruno Donaire", "https://meet.google.com/abc-defg-hij"],
    rodape: RODAPE_DO_LEAD,
    botoes: [gerenciar],
  },
  umaHora: {
    nome: "demandou_demo_uma_hora",
    para: "lead",
    quando: "1 hora antes",
    categoria: "UTILITY",
    corpo:
      "Lembrete: sua demonstração da Demandou começa em 1 hora, às {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. Se precisar mudar, use o botão abaixo.",
    variaveis: ["hora", "quem atende", "link do Meet"],
    exemplo: ["10:00", "Bruno Donaire", "https://meet.google.com/abc-defg-hij"],
    rodape: RODAPE_DO_LEAD,
    botoes: [gerenciar],
  },
  cincoMinutos: {
    nome: "demandou_demo_cinco_minutos",
    para: "lead",
    quando: "5 minutos antes",
    categoria: "UTILITY",
    corpo: "Sua demonstração da Demandou com {{1}} começa em 5 minutos, às {{2}}, horário de Brasília. Toque no botão abaixo para entrar na sala.",
    variaveis: ["quem atende", "hora"],
    exemplo: ["Bruno Donaire", "10:00"],
    rodape: RODAPE_DO_LEAD,
    botoes: [sala],
  },
  comecando: {
    nome: "demandou_demo_comecando",
    para: "lead",
    quando: "Na hora de começar",
    categoria: "UTILITY",
    corpo: "Estamos na sala. Sua demonstração da Demandou com {{1}} está começando agora. Toque no botão abaixo para entrar.",
    variaveis: ["quem atende"],
    exemplo: ["Bruno Donaire"],
    rodape: RODAPE_DO_LEAD,
    botoes: [sala],
  },
  esperando: {
    nome: "demandou_demo_esperando",
    para: "lead",
    quando: "10 minutos depois do início, se ninguém marcou que começou e o lead não abriu a sala",
    categoria: "UTILITY",
    corpo:
      "Estamos na sala esperando você para a demonstração da Demandou com {{1}}. Se ainda der, entre agora. Se o horário ficou ruim, escolha outro com um toque. Se você já entrou, pode ignorar esta mensagem.",
    variaveis: ["quem atende"],
    exemplo: ["Bruno Donaire"],
    rodape: RODAPE_DO_LEAD,
    botoes: [
      { texto: "Entrar agora", url: `${SITE_DOS_MODELOS}/demonstracao/sala/{{1}}`, exemplo: TOKEN_EXEMPLO },
      { texto: "Escolher outro horário", url: `${SITE_DOS_MODELOS}/demonstracao/remarcar/{{1}}`, exemplo: TOKEN_EXEMPLO },
    ],
  },
  obrigado: {
    nome: "demandou_demo_obrigado",
    para: "lead",
    quando: "30 minutos depois do fim, se a reunião aconteceu",
    categoria: "UTILITY",
    corpo:
      "Obrigado pela conversa de hoje na demonstração da Demandou. O próximo passo: {{1}} manda a proposta com o plano que montamos juntos. Se surgir alguma dúvida antes disso, é só responder esta mensagem.",
    variaveis: ["quem atendeu"],
    exemplo: ["Bruno Donaire"],
    rodape: RODAPE_DO_LEAD,
  },

  // ---------------------------------------------------------------- time
  novaTime: {
    nome: "demandou_demo_nova_time",
    para: "time",
    quando: "Na hora da marcação",
    categoria: "UTILITY",
    corpo:
      "Nova demonstração marcada para {{1}}, horário de Brasília, com {{2}}. Lead: {{3}}. Faturamento: {{4}}. Calculadora: {{5}}. A ficha completa está no painel.",
    variaveis: ["dia e hora", "quem atende", "quem é o lead", "faixa de faturamento", "resultado da calculadora"],
    exemplo: [
      "segunda-feira, 5 de outubro, às 10:00",
      "Bruno Donaire",
      "Ana Souza, Diretora, Clínica Exemplo, WhatsApp +55 11 98765-4321",
      "R$ 100 mil a R$ 500 mil por mês",
      "plano Business por R$ 2.990 por mês, R$ 18.000 a menos que o time próprio",
    ],
    botoes: [painel],
  },
  remarcadaTime: {
    nome: "demandou_demo_remarcada_time",
    para: "time",
    quando: "Na hora da remarcação",
    categoria: "UTILITY",
    corpo: "Demonstração remarcada para {{1}}, horário de Brasília, com {{2}}. Lead: {{3}}. O convite da agenda já foi atualizado.",
    variaveis: ["dia e hora", "quem atende", "quem é o lead"],
    exemplo: ["terça-feira, 6 de outubro, às 14:30", "Bruno Donaire", "Ana Souza, Clínica Exemplo"],
    botoes: [painel],
  },
  canceladaTime: {
    nome: "demandou_demo_cancelada_time",
    para: "time",
    quando: "Na hora do cancelamento (ou quando a remarcação passa a reunião para outra pessoa)",
    categoria: "UTILITY",
    corpo: "A demonstração de {{1}} com {{2}} foi cancelada {{3}}. O horário voltou a ficar livre na agenda.",
    variaveis: ["dia e hora", "quem é o lead", "por quem"],
    exemplo: ["segunda-feira, 5 de outubro, às 10:00", "Ana Souza, Clínica Exemplo", "pelo lead"],
    botoes: [painel],
  },
  lembreteTime: {
    nome: "demandou_demo_lembrete_time",
    para: "time",
    quando: "24 horas antes e 1 hora antes",
    categoria: "UTILITY",
    corpo: "Lembrete: você tem demonstração {{1}}, às {{2}}, horário de Brasília, com {{3}}. Videochamada: {{4}}. A ficha do lead está no painel.",
    variaveis: ["amanhã ou daqui a 1 hora", "hora", "quem é o lead", "link do Meet"],
    exemplo: ["amanhã", "10:00", "Ana Souza, Clínica Exemplo", "https://meet.google.com/abc-defg-hij"],
    botoes: [painel],
  },
  cincoMinutosTime: {
    nome: "demandou_demo_cinco_minutos_time",
    para: "time",
    quando: "5 minutos antes",
    categoria: "UTILITY",
    corpo:
      "A demonstração com {{1}} começa em 5 minutos, às {{2}}, horário de Brasília. Videochamada: {{3}}. Quando o lead entrar, marque que começou pelo botão abaixo, para ele não receber o aviso de atraso.",
    variaveis: ["quem é o lead", "hora", "link do Meet"],
    exemplo: ["Ana Souza, Clínica Exemplo", "10:00", "https://meet.google.com/abc-defg-hij"],
    botoes: [{ texto: "Marcar que começou", url: `${SITE_DOS_MODELOS}/demonstracao/comecou/{{1}}`, exemplo: TOKEN_EXEMPLO }],
  },
  resultadoTime: {
    nome: "demandou_demo_resultado_time",
    para: "time",
    quando: "30 minutos depois do fim, se ninguém marcou o resultado",
    categoria: "UTILITY",
    corpo: "A demonstração com {{1}} de hoje, às {{2}}, terminou. Marque no painel se aconteceu ou se o lead faltou, para o funil ficar certo.",
    variaveis: ["quem é o lead", "hora"],
    exemplo: ["Ana Souza, Clínica Exemplo", "10:00"],
    botoes: [painel],
  },
  // O CHAMADO DE SUPORTE (02/10): aviso ao suporte a cada chamado novo. Sai
  // para o número de SUPORTE_WHATSAPP, só com a API ligada.
  chamadoTime: {
    nome: "demandou_chamado_novo_time",
    para: "time",
    quando: "A cada chamado de suporte aberto",
    categoria: "UTILITY",
    corpo: "Novo chamado {{1}} de {{2}}, categoria {{3}}. O que a pessoa escreveu: {{4}}. Responda pelo painel de chamados.",
    variaveis: ["número do chamado", "quem abriu", "categoria", "texto resumido"],
    exemplo: ["#0012", "Ana Souza, ana@empresa.com", "Problema técnico", "o vídeo de segunda não saiu"],
    botoes: [{ texto: "Abrir os chamados", url: `${SITE_DOS_MODELOS}/admin/chamados` }],
  },
} satisfies Record<string, ModeloDeWhatsapp>;

export type ChaveDoModelo = keyof typeof MODELOS;

/**
 * Valor de variável no formato que a Meta aceita: sem quebra de linha, sem
 * tabulação, sem mais de 4 espaços seguidos, nunca vazio (parâmetro vazio é
 * recusado com erro 132000) e com teto de tamanho.
 */
export function valorDeVariavel(v: string | null | undefined): string {
  const limpo = String(v ?? "").replace(/[\r\n\t]+/g, " ").replace(/ {2,}/g, " ").trim().slice(0, 300);
  return limpo || "não informado";
}

/** O corpo com as variáveis preenchidas, mais o rodapé e os botões: a prévia do que o celular mostra. */
export function textoDoModelo(chave: ChaveDoModelo, valores: string[], sufixos: string[] = []): string {
  const m: ModeloDeWhatsapp = MODELOS[chave];
  const corpo = m.corpo.replace(/\{\{(\d+)\}\}/g, (_, n) => valorDeVariavel(valores[Number(n) - 1]));
  let i = 0;
  const botoes = (m.botoes ?? []).map((b) => {
    const url = b.url.includes("{{1}}") ? b.url.replace("{{1}}", sufixos[i++] ?? "") : b.url;
    return `[${b.texto}] ${url}`;
  });
  return [corpo, ...(m.rodape ? [m.rodape] : []), ...botoes].join("\n");
}

/** Os "components" do envio pela API (POST /{phone-number-id}/messages, type template). */
export function componentesDoEnvio(chave: ChaveDoModelo, valores: string[], sufixos: string[] = []): unknown[] {
  const m: ModeloDeWhatsapp = MODELOS[chave];
  const componentes: unknown[] = [];
  if (m.variaveis.length) {
    componentes.push({
      type: "body",
      parameters: m.variaveis.map((_, i) => ({ type: "text", text: valorDeVariavel(valores[i]) })),
    });
  }
  let s = 0;
  (m.botoes ?? []).forEach((b, indice) => {
    if (!b.url.includes("{{1}}")) return;
    componentes.push({ type: "button", sub_type: "url", index: String(indice), parameters: [{ type: "text", text: sufixos[s++] ?? "" }] });
  });
  return componentes;
}

/** O corpo do cadastro pela API de gestão (POST /{waba-id}/message_templates). */
export function cadastroDoModelo(m: ModeloDeWhatsapp): Record<string, unknown> {
  const componentes: Array<Record<string, unknown>> = [
    { type: "BODY", text: m.corpo, ...(m.exemplo.length ? { example: { body_text: [m.exemplo] } } : {}) },
  ];
  if (m.rodape) componentes.push({ type: "FOOTER", text: m.rodape });
  if (m.botoes?.length) {
    componentes.push({
      type: "BUTTONS",
      buttons: m.botoes.map((b) => ({
        type: "URL",
        text: b.texto,
        url: b.url,
        ...(b.url.includes("{{1}}") ? { example: [b.url.replace("{{1}}", b.exemplo ?? TOKEN_EXEMPLO)] } : {}),
      })),
    });
  }
  return { name: m.nome, language: IDIOMA_DOS_MODELOS, category: m.categoria, components: componentes };
}
