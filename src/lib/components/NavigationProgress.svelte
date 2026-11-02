<script lang="ts">
	/**
	 * A espera de TROCA DE TELA, montada uma vez no layout raiz.
	 *
	 * **Só aparece depois de 180 ms.** Navegação com o dado já em cache resolve
	 * em poucos quadros, e piscar um indicador a cada clique treina o olho a
	 * ignorá-lo — que é o oposto do que ele serve.
	 *
	 * **O DESTINO escolhe a forma**, porque as duas superfícies têm orçamentos
	 * diferentes (design-system.md "Dois contextos"):
	 *
	 * - **Painel** (`(studio)`): `orbita` numa pílula flutuante. Ali o professor
	 *   troca de tela sabendo o que pediu, a espera é a do servidor montando um
	 *   relatório, e a órbita é a variante que aguenta ficar em tela sem
	 *   irritar (components.md "Espera").
	 * - **Player e páginas públicas**: a barra fina. O aluno está no meio de uma
	 *   tarefa, muitas vezes em 4G — ali o indicador tem que ser o mais leve
	 *   possível e não roubar o centro da tela.
	 *
	 * `navigating.to` é `null` fora de navegação, então o estado vem do próprio
	 * router — não há timer para "terminar", só para começar a mostrar.
	 */
	import { navigating } from '$app/state';
	import Loading from './Loading.svelte';

	let visivel = $state(false);

	// O grupo de rotas fica no `route.id` (`/(studio)/atividades/[id]`), que é o
	// que o router já sabe antes de a página existir — nada de adivinhar pelo
	// pathname, que não tem o grupo.
	const noPainel = $derived(!!navigating.to?.route?.id?.startsWith('/(studio)'));

	$effect(() => {
		if (!navigating.to) {
			visivel = false;
			return;
		}
		const t = setTimeout(() => (visivel = true), 180);
		return () => clearTimeout(t);
	});
</script>

{#if visivel}
	{#if noPainel}
		<div
			class="pointer-events-none fixed inset-x-0 top-4 z-[100] flex animate-entrada-curta justify-center
			       px-4"
			role="status"
			aria-label="Carregando a próxima tela"
		>
			<span
				class="flex items-center gap-2.5 rounded-full border border-line bg-base-100 py-2 ps-2.5 pe-4
				       shadow-[0_10px_30px_-12px_color-mix(in_oklab,var(--color-base-content)_38%,transparent)]"
			>
				<Loading variant="orbita" size={24} label="Carregando" />
				<span class="text-[0.78rem] font-semibold text-base-content/70">Carregando…</span>
			</span>
		</div>
	{:else}
		<div
			class="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] overflow-hidden bg-primary/15"
			role="status"
			aria-label="Carregando a próxima tela"
		>
			<div
				aria-hidden="true"
				class="h-full w-[30%] rounded-full bg-primary"
				style="animation: en-bar 1.1s ease-in-out infinite;"
			></div>
		</div>
	{/if}
{/if}
