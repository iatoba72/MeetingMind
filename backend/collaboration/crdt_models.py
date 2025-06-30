# CRDT (Conflict-free Replicated Data Types) Models
# Implements various CRDT structures for collaborative features

from typing import Dict, List, Any, Optional, Set, Tuple, Union
from dataclasses import dataclass, field
from abc import ABC, abstractmethod
from enum import Enum
import json
import uuid
from datetime import datetime
import hashlib


class CRDTType(Enum):
    """Types of CRDT structures"""

    G_COUNTER = "g_counter"
    PN_COUNTER = "pn_counter"
    G_SET = "g_set"
    OR_SET = "or_set"
    LWW_REGISTER = "lww_register"
    MV_REGISTER = "mv_register"
    OR_MAP = "or_map"
    RGA = "rga"  # Replicated Growable Array
    YATA = "yata"  # Yet Another Transformation Approach


@dataclass
class VectorClock:
    """Vector clock for tracking causality"""

    clocks: Dict[str, int] = field(default_factory=dict)

    def increment(self, replica_id: str):
        """Increment clock for a replica"""
        self.clocks[replica_id] = self.clocks.get(replica_id, 0) + 1

    def update(self, other: "VectorClock"):
        """Update with another vector clock"""
        for replica_id, clock in other.clocks.items():
            self.clocks[replica_id] = max(self.clocks.get(replica_id, 0), clock)

    def compare(self, other: "VectorClock") -> str:
        """Compare with another vector clock"""
        all_replicas = set(self.clocks.keys()) | set(other.clocks.keys())

        self_greater = False
        other_greater = False

        for replica_id in all_replicas:
            self_clock = self.clocks.get(replica_id, 0)
            other_clock = other.clocks.get(replica_id, 0)

            if self_clock > other_clock:
                self_greater = True
            elif self_clock < other_clock:
                other_greater = True

        if self_greater and not other_greater:
            return "greater"
        elif other_greater and not self_greater:
            return "less"
        elif not self_greater and not other_greater:
            return "equal"
        else:
            return "concurrent"

    def to_dict(self) -> Dict[str, Any]:
        return {"clocks": self.clocks}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "VectorClock":
        return cls(clocks=data.get("clocks", {}))


class CRDT(ABC):
    """Base class for all CRDT structures"""

    def __init__(self, replica_id: str):
        self.replica_id = replica_id
        self.vector_clock = VectorClock()

    @abstractmethod
    def merge(self, other: "CRDT"):
        """Merge with another CRDT instance"""
        raise NotImplementedError("Subclasses must implement merge method")

    @abstractmethod
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dictionary"""
        raise NotImplementedError("Subclasses must implement to_dict method")

    @classmethod
    @abstractmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CRDT":
        """Deserialize from dictionary"""
        raise NotImplementedError("Subclasses must implement from_dict method")


class GCounter(CRDT):
    """Grow-only counter CRDT"""

    def __init__(self, replica_id: str):
        super().__init__(replica_id)
        self.counters: Dict[str, int] = {replica_id: 0}

    def increment(self, amount: int = 1):
        """Increment the counter"""
        self.counters[self.replica_id] += amount
        self.vector_clock.increment(self.replica_id)

    def value(self) -> int:
        """Get the current counter value"""
        return sum(self.counters.values())

    def merge(self, other: "GCounter"):
        """Merge with another GCounter"""
        all_replicas = set(self.counters.keys()) | set(other.counters.keys())

        for replica_id in all_replicas:
            self_count = self.counters.get(replica_id, 0)
            other_count = other.counters.get(replica_id, 0)
            self.counters[replica_id] = max(self_count, other_count)

        self.vector_clock.update(other.vector_clock)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "g_counter",
            "replica_id": self.replica_id,
            "counters": self.counters,
            "vector_clock": self.vector_clock.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "GCounter":
        counter = cls(data["replica_id"])
        counter.counters = data["counters"]
        counter.vector_clock = VectorClock.from_dict(data["vector_clock"])
        return counter


class PNCounter(CRDT):
    """Increment/Decrement counter CRDT"""

    def __init__(self, replica_id: str):
        super().__init__(replica_id)
        self.increment_counter = GCounter(replica_id)
        self.decrement_counter = GCounter(replica_id)

    def increment(self, amount: int = 1):
        """Increment the counter"""
        self.increment_counter.increment(amount)
        self.vector_clock.increment(self.replica_id)

    def decrement(self, amount: int = 1):
        """Decrement the counter"""
        self.decrement_counter.increment(amount)
        self.vector_clock.increment(self.replica_id)

    def value(self) -> int:
        """Get the current counter value"""
        return self.increment_counter.value() - self.decrement_counter.value()

    def merge(self, other: "PNCounter"):
        """Merge with another PNCounter"""
        self.increment_counter.merge(other.increment_counter)
        self.decrement_counter.merge(other.decrement_counter)
        self.vector_clock.update(other.vector_clock)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "pn_counter",
            "replica_id": self.replica_id,
            "increment_counter": self.increment_counter.to_dict(),
            "decrement_counter": self.decrement_counter.to_dict(),
            "vector_clock": self.vector_clock.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PNCounter":
        counter = cls(data["replica_id"])
        counter.increment_counter = GCounter.from_dict(data["increment_counter"])
        counter.decrement_counter = GCounter.from_dict(data["decrement_counter"])
        counter.vector_clock = VectorClock.from_dict(data["vector_clock"])
        return counter


class ORSet(CRDT):
    """Observed-Remove Set CRDT"""

    def __init__(self, replica_id: str):
        super().__init__(replica_id)
        self.added: Dict[Any, Set[str]] = {}  # element -> set of unique tags
        self.removed: Set[str] = set()  # set of removed tags

    def add(self, element: Any) -> str:
        """Add an element with a unique tag"""
        tag = f"{self.replica_id}:{uuid.uuid4()}"

        if element not in self.added:
            self.added[element] = set()
        self.added[element].add(tag)

        self.vector_clock.increment(self.replica_id)
        return tag

    def remove(self, element: Any):
        """Remove an element by removing all its tags"""
        if element in self.added:
            for tag in self.added[element]:
                self.removed.add(tag)

        self.vector_clock.increment(self.replica_id)

    def contains(self, element: Any) -> bool:
        """Check if element is in the set"""
        if element not in self.added:
            return False

        # Element is present if it has tags that haven't been removed
        return bool(self.added[element] - self.removed)

    def elements(self) -> Set[Any]:
        """Get all elements in the set"""
        result = set()
        for element, tags in self.added.items():
            if tags - self.removed:  # Has non-removed tags
                result.add(element)
        return result

    def merge(self, other: "ORSet"):
        """Merge with another ORSet"""
        # Merge added elements
        for element, tags in other.added.items():
            if element not in self.added:
                self.added[element] = set()
            self.added[element].update(tags)

        # Merge removed tags
        self.removed.update(other.removed)

        self.vector_clock.update(other.vector_clock)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "or_set",
            "replica_id": self.replica_id,
            "added": {str(k): list(v) for k, v in self.added.items()},
            "removed": list(self.removed),
            "vector_clock": self.vector_clock.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ORSet":
        or_set = cls(data["replica_id"])
        or_set.added = {k: set(v) for k, v in data["added"].items()}
        or_set.removed = set(data["removed"])
        or_set.vector_clock = VectorClock.from_dict(data["vector_clock"])
        return or_set


@dataclass
class LWWValue:
    """Last-Writer-Wins value with timestamp"""

    value: Any
    timestamp: datetime
    replica_id: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "value": self.value,
            "timestamp": self.timestamp.isoformat(),
            "replica_id": self.replica_id,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LWWValue":
        return cls(
            value=data["value"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            replica_id=data["replica_id"],
        )


class LWWRegister(CRDT):
    """Last-Writer-Wins Register CRDT"""

    def __init__(self, replica_id: str, initial_value: Any = None):
        super().__init__(replica_id)
        self.lww_value = (
            LWWValue(
                value=initial_value, timestamp=datetime.utcnow(), replica_id=replica_id
            )
            if initial_value is not None
            else None
        )

    def set(self, value: Any):
        """Set the register value"""
        self.lww_value = LWWValue(
            value=value, timestamp=datetime.utcnow(), replica_id=self.replica_id
        )
        self.vector_clock.increment(self.replica_id)

    def get(self) -> Any:
        """Get the register value"""
        return self.lww_value.value if self.lww_value else None

    def merge(self, other: "LWWRegister"):
        """Merge with another LWWRegister"""
        if other.lww_value is None:
            pass  # Keep current value
        elif self.lww_value is None:
            self.lww_value = other.lww_value
        else:
            # Choose value with later timestamp, break ties with replica_id
            if other.lww_value.timestamp > self.lww_value.timestamp or (
                other.lww_value.timestamp == self.lww_value.timestamp
                and other.lww_value.replica_id > self.lww_value.replica_id
            ):
                self.lww_value = other.lww_value

        self.vector_clock.update(other.vector_clock)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "lww_register",
            "replica_id": self.replica_id,
            "lww_value": self.lww_value.to_dict() if self.lww_value else None,
            "vector_clock": self.vector_clock.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "LWWRegister":
        register = cls(data["replica_id"])
        if data["lww_value"]:
            register.lww_value = LWWValue.from_dict(data["lww_value"])
        register.vector_clock = VectorClock.from_dict(data["vector_clock"])
        return register


class ORMap(CRDT):
    """Observed-Remove Map CRDT"""

    def __init__(self, replica_id: str):
        super().__init__(replica_id)
        self.keys = ORSet(replica_id)  # Keys in the map
        self.values: Dict[str, CRDT] = {}  # Key -> CRDT value

    def set(self, key: str, value_crdt: CRDT):
        """Set a key-value pair"""
        self.keys.add(key)
        self.values[key] = value_crdt
        self.vector_clock.increment(self.replica_id)

    def get(self, key: str) -> Optional[CRDT]:
        """Get value for a key"""
        if self.keys.contains(key):
            return self.values.get(key)
        return None

    def remove(self, key: str):
        """Remove a key from the map"""
        self.keys.remove(key)
        self.vector_clock.increment(self.replica_id)

    def get_keys(self) -> Set[str]:
        """Get all keys in the map"""
        return self.keys.elements()

    def merge(self, other: "ORMap"):
        """Merge with another ORMap"""
        # Merge keys
        self.keys.merge(other.keys)

        # Merge values for common keys
        for key in self.get_keys() | other.get_keys():
            if key in self.values and key in other.values:
                self.values[key].merge(other.values[key])
            elif key in other.values:
                self.values[key] = other.values[key]

        self.vector_clock.update(other.vector_clock)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "or_map",
            "replica_id": self.replica_id,
            "keys": self.keys.to_dict(),
            "values": {k: v.to_dict() for k, v in self.values.items()},
            "vector_clock": self.vector_clock.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ORMap":
        or_map = cls(data["replica_id"])
        or_map.keys = ORSet.from_dict(data["keys"])

        # Reconstruct values based on their types
        for key, value_data in data["values"].items():
            value_type = value_data["type"]
            if value_type == "lww_register":
                or_map.values[key] = LWWRegister.from_dict(value_data)
            elif value_type == "or_set":
                or_map.values[key] = ORSet.from_dict(value_data)
            # Add more types as needed

        or_map.vector_clock = VectorClock.from_dict(data["vector_clock"])
        return or_map


@dataclass
class RGANode:
    """Node in Replicated Growable Array"""

    id: str
    content: Any
    timestamp: datetime
    replica_id: str
    visible: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "content": self.content,
            "timestamp": self.timestamp.isoformat(),
            "replica_id": self.replica_id,
            "visible": self.visible,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RGANode":
        return cls(
            id=data["id"],
            content=data["content"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            replica_id=data["replica_id"],
            visible=data["visible"],
        )


class RGA(CRDT):
    """Replicated Growable Array for collaborative sequences"""

    def __init__(self, replica_id: str):
        super().__init__(replica_id)
        self.nodes: List[RGANode] = []
        self.node_index: Dict[str, RGANode] = {}

    def insert(self, position: int, content: Any) -> str:
        """Insert content at position"""
        node_id = f"{self.replica_id}:{uuid.uuid4()}"
        node = RGANode(
            id=node_id,
            content=content,
            timestamp=datetime.utcnow(),
            replica_id=self.replica_id,
        )

        # Find insertion point considering only visible nodes
        visible_position = 0
        insert_index = 0

        for i, existing_node in enumerate(self.nodes):
            if existing_node.visible:
                if visible_position == position:
                    insert_index = i
                    break
                visible_position += 1
            if i == len(self.nodes) - 1:
                insert_index = len(self.nodes)

        self.nodes.insert(insert_index, node)
        self.node_index[node_id] = node
        self.vector_clock.increment(self.replica_id)

        return node_id

    def delete(self, node_id: str):
        """Delete a node by marking it invisible"""
        if node_id in self.node_index:
            self.node_index[node_id].visible = False
            self.vector_clock.increment(self.replica_id)

    def get_visible_content(self) -> List[Any]:
        """Get visible content in order"""
        return [node.content for node in self.nodes if node.visible]

    def merge(self, other: "RGA"):
        """Merge with another RGA"""
        # Collect all nodes
        all_nodes = {}

        # Add our nodes
        for node in self.nodes:
            all_nodes[node.id] = node

        # Add other nodes
        for node in other.nodes:
            if node.id not in all_nodes:
                all_nodes[node.id] = node
            else:
                # Merge visibility (deleted wins)
                all_nodes[node.id].visible = all_nodes[node.id].visible and node.visible

        # Sort nodes by timestamp, then by replica_id for deterministic ordering
        sorted_nodes = sorted(
            all_nodes.values(), key=lambda n: (n.timestamp, n.replica_id, n.id)
        )

        self.nodes = sorted_nodes
        self.node_index = {node.id: node for node in sorted_nodes}
        self.vector_clock.update(other.vector_clock)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "rga",
            "replica_id": self.replica_id,
            "nodes": [node.to_dict() for node in self.nodes],
            "vector_clock": self.vector_clock.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RGA":
        rga = cls(data["replica_id"])
        rga.nodes = [RGANode.from_dict(node_data) for node_data in data["nodes"]]
        rga.node_index = {node.id: node for node in rga.nodes}
        rga.vector_clock = VectorClock.from_dict(data["vector_clock"])
        return rga


class CRDTFactory:
    """Factory for creating CRDT instances"""

    @staticmethod
    def create_crdt(crdt_type: CRDTType, replica_id: str, **kwargs) -> CRDT:
        """Create a CRDT of the specified type"""
        if crdt_type == CRDTType.G_COUNTER:
            return GCounter(replica_id)
        elif crdt_type == CRDTType.PN_COUNTER:
            return PNCounter(replica_id)
        elif crdt_type == CRDTType.OR_SET:
            return ORSet(replica_id)
        elif crdt_type == CRDTType.LWW_REGISTER:
            return LWWRegister(replica_id, kwargs.get("initial_value"))
        elif crdt_type == CRDTType.OR_MAP:
            return ORMap(replica_id)
        elif crdt_type == CRDTType.RGA:
            return RGA(replica_id)
        else:
            raise ValueError(f"Unsupported CRDT type: {crdt_type}")

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> CRDT:
        """Create CRDT from dictionary representation"""
        crdt_type = data["type"]

        if crdt_type == "g_counter":
            return GCounter.from_dict(data)
        elif crdt_type == "pn_counter":
            return PNCounter.from_dict(data)
        elif crdt_type == "or_set":
            return ORSet.from_dict(data)
        elif crdt_type == "lww_register":
            return LWWRegister.from_dict(data)
        elif crdt_type == "or_map":
            return ORMap.from_dict(data)
        elif crdt_type == "rga":
            return RGA.from_dict(data)
        else:
            raise ValueError(f"Unknown CRDT type: {crdt_type}")


class CollaborativeDocument:
    """High-level collaborative document using CRDTs"""

    def __init__(self, document_id: str, replica_id: str):
        self.document_id = document_id
        self.replica_id = replica_id

        # Document structure using CRDTs
        self.content = RGA(replica_id)  # Main text content
        self.metadata = ORMap(replica_id)  # Document metadata
        self.annotations = ORMap(replica_id)  # Highlights, comments, etc.
        self.action_items = ORMap(replica_id)  # Action items board
        self.presence = ORMap(replica_id)  # User presence information

        # Initialize metadata
        self.metadata.set("title", LWWRegister(replica_id, "Untitled Document"))
        self.metadata.set(
            "created_at", LWWRegister(replica_id, datetime.utcnow().isoformat())
        )
        self.metadata.set(
            "last_modified", LWWRegister(replica_id, datetime.utcnow().isoformat())
        )

    def insert_text(self, position: int, text: str) -> str:
        """Insert text at position"""
        node_id = self.content.insert(position, text)
        self._update_last_modified()
        return node_id

    def delete_text(self, node_id: str):
        """Delete text node"""
        self.content.delete(node_id)
        self._update_last_modified()

    def add_annotation(self, annotation_id: str, annotation_data: Dict[str, Any]):
        """Add an annotation (highlight, comment, etc.)"""
        annotation_crdt = LWWRegister(self.replica_id, annotation_data)
        self.annotations.set(annotation_id, annotation_crdt)
        self._update_last_modified()

    def update_annotation(self, annotation_id: str, annotation_data: Dict[str, Any]):
        """Update an existing annotation"""
        if self.annotations.get(annotation_id):
            self.annotations.get(annotation_id).set(annotation_data)
        else:
            self.add_annotation(annotation_id, annotation_data)

    def remove_annotation(self, annotation_id: str):
        """Remove an annotation"""
        self.annotations.remove(annotation_id)
        self._update_last_modified()

    def add_action_item(self, item_id: str, item_data: Dict[str, Any]):
        """Add an action item"""
        item_crdt = LWWRegister(self.replica_id, item_data)
        self.action_items.set(item_id, item_crdt)
        self._update_last_modified()

    def update_action_item(self, item_id: str, item_data: Dict[str, Any]):
        """Update an action item"""
        if self.action_items.get(item_id):
            self.action_items.get(item_id).set(item_data)
        else:
            self.add_action_item(item_id, item_data)

    def remove_action_item(self, item_id: str):
        """Remove an action item"""
        self.action_items.remove(item_id)
        self._update_last_modified()

    def update_user_presence(self, user_id: str, presence_data: Dict[str, Any]):
        """Update user presence information"""
        presence_crdt = LWWRegister(self.replica_id, presence_data)
        self.presence.set(user_id, presence_crdt)

    def remove_user_presence(self, user_id: str):
        """Remove user presence"""
        self.presence.remove(user_id)

    def get_text_content(self) -> str:
        """Get the complete text content"""
        content_list = self.content.get_visible_content()
        return "".join(str(item) for item in content_list)

    def get_annotations(self) -> Dict[str, Any]:
        """Get all annotations"""
        result = {}
        for annotation_id in self.annotations.get_keys():
            annotation_crdt = self.annotations.get(annotation_id)
            if annotation_crdt:
                result[annotation_id] = annotation_crdt.get()
        return result

    def get_action_items(self) -> Dict[str, Any]:
        """Get all action items"""
        result = {}
        for item_id in self.action_items.get_keys():
            item_crdt = self.action_items.get(item_id)
            if item_crdt:
                result[item_id] = item_crdt.get()
        return result

    def get_user_presence(self) -> Dict[str, Any]:
        """Get all user presence information"""
        result = {}
        for user_id in self.presence.get_keys():
            presence_crdt = self.presence.get(user_id)
            if presence_crdt:
                result[user_id] = presence_crdt.get()
        return result

    def merge(self, other: "CollaborativeDocument"):
        """Merge with another collaborative document"""
        self.content.merge(other.content)
        self.metadata.merge(other.metadata)
        self.annotations.merge(other.annotations)
        self.action_items.merge(other.action_items)
        self.presence.merge(other.presence)

    def _update_last_modified(self):
        """Update the last modified timestamp"""
        last_modified_crdt = self.metadata.get("last_modified")
        if last_modified_crdt:
            last_modified_crdt.set(datetime.utcnow().isoformat())

    def to_dict(self) -> Dict[str, Any]:
        """Serialize document to dictionary"""
        return {
            "document_id": self.document_id,
            "replica_id": self.replica_id,
            "content": self.content.to_dict(),
            "metadata": self.metadata.to_dict(),
            "annotations": self.annotations.to_dict(),
            "action_items": self.action_items.to_dict(),
            "presence": self.presence.to_dict(),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "CollaborativeDocument":
        """Create document from dictionary"""
        doc = cls(data["document_id"], data["replica_id"])
        doc.content = RGA.from_dict(data["content"])
        doc.metadata = ORMap.from_dict(data["metadata"])
        doc.annotations = ORMap.from_dict(data["annotations"])
        doc.action_items = ORMap.from_dict(data["action_items"])
        doc.presence = ORMap.from_dict(data["presence"])
        return doc
