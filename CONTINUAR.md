# Continuar o trabalho da Demandou

Cole isto inteiro no começo do chat novo.

---

Você vai continuar o desenvolvimento da **Demandou** (demandou.com), um SaaS de
criação e publicação de conteúdo com agentes de IA. O código está em
`C:\Users\devan\opensquad-app`.

## Antes de qualquer coisa, leia

1. **`HANDOFF.md`** na raiz do repositório. É longo, e as **partes 44 a 49** (o
   final do arquivo) são o estado atual do produto de vídeo, que é onde o
   trabalho está. Leia essas partes por inteiro.
2. A nota **"Estado da Demandou em 18/08/2026"** na wiki do Notion, dentro de
   `Donaire Brains > 10-profissional > demandou`. Ela tem o raciocínio por trás
   das decisões, e não só o resultado.
3. O card **Ref 179** no database "Ações, Bem Natura & Família", que é o do
   dogfooding do vídeo, mais os cards de "App & Tech" com status "Esta semana".

## Como eu gosto de trabalhar

- **Passo a passo, um de cada vez, esperando eu confirmar antes de seguir.**
- Quando for configuração em painel de terceiro (Meta, Google, Stripe, Vercel,
  Railway, HostGator), **me diga onde clicar, uma instrução por vez, e espere
  meu retorno.**
- **Nunca use travessão em texto nenhum.** Use vírgula, dois-pontos, ponto e
  vírgula ou parênteses.
- Ao fim de qualquer interação que mude o projeto, **atualize o Notion (wiki e
  tarefas) e o HANDOFF.md sem eu precisar pedir.**
- **Questione minhas premissas quando elas não fecharem, com números.**
- **Teste contra dado real antes de dizer que funciona.**

## O padrão de teste do projeto, e ele não muda

Meu vídeo de teste é RUIM de propósito: webcam de 422x302 num canto de
screencast, fundo branco de parede, fala sem roteiro e sem fechar ideia.

**Esse é o caso de teste oficial. Não me peça uma gravação melhor.** Os usuários
vão subir vídeos ruins, e o produto é justamente pegar algo ruim e transformar
em algo bom, que é o conceito dos filtros do Instagram. Se a plataforma resolver
o meu vídeo, ela está pronta.

## Onde o trabalho parou

O fluxo de vídeo funciona de ponta a ponta em produção: upload, transcrição,
seleção de trechos, limpeza de fala, corte vertical e horizontal, recorte da
pessoa do fundo, capa e publicação em cinco redes.

Nas últimas sessões, o que foi corrigido a partir do que eu reprovei
assistindo:

- O recorte do slide parou de perder 27% do conteúdo
- O recorte da pessoa (MediaPipe) funciona, a 7,2 ms por quadro
- A limpeza de fala passou a valer para os CORTES, não só para o vídeo do
  YouTube. Antes, 9% do que ia ao ar era pausa ou muleta
- O agente escolhe a frase de abertura e o código confere que ela existe
- O fim do corte fecha a frase (4 de 7 cortavam no meio)
- Os cortes passaram a ter só a pessoa, sobre fundo gerado por IA
- O especialista pontua seis critérios e RECUSA trecho fraco: devolveu 4 cortes
  em vez de 7, com diagnóstico honesto sobre a matéria-prima
- Existe relatório de valor para o cliente
- Existem quatro estilos de edição e legenda palavra a palavra

## O que fazer agora, na ordem que eu quero

**1. Ligar a legenda e o estilo no worker.** Os módulos
`lib/media/legenda-falada.ts` e `lib/media/estilos.ts` foram escritos e
testados, mas o fluxo de corte ainda não os chama. Sem isso a legenda não chega
no vídeo, e legenda é a peça mais cara que falta: **85% dos vídeos curtos são
assistidos sem som.**

**2. O fundo com brilho casado ao original.** Minha ideia, e já foi medida: o
recorte fica com um borrado branco em volta porque o fundo original é branco. O
anel em volta da silhueta tem brilho 85 e o fundo ao redor tem 57, ou seja 28
pontos de diferença. Se o fundo gerado tiver o brilho parecido com o original, o
halo perde contraste e some. O `recorte.py` já calcula a máscara, então dá para
amostrar o brilho do fundo original e passar ao prompt em
`lib/media/fundo-do-corte.ts`.

**3. A qualidade do fundo gerado.** Eu vi o primeiro e achei amador demais,
imagem distorcida, sem qualidade. Melhore o prompt E confira o resultado antes
de subir.

**4. Efeitos, emoji e som explorando as falas.** Já decidimos: só o que sai da
FALA, sem print de notícia. A pesquisa diz que o alvo é mudança visual a cada
1,5 a 2 segundos.

**5. Tudo isso vale para o VÍDEO COMPLETO também**, e não só para os cortes.

**6. A tela para o cliente escolher o estilo do projeto.**

## Duas coisas que só eu faço, e você não deve tentar

- **O worker do Railway NÃO sobe com o push.** Ele não está ligado ao GitHub. Depois
  de mexer em `worker/src`, o deploy é manual:
  `cd worker && railway up --service video-worker --detach`
- A verificação da empresa na Meta, a submissão do OAuth do Google, a busca no
  INPI, fechar os primeiros pagantes e o teste de tráfego pago.

## Uma coisa que eu te devo

Eu vou gravar um vídeo novo em tela cheia, com minha webcam 4K, sem compartilhar
tela. Quando eu avisar, **me ajude a configurar o OBS antes de gravar**, com
bitrate e enquadramento pensados para o corte vertical. Resolver na origem vale
mais que qualquer compensação por composição.

## Como testar sem quebrar a cara

O script de teste **importa os módulos de produção**, e não os replica. Isso é de
propósito: replicar a lógica da rota causou vários diagnósticos errados. Se a
rota mudar de desenho, o script quebra em vez de mentir.

```bash
cd C:/Users/devan/opensquad-app

# Roda a seleção de trechos com o código real
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/rodar-selecao.mts

# Dispara o corte contra o worker de produção
npx tsx@4 --tsconfig tsconfig.json scripts/tmp/rodar-corte.mts \
  https://demandou.com https://video-worker-production-2eb6.up.railway.app

# Confere o que o worker tem instalado
curl https://video-worker-production-2eb6.up.railway.app/saude
```

**E a regra que mais custou caro nestes dias: a verificação tem que chegar até o
artefato.** Duração batendo e ausência de erro não dizem se o vídeo é bom. Baixe
o corte, extraia um quadro e OLHE antes de me dizer que funcionou.
