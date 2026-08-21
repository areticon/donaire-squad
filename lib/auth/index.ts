import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db/prisma";

// Cada provedor entra sozinho quando as credenciais existem no ambiente, e o
// botão correspondente é gateado por NEXT_PUBLIC_*_AUTH=1 no cliente. Assim o
// código sobe antes das credenciais sem quebrar nada.
const socialProviders: Record<string, { clientId: string; clientSecret: string }> = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
// Reusa o app OAuth do LinkedIn que já publica posts; para o login funcionar,
// o app precisa do produto "Sign In with LinkedIn using OpenID Connect" e da
// redirect https://demandou.com/api/auth/callback/linkedin no painel deles.
if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
  socialProviders.linkedin = {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  };
}

// Origens que o better-auth aceita. Sem isso, o navegador recebe "Invalid
// origin" sempre que a porta ou o domínio diferirem do baseURL configurado.
// Em desenvolvimento aceitamos as portas alternativas que o Next escolhe
// sozinho quando a 3000 está ocupada.
const trustedOrigins = [
  process.env.BETTER_AUTH_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  "https://demandou.com",
  "https://www.demandou.com",
  ...(process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3002",
        "http://localhost:3003",
      ]),
].filter((origin): origin is string => Boolean(origin));

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders:
    Object.keys(socialProviders).length > 0 ? socialProviders : undefined,
  account: {
    accountLinking: {
      // Sem isto, quem criou a conta com senha e depois clica em "Continuar
      // com Google" no mesmo e-mail leva `account_not_linked` e não entra
      // nunca (achado do teste de jornada de 21/08).
      //
      // A recusa padrão existe para impedir que alguém crie conta social com
      // e-mail alheio e assuma a conta da vítima. O risco só existe quando o
      // provedor não confirma o e-mail; Google e LinkedIn confirmam antes de
      // emitir o token, então vincular pelo e-mail é seguro com eles, e só
      // com eles.
      enabled: true,
      trustedProviders: ["google", "linkedin"],
      // Segunda trava do better-auth, e a que realmente barrava: além do
      // provedor confiável, ele exige por padrão que a conta LOCAL já tenha
      // e-mail verificado. Como o cadastro por senha ainda não envia e-mail
      // de confirmação, todo usuário nasce com `emailVerified: false` e a
      // vinculação nunca aconteceria.
      //
      // Desligar isto não abre um buraco novo: o risco que a trava cobre
      // (alguém cadastrar com e-mail alheio e depois herdar a conta do dono
      // real) já existe hoje pela ausência de verificação no cadastro. O
      // conserto de raiz é enviar o e-mail de confirmação, que tem card no
      // planner. Quando existir, esta linha volta a ser `true`.
      requireLocalEmailVerified: false,
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 dias
    updateAge: 60 * 60 * 24, // renova o cookie 1x/dia
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5, // 5 min sem bater no banco a cada request
    },
  },
  advanced: {
    database: {
      generateId: false, // Prisma gera cuid() — mantém padrão do schema
    },
  },
});

export type Session = typeof auth.$Infer.Session;
