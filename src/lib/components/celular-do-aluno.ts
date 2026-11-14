/**
 * O que as duas telas com o PALCO repetem em volta do `CelularDoAluno` — a
 * revisão e as questões da tela da atividade (components.md "O celular do
 * aluno"). No desktop o aparelho fica ao lado do roteiro, com as setas dos
 * lados; no celular ele fica ACIMA do roteiro, e duas coisas mudam:
 *
 * - as setas não cabem dos lados do aparelho e descem para baixo dele;
 * - escolher uma linha troca a questão longe da vista, e a linha escolhida ganha
 *   "Ver no celular", que rola até o aparelho.
 */

/** As setas sob o aparelho, no celular: ícone e texto, alvo de 40px. */
export const SETA_SOB_O_CELULAR =
	'flex h-10 items-center gap-1.5 rounded-full border border-line bg-base-100 px-4 text-[13px] font-semibold transition-[border-color,scale] duration-200 hover:border-primary active:scale-95 disabled:cursor-not-allowed disabled:opacity-45';

/** "Ver no celular", na linha escolhida — só abaixo de `lg`. */
export const VER_NO_CELULAR =
	'flex min-h-10 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[12.5px] font-bold text-primary transition-colors hover:bg-primary/8 lg:hidden';

/** O ícone do aparelho, no traço de 2px da grade de 24. */
export const ICONE_DO_CELULAR =
	'M8 2.5h8A1.5 1.5 0 0117.5 4v16a1.5 1.5 0 01-1.5 1.5H8A1.5 1.5 0 016.5 20V4A1.5 1.5 0 018 2.5zM11 18h2';

/** Rola até o palco, sem animar quando o sistema pede menos movimento. */
export function rolarAtePalco(palco: HTMLElement | undefined): void {
	if (!palco) return;
	const semMovimento =
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	palco.scrollIntoView({ behavior: semMovimento ? 'auto' : 'smooth', block: 'start' });
}
