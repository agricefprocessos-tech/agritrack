// ══════════════════════════════════════════════════════════════════
// ADICIONAR NO GOOGLE APPS SCRIPT — agritrack backend
// ══════════════════════════════════════════════════════════════════
//
// 1. Abra: https://script.google.com — projeto "Agricef — Formulario PCP"
// 2. Adicione o case no switch de doGet/doPost:
//
//      case 'resolverBloqueio':
//        return resolverBloqueio(payload);
//
// 3. Cole as funções abaixo em qualquer arquivo do projeto
// 4. Salve e publique nova versão (Implantar > Gerenciar implantações > Nova versão)
// ══════════════════════════════════════════════════════════════════
//
// O QUE FAZ:
//   1. Posta comentário no Jira com a descrição da resolução
//   2. Se removerLabel=true, remove o label "bloqueado" do issue
//
// PAYLOAD ESPERADO:
//   {
//     issueKey:              "AGTK-123",
//     descricaoResolucao:    "Dados recebidos do cliente e análise retomada.",
//     responsavelResolucao:  "João Silva",        // opcional
//     dataResolucao:         "2026-06-16",        // opcional, default hoje
//     removerLabel:          true                 // false = só comenta
//   }
//
// RETORNO:
//   { success: true, comentarioId: "...", labelRemovido: true }
// ══════════════════════════════════════════════════════════════════

function resolverBloqueio(p) {
  try {
    var issueKey          = (p.issueKey || '').trim().toUpperCase();
    var descricao         = (p.descricaoResolucao || '').trim();
    var responsavel       = (p.responsavelResolucao || '').trim();
    var dataRes           = (p.dataResolucao || Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd'));
    var removerLabel      = p.removerLabel !== false; // default true

    if (!issueKey) return { success: false, erro: 'issueKey obrigatório' };
    if (!descricao) return { success: false, erro: 'descricaoResolucao obrigatória' };

    var email = PropertiesService.getScriptProperties().getProperty('JIRA_EMAIL');
    var token = PropertiesService.getScriptProperties().getProperty('JIRA_TOKEN');
    var base  = PropertiesService.getScriptProperties().getProperty('JIRA_BASE_URL'); // ex: https://agricef.atlassian.net
    if (!email || !token || !base) return { success: false, erro: 'Credenciais Jira não configuradas (JIRA_EMAIL / JIRA_TOKEN / JIRA_BASE_URL)' };

    var auth = Utilities.base64Encode(email + ':' + token);
    var headers = {
      'Authorization': 'Basic ' + auth,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    // ── 1. Postar comentário de resolução ────────────────────────
    var linhaResp = responsavel ? '\n*Responsável pela resolução:* ' + responsavel : '';
    var comentario = '✅ *Bloqueio resolvido em ' + dataRes + '*\n\n'
      + descricao
      + linhaResp
      + '\n\n_(Registrado via AgriTrack PMO Dashboard)_';

    var commentResp = UrlFetchApp.fetch(base + '/rest/api/3/issue/' + issueKey + '/comment', {
      method: 'post',
      headers: headers,
      payload: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: comentario }]
          }]
        }
      }),
      muteHttpExceptions: true
    });

    var commentJson = JSON.parse(commentResp.getContentText());
    if (commentResp.getResponseCode() >= 300) {
      return { success: false, erro: 'Erro ao postar comentário: ' + (commentJson.errorMessages || JSON.stringify(commentJson)) };
    }
    var comentarioId = commentJson.id;

    // ── 2. Remover label "bloqueado" (se solicitado) ─────────────
    var labelRemovido = false;
    if (removerLabel) {
      var updateResp = UrlFetchApp.fetch(base + '/rest/api/3/issue/' + issueKey, {
        method: 'put',
        headers: headers,
        payload: JSON.stringify({
          update: {
            labels: [{ remove: 'bloqueado' }]
          }
        }),
        muteHttpExceptions: true
      });

      if (updateResp.getResponseCode() < 300) {
        labelRemovido = true;
      } else {
        var updateJson = JSON.parse(updateResp.getContentText());
        // Não falha a operação inteira — comentário já foi postado
        return {
          success: true,
          comentarioId: comentarioId,
          labelRemovido: false,
          aviso: 'Comentário postado, mas falha ao remover label: ' + JSON.stringify(updateJson.errorMessages || updateJson)
        };
      }
    }

    return {
      success: true,
      comentarioId: comentarioId,
      labelRemovido: labelRemovido
    };

  } catch (e) {
    return { success: false, erro: e.message + ' | ' + e.stack };
  }
}
