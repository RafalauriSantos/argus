# Matriz de Rastreabilidade — Núcleo do Domínio & Migração

Mapeamento formal dos critérios de negócio e requisitos técnicos para seus respectivos testes automatizados.
Padrão derivado do `casa-de-leiloes` e `ub-mode`.

## Legenda de Status:
- 🔴 **RED:** Teste escrito e falha esperada comprovada.
- 🟢 **GREEN:** Código implementado e teste passando.
- 🟡 **REFACTOR:** Código refatorado sob princípios de simplicidade e baixo CRAP score.

---

## Núcleo 1: Domínio Puro & Triagem de Escopo

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-1.1** | Entidade Canônica de Vaga | Uma vaga não pode existir sem URL canônica, título e fingerprint invariante. | `tests/domain/vacancy.test.ts` | 🟢 GREEN |
| **CR-1.2** | Deduplicação Multi-Fonte | Se a mesma vaga vier da Gupy e do LinkedIn com mesmo fingerprint, são unificadas. | `tests/domain/vacancy.test.ts` | 🟢 GREEN |
| **CR-1.3** | Escopo: Pleno Acessível | Vagas Pleno com tarefas de mentoria/suporte são classificadas como `junior_to_mid` e aprovadas. | `tests/decision/scope-analyzer.test.ts` | 🟢 GREEN |
| **CR-1.4** | Escopo: Barreira PCD | Vagas afirmativas ou exclusivas para PCD são rejeitadas determinísticamente. | `tests/decision/scope-analyzer.test.ts` | 🟢 GREEN |
| **CR-1.5** | Escopo: Barreira Graduação | Vagas com superior completo como requisito eliminatório são rejeitadas. | `tests/decision/scope-analyzer.test.ts` | 🟢 GREEN |
| **CR-1.6** | Escopo: Localização | Vagas presenciais fora da região Tatuí/Sorocaba são rejeitadas; remoto é 100% livre. | `tests/decision/scope-analyzer.test.ts` | 🟢 GREEN |

---

## Núcleo 3: Pipeline de Ingestão Integrada (Adapters -> Scope Analyzer -> Neon)

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-3.1** | Triagem na Ingestão do Adaptador | Quando o adapter descobre uma vaga, ela é avaliada pelo `evaluateVacancyScope`. Se elegível, salva em `haadar.vacancies`. | `tests/integration/ingest-pipeline.test.ts` | 🟢 GREEN |
| **CR-3.2** | Auditoria de Descarte sem Duplicação | Se a vaga for rejeitada pelo Scope Analyzer (ex: Sênior ou PCD), grava em `haadar.candidate_rejections` com incremento. | `tests/integration/ingest-pipeline.test.ts` | 🟢 GREEN |
| **CR-3.3** | Enfileiramento de Alertas Elegíveis | Vagas aprovadas com score >= 60 geram registro pendente na fila `haadar.notification_outbox`. | `tests/integration/ingest-pipeline.test.ts` | 🟢 GREEN |

---

## Núcleo 4: Juiz Semântico de IA (Cloudflare Worker -> Gemini / OpenRouter)

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-4.1** | Prompt Semântico & Formato Estrito | O prompt do juiz consome o perfil e a vaga, retornando JSON estrito com contrato compatível (`is_real_job_opportunity`, `cv_compatibility_score`, `category`, etc.). | `tests/ai/llm-judge.test.ts` | 🟢 GREEN |
| **CR-4.2** | Fallback Heurístico Resiliente | Quando chaves de API não estiverem configuradas ou o provedor falhar/estiver esgotado, faz fallback gracioso para o score do ScopeAnalyzer sem derrubar o pipeline. | `tests/ai/llm-judge.test.ts` | 🟢 GREEN |
| **CR-4.3** | Multi-Provider Chain (Gemini -> OpenRouter) | Se Gemini falhar com 429/500, a cadeia tenta o OpenRouter antes de desistir. | `tests/ai/llm-judge.test.ts` | 🟢 GREEN |
