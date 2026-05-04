export {
  checkHealth,
  isDeepTutorEnabled,
  getDeepTutorConfig,
  listKnowledgeBases,
  getKnowledgeBase,
  listRAGProviders,
  queryKnowledgeBase,
  getRAGContextForGeneration,
  recordQuizAttempt,
  listQuizAttempts,
} from './deeptutor-client';

export type {
  QuizSource,
  QuizAttemptPayload,
  QuizAttemptRecord,
  QuizAttemptFilter,
} from './deeptutor-client';

export type {
  KnowledgeBaseInfo,
  KnowledgeBaseDetails,
  RAGQueryResult,
  ChatRAGResponse,
  DeepTutorConfig,
} from './types';

export { DeepTutorUnavailableError, DeepTutorAPIError } from './types';
