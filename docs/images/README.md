# Screenshots

Place the following PNG screenshots here before the first public release:

| Filename | Description |
|---|---|
| `hero.png` | Default camera, 6+ islands visible, 1-2 bridges, HUD visible. Used as repo social card. |
| `island-detail.png` | Close-up of one island with NamespaceCard open. |
| `bridges.png` | Wide shot showing bridges between islands with traffic beads. |
| `hud-telemetry.png` | Cropped HUD showing live cluster data. |
| `mothership.png` | Center of world, mothership hovering. |

To capture: run `pnpm dev` + `cd engine && go run ./cmd/kube-engine`, open http://localhost:5173,
take 1920x1080 screenshots and compress with `pngquant --quality=65-80 *.png`.
