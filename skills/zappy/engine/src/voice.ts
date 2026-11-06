// Narration audio: one WAV per line from OpenAI or Sarvam TTS, cached by a
// hash of everything that changes the audio. Provider "none" makes no audio:
// the line is captioned and held for its reading time.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config";

/** `file` is null when there's no audio (provider "none"). */
export type Clip = { file: string | null; seconds: number };

/** Seconds of audio in a PCM WAV, read from its fmt and data chunks. */
export function wavSeconds(buf: Buffer): number {
  let byteRate = 0;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString("ascii", at, at + 4);
    let size = buf.readUInt32LE(at + 4);
    if (id === "fmt ") byteRate = buf.readUInt32LE(at + 16);
    if (id === "data") {
      // Streamed WAVs may leave the size unset; use what's actually there.
      if (size === 0 || size === 0xffffffff || at + 8 + size > buf.length)
        size = buf.length - at - 8;
      if (!byteRate) throw new Error("WAV has no fmt chunk");
      return size / byteRate;
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("WAV has no data chunk");
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      const wait = 2 ** attempt * 1000 + Math.random() * 500;
      console.warn(`  TTS ${res.status}, retrying in ${Math.round(wait)} ms`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    if (!res.ok) throw new Error(`TTS ${res.status}: ${await res.text()}`);
    return res;
  }
}

function key(name: string) {
  const k = process.env[name];
  if (!k)
    throw new Error(
      `${name} is not set. Add it to zappy/.env or your project's .env.local / .env ` +
        `(see zappy/.env.example), or set "tts": { "provider": "none" } in zappy/zappy.config.json for captions only.`,
    );
  return k;
}

async function synthesize(text: string, tts: Config["tts"]): Promise<Buffer> {
  if (tts.provider === "openai") {
    const o = tts.openai;
    const res = await post(
      "https://api.openai.com/v1/audio/speech",
      { authorization: `Bearer ${key("OPENAI_API_KEY")}` },
      { model: o.model, voice: o.voice, speed: o.speed, input: text, response_format: "wav" },
    );
    return Buffer.from(await res.arrayBuffer());
  }
  const s = tts.sarvam;
  if (text.length > 2500) throw new Error(`Line over 2500 chars: ${text}`);
  const res = await post(
    "https://api.sarvam.ai/text-to-speech",
    { "api-subscription-key": key("SARVAM_API_KEY") },
    {
      text,
      language_code: s.languageCode,
      model: s.model,
      speaker: s.speaker,
      pace: s.pace,
      speech_sample_rate: s.sampleRate,
      output_audio_codec: "wav",
    },
  );
  const { audios } = (await res.json()) as { audios: string[] };
  return Buffer.from(audios.join(""), "base64");
}

/** Known voices per provider (others may work; the provider decides). */
export const VOICES = {
  openai: ["alloy", "ash", "ballad", "cedar", "coral", "echo", "fable", "marin", "nova", "onyx", "sage", "shimmer", "verse"],
  sarvam: ["shubh", "aditya", "rahul", "ritu", "priya", "neha", "kavya"],
};

/** The tts settings with `name` as the voice (OpenAI voice or Sarvam speaker). */
export function withVoice(tts: Config["tts"], name?: string): Config["tts"] {
  if (!name) return tts;
  return {
    ...tts,
    openai: { ...tts.openai, voice: name },
    sarvam: { ...tts.sarvam, speaker: name },
  };
}

/** Returns the cached WAV for a line, calling the provider only on a miss. */
export async function voice(
  text: string,
  tts: Config["tts"],
  cacheDir: string,
): Promise<Clip> {
  if (tts.provider === "none") {
    // About 2.7 words a second, at least 1.5 s on screen.
    const words = text.split(/\s+/).length;
    return { file: null, seconds: Math.max(1.5, words / 2.7) };
  }
  const hash = createHash("sha256")
    .update(JSON.stringify([text, tts.provider, tts[tts.provider]]))
    .digest("hex")
    .slice(0, 16);
  const file = join(cacheDir, `${hash}.wav`);
  if (!existsSync(file)) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(file, await synthesize(text, tts));
  }
  return { file, seconds: wavSeconds(readFileSync(file)) };
}
