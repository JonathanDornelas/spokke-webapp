import type { LanguageProfile } from '../profile';
import { acentosEspanhol } from '../teclados';
import { numerais } from '../equivalences';

/** Espanhol — mesma lógica de acento significativo do português. */
export const esES: LanguageProfile = {
	tag: 'es-ES',
	direction: 'ltr',
	segmentation: 'icu-word',
	normalizers: ['nfkc', 'lowercase', 'strip-punct'],
	diacritics: 'significant',
	caseSensitive: false,
	tts: { voices: ['ef_dora', 'em_alex', 'em_santa'], speeds: [1, 0.75] },
	asr: { model: 'es-ES', hints: [] },
	input: { modo: 'acentos', teclado: acentosEspanhol },
	equivalences: numerais(
		[
			'cero',
			'uno|una|un',
			'dos',
			'tres',
			'cuatro',
			'cinco',
			'seis',
			'siete',
			'ocho',
			'nueve',
			'diez',
			'once',
			'doce',
			'trece',
			'catorce',
			'quince',
			'dieciséis',
			'diecisiete',
			'dieciocho',
			'diecinueve'
		],
		['veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'],
		// De 21 a 29 a forma é uma palavra só ("veintiuno"), listada em `extras`.
		(dezena, unidade) => (dezena === 'veinte' ? [] : [`${dezena} y ${unidade}`]),
		[
			['21', 'veintiuno', 'veintiuna', 'veintiún'],
			['22', 'veintidós'],
			['23', 'veintitrés'],
			['24', 'veinticuatro'],
			['25', 'veinticinco'],
			['26', 'veintiséis'],
			['27', 'veintisiete'],
			['28', 'veintiocho'],
			['29', 'veintinueve'],
			['100', 'cien', 'ciento']
		]
	),
	// "Estoy cansado" e "Yo estoy cansado". O "tú" fica fora: sem acento ele é
	// "tu", o possessivo. Ver `LanguageProfile.sujeitoOmitivel`.
	sujeitoOmitivel: {
		pronomes: ['yo', 'nosotros', 'nosotras'],
		conjuncoes: ['y', 'e', 'o', 'u', 'ni']
	}
};
