// ================================================================
// AGRICEF — FormPCP.gs
// Backend: Criação de Projetos — todos os departamentos
//
// ⚠️  Desativar Regras Jira 07‑09 (PCP) e similares antes de usar.
//     Manter ativa a regra "casca" (Nivel de Prioridade).
// Credenciais: Script Properties → JIRA_EMAIL + JIRA_TOKEN
// ================================================================

const JIRA_BASE    = 'https://agricefprojetos.atlassian.net';
const JIRA_PROJECT = 'AGTK';

// ─── CATÁLOGO DE TIPOS — fonte única de verdade ───────────────
// Espelhado no frontend (CATALOGO_JS em FormularioPCP.html).
// Ao adicionar um tipo aqui, adicionar também no frontend.

const CATALOGO = {
  PCP: {
    label: 'PCP — Planejamento e Controle de Produção',
    tipos: {
      PPP: {
        label: 'PPP — Plano Mestre (Irrigador, Sider, IRRIGAI, Plantadora)',
        categoria: 'PPP', prefixo: 'PPP',
        subtarefas: ['Preparação e Plan.','Compras','Fabricação','Montagens','Testes'],
        campos: ['produto','serial','qtd','cliente','numeroProjeto'],
      },
      HAULER: {
        label: 'Hauler — Caminhão de Tubos (PPH1 + PPH2)',
        categoria: null,   // tratado por criarHaulerJira()
        prefixo: 'P157',
        subtarefas: null,
        campos: ['hauler'],
      },
    },
  },
  Engenharia: {
    label: 'Engenharia',
    tipos: {
      MDC: {
        label: 'MDC — Melhorias Dedicadas a Cliente',
        categoria: 'MDC', prefixo: 'MDC',
        subtarefas: ['Projeto Virtual 3D','Detalhamento 2D','Projeto Virtual Eletroeletrônico',
                     'Projeto Físico Eletroeletrônico','Projeto Virtual Software',
                     'Testes e Validação','Documentação Final'],
        campos: ['titulo','cliente','numeroProjeto'],
      },
      PM: {
        label: 'PM — Projeto Mecânico',
        categoria: 'PM', prefixo: 'PM',
        subtarefas: ['Levantamento de Requisitos','Concepção e Estudos Preliminares',
                     'Projeto Virtual - Modelagem 3D','Detalhamento Técnico e Documentação',
                     'Prototipagem e Fabricação Piloto','Testes e Validação',
                     'Documentação Final e Liberação'],
        campos: ['titulo','cliente','numeroProjeto'],
      },
      PE: {
        label: 'PE — Projeto Eletroeletrônico',
        categoria: 'PE', prefixo: 'PE',
        subtarefas: ['Levantamento de Requisitos','Concepção do Sistema',
                     'Projeto Virtual Eletroeletrônico','Prototipagem e Testes',
                     'Integração e Validação','Documentação Final e Liberação'],
        campos: ['titulo','cliente','numeroProjeto'],
      },
      PS: {
        label: 'PS — Projeto de Software',
        categoria: 'PS', prefixo: 'PS',
        subtarefas: ['Levantamento de Requisitos','Arquitetura e Design do Sistema',
                     'Desenvolvimento e Implementação Inicial','Testes e Validação',
                     'Integração com Hardware','Ajustes e Otimizações'],
        campos: ['titulo','cliente','numeroProjeto'],
      },
      MPC: {
        label: 'MPC — Melhorias de Produtos Consolidados',
        categoria: 'MPC', prefixo: 'MPC',
        subtarefas: ['Planejamento e análise de melhorias',
                     'Desenvolvimento e apresentação de propostas',
                     'Implementações melhorias projeto eletroeletrônico',
                     'Implementações melhorias projeto de software',
                     'Implementações melhorias projeto virtual 3D/2D'],
        campos: ['titulo','numeroProjeto'],
      },
      POI: {
        label: 'PO&I — Pesquisa, Desenvolvimento e Inovação',
        categoria: 'PD&I', prefixo: 'PO&I',
        subtarefas: ['Levantamento de Requisitos e Estado da Arte',
                     'Concepção e Planejamento','Desenvolvimento e Experimentação',
                     'Validação e Testes','Documentação e Liberação'],
        campos: ['titulo'],
      },
    },
  },
  Ensaios: {
    label: 'Ensaios',
    tipos: {
      AMEP: {
        label: 'AMEP — Avaliação / Exploratória Padrão',
        categoria: 'AMEP', prefixo: 'AMEP',
        subtarefas: ['Coleta de Dados','Análise de Dados','Relatório Preliminar','Relatório Final'],
        campos: ['titulo','cliente'],
      },
      'AMEP-NP': {
        label: 'AMEP-NP — Avaliação Não Padrão',
        categoria: 'AMEP-NP', prefixo: 'AMEP-NP',
        subtarefas: ['Preparação / Planejamento','Coleta de Dados 1','Análise 1','Preliminar 1',
                     'Coleta de Dados 2','Análise 2','Relatório Final'],
        campos: ['titulo','cliente'],
      },
      DRE: {
        label: 'DRE — Fazenda Conectada / DRE',
        categoria: 'DRE', prefixo: 'FAZ. C.',
        subtarefas: ['Análise de Dados','Relatório Preliminar','Relatório Final'],
        campos: ['titulo'],
      },
      EXP: {
        label: 'EXP — Exploratória',
        categoria: 'EXP', prefixo: 'EXP',
        subtarefas: ['Preparação','Coleta de Dados','Análise de Dados','Relatório Final'],
        campos: ['titulo'],
      },
      Safra: {
        label: 'Safra',
        categoria: 'Safra', prefixo: 'SAFRA',
        subtarefas: ['Análise de Dados','Relatório Preliminar','Relatório Final'],
        campos: ['titulo'],
      },
      Safrinha: {
        label: 'Safrinha',
        categoria: 'Safrinha', prefixo: 'SAFRINHA',
        subtarefas: ['Análise de Dados','Relatório Preliminar','Relatório Final'],
        campos: ['titulo'],
      },
    },
  },
  'SU.C': {
    label: 'Sucesso do Cliente (SU.C)',
    tipos: {
      PME: {
        label: 'PME — Plano de Manutenção de Equipamentos',
        categoria: 'PME', prefixo: 'PME',
        subtarefas: ['Análise do Implemento','Compras','Fabricação','Montagem','Teste'],
        campos: ['titulo','cliente','osNumero'],
      },
    },
  },
  COMERCIAL: {
    label: 'Comercial',
    tipos: {
      COMERCIAL: {
        label: 'Comercial — Tarefa geral',
        categoria: null, prefixo: 'COMERCIAL',
        subtarefas: [],
        campos: ['titulo'],
      },
    },
  },
  Marketing: {
    label: 'Marketing',
    tipos: {
      'EMK-ENDO': {
        label: 'Endomarketing',
        categoria: 'EMK', prefixo: 'ENDM',
        subtarefas: [],
        campos: ['titulo'],
      },
      'EMK-EXT': {
        label: 'Marketing Externo',
        categoria: 'EMK', prefixo: 'MKT.E',
        subtarefas: [],
        campos: ['titulo'],
      },
      'EMK-DOC': {
        label: 'Instrutivos / Documentação Técnica',
        categoria: 'EMK', prefixo: 'DOC',
        subtarefas: [],
        campos: ['titulo'],
      },
    },
  },
};

// ─── DISPATCHER PRINCIPAL (chamado via fetch do frontend) ─────

function criarProjetoJira(dados) {
  try {
    if (dados.tipo === 'HAULER') return criarHaulerJira(dados);
    return criarProjetoSimples_(dados);
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── CRIAÇÃO GENÉRICA (todos exceto Hauler) ───────────────────

function criarProjetoSimples_(dados) {
  const deptCfg = CATALOGO[dados.departamento];
  if (!deptCfg) throw new Error('Departamento desconhecido: ' + dados.departamento);
  const tipoCfg = deptCfg.tipos[dados.tipo];
  if (!tipoCfg) throw new Error('Tipo desconhecido: ' + dados.tipo);

  const summary  = buildSummaryGenerico_(dados, tipoCfg);
  const body     = buildBodyGenerico_(dados, tipoCfg, summary);
  const resp     = jiraRequest_('POST', '/rest/api/3/issue', body);
  if (!resp.key) throw new Error('Erro ao criar tarefa: ' + JSON.stringify(resp));

  const resultado = {
    key:      resp.key,
    url:      JIRA_BASE + '/browse/' + resp.key,
    subtasks: [],
  };

  // Criar subtarefas com datas distribuídas igualmente
  const sts = tipoCfg.subtarefas || [];
  if (sts.length > 0 && dados.startDate && dados.dueDate) {
    const total  = Math.max(1, (new Date(dados.dueDate) - new Date(dados.startDate)) / 86400000);
    const step   = Math.max(3, Math.round(total / sts.length));
    for (let i = 0; i < sts.length; i++) {
      const stStart = addDias_(dados.startDate, i * step);
      const stEnd   = addDias_(dados.startDate, (i + 1) * step);
      const r = criarSubtarefa_(resp.key, sts[i], stStart, stEnd);
      if (r.key) resultado.subtasks.push(r.key);
    }
  }

  // Notifica o comitê para votação de prioridade (não bloqueia a criação se falhar)
  try {
    if (typeof notificarComiteVotacao_ === 'function' && dados.classificacao) {
      notificarComiteVotacao_(resp.key, summary, {
        classificacao: dados.classificacao || '',
        impacto:       dados.impactoFinanceiro || '',
        urgencia:      dados.urgencia || '',
        complexidade:  dados.complexidade || '',
      });
    }
  } catch (eVot) { console.error('notificarComiteVotacao_ ERRO: ' + eVot.message); }

  return { success: true, resultado };
}

function buildSummaryGenerico_(dados, tipoCfg) {
  const partes = [];
  if (dados.numeroProjeto) partes.push('P' + dados.numeroProjeto);
  partes.push(tipoCfg.prefixo);
  partes.push(dados.titulo || dados.clienteNome || '');
  if (dados.clienteNome && dados.titulo) partes.push(dados.clienteNome);
  if (dados.osNumero) partes.push('OS' + dados.osNumero);
  return partes.filter(Boolean).join(' - ');
}

function buildBodyGenerico_(dados, tipoCfg, summary) {
  const fields = {
    project:           { key: JIRA_PROJECT },
    issuetype:         { name: 'Tarefa' },
    summary:           summary,
    customfield_10073: dados.departamento,
    customfield_10015: dados.startDate,
    duedate:           dados.dueDate,
    customfield_10469: dados.baselineDate || dados.dueDate,
    customfield_10470: dados.alvoDate     || dados.dueDate,
  };
  // Campos select: só envia se tiver valor válido (evita erro Jira com {value:undefined})
  if (dados.classificacao)      fields.customfield_10271 = { value: dados.classificacao };
  if (dados.impactoFinanceiro)  fields.customfield_10304 = { value: dados.impactoFinanceiro };
  if (dados.alinhamento)        fields.customfield_10337 = { value: dados.alinhamento };
  if (dados.urgencia)           fields.customfield_10370 = { value: dados.urgencia };
  if (dados.complexidade)       fields.customfield_10403 = { value: dados.complexidade };
  if (tipoCfg.categoria)        fields.customfield_10205 = { value: tipoCfg.categoria };
  if (dados.clienteNome)        fields.customfield_10038 = dados.clienteNome;
  // customfield_10139 (Número do projeto) é select com IDs fixos — não enviar no create
  return { fields };
}

// ─── HAULER — PPH1 + PPH2 (lógica específica) ────────────────

function criarHaulerJira(dados) {
  try {
    const resultado = { chaves: {} };

    if (dados.criarFases !== 'f2') {
      const datasF1   = calcularDatasF1_(dados.startDate);
      const summaryF1 = buildSummaryHauler_('F1', dados);
      const dueDateF1 = dados.baselineDate || datasF1.preMontagem.end;

      const resF1 = jiraRequest_('POST', '/rest/api/3/issue',
        buildBodyHauler_('PPH1', summaryF1, dados, dados.startDate, dueDateF1));
      if (!resF1.key) throw new Error('Erro PPH1: ' + JSON.stringify(resF1));

      resultado.chaves.f1     = resF1.key;
      resultado.chaves.f1_url = JIRA_BASE + '/browse/' + resF1.key;
      resultado.chaves.f1_subtasks = [];

      const subtasksF1 = [
        { nome: 'Preparação e Plan.',    ...datasF1.prep        },
        { nome: 'Compras',              ...datasF1.compras      },
        { nome: 'Fabricação (Osti)',    ...datasF1.fabOsti      },
        { nome: 'Fabricação (Agricef)', ...datasF1.fabAgricef   },
        { nome: 'Pré – Montagem',       ...datasF1.preMontagem  },
      ];
      for (const st of subtasksF1) {
        const r = criarSubtarefa_(resF1.key, st.nome, st.start, st.end);
        if (r.key) resultado.chaves.f1_subtasks.push(r.key);
      }
    }

    if (dados.criarFases !== 'f1') {
      const diaC      = dados.diaC || dados.startDate;
      const stF2      = calcularSubtasksF2_(diaC, dados);
      const summaryF2 = buildSummaryHauler_('F2', dados);
      const dueDateF2 = stF2[stF2.length - 1].end;

      const resF2 = jiraRequest_('POST', '/rest/api/3/issue',
        buildBodyHauler_('PPH2', summaryF2, dados, diaC, dueDateF2));
      if (!resF2.key) throw new Error('Erro PPH2: ' + JSON.stringify(resF2));

      resultado.chaves.f2     = resF2.key;
      resultado.chaves.f2_url = JIRA_BASE + '/browse/' + resF2.key;
      resultado.chaves.f2_subtasks = [];

      for (const st of stF2) {
        const r = criarSubtarefa_(resF2.key, st.nome, st.start, st.end);
        if (r.key) resultado.chaves.f2_subtasks.push(r.key);
      }
    }

    return { success: true, resultado };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

function buildSummaryHauler_(fase, dados) {
  const dim    = dados.diametro + '"';
  const serial = dados.serial || 'S22000XXX';
  let   dest;
  if      (dados.destino === 'estoque') dest = '(Estoque - ' + serial + ')';
  else if (dados.destino === 'interno') dest = '(' + (dados.clienteNome || 'Agricef') + ')';
  else {
    const num = dados.clienteNumero ? ' ' + dados.clienteNumero : '';
    dest = '(' + serial + ') ' + (dados.clienteNome || '') + num;
  }
  return 'P157 - CAMINHAO DE TUBOS HAULER ' + dim + ' - ' + dest + ' - ' + fase;
}

function buildBodyHauler_(categoria, summary, dados, startDate, dueDate) {
  const fields = {
    project:           { key: JIRA_PROJECT },
    issuetype:         { name: 'Tarefa' },
    summary:           summary,
    customfield_10205: { value: categoria },
    customfield_10073: 'PCP',
    customfield_10038: dados.clienteNome || '',
    customfield_10015: startDate,
    duedate:           dueDate,
    customfield_10469: dados.baselineDate || dueDate,
    customfield_10470: dados.alvoDate     || dueDate,
  };
  if (dados.classificacao)     fields.customfield_10271 = { value: dados.classificacao };
  if (dados.impactoFinanceiro) fields.customfield_10304 = { value: dados.impactoFinanceiro };
  if (dados.alinhamento)       fields.customfield_10337 = { value: dados.alinhamento };
  if (dados.urgencia)          fields.customfield_10370 = { value: dados.urgencia };
  if (dados.complexidade)      fields.customfield_10403 = { value: dados.complexidade };
  if (dados.serial)            fields.customfield_10537 = dados.serial;
  return { fields };
}

// ─── DATAS F1 ────────────────────────────────────────────────

function calcularDatasF1_(startDate) {
  const d = n => addDias_(startDate, n);
  return {
    prep:        { start: startDate, end: d(7)  },
    compras:     { start: d(7),      end: d(35) },
    fabOsti:     { start: d(7),      end: d(49) },
    fabAgricef:  { start: d(7),      end: d(49) },
    preMontagem: { start: d(49),     end: d(63) },
  };
}

// ─── DATAS F2 ────────────────────────────────────────────────

function calcularSubtasksF2_(diaC, dados) {
  const d   = n => addDias_(diaC, n);
  const sts = [];
  if (dados.alongamento) {
    sts.push({ nome: 'Alongamento Osti', start: diaC,  end: d(14) });
    sts.push({ nome: 'Montagens Osti',   start: d(14), end: d(35) });
    sts.push({ nome: 'Montagens',        start: d(35), end: d(49) });
    sts.push({ nome: 'Montagens 2',      start: d(49), end: d(56) });
    sts.push({ nome: 'Testes',           start: d(56), end: d(63) });
  } else if (dados.extensao) {
    sts.push({ nome: 'Fabricação Extensão', start: diaC,  end: d(14) });
    sts.push({ nome: 'Montagens Osti',      start: d(14), end: d(35) });
    sts.push({ nome: 'Montagens',           start: d(35), end: d(49) });
    sts.push({ nome: 'Testes',              start: d(49), end: d(56) });
  } else {
    sts.push({ nome: 'Montagens Osti', start: diaC,  end: d(21) });
    sts.push({ nome: 'Montagens',      start: d(21), end: d(35) });
    sts.push({ nome: 'Testes',         start: d(35), end: d(42) });
  }
  return sts;
}

// ─── SUBTAREFAS ──────────────────────────────────────────────

function criarSubtarefa_(parentKey, nome, startDate, endDate) {
  return jiraRequest_('POST', '/rest/api/3/issue', {
    fields: {
      project:           { key: JIRA_PROJECT },
      issuetype:         { name: 'Subtarefa' },
      parent:            { key: parentKey },
      summary:           nome,
      customfield_10015: startDate,
      duedate:           endDate,
    },
  });
}

// ─── SERIAL ──────────────────────────────────────────────────

function buscarProximoSerial() {
  try {
    const jql = 'project=' + JIRA_PROJECT +
      ' AND issuetype=Tarefa AND Departamento=PCP ORDER BY created DESC';
    const res = jiraRequest_('GET',
      '/rest/api/3/search/jql?jql=' + encodeURIComponent(jql) +
      '&maxResults=100&fields=summary,customfield_10537');
    let maxNum = 85;
    for (const issue of (res.issues || [])) {
      [issue.fields.customfield_10537, issue.fields.summary].forEach(s => {
        const m = String(s || '').match(/S22000(\d+)/i);
        if (m && parseInt(m[1]) > maxNum) maxNum = parseInt(m[1]);
      });
    }
    return 'S22000' + String(maxNum + 1).padStart(3, '0');
  } catch (_) {
    return 'S22000086';
  }
}

// ─── JIRA REST API ────────────────────────────────────────────

function jiraRequest_(method, path, payload) {
  const props = PropertiesService.getScriptProperties();
  const email = props.getProperty('JIRA_EMAIL');
  const token = props.getProperty('JIRA_TOKEN');
  if (!email || !token) throw new Error('Credenciais Jira não configuradas (JIRA_EMAIL / JIRA_TOKEN).');

  const opts = {
    method: method.toLowerCase(),
    headers: {
      Authorization: 'Basic ' + Utilities.base64Encode(email + ':' + token),
      'Content-Type': 'application/json',
      Accept:         'application/json',
    },
    muteHttpExceptions: true,
  };
  if (payload && ['post','put','patch'].includes(method.toLowerCase())) {
    opts.payload = JSON.stringify(payload);
  }

  const resp = UrlFetchApp.fetch(JIRA_BASE + path, opts);
  try { return JSON.parse(resp.getContentText()); }
  catch (_) { return { _raw: resp.getContentText(), _status: resp.getResponseCode() }; }
}

// ─── HELPER DATAS ─────────────────────────────────────────────

function addDias_(dateStr, dias) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

// ═══════════════════════════════════════════════════════════════
// MÓDULO 2 — Dashboard API (auto-fetch, bloqueios, datas)
// ═══════════════════════════════════════════════════════════════

// ─── BUSCAR TODAS AS TAREFAS DO PROJETO ──────────────────────
// Retorna JSON no mesmo formato do CSV do Jira (compatível com
// o dashboard JS sem alterações no código de análise).

function buscarTarefasJira() {
  try {
    // Todos os campos necessários — nomes EXATOS conforme CSV exportado pelo Jira
    const fields = [
      'summary','status','issuetype','parent',
      'duedate','created','resolutiondate',
      'customfield_10008',  // Campo personalizado (Início real)
      'customfield_10009',  // Campo personalizado (Fim real)
      'customfield_10015',  // Campo personalizado (Start date)
      'customfield_10073',  // Campo personalizado (Departamento)
      'customfield_10205',  // Campo personalizado (Categoria)
      'customfield_10469',  // Campo personalizado (Data Baseline)
      'customfield_10470',  // Campo personalizado (Data alvo)
      'customfield_10271',  // Campo personalizado (Classificação estrategica)
      'customfield_10337',  // Campo personalizado (Alinhamento Estratégico)
      'customfield_10304',  // Campo personalizado (Impacto financeiro)
      'customfield_10370',  // Campo personalizado (Urgência / Janela de Oportunidade )
      'customfield_10403',  // Campo personalizado (Complexidade)
      'customfield_10139',  // Campo personalizado (Numero do projeto)
      'customfield_10038',  // Campo personalizado (Cliente)
      'labels','assignee','priority','issuelinks',
    ].join(',');

    // /rest/api/3/search/jql usa cursor-based pagination via nextPageToken.
    // startAt e POST /search foram removidos pelo Jira Cloud (CHANGE-2046).
    // ORDER BY created ASC garante que issues antigas (com Feito/Fazendo) sejam
    // incluídas antes das novas — e o limite de 3000 cobre projetos grandes.
    const jqlRaw  = 'project=AGTK ORDER BY created ASC';
    const jqlEnc  = encodeURIComponent(jqlRaw);
    const maxResults = 100;
    let all = [];
    let nextPageToken = null;

    while (all.length < 3000) {
      let path = '/rest/api/3/search/jql?jql=' + jqlEnc +
                 '&maxResults=' + maxResults + '&fields=' + fields;
      if (nextPageToken) path += '&nextPageToken=' + encodeURIComponent(nextPageToken);

      const r = jiraRequest_('GET', path);
      if (!r.issues || r.issues.length === 0) break;

      all = all.concat(r.issues);

      // nextPageToken ausente = última página
      nextPageToken = r.nextPageToken || null;
      if (!nextPageToken) break;
    }

    // Helper: extrai .value de campos select (podem ser {value:'X'} ou string pura)
    function sel(v) { return v ? (v.value !== undefined ? v.value : v) : ''; }

    // Mapeia para o mesmo formato EXATO do CSV exportado pelo Jira
    // — nomes de campo idênticos para que o dashboard JS funcione sem alterações.
    const issues = all.map(function(i) {
      const f = i.fields || {};
      const isSub = f.issuetype && (f.issuetype.subtask === true ||
        f.issuetype.name === 'Subtarefa' || f.issuetype.name === 'Sub-task');

      // Nível de Prioridade (P1/P2/P3/P4) — definido por regra de automação Jira.
      // Busca primeiro em labels (mais confiável), fallback no campo priority padrão.
      const nivelPrioridade = (function() {
        const lbl = (f.labels || []).find(function(l) { return /^P[1-4]$/.test(l); });
        return lbl || (f.priority ? f.priority.name : '');
      })();

      return {
        // Identificação e tipo
        'Tipo de item':          isSub ? 'Subtarefa' : 'Tarefa',
        'Chave da item':         i.key || '',
        'Resumo':                f.summary || '',

        // Status
        'Status':                f.status ? f.status.name : '',
        'Categoria do status':   (f.status && f.status.statusCategory)
                                   ? f.status.statusCategory.name : '',
        // Chave de categoria (invariante — "new"/"indeterminate"/"done") usada pelo
        // dashboard para normalizar nomes de status customizados do projeto.
        '_statusKey':            (f.status && f.status.statusCategory)
                                   ? f.status.statusCategory.key : '',

        // Datas — mantidas em ISO (pd() no dashboard suporta ISO e formato pt-BR do CSV)
        'Criado':                f.created || '',
        'Resolvido':             f.resolutiondate || '',
        'Data limite':           f.duedate || '',

        // Campos personalizados — nomes EXATOS das colunas do CSV
        'Campo personalizado (Início real)':                        f.customfield_10008 || '',
        'Campo personalizado (Fim real)':                           f.customfield_10009 || '',
        'Campo personalizado (Start date)':                         f.customfield_10015 || '',
        'Campo personalizado (Departamento)':                       sel(f.customfield_10073),
        'Campo personalizado (Categoria)':                          sel(f.customfield_10205),
        'Campo personalizado (Data Baseline)':                      f.customfield_10469 || '',
        'Campo personalizado (Data alvo)':                          f.customfield_10470 || '',
        'Campo personalizado (Nivel de Prioridade)':                nivelPrioridade,
        'Campo personalizado (Classificação estrategica)':          sel(f.customfield_10271),
        'Campo personalizado (Alinhamento Estratégico)':            sel(f.customfield_10337),
        'Campo personalizado (Impacto financeiro)':                 sel(f.customfield_10304),
        'Campo personalizado (Urgência / Janela de Oportunidade )': sel(f.customfield_10370),
        'Campo personalizado (Complexidade)':                       sel(f.customfield_10403),
        'Campo personalizado (Numero do projeto)':                  sel(f.customfield_10139),
        'Campo personalizado (Cliente)':                            f.customfield_10038 || '',

        // Hierarquia (essencial para join subtarefas → tarefas no dashboard)
        'Chave pai':             f.parent ? f.parent.key : '',
        'Parent summary':        (f.parent && f.parent.fields)
                                   ? (f.parent.fields.summary || '') : '',

        // Labels (usado para detectar tarefas bloqueadas no dashboard)
        'Labels':                (f.labels || []).join(','),

        // Links de dependência (issuelinks) — serializado como JSON para o dashboard
        '_links': (function() {
          var links = [];
          (f.issuelinks || []).forEach(function(l) {
            var tn = l.type ? l.type.name : '';
            // outward: esta issue é a origem (ex: "blocks" → esta bloqueia a outward)
            if (l.outwardIssue) links.push({from: i.key, to: l.outwardIssue.key, rel: tn});
            // inward: outra issue é a origem (ex: "is blocked by" → inward bloqueia esta)
            if (l.inwardIssue) links.push({from: l.inwardIssue.key, to: i.key, rel: tn});
          });
          return JSON.stringify(links);
        })(),

        // Responsável
        'Responsável':           f.assignee ? f.assignee.displayName : '',
      };
    });

    return { success: true, total: issues.length, issues: issues };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── BUSCAR OPÇÕES DOS CAMPOS CUSTOMIZADOS ────────────────────
function buscarOpcoesCampos() {
  try {
    // Retorna opções dos campos select usados no formulário de criação
    const campoIds = [
      'customfield_10271', // Classificação Estratégica
      'customfield_10304', // Impacto Financeiro
      'customfield_10337', // Alinhamento Estratégico
      'customfield_10370', // Urgência
      'customfield_10403', // Complexidade
    ];
    const resultado = {};
    campoIds.forEach(function(campo) {
      try {
        const r = jiraRequest_('GET',
          '/rest/api/3/field/' + campo + '/context');
        if (r && r.values && r.values.length > 0) {
          const ctx = r.values[0];
          const opts = jiraRequest_('GET',
            '/rest/api/3/field/' + campo + '/context/' + ctx.id + '/option?maxResults=50');
          if (opts && opts.values) {
            resultado[campo] = opts.values.map(function(o) {
              return { id: o.id, value: o.value };
            });
          }
        }
      } catch(e) { resultado[campo] = []; }
    });
    return { success: true, campos: resultado };
  } catch(err) {
    return { success: false, erro: err.message };
  }
}

// ─── BUSCAR TAREFAS COM LABEL "bloqueado" ─────────────────────

function buscarBloqueados() {
  try {
    const jql = encodeURIComponent(
      'project=AGTK AND labels=bloqueado ORDER BY updated DESC');
    const fields = [
      'summary','status','issuetype','parent','duedate',
      'customfield_10015','customfield_10073','labels',
      'assignee','comment',
    ].join(',');
    const r = jiraRequest_('GET',
      '/rest/api/3/search/jql?jql=' + jql +
      '&maxResults=50&fields=' + fields);

    const issues = (r.issues || []).map(function(i) {
      const f = i.fields || {};
      const comments = (f.comment && f.comment.comments) ? f.comment.comments : [];
      // busca último comentário de bloqueio (mais recente primeiro)
      const bloqComment = comments.slice().reverse().find(function(c) {
        return c.body && JSON.stringify(c.body).includes('[BLOQUEIO]');
      });
      return {
        key:           i.key,
        summary:       f.summary || '',
        status:        f.status ? f.status.name : '',
        tipo:          f.issuetype ? f.issuetype.name : '',
        duedate:       f.duedate || '',
        startdate:     f.customfield_10015 || '',
        departamento:  f.customfield_10073 ? (f.customfield_10073.value || f.customfield_10073) : '',
        assignee:      f.assignee ? f.assignee.displayName : '',
        ultimoBloqueio: bloqComment ? bloqComment.created : null,
      };
    });

    return { success: true, issues: issues };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── REGISTRAR BLOQUEIO + ATUALIZAR DATAS ─────────────────────

function registrarBloqueio(dados) {
  try {
    const issueKey     = dados.issueKey;
    const tipoBloqueio = dados.tipoBloqueio || '';
    const descricao    = dados.descricao    || '';
    const impacto      = dados.impacto      || '';
    const responsavel  = dados.responsavel  || 'Não definido';
    const prazoRes     = dados.prazoResolucao || 'Não definido';
    const novaDueDate   = dados.novaDueDate   || null;
    const novaDataAlvo  = dados.novaDataAlvo  || null;
    const novaDataStart = dados.novaDataStart || null;

    if (!issueKey) throw new Error('Chave da tarefa não informada.');

    // 1. Busca labels + departamento da tarefa original
    const issInfo = jiraRequest_('GET',
      '/rest/api/3/issue/' + issueKey + '?fields=labels,summary,customfield_10073');
    const labels  = (issInfo.fields && issInfo.fields.labels)
      ? issInfo.fields.labels.slice() : [];
    const resumoOriginal = (issInfo.fields && issInfo.fields.summary) || issueKey;
    const depto = issInfo.fields && issInfo.fields.customfield_10073
      ? (issInfo.fields.customfield_10073.value || issInfo.fields.customfield_10073)
      : 'Geral';

    if (labels.indexOf('bloqueado') === -1) labels.push('bloqueado');
    jiraRequest_('PUT', '/rest/api/3/issue/' + issueKey, { fields: { labels: labels } });

    // 2. Adiciona comentário estruturado
    const now    = new Date().toLocaleDateString('pt-BR');
    const texto  =
      '[BLOQUEIO] ' + tipoBloqueio + ' | Impacto: ' + impacto + '\n' +
      'Descrição: ' + descricao + '\n' +
      'Responsável pela resolução: ' + responsavel + '\n' +
      'Prazo para resolução: ' + prazoRes + '\n' +
      'Registrado em: ' + now;

    jiraRequest_('POST', '/rest/api/3/issue/' + issueKey + '/comment', {
      body: {
        type: 'doc', version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: texto }],
        }],
      },
    });

    // 3. Atualiza datas se fornecidas
    const updates = {};
    if (novaDueDate)   updates.duedate            = novaDueDate;
    if (novaDataAlvo)  updates.customfield_10470  = novaDataAlvo;
    if (novaDataStart) updates.customfield_10015  = novaDataStart;
    if (Object.keys(updates).length > 0) {
      jiraRequest_('PUT', '/rest/api/3/issue/' + issueKey, { fields: updates });
    }

    // 4. Cria card no projeto BLKQ (quadro de bloqueios) — falha não-crítica
    let blkqKey  = null;
    let blkqErro = null;
    try {
      // Campos mínimos primeiro; descrição via comentário após criação
      const blkqFields = {
        project:   { key: 'BLKQ' },
        summary:   '[' + depto + '] ' + tipoBloqueio + ' — ' + issueKey,
        issuetype: { name: 'Tarefa' },
        labels:    ['bloqueado'],
      };
      const blkqIssue = jiraRequest_('POST', '/rest/api/3/issue', { fields: blkqFields });
      // muteHttpExceptions=true → Jira errors NÃO lançam exceção, checar explicitamente
      if (blkqIssue.errors || (blkqIssue.errorMessages && blkqIssue.errorMessages.length > 0)) {
        throw new Error(JSON.stringify(blkqIssue.errors || blkqIssue.errorMessages));
      }
      blkqKey = blkqIssue.key || null;

      // 5. Vincula card BLKQ ao issue AGTK + adiciona descrição via comentário
      if (blkqKey) {
        jiraRequest_('POST', '/rest/api/3/issueLink', {
          type:         { name: 'Relates' },
          inwardIssue:  { key: blkqKey },
          outwardIssue: { key: issueKey },
        });
        jiraRequest_('POST', '/rest/api/3/issue/' + blkqKey + '/comment', {
          body: {
            type: 'doc', version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text',
              text: 'Tarefa vinculada: ' + issueKey + ' — ' + resumoOriginal + '\n\n' + texto
            }] }],
          },
        });
      }
    } catch (blkqErr) {
      Logger.log('BLKQ (não crítico): ' + blkqErr.message);
      blkqErro = blkqErr.message;
    }

    // 6. Gera PDF de registro e salva no Drive (falha não-crítica)
    var driveResult = {};
    try {
      var pdfBlq = gerarPdfBloqueio_({
        issueKey: issueKey,
        resumo: resumoOriginal,
        depto: depto,
        tipoBloqueio: tipoBloqueio,
        impacto: impacto,
        descricao: descricao,
        responsavel: responsavel,
        prazoResolucao: prazoRes,
        dataRegistro: new Date().toLocaleDateString('pt-BR'),
        blkqKey: blkqKey || '—',
      });
      driveResult = salvarRelatorioDrive_(pdfBlq);
    } catch (eDrive) {
      driveResult = { erro: eDrive.message };
    }

    return { success: true, key: issueKey, blkqKey: blkqKey, blkqErro: blkqErro, drive: driveResult };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── ATUALIZAR APENAS DATAS (sem registrar bloqueio) ──────────

function atualizarDatas(dados) {
  try {
    const issueKey = dados.issueKey;
    if (!issueKey) throw new Error('Chave não informada.');

    const updates = {};
    if (dados.startDate)    updates.customfield_10015 = dados.startDate;
    if (dados.dueDate)      updates.duedate            = dados.dueDate;
    if (dados.alvoDate)     updates.customfield_10470  = dados.alvoDate;
    if (dados.baselineDate) updates.customfield_10469  = dados.baselineDate;

    if (Object.keys(updates).length === 0) throw new Error('Nenhuma data informada.');

    jiraRequest_('PUT', '/rest/api/3/issue/' + issueKey, { fields: updates });
    return { success: true, key: issueKey, updated: Object.keys(updates) };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── BUSCAR ISSUE POR CHAVE (usado no formulário de bloqueio) ─

function buscarIssue(dados) {
  try {
    const issueKey = dados.issueKey;
    if (!issueKey) throw new Error('Chave não informada.');
    const fields = [
      'summary','status','issuetype','parent','duedate',
      'customfield_10015','customfield_10073','labels','assignee','subtasks',
    ].join(',');
    const r = jiraRequest_('GET', '/rest/api/3/issue/' + issueKey + '?fields=' + fields);
    if (!r.key) throw new Error('Issue não encontrada: ' + issueKey);
    const f = r.fields || {};
    return {
      success: true,
      issue: {
        key:          r.key,
        summary:      f.summary || '',
        status:       f.status ? f.status.name : '',
        tipo:         f.issuetype ? f.issuetype.name : '',
        duedate:      f.duedate || '',
        startdate:    f.customfield_10015 || '',
        departamento: f.customfield_10073 ? (f.customfield_10073.value || f.customfield_10073) : '',
        assignee:     f.assignee ? f.assignee.displayName : '',
        labels:       f.labels || [],
        subtasks:     (f.subtasks || []).length,
      },
    };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── EXCLUIR ISSUE DO JIRA ────────────────────────────────────

function deletarProjeto(dados) {
  try {
    var issueKey = (dados.issueKey || '').trim().toUpperCase();
    var confirmacao = (dados.confirmacao || '').trim().toUpperCase();

    if (!issueKey) throw new Error('issueKey obrigatório');
    if (confirmacao !== issueKey) throw new Error('Confirmação incorreta — digite a chave exata do projeto');

    // Verifica se a issue existe antes de excluir
    var check = jiraRequest_('GET', '/rest/api/3/issue/' + issueKey + '?fields=summary,issuetype,subtasks');
    if (!check.key) throw new Error('Issue não encontrada: ' + issueKey);

    // Impede exclusão acidental de subtarefas (só permite Story/Task/Epic-like top-level)
    var tipo = check.fields && check.fields.issuetype ? check.fields.issuetype.name : '';
    if (tipo.toLowerCase() === 'subtarefa' || tipo.toLowerCase() === 'subtask') {
      throw new Error('Use esta função apenas para projetos (não subtarefas). Tipo encontrado: ' + tipo);
    }

    var nSubs = check.fields && check.fields.subtasks ? check.fields.subtasks.length : 0;

    // DELETE /rest/api/3/issue/{key}?deleteSubtasks=true
    jiraRequest_('DELETE', '/rest/api/3/issue/' + issueKey + '?deleteSubtasks=true', null);

    return { success: true, key: issueKey, summary: (check.fields || {}).summary || '', subtasksExcluidas: nSubs };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── MUDAR STATUS DE UM ISSUE (transição Jira) ────────────────

function mudarStatus(dados) {
  try {
    var issueKey = (dados.issueKey || '').trim().toUpperCase();
    var novoStatus = (dados.novoStatus || '').trim();    // ex: 'Fazendo', 'Feito', 'A Fazer'
    var comentario = (dados.comentario || '').trim();

    if (!issueKey)   throw new Error('issueKey obrigatório');
    if (!novoStatus) throw new Error('novoStatus obrigatório');

    // Mapa de nomes amigáveis → fragmentos a procurar no nome da transição do Jira
    var ALIAS = {
      'A Fazer':  ['a fazer', 'to do', 'open', 'aberto', 'novo', 'new'],
      'Fazendo':  ['fazendo', 'in progress', 'em andamento', 'andamento'],
      'Feito':    ['feito', 'done', 'concluído', 'concluido', 'closed', 'fechado', 'resolvido', 'resolved'],
    };
    var targets = ALIAS[novoStatus] || [novoStatus.toLowerCase()];

    // Busca as transições disponíveis para o issue
    var trans = jiraRequest_('GET', '/rest/api/3/issue/' + issueKey + '/transitions');
    var list  = (trans.transitions) || [];
    var match = null;
    for (var i = 0; i < list.length; i++) {
      var tn = (list[i].name || '').toLowerCase();
      for (var j = 0; j < targets.length; j++) {
        if (tn.indexOf(targets[j]) !== -1) { match = list[i]; break; }
      }
      if (match) break;
    }
    if (!match) {
      var nomes = list.map(function(t){ return t.name; }).join(', ');
      throw new Error('Transição "' + novoStatus + '" não encontrada. Disponíveis: ' + nomes);
    }

    // Executa a transição
    jiraRequest_('POST', '/rest/api/3/issue/' + issueKey + '/transitions', {
      transition: { id: match.id }
    });

    // Adiciona comentário justificando a mudança (se informado)
    if (comentario) {
      var texto = 'Status alterado para "' + novoStatus + '" via AgriTrack PMO Dashboard.\n\n' + comentario;
      jiraRequest_('POST', '/rest/api/3/issue/' + issueKey + '/comment', {
        body: {
          type: 'doc', version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: texto }] }]
        }
      });
    }

    return { success: true, key: issueKey, novoStatus: novoStatus, transicao: match.name };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── ENVIAR RELATÓRIO SEMANAL POR E-MAIL ──────────────────────

function enviarRelatorio(dados) {
  try {
    const para    = dados.para    || 'guilherme.souza@agricef.com.br';
    const data    = dados.data    || new Date().toLocaleDateString('pt-BR');
    const total   = dados.totalProjetos  || 0;
    const concl   = dados.concluidos     || 0;
    const emAnd   = dados.emAndamento    || 0;
    const aFaz    = dados.aFazer         || 0;
    const fp      = dados.foraPrazo      || 0;
    const blk     = dados.bloqueados     || 0;
    const texto   = dados.textoRelatorio || '';
    const link    = dados.linkDashboard  ||
      'https://agricefprocessos-tech.github.io/agritrack/agritrack_dashboard.html';

    // Converte markdown básico → HTML
    function mdToHtml(md) {
      return md
        .replace(/^## (.+)/gm, '<h2 style="color:#22d37a;font-size:16px;margin:22px 0 6px;border-bottom:1px solid rgba(34,211,122,0.2);padding-bottom:6px">$1</h2>')
        .replace(/^### (.+)/gm, '<h3 style="color:#60a5fa;font-size:14px;margin:16px 0 5px">$1</h3>')
        .replace(/^# (.+)/gm,  '<h1 style="color:#e2e8f4;font-size:18px;margin:20px 0 8px">$1</h1>')
        .replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e2e8f4">$1</strong>')
        .replace(/\*(.+?)\*/g,   '<em>$1</em>')
        .replace(/^[-•] (.+)/gm, '<li style="margin:4px 0;padding-left:4px">$1</li>')
        .replace(/(<li.*<\/li>\n?)+/g, function(m){ return '<ul style="margin:8px 0 8px 20px;padding:0">'+m+'</ul>'; })
        .replace(/\n\n+/g, '</p><p style="margin:8px 0;color:#c5cfe0;line-height:1.7">')
        .replace(/\n/g, '<br>');
    }

    const htmlCorpo = mdToHtml(texto);

    const kpiStyle = 'background:#1a2235;border-radius:8px;padding:16px 12px;text-align:center;display:inline-block;width:100%';
    const numStyle = 'font-size:32px;font-weight:700;line-height:1;display:block;margin-bottom:6px';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head>' +
      '<body style="margin:0;padding:0;background:#f0f4f8;font-family:Arial,Helvetica,sans-serif">' +
      '<table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f4f8;padding:32px 16px">' +
      '<tr><td align="center">' +
      '<table width="620" cellpadding="0" cellspacing="0" style="background:#111827;border-radius:14px;overflow:hidden;max-width:620px;box-shadow:0 4px 24px rgba(0,0,0,0.3)">' +

      // ── Cabeçalho
      '<tr><td style="background:#0b0f17;padding:24px 32px;border-bottom:1px solid rgba(255,255,255,0.06)">' +
      '<table width="100%"><tr>' +
      '<td style="vertical-align:middle">' +
      '<span style="display:inline-block;background:#22d37a;border-radius:7px;width:34px;height:34px;text-align:center;line-height:34px;font-size:17px;font-weight:900;color:#000;vertical-align:middle">A</span>' +
      '<span style="color:#e2e8f4;font-size:17px;font-weight:700;vertical-align:middle;margin-left:10px">AgriTrack</span>' +
      '<span style="color:#8896b0;font-size:12px;vertical-align:middle;margin-left:8px">Relatório Semanal de Projetos</span>' +
      '</td>' +
      '<td align="right" style="color:#8896b0;font-size:12px;white-space:nowrap">'+data+'</td>' +
      '</tr></table>' +
      '</td></tr>' +

      // ── KPIs linha 1
      '<tr><td style="padding:24px 32px 8px">' +
      '<table width="100%" cellpadding="4" cellspacing="0"><tr>' +
      '<td width="33%"><div style="'+kpiStyle+'"><span style="'+numStyle+';color:#22d37a">'+concl+'</span><span style="font-size:11px;color:#8896b0;text-transform:uppercase;letter-spacing:.5px">Concluídos</span></div></td>' +
      '<td width="33%"><div style="'+kpiStyle+'"><span style="'+numStyle+';color:#60a5fa">'+emAnd+'</span><span style="font-size:11px;color:#8896b0;text-transform:uppercase;letter-spacing:.5px">Em Andamento</span></div></td>' +
      '<td width="33%"><div style="'+kpiStyle+'"><span style="'+numStyle+';color:#f59e0b">'+fp+'</span><span style="font-size:11px;color:#8896b0;text-transform:uppercase;letter-spacing:.5px">Fora do Prazo</span></div></td>' +
      '</tr></table>' +
      '</td></tr>' +

      // ── KPIs linha 2
      '<tr><td style="padding:0 32px 24px">' +
      '<table width="100%" cellpadding="4" cellspacing="0"><tr>' +
      '<td width="33%"><div style="'+kpiStyle+'"><span style="'+numStyle+';color:#a78bfa">'+total+'</span><span style="font-size:11px;color:#8896b0;text-transform:uppercase;letter-spacing:.5px">Total Projetos</span></div></td>' +
      '<td width="33%"><div style="'+kpiStyle+'"><span style="'+numStyle+';color:#94a3b8">'+aFaz+'</span><span style="font-size:11px;color:#8896b0;text-transform:uppercase;letter-spacing:.5px">A Fazer</span></div></td>' +
      '<td width="33%"><div style="'+kpiStyle+'"><span style="'+numStyle+';color:#f05252">'+blk+'</span><span style="font-size:11px;color:#8896b0;text-transform:uppercase;letter-spacing:.5px">Bloqueados</span></div></td>' +
      '</tr></table>' +
      '</td></tr>' +

      // ── Divisor
      '<tr><td style="padding:0 32px"><div style="height:1px;background:rgba(255,255,255,0.06)"></div></td></tr>' +

      // ── Corpo do relatório
      '<tr><td style="padding:28px 32px;color:#c5cfe0;font-size:14px;line-height:1.7">' +
      '<p style="margin:0 0 8px;color:#c5cfe0;line-height:1.7">'+htmlCorpo+'</p>' +
      '</td></tr>' +

      // ── Rodapé
      '<tr><td style="background:#0b0f17;padding:18px 32px;border-top:1px solid rgba(255,255,255,0.06)">' +
      '<table width="100%"><tr>' +
      '<td style="color:#8896b0;font-size:11px">Gerado automaticamente · AgriTrack · Agricef</td>' +
      '<td align="right"><a href="'+link+'" style="color:#22d37a;font-size:11px;text-decoration:none;font-weight:600">Abrir Dashboard →</a></td>' +
      '</tr></table>' +
      '</td></tr>' +

      '</table></td></tr></table></body></html>';

    GmailApp.sendEmail(para,
      '📊 AgriTrack — Relatório Semanal | ' + data,
      texto,  // fallback texto simples
      { htmlBody: html, name: 'AgriTrack — Agricef' }
    );

    return { success: true, para: para };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ─── BUSCAR DADOS DE COMPRAS (Google Sheets) ──────────────────
// sheetId é salvo em Script Properties → COMPRAS_SHEET_ID
// Ou recebido direto como parâmetro (para setup inicial)


// ─── LISTAR ABAS DA PLANILHA DE COMPRAS (rápido — só metadados) ──
// Retorna nomes, GIDs e contagem de linhas sem ler os dados
function listarAbasCompras(dados) {
  try {
    var props = PropertiesService.getScriptProperties();
    var sheetId = (dados && dados.sheetId) || props.getProperty('COMPRAS_SHEET_ID');
    if (!sheetId) return { success: false, erro: 'ID nao configurado.' };
    if (dados && dados.sheetId) props.setProperty('COMPRAS_SHEET_ID', dados.sheetId);
    var ss = SpreadsheetApp.openById(sheetId);
    var sheets = ss.getSheets();
    var tabs = sheets.map(function(sheet) {
      var lastRow = sheet.getLastRow();
      return {
        name: sheet.getName(),
        gid: sheet.getSheetId(),
        total: Math.max(0, lastRow - 1),
        empty: lastRow <= 1
      };
    });
    return { success: true, tabs: tabs, totalTabs: tabs.length };
  } catch(err) {
    return { success: false, erro: err.message };
  }
}

// ─── BUSCAR TODAS AS ABAS DA PLANILHA DE COMPRAS ──────────────

// —— BUSCAR TODAS AS ABAS DA PLANILHA DE COMPRAS ——————————
// Usa CacheService (1h) para evitar timeout em planilhas grandes
function buscarTodasAbasCompras(dados) {
  try {
    var props   = PropertiesService.getScriptProperties();
    var sheetId = (dados && dados.sheetId) || props.getProperty('COMPRAS_SHEET_ID');
    if (!sheetId) return { success: false, erro: 'ID da planilha não configurado.' };
    if (dados && dados.sheetId) props.setProperty('COMPRAS_SHEET_ID', dados.sheetId);

    // — Verificar cache (evita leitura repetida da planilha grande) —
    var cache    = CacheService.getScriptCache();
    var cacheKey = 'compras_tabs_' + sheetId.slice(-12);
    var force    = dados && dados.force;
    if (!force) {
      var cached = cache.get(cacheKey);
      if (cached) {
        try {
          var parsed = JSON.parse(cached);
          return { success: true, tabs: parsed, totalTabs: parsed.length, fromCache: true };
        } catch(e2) { /* cache corrompido, continua */ }
      }
    }

    var ss     = SpreadsheetApp.openById(sheetId);
    var sheets = ss.getSheets();
    var tz     = Session.getScriptTimeZone();
    var tabs = sheets.map(function(sheet) {
      var range = sheet.getDataRange();
      var vals  = range.getValues();
      if (vals.length < 2) return { name: sheet.getName(), gid: sheet.getSheetId(), headers: [], rows: [], total: 0, empty: true };
      var headers = vals[0].map(function(h){ return String(h).trim(); }).filter(function(h){ return h; });
      var rows = vals.slice(1).map(function(row){
        var obj = {};
        headers.forEach(function(h, i){
          var v = row[i];
          obj[h] = (v !== undefined && v !== null && v !== '')
            ? (v instanceof Date ? Utilities.formatDate(v, tz, 'dd/MM/yyyy') : String(v))
            : '';
        });
        return obj;
      }).filter(function(row){ return Object.values(row).some(function(v){ return v !== ''; }); });
      if (rows.length === 0) return { name: sheet.getName(), gid: sheet.getSheetId(), headers: headers, rows: [], total: 0, empty: true };
      return { name: sheet.getName(), gid: sheet.getSheetId(), headers: headers, rows: rows, total: rows.length };
    }).filter(function(t){ return t && t.name; }); // inclui abas vazias

    // Salva no cache por 1 hora (3600s)
    try { cache.put(cacheKey, JSON.stringify(tabs), 3600); } catch(ec) { /* ignora erro de cache */ }

    return { success: true, tabs: tabs, totalTabs: tabs.length };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}
function buscarCompras(dados) {
  try {
    const props   = PropertiesService.getScriptProperties();
    const sheetId = (dados && dados.sheetId) || props.getProperty('COMPRAS_SHEET_ID');
    if (!sheetId) return { success: false, erro: 'ID da planilha não configurado. Configure em ⚙️ Config → Compras.' };

    // Persiste ID e gid se passados explicitamente
    if (dados && dados.sheetId) props.setProperty('COMPRAS_SHEET_ID', dados.sheetId);
    const gidSalvo = (dados && dados.gid) ? String(dados.gid) : props.getProperty('COMPRAS_SHEET_GID');
    if (dados && dados.gid) props.setProperty('COMPRAS_SHEET_GID', String(dados.gid));

    const ss = SpreadsheetApp.openById(sheetId);

    // Localiza aba pelo gid se fornecido
    let sheet = null;
    if (gidSalvo) {
      const gidNum = parseInt(gidSalvo, 10);
      const sheets = ss.getSheets();
      for (var i = 0; i < sheets.length; i++) {
        if (sheets[i].getSheetId() === gidNum) { sheet = sheets[i]; break; }
      }
    }
    if (!sheet) sheet = ss.getSheets()[0];  // fallback: primeira aba

    const range = sheet.getDataRange();
    const vals  = range.getValues();

    if (vals.length === 0) return { success: true, headers: [], rows: [], total: 0, sheetName: sheet.getName() };

    const headers = vals[0].map(function(h){ return String(h).trim(); }).filter(function(h){ return h; });
    const rows = vals.slice(1).map(function(row){
      const obj = {};
      headers.forEach(function(h, i){
        const v = row[i];
        obj[h] = (v !== undefined && v !== null && v !== '')
          ? (v instanceof Date ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'dd/MM/yyyy') : String(v))
          : '';
      });
      return obj;
    }).filter(function(row){ return Object.values(row).some(function(v){ return v !== ''; }); });

    return { success: true, headers: headers, rows: rows, total: rows.length, sheetName: sheet.getName() };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKFILL DATAS REAIS — Compras + Fabricação Agricef → Jira
// ═══════════════════════════════════════════════════════════════════════════
//
// Preenche retrospectivamente customfield_10008 (Início real) e
// customfield_10009 (Fim real) nas subtarefas de projetos Hauler no Jira.
//
// Fontes de dados:
//   • Compras      → "Pedidos Concluídos" + "FUP online" da planilha de Compras
//   • Fabricação   → "Respostas do Formulário 1" da planilha de Apontamentos
//
// Uso rápido (cole no Editor GAS e execute):
//   backfillDryRun()              → mostra o que seria atualizado, sem alterar nada
//   backfillProducao_Teste()      → aplica em seriais específicos (edite a lista)
//   backfillDatasReais({dryRun:false})  → aplica em TODOS os projetos Hauler
//
// ═══════════════════════════════════════════════════════════════════════════

// ─── TRIGGER DIÁRIO — syncDatasReais ─────────────────────────────────────
//
// O trigger chama syncDatasReais() toda noite às 3h (America/Sao_Paulo).
// É idempotente: pula subtarefas que já têm datas, atualiza só as novas.
// Novos projetos adicionados ao Jira são automaticamente cobertos.
//
// Para ativar:  execute setupBackfillTrigger() UMA VEZ no editor GAS.
// Para remover: execute deleteBackfillTrigger().
// ─────────────────────────────────────────────────────────────────────────

/**
 * Alvo do trigger diário — roda backfill em produção sem dry-run.
 * Loga no Stackdriver (Cloud Logging) para histórico.
 */
function syncDatasReais() {
  try {
    var result = backfillDatasReais({ dryRun: false });
    console.log('syncDatasReais OK | updated=' + result.updated +
                ' skipped=' + result.skipped + ' erros=' + result.erros);
    return result;
  } catch (e) {
    console.error('syncDatasReais ERRO: ' + e.message);
    return { success: false, erro: e.message };
  }
}

/**
 * Cria o trigger diário às 3h (America/Sao_Paulo).
 * Substitui qualquer trigger anterior de syncDatasReais.
 * Execute UMA VEZ no editor GAS — fica permanente até deleteBackfillTrigger().
 */
function setupBackfillTrigger() {
  // Remove triggers existentes para evitar duplicatas
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'syncDatasReais') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  // Cria trigger: todo dia às 3h–4h horário de Brasília
  ScriptApp.newTrigger('syncDatasReais')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .inTimezone('America/Sao_Paulo')
    .create();

  var msg = 'Trigger diário ativado: syncDatasReais roda todo dia ~3h (America/Sao_Paulo)';
  Logger.log(msg);
  return { success: true, msg: msg };
}

/** Remove o trigger diário de syncDatasReais. */
function deleteBackfillTrigger() {
  var removed = 0;
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'syncDatasReais') {
      ScriptApp.deleteTrigger(existing[i]);
      removed++;
    }
  }
  Logger.log('Triggers removidos: ' + removed);
  return { success: true, removidos: removed };
}

/** Retorna status do trigger (para o dashboard saber se está ativo). */
function statusBackfillTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  var ativos = [];
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'syncDatasReais') {
      ativos.push({ id: triggers[i].getUniqueId(), tipo: String(triggers[i].getEventType()) });
    }
  }
  return { ativo: ativos.length > 0, triggers: ativos };
}

// ─── FUNÇÕES DE CONVENIÊNCIA (execução manual no editor GAS) ─────────────

/**
 * Executa backfill em modo DRY-RUN — exibe no Logger o que seria atualizado.
 * Seguro para rodar a qualquer momento.
 */
function backfillDryRun() {
  var result = backfillDatasReais({ dryRun: true });
  Logger.log('=== DRY-RUN concluído ===\nupdated=' + result.updated +
             ' skipped=' + result.skipped + ' erros=' + result.erros);
}

/**
 * Aplica o backfill em produção para uma lista específica de seriais.
 * Edite os seriais desejados antes de executar.
 */
function backfillProducao_Teste() {
  var result = backfillDatasReais({
    dryRun: false,
    serialFilter: ['22000072', '22000073']   // ← edite conforme necessário
  });
  Logger.log('=== PRODUÇÃO (filtro serial) ===\nupdated=' + result.updated +
             ' skipped=' + result.skipped + ' erros=' + result.erros);
}

/**
 * Retroativamente preenche Início real / Fim real nas subtarefas de todos os
 * projetos Hauler do Jira AGTK — 4 fases cobertas:
 *   Compras, Fabricação (Agricef), Pré – Montagem, Montagens finais.
 *
 * @param {Object} opcoes
 *   opcoes.dryRun         {boolean}  true = só loga, sem escrever no Jira (padrão: TRUE)
 *   opcoes.serialFilter   {string[]} limita a seriais específicos, ex: ['22000072']
 *   opcoes.forcarReescrita {boolean} sobrescreve datas já preenchidas (padrão: false)
 * @return {{ success, dryRun, updated, skipped, erros, log }}
 */
function backfillDatasReais(opcoes) {
  var dryRun          = (!opcoes || opcoes.dryRun !== false);   // padrão TRUE
  var serialFilter    = (opcoes && Array.isArray(opcoes.serialFilter)) ? opcoes.serialFilter : null;
  var forcarReescrita = !!(opcoes && opcoes.forcarReescrita);

  var log = [];
  var props    = PropertiesService.getScriptProperties();
  var jiraBase = 'https://agricefprojetos.atlassian.net';
  var email    = props.getProperty('JIRA_EMAIL');
  var token    = props.getProperty('JIRA_TOKEN');

  if (!email || !token) {
    return { success: false, erro: 'JIRA_EMAIL / JIRA_TOKEN não configurados em Script Properties.' };
  }
  var jiraAuth = 'Basic ' + Utilities.base64Encode(email + ':' + token);

  // ── 1. Carregar dados de Compras ─────────────────────────────────────────
  log.push('[1/5] Carregando dados de Compras (Pedidos Concluídos + FUP online)…');
  var comprasMap = {};
  try {
    comprasMap = _bf_loadCompras_(log, serialFilter);
    log.push('      Seriais com dados Compras: ' + Object.keys(comprasMap).length);
  } catch (e) { log.push('  ERRO Compras: ' + e.message); }

  // ── 2. Carregar dados de Fabricação Agricef (ops 0010-0050) ──────────────
  log.push('[2/5] Carregando dados de Apontamentos — Fabricação (ops 0010-0050)…');
  var fabMap = {};
  try {
    fabMap = _bf_loadFabricacao_(log, serialFilter);
    log.push('      Seriais com dados Fabricação: ' + Object.keys(fabMap).length);
  } catch (e) { log.push('  ERRO Fabricação: ' + e.message); }

  // ── 3. Carregar dados de Montagem (ops 0030/0060/0070/0090) ─────────────
  log.push('[3/5] Carregando dados de Apontamentos — Montagens (ops 0030/0060/0070/0090)…');
  var montMap = {};
  try {
    montMap = _bf_loadMontagens_(log, serialFilter);
    log.push('      Seriais com dados de Montagem: ' + Object.keys(montMap).length);
  } catch (e) { log.push('  ERRO Montagens: ' + e.message); }

  // ── 4. Buscar subtarefas PCP Hauler no Jira ──────────────────────────────
  log.push('[4/5] Buscando tarefas pai PCP no Jira AGTK…');
  var subtasks = [];
  try {
    subtasks = _bf_fetchSubtasks_(jiraBase, jiraAuth, log);
    log.push('      Subtarefas Hauler carregadas: ' + subtasks.length);
  } catch (e) { log.push('  ERRO Jira fetch: ' + e.message); }

  // ── 5. Processar atualizações ────────────────────────────────────────────
  log.push('[5/5] ' + (dryRun ? '[DRY-RUN] ' : '[PRODUÇÃO] ') + 'Processando…');
  var updated = 0, skipped = 0, erros = 0;

  for (var i = 0; i < subtasks.length; i++) {
    var sub       = subtasks[i];
    var subKey    = sub.key;
    var subSum    = String(sub.fields.summary || '');
    var parentSum = String(sub.parentSummary || '').toUpperCase();

    // Extrai serial do summary do pai (formato S22000XXX)
    var sm = parentSum.match(/S(22\d{6})/i);
    if (!sm) continue;
    var serial = sm[1];

    if (serialFilter && serialFilter.indexOf(serial) === -1) continue;

    // ── Identificação da fase pela subtarefa ─────────────────────────────
    var isCompras     = /compras/i.test(subSum);
    var isFabAgricef  = /fabrica[çc][aã]/i.test(subSum) && !/osti/i.test(subSum);
    var isPreMontagem = /pr[eé][\s\-–]+mont|montag.*pr[eé]/i.test(subSum);
    var isMontagens   = /montag/i.test(subSum) && !/osti/i.test(subSum) && !isPreMontagem;

    if (!isCompras && !isFabAgricef && !isPreMontagem && !isMontagens) continue;

    // Fonte de dados para cada fase
    var src, phaseLbl;
    if (isCompras) {
      src = comprasMap[serial];
      phaseLbl = 'Compras';
    } else if (isFabAgricef) {
      src = fabMap[serial];
      phaseLbl = 'FabAgricef';
    } else if (isPreMontagem) {
      src = montMap[serial] ? montMap[serial].preMontagem : null;
      phaseLbl = 'Pré-Montagem';
    } else {
      src = montMap[serial] ? montMap[serial].montagens : null;
      phaseLbl = 'Montagens';
    }

    var inicioJira = sub.fields['customfield_10008'] || null;
    var fimJira    = sub.fields['customfield_10009'] || null;

    // Pula se já tem ambas as datas (a menos que forçar reescrita)
    if (!forcarReescrita && inicioJira && fimJira) {
      skipped++;
      log.push('  SKIP ' + subKey + ' [' + serial + '] ' + phaseLbl +
               ' — já tem início=' + inicioJira + ' fim=' + fimJira);
      continue;
    }

    if (!src || (!src.inicio && !src.fim)) {
      log.push('  SKIP ' + subKey + ' [' + serial + '] ' + phaseLbl + ' — sem dados na planilha');
      continue;
    }

    // Monta payload apenas com campos ausentes (ou todos se forçar reescrita)
    var payload = { fields: {} };
    if ((!inicioJira || forcarReescrita) && src.inicio) payload.fields['customfield_10008'] = src.inicio;
    if ((!fimJira    || forcarReescrita) && src.fim)    payload.fields['customfield_10009'] = src.fim;

    if (Object.keys(payload.fields).length === 0) {
      skipped++;
      log.push('  SKIP ' + subKey + ' [' + serial + '] ' + phaseLbl +
               ' — nada a atualizar (dado de entrada ausente para campo faltando)');
      continue;
    }

    var logLn = '  ' + (dryRun ? '[DRY] ' : '') + subKey + ' [' + serial + '] ' + phaseLbl +
                ' → início=' + (payload.fields['customfield_10008'] || '(manter)') +
                ' fim='      + (payload.fields['customfield_10009'] || '(manter)');

    if (dryRun) {
      log.push(logLn);
      updated++;
      continue;
    }

    // ── Escrita real no Jira ──
    try {
      var resp = UrlFetchApp.fetch(jiraBase + '/rest/api/3/issue/' + subKey, {
        method: 'PUT',
        contentType: 'application/json',
        headers: { 'Authorization': jiraAuth },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });
      var code = resp.getResponseCode();
      if (code === 204 || code === 200) {
        log.push(logLn + ' ✓');
        updated++;
      } else {
        log.push(logLn + ' ✗ HTTP ' + code + ': ' + resp.getContentText().substring(0, 250));
        erros++;
      }
      Utilities.sleep(150);  // respeita rate-limit da API Jira
    } catch (e) {
      log.push(logLn + ' ✗ EXCEÇÃO: ' + e.message);
      erros++;
    }
  }

  var sumLine = '\n=== RESULTADO ===' +
                '\n  Modo       : ' + (dryRun ? 'DRY-RUN (sem alterações no Jira)' : 'PRODUÇÃO') +
                '\n  Atualizados: ' + updated +
                '\n  Ignorados  : ' + skipped +
                '\n  Erros      : ' + erros;
  log.push(sumLine);
  Logger.log(log.join('\n'));

  return { success: true, dryRun: dryRun, updated: updated, skipped: skipped, erros: erros, log: log };
}

// ─── Helpers internos do backfill ──────────────────────────────────────────

/**
 * Carrega dados de Compras da planilha de FUP.
 * Retorna { '22000072': { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }, … }
 */
function _bf_loadCompras_(log, serialFilter) {
  var COMPRAS_ID = '16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A';
  var ss = SpreadsheetApp.openById(COMPRAS_ID);
  var result = {};

  function _min(a, b) { if (!a) return b; if (!b) return a; return a < b ? a : b; }
  function _max(a, b) { if (!a) return b; if (!b) return a; return a > b ? a : b; }

  // ── A. Pedidos Concluídos ────────────────────────────────────────────────
  var sheetConc = _bf_findSheet_(ss, 'Pedidos Conclu');
  if (sheetConc) {
    var data = sheetConc.getDataRange().getValues();
    var hdrs = data[0].map(function(h) { return String(h || '').trim(); });
    // Col 0 = PV (cabeçalho pode ser " " ou vazio)
    var colSol  = _bf_colIdx_(hdrs, /solicit/i, 2);
    var colEntA = _bf_colIdx_(hdrs, /atualiz/i, 24);
    var colEntE = _bf_colIdx_(hdrs, /efetiv/i,  26);
    log.push('  Pedidos Concluídos: ' + (data.length - 1) + ' linhas | colSol=' + colSol +
             ' colEntA=' + colEntA + ' colEntE=' + colEntE);

    for (var r = 1; r < data.length; r++) {
      var row     = data[r];
      var seriais = _bf_extractSerials_(row[0]);
      if (!seriais.length) continue;

      var dtSol  = _bf_parseDate_(row[colSol]);
      var dtFim  = _max(_bf_parseDate_(row[colEntA]), _bf_parseDate_(row[colEntE]));

      for (var s = 0; s < seriais.length; s++) {
        var ser = seriais[s];
        if (serialFilter && serialFilter.indexOf(ser) === -1) continue;
        if (!result[ser]) result[ser] = { inicio: null, fim: null };
        result[ser].inicio = _min(result[ser].inicio, dtSol);
        result[ser].fim    = _max(result[ser].fim, dtFim);
      }
    }
    log.push('  → ' + Object.keys(result).length + ' seriais após Pedidos Concluídos');
  } else {
    log.push('  AVISO: aba "Pedidos Concluídos" não encontrada');
  }

  // ── B. FUP online (complementa datas de entrega para projetos recentes) ──
  var sheetFup = _bf_findSheet_(ss, 'FUP');
  if (sheetFup) {
    var dataF = sheetFup.getDataRange().getValues();
    var hdrsF = dataF[0].map(function(h) { return String(h || '').trim(); });
    var colFSol = _bf_colIdx_(hdrsF, /solicit/i, 2);
    // "Data da Entrega" — regex específico para não confundir com "Data entrega Atualizada"
    var colFEnt = _bf_colIdx_(hdrsF, /data\s+da\s+entrega/i, -1);
    if (colFEnt === -1) colFEnt = _bf_colIdx_(hdrsF, /entrega/i, 52);
    log.push('  FUP online: ' + (dataF.length - 1) + ' linhas | colSol=' + colFSol + ' colEnt=' + colFEnt);

    for (var rf = 1; rf < dataF.length; rf++) {
      var rowF    = dataF[rf];
      var serialsF = _bf_extractSerials_(rowF[0]);
      if (!serialsF.length) continue;

      var dtSolF = _bf_parseDate_(rowF[colFSol]);
      var dtEntF = (colFEnt >= 0) ? _bf_parseDate_(rowF[colFEnt]) : null;

      for (var sf = 0; sf < serialsF.length; sf++) {
        var serF = serialsF[sf];
        if (serialFilter && serialFilter.indexOf(serF) === -1) continue;
        if (!result[serF]) result[serF] = { inicio: null, fim: null };
        result[serF].inicio = (result[serF].inicio < dtSolF && result[serF].inicio) ? result[serF].inicio : (dtSolF || result[serF].inicio);
        if (dtEntF) result[serF].fim = result[serF].fim > dtEntF ? result[serF].fim : dtEntF;
      }
    }
    log.push('  → ' + Object.keys(result).length + ' seriais após FUP online');
  } else {
    log.push('  AVISO: aba FUP online não encontrada');
  }

  return result;
}

/**
 * Carrega dados de Fabricação Agricef dos Apontamentos (ops 0010-0050).
 * Retorna { '22000072': { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }, … }
 */
function _bf_loadFabricacao_(log, serialFilter) {
  var APONTS_ID = '15vtJ2eOw3Zd9f5MmwqEj18nsGAvVkFYFpsUsRbZM6Ik';
  var ss = SpreadsheetApp.openById(APONTS_ID);
  var result = {};

  var FAB_OPS = /^(0010|0020|0030|0040|0050)/;

  var sheet = _bf_findSheet_(ss, 'Respostas do Formulário');
  if (!sheet) {
    log.push('  AVISO: aba "Respostas do Formulário" não encontrada no Apontamentos');
    return result;
  }

  var data = sheet.getDataRange().getValues();
  var hdrs = data[0].map(function(h) { return String(h || '').trim(); });

  var colTs   = _bf_colIdx_(hdrs, /carimbo|timestamp/i, 0);
  var colTipo = _bf_colIdx_(hdrs, /tipo.*apontamento|apontamento.*tipo/i, 2);
  var colOp   = _bf_colIdx_(hdrs, /opera[çc][aã]o/i, 3);
  var colSer  = _bf_colIdx_(hdrs, /s[eé]rie/i, 5);

  log.push('  Apontamentos: ' + (data.length - 1) + ' linhas | colTs=' + colTs +
           ' colTipo=' + colTipo + ' colOp=' + colOp + ' colSer=' + colSer);

  for (var r = 1; r < data.length; r++) {
    var row  = data[r];
    var tipo = String(row[colTipo] || '').trim().toUpperCase();
    var op   = String(row[colOp]   || '').trim();

    if (tipo !== 'ABERTURA' && tipo !== 'FECHAMENTO') continue;
    if (!FAB_OPS.test(op)) continue;

    var serRaw = String(row[colSer] || '');
    var sm = serRaw.match(/\b(22\d{6})\b/);
    if (!sm) continue;
    var serial = sm[1];

    if (serialFilter && serialFilter.indexOf(serial) === -1) continue;

    var dt = _bf_parseDate_(row[colTs]);
    if (!dt) continue;

    if (!result[serial]) result[serial] = { inicio: null, fim: null };

    if (tipo === 'ABERTURA') {
      if (!result[serial].inicio || dt < result[serial].inicio) result[serial].inicio = dt;
    } else {
      if (!result[serial].fim    || dt > result[serial].fim)    result[serial].fim    = dt;
    }
  }

  log.push('  → ' + Object.keys(result).length + ' seriais com dados de fabricação');
  return result;
}

/**
 * Carrega dados de Pré-montagem e Montagens finais dos Apontamentos.
 * Operações cobertas:
 *   0030 → sempre Pré-montagem (MONTAR CALDEIRARIA/subconjunto estrutural)
 *   0070/0060/0090 → classificado pelo CÓDIGO DO ITEM:
 *     - item numérico 4xxxxx (BOM subconjunto) → Pré-montagem
 *     - padrões ELET-, HIDRA-, INSTAL-, OS15x/OS16x/OS17x, etc. → Montagens finais
 *     - demais → Montagens finais (padrão conservador)
 *
 * Retorna {
 *   '22000072': {
 *     preMontagem: { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' },
 *     montagens:   { inicio: 'YYYY-MM-DD', fim: 'YYYY-MM-DD' }
 *   }, …
 * }
 */
function _bf_loadMontagens_(log, serialFilter) {
  var APONTS_ID = '15vtJ2eOw3Zd9f5MmwqEj18nsGAvVkFYFpsUsRbZM6Ik';
  var ss = SpreadsheetApp.openById(APONTS_ID);
  var result = {};

  // Operações de montagem (0030 = pré, 0060/0070/0090 = depende do item)
  var MONT_OPS = /^(0030|0060|0070|0090)/;

  var sheet = _bf_findSheet_(ss, 'Respostas do Formulário');
  if (!sheet) {
    log.push('  AVISO: aba "Respostas do Formulário" não encontrada (Montagens)');
    return result;
  }

  var data = sheet.getDataRange().getValues();
  var hdrs = data[0].map(function(h) { return String(h || '').trim(); });

  var colTs   = _bf_colIdx_(hdrs, /carimbo|timestamp/i, 0);
  var colTipo = _bf_colIdx_(hdrs, /tipo.*apontamento|apontamento.*tipo/i, 2);
  var colOp   = _bf_colIdx_(hdrs, /opera[çc][aã]o/i, 3);
  var colItem = _bf_colIdx_(hdrs, /c[oó]d.*item|item.*c[oó]d|c[oó]digo\s*do\s*item/i, -1);
  var colSer  = _bf_colIdx_(hdrs, /s[eé]rie/i, 5);

  log.push('  Apontamentos (Montagens): ' + (data.length - 1) + ' linhas | ' +
           'colTs=' + colTs + ' colTipo=' + colTipo + ' colOp=' + colOp +
           ' colItem=' + colItem + ' colSer=' + colSer);

  function _minDate(a, b) { if (!a) return b; if (!b) return a; return a < b ? a : b; }
  function _maxDate(a, b) { if (!a) return b; if (!b) return a; return a > b ? a : b; }

  var unclassified = 0;  // contador para diagnóstico

  for (var r = 1; r < data.length; r++) {
    var row  = data[r];
    var tipo = String(row[colTipo] || '').trim().toUpperCase();
    var op   = String(row[colOp]   || '').trim();

    if (tipo !== 'ABERTURA' && tipo !== 'FECHAMENTO') continue;
    if (!MONT_OPS.test(op)) continue;

    var serRaw = String(row[colSer] || '');
    var sm = serRaw.match(/\b(22\d{6})\b/);
    if (!sm) continue;
    var serial = sm[1];

    if (serialFilter && serialFilter.indexOf(serial) === -1) continue;

    var dt = _bf_parseDate_(row[colTs]);
    if (!dt) continue;

    // Classificação da sub-fase
    var opPrefix = op.substring(0, 4);
    var item     = (colItem >= 0) ? String(row[colItem] || '').trim().toUpperCase() : '';
    var fase     = _bf_classifFaseMontagem_(opPrefix, item);

    if (!fase) { unclassified++; continue; }

    if (!result[serial]) result[serial] = {
      preMontagem: { inicio: null, fim: null },
      montagens:   { inicio: null, fim: null }
    };

    var bucket = (fase === 'PRE') ? result[serial].preMontagem : result[serial].montagens;

    if (tipo === 'ABERTURA') {
      bucket.inicio = _minDate(bucket.inicio, dt);
    } else {
      bucket.fim    = _maxDate(bucket.fim, dt);
    }
  }

  var countPre  = 0, countMont = 0;
  for (var ser in result) {
    if (result[ser].preMontagem.inicio || result[ser].preMontagem.fim) countPre++;
    if (result[ser].montagens.inicio   || result[ser].montagens.fim)   countMont++;
  }
  log.push('  → ' + Object.keys(result).length + ' seriais | Pré-montagem=' + countPre +
           ' Montagens=' + countMont + ' (não classificados: ' + unclassified + ')');
  return result;
}

/**
 * Classifica um apontamento de montagem em Pré-montagem ou Montagens finais.
 * @param {string} opPrefix  '0030' | '0060' | '0070' | '0090'
 * @param {string} item      CÓDIGO DO ITEM (uppercase, pode ser vazio)
 * @return {'PRE' | 'MONT' | null}
 */
function _bf_classifFaseMontagem_(opPrefix, item) {
  // Op 0030 (MONTAR CALDEIRARIA / subconjunto) → sempre Pré-montagem
  if (opPrefix === '0030') return 'PRE';

  // Item numérico 4xxxxx (BOM subconjunto estrutural) → Pré-montagem
  // Ex: 401020, 401021, 401023, 400991, 400992, 401109…
  if (/^4\d{5}$/.test(item)) return 'PRE';

  // Sem item ou item vazio em ops 0070/0090/0060 → Montagens (conservador)
  if (!item) return 'MONT';

  // Padrões de montagens finais (sistemas e componentes de encarroçamento)
  if (/^ELET[-\s]/i.test(item))            return 'MONT';  // elétrica
  if (/HIDR[AÁ]/i.test(item))             return 'MONT';  // hidráulica
  if (/^INSTAL/i.test(item))              return 'MONT';  // instalação
  if (/^OS1[5-9]/i.test(item))            return 'MONT';  // ordens de serviço OS15x-OS19x
  if (/^RNC/i.test(item))                 return 'MONT';  // retrabalho não-conformidade
  if (/RETRABALHO/i.test(item))           return 'MONT';
  if (/PERIFÉR/i.test(item))              return 'MONT';  // periféricos
  if (/^CAB[\s_-]+AUX/i.test(item))       return 'MONT';  // cab auxiliar
  if (/PNEU|RODA|PORCA|CUBO/i.test(item)) return 'MONT';  // rodagem
  if (/BALAN[CÇ]/i.test(item))            return 'MONT';  // balança
  if (/SILO|TANK|TANQUE/i.test(item))     return 'MONT';  // silo/tanque

  // Op 0060 (PINTAR) → sempre Montagens finais
  if (opPrefix === '0060') return 'MONT';

  // Op 0090 (CALAFETAR) → sempre Montagens finais
  if (opPrefix === '0090') return 'MONT';

  // Op 0070 com item não reconhecido → Montagens (conservador: encarroçamento geral)
  return 'MONT';
}

/**
 * DIAGNÓSTICO: inspeciona operações 0030/0060/0070/0090 nos Apontamentos.
 * Execute uma vez no editor GAS para ver CÓDIGO DO ITEM real e calibrar
 * a função _bf_classifFaseMontagem_ se necessário.
 * Imprime: cabeçalhos da aba + top-50 combinações (op, item, fase, contagem).
 */
function diagnosticarMontagens() {
  var APONTS_ID = '15vtJ2eOw3Zd9f5MmwqEj18nsGAvVkFYFpsUsRbZM6Ik';
  var ss    = SpreadsheetApp.openById(APONTS_ID);
  var sheet = _bf_findSheet_(ss, 'Respostas do Formulário');
  if (!sheet) { Logger.log('ERRO: aba não encontrada'); return; }

  var data = sheet.getDataRange().getValues();
  var hdrs = data[0].map(function(h) { return String(h || '').trim(); });

  Logger.log('=== CABEÇALHOS DA ABA APONTAMENTOS ===');
  hdrs.forEach(function(h, i) { if (h) Logger.log('  col ' + i + ': ' + h); });

  var colTipo = _bf_colIdx_(hdrs, /tipo.*apontamento|apontamento.*tipo/i, 2);
  var colOp   = _bf_colIdx_(hdrs, /opera[çc][aã]o/i, 3);
  var colItem = _bf_colIdx_(hdrs, /c[oó]d.*item|item.*c[oó]d|c[oó]digo\s*do\s*item/i, -1);
  var colSer  = _bf_colIdx_(hdrs, /s[eé]rie/i, 5);
  Logger.log('\ncolTipo=' + colTipo + ' colOp=' + colOp + ' colItem=' + colItem + ' colSer=' + colSer);

  var MONT_OPS = /^(0030|0060|0070|0090)/;
  var combos = {};

  for (var r = 1; r < data.length; r++) {
    var tipo = String(data[r][colTipo] || '').trim().toUpperCase();
    var op   = String(data[r][colOp]   || '').trim();
    if (tipo !== 'ABERTURA') continue;
    if (!MONT_OPS.test(op)) continue;
    var item  = (colItem >= 0) ? String(data[r][colItem] || '').trim().toUpperCase() : '(sem coluna)';
    var opPfx = op.substring(0, 4);
    var fase  = _bf_classifFaseMontagem_(opPfx, item);
    var key   = opPfx + '  |  ' + (item || '(vazio)') + '  →  ' + (fase || 'NÃO CLASSIFICADO');
    combos[key] = (combos[key] || 0) + 1;
  }

  var sorted = Object.keys(combos).sort(function(a, b) {
    return combos[b] - combos[a];
  });
  Logger.log('\n=== TOP COMBINAÇÕES (OP | ITEM → FASE) — apenas ABERTURA ===');
  sorted.slice(0, 60).forEach(function(k) {
    Logger.log('  x' + String(combos[k]).padStart(4) + '  ' + k);
  });
  Logger.log('\nTotal combinações distintas: ' + sorted.length);
}

/**
 * Busca subtarefas de projetos PCP Hauler no Jira, enriquecidas com o
 * summary do pai (necessário para extrair o serial S22000XXX).
 * Retorna array de issues com campo extra: sub.parentSummary
 */
function _bf_fetchSubtasks_(jiraBase, jiraAuth, log) {
  // Passo 1: busca tarefas pai PCP (tipo = Tarefa, Departamento = PCP)
  var jqlPai = 'project = AGTK AND issuetype = "Tarefa" AND Departamento = PCP ORDER BY created ASC';
  var parents = _bf_jiraSearch_(jiraBase, jiraAuth, jqlPai, 'key,summary,subtasks', log);
  log.push('  Tarefas pai PCP encontradas: ' + parents.length);

  // Passo 2: coleta chaves das subtarefas e mapeia subtask → parentSummary
  var subtaskKeys    = [];
  var parentBySubKey = {};

  for (var i = 0; i < parents.length; i++) {
    var p    = parents[i];
    var subs = (p.fields.subtasks) || [];
    for (var j = 0; j < subs.length; j++) {
      subtaskKeys.push(subs[j].key);
      parentBySubKey[subs[j].key] = p.fields.summary || '';
    }
  }

  if (!subtaskKeys.length) return [];

  // Passo 3: busca detalhes das subtarefas em lotes de 50
  var BATCH_SIZE = 50;
  var allSubtasks = [];

  for (var b = 0; b < subtaskKeys.length; b += BATCH_SIZE) {
    var batch    = subtaskKeys.slice(b, b + BATCH_SIZE);
    var batchJql = 'issue in (' + batch.join(',') + ')';
    var batchIssues = _bf_jiraSearch_(
      jiraBase, jiraAuth, batchJql,
      'summary,customfield_10008,customfield_10009', log
    );
    for (var k = 0; k < batchIssues.length; k++) {
      batchIssues[k].parentSummary = parentBySubKey[batchIssues[k].key] || '';
      allSubtasks.push(batchIssues[k]);
    }
    if (b + BATCH_SIZE < subtaskKeys.length) Utilities.sleep(200);
  }

  return allSubtasks;
}

/**
 * Busca paginada na API Jira REST v3 (endpoint /search/jql com nextPageToken).
 * CHANGE-2046: /rest/api/3/search?startAt foi removido — usar /rest/api/3/search/jql.
 */
function _bf_jiraSearch_(jiraBase, jiraAuth, jql, fields, log) {
  var maxResults    = 100;
  var allIssues     = [];
  var nextPageToken = null;

  do {
    var url = jiraBase + '/rest/api/3/search/jql' +
              '?jql='        + encodeURIComponent(jql) +
              '&fields='     + encodeURIComponent(fields) +
              '&maxResults=' + maxResults;
    if (nextPageToken) url += '&nextPageToken=' + encodeURIComponent(nextPageToken);

    try {
      var resp = UrlFetchApp.fetch(url, {
        headers: { 'Authorization': jiraAuth, 'Accept': 'application/json' },
        muteHttpExceptions: true
      });
      if (resp.getResponseCode() !== 200) {
        log.push('  ERRO Jira search HTTP ' + resp.getResponseCode() +
                 ': ' + resp.getContentText().substring(0, 250));
        break;
      }
      var data   = JSON.parse(resp.getContentText());
      var issues = data.issues || [];
      for (var i = 0; i < issues.length; i++) allIssues.push(issues[i]);

      // nextPageToken ausente = última página
      nextPageToken = data.nextPageToken || null;
      if (!issues.length || !nextPageToken) break;
      Utilities.sleep(100);
    } catch (e) {
      log.push('  EXCEÇÃO Jira search: ' + e.message);
      break;
    }
  } while (true);

  return allIssues;
}

/** Encontra aba da planilha pelo fragmento de nome (case-insensitive). */
function _bf_findSheet_(ss, fragment) {
  var lc = fragment.toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().indexOf(lc) !== -1) return sheets[i];
  }
  return null;
}

/** Retorna índice da primeira coluna cujo cabeçalho bate com regex; ou fallback. */
function _bf_colIdx_(hdrs, regex, fallback) {
  for (var i = 0; i < hdrs.length; i++) {
    if (hdrs[i] && regex.test(hdrs[i])) return i;
  }
  return (fallback !== undefined) ? fallback : -1;
}

/**
 * Extrai todos os seriais 22XXXXXX de uma string (handles "22000072 / 22000073").
 * Retorna array de strings sem duplicatas.
 */
function _bf_extractSerials_(pvVal) {
  var serials = [];
  var str = String(pvVal || '');
  var re  = /\b(22\d{6})\b/g;
  var m;
  while ((m = re.exec(str)) !== null) {
    if (serials.indexOf(m[1]) === -1) serials.push(m[1]);
  }
  return serials;
}

/**
 * Converte Date object ou string (dd/MM/yyyy ou yyyy-MM-dd) para 'yyyy-MM-dd'.
 * Retorna null se não for possível converter.
 */
function _bf_parseDate_(val) {
  if (!val) return null;
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return null;
    return Utilities.formatDate(val, 'America/Sao_Paulo', 'yyyy-MM-dd');
  }
  var s = String(val).trim();
  if (!s) return null;
  // dd/MM/yyyy ou d/M/yyyy
  var m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m1) {
    var dd = m1[1].length < 2 ? '0' + m1[1] : m1[1];
    var mm = m1[2].length < 2 ? '0' + m1[2] : m1[2];
    return m1[3] + '-' + mm + '-' + dd;
  }
  // yyyy-MM-dd (Jira format ou ISO)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  return null;
}


// ══════════════════════════════════════════════════════════════════
// buscarHaulerDadosCompletos
// FUNÇÃO COMBINADA — carrega TUDO em uma única execução GAS:
//   • Apontamentos (tempos, saldo, séries)
//   • Produção por serial (fases, progresso, compras)
// Cache 45 min via CacheService (chave hauler_completo_v2)
// ══════════════════════════════════════════════════════════════════
function buscarHaulerDadosCompletos() {
  var CACHE_KEY = 'hauler_completo_v2';
  var cache = CacheService.getScriptCache();

  // Tenta cache primeiro
  var parts = [];
  for (var pi = 0; pi < 10; pi++) {
    var part = cache.get(CACHE_KEY + '_' + pi);
    if (!part) break;
    parts.push(part);
  }
  if (parts.length > 0) {
    try { return JSON.parse(parts.join('')); } catch(e) { /* corrompido */ }
  }

  var APONT_ID   = '15vtJ2eOw3Zd9f5MmwqEj18nsGAvVkFYFpsUsRbZM6Ik';
  var COMPRAS_ID = '16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A';

  // ── Helpers ──────────────────────────────────────────────────────
  function minIso_(a,b){return(!a)?b:(!b)?a:(a<b?a:b);}
  function maxIso_(a,b){return(!a)?b:(!b)?a:(a>b?a:b);}
  function extractNum_(s){var m=/22\d{6}/.exec(String(s||''));return m?m[0]:null;}
  function classifyOp_(op){
    var o=String(op||'').toUpperCase()
      .replace(/[ÀÁÂÃÄ]/g,'A').replace(/[ÈÉÊË]/g,'E')
      .replace(/[ÌÍÎÏ]/g,'I').replace(/[ÒÓÔÕÖ]/g,'O')
      .replace(/[ÙÚÛÜ]/g,'U').replace(/Ç/g,'C');
    if(/^0010|^0020|^0040|^0050/.test(o))return'fabricacao';
    if(/^0030/.test(o)||/PRE.?MONT|PREMONTAG/.test(o))return'preMontagem';
    if(/^0060/.test(o))return'preMontagem';
    if(/^0070|^0080|^0090/.test(o)||/MONTAG/.test(o))return'montagem';
    if(/SERRA|CORTE|PLASMA|GUILH/.test(o))return'fabricacao';
    if(/SOLDA|USINAM|TORNEAM|FRESAM|FURAC/.test(o))return'fabricacao';
    if(/TESTE|COMISS/.test(o))return'teste';
    return'fabricacao';
  }

  // ── 1. LER APONTAMENTOS ──────────────────────────────────────────
  var tempos={}, saldoData=[], seriesSet={}, opSet={};
  var serialMap={};   // { '22000072': { fases:{}, opsAbertas:[], ... } }

  function getS_(num,nrSerie){
    if(!serialMap[num]){
      serialMap[num]={
        serial:num, nrSerie:nrSerie||('HAULER '+num),
        fases:{
          compras:    {inicio:null,fim:null,status:'sem_dados',nPedidos:0,nEntregues:0},
          fabricacao: {inicio:null,fim:null,status:'sem_dados',nOps:0,nAbertas:0},
          preMontagem:{inicio:null,fim:null,status:'sem_dados',nOps:0,nAbertas:0},
          montagem:   {inicio:null,fim:null,status:'sem_dados',nOps:0,nAbertas:0},
          teste:      {inicio:null,fim:null,status:'sem_dados',nOps:0,nAbertas:0}
        },
        opsAbertas:[],
        operadores:{},
        primeiraAtiv:null, ultimaAtiv:null
      };
    }
    return serialMap[num];
  }

  try {
    var ssA = SpreadsheetApp.openById(APONT_ID);

    // Saldo_Parcial
    var sSheet = ssA.getSheetByName('Saldo_Parcial');
    if(sSheet){
      var sVals = sSheet.getDataRange().getValues();
      saldoData = sVals.slice(1).filter(function(r){
        return r[0]&&String(r[0]).trim()&&String(r[0]).trim()!=='SUCESSO';
      }).map(function(r){
        return{nrSerie:String(r[0]||'').trim(),codItem:String(r[1]||'').trim(),
               operacao:String(r[2]||'').trim(),qtdRestante:Number(r[3])||0,
               ultimaAtualizacao:r[4]?Utilities.formatDate(new Date(r[4]),Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm'):''};
      });
    }

    // Respostas do Formulário
    var rSheet = ssA.getSheetByName('Respostas do Formulário 1');
    if(rSheet){
      var lastRow=rSheet.getLastRow();
      var startRow=Math.max(2,lastRow-9999);
      var numRowsA=lastRow-startRow+1;
      if(numRowsA>0){
        var vals=rSheet.getRange(startRow,1,numRowsA,8).getValues();
        var aberturas={};   // "serial|op" → tsIso

        for(var ri=0;ri<vals.length;ri++){
          var rw=vals[ri];
          var nrSerie=String(rw[5]||'');
          if(nrSerie.toUpperCase().indexOf('HAULER')===-1)continue;
          var ts=rw[0];
          if(!(ts instanceof Date)||isNaN(ts.getTime()))continue;
          var tsIso=ts.toISOString();
          var tipoApont=String(rw[2]||'').trim();
          var tipoOp=String(rw[3]||'').trim();
          var codItem=String(rw[4]||'').trim();
          var operador=String(rw[1]||'').trim();
          if(!tipoOp)continue;

          var num=extractNum_(nrSerie);
          if(!num)continue;
          seriesSet[num]=true;
          opSet[tipoOp]=true;

          var s=getS_(num,nrSerie.trim());
          s.primeiraAtiv=minIso_(s.primeiraAtiv,tsIso);
          s.ultimaAtiv=maxIso_(s.ultimaAtiv,tsIso);
          if(operador)s.operadores[operador]=(s.operadores[operador]||0)+1;

          var fase=classifyOp_(tipoOp);
          var f=s.fases[fase]||s.fases.fabricacao;
          var chave=num+'|'+tipoOp;

          if(tipoApont==='ABERTURA'){
            aberturas[chave]=tsIso;
            f.inicio=minIso_(f.inicio,tsIso);
            if(f.status==='sem_dados')f.status='em_andamento';
          } else if(tipoApont==='FECHAMENTO'){
            f.nOps++;
            f.fim=maxIso_(f.fim,tsIso);
            if(aberturas[chave])delete aberturas[chave];
            if(f.nAbertas<=0)f.status='concluida';
          }

          // tempos por codItem (para cruzamento com BOM)
          if(codItem&&tipoOp){
            var chaveT=codItem+'|'+tipoOp+'|'+num;
            if(tipoApont==='ABERTURA'){
              aberturas[chaveT]=tsIso;
            } else if(tipoApont==='FECHAMENTO'&&aberturas[chaveT]){
              var durH=(new Date(tsIso)-new Date(aberturas[chaveT]))/3600000;
              delete aberturas[chaveT];
              if(durH>0&&durH<480){
                if(!tempos[codItem])tempos[codItem]={};
                if(!tempos[codItem][tipoOp])tempos[codItem][tipoOp]={sum:0,count:0,min:9999,max:0,ultimo:'',nrSeries:[]};
                var t=tempos[codItem][tipoOp];
                t.sum+=durH;t.count++;
                if(durH<t.min)t.min=durH;
                if(durH>t.max)t.max=durH;
                t.ultimo=Utilities.formatDate(ts,Session.getScriptTimeZone(),'yyyy-MM-dd');
                if(t.nrSeries.indexOf(num)===-1)t.nrSeries.push(num);
              }
            }
          }
        }

        // Ops ainda abertas
        var aKeys=Object.keys(aberturas);
        for(var ai=0;ai<aKeys.length;ai++){
          var ak=aKeys[ai];
          // Ignora chaves de codItem|op|serial (3 partes)
          var akParts=ak.split('|');
          if(akParts.length!==2)continue;
          var sn=akParts[0],op=akParts[1];
          if(serialMap[sn]){
            serialMap[sn].opsAbertas.push(op);
            var fase2=classifyOp_(op);
            var f2=serialMap[sn].fases[fase2]||serialMap[sn].fases.fabricacao;
            f2.nAbertas=(f2.nAbertas||0)+1;
            f2.status='em_andamento';
          }
        }
      }
    }
  } catch(eA){ Logger.log('Apontamentos erro: '+eA.message); }

  // Calcular médias de tempos
  Object.keys(tempos).forEach(function(cod){
    Object.keys(tempos[cod]).forEach(function(op){
      var t=tempos[cod][op];
      t.avg=Math.round(t.sum/t.count*100)/100;
      t.min=Math.round(t.min*100)/100;
      t.max=Math.round(t.max*100)/100;
      delete t.sum;
    });
  });

  // ── 2. LER COMPRAS por serial ────────────────────────────────────
  try {
    var ssC=SpreadsheetApp.openById(COMPRAS_ID);
    var tabsC=[
      {name:'Pedidos Conclu',isConc:true},
      {name:'FUP',isConc:false}
    ];
    for(var tc=0;tc<tabsC.length;tc++){
      var sh=_bf_findSheet_(ssC,tabsC[tc].name);
      if(!sh)continue;
      var nRowsC=sh.getLastRow(), nColsC=sh.getLastColumn();
      var readFrom=Math.max(1,nRowsC-4999);
      var readCount=nRowsC-readFrom+1;
      var dataC=sh.getRange(readFrom,1,readCount,nColsC).getValues();
      if(readFrom>1){
        var hdrC=sh.getRange(1,1,1,nColsC).getValues();
        dataC=hdrC.concat(dataC);
      }
      var hdrsC=dataC[0].map(function(h){return String(h||'').trim();});
      var colSol=_bf_colIdx_(hdrsC,/solicit/i,2);
      var colEntA=_bf_colIdx_(hdrsC,/atualiz/i,24);
      var colEntE=_bf_colIdx_(hdrsC,/efetiv/i,26);
      var colStatus=_bf_colIdx_(hdrsC,/status|situa/i,-1);

      for(var rr=1;rr<dataC.length;rr++){
        var rowC=dataC[rr];
        var snList=_bf_extractSerials_(rowC[0]);
        if(!snList.length)continue;
        var dtSol=_bf_parseDate_(rowC[colSol]);
        var dtFimD=rowC[colEntE] instanceof Date&&!isNaN(rowC[colEntE])?rowC[colEntE]
                  :rowC[colEntA] instanceof Date&&!isNaN(rowC[colEntA])?rowC[colEntA]:null;
        var dtFim=dtFimD?dtFimD.toISOString():null;
        // Pedidos Concluídos = entregue por definição (a aba já filtra pedidos concluídos)
        // dtFim pode ser nulo se a coluna de data efetiva não foi preenchida
        var isEntregue=tabsC[tc].isConc;

        for(var si=0;si<snList.length;si++){
          var sn2=snList[si];
          var sd=getS_(sn2,null);
          var comp=sd.fases.compras;
          comp.nPedidos++;
          if(isEntregue)comp.nEntregues++;
          if(dtSol)comp.inicio=minIso_(comp.inicio,dtSol);
          if(dtFim)comp.fim=maxIso_(comp.fim,dtFim);
          if(comp.status==='sem_dados'){
            comp.status=tabsC[tc].isConc?'concluida':'em_andamento';
          }
          sd.primeiraAtiv=minIso_(sd.primeiraAtiv,dtSol||dtFim);
          sd.ultimaAtiv=maxIso_(sd.ultimaAtiv,dtFim||dtSol);
        }
      }
    }
  } catch(eC){ Logger.log('Compras erro: '+eC.message); }

  // ── 3. CONSTRUIR RESULTADO POR SERIAL ────────────────────────────
  var FASE_PRIORITY=['montagem','preMontagem','fabricacao','compras'];
  var serialResult=Object.keys(serialMap).map(function(num){
    var s=serialMap[num];

    // Fase atual = mais avançada em andamento
    var faseAtual='compras';
    for(var fi=0;fi<FASE_PRIORITY.length;fi++){
      var fn=FASE_PRIORITY[fi];
      if(s.fases[fn]&&s.fases[fn].status==='em_andamento'){faseAtual=fn;break;}
    }
    if(s.fases[faseAtual].status!=='em_andamento'){
      for(var fi2=0;fi2<FASE_PRIORITY.length;fi2++){
        if(s.fases[FASE_PRIORITY[fi2]].status!=='sem_dados'){faseAtual=FASE_PRIORITY[fi2];break;}
      }
    }

    // % progresso estimado (pesos por fase: compras=10, fab=30, preMont=25, mont=35)
    var PESOS={compras:10,fabricacao:30,preMontagem:25,montagem:35};
    var totalPeso=0, pesoFeito=0;
    Object.keys(PESOS).forEach(function(fn3){
      var p=PESOS[fn3];
      totalPeso+=p;
      var f=s.fases[fn3];
      if(!f||f.status==='sem_dados')return;
      if(f.status==='concluida')pesoFeito+=p;
      else if(f.status==='em_andamento')pesoFeito+=p*0.5;
    });
    var pctGeral=Math.round(pesoFeito/totalPeso*100);

    // % compras entregues
    var comp=s.fases.compras;
    var pctComprasEntregues=comp.nPedidos>0?Math.round(comp.nEntregues/comp.nPedidos*100):null;

    // Dias em produção
    var diasProd=null;
    if(s.primeiraAtiv&&s.ultimaAtiv){
      diasProd=Math.round((new Date(s.ultimaAtiv)-new Date(s.primeiraAtiv))/86400000);
    }

    // Top operadores
    var topOps=Object.keys(s.operadores).sort(function(a,b){return s.operadores[b]-s.operadores[a];}).slice(0,3);

    return{
      serial:s.serial, nrSerie:s.nrSerie,
      fases:s.fases, faseAtual:faseAtual,
      opsAbertas:s.opsAbertas.slice(0,5),
      pctGeral:pctGeral,
      pctComprasEntregues:pctComprasEntregues,
      diasProd:diasProd,
      operadores:topOps,
      primeiraAtiv:s.primeiraAtiv, ultimaAtiv:s.ultimaAtiv
    };
  });

  serialResult.sort(function(a,b){return(b.ultimaAtiv||'')>(a.ultimaAtiv||'')?1:-1;});

  var resumo={compras:0,fabricacao:0,preMontagem:0,montagem:0,teste:0,total:0};
  serialResult.forEach(function(s){resumo[s.faseAtual]=(resumo[s.faseAtual]||0)+1;resumo.total++;});

  var out={
    // Para aba Apontamentos
    apontamentos:{
      saldo:saldoData,
      tempos:tempos,
      operacoes:Object.keys(opSet),
      series:Object.keys(seriesSet)
    },
    // Para aba Por Serial
    serial:{seriais:serialResult,resumo:resumo},
    geradoEm:new Date().toISOString(),
    cached:false
  };

  // Salvar cache em chunks de 90KB (CacheService limita 100KB/entry)
  try{
    var fullJson=JSON.stringify(out);
    var chunkSize=90000;
    var numChunks=Math.ceil(fullJson.length/chunkSize);
    for(var ci=0;ci<numChunks&&ci<10;ci++){
      cache.put(CACHE_KEY+'_'+ci,fullJson.slice(ci*chunkSize,(ci+1)*chunkSize),2700);
    }
  }catch(eSave){Logger.log('Cache save erro: '+eSave.message);}

  return out;
}

// ══════════════════════════════════════════════════════════════════
// HAULER — APONTAMENTOS ANALYSIS
// Lê Saldo_Parcial e calcula lead times dos apontamentos de produção
// ══════════════════════════════════════════════════════════════════
function buscarApontamentosHauler() {
  var cacheApont = CacheService.getScriptCache();
  var cachedA = cacheApont.get('hauler_apontamentos_v1');
  if (cachedA) { try { return JSON.parse(cachedA); } catch(e) {} }

  const APONT_ID = '15vtJ2eOw3Zd9f5MmwqEj18nsGAvVkFYFpsUsRbZM6Ik';
  const ss = SpreadsheetApp.openById(APONT_ID);

  // ── 1. Saldo_Parcial ──────────────────────────────────────────
  const saldoSheet = ss.getSheetByName('Saldo_Parcial');
  const saldoVals  = saldoSheet ? saldoSheet.getDataRange().getValues() : [];
  const saldo = saldoVals.slice(1)
    .filter(r => r[0] && String(r[0]).trim() && String(r[0]).trim() !== 'SUCESSO')
    .map(r => ({
      nrSerie          : String(r[0] || '').trim(),
      codItem          : String(r[1] || '').trim(),
      operacao         : String(r[2] || '').trim(),
      qtdRestante      : Number(r[3]) || 0,
      ultimaAtualizacao: r[4] ? Utilities.formatDate(new Date(r[4]), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : ''
    }));

  // ── 2. Respostas — últimas 6000 linhas ────────────────────────
  const respostasSheet = ss.getSheetByName('Respostas do Formulário 1');
  const tempos    = {};   // { codItem: { operacao: {sum,count,min,max,ultimo} } }
  const seriesSet = {};
  const opSet     = {};

  if (respostasSheet) {
    const lastRow  = respostasSheet.getLastRow();
    const startRow = Math.max(2, lastRow - 5999);
    const numRows  = lastRow - startRow + 1;
    if (numRows > 0) {
      // Cols: A=timestamp B=operador C=tipoApontamento D=tipoOperacao E=codItem F=nrSerie G=qtd H=obs
      const vals = respostasSheet.getRange(startRow, 1, numRows, 8).getValues();
      const pendentes = {};

      vals.forEach(function(r) {
        const serie = String(r[5] || '');
        if (!serie.toUpperCase().includes('HAULER')) return;

        const ts             = r[0];
        const tipoApontamento = String(r[2] || '').trim();
        const tipoOperacao    = String(r[3] || '').trim();
        const codItem         = String(r[4] || '').trim();
        const nrSerie         = serie.trim();

        if (!codItem || !tipoOperacao) return;

        seriesSet[nrSerie]   = true;
        opSet[tipoOperacao]  = true;

        const chave = codItem + '|' + tipoOperacao + '|' + nrSerie;

        if (tipoApontamento === 'ABERTURA') {
          pendentes[chave] = ts;
        } else if (tipoApontamento === 'FECHAMENTO' && pendentes[chave]) {
          const durMs = new Date(ts) - new Date(pendentes[chave]);
          const durH  = durMs / 3600000;
          delete pendentes[chave];

          if (durH > 0 && durH < 480) {   // sanity: 0-480h
            if (!tempos[codItem])              tempos[codItem] = {};
            if (!tempos[codItem][tipoOperacao]) tempos[codItem][tipoOperacao] = {sum:0,count:0,min:9999,max:0,ultimo:''};
            var t = tempos[codItem][tipoOperacao];
            t.sum  += durH;
            t.count++;
            if (durH < t.min) t.min = durH;
            if (durH > t.max) t.max = durH;
            t.ultimo = ts ? Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
          }
        }
      });
    }
  }

  // ── 3. Calcular médias ────────────────────────────────────────
  Object.keys(tempos).forEach(function(cod) {
    Object.keys(tempos[cod]).forEach(function(op) {
      var t = tempos[cod][op];
      t.avg = Math.round((t.sum / t.count) * 100) / 100;
      t.min = Math.round(t.min * 100) / 100;
      t.max = Math.round(t.max * 100) / 100;
      delete t.sum;
    });
  });

  var apontOut = {
    saldo      : saldo,
    tempos     : tempos,
    operacoes  : Object.keys(opSet),
    series     : Object.keys(seriesSet)
  };
  try {
    var aj = JSON.stringify(apontOut);
    if (aj.length < 95000) cacheApont.put('hauler_apontamentos_v1', aj, 2700);
  } catch(eA) {}
  return apontOut;
}

// ═══════════════════════════════════════════════════════════════════
// buscarProducaoHaulerPorSerial
// Retorna o status de produção de CADA número de série Hauler,
// cruzando Apontamentos (fabricação/montagem) + Compras (pedidos).
// Permite enxergar quantos Haulers estão em paralelo e em que etapa.
// ═══════════════════════════════════════════════════════════════════
function buscarProducaoHaulerPorSerial() {
  // Cache 45 min — evita timeout em chamadas frequentes
  var CACHE_KEY = 'hauler_producao_serial_v2';
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch(e) { /* cache corrompido, recalcular */ }
  }

  var APONT_ID   = '15vtJ2eOw3Zd9f5MmwqEj18nsGAvVkFYFpsUsRbZM6Ik';
  var COMPRAS_ID = '16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A';

  // Extrai número serial (22xxxxxx) de strings como "HAULER 22000072"
  function extractNum_(s) {
    var m = /22\d{6}/.exec(String(s || ''));
    return m ? m[0] : null;
  }

  // Classifica tipoOperacao → fase de produção
  function classifyOp_(op) {
    var o = String(op || '').toUpperCase()
      .replace(/[ÀÁÂÃÄ]/g,'A').replace(/[ÈÉÊË]/g,'E')
      .replace(/[ÌÍÎÏ]/g,'I').replace(/[ÒÓÔÕÖ]/g,'O')
      .replace(/[ÙÚÛÜ]/g,'U').replace(/Ç/g,'C');
    if (/^0010|^0020|^0030|^0040|^0050/.test(o)) return 'fabricacao';
    if (/^0060/.test(o) || /PRE.?MONT|PREMONTAG/.test(o)) return 'preMontagem';
    if (/^0070|^0080|^0090/.test(o) || /MONTAG/.test(o)) return 'montagem';
    if (/SERRA|CORTE|PLASMA|GUILH/.test(o)) return 'fabricacao';
    if (/SOLDA|USINAM|TORNEAM|FRESAM|FURAC/.test(o)) return 'fabricacao';
    if (/TESTE|COMISS/.test(o)) return 'teste';
    return 'outros';
  }

  // Acumula data ISO mínima/máxima
  function minIso_(a, b) { return (!a) ? b : (!b) ? a : (a < b ? a : b); }
  function maxIso_(a, b) { return (!a) ? b : (!b) ? a : (a > b ? a : b); }

  // Mapa principal: serial → dados
  var seriais = {};
  function getS_(num, nrSerie) {
    if (!seriais[num]) {
      seriais[num] = {
        serial: num,
        nrSerie: nrSerie || ('HAULER ' + num),
        fases: {
          compras:     { inicio: null, fim: null, status: 'sem_dados', nPedidos: 0 },
          fabricacao:  { inicio: null, fim: null, status: 'sem_dados', nOps: 0 },
          preMontagem: { inicio: null, fim: null, status: 'sem_dados', nOps: 0 },
          montagem:    { inicio: null, fim: null, status: 'sem_dados', nOps: 0 },
          teste:       { inicio: null, fim: null, status: 'sem_dados', nOps: 0 }
        },
        opsAbertas: [],     // operações com ABERTURA sem FECHAMENTO correspondente
        primeiraAtiv: null,
        ultimaAtiv: null
      };
    }
    return seriais[num];
  }

  // ── 1. Apontamentos ─────────────────────────────────────────────
  try {
    var ssA = SpreadsheetApp.openById(APONT_ID);
    var rSheet = ssA.getSheetByName('Respostas do Formulário 1');
    if (rSheet) {
      var lastRow = rSheet.getLastRow();
      var startRow = Math.max(2, lastRow - 11999);
      var numRows = lastRow - startRow + 1;
      if (numRows > 0) {
        // Cols: A=ts B=oper C=tipoApont D=tipoOp E=codItem F=nrSerie G=qtd H=obs
        var vals = rSheet.getRange(startRow, 1, numRows, 8).getValues();
        var aberturas = {};   // "serial|op" → tsIso

        for (var r = 0; r < vals.length; r++) {
          var row = vals[r];
          var nrSerie = String(row[5] || '');
          if (nrSerie.toUpperCase().indexOf('HAULER') === -1) continue;

          var num = extractNum_(nrSerie);
          if (!num) continue;

          var ts = row[0];
          if (!(ts instanceof Date) || isNaN(ts.getTime())) continue;
          var tsIso = ts.toISOString();

          var tipoApont = String(row[2] || '').trim();
          var tipoOp    = String(row[3] || '').trim();
          if (!tipoOp) continue;

          var s = getS_(num, nrSerie.trim());
          s.primeiraAtiv = minIso_(s.primeiraAtiv, tsIso);
          s.ultimaAtiv   = maxIso_(s.ultimaAtiv, tsIso);

          var fase = classifyOp_(tipoOp);
          if (fase === 'outros') fase = 'fabricacao';  // fallback
          var f = s.fases[fase] || s.fases.fabricacao;

          var chave = num + '|' + tipoOp;

          if (tipoApont === 'ABERTURA') {
            aberturas[chave] = tsIso;
            f.inicio = minIso_(f.inicio, tsIso);
            if (f.status === 'sem_dados') f.status = 'em_andamento';
          } else if (tipoApont === 'FECHAMENTO') {
            f.nOps++;
            f.fim = maxIso_(f.fim, tsIso);
            if (aberturas[chave]) {
              delete aberturas[chave];
            }
            // Marca como concluída só se não há abertura pendente para esta op
            if (f.status !== 'em_andamento' || !aberturas[chave]) {
              f.status = 'concluida';
            }
          }
        }

        // Ops ainda abertas (ABERTURA sem FECHAMENTO)
        var aKeys = Object.keys(aberturas);
        for (var ai = 0; ai < aKeys.length; ai++) {
          var parts = aKeys[ai].split('|');
          var sn = parts[0];
          var op = parts.slice(1).join('|');
          if (seriais[sn]) {
            seriais[sn].opsAbertas.push(op);
            var fase2 = classifyOp_(op);
            if (fase2 === 'outros') fase2 = 'fabricacao';
            if (seriais[sn].fases[fase2]) seriais[sn].fases[fase2].status = 'em_andamento';
          }
        }
      }
    }
  } catch(eA) {
    Logger.log('Erro Apontamentos: ' + eA.message);
  }

  // ── 2. Compras por serial (Pedidos Concluídos + FUP) ────────────
  try {
    var ssC = SpreadsheetApp.openById(COMPRAS_ID);
    var tabsCompras = [
      { name: 'Pedidos Conclu', status: 'concluida' },
      { name: 'FUP',            status: 'em_andamento' }
    ];
    for (var tc = 0; tc < tabsCompras.length; tc++) {
      var sh = _bf_findSheet_(ssC, tabsCompras[tc].name);
      if (!sh) continue;
      // Pedidos Concluídos tem 33k linhas — lemos só as últimas 5000 (mais recentes)
      var nRows = sh.getLastRow();
      var nCols = sh.getLastColumn();
      var readFrom = Math.max(1, nRows - 4999);
      var readCount = nRows - readFrom + 1;
      var data = sh.getRange(readFrom, 1, readCount, nCols).getValues();
      // Garantir que sempre temos o cabeçalho (linha 1)
      if (readFrom > 1) {
        var hdrRow = sh.getRange(1, 1, 1, nCols).getValues();
        data = hdrRow.concat(data);
      }
      var hdrs = data[0].map(function(h){ return String(h||'').trim(); });
      var colSol  = _bf_colIdx_(hdrs, /solicit/i, 2);
      var colEntA = _bf_colIdx_(hdrs, /atualiz/i, 24);
      var colEntE = _bf_colIdx_(hdrs, /efetiv/i, 26);

      for (var rr = 1; rr < data.length; rr++) {
        var rw = data[rr];
        var snList = _bf_extractSerials_(rw[0]);
        if (!snList.length) continue;

        var dtSol  = _bf_parseDate_(rw[colSol]);
        var dtFimD = rw[colEntE] instanceof Date && !isNaN(rw[colEntE]) ? rw[colEntE]
                   : rw[colEntA] instanceof Date && !isNaN(rw[colEntA]) ? rw[colEntA] : null;
        var dtFim  = dtFimD ? dtFimD.toISOString() : null;

        for (var si2 = 0; si2 < snList.length; si2++) {
          var sn2 = snList[si2];
          var sd = getS_(sn2, null);
          var comp = sd.fases.compras;
          comp.nPedidos++;
          if (dtSol)  comp.inicio = minIso_(comp.inicio, dtSol);
          if (dtFim)  comp.fim    = maxIso_(comp.fim, dtFim);
          if (comp.status === 'sem_dados') comp.status = tabsCompras[tc].status;
          if (tabsCompras[tc].status === 'concluida' && dtFim) comp.status = 'concluida';
          // Atualiza atividade geral
          sd.primeiraAtiv = minIso_(sd.primeiraAtiv, dtSol || dtFim);
          sd.ultimaAtiv   = maxIso_(sd.ultimaAtiv, dtFim || dtSol);
        }
      }
    }
  } catch(eC) {
    Logger.log('Erro Compras: ' + eC.message);
  }

  // ── 3. Determinar fase atual de cada serial ──────────────────────
  var FASE_ORDER = ['montagem','preMontagem','fabricacao','compras'];
  var FASE_PRIORITY_EM = ['montagem','preMontagem','fabricacao','compras'];

  var result = Object.keys(seriais).map(function(num) {
    var s = seriais[num];

    // Fase atual = a mais avançada em andamento; se nenhuma em andamento, a mais avançada concluída
    var faseAtual = 'compras';
    for (var fi = 0; fi < FASE_PRIORITY_EM.length; fi++) {
      var fn = FASE_PRIORITY_EM[fi];
      if (s.fases[fn] && s.fases[fn].status === 'em_andamento') { faseAtual = fn; break; }
    }
    if (faseAtual === 'compras' && s.fases.compras.status !== 'em_andamento') {
      // Nenhuma em andamento — pegar a mais avançada com dados
      for (var fi2 = 0; fi2 < FASE_ORDER.length; fi2++) {
        var fn2 = FASE_ORDER[fi2];
        if (s.fases[fn2] && s.fases[fn2].status !== 'sem_dados') { faseAtual = fn2; break; }
      }
    }

    return {
      serial:      s.serial,
      nrSerie:     s.nrSerie,
      fases:       s.fases,
      faseAtual:   faseAtual,
      opsAbertas:  s.opsAbertas.slice(0, 5),
      primeiraAtiv: s.primeiraAtiv,
      ultimaAtiv:   s.ultimaAtiv
    };
  });

  // Ordenar: mais recentemente ativo primeiro
  result.sort(function(a, b) {
    return (b.ultimaAtiv || '') > (a.ultimaAtiv || '') ? 1 : -1;
  });

  // Resumo por fase atual
  var resumo = { compras:0, fabricacao:0, preMontagem:0, montagem:0, teste:0, total:0 };
  result.forEach(function(s) { resumo[s.faseAtual] = (resumo[s.faseAtual]||0)+1; resumo.total++; });

  var out = { seriais: result, resumo: resumo, cached: false, geradoEm: new Date().toISOString() };
  try {
    var json = JSON.stringify(out);
    if (json.length < 95000) {  // CacheService limita a 100KB por entry
      cache.put(CACHE_KEY, json, 2700);  // 45 min
    }
  } catch(eSave) { /* ignora erro de cache */ }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
// buscarComprasHaulerLeadTime — Lead time de compras de itens HAULER
// Planilha: 16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A
// Fontes (em ordem de prioridade):
//   1. Histórico de compras atualiz. (GID 1262083750) — 12k linhas, recente
//   2. Pedidos Concluídos (GID 1157760877) — 33k linhas, lê últimas 8k
//   3. FUP online (GID 216149682) — pedidos em aberto
//   4. Pedidos Programação Hauler (GID 780101220) — planejamento Hauler
// ═══════════════════════════════════════════════════════════════════
function buscarComprasHaulerLeadTime() {
  // ── Cache chunked (90 KB por fatia, TTL 45 min) ───────────────────
  var CACHE_KEY = 'hauler_compras_v1';
  var cache = CacheService.getScriptCache();
  var parts = [];
  for (var pi = 0; pi < 15; pi++) {
    var part = cache.get(CACHE_KEY + '_' + pi);
    if (!part) break;
    parts.push(part);
  }
  if (parts.length > 0) {
    try {
      var cached = JSON.parse(parts.join(''));
      cached.cached = true;
      return cached;
    } catch(e) { /* cache corrompido, recalcular */ }
  }

  var COMPRAS_ID = '16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A';
  var ss = SpreadsheetApp.openById(COMPRAS_ID);

  // Mapa de todas as abas por GID para busca rápida
  var allSheets = ss.getSheets();
  var sheetByGid = {};
  for (var si = 0; si < allSheets.length; si++) {
    sheetByGid[allSheets[si].getSheetId()] = allSheets[si];
  }

  // ── Configuração das abas a ler ───────────────────────────────────
  // headerRow: índice da linha com cabeçalhos reais (0-based no array de valores)
  // maxDataRows: limite de linhas de dados lidas (null = todas)
  var TAB_CONFIGS = [
    { gid: 1262083750, label: 'Histórico compras',      headerRow: 0, maxDataRows: 4000 },
    { gid: 1157760877, label: 'Pedidos Concluídos',     headerRow: 0, maxDataRows: 4000 },
    { gid: 216149682,  label: 'FUP online',             headerRow: 0, maxDataRows: null },
    { gid: 780101220,  label: 'Pedidos Prog. Hauler',   headerRow: 1, maxDataRows: null }
  ];

  // ── Utilitários ───────────────────────────────────────────────────
  function normH_(raw) {
    return String(raw || '').toUpperCase()
      .replace(/[ÀÁÂÃÄÅ]/g,'A').replace(/[ÈÉÊË]/g,'E')
      .replace(/[ÌÍÎÏ]/g,'I').replace(/[ÒÓÔÕÖ]/g,'O')
      .replace(/[ÙÚÛÜ]/g,'U').replace(/Ç/g,'C').replace(/Ñ/g,'N')
      .replace(/[^A-Z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  }
  function findCol_(hdrs, kws) {
    for (var c = 0; c < hdrs.length; c++) {
      var h = normH_(hdrs[c]);
      for (var k = 0; k < kws.length; k++) {
        if (h.indexOf(kws[k]) !== -1) return c;
      }
    }
    return -1;
  }

  function normCod_(raw) {
    var s = String(raw || '').trim().replace(/^0+/, '').toUpperCase();
    return s;
  }

  // Itens agregados por código normalizado
  var items = {};
  var diagnostics = [];
  var totalRows = 0;

  // ── Loop pelas abas ───────────────────────────────────────────────
  for (var ti = 0; ti < TAB_CONFIGS.length; ti++) {
    var cfg = TAB_CONFIGS[ti];
    var sh = sheetByGid[cfg.gid];
    if (!sh) {
      diagnostics.push({ label: cfg.label, erro: 'Aba não encontrada (GID=' + cfg.gid + ')' });
      continue;
    }

    // Leitura eficiente: para abas grandes, pegar só as últimas maxDataRows
    var allVals;
    var numRows = sh.getLastRow();
    var numCols = sh.getLastColumn();
    if (numRows < 2 || numCols < 1) {
      diagnostics.push({ label: cfg.label, erro: 'Aba vazia' });
      continue;
    }

    if (cfg.maxDataRows && numRows > cfg.headerRow + 1 + cfg.maxDataRows) {
      // Lê cabeçalho(s) + últimas maxDataRows linhas
      var headerVals = sh.getRange(1, 1, cfg.headerRow + 1, numCols).getValues();
      var dataStart  = numRows - cfg.maxDataRows + 1;
      var dataVals   = sh.getRange(dataStart, 1, cfg.maxDataRows, numCols).getValues();
      allVals = headerVals.concat(dataVals);
    } else {
      allVals = sh.getRange(1, 1, numRows, numCols).getValues();
    }

    if (allVals.length <= cfg.headerRow + 1) {
      diagnostics.push({ label: cfg.label, erro: 'Sem dados após cabeçalho' });
      continue;
    }

    var headers = allVals[cfg.headerRow].map(function(h) { return String(h || '').trim(); });

    // Detectar colunas
    // Após normH_: "CÓD. AGRICEF" → "COD AGRICEF", "DESCRIÇÃO" → "DESCRICAO" etc.
    var iCod     = findCol_(headers, ['COD AGRI','CODIGO AGRI','COD MAT','CODIGO MAT',
                                      'AGRICEF','COD PROD','CODIGO PROD','CODIGO ITEM',
                                      'CODIGO','COD']);
    var iProd    = findCol_(headers, ['DESCRICAO','PRODUTO','MATERIAL','DESCR','ITEM']);
    var iForn    = findCol_(headers, ['FORNEC']);
    var iStatus  = findCol_(headers, ['STATUS','SITUA','CONCLU','SITUACAO','OBS']);
    var iDataPed = findCol_(headers, ['DATA SOL','SOLICIT','DATA PED','EMISSA',
                                      'DATA COMP','COMPRA','DATA REQ','DATA DE SOL']);
    var iDataEnt = findCol_(headers, ['ENTREGA EFET','EFETIV','ENTREGA REAL',
                                      'ENTREGA ATU','ATUALIZ','RECEB',
                                      'DATA ENT','PREVISAO','ENTREGA','PREV']);
    var iQtd     = findCol_(headers, ['QTD','QUANT']);

    // Fallback auto-detect datas por tipo Date nas primeiras linhas de dados
    if (iDataPed < 0 || iDataEnt < 0) {
      var dateCols = [];
      for (var dc = 0; dc < Math.min(headers.length, allVals[cfg.headerRow + 1] ? allVals[cfg.headerRow + 1].length : 0); dc++) {
        if (allVals[cfg.headerRow + 1][dc] instanceof Date) dateCols.push(dc);
      }
      if (iDataPed < 0 && dateCols.length > 0) iDataPed = dateCols[0];
      if (iDataEnt < 0 && dateCols.length > 1) iDataEnt = dateCols[dateCols.length - 1];
    }

    var diag = {
      label: cfg.label,
      sheetName: sh.getName(),
      totalSheetRows: numRows,
      rowsRead: allVals.length - (cfg.headerRow + 1),
      headers: headers.filter(function(h){return h;}).slice(0, 15),
      colMap: { iCod:iCod, iProd:iProd, iForn:iForn, iDataPed:iDataPed, iDataEnt:iDataEnt, iStatus:iStatus },
      itensEncontrados: 0
    };

    if (iCod < 0) {
      diag.aviso = 'Coluna de código não encontrada — aba ignorada';
      diagnostics.push(diag);
      continue;
    }

    var tabRows = 0;
    for (var r = cfg.headerRow + 1; r < allVals.length; r++) {
      var row = allVals[r];

      // Pular linhas vazias
      var hasData = false;
      for (var c2 = 0; c2 < Math.min(row.length, 8); c2++) {
        if (row[c2] !== '' && row[c2] !== null && row[c2] !== undefined) { hasData = true; break; }
      }
      if (!hasData) continue;

      var rawCod = String(row[iCod] || '').trim();
      if (!rawCod || !/\d/.test(rawCod)) continue;  // precisa ter ao menos um dígito

      var cod = normCod_(rawCod);
      if (!cod) continue;

      var forn    = iForn    >= 0 ? String(row[iForn]    || '').trim() : '';
      var desc    = iProd    >= 0 ? String(row[iProd]    || '').trim() : '';
      var status  = iStatus  >= 0 ? String(row[iStatus]  || '').trim() : '';
      var dataPed = iDataPed >= 0 ? row[iDataPed] : null;
      var dataEnt = iDataEnt >= 0 ? row[iDataEnt] : null;
      var qtd     = iQtd     >= 0 ? row[iQtd]     : null;

      var dataPedIso = null, dataEntIso = null, leadDays = null;
      if (dataPed instanceof Date && !isNaN(dataPed.getTime())) dataPedIso = dataPed.toISOString();
      if (dataEnt instanceof Date && !isNaN(dataEnt.getTime()))  dataEntIso = dataEnt.toISOString();
      if (dataPedIso && dataEntIso) {
        leadDays = Math.round((new Date(dataEntIso) - new Date(dataPedIso)) / 86400000);
        if (leadDays < 0 || leadDays > 730) leadDays = null;
      }

      if (!items[cod]) items[cod] = { desc: '', pedidos: [], fornSeen: {}, leadTimes: [] };
      if (!items[cod].desc && desc) items[cod].desc = desc;

      items[cod].pedidos.push({
        forn: forn, status: status, fonte: cfg.label,
        dataPed: dataPedIso, dataEnt: dataEntIso, leadDays: leadDays,
        qtd: qtd !== null ? Number(qtd) || null : null
      });
      if (forn) items[cod].fornSeen[forn] = (items[cod].fornSeen[forn] || 0) + 1;
      if (leadDays !== null) items[cod].leadTimes.push(leadDays);
      tabRows++;
    }

    diag.itensEncontrados = tabRows;
    totalRows += tabRows;
    diagnostics.push(diag);
  }

  // ── Agregar resultado final ───────────────────────────────────────
  var result = {};
  var keys = Object.keys(items);
  for (var ii = 0; ii < keys.length; ii++) {
    var k    = keys[ii];
    var item = items[k];
    var leads = item.leadTimes;
    var avgLead = leads.length ? Math.round(leads.reduce(function(a,b){return a+b;},0)/leads.length) : null;
    // Ordenar pedidos: mais recente primeiro
    item.pedidos.sort(function(a,b){
      return (b.dataEnt ? new Date(b.dataEnt).getTime() : 0) -
             (a.dataEnt ? new Date(a.dataEnt).getTime() : 0);
    });
    var fornList = Object.keys(item.fornSeen).sort(function(a,b){ return item.fornSeen[b]-item.fornSeen[a]; });
    var ultimo = item.pedidos[0] || {};
    result[k] = {
      desc:         item.desc,
      nPedidos:     item.pedidos.length,
      avgLeadDays:  avgLead,
      minLeadDays:  leads.length ? Math.min.apply(null, leads) : null,
      maxLeadDays:  leads.length ? Math.max.apply(null, leads) : null,
      fornecedores: fornList,
      ultimoForn:   ultimo.forn   || null,
      ultimoStatus: ultimo.status || null,
      ultimaPedido: ultimo.dataPed || null,
      ultimaEntrega:ultimo.dataEnt || null,
      ultimaFonte:  ultimo.fonte   || null
    };
  }

  var out = {
    items:      result,
    totalLinhas: totalRows,
    totalItens:  keys.length,
    diagnostics: diagnostics,
    geradoEm:   new Date().toISOString()
  };

  // Salvar no cache em fatias de 90 KB
  try {
    var fullJson = JSON.stringify(out);
    var chunkSize = 90000;
    var numChunks = Math.ceil(fullJson.length / chunkSize);
    for (var ci = 0; ci < numChunks && ci < 15; ci++) {
      cache.put(CACHE_KEY + '_' + ci, fullJson.slice(ci * chunkSize, (ci + 1) * chunkSize), 2700);
    }
} catch(ec) { Logger.log('Cache compras erro: ' + ec.message); }

  return out;
}

// === DRIVE: REPOSITÓRIO DE BLOQUEIOS ===
function getOrCreateBloqueiosFolder_() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('BLOQUEIOS_FOLDER_ID');
  if (folderId) {
    try { return DriveApp.getFolderById(folderId); } catch (_) {}
  }
  var folder = DriveApp.createFolder('AgriTrack — Relatórios de Bloqueios');
  props.setProperty('BLOQUEIOS_FOLDER_ID', folder.getId());
  return folder;
}

function gerarPdfBloqueio_(dados) {
  var doc = DocumentApp.create('_tmp_blq_' + dados.issueKey + '_' + Date.now());
  try {
    var body = doc.getBody();
    var t = body.appendParagraph('RELATÓRIO DE BLOQUEIO — ' + dados.issueKey);
    t.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    t.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph('Projeto: ' + dados.issueKey + (dados.resumo ? ' — ' + dados.resumo : '')).setBold(true);
    body.appendHorizontalRule();
    var linhas = [
      ['Departamento', dados.depto || '—'],
      ['Tipo de Bloqueio', dados.tipoBloqueio || '—'],
      ['Impacto', dados.impacto || '—'],
      ['Descrição', dados.descricao || '—'],
      ['Responsável p/ resolução', dados.responsavel || '—'],
      ['Prazo para resolução', dados.prazoResolucao || '—'],
      ['Registrado em', dados.dataRegistro || new Date().toLocaleDateString('pt-BR')],
      ['Card BLKQ criado', dados.blkqKey || '—'],
    ];
    linhas.forEach(function(par) {
      var p = body.appendParagraph('');
      p.appendText(par[0] + ': ').setBold(true);
      p.appendText(par[1]).setBold(false);
    });
    doc.saveAndClose();
    var nome = dados.issueKey + '_BLOQUEIO_' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd') + '.pdf';
    var pdf = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
    pdf.setName(nome);
    return { blob: pdf, nome: nome };
  } finally {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (_) {}
  }
}

function gerarPdfResolucao_(dados) {
  var doc = DocumentApp.create('_tmp_res_' + dados.issueKey + '_' + Date.now());
  try {
    var body = doc.getBody();
    var t = body.appendParagraph('RELATÓRIO DE RESOLUÇÃO — ' + dados.issueKey);
    t.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    t.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    body.appendParagraph('Projeto: ' + dados.issueKey).setBold(true);
    body.appendHorizontalRule();
    var linhas = [
      ['Data de resolução', dados.dataResolucao || new Date().toLocaleDateString('pt-BR')],
      ['Responsável', dados.responsavel || '—'],
      ['Descrição da resolução', dados.descricao || '—'],
      ['Label bloqueado removida', dados.labelRemovido ? 'Sim' : 'Não'],
      ['Card BLKQ fechado', dados.blkqKey || '—'],
      ['Gerado em', new Date().toLocaleDateString('pt-BR')],
    ];
    linhas.forEach(function(par) {
      var p = body.appendParagraph('');
      p.appendText(par[0] + ': ').setBold(true);
      p.appendText(par[1]).setBold(false);
    });
    doc.saveAndClose();
    var nome = dados.issueKey + '_RESOLUCAO_' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyyMMdd') + '.pdf';
    var pdf = DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
    pdf.setName(nome);
    return { blob: pdf, nome: nome };
  } finally {
    try { DriveApp.getFileById(doc.getId()).setTrashed(true); } catch (_) {}
  }
}

function salvarRelatorioDrive_(pdfResult) {
  var folder = getOrCreateBloqueiosFolder_();
  var file = folder.createFile(pdfResult.blob);
  return { fileId: file.getId(), url: file.getUrl(), nome: pdfResult.nome };
}

// ─── buscarComprasPorSerial ───────────────────────────────────────────────
function buscarComprasPorSerial() {
  var CACHE_KEY = 'compras_por_serial_v1';
  var cache = CacheService.getScriptCache();
  var cached = cache.get(CACHE_KEY);
  if (cached) { try { return JSON.parse(cached); } catch(e) {} }

  var COMPRAS_ID = '16kKKfYC_TBmuR6wpEyah4BwBsv0TcCD_2ImQE1SN32A';
  var ss;
  try { ss = SpreadsheetApp.openById(COMPRAS_ID); }
  catch(e) { return { erro: 'Nao foi possivel abrir planilha de compras: ' + e.message }; }

  function normCod(raw) {
    if (!raw && raw !== 0) return '';
    return String(raw).trim().replace(/^0+/, '').toUpperCase();
  }

  // Parse PV → array of serials (220XXXXX)
  function parsePvSeriais(pv) {
    if (!pv) return [];
    var s = String(pv).trim();
    if (!s) return [];
    var sl = s.toLowerCase();
    if (sl.indexOf('estoque') !== -1 || sl === 'sc') return [];
    var serials = [];
    // Scan for 8-char tokens starting with 220 followed by 5 digits
    for (var i = 0; i <= s.length - 8; i++) {
      if (s.charAt(i) === '2' && s.charAt(i+1) === '2' && s.charAt(i+2) === '0') {
        var cand = s.substring(i, i+8);
        var ok = true;
        for (var j = 3; j < 8; j++) { var cc = cand.charCodeAt(j); if (cc < 48 || cc > 57) { ok = false; break; } }
        if (ok && serials.indexOf(cand) === -1) serials.push(cand);
      }
    }
    return serials;
  }

  function parseFmt(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return Utilities.formatDate(raw, 'America/Sao_Paulo', 'yyyy-MM-dd');
    var s = String(raw).trim();
    return s || null;
  }

  function findCol(hdrs, keywords) {
    for (var ki = 0; ki < keywords.length; ki++) {
      var kw = keywords[ki].toUpperCase();
      for (var hi = 0; hi < hdrs.length; hi++) {
        if (hdrs[hi].indexOf(kw) !== -1) return hi;
      }
    }
    return -1;
  }

  function readTab(sheetName, fonte) {
    var sh = ss.getSheetByName(sheetName);
    if (!sh) return { rows: [], warn: 'Aba "' + sheetName + '" nao encontrada' };
    var lastRow = sh.getLastRow();
    if (lastRow < 2) return { rows: [], warn: 'Aba "' + sheetName + '" vazia' };
    var data = sh.getRange(1, 1, lastRow, 27).getValues();
    var hdrs = data[0].map(function(h){ return String(h || '').toUpperCase(); });

    var iCodigo = findCol(hdrs, ['COD. AGRICEF','COD AGRICEF','CODIGO AGRICEF','COD AGRI','CODIGO','COD MAT']);
    var iQtd    = findCol(hdrs, ['QTD','QUANT']);
    var iStatus = findCol(hdrs, ['STATUS','SITUA','CONCLU','SITUACAO']);
    var iPedido = findCol(hdrs, ['PEDIDO',' PO ',' PO']);
    var iDataEnt = findCol(hdrs, ['DATA DA ENTREGA','ENTREGA EFET','EFETIV','ENTREGA REAL']);
    var iDataAtu = findCol(hdrs, ['ENTREGA ATUALIZADA','DATA ENTREGA ATU','ENTREGA ATU','ATUALIZ']);

    var rows = [];
    for (var ri = 1; ri < data.length; ri++) {
      var row = data[ri];
      var pv = String(row[0] || '').trim();
      if (!pv) continue;
      var pvL = pv.toLowerCase();
      if (pvL.indexOf('estoque') !== -1 || pvL === 'sc') continue;
      var cod = iCodigo >= 0 ? normCod(row[iCodigo]) : '';
      if (!cod) continue;
      var qtdRaw = parseFloat(String(row[iQtd] || '0').replace(',', '.')) || 0;
      var status = iStatus >= 0 ? String(row[iStatus] || '').trim() : '';
      var pedido = iPedido >= 0 ? String(row[iPedido] || '').trim() : '';
      var dataEnt = iDataEnt >= 0 ? parseFmt(row[iDataEnt]) : null;
      var dataAtu = iDataAtu >= 0 ? parseFmt(row[iDataAtu]) : null;
      rows.push({ pv: pv, cod: cod, qtd: qtdRaw, status: status, pedido: pedido, dataEnt: dataEnt, dataAtu: dataAtu, fonte: fonte });
    }
    return { rows: rows, warn: null };
  }

  var diagnostics = [];
  var allRows = [];
  // Try both accented and plain names
  var tabAttempts = [
    ['Solicitações', 'Solicitacoes'],
    ['FUP online', 'FUP Online', 'FUP'],
    ['Pedidos Concluídos', 'Pedidos Concluidos', 'Concluidos']
  ];
  var fontes = ['solicitado', 'pedido', 'entregue'];
  for (var ti = 0; ti < tabAttempts.length; ti++) {
    var found = false;
    for (var ai = 0; ai < tabAttempts[ti].length; ai++) {
      var res = readTab(tabAttempts[ti][ai], fontes[ti]);
      if (!res.warn) { allRows = allRows.concat(res.rows); found = true; break; }
    }
    if (!found) diagnostics.push('Aba nao encontrada: ' + tabAttempts[ti][0]);
  }

  // Build per-serial index
  var index = {};
  for (var ri = 0; ri < allRows.length; ri++) {
    var row = allRows[ri];
    var seriais = parsePvSeriais(row.pv);
    if (!seriais.length) continue;
    var qtdPerSerial = seriais.length > 1 ? row.qtd / seriais.length : row.qtd;
    for (var si = 0; si < seriais.length; si++) {
      var ser = seriais[si];
      if (!index[ser]) index[ser] = {};
      if (!index[ser][row.cod]) {
        index[ser][row.cod] = { qtdSolicitada: 0, qtdPedida: 0, qtdEntregue: 0, status: '', pedido: '', dataEnt: null, dataAtu: null, fontes: [] };
      }
      var entry = index[ser][row.cod];
      if (row.fonte === 'solicitado') {
        entry.qtdSolicitada += qtdPerSerial;
        if (!entry.status) entry.status = row.status;
      } else if (row.fonte === 'pedido') {
        entry.qtdPedida += qtdPerSerial;
        entry.status = row.status || entry.status;
        if (!entry.pedido) entry.pedido = row.pedido;
        if (!entry.dataAtu) entry.dataAtu = row.dataAtu;
      } else if (row.fonte === 'entregue') {
        entry.qtdEntregue += qtdPerSerial;
        entry.status = row.status || entry.status;
        if (!entry.pedido) entry.pedido = row.pedido;
        if (!entry.dataEnt) entry.dataEnt = row.dataEnt;
        if (!entry.dataAtu) entry.dataAtu = row.dataAtu;
      }
      if (entry.fontes.indexOf(row.fonte) === -1) entry.fontes.push(row.fonte);
    }
  }

  var result = {
    index: index,
    totalSeriais: Object.keys(index).length,
    totalLinhas: allRows.length,
    diagnostics: diagnostics,
    geradoEm: new Date().toISOString()
  };
  try { cache.put(CACHE_KEY, JSON.stringify(result), 3600); } catch(e) {}
  return result;
}