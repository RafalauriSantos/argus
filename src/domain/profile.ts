export interface UserProfile {
  nivelAtual: string;
  formacao: string;
  englishLevel: string;
  stackCore: string[];
  stackSecundaria: string[];
  localizacao: string;
  regiaoAceitaPresencial: string[];
  modalidadePreferida: string;
  empresasPrioritarias: string[];
  nivelBloqueado: string[];
  skillsEvidence: Record<string, { level: string; evidence: string }>;
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  nivelAtual: "Júnior avançado / início de pleno; primeira experiência formal em desenvolvimento",
  formacao: "Técnico em Desenvolvimento de Sistemas (Etec, jun/2026); cursando Fatec GTI",
  englishLevel: "basic-intermediate",
  stackCore: [
    "React",
    "TypeScript",
    "Node.js",
    "Supabase",
    "PostgreSQL",
    "Tailwind",
    "Cloudflare"
  ],
  stackSecundaria: [
    "Java",
    "Python",
    "Docker",
    "Git",
    "Playwright",
    "Vitest"
  ],
  localizacao: "Tatuí-SP",
  regiaoAceitaPresencial: [
    "Tatuí",
    "Tatui",
    "Sorocaba",
    "Votorantim",
    "Boituva",
    "Itapetininga"
  ],
  modalidadePreferida: "Remoto ou presencial na região",
  empresasPrioritarias: [
    "Goomer",
    "GFT",
    "Flavia Nasser"
  ],
  nivelBloqueado: [
    "Sênior",
    "Senior",
    "Pleno-Sênior",
    "Lead",
    "Gerente",
    "Especialista",
    "Principal",
    "Staff"
  ],
  skillsEvidence: {
    java: {
      level: "learning",
      evidence: "projeto pessoal inicial; sem um ano de experiência comprovado"
    },
    python: {
      level: "project",
      evidence: "implementação do Job Finder local; não apresentada como emprego formal"
    },
    ci_cd: {
      level: "project",
      evidence: "pipeline GitHub Actions no projeto Marque's Barbearia, com testes de integração e E2E bloqueando deploys inválidos"
    },
    cloudflare: {
      level: "project",
      evidence: "deploy e operação de frontend em Cloudflare Pages e backend serverless em Cloudflare Workers"
    },
    playwright: {
      level: "project",
      evidence: "fluxos E2E no projeto Marque's Barbearia"
    },
    vitest: {
      level: "project",
      evidence: "testes de integração no projeto Marque's Barbearia"
    }
  }
};
