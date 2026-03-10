export {
  isVectorDbAvailable,
  insertSource,
  getSourceById,
  listSourcesByWorkspace,
  updateSourceStatus,
  deleteSource,
  insertChunksWithEmbeddings,
  searchByEmbedding,
} from "./repository";

export type {
  KnowledgeSource,
  KnowledgeChunk,
  KnowledgeSearchResult,
  KnowledgeSourceStatus,
} from "@/server/db/knowledge-schema";

export { VECTOR_DIMENSION } from "@/server/db/knowledge-schema";
