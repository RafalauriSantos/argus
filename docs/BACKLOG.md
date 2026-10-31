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
| **0** | **Governança & Walking Skeleton com Neon Postgres** | Normal | 🟡 Em andamento | Conexão com Neon configurada via `@neondatabase/serverless`, rota `/health/db` respondendo status do Postgres e teste automatizado verde. |
| **1** | **Esquema de Dados, Deduplicação & TTL** | Alto | ⚪ Pendente | Tabelas `vacancies`, `vacancy_occurrences`, `candidate_rejections` no Postgres com chaves únicas estritas e rotina de expiração. Nenhuma vaga repetida grava nova linha. |
| **2** | **Transplante do Cérebro (Perfil & Escopo)** | Alto | ⚪ Pendente | `profile.json` portado para TS com regras de senioridade, localização e restrições. Vaga Pleno com escopo de entrada aprovada. |
| **3** | **Adaptadores de Vagas (Gupy, GH, RSS, etc.)** | Alto | ⚪ Pendente | Adapters integrados gravando observações no Neon com tolerância a falhas e controle de concorrência. |
| **4** | **Juiz de IA (LLM Judge Semântico)** | Alto | ⚪ Pendente | Chamada controlada de IA pós-filtro determinístico avaliando compatibilidade de stack e lacunas a treinar. |
| **5** | **Telegram Rico & Webhook Inbox** | Alto | ⚪ Pendente | Layout rico do WorkHunter portado para o Telegram + rota de webhook para envio de links manuais pelo celular. |
| **6** | **Virada de Chave & Aposentadoria Local** | Normal | ⚪ Pendente | Teste de 48h em paralelo, parada dos serviços locais do systemd e arquivamento definitivo. |
