# Sitemap: relatório de validação (2026-11-10)

Análise feita com a skill `seo-sitemap` (modo 1), contra um servidor local do site, porque
`spokke.com.br` ainda não está no ar. O script de descoberta da skill não está instalado neste
repositório; a validação foi feita por um script equivalente (Playwright), descartado depois.
Refeita no mesmo dia, depois de tirar a paginação do sitemap e pôr a capa em todo artigo: os números
abaixo são os da segunda rodada.

## Resultado

| Verificação                                 | Resultado                                                                                                                                     |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| XML válido (índice e as duas partes)        | ok                                                                                                                                            |
| Até 50.000 URLs e 50 MB por arquivo         | ok (29 URLs no total: 11 páginas e 18 do blog)                                                                                                |
| Toda URL responde 200, sem redirecionamento | ok (29 de 29)                                                                                                                                 |
| Imagens da extensão de imagem               | ok (15 capas, todas 200 em JPEG)                                                                                                              |
| Nenhuma URL com `noindex`                   | ok                                                                                                                                            |
| Canonical de cada página igual ao `loc`     | ok                                                                                                                                            |
| `lastmod` em data W3C e real                | ok: só artigos, hubs, índice do blog e páginas legais                                                                                         |
| Sem `priority` nem `changefreq`             | ok                                                                                                                                            |
| Sitemap declarado no robots.txt             | ok (`Sitemap: https://spokke.com.br/sitemap.xml`)                                                                                             |
| Fora do sitemap por desenho                 | `/blog/para-escolas` e hubs com menos de 3 artigos (`noindex`), `/entrar` (`noindex`), `/blog/pagina/1` (301), `/blog/pagina/<n>` (navegação) |

## O que mudou

| Antes                            | Depois                                                                    | Por quê                                                   |
| -------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Um arquivo só em `/sitemap.xml`  | Índice em `/sitemap.xml` com `/sitemap-paginas.xml` e `/sitemap-blog.xml` | o Search Console mostra a cobertura de cada parte         |
| Páginas legais sem `lastmod`     | `lastmod` = data da última revisão do texto (`atualizadoEmIso`)           | data real; um teste confere que bate com a data na página |
| Sem imagem                       | a capa de cada artigo na extensão de imagem do Google (15)                | as capas entram na busca de imagens                       |
| Páginas seguintes do índice      | fora do sitemap (`/blog/pagina/<n>`)                                      | são navegação; os artigos delas já estão no sitemap       |
| Montado dentro do módulo do blog | `$lib/server/sitemap.ts`, com testes próprios (`sitemap.test.ts`)         | o sitemap é do site inteiro                               |

## Antes de publicar

- Em produção, o `ORIGIN` do adapter-node precisa ser `https://spokke.com.br`: é ele que faz o
  `loc` e o canonical saírem em HTTPS e sem `www`. O `www` deve redirecionar (301) para o domínio
  sem `www` no proxy.
- Enviar `https://spokke.com.br/sitemap.xml` no Search Console (docs/operacao.md "Analytics e
  Search Console") e acompanhar a cobertura das duas partes.
- Página pública nova aberta à busca entra em `PAGINAS_PUBLICAS` (`$lib/server/sitemap.ts`).
