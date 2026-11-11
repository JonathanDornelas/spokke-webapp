/**
 * Como as datas e o tempo de leitura aparecem no blog. A data do artigo é um
 * DIA (AAAA-MM-DD), sem hora: lida e escrita em UTC, para o "10 de nov." não
 * virar "9 de nov." no fuso de quem renderiza.
 */
const DIA = new Intl.DateTimeFormat('pt-BR', {
	day: 'numeric',
	month: 'short',
	year: 'numeric',
	timeZone: 'UTC'
});

function comoData(dia: string): Date {
	return new Date(`${dia}T00:00:00Z`);
}

/** "2026-11-10" → "10 de nov. de 2026". */
export function dataDoArtigo(dia: string): string {
	return DIA.format(comoData(dia));
}

export function minutosDeLeitura(minutos: number): string {
	return `${minutos} min de leitura`;
}

/** O dia de hoje em AAAA-MM-DD no fuso do Brasil: o artigo agendado para amanhã ainda não saiu. */
export function hojeNoBrasil(agora = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
}
