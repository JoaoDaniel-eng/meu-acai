# Açaí da Roça — guia de marca da interface

## Identidade e ativos existentes

- **Marca:** Açaí da Roça. A assinatura visual fornecida pelo projeto é o emblema ilustrado `public/images/icon-512.png`; o cabeçalho usa a versão PWA em `public/images/icon-192.png` ao lado do nome textual, para manter legibilidade em tamanhos pequenos.
- **Fotos de produto:** usar os arquivos próprios em `public/images/`, em especial `acai-hero-flutuando.webp`, `acai-morango-proibido.webp`, `acai-pecado-de-amendoim.webp`, `acai-doce-tentacao.webp` e `acai-ninho-dourado.webp`. Não substituir por fotos genéricas.
- **Direção da interface:** redesign visual completo da área pública, mantendo a identidade da Roça e a arquitetura funcional existente. O painel `/admin`, `/dev`, APIs, preço, regras de estoque, checkout e persistência permanecem fora do redesign.

## Sistema visual

- **Movimento de design:** editorial gastronômico brasileiro — ingredientes e fotos em primeiro plano, composição assimétrica e tom acolhedor, com acabamento de marca profissional.
- **Paleta:** roxo-açaí `#2A1034` para a assinatura e a confiança; roxo de polpa `#55266B` para ações secundárias; verde-folha `#A7CF55` para escolhas positivas e chamadas principais; creme `#FFF7E8` e papel `#F8F3E9` para conforto e leitura; tinta `#291E2F` e cinza `#766C78` para hierarquia textual. O modo escuro adapta os planos e preserva o contraste.
- **Tipografia:** Sora para títulos de personalidade e DM Sans para texto corrido, formulários e controles. Ambas têm fallback de sistema.
- **Layout:** hero assimétrico e focado no produto; guia de pedido em três passos; galeria de sabores; montador progressivo; resumo e checkout em painel de leitura direta. No celular, navegação compacta, cards com rolagem horizontal e controles com área de toque confortável.
- **Forma e profundidade:** círculos e contornos lembram tigelas, polpa e camadas; raios de 12–22 px para controles e painéis; sombras suaves reservadas a elementos elevados.
- **Movimento:** flutuação lenta da foto principal e selo, microtransições ao selecionar tamanho ou complemento e feedback de foco/hover. `prefers-reduced-motion` desativa animações e transições.

## Voz e jornada

- **Posicionamento:** açaí personalizável da região, para quem quer pedir sem precisar conhecer o processo de antemão.
- **Personalidade:** calorosa, direta e generosa.
- **Exemplos de voz:** “Seu açaí. Do seu jeito.” e “Veja o preço atualizar enquanto escolhe.”
- **Princípio de conversão:** deixar visível que não é obrigatório criar conta, indicar o que é grátis ou pago, mostrar o resumo e esclarecer que o pedido só é confirmado pela loja depois do envio da mensagem no WhatsApp.

## Contratos preservados

As rotas, endpoints, nomes de campos, seletores usados pelos scripts de pedidos, lógica de carrinho, preço, frete, estoque, Pix, pagamento, retirada, agendamento, login, acompanhamento, tema claro/escuro, acessibilidade e consentimento para salvar dados continuam pertencendo às implementações existentes. `public/css/experience.css` só é carregado na página pública e todas as regras ficam sob `body[data-acai-redesign]`.
