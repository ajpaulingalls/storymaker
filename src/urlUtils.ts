export enum PostType {
  BLOG = 'blog',
  EPISODE = 'episode',
  GALLERY = 'gallery',
  LIVE_BLOG = 'liveblog',
  LIVE_BLOG_UPDATE = 'liveblog-update',
  LONGFORM = 'longform',
  OPINION = 'opinion',
  PAGE = 'page',
  PODCAST = 'podcast',
  POST = 'post',
  PROGRAM = 'program',
  SERIES = 'series',
  VIDEO = 'video',
  EXTERNAL_ARTICLE = 'external-article',
}

export type SupportedLtrSite = 'aje' | 'ajb' | 'chinese';
export type SupportedRtlSite = 'aja';
export type SupportedSite = SupportedLtrSite | SupportedRtlSite;
export const WP_SITE_AJE: SupportedSite = 'aje';
export const WP_SITE_AJA: SupportedSite = 'aja';
export const WP_SITE_AJB: SupportedSite = 'ajb';
export const WP_SITE_AJC: SupportedSite = 'chinese';
export const SupportedSites = [
  WP_SITE_AJA,
  WP_SITE_AJE,
  WP_SITE_AJB,
  WP_SITE_AJC,
] as const;

export const SHORT_URL_DOMAINS = [
  'aja.ws',
  'ajb.me',
  'ajch.io',
  'aje.io',
  'aje.news',
  'aja.me',
];

export enum AppEnvironment {
  TEST = 'TEST',
  DEV = 'DEV',
  STAGING = 'STAGING',
  PROXY = 'PROXY',
  PROD = 'PROD',
}

const REGEX_PATTERNS = [
  /https?:\/\/\w+\.aljazeera.\w{3}\/([\w\-/]+)\/20[012]\d\/\d\d?\/\d\d?\/([^?]+)\??.*/,
  /https?:\/\/\w.+\.azureedge\.net\/([\w\-/]+)\/20[012]\d\/\d\d?\/\d\d?\/([^?]+)\??.*/,
  /https?:\/\/\w+\.\w+\.aj-harbinger\.com\/([\w\-/]+)\/20[012]\d\/\d\d?\/\d\d?\/([^?]+)\??.*/,
  /https?:\/\/\w+\.ajnet.\w{2}\/([\w\-/]+)\/20[012]\d\/\d\d?\/\d\d?\/([^?]+)\??.*/,
];

export function enumKeys<O extends object, K extends keyof O = keyof O>(
  obj: O,
): K[] {
  return Object.keys(obj).filter(k => Number.isNaN(+k)) as K[];
}

function getPostTypeFromFromRegex(link: string, pattern: string | RegExp) {
  const articleLinkMatcher = new RegExp(pattern, 'g');
  const matchesArticleLink = articleLinkMatcher.exec(link.toLowerCase());
  if (matchesArticleLink && matchesArticleLink.length > 1) {
    const pathPart = matchesArticleLink[1];
    if (!pathPart) {
      return PostType.POST;
    }

    if (pathPart.includes('program')) {
      return PostType.EPISODE;
    } else if (pathPart.includes('liveblog')) {
      return PostType.LIVE_BLOG;
    } else if (/^video\/[^/]+/.test(pathPart)) {
      // This indicates a program (e.g., video/featured-documentaries, video/101-east, etc.)
      // so the content is an episode, not a standalone video
      return PostType.EPISODE;
    }
    for (const type of enumKeys(PostType)) {
      if (pathPart.includes(PostType[type])) {
        return PostType[type];
      }
    }
    return PostType.POST;
  }
  return null;
}

export function getPostTypeFromLink(link: string): PostType | null {
  for (const regex of REGEX_PATTERNS) {
    const result = getPostTypeFromFromRegex(link, regex);
    if (result) {
      return result;
    }
  }
  return null;
}

export function getSlugFromLink(link: string): string {
  const parts = link?.split('?')[0]?.split('/');
  let slug = parts ? parts[parts.length - 1] ?? '' : '';
  if (link?.endsWith('/') || slug.startsWith('?')) {
    slug = parts?.[parts.length - 2] ?? '';
  }

  return decodeURIComponent(slug.replace(/.html/g, ''));
}

export function getSiteFromAJLink(url: string): SupportedSite | null {
  const siteMatcher = new RegExp(
    /https?:\/\/(([\w-]+)\.)?aljazeera\.(\w{2,3}).*/,
  );
  const matchesSite = siteMatcher.exec(url.toLowerCase());
  if (matchesSite && matchesSite.length > 3) {
    const subDomain = matchesSite[2];
    const tld = matchesSite[3];

    if (tld === 'com') {
      return WP_SITE_AJE;
    }
    switch (subDomain) {
      case 'www':
        return WP_SITE_AJA;
      case 'chinese':
        return WP_SITE_AJC;
      case 'balkans':
        return WP_SITE_AJB;
    }
  }
  return null;
}

function getSiteFromProxyLink(
  url: string,
  getDomain: (site: SupportedSite, appEnv: AppEnvironment) => string,
): SupportedSite | null {
  const proxyMatcher = new RegExp(
    /https?:\/\/(([\w-]+)\.(azureedge|ajnet)\.(\w{2,3}))/,
  );
  // proxyMatcher object as:
  // [
  //   'https://domain', e.g https://1-e8259.azureedge.net
  //   'domain', e.g 1-e8259.azureedge.net
  // ...
  // ]
  const proxyDomain = proxyMatcher.exec(url.toLowerCase())?.[1];
  if (proxyDomain) {
    for (const site of SupportedSites) {
      if (getDomain(site, AppEnvironment.PROXY).includes(proxyDomain)) {
        return site;
      }
    }
  }
  return null;
}

function getSiteFromDevLink(url: string): SupportedSite | null {
  const harbingerMatcher = new RegExp(
    /https?:\/\/(\w+)\.(\w+)\.aj-harbinger\.com.*/,
  );

  const matches = harbingerMatcher.exec(url.toLowerCase());

  if (matches && matches.length > 2) {
    const devOrStaging = matches[1];
    const devSite = matches[2];
    if (devOrStaging === 'develop' || devOrStaging === 'staging') {
      if (
        devSite === WP_SITE_AJE ||
        devSite === WP_SITE_AJA ||
        devSite === WP_SITE_AJB ||
        devSite === WP_SITE_AJC
      ) {
        return devSite;
      }
    }
  }
  return null;
}

export function getSiteFromLink(
  url: string,
  getDomain: (site: SupportedSite, appEnv: AppEnvironment) => string,
): SupportedSite | null {
  return (
    getSiteFromAJLink(url) ??
    getSiteFromProxyLink(url, getDomain) ??
    getSiteFromDevLink(url) ??
    null
  );
}

export function getUrlParams<
  T extends Record<string, string> = Record<string, string>,
>(url: string): Partial<T> {
  const params: Record<string, string> = {};
  const query = url.split('?')[1]?.split('#')[0];
  if (!query) {
    return params as Partial<T>;
  }
  const pairs = query.split('&');
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = value ? decodeURIComponent(value) : '';
    }
  }
  return params as Partial<T>;
}

export function getURLParam(parameterName: string, url: string) {
  const name = parameterName.replace(/[[\]]/g, '\\$&');
  const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
  const results = regex.exec(url);
  if (!results?.[2]) {
    return null;
  }
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

export function getVideoIdFromYoutubeUrl(url: string): string {
  const match =
    /(?:youtube(?:-nocookie)?\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)|s(?:horts))\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/; // nosonar
  const idMatch = match.exec(url);
  if (idMatch && idMatch.length > 1) {
    return idMatch[1] ?? '';
  }
  return '';
}

export function isYouTubeVideo(url: string): boolean {
  return getVideoIdFromYoutubeUrl(url) !== '';
}

export function createResizedUrlWithGivenDimensions(
  url: string,
  width: number,
  height: number,
) {
  const base = url?.split('?')[0];
  const paths = base?.split('/') ?? [];
  const lastPath = paths[paths.length - 1];
  if (lastPath !== undefined) {
    paths[paths.length - 1] = encodeURIComponent(lastPath);
  }
  return `${paths.join('/')}?quality=80&resize=${width}%2C${height}`;
}

export const normalizeAJUrl = (url: string) => {
  const allowedDomains = ['aljazeera.net', 'aljazeera.com', 'ajnet.me'];

  return url.replace(
    /^https?:\/\/(?!www\.)([^./]+\.[^./]+(?:\.[^./]+)*)/,
    (match, domain) => {
      // Only add www if domain has exactly 2 parts (no subdomain)
      const parts = domain.split('.');
      if (parts.length === 2) {
        if (allowedDomains.includes(domain)) {
          return match.replace(domain, `www.${domain}`);
        }
      }
      return match;
    },
  );
};

export const getLongUrlIfShortUrl = (url: string): Promise<string> => {
  if (!isShortUrl(url)) {
    return Promise.resolve(url);
  }
  return expandShortUrl(url);
};

export const isShortUrl = (url: string): boolean => {
  const withoutProtocol = url.replace(/^https?:\/\//, '');
  const hostname = withoutProtocol.split(/[/?#]/)[0] ?? '';
  return SHORT_URL_DOMAINS.includes(hostname);
};

export const expandShortUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetchWithTimeout(url, {
      method: 'HEAD',
      timeoutMs: 5000,
    });
    return response.url;
  } catch (error) {
    console.error('Failed to expand short URL:', url, error);
    return url; // Fallback to original
  }
};

// Helper function to set URL parameter (update existing or add new)
export const setUrlParameter = (
  url: string,
  paramName: string,
  paramValue: string,
): string => {
  const regex = new RegExp(`([?&])${paramName}=[^&]*`, 'g');
  if (url.match(regex)) {
    // Parameter exists, replace its value
    return url.replace(regex, `$1${paramName}=${paramValue}`);
  } else {
    // Parameter doesn't exist, add it with correct separator
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}${paramName}=${paramValue}`;
  }
};

export const fetchWithTimeout = (
  input: string | URL | Request,
  init?: RequestInit & {timeoutMs?: number},
): Promise<Response> => {
  const {timeoutMs = 10000, ...options} = init || {};
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(input, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timeoutId));
};
