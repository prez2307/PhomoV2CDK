import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { AuthStack } from './stacks/auth-stack';

export interface PhomoStageProps extends cdk.StageProps {
  stageName: string;
}

export class PhomoStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: PhomoStageProps) {
    super(scope, id, props);

    const { stageName } = props;

    // Auth Stack - Cognito User Pool + Identity Pool
    new AuthStack(this, 'Auth', {
      stageName,
    });

    // TODO: Add more stacks here
    // new DatabaseStack(this, `Database-${stageName}`, { stageName });
    // new StorageStack(this, `Storage-${stageName}`, { stageName });
    // new RekognitionStack(this, `Rekognition-${stageName}`, { stageName });
    // etc.
  }
}
