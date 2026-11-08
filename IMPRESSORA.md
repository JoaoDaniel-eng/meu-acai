# Impressora térmica (POS-5890, 58 mm) no notebook da loja

O painel `/admin` imprime o cupom do pedido pelo navegador. Para sair sozinho, sem janela de confirmação, o Chrome precisa abrir com a opção `--kiosk-printing`.

## Montagem (Windows)
1. Ligue a impressora no notebook pelo cabo USB e ligue-a. Instale o **driver** dela (o anúncio não traz o driver: peça ao vendedor ou procure "driver POS-58 / POS-5890"). Ela precisa aparecer em *Configurações → Impressoras e scanners*. O driver "Genérico / Somente texto" não serve, porque o navegador imprime em modo gráfico.
2. Nas propriedades da impressora, escolha o papel de **58 mm** e deixe-a como **impressora padrão**. O cupom usa página de **48 mm** e um container de **44 mm** centralizado. Se ainda cortar, mude `--cupom-largura` (42 a 46 mm) no topo de `public/css/receipt.css`.
3. Feche todas as janelas do Chrome. Crie um atalho do Chrome na área de trabalho, clique nele com o botão direito → Propriedades → no campo **Destino**, deixe assim (o caminho pode variar):
   `"C:\Program Files\Google\Chrome\Application\chrome.exe" --kiosk-printing "https://meu-acai.onrender.com/admin"`
4. Abra o Chrome **sempre por esse atalho**. Entre no `/admin`, vá em **Pedidos**, clique em **🖨️ Testar impressora** (deve sair um cupom de teste) e marque **"Imprimir pedido novo automaticamente"**.

## Uso no dia a dia
- Deixe o notebook na tomada, com o Chrome aberto e a janela **visível** (não minimizada). Em Configurações → Sistema → Energia, coloque para nunca suspender enquanto estiver na tomada.
- Clique uma vez na página depois de abrir, para o navegador liberar o som de novo pedido.
- Cada pedido novo imprime sozinho. Qualquer pedido pode ser impresso de novo com o botão **🖨️ Imprimir** na linha dele.
- Cada pedido sai em **2 vias** na mesma impressão: **VIA DO CLIENTE** e **VIA DA VENDEDORA**, cada uma numa página (a impressora corta entre elas). Para imprimir só 1 via, desmarque **"Imprimir 2 vias"** em Pedidos.
- As opções de imprimir sozinho e de 2 vias ficam guardadas só nesse aparelho (cada computador liga a sua).

## Se as 2 vias saírem coladas
O corte entre as vias depende do driver da impressora (a página nova faz a impressora avançar e cortar). Se sair tudo numa tira só, avise: dá para trocar por duas impressões seguidas.

## Limites
- Só imprime pedidos que chegam **com o painel aberto**. Pedido que entrou com o notebook desligado ou suspenso não sai sozinho: use o botão "Imprimir".
- O painel confere pedidos novos a cada ~12 segundos, então pode haver um pequeno atraso.
- Pedido que o cliente edita depois não é impresso de novo automaticamente.
- Sem o `--kiosk-printing`, o Chrome abre a janela de impressão a cada pedido.
