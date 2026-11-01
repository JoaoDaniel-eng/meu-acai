# Açaí da Roça — pedidos online e painel administrativo

Aplicação full-stack para uma loja de açaí, com frontend em HTML/CSS/JavaScript puro, backend Node.js + Express 5 e banco PostgreSQL. O cliente monta o açaí, informa a entrega, registra o pedido no banco e recebe um resumo pré-preenchido no WhatsApp para enviar manualmente. Não há pagamento online.

## Requisitos
- Node.js 20 ou superior
- PostgreSQL (local ou hospedado, por exemplo Neon)
- Conta de hospedagem Node.js (por exemplo Render)

## Executar localmente
1. Instale Node.js 20+ e tenha um banco PostgreSQL criado.
2. Crie um arquivo local chamado `.env` na pasta principal e preencha `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `WHATSAPP_NUMBER`. Não é gerado `.env.example`; mantenha o `.env` fora do ZIP e do repositório.
3. Na pasta do projeto, execute `npm install`.
4. Execute `npm start` (ou `npm run dev` durante o desenvolvimento).
5. Abra `http://localhost:3000`. O painel fica em `http://localhost:3000/admin`.
6. Rode os testes com `npm test`.

O schema e os dados iniciais são criados de forma idempotente quando o servidor inicia e `DATABASE_URL` está configurada. O usuário administrativo inicial é criado se `ADMIN_EMAIL` e `ADMIN_PASSWORD` estiverem definidos antes da primeira inicialização. Se já existir um administrador com o mesmo e-mail, a senha não é sobrescrita automaticamente.

## Deploy no Render + Neon
1. Crie um banco PostgreSQL no Neon e copie a connection string (use SSL).
2. Publique esta pasta em um repositório Git, ou use o método de deploy aceito pelo seu serviço de hospedagem.
3. No Render, crie um Web Service com ambiente Node. Build command: `npm install`. Start command: `npm start`.
4. Cadastre as variáveis `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` e `WHATSAPP_NUMBER` no painel do Render. Não envie `.env` ao repositório.
5. Faça o deploy e confira `/api/health`.
6. Configure o domínio personalizado nas configurações do serviço e siga as instruções de DNS fornecidas pelo Render. Para domínio `.com.br`, o registro e a renovação são feitos pelo registrador escolhido.

## Funcionalidades
- Cardápio e preços carregados do PostgreSQL.
- Personalização de açaí com até cinco acompanhamentos grátis por item e no máximo uma calda grátis por item.
- Adicionais pagos, mousses e quantidade de 1 a 20 por item.
- Cálculo de preço no servidor, inclusive taxa de entrega por bairro.
- Pedido imediato quando a loja está aberta ou agendamento com antecedência mínima dentro do horário de funcionamento.
- Registro do pedido no banco com código único `AR-XXXXXX` e abertura do WhatsApp com texto pré-preenchido.
- Avaliações públicas somente após moderação.
- Painel administrativo com autenticação JWT persistente no navegador (sem expiração automática e sem bloqueio por tentativas inválidas), atualização automática de pedidos, preços e disponibilidade de produtos/tamanhos/opções, bairros/taxas, avaliações, cupons, configurações, auditoria e backup/restauração.
- Relatórios de vendas com resumo de hoje, semana atual e mês atual, além de períodos de 7, 30 e 90 dias, ticket médio, quantidade de pedidos e tamanhos mais vendidos.
- Cupons públicos com desconto percentual ou fixo, subtotal mínimo e validação de preço no servidor.
- Cliente pode repetir um pedido anterior pelo acompanhamento, adicionando novamente ao carrinho apenas itens ainda disponíveis.
- Promoção automática de combo: desconto configurável quando o carrinho atinge a quantidade mínima de açaís.
- Previsão de preparo/entrega configurável no painel e exibida no checkout, acompanhamento e resumo do WhatsApp (é uma estimativa, não rastreamento GPS).
- Programa de fidelidade: 1 ponto por real em produtos, creditado uma única vez quando o pedido é marcado como entregue; o cliente consulta o saldo com código do pedido e telefone.
- Opção de salvar nome, telefone, endereço e bairro apenas no armazenamento local do próprio aparelho, mediante consentimento.
- PWA instalável, com ícone próprio e cache da estrutura visual para abertura básica offline; pedidos e APIs ainda exigem internet.
- Atalho de carrinho fixo em telas pequenas, destaque promocional e identidade visual refinada.
- Página de privacidade, validação no servidor e headers básicos de segurança.

## Atenção: revise antes de operar
- **Taxas e bairros iniciais são exemplos editáveis**, não uma confirmação das taxas comerciais reais. Revise em `/admin` antes de receber pedidos.
- O item “1 copo especial” de R$ 35 foi mantido porque o tamanho/capacidade não foi especificado. Renomeie ou desative em “Cardápio e preços” se necessário.
- Horário inicial: terça a domingo, 13h30–22h; segunda-feira fechada.
- O número inicial do WhatsApp é `5521969081157`; confirme se pertence à loja.
- A política de privacidade contém campos que precisam ser completados com o responsável legal e o contato real.
- O fechamento manual bloqueia pedidos imediatos, mas permite agendamento em horário de funcionamento.
- O cliente pode editar ou cancelar pedidos enquanto ainda estão em etapas permitidas; o WhatsApp abre uma mensagem e o cliente precisa apertar “Enviar”. Não há integração de pagamento online.

## Segurança operacional
- Use uma senha administrativa forte e um `JWT_SECRET` aleatório com 32+ caracteres. A sessão administrativa não expira automaticamente: o token permanece no armazenamento local do navegador mesmo após fechá-lo ou reiniciar o computador, até o usuário clicar em **Sair** ou o `JWT_SECRET` ser trocado. O login não bloqueia o acesso por quantidade de tentativas inválidas. Como o token é persistente, não use o painel em dispositivos compartilhados e proteja o acesso ao computador e ao navegador.
- O painel registra logins e mutações administrativas na aba “Auditoria”, sem gravar o corpo das requisições.
- Exclusões de produtos e pedidos exigem confirmação no painel. Exclusão de pedido é permanente; faça backup antes.
- Preços, adicionais, descontos, cupons e frete são recalculados/validados no servidor; os valores enviados pelo navegador não são usados como fonte de verdade.
- A aba “Backup” exporta JSON com pedidos, clientes derivados dos pedidos, cardápio, bairros, configurações, cupons, avaliações e pontos. Também valida e restaura um arquivo desse formato em transação. A restauração substitui os dados operacionais atuais, preserva administradores e auditoria e deve ser usada com cuidado.
- O backup JSON é manual e deve ser baixado e guardado fora do servidor. Ele não substitui o backup automático do provedor PostgreSQL; habilite/ confira a política de backup do Neon ou do provedor escolhido.
- Proteja os arquivos de backup: eles contêm dados pessoais de clientes. Não os envie a repositórios públicos nem os compartilhe sem necessidade.
- O histórico de auditoria é interno e não é incluído no backup operacional; mantenha também os backups nativos do banco para recuperação completa do ambiente.

## Estrutura
```text
public/
  index.html
  manifest.webmanifest
  service-worker.js
  admin.html
  privacidade.html
  css/styles.css
  js/app.js
  js/admin.js
src/
  server.js
  db/pool.js
  db/init.js
  middleware/auth.js
  routes/public.js
  routes/orders.js
  routes/admin.js
  services/store.js
  services/store.test.js
  services/promotions.js
  services/promotions.test.js
PROGRESSO.md
```


## Conta do cliente

- Clientes podem criar conta e entrar usando celular com DDD e senha (mínimo 8 caracteres). As senhas são armazenadas com hash bcrypt.
- Os pedidos feitos enquanto a pessoa está autenticada ficam associados à conta e aparecem em **Minha conta → Meus pedidos**. O telefone do checkout deve ser igual ao celular cadastrado.
- Pedidos antigos não são vinculados automaticamente, para não expor dados privados só com base no número de telefone.
- A sessão do cliente usa token JWT persistido no navegador por até 30 dias; sair remove o token local. Alterar senha não revoga automaticamente tokens existentes.
- Não há confirmação por SMS nem recuperação de senha nesta versão. Antes de divulgar publicamente, planeje uma forma segura de verificar a posse do celular e recuperar contas.
