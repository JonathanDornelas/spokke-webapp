import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { contaAluno, tentativasSoltas } from '$lib/server/db/repos/student-accounts';
import { publicationSettingsSchema } from '$lib/server/player/settings';
import { labelForTag } from '$lib/kernel/language/profiles';
import { nivelOuNulo } from '$lib/atividades/nivel';
import { etiquetaDaTurma } from '$lib/server/turmas/etiqueta';
import { rotuloDoItem } from '$lib/server/player/rotulo';
import { gradingSchema, interactionSchema, promptSchema } from '$lib/kernel/item';
import { duracao, haQuantoTempo, ordinal } from '$lib/tempo';
import { mapasDoAluno } from '$lib/server/db/repos/mapa-aluno';
import { googleLigado } from '$lib/server/auth/google';

/**
 * A área do aluno: o histórico dele, como ele vem indo, e as turmas de que faz
 * parte.
 *
 * Sem sessão o caminho é a tela de entrar, não um 401: quem chega aqui é um
 * aluno, e um erro seco no meio do caminho não diz o que fazer. `requireAluno`
 * fica para as escritas.
 *
 * **Onde o professor desligou o resultado, NADA de acerto entra** — nem na
 * linha daquela atividade, nem nas estatísticas, nem no "por habilidade". A
 * conta guarda o histórico; ela não contorna o interruptor do professor. É por
 * isso que quase tudo aqui é calculado sobre `comPlacar`, não sobre a lista
 * inteira.
 */
export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.aluno) redirect(303, '/entrar?como=aluno&voltar=/aluno');
	const conta = contaAluno({ id: locals.aluno.id });

	const anonId = cookies.get('spokke_anon');
	const [fichas, historico, soltas, mapas, formasDeEntrar] = await Promise.all([
		conta.fichas(),
		conta.historico(),
		// O convite de adotar só existe quando há algo solto NESTE aparelho —
		// sem isso ele seria um botão permanente oferecendo o que não há.
		anonId ? tentativasSoltas(anonId) : Promise.resolve(0),
		// Os módulos das turmas desta conta — o bloco "Seus módulos"
		// (docs/telas-modulos-aluno.md 1). Só existe para quem tem ficha ligada.
		mapasDoAluno({ id: locals.aluno.id }).todos(),
		conta.formasDeEntrar()
	]);

	// Qual tentativa é cada uma, POR ATIVIDADE. `historico` vem em ordem
	// decrescente, então a contagem é feita do fim para o começo: a mais antiga
	// daquele link é a 1ª. Sem isto toda linha se dizia "1ª tentativa", e quem
	// refez uma atividade três vezes via três primeiras.
	const ordemNoLink = new Map<string, number>();
	const numeroDaTentativa = new Map<string, number>();
	for (const tentativa of [...historico].reverse()) {
		const slug = tentativa.publication.slug;
		const n = (ordemNoLink.get(slug) ?? 0) + 1;
		ordemNoLink.set(slug, n);
		numeroDaTentativa.set(tentativa.id, n);
	}

	const tentativas = historico.map((tentativa) => {
		const versao = tentativa.publication.activityVersion;
		const placar = { correct: 0, partial: 0, incorrect: 0 };
		for (const resposta of tentativa.items) {
			if (resposta.score >= 1) placar.correct++;
			else if (resposta.score > 0) placar.partial++;
			else placar.incorrect++;
		}
		const respondidas = tentativa.items.length;
		// O professor pode ter desligado o feedback: nesse caso o aluno vê que
		// respondeu e quanto fez, mas não a nota — a mesma regra do fim da
		// atividade, e não é a área da conta que vai contorná-la.
		const settings = publicationSettingsSchema.parse(tentativa.publication.settings);

		const msSomados = tentativa.items.reduce((total, r) => total + r.ms, 0);
		const terminada = !!tentativa.finishedAt;

		return {
			id: tentativa.id,
			slug: tentativa.publication.slug,
			title: versao.activity.title,
			teacher: versao.activity.teacher.name,
			language:
				labelForTag(versao.activity.targetLang) +
				(nivelOuNulo(versao.activity.level) ? ` · ${versao.activity.level}` : ''),
			when: haQuantoTempo(tentativa.startedAt),
			finished: terminada,
			answered: respondidas,
			itemCount: versao._count.items,
			showResult: settings.showResult,
			score: settings.showResult ? placar : null,
			percent:
				settings.showResult && respondidas > 0
					? Math.round((placar.correct / respondidas) * 100)
					: null,
			/** O detalhe que a linha abre: tempo e em que ponto ela parou. */
			tempo: msSomados > 0 ? duracao(msSomados) : null,
			// "parou na 6ª questão" diz mais que "não terminou": o aluno sabe onde
			// retomar, e é a informação que o botão de continuar usa.
			estado: terminada
				? `${ordinal(numeroDaTentativa.get(tentativa.id) ?? 1)} tentativa`
				: `parou na ${ordinal(Math.max(1, respondidas + 1))} questão`,
			/** Só de quem tem placar — a barra do detalhe. */
			barra: settings.showResult ? placar : null
		};
	});

	// ── como ele vem indo ────────────────────────────────────────────────
	// Tudo daqui para baixo é só das atividades com resultado LIBERADO. As
	// outras contam como feitas, nunca como nota.
	const comPlacar = tentativas.filter((t) => t.percent !== null);
	const media = (ns: number[]) =>
		ns.length > 0 ? Math.round(ns.reduce((a, b) => a + b, 0) / ns.length) : null;

	const percentuais = comPlacar.map((t) => t.percent as number);
	const acertoMedio = media(percentuais);

	// A TENDÊNCIA das últimas três contra as três anteriores. `historico` vem em
	// ordem decrescente, então as "últimas" são as primeiras da lista. Só existe
	// com seis atividades com placar: comparar uma com uma seria ruído.
	const ultimasTres = media(percentuais.slice(0, 3));
	const tresAnteriores = media(percentuais.slice(3, 6));
	const tendencia =
		ultimasTres !== null && tresAnteriores !== null ? ultimasTres - tresAnteriores : null;

	const terminadas = tentativas.filter((t) => t.finished);
	const msPorAtividade = historico
		.filter((t) => t.finishedAt)
		.map((t) => t.items.reduce((total, r) => total + r.ms, 0))
		.filter((ms) => ms > 0);
	const tempoMedio = msPorAtividade.length > 0 ? media(msPorAtividade) : null;

	// Semanas SEGUIDAS com pelo menos uma atividade, contando de trás para a
	// frente a partir desta semana. Uma semana vazia encerra a sequência — é o
	// que a palavra "seguidas" quer dizer, e inflar isso tiraria o sentido dela.
	const semanas = new Set(
		historico.map((t) => {
			const d = t.startedAt;
			// Segunda-feira da semana daquela tentativa, como carimbo único.
			const segunda = new Date(d);
			segunda.setHours(0, 0, 0, 0);
			segunda.setDate(segunda.getDate() - ((segunda.getDay() + 6) % 7));
			return segunda.getTime();
		})
	);
	const UMA_SEMANA = 7 * 24 * 60 * 60 * 1000;
	const estaSemana = (() => {
		const d = new Date();
		d.setHours(0, 0, 0, 0);
		d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
		return d.getTime();
	})();
	let seguidas = 0;
	// Começa na semana passada se esta ainda está vazia: quem estudou ontem não
	// perde a sequência por ser segunda-feira de manhã.
	let cursor = semanas.has(estaSemana) ? estaSemana : estaSemana - UMA_SEMANA;
	while (semanas.has(cursor)) {
		seguidas++;
		cursor -= UMA_SEMANA;
	}

	// ── por habilidade, somando tudo ─────────────────────────────────────
	const porRotulo = new Map<string, { correct: number; partial: number; total: number }>();
	for (const tentativa of historico) {
		const settings = publicationSettingsSchema.parse(tentativa.publication.settings);
		if (!settings.showResult) continue;

		for (const resposta of tentativa.items) {
			const grading = gradingSchema.parse(resposta.item.grading);
			// Rubrica sem nota do professor não tem veredito: contar como não-acerto
			// reprovaria o aluno por uma fila que não é dele.
			if (grading.mode === 'rubric') continue;

			const prompt = promptSchema.parse(resposta.item.prompt);
			const interaction = interactionSchema.parse(resposta.item.interaction);
			const rotulo = rotuloDoItem(prompt, interaction.type, grading.mode);

			const linha = porRotulo.get(rotulo) ?? { correct: 0, partial: 0, total: 0 };
			linha.total++;
			if (resposta.score >= 1) linha.correct++;
			else if (resposta.score > 0) linha.partial++;
			porRotulo.set(rotulo, linha);
		}
	}

	const habilidades = [...porRotulo.entries()]
		.map(([name, n]) => ({
			name,
			correct: n.correct,
			partial: n.partial,
			total: n.total,
			tag:
				n.correct === n.total
					? ('firme' as const)
					: n.correct + n.partial >= n.total
						? ('quase lá' as const)
						: ('vale voltar' as const)
		}))
		.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));

	return {
		account: {
			name: locals.aluno.name,
			email: locals.aluno.email,
			avatar: locals.aluno.avatar ?? null
		},
		/** Como a conta entra, e se o login com o Google está ligado no servidor. */
		login: { googleDisponivel: googleLigado(), ...formasDeEntrar },
		classrooms: fichas.map((ficha) => ({
			id: ficha.id,
			classroom: ficha.classroom.name,
			badge: etiquetaDaTurma(ficha.classroom.name),
			color: ficha.classroom.color,
			teacher: ficha.teacher.name
		})),
		attempts: tentativas,
		totals: {
			attempts: tentativas.length,
			finished: terminadas.length
		},
		/** Quantas tentativas deste aparelho ainda não são de conta nenhuma. */
		soltas,
		stats: {
			acertoMedio,
			comPlacar: comPlacar.length,
			tendencia,
			tempoMedio: tempoMedio === null ? null : duracao(tempoMedio),
			semanasSeguidas: seguidas
		},
		habilidades,
		modulos: mapas
	};
};
