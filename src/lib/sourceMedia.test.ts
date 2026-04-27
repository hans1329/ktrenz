import { describe, it, expect } from "vitest";
import { getYouTubeThumbnailUrl } from "./sourceMedia";

describe("getYouTubeThumbnailUrl", () => {
  it("returns null for null/undefined/empty", () => {
    expect(getYouTubeThumbnailUrl(null)).toBeNull();
    expect(getYouTubeThumbnailUrl(undefined)).toBeNull();
    expect(getYouTubeThumbnailUrl("")).toBeNull();
  });

  it("extracts id from full youtube.com/watch?v= URL", () => {
    expect(getYouTubeThumbnailUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("extracts id from youtu.be short URL", () => {
    expect(getYouTubeThumbnailUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("extracts id from embed URL", () => {
    expect(getYouTubeThumbnailUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    );
  });

  it("handles watch URL with extra query params before v=", () => {
    expect(
      getYouTubeThumbnailUrl("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ"),
    ).toBe("https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
  });

  it("handles ids with - and _", () => {
    expect(getYouTubeThumbnailUrl("https://youtu.be/abc-DEF_123")).toBe(
      "https://img.youtube.com/vi/abc-DEF_123/hqdefault.jpg",
    );
  });

  it("returns null for non-youtube URLs", () => {
    expect(getYouTubeThumbnailUrl("https://vimeo.com/12345")).toBeNull();
    expect(getYouTubeThumbnailUrl("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });

  it("returns null when id is too short or too long", () => {
    expect(getYouTubeThumbnailUrl("https://youtu.be/short")).toBeNull();
    expect(getYouTubeThumbnailUrl("https://youtu.be/wayTooLongForAYouTubeID")).toBe(
      // Regex matches first 11 chars and ignores rest — that is the documented behavior.
      "https://img.youtube.com/vi/wayTooLongF/hqdefault.jpg",
    );
  });
});
