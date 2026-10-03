/** Minimal typedeklaration for player.js@0.1.0 (ingen officielle typer).
    Pakken er CommonJS (module.exports = playerjs-objektet) — brug
    default-import: `import playerjs from "player.js"`.
    Bunny Stream-embeds eksponerer player.js-API'et (C1 trin 3, D4).
    Metoderne er playerjs.METHODS i dist/player-0.1.0.js; webinarrummet
    (skive 2, 30/9-2026) bruger også play/pause/mute/unmute/getMuted/
    getPaused/setCurrentTime og hændelsen «error». */
declare module "player.js" {
  export class Player {
    constructor(target: HTMLIFrameElement | string);
    on(event: "ready", callback: () => void): void;
    on(
      event: "timeupdate",
      callback: (data: { seconds: number; duration: number }) => void,
    ): void;
    on(event: "pause" | "ended" | "play" | "error", callback: () => void): void;
    off(event: string, callback?: (...args: unknown[]) => void): void;
    getCurrentTime(callback: (seconds: number) => void): void;
    getPaused(callback: (paused: boolean) => void): void;
    getMuted(callback: (muted: boolean) => void): void;
    setCurrentTime(seconds: number): void;
    play(): void;
    pause(): void;
    mute(): void;
    unmute(): void;
  }
  const playerjs: { Player: typeof Player };
  export default playerjs;
}
