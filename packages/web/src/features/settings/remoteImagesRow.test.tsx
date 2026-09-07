// The Settings side of #149: whether remote images load is a preference, and
// it sits with the other viewing preference rather than in the header of every
// message.
//
// Rendered against the DOM harness, and against the whole General card rather
// than the row alone — "beside Theme" is half of what the issue asks for, and a
// row rendered on its own cannot answer it.
import { afterEach, describe, expect, test } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  REMOTE_IMAGES_STORAGE_KEY,
  readRemoteImagesPreference,
  writeRemoteImagesPreference,
} from "../preferences/remoteImages";
import { GeneralCard } from "./GeneralCard";

afterEach(() => localStorage.removeItem(REMOTE_IMAGES_STORAGE_KEY));

const options = () =>
  screen
    .getByRole("radiogroup", { name: "Remote images" })
    .querySelectorAll<HTMLButtonElement>("[role='radio']");

const choose = (label: string) => {
  const option = [...options()].find((button) => button.textContent === label);
  if (!option) throw new Error(`no ${label} option`);
  fireEvent.click(option);
};

const chosen = () =>
  [...options()].find((button) => button.getAttribute("aria-checked") === "true")?.textContent;

describe("where the preference lives", () => {
  test("the General card offers it beside Theme", () => {
    render(<GeneralCard />);

    const groups = screen.getAllByRole("radiogroup").map((el) => el.getAttribute("aria-label"));
    expect(groups).toEqual(["Theme", "Remote images"]);
  });

  test("the row says what it is about", () => {
    render(<GeneralCard />);

    expect(screen.getByText("Remote images")).toBeDefined();
  });
});

describe("the choice it offers", () => {
  test("is show-by-default or hide-by-default, showing by default", () => {
    render(<GeneralCard />);

    expect([...options()].map((button) => button.textContent)).toEqual(["Show", "Hide"]);
    expect(chosen()).toBe("Show");
  });

  test("picking Hide is remembered, and picking Show again undoes it", () => {
    render(<GeneralCard />);

    choose("Hide");
    expect(chosen()).toBe("Hide");
    expect(readRemoteImagesPreference()).toBe("hide");

    choose("Show");
    expect(chosen()).toBe("Show");
    expect(readRemoteImagesPreference()).toBe("show");
  });

  test("a stored choice is what a freshly loaded page shows", () => {
    writeRemoteImagesPreference("hide");

    render(<GeneralCard />);

    expect(chosen()).toBe("Hide");
  });
});
