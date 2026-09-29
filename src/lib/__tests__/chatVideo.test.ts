import { describe, expect, it } from "vitest";
import {
  BUNNY_VIDEO_STATUS,
  erAfspillelig,
  iChatBibliotek,
  laesChatVideo,
  maaSlette,
  MAKS_SEKUNDER,
  videoStatus,
} from "@/lib/chatVideo";

const GUID = "657bb740-a71b-4529-a012-528021c31a92";
/** Chat-biblioteket «boardroom-chat» (29/9) og Hjemmebanes delte bibliotek. */
const CHAT_BIBLIOTEK = "765771";
const DELT_BIBLIOTEK = 720547;

describe("chatVideo — laesChatVideo læser KUN context_meta.video.guid", () => {
  it("et uuid under video.guid er en video — normaliseret til små bogstaver", () => {
    expect(laesChatVideo({ video: { guid: GUID } })).toEqual({ guid: GUID });
    expect(laesChatVideo({ video: { guid: GUID.toUpperCase() } })).toEqual({ guid: GUID });
    expect(laesChatVideo({ attachments: [], video: { guid: GUID, laengde: 42 } })).toEqual({ guid: GUID });
  });

  it("ingen context_meta, ingen video-nøgle eller en video uden guid er ingen video", () => {
    for (const meta of [null, undefined, "tekst", 42, [], {}, { attachments: [{ name: "a" }] }, { video: null }, { video: {} }, { video: [] }, { video: GUID }]) {
      expect(laesChatVideo(meta), JSON.stringify(meta)).toBeNull();
    }
  });

  it("en guid, der ikke er et uuid, er ingen video — heller ikke med mellemrum eller i en anden nøgle", () => {
    for (const guid of ["", "abc", ` ${GUID}`, `${GUID} `, `${GUID}x`, 42, null, { guid: GUID }]) {
      expect(laesChatVideo({ video: { guid } }), JSON.stringify(guid)).toBeNull();
    }
    expect(laesChatVideo({ video: { id: GUID } })).toBeNull();
    expect(laesChatVideo({ guid: GUID })).toBeNull();
  });
});

describe("chatVideo — videoStatus ud fra VIDEOOBJEKTETS status og availableResolutions", () => {
  it("objektets nummerering står som konstanter (ikke webhookens)", () => {
    expect(BUNNY_VIDEO_STATUS).toEqual({
      CREATED: 0, UPLOADED: 1, PROCESSING: 2, TRANSCODING: 3, FINISHED: 4,
      ERROR: 5, UPLOAD_FAILED: 6, JIT_SEGMENTING: 7, JIT_PLAYLISTS_CREATED: 8,
    });
  });

  it("4 Finished er «klar»", () => {
    expect(videoStatus({ status: 4, availableResolutions: "" })).toBe("klar");
    expect(videoStatus({ status: 4 })).toBe("klar");
  });

  it("en færdig opløsning er «klar», uanset status (Early-Play er FRA)", () => {
    for (const status of [0, 1, 2, 3, 7, 8, undefined]) {
      expect(videoStatus({ status, availableResolutions: "360p" }), String(status)).toBe("klar");
    }
    expect(videoStatus({ status: 3, availableResolutions: "360p,720p" })).toBe("klar");
    expect(videoStatus({ status: 3, availableResolutions: " , 240p" })).toBe("klar");
  });

  it("«klar» dømmes før «fejlet»: en opløsning er afspilbar, også ved status 5", () => {
    expect(videoStatus({ status: 5, availableResolutions: "360p" })).toBe("klar");
  });

  it("5 Error og 6 UploadFailed uden opløsning er «fejlet»", () => {
    expect(videoStatus({ status: 5, availableResolutions: "" })).toBe("fejlet");
    expect(videoStatus({ status: 6 })).toBe("fejlet");
    expect(videoStatus({ status: 6, availableResolutions: null })).toBe("fejlet");
  });

  it("0–3, 7 og 8 uden opløsning er «behandles»", () => {
    for (const status of [0, 1, 2, 3, 7, 8]) {
      expect(videoStatus({ status, availableResolutions: "" }), String(status)).toBe("behandles");
    }
  });

  it("tom eller kun kommaer i availableResolutions er ingen opløsning", () => {
    for (const res of ["", " ", ",", " , ", null, undefined, 360, ["360p"]]) {
      expect(videoStatus({ status: 3, availableResolutions: res }), JSON.stringify(res)).toBe("behandles");
    }
  });

  it("et ukendt tal, en streng som status eller intet svar er «behandles»", () => {
    expect(videoStatus({ status: 99 })).toBe("behandles");
    expect(videoStatus({ status: "4" })).toBe("behandles");
    expect(videoStatus(null)).toBe("behandles");
    expect(videoStatus(undefined)).toBe("behandles");
    expect(videoStatus("klar")).toBe("behandles");
    expect(videoStatus([])).toBe("behandles");
  });
});

describe("chatVideo — erAfspillelig: Bunnys play data (isPlayable), kun et ordret true", () => {
  it("isPlayable === true er ja", () => {
    expect(erAfspillelig({ isPlayable: true })).toBe(true);
    expect(erAfspillelig({ isPlayable: true, isPlaylistPlayable: false, preferredPlaybackSource: "Original" })).toBe(true);
  });
  it("false, mangler, «true» som streng, 1, null, intet svar eller et array er nej", () => {
    for (const d of [{ isPlayable: false }, {}, { isPlayable: "true" }, { isPlayable: 1 }, { isPlaylistPlayable: true }, null, undefined, [], "ja"]) {
      expect(erAfspillelig(d), JSON.stringify(d)).toBe(false);
    }
  });
});

describe("chatVideo — videoStatus med play data (JIT): afspillelig før nogen opløsning er færdig", () => {
  it("status 7 (JitSegmenting) og 8 (JitPlaylistsCreated) er ALDRIG «klar» i sig selv — dokumentationen giver dem kun et navn", () => {
    for (const status of [BUNNY_VIDEO_STATUS.JIT_SEGMENTING, BUNNY_VIDEO_STATUS.JIT_PLAYLISTS_CREATED]) {
      expect(videoStatus({ status, availableResolutions: "" })).toBe("behandles");
      expect(videoStatus({ status, availableResolutions: null }, null)).toBe("behandles");
      expect(videoStatus({ status }, { isPlayable: false })).toBe("behandles");
    }
  });
  it("play data isPlayable === true gør videoen «klar» — uanset status 0–3, 7, 8", () => {
    for (const status of [0, 1, 2, 3, 7, 8, undefined]) {
      expect(videoStatus({ status, availableResolutions: "" }, { isPlayable: true }), String(status)).toBe("klar");
    }
  });
  it("«klar» dømmes før «fejlet» også gennem play data; uden play data er 5/6 stadig «fejlet»", () => {
    expect(videoStatus({ status: 5 }, { isPlayable: true })).toBe("klar");
    expect(videoStatus({ status: 5 }, { isPlayable: false })).toBe("fejlet");
    expect(videoStatus({ status: 6 }, null)).toBe("fejlet");
  });
  it("uden play data er dommen som før: 4 eller en opløsning", () => {
    expect(videoStatus({ status: 4 })).toBe("klar");
    expect(videoStatus({ status: 2, availableResolutions: "480p" })).toBe("klar");
    expect(videoStatus({ status: 2, availableResolutions: "" })).toBe("behandles");
  });
});

describe("chatVideo — iChatBibliotek er fail-closed (videoLibraryId = chat-bibliotekets id)", () => {
  it("samme bibliotek er ja — secret'en som streng (med mellemrum) eller tal", () => {
    expect(iChatBibliotek({ videoLibraryId: 765771 }, CHAT_BIBLIOTEK)).toBe(true);
    expect(iChatBibliotek({ videoLibraryId: 765771 }, ` ${CHAT_BIBLIOTEK} `)).toBe(true);
    expect(iChatBibliotek({ videoLibraryId: 765771 }, 765771)).toBe(true);
  });
  it("Hjemmebanes bibliotek, intet bibliotek, et id som streng i svaret, eller intet svar er nej", () => {
    expect(iChatBibliotek({ videoLibraryId: DELT_BIBLIOTEK }, CHAT_BIBLIOTEK)).toBe(false);
    expect(iChatBibliotek({ videoLibraryId: "765771" }, CHAT_BIBLIOTEK)).toBe(false);
    expect(iChatBibliotek({ videoLibraryId: null }, CHAT_BIBLIOTEK)).toBe(false);
    expect(iChatBibliotek({ videoLibraryId: 765771.5 }, CHAT_BIBLIOTEK)).toBe(false);
    expect(iChatBibliotek({}, CHAT_BIBLIOTEK)).toBe(false);
    expect(iChatBibliotek(null, CHAT_BIBLIOTEK)).toBe(false);
    expect(iChatBibliotek([], CHAT_BIBLIOTEK)).toBe(false);
  });
  it("mangler secret'en, eller er den ikke et helt positivt tal, er svaret nej — også for en video i biblioteket", () => {
    for (const c of ["", null, undefined, "0", "-1", "abc", "765771x", "7657.71", 0, -765771, Number.NaN]) {
      expect(iChatBibliotek({ videoLibraryId: 765771 }, c as never), String(c)).toBe(false);
    }
  });
});

describe("chatVideo — maaSlette: kun afsenderen eller en admin", () => {
  const A = "11111111-1111-4111-8111-111111111111";
  const B = "22222222-2222-4222-8222-222222222222";

  it("afsenderen må", () => expect(maaSlette({ callerId: A, senderId: A, erAdmin: false })).toBe(true));
  it("en admin må, også når hun ikke er afsender", () => expect(maaSlette({ callerId: B, senderId: A, erAdmin: true })).toBe(true));
  it("en anden må ikke", () => expect(maaSlette({ callerId: B, senderId: A, erAdmin: false })).toBe(false));
  it("uden afsender må ingen, der ikke er admin", () => {
    expect(maaSlette({ callerId: A, senderId: null, erAdmin: false })).toBe(false);
    expect(maaSlette({ callerId: "", senderId: "", erAdmin: false })).toBe(false);
    expect(maaSlette({ callerId: A, senderId: undefined, erAdmin: false })).toBe(false);
  });
});

describe("chatVideo — loftet", () => {
  it("højst 3 minutter", () => expect(MAKS_SEKUNDER).toBe(180));
});
