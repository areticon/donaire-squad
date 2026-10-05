-- CONDIÇÃO DE PAGAMENTO EM DUAS PARTES: AS FORMAS DA ENTRADA E DO RESTANTE (05/10/2026).
-- Aditiva e com IF NOT EXISTS: o banco é compartilhado entre o dev local e a
-- produção, e rodar duas vezes não pode quebrar nada. Só acrescenta colunas
-- novas, opcionais; contrato parcelado sem elas segue o padrão (entrada no
-- Pix, restante no cartão com recorrência), e contrato à vista fica null.

-- "pix" | "boleto" | "transferencia" | "cartao_stripe"
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "formaDaEntrada" TEXT;
-- "cartao_recorrente" | "cartao_parcelado_emissor" | "cartao_a_vista"
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "formaDoRestante" TEXT;
