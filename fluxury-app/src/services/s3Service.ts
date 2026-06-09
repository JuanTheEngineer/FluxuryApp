import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getCurrentUser } from '@/api/auth-interceptor'

// Initialize S3 client
const s3Client = new S3Client({
  region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
  // Credentials will be provided by Cognito Identity Pool
})

const BUCKET_NAME = import.meta.env.VITE_S3_BUCKET_NAME || 'fluxury-session-files'

export class S3Service {
  /**
   * Upload session script to S3
   */
  static async uploadSessionScript(sessionId: string, scriptData: any): Promise<string> {
    try {
      const user = await getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const key = `sessions/${sessionId}/script.json`
      const scriptBlob = JSON.stringify(scriptData)

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: scriptBlob,
        ContentType: 'application/json',
        Metadata: {
          userId: user.sub,
          sessionId,
          uploadedAt: new Date().toISOString()
        }
      })

      await s3Client.send(command)

      // Return the S3 URL
      return `https://${BUCKET_NAME}.s3.${import.meta.env.VITE_AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
    } catch (error) {
      console.error('Failed to upload script to S3:', error)
      throw error
    }
  }

  /**
   * Download session script from S3
   */
  static async downloadSessionScript(sessionId: string): Promise<any> {
    try {
      const key = `sessions/${sessionId}/script.json`

      const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key
      })

      const response = await s3Client.send(command)

      if (response.Body) {
        const scriptData = await response.Body.transformToString()
        return JSON.parse(scriptData)
      }

      throw new Error('No script data found')
    } catch (error) {
      console.error('Failed to download script from S3:', error)
      throw error
    }
  }

  /**
   * Upload artwork to S3
   */
  static async uploadArtwork(sessionId: string, file: File): Promise<string> {
    try {
      const user = await getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const extension = file.name.split('.').pop()
      const key = `sessions/${sessionId}/artwork.${extension}`

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: file.type,
        Metadata: {
          userId: user.sub,
          sessionId,
          originalFileName: file.name,
          uploadedAt: new Date().toISOString()
        }
      })

      await s3Client.send(command)

      // Return the S3 URL
      return `https://${BUCKET_NAME}.s3.${import.meta.env.VITE_AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
    } catch (error) {
      console.error('Failed to upload artwork to S3:', error)
      throw error
    }
  }

  /**
   * Upload beat file to S3
   */
  static async uploadBeat(beatId: string, file: File): Promise<string> {
    try {
      const user = await getCurrentUser()
      if (!user) {
        throw new Error('User not authenticated')
      }

      const extension = file.name.split('.').pop()
      const key = `beats/${beatId}/audio.${extension}`

      const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: file,
        ContentType: file.type,
        Metadata: {
          userId: user.sub,
          beatId,
          originalFileName: file.name,
          uploadedAt: new Date().toISOString()
        }
      })

      await s3Client.send(command)

      // Return the S3 URL
      return `https://${BUCKET_NAME}.s3.${import.meta.env.VITE_AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`
    } catch (error) {
      console.error('Failed to upload beat to S3:', error)
      throw error
    }
  }
}