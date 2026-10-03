/**
 * AS REGRAS PURAS DA DEFESA CONTRA ROBÔ (01/10).
 *
 * Módulo sem banco, sem segredo e sem Node: só funções sobre texto. Fica
 * separado porque três lugares precisam das mesmas regras e não podem
 * divergir: a porta de entrada (que recusa), o painel de admin (que conta) e o
 * script de limpeza (que marca). Uma regra escrita em três lugares é uma
 * regra que um dia vai dizer três coisas diferentes.
 *
 * O PADRÃO VEIO DO BANCO, e não de suposição. Diagnóstico de 01/10, últimos
 * 30 dias: 90 contas criadas, 86 de robô. Todas as 86 com o NOME feito de
 * letras sorteadas, maiúsculas e minúsculas misturadas, sem espaço
 * ("HvjdaUJGOljGkSJAqCr", "ZrTyioBdryiPxTsr"); 30 delas com Gmail cheio de
 * pontos ("gar.rettb.i.be.r.g.s.t.rp.sn59.0@gmail.com"); o resto com o e-mail
 * de terceiros de verdade (empresas, Yahoo, AOL), que recebiam o nosso e-mail
 * de confirmação sem nunca terem pedido.
 */

/**
 * DOMÍNIOS DE E-MAIL DESCARTÁVEL, numa lista enxuta de propósito.
 *
 * As listas completas têm dezenas de milhares de domínios e mudam toda
 * semana; embutir uma delas aqui seria trazer um arquivo que ninguém atualiza.
 * Esta cobre os serviços grandes (que respondem pela maior parte do uso) e os
 * domínios do gerador de identidades falsas mais conhecido. O robô que vimos
 * no diagnóstico nem usava descartável: a camada que pega ele é a do nome.
 */
export const DOMINIOS_DESCARTAVEIS: ReadonlySet<string> = new Set([
  "mailinator.com", "mailinator.net", "mailinator2.com", "guerrillamail.com", "guerrillamail.net",
  "guerrillamail.org", "guerrillamail.biz", "guerrillamail.de", "guerrillamailblock.com", "sharklasers.com",
  "grr.la", "pokemail.net", "spam4.me", "10minutemail.com", "10minutemail.net", "10minutemail.co.uk",
  "temp-mail.org", "temp-mail.io", "tempmail.com", "tempmail.net", "tempmailo.com", "tempmail.plus",
  "tempail.com", "tempinbox.com", "tempr.email", "mytemp.email", "tmpmail.org", "tmpmail.net",
  "yopmail.com", "yopmail.fr", "yopmail.net", "trashmail.com", "trashmail.de", "trashmail.net",
  "getnada.com", "nada.email", "dispostable.com", "maildrop.cc", "mailnesia.com", "mintemail.com",
  "mohmal.com", "throwawaymail.com", "fakeinbox.com", "emailondeck.com", "mailcatch.com",
  "spamgourmet.com", "discard.email", "burnermail.io", "moakt.com", "tmail.ws", "mail.tm", "mail.gw",
  "emltmp.com", "inboxkitten.com", "mailpoof.com", "getairmail.com", "spambox.us", "emailfake.com",
  "crazymailing.com", "linshiyouxiang.net", "1secmail.com", "1secmail.org", "1secmail.net",
  "esiix.com", "wwjmp.com", "xojxe.com", "yoggm.com", "armyspy.com", "cuvox.de", "dayrep.com",
  "einrot.com", "fleckens.hu", "gustr.com", "jourrapide.com", "rhyta.com", "superrito.com",
  "teleworm.us", "byom.de", "trbvm.com", "mvrht.net", "dropmail.me", "10mail.org", "emailtemporal.org",
  "email-temporario.com.br", "tempemail.co", "fakemail.net", "mailforspam.com", "mail-temp.com",
]);

/** O domínio do e-mail, em minúsculas. Vazio quando não há arroba. */
export function dominioDoEmail(email: string): string {
  const i = email.lastIndexOf("@");
  return i < 0 ? "" : email.slice(i + 1).trim().toLowerCase();
}

/**
 * Quantos pontos o Gmail tem antes da arroba. Zero para quem não é Gmail.
 *
 * O Gmail IGNORA pontos: `j.o.a.o@gmail.com` e `joao@gmail.com` chegam na
 * mesma caixa. Espalhar pontos é como se fabricam mil endereços "novos" para
 * a mesma pessoa, e foi o que 30 das 86 contas de robô fizeram.
 */
export function pontosNoGmail(email: string): number {
  const dominio = dominioDoEmail(email);
  if (dominio !== "gmail.com" && dominio !== "googlemail.com") return 0;
  const local = email.slice(0, email.lastIndexOf("@")).split("+")[0];
  return (local.match(/\./g) ?? []).length;
}

/**
 * O CORTE DO GMAIL É TRÊS PONTOS, e ele é conservador.
 *
 * Nome composto de verdade ("ana.maria.silva") tem dois. No diagnóstico,
 * nenhuma conta tinha exatamente dois, e as trinta com três ou mais eram
 * todas de robô. E quem for gente e cair aqui tem saída na hora: escrever o
 * mesmo endereço sem os pontos, que o Gmail entrega na mesma caixa.
 */
export const PONTOS_DO_GMAIL_DE_ROBO = 3;

/**
 * A CHAVE DO E-MAIL PARA O LIMITE DE TENTATIVAS.
 *
 * Sem normalizar, o limite "3 por e-mail" vira "3 por variação", e o Gmail
 * tem variação infinita (pontos e o sufixo depois do "+"). Aqui as variações
 * de uma mesma caixa viram a mesma chave. Não serve para gravar: o endereço
 * da conta continua o que a pessoa digitou.
 */
export function chaveDoEmail(email: string): string {
  const limpo = email.trim().toLowerCase();
  const i = limpo.lastIndexOf("@");
  if (i < 0) return limpo;
  let local = limpo.slice(0, i).split("+")[0];
  let dominio = limpo.slice(i + 1);
  if (dominio === "googlemail.com") dominio = "gmail.com";
  if (dominio === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${dominio}`;
}

/**
 * O NOME TEM CARA DE LETRAS SORTEADAS?
 *
 * O robô do diagnóstico preenche o nome com 15 a 25 letras ao acaso,
 * maiúsculas e minúsculas misturadas, sem espaço. Gente escreve o nome com
 * espaço, ou num pedaço só ("Bruno"), ou em CamelCase de nomes de verdade
 * ("JoaoPedroDaSilva"). A diferença que separa os dois:
 *
 * - um pedaço do CamelCase SEM VOGAL ("Zr", "Px", "Bdr"): nome de gente
 *   sempre tem vogal em cada parte;
 * - duas MAIÚSCULAS SEGUIDAS no meio ("UJGO", "QXF"): CamelCase de nome não
 *   tem isso, sigla no nome de alguém tem espaço antes.
 *
 * Só olha nome SEM espaço, com 10 letras ou mais e pelo menos 3 maiúsculas
 * depois da primeira letra. Medido contra as 86 contas de robô (todas pegas)
 * e contra uma lista de nomes reais, inclusive em CamelCase (nenhum pego):
 * ver scripts/tmp/robos-provar-regras-0110.mts.
 */
export function nomePareceAleatorio(nome: string | null | undefined): boolean {
  if (!nome) return false;
  const t = nome.trim();
  if (/\s/.test(t)) return false;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ]+$/.test(t)) return false;
  if (t.length < 10) return false;
  const maiusculasDepois = (t.slice(1).match(/[A-ZÀ-ÖØ-Þ]/g) ?? []).length;
  if (maiusculasDepois < 3) return false;
  // Duas maiúsculas seguidas depois da primeira letra.
  if (/[A-ZÀ-ÖØ-Þ]{2}/.test(t.slice(1))) return true;
  // Cada pedaço do CamelCase precisa ter vogal. As exceções são os pedaços
  // sem vogal que existem em nome de gente: "Jr" e "Sr" no fim, "Mc" e "St"
  // como prefixo ("JoaoMcDonaldSilva").
  const pedacos = t.match(/[A-ZÀ-ÖØ-Þ]?[a-zß-öø-ÿ]*/g)?.filter(Boolean) ?? [];
  return pedacos.some((p) => !/[aeiouyáéíóúâêôãõàü]/i.test(p) && !/^(jr|sr|mc|st)$/i.test(p));
}

/**
 * Por que este e-mail não entra. Null quando entra.
 *
 * A frase vai para a tela, então ela diz o que fazer, e não só o que deu
 * errado: quem é gente sempre tem uma saída.
 */
export function motivoDoEmailRecusado(email: string): { motivo: string; mensagem: string } | null {
  const dominio = dominioDoEmail(email);
  if (DOMINIOS_DESCARTAVEIS.has(dominio)) {
    return {
      motivo: "email_descartavel",
      mensagem: "Use um e-mail permanente, de preferência o do trabalho. Endereços temporários não recebem o acesso.",
    };
  }
  if (pontosNoGmail(email) >= PONTOS_DO_GMAIL_DE_ROBO) {
    return {
      motivo: "gmail_com_pontos",
      mensagem:
        "Esse formato de Gmail, com muitos pontos, é o mais usado por robôs. Escreva o mesmo endereço sem os pontos: o Gmail entrega na mesma caixa.",
    };
  }
  return null;
}

/** A frase do nome recusado. Ensina o formato, sem acusar ninguém. */
export const MENSAGEM_DO_NOME =
  "Escreva o seu nome como você assina, com nome e sobrenome separados por espaço.";

/**
 * A CONTA TEM CARA DE ROBÔ? Usada pelo painel, pelo CRM e pela limpeza.
 *
 * - marcada pelo admin ou pelo script de limpeza (`roboEm`): é robô, ponto;
 * - tem projeto: é gente, porque projeto só nasce depois de pagar;
 * - nome de letras sorteadas: robô, MESMO com e-mail confirmado. Duas das 86
 *   contas do diagnóstico estavam "confirmadas" 27 segundos e 7 minutos depois
 *   de criadas, sem nunca abrir nada: é o antivírus do e-mail corporativo
 *   clicando no link para conferir se ele é seguro, e não uma pessoa;
 * - Gmail com três pontos ou mais e sem e-mail confirmado: o padrão de 22/09.
 */
export function contaPareceRobo(c: {
  email: string;
  nome: string | null;
  emailVerificado: boolean;
  projetos: number;
  roboEm?: Date | string | null;
}): boolean {
  if (c.roboEm) return true;
  if (c.projetos > 0) return false;
  if (nomePareceAleatorio(c.nome)) return true;
  if (!c.emailVerificado && pontosNoGmail(c.email) >= PONTOS_DO_GMAIL_DE_ROBO) return true;
  return false;
}

/**
 * O QUE O NAVEGADOR MANDA PARA PROVAR QUE É GENTE, em todo envio público.
 *
 * - `isca`: o valor do campo invisível. Gente não vê o campo e manda vazio;
 *   robô que preenche tudo o que encontra manda alguma coisa.
 * - `carimbo`: a hora em que a tela abriu, assinada pelo servidor.
 * - `turnstile`: o token do captcha invisível, quando ele está ligado.
 *
 * Mora aqui (módulo puro) porque a tela monta este objeto e o servidor o lê.
 */
export type ProvaDoNavegador = {
  isca?: string;
  carimbo?: string;
  turnstile?: string;
};

/**
 * O cabeçalho que leva a prova no cadastro. No cadastro a chamada é do
 * cliente do better-auth, e o corpo dela tem formato fixo; o cabeçalho é o
 * caminho limpo. Nos formulários de lead a prova vai no corpo, em `antiRobo`.
 */
export const CABECALHO_DA_PROVA = "x-demandou-prova";

/** Lê a prova do cabeçalho ou do corpo, sem nunca lançar. */
export function lerProva(cru: unknown): ProvaDoNavegador | null {
  let v = cru;
  if (typeof v === "string") {
    if (v.length > 8192) return null;
    try {
      v = JSON.parse(v);
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const texto = (x: unknown) => (typeof x === "string" ? x.slice(0, 4096) : undefined);
  return { isca: texto(o.isca), carimbo: texto(o.carimbo), turnstile: texto(o.turnstile) };
}
