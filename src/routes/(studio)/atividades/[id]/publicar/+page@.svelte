<script lang="ts">
	// Etapa 4. Duas regras visíveis nesta tela: (1) as habilidades são DERIVADAS
	// dos itens aceitos, nunca escolhidas; (2) o que foi publicado é IMUTÁVEL —
	// regra inviolável 7. Essa imutabilidade é INTERNA: o professor vê uma
	// atividade só, com estado (rascunho / no ar / com mudanças por publicar).
	// Numerar versão na interface fazia uma atividade recém-criada nascer na
	// "versão 2". `+page@.svelte` reseta para o layout raiz.
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import WizardShell from '$lib/components/WizardShell.svelte';
	import Loading from '$lib/components/Loading.svelte';
	import LoadingBar from '$lib/components/LoadingBar.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import { publicarAtividade } from '../../atividades.remote';
	import { enviarParaTurmas, turmasParaEnvio } from '../../../turmas/turmas.remote';

	interface SkillCount {
		name: string;
		count: number;
	}
	interface PageData {
		/** Como a última publicação está configurada — os padrões desta tela. */
		access: { requireCode: boolean; code: string; showResult: boolean };
		origin: string;
		/** O link do aluno — só depois da primeira publicação; antes é `null`. */
		link: string | null;
		/** Data URL do QR do link. Nasce junto com o link, na publicação. */
		qr: string | null;
		activity: {
			id: string;
			title: string;
			targetLang: string;
			sourceLang: string;
			slug: string;
		};
		itemCount: number;
		skills: SkillCount[];
		audio: { done: number; total: number };
		/** No ar e sem nada pendente — não há o que publicar. */
		published: boolean;
		/** Já existe link no ar (com ou sem mudanças por publicar). */
		jaNoAr: boolean;
	}

	const MOCK: PageData = {
		access: { requireCode: false, code: '', showResult: true },
		origin: 'https://spokke.app',
		link: 'https://spokke.app/a/atv_01',
		qr: '',
		activity: {
			id: page.params.id ?? 'atv_01',
			title: 'Present perfect — turma B',
			targetLang: 'Inglês',
			sourceLang: 'Português',
			slug: 'present-perfect-b'
		},
		itemCount: 24,
		skills: [
			{ name: 'Leitura', count: 14 },
			{ name: 'Escuta', count: 8 },
			{ name: 'Escrita', count: 6 }
		] as SkillCount[],
		audio: { done: 8, total: 8 },
		published: false,
		jaNoAr: false
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	const audioReady = $derived(data.audio.done === data.audio.total);

	// **O progresso do áudio anda sozinho.** Ele é o único número desta tela que
	// muda sem o professor fazer nada — quem sintetiza é o worker, noutro
	// processo —, e sem esta recarga o contador ficava congelado em "0 de 10"
	// com o botão de publicar travado: o áudio ficava pronto e a tela não
	// sabia. Não é otimista: cada volta relê o loader, que conta `MediaAsset`
	// de verdade.
	//
	// Só enquanto falta alguma coisa. Terminado, o intervalo é desligado — uma
	// tela de professor aberta a tarde inteira não vai bater no servidor a cada
	// 3 s para reconfirmar um número que não muda mais.
	$effect(() => {
		if (audioReady) return;
		const relogio = setInterval(() => void invalidateAll(), 3000);
		return () => clearInterval(relogio);
	});

	// O link é do SERVIDOR, sempre: ele sai do id da atividade e o professor
	// não escolhe (`server/player/slug.ts`). E só existe DEPOIS de publicar:
	// antes da primeira publicação a tela diz que ele é criado ali — um
	// endereço visível que ainda não abre era o que o professor colava no grupo.
	const linkFinal = $derived(data.link ?? '');
	const linkVisivel = $derived(linkFinal.split('//')[1] ?? linkFinal);

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
	 * Envio para turma. Nasce de uma atividade JÁ publicada e é uma ação a
	 * mais, nunca um passo do wizard: o link aberto, o QR e o código continuam
	 * valendo, e enviar não tranca ninguém de fora.
	 */
	let mostrarEnvio = $state(false);
	let turmasEscolhidas = $state<string[]>([]);
	let enviando = $state(false);
	let enviados = $state<number | null>(null);
	/** A recusa do servidor (áudio não pronto, arquivada) — dita, nunca um clique que não faz nada. */
	let erroEnvio = $state<string | null>(null);

	function alternarTurma(id: string) {
		turmasEscolhidas = turmasEscolhidas.includes(id)
			? turmasEscolhidas.filter((x) => x !== id)
			: [...turmasEscolhidas, id];
	}

	async function enviar() {
		if (turmasEscolhidas.length === 0) return;
		enviando = true;
		erroEnvio = null;
		try {
			const r = await enviarParaTurmas({
				activityId: data.activity.id,
				classroomIds: turmasEscolhidas
			});
			// A confirmação dá o número REAL e diz que a fila está andando —
			// nunca que chegou.
			if (r.ok) enviados = r.enfileirados ?? 0;
			else erroEnvio = r.error ?? 'Não deu para enviar agora.';
		} catch {
			erroEnvio = 'Não deu para enviar agora. Tente de novo em instantes.';
		} finally {
			enviando = false;
		}
	}

	/**
	 * Publicar leva alguns segundos: o servidor valida item a item, enfileira o
	 * TTS que falta e grava a publicação. Sem este estado o professor clicava e
	 * ficava olhando um botão parado.
	 */
	let publicando = $state(false);
	const publicar = $derived(
		publicarAtividade.enhance(async ({ submit }) => {
			publicando = true;
			try {
				await submit();
			} finally {
				publicando = false;
			}
		})
	);

	// Sem rascunho não existe o que publicar: o servidor recusaria republicar o
	// que já está no ar sem nenhuma mudança, então o botão daria uma promessa
	// falsa. Nesse estado a ação é editar a atividade.
	const podePublicar = $derived(audioReady && data.itemCount > 0 && !data.published);

	/**
	 * Compartilhar usa a folha nativa do sistema (`navigator.share`), que é
	 * onde já estão o WhatsApp e o Google Classroom do professor — reimplementar
	 * uma lista de destinos nossa seria pior e desatualizaria sozinha.
	 *
	 * Ela não existe em todo browser (desktop, sobretudo) e exige HTTPS, então o
	 * caminho de baixo é copiar o link. O botão nunca some: em qualquer um dos
	 * dois casos o professor sai daqui com o link na mão.
	 */
	let compartilhado = $state<string | null>(null);
	async function compartilhar() {
		const dados = {
			title: data.activity.title,
			text: `Atividade de ${data.activity.targetLang}: ${data.activity.title}`,
			url: linkFinal
		};
		try {
			if (typeof navigator.share === 'function') {
				await navigator.share(dados);
				return;
			}
			await navigator.clipboard.writeText(linkFinal);
			compartilhado = 'Link copiado';
		} catch {
			// `AbortError` é o professor fechando a folha de compartilhamento —
			// não é falha e não merece mensagem.
			compartilhado = null;
			return;
		}
		setTimeout(() => (compartilhado = null), 2000);
	}

	let copiado = $state(false);
	async function copiarLink() {
		try {
			await navigator.clipboard.writeText(linkFinal);
			copiado = true;
			setTimeout(() => (copiado = false), 2000);
		} catch {
			// Clipboard bloqueado (sem HTTPS, permissão negada): o link continua
			// visível e selecionável ao lado — não vale quebrar a tela por isso.
			copiado = false;
		}
	}
	const skillTone: Record<string, string> = {
		Escuta: 'text-accent bg-accent/12',
		Fala: 'text-accent bg-accent/12'
	};
</script>

<svelte:head><title>Publicar — Spokke</title></svelte:head>

<WizardShell
	step={4}
	backHref={resolve('/(studio)/atividades/[id]/revisar', { id: data.activity.id })}
	backLabel="Revisar"
	status="{data.itemCount} itens"
	hint={!audioReady
		? 'O link só fica ativo quando todos os áudios terminarem.'
		: data.published
			? 'Está no ar. Você pode fechar por aqui — a atividade fica na sua lista.'
			: data.jaNoAr
				? 'Quem estiver respondendo agora termina com as perguntas que abriu.'
				: 'Depois de publicar, o link fica pronto para mandar para a turma.'}
>
	<div class="grid items-start gap-4 px-4 py-6 lg:grid-cols-[1.5fr_1fr] lg:px-[30px] lg:py-7">
		<div class="overflow-hidden rounded-box border border-line bg-base-100">
			<div class="px-[30px] pt-[26px]">
				<h1 class="mb-1.5 font-display text-2xl font-semibold tracking-[-0.02em]">
					Pronta para publicar
				</h1>
				<p class="mb-[22px] text-sm text-base-content/65">
					{data.itemCount} itens · {data.activity.targetLang} para falantes de {data.activity
						.sourceLang}
				</p>
				<div class="mb-2 flex flex-wrap items-center gap-2">
					<span class="me-1 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
						>Habilidades treinadas</span
					>
					{#each data.skills as s (s.name)}
						<span
							class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-bold {skillTone[
								s.name
							] ?? 'bg-base-300 text-primary'}"
						>
							{s.name} <span class="font-mono font-normal opacity-75">{s.count}</span>
						</span>
					{/each}
				</div>
				<p class="mb-6 text-[12.5px] text-base-content/65">
					Derivadas dos itens que você aceitou — você não escolheu nenhuma delas diretamente.
				</p>
			</div>

			{#if data.published}
				<!-- No ar e sem nada por publicar: o formulário não tem como ser
				     enviado (o rodapé virou "Concluir"), então os controles seriam
				     interruptores que não fazem nada. Aqui eles viram o RESUMO do que
				     está valendo, e mudar qualquer coisa passa por editar a atividade
				     e publicar de novo. -->
				<div class="grid gap-3 border-t border-line px-[30px] py-6">
					<p class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
						Como está no ar
					</p>
					<div
						class="flex items-center justify-between gap-3.5 rounded-box border border-line bg-base-200 px-4 py-3.5"
					>
						<span class="text-sm font-semibold">Código de acesso</span>
						<span class="text-[13px] text-base-content/65">
							{#if data.access.requireCode && data.access.code}
								<span class="font-mono font-bold tracking-[0.25em] text-primary"
									>{data.access.code}</span
								>
							{:else}
								não exige
							{/if}
						</span>
					</div>
					<div
						class="flex items-center justify-between gap-3.5 rounded-box border border-line bg-base-200 px-4 py-3.5"
					>
						<span class="text-sm font-semibold">Resultado ao aluno</span>
						<span class="text-[13px] text-base-content/65">
							{data.access.showResult ? 'aparece no fim' : 'só "respostas enviadas"'}
						</span>
					</div>
				</div>
			{:else}
				<!-- `id` para o botão do rodapé (fora do form) submeter por
				     `form="form-publicar"` — a ação principal mora na barra fixa. -->
				<form id="form-publicar" {...publicar} class="border-t border-line px-[30px] py-6">
					<input type="hidden" name="activityId" value={data.activity.id} />
					<div class="grid gap-4">
						<!-- O link não é campo: ele sai do id da atividade e é único por
					     construção, então não há o que digitar nem disponibilidade a
					     consultar. Aparece aqui só quando JÁ EXISTE (há uma publicação no
					     ar e esta tela está publicando mudanças); antes da primeira
					     publicação ele não existe, e a tela diz isso em vez de mostrar um
					     endereço que ainda não abre. -->
						{#if !data.jaNoAr}
							<p
								class="flex items-start gap-2.5 rounded-field border border-dashed border-line bg-base-200 px-3.5 py-3 text-[12.5px] leading-relaxed text-base-content/65"
							>
								<svg
									class="mt-px size-4 shrink-0 text-primary"
									viewBox="0 0 24 24"
									fill="none"
									aria-hidden="true"
								>
									<path
										d="M10 13.5a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7l-1 1M14 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7l1-1"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								<span
									>O link, o QR e o código são criados quando você publicar — e aparecem aqui na
									hora.</span
								>
							</p>
						{:else if !data.published}
							<div class="block">
								<span class="mb-1.5 block text-[13px] font-semibold">Link do aluno</span>
								<div
									class="flex flex-wrap items-center gap-2 rounded-field border border-line bg-base-200 px-3.5 py-2.5 sm:flex-nowrap"
								>
									<span class="min-w-0 flex-1 truncate font-mono text-[13.5px]" title={linkVisivel}>
										{linkVisivel}
									</span>
									<button
										type="button"
										onclick={copiarLink}
										class="btn btn-sm shrink-0 motion-tap btn-neutral font-semibold"
									>
										{copiado ? 'Copiado' : 'Copiar'}
									</button>
								</div>
								<p class="mt-1.5 text-[12.5px] text-base-content/65">
									Gerado a partir da atividade e sempre o mesmo — publicar de novo não muda o
									endereço.
								</p>
							</div>
						{/if}

						<div class="rounded-box border border-line bg-base-200">
							<label class="flex cursor-pointer items-center justify-between gap-3.5 px-4 py-3.5">
								<span>
									<span class="mb-0.5 block text-sm font-semibold">Código de acesso</span>
									<span class="block text-[12.5px] text-base-content/65"
										>Exige um código antes de o aluno começar.</span
									>
								</span>
								<input
									type="checkbox"
									name="requireCode"
									bind:checked={exigirCodigo}
									class="toggle shrink-0 toggle-primary"
								/>
							</label>

							{#if exigirCodigo}
								<div class="border-t border-line px-4 py-3.5">
									<span class="mb-1.5 block text-[13px] font-semibold"
										>As 4 letras que você dita</span
									>
									<div class="flex items-center gap-2.5">
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
											class="w-[7.5rem] rounded-field border-[1.5px] bg-base-100 px-3 py-2.5 text-center font-mono text-[1.25rem] tracking-[0.35em] uppercase
										       {codigoValido ? 'border-line' : 'border-error'}"
										/>
										<button
											type="button"
											onclick={sortearCodigo}
											class="btn btn-sm motion-tap btn-neutral font-semibold">Sortear</button
										>
										<span class="flex-1 text-[12.5px] leading-snug text-base-content/65">
											{#if !codigoValido}
												4 letras, sem I nem O.
											{:else if codigo}
												Só quem tem o link E o código entra.
											{:else}
												Em branco, o sistema sorteia um na publicação.
											{/if}
										</span>
									</div>
								</div>
							{/if}
						</div>
						<label
							class="flex cursor-pointer items-center justify-between gap-3.5 rounded-box border border-line bg-base-200 px-4 py-3.5"
						>
							<span>
								<span class="mb-0.5 block text-sm font-semibold">Mostrar o resultado ao aluno</span>
								<span class="block text-[12.5px] text-base-content/65"
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
					</div>

					{#if publicarAtividade.result && !publicarAtividade.result.ok}
						<div
							class="mt-4 rounded-box border border-s-[3px] border-line border-s-error bg-base-200 px-4 py-3 text-[13.5px]"
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
										href={resolve('/(site)/planos') + '?motivo=' + publicarAtividade.result.motivo}
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

		<div class="grid content-start gap-4">
			<!-- O aviso descreve o EFEITO de publicar. Com a atividade no ar e sem
			     nada pendente não há o que publicar, então ele não tem sujeito — e o
			     cartão "No ar" logo abaixo já diz o que precisa ser dito. -->
			{#if !data.published}
				<div
					class="rounded-box border border-s-[3px] border-line border-s-primary bg-base-100 px-[22px] py-5"
				>
					<p class="mb-2.5 flex items-center gap-2 text-[13px] font-bold">
						<svg
							class="size-[17px] shrink-0 text-primary"
							viewBox="0 0 24 24"
							fill="none"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" />
							<path
								d="M12 11v5.5M12 7.5h.01"
								stroke="currentColor"
								stroke-width="2"
								stroke-linecap="round"
							/>
						</svg>
						{data.jaNoAr ? 'Isto atualiza o link' : 'Isto cria o link do aluno'}
					</p>
					<p class="text-[13.5px] leading-relaxed text-base-content/65">
						{#if data.jaNoAr}
							O endereço continua o mesmo. Quem estiver respondendo agora termina com as perguntas
							que abriu — só quem entrar depois vê as mudanças. Nenhuma resposta já entregue muda.
						{:else}
							<!-- Primeira publicação: ainda não existe nada no ar para comparar. -->
							A partir daqui o link fica de pé. Se você editar a atividade depois, quem já estiver respondendo
							termina com as perguntas que abriu.
						{/if}
					</p>
				</div>
			{/if}

			{#if !audioReady}
				<div class="rounded-box border border-line bg-base-100 px-[22px] py-5">
					<p class="mb-3.5 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase">
						Gerando áudio — publicação espera
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
							style="width: {(data.audio.done / data.audio.total) * 100}%"
						></div>
					</div>
					<p class="text-[12.5px] leading-snug text-base-content/65">
						O link só fica ativo quando todos terminarem. Sem prazo estimado — a geração é
						assíncrona.
					</p>
				</div>
			{:else if data.published}
				<div class="rounded-box border border-success bg-success/6 px-[22px] py-5">
					<div class="mb-3 flex items-center gap-2.5">
						<span
							class="grid size-[30px] place-items-center rounded-full bg-success text-success-content"
						>
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M4 12.5l5 5L20 6.5"
									stroke="currentColor"
									stroke-width="3"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
						</span>
						<span class="font-display text-lg font-semibold">No ar</span>
					</div>
					<div
						class="mb-3 flex items-center gap-2 rounded-field border border-line bg-base-100 px-3 py-2.5"
					>
						<span class="flex-1 truncate font-mono text-[12.5px]">{linkVisivel}</span>
						<button
							type="button"
							onclick={copiarLink}
							class="px-1 py-1.5 text-[12.5px] font-bold whitespace-nowrap {copiado
								? 'text-success'
								: 'text-primary'}">{copiado ? 'Copiado' : 'Copiar'}</button
						>
					</div>
					{#if data.access.requireCode && data.access.code}
						<div
							class="mb-3 flex items-center gap-3 rounded-field border border-line bg-base-100 px-3 py-2.5"
						>
							<span class="text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
								>Código</span
							>
							<span class="font-mono text-[1.05rem] font-bold tracking-[0.3em] text-primary"
								>{data.access.code}</span
							>
							<span class="flex-1 text-end text-[12px] leading-snug text-base-content/65"
								>Dite em aula. O link sozinho não abre.</span
							>
						</div>
					{/if}
				</div>

				<!-- O QR é a forma como a atividade chega numa sala de aula: o
				     professor projeta e a turma aponta a câmera. Ele estava a 66px
				     dentro de outro cartão, ilegível a três metros do quadro — aqui
				     tem cartão próprio e tamanho de projeção. -->
				{#if data.qr}
					<div class="rounded-box border border-line bg-base-100 px-[1.35rem] py-5">
						<p
							class="mb-3.5 text-[11px] font-bold tracking-[0.09em] text-base-content/65 uppercase"
						>
							QR da atividade
						</p>
						<img
							src={data.qr}
							alt="QR code do link {linkFinal}"
							width="264"
							height="264"
							class="mx-auto mb-3.5 block aspect-square w-full max-w-[232px] rounded-box border border-line bg-white p-2.5"
						/>
						<p class="mb-3.5 text-center text-[12.5px] leading-snug text-base-content/65">
							Projete na sala e a turma aponta a câmera. Não precisa de conta do aluno.
						</p>
						<div class="flex flex-wrap gap-2.5">
							<button
								type="button"
								onclick={compartilhar}
								class="btn btn-sm flex-1 motion-tap gap-2 btn-primary font-bold"
							>
								<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M12 3.5v11M12 3.5L8 7.5M12 3.5l4 4M5 13v5.5a2 2 0 002 2h10a2 2 0 002-2V13"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								{compartilhado ?? 'Compartilhar'}
							</button>
							<!-- eslint-disable svelte/no-navigation-without-resolve -- não é rota: `data.qr` é a data URL do PNG, e o `download` salva o arquivo em vez de navegar. -->
							<a
								href={data.qr}
								download="qr-{data.activity.slug}.png"
								class="btn btn-sm flex-1 motion-tap gap-2 btn-neutral font-semibold no-underline"
							>
								<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M12 3.5v11M12 14.5L8 10.5M12 14.5l4-4M5 19.5h14"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								Baixar
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</div>
					</div>
				{/if}

				<!-- Enviar para turma é uma AÇÃO A MAIS, ao lado do link, do QR e do
				     código — nunca um passo do wizard, e não muda quem pode entrar
				     pelo link aberto. -->
				<div class="rounded-box border border-line bg-base-100 px-[1.35rem] py-5">
					{#if erroEnvio}
						<p class="mb-3 text-[0.84rem] leading-relaxed font-semibold text-error" role="alert">
							{erroEnvio}
						</p>
					{/if}
					{#if enviados !== null}
						<p class="mb-1.5 flex items-center gap-2 text-[0.88rem] font-bold text-primary">
							<svg class="size-[1.05rem]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M4 12.5l5 5L20 6.5"
									stroke="currentColor"
									stroke-width="2.6"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							{enviados}
							{enviados === 1 ? 'convite saindo' : 'convites saindo'}
						</p>
						<!-- Barra de fila, não forma girando: o trabalho está no worker,
						     e ela diz que algo anda sem prometer que chegou. -->
						<LoadingBar label="A fila está andando. Acompanhe quem abriu na página da turma." />
					{:else if !mostrarEnvio}
						<p class="mb-1.5 text-[0.88rem] font-semibold">Enviar para uma turma</p>
						<p class="mb-3.5 text-[0.8rem] leading-relaxed text-base-content/65">
							Cada aluno recebe um link pessoal, diferente do link aberto. É esse link que faz o
							nome dele aparecer certo na sua lista.
						</p>
						<button
							type="button"
							onclick={() => (mostrarEnvio = true)}
							class="btn btn-sm motion-tap btn-neutral font-semibold">Escolher turmas</button
						>
					{:else}
						<p
							class="mb-3 text-[0.68rem] font-bold tracking-[0.09em] text-base-content/65 uppercase"
						>
							Para quem enviar
						</p>
						{#await turmasParaEnvio()}
							<div class="h-[3rem] skeleton"></div>
						{:then turmas}
							{#if turmas.length === 0}
								<p class="text-[0.8rem] leading-snug text-base-content/65">
									Você ainda não tem turma. O link, o QR e o código continuam valendo sem isso.
								</p>
							{:else}
								{@const escolhidas = turmas.filter((t) => turmasEscolhidas.includes(t.id))}
								{@const totalConvites = escolhidas.reduce((n, t) => n + t.withEmail, 0)}
								{@const semEmail = escolhidas.reduce((n, t) => n + (t.students - t.withEmail), 0)}
								<ul class="mb-3 grid list-none gap-2 p-0">
									{#each turmas as turma (turma.id)}
										{@const marcada = turmasEscolhidas.includes(turma.id)}
										<li>
											<button
												type="button"
												onclick={() => alternarTurma(turma.id)}
												aria-pressed={marcada}
												class="flex w-full items-center gap-3 rounded-field border px-3.5 py-2.5 text-start transition-[border-color,background]
												       {marcada ? 'border-primary bg-base-300' : 'border-line bg-base-100 hover:border-primary'}"
											>
												<span class="min-w-0 flex-1">
													<span class="block truncate text-[0.88rem] font-semibold"
														>{turma.name}</span
													>
													<span class="block text-[0.75rem] text-base-content/65">
														{turma.students} alunos, {turma.withEmail} com e-mail
													</span>
												</span>
												<span class="shrink-0 font-mono text-[0.8rem] font-bold text-primary"
													>+{turma.withEmail}</span
												>
											</button>
										</li>
									{/each}
								</ul>
								<p class="mb-3.5 text-[0.78rem] leading-snug text-base-content/65">
									{#if semEmail > 0}
										{semEmail}
										{semEmail === 1 ? 'aluno sem e-mail fica' : 'alunos sem e-mail ficam'} de fora do
										envio e {semEmail === 1 ? 'segue' : 'seguem'} na turma.
									{:else}
										O link aberto continua valendo em paralelo.
									{/if}
								</p>
								<div class="flex flex-wrap gap-2.5">
									<button
										type="button"
										onclick={enviar}
										disabled={totalConvites === 0 || enviando}
										class="btn btn-sm motion-tap gap-2 btn-primary font-bold"
									>
										{#if enviando}
											<Loading variant="fila" size={11} tone="current" label="Enviando" />
											Enviando…
										{:else}
											Enviar {totalConvites} convites
										{/if}
									</button>
									<button
										type="button"
										onclick={() => (mostrarEnvio = false)}
										class="btn btn-sm motion-tap btn-neutral font-semibold">Cancelar</button
									>
								</div>
							{/if}
						{/await}
					{/if}
				</div>
			{/if}
		</div>
	</div>

	{#snippet actions()}
		<!-- A prévia é uma rota do PROFESSOR, não `/a/[slug]`: antes de publicar
		     aquele link não existe, e depois de publicar abri-lo criaria uma
		     tentativa de aluno no relatório dele. -->
		<a
			href={resolve('/(studio)/atividades/[id]/previa', { id: data.activity.id })}
			class="btn h-[46px] flex-1 motion-tap btn-neutral font-semibold no-underline lg:flex-none"
		>
			<span class="lg:hidden">Pré-visualizar</span>
			<span class="hidden lg:inline">Pré-visualizar tudo</span>
		</a>
		{#if data.published}
			<!-- No ar e sem nada pendente: o wizard ACABOU. A ação principal aqui é
			     sair dele, não recomeçar a edição — "Editar atividade" mandava o
			     professor de volta para dentro do fluxo que ele acabou de terminar.
			     Editar continua sendo possível pelo "Revisar" do cabeçalho e pela
			     lista de atividades. -->
			<a
				href={resolve('/(studio)/atividades')}
				class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold no-underline lg:flex-none"
			>
				Concluir
				<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M4 12.5l5 5L20 6.5"
						stroke="currentColor"
						stroke-width="2.4"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
		{:else}
			<button
				type="submit"
				form="form-publicar"
				disabled={!podePublicar || publicando}
				class="btn h-[46px] flex-1 motion-tap gap-2.5 btn-primary font-bold lg:flex-none"
			>
				{#if publicando}
					<!-- `fila` e `tone="current"`: é espera curta dentro de um botão,
					     e as formas herdam a cor do texto para sair legíveis no cheio. -->
					<Loading variant="fila" size={12} tone="current" label="Publicando" />
					Publicando…
				{:else}
					{data.jaNoAr ? 'Publicar mudanças' : 'Publicar'}
				{/if}
			</button>
		{/if}
	{/snippet}
</WizardShell>
