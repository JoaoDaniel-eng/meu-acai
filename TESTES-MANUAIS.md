# Roteiro de testes manuais — Açaí da Roça

Execute primeiro em ambiente de teste ou com pedidos de teste. Antes de qualquer teste de exclusão ou restauração, baixe um backup recente.

## 1. Atualização e inicialização

1. Faça uma cópia do banco PostgreSQL atual.
2. Atualize os arquivos do projeto sem substituir seu `.env`.
3. Execute `npm install` e depois `npm start`.
4. Confira no terminal se a inicialização do banco terminou sem erro.
5. Abra `/api/health` e confirme a resposta `status: ok`. Abra também `/api/health/db`: deve responder `status: ok` e `database: ok` (se o banco estiver fora do ar, responde 503).

## 2. Login e segurança

1. Entre no painel `/admin` com as credenciais válidas.
2. Confira a aba **Auditoria** e localize o login.
3. Digite uma senha incorreta 5 vezes seguidas e confirme que as primeiras mensagens apenas informam que e-mail ou senha estão incorretos e que, depois do limite, o painel pede para aguardar alguns minutos (resposta 429). Aguarde o tempo informado, ou teste de outro IP, antes de continuar.
4. Entre com a senha correta e atualize a página; confirme que continua conectado.
5. Feche completamente o navegador, abra-o novamente e acesse `/admin`; confirme que a sessão continua ativa.
6. Reinicie o computador ou teste em outro momento no mesmo navegador e confirme que a sessão permanece (dentro do prazo de 7 dias).
7. Clique em **Sair** e confirme que o painel volta a pedir login.

> A sessão expira em 7 dias (`ADMIN_TOKEN_TTL` muda o prazo). O token fica salvo no armazenamento local do navegador até expirar, até o usuário sair ou até o segredo JWT do servidor ser trocado. Use uma senha forte, mantenha o dispositivo protegido e não compartilhe o acesso administrativo.

## 3. Pedidos e validação de valores

1. Faça um pedido de teste com um tamanho, adicionais, bairro, cupom e forma de pagamento.
2. Confira o total exibido e a mensagem pré-preenchida no WhatsApp.
3. Faça outro pedido com dinheiro e troco; confira o valor do troco.
4. Acompanhe o pedido com código e telefone.
5. Edite tamanho, acompanhamentos, calda, quantidade e endereço enquanto o pedido permitir edição.
6. Cancele um pedido de teste ainda não enviado para entrega.
7. Confirme que pedidos em entrega ou entregues não podem ser editados/cancelados pelo cliente.
8. Em ambiente de teste, tente alterar valores pelo navegador e confirme que o servidor recalcula os preços, descontos e frete.

## 4. Exclusões e auditoria

1. Crie um produto de teste e tente excluí-lo; cancele a primeira confirmação e confira que ele continua cadastrado.
2. Repita e confirme a exclusão do produto de teste.
3. Faça o mesmo com um pedido de teste.
4. Confira na aba **Auditoria** os registros das alterações e exclusões.

> Exclusão de pedido é permanente. Não use pedidos reais para esse teste.

## 5. Relatórios

1. Confira os cartões **Hoje**, **Esta semana** e **Este mês**.
2. Compare faturamento, quantidade de pedidos e ticket médio com os pedidos de teste cadastrados.
3. Confira também os períodos de 7, 30 e 90 dias.
4. Verifique que pedidos cancelados não entram no faturamento.

## 6. Backup e recuperação

1. Abra **Backup** e baixe o arquivo JSON.
2. Confira se o arquivo foi salvo e se contém as tabelas de pedidos, clientes, produtos, opções, bairros, configurações, cupons, avaliações e fidelidade.
3. Selecione o arquivo no campo de restauração e execute a validação.
4. **Restaure somente em um banco de teste separado.** A restauração substitui os dados operacionais existentes.
5. Depois da restauração, confira pedidos, cardápio, bairros, cupons, configurações e pontos.
6. Confira que os administradores continuam podendo entrar e que a auditoria anterior permanece.

Além do JSON manual, confirme no painel do provedor PostgreSQL se os backups/snapshots automáticos estão habilitados e qual é a retenção disponível no plano contratado.

## 7. PWA e dispositivos

1. Publique ou acesse o site por HTTPS.
2. No Android/Chrome, instale pelo menu do navegador; no iPhone/Safari, use **Compartilhar → Adicionar à Tela de Início**.
3. Abra pelo ícone instalado e navegue pela loja.
4. Com a internet desligada, confira que a estrutura pública básica abre, mas que pedidos e acompanhamento informam a necessidade de conexão.
5. Reative a internet e confirme que o painel administrativo continua exigindo login e que dados de API não aparecem em modo offline.
6. Repita em celular e computador, verificando botões, formulários, carrinho e tabelas administrativas.

## Critério de aprovação

Considere o teste aprovado somente quando o fluxo terminar sem erro, os valores estiverem corretos e os dados persistirem no banco. Se algo falhar, anote a etapa, o horário, o navegador/dispositivo e a mensagem exibida — sem enviar senhas, tokens ou o arquivo `.env`.


## Conta de cliente (novo)

- [ ] Criar uma conta com nome, celular com DDD e senha de pelo menos 8 caracteres.
- [ ] Tentar criar outra conta com o mesmo celular e confirmar que o sistema recusa.
- [ ] Sair e entrar novamente com celular e senha corretos.
- [ ] Confirmar que senha incorreta não permite entrar.
- [ ] Fazer um pedido enquanto conectado, usando o mesmo celular da conta; confirmar que aparece em **Minha conta → Meus pedidos**.
- [ ] Tentar finalizar um pedido com outro telefone enquanto conectado; confirmar que o servidor recusa.
- [ ] Abrir o histórico e usar “Acompanhar pedido”.
- [ ] Atualizar o nome e alterar a senha.
- [ ] Fazer pedido como visitante e confirmar que ele não aparece no histórico da conta.
- [ ] Confirmar que pedidos antigos não aparecem automaticamente na conta nova.
- [ ] Testar em celular e computador, com banco PostgreSQL configurado.


## Conta opcional e acesso no topo
- [ ] Confirmar que “Fazer login” e “Cadastrar” aparecem no topo em computador e celular.
- [ ] Clicar em “Fazer login” e conferir que a seção/campo de login fica acessível.
- [ ] Clicar em “Cadastrar” e conferir que o formulário de cadastro fica acessível.
- [ ] Fazer um pedido sem criar conta e confirmar que o checkout não exige login.
- [ ] Tentar cadastrar um celular já usado e conferir a mensagem vermelha orientando a entrar na conta existente.

## Menu lateral e configurações
- [ ] Clicar em ☰ (antes do nome Açaí da Roça) abre o menu; clicar no ☰ de novo, fora do menu ou em Esc fecha.
- [ ] Deslogado: aparecem "Fazer login" e "Cadastrar" no topo; menu mostra Fazer login, Criar conta, Acompanhar pedido e Configurações.
- [ ] Logado: botões somem, aparece "Olá, Nome! 👋"; menu mostra Minha conta, Meus pedidos, Configurações, Sair da conta.
- [ ] Sair da conta: botões de login/cadastro voltam.
- [ ] Aparência: Claro, Escuro e Automático; fechar e reabrir o site mantém a escolha.
- [ ] Conta: trocar nome; trocar telefone exige senha atual e recusa número já usado.
- [ ] Segurança: alterar senha. Privacidade: abre a política.
- [ ] Acessibilidade: Normal/Grande/Muito grande, salvo ao reabrir.
- [ ] Preferências: salvar dados de entrega e ver no checkout; "Apagar dados salvos".
- [ ] Notificações: ativar pede permissão; aviso quando o status de um pedido mudar (site aberto).
- [ ] Aplicativo: botão de instalar / instruções do iPhone.
- [ ] Conferir celular (≤ 620px) e computador; pedido como visitante, painel /admin e pagamento seguem iguais.

## Novidades: pontos, favoritos, senha, ao vivo, carrinho, aviso, admin
- [ ] Logado: o menu ☰ e "Minha conta" mostram os pontos do Clube da Roça; marcar um pedido como Entregue no admin e ver o saldo subir em até 30 s.
- [ ] Logado: "Salvar este açaí como favorito" salva; em Minha conta → Meus favoritos, "Adicionar ao pedido" põe no carrinho e "Remover" apaga. Visitante não vê o botão.
- [ ] Admin → Clientes: buscar cliente, "Redefinir senha", copiar/enviar a senha temporária. O cliente entra com ela e é levado a criar nova senha (Configurações → Segurança).
- [ ] Tela de login: "Esqueci minha senha" abre o WhatsApp da loja com mensagem pronta.
- [ ] Acompanhar pedido: mudar o status no admin e ver a tela do cliente atualizar sozinha em até 20 s, sem perder edições em andamento.
- [ ] Carrinho: adicionar itens, recarregar a página (F5) e conferir que continuam lá; após finalizar o pedido o carrinho salvo some.
- [ ] Faixa no topo: aberto = verde com horário; fechado = lilás com "abrimos…" e botão "Agendar meu pedido" que já marca "Agendar para depois".
- [ ] Admin: som e título piscando quando entra pedido novo (clicar uma vez na página para liberar o som); botão 🔔 liga/desliga.
- [ ] Admin → Relatórios: horários de pico, dias da semana e complementos mais pedidos.
- [ ] Admin: botão de tema (automático/claro/escuro) e leitura de tabelas, abas e formulários no modo escuro.
- [ ] Celulares pequenos (320–360 px): cabeçalho, menu ☰, configurações, faixa da loja e checkout sem rolagem lateral.


## Estoque (revisão 01/11/2026)
- [ ] Tema escuro: abrir cada diálogo (compra, corrigir saldo, retirar, consumo, editar, excluir) e conferir que tudo é legível.
- [ ] Compra com valor quebrado (ex.: 2 kg por R$ 45,50): saldo soma, gasto em compras sobe, histórico mostra "+2 kg".
- [ ] Corrigir saldo para menos e para mais: histórico mostra "de X para Y".
- [ ] Retirar mais que o saldo: erro dentro do diálogo, nada muda.
- [ ] Editar: trocar kg para g converte o saldo; trocar para un. é recusado.
- [ ] Excluir produto ligado a um acompanhamento: o acompanhamento volta a aparecer no site. Reiniciar o servidor e confirmar que o produto não reaparece.
- [ ] Celular (390 px): botões de cada produto visíveis sem rolar para o lado.
- [ ] Backup → restaurar em banco separado: produtos de estoque mantêm consumo/medidor e o histórico de movimentações volta.

## Rodada 2
1. Pedido com Pix: a mensagem do WhatsApp traz o aviso do comprovante; edite o pedido e confira o aviso na mensagem de edição. Pedido em dinheiro não traz o aviso.
2. Abra `/robots.txt` e `/sitemap.xml` (endereços corretos?). Veja o código-fonte da home: canonical e og:url com o endereço certo (defina `SITE_URL`). Teste o link no “Rich Results Test” do Google.
3. Backup: baixe, restaure em um banco de teste e confira contas de clientes (login com a senha antiga), favoritos e “Meus pedidos”.
4. Fotos: com `CLOUDINARY_URL`, envie avaliação com foto, aprove, veja na home; exclua e confira que sumiu do Cloudinary. Depois use “Mover fotos para o armazenamento” e confira as antigas.
5. Instagram: links do cabeçalho e do rodapé abrem `instagram.com/darocacai`.

## Monitoramento e nova versão
- [ ] `/api/version` responde `{ "build": "..." }`. No código-fonte de `/` e de `/admin`, `<meta name="build">` traz o mesmo valor e os `?v=` dos scripts também.
- [ ] `/service-worker.js` abre e o nome do cache (`acai-da-roca-v...`) usa esse valor.
- [ ] Com a loja aberta, no console do navegador digite `setTimeout(()=>{throw new Error('teste')})`; em até alguns segundos o erro aparece em Painel → Erros e o aviso vermelho surge no topo. Use "Limpar lista" depois.
- [ ] Desligue o banco ou force um erro 500: a falha aparece na aba Erros com origem "Servidor".
- [ ] Faça um deploy novo com a loja aberta num celular: aparece "Nova versão disponível"; "Atualizar agora" recarrega e o carrinho continua.
- [ ] Deixe a loja em segundo plano, faça outro deploy e volte: a tela atualiza sozinha uma vez.
- [ ] Loja aberta, sem pedidos há mais de 3 h (ou defina `ALERT_NO_ORDERS_HOURS=0.01` num teste): o painel mostra o aviso amarelo. Fechada ou pausada: não mostra.
- [ ] UptimeRobot: crie o monitor em `/api/health/db`, pause o serviço no Render e confirme que chega o aviso.

## Histórico de pedidos
- [ ] Com mais de 50 pedidos de teste, a aba Pedidos mostra 50 e "Carregar mais" traz os seguintes; a lista segue atualizando sozinha sem voltar ao início.
- [ ] Buscar pelo código (ex.: AR-123456), por parte do nome, por telefone com e sem parênteses/traço e por bairro.
- [ ] Filtrar por datas: pedido feito às 23h30 do dia 30 aparece no dia 30 (fuso de São Paulo), não no dia 31.
- [ ] Combinar status + busca + datas; "Limpar filtros" volta à lista completa.
- [ ] Baixar planilha: abrir no Excel (acentos corretos, colunas separadas, totais em reais) e conferir que respeita os filtros.
- [ ] Nome de cliente começando com `=` ou `+` aparece como texto na planilha, sem virar fórmula.
