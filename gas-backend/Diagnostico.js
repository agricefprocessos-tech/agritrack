// ================================================================
// AGRICEF — Diagnostico.gs
// Consultas SÓ DE LEITURA para investigar reclamações do tipo "atualizei e
// não subiu". Nada aqui grava no Jira, no Drive ou envia e-mail.
// ================================================================

/**
 * O que de fato mudou no Jira nas últimas N horas, direto do changelog.
 *
 * Responde "a atualização chegou ao Jira?" sem depender do painel: se a
 * mudança aparece aqui, ela subiu e o problema é o que o painel mostra; se não
 * aparece, a requisição falhou antes de gravar.
 *
 * O autor distingue a origem: mudanças feitas pelo painel saem com a conta de
 * serviço do JIRA_EMAIL; mudanças feitas direto no Jira saem com o nome de quem
 * mexeu.
 *
 * dados: { horas: 12 (padrão), departamento: 'PCP' (opcional), max: 80 }
 */
function atividadeRecente(dados) {
  var horas = Math.min(Math.max(Number(dados && dados.horas) || 12, 1), 168);
  var max = Math.min(Math.max(Number(dados && dados.max) || 80, 1), 200);
  var depto = String((dados && dados.departamento) || '').trim();
  var limite = new Date(Date.now() - horas * 3600 * 1000);

  // Orçamento de tempo: cada issue custa uma requisição de changelog. Melhor
  // devolver parcial e avisar do que estourar o limite do Apps Script.
  var t0 = Date.now();
  var ORCAMENTO_MS = 4 * 60 * 1000;

  try {
    var jql = 'project = AGTK AND updated >= -' + horas + 'h ORDER BY updated DESC';
    var issues = [];
    var token = null;
    while (issues.length < max) {
      var path = '/rest/api/3/search/jql?jql=' + encodeURIComponent(jql) +
        '&maxResults=100&fields=summary,issuetype,parent,customfield_10073,updated';
      if (token) path += '&nextPageToken=' + encodeURIComponent(token);
      var r = jiraRequest_('GET', path);
      if (!r.issues || !r.issues.length) break;
      issues = issues.concat(r.issues);
      token = r.nextPageToken || null;
      if (!token) break;
    }
    issues = issues.slice(0, max);

    var eventos = [];
    var truncado = 0;
    issues.forEach(function (i) {
      var f = i.fields || {};
      var dep = f.customfield_10073 ? (f.customfield_10073.value || String(f.customfield_10073)) : '';
      if (depto && dep !== depto) return;
      if (Date.now() - t0 > ORCAMENTO_MS) { truncado++; return; }

      try {
        var chg = jiraRequest_('GET', '/rest/api/3/issue/' + i.key + '/changelog?maxResults=100');
        (chg.values || []).forEach(function (entry) {
          var quando = new Date(entry.created);
          if (quando < limite) return;
          (entry.items || []).forEach(function (item) {
            eventos.push({
              quando: quando.toISOString(),
              chave: i.key,
              pai: f.parent ? f.parent.key : null,
              resumo: String(f.summary || '').slice(0, 70),
              departamento: dep,
              autor: entry.author ? entry.author.displayName : '(desconhecido)',
              campo: item.field,
              de: item.fromString,
              para: item.toString,
            });
          });
        });
      } catch (e) {
        eventos.push({ chave: i.key, erroChangelog: e.message });
      }
    });

    eventos.sort(function (a, b) { return String(b.quando).localeCompare(String(a.quando)); });

    var porAutor = {};
    eventos.forEach(function (e) { if (e.autor) porAutor[e.autor] = (porAutor[e.autor] || 0) + 1; });

    return {
      success: true,
      janelaHoras: horas,
      departamento: depto || '(todos)',
      issuesAtualizadas: issues.length,
      eventos: eventos,
      porAutor: porAutor,
      truncado: truncado,
    };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}
