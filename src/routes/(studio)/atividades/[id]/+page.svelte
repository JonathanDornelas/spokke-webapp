<script lang="ts">
	// A atividade aberta. Abrir uma da lista caía direto em `resultados`, que
	// responde "como foi" — antes de o professor poder ver "o que é", e numa
	// atividade sem tentativa nenhuma era uma tela vazia. Aqui está o que ele
	// criou: estado, link, QR, código, as questões e para quais turmas foi.
	//
	// **Seis blocos numa rolagem, na ordem em que o professor pergunta:** o que
	// é, se está no ar, como a turma entra, o que tem dentro, o que treina, quem
	// respondeu. É uma tela de LEITURA: toda ação leva para onde ela já existe
	// — o wizard para editar, a publicação para reenviar, os resultados para o
	// relatório. A única escrita é gerar o áudio de novo, quando ele falta.
	import { resolve } from '$app/paths';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import { invalidateAll } from '$app/navigation';
	import Loading from '$lib/components/Loading.svelte';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import { goto } from '$app/navigation';
	import {
		apagarAtividade,
		arquivarAtividade,
		definirNivel,
		desarquivarAtividade,
		regerarAudio
	} from '../atividades.remote';
	import { withMock } from '$lib/dev/with-mock';
	import { NIVEIS, nivelOuNulo, rotuloDoNivel, type NivelId } from '$lib/atividades/nivel';
	import { CLASSE_DA_ETIQUETA, type CorDeEtiqueta } from '$lib/etiquetas';
	import { adicionarAoModulo } from '../../modulos/modulos.remote';

	type Tipo = 'escuta' | 'fala' | 'escrita' | 'escolha' | 'montar';
	type Estado = 'no-ar' | 'mudancas' | 'rascunho';

	interface Item {
		id: string;
		n: number;
		tipo: Tipo;
		summary: string;
		habilidade: string;
	}
	interface Envio {
		id: string;
		classroomId: string;
		classroom: string;
		badge: string;
		color: string;
		when: string;
		invites: number;
		opened: number;
		bounced: number;
		finished: number;
	}
	interface PageData {
		activity: {
			id: string;
			title: string;
			targetLang: string;
			idioma: string | null;
			sourceLang: string;
			createdAt: string;
			updatedAt: string;
			arquivada: boolean;
			level: NivelId | null;
		};
		estado: Estado;
		modulos: {
			dela: { id: string; name: string; color: CorDeEtiqueta }[];
			outros: { id: string; name: string }[];
		};
		/** O link do aluno — só depois da primeira publicação; antes é `null`. */
		link: string | null;
		/** Data URL do QR. Nasce junto com o link, na publicação. */
		qr: string | null;
		access: { requireCode: boolean; code: string; showResult: boolean };
		/**
		 * Quantos áudios da atividade já existem no bucket, de quantos ela
		 * precisa, e em quantos dias o primeiro deles vence (`null` quando não há
		 * nenhum).
		 */
		audio: { done: number; total: number; venceEmDias: number | null };
		items: Item[];
		skills: { name: string; count: number }[];
		deliveries: Envio[];
		attempts: { total: number; finished: number; guests: number };
		score: { correct: number; partial: number; incorrect: number };
	}

	const MOCK: PageData = {
		activity: {
			id: 'atv_01',
			title: 'Present perfect — turma B',
			targetLang: 'Inglês',
			idioma: 'en-US',
			sourceLang: 'Português',
			createdAt: '12 de março',
			updatedAt: 'há 2 dias',
			arquivada: false,
			level: 'B1'
		},
		estado: 'no-ar',
		modulos: { dela: [], outros: [] },
		audio: { done: 6, total: 6, venceEmDias: 8 },
		link: 'https://entendo.app/a/atv_01',
		qr: '',
		access: { requireCode: true, code: 'KQTP', showResult: true },
		items: [
			{
				id: 'itm_01',
				n: 1,
				tipo: 'montar',
				summary: 'Montar a frase a partir da tradução',
				habilidade: 'Leitura'
			},
			{
				id: 'itm_02',
				n: 2,
				tipo: 'escuta',
				summary: 'Digitar a frase ao ouvir o áudio',
				habilidade: 'Escuta + Escrita'
			}
		] as Item[],
		skills: [
			{ name: 'Leitura', count: 14 },
			{ name: 'Escrita', count: 8 }
		],
		deliveries: [
			{
				id: 'env_01',
				classroomId: 'tur_01',
				classroom: '7º B — inglês',
				badge: '7B',
				color: 'violeta',
				when: 'há 2 dias',
				invites: 22,
				opened: 18,
				bounced: 1,
				finished: 14
			}
		] as Envio[],
		attempts: { total: 26, finished: 21, guests: 4 },
		score: { correct: 148, partial: 31, incorrect: 44 }
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	const linkVisivel = $derived(data.link ? (data.link.split('//')[1] ?? data.link) : '');
	const noAr = $derived(data.estado !== 'rascunho');

	// Três estados, e a frase é sobre o ALUNO: o que ele encontra ao abrir o
	// link. Sem número de versão em lugar nenhum (paginas.md).
	const estados: Record<
		Estado,
		{ label: string; pill: string; card: string; nota: string; icon: string }
	> = {
		'no-ar': {
			label: 'No ar',
			pill: 'bg-base-300 text-primary',
			card: 'border-line',
			nota: 'O link responde. Quem abrir agora faz exatamente esta versão da atividade.',
			icon: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM8.5 12.2l2.4 2.4 4.6-4.9'
		},
		mudancas: {
			label: 'Mudanças por publicar',
			pill: 'bg-warning/14 text-warning',
			card: 'border-warning/38 bg-warning/6',
			nota: 'Você editou depois de publicar. O link continua respondendo — com o que já estava no ar, não com estas mudanças.',
			icon: 'M12 4.5l8 14.5H4zM12 10v3.4M12 16.3v.1'
		},
		rascunho: {
			label: 'Rascunho',
			pill: 'bg-base-200 text-base-content/65',
			card: 'border-dashed border-line',
			nota: 'Ainda não existe link: ele é criado quando você publicar, junto com o QR e o código.',
			icon: 'M5 4.5h9l5 5v10H5zM13.5 4.5V10H19'
		}
	};
	const estado = $derived(estados[data.estado]);

	// O áudio é a única parte da atividade que vive fora do banco e tem prazo de
	// validade (10 dias). "Nenhum áudio" não é pendência — é uma atividade só de
	// leitura e escrita, e mostrar "0 de 0" ali seria inventar um problema.
	const temAudio = $derived(data.audio.total > 0);
	const audioPronto = $derived(data.audio.done >= data.audio.total);

	// **Abaixo de 3 dias o aviso muda de tom.** Não é um número inventado: é o
	// tempo em que ainda dá para o professor reenviar o link e a turma
	// responder antes de o arquivo sumir. Acima disso o prazo é informação;
	// abaixo, é uma coisa a fazer.
	const AVISAR_A_PARTIR_DE = 3;
	const venceEm = $derived(data.audio.venceEmDias);
	const audioVencendo = $derived(audioPronto && venceEm !== null && venceEm <= AVISAR_A_PARTIR_DE);
	const prazo = $derived(
		venceEm === null ? '' : venceEm === 0 ? 'hoje' : venceEm === 1 ? 'amanhã' : `em ${venceEm} dias`
	);

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

	const corDaEtiqueta: Record<string, string> = {
		violeta: 'bg-base-300 text-primary',
		teal: 'bg-accent/16 text-accent',
		azul: 'bg-info/15 text-info',
		magenta:
			'bg-[color-mix(in_oklab,var(--color-primary)_12%,var(--color-error)_10%)] text-primary',
		ardosia: 'bg-base-300 text-base-content/70'
	};

	// A pílula de tipo: o que o aluno FAZ, numa palavra. Escuta e fala em teal
	// porque são as de áudio; escrita em violeta; escolher e montar em neutro.
	const tipos: Record<Tipo, { label: string; classe: string; icon: string }> = {
		escuta: {
			label: 'Escuta',
			classe: 'bg-accent/13 text-accent',
			icon: 'M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4.2 4.2 0 010 6'
		},
		fala: {
			label: 'Fala',
			classe: 'bg-accent/13 text-accent',
			icon: 'M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3zM6.5 11.5a5.5 5.5 0 0011 0M12 17v3.5'
		},
		escrita: {
			label: 'Escrita',
			classe: 'bg-base-300 text-primary',
			icon: 'M5 19h3l10-10-3-3L5 16z'
		},
		escolha: {
			label: 'Escolha',
			classe: 'border border-line bg-base-200 text-base-content/65',
			icon: 'M4.5 6.5h15M4.5 12h15M4.5 17.5h15'
		},
		montar: {
			label: 'Montar',
			classe: 'border border-line bg-base-200 text-base-content/65',
			icon: 'M4 5.5h7v6H4zM13 5.5h7v6h-7zM4 13.5h7v6H4zM13 13.5h7v6h-7z'
		}
	};

	// Distribuição das respostas em porcentagem — parcial com faixa própria,
	// nunca somada ao erro (design-system.md "Estado de correção").
	const totalRespostas = $derived(data.score.correct + data.score.partial + data.score.incorrect);
	function pct(parte: number): number {
		return totalRespostas > 0 ? Math.round((parte / totalRespostas) * 100) : 0;
	}
	const temRespostas = $derived(data.attempts.total > 0);

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

	// ── arquivar e apagar ── Os limites do plano são de ESTOQUE
	// (docs/adr-002-billing.md): arquivar é o jeito de liberar a vaga sem perder
	// o que a turma fez; apagar é para quando nem os resultados importam mais.
	let acaoDoFim = $state<'arquivar' | 'desarquivar' | 'apagar' | null>(null);
	let erroDoFim = $state<string | null>(null);
	let motivoDoFim = $state<string | null>(null);
	let confirmandoApagar = $state(false);
	let tituloDigitado = $state('');

	async function arquivarOuVoltar() {
		const qual = data.activity.arquivada ? 'desarquivar' : 'arquivar';
		acaoDoFim = qual;
		erroDoFim = null;
		motivoDoFim = null;
		try {
			const r =
				qual === 'arquivar'
					? await arquivarAtividade({ activityId: data.activity.id })
					: await desarquivarAtividade({ activityId: data.activity.id });
			if (!r.ok) {
				erroDoFim =
					'error' in r && typeof r.error === 'string' ? r.error : 'Não deu para concluir agora.';
				motivoDoFim = 'motivo' in r && typeof r.motivo === 'string' ? r.motivo : null;
			}
			await invalidateAll();
		} catch {
			erroDoFim = 'Não deu para concluir agora. Tente de novo em instantes.';
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

	function percentual(parte: number, total: number): number {
		return total > 0 ? Math.round((parte / total) * 100) : 0;
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
</script>

<svelte:head><title>{data.activity.title} — entendo</title></svelte:head>

<div class="pagina-studio">
	<a
		href={resolve('/(studio)/atividades')}
		class="mb-4 inline-flex items-center gap-2 py-1 text-[0.84rem] font-semibold text-base-content/65 no-underline transition-transform hover:-translate-x-0.5"
	>
		<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M15 5l-7 7 7 7"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
		Atividades
	</a>

	<!-- ═══ 1. o que é ═══ -->
	<HeaderCard
		numbers={[
			{ value: data.items.length, label: 'questões' },
			{
				value: data.attempts.total,
				label: 'tentativas',
				tone: data.attempts.total > 0 ? 'primary' : undefined
			},
			{ value: data.attempts.finished, label: 'terminadas' },
			{ value: data.deliveries.length, label: 'turmas que receberam' }
		]}
	>
		{#snippet badge()}
			<span
				class="grid size-[46px] shrink-0 place-items-center rounded-[13px] bg-base-300 text-primary"
			>
				<svg class="size-[22px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 5.5h16v13H4zM4 10h16M8 14h8"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</span>
		{/snippet}
		<h1
			class="mb-1.5 font-display text-[22px] leading-[1.16] font-semibold tracking-[-0.024em] text-pretty lg:text-[28px]"
		>
			{data.activity.title}
		</h1>
		<p class="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13.5px] text-base-content/65">
			<IdiomaTag tag={data.activity.idioma} />
			<span>criada em {data.activity.createdAt} · editada {data.activity.updatedAt}</span>
		</p>
		<!-- O nível é rótulo (adr-004-modulos-e-nivel.md): troca aqui, na hora, sem
		     passar pelo wizard nem republicar — não mexe em exercício nenhum. -->
		<label class="mt-2 inline-flex items-center gap-2 text-[12.5px] text-base-content/65">
			Nível
			<select
				class="select h-9 min-h-9 w-auto py-0 text-[12.5px]"
				value={data.activity.level ?? ''}
				disabled={salvandoNivel}
				onchange={(e) => trocarNivel(e.currentTarget.value)}
			>
				<option value="">Sem nível</option>
				{#each NIVEIS as n (n.id)}
					<option value={n.id}>{rotuloDoNivel(n.id)}</option>
				{/each}
			</select>
		</label>
		<!-- Os módulos em que ela está — uma atividade pode estar em vários
		     (adr-004-modulos-e-nivel.md). Cada chip leva ao módulo. -->
		<div class="mt-2 flex flex-wrap items-center gap-1.5">
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
					class="select h-8 min-h-8 w-auto py-0 text-[12px]"
				>
					<option value="">+ Acrescentar a um módulo</option>
					{#each data.modulos.outros as m (m.id)}
						<option value={m.id}>{m.name}</option>
					{/each}
				</select>
			{/if}
		</div>
		{#snippet actions()}
			<a
				href={resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id })}
				class="btn h-[42px] motion-tap gap-2 btn-plain text-[13.5px] no-underline"
			>
				<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 20h4L19 9a2.8 2.8 0 10-4-4L4 16z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/>
				</svg>
				Editar no wizard
			</a>
			{#if noAr}
				<a
					href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
					class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold no-underline"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M3.5 12l17-7.5-3 17-6-5zM11.5 16.5l3-3"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Enviar para turma
				</a>
			{/if}
		{/snippet}
	</HeaderCard>

	{#if data.activity.arquivada}
		<!-- Arquivada vem antes de tudo: é o que muda o que o aluno encontra. -->
		<div
			class="mb-[26px] flex flex-wrap items-center gap-3 rounded-[14px] border border-dashed border-line bg-base-200 px-4 py-3.5 lg:px-5"
			role="status"
		>
			<p class="min-w-[240px] flex-1 text-[13.5px] leading-relaxed">
				<strong>Arquivada.</strong> O link está fechado para quem ainda não começou — quem já estava respondendo
				termina, e os resultados continuam aqui. Ela não conta no limite do seu plano.
			</p>
			<button
				type="button"
				onclick={arquivarOuVoltar}
				disabled={acaoDoFim !== null}
				class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold"
			>
				{#if acaoDoFim === 'desarquivar'}
					<Loading variant="fila" size={10} tone="current" label="Desarquivando" />
				{/if}
				Desarquivar
			</button>
		</div>
	{/if}

	<!-- ═══ 2. se está no ar — e se o áudio existe ═══ -->
	<div class="mb-[26px] overflow-hidden rounded-[14px] border {estado.card}">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-[15px] lg:px-5 lg:py-4">
			<span
				class="inline-flex shrink-0 items-center gap-[7px] rounded-full px-[11px] py-[5px] text-xs font-bold {estado.pill}"
			>
				<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d={estado.icon}
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
				{estado.label}
			</span>
			<p class="min-w-[220px] flex-1 text-[13.5px] leading-relaxed text-pretty">{estado.nota}</p>
			{#if !noAr || data.estado === 'mudancas'}
				<a
					href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
					class="btn h-[42px] w-full motion-tap gap-2 btn-primary text-[13.5px] font-bold no-underline lg:w-auto"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M12 19V5M5.5 11.5L12 5l6.5 6.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					{data.estado === 'rascunho' ? 'Publicar' : 'Publicar as mudanças'}
				</a>
			{/if}
		</div>

		{#if temAudio}
			<!-- Ícone e texto, nunca cor sozinha. O número é real: sai da contagem
			     de `MediaAsset` que ainda não expirou. -->
			<div
				class="flex flex-wrap items-center gap-x-3.5 gap-y-3 border-t border-line px-4 py-3.5 lg:px-5 lg:py-[15px]
				       {!audioPronto ? 'bg-error/6' : audioVencendo ? 'bg-warning/6' : ''}"
			>
				<span
					class="grid size-[30px] shrink-0 place-items-center rounded-[9px]
					       {!audioPronto
						? 'bg-error/13 text-error'
						: audioVencendo
							? 'bg-warning/15 text-warning'
							: 'bg-accent/13 text-accent'}"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM16 9a4.2 4.2 0 010 6"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</span>
				<div class="min-w-[240px] flex-1">
					<p
						class="mb-1 text-[13.5px] font-bold {!audioPronto
							? 'text-error'
							: audioVencendo
								? 'text-warning'
								: ''}"
					>
						{#if !audioPronto}
							{#if data.audio.done === 0}
								Faltam os {data.audio.total}
								{data.audio.total === 1 ? 'áudio' : 'áudios'}
							{:else}
								Faltam {data.audio.total - data.audio.done} dos {data.audio.total} áudios
							{/if}
						{:else if audioVencendo}
							Áudio vence {prazo}
						{:else}
							Áudio pronto
						{/if}
					</p>
					<p class="text-[12.5px] leading-relaxed text-pretty text-base-content/65">
						{#if !audioPronto}
							Os arquivos venceram, foram apagados ou ainda estão sendo gerados. Enquanto isso, quem
							abrir não consegue responder as questões de escuta.
						{:else if audioVencendo}
							Quando vencer, as questões de escuta param de abrir e o link fica indisponível para
							quem tentar responder.
						{:else}
							{data.audio.total}
							{data.audio.total === 1 ? 'arquivo' : 'arquivos'} das questões de escuta{venceEm !==
							null
								? `, ${venceEm === 1 ? 'válidos por mais 1 dia' : `válidos por mais ${venceEm} dias`}`
								: ''}.
						{/if}
					</p>
				</div>
				{#if !audioPronto}
					<!-- **Só quando o áudio FALTA.** Numa atividade saudável o botão era
					     ruído — e um convite a refazer trabalho já feito, deixando o
					     link fora do ar à toa. -->
					<button
						type="button"
						class="btn h-10 w-full motion-tap gap-2 rounded-[9px] btn-error text-[13px] font-bold lg:w-auto"
						onclick={regerar}
						disabled={regerando}
					>
						{#if regerando}
							<Loading variant="fila" size={12} tone="current" label="Gerando áudio" />
							Gerando…
						{:else}
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M20 11a8 8 0 00-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0014.5 4.5L20 16M20 20v-4h-4"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Gerar áudio de novo
						{/if}
					</button>
				{/if}
			</div>
			{#if !audioPronto}
				<p
					class="border-t border-line bg-base-200 px-4 py-[11px] text-[12.5px] leading-relaxed text-base-content/65 lg:px-5 lg:py-3"
				>
					Gerar de novo tira o link do ar por alguns minutos. Quem estiver respondendo agora termina
					normalmente; quem abrir nesse intervalo vê a atividade indisponível.
				</p>
			{/if}
		{/if}
	</div>

	<!-- ═══ 3. como a turma entra ═══ -->
	<section class="mb-[30px]">
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">Como a turma entra</h2>
			<span class="text-[13px] text-base-content/65">
				{data.link
					? 'sem conta e sem cadastro: dá para projetar o QR na sala'
					: 'o link, o QR e o código nascem quando você publicar'}
			</span>
		</div>
		{#if !data.link}
			<!-- Sem publicação não há endereço. Mostrar o derivado do id seria
			     mostrar um link que não abre — e é o que o professor copiaria. -->
			<div class="rounded-[14px] border border-dashed border-line px-5 py-[26px] text-center">
				<p class="mb-[7px] text-[15px] font-bold">O link aparece aqui depois de publicar</p>
				<p
					class="mx-auto mb-4 max-w-[60ch] text-[13.5px] leading-relaxed text-pretty text-base-content/65"
				>
					Ao publicar, esta atividade ganha um endereço fixo, um QR para projetar na sala e, se você
					quiser, um código de acesso. Nada disso existe enquanto ela é rascunho.
				</p>
				<a
					href={resolve('/(studio)/atividades/[id]/publicar', { id: data.activity.id })}
					class="btn h-[42px] motion-tap gap-2 btn-primary text-[13.5px] font-bold no-underline"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M12 19V5M5.5 11.5L12 5l6.5 6.5"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
					Publicar
				</a>
			</div>
		{:else}
			<div
				class="overflow-hidden rounded-[14px] border border-line lg:grid lg:grid-cols-[300px_minmax(0,1fr)]"
			>
				<!-- O QR em tamanho de projeção. Só existe publicado, então nunca fica
			     esmaecido: o que está no ar abre. -->
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
						<p class="mb-2 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
							Link
						</p>
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
							<p
								class="mb-2 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
							>
								Código para digitar
							</p>
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
						Ninguém precisa de conta para responder. O convite por e-mail leva ao mesmo lugar — só
						identifica quem respondeu.
						{#if data.access.showResult}
							O aluno vê o resultado ao terminar.
						{:else}
							O aluno não vê o resultado ao terminar.
						{/if}
					</p>
				</div>
			</div>
		{/if}
	</section>

	<!-- ═══ 4. as questões ═══ -->
	<section class="mb-[30px]">
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">As questões</h2>
			<span class="text-[13px] text-base-content/65">
				{data.items.length}
				{data.items.length === 1 ? 'questão' : 'questões'}{data.skills.length > 0
					? ` · ${data.skills.map((sk) => `${sk.name} ${sk.count}`).join(', ')}`
					: ''} · clique numa para editar
			</span>
			<div class="min-w-1 flex-1"></div>
			<!-- `?voltar=detalhe`: a prévia é uma tela fechada, e o X dela precisa
			     trazer de volta para cá. O loader valida o token contra uma lista
			     fechada. -->
			<a
				href="{resolve('/(studio)/atividades/[id]/previa', {
					id: data.activity.id
				})}?voltar=detalhe"
				class="text-[13px] font-bold text-primary no-underline">Pré-visualizar como aluno</a
			>
		</div>
		<div class="overflow-hidden rounded-[14px] border border-line">
			<div
				class="hidden grid-cols-[44px_2.6fr_1.4fr_1.2fr_30px] gap-4 border-b border-line bg-base-200 px-5 py-[11px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase lg:grid"
			>
				<span>Nº</span><span>O que o aluno faz</span><span>Tipo</span><span>Habilidade</span><span
				></span>
			</div>
			{#each data.items as item (item.id)}
				{@const tipo = tipos[item.tipo]}
				<!-- Clicar numa questão abre o editor dela. O editor mexe no
				     RASCUNHO: numa atividade no ar, é ele que abre a cópia editável
				     (regra nº 7). -->
				<a
					href={resolve('/(studio)/atividades/[id]/itens/[itemId]', {
						id: data.activity.id,
						itemId: item.id
					})}
					class="flex flex-wrap items-center gap-x-2.5 gap-y-[7px] border-b border-line px-3.5 py-[13px] text-sm text-base-content no-underline transition-colors last:border-0 hover:bg-base-200 lg:grid lg:grid-cols-[44px_2.6fr_1.4fr_1.2fr_30px] lg:gap-4 lg:px-5"
				>
					<span class="font-mono text-[12.5px] text-base-content/65"
						>{String(item.n).padStart(2, '0')}</span
					>
					<span class="min-w-0 basis-full font-semibold text-pretty lg:basis-auto"
						>{item.summary}</span
					>
					<span
						class="inline-flex items-center gap-[7px] justify-self-start rounded-full px-[11px] py-[5px] text-xs font-bold whitespace-nowrap {tipo.classe}"
					>
						<svg class="size-3.5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d={tipo.icon}
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
								stroke-linejoin="round"
							/>
						</svg>
						{tipo.label}
					</span>
					<span class="text-[12.5px] text-base-content/65">{item.habilidade}</span>
					<svg
						class="hidden size-4 text-base-content/45 lg:block"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<path
							d="M9 5l7 7-7 7"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
					</svg>
				</a>
			{:else}
				<p class="px-5 py-6 text-center text-[13.5px] text-base-content/65">
					Nenhuma questão ainda — gere ou crie itens no wizard.
				</p>
			{/each}
		</div>
	</section>

	<!-- ═══ 6. quem recebeu e quem respondeu ═══ -->
	<section>
		<div class="mb-3.5 flex flex-wrap items-baseline gap-x-3.5 gap-y-2.5">
			<h2 class="font-display text-lg font-semibold lg:text-xl">Quem recebeu e quem respondeu</h2>
			<div class="min-w-1 flex-1"></div>
			{#if temRespostas}
				<a
					href={resolve('/(studio)/resultados/[activityId]', { activityId: data.activity.id })}
					class="btn h-10 motion-tap gap-2 btn-outline text-[13px] font-bold no-underline"
				>
					<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
						<path
							d="M4 18V9M10 18V4M16 18v-6M22 18v-9"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
						/>
					</svg>
					Ver o relatório completo
				</a>
			{/if}
		</div>

		{#if totalRespostas > 0}
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
		{/if}

		{#if data.deliveries.length > 0}
			<div class="overflow-hidden rounded-[14px] border border-line">
				{#each data.deliveries as envio (envio.id)}
					<a
						href={resolve('/(studio)/turmas/[id]', { id: envio.classroomId })}
						class="block border-b border-line px-4 py-3.5 text-base-content no-underline transition-colors last:border-0 hover:bg-base-200 lg:flex lg:items-center lg:gap-6 lg:px-5 lg:py-[15px]"
					>
						<span class="flex min-w-0 flex-1 items-center gap-[11px]">
							<span
								class="grid size-8 shrink-0 place-items-center rounded-[10px] text-[11.5px] font-bold {corDaEtiqueta[
									envio.color
								] ?? corDaEtiqueta.violeta}">{envio.badge}</span
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
		{:else}
			<div class="rounded-[14px] border border-dashed border-line px-5 py-[26px] text-center">
				<p class="mb-1.5 text-[15px] font-bold">
					{noAr ? 'Ainda não foi enviada para nenhuma turma' : 'Publique para poder enviar'}
				</p>
				<p class="mx-auto max-w-[60ch] text-[13.5px] leading-relaxed text-base-content/65">
					{#if noAr}
						O link aberto já vale para quem tiver o endereço. Enviar para uma turma manda um link
						pessoal por e-mail e identifica quem respondeu.
					{:else}
						O envio para turmas fica na etapa de publicar — só uma atividade no ar pode ser enviada.
					{/if}
				</p>
			</div>
		{/if}
	</section>
	<!-- ═══ 7. arquivar ou apagar ═══ Os limites do plano contam o que EXISTE
	     (docs/adr-002-billing.md). Arquivar libera a vaga sem perder resultado;
	     apagar leva tudo junto e pede o título digitado. -->
	<section class="mt-[34px]">
		<h2 class="mb-1 font-display text-section font-semibold">Arquivar ou apagar</h2>
		<p class="mb-3.5 text-[13px] text-base-content/65">para liberar espaço no seu plano</p>
		<div class="grid gap-3">
			{#if !data.activity.arquivada}
				<div
					class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-box border border-line bg-card px-4 py-4 lg:px-5"
				>
					<p class="min-w-[240px] flex-1 text-[13px] leading-relaxed text-base-content/70">
						<strong class="text-base-content">Arquivar</strong> fecha o link para quem ainda não começou
						e tira a atividade do limite do plano. Quem já está respondendo termina, e os resultados ficam
						aqui. Dá para desarquivar depois, se couber no plano.
					</p>
					<button
						type="button"
						onclick={arquivarOuVoltar}
						disabled={acaoDoFim !== null}
						class="btn min-h-11 w-full motion-tap gap-2 btn-plain font-semibold lg:w-auto"
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
						class="mt-3 btn min-h-11 w-full motion-tap btn-outline-error font-bold lg:w-auto"
					>
						Apagar esta atividade
					</button>
				{/if}
			</div>

			{#if erroDoFim}
				<p class="text-[13px] font-semibold text-error" role="alert">
					{erroDoFim}
					{#if motivoDoFim}
						<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
						<a href={resolve('/(site)/planos') + '?motivo=' + motivoDoFim} class="font-bold"
							>Ver os planos</a
						>
					{/if}
				</p>
			{/if}
		</div>
	</section>
</div>
