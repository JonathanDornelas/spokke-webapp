<script lang="ts">
	// "Relatar problema", de dentro de uma questão. Um `<dialog>` de verdade (como
	// o editor de avatar): foco preso, Esc e clique no véu fecham, e a saída anima.
	//
	// O aluno diz O QUE aconteceu (um motivo, e se quiser umas palavras); o resto
	// vai sozinho — a questão, a resposta dele nela, o estado da tela, o aparelho
	// e o diário de erros do navegador (`$lib/client/diario.ts`). A tela DIZ isso
	// antes de enviar, e diz que o nome dele não vai. Quem recebe é a equipe do
	// Spokke, não o professor.
	//
	// Carregado só no primeiro clique (`import()` na `/q/[n]`): o Player tem
	// orçamento de peso, e quase ninguém vai abrir isto.
	import { DURACAO } from '$lib/movimento';
	import Loading from '$lib/components/Loading.svelte';
	import { MOTIVOS, MOTIVO_NA_TELA, type Motivo } from '$lib/relatos';
	import { relatarProblema } from '../../player.remote';

	/** O que a remote function recebe — o tipo sai dela, sem importar nada de `$lib/server`. */
	type Entrada = Parameters<typeof relatarProblema>[0];

	let {
		aberto = $bindable(false),
		questao,
		total,
		temAudio,
		fala,
		montar
	}: {
		aberto?: boolean;
		/** A posição da questão (1 é a primeira). */
		questao: number;
		total: number;
		/** A questão tem áudio — só então "o áudio não toca" é uma opção. */
		temAudio: boolean;
		/** É de fala — só então "o microfone não funcionou" é uma opção. */
		fala: boolean;
		/** Junta, na HORA de enviar, o que vai com o relato além do motivo. */
		montar: () => Omit<Entrada, 'motivo' | 'descricao'>;
	} = $props();

	let dialogo = $state<HTMLDialogElement | null>(null);
	let motivo = $state<Motivo | null>(null);
	let descricao = $state('');
	let enviando = $state(false);
	let erro = $state<string | null>(null);
	let codigo = $state<string | null>(null);

	const opcoes = $derived(
		MOTIVOS.filter((m) => (m === 'audio' ? temAudio : m === 'microfone' ? fala : true))
	);

	// `showModal()` é imperativo; o efeito espelha `aberto` no elemento.
	$effect(() => {
		if (!dialogo) return;
		if (aberto && !dialogo.open) {
			fechando = false;
			// Cada abertura começa do zero — inclusive depois de um relato enviado.
			motivo = null;
			descricao = '';
			erro = null;
			codigo = null;
			dialogo.showModal();
		} else if (!aberto && dialogo.open && !fechando) {
			fecharComSaida(dialogo);
		}
	});

	let fechando = $state(false);
	function fecharComSaida(el: HTMLDialogElement) {
		fechando = true;
		const terminar = () => {
			if (!fechando) return;
			fechando = false;
			if (!aberto && el.open) el.close();
		};
		el.addEventListener('animationend', terminar, { once: true });
		setTimeout(terminar, DURACAO.curta + 60);
	}
	const animacao = $derived(
		fechando
			? 'animate-modal-saida backdrop:animate-veu-saida'
			: 'open:animate-entrada-curta backdrop:animate-veu'
	);

	function fechar() {
		if (enviando) return;
		aberto = false;
	}

	async function enviar(evento: SubmitEvent) {
		evento.preventDefault();
		if (!motivo || enviando) return;
		enviando = true;
		erro = null;
		try {
			const resposta = await relatarProblema({
				...montar(),
				motivo,
				descricao: descricao.trim() || undefined
			});
			codigo = resposta.codigo;
		} catch (falha) {
			// A recusa do servidor (teto, clique duplo) vem com a frase pronta.
			const mensagem =
				falha && typeof falha === 'object' && 'body' in falha
					? (falha as { body?: { message?: unknown } }).body?.message
					: null;
			erro =
				typeof mensagem === 'string' && mensagem
					? mensagem
					: 'Não deu para mandar o relato agora. Confira a internet e tente de novo.';
		} finally {
			enviando = false;
		}
	}
</script>

<dialog
	bind:this={dialogo}
	onclose={() => (aberto = false)}
	oncancel={(e) => {
		e.preventDefault();
		fechar();
	}}
	onclick={(e) => {
		if (e.target === dialogo) fechar();
	}}
	aria-labelledby="relato-titulo"
	class="m-auto max-h-[calc(100dvh-1.75rem)] w-[calc(100vw-1.75rem)] max-w-[480px] overflow-hidden rounded-box border border-line bg-base-100 p-0 text-base-content
	       shadow-[0_34px_70px_-34px_rgb(var(--shadow)/0.55)] backdrop:bg-overlay backdrop:backdrop-blur-[3px]
	       {animacao}"
>
	<div class="flex max-h-[inherit] flex-col">
		<div class="flex shrink-0 items-start gap-3 border-b border-line px-5 py-4">
			<div class="min-w-0 flex-1">
				<h2 id="relato-titulo" class="font-display text-[21px] font-semibold tracking-[-0.02em]">
					{codigo ? 'Relato enviado' : 'Relatar um problema'}
				</h2>
				<p class="mt-0.5 text-[13px] text-base-content/65">
					Questão {questao} de {total}. Vai para a equipe do Spokke.
				</p>
			</div>
			<button
				type="button"
				onclick={fechar}
				disabled={enviando}
				class="grid size-11 shrink-0 place-items-center rounded-full text-base-content/65 hover:bg-base-200 hover:text-base-content"
				aria-label="Fechar"
			>
				<svg class="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		{#if codigo}
			<!-- Confirmação na cor da marca, não em verde: verde é a semântica da
			     correção, e isto não é um acerto. -->
			<div class="px-5 py-6" role="status">
				<div class="flex items-start gap-3">
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
					>
						<svg class="size-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M4 12.5l5 5L20 6.5"
								stroke="currentColor"
								stroke-width="2.4"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
					</span>
					<div>
						<p class="text-[15px] leading-relaxed">
							Obrigado. Com o relato a equipe acha o erro sem precisar te perguntar nada.
						</p>
						<p class="mt-2 text-[13px] text-base-content/65">
							Código do relato: <span class="font-mono font-semibold text-base-content"
								>{codigo}</span
							>
						</p>
					</div>
				</div>
				<button
					type="button"
					onclick={fechar}
					class="mt-6 btn min-h-12 w-full motion-tap btn-primary text-[15px] font-bold"
				>
					Voltar para a questão
				</button>
			</div>
		{:else}
			<form onsubmit={enviar} class="flex min-h-0 flex-col">
				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					<fieldset class="border-0 p-0" disabled={enviando}>
						<legend class="mb-2.5 text-[13.5px] font-semibold">O que aconteceu?</legend>
						<div class="grid gap-2">
							{#each opcoes as m (m)}
								<label
									class="flex min-h-12 cursor-pointer items-center gap-3 rounded-field border border-line px-3.5 py-2.5 text-[14px] leading-snug
									       transition-colors has-[:checked]:border-primary has-[:checked]:bg-primary/5"
								>
									<input type="radio" name="motivo" value={m} bind:group={motivo} class="radio" />
									{MOTIVO_NA_TELA[m]}
								</label>
							{/each}
						</div>
					</fieldset>

					<label class="mt-4 block">
						<span class="mb-1.5 block text-[13.5px] font-semibold"
							>Quer contar mais? <span class="font-normal text-base-content/65">(opcional)</span
							></span
						>
						<textarea
							bind:value={descricao}
							maxlength="1000"
							rows="3"
							disabled={enviando}
							placeholder="Ex.: escrevi “colour” e apareceu como errado."
							class="textarea w-full"></textarea>
					</label>

					<!-- O que vai junto, escrito ANTES de enviar: é dado dele, e quem
					     manda tem de saber o quê (auth.md "Dados do aluno e LGPD"). -->
					<p class="mt-3 text-[12.5px] leading-relaxed text-base-content/65">
						Vão junto a questão, a sua resposta nela e detalhes do aparelho (navegador, tela e erros
						da página) para a equipe achar o problema. O seu nome não vai.
					</p>

					{#if erro}
						<p class="mt-3 text-[13px] font-semibold text-error" role="alert">{erro}</p>
					{/if}
				</div>

				<div class="flex shrink-0 gap-2.5 border-t border-line bg-base-200 px-5 py-3.5">
					<button
						type="button"
						onclick={fechar}
						disabled={enviando}
						class="btn min-h-12 motion-tap btn-plain font-semibold">Cancelar</button
					>
					<button
						type="submit"
						disabled={!motivo || enviando}
						class="btn min-h-12 flex-1 motion-tap gap-2 btn-primary text-[15px] font-bold"
					>
						{#if enviando}
							<Loading variant="fila" size={12} tone="current" label="Enviando o relato" />
							Enviando…
						{:else}
							Enviar relato
						{/if}
					</button>
				</div>
			</form>
		{/if}
	</div>
</dialog>
