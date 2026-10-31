export interface VacancySource {
  sourceId: string;
  sourceVacancyId: string;
  url: string;
  observedAt: string;
}

export interface CreateVacancyInput {
  id?: string;
  canonicalUrl: string;
  title: string;
  organization?: string | null;
  location?: string | null;
  workModel?: "remote" | "hybrid" | "onsite" | "unknown";
  descriptionSummary?: string | null;
  publishedAt?: string | null;
  sourceId: string;
  sourceVacancyId: string;
}

function cleanText(value: string): string {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Gera um fingerprint SHA-256 determinístico da vaga.
 * Duas vagas com mesmo título e empresa geram o exato mesmo hash,
 * impedindo duplicações de feed e cruzando origens diferentes.
 */
export function generateVacancyFingerprint(title: string, organization?: string | null): string {
  const normTitle = cleanText(title).replace(/[^a-z0-9]/g, "");
  const normOrg = cleanText(organization || "unknown").replace(/[^a-z0-9]/g, "");
  const raw = `${normTitle}::${normOrg}`;

  // Implementação leve de hashing estável para ambiente edge/browser/node
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const char = raw.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Converte para 32bit integer
  }
  const hex = Math.abs(hash).toString(16);
  return `fp_${normOrg.slice(0, 10)}_${hex}`;
}

export class Vacancy {
  readonly id: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly organization: string | null;
  readonly location: string | null;
  readonly workModel: "remote" | "hybrid" | "onsite" | "unknown";
  readonly descriptionSummary: string | null;
  readonly publishedAt: string | null;
  readonly fingerprint: string;
  readonly sources: VacancySource[];
  readonly firstObservedAt: string;

  constructor(input: CreateVacancyInput) {
    if (!input.canonicalUrl || input.canonicalUrl.trim() === "") {
      throw new Error("URL canônica é obrigatória para instanciar uma vaga.");
    }
    if (!input.title || input.title.trim() === "") {
      throw new Error("Título é obrigatório para instanciar uma vaga.");
    }

    this.id = input.id || `vac_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    this.canonicalUrl = input.canonicalUrl.trim();
    this.title = input.title.trim();
    this.organization = input.organization ? input.organization.trim() : null;
    this.location = input.location ? input.location.trim() : null;
    this.workModel = input.workModel || "unknown";
    this.descriptionSummary = input.descriptionSummary ? input.descriptionSummary.trim() : null;
    this.publishedAt = input.publishedAt || null;
    this.fingerprint = generateVacancyFingerprint(this.title, this.organization);
    this.firstObservedAt = new Date().toISOString();

    this.sources = [
      {
        sourceId: input.sourceId,
        sourceVacancyId: input.sourceVacancyId,
        url: this.canonicalUrl,
        observedAt: this.firstObservedAt,
      },
    ];
  }

  addSource(source: Omit<VacancySource, "observedAt"> & { observedAt?: string }): void {
    const exists = this.sources.some(s => s.sourceId === source.sourceId && s.sourceVacancyId === source.sourceVacancyId);
    if (!exists) {
      this.sources.push({
        sourceId: source.sourceId,
        sourceVacancyId: source.sourceVacancyId,
        url: source.url,
        observedAt: source.observedAt || new Date().toISOString(),
      });
    }
  }
}

export function createVacancy(input: CreateVacancyInput): Vacancy {
  return new Vacancy(input);
}
