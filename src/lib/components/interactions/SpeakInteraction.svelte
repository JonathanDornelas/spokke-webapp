<script lang="ts">
	import Recorder from '../Recorder.svelte';
	import Loading from '../Loading.svelte';
	import type { EstadoDaGravacao } from '$lib/client/gravacao.svelte';
	import type { SpeakRuntimeItem } from './types';

	// Fala. Pular está sempre visível — mas fica no rodapé da tela (é ação de
	// navegação, não desta interação): microfone negado ou ambiente barulhento não
	// podem travar a atividade. Sem provedor de ASR configurado, o servidor omite
	// o item inteiro do payload em vez de mostrar esta tela quebrada.
	//
	// Quem fala com o `MediaRecorder` é a TELA (components.md "Gravação"): aqui
	// só chegam o estado e o que fazer no toque.
	let {
		item,
		recording = $bindable(false),
		ontoggle,
		estado = 'ocioso',
		segundos = 0,
		maxSegundos = 30,
		ouvido = null,
		ouvindo = false,
		corrigida = false
	}: {
		item: SpeakRuntimeItem;
		recording?: boolean;
		ontoggle?: () => void;
		estado?: EstadoDaGravacao;
		segundos?: number;
		maxSegundos?: number;
		/** O que o serviço entendeu da gravação, antes de enviar. */
		ouvido?: string | null;
		/** A gravação subiu e a transcrição ainda não voltou. */
		ouvindo?: boolean;
		/**
		 * Já corrigida e sem como regravar: o microfone e o "Entendemos" saem (o
		 * veredito embaixo já diz o que se ouviu). Só o celular da home usa — ali a
		 * frase e o veredito precisam caber na tela do aparelho.
		 */
		corrigida?: boolean;
	} = $props();

	const impedimento: Partial<Record<EstadoDaGravacao, string>> = {
		negado:
			'Não conseguimos usar o microfone. Libere o acesso nas permissões do navegador — ou pule esta questão.',
		indisponivel: 'Este navegador não grava áudio. Pule esta questão e siga em frente.'
	};
</script>

<p dir={item.dir} class="mb-1.5 font-content text-[22px] leading-normal">{item.target}</p>
{#if item.ipa}
	<p class="font-mono text-[13px] text-base-content/65">{item.ipa}</p>
{/if}

{#if !corrigida}
	<p class="mt-6 mb-3.5 text-[12.5px] font-semibold text-base-content/65">
		{estado === 'pronto' ? 'Gravado — toque para regravar' : 'Grave sua voz'}
	</p>
{/if}

<div class="mt-auto mb-6 flex flex-col items-center gap-3" class:hidden={corrigida}>
	<Recorder
		{recording}
		size="lg"
		{ontoggle}
		hint={estado === 'gravando'
			? 'Fale a frase — vamos parar sozinhos quando você terminar'
			: estado === 'pronto'
				? 'Toque para gravar de novo'
				: 'Toque para gravar'}
	/>

	{#if estado === 'gravando'}
		<!-- O contador não é enfeite: a gravação para sozinha no silêncio E no
		     teto de tempo, e sem ver o relógio o aluno que hesita não entende por
		     que foi cortado. -->
		<p class="font-mono text-[13px] text-base-content/65" role="status">
			{segundos}s <span class="opacity-60">/ {maxSegundos}s</span>
		</p>
	{:else if estado === 'pronto' && ouvindo}
		<p class="flex items-center gap-2 text-[13px] font-semibold text-base-content/65" role="status">
			<Loading variant="fila" size={11} label="Ouvindo a gravação" />
			Ouvindo…
		</p>
	{:else if estado === 'pronto' && ouvido}
		<!-- O que foi ENTENDIDO, antes de enviar. É a fala dele mesmo, não
		     gabarito — e é o que deixa o aluno decidir entre enviar e regravar,
		     em vez de descobrir junto com o veredito que o microfone cortou. -->
		<div
			class="w-full max-w-[46ch] rounded-box border border-line bg-base-200 px-4 py-3 text-center"
			role="status"
		>
			<p class="mb-1 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
				Entendemos
			</p>
			<p dir={item.dir} class="font-content text-[17px] leading-snug">“{ouvido}”</p>
			<p class="mt-1.5 text-[12px] text-base-content/65">
				Não foi isso? Toque no microfone e grave de novo.
			</p>
		</div>
	{:else if estado === 'pronto'}
		<p class="flex items-center gap-2 text-[13px] font-semibold text-success" role="status">
			<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M4 12.5l5 5L20 6.5"
					stroke="currentColor"
					stroke-width="2.4"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
			Sua fala está pronta para enviar
		</p>
	{:else if impedimento[estado]}
		<!-- Ícone e texto, nunca cor sozinha — e o exercício continua possível
		     porque o "Pular" do rodapé nunca some em `speak`. -->
		<p
			class="flex max-w-[38ch] items-start gap-2 text-center text-[13px] leading-snug text-base-content/65"
			role="status"
		>
			<svg
				class="mt-px size-4 shrink-0 text-warning"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
				<path
					d="M12 7.5v5.5M12 16.5h.01"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			{impedimento[estado]}
		</p>
	{/if}
</div>
