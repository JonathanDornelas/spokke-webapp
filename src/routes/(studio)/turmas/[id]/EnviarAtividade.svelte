<script lang="ts">
	// Escolher a atividade acontece NA TURMA: "Enviar atividade" mandava o
	// professor para a lista de atividades e o deixava sozinho — ele voltava sem
	// ter enviado nada. Só atividade publicada aparece: enviar um rascunho daria
	// ao aluno um link que não existe.
	//
	// **Escolher e enviar são dois gestos.** Cada linha tinha o seu "Enviar para
	// 22" — vinte botões iguais, e um clique distraído mandava trinta e-mails.
	// Agora a lista ESCOLHE (rádio) e o rodapé diz o que vai acontecer antes do
	// botão: qual atividade, para quantos.
	//
	// O filtro de idioma NASCE no idioma da turma, quando há atividade nele;
	// trazer uma de espanhol para uma turma de inglês é quase sempre engano, mas
	// não é proibido.
	import { untrack } from 'svelte';
	import Bandeja from '$lib/components/Bandeja.svelte';
	import FiltroIdioma from '$lib/components/FiltroIdioma.svelte';
	import IdiomaTag from '$lib/components/IdiomaTag.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import { CLASSE_DA_ETIQUETA, corOuPadrao } from '$lib/etiquetas';
	import { casaComFiltro } from '$lib/idiomas';
	import { atividadesPublicadas, enviarParaTurmas } from '../turmas.remote';

	let {
		aberta,
		onfechar,
		turma,
		comEmail,
		onenviado
	}: {
		aberta: boolean;
		onfechar: () => void;
		turma: { id: string; name: string; badge: string; color: string; idioma: string | null };
		/** Quem RECEBE: o aluno sem e-mail fica na turma e entra pelo link aberto. */
		comEmail: number;
		/** Quantos convites foram para a fila — a tela da turma confirma com o número real. */
		onenviado: (enfileirados: number) => void;
	} = $props();

	/** `'auto'` = ainda não mexeu: segue o idioma da turma. */
	let filtro = $state('auto');
	let busca = $state('');
	type Atividade = Awaited<ReturnType<typeof atividadesPublicadas>>[number];
	let escolhida = $state<Atividade | null>(null);
	let enviando = $state(false);
	let erro = $state<string | null>(null);

	$effect(() => {
		if (!aberta) return;
		untrack(() => {
			filtro = 'auto';
			busca = '';
			escolhida = null;
			erro = null;
		});
	});

	function filtroEfetivo(lista: { idioma: string | null }[]): string {
		if (filtro !== 'auto') return filtro;
		return turma.idioma && lista.some((a) => a.idioma === turma.idioma) ? turma.idioma : '';
	}

	/** Busca de TELA: sem caixa e sem acento. */
	const simples = (t: string) =>
		t.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');

	const resumo = $derived(
		comEmail === 0
			? 'Ninguém desta turma tem e-mail — não há para quem enviar.'
			: escolhida
				? `"${escolhida.title}" vai para ${comEmail} ${comEmail === 1 ? 'aluno' : 'alunos'} com e-mail, cada um com o link pessoal dele.`
				: 'Escolha uma atividade da lista.'
	);

	async function enviar() {
		if (!escolhida) return;
		enviando = true;
		erro = null;
		try {
			const r = await enviarParaTurmas({ activityId: escolhida.id, classroomIds: [turma.id] });
			if (r.ok) {
				onenviado(r.enfileirados ?? 0);
				onfechar();
			} else {
				// A recusa (áudio não pronto, atividade arquivada) é ESCRITA — antes o
				// clique parecia não fazer nada.
				erro = r.error ?? 'Não deu para enviar agora.';
			}
		} catch {
			erro = 'Não deu para enviar agora. Tente de novo em instantes.';
		} finally {
			enviando = false;
		}
	}
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Enviar atividade"
	descricao="Para {turma.name}. O link aberto, o QR e o código continuam valendo — enviar não tranca ninguém de fora."
	{resumo}
	{erro}
>
	{#snippet marca()}
		<span
			class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[15px] font-bold {CLASSE_DA_ETIQUETA[
				corOuPadrao(turma.color)
			]}"
			aria-hidden="true">{turma.badge}</span
		>
	{/snippet}

	{#if comEmail === 0}
		<div
			class="mb-5 rounded-box border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-3 text-[13px] leading-relaxed text-base-content/70"
		>
			Nenhum aluno desta turma tem e-mail cadastrado. Cadastre o e-mail deles na chamada, ou passe o
			link aberto da atividade.
		</div>
	{/if}

	{#await atividadesPublicadas()}
		<div class="grid gap-2">
			<div class="h-11 skeleton"></div>
			<div class="h-16 skeleton"></div>
			<div class="h-16 skeleton"></div>
		</div>
	{:then atividades}
		{#if atividades.length === 0}
			<p
				class="rounded-box border border-dashed border-line px-4 py-5 text-[13.5px] leading-relaxed text-base-content/65"
			>
				Nenhuma atividade publicada ainda. Publique uma para poder enviar — rascunho não tem link.
			</p>
		{:else}
			{@const f = filtroEfetivo(atividades)}
			{@const q = simples(busca.trim())}
			{@const lista = atividades.filter(
				(a) => casaComFiltro(a.idioma, f) && (!q || simples(a.title).includes(q))
			)}
			<div class="mb-4 grid gap-3">
				<label
					class="flex min-h-11 items-center gap-2 rounded-field border border-line bg-base-200 px-3"
				>
					<svg
						class="size-4 shrink-0 text-base-content/50"
						viewBox="0 0 24 24"
						fill="none"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" />
						<path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
					</svg>
					<span class="sr-only">Buscar pelo título</span>
					<input
						bind:value={busca}
						type="search"
						placeholder="Buscar pelo título"
						class="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-base-content/50"
					/>
				</label>
				<FiltroIdioma
					tags={atividades.map((a) => a.idioma)}
					valor={f}
					formato="chips"
					onmudou={(v) => (filtro = v)}
				/>
			</div>

			<fieldset class="border-0 p-0">
				<legend class="sr-only">Qual atividade enviar</legend>
				<ul class="grid list-none gap-2 p-0">
					{#each lista as atividade (atividade.id)}
						<li>
							<label
								class="flex min-h-14 cursor-pointer items-center gap-3 rounded-box border-[1.5px] border-line bg-base-100 px-3.5 py-2.5 transition-colors hover:border-primary/60 has-[:checked]:border-primary has-[:checked]:bg-primary/6"
							>
								<input
									type="radio"
									name="atividade"
									value={atividade}
									bind:group={escolhida}
									class="radio"
								/>
								<span class="min-w-0 flex-1">
									<span class="block truncate text-[14px] font-semibold">{atividade.title}</span>
									<span class="block truncate text-[12.5px] text-base-content/65">
										{atividade.level ? `${atividade.level} · ` : ''}{atividade.itemCount}
										{atividade.itemCount === 1 ? 'questão' : 'questões'}
									</span>
								</span>
								<IdiomaTag tag={atividade.idioma} compacta />
							</label>
						</li>
					{:else}
						<li class="px-1 py-3 text-[13px] text-base-content/65">
							Nenhuma atividade publicada com esse filtro.
						</li>
					{/each}
				</ul>
			</fieldset>
		{/if}
	{:catch}
		<p class="text-[13.5px] font-semibold text-error" role="alert">
			Não deu para carregar as atividades. Feche e abra de novo.
		</p>
	{/await}

	{#snippet rodape()}
		<button type="button" onclick={onfechar} class="btn min-h-11 motion-tap btn-plain"
			>Cancelar</button
		>
		<button
			type="button"
			onclick={enviar}
			disabled={!escolhida || enviando || comEmail === 0}
			class="btn min-h-11 motion-tap gap-2 btn-primary font-bold"
		>
			{#if enviando}<Loading variant="fila" size={10} tone="current" label="Enviando" />{/if}
			Enviar para {comEmail}
		</button>
	{/snippet}
</Bandeja>
