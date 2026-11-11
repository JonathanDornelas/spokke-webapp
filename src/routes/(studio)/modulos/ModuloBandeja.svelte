<script lang="ts">
	// Criar e editar um módulo: a mesma bandeja, nos mesmos três campos — nome,
	// descrição e a etiqueta. Era um formulário curto na lista, outro no
	// cabeçalho do módulo aberto e um terceiro, só de nome, dentro do cartão
	// ("Renomear"); três desenhos para a mesma coisa.
	//
	// **Criar já pode levar as atividades.** O módulo nascia vazio e o professor
	// caía numa tela onde a primeira coisa a fazer era abrir outro seletor. Elas
	// são opcionais, entram na ordem em que foram marcadas, e as turmas e a
	// programação continuam no módulo aberto — é lá que cada turma tem o ritmo
	// dela.
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SeletorDeAtividades from '$lib/components/SeletorDeAtividades.svelte';
	import SeletorDeEtiqueta from '$lib/components/SeletorDeEtiqueta.svelte';
	import {
		CLASSE_DA_ETIQUETA,
		COR_PADRAO,
		etiquetaDaTurma,
		type CorDeEtiqueta
	} from '$lib/etiquetas';
	import { criarModulo, editarModulo } from './modulos.remote';

	type Atividade = {
		id: string;
		title: string;
		level: string | null;
		idioma: string | null;
		noAr: boolean;
	};

	let {
		aberta,
		onfechar,
		modulo = null,
		atividades = [],
		onsalvo
	}: {
		aberta: boolean;
		onfechar: () => void;
		/** O módulo em edição; sem ele, a bandeja CRIA. */
		modulo?: { id: string; name: string; description: string | null; color: CorDeEtiqueta } | null;
		/** As atividades que o módulo novo pode levar (as arquivadas já vêm fora). */
		atividades?: Atividade[];
		/** Depois de salvar uma edição — a tela recarrega o que mostra. */
		onsalvo?: () => void | Promise<void>;
	} = $props();

	const formId = $props.id();
	const editando = $derived(modulo !== null);
	let nome = $state('');
	let descricao = $state('');
	let cor = $state<CorDeEtiqueta>(COR_PADRAO);
	let escolhidas = $state<string[]>([]);
	let salvando = $state(false);
	let erro = $state<string | null>(null);

	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			nome = modulo?.name ?? '';
			descricao = modulo?.description ?? '';
			cor = modulo?.color ?? COR_PADRAO;
			escolhidas = [];
			erro = null;
		});
	});

	const sigla = $derived(nome.trim() ? etiquetaDaTurma(nome) : editando ? '·' : 'NM');

	const resumo = $derived(
		editando
			? 'As atividades, as turmas e a programação de envio não mudam.'
			: escolhidas.length > 0
				? `${escolhidas.length} ${escolhidas.length === 1 ? 'atividade entra' : 'atividades entram'} no módulo, nesta ordem. As turmas vêm depois, no módulo aberto.`
				: 'As atividades podem entrar depois. As turmas e os envios, no módulo aberto.'
	);

	async function salvar(e: SubmitEvent) {
		e.preventDefault();
		if (!nome.trim() || salvando) return;
		salvando = true;
		erro = null;
		try {
			if (modulo) {
				await editarModulo({ moduleId: modulo.id, name: nome, description: descricao, color: cor });
				await onsalvo?.();
				onfechar();
			} else {
				const r = await criarModulo({
					name: nome,
					description: descricao,
					color: cor,
					activityIds: escolhidas
				});
				await goto(resolve('/(studio)/modulos/[id]', { id: r.id }));
			}
		} catch {
			erro = editando
				? 'Não deu para salvar agora. Tente de novo em instantes.'
				: 'Não deu para criar agora. Tente de novo em instantes.';
		} finally {
			salvando = false;
		}
	}
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo={editando ? 'Editar módulo' : 'Novo módulo'}
	descricao={editando
		? 'O nome, a descrição e a etiqueta.'
		: 'Uma sequência de atividades que você manda para a turma no ritmo que escolher.'}
	{resumo}
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

	<form id={formId} onsubmit={salvar} class="grid gap-7">
		<div class="grid gap-5">
			<label class="fieldset">
				<span class="fieldset-legend">Nome</span>
				<input
					bind:value={nome}
					required
					maxlength="80"
					placeholder="Ex.: Unidade 4 — rotina"
					class="input w-full text-[15px]"
					data-autofoco
				/>
				<span class="fieldset-label">Aparece na sua lista e no mapa de fases do aluno.</span>
			</label>

			<label class="fieldset">
				<span class="fieldset-legend"
					>Descrição <span class="font-normal text-base-content/60">· opcional</span></span
				>
				<textarea
					bind:value={descricao}
					rows="2"
					maxlength="400"
					placeholder="O que este módulo cobre, numa linha."
					class="textarea w-full"></textarea>
			</label>

			<SeletorDeEtiqueta bind:cor {sigla} />
		</div>

		{#if !editando}
			<section class="grid gap-3 border-t border-line pt-6" aria-labelledby="{formId}-atividades">
				<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
					<h3 id="{formId}-atividades" class="text-[15px] font-bold">Atividades</h3>
					<span class="text-[12.5px] text-base-content/60"
						>opcional · a ordem do clique é a ordem do módulo</span
					>
				</div>
				<SeletorDeAtividades
					{atividades}
					bind:escolhidas
					vazio="Você ainda não tem atividades. Crie o módulo assim mesmo e acrescente depois."
				/>
			</section>
		{/if}
	</form>

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>Cancelar</button
		>
		<button
			type="submit"
			form={formId}
			disabled={salvando || !nome.trim()}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if salvando}<Loading
					variant="fila"
					size={10}
					tone="current"
					label={editando ? 'Salvando' : 'Criando'}
				/>{/if}
			{editando ? 'Salvar alterações' : 'Criar módulo'}
		</button>
	{/snippet}
</Bandeja>
