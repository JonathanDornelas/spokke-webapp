<script lang="ts">
	// A PROGRAMAÇÃO de envio de um módulo para UMA turma
	// (docs/telas-modulos-professor.md 2.4). Abre numa BANDEJA (`Bandeja.svelte`,
	// a mesma de todo formulário do Studio) a partir da linha da turma, para o
	// professor não perder o módulo de vista, e tem três partes: quais, quando e
	// a prévia.
	//
	// **A prévia chama a MESMA `agendar` que o servidor usa ao salvar**, com o
	// `hoje` que o loader mandou (em Brasília): a data que aparece aqui é a data
	// que vai ser gravada. Adiar e pular mexem na programação local e valem ao
	// salvar; "Enviar agora", "Tentar de novo" e pausar são imediatos, porque o
	// rótulo diz "agora".
	import Bandeja from './Bandeja.svelte';
	import Loading from './Loading.svelte';
	import { CLASSE_DA_ETIQUETA, etiquetaDaTurma, type CorDeEtiqueta } from '$lib/etiquetas';
	import {
		agendar,
		programacaoPadrao,
		rotuloDaData,
		somarDias,
		type Programacao,
		type Modo
	} from '$lib/modulos/programacao';
	import {
		estadoDaAlocacao,
		PILULA_DO_ESTADO,
		rotuloDoInstante,
		TEXTO_DO_MOTIVO,
		type EnvioResumido
	} from '$lib/modulos/estado';
	import {
		enviarAgora,
		pausarProgramacao,
		salvarProgramacao,
		tentarDeNovo
	} from '../../routes/(studio)/modulos/modulos.remote';

	type Atividade = { id: string; title: string; estado: 'no-ar' | 'rascunho' | 'arquivada' };
	type Envio = EnvioResumido;

	let {
		aberta,
		alocacao,
		atividades,
		hoje,
		outras,
		onfechar,
		onmudou
	}: {
		aberta: boolean;
		alocacao: {
			id: string;
			programacao: Programacao | null;
			pausedAt: Date | null;
			turma: { name: string; color: CorDeEtiqueta; alunos: number };
			envios: Envio[];
		};
		/** As atividades do módulo, NA ORDEM do módulo. */
		atividades: Atividade[];
		/** Hoje em Brasília — o mesmo do servidor. */
		hoje: string;
		/** As outras turmas do módulo, para "Copiar de". */
		outras: { id: string; nome: string; programacao: Programacao | null }[];
		onfechar: () => void;
		onmudou: () => Promise<void>;
	} = $props();

	// Cópia LOCAL: mexer nos campos não grava nada até "Salvar programação". O
	// painel é remontado a cada abertura (`{#key}` na página), então a cópia
	// inicial é a desta turma, como está gravada agora.
	const copiaInicial = (): Programacao =>
		structuredClone($state.snapshot(alocacao.programacao) ?? programacaoPadrao(hoje));
	let prog = $state<Programacao>(copiaInicial());

	let pendente = $state<string | null>(null);
	let erro = $state<string | null>(null);
	let aviso = $state<string | null>(null);
	/** "Quais atividades" nasce RESUMIDA: os títulos já estão na prévia, uma vez só. */
	let escolhendo = $state(false);

	const turma = $derived(alocacao.turma);
	const pausada = $derived(!!alocacao.pausedAt);
	const salva = $derived(!!alocacao.programacao);
	const estado = $derived(estadoDaAlocacao(alocacao));
	const porId = $derived(new Map(atividades.map((a) => [a.id, a])));
	const envioDe = $derived(new Map(alocacao.envios.map((e) => [e.activityId, e])));
	const consumidas = $derived(
		new Set(
			alocacao.envios
				.filter((e) => e.status === 'enviada' || e.status === 'nao_saiu')
				.map((e) => e.activityId)
		)
	);
	const grupos = $derived(
		agendar(
			prog,
			atividades.map((a) => a.id),
			consumidas,
			hoje
		)
	);
	const enviadas = $derived(
		alocacao.envios
			.filter((e) => e.status === 'enviada')
			.sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0))
	);
	const naoSairam = $derived(alocacao.envios.filter((e) => e.status === 'nao_saiu'));
	const marcadas = $derived(atividades.filter((a) => !prog.fora.includes(a.id)).length);

	const MODOS: { id: Modo; titulo: string; exemplo: string }[] = [
		{ id: 'agora', titulo: 'Tudo agora', exemplo: '“manda tudo”' },
		{ id: 'semana', titulo: 'Por semana', exemplo: '“toda quinta”' },
		{ id: 'intervalo', titulo: 'Por intervalo', exemplo: '“1 por mês”' },
		{ id: 'datas', titulo: 'Datas escolhidas', exemplo: '“a 3 na véspera da prova”' }
	];
	// Segunda primeiro, como o calendário de quem dá aula.
	const DIAS = [
		{ d: 1, curto: 'S', nome: 'segunda' },
		{ d: 2, curto: 'T', nome: 'terça' },
		{ d: 3, curto: 'Q', nome: 'quarta' },
		{ d: 4, curto: 'Q', nome: 'quinta' },
		{ d: 5, curto: 'S', nome: 'sexta' },
		{ d: 6, curto: 'S', nome: 'sábado' },
		{ d: 0, curto: 'D', nome: 'domingo' }
	];

	function alternar<T>(lista: T[], valor: T): T[] {
		return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
	}

	function copiarDe(id: string) {
		const fonte = outras.find((o) => o.id === id)?.programacao;
		if (!fonte) return;
		prog = {
			...prog,
			modo: fonte.modo,
			dias: [...fonte.dias],
			hora: fonte.hora,
			porVez: fonte.porVez,
			intervalo: fonte.intervalo,
			unidade: fonte.unidade
		};
	}

	/** As pendentes, na ordem, para o modo "datas escolhidas". */
	const pendentes = $derived(
		atividades.filter((a) => !prog.fora.includes(a.id) && !consumidas.has(a.id))
	);
	function dataEscolhida(id: string, i: number): string {
		return prog.datas[id] ?? somarDias(prog.inicio < hoje ? hoje : prog.inicio, 7 * i);
	}

	function frase(r: {
		enviadas: number;
		naoSairam: { title: string; motivo: 'rascunho' | 'arquivada' | 'audio' }[];
	}): string | null {
		const partes: string[] = [];
		if (r.enviadas > 0) {
			partes.push(
				`${r.enviadas} ${r.enviadas === 1 ? 'atividade liberada' : 'atividades liberadas'} no mapa dos alunos.`
			);
		}
		if (r.naoSairam.length > 0) {
			partes.push(
				`Não liberadas: ${r.naoSairam.map((n) => `${n.title} (${TEXTO_DO_MOTIVO[n.motivo]})`).join(', ')}.`
			);
		}
		return partes.length > 0 ? partes.join(' ') : null;
	}

	async function rodar(
		qual: string,
		fn: () => Promise<{
			enviadas: number;
			naoSairam: { title: string; motivo: 'rascunho' | 'arquivada' | 'audio' }[];
		}>,
		semNada?: string
	) {
		pendente = qual;
		erro = null;
		aviso = null;
		try {
			const r = await fn();
			aviso = frase(r) ?? semNada ?? null;
			await onmudou();
		} catch {
			erro = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			pendente = null;
		}
	}

	const salvar = () =>
		rodar(
			'salvar',
			() => salvarProgramacao({ allocationId: alocacao.id, programacao: $state.snapshot(prog) }),
			'Programação salva.'
		);
	const pausar = () =>
		rodar('pausar', () => pausarProgramacao({ allocationId: alocacao.id, pausar: !pausada }));
	const mandarAgora = (ids: string[], qual: string) =>
		rodar(qual, () => enviarAgora({ allocationId: alocacao.id, activityIds: ids }));
	const deNovo = (activityId: string) =>
		rodar(`retry:${activityId}`, () => tentarDeNovo({ allocationId: alocacao.id, activityId }));

	/** "Enviar a próxima agora": a primeira data com alguma atividade no ar e não pulada. */
	const proxima = $derived(
		grupos
			.map((g) =>
				g.itens.filter((i) => !i.pulada && porId.get(i.id)?.estado === 'no-ar').map((i) => i.id)
			)
			.find((ids) => ids.length > 0) ?? null
	);
</script>

<Bandeja
	{aberta}
	{onfechar}
	titulo="Programação de {turma.name}"
	descricao="{turma.alunos} {turma.alunos === 1
		? 'aluno'
		: 'alunos'}. Na data, a atividade abre no mapa do módulo, e ninguém recebe e-mail. Datas valem ao salvar; liberar agora e pausar valem na hora."
	{erro}
>
	{#snippet marca()}
		<span
			class="grid size-[46px] flex-none place-items-center rounded-[13px] text-[15px] font-bold {CLASSE_DA_ETIQUETA[
				turma.color
			]}"
			aria-hidden="true">{etiquetaDaTurma(turma.name)}</span
		>
	{/snippet}

	<div class="grid content-start gap-6">
		<div class="flex flex-wrap items-center gap-x-2.5 gap-y-2">
			<span
				class="inline-flex items-center gap-1.5 rounded-full px-2.75 py-1.25 text-[12px] font-bold {PILULA_DO_ESTADO[
					estado
				].classe}"
			>
				<svg class="size-3.25" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><path
						d={PILULA_DO_ESTADO[estado].icone}
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/></svg
				>
				{PILULA_DO_ESTADO[estado].texto}
			</span>
			<span class="text-[12.5px] text-base-content/65"
				>{enviadas.length} de {marcadas} liberadas</span
			>
		</div>

		{#if pausada}
			<div class="flex items-center gap-3 rounded-field border border-line bg-base-200 px-3.5 py-3">
				<svg
					class="size-4.5 flex-none text-base-content/65"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
					><path
						d="M9 6v12M15 6v12"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
					/></svg
				>
				<p class="flex-1 text-[13px] leading-normal">
					Pausada desde {rotuloDoInstante(alocacao.pausedAt as Date)}. Nada sai até você retomar, e
					as datas recomeçam a partir de quando retomar.
				</p>
				<button
					type="button"
					onclick={pausar}
					disabled={pendente !== null}
					class="btn min-h-10 flex-none gap-2 btn-primary text-[13px] font-bold"
				>
					{#if pendente === 'pausar'}<Loading
							variant="fila"
							size={10}
							tone="current"
							label="Retomando"
						/>{/if}
					Retomar
				</button>
			</div>
		{/if}

		<!-- Módulo LIBERA: na data, a atividade abre no mapa de quem tem conta ligada à
		     turma. Não há e-mail (houve uma escolha "por e-mail"; saiu). -->
		<p
			class="rounded-[11px] bg-base-200 px-3.5 py-3 text-[13px] leading-relaxed text-pretty text-base-content/70"
		>
			Na data, a atividade abre no mapa do módulo de quem já tem conta ligada à turma. Ninguém
			recebe e-mail. Para quem ainda não tem conta, mande o convite pela tela da turma.
		</p>

		<!-- quais: resumida — os títulos já estão na prévia, uma vez só -->
		<section>
			<div class="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
				<h3 class="text-[14.5px] font-bold">Quais atividades</h3>
				<span class="text-[12.5px] text-base-content/65"
					>{marcadas} de {atividades.length}, na ordem do módulo</span
				>
				<span class="flex-1"></span>
				<button
					type="button"
					onclick={() => (escolhendo = !escolhendo)}
					aria-expanded={escolhendo}
					class="min-h-8 rounded-[8px] px-2 text-[12.5px] font-bold text-primary hover:bg-base-300"
					>{escolhendo ? 'Pronto' : 'Escolher'}</button
				>
			</div>
			{#if escolhendo}
				<p class="mt-1 mb-2.5 text-[12.5px] text-base-content/65">
					A desmarcada não sai para esta turma nem aparece no mapa destes alunos.
				</p>
				<div class="overflow-hidden rounded-field border border-line">
					{#each atividades as a, i (a.id)}
						{@const envio = envioDe.get(a.id)}
						{@const saiu = envio?.status === 'enviada'}
						{@const falhou = envio?.status === 'nao_saiu'}
						<label
							class="flex min-h-11 items-center gap-2.75 border-b border-line px-3 py-2 last:border-b-0 {saiu
								? 'bg-base-200 text-base-content/65'
								: prog.fora.includes(a.id)
									? 'text-base-content/65'
									: ''}"
						>
							<input
								type="checkbox"
								class="checkbox flex-none checkbox-primary"
								checked={!prog.fora.includes(a.id)}
								disabled={saiu}
								onchange={() => (prog.fora = alternar(prog.fora, a.id))}
							/>
							<span class="w-4.5 flex-none font-mono text-[12px] text-base-content/65">{i + 1}</span
							>
							<span class="min-w-0 flex-1 text-[13.5px] font-semibold">{a.title}</span>
							<span
								class="flex-none rounded-full px-2.25 py-0.75 text-[11.5px] font-bold whitespace-nowrap {saiu
									? 'border border-line bg-base-200 text-base-content/70'
									: falhou
										? 'bg-error text-error-content'
										: a.estado === 'no-ar'
											? 'bg-base-300 text-primary'
											: 'border-[1.5px] border-dashed border-line text-base-content/70'}"
							>
								{saiu
									? 'saiu'
									: falhou
										? 'não liberada'
										: a.estado === 'no-ar'
											? 'no ar'
											: a.estado === 'arquivada'
												? 'arquivada'
												: 'rascunho'}
							</span>
						</label>
					{/each}
				</div>
			{/if}
		</section>

		<!-- quando -->
		<section>
			<div class="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
				<h3 class="text-[14.5px] font-bold">Quando sai</h3>
				<span class="flex-1"></span>
				{#if outras.some((o) => o.programacao)}
					<!-- Copia o RITMO de outra turma do módulo — por isso mora aqui. -->
					<label class="flex items-center gap-1.5 text-[12.5px] text-base-content/65">
						Copiar de
						<select
							class="select min-h-9 w-auto py-1 text-[12.5px]"
							onchange={(e) => {
								copiarDe(e.currentTarget.value);
								e.currentTarget.value = '';
							}}
						>
							<option value="">outra turma…</option>
							{#each outras.filter((o) => o.programacao) as o (o.id)}
								<option value={o.id}>{o.nome}</option>
							{/each}
						</select>
					</label>
				{/if}
			</div>
			<div
				class="mb-3.5 grid grid-cols-2 gap-1.5"
				role="radiogroup"
				aria-label="Ritmo da liberação"
			>
				{#each MODOS as m (m.id)}
					<button
						type="button"
						role="radio"
						aria-checked={prog.modo === m.id}
						onclick={() => (prog.modo = m.id)}
						class="min-h-14 motion-tap rounded-[11px] border-[1.5px] px-3 py-2.5 text-start transition-colors {prog.modo ===
						m.id
							? 'border-primary bg-base-300'
							: 'border-line bg-base-100'}"
					>
						<span class="mb-0.5 block text-[13.5px] font-bold">{m.titulo}</span>
						<span class="block text-[12px] text-base-content/65">{m.exemplo}</span>
					</button>
				{/each}
			</div>

			{#if prog.modo === 'agora'}
				<p
					class="rounded-[11px] bg-base-200 px-3.5 py-3 text-[13px] leading-relaxed text-base-content/70"
				>
					Ao salvar, todas as atividades marcadas que estão no ar abrem no mapa dos alunos, na ordem
					do módulo.
				</p>
			{/if}

			{#if prog.modo === 'semana'}
				<div class="mb-3">
					<span class="mb-1.75 block text-[12.5px] font-bold">Dias da semana</span>
					<div class="grid grid-cols-7 gap-1.25">
						{#each DIAS as dia (dia.d)}
							<button
								type="button"
								aria-pressed={prog.dias.includes(dia.d)}
								aria-label={dia.nome}
								title={dia.nome}
								onclick={() => (prog.dias = alternar(prog.dias, dia.d))}
								class="min-h-11 motion-tap rounded-[9px] border-[1.5px] text-[12.5px] font-bold {prog.dias.includes(
									dia.d
								)
									? 'border-primary bg-primary text-primary-content'
									: 'border-line bg-base-100'}">{dia.curto}</button
							>
						{/each}
					</div>
				</div>
			{/if}

			{#if prog.modo === 'intervalo'}
				<div class="mb-3 flex flex-wrap items-end gap-2">
					<label class="grid gap-1.5">
						<span class="text-[12.5px] font-bold">A cada</span>
						<input
							type="number"
							min="1"
							max="12"
							class="input w-18 font-mono"
							value={prog.intervalo}
							oninput={(e) =>
								(prog.intervalo = Math.max(
									1,
									Math.min(12, Number.parseInt(e.currentTarget.value, 10) || 1)
								))}
						/>
					</label>
					<div class="flex gap-0.75 rounded-field border border-line bg-base-200 p-0.75">
						{#each ['dias', 'semanas', 'meses'] as const as u (u)}
							<button
								type="button"
								aria-pressed={prog.unidade === u}
								onclick={() => (prog.unidade = u)}
								class="min-h-9 rounded-[8px] px-3 text-[13px] font-bold {prog.unidade === u
									? 'bg-primary text-primary-content'
									: 'text-base-content/70'}">{u}</button
							>
						{/each}
					</div>
				</div>
				{#if prog.unidade === 'meses'}
					<p class="-mt-1 mb-3 text-[12.5px] text-base-content/65">
						Começando num dia 31, o envio cai no último dia dos meses mais curtos. A prévia mostra a
						data real.
					</p>
				{/if}
			{/if}

			{#if prog.modo === 'semana' || prog.modo === 'intervalo'}
				<div class="grid grid-cols-3 gap-2">
					<label class="grid min-w-0 gap-1.5">
						<span class="text-[12.5px] font-bold">Começa em</span>
						<input
							type="date"
							min={hoje}
							class="input w-full px-2 text-[13px]"
							value={prog.inicio}
							onchange={(e) => {
								const v = e.currentTarget.value;
								if (v) prog.inicio = v < hoje ? hoje : v;
							}}
						/>
					</label>
					<label class="grid min-w-0 gap-1.5">
						<span class="text-[12.5px] font-bold">Horário</span>
						<input
							type="time"
							class="input w-full px-2 text-[13px]"
							value={prog.hora}
							onchange={(e) => (prog.hora = e.currentTarget.value || '08:00')}
						/>
					</label>
					<div class="grid min-w-0 gap-1.5">
						<span class="text-[12.5px] font-bold">Por vez</span>
						<span
							class="flex min-h-11 items-center overflow-hidden rounded-field border-[1.5px] border-line"
						>
							<button
								type="button"
								class="w-8.5 self-stretch bg-base-200 text-[16px]"
								aria-label="Uma a menos por vez"
								onclick={() => (prog.porVez = Math.max(1, prog.porVez - 1))}>−</button
							>
							<span class="flex-1 text-center font-mono text-[14px]">{prog.porVez}</span>
							<button
								type="button"
								class="w-8.5 self-stretch bg-base-200 text-[16px]"
								aria-label="Uma a mais por vez"
								onclick={() => (prog.porVez = Math.min(8, prog.porVez + 1))}>+</button
							>
						</span>
					</div>
				</div>
			{/if}

			{#if prog.modo === 'datas'}
				<div class="grid gap-1.5">
					{#each pendentes as a, i (a.id)}
						<label class="flex items-center gap-2.5">
							<span class="min-w-0 flex-1 text-[13px] font-semibold">{a.title}</span>
							<input
								type="date"
								min={hoje}
								class="input min-h-10.5 w-auto px-2 text-[13px]"
								value={dataEscolhida(a.id, i)}
								onchange={(e) => {
									const v = e.currentTarget.value;
									if (v) prog.datas = { ...prog.datas, [a.id]: v < hoje ? hoje : v };
								}}
							/>
						</label>
					{:else}
						<p class="text-[13px] text-base-content/65">Nada pendente para escolher data.</p>
					{/each}
				</div>
				<label class="mt-2.5 grid w-32 gap-1.5">
					<span class="text-[12.5px] font-bold">Horário</span>
					<input
						type="time"
						class="input w-full px-2 text-[13px]"
						value={prog.hora}
						onchange={(e) => (prog.hora = e.currentTarget.value || '08:00')}
					/>
				</label>
			{/if}

			<p class="mt-2.5 flex items-center gap-1.75 text-[12px] text-base-content/65">
				<svg class="size-3.25 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="2" /><path
						d="M3.5 12h17M12 3.5c2.5 2.6 2.5 14.4 0 17M12 3.5c-2.5 2.6-2.5 14.4 0 17"
						stroke="currentColor"
						stroke-width="1.6"
					/></svg
				>
				Horário de Brasília (America/Sao_Paulo)
			</p>
		</section>

		<!-- a prévia: a parte mais importante -->
		<section>
			<div class="mb-0.5 flex items-baseline gap-2.5">
				<h3 class="text-[14.5px] font-bold">Prévia</h3>
				<span class="text-[12.5px] text-base-content/65">recalcula enquanto você mexe</span>
			</div>
			<p class="mb-2.5 text-[12.5px] text-base-content/65">
				Em cada data, o que abre no mapa dos alunos.
			</p>
			<div class="overflow-hidden rounded-field border border-line">
				{#each enviadas as e (e.activityId)}
					{@const a = porId.get(e.activityId)}
					<div
						class="grid grid-cols-[94px_minmax(0,1fr)] gap-3 border-b border-line bg-base-200 px-3 py-2.75"
					>
						<span class="font-mono text-[12px] leading-snug text-base-content/65">
							<span class="block">{e.sentAt ? rotuloDoInstante(e.sentAt) : ''}</span>
						</span>
						<span class="grid min-w-0 gap-1.5">
							<span class="text-[13.5px] font-semibold text-base-content/65"
								>{a?.title ?? 'Atividade tirada do módulo'}</span
							>
							<span class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
								<span
									class="inline-flex items-center gap-1.25 rounded-full border border-line bg-base-200 px-2.25 py-0.75 font-bold text-base-content/70"
								>
									<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true"
										><path
											d="M7 11V8a5 5 0 0110 0v3M5.5 11h13v9.5h-13z"
											stroke="currentColor"
											stroke-width="2.4"
											stroke-linejoin="round"
										/></svg
									>
									Liberada
								</span>
								<span class="text-base-content/65">aberta no mapa</span>
							</span>
						</span>
					</div>
				{/each}

				{#each naoSairam as e (e.activityId)}
					{@const a = porId.get(e.activityId)}
					<div
						class="grid grid-cols-[94px_minmax(0,1fr)] gap-3 border-b border-line bg-error/7 px-3 py-2.75"
					>
						<span class="font-mono text-[12px] leading-snug font-medium text-error"
							>{rotuloDoInstante(e.dueAt)}</span
						>
						<span class="grid min-w-0 gap-1.5">
							<span class="text-[13.5px] font-semibold">{a?.title ?? 'Atividade'}</span>
							<span class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
								<span
									class="inline-flex items-center gap-1.25 rounded-full bg-error px-2.25 py-0.75 font-bold text-error-content"
								>
									<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true"
										><path
											d="M12 7.5v6M12 16.5h.01M12 3l9.5 17H2.5z"
											stroke="currentColor"
											stroke-width="2.4"
											stroke-linecap="round"
											stroke-linejoin="round"
										/></svg
									>
									Não liberada
								</span>
								<span class="text-base-content/65"
									>{e.reason ? TEXTO_DO_MOTIVO[e.reason] : 'não liberada'} · a liberação espera</span
								>
								<button
									type="button"
									onclick={() => deNovo(e.activityId)}
									disabled={pendente !== null}
									class="btn min-h-7.5 gap-1.5 btn-error px-2.25 py-1 text-[12px] font-bold"
								>
									{#if pendente === `retry:${e.activityId}`}<Loading
											variant="fila"
											size={8}
											tone="current"
											label="Tentando"
										/>{/if}
									Tentar de novo
								</button>
							</span>
						</span>
					</div>
				{/each}

				{#each grupos as g (g.data ?? 'agora')}
					{@const vivos = g.itens.filter((i) => !i.pulada).length}
					<div
						class="grid grid-cols-[94px_minmax(0,1fr)] gap-3 border-b border-line px-3 py-2.75 last:border-b-0"
					>
						<span class="font-mono text-[12px] leading-snug text-base-content/65">
							<span class="block font-medium text-base-content"
								>{g.data ? rotuloDaData(g.data) : 'ao salvar'}</span
							>
							{#if g.data}<span class="block">{prog.hora}</span>{/if}
						</span>
						<span class="grid min-w-0 gap-1.5">
							{#each g.itens as it (it.id)}
								{@const a = porId.get(it.id)}
								<span class="grid gap-1.25">
									<span class="flex flex-wrap items-center gap-x-2 gap-y-1">
										<span
											class="min-w-30 flex-1 text-[13.5px] font-semibold {it.pulada
												? 'text-base-content/65 line-through'
												: ''}">{a?.title}</span
										>
										{#if it.pulada}
											<button
												type="button"
												onclick={() => (prog.pulei = prog.pulei.filter((x) => x !== it.id))}
												class="min-h-7.5 rounded-[7px] px-1.75 text-[12px] font-bold text-primary hover:bg-base-300"
												>Desfazer</button
											>
										{:else if !pausada && g.data && a?.estado === 'no-ar'}
											<span class="flex gap-0.5">
												<button
													type="button"
													title="Adiar uma semana"
													aria-label="Adiar {a.title} uma semana"
													onclick={() =>
														(prog.adiei = {
															...prog.adiei,
															[it.id]: (prog.adiei[it.id] ?? 0) + 1
														})}
													class="min-h-7.5 rounded-[7px] px-1.75 text-[12px] font-semibold text-base-content/70 hover:bg-base-300"
													>Adiar</button
												>
												<button
													type="button"
													title="Tirar só esta da fila"
													aria-label="Pular {a.title}"
													onclick={() => (prog.pulei = [...prog.pulei, it.id])}
													class="min-h-7.5 rounded-[7px] px-1.75 text-[12px] font-semibold text-base-content/70 hover:bg-base-300"
													>Pular</button
												>
												<button
													type="button"
													title="Liberar agora · as outras datas não mudam"
													aria-label="Liberar {a.title} agora"
													disabled={pendente !== null}
													onclick={() => mandarAgora([it.id], `agora:${it.id}`)}
													class="inline-flex min-h-7.5 items-center gap-1.5 rounded-[7px] px-1.75 text-[12px] font-bold text-primary hover:bg-base-300"
												>
													{#if pendente === `agora:${it.id}`}<Loading
															variant="fila"
															size={8}
															tone="current"
															label="Liberando"
														/>{/if}
													Liberar agora
												</button>
											</span>
										{/if}
									</span>
									{#if !it.pulada && a && a.estado !== 'no-ar'}
										<span class="flex items-start gap-1.75 text-[12px] leading-snug font-semibold">
											<svg
												class="mt-px size-3.5 flex-none"
												viewBox="0 0 24 24"
												fill="none"
												aria-hidden="true"
												><path
													d="M12 8v5M12 16.5h.01M12 3l9.5 17H2.5z"
													stroke="currentColor"
													stroke-width="2"
													stroke-linecap="round"
													stroke-linejoin="round"
												/></svg
											>
											{a.estado === 'arquivada'
												? 'Está arquivada: não sai enquanto não for desarquivada e estiver no ar.'
												: `Ainda é rascunho. Se não for publicada até ${g.data ? rotuloDaData(g.data) : 'agora'}, este envio espera.`}
										</span>
									{/if}
								</span>
							{/each}
							<span class="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px]">
								<span
									class="inline-flex items-center gap-1.25 rounded-full px-2.25 py-0.75 font-bold {pausada ||
									vivos === 0
										? 'border border-line bg-base-200 text-base-content/70'
										: 'bg-base-300 text-primary'}"
								>
									<svg class="size-3" viewBox="0 0 24 24" fill="none" aria-hidden="true"
										><path
											d={pausada
												? 'M9 6v12M15 6v12'
												: vivos === 0
													? 'M5 5l9 7-9 7zM18 5v14'
													: 'M12 7.5V12l3 2M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17z'}
											stroke="currentColor"
											stroke-width="2.4"
											stroke-linecap="round"
											stroke-linejoin="round"
										/></svg
									>
									{pausada ? 'Pausada' : vivos === 0 ? 'Pulada' : 'Programada'}
								</span>
								<span class="text-base-content/65">
									{vivos === 0 ? 'nada abre nesta data' : 'abre no mapa'}
								</span>
							</span>
						</span>
					</div>
				{/each}

				{#if prog.modo === 'semana' && prog.dias.length === 0}
					<p class="p-3.5 text-[13px] text-base-content/65">
						Escolha ao menos um dia da semana para ver as datas.
					</p>
				{:else if grupos.length === 0 && enviadas.length === 0 && naoSairam.length === 0}
					<p class="p-3.5 text-[13px] text-base-content/65">Nenhuma atividade marcada.</p>
				{/if}
			</div>
		</section>

		{#if aviso}
			<p
				class="flex items-start gap-2 rounded-field bg-base-300 px-3.5 py-3 text-[13.5px] font-semibold text-primary"
				role="status"
			>
				<svg class="mt-px size-4 flex-none" viewBox="0 0 24 24" fill="none" aria-hidden="true"
					><path
						d="M3.5 12l17-7.5-3 17-6-5z"
						stroke="currentColor"
						stroke-width="2"
						stroke-linejoin="round"
					/></svg
				>
				{aviso}
			</p>
		{/if}
	</div>

	{#snippet rodape()}
		{#if salva && !pausada && prog.modo !== 'agora' && proxima}
			<button
				type="button"
				title="Libera só a próxima que está no ar. As outras datas não mudam."
				disabled={pendente !== null}
				onclick={() => proxima && mandarAgora(proxima, 'proxima')}
				class="btn min-h-11 motion-tap gap-2 btn-plain text-[13.5px] font-semibold"
			>
				{#if pendente === 'proxima'}<Loading
						variant="fila"
						size={10}
						tone="current"
						label="Liberando"
					/>{/if}
				Liberar a próxima agora
			</button>
		{/if}
		{#if salva}
			<button
				type="button"
				disabled={pendente !== null}
				onclick={pausar}
				class="btn min-h-11 motion-tap gap-2 btn-plain text-[13.5px] font-semibold"
			>
				{#if pendente === 'pausar'}<Loading
						variant="fila"
						size={10}
						tone="current"
						label="Salvando"
					/>{/if}
				{pausada ? 'Retomar' : 'Pausar'}
			</button>
		{/if}
		<button
			type="button"
			onclick={salvar}
			disabled={pendente !== null || (prog.modo === 'semana' && prog.dias.length === 0)}
			class="btn min-h-11 motion-tap gap-2 btn-primary text-[14px] font-bold"
		>
			{#if pendente === 'salvar'}<Loading
					variant="fila"
					size={10}
					tone="current"
					label="Salvando"
				/>{/if}
			{prog.modo !== 'agora' ? 'Salvar programação' : 'Salvar e liberar'}
		</button>
	{/snippet}
</Bandeja>
