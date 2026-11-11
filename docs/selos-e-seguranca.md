# Selos, certificados e sinais de confiança

O que colocar no site para o professor e a escola confiarem no Spokke, em que ordem, e o que
NÃO colocar. Escrito em 2026-11-02, quando o "Todos os sistemas operando" saiu do rodapé: era um
ponto verde fixo, que ninguém media, dizendo que estava tudo bem.

> Os itens jurídicos abaixo são um roteiro, não parecer. Confirme com o advogado da empresa antes
> de publicar qualquer afirmação de conformidade.

## A regra

**Selo só vale se um terceiro confirma e o público reconhece.** Os dois ao mesmo tempo.

- O link do selo leva à página do EMISSOR que prova o selo. Selo que só existe como imagem no
  nosso site é decoração, e decoração que afirma segurança pode virar publicidade enganosa
  (CDC, art. 37).
- O cadeado do navegador já mostra o HTTPS. Desenhar um cadeado ou "site 100% seguro" no rodapé
  não acrescenta nada e é o selo que golpista também usa.
- Melhor nenhum selo do que um que ninguém conhece.

## Os dois públicos pedem coisas diferentes

| Quem               | Como decide                                             | O que pesa                                                |
| ------------------ | ------------------------------------------------------- | --------------------------------------------------------- |
| Professor autônomo | Sozinho, em minutos, como consumidor                    | Empresa identificada, Reclame Aqui, pagamento conhecido   |
| Escola e rede      | Com coordenação, TI ou jurídico, às vezes por licitação | Documentos: privacidade, contrato, segurança, encarregado |

Por isso o passo a passo tem duas partes: o que vai no SITE (para os dois) e o que vai num
KIT para escolas (documento, não selo).

## Parte 1 — o site

### 1. Identificação da empresa no rodapé · obrigatório

O Decreto nº 7.962/2013 (comércio eletrônico), art. 2º, pede em local de destaque: nome
empresarial, CNPJ, endereço físico e eletrônico e meio de contato. Vendendo assinatura pelo site,
isso vale para nós.

- [x] Nome empresarial no rodapé (`SiteFooter.svelte`, lendo `empresa` de
      `src/lib/content/institucional.ts`).
- [ ] **CNPJ fora do site, por decisão do dono do repositório** (novembro de 2026). O decreto
      acima o pede para quem vende pelo site: antes de abrir a assinatura com pagamento, revisitar
      essa decisão com quem cuida do jurídico.
- [ ] **Trocar os dados de exemplo** de `institucional.ts` pelos reais (nome, endereço,
      e-mails). Hoje são inventados.
- [ ] Endereço e contato visíveis a um clique: a página `/contato` já tem os canais; confirme que
      o endereço real está lá.

### 2. Encarregado de dados e política de privacidade · obrigatório

LGPD, art. 41: a identidade e o contato do encarregado (o "DPO") ficam públicos, de preferência
no site. Parte do público é menor de idade, e o art. 14 trata de dados de crianças e
adolescentes com regra própria.

- [ ] Nome (ou canal) do encarregado e e-mail na política de privacidade e no rodapé da página
      `/privacidade`.
- [ ] Verificar com o jurídico se a empresa pode usar a dispensa de agente de pequeno porte
      (Resolução CD/ANPD nº 2/2022). Tratamento de dados de crianças e adolescentes pode ser
      classificado como de alto risco, e aí a dispensa não vale.
- [ ] A política já descreve as retenções reais: gravação de voz em 7 dias, áudio de atividade
      em 10, consentimento da gravação por tentativa (`auth.md`). Manter a página igual ao código.

**Não existe selo oficial de LGPD.** A ANPD não certifica empresas hoje. Selos "LGPD Compliant"
vendidos por consultorias não são reconhecidos e não devem entrar no rodapé.

### 3. Reclame Aqui · o selo que o professor autônomo consulta

No Brasil, antes de pagar uma assinatura, muita gente procura a empresa no Reclame Aqui. Não ter
página lá também é sinal.

- [ ] Cadastrar e reivindicar a página da empresa no Reclame Aqui (área de empresas).
- [ ] Responder cada reclamação, de preferência em até 48 horas.
- [ ] Quando houver selo de reputação (o RA1000 é concedido pela própria nota, não se compra),
      pôr no rodapé com o link para a página da empresa lá. Confira as regras atuais do programa
      antes, elas mudam.
- Use a imagem estática do selo com o link, não o script de widget deles: script de terceiro no
  site traz cookie e peso que a política de cookies não descreve.

### 4. Pagamento · quando o Mercado Pago for ligado

O gateway é o Mercado Pago, pronto e desligado (`docs/adr-002-billing.md`, seção 8). Ao ligar:

- [ ] Mostrar "Pagamento processado por <gateway>" na tela de planos e no checkout. Quem tem a
      certificação PCI DSS é o gateway, não nós: nunca escrever que o Spokke é PCI.
- [ ] Na tela de planos, o direito de arrependimento (CDC, art. 49: sete dias para compra fora
      do estabelecimento) e como cancelar. O cancelamento no fim do período já existe.

### 5. Verificações técnicas · evitam alerta (e duas viraram selo)

São as coisas que, quando faltam, fazem o navegador ou o e-mail avisar o professor de que algo
está errado. Duas delas, o SSL e o Google Safe Browsing, aparecem no rodapé desde 2026-11-10, a
pedido do dono do repositório, como LINK para a verificação ao vivo (veja "Os dois selos do
rodapé", logo abaixo); as outras continuam fora dele.

- [ ] **Domínio de e-mail verificado** com SPF, DKIM e DMARC (no Resend, `CLAUDE.md`
      "Pendências"). Sem isso o convite cai no spam e qualquer um pode mandar e-mail "do
      Spokke". É o item técnico mais urgente.
- [ ] HTTPS com HSTS e nota A no SSL Labs (ssllabs.com/ssltest).
- [ ] Cabeçalhos de segurança (CSP, `X-Content-Type-Options`, `Referrer-Policy`), conferidos no
      securityheaders.com ou no Mozilla Observatory.
- [ ] Domínio limpo no Google Safe Browsing (Transparency Report) e cadastrado no Search
      Console, que avisa se o site for marcado.

### 5b. Os dois selos do rodapé · SSL e Google Safe Browsing

No extremo direito do rodapé, oposto ao "© 2026 Spokke" (`SiteFooter.svelte`, lendo
`selosDeVerificacao` de `src/lib/content/institucional.ts`). Cada selo é uma imagem PNG (2x, em
`static/selos/`) que é o próprio link para a verificação de um terceiro, com o texto convidando a
conferir ("Verificar no SSL Labs", "Verificar o status do site"), nunca "site seguro". O emblema é
um certificado e um escudo numa roseta azul, não um cadeado.

**As imagens são nossas, e de propósito.** Procuramos o selo oficial dos dois em novembro de 2026 e
ele não existe: a Let's Encrypt não oferece selo e pede para tirar do ar os "badges" feitos com o
logo dela; o Google não tem selo do Safe Browsing, e os termos do serviço proíbem sugerir endosso.
As imagens que circulam na web com essas marcas são cópias não oficiais — usar uma seria exatamente
a decoração que afirma segurança que a regra do começo proíbe. Os PNGs saem de
`scripts/gerar-selos.mjs` (HTML com as cores da marca, renderizado pelo Chromium do Playwright, como
as imagens de `static/og/`); mudou o texto, rode de novo e confira as medidas que ele imprime contra
as de `selosDeVerificacao`. Se um dia o certificado vier de uma autoridade com programa de selo
(Sectigo, DigiCert), o selo OFICIAL dela pode substituir o do SSL, com o link de verificação dela.

**O domínio é o do site aberto.** Em produção o link sai do endereço em que o visitante está
(`page.url`), então `spokke.com.br` é verificado sem configurar nada no deploy. Em
desenvolvimento (localhost, IP, `.local`) ele usa `dominioDoSite` (`spokke.com.br`), só para os
selos aparecerem iguais.

O que fazer quando o site for para o ar em `spokke.com.br`, nesta ordem:

1. **HTTPS de verdade no domínio e no `www`.** Certificado válido (Let's Encrypt pelo proxy na
   frente do `adapter-node`, ou o do provedor), redirecionamento de `http://` para `https://` e
   de `www.spokke.com.br` para `spokke.com.br` (ou o contrário, mas um só). `ORIGIN` do
   adapter-node com `https://spokke.com.br`.
2. **Nota A no SSL Labs.** Rode o teste em
   `https://www.ssllabs.com/ssltest/analyze.html?d=spokke.com.br` e corrija o que ele apontar:
   - só TLS 1.2 e 1.3;
   - cadeia de certificados completa;
   - HSTS com `max-age` de pelo menos seis meses (`Strict-Transport-Security: max-age=15552000;
includeSubDomains`).

   Não marque "Do not show the results on the boards" se quiser que o link mostre a nota
   guardada; o selo usa `&latest`, que abre o último resultado em vez de testar de novo a cada
   clique.

3. **Search Console com a propriedade de DOMÍNIO** (`spokke.com.br`, verificada por registro
   TXT no DNS). É ele que avisa por e-mail se o Google marcar o site como inseguro, em
   "Segurança e ações manuais > Problemas de segurança".
4. **Conferir o Transparency Report**:
   `https://transparencyreport.google.com/safe-browsing/search?url=spokke.com.br&hl=pt_BR` tem de
   dizer que não há conteúdo não seguro. Um domínio novo pode aparecer como "sem dados" nos
   primeiros dias; isso não é problema, mas espere ele aparecer antes de divulgar o link.
5. **Se uma das verificações der problema, tire o selo** (deixe `selosDeVerificacao` devolvendo
   só o que está bom) até resolver: o link mostraria o problema para quem clicasse.
6. Opcional, depois de meses com HSTS estável: pedir a inclusão em `hstspreload.org`. É difícil
   de desfazer, então só com todos os subdomínios já em HTTPS.

### 6. Acessibilidade · declaração, não selo

Não há selo de acessibilidade reconhecido para site privado. O que vale é a página
`/acessibilidade` dizendo o padrão seguido (WCAG 2.2 nível AA), o que já funciona (teclado em
toda interação, leitor de tela anunciando o resultado, contraste) e as limitações conhecidas,
com um contato para relatar problema.

## Parte 2 — o kit para escolas

Escola e rede não compram por selo, compram por documento. Um PDF ou uma página
"Segurança e privacidade", entregue quando o contato chega por `/contato?assunto=escolas`:

- [ ] **Onde os dados ficam**: provedor e região do banco (PostgreSQL) e do armazenamento de
      áudio (R2/S3), e se há transferência internacional (LGPD, art. 33).
- [ ] **Quem vê o quê**: o professor vê só a própria turma; a coordenação vê **só números**,
      nunca nome de aluno nem resposta (`docs/adr-005-escola.md`). É o argumento mais forte para
      a escola, e ele é verdade no código.
- [ ] **Dado do aluno**: nome (ou apelido) e um identificador de aparelho; e-mail só se o
      professor cadastrar; conta opcional; gravação de voz só com autorização e por 7 dias.
- [ ] **Criptografia**: TLS em trânsito; em repouso, conforme o provedor do banco e do bucket.
- [ ] **Retenção e exclusão**: o professor apaga tentativa e aluno; o que acontece com os dados
      quando o contrato termina (hoje é pendência: "encerrar a conta" ainda não existe).
- [ ] **Incidente**: quem avisa a escola e em quanto tempo, e a comunicação à ANPD (LGPD,
      art. 48).
- [ ] **Contrato de tratamento de dados** (DPA) modelo, com a escola como controladora e o
      Spokke como operador para os dados dos alunos dela.
- [ ] Contato do encarregado.

## Parte 3 — certificações formais · mais tarde

ISO/IEC 27001 e SOC 2 Type II são o que redes grandes e licitações acabam pedindo. Custam caro
e levam meses de preparo e auditoria. Faça quando um contrato real exigir, não antes. Até lá, o
kit da Parte 2 responde quase tudo que uma escola pergunta.

## O que NÃO colocar

- "Site seguro", "100% protegido", cadeado desenhado, imagem de "selo SSL" que não leva a
  verificação nenhuma. (Os dois selos do rodapé, seção 5b, são LINKS para a verificação ao vivo,
  com o texto convidando a conferir: é isso que os separa destes.)
- "LGPD Compliant" ou "Certificado LGPD" de consultoria.
- Número de usuários, notas ou depoimentos que não existem (`home.md` "Voz").
- Logo de escola cliente sem autorização por escrito.
- Selo de status ("todos os sistemas operando") sem monitoramento de verdade por trás. A página
  `/status` saiu em novembro de 2026 por isso; se um dia houver monitor, ela volta lendo dele.

## Como adicionar um selo no código

1. Confirme que o selo passa na regra do começo: emissor conhecido e página de verificação.
2. Salve a imagem oficial do emissor em `static/selos/` (SVG ou PNG, nunca o script do widget).
3. Acrescente em `selos`, no `src/lib/content/institucional.ts`:

   ```ts
   export const selos: Selo[] = [
   	{
   		nome: 'Reclame Aqui: RA1000',
   		verificacao: 'https://www.reclameaqui.com.br/empresa/<pagina-da-empresa>/',
   		imagem: 'ra1000.svg',
   		largura: 96,
   		altura: 32
   	}
   ];
   ```

4. O rodapé (`SiteFooter.svelte`) mostra a faixa sozinho quando a lista tem algum item, com a
   imagem, o `alt` e o link para o emissor em nova aba. Com a lista vazia, nada aparece.
5. Confira o contraste da imagem no tema escuro. Se o emissor tiver versão para fundo escuro,
   use a que funciona nos dois temas.
