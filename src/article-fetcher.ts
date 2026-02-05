export interface ArticleData {
  title: string;
  excerpt: string;
  imageUrl: string | null;
  imageCaption: string;
  imageCredit: string;
  imageAlt: string;
  category: string;
  categories: unknown[] | null;
  authors: unknown[] | null;
  location: string;
  tag: string;
  date: string | null;
  source: string;
  isBreaking: boolean;
  isLive: boolean;
  isDeveloping: boolean;
  site: string;
  isRTL: boolean;
  locale: string;
  accentColor: string;
  accentColorAlt: string;
  additionalImages: ArticleImage[];
  summaryPoints: string[];
  hideTitle?: boolean;
  hideExcerpt?: boolean;
  hideImageCredit?: boolean;
  hideLocation?: boolean;
  hideTags?: boolean;
  hideStatusBadge?: boolean;
  hideLogo?: boolean;
}

export interface ArticleImage {
  src: string;
  alt: string;
  caption: string;
  credit: string;
}

export interface FetchArticleOptions {
  site: string;
  postType: string;
  postSlug: string;
  update?: string;
}

const SITE_CONFIG = {
  aje: {
    domain: "www.aljazeera.com",
    isRTL: false,
    locale: "en-US",
    accentColor: "#fa9000",
    accentColorAlt: "#e76f51",
  },
  aja: {
    domain: "www.aljazeera.net",
    isRTL: true,
    locale: "ar-SA",
    accentColor: "#32a2ef",
    accentColorAlt: "#1a7cc7",
  },
};

function getSiteConfig(site: string) {
  return SITE_CONFIG[site as keyof typeof SITE_CONFIG] || SITE_CONFIG.aje;
}

function getFullImageUrl(sourceUrl: string | undefined | null, site: string): string | null {
  if (!sourceUrl) return null;
  if (sourceUrl.startsWith("http")) return sourceUrl;
  const config = getSiteConfig(site);
  return `https://${config.domain}${sourceUrl}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHtml(value: string): string {
  if (!value) return "";
  return normalizeWhitespace(value.replace(/<[^>]*>/g, " "));
}

function getAttributeValue(tag: string, attribute: string): string {
  const match = tag.match(new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1] || "";
}

function extractCaptionAndCredit(rawCaption: string): { caption: string; credit: string } {
  const captionText = stripHtml(rawCaption);
  const creditMatch = captionText.match(/\[([^\]]+)\]\s*$/);
  if (creditMatch) {
    return {
      caption: captionText.replace(/\s*\[[^\]]+\]\s*$/, "").trim(),
      credit: (creditMatch[1] || "").trim(),
    };
  }
  return { caption: captionText, credit: "" };
}

function extractImagesFromContent(content: string, site: string): ArticleImage[] {
  if (!content) return [];
  const figures = content.match(/<figure[\s\S]*?<\/figure>/gi) || [];
  const images: ArticleImage[] = [];

  for (const figure of figures) {
    const imgMatch = figure.match(/<img[\s\S]*?>/i);
    if (!imgMatch) continue;

    const imgTag = imgMatch[0];
    const src = getAttributeValue(imgTag, "src");
    if (!src) continue;

    const alt = getAttributeValue(imgTag, "alt");
    const figcaptionMatch = figure.match(/<figcaption[\s\S]*?<\/figcaption>/i);
    const { caption, credit } = extractCaptionAndCredit(figcaptionMatch?.[0] || "");

    const fullSrc = getFullImageUrl(src, site);
    if (!fullSrc) continue;

    images.push({
      src: fullSrc,
      alt,
      caption,
      credit,
    });
  }

  return images;
}

async function generateSummaryPoints(content: string): Promise<string[]> {
  const apiUrl = process.env.CORTEX_API_URL;
  const apiKey = process.env.CORTEX_API_KEY;
  if (!apiUrl || !apiKey) {
    console.warn("[Article Fetcher] Cortex API not configured");
    return [];
  }

  const text = stripHtml(content);
  if (!text) {
    return [];
  }

  const payload = {
    query:
      "query Format_summarization($text: String, $summaryFormat: String) {\n  format_summarization(text: $text, summaryFormat: $summaryFormat) {\n    result\n    resultData\n  }\n}",
    variables: {
      text,
      summaryFormat:
        "Format the summary in a short series of statements, separated by newlines, that can be displayed one at a time to present the core of the content.  Each statement should be a single phrase that is less than 80 characters long.",
    },
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "ocp-apim-subscription-key": apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[Article Fetcher] Cortex API error: ${response.status} - ${errorText}`);
      return [];
    }

    const json = (await response.json()) as {
      data?: { format_summarization?: { result?: unknown; resultData?: unknown } };
    };
    console.log(`[Article Fetcher] Cortex API response: ${JSON.stringify(json)}`);
    const resultData = json?.data?.format_summarization?.resultData;
    const result = json?.data?.format_summarization?.result;
    const rawResult = typeof result === "string" ? result : "";
    const rawResultData = typeof resultData === "string" ? resultData : "";

    if (rawResult) {
      const lines = rawResult
        .split(/\r?\n/)
        .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
        .filter(Boolean);
      if (lines.length) return lines;
    }

    if (rawResultData) {
      const parsed = JSON.parse(rawResultData);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean);
      }
    }

    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.warn(`[Article Fetcher] Cortex API request failed: ${message}`);
    return [];
  }
}

async function fetchArticleFromGraphQL(site: string, postType: string, postSlug: string) {
  const config = getSiteConfig(site);
  const variables = {
    name: postSlug,
    postType,
    preview: "",
  };
  const params = new URLSearchParams({
    "wp-site": site,
    operationName: "ArchipelagoSingleArticleQuery",
    variables: JSON.stringify(variables),
    extensions: "{}",
  });
  const url = `https://${config.domain}/graphql?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "Wp-Site": site,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch article: ${response.status} - ${errorText}`);
  }

  const json = (await response.json()) as { data?: { article?: Record<string, any> } };
  if (!json?.data?.article) {
    throw new Error("Invalid response structure: missing data.article");
  }

  return json.data.article;
}

async function fetchLiveBlogUpdate(site: string, postId: number) {
  const config = getSiteConfig(site);
  const variables = {
    postID: postId,
    postType: "liveblog-update",
    preview: "",
    isAmp: false,
  };
  const params = new URLSearchParams({
    "wp-site": site,
    operationName: "LiveBlogUpdateQuery",
    variables: JSON.stringify(variables),
    extensions: "{}",
  });
  const url = `https://${config.domain}/graphql?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      "Wp-Site": site,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch live blog update: ${response.status} - ${errorText}`);
  }

  const json = (await response.json()) as { data?: { posts?: Record<string, any> } };
  if (!json?.data?.posts) {
    throw new Error("Invalid live blog update response structure: missing data.posts");
  }

  return json.data.posts;
}

function extractArticleData(article: Record<string, any>, site: string): ArticleData {
  const config = getSiteConfig(site);

  let imageUrl: string | null = null;
  if (article.featuredImage?.sourceUrl) {
    imageUrl = getFullImageUrl(article.featuredImage.sourceUrl, site);
  }
  if (article.socialMediaImage?.sizes) {
    const size16x9 = article.socialMediaImage.sizes.find((size: { crop?: string }) => size.crop === "arc-image-16-9-1920");
    if (size16x9?.url) {
      imageUrl = getFullImageUrl(size16x9.url, site);
    }
  }

  return {
    title: article.title || "",
    excerpt: article.excerpt || article.subheading || "",
    imageUrl,
    imageCaption: article.featuredImage?.caption || article.featuredCaption || "",
    imageCredit: article.featuredImage?.credit || "",
    imageAlt: article.featuredImage?.alt || "",
    category: article.primaryCategoryTermName || "",
    categories: article.categories || article.categoryTerms || null,
    authors: article.author || null,
    location: article.primaryWhereTermName || "",
    tag: article.primaryTagsTermName || "",
    date: article.date ? new Date(article.date).toISOString() : null,
    source: article.source?.[0]?.name || article.writeInAuthor || (config.isRTL ? "الجزيرة" : "Al Jazeera"),
    isBreaking: article.isBreaking || false,
    isLive: article.isLive || false,
    isDeveloping: article.isDeveloping || false,
    site,
    isRTL: config.isRTL,
    locale: config.locale,
    accentColor: config.accentColor,
    accentColorAlt: config.accentColorAlt,
    additionalImages: [],
    summaryPoints: [],
  };
}

export async function fetchArticleDataForTemplate(options: FetchArticleOptions): Promise<ArticleData> {
  const { site, postType, postSlug, update } = options;
  if (!site || !postType || !postSlug) {
    throw new Error("Missing required parameters: site, postType, postSlug");
  }

  const article = await fetchArticleFromGraphQL(site, postType, postSlug);
  const articleData = extractArticleData(article, site);
  const content = typeof article?.content === "string" ? article.content : "";
  articleData.additionalImages = extractImagesFromContent(content, site);
  articleData.summaryPoints = await generateSummaryPoints(content);

  const updateId = update ? Number.parseInt(update, 10) : Number.NaN;
  const isLiveBlog = String(postType).toLowerCase() === "liveblog";
  if (isLiveBlog && Number.isInteger(updateId)) {
    const updateData = await fetchLiveBlogUpdate(site, updateId);
    if (updateData?.title) {
      articleData.title = updateData.title;
    }
    articleData.excerpt = "";
  }

  return articleData;
}
