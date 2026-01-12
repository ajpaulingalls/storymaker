export interface StoryMakerArgs {
  template: string;
  site: string;
  postType: string;
  postSlug: string;
  output: string;
}

export function parseArgs(): StoryMakerArgs {
  const args = Bun.argv.slice(2);
  const parsed: Partial<StoryMakerArgs> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case "--template":
        parsed.template = nextArg;
        i++;
        break;
      case "--site":
        parsed.site = nextArg;
        i++;
        break;
      case "--postType":
        parsed.postType = nextArg;
        i++;
        break;
      case "--postSlug":
        parsed.postSlug = nextArg;
        i++;
        break;
      case "--output":
        parsed.output = nextArg;
        i++;
        break;
    }
  }

  // Validate required arguments
  const required: (keyof StoryMakerArgs)[] = [
    "template",
    "site",
    "postType",
    "postSlug",
    "output",
  ];

  const missing = required.filter((key) => !parsed[key]);

  if (missing.length > 0) {
    console.error(`Missing required arguments: ${missing.join(", ")}`);
    console.error(`
Usage: bun run index.ts \\
  --template <template-name> \\
  --site <site-id> \\
  --postType <post-type> \\
  --postSlug <post-slug> \\
  --output <output-file.mp4>

Example:
  bun run index.ts \\
    --template default \\
    --site aje \\
    --postType post \\
    --postSlug some-article-slug \\
    --output ./output/story.mp4
`);
    process.exit(1);
  }

  return parsed as StoryMakerArgs;
}
