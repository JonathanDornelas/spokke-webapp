---
paths:
  - 'src/routes/+page.svelte'
  - 'src/routes/(site)/**'
  - 'src/lib/components/Site*.svelte'
---

# Página inicial (marketing)

A home é a única superfície pública com liberdade visual. Ainda assim, o tema é o mesmo:
azul (#3659CB) é a marca, ciano só para áudio, e **verde/âmbar/vermelho aparecem apenas na seção de
correção** — nunca como destaque decorativo.

Referência visual navegável: `docs/home.html`.
Regras base: `.claude/rules/design-system.md`. Snippets: `.claude/rules/components.md`.

## Voz

**A voz da marca mora no Cérebro do projeto agentic-seo**, na pasta irmã do repositório:
`../spokke-seo/project/brain/voice.md` (direto e confiante, escolhida pelo dono em 2026-11-02),
com o checklist de revisão em `brain/review.md`. Copy nova passa por ali antes de entrar aqui;
o rascunho e a checagem da home estão em `project/artifacts/contents/home/`.

Fale com o professor, não sobre o produto. Frase curta, verbo concreto, zero jargão de
marketing. O argumento é sempre o trabalho dele: montar a atividade da próxima aula, ver o que a
turma errou, não precisar pedir para o aluno criar conta.

**O público são dois: o professor autônomo e a escola.** O texto fala com o professor (é ele
quem monta a aula, na escola ou sozinho) e abre a porta da escola onde ela decide: o bloco de
funcionalidades tem a faixa "Para escolas", a tabela de planos diz "para a escola, um contrato" e
o CTA final leva a `/contato?assunto=escolas`.

Não invente número: sem "10.000 professores", sem depoimento fabricado, sem preço que não
exista. Se não há dado real, o espaço fica sem dado.

## Estrutura

Nove blocos, nesta ordem. Cada um responde a uma pergunta e nenhum repete o anterior.

| #   | Bloco                 | O que resolve                                                |
| --- | --------------------- | ------------------------------------------------------------ |
| 1   | Hero + Player ao vivo | O que é, e como se parece na mão do aluno                    |
| 2   | Quatro habilidades    | Por que não é só múltipla escolha                            |
| 3   | Tudo que vem junto    | O que a conta inclui, do criar ao acompanhar, e a escola     |
| 4   | Para o aluno (escura) | O que o aluno ganha no aprendizado: correção, fala, o porquê |
| 5   | Correção              | Existe o quase; parcial é um estado próprio                  |
| 6   | Do rascunho ao link   | Três passos, incluindo versão publicada imutável             |
| 7   | Qualquer idioma       | RTL, CJK, normalização de acento                             |
| 8   | Planos                | A mesma `PlanosTabela` de `/planos`                          |
| 9   | CTA + rodapé          | "Você precisa de uma conta. Seus alunos, não."               |

**"Tudo que vem junto"** é o desenho "Home Funcionalidades" do Claude Design: quatro grupos de
seis (Criar, Enviar, Para o aluno, Acompanhar), a faixa "Para escolas" na largura inteira e uma
linha com o CTA. Os itens saem de `docs/funcionalidades.md`, que só lista o que existe: o desenho
original prometia código de seis letras, áudio próprio, fila de correção e "distratores mais
escolhidos", e foram trocados. Ícones e checks na cor da marca, não no verde e no âmbar do desenho.

**O rodapé não tem indicador de status.** O "Todos os sistemas operando" era um ponto verde fixo;
no lugar entrou a identificação da empresa (o nome empresarial — o CNPJ não aparece no site, a
pedido do dono do repositório) e, quando houver, a faixa de selos
verificáveis (`selos` em `institucional.ts`; roteiro em `docs/selos-e-seguranca.md`).

O hero mostra um **celular que RESPONDE de verdade** e cicla entre quatro questões (escuta,
escrita tolerante, montar frase, fala). Esse é o argumento mais forte da página: não substitua
por captura estática nem por maquete.

- **As questões são as da atividade de exemplo** (`$lib/server/exemplo`, a mesma de `/exemplo`):
  itens no formato do banco, montados por `buildRuntimeItem` e corrigidos pelo kernel no servidor
  (`corrigirExemplo`; a fala por `/exemplo/fala`, transcrita pelo serviço de áudio). O "quase"
  que a home promete é o "quase" que o aluno recebe, e o gabarito não chega ao browser. A tela é
  `routes/exemplo/EnunciadoDaQuestao.svelte` (`compacto`) + `RespostaDaQuestao.svelte`, com os
  componentes do Player.
- **O ritmo**: sozinho, 9 s por tela (dá para ler a questão inteira). Quem escolhe uma pastilha
  ou toca no celular passa para 24 s, e cada toque recomeça a contagem.
- **O ciclo para** com o ponteiro ou o foco dentro do celular, gravando, esperando a correção e
  com uma resposta digitada e ainda não verificada: trocar de tela ali apagaria o que a pessoa
  estava fazendo. Com `prefers-reduced-motion` ele não roda.
- A tela que entra começa em branco. Uma linha abaixo das pastilhas diz que dá para responder,
  porque ninguém tenta mexer num celular que parece imagem.

"Responder um exemplo" leva a `/exemplo`: a atividade inteira (cinco questões, com associação)
na tela do Player, sem nome, sem tentativa e sem gravar nada (paginas.md "Exemplo").

## Reaproveitamento

O hero usa as interações reais do Player (`ChoiceInteraction`, `ClozeInteraction`,
`AssembleInteraction`, `SpeakInteraction`, `AnswerFeedback`) e o `AudioPlayer` com o áudio de
verdade (`static/demo/exemplo-escuta*.mp3`, sem autoplay e sem o truque de `playing` inicial).
`Button` é polimórfico (`href` → `<a>`) e cobre todo CTA da página. `Logo` está no
cabeçalho e no rodapé — nunca duplique o SVG do ícone inline de novo. A action `use:reveal` é a
mesma de `src/lib/actions/reveal.ts` — não duplique.

O que fica só nesta página, sem virar componente novo: os cartões de habilidade, os passos
"rascunho ao link", os cartões de estado de correção em layout horizontal (ícone à esquerda,
texto empilhado à direita — diferente do `CorrectionState` vertical do Player) e o carrossel de
idiomas. São composições específicas de marketing; forçar isso num componente do Player os
tornaria mais complicados dos dois lados sem ganho real.

## Toggle de tema

O cabeçalho tem um botão de tema (ícone só, ao lado de "Entrar no Studio") — diferente do resto
do site, que segue `prefers-color-scheme` sem controle manual, a home é a superfície pública que
o professor decide visitar de dia ou de noite, então oferece a escolha. Estado inicial lê
`localStorage['spokke-theme']`; sem valor salvo, cai para a preferência do sistema — nunca força
claro por padrão (isso já foi bug no catálogo de dev: abrir com preferência escura do sistema e
ver a tela clara até clicar). Ao trocar, grava a escolha; visitas seguintes respeitam o que a
pessoa escolheu da última vez.

## Movimento

Todas as durações e curvas vêm de `design-system.md`. Específico da home:

- **Entrada em scroll**: cada bloco sobe por baixo ao entrar na viewport, via `use:reveal`. O
  bloco da seção entra sem atraso; cartões dentro de uma grade entram em sequência pela ordem
  (`use:reveal={{ ordem: i }}`, o `--stagger` do design system). O hero anima no carregamento, sem
  observer, com `animate-entrada em-sequencia` e o `--i` de cada bloco.
- **Formas de ambiente**: confinadas à coluna do celular no hero e a regiões sem texto nas
  faixas escura e azul. Nunca atrás de parágrafo. Cada zona tem sua própria composição — não
  é o mesmo `AmbientShapes.svelte` genérico do catálogo reaproveitado três vezes, porque a
  contagem e o arranjo de formas mudam por zona (home.md pede isso, o componente genérico é de
  5 formas fixas para um bloco de tamanho fixo).
- **Carrossel de idiomas**: `en-marquee` linear infinito, lista duplicada, borda resolvida com
  `mask-image` em fade horizontal. `aria-hidden` — é ilustração, não conteúdo.
- **Hover**: cartão usa `cartao-interativo` (sobe 3 px, borda puxando para a cor da marca); linha de estado de correção desliza
  4px na horizontal. Botão usa `motion-tap`.

## Superfícies escuras

A faixa "O Player" e o CTA final usam superfície própria, **não** `base-content` como fundo — no
tema escuro isso vira texto claro sobre fundo claro. Os tokens são `panel`, `panel-content`,
`panel-dim`, `panel-line`, definidos nos dois temas em `app.css` (mesmo mecanismo de `line` e
`card` — ver design-system.md). A mesma regra vale para o bezel do celular (`bezel`) e para a
cor da sombra (`--shadow`, triplet RGB cru para `shadow-[...rgb(var(--shadow)/alpha)]`), que é
preta no escuro e azul-tinta no claro.

## Acessibilidade

Vale tudo de `design-system.md`, mais:

- O celular do hero é **conteúdo interativo**, não ilustração: uma `section` rotulada ("Exemplo
  para responder como aluno") com os controles do Player dentro. As formas em volta continuam
  `aria-hidden`; as pastilhas são botões reais com `aria-pressed`. Os ouvintes que pausam o ciclo
  entram por `{@attach}`, porque não são controles.
- O carrossel de idiomas não é lido por leitor de tela; a lista dos dez idiomas está por extenso
  no parágrafo acima dele. **Só entra idioma que tem `LanguageProfile`** — o carrossel chegou a
  mostrar alemão, coreano, hebraico e tailandês, que o produto não corrige.
- Contraste de 4.5:1 em todo corpo de texto, incluindo o texto sobre as faixas escura e azul.

## Texto

O mesmo filtro da voz, aplicado a cada frase: sem travessão (ponto ou vírgula resolvem), sem
termo interno ("Player", "servidor", "normalização") e sem prometer o que o produto não faz
(upload de áudio, leitura em voz alta, idioma sem profile). Número só se for real: os 14 dias do
trial saem de `TRIAL` no catálogo, os dez idiomas de `languageLabels`.
