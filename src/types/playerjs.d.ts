/** Minimal typedeklaration for player.js@0.1.0 (ingen officielle typer).
    Pakken er CommonJS (module.exports = playerjs-objektet) — brug
    default-import: `import playerjs from "player.js"`.
    Bunny Stream-embeds eksponerer player.js-API'et (C1 trin 3, D4). */
declare module "player.js" {
  export class Player {
    constructor(target: HTMLIFrameElement | string);
    on(event: "ready", callback: () => void): void;
    on(
      event: "timeupdate",
      callback: (data: { seconds: number; duration: number }) => void,
    ): void;
    on(event: "pause" | "ended" | "play", callback: () => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;
    getCurrentTime(callback: (seconds: number) => void): void;
  }
  const playerjs: { Player: typeof Player };
  export default playerjs;
}
