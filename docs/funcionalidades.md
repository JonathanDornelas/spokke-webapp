# Funcionalidades do Spokke

Inventário do que o produto faz hoje, para quem escreve a home, a ajuda e o material de venda.
**Só entra aqui o que existe no código.** O que é plano ou pendência está na última seção, e não
pode aparecer em texto público como se existisse.

Fonte: `.claude/rules/paginas.md` (comportamento de cada tela), `CLAUDE.md` "Pendências" e o
código. Levantado em 2026-11-02. Quando uma funcionalidade nascer ou mudar, atualize aqui junto.

O bloco "Tudo que vem junto" da home (`src/routes/+page.svelte`, `funcionalidades`) é um recorte
desta lista: seis itens por grupo, mais o grupo das escolas.

## Para quem

- **Professor autônomo**: conta própria, teste de 14 dias (vai exigir cartão quando o Mercado Pago for ligado), planos Básico, Pro e Super.
- **Escola**: plano Scholar por contrato, com coordenação e professores convidados.
- **Aluno**: não paga, não instala e não cria conta. A conta dele é opcional.

## Criar (Studio)

| Funcionalidade           | O que faz                                                                                   | Onde                             |
| ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------- |
| Quatro tipos de material | Par de frases, vocabulário, texto com perguntas, diálogo                                    | etapa 2 do wizard, biblioteca    |
| Colar uma lista          | Frases ou vocabulário colados de uma vez, com prévia linha a linha e o separador escolhido  | `MaterialForm`                   |
| Tradução automática      | Escreve só no idioma que ensina; a tradução para a língua do aluno vem pronta para conferir | `MaterialForm`, adr-006          |
| Gerar material com IA    | A IA propõe material a partir de um pedido; o professor marca o que entra (Pro e Super)     | `MaterialForm`, `ia.remote.ts`   |
| Gerador de questões      | Do material saem os exercícios (7 geradores de frase, 1 de vocabulário, texto e diálogo)    | etapa 3                          |
| Escolher quantas e quais | Quantidade de questões e habilidades da atividade; teto de 15, fala e escuta até 5 cada     | etapa 1                          |
| Editor de questão        | Enunciado, resposta certa, respostas aceitas, lacuna pela seleção, como corrigir            | `atividades/[id]/itens/[itemId]` |
| Prévia como o aluno vê   | A atividade inteira e cada questão, com os componentes do Player                            | `[id]/previa`, editor de questão |
| Áudio gerado do texto    | Voz sintética em duas velocidades, voz variando por frase                                   | worker `tts`                     |
| Biblioteca de materiais  | Tudo que foi cadastrado, com busca, filtro por tipo e idioma, "trazer" em lote              | `materiais`                      |
| Repetido avisado         | "Você já tem esta frase" enquanto digita; igual é reaproveitado, não duplicado              | `MaterialForm`, `findEquivalent` |
| Módulos                  | Coleção ordenada de atividades; uma atividade pode estar em vários                          | `modulos`                        |
| Nível CEFR               | Rótulo A1 a C2 na atividade, com filtro                                                     | etapa 1, detalhe                 |
| Tag de idioma            | Em atividade, turma e material, com filtro em toda lista                                    | `IdiomaTag`, `FiltroIdioma`      |
| Arquivar e apagar        | Arquivar fecha o link para novos e libera a vaga; apagar pede o título                      | detalhe da atividade             |
| Busca no cabeçalho       | Atividades, materiais e turmas numa caixa só                                                | `StudioSearch`                   |

## Enviar

| Funcionalidade               | O que faz                                                                            | Onde                         |
| ---------------------------- | ------------------------------------------------------------------------------------ | ---------------------------- |
| Link, QR e código            | Link estável por atividade, QR em tamanho de projeção, código de 4 letras para ditar | detalhe, etapa 4             |
| Editar sem quebrar           | Quem está respondendo termina o que abriu; tentativas antigas não mudam              | versão publicada imutável    |
| Turmas                       | Cadastro com nome e e-mail (opcional), um a um ou colando a lista                    | `turmas`                     |
| Convite por e-mail           | Link pessoal por aluno; o aluno aparece com o nome certo nos resultados              | "Enviar atividade"           |
| Reenviar e consertar         | Reenvio para quem não abriu, por aluno, e "Corrigir e-mail e reenviar" no que voltou | chamada da turma             |
| Estados do aluno             | Vai receber, Enviado, Disponível, Começou, Terminou, Sem e-mail, Voltou              | chamada da turma             |
| Programação de módulo        | Tudo agora, por semana, por intervalo ou datas escolhidas, por turma                 | `ProgramacaoPainel`          |
| Liberação no mapa            | Na data, a atividade do módulo abre no mapa do aluno; módulo não manda e-mail        | programação                  |
| Próximos 7 dias e calendário | Os envios da semana e do mês, por módulo e turma                                     | `SemanaDeEnvios`, calendário |
| Aviso de envio que não saiu  | Vermelho com o motivo e o atalho para resolver                                       | lista de módulos, menu       |
| Qualquer idioma              | Dez idiomas hoje, com direita para a esquerda no árabe                               | `LanguageProfile`            |

## Para o aluno (Player)

| Funcionalidade         | O que faz                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem conta e sem app    | Abre o link, digita o nome e responde                                                                                                           |
| Sete tipos de questão  | Escolher, montar, digitar, completar, ligar, ordenar, falar (o oitavo, selecionar no texto, está no registry mas nenhum gerador o produz ainda) |
| Correção na hora       | Certo, quase e errado, com ícone e texto; o certo só aparece se o professor deixar                                                              |
| O quase                | Erro de digitação e tradução parecida contam como parcial, com o que faltou                                                                     |
| Escuta                 | Repete à vontade, três velocidades, nunca toca sozinho                                                                                          |
| Fala                   | Grava, para sozinho no silêncio, mostra o que foi entendido antes de enviar, pode pular                                                         |
| Teclado do idioma      | Kana, pinyin com tom, árabe e híndi; barra de acentos em português, espanhol, francês, italiano                                                 |
| Continua de onde parou | Retomada pela primeira questão sem resposta; voltar não apaga nada                                                                              |
| Resultado              | Acerto, percurso, por habilidade e questão a questão com o "por quê"                                                                            |
| Tempo como estudo      | Média por questão ao lado da turma; "onde você pensou mais"                                                                                     |
| Som de retorno         | Acerto, quase, erro e fim, com volume por aparelho                                                                                              |
| Acessibilidade         | Teclado em tudo, leitor de tela anuncia o resultado, alvo de 48px                                                                               |
| Conta opcional         | Histórico em qualquer aparelho, "Como você vem indo", adotar respostas soltas                                                                   |
| Avatar                 | Pixel art de 18 números, sem foto                                                                                                               |
| Mapa do módulo         | Fases em 8 bits, estrelas onde o professor liberou o resultado                                                                                  |

## Acompanhar

| Funcionalidade           | O que faz                                                                      | Onde                      |
| ------------------------ | ------------------------------------------------------------------------------ | ------------------------- |
| Início                   | A semana (envios, tentativas, acerto), tentativas recentes e uma peça por área | `inicio`                  |
| Resultados por atividade | Tabela com acerto médio em três faixas, agrupada por idioma                    | `resultados`              |
| Questões por dificuldade | O que menos gente acertou vem primeiro                                         | `resultados/[activityId]` |
| Quase separado do erro   | Faixa própria em todo gráfico e contagem                                       | `ScoreBar`, `ResultTrack` |
| Comentário e rubrica     | Na própria resposta da tentativa; nota do professor separada da automática     | `[attemptId]`             |
| Ouvir a fala do aluno    | Com autorização dele, por 7 dias, ao lado da transcrição                       | `[attemptId]`             |
| Ficha do aluno           | Histórico por atividade, acerto das terminadas, editar cadastro                | `alunos/[id]`             |
| Exportar CSV             | Resultados e chamada, montados no navegador                                    | resultados, turma         |
| Apagar tentativa         | O professor apaga respostas (LGPD)                                             | `[attemptId]`             |

## Escola (plano Scholar)

| Funcionalidade         | O que faz                                                                       |
| ---------------------- | ------------------------------------------------------------------------------- |
| Coordenação            | Vê o contrato, os professores com o uso e as turmas só em números               |
| Privacidade do aluno   | A coordenação nunca vê nome de aluno nem resposta                               |
| Convite de professores | Por e-mail, com o papel explicado antes; cada professor mantém conta e conteúdo |
| Um contrato            | O plano da escola vence o plano próprio de cada professor                       |

## Conta e plataforma

- Trial de 14 dias com os limites do Básico; acabou, pausa criar e publicar e os links seguem no ar.
- Limites de estoque (atividades, materiais) e créditos de IA por mês, com o uso na aba Assinatura.
- Pedir, trocar e cancelar plano no fim do período. Com o Mercado Pago desligado, a equipe ativa no painel interno; ligado, o professor paga no checkout dele e o plano libera quando o pagamento é confirmado.
- Trocar senha e "esqueci a senha" para professor e aluno.
- Tema claro e escuro, com a escolha guardada.
- Atividade de exemplo pública em `/exemplo`.

## Não existe ainda (não prometa)

- Mercado Pago ligado de verdade (o código está pronto; faltam as credenciais e o teste no sandbox); preços da vitrine são placeholder.
- Upload de áudio próprio, de imagem e de vídeo; IA a partir de imagem ou vídeo.
- Oito geradores da tabela do kernel (`vocab-image-choice`, `speak-vocab` e outros).
- Correção de escrita livre por IA (a rubrica é do professor).
- Encerrar a conta pela tela (mock); material compartilhado entre professores da escola.
- Leitura em voz alta de texto; fila de correção (foi removida de propósito).
