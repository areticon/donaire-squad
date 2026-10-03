-- O estado de leitura de cada documento da marca.
--
-- NASCEU DO ACHADO DE 18/09/2026, medido antes de escrever qualquer codigo: os
-- dois PDFs que o Bruno subiu em 17/09 estavam no storage e o banco tinha ZERO
-- ProjectContext. A causa era `fetch(url)` numa URL do store privado (403), que
-- derrubava o onUploadCompleted antes do create. A tela, enquanto isso, escrevia
-- "compilado" em verde no instante do upload, a partir de um item inventado na
-- memoria da aba.
--
-- POR QUE UMA COLUNA, E NAO DEDUZIR DE `compiled`: sem ela, documento AINDA
-- SENDO LIDO e documento QUE FALHOU sao indistinguiveis, os dois com `compiled`
-- vazio. Sao estados opostos para quem esta na tela: um pede espera, o outro
-- pede acao. Foi exatamente essa confusao (ausencia tratada como falha) que
-- produziu o defeito da foto de perfil em 17/09.
--
-- E ela tem um segundo uso, que e de conteudo e nao de tela: o prompt de toda
-- campanha injeta os contextos do projeto (lib/pipeline/executar.ts). Sem
-- status, um documento que falhou entra no prompt como um titulo seguido de
-- nada, gastando lugar e dizendo ao modelo que existe material onde nao existe.
--
-- DEFAULT 'pronto' de proposito: as linhas que nascem do texto colado sao
-- compiladas de forma sincrona, na propria requisicao, e ja chegam prontas. O
-- default certo e o estado da maioria.
ALTER TABLE "project_contexts" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pronto';

-- A mensagem do erro, para a tela dizer O QUE deu errado em vez de um vermelho
-- mudo. Anulavel: so existe quando status = 'falhou'.
ALTER TABLE "project_contexts" ADD COLUMN "erro" TEXT;
