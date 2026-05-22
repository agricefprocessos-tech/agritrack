# AgriTrack — Central de Projetos Agricef

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-live-22d37a?style=flat-square&logo=github)](https://agricefprocessos-tech.github.io/agritrack/agritrack_dashboard.html)
[![Jira](https://img.shields.io/badge/Jira-Cloud-0052CC?style=flat-square&logo=jira)](https://agricefprojetos.atlassian.net)
[![Apps Script](https://img.shields.io/badge/Backend-Apps%20Script-4285F4?style=flat-square&logo=google)](https://script.google.com)

Dashboard web multi-página para gestão de projetos da Agricef — auto-fetch do Jira, formulário de criação, registro de bloqueios e relatório semanal via IA.

---

## 🌐 Acesso rápido

| Recurso | URL |
|---|---|
| **Dashboard ao vivo** | https://agricefprocessos-tech.github.io/agritrack/agritrack_dashboard.html |
| **Repositório** | https://github.com/agricefprocessos-tech/agritrack |
| **API (Apps Script)** | https://script.google.com/macros/s/AKfycbxeB715o.../exec |
| **Jira** | https://agricefprojetos.atlassian.net/jira/core/projects/AGTK |

---

## 📐 Arquitetura

```
┌─────────────────────────────────────┐
│   agritrack_dashboard.html          │  ← Frontend estático (GitHub Pages)
│   HTML + CSS + JS puro              │
│   Chart.js • PapaParse             │
└──────────────────┬──────────────────┘
                   │ fetch (GET ?payload=JSON)
                   ▼
┌─────────────────────────────────────┐
│   Google Apps Script (FormPCP.gs)   │  ← Backend / Proxy Jira
│   Credenciais: Script Properties    │
│   Deployment: Web App público       │
└──────────────────┬──────────────────┘
                   │ REST API v3
                   ▼
┌─────────────────────────────────────┐
│   Jira Cloud — Projeto AGTK         │
│   agricefprojetos.atlassian.net     │
└─────────────────────────────────────┘
                   +
┌─────────────────────────────────────┐
│   Gemini Flash API (browser)        │  ← IA para Relatório Semanal
│   generativelanguage.googleapis.com │
│   Chave salva em localStorage       │
└─────────────────────────────────────┘
```

---

## 📑 Páginas

### 1. 📊 Dashboard
- **Auto-fetch** direto do Jira ao abrir (sem importação manual de CSV)
- Mesma lógica do Power Query: `max(DL subtarefas) ≤ DL tarefa`
- KPIs: concluídos, em andamento, no prazo, fora do prazo, WIP, throughput, duração média
- Gráficos: pizza (prazo), barras por depto/status, panorama temporal, throughput, CFD
- Tabela filtrada por tipo, departamento e ano
- CSV como fallback caso API indisponível

### 2. ➕ Novo Projeto
Formulário integrado para todos os departamentos:

| Departamento | Tipos |
|---|---|
| **PCP** | PPP (Plano Mestre), Hauler (PPH1 + PPH2 — 8"/10") |
| **Engenharia** | MDC, PM, PE, PS, MPC, PO&I |
| **Ensaios** | AMEP, AMEP-NP, DRE, EXP, Safra, Safrinha |
| **SU.C** | PME |
| **Comercial** | COMERCIAL |
| **Marketing** | EMK-Endo, EMK-Externo, EMK-Doc |

- Cria tarefa pai + subtarefas com datas distribuídas automaticamente
- Score de prioridade: `F×0.40 + I×0.30 + U×0.15 + C×0.15` → P1/P2/P3/P4
- Preview de subtarefas antes de criar
- Hauler: F1, F2, F1+F2, alongamento, extensão

### 3. 🚧 Bloqueios
- Lista automática de tarefas com label `bloqueado` no Jira
- Campos: tipo, impacto (Alto/Médio/Baixo), descrição, responsável, prazo de resolução
- Adiciona label + comentário estruturado `[BLOQUEIO]` no Jira
- Atualiza datas (Limite, Alvo, Início) diretamente via API
- "Só Atualizar Datas" sem registrar bloqueio

### 4. 📋 Relatório Semanal (IA)
- Análise automática com **Gemini 1.5 Flash** (gratuito)
- Busca dados atuais do Jira e monta resumo estruturado
- Gera: resumo executivo, status por depto, pontos críticos, ações recomendadas, previsão
- Chave API salva em `localStorage` (não sai do browser)
- Obter chave gratuita: https://aistudio.google.com/apikey

### 5. ⚙️ Config
- URL da API configurável e testável
- Chave Gemini gerenciada aqui
- Última atualização de dados, forçar refresh

---

## 🚀 Setup

### Pré-requisitos
- Conta Jira Cloud: `agricefprojetos.atlassian.net`
- Google Apps Script implantado como Web App
- (Opcional) Chave Gemini Flash para relatório semanal

### Apps Script — Actions disponíveis

| Action | Descrição |
|---|---|
| `buscarTarefasJira` | Todas as tarefas/subtarefas do projeto AGTK |
| `criarProjetoJira` | Cria tarefa + subtarefas com datas automáticas |
| `registrarBloqueio` | Label + comentário + atualização de datas |
| `buscarBloqueados` | Issues com label `bloqueado` |
| `buscarIssue` | Detalhes de um issue por chave |
| `atualizarDatas` | Start date, duedate, alvo, baseline |
| `buscarProximoSerial` | Próximo serial S22000XXX para Hauler |

### Credenciais (Script Properties)
```
JIRA_EMAIL = usuario@agricef.com.br
JIRA_TOKEN = ATATT3x...
```

> ⚠️ **Nunca commit de credenciais.** Armazenadas apenas nas Script Properties.

### Deploy local
```bash
# Clone
git clone https://github.com/agricefprocessos-tech/agritrack.git

# Abrir dashboard
start agritrack_dashboard.html
```

### Deploy Apps Script (clasp)
```bash
cd agricef-formulario-pcp
npx @google/clasp push --force
npx @google/clasp deploy --deploymentId <ID> --description "vX"
```

---

## 📁 Estrutura

```
agricef-agritrack/
├── agritrack_dashboard.html    # Dashboard multi-página (frontend completo)
├── index.html                  # Redirect para o dashboard (GitHub Pages)
├── .gitignore
└── .github/
    └── workflows/
        └── deploy.yml          # CI/CD GitHub Pages (auto-deploy no push)

agricef-formulario-pcp/         # Repositório separado — Apps Script
├── Code.gs                     # Router (doGet)
├── FormPCP.gs                  # Lógica Jira + todas as actions
├── FormularioPCP.html          # Form standalone (legado)
└── appsscript.json
```

---

## 🔁 Fluxo de Dados

```
Abertura do Dashboard
  └→ autoFetch() → Apps Script buscarTarefasJira
       └→ Jira API GET /search/jql (paginado, max 500)
            └→ processData() → charts + KPIs + tabela

Novo Projeto
  └→ submitForm() → Apps Script criarProjetoJira
       └→ Jira POST /issue (tarefa pai)
            └→ loop criarSubtarefa_ (datas automáticas)

Bloqueio
  └→ lookupIssue() → buscarIssue → preview
  └→ submitBloqueio() → registrarBloqueio
       ├→ PUT /issue (label bloqueado)
       ├→ POST /comment ([BLOQUEIO] ...)
       └→ PUT /issue (datas se fornecidas)

Relatório Semanal
  └→ gerarRelatorio() → monta resumo local
       └→ Gemini Flash API (direto do browser)
            └→ markdown → renderizado no card
```

---

## ⚠️ Configurações Jira

- Desativar regras de automação **07, 08, 09** (PPP, PPH1, PPH2) antes de usar o formulário
- Manter ativa a regra **"casca"** (Nível de Prioridade — cálculo automático)
- Campos custom usados: `customfield_10015` (start), `customfield_10073` (depto), `customfield_10205` (categoria), `customfield_10469` (baseline), `customfield_10470` (alvo)

---

## 🤝 Contribuição

1. Fork → branch (`git checkout -b feat/minha-feature`)
2. Commit (`git commit -m 'feat: ...'`)
3. Push (`git push origin feat/minha-feature`)
4. Pull Request

---

*Desenvolvido para Agricef — 2025/2026*
