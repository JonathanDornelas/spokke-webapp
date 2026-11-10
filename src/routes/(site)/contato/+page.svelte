<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	// Contato: formulário + canais diretos. O consentimento fica junto do botão,
	// não escondido no rodapé (paginas.md "Grupo (site)").
	import { resolve } from '$app/paths';
	import SiteHero from '$lib/components/SiteHero.svelte';
	import { canais } from '$lib/content/institucional';
	import { registrarEvento } from '$lib/client/medicao';
	import { untrack } from 'svelte';

	let {
		data,
		form
	}: {
		data: { assunto: string; assuntos: string[]; origem: string | null };
		form?: { ok?: boolean; error?: string } | null;
	} = $props();

	// A conversão do contato (só registra com a medição aceita): o pedido de
	// escola vindo do blog é a mais valiosa, e a origem diz de qual artigo.
	$effect(() => {
		if (!form?.ok) return;
		untrack(() =>
			registrarEvento('generate_lead', {
				assunto_inicial: data.assunto,
				origem: data.origem ?? 'direto'
			})
		);
	});
</script>

<Metadados
	titulo="Fale com o Spokke"
	descricao="Dúvida de uso, problema com uma turma ou conversa sobre a escola: a mensagem chega direto para a equipe."
	tituloDaAba="Contato · Spokke"
/>

<SiteHero
	eyebrow="Contato"
	title="Fale com a gente"
	lede="Dúvida de uso, problema com uma turma ou conversa sobre a escola: a mensagem chega direto para a equipe."
/>

<div
	class="mx-auto grid w-full max-w-[1100px] gap-11 px-7 py-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:px-10 lg:py-10"
>
	<div class="min-w-0">
		<h2 class="mb-1.5 font-display text-lg font-semibold tracking-[-0.018em] lg:text-[21px]">
			Escreva pra gente
		</h2>
		<p class="mb-[22px] text-sm leading-relaxed text-base-content/65">
			Se for sobre uma turma em aula agora, escolha esse assunto na lista: a mensagem chega marcada.
		</p>

		{#if form?.ok}
			<p
				class="mb-5 rounded-box border border-primary/40 bg-primary/8 px-4 py-3.5 text-sm text-primary"
			>
				Mensagem enviada. Você recebe a resposta no e-mail informado.
			</p>
		{:else if form?.error}
			<p
				class="mb-5 rounded-box border border-error/35 bg-error/6 px-4 py-3.5 text-sm text-error"
				role="alert"
			>
				{form.error}
			</p>
		{/if}

		<form method="POST" class="grid gap-4">
			<!-- Campo-isca: fora da tela e do leitor de tela. Gente não preenche;
			     robô preenche tudo — e aí a mensagem não vira e-mail. -->
			<div class="absolute -start-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
				<label>Site <input name="site" tabindex="-1" autocomplete="off" /></label>
			</div>
			{#if data.origem}<input type="hidden" name="origem" value={data.origem} />{/if}
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block min-w-0">
					<span class="mb-1.5 block text-[13px] font-semibold">Nome</span>
					<input name="nome" required class="input w-full" placeholder="Ana Ribeiro" />
				</label>
				<label class="block min-w-0">
					<span class="mb-1.5 block text-[13px] font-semibold">E-mail</span>
					<input
						name="email"
						type="email"
						required
						class="input w-full"
						placeholder="ana@escolaexemplo.com.br"
					/>
				</label>
			</div>

			<label class="block">
				<span class="mb-1.5 block text-[13px] font-semibold">Assunto</span>
				<!-- A lista vem do servidor, que valida contra ela; `?assunto=escolas`
				     (o "Falar sobre a escola" dos planos) já chega escolhido. -->
				<select name="assunto" class="select w-full" value={data.assunto}>
					{#each data.assuntos as assunto (assunto)}
						<option>{assunto}</option>
					{/each}
				</select>
			</label>

			<label class="block">
				<span class="mb-1.5 block text-[13px] font-semibold">Mensagem</span>
				<textarea
					name="mensagem"
					required
					rows="5"
					class="textarea w-full leading-relaxed"
					placeholder="Conte o que você precisa. Se puder, diga o idioma que você ensina e o tamanho da turma."
				></textarea>
			</label>

			<label class="flex cursor-pointer items-start gap-3">
				<input
					name="consentimento"
					type="checkbox"
					required
					class="mt-0.5 checkbox checkbox-primary"
				/>
				<span class="min-w-0 text-[13px] leading-snug text-base-content/65">
					Concordo que o Spokke trate meus dados para responder este contato, conforme a
					<a
						href={resolve('/(site)/privacidade')}
						class="text-primary underline underline-offset-2 hover:no-underline"
					>
						Política de Privacidade
					</a>.
				</span>
			</label>

			<button
				type="submit"
				class="btn min-h-12 motion-tap justify-self-start btn-primary font-bold"
			>
				Enviar mensagem
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		</form>
	</div>

	<aside class="min-w-0 border-t border-line pt-6 lg:border-t-0 lg:pt-0">
		<p class="mb-3.5 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
			Canais diretos
		</p>
		<div class="mb-5 grid gap-2">
			<!-- eslint-disable svelte/no-navigation-without-resolve -- c.href é sempre mailto:, nunca rota interna. -->
			{#each canais as c (c.href)}
				<a
					href={c.href}
					class="block cartao-interativo rounded-box border border-line bg-base-100 px-4 py-3.5
					       no-underline"
				>
					<span
						class="mb-1.5 block text-xs font-bold tracking-[0.05em] text-base-content/65 uppercase"
						>{c.label}</span
					>
					<span class="block truncate text-[14.5px] font-semibold text-primary">{c.value}</span>
					<span class="mt-1 block text-[12.5px] leading-snug text-base-content/65">{c.note}</span>
				</a>
			{/each}
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		</div>
	</aside>
</div>
