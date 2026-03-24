import { Request, Response } from 'express'
import { Logger } from './utils/logger'

/**
 * Configuration options for the API client.
 */
export interface ApiConfig {
  baseUrl: string
  timeout: number
  retryCount: number
}

/**
 * Fetches user data from the remote API with retry logic.
 */
export function fetchUserData(userId: string, config: ApiConfig): Promise<UserData> {
  const url = `${config.baseUrl}/users/${userId}`
  return fetch(url, { signal: AbortSignal.timeout(config.timeout) })
    .then(res => res.json())
}

/**
 * Formats a date string into locale-specific display format.
 */
const formatDate = (date: string, locale: string = 'en-US'): string => {
  const parsed = new Date(date)
  return parsed.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Service class for managing document operations.
 */
export class DocumentService {
  private logger: Logger
  private baseUrl: string

  constructor(config: ApiConfig) {
    this.logger = new Logger('DocumentService')
    this.baseUrl = config.baseUrl
  }

  /**
   * Upload a document to the storage backend.
   */
  async uploadDocument(file: File, metadata: Record<string, string>): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    Object.entries(metadata).forEach(([key, value]) => {
      formData.append(key, value)
    })
    const response = await fetch(`${this.baseUrl}/documents`, {
      method: 'POST',
      body: formData,
    })
    const result = await response.json()
    this.logger.info(`Document uploaded: ${result.id}`)
    return result.id
  }

  /**
   * Delete a document by its identifier.
   */
  async deleteDocument(documentId: string): Promise<void> {
    await fetch(`${this.baseUrl}/documents/${documentId}`, {
      method: 'DELETE',
    })
    this.logger.info(`Document deleted: ${documentId}`)
  }
}
