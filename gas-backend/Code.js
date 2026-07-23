// ================================================================
// AGRICEF — Backend API — Formulário de Projetos (todos os depts)
// Frontend: FormularioPCP.html (HTML estático, chama via fetch)
//
// Credenciais: Script Properties → JIRA_EMAIL + JIRA_TOKEN
// ⚠️  Desativar Regras Jira 07‑09 antes de usar.
// ================================================================

function doGet(e) {
  const payload = (e && e.parameter && e.parameter.payload) || '';
  if (!payload) return jsonResp_({ status: 'ok', msg: 'Agricef Projetos API v2' });

  try {
    const data = JSON.parse(payload);

    // Ações que alteram dados exigem o token compartilhado (ver _validarToken_ em FormPCP.js).
    // Ações somente-leitura permanecem abertas — elas só expõem dados já visíveis no painel.
    const ACOES_MUTANTES = [
      'deletarProjeto', 'mudarStatus', 'resolverBloqueio', 'registrarBloqueio',
      'atualizarDatas', 'enviarSolicitacaoAtualizacao', 'enviarRelatorio', 'registrarVoto',
      'relatorioAtividadeSemanal',
    ];
    if (ACOES_MUTANTES.indexOf(data.action) !== -1) _validarToken_(data);

    switch (data.action) {
      case 'criarProjetoJira':     return jsonResp_(criarProjetoJira(data));
      case 'buscarProximoSerial':  return jsonResp_(buscarProximoSerial());
      case 'buscarTarefasJira':    return jsonResp_(buscarTarefasJira());
      case 'buscarBloqueados':     return jsonResp_(buscarBloqueados());
      case 'registrarBloqueio':    return jsonResp_(registrarBloqueio(data));
      case 'resolverBloqueio':    return jsonResp_(resolverBloqueio(data));
      case 'atualizarDatas':       return jsonResp_(atualizarDatas(data));
      case 'mudarStatus':          return jsonResp_(mudarStatus(data));
      case 'deletarProjeto':       return jsonResp_(deletarProjeto(data));
      case 'buscarIssue':          return jsonResp_(buscarIssue(data));
      case 'enviarRelatorio':      return jsonResp_(enviarRelatorio(data));
      case 'buscarCompras':            return jsonResp_(buscarCompras(data));
      case 'listarAbasCompras':       return jsonResp_(listarAbasCompras(data));
    case 'buscarTodasAbasCompras':   return jsonResp_(buscarTodasAbasCompras(data));
      case 'buscarHaulerDadosCompletos': return jsonResp_(buscarHaulerDadosCompletos());
      case 'buscarApontamentosHauler': return jsonResp_(buscarApontamentosHauler());
      case 'buscarComprasHaulerLeadTime': return jsonResp_(buscarComprasHaulerLeadTime());
      case 'buscarComprasPorSerial': return jsonResp_(buscarComprasPorSerial());
      case 'buscarProducaoHaulerPorSerial': return jsonResp_(buscarProducaoHaulerPorSerial());
      case 'buscarOpcoesCampos':   return jsonResp_(buscarOpcoesCampos());
      // ── Backfill datas reais ──────────────────────────────────────────
      case 'syncDatasReais':        return jsonResp_(syncDatasReais());
      case 'statusBackfillTrigger': return jsonResp_(statusBackfillTrigger());
          case 'buscarHaulerBOM':    return jsonResp_(buscarHaulerBOM(data));
      // ── Alertas de vencimento + Relatório semanal por gestor ──────────
      case 'statusAlertaVencimentosTrigger':        return jsonResp_(statusAlertaVencimentosTrigger());
      case 'statusRelatorioSemanalGestoresTrigger': return jsonResp_(statusRelatorioSemanalGestoresTrigger());
      case 'statusSolicitacaoAtualizacaoTrigger':   return jsonResp_(statusSolicitacaoAtualizacaoTrigger());
      case 'statusRelatorioAtividadeSemanalTrigger': return jsonResp_(statusRelatorioAtividadeSemanalTrigger());
      case 'relatorioAtividadeSemanal':             return jsonResp_(relatorioAtividadeSemanal(data));
      case 'enviarSolicitacaoAtualizacao':          return jsonResp_(enviarSolicitacaoAtualizacao(data));
      // ── Votação de prioridade (comitê) ─────────────────────────────────
      case 'registrarVoto':  return jsonResp_(registrarVoto(data));
      case 'buscarVotacao':  return jsonResp_(buscarVotacao(data));
      default: return jsonResp_({ erro: 'Ação desconhecida: ' + data.action });
    }
  } catch (err) {
        try { return jsonResp_({ success: false, erro: err.message }); } catch(_) { return ContentService.createTextOutput(JSON.stringify({success:false,erro:'GAS: '+err.message})).setMimeType(ContentService.MimeType.JSON); }
  }
}

function jsonResp_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function buscarHaulerBOM(data) {
    try {
        var fileId = data.fileId;
            if (!fileId) return { success: false, erro: 'fileId nao informado' };
                var url = 'https://drive.google.com/uc?export=download&id=' + fileId;
                    var response = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
                        if (response.getResponseCode() !== 200) return { success: false, erro: 'HTTP ' + response.getResponseCode() };
                            var csv;
                                try { csv = response.getContentText('UTF-16LE'); if (csv.indexOf(';') === -1) throw new Error(); }
                                    catch (e) { csv = response.getContentText('UTF-8'); }
                                        if (csv && csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
                                            return { success: true, csv: csv };
                                              } catch (e) { return { success: false, erro: e.message }; }
}

function resolverBloqueio(p) {
    try {
        var issueKey     = (p.issueKey || '').trim().toUpperCase();
            var descricao    = (p.descricaoResolucao || '').trim();
                var responsavel  = (p.responsavelResolucao || '').trim();
                    var dataRes      = p.dataResolucao || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
                        var removerLabel = p.removerLabel !== false;

                            if (!issueKey)  return { success: false, erro: 'issueKey obrigatorio' };
                                if (!descricao) return { success: false, erro: 'descricaoResolucao obrigatoria' };

                                    var linhaResp = responsavel ? '\nResponsavel: ' + responsavel : '';
                                        var texto     = 'Bloqueio resolvido em ' + dataRes + '\n\n'
                                                          + descricao + linhaResp
                                                                            + '\n\n(Registrado via AgriTrack PMO Dashboard)';

                                                                                var commentResp = jiraRequest_('post', '/rest/api/3/issue/' + issueKey + '/comment', {
                                                                                      body: { type: 'doc', version: 1,
                                                                                              content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }] }
                                                                                                  });
                                                                                                      if (commentResp.errorMessages || commentResp.errors) {
                                                                                                            return { success: false, erro: 'Erro comentario: ' + JSON.stringify(commentResp.errorMessages || commentResp.errors) };
                                                                                                                }

                                                                                                                    var labelRemovido = false;
                                                                                                                        if (removerLabel) {
                                                                                                                              var upd = jiraRequest_('put', '/rest/api/3/issue/' + issueKey, {
                                                                                                                                      update: { labels: [{ remove: 'bloqueado' }] }
                                                                                                                                            });
                                                                                                                                                  labelRemovido = !upd.errorMessages && !(upd._status >= 300);
                                                                                                                                                      }

                                                                                                                                                          // Fecha card BLKQ associado (via issuelinks)
         var blkqKey = null;
         var blkqFechado = false;
         try {
           var issueLinks = jiraRequest_('get', '/rest/api/3/issue/' + issueKey + '?fields=issuelinks', null);
           var links = (issueLinks.fields && issueLinks.fields.issuelinks) || [];
           for (var li = 0; li < links.length; li++) {
             var linked = links[li].outwardIssue || links[li].inwardIssue;
             if (linked && linked.key && linked.key.indexOf('BLKQ-') === 0) {
               blkqKey = linked.key;
               break;
             }
           }
           if (blkqKey) {
             var trans = jiraRequest_('get', '/rest/api/3/issue/' + blkqKey + '/transitions', null);
             var transList = (trans.transitions) || [];
             var doneId = null;
             for (var ti = 0; ti < transList.length; ti++) {
               var tn = (transList[ti].name || '').toLowerCase();
               if (tn === 'done' || tn === 'concluído' || tn === 'concluido' || tn === 'fechado' || tn === 'resolved' || tn === 'resolvido') {
                 doneId = transList[ti].id;
                 break;
               }
             }
             if (doneId) {
               jiraRequest_('post', '/rest/api/3/issue/' + blkqKey + '/transitions', { transition: { id: doneId } });
             }
             var textoBlkq = 'Bloqueio resolvido em ' + dataRes + '\n\n' + descricao
               + (responsavel ? '\nResponsável: ' + responsavel : '')
               + '\n\n(Resolvido via AgriTrack PMO Dashboard)';
             jiraRequest_('post', '/rest/api/3/issue/' + blkqKey + '/comment', {
               body: { type: 'doc', version: 1,
                 content: [{ type: 'paragraph', content: [{ type: 'text', text: textoBlkq }] }] }
             });
             blkqFechado = true;
           }
         } catch (eBlkq) { /* falha nao-critica */ }

         // Gera PDF de resolucao e salva no Drive
         var driveResult = {};
         try {
           var pdfRes = gerarPdfResolucao_({
             issueKey: issueKey,
             dataResolucao: dataRes,
             responsavel: responsavel,
             descricao: descricao,
             labelRemovido: labelRemovido,
             blkqKey: blkqKey || '—',
           });
           driveResult = salvarRelatorioDrive_(pdfRes);
         } catch (eDrive) {
           driveResult = { erro: eDrive.message };
         }

         return { success: true, comentarioId: commentResp.id, labelRemovido: labelRemovido, blkqKey: blkqKey, blkqFechado: blkqFechado, drive: driveResult };

                                                                                                                                                            } catch (e) {
                                                                                                                                                                return { success: false, erro: e.message };
                                                                                                                                                                  }
                                                                                                                                                                  }