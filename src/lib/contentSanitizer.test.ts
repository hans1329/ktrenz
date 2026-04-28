import { describe, it, expect } from "vitest";
import { isMostlyInScript, sanitizeDescription } from "./contentSanitizer";

describe("sanitizeDescription — null/empty inputs", () => {
  it.each([null, undefined, "", "   "])("returns null for %p", (input) => {
    expect(sanitizeDescription(input)).toBeNull();
  });
});

describe("sanitizeDescription — code/script leak detection", () => {
  it("drops jQuery scroll snippet (the actual leak from production)", () => {
    const raw =
      "// 기사면 상단 네비게이션 호출 articleHeader.setScroll(); $(window).scroll(function() { var currY = $(this).scrollTop(); var postHeight = $(this).height(); var scrollHeight = $('body').height(); var scrollPercent = (currY / (scrollHeight - postHeight)) * 100; $('.aht-bar').css('width', scrollPercent +\"%\"); });";
    expect(sanitizeDescription(raw)).toBeNull();
  });

  it("drops description starting with `//` line comment", () => {
    expect(sanitizeDescription("// some leftover code\n more text")).toBeNull();
  });

  it("drops jQuery `$(window)` patterns", () => {
    expect(
      sanitizeDescription("$(window).on('load', function() { console.log(1); });"),
    ).toBeNull();
  });

  it("drops `function() {` patterns", () => {
    expect(
      sanitizeDescription("setTimeout(function() { doSomething(); }, 100);"),
    ).toBeNull();
  });

  it("drops CSS rules at the start", () => {
    expect(sanitizeDescription(".header { color: red; padding: 10px; }")).toBeNull();
    expect(sanitizeDescription("#main-id { display: flex; }")).toBeNull();
  });

  it("drops Mustache template fragments", () => {
    expect(sanitizeDescription("Hello {{#if user}}there{{/if}}!")).toBeNull();
  });

  it("drops descriptions with multiple `var x =` declarations", () => {
    expect(
      sanitizeDescription("var a = 1; var b = 2; do something with them"),
    ).toBeNull();
  });
});

describe("sanitizeDescription — editorial boilerplate stripping", () => {
  it("strips Newsis-style byline", () => {
    const raw = "[서울=뉴시스]김기자 기자 = 본문 내용입니다.";
    expect(sanitizeDescription(raw, { uiLanguage: "ko" })).toBe("본문 내용입니다.");
  });

  it("strips trailing email + DB prohibition notice", () => {
    const raw = "기사 본문입니다. reporter@news.com *재판매 및 DB 금지";
    expect(sanitizeDescription(raw, { uiLanguage: "ko" })).toBe("기사 본문입니다.");
  });

  it("strips photo credit line with date", () => {
    const raw = "본문이 여기 있습니다. (사진 = 회사 제공) 2026.04.27.";
    expect(sanitizeDescription(raw, { uiLanguage: "ko" })).toBe("본문이 여기 있습니다.");
  });
});

describe("sanitizeDescription — happy path", () => {
  it("passes through valid Korean prose unchanged", () => {
    const raw =
      "그룹 비투비(BTOB) 출신 아티스트 정일훈(ILHOON)이 새로운 싱글로 찾아왔다. 지난 24일 정일훈의 새로운 싱글 '클로젯(closet)'은 이별을 겪은 뒤 옷장 속에 남아있는 옛 연인의 흔적들을 모티프로 하고 있다.";
    const out = sanitizeDescription(raw, { uiLanguage: "ko" });
    expect(out).toBe(raw);
  });

  it("truncates long text with an ellipsis at maxLength", () => {
    const raw = "한".repeat(500);
    const out = sanitizeDescription(raw, { uiLanguage: "ko", maxLength: 100 });
    expect(out).not.toBeNull();
    expect(out!.length).toBe(101);
    expect(out!.endsWith("…")).toBe(true);
  });
});

describe("sanitizeDescription — language gating", () => {
  it("hides Korean text when UI is English", () => {
    const raw =
      "그룹 비투비(BTOB) 출신 아티스트 정일훈이 새로운 싱글로 찾아왔다.";
    expect(sanitizeDescription(raw, { uiLanguage: "en" })).toBeNull();
  });

  it("hides English text when UI is Korean", () => {
    const raw =
      "Korean Pop singer Jung Il-hoon, formerly of BTOB, returned with a new single.";
    expect(sanitizeDescription(raw, { uiLanguage: "ko" })).toBeNull();
  });

  it("allows pass-through when uiLanguage is omitted (no language gate)", () => {
    const raw = "그룹 비투비 출신 아티스트가 돌아왔다.";
    expect(sanitizeDescription(raw)).toBe(raw);
  });

  it("allows mixed text with English brand names mixed into Korean prose", () => {
    // The CRAVITY screenshot description: heavy Korean with bracketed English.
    const raw =
      "▲ 크래비티 크래비티(CRAVITY)가 신곡 'AWAKE(어웨이크)' 뮤직비디오 티저를 공개하며 컴백 열기를 끌어올렸다.";
    const out = sanitizeDescription(raw, { uiLanguage: "ko" });
    expect(out).not.toBeNull();
    expect(out).toContain("크래비티");
  });
});

describe("isMostlyInScript", () => {
  it("Korean prose is mostly Hangul", () => {
    expect(isMostlyInScript("그룹 비투비 출신 아티스트가 돌아왔다.", "ko")).toBe(true);
    expect(isMostlyInScript("그룹 비투비 출신 아티스트가 돌아왔다.", "en")).toBe(false);
  });

  it("English prose is mostly Latin", () => {
    expect(isMostlyInScript("CRAVITY drops new single AWAKE.", "en")).toBe(true);
    expect(isMostlyInScript("CRAVITY drops new single AWAKE.", "ko")).toBe(false);
  });

  it("Japanese kana detection separates from pure-kanji (zh)", () => {
    expect(isMostlyInScript("こんにちは世界", "ja")).toBe(true);
    expect(isMostlyInScript("北京天气很好", "zh")).toBe(true);
    expect(isMostlyInScript("北京天气很好", "ja")).toBe(false);
  });

  it("punctuation/digits/spaces don't bias the result", () => {
    expect(isMostlyInScript("   123 !@# ", "en")).toBe(false);
    expect(isMostlyInScript("a", "en")).toBe(true);
  });
});
