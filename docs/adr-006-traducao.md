# ADR-006 — Tradução automática do material (MADLAD-400 no serviço de áudio)

**Estado:** aceito · novembro de 2026

## Contexto

O professor cadastrava cada par de frases e cada termo DUAS vezes: a frase no idioma que ensina e a
tradução na língua do aluno. Colando uma lista, a linha sem tradução era descartada. O dono pediu
que o padrão passe a ser: o professor sobe o material no idioma ensinado e o produto traduz —
podendo ele ainda escrever a tradução que quiser, ou usar a IA.

Restrições que decidiram o resto:

- **Licença de uso comercial.** É um SaaS pago.
- **CPU, não GPU.** O servidor de produção tem 4 vCPU e 16 GB, divididos com banco, MinIO, a
  aplicação e o serviço de áudio (Whisper + Kokoro).
- **Os dez idiomas do produto, em qualquer direção.** pt, es, en (EUA e Reino Unido), fr, it, hi,
  zh, ja e ar. A língua do aluno quase sempre é o português, mas o produto é agnóstico de idioma.
- **De preferência um modelo só** para todos os idiomas (pedido do dono).

## Decisões

### 1. O modelo: MADLAD-400 3B, em int8 para o CTranslate2

| Candidato                  | Licença          | Um modelo, todas as direções | Ficou de fora por                        |
| -------------------------- | ---------------- | ---------------------------- | ---------------------------------------- |
| **MADLAD-400 3B** (Google) | Apache 2.0       | sim, 400+ idiomas            | — escolhido                              |
| M2M-100 1.2B (Meta)        | MIT              | sim, 100 idiomas             | erra o sentido mais vezes (abaixo)       |
| NLLB-200 (Meta)            | CC-BY-NC 4.0     | sim                          | **não comercial**; a Meta diz "pesquisa" |
| OPUS-MT / Argos Translate  | Apache 2.0 / MIT | não: um modelo por par, pivô | dezenas de modelos e pivô pelo inglês    |
| TranslateGemma 4B (Google) | termos do Gemma  | 55 idiomas                   | termos próprios, 4B pesa demais na CPU   |
| API paga (DeepL, Google)   | contrato         | sim                          | material do professor sairia da máquina  |

**Medido**, num container limitado a 2 núcleos (o teto do serviço de áudio), com 24 frases de aula
nos dez idiomas — 19 para o português e 5 saindo dele —, busca em feixe 2:

| Modelo (int8) | Memória | Por frase | Lista de 24 em lote | Frases certas |
| ------------- | ------- | --------- | ------------------- | ------------- |
| MADLAD-400 3B | 2,9 GB  | 0,93 s    | 4,3 s               | **21 de 24**  |
| M2M-100 1.2B  | 1,2 GB  | 0,49 s    | 1,8 s               | 19 de 24      |

O que separou os dois foi o TIPO de erro. O M2M-100 errou o sentido: "Il fait beau aujourd'hui"
virou "Hoje ele está bonito", "おはようございます" virou "Boa manhã", "lição de casa" virou
"lección de casa", e trocou presente por passado no japonês. Os três tropeços do MADLAD foram uma
expressão solta sem contexto ("to look forward to"), um tempo verbal no árabe e um travessão de
legenda na frente de frase curta — este último a gente limpa. Material errado ensina errado; a
velocidade do M2M-100 não compra isso de volta, porque a tradução acontece quando o professor
cadastra, não quando o aluno responde.

Os pesos vêm da conversão `Nextcloud-AI/madlad400-3b-mt-ct2-int8` (Apache 2.0, a mesma família
que o app de tradução local do Nextcloud usa). O M2M-100 continua suportado pelo motor: trocar é
`AUDIOTEXT_TRADUCAO_MODELO=jncraton/m2m100_1.2B-ct2-int8`, para uma máquina menor.

### 2. Onde roda: dentro do `audiotext-service`

Terceiro motor do serviço, ao lado do Whisper e do Kokoro: `POST /v1/translate`, em LOTE (até 64
textos por pedido, 600 caracteres cada). O runtime é o **mesmo CTranslate2 que o faster-whisper já
traz** — entrou só o `sentencepiece` (~1 MB). Fila de admissão própria (`traducao`: um lote por
vez, 4 esperando; passou disso, 503 na hora).

**O tradutor é o motor OPCIONAL.** Ele sobe depois do Whisper e do Kokoro, e falhar ao carregá-lo
não tira voz e fala do ar: o `/health` continua `ok` (com `translate_ready: false`) e a rota de
tradução responde 503.

O teto de memória do container subiu de 4 para **7 GB** (2 GB medidos com Whisper e Kokoro + 2,9 GB
do tradutor + folga). A conta da máquina fecha: 1 + 0,75 (aplicação) + 2 (banco) + 1 (MinIO) + 7 =
11,75 de 16 GB. Os dois núcleos são divididos com o ASR: tradução é rara e cada motor tem a sua
fila.

### 3. Duas armadilhas de tokenização, as duas medidas

O modelo responde mesmo com a entrada errada — só que mal. Por isso estão escritas no código e em
teste:

- **O `</s>` no fim é obrigatório.** O tokenizador do Hugging Face o põe sozinho; o `sentencepiece`
  puro, não. Sem ele o modelo repete a frase ("Eu moro aqui há dois anos, moro aqui há dois anos,
  moro aqui há dois anos").
- **O `<2pt>` é codificado JUNTO com o texto**, que é como o modelo foi treinado (o SentencePiece
  põe um `▁` antes dele). Encaixar o token depois de codificar dava "Eu vive aqui por dois anos." e
  "..." para frase em japonês.

### 4. No produto: só preenche o que veio em branco

`src/lib/server/traducao/` (interface `Tradutor`, `TRANSLATE_PROVIDER`: vazio desliga,
`audiotext` liga). A ordem de força das três fontes de tradução:

1. a que o **professor escreveu** — nunca é sobrescrita;
2. a da **IA**, quando ele gera o material com ela (adr-003);
3. a **automática**, que só preenche o que chegou em branco.

- **No formulário**, a tradução é sugerida enquanto ele digita (uma pausa de 650 ms, não uma
  tecla), e a tela diz "Tradução automática. Confira e ajuste se precisar.". Se ele escreve a dele,
  a sugestão não volta por cima; "Traduzir de novo" troca a pedido.
- **Ao salvar**, o servidor traduz o que veio em branco — a sugestão é conforto, a garantia é do
  servidor (vale sem JavaScript e quando ele salva antes de a sugestão chegar).
- **Colando uma lista**, a linha sem separador ENTRA e ganha a tradução, num pedido só. Falhou o
  tradutor, nada é gravado: metade da lista sem tradução não é a lista que ele colou.
- **O par de idiomas**: no wizard, idioma da atividade → língua do aluno da atividade. Na biblioteca,
  idioma do material → a mesma língua do aluno que a página já usa para a IA. Material "sem
  idioma" não tem de onde traduzir, e a tela pede o idioma.
- **Sem tradutor, nada muda**: a tela pede a tradução como sempre pediu.

### 5. "Traduzir com IA" não virou uma ação à parte

A IA continua sendo o modo "Gerar com IA", que já devolve o material traduzido. Uma ação de
"traduzir com IA" por material cobraria crédito por algo que o tradutor local faz de graça — se
um dia fizer sentido (uma revisão mais caprichada, por exemplo), entra como decisão de cobrança, não
como detalhe de tela.

## Consequências

- O "ligue os pares" que fecha a atividade passou a sair também das PALAVRAS das frases, quando o
  vocabulário cadastrado não o enche: o kernel escolhe as palavras (sem regra de idioma) e o
  servidor as traduz, guardando só o par que volta à mesma palavra na tradução de volta — palavra
  solta não tem contexto, e era aí que o tradutor errava (kernel.md "closing-match").

- Material cadastrado só no idioma alvo vira par completo, e o rendimento (escuta, fala, tradução)
  sai igual ao de antes.
- A tradução automática é um CHUTE bom, não um gabarito: ela entra como a tradução do material, e
  o professor confere — o mesmo papel da tradução da IA.
- **As outras traduções certas viram respostas aceitas** (novembro de 2026, pedido do dono). Na
  questão "traduza para o português", o aluno que escrevia outra tradução válida recebia "quase".
  Ao gerar os itens, o serviço devolve as hipóteses do feixe perto da melhor (`alternatives`, até 4;
  feixe `alternatives + 2`; margem de 0,2 na pontuação do modelo, medida — acima dela vinham
  "Nunca desista EM seus sonhos" e "Eu realmente ADORO ler" para "me gusta mucho"). O Spokke fica
  com as de diferença pequena (kernel) e que fazem a ida e volta, e as põe em "Também aceitas" para
  o professor conferir. Só na língua do aluno: no idioma alvo a forma é o que se ensina. E nunca
  na correção: o tradutor conserta o erro do aluno antes de traduzir ("She have been working" volta
  igual à certa).
- `traducao.test.ts` confere que todo idioma do produto está na lista do tradutor (a contraparte
  independente de `audiotext-service/app/traducao.py`).
- **O PyAV ficou fixado abaixo do 19** no serviço de áudio: a reconstrução da imagem trouxe o 19,
  que tirou um parâmetro que o faster-whisper usa, e toda transcrição passou a estourar com o
  `/health` dizendo "ok". O teto sobe quando o faster-whisper acompanhar.
