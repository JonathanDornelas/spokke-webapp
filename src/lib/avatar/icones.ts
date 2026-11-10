/**
 * Os ícones do editor de avatar, em pixel art 7×7 — o mesmo molde dos ícones do
 * mapa do módulo (`$lib/modulos/pixel.ts`): cada sprite é uma grade de letras e
 * vira um `path` que se desenha num `viewBox="0 0 7 7"` com
 * `shape-rendering="crispEdges"`, na cor do texto. Nenhum arquivo de imagem.
 *
 * Ícone nunca vai sozinho: o nome da categoria ou da ação está sempre ao lado,
 * ou no `aria-label` do botão.
 */
import { caminhoDaGrade } from '$lib/modulos/pixel';

const icone = (grade: string[]) => caminhoDaGrade(grade, 1, 0, 0, '#');

/** Um por categoria do catálogo, mais "prontos" — a chave é a de `CATEGORIAS`. */
export const ICONE_DA_CATEGORIA: Record<string, string> = {
	prontos: icone(['...#...', '..###..', '#######', '.#####.', '..###..', '.##.##.', '.#...#.']),
	pele: icone(['.#####.', '#######', '##.#.##', '#######', '##...##', '.#####.', '..###..']),
	cabelo: icone(['.#####.', '#######', '##...##', '#.....#', '#.....#', '#.....#', '.......']),
	olhos: icone(['.......', '..###..', '.#...#.', '#..#..#', '.#...#.', '..###..', '.......']),
	boca: icone(['.......', '.......', '#.....#', '#.....#', '.#...#.', '..###..', '.......']),
	barba: icone(['#.....#', '#.....#', '##...##', '#######', '.#####.', '..###..', '.......']),
	oculos: icone(['.......', '.......', '###.###', '#.###.#', '###.###', '.......', '.......']),
	detalhe: icone(['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...']),
	roupa: icone(['##...##', '###.###', '#######', '.#####.', '.#####.', '.#####.', '.#####.']),
	pose: icone(['...#...', '..###..', '.#.#.#.', '#..#..#', '...#...', '..#.#..', '.#...#.']),
	acessorio: icone(['.......', '#..#..#', '##.#.##', '#######', '#######', '.......', '.......']),
	fundo: icone(['#######', '#.....#', '#.#...#', '#...#.#', '#.###.#', '#######', '.......'])
};

/** O dado do "Sortear". */
export const ICONE_DADO = icone([
	'.#####.',
	'#.....#',
	'#.#...#',
	'#..#..#',
	'#...#.#',
	'#.....#',
	'.#####.'
]);
/** A seta que volta do "Desfazer". */
export const ICONE_DESFAZER = icone([
	'.#.....',
	'##.....',
	'######.',
	'##....#',
	'.#....#',
	'......#',
	'.#####.'
]);
/** O visto do cartão escolhido. */
export const ICONE_VISTO = icone([
	'.......',
	'......#',
	'.....##',
	'#...##.',
	'##.##..',
	'.###...',
	'..#....'
]);
/** O cursor de menu de jogo, ao lado da categoria aberta. */
export const ICONE_CURSOR = icone([
	'.#.....',
	'.##....',
	'.###...',
	'.####..',
	'.###...',
	'.##....',
	'.#.....'
]);
/** As setas ‹ › que passam pelas opções de uma categoria. */
export const ICONE_ANTERIOR = icone([
	'....#..',
	'...##..',
	'..##...',
	'.##....',
	'..##...',
	'...##..',
	'....#..'
]);
export const ICONE_PROXIMO = icone([
	'..#....',
	'..##...',
	'...##..',
	'....##.',
	'...##..',
	'..##...',
	'..#....'
]);
/** O X de fechar. */
export const ICONE_FECHAR = icone([
	'#.....#',
	'##...##',
	'.##.##.',
	'..###..',
	'.##.##.',
	'##...##',
	'#.....#'
]);
