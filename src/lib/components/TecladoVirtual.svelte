<script lang="ts">
	// O teclado virtual do campo de resposta. Não conhece idioma nenhum: recebe
	// o layout (`Teclado`, do `LanguageProfile`) e emite o que foi tocado. Quem
	// sabe onde está o cursor e aplica a edição é o campo — ver
	// `campo-com-teclado.svelte.ts` e `teclado-edicao.ts`.
	//
	// **Dois formatos, e a diferença é o teclado do APARELHO:**
	//
	// - `barra` — uma linha de acentos sob o campo, e o teclado do sistema
	//   continua aberto. Ele escreve as letras; a barra completa o `ç` e o `é`.
	// - `grade` — o teclado inteiro do script, e o campo desliga o do sistema
	//   (`inputmode="none"`) enquanto ela está aberta: o aparelho não escreve
	//   kana nem árabe, e os dois juntos cobririam a questão. No Player a grade
	//   fica ENCAIXADA acima do rodapé (`docado`), como o teclado de um celular:
	//   a questão rola por cima dela, e ela não sai do lugar.
	//
	// **A grade nasce OCULTA** — pedido do dono do repositório. Aberta por
	// padrão ela ocupava metade da tela do celular antes de o aluno ler a
	// pergunta. Quem abre é o aluno ("Teclado", no rodapé do Player), e ela sobe
	// de baixo como o teclado de um celular (`teclado-in`/`teclado-out`, no
	// `app.css`); "Ocultar" a desce. Oculta, o campo devolve o teclado do sistema
	// — quem já tem o do idioma no celular não precisa deste.
	//
	// **Tocar numa tecla não tira o foco do campo** (`pointerdown` sem o padrão):
	// sem isso o cursor sumia a cada letra, e no celular o teclado do sistema
	// fechava e abria entre um toque e outro.
	import { untrack } from 'svelte';
	import type { Acao } from './campo-com-teclado.svelte';
	import { pronuncia } from '$lib/client/pronuncia.svelte';
	import {
		teclasDoGrupo,
		type GrupoDeTeclas,
		type Tecla,
		type Teclado
	} from '$lib/kernel/language/teclado';

	let {
		teclado,
		aberto = $bindable(false),
		desativado = false,
		docado = false,
		onacao,
		onocultar
	}: {
		teclado: Teclado;
		/** Só vale para a grade. Escondida, o campo devolve o teclado do sistema. */
		aberto?: boolean;
		desativado?: boolean;
		/**
		 * Encaixado no rodapé da tela (Player). Aí quem oferece "Teclado" para
		 * reabrir é a TELA, no rodapé; solto (prévia, catálogo), o próprio
		 * componente deixa o botão no lugar.
		 */
		docado?: boolean;
		onacao: (acao: Acao) => void;
		/** Chamado quando o aluno oculta a grade — a tela tira o foco do campo. */
		onocultar?: () => void;
	} = $props();

	/**
	 * `aberto` é o que o aluno pediu; `montado` é o que está na tela. Os dois se
	 * separam só enquanto a grade DESCE: ela continua montada até a animação de
	 * saída terminar (`animationend`), senão sumiria de uma vez. Com
	 * `prefers-reduced-motion` a animação dura 0,01 ms e o fim chega na hora.
	 */
	let montado = $state(untrack(() => aberto));
	let saindo = $state(false);
	$effect(() => {
		if (aberto) {
			montado = true;
			saindo = false;
		} else if (untrack(() => montado)) saindo = true;
	});
	function fimDaAnimacao(evento: AnimationEvent) {
		if (evento.target !== evento.currentTarget || !saindo) return;
		montado = false;
		saindo = false;
	}

	function ocultar() {
		aberto = false;
		onocultar?.();
	}

	$effect(() => pronuncia.sincronizar());

	let grupoAtivo = $state(0);
	let varianteAtiva = $state(0);
	const grupo = $derived(teclado.grupos[grupoAtivo] ?? teclado.grupos[0]);
	const troca = $derived(teclado.variantes?.[varianteAtiva]?.troca ?? {});

	/** A chave de pronúncia só existe se alguma tecla tiver pronúncia — no pinyin, a tecla já é a pronúncia. */
	const temLeitura = $derived(teclado.grupos.some((g) => teclasDoGrupo(g).some((t) => t.leitura)));

	/** O que a tecla escreve AGORA — o `か` vira `カ` com o katakana ligado. */
	const escrita = (t: Tecla) => troca[t.char] ?? t.char;

	/**
	 * O nome do idioma em português, sem tabela escrita à mão: o `Intl` já sabe
	 * que `ar` é "árabe". É o que o leitor de tela anuncia ao entrar no teclado.
	 */
	const nomeDoIdioma = $derived.by(() => {
		try {
			// Só o idioma, sem o script: `zh-Latn-pinyin` é "chinês", não
			// "chinês (latim, pinyin)".
			const idioma = new Intl.Locale(teclado.lang).language;
			return new Intl.DisplayNames(['pt-BR'], { type: 'language' }).of(idioma) ?? idioma;
		} catch {
			return teclado.lang;
		}
	});

	/** As três primeiras teclas do grupo, como aparecem nelas. */
	function amostra(g: GrupoDeTeclas): string {
		return teclasDoGrupo(g)
			.filter((t) => !t.acao)
			.slice(0, 3)
			.map((t) => t.label ?? escrita(t))
			.join(' ');
	}

	function tocar(t: Tecla) {
		if (t.acao) onacao({ tipo: 'trocar', mapa: t.acao.mapa });
		else onacao({ tipo: 'inserir', texto: escrita(t) });
	}

	/**
	 * Numa grade de colunas FIXAS, espaço e apagar ocupam o resto da última
	 * linha em vez de abrir uma nova — é o que faz o kana caber em seis linhas.
	 * Sobrando menos de três casas, eles descem para uma linha própria — o
	 * `grid-column: span` que não cabe no resto da linha já pula sozinho.
	 */
	const chrome = $derived.by(() => {
		const colunas = grupo?.colunas;
		if (!colunas || !grupo) return null;
		const sobra = (colunas - (grupo.teclas.length % colunas)) % colunas;
		return sobra >= 3 ? { espaco: sobra - 2, apagar: 2 } : { espaco: colunas - 2, apagar: 2 };
	});

	/** Mantém o foco onde está — no campo, que é onde o cursor mora. */
	function naoRoubarFoco(evento: PointerEvent) {
		evento.preventDefault();
	}

	const tecla =
		'flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-[9px] border border-b-2 px-0.5 leading-none ' +
		'transition-[border-color,background-color,transform,translate,scale] duration-150 active:translate-y-[2px] ' +
		'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary disabled:opacity-50';
	// A ALTURA da tecla da grade acompanha a da tela: 44px num celular alto,
	// 34px num iPhone SE, 32px no piso. Fixa em 48 (o alvo de toque do Player),
	// as seis linhas do kana passavam de 300px e sobravam ~110px para a questão
	// numa tela de 667 — é o que todo teclado nativo faz, e a LARGURA de uma
	// tecla de 10 colunas já fica abaixo de 48 de qualquer jeito. O `min-h-0`
	// solta a regra de 48px do Player (`[data-surface="player"] button`).
	const altura = 'h-[clamp(2rem,5.2dvh,3rem)] min-h-0';
	const letra = `${tecla} border-line bg-base-100 font-content text-base-content hover:border-primary`;
	const teclaDeLetra = `${letra} ${altura} text-[17px] lg:text-[20px]`;
	// `゛` e `゜` são marcas: no corpo da letra elas somem num canto da tecla.
	const teclaDeAcao = `${tecla} ${altura} border-primary/30 bg-base-300 font-content text-[20px] font-semibold text-primary hover:border-primary lg:text-[23px]`;
	const teclaDeEspaco = `${tecla} ${altura} border-line bg-base-100 text-[13px] font-semibold text-base-content/65 hover:border-primary`;
</script>

{#snippet botao(t: Tecla)}
	<button
		type="button"
		lang={teclado.lang}
		aria-label={t.nome}
		title={t.nome}
		disabled={desativado}
		onpointerdown={naoRoubarFoco}
		onclick={() => tocar(t)}
		class={t.acao ? teclaDeAcao : teclaDeLetra}
	>
		<span>{t.label ?? escrita(t)}</span>
		{#if pronuncia.ligada && t.leitura}
			<!-- Escondida do leitor de tela: ele já pronuncia a letra no `lang`
			     certo, e ler "ka" depois de "か" seria dizer a mesma coisa duas vezes. -->
			<span aria-hidden="true" class="font-mono text-[9.5px] text-base-content/60">{t.leitura}</span
			>
		{/if}
	</button>
{/snippet}

{#snippet espaco(span?: number)}
	<button
		type="button"
		disabled={desativado}
		onpointerdown={naoRoubarFoco}
		onclick={() => onacao({ tipo: 'inserir', texto: ' ' })}
		style={span ? `grid-column: span ${span}` : undefined}
		class={teclaDeEspaco}>espaço</button
	>
{/snippet}

{#snippet apagar(span?: number)}
	<button
		type="button"
		disabled={desativado}
		aria-label="Apagar"
		onpointerdown={naoRoubarFoco}
		onclick={() => onacao({ tipo: 'apagar' })}
		style={span ? `grid-column: span ${span}` : undefined}
		class={teclaDeAcao}
	>
		<!-- A seta aponta para o INÍCIO do texto: no árabe é a direita. -->
		<svg
			class="size-5 {teclado.dir === 'rtl' ? '-scale-x-100' : ''}"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M9 5.5h10.5a1.5 1.5 0 011.5 1.5v10a1.5 1.5 0 01-1.5 1.5H9L3.5 12z"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
			/>
			<path
				d="M11.5 9.5l5 5M16.5 9.5l-5 5"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
	</button>
{/snippet}

{#if teclado.formato === 'barra'}
	<!-- Uma linha só. Se não couber, rola na horizontal — quebrar em duas linhas
	     empurraria o botão de verificar para baixo da dobra. O `contain` é o que
	     faz ela ROLAR em vez de alargar a tela: sem ele, as dezoito teclas do
	     francês viram a largura mínima de todo item de flex ou grid acima dela, e
	     a página inteira passava a rolar de lado no celular. -->
	<div
		role="group"
		aria-label="Acentos do {nomeDoIdioma}"
		dir={teclado.dir}
		class="-mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1 pb-1 [contain:inline-size]"
	>
		{#each grupo ? teclasDoGrupo(grupo) : [] as t (t.char)}
			<button
				type="button"
				lang={teclado.lang}
				disabled={desativado}
				onpointerdown={naoRoubarFoco}
				onclick={() => tocar(t)}
				class="{letra} h-11 min-w-10 shrink-0 text-[17px] lg:text-[19px]"
				>{t.label ?? t.char}</button
			>
		{/each}
	</div>
{:else if montado}
	<!-- A moldura recorta: o painel sobe DENTRO dela e nunca passa por cima do
	     rodapé nem do campo. -->
	<div class={docado ? 'shrink-0 overflow-hidden' : 'mt-3 overflow-hidden rounded-box'}>
		<div
			role="group"
			aria-label="Teclado de {nomeDoIdioma}"
			onanimationend={fimDaAnimacao}
			class="{saindo ? 'teclado-out' : 'teclado-in'} {docado
				? 'border-t border-line bg-base-200 px-1.5 pt-2 pb-2.5 sm:px-2.5 lg:px-7 lg:pt-3.5 lg:pb-4'
				: 'rounded-box border border-line bg-base-200 p-2 lg:p-3'}"
		>
			<div class="mx-auto max-w-[860px]">
				<div class="mb-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
					{#if teclado.variantes && teclado.variantes.length > 1}
						<!-- Hiragana e katakana: as MESMAS teclas em outra forma. -->
						<div
							class="flex gap-0.5 rounded-full border border-line bg-base-100 p-[3px]"
							role="group"
							aria-label="Forma das letras"
						>
							{#each teclado.variantes as v, i (v.label)}
								<button
									type="button"
									lang={teclado.lang}
									aria-pressed={varianteAtiva === i}
									onpointerdown={naoRoubarFoco}
									onclick={() => (varianteAtiva = i)}
									class="min-h-7 rounded-full px-2.5 py-0.5 font-content text-[12px] font-semibold transition-colors sm:min-h-8 sm:px-3 sm:text-[12.5px]
								       {varianteAtiva === i
										? 'bg-primary text-primary-content'
										: 'text-base-content/65 hover:text-base-content'}">{v.label}</button
								>
							{/each}
						</div>
					{/if}

					{#if teclado.grupos.length > 1}
						<!-- `dir="auto"` em cada aba: com o `rtl` do script, a amostra "0 1 2"
					     dos números aparecia como "2 1 0". -->
						<!-- Um grupo por vez. A aba mostra uma AMOSTRA das próprias teclas,
					     como o "ABC" e o "123" de um teclado nativo — o nome em
					     português ("Consoantes") não cabia numa aba de celular. Ele
					     continua sendo o que o leitor de tela anuncia. -->
						<div
							class="flex gap-0.5 rounded-full border border-line bg-base-100 p-[3px]"
							role="group"
							aria-label="Grupos de teclas"
						>
							{#each teclado.grupos as g, i (g.label)}
								<button
									type="button"
									aria-pressed={grupoAtivo === i}
									aria-label={g.label}
									title={g.label}
									lang={teclado.lang}
									dir="auto"
									onpointerdown={naoRoubarFoco}
									onclick={() => (grupoAtivo = i)}
									class="min-h-7 rounded-full px-2.5 py-0.5 font-content text-[13px] whitespace-nowrap transition-colors sm:min-h-8
								       {grupoAtivo === i
										? 'bg-primary text-primary-content'
										: 'text-base-content/65 hover:text-base-content'}">{amostra(g)}</button
								>
							{/each}
						</div>
					{/if}

					{#if temLeitura}
						<button
							type="button"
							role="switch"
							aria-checked={pronuncia.ligada}
							aria-label="Pronúncia nas teclas"
							onpointerdown={naoRoubarFoco}
							onclick={() => pronuncia.alternar()}
							class="flex min-h-7 items-center gap-2 rounded-full border border-line px-2.5 py-0.5 text-[12px] font-semibold transition-colors sm:min-h-8 sm:px-3 sm:text-[12.5px]
					       {pronuncia.ligada
								? 'bg-base-100 text-base-content'
								: 'text-base-content/65 hover:text-base-content'}"
						>
							<span
								aria-hidden="true"
								class="relative inline-block h-[15px] w-[26px] rounded-full transition-colors
						       {pronuncia.ligada ? 'bg-primary' : 'bg-base-300'}"
							>
								<!-- O polegar anda por `transform` (design-system.md "Movimento"),
						     e o sentido inverte com a interface em RTL. -->
								<span
									class="absolute start-[2px] top-[2px] size-[11px] rounded-full transition-transform
							       {pronuncia.ligada
										? 'translate-x-[11px] bg-primary-content rtl:-translate-x-[11px]'
										: 'bg-base-content/55'}"
								></span>
							</span>
							<!-- No celular a barra divide UMA linha com as formas e o "Ocultar":
					     o rótulo inteiro a quebrava em duas, e cada linha é altura tirada
					     da questão. -->
							<span class="max-[359px]:sr-only"
								>Pronúncia<span class="hidden sm:inline">&nbsp;nas teclas</span></span
							>
						</button>
					{/if}

					<div class="flex-1"></div>

					<button
						type="button"
						aria-expanded="true"
						aria-label="Ocultar o teclado de {nomeDoIdioma} e usar o do aparelho"
						onpointerdown={naoRoubarFoco}
						onclick={ocultar}
						class="flex min-h-7 items-center gap-1.5 rounded-lg px-2 py-0.5 text-[12.5px] font-semibold text-base-content/65
					       transition-colors hover:text-base-content sm:min-h-8"
					>
						<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M6 9l6 6 6-6"
								stroke="currentColor"
								stroke-width="2.2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						<span class="hidden sm:inline">Ocultar</span>
					</button>
				</div>

				{#if teclado.dica}
					<!-- Como responder, quando as teclas sozinhas não dizem: no kana, que o
				     kanji não é pedido; no pinyin, onde vai o tom. -->
					<p
						class="mb-1.5 px-0.5 text-[12px] leading-snug text-base-content/70 lg:mb-2 lg:text-[12.5px] [@media(max-height:600px)]:hidden"
					>
						{teclado.dica}
					</p>
				{/if}

				{#if grupo}
					<!-- A direção das TECLAS segue o script: o alfabeto árabe corre da
				     direita para a esquerda, e é nessa ordem que o aluno o procura. -->
					{#if grupo.colunas && chrome}
						<div
							dir={teclado.dir}
							role="group"
							aria-label={grupo.label}
							class="grid gap-1 lg:gap-1.5"
							style="grid-template-columns: repeat({grupo.colunas}, minmax(0, 1fr))"
						>
							{#each grupo.teclas as t, i (i)}
								{#if t}
									{@render botao(t)}
								{:else}
									<span aria-hidden="true"></span>
								{/if}
							{/each}
							{@render espaco(chrome.espaco)}
							{@render apagar(chrome.apagar)}
						</div>
					{:else}
						<div
							dir={teclado.dir}
							role="group"
							aria-label={grupo.label}
							class="grid grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-1 lg:gap-1.5"
						>
							{#each teclasDoGrupo(grupo) as t (t.char)}
								{@render botao(t)}
							{/each}
						</div>
						<div class="mt-1 grid grid-cols-[1fr_5rem] gap-1 lg:mt-1.5 lg:gap-1.5">
							{@render espaco()}
							{@render apagar()}
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
{:else if !docado}
	<button
		type="button"
		aria-expanded="false"
		onclick={() => (aberto = true)}
		class="mt-3 flex min-h-11 items-center gap-2 rounded-field border border-line bg-base-200 px-3.5
		       text-[13.5px] font-semibold transition-colors hover:bg-base-300"
	>
		<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<rect x="2.5" y="6" width="19" height="12" rx="3" stroke="currentColor" stroke-width="2" />
			<path d="M8 14h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
		Mostrar o teclado de {nomeDoIdioma}
	</button>
{/if}
