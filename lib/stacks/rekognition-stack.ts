import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as rekognition from 'aws-cdk-lib/aws-rekognition';

export interface RekognitionStackProps extends cdk.StackProps {
  stageName: string;
}

export class RekognitionStack extends cdk.Stack {
  public readonly faceCollection: rekognition.CfnCollection;
  public readonly collectionId: string;

  constructor(scope: Construct, id: string, props: RekognitionStackProps) {
    super(scope, id, props);

    const { stageName } = props;

    // ==================== REKOGNITION FACE COLLECTION ====================
    // Purpose: Store face vectors for face detection and matching
    // Used by: Face enrollment (profile photos) and face matching (content photos)

    this.collectionId = `phomo-faces-${stageName}`;

    this.faceCollection = new rekognition.CfnCollection(this, 'FaceCollection', {
      collectionId: this.collectionId,

      // Tags for resource management
      tags: [
        {
          key: 'Name',
          value: `Phomo Face Collection - ${stageName}`,
        },
        {
          key: 'Environment',
          value: stageName,
        },
        {
          key: 'Application',
          value: 'Phomo',
        },
      ],
    });

    // ==================== OUTPUTS ====================
    new cdk.CfnOutput(this, 'FaceCollectionId', {
      value: this.collectionId,
      description: 'Rekognition Collection ID for face storage',
      exportName: `Phomo-FaceCollectionId-${stageName}`,
    });

    new cdk.CfnOutput(this, 'FaceCollectionArn', {
      value: this.faceCollection.attrArn,
      description: 'Rekognition Collection ARN',
      exportName: `Phomo-FaceCollectionArn-${stageName}`,
    });
  }
}
