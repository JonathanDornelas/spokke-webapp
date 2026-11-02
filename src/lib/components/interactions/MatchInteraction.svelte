<script lang="ts">
	import type { ClozeFeedback, MatchPair, MatchRuntimeItem } from './types';

	// Parear. O NÚMERO no par substitui a linha desenhada: funciona em tela
	// estreita, sobrevive a RTL e é anunciável por leitor de tela.
	// Correção por conjunto — a ordem dos pares não importa.
	let {
		item,
		pairs = $bindable([]),
		leftLabel = '',
		rightLabel = '',
		feedback = null
	}: {
		item: MatchRuntimeItem;
		pairs?: MatchPair[];
		leftLabel?: string;
		rightLabel?: string;
		/**
		 * O veredito, quando já respondeu. Diferente das outras interações, a
		 * correção do `match` aparece AQUI: cada ligação errada pinta os dois
		 * cartões dela. Os cartões estão na tela — repetir "bookshop → relatório"
		 * num texto embaixo diria a mesma coisa duas vezes, e a segunda pior.
		 */
		feedback?: ClozeFeedback | null;
	} = $props();
	let pendingLeft: string | null = $state(null);

	/**
	 * Quais ligações não fecharam. As marcas vêm do servidor na MESMA ordem em
	 * que este componente mandou os pares, então o índice liga uma coisa à
	 * outra.
	 */
	const errados = $derived(
		(feedback?.marks ?? []).flatMap((marca, i) => {
			const par = pairs[i];
			// Lista e não `Set`: um `Set` comum dentro de `$derived` não é reativo
			// no Svelte 5 (o lint cobra o `SvelteSet`), e com no máximo cinco pares
			// na tela o `includes` custa o mesmo.
			return !marca.ok && par ? [par.left, par.right] : [];
		})
	);
	const respondido = $derived(feedback !== null);

	/**
	 * Cor de um cartão já pareado. Errado é vermelho; certo continua no violeta
	 * de "pareado" em vez de virar verde — pintar de verde o que sobrou seria
	 * dizer "estes estão certos" também quando o professor desligou o resultado.
	 * Classes inteiras e literais: o Tailwind só gera o que aparece completo.
	 */
	function tomDoPar(id: string): string {
		if (!respondido) return 'border-primary bg-base-300 text-primary';
		return errados.includes(id)
			? 'border-error bg-error/10 text-error'
			: 'border-primary bg-base-300 text-primary';
	}

	const indexOfLeft = (id: string) => pairs.findIndex((p) => p.left === id);
	const indexOfRight = (id: string) => pairs.findIndex((p) => p.right === id);

	function pickLeft(id: string) {
		if (respondido) return;
		pendingLeft = pendingLeft === id ? null : id;
	}
	function pickRight(id: string) {
		if (respondido || pendingLeft === null) return;
		const left = pendingLeft;
		pairs = [...pairs.filter((p) => p.left !== left && p.right !== id), { left, right: id }];
		pendingLeft = null;
	}

	const cell =
		'flex min-h-12 items-center rounded-box border-[1.5px] px-3.5 py-3 text-base transition-[transform,border-color,translate,scale] duration-150 hover:-translate-y-0.5';
	const badge = 'grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold me-2.5';
</script>

<p class="mb-3.5 text-[12.5px] font-semibold text-base-content/65">
	Forme os {item.left.length} pares
</p>

<div class="grid grid-cols-2 gap-2.5">
	<div class="grid gap-2.5">
		{#if leftLabel}
			<p class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
				{leftLabel}
			</p>
		{/if}
		{#each item.left as l (l.id)}
			{@const n = indexOfLeft(l.id)}
			{@const active = pendingLeft === l.id || n >= 0}
			<button
				type="button"
				onclick={() => pickLeft(l.id)}
				disabled={respondido}
				dir={item.dir}
				class="{cell} text-start font-content
				       {active ? tomDoPar(l.id) : 'border-b-[3px] border-line bg-base-100 hover:border-primary'}"
			>
				<span
					class="{badge} {n >= 0
						? 'bg-primary text-primary-content'
						: active
							? 'bg-primary/30 text-primary'
							: 'border-[1.5px] border-dashed border-line'}"
				>
					{n >= 0 ? n + 1 : ''}
				</span>
				{l.text}
			</button>
		{/each}
	</div>
	<div class="grid gap-2.5">
		{#if rightLabel}
			<p class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
				{rightLabel}
			</p>
		{/if}
		{#each item.right as r (r.id)}
			{@const n = indexOfRight(r.id)}
			<button
				type="button"
				onclick={() => pickRight(r.id)}
				disabled={respondido}
				class="{cell} text-start
				       {n >= 0 ? tomDoPar(r.id) : 'border-b-[3px] border-line bg-base-100 hover:border-primary'}"
			>
				<span
					class="{badge} {n >= 0
						? 'bg-primary text-primary-content'
						: 'border-[1.5px] border-dashed border-line'}"
				>
					{n >= 0 ? n + 1 : ''}
				</span>
				{r.text}
			</button>
		{/each}
	</div>
</div>

<p
	class="mt-4 flex items-center gap-2.5 rounded-field border border-line bg-base-200 px-3.5 py-3
	       text-[12.5px] leading-snug text-base-content/65"
>
	Toque numa palavra, depois no sentido. O par ganha um número.
</p>
