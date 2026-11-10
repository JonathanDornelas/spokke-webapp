# Blog — como funciona e como publicar

**Estado: no ar com 15 artigos** (2026-11-10): seis principais (quatro para o professor, dois para a
escola) e nove por idioma, um para quem ensina cada idioma do produto, escolhidos pela pesquisa de
palavras-chave do projeto de SEO (`analyses/keyword-research/blog-professores-e-escolas`). O blog é a porta de entrada por
busca orgânica para os **dois públicos** do produto: o **professor de idiomas** (uma dúvida da
rotina, terminando na atividade de exemplo e no cadastro) e a **escola de idiomas** (uma dúvida de
gestão, terminando na conversa com a equipe sobre o plano da escola). Funciona como landing page
sem se escrever como uma.

**Sem autor.** O artigo mostra a data de publicação e, quando houver, a de atualização, e mais
nada sobre quem escreveu: sem nome, sem foto, sem caixa de autor, sem página de autor. Decisão do
dono em 2026-11-10, ao revisar as telas do Claude Design. O frontmatter recusa a chave `autor`, e
os dados estruturados levam a marca (`Organization`) como autora.

As decisões de SEO, a voz e o desenho moram no projeto de SEO, na pasta irmã do repositório
(`../spokke-seo/project`):

| O quê                                                                                   | Onde                                      |
| --------------------------------------------------------------------------------------- | ----------------------------------------- |
| Estrutura de SEO (URLs, modelos, metadados, JSON-LD, links internos, conversão, temas)  | `artifacts/blog/estrutura-seo.md`         |
| Brief de telas para o Claude Design (as telas estão no projeto "Blog" do Claude Design) | `artifacts/blog/brief-claude-design.md`   |
| Voz dos artigos                                                                         | `brain/voice.md`, seção "Artigos do blog" |
| Checklist de revisão dos artigos (proposto, aguarda aprovação)                          | `estrutura-seo.md`, seção 11              |
| Decisões (o desvio do DataForSEO, o blog sem autor)                                     | `brain/log.md` (2026-11-10)               |

## Rotas

Todas no grupo `(site)`, com `SiteHeader` e `SiteFooter`.

| Rota                 | Arquivo                                 | Observação                                                    |
| -------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `/blog`              | `(site)/blog/+page.svelte`              | índice: destaque + 12 por página                              |
| `/blog/pagina/[n]`   | `(site)/blog/pagina/[n]/+page.svelte`   | canonical para ela mesma; `1` é 301 para `/blog`; fora é 404  |
| `/blog/tema/[tema]`  | `(site)/blog/tema/[tema]/+page.svelte`  | hub do assunto; `noindex` com menos de 3 artigos              |
| `/blog/para-escolas` | `(site)/blog/para-escolas/+page.svelte` | hub do público escola: todo artigo com `publico` escola/ambos |
| `/blog/[slug]`       | `(site)/blog/[slug]/+page.svelte`       | artigo                                                        |
| `/blog/rss.xml`      | `(site)/blog/rss.xml/+server.ts`        | os 20 mais recentes                                           |
| `/sitemap.xml`       | `sitemap.xml/+server.ts`                | índice do site: páginas fixas + blog (`$lib/server/sitemap`)  |

- **O "Blog" é item fixo do menu** (cabeçalho da home e de `(site)`, e coluna "Plataforma" do rodapé).
  Um teste garante que sempre haja artigo no ar (`blog.test.ts`), porque sem nenhum as rotas do
  blog respondem 404, em vez de uma página vazia indexada.
- O sitemap é um índice com duas partes, `/sitemap-paginas.xml` e `/sitemap-blog.xml`
  (docs/seo/sitemap-STRUCTURE.md).
- Tema sem artigo no ar também é 404 (e não aparece nos chips nem no sitemap).
- O artigo **não** leva tema nem data na URL; slug publicado não muda (se mudar, 301 da antiga, e
  ela sai do sitemap).
- O `robots.txt` tem `Sitemap: https://spokke.com.br/sitemap.xml`. As rotas do blog e o sitemap
  estão na lista pública de `hooks.server.ts`.
- **Renderizadas no servidor, não pré-renderizadas.** A ideia inicial era `prerender`, mas o hook
  resolve a sessão em toda requisição (o build teria de falar com o banco) e a questão embutida
  depende de módulos de servidor. O conteúdo já vem lido no build pelo Vite, então renderizar é só
  montar HTML. O que importa para busca vale igual: o texto inteiro, os metadados e o JSON-LD estão
  no HTML inicial.

## De onde vem o conteúdo

**Markdown no repositório**, em `src/content/blog/<slug>.md`. O nome do arquivo é o slug
(minúsculas, sem acento, hífen). Sem CMS e sem banco: o artigo é revisado como código, e o
histórico do git é o histórico do texto.

```yaml
---
titulo: Como montar uma atividade de listening com as frases da sua aula # o H1
tituloSeo: Atividade de listening com as frases da aula # até 52; + " · Spokke"
descricao: (de 120 a 160 caracteres)
linhaFina: (duas frases que já respondem a busca)
tema: atividades-com-o-material-da-aula # um slug de src/lib/blog/temas.ts
publico: professor # professor | escola | ambos
publicadoEm: 2026-11-10
atualizadoEm: 2026-12-02 # opcional; só quando o conteúdo mudou de verdade
capa: { src: /blog/capas/<slug>.jpg, alt: (o que se vê na foto) } # obrigatória para ir ao ar (ver "Capas")
guiaDoTema: false # o "pilar" do tema; no máximo um por tema
destaque: false # o artigo do topo do índice; no máximo um no blog inteiro
rascunho: true # rascunho só aparece em `pnpm dev`
---
```

O schema é `frontmatterSchema` (`$lib/server/blog/index.ts`, Zod, `.strict()`): chave desconhecida
— `autor` inclusive — derruba o `pnpm dev` e o build com o nome do arquivo. Também recusa
`atualizadoEm` que não vem depois de `publicadoEm` e dois guias no mesmo tema.

**O que está no ar**: fora do `pnpm dev` entra só o artigo sem `rascunho` e cujo `publicadoEm` já
chegou (no fuso de Brasília): dá para agendar deixando a data no futuro. Em dev entra tudo, com o
selo "Rascunho" no cartão e no topo do artigo, para revisar na tela de verdade.

**O corpo** é Markdown comum (H2 e H3, listas, tabelas, links, `<span lang="en">` para frase no
idioma alvo dentro do texto). Sem H1 no corpo: o título é o H1. O leitor é o `marked` + `yaml`
(`$lib/server/blog/markdown.ts`), e quatro blocos cercados viram componente:

````md
```exemplo
titulo: Frases prontas para a atividade # opcional
idioma: en-US # a tag de um LanguageProfile; idioma, direção e rótulo saem dele
traducaoEm: pt-BR # opcional: a língua da tradução (en-US no artigo de português para estrangeiros)
linhas:
  - texto: Have you ever been to London?
    traducao: Você já esteve em Londres?
```

```no-spokke
Três ou quatro frases sobre como fazer aquilo no produto. Vira o bloco "No Spokke"
("Na sua escola" no artigo de escola), com a chamada do público do artigo.
```

```questao
item: escuta # uma questão de $lib/server/exemplo, respondível de verdade
texto: Ouça o áudio, escolha a frase que você ouviu e veja a correção que o aluno recebe.
```

```perguntas
- pergunta: O aluno pode ouvir mais de uma vez?
  resposta: Pode, e deve. A segunda escuta, mais lenta, é a que fixa o som da frase.
```
````

Cada H2 ganha âncora e entra no sumário ("Neste artigo", a partir de quatro seções); o "No Spokke"
e as perguntas entram também. O tempo de leitura sai do texto (~200 palavras por minuto, contadas
com `Intl.Segmenter`, regra nº 5).

Os **temas** são uma lista em TS (`$lib/blog/temas.ts`): nome, H1 do hub, título e descrição de
busca, abertura em parágrafos e o público principal. Ainda são **hipótese** (sem pesquisa de
palavras-chave). O hub das escolas tem o mesmo molde (`HUB_DAS_ESCOLAS`).

O artigo nasce no projeto de SEO (`content-seo`), passa nas checagens e é copiado para
`src/content/blog/`. Os 15 de hoje passaram por pauta, rascunho e checagem no projeto de SEO
(`workbench/content/<slug>`, `artifacts/contents/<slug>`), com os desvios registrados (sem DataForSEO,
sem Top 3 medido).

## Telas e componentes

Os desenhos são o projeto "Blog" do Claude Design (Índice, Tema, Artigo, Cartão, Conversão,
Exemplo, Questão, Cabeçalho, Rodapé), menos o autor. Os componentes moram em
`$lib/components/blog/` (components.md "Blog"); a questão embutida mora na rota do artigo
(`blog/[slug]/QuestaoDoArtigo.svelte`) porque usa as peças de `routes/exemplo`. O texto que sai do
Markdown é desenhado pela utility `prosa-do-blog` (`app.css`), só nos blocos de texto.

## Capas

Todo artigo que vai ao ar tem uma foto de capa (pedido do dono em 2026-11-10): `blog.test.ts` falha
se faltar a capa ou o arquivo dela. Ela aparece no topo do artigo, no cartão do índice e dos hubs, na
prévia de compartilhamento (`og:image`, com o `og:image:type` saído da extensão) e no sitemap do blog
(extensão de imagem). Só o rascunho pode ficar sem: aí o cartão de destaque mostra a composição de
formas e o cartão comum fica sem imagem.

- **De onde vem**: banco de imagens gratuito, sem marca d'água. As quinze de hoje são do
  [Pexels](https://www.pexels.com/license/), cuja licença permite o uso gratuito, inclusive
  comercial, sem pedir crédito. O crédito fica registrado abaixo mesmo assim, para saber de onde veio
  cada foto.
- **Formato**: JPEG de 1200 × 630 em `static/blog/capas/<slug>.jpg`, o tamanho da prévia de
  compartilhamento. Do Pexels ela sai pronta pelo recorte da própria CDN:
  `https://images.pexels.com/photos/<id>/pexels-photo-<id>.jpeg?auto=compress&cs=tinysrgb&w=1200&h=630&fit=crop`.
  JPEG e não WebP porque o mesmo arquivo é a imagem da prévia, e JPEG é o que todo robô de prévia lê.
- **O que fica de fora**: marca ou logotipo à vista (uma candidata de QR code era um anúncio com a
  marca do Spotify), texto legível que fala de outra coisa (uma de vocabulário tinha o roteiro de uma
  série nos cartões), símbolo religioso, foto em preto e branco no meio das coloridas e pessoa numa
  situação que a constranja. Artigo de idioma ganha um lugar onde o idioma é falado, de preferência
  com a escrita à vista: as placas de Tóquio, o devanágari do carrinho de Jalandhar.
- **`alt`**: o que se vê na foto, numa frase, sem "imagem de". No cartão a capa é decorativa
  (`alt=""`), porque o título ao lado já é o link; no artigo e na prévia vale o `alt` do frontmatter.

| Artigo                                        | Foto no Pexels                                     | Autor                        |
| --------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| `ditado-em-ingles`                            | [3466163](https://www.pexels.com/photo/3466163/)   | Oladimeji Ajegbile           |
| `atividades-de-speaking-sala-de-aula`         | [7395452](https://www.pexels.com/photo/7395452/)   | cottonbro studio             |
| `atividades-com-qr-code`                      | [7289717](https://www.pexels.com/photo/7289717/)   | Kampus Production            |
| `atividades-de-vocabulario-em-ingles`         | [7156130](https://www.pexels.com/photo/7156130/)   | Gustavo Fring                |
| `lgpd-na-escola-de-idiomas`                   | [36740854](https://www.pexels.com/photo/36740854/) | Nathan Thomas                |
| `acompanhamento-pedagogico-escola-de-idiomas` | [669613](https://www.pexels.com/photo/669613/)     | Lukas Blazek                 |
| `ingles-americano-e-britanico`                | [374815](https://www.pexels.com/photo/374815/)     | Burst                        |
| `como-ensinar-espanhol-para-iniciantes`       | [31923089](https://www.pexels.com/photo/31923089/) | José Antonio Otegui Auzmendi |
| `atividades-de-frances-para-iniciantes`       | [30718801](https://www.pexels.com/photo/30718801/) | TBD Traveller                |
| `atividades-de-italiano-para-iniciantes`      | [32210218](https://www.pexels.com/photo/32210218/) | Afifi Zakaria                |
| `como-ensinar-portugues-para-estrangeiros`    | [7079778](https://www.pexels.com/photo/7079778/)   | Michael Swigunski            |
| `atividades-de-japones-para-iniciantes`       | [30816624](https://www.pexels.com/photo/30816624/) | Süha                         |
| `tons-do-mandarim-pinyin`                     | [30516591](https://www.pexels.com/photo/30516591/) | Shuaizhi Tian                |
| `alfabeto-hindi-devanagari`                   | [28926431](https://www.pexels.com/photo/28926431/) | Anurag Jamwal                |
| `alfabeto-arabe-atividades`                   | [11206681](https://www.pexels.com/photo/11206681/) | Hurrah suhail                |

## Metadados e dados estruturados

- **`Metadados.svelte`** faz título, description, canonical, Open Graph e Twitter Card no HTML
  inicial; no artigo, `tipo="article"` com `article:published_time`, `article:modified_time` e
  `article:section`. **Sem `article:author`**.
- **Título da aba** segue a regra do site (components.md "Metadados"): índice `Blog · Spokke`,
  página `Página 2 · Blog · Spokke`, tema `<Tema> · Blog · Spokke`, artigo `<tituloSeo> · Spokke`.
- **JSON-LD** (`DadosEstruturados.svelte` + `$lib/blog/dados-estruturados.ts`, com `<` escapado):
  `BlogPosting` (autor e editora = a marca) + `BreadcrumbList` no artigo, `CollectionPage` +
  `ItemList` + `BreadcrumbList` nos hubs, `Blog` no índice.
- **Sem `FAQPage` nem `HowTo`**; as perguntas e o passo a passo continuam como conteúdo.
- A imagem de compartilhamento e a do `BlogPosting` é a capa do artigo (ver "Capas"); só o rascunho
  sem capa cai na do site (`static/og/spokke.png`).

## Conversão

- **Segue o `publico` do artigo** (`conversaoDoPublico`, `$lib/blog/links.ts`). Professor: criar a
  conta (teste de `TRIAL.dias` dias) com a atividade de exemplo ao lado, e no fim a ponte "Dá aula
  numa escola?" para o hub das escolas (não conta como chamada). Escola: `/contato?assunto=escolas`
  ("Conversar sobre o plano da escola") com os planos ao lado. Os dois: cadastro primeiro, conversa
  depois.
- No máximo três chamadas por artigo: o bloco "No Spokke" (ou "Na sua escola"), a questão embutida
  e a faixa final. Nada cobre o texto no celular.
- **A questão embutida é a mesma da home** (`EnunciadoDaQuestao` + `RespostaDaQuestao`, corrigida
  por `corrigirExemplo` no servidor, com o teto por IP que já existe). O protótipo corrigia no
  navegador; isso seria um segundo corretor.
- Cadastro e contato saindo do blog levam `?origem=blog-<slug>` (ou `blog`). **O contato repassa a
  origem** num campo escondido, validada por formato, e ela entra no aviso para a equipe
  ("Origem: blog-…"). No cadastro, a origem vai no evento `sign_up` da medição, quando a pessoa aceita
  o aviso (docs/operacao.md "Analytics e Search Console"). Os cliques nas chamadas do blog são o
  evento `cta_blog`, marcado no HTML com `data-evento`.
- O artigo de escola só afirma o que o plano da escola faz hoje (docs/funcionalidades.md "Escola").
  **Material compartilhado entre professores não existe** e não entra em texto nenhum.

## Publicar um artigo

1. O texto passa pelo checklist do projeto de SEO (voz + checklist dos artigos).
2. Copiar para `src/content/blog/<slug>.md` com `rascunho: true` e revisar em `pnpm dev`
   (`/blog/<slug>`), no claro, no escuro e no celular.
3. Escolher a capa (ver "Capas"), salvar em `static/blog/capas/<slug>.jpg`, pôr `capa` no
   frontmatter e o crédito na tabela de "Capas".
4. Tirar o `rascunho` (ou deixar `publicadoEm` no dia em que deve sair) e fazer o deploy.
5. Depois de no ar: auditoria `technical-seo` do agentic-seo na URL e o Teste de Pesquisa Aprimorada
   do Google no JSON-LD.

Os testes de `$lib/server/blog/blog.test.ts` leem todos os arquivos de `src/content/blog`: um
artigo inválido quebra o `pnpm test`, todo artigo de professor precisa de pelo menos um bloco
`exemplo`, e todo artigo fora do rascunho precisa de capa, com o arquivo em `static/`.

## Pendências

- **Volume de busca**: a pesquisa foi feita com o autocomplete e uma amostra de resultados, sem o
  DataForSEO. Falta medir o volume das palavras escolhidas e, com o site no ar, cruzar com o Search
  Console.
- **Frases de exemplo fora do inglês e do português**: escritas pelo agente, em nível básico; vale
  um falante conferir espanhol, francês, italiano, japonês, mandarim, híndi e árabe antes do deploy.
- **Analytics**: pronto e desligado; ligar depois do deploy (docs/operacao.md). O cadastro pelo
  Google ainda não registra `sign_up`.
- **Catálogo do projeto de SEO**: os artigos não estão em `project/contents/blog` porque o projeto
  ainda não tem clusters aprovados (topic-cluster e approve-cluster).
- **E2E**: falta o teste que lê o HTML cru de um artigo publicado (`<title>`, canonical,
  `og:type=article`, JSON-LD), no molde do `e2e/smoke.spec.ts`. Ele depende de haver um artigo fora
  do rascunho.
- **Artigo removido** deve responder 410 (ou 301 com substituto); hoje vira 404.
