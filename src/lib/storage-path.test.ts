import { describe, expect, it } from "vitest";
import { isStoragePathAllowed } from "@/lib/storage-path";

const USER_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("isStoragePathAllowed", () => {
  it("accepte un chemin du dossier de l'utilisateur", () => {
    expect(isStoragePathAllowed(`${USER_ID}/video-1/file.mp4`, USER_ID)).toBe(true);
    expect(isStoragePathAllowed(`${USER_ID}/file.mp4`, USER_ID)).toBe(true);
  });

  it("refuse un chemin hors du dossier de l'utilisateur", () => {
    expect(isStoragePathAllowed("other-user/file.mp4", USER_ID)).toBe(false);
    expect(isStoragePathAllowed("file.mp4", USER_ID)).toBe(false);
    expect(isStoragePathAllowed("", USER_ID)).toBe(false);
  });

  it("refuse les segments relatifs ou vides", () => {
    expect(isStoragePathAllowed(`${USER_ID}/../other/file.mp4`, USER_ID)).toBe(false);
    expect(isStoragePathAllowed(`${USER_ID}/./file.mp4`, USER_ID)).toBe(false);
    expect(isStoragePathAllowed(`${USER_ID}//file.mp4`, USER_ID)).toBe(false);
  });
});
