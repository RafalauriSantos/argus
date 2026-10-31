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
      const response = await this.fetcher("https://www.geekhunter.com/pt/vagas", {
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
      const seenIds = new Set<string>();

      // 1. Padrão Moderno GeekHunter: /pt/:company/jobs/:slug
      const modernCardRegex =
        /<a[^>]+href=["'](?:https?:\/\/(?:www\.)?geekhunter\.com)?\/pt\/([^/]+)\/jobs\/([^"'/]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;

      while ((match = modernCardRegex.exec(html)) !== null && observations.length < this.source.limits.maxRecords) {
        const companySlug = match[1];
        const jobSlug = match[2];
        const rawId = `${companySlug}/${jobSlug}`;
        if (!companySlug || !jobSlug || seenIds.has(rawId)) continue;
        seenIds.add(rawId);

        const innerContent = match[3];
        const rawTitle = innerContent.replace(/<[^>]+>/g, " ").trim();
        const title = normalizeWhitespace(rawTitle) || "Vaga GeekHunter";

        const nextLinkIndex = html.indexOf("<a", match.index + 1);
        const snippetEnd = nextLinkIndex !== -1 ? Math.min(match.index + 500, nextLinkIndex) : match.index + 500;
        const cardSnippet = html.slice(match.index, snippetEnd);
        const compMatch = cardSnippet.match(/class=["'][^"']*company[^"']*["'][^>]*>([^<]+)/i);
        const locMatch = cardSnippet.match(/class=["'][^"']*location[^"']*["'][^>]*>([^<]+)/i);

        const formatCompany = (slug: string): string =>
          slug
            .replace(/-\d+$/, "")
            .replace(/-/g, " ")
            .split(" ")
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ")
            .trim();

        const organization = compMatch
          ? normalizeWhitespace(compMatch[1])
          : formatCompany(companySlug) || "GeekHunter";
        const location = locMatch ? normalizeWhitespace(locMatch[1]) : undefined;
        const canonicalUrl = `https://www.geekhunter.com/pt/${companySlug}/jobs/${jobSlug}`;

        const textContent = `${title} ${organization} ${location || ""}`.toLowerCase();

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

      // 2. Fallback Legado: /vagas/:id
      if (observations.length === 0) {
        const legacyCardRegex =
          /<a[^>]+href=["'](?:https?:\/\/(?:www\.)?geekhunter\.com(?:\.br)?)?\/vagas\/([^"'/]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
        while ((match = legacyCardRegex.exec(html)) !== null && observations.length < this.source.limits.maxRecords) {
          const rawId = match[1].replace(/[^0-9a-zA-Z_-]/g, "");
          if (!rawId || seenIds.has(rawId)) continue;
          seenIds.add(rawId);

          const innerContent = match[2];
          const rawTitle = innerContent.replace(/<[^>]+>/g, " ").trim();
          const title = normalizeWhitespace(rawTitle) || "Vaga GeekHunter";

          const nextLinkIndex = html.indexOf("<a", match.index + 1);
          const snippetEnd = nextLinkIndex !== -1 ? Math.min(match.index + 500, nextLinkIndex) : match.index + 500;
          const cardSnippet = html.slice(match.index, snippetEnd);
          const compMatch = cardSnippet.match(/class=["'][^"']*company[^"']*["'][^>]*>([^<]+)/i);
          const locMatch = cardSnippet.match(/class=["'][^"']*location[^"']*["'][^>]*>([^<]+)/i);

          const organization = compMatch ? normalizeWhitespace(compMatch[1]) : "GeekHunter";
          const location = locMatch ? normalizeWhitespace(locMatch[1]) : undefined;
          const canonicalUrl = `https://www.geekhunter.com.br/vagas/${rawId}`;

          const textContent = `${title} ${organization} ${location || ""}`.toLowerCase();

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
