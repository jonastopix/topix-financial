import { describe, expect, it } from "vitest";
import { extractYouTubeId } from "../youtube";

const ID = "dQw4w9WgXcQ";

describe("extractYouTubeId — gyldige former", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${ID}`],
    [`https://youtube.com/watch?v=${ID}`],
    [`https://m.youtube.com/watch?v=${ID}`],
    [`https://www.youtube.com/watch?v=${ID}&t=42s&list=PL123`],
    [`https://youtu.be/${ID}`],
    [`https://youtu.be/${ID}?t=10`],
    [`https://www.youtube.com/embed/${ID}`],
    [`https://www.youtube-nocookie.com/embed/${ID}`],
  ])("%s → id", (url) => {
    expect(extractYouTubeId(url)).toBe(ID);
  });
});

describe("extractYouTubeId — ugyldige/fremmede → null", () => {
  it.each([
    ["https://vimeo.com/123456789"],
    ["https://example.com/watch?v=" + ID],
    ["https://www.youtube.com/watch"], // intet v-param
    ["https://www.youtube.com/watch?v=forkort"], // ugyldigt id (for kort)
    ["https://youtu.be/"], // tomt id
    ["http://www.youtube.com/watch?v=" + ID], // ikke-https
    ["ikke en url"],
    [""],
    [null],
    [undefined],
  ])("%s → null", (url) => {
    expect(extractYouTubeId(url as string | null | undefined)).toBeNull();
  });
});
