# 2048 Looter Shooter

A top-down survival shooter where your inventory is a 2048 board.

Enemies drop number tiles. Slide the bag to merge them: your **highest tile decides your gun** (Pea Shooter → Shotgun → Rail Carbine → … → THE 2048), and the **sum of all tiles sets your fire rate**. Every merge heals a little. A full bag can't pick up loot, and if it locks up with no hammer to smash a tile, you have five seconds before it's game over.

Built with [three.js](https://threejs.org/) (orthographic 2D sprites) and [Vite](https://vitejs.dev/).

## Run it

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

## Controls

| Key | Action |
|---|---|
| W A S D | Move (your gun aims and fires on its own) |
| ← ↑ → ↓ | Slide the bag (2048) |
| Space | Hammer mode (time slows; arrows pick a tile, Space smashes) |
| Click / tap a tile | Smash it with a hammer |
| P / Esc | Pause |
| M | Mute |

## Tuning

All gameplay numbers live in [`src/config.js`](src/config.js): weapons, enemies and their AI, spawn rates, ring waves, the boss, sprite sheets and sounds.

## Credits

- Soldier sprites: [Tiago Melo](https://tiago-melo.itch.io/)
- Ground tiles: [SnowHex](https://snowhex.itch.io/)
- Effects: Super Pixel Effects Gigapack, Will Tice / [unTied Games](https://untiedgames.itch.io/)
- Music: "Mega Bot Bay" by [Ansimuz](https://ansimuz.itch.io/)
- Sound effects from [Pixabay](https://pixabay.com/sound-effects/) by [u_b32baquv5u](https://pixabay.com/users/u_b32baquv5u-50250111/), [Driken Stan](https://pixabay.com/users/driken5482-45721595/) and [freesound_community](https://pixabay.com/users/freesound_community-46691455/)

The art and audio belong to their creators and are included only as part of this game; they are not covered by this project's code and may not be redistributed separately.
