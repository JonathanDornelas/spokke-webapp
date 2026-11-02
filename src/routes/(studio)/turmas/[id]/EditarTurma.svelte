<script lang="ts">
	// Editar nome, idioma e cor da turma. Os três campos da "Nova turma", na
	// mesma ordem e com o mesmo seletor — editar não pode ser outro formulário
	// para a mesma coisa. Os alunos e os envios não passam por aqui.
	//
	// O idioma é um SELETOR das tags do produto (`campoIdioma`): foi um campo de
	// texto livre, e qualquer rótulo diferente do cadastrado derrubava o salvar.
	import { untrack } from 'svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SeletorDeEtiqueta from '$lib/components/SeletorDeEtiqueta.svelte';
	import { IDIOMAS } from '$lib/idiomas';
	import {
		CLASSE_DA_ETIQUETA,
		corOuPadrao,
		etiquetaDaTurma,
		type CorDeEtiqueta
	} from '$lib/etiquetas';
	import { editarTurma } from '../turmas.remote';

	let {
		aberta,
		onfechar,
		turma
	}: {
		aberta: boolean;
		onfechar: () => void;
		turma: { id: string; name: string; color: string; idioma: string | null };
	} = $props();

	const formId = $props.id();
	let nome = $state('');
	let idioma = $state('');
	let cor = $state<CorDeEtiqueta>('violeta');
	let erro = $state<string | null>(null);

	// Abre sempre com o que está GRAVADO, não com o que ficou digitado e cancelado.
	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			nome = turma.name;
			idioma = turma.idioma ?? '';
			cor = corOuPadrao(turma.color);
			erro = null;
		});
	});

	const sigla = $derived(etiquetaDaTurma(nome.trim() || turma.name));
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Editar turma"
	descricao="O nome, o idioma e a cor da etiqueta. Os alunos e os envios não mudam."
	resumo="O aluno vê o nome novo no próximo convite."
	{erro}
>
	{#snippet marca()}
		<span
			class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[15px] font-bold transition-colors {CLASSE_DA_ETIQUETA[
				cor
			]}"
			aria-hidden="true">{sigla}</span
		>
	{/snippet}

	<form
		id={formId}
		{...editarTurma.enhance(async ({ submit }) => {
			erro = null;
			try {
				await submit();
				if (editarTurma.result?.ok) onfechar();
			} catch {
				erro = 'Não deu para salvar agora. Tente de novo em instantes.';
			}
		})}
		class="grid gap-5"
	>
		<input type="hidden" name="classroomId" value={turma.id} />
		<label class="fieldset">
			<span class="fieldset-legend">Nome da turma</span>
			<input
				name="name"
				bind:value={nome}
				required
				maxlength="80"
				class="input w-full text-[15px]"
				data-autofoco
			/>
			{#each editarTurma.fields.name.issues() ?? [] as issue (issue.message)}
				<span class="text-[12.5px] font-semibold text-error" role="alert">{issue.message}</span>
			{/each}
		</label>

		<label class="fieldset">
			<span class="fieldset-legend"
				>Idioma <span class="font-normal text-base-content/60">· opcional</span></span
			>
			<select name="idioma" bind:value={idioma} class="select w-full">
				<option value="">Sem idioma</option>
				{#each IDIOMAS as i (i.tag)}
					<option value={i.tag}>{i.rotulo}</option>
				{/each}
			</select>
			<span class="fieldset-label">Filtra as atividades que você manda para ela.</span>
		</label>

		<SeletorDeEtiqueta bind:cor {sigla} name="color" />
	</form>

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>Cancelar</button
		>
		<button
			type="submit"
			form={formId}
			disabled={nome.trim().length === 0 || editarTurma.pending > 0}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if editarTurma.pending > 0}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Salvando"
				/>{/if}
			Salvar alterações
		</button>
	{/snippet}
</Bandeja>
