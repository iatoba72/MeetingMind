// Collaborative Highlighting and Annotations System
// React component for real-time collaborative annotations

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Highlighter, 
  MessageCircle, 
  Edit, 
  Trash2, 
  Plus,
  Eye,
  EyeOff
} from 'lucide-react';

interface AnnotationData {
  id: string;
  type: 'highlight' | 'comment' | 'suggestion';
  startOffset: number;
  endOffset: number;
  text: string;
  content: string;
  author: string;
  authorName: string;
  authorColor: string;
  createdAt: string;
  updatedAt?: string;
  resolved?: boolean;
  replies?: AnnotationReply[];
  tags?: string[];
  color?: string;
}

interface AnnotationReply {
  id: string;
  content: string;
  author: string;
  authorName: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

interface AnnotationSystemProps {
  documentContent: string;
  annotations: AnnotationData[];
  currentUser: User;
  users: User[];
  onAddAnnotation: (annotation: Omit<AnnotationData, 'id' | 'createdAt'>) => void;
  onUpdateAnnotation: (id: string, updates: Partial<AnnotationData>) => void;
  onDeleteAnnotation: (id: string) => void;
  onAddReply: (annotationId: string, reply: Omit<AnnotationReply, 'id' | 'createdAt'>) => void;
  readOnly?: boolean;
}

interface Selection {
  startOffset: number;
  endOffset: number;
  text: string;
}

export const AnnotationSystem: React.FC<AnnotationSystemProps> = ({
  documentContent,
  annotations,
  currentUser,
  users: _users, // eslint-disable-line @typescript-eslint/no-unused-vars
  onAddAnnotation,
  onUpdateAnnotation,
  onDeleteAnnotation,
  onAddReply,
  readOnly = false
}) => {
  const [selectedText, setSelectedText] = useState<Selection | null>(null);
  const [showAnnotationModal, setShowAnnotationModal] = useState(false);
  const [activeAnnotation, setActiveAnnotation] = useState<string | null>(null);
  const [annotationType, setAnnotationType] = useState<'highlight' | 'comment' | 'suggestion'>('highlight');
  const [annotationContent, setAnnotationContent] = useState('');
  const [annotationColor, setAnnotationColor] = useState('#FFD700');
  const [annotationTags, setAnnotationTags] = useState<string[]>([]);
  const [filterBy, setFilterBy] = useState<'all' | 'unresolved' | 'mine'>('all');
  const [hideResolved, setHideResolved] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [replyText, setReplyText] = useState<{ [key: string]: string }>({});

  const contentRef = useRef<HTMLDivElement>(null);

  // Available annotation colors
  const annotationColors = [
    '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', 
    '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'
  ];

  // Filter annotations based on current filters
  const filteredAnnotations = useMemo(() => {
    return annotations.filter(annotation => {
      if (hideResolved && annotation.resolved) return false;
      
      switch (filterBy) {
        case 'unresolved':
          return !annotation.resolved;
        case 'mine':
          return annotation.author === currentUser.id;
        default:
          return true;
      }
    });
  }, [annotations, filterBy, hideResolved, currentUser.id]);

  // Handle text selection
  const handleTextSelection = useCallback(() => {
    if (readOnly) return;

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      setSelectedText(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const selectedText = selection.toString().trim();
    
    if (selectedText.length === 0) {
      setSelectedText(null);
      return;
    }

    // Calculate offsets relative to document content
    const startOffset = getTextOffset(range.startContainer, range.startOffset);
    const endOffset = getTextOffset(range.endContainer, range.endOffset);

    if (startOffset !== -1 && endOffset !== -1) {
      setSelectedText({
        startOffset,
        endOffset,
        text: selectedText
      });
    }
  }, [readOnly]);

  // Calculate text offset within document
  const getTextOffset = (node: Node, offset: number): number => {
    if (!contentRef.current) return -1;
    
    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    let totalOffset = 0;
    let currentNode;

    while ((currentNode = walker.nextNode())) {
      if (currentNode === node) {
        return totalOffset + offset;
      }
      totalOffset += currentNode.textContent?.length || 0;
    }

    return -1;
  };

  // Render document content with annotations
  const renderAnnotatedContent = () => {
    if (!documentContent) return null;

    // Sort annotations by start position
    const sortedAnnotations = [...filteredAnnotations].sort((a, b) => a.startOffset - b.startOffset);
    
    let content = documentContent;
    let offset = 0;

    // Insert annotation markers
    sortedAnnotations.forEach(annotation => {
      const startPos = annotation.startOffset + offset;
      const endPos = annotation.endOffset + offset;
      
      const beforeText = content.substring(0, startPos);
      const annotatedText = content.substring(startPos, endPos);
      const afterText = content.substring(endPos);

      const annotationClass = `annotation annotation-${annotation.type}`;
      const isActive = activeAnnotation === annotation.id;
      const style = `background-color: ${annotation.color || annotation.authorColor}; opacity: ${isActive ? '0.8' : '0.3'};`;

      const annotationMarkup = `<span class="${annotationClass}" data-annotation-id="${annotation.id}" style="${style}">${annotatedText}</span>`;
      
      content = beforeText + annotationMarkup + afterText;
      offset += annotationMarkup.length - annotatedText.length;
    });

    return { __html: content };
  };

  // Handle annotation click
  const handleAnnotationClick = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement;
    const annotationElement = target.closest('[data-annotation-id]');
    
    if (annotationElement) {
      const annotationId = annotationElement.getAttribute('data-annotation-id');
      setActiveAnnotation(annotationId === activeAnnotation ? null : annotationId);
    }
  };

  // Create new annotation
  const createAnnotation = () => {
    if (!selectedText) return;

    const newAnnotation: Omit<AnnotationData, 'id' | 'createdAt'> = {
      type: annotationType,
      startOffset: selectedText.startOffset,
      endOffset: selectedText.endOffset,
      text: selectedText.text,
      content: annotationContent,
      author: currentUser.id,
      authorName: currentUser.name,
      authorColor: currentUser.color,
      color: annotationType === 'highlight' ? annotationColor : currentUser.color,
      tags: annotationTags,
      resolved: false
    };

    onAddAnnotation(newAnnotation);
    
    // Reset form
    setSelectedText(null);
    setShowAnnotationModal(false);
    setAnnotationContent('');
    setAnnotationTags([]);
    
    // Clear selection
    window.getSelection()?.removeAllRanges();
  };

  // Add reply to annotation
  const addReply = (annotationId: string) => {
    const text = replyText[annotationId]?.trim();
    if (!text) return;

    const reply: Omit<AnnotationReply, 'id' | 'createdAt'> = {
      content: text,
      author: currentUser.id,
      authorName: currentUser.name
    };

    onAddReply(annotationId, reply);
    setReplyText({ ...replyText, [annotationId]: '' });
  };

  // Get annotation by ID
  const getAnnotation = (id: string) => annotations.find(a => a.id === id);

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      // Debounce selection changes
      setTimeout(handleTextSelection, 10);
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleTextSelection]);

  return (
    <div className="annotation-system flex h-full">
      {/* Main content area */}
      <div className="flex-1 relative">
        {/* Content with annotations */}
        <div
          ref={contentRef}
          className="p-6 prose max-w-none"
          onMouseUp={handleTextSelection}
          onClick={handleAnnotationClick}
          dangerouslySetInnerHTML={renderAnnotatedContent()}
        />

        {/* Selection toolbar */}
        {selectedText && !readOnly && (
          <div className="absolute bg-white shadow-lg border rounded-lg p-3 z-10"
               style={{
                 top: '50%',
                 left: '50%',
                 transform: 'translate(-50%, -50%)'
               }}>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setAnnotationType('highlight');
                  setShowAnnotationModal(true);
                }}
                className="flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded hover:bg-yellow-200"
                title="Add Highlight"
              >
                <Highlighter size={16} />
                Highlight
              </button>
              
              <button
                onClick={() => {
                  setAnnotationType('comment');
                  setShowAnnotationModal(true);
                }}
                className="flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-800 rounded hover:bg-blue-200"
                title="Add Comment"
              >
                <MessageCircle size={16} />
                Comment
              </button>
              
              <button
                onClick={() => {
                  setAnnotationType('suggestion');
                  setShowAnnotationModal(true);
                }}
                className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-800 rounded hover:bg-green-200"
                title="Add Suggestion"
              >
                <Edit size={16} />
                Suggest
              </button>
            </div>
          </div>
        )}

        {/* Active annotation details */}
        {activeAnnotation && (
          <div className="absolute right-4 top-4 w-80 bg-white shadow-lg border rounded-lg p-4 z-20">
            {(() => {
              const annotation = getAnnotation(activeAnnotation);
              if (!annotation) return null;

              return (
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: annotation.authorColor }}
                      />
                      <span className="font-medium text-sm">{annotation.authorName}</span>
                      <span className="text-xs text-gray-500">{formatDate(annotation.createdAt)}</span>
                    </div>
                    
                    {annotation.author === currentUser.id && !readOnly && (
                      <button
                        onClick={() => onDeleteAnnotation(annotation.id)}
                        className="text-red-500 hover:text-red-700"
                        title="Delete annotation"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>

                  <div className="mb-3">
                    <div className="text-sm font-medium text-gray-600 mb-1">
                      {annotation.type === 'highlight' && 'Highlighted text:'}
                      {annotation.type === 'comment' && 'Comment on:'}
                      {annotation.type === 'suggestion' && 'Suggestion for:'}
                    </div>
                    <div className="text-sm bg-gray-100 p-2 rounded italic">
                      "{annotation.text}"
                    </div>
                  </div>

                  {annotation.content && (
                    <div className="mb-3">
                      <div className="text-sm">{annotation.content}</div>
                    </div>
                  )}

                  {annotation.tags && annotation.tags.length > 0 && (
                    <div className="mb-3">
                      <div className="flex flex-wrap gap-1">
                        {annotation.tags.map(tag => (
                          <span key={tag} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Replies */}
                  {annotation.replies && annotation.replies.length > 0 && (
                    <div className="mb-3 border-t pt-3">
                      <div className="text-sm font-medium mb-2">Replies:</div>
                      {annotation.replies.map(reply => (
                        <div key={reply.id} className="mb-2 bg-gray-50 p-2 rounded">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{reply.authorName}</span>
                            <span className="text-xs text-gray-500">{formatDate(reply.createdAt)}</span>
                          </div>
                          <div className="text-sm">{reply.content}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add reply */}
                  {!readOnly && (
                    <div className="border-t pt-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Add a reply..."
                          value={replyText[annotation.id] || ''}
                          onChange={(e) => setReplyText({ ...replyText, [annotation.id]: e.target.value })}
                          className="flex-1 text-sm border rounded px-2 py-1"
                          onKeyPress={(e) => e.key === 'Enter' && addReply(annotation.id)}
                        />
                        <button
                          onClick={() => addReply(annotation.id)}
                          className="text-blue-500 hover:text-blue-700"
                          disabled={!replyText[annotation.id]?.trim()}
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Mark as resolved */}
                  {!readOnly && annotation.type !== 'highlight' && (
                    <div className="border-t pt-3 mt-3">
                      <button
                        onClick={() => onUpdateAnnotation(annotation.id, { resolved: !annotation.resolved })}
                        className={`text-sm px-3 py-1 rounded ${
                          annotation.resolved 
                            ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                            : 'bg-green-100 text-green-800 hover:bg-green-200'
                        }`}
                      >
                        {annotation.resolved ? 'Reopen' : 'Mark as Resolved'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Sidebar */}
      {showSidebar && (
        <div className="w-80 border-l bg-gray-50 flex flex-col">
          {/* Sidebar header */}
          <div className="p-4 border-b bg-white">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium">Annotations</h3>
              <button
                onClick={() => setShowSidebar(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <EyeOff size={16} />
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-2 mb-3">
              <select
                value={filterBy}
                onChange={(e) => setFilterBy(e.target.value as 'all' | 'unresolved' | 'mine')}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="all">All</option>
                <option value="unresolved">Unresolved</option>
                <option value="mine">Mine</option>
              </select>

              <label className="flex items-center gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={hideResolved}
                  onChange={(e) => setHideResolved(e.target.checked)}
                />
                Hide resolved
              </label>
            </div>

            <div className="text-sm text-gray-500">
              {filteredAnnotations.length} annotation{filteredAnnotations.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Annotations list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredAnnotations.map(annotation => (
              <div
                key={annotation.id}
                className={`p-3 bg-white rounded border cursor-pointer transition-all ${
                  activeAnnotation === annotation.id ? 'border-blue-500 shadow-sm' : 'hover:border-gray-300'
                }`}
                onClick={() => setActiveAnnotation(annotation.id)}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div 
                    className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                    style={{ backgroundColor: annotation.authorColor }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium">{annotation.authorName}</span>
                      <span className="text-xs text-gray-500">{formatDate(annotation.createdAt)}</span>
                      {annotation.resolved && (
                        <span className="text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded">
                          Resolved
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 truncate">
                      "{annotation.text}"
                    </div>
                    {annotation.content && (
                      <div className="text-sm mt-1">{annotation.content}</div>
                    )}
                  </div>
                </div>

                {annotation.tags && annotation.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {annotation.tags.map(tag => (
                      <span key={tag} className="text-xs bg-blue-100 text-blue-800 px-1 py-0.5 rounded">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {filteredAnnotations.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <MessageCircle size={48} className="mx-auto mb-3 opacity-50" />
                <div>No annotations found</div>
                <div className="text-sm">Select text to add annotations</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle sidebar button */}
      {!showSidebar && (
        <button
          onClick={() => setShowSidebar(true)}
          className="fixed right-4 top-1/2 transform -translate-y-1/2 bg-white shadow-lg border rounded-full p-2 z-10"
          title="Show annotations"
        >
          <Eye size={16} />
        </button>
      )}

      {/* Annotation modal */}
      {showAnnotationModal && selectedText && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96 max-w-full mx-4">
            <h3 className="font-medium mb-4">
              Add {annotationType === 'highlight' ? 'Highlight' : annotationType === 'comment' ? 'Comment' : 'Suggestion'}
            </h3>

            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Selected text:</label>
              <div className="text-sm bg-gray-100 p-2 rounded italic">
                "{selectedText.text}"
              </div>
            </div>

            {annotationType !== 'highlight' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">
                  {annotationType === 'comment' ? 'Comment:' : 'Suggestion:'}
                </label>
                <textarea
                  value={annotationContent}
                  onChange={(e) => setAnnotationContent(e.target.value)}
                  className="w-full border rounded p-2 text-sm"
                  rows={3}
                  placeholder={`Enter your ${annotationType}...`}
                />
              </div>
            )}

            {annotationType === 'highlight' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Color:</label>
                <div className="flex gap-2">
                  {annotationColors.map(color => (
                    <button
                      key={color}
                      onClick={() => setAnnotationColor(color)}
                      className={`w-8 h-8 rounded border-2 ${annotationColor === color ? 'border-gray-800' : 'border-gray-300'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowAnnotationModal(false);
                  setSelectedText(null);
                  setAnnotationContent('');
                  window.getSelection()?.removeAllRanges();
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={createAnnotation}
                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                disabled={annotationType !== 'highlight' && !annotationContent.trim()}
              >
                Add {annotationType === 'highlight' ? 'Highlight' : annotationType === 'comment' ? 'Comment' : 'Suggestion'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .annotation {
          border-radius: 2px;
          cursor: pointer;
          transition: opacity 0.2s;
        }
        
        .annotation:hover {
          opacity: 0.6 !important;
        }
        
        .annotation-highlight {
          border-bottom: 2px solid currentColor;
        }
        
        .annotation-comment {
          border-left: 3px solid currentColor;
          padding-left: 2px;
        }
        
        .annotation-suggestion {
          border: 1px dashed currentColor;
          padding: 1px;
        }
      `}</style>
    </div>
  );
};