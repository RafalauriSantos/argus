# Backlog

Itens de trabalho do projeto, concluídos e pendentes. Os critérios de aceitação detalhados estão mapeados em `docs/TRACEABILITY.md` e nas decisões arquiteturais em `docs/DECISIONS.md`. Um item é considerado concluído quando seus critérios estão cobertos e verificados por testes automatizados.

Níveis de risco:
- **Alto** (banco de dados, deduplicação idempotente, entrega de alertas, filtros eliminatórios): exige testes estritos e revisão minuciosa.
- **Normal**: revisão e aprovação pela esteira automatizada verde de integração contínua (CI).

## Concluídos

| Item | Critérios | Decisões | PR / Branch |
|---|---|---|---|
| Walking skeleton: Cloudflare Worker, Neon Postgres e rota de saúde | 0.1 | D1, D2 | #1 |
| Esquema de dados, deduplicação por hash e expiração por TTL | 1.1 a 1.3 | D1 | #2 |
| Perfil de busca, restrições e escopo operacional do candidato | 2.1 a 2.3 | | #2 |
| Pipeline de ingestão com analisador de escopo e registro de rejeições | 3.1 a 3.3 | | #2 |
| Juiz de IA (LLM Judge) com Gemini e OpenRouter pós-filtro | 4.1 a 4.3 | | #2 |
| Webhook do Telegram e canal para envio manual de vagas | 5.1 a 5.3 | | #3 |
| Desativação dos serviços systemd locais e migração total para nuvem | 6.1 | D1 | #4 |
| Relatório diário de inteligência consolidado das 24h via cron | 7.1 a 7.3 | | #4 |
| Comandos interativos no Telegram (/status, /relatorio, /ultimas, etc.) | 8.1 a 8.3 | | #4 |
| Normalizador de URLs (Gupy Base64, lnkd.in seguro) e adaptador GeekHunter | 9.1 a 9.4 | | #5 |
| Integração operacional do Juiz de IA na esteira de ingestão e webhook | 10.1 a 10.3 | | #6 |
| Notificações humanizadas e anti-duplicação de alertas no Telegram | 11.1 a 11.3 | | #7 |
| Despacho periódico do outbox no Neon e higienização de dados no CI | 12.1, 12.2 | | #8 |
| URLs canônicas da GeekHunter, metadados ao vivo e bloqueio de vagas sênior | 13.1 a 13.3 | D3 | #9, #10 |
| Notificações minimalistas no Telegram e silenciamento de vagas descartadas | 14.1, 14.2 | D4 | #11 |

## Em aberto / Melhorias contínuas

| # | Item | Critérios | Risco | Condição de conclusão |
|---|---|---|---|---|
| B1 | Painel web integrado para visualização do histórico de vagas no navegador | | Normal | Interface leve servida pelo próprio Worker |
| B2 | Integração de novas fontes de vagas (Catho, InfoJobs) via APIs públicas | | Normal | Adapters com rate limit e testes unitários |
