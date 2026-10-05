#!/usr/bin/env python3
"""Import completed MCP takes or supplied recordings, trim and balance game MP3s.

Input describes completed MCP media or archived local sources. This script
starts no generation. Requires ffmpeg and NumPy; writes public audio and an
audit of selected generation IDs or source hashes, durations, peaks and RMS.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
import urllib.request

import numpy as np

SR = 44100
ROOT = Path(__file__).resolve().parents[1]
LEVELS = {
    "announcer": (-19, -3), "weapon": (-18, -4),
    "movement": (-18, -5), "finisher": (-21, -7),
    "medal": (-22, -8), "ambience": (-35, -25), "ui": (-29, -17),
}
KEY_LEVELS = {
    "rail-charge": (-35, -25), "hit": (-26, -13),
    "hit-headshot": (-24, -11), "reload-ready": (-28, -14),
    "wall-impact": (-25, -12), "kill": (-19, -6),
    "kill-headshot": (-19, -6), "death": (-20, -6),
}


def command(args, **kwargs):
    result = subprocess.run(args, check=True, stderr=subprocess.PIPE, **kwargs)
    return result.stdout


def prepare(media, spec, cache):
    if spec.get("type") == "tts" and media.get("voice", {}).get("voice_id") != spec.get("voice_id"):
        raise ValueError(f"Wrong announcer voice for {spec['key']}")
    if media.get("source"):
        source = media["source"]
        raw = ROOT / source["path"]
        gid = source["sha256"]
        if hashlib.sha256(raw.read_bytes()).hexdigest() != gid:
            raise ValueError(f"Source recording changed for {spec['key']}")
    else:
        gid = media["generation_id"]
        raw = cache / f"{gid}.mp3"
        if not raw.exists():
            request = urllib.request.Request(media.get("master_url") or media["url"])
            with urllib.request.urlopen(request, timeout=60) as response:
                raw.write_bytes(response.read())
    processing = spec.get("processing", {})
    filters = ["highpass=f=75", "equalizer=f=125:t=q:w=0.7:g=2"] if spec["category"] == "announcer" else []
    for setting, effect in [("highpassHz", "highpass"), ("lowpassHz", "lowpass")]:
        if setting in processing:
            frequency = float(processing[setting])
            if not math.isfinite(frequency) or not 20 <= frequency < SR / 2:
                raise ValueError(f"Invalid {setting} for {spec['key']}")
            filters.append(f"{effect}=f={frequency}")
    pcm = command(["ffmpeg", "-v", "error", "-i", str(raw), "-af", ",".join(filters) or "anull",
                   "-ar", str(SR), "-ac", "2", "-f", "f32le", "pipe:1"], stdout=subprocess.PIPE)
    samples = np.frombuffer(pcm, dtype="<f4").reshape(-1, 2).copy()
    if not len(samples) or not np.isfinite(samples).all():
        raise ValueError(f"Invalid audio in {gid}")
    peak = float(np.max(np.abs(samples)))
    if peak < 0.0001:
        raise ValueError(f"Silent audio in {gid}")
    loop = spec.get("loop", False)
    leading = 0
    if not loop:
        # Explicit source coordinates select a shot before automatic silence
        # trimming; trimStartMs below still refers to the already-trimmed take.
        if "sourceStartMs" in processing or "sourceEndMs" in processing:
            source_start = float(processing.get("sourceStartMs", 0))
            source_end = float(processing.get("sourceEndMs", len(samples) / SR * 1000))
            if not (math.isfinite(source_start) and math.isfinite(source_end) and
                    0 <= source_start < source_end <= len(samples) / SR * 1000):
                raise ValueError(f"Invalid source range for {spec['key']}")
            samples = samples[int(SR * source_start / 1000):int(SR * source_end / 1000)]
        # Block RMS avoids trimming quiet consonants and ignores encoder noise.
        block = 220
        frames = len(samples) // block
        energy = np.sqrt(np.mean(samples[:frames * block].reshape(frames, block, 2) ** 2, axis=(1, 2)))
        threshold = max(0.0005, float(energy.max()) * (0.018 if spec["category"] == "announcer" else 0.025))
        active = np.flatnonzero(energy > threshold)
        if len(active) and processing.get("trimSilence", True):
            leading = max(0, int(active[0]) * block - int(SR * 0.012))
            end = min(len(samples), (int(active[-1]) + 1) * block + int(SR * 0.04))
            samples = samples[leading:end]
        trim_ms = float(processing.get("trimStartMs", 0))
        if not math.isfinite(trim_ms) or trim_ms < 0:
            raise ValueError(f"Invalid trimStartMs for {spec['key']}")
        trim = int(SR * trim_ms / 1000)
        if trim >= len(samples):
            raise ValueError(f"trimStartMs removes the entire recording for {spec['key']}")
        if trim:
            samples = samples[trim:]
            leading += trim
        limit = int(SR * spec["maxDuration"])
        # Preserve complete words even if a generated callout is longer than expected.
        if spec["category"] != "announcer":
            samples = samples[:limit]
        if "decayMs" in processing:
            decay_ms = float(processing["decayMs"])
            if not math.isfinite(decay_ms) or decay_ms <= 0:
                raise ValueError(f"Invalid decayMs for {spec['key']}")
            # Put a discharge's energy at the event, instead of allowing a
            # sustained recording to build into its loudest burst later.
            samples *= np.exp(-np.arange(len(samples)) / (SR * decay_ms / 1000))[:, None]
        fade_in = min(int(SR * processing.get("fadeInMs", 2) / 1000), len(samples) // 4)
        fade_out = min(int(SR * processing.get("fadeOutMs", 12) / 1000), len(samples) // 4)
        if fade_in:
            samples[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
        if fade_out:
            samples[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None]
    else:
        # Crossfade the final 100ms into the beginning. The loop wraps through
        # adjacent samples, retaining the source model's seamless ambience.
        fade = min(int(SR * 0.1), len(samples) // 8)
        if fade:
            w = np.linspace(0, 1, fade)[:, None]
            samples[:fade] = samples[-fade:] * (1 - w) + samples[:fade] * w
            samples = samples[:-fade]
    rms = float(np.sqrt(np.mean(samples ** 2)))
    peak = float(np.max(np.abs(samples)))
    rms_db, peak_db = KEY_LEVELS.get(spec["key"], LEVELS[spec["category"]])
    rms_db = processing.get("rmsDb", rms_db)
    peak_db = processing.get("peakDb", peak_db)
    gain = min(10 ** (rms_db / 20) / max(rms, 1e-8), 10 ** (peak_db / 20) / max(peak, 1e-8))
    samples *= gain
    # Prefer compact recordings with an immediate transient and no long lead-in.
    score = leading / SR + max(0, len(samples) / SR - spec["maxDuration"])
    return score, samples, media


def write_runtime_pack(files):
    # The preview reads the manifest; gameplay reads this module. Regenerate
    # it on import so an existing old MP3 cannot hide a missed replacement.
    urls = {}
    for file in sorted(files, key=lambda file: (file["key"] != "rail-fire", file["key"], file["variant"])):
        if "/announcer/" not in file["path"]:
            urls.setdefault(file["key"], []).append("/" + file["path"].removeprefix("public/"))
    if urls:
        (ROOT / "src/game/sfx/generated-pack.ts").write_text(
            "// Selected local recordings. Sources and provenance: docs/audio-generation.json.\n"
            "// Speech is kept separate so every callout uses one recorded announcer.\n"
            "export const GENERATED_SFX_URLS = " + json.dumps(urls, indent=2) + " as const;\n\n"
            "export type GeneratedSfxName = keyof typeof GENERATED_SFX_URLS;\n"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=Path)
    parser.add_argument("--cache", type=Path, default=Path(tempfile.gettempdir()) / "agent-deathmatch-elevenlabs-raw")
    parser.add_argument("--voice-directory", help="Versioned subdirectory for replacement announcer recordings")
    parser.add_argument("--asset-directory", help="Versioned subdirectory for replacement effects")
    parser.add_argument("--merge", action="store_true", help="Replace generated events while retaining the rest of the current pack")
    parser.add_argument("--require-complete", action="store_true", help="Fail instead of publishing an incomplete replacement set")
    args = parser.parse_args()
    if args.voice_directory and not re.fullmatch(r"[a-zA-Z0-9_-]+", args.voice_directory):
        parser.error("--voice-directory must be a single directory name")
    if args.asset_directory and not re.fullmatch(r"[a-zA-Z0-9_-]+", args.asset_directory):
        parser.error("--asset-directory must be a single directory name")
    data = json.loads(args.session.read_text())
    args.cache.mkdir(parents=True, exist_ok=True)
    selected = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for spec in data["specs"]:
            media = [m for m in data["media"] if m.get("key") == spec["key"]]
            if not media:
                if args.require_complete:
                    raise ValueError(f"Missing recording for {spec['key']}")
                continue
            prepared = []
            for future in concurrent.futures.as_completed([pool.submit(prepare, m, spec, args.cache) for m in media]):
                try:
                    prepared.append(future.result())
                except Exception as error:
                    # Signed URLs are deliberately omitted from logs.
                    print(f"Rejected {spec['key']} take: {type(error).__name__}")
            prepared.sort(key=lambda take: take[0])
            if not prepared and args.require_complete:
                raise ValueError(f"No valid recording for {spec['key']}")
            count = min(spec["variants"], len(prepared)) if spec["category"] == "movement" else min(1, len(prepared))
            dest = ROOT / "public/sounds/elevenlabs-v1" / spec["category"]
            if spec["category"] == "announcer" and args.voice_directory:
                dest = dest / args.voice_directory
            elif args.asset_directory:
                dest = dest / args.asset_directory
            dest.mkdir(parents=True, exist_ok=True)
            for i, (_, samples, media) in enumerate(prepared[:count], 1):
                path = dest / f"{spec['key']}_{i}.mp3"
                command(["ffmpeg", "-v", "error", "-y", "-f", "f32le", "-ar", str(SR), "-ac", "2",
                         "-i", "pipe:0", "-c:a", "libmp3lame", "-b:a", "128k", str(path)], input=samples.astype("<f4").tobytes())
                record = {"key": spec["key"], "variant": i, "generation_id": media.get("generation_id"),
                                 "path": str(path.relative_to(ROOT)), "duration": round(len(samples) / SR, 4),
                                 "peak_db": round(20 * math.log10(float(np.max(np.abs(samples)))), 2),
                                 "rms_db": round(20 * math.log10(float(np.sqrt(np.mean(samples ** 2)))), 2),
                                 "voice_id": media.get("voice", {}).get("voice_id"),
                                 "model_id": media.get("model_id"), "flow_id": data.get("flow_id")}
                if media.get("source"):
                    record.update({"provider": "user-provided", "source": media["source"]})
                selected.append(record)
            print(f"Saved {spec['key']}: {count} recording(s)")
    audit = ROOT / "public/sounds/elevenlabs-v1/manifest.json"
    audit.parent.mkdir(parents=True, exist_ok=True)
    manifest = json.loads(audit.read_text()) if args.merge and audit.exists() else {
        "provider": "ElevenLabs MCP", "flow_id": data.get("flow_id"), "files": [],
    }
    replaced = {spec["key"] for spec in data["specs"]}
    manifest["files"] = [file for file in manifest["files"] if file["key"] not in replaced] + selected
    if data.get("announcer"):
        manifest["announcer"] = data["announcer"]
    manifest["provider"] = ("ElevenLabs MCP and user-provided audio"
                            if any(file.get("source") for file in manifest["files"])
                            else "ElevenLabs MCP")
    audit.write_text(json.dumps(manifest, indent=2) + "\n")
    write_runtime_pack(manifest["files"])
    print(f"Saved {len(selected)} assets covering {len(set(x['key'] for x in selected))} events")


if __name__ == "__main__":
    main()
