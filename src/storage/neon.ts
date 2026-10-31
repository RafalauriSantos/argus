import { neon, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Em ambiente Node.js / testes locais, o driver precisa do polyfill de WebSocket
if (typeof WebSocket === "undefined") {
  neonConfig.webSocketConstructor = ws;
}

export interface DatabaseHealth {
  connected: boolean;
  timestamp?: string;
  version?: string;
  error?: string;
}

export function getDatabaseClient(databaseUrl: string) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL não configurada no ambiente.");
  }
  return neon(databaseUrl);
}

export async function checkDatabaseHealth(databaseUrl: string): Promise<DatabaseHealth> {
  try {
    const sql = getDatabaseClient(databaseUrl);
    const result = await sql`SELECT NOW() as now, version() as version`;
    if (result && result.length > 0) {
      return {
        connected: true,
        timestamp: String(result[0].now),
        version: String(result[0].version),
      };
    }
    return { connected: false, error: "Consulta não retornou registros." };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { connected: false, error: message };
  }
}
