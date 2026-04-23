const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { TextractClient, DetectDocumentTextCommand, AnalyzeExpenseCommand } = require('@aws-sdk/client-textract');

class TextractService {
    constructor() {
        const region = process.env.AWS_REGION || 'eu-west-1';

        this.bucketName = process.env.AWS_S3_BUCKET_NAME || '';

        this.s3Client = new S3Client({
            region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
                ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
            }
        });

        this.client = new TextractClient({
            region,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
                ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {})
            }
        });
    }

    validateConfig() {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
        }

        if (!this.bucketName) {
            throw new Error('AWS_S3_BUCKET_NAME tanimli degil.');
        }
    }

    async uploadImageToS3(imageBase64, mimeType = 'image/jpeg') {
        this.validateConfig();

        const cleanBase64 = String(imageBase64 || '').replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '').trim();
        if (!cleanBase64) {
            throw new Error('Image payload is empty.');
        }

        const bytes = Buffer.from(cleanBase64, 'base64');
        if (!bytes.length) {
            throw new Error('Invalid base64 image payload.');
        }

        const key = `ocr/${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${this.getFileExtension(mimeType)}`;

        await this.s3Client.send(new PutObjectCommand({
            Bucket: this.bucketName,
            Key: key,
            Body: bytes,
            ContentType: mimeType,
        }));

        return { bucket: this.bucketName, key };
    }

    getFileExtension(mimeType = '') {
        const lower = String(mimeType).toLowerCase();
        if (lower.includes('png')) return 'png';
        if (lower.includes('webp')) return 'webp';
        return 'jpg';
    }

    async analyzeExpenseFromBuffer(buffer, mimeType = 'image/jpeg') {
        if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
            throw new Error('AWS credentials missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY.');
        }

        const command = new AnalyzeExpenseCommand({
            Document: { Bytes: buffer }
        });

        const response = await this.client.send(command);
        return response.ExpenseDocuments?.[0] || null;
    }

    async extractTextFromS3Object(bucket, key) {
        this.validateConfig();

        const command = new DetectDocumentTextCommand({
            Document: {
                S3Object: {
                    Bucket: bucket,
                    Name: key,
                }
            }
        });

        const response = await this.client.send(command);
        const lines = (response.Blocks || [])
            .filter((block) => block.BlockType === 'LINE' && block.Text)
            .map((block) => block.Text.trim())
            .filter(Boolean);

        return lines.join('\n').trim();
    }
}

module.exports = new TextractService();
