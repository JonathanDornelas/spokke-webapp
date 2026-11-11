---
paths:
  - 'src/**/*.svelte'
  - 'src/lib/components/**'
---

# Componentes — Spokke

Componentes canônicos em `src/lib/components/`. Reutilize-os em vez de reinventar: as classes e
os estados aqui já seguem `design-system.md` (semântica de correção, alvo de toque, teclado,
propriedades lógicas).

Referência visual navegável: `docs/design-system.html` (abra no browser).
Catálogo vivo, testável em cada estado, com toggle de tema: `/dev/components` (só em `pnpm dev`).
Regras que valem sobre tudo isto: `.claude/rules/design-system.md`.

## Convenções

- Componente de UI não conhece regra de negócio. Recebe props, emite eventos (`onXxx`), chama
  uma remote function. A decisão de correto/parcial/incorreto vem do kernel, no servidor.
- `class:` do Svelte para variação de estado; nunca concatene string de classe à mão — **exceto**
  quando o componente também aceita `...rest` e uma classe externa (ver bullet abaixo), aí o
  `class:` não é seguro e o merge manual é a exceção deliberada.
- **Componente que aceita `...rest` e pode receber `class` de fora, faça o merge manual.**
  `<button class="btn ..." {...rest}>` com um `rest.class` vindo de fora **substitui** a classe
  inteira em vez de somar — não existe merge automático no Svelte 5 aqui. Desestruture
  `class: className = ''` explicitamente, monte a string final (`$derived` com template
  literal) e use só essa variável no `class={...}` do elemento, nunca `class="..." {...rest}`
  nessa ordem. `Button.svelte` e `TextField.svelte` fazem isso — foi um bug real (botões da home
  perderam o `btn-primary` inteiro ao receber uma `class` extra) antes de virar regra.
- Conteúdo do idioma alvo sempre dentro de um elemento com `data-content-lang` e `dir`.
- Propriedades lógicas apenas: `ms-`, `me-`, `ps-`, `pe-`, `text-start`, `text-end`.
- Sem `any`. Props tipadas explicitamente; eventos de libs externas (`svelte-dnd-action`)
  tipados com os tipos que a lib exporta.
- **Sem framework de UI.** `btn`, `input`, `fieldset` e variantes são `@utility` nossas em
  `app.css`, não de um plugin. Se falta uma variante, adicione o `@utility` lá — não empilhe
  classes Tailwind soltas tentando simular uma.

---

## Botão — `Button.svelte`

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Variant = 'primary' | 'outline' | 'ghost' | 'neutral';
	type Size = 'sm' | 'md' | 'lg'; // lg = alvo do Player

	let {
		variant = 'primary',
		size = 'md',
		type = 'button',
		disabled = false,
		href,
		class: className = '',
		children,
		...rest
	}: {
		variant?: Variant;
		size?: Size;
		disabled?: boolean;
		href?: string;
		class?: string;
		children: Snippet;
	} & HTMLButtonAttributes = $props();

	const variants: Record<Variant, string> = {
		primary: 'btn-primary',
		outline: 'btn-outline',
		ghost: 'btn-ghost',
		neutral: 'btn-neutral'
	};
	const sizes: Record<Size, string> = { sm: 'btn-sm', md: '', lg: 'btn-lg' };
	// {...rest} depois de class="..." SUBSTITUI a classe inteira — merge manual, ver Convenções.
	let classes = $derived(
		`btn motion-tap font-bold ${variants[variant]} ${sizes[size]} ${className}`
	);
</script>

{#if href}
	<a {href} class={classes} {...rest}>
		{@render children()}
	</a>
{:else}
	<button {type} class={classes} {disabled} {...rest}>
		{@render children()}
	</button>
{/if}
```

`motion-tap` (em `app.css`) é o toque: afunda a 0.97 em 120 ms e volta em 200 ms com ~4% de sobra
(`--ease-out-back`) — "afundou e soltou". A transição dele cobre também `translate`, cor, borda e
sombra, para não apagar o hover que a tela puser no mesmo elemento. No Player use sempre
`size="lg"`. `type="button"` por padrão — evita submit acidental dentro de um `<form>`; passe
`type="submit"` explicitamente quando for o botão de envio.

`btn-circle` (ícone redondo, ex.: play/pause, microfone, voltar) combina com um `size-*` do
Tailwind para o diâmetro: `class="btn btn-circle btn-accent size-12 min-h-12"`.

**Polimórfico**: passe `href` e ele vira `<a>` em vez de `<button>` — mesmas classes, mesmas
variantes. É assim que os CTAs da home (`Criar uma atividade`, `Entrar no Studio`) usam o mesmo
componente sem forçar link a se comportar como botão de formulário. `href` genérico não passa
por `resolve()` de `$app/paths` dentro do componente (exige literal no call site) — quem chama
com uma rota interna real resolve antes de passar; rota de âncora, externa ou ainda não
construída é isenta com `eslint-disable-next-line svelte/no-navigation-without-resolve`.

---

## Campo de texto — `TextField.svelte`

Erro é **ícone mais texto**, nunca borda vermelha sozinha.

```svelte
<script lang="ts">
	import type { HTMLInputAttributes } from 'svelte/elements';

	let {
		label,
		value = $bindable(''),
		error = '',
		hint = '',
		class: className = '',
		...rest
	}: {
		label: string;
		value?: string;
		error?: string;
		hint?: string;
		class?: string;
	} & HTMLInputAttributes = $props();

	const id = $props.id();
	let classes = $derived(`input w-full ${error ? 'input-error' : ''} ${className}`);
</script>

<fieldset class="fieldset w-full">
	<legend class="fieldset-legend">{label}</legend>
	<input
		{id}
		bind:value
		class={classes}
		aria-invalid={!!error}
		aria-describedby={error ? `${id}-err` : undefined}
		{...rest}
	/>
	{#if error}
		<p
			id="{id}-err"
			class="flex items-center gap-2 fieldset-label text-[12.5px] font-semibold text-error"
		>
			<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
				<path
					d="M12 7.5v6M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			{error}
		</p>
	{:else if hint}
		<p class="fieldset-label text-[12.5px]">{hint}</p>
	{/if}
</fieldset>
```

`$props.id()` (não `$props.id`) gera um id estável para SSR — é uma função, precisa ser chamada.

---

## Estado de correção — `CorrectionState.svelte`

O componente que mais importa acertar. Quatro estados; **parcial existe**. A troca de estado
entra com `feedback-in` (220ms, `--ease-out-soft`) — sem o `{#key state}`, a animação não
retrigger e a troca fica instantânea.

```svelte
<script lang="ts">
	type State = 'unanswered' | 'correct' | 'partial' | 'incorrect';

	let {
		state = 'unanswered',
		answer = '',
		message = '',
		lang,
		dir = 'ltr'
	}: {
		state?: State;
		answer?: string;
		message?: string;
		lang?: string;
		dir?: 'ltr' | 'rtl';
	} = $props();

	const map: Record<State, { border: string; text: string; label: string }> = {
		unanswered: {
			border: 'border-dashed border-base-300',
			text: 'text-base-content/60',
			label: 'Não respondido'
		},
		correct: { border: 'border-success', text: 'text-success', label: 'Correto' },
		partial: { border: 'border-warning', text: 'text-warning', label: 'Quase' },
		incorrect: { border: 'border-error', text: 'text-error', label: 'Incorreto' }
	};
	let s = $derived(map[state]);
</script>

{#key state}
	<div class="flex feedback-in items-center gap-2.5 {s.text}">
		<!-- ícone por estado: check (correct), meio-círculo cheio (partial), x (incorrect),
		     tracejado (unanswered) — ver o componente para o markup completo -->
		<span class="text-[15px] font-bold">{s.label}</span>
	</div>

	<div
		data-content-lang={lang}
		{dir}
		class="mt-4 feedback-in rounded-box border-[1.5px] bg-base-100 p-3.5 text-[18px] {s.border}"
	>
		{answer || '—'}
	</div>
{/key}

{#if message}
	<p class="mt-3 text-[13px] leading-relaxed text-base-content/60">{message}</p>
{/if}
```

**Mensagem de parcial mostra o que faltou**, não só que errou: "Quase. Faltou o g no final:
has been working".

O anúncio para leitor de tela é responsabilidade da tela que corrige, não deste componente:

```svelte
<p aria-live="polite" class="sr-only">{announcement}</p>
```

---

## Paginação — `Pagination.svelte`

Props: `{ pagina?: number ($bindable, 1-based); porPagina: number; total: number; rotulo?: string }`.

- **Só aparece com mais de uma página.** Numa tabela de cinco linhas o controle não é
  informação, é ruído — e "1 de 1" nunca ajudou ninguém.
- A contagem vai em TEXTO ("13–24 de 57 materiais"), não só em números de página: o professor
  quer saber quanto falta.
- Janela curta de números com as pontas sempre presentes, e "…" marcando o salto — com 40
  páginas, listar todas empurraria a tabela para fora da tela.
- **Quem filtra volta para a página 1.** Ficar na 3ª depois de o resultado encolher para quatro
  linhas deixava a tabela vazia sem explicação.

Em uso: lista de atividades (8/página), biblioteca de materiais (12), tentativas de uma
atividade (10) e a chamada de uma turma (15). A paginação é de TELA: o loader manda a lista
inteira, que é dado do próprio professor — uma ida ao servidor por clique de página não
compraria nada nesse volume.

---

## Tema — `ThemeToggle.svelte`

Props: `{ class?: string }`. Botão redondo de ícone, e **só no cabeçalho do topo** — na home,
no header do desktop do Studio e no do celular. Houve uma variante de item de menu para a
barra lateral; ela saiu a pedido do dono do repositório, e com ela a prop `variant`: uma
variante que nenhuma tela usa é código morto documentado como se fosse API.

**Nenhuma tela guarda tema por conta própria** (design-system.md "Tema"): quem persiste e
aplica no `<html>` é `$lib/client/theme`, e o script inline de `app.html` já aplicou o valor
antes da primeira pintura. O componente só sincroniza e alterna — foi por isso que ele saiu de
dentro da home, onde era SVG solto, quando o Studio passou a precisar do mesmo botão.

---

## Badge — `Badge.svelte`

Status de atividade (Publicada/Rascunho no Studio) e rótulo de tipo de interação nas telas do
Player (Listening/Speaking/...). Pílula pequena, sem ícone. Minúscula, nunca caixa alta — isso é
papel de rótulo (`label/12`), não de badge.

Props: `{ variant?: 'neutral' | 'primary' | 'accent' | 'success' | 'warning' | 'error'; tone?: 'soft' | 'solid' | 'outline'; children: Snippet }`.

- `soft` (padrão) — fundo no tom 10% (`bg-primary/10`), texto na cor cheia. Uso geral.
- `solid` — fundo sólido, texto `-content`. Reservado para o estado "publicada" — é o único badge
  com o mesmo peso visual de um botão primário.
- `outline` — sem fundo, borda 1px na cor. Estados neutros/secundários ("corrigida", "imutável").

---

## Alerta — `Alert.svelte`

Barra de destaque colorida à esquerda (`border-inline-start` 3px) mais ícone e texto — para
avisos que não são estado de correção (o que está no ar não muda sozinho, provedor não configurado).
**Nunca** reuse `CorrectionState` para isto; são semânticas diferentes mesmo compartilhando cor.

Props: `{ variant?: 'info' | 'warning' | 'error' | 'success'; children: Snippet }`. `info` usa
`primary`, os demais usam a cor semântica correspondente. O texto do children fica em
`base-content` normal — só o ícone e a barra lateral carregam a cor da variante.

---

## Espera — `Loading.svelte`, `LoadingBar.svelte`, `NavigationProgress.svelte`

Três variações do MESMO vocabulário do ambiente — círculo, triângulo, hexágono e anel tracejado —
e as mesmas três cores (azul cheio, azul a 60%, teal a 70%). Trocar de variante não pode
parecer trocar de produto.

Props de `Loading`: `{ variant?: 'orbita' | 'fila' | 'traco'; size?: number; label?: string; pace?: 'normal' | 'devagar'; tone?: 'brand' | 'current' }`.

| variante | onde                                              | evite                                   |
| -------- | ------------------------------------------------- | --------------------------------------- |
| `orbita` | espera de 3 s ou mais, com o bloco dedicado a ela | dentro de botão ou linha                |
| `fila`   | espera curta: botão, campo, linha de lista        | centralizada numa tela vazia            |
| `traco`  | sobreposição, cartão recarregando                 | abaixo de 24px — o tracejado vira ruído |

- **`size` é sempre a ALTURA em px.** Na fila isso é a altura da linha (padrão 14), não o
  diâmetro de uma bolinha — ela é uma linha baixa, não uma caixa quadrada.
- **`tone="current"` dentro de botão colorido.** As formas herdam `currentColor`; com `brand`
  elas sairiam azul sobre azul.
- **`pace="devagar"` (1,75×) acima de dez segundos.** A órbita rápida lê como travamento; a
  lenta lê como trabalho acontecendo.
- As durações dentro de cada variante são primas entre si de propósito: o conjunto nunca volta à
  mesma configuração e o olho não acha o ponto onde o laço reinicia.
- **Todo botão que espera o servidor mostra a `fila`** e fica desabilitado enquanto espera — não
  só troca de texto. Trocar só o rótulo ("Enviando…") não diz que a tela está ocupada e o clique
  duplo continua possível. Vale para submit de formulário, ação de linha e botão de ícone: em
  botão de ícone a fila entra NO LUGAR do ícone, não ao lado. Anel improvisado com `en-spin` não
  existe mais em botão nenhum.
- Numa lista, o pendente é o **id** da linha, nunca um booleano: com booleano os N botões piscam
  juntos e o professor não sabe qual ação pegou.
- Cada instância carrega `role="status"` e um `label`; as formas ficam `aria-hidden`. Quem usa
  leitor de tela quer ouvir "carregando", não três divs. **O texto ao lado é obrigatório**:
  com `prefers-reduced-motion` tudo congela no primeiro quadro e é ele que informa a espera.

**Quando não usar nenhuma.** Se você sabe o formato do que vem, mostre o formato — `skeleton`
(utility do `app.css`). Se o trabalho está numa fila do servidor e você não sabe quanto falta,
`LoadingBar.svelte` (`{ label, pace }`), que atravessa e recomeça. **Nunca porcentagem** de algo
que você não consegue medir.

`NavigationProgress.svelte` é a espera de TROCA DE TELA, montada uma vez em
`routes/+layout.svelte`, e **só aparece depois de 180 ms**: navegação com dado em cache resolve em
poucos quadros, e piscar a cada clique treina o olho a ignorá-la.

**O DESTINO escolhe a forma**, porque as duas superfícies têm orçamentos diferentes: rota do
painel (`route.id` começando em `/(studio)`) mostra a `orbita` numa pílula flutuante — ali o
professor trocou de tela sabendo o que pediu, e a órbita é a variante que aguenta ficar em tela;
Player e páginas públicas mostram a barra fina, que é o mais leve possível para quem está no meio
de uma tarefa em 4G. O grupo sai do `route.id` e não do pathname — o pathname não tem o grupo.

---

## Busca do Studio — `StudioSearch.svelte`

A caixa do cabeçalho do painel, montada uma vez em `(studio)/+layout.svelte`. Sem props: ela
consulta `buscarNoStudio` sozinha.

- **A categoria vai escrita em cada linha**, não só por cor ou por ordem — "Present perfect"
  pode ser uma atividade e um material ao mesmo tempo.
- O `onfocusout` fica no CONTAINER, não no input: clicar num resultado tira o foco do campo, e
  fechar ali fecharia a bandeja antes de o clique chegar.
- Teclado: setas andam, Enter abre (o primeiro, quando nada está destacado), Esc fecha.
- Resposta que chega fora de ordem é descartada comparando com o termo atual — sem isso a
  consulta lenta sobrescreve o resultado da rápida.

---

## Áudio — `AudioPlayer.svelte`

Sem autoplay. Reprodução visível e **um botão de velocidade que cicla**: 1 → 0.75 → 0.5 → 1,
com 1 de padrão. Quatro pílulas lado a lado ocupavam a largura de um telefone e pediam mira num
alvo de 42px entre outros três iguais — e acelerar não é o que se quer numa questão de escuta:
quem mexe na velocidade está com dificuldade de entender, não com pressa.

Os degraus saem de **dois** arquivos. 0.75× e 1× são os de `LanguageProfile.tts.speeds`,
sintetizados: voz gerada devagar sai melhor do que voz normal desacelerada no browser. O 0.5×
vem de `playbackRate` sobre o arquivo LENTO, porque sintetizar um terceiro por frase aumentaria
a fila de TTS e o bucket em 50% para ganhar um degrau.

**O `src` do elemento segue o ARQUIVO, não a velocidade.** Trocar o `src` reinicia o
`<audio>`, e com ele preso à velocidade ir de 0.5× para 0.75× recarregava à toa. Quando o
arquivo muda mesmo, a posição é restaurada por FRAÇÃO (os dois têm durações diferentes) depois
do `loadedmetadata`, e o `play()` só acontece aí — chamá-lo antes de o `src` novo ser aplicado
era abortado pelo carregamento, e a promessa rejeitada sem `catch` deixava o player mudo até
recarregar a página. Arquivo lento que não carregou (síntese na fila, job que falhou) cai para o normal. As repetições contam para
a tentativa — quem instrumenta isso é o `onplay` que a tela passa.

No celular as pílulas de velocidade descem para uma linha própria rotulada "Velocidade": em
largura de telefone elas espremem a onda contra o botão de tocar. **`emLinha` desliga isso**: tocar,
onda e velocidade numa linha só em QUALQUER tela. É o celular da home — ele tem sempre a largura de
um telefone, mas quem decide o breakpoint é a tela de quem o vê, e no celular de verdade a segunda
linha empurrava a questão para fora da tela do aparelho.

Props: `{ src: string; srcSlow?: string; onplay?: () => void; playing?: boolean; duration?: string; plays?: number; emLinha?: boolean }`
(`playing` é `$bindable`, padrão `false`). O bind existe só para catálogo/demo poder abrir já com
a onda animada sem chamar `audio.play()` de verdade — nunca inicialize `playing` como `true`
numa tela real do Player, isso violaria a regra de autoplay. `duration`/`plays` são opcionais e
só aparecem (linha "toque para ouvir" / "ouvido N vezes") quando `duration` é passado — usado no
Player real (`q/[n]`), omitido no catálogo e na home.

---

## Volume do retorno — `VolumeControl.svelte` + `$lib/client/sons.svelte.ts`

O som de acerto, erro e fim do Player. **Não é o `AudioPlayer`**: aquele toca o áudio DA
QUESTÃO, com velocidade alternável, e segue o volume do aparelho. Este rege só o retorno.

- **Som nunca é o único canal.** `AnswerFeedback` continua com ícone e texto — quem está no
  zero, sem fone ou com leitor de tela não perde nada. Cor sozinha já era proibida; som
  sozinho seria a mesma falha por outro sentido.
- **O padrão é 0.6, não 1 nem 0.** Trinta aparelhos no talo numa sala é barulho, não retorno;
  e um recurso que nasce mudo é um recurso que ninguém descobre. A escolha vive em
  `localStorage` (`spokke-volume`) e vale por aparelho.
- **Os arquivos são baixados no clique de "Verificar"**, não na montagem da tela
  (`som.preparar()`). A correção acontece no servidor, então o áudio viaja em paralelo com a
  ida até lá e já está pronto quando o veredito chega. Baixar os quatro ao montar seriam
  160 kB adiantados numa superfície cujo orçamento é 4G e celular fraco. No volume 0 nada é
  baixado.
- **Web Audio, não `<audio>`.** A versão anterior guardava um `HTMLAudioElement` por som e,
  a cada correção, fazia `currentTime = 0` seguido de `play()`. Isso ESTALA: reposicionar um
  MP3 obriga o decodificador a recomeçar no quadro mais próximo, e o que sai antes de ele
  estabilizar é ruído — era o chiado no começo e no fim de cada efeito. Trocar de arquivo não
  resolveria; os quatro estão limpos (medidos: silêncio digital nas duas pontas, 192 kbps).
  Decodificando uma vez para PCM e tocando de um `AudioBufferSourceNode` novo a cada vez, não
  existe reposicionamento — cada toque começa do zero por construção —, e o ganho entra e sai
  por rampa de 4 ms.
- **Contexto suspenso nunca derruba a tela.** O browser recusa áudio sem gesto do usuário na
  aba, e abrir `/resultado` direto pelo endereço é exatamente esse caso — o exercício segue
  calado. Buffer que ainda não chegou também: o som daquela questão é perdido de propósito,
  porque "correto" tocando três segundos depois de a tela já ter dito confunde mais do que
  ajuda.
- Botão de ícone que abre o deslizante, não um `range` solto: o alvo do Player é de 48px e um
  controle aberto não cabe no cabeçalho do celular. Três níveis de ícone (mudo/baixo/alto),
  porque "tem som" e "está no talo" não são a mesma informação.

Os quatro arquivos vivem em `static/sons/` e chegam ao browser como `/sons/*.mp3`:
`correct.mp3`, `almost.mp3` (o estado **parcial**), `incorrect.mp3` e `finish.mp3`.

---

## Gravação (speak) — `Recorder.svelte`

Componente controlado: recebe `recording` e `ontoggle`, não fala com `MediaRecorder` sozinho —
isso fica na tela que o usa, por meio de `$lib/client/gravacao.svelte.ts` (a classe `Gravacao`).

**A gravação termina sozinha quando o aluno para de falar.** Antes dependia de um segundo
toque, e isso cobrava dele uma tarefa que não é a do exercício: dizer a frase E lembrar de
encerrar — quem esquecia mandava segundos de sala de aula depois da resposta, e o Whisper
transcrevia o vizinho junto. A detecção é por ENERGIA relativa ao ruído de fundo, medido nos
primeiros 300 ms daquele aluno naquele aparelho: um limiar absoluto funciona no quarto de quem
escreveu o código e falha numa sala com trinta pessoas, onde o silêncio já está acima dele.
Encerra com 1,1 s de silêncio depois de ter havido fala, e o teto duro é de **10 s**. O toque
continua encerrando, como saída manual.
`SpeakInteraction.svelte` repassa esse estado (`estado`, `segundos`, `maxSegundos`) e mostra o
contador enquanto grava, o "pronto para enviar" depois, e a mensagem de microfone negado ou de
navegador sem gravação — cada uma com ícone, nunca cor sozinha. O botão de pular fica **sempre visível** ao lado dele, renderizado
pela tela: microfone negado ou ambiente barulhento não podem travar a atividade.

`SpeakInteraction` recebe ainda `ouvido` (o que o serviço entendeu, antes de enviar) e `ouvindo`
(a gravação subiu e a transcrição não voltou): é a prévia que deixa o aluno regravar antes do
veredito — paginas.md "Player".

Props: `{ recording?: boolean; ontoggle?: () => void; size?: 'md' | 'lg'; hint?: string }`.
`hint` é a linha sob o botão, e existe como prop porque o que se promete ali mudou de dono: em
`speak` a gravação para sozinha, então "toque para parar" seria mentira. Enquanto
`recording` é `true`, uma waveform de 9 barras (`en-wave`, mesma animação do `AudioPlayer`)
cresce **da base** (`items-end` + `origin-bottom`) abaixo do botão: é o feedback visual de que o
microfone está captando, não decoração — centrada ela pulsa para os dois lados e lê como
carregamento.
`size="lg"` (108px em vez de 96px) é o que `player/SpeakInteraction.svelte` usa — é o único lugar
que precisa do botão maior; em qualquer outro contexto (catálogo, demo) o padrão `md` está certo.

---

## Teclado virtual — `TecladoVirtual.svelte` + `campo-com-teclado.svelte.ts` + `teclado-edicao.ts`

O teclado do idioma alvo. **Não conhece idioma nenhum**: o layout (`Teclado`) vem do
`LanguageProfile.input` pelo runtime do item (kernel.md "Entrada"), e só existe em `type`/`cloze`
respondidos no alvo. O desenho é o protótipo "Player Teclado" do Claude Design. O catálogo tem
os quatro layouts vivos em `/dev/components#teclado`.

Props: `{ teclado: Teclado; aberto?: boolean ($bindable); desativado?: boolean; docado?: boolean; onacao: (acao: Acao) => void }`.
`Acao` (de `campo-com-teclado.svelte.ts`) é inserir, apagar ou trocar a letra anterior — o
componente só diz o que foi tocado.

- **Dois formatos, e a diferença é o teclado do APARELHO.** `barra` é uma linha de acentos sob o
  campo, e o do aparelho continua aberto — ele escreve as letras, a barra completa o `ç`. `grade`
  é o teclado inteiro do script; enquanto ela está aberta o campo põe `inputmode="none"`, porque o
  aparelho não escreve kana nem árabe e os dois juntos cobririam a questão. "Ocultar" esconde a
  grade e devolve o do sistema — quem já tem o teclado do idioma no celular não precisa deste.
- **A grade nasce OCULTA, em toda questão** (`aberto` é `false` de padrão, e a `/q/[n]` o zera a
  cada troca de questão) — pedido do dono do repositório: aberta, ela tomava metade do celular
  antes de o aluno ler a pergunta. Quem a chama é o aluno, pelo botão "Teclado" do rodapé, ao
  lado do "Pular". Abrir (`abrirTeclado`) põe o foco no campo e o rola para a vista, com um
  `blur` antes do `focus`: trocar o `inputmode` para `none` num campo já focado não recolhe o
  teclado do aparelho, só um foco novo lê o valor novo. "Ocultar" tira o foco (`onocultar`),
  senão o teclado do aparelho saltava no lugar do virtual.
- **Ela SOBE e DESCE, não aparece.** `teclado-in` (`media`, 300 ms, desacelerando) e `teclado-out` (`curta`, 200 ms,
  acelerando), no `app.css`, só `transform` e `opacity`. O painel desliza dentro de uma moldura
  `overflow: hidden`, então nunca passa por cima do rodapé nem do campo; e continua montado até o
  `animationend` da saída (`montado` ≠ `aberto`), senão sumiria de uma vez.
- **No Player a grade é ENCAIXADA** (`docado`): quem a desenha é a `/q/[n]`, entre a área da
  questão e o rodapé, como o teclado de um celular — a questão rola por cima e ele não sai do
  lugar. Por isso ali o `CampoComTeclado` é da TELA, que o passa para a interação (`campo`,
  `bind:tecladoAberto`, `tecladoNaTela`). Com ela aberta, o respiro vertical da questão no
  desktop cai de `lg:py-13` para `lg:py-6`. Solto (prévia do professor, catálogo) o próprio
  componente oferece "Mostrar o teclado de …". A barra fica sempre dentro da interação, colada
  no campo.
- **A altura da tecla acompanha a da tela**: `h-[clamp(2rem,5.2dvh,3rem)]` com `min-h-0`, que
  solta a regra de 48px do Player. Com 48 fixos as seis linhas do kana deixavam 48px para a
  questão num celular de 568 e ~110 num iPhone SE; assim ficam ~136 e ~196, e 318 num celular
  comum — o que todo teclado nativo faz (a LARGURA de uma tecla de 10 colunas já fica abaixo de
  48 de qualquer jeito). A barra de ferramentas também encolhe no celular, e abaixo de 360px de
  largura a chave de pronúncia vira só o interruptor; a dica some abaixo de 600px de altura.
- **A barra de ferramentas da grade**: as formas (ひらがな / カタカナ, quando o layout tem
  `variantes`), as abas de grupo, a chave "Pronúncia nas teclas" e "Ocultar". No celular ela
  divide UMA linha — "Pronúncia" encurta e "Ocultar" vira só o ícone (o `aria-label` diz tudo) —,
  porque cada linha dela é altura tirada da questão.
- **Grade de colunas fixas** (`GrupoDeTeclas.colunas`, o kana): as casas `null` ficam vazias no
  lugar delas, e espaço + apagar ocupam o resto da última linha em vez de abrir uma nova. Sem
  `colunas` as teclas fluem (`auto-fill`), como no árabe.
- **Teclas de ação** (`゛` `゜` `小`) têm fundo `base-300` e texto `primary`, e o glifo maior: são
  marcas, e no corpo da letra sumiam num canto da tecla.
- **Pronúncia sob a tecla** (`Tecla.leitura`), em mono 9,5px, `aria-hidden` — o leitor de tela já
  pronuncia a letra no `lang` certo. Desligável; a escolha é por aparelho
  (`$lib/client/pronuncia.svelte.ts`, `spokke-pronuncia`) e vale também para a linha "Leitura"
  sob o campo (`LeituraDoCampo.svelte`, que só aparece na grade: na barra o texto já é latino).
  Teclado sem pronúncia nas teclas (o pinyin — a tecla já É a pronúncia) não mostra a chave, e a
  linha "Leitura" some quando seria igual ao que foi digitado.
- **`Teclado.dica`**, quando existe, é uma linha sob a barra de ferramentas dizendo como
  responder: no kana, que o kanji não é pedido; no pinyin, que o tom vai logo depois da vogal.
- **Tecla não rouba o foco** (`pointerdown` com `preventDefault`). Sem isso o cursor sumia a
  cada toque e, no celular, o teclado do sistema fechava e abria entre uma letra e outra.
- **A barra ROLA, não alarga** — `[contain:inline-size]`. As dezoito teclas do francês viravam a
  largura mínima de todo item de flex ou grid acima dela, e a página inteira rolava de lado no
  celular.
- **As abas de grupo mostram uma AMOSTRA das próprias teclas** (`अ आ इ`, `0 1 2`), como o "ABC"
  e o "123" de um teclado nativo; o nome em português ("Consoantes") fica no `aria-label`. Cada
  aba é `dir="auto"`: com o `rtl` do árabe, "0 1 2" aparecia como "2 1 0".
- As teclas carregam `lang` e `font-content`, e a grade segue o `dir` do script: o alfabeto árabe
  corre da direita para a esquerda, que é a ordem em que o aluno o procura. O polegar da chave de
  pronúncia anda por `transform`, não por `inset` (design-system.md "Movimento").

**Quem aplica a edição é o CAMPO, não o teclado.** `CampoComTeclado` (classe com runes) guarda o
elemento (`bind:this={campo.elemento}`) e a última seleção (`onblur={campo.lembrar}`), e
`campo.aplicar(valor, acao, definir, limite?)` insere NO CURSOR — não no fim — e devolve o cursor
para depois do que entrou, depois do `tick()`. A conta em si é `teclado-edicao.ts`, pura e
testada: `inserir` substitui a seleção e recusa o que passaria do `maxlength` (o atributo só
segura o que se DIGITA, não o que o script insere); `apagar` tira UM ponto de código, sem partir
par substituto — e de propósito não um grafema, senão apagar a matra de `कि` levaria a
consoante junto; `trocarAnterior` aplica o mapa de uma tecla de ação à letra antes do cursor
(com seleção, à última letra dela) e não faz nada quando a letra não está no mapa — `゛` depois
de `あ` não tem o que sonorizar.

---

## Token de montar frase (assemble) — `AssembleTokens.svelte`

**Precisa funcionar pelo teclado.** Usa `svelte-dnd-action` (suporte a teclado nativo) e mantém
o clique como caminho equivalente — clicar num token devolve ele ao pool.

```svelte
<script lang="ts">
	import { dndzone, type DndEvent } from 'svelte-dnd-action';

	type Token = { id: string; text: string };

	let {
		tokens = $bindable<Token[]>([]),
		pool = $bindable<Token[]>([]),
		lang,
		dir = 'ltr'
	}: { tokens?: Token[]; pool?: Token[]; lang?: string; dir?: 'ltr' | 'rtl' } = $props();

	function handleDnd(e: CustomEvent<DndEvent<Token>>) {
		tokens = e.detail.items;
	}
</script>

<ul
	use:dndzone={{ items: tokens, flipDurationMs: 220 }}
	onconsider={handleDnd}
	onfinalize={handleDnd}
	data-content-lang={lang}
	{dir}
	aria-label="Frase montada"
>
	{#each tokens as t (t.id)}
		<li>
			<button type="button" onclick={() => (tokens = tokens.filter((x) => x.id !== t.id))}>
				{t.text}
			</button>
		</li>
	{/each}
</ul>
```

`<ul>`/`<li>` em vez de `<div role="list">`/`<button role="listitem">`: um `<button>` não pode
receber `role="listitem"` (é elemento interativo, viola a11y) — a lista semântica nativa resolve
isso de graça. Tipe o evento com `DndEvent<Token>` importado da lib — o tipo interno dela usa
`Record<string, any>`, mas o nosso lado fica tipado.

---

## Progresso do Player — `ProgressBar.svelte` + `ResultTrack.svelte`

Cresce por `scaleX`, sem reflow. `ProgressBar` é a barra no topo da questão atual (props
`{ current: number; total: number }`); `ResultTrack` é a trilha por item no resultado final
(props `{ items: { state: 'unanswered' | 'correct' | 'partial' | 'incorrect' }[] }`), cada
segmento com `aria-label` anunciando o estado por extenso.

---

## Casca de questão do Player — `PlayerQuestionShell.svelte`

Uma pergunta por tela, ação principal fixa no rodapé, `data-surface="player"` para o alvo de
48px. **O foco vai para o início da nova questão ao avançar** — o `$effect` observa `index` e
chama `.focus({ preventScroll: true })` no `<main tabindex="-1">`. `preventScroll` importa: a
casca preenche o container, não a página inteira, então sem ele montar a casca no meio de uma
página maior (o catálogo de dev, por exemplo) rola a página inteira até ali.

Props: `{ index: number; total: number; onback?: () => void; children: Snippet; footer: Snippet }`.
`children` é o corpo da questão; `footer` é a ação principal (ex.: `Button` `size="lg"`).

A casca preenche o container (`h-full`), não trava em `min-h-dvh` — isso é responsabilidade de
quem monta a página. A rota real (`src/routes/a/[slug]/+page.svelte`) envolve a casca num
container `min-h-dvh`; o catálogo de dev (`/dev/components`) envolve num frame de tamanho fixo
para simular a tela de um celular. Essa separação é o que torna a casca embutível no preview.

---

## Abrir e fechar — `$lib/client/transicoes.ts` + o véu `overlay`

Modal, painel lateral e gaveta ENTRAM e SAEM — aparecer de uma vez parecia a tela piscando, e sumir
de uma vez, um travamento. Três transições, as mesmas em toda tela: `veu` (só opacidade),
`painelLateral` (`lado: 'fim'` para o painel da direita, `'inicio'` para a gaveta) e `modal` (sobe
18px enquanto aparece). Entrar desacelera (300 ms), sair acelera e some mais rápido (200 ms) — use
`in:` e `out:` separados, é a direção que escolhe a curva. `prefers-reduced-motion` zera a duração
ali dentro — o Svelte anima pela Web Animations API, que a regra global do `app.css` não alcança.

**Painel lateral é sempre a `Bandeja` (abaixo)** — nenhuma tela monta o seu. A gaveta do celular é
a única que usa `painelLateral` direto (`lado: 'inicio'`).

## Bandeja — `Bandeja.svelte`

Todo formulário de CRIAR e EDITAR do Studio que não é atividade abre aqui, pela direita, sobre a
tela de onde veio: nova turma, editar turma, adicionar aluno, editar cadastro (chamada e ficha do
aluno), enviar atividade, novo/editar módulo, acrescentar atividades, adicionar turmas, a
programação, o material da biblioteca e o convite da escola. Antes cada tela tinha o seu jeito —
painel de 520px, formulário que abria no meio da página empurrando a lista, página inteira para
criar uma turma. (A atividade continua no wizard: é uma tarefa de quatro etapas, não um formulário.)

Props: `{ aberta; onfechar; titulo?; descricao?; rotulo?; marca?: Snippet; children: Snippet; resumo?; erro?; rodape?: Snippet; moldura?; manterMontada? }`.

- **Largura ~40% da tela**: `--largura-bandeja` (`clamp(28rem, 40vw, 46rem)`, no `@theme`) — piso
  para não espremer o formulário num notebook, teto para não virar uma segunda página num monitor
  largo. Abaixo de `sm`, a tela inteira.
- **Anatomia fixa.** Cabeçalho: a `marca` (a etiqueta do que se cria, na cor escolhida, mudando
  enquanto se digita — ou o avatar do aluno), o título e UMA frase sobre o que muda e o que não muda,
  e o X. Corpo: os campos, o único pedaço que rola. Rodapé (`base-200`): o `resumo` — a consequência
  em texto ("3 alunos · 2 recebem convite") —, o `erro` do servidor escrito com ícone, e as ações, a
  principal na ponta. No celular as ações dividem a largura.
- **O rodapé fica FORA do `<form>`**; quem envia é `<button type="submit" form={id}>`. O Enter dentro
  de um campo continua enviando: o botão ligado pelo atributo conta como o botão padrão do formulário.
- **Monta só aberta** (padrão): fechar desmonta, então reabrir uma edição começa do que está GRAVADO.
  Quem guarda o alvo (o aluno, o módulo) o mantém depois de fechar, para a saída mostrar o conteúdo
  em vez de esvaziar no meio do deslize. As transições são LOCAIS de propósito — com `|global`, uma
  navegação segurava a página velha na tela pelo tempo da saída. Quem precisa remontar a cada
  abertura (a programação, cuja cópia local nasce do gravado) usa um `{#key}` e abre no quadro
  SEGUINTE ao da montagem, senão a entrada não anima.
- `manterMontada`: o conteúdo existe fechado, `invisible` + `inert` — a biblioteca chama `novo()` e
  `editar()` do `MaterialForm` por `bind:this`. Ali `moldura={false}`: o formulário desenha o próprio
  cabeçalho e rodapé (é o mesmo da etapa 2 do wizard), com as mesmas medidas.
- **Foco**: abre no `[data-autofoco]` (o primeiro campo de digitar; numa lista de escolha, nenhum —
  no celular ele abriria o teclado à toa) ou no próprio painel, que se anuncia pelo título. O Tab dá a
  volta dentro, Esc e o clique no véu fecham, e o foco volta a quem abriu.
- **Campos**: `fieldset` / `fieldset-legend` / `fieldset-label` (o rótulo, o campo e UMA linha
  dizendo para que ele serve). Opcional é escrito no rótulo (`· opcional`), nunca por asterisco no
  obrigatório. Um bloco à parte (os alunos da turma nova, as atividades do módulo novo) ganha título
  de 15px e um filete em cima — e o "opcional" vai no título dele.
- **Escolher UMA coisa é rádio (`.radio`), escolher VÁRIAS é `.checkbox`**, e a linha inteira é o
  alvo (`has-[:checked]` pinta a borda). Nada de um botão "Enviar" por linha: a lista escolhe, o
  rodapé diz o que vai acontecer, e o botão age.

Os seletores que se repetem nas bandejas são componentes: `SeletorDeEtiqueta.svelte` (a cor, ver
"Etiqueta de cor") e `SeletorDeAtividades.svelte` (`{ atividades; escolhidas: $bindable; vazio? }`) —
a mesma lista no "Novo módulo" e no "Acrescentar atividades": busca a partir de sete, filtro de
idioma, e **o número da posição em cada escolhida**, porque a ordem do clique é a ordem do módulo.

Catálogo vivo: `/dev/components#bandeja`.

**O véu é `bg-overlay`, preto translúcido nos dois temas.** Era `bg-base-content/40`, que no escuro
é um véu BRANCO — a página clareava em vez de recuar. O `::backdrop` do `<dialog>` usa o mesmo token.

## Formas de ambiente — `AmbientShapes.svelte`

Cinco formas fixas (círculo, quadrado arredondado tipo anel, triângulo, anel tracejado, cápsula)
usando os keyframes `en-float-a`, `en-float-c`, `en-drift-spin`, `en-float-b` do `app.css` (mais
`animate-spin` do próprio Tailwind no anel). **Nunca atrás de texto** — confine numa região
própria; a borda é resolvida com `mask-image` em fade, nunca corte reto. São sutis por design
(opacidade 25–35%) — não é bug se mal aparecerem num screenshot pequeno.

Props opcionais: `{ height?: string; tone?: 'primary' | 'success'; layout?: 'band' | 'column' | 'corner' | 'tela'; edges?: 'top' | 'bottom' | 'both'; scale?: number }`.

`layout="tela"` espalha sete formas (nenhuma família repetida) pela página INTEIRA, nas margens e
em alturas diferentes, com o canto de cima à esquerda livre para a marca. É o fundo das telas de
entrar, criar conta e recuperar a senha (`(auth)/+layout.svelte`): ali o cartão fica no meio de um
fundo vazio, e as duas faixas de `edges="both"` deixavam o meio chapado. O cartão é opaco, então o
que passa por trás dele some; nenhuma forma fica atrás de texto. **O movimento é o `en-vagar-*`**
(app.css), com amplitude de até 80 px e ciclos de 13 a 23 s: com o vaivém de ~30 px das faixas,
numa página quase vazia, as formas pareciam paradas, e foi esse o retorno do dono do repositório.

`scale` só existe para quem desenha uma TELA DENTRO DE OUTRA — hoje só o painel da prévia do
editor de item, que é uma coluna estreita ao lado do formulário. As formas crescem por `clamp(mín, Nvw, máx)`, e `vw` é a VIEWPORT: dentro de uma
moldura de 300px numa janela de 1440px elas saíam do tamanho de uma tela inteira. O multiplicador
entra como `--amb-k` e vale 1 em toda tela real — não use para "deixar mais discreto", a
opacidade já resolve isso.

`edges="both"` repete a faixa espelhada no rodapé, com outra composição de formas — é o que as
telas do Player usam, porque o conteúdo fica no meio do cartão e uma faixa só no topo deixa a
metade de baixo chapada. `edges="bottom"` é só a de baixo. O círculo grande é um
`radial-gradient` esmaecido, não `bg-primary/30 blur-sm`: o segundo vira um borrão sólido.

`layout="corner"` é o CANTO de um cartão de cabeçalho (`HeaderCard.svelte`): uma coluna de
300px no fim da linha, com fade para o lado do texto e cinco formas pequenas em px fixo — o
cartão tem sempre a mesma altura, e um `clamp` em `vw` as fazia sair do tamanho dele num monitor
largo. Some no celular, onde a largura inteira é do texto.

`layout="column"` é a composição da barra lateral do Studio: coluna estreita e alta, com as
formas descendo em vez de se espalharem na largura (as posições em porcentagem da faixa
amontoariam tudo num canto só) e fade nas duas pontas. Na lateral ela cobre a coluna INTEIRA,
atrás de todo o conteúdo — e por isso **os itens de menu não têm fundo**: item ativo se
distingue por peso, cor e um filete de 3px, nunca por um bloco opaco que apague as formas.

**A faixa é uma BORDA da tela, não uma fatia dela.** O padrão de `height` é
`clamp(9rem, 21vh, 12.5rem)` — em porcentagem ela crescia junto com o container até as formas
flutuarem no meio do conteúdo em vez de margeá-lo (42% de uma tela de 900px são 378px, o dobro
do desenho). O piso e o teto ficam perto dos 150/190px do protótipo, e o meio em `vh` mantém a
proporção onde ela importa, entre um celular e um monitor. Só passe `height` quando a tela pedir
outra medida — a lista vazia de atividades usa `"230px"`, que é o hero do protótipo.

`edges` diz de qual lado a faixa entra, e isso segue o LEIAUTE, não o gosto: `'both'` onde o
conteúdo fica no meio do cartão (Player, acesso); `'bottom'` onde ele começa colado no topo e o
vazio é embaixo (as quatro etapas do wizard, a prévia do editor de item); `'top'` só no hero,
onde o conteúdo vem depois. Faixa do lado errado cai atrás de texto, que é o que a regra proíbe.

As quatro etapas do wizard não montam a faixa cada uma: ela vive uma vez em `WizardShell.svelte`,
ancorada embaixo (150px no celular, 190px no desktop). Ela vem ANTES do conteúdo no DOM e o
conteúdo é `relative` — entre irmãos posicionados sem `z-index`, quem vem depois pinta por cima —,
então as telas filhas não precisam de `z-1` em cada bloco. A exceção é a etapa 2
(`WizardShell rolagem="colunas"`): ali a casca tem a altura da tela e cada coluna rola por dentro,
então a faixa vai no FIM da coluna da lista, e o texto que rola nunca passa por cima dela.

`tone="success"` troca `primary` por `success` nas formas coloridas — só a tela de resultado do
Player usa isso, quando o desfecho é positivo. As classes de cor são strings **inteiras e
literais** por tom (nunca montadas com `.replace()` em runtime): Tailwind só gera CSS para
classes que aparecem completas no código-fonte.

Formas adicionais disponíveis por `clip-path` (não têm componente próprio, copie o padrão se uma
tela precisar de uma sexta forma para não repetir a mesma composição de outra tela vizinha):
hexágono `polygon(25% 3%,75% 3%,100% 50%,75% 97%,25% 97%,0% 50%)`, cruz
`polygon(40% 0,60% 0,60% 40%,100% 40%,100% 60%,60% 60%,60% 100%,40% 100%,40% 60%,0 60%,0 40%,40% 40%)`.

---

## Cartão de cabeçalho — `HeaderCard.svelte`

O topo das telas de detalhe do Studio — turma, atividade, aluno — e da área do aluno. É UM
desenho: etiqueta, título e uma linha de contexto à esquerda, as ações à direita, e embaixo os
números que importam, separados por um filete. Fundo `base-200`, 16px de raio, e as formas de
ambiente no canto oposto ao texto (`AmbientShapes layout="corner"`).

Props: `{ numbers?: { value: string | number; label: string; tone?: 'primary' | 'error' | 'muted' }[]; badge?: Snippet; actions?: Snippet; children: Snippet }`.

- **Os números são uma lista curta em linha**, não uma grade que espalha quatro valores pela
  largura toda: lidos juntos eles respondem uma pergunta só ("qual é o tamanho disto?"), e a
  distância entre eles quebrava a leitura. Quem merece cor é dito por `tone` — um por cartão, no
  máximo dois (o que recebe convite em azul, o e-mail que voltou em vermelho).
- `badge` é a etiqueta de 46px à esquerda do título: as iniciais do aluno, a sigla da turma na
  cor dela, ou um ícone. `children` é o `h1` (22px no celular, 28 no desktop) mais a linha de
  contexto em 13,5px. `actions` são os botões de 42px — `btn-plain` para o secundário, porque o
  `btn-neutral` some sobre o fundo `base-200` do cartão; no celular eles descem para uma linha
  própria e dividem a largura.

---

## Marca — `Logo.svelte`

Ícone mais wordmark, link para a home via `resolve('/')`. Usado no header de toda tela fora do
Player (home, `(auth)/+layout.svelte`, `(studio)/+layout.svelte`, `+error.svelte`) — nunca
duplique o SVG do ícone inline numa página nova.

Props: `{ size?: number; showWordmark?: boolean; sub?: string }`. `size` (padrão 24) escala
ícone e wordmark juntos. `sub` acrescenta um rótulo separado por uma borda vertical (`border-s`)
depois do wordmark — não usado hoje, reservado para um contexto que precise assinar a página
(ex. um subdomínio ou área específica).

---

## Ícone de correção compacto — `CorrectionIcon.svelte`

O SVG isolado dos quatro estados de `CorrectionState.svelte`, para linhas de lista onde o bloco
inteiro (ícone + rótulo + caixa de resposta) é pesado demais: fila de resultados, resposta de
uma tentativa, resumo do resultado do Player. **Cor nunca sozinha** — todo lugar que usa este
componente também renderiza texto ao lado.

Props: `{ state?: 'correct' | 'partial' | 'incorrect' | 'pending'; size?: number; animate?: boolean }`.
`animate` dispara o traço do check (`en-draw`, 700ms) — só a tela de resultado com feedback
habilitado usa isso, uma vez, na abertura da página.

---

## Faixa de distribuição — `ScoreBar.svelte`

Barra de proporção correto/parcial/incorreto para os cartões de atividade em
`(studio)/resultados` e a lista de itens por dificuldade em `resultados/[activityId]`.
**Parcial tem segmento próprio** — nunca é somado ao erro (mesma regra de `ResultTrack.svelte`,
mas aqui a largura é proporcional à contagem, não um segmento por item).

Props: `{ correct?: number; partial?: number; incorrect?: number; height?: string; animate?: boolean; delay?: number }`.
`height` aceita qualquer utility de altura do Tailwind (`"h-2"` padrão, `"h-[9px]"` na lista de
itens). `delay` (ms) escalona a animação de entrada quando várias barras aparecem numa lista.

---

## Próximos 7 dias — `SemanaDeEnvios.svelte`

Props: `{ dias: DiaDaSemana[]; rotulo?: string }` — `dias` sai de `proximosDias` (`$lib/modulos/agenda.ts`).
A mesma faixa na lista de módulos (de todos e de cada um) e no módulo aberto. Um cartão por TURMA por
dia, porque é uma liberação por turma por data ("Frutas 3 +1"); cada um abre a programação daquela turma
(`?turma=`). O dia com envio é largo e o vazio estreito (`grid-cols-(--cols-lg)`, montado dos dias),
para a semana caber numa linha sem espremer o que importa; no celular a faixa rola de lado e o dia
vazio continua ali — "nada" é informação. Rascunho é contorno tracejado MAIS o aviso escrito, nunca só
a cor.

## Etiqueta de cor — `SeletorDeEtiqueta.svelte`

Props: `{ cor: $bindable; sigla: string; name?: string; rotulo? }`.

Turma e módulo escolhem a cor pela ETIQUETA já com a sigla (`CLASSE_DA_ETIQUETA`, quadrado de 48px com
o de 32px dentro), não por uma bolinha de cor: o professor vê como ela vai aparecer na lista. São
rádios de verdade (as setas andam entre as cores; com `name`, o valor vai no `<form>`), e o nome da
cor vai no texto escondido e no `title` (`NOME_DA_COR`, `$lib/etiquetas.ts`) — cor sozinha não se
anuncia. Era o mesmo markup copiado em quatro formulários, cada um num tamanho; agora é o componente
em "Nova turma", "Editar turma", "Novo módulo" e "Editar módulo" — e a `marca` da bandeja mostra a
etiqueta grande, mudando junto.

## Tag de idioma — `IdiomaTag.svelte` + `FiltroIdioma.svelte`

O idioma que o aluno aprende, em atividade, turma e material (`$lib/idiomas.ts`, paginas.md "Tags de
idioma"). `IdiomaTag` — props `{ tag: string | null | undefined; compacta?: boolean; class?: string }`:
o código do idioma (`EN`, `JA`) num quadradinho em mono — é o subtag BCP-47 — e o nome em português
ao lado. **Sem cor própria**: idioma é metadado, não estado (verde/âmbar/vermelho são da correção) nem
identidade (essa é a etiqueta da turma). Sem tag, contorno tracejado e "sem idioma". `compacta` mostra
só o código, com o nome no `title` e no `sr-only` — para linha densa.

`FiltroIdioma` — props `{ tags; valor?: $bindable; formato?: 'select' | 'chips'; id?; onmudou?(valor) }`.
Senta ao lado dos filtros que a tela já tem, no MESMO formato deles. Oferece só os idiomas presentes
em `tags` (mais "sem idioma") e some quando há um só. O valor é `''` (todos), uma tag ou
`SEM_IDIOMA`; quem filtra é `casaComFiltro`.

## Avatar — `Avatar.svelte` + `AvatarEditor.svelte`

O avatar da conta (professor e aluno). Pixel art de 16×16 gerada de um código de **dezoito
números** — nunca uma imagem. O porquê está em `$lib/avatar/montar.ts`: cabe numa coluna de texto,
viaja no `load` sem custo, não passa pelo bucket e não tem prazo de validade.

O módulo é isomórfico e dividido por responsabilidade: `pecas.ts` (o desenho), `paletas.ts` (as
cores — **a única pasta do projeto onde hex literal é certo**, porque são cor de CONTEÚDO: o avatar
de alguém não pode mudar de pele quando o tema escuro entra), `montar.ts` (a composição pura),
`catalogo.ts` (o que o editor mostra), `editar.ts` (as operações do editor) e `schema.ts` (a
fronteira de validação).

`Avatar.svelte` — props `{ codigo?: string | null; nome?: string; size?: number; radius?: string; class?: string }`.
**Sempre um rosto, nunca iniciais.** Sem código gravado — a conta antiga que nunca abriu o editor, o
aluno da chamada sem conta — o desenho é o `avatarPadrao(nome)`: um sorteio com o NOME como semente
(passado por NFC), o mesmo rosto para a mesma pessoa em toda tela e todo aparelho, sem gravar nada.
Conta nova já nasce com um sorteado (hook de cadastro das duas instâncias de auth), e salvar o
perfil de quem não tem grava o rosto de agora antes de o nome mudar. Ele é
`aria-hidden`: o nome está sempre ao lado, e anunciar "imagem" só somaria ruído.
`shape-rendering="crispEdges"` é o que faz pixel art continuar pixel art — sem ele o browser
suaviza a escala e cada quadrado ganha uma borda cinza.

**É o ícone da pessoa em TODO lugar onde ela aparece** — nunca um círculo de iniciais à mão. Do
professor: barra lateral, cabeçalho do celular, gaveta, coordenação da escola. Do aluno: chamada da
turma, ficha do aluno, tentativas (lista e detalhe), cabeçalho da questão no Player, área do aluno e
o mapa do módulo. O avatar do aluno vem da CONTA dele (`StudentAccount.avatar`, da conta logada na
tentativa ou da ligada à ficha); aluno sem conta ganha o `avatarPadrao` do nome.

`AvatarEditor.svelte` — props `{ codigo: $bindable; aberto?: $bindable; nome?; onusar?; oncancelar? }`.
**É a tela de criar personagem de um jogo**, em três colunas: o PALCO (sempre escuro, `panel`, nos
dois temas: a luz da marca, o personagem numa moldura de canto em degrau, o pedestal e o chão
quadriculado em perspectiva, a plaquinha com o `nome`, os três tamanhos reais, "Sortear" e
"Desfazer"), a TRILHA de categorias (um `tablist`, com o cursor de menu ▶ na aberta e um ponto nas
que mudaram desde que o editor abriu) e a OFICINA (o título, o seletor "◀ opção ▶" com a posição,
a nota, a grade de miniaturas e, embaixo, a paleta da peça). "Prontos" é a primeira aba da trilha,
separada das onze categorias, e o seletor dela passa de um personagem montado para o outro. Pele e
fundo, que são só cor, viram miniaturas como as outras — o tom no rosto de agora diz mais que um
quadradinho solto. No celular a trilha vira uma faixa que rola de lado e o palco encolhe para uma
linha.

**O tamanho não muda com o que se escolhe.** O diálogo tem altura e largura FIXAS
(`min(1080px, …)` × `min(680px, …)`; tela cheia abaixo de `lg`) e só a grade rola por dentro. Ele
era do tamanho do conteúdo, centralizado: cada categoria tinha outra quantidade de peças e as abas
quebravam em duas linhas, então o modal encolhia e crescia a cada toque. A nota tem altura mínima de
três linhas pelo mesmo motivo — a grade não sobe e desce entre uma aba e outra. Seis colunas no
desktop: as dezesseis peças de cabelo e de roupa cabem sem rolar.

Toda mudança passa por `mudar()`, que guarda o código anterior: "Desfazer" e o Ctrl+Z voltam um passo
de cada vez (até 50). O rodapé diz quantas partes mudaram desde que o editor abriu; a cor de
uma casa compartilhada conta para a PRIMEIRA categoria que a usa — trocar a cor do cabelo não marca
"a barba mudou". O personagem dá um pulinho em três quadros a cada troca (`animate-salto`, por
`{#key codigo}`). O código de dezoito números nunca aparece na tela (paginas.md "Conta").

**É um `<dialog>` de verdade, não uma `div` com fundo escuro**: foco preso, Escape e backdrop vêm
do elemento, e "sem framework de UI" é razão para usar a plataforma, não para reimplementar o que
ela já faz à mão (e pela metade). Cancelar — inclusive por Escape ou clique no véu — devolve o
avatar como estava ao abrir, senão "fechar sem querer" gravava a mudança. **Fechar anima antes de
fechar** (`animate-modal-saida` e `animate-veu-saida`, `--duration-curta`): o `close()` nativo sumia com diálogo e véu no
mesmo quadro, então o Escape tem o fechar imediato impedido e o `close()` vem no `animationend`
(com um `setTimeout` de rede). O clique no véu cai no próprio `<dialog>` — o `<dialog>` modal não
fecha sozinho por ele. Abre a partir do rosto que a pessoa já vê (o gravado ou o `avatarPadrao`).

**Cada miniatura mostra a escolha no avatar de AGORA**, não num manequim: é a única forma de saber
se aquele cabelo combina com aquela pele. São ~20 avatares por categoria, e é por isso que o
gerador junta pixels vizinhos numa faixa só em vez de emitir um `<rect>` por pixel.

O palco mostra os **três tamanhos reais de uso** — cabeçalho (56, redondo), turma (40) e lista (32)
— embaixo do grande: é ali que se descobre que as sardas somem em 32px, e é para ser assim.

Acessório é a única categoria de escolha MÚLTIPLA (até três ao mesmo tempo, casas 13, 16 e 17).
No teto, a mais antiga sai para a nova entrar: recusar em silêncio deixaria o toque sem resposta, e
avisar "já tem três" num editor de enfeite seria cerimônia demais. A regra está em `editar.ts`, com
teste, junto de `escolhaAtual` (o nome e a posição que o seletor mostra) e `ciclar` (as setas, que
dão a volta nas pontas).

---

## Planos — `PlanosTabela.svelte`

A tabela de planos, UMA para a home (seção `#planos`) e para `(site)/planos`. Props
`{ planoAtual?: PlanoId | null; mostrarCabecalho?; mostrarRodape?; titulo?; lede?; compacto? }`.

**Os preços chegam por `$lib/content/planos.ts` (que os lê de `$lib/billing/precos.ts`), nunca
daqui** — ver paginas.md "Planos e preços". O componente desenha o que aquele arquivo diz.

**É um carrossel** (pedido do dono do repositório): o cartão em foco fica no centro em tamanho
cheio e os vizinhos aparecem a 92%, esmaecidos, com as pontas do trilho sumindo em degradê. **Abre
no Pro.** Embaixo, as setas ‹ › e um ponto por plano (no centro, porque nas laterais elas cobririam
as pontas dos vizinhos no celular). Também andam as setas do teclado com o foco dentro, o arrasto
com o dedo e o clique num cartão do lado (menos no botão dele, que age). O Tab até o botão de um
cartão o traz ao centro (`onfocusin`). **A posição é CSS**: a largura do cartão sai do contêiner
(`@container`, `100cqw`) e o trilho anda `índice × (cartão + vão)` por `translate` — o servidor já
manda o Pro no centro, sem medir nada em JS e sem salto na hidratação. Padrão da APG: região
rotulada, um `group` por cartão ("Pro, 2 de 4") e um `aria-live` com o cartão em foco.

O cartão do plano atual ganha "Seu plano agora", e esse selo vence o destaque de marketing. Recurso
ausente é um **traço apagado, não um X vermelho**: vermelho é a semântica de correção e não decora
comparação de plano. Cada item traz um `sr-only` dizendo "incluído"/"não incluído" — ícone sozinho
não se anuncia.

---

## Material — `MaterialForm.svelte` + `MaterialList.svelte` + `material-form.ts`

O formulário de material é UM, para a biblioteca (`(studio)/materiais`, numa `Bandeja` montada
sobre a lista) e para a etapa 2 do wizard (`atividades/[id]/materiais`, coluna fixa). O que ele faz
e por quê está em paginas.md "Studio"; aqui, como se usa.

**A ordem dos campos é a da decisão**: o que o aluno vai fazer (os cartões de tipo, com o rendimento
logo abaixo), depois idioma e "Como adicionar" (o `Alternador`: um de cada vez, colar uma lista,
gerar com IA) — os dois mudam o que os campos pedem, então ficam logo antes deles —, os campos, e por
último "O que o aluno vai ver". Na edição o "Cancelar" FECHA a bandeja da biblioteca; no wizard ele
devolve a coluna a "Adicionar".

**A PÁGINA é dona do `<form>`**, o componente só desenha os campos com os `name` que
`camposMaterial` espera (mais os hidden de `kind`, `questions` e `lines`). A página envolve
`<MaterialForm>` num `<form {...acao.enhance(...)} class="contents">`, escolhe a remote function
a partir de `modo` e `editando` (os dois são `$bindable`) e acrescenta os hidden que são dela
(`activityId`, `contentId`). Foi assim, e não passando as remote functions como prop, porque cada
contexto tem funções com `Input`/`Output` diferentes e `RemoteForm<...>` não se deixa unificar
sem `any`.

Props: `{ contexto: 'biblioteca' | 'wizard'; conjunto: MaterialRow[]; biblioteca?: MaterialRef[]; contentTag?; dir?; targetLabel?; sourceLabel?; modo?; editando?; resultado?: ResultadoMaterial; salvando?; onfechar?; fecharRotulo?; fecharSoNoCelular? }`.

- `conjunto` é o que o RENDIMENTO conta (a biblioteca inteira, ou o da atividade) e de onde a
  prévia tira as alternativas erradas. `biblioteca` é onde procurar repetido — no wizard é
  atividade + `materiaisDisponiveis`, porque o servidor reaproveita da biblioteca inteira.
- Métodos via `bind:this`: `novo()`, `editar(row)`, `limpar()`. A página chama `editar` da
  linha da lista; o componente carrega os campos CRUS (nunca o resumo) e trava o tipo.
- `resultado` é o `.result` da remote function em uso — as três formas (erro, um material com
  `reused`, lote com contagens) são `ResultadoMaterial`, e as remote functions devolvem
  `ok: true as const` / `false as const` para a união discriminar.
- `contentTag` é `'und'` na biblioteca, que não tem idioma: o `Intl.Segmenter` cai no root e a
  prévia de "montar a frase" continua obedecendo à regra nº 5.

`MaterialList` é a tabela das duas telas (`{ materiais; contexto; contentTag?; dir?; editandoId?; removendoId?; onedit; onremove }`).
No celular a pílula e as ações ficam na primeira linha e o conteúdo na segunda, com as posições
do grid EXPLÍCITAS — item com linha fixa é colocado antes dos automáticos, e sem isso as ações
caíam na coluna 1. `removendoId` é o id da linha, nunca um booleano ("Espera").

`material-form.ts` guarda o que os dois loaders e as duas páginas compartilham: `MaterialRow`
(a linha das listas, com os campos crus para editar), `TIPOS` (rótulo, "o que o aluno faz",
ícone e tom da pílula) e os mapas `KIND_TO_KERNEL` / `KERNEL_TO_KIND`. O catálogo tem os dois
componentes nos dois contextos: `/dev/components#materiais`.

---

## Indicador de etapas — `Stepper.svelte`

As quatro etapas do wizard de criação (Detalhes → Materiais → Revisar → Publicar), usado no
cabeçalho de cada tela em `(studio)/atividades/nova` e `[id]/{materiais,revisar,publicar}`.
Etapa concluída vira check verde; a atual fica destacada com `aria-current="step"`.

Props: `{ current?: number }` (1 a 4). Os rótulos são fixos — não um prop, porque o wizard tem
exatamente essas quatro etapas e não outras; se um quinto passo aparecer um dia, mude o array
`steps` dentro do componente, não invente uma prop de lista para um caso que nunca varia.

---

## Campos adicionais — `select`, `textarea`, `toggle`

Mesma família de `@utility` do `.input` (`app.css`, logo depois do `.fieldset`), para os
formulários do Studio que `TextField.svelte` não cobre.

- `.select` — mesma altura e borda do `.input`, seta própria via `background-image` (SVG
  embutido, não ícone de fonte), refletida para RTL com `&:dir(rtl)`.
- `.textarea` — mesmo tratamento de borda/foco do `.input`, `resize: vertical`. Usado no
  material colado (`atividades/[id]/materiais`), no comentário do professor sobre uma resposta
  (`resultados/[activityId]/[attemptId]`) e na resposta longa do Player
  (`WritingInteraction.svelte`).
- `.toggle` (+ `.toggle-primary`, `.toggle-xs`) — `<input type="checkbox">` estilizado como
  interruptor, trilha e polegar via `::before`, **sem imagem**. A posição do polegar usa
  `inset-inline-start`, não `left` — funciona igual em RTL de graça. Usado nas configurações de
  publicação (código de acesso, mostrar resultado) e nos flags de correção do editor de item
  (ignorar acento/caixa/pontuação).

Nenhum dos três tem componente Svelte próprio ainda — são só a classe, aplicada direto no
`<select>`/`<textarea>`/`<input type="checkbox">` da tela. Se um padrão de uso se repetir
(rótulo + erro + hint, como `TextField.svelte` já faz para `input`), vale a pena componentizar
então — não preventivamente.

---

## Interações do Player — `interactions/*.svelte`

Cada tipo de interação (kernel.md: `choice · assemble · type · cloze · match · order · select ·
speak`) é um componente em `src/lib/components/interactions/`, montado por
`src/routes/a/[slug]/q/[n]/+page.svelte` conforme `item.interaction`. Tipos de prop em
`interactions/types.ts`; o espelho no kernel é `InteractionRuntime`
(`kernel/interactions/types.ts`), sem o `dir` — quem injeta a direção é
`server/player/runtime.ts`, que a lê do `LanguageProfile`. As oito já estão no registry.

Não existe um nono tipo "escrita longa": é `type` com `grading.mode === 'rubric'` (exposto ao
Player como `item.gradedLater`) — `WritingInteraction.svelte` entra no lugar de
`ClozeInteraction.svelte` quando esse flag está ligado, mas a interação continua sendo `type`.

Cada interação abre com um RÓTULO do que se espera ("Escolha uma resposta", "Sua resposta",
"Monte na ordem certa" + "Palavras disponíveis", "Forme os N pares", "Grave sua voz"): sem ele a
coluna da direita é um campo solto sem pergunta. Em `match` os cabeçalhos das colunas são os
nomes dos idiomas, que chegam pelo runtime (`sourceLabel`/`targetLabel`) — não são gabarito.

O celular da home passa três props que só ele usa (paginas.md "Exemplo"): `dicaDeTeclado={false}` no
`AssembleInteraction`, e `corrigida` no `AssembleInteraction` (as peças que sobraram saem) e no
`SpeakInteraction` (o microfone e o "Entendemos" saem — o veredito já diz o que se ouviu). Ali a
questão inteira tem de caber na tela do aparelho; no Player elas ficam no padrão.

`AssembleInteraction` ignora um id já escolhido: duplo clique rápido chega duas vezes antes do
re-render tirar o token do banco, e o mesmo id duas vezes rebenta o `{#each}` com chave.

`OrderInteraction` usa a mesma `svelte-dnd-action` e mantém as SETAS por linha ao lado do
arrastar. Não é redundância: arrastar é o gesto natural de reordenar, as setas são o caminho
do teclado, do leitor de tela e de quem tem dificuldade motora — e, ao contrário de um alvo
arrastável, elas dizem o que fazem. Quem arrasta é a linha inteira; a alça de pontinhos é
decorativa (`aria-hidden`), porque sozinha ela seria um alvo de 20px no celular.

`MatchInteraction` recebe o `feedback` e é ELE quem mostra a correção: ligação errada pinta os
dois cartões de vermelho, e o veredito de fora fica só com a linha de estado — ver paginas.md
"Player". Ele lê `feedback.marks` POR ÍNDICE: o servidor devolve uma marca por par respondido,
na mesma ordem em que o componente os mandou.

`SpeakInteraction.svelte` compõe `Recorder.svelte` (`size="lg"`) em vez de duplicar o botão de
gravação — mesma lógica de reuso do resto do catálogo. `AssembleInteraction.svelte` usa
`svelte-dnd-action` de verdade mais o clique como alternativa equivalente (a mesma exigência de
`AssembleTokens.svelte`, mas com legenda de tradução e dica de teclado próprias — os dois
componentes coexistem porque servem contextos diferentes: `AssembleTokens` é o widget genérico
de dois arrays, `AssembleInteraction` é a composição específica de item do Player).

---

## Uma questão como o aluno vê — `PreviaDaQuestao.svelte`

Props: `{ runtime: RuntimeDaQuestao; chave: string; compacta?: boolean }`. Desenha UMA questão —
enunciado, áudio, texto de apoio e a interação — com os componentes do Player, a partir do que
`buildRuntimeItem` devolveu no servidor. É a mesma na prévia da atividade inteira e no editor de
questão: duas prévias desenhadas cada uma do seu jeito divergiam do Player no primeiro tipo novo. A
resposta é estado local (nada é enviado); quem troca de questão remonta com `{#key}`.

## Nomes em português — habilidade e tipo de questão

A tela nunca mostra a chave do kernel. Habilidade sai de `skillLabels`
(`kernel/interactions/skill-schema.ts`: Escuta, Fala, Leitura, Escrita) e tipo de questão de
`ROTULO_DA_INTERACAO` (`$lib/atividades/editor-item.ts`: "Digitar a resposta", "Completar a lacuna",
"Montar a frase"…). Havia quatro mapas com "Listening"/"Writing" espalhados (Player, detalhe,
publicar, editor), e a revisão e os resultados mostravam "assemble" e "type" crus. O modo de
correção que o aluno vê no cabeçalho da questão também é em português ("tolerante", "reconhecimento
de voz", "corrigida pelo professor").

---

## Metadados e prévia de compartilhamento — `Metadados.svelte`

Props: `{ titulo; descricao; tituloDaAba?; imagem?; imagemAlt?; tipo?: 'website' | 'article'; indexar?; publicadoEm?; atualizadoEm?; secao? }`.
As três últimas são do artigo do blog (`tipo="article"`): `article:published_time`,
`article:modified_time` e `article:section`. **Não existe `article:author`**: o blog não assina.
Toda página PÚBLICA abre com ele no lugar de um `<svelte:head>` solto: título da aba, descrição,
canonical, Open Graph (`og:title`, `og:description`, `og:image` com 1200×630 e `alt`, `og:url`,
`og:type`, `og:locale` `pt_BR`, `og:site_name`) e Twitter Card `summary_large_image`.

- **Tudo no HTML inicial, renderizado no servidor.** O robô que monta a prévia do WhatsApp e do
  LinkedIn não roda JavaScript; `e2e/smoke.spec.ts` lê o HTML cru da home para provar isso.
- **URL absoluta** a partir da origem do pedido (`page.url.origin`): em produção, o `ORIGIN` do
  adapter-node faz dela a do domínio público. `og:url` e o canonical são a mesma URL, sem query.
- **As imagens são duas, em `static/og/`**: `spokke.png` (a marca e a promessa, padrão) e
  `atividade.png` (o link que o professor manda para a turma e o convite de turma). Foram
  desenhadas em HTML com os tokens da marca e renderizadas pelo Chromium do Playwright; mudar a
  promessa pede gerar de novo, no mesmo tamanho. No artigo do blog a imagem é a capa dele (JPEG
  em `static/blog/capas/`), e o `og:image:type` sai da extensão do arquivo.
- **`indexar={false}`** dá `noindex` e tira o canonical, mas MANTÉM a prévia: é o caso do link da
  atividade (`a/[slug]`: o título dela e "N questões de inglês, uns M minutos" — nunca uma
  questão, e `e2e/aluno.spec.ts` confere que o gabarito não aparece) e do convite de turma.
- As áreas logadas (painel, administração, área do aluno, telas do Player) levam
  `<meta name="robots" content="noindex">` no layout; entrar e recuperar a senha também, o
  cadastro não. O `robots.txt` bloqueia só `/api/`: bloquear `/a/` impediria o robô da prévia de
  ler o título do link.
- **Título da aba com "·", nunca travessão** (voz do projeto de SEO): "Planos e preços · Spokke".
  **O padrão vale para o site INTEIRO** — páginas públicas, Studio, Player, painel interno e erro:
  **o que é a página · onde ela fica · Spokke**, do mais específico para o mais geral, e a marca
  sempre por último. "Atividades · Spokke", "Present perfect · Atividades · Spokke", "Publicar ·
  Present perfect · Spokke", "Questão 3 · Present perfect · Spokke", "Pedidos · Painel interno ·
  Spokke", "Assinatura · Conta · Spokke". Sem termo interno ("Revisar questões", não "Revisar
  itens"). A ÚNICA que começa pela marca é a home, que é a que conta para busca. Havia "— Spokke",
  "— painel interno" e "— resultados" misturados, e três telas do Player sem a marca.

## Casca das páginas públicas — `SiteHeader.svelte`, `SiteFooter.svelte`, `SiteHero.svelte`, `LegalPage.svelte`

A home e as páginas institucionais (`(site)/**`) compartilham cabeçalho e rodapé — é um desenho
só, não dois parecidos. `(site)/+layout.svelte` monta `SiteHeader`/`SiteFooter` direto; a home
monta os dois também, e só ela usa o snippet `extra` de `SiteHeader` pra acrescentar o toggle de
tema manual (home.md "Toggle de tema" — nenhuma outra página pública tem esse controle, seguem
`prefers-color-scheme` puro).

O rodapé tem, no bloco da marca, os ícones das redes (`redes` em `institucional.ts`: sem `url` o
ícone fica sem link, com o mesmo hover do que terá link — a fileira não muda quando os perfis
entrarem) e, na linha de baixo, oposto ao "©", os selos de
verificação (SSL e Google Safe Browsing, `selosDeVerificacao`), em PNG próprio
(`static/selos/`, gerado por `scripts/gerar-selos.mjs`): a imagem é o link, e o `alt` diz o que
ele faz. O domínio verificado é o da página
aberta (`page.url`), com `dominioDoSite` (`spokke.com.br`) só em localhost — ver
`docs/selos-e-seguranca.md` "5b".

**No celular a navegação do `SiteHeader` vive num menu** (o "Blog Cabecalho" do Claude Design): o
botão de três linhas abre, abaixo da barra, os links e o "Entrar no Studio" em largura inteira;
Esc e o clique num link fecham. No desktop nada muda. O link da rota em que se está ganha
`aria-current="page"` (as âncoras da home nunca contam). **O "Blog" é item fixo**: o último da nav da
home (`defaultNav`) e da de `(site)`, e um link da coluna "Plataforma" do rodapé.

**Medição — `MedicaoDoSite.svelte`**, no layout raiz. Sem `PUBLIC_GA_ID` não renderiza nada. Com
ele, mostra o aviso de medição (no celular, menos de um oitavo da altura) só nas páginas públicas
(`rotaMedida` em `$lib/client/medicao.ts`), e o Google Analytics só carrega depois do "Aceitar".
Um ouvinte de clique registra os elementos marcados com `data-evento` (mais `data-rotulo` e
`data-artigo`): a tela marca o HTML e não importa nada. O rodapé tem "Preferências de cookies"
(só com a medição ligada), que revoga e faz o aviso voltar.

**A cada troca de tela o envio é ligado ou desligado** (`ligarEnvio`, o interruptor oficial
`ga-disable-<ID>` do Google). O gtag.js fica na página depois de uma navegação do SvelteKit, e a
medição AUTOMÁTICA dele — tempo na página, rolagem, cliques, formulários — não passa por
`rotaMedida`: quem aceitava na home e entrava no Studio pelo link levava o Google junto. Revogar
também desliga o envio, porque só negar o consentimento com o script carregado ainda manda avisos
sem cookie. O que já estava na fila sai (o `sign_up` do cadastro chega mesmo com a navegação
seguindo para o Studio) — medido com o gtag.js de produção, e garantido em `medicao.test.ts`.

`SiteHeader` recebe `nav` (array `{ href, label }`) com default apontando pras âncoras da home
(`/#habilidades` etc.) — páginas fora da home passam a própria lista. **Resolva rota real com
`resolve()` na hora de montar o array**, não dentro do componente: o `<a href={item.href}>` do
header/footer lê uma variável, não um literal, então o lint não tem como saber se já passou por
`resolve()` — é responsabilidade de quem constrói o array (`SiteFooter.svelte` já faz isso pras
próprias colunas; `(site)/+layout.svelte` faz o mesmo pra `nav`).

`SiteHero` é o banner de topo das páginas institucionais (`eyebrow`, `title`, `lede`, `updated?`),
com a mesma composição de formas de ambiente confinada a uma faixa lateral sem texto.
`LegalPage` compõe `SiteHero` com um índice numerado fixo à esquerda no desktop — recebe
`sections: LegalSection[]` de `$lib/content/institucional.ts`, nunca texto solto na rota.

---

## Blog — `src/lib/components/blog/`

Os desenhos do projeto "Blog" do Claude Design, **menos o autor** (nenhum componente desenha nome,
foto ou caixa de autor). Regras de rota em paginas.md "Blog"; conteúdo em `docs/blog.md`.

- `CartaoDoArtigo` — `{ artigo: ResumoDoArtigo; variante?: 'padrao' | 'destaque' | 'compacto'; selo? }`.
  O cartão inteiro é clicável pelo `::after` do link do TÍTULO (o leitor de tela lê um link com o
  nome do artigo). Chips: tema, "Para escolas" (público escola/ambos) e "Rascunho" (só em dev).
  `padrao` sem capa não tem imagem; o `destaque` sem capa mostra a composição de formas de
  `IlustracaoDoArtigo` (três, escolhida pelo slug). Só o rascunho fica sem capa: todo artigo no ar
  tem uma foto (docs/blog.md "Capas"). Hover: `cartao-interativo`.
- `ConversaoDoBlog` — `{ publico; slug?; variante?: 'escura' | 'clara'; titulo? }`: a faixa final.
  Texto e destinos saem de `conversaoDoPublico` (`$lib/blog/links.ts`), com `?origem=`.
- `NoSpokke` — o bloco "No Spokke" / "Na sua escola": filete de 4px na marca, o texto e UMA chamada.
- `ExemploPronto` — as frases no idioma alvo (`data-content-lang`, `lang` e `dir` do profile, que o
  servidor já resolveu), a tradução embaixo e "Copiar a lista" (só as frases, uma por linha: o
  formato da lista colada). Sem área de transferência, o botão diz para copiar à mão.
- `SumarioDoArtigo` — `formato: 'celular'` é um `<details>` nativo; `'lateral'` é a coluna fixa que
  marca a seção atual (a última cujo título passou de 160px do topo) com `aria-current="location"`.
- `PerguntasFrequentes` (`<details>`, a primeira aberta), `CompartilharArtigo` (copiar link e
  WhatsApp, sem script de terceiro), `Migalhas` (a página atual sem link), `ChipsDeTemas` (temas
  como links, mais "Para escolas"), `PaginacaoDoBlog` (links de verdade, não a `Pagination` do
  Studio), `IndiceDoBlog` e `HubDoBlog` (o corpo das páginas) e `DadosEstruturados` (o JSON-LD, com
  `<` escapado e a tag montada por partes — o nome dela inteiro dentro do `<script>` do componente
  confunde o parser do Svelte e o do Prettier).

O texto do Markdown é desenhado pela utility `prosa-do-blog` (`app.css`), aplicada SÓ nos blocos de
texto: dentro de um componente ela pintaria o `<ol>` e o `<p>` dele.

---

## Entrada em scroll — `src/lib/actions/reveal.ts`

A animação nasce **rodando**; a action só pausa e despausa via `IntersectionObserver`. Nunca
prenda um bloco em `opacity: 0` esperando JS.

```svelte
{#each cards as card, i (card.id)}
	<div class="reveal-row" use:reveal={{ ordem: i }}>…</div>
{/each}
```

Bloco de seção entra sem atraso; cartões dentro de uma grade passam a ORDEM, e o `reveal-row` calcula
o atraso com o `--stagger` (60 ms, teto no 6º) — a action não escolhe milissegundos.

---

## Seletor em pílula — `Alternador.svelte`

Props: `{ opcoes: { id, label }[]; valor: $bindable; rotulo: string; largura?: 'cheia' | 'auto'; onmudar?; class? }`.
O controle de poucas opções lado a lado (entrar como professor/aluno, um a um / colar uma lista,
alunos / envios). **A pílula desliza** até a opção escolhida — é um elemento só, posicionado pelo
índice entre colunas iguais, andando por `translate` em `--duration-media` com `--ease-in-out-soft`;
nada de medir largura em JS. Botões com `aria-pressed` num `role="group"` rotulado, e não abas:
nenhuma das telas tem painel de aba de verdade. Era o mesmo markup copiado em cinco telas.

## Cartão clicável — `cartao-interativo` (utility)

O cartão que é um link inteiro (peça do início, turma, atividade enviada, módulo do aluno, cartões
da home): sobe 3 px, a borda puxa para a cor da marca e ganha sombra na cor da marca; ao apertar, afunda
um nada. Um gesto, uma utility — cada tela tinha o seu, com 2, 3 e 5 px e `transition-all`.
Controle pequeno (chip, opção, token) não usa: sobe 2 px com `hover:-translate-y-0.5`.

---

## Google — `(auth)/BotaoGoogle.svelte` + `LigarGoogle.svelte`

As duas portas do Google, e as duas só aparecem com ele ligado no servidor (auth.md "Login com
Google"). A marca do Google é um arquivo (`static/marcas/google.svg`), não um SVG com cor de tema:
as regras de marca do botão pedem o G original, com as cores dele.

- `BotaoGoogle` — props `{ como: 'professor' | 'aluno'; destino; destinoDeQuemChega?; voltaComErro }`.
  "Continuar com o Google" em entrar e em criar conta: escolhe o cliente pelo `como` e diz para onde
  voltar (quem já tinha conta, quem acabou de criar, e a própria tela quando dá erro). Espera com a
  `fila` até a página trocar.
- `LigarGoogle` — props `{ como; email; ligado; temSenha; aqui }`. O corpo do cartão "Entrar com o
  Google" da Conta e da área do aluno: liga (`linkSocial`, com o e-mail igual) e desliga só quando
  sobra a senha. Lê a volta do Google (`?google=ligado` / `?google=erro&error=…`) e diz o que
  aconteceu. A página põe a moldura do cartão.

## Relatar problema — `a/[slug]/q/[n]/RelatarProblema.svelte`

O `<dialog>` do relato de problema (paginas.md "Player"). Props `{ aberto ($bindable); questao;
total; temAudio; fala; montar }` — `montar` é a função da tela que junta, NA HORA de enviar, o que
vai além do motivo. É carregado com `import()` no primeiro clique, e o tipo da entrada sai da remote
function (`Parameters<typeof relatarProblema>[0]`), sem importar nada de `$lib/server`.
