import { AppSyncResolverHandler } from 'aws-lambda';

interface EnrollFaceArgs {
  userId: string;
  s3Key: string;
}

interface EnrollFaceResult {
  success: boolean;
  faceId?: string;
  faceCount?: number;
  error?: string;
}

/**
 * Enroll a user's face into Rekognition collection (synchronous via AppSync)
 *
 * Flow:
 * 1. Validate user exists
 * 2. Get photo from S3 (faces/ prefix)
 * 3. Index face in Rekognition with userId as externalImageId
 * 4. Create FaceIdentity record in DynamoDB
 * 5. Return immediate feedback (success/error)
 */
export const handler: AppSyncResolverHandler<EnrollFaceArgs, EnrollFaceResult> = async (event) => {
  console.log('EnrollFace invoked', JSON.stringify(event, null, 2));

  const { userId, s3Key } = event.arguments;

  // TODO: Implement face enrollment logic
  // - Validate userId exists in User table
  // - Call Rekognition IndexFaces with externalImageId = userId
  // - Create FaceIdentity record
  // - Return { success, faceId, faceCount }

  return {
    success: true,
    faceId: 'placeholder-face-id',
    faceCount: 1,
  };
};
