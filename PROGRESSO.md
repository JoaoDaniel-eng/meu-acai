# Progresso do projeto — Açaí da Roça

## Estado atual
**Funcionalidades principais implementadas no código; pendente testar integração em ambiente com PostgreSQL configurado e publicar.**

## Implementado
- Frontend público responsivo: cardápio, personalização, carrinho, checkout de delivery, agendamento, avaliações e página de privacidade.
- Backend Express 5 com APIs de loja, cardápio, avaliações, pedidos e painel administrativo.
- Schema PostgreSQL com produtos, tamanhos, opções, bairros, configurações, pedidos, avaliações e administradores.
- Seed idempotente com catálogo inicial e configurações de horário.
- Preços e adicionais recalculados no servidor; validação de quantidades, acompanhamentos, caldas, bairro e horário.
- Pedido registrado no banco antes de abrir WhatsApp com resumo preenchido.
- Login com bcrypt e JWT, limite básico de tentativas de login, gestão de pedidos, status, cardápio/preços, disponibilidade de produtos/tamanhos/opções, bairros, avaliações e funcionamento.
- Atualização automática da lista de pedidos no painel a cada 12 segundos e atalho para pausar/reabrir pedidos imediatos.
- Relatórios de vendas com faturamento, quantidade, ticket médio, evolução diária e tamanhos mais vendidos.
- Cupons com desconto percentual/fixo e subtotal mínimo, validados e calculados no servidor.
- Repetição de pedido pelo acompanhamento público, mantendo apenas os itens que ainda estão disponíveis.
- Promoção automática de combo configurável (quantidade mínima e percentual), com desconto calculado novamente no servidor e aplicado também na edição do pedido.
- Previsão estimada configurável no painel e exibida no checkout, acompanhamento e WhatsApp.
- Programa de fidelidade: 1 ponto por real completo em produtos, creditado uma única vez quando o pedido é marcado como entregue; saldo consultado no acompanhamento autenticado por código + telefone.
- Salvamento opcional dos dados básicos apenas no armazenamento local do aparelho, mediante consentimento.
- PWA com manifest, ícones, botão de instalação e cache da estrutura visual; APIs e pedidos continuam exigindo internet.
- Página inicial refinada, destaque de combo/clube, total com descontos, barra fixa do carrinho no celular e botão de instalação.
- Headers básicos de segurança, README e testes unitários para regras de horário/moeda. O `.env` é local e não é incluído no ZIP; não é criado `.env.example`.

## Validação feita / pendente
- Verificação sintática com `node --check` concluída para os arquivos JavaScript principais.
- `npm test`: 10 testes unitários passaram (regras de horário, timezone e moeda).
- Teste de integração com PostgreSQL real, validação visual em navegadores/dispositivos e conferência do fluxo WhatsApp dependem de ambiente configurado. O PWA precisa ser servido por HTTPS (ou localhost) para instalação.
- Deploy real e domínio personalizado não podem ser concluídos sem acesso às contas Render, Neon e registrador de domínio.

## Pendências comerciais antes de produção
1. Confirmar os bairros atendidos e as taxas reais. As taxas sem confirmação são valores iniciais de exemplo e podem ser editadas no painel.
2. Confirmar o que significa “1 copo” por R$ 35; foi mantido como “1 copo especial”.
3. Confirmar o WhatsApp `5521969081157`.
4. Completar os dados do responsável na política de privacidade.
5. Criar banco Neon, definir variáveis seguras e fazer deploy.


## Etapa de segurança, relatórios e recuperação (01/11/2026)

- [x] Login sem bloqueio por quantidade de tentativas inválidas.
- [x] Sessão administrativa persistente, sem expiração automática; permanece no navegador após fechar e reabrir o navegador/computador, até logout ou troca do JWT_SECRET.
- [x] Auditoria de logins e mutações administrativas, com rota, IP, administrador, horário e status HTTP.
- [x] Confirmação de exclusão permanente de pedidos e produtos no painel.
- [x] Exclusões registradas na auditoria.
- [x] Relatório com indicadores de hoje, semana atual e mês atual; mantém períodos customizáveis de 7, 30 e 90 dias.
- [x] Exportação JSON de pedidos, clientes derivados, cardápio, opções, bairros, configurações, cupons, avaliações e fidelidade.
- [x] Verificação estrutural e restauração transacional do backup JSON. Administradores e auditoria são preservados na restauração.
- [x] Service worker atualizado para nunca armazenar APIs, pedidos, backups ou painel administrativo; cache antigo é invalidado.
- [x] Validação de valores de pedidos no servidor mantida como fonte de verdade.
- [ ] Teste de integração com PostgreSQL real e teste de restauração em banco separado: reservado ao usuário/ambiente de produção.
- [ ] Testes manuais de compra, edição, cancelamento, login, exportação/restauração e PWA: reservados ao usuário.
- [ ] Confirmar backup automático e retenção no provedor PostgreSQL.

**Limitações importantes:** backup JSON manual não substitui snapshot/backup nativo do PostgreSQL. A restauração substitui dados operacionais atuais e deve ser feita somente após baixar um backup recente. Exclusão de pedidos é permanente. A sessão administrativa não expira automaticamente; a proteção depende de senha forte, dispositivo protegido e logout em dispositivos compartilhados.


### Ajustes de conta do cliente (01/11/2026)
- Adicionados os botões “Fazer login” e “Cadastrar” no topo da loja, também acessíveis em telas pequenas.
- O checkout informa claramente que a conta é opcional e o pedido pode ser feito como visitante.
- Cadastro com número de WhatsApp já usado mostra mensagem de erro explícita e orienta o cliente a entrar na conta existente.
