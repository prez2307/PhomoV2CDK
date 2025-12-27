import { AppSyncResolverHandler } from 'aws-lambda';

interface GetContentUrlArgs {
  contentId: string;
}

interface GetContentUrlResult {
  url: string;
  thumbUrl?: string;
  expiresIn: number;
}

/**
 * Generate presigned S3 URLs for content (1-hour expiry)
 *
 * Flow:
 * 1. Get content from DynamoDB
 * 2. Generate presigned URL for photo
 * 3. Generate presigned URL for thumbnail (if exists)
 * 4. Return URLs with expiry time
 */
export const handler: AppSyncResolverHandler<GetContentUrlArgs, GetContentUrlResult> = async (event) => {
  console.log('GetContentUrl invoked', JSON.stringify(event, null, 2));

  const { contentId } = event.arguments;

  // TODO: Implement presigned URL generation
  // - Get content from Content table
  // - Use S3 SDK to generate presigned URLs (1 hour)
  // - Return { url, thumbUrl, expiresIn: 3600 }

  return {
    url: 'https://placeholder-url.s3.amazonaws.com/photo.jpg',
    thumbUrl: 'https://placeholder-url.s3.amazonaws.com/thumb.jpg',
    expiresIn: 3600,
  };
};
