# Editor de vídeo pela jornada oficial (06/10/2026)

Documento de projeto. Nesta etapa nada de comportamento muda: é leitura do código, do banco (só leitura) e do vídeo de referência, e o desenho do que vem a seguir. Base: branch `backup-0210`, topo `300b2c9`.

A jornada oficial (decisão do Bruno em 06/10) é a régua de tudo:

1. Upload do vídeo.
2. Transcrição para entender cortes, erros, repetições, frases repetidas.
3. Frame a frame pelo Gemini para entender do que se trata o vídeo.
4. A IA escolhe efeitos, elementos, gráficos, animações, tudo.
5. O usuário aprova ou revisa (ex.: "troque a Ferrari vermelha por uma preta").
6. O Sonnet cria um prompt para cada elemento para a Higgsfield.
7. O JEV monta tudo.
8. Vídeo feito, usuário recebe e aprova. Fim.

Princípios: serve qualquer nicho e estilo, do médico ao cozinheiro; cada edição é nova (nenhuma mídia gerada reaproveitada, nenhum molde); todo elemento visual é gerado por IA pela Higgsfield e o código só posiciona, anima e desenha a legenda da fala; o JEV decide, o Gemini descreve, o Sonnet só escreve; nada fixo por estilo; a referência de qualidade é o vídeo da landing.

Decisões do Bruno que entram neste desenho (06/10, noite):

- **Leitura automática só do texto.** Cada elemento gerado pela Higgsfield que tem texto passa por uma leitura: o Gemini transcreve o texto da imagem e o JEV compara com o texto pedido (grafia, acento, número, logo da marca). Se estiver errado, gera de novo UMA vez. Não replaneja nada, não tira peça, não mexe em mais nada. Custo perto de US$ 0,001 por elemento.
- **Vídeo longo.** Os efeitos ficam mais espaçados e intercalados com B-roll gerado pela Higgsfield. O Remotion só posiciona, anima e desenha a legenda: nenhum elemento visual criado por código, nada inventado. A densidade é um parâmetro pela duração do vídeo, decidido pelo JEV, sem número fixo por estilo.
- **"O JEV monta".** O código calcula as posições livres (sem cobrir o rosto, dentro da área segura das redes) e o tempo de cada palavra; o JEV escolhe entre essas opções; o Remotion executa.

---

## A. O vídeo de referência (pitch-v4-0110.mp4)

### Como foi olhado

Baixado de `https://9e0m1l1ldork0jul.public.blob.vercel-storage.com/landing/pitch-v4-0110.mp4` (91,6 s, 1920x1080, 30 fps). Extraí um quadro a cada 1,5 s (61 quadros, seis folhas de contato) e medi as trocas de cena pelo ffmpeg (`select=gt(scene,0.25)`): 11 trocas fortes em 91 s, em 5,5 / 16,4 / 31,5 / 35,4 / 46,7 / 65,6 / 68,9 / 72,4 / 75,9 s.

### Como foi produzido (HANDOFF, partes de 01/10 e 02/10)

- Foi um **roteiro de montagem escrito à mão** só para ele: `pitch/v4/montar_pitch4.py`, 729 linhas de Python com ffmpeg e camadas de texto desenhadas em HTML, no scratchpad da sessão de 01/10 (`C:\Users\devan\AppData\Local\Temp\claude\c--\d4e00b36-...\scratchpad\pitch\v4`). Renderizado e conferido quadro a quadro várias vezes, em quatro versões no mesmo dia.
- **Narração:** voz pronta da ElevenLabs ("Rafael Valente"), com o alinhamento por caractere da própria ElevenLabs. Esse alinhamento virou o tempo de cada palavra.
- **Cenas geradas:** 6 cenas da Higgsfield, Kling 3.0 Pro texto para vídeo, 16:9, 5 s, sem som, US$ 0,56 cada (US$ 3,36 no total; `pitch/cenas.mjs`). Cada prompt é um parágrafo de diretor de fotografia: assunto concreto, movimento de câmera, luz, paleta e "no people, no text, no logos". Exemplos: a mesa de home office de madrugada com câmera no tripé e copos vazios (dor); a pilha de moedas que desaba em câmera lenta (custo); bonecos de massinha gêmeos (gêmeo digital); colagem de papel montando um calendário (do zero); celular com café ao sol (chamada).
- **Material real:** telas da plataforma capturadas em 4K com movimento de câmera por quadros-chave, cortes reais do Bruno e o gêmeo (OmniHuman 1.5, rosto por IA a partir de foto, voz real).
- **Manual:** quase tudo. O roteiro, a escolha de cada material, as camadas de texto, o tempo de cada entrada e as quatro rodadas de conserto foram feitos por um agente olhando o resultado. O próprio HANDOFF (02/10) registra: "o pitch ficou bom porque um diretor que ASSISTIU ao material escreveu um plano único, enxuto, com material real e 3 ou 4 cenas geradas; e o resultado foi conferido e refeito".

### O que o faz bom

1. **Cada entrada está presa à palavra.** A função `q(bloco, palavra)` do script devolve o instante exato da palavra na narração, e toda camada entra ali, 0,05 a 0,15 s antes: o cartão "Time próprio" entra em "time", "Agência" em "agência", "Fazer sozinho" em "sozinho"; no squad, cada nome acende quando é dito (Roberto, redator, Diana, Vitor, Vera, Paulo); nos formatos, cada chip acende na palavra (texto, imagem, carrossel, infográfico, enquete, thread, vídeo curto, vídeo longo). São 16 âncoras de bloco e cerca de 45 entradas cronometradas em 91 s: **um acontecimento novo a cada 2 s em média**, sem nunca ficar parado.
2. **Uma ideia por cena, e a cena dura o argumento.** Nove blocos (dor, barreiras, squad, três jeitos, redes e formatos, objeções, economia, fecho), de 5 a 19 s cada. Dentro do bloco o fundo fica e as camadas se somam; a troca de fundo marca a troca de argumento.
3. **O fundo é sempre "sobre o assunto".** Cena gerada quando o assunto é abstrato (dor, custo), tela real quando o assunto é o produto, pessoa real quando o assunto é a pessoa. Nada decorativo.
4. **Hierarquia fixa e legível.** Título no canto superior esquerdo em caixa escura translúcida (Geist 600, 72 px, uma palavra-chave em degradê laranja), elementos de apoio (cartões, listas, chips) entrando um a um embaixo ou ao lado, e a legenda pequena embaixo. Nunca mais de três níveis ao mesmo tempo.
5. **Legenda discreta e curta.** Geist SemiBold 50 px em 1080p, branca sobre caixa azul-marinho (BorderStyle 3), centralizada embaixo, páginas de até ~28 caracteres que quebram na pontuação (`grupos()` do script), sem karaokê, cada página terminando quando a seguinte começa. Ela nunca disputa com o título.
6. **Movimento constante e suave.** Câmera lenta em toda tela (empurrão, órbita), cartões com entrada curta, nenhuma transição chamativa.
7. **Sistema visual único.** Uma família de letra, um azul de fundo, um acento (laranja da marca). Isso faz 91 s de material heterogêneo (cena gerada, tela, pessoa) parecerem uma peça só.
8. **Densidade alta porque é um pitch narrado.** Atenção: o pitch NÃO é uma pessoa falando para a câmera editada. É uma montagem narrada. O que se transporta para o editor não é a densidade de 2 s, é a **régua**: tudo preso à palavra, tudo sobre o assunto do momento, legenda curta e limpa, sistema visual coerente, movimento suave, nada cobrindo o que importa.

### O que isso diz para a esteira

- O pitch teve "olhos" antes do plano (o agente conhecia todo o material) e um plano único escrito para aquele vídeo. Na jornada, isso é o passo 3 antes do passo 4.
- O pitch teve 6 cenas geradas por um parágrafo de diretor cada, não 40 imagens com bloco de estilo. Poucas peças fortes ganham de muitas peças fracas.
- O pitch desenhou o texto em código (título, cartões, chips). Pela decisão do Bruno de 06/10, no editor esses elementos passam a ser gerados pela Higgsfield com o texto pedido no prompt e a leitura automática do texto; só a legenda continua em código. Isso é mais difícil que o pitch e é o maior risco do desenho (ver G).

---

## B. Mapa do código atual para os 8 passos

Hoje existem três caminhos de edição do completo, todos ligados por interruptor:

- **Por comando** (`EDITOR_POR_COMANDO=1`, o ativo em produção): JEV decide, Sonnet redige. `lib/media/editor-por-comando/*`.
- **Sob medida** (`EDITOR_SOB_MEDIDA`): um Opus escreve a edição inteira. `lib/media/editor-sob-medida/*`.
- **Antigo** (diretor por blocos de 150 s): `dirigir`, `ilustrar`, `montar` em `montagem-do-completo.ts`, com `plano-de-montagem.ts`. É a reserva quando o sob medida desiste (`desistirDoSobMedida`, l.1965).

A ordem real hoje: `uploaded` > `transcribing` > `transcribed` > selecionar > `roteirizando` > `roteiro` (espera o cliente) > aprovar > cortar > `completoMontagem.estado`: `na-fila` > `preparando` > `dirigindo` > (`ilustrando` > `gerando`) > `montando` > `pronto`. Orquestrador: `avancarMontagemDoCompleto` (`lib/media/montagem-do-completo.ts` l.1876), chamado pelo cron, um passo por passada, troca de estado por `trocarEstado` (l.1069).

### Passo 1: upload

- `app/api/videos/upload/route.ts` (`POST`, `handleUpload`): o navegador sobe direto para o Blob; a rota assina, confere a cota e cria o `VideoJob` (`blobUrl`, `status="uploaded"`). Sem IA. **Está conforme a jornada.**

### Passo 2: transcrição e limpeza

- Transcrição: `app/api/videos/[id]/transcribe/route.ts` > `transcribeBlob` / `transcribeBlobAsync` (`lib/media/transcribe.ts` l.125 e l.302). Serviço Deepgram nova-3 (o comentário do schema ainda diz Whisper). Callback em `transcribe-callback/route.ts` grava `VideoJob.transcript`.
- Limpeza (em `prepararRoteiro`, `lib/media/roteiro-da-edicao.ts` l.504): `remocoesDaGravacao` (`lib/media/pedido-de-corte.ts` l.340) junta `detectarPausas` (código), `decidirRetomadas` (JEV, dúvida pode ir ao Claude), `detectarHesitacao` (`lib/media/limpeza.ts` l.672, muletas pelo JEV) e os detectores determinísticos `detectarRepeticoes` (l.133), `detectarFalsosComecos` (l.261), `detectarMuletasArrastadas` (l.373), `detectarMuletasCurtas` (l.432). Grava `completoMontagem.roteiro.remocoes[] {de, ate, motivo}`.
- Segunda transcrição do completo já cortado: `transcreverCompleto` (`montagem-do-completo.ts` l.1016) grava `completoMontagem.fala`.
- **Conforme a jornada.** Ressalva medida em 03/10 (HANDOFF): limpeza e retomadas pelo JEV saíram piores que pelo Claude; há interruptores (`LIMPEZA_PELO_JEV`, `RETOMADAS_PELO_JEV`, `RETOMADAS_DUVIDA_NO_CLAUDE`).

### Passo 3: leitura do vídeo pelo Gemini

- Medição no worker, sem IA paga: `medirNoWorker` (`lib/media/leitura-do-video.ts` l.167) > rota `/ler-video` (`worker/src/index.mjs` l.1822) > `worker/src/leitura-do-video.mjs` + `worker/src/leitura.py` (MediaPipe e OpenCV: pessoas, rostos, boca, tela, quadro, movimento, áreas livres, a cada 2 s; proxy 360p a 1 fps).
- Visão: `lerVideo` (l.935) > `verComGemini` (l.693), `gemini-2.5-flash` (`LEITURA_VISAO_MODELO`), Files API, esquema JSON. Custo medido US$ 0,006 a 0,007 por minuto.
- Contrato `LeituraDoVideo` (l.74) e `TrechoLido` (l.52): `{ de, ate, pessoasEmCena[{id, caixa, rosto, falando}], tela?, quadro?, movimento, acontece, mostra[], falaDe, areaLivre[], pontos? }`. Grava `completoMontagem.leitura`.
- **Fora da jornada em dois pontos:**
  1. Roda em `preparar` (`montagem-do-completo.ts` l.1233 a 1303), **depois** da aprovação do roteiro. O plano que o cliente aprova (passo 4) nunca viu o vídeo.
  2. Os trechos são grossos. No último vídeo do Bruno (`cmux4417u`, 144 s) a leitura tem 3 trechos, o primeiro de 0 a 49,5 s com uma única `areaLivre` (a faixa de cima) e `movimento: "muito"`. Um trecho de 50 s não serve para posicionar elemento de 3 s.

### Passo 4: a IA escolhe os elementos

- Caminho por comando: `prepararRoteiro` (`roteiro-da-edicao.ts` l.708 a 745) > `escreverPlanoDoCompletoPorComando` (`editor-por-comando/index.ts` l.458) > `escreverPlanoDoVideo` (l.438) > `escreverPlanoPeloJev` (`plano-pelo-jev.ts` l.1558). **Sem `leitura` e sem quadros.**
- JEV: `decidirLinguagem` (l.302: família visual, densidade, quanto vídeo, troca de cenário), `decidirPeloJev` (l.1085) e `decidirBloco` (l.777: `tipo`, `forma`, `onde`, `enfase`, `movimento` por momento, em ondas de 6), `cobrirBuracos` (l.948), `decidirInscrever` (l.1031), `decidirAsCombinadas` (l.1148), `escolherTeses` (l.1738).
- Código: `encaixar` (l.736), `montarMomento` (l.836), `regrasDoRitmo` (`elementos.ts` l.226: cota por minuto, espaço mínimo, tipo não encosta no vizinho, nenhum tipo acima de 30%, teto de vídeo e de US$ por minuto), `varianteDo` (`elementos.ts` l.151, variante por regex da fala).
- Redator Sonnet (`MODELO_DO_REDATOR`, l.159): `redigirEConferir` (l.1278), `redigirBloco` (l.1238).
- Catálogo de tipos: `TIPOS_DE_ELEMENTO` (`elementos.ts` l.63), `TIPOS_DO_CONTEXTO` (l.72), `CRITERIO_DO_TIPO` (l.78), `NOME_DO_TIPO` (l.112), `DURACAO_DO_TIPO` (l.246). As peças vêm de `editor-sob-medida/pecas.ts` (`FICHAS`, `PECAS`) e `componenteDa` (`linguagem.ts`) liga tipo e família a uma peça Remotion.
- Tipos: `PlanoDoDiretor`, `EdicaoDoEditor`, `MomentoDoEditor { peca, de, ate, eventos, plano, props }`, `InsercaoDoEditor { briefing, midia, janela, estilizada, segundos, oQueAparece }`, `ElementoDoPlano { tipo, variante, inicio, fim, peca, midia, fala, pedidoDoCliente, atendido }` (`editor-por-comando/diretor.ts` l.28 a 59, `editor-sob-medida/tipos.ts`). Tempo por âncora na fala (`"F12:palavra/fim"`).
- Persistência: `completoMontagem.roteiro.completo.comando = { texto, base, plano, feitoEm, erro, tempos, avisos }`.
- **Parcialmente conforme:** o JEV decide, o Sonnet redige. Fora da jornada: sem leitura; a unidade de decisão é um catálogo de peças desenhadas em código (ver C); o "tipo" escolhido já é um molde.

### Passo 5: o usuário aprova ou revisa

- Tela: `components/video/tela-de-roteiro.tsx`. Dados de `montarTela` (`roteiro-da-edicao.ts` l.946) e `comPecasDoComando` (l.1075). `EstimativaDoComando` (tsx l.1084) mostra linguagem, contagem por tipo e custo; `LinhaDoTrecho` (tsx l.1109) mostra tipo, texto ou "o que aparece", onde, cor, pedido atendido e o campo "Sugerir ajuste ou efeito".
- Sugestão: POST `/api/videos/[id]/roteiro/sugestao` > `gravarSugestao` (`lib/media/sugestoes-do-completo.ts`), grava `roteiro.completo.sugestoes[] {de, ate, inicio, fim, fala, texto, em}`. **Por trecho de tempo, não por elemento.** Não chama IA; o plano mostrado não muda, então o cliente não vê o efeito do pedido antes de aprovar.
- `/roteiro/cena` (`ajustarCena`, l.1170: remover, editar, restaurar, nova ideia) só funciona no plano antigo; no caminho por comando devolve 404.
- Aprovar: POST `/roteiro/aprovar` > `aprovarRoteiro` (l.1343): cobra, grava `aprovadoEm`, despacha o corte.
- Depois da aprovação, `editarSobMedida` (`montagem-do-completo.ts` l.2033) reaproveita o plano só se o comando não mudou (senão descarta em silêncio); `sugestoesDoCliente` (l.2137) vira `PedidoDaCena[]`; `completarPlanoPeloJev` (`plano-pelo-jev.ts` l.1648) interpreta pelo JEV (`interpretarPedidos`, `PedidoDoCliente` em `pedido-do-cliente.ts` l.31), apaga os elementos do trecho, encaixa o pedido, o redator reescreve e o JEV confere (`conferirPedidos`, l.1395).
- **Fora da jornada:** a revisão não é por elemento, não é mostrada antes da aprovação, e o plano pode ser refeito depois sem o cliente ver.

### Passo 6: um prompt por elemento

- Caminho por comando: o Sonnet escreve uma "cena" por momento (`linhaDoMomentoParaORedator`, l.1230, leva a fala do momento, o "EM CENA" da leitura quando existe e o pedido do cliente). O prompt final é montado em código por `promptDaMidia` (`linguagem.ts` l.354): `"${cena}. Visual treatment only...: ${blocoDeEstilo}" + GUARDA_DA_IMAGEM_ESTILIZADA | GUARDA_DO_VIDEO_ESTILIZADO`. O bloco de estilo sai de `escreverBlocoDeEstilo` (l.462) sobre a ficha do catálogo (`baseDoBlocoDeEstilo`, l.423) ou de `blocoDeEstiloDeReserva` (`linguagem.ts` l.280). Pedido do cliente: `promptDaMidiaDoPedido` (l.1381). Juntar: `materializar` (l.1471).
- Caminho sob medida: o Opus escreve `insercoes[].briefing` direto (`editor-sob-medida/editor.ts` l.27 e l.46); o código acrescenta `GUARDA_DA_INSERCAO` ("Photographic, natural light, no text...", `editor-sob-medida/index.ts` l.60).
- Geração de imagem: `gerarInsercoes` (`editor-sob-medida/index.ts` l.69) > `gerarImagem(..., { tipo: "colagem" })` (`nano-banana.ts` l.400) > Higgsfield `gpt-image-2.5-medium` (`imagem-higgsfield.ts` l.204); falhou, cai no Google (Imagen 3 > Gemini Flash Image > Vertex > Pollinations).
- Vídeo: no caminho por comando só o fundo da "combinada" vai ao Kling (`gerarFundosCombinados`, `combinada.ts` l.206). Um momento que o JEV decidiu como vídeo **sai como imagem parada com zoom** (`imagensDoPlano`, `editor-por-comando/index.ts` l.358). No sob medida, `pedirVideosDasInsercoes` (l.164) só com `HIGGSFIELD_NA_EDICAO=1`.
- **Parcialmente conforme:** o Sonnet escreve a cena com a fala. Fora da jornada: o bloco de estilo fixo é colado em todo prompt; o vídeo pedido vira foto; há recuo silencioso de modelo; o nome do arquivo é o hash do prompt (ver C).

### Passo 7: o JEV monta

- Tempo: `resolverAncora` (`editor-sob-medida/resolver.ts` l.53). No caminho por comando a unidade é `momentosDaFala` (`plano-pelo-jev.ts` l.537): a peça entra no começo da frase ou do pedaço, **não na palavra que pede o elemento**.
- Posição: `lib/media/editor-por-comando/resolver.ts` com `leitura-no-plano.ts` (`trechoEm`, `ladoLivreDoTrecho`, `faixaLivreDoTrecho`, `caixaLivre`, `zonaLivre`, l.253 a 486); regras por tipo (`caixaDaJanela`, `caixaDaVetorial`, `caixaDaFolhaNoTrecho`, `ZONAS_DO_INSCREVER`, posições fixas para ícone, sublinhado e marca-texto). Quem decide é o código; o JEV escolhe "onde" no plano, antes de conhecer a área livre.
- Render: `enviarSobMedida` (l.2198) > worker `/montar-completo` (`worker/src/index.mjs` l.2164) > `montarSobMedida` (`worker/src/edicao-sob-medida.mjs` l.1008) > Remotion `SobMedidaCamadas` (`worker/remotion/src/sob-medida/Camadas.tsx`, mapa `PECAS` l.23) em até três passadas (frente, atrás com recorte, vidro) > ffmpeg por lote (`grafoDoLote`, l.632: empurrão, Ken Burns, grão, `vignette`, legenda `.ass` l.868, transições l.197, sons l.485).
- **Fora da jornada:** o JEV não monta (o código posiciona por regra de tipo); tempo na frase e não na palavra; quase todas as peças desenham conteúdo.

### Passo 8: entrega e aprovação

- `entregarCompleto` (`montagem-do-completo.ts` l.2424) troca `completoUrl`, guarda o original uma vez, `avisarVideoPronto`. `anexarCompletoAoQuadro` (`lib/media/completo-no-quadro.ts` l.21) cria o post do YouTube em rascunho e o card do Vitor (`pending`).
- Aprovação: PATCH `app/api/campaign-cards/[id]/route.ts` (`approved`, `rejected`, `needs_revision`, `archived`).
- **Fora da jornada:** `needs_revision` não volta ao editor; refazer (`refazerMontagemDoCompleto` l.1218, `tentarMontagemDoCompletoDeNovo` l.2585) não leva texto do cliente. Antes da entrega, uma conferência visual replaneja sozinha (ver C).

### O que o banco mostra (leitura só, 06/10 23h)

Último completo do Bruno, `cmux4417u000004l56g3x5urx` (projeto Demandou, 144 s, estilo `consorcio`, linguagem "Luxo e high ticket"):

- 11 peças no render final: 5 `sublinhado`, 2 `frase-chave`, 1 `titulo-em-caixa`, 1 `cartoes-em-linha` (Shorts, TikTok, Instagram, YouTube com os ícones de linha `video`, `compartilhar`, `camera`, `video`: nenhum logo), 2 `inscrever`. **Uma única imagem gerada** (`insercao-2e8cdb3b37ad.png`, US$ 0,24 de imagem no total). Ou seja: 10 de 11 elementos desenhados em código.
- Avisos: "plano do roteiro reaproveitado"; quatro títulos atrás "foram para a frente" porque "a pessoa se mexe muito"; duas folhas sem área livre; `cartoes-em-linha` "cobriria rosto, saiu"; "conferência visual: 11 peça(s) reprovada(s) replanejada(s)" (o motivo de quase todas era "Legenda sobreposta ao texto da peça"); "conferência: 4 elemento(s) reprovado(s) pelo JEV saíram"; "cobertura: 10 elemento(s) novo(s) sobre 3 existentes (170 perguntas ao JEV)".
- Leitura: 3 trechos para 144 s.

É o retrato do problema: o plano aprovado não é o que vai ao ar, as guardas e a conferência trocam e tiram peças, e o que sobra é texto desenhado em código num molde de estilo.

---

## C. O que existe hoje fora da jornada ou contra ela

Legenda de cada item: **ATIVO** = está no caminho do completo por comando (o de produção); **SOB MEDIDA** = só com `EDITOR_SOB_MEDIDA` sem o por comando; **RESERVA** = esteira antiga, que entra quando o editor falha (`desistirDoSobMedida`, `montagem-do-completo.ts` l.1965, sem avisar o cliente). Na coluna "Destino", o que acontece no desenho novo (D): **sai** (a esteira nova não chama), **muda**, **fica**.

### C1. Fichas e blocos de estilo que mandam no conteúdo

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `lib/media/editor-por-comando/comando-dos-estilos.ts` l.63 a 455 | `LINGUAGEM_DOS_ESTILOS` (26 fichas) | O `comando` da ficha dita assunto ("mapa antigo com círculo", "carimbo" no Vox; "no escritório, no carro ou no evento" no consórcio) e o `bloco` em inglês vai inteiro em todo prompt | ATIVO | sai |
| `editor-por-comando/plano-pelo-jev.ts` l.369 a 375, l.423, l.462 a 500 | `SISTEMA_DO_ESTILO`, `baseDoBlocoDeEstilo`, `escreverBlocoDeEstilo` | Um bloco de estilo por vídeo colado no fim de toda imagem: todas as imagens com o mesmo texto | ATIVO | sai |
| `editor-por-comando/linguagem.ts` l.146 a 239, l.280 | sementes das famílias, `blocoDeEstiloDeReserva` | Sem redator, a semente fixa da família vira o bloco | ATIVO | sai |
| `plano-pelo-jev.ts` l.282 a 293, l.1245 | `linguagemComFicha`, `ritmoDaFichaAoJev` | A ficha de peças vai como "base obrigatória" ao redator; o ritmo da ficha vai ao JEV | ATIVO | sai |
| `editor-por-comando/index.ts` l.102 a 122 | `comandoPadrao` | Projeto sem comando recebe a ficha como comando; Vox, documentário e Johnny Harris recebem um texto fixo com "marca-texto amarelo", "carimbo vermelho", "mapa antigo" (`comando.ts` l.63 a 100) | ATIVO | sai |
| `lib/media/catalogo-de-estilos.ts` l.253 | `normalizarEscolha` | Sem escolha, o estilo vira "hormozi": um médico sem escolha recebe a ficha Hormozi | ATIVO | sai |
| `editor-por-comando/index.ts` l.460, 479, 549 | base padrão | "keynote" quando falta outra base | ATIVO | sai |
| `lib/media/biblias/*` e `biblias/index.ts` l.56 e 73 | `bibliaDoEstilo` | No ativo só a passagem da abertura; o resto (prompt do diretor com Galileia do século I e túnicas, `prompt-do-diretor.ts` l.25; colagem proibida fora do Vox, l.33) na reserva; estilo desconhecido cai em Hormozi | RESERVA (abertura no ATIVO) | sai |
| `editor-sob-medida/index.ts` l.33 | `referenciaParaOEditor` | Referência fixa do estilo vai ao Opus | SOB MEDIDA | sai |

### C2. Famílias e kits que mudam a composição

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `editor-por-comando/linguagem.ts` l.136 a 248 | `FAMILIAS` (9), `familiaPorPalavras`, `familiaValida` | Cada família tem visual, base, fonte e componentes próprios (papel troca janela por "colagem", citação por "jornal"); sem casar, vira "minimalista" | ATIVO | sai |
| `editor-sob-medida/tipos.ts` l.14 | `Visual = "vidro" \| "impacto" \| "documental"` | As 9 famílias viram 3 temas no worker: cartoon e Hormozi saem com as mesmas peças | ATIVO | sai |
| `editor-sob-medida/resolver.ts` l.85 a 99 | `temaDoEstilo`, `acentoVivo` | Fonte e visual fixos por estilo; a cor da marca do cliente é trocada quando "apagada" | ATIVO | sai |
| `lib/media/acentos-do-vox.ts` (via `temaDoComando`, `index.ts` l.176 a 189) | papéis de cor do Vox | Realce e carimbo do Vox aplicados a toda linguagem | ATIVO | sai |
| `editor-sob-medida/recortes-vox.ts` l.41 a 75 | `promptDoRecorte`, `GENERICO` | Toda foto de peça de papel vira "archival black and white photograph... early 20th century"; nome próprio vira "1920s man in a dark suit" | ATIVO (família papel) | sai |
| `catalogo-de-estilos.ts` l.224 a 244 | `camadasCompativeis` | Efeitos e câmera escolhidos pelo cliente são apagados conforme o kit | ATIVO | sai |
| `editor-por-comando/diretor.ts` l.120 | `pecaNoEstiloDoComando` | Peça fora do estilo vira marca-texto no Vox ou sai | só com diretor Opus | sai |
| `worker/remotion/src/sob-medida/pecas/vetoriais.tsx` l.47 e outros (`inscrever.tsx` l.32, `contexto.tsx` l.42, `midia.tsx` l.69, `combinadas.tsx` l.64 e 76, `Camadas.tsx` l.204) | dourado do luxo | "Luxo" força `#C9A24A` no lugar da cor da marca | ATIVO | sai |

### C3. Peças desenhadas em código

| Onde | O quê | Caminho | Destino |
|---|---|---|---|
| `editor-por-comando/elementos.ts` l.21 a 63 e `linguagem.ts` l.99 a 134 (`COMPONENTE_GENERICO`) | Quase todo tipo vira peça Remotion desenhada: título atrás, número, barras, progresso, gráfico de linha, linha do tempo, passos, cartões, citação, pergaminho, frase de impacto, sublinhado, os 7 de contexto, os 5 vetoriais, inscrever. Só imagem em tela, vídeo e o fundo da combinada são gerados | ATIVO | sai |
| `worker/remotion/src/sob-medida/pecas/vetoriais.tsx` | `IconeComFrase` (l.101), `ComparacaoLadoALado` (l.150, vermelho fixo `#ef3b3b`), `CartoesEmLinha` (l.208), `InterfaceDeEdicao` (l.250, tela de editor de vídeo com botões de macOS: conteúdo de um nicho só), `TituloEmCaixa` (l.410) | ATIVO | sai |
| `editor-por-comando/icones-de-linha.ts` (148 ícones, com "biblia" e "cruz"), `icone-pelo-jev.ts` l.60, `worker/remotion/src/sob-medida/icones-de-linha.ts` | Ícone sai de catálogo fixo; foi o que pôs ícone genérico no lugar do logo das redes | ATIVO | sai |
| `pecas/texto.tsx`, `estrutura.tsx`, `dados.tsx`, `apontar.tsx` (inclui `Desenho`, SVG escrito pelo modelo), `lousa.tsx` (89 cores fixas), `contexto.tsx`, `inscrever.tsx` | Título, capítulo, rótulo, citação, pergaminho, cartões, linha do tempo, escada, checklist, comparação, fluxo, número, barras, gráfico, cifrão, mapa, seta, círculo, palavra gigante, busca, chat, nome de quem fala, cartão de passo, frase-chave, slide, inscrever | ATIVO | sai |
| `pecas/vox.tsx` (l.447 a 891) | Colagem, jornal, mapa antigo, censura, marca-texto, cronologia, fundo-colagem: papel, mapa e carimbo em código com texturas fixas (`vox/papel.jpg`, `mapa.jpg`, `manuscrito.jpg`) | ATIVO (família papel) | sai |
| `worker/remotion/src/sob-medida/kit.tsx` | Palco, grade em perspectiva, poeira de luz e contador para toda tela cheia | ATIVO | sai |
| `editor-por-comando/combinada.ts` l.41 a 69 (`FUNDOS_DA_COMBINADA`) e `pecas/combinadas.tsx` | Só 4 fundos fixos (vista aérea, mural, mesa, rede) com cena fixa em inglês; pontos, fio e etiquetas desenhados em código (etiquetas fora do lugar geográfico, HANDOFF 06/10) | ATIVO | sai |
| `editor-por-comando/caixa-das-vetoriais.ts` l.34, `janela-de-imagem.ts` l.19 a 40 | Tamanhos fixos por peça; sem espaço, a janela sai | ATIVO | muda (vira opção de caixa calculada) |
| `pecas/midia.tsx` (`ImagemJanela`) | Única peça que só mostra a mídia gerada | ATIVO | fica (base da "mídia na caixa") |
| `lib/media/infografico-em-codigo.tsx`, `icones-de-marca-svg.ts` | Infográfico e ícones de marca desenhados | fora do completo (feed) | fora do escopo |

### C4. Catálogos fixos de tipo de elemento

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `editor-por-comando/elementos.ts` l.63, 72, 75 | `TIPOS_DE_ELEMENTO`, `TIPOS_DO_CONTEXTO`, `TIPOS_DECIDIVEIS` | O JEV só escolhe dessa lista (`plano-pelo-jev.ts` l.692 a 696) | ATIVO | sai (troca por 4 formatos de mídia) |
| `elementos.ts` l.151 a 189 | `varianteDo` | Variante por regex em código ("salmo" vira pergaminho; número com ano vira "dado-evolucao") | ATIVO | sai |
| `elementos.ts` l.226 a 270, `plano-pelo-jev.ts` l.756 | `regrasDoRitmo`, `DURACAO_DO_TIPO` | Densidade fixa por minuto (2,5 / 4 / 6), tela no máximo 30%, `maiorSemTroca` 15 a 45 s, nenhum tipo acima de 30% | ATIVO | muda (densidade pelo JEV por duração) |
| `editor-sob-medida/pecas.ts` l.51 e l.75 a 418 | `PECAS`, `FICHAS` (64 peças), `ESTILOS_DO_VOX` | Duração e props de cada peça fixas | ATIVO | sai |
| `biblias/elementos.ts` l.17, `plano-de-montagem.ts` (`VOCABULARIO`) | `ELEMENTOS_DO_PROMPT` | Vocabulário fixo do diretor antigo | RESERVA | sai |

### C5. Guardas que reescrevem, rebaixam ou tiram peças

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `plano-pelo-jev.ts` l.1301 a 1328 | `redigirEConferir` | Texto ou cena reprovados pelo JEV são apagados sem refazer: a peça sai | ATIVO | sai (aprovado é congelado) |
| `plano-pelo-jev.ts` l.1738 a 1781 | `escolherTeses` | Troca o texto do redator por uma palavra da fala ou apaga o título atrás | ATIVO | sai |
| `plano-pelo-jev.ts` l.1170 | `semCruzamento` | Peças que se cruzam saem | ATIVO | muda (só nas opções do passo 4, antes da tela) |
| `plano-pelo-jev.ts` l.853 a 901 | `montarMomento` | Vídeo acima do teto vira imagem; tela cheia que não cabe vira janela; fora do orçamento sai; com movimento "muito", título atrás proibido | ATIVO | sai |
| `editor-por-comando/resolver.ts` l.260 a 300, l.599 a 605 | rebaixamentos do resolvedor | Título atrás com a pessoa mexendo vai para a frente ou vira legenda-destaque; caixa sobre rosto tira a peça; legenda da janela removida. No `cmux4417u`: 4 títulos movidos, 2 folhas movidas, 1 cartão tirado | ATIVO | muda (posição vira opção calculada antes, nunca remoção depois) |
| `editor-sob-medida/recortes-vox.ts` l.239 | `tirarFotosSemImagem` | Peça sem foto perde a foto ou sai inteira | ATIVO | sai |
| `lib/media/guarda-da-fala.ts`, `worker/src/guarda-da-fala.mjs` | guarda da fala no final (`montagem-do-completo.ts` l.2215) | Apara retakes DEPOIS do render; pode cortar uma peça no meio (`fala-conferida.ts` l.9 a 16 admite) | ATIVO | muda (as remoções todas no passo 2, antes do plano) |
| `guardas-do-completo.ts` l.293, 326, 373, 390, 401 | `semInsercaoQueNaoSeSustenta`, `limitarTextoNaTela`, `planoSeguro`, `voltarCenasParaPessoa`, `semAmpliarImagemPequena` | Reescrevem o plano antigo | RESERVA | sai |
| `editor-sob-medida/revisor.ts`, `editor-por-comando/revisor.ts` | revisores por LLM | Sonnet dando nota (contra "Sonnet só escreve"); desligado por padrão | RESERVA | sai |

### C6. Conferência visual automática com replanejamento

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `lib/media/conferencia-visual.ts` l.304, chamada em `editor-por-comando/index.ts` l.296 | `conferirImagensGeradas`, `cenaReescrita` (l.208), `decisaoDeReserva` (l.222) | Gemini descreve a imagem e o JEV refaz com prompt reescrito ou tira; o critério da l.258 manda refazer "colagem ou painéis" (briga com o estilo papel); sem JEV, decide em código | ATIVO | muda (vira a leitura automática SÓ do texto, decisão do Bruno) |
| `conferencia-visual.ts` l.504, `editor-por-comando/index.ts` l.323, `montagem-do-completo.ts` l.2170 e l.2391 | `conferirVideoPronto`, `replanejarMomentosPorComando` | Quadros do vídeo pronto, JEV reprova peça a peça, as reprovadas saem e a cobertura refaz; no `cmux4417u`, 11 peças replanejadas porque a legenda cruzava o texto (o defeito era da legenda, as peças pagaram) | ATIVO | sai |
| `conferencia-da-imagem.ts` l.61, `revisao-visual.ts`, `worker/src/conferencia-do-render.mjs` l.111 e 128 | `conferirAssets`, troca do trecho "vazio" pela base | Conferências da esteira antiga | RESERVA | sai |

### C7. Caminhos de reserva que trocam modelo, mídia ou estilo em silêncio

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `lib/media/nano-banana.ts` l.400 a 446, `imagem-higgsfield.ts` l.452 a 462 | `gerarImagem`, `RecuoParaOGoogle`, `avisarRecuo` (l.500, só `console.warn`) | Higgsfield falhou, sem crédito, sem vaga ou com prompt longo: cai no Google (Imagen 3, Gemini Flash Image, Vertex, Pollinations) sem aviso ao cliente; `comPessoaAnonima` mexe no prompt antes | ATIVO | muda (sem recuo silencioso; ver decisão 2 em G) |
| `editor-por-comando/index.ts` l.358 a 372 com `editor-sob-medida/index.ts` l.69 a 101 | `imagensDoPlano` > `gerarInsercoes` | **O momento que o JEV decidiu como vídeo sai como imagem parada** com zoom, e o prompt ainda leva a guarda de vídeo ("camera moves") | ATIVO | muda (vídeo vai ao Kling) |
| `montagem-do-completo.ts` l.1965 e l.2095 | `desistirDoSobMedida` | Qualquer erro do editor joga o vídeo na esteira antiga (bíblias, moldes) | ATIVO | sai (falha aparece, não troca de esteira) |
| `plano-pelo-jev.ts` l.302 a 366 | `decidirLinguagem` sem JEV | Família, cenário e legenda por regex; abaixo dos limiares valem "medio", "algum", "janela" | ATIVO | sai |
| `editor-por-comando/combinada.ts` l.214 | fundo da combinada | Sem `HIGGSFIELD_NA_EDICAO=1`, o fundo some e a peça vira "folha sobre a gravação" | ATIVO | sai |
| `editor-sob-medida/broll.ts` l.45 a 50 | ordem do B-roll | Banco de stock (Pexels, Pixabay) antes de qualquer IA | SOB MEDIDA | sai (B-roll gerado pela Higgsfield) |

### C8. Cache e nome de arquivo pelo hash do prompt, reaproveitamento

| Onde | Efeito | Caminho | Destino |
|---|---|---|---|
| `editor-sob-medida/index.ts` l.92 e 93 | `editor-sob-medida/insercao-<sha1(prompt)[0:12]>.png` com `addRandomSuffix: false` e `allowOverwrite: true`, num caminho global: o mesmo prompt em outro vídeo **sobrescreve** a imagem do vídeo anterior; com o bloco de estilo igual em todo prompt, a colisão é mais provável | ATIVO | sai |
| `editor-sob-medida/recortes-vox.ts` l.134 a 163 | `editor-sob-medida/vox/rec-<sha1(prompt)>.webp`, global: lê antes e **reaproveita** a foto entre projetos | ATIVO (papel) | sai |
| `editor-por-comando/combinada.ts` l.215 a 224 | referência `combinada-<projectId>`, chave `sha1(prompt|segundos|formato)`: o vídeo de fundo é **reaproveitado** entre vídeos do mesmo projeto | ATIVO | sai |
| `editor-por-comando/index.ts` l.32 e l.506 | comentário que assume a política "cache pelo hash do pedido" | ATIVO | sai |
| `assets-da-montagem.ts` l.298 a 312, l.523, l.591 a 659 | `montagem/assets/<hash(prompt+proporcao)>` e `montagem/papel/<hash>` globais, origem "reaproveitado"; textura de papel igual para todos | RESERVA | sai |
| `editor-sob-medida/broll.ts` l.201 a 230, l.319 | cache global de busca e de vídeo de stock por consulta | SOB MEDIDA | sai |
| `higgsfield.ts` l.312 e 476, `imagem-higgsfield.ts` l.466 | checkpoint do pedido pago (só recupera pedido já pago e não entregue, dentro do mesmo vídeo) | ATIVO | fica (não é reaproveitamento; protege dinheiro pago) |

### C9. Legenda que ignora a escolha

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `editor-por-comando/estilo-manda.ts` l.84 a 90 | `legendaDoEstiloFixo` | Das 5 opções (`legenda-escolhida.ts` l.46: palavra, caixa, marca-texto, papel, limpa), três viram a mesma legenda limpa; o desenho escolhido se perde | ATIVO | muda (cada opção com o seu desenho) |
| `estilo-manda.ts` l.163 | `legendaQueVale` | Na "Automática", a ficha do estilo decide a legenda | ATIVO | muda (Automática = a do pitch, igual para todo nicho, com a letra da marca) |
| `worker/src/edicao-sob-medida.mjs` l.525 a 575, `montagem-do-completo.ts` l.2021 | `desenhoDaLegenda`, `legendaSobMedida`, `escuroLegenda` | Só 3 fontes; caixa escura fixa `#06111F` | ATIVO | muda |
| `editor-sob-medida/faixa-da-legenda.ts` l.39 a 60 | `posicionarLegenda` | A página fica "oculta" sob peça com texto: a legenda some | ATIVO | muda (quem cede é a caixa do elemento) |
| `legenda-escolhida.ts` l.82 a 86, l.115 a 119 | `LEGENDA_AUTOMATICA`, `legendaDoCorteDecidida` | Legenda automática fixa por família; nos cortes, ignora o "sem legenda" do projeto | ATIVO (cortes) | muda |
| `editor-sob-medida/resolver.ts` (`resolverSobMedida`) | | Ignora o estilo de legenda escolhido; sai sempre a do pitch | SOB MEDIDA | sai |

### C10. Abertura, inscrever, cobertura e outras adições automáticas

| Onde | Função | Efeito | Caminho | Destino |
|---|---|---|---|---|
| `plano-pelo-jev.ts` l.1031 a 1077, `montagem-do-completo.ts` l.2128 | `decidirInscrever` com `youtube: true` fixo | 1 a 3 chamadas "Curtir e se inscrever" com texto fixo, peça desenhada (`inscrever.tsx`) | ATIVO | decisão do Bruno (G) |
| `plano-pelo-jev.ts` l.948 a 1006, l.1122 | `cobrirBuracos` | Força peça em todo trecho maior que `maiorSemTroca`, com 15% a mais de orçamento; no `cmux4417u`, 170 perguntas ao JEV para pôr 10 elementos que o cliente nunca viu | ATIVO | sai |
| `plano-pelo-jev.ts` l.1126 a 1132 | gancho | Texto forçado nos 3 primeiros segundos do vertical curto | cortes | sai |
| `worker/src/edicao-sob-medida.mjs` l.485 a 505, l.1350 a 1356 | `efeitosDaEdicao` | Whoosh, riser, impacto, pop e tique sintetizados em toda peça; o completo nunca manda `efeitos: false` | ATIVO | decisão do Bruno (G) |
| `edicao-sob-medida.mjs` l.868 | grão e vinheta | `vignette` + `noise` em TODO lote, inclusive sobre a gravação do cliente, sem interruptor | ATIVO | sai |
| `edicao-sob-medida.mjs` l.986 a 1000 | `gradeParaCasar` | Muda a cor da mídia inserida (contraste 1,04, saturação 0,9) | ATIVO | sai |
| `montagem-do-completo.ts` l.2213, `worker/src/abertura-de-impacto.mjs` l.91 a 103, l.198 a 210 | abertura de impacto | Família "sobrio" fixa, fonte Anton, acento `#F97316` padrão, passagem da bíblia | ATIVO quando aprovada | decisão do Bruno (G) |
| `editor-por-comando/resolver.ts` l.559, `editor-sob-medida/resolver.ts` l.150 a 176 | `cameraDeRitmo` | Ciclo fixo de zoom (médio, fechado, aberto) por código | ATIVO | sai (zoom, se houver, vira opção escolhida pelo JEV) |
| `edicao-sob-medida.mjs` l.197 | `transicoesDaEdicao` | Flash, whip e luz | ATIVO | sai |

### C11. O que faz vídeos de nichos diferentes saírem parecidos

1. **O nicho não chega ao editor do completo.** `entradaDoPlanoDoCompleto` (`montagem-do-completo.ts` l.2101 a 2130) não passa `nicho` nem nome da marca (os cortes passam, `montagem-nos-cortes.ts` l.406); a conferência do JEV lê "Nicho do projeto: não informado" (`plano-pelo-jev.ts` l.1313). Conferido no código.
2. Estilo padrão escondido: Hormozi sem escolha, keynote sem base, minimalista sem família (C1, C2).
3. Fontes fixas: `comando.ts` l.31 a 48 (playfair, geist, oswald, archivo; geist padrão; `PALETAS_PRONTAS`), `comando-dos-estilos.ts` l.466 (`fonteDoEstilo`).
4. Sufixos fixos em todo prompt: `GUARDA_DA_IMAGEM_ESTILIZADA`, `GUARDA_DO_VIDEO_ESTILIZADO` (`linguagem.ts` l.338 a 342), "Photographic, natural light" e "Cinematic footage... film grain" (`editor-sob-medida/index.ts` l.61 e 110); `coresNoPrompt` (`linguagem.ts` l.267 a 272) com a mesma frase de cor.
5. `SISTEMA_DO_REDATOR` (`plano-pelo-jev.ts` l.1191 a 1212): "sem texto na imagem" para todo nicho. Pela decisão do Bruno, texto pedido pode ir na imagem e é conferido pela leitura automática.
6. O mesmo catálogo de 30 e poucas peças desenhadas para qualquer assunto: um médico e um cozinheiro recebem sublinhado, frase-chave e cartões iguais.

### C12. Interruptores que existem hoje (para desligar o que sai)

- Caminho: `EDITOR_POR_COMANDO`, `EDITOR_SOB_MEDIDA`, `MONTAGEM_DO_COMPLETO`, `EDITOR_POR_COMANDO_DIRETOR`, `DIRETOR_LIMPO`.
- Geração: `HIGGSFIELD_NA_EDICAO`, `IMAGEM_COLAGEM` e irmãos, `BROLL_PELA_HIGGSFIELD`, `BROLL_PELA_FAL`, `VOX_FOTOS_POR_EDICAO`.
- Teto: `EDITOR_TETO_USD_POR_MINUTO`, `EDITOR_VIDEOS_POR_MINUTO`, `EDITOR_SOB_MEDIDA_VIDEOS*`, `EDITOR_COMBINADA_ESPERA_SEG`.
- Conferência: `CONFERENCIA_VISUAL`, `EDITOR_POR_COMANDO_RODADAS(_COMPLETO)`, `REVISAO_VISUAL_DO_COMPLETO`.
- Fala: `GUARDA_DA_FALA`, `FALA_CONFERIDA_NO_COMANDO`, `RETOMADAS_PELO_JEV`, `RETOMADAS_DUVIDA_NO_CLAUDE`, `LIMPEZA_PELO_JEV`.
- Leitura: `LEITURA_VISAO`, `LEITURA_VISAO_MODELO`.
- **Sem interruptor nenhum** (precisam de um, ou só deixam de ser chamados pela esteira nova): grão e vinheta, efeitos sonoros, curtir e inscrever, cobertura de buracos, câmera de ritmo, dourado do luxo, cache global por hash de prompt, ausência do nicho.

---

## D. O desenho novo, mínimo, passo a passo

### Ideia central

Uma esteira só, nova, atrás do interruptor `EDITOR_JORNADA=1`, que reaproveita o que já está bom (upload, transcrição, limpeza, medição do worker, Gemini, cliente do JEV, Higgsfield, a base do worker e da legenda) e **não chama** nada de C. O caminho por comando, o sob medida e o antigo ficam como estão, desligados para o completo quando o interruptor novo estiver ligado. Nada é apagado antes de a esteira nova passar no banco de provas (F).

Três papéis, sem mistura:

- **Gemini descreve** (o vídeo no passo 3; o texto de cada imagem gerada na leitura automática).
- **Sonnet escreve** (as ideias de elemento no passo 4, a descrição revisada no passo 5, o prompt no passo 6).
- **JEV decide** (quais momentos ganham elemento, qual ideia, qual formato, qual posição, qual animação, densidade, se o texto da imagem confere).
- **Código** calcula opções (tempo das palavras, áreas livres, área segura) e executa (Remotion posiciona, anima e desenha a legenda).

### Passo 1: upload

Fica como está.

### Passo 2: transcrição e limpeza

Fica como está (Deepgram + `remocoesDaGravacao`). Muda uma coisa: a lista de remoções e a transcrição viram a **linha do tempo da edição** (o "tempo editado" de cada palavra), calculada uma vez e gravada, para que os passos 3 a 7 falem a mesma língua de tempo. Hoje a fala é transcrita de novo depois do corte (`transcreverCompleto`); pode continuar, mas o plano é escrito no tempo do original e convertido por uma função pura (`tempoEditado(t, remocoes)`), testada.

### Passo 3: leitura do vídeo, ANTES do plano

- Mover a chamada de `lerVideo` para `prepararRoteiro`, antes do plano, sobre o vídeo original (as remoções convertem o tempo depois).
- Trechos finos: pedir ao Gemini trechos de 4 a 10 s, alinhados às frases (o código manda as fronteiras das frases da transcrição), com `acontece`, `mostra`, `falaDe` e o cenário. A medição do worker (a cada 2 s) continua sendo a fonte de rosto, corpo, tela, quadro e área livre; o Gemini não posiciona nada.
- Custo: o mesmo US$ 0,007 por minuto (o vídeo é o mesmo; muda a granularidade pedida). Tempo: +2 a 4 min antes da tela do roteiro, com o aviso na tela.

### Passo 4: a IA escolhe os elementos

Em três movimentos, sem catálogo de peças:

1. **Momentos candidatos (código).** Cada frase da fala é um candidato, com as palavras e seus tempos. Nada é escolhido aqui.
2. **Ideias (Sonnet, uma chamada por bloco de ~3 min).** Para cada momento, o Sonnet escreve até 2 ideias de elemento em português, concretas e visuais, tiradas da fala daquele momento e da leitura do trecho: "Uma Ferrari vermelha acelerando numa estrada de serra ao entardecer". Cada ideia traz a **palavra-gatilho** (a palavra da fala em que o elemento deve aparecer), o **texto na imagem** quando houver (só palavras ditas, ou um número dito, ou o nome de uma marca dita) e a **mídia sugerida** (imagem, imagem recortada, vídeo). Entram no pedido: a fala do momento e das vizinhas, a leitura do trecho, o nicho e o nome da marca do projeto (hoje eles nem chegam ao editor do completo, C11) e o **estilo do cliente em linguagem natural** (o comando que ele escreveu, sem tradução para ficha). Nada de lista de tipos, nada de bloco de estilo.
3. **Decisões (JEV).** Num lote só:
   - `score` "este momento pede um elemento?" para cada frase (força do momento);
   - `choice` entre as ideias do momento (ou "nenhuma");
   - `choice` do formato de composição entre os poucos formatos que o código sabe posicionar: tela cheia, janela ao lado da pessoa, elemento recortado sobre a gravação, vídeo (B-roll) em tela cheia. O formato diz **onde e como a mídia entra**, nunca o que ela mostra nem como é desenhada;
   - `choice` da densidade do vídeo (ver abaixo).
   - O código só aplica limites físicos: espaço mínimo entre elementos, nunca dois ao mesmo tempo no mesmo lugar, teto de custo mostrado ao cliente.

**Densidade pela duração, decidida pelo JEV.** O código oferece ao JEV as opções em "segundos médios entre elementos" com a duração do vídeo e o gênero lido no estado (por exemplo: 4 a 6 s, 6 a 10 s, 10 a 20 s, 20 a 40 s). O JEV escolhe; vídeo longo naturalmente cai nas opções espaçadas. Em vídeo longo, os elementos se intercalam com B-roll gerado (formato vídeo em tela cheia, com a voz por baixo). Nenhum número fica preso a estilo.

**Contrato que o passo 4 entrega à tela do passo 5** (`completoMontagem.jornada.plano`):

```ts
type ElementoProposto = {
  id: string;                    // único na edição
  momento: { de: number; ate: number; frase: string };   // tempo do original, em s
  gatilho: { palavra: string; indice: number; t: number }; // a palavra da fala em que entra
  descricao: string;             // pt, o que o usuário lê e pode revisar
  textoNaImagem: string | null;  // texto exato pedido na arte, só palavras ditas ou marca citada
  midia: "imagem" | "recorte" | "video";
  formato: "tela-cheia" | "janela" | "recorte-sobre" | "broll";
  porque: string;                // pt, uma linha: a ligação com a fala
  custoUsd: number;              // estimativa pela tabela única de preços
  origem: "ia" | "usuario";
};
type PlanoDaJornada = {
  versao: 1; edicaoId: string;   // cuid novo a cada plano
  estiloDoCliente: string;       // o comando dele, literal
  densidade: { segundosEntreElementos: [number, number]; porque: string };
  elementos: ElementoProposto[];
  custoTotalUsd: number;
  feitoEm: string;
};
```

### Passo 5: o usuário aprova ou revisa

- A tela mostra a fala com os elementos no lugar, cada um com a descrição, o formato, a palavra-gatilho destacada e o custo. Ações por elemento: **aprovar**, **remover**, **pedir mudança em texto livre**, e no trecho sem elemento **pedir um elemento novo**.
- Pedido de mudança ("troque a Ferrari vermelha por uma preta"): o Sonnet reescreve só a `descricao` daquele elemento (uma chamada curta, centavos) e a tela mostra a descrição nova **antes de aprovar**. O JEV decide a intenção do pedido (`choice`: mudar o conteúdo, mudar o tempo, remover, mudar o formato) e o código aplica o que não é texto.
- O que a revisão grava (`completoMontagem.jornada.revisao`):

```ts
type RevisaoDoElemento = {
  id: string;
  acao: "aprovado" | "removido" | "alterado" | "novo";
  pedidos: Array<{ texto: string; em: string }>;  // o que o usuário escreveu, literal, em ordem
  descricaoAprovada: string;                       // a que estava na tela quando aprovou
  textoNaImagemAprovado: string | null;
};
```

- Aprovar congela o plano: o que vai ao ar é exatamente a lista aprovada. Nenhum passo depois acrescenta, tira ou troca elemento (sem cobertura de buracos, sem conferência que replaneja, sem guarda que rebaixa).

### Passo 6: o Sonnet escreve um prompt por elemento

- Entrada por elemento (`EntradaDoPrompt`): `descricaoAprovada`, `pedidos` do usuário (literais), `textoNaImagemAprovado`, a fala do momento, o trecho lido (cenário, o que acontece), o formato e a proporção que a área livre permite (calculada pelo código), o estilo do cliente em linguagem natural, as cores e a letra da marca em palavras, o nicho. Uma chamada por bloco de elementos, saída `{ id: prompt }` em inglês.
- **Onde entra o pedido do passo 5:** o prompt nasce da `descricaoAprovada` (que já incorpora o pedido) e o pedido literal vai junto com a ordem "must appear exactly as asked". Um teste garante que o prompt contém os termos do pedido; o JEV confere (`noul`: "este prompt atende ao pedido X?") e, se não, o Sonnet reescreve uma vez.
- Sem bloco de estilo colado, sem guarda de estilo. Só sufixos técnicos e de segurança que valem para qualquer nicho: para o recorte, "isolated subject on plain background" (para o recorte de fundo funcionar); nunca pessoa real reconhecível; texto só o pedido entre aspas.
- Geração: Higgsfield (imagem no modelo da edição; vídeo no Kling Pro, 3 a 5 s). Recorte do fundo pelo BiRefNet quando o formato pede. **Sem recuo silencioso:** falhou, tenta de novo o mesmo modelo uma vez; falhou de novo, o elemento sai com aviso visível na entrega (ou cai num segundo modelo só se o Bruno decidir, com o nome do modelo gravado e mostrado).
- **Leitura automática só do texto** (decisão do Bruno): se `textoNaImagemAprovado` não é nulo, o Gemini transcreve o texto da imagem gerada e o JEV compara com o pedido (grafia, acento, número, marca). Errado, gera de novo uma vez. Não replaneja, não tira, não mexe em mais nada. Cerca de US$ 0,001 por elemento.
- **Nome único:** `edicao/{videoId}/{edicaoId}/{elementoId}-{aleatorio}.{ext}`, `addRandomSuffix: true`, `allowOverwrite: false`. Nada de hash do prompt, nada de consulta a geração anterior.

### Passo 7: o JEV monta

Explícito, como o Bruno pediu:

1. **O código calcula as opções.**
   - Tempo: o instante editado de cada palavra (`tempoEditado`). A entrada candidata é o gatilho menos 0,1 s (como o `q()` do pitch); a saída candidata é o fim da frase, o próximo gatilho ou um teto de leitura.
   - Posição: para o intervalo de cada elemento, a medição do worker a cada 2 s dá rosto, corpo, tela e quadro; o código monta 3 a 5 caixas candidatas que **não cruzam o rosto em nenhum quadro do intervalo** (união das caixas de rosto com folga) e ficam **dentro da área segura da rede** (margens de interface do YouTube, Reels, TikTok e Shorts por formato, numa tabela única). Caixa que não cabe com o tamanho mínimo legível não vira opção.
   - Animação: um conjunto pequeno de movimentos (entrar deslizando do lado livre, crescer do centro da caixa, surgir com desfoque, empurrão lento na tela cheia), todos com entrada curta e saída suave, que o código sabe executar.
2. **O JEV escolhe** entre essas opções, com o estado da cena (o que a fala diz, a leitura do trecho, o elemento, o formato): `choice` da caixa, `choice` da animação, `choice` entre entrar no gatilho ou na frase.
3. **O Remotion executa**: posiciona a mídia gerada na caixa escolhida, anima, e desenha a legenda. Nenhuma peça Remotion desenha conteúdo; as únicas peças da esteira nova são "mídia na caixa" (imagem, recorte, vídeo) e a legenda.
- **Legenda:** a escolhida pelo cliente, sempre (estilo, ligada ou desligada). Por padrão, a do pitch: páginas curtas de até ~28 caracteres quebradas na pontuação, letra da marca, caixa escura. Se a caixa de um elemento cruzar a faixa da legenda, quem muda é a caixa do elemento (sai das opções), não a legenda nem o elemento.
- A gravação do cliente passa intacta: sem grão, sem vinheta, sem correção de cor, sem zoom de ritmo, sem transição chamativa. Só a mídia gerada recebe a animação escolhida.
- Sons de entrada e música ficam fora até o Bruno decidir (ver G).

### Passo 8: entrega e aprovação

- Entrega como hoje (`entregarCompleto`, `anexarCompletoAoQuadro`), mais a lista de avisos visíveis (elemento que falhou, texto que precisou de segunda geração).
- "Pedir ajuste" no card volta ao passo 5 com o texto do cliente como pedido, e só os elementos afetados são gerados de novo (os outros já são desta edição e ficam).

### Como garantir que cada edição é nova

- `edicaoId` novo a cada plano; caminho do Blob com `edicaoId` e sufixo aleatório; proibido `allowOverwrite` na esteira nova.
- Nenhuma leitura de geração anterior (sem cache por prompt, sem banco de imagens, sem "reaproveitar plano" depois de mudar o comando: mudou, a tela mostra o plano novo antes).
- Nada de semente fixa, nada de bloco de estilo igual em todos os prompts.
- Teste: duas execuções do passo 6 com a mesma entrada produzem caminhos diferentes; nenhum `createHash` no caminho de geração da esteira nova.

### Como servir qualquer nicho sem estilo fixo

- O estilo do cliente é **uma descrição em linguagem natural** (o comando dele, a cor e a letra da marca em palavras, o nicho do projeto), que entra no pedido do Sonnet nos passos 4 e 6. Nunca vira ficha, família, kit, regra de código ou lista de peças.
- "Automático" (sem comando) não é um estilo padrão escondido: o Sonnet recebe só o nicho, a marca e a leitura do vídeo.
- Os formatos de composição são poucos e neutros (tela cheia, janela, recorte, B-roll); o que muda de um médico para um cozinheiro é o conteúdo de cada mídia, que nasce da fala e do cenário daquele vídeo.
- A prova é o banco multinicho (F): os vídeos de nichos diferentes não podem parecer o mesmo.

---

## E. Plano de execução em etapas pequenas

Regras de cada etapa: worktree próprio, commit só dos próprios arquivos, interruptor desligado por padrão, teste automático da regra, prova real com custo dito antes e quadros olhados antes de publicar (memória `editor-prova-real-antes-de-publicar`). Orçamento: até US$ 10 por semana.

| Etapa | O que faz | Arquivos | Interruptor | Teste automático | Prova real e custo |
|---|---|---|---|---|---|
| E0 | Esqueleto: estado `jornada` no `completoMontagem`, `edicaoId`, nome de mídia único, roteador que escolhe a esteira | `lib/media/jornada/estado.ts` (novo), `montagem-do-completo.ts` (só o desvio), `roteiro-da-edicao.ts` (só o desvio) | `EDITOR_JORNADA` (padrão 0) | "nome de mídia único por geração": duas gerações com a mesma entrada dão caminhos diferentes; "nenhum createHash/allowOverwrite em lib/media/jornada" | Sem custo |
| E1 | Leitura antes do plano, trechos finos alinhados às frases, tempo editado | `lib/media/leitura-do-video.ts` (parâmetro de trechos), `lib/media/jornada/linha-do-tempo.ts` (novo), `roteiro-da-edicao.ts` | `EDITOR_JORNADA` | "o plano recebe a leitura"; "nenhum trecho lido passa de 10 s"; `tempoEditado` contra remoções conhecidas | Leitura de 3 vídeos do banco F, ~3 min: US$ 0,03 |
| E2 | Passo 4: ideias pelo Sonnet, decisões pelo JEV, densidade pela duração | `lib/media/jornada/ideias.ts`, `lib/media/jornada/decisoes.ts` (novos) | `EDITOR_JORNADA` | "nenhuma peça desenhada em código no catálogo da jornada" (só os 4 formatos de mídia); "toda ideia tem gatilho dentro do momento e é palavra da fala"; "textoNaImagem só com palavras ditas ou marca citada"; "nenhum texto de ficha ou bíblia no pedido do Sonnet"; "nicho e marca presentes no pedido"; "densidade escolhida pelo JEV entre opções que dependem só da duração e do gênero lido" | Plano (sem gerar mídia) de 3 vídeos de nichos diferentes: ~US$ 0,15 |
| E3 | Passo 5: tela por elemento, revisão em texto livre com a descrição nova antes de aprovar, plano congelado | `components/video/tela-de-roteiro.tsx` (ramo novo), rota `app/api/videos/[id]/roteiro/elemento/route.ts` (nova), `lib/media/jornada/revisao.ts` | `EDITOR_JORNADA` | "pedido gravado por id e literal"; "descrição nova contém os termos do pedido"; "depois de aprovado, nenhum passo muda a lista de elementos" | Revisão "troque a Ferrari vermelha por uma preta" num plano real: ~US$ 0,01. Tela olhada logada no dev local |
| E4 | Passo 6: prompt por elemento, geração na Higgsfield, recorte, leitura automática do texto, sem recuo silencioso | `lib/media/jornada/prompts.ts`, `lib/media/jornada/geracao.ts`, `lib/media/jornada/leitura-do-texto.ts` (novos) | `EDITOR_JORNADA`, `JORNADA_SEGUNDO_MODELO` (padrão 0) | "prompt do elemento contém a fala do momento e o pedido do usuário"; "nenhum bloco de estilo fixo no prompt"; "texto errado gera de novo uma vez e nunca tira o elemento" | Mídias de um trecho de 45 s: ~6 imagens a US$ 0,06 + 1 vídeo Kling de 3 s a US$ 0,34 + recortes: ~US$ 0,75 |
| E5 | Passo 7: opções de caixa e tempo pelo código, escolha pelo JEV, render só com "mídia na caixa" e legenda | `lib/media/jornada/montagem.ts` (novo), `worker/remotion/src/jornada/*` (novo, uma composição), `worker/src/edicao-sob-medida.mjs` (só aceitar a edição nova) | `EDITOR_JORNADA` | "nenhuma caixa cruza o rosto em quadro algum do intervalo"; "caixa dentro da área segura"; "entrada a até 0,15 s do gatilho"; "legenda segue a escolha do cliente"; "composição da jornada não importa peça de pecas/*"; "grafo do ffmpeg da jornada sem vignette, noise nem eq sobre a gravação" | Trecho de 45 s ponta a ponta pela esteira de verdade, quadros a cada 1 s olhados: ~US$ 1,00 (inclui E4) |
| E6 | Passo 8: "pedir ajuste" no card volta ao passo 5 com o texto | `app/api/campaign-cards/[id]/route.ts`, `lib/media/jornada/ajuste.ts` | `EDITOR_JORNADA` | "needs_revision com texto gera pedido no elemento"; "só os afetados são gerados de novo" | Um ajuste num vídeo da E5: ~US$ 0,10 |
| E7 | Banco multinicho (F) | scripts de prova em `scripts/tmp/` | `EDITOR_JORNADA` só no projeto de teste | os da E0 a E6 | 5 vídeos de 45 a 60 s: ~US$ 1,00 a 1,50 cada, ~US$ 6 |
| E8 | Ligar para o completo, desligar o resto | variáveis na Vercel e no Railway | `EDITOR_JORNADA=1`, `EDITOR_POR_COMANDO=0`, `CONFERENCIA_VISUAL=0` | suíte inteira | Primeiro vídeo real com o Bruno olhando |

Semana 1 (US$ 10): E0 a E5, cerca de US$ 2 de prova, com folga para refazer o trecho duas vezes. Semana 2 (US$ 10): E6 e E7, cerca de US$ 6 a 8. E8 só depois do banco aprovado.

Cada prova real gera a folha de quadros (um a cada 1 s) do trecho e a folha do mesmo tamanho do pitch, lado a lado, e as duas vão para o Bruno antes de qualquer publicação.

---

## F. Banco de prova multinicho

Seis vídeos curtos (45 a 60 s, uma pessoa falando, com fala de verdade), em nichos e cenários bem diferentes:

| # | Nicho | Cenário e formato | O que a fala precisa ter |
|---|---|---|---|
| 1 | Médico | consultório, horizontal | um termo técnico, um número (pressão, dose), uma recomendação |
| 2 | Cozinheiro | cozinha, em pé, mãos em cena, vertical | ingredientes nomeados, uma etapa, um erro comum |
| 3 | Advogado | escritório, sentado, horizontal | um direito, um prazo, uma lei citada pelo nome |
| 4 | Personal trainer | academia ou ar livre, em movimento, vertical | um exercício, uma contagem, uma marca de equipamento |
| 5 | Pastor | púlpito ou sala, horizontal | um versículo citado, uma história, uma aplicação |
| 6 | Consultor | sala com quadro ou tela, horizontal | uma lista de 3 itens, um percentual, um nome de empresa |

### De onde tirar, com licença

- **Gravações próprias simulando (recomendado para 3 a 4 dos seis).** O Bruno ou pessoas próximas gravam 45 a 60 s com roteiro curto por nicho, em cenários reais diferentes (cozinha de casa, academia, escritório, rua). É o único caminho com fala natural em português, licença total e sem dado de cliente. Para não viciar no rosto do Bruno, variar a pessoa sempre que der. O vídeo do pastor pode ser um trecho real de pregação do Bruno (é nicho real), desde que nunca vire a régua de qualidade.
- **Vídeos com licença Creative Commons Atribuição (CC BY) no YouTube** (filtro "Creative Commons" na busca, que só lista CC BY): a licença permite reutilizar e modificar com atribuição. Conferir a licença na página no dia do download e guardar o link e o print. **Não servem** vídeos CC BY-NC-ND (é o caso das palestras TED e TEDx): a cláusula "sem derivações" proíbe editar.
- **Bancos gratuitos (Pexels, Pixabay, Mixkit)**: a licença permite uso e modificação, mas os clipes de "pessoa falando para a câmera" quase nunca têm a fala gravada (são mudos ou com música). Servem só para testar leitura de cenário e posição, não a jornada inteira.
- **Vídeos de clientes:** não usar sem autorização expressa, mesmo com o termo de uso cobrindo melhoria do produto (decisão do Bruno, ver G).

### Critério de aprovação de cada prova (comparado à referência da landing)

Cada prova é aprovada só se, olhando a folha de quadros a cada 1 s e o vídeo:

1. **Elemento com significado em cada momento forte.** Todo momento que o JEV marcou como forte tem elemento, e todo elemento mostra o que a fala diz naquele instante (um avaliador que lê só a frase reconhece a imagem).
2. **Preso à palavra.** Entrada a até 0,15 s da palavra-gatilho (medido pelo plano e conferido nos quadros).
3. **Nada cobre o rosto nem corta.** Nenhum quadro com elemento sobre o rosto, sobre a tela ou o quadro do vídeo, ou cortado pela borda; tudo dentro da área segura da rede.
4. **Texto certo.** Todo texto em imagem igual ao pedido (grafia, acento, número, marca); zero texto inventado; zero ícone genérico no lugar do logo citado.
5. **Legenda escolhida pelo cliente respeitada**, sempre legível, nunca sob um elemento.
6. **Acabamento no nível do vídeo da landing:** movimento suave, entradas curtas, sistema visual coerente com a marca, nenhum elemento com cara de molde.
7. **Nichos diferentes não se parecem:** postas lado a lado, as folhas dos seis vídeos têm assuntos, paletas e composições diferentes, e duas edições do mesmo vídeo têm mídias diferentes.
8. **Custo dentro do mostrado** na tela do passo 5 (tolerância de 10%).

---

## G. Riscos e o que precisa de decisão do Bruno

### Riscos

1. **A referência é de outro gênero.** O pitch é montagem narrada com material escolhido à mão; o produto edita pessoa falando. A régua que vale é a do acabamento e da ligação com a fala, não a densidade de 2 s.
2. **Texto gerado por modelo de imagem.** Com a decisão de que nenhum elemento é desenhado em código, título, número e nome de marca vêm na imagem. Os modelos erram letra e acento; a leitura automática com uma regeração reduz, mas não zera. Se a segunda sair errada, o elemento vai ao ar errado ou sai: precisa de decisão (abaixo).
3. **Logos de marcas** (Instagram, YouTube, uma marca citada pelo cliente): modelo de imagem gera imitação, nem sempre fiel, e há questão de marca registrada.
4. **O JEV não escreve.** As ideias de elemento são escritas pelo Sonnet e escolhidas pelo JEV. Isso respeita a regra, mas a qualidade da escolha depende do critério escrito para o JEV; a medição de 03/10 mostrou o JEV pior que o Claude na limpeza.
5. **Tempo até a tela do roteiro** cresce 2 a 4 min com a leitura antes do plano.
6. **Latência e falha da Higgsfield** (vídeo de 1 a 5 min; saldo zerado já aconteceu). Sem recuo silencioso, uma falha aparece para o cliente.
7. **Leitura do vídeo:** quadro branco real nunca foi visto; gravação com muito movimento deixa pouca área livre (no `cmux4417u`, só a faixa de cima). Em vertical com a pessoa ocupando a tela, o formato "janela" quase nunca cabe e o JEV vai cair em tela cheia e B-roll.
8. **Três caminhos antigos convivendo** aumentam o risco de um desvio chamar código de C. O roteador da E0 precisa ser o único ponto de escolha, com teste.
9. **Custo por vídeo** muda (menos JEV em massa, mais imagem e vídeo gerados): a tabela de créditos precisa ser revista com a medição do banco F.

### Decisões do Bruno

1. Texto que sai errado também na segunda geração: o elemento vai sem o texto (gerar a arte sem texto), sai do vídeo, ou vai mesmo assim com aviso?
2. Falha da Higgsfield: aceita um segundo modelo (com o nome mostrado na entrega) ou o elemento sai com aviso?
3. Logos de redes e marcas citadas: gerar imitação pela Higgsfield, ou permitir o arquivo oficial do logo como mídia (posicionado pelo Remotion, sem desenhar nada)?
4. Curtir e inscrever no YouTube (regra de 05/10): continua automático? Se sim, passa a ser um elemento gerado como os outros, escolhido pelo JEV, e entra na lista do passo 5 para o cliente ver.
5. Sons de entrada e música no completo: ficam fora da jornada, entram como escolha do cliente, ou o JEV decide?
6. Abertura (gancho) do completo: hoje existe e está desligada no último vídeo; entra como um elemento do passo 4, ou fica fora?
7. Material do banco F: quem grava os vídeos simulados, e se vídeos de clientes podem ser usados com autorização.
8. O que fazer com os caminhos antigos depois do banco aprovado: apagar (catálogo de peças, bíblias, conferência visual) ou manter desligados por um tempo.
9. Prioridade: começar pelo completo horizontal (mais área livre) ou pelo vertical (o que mais vende)?

## H. Decisões do Bruno (06/10, noite), depois deste documento

- O prompt de cada elemento usa tudo o que se sabe sobre o vídeo, a empresa, a marca e o nicho para sugerir o que mais faz sentido naquele momento (consórcio puxa riqueza e conquista; culinária puxa outra linha; e assim por diante). O nicho entra no prompt como contexto, nunca como regra de código.
- Logos de empresas e redes (Instagram, ChatGPT, YouTube etc.) são gerados pela IA, não arquivos oficiais.
- Os chamados para ação (curtir, inscrever etc.) também são elementos gerados pela IA, e é a IA que decide se entram: vídeo curto não tem "curtir e inscrever", vídeo longo tem. Nada de CTA fixo.
- Leitura automática só do texto de cada elemento gerado; errado gera de novo uma vez.
- Vídeo longo: elementos mais espaçados, intercalados com B-roll gerado pela Higgsfield; densidade decidida pelo JEV pela duração.
- O Remotion só posiciona, anima e desenha a legenda escolhida pelo cliente. Nenhum elemento visual criado por código.
