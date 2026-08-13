// ================================================================
// AGRICEF — DigestSemanal.gs
// UM e-mail por gestor, às segundas, reunindo o que antes eram três
// disparos separados.
//
// Antes: numa segunda-feira o gestor recebia às 7h o alerta de
// vencimentos, a solicitação de atualização e o planejamento da semana —
// três e-mails na mesma hora, sobre o mesmo portfólio. Isso treina a
// pessoa a ignorar todos, e o canal ia justamente passar a ser usado para
// cobrar atualização de projeto.
//
// Este arquivo NÃO reimplementa nenhuma das três coletas. Cada uma delas
// ganhou um modo `somenteColeta` em Alertas.js e é reaproveitada aqui —
// duplicar a regra foi exatamente o que fez o parse de serial divergir em
// três lugares neste projeto.
//
// Ativação (uma vez, no editor GAS):
//   setupDigestSemanalTrigger()      → liga o digest de segunda 7h
//   desativarTriggersAntigosDiarios()→ desliga os três disparos antigos
// ================================================================

/**
 * Monta e envia o digest.
 *
 * @param {Object} opcoes
 *   opcoes.previa = true → monta o conteúdo REAL de todos os gestores mas
 *   envia tudo para PREVIA_EMAIL_, com o destinatário real estampado no
 *   topo. Nenhum gestor recebe nada. É o modo de conferência.
 */
var PREVIA_EMAIL_ = 'guilherme.souza@agricef.com.br';

function digestSemanalGestores(opcoes) {
  opcoes = opcoes || {};
  var previa = !!opcoes.previa;
  var t0 = Date.now();

  try {
    // ── Coleta (reaproveitando as três funções existentes) ──────────
    var venc = alertaVencimentos({ somenteColeta: true });
    var soli = enviarSolicitacaoAtualizacao({ apenasProximos: true, somenteColeta: true });
    var plan = relatorioSemanalGestores({ somenteColeta: true });

    if (!venc.success) throw new Error('Coleta de vencimentos falhou: ' + venc.erro);
    if (!soli.success) throw new Error('Coleta de solicitações falhou: ' + soli.erro);
    if (!plan.success) throw new Error('Coleta de planejamento falhou: ' + plan.erro);

    // ── Fusão por e-mail ────────────────────────────────────────────
    // O planejamento vem indexado por NOME; os outros dois por e-mail.
    var porEmail = {};
    function slot(email, nome) {
      if (!porEmail[email]) porEmail[email] = { nome: nome || '', vencimentos: [], projetos: [], planejamento: [] };
      if (nome && !porEmail[email].nome) porEmail[email].nome = nome;
      return porEmail[email];
    }

    Object.keys(venc.porGestor || {}).forEach(function (email) {
      slot(email, venc.porGestor[email].nome).vencimentos = venc.porGestor[email].itens || [];
    });
    Object.keys(soli.porGestor || {}).forEach(function (email) {
      slot(email, soli.porGestor[email].nome).projetos = soli.porGestor[email].projetos || [];
    });
    Object.keys(plan.porGestorNome || {}).forEach(function (nome) {
      var g = plan.porGestorNome[nome];
      if (!g.email) return;
      slot(g.email, nome).planejamento = g.itens || [];
    });

    // Gestor sem nada em nenhuma das três não recebe e-mail. Mandar "você
    // não tem pendências" toda segunda é o tipo de ruído que faz o filtro
    // do Gmail nascer.
    var destinos = Object.keys(porEmail).filter(function (e) {
      var g = porEmail[e];
      return g.vencimentos.length || g.projetos.length || g.planejamento.length;
    });

    _checarCotaEmail_(destinos.length + 1);

    var enviados = 0;
    destinos.forEach(function (email) {
      var g = porEmail[email];
      var html = _montarDigestHtml_(g, email, previa);
      var assunto = '📌 AgriTrack — Sua semana: ' + _resumoAssunto_(g)
        + (previa ? ' [PRÉVIA — destino real: ' + email + ']' : '');
      GmailApp.sendEmail(previa ? PREVIA_EMAIL_ : _destinoEmail(email), assunto,
        'Abra em um cliente que suporte HTML para ver o resumo da semana.',
        { htmlBody: html, name: 'AgriTrack — Agricef' });
      enviados++;
    });

    var res = {
      success: true,
      previa: previa,
      gestoresNotificados: enviados,
      gestoresSemPendencia: Object.keys(porEmail).length - destinos.length,
      duracaoSeg: Math.round((Date.now() - t0) / 1000),
    };
    console.log('digestSemanalGestores: ' + JSON.stringify(res));
    return res;
  } catch (err) {
    console.error('digestSemanalGestores ERRO: ' + err.message);
    return { success: false, erro: err.message };
  }
}

/** Frase curta do assunto — o gestor decide abrir pelo assunto. */
function _resumoAssunto_(g) {
  var partes = [];
  var atrasados = g.vencimentos.filter(function (i) { return i.diasRestantes < 0; }).length;
  if (atrasados) partes.push(atrasados + ' atrasado(s)');
  var venceSemana = g.vencimentos.length - atrasados;
  if (venceSemana) partes.push(venceSemana + ' vencendo');
  if (g.projetos.length) partes.push(g.projetos.length + ' a atualizar');
  return partes.length ? partes.join(', ') : 'planejamento da semana';
}

function _secaoDigest_(titulo, cor, subtitulo, corpo) {
  if (!corpo) return '';
  return '<tr><td style="padding:18px 28px 4px">'
    + '<div style="font-size:13px;font-weight:700;color:' + cor + '">' + titulo + '</div>'
    + (subtitulo ? '<div style="font-size:11px;color:#8896b0;margin-top:2px">' + subtitulo + '</div>' : '')
    + '</td></tr>'
    + '<tr><td style="padding:6px 28px 14px">' + corpo + '</td></tr>';
}

function _linhaItem_(esquerda, direita, corDireita) {
  return '<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px"><tr>'
    + '<td style="background:#1a2235;border-radius:6px;padding:8px 10px;font-size:12px;color:#c5cfe0">' + esquerda + '</td>'
    + '<td width="1" style="padding-left:6px;white-space:nowrap;font-size:11px;font-weight:700;color:' + (corDireita || '#8896b0') + '">' + direita + '</td>'
    + '</tr></table>';
}

function _montarDigestHtml_(g, emailReal, previa) {
  var link = DASHBOARD_URL;

  // ── 1. Vencimentos ──
  var atrasados = g.vencimentos.filter(function (i) { return i.diasRestantes < 0; });
  var proximos  = g.vencimentos.filter(function (i) { return i.diasRestantes >= 0; });
  var corpoVenc = '';
  atrasados.concat(proximos).slice(0, 25).forEach(function (i) {
    var dias = i.diasRestantes;
    var txt = dias < 0 ? Math.abs(dias) + 'd atrasado' : (dias === 0 ? 'vence hoje' : 'em ' + dias + 'd');
    var cor = dias < 0 ? '#ff6b6b' : (dias <= 2 ? '#f59e0b' : '#8896b0');
    corpoVenc += _linhaItem_('<strong style="color:#e2e8f4">' + i.key + '</strong> ' + esc_(i.summary || ''), txt, cor);
  });
  if (g.vencimentos.length > 25) corpoVenc += '<div style="font-size:11px;color:#8896b0;margin-top:4px">…e mais ' + (g.vencimentos.length - 25) + ' item(ns).</div>';

  // ── 2. Projetos a atualizar ──
  var corpoAtu = '';
  g.projetos.slice(0, 25).forEach(function (p) {
    var nSub = (p.subtarefas || []).length;
    corpoAtu += _linhaItem_('<strong style="color:#e2e8f4">' + p.key + '</strong> ' + esc_(p.summary || ''),
      nSub ? nSub + ' subtarefa(s)' : (p.status || ''), '#8896b0');
  });
  if (g.projetos.length > 25) corpoAtu += '<div style="font-size:11px;color:#8896b0;margin-top:4px">…e mais ' + (g.projetos.length - 25) + ' projeto(s).</div>';

  // ── 3. Carga da semana ──
  var corpoPlan = '';
  if (g.planejamento.length) {
    corpoPlan = '<div style="background:#1a2235;border-radius:8px;padding:12px;font-size:12px;color:#c5cfe0">'
      + '<strong style="color:#e2e8f4">' + g.planejamento.length + '</strong> item(ns) em andamento sob sua responsabilidade nesta semana.'
      + '</div>';
  }

  var aviso = previa
    ? '<tr><td style="background:#3a2a00;padding:10px 28px;font-size:12px;color:#ffd98a">'
      + '⚠️ PRÉVIA — este e-mail iria para <strong>' + emailReal + '</strong>. Nenhum gestor foi notificado.'
      + '</td></tr>'
    : '';

  return '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>'
    + '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">'
    + '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px"><tr><td align="center">'
    + '<table width="640" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:640px">'
    + aviso
    + '<tr><td style="background:#0b0f17;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.06)">'
      + '<span style="color:#e2e8f4;font-size:16px;font-weight:700">📌 Sua semana no AgriTrack</span>'
      + '<div style="color:#8896b0;font-size:12px;margin-top:4px">' + esc_(g.nome || '') + '</div>'
    + '</td></tr>'
    + _secaoDigest_('⏰ Vencimentos', '#ff6b6b',
        atrasados.length ? atrasados.length + ' atrasado(s) e ' + proximos.length + ' vencendo em breve' : proximos.length + ' vencendo em breve',
        corpoVenc)
    + _secaoDigest_('✍️ Projetos a atualizar', '#f59e0b',
        'Atualize datas e status direto no painel — leva menos de um minuto por item.', corpoAtu)
    + _secaoDigest_('📅 Carga da semana', '#22d37a', '', corpoPlan)
    + '<tr><td style="padding:8px 28px 24px">'
      + '<a href="' + link + '" style="display:inline-block;background:#22d37a;color:#000;font-size:13px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:8px">Abrir o painel →</a>'
    + '</td></tr>'
    + '<tr><td style="background:#0b0f17;padding:14px 28px;border-top:1px solid rgba(255,255,255,0.06)">'
      + '<span style="color:#8896b0;font-size:11px">Resumo semanal automático — enviado às segundas.</span>'
    + '</td></tr>'
    + '</table></td></tr></table></body></html>';
}

// ─── PRÉVIA / GATILHO ────────────────────────────────────────────

/** Conteúdo real de todos os gestores, enviado só para PREVIA_EMAIL_. */
function previaDigestSemanal() {
  return digestSemanalGestores({ previa: true });
}

function setupDigestSemanalTrigger() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'digestSemanalGestores') ScriptApp.deleteTrigger(existentes[i]);
  }
  ScriptApp.newTrigger('digestSemanalGestores')
    .timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(7).inTimezone('America/Sao_Paulo').create();
  return { success: true, msg: 'Digest semanal ativado: segundas ~7h (America/Sao_Paulo).' };
}

function deleteDigestSemanalTrigger() {
  var removidos = 0;
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'digestSemanalGestores') { ScriptApp.deleteTrigger(existentes[i]); removidos++; }
  }
  return { success: true, removidos: removidos };
}

/**
 * Desliga os três disparos que o digest substitui. Separado de propósito:
 * assim dá para rodar a prévia e conferir o digest ANTES de desligar o que
 * funciona hoje — e, se algo estiver errado, nada foi perdido.
 */
function desativarTriggersAntigosDiarios() {
  var alvos = ['alertaVencimentos', '_solicitacaoAtualizacaoAgendada', 'relatorioSemanalGestores'];
  var removidos = [];
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    var f = existentes[i].getHandlerFunction();
    if (alvos.indexOf(f) !== -1) { ScriptApp.deleteTrigger(existentes[i]); removidos.push(f); }
  }
  return { success: true, removidos: removidos };
}

function statusDigestSemanalTrigger() {
  var gatilhos = ScriptApp.getProjectTriggers();
  var digest = false, antigos = [];
  var alvos = ['alertaVencimentos', '_solicitacaoAtualizacaoAgendada', 'relatorioSemanalGestores'];
  for (var i = 0; i < gatilhos.length; i++) {
    var f = gatilhos[i].getHandlerFunction();
    if (f === 'digestSemanalGestores') digest = true;
    if (alvos.indexOf(f) !== -1) antigos.push(f);
  }
  return { success: true, digestAtivo: digest, triggersAntigosAindaAtivos: antigos };
}
