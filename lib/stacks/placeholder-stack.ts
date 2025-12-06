import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface PlaceholderStackProps extends cdk.StackProps {
  stageName: string;
}

/**
 * Placeholder stack to test pipeline deployment
 * This will be replaced with actual infrastructure stacks
 */
export class PlaceholderStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PlaceholderStackProps) {
    super(scope, id, props);

    // Simple output to verify stack deployment
    new cdk.CfnOutput(this, 'StageName', {
      value: props.stageName,
      description: 'The deployment stage name',
    });

    new cdk.CfnOutput(this, 'Message', {
      value: `Phomo V2 ${props.stageName} stack deployed successfully!`,
      description: 'Deployment confirmation message',
    });
  }
}
