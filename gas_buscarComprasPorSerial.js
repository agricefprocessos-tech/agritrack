// ══════════════════════════════════════════════════════════════════
// ADICIONAR NO GOOGLE APPS SCRIPT — agritrack backend
// ══════════════════════════════════════════════════════════════════
//
// 1. Abra: https://script.google.com — projeto "Agricef — Formulario PCP"
// 2. Adicione o case no switch de doGet/doPost:
//
//      case 'buscarComprasPorSerial':
//        return buscarComprasPorSerial(payload);
//
// 3. Cole a função abaixo em qualquer arquivo do projeto
// 4. Salve e publique nova versão (Implantar > Gerenciar implantações > Nova versão)
// ══════════════════════════════════════════════════════════════════
//
// O QUE FAZ:
//   Lê a planilha FUP (mesma usada por buscarComprasHaulerLeadTime) e
//   agrupa os pedidos por número de série, resolvendo padrões como:
//     - "22000086"              → [22000086]
//     - "22000086, 87 e 88"    → [22000086, 22000087, 22000088]
//     - "22000086 e 22000087"  → [22000086, 22000087]
//   Retorna cobertura de CÓD. AGRICEF por serial para cruzamento com BOM.
//
// RETORNO:
//   {
//     success: true,
//     seriais: {
//       "22000086": {
//         codigos: ["507304","507690",...],  // códigos únicos com pedido
//         nLinhas: 313,                      // total de linhas FUP
//         statuses: {"Aguardando aprovação":5, "Pedido enviado":3}
//       },
//       ...
//     },
//     geradoEm: "2026-06-04T..."
//   }
// ══════════════════════════════════════════════════════════════════

function buscarComprasPorSerial(p) {
  try {
    // ── 1. Abrir a planilha FUP ──────────────────────────────────────
    // Usa o mesmo ID da planilha do buscarComprasHaulerLeadTime
    // Substitua FUP_SHEET_ID pelo ID real se necessário
    var fupSheetId = PropertiesService.getScriptProperties().getProperty('FUP_SHEET_ID');
    if (!fupSheetId) {
      // Fallback: tenta encontrar pelo nome do arquivo
      var files = DriveApp.getFilesByName('FUP');
      if (!files.hasNext()) return { success: false, erro: 'FUP_SHEET_ID não configurado e arquivo não encontrado' };
      fupSheetId = files.next().getId();
    }

    var ss = SpreadsheetApp.openById(fupSheetId);

    // ── 2. Encontrar aba do Hauler ───────────────────────────────────
    // Tenta abas com "hauler" ou "HAULER" no nome; fallback para primeira aba
    var sheet = null;
    var sheets = ss.getSheets();
    for (var i = 0; i < sheets.length; i++) {
      var name = sheets[i].getName().toLowerCase();
      if (name.indexOf('hauler') !== -1) { sheet = sheets[i]; break; }
    }
    if (!sheet) sheet = ss.getActiveSheet();

    // ── 3. Ler dados brutos ──────────────────────────────────────────
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { success: true, seriais: {}, geradoEm: new Date().toISOString() };

    var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = data[0].map(function(h) { return String(h).trim(); });

    // ── 4. Identificar colunas pelo cabeçalho ───────────────────────
    var COL = {};
    headers.forEach(function(h, i) {
      var hn = h.toUpperCase();
      if (hn === 'PV')                       COL.pv = i;
      if (hn.indexOf('CÓD') !== -1 && hn.indexOf('AGRICEF') !== -1) COL.cod = i;
      if (hn === 'QTD' || hn === 'QUANTIDADE') COL.qtd = i;
      if (hn === 'STATUS')                   COL.status = i;
      if (hn.indexOf('CONJUNTO') !== -1 || hn.indexOf('APELIDO') !== -1) COL.apelido = i;
      if (hn.indexOf('DESCRIÇÃO') !== -1 || hn.indexOf('DESCRICAO') !== -1) COL.desc = i;
    });

    // Fallback por posição se não encontrou pelo nome
    if (COL.pv      === undefined) COL.pv      = 0;
    if (COL.cod     === undefined) COL.cod     = 5;
    if (COL.qtd     === undefined) COL.qtd     = 6;
    if (COL.status  === undefined) COL.status  = 17;
    if (COL.apelido === undefined) COL.apelido = 23;

    // ── 5. Processar linhas ──────────────────────────────────────────
    var result = {};  // serial → {codigos: {}, nLinhas, statuses: {}}

    for (var r = 1; r < data.length; r++) {
      var row = data[r];
      var pv      = String(row[COL.pv]      || '').trim();
      var cod     = String(row[COL.cod]     || '').trim();
      var apelido = String(row[COL.apelido] || '').trim();
      var status  = String(row[COL.status]  || '').trim();

      if (!cod) continue;  // linha sem código → ignorar

      // Extrair seriais do campo PV
      var seriais = parsePvCampo_(pv);

      // Se PV não retornou seriais, tenta o campo apelido como backup
      if (seriais.length === 0 && apelido) {
        seriais = parsePvCampo_(apelido);
      }

      if (seriais.length === 0) continue;  // não identificou serial → ignorar

      // Normalizar código (remove zeros à esquerda, espaços)
      var codNorm = normCodGas_(cod);

      // Acumular no resultado
      seriais.forEach(function(serial) {
        if (!result[serial]) {
          result[serial] = { codigos: {}, nLinhas: 0, statuses: {} };
        }
        result[serial].codigos[codNorm] = true;
        result[serial].nLinhas++;
        if (status) {
          result[serial].statuses[status] = (result[serial].statuses[status] || 0) + 1;
        }
      });
    }

    // ── 6. Converter Sets para arrays ────────────────────────────────
    var out = {};
    Object.keys(result).forEach(function(serial) {
      var d = result[serial];
      out[serial] = {
        codigos: Object.keys(d.codigos),
        nLinhas: d.nLinhas,
        statuses: d.statuses
      };
    });

    return {
      success: true,
      seriais: out,
      totalSeriais: Object.keys(out).length,
      geradoEm: new Date().toISOString()
    };

  } catch (e) {
    return { success: false, erro: e.message + ' | ' + e.stack };
  }
}

// ── Parser de campo PV ──────────────────────────────────────────────
// Resolve padrões:
//   "22000086"              → ["22000086"]
//   "22000086, 87 e 88"    → ["22000086","22000087","22000088"]
//   "22000086, 22000087"   → ["22000086","22000087"]
//   "ALINHAMENTO - 22000086" → ["22000086"]
function parsePvCampo_(text) {
  if (!text) return [];

  // 1. Encontrar todos os seriais completos (8 dígitos começando com 220)
  var fullMatch = text.match(/\b220\d{5}\b/g) || [];
  if (fullMatch.length === 0) return [];

  var result = {};
  fullMatch.forEach(function(s) { result[s] = true; });

  // 2. Se só tem 1 serial completo, buscar sufixos abreviados
  if (fullMatch.length === 1) {
    var prefix = fullMatch[0].substring(0, 5);  // ex: "22000"
    // Remove o serial completo do texto e busca números de 2-3 dígitos restantes
    var remaining = text.replace(/\b220\d{5}\b/g, '');
    var partials = remaining.match(/\b\d{2,3}\b/g) || [];
    partials.forEach(function(p) {
      // Completar para 3 dígitos
      while (p.length < 3) p = '0' + p;
      var serial = prefix + p;
      if (/^220\d{5}$/.test(serial)) {
        result[serial] = true;
      }
    });
  }

  return Object.keys(result);
}

// ── Normalização de código (igual ao frontend _normCod) ─────────────
function normCodGas_(cod) {
  return String(cod).trim().replace(/^0+/, '').toUpperCase();
}
