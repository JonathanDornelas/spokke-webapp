<script lang="ts">
	// A atividade aberta. Abrir uma da lista caía direto em `resultados`, que
	// responde "como foi" — antes de o professor poder ver "o que é", e numa
	// atividade sem tentativa nenhuma era uma tela vazia.
	//
	// **Em ordem de pergunta, e só o que vale para o estado dela** (paginas.md "A
	// atividade aberta"): o cartão do topo diz o que é e em que estado está, com a
	// ação desse estado (publicar, enviar, desarquivar); depois como a turma entra
	// (só no ar), as questões como na revisão (o roteiro com o celular, só para
	// ver), quem respondeu (só no ar e com resposta) e, por fim, arquivar ou apagar.
	import { marcarVisto } from '$lib/client/avisos';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { goto, invalidateAll } from '$app/navigation';
	import { tick } from 'svelte';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import CelularDoAluno from '$lib/components/CelularDoAluno.svelte';
	import {
		ICONE_DO_CELULAR,
		SETA_SOB_O_CELULAR,
		VER_NO_CELULAR,
		rolarAtePalco
	} from '$lib/components/celular-do-aluno';
	import PreviaDaQuestao from '$lib/components/PreviaDaQuestao.svelte';
	import {
		apagarAtividade,
		arquivarAtividade,
		definirNivel,
		desarquivarAtividade,
		regerarAudio,
		renomearAtividade
	} from '../atividades.remote';
	import { NIVEIS, nivelOuNulo, rotuloDoNivel } from '$lib/atividades/nivel';
	import { TETO_DO_TITULO } from '$lib/atividades/titulo';
	import { CLASSE_DA_ETIQUETA, corOuPadrao } from '$lib/etiquetas';
	import { ICONE_DA_HABILIDADE, ROTULO_DA_HABILIDADE } from '$lib/atividades/questao-resumida';
	import { KERNEL_TO_KIND, PILL_TONE, tipoDe } from '$lib/components/material-form';
	import { adicionarAoModulo } from '../../modulos/modulos.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const linkVisivel = $derived(data.link ? (data.link.split('//')[1] ?? data.link) : '');
	const noAr = $derived(data.estado !== 'rascunho');

	// ── o estado, no cartão do topo ─────────────────────────────────────────
	// Quatro, e a frase é sobre o ALUNO: o que ele encontra ao abrir o link. Sem
	// número de versão em lugar nenhum (paginas.md). Arquivada vence os outros:
	// é o que muda o que o aluno encontra.
	type EstadoVisto = 'no-ar' | 'mudancas' | 'rascunho' | 'arquivada';
	const estados: Record<EstadoVisto, { label: string; pill: string; nota: string; icon: string }> =
		{
			'no-ar': {
				label: 'No ar',
				pill: 'bg-primary text-primary-content',
				nota: 'O link responde. Quem abrir agora faz exatamente esta versão.',
				icon: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM8.5 12.2l2.4 2.4 4.6-4.9'
			},
			mudancas: {
				label: 'Mudanças por publicar',
				pill: 'bg-warning/14 text-warning',
				nota: 'Você editou depois de publicar. O link continua com o que já estava no ar, sem estas mudanças.',
				icon: 'M12 4.5l8 14.5H4zM12 10v3.4M12 16.3v.1'
			},
			rascunho: {
				label: 'Rascunho',
				pill: 'border border-dashed border-base-content/35 text-base-content/70',
				nota: 'Ainda não existe link: ele nasce quando você publicar, junto com o QR e o código.',
				icon: 'M5 4.5h9l5 5v10H5zM13.5 4.5V10H19'
			},
			arquivada: {
				label: 'Arquivada',
				pill: 'border border-dashed border-base-content/35 text-base-content/70',
				nota: 'O link está fechado para quem ainda não começou. Os resultados continuam aqui, e ela não conta no limite do seu plano.',
				icon: 'M4 7.5h16v3H4zM5.5 10.5v8h13v-8M10 14h4'
			}
		};
	const estadoVisto = $derived<EstadoVisto>(data.activity.arquivada ? 'arquivada' : data.estado);
	const estado = $derived(estados[estadoVisto]);

	// Os números do cartão. Num rascunho, tentativa e turma são sempre zero: só as
	// questões dizem alguma coisa.
	const numeros = $derived([
		{ value: data.questoes.length, label: data.questoes.length === 1 ? 'questão' : 'questões' },
		...(noAr
			? [
					{
						value: data.attempts.total,
						label: 'tentativas',
						tone: data.attempts.total > 0 ? ('primary' as const) : undefined
					},
					{ value: data.attempts.finished, label: 'terminadas' },
					{ value: data.deliveries.length, label: 'turmas que receberam' }
				]
			: [])
	]);

	// ── o áudio ── A única parte da atividade que vive fora do banco. Ele não
	// vence, mas pode estar FALTANDO (síntese na fila ou um job que falhou), e só
	// aí ele aparece no topo, com o conserto.
	const temAudio = $derived(data.audio.total > 0);
	const audioPronto = $derived(data.audio.done >= data.audio.total);
	let regerando = $state(false);
	async function regerar() {
		if (regerando) return;
		regerando = true;
		try {
			await regerarAudio({ activityId: data.activity.id });
			await invalidateAll();
		} finally {
			regerando = false;
		}
	}

	// ── o título, editado no próprio cartão ────────────────────────────────
	// Renomear não pede o wizard (pedido do dono do repositório): é UM campo, e
	// a etapa 1 era o único lugar. Vale na hora, inclusive no que está no ar.
	let renomeando = $state(false);
	let tituloNovo = $state('');
	let salvandoTitulo = $state(false);
	let erroDoTitulo = $state<string | null>(null);
	let campoDoTitulo = $state<HTMLInputElement>();
	async function abrirRenomear() {
		tituloNovo = data.activity.title;
		erroDoTitulo = null;
		renomeando = true;
		await tick();
		campoDoTitulo?.focus();
		campoDoTitulo?.select();
	}
	function cancelarRenomear() {
		renomeando = false;
		erroDoTitulo = null;
	}
	async function salvarTitulo(evento: SubmitEvent) {
		evento.preventDefault();
		const titulo = tituloNovo.trim();
		if (!titulo) {
			erroDoTitulo = 'Dê um título para a atividade.';
			return;
		}
		if (titulo === data.activity.title) {
			renomeando = false;
			return;
		}
		salvandoTitulo = true;
		erroDoTitulo = null;
		try {
			const r = await renomearAtividade({ activityId: data.activity.id, title: titulo });
			if (!r.ok) {
				erroDoTitulo = 'Não deu para renomear agora.';
				return;
			}
			await invalidateAll();
			renomeando = false;
		} catch {
			erroDoTitulo = 'Não deu para renomear agora. Tente de novo em instantes.';
		} finally {
			salvandoTitulo = false;
		}
	}

	// ── nível e módulos, editados no próprio cartão ─────────────────────────
	let salvandoNivel = $state(false);
	async function trocarNivel(valor: string) {
		salvandoNivel = true;
		try {
			await definirNivel({ activityId: data.activity.id, level: nivelOuNulo(valor) });
			await invalidateAll();
		} finally {
			salvandoNivel = false;
		}
	}
	let moduloEscolhido = $state('');
	let acrescentandoAoModulo = $state(false);
	async function acrescentarAoModulo() {
		if (!moduloEscolhido) return;
		acrescentandoAoModulo = true;
		try {
			await adicionarAoModulo({ moduleId: moduloEscolhido, activityIds: [data.activity.id] });
			moduloEscolhido = '';
			await invalidateAll();
		} finally {
			acrescentandoAoModulo = false;
		}
	}

	// ── as questões: o roteiro, como na revisão, só para ver ────────────────
	let escolhidaId = $state<string | null>(null);
	const escolhida = $derived(
		data.questoes.find((q) => q.id === escolhidaId) ?? data.questoes[0] ?? null
	);
	function andar(passo: number) {
		if (!escolhida) return;
		const i = data.questoes.findIndex((q) => q.id === escolhida.id);
		const proxima = data.questoes[i + passo];
		if (proxima) escolhidaId = proxima.id;
	}
	/** O palco, para o "Ver no celular" da linha escolhida (no celular ele fica acima da lista). */
	let palco = $state<HTMLElement>();
	const verNoCelular = () => rolarAtePalco(palco);
	// `?voltar=detalhe`: a prévia é uma tela fechada, e o X dela traz de volta
	// para cá. O loader dela valida o token contra uma lista fechada.
	const previa = $derived(
		`${resolve('/(studio)/atividades/[id]/previa', { id: data.activity.id })}?voltar=detalhe`
	);

	// Distribuição das respostas em porcentagem — parcial com faixa própria,
	// nunca somada ao erro (design-system.md "Estado de correção").
	const totalRespostas = $derived(data.score.correct + data.score.partial + data.score.incorrect);
	function pct(parte: number): number {
		return totalRespostas > 0 ? Math.round((parte / totalRespostas) * 100) : 0;
	}
	function percentual(parte: number, total: number): number {
		return total > 0 ? Math.round((parte / total) * 100) : 0;
	}

	// ── arquivar e apagar ── Os limites do plano são de ESTOQUE
	// (docs/adr-002-billing.md): arquivar é o jeito de liberar a vaga sem perder
	// o que a turma fez; apagar é para quando nem os resultados importam mais.
	let acaoDoFim = $state<'arquivar' | 'desarquivar' | 'apagar' | null>(null);
	let erroDoFim = $state<string | null>(null);
	let erroDoTopo = $state<string | null>(null);
	let motivo = $state<string | null>(null);
	let confirmandoApagar = $state(false);
	let tituloDigitado = $state('');

	async function arquivar() {
		acaoDoFim = 'arquivar';
		erroDoFim = null;
		try {
			const r = await arquivarAtividade({ activityId: data.activity.id });
			if (!r.ok) erroDoFim = 'Não deu para arquivar agora.';
			await invalidateAll();
		} catch {
			erroDoFim = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			acaoDoFim = null;
		}
	}

	async function desarquivar() {
		acaoDoFim = 'desarquivar';
		erroDoTopo = null;
		motivo = null;
		try {
			const r = await desarquivarAtividade({ activityId: data.activity.id });
			if (!r.ok) {
				erroDoTopo =
					'error' in r && typeof r.error === 'string' ? r.error : 'Não deu para concluir agora.';
				motivo = 'motivo' in r && typeof r.motivo === 'string' ? r.motivo : null;
			}
			await invalidateAll();
		} catch {
			erroDoTopo = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			acaoDoFim = null;
		}
	}

	async function apagarDeVez() {
		acaoDoFim = 'apagar';
		erroDoFim = null;
		try {
			const r = await apagarAtividade({
				activityId: data.activity.id,
				confirmacao: tituloDigitado
			});
			if (r.ok) {
				await goto(resolve('/(studio)/atividades'), { invalidateAll: true });
				return;
			}
			erroDoFim = 'error' in r && r.error ? r.error : 'Não deu para apagar.';
		} catch {
			erroDoFim = 'Não deu para apagar agora. Tente de novo em instantes.';
		} finally {
			acaoDoFim = null;
		}
	}

	let copiado = $state(false);
	async function copiarLink() {
		if (!data.link) return;
		try {
			await navigator.clipboard.writeText(data.link);
			copiado = true;
			setTimeout(() => (copiado = false), 2000);
		} catch {
			// Clipboard bloqueado (sem HTTPS, permissão negada): o link continua
			// visível e selecionável — não vale quebrar a tela por isso.
			copiado = false;
		}
	}

	// Abrir a atividade conta como ver o aviso do áudio que falhou
	// (docs/notificacoes.md): o cartão do topo mostra o problema e o conserto.
	$effect(() => {
		const activityId = page.params.id;
		if (activityId) marcarVisto({ secao: 'atividades', activityId });
	});

	const ROTULO = 'text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase';
</script>

<svelte:head><title>{data.activity.title} · Atividades · Spokke</title></svelte:head>

{#snippet icone(d: string, classe = 'size-4')}
	<svg class="{classe} shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
		<path
			{d}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
{/snippet}

<div class="pagina-studio">
	<a
		href={resolve('/(studio)/atividades')}
		class="mb-4 inline-flex items-center gap-2 py-1 text-[0.84rem] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
	>
		{@render icone('M15 5l-7 7 7 7')}
		Atividades
	</a>

	<!-- ═══ 1. o que é, e em que estado ═══ O estado e a ação dele moram AQUI:
	     antes eram um cartão à parte sob este, e o rascunho tinha três avisos
	     de "publique" espalhados pela tela. -->
	<HeaderCard numbers={numeros}>
		{#snippet badge()}
			<span
				class="grid size-[46px] shrink-0 place-items-center rounded-[13px] bg-base-300 text-primary"
			>
				{@render icone('M4 5.5h16v13H4zM4 10h16M8 14h8', 'size-[22px]')}
			</span>
		{/snippet}
		{#if renomeando}
			<form onsubmit={salvarTitulo} class="mb-2.5 flex flex-wrap items-center gap-2">
				<label class="sr-only" for="titulo-da-atividade">Título da atividade</label>
				<input
					id="titulo-da-atividade"
					bind:this={campoDoTitulo}
					bind:value={tituloNovo}
					maxlength={TETO_DO_TITULO}
					autocomplete="off"
					onkeydown={(e) => {
						if (e.key === 'Escape') cancelarRenomear();
					}}
					class="input min-h-11 w-full min-w-0 font-display text-[18px] font-semibold sm:w-auto sm:flex-1 lg:text-[22px]"
				/>
				<button
					type="submit"
					disabled={salvandoTitulo}
					class="btn h-11 flex-1 motion-tap gap-2 btn-primary font-bold sm:flex-none"
				>
					{#if salvandoTitulo}
						<Loading variant="fila" size={11} tone="current" label="Salvando o título" />
					{/if}
					Salvar
				</button>
				<button
					type="button"
					onclick={cancelarRenomear}
					disabled={salvandoTitulo}
					class="btn h-11 flex-1 motion-tap btn-plain font-semibold sm:flex-none"
				>
					Cancelar
				</button>
				{#if erroDoTitulo}
					<p
						class="flex w-full items-center gap-2 text-[12.5px] font-semibold text-error"
						role="alert"
					>
						{@render icone('M12 8v4.5M12 16h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z', 'size-[15px]')}
						{erroDoTitulo}
					</p>
				{/if}
			</form>
		{:else}
			<div class="mb-2 flex items-start gap-1.5">
				<h1
					class="min-w-0 font-display text-[22px] leading-[1.16] font-semibold tracking-[-0.024em] text-pretty lg:text-[28px]"
				>
					{data.activity.title}
				</h1>
				<button
					type="button"
					onclick={abrirRenomear}
					aria-label="Renomear a atividade"
					title="Renomear"
					class="btn btn-circle size-9 min-h-9 shrink-0 motion-tap btn-ghost lg:mt-0.5"
				>
					{@render icone('M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4', 'size-4')}
				</button>
			</div>
		{/if}
		<p class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] leading-snug">
			<span
				class="inline-flex shrink-0 items-center gap-[7px] rounded-full px-[11px] py-[5px] text-xs font-bold {estado.pill}"
			>
				{@render icone(estado.icon, 'size-3.5')}
				{estado.label}
			</span>
			<span class="min-w-[200px] flex-1 text-pretty text-base-content/65">{estado.nota}</span>
		</p>

		{#snippet detalhes()}
			<!-- Os dados da atividade, cada um com o seu rótulo, numa linha: idioma,
		     nível (troca aqui, na hora — é rótulo, adr-004), quando nasceu e os
		     módulos em que está. Antes eram uma frase, um select solto e chips
		     empilhados. -->
			<dl class="grid grid-cols-2 gap-x-6 gap-y-4 sm:flex sm:flex-wrap sm:gap-x-10">
				<div class="min-w-0">
					<dt class={ROTULO}>Idioma</dt>
					<dd class="mt-1.5"><IdiomaTag tag={data.activity.idioma} /></dd>
				</div>
				<div class="min-w-0">
					<dt class={ROTULO}><label for="nivel-da-atividade">Nível</label></dt>
					<dd class="mt-1.5 flex min-w-0 items-center gap-2">
						<!-- `max-w-full`: a largura natural de um select é a da opção mais
					     longa ("B2 · Intermediário superior"), e no celular ela passava
					     da coluna e da borda do cartão. -->
						<select
							id="nivel-da-atividade"
							class="select h-8 min-h-8 w-auto max-w-full min-w-0 py-0 text-[12.5px]"
							value={data.activity.level ?? ''}
							disabled={salvandoNivel}
							onchange={(e) => trocarNivel(e.currentTarget.value)}
						>
							<option value="">Sem nível</option>
							{#each NIVEIS as n (n.id)}
								<option value={n.id}>{rotuloDoNivel(n.id)}</option>
							{/each}
						</select>
						{#if salvandoNivel}<Loading variant="fila" size={8} label="Salvando o nível" />{/if}
					</dd>
				</div>
				<div class="min-w-0">
					<dt class={ROTULO}>Criada em</dt>
					<dd class="mt-1.5 text-[13.5px] leading-tight font-semibold">
						{data.activity.createdAt}
						<span class="mt-0.5 block text-[12px] font-normal text-base-content/65"
							>editada {data.activity.updatedAt}</span
						>
					</dd>
				</div>
				<div class="col-span-2 min-w-0 sm:col-span-1">
					<dt class={ROTULO}>Módulos</dt>
					<dd class="mt-1.5 flex flex-wrap items-center gap-1.5">
						{#each data.modulos.dela as m (m.id)}
							<a
								href={resolve('/(studio)/modulos/[id]', { id: m.id })}
								class="rounded-full px-2.5 py-1 text-[12px] font-bold no-underline {CLASSE_DA_ETIQUETA[
									m.color
								]}">{m.name}</a
							>
						{/each}
						{#if data.modulos.outros.length > 0}
							<label class="sr-only" for="acrescentar-modulo">Acrescentar a um módulo</label>
							<select
								id="acrescentar-modulo"
								bind:value={moduloEscolhido}
								onchange={acrescentarAoModulo}
								disabled={acrescentandoAoModulo}
								class="select h-8 min-h-8 w-auto max-w-full min-w-0 py-0 text-[12px]"
							>
								<option value="">+ Acrescentar</option>
								{#each data.modulos.outros as m (m.id)}
									<option value={m.id}>{m.name}</option>
								{/each}
							</select>
						{:else if data.modulos.dela.length === 0}
							<span class="text-[13px] text-base-content/65">nenhum</span>
						{/if}
					</dd>
				</div>
			</dl>

			{#if temAudio && !audioPronto}
				<!-- Só quando FALTA: numa atividade saudável a linha era ruído, e o botão um
			     convite a refazer trabalho já feito, deixando o link fora do ar à toa. -->
				<div
					class="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-3 rounded-[12px] border border-error/30 bg-error/6 px-3.5 py-3"
				>
					<span
						class="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-error/13 text-error"
					>
						{@render icone('M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4.2 4.2 0 010 6')}
					</span>
					<div class="min-w-[220px] flex-1">
						<p class="mb-0.5 text-[13.5px] font-bold text-error">
							{#if data.audio.done === 0}
								Faltam os {data.audio.total}
								{data.audio.total === 1 ? 'áudio' : 'áudios'}
							{:else}
								Faltam {data.audio.total - data.audio.done} dos {data.audio.total} áudios
							{/if}
						</p>
						<p class="text-[12.5px] leading-relaxed text-pretty text-base-content/65">
							Ainda estão sendo gerados, ou a geração falhou. Gerar de novo tira o link do ar por
							alguns minutos; quem já está respondendo termina normalmente.
						</p>
					</div>
					<button
						type="button"
						class="btn h-10 w-full motion-tap gap-2 rounded-[9px] btn-error text-[13px] font-bold sm:w-auto"
						onclick={regerar}
						disabled={regerando}
					>
						{#if regerando}
							<Loading variant="fila" size={12} tone="current" label="Gerando áudio" />
							Gerando…
						{:else}
							Gerar áudio de novo
						{/if}
					</button>
				</div>
			{/if}

			{#if erroDoTopo}
				<p class="mt-3 text-[13px] font-semibold text-error" role="alert">
					{erroDoTopo}
					{#if motivo}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
						<a href={resolve('/(site)/planos') + '?motivo=' + motivo} class="font-bold"
							>Ver os planos</a
						>
					{/if}
				</p>
			{/if}
		{/snippet}

		{#snippet actions()}
			<a
				href={resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id })}
				class="btn h-[42px] motion-tap gap-2 btn-plain text-[13.5px] no-underline"
			>
				{@render icone('M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16z')}
				Editar no wizard
			</a>
			{#if estadoVisto === 'arquivada'}
				<button
					type="button"
					onclick={desarquivar}
					disabled={acaoDoFim !== null}
					class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold"
				>
					{#if acaoDoFim === 'desarquivar'}
						<Loading variant="fila" size={10} tone="current" label="Desarquivando" />
					{/if}
					Desarquivar
				</button>
			{:else if estadoVisto === 'no-ar'}
				<a
					href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
					class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold no-underline"
				>
					{@render icone('M3.5 12l17-7.5-3 17-6-5zM11.5 16.5l3-3')}
					Enviar para turma
				</a>
			{:else}
				<a
					href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
					class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold no-underline"
				>
					{@render icone('M12 19V5M5.5 11.5L12 5l6.5 6.5')}
					{estadoVisto === 'rascunho' ? 'Publicar' : 'Publicar as mudanças'}
				</a>
			{/if}
		{/snippet}
	</HeaderCard>

	<!-- ═══ 2. como a turma entra ═══ Só no ar: antes de publicar não há link, e
	     o lugar dele era uma caixa repetindo "publique". -->
	{#if data.link}
		<section class="mb-[30px]">
			<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
				<h2 class="font-display text-lg font-semibold lg:text-xl">Como a turma entra</h2>
				<span class="text-[13px] text-base-content/65"
					>sem conta e sem cadastro: dá para projetar o QR na sala</span
				>
			</div>
			<div
				class="overflow-hidden rounded-[14px] border border-line lg:grid lg:grid-cols-[300px_minmax(0,1fr)]"
			>
				<!-- O QR em tamanho de projeção. Só existe publicado. -->
				<div
					class="flex items-center justify-center border-b border-line bg-base-200 p-[18px] lg:border-e lg:border-b-0 lg:p-[22px]"
				>
					<div
						class="aspect-square w-full max-w-[240px] rounded-[13px] border border-line bg-white p-3.5"
					>
						{#if data.qr}
							<img
								src={data.qr}
								alt="QR code do link da atividade"
								width="212"
								height="212"
								class="block size-full"
							/>
						{:else}
							<div class="size-full rounded-[6px] bg-base-300"></div>
						{/if}
					</div>
				</div>
				<div class="grid min-w-0 content-center gap-3.5 p-4 lg:px-6 lg:py-[22px]">
					<div class="min-w-0">
						<p class="mb-2 {ROTULO}">Link</p>
						<div
							class="flex items-center gap-2.5 rounded-[11px] border border-line bg-base-200 px-3 py-2.5"
						>
							<span class="min-w-0 flex-1 truncate font-mono text-[13px]">{linkVisivel}</span>
							<button
								type="button"
								onclick={copiarLink}
								class="btn h-[38px] shrink-0 motion-tap gap-[7px] rounded-[8px] btn-plain px-3 text-[12.5px] font-bold text-primary"
							>
								<svg class="size-[15px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<rect
										x="8"
										y="8"
										width="12"
										height="12"
										rx="2"
										stroke="currentColor"
										stroke-width="2"
									/>
									<path
										d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
									/>
								</svg>
								{copiado ? 'Copiado' : 'Copiar'}
							</button>
						</div>
					</div>
					{#if data.access.requireCode}
						<div class="min-w-0">
							<p class="mb-2 {ROTULO}">Código para digitar</p>
							<div
								class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[11px] border border-dashed border-line bg-base-200 px-3.5 py-[11px]"
							>
								<span class="font-mono text-[21px] font-medium tracking-[0.2em]"
									>{data.access.code}</span
								>
								<span class="text-[12.5px] leading-normal text-base-content/65"
									>quem não conseguir ler o QR entra por aqui</span
								>
							</div>
						</div>
					{/if}
					<p class="text-[12.5px] leading-relaxed text-pretty text-base-content/65">
						Ninguém precisa de conta para responder. O convite por e-mail leva ao mesmo lugar e só
						identifica quem respondeu.
						{#if data.access.showResult}
							O aluno vê o resultado ao terminar.
						{:else}
							O aluno não vê o resultado ao terminar.
						{/if}
						{#if data.access.allowRetake}
							Ele pode responder de novo quantas vezes quiser, e fica a última entrega.
						{/if}
					</p>
				</div>
			</div>
		</section>
	{/if}

	<!-- ═══ 3. as questões ═══ O desenho da revisão (o celular e o roteiro), mas
	     só para VER: nada se arrasta, nada se edita. Editar é no wizard. -->
	<section class="mb-[30px]">
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">As questões</h2>
			<span class="text-[13px] text-base-content/65">
				{data.questoes.length}
				{data.questoes.length === 1 ? 'questão' : 'questões'}{data.skills.length > 0
					? ` · ${data.skills.map((sk) => `${sk.name} ${sk.count}`).join(', ')}`
					: ''}
			</span>
			<div class="min-w-1 flex-1"></div>
			{#if data.questoes.length > 0}
				<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- `previa` sai de resolve() acima, mais a query. -->
				<a href={previa} class="text-[13px] font-bold text-primary no-underline"
					>Pré-visualizar como aluno</a
				>
			{/if}
		</div>

		{#if data.questoes.length === 0}
			<p
				class="rounded-[14px] border border-dashed border-line px-5 py-6 text-center text-[13.5px] text-base-content/65"
			>
				Nenhuma questão ainda. Gere a partir dos materiais, no wizard.
			</p>
		{:else}
			<div
				class="grid gap-5 rounded-[14px] border border-line bg-base-200 p-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-8 lg:p-6"
			>
				<!-- O PALCO: a questão escolhida no celular, como o aluno a vê. No celular
				     as setas não cabem dos lados do aparelho e descem para baixo dele. -->
				<div
					bind:this={palco}
					class="flex scroll-mt-4 flex-col items-center gap-3 lg:sticky lg:top-6 lg:flex-row lg:justify-center lg:gap-2.5 lg:self-start"
				>
					<button
						type="button"
						onclick={() => andar(-1)}
						aria-label="Questão anterior"
						class="hidden size-[38px] shrink-0 place-items-center rounded-full border border-line bg-base-100 transition-[translate,border-color] duration-200 hover:-translate-x-0.5 hover:border-primary active:scale-95 lg:grid"
					>
						{@render icone('M15 5l-7 7 7 7', 'size-[15px]')}
					</button>
					{#if escolhida}
						<CelularDoAluno
							rotulo="Prévia da questão {escolhida.posicao}: {escolhida.titulo}"
							posicao={escolhida.posicao}
							total={data.questoes.length}
						>
							{#if escolhida.runtime}
								<p class="mb-2.5 text-[11px] font-bold text-primary">
									{escolhida.runtime.skillLabel}
								</p>
								{#key escolhida.id}
									<PreviaDaQuestao runtime={escolhida.runtime} chave={escolhida.id} compacta />
								{/key}
								<!-- O diálogo avisa do áudio dele no próprio diálogo. -->
								{#if escolhida.audioPendente && escolhida.runtime.contexto?.tipo !== 'dialogo'}
									<p class="mt-3 text-[12px] leading-snug text-base-content/65">
										O áudio desta questão ainda está sendo gerado.
									</p>
								{/if}
							{:else}
								<p
									class="m-auto max-w-[24ch] text-center text-[13px] leading-snug text-base-content/65"
								>
									Os campos desta questão não formam um exercício ainda. Corrija no wizard.
								</p>
							{/if}
							{#snippet rodape()}
								<!-- Responder é na prévia do aluno, que corrige de verdade. -->
								<!-- eslint-disable svelte/no-navigation-without-resolve -- `previa` sai de resolve() acima, mais a query. -->
								<a
									href={previa}
									class="btn h-12 w-full motion-tap btn-primary text-base font-bold no-underline"
									>Responder na prévia</a
								>
								<!-- eslint-enable svelte/no-navigation-without-resolve -->
							{/snippet}
						</CelularDoAluno>
					{/if}
					<button
						type="button"
						onclick={() => andar(1)}
						aria-label="Próxima questão"
						class="hidden size-[38px] shrink-0 place-items-center rounded-full border border-line bg-base-100 transition-[translate,border-color] duration-200 hover:translate-x-0.5 hover:border-primary active:scale-95 lg:grid"
					>
						{@render icone('M9 5l7 7-7 7', 'size-[15px]')}
					</button>
					{#if escolhida && data.questoes.length > 1}
						<div class="flex gap-2.5 lg:hidden">
							<button
								type="button"
								onclick={() => andar(-1)}
								disabled={escolhida.posicao === 1}
								class={SETA_SOB_O_CELULAR}
							>
								{@render icone('M15 5l-7 7 7 7', 'size-[15px]')}
								Anterior
							</button>
							<button
								type="button"
								onclick={() => andar(1)}
								disabled={escolhida.posicao === data.questoes.length}
								class={SETA_SOB_O_CELULAR}
							>
								Próxima
								{@render icone('M9 5l7 7-7 7', 'size-[15px]')}
							</button>
						</div>
					{/if}
				</div>

				<!-- O ROTEIRO, na ordem em que o aluno responde, ligado pelo fio. A linha
				     escolhida mostra a resposta (só o professor vê: é a tela dele). -->
				<div class="relative min-w-0 self-start">
					<span aria-hidden="true" class="absolute inset-y-7 start-[20px] w-0.5 bg-line"></span>
					<ol class="relative grid list-none gap-0.5 p-0" aria-label="O roteiro do aluno">
						{#each data.questoes as q (q.id)}
							{@const ativa = escolhida?.id === q.id}
							<li
								class="overflow-hidden rounded-xl transition-colors duration-200
								       {ativa ? 'bg-primary/10 ring-[1.5px] ring-primary ring-inset' : ''}"
							>
								<button
									type="button"
									onclick={() => (escolhidaId = q.id)}
									aria-pressed={ativa}
									class="flex min-h-[54px] w-full min-w-0 items-center gap-[11px] rounded-xl py-1.5 ps-1 pe-3 text-start transition-colors duration-200 hover:bg-primary/8"
								>
									<span
										class="grid size-[34px] shrink-0 place-items-center rounded-full
										       {ativa
											? 'bg-primary text-primary-content'
											: 'bg-base-300 text-primary ring-[3px] ring-base-200'}"
									>
										{@render icone(ICONE_DA_HABILIDADE[q.habilidade])}
									</span>
									<span class="min-w-5 shrink-0 font-mono text-[12px] text-base-content/65"
										>{q.posicao}</span
									>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-[14px] font-semibold">{q.titulo}</span>
										<span class="mt-[3px] flex min-w-0 items-center gap-[7px]">
											<span
												class="shrink-0 rounded-full px-[7px] py-0.5 text-[10px] font-bold tracking-[0.05em] whitespace-nowrap uppercase {q
													.material?.kind
													? PILL_TONE[tipoDe(KERNEL_TO_KIND[q.material.kind]).tone]
													: 'bg-base-300 text-base-content/65'}"
												>{q.material?.tipo ?? 'criada por você'}</span
											>
											{#if q.material?.trecho}
												<span
													class="min-w-0 truncate font-content text-[12px] text-base-content/65"
													dir={data.activity.dir}>{q.material.trecho}</span
												>
											{/if}
										</span>
									</span>
									<span
										class="hidden shrink-0 text-[12px] font-semibold whitespace-nowrap text-base-content/65 sm:inline"
										>{ROTULO_DA_HABILIDADE[q.habilidade]}</span
									>
								</button>
								{#if ativa}
									<!-- No celular o painel começa depois da bolha (44px): a 10px da
									     borda, o fio do roteiro, que passa por trás da linha escolhida,
									     cortava o cadeado. -->
									<div
										class="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 ps-11 pt-0.5 pb-2.5 text-[12.5px] lg:ps-[80px]"
									>
										<p class="flex min-w-0 flex-[1_1_200px] items-center gap-[7px]">
											<svg
												class="size-3.5 shrink-0 text-warning"
												viewBox="0 0 24 24"
												fill="none"
												aria-hidden="true"
											>
												<rect
													x="4"
													y="10.5"
													width="16"
													height="10"
													rx="2.5"
													stroke="currentColor"
													stroke-width="2"
												/>
												<path
													d="M8 10.5V7.5a4 4 0 118 0v3"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
												/>
											</svg>
											<span class="shrink-0">Resposta</span>
											<span class="min-w-0 truncate font-content font-semibold" dir="auto"
												>{q.resposta}</span
											>
										</p>
										<!-- No celular o aparelho fica acima da lista, e escolher uma
									     linha o troca longe da vista: isto leva até ele. -->
										<button type="button" onclick={verNoCelular} class={VER_NO_CELULAR}>
											{@render icone(ICONE_DO_CELULAR, 'size-[15px]')}
											Ver no celular
										</button>
									</div>
								{/if}
							</li>
						{/each}
					</ol>
				</div>
			</div>
		{/if}
	</section>

	<!-- ═══ 4. quem recebeu e quem respondeu ═══ Só no ar e com alguém tendo
	     respondido: antes disso a seção era só uma caixa vazia. -->
	{#if noAr && totalRespostas > 0}
		<section>
			<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
				<h2 class="font-display text-lg font-semibold lg:text-xl">Quem recebeu e quem respondeu</h2>
				<div class="min-w-1 flex-1"></div>
				<a
					href={resolve('/(studio)/resultados/[activityId]', { activityId: data.activity.id })}
					class="btn h-10 motion-tap gap-2 btn-outline text-[13px] font-bold no-underline"
				>
					{@render icone('M4 18V9M10 18V4M16 18v-6M22 18v-9')}
					Ver o relatório completo
				</a>
			</div>

			<div
				class="mb-3 rounded-[14px] border border-line px-5 py-[18px] lg:flex lg:items-center lg:gap-[26px]"
			>
				<div class="min-w-[220px] flex-1">
					<p class="mb-1 text-[13.5px] font-bold">Como as respostas saíram</p>
					<p class="text-[12.5px] leading-relaxed text-base-content/65">
						sobre as {data.attempts.finished}
						{data.attempts.finished === 1 ? 'tentativa terminada' : 'tentativas terminadas'}
						{#if data.attempts.guests > 0}
							· {data.attempts.guests} pelo link aberto
						{/if}
					</p>
				</div>
				<div class="mt-3 lg:mt-0 lg:w-[320px]">
					<!-- Parcial tem faixa própria: somar ao erro esconde exatamente o
					     que o professor precisa ver. -->
					<div class="mb-2.5 flex h-3 overflow-hidden rounded-full bg-base-300">
						<span class="bg-success" style="width: {pct(data.score.correct)}%"></span>
						<span class="bg-warning" style="width: {pct(data.score.partial)}%"></span>
						<span class="bg-error" style="width: {pct(data.score.incorrect)}%"></span>
					</div>
					<div class="flex flex-wrap gap-x-[18px] gap-y-2 text-[12.5px] text-base-content/65">
						<span class="inline-flex items-center gap-[7px]"
							><span class="size-[9px] shrink-0 rounded-[3px] bg-success"></span>Certo {pct(
								data.score.correct
							)}%</span
						>
						<span class="inline-flex items-center gap-[7px]"
							><span class="size-[9px] shrink-0 rounded-[3px] bg-warning"></span>Parcial {pct(
								data.score.partial
							)}%</span
						>
						<span class="inline-flex items-center gap-[7px]"
							><span class="size-[9px] shrink-0 rounded-[3px] bg-error"></span>Errado {pct(
								data.score.incorrect
							)}%</span
						>
					</div>
				</div>
			</div>

			{#if data.deliveries.length > 0}
				<div class="overflow-hidden rounded-[14px] border border-line">
					{#each data.deliveries as envio (envio.id)}
						<a
							href={resolve('/(studio)/turmas/[id]', { id: envio.classroomId })}
							class="block border-b border-line px-4 py-3.5 text-base-content no-underline transition-colors last:border-0 hover:bg-base-200 lg:flex lg:items-center lg:gap-6 lg:px-5 lg:py-[15px]"
						>
							<span class="flex min-w-0 flex-1 items-center gap-[11px]">
								<span
									class="grid size-8 shrink-0 place-items-center rounded-[10px] text-[11.5px] font-bold {CLASSE_DA_ETIQUETA[
										corOuPadrao(envio.color)
									]}">{envio.badge}</span
								>
								<span class="min-w-0">
									<span class="mb-0.5 block text-sm font-semibold">{envio.classroom}</span>
									<span class="block text-[12.5px] text-base-content/65">
										{envio.when} · {envio.invites}
										{envio.invites === 1 ? 'convite' : 'convites'}
										{#if envio.bounced > 0}
											· <span class="font-semibold text-error"
												>{envio.bounced}
												{envio.bounced === 1 ? 'voltou' : 'voltaram'}</span
											>
										{/if}
									</span>
								</span>
							</span>
							<span
								class="mt-[11px] flex flex-wrap items-center gap-x-[18px] gap-y-2.5 border-t border-line pt-[11px] lg:mt-0 lg:border-0 lg:pt-0"
							>
								<span class="text-[12.5px] text-base-content/65"
									>abriram <b class="font-mono font-medium text-base-content"
										>{envio.opened}/{envio.invites}</b
									></span
								>
								<span class="text-[12.5px] text-base-content/65"
									>terminaram <b class="font-mono font-medium text-base-content"
										>{envio.finished}/{envio.invites}</b
									></span
								>
								<span class="min-w-[90px] flex-1 lg:w-[120px] lg:flex-none">
									<span class="flex h-2 overflow-hidden rounded-full bg-base-300">
										<span
											class="bg-primary"
											style="width: {percentual(envio.finished, envio.invites)}%"
										></span>
									</span>
								</span>
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- ═══ 5. arquivar ou apagar ═══ Lado a lado (o desenho do dono do
	     repositório): arquivar, que libera a vaga sem perder resultado, e apagar,
	     que leva tudo junto e pede o título digitado. Arquivada, desarquivar mora
	     no cartão do topo, e aqui fica só apagar. -->
	<section class="mt-[34px]">
		<h2 class="mb-1 font-display text-section font-semibold">Arquivar ou apagar</h2>
		<p class="mb-3.5 text-[13px] text-base-content/65">para liberar espaço no seu plano</p>
		<div
			class="grid items-start gap-3 {data.activity.arquivada
				? ''
				: 'lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]'}"
		>
			{#if !data.activity.arquivada}
				<div class="rounded-box border border-line bg-card px-4 py-4 lg:px-5">
					<p class="text-[13px] leading-relaxed text-base-content/70">
						<strong class="text-base-content">Arquivar</strong> fecha o link para quem ainda não começou
						e tira a atividade do limite do plano. Quem já está respondendo termina, e os resultados ficam
						aqui. Dá para desarquivar depois, se couber no plano.
					</p>
					<button
						type="button"
						onclick={arquivar}
						disabled={acaoDoFim !== null}
						class="mt-3 btn min-h-11 w-full motion-tap gap-2 btn-plain font-semibold sm:w-auto"
					>
						{#if acaoDoFim === 'arquivar'}
							<Loading variant="fila" size={10} tone="current" label="Arquivando" />
						{/if}
						Arquivar
					</button>
				</div>
			{/if}

			<div class="rounded-box border border-error/35 bg-error/6 px-4 py-4 lg:px-5">
				<p class="text-[13px] leading-relaxed">
					<strong>Apagar de vez</strong> remove a atividade, as questões e
					{#if data.attempts.total > 0}
						<strong
							>as {data.attempts.total}
							{data.attempts.total === 1 ? 'tentativa' : 'tentativas'} dos alunos</strong
						>.
					{:else}
						o link.
					{/if}
					Não tem volta. Os materiais continuam na sua biblioteca.
				</p>
				{#if confirmandoApagar}
					<label class="mt-3 block">
						<span class="mb-1.5 block text-[12.5px] font-semibold">
							Para confirmar, digite o título: <span class="font-mono">{data.activity.title}</span>
						</span>
						<input bind:value={tituloDigitado} class="input w-full" autocomplete="off" />
					</label>
					<div class="mt-3 flex flex-wrap gap-2">
						<button
							type="button"
							onclick={apagarDeVez}
							disabled={acaoDoFim !== null || tituloDigitado.trim() !== data.activity.title.trim()}
							class="btn min-h-11 motion-tap gap-2 btn-error font-bold"
						>
							{#if acaoDoFim === 'apagar'}
								<Loading variant="fila" size={10} tone="current" label="Apagando" />
							{/if}
							Apagar de vez
						</button>
						<button
							type="button"
							onclick={() => {
								confirmandoApagar = false;
								tituloDigitado = '';
							}}
							class="btn min-h-11 motion-tap btn-plain font-semibold">Cancelar</button
						>
					</div>
				{:else}
					<button
						type="button"
						onclick={() => (confirmandoApagar = true)}
						class="mt-3 btn min-h-11 w-full motion-tap btn-outline-error font-bold sm:w-auto"
					>
						Apagar esta atividade
					</button>
				{/if}
			</div>
		</div>
		{#if erroDoFim}
			<p class="mt-3 text-[13px] font-semibold text-error" role="alert">{erroDoFim}</p>
		{/if}
	</section>
</div>
