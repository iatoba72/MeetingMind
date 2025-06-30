# Operational Transform System
# Implements operational transforms for real-time collaborative editing

from typing import List, Dict, Any, Optional, Union, Tuple
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from enum import Enum
import json
import uuid
from datetime import datetime


class OperationType(Enum):
    """Types of operations for operational transforms"""

    INSERT = "insert"
    DELETE = "delete"
    RETAIN = "retain"
    REPLACE = "replace"
    FORMAT = "format"


@dataclass
class Operation:
    """Base operation for operational transforms"""

    op_type: OperationType
    position: int
    content: Optional[str] = None
    length: Optional[int] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    author: Optional[str] = None
    timestamp: Optional[datetime] = None
    operation_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_dict(self) -> Dict[str, Any]:
        """Convert operation to dictionary for serialization"""
        return {
            "op_type": self.op_type.value,
            "position": self.position,
            "content": self.content,
            "length": self.length,
            "attributes": self.attributes,
            "author": self.author,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "operation_id": self.operation_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Operation":
        """Create operation from dictionary"""
        timestamp = None
        if data.get("timestamp"):
            timestamp = datetime.fromisoformat(data["timestamp"])

        return cls(
            op_type=OperationType(data["op_type"]),
            position=data["position"],
            content=data.get("content"),
            length=data.get("length"),
            attributes=data.get("attributes", {}),
            author=data.get("author"),
            timestamp=timestamp,
            operation_id=data.get("operation_id", str(uuid.uuid4())),
        )


class OperationalTransform:
    """Core operational transform engine"""

    @staticmethod
    def transform(
        op1: Operation, op2: Operation, priority: str = "left"
    ) -> Tuple[Operation, Operation]:
        """
        Transform two concurrent operations

        Args:
            op1: First operation
            op2: Second operation
            priority: Which operation has priority ('left' or 'right')

        Returns:
            Tuple of transformed operations (op1', op2')
        """
        # Create copies to avoid modifying originals
        op1_prime = Operation(
            op_type=op1.op_type,
            position=op1.position,
            content=op1.content,
            length=op1.length,
            attributes=op1.attributes.copy(),
            author=op1.author,
            timestamp=op1.timestamp,
            operation_id=op1.operation_id,
        )

        op2_prime = Operation(
            op_type=op2.op_type,
            position=op2.position,
            content=op2.content,
            length=op2.length,
            attributes=op2.attributes.copy(),
            author=op2.author,
            timestamp=op2.timestamp,
            operation_id=op2.operation_id,
        )

        # Transform based on operation types
        if op1.op_type == OperationType.INSERT and op2.op_type == OperationType.INSERT:
            op1_prime, op2_prime = OperationalTransform._transform_insert_insert(
                op1_prime, op2_prime, priority
            )
        elif (
            op1.op_type == OperationType.INSERT and op2.op_type == OperationType.DELETE
        ):
            op1_prime, op2_prime = OperationalTransform._transform_insert_delete(
                op1_prime, op2_prime
            )
        elif (
            op1.op_type == OperationType.DELETE and op2.op_type == OperationType.INSERT
        ):
            op2_prime, op1_prime = OperationalTransform._transform_insert_delete(
                op2_prime, op1_prime
            )
        elif (
            op1.op_type == OperationType.DELETE and op2.op_type == OperationType.DELETE
        ):
            op1_prime, op2_prime = OperationalTransform._transform_delete_delete(
                op1_prime, op2_prime
            )
        elif op1.op_type == OperationType.RETAIN or op2.op_type == OperationType.RETAIN:
            # RETAIN operations don't change position, so no transformation needed
            pass
        elif op1.op_type == OperationType.FORMAT or op2.op_type == OperationType.FORMAT:
            op1_prime, op2_prime = OperationalTransform._transform_format_operations(
                op1_prime, op2_prime
            )

        return op1_prime, op2_prime

    @staticmethod
    def _transform_insert_insert(
        op1: Operation, op2: Operation, priority: str
    ) -> Tuple[Operation, Operation]:
        """Transform two concurrent insert operations"""
        if op1.position <= op2.position:
            if op1.position == op2.position and priority == "right":
                # Op2 has priority, shift op1
                op1.position += len(op2.content or "")
            else:
                # Op1 comes first, shift op2
                op2.position += len(op1.content or "")
        else:
            # Op2 comes first, shift op1
            op1.position += len(op2.content or "")

        return op1, op2

    @staticmethod
    def _transform_insert_delete(
        op_insert: Operation, op_delete: Operation
    ) -> Tuple[Operation, Operation]:
        """Transform insert against delete operation"""
        if op_insert.position <= op_delete.position:
            # Insert comes before delete, shift delete position
            op_delete.position += len(op_insert.content or "")
        else:
            # Insert comes after delete start
            delete_end = op_delete.position + (op_delete.length or 0)
            if op_insert.position >= delete_end:
                # Insert comes after delete, shift insert position back
                op_insert.position -= op_delete.length or 0
            else:
                # Insert is within delete range, adjust insert position to delete start
                op_insert.position = op_delete.position

        return op_insert, op_delete

    @staticmethod
    def _transform_delete_delete(
        op1: Operation, op2: Operation
    ) -> Tuple[Operation, Operation]:
        """Transform two concurrent delete operations"""
        op1_start = op1.position
        op1_end = op1.position + (op1.length or 0)
        op2_start = op2.position
        op2_end = op2.position + (op2.length or 0)

        # Check for overlap
        if op1_end <= op2_start:
            # Op1 comes completely before op2
            op2.position -= op1.length or 0
        elif op2_end <= op1_start:
            # Op2 comes completely before op1
            op1.position -= op2.length or 0
        else:
            # Operations overlap
            if op1_start <= op2_start:
                if op1_end >= op2_end:
                    # Op1 completely contains op2
                    op1.length = (op1.length or 0) - (op2.length or 0)
                    op2.length = 0  # Op2 becomes no-op
                else:
                    # Partial overlap, op1 starts first
                    overlap = op1_end - op2_start
                    op1.length = (op1.length or 0) - overlap
                    op2.position = op1.position + (op1.length or 0)
                    op2.length = (op2.length or 0) - overlap
            else:
                # Op2 starts first
                if op2_end >= op1_end:
                    # Op2 completely contains op1
                    op2.length = (op2.length or 0) - (op1.length or 0)
                    op1.length = 0  # Op1 becomes no-op
                else:
                    # Partial overlap, op2 starts first
                    overlap = op2_end - op1_start
                    op2.length = (op2.length or 0) - overlap
                    op1.position = op2.position + (op2.length or 0)
                    op1.length = (op1.length or 0) - overlap

        return op1, op2

    @staticmethod
    def _transform_format_operations(
        op1: Operation, op2: Operation
    ) -> Tuple[Operation, Operation]:
        """Transform operations involving formatting"""
        # For formatting operations, we need to adjust positions based on other operations
        if op1.op_type == OperationType.FORMAT and op2.op_type != OperationType.FORMAT:
            if op2.op_type == OperationType.INSERT and op2.position <= op1.position:
                op1.position += len(op2.content or "")
            elif op2.op_type == OperationType.DELETE and op2.position < op1.position:
                op1.position -= min(op2.length or 0, op1.position - op2.position)
        elif (
            op2.op_type == OperationType.FORMAT and op1.op_type != OperationType.FORMAT
        ):
            if op1.op_type == OperationType.INSERT and op1.position <= op2.position:
                op2.position += len(op1.content or "")
            elif op1.op_type == OperationType.DELETE and op1.position < op2.position:
                op2.position -= min(op1.length or 0, op2.position - op1.position)

        return op1, op2


class OperationBuffer:
    """Buffer for managing operations with operational transforms"""

    def __init__(self, document_id: str):
        self.document_id = document_id
        self.operations: List[Operation] = []
        self.local_operations: List[Operation] = []
        self.remote_operations: List[Operation] = []
        self.vector_clock: Dict[str, int] = {}
        self.revision = 0

    def add_local_operation(self, operation: Operation):
        """Add a local operation to the buffer"""
        operation.timestamp = datetime.utcnow()
        self.local_operations.append(operation)
        self.operations.append(operation)
        self.revision += 1

        # Update vector clock
        if operation.author:
            self.vector_clock[operation.author] = (
                self.vector_clock.get(operation.author, 0) + 1
            )

    def add_remote_operation(self, operation: Operation) -> Operation:
        """
        Add a remote operation and transform it against local operations

        Returns:
            The transformed operation that should be applied locally
        """
        # Transform against all local operations
        transformed_op = operation

        for local_op in self.local_operations:
            transformed_op, _ = OperationalTransform.transform(
                transformed_op, local_op, priority="left"
            )

        # Transform local operations against the remote operation
        transformed_local_ops = []
        for local_op in self.local_operations:
            _, transformed_local = OperationalTransform.transform(
                operation, local_op, priority="right"
            )
            transformed_local_ops.append(transformed_local)

        # Update local operations with transformed versions
        self.local_operations = transformed_local_ops

        # Add to remote operations and all operations
        self.remote_operations.append(operation)
        self.operations.append(transformed_op)
        self.revision += 1

        # Update vector clock
        if operation.author:
            self.vector_clock[operation.author] = max(
                self.vector_clock.get(operation.author, 0),
                getattr(operation, "vector_clock", {}).get(operation.author, 0),
            )

        return transformed_op

    def acknowledge_operation(self, operation_id: str):
        """Acknowledge that an operation has been accepted by the server"""
        # Remove acknowledged operation from local operations
        self.local_operations = [
            op for op in self.local_operations if op.operation_id != operation_id
        ]

    def get_operations_since(self, revision: int) -> List[Operation]:
        """Get all operations since a specific revision"""
        if revision >= len(self.operations):
            return []
        return self.operations[revision:]

    def compress_operations(self) -> List[Operation]:
        """Compress consecutive operations where possible"""
        if not self.operations:
            return []

        compressed = []
        current_op = None

        for op in self.operations:
            if current_op is None:
                current_op = op
                continue

            # Try to merge with current operation
            merged = self._try_merge_operations(current_op, op)
            if merged:
                current_op = merged
            else:
                compressed.append(current_op)
                current_op = op

        if current_op:
            compressed.append(current_op)

        return compressed

    def _try_merge_operations(
        self, op1: Operation, op2: Operation
    ) -> Optional[Operation]:
        """Try to merge two consecutive operations"""
        # Only merge operations from the same author
        if op1.author != op2.author:
            return None

        # Merge consecutive inserts
        if (
            op1.op_type == OperationType.INSERT
            and op2.op_type == OperationType.INSERT
            and op1.position + len(op1.content or "") == op2.position
        ):

            return Operation(
                op_type=OperationType.INSERT,
                position=op1.position,
                content=(op1.content or "") + (op2.content or ""),
                author=op1.author,
                timestamp=op2.timestamp,  # Use latest timestamp
                operation_id=op2.operation_id,  # Use latest ID
            )

        # Merge consecutive deletes
        if (
            op1.op_type == OperationType.DELETE
            and op2.op_type == OperationType.DELETE
            and op1.position == op2.position
        ):

            return Operation(
                op_type=OperationType.DELETE,
                position=op1.position,
                length=(op1.length or 0) + (op2.length or 0),
                author=op1.author,
                timestamp=op2.timestamp,
                operation_id=op2.operation_id,
            )

        return None


class DocumentState:
    """Represents the current state of a collaborative document"""

    def __init__(self, document_id: str, initial_content: str = ""):
        self.document_id = document_id
        self.content = initial_content
        self.buffer = OperationBuffer(document_id)
        self.cursors: Dict[str, int] = {}  # user_id -> cursor_position
        self.selections: Dict[str, Tuple[int, int]] = {}  # user_id -> (start, end)
        self.annotations: List[Dict[str, Any]] = []
        self.metadata: Dict[str, Any] = {}

    def apply_operation(self, operation: Operation) -> bool:
        """Apply an operation to the document state"""
        try:
            if operation.op_type == OperationType.INSERT:
                if operation.position <= len(self.content):
                    self.content = (
                        self.content[: operation.position]
                        + (operation.content or "")
                        + self.content[operation.position :]
                    )
                    self._update_cursors_for_insert(operation)
                    return True

            elif operation.op_type == OperationType.DELETE:
                start = operation.position
                end = operation.position + (operation.length or 0)
                if start <= len(self.content) and end <= len(self.content):
                    self.content = self.content[:start] + self.content[end:]
                    self._update_cursors_for_delete(operation)
                    return True

            elif operation.op_type == OperationType.REPLACE:
                start = operation.position
                end = operation.position + (operation.length or 0)
                if start <= len(self.content) and end <= len(self.content):
                    self.content = (
                        self.content[:start]
                        + (operation.content or "")
                        + self.content[end:]
                    )
                    self._update_cursors_for_replace(operation)
                    return True

            elif operation.op_type == OperationType.FORMAT:
                # Apply formatting metadata
                self._apply_formatting(operation)
                return True

            return False
        except (AttributeError, IndexError, ValueError) as e:
            logger.warning(f"Failed to apply operation {operation.op_type}: {e}")
            return False

    def _update_cursors_for_insert(self, operation: Operation):
        """Update cursor positions after an insert operation"""
        insert_length = len(operation.content or "")
        for user_id, cursor_pos in self.cursors.items():
            if cursor_pos >= operation.position:
                self.cursors[user_id] = cursor_pos + insert_length

    def _update_cursors_for_delete(self, operation: Operation):
        """Update cursor positions after a delete operation"""
        delete_length = operation.length or 0
        for user_id, cursor_pos in self.cursors.items():
            if cursor_pos > operation.position:
                if cursor_pos <= operation.position + delete_length:
                    # Cursor was in deleted range
                    self.cursors[user_id] = operation.position
                else:
                    # Cursor was after deleted range
                    self.cursors[user_id] = cursor_pos - delete_length

    def _update_cursors_for_replace(self, operation: Operation):
        """Update cursor positions after a replace operation"""
        old_length = operation.length or 0
        new_length = len(operation.content or "")
        length_diff = new_length - old_length

        for user_id, cursor_pos in self.cursors.items():
            if cursor_pos > operation.position:
                if cursor_pos <= operation.position + old_length:
                    # Cursor was in replaced range
                    self.cursors[user_id] = operation.position + new_length
                else:
                    # Cursor was after replaced range
                    self.cursors[user_id] = cursor_pos + length_diff

    def _apply_formatting(self, operation: Operation):
        """Apply formatting operation"""
        # Add formatting metadata for the specified range
        formatting = {
            "type": "format",
            "position": operation.position,
            "length": operation.length or 0,
            "attributes": operation.attributes,
            "author": operation.author,
            "timestamp": operation.timestamp,
        }
        self.annotations.append(formatting)

    def update_cursor(self, user_id: str, position: int):
        """Update cursor position for a user"""
        if 0 <= position <= len(self.content):
            self.cursors[user_id] = position

    def update_selection(self, user_id: str, start: int, end: int):
        """Update text selection for a user"""
        if 0 <= start <= len(self.content) and 0 <= end <= len(self.content):
            self.selections[user_id] = (start, end)

    def get_state_snapshot(self) -> Dict[str, Any]:
        """Get a complete snapshot of the document state"""
        return {
            "document_id": self.document_id,
            "content": self.content,
            "revision": self.buffer.revision,
            "cursors": self.cursors.copy(),
            "selections": self.selections.copy(),
            "annotations": self.annotations.copy(),
            "metadata": self.metadata.copy(),
            "vector_clock": self.buffer.vector_clock.copy(),
        }


class CollaborativeEditor:
    """High-level collaborative editor interface"""

    def __init__(self, document_id: str, user_id: str, initial_content: str = ""):
        self.document_id = document_id
        self.user_id = user_id
        self.state = DocumentState(document_id, initial_content)
        self.pending_operations: List[Operation] = []
        self.operation_callbacks: List[callable] = []
        self.state_change_callbacks: List[callable] = []

    def insert_text(self, position: int, text: str) -> Operation:
        """Insert text at the specified position"""
        operation = Operation(
            op_type=OperationType.INSERT,
            position=position,
            content=text,
            author=self.user_id,
            timestamp=datetime.utcnow(),
        )

        self._apply_local_operation(operation)
        return operation

    def delete_text(self, position: int, length: int) -> Operation:
        """Delete text at the specified position"""
        operation = Operation(
            op_type=OperationType.DELETE,
            position=position,
            length=length,
            author=self.user_id,
            timestamp=datetime.utcnow(),
        )

        self._apply_local_operation(operation)
        return operation

    def replace_text(self, position: int, length: int, text: str) -> Operation:
        """Replace text at the specified position"""
        operation = Operation(
            op_type=OperationType.REPLACE,
            position=position,
            length=length,
            content=text,
            author=self.user_id,
            timestamp=datetime.utcnow(),
        )

        self._apply_local_operation(operation)
        return operation

    def format_text(
        self, position: int, length: int, attributes: Dict[str, Any]
    ) -> Operation:
        """Apply formatting to text range"""
        operation = Operation(
            op_type=OperationType.FORMAT,
            position=position,
            length=length,
            attributes=attributes,
            author=self.user_id,
            timestamp=datetime.utcnow(),
        )

        self._apply_local_operation(operation)
        return operation

    def update_cursor(self, position: int):
        """Update user's cursor position"""
        self.state.update_cursor(self.user_id, position)
        self._notify_state_change()

    def update_selection(self, start: int, end: int):
        """Update user's text selection"""
        self.state.update_selection(self.user_id, start, end)
        self._notify_state_change()

    def receive_remote_operation(self, operation: Operation):
        """Receive and apply a remote operation"""
        transformed_op = self.state.buffer.add_remote_operation(operation)

        if self.state.apply_operation(transformed_op):
            self._notify_operation_applied(transformed_op)
            self._notify_state_change()

    def acknowledge_operation(self, operation_id: str):
        """Acknowledge that an operation was accepted by the server"""
        self.state.buffer.acknowledge_operation(operation_id)
        self.pending_operations = [
            op for op in self.pending_operations if op.operation_id != operation_id
        ]

    def _apply_local_operation(self, operation: Operation):
        """Apply a local operation"""
        self.state.buffer.add_local_operation(operation)
        self.pending_operations.append(operation)

        if self.state.apply_operation(operation):
            self._notify_operation_applied(operation)
            self._notify_state_change()

    def _notify_operation_applied(self, operation: Operation):
        """Notify callbacks that an operation was applied"""
        for callback in self.operation_callbacks:
            try:
                callback(operation)
            except (TypeError, AttributeError) as e:
                logger.warning(f"Operation callback failed: {e}")

    def _notify_state_change(self):
        """Notify callbacks that the state changed"""
        for callback in self.state_change_callbacks:
            try:
                callback(self.state.get_state_snapshot())
            except (TypeError, AttributeError) as e:
                logger.warning(f"State change callback failed: {e}")

    def on_operation(self, callback: callable):
        """Register callback for operation events"""
        self.operation_callbacks.append(callback)

    def on_state_change(self, callback: callable):
        """Register callback for state change events"""
        self.state_change_callbacks.append(callback)

    def get_content(self) -> str:
        """Get current document content"""
        return self.state.content

    def get_pending_operations(self) -> List[Operation]:
        """Get operations pending server acknowledgment"""
        return self.pending_operations.copy()

    def get_state(self) -> Dict[str, Any]:
        """Get current document state"""
        return self.state.get_state_snapshot()
