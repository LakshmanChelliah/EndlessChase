# WebGL Build Settings (Unity 2022.3 LTS + URP) — Fake GTA / Mobile PBR

Optimized for **cellular networks** and **~60 FPS** on modern mobile browsers. Required for **GitHub Pages**.

## Player Settings → WebGL

| Setting | Value | Why |
|---------|-------|-----|
| Color Space | **Linear** | Correct Mobile PBR; keep exposure conservative |
| Compression Format | **Gzip** | Pages-friendly |
| Decompression Fallback | **On** | Pages does not send Content-Encoding |
| Managed Stripping | **High** | Payload |
| IL2CPP | On | WebGL default |
| Exception Support | **None** | Smaller |
| WebGL 2.0 | Autodetect | |
| Run In Background | Off | |

## Quality / URP (Fake GTA tier)

- Single URP renderer
- **Shadows Off** (fake contact shadows live in albedo/AO)
- Additional Lights **0**
- MSAA **Off** or 2×
- Soft Particles Off; HDR Off if unstable on Safari
- Main light only (golden-hour directional)
- `Application.targetFrameRate = 60`
- Fog: inexpensive distance/height fog matching sky haze

## Textures / Materials

- Vehicle + env atlases max **2048**; ASTC 6×6 / ETC2
- Albedo sRGB; ORM + Normal linear
- Materials: `M_Vehicle_PBR`, `M_Env_PBR` → shader `EndlessChase/MobilePBR`
- Mipmaps ON; anisotropic 2–4
- Audio: Vorbis, aggressive bitrate

## Template

Select `EndlessChase` WebGL template (touch-action / overscroll guards).

## GitHub Pages deploy

1. Build Unity WebGL **or** ship the playable `docs/` Three.js client  
2. Enable Pages from `/docs` on `main` (current) or `gh-pages` for Unity `Build/`  
3. Gzip + Decompression Fallback if hosting Unity binary output  

## Without Unity Editor

`docs/` Three.js client approximates Fake GTA materials (MeshStandard + golden-hour lights) for Pages CI until a Unity WebGL binary is produced.
