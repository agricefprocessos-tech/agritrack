// ══════════════════════════════════════════════════════════════════
// ADICIONAR NO GOOGLE APPS SCRIPT — agritrack backend
// ══════════════════════════════════════════════════════════════════
//
// 1. Abra o Apps Script: https://script.google.com
// 2. Abra o projeto do AgriTrack
// 3. Adicione o case no switch de doGet/doPost:
//
//      case 'buscarHaulerBOM':
//        return buscarHaulerBOM(payload);
//
// 4. Cole a função abaixo em qualquer lugar do arquivo
// 5. Salve e publique nova versão (Implantar > Gerenciar implantações > Nova versão)
// ══════════════════════════════════════════════════════════════════

function buscarHaulerBOM(p) {
  try {
    var fileId = p.fileId;
    if (!fileId) return { success: false, erro: 'fileId não informado' };

    // Baixa o arquivo público do Drive via URL (funciona com "qualquer pessoa com o link")
    var url = 'https://drive.google.com/uc?export=download&id=' + fileId;
    var response = UrlFetchApp.fetch(url, {
      followRedirects: true,
      muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
      return { success: false, erro: 'HTTP ' + response.getResponseCode() };
    }

    // Tenta UTF-16LE (padrão do THOMAS.csv), fallback UTF-8
    var csv;
    try {
      csv = response.getContentText('UTF-16LE');
      if (csv.indexOf(';') === -1) throw new Error('não é UTF-16LE');
    } catch (e) {
      csv = response.getContentText('UTF-8');
    }

    // Remove BOM se presente
    if (csv && csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);

    return { success: true, csv: csv };

  } catch (e) {
    return { success: false, erro: e.message };
  }
}
