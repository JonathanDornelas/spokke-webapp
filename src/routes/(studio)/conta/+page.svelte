<script lang="ts">
	// Conta e assinatura numa tela só, em duas abas. Eram duas rotas com um
	// cartão cada; a assinatura é um pedaço da conta e não merecia entrada
	// própria — no celular a barra de abas já mandava para cá.
	//
	// **As abas ficam no TOPO, não na lateral.** Uma coluna de abas ao lado da
	// barra lateral do Studio seriam duas navegações verticais lado a lado,
	// disputando o mesmo olhar.
	//
	// Regra que atravessa a aba de assinatura (billing.md, paginas.md): plano
	// vencido bloqueia CRIAR e PUBLICAR, mas os links já publicados continuam
	// funcionando — o aluno nunca é afetado pela cobrança do professor.
	//
	// **Não há gateway de pagamento** (docs/adr-002-billing.md): escolher um
	// plano registra um PEDIDO, a equipe combina o pagamento e ativa pelo painel.
	// Por isso não há "portal" nem lista de faturas aqui — há o pedido pendente e
	// o HISTÓRICO real do que mudou na conta.
	//
	// PENDÊNCIA: o que acontece com os links já publicados ao encerrar a conta
	// não está definido — precisa de decisão antes de ir para produção. O aviso
	// dentro do cartão vermelho existe para isso não passar batido.
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { tick } from 'svelte';
	import { authClient } from '$lib/client/auth';
	import { withMock } from '$lib/dev/with-mock';
	import Loading from '$lib/components/Loading.svelte';
	import Avatar from '$lib/components/Avatar.svelte';
	import HeaderCard from '$lib/components/HeaderCard.svelte';
	import { IDIOMAS } from '$lib/idiomas';
	import AvatarEditor from '$lib/components/AvatarEditor.svelte';
	import { CODIGO_PADRAO, avatarPadrao, sortearCodigo } from '$lib/avatar/montar';
	import { fracaoDeUso, type ResumoDoAcesso } from '$lib/billing/resumo';
	import { LIMITES, TRIAL } from '$lib/billing/catalogo';
	import { gravarMeuAvatar } from '../studio.remote';
	import {
		agendarCancelamento,
		cancelarPedido,
		desfazerCancelamento,
		sairDaEscola
	} from './conta.remote';

	type Aba = 'dados' | 'assinatura';
	type Estado = 'active' | 'escola' | 'trial' | 'past_due' | 'canceled' | 'expired';

	interface PageData {
		aba: Aba;
		teacher: {
			name: string;
			email: string;
			pendingEmail: string | null;
			avatar: string | null;
			idiomas: string[];
			idiomaDosAlunos: string;
			desde: Date;
		};
		contagens: { turmas: number; alunos: number };
		acesso: ResumoDoAcesso;
		cobranca: { provedor: 'manual' | 'mercadopago'; podeDesfazerCancelamento: boolean };
		/** A volta do checkout do Mercado Pago, com o que ele respondeu. */
		checkout: { status: string; plano: string } | null;
		pedido: { plano: string; ciclo: string; quando: Date } | null;
		historico: { id: string; texto: string; quando: Date }[];
	}

	const MOCK: PageData = {
		aba: 'dados' as Aba,
		teacher: {
			name: 'Ana Martins',
			email: 'ana@escola.com',
			pendingEmail: null,
			avatar: '1-1-1-1-0-0-0-0-0-1-0-0-0-0-0-1',
			idiomas: ['en-US'],
			idiomaDosAlunos: 'pt-BR',
			desde: new Date('2026-02-12')
		},
		contagens: { turmas: 3, alunos: 64 },
		acesso: {
			plano: 'basico',
			rotulo: 'Período de teste',
			origem: 'trial',
			situacao: 'trial',
			limites: LIMITES.basico,
			uso: { atividades: 3, materiais: 24 },
			creditos: { saldo: 0, renovamEm: null },
			trialEndsAt: null,
			diasDeTrial: 9,
			currentPeriodEnd: null,
			cancelAtPeriodEnd: false,
			escola: null,
			pode: { publicar: true, criarAtividade: true, criarMaterial: true, usarIa: false },
			motivo: { publicar: null, criarAtividade: null, criarMaterial: null, usarIa: 'ia' }
		},
		cobranca: { provedor: 'manual', podeDesfazerCancelamento: true },
		checkout: null,
		pedido: null,
		historico: []
	};

	let {
		data: dataProp,
		form
	}: { data?: Partial<PageData>; form?: { salvo?: boolean; erro?: string } | null } = $props();
	const data = $derived(withMock(dataProp, MOCK));

	// ── avatar ── Grava de verdade, pela remote function `gravarMeuAvatar`.
	let editorDeAvatarAberto = $state(false);
	// Só o RASCUNHO do editor. Nasce no padrão e não no avatar da conta de
	// propósito: quem semeia com o valor de verdade é `abrirEditorDeAvatar`, a
	// cada abertura — ler `data` aqui capturaria o valor inicial e ficaria
	// desatualizado depois do `invalidateAll`.
	let codigoDoAvatar = $state(CODIGO_PADRAO);
	let salvandoAvatar = $state(false);
	// Mostra o da CONTA até o editor abrir: sem isto, sortear dentro do editor e
	// fechar sem usar deixava a tela exibindo um avatar que não foi gravado.
	const avatarNaTela = $derived(
		editorDeAvatarAberto ? codigoDoAvatar : (data.teacher.avatar ?? null)
	);

	/** Falha ao gravar é DITA: o avatar da tela voltaria ao antigo sem explicação. */
	let erroAvatar = $state<string | null>(null);
	async function usarAvatar(escolhido: string) {
		salvandoAvatar = true;
		erroAvatar = null;
		try {
			await gravarMeuAvatar(escolhido);
			await invalidateAll();
		} catch {
			erroAvatar = 'Não deu para gravar o avatar agora. Tente de novo em instantes.';
		} finally {
			salvandoAvatar = false;
		}
	}

	function abrirEditorDeAvatar() {
		codigoDoAvatar = data.teacher.avatar ?? avatarPadrao(data.teacher.name);
		editorDeAvatarAberto = true;
	}

	async function sortearEUsar() {
		const sorteado = sortearCodigo();
		codigoDoAvatar = sorteado;
		await usarAvatar(sorteado);
	}

	// ── trocar a senha ──
	// Pelo Better Auth (`changePassword`), com a senha atual — a sessão sozinha
	// não basta: um navegador esquecido aberto não pode trocar a senha de
	// ninguém. `revokeOtherSessions` desconecta os outros aparelhos, que é o que
	// o cartão promete; este continua conectado.
	let trocandoSenha = $state(false);
	let senhaAtual = $state('');
	let senhaNova = $state('');
	let senhaConfirma = $state('');
	let salvandoSenha = $state(false);
	let erroSenha = $state<string | null>(null);
	let senhaTrocada = $state(false);
	let campoSenhaAtual = $state<HTMLInputElement | null>(null);
	const senhasDiferentes = $derived(senhaConfirma.length > 0 && senhaNova !== senhaConfirma);
	const senhaPronta = $derived(
		senhaAtual.length > 0 && senhaNova.length >= 8 && senhaNova === senhaConfirma
	);

	async function abrirTrocaDeSenha() {
		trocandoSenha = true;
		senhaTrocada = false;
		erroSenha = null;
		await tick();
		campoSenhaAtual?.focus();
	}
	function cancelarTrocaDeSenha() {
		trocandoSenha = false;
		senhaAtual = senhaNova = senhaConfirma = '';
		erroSenha = null;
	}
	async function trocarSenha(e: SubmitEvent) {
		e.preventDefault();
		if (!senhaPronta || salvandoSenha) return;
		salvandoSenha = true;
		erroSenha = null;
		try {
			const { error } = await authClient.changePassword({
				currentPassword: senhaAtual,
				newPassword: senhaNova,
				revokeOtherSessions: true
			});
			if (error) {
				erroSenha =
					error.code === 'INVALID_PASSWORD'
						? 'A senha atual não confere.'
						: error.code === 'PASSWORD_TOO_SHORT'
							? 'A senha nova precisa de ao menos 8 caracteres.'
							: 'Não deu para trocar a senha agora. Tente de novo em instantes.';
				return;
			}
			cancelarTrocaDeSenha();
			senhaTrocada = true;
		} catch {
			erroSenha = 'Não deu para trocar a senha agora. Tente de novo em instantes.';
		} finally {
			salvandoSenha = false;
		}
	}

	let salvandoPerfil = $state(false);

	/** "outubro de 2026" — a linha de contexto do topo. */
	const desde = $derived(
		new Date(data.teacher.desde).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
	);
	const plural = (n: number, um: string, varios: string) => `${n === 1 ? um : varios}`;
	/** O tamanho do que ele já construiu: os números do cartão do topo. */
	const numeros = $derived([
		{
			value: data.acesso.uso.atividades,
			label: plural(data.acesso.uso.atividades, 'atividade', 'atividades')
		},
		{
			value: data.acesso.uso.materiais,
			label: plural(data.acesso.uso.materiais, 'material', 'materiais')
		},
		{ value: data.contagens.turmas, label: plural(data.contagens.turmas, 'turma', 'turmas') },
		{ value: data.contagens.alunos, label: plural(data.contagens.alunos, 'aluno', 'alunos') }
	]);

	// ── assinatura ──
	function dataPorExtenso(d: Date | null): string | null {
		return d ? new Date(d).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' }) : null;
	}

	const estado = $derived.by((): Estado => {
		const { origem, situacao } = data.acesso;
		if (origem === 'escola') return 'escola';
		if (situacao === 'trial') return 'trial';
		if (situacao === 'atrasada') return 'past_due';
		if (situacao === 'cancelada') return 'canceled';
		if (situacao === 'expirada') return 'expired';
		return 'active';
	});

	// O que cada estado diz. `line` é a frase de contexto; onde ela fala de
	// data, a data vem do banco e o texto se adapta quando ela não existe.
	interface Desenho {
		tag: string;
		title: string;
		sub: string;
		line: string;
		/** O CTA leva à tela de planos. Nulo quando não há o que escolher (escola). */
		cta: string | null;
		ctaPrimario: boolean;
	}
	const desenho = $derived.by((): Desenho => {
		const a = data.acesso;
		const fim = dataPorExtenso(a.currentPeriodEnd);
		switch (estado) {
			case 'active':
				return {
					tag: a.cancelAtPeriodEnd ? 'Encerra no fim do período' : 'Ativa',
					title: a.rotulo,
					sub: 'tudo liberado dentro dos limites do plano',
					line: a.cancelAtPeriodEnd
						? `Até ${fim ?? 'o fim do período'} nada muda. Depois, criar e publicar param — e os links já publicados continuam abrindo.`
						: fim
							? `Período atual até ${fim}. A renovação é combinada com a equipe.`
							: 'Sem data de fim.',
					cta: 'Trocar de plano',
					ctaPrimario: false
				};
			case 'escola':
				return {
					tag: 'Escola',
					title: 'Plano da escola',
					sub: `seu acesso vem de ${a.escola?.nome ?? 'uma escola'}`,
					line: 'Os limites saem do contrato da escola, e a coordenação vê os números das suas turmas — nunca nomes de aluno nem respostas.',
					cta: null,
					ctaPrimario: false
				};
			case 'trial': {
				const dias = a.diasDeTrial;
				const prazo =
					dias === null
						? 'Você está no período de teste.'
						: dias <= 1
							? 'Falta 1 dia de teste.'
							: `Faltam ${dias} dias de teste.`;
				return {
					tag: 'Trial',
					title: 'Período de teste',
					sub: 'com os limites do plano Básico',
					line: `${prazo} Depois desse prazo, criar e publicar param até você escolher um plano. O que já estiver no ar continua no ar.`,
					cta: 'Escolher um plano',
					ctaPrimario: true
				};
			}
			case 'past_due':
				return {
					tag: 'Renovação pendente',
					title: 'O período acabou e a renovação ainda não chegou',
					sub: 'ainda liberado por alguns dias',
					line: 'Criar e publicar continuam funcionando durante a carência. Renove o plano para não pausar.',
					cta: 'Renovar o plano',
					ctaPrimario: true
				};
			case 'canceled':
				return {
					tag: 'Cancelada',
					title: 'Assinatura encerrada',
					sub: 'criar e publicar estão pausados',
					line: 'Nada foi apagado: suas atividades, materiais e resultados continuam aqui, e os links já publicados continuam abrindo.',
					cta: 'Escolher um plano',
					ctaPrimario: true
				};
			case 'expired':
				return {
					tag: 'Pausado',
					title: a.plano === null ? 'O período de teste acabou' : 'Seu plano venceu',
					sub: 'criar e publicar estão pausados',
					line: 'Nada foi apagado: suas atividades, materiais e resultados continuam aqui, e os links já publicados continuam abrindo e recebendo respostas.',
					cta: 'Escolher um plano',
					ctaPrimario: true
				};
		}
	});

	function estadoDaPorta(pode: boolean, motivo: string | null): string {
		if (pode) return 'liberado';
		if (motivo === 'criar' || motivo === 'materiais') return 'limite do plano';
		if (motivo === 'ia') return 'fora do plano';
		if (motivo === 'creditos') return 'sem créditos';
		return 'pausado';
	}

	// **O que está liberado sai de `can()`**, a mesma decisão que barra cada
	// botão. Os dois primeiros são sempre verdade por desenho de produto: a
	// cobrança mexe no lado do professor, nunca no do aluno.
	const liberacoes = $derived([
		{
			nome: 'Criar atividade nova',
			ok: data.acesso.pode.criarAtividade,
			estado: estadoDaPorta(data.acesso.pode.criarAtividade, data.acesso.motivo.criarAtividade)
		},
		{
			nome: 'Adicionar material',
			ok: data.acesso.pode.criarMaterial,
			estado: estadoDaPorta(data.acesso.pode.criarMaterial, data.acesso.motivo.criarMaterial)
		},
		{
			nome: 'Publicar mudanças',
			ok: data.acesso.pode.publicar,
			estado: estadoDaPorta(data.acesso.pode.publicar, data.acesso.motivo.publicar)
		},
		{
			nome: 'Gerar material com IA',
			ok: data.acesso.pode.usarIa,
			estado: estadoDaPorta(data.acesso.pode.usarIa, data.acesso.motivo.usarIa)
		}
	]);

	const usoLinhas = $derived([
		{
			nome: 'Atividades',
			usado: data.acesso.uso.atividades,
			limite: data.acesso.limites.atividades
		},
		{ nome: 'Materiais', usado: data.acesso.uso.materiais, limite: data.acesso.limites.materiais },
		...(data.acesso.limites.ia
			? [
					{
						nome: 'Créditos de IA (saldo)',
						usado: data.acesso.creditos.saldo,
						limite: data.acesso.limites.creditosPorCiclo
					}
				]
			: [])
	]);

	/**
	 * O uso em BLOCOS que dividem a linha: um por limite, com o número grande. No
	 * trial entra também um bloco dos dias que faltam — é o limite que mais
	 * importa naquela situação, e ele estava só numa frase.
	 */
	const blocosDeUso = $derived.by(() => {
		const blocos = usoLinhas.map((linha) => {
			const credito = linha.nome.startsWith('Créditos');
			const cheio = !credito && linha.usado >= linha.limite;
			return {
				nome: linha.nome,
				valor: String(linha.usado),
				de: `de ${linha.limite}`,
				fracao: fracaoDeUso(linha.usado, linha.limite),
				cheio,
				nota: cheio ? 'Chegou ao limite do plano — nada foi apagado, só não cabe outro.' : null
			};
		});
		const dias = data.acesso.diasDeTrial;
		if (estado === 'trial' && dias !== null) {
			blocos.push({
				nome: 'Dias de teste',
				valor: String(dias),
				de: `de ${TRIAL.dias}`,
				fracao: Math.max(0, Math.min(1, dias / TRIAL.dias)),
				cheio: false,
				nota: 'Depois, criar e publicar param até você escolher um plano.'
			});
		}
		return blocos;
	});

	const cartaoDoPlano: Record<Estado, string> = {
		active: 'border-line bg-card',
		escola: 'border-line bg-card',
		trial: 'border-line bg-card',
		past_due: 'border-warning/40 bg-warning/6',
		canceled: 'border-dashed border-line bg-card',
		expired: 'border-error/35 bg-error/6'
	};
	const pilulaDoPlano: Record<Estado, string> = {
		active: 'bg-base-300 text-primary',
		escola: 'bg-base-300 text-primary',
		trial: 'bg-base-300 text-primary',
		past_due: 'bg-warning/15 text-warning',
		canceled: 'bg-base-200 text-base-content/65',
		expired: 'bg-error/13 text-error'
	};

	let acaoPendente = $state<'pedido' | 'cancelar' | 'desfazer' | 'sair' | null>(null);
	let erroDeAcao = $state<string | null>(null);

	async function executar(qual: 'pedido' | 'cancelar' | 'desfazer' | 'sair') {
		acaoPendente = qual;
		erroDeAcao = null;
		try {
			const r =
				qual === 'pedido'
					? await cancelarPedido()
					: qual === 'cancelar'
						? await agendarCancelamento()
						: qual === 'sair'
							? await sairDaEscola()
							: await desfazerCancelamento();
			if ('error' in r && typeof r.error === 'string') erroDeAcao = r.error;
			await invalidateAll();
		} catch {
			erroDeAcao = 'Não deu para concluir agora. Tente de novo em instantes.';
		} finally {
			acaoPendente = null;
		}
	}
</script>

<svelte:head><title>Conta — Spokke</title></svelte:head>

{#snippet icone(d: string, classe = 'size-4')}
	<svg class="{classe} shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true"
		><path
			{d}
			stroke="currentColor"
			stroke-width="2"
			stroke-linecap="round"
			stroke-linejoin="round"
		/></svg
	>
{/snippet}

<div class="pagina-studio">
	<!-- O topo é o da conta, não o de uma aba: quem é, desde quando e o tamanho do
	     que já construiu — o mesmo cartão das telas de turma e de atividade. O
	     avatar mora AQUI, com as ações dele: é o que o aluno vê ao lado do nome. -->
	<HeaderCard numbers={numeros}>
		{#snippet badge()}
			<Avatar
				codigo={avatarNaTela}
				nome={data.teacher.name}
				size={64}
				radius="rounded-[16px]"
				class="border border-line"
			/>
		{/snippet}
		<h1
			class="mb-1.5 font-display text-[22px] font-semibold tracking-[-0.024em] break-words lg:text-[28px]"
		>
			{data.teacher.name}
		</h1>
		<!-- No celular, uma informação por linha: o e-mail longo quebrava no meio e o
		     separador começava a linha seguinte. -->
		<p
			class="grid gap-0.5 text-[13.5px] text-base-content/65 sm:flex sm:flex-wrap sm:items-center sm:gap-x-2.5"
		>
			<span class="[overflow-wrap:anywhere]">{data.teacher.email}</span>
			<span class="hidden sm:inline" aria-hidden="true">·</span>
			<span>no Spokke desde {desde}</span>
		</p>
		{#snippet actions()}
			<button
				type="button"
				onclick={abrirEditorDeAvatar}
				disabled={salvandoAvatar}
				class="btn h-[42px] motion-tap gap-2 btn-plain text-[13.5px] font-semibold"
			>
				{@render icone('M5 19h3l10-10-3-3L5 16z')}
				Montar avatar
			</button>
		{/snippet}
	</HeaderCard>
	{#if erroAvatar}
		<p class="-mt-4 mb-5 text-[13px] font-semibold text-error" role="alert">{erroAvatar}</p>
	{/if}

	<nav class="mb-6 flex gap-1 border-b border-line" aria-label="Seções da conta">
		<a
			href={resolve('/(studio)/conta')}
			aria-current={data.aba === 'dados' ? 'page' : undefined}
			class="-mb-px flex items-center gap-2 border-b-2 px-3.5 py-[11px] text-sm no-underline transition-colors
			       {data.aba === 'dados'
				? 'border-primary font-bold text-primary'
				: 'border-transparent font-semibold text-base-content/65 hover:text-base-content'}"
		>
			{@render icone('M12 12a4 4 0 100-8 4 4 0 000 8zM4 20.5c0-3.6 3.6-6 8-6s8 2.4 8 6')}
			Seus dados
		</a>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- é a própria rota resolvida mais a query da aba; a regra não enxerga a concatenação. -->
		<a
			href={resolve('/(studio)/conta') + '?aba=assinatura'}
			aria-current={data.aba === 'assinatura' ? 'page' : undefined}
			class="-mb-px flex items-center gap-2 border-b-2 px-3.5 py-[11px] text-sm no-underline transition-colors
			       {data.aba === 'assinatura'
				? 'border-primary font-bold text-primary'
				: 'border-transparent font-semibold text-base-content/65 hover:text-base-content'}"
		>
			{@render icone('M3 6h18v12H3zM3 10h18')}
			Assinatura
			{#if estado === 'past_due' || estado === 'expired' || data.pedido}
				<!-- O ponto é um chamado, não o estado: quem está na outra aba precisa
				     saber que a assinatura pede atenção. O texto está na aba. -->
				<span
					class="size-2 rounded-full {estado === 'past_due' || estado === 'expired'
						? 'bg-error'
						: 'bg-warning'}"
					aria-hidden="true"
				></span>
			{/if}
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</nav>

	{#if data.aba === 'dados'}
		<!-- Duas colunas no desktop: o que se edita à esquerda, o que se faz uma vez
		     na vida à direita. No celular, uma coluna, na mesma ordem. -->
		<div class="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
			<form
				method="POST"
				action="?/profile"
				use:enhance={() => {
					salvandoPerfil = true;
					return async ({ update }) => {
						await update({ reset: false });
						salvandoPerfil = false;
					};
				}}
				class="overflow-hidden rounded-[14px] border border-line bg-card"
			>
				<div class="grid gap-5 p-4 lg:p-6">
					<div>
						<h2 class="font-display text-[18px] font-semibold lg:text-[20px]">Seus dados</h2>
						<p class="mt-1 text-[13px] text-base-content/65">
							O nome aparece para os alunos nos convites que você envia.
						</p>
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<label class="grid content-start gap-1.5">
							<span class="text-[13px] font-semibold">Nome</span>
							<input
								name="name"
								value={data.teacher.name}
								required
								maxlength="120"
								autocomplete="name"
								class="input w-full"
							/>
						</label>
						<!-- O e-mail é TEXTO: como campo somente-leitura ele parecia editável. -->
						<div class="grid content-start gap-1.5">
							<span class="text-[13px] font-semibold">E-mail</span>
							<span
								class="flex min-h-11 items-center rounded-field border border-dashed border-line px-3 text-[14px] break-all"
								>{data.teacher.email}</span
							>
							<span class="text-[12px] text-base-content/65"
								>É o seu login. Para trocar, fale com a gente.</span
							>
						</div>
					</div>

					<fieldset class="border-0 p-0">
						<legend class="mb-1 text-[13px] font-semibold">Idiomas que você ensina</legend>
						<p class="mb-2.5 text-[12.5px] text-base-content/65">
							Viram o idioma padrão da atividade nova, da turma nova e da biblioteca. Não limitam
							nada.
						</p>
						<div class="flex flex-wrap gap-1.5">
							{#each IDIOMAS as idioma (idioma.tag)}
								<label class="cursor-pointer">
									<input
										type="checkbox"
										name="idiomas"
										value={idioma.tag}
										checked={data.teacher.idiomas.includes(idioma.tag)}
										class="peer sr-only"
									/>
									<span
										class="flex min-h-9 items-center gap-1.5 rounded-full border border-line bg-base-100 px-3 text-[12.5px] font-semibold text-base-content/75 transition-colors peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-content peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary hover:border-primary"
									>
										<span class="font-mono text-[10.5px] opacity-70">{idioma.codigo}</span>
										{idioma.rotulo}
									</span>
								</label>
							{/each}
						</div>
					</fieldset>

					<label class="grid max-w-[22rem] gap-1.5">
						<span class="text-[13px] font-semibold">Língua dos seus alunos</span>
						<select name="idiomaDosAlunos" class="select w-full">
							{#each IDIOMAS as idioma (idioma.tag)}
								<option value={idioma.tag} selected={idioma.tag === data.teacher.idiomaDosAlunos}
									>{idioma.rotulo}</option
								>
							{/each}
						</select>
						<span class="text-[12px] text-base-content/65"
							>Usada nas traduções e nos enunciados das atividades novas.</span
						>
					</label>
				</div>
				<div
					class="flex flex-wrap items-center gap-3 border-t border-line bg-base-200 px-4 py-3 lg:px-6"
				>
					<button
						type="submit"
						disabled={salvandoPerfil}
						class="btn min-h-10 motion-tap gap-2 btn-primary text-[13.5px] font-bold"
					>
						{#if salvandoPerfil}
							<Loading variant="fila" size={10} tone="current" label="Salvando" />
						{/if}
						Salvar alterações
					</button>
					{#if form?.erro}
						<p class="text-[13px] font-semibold text-error" role="alert">{form.erro}</p>
					{:else if form?.salvo}
						<p class="text-[13px] font-semibold text-primary" role="status">Alterações salvas.</p>
					{/if}
				</div>
			</form>

			<div class="grid gap-5">
				<section class="rounded-[14px] border border-line bg-card p-4 lg:p-6">
					<div class="mb-3 flex items-center gap-3">
						<span
							class="grid size-9 shrink-0 place-items-center rounded-field bg-base-300 text-primary"
						>
							{@render icone('M5.5 10.5h13v10h-13zM8 10.5V7.5a4 4 0 018 0v3')}
						</span>
						<h2 class="font-display text-[18px] font-semibold">Senha</h2>
					</div>
					{#if trocandoSenha}
						<!-- Abre NO cartão, como os formulários da turma: trocar a senha não
						     tira o professor da conta. -->
						<form onsubmit={trocarSenha} class="grid gap-3" novalidate>
							<label class="grid gap-1.5">
								<span class="text-[12.5px] font-bold">Senha atual</span>
								<input
									bind:this={campoSenhaAtual}
									bind:value={senhaAtual}
									type="password"
									autocomplete="current-password"
									required
									disabled={salvandoSenha}
									class="input w-full"
								/>
							</label>
							<label class="grid gap-1.5">
								<span class="text-[12.5px] font-bold">Senha nova</span>
								<input
									bind:value={senhaNova}
									type="password"
									autocomplete="new-password"
									minlength="8"
									required
									disabled={salvandoSenha}
									aria-describedby="senha-nova-dica"
									class="input w-full"
								/>
								<span id="senha-nova-dica" class="text-[12px] text-base-content/60"
									>Ao menos 8 caracteres.</span
								>
							</label>
							<label class="grid gap-1.5">
								<span class="text-[12.5px] font-bold">Repita a senha nova</span>
								<input
									bind:value={senhaConfirma}
									type="password"
									autocomplete="new-password"
									required
									disabled={salvandoSenha}
									aria-invalid={senhasDiferentes}
									class="input w-full {senhasDiferentes ? 'input-error' : ''}"
								/>
								{#if senhasDiferentes}
									<span class="text-[12px] font-semibold text-error">As duas não são iguais.</span>
								{/if}
							</label>
							{#if erroSenha}
								<p class="text-[13px] font-semibold text-error" role="alert">{erroSenha}</p>
							{/if}
							<div class="flex flex-wrap gap-2">
								<button
									type="submit"
									disabled={!senhaPronta || salvandoSenha}
									class="btn min-h-11 flex-1 motion-tap gap-2 btn-primary font-bold"
								>
									{#if salvandoSenha}
										<Loading variant="fila" size={10} tone="current" label="Trocando a senha" />
									{/if}
									Salvar nova senha
								</button>
								<button
									type="button"
									onclick={cancelarTrocaDeSenha}
									disabled={salvandoSenha}
									class="btn min-h-11 motion-tap btn-plain font-semibold">Cancelar</button
								>
							</div>
							<a href={resolve('/(auth)/esqueci-senha')} class="text-[12.5px] font-semibold"
								>Esqueceu a senha atual?</a
							>
						</form>
					{:else}
						<p class="mb-4 text-[13px] leading-relaxed text-pretty text-base-content/65">
							Trocar desconecta a conta dos outros navegadores e celulares. Aqui você continua
							conectado.
						</p>
						{#if senhaTrocada}
							<p class="mb-3 text-[13px] font-semibold text-primary" role="status">
								Senha trocada. Os outros aparelhos foram desconectados.
							</p>
						{/if}
						<button
							type="button"
							onclick={abrirTrocaDeSenha}
							class="btn min-h-11 w-full motion-tap btn-neutral font-semibold">Trocar senha</button
						>
					{/if}
				</section>

				<section class="rounded-[14px] border border-error/30 bg-card p-4 lg:p-6">
					<div class="mb-3 flex items-center gap-3">
						<span
							class="grid size-9 shrink-0 place-items-center rounded-field bg-error/10 text-error"
						>
							{@render icone('M6 7h12M9.5 7V5h5v2M8 7l.8 12h6.4L16 7')}
						</span>
						<h2 class="font-display text-[18px] font-semibold text-error">Encerrar conta</h2>
					</div>
					<p class="mb-4 text-[13px] leading-relaxed text-pretty text-base-content/65">
						Apaga sua conta, seus materiais e seus rascunhos — não tem volta. O que acontece com os
						links já publicados ainda não foi decidido; antes de encerrar, esta tela vai dizer.
					</p>
					<button type="button" class="btn min-h-11 w-full motion-tap btn-outline-error font-bold">
						Encerrar minha conta
					</button>
				</section>
			</div>
		</div>
	{:else}
		{#if data.checkout}
			<!-- A volta do checkout: o que o Mercado Pago respondeu AGORA. Voltar não
			     é pagar (paginas.md "Cobrança não afeta o aluno") — enquanto ele não
			     autoriza, a tela diz "confirmando", não "ativo". Nunca em verde. -->
			<div
				class="mb-5 flex flex-wrap items-start gap-3 rounded-[14px] border px-4 py-4 lg:px-6 {data
					.checkout.status === 'authorized'
					? 'border-primary/40 bg-primary/6'
					: data.checkout.status === 'pending'
						? 'border-warning/40 bg-warning/6'
						: 'border-line bg-base-200'}"
				role="status"
			>
				{#if data.checkout.status === 'pending'}
					<Loading variant="traco" size={24} tone="current" label="Confirmando o pagamento" />
				{/if}
				<div class="min-w-[220px] flex-1">
					{#if data.checkout.status === 'authorized'}
						<p class="mb-1 text-[13.5px] font-bold">Pagamento confirmado</p>
						<p class="text-[12.5px] leading-relaxed text-base-content/65">
							O Mercado Pago autorizou a assinatura do plano {data.checkout.plano}. Ele já vale.
						</p>
					{:else if data.checkout.status === 'pending'}
						<p class="mb-1 text-[13.5px] font-bold">Confirmando o pagamento com o Mercado Pago</p>
						<p class="text-[12.5px] leading-relaxed text-base-content/65">
							Assim que ele confirmar, o plano {data.checkout.plano} libera sozinho — costuma levar poucos
							minutos. Até lá a conta segue como está.
						</p>
					{:else}
						<p class="mb-1 text-[13.5px] font-bold">O pagamento não foi concluído</p>
						<p class="text-[12.5px] leading-relaxed text-base-content/65">
							O Mercado Pago não autorizou a assinatura. Nada mudou na sua conta — dá para tentar de
							novo pelos planos.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if data.pedido}
			<!-- O pedido é o "confirmando" de quando não há gateway: escolher um plano
			     não libera nada sozinho — a equipe combina o pagamento e ativa pelo
			     painel (docs/adr-002-billing.md). -->
			<div
				class="mb-5 flex flex-wrap items-start gap-3 rounded-[14px] border border-warning/40 bg-warning/6 px-4 py-4 lg:px-6"
				role="status"
			>
				<Loading variant="traco" size={24} tone="current" label="Pedido aguardando a equipe" />
				<div class="min-w-[220px] flex-1">
					<p class="mb-1 text-[13.5px] font-bold">
						Pedido do plano {data.pedido.plano} ({data.pedido.ciclo}) enviado
					</p>
					<p class="text-[12.5px] leading-relaxed text-base-content/65">
						A equipe vai falar com você no seu e-mail para combinar o pagamento. O plano é ativado
						assim que ela confirmar — até lá a conta segue como está.
					</p>
				</div>
				<button
					type="button"
					onclick={() => executar('pedido')}
					disabled={acaoPendente !== null}
					class="btn min-h-11 w-full motion-tap gap-2 btn-plain font-semibold lg:w-auto"
				>
					{#if acaoPendente === 'pedido'}
						<Loading variant="fila" size={10} tone="current" label="Cancelando" />
					{/if}
					Cancelar pedido
				</button>
			</div>
		{/if}

		<!-- o plano: largura inteira, porque é a resposta da aba -->
		<section class="mb-7 overflow-hidden rounded-[14px] border {cartaoDoPlano[estado]}">
			<div
				class="grid gap-4 p-4 sm:grid-cols-[auto_minmax(0,1fr)] lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:gap-x-6 lg:p-6"
			>
				<span
					class="grid size-12 shrink-0 place-items-center rounded-[13px] {pilulaDoPlano[estado]}"
				>
					{@render icone(
						estado === 'past_due' || estado === 'expired'
							? 'M12 4.5l8 14.5H4zM12 10v3.4M12 16.3v.1'
							: estado === 'canceled'
								? 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM6 6l12 12'
								: estado === 'trial'
									? 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM12 7.5V12l3 2'
									: 'M12 20.5a8.5 8.5 0 100-17 8.5 8.5 0 000 17zM8.5 12.2l2.4 2.4 4.6-4.9',
						'size-6'
					)}
				</span>
				<div class="min-w-0">
					<div class="mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
						<h2 class="font-display text-[22px] font-semibold tracking-[-0.022em]">
							{desenho.title}
						</h2>
						<span
							class="inline-flex items-center rounded-full px-[11px] py-[5px] text-xs font-bold {pilulaDoPlano[
								estado
							]}">{desenho.tag}</span
						>
					</div>
					<p class="max-w-[70ch] text-[13.5px] leading-relaxed text-pretty text-base-content/65">
						{desenho.line}
					</p>
				</div>
				{#if desenho.cta}
					<!-- Escolher plano é uma tela nossa: não depende de gateway. -->
					<a
						href={resolve('/(site)/planos')}
						class="btn min-h-11 w-full motion-tap font-bold no-underline sm:col-span-2 lg:col-span-1 lg:w-auto {desenho.ctaPrimario
							? 'btn-primary'
							: 'btn-outline'}">{desenho.cta}</a
					>
				{/if}
			</div>

			{#if (estado === 'active' && data.acesso.origem === 'assinatura') || estado === 'escola'}
				<div
					class="flex flex-wrap items-center gap-3 border-t border-line bg-base-200/60 px-4 py-3.5 lg:px-6"
				>
					<p class="min-w-[220px] flex-1 text-[12.5px] leading-relaxed text-base-content/65">
						{#if estado === 'escola'}
							Sair da escola não leva nada seu: atividades, materiais e resultados ficam aqui. Você
							volta ao seu plano próprio.
						{:else if data.acesso.cancelAtPeriodEnd}
							O cancelamento está agendado. Mudou de ideia? Desfaça e o plano segue renovando.
						{:else}
							Cancelar vale para o fim do período: até lá nada muda, e nada é apagado depois.
						{/if}
					</p>
					{#if estado === 'escola'}
						<button
							type="button"
							onclick={() => executar('sair')}
							disabled={acaoPendente !== null}
							class="btn min-h-11 w-full motion-tap gap-2 btn-outline-error font-semibold sm:w-auto"
						>
							{#if acaoPendente === 'sair'}
								<Loading variant="fila" size={10} tone="current" label="Saindo" />
							{/if}
							Sair da escola
						</button>
					{:else if data.acesso.cancelAtPeriodEnd && !data.cobranca.podeDesfazerCancelamento}
						<!-- No Mercado Pago a assinatura cancelada não volta: o caminho é assinar de novo. -->
						<a
							href={resolve('/(site)/planos')}
							class="btn min-h-11 w-full motion-tap btn-plain font-semibold no-underline sm:w-auto"
							>Assinar de novo</a
						>
					{:else}
						<button
							type="button"
							onclick={() => executar(data.acesso.cancelAtPeriodEnd ? 'desfazer' : 'cancelar')}
							disabled={acaoPendente !== null}
							class="btn min-h-11 w-full motion-tap gap-2 font-semibold sm:w-auto {data.acesso
								.cancelAtPeriodEnd
								? 'btn-plain'
								: 'btn-outline-error'}"
						>
							{#if acaoPendente === 'cancelar' || acaoPendente === 'desfazer'}
								<Loading variant="fila" size={10} tone="current" label="Salvando" />
							{/if}
							{data.acesso.cancelAtPeriodEnd
								? 'Desfazer cancelamento'
								: 'Cancelar no fim do período'}
						</button>
					{/if}
				</div>
			{/if}
			{#if erroDeAcao}
				<p class="px-4 pb-3.5 text-[12.5px] font-semibold text-error lg:px-6" role="alert">
					{erroDeAcao}
				</p>
			{/if}
		</section>

		<!-- o uso: blocos que dividem a linha, um por limite -->
		<section class="mb-7">
			<div class="mb-3 flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
				<h2 class="font-display text-[18px] font-semibold lg:text-[20px]">Seu uso agora</h2>
				<span class="text-[13px] text-base-content/65"
					>conta o que existe hoje — arquivar ou apagar libera a vaga</span
				>
			</div>
			<ul class="grid list-none grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] gap-3 p-0">
				{#each blocosDeUso as bloco (bloco.nome)}
					<li class="rounded-[14px] border border-line bg-card px-4 py-4 lg:px-5">
						<p class="mb-2 text-[13px] font-semibold text-base-content/70">{bloco.nome}</p>
						<p class="mb-3 flex items-baseline gap-1.5">
							<span
								class="font-display text-[30px] leading-none font-extrabold tracking-[-0.03em] {bloco.cheio
									? 'text-error'
									: ''}">{bloco.valor}</span
							>
							<span class="text-[13px] text-base-content/65">{bloco.de}</span>
						</p>
						<div class="h-[6px] overflow-hidden rounded-full bg-base-300" aria-hidden="true">
							<div
								class="h-full origin-left rounded-full {bloco.cheio ? 'bg-error' : 'bg-primary'}"
								style="transform: scaleX({bloco.fracao})"
							></div>
						</div>
						{#if bloco.nota}
							<p
								class="mt-2 text-[12px] {bloco.cheio
									? 'font-semibold text-error'
									: 'text-base-content/65'}"
							>
								{bloco.nota}
							</p>
						{/if}
					</li>
				{/each}
			</ul>
		</section>

		<!-- o que pode e o que mudou: lado a lado no desktop -->
		<div class="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
			<section class="rounded-[14px] border border-line bg-card p-4 lg:p-6">
				<h2 class="font-display text-[18px] font-semibold">O que você pode fazer</h2>
				<!-- Links e respostas eram duas linhas sempre verdes: viraram esta frase,
				     que é o que elas diziam. -->
				<p class="mt-1 mb-4 text-[13px] text-pretty text-base-content/65">
					Links já publicados e respostas dos alunos nunca param, seja qual for a situação da
					assinatura.
				</p>
				<ul class="grid list-none gap-2 p-0 sm:grid-cols-2">
					{#each liberacoes as item (item.nome)}
						<li class="flex items-center gap-3 rounded-field bg-base-200 px-3 py-2.5">
							<span
								class="grid size-7 shrink-0 place-items-center rounded-[9px] {item.ok
									? 'bg-base-300 text-primary'
									: 'bg-error/13 text-error'}"
							>
								{@render icone(item.ok ? 'M5 12.5l4.5 4.5L19 7' : 'M6 6l12 12M18 6L6 18')}
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-[13.5px] font-semibold">{item.nome}</span>
								<!-- Texto E ícone: a cor sozinha não diz liberado/bloqueado. -->
								<span
									class="block text-[12px] {item.ok
										? 'text-base-content/65'
										: 'font-bold text-error'}">{item.estado}</span
								>
							</span>
						</li>
					{/each}
				</ul>
			</section>

			<section class="rounded-[14px] border border-line bg-card p-4 lg:p-6">
				<h2 class="font-display text-[18px] font-semibold">Histórico</h2>
				<p class="mt-1 mb-4 text-[13px] text-base-content/65">O que mudou na sua assinatura.</p>
				<!-- Não há gateway, então não há fatura para listar — inventar uma seria
				     mostrar cobrança que não aconteceu. O que existe de verdade é o registro
				     de cada mudança (`AuditEvent`), do mais recente ao mais antigo. -->
				<ol class="grid list-none gap-0 p-0">
					{#each data.historico as evento (evento.id)}
						<li
							class="relative grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 pb-4 before:absolute before:start-[5px] before:top-3 before:bottom-0 before:w-px before:bg-line last:pb-0 last:before:hidden"
						>
							<span class="mt-1.5 size-[11px] rounded-full border-2 border-primary bg-card"></span>
							<span class="min-w-0">
								<span class="block text-[13.5px] font-semibold">{evento.texto}</span>
								<span class="font-mono text-[12px] text-base-content/65"
									>{new Date(evento.quando).toLocaleDateString('pt-BR')}</span
								>
							</span>
						</li>
					{:else}
						<li class="text-[13.5px] text-base-content/65">Nada mudou na sua assinatura ainda.</li>
					{/each}
				</ol>
			</section>
		</div>
	{/if}
</div>

<AvatarEditor bind:codigo={codigoDoAvatar} bind:aberto={editorDeAvatarAberto} onusar={usarAvatar} />
