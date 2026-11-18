/**
 * Painel do organizador (painel.html).
 *
 * Fluxo: o organizador preenche o evento (passo 1) e a tabela de participantes
 * (passo 2), clica em Sortear e envia os links (passo 3).
 *
 * Tudo fica salvo no navegador (localStorage), para não perder o trabalho ao
 * recarregar a página. O painel NUNCA guarda quem tirou quem: só os links
 * cifrados, que cada participante abre na página de revelação (index.html).
 *
 *  1. Utilidades
 *  2. Armazenamento no navegador
 *  3. Evento (passo 1)
 *  4. Patrocinadores
 *  5. Tabela de participantes (passo 2)
 *  6. Conferência e alertas da tabela
 *  7. Sorteio
 *  8. Envio dos links (passo 3)
 *  9. Backup, refazer e começar do zero
 * 10. Inicialização
 *
 * Depende de: js/sorteio.js (window.AmigoSecreto) e js/patrocinadores.js.
 */
(function () {
  'use strict';

  const AS = window.AmigoSecreto;

  // ===========================================================================
  // 1. UTILIDADES
  // ===========================================================================

  /** Atalho para document.getElementById. */
  const $ = (id) => document.getElementById(id);

  /** Escapa texto para inserir com segurança dentro de HTML. */
  const escaparHtml = (texto) => String(texto).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Primeiro nome de um nome completo ("Maria Clara Souza" → "Maria"). */
  const primeiroNome = (nome) => nome.split(' ')[0];

  /**
   * Mostra uma mensagem embaixo do botão Sortear.
   * @param {string} html  Conteúdo (já escapado); vazio apaga a mensagem.
   * @param {'ok'|'erro'} [tipo]
   */
  function mostrarMensagem(html, tipo) {
    $('mensagem').innerHTML = html ? `<div class="mensagem ${tipo}">${html}</div>` : '';
  }

  // ===========================================================================
  // 2. ARMAZENAMENTO NO NAVEGADOR
  // ===========================================================================
  // Formato salvo (não mude os nomes: dados de quem já usa o painel dependem deles):
  //   { 'ev-nome', 'ev-data', 'ev-local', 'ev-valor', 'ev-url': textos do passo 1,
  //     linhas:    [{ nome, tel, grupo }] — a tabela do passo 2,
  //     ignorados: ['grupo a|grupo b']    — pares que o organizador disse serem diferentes,
  //     envio:     { evento, itens: [{ nome, telefone, token }], enviados: {índice: true} } }

  const CHAVE_DO_ARMAZENAMENTO = 'amigo-secreto-v3';
  const CHAVES_ANTIGAS = ['amigo-secreto-v1', 'amigo-secreto-v2']; // formatos antigos, já sem uso

  /** IDs dos campos do passo 1 (também usados como nomes no armazenamento). */
  const CAMPOS_DO_EVENTO = ['ev-nome', 'ev-data', 'ev-local', 'ev-valor', 'ev-url'];

  /** Lê tudo o que está salvo. Nunca falha: devolve {} se não houver nada. */
  function carregarEstado() {
    try { return JSON.parse(localStorage.getItem(CHAVE_DO_ARMAZENAMENTO)) || {}; } catch { return {}; }
  }

  /**
   * Salva os campos do evento e, opcionalmente, outras partes do estado.
   * @param {object} [extra]  Ex.: { linhas, ignorados } ou { envio }.
   */
  function salvarEstado(extra = {}) {
    const estado = carregarEstado();
    CAMPOS_DO_EVENTO.forEach(id => { estado[id] = $(id).value; });
    try { localStorage.setItem(CHAVE_DO_ARMAZENAMENTO, JSON.stringify({ ...estado, ...extra })); } catch { /* navegador sem armazenamento */ }
  }

  // ===========================================================================
  // 3. EVENTO (PASSO 1)
  // ===========================================================================

  /** Dados do evento no formato curto usado nos links (ver js/sorteio.js). */
  function lerEvento() {
    return {
      e: $('ev-nome').value.trim(),
      d: $('ev-data').value.trim(),
      l: $('ev-local').value.trim(),
      v: $('ev-valor').value.trim(),
    };
  }

  /**
   * Endereço da página de revelação, terminando em "/". Se o campo estiver
   * vazio e o painel foi aberto pelo site, usa a pasta do próprio painel.
   */
  function enderecoDaRevelacao() {
    let endereco = $('ev-url').value.trim();
    if (!endereco && location.protocol.startsWith('http')) endereco = location.href.replace(/[^/]*([?#].*)?$/, '');
    endereco = endereco.replace(/(index|painel|revelar)\.html$/, '');
    if (endereco && !endereco.endsWith('/')) endereco += '/';
    return endereco;
  }

  // ===========================================================================
  // 4. PATROCINADORES
  // ===========================================================================

  /** Monta o selo do cabeçalho a partir de js/patrocinadores.js. */
  function mostrarPatrocinadores() {
    const { principal, apoiadores = [] } = window.PATROCINADORES || {};
    if (!principal && !apoiadores.length) return;
    const imagem = (marca) => `<img src="${escaparHtml(marca.logo)}" alt="${escaparHtml(marca.nome)}">`;
    let html = '<span class="patrocinio-rotulo">Apoio</span>';
    if (principal) html += `<div class="patrocinio-faixa patrocinio-principal">${imagem(principal)}</div>`;
    if (apoiadores.length) html += `<div class="patrocinio-faixa patrocinio-apoiadores">${apoiadores.map(imagem).join('')}</div>`;
    $('patrocinio').innerHTML = html;
    $('patrocinio').classList.remove('oculto');
  }

  // ===========================================================================
  // 5. TABELA DE PARTICIPANTES (PASSO 2)
  // ===========================================================================
  // `linhas` é a fonte da verdade; a tela é redesenhada a partir dela.
  // A tabela sempre termina com uma linha vazia, pronta para digitar.

  /** @type {{nome: string, tel: string, grupo: string}[]} */
  let linhas = [];
  /** Pares de grupos "a|b" que o organizador confirmou serem diferentes. */
  let gruposIgnorados = [];

  const linhaVazia = () => ({ nome: '', tel: '', grupo: '' });
  const gruposDaLinha = (linha) => AS.separarGrupos(linha.grupo);
  const validarTabela = () => AS.validar(linhas, gruposIgnorados);
  const salvarTabela = () => salvarEstado({ linhas, ignorados: gruposIgnorados });

  /** Garante uma linha vazia no fim. Devolve true se precisou criar uma. */
  function garantirLinhaVaziaNoFim() {
    const ultima = linhas[linhas.length - 1];
    if (!ultima || ultima.nome || ultima.tel || ultima.grupo) {
      linhas.push(linhaVazia());
      return true;
    }
    return false;
  }

  /** Quando a última linha recebe conteúdo, acrescenta outra vazia na tela. */
  function acrescentarLinhaVaziaSePreciso() {
    if (garantirLinhaVaziaNoFim()) $('linhas').appendChild(criarLinhaNaTela(linhas.length - 1));
  }

  /** Recria todas as linhas na tela (usado depois de colar, remover, unificar…). */
  function redesenharTabela() {
    garantirLinhaVaziaNoFim();
    const container = $('linhas');
    container.innerHTML = '';
    linhas.forEach((_, indice) => container.appendChild(criarLinhaNaTela(indice)));
    atualizarConferencia();
  }

  /**
   * Cria os elementos de uma linha da tabela: nome, telefone, grupos e o botão
   * de remover. Cada campo atualiza `linhas` assim que é editado.
   * @param {number} indice
   * @returns {HTMLElement}
   */
  function criarLinhaNaTela(indice) {
    const elemento = document.createElement('div');
    elemento.className = 'grade-participantes linha';
    elemento.dataset.indice = indice;
    elemento.innerHTML = `
      <span class="celula-numero">${indice + 1}</span>
      <div class="celula-nome">
        <input data-campo="nome" placeholder="Nome completo" autocomplete="off">
        <div class="conferencia"></div>
      </div>
      <div class="celula-telefone">
        <input data-campo="tel" placeholder="(11) 98765-4321" inputmode="tel" autocomplete="off">
        <div class="conferencia"></div>
      </div>
      <div class="celula-grupo">
        <div class="etiquetas">
          <input class="etiquetas-entrada" placeholder="Opcional" list="lista-grupos" autocomplete="off" enterkeyhint="done" aria-label="Adicionar grupo">
        </div>
        <div class="conferencia"></div>
      </div>
      <button class="botao-remover" title="Remover pessoa" aria-label="Remover pessoa">✕</button>`;

    // O índice pode mudar quando outra linha é removida; por isso é lido na hora.
    const linha = () => linhas[Number(elemento.dataset.indice)];

    // Nome e telefone.
    elemento.querySelectorAll('input[data-campo]').forEach(campo => {
      campo.value = linha()[campo.dataset.campo];
      campo.addEventListener('input', () => {
        linha()[campo.dataset.campo] = campo.value;
        acrescentarLinhaVaziaSePreciso();
        salvarTabela();
        atualizarConferencia();
      });
      campo.addEventListener('paste', evento => colarVariasLinhas(evento, Number(elemento.dataset.indice)));
    });

    configurarEtiquetasDeGrupo(elemento, linha);

    elemento.querySelector('.botao-remover').onclick = () => {
      linhas.splice(Number(elemento.dataset.indice), 1);
      salvarTabela();
      redesenharTabela();
    };
    return elemento;
  }

  /**
   * Se o texto colado tiver várias linhas ou colunas (Excel, Google Sheets),
   * preenche a tabela a partir da linha onde se colou.
   */
  function colarVariasLinhas(evento, indiceInicial) {
    const texto = (evento.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(texto.trim())) return; // colagem comum, de um campo só
    evento.preventDefault();
    const novas = AS.linhasDeTexto(texto);
    novas.forEach((nova, deslocamento) => { linhas[indiceInicial + deslocamento] = nova; });
    salvarTabela();
    redesenharTabela();
    mostrarMensagem(`${novas.length} pessoa(s) coladas. Confira os alertas de cada linha.`, 'ok');
  }

  /**
   * Campo de grupos em forma de etiquetas: digite e aperte Enter (ou vírgula)
   * para adicionar; "×" remove; Backspace no campo vazio remove a última.
   * @param {HTMLElement} elemento  A linha da tabela.
   * @param {() => object} linha    Devolve o objeto da linha em `linhas`.
   */
  function configurarEtiquetasDeGrupo(elemento, linha) {
    const caixa = elemento.querySelector('.etiquetas');
    const entrada = elemento.querySelector('.etiquetas-entrada');

    const desenharEtiquetas = () => {
      caixa.querySelectorAll('.etiqueta').forEach(e => e.remove());
      gruposDaLinha(linha()).forEach((grupo, posicao) => {
        const etiqueta = document.createElement('span');
        etiqueta.className = 'etiqueta';
        etiqueta.dataset.chave = AS.normalizarGrupo(grupo);
        etiqueta.innerHTML = `<span>${escaparHtml(grupo)}</span><button type="button" aria-label="Remover grupo ${escaparHtml(grupo)}">×</button>`;
        etiqueta.querySelector('button').onclick = () => {
          const grupos = gruposDaLinha(linha());
          grupos.splice(posicao, 1);
          definirGrupos(grupos);
        };
        caixa.insertBefore(etiqueta, entrada);
      });
      entrada.placeholder = gruposDaLinha(linha()).length ? '+ outro grupo' : 'Opcional';
    };

    const definirGrupos = (grupos) => {
      linha().grupo = AS.separarGrupos(grupos.join(',')).join(', ');
      acrescentarLinhaVaziaSePreciso();
      salvarTabela();
      desenharEtiquetas();
      atualizarConferencia();
    };

    const adicionarDigitado = () => {
      const texto = entrada.value;
      entrada.value = '';
      if (texto.trim()) definirGrupos([...gruposDaLinha(linha()), ...texto.split(',')]);
    };

    entrada.addEventListener('keydown', evento => {
      if (evento.key === 'Enter') {
        evento.preventDefault();
        adicionarDigitado();
      } else if (evento.key === 'Backspace' && !entrada.value && gruposDaLinha(linha()).length) {
        definirGrupos(gruposDaLinha(linha()).slice(0, -1));
      }
    });
    entrada.addEventListener('input', () => { if (entrada.value.includes(',')) adicionarDigitado(); });
    entrada.addEventListener('change', adicionarDigitado); // escolha na lista de sugestões ou ao sair do campo
    caixa.addEventListener('click', evento => { if (evento.target === caixa) entrada.focus(); });

    desenharEtiquetas();
  }

  /** Troca um grupo por outro em todas as linhas (botão "Usar … para todos"). */
  function unificarGrupo(chaveAntiga, nomeNovo) {
    linhas.forEach(linha => {
      const grupos = gruposDaLinha(linha).map(g => (AS.normalizarGrupo(g) === chaveAntiga ? nomeNovo : g));
      linha.grupo = AS.separarGrupos(grupos.join(',')).join(', ');
    });
    salvarTabela();
    redesenharTabela();
  }

  // ===========================================================================
  // 6. CONFERÊNCIA E ALERTAS DA TABELA
  // ===========================================================================
  // Depois de cada edição, valida a tabela inteira e mostra embaixo de cada
  // campo o que foi entendido: "✓ (11) 98765-4321", "✕ Falta o DDD",
  // "✓ não tira: Helena"… Também lista alertas de grupos suspeitos.

  /** Revalida a tabela e atualiza a conferência de cada linha e os alertas. */
  function atualizarConferencia() {
    const validacao = validarTabela();

    // Mensagem a mostrar em cada campo; erro tem prioridade sobre aviso.
    const porCampo = {};
    const registrar = (linha, campo, tipo, texto) => {
      const chave = `${linha}:${campo}`;
      if (!porCampo[chave] || tipo === 'erro') porCampo[chave] = { tipo, texto };
    };
    validacao.avisos.forEach(a => registrar(a.linha, a.campo, 'aviso', '⚠ ' + a.msg));
    validacao.erros.forEach(e => { if (e.linha >= 0) registrar(e.linha, e.campo, 'erro', '✕ ' + e.msg); });

    // Grupos de cada linha, e quais estão sob suspeita de erro de digitação.
    const gruposPorLinha = {};
    validacao.grupos.forEach(g => g.membros.forEach(m => { (gruposPorLinha[m.linha] = gruposPorLinha[m.linha] || []).push(g); }));
    const chavesSuspeitas = new Set(validacao.suspeitos.flatMap(s => [s.a.chave, s.b.chave]));

    document.querySelectorAll('#linhas .linha').forEach(elemento => {
      const indice = Number(elemento.dataset.indice);
      const linha = linhas[indice];

      const conferir = (campo, tipo, texto) => {
        const celula = elemento.querySelector({ nome: '.celula-nome', tel: '.celula-telefone', grupo: '.celula-grupo' }[campo]);
        const alvo = campo === 'grupo' ? celula.querySelector('.etiquetas') : celula.querySelector('input');
        alvo.classList.remove('erro', 'aviso');
        if (tipo === 'erro' || tipo === 'aviso') alvo.classList.add(tipo);
        const conferencia = celula.querySelector('.conferencia');
        conferencia.className = 'conferencia ' + (tipo || '');
        conferencia.textContent = texto || '';
      };

      const vazia = !linha.nome.trim() && !linha.tel.trim() && !gruposDaLinha(linha).length;
      if (vazia) {
        ['nome', 'tel', 'grupo'].forEach(campo => conferir(campo, '', ''));
        return;
      }

      // Nome.
      const nome = porCampo[`${indice}:nome`];
      conferir('nome', nome && nome.tipo, nome && nome.texto);

      // Telefone: mostra o número como foi entendido, ou o problema.
      const telefone = porCampo[`${indice}:tel`];
      if (telefone) conferir('tel', telefone.tipo, telefone.texto);
      else conferir('tel', 'ok', '✓ ' + AS.analisarTelefone(linha.tel).exibir);

      // Grupos: destaca etiquetas suspeitas e lista quem essa pessoa não pode tirar.
      const grupos = gruposPorLinha[indice] || [];
      elemento.querySelectorAll('.etiqueta').forEach(etiqueta => {
        const grupo = grupos.find(g => g.chave === etiqueta.dataset.chave);
        etiqueta.classList.toggle('aviso', !!grupo && (chavesSuspeitas.has(grupo.chave) || grupo.membros.length === 1));
      });
      if (!grupos.length) {
        conferir('grupo', '', 'sem grupo');
      } else {
        const parecido = grupos.find(g => chavesSuspeitas.has(g.chave));
        const sozinho = grupos.find(g => g.membros.length === 1 && !chavesSuspeitas.has(g.chave));
        const naoTira = [...new Set(grupos.flatMap(g => g.membros.filter(m => m.linha !== indice).map(m => primeiroNome(m.nome))))];
        if (parecido) conferir('grupo', 'aviso', `⚠ "${parecido.rotulo}" parecido com outro grupo (veja abaixo)`);
        else if (sozinho) conferir('grupo', 'aviso', `⚠ ninguém mais em "${sozinho.rotulo}"`);
        else conferir('grupo', 'ok', '✓ não tira: ' + naoTira.join(', '));
      }
    });

    // Sugestões ao digitar um grupo e contador de pessoas.
    $('lista-grupos').innerHTML = validacao.grupos.map(g => `<option value="${escaparHtml(g.rotulo)}">`).join('');
    const total = validacao.pessoas.length;
    $('contador').textContent = total ? `(${total} ${total === 1 ? 'pessoa' : 'pessoas'})` : '';

    mostrarAlertasDeGrupo(validacao);
  }

  /** Alertas de grupos quase iguais (com botões para resolver) e de grupos de uma pessoa só. */
  function mostrarAlertasDeGrupo(validacao) {
    const container = $('alertas');
    container.innerHTML = '';
    const membros = (grupo) => escaparHtml(grupo.membros.map(m => primeiroNome(m.nome)).join(', '));

    validacao.suspeitos.forEach(({ a, b, par }) => {
      const alerta = document.createElement('div');
      alerta.className = 'alerta';
      alerta.innerHTML = `⚠ Os grupos <b>"${escaparHtml(a.rotulo)}"</b> (${membros(a)}) e <b>"${escaparHtml(b.rotulo)}"</b> (${membros(b)}) são quase iguais. Erro de digitação?<div class="acoes"></div>`;
      const acoes = alerta.querySelector('.acoes');
      const botao = (texto, aoClicar) => {
        const elemento = document.createElement('button');
        elemento.textContent = texto;
        elemento.onclick = aoClicar;
        acoes.appendChild(elemento);
      };
      botao(`Usar "${a.rotulo}" para todos`, () => unificarGrupo(b.chave, a.rotulo));
      botao(`Usar "${b.rotulo}" para todos`, () => unificarGrupo(a.chave, b.rotulo));
      botao('São grupos diferentes', () => { gruposIgnorados.push(par); salvarTabela(); atualizarConferencia(); });
      container.appendChild(alerta);
    });

    if (validacao.sozinhos.length) {
      const alerta = document.createElement('div');
      alerta.className = 'alerta';
      alerta.innerHTML = '⚠ ' + validacao.sozinhos.map(g => `<b>"${escaparHtml(g.rotulo)}"</b> só tem ${membros(g)}`).join('; ') +
        '. Grupo serve para impedir que pessoas se tirem, então precisa de 2 ou mais. Confira se não é erro de digitação, ou remova esse grupo (×).';
      container.appendChild(alerta);
    }
  }

  // ===========================================================================
  // 7. SORTEIO
  // ===========================================================================

  /**
   * Valida, sorteia e gera um link cifrado para cada pessoa. Depois disso, só
   * os links ficam salvos: o resultado em si some da memória do painel.
   */
  async function sortear() {
    const estado = carregarEstado();
    if (estado.envio && !confirm('Já existe um sorteio. Sortear de novo invalida os links enviados. Continuar?')) return;

    const validacao = validarTabela();
    if (validacao.erros.length) {
      const lista = validacao.erros.slice(0, 8).map(e => (e.linha >= 0 ? `Linha ${e.linha + 1}: ` : '') + escaparHtml(e.msg)).join('<br>');
      return mostrarMensagem(`Corrija antes de sortear:<br>${lista}${validacao.erros.length > 8 ? '<br>…' : ''}`, 'erro');
    }
    const alertasPendentes = validacao.suspeitos.length + validacao.sozinhos.length;
    if (alertasPendentes && !confirm(`Há ${alertasPendentes} alerta(s) de grupo sem resolver. Um erro de grupo pode fazer um casal se tirar. Sortear mesmo assim?`)) return;
    if (!$('ev-nome').value.trim()) {
      $('ev-nome').focus();
      return mostrarMensagem('Dê um nome ao amigo secreto no passo 1. Ele aparece na mensagem e na página de cada pessoa.', 'erro');
    }

    const botao = $('btn-sortear');
    try {
      botao.disabled = true;
      const evento = lerEvento();
      const pares = AS.sortear(validacao.pessoas);
      const itens = [];
      for (const { de, para } of pares) {
        itens.push({ nome: de.nome, telefone: de.telefone, token: await AS.selar({ n: de.nome, a: para.nome, ...evento }) });
      }
      salvarEstado({ envio: { evento, itens, enviados: {} } });
      mostrarMensagem(`Sorteio feito com ${validacao.pessoas.length} participantes. Ninguém tirou a si mesmo nem alguém do próprio grupo, e a revelação forma uma roda única.`, 'ok');
      mostrarLinksDeEnvio();
    } catch (erro) {
      mostrarMensagem(escaparHtml(erro.message), 'erro');
    } finally {
      botao.disabled = false;
    }
  }

  // ===========================================================================
  // 8. ENVIO DOS LINKS (PASSO 3)
  // ===========================================================================

  /**
   * Copia um texto para a área de transferência. Tenta a forma moderna, depois
   * uma alternativa para navegadores que a bloqueiam e, por fim, mostra o texto
   * para a pessoa copiar à mão.
   * @returns {Promise<boolean>} se conseguiu copiar sozinho.
   */
  async function copiarTexto(texto) {
    try { await navigator.clipboard.writeText(texto); return true; } catch { /* tenta a alternativa */ }
    try {
      const campo = document.createElement('textarea');
      campo.value = texto;
      campo.setAttribute('readonly', '');
      Object.assign(campo.style, { position: 'fixed', opacity: '0' });
      document.body.appendChild(campo);
      campo.select();
      campo.setSelectionRange(0, texto.length);
      const copiou = document.execCommand('copy');
      campo.remove();
      if (copiou) return true;
    } catch { /* cai no aviso abaixo */ }
    prompt('Não consegui copiar sozinho. Selecione o texto abaixo e copie:', texto);
    return false;
  }

  /**
   * Cria um botão que copia `texto`. Pode ser usado quantas vezes quiser:
   * mostra "✅ Copiado!" por 2 segundos e volta ao rótulo original.
   */
  function criarBotaoDeCopiar(rotulo, texto, aoCopiar) {
    const botao = document.createElement('button');
    botao.textContent = rotulo;
    botao.onclick = async () => {
      aoCopiar();
      if (!(await copiarTexto(texto))) return;
      clearTimeout(botao.temporizador);
      botao.textContent = '✅ Copiado!';
      botao.classList.add('copiado');
      botao.temporizador = setTimeout(() => {
        botao.textContent = rotulo;
        botao.classList.remove('copiado');
      }, 2000);
    };
    return botao;
  }

  /** Cria um link-botão (WhatsApp, SMS) que abre em outra aba. */
  function criarBotaoDeLink(rotulo, endereco, classe, aoClicar) {
    const link = document.createElement('a');
    link.className = 'botao ' + (classe || '');
    link.textContent = rotulo;
    link.href = endereco;
    link.target = '_blank';
    link.rel = 'noopener';
    link.onclick = aoClicar;
    return link;
  }

  /** Mostra a tabela do passo 3, com os botões de envio de cada pessoa. */
  function mostrarLinksDeEnvio() {
    const { envio } = carregarEstado();
    $('sec-links').classList.toggle('oculto', !envio);
    if (!envio) return;

    const endereco = enderecoDaRevelacao();
    const enviados = envio.enviados || {};
    const corpo = $('tabela-envio');
    corpo.innerHTML = '';

    envio.itens.forEach((item, indice) => {
      const link = endereco + '#' + item.token;
      const texto = AS.mensagem(item.nome, envio.evento, link);

      const linha = document.createElement('tr');
      if (enviados[indice]) linha.className = 'enviado';
      linha.innerHTML = `<td>${escaparHtml(item.nome)}</td><td>+${escaparHtml(item.telefone)}</td><td><div class="acoes"></div></td>`;

      const marcarComoEnviado = () => {
        enviados[indice] = true;
        envio.enviados = enviados;
        salvarEstado({ envio });
        linha.className = 'enviado';
      };

      const acoes = linha.querySelector('.acoes');
      acoes.append(
        criarBotaoDeLink('WhatsApp', `https://wa.me/${item.telefone}?text=${encodeURIComponent(texto)}`, 'botao-whatsapp', marcarComoEnviado),
        criarBotaoDeLink('SMS', `sms:+${item.telefone}?&body=${encodeURIComponent(texto)}`, '', marcarComoEnviado),
        criarBotaoDeCopiar('Copiar mensagem', texto, marcarComoEnviado),
        criarBotaoDeCopiar('Copiar link', link, marcarComoEnviado),
      );
      corpo.appendChild(linha);
    });

    if (!endereco) mostrarMensagem('Preencha o <b>endereço da página de revelação</b> no passo 1. Sem ele, os links não funcionam.', 'erro');
  }

  // ===========================================================================
  // 9. BACKUP, REFAZER E COMEÇAR DO ZERO
  // ===========================================================================

  /** Baixa um arquivo com todo o estado do painel, cifrado com uma senha. */
  async function baixarBackup() {
    const senha = prompt('Crie uma senha para o backup (mínimo 6 caracteres):');
    if (!senha) return;
    if (senha.length < 6) return alert('Senha muito curta.');
    const conteudo = await AS.cifrarComSenha(carregarEstado(), senha);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/plain' }));
    link.download = 'backup-amigo-secreto.txt';
    link.click();
  }

  /** Restaura um backup escolhido pelo organizador. */
  async function restaurarBackup(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    const senha = prompt('Senha do backup:');
    if (senha) {
      try {
        const estado = await AS.decifrarComSenha(await arquivo.text(), senha);
        localStorage.setItem(CHAVE_DO_ARMAZENAMENTO, JSON.stringify(estado));
        preencherTela(estado);
        mostrarMensagem('Backup restaurado.', 'ok');
      } catch {
        mostrarMensagem('Senha incorreta ou arquivo inválido.', 'erro');
      }
    }
    evento.target.value = '';
  }

  /** Substitui a tabela pelas pessoas de um arquivo CSV. */
  async function carregarCsv(evento) {
    const arquivo = evento.target.files[0];
    if (!arquivo) return;
    const novas = AS.linhasDeTexto(await arquivo.text());
    const temDados = linhas.some(l => l.nome || l.tel || l.grupo);
    if (!temDados || confirm(`Substituir a tabela atual pelas ${novas.length} pessoas do arquivo?`)) {
      linhas = novas;
      salvarTabela();
      redesenharTabela();
      mostrarMensagem(`${novas.length} pessoa(s) carregadas do arquivo. Confira os alertas de cada linha.`, 'ok');
    }
    evento.target.value = '';
  }

  function refazerSorteio() {
    if (!confirm('Apagar o sorteio atual? Avise os participantes para ignorar os links antigos.')) return;
    salvarEstado({ envio: null });
    mostrarMensagem('');
    mostrarLinksDeEnvio();
  }

  function comecarDoZero() {
    const aviso = carregarEstado().envio
      ? 'Isso apaga o evento, a tabela e o sorteio atual (os links já enviados continuam abrindo, mas você não poderá reenviá-los). Continuar?'
      : 'Apagar o evento e a tabela para começar outro amigo secreto?';
    if (!confirm(aviso)) return;
    try { localStorage.removeItem(CHAVE_DO_ARMAZENAMENTO); } catch { /* nada salvo */ }
    location.reload();
  }

  function limparTabela() {
    if (!confirm('Apagar todos os participantes da tabela?')) return;
    linhas = [];
    gruposIgnorados = [];
    salvarTabela();
    redesenharTabela();
    mostrarMensagem('');
  }

  function adicionarPessoa() {
    linhas.push(linhaVazia());
    salvarTabela();
    redesenharTabela();
    // Foca a penúltima linha (a última é sempre a linha vazia extra).
    const campos = document.querySelectorAll('#linhas .linha input[data-campo="nome"]');
    campos[Math.max(0, campos.length - 2)].focus();
  }

  // ===========================================================================
  // 10. INICIALIZAÇÃO
  // ===========================================================================

  /** Preenche a tela inteira a partir de um estado salvo. */
  function preencherTela(estado) {
    CAMPOS_DO_EVENTO.forEach(id => { if (estado[id] != null) $(id).value = estado[id]; });
    // `estado.pessoas` era o formato de texto de versões antigas do painel.
    linhas = estado.linhas || (estado.pessoas ? AS.linhasDeTexto(estado.pessoas) : []);
    gruposIgnorados = estado.ignorados || [];
    redesenharTabela();
    mostrarLinksDeEnvio();
  }

  function iniciar() {
    try { CHAVES_ANTIGAS.forEach(chave => localStorage.removeItem(chave)); } catch { /* sem armazenamento */ }

    mostrarPatrocinadores();

    CAMPOS_DO_EVENTO.forEach(id => $(id).addEventListener('input', () => {
      salvarEstado();
      if (id === 'ev-url') mostrarLinksDeEnvio(); // o endereço muda os links
    }));
    $('btn-add').onclick = adicionarPessoa;
    $('btn-limpar').onclick = limparTabela;
    $('csv').onchange = carregarCsv;
    $('btn-sortear').onclick = sortear;
    $('btn-backup').onclick = baixarBackup;
    $('btn-refazer').onclick = refazerSorteio;
    $('arq-backup').onchange = restaurarBackup;
    $('btn-zero').onclick = comecarDoZero;

    preencherTela(carregarEstado());
  }

  iniciar();
})();
