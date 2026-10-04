import { textoParaOPrompt, type ReferenciaDeEstilo } from "@/lib/media/referencias-de-estilo/tipos";
import { elementosDaLousa, momentosDaLousa } from "@/lib/media/referencias-de-estilo/pecas-da-lousa";

/**
 * AUTORIDADE HIGH TICKET (03/10/2026): consultores, advogados, vendedores e
 * mentores que gravam Reels, TikTok e Shorts.
 *
 * Base: a bíblia lib/media/biblias/consorcio.ts, medida em 163 posts e 18
 * Reels de seis perfis de consórcio (fala no quadro zero, 30 a 45 s, legenda
 * no MEIO do quadro em condensada pesada, cena mediana de 6,8 s com a gravação
 * real, número grande só como prova dita, trilha a ~100 bpm). A pesquisa
 * acrescenta o que vale para o resto do público premium: cenário de escritório
 * e roupa que sustentam a seriedade, luz e áudio limpos como sinal de
 * credibilidade, legenda por frase, logo discreto, ensinar em vez de vender, e
 * as regras de cada conselho (OAB, Banco Central, CVM, Código de Defesa do
 * Consumidor): nada de promessa de resultado nem de sensacionalismo.
 *
 * O ACABAMENTO DE LUXO (04/10/2026, pedido do dono): a mesma estrutura e as
 * mesmas peças da lousa do Dan Martell (pecas-da-lousa.ts: palavra gigante,
 * interfaces de vidro digitando, legenda com a palavra sublinhada, pilha 3D
 * de passos, capa de material, celular com a chamada, ferramentas em placas,
 * notebook, B-roll escuro), com outro material: alto padrão que remete a
 * riqueza, preto profundo e marinho, dourado metálico com reflexo, toques de
 * vermelho, mármore, couro, metal escovado e vidro fumê, serifa elegante no
 * título e sem serifa fina no apoio, brilho dourado suave no lugar do neon.
 * As regras de cada conselho continuam valendo: luxo no acabamento, nunca
 * promessa na fala.
 */
export const CONSORCIO: ReferenciaDeEstilo = {
  id: "consorcio",
  nome: "Autoridade high ticket",
  inspiracao: "Reels de consultores, advogados, vendedores e mentores de alto valor (medidos em perfis de consórcio)",
  essencia:
    "Alto padrão: a mesma linguagem de peças da lousa do Dan Martell com acabamento de luxo (preto e marinho, dourado metálico, serifa elegante, brilho dourado suave). Social, sério e premium: a pessoa real falando para a câmera desde o quadro zero, num lugar de trabalho crível, com a legenda grande em condensada pesada no MEIO do quadro. A prova aparece quando é dita: o valor numa faixa na cor da marca, o selo com o nome de quem fala, o cartão do comentário que está sendo respondido. Confiança acima de energia: luz de dia, cortes limpos, uma coisa por vez, nenhuma promessa que o setor proíbe.",
  estrutura: {
    abre:
      "UMA frase inteira do próprio vídeo, dita no quadro zero: a que tem o valor ou o dado (gancho de prova), senão a do formato (\"3 sinais de que...\", \"POV: dia de fechamento\") ou a virada. Selo com o nome no topo nos 3 primeiros segundos. Nunca pergunta solta, nunca promessa, nunca vinheta.",
    avanca:
      "Pelo formato que a fala revela: lista vira SINAL 1, 2, 3; negociação vira a faixa de cada valor; comentário lido vira o cartão no topo; bastidor fica na gravação; explicação ganha a frase-regra. A prova entra só na palavra.",
    fecha:
      "A chamada em uma frase dita (\"comenta QUERO\", \"me chama no direct\", \"salva para mostrar\"), com o selo de volta no topo. Corte seco, sem fade. Para advogado: convite a acompanhar o conteúdo, nunca \"contrate\".",
  },
  ritmo: {
    cenaSeg: [2.5, 7],
    cortesPorMinuto: [8, 20],
    zoom:
      "A gravação real manda: punch curto de 110% na palavra do valor e da virada; aproximação lenta (100% a 105%) na explicação; troca de enquadramento entre frases quando o plano passa de 5 s. Nunca câmera nervosa.",
    observacoes:
      "Corte de 30 a 45 s. Respiros cortados sem picotar a frase. Troca na tela a cada 2,5 a 5 s.",
  },
  tipografia: {
    familias: [
      { papel: "título das peças, palavra gigante, capa", familia: "Playfair Display", pesos: "700 e 800, dourado metálico", origem: "local" },
      { papel: "apoio fino, rótulo espaçado", familia: "Geist", pesos: "400", origem: "local" },
      { papel: "legenda, faixa e palavra", familia: "Anton", pesos: "400 (já pesada), caixa alta", origem: "google-fonts e local", alternativa: "Oswald 700" },
      { papel: "selo, cartão do comentário, rótulo", familia: "Inter", pesos: "600 e 800", origem: "google-fonts", alternativa: "Liberation Sans Bold local" },
    ],
    hierarquia:
      "Legenda a 6% a 7,5% da altura, 1 a 3 palavras por vez, a palavra da vez cresce 8%. Valor na faixa a 9% a 12%. Selo a 2,8% a 3,2%. Texto do comentário a 3%.",
    regras: [
      "Legenda branca com sombra macia de 10 px a 50%; sem contorno grosso, sem palavra a palavra estourando.",
      "Uma cor de destaque só: a da marca, na faixa e no check.",
      "Serifa só a elegante do título (Playfair); nada de letra torta ou decorativa de brinquedo.",
      "Dourado metálico com reflexo (degradê de #7A5A1C a #F7E7A8) no título e nos aros; brilho dourado suave, nunca neon.",
    ],
  },
  paleta: {
    tipica: [
      { papel: "fundo preto profundo", hex: "#020206" },
      { papel: "marinho", hex: "#0D1830" },
      { papel: "dourado metálico", hex: "#D4AF37" },
      { papel: "reflexo do dourado", hex: "#F7E7A8" },
      { papel: "faixa do valor (destaque)", hex: "#C8102E" },
      { papel: "selo e cartão", hex: "#FFFFFF" },
      { papel: "texto sobre branco", hex: "#111111" },
      { papel: "legenda", hex: "#FFFFFF" },
      { papel: "cartela de ênfase", hex: "#0F1B2D" },
      { papel: "check", hex: "#1DB954" },
    ],
    marca:
      "A faixa do valor, o círculo do check e a cartela da prova usam a cor forte da marca. Letra da faixa em branco ou quase preto, a que tiver mais contraste. O fundo é a gravação real; o escuro da marca só na cartela de ênfase, rara. Marca dourada ou preta (comum no premium) vira a faixa com letra no contraste.",
  },
  elementos: [
    ...elementosDaLousa(true),
    {
      id: "faixa-valor",
      nome: "Faixa do valor",
      forma:
        "Faixa horizontal na cor da marca com bordas levemente rasgadas e o valor dito em Anton grande. Leve inclinação de -3 graus; sombra curta.",
      animacao:
        "A faixa se abre da esquerda em 250 ms e o número conta até o valor em 600 ms, com impacto curto. Sai por corte.",
      duracaoSeg: [1.5, 3],
      posicao916: "Faixa de 30% a 42% da altura, acima da legenda. Largura de 8% a 86%.",
      posicao169: "Lado livre ao lado da pessoa, 30% a 50% da altura.",
      quando: "TODO valor dito (carta, crédito, lance, parcela, preço) e a palavra da prova dita (CONTEMPLADO, FECHADO).",
    },
    {
      id: "selo-nome",
      nome: "Selo com o nome",
      forma:
        "Pílula branca com o nome de quem fala (ou da empresa) em Inter bold quase preta e um ponto da cor da marca. Raio total; altura de 4% do quadro; logo da marca pequeno à esquerda, quando houver.",
      animacao: "Estoura curto de 90% a 100% em 160 ms, com pop baixo. Sai com fade de 200 ms depois de 3 s.",
      duracaoSeg: [2.5, 4],
      posicao916: "Topo da área segura, 14% a 19% da altura, centrado.",
      posicao169: "Canto superior esquerdo, dentro da margem de 5%.",
      quando: "Uma vez por corte, nos 3 primeiros segundos; volta no fecho.",
    },
    {
      id: "cartao-comentario",
      nome: "Cartão do comentário",
      forma:
        "Cartão branco de comentário com avatar cinza e a pergunta em texto escuro. Nome curto ou só \"seguidor\"; raio 20 px, sombra suave; nunca dado pessoal real sem autorização.",
      animacao: "Sobe 30 px com fade em 250 ms e clique. Fica enquanto ela lê e sai deslizando para cima.",
      duracaoSeg: [3, 6],
      posicao916: "Topo, 14% a 28% da altura. Largura de 8% a 86%.",
      posicao169: "Terço superior, ao lado da pessoa.",
      quando: "Só quando ela lê ou responde a pergunta de alguém (\"me perguntaram\", \"o João comentou\").",
    },
    {
      id: "palavra-formato",
      nome: "Palavra do formato",
      forma:
        "Rótulo curto em Anton caixa alta (\"SINAL 1\", \"ERRO 2\", \"LANCE\") em branco sobre uma tarja da cor da marca. Tarja reta, altura de 6% do quadro.",
      animacao: "A tarja desliza 40 px da esquerda em 200 ms com whoosh baixo. Sai na troca de item.",
      duracaoSeg: [1.5, 3],
      posicao916: "Faixa de 24% a 32% da altura, à esquerda.",
      posicao169: "Topo esquerdo, 10% a 18% da altura.",
      quando: "Cada item de lista e cada etapa da negociação, na palavra dita.",
    },
    {
      id: "frase-regra",
      nome: "Frase-regra em destaque",
      forma:
        "A regra do vídeo em até 7 palavras, em Anton branca sobre uma caixa escura translúcida (70%), com a palavra-chave na cor da marca. Caixa reta, margens de 4%.",
      animacao: "A caixa abre de 0 a 100% de largura em 250 ms e o texto sobe com fade. Sai por corte.",
      duracaoSeg: [2, 3.5],
      posicao916: "Faixa de 36% a 50% da altura.",
      posicao169: "Centro, 40% a 60% da altura.",
      quando: "A frase que o vídeo quer que fique, uma a cada 20 a 30 s.",
    },
    {
      id: "comparacao-check",
      nome: "Comparação com check e x",
      forma:
        "Duas linhas ou colunas com os dois caminhos ditos e um x cinza ou check na cor da marca em círculo à frente de cada um. Barras opcionais quando há dois valores.",
      animacao: "A linha do x entra, 300 ms depois a do check; o check se desenha em 200 ms.",
      duracaoSeg: [2.5, 4],
      posicao916: "Faixa de 24% a 52% da altura, acima da legenda.",
      posicao169: "Lado livre, 25% a 75% da altura.",
      quando: "Comparação dita: aluguel contra parcela, acordo contra processo, fazer sozinho contra com mentor.",
    },
    {
      id: "cartela-prova",
      nome: "Cartela da prova",
      forma:
        "Tela cheia na cor da marca com a palavra ou o valor da prova em Anton enorme e um rótulo curto. Sem fundo de imagem.",
      animacao: "Entra por corte com flash branco de 2 quadros e o texto bate de 120% a 100% em 150 ms.",
      duracaoSeg: [1.5, 2.5],
      posicao916: "Texto de 36% a 58% da altura.",
      posicao169: "Centro, 30% a 70% da altura.",
      quando: "A revelação dita (o valor final, o FECHADO), no máximo duas por corte.",
    },
  ],
  insercoesGeradas: {
    quando: "Raras: a gravação real rende mais. No máximo uma cena por corte, só do objeto concreto dito.",
    tipos: [
      "B-roll de alto padrão do que é dito: imóvel de alto padrão, carro, chave na mão, aperto de mão, relógio no pulso, mesa de reunião de mármore, sempre escuro e com luz dourada",
      "UM objeto do negócio dito (chave da casa, contrato assinado com a caneta, pasta de processo, agenda) em luz de dia, escritório real",
      "ação simples e real de 1,5 a 2,5 s com câmera calma (chave sendo posta na mesa)",
      "detalhe de mesa de reunião ou escritório premium sem pessoas e sem texto legível",
    ],
    nunca: "dinheiro voando, pilha de notas, barra de ouro caricata, iate, gente gerada, martelo de juiz caricato, texto ou número desenhado pelo modelo.",
  },
  som: {
    trilha: "Baixa e animada, 85 a 125 batidas por minuto (mediana medida: 100), corporativa moderna; nunca disputa a voz.",
    efeitos: ["impacto curto na faixa do valor", "tique de contagem e ding", "pop baixo no selo", "clique no comentário", "whoosh baixo na troca de item"],
    mixagem: "Voz a -14 LUFS, limpa e próxima (sem eco de sala); trilha a -28 dB; efeitos discretos.",
  },
  nunca: [
    "Texto que promete o que o setor proíbe: contemplação garantida ou com data (Banco Central), resultado de causa ou ganho de processo (OAB, Provimento 205/2021), rendimento ou retorno garantido (CVM), faturamento garantido ou \"fique rico\" (Código de Defesa do Consumidor). Se a fala promete, a tela não repete.",
    "Sensacionalismo, comparação com outro profissional ou lista de clientes; nome de cliente real sem autorização.",
    "Emoji de dinheiro, fogo ou foguete; dinheiro voando ou pilha de notas (o luxo é o acabamento, não ostentação).",
    "Valor na tela que não foi dito.",
    "Legenda no rodapé ou pequena; mais de 2 elementos além da legenda.",
    "Vinheta, logo grande ou abertura antes da fala.",
  ],
  momentos: [
    ...momentosDaLousa(true),
    {
      quando: "A pessoa enumera 3 sinais ou erros",
      edicao:
        "Lista dos 3 em caixa escura translúcida; 2 escurecem, o 1 acende na cor da marca; SINAL 1 desliza no topo; volta para a pessoa com a legenda no meio; faixa ou check entram conforme ela fala; na troca, a lista volta com o 1 marcado e o 2 aceso.",
    },
    {
      quando: "O quadro zero",
      edicao: "A frase com o valor dito, legenda no meio, selo com o nome no topo e a faixa do valor contando na palavra; punch curto.",
    },
    {
      quando: "Ela narra uma negociação (\"pediu 110, ofereci 115, fechou em 120 mil\")",
      edicao: "Uma faixa por valor, cada uma substituindo a anterior na palavra, com impacto curto; cartela FECHADO com flash só se ela disser.",
    },
    {
      quando: "Ela lê uma pergunta de seguidor",
      edicao: "Cartão do comentário no topo enquanto ela lê, sai deslizando quando ela começa a responder; aproximação lenta na resposta.",
    },
    {
      quando: "Ela compara dois caminhos (aluguel contra parcela)",
      edicao: "Comparação com x e check acima da legenda, os dois valores ditos em barras; volta para a pessoa com punch.",
    },
    {
      quando: "Uma advogada explica um direito",
      edicao: "Sem valor de causa nem promessa: frase-regra com o direito em até 7 palavras, aproximação lenta, legenda limpa; a chamada é para acompanhar o perfil.",
    },
    {
      quando: "O fecho",
      edicao: "A chamada dita na legenda, selo de volta no topo, corte seco.",
    },
  ],
  quadrosDeReferencia: [
    "A PALAVRA GIGANTE DE LUXO: a gravação escurecida em marinho e desfocada e, no centro, a palavra do impacto em serifa elegante dourada metálica com reflexo, ocupando 75% da largura, com a menor em caixa alta espaçada por cima.",
    "A PILHA DE OURO: fundo preto e marinho com luz dourada em feixe; título em serifa marfim no topo; losangos de aro dourado em pilha isométrica com números em serifa dourada; o passo dito acende com brilho dourado suave e a linha dourada leva ao nome em sem serifa fina.",
    "A PROVA EM VERMELHO: sobre a gravação levemente escurecida, uma faixa inclinada (-3 graus) em vermelho forte (#C8102E) cruzando o quadro de borda a borda, o valor dito em condensada branca de 10% a 12% da altura, com o número contando; embaixo, um rótulo em dourado (#C9A227) com o que é o valor (\"CARTA DE CRÉDITO\"). A faixa tem sombra e profundidade: ela fica na frente da pessoa e um brilho dourado passa por ela ao entrar.",
  ],
  fontes: [
    "lib/media/biblias/consorcio.ts (medição de 02/10/2026: 163 posts, 18 Reels quadro a quadro, seis perfis do nicho)",
    "https://www.leegamkt.com.br/reels-e-videos-para-advogados-como-gerar-autoridade-sem-parecer-marketeiro-demais/ (cenário de escritório, luz e áudio, logo discreto, 30 a 60 s, informar sem prometer, sem chamada para contratar)",
    "https://www.oab.org.br/leisnormas/legislacao/provimentos/205-2021 (Provimento 205/2021: proibidas promessa de resultado, comparação, captação, sensacionalismo)",
    "https://herospark.com/blog/como-criar-reels-profissionais (Reels de autoridade: legenda obrigatória, cenário e postura)",
    "https://github.com/alfredogijr/reels-premium-kit-publico (Reels premium: legenda por frase, gancho no primeiro quadro, uma voz por vez)",
  ],
};

export const TEXTO_CONSORCIO = textoParaOPrompt(CONSORCIO);
