import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AuthStack } from './stacks/auth-stack';
import { StorageStack } from './stacks/storage-stack';
import { DatabaseStack } from './stacks/database-stack';
import { RekognitionStack } from './stacks/rekognition-stack';
import { FaceProcessingStack } from './stacks/face-processing-stack';
import { StreamProcessingStack } from './stacks/stream-processing-stack';
import { ScheduledJobsStack } from './stacks/scheduled-jobs-stack';
import { ApiStack } from './stacks/api-stack';

export interface PhomoStageProps extends cdk.StageProps {
  stageName: string;
}

export class PhomoStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: PhomoStageProps) {
    super(scope, id, props);

    const { stageName } = props;

    // ==================== INFRASTRUCTURE STACKS ====================

    // Auth Stack - Cognito User Pool + Identity Pool
    const authStack = new AuthStack(this, 'Auth', {
      stageName,
    });

    // Storage Stack - S3 bucket for photos with EventBridge
    const storageStack = new StorageStack(this, 'Storage', {
      stageName,
      identityPool: authStack.identityPool,
    });

    // Database Stack - DynamoDB tables for app data
    const databaseStack = new DatabaseStack(this, 'Database', {
      stageName,
    });

    // Rekognition Stack - Face collection for face detection/matching
    const rekognitionStack = new RekognitionStack(this, 'Rekognition', {
      stageName,
    });

    // ==================== APPLICATION STACKS ====================

    // Face Processing Stack - Photo processing pipeline + face operations
    // Depends on: Storage, Database, Rekognition
    const faceProcessingStack = new FaceProcessingStack(this, 'FaceProcessing', {
      stageName,
      photoBucket: storageStack.photoBucket,
      collectionId: rekognitionStack.collectionId,
      databaseStack: databaseStack,
    });

    // Stream Processing Stack - DynamoDB streams → FeedEntry sync
    // Depends on: Database
    const streamProcessingStack = new StreamProcessingStack(this, 'StreamProcessing', {
      stageName,
      databaseStack: databaseStack,
    });

    // Scheduled Jobs Stack - Cron jobs for event reminders
    // Depends on: Database
    const scheduledJobsStack = new ScheduledJobsStack(this, 'ScheduledJobs', {
      stageName,
      databaseStack: databaseStack,
    });

    // API Stack - AppSync GraphQL API + Lambda resolvers
    // Depends on: Auth, Storage, Database, Rekognition, FaceProcessing
    const apiStack = new ApiStack(this, 'Api', {
      stageName,
      userPool: authStack.userPool,
      identityPool: authStack.identityPool,
      photoBucket: storageStack.photoBucket,
      collectionId: rekognitionStack.collectionId,
      databaseStack: databaseStack,
      faceProcessingStack: faceProcessingStack,
    });
  }
}
