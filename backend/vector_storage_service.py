# Vector Storage Service with ChromaDB
# Comprehensive vector storage and semantic search capabilities for MeetingMind

import asyncio
import json
import time
import uuid
import hashlib
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Union
from dataclasses import dataclass, asdict
from enum import Enum
import logging
import numpy as np
from pathlib import Path

# ChromaDB for vector storage
import chromadb
from chromadb.config import Settings
from chromadb.utils import embedding_functions

# Sentence Transformers for embeddings
from sentence_transformers import SentenceTransformer
import torch

# Additional ML libraries
from sklearn.manifold import TSNE
from sklearn.cluster import KMeans
from sklearn.metrics.pairwise import cosine_similarity
import umap

class EmbeddingModel(Enum):
    """Available embedding models"""
    SENTENCE_TRANSFORMERS_MINI = "sentence-transformers/all-MiniLM-L6-v2"
    SENTENCE_TRANSFORMERS_BASE = "sentence-transformers/all-mpnet-base-v2" 
    SENTENCE_TRANSFORMERS_LARGE = "sentence-transformers/all-MiniLM-L12-v2"
    OPENAI_ADA_002 = "text-embedding-ada-002"
    OPENAI_3_SMALL = "text-embedding-3-small"
    OPENAI_3_LARGE = "text-embedding-3-large"

class DocumentType(Enum):
    """Types of documents stored in vector database"""
    TRANSCRIPT_SEGMENT = "transcript_segment"
    MEETING_SUMMARY = "meeting_summary"
    INSIGHT = "insight"
    ACTION_ITEM = "action_item"
    TOPIC = "topic"
    SPEAKER_PROFILE = "speaker_profile"
    MEETING_METADATA = "meeting_metadata"

class SearchMode(Enum):
    """Search modes for different use cases"""
    SEMANTIC = "semantic"           # Pure semantic similarity
    HYBRID = "hybrid"              # Combines semantic + keyword
    TEMPORAL = "temporal"          # Time-aware search
    SPEAKER = "speaker"            # Speaker-specific search
    TOPIC = "topic"                # Topic-focused search
    CROSS_MEETING = "cross_meeting" # Search across different meetings

@dataclass
class VectorDocument:
    """Document stored in vector database"""
    id: str
    content: str
    embedding: Optional[List[float]]
    document_type: DocumentType
    metadata: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

@dataclass
class SearchResult:
    """Result from vector search"""
    document: VectorDocument
    similarity_score: float
    distance: float
    rank: int
    explanation: str

@dataclass
class ClusterInfo:
    """Information about document clusters"""
    cluster_id: int
    centroid: List[float]
    documents: List[str]
    label: str
    coherence_score: float
    topics: List[str]

@dataclass
class SimilarityMatrix:
    """Matrix of similarities between documents"""
    document_ids: List[str]
    similarity_matrix: List[List[float]]
    clustering_info: List[ClusterInfo]
    dimensionality_reduction: Dict[str, List[Tuple[float, float]]]

class VectorStorageService:
    """
    Comprehensive vector storage service for MeetingMind
    
    Features:
    - ChromaDB integration for persistent vector storage
    - Multiple embedding models support
    - Semantic search with various modes
    - Document clustering and similarity analysis
    - Knowledge graph construction
    - Dimensionality reduction for visualization
    - Real-time embedding generation
    - Metadata filtering and hybrid search
    
    Technical Details:
    
    Embeddings are dense vector representations of text that capture semantic meaning.
    Instead of exact keyword matching, embeddings allow us to find conceptually
    similar content even when different words are used.
    
    For example:
    - "budget constraints" and "financial limitations" would have similar embeddings
    - "action item" and "task assignment" would cluster together
    - "performance issues" and "system slowdown" would be semantically related
    
    ChromaDB provides:
    - Persistent storage of embeddings and metadata
    - Efficient similarity search using vector indices
    - Collection management for different document types
    - Built-in distance metrics (cosine, euclidean, etc.)
    """
    
    def __init__(self, 
                 storage_path: str = "./chroma_db",
                 embedding_model: EmbeddingModel = EmbeddingModel.SENTENCE_TRANSFORMERS_BASE,
                 device: str = "auto"):
        """Initialize the vector storage service"""
        
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(exist_ok=True)
        
        # Initialize ChromaDB client
        self.chroma_client = chromadb.PersistentClient(
            path=str(self.storage_path),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        # Device selection for embeddings
        if device == "auto":
            self.device = "cuda" if torch.cuda.is_available() else "cpu"
        else:
            self.device = device
        
        # Initialize embedding model
        self.embedding_model_name = embedding_model
        self._initialize_embedding_model()
        
        # Collections for different document types
        self.collections: Dict[DocumentType, Any] = {}
        self._initialize_collections()
        
        # Cache for frequently accessed embeddings
        self.embedding_cache: Dict[str, List[float]] = {}
        
        # Statistics and metrics
        self.stats = {
            'total_documents': 0,
            'documents_by_type': {},
            'total_searches': 0,
            'cache_hits': 0,
            'embedding_generation_time': 0.0
        }
        
        self.logger = logging.getLogger(__name__)
        self.logger.info(f"Initialized VectorStorageService with {embedding_model.value} on {self.device}")
    
    def _initialize_embedding_model(self):
        """Initialize the embedding model"""
        try:
            if self.embedding_model_name.value.startswith("sentence-transformers"):
                model_name = self.embedding_model_name.value.replace("sentence-transformers/", "")
                self.embedding_model = SentenceTransformer(model_name, device=self.device)
                self.embedding_dimension = self.embedding_model.get_sentence_embedding_dimension()
                self.logger.info(f"Loaded SentenceTransformer: {model_name} (dim: {self.embedding_dimension})")
                
            elif self.embedding_model_name.value.startswith("text-embedding"):
                # OpenAI embeddings would be handled via API
                self.embedding_model = None
                self.embedding_dimension = 1536  # Default for OpenAI models
                self.logger.info(f"Configured for OpenAI embeddings: {self.embedding_model_name.value}")
                
        except Exception as e:
            self.logger.error(f"Failed to initialize embedding model: {e}")
            # Fallback to smaller model
            self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2', device=self.device)
            self.embedding_dimension = 384
            self.logger.info("Fell back to all-MiniLM-L6-v2 model")
    
    def _initialize_collections(self):
        """Initialize ChromaDB collections for different document types"""
        
        # Create embedding function
        if self.embedding_model:
            # Use local sentence transformer
            embedding_function = embedding_functions.SentenceTransformerEmbeddingFunction(
                model_name=self.embedding_model_name.value.replace("sentence-transformers/", ""),
                device=self.device
            )
        else:
            # Use default embedding function
            embedding_function = embedding_functions.DefaultEmbeddingFunction()
        
        # Create collections for each document type
        for doc_type in DocumentType:
            try:
                collection = self.chroma_client.get_or_create_collection(
                    name=f"meetingmind_{doc_type.value}",
                    embedding_function=embedding_function,
                    metadata={"document_type": doc_type.value}
                )
                self.collections[doc_type] = collection
                self.logger.debug(f"Initialized collection for {doc_type.value}")
                
            except Exception as e:
                self.logger.error(f"Failed to create collection for {doc_type.value}: {e}")
    
    async def generate_embedding(self, text: str, use_cache: bool = True) -> List[float]:
        """
        Generate embedding for text
        
        Embeddings are dense vector representations that capture semantic meaning.
        Similar concepts will have similar embeddings (high cosine similarity).
        """
        
        # Check cache first
        text_hash = hashlib.md5(text.encode()).hexdigest()
        if use_cache and text_hash in self.embedding_cache:
            self.stats['cache_hits'] += 1
            return self.embedding_cache[text_hash]
        
        start_time = time.time()
        
        try:
            if self.embedding_model:
                # Use local sentence transformer
                embedding = self.embedding_model.encode(text, convert_to_numpy=True)
                embedding = embedding.tolist()
            else:
                # Use ChromaDB's default embedding (would integrate with OpenAI API)
                # For now, return a placeholder
                embedding = np.random.rand(self.embedding_dimension).tolist()
            
            # Cache the embedding
            if use_cache:
                self.embedding_cache[text_hash] = embedding
            
            # Update stats
            generation_time = time.time() - start_time
            self.stats['embedding_generation_time'] += generation_time
            
            return embedding
            
        except Exception as e:
            self.logger.error(f"Failed to generate embedding: {e}")
            # Return zero vector as fallback
            return [0.0] * self.embedding_dimension
    
    async def add_document(self, 
                          content: str,
                          document_type: DocumentType,
                          metadata: Dict[str, Any] = None,
                          document_id: str = None) -> str:
        """Add a document to the vector store"""
        
        if document_id is None:
            document_id = f"{document_type.value}_{uuid.uuid4().hex[:8]}"
        
        # Generate embedding
        embedding = await self.generate_embedding(content)
        
        # Prepare metadata
        doc_metadata = metadata or {}
        doc_metadata.update({
            'document_type': document_type.value,
            'created_at': datetime.now().isoformat(),
            'content_length': len(content),
            'embedding_model': self.embedding_model_name.value
        })
        
        try:
            # Add to appropriate collection
            collection = self.collections[document_type]
            collection.add(
                documents=[content],
                embeddings=[embedding],
                metadatas=[doc_metadata],
                ids=[document_id]
            )
            
            # Update stats
            self.stats['total_documents'] += 1
            if document_type.value not in self.stats['documents_by_type']:
                self.stats['documents_by_type'][document_type.value] = 0
            self.stats['documents_by_type'][document_type.value] += 1
            
            self.logger.debug(f"Added document {document_id} to {document_type.value} collection")
            return document_id
            
        except Exception as e:
            self.logger.error(f"Failed to add document: {e}")
            raise
    
    async def semantic_search(self,
                            query: str,
                            document_types: List[DocumentType] = None,
                            search_mode: SearchMode = SearchMode.SEMANTIC,
                            limit: int = 10,
                            metadata_filter: Dict[str, Any] = None,
                            similarity_threshold: float = 0.0) -> List[SearchResult]:
        """
        Perform semantic search across documents
        
        Semantic search finds documents based on meaning rather than exact keywords.
        It uses embedding similarity to find conceptually related content.
        
        For example, searching for "budget issues" might return documents about:
        - "financial constraints"
        - "cost overruns"  
        - "funding problems"
        - "resource limitations"
        
        Even if they don't contain the exact words "budget issues".
        """
        
        if document_types is None:
            document_types = list(DocumentType)
        
        # Generate query embedding
        query_embedding = await self.generate_embedding(query)
        
        all_results = []
        
        for doc_type in document_types:
            try:
                collection = self.collections[doc_type]
                
                # Perform vector search
                search_results = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=limit,
                    where=metadata_filter,
                    include=["documents", "metadatas", "distances"]
                )
                
                # Process results
                for i, (doc_id, document, metadata, distance) in enumerate(zip(
                    search_results['ids'][0],
                    search_results['documents'][0], 
                    search_results['metadatas'][0],
                    search_results['distances'][0]
                )):
                    
                    # Convert distance to similarity score
                    similarity_score = 1.0 - distance  # Assuming cosine distance
                    
                    if similarity_score >= similarity_threshold:
                        
                        # Create vector document
                        vector_doc = VectorDocument(
                            id=doc_id,
                            content=document,
                            embedding=None,  # Don't return full embedding
                            document_type=doc_type,
                            metadata=metadata,
                            created_at=datetime.fromisoformat(metadata.get('created_at', datetime.now().isoformat())),
                            updated_at=datetime.now()
                        )
                        
                        # Generate explanation
                        explanation = self._generate_search_explanation(
                            query, document, similarity_score, search_mode
                        )
                        
                        search_result = SearchResult(
                            document=vector_doc,
                            similarity_score=similarity_score,
                            distance=distance,
                            rank=len(all_results) + 1,
                            explanation=explanation
                        )
                        
                        all_results.append(search_result)
                        
            except Exception as e:
                self.logger.error(f"Search failed for {doc_type.value}: {e}")
                continue
        
        # Sort by similarity score
        all_results.sort(key=lambda x: x.similarity_score, reverse=True)
        
        # Apply final limit
        results = all_results[:limit]
        
        # Update search stats
        self.stats['total_searches'] += 1
        
        self.logger.info(f"Semantic search for '{query}' returned {len(results)} results")
        
        return results
    
    def _generate_search_explanation(self, 
                                   query: str, 
                                   document: str, 
                                   similarity_score: float,
                                   search_mode: SearchMode) -> str:
        """Generate human-readable explanation for why a document matched"""
        
        confidence_level = "high" if similarity_score > 0.8 else "medium" if similarity_score > 0.6 else "low"
        
        # Simple keyword overlap analysis
        query_words = set(query.lower().split())
        doc_words = set(document.lower().split())
        common_words = query_words.intersection(doc_words)
        
        if common_words:
            keyword_match = f"Contains keywords: {', '.join(list(common_words)[:3])}"
        else:
            keyword_match = "Semantic similarity (no direct keyword match)"
        
        return f"{confidence_level.capitalize()} similarity ({similarity_score:.2f}). {keyword_match}."
    
    async def find_similar_meetings(self, 
                                  meeting_id: str, 
                                  limit: int = 5,
                                  similarity_threshold: float = 0.6) -> List[SearchResult]:
        """
        Find meetings similar to a given meeting
        
        This analyzes the semantic content of entire meetings to find others
        that discuss similar topics, themes, or issues.
        """
        
        try:
            # Get meeting summary or key content
            meeting_docs = await self.get_documents_by_metadata(
                {'meeting_id': meeting_id},
                [DocumentType.MEETING_SUMMARY, DocumentType.TRANSCRIPT_SEGMENT]
            )
            
            if not meeting_docs:
                return []
            
            # Combine meeting content
            meeting_content = " ".join([doc.content for doc in meeting_docs[:10]])  # Limit to avoid too long text
            
            # Search for similar content
            similar_results = await self.semantic_search(
                query=meeting_content,
                document_types=[DocumentType.MEETING_SUMMARY],
                limit=limit * 2,  # Get more to filter out the same meeting
                similarity_threshold=similarity_threshold
            )
            
            # Filter out the same meeting
            filtered_results = [
                result for result in similar_results
                if result.document.metadata.get('meeting_id') != meeting_id
            ]
            
            return filtered_results[:limit]
            
        except Exception as e:
            self.logger.error(f"Failed to find similar meetings: {e}")
            return []
    
    async def get_documents_by_metadata(self, 
                                      metadata_filter: Dict[str, Any],
                                      document_types: List[DocumentType] = None) -> List[VectorDocument]:
        """Get documents filtered by metadata"""
        
        if document_types is None:
            document_types = list(DocumentType)
        
        documents = []
        
        for doc_type in document_types:
            try:
                collection = self.collections[doc_type]
                results = collection.get(where=metadata_filter, include=["documents", "metadatas"])
                
                for doc_id, content, metadata in zip(
                    results['ids'], results['documents'], results['metadatas']
                ):
                    doc = VectorDocument(
                        id=doc_id,
                        content=content,
                        embedding=None,
                        document_type=doc_type,
                        metadata=metadata,
                        created_at=datetime.fromisoformat(metadata.get('created_at', datetime.now().isoformat())),
                        updated_at=datetime.now()
                    )
                    documents.append(doc)
                    
            except Exception as e:
                self.logger.error(f"Failed to get documents from {doc_type.value}: {e}")
                continue
        
        return documents
    
    async def generate_similarity_matrix(self, 
                                       document_ids: List[str] = None,
                                       document_types: List[DocumentType] = None,
                                       max_documents: int = 100) -> SimilarityMatrix:
        """
        Generate similarity matrix for document clustering and visualization
        
        This creates a matrix showing how similar each document is to every other document.
        It's useful for:
        - Clustering related documents
        - Visualizing document relationships
        - Finding document hierarchies
        - Building knowledge graphs
        """
        
        if document_types is None:
            document_types = [DocumentType.MEETING_SUMMARY, DocumentType.INSIGHT]
        
        # Get documents to analyze
        if document_ids:
            documents = []
            for doc_id in document_ids:
                for doc_type in document_types:
                    try:
                        collection = self.collections[doc_type]
                        result = collection.get(ids=[doc_id], include=["documents", "metadatas", "embeddings"])
                        if result['ids']:
                            doc = VectorDocument(
                                id=result['ids'][0],
                                content=result['documents'][0],
                                embedding=result['embeddings'][0] if result['embeddings'] else None,
                                document_type=doc_type,
                                metadata=result['metadatas'][0],
                                created_at=datetime.now(),
                                updated_at=datetime.now()
                            )
                            documents.append(doc)
                            break
                    except:
                        continue
        else:
            # Get sample of documents
            documents = []
            for doc_type in document_types:
                try:
                    collection = self.collections[doc_type]
                    results = collection.peek(limit=max_documents // len(document_types))
                    
                    for doc_id, content, metadata in zip(
                        results['ids'], results['documents'], results['metadatas']
                    ):
                        doc = VectorDocument(
                            id=doc_id,
                            content=content,
                            embedding=None,
                            document_type=doc_type,
                            metadata=metadata,
                            created_at=datetime.now(),
                            updated_at=datetime.now()
                        )
                        documents.append(doc)
                        
                except Exception as e:
                    self.logger.error(f"Failed to get documents from {doc_type.value}: {e}")
                    continue
        
        if not documents:
            return SimilarityMatrix([], [], [], {})
        
        # Generate embeddings for documents that don't have them
        embeddings = []
        doc_ids = []
        
        for doc in documents:
            if doc.embedding:
                embeddings.append(doc.embedding)
            else:
                embedding = await self.generate_embedding(doc.content)
                embeddings.append(embedding)
            doc_ids.append(doc.id)
        
        # Calculate similarity matrix
        embeddings_array = np.array(embeddings)
        similarity_matrix = cosine_similarity(embeddings_array)
        similarity_list = similarity_matrix.tolist()
        
        # Perform clustering
        n_clusters = min(8, len(documents) // 3) if len(documents) > 10 else 2
        kmeans = KMeans(n_clusters=n_clusters, random_state=42)
        cluster_labels = kmeans.fit_predict(embeddings_array)
        
        # Create cluster info
        clusters = []
        for i in range(n_clusters):
            cluster_docs = [doc_ids[j] for j, label in enumerate(cluster_labels) if label == i]
            cluster_content = [documents[j].content for j, label in enumerate(cluster_labels) if label == i]
            
            # Generate cluster label (most common words)
            all_words = " ".join(cluster_content).lower().split()
            word_freq = {}
            for word in all_words:
                if len(word) > 3:  # Skip short words
                    word_freq[word] = word_freq.get(word, 0) + 1
            
            top_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)[:3]
            cluster_label = " & ".join([word for word, freq in top_words])
            
            cluster_info = ClusterInfo(
                cluster_id=i,
                centroid=kmeans.cluster_centers_[i].tolist(),
                documents=cluster_docs,
                label=cluster_label or f"Cluster {i}",
                coherence_score=float(np.mean([similarity_matrix[j][k] for j in range(len(cluster_docs)) for k in range(j+1, len(cluster_docs))])) if len(cluster_docs) > 1 else 1.0,
                topics=[cluster_label]
            )
            clusters.append(cluster_info)
        
        # Dimensionality reduction for visualization
        dimensionality_reduction = {}
        
        if len(embeddings) > 3:
            # t-SNE reduction
            try:
                tsne = TSNE(n_components=2, random_state=42, perplexity=min(30, len(embeddings)-1))
                tsne_coords = tsne.fit_transform(embeddings_array)
                dimensionality_reduction['tsne'] = [(float(x), float(y)) for x, y in tsne_coords]
            except:
                dimensionality_reduction['tsne'] = [(0, 0)] * len(embeddings)
            
            # UMAP reduction (if available)
            try:
                umap_reducer = umap.UMAP(n_components=2, random_state=42)
                umap_coords = umap_reducer.fit_transform(embeddings_array)
                dimensionality_reduction['umap'] = [(float(x), float(y)) for x, y in umap_coords]
            except:
                dimensionality_reduction['umap'] = [(0, 0)] * len(embeddings)
        
        return SimilarityMatrix(
            document_ids=doc_ids,
            similarity_matrix=similarity_list,
            clustering_info=clusters,
            dimensionality_reduction=dimensionality_reduction
        )
    
    async def get_embedding_statistics(self) -> Dict[str, Any]:
        """Get statistics about the vector storage"""
        
        collection_stats = {}
        for doc_type, collection in self.collections.items():
            try:
                count = collection.count()
                collection_stats[doc_type.value] = count
            except:
                collection_stats[doc_type.value] = 0
        
        return {
            'total_documents': sum(collection_stats.values()),
            'documents_by_type': collection_stats,
            'embedding_model': self.embedding_model_name.value,
            'embedding_dimension': self.embedding_dimension,
            'device': self.device,
            'cache_size': len(self.embedding_cache),
            'cache_hit_rate': self.stats['cache_hits'] / max(1, self.stats['total_searches']),
            'avg_embedding_time': self.stats['embedding_generation_time'] / max(1, self.stats['total_documents']),
            'total_searches': self.stats['total_searches']
        }
    
    async def clear_collection(self, document_type: DocumentType):
        """Clear all documents from a collection"""
        try:
            collection = self.collections[document_type]
            # ChromaDB doesn't have a direct clear method, so we delete and recreate
            self.chroma_client.delete_collection(f"meetingmind_{document_type.value}")
            self._initialize_collections()
            self.logger.info(f"Cleared collection: {document_type.value}")
        except Exception as e:
            self.logger.error(f"Failed to clear collection {document_type.value}: {e}")
    
    async def close(self):
        """Clean up resources"""
        # Clear embedding cache
        self.embedding_cache.clear()
        
        # Clear model from memory if using GPU
        if self.embedding_model and self.device == "cuda":
            del self.embedding_model
            torch.cuda.empty_cache()
        
        self.logger.info("Vector storage service closed")

# Global vector storage service instance
vector_storage_service = None

async def get_vector_storage_service() -> VectorStorageService:
    """Get the global vector storage service instance"""
    global vector_storage_service
    if vector_storage_service is None:
        vector_storage_service = VectorStorageService()
    return vector_storage_service

async def initialize_vector_storage(storage_path: str = "./chroma_db",
                                  embedding_model: EmbeddingModel = EmbeddingModel.SENTENCE_TRANSFORMERS_BASE) -> VectorStorageService:
    """Initialize the vector storage service"""
    global vector_storage_service
    vector_storage_service = VectorStorageService(storage_path, embedding_model)
    return vector_storage_service