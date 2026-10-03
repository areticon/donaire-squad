-- O boneco personalizado do usuario no escritorio 3D (28/09/2026). Coluna opcional:
-- null e o avatar padrao, de laranja.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "aparenciaDoBoneco" JSONB;
