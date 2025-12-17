import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AuthStack } from './stacks/auth-stack';
import { StorageStack } from './stacks/storage-stack';
import { DatabaseStack } from './stacks/database-stack';

export interface PhomoStageProps extends cdk.StageProps {
  stageName: string;
}

export class PhomoStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: PhomoStageProps) {
    super(scope, id, props);

    const { stageName } = props;

    // Auth Stack - Cognito User Pool + Identity Pool
    const authStack = new AuthStack(this, 'Auth', {
      stageName,
    });

    // Storage Stack - S3 bucket for photos with EventBridge
    new StorageStack(this, 'Storage', {
      stageName,
      identityPool: authStack.identityPool,
    });

    // Database Stack - DynamoDB tables for app data
    new DatabaseStack(this, 'Database', {
      stageName,
    });

    // TODO: Add more stacks here
    // new RekognitionStack(this, 'Rekognition', { stageName });
    // new ApiStack(this, 'Api', { stageName });
  }
}
