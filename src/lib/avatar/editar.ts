/**
 * As operações do EDITOR sobre o código do avatar. Puras e fora do componente
 * de propósito: a regra dos três acessórios é a única lógica de verdade do
 * editor, e ela merece teste sem montar uma tela.
 */
import { CASAS_ACESSORIO, MAX_ACESSORIOS, type Categoria } from './catalogo';
import { CASAS, LIMITES, normalizar } from './montar';

/** As dezoito casas, sempre completas. */
function casas(codigo: string): number[] {
	return normalizar(codigo).split('-').map(Number);
}

/** Troca UMA casa e devolve o código novo. Não grava nada. */
export function trocarCasa(codigo: string, i: number, valor: number): string {
	const n = casas(codigo);
	if (i < 0 || i >= CASAS) return n.join('-');
	n[i] = Math.max(0, valor) % (LIMITES[i] ?? LIMITES[13]!);
	return n.join('-');
}

/**
 * Quais acessórios estão ligados, na ordem das casas. Zero é "nenhum", então
 * ele não conta como peça ligada — é a ausência dela.
 */
export function acessoriosLigados(codigo: string): number[] {
	const n = casas(codigo);
	return CASAS_ACESSORIO.map((casa) => n[casa] ?? 0).filter((v) => v > 0);
}

/**
 * Liga ou desliga um acessório. É a única escolha MÚLTIPLA do editor: dá para
 * usar até três peças ao mesmo tempo (coroa + fone + espada).
 *
 * Passando o índice 0 ("nenhum") limpa as três casas — é assim que se tira
 * tudo sem precisar desligar peça por peça. Chegando no teto, a mais antiga sai
 * para a nova entrar: recusar em silêncio deixaria o toque sem resposta, e
 * avisar "já tem três" num editor de enfeite seria cerimônia demais.
 */
export function alternarAcessorio(codigo: string, peca: number): string {
	const ligados = acessoriosLigados(codigo);
	const proximos =
		peca === 0
			? []
			: ligados.includes(peca)
				? ligados.filter((v) => v !== peca)
				: [...ligados, peca].slice(-MAX_ACESSORIOS);

	let saida = codigo;
	CASAS_ACESSORIO.forEach((casa, i) => {
		saida = trocarCasa(saida, casa, proximos[i] ?? 0);
	});
	return saida;
}

/**
 * O código que a MINIATURA de uma opção deve mostrar: o avatar de agora com
 * aquela peça trocada. É o que faz cada botão do editor mostrar a escolha no
 * rosto da própria pessoa, em vez de um manequim genérico.
 *
 * Em acessório a miniatura mostra a peça SOZINHA (as outras duas casas
 * zeradas): com as três somadas não daria para ver qual delas o botão oferece.
 */
export function codigoDaOpcao(codigo: string, iForma: number, peca: number): string {
	if (iForma !== CASAS_ACESSORIO[0]) return trocarCasa(codigo, iForma, peca);

	let saida = codigo;
	CASAS_ACESSORIO.forEach((casa, i) => {
		saida = trocarCasa(saida, casa, i === 0 ? peca : 0);
	});
	return saida;
}

/** O que está escolhido numa categoria: a posição, o total e o nome que a tela diz. */
export interface Escolha {
	/** Posição da escolha, a partir de 0. Em acessório, quantos estão ligados. */
	indice: number;
	/** Quantas opções a categoria tem. Em acessório, o teto de peças ao mesmo tempo. */
	total: number;
	/** O nome legível: "longo", "tom de pele 3", "coroa e fone", "nenhum". */
	nome: string;
	/** As setas ‹ › fazem sentido — não em acessório, que é escolha múltipla. */
	cicla: boolean;
}

/**
 * A escolha atual de uma categoria, para o cabeçalho da oficina do editor
 * ("Cabelo: longo, 3 de 16"). Onde só existe cor (pele, fundo), a escolha É a
 * cor — e o nome é a posição dela na paleta ("tom de pele 3"), porque cor
 * não tem nome.
 */
export function escolhaAtual(categoria: Categoria, codigo: string): Escolha {
	const n = casas(codigo);
	if (categoria.iForma === CASAS_ACESSORIO[0]) {
		const ligados = acessoriosLigados(codigo);
		const nomes = ligados.map((i) => categoria.nomes[i] ?? String(i));
		return {
			indice: ligados.length,
			total: MAX_ACESSORIOS,
			nome:
				nomes.length === 0
					? 'nenhum'
					: nomes.length === 1
						? nomes[0]!
						: `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`,
			cicla: false
		};
	}
	if (categoria.iForma === null) {
		const i = n[categoria.iCor] ?? 0;
		return {
			indice: i,
			total: categoria.paleta.length,
			nome: `${categoria.corLabel.toLowerCase()} ${i + 1}`,
			cicla: true
		};
	}
	const i = n[categoria.iForma] ?? 0;
	return {
		indice: i,
		total: categoria.nFormas,
		nome: categoria.nomes[i] ?? String(i + 1),
		cicla: true
	};
}

/**
 * O código com a escolha de uma categoria andando `passo` casas (‹ é -1, › é
 * +1), dando a volta nas pontas. Onde só há cor, quem anda é a cor.
 */
export function ciclar(categoria: Categoria, codigo: string, passo: number): string {
	const atual = escolhaAtual(categoria, codigo);
	if (!atual.cicla || atual.total === 0) return codigo;
	const proximo = (((atual.indice + passo) % atual.total) + atual.total) % atual.total;
	return trocarCasa(codigo, categoria.iForma ?? categoria.iCor, proximo);
}
