import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Point tracer at monorepo root so all hoisted deps are included
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // styled-jsx is required by next/dist/server/require-hook.js at load time
  // but the standalone tracer doesn't include it automatically
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/styled-jsx/**/*"],
  },
}

export default nextConfig
