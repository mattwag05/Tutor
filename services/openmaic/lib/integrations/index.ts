export {
  checkHealth,
  isDeepTutorEnabled,
  getDeepTutorConfig,
  listKnowledgeBases,
  getKnowledgeBase,
  listRAGProviders,
  queryKnowledgeBase,
  getRAGContextForGeneration,
} from './deeptutor-client';

export type {
  KnowledgeBaseInfo,
  KnowledgeBaseDetails,
  RAGQueryResult,
  ChatRAGResponse,
  DeepTutorConfig,
} from './types';

export { DeepTutorUnavailableError, DeepTutorAPIError } from './types';
