import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function putJson(bucket: string, key: string, data: unknown): Promise<void> {
  const Body = Buffer.from(JSON.stringify(data), 'utf-8');
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body, ContentType: 'application/json' }));
}
