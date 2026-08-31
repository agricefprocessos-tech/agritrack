// ================================================================
// AGRICEF — AlinharSubtarefas.gs
// Detecta e corrige projetos cujas subtarefas ficaram fora do período
// do pai — o efeito de mover a data do projeto sem mover as etapas.
//
// Origem: 2026-08-28, AGTK-1312. O gestor puxou o início do projeto de
// 08/09 para 10/08 pelo painel; as 4 subtarefas continuaram onde estavam,
// e TRÊS delas passaram a terminar antes do projeto começar. Como
// atualizarDatas nunca propagou nada para filhos, todo projeto que teve
// data mexida desde sempre pode estar assim.
//
// Critério de desalinhamento: os dois caminhos de criação (PPP genérico em
// criarProjetoSimples_ e Hauler em calcularDatasF1_) põem a PRIMEIRA
// subtarefa começando exatamente no início do pai. Então
// "menor início das subtarefas != início do pai" é desvio, não variação
// legítima de planejamento.
//
// Correção: mesma regra escolhida para a propagação — deslocar o bloco
// inteiro, preservando duração e espaçamento. O delta aqui é
// (início do pai - menor início das subtarefas), já que o movimento
// original que causou o desalinhamento não é recuperável.
//
// SEMPRE rode inspecionarAlinhamento() antes. alinharSubtarefas() escreve
// no Jira de verdade.
// ================================================================

function _alinhamentoColetar_() {
  var r = _buscarTarefasJiraDoJira_();
  if (!r.success) throw new Error(r.erro);

  var porPai = {};
  var pais = {};
  r.issues.forEach(function (i) {
    if (i['Tipo de item'] === 'Subtarefa') {
      var pk = i['Chave pai'];
      if (!pk) return;
      (porPai[pk] = porPai[pk] || []).push(i);
    } else {
      pais[i['Chave da item']] = i;
    }
  });

  var casos = [];
  Object.keys(porPai).forEach(function (pk) {
    var pai = pais[pk];
    if (!pai) return;
    var iniPai = pai['Campo personalizado (Start date)'];
    if (!iniPai) return; // sem início no pai não há referência para alinhar

    var subs = porPai[pk].filter(function (s) { return s['Campo personalizado (Start date)']; });
    if (!subs.length) return;

    var menorIni = subs.map(function (s) { return s['Campo personalizado (Start date)']; }).sort()[0];
    if (menorIni === iniPai) return; // alinhado

    var delta = Math.round(
      (new Date(iniPai + 'T12:00:00') - new Date(menorIni + 'T12:00:00')) / 86400000
    );
    if (!delta || isNaN(delta)) return;

    // Quantas subtarefas terminam antes do pai começar — é o sintoma que
    // torna o Gantt sem sentido, e o que dá urgência ao caso.
    var terminamAntes = porPai[pk].filter(function (s) {
      return s['Data limite'] && s['Data limite'] < iniPai;
    }).length;

    casos.push({
      pai: pk,
      resumo: String(pai['Resumo'] || '').slice(0, 50),
      status: pai['Status'],
      inicioPai: iniPai,
      limitePai: pai['Data limite'] || null,
      menorInicioSub: menorIni,
      deltaDias: delta,
      nSubs: porPai[pk].length,
      subsTerminamAntesDoPaiComecar: terminamAntes,
      subs: porPai[pk].map(function (s) {
        return {
          key: s['Chave da item'],
          resumo: String(s['Resumo'] || '').slice(0, 32),
          de: (s['Campo personalizado (Start date)'] || '—') + ' → ' + (s['Data limite'] || '—'),
          para: (s['Campo personalizado (Start date)'] ? addDias_(s['Campo personalizado (Start date)'], delta) : '—')
              + ' → ' + (s['Data limite'] ? addDias_(s['Data limite'], delta) : '—'),
        };
      }),
    });
  });

  casos.sort(function (a, b) { return b.subsTerminamAntesDoPaiComecar - a.subsTerminamAntesDoPaiComecar; });
  return casos;
}

/** Dry-run: mostra o que seria deslocado, sem escrever nada no Jira. */
function inspecionarAlinhamento() {
  try {
    var casos = _alinhamentoColetar_();
    return {
      success: true,
      totalProjetosDesalinhados: casos.length,
      totalSubtarefasAfetadas: casos.reduce(function (a, c) { return a + c.nSubs; }, 0),
      projetosComSubTerminandoAntesDoInicio: casos.filter(function (c) { return c.subsTerminamAntesDoPaiComecar > 0; }).length,
      casos: casos,
    };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}

/**
 * Aplica o deslocamento de verdade. `dados.apenas` (array de chaves de pai)
 * limita a correção a projetos específicos — sem ele, corrige todos.
 */
function alinharSubtarefas(dados) {
  dados = dados || {};
  try {
    var casos = _alinhamentoColetar_();
    if (dados.apenas && dados.apenas.length) {
      casos = casos.filter(function (c) { return dados.apenas.indexOf(c.pai) !== -1; });
    }

    var corrigidos = [], falhas = [];
    casos.forEach(function (c) {
      try {
        var r = _deslocarSubtarefas_(c.pai, c.menorInicioSub, c.inicioPai);
        corrigidos.push({ pai: c.pai, delta: r.delta, movidas: r.movidas.length, falhas: r.falhas });
      } catch (e) {
        falhas.push(c.pai + ': ' + e.message);
      }
    });

    return { success: true, projetosCorrigidos: corrigidos.length, corrigidos: corrigidos, falhas: falhas };
  } catch (err) {
    return { success: false, erro: err.message };
  }
}
