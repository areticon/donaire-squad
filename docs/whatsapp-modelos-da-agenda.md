# Modelos de WhatsApp da demonstração

Gerado por `npx tsx scripts/whatsapp-modelos.mts` a partir de `lib/whatsapp/modelos.ts` (a fonte). Não edite aqui: mude o código e gere de novo.

Todos com categoria **Utilidade** (UTILITY) e idioma **Português (BR)** (pt_BR). O nome precisa ser exatamente o daqui. Variáveis no formato {{1}}, {{2}}, na ordem.

Para cadastrar todos de uma vez pela API: `npx tsx scripts/whatsapp-modelos.mts --cadastrar` (com WHATSAPP_TOKEN e WHATSAPP_BUSINESS_ACCOUNT_ID no .env.local). Para ver a aprovação: `--situacao`.

| Modelo | Para | Quando |
| --- | --- | --- |
| demandou_demo_confirmada | lead | Na hora da marcação |
| demandou_demo_remarcada | lead | Na hora da remarcação |
| demandou_demo_cancelada | lead | Na hora do cancelamento |
| demandou_demo_vespera | lead | 24 horas antes |
| demandou_demo_uma_hora | lead | 1 hora antes |
| demandou_demo_cinco_minutos | lead | 5 minutos antes |
| demandou_demo_comecando | lead | Na hora de começar |
| demandou_demo_esperando | lead | 10 minutos depois do início, se ninguém marcou que começou e o lead não abriu a sala |
| demandou_demo_obrigado | lead | 30 minutos depois do fim, se a reunião aconteceu |
| demandou_demo_nova_time | time | Na hora da marcação |
| demandou_demo_remarcada_time | time | Na hora da remarcação |
| demandou_demo_cancelada_time | time | Na hora do cancelamento (ou quando a remarcação passa a reunião para outra pessoa) |
| demandou_demo_lembrete_time | time | 24 horas antes e 1 hora antes |
| demandou_demo_cinco_minutos_time | time | 5 minutos antes |
| demandou_demo_resultado_time | time | 30 minutos depois do fim, se ninguém marcou o resultado |

## demandou_demo_confirmada

- Para: o lead
- Quando: Na hora da marcação
- Categoria: Utilidade

Corpo:

```
Sua demonstração da Demandou está confirmada para {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. O convite também foi para o seu e-mail, e avisamos por aqui antes da reunião, com o link da sala.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `segunda-feira, 5 de outubro, às 10:00`
- {{2}} quem atende: `Bruno Donaire`
- {{3}} link do Meet: `https://meet.google.com/abc-defg-hij`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Remarcar ou cancelar", endereço dinâmico `https://demandou.com/demonstracao/reuniao/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_remarcada

- Para: o lead
- Quando: Na hora da remarcação
- Categoria: Utilidade

Corpo:

```
Sua demonstração da Demandou mudou para {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. O convite novo foi para o seu e-mail.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `terça-feira, 6 de outubro, às 14:30`
- {{2}} quem atende: `Matheus Gaberlini`
- {{3}} link do Meet: `https://meet.google.com/abc-defg-hij`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Remarcar ou cancelar", endereço dinâmico `https://demandou.com/demonstracao/reuniao/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_cancelada

- Para: o lead
- Quando: Na hora do cancelamento
- Categoria: Utilidade

Corpo:

```
Sua demonstração da Demandou de {{1}} foi cancelada. Quando quiser, escolha outro horário pelo botão abaixo.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `segunda-feira, 5 de outubro, às 10:00`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Escolher outro horário", endereço fixo `https://demandou.com/demonstracao`

## demandou_demo_vespera

- Para: o lead
- Quando: 24 horas antes
- Categoria: Utilidade

Corpo:

```
Lembrete: sua demonstração da Demandou é amanhã, {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. Se precisar mudar, use o botão abaixo.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `segunda-feira, 5 de outubro, às 10:00`
- {{2}} quem atende: `Bruno Donaire`
- {{3}} link do Meet: `https://meet.google.com/abc-defg-hij`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Remarcar ou cancelar", endereço dinâmico `https://demandou.com/demonstracao/reuniao/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_uma_hora

- Para: o lead
- Quando: 1 hora antes
- Categoria: Utilidade

Corpo:

```
Lembrete: sua demonstração da Demandou começa em 1 hora, às {{1}}, horário de Brasília, com {{2}}. Videochamada: {{3}}. Se precisar mudar, use o botão abaixo.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} hora: `10:00`
- {{2}} quem atende: `Bruno Donaire`
- {{3}} link do Meet: `https://meet.google.com/abc-defg-hij`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Remarcar ou cancelar", endereço dinâmico `https://demandou.com/demonstracao/reuniao/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_cinco_minutos

- Para: o lead
- Quando: 5 minutos antes
- Categoria: Utilidade

Corpo:

```
Sua demonstração da Demandou com {{1}} começa em 5 minutos, às {{2}}, horário de Brasília. Toque no botão abaixo para entrar na sala.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} quem atende: `Bruno Donaire`
- {{2}} hora: `10:00`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Entrar na sala", endereço dinâmico `https://demandou.com/demonstracao/sala/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_comecando

- Para: o lead
- Quando: Na hora de começar
- Categoria: Utilidade

Corpo:

```
Estamos na sala. Sua demonstração da Demandou com {{1}} está começando agora. Toque no botão abaixo para entrar.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} quem atende: `Bruno Donaire`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Entrar na sala", endereço dinâmico `https://demandou.com/demonstracao/sala/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_esperando

- Para: o lead
- Quando: 10 minutos depois do início, se ninguém marcou que começou e o lead não abriu a sala
- Categoria: Utilidade

Corpo:

```
Estamos na sala esperando você para a demonstração da Demandou com {{1}}. Se ainda der, entre agora. Se o horário ficou ruim, escolha outro com um toque. Se você já entrou, pode ignorar esta mensagem.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} quem atende: `Bruno Donaire`

Rodapé: `Responda PARAR para não receber mais avisos.`

Botões (tipo Visitar site):

- "Entrar agora", endereço dinâmico `https://demandou.com/demonstracao/sala/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)
- "Escolher outro horário", endereço dinâmico `https://demandou.com/demonstracao/remarcar/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_obrigado

- Para: o lead
- Quando: 30 minutos depois do fim, se a reunião aconteceu
- Categoria: Utilidade

Corpo:

```
Obrigado pela conversa de hoje na demonstração da Demandou. O próximo passo: {{1}} manda a proposta com o plano que montamos juntos. Se surgir alguma dúvida antes disso, é só responder esta mensagem.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} quem atendeu: `Bruno Donaire`

Rodapé: `Responda PARAR para não receber mais avisos.`

## demandou_demo_nova_time

- Para: a pessoa do time
- Quando: Na hora da marcação
- Categoria: Utilidade

Corpo:

```
Nova demonstração marcada para {{1}}, horário de Brasília, com {{2}}. Lead: {{3}}. Faturamento: {{4}}. Calculadora: {{5}}. A ficha completa está no painel.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `segunda-feira, 5 de outubro, às 10:00`
- {{2}} quem atende: `Bruno Donaire`
- {{3}} quem é o lead: `Ana Souza, Diretora, Clínica Exemplo, WhatsApp +55 11 98765-4321`
- {{4}} faixa de faturamento: `R$ 100 mil a R$ 500 mil por mês`
- {{5}} resultado da calculadora: `plano Business por R$ 2.990 por mês, R$ 18.000 a menos que o time próprio`

Botões (tipo Visitar site):

- "Abrir o painel", endereço fixo `https://demandou.com/admin/agenda`

## demandou_demo_remarcada_time

- Para: a pessoa do time
- Quando: Na hora da remarcação
- Categoria: Utilidade

Corpo:

```
Demonstração remarcada para {{1}}, horário de Brasília, com {{2}}. Lead: {{3}}. O convite da agenda já foi atualizado.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `terça-feira, 6 de outubro, às 14:30`
- {{2}} quem atende: `Bruno Donaire`
- {{3}} quem é o lead: `Ana Souza, Clínica Exemplo`

Botões (tipo Visitar site):

- "Abrir o painel", endereço fixo `https://demandou.com/admin/agenda`

## demandou_demo_cancelada_time

- Para: a pessoa do time
- Quando: Na hora do cancelamento (ou quando a remarcação passa a reunião para outra pessoa)
- Categoria: Utilidade

Corpo:

```
A demonstração de {{1}} com {{2}} foi cancelada {{3}}. O horário voltou a ficar livre na agenda.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} dia e hora: `segunda-feira, 5 de outubro, às 10:00`
- {{2}} quem é o lead: `Ana Souza, Clínica Exemplo`
- {{3}} por quem: `pelo lead`

Botões (tipo Visitar site):

- "Abrir o painel", endereço fixo `https://demandou.com/admin/agenda`

## demandou_demo_lembrete_time

- Para: a pessoa do time
- Quando: 24 horas antes e 1 hora antes
- Categoria: Utilidade

Corpo:

```
Lembrete: você tem demonstração {{1}}, às {{2}}, horário de Brasília, com {{3}}. Videochamada: {{4}}. A ficha do lead está no painel.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} amanhã ou daqui a 1 hora: `amanhã`
- {{2}} hora: `10:00`
- {{3}} quem é o lead: `Ana Souza, Clínica Exemplo`
- {{4}} link do Meet: `https://meet.google.com/abc-defg-hij`

Botões (tipo Visitar site):

- "Abrir o painel", endereço fixo `https://demandou.com/admin/agenda`

## demandou_demo_cinco_minutos_time

- Para: a pessoa do time
- Quando: 5 minutos antes
- Categoria: Utilidade

Corpo:

```
A demonstração com {{1}} começa em 5 minutos, às {{2}}, horário de Brasília. Videochamada: {{3}}. Quando o lead entrar, marque que começou pelo botão abaixo, para ele não receber o aviso de atraso.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} quem é o lead: `Ana Souza, Clínica Exemplo`
- {{2}} hora: `10:00`
- {{3}} link do Meet: `https://meet.google.com/abc-defg-hij`

Botões (tipo Visitar site):

- "Marcar que começou", endereço dinâmico `https://demandou.com/demonstracao/comecou/{{1}}` (exemplo do fim: `cmg1abcd2efgh3ijkl.Xy9QwErTyUiOp`)

## demandou_demo_resultado_time

- Para: a pessoa do time
- Quando: 30 minutos depois do fim, se ninguém marcou o resultado
- Categoria: Utilidade

Corpo:

```
A demonstração com {{1}} de hoje, às {{2}}, terminou. Marque no painel se aconteceu ou se o lead faltou, para o funil ficar certo.
```

Variáveis (com o exemplo que a Meta pede no cadastro):

- {{1}} quem é o lead: `Ana Souza, Clínica Exemplo`
- {{2}} hora: `10:00`

Botões (tipo Visitar site):

- "Abrir o painel", endereço fixo `https://demandou.com/admin/agenda`
