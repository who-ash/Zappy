# Zappy's own sound effects, synthesised here, so they carry no licence:
# released as CC0 with Zappy. Run: python3 make-sfx.py (writes the .wav files).
import math, random, struct, wave

RATE = 48000
random.seed(7)

def write(name, samples):
    peak = max(1e-9, max(abs(x) for x in samples))
    with wave.open(name, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", int(32767 * 0.8 * x / peak)) for x in samples))

def click():  # a soft UI tick: 1.8 kHz with a fast decay and a breath of noise
    n = int(0.06 * RATE)
    return [(math.sin(2 * math.pi * 1800 * i / RATE) * 0.7 + (random.random() - 0.5) * 0.3) * math.exp(-i / (0.008 * RATE)) for i in range(n)]

def whoosh():  # filtered noise that swells and fades, its brightness sweeping down
    n = int(0.45 * RATE)
    out, y = [], 0.0
    for i in range(n):
        t = i / n
        a = 0.02 + 0.18 * (1 - t)  # one-pole low-pass: cutoff falls over the sweep
        y += a * ((random.random() - 0.5) - y)
        out.append(y * math.sin(math.pi * t) ** 1.5)
    return out

def sting():  # a gentle two-note chime (a fifth), for the end card
    n = int(1.1 * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = (1 - math.exp(-t / 0.004)) * math.exp(-t / 0.35)
        late = t > 0.12
        out.append(env * (math.sin(2 * math.pi * 660 * t) + 0.5 * math.sin(2 * math.pi * 1320 * t))
                   + (late * (1 - math.exp(-(t - 0.12) / 0.004)) * math.exp(-(t - 0.12) / 0.4) * math.sin(2 * math.pi * 990 * t) * 0.8 if late else 0))
    return out

write("click.wav", click()); write("whoosh.wav", whoosh()); write("sting.wav", sting())
print("click.wav whoosh.wav sting.wav")
