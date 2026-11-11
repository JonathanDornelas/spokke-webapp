/**
 * Conteúdo institucional. O texto nunca fica solto numa rota (paginas.md
 * "Grupo (site)"): trocar algo aqui reflete em todas as páginas.
 *
 * **Só o que o produto faz hoje** (revisão de novembro de 2026, registrada no
 * Cérebro do projeto de SEO, `../spokke-seo/project/brain/log.md`). Saíram a
 * história e a equipe inventadas, a encarregada de dados com nome fictício, o
 * endereço e a razão social de exemplo, a página de Status com uptime e
 * incidentes que ninguém media, os nomes de cookie que não existiam e as
 * respostas da ajuda que não batiam com o produto. A voz é a de
 * `brain/voice.md`: direta, em segunda pessoa, sem travessão.
 *
 * O CNPJ, a razão social e o endereço entram quando existirem de verdade — o
 * CNPJ fica fora do site a pedido do dono do repositório. Os e-mails usam o
 * domínio do site, `spokke.com.br` (decidido em 2026-11-10); as caixas ainda
 * precisam ser criadas (docs/operacao.md).
 */

import { CUSTO_IA } from '$lib/billing/catalogo';

export interface LegalSection {
	t: string;
	p: string[];
	l?: string[];
	note?: string;
}

function P(t: string, p: string[], extra?: { l?: string[]; note?: string }): LegalSection {
	return { t, p, ...extra };
}

/** "um crédito", "3 créditos": o custo da IA na ajuda sai de `CUSTO_IA`, o mesmo que o servidor cobra. */
function creditos(n: number): string {
	return n === 1 ? 'um crédito' : `${n} créditos`;
}

/** O nome que o rodapé e os documentos usam. */
export const legalName = 'Spokke';

export const empresa = { legalName };

/** A data que as quatro páginas legais mostram no topo. Mudou o texto, muda aqui. */
export const atualizadoEm = '11 de novembro de 2026';
/** A mesma data em AAAA-MM-DD: o `lastmod` das páginas legais no sitemap (um teste confere as duas). */
export const atualizadoEmIso = '2026-11-11';

/**
 * Selos que aparecem no rodapé. Só entra selo VERIFICÁVEL: o link leva à página
 * do emissor que prova o selo, e a imagem é um arquivo estático em
 * `static/selos/` (nada de script de terceiro no site). Vazio, o rodapé não
 * mostra a faixa. Quais valem a pena e como conseguir cada um:
 * `docs/selos-e-seguranca.md`.
 */
export interface Selo {
	/** O nome do selo, que vira o `alt` e o `title`. */
	nome: string;
	/** A página do EMISSOR que confirma o selo — nunca uma página nossa. */
	verificacao: string;
	/** Arquivo em `static/selos/`, servido como `/selos/<arquivo>`. */
	imagem: string;
	largura: number;
	altura: number;
}

export const selos: Selo[] = [];

/**
 * O domínio do site (o mesmo dos e-mails acima). Os selos de verificação o
 * usam fora de produção; lá o link sai do domínio em que o site está aberto
 * (`SiteFooter.svelte`), que é este mesmo.
 */
export const dominioDoSite = 'spokke.com.br';

/**
 * Os dois selos de VERIFICAÇÃO do rodapé, a pedido do dono do repositório:
 * certificado SSL e Google Safe Browsing. Nenhum dos dois tem imagem oficial de
 * selo, então eles não afirmam nada sozinhos: são links para a verificação AO
 * VIVO de um terceiro (a nota do certificado no SSL Labs e o status do domínio
 * no Transparency Report do Google), com o texto convidando a conferir. Se um
 * dia a verificação der problema, o selo mostra o problema — e aí ele sai daqui
 * (roteiro em `docs/selos-e-seguranca.md`, "Os dois selos do rodapé").
 */
export interface SeloDeVerificacao {
	/** Quem verifica. */
	nome: string;
	/** O que o link faz. */
	acao: string;
	/** A página do terceiro com o resultado para o domínio. */
	verificacao: string;
	/**
	 * O selo em PNG, em `static/selos/` (2x; `largura` e `altura` são as de
	 * exibição). NÃO é imagem de emissor: nem o Google nem a Let's Encrypt têm
	 * selo oficial, e usar a marca deles num "selo" sugeriria um endosso que não
	 * existe. É um selo do Spokke, nas cores da marca, que leva à verificação
	 * do terceiro — feito por `scripts/gerar-selos.mjs`.
	 */
	imagem: { arquivo: string; largura: number; altura: number };
}

export function selosDeVerificacao(dominio: string): SeloDeVerificacao[] {
	const d = encodeURIComponent(dominio);
	return [
		{
			nome: 'Certificado SSL',
			acao: 'Ver a nota no SSL Labs',
			verificacao: `https://www.ssllabs.com/ssltest/analyze.html?d=${d}&latest`,
			imagem: { arquivo: 'ssl.png', largura: 180, altura: 52 }
		},
		{
			nome: 'Google Safe Browsing',
			acao: 'Ver o status do site',
			verificacao: `https://transparencyreport.google.com/safe-browsing/search?url=${d}&hl=pt_BR`,
			imagem: { arquivo: 'safe-browsing.png', largura: 204, altura: 52 }
		}
	];
}

/**
 * As redes sociais do rodapé. Sem `url` o ícone aparece sem link (os perfis
 * ainda não existem); com ela, vira link para o perfil, em nova aba.
 */
export interface Rede {
	nome: 'Instagram' | 'YouTube';
	url: string | null;
}

export const redes: Rede[] = [
	{ nome: 'Instagram', url: null },
	{ nome: 'YouTube', url: null }
];

export const privacidade: LegalSection[] = [
	P('Quem somos e o que esta política cobre', [
		'O Spokke é o controlador dos dados tratados no site, no painel em que o professor monta as atividades e na tela em que o aluno responde.',
		'Aqui está o que guardamos, para quê, com quem compartilhamos e como você exerce os direitos da Lei nº 13.709/2018 (LGPD).'
	]),
	P(
		'Dados que coletamos',
		['Guardamos o que o produto usa para funcionar. Nenhum dado é vendido.'],
		{
			l: [
				'Do professor: nome, e-mail e senha, guardada de forma irreversível. Quem entra com o Google não tem senha: do Google recebemos só o nome, o e-mail e o identificador da conta, sem foto e sem acesso nenhum à conta Google. Se você preencher, também os idiomas que ensina e a língua dos seus alunos, que viram o padrão ao criar atividades e turmas, e o avatar que você monta, um desenho e não uma foto.',
				'O material da aula: as frases, os textos, o vocabulário e os diálogos que você cadastra, as questões montadas a partir deles e as mudanças que você faz.',
				'Das turmas: o nome de cada aluno e, se você quiser mandar convites, o e-mail dele.',
				'De quem responde: o nome ou apelido digitado na entrada, as respostas, o tempo em cada questão e o resultado.',
				'Da conta do aluno, que é opcional: nome, e-mail, senha (ou o Google, no lugar dela, com o mesmo cuidado) e o avatar escolhido.',
				'O relato de problema, quando o aluno manda um de uma questão: o que ele escreveu, a questão, a resposta dele nela e os dados do aparelho (navegador, tela e os erros da página). Sem o nome dele, e só para a equipe do Spokke achar o erro.',
				'A gravação da voz do aluno, só quando ele marca a autorização antes de começar. Sem a marca, a fala é transcrita para a correção e descartada na hora.',
				'Dados técnicos: endereço IP, navegador, data e hora dos acessos e registros de erro.',
				'Da cobrança: o plano, o ciclo e o histórico da assinatura. O pagamento com cartão acontece no ambiente do Mercado Pago, e o número do cartão nunca passa por nós.'
			]
		}
	),
	P('Para que usamos e com que base legal', ['Cada uso tem uma base do art. 7º da LGPD:'], {
		l: [
			'Execução do contrato (art. 7º, V): manter a sua conta, montar as questões a partir do seu material, aplicar as atividades e mostrar os resultados.',
			'Legítimo interesse (art. 7º, IX): prevenir abuso e manter a plataforma segura, e corrigir os erros que os alunos relatam. É por isso que o formulário de contato, a atividade de exemplo e o relato de problema têm limite de uso por endereço IP.',
			'Consentimento (art. 7º, I): guardar a gravação da voz do aluno por 7 dias. Ele decide antes de começar, e responder sem marcar funciona igual.',
			'Consentimento (art. 7º, I): medir a audiência das páginas públicas (a página inicial, os planos e o blog) com o Google Analytics, quando você aceita no aviso dessas páginas. Recusar não muda nada no site, e a medição nunca roda no painel do professor nem nas atividades dos alunos.',
			'Obrigação legal (art. 7º, II): guardar os registros de acesso pelo prazo do art. 15 do Marco Civil da Internet e os documentos fiscais pelo prazo da lei.'
		]
	}),
	P(
		'Com quem compartilhamos',
		['Só com quem presta um serviço que o produto usa, e só o que esse serviço precisa:'],
		{
			l: [
				'Hospedagem e armazenamento: onde ficam o banco de dados e os arquivos de áudio.',
				'Resend, o serviço de e-mail: recebe o endereço e o texto dos convites, dos avisos de conta e dos links de recuperação de senha.',
				'Anthropic, pelo Claude, e Google, pelo Gemini: só quando você usa "Gerar com IA", e só o que você manda: o pedido escrito, os nomes dos idiomas e, se você escolher, a foto de uma página ou a fala do trecho de um vídeo. O pedido vai ao Claude, e ao Gemini só quando o Claude não está disponível. A fala do vídeo vai sempre ao Gemini, porque o Claude não lê áudio.',
				'Google, no login: só quando você escolhe "Continuar com o Google". Ele confirma quem você é; nada do Spokke vai para ele além do pedido de entrada.',
				'Google, pelo Google Analytics: só nas páginas públicas e só com o seu aceite. Recebe dados de navegação, como a página visitada, o tipo de aparelho e de onde veio a visita, sem nome nem e-mail.',
				'Mercado Pago: os dados da cobrança, nos planos pagos.',
				'Autoridades públicas, diante de ordem judicial ou obrigação legal.'
			],
			note: 'A voz das questões de escuta, a transcrição da fala do aluno e a tradução automática do material são feitas na infraestrutura do próprio Spokke. Esse conteúdo não vai para terceiros.'
		}
	),
	P(
		'Dados de alunos e de menores de idade',
		[
			'A relação com o aluno passa pelo professor ou pela escola, que decidem aplicar a atividade e informam a turma.',
			'Para responder, o aluno só digita um nome ou apelido, que pode ser o número da chamada. O e-mail aparece em dois casos, os dois opcionais: quando o professor o cadastra na turma para mandar convites, e quando o próprio aluno cria uma conta.',
			'Com crianças e adolescentes, o tratamento segue o melhor interesse deles (art. 14 da LGPD), e cabe à escola colher o consentimento dos responsáveis quando a lei exigir.'
		],
		{
			note: 'Se você é responsável por um aluno e quer saber que dados existem sobre ele, escreva para privacidade@spokke.com.br. O professor também apaga as respostas e o cadastro de um aluno quando quiser, pela tela da turma.'
		}
	),
	P('Seu material e a IA', [
		'As questões da atividade são montadas pelo próprio Spokke a partir do material que você cadastra, por regras fixas, sem modelo de linguagem e sem enviar o seu material a ninguém.',
		'"Gerar com IA" é opcional e existe nos planos Pro e Super. Quando você usa, o pedido que você escreveu vai ao Claude, da Anthropic, para ele propor materiais (ou ao Gemini, do Google, quando o Claude não está disponível). Nenhum dado de aluno vai junto, e nada entra na sua biblioteca antes de você marcar e confirmar.',
		'Se você parte de uma foto ou de um vídeo, a foto vai junto do pedido. Do vídeo vai só a fala do trecho que você escolheu: o vídeo em si não sai do seu computador. A IA lê o arquivo uma vez para propor o material, e o Spokke não guarda nem a foto nem o áudio. Por isso, use material seu ou didático, sem imagem nem voz de aluno.',
		'Usamos as modalidades pagas dos dois, em que o que é enviado não treina modelos. Nós também não usamos o seu material nem as respostas dos alunos para isso.',
		'O material e as atividades são seus: você edita e apaga quando quiser.',
		'Se você faz parte de uma escola no plano Scholar, a coordenação vê números das suas turmas, nunca o nome de um aluno nem uma resposta.'
	]),
	P(
		'Por quanto tempo guardamos',
		['Os dados ficam enquanto a sua conta existir. O que tem prazo próprio:'],
		{
			l: [
				'A gravação da voz do aluno: 7 dias, e ela some sozinha.',
				'O relato de problema de uma questão: 180 dias, e ele também sai quando a tentativa é apagada.',
				'O áudio das questões de escuta: enquanto alguma atividade sua usar aquela frase. Apagar a atividade apaga o áudio que só ela usava.',
				'Respostas, alunos e turmas: até você apagar, a qualquer momento.',
				'Registros de acesso e documentos fiscais: pelo prazo que a lei manda.'
			],
			note: 'Para encerrar a sua conta, escreva para suporte@spokke.com.br. Encerrar pelo próprio painel ainda não está disponível.'
		}
	),
	P('Transferência internacional', [
		'O Claude, da Anthropic, o Gemini, do Google, e o Resend tratam dados fora do Brasil. Essas transferências seguem as hipóteses do art. 33 da LGPD.'
	]),
	P('Segurança', [
		'A senha fica guardada de forma irreversível, e toda consulta ao banco vai amarrada à conta de quem pede: um professor não chega aos dados de outro. A gravação de voz fica numa área sem acesso público, e só o professor da turma a ouve.',
		'Nenhum sistema é imune. Num incidente de segurança com risco relevante, avisamos a ANPD e as pessoas afetadas nos prazos da LGPD, contando o que aconteceu, que dados foram atingidos e o que estamos fazendo.'
	]),
	P('Seus direitos', ['O art. 18 da LGPD garante a você, a qualquer momento e sem custo:'], {
		l: [
			'Confirmar se tratamos dados seus e ter acesso a eles.',
			'Corrigir dados incompletos, errados ou desatualizados.',
			'Pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados fora da lei.',
			'Pedir a portabilidade dos dados para outro fornecedor.',
			'Eliminar os dados tratados com base no seu consentimento.',
			'Saber com quem compartilhamos os seus dados.',
			'Revogar o consentimento e se opor a um tratamento feito por legítimo interesse.'
		],
		note: 'Respondemos em até 15 dias, como a lei pede. Antes, confirmamos que o pedido é seu, para não entregar dados à pessoa errada.'
	}),
	P('Cookies', [
		'Usamos o necessário para o produto funcionar, como manter a sua sessão e lembrar onde o aluno parou. Nas páginas públicas, os cookies de medição do Google Analytics só são gravados se você aceitar o aviso. Não há cookie de publicidade, e a página de Cookies explica para que serve cada tipo.'
	]),
	P('Encarregado de dados', [
		'Pedidos sobre dados pessoais vão para privacidade@spokke.com.br.',
		'Você também pode levar o pedido direto à Autoridade Nacional de Proteção de Dados (ANPD).'
	]),
	P('Mudanças nesta política', [
		'Quando algo importante mudar, avisamos por e-mail antes de a mudança valer, e a data no topo desta página muda junto.'
	])
];

export const termos: LegalSection[] = [
	P('Aceitação destes termos', [
		'Ao criar uma conta ou usar o Spokke, você concorda com estes Termos de Uso e com a Política de Privacidade. Se aceita em nome de uma escola, você declara ter poderes para isso.'
	]),
	P('O que o Spokke faz', [
		'O Spokke monta atividades de idioma a partir do material da sua aula, como frases, textos, vocabulário e diálogos, e as publica num link para a turma responder. As questões objetivas são corrigidas na hora; a escrita livre, por você.',
		'As decisões de ensino são suas: o material, o que entra na atividade e a revisão antes de publicar.'
	]),
	P('Conta e responsabilidade', [
		'Você guarda a sua senha e responde pelo que acontece na sua conta. Se suspeitar de acesso indevido, escreva para suporte@spokke.com.br.',
		'A conta de professor é para maiores de 18 anos. O aluno responde pelo link, sem cadastro, e a conta de aluno é opcional: serve para ele reencontrar o que já respondeu.'
	]),
	P('Conteúdo que você envia', [
		'O material que você envia continua seu. Ao enviar, você nos dá uma licença limitada, não exclusiva e revogável para guardar, processar e exibir esse material com um único fim: operar a plataforma para você.',
		'Você declara ter o direito de usar o que envia. Não envie material de terceiros protegido por direito autoral sem autorização, como um livro didático digitalizado inteiro.'
	]),
	P('Questões montadas automaticamente', [
		'As questões saem do seu material por regras fixas. A tradução automática e as propostas da IA podem errar no sentido ou na gramática, e por isso a atividade passa pela sua revisão antes de ir para o ar.',
		'O Spokke não garante a correção linguística do que é gerado ou traduzido. Nada chega ao aluno antes de você publicar.'
	]),
	P('Uso aceitável', ['É proibido:'], {
		l: [
			'Publicar conteúdo ilegal, discriminatório, violento ou sexualmente explícito.',
			'Contornar os limites do plano, fazer engenharia reversa, coletar dados de forma automatizada ou sobrecarregar o serviço de propósito.',
			'Revender o acesso ou dividir uma conta entre professores diferentes.'
		]
	}),
	P('Planos, cobrança e cancelamento', [
		'Toda conta nova começa com 14 dias de teste grátis. Depois, o plano é cobrado por ciclo, mensal ou anual, adiantado, e com o pagamento pelo Mercado Pago a assinatura renova sozinha até você cancelar.',
		'Cancelar vale para o próximo ciclo: você usa até o fim do período pago, e nada do que publicou sai do ar. Na primeira contratação, você pode desistir em até 7 dias e receber o valor de volta, como garante o art. 49 do Código de Defesa do Consumidor.'
	]),
	P('Propriedade intelectual', [
		'O software, a marca e o design do Spokke são nossos, e estes termos não transferem nenhum direito sobre eles.',
		'O que você cria a partir do seu material é seu. Os resultados e a chamada da turma saem em planilha (CSV) quando você quiser.'
	]),
	P('Disponibilidade e suporte', [
		'Trabalhamos para manter o Spokke no ar, mas não prometemos funcionamento sem interrupção. Um plano vencido nunca tira do ar uma atividade publicada.',
		'O suporte é por e-mail, em suporte@spokke.com.br.'
	]),
	P('Limitação de responsabilidade', [
		'Na extensão máxima que a lei permite, a responsabilidade total do Spokke por qualquer reclamação ligada ao serviço fica limitada ao que você pagou nos 12 meses anteriores ao fato.',
		'Não respondemos por lucro cessante nem por dano indireto. Nada aqui afasta os direitos do consumidor que a lei torna irrenunciáveis.'
	]),
	P('Encerramento', [
		'Para encerrar a sua conta, escreva para suporte@spokke.com.br. Podemos suspender ou encerrar contas que violem estes termos, avisando antes sempre que a situação permitir.'
	]),
	P('Lei aplicável e foro', [
		'Estes termos seguem a lei brasileira. Quem contrata como consumidor pode acionar a Justiça no foro do próprio domicílio.'
	])
];

export const cookies: LegalSection[] = [
	P('O que são cookies', [
		'Cookies são arquivos pequenos que o site guarda no seu navegador para lembrar de algo entre uma visita e outra. Também usamos o armazenamento local do navegador, que funciona parecido e só é lido pelo próprio Spokke.'
	]),
	P(
		'Cookies essenciais',
		[
			'Sem eles a plataforma não funciona, por isso não há como recusá-los. Nenhum serve para medir audiência ou mostrar anúncio. Usamos esses cookies para:'
		],
		{
			l: [
				'manter você conectado, seja na conta de professor, seja na conta de aluno;',
				'dar segurança à entrada com a conta Google;',
				'lembrar a atividade que o aluno está respondendo, para ele continuar de onde parou;',
				'reconhecer o aluno que chegou pelo convite do professor, para a resposta aparecer com o nome certo;',
				'não pedir de novo o código de acesso que o aluno acabou de digitar.'
			],
			note: 'Eles duram o tempo que a tarefa pede: o da sessão se renova enquanto você usa, e os de uma atividade expiram em poucos dias.'
		}
	),
	P(
		'Armazenamento local',
		['Fica só no seu aparelho e guarda preferências e trabalho em andamento, como:'],
		{
			l: [
				'as preferências de tela, como o tema claro ou escuro e o volume dos sons;',
				'os ajustes do teclado virtual;',
				'o que o aluno já viu no mapa dos módulos;',
				'o rascunho de uma resposta longa, para ele não se perder se a página recarregar;',
				'a sua escolha no aviso de medição das páginas públicas.'
			]
		}
	),
	P(
		'Cookies de medição e de publicidade',
		[
			'De publicidade, não usamos nenhum: não há pixel de rede social nem rastreamento entre sites.',
			'Para saber quais páginas públicas ajudam os professores (a página inicial, os planos e o blog), o site pode usar o Google Analytics, e só depois que você aceita o aviso dessas páginas. Esses cookies contam as visitas de forma anônima. Sem o aceite, nenhum deles é gravado, e a medição nunca roda no painel do professor nem nas atividades dos alunos.'
		],
		{
			note: 'Para mudar de ideia, use "Preferências de cookies" no rodapé das páginas públicas: recusar apaga esses cookies e para a medição.'
		}
	),
	P('Como controlar', [
		'Você apaga cookies e armazenamento local pelas configurações do navegador. Apagar os essenciais desconecta a sua sessão e faz o aparelho esquecer a tentativa em andamento; as respostas já enviadas continuam guardadas.'
	])
];

export const acessibilidade: LegalSection[] = [
	P('Nosso compromisso', [
		'Professores e alunos chegam ao Spokke com necessidades muito diferentes, e a acessibilidade entra no desenho de cada tela desde o começo.',
		'A referência que seguimos é a WCAG 2.1, nível AA, junto da Lei Brasileira de Inclusão (Lei nº 13.146/2015). O produto ainda não passou por uma auditoria externa.'
	]),
	P('O que já funciona', [], {
		l: [
			'Toda questão responde pelo teclado. Montar a frase e pôr em ordem também funcionam por clique e pelas setas, além de arrastar.',
			'Certo, quase e errado aparecem com ícone e texto, nunca só pela cor, e o resultado de cada questão é anunciado para o leitor de tela.',
			'Na tela do aluno, todo botão tem pelo menos 48 pixels, inclusive no computador.',
			'O áudio nunca toca sozinho, e a velocidade troca entre normal, 0,75 e 0,5.',
			'Quem ativa a redução de movimento no sistema não vê as animações de forma e de transição.',
			'O texto segue o contraste mínimo de 4,5:1 nos temas claro e escuro.'
		]
	}),
	P('Limitações conhecidas', ['Onde ainda existe barreira:'], {
		l: [
			'As questões de escuta não mostram o texto do áudio, porque ele é a resposta. Quem não ouve pode pular a questão a qualquer momento.',
			'As questões de fala pedem microfone e um lugar silencioso. O botão de pular fica sempre à vista.'
		]
	}),
	P('Como reportar uma barreira', [
		'Escreva para acessibilidade@spokke.com.br contando a tela, o que você tentou fazer e a tecnologia assistiva que usa.',
		'Barreira que impede um aluno de terminar uma atividade passa na frente de tudo.'
	])
];

export const legalPages = { privacidade, termos, cookies, acessibilidade };

export interface Canal {
	label: string;
	value: string;
	note: string;
	href: string;
}

export const canais: Canal[] = [
	{
		label: 'Suporte',
		value: 'suporte@spokke.com.br',
		note: 'Dúvidas de uso e problemas técnicos.',
		href: 'mailto:suporte@spokke.com.br'
	},
	{
		label: 'Privacidade',
		value: 'privacidade@spokke.com.br',
		note: 'Pedidos sobre dados pessoais (LGPD).',
		href: 'mailto:privacidade@spokke.com.br'
	},
	{
		label: 'Escolas e redes',
		value: 'escolas@spokke.com.br',
		note: 'Plano Scholar e contrato da escola.',
		href: 'mailto:escolas@spokke.com.br'
	}
];

export const aboutParas: string[] = [
	'O material da aula já existe: está no caderno, na apostila, na lista de frases da semana passada. O que toma tempo é transformar isso em exercício, corrigir e devolver para cada aluno, e é esse trecho que o Spokke assume.',
	'Você cola o material e ele vira questões de escuta, fala, leitura e escrita. A correção sai na hora e conta "workin" como quase, não como erro; no seu relatório, quem chegou perto fica separado de quem errou de vez. A escrita livre continua com você, que lê e dá a nota.',
	'Não há banco de exercícios prontos nem currículo sugerido. A frase que funciona numa turma de sexto ano não serve para uma turma de executivos, e quem sabe qual é a certa é quem dá a aula. Por isso toda atividade passa pela sua revisão antes de chegar à turma.',
	'Do outro lado, o aluno abre o link no celular, digita o nome e responde. A conta dele é opcional e serve para duas coisas: reencontrar o que já fez em outro aparelho e ver os módulos da turma num mapa.'
];

export interface Principle {
	t: string;
	d: string;
	icon: string;
}

export const principles: Principle[] = [
	{
		t: 'O professor decide',
		d: 'Nada chega ao aluno sem você publicar. O Spokke propõe as questões, e a palavra final é sua.',
		icon: 'M12 3l8 4v6c0 4.2-3.2 7.4-8 8.5C7.2 20.4 4 17.2 4 13V7z'
	},
	{
		t: 'Falhar em voz alta',
		d: 'Quando um material não rende questão ou um serviço sai do ar, a tela diz o motivo e o que fazer. Erro silencioso custa uma aula.',
		icon: 'M12 3.5l9.5 16.5H2.5zM12 9.5v4.5M12 17h.01'
	},
	{
		t: 'Menos campos',
		d: 'Cada campo a mais é uma decisão pedida antes da hora. A habilidade sai do tipo de questão, e o nível é um rótulo que você usa se quiser.',
		icon: 'M4 7h16M4 12h10M4 17h6'
	}
];

export interface FaqGroup {
	t: string;
	items: [pergunta: string, resposta: string][];
}

export const faqGrupos: FaqGroup[] = [
	{
		t: 'Começando',
		items: [
			[
				'Preciso preparar o material antes?',
				'Não. Cole o que você já usa: a lista de frases do caderno, o texto da aula passada, o vocabulário da unidade. Escreva a frase no idioma que você ensina, e a tradução vem preenchida para você conferir. Nos planos Pro e Super, a IA também propõe material a partir de um pedido seu, da foto de uma página ou da fala de um vídeo.'
			],
			[
				'Como o aluno recebe a atividade?',
				'Por um link. Você manda no grupo da turma, projeta o QR code na sala ou envia por e-mail aos alunos cadastrados. Se quiser, a atividade pede um código de quatro letras antes de começar.'
			],
			[
				'Funciona para qual idioma?',
				'Para dez: português, espanhol, inglês dos Estados Unidos e do Reino Unido, francês, italiano, híndi, mandarim, japonês e árabe. Em árabe ainda não há questão de escuta, porque a voz sintética não fala o idioma; o resto funciona igual. O idioma define a fonte, a direção do texto e como a correção separa as palavras.'
			]
		]
	},
	{
		t: 'Conteúdo e geração',
		items: [
			[
				'Por que não escolho a habilidade de cada questão?',
				'Porque ela sai do tipo de questão: ouvir e digitar treina escuta e escrita, repetir em voz alta treina fala. Ao criar a atividade, você diz quais habilidades ela deve treinar e quantas questões quer, e o Spokke separa as que se encaixam.'
			],
			[
				'Um material pode não render questão?',
				'Pode, e você vê isso antes de gerar. Ao cadastrar, a tela mostra quanto o conjunto já rende. Uma pergunta de escolha, por exemplo, precisa de outros termos no conjunto, porque as alternativas erradas saem do seu próprio material.'
			],
			[
				'Posso editar uma questão?',
				'Pode. Nas questões de digitar e de completar a lacuna, você muda o enunciado, a resposta certa e as respostas aceitas. Nas outras, a resposta certa vem do material: para trocar, edite o material e gere de novo. Também dá para criar uma questão do zero.'
			]
		]
	},
	{
		t: 'Alunos e turmas',
		items: [
			[
				'O aluno precisa criar conta?',
				'Não. Ele abre o link, digita um nome ou apelido e responde. A conta é opcional: serve para reencontrar o histórico em outro aparelho e ver os módulos da turma num mapa. Você convida cada aluno a criar a dele por e-mail ou mandando o link.'
			],
			[
				'Dá para ver onde a turma errou?',
				'Dá. Os resultados ordenam as questões da que menos gente acertou para a que mais acertou, e quem chegou perto aparece separado de quem errou. Clicando num aluno, você vê o que ele respondeu em cada questão.'
			],
			[
				'Como funciona a correção da escrita livre?',
				'Ela não tem correção automática. Você abre a tentativa do aluno, lê a resposta e marca se atende, atende em parte ou não atende, com um comentário se quiser. O sino do painel avisa quando há resposta esperando por você.'
			]
		]
	},
	{
		t: 'Planos e limites',
		items: [
			[
				'Como começo?',
				'Toda conta nova tem 14 dias de teste grátis com os limites do plano Básico. Antes do fim, escolha um plano na página de planos; ele libera assim que o pagamento é confirmado.'
			],
			[
				'O que conta no limite de atividades e de materiais?',
				'O que existe agora na sua conta, não o que você criou no mês. Rascunho e atividade no ar contam; atividade arquivada não. Material igual a um que você já tem é reaproveitado e não ocupa vaga nova.'
			],
			[
				'Cheguei ao limite. Preciso apagar alguma coisa?',
				'Não precisa apagar: arquive. Arquivar fecha o link para quem ainda não começou, guarda todos os resultados e libera a vaga, e quem já estava respondendo termina normalmente. Na biblioteca, apagar um material não mexe em nenhuma atividade.'
			],
			[
				'O que são os créditos de IA?',
				`Nos planos Pro e Super, a IA propõe materiais a partir de um pedido seu, de uma foto ou de um vídeo. Cada proposta custa ${creditos(CUSTO_IA.porProposta)}, e a que não servir é devolvida. Ler uma foto custa ${creditos(CUSTO_IA.porImagem)} a mais, e cada minuto de fala de um vídeo, ${creditos(CUSTO_IA.porMinutoDeFala)}; o botão de gerar mostra o total antes do clique. Os créditos renovam todo mês, no dia em que o plano foi ativado, e não acumulam.`
			],
			[
				'E se o meu plano vencer?',
				'Nada é apagado e nenhum link sai do ar: as atividades publicadas continuam recebendo respostas. O que pausa é criar e publicar, do seu lado, até você renovar.'
			],
			[
				'Como cancelo?',
				'Na sua conta, aba Assinatura: "Cancelar no fim do período". Você usa até o último dia pago, e nada do que publicou sai do ar.'
			]
		]
	},
	{
		t: 'Módulos e nível',
		items: [
			[
				'O que é um módulo?',
				'Uma sequência de atividades com nome, como "Unidade 3" ou "Frutas". Você escolhe as turmas e programa quando cada atividade abre: tudo de uma vez, uma por semana ou em datas marcadas. Na data, ela aparece no mapa de quem tem conta ligada à turma. Uma atividade pode estar em vários módulos.'
			],
			[
				'O nível muda os exercícios?',
				'Não. O nível (de A1 a C2) é um rótulo seu: organiza e filtra a lista e aparece para o aluno ao lado do idioma. Os exercícios continuam saindo do material.'
			]
		]
	},
	{
		t: 'Escolas',
		items: [
			[
				'Como funciona o plano da escola?',
				'A escola contrata o Scholar com limites combinados por professor. A coordenação convida os professores, e quem aceita passa a usar o plano da escola no lugar do próprio.'
			],
			[
				'O que a coordenação vê das minhas turmas?',
				'Só números: quantos alunos, quantos envios, quantas tentativas terminadas e o acerto médio de cada turma. Nunca o nome de um aluno nem uma resposta. O seu conteúdo continua seu, inclusive se você sair da escola.'
			]
		]
	}
];
