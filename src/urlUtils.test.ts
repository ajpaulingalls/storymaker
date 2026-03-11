import { describe, expect, test } from "bun:test";
import {
  PostType,
  getPostTypeFromLink,
  getSlugFromLink,
  getSiteFromAJLink,
  getSiteFromLink,
  getUrlParams,
  getURLParam,
  getVideoIdFromYoutubeUrl,
  isYouTubeVideo,
  createResizedUrlWithGivenDimensions,
  normalizeAJUrl,
  isShortUrl,
  setUrlParameter,
  type SupportedSite,
  type AppEnvironment,
} from "./urlUtils";

describe("getPostTypeFromLink", () => {
  test("returns POST for standard news articles", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/some-article-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.POST);
  });

  test("returns OPINION for opinion articles", () => {
    const url = "https://www.aljazeera.com/opinions/2024/3/10/some-opinion-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.OPINION);
  });

  test("returns LIVE_BLOG for liveblog posts", () => {
    const url = "https://www.aljazeera.com/news/liveblog/2024/5/20/live-updates-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.LIVE_BLOG);
  });

  test("returns GALLERY for gallery posts", () => {
    const url = "https://www.aljazeera.com/gallery/2024/6/1/photo-gallery-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.GALLERY);
  });

  test("returns EPISODE for program links", () => {
    const url = "https://www.aljazeera.com/program/talk-to-al-jazeera/2024/2/14/some-episode";
    expect(getPostTypeFromLink(url)).toBe(PostType.EPISODE);
  });

  test("returns EPISODE for video/* paths (e.g. video/featured-documentaries)", () => {
    const url =
      "https://www.aljazeera.com/video/featured-documentaries/2024/7/3/some-documentary-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.EPISODE);
  });

  test("returns null for non-matching URLs", () => {
    expect(getPostTypeFromLink("https://example.com/article")).toBeNull();
  });

  test("handles dev/proxy URLs (azureedge)", () => {
    const url = "https://cdn.azureedge.net/news/2024/1/15/some-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.POST);
  });

  test("handles harbinger dev URLs", () => {
    const url = "https://develop.aje.aj-harbinger.com/news/2024/1/15/some-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.POST);
  });

  test("handles ajnet URLs", () => {
    const url = "https://www.ajnet.me/news/2024/1/15/some-slug";
    expect(getPostTypeFromLink(url)).toBe(PostType.POST);
  });

  test("handles URLs with query parameters", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/some-slug?ref=homepage";
    expect(getPostTypeFromLink(url)).toBe(PostType.POST);
  });
});

describe("getSlugFromLink", () => {
  test("extracts slug from standard URL", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/israel-war-on-gaza";
    expect(getSlugFromLink(url)).toBe("israel-war-on-gaza");
  });

  test("handles trailing slash", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/some-slug/";
    expect(getSlugFromLink(url)).toBe("some-slug");
  });

  test("strips query parameters", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/some-slug?ref=homepage&src=twitter";
    expect(getSlugFromLink(url)).toBe("some-slug");
  });

  test("handles URL-encoded slugs", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/hello%20world";
    expect(getSlugFromLink(url)).toBe("hello world");
  });

  test("removes .html extension", () => {
    const url = "https://www.aljazeera.com/news/2024/1/15/some-article.html";
    expect(getSlugFromLink(url)).toBe("some-article");
  });

  test("returns empty string for empty/undefined input", () => {
    expect(getSlugFromLink("")).toBe("");
  });
});

describe("getSiteFromAJLink", () => {
  test("returns aje for aljazeera.com", () => {
    expect(getSiteFromAJLink("https://www.aljazeera.com/news/2024/1/15/slug")).toBe("aje");
  });

  test("returns aja for www.aljazeera.net", () => {
    expect(getSiteFromAJLink("https://www.aljazeera.net/news/2024/1/15/slug")).toBe("aja");
  });

  test("returns chinese for chinese.aljazeera.net", () => {
    expect(getSiteFromAJLink("https://chinese.aljazeera.net/news/2024/1/15/slug")).toBe("chinese");
  });

  test("returns ajb for balkans.aljazeera.net", () => {
    expect(getSiteFromAJLink("https://balkans.aljazeera.net/news/2024/1/15/slug")).toBe("ajb");
  });

  test("returns null for non-AJ URLs", () => {
    expect(getSiteFromAJLink("https://www.example.com/news")).toBeNull();
  });

  test("handles http (non-https) URLs", () => {
    expect(getSiteFromAJLink("http://www.aljazeera.com/news/2024/1/15/slug")).toBe("aje");
  });
});

describe("getSiteFromLink", () => {
  const mockGetDomain = (_site: SupportedSite, _appEnv: AppEnvironment) => "";

  test("detects AJ links", () => {
    expect(getSiteFromLink("https://www.aljazeera.com/news/2024/1/15/slug", mockGetDomain)).toBe(
      "aje",
    );
  });

  test("detects dev (harbinger) links", () => {
    expect(
      getSiteFromLink("https://develop.aje.aj-harbinger.com/news/2024/1/15/slug", mockGetDomain),
    ).toBe("aje");
  });

  test("detects staging harbinger links", () => {
    expect(
      getSiteFromLink("https://staging.aja.aj-harbinger.com/news/2024/1/15/slug", mockGetDomain),
    ).toBe("aja");
  });

  test("returns null for unknown URLs", () => {
    expect(getSiteFromLink("https://www.example.com/news", mockGetDomain)).toBeNull();
  });
});

describe("getUrlParams", () => {
  test("parses query parameters", () => {
    const params = getUrlParams("https://example.com?foo=bar&baz=qux");
    expect(params).toEqual({ foo: "bar", baz: "qux" });
  });

  test("returns empty object for no query string", () => {
    expect(getUrlParams("https://example.com")).toEqual({});
  });

  test("handles URL-encoded values", () => {
    const params = getUrlParams("https://example.com?key=hello%20world");
    expect(params).toEqual({ key: "hello world" });
  });

  test("handles empty values", () => {
    const params = getUrlParams("https://example.com?key=");
    expect(params).toEqual({ key: "" });
  });

  test("ignores hash fragments", () => {
    const params = getUrlParams("https://example.com?foo=bar#section");
    expect(params).toEqual({ foo: "bar" });
  });
});

describe("getURLParam", () => {
  test("extracts a specific parameter", () => {
    expect(getURLParam("foo", "https://example.com?foo=bar&baz=qux")).toBe("bar");
  });

  test("returns null for missing parameter", () => {
    expect(getURLParam("missing", "https://example.com?foo=bar")).toBeNull();
  });

  test("decodes plus signs as spaces", () => {
    expect(getURLParam("q", "https://example.com?q=hello+world")).toBe("hello world");
  });

  test("returns null when parameter has no value", () => {
    expect(getURLParam("key", "https://example.com?key&other=val")).toBeNull();
  });
});

describe("getVideoIdFromYoutubeUrl", () => {
  test("extracts ID from youtube.com/watch?v= URL", () => {
    expect(getVideoIdFromYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  test("extracts ID from youtu.be short URL", () => {
    expect(getVideoIdFromYoutubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  test("extracts ID from /embed/ URL", () => {
    expect(getVideoIdFromYoutubeUrl("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  test("extracts ID from /shorts/ URL", () => {
    expect(getVideoIdFromYoutubeUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  test("returns empty string for non-YouTube URL", () => {
    expect(getVideoIdFromYoutubeUrl("https://vimeo.com/123456")).toBe("");
  });
});

describe("isYouTubeVideo", () => {
  test("returns true for YouTube URLs", () => {
    expect(isYouTubeVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  test("returns false for non-YouTube URLs", () => {
    expect(isYouTubeVideo("https://www.example.com/video")).toBe(false);
  });
});

describe("createResizedUrlWithGivenDimensions", () => {
  test("appends resize query params", () => {
    const result = createResizedUrlWithGivenDimensions(
      "https://cdn.aljazeera.com/images/photo.jpg",
      800,
      600,
    );
    expect(result).toBe("https://cdn.aljazeera.com/images/photo.jpg?quality=80&resize=800%2C600");
  });

  test("strips existing query params and adds resize", () => {
    const result = createResizedUrlWithGivenDimensions(
      "https://cdn.aljazeera.com/images/photo.jpg?existing=param",
      1920,
      1080,
    );
    expect(result).toBe("https://cdn.aljazeera.com/images/photo.jpg?quality=80&resize=1920%2C1080");
  });
});

describe("normalizeAJUrl", () => {
  test("adds www. to bare aljazeera.com", () => {
    expect(normalizeAJUrl("https://aljazeera.com/news")).toBe("https://www.aljazeera.com/news");
  });

  test("adds www. to bare aljazeera.net", () => {
    expect(normalizeAJUrl("https://aljazeera.net/news")).toBe("https://www.aljazeera.net/news");
  });

  test("does not modify already prefixed URL", () => {
    expect(normalizeAJUrl("https://www.aljazeera.com/news")).toBe("https://www.aljazeera.com/news");
  });

  test("does not add www. to subdomains like chinese.aljazeera.net", () => {
    expect(normalizeAJUrl("https://chinese.aljazeera.net/news")).toBe(
      "https://chinese.aljazeera.net/news",
    );
  });

  test("does not modify non-AJ domains", () => {
    expect(normalizeAJUrl("https://example.com/news")).toBe("https://example.com/news");
  });
});

describe("isShortUrl", () => {
  test("returns true for aje.io", () => {
    expect(isShortUrl("https://aje.io/abc123")).toBe(true);
  });

  test("returns true for aja.ws", () => {
    expect(isShortUrl("https://aja.ws/xyz")).toBe(true);
  });

  test("returns true for aje.news", () => {
    expect(isShortUrl("https://aje.news/code")).toBe(true);
  });

  test("returns false for full AJ URLs", () => {
    expect(isShortUrl("https://www.aljazeera.com/news/2024/1/15/slug")).toBe(false);
  });

  test("handles http (non-https) protocol", () => {
    expect(isShortUrl("http://aje.io/abc")).toBe(true);
  });
});

describe("setUrlParameter", () => {
  test("adds new parameter to URL without query string", () => {
    expect(setUrlParameter("https://example.com", "foo", "bar")).toBe(
      "https://example.com?foo=bar",
    );
  });

  test("adds parameter to URL with existing query string", () => {
    expect(setUrlParameter("https://example.com?existing=val", "foo", "bar")).toBe(
      "https://example.com?existing=val&foo=bar",
    );
  });

  test("replaces existing parameter value", () => {
    expect(setUrlParameter("https://example.com?foo=old", "foo", "new")).toBe(
      "https://example.com?foo=new",
    );
  });

  test("replaces only the target parameter, not others", () => {
    expect(setUrlParameter("https://example.com?a=1&foo=old&b=2", "foo", "new")).toBe(
      "https://example.com?a=1&foo=new&b=2",
    );
  });
});
