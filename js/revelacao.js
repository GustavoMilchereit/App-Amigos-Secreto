/**
 * Página de revelação (index.html).
 *
 * 1. Lê o código depois do "#" e o decifra (js/sorteio.js).
 * 2. Mostra "Olá, <nome>!" e um presente fechado.
 * 3. Ao tocar no presente: ele treme e abre, passa a vinheta de patrocínio,
 *    o suspense ("E quem você tirou foi…") e, por fim, o nome com confete.
 *
 *  1. Utilidades
 *  2. Neve de fundo
 *  3. Confete
 *  4. Patrocinadores
 *  5. Preenchimento da página
 *  6. Sequência de abertura do presente
 *  7. Inicialização
 *
 * Depende de: js/sorteio.js (window.AmigoSecreto) e js/patrocinadores.js.
 */
(function () {
  'use strict';

  // ===========================================================================
  // 1. UTILIDADES
  // ===========================================================================

  const $ = (id) => document.getElementById(id);
  const escaparHtml = (texto) => String(texto).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /** Quem pediu ao sistema para reduzir animações vê tudo sem movimento. */
  const SEM_ANIMACAO = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Telas da página; só uma aparece por vez. */
  const TELAS = ['carregando', 'cena', 'erro', 'vazio'];
  const mostrarTela = (id) => TELAS.forEach(tela => $(tela).classList.toggle('oculto', tela !== id));

  /** Vibra o celular (só funciona no Android; no iPhone é ignorado). */
  const vibrar = (padrao) => { if (navigator.vibrate) navigator.vibrate(padrao); };

  /** Resolução dos canvas: no máximo 2x, para não pesar em celulares com tela muito densa. */
  const densidadeDaTela = () => Math.min(window.devicePixelRatio || 1, 2);

  // ===========================================================================
  // 2. NEVE DE FUNDO
  // ===========================================================================

  /** Flocos caindo devagar e balançando, desenhados num canvas atrás de tudo. */
  function iniciarNeve() {
    const canvas = $('neve');
    const contexto = canvas.getContext('2d');
    let flocos = [];

    const redimensionar = () => {
      const dpr = densidadeDaTela();
      canvas.width = innerWidth * dpr;
      canvas.height = innerHeight * dpr;
      flocos = Array.from({ length: Math.round(innerWidth / 9) }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        raio: (Math.random() * 2.2 + .6) * dpr,
        velocidade: (Math.random() * .6 + .25) * dpr,
        fase: Math.random() * Math.PI * 2,   // balanço lateral
        opacidade: Math.random() * .5 + .3,
      }));
    };

    const desenhar = () => {
      const dpr = densidadeDaTela();
      contexto.clearRect(0, 0, canvas.width, canvas.height);
      contexto.fillStyle = '#fff';
      for (const floco of flocos) {
        floco.y += floco.velocidade;
        floco.fase += .01;
        floco.x += Math.sin(floco.fase) * .3 * dpr;
        if (floco.y > canvas.height + 5) { floco.y = -5; floco.x = Math.random() * canvas.width; }
        contexto.globalAlpha = floco.opacidade;
        contexto.beginPath();
        contexto.arc(floco.x, floco.y, floco.raio, 0, Math.PI * 2);
        contexto.fill();
      }
      if (!SEM_ANIMACAO) requestAnimationFrame(desenhar);
    };

    redimensionar();
    addEventListener('resize', redimensionar);
    desenhar();
  }

  // ===========================================================================
  // 3. CONFETE
  // ===========================================================================

  const CORES_DO_CONFETE = ['#f5c542', '#ffe08a', '#e2453f', '#ffffff', '#3fae69', '#ff8fa3'];
  const QUANTIDADE_DE_CONFETES = 220;

  /**
   * Explosão de confete a partir de um ponto da tela (em pixels CSS).
   * Os papeizinhos sobem, caem com gravidade e desaparecem.
   */
  function soltarConfete(origemX, origemY) {
    if (SEM_ANIMACAO) return;
    const canvas = $('confete');
    const contexto = canvas.getContext('2d');
    const dpr = densidadeDaTela();
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;

    const papeis = Array.from({ length: QUANTIDADE_DE_CONFETES }, () => {
      const angulo = -Math.PI / 2 + (Math.random() - .5) * Math.PI * 1.1; // para cima, em leque
      const velocidade = (Math.random() * 13 + 7) * dpr;
      return {
        x: origemX * dpr, y: origemY * dpr,
        vx: Math.cos(angulo) * velocidade, vy: Math.sin(angulo) * velocidade,
        largura: (Math.random() * 8 + 5) * dpr, altura: (Math.random() * 5 + 3) * dpr,
        rotacao: Math.random() * 6, giro: (Math.random() - .5) * .4,
        cor: CORES_DO_CONFETE[Math.floor(Math.random() * CORES_DO_CONFETE.length)],
        vida: 1,
      };
    });

    const desenhar = () => {
      contexto.clearRect(0, 0, canvas.width, canvas.height);
      let restantes = 0;
      for (const papel of papeis) {
        if (papel.vida <= 0) continue;
        restantes++;
        papel.vy += .32 * dpr;          // gravidade
        papel.vx *= .985; papel.vy *= .985; // resistência do ar
        papel.x += papel.vx; papel.y += papel.vy;
        papel.rotacao += papel.giro;
        if (papel.y > canvas.height * .6) papel.vida -= .012; // some ao chegar embaixo

        contexto.save();
        contexto.globalAlpha = Math.max(papel.vida, 0);
        contexto.translate(papel.x, papel.y);
        contexto.rotate(papel.rotacao);
        contexto.scale(1, Math.cos(papel.rotacao * 2)); // efeito de papel virando
        contexto.fillStyle = papel.cor;
        contexto.fillRect(-papel.largura / 2, -papel.altura / 2, papel.largura, papel.altura);
        contexto.restore();
      }
      if (restantes) requestAnimationFrame(desenhar);
      else contexto.clearRect(0, 0, canvas.width, canvas.height);
    };
    desenhar();
  }

  // ===========================================================================
  // 4. PATROCINADORES
  // ===========================================================================

  /**
   * Coloca os logos de js/patrocinadores.js na placa da vinheta e no rodapé do
   * cartão. Devolve false se não houver patrocinador (a vinheta pula essa parte).
   */
  function mostrarPatrocinadores() {
    const { principal, apoiadores = [] } = window.PATROCINADORES || {};
    if (!principal && !apoiadores.length) return false;
    const imagem = (marca, classe = '') => `<img class="${classe}" src="${escaparHtml(marca.logo)}" alt="${escaparHtml(marca.nome)}">`;

    // Placa da vinheta: principal em cima, apoiadores menores embaixo.
    let placa = '';
    if (principal) placa += `<div class="placa-principal">${imagem(principal)}</div>`;
    if (principal && apoiadores.length) placa += '<div class="placa-separador"></div>';
    if (apoiadores.length) placa += `<div class="placa-apoiadores">${apoiadores.map(m => imagem(m)).join('')}</div>`;
    $('placa').innerHTML = placa;

    // Rodapé do cartão do resultado.
    let rodape = '<span class="cartao-patrocinio-rotulo">Oferecimento</span>';
    if (principal) rodape += imagem(principal, 'cartao-patrocinio-principal');
    if (apoiadores.length) rodape += `<div class="cartao-patrocinio-apoiadores">${apoiadores.map(m => imagem(m)).join('')}</div>`;
    $('cartao-patrocinio').innerHTML = rodape;
    return true;
  }

  // ===========================================================================
  // 5. PREENCHIMENTO DA PÁGINA
  // ===========================================================================

  /** Nome com mais de 16 letras ou com uma palavra de mais de 9 usa fonte menor. */
  const NOME_LONGO = { totalDeLetras: 16, letrasNaPalavra: 9 };

  /**
   * Escreve o nome sorteado letra por letra (cada letra entra com um pequeno
   * atraso). As letras ficam agrupadas por palavra para a linha só quebrar
   * entre palavras.
   */
  function escreverNomeSorteado(nome) {
    let posicao = 0;
    const palavras = nome.split(' ').filter(Boolean);
    $('nome').innerHTML = palavras.map(palavra => {
      const letras = Array.from(palavra).map(letra => {
        const atraso = .45 + (posicao++) * .06;
        return `<span style="animation-delay:${atraso}s, ${atraso}s">${escaparHtml(letra)}</span>`;
      }).join('');
      return `<span class="palavra">${letras}</span>`;
    }).join(' ');

    const maiorPalavra = Math.max(...palavras.map(p => p.length));
    if (maiorPalavra > NOME_LONGO.letrasNaPalavra || nome.length > NOME_LONGO.totalDeLetras) $('nome').classList.add('longo');
  }

  /** Preenche a página com o conteúdo decifrado do link. */
  function preencherPagina(dados) {
    const nomeDoEvento = `🎄 ${dados.e || 'Amigo Secreto'} 🎄`;
    document.title = `🎁 ${dados.n}, seu amigo secreto chegou!`;
    $('evento').textContent = nomeDoEvento;
    $('grupo').textContent = nomeDoEvento;
    $('ola').textContent = dados.n;

    // Data, local e valor (só os que foram preenchidos).
    [['📅', dados.d], ['📍', dados.l], ['💰', dados.v]].forEach(([emoji, texto]) => {
      if (!texto) return;
      const etiqueta = document.createElement('span');
      etiqueta.textContent = `${emoji} ${texto}`;
      $('infos').appendChild(etiqueta);
    });

    escreverNomeSorteado(dados.a);
  }

  // ===========================================================================
  // 6. SEQUÊNCIA DE ABERTURA DO PRESENTE
  // ===========================================================================
  // Tempos em milissegundos. Os da vinheta contam a partir do momento em que o
  // presente abre (depois de tremer).

  const TEMPOS = {
    tremer: 900,           // o presente treme antes de abrir
    esconderCabecalho: 450,
    mostrarVinheta: 500,   // a vinheta de patrocínio entra
    suspense: 3800,        // troca para "E quem você tirou foi…"
    revelar: 5500,         // aparece o nome
  };
  /** Sem patrocinadores, a vinheta vai direto para o suspense. */
  const TEMPOS_SEM_PATROCINIO = { mostrarVinheta: 500, suspense: 500, revelar: 2200 };
  /** Com animações reduzidas, tudo acontece rápido. */
  const TEMPOS_SEM_ANIMACAO = { tremer: 0, mostrarVinheta: 0, suspense: 2200, revelar: 2800 };

  /** Prepara o toque no presente e o toque para pular a vinheta. */
  function prepararAbertura(temPatrocinio) {
    const app = $('app');
    const vinheta = $('vinheta');
    const tempos = { ...TEMPOS, ...(temPatrocinio ? {} : TEMPOS_SEM_PATROCINIO), ...(SEM_ANIMACAO ? TEMPOS_SEM_ANIMACAO : {}) };
    const temporizadores = [];
    const agendar = (atraso, acao) => temporizadores.push(setTimeout(acao, atraso));
    let jaAbriu = false;
    let jaRevelou = false;

    /** Último passo: some a vinheta, aparece o cartão e explode o confete. */
    const revelar = () => {
      if (jaRevelou) return;
      jaRevelou = true;
      temporizadores.forEach(clearTimeout); // se a pessoa pulou, cancela o resto
      vinheta.classList.remove('on', 'suspense');
      app.classList.add('final', 'revelado');
      requestAnimationFrame(() => {
        const cartao = document.querySelector('.cartao').getBoundingClientRect();
        soltarConfete(innerWidth / 2, Math.max(120, cartao.top + 40));
      });
      vibrar(120);
    };

    $('presente').onclick = () => {
      if (jaAbriu) return;
      jaAbriu = true;
      app.classList.add('abrindo');
      vibrar([30, 40, 30, 40, 60]);

      agendar(tempos.tremer, () => {
        app.classList.remove('abrindo');
        app.classList.add('aberto');
        agendar(tempos.esconderCabecalho, () => app.classList.add('final'));
        agendar(tempos.mostrarVinheta, () => vinheta.classList.add('on'));
        agendar(tempos.suspense, () => {
          vinheta.classList.add('suspense');
          vibrar([40, 80, 40, 80, 40, 80, 40, 80]); // "rufar de tambor"
        });
        agendar(tempos.revelar, revelar);
      });
    };

    vinheta.onclick = revelar; // tocar na vinheta pula direto para o nome
  }

  /** Botão para desfocar o nome quando alguém se aproxima. */
  function prepararBotaoEsconder() {
    $('esconder').onclick = () => {
      const escondido = $('nome').classList.toggle('escondido');
      $('esconder').textContent = escondido ? '👀 Mostrar nome' : '🙈 Esconder nome';
    };
  }

  // ===========================================================================
  // 7. INICIALIZAÇÃO
  // ===========================================================================

  async function iniciar() {
    iniciarNeve();

    const codigo = location.hash.slice(1);
    if (!codigo) return mostrarTela('vazio');

    let dados;
    try {
      dados = await window.AmigoSecreto.abrir(codigo);
    } catch {
      return mostrarTela('erro'); // link cortado, alterado ou inventado
    }

    preencherPagina(dados);
    const temPatrocinio = mostrarPatrocinadores();
    prepararAbertura(temPatrocinio);
    prepararBotaoEsconder();
    mostrarTela('cena');
  }

  iniciar();
})();
