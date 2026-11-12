<script lang="ts">
	// A tabela de planos. UMA, para a home e para `/planos` — enquanto cada tela
	// tivesse a sua, as duas divergiam no primeiro ajuste de preço.
	//
	// **Os preços** saem de `$lib/billing/precos.ts` e os LIMITES de
	// `$lib/billing/catalogo.ts`, os dois através de `$lib/content/planos.ts` —
	// nunca daqui. Este componente desenha o que aquele arquivo diz.
	//
	// **Não decide o que "assinar" faz.** Quem está logado aperta o CTA e a
	// PÁGINA recebe `onescolher(plano, ciclo)` — sem gateway, ela registra um
	// pedido (adr-002-billing.md); com o Mercado Pago, abre o checkout. Sem
	// `onescolher` (a home, quem não tem conta) o CTA leva ao cadastro. O Scholar
	// é por contrato e leva sempre ao contato.
	//
	// **Mas DIZ o que o clique faz.** Com o Mercado Pago e um plano pago por ele
	// (`planoEmVigor`), o cartão do mesmo plano e ciclo não tem ação — ele renova
	// sozinho — e os outros TROCAM: ciclo novo com o valor cheio, e a parte não
	// usada do plano atual de volta no cartão (billing.md "Troca de plano"). A
	// regra é a mesma que `solicitarPlano` aplica (`$lib/billing/troca.ts`).
	//
	// **O plano ATUAL ganha o destaque de "seu plano agora"**, e o destaque de
	// marketing cede a vez: dizer "o mais escolhido" no cartão de quem já
	// assinou aquele plano é propaganda para dentro.
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import Loading from './Loading.svelte';
	import { ehPlanoPago } from '$lib/billing/catalogo';
	import { ehOPlanoEmVigor, type PlanoEmVigor } from '$lib/billing/troca';
	import {
		garantias,
		alunoNaoPaga,
		ledePadrao,
		planos,
		tituloPadrao,
		vantagemDoAnual,
		type CicloDeCobranca,
		type PlanoId
	} from '$lib/content/planos';

	let {
		/** O plano que a conta tem hoje, quando se sabe. Muda o cartão dele. */
		planoAtual = null,
		/** Sem cabeçalho quando a página já tem um título próprio acima. */
		mostrarCabecalho = true,
		mostrarRodape = true,
		titulo = tituloPadrao,
		lede = ledePadrao,
		/** Menos respiro, para caber dentro de outra seção. */
		compacto = false,
		/** Logado: o CTA chama isto em vez de levar ao cadastro. */
		onescolher,
		/** O plano já pedido e ainda não atendido — o cartão dele diz "pedido enviado". */
		pedidoPendente = null,
		/** O Mercado Pago está ligado: escolher abre o checkout, não um pedido para a equipe. */
		gateway = false,
		/** O plano que o Mercado Pago já cobra, quando há um. Muda o botão de cada cartão. */
		planoEmVigor = null,
		/** A conta da equipe tem o produto inteiro: nenhum cartão assina nada. */
		contaDaEquipe = false
	}: {
		planoAtual?: PlanoId | null;
		mostrarCabecalho?: boolean;
		mostrarRodape?: boolean;
		titulo?: string;
		lede?: string;
		compacto?: boolean;
		onescolher?: (plano: PlanoId, ciclo: CicloDeCobranca) => Promise<void>;
		pedidoPendente?: PlanoId | null;
		gateway?: boolean;
		planoEmVigor?: PlanoEmVigor | null;
		contaDaEquipe?: boolean;
	} = $props();

	/** O id do plano cujo pedido está indo ao servidor — o botão mostra a fila. */
	let escolhendo = $state<PlanoId | null>(null);

	async function escolher(plano: PlanoId) {
		if (!onescolher || escolhendo) return;
		escolhendo = plano;
		try {
			await onescolher(plano, ciclo);
		} finally {
			escolhendo = null;
		}
	}

	// Mensal é o padrão porque é o número que a pessoa compara primeiro; o anual
	// é a economia, e ela só interessa depois de o mensal parecer aceitável.
	// **Quem já assina abre no ciclo dele**: aberto no mensal, o assinante do
	// anual via o próprio plano como "Mudar para o mensal" até achar o seletor.
	// Só o valor INICIAL — depois, o seletor é de quem lê.
	let ciclo = $state<CicloDeCobranca>(untrack(() => planoEmVigor?.ciclo ?? 'mensal'));

	// ── o carrossel ──
	// Os planos passam como num carrossel: o cartão escolhido fica no centro, em
	// tamanho cheio, e os vizinhos aparecem um pouco menores e esmaecidos dos
	// lados. Abre no Pro (pedido do dono do repositório) — "escolhido" aqui é só
	// o cartão em foco; o CTA de cada cartão continua agindo sobre o plano dele.
	//
	// **A posição é CSS, não medida em JS.** A largura do cartão sai do próprio
	// contêiner (`100cqw`) e o trilho anda `índice × (cartão + vão)`: o servidor
	// já manda o Pro no centro, sem salto na hidratação e sem `resize` para ouvir.
	const PLANO_INICIAL: PlanoId = 'pro';
	let foco = $state(
		Math.max(
			0,
			planos.findIndex((p) => p.id === PLANO_INICIAL)
		)
	);
	const total = planos.length;

	function ir(i: number) {
		foco = Math.min(total - 1, Math.max(0, i));
	}

	/** Setas do teclado com o foco em qualquer coisa dentro do carrossel. */
	function tecla(e: KeyboardEvent) {
		if (e.key === 'ArrowRight') {
			e.preventDefault();
			ir(foco + 1);
		} else if (e.key === 'ArrowLeft') {
			e.preventDefault();
			ir(foco - 1);
		}
	}

	// Arrastar com o dedo. Só toque e caneta: com o mouse há as setas e o clique
	// no cartão do lado, e arrastar com ele selecionaria o texto do cartão.
	let gesto: { x: number; y: number } | null = null;
	function inicioDoGesto(e: PointerEvent) {
		if (e.pointerType === 'mouse') return;
		gesto = { x: e.clientX, y: e.clientY };
	}
	function fimDoGesto(e: PointerEvent) {
		if (!gesto) return;
		const dx = e.clientX - gesto.x;
		const dy = e.clientY - gesto.y;
		gesto = null;
		// Gesto horizontal de verdade; rolar a página na vertical não troca o plano.
		if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) ir(foco + (dx < 0 ? 1 : -1));
	}

	/** Clicar no cartão do lado traz ele para o centro — menos no CTA, que age. */
	function tocarNoCartao(e: MouseEvent, i: number) {
		if (i === foco) return;
		if ((e.target as HTMLElement).closest('a, button')) return;
		ir(i);
	}

	const ICONES: Record<string, string> = {
		spark: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z',
		person: 'M12 11.5a3.6 3.6 0 100-7.2 3.6 3.6 0 000 7.2zM5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5',
		school: 'M12 3.5l9 4.5-9 4.5-9-4.5zM6 11v5.5c0 1.7 2.7 3 6 3s6-1.3 6-3V11',
		bolt: 'M13.5 3L5 13.5h6L10.5 21 19 10.5h-6z'
	};

	/** O botão de um cartão e a linha embaixo dele: o que o clique faz, para quem está lendo. */
	function acaoDoCartao(p: (typeof planos)[number]): {
		cta: string;
		nota: string;
		semAcao: boolean;
	} {
		if (contaDaEquipe) {
			return {
				cta: 'Incluído na conta da equipe',
				nota: 'A conta da equipe tem o produto inteiro, sem assinatura.',
				semAcao: true
			};
		}
		if (pedidoPendente === p.id) {
			return {
				cta: 'Pedido enviado',
				nota: 'A equipe vai falar com você para combinar o pagamento.',
				semAcao: true
			};
		}
		const emVigor = gateway ? planoEmVigor : null;
		if (emVigor && ehPlanoPago(p.id)) {
			if (ehOPlanoEmVigor(emVigor, p.id, ciclo)) {
				return { cta: 'Seu plano agora', nota: 'Renova sozinho pelo Mercado Pago.', semAcao: true };
			}
			const mesmoPlano = emVigor.plano === p.id;
			return {
				// O mesmo plano e ciclo sem a renovação ligada é assinar de novo; o
				// mesmo plano noutro ciclo é trocar de ciclo; o resto é trocar de plano.
				cta:
					mesmoPlano && emVigor.ciclo === ciclo
						? 'Assinar de novo'
						: mesmoPlano
							? `Mudar para o ${ciclo}`
							: `Mudar para o ${p.nome}`,
				nota: 'Começa um ciclo novo hoje, com o valor cheio. A parte do plano atual que você não usou volta para o cartão.',
				semAcao: false
			};
		}
		if (planoAtual === p.id && !gateway) {
			return {
				cta: 'Renovar este plano',
				nota: 'Você já está neste plano. Renovar registra um pedido para a equipe.',
				semAcao: false
			};
		}
		return { cta: p.cta, nota: p.ctaNota, semAcao: false };
	}

	const cartoes = $derived(
		planos.map((p) => {
			const atual = planoAtual === p.id;
			const herói = !!p.destaque && !atual;
			const acao = acaoDoCartao(p);
			return {
				...p,
				atual,
				herói,
				precoAgora: p.preco[ciclo],
				notaAgora: p.nota[ciclo],
				// "Seu plano agora" vence o selo de marketing: é informação sobre a
				// conta de quem está lendo, não uma recomendação de venda.
				faixa: atual ? 'Seu plano agora' : p.destaque,
				semAcao: acao.semAcao,
				ctaAgora: acao.cta,
				ctaNotaAgora: acao.nota
			};
		})
	);
</script>

{#if mostrarCabecalho}
	<div class={compacto ? 'mb-6 text-center' : 'mb-8 text-center'}>
		<h2
			class="mx-auto mb-2.5 max-w-[26ch] font-display text-[24px] leading-[1.14] font-semibold tracking-[-0.024em] text-pretty lg:text-[30px]"
		>
			{titulo}
		</h2>
		<p
			class="mx-auto mb-5 max-w-[58ch] text-[14.5px] leading-relaxed text-pretty text-base-content/65"
		>
			{lede}
		</p>

		<div class="inline-flex flex-wrap items-center justify-center gap-3">
			<div
				class="flex gap-[3px] rounded-full border border-line bg-base-100 p-[3px]"
				role="group"
				aria-label="Ciclo de cobrança"
			>
				{#each [{ id: 'mensal' as const, label: 'Mensal' }, { id: 'anual' as const, label: 'Anual' }] as opcao (opcao.id)}
					<button
						type="button"
						onclick={() => (ciclo = opcao.id)}
						aria-pressed={ciclo === opcao.id}
						class="min-h-[42px] rounded-full px-4 py-[9px] text-[13px] font-bold transition-colors
						       {ciclo === opcao.id
							? 'bg-primary text-primary-content'
							: 'text-base-content/65 hover:text-base-content'}">{opcao.label}</button
					>
				{/each}
			</div>
			<span
				class="inline-flex items-center gap-[7px] rounded-full bg-accent/13 px-3.5 py-[7px] text-[12.5px] font-bold text-accent"
			>
				<svg class="size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12.5l4.5 4.5L19 7"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{vantagemDoAnual}
			</span>
		</div>
	</div>
{/if}

<!-- O carrossel segue o padrão da APG (região rotulada, um grupo por cartão,
     controles de verdade). As setas do teclado valem com o foco em qualquer
     coisa dentro dele, e o Tab até o botão de um cartão traz esse cartão ao
     centro (`onfocusin`): ninguém fica com o foco num cartão escondido.
     O `onkeydown` na região só ouve as setas que sobem dos controles de
     dentro dela; a região em si não recebe foco. -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
	class="@container"
	role="region"
	aria-roledescription="carrossel"
	aria-label="Planos"
	onkeydown={tecla}
>
	<!-- `overflow-x-clip` corta os cartões que passam da largura sem criar uma
	     área de rolagem; o `py-6`/`-my-6` dá à máscara das pontas espaço para a
	     sombra dos cartões, que senão sairia cortada em cima e embaixo. O arrasto
     é atalho de toque: as setas e os pontos fazem o mesmo. -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="-my-6 touch-pan-y overflow-x-clip [mask-image:linear-gradient(to_right,transparent,black_4%,black_96%,transparent)]
		       py-6"
		onpointerdown={inicioDoGesto}
		onpointerup={fimDoGesto}
		onpointercancel={() => (gesto = null)}
	>
		<div
			class="ms-[calc(50%-var(--cartao)/2)] flex gap-(--vao) transition-[translate] duration-(--duration-media) ease-in-out-soft
			       [--cartao:min(340px,calc(100cqw-60px))] [--vao:12px] sm:[--vao:20px]"
			style:translate="calc({-foco} * (var(--cartao) + var(--vao))) 0"
		>
			{#each cartoes as p, i (p.id)}
				{@const escolhido = i === foco}
				<!-- O clique no cartão do lado é atalho de mouse; pelo teclado, as setas,
				     os pontos e o Tab fazem o mesmo. -->
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<div
					role="group"
					aria-roledescription="plano"
					aria-label="{p.nome}, {i + 1} de {total}"
					onclick={(e) => tocarNoCartao(e, i)}
					onfocusin={() => (foco = i)}
					class="flex w-(--cartao) shrink-0 flex-col overflow-hidden rounded-[16px]
					       transition-[scale,opacity] duration-(--duration-media) ease-in-out-soft
					       {escolhido ? '' : 'scale-[0.92] cursor-pointer opacity-55 hover:opacity-80'}
					       {p.atual
						? 'border-[1.5px] border-accent bg-card shadow-[0_18px_40px_-28px_color-mix(in_oklab,var(--color-accent)_60%,transparent)]'
						: p.herói
							? 'border-[1.5px] border-primary bg-card shadow-[0_22px_48px_-30px_color-mix(in_oklab,var(--color-primary)_62%,transparent)]'
							: 'border border-line bg-card'}"
				>
					{#if p.faixa}
						<p
							class="flex items-center justify-center gap-2 px-3 py-2 text-xs font-bold tracking-[0.04em]
					       {p.atual
								? 'border-b border-accent/30 bg-accent/15 text-accent'
								: 'bg-primary text-primary-content'}"
						>
							<svg class="size-[13px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								{#if p.atual}
									<path
										d="M12 3.5l2.2 1.6 2.7-.2.9 2.6 2.2 1.6-1 2.5 1 2.5-2.2 1.6-.9 2.6-2.7-.2L12 20.5l-2.2-1.6-2.7.2-.9-2.6L4 14.9l1-2.5-1-2.5 2.2-1.6.9-2.6 2.7.2z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								{:else}
									<path
										d="M12 3.8l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 10l5.9-.9z"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								{/if}
							</svg>
							{p.faixa}
						</p>
					{/if}

					<div class="shrink-0 border-b border-line {compacto ? 'p-4' : 'px-[22px] py-5'}">
						<div class="mb-3 flex items-center gap-2.5">
							<span
								class="grid size-[34px] shrink-0 place-items-center rounded-[10px]
						       {p.herói
									? 'bg-primary text-primary-content'
									: p.atual
										? 'bg-accent/14 text-accent'
										: 'bg-base-300 text-primary'}"
							>
								<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d={ICONES[p.icone]}
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
							</span>
							<span class="min-w-0">
								<span class="block font-display text-[18px] font-semibold tracking-[-0.018em]"
									>{p.nome}</span
								>
								<span class="mt-0.5 block text-[12.5px] text-base-content/65">{p.para}</span>
							</span>
						</div>

						<p class="mb-1.5 flex flex-wrap items-end gap-x-2 gap-y-1">
							<span class="font-display text-[36px] leading-none font-extrabold tracking-[-0.032em]"
								>{p.precoAgora}</span
							>
							<span class="pb-1 text-[13px] text-base-content/65">{p.unidade}</span>
						</p>
						<p
							class="min-h-[34px] text-[12.5px] leading-normal text-pretty
					       {ciclo === 'anual' && !p.porContrato ? 'text-base-content' : 'text-base-content/65'}"
						>
							{p.notaAgora}
						</p>
					</div>

					<div class="flex-1 {compacto ? 'p-4' : 'px-[22px] py-5'}">
						<p class="mb-3 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
							{p.listaTitulo}
						</p>
						<ul class="grid list-none gap-2.5 p-0">
							{#each p.recursos as r (r.label)}
								<li class="flex items-start gap-2.5 text-[13.5px] leading-normal">
									<!-- Ausência é um traço apagado, não um X vermelho: vermelho é a
							     semântica de correção e não decora uma comparação de plano. -->
									<svg
										class="mt-0.5 size-4 shrink-0 {r.incluso
											? 'text-success'
											: 'text-base-content/55'}"
										viewBox="0 0 24 24"
										fill="none"
										aria-hidden="true"
									>
										<path
											d={r.incluso ? 'M5 12.5l4.5 4.5L19 7' : 'M6 12h12'}
											stroke="currentColor"
											stroke-width="2.2"
											stroke-linecap="round"
											stroke-linejoin="round"
										/>
									</svg>
									<span class="min-w-0 {r.incluso ? '' : 'text-base-content/65'}">
										{r.label}
										<span class="sr-only">{r.incluso ? '— incluído' : '— não incluído'}</span>
									</span>
								</li>
							{/each}
						</ul>
					</div>

					<div class="shrink-0 {compacto ? 'px-4 pb-4' : 'px-[22px] pb-[22px]'}">
						{#if p.porContrato}
							<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais a query do assunto; a regra não enxerga a concatenação. -->
							<a
								href={resolve('/(site)/contato') + '?assunto=escolas'}
								class="btn min-h-12 w-full motion-tap gap-2.5 btn-outline text-[14.5px] font-bold no-underline"
							>
								{p.ctaAgora}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{:else if onescolher}
							<!-- A página decide: um pedido (sem gateway) ou o checkout (Mercado Pago). -->
							<button
								type="button"
								onclick={() => escolher(p.id)}
								disabled={escolhendo !== null || p.semAcao}
								class="btn min-h-12 w-full motion-tap gap-2.5 text-[14.5px] font-bold
						       {p.atual || p.semAcao ? 'btn-plain' : p.herói ? 'btn-primary' : 'btn-outline'}"
							>
								{#if escolhendo === p.id}
									<Loading
										variant="fila"
										size={10}
										tone="current"
										label={gateway ? 'Abrindo o pagamento' : 'Enviando o pedido'}
									/>
								{/if}
								{p.ctaAgora}
							</button>
						{:else}
							<a
								href={resolve('/(auth)/cadastro')}
								class="btn min-h-12 w-full motion-tap gap-2.5 text-[14.5px] font-bold no-underline
						       {p.atual ? 'btn-plain' : p.herói ? 'btn-primary' : 'btn-outline'}"
							>
								{p.ctaAgora}
							</a>
						{/if}
						<p class="mt-2.5 text-center text-xs leading-normal text-pretty text-base-content/65">
							{p.ctaNotaAgora}
						</p>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- As setas e um ponto por plano, embaixo e no centro: no celular, setas
	     nas laterais cobririam justamente as pontas dos cartões vizinhos, que são
	     o que diz que há mais planos para os lados. -->
	<div class="mt-5 flex items-center justify-center gap-3">
		<button
			type="button"
			onclick={() => ir(foco - 1)}
			disabled={foco === 0}
			aria-label="Plano anterior"
			class="btn btn-circle size-11 min-h-11 motion-tap btn-outline"
		>
			<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M14.5 6l-6 6 6 6"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
		<div class="flex items-center">
			{#each cartoes as p, i (p.id)}
				<button
					type="button"
					onclick={() => ir(i)}
					aria-label="Ver o plano {p.nome}"
					aria-current={i === foco ? 'true' : undefined}
					class="group grid h-8 min-w-6 place-items-center px-1"
				>
					<span
						class="block h-2 rounded-full transition-colors
						       {i === foco ? 'w-6 bg-primary' : 'w-2 bg-base-content/25 group-hover:bg-base-content/50'}"
					></span>
				</button>
			{/each}
		</div>
		<button
			type="button"
			onclick={() => ir(foco + 1)}
			disabled={foco === total - 1}
			aria-label="Próximo plano"
			class="btn btn-circle size-11 min-h-11 motion-tap btn-outline"
		>
			<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path
					d="M9.5 6l6 6-6 6"
					stroke="currentColor"
					stroke-width="2.2"
					stroke-linecap="round"
					stroke-linejoin="round"
				/>
			</svg>
		</button>
	</div>
	<p class="sr-only" aria-live="polite">{cartoes[foco]?.nome}, {foco + 1} de {total}</p>
</div>

{#if mostrarRodape}
	<!-- A promessa que vale em qualquer plano, e que é desenho de produto: a
	     cobrança mexe no lado do professor, nunca no do aluno. -->
	<div
		class="mt-[18px] flex flex-wrap items-center gap-x-[18px] gap-y-3.5 rounded-[14px] border border-s-[3px] border-line border-s-accent bg-card px-5 py-[18px]"
	>
		<svg
			class="mt-0.5 size-[19px] shrink-0 self-start text-accent"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
			<path
				d="M12 11v5.5M12 7.6v.1"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
			/>
		</svg>
		<div class="min-w-[240px] flex-1">
			<p class="mb-1.5 text-sm font-bold">{alunoNaoPaga.titulo}</p>
			<p class="max-w-[80ch] text-[13px] leading-relaxed text-pretty text-base-content/65">
				{alunoNaoPaga.texto}
			</p>
		</div>
		<!-- `max-w-full`: com `shrink-0` sozinho a lista ocupava a largura das
		     pílulas em fila, e no celular a página inteira rolava de lado. -->
		<ul class="flex max-w-full shrink-0 list-none flex-wrap gap-2 p-0">
			{#each garantias as g (g)}
				<li
					class="inline-flex items-center gap-[7px] rounded-full border border-line bg-base-200 px-3.5 py-[7px] text-[12.5px] font-semibold whitespace-nowrap"
				>
					<svg
						class="size-[13px] shrink-0 text-success"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M5 12.5l4.5 4.5L19 7"
							stroke="currentColor"
							stroke-width="2.6"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{g}
				</li>
			{/each}
		</ul>
	</div>
{/if}
