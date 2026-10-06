-- O CARGO DO REPRESENTANTE LEGAL NO CONTRATO (06/10/2026).
-- Pedido do dono: o quadro "Representante legal" traz nome E cargo
-- ("Sócio-administrador" como padrão no formulário). Aditiva e com
-- IF NOT EXISTS: o banco é compartilhado entre o dev local e a produção, e
-- rodar duas vezes não pode quebrar nada. Coluna opcional: contrato de antes
-- fica null e o texto dele continua idêntico ao assinado (o hash não muda).
ALTER TABLE "contratos" ADD COLUMN IF NOT EXISTS "representanteCargo" TEXT;
