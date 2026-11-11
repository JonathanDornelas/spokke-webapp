<script lang="ts">
	import Metadados from '$lib/components/Metadados.svelte';
	// Planos e preços. Página pública de comparação E destino de quem bateu numa
	// porta fechada (`?motivo=`) — o loader explica os dois papéis.
	//
	// **Chegando por um bloqueio, a primeira coisa é o motivo, não a tabela.**
	// Cair numa página de preços sem entender o que se pediu tem uma leitura só,
	// e é a pior: "quebrou e me jogou na cobrança". O aviso diz também o que
	// NÃO se perdeu — o rascunho continua salvo, os links continuam no ar.
	//
	// **Sem gateway** (docs/adr-002-billing.md), escolher um plano logado registra
	// um PEDIDO e avisa a equipe, que combina o pagamento e ativa pelo painel
	// interno. **Com o Mercado Pago**, escolher abre o checkout — e, para quem já
	// paga um plano por ele, escolher outro é TROCAR: ciclo novo com o valor cheio
	// e a parte não usada do plano atual de volta no cartão (billing.md "Troca de
	// plano"). Cada cartão diz o que o clique faz. Nada aqui libera acesso
	// sozinho.
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import PlanosTabela from '$lib/components/PlanosTabela.svelte';
	import SiteHero from '$lib/components/SiteHero.svelte';
	import {
		ledePadrao,
		tituloPadrao,
		type CicloDeCobranca,
		type PlanoId
	} from '$lib/content/planos';
	import { MOTIVOS_DE_LIMITE, type MotivoDoBloqueio } from '$lib/billing/motivos';
	import { ehPlanoPago } from '$lib/billing/catalogo';
	import type { ResumoDoAcesso } from '$lib/billing/resumo';
	import type { PlanoEmVigor } from '$lib/billing/troca';
	import { solicitarPlano } from '../../(studio)/conta/conta.remote';

	interface PageData {
		motivo: MotivoDoBloqueio | null;
		motivos: Record<MotivoDoBloqueio, { titulo: string; texto: string }>;
		planoAtual: PlanoId | null;
		acesso: ResumoDoAcesso | null;
		pedido: { id: PlanoId; nome: string; ciclo: string } | null;
		logado: boolean;
		/** O Mercado Pago está ligado: escolher abre o checkout, não um pedido. */
		gateway: boolean;
		planoEmVigor: PlanoEmVigor | null;
		contaDaEquipe: boolean;
	}

	let { data }: { data: PageData } = $props();

	const aviso = $derived(data.motivo ? data.motivos[data.motivo] : null);

	/** "Seu plano permite N; você tem M" — só nos motivos que são LIMITE. */
	const limiteNaTela = $derived.by(() => {
		const a = data.acesso;
		if (!a || !data.motivo || !MOTIVOS_DE_LIMITE.includes(data.motivo)) return null;
		if (data.motivo === 'criar') {
			return `Seu plano permite ${a.limites.atividades} atividades ao mesmo tempo, e você tem ${a.uso.atividades}.`;
		}
		if (data.motivo === 'materiais') {
			return `Seu plano permite ${a.limites.materiais} materiais na biblioteca, e você tem ${a.uso.materiais}.`;
		}
		return `Seu plano tem ${a.limites.creditosPorCiclo} créditos por mês, e o saldo deste ciclo é ${a.creditos.saldo}.`;
	});

	/**
	 * O bloqueio NÃO é de cobrança: a conta pode publicar e o motivo não é limite.
	 * Aí não é hora de vender nada — o caminho é voltar ao painel.
	 */
	const naoEhCobranca = $derived(
		!!data.acesso &&
			!!data.motivo &&
			!MOTIVOS_DE_LIMITE.includes(data.motivo) &&
			data.motivo !== 'ia' &&
			data.acesso.pode.publicar
	);

	let pedidoEnviado = $state<string | null>(null);
	let erroDoPedido = $state<string | null>(null);

	async function escolher(plano: PlanoId, ciclo: CicloDeCobranca) {
		erroDoPedido = null;
		if (!ehPlanoPago(plano)) return;
		try {
			const r = await solicitarPlano({ plano, ciclo });
			if (r.tipo === 'redirecionar') {
				// Gateway: segue para o checkout. A confirmação vem pelo webhook.
				window.location.assign(r.url);
				return;
			}
			if (r.tipo === 'erro') {
				erroDoPedido = r.mensagem;
				return;
			}
			pedidoEnviado = plano;
			await invalidateAll();
		} catch {
			erroDoPedido = data.gateway
				? 'O Mercado Pago não abriu o pagamento agora. Tente de novo em instantes.'
				: 'Não deu para enviar o pedido agora. Tente de novo em instantes.';
		}
	}
</script>

<Metadados
	titulo="Planos do Spokke"
	descricao="Básico, Pro, Super e Scholar para escolas. Um preço por professor, o aluno nunca paga, e toda conta começa com 14 dias de teste grátis."
	tituloDaAba="Planos e preços · Spokke"
/>

<SiteHero eyebrow="Planos e preços" title={tituloPadrao} lede={ledePadrao} />

<main class="mx-auto w-full max-w-[1100px] px-gutter py-gutter">
	{#if aviso}
		<!-- O motivo vem ANTES de tudo, e diz o que continua de pé. -->
		<div
			class="mb-8 flex flex-wrap gap-x-4 gap-y-3 rounded-box border border-s-[3px] border-line border-s-primary bg-base-200 px-4 py-4 lg:px-5 lg:py-[18px]"
			role="status"
		>
			<svg
				class="mt-0.5 size-[22px] shrink-0 self-start text-primary"
				viewBox="0 0 24 24"
				fill="none"
				aria-hidden="true"
			>
				<rect x="5" y="10.5" width="14" height="10" rx="2" stroke="currentColor" stroke-width="2" />
				<path
					d="M8 10.5V7.5a4 4 0 018 0v3"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
			<div class="min-w-[240px] flex-1">
				<h2 class="mb-1.5 font-display text-[17px] font-semibold tracking-[-0.018em] text-pretty">
					{aviso.titulo}
				</h2>
				<p class="max-w-[76ch] text-[13.5px] leading-relaxed text-pretty text-base-content/65">
					{aviso.texto}
				</p>
				{#if limiteNaTela}
					<p class="mt-2 font-mono text-[13px] font-semibold">{limiteNaTela}</p>
				{/if}
				{#if data.motivo === 'criar'}
					<p class="mt-3 text-[13px] leading-relaxed text-pretty">
						<a href={resolve('/(studio)/atividades')} class="font-bold">Ver minhas atividades</a> para
						arquivar uma que já foi usada.
					</p>
				{:else if data.motivo === 'materiais'}
					<p class="mt-3 text-[13px] leading-relaxed text-pretty">
						<a href={resolve('/(studio)/materiais')} class="font-bold">Abrir a biblioteca</a> para liberar
						espaço.
					</p>
				{/if}

				{#if naoEhCobranca}
					<p class="mt-3 text-[13px] leading-relaxed text-pretty">
						Seu plano está em dia: este bloqueio não é de cobrança.
						<a href={resolve('/(studio)/atividades')} class="font-bold">Voltar para as atividades</a
						>
						ou
						<a href={resolve('/(site)/contato')} class="font-bold">falar com a gente</a>.
					</p>
				{/if}
			</div>
		</div>
	{/if}

	{#if data.pedido || pedidoEnviado}
		<div
			class="mb-6 rounded-box border border-warning/40 bg-warning/6 px-4 py-3.5 text-[13.5px] leading-relaxed lg:px-5"
			role="status"
		>
			<strong>Pedido do plano {data.pedido?.nome ?? ''} enviado.</strong>
			A equipe vai falar com você no seu e-mail para combinar o pagamento, e o plano é ativado assim que
			ela confirmar. Mudou de ideia? Escolha outro plano abaixo, ou cancele o pedido em
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query da aba; a regra não enxerga a concatenação. -->
			<a href={resolve('/(studio)/conta') + '?aba=assinatura'} class="font-bold">Conta</a>.
		</div>
	{/if}
	{#if erroDoPedido}
		<p class="mb-6 text-[13.5px] font-semibold text-error" role="alert">{erroDoPedido}</p>
	{/if}

	<!-- O cabeçalho da tabela seria o segundo título igual na mesma tela: o
	     `SiteHero` acima já diz o mesmo. Só o seletor de ciclo faz falta, e ele
	     vem dentro do cabeçalho — por isso ele fica, e o título não se repete. -->
	<PlanosTabela
		planoAtual={data.planoAtual}
		titulo="Escolha o seu ciclo"
		lede=""
		onescolher={data.logado ? escolher : undefined}
		pedidoPendente={data.pedido?.id ?? null}
		gateway={data.gateway}
		planoEmVigor={data.planoEmVigor}
		contaDaEquipe={data.contaDaEquipe}
	/>

	<!-- Quem não tem conta ainda: o caminho de sempre, que não passa por preço
	     nenhum. Responder nunca exigiu conta, e criar começa pelo teste. -->
	{#if !data.logado}
		<div
			class="mt-[18px] rounded-[14px] border border-dashed border-line px-5 py-[18px] text-center"
		>
			<p class="mb-1.5 text-sm font-bold">Ainda dá para experimentar sem decidir nada</p>
			<p
				class="mx-auto mb-3.5 max-w-[62ch] text-[13px] leading-relaxed text-pretty text-base-content/65"
			>
				Toda conta nova começa com 14 dias de teste grátis. Você monta atividades, manda o link para
				a turma, vê o resultado e decide depois.
			</p>
			<a
				href={resolve('/(auth)/cadastro')}
				class="btn min-h-11 motion-tap btn-primary font-bold no-underline">Criar minha conta</a
			>
		</div>
	{/if}

	<p class="mt-6 text-center text-[12.5px] leading-relaxed text-pretty text-base-content/65">
		Dúvida sobre qual plano serve para a sua escola?
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- rota resolvida mais a query do assunto; a regra não enxerga a concatenação. -->
		<a href={resolve('/(site)/contato') + '?assunto=escolas'} class="font-semibold"
			>Fale com a gente</a
		>, e a gente responde com uma proposta pelo número de professores.
	</p>
</main>
