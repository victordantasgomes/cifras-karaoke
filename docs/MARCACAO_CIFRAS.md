# Marcação explícita de cifras

Este documento explica como marcar, dentro do próprio arquivo `.txt`, o que é
letra, acorde, observação, solo, riff, tablatura ou qualquer outra coisa —
para que o **Player Karaokê** e a **folha de cifra** (visualização/impressão)
exibam cada trecho do jeito certo.

Sem nenhuma marcação, o sistema continua adivinhando (letra vs. acorde) por
heurística, como sempre fez. A marcação explícita existe para os casos em que
você quer garantir o resultado, esconder uma anotação pessoal do palco, ou
destacar solo/riff/tablatura de forma clara.

## 1. Rótulos de seção — `[Texto]`

Se o seu acervo já usa colchetes para marcar seções (`[Refrão]`, `[Solo]`,
`[Primeira Parte]`, `[Riff 1]`...), **não precisa mudar nada**: essa já era a
convenção mais comum nos arquivos baixados de sites de cifra, e agora ela
ganha estilo próprio automaticamente — aparece como um título discreto, tanto
na folha de cifra quanto no palco do karaokê.

```
[Refrão]
Toda vez que eu te vejo
Meu coração dispara
```

Regra: uma linha que é **só** `[qualquer texto]` (nada antes ou depois) vira
um rótulo de seção. O texto dentro dos colchetes é exibido exatamente como
escrito. Não afeta a classificação das linhas seguintes — cada uma continua
sendo interpretada normalmente (por marcação própria ou heurística).

## 2. Marcação explícita — `[@tipo]`

Para os casos em que você quer garantir o tipo de uma linha (ou de um bloco
inteiro), use colchetes com `@` na frente. Esse prefixo é novo — nunca é
confundido com os rótulos de seção do item 1.

### Uma linha só

```
[@observacao] Toque suave aqui, sem exagero
```

A marca vale só para essa linha; o texto depois dela é o que aparece.

### Um bloco de várias linhas

Sem texto depois do `[@tipo]`, ele abre um bloco que vale até o fechamento
correspondente `[@/tipo]`:

```
[@tab]
e|-----0---1---3-----|
B|-----0---0---0-----|
G|--------------------|
[@/tab]
```

Todas as linhas entre a abertura e o fechamento recebem o mesmo tipo. Não dá
para aninhar blocos (um `[@tab]` dentro de outro `[@tab]`, por exemplo).

### Tipos com estilo próprio

| Tipo | Marca | Aparência |
|---|---|---|
| Acorde | `[@acorde]` | âmbar, negrito (normalmente detectado sozinho, use só para corrigir um caso que a heurística errou) |
| Observação | `[@observacao]` | itálico, cor neutra |
| Solo | `[@solo]` ... `[@/solo]` | verde, negrito |
| Riff | `[@riff]` ... `[@/riff]` | verde, itálico |
| Tablatura | `[@tab]` ... `[@/tab]` | verde, com uma barra lateral (preserva o espaçamento exato) |
| Sample | `[@sample] nome-do-sample` | azul, com ícone 🔊 — dispara o áudio automaticamente no karaokê (ver seção 3) |
| Letra | `[@letra]` | sem estilo especial — use para "desfazer" uma classificação errada |

Qualquer outra palavra depois do `@` (`[@ponte]`, `[@intro]`, `[@guitarra2]`...)
também funciona — vira um tipo customizado, exibido com uma etiqueta neutra
mostrando o nome que você escolheu. É a forma de cobrir casos que não se
encaixam nas categorias acima, sem esperar uma atualização do sistema.

## 3. Tempo real e samples automáticos — `[t=SEG]` e `[@sample]`

Se você enviar um **áudio de referência** para a música (aba **Áudio**, no
editor), o karaokê deixa de rodar num cronômetro fixo e passa a acompanhar o
áudio de verdade: a letra vai ganhando cor (estilo CDG) conforme a música
toca, e a barra de progresso passa a mostrar a música inteira, podendo ser
clicada para pular pra qualquer ponto. Músicas **sem** áudio enviado
continuam funcionando exatamente como sempre — cronômetro fixo, sem varredura.

Isso é possível marcando o início de cada linha com `[t=SEG]` (segundos desde
o começo do áudio):

```
[t=12.5] Quando eu era pequeno
[t=15.0] Sonhava em ser cantor
```

Você não precisa marcar **todas** as linhas — o sistema interpola o tempo das
linhas sem marca a partir das linhas vizinhas que têm. Quanto mais linhas
marcadas, mais preciso o acompanhamento. A forma mais fácil de marcar é pelo
botão **"Marcar tempo"** na aba **Áudio** do editor: você toca a faixa e vai
clicando conforme cada linha começa — o sistema escreve o `[t=SEG]` sozinho e
avança pra próxima linha.

### Samples/solos com disparo automático

Depois de enviar um trecho de áudio (solo, riff, sample de um instrumento) na
aba **Áudio**, marque o ponto exato em que ele deve tocar combinando `[t=SEG]`
com `[@sample]`:

```
[t=42.5] [@sample] Solo de Guitarra
```

O texto depois de `[@sample]` precisa bater com o nome que você deu ao sample
no upload (ignorando maiúsculas/acentos/espaços). Sem os dois — tempo marcado
**e** sample enviado com esse nome — a linha ainda aparece no palco como um
aviso visual (💬 "vem um solo"), só não dispara sozinha: errar o tempo de um
disparo automático ao vivo é um problema real, uma letra levemente fora de
sincronia não é. Insira essa marca rapidamente pelo botão **🔊 Sample** na
barra de ferramentas da aba **Editar** (aparece assim que você tiver pelo
menos um sample enviado).

## 4. Observação visível vs. oculta

Toda marca aceita um modificador `:oculta` depois do tipo:

```
[@observacao] Repete o refrão 2x antes da ponte
[@observacao:oculta] conferir esse acorde com o áudio original, parece errado
```

- **Visível** (padrão): aparece na folha de cifra **e** no palco do karaokê.
- **Oculta** (`:oculta`): aparece na folha de cifra (com um aviso "🔒 oculta
  no karaokê", para você lembrar que é uma nota só sua) mas **nunca** é
  enviada ao player — o placo nunca a recebe, nem por um instante.

O modificador funciona em qualquer tipo, não só observação — por exemplo,
`[@tab:oculta]` guarda uma tablatura de referência que só aparece no editor,
sem poluir a tela durante a apresentação.

## 5. Usando os botões do editor

Na aba **Editar** de uma música, acima do campo de texto há uma barra de
ferramentas que insere a marcação para você, sem precisar decorar a sintaxe:

- **+ Rótulo de seção**: escolha um rótulo comum na lista (Intro, Refrão,
  Ponte, Solo...) e insere `[Rótulo]` antes da linha onde está o cursor.
- **💬 Observação** / **🔒 Observação oculta**: marca a linha atual como
  `[@observacao]` ou `[@observacao:oculta]`.
- **🎸 Solo / 🎵 Riff / 🎼 Tablatura**: envolve o trecho selecionado com
  `[@solo]...[@/solo]` (ou riff/tab). Sem seleção, insere um bloco vazio
  pronto para você preencher.
- **🔊 Sample**: escolha um sample já enviado no menu e insere `[@sample]
  nome` antes da linha atual (aparece assim que houver pelo menos um sample
  cadastrado na aba Áudio).

Na aba **Áudio**, o botão **⏱ Marcar tempo** insere/atualiza o `[t=SEG]` da
linha selecionada com a posição atual da faixa, e avança para a próxima —
veja a seção 3.

## 6. Referência rápida

```
[Refrão]                                  ← rótulo de seção (existente)
Am        F
Quando eu era pequeno

[@observacao] Toque suave aqui             ← observação visível, uma linha
[@observacao:oculta] nota só minha         ← observação oculta, uma linha

[@solo]                                    ← bloco (verde, negrito)
e|-----0---1---3-----|
B|-----0---0---0-----|
[@/solo]

[@ponte] Aqui muda o clima                 ← tipo customizado, uma linha

[t=42.5] [@sample] Solo de Guitarra        ← dispara o sample "Solo de Guitarra" aos 42,5s
```

## 7. O que acontece com arquivos sem marcação

Nada muda. A heurística (linha só com cifras → acorde; texto entre
parênteses ou começando com palavras como "Intro"/"Solo"/"Ponte" → observação;
resto → letra) continua sendo o padrão. A marcação explícita é sempre
opcional e sempre vence a heurística quando presente.
