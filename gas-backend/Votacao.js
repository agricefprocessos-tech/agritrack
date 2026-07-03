// ================================================================
// AGRICEF — Votacao.gs
// Calibração de prioridade por comitê — votação dos 4 pilares
// (Classificação Estratégica, Impacto Financeiro, Urgência, Complexidade)
//
// Fluxo:
//   1. Ao criar um projeto, o gestor já define os 4 pilares (auto-avaliação).
//   2. notificarComiteVotacao_() dispara e-mail pro comitê com a auto-avaliação
//      e um link ?votar=CHAVE pro painel.
//   3. Cada membro do comitê registra o que acha que cada pilar deveria ser
//      (registrarVoto). Votação é aberta — todos veem os votos uns dos outros.
//   4. Um trigger horário (apurarVotacoesPendentes) verifica prazos vencidos,
//      calcula a moda de cada pilar entre os votos e atualiza o Jira.
//
// Para ativar o trigger de apuração, execute UMA VEZ no editor GAS:
//   setupApuracaoVotacaoTrigger()
// Para remover: deleteApuracaoVotacaoTrigger()
// ================================================================

// Mesma fórmula/pesos usados no formulário de criação (FormularioPCP.html SCORE_MAP)
const SCORE_MAP_ = {
  class: { 'Receita direta': 10, 'Estratégico e Posicionamento': 8, 'Sustentação e Excelência Operacional': 5 },
  imp:   { 'Transformacional': 10, 'Estratégico': 8, 'Relevante': 6, 'Incremental': 4, 'Marginal': 2 },
  urg:   { 'Imediata (Crítica)': 10, 'Alta (Próximo Trimestre)': 8, 'Média (Semestral)': 5, 'Baixa (Desejável)': 3, 'Backlog': 1 },
  comp:  { 'Alta': 10, 'Média': 6, 'Baixa': 2 },
};

function _calcScore(s) {
  const c = SCORE_MAP_.class[s.classificacao] || 0;
  const i = SCORE_MAP_.imp[s.impacto] || 0;
  const u = SCORE_MAP_.urg[s.urgencia] || 0;
  const x = SCORE_MAP_.comp[s.complexidade] || 0;
  const score = c * 0.4 + i * 0.3 + u * 0.15 + x * 0.15;
  let tier;
  if (score >= 8) tier = 'P1 — Crítico';
  else if (score >= 6) tier = 'P2 — Alto';
  else if (score >= 4) tier = 'P3 — Médio';
  else tier = 'P4 — Baixo';
  return { score: Math.round(score * 10) / 10, tier: tier };
}

// Comitê de calibração de prioridade — começa só com o PMO para testes.
// TODO: substituir pela lista real do comitê quando definida.
const COMITE_VOTACAO = {
  'Guilherme Paes de Souza': 'guilherme.souza@agricef.com.br',
};

const VOTACAO_PRAZO_HORAS = 48;

// ─── PLANILHA DE VOTAÇÃO (criada automaticamente no 1º uso) ───

function _getVotacaoSheet_() {
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('VOTACAO_SHEET_ID');
  let ss;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { id = null; }
  }
  if (!id) {
    ss = SpreadsheetApp.create('AgriTrack — Votação de Prioridade (comitê)');
    id = ss.getId();
    props.setProperty('VOTACAO_SHEET_ID', id);
    const pend = ss.getSheets()[0];
    pend.setName('Pendentes');
    pend.appendRow(['Chave', 'Resumo', 'DataCriacao', 'PrazoApuracao', 'GestorClass', 'GestorImpacto', 'GestorUrgencia', 'GestorComplexidade', 'Apurado', 'FinalClass', 'FinalImpacto', 'FinalUrgencia', 'FinalComplexidade']);
    const votos = ss.insertSheet('Votos');
    votos.appendRow(['Chave', 'DataVoto', 'Votante', 'Email', 'Classificacao', 'Impacto', 'Urgencia', 'Complexidade']);
  }
  return {
    ss: ss,
    pendentes: ss.getSheetByName('Pendentes'),
    votos: ss.getSheetByName('Votos'),
  };
}

function _sheetToObjects_(sheet) {
  const data = sheet.getDataRange().getValues();
  const headers = data.shift();
  return data.map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  });
}

// ─── NOTIFICAÇÃO AO CRIAR PROJETO ──────────────────────────────

function notificarComiteVotacao_(key, summary, scoresGestor) {
  const sh = _getVotacaoSheet_();
  const agora = new Date();
  const prazo = new Date(agora.getTime() + VOTACAO_PRAZO_HORAS * 3600 * 1000);

  sh.pendentes.appendRow([
    key, summary, agora, prazo,
    scoresGestor.classificacao, scoresGestor.impacto, scoresGestor.urgencia, scoresGestor.complexidade,
    false, '', '', '', '',
  ]);

  const link = DASHBOARD_URL + '?votar=' + encodeURIComponent(key);
  const gestorCalc = _calcScore(scoresGestor);

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:600px">' +
    '<tr><td style="background:#0b0f17;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<span style="color:#e2e8f4;font-size:16px;font-weight:700">🗳️ Novo projeto — calibrar prioridade</span>' +
    '</td></tr>' +
    '<tr><td style="padding:20px 28px 8px;color:#c5cfe0;font-size:13px;line-height:1.6">' +
      '<strong style="color:#e2e8f4">' + key + '</strong> — ' + esc_(summary) + '<br>' +
      'O gestor avaliou este projeto como <strong style="color:#f59e0b">' + gestorCalc.tier + '</strong> (nota ' + gestorCalc.score + '). ' +
      'Registre sua própria avaliação para os 4 pilares — a apuração ocorre automaticamente em ' + VOTACAO_PRAZO_HORAS + 'h.' +
    '</td></tr>' +
    '<tr><td style="padding:8px 28px 20px"><table width="100%" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background:#1a2235;border-radius:8px;padding:10px;font-size:11px;color:#8896b0">Classificação<br><strong style="color:#e2e8f4;font-size:12px">' + esc_(scoresGestor.classificacao || '—') + '</strong></td>' +
      '<td style="width:6px"></td>' +
      '<td style="background:#1a2235;border-radius:8px;padding:10px;font-size:11px;color:#8896b0">Impacto<br><strong style="color:#e2e8f4;font-size:12px">' + esc_(scoresGestor.impacto || '—') + '</strong></td>' +
      '<td style="width:6px"></td>' +
      '<td style="background:#1a2235;border-radius:8px;padding:10px;font-size:11px;color:#8896b0">Urgência<br><strong style="color:#e2e8f4;font-size:12px">' + esc_(scoresGestor.urgencia || '—') + '</strong></td>' +
      '<td style="width:6px"></td>' +
      '<td style="background:#1a2235;border-radius:8px;padding:10px;font-size:11px;color:#8896b0">Complexidade<br><strong style="color:#e2e8f4;font-size:12px">' + esc_(scoresGestor.complexidade || '—') + '</strong></td>' +
    '</tr></table></td></tr>' +
    '<tr><td style="padding:8px 28px 24px">' +
      '<a href="' + link + '" style="display:inline-block;background:#22d37a;color:#000;font-size:13px;font-weight:700;text-decoration:none;padding:10px 20px;border-radius:8px">Votar agora →</a>' +
    '</td></tr>' +
    '<tr><td style="background:#0b0f17;padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06)">' +
      '<span style="color:#8896b0;font-size:11px">Apuração automática em ' + prazo.toLocaleString('pt-BR') + '</span>' +
    '</td></tr>' +
    '</table></td></tr></table></body></html>';

  Object.keys(COMITE_VOTACAO).forEach(function (nome) {
    GmailApp.sendEmail(COMITE_VOTACAO[nome],
      '🗳️ AgriTrack — Votar prioridade de ' + key,
      'Acesse ' + link + ' para registrar sua avaliação.',
      { htmlBody: html, name: 'AgriTrack — Agricef' });
  });
}

// ─── REGISTRAR VOTO ─────────────────────────────────────────────

function registrarVoto(dados) {
  // LockService serializa esta seção contra outros registrarVoto() concorrentes
  // e contra apurarVotacoesPendentes() — evita voto perdido/corrompido se ambos
  // tentarem ler+escrever a planilha ao mesmo tempo.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (eLock) {
    return { success: false, erro: 'Sistema de votação ocupado — tente novamente em alguns segundos.' };
  }
  try {
    const key = (dados.issueKey || '').trim().toUpperCase();
    if (!key) throw new Error('issueKey obrigatório.');
    if (!dados.votante) throw new Error('Nome do votante obrigatório.');
    if (!dados.classificacao || !dados.impacto || !dados.urgencia || !dados.complexidade) {
      throw new Error('Preencha os 4 pilares.');
    }
    const sh = _getVotacaoSheet_();
    const pend = _sheetToObjects_(sh.pendentes).find(function (p) { return p.Chave === key; });
    if (!pend) throw new Error('Projeto não está em votação (' + key + ').');
    if (pend.Apurado) throw new Error('Votação já foi apurada para ' + key + '.');

    sh.votos.appendRow([key, new Date(), dados.votante, dados.email || '', dados.classificacao, dados.impacto, dados.urgencia, dados.complexidade]);
    return buscarVotacao({ issueKey: key });
  } catch (err) {
    return { success: false, erro: err.message };
  } finally {
    lock.releaseLock();
  }
}

// ─── BUSCAR ESTADO DA VOTAÇÃO ───────────────────────────────────

function buscarVotacao(dados) {
  try {
    const key = (dados.issueKey || '').trim().toUpperCase();
    if (!key) throw new Error('issueKey obrigatório.');
    const sh = _getVotacaoSheet_();
    const pend = _sheetToObjects_(sh.pendentes).find(function (p) { return p.Chave === key; });
    if (!pend) return { success: false, erro: 'Projeto não encontrado em votação: ' + key };

    const votos = _sheetToObjects_(sh.votos).filter(function (v) { return v.Chave === key; }).map(function (v) {
      const calc = _calcScore({ classificacao: v.Classificacao, impacto: v.Impacto, urgencia: v.Urgencia, complexidade: v.Complexidade });
      return {
        votante: v.Votante, data: v.DataVoto,
        classificacao: v.Classificacao, impacto: v.Impacto, urgencia: v.Urgencia, complexidade: v.Complexidade,
        score: calc.score, tier: calc.tier,
      };
    });

    const gestorScores = { classificacao: pend.GestorClass, impacto: pend.GestorImpacto, urgencia: pend.GestorUrgencia, complexidade: pend.GestorComplexidade };
    const gestorCalc = _calcScore(gestorScores);

    const resultado = {
      success: true,
      key: key,
      summary: pend.Resumo,
      prazoApuracao: pend.PrazoApuracao,
      apurado: !!pend.Apurado,
      gestor: Object.assign({}, gestorScores, gestorCalc),
      votos: votos,
    };
    if (pend.Apurado) {
      const finalScores = { classificacao: pend.FinalClass, impacto: pend.FinalImpacto, urgencia: pend.FinalUrgencia, complexidade: pend.FinalComplexidade };
      resultado.final = Object.assign({}, finalScores, _calcScore(finalScores));
    }
    return resultado;
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── APURAÇÃO AUTOMÁTICA (trigger horário) ─────────────────────

// Moda dos votos; em caso de empate no máximo, desempata pela nota do gestor
// (fallback) — só cai no primeiro valor encontrado se o gestor nem estiver
// entre os empatados.
function _moda_(valores, fallback) {
  if (!valores.length) return fallback;
  const contagem = {};
  valores.forEach(function (v) { contagem[v] = (contagem[v] || 0) + 1; });
  const maxCount = Math.max.apply(null, Object.keys(contagem).map(function (v) { return contagem[v]; }));
  const empatados = Object.keys(contagem).filter(function (v) { return contagem[v] === maxCount; });
  if (empatados.length === 1) return empatados[0];
  return empatados.indexOf(fallback) !== -1 ? fallback : empatados[0];
}

function apurarVotacoesPendentes() {
  // Mesmo lock de registrarVoto() — evita apurar com votos parcialmente
  // escritos, ou disputar a planilha com um voto sendo registrado agora.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (eLock) {
    console.warn('apurarVotacoesPendentes: não obteve lock, tentará na próxima execução do trigger.');
    return { success: false, erro: 'Lock ocupado — tentará novamente no próximo ciclo.' };
  }
  try {
    const sh = _getVotacaoSheet_();
    const pendentesRows = sh.pendentes.getDataRange().getValues();
    const headers = pendentesRows[0];
    const idx = {}; headers.forEach(function (h, i) { idx[h] = i; });
    const agora = new Date();
    const todosVotos = _sheetToObjects_(sh.votos);
    let apuradas = 0;

    for (let r = 1; r < pendentesRows.length; r++) {
      const row = pendentesRows[r];
      if (row[idx.Apurado]) continue;
      const prazo = new Date(row[idx.PrazoApuracao]);
      if (prazo > agora) continue;

      const key = row[idx.Chave];
      const votosChave = todosVotos.filter(function (v) { return v.Chave === key; });

      const finalClass = _moda_(votosChave.map(function (v) { return v.Classificacao; }), row[idx.GestorClass]);
      const finalImp    = _moda_(votosChave.map(function (v) { return v.Impacto; }), row[idx.GestorImpacto]);
      const finalUrg    = _moda_(votosChave.map(function (v) { return v.Urgencia; }), row[idx.GestorUrgencia]);
      const finalComp   = _moda_(votosChave.map(function (v) { return v.Complexidade; }), row[idx.GestorComplexidade]);

      // Atualiza os campos reais no Jira
      try {
        jiraRequest_('PUT', '/rest/api/3/issue/' + key, {
          fields: {
            customfield_10271: { value: finalClass },
            customfield_10304: { value: finalImp },
            customfield_10370: { value: finalUrg },
            customfield_10403: { value: finalComp },
          },
        });
      } catch (eJira) { console.error('apurarVotacoesPendentes: erro ao atualizar ' + key + ': ' + eJira.message); }

      sh.pendentes.getRange(r + 1, idx.Apurado + 1, 1, 5).setValues([[true, finalClass, finalImp, finalUrg, finalComp]]);
      apuradas++;
    }

    return { success: true, apuradas: apuradas };
  } catch (err) {
    console.error('apurarVotacoesPendentes ERRO: ' + err.message);
    return { success: false, erro: err.message };
  } finally {
    lock.releaseLock();
  }
}

function setupApuracaoVotacaoTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'apurarVotacoesPendentes') ScriptApp.deleteTrigger(existing[i]);
  }
  ScriptApp.newTrigger('apurarVotacoesPendentes').timeBased().everyHours(1).create();
  return { success: true, msg: 'Trigger horário ativado: apurarVotacoesPendentes' };
}

function deleteApuracaoVotacaoTrigger() {
  var removed = 0;
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'apurarVotacoesPendentes') { ScriptApp.deleteTrigger(existing[i]); removed++; }
  }
  return { success: true, removidos: removed };
}
