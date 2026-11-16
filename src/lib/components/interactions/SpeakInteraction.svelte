<script lang="ts">
	import Recorder from '../Recorder.svelte';
	import Loading from '../Loading.svelte';
	import type { EstadoDaGravacao } from '$lib/client/gravacao.svelte';
	import { ajudaDoMicrofone, ehImpedimento, lerAmbiente } from '$lib/client/microfone';
	import type { SpeakRuntimeItem } from './types';
	import PronunciaDaPalavra from '../pronuncia/PronunciaDaPalavra.svelte';

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
		esperandoPermissao = false,
		semSom = false,
		segundos = 0,
		maxSegundos = 10,
		ouvido = null,
		ouvindo = false,
		erro = null,
		corrigida = false,
		compacta = false
	}: {
		item: SpeakRuntimeItem;
		recording?: boolean;
		ontoggle?: () => void;
		estado?: EstadoDaGravacao;
		/**
		 * O microfone demora a abrir: há um pedido de permissão na tela, ou um que
		 * o aluno fechou. O botão volta a valer e a linha diz para permitir.
		 */
		esperandoPermissao?: boolean;
		/** A gravação terminou sem som nenhum do microfone (`Gravacao.semSom`). */
		semSom?: boolean;
		segundos?: number;
		maxSegundos?: number;
		/**
		 * O que o serviço entendeu da gravação, antes de enviar. Texto vazio quer
		 * dizer que ele ouviu e não reconheceu palavra nenhuma.
		 */
		ouvido?: string | null;
		/** A gravação subiu e a transcrição ainda não voltou. */
		ouvindo?: boolean;
		/**
		 * O que deu errado no caminho até o serviço de áudio: fila cheia, gravação
		 * vazia, sem conexão. Toma o lugar do "pronta para enviar", que diante de
		 * uma recusa do servidor seria mentir para o aluno.
		 */
		erro?: string | null;
		/**
		 * Já respondida, sem como regravar: o microfone e o "Entendemos" saem (o
		 * veredito embaixo já diz o que se ouviu). No Player, toda questão de
		 * fala respondida; no celular da home, a corrigida.
		 */
		corrigida?: boolean;
		/** Na moldura de celular do Studio: a boca da Pronúncia menor. */
		compacta?: boolean;
	} = $props();

	// O que fazer quando não dá para gravar: cada recusa tem a sua frase, e o
	// caminho da permissão sai do aparelho e do navegador (`microfone.ts`).
	// Só existe depois de um toque (ou do bloqueio que o navegador já informou),
	// então nunca no servidor.
	const ajuda = $derived(ehImpedimento(estado) ? ajudaDoMicrofone(estado, lerAmbiente()) : null);
	const ajudaSemSom = $derived(semSom ? ajudaDoMicrofone('sem-som', lerAmbiente()) : null);
</script>

{#snippet aviso(texto: string, papel: 'status' | 'alert')}
	<!-- Falha no caminho, não veredito: ícone e texto, sem as cores da correção. -->
	<p
		class="flex max-w-[40ch] items-start gap-2 text-start text-[13px] leading-snug text-base-content/70"
		role={papel}
	>
		<svg
			class="mt-px size-4 shrink-0 text-base-content/65"
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
		{texto}
	</p>
{/snippet}

{#snippet comoResolver(a: { titulo: string; passo: string | null })}
	<!-- Não dá para gravar: o que aconteceu e o caminho. Ícone e texto, nunca cor
	     sozinha — e o exercício continua possível porque o "Pular" do rodapé
	     nunca some em `speak`. No lugar do quadro "Entendemos", e não maior que ele. -->
	<div
		class="flex max-w-[46ch] items-start gap-2 text-start text-[13px] leading-snug"
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
		<div>
			<p class="font-semibold text-base-content/80">{a.titulo}</p>
			{#if a.passo}
				<p class="mt-1 text-base-content/65">{a.passo}</p>
			{/if}
		</div>
	</div>
{/snippet}

{#if item.silabas && item.pronuncia}
	<!-- A Pronúncia: a palavra, as sílabas e a boca, com o áudio da palavra. -->
	<PronunciaDaPalavra
		palavra={item.target}
		silabas={item.silabas}
		passos={item.pronuncia.passos}
		audio={item.pronuncia.audio}
		audioSlow={item.pronuncia.audioSlow}
		linha={item.pronuncia.linha}
		linhaLenta={item.pronuncia.linhaLenta}
		dir={item.dir}
		{compacta}
	/>
{:else}
	<p dir={item.dir} class="mb-1.5 font-content text-[22px] leading-normal">{item.target}</p>
	{#if item.ipa}
		<p class="font-mono text-[13px] text-base-content/65">{item.ipa}</p>
	{/if}
{/if}

{#if !corrigida}
	<p class="mt-6 mb-3.5 text-[12.5px] font-semibold text-base-content/65 baixa:mt-3.5 baixa:mb-2">
		{estado === 'pronto' ? 'Gravado — toque para regravar' : 'Grave sua voz'}
	</p>
{/if}

<div class="mt-auto mb-6 flex flex-col items-center gap-3 baixa:mb-2" class:hidden={corrigida}>
	<Recorder
		{recording}
		abrindo={estado === 'abrindo' && !esperandoPermissao}
		size="lg"
		{ontoggle}
		hint={estado === 'abrindo' && esperandoPermissao
			? 'Permita o microfone no aviso do navegador. Não apareceu? Toque de novo.'
			: estado === 'abrindo'
				? 'Abrindo o microfone…'
				: estado === 'gravando'
					? `Fale ${item.silabas ? 'a palavra' : 'a frase'} — vamos parar sozinhos quando você terminar`
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
	{:else if erro}
		{@render aviso(erro, 'alert')}
	{:else if estado === 'pronto' && ouvindo}
		<p class="flex items-center gap-2 text-[13px] font-semibold text-base-content/65" role="status">
			<Loading variant="fila" size={11} label="Ouvindo a gravação" />
			Ouvindo…
		</p>
	{:else if estado === 'pronto' && ouvido === '' && ajudaSemSom}
		<!-- Nenhuma palavra, e o medidor não ouviu som nenhum: não é distância, é
		     o microfone mudo. "Fale mais perto" mandaria o aluno gritar para um
		     microfone desligado. -->
		{@render comoResolver(ajudaSemSom)}
	{:else if estado === 'pronto' && ouvido === ''}
		<!-- O serviço ouviu e não reconheceu palavra nenhuma: quase sempre o
		     microfone longe ou coberto. Dá para enviar assim mesmo, mas o aluno
		     merece saber antes de gastar a questão. -->
		{@render aviso(
			item.silabas
				? 'Não ouvimos som nenhum. Fale mais perto do microfone e grave de novo.'
				: 'Não entendemos nenhuma palavra. Fale mais perto do microfone e grave de novo.',
			'status'
		)}
	{:else if estado === 'pronto' && ouvido}
		<!-- O que foi ENTENDIDO, antes de enviar. É a fala dele mesmo, não
		     gabarito — e é o que deixa o aluno decidir entre enviar e regravar,
		     em vez de descobrir junto com o veredito que o microfone cortou. Na
		     Pronúncia são os SONS ouvidos, na escrita das sílabas ("prai · aw ·
		     ree · tee"), e por isso em mono, como elas. -->
		<div
			class="w-full max-w-[46ch] rounded-box border border-line bg-base-200 px-4 py-3 text-center"
			role="status"
		>
			<p class="mb-1 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
				{item.silabas ? 'Ouvimos' : 'Entendemos'}
			</p>
			<p
				dir={item.dir}
				class="leading-snug"
				class:font-mono={!!item.silabas}
				class:text-[16px]={!!item.silabas}
				class:font-content={!item.silabas}
				class:text-[17px]={!item.silabas}
			>
				“{ouvido}”
			</p>
			<p class="mt-1.5 text-[12px] text-base-content/65">
				Não foi isso? Toque no microfone e grave de novo.
			</p>
		</div>
	{:else if estado === 'pronto' && ajudaSemSom}
		{@render comoResolver(ajudaSemSom)}
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
	{:else if ajuda}
		{@render comoResolver(ajuda)}
	{/if}
</div>
