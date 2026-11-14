<script lang="ts">
	// Etapa 4 — PUBLICAR E ENVIAR, no desenho "Studio Publicar A" do Claude Design:
	// as duas decisões que moravam em telas diferentes ficam juntas. À esquerda, o
	// que a atividade treina, as bandejas de turmas e de módulo (com busca, e nada
	// vem marcado) e as opções; à direita, o QR com o link, o áudio que falta e os
	// convites na fila. `+page@.svelte` reseta para o layout raiz.
	//
	// O que continua valendo, e é regra:
	// - as habilidades são DERIVADAS das questões aceitas, nunca escolhidas;
	// - o link só existe DEPOIS de publicar: antes, o lugar dele diz isso (um
	//   endereço visível que ainda não abre era o que o professor colava no grupo);
	// - o publicado é imutável, e isso é INTERNO: nenhuma tela numera versão;
	// - áudio faltando trava publicar e enviar, e o servidor confere de novo.
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import { casaComBusca } from '$lib/busca';
	import { CLASSE_DA_ETIQUETA, type CorDeEtiqueta } from '$lib/etiquetas';
	import { desdobrar, recolher } from '$lib/client/transicoes';
	import { publicarAtividade } from '../../atividades.remote';
	import { enviarParaTurmas } from '../../../turmas/turmas.remote';
	import { adicionarAoModulo } from '../../../modulos/modulos.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const audioReady = $derived(data.audio.done >= data.audio.total);
	const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
	/** "Inglês (EUA)" no meio da frase: só a primeira letra baixa, a sigla fica. */
	const noMeio = (rotulo: string) => rotulo.charAt(0).toLocaleLowerCase('pt-BR') + rotulo.slice(1);

	// **O progresso do áudio anda sozinho**: quem sintetiza é o worker, noutro
	// processo, e sem esta recarga o contador ficava em "0 de 10" com o botão
	// travado. Só enquanto falta alguma coisa — terminado, o relógio para.
	$effect(() => {
		if (audioReady) return;
		const relogio = setInterval(() => void invalidateAll(), 3000);
		return () => clearInterval(relogio);
	});

	// ── as opções ───────────────────────────────────────────────────────────
	// O código NÃO sai do slug (o slug é público). Vazio manda o servidor
	// sortear; digitado, vale o que o professor escreveu.
	let exigirCodigo = $state(untrack(() => data.access.requireCode));
	let codigo = $state(untrack(() => data.access.code));
	const codigoValido = $derived(codigo === '' || /^[A-HJ-NP-Z]{4}$/.test(codigo));
	function sortearCodigo() {
		const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
		codigo = Array.from(
			crypto.getRandomValues(new Uint8Array(4)),
			(b) => alfabeto[b % alfabeto.length]
		).join('');
	}
	/**
	 * Ligar o código já SORTEIA um (pedido do dono do repositório): o professor vê
	 * as quatro letras que vai ditar antes de publicar. Se já havia um — digitado
	 * ou sorteado antes —, ele fica: desligar e religar não troca o que talvez já
	 * esteja no quadro.
	 */
	function aoMudarCodigo(e: Event & { currentTarget: HTMLInputElement }) {
		if (e.currentTarget.checked && !codigo) sortearCodigo();
	}

	// ── as bandejas ─────────────────────────────────────────────────────────
	// Turmas e módulos em bandejas com busca, e NADA vem marcado: enviar é uma
	// decisão, nunca um padrão. O envio sai depois de publicar, pelas mesmas
	// remote functions da tela da turma e do módulo.
	let abertas = $state({ turmas: false, modulos: false });
	let buscaTurma = $state('');
	let buscaModulo = $state('');
	let turmasEscolhidas = $state<string[]>([]);
	let modulosEscolhidos = $state<string[]>([]);
	const alternar = (lista: string[], id: string) =>
		lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id];

	const turmasVistas = $derived(data.turmas.filter((t) => casaComBusca(t.nome, buscaTurma)));
	const modulosVistos = $derived(data.modulos.filter((m) => casaComBusca(m.nome, buscaModulo)));

	/**
	 * Cada bandeja mostra NO MÁXIMO seis linhas (pedido do dono do repositório):
	 * a que não aparece se acha pela busca. As marcadas entram sempre — achada pela
	 * busca e marcada, a turma continua à vista quando a busca se apaga —, e as
	 * outras completam as vagas na ordem da lista, que a tela não reembaralha.
	 */
	const NA_BANDEJA = 6;
	function janela<T extends { id: string }>(lista: T[], marcada: (x: T) => boolean): T[] {
		const marcadas = lista.filter(marcada);
		const vagas = Math.max(0, NA_BANDEJA - marcadas.length);
		const outras = lista.filter((x) => !marcada(x)).slice(0, vagas);
		return lista.filter((x) => marcadas.includes(x) || outras.includes(x)).slice(0, NA_BANDEJA);
	}
	const turmasNaTela = $derived(janela(turmasVistas, (t) => turmasEscolhidas.includes(t.id)));
	// O módulo em que a atividade JÁ está conta como marcado: ele aparece parado,
	// dizendo onde ela está.
	const modulosNaTela = $derived(
		janela(modulosVistos, (m) => m.posicao !== null || modulosEscolhidos.includes(m.id))
	);
	const escolhidas = $derived(data.turmas.filter((t) => turmasEscolhidas.includes(t.id)));
	const convites = $derived(escolhidas.reduce((n, t) => n + t.comEmail, 0));
	// O módulo em que a atividade JÁ está aparece marcado e parado: não entra de novo.
	const modulosNovos = $derived(
		data.modulos.filter((m) => modulosEscolhidos.includes(m.id) && m.posicao === null)
	);

	const valorDasTurmas = $derived(
		convites > 0
			? plural(convites, 'convite', 'convites')
			: escolhidas.length > 0
				? `${plural(escolhidas.length, 'turma', 'turmas')}, sem e-mail`
				: 'Nenhuma'
	);
	const valorDosModulos = $derived(
		modulosNovos.length === 0
			? 'Nenhum'
			: modulosNovos.length === 1
				? (modulosNovos[0]?.nome ?? '')
				: plural(modulosNovos.length, 'módulo', 'módulos')
	);

	function metaDaTurma(t: (typeof data.turmas)[number]) {
		if (t.alunos === 0) return 'sem alunos ainda';
		return t.comEmail === t.alunos
			? `${t.alunos} com e-mail`
			: `${t.comEmail} de ${t.alunos} com e-mail`;
	}
	function metaDoModulo(m: (typeof data.modulos)[number]) {
		if (m.posicao !== null) return `Já está aqui · é a ${m.posicao}ª`;
		if (modulosEscolhidos.includes(m.id)) return `Entra como a ${m.total + 1}ª`;
		return plural(m.total, 'atividade', 'atividades');
	}

	// ── enviar e acrescentar ────────────────────────────────────────────────
	interface Enviada {
		id: string;
		nome: string;
		cor: CorDeEtiqueta;
		sigla: string;
		n: number;
	}
	let enviados = $state<{ total: number; turmas: Enviada[] } | null>(null);
	/** A recusa do servidor (áudio não pronto, arquivada), dita — nunca um clique que não faz nada. */
	let erroEnvio = $state<string | null>(null);
	let enviando = $state(false);

	async function enviarEscolhas() {
		erroEnvio = null;
		if (turmasEscolhidas.length > 0) {
			const lista = escolhidas.map((t) => ({
				id: t.id,
				nome: t.nome,
				cor: t.cor,
				sigla: t.sigla,
				n: t.comEmail
			}));
			try {
				const r = await enviarParaTurmas({
					activityId: data.activity.id,
					classroomIds: turmasEscolhidas
				});
				if (r.ok) {
					// A confirmação dá o número REAL e diz que a fila anda, nunca que chegou.
					enviados = {
						total: (enviados?.total ?? 0) + (r.enfileirados ?? 0),
						turmas: [...(enviados?.turmas ?? []), ...lista]
					};
					turmasEscolhidas = [];
				} else {
					erroEnvio = r.error ?? 'Não deu para enviar agora.';
				}
			} catch {
				erroEnvio = 'Não deu para enviar agora. Tente de novo em instantes.';
			}
		}
		for (const modulo of modulosNovos) {
			try {
				await adicionarAoModulo({ moduleId: modulo.id, activityIds: [data.activity.id] });
				modulosEscolhidos = modulosEscolhidos.filter((id) => id !== modulo.id);
			} catch {
				erroEnvio ??= `Não deu para pôr a atividade em "${modulo.nome}" agora.`;
			}
		}
		await invalidateAll();
	}

	async function enviarAgora() {
		enviando = true;
		try {
			await enviarEscolhas();
		} finally {
			enviando = false;
		}
	}

	// ── publicar ────────────────────────────────────────────────────────────
	// Leva alguns segundos (valida questão a questão, enfileira o áudio que falta
	// e grava a publicação), e o envio vem logo depois, se houver turma marcada.
	let publicando = $state(false);
	let colunaPrincipal = $state<HTMLDivElement>();
	const publicar = $derived(
		publicarAtividade.enhance(async ({ submit }) => {
			publicando = true;
			try {
				await submit();
				if (publicarAtividade.result?.ok) {
					await enviarEscolhas();
					// O desfecho ("Está no ar") fica no TOPO da coluna, e o botão estava
					// lá embaixo, junto das opções: sem isto o selo nascia fora da vista.
					// No celular quem rola é o invólucro das duas colunas.
					colunaPrincipal?.scrollTo({ top: 0, behavior: 'smooth' });
					colunaPrincipal?.parentElement?.scrollTo({ top: 0, behavior: 'smooth' });
				}
			} finally {
				publicando = false;
			}
		})
	);
	const podePublicar = $derived(audioReady && data.itemCount > 0 && !data.published);

	let copiado = $state(false);
	async function copiarLink() {
		if (!data.link) return;
		try {
			await navigator.clipboard.writeText(data.link);
			copiado = true;
			setTimeout(() => (copiado = false), 2000);
		} catch {
			// Área de transferência bloqueada: o link continua à vista e selecionável.
			copiado = false;
		}
	}
	const linkVisivel = $derived(data.link ? (data.link.split('//')[1] ?? data.link) : null);

	// O código no cartão do link: o que está no ar, ou o que vai ao ar ao publicar.
	const codigoNaTela = $derived(
		data.published
			? data.access.requireCode && data.access.code
				? data.access.code
				: null
			: exigirCodigo
				? codigoValido
					? codigo
					: ''
				: null
	);

	// ── os textos ───────────────────────────────────────────────────────────
	const titulo = $derived(
		data.published
			? 'Está no ar'
			: !audioReady
				? 'Só falta o áudio'
				: data.jaNoAr
					? 'Mudanças prontas para publicar'
					: 'Pronta para publicar'
	);
	const lede = $derived(
		data.published
			? enviados && enviados.total > 0
				? `O link já abre para a turma, e ${plural(enviados.total, 'convite está', 'convites estão')} na fila de envio.`
				: 'O link já abre para a turma.'
			: !audioReady
				? 'A atividade está completa. A publicação espera o áudio terminar de ser gerado.'
				: `${plural(data.itemCount, 'questão', 'questões')} · ${noMeio(data.activity.targetLang)} para falantes de ${noMeio(data.activity.sourceLang)}`
	);
	const rodape = $derived(
		data.published
			? 'Copie o link, projete o QR ou dite o código na sala.'
			: !audioReady
				? 'Publicar fica liberado quando o último áudio ficar pronto.'
				: data.jaNoAr
					? 'O link continua o mesmo. Quem estiver respondendo termina com as perguntas que abriu.'
					: 'Publicar libera o link. Enviar para a turma é o que avisa os alunos.'
	);
	const envioNoRotulo = $derived(
		convites > 0
			? `enviar ${plural(convites, 'convite', 'convites')}`
			: turmasEscolhidas.length > 0
				? `enviar para ${plural(turmasEscolhidas.length, 'turma', 'turmas')}`
				: null
	);
	const rotuloPublicar = $derived(
		(data.jaNoAr ? 'Publicar mudanças' : 'Publicar') + (envioNoRotulo ? ` e ${envioNoRotulo}` : '')
	);
	const rotuloNoAr = $derived(
		envioNoRotulo
			? envioNoRotulo.charAt(0).toLocaleUpperCase('pt-BR') + envioNoRotulo.slice(1)
			: modulosNovos.length === 1
				? 'Pôr no módulo'
				: modulosNovos.length > 1
					? `Pôr em ${plural(modulosNovos.length, 'módulo', 'módulos')}`
					: null
	);
	const skillTone: Record<string, string> = {
		Escuta: 'text-accent bg-accent/12',
		Fala: 'text-accent bg-accent/12'
	};
	// Sair sem publicar pergunta antes (o desenho): o rascunho fica, o link não abre.
	const confirmarSaida = $derived(
		data.published
			? undefined
			: data.jaNoAr
				? {
						titulo: 'Sair sem publicar as mudanças?',
						texto:
							'O que está no ar continua igual. As mudanças ficam salvas para você publicar depois.',
						ficar: 'Continuar publicando',
						sair: 'Sair sem publicar'
					}
				: {
						titulo: 'Sair sem publicar?',
						texto:
							'A atividade fica salva como rascunho, com as questões aceitas. O link só passa a abrir quando ela for publicada.',
						ficar: 'Continuar publicando',
						sair: 'Sair sem publicar'
					}
	);
</script>

<svelte:head><title>Publicar · {data.activity.title} · Spokke</title></svelte:head>

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

<!-- O cabeçalho de uma bandeja: o ícone, o nome, o que está escolhido e a seta. -->
{#snippet cabecalho(
	chave: 'turmas' | 'modulos',
	d: string,
	nome: string,
	valor: string,
	forte: boolean
)}
	<button
		type="button"
		aria-expanded={abertas[chave]}
		aria-controls="bandeja-{chave}"
		onclick={() => (abertas[chave] = !abertas[chave])}
		class="flex min-h-[60px] w-full items-center gap-3 px-4 py-3 text-start"
	>
		<span
			class="grid size-[34px] shrink-0 place-items-center rounded-[10px] border border-line bg-base-200 text-primary"
		>
			{@render icone(d)}
		</span>
		<span class="min-w-0 flex-1 text-[15.5px] font-semibold">{nome}</span>
		<span
			class="shrink-0 text-[13.5px] whitespace-nowrap {forte
				? 'font-bold text-primary'
				: 'font-semibold text-base-content/65'}">{valor}</span
		>
		<svg
			class="size-4 shrink-0 text-base-content/65 transition-transform duration-200 {abertas[chave]
				? 'rotate-180'
				: ''}"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M6 9l6 6 6-6"
				stroke="currentColor"
				stroke-width="2.2"
				stroke-linecap="round"
				stroke-linejoin="round"
			/>
		</svg>
	</button>
{/snippet}

<!-- Uma linha de bandeja: a etiqueta, o nome, a conta e a caixa de marcar. -->
{#snippet linha(
	sigla: string,
	cor: CorDeEtiqueta,
	nome: string,
	meta: string,
	marcada: boolean,
	travada: boolean,
	aoClicar: () => void
)}
	<button
		type="button"
		role="checkbox"
		aria-checked={marcada}
		aria-disabled={travada ? true : undefined}
		onclick={() => {
			if (!travada) aoClicar();
		}}
		class="flex min-h-[60px] w-full items-center gap-3 rounded-[13px] border-[1.5px] px-3 py-2 text-start transition-[border-color,background-color] duration-200
		       {marcada ? 'border-primary bg-primary/8' : 'border-line bg-base-100 hover:border-primary'}
		       {travada ? 'cursor-default' : ''}"
	>
		<span
			class="grid size-8 shrink-0 place-items-center rounded-[9px] font-mono text-[11.5px] font-bold {CLASSE_DA_ETIQUETA[
				cor
			]}">{sigla}</span
		>
		<span class="min-w-0 flex-1">
			<span class="block truncate text-[14px] font-semibold">{nome}</span>
			<span class="mt-px block truncate text-[12.5px] text-base-content/65">{meta}</span>
		</span>
		<span
			class="grid size-[22px] shrink-0 place-items-center rounded-[7px] border-[1.5px] transition-colors duration-200
			       {marcada
				? 'border-primary bg-primary text-primary-content'
				: 'border-base-content/40 bg-base-100 text-transparent'}"
		>
			{@render icone('M4 12.5l5 5L20 6.5', 'size-[13px]')}
		</span>
	</button>
{/snippet}

{#snippet busca(rotulo: string, valor: string, aoDigitar: (v: string) => void)}
	<div class="relative mb-2.5">
		<svg
			class="pointer-events-none absolute start-[13px] top-1/2 size-[15px] -translate-y-1/2 text-base-content/65"
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden="true"
		>
			<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" />
			<path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
		</svg>
		<input
			type="search"
			value={valor}
			oninput={(e) => aoDigitar(e.currentTarget.value)}
			aria-label={rotulo}
			placeholder={rotulo}
			class="input h-[42px] bg-base-200 ps-[37px] text-[13.5px]"
		/>
	</div>
{/snippet}

<WizardShell
	step={4}
	backHref={resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id })}
	backLabel="Revisar"
	status={plural(data.itemCount, 'questão', 'questões')}
	hint={rodape}
	rolagem="colunas"
	{confirmarSaida}
>
	<!-- No desktop, duas colunas que rolam cada uma por dentro (a de contexto com
	     400px, como no desenho); no celular, uma rolagem só, e o contexto desce. -->
	<div class="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
		<div
			bind:this={colunaPrincipal}
			class="flex min-w-0 flex-col lg:min-h-0 lg:flex-1 lg:overflow-y-auto"
		>
			<div class="relative z-1 px-4 pt-6 pb-8 lg:px-[34px] lg:pt-[34px] lg:pb-10">
				{#if data.published}
					<!-- O selo do "no ar" é da marca, nunca verde: verde é a correção. -->
					<span
						class="mb-[18px] grid size-14 feedback-in place-items-center rounded-full bg-primary text-primary-content"
					>
						<svg class="size-[27px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path
								d="M5 12.5l4.5 4.5L19 7"
								stroke="currentColor"
								stroke-width="2.6"
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-dasharray="34"
								class="animate-[en-draw_620ms_var(--ease-out-soft)_240ms_both]"
							/>
						</svg>
					</span>
				{/if}

				<h1
					class="mb-2.5 font-display text-[25px] leading-[1.14] font-semibold tracking-[-0.025em] text-pretty lg:text-[32px] lg:leading-[1.1]"
				>
					{titulo}
				</h1>
				<p
					class="mb-6 max-w-[62ch] text-[14.5px] leading-relaxed text-base-content/65 lg:text-[15.5px]"
				>
					{lede}
				</p>

				<!-- Habilidades DERIVADAS das questões aceitas: ninguém escolheu nenhuma. -->
				{#if data.skills.length > 0}
					<div class="mb-6 flex flex-wrap items-center gap-2">
						<span
							class="me-1 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
							>Habilidades treinadas</span
						>
						{#each data.skills as s (s.name)}
							<span
								class="flex items-center gap-[7px] rounded-full px-[13px] py-[7px] text-[13px] font-bold whitespace-nowrap {skillTone[
									s.name
								] ?? 'bg-base-300 text-primary'}"
							>
								{s.name}<span class="font-mono font-normal opacity-75">{s.count}</span>
							</span>
						{/each}
					</div>
				{/if}

				<!-- As bandejas: para quem enviar e em que módulo pôr. -->
				<div class="mb-6 grid gap-2">
					<div class="overflow-hidden rounded-2xl border-[1.5px] border-line bg-base-100">
						{@render cabecalho(
							'turmas',
							'M3.5 6.5h17v11h-17zM4 7l8 6.5L20 7',
							'Enviar para turmas',
							valorDasTurmas,
							escolhidas.length > 0
						)}
						{#if abertas.turmas}
							<div id="bandeja-turmas" class="px-4 pt-1 pb-4" in:desdobrar out:recolher>
								{#if data.turmas.length === 0}
									<p class="text-[13.5px] leading-snug text-base-content/65">
										Você ainda não tem turma. O link, o QR e o código valem sem isso.
									</p>
								{:else}
									{#if data.turmas.length > NA_BANDEJA}
										{@render busca('Buscar turma', buscaTurma, (v) => (buscaTurma = v))}
									{/if}
									<div class="grid gap-2 lg:grid-cols-2">
										{#each turmasNaTela as t (t.id)}
											{@render linha(
												t.sigla,
												t.cor,
												t.nome,
												metaDaTurma(t),
												turmasEscolhidas.includes(t.id),
												false,
												() => (turmasEscolhidas = alternar(turmasEscolhidas, t.id))
											)}
										{/each}
									</div>
									{#if turmasVistas.length === 0}
										<p class="mt-1 text-[13.5px] text-base-content/65">
											Nenhuma turma com esse nome.
										</p>
									{:else if turmasVistas.length > turmasNaTela.length}
										<p class="mt-2.5 text-[12.5px] leading-snug text-base-content/65">
											Mais {plural(turmasVistas.length - turmasNaTela.length, 'turma', 'turmas')}:
											busque pelo nome.
										</p>
									{:else if escolhidas.some((t) => t.comEmail < t.alunos)}
										<p class="mt-2.5 text-[12.5px] leading-snug text-base-content/65">
											Quem não tem e-mail no cadastro não recebe convite: entra pelo link ou pelo
											código.
										</p>
									{/if}
								{/if}
							</div>
						{/if}
					</div>

					<div class="overflow-hidden rounded-2xl border-[1.5px] border-line bg-base-100">
						{@render cabecalho(
							'modulos',
							'M12 3.5l8.5 4.5-8.5 4.5L3.5 8zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5',
							'Adicionar a módulo',
							valorDosModulos,
							modulosNovos.length > 0
						)}
						{#if abertas.modulos}
							<div id="bandeja-modulos" class="px-4 pt-1 pb-4" in:desdobrar out:recolher>
								{#if data.modulos.length === 0}
									<p class="text-[13.5px] leading-snug text-base-content/65">
										Você ainda não tem módulo. Dá para montar um depois, na tela de módulos.
									</p>
								{:else}
									{#if data.modulos.length > NA_BANDEJA}
										{@render busca('Buscar módulo', buscaModulo, (v) => (buscaModulo = v))}
									{/if}
									<div class="grid gap-2 lg:grid-cols-2">
										{#each modulosNaTela as m (m.id)}
											{@render linha(
												m.sigla,
												m.cor,
												m.nome,
												metaDoModulo(m),
												m.posicao !== null || modulosEscolhidos.includes(m.id),
												m.posicao !== null,
												() => (modulosEscolhidos = alternar(modulosEscolhidos, m.id))
											)}
										{/each}
									</div>
									{#if modulosVistos.length === 0}
										<p class="mt-1 text-[13.5px] text-base-content/65">
											Nenhum módulo com esse nome.
										</p>
									{:else if modulosVistos.length > modulosNaTela.length}
										<p class="mt-2.5 text-[12.5px] leading-snug text-base-content/65">
											Mais {plural(
												modulosVistos.length - modulosNaTela.length,
												'módulo',
												'módulos'
											)}: busque pelo nome.
										</p>
									{/if}
								{/if}
							</div>
						{/if}
					</div>
				</div>

				{#if erroEnvio}
					<p
						class="mb-6 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3 text-[13.5px] leading-snug"
						role="alert"
					>
						{erroEnvio}
					</p>
				{/if}

				{#if !data.published}
					<!-- As opções. O botão do rodapé (fora do form) submete por
					     `form="form-publicar"`. Publicada e sem nada pendente, elas somem:
					     seriam interruptores que não mudam nada. -->
					<form id="form-publicar" {...publicar} class="grid gap-2.5">
						<input type="hidden" name="activityId" value={data.activity.id} />
						<div class="overflow-hidden rounded-[13px] border border-line bg-base-200">
							<label class="flex cursor-pointer items-center justify-between gap-3.5 px-4 py-3.5">
								<span class="min-w-0">
									<span class="mb-[3px] block text-[14px] font-semibold">Código de acesso</span>
									<span class="block text-[12.5px] leading-[1.45] text-base-content/65"
										>Exige um código de 4 letras antes de começar.</span
									>
								</span>
								<input
									type="checkbox"
									name="requireCode"
									bind:checked={exigirCodigo}
									onchange={aoMudarCodigo}
									class="toggle shrink-0 toggle-primary"
								/>
							</label>
							{#if exigirCodigo}
								<div class="border-t border-line px-4 py-3.5" in:desdobrar out:recolher>
									<span class="mb-1.5 block text-[13px] font-semibold"
										>As 4 letras que você dita</span
									>
									<div class="flex flex-wrap items-center gap-2.5">
										<input
											name="accessCode"
											bind:value={codigo}
											oninput={(e) =>
												(codigo = e.currentTarget.value
													.toUpperCase()
													.replace(/[^A-Z]/g, '')
													.slice(0, 4))}
											maxlength="4"
											placeholder="----"
											aria-invalid={!codigoValido}
											aria-label="Código de acesso"
											class="w-[7.5rem] rounded-field border-[1.5px] bg-base-100 px-3 py-2.5 text-center font-mono text-[1.25rem] tracking-[0.35em] uppercase
											       {codigoValido ? 'border-line' : 'border-error'}"
										/>
										<button
											type="button"
											onclick={sortearCodigo}
											class="btn btn-sm motion-tap btn-plain font-semibold">Sortear</button
										>
										<span
											class="min-w-[12rem] flex-1 text-[12.5px] leading-snug text-base-content/65"
										>
											{#if !codigoValido}
												4 letras, sem I nem O.
											{:else if codigo}
												Só quem tem o link e o código entra.
											{:else}
												Em branco, o sistema sorteia um ao publicar.
											{/if}
										</span>
									</div>
								</div>
							{/if}
						</div>
						<label
							class="flex cursor-pointer items-center justify-between gap-3.5 rounded-[13px] border border-line bg-base-200 px-4 py-3.5"
						>
							<span class="min-w-0">
								<span class="mb-[3px] block text-[14px] font-semibold"
									>Mostrar o resultado ao aluno</span
								>
								<span class="block text-[12.5px] leading-[1.45] text-base-content/65"
									>Se desligado, ele vê só "respostas enviadas".</span
								>
							</span>
							<input
								type="checkbox"
								name="showResult"
								checked={data.access.showResult}
								class="toggle shrink-0 toggle-primary"
							/>
						</label>

						{#if publicarAtividade.result && !publicarAtividade.result.ok}
							<div
								class="mt-2 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3 text-[13.5px]"
								role="alert"
							>
								<p>{publicarAtividade.result.error}</p>
								{#if 'motivo' in publicarAtividade.result && publicarAtividade.result.motivo}
									<!-- Erro de cobrança tem saída, e ela não é "tente de novo": é
									     escolher um plano. O rascunho continua salvo. -->
									<p class="mt-2 leading-relaxed text-base-content/65">
										O que você montou continua salvo como rascunho.
										<!-- eslint-disable svelte/no-navigation-without-resolve -- é a própria rota resolvida mais a query do motivo; a regra não enxerga a concatenação. -->
										<a
											href={resolve('/(site)/planos') +
												'?motivo=' +
												publicarAtividade.result.motivo}
											class="font-bold">Ver os planos</a
										>
										<!-- eslint-enable svelte/no-navigation-without-resolve -->
									</p>
								{/if}
							</div>
						{/if}
					</form>
				{/if}
			</div>
			<!-- Só no desktop: no celular a coluna de contexto vem logo abaixo, e a faixa
			     ficaria no meio, entre as bandejas e o QR. -->
			<div class="pointer-events-none relative mt-auto hidden h-[190px] shrink-0 lg:block">
				<AmbientShapes height="100%" edges="bottom" />
			</div>
		</div>

		<!-- A COLUNA DE CONTEXTO: o link (com o QR), o áudio e os convites. -->
		<aside
			class="relative grid min-w-0 content-start gap-3 border-t border-line bg-base-200 px-4 pt-5 pb-8 lg:w-[400px] lg:shrink-0 lg:overflow-y-auto lg:border-s lg:border-t-0 lg:px-[26px] lg:pt-[26px] lg:pb-10"
			aria-label="O link da atividade"
		>
			<div class="overflow-hidden rounded-[14px] border border-line bg-base-100">
				<div class="flex items-center justify-center border-b border-line bg-base-200 p-5">
					{#if data.qr}
						<!-- O QR em tamanho de projeção: o professor projeta e a turma aponta. -->
						<img
							src={data.qr}
							alt="QR code do link {data.link}"
							width="264"
							height="264"
							class="block aspect-square w-full max-w-[210px] rounded-[13px] border border-line bg-white p-2.5"
						/>
					{:else}
						<!-- Antes de publicar não há link, então não há QR: um QR que não
						     abre é um QR que vai para o quadro antes da hora. -->
						<div
							class="grid aspect-square w-full max-w-[210px] place-items-center rounded-[13px] border-[1.5px] border-dashed border-line bg-base-100 p-6 text-center"
						>
							<span class="grid justify-items-center gap-2.5">
								<span class="text-base-content/45">
									{@render icone(
										'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
										'size-8'
									)}
								</span>
								<span class="text-[12.5px] leading-snug text-base-content/65"
									>O QR nasce quando você publicar.</span
								>
							</span>
						</div>
					{/if}
				</div>
				<div class="px-[18px] pt-4 pb-[18px]">
					<p class="mb-[11px] text-[14px] font-bold">Link da atividade</p>
					{#if linkVisivel}
						<div
							class="flex items-center gap-2.5 rounded-[11px] border border-line bg-base-200 py-2 ps-3 pe-2"
						>
							<span class="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={linkVisivel}
								>{linkVisivel}</span
							>
							<button
								type="button"
								onclick={copiarLink}
								class="flex min-h-[38px] shrink-0 items-center gap-[7px] rounded-lg border border-line bg-base-100 px-3 text-[12.5px] font-bold text-primary transition-colors duration-200 hover:bg-base-300"
							>
								{@render icone(
									'M8.5 8.5h12v12h-12zM15.5 5.5a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2',
									'size-3.5'
								)}
								{copiado ? 'Copiado' : 'Copiar'}
							</button>
						</div>
					{:else}
						<p
							class="rounded-[11px] border border-line bg-base-200 px-3 py-2.5 text-[12.5px] leading-snug text-base-content/65"
						>
							O link nasce quando você publicar, e é sempre o mesmo depois.
						</p>
					{/if}
					{#if codigoNaTela !== null}
						<div
							class="mt-2.5 flex items-center justify-center gap-2.5 rounded-[11px] border border-dashed border-line px-3 py-2.5"
						>
							<span class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
								>Código</span
							>
							{#if codigoNaTela}
								<span class="font-mono text-[17px] font-medium tracking-[0.18em]"
									>{codigoNaTela}</span
								>
							{:else}
								<span class="text-[12.5px] text-base-content/65">sorteado ao publicar</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>

			{#if !audioReady}
				<div class="rounded-[14px] border border-line bg-base-100 px-5 py-[18px]">
					<p class="mb-3.5 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
						Gerando áudio · a publicação espera
					</p>
					<div class="mb-3 flex items-center gap-3">
						<Loading variant="fila" size={13} label="Gerando áudio" />
						<span class="flex-1 text-[13.5px] font-semibold"
							>{data.audio.done} de {data.audio.total} áudios prontos</span
						>
					</div>
					<div class="mb-3 h-2 overflow-hidden rounded-full bg-base-300">
						<div
							class="h-full origin-left animate-progresso rounded-full bg-accent"
							style="width: {data.audio.total ? (data.audio.done / data.audio.total) * 100 : 0}%"
						></div>
					</div>
					<p class="text-[12.5px] leading-normal text-base-content/65">
						O link só fica ativo quando todos terminarem. Sem prazo estimado: a geração anda no
						servidor.
					</p>
				</div>
			{/if}

			{#if enviados && enviados.turmas.length > 0}
				<div class="feedback-in rounded-[14px] border border-line bg-base-100 px-5 py-[18px]">
					<p
						class="mb-[13px] text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
					>
						Convites na fila de envio
					</p>
					<ul class="grid list-none gap-[11px] p-0">
						{#each enviados.turmas as t, i (`${t.id}-${i}`)}
							<li class="flex items-center gap-[11px]">
								<span
									class="grid size-7 shrink-0 place-items-center rounded-[9px] font-mono text-[11px] font-bold {CLASSE_DA_ETIQUETA[
										t.cor
									]}">{t.sigla}</span
								>
								<span class="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.nome}</span>
								<span class="shrink-0 font-mono text-[12px] text-base-content/65"
									>{t.n > 0 ? plural(t.n, 'convite', 'convites') : 'sem e-mail'}</span
								>
							</li>
						{/each}
					</ul>
					<p class="mt-[13px] text-[12.5px] leading-normal text-base-content/65">
						Quem não tem e-mail no cadastro não recebe convite: entra pelo link ou pelo código. Quem
						abriu aparece na página da turma.
					</p>
				</div>
			{/if}
		</aside>
	</div>

	{#snippet actions()}
		{#if !data.published}
			<!-- A prévia é uma rota do PROFESSOR, não `/a/[slug]`: antes de publicar
			     aquele link não existe, e depois abri-lo criaria uma tentativa de aluno. -->
			<a
				href={resolve('/(studio)/atividades/[id]/previa', { id: data.activity.id })}
				class="btn h-[46px] flex-1 motion-tap gap-2 btn-plain font-semibold no-underline lg:flex-none"
			>
				{@render icone('M8 5.5l10 6.5-10 6.5z')}
				Pré-visualizar
			</a>
			<button
				type="submit"
				form="form-publicar"
				disabled={!podePublicar || publicando}
				class="btn h-[46px] flex-[1.3] motion-tap gap-2.5 btn-primary font-bold lg:flex-none"
			>
				{#if publicando}
					<Loading variant="fila" size={12} tone="current" label="Publicando" />
					Publicando…
				{:else}
					<span class="lg:hidden">{envioNoRotulo ? 'Publicar e enviar' : 'Publicar'}</span>
					<span class="hidden lg:inline">{rotuloPublicar}</span>
					{@render icone('M5 12h13M13 6l6 6-6 6')}
				{/if}
			</button>
		{:else if rotuloNoAr}
			<!-- No ar e com algo escolhido nas bandejas: a ação é mandar. -->
			<button
				type="button"
				onclick={enviarAgora}
				disabled={enviando}
				class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold lg:flex-none"
			>
				{#if enviando}
					<Loading variant="fila" size={12} tone="current" label="Enviando" />
					Enviando…
				{:else}
					{rotuloNoAr}
				{/if}
			</button>
		{:else}
			<!-- No ar e sem nada pendente: o wizard ACABOU, e o caminho é a
			     atividade, onde estão o link, o QR e quem recebeu. -->
			<a
				href={resolve('/(studio)/atividades/[id]', { id: data.activity.id })}
				class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold no-underline lg:flex-none"
			>
				Ir para a atividade
				{@render icone('M5 12h13M13 6l6 6-6 6')}
			</a>
		{/if}
	{/snippet}
</WizardShell>
