/**
 * Patrocinadores exibidos no painel e na página de revelação.
 *
 * Para trocar, adicionar ou remover uma marca, edite só este arquivo:
 *  - `principal`: aparece maior e primeiro (ou `null` para nenhum).
 *  - `apoiadores`: aparecem menores, lado a lado, logo abaixo (pode ficar vazio).
 *
 * Os logos ficam em img/patrocinadores/. Use imagens com fundo branco,
 * de preferência PNG com até ~550 px de largura (carregam rápido no celular).
 * Depois de trocar uma imagem, aumente a versão (?v=) nos <script>/<link> dos HTML.
 */
window.PATROCINADORES = {
  principal: { nome: 'forUshop', logo: 'img/patrocinadores/forushop.png' },
  apoiadores: [
    { nome: 'Engecid Engenharia', logo: 'img/patrocinadores/engecid.png' },
    { nome: 'Fortel', logo: 'img/patrocinadores/fortel.png' },
  ],
};
