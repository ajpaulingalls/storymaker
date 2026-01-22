/**
 * Shared Story JavaScript
 * Handles GraphQL data fetching, rendering, and animations
 */

// Site configuration
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

// Get site config (defaults to aje)
function getSiteConfig(site) {
  return SITE_CONFIG[site] || SITE_CONFIG.aje;
}

// Get URL parameters (with debug override support)
function getParams() {
  // Check for debug URL params override (from debug server live mode)
  if (window.DEBUG_URL_PARAMS) {
    return {
      site: window.DEBUG_URL_PARAMS.site,
      postType: window.DEBUG_URL_PARAMS.postType,
      postSlug: window.DEBUG_URL_PARAMS.postSlug,
    };
  }
  
  const params = new URLSearchParams(window.location.search);
  return {
    site: params.get("site"),
    postType: params.get("postType"),
    postSlug: params.get("postSlug"),
  };
}

// Fetch article data from GraphQL endpoint
async function fetchArticleData(site, postType, postSlug) {
  const config = getSiteConfig(site);
  
  // Build the variables object
  const variables = {
    name: postSlug,
    postType: postType,
    preview: ""
  };
  
  // Construct the URL with proper encoding
  const params = new URLSearchParams({
    "wp-site": site,
    "operationName": "ArchipelagoSingleArticleQuery",
    "variables": JSON.stringify(variables),
    "extensions": "{}"
  });
  
  const url = `https://${config.domain}/graphql?${params.toString()}`;
  console.log("StoryMaker: Fetching from URL:", url);

  try {
    const response = await fetch(url, {
      headers: {
        "Wp-Site": site,
      },
    });

    console.log("StoryMaker: Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("StoryMaker: Error response body:", errorText);
      throw new Error(`Failed to fetch article: ${response.status} - ${errorText}`);
    }

    const json = await response.json();
    console.log("StoryMaker: Response received");
    
    if (!json.data || !json.data.article) {
      throw new Error("Invalid response structure: missing data.article");
    }
    
    return json.data.article;
  } catch (fetchError) {
    // Log detailed error info since Error objects don't serialize well
    console.error("StoryMaker: Fetch error name:", fetchError.name);
    console.error("StoryMaker: Fetch error message:", fetchError.message);
    throw fetchError;
  }
}

// Build full image URL from relative path
function getFullImageUrl(sourceUrl, site) {
  if (!sourceUrl) return null;
  if (sourceUrl.startsWith('http')) return sourceUrl;
  const config = getSiteConfig(site);
  return `https://${config.domain}${sourceUrl}`;
}

// Extract useful article data for templates
function extractArticleData(article, site) {
  const config = getSiteConfig(site);
  
  // Get the best image URL (prefer 16:9 for video format)
  let imageUrl = null;
  if (article.featuredImage?.sourceUrl) {
    imageUrl = getFullImageUrl(article.featuredImage.sourceUrl, site);
  }
  // Try to get a sized version optimized for our viewport
  if (article.socialMediaImage?.sizes) {
    const size16x9 = article.socialMediaImage.sizes.find(s => s.crop === 'arc-image-16-9-1920');
    if (size16x9) {
      imageUrl = getFullImageUrl(size16x9.url, site);
    }
  }

  return {
    title: article.title || '',
    excerpt: article.excerpt || article.subheading || '',
    imageUrl: imageUrl,
    imageCaption: article.featuredImage?.caption || article.featuredCaption || '',
    imageCredit: article.featuredImage?.credit || '',
    imageAlt: article.featuredImage?.alt || '',
    category: article.primaryCategoryTermName || '',
    location: article.primaryWhereTermName || '',
    date: article.date ? new Date(article.date) : null,
    source: article.source?.[0]?.name || article.writeInAuthor || (config.isRTL ? 'الجزيرة' : 'Al Jazeera'),
    isBreaking: article.isBreaking || false,
    isLive: article.isLive || false,
    isDeveloping: article.isDeveloping || false,
    // Site-specific data
    site: site,
    isRTL: config.isRTL,
    locale: config.locale,
    accentColor: config.accentColor,
    accentColorAlt: config.accentColorAlt,
  };
}

// Format date for display
function formatDate(date, locale = 'en-US') {
  if (!date) return '';
  return date.toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
}

// Default render function - can be overridden by templates
function defaultRenderContent(articleData) {
  const titleEl = document.getElementById("title");
  const excerptEl = document.getElementById("excerpt");

  if (titleEl) {
    titleEl.textContent = articleData.title;
  }

  if (excerptEl) {
    excerptEl.textContent = articleData.excerpt;
  }
}

// Default animation function - can be overridden by templates
async function defaultAnimateContent() {
  // Default 10 second animation
  return new Promise((resolve) => {
    setTimeout(resolve, 10000);
  });
}

// Main initialization function
async function initStory(options = {}) {
  const renderContent = options.renderContent || defaultRenderContent;
  const animateContent = options.animateContent || defaultAnimateContent;

  let hasSignaledReady = false;

  try {
    let articleData;
    
    // Check for debug mode with injected data
    if (window.DEBUG_ARTICLE_DATA) {
      console.log("StoryMaker: Debug mode - using injected article data");
      articleData = window.DEBUG_ARTICLE_DATA;
      // Convert date string back to Date object if needed
      if (articleData.date && !(articleData.date instanceof Date)) {
        articleData.date = new Date(articleData.date);
      }
    } else {
      // Normal mode or live debug mode - fetch from API
      const { site, postType, postSlug } = getParams();

      console.log("StoryMaker: Starting with params:", { site, postType, postSlug });

      if (!site || !postType || !postSlug) {
        throw new Error("Missing required URL parameters: site, postType, postSlug");
      }

      // Fetch article data
      console.log("StoryMaker: Fetching article data...");
      const article = await fetchArticleData(site, postType, postSlug);
      
      // Extract and format the data
      articleData = extractArticleData(article, site);
      
      // Apply debug flag overrides if present (from debug server live mode)
      if (window.DEBUG_FLAG_OVERRIDES) {
        console.log("StoryMaker: Applying debug flag overrides");
        if (window.DEBUG_FLAG_OVERRIDES.isBreaking) articleData.isBreaking = true;
        if (window.DEBUG_FLAG_OVERRIDES.isLive) articleData.isLive = true;
        if (window.DEBUG_FLAG_OVERRIDES.isDeveloping) articleData.isDeveloping = true;
      }
    }
    
    console.log("StoryMaker: Article data:", articleData.title);

    // Set RTL mode if needed
    if (articleData.isRTL) {
      document.documentElement.setAttribute("dir", "rtl");
      document.documentElement.setAttribute("lang", "ar");
      document.body.classList.add("rtl");
    }

    // Render content
    console.log("StoryMaker: Rendering content...");
    await renderContent(articleData);

    // Wait for fonts to be fully loaded
    console.log("StoryMaker: Waiting for fonts...");
    await document.fonts.ready;
    console.log("StoryMaker: Fonts loaded");

    // Give the DOM and images additional time to settle
    await new Promise(resolve => setTimeout(resolve, 300));

    // Signal that we're ready for recording
    console.log("StoryMaker: Signaling ready...");
    if (window.storyReady) {
      await window.storyReady();
      hasSignaledReady = true;
    } else {
      console.warn("StoryMaker: storyReady function not available");
    }

    // Small delay for frame-by-frame capture to initialize
    await new Promise(resolve => setTimeout(resolve, 50));

    // Start animations by removing the paused state
    console.log("StoryMaker: Starting animations...");
    document.body.classList.add("animations-started");

    // Run animations
    console.log("StoryMaker: Waiting for animation to complete...");
    await animateContent();
    console.log("StoryMaker: Animation complete");

    // Signal that we're done
    console.log("StoryMaker: Signaling done...");
    if (window.storyDone) {
      await window.storyDone();
    } else {
      console.warn("StoryMaker: storyDone function not available");
    }
  } catch (error) {
    // Log error details explicitly since Error objects don't serialize to JSON
    console.error("StoryMaker: Initialization failed!");
    console.error("StoryMaker: Error name:", error.name);
    console.error("StoryMaker: Error message:", error.message);
    if (error.stack) {
      console.error("StoryMaker: Error stack:", error.stack);
    }
    
    // If we haven't signaled ready yet, we need to signal both ready and done
    // so the recorder doesn't hang waiting
    if (!hasSignaledReady && window.storyReady) {
      console.log("StoryMaker: Signaling ready (error recovery)...");
      await window.storyReady();
    }
    
    // Signal done so recording stops
    if (window.storyDone) {
      console.log("StoryMaker: Signaling done (error recovery)...");
      await window.storyDone();
    }
  }
}

// Export for use in templates
window.StoryMaker = {
  initStory,
  getParams,
  getSiteConfig,
  fetchArticleData,
  extractArticleData,
  getFullImageUrl,
  formatDate,
  defaultRenderContent,
  defaultAnimateContent,
  SITE_CONFIG,
};
