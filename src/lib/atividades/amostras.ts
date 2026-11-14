import type { NivelId } from './nivel';
import type { QuestaoResumida } from './questao-resumida';

/**
 * As AMOSTRAS do bloco "O que sai daqui" da etapa 1: uma questão de cada tipo,
 * no idioma que o professor escolheu. É CONTEÚDO de tela, não regra de língua —
 * as frases são as dos exemplos do blog de cada idioma (`src/content/blog`),
 * que já estão no ar.
 *
 * Em inglês as frases acompanham o NÍVEL, como no desenho: é o idioma em que o
 * desenho foi feito, e as seis estão escritas. Nos outros idiomas a amostra é
 * uma só. O nível é um rótulo e não muda o que o gerador produz — a tela não diz
 * o contrário.
 *
 * Idioma sem amostra (um que entrar depois) não quebra a tela: o bloco mostra o
 * de inglês. `amostras.test.ts` falha se algum idioma do produto ficar sem.
 */

interface Amostra {
	escuta: { certa: string; outra: string };
	fala: string;
	leitura: { texto: string; pergunta: string; certa: string; outra: string };
	escrita: { antes: string; resposta: string; depois: string; apoio: string };
}

/** O inglês do desenho, nível a nível. */
const INGLES: Record<NivelId, Amostra> = (() => {
	const NIVEIS = [
		{
			id: 'A1',
			frase: 'She works here.',
			apoio: 'Ela trabalha aqui.',
			lacuna: ['She', 'works', 'here.'],
			texto: 'Maria lives in Lisbon. She works in a café.'
		},
		{
			id: 'A2',
			frase: 'She started working here in 2019.',
			apoio: 'Ela começou a trabalhar aqui em 2019.',
			lacuna: ['She', 'started', 'working here in 2019.'],
			texto: 'Maria moved to Lisbon in 2019 and found a job in a café.'
		},
		{
			id: 'B1',
			frase: 'She has been working here since 2019.',
			apoio: 'Ela trabalha aqui desde 2019.',
			lacuna: ['She', 'has been working', 'here since 2019.'],
			texto: 'Maria has lived in Lisbon since 2019. She has worked in the same café ever since.'
		},
		{
			id: 'B2',
			frase: 'She has been working here since 2019, although she never planned to stay.',
			apoio: 'Ela trabalha aqui desde 2019, embora nunca tenha planejado ficar.',
			lacuna: ['…although she never', 'planned', 'to stay.'],
			texto: 'Although Maria only meant to stay a year, she has been running the café since 2019.'
		},
		{
			id: 'C1',
			frase: 'Having worked here since 2019, she is widely regarded as the team’s memory.',
			apoio: 'Por trabalhar aqui desde 2019, ela é vista como a memória da equipe.',
			lacuna: ['', 'Having worked', 'here since 2019, she is…'],
			texto:
				'Having arrived on a whim, Maria ended up taking over the café she once waited tables in.'
		},
		{
			id: 'C2',
			frase: 'Had she not joined in 2019, the team would scarcely be what it is today.',
			apoio: 'Não tivesse ela entrado em 2019, a equipe dificilmente seria o que é hoje.',
			lacuna: ['', 'Had', 'she not joined in 2019, …'],
			texto:
				'Little did Maria suspect that the café she stumbled into would become her life’s work.'
		}
	] as const;
	return Object.fromEntries(
		NIVEIS.map((n, i) => [
			n.id,
			{
				escuta: { certa: n.frase, outra: (NIVEIS[i - 1] ?? NIVEIS[1]).frase },
				fala: n.frase,
				leitura: {
					texto: n.texto,
					pergunta: 'Onde Maria trabalha?',
					certa: 'Num café',
					outra: 'Num banco'
				},
				// Em inglês o espaço em volta da lacuna vem daqui; nos outros idiomas,
				// escrito no próprio dado (japonês e chinês não têm).
				escrita: {
					antes: n.lacuna[0] ? `${n.lacuna[0]} ` : '',
					resposta: n.lacuna[1],
					depois: ` ${n.lacuna[2]}`,
					apoio: n.apoio
				}
			}
		])
	) as Record<NivelId, Amostra>;
})();

const POR_IDIOMA: Record<string, Amostra> = {
	'es-ES': {
		escuta: { certa: '¿Dónde está la estación de metro?', outra: 'Mi apellido es Souza.' },
		fala: 'Me llamo Ana y soy de Brasil.',
		leitura: {
			texto: 'Me llamo Ana y soy de Brasil. Mi apellido es Souza.',
			pergunta: 'De onde a Ana é?',
			certa: 'Do Brasil',
			outra: 'Da Espanha'
		},
		escrita: {
			antes: 'Mi apellido ',
			resposta: 'es',
			depois: ' Souza.',
			apoio: 'Meu sobrenome é Souza.'
		}
	},
	'fr-FR': {
		escuta: { certa: 'Où est la bibliothèque ?', outra: 'Nous avons un examen vendredi.' },
		fala: "Je m'appelle Lucas et j'habite à Recife.",
		leitura: {
			texto: "Je m'appelle Lucas et j'habite à Recife. Nous avons un examen vendredi.",
			pergunta: 'Onde o Lucas mora?',
			certa: 'Em Recife',
			outra: 'Em Paris'
		},
		escrita: {
			antes: 'Nous ',
			resposta: 'avons',
			depois: ' un examen vendredi.',
			apoio: 'Nós temos uma prova na sexta-feira.'
		}
	},
	'it-IT': {
		escuta: { certa: 'Mio nonno abita a Napoli.', outra: 'Questo caffè è troppo caldo.' },
		fala: 'Mi chiamo Giulia e studio italiano.',
		leitura: {
			texto: 'Mi chiamo Giulia e studio italiano. Mio nonno abita a Napoli.',
			pergunta: 'Onde o avô da Giulia mora?',
			certa: 'Em Nápoles',
			outra: 'Em Roma'
		},
		escrita: {
			antes: 'Mio nonno ',
			resposta: 'abita',
			depois: ' a Napoli.',
			apoio: 'Meu avô mora em Nápoles.'
		}
	},
	'pt-BR': {
		escuta: { certa: 'Quanto custa o pão de queijo?', outra: 'Eu moro no Brasil há seis meses.' },
		fala: 'A gente vai almoçar agora, quer vir?',
		leitura: {
			texto: 'Eu moro no Brasil há seis meses. A gente vai almoçar agora, quer vir?',
			pergunta: 'Há quanto tempo a pessoa mora no Brasil?',
			certa: 'Seis meses',
			outra: 'Seis anos'
		},
		escrita: {
			antes: 'Eu ',
			resposta: 'moro',
			depois: ' no Brasil há seis meses.',
			apoio: "I've been living in Brazil for six months."
		}
	},
	'ja-JP': {
		escuta: { certa: 'わたしはがくせいです。', outra: 'これはなんですか。' },
		fala: 'あしたともだちにあいます。',
		leitura: {
			texto: 'わたしはがくせいです。あしたともだちにあいます。',
			pergunta: 'Quando a pessoa vai encontrar o amigo?',
			certa: 'Amanhã',
			outra: 'Hoje'
		},
		escrita: {
			antes: 'わたしは',
			resposta: 'がくせい',
			depois: 'です。',
			apoio: 'Eu sou estudante.'
		}
	},
	'zh-CN': {
		escuta: { certa: '我想买一杯咖啡。', outra: '他不喜欢下雨。' },
		fala: '你叫什么名字？',
		leitura: {
			texto: '我是学生。我想买一杯咖啡。',
			pergunta: 'O que a pessoa quer comprar?',
			certa: 'Um café',
			outra: 'Um chá'
		},
		escrita: { antes: '他不', resposta: '喜欢', depois: '下雨。', apoio: 'Ele não gosta de chuva.' }
	},
	'hi-IN': {
		escuta: { certa: 'मैं ब्राज़ील से हूँ।', outra: 'मेरा नाम अना है।' },
		fala: 'यह किताब बहुत अच्छी है।',
		leitura: {
			texto: 'मेरा नाम अना है। मैं ब्राज़ील से हूँ।',
			pergunta: 'De onde a Ana é?',
			certa: 'Do Brasil',
			outra: 'Da Índia'
		},
		escrita: {
			antes: 'यह किताब बहुत ',
			resposta: 'अच्छी',
			depois: ' है।',
			apoio: 'Este livro é muito bom.'
		}
	},
	'ar-SA': {
		escuta: { certa: 'أنا من البرازيل.', outra: 'هذا كتاب جديد.' },
		fala: 'اسمي سارة.',
		leitura: {
			texto: 'اسمي سارة. أنا من البرازيل.',
			pergunta: 'De onde a Sara é?',
			certa: 'Do Brasil',
			outra: 'Do Egito'
		},
		escrita: { antes: 'هذا ', resposta: 'كتاب', depois: ' جديد.', apoio: 'Este é um livro novo.' }
	}
};

/** O idioma tem amostra própria (o inglês conta, pelos níveis). */
export function temAmostra(tag: string): boolean {
	return tag.startsWith('en-') || tag in POR_IDIOMA;
}

/**
 * As quatro questões resumidas da etapa 1, no idioma e no nível escolhidos.
 * `semEscuta`: o idioma não tem voz (o árabe, hoje) — a escuta aparece apagada,
 * porque dele não sai questão de ouvir.
 */
export function amostrasDaEtapa1(
	tag: string,
	nivel: NivelId | null,
	{ semEscuta = false }: { semEscuta?: boolean } = {}
): QuestaoResumida[] {
	const a = POR_IDIOMA[tag] ?? INGLES[nivel ?? 'B1'];
	return [
		{
			id: 'escuta',
			habilidade: 'escuta',
			legenda: 'Ouve e escolhe a frase',
			corpo: { forma: 'ouvir-escolher', ...a.escuta },
			entra: !semEscuta
		},
		{
			id: 'fala',
			habilidade: 'fala',
			legenda: 'Lê em voz alta e grava',
			corpo: { forma: 'falar', frase: a.fala },
			entra: true
		},
		{
			id: 'leitura',
			habilidade: 'leitura',
			legenda: 'Lê o trecho e responde',
			corpo: { forma: 'ler-escolher', ...a.leitura },
			entra: true
		},
		{
			id: 'escrita',
			habilidade: 'escrita',
			legenda: 'Completa a frase digitando',
			corpo: { forma: 'lacuna', ...a.escrita },
			entra: true
		}
	];
}
