// ================================================================
// AGRICEF — LinksPadrao.gs
// Padrão de ligações entre fases, tarefa-mãe e etapas — o que o Gantt desenha
// como setas vermelhas.
//
// Medido em 11/09/2026 nos 134 projetos com subtarefas:
//   - cada etapa (subtarefa) BLOQUEIA a sua fase-mãe   → 96 de 134 seguiam
//   - o F1 BLOQUEIA o F2 do mesmo projeto               → 21 de 22 pares
//
// Até março/2026 os links eram criados fora do sistema. O painel nunca criou
// nenhum, e de abril em diante 11 dos 13 projetos novos nasceram sem ligação —
// foi isso que o PMO viu no Gantt como "uns certos e outros não".
//
// Este arquivo fecha as duas pontas:
//   - _ligarEtapasAMae_ / _ligarFases_ rodam na criação (FormPCP.js), para
//     que projeto novo já nasça no padrão;
//   - inspecionarLinksPadrao / aplicarLinksPadrao completam os antigos, no
//     mesmo modelo de reorganizarSubtarefas: a prévia devolve a lista exata, e
//     só essa lista é aplicada.
// ================================================================

var LINK_BLOQUEIO_ = 'Blocks';

// Mesmo filtro e mesma leitura de fase do Gantt (_ganttParseName no painel),
// para que o que o ajuste considera "par F1/F2" seja o que a tela agrupa.
var LINK_TESTE_RE_ = /\[teste\]|ptest/i;

function _parseFase_(titulo) {
  var s = String(titulo || '').trim();
  var m = s.match(/^(.*?)\s*[-–]\s*(F(?:ASE\s*)?\d+)\b/i) ||
          s.match(/^(.*?)\s*\((F(?:ASE\s*)?\d+)\)\s*$/i);
  if (m) {
    var ph = parseInt(m[2].replace(/\D/g, ''), 10);
    if (ph > 0 && ph <= 99) return { base: m[1].trim().toLowerCase().replace(/\s+/g, ' '), fase: ph };
  }
  return { base: s.toLowerCase().replace(/\s+/g, ' '), fase: 0 };
}

/**
 * Grava "bloqueadora BLOQUEIA bloqueada".
 *
 * No POST /issueLink o Jira trata inwardIssue como a ORIGEM do link — a issue
 * que exerce a descrição de saída ("blocks"). Os nomes sugerem o contrário.
 * aplicarLinksPadrao confere a direção no primeiro link antes de seguir.
 */
function _criarLinkBloqueio_(bloqueadora, bloqueada) {
  jiraRequest_('POST', '/rest/api/3/issueLink', {
    type:         { name: LINK_BLOQUEIO_ },
    inwardIssue:  { key: bloqueadora },
    outwardIssue: { key: bloqueada },
  });
}

/** Links Blocks de uma issue como [{id, de, para}] — "de" BLOQUEIA "para". */
function _linksBloqueio_(key) {
  var r = jiraRequest_('GET', '/rest/api/3/issue/' + key + '?fields=issuelinks');
  var out = [];
  ((r.fields && r.fields.issuelinks) || []).forEach(function (l) {
    if (!l.type || l.type.name !== LINK_BLOQUEIO_) return;
    if (l.outwardIssue) out.push({ id: l.id, de: key, para: l.outwardIssue.key });
    if (l.inwardIssue)  out.push({ id: l.id, de: l.inwardIssue.key, para: key });
  });
  return out;
}

// ─── NA CRIAÇÃO ─────────────────────────────────────────────────

/**
 * Liga cada etapa recém-criada à mãe. Falha vira aviso, nunca erro: o projeto
 * já existe no Jira, e devolver erro levaria o gestor a repetir o formulário e
 * duplicar o projeto inteiro. O que escapar aqui, aplicarLinksPadrao completa.
 */
function _ligarEtapasAMae_(paiKey, etapas, avisos) {
  var falhas = [];
  (etapas || []).forEach(function (k) {
    try { _criarLinkBloqueio_(k, paiKey); }
    catch (e) { falhas.push(k + ' (' + e.message + ')'); }
  });
  if (falhas.length) {
    avisos.push(falhas.length + ' etapa(s) de ' + paiKey + ' ficaram sem a ligação com a tarefa-mãe: ' + falhas.join('; '));
  }
}

function _ligarFases_(f1Key, f2Key, avisos) {
  try { _criarLinkBloqueio_(f1Key, f2Key); }
  catch (e) { avisos.push('O F1 (' + f1Key + ') ficou sem a ligação com o F2 (' + f2Key + '): ' + e.message); }
}

/**
 * Acha o F1 já existente de um F2 criado sozinho — foi assim que o S22000077
 * ficou sem ligação: o F1 é de 2025 e o F2 foi criado à parte em 2026. Usa a
 * mesma leitura de fase do Gantt. Só devolve quando há exatamente um candidato.
 */
function _acharF1Existente_(summaryF2) {
  var alvo = _parseFase_(summaryF2);
  if (alvo.fase !== 2) return null;
  var r = buscarTarefasJira({});
  var cands = ((r && r.issues) || []).filter(function (i) {
    if (i['Tipo de item'] !== 'Tarefa') return false;
    var p = _parseFase_(i['Resumo']);
    return p.fase === 1 && p.base === alvo.base;
  });
  return cands.length === 1 ? cands[0]['Chave da item'] : null;
}

// ─── COMPLETAR OS ANTIGOS ───────────────────────────────────────

/**
 * Calcula, a partir da lista de issues (com _links), o que falta para o padrão.
 * Função pura sobre os dados: a prévia e a aplicação usam a mesma regra.
 */
function _calcularLinksPadrao_(issues) {
  var by = {};
  issues.forEach(function (i) { by[i['Chave da item']] = i; });

  var B = {};
  issues.forEach(function (i) {
    var ls = [];
    try { ls = JSON.parse(i._links || '[]'); } catch (e) {}
    ls.forEach(function (l) {
      if (l && l.rel === LINK_BLOQUEIO_ && l.from && l.to) B[l.from + '>' + l.to] = true;
    });
  });

  var criar = [], remover = [], avisos = [];

  // 1. Cada etapa bloqueia a própria mãe.
  var subsDe = {};
  issues.forEach(function (i) {
    if (i['Tipo de item'] === 'Subtarefa' && i['Chave pai']) {
      (subsDe[i['Chave pai']] = subsDe[i['Chave pai']] || []).push(i['Chave da item']);
    }
  });
  Object.keys(subsDe).sort().forEach(function (pai) {
    var p = by[pai];
    if (!p || LINK_TESTE_RE_.test(p['Resumo'] || '')) return;
    subsDe[pai].forEach(function (s) {
      var base = { projeto: pai, resumoProjeto: String(p['Resumo'] || '').slice(0, 70),
                   etapa: String((by[s] || {})['Resumo'] || '') };
      // Mãe bloqueando a etapa é o padrão ao contrário — e, somado ao link
      // certo, formaria um ciclo. Sai antes de o certo entrar.
      if (B[pai + '>' + s]) remover.push(Object.assign({ acao: 'remover', de: pai, para: s, motivo: 'invertido' }, base));
      if (!B[s + '>' + pai]) criar.push(Object.assign({ acao: 'criar', de: s, para: pai, motivo: 'etapa → mãe' }, base));
    });
  });

  // 2. F1 bloqueia F2 (e Fn bloqueia Fn+1) quando os dois têm o mesmo nome-base.
  var grupos = {};
  issues.forEach(function (i) {
    if (i['Tipo de item'] !== 'Tarefa' || LINK_TESTE_RE_.test(i['Resumo'] || '')) return;
    var f = _parseFase_(i['Resumo']);
    if (!f.fase) return;
    var g = grupos[f.base] = grupos[f.base] || {};
    (g[f.fase] = g[f.fase] || []).push(i['Chave da item']);
  });
  Object.keys(grupos).forEach(function (base) {
    var g = grupos[base];
    Object.keys(g).forEach(function (n) {
      var prox = g[Number(n) + 1];
      if (!prox) return;
      // Fase repetida (ex.: dois F2 para o mesmo serial) é decisão do PMO, não
      // do ajuste: ligar qualquer um dos dois seria um palpite.
      if (g[n].length !== 1 || prox.length !== 1) {
        avisos.push('Fase repetida em "' + base.slice(0, 60) + '": F' + n + '=' + g[n].join(',') +
                    ' / F' + (Number(n) + 1) + '=' + prox.join(',') + ' — não liguei.');
        return;
      }
      var a = g[n][0], b = prox[0];
      if (!B[a + '>' + b]) {
        criar.push({ acao: 'criar', de: a, para: b, motivo: 'F' + n + ' → F' + (Number(n) + 1),
                     projeto: a, resumoProjeto: String(by[a]['Resumo'] || '').slice(0, 70), etapa: '' });
      }
    });
  });

  return { criar: criar, remover: remover, avisos: avisos };
}

/**
 * PRÉVIA — só leitura. Devolve a lista exata do que aplicarLinksPadrao faria.
 * dados.ignorar: chaves de projeto a deixar de fora (ex.: um duplicado que o
 * PMO ainda vai decidir se apaga).
 */
function inspecionarLinksPadrao(dados) {
  try {
    var ignorar = {};
    ((dados && dados.ignorar) || []).forEach(function (k) { ignorar[String(k).toUpperCase()] = true; });
    var r = _buscarTarefasJiraDoJira_();
    if (!r || !r.success) throw new Error((r && r.erro) || 'falha ao ler o Jira');
    var c = _calcularLinksPadrao_(r.issues);
    var fora = function (it) { return !ignorar[it.projeto] && !ignorar[it.de] && !ignorar[it.para]; };
    var itens = c.remover.filter(fora).concat(c.criar.filter(fora));
    var porProjeto = {};
    itens.forEach(function (it) { porProjeto[it.projeto] = (porProjeto[it.projeto] || 0) + 1; });
    return {
      success: true,
      totalCriar: c.criar.filter(fora).length,
      totalRemover: c.remover.filter(fora).length,
      projetos: Object.keys(porProjeto).length,
      itens: itens,
      avisos: c.avisos,
      ignorados: Object.keys(ignorar),
    };
  } catch (e) {
    return { success: false, erro: e.message };
  }
}

/**
 * APLICA exatamente os itens recebidos (vindos da prévia). Recalcula o estado
 * atual antes e só grava o que ainda falta — rodar duas vezes não duplica
 * link, e um item que alguém corrigiu à mão no meio-tempo é pulado.
 *
 * Confere a direção no PRIMEIRO link criado: se o Jira gravar ao contrário,
 * desfaz esse link e para, sem gravar mais nada.
 *
 * Tem orçamento de tempo; o que não couber volta em "pendentes" e basta rodar
 * de novo com a prévia seguinte.
 */
function aplicarLinksPadrao(dados) {
  var itens = (dados && dados.itens) || [];
  if (!itens.length) return { success: false, erro: 'Nenhum item enviado — rode inspecionarLinksPadrao e envie a lista.' };

  var t0 = Date.now();
  var ORCAMENTO_MS = 4 * 60 * 1000;
  var out = { success: true, criados: [], removidos: [], pulados: [], erros: [], pendentes: [] };

  try {
    var r = _buscarTarefasJiraDoJira_();
    if (!r || !r.success) throw new Error((r && r.erro) || 'falha ao ler o Jira');
    var atual = _calcularLinksPadrao_(r.issues);
    var aindaFalta = {};
    atual.criar.forEach(function (it) { aindaFalta['criar:' + it.de + '>' + it.para] = true; });
    atual.remover.forEach(function (it) { aindaFalta['remover:' + it.de + '>' + it.para] = true; });

    // Ordem: criações primeiro — a primeira delas confere a direção —, e as
    // remoções dos invertidos por último. Assim, se a conferência abortar,
    // nenhum link antigo foi apagado; e uma etapa invertida nunca fica, nem por
    // um instante, sem ligação nenhuma (no máximo com as duas, até a remoção).
    var remocoes = itens.filter(function (i) { return i.acao === 'remover'; });
    var corrigeInvertido = {};
    remocoes.forEach(function (i) { corrigeInvertido[i.para + '>' + i.de] = true; });
    var criacoes = itens.filter(function (i) { return i.acao === 'criar'; });
    var ordem = criacoes.filter(function (i) { return !corrigeInvertido[i.de + '>' + i.para]; })
      .concat(criacoes.filter(function (i) { return corrigeInvertido[i.de + '>' + i.para]; }))
      .concat(remocoes);

    var direcaoConferida = false;
    for (var n = 0; n < ordem.length; n++) {
      var it = ordem[n];
      var id = it.acao + ':' + it.de + '>' + it.para;
      if (Date.now() - t0 > ORCAMENTO_MS) { out.pendentes.push(it); continue; }
      if (!aindaFalta[id]) { out.pulados.push({ item: id, motivo: 'já está no padrão ou não se aplica mais' }); continue; }

      try {
        if (it.acao === 'remover') {
          var alvo = _linksBloqueio_(it.de).filter(function (l) { return l.de === it.de && l.para === it.para; })[0];
          if (!alvo) { out.pulados.push({ item: id, motivo: 'link já não existe' }); continue; }
          jiraRequest_('DELETE', '/rest/api/3/issueLink/' + alvo.id);
          out.removidos.push(id);
          continue;
        }

        if (direcaoConferida) {
          _criarLinkBloqueio_(it.de, it.para);
        } else {
          // Identifica o link novo pelo id (os que existiam antes ficam de
          // fora), para nunca confundir com um invertido que já estava lá.
          var antes = {};
          _linksBloqueio_(it.de).forEach(function (l) { antes[l.id] = true; });
          _criarLinkBloqueio_(it.de, it.para);
          var novo = _linksBloqueio_(it.de).filter(function (l) { return !antes[l.id]; })[0];
          var fatal = null;
          if (!novo) {
            fatal = 'Não consegui confirmar o link recém-criado ' + it.de + ' → ' + it.para + '. Nada mais foi gravado.';
          } else if (novo.de !== it.de || novo.para !== it.para) {
            jiraRequest_('DELETE', '/rest/api/3/issueLink/' + novo.id);
            fatal = 'O Jira gravou o link na direção contrária em ' + it.de + ' → ' + it.para +
                    ' — desfeito. Nada mais foi gravado.';
          }
          if (fatal) { var ef = new Error(fatal); ef.fatal = true; throw ef; }
          direcaoConferida = true;
        }
        out.criados.push(id);
      } catch (eIt) {
        if (eIt.fatal) throw eIt;
        out.erros.push({ item: id, erro: eIt.message });
      }
    }
  } catch (e) {
    out.success = false;
    out.erro = e.message;
  }
  out.segundos = Math.round((Date.now() - t0) / 1000);
  return out;
}
