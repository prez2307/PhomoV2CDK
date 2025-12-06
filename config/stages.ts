export interface StageConfig {
  stageName: string;
  account?: string;
  region: string;
}

export const stages: StageConfig[] = [
  {
    stageName: 'dev',
    region: 'us-east-1',
  },
  {
    stageName: 'staging',
    region: 'us-east-1',
  },
  {
    stageName: 'prod',
    region: 'us-east-1',
  },
];
