// ================================================================
// AGRICEF — IngestaoCertidao.gs
// Lê a aba PCP da planilha "Certidão de nascimento" (mantida pelo time de
// PCP fora do AgriTrack) e propõe criação automática de projeto no Jira —
// reaproveitando criarProjetoJira/criarHaulerJira já existentes, não
// duplicando a lógica deles.
//
// Por quê: o PCP já registra todo pedido novo nessa planilha antes de
// qualquer coisa. Pedir que também criem manualmente no painel é um passo
// a mais que ninguém pediu. A ideia (do usuário, 2026-08-1x) é o AgriTrack
// ler o que já é registrado lá, em vez de exigir uma segunda entrada.
//
// Classificação (decidida junto com o usuário, linha a linha, sobre os
// 34 produtos reais da planilha — nada inferido por heurística de nome,
// porque duas tentativas de heurística erraram antes de chegarmos aqui:
// nome contendo "HAULER" não existe nos dados; nem toda linha com código
// numérico é algo que a Agricef fabrica):
//
//   400841                                          -> HAULER (PPH1+PPH2)
//   401149,401274,000422,400034,400922,401009,
//   400242,400463,400304,400919,400334,400382       -> PPP (tipo padrão)
//   qualquer outro produto                           -> IGNORADO
//     (UTV Ranger, Caminhão×6 modelos, Cabine×2 — são veículos/componentes
//      comprados prontos onde o implemento fabricado é instalado para
//      operar; não são algo que a Agricef produz, não geram projeto)
//
// Datas: a coluna mostra só DD/MM ("24/06"), mas o valor armazenado na
// célula é um Date completo com ano (confirmado via gviz antes de escrever
// este código — Date(2022,5,24)). SpreadsheetApp.getValues() devolve esse
// Date nativo direto, sem precisar inferir ano nenhum.
//
// Uso: rode inspecionarIngestaoCertidao() primeiro. Ela NÃO escreve nada —
// nem no Jira, nem na planilha. Só depois de conferir o resultado real é
// que faz sentido pensar em criação automática de verdade.
// ================================================================

var CERTIDAO_SHEET_ID_ = '1750wepASvvT0XGR7gzN91DEIVf-iEWSOd4jXNuvpDnY';
var CERTIDAO_PCP_GID_  = 893909151;

var CERTIDAO_CODIGOS_HAULER_ = ['400841'];
var CERTIDAO_CODIGOS_PPP_ = [
  '401149', '401274', '000422', '400034', '400922', '401009',
  '400242', '400463', '400304', '400919', '400334', '400382',
];

function _certidaoAbrirAba_(gid) {
  var ss = SpreadsheetApp.openById(CERTIDAO_SHEET_ID_);
  var abas = ss.getSheets();
  for (var i = 0; i < abas.length; i++) {
    if (abas[i].getSheetId() === gid) return abas[i];
  }
  throw new Error('Aba com gid ' + gid + ' não encontrada na planilha Certidão.');
}

// O cabeçalho real não está numa linha fixa (linha 1 é o título "PCP"
// mesclado). Procura dinamicamente em vez de assumir um índice — é o
// mesmo tipo de fragilidade posicional que já vimos quebrar essa planilha
// entre abas; aqui pelo menos não dependemos de "sempre na linha 3".
function _certidaoAcharCabecalho_(valores) {
  for (var i = 0; i < Math.min(valores.length, 8); i++) {
    if (/N.\s*do pedido/i.test(String(valores[i][0] || ''))) return i;
  }
  throw new Error('Cabeçalho ("Nº do pedido") não encontrado nas primeiras linhas da aba PCP.');
}

function _certidaoFmtData_(v) {
  if (!v) return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  return null; // texto solto sem ser Date não é confiável o bastante pra usar
}

function _certidaoLerLinhasPCP_() {
  var aba = _certidaoAbrirAba_(CERTIDAO_PCP_GID_);
  var valores = aba.getDataRange().getValues();
  var h = _certidaoAcharCabecalho_(valores);

  var linhas = [];
  for (var r = h + 1; r < valores.length; r++) {
    var row = valores[r];
    var pedido = String(row[0] || '').trim();
    if (!pedido) continue;
    linhas.push({
      linhaPlanilha: r + 1, // 1-based; útil se algum dia formos escrever de volta
      pedido: pedido,
      produto: String(row[1] || '').replace(/\r|\n/g, ' ').replace(/\s+/g, ' ').trim(),
      serie: String(row[2] || '').trim(),
      config: String(row[3] || '').trim(),
      inicio: _certidaoFmtData_(row[4]),
      fimPrevisto: _certidaoFmtData_(row[5]),
      entrega: _certidaoFmtData_(row[6]),
      etapa: String(row[7] || '').trim(),
      status: String(row[8] || '').trim(),
    });
  }
  return linhas;
}

function _certidaoClassificar_(produtoTexto) {
  var m = String(produtoTexto || '').trim().match(/^(\d{6})/);
  var codigo = m ? m[1] : null;
  if (codigo && CERTIDAO_CODIGOS_HAULER_.indexOf(codigo) !== -1) return { tipo: 'HAULER', codigo: codigo };
  if (codigo && CERTIDAO_CODIGOS_PPP_.indexOf(codigo) !== -1) return { tipo: 'PPP', codigo: codigo };
  return { tipo: 'IGNORADO', codigo: codigo };
}

// "8 Polegadas" / "10 Polegadas" -> 8 / 10. Qualquer outro texto (ou
// vazio) devolve null — não adivinha o diâmetro.
function _certidaoDiametro_(config) {
  var m = String(config || '').match(/(\d+)\s*Polegada/i);
  return m ? parseInt(m[1], 10) : null;
}

// Monta o payload no MESMO formato que criarProjetoJira/criarHaulerJira já
// esperam do formulário manual — para reaproveitar as funções, não
// reimplementar a criação. Nunca lança: problemas viram `bloqueios`.
function _certidaoMontarPayload_(linha, tipo) {
  var bloqueios = [];
  if (!linha.inicio) bloqueios.push('sem "Início Projeto" (ou não é uma data válida)');

  if (tipo === 'HAULER') {
    var diametro = _certidaoDiametro_(linha.config);
    if (!diametro) bloqueios.push('sem "Configuração" reconhecível como polegadas (ex: "8 Polegadas") — não dá para saber o diâmetro');
    if (!linha.serie) bloqueios.push('sem "Nº de série"');

    var dados = {
      tipo: 'HAULER',
      startDate: linha.inicio,
      alvoDate: linha.entrega,
      serial: linha.serie ? ('S' + linha.serie) : null,
      diametro: diametro,
      destino: null, // a aba PCP não traz cliente; sai sem nome de cliente no resumo
      departamento: 'PCP',
    };
    return { dados: dados, bloqueios: bloqueios,
      resumoPrevisto: dados.diametro && dados.serial
        ? 'P157 - CAMINHAO DE TUBOS HAULER ' + dados.diametro + '" - (' + dados.serial + ')  - F1/F2'
        : '(não é possível montar o resumo com os dados atuais)' };
  }

  // PPP
  var dadosPPP = {
    tipo: 'PPP',
    departamento: 'PCP',
    titulo: linha.produto,
    startDate: linha.inicio,
    dueDate: linha.fimPrevisto,
    alvoDate: linha.entrega,
  };
  if (!dadosPPP.dueDate) bloqueios.push('sem "Data Prevista Término Projeto"');
  return { dados: dadosPPP, bloqueios: bloqueios, resumoPrevisto: 'PPP - ' + linha.produto };
}

/**
 * Dry-run: lê a aba PCP inteira, classifica cada linha e monta o payload
 * que SERIA enviado a criarProjetoJira/criarHaulerJira — sem chamar essas
 * funções de verdade, sem escrever na planilha, sem tocar no Jira.
 */
function inspecionarIngestaoCertidao() {
  try {
    var linhas = _certidaoLerLinhasPCP_();
    var porTipo = { HAULER: [], PPP: [], IGNORADO: [] };

    linhas.forEach(function (linha) {
      var c = _certidaoClassificar_(linha.produto);
      var item = { pedido: linha.pedido, produto: linha.produto, serie: linha.serie, config: linha.config };
      if (c.tipo !== 'IGNORADO') {
        var m = _certidaoMontarPayload_(linha, c.tipo);
        item.dados = m.dados;
        item.bloqueios = m.bloqueios;
        item.resumoPrevisto = m.resumoPrevisto;
        item.pronto = m.bloqueios.length === 0;
      }
      porTipo[c.tipo].push(item);
    });

    var prontos = porTipo.HAULER.filter(function (i) { return i.pronto; }).length
                + porTipo.PPP.filter(function (i) { return i.pronto; }).length;
    var comBloqueio = porTipo.HAULER.filter(function (i) { return !i.pronto; }).length
                     + porTipo.PPP.filter(function (i) { return !i.pronto; }).length;

    return {
      success: true,
      totalLinhas: linhas.length,
      resumo: {
        hauler: porTipo.HAULER.length,
        ppp: porTipo.PPP.length,
        ignorado: porTipo.IGNORADO.length,
        prontosParaCriar: prontos,
        comBloqueio: comBloqueio,
      },
      hauler: porTipo.HAULER,
      ppp: porTipo.PPP,
      // amostra, não a lista inteira de ignorados — só pra conferência visual
      ignoradosAmostra: porTipo.IGNORADO.slice(0, 15).map(function (i) { return i.produto; }),
    };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}
