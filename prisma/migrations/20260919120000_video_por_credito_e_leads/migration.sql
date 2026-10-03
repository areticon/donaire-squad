-- O SALDO DE VIDEO, separado do saldo do plano.
--
-- E a conta que tirou o Veo do produto em 18/08/2026 voltando pela porta certa.
-- Naquele dia a cascata de fallback levava um video de 8 segundos de R$ 4,85
-- para R$ 18,05 contra R$ 10,00 de receita, 80% de prejuizo por operacao, e
-- ninguem via porque o Veo nunca gravava em ai_usage.
--
-- Medido em 18/09/2026, com o Veo 3.1: 8 segundos com narracao custam R$ 6,48
-- no modo rapido e R$ 17,28 no cheio. No plano Essencial de R$ 397, QUATRO
-- videos cheios por campanha custam R$ 431 por mes, ou 108,6% do preco do
-- plano: a margem fica negativa antes de contar qualquer outra peca.
--
-- Com UM saldo so, nada impede o cliente de gastar o plano inteiro em video.
-- Com dois, video e comprado a parte e o plano nao pode ser drenado por ele.
ALTER TABLE "users" ADD COLUMN "videoCredits" INTEGER NOT NULL DEFAULT 0;

-- De qual saldo cada linha do extrato saiu.
--
-- Sem ela, `balance` vira ambiguo no instante em que passam a existir dois
-- saldos: ele guarda o saldo DEPOIS do movimento, e um extrato que nao diz a
-- qual carteira pertence nao fecha com nenhuma das duas. Extrato que nao fecha
-- e o mesmo que nao existir, e foi por isso que ele nasceu em agosto.
--
-- DEFAULT 'plano' porque toda linha que ja existe e do saldo do plano: o saldo
-- de video nasce hoje, zerado, e nenhum movimento anterior pode ter saido dele.
ALTER TABLE "credit_transactions" ADD COLUMN "carteira" TEXT NOT NULL DEFAULT 'plano';

-- OS LEADS DA LANDING, com a qualificacao que cada um deu ao entrar.
--
-- Nasce da decisao de 19/09/2026 de rodar campanha forte de anuncios com meta
-- de 5.000 leads na primeira semana. Sem este registro, 5.000 cadastros viram
-- 5.000 e-mails iguais e a segmentacao depois e impossivel: nao da para
-- descobrir retroativamente quem comprava e quem so olhava.
--
-- O e-mail e UNICO de proposito. O mesmo lead voltando por outro anuncio
-- atualiza as respostas em vez de virar uma segunda linha; senao a contagem da
-- primeira semana mente para cima justamente na semana em que ela decide se o
-- trafego pago continua.
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "vende" TEXT,
    "compra" TEXT,
    "ticket" TEXT,
    "origem" TEXT,
    "campanha" TEXT,
    "convertedUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "leads_email_key" ON "leads"("email");
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt");
-- O indice por origem existe para a pergunta que decide o orcamento de
-- anuncio: quantos leads cada campanha trouxe, e quantos viraram conta.
CREATE INDEX "leads_origem_createdAt_idx" ON "leads"("origem", "createdAt");
