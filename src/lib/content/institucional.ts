/**
 * Conteúdo institucional. Trocar os dados da empresa aqui reflete em todas as
 * páginas — o texto nunca fica solto numa rota (paginas.md "Grupo (site)").
 *
 * Os dados abaixo são de EXEMPLO (nome, CNPJ, endereço, contatos, status dos
 * serviços) e precisam ser substituídos pelos reais antes de publicar.
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

export const legalName = 'Entendo Tecnologia Educacional Ltda.';
export const legalDoc = 'CNPJ 12.345.678/0001-90';
export const address1 = 'Rua das Laranjeiras, 210 · conj. 74';
export const address2 = 'Pinheiros, São Paulo/SP · 05422-000';

export const empresa = { legalName, legalDoc, address1, address2 };

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
		legalName +
			', inscrita no ' +
			legalDoc +
			', é a controladora dos dados pessoais tratados na plataforma entendo — o site institucional, o Studio (onde o professor cria atividades) e o Player (onde o aluno responde).',
		'Esta política explica quais dados coletamos, por que coletamos, com quem compartilhamos e como você exerce seus direitos sob a Lei nº 13.709/2018 (LGPD).'
	]),
	P(
		'Dados que coletamos',
		[
			'Coletamos apenas o necessário para a plataforma funcionar. Nenhum dado é vendido, em nenhuma hipótese.'
		],
		{
			l: [
				'Cadastro do professor: nome, e-mail e senha em hash. Opcionalmente, os idiomas que você ensina e a língua dos seus alunos, usados só como padrão ao criar atividades e turmas.',
				'Conteúdo de autoria: os materiais que você cola ou envia no Studio, os itens gerados a partir deles e os ajustes que você faz.',
				'Dados de aluno: nome ou apelido informado na entrada da atividade, respostas enviadas, tempo por item e pontuação.',
				'Dados técnicos: endereço IP, tipo de navegador, sistema operacional, data e hora dos acessos e registros de erro.',
				'Cobrança: em planos pagos, os dados de faturamento tratados pelo nosso processador de pagamentos. Não armazenamos número de cartão.'
			]
		}
	),
	P(
		'Para que usamos e com que base legal',
		['Cada finalidade tem uma base legal do art. 7º da LGPD:'],
		{
			l: [
				'Executar o contrato (art. 7º, V): criar e manter sua conta, gerar itens a partir dos seus materiais, aplicar atividades e devolver resultados.',
				'Legítimo interesse (art. 7º, IX): medir uso agregado para melhorar o produto, prevenir fraude e abuso, e manter a segurança da plataforma.',
				'Consentimento (art. 7º, I): envio de comunicações de marketing e uso de cookies não essenciais. Você pode revogar a qualquer momento.',
				'Obrigação legal (art. 7º, II): guarda de registros de acesso por seis meses, conforme o art. 15 do Marco Civil da Internet.'
			]
		}
	),
	P(
		'Com quem compartilhamos',
		[
			'Compartilhamos dados apenas com operadores que precisam deles para prestar um serviço à entendo, sempre sob contrato que os obriga a tratar os dados conforme esta política.'
		],
		{
			l: [
				'Infraestrutura em nuvem, para hospedagem e banco de dados.',
				'Provedor de modelos de linguagem (Google Gemini), só quando você usa "Gerar com IA".',
				'Serviço de e-mail transacional, para avisos de conta e de atividade.',
				'Processador de pagamentos, nos planos pagos.',
				'Autoridades públicas, quando houver ordem judicial ou obrigação legal.'
			],
			note: 'A lista atualizada de operadores, com país de hospedagem, está disponível mediante pedido ao encarregado.'
		}
	),
	P(
		'Dados de alunos e de menores de idade',
		[
			'A relação com o aluno é sempre intermediada pela instituição de ensino ou pelo professor, que é quem decide aplicar a atividade e quem informa os alunos.',
			'A entendo não exige e-mail, telefone, documento ou foto de aluno. A entrada na atividade pede apenas um nome ou apelido, que pode ser um código da turma.',
			'Tratando-se de crianças e adolescentes, o tratamento é feito no melhor interesse do titular (art. 14 da LGPD) e cabe à instituição obter o consentimento específico e destacado do responsável legal quando a legislação exigir.'
		],
		{
			note: 'Se você é responsável por um aluno e quer saber quais dados existem sobre ele, escreva para o encarregado. Nós encaminhamos o pedido à instituição e respondemos junto com ela.'
		}
	),
	P('Uso do seu conteúdo e geração por IA', [
		'Os exercícios da atividade são gerados nos nossos próprios servidores, a partir dos materiais que você cadastra, sem enviar esse conteúdo a terceiros.',
		'"Gerar com IA" é opcional: quando você usa, o pedido que você escreveu e os nomes dos idiomas vão ao provedor de modelo de linguagem para ele propor materiais. Nenhum dado de aluno é enviado, e nada entra na sua biblioteca antes de você marcar e confirmar.',
		'Não usamos o seu conteúdo, nem as respostas dos seus alunos, para treinar modelos. Usamos a modalidade paga do provedor, em que os dados enviados não são usados para treinamento.',
		'Os materiais e as atividades são seus. Você pode editar e excluir a qualquer momento.',
		'Se você faz parte de uma escola no plano Scholar, a coordenação vê números agregados das suas turmas — nunca nomes de alunos nem respostas.'
	]),
	P(
		'Por quanto tempo guardamos',
		[
			'Guardamos os dados enquanto sua conta estiver ativa e pelo tempo necessário às finalidades acima.'
		],
		{
			l: [
				'Conta e conteúdo de autoria: até a exclusão da conta, mais 30 dias de retenção técnica em backup.',
				'Respostas e resultados de alunos: 24 meses após o fim da atividade, ou antes, se a instituição pedir.',
				'Registros de acesso: 6 meses, por obrigação legal.',
				'Dados fiscais de cobrança: 5 anos, por obrigação legal.'
			]
		}
	),
	P('Transferência internacional', [
		'Parte da nossa infraestrutura e o provedor de modelos de linguagem estão fora do Brasil. Essas transferências ocorrem com base em cláusulas contratuais padrão e nas garantias do art. 33 da LGPD.'
	]),
	P('Segurança', [
		'Adotamos criptografia em trânsito (TLS 1.3) e em repouso, controle de acesso por função, autenticação em duas etapas para a equipe interna, registro de auditoria em operações sensíveis e revisão periódica de dependências.',
		'Nenhum sistema é imune. Em caso de incidente de segurança com risco relevante, comunicamos a ANPD e os titulares afetados nos prazos da LGPD, descrevendo o que aconteceu, quais dados foram atingidos e o que estamos fazendo.'
	]),
	P('Seus direitos', ['O art. 18 da LGPD garante a você, a qualquer momento e sem custo:'], {
		l: [
			'Confirmar se tratamos dados seus e acessar esses dados.',
			'Corrigir dados incompletos, inexatos ou desatualizados.',
			'Pedir anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.',
			'Pedir a portabilidade dos dados a outro fornecedor.',
			'Eliminar dados tratados com base em consentimento.',
			'Saber com quais entidades compartilhamos seus dados.',
			'Revogar o consentimento e se opor a tratamento feito com base em legítimo interesse.'
		],
		note: 'Pedidos são respondidos em até 15 dias. Precisamos confirmar sua identidade antes de atender, para não entregar dados à pessoa errada.'
	}),
	P('Cookies', [
		'Usamos cookies essenciais para manter sua sessão e cookies analíticos para entender quais telas travam o professor. Os analíticos só são ativados com o seu aceite, e o detalhe de cada cookie está na página de Cookies.'
	]),
	P('Encarregado de dados', [
		'Nossa encarregada (DPO) é Marina Vieira. Fale com ela em privacidade@entendo.app ou pelo endereço postal ' +
			address1 +
			', ' +
			address2 +
			'.',
		'Você também pode peticionar diretamente à Autoridade Nacional de Proteção de Dados (ANPD).'
	]),
	P('Mudanças nesta política', [
		'Se mudarmos algo material, avisamos por e-mail e dentro do Studio pelo menos 15 dias antes de a mudança valer. O histórico de versões fica publicado nesta página.'
	])
];

export const termos: LegalSection[] = [
	P('Aceitação destes termos', [
		'Ao criar uma conta ou usar a entendo, você concorda com estes Termos de Uso e com a Política de Privacidade. Se você aceita em nome de uma escola, declara ter poderes para isso.'
	]),
	P('O que a entendo faz', [
		'A entendo transforma material de aula — frases, textos, vocabulário, diálogos — em atividades de idioma que o aluno responde no Player, com correção automática nos formatos objetivos e correção humana nos formatos abertos.',
		'A plataforma é uma ferramenta de autoria. As decisões pedagógicas, a escolha do material e a revisão dos itens são do professor.'
	]),
	P('Conta e responsabilidade', [
		'Você é responsável por manter a senha em sigilo e por tudo que acontecer na sua conta. Avise imediatamente em suporte@entendo.app se suspeitar de acesso indevido.',
		'É preciso ter 18 anos ou mais para criar conta de professor. Alunos acessam atividades por link ou código, sem cadastro.'
	]),
	P('Conteúdo que você envia', [
		'Você continua dono de todo material que envia. Ao enviar, você nos concede uma licença limitada, não exclusiva e revogável para armazenar, processar e exibir esse material com o único fim de operar a plataforma para você.',
		'Você declara que tem direito de usar o material enviado. Não envie conteúdo protegido por direito autoral de terceiros sem autorização — livro didático digitalizado inteiro, por exemplo.'
	]),
	P(
		'Itens gerados automaticamente',
		[
			'Os itens são propostas geradas por modelo de linguagem a partir do seu material. Eles podem conter erro de gramática, de sentido ou de nível.',
			'A revisão antes de publicar é obrigatória e é sua. A entendo não garante correção pedagógica ou linguística dos itens gerados, e a etapa de revisão existe exatamente por isso.'
		],
		{ note: 'Nada é publicado para aluno sem passar pela sua confirmação na etapa de revisão.' }
	),
	P('Uso aceitável', ['É proibido:'], {
		l: [
			'Usar a plataforma para conteúdo ilegal, discriminatório, violento ou sexualmente explícito.',
			'Tentar burlar limites de plano, engenharia reversa, raspagem automatizada ou sobrecarga proposital dos serviços.',
			'Revender acesso à conta ou compartilhar credenciais entre professores diferentes.',
			'Usar a saída do gerador para treinar outro modelo de linguagem.'
		]
	}),
	P('Planos, cobrança e cancelamento', [
		'Planos pagos são cobrados por ciclo, antecipadamente, com renovação automática até que você cancele. O cancelamento vale para o próximo ciclo e mantém o acesso até o fim do período pago.',
		'Reembolso integral em até 7 dias da primeira contratação, conforme o art. 49 do Código de Defesa do Consumidor. Reajustes anuais são comunicados com 30 dias de antecedência.'
	]),
	P('Propriedade intelectual', [
		'O software, a marca, o design e a documentação da entendo são nossos. Estes termos não transferem nenhum direito sobre eles.',
		'As atividades que você cria a partir do seu material são suas e podem ser exportadas quando você quiser.'
	]),
	P('Disponibilidade e suporte', [
		'Trabalhamos para manter a plataforma disponível, mas não prometemos operação ininterrupta. Manutenções programadas são anunciadas na página de Status com pelo menos 48 horas de antecedência, fora de horário letivo sempre que possível.',
		'Suporte por e-mail em dias úteis, das 9h às 18h (horário de Brasília).'
	]),
	P('Limitação de responsabilidade', [
		'Na máxima extensão permitida pela lei aplicável, a responsabilidade total da entendo por qualquer reclamação relacionada ao serviço fica limitada ao valor pago por você nos 12 meses anteriores ao fato.',
		'Não respondemos por lucros cessantes, perda de oportunidade pedagógica ou dano indireto. Nada aqui afasta direitos irrenunciáveis do consumidor.'
	]),
	P('Rescisão', [
		'Você pode encerrar sua conta quando quiser, pelas configurações. Podemos suspender ou encerrar contas que violem estes termos, com aviso prévio sempre que a situação permitir.',
		'Depois do encerramento, você tem 30 dias para exportar seu conteúdo antes da exclusão definitiva.'
	]),
	P('Lei aplicável e foro', [
		'Estes termos são regidos pela lei brasileira. Fica eleito o foro da comarca de São Paulo/SP para dirimir controvérsias, ressalvado o direito do consumidor de acionar o foro do seu domicílio.'
	])
];

export const cookies: LegalSection[] = [
	P('O que são cookies', [
		'Cookies são arquivos pequenos que o site guarda no seu navegador para lembrar de algo entre uma visita e outra. Usamos também tecnologias equivalentes, como armazenamento local.'
	]),
	P(
		'Cookies essenciais',
		['Sempre ativos. Sem eles a plataforma não funciona e não há como recusá-los.'],
		{
			l: [
				'en_session — mantém você autenticado no Studio. Expira em 30 dias.',
				'en_csrf — protege formulários contra requisição forjada. Expira ao fechar o navegador.',
				'en_theme — guarda a sua escolha de tema claro ou escuro. Expira em 1 ano.',
				'en_player_progress — guarda a posição do aluno na atividade para ele não perder o trabalho. Expira em 7 dias.'
			]
		}
	),
	P(
		'Cookies analíticos',
		[
			'Só são gravados depois do seu aceite no banner. Servem para entender em que tela o professor desiste e o que quebra em qual navegador. Os dados são agregados e não identificam você individualmente.'
		],
		{
			l: [
				'en_anon_id — identificador anônimo de sessão de uso. Expira em 6 meses.',
				'en_funnel — etapa alcançada na criação de atividade. Expira em 30 dias.'
			]
		}
	),
	P('Cookies de marketing', [
		'Não usamos. Não há pixel de rede social nem rastreamento entre sites na entendo.'
	]),
	P('Como controlar', [
		'Você pode revisar sua escolha a qualquer momento pelo link "Preferências de cookies" no rodapé, ou apagar os cookies pelas configurações do seu navegador. Apagar os essenciais desconecta a sua sessão.'
	])
];

export const acessibilidade: LegalSection[] = [
	P('Nosso compromisso', [
		'A entendo é usada por professores e alunos com necessidades muito diferentes. Tratamos acessibilidade como requisito de produto, não como ajuste posterior.',
		'Nosso alvo é a WCAG 2.1 nível AA, e a conformidade com a Lei Brasileira de Inclusão (Lei nº 13.146/2015) e com o eMAG nos pontos aplicáveis.'
	]),
	P('O que já está implementado', [], {
		l: [
			'Contraste mínimo de 4.5:1 para texto e 3:1 para elementos de interface, verificado nos temas claro e escuro.',
			'Navegação completa por teclado, com foco visível e ordem de tabulação previsível em todas as telas do Studio e do Player.',
			'Alvos de toque de no mínimo 44 por 44 pixels no mobile.',
			'Rótulos e descrições em português para leitores de tela, com regiões marcadas semanticamente.',
			'Respeito à preferência do sistema por movimento reduzido: as animações de forma e transição são desligadas.',
			'Texto redimensionável até 200% sem perda de conteúdo ou função.',
			'Nenhuma informação transmitida só por cor — estados sempre têm rótulo ou ícone junto.'
		]
	}),
	P('Limitações conhecidas', ['Somos honestos sobre onde ainda não chegamos:'], {
		l: [
			'Itens de áudio dependem do material enviado pelo professor e nem sempre têm transcrição; estamos gerando transcrição automática como padrão.',
			'A tela de resultados usa gráficos que ainda não têm alternativa em tabela navegável.',
			'A montagem de frase por arrastar ainda não tem equivalente completo por teclado em telas estreitas.'
		]
	}),
	P('Como reportar uma barreira', [
		'Escreva para acessibilidade@entendo.app descrevendo a tela, o que você tentou fazer e a tecnologia assistiva usada. Respondemos em até 5 dias úteis com um prazo de correção.',
		'Barreira que impeça um aluno de concluir uma atividade entra como incidente e é tratada com prioridade máxima.'
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
		value: 'suporte@entendo.app',
		note: 'Dúvidas de uso e problemas técnicos. Dias úteis, 9h às 18h.',
		href: 'mailto:suporte@entendo.app'
	},
	{
		label: 'Privacidade',
		value: 'privacidade@entendo.app',
		note: 'Encarregada de dados: Marina Vieira. Pedidos da LGPD em até 15 dias.',
		href: 'mailto:privacidade@entendo.app'
	},
	{
		label: 'Escolas e redes',
		value: 'escolas@entendo.app',
		note: 'Implantação, formação de equipe e planos por instituição.',
		href: 'mailto:escolas@entendo.app'
	},
	{
		label: 'Imprensa',
		value: 'imprensa@entendo.app',
		note: 'Materiais de marca e pedidos de entrevista.',
		href: 'mailto:imprensa@entendo.app'
	}
];

export const aboutParas: string[] = [
	'A entendo começou numa sala de professores em 2024, com uma reclamação repetida: preparar uma atividade boa leva mais tempo do que aplicá-la. O material já existe — está no caderno, na apostila, na conversa da aula anterior. O que falta é o trabalho mecânico de virar isso em exercício, corrigir e devolver.',
	'Decidimos atacar exatamente esse trecho. A entendo não escolhe o que sua turma precisa aprender e não sugere currículo. Ela pega o material que você já usa e devolve itens prontos para revisão, com correção automática onde faz sentido e correção humana onde não faz.',
	'Isso muda o formato do produto. Não há banco de exercícios genéricos, porque a frase que funciona na sua turma de sexto ano de uma escola pública do interior não é a mesma que funciona numa turma de executivos. Há um gerador que lê o seu material, e uma etapa de revisão onde você tem a palavra final.',
	'Somos uma equipe pequena em São Paulo, formada por professores de idioma e gente de produto. Metade da equipe já deu aula. É por isso que a etapa de revisão nunca foi opcional.'
];

export interface Principle {
	t: string;
	d: string;
	icon: string;
}

export const principles: Principle[] = [
	{
		t: 'O professor decide',
		d: 'Nada vai para o aluno sem passar pela confirmação de quem dá a aula. O gerador propõe; a palavra final é sempre humana.',
		icon: 'M12 3l8 4v6c0 4.2-3.2 7.4-8 8.5C7.2 20.4 4 17.2 4 13V7z'
	},
	{
		t: 'Falhar em voz alta',
		d: 'Quando um material não gera nada ou um serviço degrada, a tela diz o motivo e o que fazer. Erro silencioso custa uma aula.',
		icon: 'M12 3.5l9.5 16.5H2.5zM12 9.5v4.5M12 17h.01'
	},
	{
		t: 'Menos campos',
		d: 'Cada campo a mais é uma decisão empurrada para antes da hora. Habilidade e formato saem do material, não de um formulário — e o nível, quando você quer marcar, é um rótulo opcional.',
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
				'Não. Você cola o que já tem — a lista de frases do caderno, o texto que passou na aula passada, a lista de vocabulário. O gerador lê esse material e propõe itens. Se você não tiver nada em mãos, dá para escrever três frases direto no campo e seguir.'
			],
			[
				'Quanto tempo leva para criar a primeira atividade?',
				'Entre três e cinco minutos: título e idiomas, colar o material, esperar a geração e revisar os itens. A revisão é a parte que consome mais tempo, e é a que vale a pena.'
			],
			[
				'Funciona para qual idioma?',
				'Qualquer idioma com escrita alfabética ou silábica. Inglês, espanhol, francês, alemão, italiano e japonês estão em uso hoje. O idioma alvo define fonte, direção do texto e como o corretor separa as palavras.'
			]
		]
	},
	{
		t: 'Conteúdo e geração',
		items: [
			[
				'Por que não escolho a habilidade?',
				'Porque habilidade não é um campo: ela sai da combinação entre o material que você cola, a interação gerada e a forma de correção. Você vê quais habilidades a atividade treina na etapa de publicar, já derivadas do que existe de fato.'
			],
			[
				'Um material pode não gerar nada?',
				'Pode, e a tela avisa em vez de falhar em silêncio. Parear, por exemplo, precisa de pelo menos seis palavras para não ficar óbvio. Quando isso acontece você vê o motivo e um botão para completar o material.'
			],
			[
				'Posso editar um item gerado?',
				'Todos. Cada item abre no editor com o enunciado, as alternativas, a resposta certa e a regra de correção. Você também pode criar um item do zero, sem passar pelo gerador.'
			]
		]
	},
	{
		t: 'Alunos e turmas',
		items: [
			[
				'O aluno precisa criar conta?',
				'Não. Ele entra por link ou por um código de seis caracteres e informa só um nome ou apelido. Nenhum e-mail, telefone ou documento é pedido.'
			],
			[
				'Dá para ver onde a turma errou?',
				'A tela de resultados mostra item a item quantos acertaram, quanto tempo cada um levou e quais distratores foram escolhidos. É essa última coluna que costuma indicar o que revisar na próxima aula.'
			],
			[
				'Como funciona a correção de escrita longa?',
				'Itens de escrita longa não são corrigidos automaticamente. Eles ficam numa fila para você corrigir, com o texto do aluno e o material de origem lado a lado.'
			]
		]
	},
	{
		t: 'Planos e limites',
		items: [
			[
				'Como começo?',
				'Toda conta nova começa num período de teste, sem cartão, com os limites do plano Básico. Antes de ele acabar, escolha um plano em Planos — a equipe confirma o pagamento e ativa.'
			],
			[
				'O que conta no limite de atividades e de materiais?',
				'O que existe agora na sua conta, não o que você criou no mês. Rascunho e atividade no ar contam; atividade arquivada não. Material igual a um que você já tem é reaproveitado e não ocupa vaga nova.'
			],
			[
				'Cheguei ao limite. Preciso apagar alguma coisa?',
				'Não precisa apagar: arquive. Arquivar fecha o link para quem ainda não começou, guarda todos os resultados e libera a vaga. Quem já estava respondendo termina normalmente. Na biblioteca, apagar um material não mexe em nenhuma atividade.'
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
				'Em Conta › Assinatura, "Cancelar no fim do período". Até lá nada muda, e dá para desfazer.'
			]
		]
	},
	{
		t: 'Módulos e nível',
		items: [
			[
				'O que é um módulo?',
				'Uma sequência de atividades com nome — "Intermediário", "Frutas", "Unidade 3". Ele organiza a sua lista e manda tudo de uma vez para a turma, com um e-mail só por aluno trazendo todos os links. Uma atividade pode estar em vários módulos.'
			],
			[
				'O nível muda os exercícios?',
				'Não. O nível (A1 a C2) é um rótulo seu: organiza e filtra a lista e aparece para o aluno ao lado do idioma. Os exercícios continuam saindo do material.'
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
				'Só números: quantos alunos, envios, tentativas terminadas e o acerto médio de cada turma. Nunca o nome de um aluno nem uma resposta. Seu conteúdo continua seu, inclusive se você sair da escola.'
			]
		]
	}
];

export type ServiceTone = 'ok' | 'part' | 'err' | 'mute';

export interface Service {
	name: string;
	note: string;
	state: string;
	tone: ServiceTone;
	uptime: string;
}

export const servicos: Service[] = [
	{
		name: 'Studio',
		note: 'Criação e edição de atividades',
		state: 'Operando',
		tone: 'ok',
		uptime: '99,98%'
	},
	{
		name: 'Player',
		note: 'Aplicação de atividade para alunos',
		state: 'Operando',
		tone: 'ok',
		uptime: '99,99%'
	},
	{
		name: 'Geração de itens',
		note: 'Fila mais longa que o normal desde 14h20',
		state: 'Degradado',
		tone: 'part',
		uptime: '99,71%'
	},
	{
		name: 'Autenticação',
		note: 'Entrada e recuperação de senha',
		state: 'Operando',
		tone: 'ok',
		uptime: '100%'
	},
	{
		name: 'API pública',
		note: 'Integrações de escola',
		state: 'Operando',
		tone: 'ok',
		uptime: '99,95%'
	}
];

export interface Incident {
	date: string;
	tone: ServiceTone;
	title: string;
	body: string;
}

export const incidentes: Incident[] = [
	{
		date: '03 set 2026 · 14h20',
		tone: 'part',
		title: 'Fila de geração acima do normal',
		body: 'Um pico de uso simultâneo deixou a geração de itens entre 40 e 90 segundos, contra os 15 habituais. Nenhum item foi perdido e nenhuma atividade publicada foi afetada. Estamos ampliando a capacidade da fila.'
	},
	{
		date: '21 ago 2026 · 08h05',
		tone: 'mute',
		title: 'Manutenção programada concluída',
		body: 'Migração do banco de resultados para uma nova região, com 12 minutos de indisponibilidade do Studio anunciados com 72 horas de antecedência. O Player seguiu operando.'
	},
	{
		date: '02 ago 2026 · 19h40',
		tone: 'err',
		title: 'Erro ao salvar item com áudio',
		body: 'Itens de escuta criados entre 19h40 e 20h15 falhavam ao salvar por um erro em um serviço de armazenamento. Corrigido em 35 minutos; os rascunhos afetados foram recuperados automaticamente.'
	}
];
