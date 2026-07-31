# Manual do Usuário — CIFRAS KARAOKÊ

## Primeiros passos
1. Peça pra um administrador criar sua conta em **Configurações → Administração de usuários** (cada usuário vê apenas suas próprias músicas; não há mais auto-cadastro pela tela de login).
2. Em **Minhas músicas → + Nova música**, envie um arquivo TXT informando gênero e intérprete. O sistema organiza e indexa a música automaticamente por gênero e intérprete — dá pra filtrar por eles depois em **Minhas músicas**.

## Formato do arquivo TXT
```
@titulo: Yellow
@autor: Chris Martin
@intérprete: Coldplay
@tom: B
@velocidade: 55
@ritmomusical: pop rock
@introdução: B  F#  E
@tags: anos 2000, balada
@nota: 8
@favorita: sim

B
Look at the stars
F#
Look how they shine for you
```
Campos ausentes são criados pelo botão **Normalizar músicas** (Configurações).

## Marcação explícita da cifra
Além da letra e dos acordes, você pode marcar observações, solos, riffs, tablaturas e rótulos de seção diretamente no arquivo — veja [MARCACAO_CIFRAS.md](MARCACAO_CIFRAS.md). O editor tem botões prontos para inserir essas marcas sem precisar decorar a sintaxe.

## Áudio: karaokê sincronizado de verdade
Na aba **Áudio** do editor, envie um arquivo de áudio de referência para a música. A partir daí o player karaokê deixa de usar o cronômetro fixo e passa a tocar esse áudio de verdade, com a letra ganhando cor progressivamente (estilo CDG) conforme a música avança. Músicas sem áudio enviado continuam funcionando exatamente como antes.

Na mesma aba dá pra:
- **Enviar/substituir/remover** a faixa de referência, com prévia para ouvir.
- **Marcar o tempo de cada linha**: toque a faixa e clique em **⏱ Marcar** no momento certo — o sistema escreve `[t=SEG]` na linha e avança pra próxima. Não precisa marcar todas: o que faltar é interpolado a partir das vizinhas.
- **Enviar samples/solos** (trechos de áudio de um instrumento específico) e, na aba Editar, usar o botão **🔊 Sample** para marcar onde cada um deve tocar sozinho durante a apresentação — útil pra ensaiar ou tocar ao vivo com a banda. Ver detalhes em [MARCACAO_CIFRAS.md](MARCACAO_CIFRAS.md#3-tempo-real-e-samples-automáticos--tseg-e-sample).

> Atenção: renomear o `@titulo` (ou intérprete/gênero) de uma música muda seu identificador interno — o mesmo já acontecia com o histórico de versões, e agora vale também para o áudio e os samples enviados. Evite renomear depois de já ter marcado os tempos.

## Player Karaokê
Abra qualquer música e clique **▶ Karaokê**. A tela mostra 16 linhas simultâneas; a de cima (destacada em âmbar) é a linha atual. Sem áudio enviado, o avanço é automático conforme `@velocidade` e pode ser ajustado ao vivo; com áudio, o avanço segue a reprodução real e a barra de progresso pode ser clicada para pular pra qualquer ponto da música. Observações marcadas como "oculta" não aparecem no palco — só na folha de cifra.

| Tecla | Ação |
|---|---|
| Espaço | Play / Pause |
| ← / → | Linha anterior / próxima |
| ↑ / ↓ | Mais rápido / mais lento (com áudio: ajusta a velocidade de reprodução) |
| R | Reiniciar |
| F | Tela cheia |
| ESC | Voltar |

## Transposição
No editor da música: **−½ tom / +½ tom** ou escolha o tom de destino. O corpo inteiro e o campo `@tom` são atualizados. Suporta acordes com sétimas, maiores com sétima maior, sustenidos/bemóis e inversões (ex.: `G/B`).

## Setlists
Crie em **Setlists**, busque músicas para adicionar e **arraste (⠿) para reordenar**. Importe/exporte em TXT no formato:
```
@nome: Rock Nacional

Legião Urbana/Tempo Perdido
Capital Inicial/Primeiros Erros
```
Ao excluir uma música do acervo, ela sai automaticamente de todos os setlists.

## Versões e histórico
Cada salvamento no editor gera uma versão. Na aba **Histórico de versões**: compare (diff colorido) e restaure. A página **Histórico** lista as execuções recentes no player.

## Impressão e exportação
- **Imprimir / PDF**: usa o modo de impressão do navegador (sem menus, fonte otimizada) — escolha "Salvar como PDF".
- **Exportar TXT**: baixa o arquivo com o cabeçalho completo.
