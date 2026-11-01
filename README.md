![ROAM](game/public/logo/logo-cover.png)

# ROAM - Road Machiners

A community-driven wasteland truck RPG and software factory.

[![Play on itch.io](https://img.shields.io/badge/play-itch.io-FA5C5C?style=for-the-badge&logo=itchdotio&logoColor=white)](https://btseytlin.itch.io/road-machiners)[![Dev build](https://img.shields.io/badge/dev%20build-live-8B5A2B?style=for-the-badge&logo=googlechrome&logoColor=white)](https://roam-game.online/dev/)[![Factory dashboard](https://img.shields.io/badge/factory-dashboard-6B7A3A?style=for-the-badge&logo=grafana&logoColor=white)](https://roam-game.online/factory/)[![Telegram channel](https://img.shields.io/badge/telegram-channel-26A5E4?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/roam_game_dispatch)

[![Next release](https://img.shields.io/endpoint?url=https%3A%2F%2Froam-game.online%2Ffactory%2Fapi%2Fbadges%2Frelease&style=flat-square)](https://roam-game.online/factory/)[![Building](https://img.shields.io/endpoint?url=https%3A%2F%2Froam-game.online%2Ffactory%2Fapi%2Fbadges%2Fbuilding&style=flat-square)](https://roam-game.online/factory/)[![three.js and TypeScript](https://img.shields.io/badge/three.js-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://threejs.org/)

In ROAM you drive an armed truck across a post-apocalyptic wasteland. It's an immersive RPG sandbox: trade, scavenge ancient ruins, take jobs, rob other drivers or protect them. Inspired by Ex Machina, Space Rangers 2, Kenshi, Dustland Delivery and Caravaneer 2.

## The software factory

Imagine you could play the game, leave a feature request and see it appear in a few days? We have that in ROAM.

ROAM is built in public by a software factory of AI coding agents.

1. Anyone can send a bug report or an idea from inside the game, or file a [GitHub issue](https://github.com/ROAM-game-org/road-machiners/issues).
2. Agents triage each one. Bugs and small improvements go to work at once. A new feature goes to the [Telegram channel](https://t.me/roam_game_dispatch) as a proposal, and players vote on it with reactions.
3. Agents design, build and test the work. Players can play a voted feature's build and comment on it in the channel.
4. A human committee plays each result and approves or denies it.
5. Approved work goes to the [dev build](https://roam-game.online/dev/) at once and ships to [itch.io](https://btseytlin.itch.io/road-machiners) in a release a committee member orders.
6. A Hermes agent manages the factory and fixes its failures.

## Links

- [Play the release on itch.io](https://btseytlin.itch.io/road-machiners)
- [Play the dev build](https://roam-game.online/dev/), which has every approved change before release.
- [Factory dashboard](https://roam-game.online/factory/)
- [Telegram channel](https://t.me/roam_game_dispatch)
- [File an idea](https://github.com/btseytlin/road-machiners/issues/new)



## Layout

- `game/` holds the game. Start with `game/CLAUDE.md` and `game/docs/DESIGN.md`.
- `factory/` holds the factory. Start with `factory/README.md`.
- `quality/` holds the pre-commit quality gate. See `quality/README.md`.



## Run the game

```
cd game
npm ci
npm run dev
```

The game opens at [http://localhost:5173](http://localhost:5173).

## Contribute

Run `npm ci` at the root. Then run `npm run hooks:install` from the main checkout.

## License

ROAM is open source for non-commercial use. You can play, read, change and share it, but you cannot sell it or use it in a commercial product.

- The code is under the [PolyForm Noncommercial License 1.0.0](LICENSE).
- The assets are under [CC BY-NC-SA 4.0](LICENSE-ASSETS). Assets are art, 3D models, sound, music and game writing such as quests, lore and dialogue. Everything under `game/public/` is an asset.
- Files that come with their own license file, like the dashboard fonts, keep their own license.