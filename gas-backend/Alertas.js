// ================================================================
// AGRICEF — Alertas.gs
// Alertas de vencimento (diário) + Relatório semanal por gestor
//
// Depende de: JIRA_BASE, JIRA_PROJECT, jiraRequest_() (FormPCP.js)
//             buscarTarefasJira() (FormPCP.js)
//
// Para ativar os triggers, execute UMA VEZ no editor GAS:
//   setupAlertaVencimentosTrigger()        → todo dia às 7h
//   setupRelatorioSemanalGestoresTrigger() → toda segunda às 7h
// Para remover: deleteAlertaVencimentosTrigger() / deleteRelatorioSemanalGestoresTrigger()
// ================================================================

const DASHBOARD_URL = 'https://agricefprocessos-tech.github.io/agritrack/agritrack_dashboard.html';

// Modo de teste: true = todos os e-mails vão para TEST_EMAIL em vez do gestor real.
// Deixe true até validar o conteúdo dos e-mails; mude para false para ativar de vez.
const TEST_MODE  = true;
const TEST_EMAIL = 'guilherme.souza@agricef.com.br';
// Resolve o destinatário final do e-mail, respeitando o TEST_MODE.
function _destinoEmail(email) { return TEST_MODE ? TEST_EMAIL : email; }

// Mapa de e-mail dos gestores — nome EXATO como aparece no campo "Responsável" do Jira.
// O Jira não expõe o e-mail do assignee via API por privacidade, então mantemos
// esse mapa manual (mesmo padrão usado no script "fluxo manutanção" pros técnicos).
const RESPONSAVEL_EMAIL = {
  'Rafael Favalli': 'rafael.favalli@agricef.com.br',
  'Jose Leonardo C de Campos': 'jose.campos@agricef.com.br',
  'rodolfo gonçalves de alvarenga': 'rodolfo.alvarenga@agricef.com.br',
  'Fabiana': 'fabiana.gomes@agricef.com.br',
  'Marketing Agricef': 'julia.pisciotto@agricef.com.br',
  'Yasmin Boiago': 'yasmin.boiago@agricef.com.br',
};

// ─── ALERTAS DE VENCIMENTO ─────────────────────────────────────

// Marcos (dias até o vencimento) que disparam alerta. Negativos = atrasado.
const ALERTA_MARCOS = [3, 1, 0, -1];

// Após o primeiro alerta de atraso (-1), escala semanalmente: -8, -15, -22...
function _alertaDeveDisparar(diasRestantes) {
  if (ALERTA_MARCOS.indexOf(diasRestantes) !== -1) return true;
  if (diasRestantes < -1 && (diasRestantes + 1) % 7 === 0) return true;
  return false;
}

/**
 * Alvo do trigger diário. Varre tarefas/subtarefas não concluídas com
 * vencimento próximo ou atrasado e envia um e-mail consolidado por gestor.
 */
function alertaVencimentos() {
  try {
    const jql = encodeURIComponent(
      'project=' + JIRA_PROJECT + ' AND statusCategory != Done AND duedate is not EMPTY ORDER BY duedate ASC'
    );
    const fields = ['summary', 'duedate', 'assignee', 'parent', 'customfield_10073', 'issuetype'].join(',');
    let all = [];
    let nextPageToken = null;
    while (all.length < 2000) {
      let path = '/rest/api/3/search/jql?jql=' + jql + '&maxResults=100&fields=' + fields;
      if (nextPageToken) path += '&nextPageToken=' + encodeURIComponent(nextPageToken);
      const r = jiraRequest_('GET', path);
      if (!r.issues || !r.issues.length) break;
      all = all.concat(r.issues);
      nextPageToken = r.nextPageToken || null;
      if (!nextPageToken) break;
    }

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const porGestor = {}; // email -> { nome, itens: [] }
    const semEmail = {}; // nome -> contagem (diagnóstico de gestores sem mapa)

    all.forEach(function (i) {
      const f = i.fields || {};
      if (!f.duedate) return;
      const due = new Date(f.duedate + 'T12:00:00');
      const diasRestantes = Math.round((due - hoje) / 86400000);
      if (!_alertaDeveDisparar(diasRestantes)) return;

      const nome = f.assignee ? f.assignee.displayName : '';
      const email = RESPONSAVEL_EMAIL[nome];
      if (!email) { semEmail[nome] = (semEmail[nome] || 0) + 1; return; }

      if (!porGestor[email]) porGestor[email] = { nome: nome, itens: [] };
      porGestor[email].itens.push({
        key: i.key,
        summary: f.summary || '',
        duedate: f.duedate,
        diasRestantes: diasRestantes,
        parentSummary: (f.parent && f.parent.fields) ? (f.parent.fields.summary || '') : '',
        departamento: f.customfield_10073 ? (f.customfield_10073.value || f.customfield_10073) : '',
        tipo: f.issuetype ? f.issuetype.name : '',
      });
    });

    let enviados = 0;
    Object.keys(porGestor).forEach(function (email) {
      enviarAlertaGestor_(email, porGestor[email].nome, porGestor[email].itens);
      enviados++;
    });

    if (Object.keys(semEmail).length > 0) {
      console.warn('alertaVencimentos: gestores sem e-mail mapeado (RESPONSAVEL_EMAIL): ' + JSON.stringify(semEmail));
    }

    return { success: true, gestoresNotificados: enviados, totalItens: all.length, semEmailMapeado: semEmail };
  } catch (err) {
    console.error('alertaVencimentos ERRO: ' + err.message);
    return { success: false, erro: err.message };
  }
}

function enviarAlertaGestor_(email, nome, itens) {
  const ordenado = itens.slice().sort(function (a, b) { return a.diasRestantes - b.diasRestantes; });
  const linhas = ordenado.map(function (it) {
    const atrasado = it.diasRestantes < 0;
    const cor = atrasado ? '#f05252' : it.diasRestantes <= 1 ? '#f59e0b' : '#60a5fa';
    const situacao = atrasado ? (Math.abs(it.diasRestantes) + ' dia(s) ATRASADO')
      : it.diasRestantes === 0 ? 'vence HOJE'
      : ('vence em ' + it.diasRestantes + ' dia(s)');
    const link = DASHBOARD_URL + '?abrir=' + encodeURIComponent(it.key);
    const contexto = it.parentSummary ? esc_(it.parentSummary) + ' — ' : '';
    return '<tr><td style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<div style="font-size:13px;color:#e2e8f4;font-weight:600">' + it.key + ' — ' + contexto + esc_(it.summary) + '</div>' +
      '<div style="font-size:11px;color:#8896b0;margin-top:2px">' + esc_(it.departamento || '') + ' · ' + esc_(it.tipo || '') +
        ' · <span style="color:' + cor + ';font-weight:700">' + situacao + '</span> (' + it.duedate + ')</div>' +
      '<a href="' + link + '" style="display:inline-block;margin-top:6px;font-size:11px;color:#22d37a;text-decoration:none;font-weight:600">Atualizar no Painel →</a>' +
    '</td></tr>';
  }).join('');

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:600px">' +
    '<tr><td style="background:#0b0f17;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<span style="color:#e2e8f4;font-size:16px;font-weight:700">⏰ AgriTrack — Vencimentos Próximos</span>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 8px;color:#c5cfe0;font-size:13px;line-height:1.6">Olá ' + esc_(nome) + ', os itens abaixo do seu portfólio precisam de atenção — conclua no Jira ou registre a justificativa da nova data no painel.</td></tr>' +
    '<tr><td style="padding:8px 28px 24px"><table width="100%" cellpadding="0" cellspacing="0">' + linhas + '</table></td></tr>' +
    '<tr><td style="background:#0b0f17;padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06)">' +
      '<a href="' + DASHBOARD_URL + '" style="color:#22d37a;font-size:11px;text-decoration:none;font-weight:600">Abrir Dashboard completo →</a>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  GmailApp.sendEmail(_destinoEmail(email),
    '⏰ AgriTrack — ' + itens.length + ' item(ns) com vencimento próximo' + (TEST_MODE ? ' [TESTE — destino real: ' + email + ']' : ''),
    'Você tem itens com vencimento próximo no AgriTrack. Acesse ' + DASHBOARD_URL + ' para mais detalhes.',
    { htmlBody: html, name: 'AgriTrack — Agricef' });
}

function setupAlertaVencimentosTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'alertaVencimentos') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('alertaVencimentos')
    .timeBased().atHour(7).everyDays(1).inTimezone('America/Sao_Paulo').create();
  var msg = 'Trigger diário ativado: alertaVencimentos roda todo dia ~7h (America/Sao_Paulo)';
  Logger.log(msg);
  return { success: true, msg: msg };
}

function deleteAlertaVencimentosTrigger() {
  var removed = 0;
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'alertaVencimentos') { ScriptApp.deleteTrigger(existing[i]); removed++; }
  }
  return { success: true, removidos: removed };
}

function statusAlertaVencimentosTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var ativos = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'alertaVencimentos') ativos.push({ id: triggers[i].getUniqueId() });
  }
  return { ativo: ativos.length > 0, triggers: ativos };
}

// ─── SOLICITAÇÃO DE ATUALIZAÇÃO DE PROJETOS EM ANDAMENTO ──────

/**
 * Dispara um e-mail para cada gestor com a lista dos seus projetos "Fazendo",
 * solicitando que acesse o painel e atualize status/datas/progresso.
 * Pode ser chamada manualmente (via action no frontend) ou agendada.
 * Parâmetros opcionais:
 *   dados.departamento  — filtra por departamento (ex: "PCP"); se omitido envia para todos
 *   dados.mensagemExtra — texto adicional inserido no corpo do e-mail
 */
function enviarSolicitacaoAtualizacao(dados) {
  try {
    dados = dados || {};
    var deptFiltro = dados.departamento ? dados.departamento.trim() : '';
    var msgExtra   = dados.mensagemExtra ? dados.mensagemExtra.trim() : '';

    // Busca projetos em andamento via Jira JQL
    var jql = encodeURIComponent(
      'project=' + JIRA_PROJECT +
      ' AND issueType not in ("Subtarefa","Subtask")' +
      ' AND statusCategory = "In Progress"' +
      ' ORDER BY assignee ASC, duedate ASC'
    );
    var fields = ['summary','status','assignee','duedate','customfield_10015','customfield_10469','customfield_10470','customfield_10073','issuetype'].join(',');
    var all = [];
    var nextPageToken = null;
    while (all.length < 1000) {
      var path = '/rest/api/3/search/jql?jql=' + jql + '&maxResults=100&fields=' + fields;
      if (nextPageToken) path += '&nextPageToken=' + encodeURIComponent(nextPageToken);
      var r = jiraRequest_('GET', path);
      if (!r.issues || !r.issues.length) break;
      all = all.concat(r.issues);
      nextPageToken = r.nextPageToken || null;
      if (!nextPageToken) break;
    }

    var porGestor = {}; // email → { nome, projetos[] }
    var semEmail  = {};

    all.forEach(function(i) {
      var f = i.fields || {};
      var dept = f.customfield_10073 ? (f.customfield_10073.value || String(f.customfield_10073)) : '';
      if (deptFiltro && dept.toLowerCase().indexOf(deptFiltro.toLowerCase()) === -1) return;

      var nome  = f.assignee ? f.assignee.displayName : 'Sem responsável';
      var email = RESPONSAVEL_EMAIL[nome];
      if (!email) { semEmail[nome] = (semEmail[nome] || 0) + 1; return; }

      if (!porGestor[email]) porGestor[email] = { nome: nome, projetos: [] };
      porGestor[email].projetos.push({
        key:      i.key,
        summary:  f.summary || '',
        status:   f.status ? f.status.name : '',
        duedate:  f.duedate || '',
        alvo:     f.customfield_10470 || '',
        baseline: f.customfield_10469 || '',
        start:    f.customfield_10015 || '',
        dept:     dept,
      });
    });

    var enviados = 0;
    var totalProjetos = 0;
    Object.keys(porGestor).forEach(function(email) {
      var g = porGestor[email];
      _enviarSolicitacaoGestor_(email, g.nome, g.projetos, msgExtra);
      enviados++;
      totalProjetos += g.projetos.length;
    });

    if (Object.keys(semEmail).length > 0)
      console.warn('enviarSolicitacaoAtualizacao: sem e-mail mapeado: ' + JSON.stringify(semEmail));

    return { success: true, gestoresNotificados: enviados, totalProjetos: totalProjetos, semEmailMapeado: semEmail };
  } catch(err) {
    console.error('enviarSolicitacaoAtualizacao ERRO: ' + err.message);
    return { success: false, erro: err.message };
  }
}

function _fmtDate_(s) {
  if (!s) return '—';
  var d = new Date(s + 'T12:00:00');
  if (isNaN(d)) return s;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function _enviarSolicitacaoGestor_(email, nome, projetos, msgExtra) {
  var hoje = new Date(); hoje.setHours(0,0,0,0);

  var linhas = projetos.map(function(p) {
    var link = DASHBOARD_URL + '?abrir=' + encodeURIComponent(p.key);
    var due = p.duedate ? new Date(p.duedate + 'T12:00:00') : null;
    var diasDue = due ? Math.round((due - hoje) / 86400000) : null;
    var prazoColor = diasDue === null ? '#8896b0'
      : diasDue < 0  ? '#f05252'
      : diasDue <= 7 ? '#f59e0b'
      : '#22d37a';
    var prazoTxt = diasDue === null ? 'sem prazo'
      : diasDue < 0  ? Math.abs(diasDue) + ' dia(s) atrasado'
      : diasDue === 0 ? 'vence hoje'
      : 'vence em ' + diasDue + ' dia(s) (' + _fmtDate_(p.duedate) + ')';

    return '<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px">' +
        '<span style="font-family:monospace;font-size:11px;font-weight:700;color:#8896b0">' + esc_(p.key) + '</span>' +
        '<span style="background:#f59e0b22;color:#f59e0b;border-radius:8px;padding:1px 7px;font-size:10px;font-weight:700">Fazendo</span>' +
        '<span style="color:' + prazoColor + ';font-size:11px;font-weight:700">' + prazoTxt + '</span>' +
      '</div>' +
      '<div style="font-size:13px;font-weight:600;color:#e2e8f4;margin-bottom:4px">' + esc_(p.summary) + '</div>' +
      '<div style="font-size:11px;color:#8896b0;margin-bottom:6px">' +
        (p.dept ? esc_(p.dept) + ' · ' : '') +
        'Início: ' + _fmtDate_(p.start) + ' · Alvo: ' + _fmtDate_(p.alvo) +
      '</div>' +
      '<a href="' + link + '" style="display:inline-block;background:#22d37a;color:#000;font-size:11px;font-weight:700;padding:5px 14px;border-radius:20px;text-decoration:none">Atualizar projeto →</a>' +
    '</td></tr>';
  }).join('');

  var extraBloco = msgExtra
    ? '<tr><td style="padding:12px 28px;background:#22d37a11;border-left:3px solid #22d37a;margin:0 28px;font-size:12px;color:#c5cfe0;line-height:1.6">' + esc_(msgExtra) + '</td></tr>'
    : '';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:600px">' +
    '<tr><td style="background:#0b0f17;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<span style="color:#e2e8f4;font-size:17px;font-weight:700">📋 AgriTrack — Atualização de Projetos</span>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 8px;color:#c5cfe0;font-size:13px;line-height:1.7">' +
      'Olá <strong style="color:#e2e8f4">' + esc_(nome.split(' ')[0]) + '</strong>, ' +
      'você tem <strong style="color:#f59e0b">' + projetos.length + ' projeto(s) em andamento</strong> no Jira. ' +
      'Por favor, acesse o painel e confirme se as datas e status estão atualizados.' +
    '</td></tr>' +
    extraBloco +
    '<tr><td style="padding:8px 28px 24px"><table width="100%" cellpadding="0" cellspacing="0">' + linhas + '</table></td></tr>' +
    '<tr><td style="background:#0b0f17;padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:space-between">' +
      '<a href="' + DASHBOARD_URL + '" style="color:#22d37a;font-size:11px;text-decoration:none;font-weight:600">Abrir painel completo →</a>' +
      '<span style="color:#3a4558;font-size:10px;margin-left:16px">AgriTrack — Agricef PMO</span>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  GmailApp.sendEmail(
    _destinoEmail(email),
    '📋 AgriTrack — Por favor, atualize seus ' + projetos.length + ' projeto(s) em andamento' +
      (TEST_MODE ? ' [TESTE — destino real: ' + email + ']' : ''),
    'Você tem ' + projetos.length + ' projeto(s) em andamento que precisam de atualização. Acesse: ' + DASHBOARD_URL,
    { htmlBody: html, name: 'AgriTrack — Agricef PMO' }
  );
}

// ─── RELATÓRIO SEMANAL POR GESTOR ──────────────────────────────

function _pd(s) { if (!s) return null; var d = new Date(s); return isNaN(d) ? null : d; }

/**
 * Alvo do trigger semanal. Agrupa tarefas por Responsável (gestor) e envia
 * um e-mail de planejamento individual — carga da semana, vencimentos,
 * sugestão de alocação e estratégia conforme o cenário do portfólio dele.
 */
function relatorioSemanalGestores() {
  try {
    const r = buscarTarefasJira();
    if (!r.success) throw new Error(r.erro);

    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const semanaPassada = new Date(hoje); semanaPassada.setDate(hoje.getDate() - 7);
    const proxSemana = new Date(hoje); proxSemana.setDate(hoje.getDate() + 7);
    const quatroSemanasAtras = new Date(hoje); quatroSemanasAtras.setDate(hoje.getDate() - 28);

    const porGestor = {}; // nome -> { email, itens: [] }
    const semEmail = {};
    r.issues.forEach(function (t) {
      const nome = t['Responsável'];
      if (!nome) return;
      const email = RESPONSAVEL_EMAIL[nome];
      if (!email) { semEmail[nome] = (semEmail[nome] || 0) + 1; return; }
      if (!porGestor[nome]) porGestor[nome] = { email: email, itens: [] };
      porGestor[nome].itens.push(t);
    });

    let enviados = 0;
    Object.keys(porGestor).forEach(function (nome) {
      const g = porGestor[nome];
      const data = g.itens;

      const concl = data.filter(function (t) { return t['Status'] === 'Feito'; });
      const fazendo = data.filter(function (t) { return t['Status'] === 'Fazendo'; });
      const aFazer = data.filter(function (t) { return t['Status'] !== 'Feito' && t['Status'] !== 'Fazendo'; });
      const concl7d = concl.filter(function (t) { var rd = _pd(t['Resolvido']); return rd && rd >= semanaPassada; });
      const concl4sem = concl.filter(function (t) { var rd = _pd(t['Resolvido']); return rd && rd >= quatroSemanasAtras; });
      const throughputSemanal = Math.round((concl4sem.length / 4) * 10) / 10;

      const foraPrazo = data.filter(function (t) {
        if (t['Status'] === 'Feito') return false;
        var dl = _pd(t['Data limite']); return dl && dl < hoje;
      }).sort(function (a, b) { return (_pd(a['Data limite']) || 0) - (_pd(b['Data limite']) || 0); });

      const proxVenc = data.filter(function (t) {
        if (t['Status'] === 'Feito') return false;
        var dl = _pd(t['Data limite']); return dl && dl >= hoje && dl <= proxSemana;
      }).sort(function (a, b) { return (_pd(a['Data limite']) || 0) - (_pd(b['Data limite']) || 0); });

      const bloqueados = data.filter(function (t) { return (t['Labels'] || '').indexOf('bloqueado') >= 0; });

      // Dias de atraso do item mais antigo (para dar peso real ao alerta, não só contagem)
      const piorAtraso = foraPrazo.length ? Math.round((hoje - _pd(foraPrazo[0]['Data limite'])) / 86400000) : 0;
      const venceHoje = proxVenc.filter(function (t) { var dl = _pd(t['Data limite']); return dl && dl.getTime() === hoje.getTime(); });

      // ── Resumo executivo ──────────────────────────────────────────
      const resumo = [];
      const taxaConc = data.length ? Math.round(concl.length / data.length * 100) : 0;
      resumo.push('Taxa de conclusão: <strong>' + taxaConc + '%</strong> (' + concl.length + '/' + data.length + ')');
      if (foraPrazo.length > 0) resumo.push('<strong style="color:#f05252">' + foraPrazo.length + ' item(ns) fora do prazo</strong> — o mais antigo está atrasado há ' + piorAtraso + ' dia(s)');
      else resumo.push('<strong style="color:#22d37a">Sem itens fora do prazo</strong> ✓');
      if (bloqueados.length > 0) resumo.push('<strong style="color:#f05252">' + bloqueados.length + ' bloqueio(s) ativo(s)</strong> travando entregas');
      resumo.push('Throughput: <strong>' + throughputSemanal + '</strong> item(ns)/semana (média 4 sem.) · ' + concl7d.length + ' concluído(s) últimos 7 dias');

      // ── Pontos críticos (escala de severidade, igual ao relatório da aba) ──
      const criticos = [];
      if (bloqueados.length > 0)
        criticos.push('🔴 <strong>' + bloqueados.length + ' bloqueio(s) ativo(s):</strong> nada deveria avançar nesses itens até a causa ser resolvida. Veja o detalhe no painel (aba Gantt → clique no item).');
      if (foraPrazo.length >= 3)
        criticos.push('🔴 <strong>Volume crítico de atrasos (' + foraPrazo.length + ' itens):</strong> o mais antigo já passou ' + piorAtraso + ' dia(s) do prazo. Sem ação, isso compromete a credibilidade dos próximos prazos que você definir.');
      else if (foraPrazo.length > 0)
        criticos.push('🟠 <strong>' + foraPrazo.length + ' item(ns) fora do prazo:</strong> decida agora — conclui essa semana ou renegocia a data com justificativa no painel.');
      if (venceHoje.length > 0)
        criticos.push('🔴 <strong>' + venceHoje.length + ' item(ns) vence(m) HOJE:</strong> ' + venceHoje.map(function(t){return esc_(t['Chave da item']);}).join(', ') + '.');
      if (fazendo.length >= 4 && fazendo.length > aFazer.length * 1.5)
        criticos.push('🟡 <strong>WIP alto (' + fazendo.length + ' em andamento):</strong> abrir mais frentes agora só vai atrasar tudo. Feche o que está em andamento antes de puxar item novo.');
      if (criticos.length === 0)
        criticos.push('✅ <strong>Nenhum ponto crítico identificado.</strong> Portfólio sob controle.');

      // ── Ações recomendadas (numeradas, com prazo explícito) ────────
      const acoes = [];
      let nAc = 1;
      if (bloqueados.length > 0)
        acoes.push(nAc++ + '. <strong>[URGENTE] Desbloquear:</strong> revise ' + bloqueados.length + ' item(ns) bloqueado(s) e registre a solução no painel (botão "Já tenho solução"). <em>Prazo: hoje.</em>');
      if (foraPrazo.length > 0)
        acoes.push(nAc++ + '. <strong>[ALTA] Tratar atrasos:</strong> para cada um dos ' + foraPrazo.length + ' item(ns) fora do prazo, conclua ou registre nova data com justificativa. <em>Prazo: esta semana.</em>');
      if (venceHoje.length > 0)
        acoes.push(nAc++ + '. <strong>[ALTA] Confirmar entrega de hoje:</strong> ' + venceHoje.map(function(t){return esc_(t['Chave da item']);}).join(', ') + ' vence(m) hoje — confirme status real no Jira. <em>Prazo: hoje.</em>');
      else if (proxVenc.length > 0)
        acoes.push(nAc++ + '. <strong>[MÉDIA] Monitorar vencimentos:</strong> ' + proxVenc.length + ' item(ns) vencem nos próximos 7 dias — garanta que estão de fato em andamento. <em>Prazo: imediato.</em>');
      if (aFazer.length > 0 && fazendo.length < 2)
        acoes.push(nAc++ + '. <strong>[MÉDIA] Iniciar fila:</strong> você tem capacidade livre e ' + aFazer.length + ' item(ns) parado(s) em "A Fazer" — inicie ao menos um esta semana. <em>Prazo: 3 dias.</em>');
      if (fazendo.length >= 4 && fazendo.length > aFazer.length * 1.5)
        acoes.push(nAc++ + '. <strong>[MÉDIA] Reduzir WIP:</strong> conclua itens em andamento antes de iniciar novos — ' + fazendo.length + ' frentes abertas é alto. <em>Prazo: esta semana.</em>');
      if (acoes.length === 0)
        acoes.push(nAc++ + '. <strong>[ROTINA] Manter ritmo:</strong> sem pendências críticas — bom momento para avançar itens de maior complexidade. <em>Prazo: ao longo da semana.</em>');

      const html = buildRelatorioGestorHtml_(nome, {
        total: data.length, concl: concl.length, fazendo: fazendo.length, aFazer: aFazer.length,
        concl7d: concl7d.length, throughputSemanal: throughputSemanal,
        foraPrazo: foraPrazo, proxVenc: proxVenc, bloqueados: bloqueados.length,
        resumo: resumo, criticos: criticos, acoes: acoes,
      });

      GmailApp.sendEmail(_destinoEmail(g.email),
        '📅 AgriTrack — Seu planejamento da semana' + (TEST_MODE ? ' [TESTE — destino real: ' + g.email + ']' : ''),
        'Acesse ' + DASHBOARD_URL + ' para ver o relatório completo.',
        { htmlBody: html, name: 'AgriTrack — Agricef' });
      enviados++;
    });

    if (Object.keys(semEmail).length > 0) {
      console.warn('relatorioSemanalGestores: gestores sem e-mail mapeado: ' + JSON.stringify(semEmail));
    }

    return { success: true, gestoresNotificados: enviados, semEmailMapeado: semEmail };
  } catch (err) {
    console.error('relatorioSemanalGestores ERRO: ' + err.message);
    return { success: false, erro: err.message };
  }
}

function buildRelatorioGestorHtml_(nome, k) {
  const kpiStyle = 'background:#1a2235;border-radius:8px;padding:14px 10px;text-align:center;display:inline-block;width:100%';
  const numStyle = 'font-size:26px;font-weight:700;line-height:1;display:block;margin-bottom:4px';

  function listaItens(itens, corPrazo) {
    if (!itens.length) return '<div style="color:#8896b0;font-size:12px;padding:6px 0">Nenhum item.</div>';
    return itens.slice(0, 10).map(function (t) {
      return '<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.05);font-size:12px;color:#c5cfe0">' +
        '<strong style="color:#e2e8f4">' + esc_(t['Chave da item']) + '</strong> — ' + esc_(t['Resumo']) +
        ' <span style="color:' + corPrazo + '">(' + esc_(t['Data limite'] || '') + ')</span>' +
      '</div>';
    }).join('');
  }

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px"><tr><td align="center">' +
    '<table width="620" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:620px;box-shadow:0 4px 24px rgba(0,0,0,0.3)">' +

    '<tr><td style="background:#0b0f17;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<span style="color:#e2e8f4;font-size:17px;font-weight:700">📅 Seu planejamento da semana</span><br>' +
      '<span style="color:#8896b0;font-size:12px">Olá, ' + esc_(nome) + '</span>' +
    '</td></tr>' +

    '<tr><td style="padding:24px 32px 8px"><table width="100%" cellpadding="4" cellspacing="0"><tr>' +
      '<td width="33%"><div style="' + kpiStyle + '"><span style="' + numStyle + ';color:#60a5fa">' + k.fazendo + '</span><span style="font-size:10px;color:#8896b0;text-transform:uppercase">Em Andamento</span></div></td>' +
      '<td width="33%"><div style="' + kpiStyle + '"><span style="' + numStyle + ';color:#94a3b8">' + k.aFazer + '</span><span style="font-size:10px;color:#8896b0;text-transform:uppercase">A Fazer</span></div></td>' +
      '<td width="33%"><div style="' + kpiStyle + '"><span style="' + numStyle + ';color:' + (k.foraPrazo.length > 0 ? '#f05252' : '#22d37a') + '">' + k.foraPrazo.length + '</span><span style="font-size:10px;color:#8896b0;text-transform:uppercase">Fora do Prazo</span></div></td>' +
    '</tr></table></td></tr>' +

    '<tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>' +

    '<tr><td style="padding:18px 32px 8px"><div style="color:#e2e8f4;font-size:13px;font-weight:700;margin-bottom:8px">📊 Resumo</div>' +
      '<ul style="margin:0;padding:0 0 0 18px;color:#c5cfe0;font-size:12px;line-height:1.8">' + k.resumo.map(function(r){return '<li>'+r+'</li>';}).join('') + '</ul>' +
    '</td></tr>' +

    '<tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>' +

    '<tr><td style="padding:18px 32px 8px"><div style="color:#f59e0b;font-size:13px;font-weight:700;margin-bottom:8px">⚠️ Pontos críticos</div>' +
      '<div style="color:#c5cfe0;font-size:12.5px;line-height:1.7">' + k.criticos.map(function(c){return '<div style="margin-bottom:8px">'+c+'</div>';}).join('') + '</div>' +
    '</td></tr>' +

    '<tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>' +

    '<tr><td style="padding:18px 32px 8px"><div style="color:#22d37a;font-size:13px;font-weight:700;margin-bottom:8px">✅ Ações recomendadas</div>' +
      '<div style="color:#c5cfe0;font-size:12.5px;line-height:1.7">' + k.acoes.map(function(a){return '<div style="margin-bottom:8px">'+a+'</div>';}).join('') + '</div>' +
    '</td></tr>' +

    '<tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>' +

    '<tr><td style="padding:20px 32px 8px"><div style="color:#f59e0b;font-size:13px;font-weight:700;margin-bottom:6px">📋 Vence nos próximos 7 dias (' + k.proxVenc.length + ')</div>' + listaItens(k.proxVenc, '#f59e0b') + '</td></tr>' +
    '<tr><td style="padding:8px 32px 24px"><div style="color:#f05252;font-size:13px;font-weight:700;margin-bottom:6px">🔴 Fora do prazo (' + k.foraPrazo.length + ')</div>' + listaItens(k.foraPrazo, '#f05252') + '</td></tr>' +

    '<tr><td style="background:#0b0f17;padding:18px 32px;border-top:1px solid rgba(255,255,255,0.06)">' +
      '<a href="' + DASHBOARD_URL + '" style="color:#22d37a;font-size:11px;text-decoration:none;font-weight:600">Abrir Dashboard completo →</a>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>';
}

function setupRelatorioSemanalGestoresTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'relatorioSemanalGestores') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('relatorioSemanalGestores')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone('America/Sao_Paulo').create();
  var msg = 'Trigger semanal ativado: relatorioSemanalGestores roda toda segunda ~7h (America/Sao_Paulo)';
  Logger.log(msg);
  return { success: true, msg: msg };
}

function deleteRelatorioSemanalGestoresTrigger() {
  var removed = 0;
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'relatorioSemanalGestores') { ScriptApp.deleteTrigger(existing[i]); removed++; }
  }
  return { success: true, removidos: removed };
}

function statusRelatorioSemanalGestoresTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var ativos = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'relatorioSemanalGestores') ativos.push({ id: triggers[i].getUniqueId() });
  }
  return { ativo: ativos.length > 0, triggers: ativos };
}

// ─── HELPER ─────────────────────────────────────────────────────
function esc_(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
