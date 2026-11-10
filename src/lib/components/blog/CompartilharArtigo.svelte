<script lang="ts">
	// Compartilhar: copiar o link e mandar pelo WhatsApp, que é por onde o
	// professor manda as coisas para os colegas. Sem botão de rede social com
	// script de terceiro: o link do WhatsApp é só uma URL.
	let { titulo, url }: { titulo: string; url: string } = $props();

	let copiado = $state(false);
	let espera: ReturnType<typeof setTimeout> | undefined;
	const whatsapp = $derived(`https://wa.me/?text=${encodeURIComponent(`${titulo} ${url}`)}`);

	async function copiar() {
		clearTimeout(espera);
		try {
			await navigator.clipboard.writeText(url);
			copiado = true;
			espera = setTimeout(() => (copiado = false), 2000);
		} catch {
			copiado = false;
		}
	}

	$effect(() => () => clearTimeout(espera));
</script>

<div class="mt-10 flex flex-wrap items-center gap-2.5">
	<span class="me-1 text-sm font-bold">Compartilhar</span>
	<button
		type="button"
		onclick={copiar}
		class="btn min-h-11 motion-tap gap-2 btn-plain hover:border-primary"
	>
		<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
		<span aria-live="polite">{copiado ? 'Link copiado' : 'Copiar link'}</span>
	</button>
	<!-- eslint-disable svelte/no-navigation-without-resolve -- o WhatsApp é um endereço EXTERNO. -->
	<a
		href={whatsapp}
		target="_blank"
		rel="noopener noreferrer"
		class="btn min-h-11 motion-tap gap-2 btn-plain no-underline hover:border-primary"
	>
		<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M4 20l1.3-3.9A8 8 0 1112 20a8 8 0 01-4.1-1.1z"
				stroke="currentColor"
				stroke-width="2"
				stroke-linejoin="round"
			/>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</svg>
		WhatsApp
	</a>
</div>
