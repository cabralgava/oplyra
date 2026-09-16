---

name: apple-design
description: Cria, implementa e revisa interfaces digitais inspiradas nos princípios de design da Apple, com foco em clareza, hierarquia, resposta imediata, gestos, animações físicas e interrompíveis, materiais translúcidos, tipografia, acessibilidade e adaptação ao contexto. Use ao construir ou avaliar aplicações web, componentes, dashboards, apps mobile, protótipos, microinterações, sheets, drawers, carrosséis, drag-and-drop e transições que precisam parecer naturais, refinadas e previsíveis.
---

# Apple Design

Use esta skill para transformar requisitos de produto em interfaces claras, responsivas e fisicamente coerentes. O objetivo não é copiar a aparência de um produto Apple, mas aplicar princípios que façam a interface parecer direta, previsível, elegante e viva.

## Resultado esperado

Entregue interfaces que:

* respondam imediatamente às ações;
* mantenham o usuário no controle;
* tenham hierarquia visual evidente;
* usem movimento para explicar relações espaciais;
* possam ser interrompidas e redirecionadas;
* preservem legibilidade e acessibilidade;
* funcionem com mouse, toque, teclado e tecnologias assistivas;
* usem efeitos visuais com moderação e propósito.

## Fluxo de trabalho

1. Identifique a ação principal, o contexto de uso e o estado mais importante da tela.
2. Defina hierarquia, navegação, agrupamentos e caminhos de saída antes dos detalhes visuais.
3. Especifique os estados de interação: repouso, hover, pressionado, arraste, carregamento, sucesso, aviso, erro e desabilitado.
4. Determine quais elementos exigem movimento físico e quais precisam apenas de uma transição discreta.
5. Implemente resposta imediata, continuidade espacial, interrupção e transferência de velocidade.
6. Adicione materiais, profundidade e tipografia somente depois de a estrutura funcionar.
7. Valide responsividade, teclado, contraste, redução de movimento e redução de transparência.
8. Revise a animação em velocidade normal e quadro a quadro.

## Princípios essenciais

### Clareza antes de decoração

* Faça a ação principal ser reconhecida sem explicação.
* Use ordem, espaçamento, contraste e escala para comunicar importância.
* Prefira rótulos específicos: `Imóveis`, `Leads` e `Agenda` são melhores que `Início` ou `Mais` quando descrevem o conteúdo real.
* Mostre primeiro o caminho mais comum; mantenha opções avançadas a um nível de distância.
* Remova elementos que disputem atenção sem ajudar a decisão.

### Resposta imediata

* Mostre feedback no `pointerdown`, não apenas depois do clique.
* Durante arrastes, sliders e redimensionamentos, atualize a interface continuamente e na proporção 1:1.
* Evite atrasos artificiais, bloqueios de interação e sequências que obriguem o usuário a esperar.
* Diferencie feedback de status, conclusão, aviso e erro.

```css
.button {
  touch-action: manipulation;
  transition: transform 100ms ease-out, opacity 100ms ease-out;
}

.button:active {
  transform: scale(0.97);
  opacity: 0.86;
}
```

### Manipulação direta

O elemento deve permanecer ligado ao ponteiro durante o gesto. Preserve o ponto exato onde ele foi agarrado; não reposicione seu centro sob o dedo ou cursor.

* Use Pointer Events para unificar mouse, caneta e toque.
* Use `setPointerCapture()` para não perder o gesto quando o ponteiro sair do elemento.
* Registre posição e tempo das últimas amostras para estimar a velocidade de soltura.
* Aplique um limiar curto, normalmente entre 8 e 12 px, antes de classificar o movimento como arraste.

```js
element.addEventListener('pointerdown', (event) => {
  element.setPointerCapture(event.pointerId);
  const rect = element.getBoundingClientRect();
  const offset = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };

  startDrag({ event, offset });
});
```

### Interrupção é obrigatória

Toda animação ligada a um gesto deve poder ser interrompida, agarrada e revertida sem salto visual.

* Nunca desative a entrada apenas porque uma transição está em andamento.
* Ao redirecionar uma animação, parta do valor visível atual, não do valor lógico de destino.
* Preserve a velocidade existente quando o alvo mudar.
* Prefira springs para componentes manipuláveis.
* Evite `@keyframes` e transições CSS fixas em interações que possam ser agarradas durante o movimento.
* Para movimento bidimensional, controle X e Y separadamente.

### Springs em vez de duração rígida

Use uma spring quando o movimento precisar reagir a novas entradas. Pense em dois controles conceituais:

* **amortecimento:** define quanto o movimento ultrapassa o alvo;
* **resposta:** define a rapidez percebida da aproximação.

Padrão recomendado:

| Situação                            | Comportamento                                |
| ----------------------------------- | -------------------------------------------- |
| Reposicionamento comum              | Sem overshoot, resposta de 0,3 a 0,4 s       |
| Drawer ou bottom sheet após arraste | Pequeno overshoot, resposta próxima de 0,3 s |
| Flick ou lançamento                 | Bounce moderado proporcional ao impulso      |
| Entrada automática de menu          | Sem bounce                                   |

```js
import { animate } from 'motion';

animate(element, { y: 0 }, {
  type: 'spring',
  bounce: 0,
  duration: 0.38,
});
```

Não adicione bounce apenas para tornar a tela “divertida”. O overshoot deve ser consequência de um gesto com energia perceptível.

### Transferência de velocidade

Na soltura, a animação deve continuar na mesma direção e velocidade aproximada do gesto. Uma mudança brusca cria uma quebra visual entre a mão e o objeto.

Quando a biblioteca utilizar velocidade relativa, normalize pela distância restante:

```text
velocidadeRelativa = velocidadeDoGesto / (destino - posiçãoAtual)
```

Se a API aceitar pixels por segundo, envie diretamente a velocidade estimada.

### Projeção de momentum

Escolha o destino com base no ponto projetado do gesto, não somente na posição em que o ponteiro foi solto.

```js
function projectVelocity(velocity, rate = 0.998) {
  return (velocity / 1000) * rate / (1 - rate);
}

const projected = currentPosition + projectVelocity(releaseVelocity);
const destination = nearestSnapPoint(projected);
```

Depois de escolher o destino, anime até ele preservando a velocidade de soltura.

### Limites elásticos

Em vez de interromper o movimento abruptamente na borda, aumente progressivamente a resistência.

```js
function rubberBand(overshoot, size, strength = 0.55) {
  return (overshoot * size * strength) /
    (size + strength * Math.abs(overshoot));
}
```

Use o efeito para comunicar que a interface continua respondendo, embora não exista mais conteúdo naquela direção.

## Movimento e espaço

### Continuidade espacial

* Um elemento deve sair pelo mesmo caminho de onde entrou.
* Menus, popovers e painéis devem parecer nascer do controle que os abriu.
* Defina o `transform-origin` de acordo com o gatilho.
* Preserve direção, escala e profundidade ao reverter uma transição.
* O estado intermediário deve antecipar visualmente o estado final.

### Performance por quadro

* Anime preferencialmente `transform` e `opacity`.
* Use `requestAnimationFrame` para atualizações manuais sincronizadas à tela.
* Evite leituras e escritas de layout intercaladas no mesmo quadro.
* Use `will-change` apenas pouco antes da animação e remova-o depois.
* Teste em dispositivos reais e com o painel de desempenho aberto.

## Materiais e profundidade

Transparência, blur e sombras devem comunicar camadas e função, não servir como enfeite.

* Use materiais translúcidos em barras, sheets e controles flutuantes quando o conteúdo precisar continuar perceptível abaixo deles.
* Superfícies maiores podem ter blur e sombra mais fortes que pequenos chips.
* Use scrim em tarefas modais; não use scrim em painéis paralelos que preservam o fluxo principal.
* Evite empilhar várias superfícies translúcidas claras.
* Aumente o contraste e o peso tipográfico sobre fundos variáveis.
* Anime blur, escala e opacidade em conjunto quando uma superfície “se materializar”.

```css
.floating-toolbar {
  background: rgb(255 255 255 / 0.68);
  border: 1px solid rgb(255 255 255 / 0.48);
  box-shadow: 0 12px 36px rgb(0 0 0 / 0.12);
  backdrop-filter: blur(20px) saturate(160%);
}
```

## Tipografia

* Use `system-ui` por padrão quando não existir uma identidade tipográfica definida.
* Ajuste tracking de acordo com o tamanho: títulos grandes aceitam espaçamento negativo; texto corrido deve permanecer próximo de zero.
* Use line-height mais compacto em títulos e mais confortável em parágrafos.
* Construa hierarquia combinando tamanho, peso, leading e contraste.
* Dimensione texto e espaçamento com `rem` ou `em` para respeitar preferências do usuário.
* Ative optical sizing em fontes variáveis compatíveis.

```css
:root {
  font: 100%/1.5 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.display-title {
  font-size: clamp(2rem, 5vw, 4rem);
  font-weight: 700;
  line-height: 1.05;
  letter-spacing: -0.025em;
  font-optical-sizing: auto;
}
```

## Acessibilidade

Redução de movimento não significa ausência de feedback. Substitua movimentos vestibulares por alternativas mais suaves.

* Com `prefers-reduced-motion`, remova parallax, elasticidade e grandes deslocamentos; use cross-fades curtos ou mudanças estáticas.
* Com `prefers-reduced-transparency`, aumente a opacidade do fundo e remova blur.
* Com `prefers-contrast`, use superfícies mais sólidas e bordas definidas.
* Mantenha foco visível, ordem de tabulação lógica e nomes acessíveis.
* Garanta alvos de toque confortáveis e não dependa somente de cor ou movimento para transmitir estado.

```css
@media (prefers-reduced-motion: reduce) {
  .animated-surface {
    animation: none !important;
    transform: none !important;
    transition: opacity 160ms ease;
  }
}

@media (prefers-reduced-transparency: reduce) {
  .floating-toolbar {
    background: Canvas;
    backdrop-filter: none;
  }
}
```

## Princípios para tomada de decisão

Avalie cada decisão usando estas perguntas:

1. **Propósito:** isto ajuda a tarefa principal?
2. **Autonomia:** o usuário continua no controle e consegue desfazer erros?
3. **Responsabilidade:** a decisão protege privacidade, segurança e confiança?
4. **Familiaridade:** o comportamento corresponde ao que a aparência promete?
5. **Flexibilidade:** funciona em diferentes dispositivos, habilidades e contextos?
6. **Simplicidade:** reduz esforço cognitivo sem esconder contexto necessário?
7. **Acabamento:** espaçamento, alinhamento, estados e movimento foram tratados com precisão?
8. **Encantamento:** a experiência transmite a emoção certa sem efeitos gratuitos?

## Checklist de revisão

Antes de concluir, confirme:

* [ ] A ação principal está evidente.
* [ ] Todo controle responde imediatamente ao pressionamento.
* [ ] Arrastes acompanham o ponteiro continuamente.
* [ ] Animações gestuais podem ser interrompidas.
* [ ] A velocidade é preservada na soltura e na reversão.
* [ ] Entrada e saída mantêm o mesmo eixo espacial.
* [ ] Bounce aparece apenas quando existe momentum.
* [ ] Blur, sombra e transparência comunicam hierarquia.
* [ ] Tipografia permanece legível em diferentes escalas.
* [ ] Estados de carregamento, vazio, sucesso e erro foram previstos.
* [ ] Teclado, foco e leitores de tela foram considerados.
* [ ] Redução de movimento, transparência e aumento de contraste funcionam.
* [ ] A interface foi testada em viewport pequeno e grande.
* [ ] A animação foi analisada quadro a quadro.

## Formato da resposta

Ao usar esta skill para criar ou revisar uma interface:

1. Resuma a direção de design em uma frase.
2. Explique a hierarquia e o fluxo principal.
3. Liste os estados e interações relevantes.
4. Defina movimento, spring, interrupção e acessibilidade.
5. Implemente ou forneça recomendações concretas.
6. Termine com os problemas encontrados, em ordem de impacto, quando o pedido for uma revisão.

## Referência

Esta skill é uma adaptação independente inspirada nos princípios apresentados em [Apple Design, de Emil Kowalski](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md), além de conceitos públicos de design de interfaces e movimento da Apple.



