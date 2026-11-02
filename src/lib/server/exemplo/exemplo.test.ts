import { describe, expect, it } from 'vitest';
import { corrigirNoExemplo, questoesDoExemplo, QUESTOES_DA_HOME } from './index';

/**
 * O exemplo é público e não pede nada a ninguém — é o primeiro lugar onde
 * alguém procuraria o gabarito. A regra inviolável nº 1 vale igual.
 */
describe('o que o exemplo manda para o browser', () => {
	const questoes = questoesDoExemplo();
	const json = (id: string) => JSON.stringify(questoes.find((q) => q.id === id));

	it('a escuta não traz a frase que se deveria ouvir como texto da questão', () => {
		const escuta = questoes.find((q) => q.id === 'escuta')!;
		expect(escuta.passage).toBeUndefined();
		expect(escuta.audio).toBe('/demo/exemplo-escuta.mp3');
		expect(escuta.audioSlow).toBe('/demo/exemplo-escuta-lento.mp3');
		expect(json('escuta')).not.toContain('correctIndex');
	});

	it('a lacuna não traz as respostas aceitas', () => {
		expect(json('lacuna')).not.toContain('has been working');
		expect(json('lacuna')).not.toContain('has worked');
		expect(json('lacuna')).not.toContain('accepted');
	});

	it('montar a frase não traz a ordem certa', () => {
		const montar = questoes.find((q) => q.id === 'montar')!;
		expect(json('montar')).not.toContain('accepted');
		const ordem = (montar.tokens as { text: string }[]).map((t) => t.text);
		expect(ordem).not.toEqual(['We', "haven't", 'finished', 'yet', 'already', "didn't"]);
	});

	it('a fala não leva as dicas do reconhecimento de voz', () => {
		expect(json('fala')).not.toContain('hints');
	});

	it('a associação não deixa ler os pares pela posição', () => {
		const pares = questoes.find((q) => q.id === 'pares')!;
		const esquerda = (pares.left as { text: string }[]).map((t) => t.text);
		const direita = (pares.right as { text: string }[]).map((t) => t.text);
		const casadasPelaPosicao = [
			['already', 'já'],
			['yet', 'ainda'],
			['since', 'desde'],
			['ever', 'alguma vez']
		].every(([l, r]) => esquerda.indexOf(l!) === direita.indexOf(r!));
		expect(casadasPelaPosicao).toBe(false);
	});

	it('a home recebe só as quatro do celular, na ordem das pastilhas', () => {
		expect(questoesDoExemplo(QUESTOES_DA_HOME).map((q) => q.id)).toEqual([
			'escuta',
			'lacuna',
			'montar',
			'fala'
		]);
	});

	it('embaralha igual a cada carregamento', () => {
		expect(JSON.stringify(questoesDoExemplo())).toBe(JSON.stringify(questoes));
	});
});

describe('a correção do exemplo', () => {
	const [, lacuna, montar] = questoesDoExemplo();

	it('existe o quase: uma letra a menos não zera', async () => {
		const r = await corrigirNoExemplo(lacuna!.id, { text: 'has been workin' });
		expect(r.ok && r.veredito.state).toBe('partial');
	});

	it('acerta com a resposta principal e com a variante', async () => {
		const a = await corrigirNoExemplo(lacuna!.id, { text: 'Has been working' });
		const b = await corrigirNoExemplo(lacuna!.id, { text: 'has worked' });
		expect(a.ok && a.veredito.state).toBe('correct');
		expect(b.ok && b.veredito.state).toBe('correct');
	});

	it('monta a frase pelos ids embaralhados, como o Player', async () => {
		const tokens = montar!.tokens as { id: string; text: string }[];
		const id = (texto: string) => tokens.find((t) => t.text === texto)!.id;
		const certa = ['We', "haven't", 'finished', 'yet'].map(id);
		const r = await corrigirNoExemplo(montar!.id, { sequence: certa });
		expect(r.ok && r.veredito.state).toBe('correct');
	});

	it('recusa questão que não existe e resposta fora do formato', async () => {
		expect((await corrigirNoExemplo('nao-existe', { text: 'x' })).ok).toBe(false);
		expect((await corrigirNoExemplo(lacuna!.id, { optionId: 'x' })).ok).toBe(false);
	});
});
