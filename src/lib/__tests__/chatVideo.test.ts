import { describe, expect, it } from "vitest";
import {
  BUNNY_VIDEO_STATUS,
  iChatCollection,
  laesChatVideo,
  maaSlette,
  MAKS_SEKUNDER,
  videoStatus,
} from "@/lib/chatVideo";

const GUID = "657bb740-a71b-4529-a012-528021c31a92";
const CHAT = "3f1c2a4e-9b8d-4c7a-a1e2-0d9f8b7c6a51";

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

describe("chatVideo — iChatCollection er fail-closed", () => {
  it("samme collection (uanset store bogstaver og mellemrum) er ja", () => {
    expect(iChatCollection({ collectionId: CHAT }, CHAT)).toBe(true);
    expect(iChatCollection({ collectionId: CHAT.toUpperCase() }, ` ${CHAT} `)).toBe(true);
  });

  it("en anden collection, ingen collection eller intet svar er nej", () => {
    expect(iChatCollection({ collectionId: "00000000-0000-4000-8000-000000000000" }, CHAT)).toBe(false);
    expect(iChatCollection({ collectionId: "" }, CHAT)).toBe(false);
    expect(iChatCollection({ collectionId: null }, CHAT)).toBe(false);
    expect(iChatCollection({}, CHAT)).toBe(false);
    expect(iChatCollection(null, CHAT)).toBe(false);
  });

  it("mangler chat-collectionen (secret'en), er svaret nej — også for en video uden collection", () => {
    expect(iChatCollection({ collectionId: CHAT }, "")).toBe(false);
    expect(iChatCollection({ collectionId: CHAT }, null)).toBe(false);
    expect(iChatCollection({ collectionId: "" }, "")).toBe(false);
    expect(iChatCollection({}, undefined)).toBe(false);
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
