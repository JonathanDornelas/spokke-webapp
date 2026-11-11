## acesso

No celular o cartão ocupa a largura toda e o campo tem 56px de altura, para o teclado do sistema não cobrir o botão.

## design-system

Herdado do CLAUDE.md
Nenhuma regra de língua fora do LanguageProfile. O tema não tem exceção por idioma: só dir e fonte de conteúdo.

          Orçamento do Player
          Ícones inline, sem fonte de ícone, sem biblioteca de animação. A única dependência aceita até aqui é svelte-dnd-action, e só por causa do teclado.


          Em aberto
          Marca: “Spokke”, com logotipo vetorizado (src/lib/marca.ts). Falta definir o estado de espera de ASR e TTS enquanto o provedor não está decidido.

## institucional

Formulário e canais diretos lado a lado, porque metade dos contatos é um e-mail que a pessoa já sabe para quem mandar. O consentimento fica junto do botão, não escondido no rodapé.

## player-entrada

No celular a capa ocupa a tela inteira e a ação fica fixa no rodapé, longe do teclado do sistema.

## player-questao

Uma coluna, alvo de toque de 48px, ação principal fixa no rodapé. Sem atalhos de teclado e sem autoplay.

## player-resultado

Caminho sem feedback: o professor desligou o resultado ao publicar. Nenhum veredito aparece — nem por cor, nem por contagem. Só a confirmação de que as respostas chegaram.

## studio-atividades

Com zero atividades a rota renderiza o onboarding, não uma lista vazia. O chrome continua completo — barra lateral, barra superior e rodapé — porque o professor já está logado.

## studio-editor-item

No celular o professor alterna entre editar e prever em vez de ver os dois. O gabarito mantém a moldura âmbar, os toggles têm 40px de alvo, e a navegação entre itens desce para o rodapé.

## studio-publicar

No celular a coluna de contexto desce para baixo do formulário, na mesma ordem de leitura. O aviso de versão continua sendo o primeiro cartão depois das opções.

## studio-resultados

No celular a barra lateral sai e os cartões viram a tela inteira. A fila de correção continua sendo o primeiro bloco.

## studio-wizard

No celular o painel explicativo desce para depois dos campos. Ele responde uma dúvida, não bloqueia o preenchimento.
