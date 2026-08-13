// ================================================================
// AGRICEF — PdfFila.gs
// Tira a geração de PDF do caminho da requisição.
//
// Medido dirigindo o painel em 2026-08-13: registrarBloqueio levou
// 14,1s e resolverBloqueio 11,4s, contra um piso de ~2s do Apps Script.
// Boa parte é montar o HTML do relatório, converter em PDF e gravar no
// Drive — tudo em série, com o gestor olhando para o botão.
//
// O PDF é um artefato de arquivo: ninguém precisa dele no segundo em que
// clica. Então ele passa a ser enfileirado e gerado por um gatilho
// one-shot logo depois. O bloqueio em si (label, card BLKQ, comentário,
// datas) continua síncrono — isso o gestor precisa ver acontecer.
// ================================================================

var FILA_PDF_CHAVE_ = 'FILA_PDF';

/**
 * Enfileira um PDF para geração fora da requisição.
 * @param {string} tipo 'bloqueio' ou 'resolucao'
 */
function _enfileirarPdf_(tipo, dados) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); }
  catch (e) { return { pendente: false, erro: 'fila de PDF ocupada' }; }
  try {
    var props = PropertiesService.getScriptProperties();
    var fila = [];
    try { fila = JSON.parse(props.getProperty(FILA_PDF_CHAVE_) || '[]'); } catch (e2) { fila = []; }
    fila.push({ tipo: tipo, dados: dados, em: Date.now() });
    // Script Properties limita ~9KB por valor. Se a fila crescer demais é
    // porque o gatilho parou de rodar — descartar os mais antigos é melhor
    // que estourar a propriedade e perder a fila inteira.
    while (fila.length > 30) fila.shift();
    props.setProperty(FILA_PDF_CHAVE_, JSON.stringify(fila));
    _agendarProcessamentoPdf_();
    return { pendente: true, naFila: fila.length };
  } catch (e3) {
    return { pendente: false, erro: e3.message };
  } finally {
    lock.releaseLock();
  }
}

/** Um gatilho pendente basta: ele drena a fila inteira de uma vez. */
function _agendarProcessamentoPdf_() {
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === 'processarFilaPdf') return;
  }
  ScriptApp.newTrigger('processarFilaPdf').timeBased().after(15 * 1000).create();
}

/** Handler do gatilho one-shot. */
function processarFilaPdf() {
  var props = PropertiesService.getScriptProperties();

  // Remove o gatilho que disparou esta execução ANTES de trabalhar: gatilhos
  // one-shot não se apagam sozinhos e o Apps Script limita 20 por projeto.
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === 'processarFilaPdf') ScriptApp.deleteTrigger(ts[i]);
  }

  var fila = [];
  var lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { _agendarProcessamentoPdf_(); return; }
  try {
    fila = JSON.parse(props.getProperty(FILA_PDF_CHAVE_) || '[]');
    props.deleteProperty(FILA_PDF_CHAVE_);
  } catch (e2) { fila = []; }
  finally { lock.releaseLock(); }

  var ok = 0, falhas = [];
  for (var k = 0; k < fila.length; k++) {
    var item = fila[k];
    try {
      var pdf = (item.tipo === 'resolucao')
        ? gerarPdfResolucao_(item.dados)
        : gerarPdfBloqueio_(item.dados);
      salvarRelatorioDrive_(pdf);
      ok++;
    } catch (e3) {
      // Não recoloca na fila: um PDF que falha por dado inválido entraria em
      // laço infinito. O log é o registro — o bloqueio em si já foi gravado.
      falhas.push(item.tipo + ' ' + ((item.dados && item.dados.issueKey) || '?') + ': ' + e3.message);
    }
  }

  if (falhas.length) console.error('processarFilaPdf: ' + falhas.join(' | '));
  console.log('processarFilaPdf: ' + ok + ' PDF(s) gerados, ' + falhas.length + ' falha(s)');
  return { success: true, gerados: ok, falhas: falhas };
}

/** Diagnóstico para o painel: quantos PDFs estão esperando. */
function statusFilaPdf() {
  var fila = [];
  try { fila = JSON.parse(PropertiesService.getScriptProperties().getProperty(FILA_PDF_CHAVE_) || '[]'); } catch (e) { fila = []; }
  var agendado = false;
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) {
    if (ts[i].getHandlerFunction() === 'processarFilaPdf') { agendado = true; break; }
  }
  return { success: true, naFila: fila.length, gatilhoAgendado: agendado };
}
