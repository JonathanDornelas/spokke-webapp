<script lang="ts">
	// Adicionar aluno a uma turma que já existe. **A bandeja fica aberta depois
	// de adicionar**: cadastrar uma turma é um nome depois do outro, e fechar a
	// cada aluno obrigava a reabrir vinte e quatro vezes. Quem já entrou nesta
	// rodada aparece embaixo, para o professor conferir sem fechar.
	//
	// **Duas formas de o convite de conta chegar** (auth.md "A conta do aluno"):
	// o Spokke manda por e-mail, ou o professor copia o link e manda por onde a
	// turma conversa. Com o link, o e-mail continua opcional; por e-mail, ele é
	// obrigatório. A escolha vale para a rodada inteira — quem cadastra vinte
	// alunos não escolhe vinte vezes.
	import { tick, untrack } from 'svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { CLASSE_DA_ETIQUETA, corOuPadrao } from '$lib/etiquetas';
	import { adicionarAluno } from '../turmas.remote';

	let {
		aberta,
		onfechar,
		turma
	}: {
		aberta: boolean;
		onfechar: () => void;
		turma: { id: string; name: string; badge: string; color: string };
	} = $props();

	type Convite = 'email' | 'link';
	type Entrou = {
		id: string;
		name: string;
		email: string;
		link: string;
		/** O convite entrou na fila de e-mail. Falso com "link", ou quando o teto da hora bateu. */
		porEmail: boolean;
		pediuEmail: boolean;
	};

	const formId = $props.id();
	let nome = $state('');
	let email = $state('');
	let convite = $state<Convite>('email');
	let entraram = $state<Entrou[]>([]);
	let erro = $state<string | null>(null);
	let copiadoId = $state<string | null>(null);
	let campoNome = $state<HTMLInputElement | null>(null);

	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			nome = '';
			email = '';
			convite = 'email';
			entraram = [];
			erro = null;
			copiadoId = null;
		});
	});

	const OPCOES: { id: Convite; titulo: string; texto: string }[] = [
		{
			id: 'email',
			titulo: 'Por e-mail',
			texto: 'O Spokke manda o convite para o e-mail dele.'
		},
		{
			id: 'link',
			titulo: 'Eu mando o link',
			texto: 'Você copia o link e manda por onde a turma conversa.'
		}
	];

	const faltaEmail = $derived(convite === 'email' && email.trim().length === 0);

	const resumo = $derived(
		entraram.length > 0
			? `${entraram.length} ${entraram.length === 1 ? 'aluno entrou' : 'alunos entraram'} nesta rodada. Pode seguir com o próximo.`
			: convite === 'email'
				? 'Ele recebe o convite para criar a conta, ou entrar na que já tem. Responder continua sem conta.'
				: 'Depois de adicionar, o link do convite aparece aqui para você copiar.'
	);

	async function copiar(aluno: Entrou) {
		try {
			await navigator.clipboard.writeText(aluno.link);
			copiadoId = aluno.id;
			setTimeout(() => {
				if (copiadoId === aluno.id) copiadoId = null;
			}, 2400);
		} catch {
			erro = 'O navegador não deixou copiar. Abra o convite pela chamada e copie de lá.';
		}
	}
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Adicionar aluno"
	descricao="Em {turma.name}. Nome, e-mail e como o convite para a conta chega até ele."
	{resumo}
	{erro}
>
	{#snippet marca()}
		<span
			class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[15px] font-bold {CLASSE_DA_ETIQUETA[
				corOuPadrao(turma.color)
			]}"
			aria-hidden="true">{turma.badge}</span
		>
	{/snippet}

	<form
		id={formId}
		{...adicionarAluno.enhance(async ({ submit }) => {
			erro = null;
			const digitado = { name: nome.trim(), email: email.trim(), pediuEmail: convite === 'email' };
			try {
				if (!(await submit())) return;
				const r = adicionarAluno.result;
				if (!r) return;
				if (!r.ok) {
					erro = r.error;
					return;
				}
				entraram = [
					{ ...digitado, id: r.studentId, link: r.link, porEmail: r.porEmail },
					...entraram
				];
				nome = '';
				email = '';
				await tick();
				campoNome?.focus();
			} catch {
				erro = 'Não deu para adicionar agora. Tente de novo em instantes.';
			}
		})}
		class="grid gap-5"
	>
		<input type="hidden" name="classroomId" value={turma.id} />
		<label class="fieldset">
			<span class="fieldset-legend">Nome</span>
			<input
				bind:this={campoNome}
				name="name"
				bind:value={nome}
				required
				maxlength="120"
				class="input w-full text-[15px]"
				data-autofoco
			/>
			<span class="fieldset-label">Como você quer ver ele na chamada e nos resultados.</span>
		</label>

		<fieldset class="fieldset">
			<legend class="fieldset-legend">Como o convite para a conta chega</legend>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each OPCOES as opcao (opcao.id)}
					<label
						class="flex min-h-13 cursor-pointer items-start gap-3 rounded-box border-[1.5px] border-line bg-base-100 px-3.5 py-3 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/6"
					>
						<input
							type="radio"
							name="convite"
							value={opcao.id}
							bind:group={convite}
							class="mt-0.5 radio flex-none"
						/>
						<span class="min-w-0">
							<span class="block text-[14px] font-semibold">{opcao.titulo}</span>
							<span class="block text-[12.5px] leading-snug text-base-content/65"
								>{opcao.texto}</span
							>
						</span>
					</label>
				{/each}
			</div>
			<span class="fieldset-label"
				>Com a conta ligada, ele vê os módulos da turma num mapa. Quem já tem conta entra com ela.</span
			>
		</fieldset>

		<label class="fieldset">
			<span class="fieldset-legend"
				>E-mail{#if convite === 'link'}
					<span class="font-normal text-base-content/60">· opcional</span>{/if}</span
			>
			<input
				name="email"
				type="email"
				bind:value={email}
				required={convite === 'email'}
				class="input w-full text-[15px]"
			/>
			<span class="fieldset-label"
				>{convite === 'email'
					? 'Para onde vão o convite da conta e os links das atividades enviadas.'
					: 'Para onde vão os links das atividades enviadas.'}</span
			>
		</label>
	</form>

	{#if entraram.length > 0}
		<section class="mt-7 border-t border-line pt-5" aria-live="polite">
			<h3 class="mb-2.5 text-[13.5px] font-bold">Entraram agora</h3>
			<ul class="grid list-none gap-1.5 p-0">
				{#each entraram as aluno (aluno.id)}
					<li class="animate-entrada-curta rounded-field bg-base-200 px-3 py-2.5">
						<div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
							<span class="text-[13.5px] font-semibold">{aluno.name}</span>
							{#if aluno.email}
								<span class="min-w-0 truncate font-mono text-[12.5px] text-base-content/65"
									>{aluno.email}</span
								>
							{:else}
								<span class="text-[12.5px] text-base-content/65 italic">sem e-mail</span>
							{/if}
						</div>
						<div class="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
							<span class="text-[12.5px] text-base-content/70">
								{#if aluno.porEmail}
									Convite na fila de e-mail.
								{:else if aluno.pediuEmail}
									O convite não saiu por e-mail agora. Copie o link e mande você.
								{:else}
									Copie o link do convite e mande para ele.
								{/if}
							</span>
							<button
								type="button"
								onclick={() => copiar(aluno)}
								class="btn btn-sm min-h-9 motion-tap gap-1.5 {aluno.porEmail
									? 'btn-plain'
									: 'btn-primary font-bold'}"
								aria-label="Copiar o link do convite de {aluno.name}"
							>
								<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									{#if copiadoId === aluno.id}
										<path
											d="M5 12.5l4.5 4.5L19 7"
											stroke="currentColor"
											stroke-width="2.2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									{:else}
										<path
											d="M9 9h10v11H9zM5 15V4h10"
											stroke="currentColor"
											stroke-width="2"
											stroke-linejoin="round"
										/>
									{/if}
								</svg>
								{copiadoId === aluno.id ? 'Copiado' : 'Copiar link'}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>{entraram.length > 0 ? 'Concluir' : 'Cancelar'}</button
		>
		<button
			type="submit"
			form={formId}
			disabled={nome.trim().length === 0 || faltaEmail || adicionarAluno.pending > 0}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if adicionarAluno.pending > 0}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Adicionando"
				/>{/if}
			{convite === 'email' ? 'Adicionar e convidar' : 'Adicionar'}
		</button>
	{/snippet}
</Bandeja>
