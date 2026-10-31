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
