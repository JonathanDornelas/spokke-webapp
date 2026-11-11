# Telas para redesenho — o que cada uma faz

Brief funcional de quatro áreas do Studio, para quem vai redesenhá-las. Descreve **o que está
na tela, o que ela faz e o que não pode quebrar** — não a aparência, que é o trabalho do
redesenho.

O que vale sobre tudo isto e não se repete aqui:

- **Tokens, tipografia, movimento, acessibilidade**: `.claude/rules/design-system.md`.
- **Componentes existentes** (`Badge`, `Pagination`, `ScoreBar`, `Loading`, `Alert`,
  `CorrectionIcon`, `AmbientShapes`…): `.claude/rules/components.md`. Reutilize antes de
  inventar.
- **Regras de produto que atravessam telas**: `.claude/rules/paginas.md`.

Três coisas que valem em TODAS as quatro:

1. **Estado nunca é comunicado só por cor.** Ícone e texto, sempre — daltonismo é comum e
   metade destas telas é feita de estado.
2. **Verde, âmbar e vermelho são reservados para a semântica de correção** (certo, parcial,
   errado). Não use como decoração ou destaque de marca; azul (#3659CB) é a marca, teal é áudio.
3. **O Studio é desktop com sessão longa** — pode ser denso. Mas todas estas telas têm versão de
   celular hoje, e ela não pode virar rolagem lateral.

---

## 1. Turmas — listagem

`(studio)/turmas` · **Funciona de verdade** (loader real, dados do banco).

### O que a tela responde

"Quais turmas eu tenho, quantos alunos recebem convite, e qual está parada."

### Na tela

- **Título + linha de totais**: `N turmas · N alunos · N com e-mail`.
- **"Nova turma"** — ação primária, canto superior direito.
- **Uma linha por turma**, com:

  | dado                        | por que está lá                                                                              |
  | --------------------------- | -------------------------------------------------------------------------------------------- |
  | Etiqueta de 2 letras + cor  | identidade visual rápida da turma; a cor é escolhida na criação                              |
  | Nome                        |                                                                                              |
  | Idioma                      | opcional — turma pode não ter idioma definido                                                |
  | `N alunos` + `N com e-mail` | **o segundo número é quem recebe convite**, e por isso vem antes de qualquer botão de enviar |
  | Atividades enviadas         | `—` quando zero                                                                              |
  | Último envio                | relativo: "hoje", "há 3 dias", "há 2 semanas", "nunca"                                       |
  | "Abrir"                     | leva ao detalhe                                                                              |

- **Vazio**: não é cobrança de pendência. O texto explica o GANHO de cadastrar turma (o aluno
  chega com o nome certo no relatório; você não redistribui link toda semana) e diz que link, QR
  e código seguem valendo sem isso.

### Cores de etiqueta

Cinco, fixas: azul, teal, violeta, magenta, ardósia. São identidade de turma, **não** estado.

### Hoje

Tabela no desktop, cartões no celular — a mesma informação, sem rolagem lateral.

---

## 2. Turmas — detalhe

`(studio)/turmas/[id]` · **Funciona de verdade.**

A tela mais densa das quatro. Ela é três coisas ao mesmo tempo: a chamada, o histórico de envios
e o painel de enviar.

### Cabeçalho

Etiqueta + nome + idioma, e **"Enviar atividade"** como ação primária (alterna um painel).

### Quatro números

`alunos na turma` · `com e-mail · recebem convite` · `atividades enviadas` · `e-mails que
voltaram`. O último em vermelho quando maior que zero — é o único que pede ação.

### Painel "Enviar atividade"

Abre no lugar, não em outra tela. Lista as atividades **publicadas** (rascunho não aparece:
enviar rascunho daria ao aluno um link que não existe), com título, idioma e contagem de itens.

Escolher a atividade acontece AQUI, dentro da turma. Mandar o professor para a lista de
atividades o deixava sozinho e ele voltava sem ter enviado.

Depois de enviar, uma faixa de confirmação: `N convites saindo · a fila está andando`. **Nunca
diga que chegou** — o envio é assíncrono. E: "quem não tem e-mail segue na turma e entra pelo
link aberto".

### Cartão do último envio

Atividade, quando, e **"Reenviar para os N que não abriram"**. Reenvio troca o token, então o
link antigo para de valer.

### A chamada (lista de alunos)

Por aluno: iniciais, nome (**link para o painel do aluno**), e-mail ou "sem e-mail", marca "com
conta" quando ele ligou a ficha a uma conta, o estado, e apagar.

**Os seis estados**, cada um com ícone e texto:

| estado      | significa                                           |
| ----------- | --------------------------------------------------- |
| Vai receber | a turma ainda não recebeu nada                      |
| Enviado     | convite saiu                                        |
| Começou     | abriu e está respondendo                            |
| Terminou    | entregou                                            |
| Sem e-mail  | o CADASTRO não tem e-mail                           |
| Voltou      | o servidor do aluno recusou — o único que pede ação |

"Sem e-mail" e "Vai receber" são coisas diferentes e não podem ser fundidas: um é sobre o
cadastro, o outro sobre a turma. Verde e âmbar **ficam de fora** destes estados — são a semântica
de correção, e "terminou" não é "acertou". Vermelho só em "Voltou".

Paginação de 15, com legenda dos estados embaixo.

### Adicionar aluno

Painel que abre no lugar. Dois modos: um a um, ou **colar uma lista**. No modo colar, a prévia
usa o mesmo parser do servidor e mostra cada linha que fica de fora com o número da linha e o
motivo. **Linha só com o nome não é erro** — e-mail é opcional.

### Apagar

Aluno e turma, os dois com a consequência dita em TEXTO antes de perguntar: apagar o aluno leva
junto as respostas dele; as tentativas feitas pelo link aberto não são tocadas.

### A regra que não pode quebrar

**Convite e link aberto coexistem.** Cadastrar turma serve para o nome certo no relatório, nunca
para trancar quem não está cadastrado. Nenhuma tela pode fazer o envio por e-mail parecer o
caminho obrigatório, e aluno anônimo nunca é apresentado como erro ou dado incompleto.

---

## 3. Atividade — detalhe

`(studio)/atividades/[id]` · **Funciona de verdade.**

### O que a tela responde

"O que é esta atividade" — não "como foi", que é a tela de resultados, a um clique daqui.

**É uma tela de LEITURA.** Toda ação leva para onde ela já existe: o wizard para editar, a etapa
de publicar para reenviar, os resultados para o relatório. Nada é editado no lugar.

### Cartão de estado

Três estados, e o rótulo diz **o que o ALUNO encontra ao abrir o link**:

| estado                | nota                                              |
| --------------------- | ------------------------------------------------- |
| No ar                 | o link responde; quem abrir agora faz esta versão |
| Mudanças por publicar | o link responde com o que já estava no ar         |
| Rascunho              | o link ainda não responde                         |

**Nunca cite número de versão.** O snapshot imutável existe por dentro; para o professor a
atividade é uma só, com estado.

### Estado do áudio (dentro do cartão de estado)

O áudio é a única parte da atividade que vive FORA do banco — num bucket — e portanto a única
que pode estar faltando sem nada avisar. Ele não vence: fica enquanto a atividade existir.

- **Pronto**: `Áudio pronto — N arquivos das questões de escuta. Ficam guardados enquanto a
atividade existir.`
- **Faltando** (ainda gerando, ou a geração falhou): `Gerando áudio — N de N prontos` **mais o
  botão "Gerar áudio de novo"**, que só aparece neste caso. Regerar deixa o link fora do ar por
  alguns minutos, e a tela avisa antes.
- **Atividade sem questão de escuta não mostra linha nenhuma** — "0 de 0" seria inventar um
  problema.

### Habilidades treinadas

Derivadas dos itens, com contagem. **O professor nunca escolheu nenhuma** — não existe campo de
habilidade em formulário algum.

### As questões

Lista clicável; cada uma abre o editor daquele item. Por item: ícone da família de interação,
resumo legível ("digitar a frase ao ouvir o áudio"), e a habilidade derivada. **Nunca JSON.**

### Link, QR e código

- **O link existe desde o rascunho** — o endereço sai do id da atividade, não de um campo. O
  professor não escolhe. Com "Copiar".
- **O QR tem cartão próprio, em tamanho de projeção.** É como a atividade chega numa sala: o
  professor projeta e a turma aponta a câmera. A 66px dentro de outro cartão ele era ilegível a
  três metros do quadro.
- **"Compartilhar"** usa a folha nativa do sistema; onde ela não existe, copiar o link é o
  caminho de baixo, e o botão nunca some.
- **Código de acesso** de 4 letras, quando ligado.

### Enviada para

Uma linha por turma, com a etiqueta colorida, quando foi, e os números daquele envio.

### Respostas

Total, terminadas, convidados, e a distribuição certo/parcial/errado. **Parcial tem faixa
própria** — somar ao erro esconde exatamente o que o professor precisa ver.

---

## 4. Painel do aluno

Há DOIS, e eles são coisas diferentes. Verifique qual você está redesenhando.

### 4a. `(studio)/alunos/[id]` — o aluno visto pelo PROFESSOR

**Funciona de verdade.** Aberto clicando no nome do aluno em qualquer lista.

- Iniciais, nome, e-mail, quando entrou, etiqueta da turma.
- **A conta dele**, quando ligou uma: o e-mail da conta pode ser diferente do que o professor
  cadastrou. Os dois são verdade; a tela mostra o do cadastro e o da conta junto.
- **Três números**: tentativas, terminadas, acerto médio. **A média é só das TERMINADAS** —
  incluir quem parou na segunda questão puxaria o número para baixo por um motivo que não é
  desempenho.
- **Histórico por atividade**: título, idioma, quando, respondidas de N, a distribuição
  certo/parcial/errado (`ScoreBar`) e a porcentagem.
- Quando o nome digitado sobreviveu diferente do cadastro, a linha mostra
  `respondeu como "ju"` em vez de esconder — o professor precisa entender de onde a linha veio.
- **Diz em TEXTO que só o que está LIGADO a ele aparece ali**: responder pelo link aberto sem
  abrir o link pessoal continua valendo para a turma e fica sem dono.

### 4b. `aluno/` — a área do PRÓPRIO aluno

**Funciona de verdade**, e exige login (redireciona para `aluno/entrar`).

**A conta do aluno é OFERTA, nunca exigência.** Responder sem conta é o caminho normal do
produto; esta área existe para quem quer reencontrar o que respondeu em outro aparelho.

- Nome e e-mail da conta, e **"Sair"**.
- **As turmas em que ele está**, com o nome do professor de cada uma.
- **Histórico de tentativas**: atividade, professor, idioma, quando, respondidas de N. **A nota
  só aparece se o professor ligou "mostrar resultado"** naquela atividade — sem isso, a tela
  mostra a tentativa sem placar.
- Dois totais: tentativas e terminadas.
- **"Adotar minhas tentativas"**: vincula à conta o que ele respondeu neste aparelho sem estar
  logado. É a única escrita desta área.

---

## 5. Conta + assinatura, com abas laterais

`(studio)/conta` e `(studio)/assinatura` hoje são **duas telas separadas, e as duas estão em
mock** — o loader da conta lê o professor da sessão, mas nenhum formulário salva nada, e a
assinatura é inteiramente fictícia.

O pedido é **fundir as duas numa página com abas laterais**. Abaixo, o que existe em cada uma
para não se perder na fusão.

### Aba "Seus dados"

- **Nome** e **e-mail**, editáveis.
- Quando há troca de e-mail pendente: `Confirmação pendente em novo@email` (âmbar, com ícone).
- **Senha**: botão de trocar, com o aviso de que **trocar encerra as outras sessões abertas**.
- **Encerrar conta**, em zona de perigo: apaga conta, materiais e rascunhos. A consequência vem
  em texto ANTES de perguntar.
  - **Pendência de produto aberta**: o que acontece com os links já publicados quando a conta é
    encerrada ainda não foi decidido. Não invente uma resposta na tela.

### Aba "Assinatura"

Cinco estados de plano, e cada um muda o que a tela mostra:

| status     | o que a tela diz / oferece                                       |
| ---------- | ---------------------------------------------------------------- |
| `active`   | nome do plano + "Renova em 12 de outubro" · "Gerenciar cobrança" |
| `trial`    | dias restantes · "Assinar agora"                                 |
| `past_due` | **"Pagamento atrasado"** em destaque · "Gerenciar cobrança"      |
| `pending`  | **"Confirmando pagamento…"** com indicador de espera             |
| `canceled` | acesso até o fim do período pago                                 |

**Duas regras que não podem se perder na fusão:**

1. **Cobrança não afeta o aluno.** Pagamento atrasado bloqueia CRIAR e PUBLICAR; os links já
   publicados continuam funcionando. A tela precisa dizer isso — é a dúvida imediata de quem vê
   "pagamento atrasado".
2. **Voltar do checkout NÃO significa pago.** A confirmação vem do webhook do provedor, e é por
   isso que existe o estado `pending` com espera visível. Nunca mostre "assinatura ativa" logo
   após o retorno do checkout.

**Decidido**: o teste dura 14 dias e vai exigir cartão, cadastrado no gateway quando ele existir
(billing.md "Trial"). Até lá a tela diz só "14 dias grátis".

### Sobre as abas laterais

O Studio já tem uma barra lateral de navegação global. Duas barras laterais lado a lado é a
armadilha óbvia deste layout — vale desenhar pensando em como as duas convivem, ou se a
navegação da conta é outra coisa (abas no topo do conteúdo, por exemplo) que resolve o mesmo
problema sem competir com o menu.

---

## O que NÃO redesenhar junto

Estas telas fazem fronteira com outras que não estão neste brief e têm regras próprias:

- **O wizard de criação** (4 etapas) usa layout próprio, sem a barra lateral — durante a criação
  o professor tem uma tarefa só.
- **O Player** (a tela do aluno respondendo) tem orçamento oposto: celular fraco, 4G, alvo de
  toque de 48px, uma pergunta por tela, a página não rola.
- **Resultados** (`resultados/[activityId]/[attemptId]`) é onde o professor comenta e corrige,
  em cima da própria resposta.
