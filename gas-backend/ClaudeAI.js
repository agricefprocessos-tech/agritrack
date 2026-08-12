// ================================================================
// AGRICEF — ClaudeAI.gs
// Chamadas ao Claude (Anthropic) para a Análise de Riscos e o Chat de
// Compras. Substitui as chamadas ao Gemini que o painel fazia direto
// do navegador com a chave no localStorage — ou seja, cada gestor
// precisava obter e colar a própria chave, e a chave trafegava no
// browser. Aqui a chave fica em Script Properties (ANTHROPIC_API_KEY),
// junto de JIRA_TOKEN e APP_SHARED_SECRET.
//
// Apps Script não tem SDK da Anthropic, então é HTTP direto via
// UrlFetchApp, no mesmo padrão de jiraRequest_().
//
// ⚠️ O web app é ANYONE_ANONYMOUS: estas ações custam dinheiro por
// chamada, então estão em ACOES_MUTANTES (exigem APP_SHARED_SECRET)
// mesmo sendo semanticamente leitura.
// ================================================================

var CLAUDE_URL_     = 'https://api.anthropic.com/v1/messages';
var CLAUDE_VERSION_ = '2023-06-01';
var CLAUDE_MODELO_  = 'claude-opus-5';

/**
 * Chamada única ao Claude. Devolve {success, texto, uso} ou {success:false, erro}.
 *
 * Diferenças em relação ao payload do Gemini que estava aqui antes:
 *  - `temperature` não existe mais: o Opus 5 rejeita com HTTP 400. O tom é
 *    orientado pelo prompt.
 *  - `thinkingConfig:{thinkingBudget:0}` vira `output_config.effort`. O
 *    thinking é ligado por padrão; desligá-lo só é permitido em effort até
 *    "high" e pode vazar tags internas no texto, então mantemos ligado em
 *    effort baixo — que no Opus 5 já rende bem e sai mais barato/rápido.
 *  - `max_tokens` agora cobre thinking + resposta, então precisa de folga.
 */
function _claudeMessages_(opcoes) {
  var chave = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!chave) {
    return { success: false, erro: 'ANTHROPIC_API_KEY não configurada nas Script Properties.' };
  }

  var corpo = {
    model: opcoes.modelo || CLAUDE_MODELO_,
    max_tokens: opcoes.maxTokens || 4096,
    messages: opcoes.messages,
    output_config: { effort: opcoes.effort || 'low' },
  };
  if (opcoes.system) corpo.system = opcoes.system;

  var resp;
  try {
    resp = UrlFetchApp.fetch(CLAUDE_URL_, {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': chave, 'anthropic-version': CLAUDE_VERSION_ },
      payload: JSON.stringify(corpo),
      muteHttpExceptions: true,
    });
  } catch (e) {
    return { success: false, erro: 'Falha de rede ao chamar o Claude: ' + e.message };
  }

  var codigo = resp.getResponseCode();
  var json;
  try { json = JSON.parse(resp.getContentText()); }
  catch (e) { return { success: false, erro: 'Resposta ilegível do Claude (HTTP ' + codigo + ')' }; }

  if (codigo !== 200) {
    var det = (json && json.error && json.error.message) || resp.getContentText().slice(0, 300);
    var amigavel = det;
    if (codigo === 401) amigavel = 'Chave da API rejeitada — confira ANTHROPIC_API_KEY.';
    else if (codigo === 429) amigavel = 'Limite de uso atingido. Tente de novo em alguns instantes.';
    else if (codigo >= 500) amigavel = 'A API do Claude está instável no momento. Tente de novo.';
    return { success: false, erro: amigavel, http: codigo, detalhe: det };
  }

  // stop_reason precisa ser checado ANTES de ler content: numa recusa o
  // array pode vir vazio, e indexar content[0] quebraria.
  if (json.stop_reason === 'refusal') {
    return {
      success: false,
      recusa: true,
      erro: 'O modelo recusou responder a esta solicitação por política de uso.',
      categoria: json.stop_details && json.stop_details.category,
    };
  }

  var texto = '';
  (json.content || []).forEach(function (bloco) {
    if (bloco.type === 'text') texto += bloco.text;
  });
  if (!texto) {
    return { success: false, erro: 'O Claude respondeu sem texto (stop_reason: ' + json.stop_reason + ').' };
  }

  return {
    success: true,
    texto: texto,
    uso: json.usage || null,
    truncado: json.stop_reason === 'max_tokens',
  };
}

/**
 * Análise de riscos do portfólio para a reunião semanal.
 * O painel monta o prompt (ele tem os dados carregados) e manda pronto.
 */
function analiseRiscosIA(dados) {
  dados = dados || {};
  var prompt = (dados.prompt || '').trim();
  if (!prompt) return { success: false, erro: 'prompt não informado' };
  if (prompt.length > 120000) prompt = prompt.slice(0, 120000);

  return _claudeMessages_({
    system: 'Você é um analista de PMO industrial da Agricef. Responda em português do Brasil, '
          + 'direto ao ponto e sem introdução. Priorize o que muda a decisão do gestor na reunião: '
          + 'causa raiz, o que perguntar ao responsável e a próxima ação concreta. '
          + 'Não inclua tags XML internas na resposta.',
    messages: [{ role: 'user', content: prompt }],
    maxTokens: 8000,
    effort: dados.effort || 'medium',
  });
}

/**
 * Chat da aba Compras. O painel só chega aqui quando o motor local
 * (interpretarLocal) não soube responder.
 */
function chatCompras(dados) {
  dados = dados || {};
  var pergunta = (dados.pergunta || '').trim();
  if (!pergunta) return { success: false, erro: 'pergunta não informada' };

  var historico = Array.isArray(dados.historico) ? dados.historico : [];
  var messages = [];
  historico.slice(-12).forEach(function (m) {
    if (!m || !m.texto) return;
    messages.push({ role: m.papel === 'bot' ? 'assistant' : 'user', content: String(m.texto) });
  });
  messages.push({ role: 'user', content: pergunta });
  // A conversa precisa começar com o usuário
  while (messages.length && messages[0].role !== 'user') messages.shift();

  var contexto = String(dados.contexto || '');
  var system = [{
    type: 'text',
    text: 'Você é assistente de compras industriais da Agricef. Responda em português do Brasil, '
        + 'de forma concisa, usando listas quando ajudar. Baseie-se apenas nos dados abaixo; '
        + 'se a resposta não estiver neles, diga isso em vez de supor.\n\n' + contexto,
    // O contexto (amostra da planilha) se repete a cada turno da conversa,
    // então marcá-lo como cacheável derruba o custo dos turnos seguintes.
    cache_control: { type: 'ephemeral' },
  }];

  return _claudeMessages_({
    system: system,
    messages: messages,
    maxTokens: 3000,
    effort: 'low',
  });
}

/** Diz ao painel se a IA está utilizável, sem expor a chave. */
function statusIA() {
  var k = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  return { success: true, configurada: !!k, modelo: CLAUDE_MODELO_ };
}
