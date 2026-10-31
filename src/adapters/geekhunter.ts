import type { DiscoveryTask, NormalizedObservation, QueryDefinition } from "../domain/types";
import type { AdapterResult, SourceAdapter } from "./adapter";
import { explicitWorkModel, normalizeWhitespace, vacancyFingerprint } from "../normalization/vacancy";

export interface GeekHunterLimits {
  timeoutMs: number;
  maxRecords: number;
  maxResponseBytes: number;
}

export interface GeekHunterSourceConfig {
  id: string;
  kind?: string;
  applicableQueryFamilies: string[];
  limits: GeekHunterLimits;
  allowedHosts: string[];
}

export class GeekHunterAdapter implements SourceAdapter {
  readonly id: string;
  readonly fetchStrategy = "board_once" as const;

  constructor(
    private readonly source: GeekHunterSourceConfig,
    private readonly queries: QueryDefinition[],
    private readonly observedAt: () => Date = () => new Date(),
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.id = source.id;
  }

  async discover(_task: DiscoveryTask): Promise<AdapterResult> {
    try {
      const response = await this.fetcher("https://www.geekhunter.com.br/vagas", {
        headers: {
          "user-agent": "Argus vacancy discovery",
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        return {
          sourceId: this.id,
          observations: [],
          diagnostics: [
            {
              kind: response.status >= 500 ? "retryable" : "permanent",
              message: `HTTP error ${response.status}`,
              httpStatus: response.status,
            },
          ],
        };
      }

      const html = await response.text();
      const observations: NormalizedObservation[] = [];

      // Regex para extrair links de vagas: href="/vagas/12345" ou href="https://www.geekhunter.com.br/vagas/12345"
      // e títulos/empresas
      const cardRegex = /<a[^>]+href=["'](?:https?:\/\/[^/]+)?\/vagas\/([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      const seenIds = new Set<string>();

      while ((match = cardRegex.exec(html)) !== null && observations.length < this.source.limits.maxRecords) {
        const rawId = match[1].replace(/[^0-9a-zA-Z_-]/g, "");
        if (!rawId || seenIds.has(rawId)) continue;
        seenIds.add(rawId);

        const innerContent = match[2];
        const rawTitle = innerContent.replace(/<[^>]+>/g, " ").trim();
        const title = normalizeWhitespace(rawTitle) || "Vaga GeekHunter";

        // Tenta capturar empresa ou localização dentro do card (a partir do link da vaga)
        const cardSnippet = html.slice(match.index, match.index + 500);
        const compMatch = cardSnippet.match(/class=["'][^"']*company[^"']*["'][^>]*>([^<]+)/i);
        const locMatch = cardSnippet.match(/class=["'][^"']*location[^"']*["'][^>]*>([^<]+)/i);

        const organization = compMatch ? normalizeWhitespace(compMatch[1]) : "GeekHunter";
        const location = locMatch ? normalizeWhitespace(locMatch[1]) : undefined;
        const canonicalUrl = `https://www.geekhunter.com.br/vagas/${rawId}`;

        const textContent = `${title} ${organization} ${location || ""}`.toLowerCase();

        // Filtro pelas queries aplicáveis
        const matchingQuery = this.queries.find((q) => {
          if (!this.source.applicableQueryFamilies.includes(q.family)) return false;
          if (q.exclusions.some((ex) => textContent.includes(ex.toLowerCase()))) return false;
          return q.terms.some((term) => textContent.includes(term.toLowerCase()));
        });

        if (matchingQuery) {
          const fingerprint = await vacancyFingerprint({
            organization,
            title,
            location: location || "",
            description: "",
          });

          observations.push({
            sourceId: this.id,
            sourceVacancyId: rawId,
            canonicalUrl,
            title,
            organization,
            location,
            workModel: explicitWorkModel(location || "", textContent, ""),
            observedAt: this.observedAt().toISOString(),
            queryId: matchingQuery.id,
            fingerprint,
            fingerprintVersion: "v1",
            originKind: "real",
          });
        }
      }

      return {
        sourceId: this.id,
        observations,
        diagnostics: [],
      };
    } catch (err) {
      return {
        sourceId: this.id,
        observations: [],
        diagnostics: [
          {
            kind: "retryable",
            message: err instanceof Error ? err.message : "GeekHunter fetch error",
          },
        ],
      };
    }
  }
}
