---
paths:
  - 'src/lib/kernel/**'
  - 'src/routes/(studio)/**'
  - 'src/routes/a/**'
---

# Kernel — modelo de exercícios

O kernel é TypeScript puro. Não importa Svelte, não importa Prisma, não faz I/O.
Roda igual no browser e no servidor. Toda função é pura e testável.

## O princípio central

**Não existe enum `tipoDeExercicio`.** Se você está criando uma tabela, uma classe ou um `switch`
por tipo de exercício, pare — a abstração está errada.

Todo exercício é a composição de três eixos independentes:

| Eixo            | Valores                                                                           |
| --------------- | --------------------------------------------------------------------------------- |
| **Prompt**      | `text` · `audio` · `image` · `composite`                                          |
| **Interaction** | `choice` · `assemble` · `type` · `cloze` · `match` · `order` · `select` · `speak` |
| **Grading**     | `exact` · `tolerant` · `sequence` · `set` · `asr` · `rubric`                      |

"Ouça e escreva" é `audio` + `type` + `tolerant`.
"Traduza a frase" é `text` + `assemble` + `sequence`.
"Ordene o diálogo" é `text` + `order` + `sequence`.

Oito interações vezes quatro prompts cobrem tudo que o produto precisa, sem escrever
32 implementações. **Tipo novo de exercício = entrada nova no registry, nunca migration.**

## Habilidade é derivada, não declarada

O professor nunca marca "isto é listening". A habilidade sai da combinação:

```
prompt.kind === 'audio'        → listening
interaction.type === 'speak'   → speaking
interaction.type ∈ {type,cloze}→ writing
prompt.kind === 'text'         → reading
```

Isso permite o Studio mostrar "sua atividade é 80% reading e 0% speaking" sem pedir nada ao
professor, e continua funcionando para qualquer idioma.

## Registry de interação

Cada tipo vive em `kernel/interactions/<id>.ts` e exporta:

```ts
export const assemble: InteractionType = {
  id: 'assemble',

  // o que o professor preenche — CONTÉM GABARITO, só existe no servidor
  authoringSchema: z.object({
    tokens: z.array(z.string()),
    distractors: z.array(z.string()).default([]),
    accepted: z.array(z.array(z.string())).min(1),
  }),

  // o que o aluno envia
  answerSchema: z.object({ sequence: z.array(z.string()) }),

  // payload seguro para o browser — SEM gabarito
  toRuntime: (payload, seed) => ({
    bank: shuffleWithSeed([...payload.tokens, ...payload.distractors], seed),
  }),

  grade: (payload, answer, profile) => Result<Score>,

  skills: (prompt) => Skill[],
};
```

`toRuntime` é a fronteira de segurança do produto inteiro. Toda interação tem teste provando
que a saída dele não contém nenhum elemento de `accepted`.

A única coisa que atravessa essa fronteira de propósito é `TextRuntime.blanks`, do `cloze`: o
COMPRIMENTO de cada lacuna em caracteres, para ela ter o tamanho da palavra que falta em vez de
um "___" igual para "a" e para "extraordinariamente". Vaza o tamanho, jamais as letras — e por
isso é um número, não um texto mascarado. Com mais de uma lacuna a medida é repartida em partes
iguais: dividir a resposta por espaço é a regra inviolável nº 5, e um idioma sem espaço
devolveria uma lacuna só do tamanho da frase inteira.

**As oito interações estão implementadas** (`kernel/interactions/*.ts`, registradas em
`registry.ts`). Três detalhes que só aparecem quando se implementa:

- **`grade` também recebe a `seed`.** Em `assemble`, `match` e `order` a resposta do aluno
  referencia ids atribuídos DEPOIS do embaralhamento. Um esquema de id estático pela ordem de
  autoria vaza o gabarito sozinho — em `match`, o esquerdo de índice 2 sempre parearia com o
  direito de índice 2, e bastava ler o payload para resolver. Por isso o id sai de
  `assignRuntimeIds` (`kernel/random.ts`), que embaralha ANTES de numerar, e `grade` recomputa
  o mesmo embaralhamento com a mesma seed.
- **`Prompt.text` de um item de áudio é gabarito.** É o texto que o TTS sintetiza, ou seja,
  exatamente a frase que o aluno deveria descobrir de ouvido. O enunciado visível vem de
  `Prompt.instructionKey` — uma CHAVE, porque o kernel não carrega copy de interface. Quem
  traduz é `server/player/runtime.ts`. Existe também `Prompt.instruction`: o enunciado que o
  professor escreveu no editor, que ganha da copy padrão da chave. Ele é conteúdo do professor,
  não string de interface, e por isso pode estar em qualquer idioma — quem resolve os dois é
  `promptInstruction()`, num lugar só.
- **O registry guarda a versão "type-erased"** (`RegisteredInteraction`): recebe `unknown` e
  valida com o `authoringSchema` antes de delegar, porque o payload vem de uma coluna `Json`.

## Forma do Item

```jsonc
{
	"id": "itm_01",
	"sourceContentId": "cnt_07", // null se autoria manual
	"generatedBy": "listen-type", // null se autoria manual
	"prompt": { "kind": "audio", "mediaId": "med_ab", "text": "Wo ist der Bahnhof?" },
	"interaction": { "type": "type", "payload": {/* validado pelo authoringSchema */} },
	"grading": { "mode": "tolerant", "tolerance": 0.9 },
	"locale": { "source": "pt-BR", "target": "de-DE" }
}
```

`payload` é JSON no banco. **Nunca confie no tipo do Prisma para JSON** — passe pelo Zod ao ler.

`grading.answerLang` (`source` | `target`, padrão `target`) diz **em qual das duas línguas o
aluno responde**. Quase sempre é a alvo, mas `translate-type` mostra a frase em inglês e
espera a tradução em português: ali é `source`. Sem esse campo, `responderItem` corrigia toda
resposta com o profile do idioma ALVO — normalizava o português com regra do inglês (o acento
de "você" sumia por uma tolerância que é do inglês) e, pior, tokenizaria uma resposta japonesa
com o segmentador errado, que devolve lixo.

## O que o professor realmente informa

Este é o ponto de produto mais importante do sistema. **O professor não preenche exercício por
exercício.** Ele cadastra conteúdo e o sistema gera.

### Nível 1 — ContentUnit (o input real)

Quatro formas, e nenhuma exige conhecimento técnico:

| Tipo           | Campos que o professor digita                                 |
| -------------- | ------------------------------------------------------------- |
| `SentencePair` | frase na língua de origem, frase na língua alvo, nota (opc.)  |
| `VocabItem`    | termo, tradução, imagem (opc.), frase de exemplo (opc.)       |
| `Passage`      | texto na língua alvo, título, perguntas de compreensão (opc.) |
| `Dialogue`     | linhas `{ falante, texto }` na ordem correta                  |

Áudio nunca é campo de entrada obrigatório: sai do TTS na publicação.
O professor pode subir áudio próprio para sobrescrever.

**A tradução também não precisa ser digitada** quando há tradutor (server.md "Tradução do
material"): ela continua OBRIGATÓRIA no schema (`source` e `translation` com `min(1)`), mas quem a
preenche, quando chega em branco, é o servidor — antes de validar. O kernel segue puro: o único
reflexo aqui é `parseRawMaterial(kind, raw, { traduzirSemSeparador })`, que deixa a linha sem
separador entrar com a tradução vazia em vez de descartá-la (e `previewRawLines` a marca como
`automatica`). Sem a opção, o comportamento é o de sempre.

Os campos opcionais NÃO são decorativos e a etapa 2 os coleta: `Passage.questions` é o que
`passage-comprehension` consome — sem elas o texto entra na lista e não gera nada. `note` e
`example` ainda não alimentam gerador nenhum; são contexto do professor, e existem no schema
para os geradores de `VocabItem` que faltam (`vocab-image-choice`, `speak-vocab`).
`imageMediaId` continua fora do formulário: depende de upload de mídia, que não existe.

### Nível 2 — geradores

`(ContentUnit, LanguageProfile) => Item[]`. Função pura, sem I/O, em `kernel/generators/`.

De **um** `SentencePair` saem:

| Gerador              | Prompt        | Interação  | Habilidades         |
| -------------------- | ------------- | ---------- | ------------------- |
| `translate-assemble` | text (origem) | `assemble` | reading             |
| `translate-type`     | text (alvo)   | `type`     | reading + writing   |
| `listen-assemble`    | audio (alvo)  | `assemble` | listening           |
| `listen-type`        | audio (alvo)  | `type`     | listening + writing |
| `listen-choice`      | audio (alvo)  | `choice`   | listening           |
| `cloze-target`       | text (alvo)   | `cloze`    | reading + writing   |
| `speak-target`       | text (origem) | `speak`    | speaking            |

De `VocabItem`: `vocab-choice`, `vocab-image-choice`, `listen-vocab-choice`, `vocab-match`,
`vocab-type`, `speak-vocab`.
De `Passage`: `passage-cloze`, `passage-comprehension`, `select-in-text`.
De `Dialogue`: `order-lines`, `listen-dialogue-choice`, `roleplay-speak`.

Vinte frases cadastradas viram cerca de cem exercícios. O professor revisa, edita e descarta —
ele nunca vê JSON.

**Implementados hoje**: os sete de `SentencePair`, mais `vocab-choice`,
`passage-comprehension` e `order-lines` — um por tipo de conteúdo, o bastante para provar que o
padrão não depende do `kind`. Os outros oito da tabela continuam pendentes.

Mais o **`closing-match`**, que não está na tabela porque não é um gerador de unidade:

### `closing-match` — a associação que fecha a atividade

O único gerador que olha o LOTE inteiro em vez de uma unidade. Ele monta UM item de `match`
com material que apareceu ao longo do caminho — uma revisão do que o aluno acabou de ver — e
entra sempre por ÚLTIMO (`selectItems` reserva a vaga dele fora do rodízio; no meio da lista
não haveria o que revisar). Por isso `runGenerators` devolve `{ groups, closing }`.

A interação `match` existia no registry desde o começo, com grader, `toRuntime` e componente —
e **nenhum gerador a produzia**, então nenhum aluno chegou a ver uma.

**Associação é exercício de PALAVRA**: ligar frases inteiras é outra coisa, e mais fraca — o
aluno casa pelo tamanho do cartão antes de ler. (A primeira versão caía para frase ↔ tradução;
o dono do repositório cortou a queda.) Os pares vêm de duas fontes, nesta ordem:

1. **O vocabulário cadastrado** (`VocabItem`, termo ↔ sentido) — a palavra e o sentido que o
   professor escreveu. Tem a vez; com cinco termos ou mais, o fecho é todo dele.
2. **Palavras das frases da atividade, com a tradução do tradutor** (`palavrasTraduzidas`, pedido
   do dono do repositório quando o tradutor entrou — adr-006). O kernel continua sem saber que
   "manager" é "gerente": quem escolhe as palavras é `palavrasParaAssociar`
   (`content/palavras.ts`, puro e agnóstico — segmentador do idioma, sem número, sem nome próprio
   no meio da frase, sem a palavra que aparece em mais da metade das frases, a mais longa
   primeiro), e quem traduz é o SERVIDOR (`server/atividades/pares-de-palavras.ts`). **Só fica o
   par que faz a ida e volta**: palavra solta não tem contexto, e o tradutor errou justamente aí
   ("working" → "em funcionamento", "です" → "Sim, sim"); traduzido de volta, o sentido precisa
   dar a mesma palavra. Par que volta igual nos dois idiomas ("hotel" ↔ "hotel") também cai.

Sem tradutor (e sem vocabulário), vale a consequência de antes: **a atividade não ganha o item de
fecho.** Melhor nenhum do que um exercício que não é o que promete.

Teto de cinco pares (duas colunas num celular; acima disso o aluno rola para achar o par),
piso de dois (menos que isso não é associação, e o `authoringSchema` recusa), par repetido
descartado (com dois "livro" à direita, duas ligações ficam igualmente certas e o aluno perde
ponto por acertar) e seleção determinística a partir da seed da atividade.

A assinatura real é `(ContentRef<D>, GeneratorContext<D>) => Item[]`: o contexto carrega os dois
profiles, as `siblings` (única origem de distrator) e `capabilities`. O kernel é puro e não lê
`env`, então quem informa se existe provedor de TTS/ASR é o servidor — **sem ASR não sai item de
fala; sem TTS não sai item de escuta**, em vez de gerar exercício que não corrige nem toca.

### O corte: `selectItems`

Os geradores produzem a matéria-prima; o que vira rascunho é o que o professor pediu na etapa 1
(`generators/select.ts`). Sem isso, 20 frases viravam cem exercícios e ele descartava 88 na mão.

- **Teto duro de 15 questões por atividade** (`MAX_ITENS`) — acima disso o aluno abandona no
  meio e o relatório do professor fica pela metade.
- **Fala e escuta ficam em 5 cada** (`TETO_POR_HABILIDADE`): cada item de escuta é um par de
  arquivos de TTS a sintetizar e esperar, e cada um de fala é uma gravação que o aluno precisa
  de silêncio para fazer. Uma atividade inteira de qualquer um dos dois é o que sai por
  acidente quando o material é todo do mesmo tipo.
- **Um item entra se todas as habilidades que ele EXIGE foram pedidas**, não se alguma foi.
  "Ouça e escreva" é listening + writing: quem desmarcou escrita não quer digitar, mesmo que o
  exercício também treine escuta — a regra frouxa devolveria justamente o que ele tirou da
  mesa. **`reading` vinda do enunciado é a exceção e não veta**: ela sai de qualquer prompt de
  texto, ou seja de quase tudo, e um exercício de FALA mostra a frase escrita para o aluno
  dizer — é `[reading, speaking]`. Com a regra literal, marcar só "fala" devolvia uma atividade
  VAZIA, porque não existe exercício em que não se leia nada. Item cuja ÚNICA habilidade é
  leitura continua exigindo que ela tenha sido marcada.
- **Cada habilidade pedida ganha uma vaga antes do rodízio.** O rodízio anda por POSIÇÃO na
  fila, e as filas saem na ordem dos geradores, com `speak-target` no fim: com mais materiais
  do que vagas, o alvo era atingido antes de a vez dele chegar, e "escuta e fala" virava cinco
  de escuta e nenhuma de fala.
- **O rodízio desloca o ponto de partida por material.** Sem isso todo material entrega primeiro
  o MESMO exercício, e uma atividade de dez questões saía com as dez do mesmo tipo, uma por
  frase.
- **Rodízio entre os materiais**, um item de cada por volta: em sequência, 20 materiais com
  alvo de 12 dariam uma atividade inteira sobre as duas primeiras frases.
- **E o rodízio é JUSTO: um material só ganha o segundo exercício depois de TODOS terem o
  primeiro** — contando o que a passada de cobertura já tirou dele, que por sua vez pega a vaga
  de cada habilidade do material que MENOS deu até ali. Pedido do dono do repositório: quem cola
  vinte frases quer as vinte na atividade, não sete variações das mesmas três. Antes, o que a
  cobertura tirava de um material não contava, e ele voltava a ser servido na primeira rodada
  enquanto as frases do fim da lista ficavam sem vaga. Quando há mais materiais do que vagas,
  alguns ficam de fora — isso é inevitável; o que não acontece mais é um repetir enquanto outro
  nem entrou.
- Determinístico de ponta a ponta — mesma entrada, mesma seleção.

### Nível 3 — autoria manual

Para quando o professor quer algo específico. Ele escolhe a interação e o formulário é
**gerado a partir do `authoringSchema`**. Tipo novo nasce com tela de edição sem escrever UI.

## Distratores: a regra que mantém tudo agnóstico

**Distratores saem sempre do próprio conjunto de conteúdo do professor**, nunca de dicionário,
nunca de heurística de língua.

- `choice`: as alternativas erradas são outras frases/termos do mesmo conjunto
- `assemble`: os tokens extras vêm de outras frases do mesmo conjunto
- `match`: os pares errados são outros itens do mesmo conjunto

Isso resolve dois problemas de uma vez: os distratores ficam plausíveis (mesmo tema, mesmo
nível) e o gerador nunca precisa saber alemão. Se o conjunto tem menos itens que o necessário,
o gerador **retorna menos exercícios** — nunca inventa distrator.

## Respostas aceitas

Toda questão aceita várias respostas válidas. Resposta única é a maior fonte de frustração em
app de idioma e faz o professor abandonar o produto.

- O professor informa a resposta principal.
- O sistema propõe variantes (contrações, ordem alternativa, com e sem diacrítico) e ele aprova
  com um clique. As variantes saem de transformações do `LanguageProfile`, não de conhecimento
  de língua embutido.

**Na questão de TRADUÇÃO para a língua do aluno, as variantes vêm do tradutor** (pedido do dono do
repositório: "Nunca desista dos seus sonhos" dava quase contra "Nunca desista de seus sonhos").
Elas nascem ao GERAR os itens, nunca na correção, e entram em `accepted` depois da resposta do
professor — o editor de item as mostra em "Também aceitas", cada uma com o X de remover, e a
revisão diz "aceita mais N respostas". O kernel só decide o TAMANHO da diferença
(`grading/variantes.ts`, `variantesProximas`: Dice de palavras ≥ 0,7, no máximo duas palavras a
mais ou a menos, nada que o normalizador já iguale, teto de três); quem pede as candidatas e
confere o sentido é o servidor (`server/atividades/variantes-aceitas.ts`, server.md "Tradução do
material").

- **Só com `answerLang: 'source'`.** No idioma alvo o que se ensina é a FORMA: para "Ela trabalha
  aqui há dois anos" o tradutor propõe "She works here for two years", e numa aula de present
  perfect continuous essa não pode virar certa.
- **Nunca o tradutor como corretor.** Medido: traduzir a resposta do aluno de volta e comparar
  aceitaria "She have been working here" e "Never gives up on you dreams" — o modelo conserta o erro
  antes de traduzir, e o erro é o que o exercício cobra.
- **O sujeito que a língua omite** (`LanguageProfile.sujeitoOmitivel`: português, espanhol e
  italiano, só a primeira pessoa, onde a conjugação não deixa dúvida). "Estou ansioso" e "Eu estou
  ansioso" são a mesma frase, e o aluno que escreveu a segunda recebia "quase" (o caso do dono do
  repositório). **Na correção** (`tolerantScore`, `grading/sujeito.ts`): se alguma resposta aceita
  começa com um desses pronomes, a questão aceita com e sem ele, em qualquer variante — nunca um
  pronome que nenhuma aceita traz ("nós estou" não vira "estou"), e nunca o de um sujeito composto
  ("eu e meu irmão", pelas `conjuncoes` do profile). Vale na hora para o que já foi publicado,
  quando o professor escreveu o pronome. **Na geração** (`candidatasComSujeito`): o feixe do
  tradutor não garante esse par — para "I'm looking forward to the weekend" ele só variava gênero e
  preposição —, então, quando a resposta do professor não traz o sujeito, o servidor propõe a forma
  com cada pronome e a ida e volta escolhe o certo ("Nós estou…" volta como "We look forward…" e
  cai; "Eu está chovendo" volta como "I'm raining"). Fica no máximo uma, antes das do feixe e fora
  do teto delas.

## LanguageProfile

Toda especificidade de idioma vive aqui, em `kernel/language/profiles/`:

```ts
type LanguageProfile = {
	tag: string; // 'ja-JP'
	direction: 'ltr' | 'rtl';
	segmentation: 'icu-word' | 'icu-grapheme';
	normalizers: Normalizer[]; // ['nfkc', 'lowercase', 'strip-punct']
	diacritics: 'significant' | 'tolerant';
	caseSensitive: boolean;
	tts: { voices: string[]; speeds: number[] };
	asr: { model: string; hints: string[] };
	equivalences: string[][]; // [['7', 'seven'], ['vai', 'irá'], ['i am', 'im']]
	input: EntradaDoIdioma; // como o aluno DIGITA neste idioma — ver "Entrada" abaixo
	sujeitoOmitivel?: { pronomes: string[]; conjuncoes: string[] }; // ver "Respostas aceitas"
};
```

**`equivalences` é a única lista de "sinônimos" do produto, e é do PROFILE.** Cada grupo são
formas que a língua trata como a mesma coisa; o normalizador troca as variantes pela canônica no
fim do funil (`normalize()`), então as duas pontas viram o mesmo texto antes de qualquer régua.
Dois usos: **numerais** — o ASR escreve "7" onde o aluno disse "seven" e a frase alvo tem
"seven"; era um "quase" por um acerto (`numerais()`, em `language/equivalences.ts`, gera os
grupos de 0 a 99) — e **formas gramaticais intercambiáveis**: "irá trabalhar" e "vai trabalhar",
"I'm" e "I am", e o artigo opcional antes do possessivo em português ("dos seus sonhos" e "de seus
sonhos"; o "a" do feminino singular solto fica de fora, porque pode ser a preposição). A lista é curta de propósito e cada entrada é uma decisão de que o professor não
quer distinguir aquelas formas; as contrações cuja forma sem apóstrofo é outra palavra ("were",
"well", "ill", "its") ficam FORA. Sinônimo de vocabulário continua sendo "Respostas aceitas", que
o professor cadastra.

`tts.voices` é uma LISTA porque a voz VARIA entre as frases de uma mesma atividade — quem
escolhe é `vozDoTexto` (`language/voice.ts`), a partir do TEXTO, de forma determinística. Do
texto e não do material: o áudio é identificado pelo conteúdo (db.md), então a mesma frase é o
mesmo arquivo venha de onde vier.

**A lista é filtrada pela NOTA do modelo, não pelo tamanho do catálogo.** O Kokoro publica um
grau por voz (VOICES.md) e a maioria é D ou pior — pouco material de treino, som artificial.
Entram só as de C+ para cima: em inglês são nove, seis femininas e três masculinas, porque o
modelo não tem voz masculina americana acima de C+. Houve uma versão com quatro vozes em que uma
delas era `am_adam`, **grau F+, a pior do catálogo inteiro** — um quarto do áudio em inglês
saía nela. Numa questão de escuta o aluno perde o exercício por causa da voz, não da língua. Lista vazia significa que o provedor não fala aquele idioma (árabe hoje), e aí
o gerador não produz item de escuta em vez de enfileirar um TTS que vai ser recusado.

Perfis concretos em `kernel/language/profiles/`: **os nove idiomas que o Kokoro fala** —
`pt-BR`, `es-ES`, `en-US`, `en-GB`, `fr-FR`, `it-IT`, `hi-IN`, `zh-CN`, `ja-JP` — mais `ar-SA`,
que entra sem voz. A fonte de qual idioma o modelo fala é `audiotext-service/app/voices.py`, e
`profiles.test.ts` confere que nenhum idioma de lá ficou de fora.

**Inglês americano e britânico são DOIS profiles**, e não uma opção dentro de um: para o Kokoro
eles são idiomas diferentes (`lang_code` `a` contra `b`), então a voz de um não sintetiza o outro.
A correção é idêntica — numerais e contrações moram em `profiles/en-comum.ts`, que os dois
importam, porque duas listas de sessenta linhas divergem no primeiro acréscimo. O que NÃO é
equivalência é a ortografia que de fato difere (`colour`/`color`): igualá-las diria ao aluno de
inglês britânico que "color" está certo.

`languageLabels` no `index.ts` é o único lugar que liga o rótulo em português que o professor vê
("Inglês (EUA)") à tag técnica — a tela nunca conhece a tag. **As telas ITERAM esse objeto**: os
`<select>` de `atividades/nova` tinham os `<option>` escritos à mão e ficaram para trás — o de
idioma alvo oferecia três dos cinco idiomas cadastrados, e não havia como criar atividade de
espanhol. Acrescentar um idioma ali tem de ser tudo o que um idioma novo precisa.

**O corte por nota só está aplicado onde existe nota.** O Kokoro publica grau por voz para inglês
americano e japonês, e é onde `en-US` e `ja-JP` filtram (os graus estão em comentário, voz por
voz). Para `en-GB`, `fr-FR`, `it-IT`, `hi-IN` e `zh-CN` nenhuma nota foi verificada — a lista é o
catálogo que o provedor aceita, com a pendência marcada no próprio profile, que é o mesmo estado
em que `es-ES` e `pt-BR` sempre estiveram.

`diacritics: 'tolerant'` não é só documentação: `normalize()` descarta os marks combinantes
quando o profile diz isso, então "cafe" bate com "café" onde o idioma pede, e não bate onde não
pede (`pt-BR` é `significant`).

**`tolerant` é o padrão ERRADO fora do alfabeto latino, e isso foi um bug de produção.** Ele
descarta toda marca combinante (`\p{Mn}`), e há escrita em que a marca não é acento — ela é parte
da letra:

- **Japonês**: o dakuten é marca combinante. O `ja-JP` nascera `tolerant`, e o efeito medido era
  `が` virar `か`, `がっこう` (escola) virar `かっこう`, e **`ば` e `ぱ` virarem as duas `は`** —
  palavras diferentes comparando IGUAIS, ou seja aluno aprovado escrevendo outra palavra. Não
  havia ganho do outro lado: o IME do aparelho e o teclado de kana (a tecla `゛`) produzem o
  dakuten. Hoje é `significant`.
- **Híndi**: as matras e o virama do devanágari são marcas, e o devanágari MISTURA as categorias
  Unicode — `ि` é `Mc` e sobrevive, `ु` é `Mn` e não. O estrago de `tolerant` seria SELETIVO
  (algumas vogais somem, outras não), que é o pior tipo de bug para achar.
- **Chinês**: o han não tem marca nenhuma, mas o PINYIN tem, e tom é fonêmico — `nǐ`, `ní` e `nì`
  são palavras diferentes.

A pergunta para um idioma novo não é "o aluno tem a tecla?", é **"existe par de palavras que se
distingue só pela marca?"**. Existindo, é `significant`. O árabe é o contraexemplo legítimo: o
tashkeel é omitido na escrita corrente, então ali `tolerant` está certo.

Quem tranca tudo isso é `normalize-idiomas.test.ts`, um bloco por escrita.

Armadilhas já conhecidas, todas resolvidas dentro do profile:

- **Turco** tem regra própria de maiúscula/minúscula. Nunca `toLowerCase()` sem locale.
- **Árabe e hebraico** são RTL — só CSS `dir`, mas precisa existir desde o começo.
- **Chinês** simplificado e tradicional: trate como resposta alternativa aceita.
- **Japonês, chinês, tailandês** não têm espaço entre palavras. `Intl.Segmenter`, sempre.
- **Hífen não sobrevive ao `strip-punct`, e ele NÃO virá espaço.** As formas de `equivalences`
  têm de estar escritas como chegam à comparação: em francês, `dix-sept` vira `dixsept`, então a
  variante hifenizada nunca casaria. `profiles.test.ts` confere que toda variante já está na
  forma normalizada.
- **`lowercase` só onde existe caixa.** Em japonês, chinês, híndi e árabe ele não tem efeito e
  só confunde quem lê o profile.

### Entrada: como o aluno digita (`LanguageProfile.input`)

Questão de digitar no idioma alvo pressupõe que o aluno CONSEGUE digitar nele. Com o teclado
do celular em português isso vale para o inglês e mais nada. O profile diz qual das quatro
situações é a do idioma (`language/teclado.ts`); os layouts moram em `language/teclados.ts`:

| `modo`    | Idiomas                            | O que acontece                                                      |
| --------- | ---------------------------------- | ------------------------------------------------------------------- |
| `nativo`  | `en-US`, `en-GB`                   | nada — o teclado do aparelho basta                                  |
| `acentos` | `pt`, `es`, `fr`, `it`             | BARRA de acentos sob o campo; o teclado do aparelho continua aberto |
| `grade`   | `ar-SA`, `hi-IN`, `ja-JP`, `zh-CN` | o teclado inteiro do script, que substitui o do aparelho            |
| `ime`     | —                                  | nenhum teclado, e o gerador não pede para digitar no alvo           |

**O teclado aparece em toda questão de escrever NO IDIOMA ALVO, e só nela** — pedido do dono do
repositório. "Traduza para o português" (`translate-type`, `answerLang: 'source'`) não tem
teclado: ali o aparelho é do aluno.

**Japonês e chinês escrevem a LEITURA.** Kanji e hanzi não se digitam sem IME (o aluno escreve a
leitura e escolhe o caractere), e um IME dentro do Player seria um dicionário no bundle do aluno.
Então o teclado é de kana e de pinyin, e o que torna a questão respondível é a **transcrição**:
o profile declara `input.transcricao` (`kana` | `pinyin`), e o SERVIDOR
(`server/escrita/transcritor.ts` — kuromoji para kana, pinyin-pro para pinyin) escreve a leitura
da frase, que entra no gabarito como resposta aceita (`comLeituraAceita`, `language/escrita.ts`):
`明日友達に会います` aceita `あしたともだちにあいます`; `我们还没决定` aceita
`wǒmen hái méi juédìng`. Sem ela, kana contra o gabarito em kanji dá **zero** — medido.

- A leitura é pela FRASE, não pela palavra: `会` sozinho é `kai`, em `会います` é `a`; `行` é
  `háng` em 银行 e `xíng` em 行走. Na lacuna do `cloze` o transcritor recebe a frase em volta
  (`TrechoDaFrase`); lacuna que corta a palavra ao meio fica SEM leitura — ler metade de uma
  palavra seria inventar.
- Ela entra DEPOIS do gabarito, que continua sendo o que o aluno vê como "a resposta esperada", e
  fica visível e editável no editor de item. **Se alguma resposta aceita já cabe no teclado, nada
  é recalculado** — a leitura que o professor corrigiu vence.
- **Na geração** (`runGenerators`, opção `transcrever`) ela vai para o item. **Na correção**
  (`payloadParaCorrigir`, `server/escrita`) ela é calculada de novo, sem gravar, para o que foi
  publicado ANTES de ela existir — é o que faz uma atividade antiga aceitar a resposta em kana
  sem republicar (regra nº 7 intacta). As duas pontas — `responderItem` e o "por quê" do
  resultado — corrigem igual.
- `ja-JP` e `zh-CN` têm `strip-space` nos normalizers: espaço não separa palavra ali, e o
  pinyin se divide de jeitos diferentes em livros diferentes (`wǒ shì xuéshēng`,
  `wǒshì xuéshēng`). O `zh-CN` ganhou `lowercase` pelo mesmo motivo: `Wǒ` é `wǒ`.

**O gerador só pede para digitar o que o teclado escreve.** `runGenerators` descarta todo item de
`type`/`cloze` com `answerLang` `target` quando o idioma é `ime`, ou quando é `grade` e
**nenhuma resposta aceita — leitura incluída — cabe no alcance do teclado** (`tecladoAlcanca`,
`language/alcance.ts`: tudo que as teclas escrevem, em cada variante e pelas teclas de ação,
comparado DEPOIS do normalizador dos dois lados — o `。` final e o tashkeel não precisam de
tecla, e a hamza que a correção funde conta como alcançada). Sem transcritor (o kernel testado
sozinho, ou o dicionário que não carregou), a frase em kanji/hanzi segue por "montar a frase" em
vez de virar uma questão que o teclado não responde. A regra é do ITEM, não de um gerador.

**O kana é a tabela gojūon** (`teclados.ts`): uma coluna por consoante, uma linha por vogal, com
as casas vazias (`yi`, `wu`) no lugar — é a posição que o aluno decorou, e por isso o grupo tem
`colunas` fixas e `null` nas casas vazias. `゛` `゜` `小` são **teclas de ação** (`Tecla.acao`,
`trocar-anterior`): trocam a letra antes do cursor em vez de ocupar teclas próprias (46 teclas,
não mais de 70), e desfazem na segunda vez. O katakana é uma **variante** das mesmas teclas
(`Teclado.variantes`), não um segundo layout. O **pinyin** é QWERTY (é nele que o aluno vai
digitar fora daqui) com quatro teclas de tom de ação — `a` e depois `ˇ` dá `ǎ` —, e a
`Teclado.dica` diz isso no próprio teclado. Tudo isso é DADO serializável — o teclado viaja no
item, do servidor para o browser.

**Pronúncia nas teclas** (`Tecla.leitura`: `ka`, `sh`, `kha`) e a linha **"Leitura"** sob o campo
(`leituraDoTexto`, `language/leitura.ts`, que romaniza o que o ALUNO digitou) existem para ele
achar a letra antes de decorar o alfabeto. A romanização não é letra a letra em todo script — no
kana `っ` dobra a consoante e `きゃ` é `kya`; no devanágari a consoante carrega um "a" que a matra
troca e o virama apaga —, e é por isso que ela mora na camada de idioma, com teste.

O teclado **não é gabarito** — é o alfabeto — e chega ao browser pelo mesmo portão do resto
(`RuntimeItem.teclado`, `server/player/runtime.ts`), só em `type`/`cloze` respondidos no alvo.
Três regras para quem cadastrar um layout:

- **Toda tecla tem de chegar à correção.** Tecla que o normalizador descarta é tecla que o aluno
  toca à toa, e onde a marca é `significant` ela tem de chegar igual a ela mesma
  (`teclados.test.ts`).
- **Dígito de outro sistema só entra se o profile o liga ao ocidental.** Os devanágaris entram
  (o `hi-IN` tem a equivalência); os arábico-índicos (`٠-٩`) NÃO — o `ar-SA` não os liga, e `٥`
  não casaria com um gabarito `5`. Acrescentar a equivalência é o que os libera.
- **No árabe as letras com hamza (`أ إ آ ؤ ئ`) chegam à correção como a letra-base**, porque a
  hamza é marca combinante e o `ar-SA` é `tolerant`. É a normalização padrão da língua, não um
  descuido — a hamza sobre o alif é omitida na escrita corrente. As teclas existem porque são a
  grafia correta; só não são exigidas.

## Correção

Camadas, da mais barata para a mais cara. Use sempre a mais barata que resolve:

1. `exact` / `sequence` / `set` — normaliza e compara. Cobre a maior parte.
   **Toda nota parcial ou zero vem com explicação**: devolver a nota e mais nada deixava quem
   montava a frase errada com um "Quase." sozinho.
   Em `sequence` e `set`, a explicação são **marcas, não uma contagem**: `Score.marks` traz a
   resposta do aluno pedaço a pedaço com `ok` por posição, e a tela grifa o que saiu do lugar
   dentro da frase que ele montou (ou a ligação que não fechou, no `match`).
   Junto vem `Score.expected`: a resposta CERTA, também pedaço a pedaço. Marcar o erro sem
   dizer o certo deixa metade do retorno de fora — o aluno via que a 5ª palavra estava torta e
   continuava sem saber qual era. É uma LISTA e não uma frase pronta: juntar os pedaços com
   espaço é a regra inviolável nº 5 pelo avesso, e em japonês sairia errado; quem monta a linha
   é a tela. Sendo gabarito, sai pelo mesmo portão do resto do veredito — só com `showResult`. A versão anterior contava ("8 de 9 palavras na posição certa; a
   primeira fora de lugar é a 5ª") e obrigava o aluno a recontar a própria frase para achar
   qual era a 5ª.
   As marcas são as palavras que ELE escolheu — as mesmas que já estavam na tela dele. O
   gabarito continua fora (há teste provando que nenhum token correto entra ali).
   A mensagem também **não repete o veredito**: quem escreve "Quase." é a tela
   (`AnswerFeedback`), e o resultado saía "Quase. Quase — a resposta esperada era…".
2. `tolerant` — feedback dizendo qual era a resposta esperada, e **TRÊS réguas de
   proximidade; vale a mais generosa das três**. Cada uma cobre um erro que as outras não
   veem:

   | Régua                       | Mede                | Existe porque                               |
   | --------------------------- | ------------------- | ------------------------------------------- |
   | `TOLERANT_THRESHOLD` (0,82) | razão de caracteres | frase longa com vários deslizes             |
   | `errosPermitidos`           | distância de edição | resposta CURTA com um deslize só            |
   | `LIMIAR_PALAVRAS` (0,65)    | Dice sobre PALAVRAS | tradução válida escrita com outras palavras |

   A razão sozinha punia quem responde curto: uma letra a menos em "lives" dá 0,80 e caía em
   errado seco, enquanto a mesma letra numa frase de trinta caracteres passava tranquila — o
   mesmo deslize com dois pesos. Abaixo de quatro caracteres não há margem nenhuma: em "a"
   contra "o", um caractere de diferença é a palavra inteira, não um dedo torto.

   **A régua de palavras é a que faltava.** Levenshtein mede toques de tecla, então uma
   tradução igualmente válida com outras palavras — "ela vai te ligar mais tarde" no lugar de
   "ela vai ligar para você mais tarde" — explodia em treze edições e caía como resposta
   aleatória, mesmo com cinco das sete palavras no lugar. Trocar uma palavra custa o
   comprimento dela em caracteres; ali custa 1. É Dice sobre os MULTICONJUNTOS de palavras:
   repetição conta, ordem não (quem cuida de ordem é o `sequenceScore`, e uma tradução válida
   costuma reordenar). Tokeniza pelo `Intl.Segmenter` do profile — regra inviolável nº 5:
   com `split(' ')` a frase japonesa viraria um token só e a régua nunca sairia de 0 ou 1.

   Ela **só vale para frase** (`MIN_PALAVRAS_PARA_A_REGUA`, 5 palavras). Em resposta curta não
   há reescrita: "I have a pen" contra "I have a book" dá 0,75 e a palavra trocada é
   exatamente o que a questão testava — chamar isso de "quase" premiaria o erro.

   O que **não** é erro de idioma vira igualdade no normalizador, não tolerância: espaço
   repetido, espaço nas pontas e o espaço que sobra quando `strip-punct` come uma vírgula
   são colapsados em `normalize()` (regra nº 6), então nem chegam a custar uma edição.

   Nada disso vira **certo**: quem escreveu outra tradução válida recebe `partial` com a
   resposta esperada ao lado. Aceitar de verdade depende de a variante estar em `accepted` —
   cadastrada pelo professor ou proposta pelo tradutor ao gerar ("Respostas aceitas", acima). O
   kernel não sabe sinônimo e não pode fingir que sabe. A exceção são as `equivalences` do
   profile ("vai"/"irá", numeral por extenso e dígito): elas
   são igualdade no normalizador, não tolerância, e por isso "Você irá trabalhar amanhã" contra
   "Você vai trabalhar amanhã?" é CERTO, não quase.

3. `asr` — transcreve e compara normalizado.
4. `rubric` — LLM com rubrica, retorna JSON estruturado. Só para escrita livre, em fila,
   com cache por hash da resposta. Fora do MVP.

**`speak` nunca reprova de forma dura.** ASR tem taxa alta de falso negativo com sotaque
não-nativo, que é exatamente o público. Score parcial, destaque da palavra provavelmente errada,
e o botão de pular sempre disponível — por acessibilidade e por ambiente barulhento. A palavra
destacada é a do alvo COMO ESTÁ ESCRITA ("repare em seven", não "em 7"): o grader normaliza a
frase inteira antes de tokenizar — é o que faz as equivalências do profile valerem para a
palavra que faltou também.
