import type { ModeloDeArte, TextosDaArte } from "@/lib/modelos-de-arte/catalogo";

/**
 * O TEXTO DE EXEMPLO DE CADA NICHO, para a prévia ("sua arte vai ficar assim").
 *
 * Um jogo por setor de lib/media/identidade-visual.ts. É só ilustração da
 * prévia: a arte de verdade usa o texto do post. Os números daqui são de
 * exemplo e a tela diz isso; nada daqui vai para a geração.
 */

interface Exemplo {
  titulo: string;
  apoio: string;
  itens: string[];
  numero: string;
  numeroFrase: string;
  porcento: string;
  porcentoFrase: string;
  antes: string[];
  depois: string[];
  mito: string;
  verdade: string;
  evite: string[];
  faca: string[];
  citacao: string;
  autor: string;
  pergunta: string;
  resposta: string;
  termo: string;
  definicao: string;
  depoimento: string;
  opcoes: [string, string];
  chamada: string;
  curto: string;
}

const EXEMPLOS: Record<string, Exemplo> = {
  saude: {
    titulo: "Check-up anual evita o susto que ninguém quer",
    apoio: "Prevenir custa menos do que tratar, e o seu corpo agradece.",
    itens: ["Exame de sangue completo", "Pressão e glicemia", "Avaliação do coração", "Retorno com o médico"],
    numero: "8 em 10",
    numeroFrase: "doenças crônicas dão sinais antes, nos exames de rotina",
    porcento: "70%",
    porcentoFrase: "dos pacientes chegam ao consultório só quando já sentem dor",
    antes: ["Consulta só na emergência", "Remédio por conta própria"],
    depois: ["Check-up marcado no ano", "Tratamento com acompanhamento"],
    mito: "Quem não sente nada não precisa de exame",
    verdade: "Pressão alta e diabetes começam sem sintoma nenhum",
    evite: ["Pular o retorno", "Parar o remédio sozinho"],
    faca: ["Levar os exames antigos", "Anotar as dúvidas"],
    citacao: "Cuidar da saúde é um hábito de todo dia, não um evento de emergência.",
    autor: "Equipe da clínica",
    pergunta: "Preciso estar em jejum para o exame de sangue?",
    resposta: "Depende do exame. Na hora de agendar, nossa equipe já confirma o preparo certo.",
    termo: "Prevenção",
    definicao: "Conjunto de cuidados feitos antes da doença aparecer, para que ela não apareça.",
    depoimento: "Fui pela primeira vez sem estar doente. Saí com um plano simples e muito mais tranquila.",
    opcoes: ["Já fiz este ano", "Ainda não"],
    chamada: "Agende sua consulta",
    curto: "Prevenir é cuidar",
  },
  juridico: {
    titulo: "Contrato bem feito é briga que não acontece",
    apoio: "O barato de hoje vira o processo de amanhã.",
    itens: ["Partes bem identificadas", "Prazo e multa claros", "Foro definido", "Assinatura com testemunhas"],
    numero: "6 anos",
    numeroFrase: "pode durar um processo que um contrato claro teria evitado",
    porcento: "60%",
    porcentoFrase: "das disputas entre sócios começam num acordo que não foi escrito",
    antes: ["Acordo de boca", "Modelo baixado da internet"],
    depois: ["Cláusulas pensadas no seu caso", "Segurança para crescer"],
    mito: "Contrato de internet resolve qualquer caso",
    verdade: "Cada negócio tem riscos que um modelo genérico não cobre",
    evite: ["Assinar sem ler", "Deixar o prazo em aberto"],
    faca: ["Revisar com um advogado", "Guardar a via assinada"],
    citacao: "A melhor defesa é aquela que começa antes do problema.",
    autor: "Equipe do escritório",
    pergunta: "Contrato assinado digitalmente tem validade?",
    resposta: "Tem, desde que a assinatura siga as regras da lei. Podemos conferir o seu.",
    termo: "Distrato",
    definicao: "Acordo em que as partes encerram um contrato e combinam como fica o que já foi feito.",
    depoimento: "Explicaram cada cláusula sem juridiquês. Assinei sabendo exatamente o que estava assinando.",
    opcoes: ["Tenho contrato", "Só de boca"],
    chamada: "Fale com um advogado",
    curto: "Escreva antes",
  },
  fe: {
    titulo: "Servir bem também é um jeito de adorar",
    apoio: "O trabalho de segunda faz parte do culto de domingo.",
    itens: ["Começar o dia em oração", "Tratar o cliente com honra", "Fazer a conta com justiça", "Descansar sem culpa"],
    numero: "3 princípios",
    numeroFrase: "para administrar o negócio com propósito",
    porcento: "100%",
    porcentoFrase: "do que fazemos pode ser feito de todo o coração",
    antes: ["Trabalho como fardo", "Domingo separado da semana"],
    depois: ["Trabalho como serviço", "Fé que chega na segunda"],
    mito: "Fé e negócio não se misturam",
    verdade: "Princípio bom faz o negócio durar",
    evite: ["Prometer o que não entrega", "Atropelar o descanso"],
    faca: ["Ser fiel no pouco", "Cumprir a palavra"],
    citacao: "Tudo o que fizerem, façam de todo o coração, como para o Senhor.",
    autor: "Colossenses 3:23",
    pergunta: "Como orar pelo meu negócio sem virar barganha?",
    resposta: "Peça sabedoria e coração limpo para as decisões, e entregue o resultado.",
    termo: "Mordomia",
    definicao: "Cuidar bem do que nos foi confiado, sabendo que não somos donos, somos administradores.",
    depoimento: "Aprendi a abrir a loja orando e fechar agradecendo. Mudou o jeito que eu atendo.",
    opcoes: ["Oro pelo negócio", "Ainda não"],
    chamada: "Participe do encontro",
    curto: "Fé na segunda",
  },
  energia: {
    titulo: "Corte de geração também é dinheiro na mesa",
    apoio: "Medir a energia que deixou de gerar é o primeiro passo para recuperar.",
    itens: ["Registrar cada restrição", "Separar o que é externo", "Calcular a geração de referência", "Pedir o ressarcimento"],
    numero: "78 h",
    numeroFrase: "é a franquia anual antes de o corte ser ressarcido",
    porcento: "18%",
    porcentoFrase: "da energia possível ficou sem gerar em algumas usinas no ano",
    antes: ["Corte anotado à mão", "Ressarcimento perdido"],
    depois: ["Cada corte medido", "Pedido com prova"],
    mito: "Todo corte de geração é ressarcido",
    verdade: "Só o que passa da franquia e tem prova entra na conta",
    evite: ["Esperar o fim do mês", "Planilha sem histórico"],
    faca: ["Medir por hora", "Guardar a evidência"],
    citacao: "O que não é medido não é recuperado.",
    autor: "Equipe de operação",
    pergunta: "Como sei se a minha usina foi cortada?",
    resposta: "Comparando a geração possível com a geração limitada, hora a hora.",
    termo: "Curtailment",
    definicao: "Redução da geração pedida pelo operador do sistema, mesmo com vento ou sol disponíveis.",
    depoimento: "Pela primeira vez vimos o corte em número e sabemos quanto pedir.",
    opcoes: ["Medimos o corte", "Ainda não"],
    chamada: "Veja sua usina",
    curto: "Meça o corte",
  },
  consorcio: {
    titulo: "A chave da casa própria sem pagar juros",
    apoio: "Consórcio é planejamento: parcela que cabe no bolso e carta de crédito para comprar.",
    itens: ["Escolha o valor da carta", "Defina a parcela", "Participe das assembleias", "Use o crédito na compra"],
    numero: "R$ 300 mil",
    numeroFrase: "de carta de crédito para o imóvel, com parcela planejada",
    porcento: "0%",
    porcentoFrase: "de juros: no consórcio você paga taxa de administração",
    antes: ["Aluguel todo mês", "Financiamento com juros altos"],
    depois: ["Parcela que vira patrimônio", "Compra planejada"],
    mito: "Consórcio demora uma vida para contemplar",
    verdade: "Com lance planejado, a contemplação pode vir antes",
    evite: ["Comprar no impulso", "Parcela acima do orçamento"],
    faca: ["Planejar o lance", "Escolher administradora séria"],
    citacao: "Quem planeja a compra compra melhor.",
    autor: "Equipe de consultores",
    pergunta: "Posso usar o FGTS no consórcio de imóvel?",
    resposta: "Pode, para dar lance ou abater parcelas, seguindo as regras do FGTS.",
    termo: "Contemplação",
    definicao: "Momento em que o consorciado recebe a carta de crédito, por sorteio ou por lance.",
    depoimento: "Saí do aluguel com uma parcela que eu já pagava. Hoje a chave é minha.",
    opcoes: ["Quero imóvel", "Quero carro"],
    chamada: "Simule sua carta",
    curto: "Sua chave planejada",
  },
  financas: {
    titulo: "Organizar o caixa vem antes de investir",
    apoio: "Sem saber para onde o dinheiro vai, não sobra nada para crescer.",
    itens: ["Separar conta pessoal", "Anotar toda saída", "Criar reserva", "Revisar todo mês"],
    numero: "6 meses",
    numeroFrase: "de custo fixo é a reserva que dá tranquilidade ao negócio",
    porcento: "40%",
    porcentoFrase: "das pequenas empresas misturam a conta da casa com a do caixa",
    antes: ["Conta misturada", "Susto no fim do mês"],
    depois: ["Caixa separado", "Decisão com número"],
    mito: "Planilha é coisa de empresa grande",
    verdade: "Quanto menor o negócio, mais cada real importa",
    evite: ["Pagar conta pessoal pelo caixa", "Parcelar sem conta"],
    faca: ["Definir pró-labore", "Fechar o mês"],
    citacao: "Lucro é opinião, caixa é fato.",
    autor: "Equipe financeira",
    pergunta: "Quanto devo tirar de pró-labore?",
    resposta: "Um valor fixo que o caixa aguente todo mês, definido depois de fechar as contas.",
    termo: "Fluxo de caixa",
    definicao: "Registro de tudo que entra e sai, dia a dia, para saber quanto realmente sobra.",
    depoimento: "Separei as contas e em três meses entendi onde o lucro estava sumindo.",
    opcoes: ["Tenho reserva", "Ainda não"],
    chamada: "Agende uma conversa",
    curto: "Caixa primeiro",
  },
  educacao: {
    titulo: "Aprender a estudar muda o resultado da prova",
    apoio: "Não é mais horas, é o jeito certo de usar cada uma.",
    itens: ["Revisar no mesmo dia", "Fazer exercício antes de reler", "Dormir bem", "Explicar para alguém"],
    numero: "24 h",
    numeroFrase: "é o prazo para revisar a aula antes de esquecer metade",
    porcento: "50%",
    porcentoFrase: "do conteúdo se perde em um dia sem revisão",
    antes: ["Ler e grifar tudo", "Virar a noite"],
    depois: ["Testar o que lembra", "Revisar em ciclos"],
    mito: "Quem estuda mais horas aprende mais",
    verdade: "Revisão espaçada rende mais que maratona",
    evite: ["Reler sem testar", "Estudar com o celular do lado"],
    faca: ["Fazer questões", "Revisar no dia seguinte"],
    citacao: "Aprender é lembrar quando precisa.",
    autor: "Equipe pedagógica",
    pergunta: "Quanto tempo por dia meu filho deve estudar?",
    resposta: "Blocos curtos com pausa rendem mais que horas seguidas. Falamos disso na reunião.",
    termo: "Revisão espaçada",
    definicao: "Estudar o mesmo conteúdo em intervalos crescentes para fixar na memória.",
    depoimento: "Meu filho passou a estudar menos tempo e a nota subiu no bimestre.",
    opcoes: ["Estudo todo dia", "Só antes da prova"],
    chamada: "Garanta a matrícula",
    curto: "Estude melhor",
  },
  alimentacao: {
    titulo: "Pão de fermentação natural sai do forno às 7h",
    apoio: "Massa que descansa 24 horas e chega quentinha na sua mesa.",
    itens: ["Farinha selecionada", "Fermento natural", "Descanso de 24 horas", "Forno a lenha"],
    numero: "24 h",
    numeroFrase: "de fermentação em cada pão da casa",
    porcento: "100%",
    porcentoFrase: "dos pães feitos aqui, do zero, todos os dias",
    antes: ["Pão de ontem", "Massa industrial"],
    depois: ["Fornada da manhã", "Receita da casa"],
    mito: "Pão de fermentação natural é azedo",
    verdade: "Bem feito, ele é leve e de sabor suave",
    evite: ["Guardar na geladeira", "Cortar ainda quente"],
    faca: ["Guardar no saco de pano", "Aquecer no forno"],
    citacao: "Comida boa é feita com tempo.",
    autor: "Equipe da padaria",
    pergunta: "Vocês fazem encomenda para o fim de semana?",
    resposta: "Fazemos sim. Peça até quinta e retire no sábado de manhã.",
    termo: "Levain",
    definicao: "Fermento natural feito de farinha e água, que dá sabor e leveza ao pão.",
    depoimento: "Virou o café da manhã de domingo da família inteira.",
    opcoes: ["Pão doce", "Pão salgado"],
    chamada: "Faça sua encomenda",
    curto: "Fornada da manhã",
  },
  beleza: {
    titulo: "Pele bonita começa na rotina, não no milagre",
    apoio: "Três passos simples, todo dia, valem mais que o produto da moda.",
    itens: ["Limpar com suavidade", "Hidratar", "Proteger do sol", "Dormir bem"],
    numero: "3 passos",
    numeroFrase: "de rotina que fazem diferença em 30 dias",
    porcento: "80%",
    porcentoFrase: "do envelhecimento da pele vem do sol sem proteção",
    antes: ["Produto novo toda semana", "Protetor só na praia"],
    depois: ["Rotina simples e constante", "Protetor todo dia"],
    mito: "Pele oleosa não precisa de hidratante",
    verdade: "Ela precisa, só que de textura leve",
    evite: ["Dormir maquiada", "Esfoliar todo dia"],
    faca: ["Reaplicar o protetor", "Limpar à noite"],
    citacao: "Autocuidado é constância, não exagero.",
    autor: "Equipe do studio",
    pergunta: "Qual o melhor horário para fazer limpeza de pele?",
    resposta: "À tarde ou à noite, para a pele descansar do sol depois do procedimento.",
    termo: "Skincare",
    definicao: "Rotina de cuidados diários com a pele: limpar, tratar, hidratar e proteger.",
    depoimento: "Saí com uma rotina que cabe na minha manhã. Minha pele nunca esteve tão bem.",
    opcoes: ["Uso protetor", "Esqueço sempre"],
    chamada: "Agende seu horário",
    curto: "Rotina que funciona",
  },
  imoveis: {
    titulo: "Planta bem pensada vale mais que metro quadrado",
    apoio: "Luz, ventilação e circulação fazem o apartamento parecer maior.",
    itens: ["Luz natural", "Cozinha integrada", "Armário planejado", "Varanda útil"],
    numero: "68 m²",
    numeroFrase: "com três quartos, numa planta sem corredor perdido",
    porcento: "30%",
    porcentoFrase: "mais luz natural com janelas do piso ao teto",
    antes: ["Corredor comprido", "Ambiente escuro"],
    depois: ["Sala integrada", "Luz o dia todo"],
    mito: "Apartamento na planta é sempre mais arriscado",
    verdade: "Com construtora sólida, é o melhor preço do ciclo",
    evite: ["Comprar só pela foto", "Ignorar o condomínio"],
    faca: ["Visitar no horário de pico", "Ler o memorial"],
    citacao: "Casa boa é a que funciona na sua rotina.",
    autor: "Equipe de arquitetura",
    pergunta: "Dá para mudar a planta antes da entrega?",
    resposta: "Em muitas obras sim, dentro do prazo de personalização. Pergunte ao consultor.",
    termo: "Memorial descritivo",
    definicao: "Documento que detalha os materiais e acabamentos que o imóvel vai ter na entrega.",
    depoimento: "Entendi a planta antes de comprar e o apartamento ficou do jeito da família.",
    opcoes: ["Na planta", "Pronto para morar"],
    chamada: "Agende uma visita",
    curto: "Planta que funciona",
  },
  industria: {
    titulo: "Máquina parada custa mais que manutenção",
    apoio: "Manutenção preventiva é o seguro mais barato da fábrica.",
    itens: ["Inspeção semanal", "Lubrificação no prazo", "Peça de reposição em estoque", "Registro de falhas"],
    numero: "4x",
    numeroFrase: "mais cara é a parada não planejada do que a manutenção",
    porcento: "25%",
    porcentoFrase: "menos paradas com manutenção preventiva",
    antes: ["Conserto na pressa", "Linha parada"],
    depois: ["Manutenção agendada", "Produção no ritmo"],
    mito: "Se está funcionando, não mexe",
    verdade: "A falha avisa antes, para quem mede",
    evite: ["Adiar a revisão", "Peça sem procedência"],
    faca: ["Medir a vibração", "Registrar cada parada"],
    citacao: "Produtividade é o que não para.",
    autor: "Equipe de engenharia",
    pergunta: "Qual a frequência certa de manutenção?",
    resposta: "A do fabricante, ajustada pelo histórico de falhas da sua linha.",
    termo: "Preventiva",
    definicao: "Manutenção feita antes da falha, em datas planejadas, para a máquina não parar.",
    depoimento: "Reduzimos as paradas e o turno da noite deixou de virar emergência.",
    opcoes: ["Preventiva", "Corretiva"],
    chamada: "Fale com um técnico",
    curto: "Linha sem parar",
  },
  agro: {
    titulo: "Solo bem cuidado colhe mais na próxima safra",
    apoio: "Análise de solo é o primeiro investimento da lavoura.",
    itens: ["Análise de solo", "Correção na hora certa", "Plantio direto", "Rotação de culturas"],
    numero: "12 sacas",
    numeroFrase: "a mais por hectare com correção feita no tempo",
    porcento: "20%",
    porcentoFrase: "de economia de adubo com recomendação por análise",
    antes: ["Adubo no olho", "Solo cansado"],
    depois: ["Recomendação por análise", "Solo vivo"],
    mito: "Mais adubo sempre dá mais produção",
    verdade: "O certo na dose certa rende mais e custa menos",
    evite: ["Plantar sem análise", "Repetir a mesma cultura"],
    faca: ["Analisar todo ano", "Cobrir o solo"],
    citacao: "Quem cuida da terra colhe por muitos anos.",
    autor: "Equipe agronômica",
    pergunta: "Quando devo fazer a análise de solo?",
    resposta: "De dois a três meses antes do plantio, para dar tempo de corrigir.",
    termo: "Calagem",
    definicao: "Aplicação de calcário para corrigir a acidez do solo antes do plantio.",
    depoimento: "Fizemos a análise e economizamos adubo já na primeira safra.",
    opcoes: ["Faço análise", "Ainda não"],
    chamada: "Fale com o agrônomo",
    curto: "Solo vivo",
  },
  marketing: {
    titulo: "Conteúdo constante vende mais que post viral",
    apoio: "Quem aparece toda semana vira a primeira lembrança do cliente.",
    itens: ["Uma gravação por semana", "Cortes para cada rede", "Carrossel do mesmo tema", "Resposta aos comentários"],
    numero: "1 vídeo",
    numeroFrase: "por semana vira mais de 10 peças para todas as redes",
    porcento: "70%",
    porcentoFrase: "da decisão de compra acontece antes de falar com o vendedor",
    antes: ["Post quando sobra tempo", "Perfil parado"],
    depois: ["Semana inteira pronta", "Cliente chegando aquecido"],
    mito: "Precisa postar todo dia para crescer",
    verdade: "Constância e clareza valem mais que volume",
    evite: ["Copiar a trend sem contexto", "Sumir por semanas"],
    faca: ["Gravar uma vez por semana", "Responder quem comenta"],
    citacao: "Quem é lembrado é escolhido.",
    autor: "Equipe de conteúdo",
    pergunta: "Preciso aparecer no vídeo para dar certo?",
    resposta: "Rosto gera confiança, mas dá para começar com voz e tela e evoluir.",
    termo: "Autoridade",
    definicao: "Ser a referência que o cliente lembra quando o problema aparece.",
    depoimento: "Com uma gravação por semana o perfil ganhou vida e as conversas de venda começaram.",
    opcoes: ["Posto toda semana", "Só às vezes"],
    chamada: "Agende uma demonstração",
    curto: "Constância vende",
  },
  tecnologia: {
    titulo: "Automatizar o repetitivo libera o time para pensar",
    apoio: "Tarefa que se repete toda semana é candidata a virar processo.",
    itens: ["Mapear a tarefa", "Medir o tempo gasto", "Automatizar", "Acompanhar o resultado"],
    numero: "12 h",
    numeroFrase: "por semana voltam para o time com uma automação simples",
    porcento: "30%",
    porcentoFrase: "do tempo do time vai para tarefa repetitiva",
    antes: ["Copiar e colar planilha", "Relatório na mão"],
    depois: ["Dados atualizados sozinhos", "Relatório pronto às 8h"],
    mito: "Automação é cara e demora meses",
    verdade: "A primeira economiza horas já na semana seguinte",
    evite: ["Automatizar processo confuso", "Ferramenta sem dono"],
    faca: ["Começar pelo mais repetido", "Medir antes e depois"],
    citacao: "Tecnologia boa é a que some e deixa o trabalho fluir.",
    autor: "Equipe de produto",
    pergunta: "Meus dados ficam seguros na automação?",
    resposta: "Ficam, com acesso controlado e registro de cada mudança.",
    termo: "Automação",
    definicao: "Fazer um sistema executar sozinho uma tarefa que antes alguém fazia à mão.",
    depoimento: "O relatório que levava a manhã de segunda agora chega pronto no e-mail.",
    opcoes: ["Já automatizo", "Tudo na mão"],
    chamada: "Peça uma demonstração",
    curto: "Menos repetição",
  },
  negocios: {
    titulo: "Cliente bem atendido volta e traz outro",
    apoio: "Indicação é o marketing mais barato que existe.",
    itens: ["Responder no mesmo dia", "Cumprir o prazo", "Pedir a opinião", "Agradecer a indicação"],
    numero: "5x",
    numeroFrase: "mais barato é manter um cliente do que conquistar um novo",
    porcento: "65%",
    porcentoFrase: "das vendas de pequenos negócios vêm de clientes que já compraram",
    antes: ["Venda e esquece", "Cliente sumido"],
    depois: ["Pós-venda com cuidado", "Cliente que indica"],
    mito: "Desconto é o que fideliza",
    verdade: "Atendimento é o que faz voltar",
    evite: ["Demorar a responder", "Prometer o que não cumpre"],
    faca: ["Ligar depois da entrega", "Lembrar o nome do cliente"],
    citacao: "Venda é o começo do relacionamento, não o fim.",
    autor: "Equipe comercial",
    pergunta: "Como peço indicação sem parecer chato?",
    resposta: "Depois de uma entrega boa, peça com naturalidade e facilite o contato.",
    termo: "Pós-venda",
    definicao: "Tudo o que a empresa faz depois da compra para o cliente ficar satisfeito e voltar.",
    depoimento: "Fui atendido pelo nome e ainda me ligaram depois para saber se deu tudo certo.",
    opcoes: ["Peço indicação", "Nunca pedi"],
    chamada: "Fale com a gente",
    curto: "Atenda bem",
  },
};

/** O exemplo do setor (pelo id da identidade visual), com queda para negócios. */
function exemplo(setorId: string): Exemplo {
  return EXEMPLOS[setorId] ?? EXEMPLOS.negocios;
}

/** O texto de exemplo do nicho já no formato que o modelo pede. */
export function textosDeExemplo(modelo: ModeloDeArte, setorId: string): TextosDaArte {
  const e = exemplo(setorId);
  switch (modelo.arquetipo) {
    case "citacao":
      return { titulo: e.citacao, autor: e.autor };
    case "depoimento":
      return { titulo: e.depoimento, autor: "Cliente atendido" };
    case "lista":
    case "checklist":
    case "passos":
      return { titulo: modelo.arquetipo === "passos" ? `Como começar: ${e.curto.toLowerCase()}` : e.titulo, itens: e.itens.slice(0, modelo.arquetipo === "passos" ? 4 : 4) };
    case "dois-lados":
      if (modelo.id === "mito-ou-verdade") return { titulo: "Mito ou verdade?", lados: { rotulos: ["Mito", "Verdade"], esquerda: [e.mito], direita: [e.verdade] } };
      if (modelo.id === "isso-ou-aquilo") return { titulo: e.curto, lados: { rotulos: ["Evite", "Faça"], esquerda: e.evite, direita: e.faca } };
      return { titulo: e.curto, lados: { rotulos: ["Antes", "Depois"], esquerda: e.antes, direita: e.depois } };
    case "dado":
      return { titulo: e.numeroFrase, numero: e.numero };
    case "dado-barra":
      return { titulo: e.porcentoFrase, numero: e.porcento };
    case "print-conversa":
      return { titulo: e.pergunta, apoio: e.resposta };
    case "verbete":
      return { titulo: e.termo, apoio: e.definicao };
    case "enquete":
      return { titulo: `E você, ${e.curto.toLowerCase()}?`, opcoes: e.opcoes };
    case "caixa-pergunta":
      return { titulo: "Qual a sua maior dúvida sobre isso?" };
    case "oferta":
      return { titulo: e.titulo, apoio: e.apoio, chamada: e.chamada };
    case "revista":
      return { titulo: e.titulo, itens: e.itens.slice(0, 2) };
    case "tipografia":
    case "capa-tipografica":
    case "foto-inteira":
      return { titulo: modelo.maxPalavras <= 6 ? e.curto : e.titulo };
    case "print-post":
      return { titulo: `${e.titulo}. ${e.apoio}` };
    default:
      return { titulo: e.titulo, apoio: modelo.campos.includes("apoio") ? e.apoio : undefined };
  }
}
