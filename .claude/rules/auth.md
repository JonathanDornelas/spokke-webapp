---
paths:
  - 'src/hooks.server.ts'
  - 'src/lib/server/auth/**'
  - 'src/lib/server/db/**'
  - 'src/routes/(studio)/**'
  - 'src/routes/(admin)/**'
  - 'src/lib/server/escola/**'
---

# Autenticação e isolamento

Better Auth com adapter Prisma. Não escreva sessão, hash de senha, reset ou verificação de
e-mail à mão — é exatamente o tipo de código onde um erro sutil vira incidente.

## Onde a guarda mora

A sessão é resolvida no `handle` de `hooks.server.ts` e colocada em `event.locals.user`.
Todo request passa por ali: página, form, remote function, endpoint.

**Nunca coloque guarda de autorização em `+layout.server.ts`.** É o erro clássico do SvelteKit e
parece funcionar em desenvolvimento. Layout não é barreira: uma rota filha pode ser requisitada
diretamente, um `+server.ts` não passa pelo layout, e load de layout não re-executa a cada
navegação. Você acha que protegeu uma árvore inteira e protegeu só a renderização inicial.

A guarda vai no `hooks.server.ts`, por padrão de path, e em cada remote function.
Não nos dois lugares esperando que um cubra o outro.

```ts
// $lib/server/auth/guard.ts
export function requireTeacher(locals: App.Locals): Teacher {
	if (!locals.user) error(401);
	return locals.user;
}
```

## Isolamento entre professores

É aqui que vazamento em SaaS acontece de verdade: um `findUnique({ where: { id } })` sem
`teacherId` no filtro, e o professor A lê a atividade do professor B.

**Nunca exponha o `PrismaClient` cru numa remote function.** Toda leitura e escrita passa por um
repositório em `$lib/server/db/` que exige o professor e injeta o escopo:

```ts
// certo
const atividade = await repo.atividades(teacher).byId(id);

// errado — não faça isso, nem "só dessa vez"
const atividade = await prisma.activity.findUnique({ where: { id } });
```

O repositório retorna `null` quando o registro existe mas pertence a outro professor. Não
distinga "não existe" de "não é seu" na resposta — isso vaza a existência do recurso.

## As duas leituras ENTRE professores — e só elas

Fora destas duas, nenhuma query cruza `teacherId`. As duas têm guard próprio, escopo MARCADO no tipo
(o repositório só aceita o escopo que o guard produz) e respondem **404**, não 403 — a área não existe
para quem não a acessa, e um 403 confirmaria que ela está ali.

**Painel interno (`/admin`)** — quem opera a plataforma (`docs/operacao.md`).

- `requirePlatformAdmin(locals)` → `AdminScope`. A lista é `PLATFORM_ADMIN_IDS`: **ids de `Teacher`,
  nunca e-mails** — o cadastro não verifica e-mail, e uma lista de endereços daria o painel a quem se
  cadastrasse primeiro com o e-mail do dono.
- `hooks.server.ts` devolve 404 em `/admin` ANTES do redirecionamento de login. É defesa em
  profundidade: remote function não passa pelo hook (a rota dela é `/_app/remote/...`), então toda
  função de `admin.remote.ts` abre com o guard.
- `repos/admin.ts` expõe conta, cobrança, contagens e auditoria. **Nunca dado de aluno** nem conteúdo
  de atividade (`admin.test.ts` confere).

**Coordenação da escola (`/escola`)** — `docs/adr-005-escola.md`.

- `requireCoordenacao(locals)` → `CoordenacaoScope` (membro com papel `coordenacao` de escola
  `ativa`). `ehCoordenacao` só decide se a TELA mostra a entrada; não é barreira.
- `repos/escola.ts` lê **só números**: por professor, uso contra limite; por turma, contagem de
  alunos, envios, tentativas terminadas, acerto médio. **Nenhum nome de aluno, nenhuma resposta** —
  decisão do dono do repositório, e acesso de terceiro a dado de aluno é exatamente o que a seção de
  LGPD abaixo protege. Ex-membro some da visão.
- Aceitar convite de escola é dar à coordenação essa visão: é um BOTÃO, com o que muda escrito antes,
  nunca efeito de abrir o link. O token (192 bits) é a prova de controle do e-mail.

## Serialização

Nunca devolva a entidade do usuário inteira para o browser. Hash de senha, tokens, identificador
de cliente do gateway de pagamento — nada disso atravessa. DTO explícito, sempre.

## Senha — trocar e recuperar

Tudo pelo Better Auth, nas DUAS instâncias; nada de hash ou token escrito à mão.

- **Trocar** (cartão "Senha" da conta do professor): `changePassword` com a senha ATUAL — a sessão
  sozinha não basta, senão um navegador esquecido aberto trocaria a senha de alguém — e
  `revokeOtherSessions: true`: os outros aparelhos saem, este continua. Senha atual errada volta
  `INVALID_PASSWORD` e a tela diz "A senha atual não confere".
- **Esqueci a senha** é UMA tela com o seletor professor/aluno, como entrar (`?como=aluno`
  pré-seleciona). O pedido vai para a instância certa, com `redirectTo` em `/redefinir-senha` —
  `?como=aluno` junto, porque o token é da instância do aluno e a tela de nova senha precisa saber
  para quem mandar. A resposta é NEUTRA ("se esse e-mail existir") nos dois casos.
- **O link vai por e-mail, pela fila** (`server/auth/senha.ts` → job `redefinir-senha` →
  `email/redefinir-senha.ts`). O Better Auth só chama `sendResetPassword` para e-mail que EXISTE, e
  a tela não pode mostrar falha (vazaria quem tem conta) — então provedor fora do ar tem de virar
  retentativa, não erro. Vale 1 hora (`VALIDADE_DO_LINK_S`, o mesmo número em
  `resetPasswordTokenExpiresIn`, no e-mail e no job, que não manda link vencido). Em dev o link
  também sai no console do servidor; em produção nunca — link de redefinição no log é senha no log.
- Redefinir não abre sessão: a tela leva ao entrar (no modo certo) com "Senha nova salva".

## Superfície pública

O Player é anônimo por design e nenhuma biblioteca de auth ajuda ali. Ver `.claude/rules/server.md`
para as regras da fronteira do aluno.

## A conta do aluno — opcional, e separada

Existe desde a decisão do dono do repositório de permitir que o aluno guarde o histórico dele.
**Não muda o produto**: continua sendo "abre o link, digita o nome e responde". Nenhuma atividade
exige login, nenhuma tela pede conta antes de deixar responder, e o campo de nome nunca some.
Conta é para reencontrar o histórico em outro aparelho — nada mais.

**Duas instâncias de Better Auth, não um campo `role`.** `server/auth/index.ts` é o professor
(`Teacher`); `server/auth/aluno.ts` é o aluno (`StudentAccount`, `StudentSession`,
`StudentCredential`, `StudentVerification`), com `basePath: '/api/auth-aluno'` e
`cookiePrefix: 'spokke-aluno'`. O professor tem assinatura, atividades e turmas pendurados nele:
misturar os dois na mesma tabela faria toda query de professor precisar de um filtro a mais, e o
dia em que alguém esquecesse esse filtro seria incidente. Aqui as duas identidades não têm como
se confundir — cookies, tabelas e guards diferentes.

- `locals.user` é o professor, `locals.aluno` é o aluno. **Uma nunca preenche a outra.**
- **A tela de entrar (e a de criar conta) é UMA, com um seletor professor/aluno no topo**
  (`(auth)/entrar`, `(auth)/cadastro`; `?como=aluno` pré-seleciona). O seletor troca o cliente
  (`authClient` / `authAlunoClient`), a copy e o destino — nunca mistura as sessões. Quem chega
  em "/entrar" não quer saber que são duas contas; quer dizer quem é e entrar. `aluno/entrar`
  ficou só como redirecionamento, para link antigo não quebrar.
- `requireTeacher` e `requireAluno` são guards distintos. Usar o errado dá a um aluno acesso de
  professor — não existe "guard genérico" aqui.
- No `hooks.server.ts` o handler de `/api/auth-aluno` vem ANTES do outro: `/api/auth-aluno`
  também casa com `/api/auth`, e o handler do professor engoliria a rota.

**`baseURL` e `trustedOrigins` são `server/auth/base-url.ts`, e em DEV não vêm do `.env`.**
`svelteKitHandler` decide se a requisição é dele comparando a ORIGEM dela com a de `baseURL`
(`isAuthPath`); a origem que não bate cai no SvelteKit, que não tem rota `/api/auth/*` e responde
**404**. E o CSRF compara o header `Origin` com `trustedOrigins`, o que dá **403**. Em dev a porta
é a que o Vite conseguir — com a 5173 ocupada ele sobe na 5174 e o login inteiro morre com um 404
que não explica nada (o `curl` ainda passa: ele não manda `Origin`). Por isso as duas seguem a
origem do request em dev, e ficam fixas em produção, onde o endereço é conhecido e entra nos
links de e-mail. Detalhe que morde: o `request` de `trustedOrigins` é OPCIONAL na assinatura da
biblioteca — declarar obrigatório não dá erro na linha, faz o objeto de opções perder a tipagem
contextual e os campos extras do professor somem de `$Infer.Session`.

**Como a chamada encontra a conta: pelo TOKEN do convite, nunca pelo e-mail.** Abrir `/e/<token>`
logado liga a `Student` à `StudentAccount` (`vincularFichaAConta`). O token foi enviado para
aquele endereço e é imprevisível, então prova controle do e-mail. Casar o e-mail que o professor
digitou com o de um cadastro seria mais cômodo e é exatamente o que NÃO dá para fazer: ninguém
verifica e-mail no cadastro (não há provedor), e um colega que soubesse o endereço herdaria a
chamada e o histórico do outro. O vínculo nunca rouba: ficha já ligada a outra conta fica como
está.

**O CONVITE DE CONTA é o segundo caminho, e é o do módulo.** Módulo libera no MAPA, e o mapa é da
conta — então o professor precisa de um jeito de chamar o aluno para ela sem mandar uma atividade.
`Student.accountInviteToken` (192 bits, `repos/convites-de-conta.ts`) é o link
`/aluno/convite/<token>`, e chega de dois jeitos, à escolha do professor: o Spokke manda por
e-mail (job `convite-conta`), ou ele copia e manda por onde a turma conversa. Sem sessão, a página
leva às telas de sempre (`/cadastro` e `/entrar` com `como=aluno` e `voltar`); com sessão, ela
diz QUAL conta está aberta e **ligar é um botão** (`entrarNaTurmaPeloConvite`, `requireAluno`,
token no corpo e id da sessão) — nunca efeito de abrir o link: o aparelho pode estar com a conta de
outra pessoa, e ligar dá ao professor o que ela responder logada. "Gerar outro link" troca o token
(o antigo para de abrir), e trocar o e-mail de quem JÁ recebeu o convite por e-mail também — o
endereço errado recebeu a chave. O e-mail tem teto por professor (120 por hora, na memória):
cada um é cota do provedor.

**Entrar não pode custar o passado.** Ao logar, `adotarMinhasTentativas` passa para a conta o que
aquele APARELHO respondeu sem conta (escopo: o `anonId` do cookie `httpOnly`). É a mesma promessa
do `claimAttempts` do convite, pelo mesmo motivo: criar a conta logo depois de responder parecia
apagar o que a pessoa acabou de fazer.

**A ficha e a conta se encontram nos dois sentidos.** Ligar a ficha (`vincularFichaAConta`) também
passa para ela o que a conta já respondeu LOGADA em atividades daquele professor
(`adotarTentativasDaConta`, escopado ao `teacherId` da ficha — uma conta pode estar em turmas de
vários professores, e a tentativa de um nunca vira dado do outro). E quem entra logado pelo link
ABERTO — o QR da sala, outro aparelho — é identificado pela ficha que a conta tem com aquele
professor (`fichaDaConta`, preferindo a turma que recebeu a publicação): sem isso o professor via
um anônimo com o nome da conta, mesmo com o aluno na chamada. Há teste de repositório para as
duas fronteiras (`student-accounts.test.ts`).

**Dado coletado: nome, e-mail e senha. Nada além disso.** Vale a mesma regra da seção abaixo —
campo novo aqui é decisão do dono do repositório.

## Dados do aluno e LGPD

Nome de aluno é dado pessoal, e boa parte do público é menor de idade.

- Colete o mínimo: nome (ou apelido) e um `anonId` em cookie. Nada além disso.
- Defina retenção explícita e aplique por job.
- O professor precisa conseguir apagar tentativas.
- **Nunca adicione coleta de dado novo do aluno sem discutir com o dono do repositório.**

**A GRAVAÇÃO DE VOZ é a única exceção, e ela tem as três garantias.** Foi pedida pelo dono do
repositório, e o desenho é o que a regra acima exige de qualquer coleta nova:

1. **Opt-in explícito, na entrada, antes da primeira questão.** Desmarcado por padrão
   (`Attempt.audioConsent = false`) — consentimento presumido não vale. Sem a marca, o áudio é
   transcrito e descartado na mesma requisição, como sempre foi, e o exercício funciona igual.
2. **Retenção curta e automática: 7 dias**, aplicada pela regra de ciclo de vida do bucket, não
   por um job nosso que pode falhar em silêncio. O áudio de atividade nem prazo tem (é conteúdo
   do professor, dentro do estoque do plano); este é a voz de uma pessoa, e fica o mínimo.
3. **O objeto é privado.** O prefixo `fala/` não tem leitura anônima; quem serve é uma rota do
   Studio com o `teacherId` no `where`. Uma URL pública seria a voz de um aluno acessível a
   quem descobrisse o endereço.

O consentimento vale por TENTATIVA, não pelo aluno: ele autorizou aquela atividade, naquele dia.
Refazer pergunta de novo. Apagar a tentativa leva a linha junto (`onDelete: Cascade`), e o objeto
some no prazo.

**O AVATAR é o segundo campo novo na conta do aluno, e também passou pelo dono do repositório.**
`StudentAccount.avatar` guarda dezoito números (`$lib/avatar/montar.ts`). O que o aprovou, contra
a regra acima: não é dado COLETADO nem observado — é escolha de enfeite, feita pela própria pessoa;
não identifica ninguém (índices de peça de desenho, sem nenhum campo de texto livre onde caiba um
nome); e quem escolhe é a pessoa — a conta NASCE com um sorteado pelo sistema (o hook de cadastro;
nenhum dado vem dela), e trocar é opcional. Quem não tem um gravado é desenhado pelo `avatarPadrao`
do nome (`$lib/avatar/montar.ts`), sem gravar nada.
Não tem prazo de retenção próprio porque não é observação sobre a pessoa: ele morre com a conta.

**Adotar tentativas soltas deixou de ser automático.** Entrar e criar conta não vinculam mais nada
sozinhos: a área do aluno CONTA quantas há neste aparelho e oferece adotar. A suposição de que o
aparelho é de uma pessoa só estava errada mais vezes do que parecia — laboratório, tablet de casa,
irmão — e o efeito era a conta receber respostas de outra pessoa sem ninguém ter dito nada. O
`e/[token]` continua vinculando sozinho, porque ali a identidade vem do professor.
