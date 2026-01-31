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
  hideTitle?: boolean;
  hideExcerpt?: boolean;
  hideImageCredit?: boolean;
  hideLocation?: boolean;
  hideTags?: boolean;
  hideStatusBadge?: boolean;
  hideLogo?: boolean;
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

  const json = await response.json();
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

  const json = await response.json();
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
  };
}

export async function fetchArticleDataForTemplate(options: FetchArticleOptions): Promise<ArticleData> {
  const { site, postType, postSlug, update } = options;
  if (!site || !postType || !postSlug) {
    throw new Error("Missing required parameters: site, postType, postSlug");
  }

  const article = await fetchArticleFromGraphQL(site, postType, postSlug);
  const articleData = extractArticleData(article, site);

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
