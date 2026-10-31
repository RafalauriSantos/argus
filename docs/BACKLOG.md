# Backlog de Migração — Haadar + WorkHunter

Itens de trabalho planejados para a migração completa do WorkHunter local para o Haadar na nuvem com Neon PostgreSQL.
Metodologia derivada do `casa-de-leiloes`.

## Níveis de Risco:
- **Alto:** Estrutura de banco, idempotência de deduplicação, entrega de alertas e regras eliminatórias.
- **Normal:** Limpeza de código, relatórios e ajustes de formato.

---

## Fatias Verticais (Slices)

| Slice | Descrição | Risco | Status | Critérios de Aceitação |
|---|---|---|---|---|
| **0** | **Governança & Walking Skeleton com Neon Postgres** | Normal | 🟢 Concluído | Conexão com Neon configurada via `@neondatabase/serverless`, rota `/health/db` respondendo status do Postgres e teste automatizado verde. |
| **1** | **Esquema de Dados, Deduplicação & TTL** | Alto | 🟢 Concluído | Tabelas `vacancies`, `vacancy_occurrences`, `candidate_rejections` no Postgres com chaves únicas estritas e rotina de expiração. Nenhuma vaga repetida grava nova linha. |
| **2** | **Transplante do Cérebro (Perfil & Escopo)** | Alto | 🟢 Concluído | `profile.json` portado para TS com regras de senioridade, localização e restrições. Vaga Pleno com escopo de entrada aprovada. |
| **3** | **Pipeline de Ingestão: Adapters -> Scope Analyzer -> Neon** | Alto | 🟢 Concluído | Adapters (Gupy, Greenhouse, etc.) passam pelo ScopeAnalyzer e gravam no Neon sem duplicação e com auditoria de rejeição. |
| **4** | **Juiz de IA (LLM Judge Semântico)** | Alto | 🟢 Concluído | Chamada controlada de IA pós-filtro determinístico avaliando compatibilidade de stack e lacunas a treinar. |
| **5** | **Telegram Rico & Webhook Inbox** | Alto | 🟢 Concluído | Layout rico do WorkHunter portado para o Telegram + rota de webhook para envio de links manuais pelo celular. |
| **6** | **Virada de Chave & Aposentadoria Local** | Normal | 🟢 Concluído | Serviços locais systemd desativados (`workhunter.service`, `workhunter-monitor.service`). Operação 100% transferida para a nuvem. |
| **7** | **Maximização de Inteligência & Relatório Diário** | Normal | 🟢 Concluído | Análise de densidade de evidência (`LOW`, `MEDIUM`, `HIGH`), novas fontes GitHub e relatório diário consolidado das 24h disparado via cron das 20h BRT. |
| **8** | **Comandos Interativos no Telegram** | Normal | 🟢 Concluído | Processamento no webhook de `/start`, `/ajuda`, `/relatorio`, `/status`, `/ultimas`, `/fontes`, `/problemas` direto pelo bot. |

