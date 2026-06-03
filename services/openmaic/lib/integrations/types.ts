/**
 * Type definitions for Tutor API integration.
 */

// ==================== Knowledge Base Types ====================

export interface KnowledgeBaseInfo {
  name: string;
  is_default: boolean;
  statistics: {
    total_documents?: number;
    total_chunks?: number;
    [key: string]: unknown;
  };
}

export interface KnowledgeBaseDetails {
  name: string;
  documents: Array<{
    filename: string;
    added_at?: string;
    [key: string]: unknown;
  }>;
  config: Record<string, unknown>;
}

export interface RAGQueryResult {
  content: string;
  score?: number;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatRAGResponse {
  type: 'session' | 'status' | 'stream' | 'sources' | 'result' | 'error';
  session_id?: string;
  stage?: string;
  message?: string;
  content?: string;
  rag?: RAGQueryResult[];
  web?: unknown[];
}

// ==================== Error Types ====================

export class DeepTutorUnavailableError extends Error {
  constructor(message: string = 'DeepTutor service is unavailable') {
    super(message);
    this.name = 'DeepTutorUnavailableError';
  }
}

export class DeepTutorAPIError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DeepTutorAPIError';
    this.status = status;
  }
}

// ==================== Integration Config ====================

export interface DeepTutorConfig {
  baseUrl: string;
  queryTimeout: number;
  generationTimeout: number;
  enabled: boolean;
}
