# 🎁 Amigo Secreto da Família

Sorteio de amigo secreto que roda no navegador, sem servidor e sem custo. Cada participante recebe pelo WhatsApp ou por SMS um **link pessoal, criptografado e assinado**. Ao abrir, a pessoa toca num presente animado que revela quem ela tirou.

## Regras garantidas
- Ninguém tira a si mesmo.
- Cada pessoa dá e recebe exatamente um presente.
- Pessoas do mesmo **grupo** (ex.: casal) não tiram umas às outras.
- O sorteio forma uma **roda única**: na revelação, quem foi revelado revela o próximo, e a corrente só fecha no fim.
- Nomes repetidos e telefones inválidos são barrados antes do sorteio.

## Passo a passo
1. **Publicar a página (uma vez, ~5 min).** No GitHub: *Settings → Pages → Deploy from a branch* → escolha a branch e a pasta `/`. Se o repositório for privado e o plano não permitir Pages, arraste a pasta para https://app.netlify.com/drop.
2. Abra o endereço publicado (ex.: `https://SEU-USUARIO.github.io/App-Amigos-Secreto/`).
3. Preencha o evento (data, local, valor).
4. Cole os participantes, um por linha: `Nome; Telefone; Grupo` (grupo é opcional). Pode colar direto do Excel ou do Google Sheets, ou carregar um CSV.
5. Clique em **Sortear**.
6. Copie o aviso com o **selo** (5 emojis) e mande no grupo da família.
7. Clique em **WhatsApp** (ou SMS) em cada linha e depois em enviar. A mensagem traz só o link, não o nome sorteado.

O sorteio fica salvo no ## Segurança
- **Aleatoriedade:** embaralhamento Fisher-Yates com o gerador criptográfico do navegador (`crypto.getRandomValues`), sem viés de módulo. A ordem em que você digita os nomes não influencia o resultado (verificado estatisticamente nos testes).
- **Sigilo:** cada link tem a própria chave AES-256-GCM. Abrir o próprio link não revela nada sobre os outros. Tudo fica depois do `#`, que o navegador nunca envia ao servidor nem à prévia do WhatsApp.
- **Anti-pegadinha:** cada link é assinado (ECDSA P-256) por uma chave que existe só durante o sorteio e depois é descartada. Link adulterado mostra "Pegadinha detectada!". Link fabricado do zero mostra um selo diferente do divulgado no grupo.
- **Painel:** o navegador do organizador guarda só os links cifrados, não a lista de quem tirou quem. O backup é cifrado com senha (PBKDF2 + AES-GCM).

## Limitações (seja honesto com a família)
- Quem tem o link de alguém vê o resultado daquela pessoa. Não há como evitar isso sem servidor: é como entregar um envelope. Peça para ninguém encaminhar o link.
- O organizador tecnicamente pode abrir os links (são ele que envia). O app só garante que ele não vê sem querer.
- O envio é semiautomático, com um clique por pessoa.

par o navegador ou trocar de computador, perde a lista para reenvio. Os links já enviados continuam valendo.

## Testes
```
node tests/sorteio.test.js
```
