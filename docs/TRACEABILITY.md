# Rastreabilidade: Critérios do Sistema aos Testes

Cada critério de aceitação mapeia diretamente para os testes automatizados que comprovam sua conformidade no Argus.

## J0: Walking Skeleton & Banco Neon

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 0.1 | Conexão com Neon Postgres via `@neondatabase/serverless` e rota `/health/db` | `tests/integration/neon-connection.test.ts` | Coberto |

## J1: Esquema de Dados, Deduplicação & TTL

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 1.1 | Tabelas `vacancies`, `vacancy_occurrences` e `candidate_rejections` no Postgres | `tests/integration/neon-connection.test.ts` | Coberto |
| 1.2 | Deduplicação idempotente por hash MD5/SHA256 impedindo vagas repetidas | `tests/domain/vacancy.test.ts` | Coberto |
| 1.3 | Expiração por TTL e purga automática de vagas obsoletas | `tests/notifications/outbox.test.ts` | Coberto |

## J2: Perfil do Candidato & Analisador de Escopo

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 2.1 | Perfil técnico tipado com senioridade (Júnior/Pleno) e stack core | `tests/domain/config.test.ts` | Coberto |
| 2.2 | Bloqueio de vagas exclusivas para PCD e exigência mandatória de diploma | `tests/decision/scope-analyzer.test.ts` | Coberto |
| 2.3 | Validação de modalidade remota e limites geográficos para presencial | `tests/decision/scope-analyzer.test.ts` | Coberto |

## J3: Pipeline de Ingestão & Auditoria de Rejeições

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 3.1 | Ingestão unificada através dos adaptadores de vagas (Gupy, Greenhouse, etc.) | `tests/integration/ingest-pipeline.test.ts` | Coberto |
| 3.2 | Registro auditável de rejeições com motivo exato em `candidate_rejections` | `tests/integration/ingest-pipeline.test.ts` | Coberto |
| 3.3 | Upsert atômico de ocorrências para cálculo de frequência de mercado | `tests/integration/ingest-pipeline.test.ts` | Coberto |

## J4: Juiz Semântico de IA (LLM Judge)

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 4.1 | Avaliação semântica via Gemini 3.5 com score de compatibilidade e lacunas | `tests/ai/llm-judge.test.ts` | Coberto |
| 4.2 | Fallback transparente para OpenRouter em oscilações de cota (429) | `tests/ai/llm-judge.test.ts` | Coberto |
| 4.3 | Fallback gracioso para heurística local sem quebrar o pipeline | `tests/integration/ingest-pipeline-ai.test.ts` | Coberto |

## J5: Webhook do Telegram & Inbox Manual

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 5.1 | Rota `/telegram/webhook` com validação de token secreto do bot | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 5.2 | Extração de URLs enviadas pelo celular em conversas privadas | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 5.3 | Enfileiramento automático de alertas aprovados no outbox | `tests/integration/ingest-pipeline.test.ts` | Coberto |

## J6: Migração para a Nuvem & Aposentadoria Local

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 6.1 | Desativação dos serviços systemd locais e transição 100% para Cloudflare + Neon | `tests/smoke.test.ts` | Coberto |

## J7: Inteligência de Mercado & Relatório Diário

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 7.1 | Consolidação automática das 24 horas às 20h BRT com totalizadores de funil | `tests/notifications/daily-report.test.ts` | Coberto |
| 7.2 | Identificação das 3 lacunas técnicas mais frequentes do dia para estudo | `tests/notifications/daily-report.test.ts` | Coberto |
| 7.3 | Agendamento resiliente no cron do Cloudflare sem chamadas concorrentes | `tests/notifications/daily-report.test.ts` | Coberto |

## J8: Comandos Interativos no Telegram

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 8.1 | Comandos `/start` e `/ajuda` com instruções de uso e atalhos | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 8.2 | Comandos operacionais `/status`, `/fontes` e `/problemas` com saúde do sistema | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 8.3 | Consultas dinâmicas `/relatorio` e `/ultimas` lendo diretamente do Neon | `tests/notifications/telegram-friendly.test.ts` | Coberto |

## J9: Resolução Canônica de URLs & GeekHunter

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 9.1 | Decodificação de parâmetros Gupy Base64 para URLs canônicas | `tests/adapters/url-resolver.test.ts` | Coberto |
| 9.2 | Limpeza de parâmetros de rastreamento (`utm_*`, `trk`, `trackingId`) | `tests/adapters/url-resolver.test.ts` | Coberto |
| 9.3 | Resolução segura de redirecionamentos `lnkd.in` com proteção anti-SSRF | `tests/adapters/url-resolver.test.ts` | Coberto |
| 9.4 | Adaptador GeekHunter coletando oportunidades públicas | `tests/adapters/geekhunter.test.ts` | Coberto |

## J10: Integração Operacional do Juiz de IA

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 10.1 | Avaliação em tempo real de links manuais enviados no Telegram | `tests/integration/ingest-pipeline-ai.test.ts` | Coberto |
| 10.2 | Rejeição automática de vagas sem aderência técnica mínima | `tests/integration/ingest-pipeline-ai.test.ts` | Coberto |
| 10.3 | Resiliência e persistência de lacunas no banco de dados | `tests/integration/ingest-pipeline-ai.test.ts` | Coberto |

## J11: Formatação Humanizada & Anti-Duplicidade

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 11.1 | Remoção total de jargões de máquina das mensagens do bot | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 11.2 | Detecção de vagas já cadastradas sem re-alertar o usuário | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 11.3 | Extração de título e empresa a partir do texto livre da mensagem | `tests/notifications/telegram-friendly.test.ts` | Coberto |

## J12: Despachador de Outbox & Higienização de CI

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 12.1 | Consumo periódico do `haadar.notification_outbox` no Neon via cron | `tests/integration/neon-outbox-dispatcher.test.ts` | Coberto |
| 12.2 | Testes de integração limpam seus próprios registros de teste do Neon | `tests/integration/ingest-pipeline.test.ts` | Coberto |

## J13: URLs Modernas GeekHunter, Metadados Vivos & Filtro Sênior

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 13.1 | URLs canônicas públicas da GeekHunter (`/pt/:company/jobs/:slug`) | `tests/adapters/geekhunter.test.ts` | Coberto |
| 13.2 | Extração ao vivo de metadados (`<title>`, empresa, `<meta description>`) | `tests/adapters/url-resolver.test.ts` | Coberto |
| 13.3 | Bloqueio estrito de nível Sênior no corpo da vaga e 5+ anos de experiência | `tests/decision/senior-filter.test.ts` | Coberto |

## J14: Layout Minimalista & Silenciamento de Descartes

| Critério | Descrição | Testes | Situação |
|---|---|---|---|
| 14.1 | Mensagens no Telegram com formato direto ao ponto (match, pontos fortes, estudo) | `tests/notifications/telegram-friendly.test.ts` | Coberto |
| 14.2 | Silenciamento total de vagas descartadas no Telegram (zero ruído) | `tests/notifications/telegram-friendly.test.ts` | Coberto |
