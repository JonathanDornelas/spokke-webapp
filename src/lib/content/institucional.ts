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
 * domínio `spokke.app`, que ainda é PLACEHOLDER (docs/operacao.md).
 */

export interface LegalSection {
	t: string;
	p: string[];
	l?: string[];
	note?: string;
}

function P(t: string, p: string[], extra?: { l?: string[]; note?: string }): LegalSection {
	return { t, p, ...extra };
}

/** O nome que o rodapé e os documentos usam. */
export const legalName = 'Spokke';

export const empresa = { legalName };

/** A data que as quatro páginas legais mostram no topo. Mudou o texto, muda aqui. */
export const atualizadoEm = '9 de novembro de 2026';

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
				'Do professor: nome, e-mail e senha, guardada de forma irreversível. Se você preencher, também os idiomas que ensina e a língua dos seus alunos, que viram o padrão ao criar atividades e turmas, e o avatar que você monta, um desenho e não uma foto.',
				'O material da aula: as frases, os textos, o vocabulário e os diálogos que você cadastra, as questões montadas a partir deles e as mudanças que você faz.',
				'Das turmas: o nome de cada aluno e, se você quiser mandar convites, o e-mail dele.',
				'De quem responde: o nome ou apelido digitado na entrada, as respostas, o tempo em cada questão e o resultado.',
				'Da conta do aluno, que é opcional: nome, e-mail, senha e o avatar escolhido.',
				'A gravação da voz do aluno, só quando ele marca a autorização antes de começar. Sem a marca, a fala é transcrita para a correção e descartada na hora.',
				'Dados técnicos: endereço IP, navegador, data e hora dos acessos e registros de erro.',
				'Da cobrança: o plano, o ciclo e o histórico da assinatura. O pagamento com cartão acontece no ambiente do Mercado Pago, e o número do cartão nunca passa por nós.'
			]
		}
	),
	P('Para que usamos e com que base legal', ['Cada uso tem uma base do art. 7º da LGPD:'], {
		l: [
			'Execução do contrato (art. 7º, V): manter a sua conta, montar as questões a partir do seu material, aplicar as atividades e mostrar os resultados.',
			'Legítimo interesse (art. 7º, IX): prevenir abuso e manter a plataforma segura. É por isso que o formulário de contato e a atividade de exemplo têm limite de uso por endereço IP.',
			'Consentimento (art. 7º, I): guardar a gravação da voz do aluno por 7 dias. Ele decide antes de começar, e responder sem marcar funciona igual.',
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
				'Google, pelo Gemini: só quando você usa "Gerar com IA", e só o pedido que você escreveu com os nomes dos idiomas.',
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
			note: 'Se você é responsável por um aluno e quer saber que dados existem sobre ele, escreva para privacidade@spokke.app. O professor também apaga as respostas e o cadastro de um aluno quando quiser, pela tela da turma.'
		}
	),
	P('Seu material e a IA', [
		'As questões da atividade são montadas pelo próprio Spokke a partir do material que você cadastra, por regras fixas, sem modelo de linguagem e sem enviar o seu material a ninguém.',
		'"Gerar com IA" é opcional e existe nos planos Pro e Super. Quando você usa, o pedido que você escreveu vai ao Gemini para ele propor materiais. Nenhum dado de aluno vai junto, e nada entra na sua biblioteca antes de você marcar e confirmar.',
		'Usamos a modalidade paga do Gemini, em que o que é enviado não treina modelos. Nós também não usamos o seu material nem as respostas dos alunos para isso.',
		'O material e as atividades são seus: você edita e apaga quando quiser.',
		'Se você faz parte de uma escola no plano Scholar, a coordenação vê números das suas turmas, nunca o nome de um aluno nem uma resposta.'
	]),
	P(
		'Por quanto tempo guardamos',
		['Os dados ficam enquanto a sua conta existir. O que tem prazo próprio:'],
		{
			l: [
				'A gravação da voz do aluno: 7 dias, e ela some sozinha.',
				'O áudio das questões de escuta: enquanto alguma atividade sua usar aquela frase. Apagar a atividade apaga o áudio que só ela usava.',
				'Respostas, alunos e turmas: até você apagar, a qualquer momento.',
				'Registros de acesso e documentos fiscais: pelo prazo que a lei manda.'
			],
			note: 'Para encerrar a sua conta, escreva para suporte@spokke.app. Encerrar pelo próprio painel ainda não está disponível.'
		}
	),
	P('Transferência internacional', [
		'O Gemini, do Google, e o Resend tratam dados fora do Brasil. Essas transferências seguem as hipóteses do art. 33 da LGPD.'
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
		'Usamos só o necessário para o produto funcionar, como manter a sua sessão e lembrar onde o aluno parou. Não há cookie de análise nem de publicidade, e cada um está descrito na página de Cookies.'
	]),
	P('Encarregado de dados', [
		'Pedidos sobre dados pessoais vão para privacidade@spokke.app.',
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
		'Você guarda a sua senha e responde pelo que acontece na sua conta. Se suspeitar de acesso indevido, escreva para suporte@spokke.app.',
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
		'O suporte é por e-mail, em suporte@spokke.app.'
	]),
	P('Limitação de responsabilidade', [
		'Na extensão máxima que a lei permite, a responsabilidade total do Spokke por qualquer reclamação ligada ao serviço fica limitada ao que você pagou nos 12 meses anteriores ao fato.',
		'Não respondemos por lucro cessante nem por dano indireto. Nada aqui afasta os direitos do consumidor que a lei torna irrenunciáveis.'
	]),
	P('Encerramento', [
		'Para encerrar a sua conta, escreva para suporte@spokke.app. Podemos suspender ou encerrar contas que violem estes termos, avisando antes sempre que a situação permitir.'
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
			'Sem eles a plataforma não funciona, por isso não há como recusá-los. Nenhum serve para medir audiência ou mostrar anúncio.'
		],
		{
			l: [
				'better-auth.session_token: mantém o professor conectado. Vale 7 dias e se renova enquanto você usa.',
				'spokke-aluno.session_token: o mesmo, para quem entra com a conta de aluno.',
				'spokke_anon: identifica o aparelho que respondeu, para o aluno continuar de onde parou e, se criar conta, levar as respostas junto. Vale 180 dias.',
				'spokke_attempt_<atividade>: a tentativa em andamento naquela atividade. Vale 7 dias.',
				'spokke_aluno_<atividade>: quem chegou pelo link pessoal do convite, para a resposta sair com o nome certo. Vale 30 dias.',
				'spokke_code_<atividade>: o código de acesso já digitado, para a atividade não pedir de novo. Vale 1 dia.'
			],
			note: 'Em conexão segura, o navegador mostra os dois primeiros com o prefixo __Secure-.'
		}
	),
	P(
		'Armazenamento local',
		['Fica só no seu aparelho e guarda preferências e trabalho em andamento:'],
		{
			l: [
				'spokke-theme: o tema claro ou escuro que você escolheu.',
				'spokke-volume: o volume do som de acerto e de erro.',
				'spokke-pronuncia: se o teclado virtual mostra a pronúncia nas teclas.',
				'spokke-mapa-<módulo>: até onde o personagem do mapa já andou, para a animação não se repetir.',
				'spokke:draft:<tentativa>: o rascunho de uma resposta longa, para ele não sumir se a página recarregar.'
			]
		}
	),
	P('Cookies de análise e de publicidade', [
		'Não usamos. Não há pixel de rede social, ferramenta de análise de terceiros nem rastreamento entre sites.'
	]),
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
		'Escreva para acessibilidade@spokke.app contando a tela, o que você tentou fazer e a tecnologia assistiva que usa.',
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
		value: 'suporte@spokke.app',
		note: 'Dúvidas de uso e problemas técnicos.',
		href: 'mailto:suporte@spokke.app'
	},
	{
		label: 'Privacidade',
		value: 'privacidade@spokke.app',
		note: 'Pedidos sobre dados pessoais (LGPD).',
		href: 'mailto:privacidade@spokke.app'
	},
	{
		label: 'Escolas e redes',
		value: 'escolas@spokke.app',
		note: 'Plano Scholar e contrato da escola.',
		href: 'mailto:escolas@spokke.app'
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
				'Não. Cole o que você já usa: a lista de frases do caderno, o texto da aula passada, o vocabulário da unidade. Escreva a frase no idioma que você ensina, e a tradução vem preenchida para você conferir. Nos planos Pro e Super, a IA também propõe material a partir de um pedido seu.'
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
				'Nos planos Pro e Super, a IA propõe materiais a partir de um pedido seu. Cada proposta custa um crédito, e a que não servir é devolvida. Os créditos renovam todo mês, no dia em que o plano foi ativado, e não acumulam.'
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
