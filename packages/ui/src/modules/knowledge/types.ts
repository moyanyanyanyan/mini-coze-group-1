import type { FormEvent, ReactNode, RefObject } from 'react';

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'DISABLED';
}

export interface KnowledgeDocumentItem {
  id: string;
  title: string;
  sourceType: 'TEXT' | 'TXT' | 'JSON';
  status: 'PROCESSING' | 'READY' | 'FAILED';
  stage: string;
  chunkCount: number;
  error: { message: string } | null;
  createdAt: string;
}

export interface KnowledgeChunks {
  items: { id: string; position: number; content: string; startOffset: number; endOffset: number }[];
  total: number;
  pageSize: number;
}

export interface KnowledgeSearchPreview {
  status: 'HIT' | 'NO_HIT';
  hits: { chunkId: string; knowledgeBaseId: string; documentId: string; documentTitle: string; content: string; score: number }[];
}

export interface KnowledgeCatalogState {
  items: KnowledgeBaseItem[];
  name: string;
  description: string;
  loading: boolean;
  saving: boolean;
  creatingBase: boolean;
  error: string;
  selectedId: string | null;
  selectedBase: KnowledgeBaseItem | undefined;
  selectedBaseStatus: KnowledgeBaseItem['status'] | undefined;
  deletingBase: boolean;
  updatingBaseStatus: boolean;
  canCreate: boolean;
}

export type KnowledgeTab = 'documents' | 'chunks' | 'search';
export type DocumentSourceMode = 'text' | 'file';

export interface KnowledgeDocumentsState {
  activeTab: KnowledgeTab;
  documents: KnowledgeDocumentItem[];
  documentError: string;
  documentLoading: boolean;
  documentSaving: boolean;
  deletingDocumentId: string | null;
  addingDocument: boolean;
  sourceMode: DocumentSourceMode;
  documentTitle: string;
  documentText: string;
  selectedDocumentId: string | null;
  selectedDocument: KnowledgeDocumentItem | undefined;
  readyDocuments: KnowledgeDocumentItem[];
  hasProcessing: boolean;
}

export interface KnowledgeChunkState {
  chunkPage: number;
  chunks: KnowledgeChunks | null;
  chunkLoading: boolean;
  chunkError: string;
}

export interface KnowledgeSearchState {
  query: string;
  searchResult: KnowledgeSearchPreview | null;
  searching: boolean;
  searchError: string;
  canSearch: boolean;
}

export interface KnowledgeActions {
  onSelectBase: (id: string) => void;
  onToggleCreate: () => void;
  onStartCreate: () => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  handleCreate: (event: FormEvent<HTMLFormElement>) => void;
  handleToggleBaseStatus: () => void;
  handleDeleteBase: () => void;
  onActiveTabChange: (tab: KnowledgeTab) => void;
  onToggleDocumentForm: () => void;
  onSourceModeChange: (mode: DocumentSourceMode) => void;
  onDocumentTitleChange: (value: string) => void;
  onDocumentTextChange: (value: string) => void;
  onDocumentFileChange: (file: File | null) => void;
  handleDocumentSubmit: (event: FormEvent<HTMLFormElement>) => void;
  handleRetry: (id: string) => void;
  onViewDocumentChunks: (id: string) => void;
  handleDeleteDocument: (id: string) => void;
  onSelectedDocumentChange: (id: string | null) => void;
  onChunkPageChange: (page: number) => void;
  onQueryChange: (value: string) => void;
  handleSearch: (event: FormEvent<HTMLFormElement>) => void;
}

export interface KnowledgeViewProps {
  catalog: KnowledgeCatalogState;
  documentState: KnowledgeDocumentsState;
  chunkState: KnowledgeChunkState;
  searchState: KnowledgeSearchState;
  actions: KnowledgeActions;
  confirmation: ReactNode;
  fileInputRef: RefObject<HTMLInputElement | null>;
}
