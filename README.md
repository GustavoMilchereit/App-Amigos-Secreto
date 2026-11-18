# 🎁 Amigo Secreto da Família

Sorteio de amigo secreto que roda no navegador, sem servidor e sem custo. Cada participante recebe pelo WhatsApp ou por SMS um **link pessoal criptografado**. Ao abrir, a pessoa toca num presente animado que revela quem ela tirou.

- **Painel do organizador:** https://gustavomilchereit.github.io/App-Amigos-Secreto/painel.html
- **Links dos participantes:** `https://gustavomilchereit.github.io/App-Amigos-Secreto/#...` (cerca de 200 caracteres)

Apoio: **Engecid Engenharia** e **forUshop**, com selo no painel e vinheta de "oferecimento" na revelação.

## Regras garantidas
- Ninguém tira a si mesmo.
- Cada pessoa dá e recebe exatamente um presente.
- Pessoas do mesmo **grupo** (ex.: casal) não tiram umas às outras.
- O sorteio forma uma **roda única**: na revelação, quem foi revelado revela o próximo, e a corrente só fecha no fim.
- Nomes repetidos e telefones inválidos são barrados antes do sorteio.

## Passo a passo
1. Abra o **painel** pelo endereço acima (não pelo arquivo no computador).
2. Preencha nome do amigo secreto, data, local e valor **antes** de sortear. Tudo aparece na mensagem e na página de cada pessoa. Para organizar outro amigo secreto no mesmo navegador, use "Começar do zero".
3. Preencha a tabela de participantes: **Nome completo**, **Telefone** e **Grupo** (opcional). Também dá para colar as 3 colunas direto do Excel/Google Sheets na primeira célula, ou carregar um CSV.
   - **Telefone:** qualquer formatação (traço, espaço, parênteses, +55). DDD obrigatório. O painel mostra o número interpretado embaixo de cada um e avisa DDD inexistente, falta do 9 ou telefone fixo.
   - **Grupo:** uma pessoa pode estar em **vários grupos** (digite um, aperte Enter, digite o próximo). Maiúsculas, acentos e espaços extras são ignorados. O painel mostra "não tira: …" para conferir, sugere os grupos já digitados e alerta grupos quase iguais (ex.: "Helena" x "Helna"), com botão para unificar, e grupos de uma pessoa só.
4. Clique em **Sortear**.
5. Clique em **WhatsApp** (ou SMS) em cada linha e depois em enviar.

O sorteio fica salvo no navegador. Para reenviar a alguém que perdeu a mensagem, abra o painel no mesmo computador e use **WhatsApp**, **Copiar mensagem** ou **Copiar link** de novo, quantas vezes precisar. O link é sempre o mesmo. Para trocar de aparelho, use o backup com senha.

## Segurança
- **Aleatoriedade:** embaralhamento Fisher-Yates com o gerador criptográfico do navegador (`crypto.getRandomValues`), sem viés de módulo. A ordem em que os nomes são digitados não influencia o resultado (verificado estatisticamente nos testes).
- **Sigilo:** cada link tem a própria chave AES-128-GCM. Abrir o próprio link não revela nada sobre os outros. Tudo fica depois do `#`, que o navegador nunca envia ao servidor nem à prévia do WhatsApp.
- **Adulteração:** link alterado à mão ou cortado não abre.
- **Painel:** o navegador do organizador guarda só os links cifrados, não a lista de quem tirou quem. O backup é cifrado com senha (PBKDF2 + AES-GCM).

## Limitações
- **Link fabricado:** como o site é público, alguém pode gerar um sorteio próprio e mandar um link falso. A defesa é combinada: só vale o link enviado pelo número do organizador (o aviso já vai na mensagem).
- Quem tem o link de alguém vê o resultado daquela pessoa. Peça para ninguém encaminhar.
- O organizador tecnicamente pode abrir os links. O app só garante que ele não veja sem querer.
- O envio é semiautomático, um clique por pessoa.

## Testes
```
node tests/sorteio.test.js
```
