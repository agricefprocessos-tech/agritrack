// ================================================================
// AGRICEF — Votacao.gs
// Calibração de prioridade por comitê — votação dos 4 pilares
// (Classificação Estratégica, Impacto Financeiro, Urgência, Complexidade)
//
// Fluxo:
//   1. Ao criar um projeto, o gestor já define os 4 pilares (auto-avaliação).
//   2. notificarComiteVotacao_() abre a votação e dispara e-mail pro comitê
//      com a auto-avaliação e um link ?votar=CHAVE pro painel.
//   3. Cada membro do comitê registra o que acha que cada pilar deveria ser
//      (registrarVoto). Votação é aberta — todos veem os votos uns dos outros.
//   4. Um trigger horário (apurarVotacoesPendentes) verifica prazos vencidos,
//      calcula a moda de cada pilar entre os votos e atualiza o Jira.
//
// ARMAZENAMENTO — Script Properties, não Google Sheets.
// A votação ficou três semanas sem receber projeto nenhum porque o Drive da
// conta encheu: a planilha abria para leitura e recusava escrita, e o
// appendRow devolvia "Você não tem permissão para acessar o documento
// solicitado" — mensagem que despista, o problema era cota. Script Properties
// é armazenamento do próprio script e não conta na cota do Drive, então grava
// mesmo com o Drive cheio.
//
// Uma chave por projeto (VOT_AGTK-1234), não um blob único: cada registro tem
// ~300 bytes contra um teto de 9KB por valor, e votar não reescreve o conjunto
// inteiro. O teto total de 500KB comporta mais de mil projetos.
//
// A planilha antiga continua intacta como backup — ver migrarVotacaoDoSheets().
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

// ─── ARMAZENAMENTO (Script Properties) ──────────────────────────

const VOT_PREFIXO_ = 'VOT_';

function _votProps_() { return PropertiesService.getScriptProperties(); }

function _votChave_(key) { return VOT_PREFIXO_ + String(key || '').trim().toUpperCase(); }

// Devolve o registro do projeto, ou null se ele não está em votação.
// JSON inválido é tratado como ausente em vez de derrubar a chamada inteira:
// um registro corrompido não pode impedir a apuração dos outros projetos.
function _votLer_(key) {
  const bruto = _votProps_().getProperty(_votChave_(key));
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch (e) {
    console.error('_votLer_: registro ilegível em ' + _votChave_(key) + ' — ' + e.message);
    return null;
  }
}

function _votGravar_(reg) {
  if (!reg || !reg.chave) throw new Error('_votGravar_: registro sem chave.');
  _votProps_().setProperty(_votChave_(reg.chave), JSON.stringify(reg));
}

function _votApagar_(key) { _votProps_().deleteProperty(_votChave_(key)); }

// Uma única chamada de API devolve todas as propriedades; filtrar pelo prefixo
// aqui é mais barato que um getProperty por projeto na apuração.
function _votListar_() {
  const todas = _votProps_().getProperties();
  const out = [];
  Object.keys(todas).forEach(function (k) {
    if (k.indexOf(VOT_PREFIXO_) !== 0) return;
    try {
      const reg = JSON.parse(todas[k]);
      if (reg && reg.chave) out.push(reg);
    } catch (e) {
      console.error('_votListar_: registro ilegível em ' + k + ' — ' + e.message);
    }
  });
  return out;
}

// Registro novo, com o formato canônico. Concentrar a forma aqui evita que um
// campo faltando em algum caminho de escrita vire undefined lá na leitura.
function _votNovo_(key, resumo, scoresGestor, agora, prazo) {
  return {
    chave: String(key).trim().toUpperCase(),
    resumo: resumo || '',
    criado: agora.toISOString(),
    prazo: prazo.toISOString(),
    gestor: {
      classificacao: scoresGestor.classificacao || '',
      impacto:       scoresGestor.impacto || '',
      urgencia:      scoresGestor.urgencia || '',
      complexidade:  scoresGestor.complexidade || '',
    },
    apurado: false,
    final: null,
    votos: [],
  };
}

// Identidade do votante: e-mail quando houver (estável mesmo se o nome mudar),
// senão o nome normalizado — sem isto "Guilherme" e "guilherme " seriam duas
// pessoas diferentes e cada uma pesaria na moda.
function _idVotante_(nome, email) {
  var e = String(email || '').trim().toLowerCase();
  if (e) return 'e:' + e;
  return 'n:' + String(nome || '').trim().toLowerCase();
}

// Um votante = um voto: mantém só o mais recente de cada um. Protege a apuração
// dos votos duplicados herdados da planilha (gravados antes de registrarVoto
// passar a substituir). Sem isto, quem votasse 3x pesaria 3x em _moda_ e
// poderia decidir sozinho a prioridade do projeto.
function _dedupVotos_(votos) {
  var porVotante = {};
  votos.forEach(function (v) {
    var id = _idVotante_(v.votante, v.email);
    var t  = new Date(v.data).getTime() || 0;
    if (!porVotante[id] || t >= porVotante[id]._t) { v._t = t; porVotante[id] = v; }
  });
  return Object.keys(porVotante).map(function (k) { return porVotante[k]; });
}

// ─── NOTIFICAÇÃO AO CRIAR PROJETO ──────────────────────────────

function notificarComiteVotacao_(key, summary, scoresGestor) {
  const agora = new Date();
  const prazo = new Date(agora.getTime() + VOTACAO_PRAZO_HORAS * 3600 * 1000);

  // Grava antes de enviar e-mail: se o envio falhar, o projeto continua em
  // votação e o comitê ainda alcança pelo painel. O inverso perderia o registro.
  _votGravar_(_votNovo_(key, summary, scoresGestor, agora, prazo));

  const link = DASHBOARD_URL + '?votar=' + encodeURIComponent(key);
  const gestorCalc = _calcScore(scoresGestor);

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
    '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">' +
    '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px"><tr><td align="center">' +
    '<table width="600" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:600px">' +
    '<tr><td style="background:#0b0f17;padding:20px 28px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<span style="color:#e2e8f4;font-size:16px;font-weight:700">&#128499;&#65039; Novo projeto — calibrar prioridade</span>' +
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
      'AgriTrack — Votar prioridade de ' + key,
      'Acesse ' + link + ' para registrar sua avaliação.',
      { htmlBody: html, name: 'AgriTrack — Agricef' });
  });
}

// ─── REGISTRAR VOTO ─────────────────────────────────────────────

function registrarVoto(dados) {
  // O lock continua necessário mesmo com uma chave por projeto: dois membros do
  // comitê votando no MESMO projeto fazem read-modify-write na mesma chave, e o
  // e-mail manda todo mundo para o mesmo link — voto simultâneo no mesmo projeto
  // é o caso provável, não o raro.
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
    const reg = _votLer_(key);
    if (!reg) throw new Error('Projeto não está em votação (' + key + ').');
    if (reg.apurado) throw new Error('Votação já foi apurada para ' + key + '.');

    // Se este votante já votou neste projeto, o voto novo SUBSTITUI o anterior
    // (mudou de ideia) em vez de virar um segundo voto contado de novo na moda.
    const idNovo = _idVotante_(dados.votante, dados.email);
    const voto = {
      votante: dados.votante,
      email: dados.email || '',
      data: new Date().toISOString(),
      classificacao: dados.classificacao,
      impacto: dados.impacto,
      urgencia: dados.urgencia,
      complexidade: dados.complexidade,
    };
    reg.votos = reg.votos || [];
    let idx = -1;
    for (let i = 0; i < reg.votos.length; i++) {
      if (_idVotante_(reg.votos[i].votante, reg.votos[i].email) === idNovo) { idx = i; break; }
    }
    const substituiu = idx >= 0;
    if (substituiu) reg.votos[idx] = voto;
    else            reg.votos.push(voto);

    _votGravar_(reg);

    const r = buscarVotacao({ issueKey: key });
    if (r && r.success) r.substituiu = substituiu;
    return r;
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
    const reg = _votLer_(key);
    if (!reg) return { success: false, erro: 'Projeto não encontrado em votação: ' + key };

    const votos = _dedupVotos_(reg.votos || []).map(function (v) {
      const calc = _calcScore(v);
      return {
        votante: v.votante, data: v.data,
        classificacao: v.classificacao, impacto: v.impacto, urgencia: v.urgencia, complexidade: v.complexidade,
        score: calc.score, tier: calc.tier,
      };
    });

    const gestorCalc = _calcScore(reg.gestor);

    const resultado = {
      success: true,
      key: reg.chave,
      summary: reg.resumo,
      prazoApuracao: reg.prazo,
      apurado: !!reg.apurado,
      gestor: Object.assign({}, reg.gestor, gestorCalc),
      votos: votos,
    };
    if (reg.apurado && reg.final) {
      resultado.final = Object.assign({}, reg.final, _calcScore(reg.final));
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
  // Mesmo lock de registrarVoto() — evita apurar um projeto no exato momento em
  // que alguém registra voto nele.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (eLock) {
    console.warn('apurarVotacoesPendentes: não obteve lock, tentará na próxima execução do trigger.');
    return { success: false, erro: 'Lock ocupado — tentará novamente no próximo ciclo.' };
  }
  try {
    const agora = new Date();
    let apuradas = 0;

    _votListar_().forEach(function (reg) {
      if (reg.apurado) return;
      if (new Date(reg.prazo) > agora) return;

      const votos = _dedupVotos_(reg.votos || []);
      const final = {
        classificacao: _moda_(votos.map(function (v) { return v.classificacao; }), reg.gestor.classificacao),
        impacto:       _moda_(votos.map(function (v) { return v.impacto; }),       reg.gestor.impacto),
        urgencia:      _moda_(votos.map(function (v) { return v.urgencia; }),      reg.gestor.urgencia),
        complexidade:  _moda_(votos.map(function (v) { return v.complexidade; }),  reg.gestor.complexidade),
      };

      // Atualiza os campos reais no Jira
      try {
        jiraRequest_('PUT', '/rest/api/3/issue/' + reg.chave, {
          fields: {
            customfield_10271: { value: final.classificacao },
            customfield_10304: { value: final.impacto },
            customfield_10370: { value: final.urgencia },
            customfield_10403: { value: final.complexidade },
          },
        });
      } catch (eJira) { console.error('apurarVotacoesPendentes: erro ao atualizar ' + reg.chave + ': ' + eJira.message); }

      reg.apurado = true;
      reg.final = final;
      _votGravar_(reg);
      apuradas++;
    });

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

// ─── MIGRAÇÃO DA PLANILHA ANTIGA ────────────────────────────────

// Abre a planilha antiga só para LEITURA. Não cria nada: se o id não estiver
// configurado ou o arquivo não abrir, a migração simplesmente não tem o que
// fazer — a votação nova não depende disto.
function _abrirPlanilhaAntiga_() {
  const id = _votProps_().getProperty('VOTACAO_SHEET_ID');
  if (!id) return null;
  let ss;
  try { ss = SpreadsheetApp.openById(id); } catch (e) { return null; }
  const pendentes = ss.getSheetByName('Pendentes');
  const votos     = ss.getSheetByName('Votos');
  if (!pendentes || !votos) return null;
  return { ss: ss, pendentes: pendentes, votos: votos };
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

/**
 * Traz para Script Properties as votações que ficaram na planilha. Só leitura
 * do lado do Sheets — a planilha continua intacta como backup.
 *
 * Idempotente: por padrão pula projetos que já existem em Properties, para que
 * rodar duas vezes não desfaça votos registrados depois da migração. Passe
 * { sobrescrever: true } para forçar.
 */
function migrarVotacaoDoSheets(opts) {
  const sobrescrever = !!(opts && opts.sobrescrever);
  const out = { success: true, migrados: [], pulados: [], erros: [] };
  try {
    const sh = _abrirPlanilhaAntiga_();
    if (!sh) return { success: false, erro: 'Planilha antiga não encontrada — nada a migrar.' };

    const votosPorChave = {};
    _sheetToObjects_(sh.votos).forEach(function (v) {
      const k = String(v.Chave || '').trim().toUpperCase();
      if (!k) return;
      (votosPorChave[k] = votosPorChave[k] || []).push({
        votante: v.Votante, email: v.Email || '',
        data: v.DataVoto ? new Date(v.DataVoto).toISOString() : new Date(0).toISOString(),
        classificacao: v.Classificacao, impacto: v.Impacto,
        urgencia: v.Urgencia, complexidade: v.Complexidade,
      });
    });

    _sheetToObjects_(sh.pendentes).forEach(function (p) {
      const k = String(p.Chave || '').trim().toUpperCase();
      if (!k) return;
      try {
        if (!sobrescrever && _votLer_(k)) { out.pulados.push(k); return; }
        const reg = {
          chave: k,
          resumo: p.Resumo || '',
          criado: p.DataCriacao ? new Date(p.DataCriacao).toISOString() : new Date(0).toISOString(),
          prazo:  p.PrazoApuracao ? new Date(p.PrazoApuracao).toISOString() : new Date(0).toISOString(),
          gestor: {
            classificacao: p.GestorClass || '', impacto: p.GestorImpacto || '',
            urgencia: p.GestorUrgencia || '',   complexidade: p.GestorComplexidade || '',
          },
          apurado: !!p.Apurado,
          final: p.Apurado ? {
            classificacao: p.FinalClass || '', impacto: p.FinalImpacto || '',
            urgencia: p.FinalUrgencia || '',   complexidade: p.FinalComplexidade || '',
          } : null,
          votos: votosPorChave[k] || [],
        };
        _votGravar_(reg);
        out.migrados.push(k + ' (' + reg.votos.length + ' voto(s))');
      } catch (e) {
        out.erros.push(k + ': ' + e.message);
      }
    });

    out.planilhaBackup = sh.ss.getUrl();
  } catch (e) {
    out.success = false;
    out.erro = e.message;
  }
  return out;
}

// ─── DIAGNÓSTICO ────────────────────────────────────────────────

/**
 * Diagnóstico da votação (SÓ LEITURA). Existe porque notificarComiteVotacao_
 * é chamada dentro de um try/catch — quando ela falha, a criação do projeto
 * segue normalmente e sem este relatório ninguém fica sabendo que a votação
 * não foi aberta. Foi assim que o AGTK-2137 nasceu fora da votação.
 */
function diagnosticarVotacao() {
  var out = { success: true, armazenamento: 'ScriptProperties' };
  try {
    var regs = _votListar_();
    out.totalPendentes = regs.length;
    regs.sort(function (a, b) { return String(a.criado).localeCompare(String(b.criado)); });
    out.chaves = regs.map(function (r) {
      return { chave: r.chave, apurado: !!r.apurado, prazo: r.prazo, votos: (r.votos || []).length };
    }).slice(-15);
    out.totalVotos = regs.reduce(function (n, r) { return n + (r.votos || []).length; }, 0);
    out.comite = Object.keys(COMITE_VOTACAO);
    out.planilhaAntiga = _votProps_().getProperty('VOTACAO_SHEET_ID') || null;
  } catch (e) {
    out.success = false;
    out.erro = e.message;
  }
  return out;
}

/**
 * Roda os mesmos pré-requisitos de notificarComiteVotacao_ e diz em qual etapa
 * quebra — SEM abrir votação e SEM enviar e-mail.
 */
function diagnosticarNotificacaoVotacao() {
  var etapas = [];
  try {
    etapas.push('DASHBOARD_URL: ' + (typeof DASHBOARD_URL !== 'undefined' && DASHBOARD_URL ? 'ok' : 'INDEFINIDO'));
    etapas.push('esc_: ' + (typeof esc_ === 'function' ? 'ok' : 'INDEFINIDO'));
    etapas.push('_calcScore: ' + (typeof _calcScore === 'function' ? 'ok' : 'INDEFINIDO'));
    etapas.push('COMITE_VOTACAO: ' + JSON.stringify(Object.keys(COMITE_VOTACAO)));

    var calc = _calcScore({ classificacao: 'Sustentação e Excelência Operacional',
                            impacto: 'Marginal', urgencia: 'Baixa (Desejável)', complexidade: 'Baixa' });
    etapas.push('score calculado: ' + JSON.stringify(calc));

    etapas.push('projetos em votação: ' + _votListar_().length);

    try { etapas.push('cota Gmail restante: ' + MailApp.getRemainingDailyQuota()); }
    catch (eq) { etapas.push('cota Gmail: NAO CONSEGUIU LER (' + eq.message + ')'); }

    return { success: true, etapas: etapas };
  } catch (e) {
    return { success: false, etapas: etapas, erroNaProximaEtapa: e.message };
  }
}

/**
 * Testa SÓ a escrita do armazenamento — o passo que falhava silenciosamente
 * quando a votação ainda vivia no Sheets e o Drive encheu. Grava uma chave
 * marcada, confirma a releitura e remove.
 */
function testarEscritaVotacao() {
  var out = { armazenamento: 'ScriptProperties' };
  var chaveTeste = '__TESTE_ESCRITA__';
  try {
    out.projetosAntes = _votListar_().length;
    _votGravar_(_votNovo_(chaveTeste, 'registro de diagnostico (removido em seguida)',
      { classificacao: '', impacto: '', urgencia: '', complexidade: '' }, new Date(), new Date()));
    var lido = _votLer_(chaveTeste);
    out.escritaFuncionou = !!lido && lido.chave === chaveTeste;
    _votApagar_(chaveTeste);
    out.removido = _votLer_(chaveTeste) === null;
    out.projetosDepois = _votListar_().length;
    out.success = true;
  } catch (e) {
    out.success = false;
    out.erro = e.message;
    try { _votApagar_(chaveTeste); } catch (e2) {}
  }
  return out;
}

/**
 * Chama notificarComiteVotacao_ de verdade e DEIXA o erro aparecer, em vez de
 * escondê-lo num console.error como faz o caminho de criação de projeto.
 * ATENÇÃO: abre votação de verdade e ENVIA e-mail ao comitê.
 */
function testarNotificacaoReal(dados) {
  var key = (dados && dados.issueKey) || '__TESTE__';
  try {
    notificarComiteVotacao_(key, 'Teste de diagnostico da votacao', {
      classificacao: 'Sustentação e Excelência Operacional',
      impacto: 'Marginal', urgencia: 'Backlog', complexidade: 'Baixa',
    });
    return { success: true, msg: 'notificarComiteVotacao_ rodou sem erro para ' + key };
  } catch (e) {
    return { success: false, erroReal: e.message, stack: String(e.stack || '').slice(0, 600) };
  }
}

// Campos dos 4 pilares no Jira — os mesmos que a apuração escreve de volta.
const VOT_CAMPOS_PILARES_ = {
  classificacao: 'customfield_10271',
  impacto:       'customfield_10304',
  urgencia:      'customfield_10370',
  complexidade:  'customfield_10403',
};

/**
 * Abre votação para um projeto que já existe no Jira, lendo os 4 pilares de lá
 * em vez de recebê-los do painel.
 *
 * Existe para recuperar os projetos que foram criados enquanto a votação estava
 * quebrada — o AGTK-2137 é o caso original: nasceu em 31/08, com os 4 pilares
 * preenchidos, e nunca chegou ao comitê porque a gravação falhava em silêncio.
 *
 * Recusa reabrir um projeto que já está em votação, para não zerar votos já
 * registrados. ENVIA e-mail ao comitê, como qualquer abertura de votação.
 */
function abrirVotacao(dados) {
  try {
    const key = (dados.issueKey || '').trim().toUpperCase();
    if (!key) throw new Error('issueKey obrigatório.');

    const jaExiste = _votLer_(key);
    if (jaExiste && !dados.forcar) {
      return { success: false, erro: 'Já está em votação (' + key + '), com '
        + (jaExiste.votos || []).length + ' voto(s). Use forcar:true para reabrir e PERDER os votos.' };
    }

    const campos = Object.keys(VOT_CAMPOS_PILARES_).map(function (k) { return VOT_CAMPOS_PILARES_[k]; });
    const issue = jiraRequest_('GET', '/rest/api/3/issue/' + key + '?fields=summary,' + campos.join(','));
    if (!issue || !issue.key) throw new Error('Issue não encontrada no Jira: ' + key);

    const f = issue.fields || {};
    const valor = function (nome) {
      const c = f[VOT_CAMPOS_PILARES_[nome]];
      return (c && c.value) ? c.value : '';
    };
    const scores = {
      classificacao: valor('classificacao'),
      impacto:       valor('impacto'),
      urgencia:      valor('urgencia'),
      complexidade:  valor('complexidade'),
    };

    const faltando = Object.keys(scores).filter(function (k) { return !scores[k]; });
    if (faltando.length) {
      return { success: false, erro: 'O projeto não tem os 4 pilares preenchidos no Jira. Faltando: '
        + faltando.join(', ') + '. Preencha no Jira antes de abrir a votação.' };
    }

    notificarComiteVotacao_(key, f.summary || key, scores);
    return { success: true, chave: key, summary: f.summary, gestor: Object.assign({}, scores, _calcScore(scores)),
             reaberto: !!jaExiste };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}

/**
 * Remove um projeto da votação. Usado para limpar registros de teste — o
 * caminho normal é a apuração, que mantém o histórico.
 */
function removerDaVotacao(dados) {
  try {
    var key = (dados.issueKey || '').trim().toUpperCase();
    if (!key) throw new Error('issueKey obrigatório.');
    var existia = _votLer_(key) !== null;
    _votApagar_(key);
    return { success: true, chave: key, existia: existia };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}
