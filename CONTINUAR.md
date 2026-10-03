# Prompt para o próximo chat (29/09/2026, noite): corrigir tudo o que o teste do Bruno achou

> Copie tudo abaixo da linha para abrir a próxima sessão.

---

Continuo o trabalho na Demandou (demandou.com), código em C:\Users\devan\opensquad-app. AMANHÃ (30/09) TENHO REUNIÃO COM INVESTIDOR: nada desta lista pode ficar para depois, e tudo precisa estar no ar e provado na tela até o fim do dia. Trabalhe em ordem, publique a cada bloco concluído e me mostre na tela.

ANTES DE QUALQUER COISA, leia nesta ordem:
1. `PROJETO.md`, seções "Estado em 29/09/2026" e "Fim de 29/09/2026: o teste do Bruno".
2. `HANDOFF.md`, partes 192 a 195 (a 195 é o diagnóstico do teste, com as causas medidas).
3. `docs/estilos-de-edicao-de-video.md` (a ficha dos 24 estilos e as camadas) e `lib/media/catalogo-de-estilos.ts` (o catálogo que a tela usa).
4. No planner do Notion (data source 05da3c47-4ed5-4a9b-ac79-14622c03b28e), os cards "Demandou:" com Status "Esta semana", em especial "correções do teste de 29/09 na edição de vídeo" (bloqueante).
5. O vídeo do teste: video_job `cmumzycoa000004iacu03zol8`, projeto `cmtmym5bo000004l80wwvpdd7` (Empreendedorismo Cristão), 22 min, 3 cortes. A escolha de estilo gravada no projeto é Vox, com aproximação lenta, afastamento, timelapse, mundo congelado, colagem e luz vazada, e a edição só aplicou o perfil de legenda "sério".

A LISTA, EM ORDEM (tudo hoje):

BLOCO 1, o que queima a imagem do cliente (sem custo de IA):
1. Card dos cortes e do vídeo completo: a miniatura e o "ampliar" mostram imagem quebrada porque o card aponta para o MP4 (`/api/videos/[id]/midia?tipo=vertical|completo`) e a tela desenha como imagem. Usar a capa como miniatura e um player de vídeo no ampliar; o card do YouTube (vídeo completo) precisa de player para assistir.
2. Capa sem distorcer o rosto: hoje `lib/media/capa-e-titulo.ts` (comporCapa) pede ao modelo de imagem para mudar a expressão, e isso redesenha o rosto (o próprio comentário do código prevê). Trocar por: quadro real da gravação com a pessoa recortada (o worker já tem recorte, `worker/src/segmentacao.mjs`), fundo e texto compostos em código, e o modelo de imagem SÓ no fundo. Nunca mexer no rosto. A capa deve seguir a linguagem escolhida (Vox: colagem, marca-texto, cor da marca).
3. "Agendado" sem aprovação: é só a data planejada (nada sai sem aprovar no card do Paulo), mas engana. Trocar por "sai em DD/MM às HH:MM se você aprovar" em toda prévia. E acertar a divergência vista no card do Paulo: cabeçalho 11:00, caixa 09:00, rascunho dizendo que o horário passou; agenda vencida sugere o próximo horário livre.
4. "Reprovado pela Vera, esperando você": corte que a Vera reprova volta ao Vitor, que refaz sozinho (ajusta início e fim, até 2 vezes); só chega ao cliente, com o motivo, se não tiver conserto. Ver `lib/media/vera-do-video.ts`.
5. Texto das peças da semana do vídeo: o card de sexta mostrou "===LINKEDIN===" (o marcador de `lib/media/write-posts.ts` ou `pecas-da-semana.ts` vazou para a peça); terça, quinta e domingo abriram com a mesma frase (repetição entre dias); o carrossel de sábado mostrou só "Post". Corrigir e conferir no banco as peças do projeto do teste.
6. Estado dos cards: enquanto o squad trabalha, o card diz "esperando você" e não abre. Mostrar "o squad está fazendo" até a peça estar pronta.

BLOCO 2, a edição cumprir o que o cliente escolheu:
7. O estilo escolhido tem de ser executado. Hoje só o perfil de legenda de `lib/media/estilos.ts` chega ao worker. Levar a escolha completa (`Project.videoEstiloEscolha`) ao pedido de corte (`lib/media/pedido-de-corte.ts`) e ao worker (`worker/src/ffmpeg.mjs`): legenda da linguagem (Vox: frase-chave em marca-texto na cor da marca, colagem; Hormozi: palavra a palavra grande; etc.), zoom e punch-in no ritmo, transições, look de cor (LUT) e grafismo. Remotion é livre para a Demandou (2 pessoas) e pode entrar para o grafismo. Sempre as cores, a fonte e o logo da marca.
8. Limpeza de fala: o corte saiu com um "né" no meio da fala e ponto de corte mal feito. Revisar a limpeza (vícios de fala no meio da frase, não só pausas) e o ponto de corte (sempre em pausa, nunca no meio de palavra). Medir no vídeo do teste.
9. Efeitos da Higgsfield nos cortes: aberturas, transições e cenas de apoio geradas (as camadas de câmera e efeito escolhidas). A API e a credencial existem (`HF_CREDENTIALS`, `scripts/higgsfield-exemplo.mts`; catálogo real tem Seedance 2.0/2.5 e Kling 3.0). Nunca usar a espera do SDK: gravar o request_id e consultar. ANTES de ligar em produção, me mostrar o custo por vídeo e pedir aprovação.
10. Artes da semana seguindo a mesma linguagem do vídeo: hoje as artes seguem a direção visual da Diana (`lib/media/estilo-do-cliente.ts`) e ignoram o catálogo. Unificar.
11. Refazer o vídeo do teste com tudo isso e me mostrar os cortes, a capa e o completo na tela. Custo estimado de IA perto de US$ 3 a 4, mais a Higgsfield se aprovada: me diga o valor antes de rodar.

BLOCO 3, produto:
12. Bastão no escritório durante o vídeo: ligar cada etapa da esteira do vídeo a um agente (Ouvindo e Escolhendo, Vitor; Pesquisando, Roberto; Cortando, Vitor com a Diana no enquadramento; Capas, Diana; Escrevendo, o especialista de cada rede; Vídeo completo, Vitor e Yan) e a passagem de um para o outro até a Vera, o Paulo e eu; as peças aparecem uma a uma, não cinco de uma vez. Plaquetas da mesa dupla um pouco menores que hoje.
13. Card do dia com TODAS as redes (LinkedIn, X, Instagram, Facebook, TikTok, YouTube), conectadas e não, perfis e páginas, com o formato de cada uma para marcar (feed, reels, stories; vídeo ou Shorts); rede marcada sem texto pede a adaptação ao especialista (mostrar o custo).
14. Medidor de upload: velocidade real da minha rede, tempo estimado para o arquivo, aviso de que depende da rede de quem envia, e aviso de preferir wi-fi em arquivo longo (dados móveis).
15. Crédito da edição recalibrado pelo custo real (medido: 16 min custaram US$ 3,13 de IA e cobraram 50 créditos; proposta de cerca de 35 créditos por minuto). Me mostre a proposta com os números e aplique depois do meu ok, com a tela dizendo o que está incluso e o que é cobrado à parte.
16. Se `FAL_KEY` e `ELEVENLABS_API_KEY` estiverem no `.env.local`, rodar o teste comparativo do gêmeo digital aprovado (teto US$ 80): Kling Avatar v2 Pro e OmniHuman 1.5 pelo fal.ai com a minha voz clonada, Seedance 2.5 pela Higgsfield, Veo 3.1 cheio; mesmo roteiro de 30 s e a minha foto (`Documents\Demandou\gemeo-teste`). Mostrar os quatro lado a lado com o custo real.
17. POR ÚLTIMO, depois de tudo corrigido: o vídeo curto de venda para a landing, no lugar do atual (qualidade ruim). Pitch rápido: começa na dor, vai para a solução e mostra os ganhos (aumento nas vendas, posicionamento de marca, autoridade, produtividade, economia com social media, editor e time) enquanto os agentes trabalham na tela. Edição profissional, efeitos da Higgsfield, voz em português explicando. Me mostre o roteiro e o custo antes de gerar.

REGRAS DA CASA: nunca travessão (vírgula, dois-pontos, ponto e vírgula ou parênteses); siglas por extenso ou explicadas; comentários em português explicando o porquê; componente de cliente nunca importa módulo que toca o banco; melhorar a tela que existe, não trocar; provar na tela antes de dizer que está pronto (dev local nas portas 3000 a 3003 com o banco compartilhado, sessão de teste por `scripts/tmp/sessao-e2e.mts`; produção recusa esse cookie); deploy com `npx vercel --prod --yes` e o worker com `railway up --service video-worker --detach` de dentro de `worker/`; Write em vez de heredoc longo; nunca salvar no OneDrive; nunca imprimir valor de credencial; não gastar dinheiro meu sem mostrar o valor e pedir; no fim de cada entrega, atualizar HANDOFF.md, a página "Estado da Demandou" no Notion (page_id 3c11a873-b4c1-8164-8fa0-dd693b420750) e o planner.

ARMADILHAS PAGAS HOJE (não repetir):
- Muito código deste repositório está FORA do git: confira se o arquivo existe antes de criar (uma rota foi sobrescrita e teve de ser reconstruída pelo build antigo).
- Depois de migração, reinicie o dev server e apague `.next/dev`; parar a tarefa não mata o node do Next por baixo, encerre o PID da porta.
- No Git Bash, rode os scripts de tela com `MSYS_NO_PATHCONV=1`, senão a rota vira caminho do Windows.
- Teste de tela precisa clicar como gente (evento real), não injetar o arquivo: o botão da música "funcionava" no teste e não no Chrome do Bruno.
- Não publique link para tela que ainda não existe.
