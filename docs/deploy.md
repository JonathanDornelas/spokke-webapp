# Deploy do Spokke — passo a passo

O roteiro para colocar o Spokke no ar em `https://spokke.com.br`, do servidor vazio ao primeiro
aluno, e para mantê-lo depois. Escrito para ser seguido ao pé da letra, na ordem. Cada passo diz
**onde** fazer, **o que** digitar ou clicar, **o que deve aparecer** e **o que fazer se não
aparecer**.

| Parte                                                     | Quando      | Tempo             |
| --------------------------------------------------------- | ----------- | ----------------- |
| [1. Véspera](#parte-1--véspera)                           | hoje        | ~3 h, em painéis  |
| [2. Dia D](#parte-2--dia-d)                               | amanhã      | ~3 h, no servidor |
| [3. Rotina](#parte-3--rotina)                             | sempre      | —                 |
| [4. Mercado Pago](#parte-4--mercado-pago-semana-1)        | semana 1    | ~2 h              |
| [5. Depois do lançamento](#parte-5--depois-do-lançamento) | semanas 1–4 | —                 |

Os arquivos de produção moram em `deploy/`. O resto da operação (o painel `/admin`, a rotina sem
gateway, a intranet) está em `docs/operacao.md`.

## Antes de começar

### Como ler os comandos

- Blocos marcados **No seu computador** são para o PowerShell do Windows. Os marcados **No
  servidor** são para o terminal conectado por SSH.
- `<IP>`, `<seu-email>` e afins são para trocar pelo valor — sem os sinais `<` e `>`.
- Cole um bloco de cada vez e espere terminar antes do próximo. No Windows Terminal, colar é o botão
  direito do mouse ou Ctrl+Shift+V.
- Linhas que começam com `#` são comentários; podem ser coladas junto.
- **Deve aparecer** mostra o trecho da resposta que importa; o resto pode variar.

### Onde guardar senhas e chaves

Toda senha, token e chave deste roteiro vai num gerenciador de senhas (Bitwarden, 1Password) — nunca
num arquivo do repositório, num print, num e-mail ou num chat. No servidor eles ficam só nos arquivos
`.env`, com permissão de leitura só para o dono. Se um vazar, troque.

### Ficha do lançamento

Preencha conforme avança. Só o que não é sigiloso:

| Item                                   | Valor                  |
| -------------------------------------- | ---------------------- |
| IPv4 do servidor                       |                        |
| Usuário do dia a dia no servidor       | `deploy`               |
| Caixa da equipe (`CONTATO_PARA`)       | `equipe@spokke.com.br` |
| E-mail do Let's Encrypt (`ACME_EMAIL`) |                        |
| ID do cliente OAuth do Google          |                        |
| ID de medição do GA4 (`G-...`)         |                        |
| Dia do backup semanal da Hostinger     |                        |

### O que nunca fazer no servidor

- `docker compose down -v`, `docker volume rm` ou `docker system prune --volumes`: apagam o banco, o
  áudio publicado e os certificados.
- `prisma migrate dev` ou `prisma db push`: em produção é só `migrate deploy`, que o script de
  atualizar já roda.
- Abrir no firewall as portas 3000, 5432, 8080, 9000 ou 9001.
- Recriar o Caddy várias vezes seguidas quando o certificado falha: depois de muitas falhas, o Let's
  Encrypt bloqueia o domínio por um tempo. Corrija o DNS antes e suba uma vez.
- Commitar qualquer `.env`.

## Como fica o servidor

```
internet ──► Caddy :80/:443 ─┬─► spokke-web:3000       spokke.com.br (e www → redireciona)
                             └─► spokke-minio:9000      midia.spokke.com.br, só GET em tts/

rede docker "spokke":  spokke-caddy · spokke-web · spokke-worker · spokke-postgres
                       spokke-minio · audiotext
```

| Peça                           | Compose                                         | Memória (teto) |
| ------------------------------ | ----------------------------------------------- | -------------- |
| Caddy (HTTPS)                  | `deploy/caddy/compose.yml`                      | 256 MB         |
| Web + worker                   | `docker-compose.yml` + `deploy/compose/app.yml` | 1 GB + 768 MB  |
| PostgreSQL 16                  | `docker/postgres.yml` + override                | 2 GB           |
| MinIO (mídia)                  | `docker/minio.yml` + override                   | 1 GB           |
| Áudio e tradução               | `../audiotext-service` + override               | 7 GB           |
| Total, de 16 GB + 4 GB de swap |                                                 | ~12 GB         |

Cinco decisões, todas reversíveis:

- **Em produção os composes conversam pela rede Docker `spokke`**, não pelas portas do host. Em
  desenvolvimento (Docker Desktop) eles usam `host.docker.internal`; num Linux exposto à internet
  isso deixaria o banco e o serviço de áudio abertos, porque o Docker passa por cima do firewall ao
  publicar uma porta. Os overrides de `deploy/compose/` só acrescentam a rede; as portas publicadas
  ficam presas ao `127.0.0.1` pelas variáveis de ambiente.
- **A mídia fica no MinIO do próprio servidor no lançamento**, atrás do Caddy. O R2 é a migração
  planejada (Parte 5): ele pede o DNS na Cloudflare para o domínio próprio, e não tem leitura pública
  por pasta — a voz dos alunos (`fala/`) ficaria pública sem uma regra extra.
- **A cobrança abre manual** (`BILLING_PROVIDER` vazio): "Assinar" vira um pedido atendido no
  `/admin`. O Mercado Pago liga na semana, depois do sandbox (Parte 4).
- **A intranet fica para depois.** O `/admin` cobre a operação do dia 1.
- **O backup sai da máquina pela Hostinger.** O dump do banco é feito todo dia e fica no disco do
  servidor; o backup automático semanal da Hostinger leva o servidor inteiro, com esses dumps. O
  preço: perder a máquina pode custar até uma semana de dados, e a cópia fica na mesma empresa. Um
  destino externo diário é uma linha no cron quando isso pesar (Parte 5).

## Parte 1 — Véspera

Quase tudo em painéis. A ordem importa: o DNS e a verificação de domínio levam de minutos a horas
para valer, então eles vêm cedo.

### 1.1 Sua chave SSH

A chave SSH é o que deixa você entrar no servidor sem senha. São dois arquivos: a chave **privada**
(`id_ed25519`), que nunca sai do seu computador, e a **pública** (`id_ed25519.pub`), que vai para o
servidor.

**No seu computador:**

```powershell
Test-Path $env:USERPROFILE\.ssh\id_ed25519.pub
```

Se responder `True`, você já tem uma chave: pule para o último comando deste passo. Se responder
`False`, crie uma:

```powershell
ssh-keygen -t ed25519 -C "jonathan@spokke"
```

1. "Enter file in which to save the key": aperte Enter (aceita o lugar padrão).
2. "Enter passphrase": uma frase-senha protege a chave se o computador for perdido, e é pedida a
   cada conexão. Recomendo usar uma; para não usar, aperte Enter duas vezes.

Copie a chave pública para a área de transferência:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub | Set-Clipboard
```

**Deve aparecer:** nada. Colando num bloco de notas, é uma linha só, começando com
`ssh-ed25519 AAAA` e terminando com `jonathan@spokke`.

### 1.2 Contratar o servidor

Na Hostinger:

1. Contrate o VPS com **4 vCPU, 16 GB de RAM e 200 GB NVMe** — a configuração em que os números do
   serviço de áudio foram medidos.
2. Na configuração inicial, escolha a localização **São Paulo**, se houver.
3. Sistema: **SO simples › Ubuntu 24.04 LTS**. Sem painel de controle e sem aplicativo.
4. Defina a senha do `root` (forte, direto para o gerenciador de senhas).
5. No campo de chave SSH, cole a chave pública do passo 1.1.
6. Scanner de malware e firewall do painel podem ficar desligados: o firewall é configurado no
   próprio servidor (passo 2.6).
7. Conclua e espere a instalação (alguns minutos).
8. Na página do VPS, copie o **endereço IPv4** para a ficha.

### 1.3 Primeiro acesso, só para testar

**No seu computador:**

```powershell
ssh root@<IP>
```

Na primeira conexão ele pergunta `Are you sure you want to continue connecting (yes/no/[fingerprint])?`
— digite `yes` e Enter.

**Deve aparecer:** o prompt do servidor, algo como `root@srv123456:~#`. Saia com `exit`. Nada mais é
feito no servidor hoje.

**Se pedir a senha em vez de entrar direto:** a chave não foi cadastrada. No painel da Hostinger,
adicione a chave SSH ao VPS e tente de novo.

**Opcional, para digitar menos amanhã:** crie o arquivo `C:\Users\jonat\.ssh\config` (sem extensão)
com o conteúdo abaixo. Depois do passo 2.2, `ssh spokke` entra direto como `deploy`.

```
Host spokke
    HostName <IP>
    User deploy
```

### 1.4 Preços

Feito. A página de planos é pública e mostra os preços de `src/lib/billing/precos.ts`: Básico
R$ 29, Pro R$ 59 e Super R$ 99 por mês, e o anual vale dez mensalidades. É o mesmo valor que o
checkout vai cobrar quando o Mercado Pago ligar. O Scholar não tem preço na página: a escola fala
com a equipe e recebe um orçamento. De onde saiu cada número: `docs/adr-002-billing.md` "Preços".

Para mudar um dia: troque os números em `src/lib/billing/precos.ts` (em **centavos**: R$ 39 é
`3_900`, R$ 390 é `39_000`) e rode os testes (`pnpm test:unit -- --run`) — `precos.test.ts` e
`catalogo.test.ts` conferem que a vitrine não promete outra coisa.

Falta só, se já existirem, os dados da empresa em `src/lib/content/institucional.ts`.

### 1.5 O código no GitHub

O servidor baixa o código de dois repositórios do GitHub: `JonathanDornelas/spokke-webapp` (o
Spokke) e `JonathanDornelas/audiotext-service` (o serviço de áudio), sempre do `main`. O trabalho
está no `motion`; o `main` do GitHub tem um commit que o `motion` não tem — um merge antigo
("Merge branch 'criandoV2'"), cujo conteúdo o `motion` já traz —, então juntar os dois não dá
conflito, só cria um commit de merge.

**No seu computador**, na pasta do projeto:

```powershell
git status
```

**Deve aparecer:** `nothing to commit, working tree clean`. Se aparecer arquivo, commite antes. Então:

```powershell
git fetch origin
git checkout main
git merge --ff-only origin/main
git merge --no-edit motion
git push origin main
git checkout motion
git -C ..\audiotext-service push origin main
```

**Deve aparecer:** no primeiro `merge`, `Fast-forward`; no segundo, `Merge made by the 'ort'
strategy`; em cada `push`, uma linha terminando em `main -> main`.

**Se algum `merge` falar em conflito** (`CONFLICT`): rode `git merge --abort`, pare e me chame — não
force.

**Confira no navegador:** no GitHub, repositório `spokke-webapp`, branch `main`: o último commit é o
merge que você acabou de fazer, e a pasta `deploy/` aparece. O `audiotext-service` mostra o commit
"Traduções alternativas no /v1/translate".

### 1.6 DNS: os três endereços

Os registros dizem à internet que `spokke.com.br`, `www.spokke.com.br` e `midia.spokke.com.br` são o
seu servidor. Faça agora: o certificado HTTPS de amanhã depende deles já estarem valendo.

**Onde:** no painel de quem hospeda o DNS do domínio. Se for o próprio registro.br: entre em
registro.br › Domínios › `spokke.com.br` › DNS › editar a zona. Se ele pedir para ativar o "modo
avançado", ative — pode levar um tempo para começar a valer, mais um motivo para ser o primeiro
passo. Se o domínio apontar para outros servidores DNS (Hostinger, Cloudflare), os registros vão no
painel deles.

Crie os três:

| Tipo | Nome    | Valor            | TTL (se houver o campo) |
| ---- | ------- | ---------------- | ----------------------- |
| A    | (vazio) | IPv4 do servidor | 300                     |
| A    | `www`   | IPv4 do servidor | 300                     |
| A    | `midia` | IPv4 do servidor | 300                     |

"Nome vazio" é o próprio `spokke.com.br` (alguns painéis pedem `@`). Digite só `www` e `midia`:
o painel completa o domínio sozinho. **Não crie registro AAAA (IPv6)** por enquanto: um IPv6 mal
configurado faz o Let's Encrypt falhar.

**Confira no seu computador** (pergunta ao DNS do Google, que não tem cache do seu provedor):

```powershell
Resolve-DnsName spokke.com.br -Server 8.8.8.8 -Type A
Resolve-DnsName www.spokke.com.br -Server 8.8.8.8 -Type A
Resolve-DnsName midia.spokke.com.br -Server 8.8.8.8 -Type A
```

**Deve aparecer:** o IPv4 do servidor na coluna `IPAddress`, nos três.

**Se não aparecer:** espere (de minutos a algumas horas) e repita. Se depois de algumas horas
continuar errado, confira no painel se o nome não ficou duplicado (`www.spokke.com.br.spokke.com.br`).

### 1.7 E-mail que sai: Resend

É por onde saem os convites, o "esqueci a senha" e os avisos da equipe. Sem o domínio verificado, o
Resend só entrega para o e-mail da própria conta.

1. Crie a conta em resend.com, com a caixa da equipe.
2. **Domains › Add Domain › `spokke.com.br`.** Se perguntar a região, escolha São Paulo
   (`sa-east-1`), se houver.
3. Ele mostra uma tabela de registros: um **MX** e um **TXT** com nome `send`, e um **TXT** com nome
   `resend._domainkey` (o DKIM, uma linha longa).
4. No painel do DNS, crie cada um exatamente como aparece: tipo, nome, valor e, no MX, a prioridade
   (10). Copie os valores pelo botão de copiar do Resend — um caractere a menos no DKIM invalida o
   registro.
5. Volte ao Resend e clique em **Verify DNS Records**. Pode levar de minutos a algumas horas; o
   status passa a **Verified**.
6. **API Keys › Create API Key:** nome `spokke-producao`, permissão **Sending access**, domínio
   `spokke.com.br`. Copie a chave (`re_...`) para o gerenciador: ela aparece uma vez só.

Amanhã ela entra no `SMTP_URL`, assim: `smtps://resend:re_SUA_CHAVE@smtp.resend.com:465` (o usuário
é literalmente `resend`).

**Se a verificação não sair:** confira se os nomes não ficaram duplicados no DNS
(`send.spokke.com.br.spokke.com.br`) e se o valor do DKIM está inteiro.

### 1.8 E-mail que chega: as caixas do site

O site mostra `suporte@`, `privacidade@`, `escolas@` e `acessibilidade@spokke.com.br`, e os pedidos
de plano, o contato e os relatos de problema vão para a caixa da equipe (`CONTATO_PARA`). Elas
precisam receber. O caminho mais simples é um serviço de encaminhamento; aqui, o ImprovMX (grátis):

1. Crie a conta em improvmx.com e adicione o domínio `spokke.com.br`.
2. No DNS, os registros que ele mostrar. Hoje são: MX (nome vazio) `mx1.improvmx.com` com prioridade
   10; MX (nome vazio) `mx2.improvmx.com` com prioridade 20; e TXT (nome vazio)
   `v=spf1 include:spf.improvmx.com ~all`. Se o ImprovMX mostrar valores diferentes, valem os dele.
3. Crie os aliases, todos encaminhando para o seu Gmail: `suporte`, `privacidade`, `escolas`,
   `acessibilidade`, `equipe`, `dmarc` e `letsencrypt` (ou um alias `*`, que pega tudo).
4. **Teste:** mande um e-mail do seu Gmail para `suporte@spokke.com.br`. Ele chega no Gmail.

Anote na ficha: `CONTATO_PARA` = `equipe@spokke.com.br`, `ACME_EMAIL` = `letsencrypt@spokke.com.br`.

**Um SPF só no nome vazio.** Se um dia outro serviço pedir SPF no `spokke.com.br`, junte os dois
num registro só (`v=spf1 include:spf.improvmx.com include:outro ~all`). O SPF do Resend fica em
`send` e não conflita.

### 1.9 DMARC

O DMARC diz aos provedores de e-mail o que fazer com mensagem que finge ser do Spokke. No DNS:

| Tipo | Nome     | Valor                                              |
| ---- | -------- | -------------------------------------------------- |
| TXT  | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@spokke.com.br` |

`p=none` só gera relatórios (que chegam no alias `dmarc`). Endurecer para `p=quarantine` é depois de
umas semanas de relatório limpo (Parte 5).

### 1.10 Google Search Console

É por ele que o Google indexa o site e avisa se o marcar como inseguro.

1. Abra search.google.com/search-console com a conta Google da empresa.
2. **Adicionar propriedade › Domínio** (o quadro da esquerda) › `spokke.com.br` › Continuar.
3. Ele mostra um registro TXT `google-site-verification=...`. Copie.
4. No DNS, crie um TXT com nome vazio e esse valor. Pode conviver com o TXT do SPF: vários TXT no
   mesmo nome são permitidos (só não dois SPF).
5. Volte ao Search Console e clique em **Verificar**.

**Se disser que não encontrou:** espere (até algumas horas) e clique de novo — o registro fica, não
precisa refazer. O sitemap é enviado amanhã, com o site no ar (passo 2.19).

### 1.11 Login com o Google

O botão "Continuar com o Google" do professor e do aluno. Sem estas chaves o botão simplesmente não
aparece — o resto do site funciona igual.

1. Abra console.cloud.google.com. No seletor de projeto (topo da tela): **Novo projeto**, nome
   "Spokke", Criar. Selecione o projeto novo.
2. Menu › **APIs e serviços › Tela de consentimento OAuth**. Em contas novas, isto aparece como
   **Google Auth Platform › Primeiros passos**.
3. Nome do app: `Spokke`. E-mail de suporte: a caixa da equipe. Público: **Externo**. Contato: a
   caixa da equipe. Concorde com a política e crie.
4. Em **Branding** (identidade da marca): página inicial `https://spokke.com.br`, política de
   privacidade `https://spokke.com.br/privacidade`, termos `https://spokke.com.br/termos`, domínio
   autorizado `spokke.com.br`. Salve. **Sem logotipo** por enquanto: o logo pede uma verificação da
   marca que leva dias.
5. Em **Público** (Audience): clique em **Publicar app** e confirme. O status passa a "Em produção".
   Sem isso, só os e-mails da lista de testadores conseguem entrar.
6. Em **Clientes** (ou Credenciais › Criar credenciais): **ID do cliente OAuth**, tipo **Aplicativo
   da Web**, nome `Spokke web`.
7. Em "URIs de redirecionamento autorizados", **Adicionar URI**:
   `https://spokke.com.br/api/auth/callback/google`.
8. **Adicionar URI** de novo: `https://spokke.com.br/api/auth-aluno/callback/google`. São duas
   porque professor e aluno são contas separadas, cada uma com a sua volta.
9. "Origens JavaScript autorizadas": deixe vazio. **Criar.**
10. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`) para a ficha e a **chave
    secreta do cliente** (`GOCSPX-...`) para o gerenciador. Em contas novas a chave secreta pode
    aparecer só agora: se houver "Baixar JSON", baixe.

Escopos ("Acesso a dados"): não adicione nada. Os básicos (e-mail, perfil, `openid`) já valem e não
passam por verificação.

### 1.12 Google Analytics 4

1. Abra analytics.google.com › **Administrador** (engrenagem, canto inferior esquerdo) › **Criar ›
   Propriedade**.
2. Nome `Spokke`, fuso horário "(GMT-03:00) Brasil – São Paulo", moeda Real (BRL). Avance pelos
   detalhes da empresa e objetivos (qualquer resposta serve) e crie.
3. Plataforma: **Web**. URL `https://spokke.com.br`, nome do fluxo `Site`. Deixe a "medição
   otimizada" ligada e clique em **Criar fluxo**.
4. Copie o **ID da métrica** (`G-...`) para a ficha.
5. Ainda no fluxo: **Medição otimizada › engrenagem › Visualizações de página › Mostrar
   configurações avançadas** › desligue **"Alterações de página com base em eventos do histórico do
   navegador"** › Salvar. O site já registra uma visualização a cada troca de tela; com essa opção
   ligada, cada navegação contaria duas vezes.
6. **Administrador › Coleta de dados:** "Indicadores do Google" desligado.
7. **Administrador › Retenção de dados:** 14 meses › Salvar.

Não instale a tag pelo assistente do Google: o código já está no site e liga sozinho com o
`PUBLIC_GA_ID`, só nas páginas públicas e só depois do "Aceitar" no aviso. Os eventos principais e as
dimensões são amanhã, com dado chegando (passo 2.19).

### 1.13 Backup automático da Hostinger

O backup diário do banco precisa sair do servidor: um backup que mora na mesma máquina não sobrevive
à perda da máquina. Quem o tira de lá é o backup automático da Hostinger, que copia o servidor
inteiro uma vez por semana, com os dumps do banco dentro (passo 2.17).

1. No painel da Hostinger, abra a página do VPS › **Backups** (no menu do VPS; o nome da seção pode
   variar entre "Backups" e "Snapshots e backups").
2. Confira que o **backup automático semanal** está ativo. Ele vem no plano.
3. Anote na ficha o dia da semana em que ele roda.
4. Se perder até uma semana de dados não for aceitável, o **backup diário** é um adicional pago, na
   mesma tela.

### 1.14 Monitor e opcionais

- Crie a conta no uptimerobot.com (grátis). O monitor é criado amanhã, com o site no ar.
- Opcional no dia 1: a chave do Gemini para "Gerar com IA" (de um projeto Google Cloud **com
  faturamento** — a política de privacidade promete que os dados não treinam modelo, o que não vale
  na camada grátis). Sem ela, o botão fica travado com o motivo escrito.

### 1.15 Conferência da véspera

- [ x] Chave SSH criada e o `ssh root@<IP>` entrando sem senha.
- [ x] Preços reais commitados (ou a decisão de abrir sem divulgar a página de planos).
- [x] `main` no GitHub com a pasta `deploy/`, e o `audiotext-service` com push.
- [ x] Os três registros A respondendo o IP do servidor no `8.8.8.8`.
- [ x] Resend com o domínio **Verified** e a chave `re_...` no gerenciador.
- [x ] E-mail para `suporte@spokke.com.br` chegando no seu Gmail.
- [x ] DMARC criado.
- [ x] Search Console verificado.
- [x ] Cliente OAuth do Google criado e o app **publicado**.
- [ x] GA4 criado, com a medição do histórico desligada.
- [ x] Backup automático da Hostinger ativo, com o dia anotado na ficha.

## Parte 2 — Dia D

| Tempo (aprox.) | Passos                                                      |
| -------------- | ----------------------------------------------------------- |
| 0:00           | 2.1 a 2.6 — preparar o servidor                             |
| 0:25           | 2.7 a 2.9 — código e segredos                               |
| 0:40           | 2.10 — o serviço de áudio começa (fica pronto lá pela 1:20) |
| 0:45           | 2.11 e 2.12 — banco, MinIO e a aplicação                    |
| 1:00           | 2.13 a 2.15 — HTTPS e o primeiro admin                      |
| 1:30           | 2.16 — teste de fumaça (com o áudio pronto)                 |
| 2:15           | 2.17 a 2.20 — backup, monitor, busca e a decisão de abrir   |

### 2.1 Entrar como root e atualizar o sistema

**No seu computador:**

```powershell
ssh root@<IP>
```

**No servidor:**

```bash
apt update && apt -y full-upgrade
apt -y install ufw fail2ban unattended-upgrades git curl dnsutils
```

Durante a atualização, se aparecer uma tela roxa perguntando quais serviços reiniciar, aperte Enter
(aceita o padrão). Se perguntar sobre manter um arquivo de configuração, escolha manter a versão
local (o padrão).

```bash
ls /var/run/reboot-required 2>/dev/null && reboot
```

Se o servidor reiniciar, espere um minuto e entre de novo com `ssh root@<IP>`.

### 2.2 O usuário do dia a dia

Ninguém trabalha como `root` depois deste passo. O usuário `deploy` tem `sudo` (com senha) e roda o
Docker.

**No servidor:**

```bash
adduser --gecos "" deploy
```

Ele pede uma senha duas vezes: é a senha do `sudo` do `deploy` (direto para o gerenciador).

```bash
usermod -aG sudo deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
install -m 600 -o deploy -g deploy /root/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
id deploy
```

**Deve aparecer:** `groups=...(deploy),27(sudo)`.

### 2.3 SSH só com chave

Desliga o login por senha — a porta mais atacada de qualquer servidor na internet.

**No servidor:**

```bash
cat > /etc/ssh/sshd_config.d/10-spokke.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin prohibit-password
EOF
sshd -t && systemctl restart ssh
```

**Deve aparecer:** nada (sem erro).

**Agora, sem fechar esta janela**, abra OUTRA janela do terminal no seu computador e entre como
`deploy`:

```powershell
ssh deploy@<IP>
```

Se entrou (prompt `deploy@...:~$`), teste o `sudo`:

```bash
sudo -v
```

Ele pede a senha do `deploy` e volta sem erro. **Só então** feche a janela do `root`. Se a segunda
janela não entrar, desfaça pela primeira (`rm /etc/ssh/sshd_config.d/10-spokke.conf && systemctl
restart ssh`) e me chame.

### 2.4 Docker

Os passos 2.4 a 2.6 continuam como administrador. Na janela do `deploy`, vire `root` por um momento:

```bash
sudo -i
```

**No servidor (como root):**

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
cat > /etc/docker/daemon.json <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
EOF
systemctl restart docker
docker run --rm hello-world
docker compose version
```

**Deve aparecer:** `Hello from Docker!` e `Docker Compose version v2...`.

O `daemon.json` limita o log de cada container a 5 arquivos de 10 MB. Sem ele, o disco enche de log
em algumas semanas.

### 2.5 Swap

Uma folga de 4 GB de disco usada como memória, para o pico do serviço de áudio carregando os
modelos.

**No servidor (como root):**

```bash
swapon --show
```

Se já mostrar uma linha de swap, pule o resto deste passo. Se não mostrar nada:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
echo 'vm.swappiness=10' > /etc/sysctl.d/99-swappiness.conf && sysctl --system > /dev/null
free -h
```

**Deve aparecer:** na linha `Swap:`, um total de `4.0Gi`.

### 2.6 Firewall e proteção do SSH

**No servidor (como root):**

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable
systemctl enable --now fail2ban
ufw status
```

**Deve aparecer:** `Status: active` e quatro regras `ALLOW`: `OpenSSH`, `80/tcp`, `443/tcp` e
`443/udp`.

O `fail2ban` bloqueia por um tempo o IP que erra o SSH repetidas vezes. E uma coisa a saber sobre o
firewall: as portas que o Docker publica passam por cima do `ufw`. É por isso que todas as portas dos
containers, menos as do Caddy, ficam presas ao `127.0.0.1` nos arquivos de ambiente — a conferência é
no passo 2.14.

Volte a ser `deploy` e entre de novo (o grupo `docker` só vale numa sessão nova):

```bash
exit
exit
```

**No seu computador:**

```powershell
ssh deploy@<IP>
```

### 2.7 O código

**No servidor:**

```bash
sudo install -d -o deploy -g deploy /srv/spokke
cd /srv/spokke && mkdir -p env backups
ssh-keygen -t ed25519 -N "" -C "spokke-vps:spokke-webapp" -f ~/.ssh/deploy_spokke
ssh-keygen -t ed25519 -N "" -C "spokke-vps:audiotext-service" -f ~/.ssh/deploy_audiotext
cat >> ~/.ssh/config <<'EOF'
Host github-spokke
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_spokke
  IdentitiesOnly yes

Host github-audiotext
  HostName github.com
  User git
  IdentityFile ~/.ssh/deploy_audiotext
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

São as chaves com que o SERVIDOR baixa o código — diferentes da sua. **Duas, uma por repositório,
porque o GitHub não aceita a mesma deploy key em dois repositórios** ("Key is already in use"); o
`~/.ssh/config` diz qual chave vale para cada um.

Cadastre cada uma como **deploy key só de leitura** no seu repositório. Para ver a chave, rode o
`cat` no servidor, selecione a linha que aparecer (começa com `ssh-ed25519`) e copie:

1. `cat ~/.ssh/deploy_spokke.pub` › no GitHub, repositório `spokke-webapp` › Settings › **Deploy
   keys** › Add deploy key. Título `spokke-vps`, cole a chave, deixe **desmarcado** "Allow write
   access" › Add key.
2. `cat ~/.ssh/deploy_audiotext.pub` › repositório `audiotext-service`, o mesmo caminho e o mesmo
   título.

**No servidor:**

```bash
ssh-keyscan github.com >> ~/.ssh/known_hosts
git clone git@github-spokke:JonathanDornelas/spokke-webapp.git spokke-service
git clone git@github-audiotext:JonathanDornelas/audiotext-service.git
git -C spokke-service log --oneline -1
ls spokke-service/deploy
```

**Deve aparecer:** o commit do passo 1.5 e as pastas `caddy  compose  env  scripts`.

**Se o clone der `Permission denied (publickey)`:** a deploy key não foi salva naquele repositório,
ou a chave de um foi parar no outro. Confira o passo acima e repita o `git clone`.

### 2.8 A rede e os arquivos de ambiente

**No servidor:**

```bash
cd /srv/spokke
docker network create spokke
cp spokke-service/deploy/env/infra.env.exemplo     env/infra.env
cp spokke-service/deploy/env/app.env.exemplo       spokke-service/.env
cp spokke-service/deploy/env/audiotext.env.exemplo audiotext-service/.env
cp spokke-service/deploy/env/caddy.env.exemplo     spokke-service/deploy/caddy/.env
chmod 600 env/infra.env spokke-service/.env audiotext-service/.env spokke-service/deploy/caddy/.env
ls -l env/infra.env spokke-service/.env audiotext-service/.env spokke-service/deploy/caddy/.env
```

**Deve aparecer:** os quatro arquivos com `-rw-------`.

São quatro arquivos porque são quatro composes: o banco e o MinIO (`env/infra.env`), a aplicação
(`spokke-service/.env`), o serviço de áudio (`audiotext-service/.env`) e o Caddy
(`deploy/caddy/.env`). Cada um tem comentários explicando cada linha.

**Preparou o `.env` da aplicação no seu computador?** (O `.env.prod`: uma cópia do
`deploy/env/app.env.exemplo` com os valores das contas da véspera, e os segredos internos ainda como
`TROCAR`.) Mande-o agora, por cima da cópia do modelo. **No seu computador**, na pasta do projeto:

```powershell
scp .env.prod deploy@<IP>:/srv/spokke/spokke-service/.env
```

**No servidor:**

```bash
sed -i 's/\r$//' /srv/spokke/spokke-service/.env
chmod 600 /srv/spokke/spokke-service/.env
```

O `sed` tira a quebra de linha do Windows, se ela tiver vindo junto. Três cuidados:

- **Nunca monte esse arquivo a partir do `.env` de desenvolvimento.** Os endereços de lá são
  `localhost`, as variáveis `_DOCKER` vêm vazias e faltam as do proxy. E o `STORAGE_PUBLIC_URL`
  errado fica gravado no banco em todo áudio publicado.
- **Mande uma vez só.** Depois do passo 2.9, o arquivo do servidor tem os segredos internos, que o
  seu `.env.prod` não tem. Mandar de novo por cima apaga a senha do banco do `.env`, e a aplicação
  para de conectar. Para mudar algo depois, edite no servidor (Parte 3, "Mudar uma configuração").
- **Apague o `.env.prod` do computador** quando o site estiver no ar, ou guarde-o no gerenciador de
  senhas: ele tem as chaves do Resend, do Google e do Gemini, e a pasta do projeto sincroniza com o
  OneDrive.

### 2.9 Os segredos

**Os internos** — a senha do banco, a do MinIO, o segredo do login e o token do serviço de áudio —
são gerados por um script, que grava cada um igual nos arquivos que precisam dele. Nada é copiado à
mão.

**No servidor:**

```bash
bash /srv/spokke/spokke-service/deploy/scripts/gerar-segredos.sh
```

**Deve aparecer:** `Gerados e gravados: senha do banco, senha do MinIO, segredo do Better Auth, token
do áudio.`, seguido da lista do que falta preencher à mão: `SMTP_URL`, `CONTATO_PARA` e
`ACME_EMAIL`. Se você mandou o `.env.prod`, a lista traz só o `ACME_EMAIL`, e a tabela abaixo serve
para conferir.

**Se aparecer `Só parte dos segredos está como TROCAR`:** algum segredo interno do `.env` da
aplicação já tinha valor (`BETTER_AUTH_SECRET`, `STORAGE_SECRET_ACCESS_KEY`, `AUDIOTEXT_TOKEN` ou a
senha dentro das duas `DATABASE_URL`). Volte cada um para `TROCAR`, como está no modelo, e rode de
novo. Nada foi mudado.

**Os externos** vêm das contas da véspera. Abra o arquivo da aplicação:

```bash
nano /srv/spokke/spokke-service/.env
```

Como usar o `nano`: as setas andam; **Ctrl+W** procura (digite o nome da variável e Enter); colar é o
botão direito do mouse ou Ctrl+Shift+V; **Ctrl+O** e Enter salvam; **Ctrl+X** sai. Mantenha as aspas
em volta de cada valor.

| Variável                   | O que pôr                                                             |
| -------------------------- | --------------------------------------------------------------------- |
| `SMTP_URL`                 | troque `re_TROCAR` pela chave do Resend (passo 1.7), mantendo o resto |
| `CONTATO_PARA`             | `equipe@spokke.com.br`                                                |
| `GOOGLE_CLIENT_ID`         | o ID do cliente OAuth (passo 1.11)                                    |
| `GOOGLE_CLIENT_SECRET`     | a chave secreta do cliente (passo 1.11)                               |
| `PUBLIC_GA_ID`             | o `G-...` (passo 1.12)                                                |
| `GEMINI_*`, `LLM_PROVIDER` | só se a chave do Gemini estiver pronta (senão, deixe vazio)           |

O que ficar vazio fica desligado, sem quebrar nada: sem as chaves do Google o botão não aparece, sem
o GA nada é medido. Dá para preencher depois (Parte 3, "Mudar uma configuração").

Agora o do Caddy:

```bash
nano /srv/spokke/spokke-service/deploy/caddy/.env
```

Troque `TROCAR@spokke.com.br` por `letsencrypt@spokke.com.br`, salve e saia.

**Confira — não pode sobrar nenhum:**

```bash
grep -nE '^[A-Z_]+=.*TROCAR' /srv/spokke/env/infra.env /srv/spokke/spokke-service/.env /srv/spokke/audiotext-service/.env /srv/spokke/spokke-service/deploy/caddy/.env
```

**Deve aparecer:** nada.

Por último, um atalho que o resto do roteiro usa — `spk` é o comando do compose da aplicação, de
qualquer pasta:

```bash
echo "alias spk='docker compose -f /srv/spokke/spokke-service/docker-compose.yml -f /srv/spokke/spokke-service/deploy/compose/app.yml'" >> ~/.bashrc
source ~/.bashrc
```

### 2.10 O serviço de áudio

É o mais lento: a imagem compila o fonemizador de japonês e chinês, e a primeira subida baixa uns
4 GB de modelos (Whisper, Kokoro e o tradutor). Ele começa agora, e o resto anda enquanto ele termina.

**No servidor:**

```bash
cd /srv/spokke/audiotext-service
docker compose -f docker-compose.yml -f ../spokke-service/deploy/compose/audiotext.yml up -d --build
```

O build leva de 15 a 30 minutos. Quando o comando terminar, o container está de pé e baixando os
modelos. Siga para o passo 2.11 e volte aqui depois. Para esperar até ele ficar pronto:

```bash
until curl -sf http://127.0.0.1:8080/health | grep -q '"ok"'; do echo "carregando..."; sleep 20; done; echo "pronto"
```

Com ele pronto, a conferência dos idiomas:

```bash
TOKEN=$(grep '^AUDIOTEXT_API_TOKEN=' .env | cut -d'"' -f2)
curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:8080/v1/info | python3 -m json.tool
```

**Deve aparecer:** um JSON em que `languages.tts` e `tts.languages_ready` listam os mesmos idiomas.
Diferença entre os dois é um idioma que o serviço anuncia e não entrega (a nota do japonês e do
chinês no CLAUDE.md).

**Se der errado:**

- O build falhou: `docker compose build --progress=plain 2>&1 | tail -60` mostra onde.
- O container reinicia sem parar: `docker compose logs --tail 100`.
- Falta de memória: `free -h` e `docker stats --no-stream`.

### 2.11 O banco e o MinIO

**No servidor:**

```bash
cd /srv/spokke/spokke-service
docker compose --env-file ../env/infra.env -f docker/postgres.yml -f deploy/compose/postgres.yml up -d
docker compose --env-file ../env/infra.env -f docker/minio.yml -f deploy/compose/minio.yml up -d
```

Confira os dois:

```bash
docker exec spokke-postgres pg_isready -U spokke -d spokke
docker logs spokke-minio-init | tail -6
```

**Deve aparecer:** `accepting connections`; e, no log do MinIO, a regra `fala-do-aluno-7-dias`. O
container `spokke-minio-init` aparece como "Exited (0)" em `docker ps -a` — é esperado: ele cria o
bucket, a leitura pública só em `tts/` e a regra de 7 dias, e sai.

### 2.12 A aplicação

**No servidor:**

```bash
cd /srv/spokke/spokke-service
spk build
```

Leva uns 5 minutos. Depois, as migrations — é aqui que o banco ganha as tabelas:

```bash
spk run --rm --no-deps web ./node_modules/.bin/prisma migrate deploy
```

**Deve aparecer:** a lista de migrations aplicadas e, no fim,
`All migrations have been successfully applied.`

Agora o worker, depois o web (a ordem importa: o worker precisa conhecer todo tipo de tarefa que o
web vai enfileirar):

```bash
spk up -d worker
spk up -d web
sleep 30
docker ps --format 'table {{.Names}}\t{{.Status}}'
curl -sI http://127.0.0.1:3000/ | head -1
docker logs --tail 20 spokke-worker
```

**Deve aparecer:** `spokke-web` com `(healthy)`, `HTTP/1.1 200 OK`, e o log do worker sem erro de
conexão.

**Se der errado:**

- `spokke-web` reiniciando: `docker logs --tail 80 spokke-web`. O mais comum é variável faltando no
  `.env`.
- Erro de conexão com o banco: a senha do `DATABASE_URL_DOCKER` tem de ser a do `POSTGRES_PASSWORD`
  (o script de segredos cuida disso — confira se ele rodou antes do passo 2.11).

### 2.13 HTTPS: o Caddy

O Caddy pede os certificados ao Let's Encrypt na primeira subida, e para isso o DNS precisa já
apontar para este servidor.

**No servidor:**

```bash
dig +short spokke.com.br www.spokke.com.br midia.spokke.com.br
```

**Deve aparecer:** o IP do servidor, três vezes. Se algum não aparecer, **não suba o Caddy**: espere
o DNS (passo 1.6).

```bash
cd /srv/spokke/spokke-service/deploy/caddy
docker compose up -d
docker logs -f spokke-caddy
```

**Deve aparecer**, em até um minuto: `certificate obtained successfully` para `spokke.com.br`,
`www.spokke.com.br` e `midia.spokke.com.br`. Ctrl+C sai do log (o Caddy continua).

```bash
curl -sI https://spokke.com.br | head -1
curl -sI https://spokke.com.br | grep -i strict-transport
curl -sI https://www.spokke.com.br | grep -i '^location'
curl -sI https://midia.spokke.com.br/spokke-midia/fala/teste | head -1
```

**Deve aparecer:** `HTTP/2 200`; `strict-transport-security: max-age=15552000; includeSubDomains`;
`location: https://spokke.com.br/`; e `HTTP/2 404` na última (a voz dos alunos não passa, nem com o
endereço certo).

**Se o certificado falhar:** o log diz qual domínio e por quê. Quase sempre é o DNS ainda não
apontando, ou a porta 80 fechada (`sudo ufw status`). Corrija e reinicie **uma vez**:
`docker compose restart`.

### 2.14 Conferência de fora

**No seu computador:**

```powershell
curl.exe -sI http://spokke.com.br
curl.exe -sI https://spokke.com.br
Test-NetConnection <IP> -Port 443
Test-NetConnection <IP> -Port 5432
Test-NetConnection <IP> -Port 8080
Test-NetConnection <IP> -Port 9000
```

**Deve aparecer:** o `http://` respondendo `308 Permanent Redirect` para o `https://`; o `https://`
com `200`; `TcpTestSucceeded : True` só na 443; `False` na 5432, na 8080 e na 9000 (o teste das
fechadas demora uns segundos para desistir).

**No servidor**, a mesma coisa vista de dentro:

```bash
sudo ss -tlnp | grep -vE '127\.0\.0\.|\[::1\]'
```

**Deve aparecer:** só as portas 22, 80 e 443 (cada uma duas vezes: `0.0.0.0` é o IPv4, `[::]` o
IPv6). O filtro tira tudo o que só o próprio servidor alcança — como o DNS local do Ubuntu
(`systemd-resolve`, porta 53, em `127.0.0.53` e `127.0.0.54`).

**Se alguma outra porta aparecer aberta:** o arquivo de ambiente daquele compose não está com o
`127.0.0.1:` na frente da porta. Corrija e recrie aquele compose.

### 2.15 O primeiro admin

1. No navegador, crie a sua conta de professor em `https://spokke.com.br/cadastro`.
2. **No servidor**, pegue o id dela (troque o e-mail):

```bash
docker exec spokke-postgres psql -U spokke -d spokke -tAc "SELECT id FROM \"Teacher\" WHERE email = '<seu-email>';"
```

3. Copie o id que apareceu, abra o `.env` e cole entre as aspas de `PLATFORM_ADMIN_IDS`:

```bash
nano /srv/spokke/spokke-service/.env
spk up -d --force-recreate --no-deps web worker
```

4. Abra `https://spokke.com.br/admin`. **Deve aparecer:** o painel interno. Para qualquer outra
   pessoa, `/admin` continua respondendo 404.

**Mudou o `.env`, é sempre o `spk up -d --force-recreate --no-deps web worker`**: as variáveis só
entram quando o container é recriado.

### 2.16 Teste de fumaça

Use o computador e um celular **fora do Wi-Fi** (4G), que é como o aluno chega. Faça na ordem; cada
item diz o que tem de acontecer.

- [ ] **Endereços.** `https://spokke.com.br` abre com o cadeado; `http://spokke.com.br` e
      `www.spokke.com.br` caem em `https://spokke.com.br`.
- [ ] **Conta e e-mail.** Saia da conta, clique em "Esqueci a senha" e peça o link. O e-mail chega na
      caixa de entrada (não no spam), e o link abre a tela de nova senha.
- [ ] **Atividade.** Crie uma atividade de inglês. Na etapa 2, cole três frases em inglês sem a
      tradução: a tradução aparece sozinha. Gere as questões.
- [ ] **Áudio.** Na etapa 4, os áudios ficam prontos ("x de y") em cerca de um minuto. Se travar em
      "gerando", veja a Parte 3, "Se algo der errado".
- [ ] **Publicar.** Aparecem o link, o QR e o código.
- [ ] **O aluno.** No celular, abra o link, digite um nome e responda: uma questão de escuta (o áudio
      toca), uma de fala (o navegador pede o microfone e a frase entendida aparece) e uma de escrita.
      Veja o resultado.
- [ ] **O professor vê.** No Studio, o sino avisa que alguém terminou, e "Resultados" mostra o
      número e a tentativa.
- [ ] **Convite.** Crie uma turma com um aluno de outro e-mail seu, envie a atividade: o convite
      chega, e o link pessoal abre a atividade com o nome do aluno.
- [ ] **Equipe.** Mande o formulário de contato e, numa questão, "Relatar problema": os dois chegam
      em `equipe@spokke.com.br`.
- [ ] **Google.** "Continuar com o Google" entra como professor (numa aba anônima, para não misturar
      com a sua sessão) e como aluno.
- [ ] **Plano.** "Assinar" um plano: o pedido chega por e-mail e aparece em `/admin/pedidos`.
- [ ] **Medição.** Numa aba anônima, abra a home e clique em "Aceitar" no aviso: a visita aparece em
      **Relatórios › Tempo real** no Google Analytics.
- [ ] **Blog e busca.** `/blog` abre com as capas; um artigo abre; `/sitemap.xml` e `/robots.txt`
      respondem.

Tudo passou? Siga. Algo falhou? Parte 3, "Se algo der errado", antes de seguir.

### 2.17 Backup automático

**No servidor**, primeiro um backup de verdade, para provar o caminho:

```bash
bash /srv/spokke/spokke-service/deploy/scripts/backup-postgres.sh
ls -lh /srv/spokke/backups/
```

**Deve aparecer:** `ok <tamanho> /srv/spokke/backups/spokke-<data>.dump`, e o mesmo arquivo na
listagem.

Por fim, o agendamento diário (06:15 UTC são 03:15 em Brasília), sem abrir editor:

```bash
(crontab -l 2>/dev/null; echo '15 6 * * * bash /srv/spokke/spokke-service/deploy/scripts/backup-postgres.sh >> /srv/spokke/backups/backup.log 2>&1') | crontab -
crontab -l
```

**Deve aparecer:** a linha do backup, uma vez. Rode o primeiro comando **uma vez só** — de novo, ele
duplica a linha, e o backup passa a rodar duas vezes por noite. Amanhã de manhã, a última linha de
`/srv/spokke/backups/backup.log` tem de ser um `ok` do dia.

**Se preferir o `crontab -e`:** cole só a linha que começa com `15 6`. As três crases (```) que
delimitam o bloco no roteiro não entram — com elas, o cron recusa com `bad minute`.

Os dumps ficam 14 dias em `/srv/spokke/backups`, e o backup semanal da Hostinger (passo 1.13) os leva
para fora da máquina junto com o resto do disco.

### 2.18 Monitor e snapshot

- **Monitor:** no UptimeRobot, Add New Monitor › tipo **Keyword** › URL `https://spokke.com.br` ›
  palavra-chave `Spokke` › intervalo de 5 minutos › alerta por e-mail para a caixa da equipe. Se o
  site cair, o e-mail chega em até 5 minutos.
- **Snapshot:** no painel da Hostinger, na página do VPS, crie um **snapshot** agora, com tudo
  funcionando. É a fotografia do servidor inteiro para voltar se algo der muito errado. Antes de cada
  operação arriscada (uma migration grande, uma atualização do sistema), outro.

### 2.19 Busca, medição e selos

1. **Search Console › Sitemaps:** adicione `https://spokke.com.br/sitemap.xml` › Enviar. O status
   fica "Sucesso" em minutos ou horas.
2. **Search Console › Configurações › Associações:** associe a propriedade do Google Analytics.
3. **Bing Webmaster Tools** (bing.com/webmasters): entre com a conta Google e use **Importar do
   Google Search Console** — ele traz a propriedade e o sitemap.
4. **GA4 › Administrador › Eventos:** os eventos aparecem depois que acontecem pela primeira vez
   (`sign_up` depois de um cadastro com o aviso aceito, `generate_lead` depois de um contato). Quando
   aparecerem, marque os dois como **evento principal**.
5. **GA4 › Administrador › Definições personalizadas › Criar dimensão personalizada:** três, todas
   com escopo **Evento** — "Origem" com o parâmetro `origem`, "Artigo" com `artigo` e "Rótulo" com
   `rotulo`. É o que diz qual artigo do blog trouxe cada cadastro.
6. **SSL Labs:** abra `https://www.ssllabs.com/ssltest/analyze.html?d=spokke.com.br` e espere o teste
   (uns 2 minutos). **Deve aparecer:** nota **A** ou **A+**. Não marque "Do not show the results on
   the boards": o selo do rodapé abre o último resultado guardado.
7. **Google Transparency Report:**
   `https://transparencyreport.google.com/safe-browsing/search?url=spokke.com.br&hl=pt_BR`. Um
   domínio novo pode aparecer "sem dados" por alguns dias — tudo bem. Se alguma das duas verificações
   mostrar problema, o selo dela sai do rodapé até resolver (`docs/selos-e-seguranca.md` "5b").

### 2.20 Abrir ou não abrir

Divulgue quando todos estes forem verdade:

- [ ] HTTPS com nota A, e `http://` e `www` caindo no endereço certo.
- [ ] O teste de fumaça inteiro passou, inclusive no celular em 4G.
- [ ] Os e-mails chegam na caixa de entrada, não no spam.
- [ ] O backup rodou, o arquivo está em `/srv/spokke/backups` e o automático da Hostinger está ativo.
- [ ] Os preços da página de planos são os reais.
- [ ] De fora, só 22, 80 e 443 respondem.
- [ ] O snapshot foi feito.

## Parte 3 — Rotina

### Atualizar uma versão

Com o código novo no `main` do GitHub (no seu computador: `git checkout main`,
`git merge --no-edit motion`, `git push origin main`, `git checkout motion`):

**No servidor:**

```bash
bash /srv/spokke/spokke-service/deploy/scripts/atualizar.sh
```

Ele baixa o código, guarda a imagem atual como `spokke-service:anterior`, constrói a nova, aplica as
migrations e recria o worker e depois o web, esperando o web ficar saudável. O banco, o MinIO, o
áudio e o Caddy não são tocados. **Deve aparecer:** `web: healthy` e `ok` no fim.

Para o serviço de áudio (quando ele mudar):

```bash
cd /srv/spokke/audiotext-service && git pull --ff-only
docker compose -f docker-compose.yml -f ../spokke-service/deploy/compose/audiotext.yml up -d --build
```

Para o Caddyfile (quando ele mudar, depois do `git pull` no `spokke-service`):

```bash
docker exec spokke-caddy caddy reload --config /etc/caddy/Caddyfile
```

### Mudar uma configuração

Ligar o Google, o GA, a IA, trocar a caixa da equipe — tudo é o `.env` da aplicação:

```bash
nano /srv/spokke/spokke-service/.env
spk up -d --force-recreate --no-deps web worker
```

Não precisa de build: as variáveis entram quando o container é recriado.

### Ver o que está acontecendo

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'   # quem está de pé
spk logs -f --tail 100 web worker                     # a aplicação (Ctrl+C sai)
docker logs -f --tail 100 spokke-caddy                # o HTTPS
docker logs -f --tail 100 audiotext-audiotext-1       # o serviço de áudio
docker stats --no-stream                              # memória e CPU de cada um
df -h /                                               # disco
free -h                                               # memória e swap
```

E no navegador, os jobs que falharam aparecem no `/admin`, com "Tentar de novo".

### Atualizar o sistema

Uma vez por mês:

```bash
sudo apt update && sudo apt -y upgrade
ls /var/run/reboot-required 2>/dev/null && sudo reboot
```

Os containers voltam sozinhos depois do reboot (todos têm `restart: unless-stopped`). Faça um
snapshot antes.

### Backup e restauração

O dump do banco roda sozinho todo dia (passo 2.17) e fica 14 dias no servidor; o backup automático
da Hostinger leva o servidor inteiro, com esses dumps, uma vez por semana (passo 1.13). O dump é só do
banco, o único dado que não se recria: o áudio das atividades é identificado pelo conteúdo e a entrada
do Player o gera de novo, e a voz dos alunos vive 7 dias de propósito.

**Restaurar** (com a aplicação parada, para nada escrever no meio):

```bash
ls -lt /srv/spokke/backups/ | head
spk stop web worker
docker exec -i spokke-postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < /srv/spokke/backups/<arquivo>.dump
spk start worker web
```

**Se a máquina se perdeu:** restaure o backup mais recente da Hostinger pelo painel (página do VPS ›
Backups). Ele sobrescreve o servidor inteiro, então é só para esse caso — para desfazer um erro no
banco, use os dumps acima. O banco volta junto com o disco; se o Postgres não subir limpo (a cópia do
disco pode ter pego uma escrita no meio), restaure o `.dump` mais recente que veio na cópia, com os
comandos acima. O que foi escrito entre esse backup e a perda não volta.

**Uma vez por mês, prove que o backup restaura** — num banco de teste, sem tocar no de verdade:

```bash
docker exec spokke-postgres createdb -U spokke teste_restauracao
docker exec -i spokke-postgres pg_restore -U spokke -d teste_restauracao --no-owner < "$(ls -t /srv/spokke/backups/spokke-*.dump | head -1)"
docker exec spokke-postgres psql -U spokke -d teste_restauracao -tAc 'SELECT count(*) FROM "Teacher";'
docker exec spokke-postgres dropdb -U spokke teste_restauracao
```

**Deve aparecer:** o número de professores cadastrados.

### Voltar a versão anterior

```bash
bash /srv/spokke/spokke-service/deploy/scripts/voltar.sh
```

Volta só a aplicação, para a imagem guardada antes da última atualização. O banco fica como está: se
a versão nova aplicou uma migration que a anterior não entende, o caminho é corrigir para a frente ou
restaurar o backup.

### Se algo der errado

| Sintoma                                          | Causa provável                                         | Conserto                                                                     |
| ------------------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| "Cross-site POST form submissions are forbidden" | `APP_ORIGIN` diferente do endereço aberto              | `APP_ORIGIN="https://spokke.com.br"` e recriar web e worker                  |
| Entrar dá 404 em `/api/auth/...`                 | `BETTER_AUTH_URL` errado                               | o mesmo endereço do `APP_ORIGIN`                                             |
| O Caddy não pega o certificado                   | DNS ainda não aponta, ou a porta 80 fechada            | `dig`, `sudo ufw status`; esperar o DNS — não fique recriando o container    |
| Publicar trava em "gerando áudio"                | worker parado, ou o serviço de áudio fora ou sem token | `docker logs spokke-worker`; o `/health`; `AUDIOTEXT_TOKEN` igual nos dois   |
| O áudio não toca no aluno                        | `STORAGE_PUBLIC_URL` errado, ou o Caddy sem a rota     | abrir no navegador a URL de um áudio; o log do Caddy                         |
| E-mail não sai                                   | `EMAIL_PROVIDER` vazio, ou domínio não verificado      | o log do worker e a aba "Logs" do Resend; `EMAIL_FROM` do domínio verificado |
| E-mail cai no spam                               | DKIM ou SPF faltando                                   | o Resend mostra o status de cada registro; conferir o DMARC                  |
| Todo mundo bate no limite de tentativas          | faltou `ADDRESS_HEADER` / `XFF_DEPTH`                  | conferir o `.env` e recriar o web                                            |
| Google: `redirect_uri_mismatch`                  | URI diferente no cliente OAuth                         | as duas URIs exatas, com `https://spokke.com.br`                             |
| Google: só alguns e-mails conseguem entrar       | o app OAuth ainda está "em teste"                      | publicar o app (passo 1.11, item 5)                                          |
| A gravação de voz dá erro 413                    | `BODY_SIZE_LIMIT` ausente                              | `BODY_SIZE_LIMIT="10M"` no `.env` e recriar o web                            |
| O serviço de áudio reinicia sozinho              | memória                                                | `docker stats`, `free -h`; o tradutor sozinho ocupa ~3 GB                    |
| O disco está enchendo                            | imagens velhas do Docker                               | `docker system df`; `docker image prune -f` (nunca com `--volumes`)          |

Não resolveu? Junte a saída de `docker ps -a`, `docker logs --tail 100 <container>` e `free -h`, e me
chame.

## Parte 4 — Mercado Pago (semana 1)

Abre manual. Liga quando os preços forem os reais e o teste no sandbox passar. Os detalhes do que o
código faz estão em `docs/operacao.md` "Mercado Pago" e em `.claude/rules/billing.md`.

### 4.1 A aplicação e o sandbox

1. Entre no painel de desenvolvedores do Mercado Pago (mercadopago.com.br/developers) com a conta que
   vai receber os pagamentos.
2. **Suas integrações › Criar aplicação:** nome `Spokke`, solução de pagamentos online, produto
   **Assinaturas**.
3. Na aplicação, **Credenciais de teste:** copie o **Access Token** de teste para o gerenciador.
4. **Contas de teste:** crie uma conta de **comprador** (país Brasil). Anote o usuário e a senha dela.
   O Mercado Pago não deixa pagar a si mesmo, por isso o teste é feito com ela.
5. **Webhooks › Configurar notificações**, em **modo de teste:** URL
   `https://spokke.com.br/api/mercadopago`; eventos de **Planos e assinaturas**
   (`subscription_preapproval` e `subscription_authorized_payment`). Salve e copie a **assinatura
   secreta**.

**No servidor**, no `.env`:

| Variável                     | Valor                                 |
| ---------------------------- | ------------------------------------- |
| `BILLING_PROVIDER`           | `mercadopago`                         |
| `MERCADOPAGO_ACCESS_TOKEN`   | o Access Token de **teste**           |
| `MERCADOPAGO_WEBHOOK_SECRET` | a assinatura secreta do modo de teste |

```bash
nano /srv/spokke/spokke-service/.env
spk up -d --force-recreate --no-deps web worker
```

Web E worker: é o worker que processa a notificação do webhook.

### 4.2 O teste

1. Numa aba anônima, crie uma conta de professor de teste no Spokke.
2. Em Planos, assine o Pro. O checkout do Mercado Pago abre: entre com a conta de **comprador de
   teste** e pague com um cartão de teste (a documentação do Mercado Pago lista os números).
3. A volta para o Spokke mostra "confirmando". Em poucos segundos, a aba Assinatura da Conta mostra
   o plano ativo, e o histórico mostra `plano_ativado`.
4. **No servidor:** `spk logs --tail 50 worker` mostra a notificação com o desfecho `ativada`.
5. Na aba Assinatura, "Cancelar no fim do período": o log mostra `cancelada`.
6. Os três pontos que a documentação do Mercado Pago não fecha (billing.md): a notificação de
   assinatura chegou pelo painel de Webhooks? A grafia do cancelamento foi aceita? O corpo da
   notificação veio no formato esperado? Se algum falhar, me chame antes de seguir.

### 4.3 Produção

1. Na aplicação: **Credenciais de produção › Ativar credenciais** (o formulário pede os dados do
   negócio e o site). Copie o Access Token de produção (`APP_USR-...`).
2. **Webhooks**, agora em **modo de produção:** a mesma URL e os mesmos eventos. É **outra
   assinatura secreta**: copie.
3. No `.env`: os dois valores de produção no lugar dos de teste. Recrie web e worker.
4. Uma assinatura de verdade, com o seu cartão, no plano mais barato; confira a ativação e cancele em
   seguida (pelo Spokke e, se precisar, pela sua conta do Mercado Pago).

Lembretes: cancelar pelo `/admin` NÃO cancela no Mercado Pago — só o botão do professor e a própria
conta do pagador fazem isso. E o teste grátis "com cartão" (billing.md "Trial") é outra decisão, que
espera este gateway.

## Parte 5 — Depois do lançamento

- **Intranet.** VPN (Tailscale) no servidor e nas máquinas da equipe; a intranet escutando só no IP
  da VPN, sem DNS público; o banco dela e o papel de leitura no do Spokke
  (`../spokke-intranet/infra/*.sql`, rodados com `docker exec -i spokke-postgres psql`); uma chave
  só de leitura no MinIO para o termômetro do bucket. Ela ainda não tem Dockerfile — eu preparo
  quando formos ligar.
- **CSP.** Pela configuração do SvelteKit (`kit.csp`), que calcula o hash do script de tema do
  `app.html`; liberando o Google Analytics e `midia.spokke.com.br`. Primeiro em modo só-relatório.
- **Mídia no R2.** Mover o DNS do domínio para a Cloudflare; bucket com domínio próprio
  `midia.spokke.com.br`; uma regra do WAF bloqueando `/fala/` (o R2 não tem leitura pública por
  pasta); a regra de 7 dias em `fala/`; copiar o que existe (`rclone copy`); trocar `STORAGE_*` e
  reescrever `MediaAsset.url` (o caminho perde o `/spokke-midia`); tirar o bloco `midia` do Caddyfile
  e desligar o MinIO.
- **Backup fora da Hostinger.** Hoje a cópia que sai da máquina é a semanal da Hostinger, na mesma
  conta do servidor. Um destino externo diário é uma linha: `REMOTO=<destino do rclone>` na frente do
  comando do cron (o script já aceita) e o `rclone` instalado e configurado. O Backblaze B2 dá 10 GB
  grátis e não depende do DNS.
- **DMARC** de `p=none` para `p=quarantine`, depois de umas semanas de relatório limpo.
- **Postgres:** ajustar `shared_buffers` e afins quando houver carga para medir.
- **HSTS preload** (`hstspreload.org`), só depois de meses com tudo em HTTPS — é difícil de desfazer.
- **Segundo admin** em `PLATFORM_ADMIN_IDS`, para a operação não depender de uma pessoa só.
