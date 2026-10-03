-- AS PERGUNTAS DO FORMULARIO MUDARAM, e a mudanca e de PREMISSA.
--
-- A primeira versao, de manha, perguntava "o que voce vende?" com tres botoes
-- (servico, produto, conhecimento). O Bruno leu e apontou o erro no mesmo dia:
-- a pergunta PRESSUPOE que a pessoa vende alguma coisa. Um pastor nao vende.
-- Um professor nao vende. Um lider de associacao nao vende. Nenhum dos tres
-- botoes cabe neles, e um formulario em que a pessoa nao se encontra na
-- primeira pergunta e um formulario que ela fecha.
--
-- A pergunta certa e o que a pessoa FAZ, e a resposta nao cabe em tres botoes:
-- cabe numa linha escrita por ela. E o unico campo aberto do formulario, e ele
-- nao e desperdicio de conversao, porque e exatamente o que o produto pergunta
-- no setup do projeto para os agentes saberem sobre o que escrever.
--
-- As outras duas perguntas tambem mudaram, e as duas segmentam melhor:
--   "voce ja cria conteudo" separa os DOIS perfis de comprador do produto
--   (quem ja publica e sofre, quem nunca publicou e quer que saia sozinho);
--   "o que voce quer das redes" foi levantado contra o que a industria mede
--   (reconhecimento, geracao de lead, venda direta, comunidade) e traduzido
--   para a lingua de quem responde, com uma opcao que serve a quem nao vende.
--
-- AS COLUNAS ANTIGAS SAO REMOVIDAS, e nao mantidas por seguranca: a tabela
-- nasceu hoje e tem ZERO linhas (conferido antes de escrever esta migracao).
-- Guardar coluna vazia que ninguem vai preencher e deixar no schema uma
-- pergunta que o produto nao faz mais, e schema que mente e o comeco de todo
-- relatorio errado.
ALTER TABLE "leads" DROP COLUMN "vende";
ALTER TABLE "leads" DROP COLUMN "compra";
ALTER TABLE "leads" DROP COLUMN "ticket";

ALTER TABLE "leads" ADD COLUMN "faz" TEXT;
ALTER TABLE "leads" ADD COLUMN "cria" TEXT;
ALTER TABLE "leads" ADD COLUMN "objetivo" TEXT;

-- De QUAL botao da landing a pessoa veio. O formulario virou janela em 19/09 e
-- passou a ser aberto por cinco CTAs diferentes (topo, barra, demo, preco).
-- Com cinco portas para o mesmo lugar, saber qual delas converte e o que diz
-- onde por a proxima; sem isso, "a landing converteu 3%" nao ensina nada.
ALTER TABLE "leads" ADD COLUMN "cta" TEXT;
