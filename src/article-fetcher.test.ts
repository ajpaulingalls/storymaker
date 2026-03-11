import { describe, expect, test } from "bun:test";
import {
  getSiteConfig,
  getFullImageUrl,
  extractCaptionAndCredit,
  extractImagesFromContent,
  extractArticleData,
} from "./article-fetcher";

describe("getSiteConfig", () => {
  test("returns aje config for 'aje'", () => {
    const config = getSiteConfig("aje");
    expect(config.domain).toBe("www.aljazeera.com");
    expect(config.isRTL).toBe(false);
    expect(config.locale).toBe("en-US");
  });

  test("returns aja config for 'aja'", () => {
    const config = getSiteConfig("aja");
    expect(config.domain).toBe("www.aljazeera.net");
    expect(config.isRTL).toBe(true);
    expect(config.locale).toBe("ar-SA");
  });

  test("falls back to aje for unknown site", () => {
    const config = getSiteConfig("unknown");
    expect(config.domain).toBe("www.aljazeera.com");
  });
});

describe("getFullImageUrl", () => {
  test("returns null for null/undefined input", () => {
    expect(getFullImageUrl(null, "aje")).toBeNull();
    expect(getFullImageUrl(undefined, "aje")).toBeNull();
  });

  test("returns absolute URLs unchanged", () => {
    const url = "https://cdn.aljazeera.com/images/photo.jpg";
    expect(getFullImageUrl(url, "aje")).toBe(url);
  });

  test("prepends site domain for relative URLs (aje)", () => {
    expect(getFullImageUrl("/wp-content/uploads/photo.jpg", "aje")).toBe(
      "https://www.aljazeera.com/wp-content/uploads/photo.jpg",
    );
  });

  test("prepends site domain for relative URLs (aja)", () => {
    expect(getFullImageUrl("/wp-content/uploads/photo.jpg", "aja")).toBe(
      "https://www.aljazeera.net/wp-content/uploads/photo.jpg",
    );
  });

  test("returns null for empty string", () => {
    expect(getFullImageUrl("", "aje")).toBeNull();
  });
});

describe("extractCaptionAndCredit", () => {
  test("parses caption and credit in bracket format", () => {
    const result = extractCaptionAndCredit("A soldier walks through rubble [Reuters]");
    expect(result.caption).toBe("A soldier walks through rubble");
    expect(result.credit).toBe("Reuters");
  });

  test("handles caption with no credit", () => {
    const result = extractCaptionAndCredit("Just a plain caption");
    expect(result.caption).toBe("Just a plain caption");
    expect(result.credit).toBe("");
  });

  test("strips HTML tags from caption", () => {
    const result = extractCaptionAndCredit("<p>Caption with <strong>HTML</strong></p> [AP]");
    expect(result.caption).toBe("Caption with HTML");
    expect(result.credit).toBe("AP");
  });

  test("handles empty string", () => {
    const result = extractCaptionAndCredit("");
    expect(result.caption).toBe("");
    expect(result.credit).toBe("");
  });
});

describe("extractImagesFromContent", () => {
  test("extracts images from figure elements", () => {
    const html = `
      <figure>
        <img src="https://cdn.aljazeera.com/photo1.jpg" alt="Photo 1" />
        <figcaption>Caption one [Credit One]</figcaption>
      </figure>
    `;
    const images = extractImagesFromContent(html, "aje");
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("https://cdn.aljazeera.com/photo1.jpg");
    expect(images[0].alt).toBe("Photo 1");
    expect(images[0].caption).toBe("Caption one");
    expect(images[0].credit).toBe("Credit One");
  });

  test("handles multiple figures", () => {
    const html = `
      <figure><img src="https://cdn.aljazeera.com/a.jpg" alt="A" /></figure>
      <figure><img src="https://cdn.aljazeera.com/b.jpg" alt="B" /></figure>
    `;
    const images = extractImagesFromContent(html, "aje");
    expect(images).toHaveLength(2);
  });

  test("skips figures without img tags", () => {
    const html = `
      <figure><video src="video.mp4"></video></figure>
      <figure><img src="https://cdn.aljazeera.com/photo.jpg" alt="Photo" /></figure>
    `;
    const images = extractImagesFromContent(html, "aje");
    expect(images).toHaveLength(1);
  });

  test("resolves relative URLs using site domain", () => {
    const html = `<figure><img src="/uploads/photo.jpg" alt="Photo" /></figure>`;
    const images = extractImagesFromContent(html, "aja");
    expect(images).toHaveLength(1);
    expect(images[0].src).toBe("https://www.aljazeera.net/uploads/photo.jpg");
  });

  test("returns empty array for empty content", () => {
    expect(extractImagesFromContent("", "aje")).toEqual([]);
  });
});

describe("extractArticleData", () => {
  const minimalArticle = {
    title: "Test Title",
    excerpt: "Test excerpt",
    featuredImage: {
      sourceUrl: "https://cdn.aljazeera.com/photo.jpg",
      caption: "Image caption",
      credit: "Image credit",
      alt: "Image alt",
    },
    primaryCategoryTermName: "News",
    primaryWhereTermName: "Gaza",
    primaryTagsTermName: "Palestine",
    date: "2024-01-15T12:00:00Z",
  };

  test("maps basic article fields", () => {
    const data = extractArticleData(minimalArticle, "aje");
    expect(data.title).toBe("Test Title");
    expect(data.excerpt).toBe("Test excerpt");
    expect(data.imageUrl).toBe("https://cdn.aljazeera.com/photo.jpg");
    expect(data.category).toBe("News");
    expect(data.location).toBe("Gaza");
    expect(data.tag).toBe("Palestine");
    expect(data.date).toBe("2024-01-15T12:00:00.000Z");
  });

  test("prefers socialMediaImage 16:9 over featuredImage", () => {
    const article = {
      ...minimalArticle,
      socialMediaImage: {
        sizes: [
          { crop: "arc-image-4-3", url: "https://cdn.aljazeera.com/4x3.jpg" },
          { crop: "arc-image-16-9-1920", url: "https://cdn.aljazeera.com/16x9.jpg" },
        ],
      },
    };
    const data = extractArticleData(article, "aje");
    expect(data.imageUrl).toBe("https://cdn.aljazeera.com/16x9.jpg");
  });

  test("sets isRTL and source for aje site", () => {
    const data = extractArticleData(minimalArticle, "aje");
    expect(data.isRTL).toBe(false);
    expect(data.source).toBe("Al Jazeera");
    expect(data.site).toBe("aje");
  });

  test("sets isRTL and source for aja site", () => {
    const data = extractArticleData(minimalArticle, "aja");
    expect(data.isRTL).toBe(true);
    expect(data.source).toBe("الجزيرة");
    expect(data.site).toBe("aja");
  });

  test("uses source from article when available", () => {
    const article = { ...minimalArticle, source: [{ name: "AFP" }] };
    const data = extractArticleData(article, "aje");
    expect(data.source).toBe("AFP");
  });

  test("uses writeInAuthor as fallback source", () => {
    const article = { ...minimalArticle, writeInAuthor: "John Doe" };
    const data = extractArticleData(article, "aje");
    expect(data.source).toBe("John Doe");
  });

  test("handles missing optional fields gracefully", () => {
    const data = extractArticleData({}, "aje");
    expect(data.title).toBe("");
    expect(data.excerpt).toBe("");
    expect(data.imageUrl).toBeNull();
    expect(data.date).toBeNull();
    expect(data.isBreaking).toBe(false);
    expect(data.isLive).toBe(false);
    expect(data.additionalImages).toEqual([]);
    expect(data.summaryPoints).toEqual([]);
  });
});
