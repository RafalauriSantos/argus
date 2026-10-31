import fs from "fs";
import path from "path";

const SENSITIVE_PATTERNS = [
  /postgres(?:ql)?:\/\/[a-zA-Z0-9_\-]+:[a-zA-Z0-9_\-]+@[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-]+/i,
  /AIzaSy[a-zA-Z0-9_\-]{33}/, // Google API Key
  /sk-[a-zA-Z0-9_\-]{32,}/, // OpenAI / OpenRouter Key
  /\b[0-9]{8,10}:[a-zA-Z0-9_-]{35}\b/, // Telegram Bot Token
  /npg_[a-zA-Z0-9_\-]{16,}/, // Neon API Token / Password
];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    if (file === "node_modules" || file === ".git" || file === ".scratch" || file === "dist") {
      continue;
    }
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      if (!file.endsWith(".png") && !file.endsWith(".jpg") && !file.endsWith(".lock")) {
        arrayOfFiles.push(fullPath);
      }
    }
  }

  return arrayOfFiles;
}

const rootDir = process.cwd();
const allFiles = getAllFiles(rootDir);
const leaks = [];

for (const fullPath of allFiles) {
  const relFile = path.relative(rootDir, fullPath);
  if (relFile === ".dev.vars" || relFile.endsWith(".local") || relFile.endsWith(".env") || relFile.endsWith(".example")) {
    continue;
  }
  if (relFile.includes("check-secrets.js")) {
    continue;
  }

  const content = fs.readFileSync(fullPath, "utf-8");
  const lines = content.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(line)) {
        leaks.push({
          file: relFile,
          line: i + 1,
          match: line.trim().slice(0, 50) + "...",
        });
      }
    }
  }
}

if (leaks.length > 0) {
  console.error("❌ FALHA DE SEGURANÇA: Vazamentos de segredos detectados:", leaks);
  process.exit(1);
} else {
  console.log("✅ Varredura de segurança concluída com sucesso: 0 segredos detectados nos arquivos do repositório.");
}
