import type { Item } from '$lib/kernel/item';
import { getInteraction } from '$lib/kernel/interactions/registry';
import type {
	CorpoDaResumida,
	HabilidadeDaResumida,
	QuestaoResumida
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
	const skills = getInteraction(item.interaction.type).skills(item.prompt);
	if (skills.includes('listening')) return 'escuta';
	if (skills.includes('speaking')) return 'fala';
	if (skills.includes('writing')) return 'escrita';
	return 'leitura';
}

function corpoDe(item: Item, payload: Record<string, unknown>): CorpoDaResumida {
	const audio = item.prompt.kind === 'audio';
	const enunciado = item.prompt.text ?? '';
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
