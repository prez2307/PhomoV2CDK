import { SQSEvent, SQSHandler } from 'aws-lambda';

/**
 * Process faces in uploaded photos (triggered by SQS from S3 uploads)
 *
 * Flow:
 * 1. Get photo from S3
 * 2. Detect faces using Rekognition
 * 3. Search for matches in face collection
 * 4. Create ContentFace records (matched or unknown)
 * 5. Create RecipientEdge for matched users
 */
export const handler: SQSHandler = async (event: SQSEvent) => {
  console.log('ProcessContentFaces invoked', JSON.stringify(event, null, 2));

  // TODO: Implement face processing logic
  // - Parse S3 event from SQS message
  // - Download photo from S3
  // - Call Rekognition DetectFaces
  // - For each face: SearchFacesByImage
  // - Create ContentFace records in DynamoDB
  // - If matched: Create RecipientEdge for that user
  // - Handle errors and retries

  return;
};
