# WebGL Build Settings (Unity 2022.3 LTS + URP)

Optimized for **cellular networks** and **~60 FPS** on modern mobile browsers. Required for **GitHub Pages**.

## Player Settings → WebGL

| Setting | Value | Why |
|---------|-------|-----|
| Color Space | **Gamma** | Smaller/faster on many mobile GPUs |
| Compression Format | **Gzip** | Pages-friendly |
| Decompression Fallback | **On** | Pages does not send Content-Encoding |
| Code Optimization | Speed / Size tradeoff: prefer Size for first load | |
| Managed Stripping | **High** | Payload |
| IL2CPP | On | WebGL default |
| Exception Support | **None** | Smaller |
| WebGL 2.0 | Autodetect | |
| Run In Background | Off | |
| Data caching | On (optional) | Repeat visits |

## Quality / URP

- Single URP renderer
- Shadows **Off**
- MSAA **Off** or 2×
- Additional lights **0**
- `Application.targetFrameRate = 60`
- Soft Particles Off, HDR Off if possible

## Textures / Audio

- Atlas max **1024**; ASTC/ETC2
- Disable unused mipmaps on UI
- Audio: Vorbis, aggressive bitrate; mute-friendly

## Template

Select `EndlessChase` WebGL template (touch-action / overscroll guards).

## GitHub Pages deploy

1. Build to a local folder
2. Copy `index.html`, `Build/`, `TemplateData/` to `gh-pages` branch root **or** publish the playable `docs/` web client
3. Enable Pages from that branch / `/docs`

## Without Unity Editor

This repo also ships a **Three.js playable client** in `/docs` that mirrors gameplay systems for Pages CI and UI testing until a Unity WebGL binary is produced (local Hub or GameCI).
