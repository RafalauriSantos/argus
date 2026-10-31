# Decisões de Arquitetura (ADRs) — Haadar

## ADR 01 — Adoção do Neon PostgreSQL como Banco Relacional Primário
- **Data:** 2026-10-30
- **Contexto:** O projeto anterior (WorkHunter) sofria frequentes travamentos de concorrência (`database is locked`) devido ao SQLite local com `journal_mode=delete` e ausência de concorrência por linha, acumulando mais de 500 MB de dados repetidos.
- **Decisão:** Adotar o Neon PostgreSQL como camada transacional única na nuvem.
- **Consequências:**
  - Concorrência nativa de leitura/escrita via MVCC.
  - Compatibilidade com o driver `@neondatabase/serverless` para Cloudflare Workers.
  - Eliminação de qualquer dependência de arquivos locais no computador do usuário.

## ADR 02 — Estratégia de Conexão Edge no Cloudflare Workers
- **Data:** 2026-10-30
- **Contexto:** Workers rodam em ambiente serverless V8 sem suporte a conexões TCP tradicionais contínuas por longos períodos.
- **Decisão:** Utilizar o driver HTTP/WebSocket oficial do Neon (`@neondatabase/serverless`), aproveitando o pool de conexões integrado do Neon.
