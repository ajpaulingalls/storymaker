import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

// Configuration from environment variables
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || "videos";

let containerClient: ContainerClient | null = null;

/**
 * Initialize the blob storage client.
 * Returns null if AZURE_STORAGE_CONNECTION_STRING is not set.
 */
function getContainerClient(): ContainerClient | null {
  if (!connectionString) {
    console.warn(
      "[Blob Storage] AZURE_STORAGE_CONNECTION_STRING not set - blob storage disabled"
    );
    return null;
  }

  if (!containerClient) {
    const blobServiceClient =
      BlobServiceClient.fromConnectionString(connectionString);
    containerClient = blobServiceClient.getContainerClient(containerName);
    console.log(`[Blob Storage] Initialized container: ${containerName}`);
  }

  return containerClient;
}

/**
 * Check if blob storage is configured and available.
 */
export function isBlobStorageEnabled(): boolean {
  return !!connectionString;
}

/**
 * Upload a video file to Azure Blob Storage.
 * @param localPath - Path to the local video file
 * @param filename - Filename to use in blob storage
 * @returns The public URL of the uploaded blob, or null if upload failed
 */
export async function uploadVideo(
  localPath: string,
  filename: string
): Promise<string | null> {
  const client = getContainerClient();
  if (!client) {
    return null;
  }

  try {
    const blockBlobClient = client.getBlockBlobClient(filename);

    // Read the file and upload
    const file = Bun.file(localPath);
    const buffer = await file.arrayBuffer();

    console.log(`[Blob Storage] Uploading ${filename} (${buffer.byteLength} bytes)...`);

    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: {
        blobContentType: "video/mp4",
      },
    });

    const url = blockBlobClient.url;
    console.log(`[Blob Storage] Upload complete: ${url}`);

    return url;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Blob Storage] Upload failed: ${errorMessage}`);
    return null;
  }
}

/**
 * Delete a video from Azure Blob Storage.
 * @param filename - Filename of the blob to delete
 * @returns true if deleted, false otherwise
 */
export async function deleteVideo(filename: string): Promise<boolean> {
  const client = getContainerClient();
  if (!client) {
    return false;
  }

  try {
    const blockBlobClient = client.getBlockBlobClient(filename);
    await blockBlobClient.deleteIfExists();
    console.log(`[Blob Storage] Deleted: ${filename}`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Blob Storage] Delete failed: ${errorMessage}`);
    return false;
  }
}

/**
 * Ensure the blob container exists (create if necessary).
 * Call this during startup to verify configuration.
 */
export async function ensureContainer(): Promise<boolean> {
  const client = getContainerClient();
  if (!client) {
    return false;
  }

  try {
    // Create container if it doesn't exist (with public blob access)
    await client.createIfNotExists({
      access: "blob", // Public read access for blobs
    });
    console.log(`[Blob Storage] Container '${containerName}' ready`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Blob Storage] Container check failed: ${errorMessage}`);
    return false;
  }
}
