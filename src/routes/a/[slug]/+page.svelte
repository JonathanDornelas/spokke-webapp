<script lang="ts">
	import { untrack } from 'svelte';
	// Entrada do aluno. Único dado de identificação é o nome — sem e-mail, sem
	// senha (auth.md "Dados do aluno e LGPD"). Ao confirmar, a tentativa é criada
	// e a VERSÃO fica congelada: publicar uma nova depois não muda esta tentativa
	// (regra inviolável 7 e 8, ver server.md "A fronteira de segurança do Player").
	//
	// Se `data.resumable` existir, esta rota mostra a retomada em vez do
	// formulário — o mecanismo exato de identificação do aparelho (anonId em
	// cookie) é uma pendência de produto, ver .claude/rules/paginas.md.
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import AmbientShapes from '$lib/components/AmbientShapes.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import Logo from '$lib/components/Logo.svelte';
	import VolumeControl from '$lib/components/VolumeControl.svelte';
	import { som } from '$lib/client/sons.svelte';
	import { withMock } from '$lib/dev/with-mock';
	import {
		iniciarTentativa,
		naoSouEu,
		recomecarTentativa,
		retomarTentativa
	} from './player.remote';

	interface Resumable {
		name: string;
		nextIndex: number;
		answered: number;
		startedAgo: string;
	}
	/** Já respondida por este aparelho (ou por esta conta). */
	interface Concluida {
		name: string;
		when: string;
		respondidas: number;
		acertos: number;
	}
	interface PageData {
		activity: {
			title: string;
			itemCount: number;
			minutes: number;
			targetLabel: string;
			/** Derivadas dos itens, nunca escolhidas pelo professor (kernel.md). */
			skills: string[];
			/** A atividade tem questão de fala — só então a autorização de gravação é perguntada. */
			temFala: boolean;
			/** O nível que o professor deu ("B1 · Intermediário"), ou nulo. */
			nivel: string | null;
		};
		resumable: Resumable | null;
		concluida: Concluida | null;
		/** Preenchido quando o aluno chegou por um link pessoal. */
		student: { name: string } | null;
		/** A conta do aluno, se ele estiver logado. Oferta, nunca exigência. */
		account: { name: string; avatar: string | null } | null;
	}

	const MOCK: PageData = {
		activity: {
			title: 'Present perfect — turma B',
			itemCount: 8,
			minutes: 10,
			targetLabel: 'Inglês',
			skills: ['Escuta', 'Fala', 'Escrita'],
			temFala: true,
			nivel: 'B1 · Intermediário'
		},
		resumable: null,
		concluida: null,
		student: null,
		account: null
	};

	let { data: dataProp }: { data?: Partial<PageData> } = $props();

	// Lê o volume guardado já na entrada: é aqui que o aluno numa sala cheia
	// desliga o som ANTES da primeira questão.
	$effect(() => {
		// `untrack`: `sincronizar` LÊ `som.volume`, e sem ele o efeito passaria a
		// reagir a cada passo do regulador que está logo ao lado.
		untrack(() => som.sincronizar());
	});
	const data = $derived(withMock(dataProp, MOCK));

	// Ponto colorido por habilidade: acento para o que usa áudio, marca para o
	// resto. Nunca só cor — o nome da habilidade está ao lado.
	const skillTone: Record<string, string> = {
		Escuta: 'bg-accent',
		Fala: 'bg-accent'
	};
</script>

<svelte:head><title>{data.activity.title} — entendo</title></svelte:head>

<header
	class="flex shrink-0 items-center gap-3.5 border-b border-line px-5 py-4 lg:px-10 lg:py-[18px]"
>
	<Logo size={22} />
	<div class="flex-1"></div>
	<VolumeControl />
	{#if data.account}
		<!-- Logado: o nome é a porta do painel do aluno. O cadeado "você não
		     precisa de conta" continua verdade, mas para quem JÁ tem uma é ruído. -->
		<a
			href={resolve('/aluno')}
			class="flex items-center gap-2 rounded-full py-1 pe-2 text-[12.5px] whitespace-nowrap text-base-content/65 no-underline transition-colors hover:text-primary"
			title="Abrir minhas atividades"
		>
			<Avatar
				codigo={data.account.avatar}
				nome={data.account.name}
				size={26}
				radius="rounded-full"
			/>
			<span class="hidden sm:inline">{data.account.name}</span>
		</a>
	{:else}
		<span class="flex items-center gap-2 text-[12.5px] whitespace-nowrap text-base-content/65">
			<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
			Você não precisa de conta
		</span>
	{/if}
</header>

<div class="flex min-h-0 flex-1 flex-col">
	<div
		class="relative flex min-h-0 flex-1 flex-col [justify-content:safe_center] overflow-y-auto px-gutter
	       py-gutter-sm"
	>
		<AmbientShapes edges="both" />

		<div class="relative z-1 mx-auto w-full max-w-[560px] animate-entrada">
			{#if data.concluida}
				<!-- Já entregou: a tela não pede tudo de novo, mostra o que ele fez.
				     Vem ANTES da retomada no `{#if}`? Não — o loader já garante que
				     as duas não coexistem: quem parou no meio quer terminar, não
				     rever a tentativa de outro dia. -->
				<h1 class="mb-2.5 font-display text-title font-semibold tracking-[-0.025em] text-pretty">
					Você já respondeu esta atividade
				</h1>
				<p class="mb-[22px] text-[14.5px] leading-relaxed text-base-content/65">
					Foi {data.concluida.when}. Suas respostas estão guardadas com o seu professor.
				</p>

				<div class="mb-[22px] rounded-box border border-line bg-base-200 p-[18px]">
					<div class="mb-2.5 flex items-baseline justify-between gap-3">
						<span class="text-sm font-semibold">{data.concluida.name}</span>
						<span class="font-mono text-[12.5px] text-base-content/65">
							{data.concluida.respondidas} de {data.activity.itemCount} respondidas
						</span>
					</div>
					<div class="h-2 overflow-hidden rounded-full bg-base-300">
						<div
							class="h-full origin-left animate-progresso rounded-full bg-success"
							style="width: {(data.concluida.respondidas / data.activity.itemCount) * 100}%"
						></div>
					</div>
				</div>

				<!-- A contagem de ACERTOS não aparece aqui: o professor pode ter
				     desligado o resultado, e a tela de resultado é quem sabe disso.
				     Adiantar o número aqui seria a porta dos fundos daquele
				     interruptor. -->
				<p class="text-[12.5px] leading-snug text-base-content/65">
					Quer responder de novo? Fale com seu professor — ele decide se a atividade abre outra vez
					para você.
				</p>
			{:else if data.resumable}
				<h1 class="mb-2.5 font-display text-title font-semibold tracking-[-0.025em] text-pretty">
					Você já começou esta atividade
				</h1>
				<p class="mb-[22px] text-[14.5px] leading-relaxed text-base-content/65">
					Encontramos uma tentativa neste aparelho, parada na questão {data.resumable.nextIndex}.
				</p>
				<!-- Um form por ação: o rodapé é uma barra só e os botões chegam
				     nela por `form="id"`. -->
				<form id="form-retomar" {...retomarTentativa}>
					<input type="hidden" name="slug" value={page.params.slug} />
				</form>
				<form id="form-recomecar" {...recomecarTentativa}>
					<input type="hidden" name="slug" value={page.params.slug} />
				</form>

				<div class="mb-[22px] rounded-box border border-line bg-base-200 p-[18px]">
					<div class="mb-2.5 flex items-baseline justify-between">
						<span class="text-sm font-semibold">{data.resumable.name}</span>
						<span class="font-mono text-[12.5px] text-base-content/65">
							{data.resumable.answered} de {data.activity.itemCount}
						</span>
					</div>
					<div class="mb-2.5 h-2 overflow-hidden rounded-full bg-base-300">
						<div
							class="h-full origin-left animate-progresso rounded-full bg-primary"
							style="width: {(data.resumable.answered / data.activity.itemCount) * 100}%"
						></div>
					</div>
					<p class="text-[12.5px] text-base-content/65">Começou {data.resumable.startedAgo}</p>
				</div>

				{#if data.account}
					<!-- A retomada ganha da saudação (o que importa aqui é continuar), mas
					     quem entrou DEPOIS de começar precisa saber que entrou — senão
					     parece que o login não pegou. -->
					<p class="mb-[22px] text-[12.5px] leading-snug text-base-content/65">
						Você está na conta de {data.account.name}: o que responder fica guardado nela.
					</p>
				{/if}
			{:else}
				<p
					class="mb-3.5 flex flex-wrap items-center gap-2 text-xs font-bold tracking-[0.09em] text-primary uppercase"
				>
					<span>{data.activity.itemCount} questões</span>
					<span class="text-base-content/40" aria-hidden="true">•</span>
					<span>uns {data.activity.minutes} minutos</span>
					<span class="text-base-content/40" aria-hidden="true">•</span>
					<span>{data.activity.targetLabel}</span>
					{#if data.activity.nivel}
						<span class="text-base-content/40" aria-hidden="true">•</span>
						<span>{data.activity.nivel}</span>
					{/if}
				</p>
				<h1 class="mb-2.5 font-display text-display font-semibold tracking-[-0.025em] text-pretty">
					{data.activity.title}
				</h1>
				<form id="form-comecar" {...iniciarTentativa}>
					<input type="hidden" name="slug" value={page.params.slug} />
				</form>

				{#if data.student}
					<!-- Chegou pelo link pessoal: um campo a menos, e o professor
					     recebe o nome do cadastro em vez de "ju". NÃO é uma segunda
					     versão do Player — só esta caixa muda. -->
					<p class="mb-[26px] text-[14.5px] leading-relaxed text-base-content/65">
						Este link é seu. Seu professor já sabe quem você é.
					</p>
					<div
						class="mb-4 flex flex-wrap items-center gap-3 rounded-box border-[1.5px] border-primary bg-base-200 px-4 py-3.5"
					>
						<span
							class="grid size-[2.4rem] shrink-0 place-items-center rounded-full bg-base-300 text-[0.8rem] font-bold text-primary"
						>
							{data.student.name
								.split(/\s+/)
								.filter(Boolean)
								.slice(0, 2)
								.map((parte) => parte[0]?.toUpperCase())
								.join('')}
						</span>
						<span class="min-w-0 flex-1">
							<span class="block text-[0.75rem] text-base-content/65">Você é</span>
							<span class="block truncate text-[1.05rem] font-semibold">{data.student.name}</span>
						</span>
						<form {...naoSouEu}>
							<input type="hidden" name="slug" value={page.params.slug} />
							<button type="submit" class="p-2 text-[0.8rem] font-bold text-primary"
								>Não sou eu</button
							>
						</form>
					</div>
				{:else if data.account}
					<!-- Logado: o nome da conta vale e não há o que digitar. O que
					     muda em relação ao anônimo é só isto — e que o resultado fica
					     guardado na conta, em qualquer aparelho. -->
					<div
						class="mb-[26px] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-box border border-line bg-base-200 px-4 py-3.5"
					>
						<div class="min-w-[12rem] flex-1">
							<p class="mb-0.5 text-[14.5px] font-semibold">Você é {data.account.name}</p>
							<p class="text-[12.5px] leading-snug text-base-content/65">
								O que você responder fica guardado na sua conta.
							</p>
						</div>
						<!-- Botão, não link no meio da frase: é uma das duas portas da conta
						     no Player (a outra é o nome no cabeçalho), e um link de 12px
						     escondido numa linha cinza ninguém achava. -->
						<a
							href={resolve('/aluno')}
							class="btn h-[42px] motion-tap gap-2 btn-outline text-[13.5px] font-bold no-underline"
						>
							<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
								<path
									d="M4 5.5h16v13H4zM4 10h16M8 14h8"
									stroke="currentColor"
									stroke-width="2"
									stroke-linecap="round"
									stroke-linejoin="round"
								/>
							</svg>
							Ver minhas atividades
						</a>
					</div>
				{:else}
					<p class="mb-[26px] text-[14.5px] leading-relaxed text-base-content/65">
						Como seu professor vai te reconhecer na lista? Não precisa de e-mail nem senha.
					</p>
					<label class="mb-4 block">
						<span class="mb-[7px] block text-[13px] font-semibold">Seu nome ou apelido</span>
						<input
							form="form-comecar"
							name="displayName"
							required
							maxlength="40"
							autocomplete="nickname"
							class="input min-h-[52px] w-full border-[1.5px] border-primary text-[17px]"
						/>
					</label>

					<!-- A conta é OFERTA e fica DEPOIS do campo de nome: o caminho
					     principal continua sendo responder sem conta. Um convite antes
					     do campo leria como exigência, que é o oposto do produto. Mas
					     é oferta VISÍVEL: botões de verdade, não um link de 12px no
					     fim de uma frase cinza — quem já tem conta não achava por onde
					     entrar. "É opcional" continua escrito. -->
					<!-- eslint-disable svelte/no-navigation-without-resolve -- rota resolvida mais a query do modo e do retorno. -->
					<div class="mb-4 rounded-box border border-line bg-base-200 px-4 py-3.5">
						<p class="mb-3 text-[12.5px] leading-snug text-base-content/65">
							Quer guardar o que responder e reencontrar em outro aparelho?
							<span class="font-semibold text-base-content">É opcional.</span>
						</p>
						<div class="flex flex-wrap gap-2">
							<a
								href={resolve('/(auth)/entrar') +
									'?' +
									new URLSearchParams({ como: 'aluno', voltar: `/a/${page.params.slug}` })}
								class="btn h-[42px] flex-1 motion-tap gap-2 btn-outline text-[13.5px] font-bold no-underline"
							>
								<svg class="size-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
									<path
										d="M10 4H5.5a2 2 0 00-2 2v12a2 2 0 002 2H10M13.5 12h7M17 8.5l3.5 3.5-3.5 3.5"
										stroke="currentColor"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
									/>
								</svg>
								Entrar
							</a>
							<a
								href={resolve('/(auth)/cadastro') +
									'?' +
									new URLSearchParams({ como: 'aluno', voltar: `/a/${page.params.slug}` })}
								class="btn h-[42px] flex-1 motion-tap btn-plain text-[13.5px] no-underline"
							>
								Criar conta
							</a>
						</div>
					</div>
					<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{/if}
				{#if data.activity.temFala}
					<!-- **A autorização para guardar a gravação. Opt-in, sem exceção.**
					     Vem DESMARCADA e o exercício funciona igual sem ela: a fala é
					     transcrita e o áudio descartado, como sempre foi. O que muda
					     marcando é o professor conseguir ouvir e comentar.

					     O prazo vai escrito no rótulo, não num link de política: quem
					     está prestes a gravar a própria voz merece saber quanto tempo
					     ela fica, na mesma linha em que decide. -->
					<label
						class="mb-5 flex cursor-pointer items-start gap-3 rounded-field border border-line bg-base-100 p-3.5"
					>
						<input
							form="form-comecar"
							type="checkbox"
							name="guardarAudio"
							value="sim"
							class="mt-px checkbox shrink-0 checkbox-primary"
						/>
						<span class="text-[13px] leading-snug">
							<span class="font-semibold">Deixar meu professor ouvir minhas gravações</span>
							<span class="mt-1 block text-base-content/65">
								Nas questões de fala. Elas são apagadas depois de 7 dias, e sem marcar aqui o
								exercício funciona igual — a gravação é usada só para corrigir e descartada na hora.
							</span>
						</span>
					</label>
				{/if}

				<p class="mb-5 flex items-center gap-2 text-[12.5px] leading-snug text-base-content/65">
					<svg class="size-[15px] shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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
					Só o professor desta atividade vê seu nome.
				</p>

				<!-- As habilidades saem dos itens, não de um campo do professor. O
				     aluno precisa saber que vai gravar voz, não só clicar. -->
				<div class="flex flex-wrap gap-2">
					{#each data.activity.skills as skill (skill)}
						<span
							class="flex items-center gap-2 rounded-full border border-line bg-base-100 px-3.5 py-2 text-[13px] font-semibold"
						>
							<span class="size-[7px] rounded-full {skillTone[skill] ?? 'bg-primary'}"></span>
							{skill}
						</span>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	<footer
		class="flex shrink-0 items-center gap-4 border-t border-line px-5 pt-3.5 pb-[22px] lg:px-16 lg:pt-5 lg:pb-[26px]"
	>
		{#if data.concluida}
			<div class="hidden flex-1 lg:block"></div>
			<a
				href={resolve('/a/[slug]/resultado', { slug: page.params.slug ?? '' })}
				class="btn btn-lg min-h-[52px] flex-1 motion-tap gap-2.5 btn-primary text-[17px] font-bold no-underline lg:flex-none lg:px-[30px]"
			>
				Ver meu resultado
				<svg class="size-[18px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</a>
		{:else if data.resumable}
			<span class="hidden flex-1 text-[12.5px] leading-snug text-base-content/65 lg:block">
				Começar de novo apaga as {data.resumable.answered} respostas anteriores.
			</span>
			<button
				type="submit"
				form="form-recomecar"
				class="btn btn-lg min-h-[50px] flex-1 motion-tap btn-neutral text-base font-semibold lg:flex-none"
				>Começar de novo</button
			>
			<button
				type="submit"
				form="form-retomar"
				class="btn btn-lg min-h-[52px] flex-1 motion-tap btn-primary text-[17px] font-bold lg:flex-none lg:px-[30px]"
			>
				Continuar de onde parei
			</button>
		{:else}
			<span class="hidden flex-1 text-end text-[12.5px] text-base-content/65 lg:block">
				As perguntas ficam guardadas agora: editar a atividade não muda a sua.
			</span>
			<button
				type="submit"
				form="form-comecar"
				class="btn btn-lg min-h-[52px] w-full motion-tap gap-2.5 btn-primary text-[17px] font-bold lg:w-auto lg:px-[30px]"
			>
				Começar
				<svg
					class="hidden size-[18px] animate-[en-nudge_2.4s_ease-in-out_infinite] lg:block"
					viewBox="0 0 24 24"
					fill="none"
					aria-hidden="true"
				>
					<path
						d="M5 12h13M13 6l6 6-6 6"
						stroke="currentColor"
						stroke-width="2.2"
						stroke-linecap="round"
						stroke-linejoin="round"
					/>
				</svg>
			</button>
		{/if}
	</footer>
</div>
