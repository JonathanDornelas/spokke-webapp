import type { TemaDoBlog } from './tipos';

/**
 * Os temas do blog: cada um é um hub (`/blog/tema/<slug>`), com abertura
 * própria e o guia principal em destaque. Lista em TS, não Markdown: muda pouco
 * e o frontmatter dos artigos valida contra ela (`tema` é um destes slugs).
 *
 * **Hipótese**, como os temas da estrutura de SEO
 * (`../spokke-seo/project/artifacts/blog/estrutura-seo.md`, seção 12): nenhum
 * foi validado por dado de busca. Tema sem artigo publicado não tem página, não
 * aparece nos chips e não entra no sitemap, então a lista pode estar à frente
 * do conteúdo sem mostrar nada vazio.
 */
export const TEMAS: readonly TemaDoBlog[] = [
	{
		slug: 'atividades-com-o-material-da-aula',
		nome: 'Atividades com o material da aula',
		titulo: 'Atividades de idioma com o material da sua aula',
		tituloSeo: 'Atividades com o material da aula',
		descricao:
			'Como transformar as frases, o vocabulário e os textos que você já usa em aula em atividades de escuta, fala, leitura e escrita para a turma.',
		abertura: [
			'O melhor material para a atividade de casa é o que a turma viu em aula: as frases do quadro, a lista de vocabulário da semana, o diálogo do livro. O aluno reconhece o que está ali, e o exercício treina a habilidade em vez de apresentar conteúdo novo.',
			'Os artigos deste tema mostram como escolher esse material e o que fazer com ele em cada tipo de atividade: escutar e escrever o que ouviu, montar a frase com as palavras embaralhadas, completar a lacuna, ler e responder. Cada um traz um exemplo pronto para usar na próxima aula.'
		],
		publico: 'professor'
	},
	{
		slug: 'speaking-e-pronuncia',
		nome: 'Speaking e pronúncia',
		titulo: 'Speaking e pronúncia fora da sala de aula',
		tituloSeo: 'Speaking e pronúncia',
		descricao:
			'Como treinar a fala dos alunos entre uma aula e outra: que frases escolher, como pedir a gravação e o que observar no retorno de pronúncia.',
		abertura: [
			'Em sala, cada aluno fala poucos minutos por aula, e o resto da turma espera. A fala melhora com repetição, e a repetição cabe melhor em casa, no celular, com a frase que o professor escolheu.',
			'Aqui ficam os artigos sobre exercícios de fala: como escolher frases que o aluno consegue repetir, como juntar escuta e fala na mesma atividade e como ler o que o aluno disse para saber o que trabalhar na aula seguinte.'
		],
		publico: 'professor'
	},
	{
		slug: 'correcao-e-acompanhamento',
		nome: 'Correção e acompanhamento',
		titulo: 'Correção de exercícios de idioma e acompanhamento da turma',
		tituloSeo: 'Correção e acompanhamento',
		descricao:
			'Como corrigir exercícios de idioma sem perder a tarde e como descobrir, antes da próxima aula, o que a turma ainda não aprendeu.',
		abertura: [
			'Corrigir trinta cadernos ensina pouco ao professor sobre a turma: no fim da pilha, sobra a nota de cada um e falta o padrão. O que vale saber é qual questão a turma errou junta e quem chegou perto da resposta.',
			'Os artigos deste tema tratam da correção que separa o deslize do erro de verdade, da leitura dos resultados por questão e do retorno para a escrita livre, quando a resposta não cabe num gabarito.'
		],
		publico: 'professor'
	},
	{
		slug: 'atividades-por-idioma',
		nome: 'Atividades por idioma',
		titulo: 'Atividades para cada idioma que você ensina',
		tituloSeo: 'Atividades por idioma',
		descricao:
			'Exercícios para turmas de japonês, chinês, árabe, híndi e dos idiomas europeus, com o que muda na escrita, na leitura e na correção de cada um.',
		abertura: [
			'Japonês não separa palavras por espaço, o árabe corre da direita para a esquerda e o pinyin sem tom vira outra palavra. A atividade que funciona em inglês precisa de ajustes em cada idioma, e quase todo material de apoio é escrito pensando só no inglês.',
			'Aqui ficam os artigos por idioma: como o aluno escreve kana sem teclado japonês, como cobrar o tom no pinyin, como montar exercícios de leitura em árabe. Cada artigo traz frases prontas, conferidas por quem fala o idioma.'
		],
		publico: 'professor'
	},
	{
		slug: 'gestao-da-escola',
		nome: 'Gestão da escola de idiomas',
		titulo: 'Gestão pedagógica na escola de idiomas',
		tituloSeo: 'Gestão da escola de idiomas',
		descricao:
			'Como a coordenação de uma escola de idiomas padroniza as atividades, acompanha as turmas pelos números e integra professores novos.',
		abertura: [
			'Numa escola com vários professores, cada um monta as atividades do seu jeito, e a coordenação só descobre que uma turma ficou para trás quando o semestre acaba. Padronizar não é dar o mesmo material a todos: é combinar o que cada nível treina e acompanhar as turmas pelos mesmos números.',
			'Os artigos deste tema são para quem dirige a escola ou coordena a equipe: como organizar as atividades por nível, como acompanhar as turmas sem invadir a sala de cada professor e como receber um professor novo sem começar do zero.'
		],
		publico: 'escola'
	},
	{
		slug: 'dados-e-privacidade',
		nome: 'Dados e privacidade na escola',
		titulo: 'Dados dos alunos e privacidade na escola de idiomas',
		tituloSeo: 'Dados e privacidade na escola',
		descricao:
			'O que a escola de idiomas precisa saber sobre os dados dos alunos: o que a coordenação deve ver, o cuidado com menores de idade e com gravação de voz.',
		abertura: [
			'Toda escola guarda dados de aluno: nome, contato, notas e, nas atividades de fala, a própria voz. Com aluno menor de idade, a conversa com os responsáveis faz parte do trabalho, e a coordenação precisa saber o que pode e o que não deve ver.',
			'Estes artigos são roteiros, não parecer jurídico: citam a lei pelo número e pelo artigo e mostram o que perguntar ao seu jurídico. Confirme com ele antes de mudar um contrato ou um termo.'
		],
		publico: 'escola'
	},
	{
		slug: 'escolher-uma-plataforma',
		nome: 'Escolher uma plataforma',
		titulo: 'Como escolher uma plataforma de atividades para a escola',
		tituloSeo: 'Escolher uma plataforma',
		descricao:
			'O que perguntar antes de contratar uma plataforma de atividades de idioma para a escola: contrato, conta dos alunos, dados e o que cada professor precisa.',
		abertura: [
			'Trocar de plataforma no meio do semestre custa caro para a escola: professor reaprendendo, aluno perdido, contrato novo. A escolha certa começa pelas perguntas que a demonstração não responde sozinha.',
			'Aqui ficam os artigos para quem vai decidir: o que perguntar sobre os dados dos alunos, se o plano é por professor ou pela escola inteira e o que o aluno precisa instalar ou criar para responder.'
		],
		publico: 'escola'
	}
];

/**
 * O hub das escolas (`/blog/para-escolas`): o mesmo molde de um tema, mas de
 * PÚBLICO. Junta todo artigo marcado para escola, venha do tema que vier, e
 * converte para a conversa sobre o plano da escola.
 */
export const HUB_DAS_ESCOLAS: Omit<TemaDoBlog, 'slug'> = {
	nome: 'Para escolas',
	titulo: 'Para quem dirige uma escola de idiomas',
	tituloSeo: 'Para escolas de idiomas',
	descricao:
		'Artigos para a coordenação da escola de idiomas: padronizar as atividades, acompanhar as turmas pelos números e cuidar dos dados dos alunos.',
	abertura: [
		'A coordenação de uma escola de idiomas decide por processo e responde pelos dados de quem estuda ali. Os artigos desta página são para ela: como combinar o que cada nível treina, como acompanhar as turmas sem invadir a sala de cada professor e o que muda quando o aluno é menor de idade.',
		'No Spokke, a escola tem um contrato só e cada professor entra por convite, com a própria conta. A coordenação vê as turmas e o uso em números, e nunca o nome nem a resposta de um aluno.'
	],
	publico: 'escola'
};

export const SLUGS_DOS_TEMAS = TEMAS.map((t) => t.slug) as [string, ...string[]];

export function temaPorSlug(slug: string): TemaDoBlog | null {
	return TEMAS.find((t) => t.slug === slug) ?? null;
}
