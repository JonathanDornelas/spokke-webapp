import type { Prompt, Skill } from './types';

/**
 * Metade da derivação de habilidade que depende só do prompt — kernel.md
 * "Habilidade é derivada, não declarada". A outra metade (speaking para
 * `speak`, writing para `type`/`cloze`) é fixa por interação e cada módulo
 * soma ao resultado disto. O professor nunca vê nem escolhe nada aqui.
 *
 * O `composite` deriva do CONTEXTO: o trecho de um texto é leitura; o diálogo é
 * escuta quando o aluno o ouve e leitura quando ele o lê — as duas, quando
 * recebe o texto e o áudio. O `composite` sem contexto é o da compreensão de
 * texto publicada antes de o contexto existir, e era uma pergunta de leitura.
 */
export function promptSkills(prompt: Prompt): Skill[] {
	const skills: Skill[] = [];
	if (prompt.kind === 'audio') skills.push('listening');
	if (prompt.kind === 'text') skills.push('reading');
	if (prompt.kind === 'composite') {
		const contexto = prompt.contexto;
		if (contexto?.tipo === 'dialogo') {
			if (contexto.mostra !== 'texto') skills.push('listening');
			if (contexto.mostra !== 'audio') skills.push('reading');
		} else {
			skills.push('reading');
		}
	}
	return skills;
}

/**
 * A habilidade que dá NOME à questão — o rótulo do cabeçalho no Player, a bolha
 * do roteiro, o cartão resumido e o tipo em que o editor abre. É o que a
 * questão PEDE: falar vence ouvir (no "diga a próxima fala" o aluno ouve o
 * diálogo, mas o que ele faz é falar), ouvir vence escrever ("ouça e escreva" é
 * uma escuta), e a leitura só nomeia quando é a única coisa nela — todo prompt
 * de texto rende `reading`, e "Complete a frase" não é uma leitura.
 *
 * Um lugar só: eram três regras parecidas (o Player, o roteiro e o cartão), e o
 * diálogo que se ouve e se responde falando saía Escuta num e Fala no outro.
 */
export function habilidadePrincipal(skills: readonly Skill[]): Skill {
	for (const s of ['speaking', 'listening', 'writing'] as const) if (skills.includes(s)) return s;
	return 'reading';
}
