# Sitemap: estrutura

O sitemap é gerado na hora, pelo servidor, a partir do código: nenhuma lista à mão para manter.

```
/sitemap.xml                 índice (o endereço do robots.txt)
├── /sitemap-paginas.xml     páginas públicas fixas (PAGINAS_PUBLICAS)
└── /sitemap-blog.xml        blog: índice, hubs indexáveis, artigos (com a capa)
```

| Parte   | O que entra                                                                                          | `lastmod`                                 |
| ------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Páginas | `/`, `/planos`, `/exemplo`, `/cadastro`, `/sobre`, `/ajuda`, `/contato` e as quatro legais           | só nas legais: a data da revisão do texto |
| Blog    | `/blog`, `/blog/tema/<tema>` e `/blog/para-escolas` com 3 artigos ou mais, `/blog/<artigo>` e a capa | a do artigo (atualização ou publicação)   |

Regras (código em `$lib/server/sitemap.ts`, testes em `sitemap.test.ts`):

- Só URL indexável e canônica. O que leva `noindex` ou redireciona fica de fora.
- Sem artigo no ar, `/sitemap-blog.xml` responde 404 e o índice não aponta para ele.
- `lastmod` só com data real; sem `priority` e sem `changefreq`.
- A capa de cada artigo vai na extensão de imagem (`image:image`); todo artigo no ar tem uma
  (docs/blog.md "Capas").
- As páginas seguintes do índice (`/blog/pagina/<n>`) ficam fora, por decisão de 2026-11-10: são
  navegação, e os artigos que elas listam já estão no sitemap. Continuam rastreáveis pelos links da
  paginação, com canonical próprio.
- As rotas `/sitemap*.xml` são públicas no `hooks.server.ts`.

Em 2026-11-10: 29 URLs (11 páginas e 18 do blog, com 15 artigos e 15 capas).
