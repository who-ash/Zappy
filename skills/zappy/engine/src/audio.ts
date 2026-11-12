// Loudness: every render is normalised to the playbook's social target
// (about -14 LUFS integrated, -1.5 dBTP) with ffmpeg's two-pass loudnorm,
// using the ffmpeg that ships with Remotion. The video stream is copied.
import { spawnSync } from "node:child_process";
import { readdirSync, renameSync } from "node:fs";
import { join } from "node:path";

function ffmpegBin(engine: string) {
  const base = join(engine, "node_modules", "@remotion");
  const dir = readdirSync(base).find((d) => d.startsWith("compositor-"));
  if (!dir) throw new Error("Remotion's ffmpeg isn't installed (npm install in the engine)");
  const lib = join(base, dir);
  return { bin: join(lib, process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg"), env: { ...process.env, DYLD_LIBRARY_PATH: lib, LD_LIBRARY_PATH: lib } };
}

/** Normalises mp4's audio in place to `target` LUFS. Returns the measured loudness before, or null (no audio). */
export function normaliseLoudness(engine: string, mp4: string, target = -14): number | null {
  const { bin, env } = ffmpegBin(engine);
  const filter = `loudnorm=I=${target}:TP=-1.5:LRA=11`;
  const probe = spawnSync(bin, ["-hide_banner", "-i", mp4, "-vn", "-af", `${filter}:print_format=json`, "-f", "null", "-"], { env, encoding: "utf8" });
  const err = probe.stderr ?? "";
  const json = err.slice(err.lastIndexOf("{"), err.lastIndexOf("}") + 1);
  let m: Record<string, string>;
  try {
    m = JSON.parse(json);
  } catch {
    return null; // no audio stream
  }
  const before = Number(m.input_i);
  if (!Number.isFinite(before)) return null; // silent
  const tmp = mp4.replace(/\.mp4$/, ".loudnorm.mp4");
  const run = spawnSync(bin, [
    "-y", "-hide_banner", "-loglevel", "error", "-i", mp4, "-c:v", "copy",
    "-af", `${filter}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`,
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", tmp,
  ], { env, encoding: "utf8" });
  if (run.status !== 0) throw new Error(`loudness: ffmpeg failed: ${run.stderr.split("\n")[0]}`);
  renameSync(tmp, mp4);
  return before;
}
