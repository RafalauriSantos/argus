# Decisões de Arquitetura (ADRs)

Decisões fundamentais tomadas ao longo do ciclo de vida do projeto, seus contextos e consequências.

## ADR 01 — Adoção do Neon PostgreSQL como Banco Relacional Primário
- **Data:** 2026-10-30
- **Contexto:** O projeto anterior (WorkHunter) sofria frequentes travamentos de concorrência (`database is locked`) devido ao SQLite local com `journal_mode=delete` e ausência de concorrência por linha, acumulando mais de 500 MB de dados repetidos.
- **Decisão:** Adotar o Neon PostgreSQL como camada transacional única na nuvem.
- **Consequências:** Concorrência nativa via MVCC, compatibilidade com o driver `@neondatabase/serverless` e eliminação de arquivos de banco locais no computador do usuário.

## ADR 02 — Estratégia de Conexão Edge no Cloudflare Workers
- **Data:** 2026-10-30
- **Contexto:** Workers rodam em ambiente serverless V8 sem suporte a conexões TCP tradicionais contínuas por longos períodos.
- **Decisão:** Utilizar o driver HTTP/WebSocket oficial do Neon (`@neondatabase/serverless`), aproveitando o pool de conexões integrado do Neon.
- **Consequências:** Latência mínima por query, ausência de conexões presas e compatibilidade nativa com o runtime Edge.

## ADR 03 — Extração Viva de Metadados Públicos em URLs Manuais
- **Data:** 2026-10-31
- **Contexto:** Quando o usuário submetia apenas o link da vaga pelo Telegram (sem corpo de texto), o pipeline avaliava um título genérico e descrição vazia. Isso permitia que vagas de nível Sênior passassem despercebidas se o título na URL fosse neutro.
- **Decisão:** Implementar `fetchJobMetadata` com validação de hosts confiáveis (`isTrustedHost`), timeout de 5 segundos via `AbortController` e extração de `<title>`, `og:title` e `<meta name="description">`.
- **Consequências:** O pipeline agora analisa o texto real da oportunidade, rejeitando de imediato requisitos sênior declarados no corpo da página.

## ADR 04 — Silenciamento de Notificações para Vagas Fora do Perfil (Zero-Noise Telegram UX)
- **Data:** 2026-10-31
- **Contexto:** O bot emitia alertas para todas as vagas submetidas ou analisadas, inclusive as descartadas pelo filtro de escopo ou IA, gerando poluição e mensagens desnecessárias no Telegram do usuário.
- **Decisão:** O webhook do Telegram notifica estritamente quando a vaga for aceita/compatível (`status === "ACCEPTED"`) ou quando ocorrerem problemas operacionais críticos. Vagas filtradas/rejeitadas são registradas no banco para auditoria, mas silenciadas no chat.
- **Consequências:** Redução drástica de ruído; cada notificação recebida representa uma oportunidade real de candidatura ou um evento de sistema relevante.
