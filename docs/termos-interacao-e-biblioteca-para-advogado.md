# Demandou: uso das interações e biblioteca de design (06/10/2026)

**REVISAR COM ADVOGADO ANTES DE ASSINAR.** Texto escrito por inteligência artificial a partir do produto, sem revisão jurídica. Nada aqui é parecer.

## O que mudou

| Documento | Mudança |
|---|---|
| Termos de Uso (`app/terms/page.tsx`) | 11.3 ganha a ressalva dos itens 11.7 e 11.8. 11.4 deixa de dizer que a melhoria é "sem acesso ao conteúdo das peças" e separa melhorar de treinar. Novos 11.6 (memória do projeto), 11.7 (interações melhoram o produto para todos, com oposição) e 11.8 (biblioteca de design: o que entra, o que nunca entra, licença, retirada). 14.3 explica o destino da memória e da biblioteca no encerramento. |
| Política de Privacidade (`app/privacy/page.tsx`) | Novos 2.11 (memória: finalidade, papel de operadora, base execução de contrato, controles, retenção), 2.12 (comentários que melhoram o produto: o que a equipe vê, o que nunca entra, controladora, legítimo interesse, oposição, 24 meses) e 2.13 (biblioteca). Finalidades, bases legais, 5.3, retenção e direito de oposição atualizados. Fornecedor TypeSafe incluído na lista. Referências ao contato corrigidas para a seção 13 e "DPO" explicado. |
| Condições Gerais (`lib/contratos/modelos/condicoes-gerais.md`), versão 1.3 | Definições 1.1(p) Interações, (q) Memória do Projeto, (r) Biblioteca de Design. 11.5 com ressalva. 11.7 reescrita. Novas 11.9 (memória), 11.10 (melhoria, alíneas a até e), 11.11 (oposição), 13.2(d) (papel de controladora nesses usos), frase nova em 13.9, 17.4 a 17.8 (biblioteca). TypeSafe no Anexo II. Cada trecho novo leva a anotação "[REVISAR COM ADVOGADO ANTES DE ASSINAR ...]", que o sistema tira sozinho do texto enviado ao cliente; a trava da minuta não foi religada. |

## Perguntas para o advogado

1. **Operadora que vira controladora.** Na memória a Demandou é operadora do conteúdo do cliente; nos trechos usados para melhorar o produto, ela passa a controladora com base em legítimo interesse (13.2(d)). A autorização do cliente na 11.10 basta? Falta um relatório de legítimo interesse (o teste de balanceamento que a Autoridade Nacional de Proteção de Dados recomenda)?
2. **Dados de terceiros dentro do comentário.** Um comentário pode citar cliente do cliente ou funcionário. A minimização prometida (sem nome da conta, e-mail e telefone) é suficiente, ou é preciso anonimizar o texto antes de qualquer leitura humana?
3. **Licença da biblioteca (17.6).** Licença gratuita, sem prazo e que sobrevive ao contrato, sobre a descrição de um estilo. É válida em contrato de adesão com consumidor? A retirada (17.7) sem efeito para quem já usa é equilibrada?
4. **Prazo de 24 meses** para os trechos e a regra "o que vier primeiro" com o fim do contrato.
5. **Novo suboperador (TypeSafe).** A cláusula 13.4 manda avisar com 15 dias a inclusão de suboperador que recebe conteúdo. O modelo de decisão já recebe trechos desde 03/10. Como regularizar com quem já recebeu ou assinou contrato (o nº 1 já foi enviado pela ZapSign)?
6. **Mudança dos documentos.** Pela 22.1 e pelo item 15 dos Termos, mudança relevante exige aviso de 30 dias. Este conjunto é relevante? Para quem já é cliente, vale só na renovação?

## O que depende do Bruno

1. Confirmar as escolhas que o texto fez por ele: 24 meses de retenção dos trechos; biblioteca permanece depois do fim do contrato; retirada em até 15 dias; quem já usava continua usando; oposição por e-mail.
2. Confirmar que pode nomear a TypeSafe na política (a lista publicada nomeia todos os fornecedores) e conferir se ela treina com o que recebe.
3. Decidir se publica antes ou depois do advogado. Se este ramo for publicado, os contratos novos saem na versão 1.3 com as cláusulas não revisadas.

## O que o sistema ainda não faz (precisa estar no ar antes de publicar)

1. **A galeria mostra o texto original do pedido de design a todos os clientes** (`components/biblioteca-de-design/galeria-da-biblioteca.tsx`, linha 407), e escolher um modelo copia esse texto para o comando do projeto de quem escolheu (`app/api/projects/[id]/biblioteca-de-design/route.ts`). Se o pedido citar marca, pessoa ou contato, vaza. Contradiz o 11.8, o 2.13 e a 17.5.
2. **Todo pedido entra como público** (`publico: true` em `lib/biblioteca-de-design/registro.ts`): não há "só no meu projeto" nem botão de retirada.
3. **O feedback só mascara e-mail** (`semEmail` em `lib/feedback/regras.ts`); telefone, CPF e CNPJ passam.
4. **Não há oposição registrada** para tirar uma conta da captura do feedback, nem rotina que apague trechos com mais de 24 meses.
5. **A tela da memória do projeto ("segundo cérebro") ainda não existe**; o texto já prevê consulta pelo e-mail até lá.
6. A cópia mestre do contrato em `Documents\Demandou\contratos` está na versão de 02/10; o script `scripts/contratos-copiar-modelo.mjs` sobrescreveria a versão 1.3 do repositório. Não rodar antes de atualizar a cópia mestre.
