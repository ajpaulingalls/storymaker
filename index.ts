import { parseArgs } from "./src/args";
import { startServer, stopServer } from "./src/server";
import { recordStory } from "./src/recorder";
import { dirname } from "path";

async function main() {
  console.log("StoryMaker - Video Story Generator\n");

  // Parse command line arguments
  const args = parseArgs();

  console.log("Configuration:");
  console.log(`  Template: ${args.template}`);
  console.log(`  Site: ${args.site}`);
  console.log(`  Post Type: ${args.postType}`);
  console.log(`  Post Slug: ${args.postSlug}`);
  console.log(`  Output: ${args.output}\n`);

  // Ensure output directory exists
  const outputDir = dirname(args.output);
  await Bun.$`mkdir -p ${outputDir}`.quiet();

  // Start local server to serve templates
  console.log("Starting local template server...");
  const { server, url } = await startServer({
    template: args.template,
    site: args.site,
    postType: args.postType,
    postSlug: args.postSlug,
  });
  console.log(`Server running at: ${url}\n`);

  try {
    // Record the story
    const result = await recordStory({
      url,
      outputPath: args.output,
      width: 1080,
      height: 1920,
    });

    if (result.success) {
      console.log(`\n✓ Story recorded successfully!`);
      console.log(`  Output: ${result.outputPath}`);
    } else {
      console.error(`\n✗ Recording failed: ${result.error}`);
      process.exit(1);
    }
  } finally {
    // Always stop the server
    console.log("\nStopping server...");
    stopServer(server);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
