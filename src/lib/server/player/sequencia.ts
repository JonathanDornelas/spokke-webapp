/**
 * A atividade é um CAMINHO: as questões vêm na ordem do roteiro, e a seguinte
 * só abre depois de a de agora ficar para trás — respondida ou pulada.
 *
 * Antes não havia regra nenhuma: `/a/<slug>/q/9` abria a questão 9 para quem
 * estava na 2, era só trocar o número na URL. O avanço mora na tentativa
 * (`Attempt.avanco`: quantas questões, da primeira em diante, já ficaram para
 * trás) e é conferido no SERVIDOR em todas as portas — abrir a questão,
 * responder, falar, pular e entregar —, porque toda remote function é um
 * endpoint público (regra nº 3) e a tela sozinha não segura nada.
 *
 * Voltar continua livre: o que ficou para trás abre sempre.
 */

/**
 * O avanço que VALE: o gravado, ou a posição da última questão respondida, o
 * que for maior. Resposta gravada é questão deixada para trás, então para uma
 * tentativa nova os dois números são o mesmo. A diferença é a tentativa que
 * recebeu resposta sem mover o avanço — pelo web antigo, no meio de um deploy:
 * sem isto ela parava numa questão respondida cuja "Próxima" voltava para ela.
 */
export function avancoEfetivo(
	avanco: number,
	roteiro: readonly { id: string }[],
	respondidas: readonly { itemId: string }[]
): number {
	const feitas = new Set(respondidas.map((r) => r.itemId));
	let ultima = 0;
	roteiro.forEach((item, i) => {
		if (feitas.has(item.id)) ultima = i + 1;
	});
	return Math.max(avanco, ultima);
}

/** O mesmo, lido de uma tentativa como o `playerRepo` a devolve. */
export function avancoDaTentativa(tentativa: {
	avanco: number;
	items: readonly { itemId: string }[];
	publication: { activityVersion: { items: readonly { id: string }[] } };
}): number {
	return avancoEfetivo(
		tentativa.avanco,
		tentativa.publication.activityVersion.items,
		tentativa.items
	);
}

/** A questão da vez: a primeira que ainda não ficou para trás. */
export function questaoDaVez(avanco: number, total: number): number {
	return Math.max(1, Math.min(Math.max(avanco, 0) + 1, total));
}

/** A questão `n` abre? Para trás, sempre; para a frente, só a da vez. */
export function questaoAbre(n: number, avanco: number, total: number): boolean {
	return Number.isInteger(n) && n >= 1 && n <= total && n <= Math.max(avanco, 0) + 1;
}

/**
 * Só a questão de FALA se pula: ali o ambiente barulhento, o microfone ou o
 * serviço de áudio podem impedir o aluno de responder (kernel.md "Correção").
 * As outras se respondem para seguir. É a mesma regra do `skippable` que a tela
 * recebe e do que o servidor aceita em `pularQuestao` — por isso mora aqui.
 */
export function sePula(tipoDeInteracao: string): boolean {
	return tipoDeInteracao === 'speak';
}

/** O caminho inteiro ficou para trás: só então a tentativa pode ser entregue. */
export function caminhoFeito(avanco: number, total: number): boolean {
	return avanco >= total;
}
