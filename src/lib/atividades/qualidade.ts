import type { CodigoDoProblema, Problema } from '$lib/kernel/qualidade';

/**
 * O que o professor lê sobre cada problema da CONFERÊNCIA (kernel.md
 * "Conferência de qualidade"). O kernel devolve o código; a frase mora aqui,
 * isomórfica, para a revisão e o editor dizerem a mesma coisa.
 *
 * Tela do professor, atrás do guard: o trecho pode ser gabarito.
 */

export interface TextoDoProblema {
	/** A frase curta: o que está errado. */
	titulo: string;
	/** A segunda linha: onde, e o que acontece com o aluno. */
	detalhe?: string;
}

const citar = (texto: string | undefined) => (texto ? `"${texto}"` : '');

const TEXTOS: Record<CodigoDoProblema, (p: Problema) => TextoDoProblema> = {
	'formato-invalido': () => ({
		titulo: 'Os campos não formam um exercício.',
		detalhe: 'Abra no editor e complete a questão.'
	}),
	'resposta-igual-ao-enunciado': (p) => ({
		titulo: 'A resposta está escrita no enunciado.',
		detalhe: `${citar(p.trecho) || 'O texto'} aparece na pergunta e no gabarito. Se era uma tradução, ela voltou sem traduzir.`
	}),
	'texto-vazio': (p) => ({
		titulo: 'Uma resposta só tem pontuação.',
		detalhe: `${citar(p.trecho)} fica vazia na correção.`
	}),
	'alternativas-repetidas': (p) => ({
		titulo: 'Duas alternativas iguais.',
		detalhe: `${citar(p.trecho)} aparece duas vezes, e quem escolhe a repetida leva errado.`
	}),
	'peca-faltando': (p) => ({
		titulo: 'Falta uma peça para montar a resposta.',
		detalhe: `${citar(p.trecho)} está no gabarito e não está entre as peças.`
	}),
	'uma-peca-so': () => ({ titulo: 'Uma peça só não dá o que montar.' }),
	'resposta-unica-na-traducao': () => ({
		titulo: 'Só uma tradução é aceita.',
		detalhe:
			'Quem traduzir certo com outras palavras leva "quase". Acrescente outras formas em "Também aceitas".'
	}),
	'lacuna-ausente': () => ({
		titulo: 'A frase não tem lacuna.',
		detalhe: 'Marque o trecho que falta com ___.'
	}),
	'lacuna-no-apoio': (p) => ({
		titulo: 'A palavra da lacuna está na tradução de apoio.',
		detalhe: `${citar(p.trecho)} aparece escrita na frase de cima.`
	}),
	'pares-repetidos': (p) => ({
		titulo: 'Dois pares com o mesmo termo.',
		detalhe: `${citar(p.trecho)} aparece em duas linhas, e só uma das ligações conta.`
	}),
	'par-igual-nos-dois-lados': (p) => ({
		titulo: 'Um par se liga sozinho.',
		detalhe: `${citar(p.trecho)} é igual dos dois lados.`
	}),
	'falas-repetidas': (p) => ({
		titulo: 'Duas falas iguais.',
		detalhe: `${citar(p.trecho)} aparece duas vezes, e trocar as duas de lugar conta como erro.`
	}),
	'palavra-certa-repetida': (p) => ({
		titulo: 'A palavra certa aparece duas vezes.',
		detalhe: `${citar(p.trecho)} está duas vezes na frase, e quem toca na outra leva errado.`
	}),
	'traducao-igual-ao-original': () => ({
		titulo: 'O texto de apoio repete a frase.',
		detalhe: 'Se a ideia era mostrar a tradução, ela ficou sem traduzir.'
	})
};

export function textoDoProblema(problema: Problema): TextoDoProblema {
	return TEXTOS[problema.codigo](problema);
}

/** O rótulo da marca na linha da revisão, pela gravidade mais alta. */
export function rotuloDaMarca(problemas: readonly Problema[]): string | null {
	if (problemas.length === 0) return null;
	const erros = problemas.filter((p) => p.gravidade === 'erro').length;
	if (erros > 0) return erros === 1 ? '1 problema' : `${erros} problemas`;
	return problemas.length === 1
		? '1 ponto para conferir'
		: `${problemas.length} pontos para conferir`;
}
