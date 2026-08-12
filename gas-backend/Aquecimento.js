// ================================================================
// AGRICEF — Aquecimento.gs
// Mantém o script quente e o resultado de buscarTarefasJira pronto em
// cache, para que abrir o painel não custe uma travessia completa do
// Jira.
//
// Problema medido em 2026-08-12, três chamadas seguidas de
// buscarTarefasJira no painel em produção:
//
//   1ª (a frio, após ociosidade)  22,6s  → FALHOU: devolveu HTML
//   2ª                            20,9s  → ok
//   3ª (quente)                    8,0s  → ok
//
// Duas causas somadas:
//  a) cold start do Apps Script depois de um período sem execuções;
//  b) buscarTarefasJira pagina o Jira de 100 em 100 — com ~811 itens são
//     ~9 requisições HTTP sequenciais, TODA vez que alguém abre o painel.
//
// Quando a soma estoura o limite do web app, o Google devolve a página de
// erro em HTML no lugar do JSON, e o painel cai no cache local mostrando
// "⚠ Erro na busca — usando cache". Na prática, o primeiro gestor a abrir
// o painel de manhã via dado velho e um aviso de erro.
//
// A correção ataca (b), que é determinística: um gatilho periódico busca
// do Jira e guarda o resultado no CacheService. O painel passa a ler o
// que já está pronto. Como efeito colateral o gatilho também mantém o
// script quente, atacando (a) — mas isso é bônus, não a garantia.
//
// Para ativar, execute UMA VEZ no editor GAS:
//   setupAquecimentoTrigger()
// Para remover: deleteAquecimentoTrigger()
// ================================================================

var TAREFAS_CACHE_CHAVE_ = 'tarefas_jira_v1';

// A cada 5 min: curto o bastante para o container não esfriar e para o
// painel nunca ver dado muito velho. São ~288 execuções/dia × ~9 chamadas
// ao Jira ≈ 2.600 UrlFetch/dia, bem abaixo da cota diária do Apps Script.
var AQUECIMENTO_MINUTOS_ = 5;

/**
 * Entrada pública usada pelo painel. Serve do cache quando há; senão vai
 * ao Jira e guarda para o próximo.
 *
 * O corpo que fala com o Jira é _buscarTarefasJiraDoJira_ (FormPCP.js).
 * Passe {forcar:true} para ignorar o cache.
 */
function buscarTarefasJira(dados) {
  if (!(dados && dados.forcar)) {
    var doCache = _lerCache_(TAREFAS_CACHE_CHAVE_);
    if (doCache && doCache.success) {
      doCache.doCache = true;
      doCache.idadeSeg = doCache.geradoEm
        ? Math.round((Date.now() - doCache.geradoEm) / 1000)
        : null;
      return doCache;
    }
  }
  return _atualizarCacheTarefas_();
}

/** Busca do Jira e grava no cache. Devolve o mesmo objeto de sempre. */
function _atualizarCacheTarefas_() {
  var r = _buscarTarefasJiraDoJira_();
  if (r && r.success) {
    r.geradoEm = Date.now();
    _gravarCache_(TAREFAS_CACHE_CHAVE_, r);
    r.doCache = false;
    r.idadeSeg = 0;
  }
  return r;
}

/**
 * Zera o cache. Chamado depois de qualquer ação que altere tarefas — sem
 * isso o gestor salvaria uma data, daria F5 e veria o valor antigo voltar
 * do cache do servidor, o que é pior que a lentidão que estamos
 * resolvendo. O próximo leitor paga a ida ao Jira e recebe a verdade.
 */
function _invalidarCacheTarefas_() {
  try {
    var c = CacheService.getScriptCache();
    var n = parseInt(c.get(TAREFAS_CACHE_CHAVE_ + '_n') || '0', 10);
    var chaves = [TAREFAS_CACHE_CHAVE_ + '_n'];
    for (var i = 0; i < n; i++) chaves.push(TAREFAS_CACHE_CHAVE_ + '_' + i);
    c.removeAll(chaves);
    return true;
  } catch (e) { return false; }
}

/** Handler do gatilho. */
function aquecerCacheJira() {
  var t0 = Date.now();
  try {
    var r = _atualizarCacheTarefas_();
    var ms = Date.now() - t0;
    if (!r || !r.success) {
      console.warn('aquecerCacheJira: falhou em ' + ms + 'ms — ' + ((r && r.erro) || 'sem detalhe'));
      return { success: false, ms: ms, erro: (r && r.erro) || 'falha desconhecida' };
    }
    console.log('aquecerCacheJira: ' + r.total + ' itens em ' + ms + 'ms');
    return { success: true, total: r.total, ms: ms };
  } catch (e) {
    console.error('aquecerCacheJira ERRO: ' + e.message);
    return { success: false, erro: e.message };
  }
}

function setupAquecimentoTrigger() {
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'aquecerCacheJira') ScriptApp.deleteTrigger(existentes[i]);
  }
  ScriptApp.newTrigger('aquecerCacheJira').timeBased().everyMinutes(AQUECIMENTO_MINUTOS_).create();
  // Já popula o cache agora, para não esperar o primeiro disparo.
  var r = aquecerCacheJira();
  return { success: true, msg: 'Gatilho ativado: aquecerCacheJira a cada ' + AQUECIMENTO_MINUTOS_ + ' min', primeiraCarga: r };
}

function deleteAquecimentoTrigger() {
  var removidos = 0;
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'aquecerCacheJira') { ScriptApp.deleteTrigger(existentes[i]); removidos++; }
  }
  return { success: true, removidos: removidos };
}

/** Diz ao painel se o aquecimento está ativo e quão fresco está o cache. */
function statusAquecimentoTrigger() {
  var ativo = false;
  var gatilhos = ScriptApp.getProjectTriggers();
  for (var i = 0; i < gatilhos.length; i++) {
    if (gatilhos[i].getHandlerFunction() === 'aquecerCacheJira') { ativo = true; break; }
  }
  var c = _lerCache_(TAREFAS_CACHE_CHAVE_);
  return {
    success: true,
    ativo: ativo,
    intervaloMin: AQUECIMENTO_MINUTOS_,
    cacheQuente: !!(c && c.success),
    itens: (c && c.total) || 0,
    idadeSeg: (c && c.geradoEm) ? Math.round((Date.now() - c.geradoEm) / 1000) : null,
  };
}
