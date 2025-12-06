import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { PlaceholderStack } from './stacks/placeholder-stack';

export interface PhomoStageProps extends cdk.StageProps {
  stageName: string;
}

export class PhomoStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: PhomoStageProps) {
    super(scope, id, props);

    const { stageName } = props;

    // Placeholder stack for testing pipeline
    new PlaceholderStack(this, `Placeholder-${stageName}`, {
      stageName,
    });

    // TODO: Add real application stacks here
    // new AuthStack(this, `Auth-${stageName}`, { stageName });
    // new DatabaseStack(this, `Database-${stageName}`, { stageName });
    // new StorageStack(this, `Storage-${stageName}`, { stageName });
    // etc.
  }
}
