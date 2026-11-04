import { describe, expect, it } from "vitest";
import { insertAt, renderRichText, stripRichText, wrapSelection } from "./template-preview";

describe("template rich text", () => {
  it("escapes HTML and renders bold, italic and links", () => {
    const html = renderRichText("<b>x</b> **Hi** _there_ [book](https://a.example.com/x)\nok");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("<strong>Hi</strong>");
    expect(html).toContain("<em>there</em>");
    expect(html).toContain('href="https://a.example.com/x"');
    expect(html).toContain("<br />");
  });

  it("does not turn placeholders with underscores into italics", () => {
    expect(renderRichText("Hi {{patient_name}} at {{start_time}}")).not.toContain("<em>");
  });

  it("strips markup for SMS", () => {
    expect(stripRichText("**Hi** [here](https://x.example.com)")).toBe("Hi here https://x.example.com");
  });

  it("inserts and wraps at the cursor", () => {
    expect(insertAt("Hello world", 6, 6, "{{x}} ")).toEqual({ value: "Hello {{x}} world", caret: 12 });
    expect(wrapSelection("make bold", 5, 9, "**").value).toBe("make **bold**");
  });
});
