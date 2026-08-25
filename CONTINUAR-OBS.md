# Configurar o OBS para a gravação 4K da Demandou

Cole isto inteiro no começo do chat novo.

---

Você vai me ajudar a configurar o **OBS Studio** para eu gravar o vídeo novo do
meu canal, que vai ser editado pela **Demandou** (meu SaaS de edição de vídeo,
demandou.com). Eu sou o Bruno.

## O que esta gravação é

- **Só eu falando para a webcam 4K, em tela cheia. SEM compartilhar tela, sem
  slides.** A gravação anterior era um screencast com a webcam de 422x302 num
  canto, e a plataforma avisou: a ampliação de 2,8x deixava o corte macio.
  Gravar em tela cheia resolve na origem.
- A Demandou vai: transcrever, limpar a fala, gerar um vídeo completo para o
  YouTube (16:9) e cortes verticais 9:16 para Reels/TikTok/Shorts, com legenda
  palavra a palavra no terço inferior.

## As restrições que mandam na configuração

1. **O upload da plataforma aceita no máximo 1,9 GB.** Vou gravar de 20 a 30
   minutos. Faça a conta do bitrate comigo: 30 min a 8 Mbps dá 1,8 GB, que é o
   teto. Não me deixe sair gravando em bitrate que estoure isso.
2. **30 fps** (o fluxo de edição trabalha a 30).
3. **MP4 híbrido** (fragmentado/recuperável): já perdi gravação por queda, e a
   configuração que uso desde 22/08 é MP4 híbrido justamente por isso.
4. Resolução: a webcam é 4K. Me ajude a decidir entre gravar 4K a bitrate
   apertado ou 1440p/1080p com bitrate mais folgado dentro do teto de 1,9 GB.
   O corte vertical usa um recorte 9:16 da região onde eu estou, então
   resolução sobrando na largura vira nitidez no corte.
5. **Áudio é metade do produto**: AAC 160 kbps ou mais, e me ajude a conferir
   o nível do microfone (pico por volta de -12 a -6 dB, sem clipar). A
   plataforma nivela para -14 LUFS depois, mas não conserta clipping.

## Enquadramento (para o corte vertical funcionar)

- Eu centralizado, da cintura para cima, com folga acima da cabeça.
- O corte 9:16 vai pegar a faixa central: nada importante nas laterais.
- A legenda entra no terço inferior do corte: evitar objetos importantes na
  faixa de baixo.
- Fundo real do ambiente (a plataforma não troca mais o fundo, de propósito).
- Luz de frente, não de trás.

## Como trabalhar comigo

- **Você tem acesso ao OBS via MCP** (ferramentas `obs_*`): use para ler e
  ajustar as configurações direto, me dizendo o que mudou. O OBS precisa
  estar aberto com o WebSocket ligado (Ferramentas > Configurações do
  WebSocket).
- Passo a passo, uma coisa por vez, esperando eu confirmar.
- Nunca use travessão em texto nenhum: vírgula, dois-pontos ou parênteses.
- Antes de eu gravar os 25 minutos, me faça gravar **30 segundos de teste**,
  confira o arquivo (resolução, fps, bitrate real, áudio sem clipar) e só
  então libere a gravação de verdade.
- Uma dica de conteúdo que a própria plataforma me deu, para você me lembrar
  antes de eu apertar o botão: **fechar cada ideia com ponto final antes de
  puxar a próxima, e abrir cada bloco com a virada, não com o contexto**. Os
  cortes saem melhores assim.

## Ao final

Quando o arquivo de teste e a configuração estiverem validados, me dê um
resumo de uma tela: resolução, fps, bitrate, formato, áudio, e o tamanho
estimado para 30 minutos. Eu gravo, subo na Demandou e testo o fluxo inteiro.
