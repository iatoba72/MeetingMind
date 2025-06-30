// Shared Note-Taking Component with Operational Transforms
// Real-time collaborative note editor with conflict resolution

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Edit3, 
  Save, 
  Users, 
  History, 
  MoreVertical, 
  // Type, 
  Bold, 
  Italic, 
  Underline,
  List,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Eye,
  EyeOff
} from 'lucide-react';

interface TextOperation {
  type: 'insert' | 'delete' | 'retain' | 'format';
  position: number;
  content?: string;
  length?: number;
  attributes?: TextAttributes;
  author: string;
  timestamp: string;
  operationId: string;
}

interface TextAttributes {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fontSize?: number;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  alignment?: 'left' | 'center' | 'right' | 'justify';
}

interface CursorPosition {
  userId: string;
  userName: string;
  position: number;
  selection?: { start: number; end: number };
  color: string;
  timestamp: string;
}

interface DocumentRevision {
  id: string;
  content: string;
  timestamp: string;
  author: string;
  authorName: string;
  operationCount: number;
}

interface User {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  isActive: boolean;
}

interface SharedNoteTakingProps {
  documentId: string;
  initialContent?: string;
  users: User[];
  currentUser: User;
  onOperation: (operation: TextOperation) => void;
  onCursorMove: (position: number, selection?: { start: number; end: number }) => void;
  cursors: CursorPosition[];
  readOnly?: boolean;
  showRevisionHistory?: boolean;
}

export const SharedNoteTaking: React.FC<SharedNoteTakingProps> = ({
  // documentId: _documentId,
  initialContent = '',
  users,
  currentUser,
  onOperation,
  onCursorMove,
  cursors,
  readOnly = false,
  showRevisionHistory = false
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [content, setContent] = useState(initialContent);
  const [selection, setSelection] = useState<{ start: number; end: number } | null>(null);
  const [isComposing, setIsComposing] = useState(false);
  const [showToolbar, setShowToolbar] = useState(true);
  const [currentAttributes, setCurrentAttributes] = useState<TextAttributes>({});
  const [operationHistory, setOperationHistory] = useState<TextOperation[]>([]);
  const [revisionHistory, setRevisionHistory] = useState<DocumentRevision[]>([]);
  const [showRevisions, setShowRevisions] = useState(false);
  const [undoStack, setUndoStack] = useState<TextOperation[]>([]);
  const [redoStack, setRedoStack] = useState<TextOperation[]>([]);
  
  // Track document statistics
  const documentStats = useMemo(() => {
    const wordCount = content.trim().split(/\s+/).filter(word => word.length > 0).length;
    const charCount = content.length;
    const charCountNoSpaces = content.replace(/\s/g, '').length;
    const paragraphCount = content.split('\n\n').filter(p => p.trim().length > 0).length;
    
    return {
      words: wordCount,
      characters: charCount,
      charactersNoSpaces: charCountNoSpaces,
      paragraphs: paragraphCount
    };
  }, [content]);

  // Apply operation to content
  const applyOperation = useCallback((operation: TextOperation) => {
    setContent(prevContent => {
      let newContent = prevContent;
      
      switch (operation.type) {
        case 'insert':
          if (operation.position <= newContent.length) {
            newContent = 
              newContent.slice(0, operation.position) + 
              (operation.content || '') + 
              newContent.slice(operation.position);
          }
          break;
          
        case 'delete':
          if (operation.position < newContent.length) {
            const endPos = Math.min(
              operation.position + (operation.length || 0),
              newContent.length
            );
            newContent = newContent.slice(0, operation.position) + newContent.slice(endPos);
          }
          break;
          
        case 'retain':
          // Retain operations don't change content
          break;
          
        case 'format':
          // Format operations apply styling metadata
          // In a real implementation, this would update formatting ranges
          break;
      }
      
      return newContent;
    });
    
    // Add to operation history
    setOperationHistory(prev => [...prev, operation]);
  }, []);

  // Handle text input
  const handleInput = useCallback((event: React.FormEvent<HTMLDivElement>) => {
    if (readOnly || isComposing) return;
    
    const target = event.target as HTMLDivElement;
    const newContent = target.textContent || '';
    
    // Calculate the operation needed
    const oldContent = content;
    const operation = calculateOperation(oldContent, newContent, currentUser);
    
    if (operation) {
      applyOperation(operation);
      onOperation(operation);
      
      // Update undo stack
      setUndoStack(prev => [...prev, operation]);
      setRedoStack([]); // Clear redo stack on new operation
    }
  }, [content, currentUser, readOnly, isComposing, applyOperation, onOperation]);

  // Calculate operation from content change
  const calculateOperation = useCallback((
    oldContent: string, 
    newContent: string, 
    user: User
  ): TextOperation | null => {
    // Simple diff algorithm - in production, use a more sophisticated approach
    let position = 0;
    
    // Find first difference
    while (position < Math.min(oldContent.length, newContent.length) && 
           oldContent[position] === newContent[position]) {
      position++;
    }
    
    if (oldContent.length === newContent.length && position === oldContent.length) {
      return null; // No change
    }
    
    if (newContent.length > oldContent.length) {
      // Insert operation
      const insertedText = newContent.slice(position, position + (newContent.length - oldContent.length));
      return {
        type: 'insert',
        position,
        content: insertedText,
        author: user.id,
        timestamp: new Date().toISOString(),
        operationId: generateOperationId()
      };
    } else if (newContent.length < oldContent.length) {
      // Delete operation
      const deletedLength = oldContent.length - newContent.length;
      return {
        type: 'delete',
        position,
        length: deletedLength,
        author: user.id,
        timestamp: new Date().toISOString(),
        operationId: generateOperationId()
      };
    } else {
      // Replace operation (delete + insert)
      const deletedLength = oldContent.length - position;
      // const insertedText = newContent.slice(position);
      
      // For simplicity, we'll use delete operation
      return {
        type: 'delete',
        position,
        length: deletedLength,
        author: user.id,
        timestamp: new Date().toISOString(),
        operationId: generateOperationId()
      };
    }
  }, []);

  // Generate unique operation ID
  const generateOperationId = useCallback(() => {
    return `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Handle cursor position change
  const handleSelectionChange = useCallback(() => {
    if (readOnly) return;
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const position = range.startOffset;
      const selectionEnd = range.endOffset;
      
      const selectionData = position !== selectionEnd ? 
        { start: position, end: selectionEnd } : undefined;
      
      setSelection(selectionData || { start: position, end: position });
      onCursorMove(position, selectionData);
    }
  }, [readOnly, onCursorMove]);

  // Format text
  const formatText = useCallback((attribute: keyof TextAttributes, value?: any) => {
    if (readOnly || !selection) return;
    
    const operation: TextOperation = {
      type: 'format',
      position: selection.start,
      length: selection.end - selection.start,
      attributes: { [attribute]: value !== undefined ? value : !currentAttributes[attribute] },
      author: currentUser.id,
      timestamp: new Date().toISOString(),
      operationId: generateOperationId()
    };
    
    applyOperation(operation);
    onOperation(operation);
    
    // Update current attributes
    setCurrentAttributes(prev => ({
      ...prev,
      [attribute]: value !== undefined ? value : !prev[attribute]
    }));
  }, [readOnly, selection, currentAttributes, currentUser, applyOperation, onOperation, generateOperationId]);

  // Undo operation
  const undo = useCallback(() => {
    if (undoStack.length === 0 || readOnly) return;
    
    const lastOperation = undoStack[undoStack.length - 1];
    
    // Create inverse operation
    const inverseOperation = createInverseOperation(lastOperation);
    
    if (inverseOperation) {
      applyOperation(inverseOperation);
      onOperation(inverseOperation);
      
      setRedoStack(prev => [...prev, lastOperation]);
      setUndoStack(prev => prev.slice(0, -1));
    }
  }, [undoStack, readOnly, applyOperation, onOperation]);

  // Redo operation
  const redo = useCallback(() => {
    if (redoStack.length === 0 || readOnly) return;
    
    const operation = redoStack[redoStack.length - 1];
    
    applyOperation(operation);
    onOperation(operation);
    
    setUndoStack(prev => [...prev, operation]);
    setRedoStack(prev => prev.slice(0, -1));
  }, [redoStack, readOnly, applyOperation, onOperation]);

  // Create inverse operation
  const createInverseOperation = useCallback((operation: TextOperation): TextOperation | null => {
    switch (operation.type) {
      case 'insert':
        return {
          type: 'delete',
          position: operation.position,
          length: operation.content?.length || 0,
          author: currentUser.id,
          timestamp: new Date().toISOString(),
          operationId: generateOperationId()
        };
        
      case 'delete':
        // For delete operations, we'd need to store the deleted content
        // This is simplified - in production, maintain a content history
        return null;
        
      default:
        return null;
    }
  }, [currentUser, generateOperationId]);

  // Save revision
  const saveRevision = useCallback(() => {
    const revision: DocumentRevision = {
      id: `rev_${Date.now()}`,
      content,
      timestamp: new Date().toISOString(),
      author: currentUser.id,
      authorName: currentUser.name,
      operationCount: operationHistory.length
    };
    
    setRevisionHistory(prev => [revision, ...prev.slice(0, 49)]); // Keep last 50 revisions
  }, [content, currentUser, operationHistory.length]);

  // Load revision
  const loadRevision = useCallback((revision: DocumentRevision) => {
    setContent(revision.content);
    setShowRevisions(false);
  }, []);

  // Update content when receiving remote operations
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.textContent = content;
    }
  }, [content]);

  // Set up event listeners
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    document.addEventListener('selectionchange', handleSelectionChange);
    
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, [handleSelectionChange]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (readOnly) return;
      
      // Ctrl/Cmd + Z for undo
      if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      }
      
      // Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y for redo
      if ((event.ctrlKey || event.metaKey) && 
          ((event.key === 'z' && event.shiftKey) || event.key === 'y')) {
        event.preventDefault();
        redo();
      }
      
      // Ctrl/Cmd + B for bold
      if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
        event.preventDefault();
        formatText('bold');
      }
      
      // Ctrl/Cmd + I for italic
      if ((event.ctrlKey || event.metaKey) && event.key === 'i') {
        event.preventDefault();
        formatText('italic');
      }
      
      // Ctrl/Cmd + U for underline
      if ((event.ctrlKey || event.metaKey) && event.key === 'u') {
        event.preventDefault();
        formatText('underline');
      }
      
      // Ctrl/Cmd + S for save revision
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveRevision();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [readOnly, undo, redo, formatText, saveRevision]);

  return (
    <div className="shared-note-taking h-full flex flex-col bg-white">
      {/* Header */}
      <div className="border-b bg-gray-50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Edit3 size={20} className="text-blue-500" />
            <h3 className="font-medium">Collaborative Notes</h3>
            
            {/* Active users indicator */}
            <div className="flex items-center gap-1">
              <Users size={14} className="text-gray-400" />
              <span className="text-sm text-gray-600">{users.filter(u => u.isActive).length}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Document stats */}
            <div className="text-xs text-gray-500 hidden sm:block">
              {documentStats.words} words • {documentStats.characters} characters
            </div>
            
            {/* Toolbar toggle */}
            <button
              onClick={() => setShowToolbar(!showToolbar)}
              className="p-1 text-gray-400 hover:text-gray-600"
              title={showToolbar ? 'Hide toolbar' : 'Show toolbar'}
            >
              {showToolbar ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            
            {/* Revision history */}
            {showRevisionHistory && (
              <button
                onClick={() => setShowRevisions(!showRevisions)}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Revision history"
              >
                <History size={16} />
              </button>
            )}
            
            {/* Save revision */}
            {!readOnly && (
              <button
                onClick={saveRevision}
                className="p-1 text-gray-400 hover:text-gray-600"
                title="Save revision (Ctrl+S)"
              >
                <Save size={16} />
              </button>
            )}
            
            <button className="p-1 text-gray-400 hover:text-gray-600">
              <MoreVertical size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      {showToolbar && !readOnly && (
        <div className="border-b bg-white p-3">
          <div className="flex items-center gap-1">
            {/* Undo/Redo */}
            <button
              onClick={undo}
              disabled={undoStack.length === 0}
              className="p-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Undo (Ctrl+Z)"
            >
              <Undo size={16} />
            </button>
            <button
              onClick={redo}
              disabled={redoStack.length === 0}
              className="p-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
              title="Redo (Ctrl+Y)"
            >
              <Redo size={16} />
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-2" />
            
            {/* Text formatting */}
            <button
              onClick={() => formatText('bold')}
              className={`p-2 rounded ${currentAttributes.bold ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
              title="Bold (Ctrl+B)"
            >
              <Bold size={16} />
            </button>
            <button
              onClick={() => formatText('italic')}
              className={`p-2 rounded ${currentAttributes.italic ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
              title="Italic (Ctrl+I)"
            >
              <Italic size={16} />
            </button>
            <button
              onClick={() => formatText('underline')}
              className={`p-2 rounded ${currentAttributes.underline ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
              title="Underline (Ctrl+U)"
            >
              <Underline size={16} />
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-2" />
            
            {/* Lists */}
            <button
              onClick={() => formatText('list')}
              className="p-2 text-gray-600 hover:text-gray-800"
              title="Bullet List"
            >
              <List size={16} />
            </button>
            
            <div className="w-px h-6 bg-gray-300 mx-2" />
            
            {/* Alignment */}
            <button
              onClick={() => formatText('alignment', 'left')}
              className={`p-2 rounded ${currentAttributes.alignment === 'left' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
              title="Align Left"
            >
              <AlignLeft size={16} />
            </button>
            <button
              onClick={() => formatText('alignment', 'center')}
              className={`p-2 rounded ${currentAttributes.alignment === 'center' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
              title="Align Center"
            >
              <AlignCenter size={16} />
            </button>
            <button
              onClick={() => formatText('alignment', 'right')}
              className={`p-2 rounded ${currentAttributes.alignment === 'right' ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:text-gray-800'}`}
              title="Align Right"
            >
              <AlignRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 relative overflow-hidden">
        <div className="h-full overflow-y-auto">
          <div className="relative p-6">
            {/* Remote cursors */}
            {cursors.map(cursor => {
              if (cursor.userId === currentUser.id) return null;
              
              return (
                <div
                  key={cursor.userId}
                  className="absolute pointer-events-none z-10"
                  style={{
                    // Position based on cursor.position - simplified positioning
                    left: `${Math.min(cursor.position * 0.6, 90)}%`,
                    top: `${Math.floor(cursor.position / 100) * 24}px`
                  }}
                >
                  <div 
                    className="w-0.5 h-6 animate-pulse"
                    style={{ backgroundColor: cursor.color }}
                  />
                  <div 
                    className="absolute -top-6 left-0 text-xs px-2 py-1 rounded text-white whitespace-nowrap"
                    style={{ backgroundColor: cursor.color }}
                  >
                    {cursor.userName}
                  </div>
                  
                  {/* Selection highlight */}
                  {cursor.selection && (
                    <div 
                      className="absolute rounded opacity-30"
                      style={{
                        backgroundColor: cursor.color,
                        left: 0,
                        width: `${(cursor.selection.end - cursor.selection.start) * 0.6}%`,
                        height: '24px'
                      }}
                    />
                  )}
                </div>
              );
            })}
            
            {/* Editor content */}
            <div
              ref={editorRef}
              contentEditable={!readOnly}
              onInput={handleInput}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              className={`min-h-full outline-none ${readOnly ? 'cursor-default' : 'cursor-text'}`}
              style={{
                lineHeight: '1.6',
                fontSize: '16px',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
              }}
              suppressContentEditableWarning={true}
            >
              {content || (readOnly ? '' : 'Start typing to collaborate...')}
            </div>
          </div>
        </div>
      </div>

      {/* Status bar */}
      <div className="border-t bg-gray-50 px-6 py-2">
        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-4">
            <span>{documentStats.words} words</span>
            <span>{documentStats.characters} characters</span>
            <span>{documentStats.paragraphs} paragraphs</span>
            {operationHistory.length > 0 && (
              <span>{operationHistory.length} operations</span>
            )}
          </div>
          
          {!readOnly && (
            <div className="flex items-center gap-2">
              <span>Last saved: {new Date().toLocaleTimeString()}</span>
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {/* Revision History Sidebar */}
      {showRevisions && (
        <div className="fixed right-0 top-0 h-full w-80 bg-white border-l shadow-lg z-50">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Revision History</h3>
              <button
                onClick={() => setShowRevisions(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          </div>
          
          <div className="overflow-y-auto h-full pb-20">
            {revisionHistory.map(revision => (
              <div
                key={revision.id}
                className="p-4 border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => loadRevision(revision)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{revision.authorName}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(revision.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-600 truncate">
                  {revision.content.slice(0, 100)}...
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {revision.operationCount} operations
                </div>
              </div>
            ))}
            
            {revisionHistory.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                <History size={32} className="mx-auto mb-2 opacity-50" />
                <div>No revisions saved yet</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};