# 🎁 Amigo Secreto da Família

Sorteio de amigo secreto que roda no navegador, sem servidor e sem custo. Cada participante recebe pelo WhatsApp ou por SMS um **link pessoal** que revela quem ele tirou. O organizador não vê o resultado.

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
6. Clique em **WhatsApp** (ou SMS) em cada linha e depois em enviar. A mensagem traz só o link, não o nome sorteado.

O sorteio fica salvo no navegador. Para reenviar a alguém que perdeu a mensagem, abra a página no mesmo computador e clique de novo.

## Limitações (seja honesto com a família)
- O resultado vai **ofuscado** no link, não criptografado. Alguém com conhecimento técnico que pegue o link de outra pessoa consegue decodificar. Para família, basta.
- O envio é semiautomático, um clique por pessoa. Automação total exigiria a API do WhatsApp Business ou o Twilio, que são pagos e burocráticos.
- Se você limpar o navegador ou trocar de computador, perde a lista para reenvio. Os links já enviados continuam valendo.

## Testes
```
node tests/sorteio.test.js
```
