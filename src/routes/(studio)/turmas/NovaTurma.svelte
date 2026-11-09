<script lang="ts">
	// Criar turma — numa bandeja sobre a lista de turmas, não numa página à
	// parte: criar uma turma não pode tirar o professor de onde ele confere as
	// que já existem. (`turmas/nova` continua existindo só para redirecionar
	// link antigo para cá.)
	//
	// A ordem é a da decisão: QUAL é a turma (nome, idioma, cor — a etiqueta do
	// cabeçalho muda junto, é como ela vai aparecer na lista) e, separado,
	// QUEM está nela. Os alunos são opcionais e isso vai escrito no título do
	// bloco: dá para criar vazia e adicionar depois, pela tela da turma.
	//
	// Aluno sem e-mail é PERMITIDO e isso é dito no cadastro, não depois: ele
	// existe na chamada e nos resultados, e simplesmente não recebe convite.
	import { untrack } from 'svelte';
	import Alternador from '$lib/components/Alternador.svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import SeletorDeEtiqueta from '$lib/components/SeletorDeEtiqueta.svelte';
	import { parseAlunos } from '$lib/turmas/parse-alunos';
	import { IDIOMAS } from '$lib/idiomas';
	import {
		CLASSE_DA_ETIQUETA,
		COR_PADRAO,
		etiquetaDaTurma,
		type CorDeEtiqueta
	} from '$lib/etiquetas';
	import { criarTurma } from './turmas.remote';

	let {
		aberta,
		onfechar,
		idiomaPadrao,
		modoInicial = 'um'
	}: {
		aberta: boolean;
		onfechar: () => void;
		/** A tag com que a turma nasce: o idioma do professor, quando ele ensina um só. */
		idiomaPadrao: string | null;
		/** `lote` é a entrada "Colar uma lista de alunos" da lista vazia. */
		modoInicial?: 'um' | 'lote';
	} = $props();

	interface LinhaUmAUm {
		name: string;
		email: string;
	}
	const linhasVazias = (): LinhaUmAUm[] => [
		{ name: '', email: '' },
		{ name: '', email: '' },
		{ name: '', email: '' }
	];

	const formId = $props.id();
	let nome = $state('');
	let idioma = $state('');
	let cor = $state<CorDeEtiqueta>(COR_PADRAO);
	let modo = $state<'um' | 'lote'>('um');
	let linhas = $state<LinhaUmAUm[]>(linhasVazias());
	let colado = $state('');
	/** Falha do servidor é DITA — o botão não pode só voltar ao normal sem explicação. */
	let erro = $state<string | null>(null);

	// Cada abertura começa do zero: "Cancelar" descarta, e a turma de antes não
	// pode reaparecer meio digitada na próxima.
	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			nome = '';
			idioma = idiomaPadrao ?? '';
			cor = COR_PADRAO;
			modo = modoInicial;
			linhas = linhasVazias();
			colado = '';
			erro = null;
		});
	});

	const sigla = $derived(nome.trim() ? etiquetaDaTurma(nome) : '7B');

	// O parser é o MESMO do servidor: o número da prévia é o número que vai ser
	// gravado. Nenhuma linha é descartada em silêncio.
	const linhasColadas = $derived(modo === 'lote' ? parseAlunos(colado) : []);
	const umAUmPreenchidas = $derived(linhas.filter((l) => l.name.trim()));
	const alunosJson = $derived(
		JSON.stringify(
			umAUmPreenchidas.map((l) => ({ name: l.name.trim(), email: l.email.trim() || null }))
		)
	);

	/** O que a linha vai virar — dito na própria linha, não num aviso solto. */
	function estadoDaLinha(linha: LinhaUmAUm): { texto: string; tom: string } {
		const email = linha.email.trim();
		if (!email)
			return { texto: 'sem e-mail · entra pelo link aberto', tom: 'text-base-content/60' };
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
			? { texto: 'recebe convite', tom: 'text-primary' }
			: { texto: 'e-mail incompleto', tom: 'text-error' };
	}

	const total = $derived(
		modo === 'lote'
			? linhasColadas.filter((l) => l.status !== 'sem-nome').length
			: umAUmPreenchidas.length
	);
	const comEmail = $derived(
		modo === 'lote'
			? linhasColadas.filter((l) => l.status === 'com-email').length
			: umAUmPreenchidas.filter((l) => estadoDaLinha(l).texto === 'recebe convite').length
	);
	const forasDeLinha = $derived(
		linhasColadas.filter((l) => l.status === 'sem-nome' || l.status === 'email-invalido')
	);

	const resumo = $derived(
		total === 0
			? 'Os alunos podem entrar depois, pela tela da turma.'
			: `${total} ${total === 1 ? 'aluno' : 'alunos'} · ${comEmail} ${comEmail === 1 ? 'recebe' : 'recebem'} convite quando você enviar uma atividade`
	);

	const exemploLista = [
		'Juliana Pereira · juliana.p@escola.com.br',
		'Marcos Antunes · marcos.a@escola.com.br',
		'Bruna Okamoto'
	].join('\n');
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Nova turma"
	descricao="Só o nome é obrigatório. A turma serve para o aluno chegar com o nome certo e para você não redistribuir link toda semana."
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

	<form
		id={formId}
		{...criarTurma.enhance(async ({ submit }) => {
			erro = null;
			try {
				// Sucesso redireciona para a turma criada.
				await submit();
			} catch {
				erro = 'Não deu para criar a turma agora. Tente de novo em instantes.';
			}
		})}
		class="grid gap-7"
	>
		<input type="hidden" name="modo" value={modo} />
		{#if modo === 'um'}
			<input type="hidden" name="alunos" value={alunosJson} />
		{/if}

		<div class="grid gap-5">
			<label class="fieldset">
				<span class="fieldset-legend">Nome da turma</span>
				<input
					name="name"
					bind:value={nome}
					required
					maxlength="60"
					placeholder="7º B — inglês"
					class="input w-full text-[15px]"
					data-autofoco
				/>
				{#each criarTurma.fields.name.issues() ?? [] as issue (issue.message)}
					<span class="text-[12.5px] font-semibold text-error" role="alert">{issue.message}</span>
				{:else}
					<span class="fieldset-label">O aluno vê este nome no e-mail do convite.</span>
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
				<span class="fieldset-label"
					>Filtra as atividades que você manda para ela. Não muda o conteúdo.</span
				>
			</label>

			<SeletorDeEtiqueta bind:cor {sigla} name="color" />
		</div>

		<section class="grid gap-3.5 border-t border-line pt-6" aria-labelledby="{formId}-alunos">
			<div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
				<h3 id="{formId}-alunos" class="text-[15px] font-bold">Alunos</h3>
				<span class="text-[12.5px] text-base-content/60">opcional · dá para adicionar depois</span>
			</div>

			<Alternador
				opcoes={[
					{ id: 'um' as const, label: 'Um a um' },
					{ id: 'lote' as const, label: 'Colar uma lista' }
				]}
				bind:valor={modo}
				rotulo="Como cadastrar os alunos"
				largura="cheia"
			/>

			{#if modo === 'um'}
				<ol class="grid list-none gap-2 p-0">
					{#each linhas as linha, i (i)}
						{@const estado = estadoDaLinha(linha)}
						<li
							class="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-2 rounded-box border border-line bg-base-200 p-2"
						>
							<span class="pt-2.5 text-center font-mono text-[0.72rem] text-base-content/55"
								>{String(i + 1).padStart(2, '0')}</span
							>
							<div class="grid min-w-0 gap-1.5 sm:grid-cols-2">
								<input
									bind:value={linha.name}
									placeholder="Nome do aluno"
									class="input h-auto min-w-0 py-2 text-[0.9rem]"
									aria-label="Nome do aluno {i + 1}"
								/>
								<input
									bind:value={linha.email}
									type="email"
									placeholder="e-mail (opcional)"
									class="input h-auto min-w-0 py-2 text-[0.9rem]"
									aria-label="E-mail do aluno {i + 1}"
								/>
								<span
									class="ps-0.5 text-[11.5px] font-semibold sm:col-span-2 {estado.tom}"
									aria-live="polite">{linha.name.trim() ? estado.texto : ''}</span
								>
							</div>
							<button
								type="button"
								onclick={() => (linhas = linhas.filter((_, j) => j !== i))}
								disabled={linhas.length <= 1}
								class="grid size-9 place-items-center rounded-field text-base-content/60 hover:text-error disabled:opacity-30"
								aria-label="Remover aluno {i + 1}"
							>
								<svg class="size-[0.85rem]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M6 6l12 12M18 6L6 18"
										stroke="currentColor"
										stroke-width="2.4"
										stroke-linecap="round"
									/>
								</svg>
							</button>
						</li>
					{/each}
				</ol>
				<button
					type="button"
					onclick={() => (linhas = [...linhas, { name: '', email: '' }])}
					class="w-full rounded-box border-[1.5px] border-dashed border-line py-3 text-[0.86rem] font-bold text-primary transition-colors hover:border-primary"
					>+ Mais um aluno</button
				>
			{:else}
				<label class="fieldset">
					<span class="sr-only">Um aluno por linha</span>
					<textarea
						name="colado"
						bind:value={colado}
						rows="8"
						placeholder={exemploLista}
						class="textarea w-full text-[0.9rem] leading-[1.75]"></textarea>
					<span class="fieldset-label"
						>Um por linha: <span class="font-mono">Nome · email@escola.com</span>. Só o nome também
						vale.</span
					>
				</label>

				{#if forasDeLinha.length > 0}
					<!-- Nenhuma linha é descartada em silêncio: cada uma que fica de
					     fora aparece com o número e o motivo. -->
					<div
						class="rounded-box border border-s-[3px] border-line border-s-warning bg-base-200 px-4 py-3"
					>
						<p class="mb-1.5 text-[0.84rem] font-semibold">
							{forasDeLinha.length}
							{forasDeLinha.length === 1 ? 'linha precisa' : 'linhas precisam'} de atenção
						</p>
						<ul class="grid list-none gap-1 p-0">
							{#each forasDeLinha as linha (linha.line)}
								<li class="text-[0.8rem] text-base-content/65">
									<span class="font-mono">linha {linha.line}</span> ·
									{linha.status === 'sem-nome' ? 'sem nome' : 'e-mail incompleto'} —
									<span class="font-content">{linha.raw.trim().slice(0, 48)}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/if}
		</section>
	</form>

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>Cancelar</button
		>
		<button
			type="submit"
			form={formId}
			disabled={nome.trim().length === 0 || criarTurma.pending > 0}
			class="btn min-h-11 motion-tap gap-2.5 btn-primary font-bold"
		>
			{#if criarTurma.pending > 0}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Criando"
				/>{/if}
			{total > 0 ? `Criar turma com ${total}` : 'Criar turma'}
		</button>
	{/snippet}
</Bandeja>
