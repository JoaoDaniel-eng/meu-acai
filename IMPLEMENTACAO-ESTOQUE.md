# Controle de estoque simples — Açaí da Roça

## Como administrar
1. Em **Administração → Estoque**, cadastre o nome do produto, quantidade, unidade, consumo por açaí (opcional) e valor gasto na compra. Nomes repetidos são recusados.
2. Cada produto aparece em um cartão com saldo, medidor e status: estoque bom, está acabando (20% ou menos da quantidade cheia, ou saldo igual/abaixo do alerta configurado) ou esgotado. Há busca por nome e filtro por situação.
3. **Adicionar compra** soma ao saldo, registra o valor pago e, opcionalmente, o fornecedor.
4. **Corrigir saldo** informa a quantidade física atual. A diferença vai para o histórico como conferência ("de X para Y"), sem contar como compra.
5. **Retirar / perda** baixa uso fora dos pedidos, desperdício ou vencimento, com observação opcional.
6. **Consumo** ajusta quanto do produto é usado em cada açaí. Informe `0` para desativar a baixa automática.
7. **Consumo por tamanho** é para produtos cuja quantidade varia conforme o tamanho do açaí (ex.: açaí em litros com 300 ml, 400 ml, 500 ml, 700 ml e 1 L). Cada tamanho ativo do cardápio ganha um campo; em branco ou 0 significa que aquele tamanho não desconta nada. Ao salvar, o consumo fixo do produto deixa de valer; ao salvar um novo consumo fixo (maior que zero), o consumo por tamanho é removido.
8. **Editar** muda nome, unidade, alerta mínimo e a quantidade cheia (100% do medidor). Trocar kg↔g ou L↔ml converte o saldo automaticamente e registra um ajuste.
9. **Excluir** abre uma confirmação própria. A exclusão é lógica: o histórico é preservado e o acompanhamento do cardápio volta a ficar disponível.

## Unidades e conversão
- Estoque pode ser cadastrado em kg, g, unidades, litros ou ml.
- Consumo aceita g, ml ou unidades.
- Conversões compatíveis são feitas no servidor (ex.: 20 g de consumo equivalem a 0,020 kg no estoque).

## Regra de baixa automática
- Produto com **consumo por tamanho**: a baixa usa a quantidade do tamanho escolhido em cada item do pedido, multiplicada pela quantidade de copos. Tamanho sem quantidade informada não desconta.
- Ao trocar a unidade do estoque (kg↔g, L↔ml), as quantidades por tamanho são convertidas junto com o saldo.
- O estoque não é descontado ao adicionar ao carrinho nem ao criar o pedido.
- A baixa acontece quando o pedido muda para **Preparando**.
- Se o nome do produto de estoque corresponder exatamente ao nome de um acompanhamento do cardápio, o consumo ocorre somente quando esse acompanhamento foi selecionado no pedido.
- Se não existir acompanhamento com o mesmo nome, o consumo configurado é aplicado por cada açaí no pedido.
- A operação ocorre em transação e usa chave idempotente por pedido/produto para evitar baixa duplicada.
- Ao cancelar um pedido que já teve baixa, a quantidade é devolvida e a movimentação de devolução fica registrada. Cancelar antes de iniciar a produção não altera o estoque.

## Banco e compatibilidade
A inicialização adiciona colunas `capacity_quantity`, `purchase_total`, `consumption_quantity` e `consumption_unit` à tabela `inventory_items`, sem apagar itens ou movimentos. Itens antigos com nome igual ao de uma opção do cardápio recebem vínculo automático quando disponível. O projeto continua usando `DATABASE_URL`/PostgreSQL existente e mantém compatibilidade com Render.

## Antes de produção
Publicar primeiro em ambiente de homologação com Neon e testar cadastro, conversões, ajuste de saldo, pedido com e sem acompanhamento, pedidos simultâneos e cancelamento após a baixa. Os testes locais automatizados não substituem esse teste integrado.

## Estoque x venda no site
- Produtos com **consumo por tamanho** (ex.: açaí) também controlam a venda: se o saldo não cobre nem um copo de determinado tamanho, o cardápio mostra esse tamanho como **Esgotado** e ele não pode ser escolhido.
- Ao registrar um pedido, o servidor soma todos os copos e recusa (erro 409, mensagem clara) quando o saldo não cobre o pedido inteiro. Isso vale só para ingredientes com consumo por tamanho; consumo fixo (ex.: leite em pó) não bloqueia a venda.
- Pedidos ainda não iniciados (Novo) **não reservam** estoque: a baixa continua acontecendo em Preparando. Vários pedidos novos ao mesmo tempo podem passar da quantidade; nesse caso o aviso "Estoque insuficiente" aparece ao iniciar a produção.
- A edição de um pedido pelo cliente não refaz essa conferência.

## Estoque por unidade dos trufados
Para produtos prontos e contados em unidades (ex.: trufado de Ninho com Morango 400 ml: 10 unidades; 500 ml: 5 unidades), cada **tamanho** tem o campo `product_sizes.stock_quantity`.

**Como a dona usa:** em **Administração → Cardápio → Tamanhos**, cada tamanho de trufado tem o campo **Em estoque (un.)**. Digite quantas unidades estão prontas e clique em **Salvar**. O número digitado é o que está disponível para venda agora (substitui o saldo anterior). Em branco = sem controle (vende sem limite, como antes). Só o campo alterado é enviado: salvar apenas o preço não mexe no estoque.

**Regras:**
- A baixa é **na hora do pedido** (não em "Preparando"), porque são unidades físicas limitadas: o saldo cai assim que o cliente conclui o pedido. A conferência é atômica no banco: se dois clientes disputam a última unidade, só um leva e o outro recebe a mensagem "acabou" (409).
- O cliente não consegue colocar no carrinho mais do que existe, e o servidor confere de novo ao registrar o pedido.
- Com **3 ou menos** unidades, o cardápio mostra **"Os 3 últimos!"** no tamanho (2 → "Os 2 últimos!", 1 → "Último!") e "🔥 Últimas unidades!" no card do sabor. Com 0, o tamanho aparece como **Esgotado** e não pode ser escolhido; se todos os tamanhos do sabor acabam, o card mostra **Esgotado**.
- Cancelar o pedido (cliente ou painel) **devolve** as unidades. Editar o pedido (cliente) ajusta a diferença. Apagar no painel um pedido ainda não entregue também devolve. Reativar um pedido cancelado reserva de novo (e recusa se não houver mais unidades).
- O que cada pedido reservou fica em `orders.unit_stock` (ex.: `{"12": 2}`), para devolver exatamente o que saiu, mesmo se a dona mudar o estoque no meio do caminho.
- Independe do estoque de ingredientes (açaí, leite em pó etc.): os dois controles podem coexistir.

**Banco:** a inicialização adiciona `product_sizes.stock_quantity` (NULL = sem controle) e `orders.unit_stock` (padrão `{}`), sem apagar nada. Backup e restauração incluem as duas colunas. Código: `src/services/unitStock.js`.
