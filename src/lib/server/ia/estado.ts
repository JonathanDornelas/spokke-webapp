import { CUSTO_IA } from '$lib/billing/catalogo';
import type { EstadoDaIa } from '$lib/billing/ia';
import { labelForTag } from '$lib/kernel/language/profiles';
import { acessoDoProfessor } from '$lib/server/billing/acesso';
import { motivoDoBloqueio } from '$lib/server/billing/entitlements';
import { fontesDaIa, isIaConfigurada } from './index';

/**
 * O estado da geração por IA para a tela: se há provedor, se o plano deixa
 * (`can(estado, 'usar_ia')`, a mesma decisão que barra o servidor), o saldo e
 * em que idiomas ela vai escrever.
 */
export async function estadoDaIa(
	teacher: { id: string },
	idiomas: { alvo: string; origem: string } | null
): Promise<EstadoDaIa> {
	const estado = await acessoDoProfessor(teacher);
	const motivo = motivoDoBloqueio(estado, 'usar_ia');
	return {
		configurada: isIaConfigurada(),
		pode: motivo === null,
		motivo,
		saldo: estado.creditos.saldo,
		custoPorProposta: CUSTO_IA.porProposta,
		fontes: fontesDaIa(),
		idiomas: idiomas
			? `Em ${labelForTag(idiomas.alvo)}, com tradução para ${labelForTag(idiomas.origem)}.`
			: null
	};
}
