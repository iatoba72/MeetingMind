# Vector Search API Endpoints
# REST API endpoints for vector storage and semantic search functionality

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from datetime import datetime
import logging

from vector_storage_service import (
    get_vector_storage_service, VectorStorageService,
    DocumentType, SearchMode, VectorDocument, SearchResult
)
from semantic_search_service import (
    get_semantic_search_service, SemanticSearchService,
    SearchContextInfo, EnhancedSearchResult
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/vector", tags=["vector_search"])
semantic_router = APIRouter(prefix="/api/semantic", tags=["semantic_search"])

# Request/Response Models

class AddDocumentRequest(BaseModel):
    content: str = Field(..., description="Document content to embed")
    document_type: str = Field(..., description="Type of document")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional metadata")
    document_id: Optional[str] = Field(None, description="Optional custom document ID")

class AddDocumentResponse(BaseModel):
    document_id: str
    success: bool
    message: str

class BatchAddDocumentsRequest(BaseModel):
    documents: List[AddDocumentRequest]

class BatchAddDocumentsResponse(BaseModel):
    document_ids: List[str]
    success_count: int
    failed_count: int
    errors: List[str]

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    document_types: Optional[List[str]] = Field(None, description="Filter by document types")
    search_mode: str = Field("semantic", description="Search mode")
    limit: int = Field(10, description="Maximum number of results")
    metadata_filter: Optional[Dict[str, Any]] = Field(None, description="Metadata filters")
    similarity_threshold: float = Field(0.3, description="Minimum similarity threshold")
    context: Optional[Dict[str, Any]] = Field(None, description="Search context")

class AdvancedSearchRequest(BaseModel):
    query: str = Field(..., description="Search query")
    context: Optional[Dict[str, Any]] = Field(None, description="Search context")
    limit: int = Field(10, description="Maximum number of results")

class SimilarityMatrixRequest(BaseModel):
    document_ids: Optional[List[str]] = Field(None, description="Specific document IDs")
    document_types: Optional[List[str]] = Field(None, description="Document types to include")
    max_documents: int = Field(100, description="Maximum documents to analyze")

class DocumentSearchRequest(BaseModel):
    metadata_filter: Dict[str, Any] = Field(..., description="Metadata filter criteria")
    document_types: Optional[List[str]] = Field(None, description="Document types to search")

class EmbeddingRequest(BaseModel):
    text: str = Field(..., description="Text to embed")

class EmbeddingResponse(BaseModel):
    embedding: List[float]
    dimension: int
    model: str

# Dependency to get vector storage service
async def get_vector_service() -> VectorStorageService:
    return await get_vector_storage_service()

# Dependency to get semantic search service
async def get_semantic_service() -> SemanticSearchService:
    return await get_semantic_search_service()

# Vector Storage Endpoints

@router.post("/documents", response_model=AddDocumentResponse)
async def add_document(
    request: AddDocumentRequest,
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Add a document to the vector store with automatic embedding generation
    """
    try:
        # Convert string document type to enum
        doc_type = DocumentType(request.document_type)
        
        document_id = await vector_service.add_document(
            content=request.content,
            document_type=doc_type,
            metadata=request.metadata,
            document_id=request.document_id
        )
        
        return AddDocumentResponse(
            document_id=document_id,
            success=True,
            message="Document added successfully"
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid document type: {e}")
    except Exception as e:
        logger.error(f"Failed to add document: {e}")
        raise HTTPException(status_code=500, detail="Failed to add document")

@router.post("/documents/batch", response_model=BatchAddDocumentsResponse)
async def batch_add_documents(
    request: BatchAddDocumentsRequest,
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Add multiple documents to the vector store in batch
    """
    document_ids = []
    errors = []
    
    for i, doc_request in enumerate(request.documents):
        try:
            doc_type = DocumentType(doc_request.document_type)
            
            document_id = await vector_service.add_document(
                content=doc_request.content,
                document_type=doc_type,
                metadata=doc_request.metadata,
                document_id=doc_request.document_id
            )
            
            document_ids.append(document_id)
            
        except Exception as e:
            error_msg = f"Document {i}: {str(e)}"
            errors.append(error_msg)
            logger.error(f"Failed to add document {i}: {e}")
    
    return BatchAddDocumentsResponse(
        document_ids=document_ids,
        success_count=len(document_ids),
        failed_count=len(errors),
        errors=errors
    )

@router.post("/search")
async def semantic_search(
    request: SemanticSearchRequest,
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Perform semantic search across the vector store
    """
    try:
        # Convert document types to enums
        document_types = None
        if request.document_types:
            document_types = [DocumentType(dt) for dt in request.document_types]
        
        # Convert search mode to enum
        search_mode = SearchMode(request.search_mode)
        
        results = await vector_service.semantic_search(
            query=request.query,
            document_types=document_types,
            search_mode=search_mode,
            limit=request.limit,
            metadata_filter=request.metadata_filter,
            similarity_threshold=request.similarity_threshold
        )
        
        # Convert results to JSON-serializable format
        return [
            {
                "document": {
                    "id": result.document.id,
                    "content": result.document.content,
                    "document_type": result.document.document_type.value,
                    "metadata": result.document.metadata,
                    "created_at": result.document.created_at.isoformat(),
                    "updated_at": result.document.updated_at.isoformat()
                },
                "similarity_score": result.similarity_score,
                "distance": result.distance,
                "rank": result.rank,
                "explanation": result.explanation
            }
            for result in results
        ]
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {e}")
    except Exception as e:
        logger.error(f"Semantic search failed: {e}")
        raise HTTPException(status_code=500, detail="Search failed")

@router.get("/similar-meetings/{meeting_id}")
async def find_similar_meetings(
    meeting_id: str,
    limit: int = Query(5, description="Maximum number of similar meetings"),
    similarity_threshold: float = Query(0.6, description="Minimum similarity threshold"),
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Find meetings similar to the specified meeting
    """
    try:
        results = await vector_service.find_similar_meetings(
            meeting_id=meeting_id,
            limit=limit,
            similarity_threshold=similarity_threshold
        )
        
        return [
            {
                "document": {
                    "id": result.document.id,
                    "content": result.document.content,
                    "document_type": result.document.document_type.value,
                    "metadata": result.document.metadata,
                    "created_at": result.document.created_at.isoformat(),
                    "updated_at": result.document.updated_at.isoformat()
                },
                "similarity_score": result.similarity_score,
                "distance": result.distance,
                "rank": result.rank,
                "explanation": result.explanation
            }
            for result in results
        ]
        
    except Exception as e:
        logger.error(f"Similar meetings search failed: {e}")
        raise HTTPException(status_code=500, detail="Similar meetings search failed")

@router.post("/similarity-matrix")
async def generate_similarity_matrix(
    request: SimilarityMatrixRequest,
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Generate similarity matrix for document clustering and visualization
    """
    try:
        # Convert document types to enums
        document_types = None
        if request.document_types:
            document_types = [DocumentType(dt) for dt in request.document_types]
        
        matrix = await vector_service.generate_similarity_matrix(
            document_ids=request.document_ids,
            document_types=document_types,
            max_documents=request.max_documents
        )
        
        return {
            "document_ids": matrix.document_ids,
            "similarity_matrix": matrix.similarity_matrix,
            "clustering_info": [
                {
                    "cluster_id": cluster.cluster_id,
                    "centroid": cluster.centroid,
                    "documents": cluster.documents,
                    "label": cluster.label,
                    "coherence_score": cluster.coherence_score,
                    "topics": cluster.topics
                }
                for cluster in matrix.clustering_info
            ],
            "dimensionality_reduction": matrix.dimensionality_reduction
        }
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {e}")
    except Exception as e:
        logger.error(f"Similarity matrix generation failed: {e}")
        raise HTTPException(status_code=500, detail="Similarity matrix generation failed")

@router.post("/documents/search")
async def search_documents_by_metadata(
    request: DocumentSearchRequest,
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Search documents by metadata criteria
    """
    try:
        # Convert document types to enums
        document_types = None
        if request.document_types:
            document_types = [DocumentType(dt) for dt in request.document_types]
        
        documents = await vector_service.get_documents_by_metadata(
            metadata_filter=request.metadata_filter,
            document_types=document_types
        )
        
        return [
            {
                "id": doc.id,
                "content": doc.content,
                "document_type": doc.document_type.value,
                "metadata": doc.metadata,
                "created_at": doc.created_at.isoformat(),
                "updated_at": doc.updated_at.isoformat()
            }
            for doc in documents
        ]
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid parameter: {e}")
    except Exception as e:
        logger.error(f"Document search failed: {e}")
        raise HTTPException(status_code=500, detail="Document search failed")

@router.post("/embedding", response_model=EmbeddingResponse)
async def generate_embedding(
    request: EmbeddingRequest,
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Generate embedding for text (for analysis purposes)
    """
    try:
        embedding = await vector_service.generate_embedding(request.text)
        
        return EmbeddingResponse(
            embedding=embedding,
            dimension=len(embedding),
            model=vector_service.embedding_model_name.value
        )
        
    except Exception as e:
        logger.error(f"Embedding generation failed: {e}")
        raise HTTPException(status_code=500, detail="Embedding generation failed")

@router.get("/statistics")
async def get_embedding_statistics(
    vector_service: VectorStorageService = Depends(get_vector_service)
):
    """
    Get comprehensive statistics about the vector storage
    """
    try:
        stats = await vector_service.get_embedding_statistics()
        return stats
        
    except Exception as e:
        logger.error(f"Statistics retrieval failed: {e}")
        raise HTTPException(status_code=500, detail="Statistics retrieval failed")

# Semantic Search Endpoints

@semantic_router.post("/search")
async def advanced_semantic_search(
    request: AdvancedSearchRequest,
    semantic_service: SemanticSearchService = Depends(get_semantic_service)
):
    """
    Perform advanced semantic search with query analysis
    """
    try:
        # Convert context to SearchContextInfo if provided
        context = None
        if request.context:
            context = SearchContextInfo(
                meeting_id=request.context.get('meetingId'),
                speaker_filter=request.context.get('speakerFilter'),
                time_range=tuple(request.context['timeRange']) if request.context.get('timeRange') else None,
                topic_filter=request.context.get('topicFilter'),
                document_types=[DocumentType(dt) for dt in request.context.get('documentTypes', [])],
                priority_boost=request.context.get('priorityBoost', {})
            )
        
        # Perform search
        results = await semantic_service.search(
            query=request.query,
            context=context,
            limit=request.limit
        )
        
        # Analyze query
        query_analysis = await semantic_service.analyze_query(request.query, context)
        
        # Get suggestions
        suggestions = await semantic_service.get_search_suggestions(request.query[:20])
        
        return {
            "results": [
                {
                    "base_result": {
                        "document": {
                            "id": result.base_result.document.id,
                            "content": result.base_result.document.content,
                            "document_type": result.base_result.document.document_type.value,
                            "metadata": result.base_result.document.metadata,
                            "created_at": result.base_result.document.created_at.isoformat(),
                            "updated_at": result.base_result.document.updated_at.isoformat()
                        },
                        "similarity_score": result.base_result.similarity_score,
                        "distance": result.base_result.distance,
                        "rank": result.base_result.rank,
                        "explanation": result.base_result.explanation
                    },
                    "context_score": result.context_score,
                    "relevance_explanation": result.relevance_explanation,
                    "related_documents": result.related_documents,
                    "snippet": result.snippet,
                    "highlights": result.highlights,
                    "meeting_context": result.meeting_context
                }
                for result in results
            ],
            "query_analysis": {
                "query_type": query_analysis.query_type.value,
                "intent": query_analysis.intent,
                "entities": query_analysis.entities,
                "keywords": query_analysis.keywords,
                "confidence": query_analysis.confidence
            },
            "suggestions": [
                {
                    "suggestion": suggestion.suggestion,
                    "description": suggestion.description,
                    "query_type": suggestion.query_type.value,
                    "estimated_results": suggestion.estimated_results
                }
                for suggestion in suggestions
            ]
        }
        
    except Exception as e:
        logger.error(f"Advanced semantic search failed: {e}")
        raise HTTPException(status_code=500, detail="Advanced search failed")

@semantic_router.get("/suggestions")
async def get_search_suggestions(
    query: str = Query(..., description="Partial search query"),
    limit: int = Query(5, description="Maximum number of suggestions"),
    semantic_service: SemanticSearchService = Depends(get_semantic_service)
):
    """
    Get search suggestions for query completion
    """
    try:
        suggestions = await semantic_service.get_search_suggestions(query, limit)
        
        return [
            {
                "suggestion": suggestion.suggestion,
                "description": suggestion.description,
                "query_type": suggestion.query_type.value,
                "estimated_results": suggestion.estimated_results
            }
            for suggestion in suggestions
        ]
        
    except Exception as e:
        logger.error(f"Search suggestions failed: {e}")
        raise HTTPException(status_code=500, detail="Search suggestions failed")

@semantic_router.get("/statistics")
async def get_search_statistics(
    semantic_service: SemanticSearchService = Depends(get_semantic_service)
):
    """
    Get comprehensive search statistics
    """
    try:
        stats = await semantic_service.get_search_statistics()
        return stats
        
    except Exception as e:
        logger.error(f"Search statistics retrieval failed: {e}")
        raise HTTPException(status_code=500, detail="Search statistics retrieval failed")

# Health check endpoint
@router.get("/health")
async def health_check():
    """
    Health check for vector search services
    """
    try:
        vector_service = await get_vector_storage_service()
        semantic_service = await get_semantic_search_service()
        
        # Test basic functionality
        test_embedding = await vector_service.generate_embedding("test")
        
        return {
            "status": "healthy",
            "vector_service": "operational",
            "semantic_service": "operational",
            "embedding_dimension": len(test_embedding) if test_embedding else 0,
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
        )

# Include routers in main app
def include_vector_routes(app):
    """Include vector search routes in FastAPI app"""
    app.include_router(router)
    app.include_router(semantic_router)