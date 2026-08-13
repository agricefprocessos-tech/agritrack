// ================================================================
// AGRICEF — HaulerAnalise.gs
// Núcleo canônico de análise (série, código, data, coluna) + endpoints
// que cruzam BOM × Compras × Apontamentos.
//
// Por que este arquivo existe: as mesmas regras estavam implementadas
// três vezes com comportamentos diferentes — no painel
// (agritrack_dashboard.html) e em
// buscarHaulerDadosCompletos(). Cada cópia errava de um jeito. Aqui
// elas passam a existir uma vez só, e o painel só renderiza.
//
// Depende de: jiraRequest_(), buscarHaulerBOM() (FormPCP.js)
// ================================================================

// ─── NORMALIZAÇÃO DE TEXTO ────────────────────────────────────────
// Mesma abordagem de classifyOp_() em FormPCP.js: troca explícita em
// vez de normalize('NFD'), que já é sabido funcionar neste runtime.
function _semAcento_(s) {
  return String(s == null ? '' : s)
    .replace(/[àáâãäÀÁÂÃÄ]/g, 'a')
    .replace(/[èéêëÈÉÊË]/g, 'e')
    .replace(/[ìíîïÌÍÎÏ]/g, 'i')
    .replace(/[òóôõöÒÓÔÕÖ]/g, 'o')
    .replace(/[ùúûüÙÚÛÜ]/g, 'u')
    .replace(/[çÇ]/g, 'c')
    .replace(/[ñÑ]/g, 'n');
}

function _norm_(s) {
  return _semAcento_(s).toLowerCase().trim();
}

// ─── SÉRIE (220XXXXX) ─────────────────────────────────────────────
// Substitui as 3 implementações divergentes. Duas regras importantes:
//
// 1. A varredura é por caractere, não por \b220\d{5}\b — assim
//    "S22000080" (formato usado no Jira e digitado nas colunas livres
//    da planilha) é reconhecido, em vez de virar [].
//
// 2. A notação abreviada ("22000086, 87 e 88" = 3 Haulers) só expande
//    quando o número curto vem logo depois de um separador de lista.
//    A versão antiga aceitava qualquer número de 2-3 dígitos no texto,
//    o que transformava a polegada de 'HAULER 10"' na série 22000010 e
//    'SAFRA 25&26' nas séries 22000025 e 22000026.
var _SEP_LISTA_ = /^\s*(?:,|\/|\+|\s+e\s+)\s*(\d{2,3})(?![\d"'%°º\w])/i;

function _parseSeriais_(texto) {
  var t = String(texto == null ? '' : texto).trim();
  if (!t) return [];

  // "estoque" e "sc" não são pedidos de um Hauler específico
  var low = t.toLowerCase();
  if (low.indexOf('estoque') !== -1 || low === 'sc') return [];

  var achados = [];
  var ultimoFim = -1;
  for (var i = 0; i <= t.length - 8; i++) {
    if (t.charAt(i) !== '2' || t.charAt(i + 1) !== '2' || t.charAt(i + 2) !== '0') continue;
    var cand = t.substr(i, 8);
    var ok = true;
    for (var j = 3; j < 8; j++) {
      var c = cand.charCodeAt(j);
      if (c < 48 || c > 57) { ok = false; break; }
    }
    if (!ok) continue;
    // Evita casar um trecho de um número maior (ex.: 9922000086123)
    var antes = i > 0 ? t.charAt(i - 1) : '';
    var depois = i + 8 < t.length ? t.charAt(i + 8) : '';
    if (/\d/.test(antes) || /\d/.test(depois)) continue;
    if (achados.indexOf(cand) === -1) achados.push(cand);
    ultimoFim = i + 8;
  }
  if (!achados.length) return [];

  // Expansão abreviada, encadeada a partir da última série por extenso.
  var base = achados[achados.length - 1];
  var prefixo = base.substring(0, 5);
  var resto = t.substring(ultimoFim);
  var m;
  while ((m = resto.match(_SEP_LISTA_)) !== null) {
    var serie = prefixo + _padEsq_(m[1], 3);
    if (/^220\d{5}$/.test(serie) && achados.indexOf(serie) === -1) achados.push(serie);
    resto = resto.substring(m[0].length);
  }
  return achados;
}

function _padEsq_(s, n) {
  var out = String(s);
  while (out.length < n) out = '0' + out;
  return out;
}

// ─── CÓDIGO DE PEÇA ───────────────────────────────────────────────
// Os códigos do BOM são de 6 dígitos, mas aparecem em três formas:
// "000059", "59" (zeros comidos pela planilha) e "201057 - PORCA" /
// "201421-A" (variantes de uma mesma peça). A versão antiga só tirava
// zeros à esquerda, então as 55 variantes com sufixo nunca cruzavam
// com uma compra lançada como "201057" e ficavam eternamente
// "descobertas". Aqui o código base é a chave e o sufixo fica de lado
// para desempate por descrição.
function _normCod_(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return { cod: '', sufixo: '', risco: null };

  var m = s.match(/^\s*(\d+)\s*(.*)$/);
  if (!m) {
    // Não começa com dígito — devolve opaco em vez de inventar um código
    return { cod: _semAcento_(s).toUpperCase(), sufixo: '', risco: 'formato' };
  }
  var digitos = m[1];
  var sufixo = m[2].replace(/^[\s\-_.]+/, '').trim().toUpperCase();
  var cod = digitos.length <= 6 ? _padEsq_(digitos, 6) : digitos;
  return {
    cod: cod,
    sufixo: _semAcento_(sufixo),
    risco: digitos.length > 6 ? 'digitos' : null,
  };
}

// ─── DATA ─────────────────────────────────────────────────────────
// Substitui parseDate() do painel, que tinha 4 defeitos: exigia dia e
// mês com 2 dígitos (3/7/2026 caía no parser americano e virava 7 de
// março), devolvia null para ano de 2 dígitos, perdia um dia em datas
// ISO (UTC → local) e lançava exceção se a célula viesse como número.
// Tudo é ancorado ao meio-dia local para não escorregar de fuso.
function _parseData_(v) {
  try {
    if (v == null || v === '') return null;

    if (v instanceof Date) {
      if (isNaN(v.getTime())) return null;
      return new Date(v.getFullYear(), v.getMonth(), v.getDate(), 12, 0, 0);
    }

    // Serial de data do Sheets (dias desde 1899-12-30)
    if (typeof v === 'number' && isFinite(v)) {
      if (v <= 0 || v > 80000) return null;
      var base = new Date(1899, 11, 30, 12, 0, 0);
      base.setDate(base.getDate() + Math.floor(v));
      return base;
    }

    var s = String(v).trim();
    if (!s || s === 'NaT' || s.toLowerCase() === 'nan') return null;

    // ISO (com ou sem hora) — precisa vir ANTES do teste dd/mm, senão a
    // regex de barra casa no meio de "2026-07-13" e lê dia 26, ano 2013.
    var iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      var mIso = parseInt(iso[2], 10), dIso = parseInt(iso[3], 10);
      if (mIso < 1 || mIso > 12 || dIso < 1 || dIso > 31) return null;
      var dtIso = new Date(parseInt(iso[1], 10), mIso - 1, dIso, 12, 0, 0);
      return isNaN(dtIso.getTime()) ? null : dtIso;
    }

    // dd/mm/aaaa, d/m/aaaa, d/m/aa
    var br = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (br) {
      var d = parseInt(br[1], 10), mo = parseInt(br[2], 10), y = parseInt(br[3], 10);
      if (y < 100) y += 2000;
      if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
      var dt = new Date(y, mo - 1, d, 12, 0, 0);
      return isNaN(dt.getTime()) ? null : dt;
    }

    return null;
  } catch (e) {
    return null;
  }
}

function _fmtIso_(dt) {
  if (!dt) return '';
  var mo = dt.getMonth() + 1, d = dt.getDate();
  return dt.getFullYear() + '-' + (mo < 10 ? '0' + mo : mo) + '-' + (d < 10 ? '0' + d : d);
}

// ─── COLUNA POR PALAVRA-CHAVE ─────────────────────────────────────
// Porte de findCol() (FormPCP.js), que já itera os candidatos por fora
// — ou seja, respeita a ordem de prioridade. O cmpKey() do painel
// itera os headers por fora, então devolvia "DATA DESEJADA" quando se
// pedia "PREVISÃO ENTREGA" só porque essa coluna vinha antes na
// planilha. A comparação aqui também ignora acento, o que faz
// 'serie' finalmente casar com o header "SÉRIE".
function _acharColuna_(headers, candidatos) {
  for (var ci = 0; ci < candidatos.length; ci++) {
    var alvo = _norm_(candidatos[ci]);
    if (!alvo) continue;
    for (var hi = 0; hi < headers.length; hi++) {
      if (_norm_(headers[hi]).indexOf(alvo) !== -1) return hi;
    }
  }
  return -1;
}

// ─── CSV DO BOM ───────────────────────────────────────────────────
// NÃO usar Utilities.parseCsv aqui. Ele segue RFC 4180 à risca, tratando
// qualquer aspa como delimitador — e este arquivo usa aspas como marca de
// polegada no meio do texto ('CONJUNTO MECANISMO PRINCIPAL (10")',
// 'GRAMPO Ø1/8"'). Com o parser estrito, ~metade das linhas some (829 de
// 1633 no teste). O painel acerta porque o PapaParse só honra aspas
// quando elas ABREM o campo — o arquivo tem exatamente um campo assim
// ("Espessura@Peça2.SLDPRT"). Esta função replica essa semântica.
function _csvLinhas_(txt, delim) {
  var linhas = [], campo = '', linha = [];
  var emAspas = false, inicioCampo = true;
  for (var i = 0; i < txt.length; i++) {
    var c = txt.charAt(i);
    if (emAspas) {
      if (c === '"') {
        if (txt.charAt(i + 1) === '"') { campo += '"'; i++; }
        else emAspas = false;
      } else campo += c;
      continue;
    }
    if (inicioCampo && c === '"') { emAspas = true; inicioCampo = false; continue; }
    if (c === delim) { linha.push(campo); campo = ''; inicioCampo = true; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; inicioCampo = true; continue; }
    if (c === '\r') continue;
    campo += c;           // aspa aqui dentro é polegada, não delimitador
    inicioCampo = false;
  }
  if (campo !== '' || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function _lerCsvBom_(fileId) {
  var r = buscarHaulerBOM({ fileId: fileId });
  if (!r || !r.success) throw new Error('CSV do BOM: ' + ((r && r.erro) || 'falha ao baixar'));
  var txt = r.csv || '';
  if (txt.charCodeAt(0) === 0xFEFF) txt = txt.slice(1);
  var linhas = _csvLinhas_(txt, ';');
  if (!linhas || linhas.length < 2) throw new Error('CSV do BOM vazio ou ilegível');
  return linhas;
}

// Colunas do BOM, resolvidas por palavra-chave (o header do Nível vem
// com BOM mark colado, então comparação exata falharia).
function _colunasBom_(headers) {
  return {
    nivel:       _acharColuna_(headers, ['nivel', 'nível']),
    qtd:         _acharColuna_(headers, ['qntde', 'quantidade', 'qtd']),
    codigo:      _acharColuna_(headers, ['codigo', 'código']),
    desc:        _acharColuna_(headers, ['descricao', 'descrição']),
    montagem:    _acharColuna_(headers, ['montagem']),
    corteChapa:  _acharColuna_(headers, ['corte chapa']),
    cortePerfil: _acharColuna_(headers, ['corte perfil']),
    soldagem:    _acharColuna_(headers, ['soldagem']),
    usinagem:    _acharColuna_(headers, ['usinagem']),
    comercial:   _acharColuna_(headers, ['item comercial']),
    fabricante:  _acharColuna_(headers, ['fabricante']),
    estado:      _acharColuna_(headers, ['estado']),
  };
}

function _celula_(linha, idx) {
  if (idx < 0 || idx >= linha.length) return '';
  return String(linha[idx] == null ? '' : linha[idx]).trim();
}

// Mesmas regras de classificarHauler() do painel. Um campo preenchido
// com "." conta como vazio — é assim que a planilha marca "não se aplica".
function _classificarLinha_(linha, C) {
  var preenchido = function (idx) {
    var v = _celula_(linha, idx);
    return v && v !== '.';
  };
  var tipos = [];
  var comercial = _celula_(linha, C.comercial).toUpperCase();
  var estado = _celula_(linha, C.estado);
  if (comercial === 'SIM' || _norm_(estado) === 'itens comerciais') tipos.push('comprar');
  if (preenchido(C.cortePerfil)) tipos.push('serra');
  if (preenchido(C.corteChapa)) tipos.push('corte');
  if (preenchido(C.soldagem)) tipos.push('solda');
  if (preenchido(C.usinagem)) tipos.push('usinagem');
  if (_celula_(linha, C.montagem).toUpperCase() === 'MONTAGEM') tipos.push('montagem');
  return tipos.length ? tipos : ['misto'];
}

// Regra de negócio já usada no painel: usinagem e corte são terceirizados,
// então contam como "vem de fora" junto com os itens comerciais.
function _ehExterno_(tipos) {
  return tipos.indexOf('comprar') !== -1
      || tipos.indexOf('usinagem') !== -1
      || tipos.indexOf('corte') !== -1;
}

/**
 * Lê, classifica e agrega o BOM do Hauler.
 * Corrige a quantidade por código: o painel usava Object.fromEntries, então
 * a última linha vencia — o código 000059 aparece 15 vezes e exige 618
 * unidades somadas, mas era exibido como 132.
 */
function analisarHaulerBOM(dados) {
  try {
    dados = dados || {};
    if (!dados.fileId) return { success: false, erro: 'fileId nao informado' };

    var linhas = _lerCsvBom_(dados.fileId);
    var headers = linhas[0].map(function (h) { return String(h || '').replace(/﻿/g, '').trim(); });
    var C = _colunasBom_(headers);
    if (C.codigo < 0) return { success: false, erro: 'Coluna CODIGO nao encontrada no CSV' };

    var itens = [];          // linha a linha, para a tabela
    var agregado = {};       // código canônico -> exigência somada
    var variantes = {};      // código base -> variantes com sufixo
    var avisos = [];
    var formatos = [];

    // 1ª passada: quantidade de cada nível, para explodir a estrutura.
    // O BOM é multinível e QNTDE é "por conjunto pai", não o total do Hauler.
    // 87 dos 236 conjuntos-pai têm quantidade > 1, então somar as linhas cruas
    // subestima: o código 000059 dá 618 somado e 962 explodido.
    var qtdPorNivel = {};
    for (var k = 1; k < linhas.length; k++) {
      var nvK = _celula_(linhas[k], C.nivel).replace(/\s+/g, '');
      if (nvK) qtdPorNivel[nvK] = parseFloat(_celula_(linhas[k], C.qtd).replace(',', '.')) || 0;
    }
    var fatorDoNivel = function (nv) {
      var partes = nv.split('.'), f = 1;
      for (var a = 1; a < partes.length; a++) {
        var anc = partes.slice(0, a).join('.');
        if (qtdPorNivel[anc] !== undefined && qtdPorNivel[anc] > 0) f *= qtdPorNivel[anc];
      }
      return f;
    };

    for (var i = 1; i < linhas.length; i++) {
      var L = linhas[i];
      var nivel = _celula_(L, C.nivel).replace(/\s+/g, '');
      var codRaw = _celula_(L, C.codigo);
      var desc = _celula_(L, C.desc);
      if (!nivel && !codRaw && !desc) continue;

      var n = _normCod_(codRaw);
      var tipos = _classificarLinha_(L, C);
      var qtd = parseFloat(_celula_(L, C.qtd).replace(',', '.')) || 0;

      itens.push([
        nivel,
        nivel ? nivel.split('.').length - 1 : 0,
        n.cod,
        n.sufixo,
        desc,
        qtd,
        tipos.join(','),
        _celula_(L, C.fabricante),
        _celula_(L, C.estado),
      ]);

      if (!n.cod) continue;
      if (n.risco === 'formato' && formatos.indexOf(codRaw) === -1) formatos.push(codRaw);

      if (!agregado[n.cod]) {
        agregado[n.cod] = { qtd: 0, qtdLinhas: 0, ocorrencias: 0, desc: desc, tipos: [], externo: false };
      }
      var a = agregado[n.cod];
      a.qtd += qtd * fatorDoNivel(nivel);   // exigência real por Hauler
      a.qtdLinhas += qtd;                   // soma crua, para conferência
      a.ocorrencias++;
      if (!a.desc && desc) a.desc = desc;
      if (_ehExterno_(tipos)) a.externo = true;
      for (var t = 0; t < tipos.length; t++) {
        if (a.tipos.indexOf(tipos[t]) === -1) a.tipos.push(tipos[t]);
      }

      if (!variantes[n.cod]) variantes[n.cod] = [];
      var jaTem = false;
      for (var v = 0; v < variantes[n.cod].length; v++) {
        if (variantes[n.cod][v].sufixo === n.sufixo) { jaTem = true; break; }
      }
      if (!jaTem) variantes[n.cod].push({ sufixo: n.sufixo, desc: desc, qtd: qtd });
    }

    // Só interessa reportar os códigos base que têm mais de uma variante —
    // são os que exigem desempate por descrição ao cruzar com compras.
    var comVariantes = {};
    var nVariantes = 0;
    Object.keys(variantes).forEach(function (cod) {
      if (variantes[cod].length > 1) { comVariantes[cod] = variantes[cod]; nVariantes++; }
    });
    if (nVariantes > 0) {
      avisos.push({
        tipo: 'variantes',
        n: nVariantes,
        msg: nVariantes + ' código(s) base com mais de uma variante (ex.: 201057 / 201057 - PORCA). '
           + 'A compra lançada no código base é atribuída por descrição; sem descrição compatível, '
           + 'fica no código base e é sinalizada.',
      });
    }
    if (formatos.length) {
      avisos.push({
        tipo: 'formato',
        n: formatos.length,
        exemplos: formatos.slice(0, 5),
        msg: formatos.length + ' código(s) não numérico(s) — ficam fora do cruzamento com compras.',
      });
    }

    return {
      success: true,
      geradoEm: new Date().toISOString(),
      cols: ['nivel', 'depth', 'cod', 'sufixo', 'desc', 'qtd', 'tipos', 'fabricante', 'estado'],
      rows: itens,
      agregado: agregado,
      variantes: comVariantes,
      avisos: avisos,
      totais: {
        linhas: itens.length,
        codigosDistintos: Object.keys(agregado).length,
      },
    };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}

// ─── COMPRAS: LEITURA CANÔNICA DAS 3 ABAS ─────────────────────────
var COMPRAS_ID_ = '16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A';

// Só estas 3 abas são válidas; as demais da planilha são rascunho.
var ABAS_COMPRAS_ = [
  { nomes: ['Solicitações', 'Solicitacoes'], fonte: 'solicitado' },
  { nomes: ['FUP online', 'FUP Online', 'FUP'], fonte: 'pedido' },
  { nomes: ['Pedidos Concluídos', 'Pedidos Concluidos', 'Concluidos'], fonte: 'entregue' },
];

function _lerAbasCompras_() {
  var ss = SpreadsheetApp.openById(COMPRAS_ID_);
  var linhas = [], diag = [];

  ABAS_COMPRAS_.forEach(function (def) {
    var sh = null;
    for (var i = 0; i < def.nomes.length && !sh; i++) sh = ss.getSheetByName(def.nomes[i]);
    if (!sh) { diag.push('Aba não encontrada: ' + def.nomes[0]); return; }
    var ultima = sh.getLastRow();
    if (ultima < 2) { diag.push('Aba vazia: ' + def.nomes[0]); return; }

    var dados = sh.getRange(1, 1, ultima, sh.getLastColumn()).getValues();
    var H = dados[0].map(function (h) { return String(h == null ? '' : h).trim(); });

    var iPv     = _acharColuna_(H, ['pv']);
    var iCod    = _acharColuna_(H, ['cod. agricef', 'cod agricef', 'codigo agricef', 'cod. agri', 'cod agri', 'codigo', 'cod mat']);
    var iQtd    = _acharColuna_(H, ['qtd', 'quant']);
    var iStatus = _acharColuna_(H, ['status', 'situacao', 'conclu']);
    var iPedido = _acharColuna_(H, ['pedido']);
    var iDesc   = _acharColuna_(H, ['descricao', 'item', 'produto']);
    var iForn   = _acharColuna_(H, ['fornecedor']);
    var iEnt    = _acharColuna_(H, ['data da entrega', 'entrega efet', 'efetiv', 'entrega real']);
    var iAtu    = _acharColuna_(H, ['entrega atualizada', 'data entrega atu', 'entrega atu', 'atualiz']);
    var iPrev   = _acharColuna_(H, ['previsao entrega', 'prev. entrega', 'previsao']);

    // Colunas de texto livre onde a série às vezes é anotada em vez do PV.
    var iAlt = [];
    ['observacao', 'observacoes', 'conjunto', 'apelido', 'finalidade'].forEach(function (kw) {
      var idx = _acharColuna_(H, [kw]);
      if (idx >= 0 && iAlt.indexOf(idx) === -1) iAlt.push(idx);
    });

    // O cabeçalho da coluna A da aba "Pedidos Concluídos" está vazio na
    // planilha viva (deveria ser "PV"), o que descartaria as ~1000 linhas de
    // entregas. O painel já contorna isso com findKey('pv')||headers[0]; aqui
    // vale o mesmo: sem header de PV, o PV é a primeira coluna.
    if (iPv < 0) {
      iPv = 0;
      diag.push('Aba ' + def.nomes[0] + ': cabeçalho da coluna PV vazio — assumindo a 1ª coluna. '
              + 'Vale corrigir o cabeçalho na planilha.');
    }
    if (iCod < 0) { diag.push('Aba ' + def.nomes[0] + ': coluna CÓDIGO ausente — aba ignorada'); return; }

    for (var r = 1; r < dados.length; r++) {
      var L = dados[r];
      var codRaw = String(L[iCod] == null ? '' : L[iCod]).trim();
      if (!codRaw) continue;

      // Série: primeiro o PV; se não houver, as colunas de texto livre.
      var seriais = _parseSeriais_(L[iPv]);
      if (!seriais.length && iAlt.length) {
        var combinado = iAlt.map(function (ix) { return String(L[ix] == null ? '' : L[ix]); }).join(' ');
        seriais = _parseSeriais_(combinado);
      }
      if (!seriais.length) continue;

      var n = _normCod_(codRaw);
      if (!n.cod) continue;

      linhas.push({
        seriais: seriais,
        cod: n.cod,
        sufixo: n.sufixo,
        qtd: parseFloat(String(L[iQtd] == null ? '' : L[iQtd]).replace(',', '.')) || 0,
        desc: iDesc >= 0 ? String(L[iDesc] == null ? '' : L[iDesc]).trim() : '',
        status: iStatus >= 0 ? String(L[iStatus] == null ? '' : L[iStatus]).trim() : '',
        pedido: iPedido >= 0 ? String(L[iPedido] == null ? '' : L[iPedido]).trim() : '',
        fornecedor: iForn >= 0 ? String(L[iForn] == null ? '' : L[iForn]).trim() : '',
        dataEnt: iEnt >= 0 ? _fmtIso_(_parseData_(L[iEnt])) : '',
        dataPrev: iPrev >= 0 ? _fmtIso_(_parseData_(L[iPrev]))
                             : (iAtu >= 0 ? _fmtIso_(_parseData_(L[iAtu])) : ''),
        fonte: def.fonte,
      });
    }
  });

  return { linhas: linhas, diag: diag };
}

// Escolhe a variante ('', 'PORCA', 'CORPO'…) que a compra atende.
// 15 dos 16 códigos-base com variante existem TAMBÉM como linha própria no
// BOM, então atribuir a compra ao base sem olhar a descrição seria um chute.
// Devolve {sufixo, ambiguo} — ambiguo=true vira aviso no painel.
function _escolherVariante_(descCompra, variantes) {
  if (!variantes || variantes.length <= 1) return { sufixo: '', ambiguo: false };
  var d = _norm_(descCompra);
  if (!d) return { sufixo: '', ambiguo: true };

  // 1) o sufixo aparece literalmente na descrição da compra
  for (var i = 0; i < variantes.length; i++) {
    var suf = _norm_(variantes[i].sufixo);
    if (suf && d.indexOf(suf) !== -1) return { sufixo: variantes[i].sufixo, ambiguo: false };
  }
  // 2) maior sobreposição de palavras com a descrição da variante no BOM
  var melhor = null, melhorScore = 0;
  var tokens = d.split(/[^a-z0-9]+/).filter(function (t) { return t.length > 2; });
  for (var v = 0; v < variantes.length; v++) {
    var dv = _norm_(variantes[v].desc);
    if (!dv) continue;
    var score = 0;
    for (var t = 0; t < tokens.length; t++) if (dv.indexOf(tokens[t]) !== -1) score++;
    if (score > melhorScore) { melhorScore = score; melhor = variantes[v]; }
  }
  if (melhor && melhorScore >= 2) return { sufixo: melhor.sufixo, ambiguo: false };
  return { sufixo: '', ambiguo: true };
}

/**
 * Cruza BOM × Compras por série.
 * Duas correções sobre o painel: a série passa a ser lida também das colunas
 * de texto livre (antes só do PV, e "S22000080" nem era reconhecido), e a
 * cobertura compara QUANTIDADE entregue contra a exigida — antes bastava
 * 1 peça de 618 para o código contar como "entregue".
 */
function analisarHaulerSerial(dados) {
  try {
    dados = dados || {};
    var props = PropertiesService.getScriptProperties();
    // O painel guarda o id do BOM no localStorage do navegador, que o servidor
    // não enxerga. Persistir o último id usado é o que permite ao gatilho de
    // aquecimento (Aquecimento.js) saber qual BOM recalcular sozinho.
    if (dados.fileId) props.setProperty('HAULER_BOM_FILE_ID', dados.fileId);
    var fileId = dados.fileId || props.getProperty('HAULER_BOM_FILE_ID');
    if (!fileId) return { success: false, erro: 'fileId nao informado' };

    // Ler o CSV do BOM + as 3 abas leva ~80s, então o resultado fica em
    // cache por 1h. Cache fatiado
    // porque CacheService limita ~100KB por chave.
    var CK = 'analise_serial_v3_' + String(fileId).slice(-10);
    if (!dados.force) {
      var doCache = _lerCache_(CK);
      if (doCache) {
        doCache.fromCache = true;
        if (dados.serial) doCache.detalhe = _lerCache_(CK + '_det_' + dados.serial) || null;
        return doCache;
      }
    }

    var bom = analisarHaulerBOM({ fileId: fileId });
    if (!bom.success) return bom;

    var compras = _lerAbasCompras_();
    var avisos = [];
    var ambiguos = [];

    // Índice: série -> código -> quantidades
    var idx = {};
    compras.linhas.forEach(function (l) {
      // Um PV que cobre N Haulers rateia a quantidade entre eles (mesma
      // regra herdada do buscarComprasPorSerial, removido por desuso).
      var qtdPorSerie = l.seriais.length > 1 ? l.qtd / l.seriais.length : l.qtd;
      var variantes = bom.variantes[l.cod];
      var esc = _escolherVariante_(l.desc, variantes);
      if (esc.ambiguo && ambiguos.indexOf(l.cod) === -1) ambiguos.push(l.cod);

      l.seriais.forEach(function (s) {
        if (!idx[s]) idx[s] = {};
        if (!idx[s][l.cod]) {
          idx[s][l.cod] = {
            solicitada: 0, pedida: 0, entregue: 0,
            desc: l.desc, pedido: l.pedido, fornecedor: l.fornecedor,
            dataEnt: '', dataPrev: '', status: l.status, fontes: [],
          };
        }
        var e = idx[s][l.cod];
        if (l.fonte === 'entregue') e.entregue += qtdPorSerie;
        else if (l.fonte === 'pedido') e.pedida += qtdPorSerie;
        else e.solicitada += qtdPorSerie;
        if (!e.desc && l.desc) e.desc = l.desc;
        if (!e.pedido && l.pedido) e.pedido = l.pedido;
        if (!e.fornecedor && l.fornecedor) e.fornecedor = l.fornecedor;
        if (!e.dataEnt && l.dataEnt) e.dataEnt = l.dataEnt;
        if (!e.dataPrev && l.dataPrev) e.dataPrev = l.dataPrev;
        if (!e.status && l.status) e.status = l.status;
        if (e.fontes.indexOf(l.fonte) === -1) e.fontes.push(l.fonte);
      });
    });

    // Denominador: os códigos que vêm de fora (comprar/usinagem/corte),
    // com a quantidade SOMADA de todas as ocorrências no BOM.
    var exigidos = [];
    Object.keys(bom.agregado).forEach(function (cod) {
      var a = bom.agregado[cod];
      if (a.externo && a.qtd > 0) exigidos.push({ cod: cod, qtd: a.qtd, desc: a.desc });
    });

    var porSerial = {}, detalhePorSerial = {};
    Object.keys(idx).forEach(function (serial) {
      var itens = idx[serial];
      var nEnt = 0, nParcial = 0, nPed = 0, nSol = 0, nDesc = 0;
      var somaExigida = 0, somaAtendida = 0;
      var detalhes = [];

      exigidos.forEach(function (ex) {
        var e = itens[ex.cod];
        somaExigida += ex.qtd;
        var entregue = e ? e.entregue : 0;
        somaAtendida += Math.min(entregue, ex.qtd);

        // Um item percorre as 3 abas: nasce em Solicitações, vai para FUP
        // quando o pedido sai, e cai em Pedidos Concluídos quando chega — e
        // pode constar em mais de uma ao mesmo tempo. O estágio é o mais
        // avançado em que ele aparece, decidido pela PRESENÇA na aba (fontes)
        // e não por a quantidade ser > 0: uma célula de QTD vazia ou ilegível
        // não pode fazer um item já pedido voltar a "descoberto".
        var estado;
        if (!e) { estado = 'descoberto'; nDesc++; }
        else if (e.fontes.indexOf('entregue') !== -1) {
          if (entregue >= ex.qtd && entregue > 0) { estado = 'entregue'; nEnt++; }
          else { estado = 'parcial'; nParcial++; }
        }
        else if (e.fontes.indexOf('pedido') !== -1) { estado = 'pedido'; nPed++; }
        else if (e.fontes.indexOf('solicitado') !== -1) { estado = 'solicitado'; nSol++; }
        else { estado = 'descoberto'; nDesc++; }

        detalhes.push({
          cod: ex.cod, desc: ex.desc || (e ? e.desc : ''), estado: estado,
          exigida: ex.qtd, entregue: entregue,
          pedida: e ? e.pedida : 0, solicitada: e ? e.solicitada : 0,
          pedido: e ? e.pedido : '', fornecedor: e ? e.fornecedor : '',
          dataEnt: e ? e.dataEnt : '', dataPrev: e ? e.dataPrev : '',
        });
      });

      // Comprado para este serial mas fora do BOM
      var extras = [];
      Object.keys(itens).forEach(function (cod) {
        if (!bom.agregado[cod] || !bom.agregado[cod].externo) {
          extras.push({ cod: cod, desc: itens[cod].desc, entregue: itens[cod].entregue });
        }
      });

      // Resumo (leve) e detalhe (pesado) ficam separados: 663 itens × 13
      // séries são ~8.600 objetos, grande demais para caber no CacheService
      // e desnecessário para desenhar os cartões. O painel pede o detalhe
      // só no drill-down de uma série.
      porSerial[serial] = {
        serial: serial,
        nEntregue: nEnt, nParcial: nParcial, nPedido: nPed,
        nSolicitado: nSol, nDescoberto: nDesc,
        totalExigidos: exigidos.length,
        // Três leituras diferentes, porque respondem a perguntas diferentes:
        // pctQtd  = quanto do material já está fisicamente aqui
        // pctItens= quantos códigos estão 100% entregues
        // pctEmCurso = quantos já têm alguma ação de compra (em qualquer aba)
        pctQtd: somaExigida > 0 ? Math.round(somaAtendida / somaExigida * 100) : 0,
        pctItens: exigidos.length > 0 ? Math.round(nEnt / exigidos.length * 100) : 0,
        pctEmCurso: exigidos.length > 0
          ? Math.round((exigidos.length - nDesc) / exigidos.length * 100) : 0,
        nExtras: extras.length,
      };
      detalhePorSerial[serial] = { serial: serial, itens: detalhes, extras: extras };
    });

    // Série que tem compras mas nenhuma delas bate com o BOM carregado quase
    // sempre é de OUTRO modelo de Hauler (o CSV é de um modelo específico).
    // Mostrar 0% de cobertura nesse caso engana — melhor dizer o que houve.
    var outroModelo = [];
    Object.keys(porSerial).forEach(function (s) {
      var p = porSerial[s];
      if (p.nDescoberto === p.totalExigidos && p.nExtras > 0) outroModelo.push(s);
    });
    if (outroModelo.length) {
      avisos.push({
        tipo: 'bom_incompativel',
        n: outroModelo.length,
        exemplos: outroModelo,
        msg: outroModelo.length + ' série(s) têm compras registradas, mas nenhum código coincide '
           + 'com o BOM carregado — provavelmente são de outro modelo de Hauler. '
           + 'A cobertura delas não deve ser lida como 0%.',
      });
      outroModelo.forEach(function (s) { porSerial[s].bomIncompativel = true; });
    }

    if (ambiguos.length) {
      avisos.push({
        tipo: 'atribuicao_ambigua',
        n: ambiguos.length,
        exemplos: ambiguos.slice(0, 5),
        msg: ambiguos.length + ' compra(s) em código com variantes sem descrição que permita '
           + 'identificar qual variante foi comprada — atribuídas ao código base.',
      });
    }
    (bom.avisos || []).forEach(function (a) { avisos.push(a); });
    compras.diag.forEach(function (d) { avisos.push({ tipo: 'planilha', msg: d }); });

    var resultado = {
      success: true,
      geradoEm: new Date().toISOString(),
      seriais: porSerial,
      totais: {
        seriais: Object.keys(porSerial).length,
        linhasCompras: compras.linhas.length,
        codigosExigidos: exigidos.length,
        qtdExigidaTotal: exigidos.reduce(function (s, e) { return s + e.qtd; }, 0),
      },
      avisos: avisos,
    };

    _gravarCache_(CK, resultado);
    Object.keys(detalhePorSerial).forEach(function (s) {
      _gravarCache_(CK + '_det_' + s, detalhePorSerial[s]);
    });

    if (dados.serial) resultado.detalhe = detalhePorSerial[dados.serial] || null;
    return resultado;
  } catch (e) {
    return { success: false, erro: e.message };
  }
}

// CacheService limita ~100KB por chave, então o valor vai fatiado.
function _gravarCache_(chave, obj) {
  try {
    var txt = JSON.stringify(obj);
    var TAM = 90000;
    var n = Math.ceil(txt.length / TAM);
    if (n > 20) return false;              // grande demais: segue sem cache
    var c = CacheService.getScriptCache();
    for (var i = 0; i < n; i++) c.put(chave + '_' + i, txt.substr(i * TAM, TAM), 3600);
    c.put(chave + '_n', String(n), 3600);
    return true;
  } catch (e) { return false; }
}

function _lerCache_(chave) {
  try {
    var c = CacheService.getScriptCache();
    var n = parseInt(c.get(chave + '_n') || '0', 10);
    if (!n) return null;
    var partes = [];
    for (var i = 0; i < n; i++) {
      var p = c.get(chave + '_' + i);
      if (p == null) return null;          // fatia expirou: cache inválido
      partes.push(p);
    }
    return JSON.parse(partes.join(''));
  } catch (e) { return null; }
}

// ─── COMPRAS: NORMALIZAÇÃO PARA O PAINEL ──────────────────────────
// Categorias do painel (porte de CMP_CATS / _cmpCateg).
var CMP_CATS_ = [
  { titulo: 'Chapa / Corte',   kws: ['chapa', 'corte', 'laser', 'plasma', 'guilhotina'] },
  { titulo: 'Usinagem',        kws: ['usinagem', 'torno', 'fresa', 'furacao'] },
  { titulo: 'Hidráulico',      kws: ['hidraulic', 'mangueira', 'cilindro', 'bomba', 'valvula'] },
  { titulo: 'Elétrico',        kws: ['eletric', 'eletrico', 'cabo', 'sensor', 'chicote', 'bateria'] },
  { titulo: 'Pneus / Rodas',   kws: ['pneu', 'roda', 'aro', 'camara'] },
  { titulo: 'Estrutura',       kws: ['estrutura', 'chassi', 'perfil', 'tubo', 'viga'] },
  { titulo: 'Acabamento',      kws: ['tinta', 'adesivo', 'pintura', 'primer'] },
  { titulo: 'Fixadores',       kws: ['parafuso', 'porca', 'arruela', 'rebite', 'fixador'] },
];

// Status que significam "acabou" — entregue ou cancelado. Sem isso, item já
// entregue continuava sendo contado como vencido nos swim lanes do painel.
function _cmpConcluido_(status) {
  var s = _norm_(status);
  return s.indexOf('entregue') === 0 || s === 'cancelado' || s.indexOf('consta entregue') === 0;
}

function _cmpCategoria_(txt) {
  var t = _norm_(txt);
  for (var i = 0; i < CMP_CATS_.length; i++) {
    for (var k = 0; k < CMP_CATS_[i].kws.length; k++) {
      if (t.indexOf(CMP_CATS_[i].kws[k]) !== -1) return CMP_CATS_[i].titulo;
    }
  }
  return 'Outros';
}

/**
 * Lê a planilha de Compras e devolve as linhas já normalizadas.
 * O painel resolvia a coluna de data em 8 lugares com listas de prioridade
 * diferentes (e o cmpKey ignorava a prioridade), então tabela, KPIs, filtros
 * e swim lanes discordavam sobre o que é "vencido". Aqui a coluna é resolvida
 * UMA vez e devolvida em meta.colunaData, e cada linha já vem com _vencido
 * calculado — excluindo os concluídos.
 */
function analisarCompras(dados) {
  try {
    dados = dados || {};
    var props = PropertiesService.getScriptProperties();
    // Persistir o id recebido é o que permite ao gatilho de aquecimento
    // recalcular sozinho depois — o painel o guarda no localStorage.
    if (dados.sheetId) props.setProperty('COMPRAS_SHEET_ID', dados.sheetId);
    var sheetId = dados.sheetId || props.getProperty('COMPRAS_SHEET_ID') || COMPRAS_ID_;

    var CK = 'analise_compras_v2_' + String(sheetId).slice(-10);
    if (!dados.force) {
      var cacheado = _lerCache_(CK);
      if (cacheado) { cacheado.fromCache = true; return cacheado; }
    }

    var ss = SpreadsheetApp.openById(sheetId);
    var hoje = new Date(); hoje.setHours(12, 0, 0, 0);
    var em7 = new Date(hoje); em7.setDate(hoje.getDate() + 7);
    var em30 = new Date(hoje); em30.setDate(hoje.getDate() + 30);

    var abas = [], avisos = [];

    ABAS_COMPRAS_.forEach(function (def) {
      var sh = null;
      for (var i = 0; i < def.nomes.length && !sh; i++) sh = ss.getSheetByName(def.nomes[i]);
      if (!sh) { avisos.push({ tipo: 'planilha', msg: 'Aba não encontrada: ' + def.nomes[0] }); return; }
      var ultima = sh.getLastRow();
      if (ultima < 2) return;

      var vals = sh.getRange(1, 1, ultima, sh.getLastColumn()).getValues();
      var H = vals[0].map(function (h) { return String(h == null ? '' : h).trim(); });

      // A coluna de prazo é resolvida uma única vez, por prioridade real:
      // previsão de entrega manda; sem ela, a data desejada.
      // 'previsao entrega' primeiro, sem qualificar o fornecedor: as três abas
      // têm variantes diferentes dessa coluna ("Previsão Entrega", "...
      // (Fornecedor)", "... + Prazo Transportadora"). Como _acharColuna_
      // devolve a 1ª coluna da planilha que casa, o candidato genérico pega a
      // previsão mais à esquerda em todas — se eu qualificasse por
      // "(fornecedor)", Solicitações cairia na coluna de transportadora e as
      // abas passariam a medir "vencido" com réguas diferentes de novo.
      var iData = _acharColuna_(H, [
        'previsao entrega', 'prev. entrega',
        'data entrega atualizada', 'data desejada', 'entrega', 'prazo',
      ]);
      var iStatus = _acharColuna_(H, ['status', 'situacao']);
      var iResp   = _acharColuna_(H, ['responsavel']);
      var iFinal  = _acharColuna_(H, ['finalidade']);
      var iAlmox  = _acharColuna_(H, ['almox', 'alnoxarifado']);
      var iCC     = _acharColuna_(H, ['centro de custo']);
      var iDesc   = _acharColuna_(H, ['descricao']);
      var iForn   = _acharColuna_(H, ['fornecedor']);
      var iPv     = _acharColuna_(H, ['pv']);
      if (iPv < 0) iPv = 0;   // mesmo fallback de _lerAbasCompras_

      var linhas = [];
      for (var r = 1; r < vals.length; r++) {
        var L = vals[r];
        var vazia = true;
        for (var c = 0; c < L.length; c++) { if (String(L[c] || '').trim()) { vazia = false; break; } }
        if (vazia) continue;

        var obj = {};
        for (var h = 0; h < H.length; h++) if (H[h]) obj[H[h]] = _celula_(L, h);

        var status = iStatus >= 0 ? _celula_(L, iStatus) : '';
        var concluido = _cmpConcluido_(status);
        var dt = iData >= 0 ? _parseData_(L[iData]) : null;

        obj._pv = _celula_(L, iPv);
        obj._dt = _fmtIso_(dt);
        obj._concluido = concluido;
        // Um item entregue não está "vencido" — ele acabou.
        obj._vencido = !!(dt && dt < hoje && !concluido);
        obj._vence7 = !!(dt && !concluido && dt >= hoje && dt <= em7);
        obj._vence30 = !!(dt && !concluido && dt >= hoje && dt <= em30);
        obj._categoria = _cmpCategoria_(
          [iFinal, iAlmox, iCC, iDesc].map(function (ix) { return ix >= 0 ? _celula_(L, ix) : ''; }).join(' ')
          + ' ' + status);
        obj._responsavel = iResp >= 0 ? _celula_(L, iResp) : '';
        obj._fornecedor = iForn >= 0 ? _celula_(L, iForn) : '';
        obj._aba = def.nomes[0];
        obj._fonte = def.fonte;
        linhas.push(obj);
      }

      abas.push({
        nome: def.nomes[0], fonte: def.fonte, headers: H.filter(function (h) { return h; }),
        colunaData: iData >= 0 ? H[iData] : null,
        linhas: linhas, total: linhas.length,
      });
      if (iData < 0) {
        avisos.push({ tipo: 'planilha', msg: 'Aba ' + def.nomes[0] + ': nenhuma coluna de data reconhecida.' });
      }
    });

    var todas = [];
    abas.forEach(function (a) { todas = todas.concat(a.linhas); });

    var resultado = {
      success: true,
      geradoEm: new Date().toISOString(),
      abas: abas.map(function (a) {
        return { nome: a.nome, fonte: a.fonte, headers: a.headers, colunaData: a.colunaData, total: a.total };
      }),
      linhas: todas,
      meta: {
        colunaData: abas.length ? abas[0].colunaData : null,
        colunaDataPorAba: abas.reduce(function (m, a) { m[a.nome] = a.colunaData; return m; }, {}),
      },
      totais: {
        linhas: todas.length,
        vencidos: todas.filter(function (l) { return l._vencido; }).length,
        vence7: todas.filter(function (l) { return l._vence7; }).length,
        concluidos: todas.filter(function (l) { return l._concluido; }).length,
      },
      avisos: avisos,
    };

    _gravarCache_(CK, resultado);
    return resultado;
  } catch (e) {
    return { success: false, erro: e.message };
  }
}
