// Settings: built-in defaults, overridden by the project's zappy/zappy.config.json.
// API keys come from the environment (or the project's .env): SARVAM_API_KEY, OPENAI_API_KEY.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { type Config, DEFAULTS } from "./defaults";

export { DEFAULTS };
export type { Config, RenderConfig } from "./defaults";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj =>
  !!v && typeof v === "object" && !Array.isArray(v);
function merge<T>(base: T, over: unknown): T {
  if (!isObj(over) || !isObj(base)) return (over ?? base) as T;
  const out: Obj = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = merge((base as Obj)[k], v);
  return out as T;
}

/** Defaults merged with <dir>/zappy.config.json; loads the project's env files. */
export function loadConfig(dir: string): Config {
  // A loaded file never overrides a variable that's already set, so the most
  // specific source goes first: shell > zappy/.env > .env.local > .env.
  for (const env of [
    join(dir, ".env"),
    join(dir, "..", ".env.local"),
    join(dir, "..", ".env"),
  ])
    if (existsSync(env)) process.loadEnvFile(env);
  const file = join(dir, "zappy.config.json");
  const user = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
  const cfg = merge(DEFAULTS, user);
  if (process.env.ZAPPY_BASE_URL) cfg.baseUrl = process.env.ZAPPY_BASE_URL;
  return cfg;
}
