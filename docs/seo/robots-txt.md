# robots.txt: auditoria e decisões (2026-11-10)

Feito com a skill `robots-txt`. O arquivo é estático: `static/robots.txt`.

## Como estava

```
User-agent: *
Disallow: /api/

Sitemap: https://spokke.com.br/sitemap.xml
```

O essencial já estava certo: só a API fechada, o sitemap declarado em URL absoluta e as áreas
logadas abertas ao rastreio (elas levam `noindex` na página, e o robô precisa lê-la para ver isso).
Faltava a política para os robôs de IA e o tratamento do parâmetro de origem dos links do blog.

## O que entrou

- **Robôs de busca e de resposta com IA liberados** (OAI-SearchBot, Claude-SearchBot,
  Claude-User, PerplexityBot): eles leem e citam o site e o blog, e é visibilidade que interessa.
- **Robôs de coleta para treino de modelos fechados** (GPTBot, ClaudeBot, Google-Extended,
  Applebot-Extended, CCBot, Bytespider, Meta-ExternalAgent), o padrão recomendado pela skill.
  Fechar o Google-Extended não tira o site da busca do Google nem dos resumos com IA dela, que
  usam o Googlebot. **É uma decisão de negócio**: para o Spokke aparecer no conhecimento dos
  modelos, basta trocar `Disallow: /` por `Disallow: /api/` nesse grupo.
- **`Clean-param` para o Yandex**, com `origem` e os parâmetros de campanha: o
  `?origem=blog-<artigo>` dos links do blog não muda a página. O Google ignora a linha e se guia
  pelo canonical, que já sai sem parâmetro.
- O ChatGPT-User não obedece mais ao robots.txt (dez. 2025); bloqueá-lo, se um dia for preciso,
  é no servidor, não aqui.

## Checklist

| Item                                                                  | Situação           |
| --------------------------------------------------------------------- | ------------------ |
| Na raiz, em UTF-8, no formato da RFC 9309                             | ok                 |
| `Disallow` e `Allow` com caminho relativo; `Sitemap` com URL absoluta | ok                 |
| CSS, JS e imagens abertos (`/_app/` não é bloqueado)                  | ok                 |
| Páginas com `noindex` abertas ao rastreio                             | ok                 |
| Prévia de link (WhatsApp, LinkedIn) consegue ler `/a/...`             | ok                 |
| Sitemap declarado                                                     | ok                 |
| Política para robôs de IA                                             | ok, decidida acima |

**Ambiente de homologação**, se existir um dia: ele precisa de `Disallow: /` (e de preferência
senha), senão o Google indexa a cópia. O arquivo daqui é o de produção.

Referência: [Google, criar um robots.txt](https://developers.google.com/search/docs/crawling-indexing/robots/create-robots-txt).
