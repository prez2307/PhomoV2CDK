import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';

export interface AuthStackProps extends cdk.StackProps {
  stageName: string;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly identityPool: cognito.CfnIdentityPool;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { stageName } = props;

    // ==================== USER POOL ====================
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `Phomo-UserPool-${stageName}`,

      // Sign-in configuration
      signInAliases: {
        phone: true,
        email: false,
        username: false,
      },

      // Auto-verify phone numbers
      autoVerify: {
        phone: true,
      },

      // Standard attributes
      standardAttributes: {
        phoneNumber: {
          required: true,
          mutable: true,
        },
      },

      // Custom attributes for Phomo
      customAttributes: {
        displayName: new cognito.StringAttribute({ mutable: true }),
        profilePhotoKey: new cognito.StringAttribute({ mutable: true }),
        faceCount: new cognito.NumberAttribute({ mutable: true }),
        primaryFaceId: new cognito.StringAttribute({ mutable: true }),
        expoPushToken: new cognito.StringAttribute({ mutable: true }),
      },

      // Password policy
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },

      // Account recovery
      accountRecovery: cognito.AccountRecovery.PHONE_ONLY_WITHOUT_MFA,

      // MFA configuration (optional)
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: {
        sms: true,
        otp: false,
      },

      // Self sign-up
      selfSignUpEnabled: true,

      // User invitation
      userInvitation: {
        emailSubject: 'Welcome to Phomo!',
        emailBody: 'Your username is {username} and temporary password is {####}',
        smsMessage: 'Your Phomo username is {username} and temporary password is {####}',
      },

      // SMS configuration - uses default IAM role for SNS
      smsRole: undefined, // CDK will create default role
      smsRoleExternalId: `Phomo-SMS-${stageName}`,

      // User verification messages
      userVerification: {
        smsMessage: 'Your Phomo verification code is {####}',
      },

      // Deletion protection for production
      deletionProtection: stageName === 'prod',

      // Remove users on stack deletion (dev/staging only)
      removalPolicy: stageName === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ==================== SOCIAL SIGN-IN PROVIDERS ====================
    // TODO: Add Apple and Google Sign-In after configuring OAuth credentials
    // Instructions:
    // 1. Apple: https://developer.apple.com/account/resources/identifiers/list/serviceId
    // 2. Google: https://console.cloud.google.com/apis/credentials
    // 3. Store credentials in AWS Secrets Manager
    // 4. Uncomment the providers below and reference secrets

    /* APPLE SIGN-IN (uncomment after setup)
    const appleProvider = new cognito.UserPoolIdentityProviderApple(this, 'AppleProvider', {
      userPool: this.userPool,
      clientId: 'your-apple-client-id',
      teamId: 'your-apple-team-id',
      keyId: 'your-apple-key-id',
      privateKeyValue: cdk.SecretValue.secretsManager('phomo/apple-private-key'),
      scopes: ['name', 'email'],
      attributeMapping: {
        email: cognito.ProviderAttribute.APPLE_EMAIL,
        givenName: cognito.ProviderAttribute.APPLE_FIRST_NAME,
        familyName: cognito.ProviderAttribute.APPLE_LAST_NAME,
      },
    });
    */

    /* GOOGLE SIGN-IN (uncomment after setup)
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      userPool: this.userPool,
      clientId: 'your-google-client-id.apps.googleusercontent.com',
      clientSecretValue: cdk.SecretValue.secretsManager('phomo/google-client-secret'),
      scopes: ['profile', 'email', 'openid'],
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE,
      },
    });
    */

    // ==================== USER POOL CLIENT ====================
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `Phomo-Client-${stageName}`,

      // OAuth flows
      authFlows: {
        userPassword: true,
        userSrp: true,
        custom: false,
        adminUserPassword: false,
      },

      // OAuth configuration for social sign-in
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.PHONE,
        ],
        callbackUrls: [
          `phomo-${stageName}://oauth/callback`, // Mobile deep link
          stageName === 'prod'
            ? 'https://phomo.camera/oauth/callback'
            : `https://${stageName}.phomo.camera/oauth/callback`, // Web callback
        ],
        logoutUrls: [
          `phomo-${stageName}://oauth/logout`,
          stageName === 'prod'
            ? 'https://phomo.camera/oauth/logout'
            : `https://${stageName}.phomo.camera/oauth/logout`,
        ],
      },

      // Supported identity providers
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        // TODO: Uncomment after configuring social providers
        // cognito.UserPoolClientIdentityProvider.APPLE,
        // cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],

      // Token validity
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),

      // Security
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,

      // Read/write attributes
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          phoneNumber: true,
          phoneNumberVerified: true,
        })
        .withCustomAttributes('displayName', 'profilePhotoKey', 'faceCount', 'primaryFaceId', 'expoPushToken'),

      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          phoneNumber: true,
        })
        .withCustomAttributes('displayName', 'profilePhotoKey', 'faceCount', 'primaryFaceId', 'expoPushToken'),
    });

    // TODO: Add dependencies when social providers are enabled
    // this.userPoolClient.node.addDependency(appleProvider);
    // this.userPoolClient.node.addDependency(googleProvider);

    // ==================== COGNITO DOMAIN ====================
    this.userPool.addDomain('UserPoolDomain', {
      cognitoDomain: {
        domainPrefix: `phomo-${stageName}`,
      },
    });

    // ==================== IDENTITY POOL ====================
    this.identityPool = new cognito.CfnIdentityPool(this, 'IdentityPool', {
      identityPoolName: `Phomo_IdentityPool_${stageName}`,
      allowUnauthenticatedIdentities: false,

      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName,
        },
      ],
    });

    // ==================== OUTPUTS ====================
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
      exportName: `Phomo-UserPoolId-${stageName}`,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
      exportName: `Phomo-UserPoolClientId-${stageName}`,
    });

    new cdk.CfnOutput(this, 'IdentityPoolId', {
      value: this.identityPool.ref,
      description: 'Cognito Identity Pool ID',
      exportName: `Phomo-IdentityPoolId-${stageName}`,
    });

    new cdk.CfnOutput(this, 'UserPoolDomain', {
      value: `phomo-${stageName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Domain',
      exportName: `Phomo-UserPoolDomain-${stageName}`,
    });
  }
}
