# Materiais — como funciona hoje

Brief funcional de duas telas que mexem no MESMO dado — o material do professor —, em dois
momentos diferentes: a **biblioteca** (`(studio)/materiais`), onde ele cadastra e mantém o que
tem, e a **etapa 2 do wizard** (`(studio)/atividades/[id]/materiais`), onde escolhe o que entra
numa atividade. Descreve o que está na tela, o que ela faz e o que não pode quebrar — não a
aparência.

O que vale sobre tudo isto e não se repete aqui:

- **Tokens, tipografia, movimento, acessibilidade**: `.claude/rules/design-system.md`.
- **Componentes existentes** (`Pagination`, `Loading`, `Badge`, `Alert`, `HeaderCard`…):
  `.claude/rules/components.md`. Reutilize antes de inventar.
- **Regras de produto**: `.claude/rules/paginas.md` ("Studio", "Biblioteca de materiais") e
  `.claude/rules/kernel.md` ("O que o professor realmente informa").

---

## 0. O que é um material — e as regras que valem nas duas telas

Material é a matéria-prima da atividade. **O professor não preenche exercício por exercício**:
ele cadastra conteúdo e o sistema gera os exercícios (kernel.md, nível 1 de autoria). São
quatro tipos, e cada um tem os SEUS campos:

| tipo (na tela) | no kernel      | campos que o professor digita                                           | o que vira                                                                                      |
| -------------- | -------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Par de frases  | `SentencePair` | frase no idioma alvo · tradução · nota (opcional, nunca vai ao aluno)   | montar a frase, digitar a tradução, completar a lacuna, ouvir e escrever/escolher/montar, falar |
| Vocabulário    | `VocabItem`    | termo · sentido · frase de exemplo (opcional)                           | escolher a tradução (e o par termo↔sentido da associação que fecha a atividade)                 |
| Texto          | `Passage`      | título · texto corrido · perguntas de compreensão (pergunta + resposta) | uma questão de escolha por pergunta — **sem pergunta, nada é gerado do texto**                  |
| Diálogo        | `Dialogue`     | lista de falas `{ falante, texto }` na ordem certa (mínimo 2)           | colocar as falas na ordem                                                                       |

Regras que atravessam as duas telas — todas já implementadas, nenhuma é desejo:

1. **Um material é do PROFESSOR, não da atividade.** A ligação com atividades é N:N: o mesmo
   par de frases pode estar em três atividades e continua sendo uma linha só na biblioteca.
2. **Material igual não duplica.** Cadastrar (em qualquer das duas telas) uma frase idêntica a
   uma que o professor já tem REAPROVEITA a existente (`findEquivalent`: igualdade de `jsonb`,
   mesmo tipo). A tela sempre diz quando isso aconteceu.
3. **O tipo de um material não muda depois de criado.** Trocar o tipo mudaria a forma do dado
   que itens já gerados apontam; a edição mantém o tipo travado.
4. **Editar um material edita a linha compartilhada.** Como é uma linha só, mudar a frase pela
   etapa 2 de uma atividade muda o que a biblioteca e os rascunhos de outras atividades veem.
   O que já está PUBLICADO não muda: a versão publicada guarda uma cópia congelada dos itens
   (regra inviolável nº 7).
5. **Apagar da biblioteca não alcança atividade no ar.** Some da biblioteca e dos rascunhos; o
   publicado continua intacto — inclusive o áudio, que é identificado pelo conteúdo e não pelo
   material (db.md "MediaAsset"). A tela diz isso antes de perguntar.
6. **Os dois formulários gravam o mesmo dado.** `montarMaterial`
   (`$lib/server/atividades/material-form.ts`) é compartilhado: cadastrar aqui e cadastrar lá
   não podem produzir formas diferentes, senão "trazer da biblioteca" traria um dado de outro
   formato.
7. **Colar uma lista usa o mesmo parser nos dois lados** (`parseRawMaterial`, kernel puro):
   a prévia da tela e o que o servidor grava são a mesma conta.
8. **O idioma não é campo do material.** Ele vem das atividades que o usam; material que ainda
   não está em nenhuma aparece com "—".

### O formato de "colar uma lista"

Só existe para par de frases e vocabulário — onde uma linha é uma unidade. Texto e diálogo são
um bloco só e não têm "um por linha".

- Uma linha por material; separador `·`, `|`, tabulação ou hífen cercado de espaços. Lado
  esquerdo = idioma alvo (frase ou termo), lado direito = tradução/sentido.
- Linha sem separador **não vira material** — e isso é dito, nunca descartado em silêncio:
  "N sem separador ignoradas".
- Linhas em branco são ignoradas sem aviso.

---

## 1. Biblioteca — `(studio)/materiais`

**Funciona de verdade** (loader real, dados do banco). Dentro do layout do Studio, com a barra
lateral.

### O que a tela responde

"O que eu já tenho cadastrado, em que atividades cada coisa está, e onde eu mexo nisso sem abrir
uma atividade."

### Na tela

- **Título "Materiais"** + linha de totais: `N materiais · N em atividades` (quantos estão em
  uso de verdade — é o que o professor quer saber antes de apagar).
- **Busca** (texto livre, casa com o conteúdo principal e o secundário).
- **"Novo material"** — ação primária.
- **Filtros por tipo** (chips: Todos / Par de frases / Vocabulário / Texto / Diálogo) e **por
  idioma** (chips com os idiomas que aparecem na lista; some quando não há nenhum). Filtros são
  de tela: a biblioteca inteira já veio no loader, é dado do próprio professor.
- **A lista**, uma linha por material, com:

  | dado     | o que é                                                                                                            |
  | -------- | ------------------------------------------------------------------------------------------------------------------ |
  | Tipo     | pílula com o rótulo (Par de frases / Vocabulário / Texto / Diálogo)                                                |
  | Conteúdo | linha principal no idioma alvo (`font-content`) + linha secundária (tradução, sentido, começo do texto, "N falas") |
  | Idioma   | derivado das atividades que usam o material; "—" quando não está em nenhuma                                        |
  | Em uso   | "N atividades" (os títulos vão no `title` da célula) ou "nenhuma atividade"                                        |
  | Ações    | **Editar** (abre o painel preenchido) · **Apagar** (ícone de lixeira)                                              |

- **Paginação** de 12 por página (`Pagination.svelte`; só aparece com mais de uma página).
  Filtrar ou buscar volta para a página 1.
- **Vazio**: "Nenhum material ainda" com a explicação de que tudo que ele colar dentro de uma
  atividade também entra aqui — ou que pode começar pela biblioteca, em "Novo material".
  Filtro sem resultado: "Nenhum material bate com esse filtro."

### O painel "Novo material" / "Editar material"

Abre como **painel lateral** sobre a lista (não outra tela): cadastrar não pode tirar o
professor da lista, que é onde ele confere se o que acabou de digitar já estava lá. Fecha no X,
no fundo escurecido e sozinho no sucesso (deixá-lo aberto fazia parecer que não tinha salvo).

- **Seletor de tipo** (chips). Na edição os outros tipos ficam desabilitados, com o motivo no
  `title` (regra 3).
- **"Colar uma lista (um por linha)"** — toggle, só em par de frases e vocabulário, só ao criar.
  Troca o formulário por um `textarea` com placeholder de exemplo. Ao enviar: "N criados, N você
  já tinha, N sem separador ignoradas".
- **Formulário por tipo** (um campo por informação — o professor nunca vê JSON):
  - Par de frases: frase (alvo) · tradução · nota do professor.
  - Vocabulário: termo · sentido · frase de exemplo.
  - Texto: título · texto · lista de perguntas (pergunta + resposta, "+ Adicionar pergunta",
    remover por linha). Pergunta pela metade é descartada ao salvar.
  - Diálogo: lista de falas (falante + texto, "+ Adicionar fala", remover, reordenar). O falante
    da fala nova alterna A/B. Mínimo de duas falas.
- **Botão**: "Adicionar à biblioteca" / "Salvar alterações". Só libera com os obrigatórios
  preenchidos; enquanto espera o servidor mostra a `fila` e fica desabilitado.
- **Erro** de validação em texto ("Preencha a frase e a tradução.", "Dê um título ao texto.",
  "Um diálogo precisa de pelo menos duas falas.").
- **Reaproveitamento**: se o material idêntico já existia, nada novo é criado e a resposta diz
  `reused` — a lista não ganha linha nova.

### Apagar

Caixa de confirmação (`alertdialog`) no lugar, não `confirm()` do browser. Diz **em quantas
atividades** o material está e o que acontece: "Apagar remove ele da sua biblioteca e dos
rascunhos. As atividades que já estão no ar continuam intactas — elas guardam uma cópia
congelada." Botões: Cancelar / "Apagar mesmo assim" (com `fila` enquanto apaga).

### Remote functions (`materiais.remote.ts`)

`criarMaterial` · `criarMateriaisEmLote` · `atualizarMaterial` · `apagarMaterial`. Todas abrem
pelo guard do professor e escopam pelo `teacherId` via repositório.

---

## 2. Etapa 2 do wizard — `(studio)/atividades/[id]/materiais`

**Funciona de verdade.** É uma tela do WIZARD (`+page@.svelte`): sem a barra lateral do
Studio, com o `Stepper` (Detalhes → **Materiais** → Revisar → Publicar) e a barra de ações no
rodapé (`WizardShell`). Chega aqui quem acabou de criar a atividade na etapa 1 (título,
idioma alvo e de origem, quantas questões e quais habilidades) ou quem voltou da revisão.

### O que a tela responde

"Que conteúdo entra NESTA atividade — cole o que você usa em aula, ou traga o que já tem — e o
que ainda falta para gerar alguma coisa."

### Duas colunas

**Esquerda — "Adicionar material" (ou "Editar material")**: o mesmo formulário da biblioteca,
com os mesmos campos por tipo e o mesmo modo "Colar uma lista" (aqui como botão que alterna
"Colar uma lista" / "Um de cada vez"). Diferenças em relação ao painel da biblioteca:

- **Prévia do lote antes de enviar**: enquanto o professor cola, a tela conta com o mesmo
  parser do servidor quantas linhas viram material e quantas ficam de fora ("12 linhas · 10
  viram material · 2 sem separador"). O botão diz "Adicionar N materiais".
- **"O que ainda falta para gerar"** — uma linha sob o tipo escolhido, calculada sobre os
  materiais JÁ na atividade. Distrator sai sempre do próprio conjunto (kernel.md), então:
  - par de frases: "N frases · cada uma vira 3 exercícios";
  - vocabulário: "N de 2 termos. A alternativa errada sai de OUTRO termo seu — com um só, nada
    é gerado";
  - texto: "N de 2 perguntas no conjunto. A alternativa errada sai da resposta de outra
    pergunta sua";
  - diálogo: "cada diálogo vira um exercício de colocar as falas na ordem".
    Antes isso só aparecia na etapa 3, depois de gerar e ver "nada gerado deste material".
- **Retorno do envio**, em texto: "Você já tinha este material — ele foi reaproveitado da sua
  biblioteca, não duplicado" no unitário; "N adicionados, N já na sua biblioteca
  (reaproveitados), N sem separador ignoradas" no lote.
- Rodapé do formulário: "Todo material adicionado aqui também entra na sua biblioteca e pode
  ser reusado em outra atividade."

**Direita — "Materiais desta atividade"** (`N materiais`):

- Uma linha por material: pílula do tipo, conteúdo principal + secundário, **etiqueta
  "biblioteca"** quando o material está em mais de uma atividade (ou seja, veio da biblioteca
  ou já foi reaproveitado — sem a etiqueta, o contador não subia e parecia que a frase não tinha
  sido salva), e as ações **Editar** (carrega o formulário da esquerda com os campos crus, não
  com o resumo) e **Remover** (tira da ATIVIDADE; o material continua na biblioteca).
- Texto sem perguntas mostra na linha secundária "Sem perguntas — nada será gerado deste
  texto".
- **Vazio**: explica que é preciso ao menos um material para avançar.

### "Usar da biblioteca"

Botão no rodapé (e link "Da biblioteca" no cabeçalho da lista). Abre um painel ACIMA da lista
da atividade — não outra tela — com o que está na biblioteca e **ainda não está nesta
atividade** (`materiaisDisponiveis`):

- **Busca** e **filtro por tipo** (Todos / Par / Vocab / Texto / Diálogo).
- **Seleção múltipla**: a linha inteira alterna a marca (não um checkbox de 2px no fim).
- **"Trazer N materiais"** — um clique traz a seleção inteira (`usarDaBiblioteca` recebe uma
  LISTA, até 200 ids). Trazer LIGA o material à atividade; nada é copiado.
- Vazio: "Tudo que você tem já está nesta atividade" (ou biblioteca vazia).
- A lista rola dentro do painel (altura em proporção da viewport) para não empurrar a lista da
  atividade para fora da tela.

### Rodapé (barra de ações do wizard)

- **"Usar da biblioteca"** (neutro) — abre/fecha o painel acima.
- **"Gerar questões"** (primário) — desabilitado sem material; mostra a `fila` enquanto gera e
  leva para a etapa 3 (Revisar). Dica ao lado: "Precisa de ao menos 1 material para avançar."

### O que "Gerar questões" faz com os materiais (`gerarItens`)

1. Pega SÓ os materiais ligados a esta atividade.
2. Roda todos os geradores aplicáveis (kernel.md "Nível 2") sobre cada material, com os dois
   profiles de idioma e as capacidades do servidor: **sem TTS configurado não sai item de
   escuta, sem ASR não sai item de fala**.
3. Corta pelo plano da etapa 1 (`selectItems`): quantas questões (teto de 15) e quais
   habilidades. Fala e escuta ficam em 5 cada. **O rodízio é justo entre os materiais**: um
   material só ganha o segundo exercício depois de todos terem o primeiro — quem cola vinte
   frases quer as vinte na atividade, não sete variações das mesmas três. Com mais materiais do
   que vagas, alguns ficam de fora.
4. Se há vocabulário, um item de associação (termo ↔ sentido) fecha a atividade.
5. Grava como **rascunho** (substitui o rascunho anterior — regerar reescreve o que a etapa 3
   tinha) e **começa a sintetizar o áudio** das questões de escuta na hora, para a espera
   acontecer enquanto o professor revisa.

### Remote functions (`atividades.remote.ts`)

`adicionarMaterial` · `adicionarMateriaisEmLote` · `editarMaterial` · `removerMaterial`
(desliga da atividade) · `usarDaBiblioteca` · `materiaisDisponiveis` (query) · `gerarItens`.

---

## 3. O que NÃO existe hoje (para não desenhar em cima)

- Não há **importação de arquivo** (CSV, planilha, PDF): só colar texto.
- Não há **imagem** no vocabulário: `imageMediaId` existe no schema e não no formulário —
  depende de upload de mídia, que não existe.
- **Nota** do par de frases e **frase de exemplo** do vocabulário são guardadas mas ainda não
  alimentam gerador nenhum (kernel.md).
- Não há **etiquetas/pastas/coleções** na biblioteca: a organização é tipo, idioma e busca.
- Não há **áudio próprio** do professor por material (o TTS gera na publicação).
- Não há **seleção múltipla para apagar** na biblioteca: é um por vez, com confirmação.
- A biblioteca não mostra **em quais atividades** o material está de forma clicável — só a
  contagem e os títulos no `title`.
- Editar um material não avisa que outras atividades (rascunhos) vão ver a mudança (regra 4
  acima) — vale como pendência de tela.
