-- Rede conectada nao e a mesma coisa que rede que funciona.
--
-- Ate 14/09 o app tinha um campo so, `isActive`, e ele carregava dois
-- significados: a escolha do usuario (a chave liga e desliga da tela de
-- Configuracoes) e o estado do token na rede. Como so o primeiro era escrito,
-- o segundo nunca existiu: a tela mostrava oito contas de LinkedIn verdes e
-- "ativa" com seis delas mortas.
--
-- `tokenExpiresAt` tambem nao responde: ele guarda a validade PROMETIDA na hora
-- da conexao, e revogacao nao mexe nela. Os seis tokens revogados de 14/09
-- valiam ate novembro segundo esse campo.
--
-- A verdade so aparece tentando publicar, entao e la que ela passa a ser
-- gravada. `needsReconnectAt` recebe a hora do 401 e `needsReconnectReason`
-- recebe o codigo que a rede devolveu (REVOKED_ACCESS_TOKEN e companhia), para
-- a tela dizer o motivo em vez de chutar "expirou". Reconectar limpa os dois.
ALTER TABLE "social_accounts" ADD COLUMN "needsReconnectAt" TIMESTAMP(3);
ALTER TABLE "social_accounts" ADD COLUMN "needsReconnectReason" TEXT;
