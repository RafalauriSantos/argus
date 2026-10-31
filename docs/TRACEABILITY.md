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

---

## Núcleo 5: Telegram Rico & Webhook Inbox Manual

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-5.1** | Card Rico HTML com Evidências de Stack | O card do Telegram formata em HTML limpo: título em negrito, empresa, modalidade, tempo de publicação, stack aderente e lacunas a desenvolver. | `tests/notifications/telegram-rich.test.ts` | 🟢 GREEN |
| **CR-5.2** | Webhook de Ingestão Manual com Autenticação | Endpoint `/telegram/webhook` recebe URLs enviadas via chat do Telegram, valida secret token e extrai link de vaga válido. | `tests/notifications/telegram-rich.test.ts` | 🟢 GREEN |
| **CR-5.3** | Deduplicação e Análise Imediata no Webhook | Ao receber link manual via webhook, processa via `IngestPipeline`, grava no Neon e responde imediatamente no chat. | `tests/notifications/telegram-rich.test.ts` | 🟢 GREEN |

---

## Núcleo 7: Maximização & Inteligência de Operação (Evidência, Fontes & Relatórios Diários)

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-7.1** | Densidade de Evidência da Vaga | Classifica o nível de detalhe do anúncio (`LOW_EVIDENCE`, `MEDIUM_EVIDENCE`, `HIGH_EVIDENCE`) para não gastar tokens em vagas rasas/fantasmas. | `tests/decision/evidence.test.ts` | 🟢 GREEN |
| **CR-7.2** | Expansão de Fontes GitHub | Adiciona repositórios orgânicos de vagas à lista de adaptadores do portfólio (`backend-br`, `soujava`, `react-brasil`, `nodejsdevbr`). | `tests/portfolio/sources.test.ts` | 🟢 GREEN |
| **CR-7.3** | Relatório Diário de Funil no Telegram | Agrega do Neon o total de vagas vistas, aprovadas e o ranking dos principais motivos de descarte em formato de resumo diário. | `tests/notifications/daily-report.test.ts` | 🟢 GREEN |

---

## Núcleo 8: Comandos Interativos do Telegram Bot

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-8.1** | Normalização & Parser de Comandos | Reconhece comandos com/sem barra, minúsculas/maiúsculas, remove `@botname` e ignora mensagens que contenham URLs. | `tests/notifications/telegram-commands.test.ts` | 🟢 GREEN |
| **CR-8.2** | Resumo Operacional (`/status`) | Consulta conectividade com o banco Neon Postgres, total de vagas em radar e hora da última coleta. | `tests/notifications/telegram-commands.test.ts` | 🟢 GREEN |
| **CR-8.3** | Histórico Recente (`/ultimas`) | Traz as últimas 5 decisões de descarte/aprovação com timestamp formatado no horário de Brasília e motivo explícito. | `tests/notifications/telegram-commands.test.ts` | 🟢 GREEN |
| **CR-8.4** | Diagnóstico de Gargalos (`/problemas` & `/fontes`) | Agrupa os maiores motivos de descarte e volume de vagas por fonte nas últimas 24 horas. | `tests/notifications/telegram-commands.test.ts` | 🟢 GREEN |
| **CR-8.5** | Integração no Webhook | Rota `/telegram/webhook` detecta se a mensagem é comando ou URL, despacha e responde diretamente no chat. | `tests/notifications/telegram-rich.test.ts` | 🟢 GREEN |

---

## Núcleo 9: Normalizador Canônico de URLs & Adaptador GeekHunter

| ID | Requisito de Negócio / Engenharia | Comportamento Esperado | Teste Automatizado | Status |
|---|---|---|---|---|
| **CR-9.1** | Decodificação Gupy Base64 | Links `/job/<base64>` contendo payload JSON com `jobId` numérico são canonicizados para `/jobs/<id>` evitando duplicidade. | `tests/adapters/url-resolver.test.ts` | 🟢 GREEN |
| **CR-9.2** | Limpeza de Parâmetros de Tracking | Remove UTMs e tracking keys (`trk`, `trackingId`, `refId`) preservando a unicidade da URL canônica. | `tests/adapters/url-resolver.test.ts` | 🟢 GREEN |
| **CR-9.3** | Resolução Segura de Encurtador LinkedIn | Resolve links curtos `lnkd.in` seguindo redirecionamento HTTP com proteção SSRF (apenas destinos de ATS confiáveis). | `tests/adapters/url-resolver.test.ts` | 🟢 GREEN |
| **CR-9.4** | Coletor GeekHunter | Consulta a listagem pública de vagas tech do GeekHunter, extrai oportunidades e mapeia para o contrato `AdapterResult`. | `tests/adapters/geekhunter.test.ts` | 🟢 GREEN |


