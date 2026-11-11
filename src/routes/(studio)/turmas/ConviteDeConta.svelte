<script lang="ts">
	// O convite de CONTA de um aluno da chamada (auth.md "A conta do aluno"): o
	// link para ele criar a conta, ou entrar na que já tem, e ligá-la a esta
	// ficha. Dois caminhos, lado a lado: copiar o link e mandar por onde a turma
	// conversa, ou o Spokke manda por e-mail. "Gerar outro link" invalida o de
	// agora — para quando ele foi parar no lugar errado.
	import { untrack } from 'svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { conviteDeConta, enviarConviteDeConta } from './turmas.remote';

	type Aluno = { id: string; name: string; avatar: string | null; email: string | null };

	let {
		aberta,
		onfechar,
		aluno,
		onenviado
	}: {
		aberta: boolean;
		onfechar: () => void;
		aluno: Aluno | null;
		/** Depois que o e-mail entra na fila — a tela recarrega a chamada. */
		onenviado?: () => void;
	} = $props();

	type Estado = {
		temConta: boolean;
		email: string | null;
		link: string;
		enviadoEm: string | null;
	};
	let estado = $state<Estado | null>(null);
	let carregando = $state(false);
	let renovando = $state(false);
	let enviando = $state(false);
	let copiado = $state(false);
	let confirmandoRenovar = $state(false);
	let erro = $state<string | null>(null);
	let aviso = $state<string | null>(null);

	async function carregar(renovar = false) {
		if (!aluno) return;
		erro = null;
		try {
			estado = await conviteDeConta({ studentId: aluno.id, renovar });
		} catch {
			erro = 'Não deu para abrir o convite agora. Tente de novo em instantes.';
		}
	}

	$effect(() => {
		if (!aberta || !aluno) return;
		untrack(() => {
			estado = null;
			copiado = false;
			confirmandoRenovar = false;
			aviso = null;
			carregando = true;
			carregar().finally(() => (carregando = false));
		});
	});

	async function copiar() {
		if (!estado) return;
		try {
			await navigator.clipboard.writeText(estado.link);
			copiado = true;
			setTimeout(() => (copiado = false), 2400);
		} catch {
			erro = 'O navegador não deixou copiar. Selecione o link e copie à mão.';
		}
	}

	async function renovar() {
		renovando = true;
		try {
			await carregar(true);
			confirmandoRenovar = false;
			copiado = false;
			aviso = 'Link novo gerado. O anterior não abre mais.';
		} finally {
			renovando = false;
		}
	}

	async function enviar() {
		if (!aluno) return;
		enviando = true;
		erro = null;
		try {
			const r = await enviarConviteDeConta({ studentId: aluno.id });
			if (!r.ok) {
				erro = r.error;
				return;
			}
			aviso = `Convite na fila para ${estado?.email ?? 'o e-mail dele'}.`;
			onenviado?.();
		} catch {
			erro = 'Não deu para mandar agora. Tente de novo em instantes.';
		} finally {
			enviando = false;
		}
	}

	function quando(iso: string): string {
		return new Date(iso).toLocaleString('pt-BR', {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit',
			timeZone: 'America/Sao_Paulo'
		});
	}

	const primeiro = $derived(aluno?.name.split(/\s+/)[0] ?? 'o aluno');
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Convite para a conta"
	descricao="Com a conta ligada, {primeiro} vê os módulos da turma num mapa. Responder continua sem conta."
	resumo="Quem já tem conta de aluno entra com ela pelo mesmo link."
	{erro}
>
	{#snippet marca()}
		{#if aluno}
			<Avatar codigo={aluno.avatar} nome={aluno.name} size={46} radius="rounded-[13px]" />
		{/if}
	{/snippet}

	{#if carregando}
		<div class="py-8">
			<Loading variant="fila" label="Abrindo o convite" />
		</div>
	{:else if estado?.temConta}
		<p class="rounded-field border border-line bg-base-200 px-4 py-3 text-[14px] leading-relaxed">
			{aluno?.name} já ligou a conta a esta turma. Não há convite a mandar.
		</p>
	{:else if estado}
		<section class="grid gap-2.5">
			<h3 class="text-[15px] font-bold">Mandar você mesmo</h3>
			<p class="text-[13px] leading-relaxed text-base-content/65">
				Copie e mande por onde a turma conversa: WhatsApp, grupo, mural da escola.
			</p>
			<label class="sr-only" for="link-convite-conta">Link do convite</label>
			<input
				id="link-convite-conta"
				readonly
				value={estado.link}
				onfocus={(e) => e.currentTarget.select()}
				class="input w-full font-mono text-[12.5px]"
			/>
			<div class="flex flex-wrap items-center gap-2">
				<button
					type="button"
					onclick={copiar}
					class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
					data-autofoco
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						{#if copiado}
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
					{copiado ? 'Copiado' : 'Copiar link'}
				</button>
			</div>
		</section>

		<section class="mt-7 grid gap-2.5 border-t border-line pt-5">
			<h3 class="text-[15px] font-bold">Mandar por e-mail</h3>
			{#if estado.email}
				<p class="text-[13px] leading-relaxed text-base-content/65">
					O Spokke manda o convite para <span class="font-mono text-base-content"
						>{estado.email}</span
					>.
					{#if estado.enviadoEm}O último saiu em {quando(estado.enviadoEm)}.{/if}
				</p>
				<div>
					<button
						type="button"
						onclick={enviar}
						disabled={enviando}
						class="btn min-h-11 motion-tap gap-2 btn-outline font-bold"
					>
						{#if enviando}<Loading variant="fila" size={10} tone="current" label="Mandando" />{/if}
						{estado.enviadoEm ? 'Mandar de novo' : 'Mandar o convite'}
					</button>
				</div>
			{:else}
				<p class="text-[13px] leading-relaxed text-base-content/65">
					Sem e-mail no cadastro. Edite o aluno para cadastrar um, ou mande o link você mesmo.
				</p>
			{/if}
		</section>

		{#if aviso}
			<p
				class="mt-5 flex items-center gap-2 rounded-field border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3 text-[13.5px]"
				role="status"
			>
				{aviso}
			</p>
		{/if}

		<section class="mt-7 grid gap-2.5 border-t border-line pt-5">
			<h3 class="text-[15px] font-bold">O link foi para o lugar errado?</h3>
			{#if confirmandoRenovar}
				<p class="text-[13px] leading-relaxed text-base-content/65">
					O link de agora para de abrir, inclusive o que já saiu por e-mail. Quem ainda não entrou
					precisa do novo.
				</p>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						onclick={renovar}
						disabled={renovando}
						class="btn min-h-11 motion-tap gap-2 btn-outline-error font-bold"
					>
						{#if renovando}<Loading variant="fila" size={10} tone="current" label="Gerando" />{/if}
						Gerar outro link
					</button>
					<button
						type="button"
						onclick={() => (confirmandoRenovar = false)}
						class="btn min-h-11 btn-plain">Manter o de agora</button
					>
				</div>
			{:else}
				<div>
					<button
						type="button"
						onclick={() => (confirmandoRenovar = true)}
						class="btn min-h-11 motion-tap btn-plain">Gerar outro link</button
					>
				</div>
			{/if}
		</section>
	{/if}

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>Fechar</button
		>
	{/snippet}
</Bandeja>
