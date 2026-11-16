import type { Item } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import {
	habilidadeDaQuestao,
	type CorpoDaResumida,
	type HabilidadeDaResumida,
	type QuestaoResumida
} from '$lib/atividades/questao-resumida';

/**
 * A questão gerada como QUESTÃO RESUMIDA (`$lib/atividades/questao-resumida.ts`):
 * o cartão da prévia de um material, na etapa 2. Sai do payload de autoria —
 * com a resposta certa marcada, porque é a tela do professor, atrás do guard; o
 * aluno nunca recebe isto.
 */

const lista = (valor: unknown): string[] =>
	Array.isArray(valor) ? valor.filter((v): v is string => typeof v === 'string') : [];
const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');

/** A habilidade do rótulo do cartão: a que a questão exige (ler o enunciado não conta). */
function habilidadeDe(item: Item): HabilidadeDaResumida {
	return habilidadeDaQuestao(getInteraction(item.interaction.type).skills(item.prompt));
}

/** O diálogo do contexto, como cartão: as duas últimas falas antes da parada. */
function conversaDe(item: Item, payload: Record<string, unknown>): CorpoDaResumida | null {
	const contexto = item.prompt.contexto;
	if (item.prompt.kind !== 'composite' || contexto?.tipo !== 'dialogo') return null;
	const elenco = [...new Set(contexto.falas.map((f) => f.falante))];
	const lado = (falante: string) =>
		(elenco.indexOf(falante) % 2 === 0 ? 'inicio' : 'fim') as 'inicio' | 'fim';
	const ate = contexto.ate ?? contexto.falas.length;
	const falas = contexto.falas
		.slice(0, ate)
		.slice(-2)
		.map((f) => ({ falante: f.falante, texto: f.texto, lado: lado(f.falante) }));
	const alvo = contexto.ate !== undefined ? contexto.falas[contexto.ate] : undefined;
	const opcoes = lista(payload.options);
	const indice = typeof payload.correctIndex === 'number' ? payload.correctIndex : 0;
	return {
		forma: 'conversa',
		falas,
		vez: alvo
			? { falante: alvo.falante, lado: lado(alvo.falante), resposta: alvo.texto }
			: undefined,
		pergunta: alvo ? undefined : item.prompt.text,
		certa: alvo ? undefined : opcoes[indice],
		ouve: contexto.mostra !== 'texto'
	};
}

function corpoDe(item: Item, payload: Record<string, unknown>): CorpoDaResumida {
	const audio = item.prompt.kind === 'audio';
	const enunciado = item.prompt.text ?? '';
	const conversa = conversaDe(item, payload);
	if (conversa) return conversa;
	if (
		item.interaction.type === 'speak' &&
		payload.pronuncia &&
		typeof payload.pronuncia === 'object'
	) {
		const silabas =
			(payload.pronuncia as { silabas?: { leitura: string; tonica: boolean }[] }).silabas ?? [];
		return {
			forma: 'pronuncia',
			palavra: texto(payload.target),
			silabas: silabas.map((s) => ({ leitura: s.leitura, tonica: s.tonica }))
		};
	}
	switch (item.interaction.type) {
		case 'choice': {
			const opcoes = lista(payload.options);
			const indice = typeof payload.correctIndex === 'number' ? payload.correctIndex : 0;
			const certa = opcoes[indice] ?? '';
			const outra = opcoes.find((_, i) => i !== indice);
			if (audio) return { forma: 'ouvir-escolher', certa, outra };
			// Pergunta de compreensão: o texto do prompt É a pergunta. Escolher a
			// tradução: o texto é o termo, e a pergunta é a do enunciado.
			return item.generatedBy === 'passage-comprehension'
				? { forma: 'ler-escolher', texto: '', pergunta: enunciado, certa, outra }
				: { forma: 'ler-escolher', texto: enunciado, pergunta: 'Qual é a tradução?', certa, outra };
		}
		case 'assemble': {
			const pecas = lista(payload.tokens);
			return audio
				? { forma: 'ouvir-montar', pecas }
				: { forma: 'montar', apoio: enunciado, pecas };
		}
		case 'type': {
			const resposta = lista(payload.accepted)[0] ?? '';
			return audio
				? { forma: 'ouvir-digitar', resposta }
				: { forma: 'digitar', texto: enunciado, resposta };
		}
		case 'cloze': {
			const masked = texto(payload.masked);
			const corte = masked.indexOf('___');
			return {
				forma: 'lacuna',
				// O espaço em volta da lacuna fica como está na frase: é ele que diz se o
				// idioma separa palavras por espaço.
				antes: corte >= 0 ? masked.slice(0, corte) : masked,
				resposta: lista(payload.accepted)[0] ?? '',
				depois: corte >= 0 ? masked.slice(corte + 3) : '',
				apoio: enunciado || undefined
			};
		}
		case 'match': {
			const pares = Array.isArray(payload.pairs)
				? (payload.pairs as { left?: unknown; right?: unknown }[]).map((p) => ({
						esquerda: texto(p.left),
						direita: texto(p.right)
					}))
				: [];
			return { forma: 'associar', pares };
		}
		case 'order':
			return { forma: 'ordenar', falas: lista(payload.lines) };
		case 'select': {
			const segmentos = Array.isArray(payload.segments)
				? (payload.segments as { text?: unknown }[]).map((s) => texto(s.text))
				: [];
			const indice = typeof payload.correctIndex === 'number' ? payload.correctIndex : -1;
			return {
				forma: 'tocar',
				antes: segmentos.slice(0, Math.max(indice, 0)).join(''),
				palavra: segmentos[indice] ?? '',
				depois: segmentos.slice(indice + 1).join('')
			};
		}
		case 'speak':
			return { forma: 'falar', frase: texto(payload.target) };
	}
}

function legendaDe(item: Item, corpo: CorpoDaResumida): string {
	switch (corpo.forma) {
		case 'ouvir-escolher':
			return 'Ouve e escolhe a frase';
		case 'ouvir-montar':
			return 'Ouve e monta a frase';
		case 'ouvir-digitar':
			return 'Ouve e escreve a frase';
		case 'falar':
			return 'Lê em voz alta e grava';
		case 'ler-escolher':
			return item.generatedBy === 'passage-comprehension'
				? 'Lê o trecho e responde'
				: 'Escolhe a tradução';
		case 'lacuna':
			return 'Completa a frase digitando';
		case 'montar':
			return 'Monta a frase pela tradução';
		case 'digitar':
			return item.grading.answerLang === 'source' ? 'Escreve a tradução' : 'Escreve a resposta';
		case 'ordenar':
			return 'Coloca as falas na ordem';
		case 'associar':
			return 'Liga cada palavra ao sentido';
		case 'tocar':
			return 'Toca na palavra certa';
		case 'conversa':
			if (corpo.pergunta)
				return corpo.ouve ? 'Ouve o diálogo e responde' : 'Lê o diálogo e responde';
			return item.interaction.type === 'speak'
				? 'Diz a próxima fala'
				: item.interaction.type === 'assemble'
					? 'Monta a próxima fala'
					: 'Escolhe a próxima fala';
		case 'pronuncia':
			return 'Pronuncia a palavra, som a som';
	}
}

export function resumirQuestao(item: Item, entra: boolean): QuestaoResumida {
	const lido = getInteraction(item.interaction.type).authoringSchema.safeParse(
		item.interaction.payload
	);
	const payload =
		lido.success && typeof lido.data === 'object' && lido.data !== null
			? (lido.data as Record<string, unknown>)
			: {};
	const corpo = corpoDe(item, payload);
	return {
		id: item.id,
		habilidade: habilidadeDe(item),
		legenda: legendaDe(item, corpo),
		corpo,
		entra
	};
}
