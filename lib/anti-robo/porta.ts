import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { extrairIp, hashIp } from "@/lib/demo/rate-limit";
import { lerCarimbo, TEMPO_MINIMO_MS } from "@/lib/anti-robo/carimbo";
import { conferirTurnstile } from "@/lib/anti-robo/turnstile";
import {
  chaveDoEmail, motivoDoEmailRecusado, nomePareceAleatorio, MENSAGEM_DO_NOME, type ProvaDoNavegador,
} from "@/lib/anti-robo/regras";

/**
 * A PORTA DAS ROTAS PÚBLICAS (01/10). Só servidor: lê e escreve no banco.
 *
 * Toda rota que um desconhecido alcança sem sessão e que custa alguma coisa
 * (um e-mail para um terceiro, uma linha de lead, uma conta nova na métrica)
 * passa por aqui antes de fazer qualquer coisa. Camadas, na ordem:
 *
 *   1. limite por IP e por e-mail, contado no Postgres;
 *   2. prova do navegador: campo isca vazio, carimbo assinado e tempo mínimo,
 *      e o Turnstile quando as chaves existirem;
 *   3. e-mail descartável ou Gmail cheio de pontos;
 *   4. nome de letras sorteadas (só no cadastro, que é onde há nome).
 *
 * O porquê de cada uma está no diagnóstico de 01/10 (lib/anti-robo/regras.ts):
 * 86 de 90 contas eram de robô, vindas de 79 IPs diferentes. Por isso o limite
 * por IP sozinho não resolve (o robô troca de IP), e as camadas que pegam de
 * verdade são as que olham o COMPORTAMENTO (isca, tempo) e o PADRÃO (nome).
 *
 * Toda tentativa vira uma linha em `tentativas_publicas`, aceita ou não, com o
 * motivo. A próxima pergunta "estão vindo robôs?" é uma consulta.
 */

export type Porta =
  | "cadastro"
  | "login"
  | "reenvio"
  | "senha"
  | "lead"
  | "calculadora"
  | "demonstracao"
  | "email_existe";

type Regra = {
  janelaMs: number;
  porIp: number;
  /** Null quando a rota não recebe e-mail. */
  porEmail: number | null;
  /** Isca, carimbo, tempo mínimo e Turnstile. Só onde existe uma tela nossa antes. */
  exigeProva: boolean;
  confereEmail: boolean;
  confereNome: boolean;
  mensagemDoLimite: string;
};

const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/**
 * OS NÚMEROS DE CADA PORTA. Folgados para gente, apertados para laço.
 *
 * Uma pessoa se cadastra uma vez, erra a senha duas ou três, pede o e-mail de
 * novo uma ou duas. Quem passa disso é programa. O login e a recuperação de
 * senha entram porque mandam e-mail (o login manda de novo a confirmação para
 * conta não confirmada), e e-mail para terceiro é o custo que o robô de 01/10
 * mais gerava: 84 confirmações para caixas de gente que nunca pediu conta.
 */
const REGRAS: Record<Porta, Regra> = {
  cadastro: {
    janelaMs: HORA, porIp: 5, porEmail: 3, exigeProva: true, confereEmail: true, confereNome: true,
    mensagemDoLimite: "Recebemos muitas tentativas de cadastro daqui. Espere uma hora e tente de novo, ou escreva para contato@demandou.com.",
  },
  login: {
    janelaMs: 15 * MINUTO, porIp: 30, porEmail: 6, exigeProva: false, confereEmail: false, confereNome: false,
    mensagemDoLimite: "Muitas tentativas de entrar. Espere 15 minutos e tente de novo, ou use \"Esqueci a senha\".",
  },
  reenvio: {
    janelaMs: HORA, porIp: 10, porEmail: 3, exigeProva: false, confereEmail: false, confereNome: false,
    mensagemDoLimite: "Já mandamos alguns e-mails para esse endereço. Procure no spam e nas promoções, e espere uma hora para pedir de novo.",
  },
  senha: {
    janelaMs: HORA, porIp: 10, porEmail: 3, exigeProva: false, confereEmail: false, confereNome: false,
    mensagemDoLimite: "Já mandamos alguns links para esse endereço. Procure no spam e nas promoções, e espere uma hora para pedir de novo.",
  },
  lead: {
    janelaMs: HORA, porIp: 8, porEmail: 5, exigeProva: true, confereEmail: true, confereNome: false,
    mensagemDoLimite: "Recebemos vários envios daqui. Tente de novo em uma hora.",
  },
  calculadora: {
    janelaMs: HORA, porIp: 8, porEmail: 5, exigeProva: true, confereEmail: true, confereNome: false,
    mensagemDoLimite: "Recebemos várias simulações daqui. Tente de novo em uma hora.",
  },
  demonstracao: {
    janelaMs: HORA, porIp: 8, porEmail: 5, exigeProva: true, confereEmail: true, confereNome: false,
    mensagemDoLimite: "Recebemos seus pedidos. Aguarde nosso contato.",
  },
  email_existe: {
    janelaMs: MINUTO, porIp: 10, porEmail: null, exigeProva: false, confereEmail: false, confereNome: false,
    mensagemDoLimite: "",
  },
};

/** A frase das recusas da prova: genérica de propósito, para não ensinar o robô. */
const RECARREGUE = "Não consegui concluir o envio. Recarregue a página e tente de novo.";

export type Veredito =
  | { ok: true }
  | { ok: false; status: 400 | 429; motivo: string; mensagem: string };

/** E-mail com sal, normalizado (as variações do Gmail viram a mesma chave). */
function hashDoEmail(email: string): string {
  const sal = process.env.BETTER_AUTH_SECRET ?? "demandou";
  return createHash("sha256").update(`${sal}:email:${chaveDoEmail(email)}`).digest("hex").slice(0, 32);
}

export async function conferirEnvio(args: {
  porta: Porta;
  headers: Headers;
  prova?: ProvaDoNavegador | null;
  email?: string | null;
  nome?: string | null;
}): Promise<Veredito> {
  const regra = REGRAS[args.porta];
  const ip = extrairIp(args.headers);
  const ipHash = hashIp(ip);
  const email = typeof args.email === "string" ? args.email.trim().toLowerCase() : "";
  const emailHash = email && email.includes("@") ? hashDoEmail(email) : null;
  const desde = new Date(Date.now() - regra.janelaMs);

  let veredito: Veredito = { ok: true };
  try {
    const [doIp, doEmail] = await Promise.all([
      prisma.tentativaPublica.count({ where: { rota: args.porta, ipHash, createdAt: { gte: desde } } }),
      emailHash && regra.porEmail !== null
        ? prisma.tentativaPublica.count({ where: { rota: args.porta, emailHash, createdAt: { gte: desde } } })
        : Promise.resolve(0),
    ]);
    if (doIp >= regra.porIp) {
      veredito = { ok: false, status: 429, motivo: "limite_ip", mensagem: regra.mensagemDoLimite };
    } else if (regra.porEmail !== null && doEmail >= regra.porEmail) {
      veredito = { ok: false, status: 429, motivo: "limite_email", mensagem: regra.mensagemDoLimite };
    }
  } catch (e) {
    // Banco piscou na contagem: segue para as outras camadas em vez de
    // trancar a porta. O limite é uma camada, não a única.
    console.warn("[anti-robo] não consegui contar as tentativas", e instanceof Error ? e.message : e);
  }

  if (veredito.ok && regra.exigeProva) {
    const prova = args.prova ?? {};
    const carimbo = lerCarimbo(prova.carimbo);
    if (prova.isca && prova.isca.trim()) {
      veredito = { ok: false, status: 400, motivo: "isca", mensagem: RECARREGUE };
    } else if (!carimbo.ok) {
      veredito = { ok: false, status: 400, motivo: carimbo.motivo, mensagem: RECARREGUE };
    } else if (carimbo.idadeMs < TEMPO_MINIMO_MS) {
      veredito = {
        ok: false, status: 400, motivo: "rapido_demais",
        mensagem: "Envio rápido demais. Confira os dados e tente de novo em alguns segundos.",
      };
    } else {
      const ts = await conferirTurnstile(prova.turnstile, ip);
      if (!ts.ok) {
        veredito = {
          ok: false, status: 400, motivo: "turnstile",
          mensagem: "Não consegui confirmar que o envio veio de uma pessoa. Recarregue a página e tente de novo.",
        };
      }
    }
  }

  if (veredito.ok && regra.confereEmail && email) {
    const recusa = motivoDoEmailRecusado(email);
    if (recusa) veredito = { ok: false, status: 400, ...recusa };
  }

  if (veredito.ok && regra.confereNome && nomePareceAleatorio(args.nome)) {
    veredito = { ok: false, status: 400, motivo: "nome_aleatorio", mensagem: MENSAGEM_DO_NOME };
  }

  try {
    await prisma.tentativaPublica.create({
      data: {
        rota: args.porta,
        ipHash,
        emailHash,
        aceita: veredito.ok,
        motivo: veredito.ok ? null : veredito.motivo,
        agente: args.headers.get("user-agent")?.slice(0, 200) ?? null,
      },
    });
    // A limpeza vem de carona, numa fração das chamadas: a tabela não cresce
    // para sempre e não precisa de um relógio próprio.
    if (Math.random() < 0.02) {
      await prisma.tentativaPublica.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 14 * 24 * HORA) } } });
    }
  } catch (e) {
    console.warn("[anti-robo] não consegui registrar a tentativa", e instanceof Error ? e.message : e);
  }

  if (!veredito.ok) console.info(`[anti-robo] recusado: porta=${args.porta} motivo=${veredito.motivo}`);
  return veredito;
}
