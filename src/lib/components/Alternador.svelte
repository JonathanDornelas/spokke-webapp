<script lang="ts" generics="T extends string">
	// O controle de poucas opções em PÍLULA — "entrar como professor/aluno", "um a
	// um / colar uma lista", "alunos / envios". Era o mesmo markup copiado em
	// cinco telas, e a opção escolhida trocava de fundo num corte seco.
	//
	// **A pílula DESLIZA até a opção escolhida**: é um movimento de A para B na
	// tela, então leva a curva de movimento (`ease-in-out-soft`) na duração de
	// painel (`--duration-media`). Ela é UM elemento só, posicionado pelo índice
	// (`--i`) entre colunas iguais (`--n`), e anda por `translate` — nada de
	// medir largura em JS. Com movimento reduzido, a regra global do `app.css`
	// a faz pular direto.
	//
	// São botões com `aria-pressed` num `role="group"` com rótulo, e não abas:
	// nenhuma das telas tem painéis de aba de verdade, e `tablist` sem
	// `tabpanel` prometia ao leitor de tela uma navegação que não existia.
	let {
		opcoes,
		valor = $bindable(),
		rotulo,
		largura = 'auto',
		onmudar,
		class: className = ''
	}: {
		opcoes: readonly { id: T; label: string }[];
		valor: T;
		/** O que o grupo escolhe — vai no `aria-label`. */
		rotulo: string;
		/** `cheia` divide a largura do pai; `auto` cabe no texto. */
		largura?: 'cheia' | 'auto';
		/** Depois de trocar — para a tela limpar o que dependia da opção (um erro, um aviso). */
		onmudar?: (novo: T) => void;
		class?: string;
	} = $props();

	const indice = $derived(
		Math.max(
			0,
			opcoes.findIndex((o) => o.id === valor)
		)
	);

	function escolher(id: T) {
		if (id === valor) return;
		valor = id;
		onmudar?.(id);
	}
</script>

<div
	role="group"
	aria-label={rotulo}
	class="relative grid auto-cols-fr grid-flow-col gap-1 rounded-full bg-base-200 p-1 {largura ===
	'cheia'
		? 'w-full'
		: 'w-fit'} {className}"
	style="--n: {opcoes.length}; --i: {indice}"
>
	<span
		aria-hidden="true"
		class="absolute inset-y-1 start-1 w-[calc((100%-0.5rem-(var(--n)-1)*0.25rem)/var(--n))] translate-x-[calc(var(--i)*(100%+0.25rem))] rounded-full bg-primary transition-[translate] duration-(--duration-media) ease-in-out-soft rtl:-translate-x-[calc(var(--i)*(100%+0.25rem))]"
	></span>
	{#each opcoes as opcao (opcao.id)}
		<button
			type="button"
			aria-pressed={valor === opcao.id}
			onclick={() => escolher(opcao.id)}
			class="relative rounded-full px-4 py-2 text-[0.84rem] transition-colors {valor === opcao.id
				? 'font-bold text-primary-content'
				: 'font-semibold text-base-content/65 hover:text-base-content'}">{opcao.label}</button
		>
	{/each}
</div>
