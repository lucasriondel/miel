// The remote-images preference (#149). Browser-local, like the theme: a
// viewing preference rather than install configuration, so it has no schema, no
// endpoint and no migration behind it.
//
// What is here is the store alone — the default, what a stored value means and
// what an unreadable one falls back to. Which control writes it and what a
// message body does with it are rendered next door in
// `features/settings/remoteImagesRow.test.tsx` and
// `features/message-detail/remoteImagesPreference.test.tsx`.
import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_REMOTE_IMAGES,
  REMOTE_IMAGES_STORAGE_KEY,
  readRemoteImagesPreference,
  subscribeRemoteImagesPreference,
  writeRemoteImagesPreference,
} from "./remoteImages";

afterEach(() => localStorage.removeItem(REMOTE_IMAGES_STORAGE_KEY));

describe("the default", () => {
  test("is to show remote images", () => {
    expect(DEFAULT_REMOTE_IMAGES).toBe("show");
  });

  test("is what a browser that has never been told reads", () => {
    expect(readRemoteImagesPreference()).toBe("show");
  });
});

describe("what a browser remembers", () => {
  test("a written preference is what the next read answers", () => {
    writeRemoteImagesPreference("hide");
    expect(readRemoteImagesPreference()).toBe("hide");

    writeRemoteImagesPreference("show");
    expect(readRemoteImagesPreference()).toBe("show");
  });

  test("it survives a reload, since it is the stored value that is read", () => {
    writeRemoteImagesPreference("hide");
    expect(localStorage.getItem(REMOTE_IMAGES_STORAGE_KEY)).toBe("hide");
  });

  test("a value from some other version of this app is not a preference", () => {
    localStorage.setItem(REMOTE_IMAGES_STORAGE_KEY, "sometimes");
    expect(readRemoteImagesPreference()).toBe(DEFAULT_REMOTE_IMAGES);
  });
});

describe("subscribers", () => {
  test("a write tells everyone watching, so both pages agree", () => {
    const seen: string[] = [];
    const unsubscribe = subscribeRemoteImagesPreference(() =>
      seen.push(readRemoteImagesPreference()),
    );

    writeRemoteImagesPreference("hide");
    writeRemoteImagesPreference("show");
    unsubscribe();
    writeRemoteImagesPreference("hide");

    expect(seen).toEqual(["hide", "show"]);
  });
});
