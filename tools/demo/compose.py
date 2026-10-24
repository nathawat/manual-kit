# Background music for the demo: a soft pad (slow chords, no drums) with a few quiet bell notes.
# Usage: python3 compose.py SECONDS OUT.wav   (48 kHz, 16-bit, stereo)
import math, random, struct, sys, wave

SR = 48000
secs = float(sys.argv[1])
out = sys.argv[2]
n = int(secs * SR)
random.seed(7)

def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)

# Cmaj9, Am9, Fmaj9, G6/9: 6.4 s each, voiced low and close
CHORDS = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [43, 50, 52, 55, 57]]
BAR = 6.4
left = [0.0] * n
right = [0.0] * n

def env(t, length, attack, release):
    if t < 0 or t > length:
        return 0.0
    a = min(1.0, t / attack)
    r = min(1.0, (length - t) / release)
    return (math.sin(a * math.pi / 2) ** 2) * (math.sin(r * math.pi / 2) ** 2)

# pad: each chord fades in over 2 s and out over 2.4 s, overlapping the next
k = 0
start = 0.0
while start < secs:
    chord = CHORDS[k % len(CHORDS)]
    length = BAR + 2.4
    s0 = int(start * SR)
    s1 = min(n, int((start + length) * SR))
    for note in chord:
        f = hz(note)
        detune = [f * 0.997, f * 1.003]
        ph = [random.random() * 6.283, random.random() * 6.283]
        amp = 0.05 if note < 50 else 0.035
        for i in range(s0, s1):
            t = (i - s0) / SR
            e = env(t, length, 2.0, 2.4) * amp
            # sine plus a little second harmonic: warm, not buzzy
            a = math.sin(6.283 * detune[0] * t + ph[0]) + 0.18 * math.sin(12.566 * detune[0] * t)
            b = math.sin(6.283 * detune[1] * t + ph[1]) + 0.18 * math.sin(12.566 * detune[1] * t)
            left[i] += e * a
            right[i] += e * b
    start += BAR
    k += 1

# bells: one soft note every 1.6 s from the chord's upper tones, an octave up, fast decay
t = 1.2
while t < secs - 2:
    chord = CHORDS[int(t // BAR) % len(CHORDS)]
    note = random.choice(chord[2:]) + 12
    f = hz(note)
    pan = 0.35 + random.random() * 0.3
    s0 = int(t * SR)
    s1 = min(n, s0 + int(2.2 * SR))
    for i in range(s0, s1):
        x = (i - s0) / SR
        e = math.exp(-x * 2.6) * min(1.0, x / 0.012) * 0.022
        v = e * (math.sin(6.283 * f * x) + 0.25 * math.sin(6.283 * f * 3.01 * x) * math.exp(-x * 6))
        left[i] += v * (1 - pan)
        right[i] += v * pan
    t += 1.6 if random.random() < 0.75 else 3.2

# gentle low-pass, fade in and out
def lowpass(x, cutoff):
    a = math.exp(-6.283 * cutoff / SR)
    y, prev = [0.0] * len(x), 0.0
    for i, s in enumerate(x):
        prev = (1 - a) * s + a * prev
        y[i] = prev
    return y

left, right = lowpass(left, 2600), lowpass(right, 2600)
peak = max(max(abs(s) for s in left), max(abs(s) for s in right)) or 1
gain = 0.7 / peak
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    frames = bytearray()
    for i in range(n):
        f = min(1.0, i / (1.5 * SR), (n - i) / (2.5 * SR))
        frames += struct.pack('<hh', int(left[i] * gain * f * 32767), int(right[i] * gain * f * 32767))
    w.writeframes(bytes(frames))
print('ok', out, secs)
