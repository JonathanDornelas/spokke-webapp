<script lang="ts">
	// O editor do avatar. Onze categorias, nenhuma obrigatória.
	//
	// **É um `<dialog>` de verdade, não uma `div` com fundo escuro.** Foco preso,
	// Escape e o backdrop vêm do próprio elemento — e "sem framework de UI"
	// (design-system.md) é razão para usar a plataforma, não para reimplementar
	// o que ela já faz. Uma `div` exigiria prender o foco à mão, e essa é
	// exatamente a parte que costuma ficar pela metade.
	//
	// **Cada miniatura mostra a escolha no avatar de AGORA**, não num manequim:
	// é a única forma de saber se aquele cabelo combina com aquela pele. O custo
	// é desenhar ~20 avatares por categoria, e por isso o gerador junta pixels
	// vizinhos numa faixa só (`montar.ts`).
	//
	// Cancelar devolve o avatar como estava ao abrir — inclusive no Escape.
	import Avatar from './Avatar.svelte';
	import { CATEGORIAS, CATEGORIA_INICIAL, SUGESTOES, type Categoria } from '$lib/avatar/catalogo';
	import {
		acessoriosLigados,
		alternarAcessorio,
		codigoDaOpcao,
		trocarCasa
	} from '$lib/avatar/editar';
	import { sortearCodigo } from '$lib/avatar/montar';
	import { DURACAO } from '$lib/movimento';

	let {
		/** O código em edição. Sobe a cada toque, para a prévia de fora acompanhar. */
		codigo = $bindable(),
		aberto = $bindable(false),
		/** Chamado no "Usar este avatar", com o código final. */
		onusar,
		/** Chamado ao cancelar ou fechar, já com o código restaurado. */
		oncancelar
	}: {
		codigo: string;
		aberto?: boolean;
		onusar?: (codigo: string) => void;
		oncancelar?: () => void;
	} = $props();

	let dialogo = $state<HTMLDialogElement | null>(null);
	let categoria = $state(CATEGORIA_INICIAL);
	/** O avatar como estava ao abrir — o que "Cancelar" devolve. */
	let comoEstava = $state(codigo);

	// `showModal()` é imperativo: não existe atributo que o faça. O efeito
	// espelha `aberto` no elemento nos dois sentidos de abertura.
	$effect(() => {
		if (!dialogo) return;
		if (aberto && !dialogo.open) {
			comoEstava = codigo;
			fechando = false;
			dialogo.showModal();
		} else if (!aberto && dialogo.open && !fechando) {
			fecharComSaida(dialogo);
		}
	});

	/**
	 * Fechar ANIMA antes de fechar: o `close()` nativo some com o diálogo e o
	 * véu no mesmo quadro, e a tela parecia piscar. A saída (`--duration-curta`) roda com o
	 * diálogo ainda aberto; o `close()` vem no fim dela. O `setTimeout` é a rede
	 * para quando a animação não roda e o `animationend` nunca chega.
	 */
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

	const atual = $derived<Categoria>(
		CATEGORIAS.find((c) => c.chave === categoria) ?? (CATEGORIAS[1] as Categoria)
	);
	const ligados = $derived(acessoriosLigados(codigo));
	const multi = $derived(atual.chave === 'acessorio');

	/** Quantas peças a pessoa já escolheu nesta categoria — vai no rótulo da aba. */
	function contagem(c: Categoria): string {
		if (c.chave === 'acessorio') return `${acessoriosLigados(codigo).length}/3`;
		const casa = c.iForma ?? c.iCor;
		const total = c.iForma === null ? c.paleta.length : c.nFormas;
		const n = codigo.split('-').map(Number)[casa] ?? 0;
		return `${n + 1}/${total}`;
	}

	const opcoes = $derived(
		atual.iForma === null
			? []
			: Array.from({ length: atual.nFormas }, (_, i) => ({
					i,
					nome: atual.nomes[i] ?? String(i + 1),
					codigo: codigoDaOpcao(codigo, atual.iForma as number, i),
					ativo: multi ? (i === 0 ? ligados.length === 0 : ligados.includes(i)) : escolhida(i)
				}))
	);

	function escolhida(i: number): boolean {
		const casa = atual.iForma;
		if (casa === null) return false;
		return (codigo.split('-').map(Number)[casa] ?? 0) === i;
	}

	const corEscolhida = $derived(
		atual.iCor >= 0 ? (codigo.split('-').map(Number)[atual.iCor] ?? 0) : -1
	);

	function tocarPeca(i: number) {
		if (atual.iForma === null) return;
		codigo = multi ? alternarAcessorio(codigo, i) : trocarCasa(codigo, atual.iForma, i);
	}

	function cancelar() {
		codigo = comoEstava;
		aberto = false;
		oncancelar?.();
	}

	function usar() {
		aberto = false;
		onusar?.(codigo);
	}
</script>

<!-- Escape (o `cancel` nativo, com o fechar imediato impedido para a saída
     animar) e o clique no véu (o clique cai no próprio `<dialog>`, fora do
     conteúdo) devolvem o avatar como estava — senão "fechar sem querer" grava
     a mudança. O véu é o `overlay`, preto nos dois temas. -->
<dialog
	bind:this={dialogo}
	onclose={() => {
		if (aberto) cancelar();
	}}
	oncancel={(e) => {
		e.preventDefault();
		cancelar();
	}}
	onclick={(e) => {
		if (e.target === dialogo) cancelar();
	}}
	aria-labelledby="avatar-editor-titulo"
	class="m-auto max-h-[calc(100dvh-1.75rem)] w-[calc(100vw-1.75rem)] max-w-[880px] overflow-hidden rounded-box border border-line bg-base-100 p-0 text-base-content
	       shadow-[0_34px_70px_-34px_rgba(15,20,32,0.55)] backdrop:bg-overlay backdrop:backdrop-blur-[3px]
	       {animacao} lg:max-h-[min(720px,calc(100dvh-3.75rem))]"
>
	<div class="flex max-h-[inherit] flex-col">
		<div class="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3.5 lg:px-[22px]">
			<span class="min-w-0 flex-1">
				<span
					id="avatar-editor-titulo"
					class="block font-display text-[19px] font-semibold tracking-[-0.02em]"
					>Monte seu avatar</span
				>
				<span class="mt-0.5 block text-[12.5px] text-base-content/65"
					>onze peças · nenhuma obrigatória</span
				>
			</span>
			<button
				type="button"
				onclick={cancelar}
				aria-label="Fechar sem salvar"
				class="btn btn-circle size-[38px] shrink-0 motion-tap btn-plain"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M6 6l12 12M18 6L6 18"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/>
				</svg>
			</button>
		</div>

		<div
			class="grid min-h-0 flex-1 overflow-auto lg:grid-cols-[268px_minmax(0,1fr)] lg:overflow-hidden"
		>
			<!-- prévia: o tamanho grande mais os três tamanhos reais de uso -->
			<div
				class="flex flex-col gap-3.5 border-b border-line bg-base-200 p-4 lg:border-e lg:border-b-0 lg:border-line lg:px-5 lg:py-[22px]"
			>
				<span
					class="mx-auto block aspect-square w-full max-w-[200px] overflow-hidden rounded-[14px] border border-line"
				>
					<Avatar {codigo} size={200} radius="rounded-none" class="size-full" />
				</span>
				<!-- Os três tamanhos em que o avatar de fato aparece: cabeçalho,
				     linha de turma e lista densa. É aqui que se descobre que as
				     sardas somem em 32px — e é para ser assim. -->
				<div class="flex items-end justify-center gap-3">
					{#each [56, 40, 32] as px (px)}
						<span class="grid justify-items-center gap-1.5">
							<Avatar {codigo} size={px} radius="rounded-[6px]" class="border border-line" />
							<span class="font-mono text-[10.5px] text-base-content/65">{px}</span>
						</span>
					{/each}
				</div>
				<button
					type="button"
					onclick={() => (codigo = sortearCodigo())}
					class="btn min-h-11 w-full motion-tap gap-2 btn-plain text-[13.5px] font-semibold"
				>
					<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<rect
							x="3.5"
							y="3.5"
							width="17"
							height="17"
							rx="4"
							stroke="currentColor"
							stroke-width="2"
						/>
						<circle cx="9" cy="9" r="1.5" fill="currentColor" />
						<circle cx="15" cy="15" r="1.5" fill="currentColor" />
						<circle cx="15" cy="9" r="1.5" fill="currentColor" />
						<circle cx="9" cy="15" r="1.5" fill="currentColor" />
					</svg>
					Sortear tudo
				</button>

				<div>
					<p class="mb-2.5 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
						Prontos
					</p>
					<div class="flex flex-wrap gap-2">
						{#each SUGESTOES as sugestao (sugestao)}
							<button
								type="button"
								onclick={() => (codigo = sugestao)}
								aria-pressed={codigo === sugestao}
								aria-label="Usar este avatar pronto"
								class="rounded-[9px] border-2 p-0 transition-transform duration-200 ease-out-soft hover:-translate-y-0.5
								       {codigo === sugestao ? 'border-primary' : 'border-line'}"
							>
								<Avatar codigo={sugestao} size={34} radius="rounded-[7px]" />
							</button>
						{/each}
					</div>
				</div>
			</div>

			<!-- as peças -->
			<div class="flex min-h-0 min-w-0 flex-col">
				<div
					class="flex shrink-0 flex-wrap gap-1.5 border-b border-line px-3.5 py-[11px] lg:px-5 lg:py-[13px]"
				>
					{#each CATEGORIAS as c (c.chave)}
						<button
							type="button"
							onclick={() => (categoria = c.chave)}
							aria-pressed={categoria === c.chave}
							class="flex min-h-[38px] items-center gap-[7px] rounded-full border-[1.5px] px-3 py-[7px] text-[12.5px] font-semibold whitespace-nowrap transition-colors
							       {categoria === c.chave
								? 'border-primary bg-primary text-primary-content'
								: 'border-line bg-base-100 text-base-content hover:border-primary'}"
						>
							{c.label}
							<span class="font-mono text-[10.5px] opacity-70">{contagem(c)}</span>
						</button>
					{/each}
				</div>

				<div class="min-h-0 flex-1 px-3.5 pt-4 pb-5 lg:overflow-auto lg:px-5 lg:pt-[18px] lg:pb-6">
					<p
						class="mb-3.5 max-w-[62ch] text-[12.5px] leading-relaxed text-pretty text-base-content/65"
					>
						{atual.nota}
					</p>

					{#if opcoes.length > 0}
						<div class="grid grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-[9px]">
							{#each opcoes as o (o.i)}
								<button
									type="button"
									onclick={() => tocarPeca(o.i)}
									aria-pressed={o.ativo}
									class="grid justify-items-center gap-1.5 rounded-[12px] border-2 px-1.5 pt-2 pb-[7px] transition-transform duration-200 ease-out-soft hover:-translate-y-0.5
									       {o.ativo ? 'border-primary bg-base-300' : 'border-line bg-base-200'}"
								>
									<Avatar
										codigo={o.codigo}
										size={58}
										radius="rounded-[8px]"
										class="w-full max-w-[58px]"
									/>
									<span
										class="text-center text-[11px] leading-tight font-semibold {o.ativo
											? 'text-primary'
											: 'text-base-content/65'}">{o.nome}</span
									>
								</button>
							{/each}
						</div>
					{/if}

					{#if atual.paleta.length > 0}
						<div class={opcoes.length > 0 ? 'mt-[18px] border-t border-line pt-4' : ''}>
							<p
								class="mb-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
							>
								{atual.corLabel}
							</p>
							<div class="flex flex-wrap gap-2">
								{#each atual.paleta as cor, i (cor)}
									<button
										type="button"
										onclick={() => (codigo = trocarCasa(codigo, atual.iCor, i))}
										aria-pressed={corEscolhida === i}
										aria-label="{atual.corLabel}, opção {i + 1}"
										class="grid size-12 place-items-center rounded-[12px] border-2 transition-transform duration-200 ease-out-soft hover:-translate-y-0.5
										       {corEscolhida === i ? 'border-primary bg-base-300' : 'border-line bg-base-200'}"
									>
										<!-- A cor é conteúdo (é a pele de alguém), não um token de
										     interface — ver `paletas.ts`. -->
										<span class="block size-7 rounded-[7px]" style="background: {cor};"></span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>
		</div>

		<div
			class="flex shrink-0 flex-wrap items-center gap-2.5 border-t border-line bg-base-200 px-3.5 py-3 lg:px-[22px] lg:py-[13px]"
		>
			<button
				type="button"
				onclick={cancelar}
				class="btn min-h-[46px] motion-tap btn-outline font-semibold">Cancelar</button
			>
			<span class="hidden flex-1 text-[12.5px] text-base-content/65 lg:block">
				O avatar é gravado como dezoito números, não como imagem.
			</span>
			<button
				type="button"
				onclick={usar}
				class="btn min-h-[46px] flex-1 motion-tap btn-primary font-bold lg:flex-none lg:px-[22px]"
				>Usar este avatar</button
			>
		</div>
	</div>
</dialog>
