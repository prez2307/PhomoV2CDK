import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface StorageStackProps extends cdk.StackProps {
  stageName: string;
  identityPool: cognito.CfnIdentityPool;
}

export class StorageStack extends cdk.Stack {
  public readonly photoBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    const { stageName, identityPool } = props;

    // ==================== PHOTO STORAGE BUCKET ====================
    this.photoBucket = new s3.Bucket(this, 'PhotoBucket', {
      bucketName: `phomov2-photos-${stageName}`,

      // Security
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,

      // Versioning disabled (photos are immutable)
      versioned: false,

      // CORS for web/mobile uploads
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
          ],
          allowedOrigins: [
            'https://phomo.camera',
            `https://${stageName}.phomo.camera`,
            'http://localhost:3000', // Local web development
            'http://localhost:19006', // Expo web
          ],
          allowedHeaders: ['*'],
          exposedHeaders: [
            'x-amz-server-side-encryption',
            'x-amz-request-id',
            'x-amz-id-2',
            'ETag',
          ],
          maxAge: 3000,
        },
      ],

      // Lifecycle rules for cost optimization
      lifecycleRules: [
        {
          id: 'transition-to-intelligent-tiering',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INTELLIGENT_TIERING,
              transitionAfter: cdk.Duration.days(30),
            },
          ],
        },
        {
          id: 'cleanup-incomplete-multipart-uploads',
          enabled: true,
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],

      // EventBridge notifications for face processing pipeline
      eventBridgeEnabled: true,

      // Deletion policy
      removalPolicy: stageName === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: stageName !== 'prod',
    });

    // ==================== IAM ROLES FOR COGNITO IDENTITY POOL ====================

    // Authenticated Role - users can access their own photos and shared photos
    const authenticatedRole = new iam.Role(this, 'AuthenticatedRole', {
      assumedBy: new iam.FederatedPrincipal(
        'cognito-identity.amazonaws.com',
        {
          StringEquals: {
            'cognito-identity.amazonaws.com:aud': identityPool.ref,
          },
          'ForAnyValue:StringLike': {
            'cognito-identity.amazonaws.com:amr': 'authenticated',
          },
        },
        'sts:AssumeRoleWithWebIdentity'
      ),
      description: `Authenticated role for Phomo ${stageName} - S3 photo access`,
    });

    // Policy: Upload own photos and face images
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:PutObject', 's3:PutObjectAcl'],
        resources: [
          // Upload photos to own folder
          `${this.photoBucket.bucketArn}/photos/\${cognito-identity.amazonaws.com:sub}/*`,
          // Upload face images for Rekognition
          `${this.photoBucket.bucketArn}/faces/\${cognito-identity.amazonaws.com:sub}/*`,
        ],
      })
    );

    // Policy: Read own photos
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [
          `${this.photoBucket.bucketArn}/photos/\${cognito-identity.amazonaws.com:sub}/*`,
          `${this.photoBucket.bucketArn}/faces/\${cognito-identity.amazonaws.com:sub}/*`,
        ],
      })
    );

    // Policy: Read all photos (app logic via PhotoRecipient table controls actual access)
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:GetObject'],
        resources: [
          `${this.photoBucket.bucketArn}/photos/*/*`, // All user photos
          `${this.photoBucket.bucketArn}/faces/*/*`, // All face images
        ],
      })
    );

    // Policy: Delete own photos
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:DeleteObject'],
        resources: [
          `${this.photoBucket.bucketArn}/photos/\${cognito-identity.amazonaws.com:sub}/*`,
          `${this.photoBucket.bucketArn}/faces/\${cognito-identity.amazonaws.com:sub}/*`,
        ],
      })
    );

    // Policy: List bucket (for pagination)
    authenticatedRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['s3:ListBucket'],
        resources: [this.photoBucket.bucketArn],
        conditions: {
          StringLike: {
            's3:prefix': [
              'photos/${cognito-identity.amazonaws.com:sub}/*',
              'faces/${cognito-identity.amazonaws.com:sub}/*',
            ],
          },
        },
      })
    );

    // Attach authenticated role to Identity Pool
    new cognito.CfnIdentityPoolRoleAttachment(this, 'IdentityPoolRoleAttachment', {
      identityPoolId: identityPool.ref,
      roles: {
        authenticated: authenticatedRole.roleArn,
      },
    });

    // ==================== OUTPUTS ====================
    new cdk.CfnOutput(this, 'PhotoBucketName', {
      value: this.photoBucket.bucketName,
      description: 'S3 bucket name for photo storage',
      exportName: `Phomo-PhotoBucketName-${stageName}`,
    });

    new cdk.CfnOutput(this, 'PhotoBucketArn', {
      value: this.photoBucket.bucketArn,
      description: 'S3 bucket ARN for photo storage',
      exportName: `Phomo-PhotoBucketArn-${stageName}`,
    });

    new cdk.CfnOutput(this, 'PhotoBucketDomain', {
      value: this.photoBucket.bucketRegionalDomainName,
      description: 'S3 bucket regional domain name',
      exportName: `Phomo-PhotoBucketDomain-${stageName}`,
    });

    new cdk.CfnOutput(this, 'AuthenticatedRoleArn', {
      value: authenticatedRole.roleArn,
      description: 'IAM role ARN for authenticated Cognito users',
      exportName: `Phomo-AuthenticatedRoleArn-${stageName}`,
    });
  }
}
