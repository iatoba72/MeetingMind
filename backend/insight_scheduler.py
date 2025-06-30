# Smart Insight Scheduling System
# Intelligent scheduling and prioritization of insight generation

import asyncio
import heapq
import json
import time
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple, Set, Callable
from dataclasses import dataclass, asdict, field
from enum import Enum
import logging
from collections import defaultdict, deque
import statistics

import numpy as np
from scipy.stats import poisson
from sklearn.linear_model import LinearRegression

from insight_trigger_engine import DetectedTrigger, TriggerType, TriggerPriority
from insight_generation_service import (
    InsightGenerationRequest,
    GeneratedInsight,
    InsightType,
    InsightPriority,
    InsightStatus,
)


class SchedulingStrategy(Enum):
    """Different strategies for scheduling insight generation"""

    IMMEDIATE = "immediate"  # Generate insights immediately
    BATCHED = "batched"  # Batch insights for efficiency
    PRIORITY_BASED = "priority_based"  # Priority queue scheduling
    INTELLIGENT = "intelligent"  # ML-based intelligent scheduling
    CONTEXT_AWARE = "context_aware"  # Context-aware scheduling
    ADAPTIVE = "adaptive"  # Adaptive scheduling based on patterns


class ExecutionTiming(Enum):
    """When to execute insight generation"""

    REAL_TIME = "real_time"  # As triggers occur
    DEFERRED = "deferred"  # Delayed execution
    BATCH_WINDOW = "batch_window"  # During batch windows
    MEETING_BREAK = "meeting_break"  # During natural breaks
    POST_MEETING = "post_meeting"  # After meeting ends
    BACKGROUND = "background"  # Background processing


class ResourceConstraint(Enum):
    """Resource constraints for scheduling"""

    CPU_USAGE = "cpu_usage"
    MEMORY_USAGE = "memory_usage"
    API_RATE_LIMITS = "api_rate_limits"
    NETWORK_BANDWIDTH = "network_bandwidth"
    PROCESSING_QUEUE = "processing_queue"


@dataclass
class SchedulingContext:
    """Context information for scheduling decisions"""

    meeting_phase: str  # "beginning", "middle", "end", "break"
    meeting_intensity: float  # 0.0 - 1.0, how active the meeting is
    speaker_engagement: Dict[str, float]  # Speaker engagement levels
    topic_stability: float  # How stable the current topic is
    resource_availability: Dict[ResourceConstraint, float]
    pending_insights_count: int
    recent_insight_density: float  # Insights per minute recently
    user_attention_score: float  # How likely users are to pay attention
    historical_patterns: Dict[str, Any]


@dataclass
class ScheduledTask:
    """A scheduled insight generation task"""

    id: str
    request: InsightGenerationRequest
    priority_score: float
    scheduled_time: float
    execution_timing: ExecutionTiming
    dependencies: List[str]
    context_requirements: List[str]
    resource_requirements: Dict[ResourceConstraint, float]
    retry_count: int = 0
    max_retries: int = 3
    created_at: float = field(default_factory=time.time)
    deadline: Optional[float] = None
    context_snapshot: Optional[Dict] = None


@dataclass
class InsightBatch:
    """A batch of insights to be processed together"""

    id: str
    tasks: List[ScheduledTask]
    batch_type: str  # "topic_related", "speaker_related", "time_window"
    optimal_execution_time: float
    estimated_processing_time: float
    resource_requirements: Dict[ResourceConstraint, float]
    coherence_score: float  # How related the insights are


@dataclass
class SchedulingMetrics:
    """Metrics for scheduling performance"""

    total_tasks_scheduled: int
    tasks_executed_on_time: int
    average_execution_delay: float
    resource_utilization: Dict[ResourceConstraint, float]
    user_satisfaction_score: float
    insight_relevance_score: float
    processing_efficiency: float


class InsightScheduler:
    """
    Smart scheduling system for insight generation

    Features:
    - Multiple scheduling strategies
    - Context-aware prioritization
    - Resource constraint management
    - Batch optimization
    - Adaptive learning
    - Real-time and deferred execution
    - Quality vs speed optimization
    """

    def __init__(
        self,
        strategy: SchedulingStrategy = SchedulingStrategy.INTELLIGENT,
        max_concurrent_tasks: int = 5,
        batch_window_seconds: int = 30,
    ):
        """Initialize the insight scheduler"""
        self.strategy = strategy
        self.max_concurrent_tasks = max_concurrent_tasks
        self.batch_window_seconds = batch_window_seconds

        # Task queues (priority heap)
        self.priority_queue: List[Tuple[float, str, ScheduledTask]] = []
        self.scheduled_tasks: Dict[str, ScheduledTask] = {}
        self.executing_tasks: Dict[str, ScheduledTask] = {}
        self.completed_tasks: Dict[str, ScheduledTask] = {}

        # Batching system
        self.pending_batches: Dict[str, InsightBatch] = {}
        self.batch_windows: Dict[str, List[ScheduledTask]] = defaultdict(list)

        # Context tracking
        self.current_context: Optional[SchedulingContext] = None
        self.context_history: deque = deque(maxlen=100)

        # Resource monitoring
        self.resource_monitors: Dict[ResourceConstraint, Callable] = {}
        self.resource_usage: Dict[ResourceConstraint, deque] = {
            constraint: deque(maxlen=60)  # Last 60 measurements
            for constraint in ResourceConstraint
        }

        # Learning and adaptation
        self.execution_history: deque = deque(maxlen=1000)
        self.pattern_models: Dict[str, Any] = {}
        self.user_feedback_history: deque = deque(maxlen=500)

        # Performance metrics
        self.metrics = SchedulingMetrics(
            total_tasks_scheduled=0,
            tasks_executed_on_time=0,
            average_execution_delay=0.0,
            resource_utilization={},
            user_satisfaction_score=0.0,
            insight_relevance_score=0.0,
            processing_efficiency=0.0,
        )

        # Active sessions
        self.active_sessions: Dict[str, Dict] = {}

        # Background tasks
        self.scheduler_task: Optional[asyncio.Task] = None
        self.context_monitor_task: Optional[asyncio.Task] = None

        self.logger = logging.getLogger(__name__)

    async def start(self):
        """Start the scheduler background tasks"""
        if not self.scheduler_task:
            self.scheduler_task = asyncio.create_task(self._scheduler_loop())
            self.context_monitor_task = asyncio.create_task(
                self._context_monitor_loop()
            )
            self.logger.info("Insight scheduler started")

    async def stop(self):
        """Stop the scheduler background tasks"""
        if self.scheduler_task:
            self.scheduler_task.cancel()
            self.scheduler_task = None

        if self.context_monitor_task:
            self.context_monitor_task.cancel()
            self.context_monitor_task = None

        self.logger.info("Insight scheduler stopped")

    async def create_session(
        self, meeting_id: str, session_config: Dict[str, Any] = None
    ) -> str:
        """Create a new scheduling session for a meeting"""
        session_id = f"schedule_session_{uuid.uuid4().hex}"

        config = session_config or {}

        session_data = {
            "session_id": session_id,
            "meeting_id": meeting_id,
            "created_at": datetime.now(),
            "config": {
                "strategy": SchedulingStrategy(
                    config.get("strategy", self.strategy.value)
                ),
                "max_concurrent_tasks": config.get(
                    "max_concurrent_tasks", self.max_concurrent_tasks
                ),
                "batch_window_seconds": config.get(
                    "batch_window_seconds", self.batch_window_seconds
                ),
                "enable_batching": config.get("enable_batching", True),
                "enable_adaptive_learning": config.get(
                    "enable_adaptive_learning", True
                ),
                "quality_vs_speed_preference": config.get(
                    "quality_vs_speed_preference", 0.7
                ),  # 0=speed, 1=quality
                "user_interrupt_sensitivity": config.get(
                    "user_interrupt_sensitivity", 0.8
                ),
            },
            "session_queue": [],
            "session_metrics": {},
            "context_updates": deque(maxlen=50),
        }

        self.active_sessions[session_id] = session_data
        self.logger.info(
            f"Created scheduling session {session_id} for meeting {meeting_id}"
        )

        return session_id

    async def schedule_insight(
        self,
        session_id: str,
        request: InsightGenerationRequest,
        context: Optional[SchedulingContext] = None,
    ) -> str:
        """Schedule an insight generation request"""

        if session_id not in self.active_sessions:
            raise ValueError(f"Session {session_id} not found")

        session = self.active_sessions[session_id]

        # Create scheduled task
        task_id = f"task_{uuid.uuid4().hex[:8]}"

        # Calculate priority score
        priority_score = await self._calculate_priority_score(request, context, session)

        # Determine execution timing
        execution_timing = self._determine_execution_timing(request, context, session)

        # Calculate resource requirements
        resource_requirements = self._calculate_resource_requirements(request)

        # Determine deadline
        deadline = self._calculate_deadline(request, execution_timing)

        scheduled_task = ScheduledTask(
            id=task_id,
            request=request,
            priority_score=priority_score,
            scheduled_time=self._calculate_scheduled_time(
                execution_timing, priority_score
            ),
            execution_timing=execution_timing,
            dependencies=self._find_dependencies(request, session),
            context_requirements=self._determine_context_requirements(request),
            resource_requirements=resource_requirements,
            deadline=deadline,
            context_snapshot=asdict(context) if context else None,
        )

        # Add to appropriate queue
        await self._add_to_queue(session_id, scheduled_task)

        # Update metrics
        self.metrics.total_tasks_scheduled += 1

        self.logger.debug(
            f"Scheduled insight task {task_id} with priority {priority_score}"
        )

        return task_id

    async def _calculate_priority_score(
        self,
        request: InsightGenerationRequest,
        context: Optional[SchedulingContext],
        session: Dict,
    ) -> float:
        """Calculate priority score for a scheduling request"""

        score = 0.0

        # Base priority from trigger
        trigger_priority_weights = {
            TriggerPriority.CRITICAL: 1.0,
            TriggerPriority.HIGH: 0.8,
            TriggerPriority.MEDIUM: 0.6,
            TriggerPriority.LOW: 0.4,
        }

        score += trigger_priority_weights.get(request.trigger.priority, 0.5) * 0.3

        # Trigger confidence
        score += request.trigger.confidence * 0.2

        # Insight type importance
        important_types = {
            TriggerType.DECISION_POINT: 0.9,
            TriggerType.ACTION_ITEM: 0.85,
            TriggerType.CONCERN_RAISED: 0.8,
            TriggerType.DEADLINE_MENTIONED: 0.75,
            TriggerType.QUESTION_ASKED: 0.6,
            TriggerType.TOPIC_SHIFT: 0.5,
        }

        type_importance = important_types.get(request.trigger.trigger_type, 0.4)
        score += type_importance * 0.2

        # Context factors
        if context:
            # Meeting phase (beginning and end are more important)
            if context.meeting_phase in ["beginning", "end"]:
                score += 0.1

            # Topic stability (unstable topics need more insights)
            if context.topic_stability < 0.5:
                score += 0.1

            # User attention score
            score += context.user_attention_score * 0.1

            # Recent insight density (avoid overwhelming)
            if context.recent_insight_density > 2.0:  # More than 2 per minute
                score *= 0.8  # Reduce priority

        # Urgency override
        if request.urgency_override:
            urgency_boost = {
                InsightPriority.CRITICAL: 0.3,
                InsightPriority.HIGH: 0.2,
                InsightPriority.MEDIUM: 0.1,
                InsightPriority.LOW: 0.0,
            }
            score += urgency_boost.get(request.urgency_override, 0.0)

        # Time sensitivity (recent triggers are more important)
        time_since_trigger = time.time() - request.trigger.timestamp
        if time_since_trigger < 30:  # Last 30 seconds
            score += 0.1
        elif time_since_trigger > 300:  # Over 5 minutes
            score *= 0.9

        return min(1.0, score)

    def _determine_execution_timing(
        self,
        request: InsightGenerationRequest,
        context: Optional[SchedulingContext],
        session: Dict,
    ) -> ExecutionTiming:
        """Determine when the insight should be executed"""

        strategy = session["config"]["strategy"]
        trigger = request.trigger

        # Critical insights always real-time
        if trigger.priority == TriggerPriority.CRITICAL:
            return ExecutionTiming.REAL_TIME

        # Strategy-based timing
        if strategy == SchedulingStrategy.IMMEDIATE:
            return ExecutionTiming.REAL_TIME

        elif strategy == SchedulingStrategy.BATCHED:
            return ExecutionTiming.BATCH_WINDOW

        elif strategy == SchedulingStrategy.INTELLIGENT:
            # Use context to determine optimal timing
            if context:
                # High engagement = real-time
                if context.user_attention_score > 0.8:
                    return ExecutionTiming.REAL_TIME

                # Low engagement = defer
                elif context.user_attention_score < 0.3:
                    return ExecutionTiming.DEFERRED

                # Medium engagement, topic stable = batch
                elif context.topic_stability > 0.7:
                    return ExecutionTiming.BATCH_WINDOW

                # Topic unstable = real-time
                else:
                    return ExecutionTiming.REAL_TIME

            return ExecutionTiming.BATCH_WINDOW

        elif strategy == SchedulingStrategy.CONTEXT_AWARE:
            if context and context.meeting_phase == "break":
                return ExecutionTiming.MEETING_BREAK
            elif context and context.meeting_intensity < 0.3:
                return ExecutionTiming.REAL_TIME
            else:
                return ExecutionTiming.BACKGROUND

        else:
            return ExecutionTiming.BATCH_WINDOW

    def _calculate_resource_requirements(
        self, request: InsightGenerationRequest
    ) -> Dict[ResourceConstraint, float]:
        """Calculate resource requirements for the request"""

        requirements = {}

        # Base requirements
        requirements[ResourceConstraint.CPU_USAGE] = 0.3
        requirements[ResourceConstraint.MEMORY_USAGE] = 0.2
        requirements[ResourceConstraint.API_RATE_LIMITS] = 0.1
        requirements[ResourceConstraint.PROCESSING_QUEUE] = 0.1

        # Adjust based on trigger type
        complex_types = [TriggerType.DECISION_POINT, TriggerType.BUSINESS_IMPACT]
        if request.trigger.trigger_type in complex_types:
            requirements[ResourceConstraint.CPU_USAGE] *= 1.5
            requirements[ResourceConstraint.API_RATE_LIMITS] *= 2.0

        # Adjust based on priority
        if request.trigger.priority == TriggerPriority.CRITICAL:
            # Critical tasks get more resources
            for constraint in requirements:
                requirements[constraint] *= 1.3

        return requirements

    def _calculate_deadline(
        self, request: InsightGenerationRequest, timing: ExecutionTiming
    ) -> Optional[float]:
        """Calculate deadline for the task"""

        current_time = time.time()

        # Deadline based on execution timing
        deadline_offsets = {
            ExecutionTiming.REAL_TIME: 10,  # 10 seconds
            ExecutionTiming.DEFERRED: 300,  # 5 minutes
            ExecutionTiming.BATCH_WINDOW: 120,  # 2 minutes
            ExecutionTiming.MEETING_BREAK: 600,  # 10 minutes
            ExecutionTiming.POST_MEETING: 3600,  # 1 hour
            ExecutionTiming.BACKGROUND: None,  # No deadline
        }

        offset = deadline_offsets.get(timing)
        if offset is None:
            return None

        # Adjust based on priority
        if request.trigger.priority == TriggerPriority.CRITICAL:
            offset = min(30, offset)  # Max 30 seconds for critical
        elif request.trigger.priority == TriggerPriority.HIGH:
            offset = min(60, offset)  # Max 1 minute for high

        return current_time + offset

    def _calculate_scheduled_time(
        self, timing: ExecutionTiming, priority_score: float
    ) -> float:
        """Calculate when the task should be executed"""

        current_time = time.time()

        if timing == ExecutionTiming.REAL_TIME:
            # Immediate execution, slightly delayed based on priority
            return current_time + (1.0 - priority_score) * 5

        elif timing == ExecutionTiming.DEFERRED:
            # Defer for 30-300 seconds based on priority
            delay = 30 + (1.0 - priority_score) * 270
            return current_time + delay

        elif timing == ExecutionTiming.BATCH_WINDOW:
            # Next batch window
            return current_time + self.batch_window_seconds

        elif timing == ExecutionTiming.MEETING_BREAK:
            # Estimate next break (simplified)
            return current_time + 600  # 10 minutes

        elif timing == ExecutionTiming.BACKGROUND:
            # Low priority background processing
            return current_time + 300 + (1.0 - priority_score) * 1800

        else:
            return current_time + 60

    def _find_dependencies(
        self, request: InsightGenerationRequest, session: Dict
    ) -> List[str]:
        """Find task dependencies"""
        dependencies = []

        # Look for related triggers in the session
        trigger = request.trigger

        # If this is a topic transition, it might depend on topic summary
        if trigger.trigger_type == TriggerType.TOPIC_SHIFT:
            # Find any pending topic summaries
            for task_id, task in self.scheduled_tasks.items():
                if (
                    task.request.trigger.topic_context == trigger.topic_context
                    and task.request.preferred_type == InsightType.SUMMARY
                ):
                    dependencies.append(task_id)

        return dependencies

    def _determine_context_requirements(
        self, request: InsightGenerationRequest
    ) -> List[str]:
        """Determine what context is needed for this request"""
        requirements = []

        trigger = request.trigger

        # Topic-related insights need topic context
        if trigger.trigger_type in [
            TriggerType.TOPIC_SHIFT,
            TriggerType.BUSINESS_IMPACT,
        ]:
            requirements.append("topic_context")

        # Speaker-related insights need speaker context
        if trigger.trigger_type in [
            TriggerType.SPEAKER_CHANGE,
            TriggerType.QUESTION_ASKED,
        ]:
            requirements.append("speaker_context")

        # Decision insights need meeting context
        if trigger.trigger_type == TriggerType.DECISION_POINT:
            requirements.append("meeting_context")

        return requirements

    async def _add_to_queue(self, session_id: str, task: ScheduledTask):
        """Add task to appropriate queue"""

        session = self.active_sessions[session_id]

        # Add to session queue
        session["session_queue"].append(task.id)

        # Add to global scheduled tasks
        self.scheduled_tasks[task.id] = task

        # Add to priority queue
        heapq.heappush(
            self.priority_queue, (-task.priority_score, task.scheduled_time, task)
        )

        # Check if should be batched
        if (
            session["config"]["enable_batching"]
            and task.execution_timing == ExecutionTiming.BATCH_WINDOW
        ):
            await self._consider_for_batching(task)

    async def _consider_for_batching(self, task: ScheduledTask):
        """Consider task for batching with related tasks"""

        # Find similar tasks for batching
        batch_candidates = []

        for other_task in self.scheduled_tasks.values():
            if (
                other_task.id != task.id
                and other_task.execution_timing == ExecutionTiming.BATCH_WINDOW
                and other_task.id not in self.executing_tasks
            ):

                # Check for batching compatibility
                compatibility = self._calculate_batch_compatibility(task, other_task)
                if compatibility > 0.5:
                    batch_candidates.append((compatibility, other_task))

        # Create batch if enough compatible tasks
        if len(batch_candidates) >= 2:
            batch_candidates.sort(reverse=True)  # Sort by compatibility

            # Take top compatible tasks
            batch_tasks = [task]
            for compatibility, other_task in batch_candidates[
                :4
            ]:  # Max 5 tasks per batch
                batch_tasks.append(other_task)

            # Create batch
            batch_id = f"batch_{uuid.uuid4().hex[:8]}"
            batch = InsightBatch(
                id=batch_id,
                tasks=batch_tasks,
                batch_type=self._determine_batch_type(batch_tasks),
                optimal_execution_time=self._calculate_optimal_batch_time(batch_tasks),
                estimated_processing_time=sum(
                    30 for _ in batch_tasks
                ),  # 30s per task estimate
                resource_requirements=self._aggregate_resource_requirements(
                    batch_tasks
                ),
                coherence_score=np.mean(
                    [compatibility for compatibility, _ in batch_candidates]
                ),
            )

            self.pending_batches[batch_id] = batch

            self.logger.debug(f"Created batch {batch_id} with {len(batch_tasks)} tasks")

    def _calculate_batch_compatibility(
        self, task1: ScheduledTask, task2: ScheduledTask
    ) -> float:
        """Calculate how compatible two tasks are for batching"""

        compatibility = 0.0

        # Same trigger type
        if task1.request.trigger.trigger_type == task2.request.trigger.trigger_type:
            compatibility += 0.3

        # Same topic context
        if (
            task1.request.trigger.topic_context
            and task1.request.trigger.topic_context
            == task2.request.trigger.topic_context
        ):
            compatibility += 0.3

        # Same speaker
        if (
            task1.request.trigger.speaker
            and task1.request.trigger.speaker == task2.request.trigger.speaker
        ):
            compatibility += 0.2

        # Similar timing
        time_diff = abs(task1.scheduled_time - task2.scheduled_time)
        if time_diff < 60:  # Within 1 minute
            compatibility += 0.2

        return compatibility

    def _determine_batch_type(self, tasks: List[ScheduledTask]) -> str:
        """Determine the type of batch based on tasks"""

        # Check for topic-related batch
        topics = set()
        for task in tasks:
            if task.request.trigger.topic_context:
                topics.add(task.request.trigger.topic_context)

        if len(topics) == 1:
            return "topic_related"

        # Check for speaker-related batch
        speakers = set()
        for task in tasks:
            if task.request.trigger.speaker:
                speakers.add(task.request.trigger.speaker)

        if len(speakers) == 1:
            return "speaker_related"

        # Check for trigger type batch
        trigger_types = set()
        for task in tasks:
            trigger_types.add(task.request.trigger.trigger_type)

        if len(trigger_types) == 1:
            return "trigger_type_related"

        return "time_window"

    def _calculate_optimal_batch_time(self, tasks: List[ScheduledTask]) -> float:
        """Calculate optimal execution time for a batch"""

        # Use median scheduled time
        times = [task.scheduled_time for task in tasks]
        return statistics.median(times)

    def _aggregate_resource_requirements(
        self, tasks: List[ScheduledTask]
    ) -> Dict[ResourceConstraint, float]:
        """Aggregate resource requirements for batch"""

        aggregated = defaultdict(float)

        for task in tasks:
            for constraint, requirement in task.resource_requirements.items():
                aggregated[constraint] = max(aggregated[constraint], requirement)

        # Add batching overhead
        for constraint in aggregated:
            aggregated[constraint] *= 1.2  # 20% overhead

        return dict(aggregated)

    async def _scheduler_loop(self):
        """Main scheduler loop"""

        while True:
            try:
                current_time = time.time()

                # Process priority queue
                await self._process_priority_queue(current_time)

                # Process batches
                await self._process_batches(current_time)

                # Clean up completed tasks
                await self._cleanup_completed_tasks()

                # Update resource monitoring
                await self._update_resource_monitoring()

                # Sleep for a short interval
                await asyncio.sleep(1.0)

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in scheduler loop: {e}")
                await asyncio.sleep(5.0)

    async def _process_priority_queue(self, current_time: float):
        """Process tasks from the priority queue"""

        # Check if we can execute more tasks
        if len(self.executing_tasks) >= self.max_concurrent_tasks:
            return

        # Process ready tasks
        ready_tasks = []

        while self.priority_queue:
            neg_priority, scheduled_time, task = heapq.heappop(self.priority_queue)

            # Check if task is ready
            if scheduled_time <= current_time:
                # Check dependencies
                if self._check_dependencies(task):
                    # Check resource availability
                    if self._check_resource_availability(task):
                        ready_tasks.append(task)
                    else:
                        # Re-queue for later
                        heapq.heappush(
                            self.priority_queue, (neg_priority, current_time + 10, task)
                        )
                else:
                    # Re-queue for later (dependencies not ready)
                    heapq.heappush(
                        self.priority_queue, (neg_priority, current_time + 5, task)
                    )
            else:
                # Task not ready yet, put back
                heapq.heappush(
                    self.priority_queue, (neg_priority, scheduled_time, task)
                )
                break

        # Execute ready tasks
        for task in ready_tasks:
            if len(self.executing_tasks) < self.max_concurrent_tasks:
                await self._execute_task(task)

    async def _process_batches(self, current_time: float):
        """Process ready batches"""

        ready_batches = []

        for batch_id, batch in list(self.pending_batches.items()):
            if batch.optimal_execution_time <= current_time:
                # Check if all tasks in batch are still valid
                valid_tasks = []
                for task in batch.tasks:
                    if task.id in self.scheduled_tasks:
                        valid_tasks.append(task)

                if len(valid_tasks) >= 2:  # Minimum for batch
                    batch.tasks = valid_tasks
                    ready_batches.append(batch)

                del self.pending_batches[batch_id]

        # Execute ready batches
        for batch in ready_batches:
            if self._check_resource_availability_batch(batch):
                await self._execute_batch(batch)

    def _check_dependencies(self, task: ScheduledTask) -> bool:
        """Check if task dependencies are satisfied"""

        for dep_id in task.dependencies:
            if dep_id not in self.completed_tasks:
                return False

        return True

    def _check_resource_availability(self, task: ScheduledTask) -> bool:
        """Check if resources are available for task"""

        # Get current resource usage
        current_usage = self._get_current_resource_usage()

        # Check each resource constraint
        for constraint, requirement in task.resource_requirements.items():
            if current_usage.get(constraint, 0.0) + requirement > 1.0:
                return False

        return True

    def _check_resource_availability_batch(self, batch: InsightBatch) -> bool:
        """Check if resources are available for batch"""

        current_usage = self._get_current_resource_usage()

        for constraint, requirement in batch.resource_requirements.items():
            if current_usage.get(constraint, 0.0) + requirement > 1.0:
                return False

        return True

    def _get_current_resource_usage(self) -> Dict[ResourceConstraint, float]:
        """Get current resource usage"""

        usage = {}

        # Calculate usage from executing tasks
        for task in self.executing_tasks.values():
            for constraint, requirement in task.resource_requirements.items():
                usage[constraint] = usage.get(constraint, 0.0) + requirement

        return usage

    async def _execute_task(self, task: ScheduledTask):
        """Execute a single task"""

        self.logger.debug(f"Executing task {task.id}")

        # Move to executing
        self.executing_tasks[task.id] = task
        if task.id in self.scheduled_tasks:
            del self.scheduled_tasks[task.id]

        try:
            # Execute the task (this would integrate with insight generation service)
            await self._perform_task_execution(task)

            # Move to completed
            self.completed_tasks[task.id] = task
            if task.id in self.executing_tasks:
                del self.executing_tasks[task.id]

            # Update metrics
            execution_delay = time.time() - task.scheduled_time
            if execution_delay <= 30:  # Within 30 seconds is "on time"
                self.metrics.tasks_executed_on_time += 1

            self.metrics.average_execution_delay = (
                self.metrics.average_execution_delay
                * (self.metrics.total_tasks_scheduled - 1)
                + execution_delay
            ) / self.metrics.total_tasks_scheduled

        except Exception as e:
            self.logger.error(f"Task {task.id} execution failed: {e}")

            # Handle retry
            if task.retry_count < task.max_retries:
                task.retry_count += 1
                task.scheduled_time = time.time() + (
                    task.retry_count * 30
                )  # Exponential backoff
                self.scheduled_tasks[task.id] = task
                heapq.heappush(
                    self.priority_queue,
                    (-task.priority_score, task.scheduled_time, task),
                )

            if task.id in self.executing_tasks:
                del self.executing_tasks[task.id]

    async def _execute_batch(self, batch: InsightBatch):
        """Execute a batch of tasks"""

        self.logger.debug(f"Executing batch {batch.id} with {len(batch.tasks)} tasks")

        # Execute all tasks in batch concurrently
        batch_tasks = []
        for task in batch.tasks:
            self.executing_tasks[task.id] = task
            if task.id in self.scheduled_tasks:
                del self.scheduled_tasks[task.id]

            batch_tasks.append(self._perform_task_execution(task))

        try:
            # Wait for all tasks to complete
            await asyncio.gather(*batch_tasks, return_exceptions=True)

            # Move all to completed
            for task in batch.tasks:
                self.completed_tasks[task.id] = task
                if task.id in self.executing_tasks:
                    del self.executing_tasks[task.id]

        except Exception as e:
            self.logger.error(f"Batch {batch.id} execution failed: {e}")

    async def _perform_task_execution(self, task: ScheduledTask):
        """Perform the actual task execution"""

        # This is where we would integrate with the insight generation service
        # For now, simulate execution time
        execution_time = 2.0 + task.priority_score * 3.0  # 2-5 seconds
        await asyncio.sleep(execution_time)

        # Record execution in history
        self.execution_history.append(
            {
                "task_id": task.id,
                "execution_time": execution_time,
                "priority_score": task.priority_score,
                "execution_timing": task.execution_timing.value,
                "timestamp": time.time(),
            }
        )

    async def _cleanup_completed_tasks(self):
        """Clean up old completed tasks"""

        current_time = time.time()
        cleanup_threshold = current_time - 3600  # Keep for 1 hour

        # Clean up completed tasks
        to_remove = []
        for task_id, task in self.completed_tasks.items():
            if task.created_at < cleanup_threshold:
                to_remove.append(task_id)

        for task_id in to_remove:
            del self.completed_tasks[task_id]

    async def _update_resource_monitoring(self):
        """Update resource usage monitoring"""

        current_time = time.time()

        # Monitor CPU (simplified)
        cpu_usage = len(self.executing_tasks) / max(self.max_concurrent_tasks, 1)
        self.resource_usage[ResourceConstraint.CPU_USAGE].append(cpu_usage)

        # Monitor processing queue
        queue_usage = len(self.scheduled_tasks) / 100.0  # Normalize to 100 max tasks
        self.resource_usage[ResourceConstraint.PROCESSING_QUEUE].append(queue_usage)

        # Update metrics
        self.metrics.resource_utilization = {
            constraint: np.mean(list(usage_deque))
            for constraint, usage_deque in self.resource_usage.items()
            if usage_deque
        }

    async def _context_monitor_loop(self):
        """Monitor context changes and adapt scheduling"""

        while True:
            try:
                # Update current context (would integrate with meeting analysis)
                await self._update_current_context()

                # Adapt scheduling based on context
                await self._adapt_scheduling()

                await asyncio.sleep(10.0)  # Update every 10 seconds

            except asyncio.CancelledError:
                break
            except Exception as e:
                self.logger.error(f"Error in context monitor: {e}")
                await asyncio.sleep(30.0)

    async def _update_current_context(self):
        """Update the current scheduling context"""

        # This would integrate with topic detection and meeting analysis
        # For now, create a simplified context

        current_time = time.time()

        context = SchedulingContext(
            meeting_phase="middle",  # Would be detected from meeting analysis
            meeting_intensity=0.6,  # Would be calculated from speaking patterns
            speaker_engagement={},  # Would track individual engagement
            topic_stability=0.7,  # Would come from topic detection
            resource_availability=self.metrics.resource_utilization,
            pending_insights_count=len(self.scheduled_tasks),
            recent_insight_density=len(
                [
                    t
                    for t in self.execution_history
                    if current_time - t["timestamp"] < 60
                ]
            ),
            user_attention_score=0.8,  # Would be estimated from user interactions
            historical_patterns={},
        )

        self.current_context = context
        self.context_history.append((current_time, context))

    async def _adapt_scheduling(self):
        """Adapt scheduling parameters based on current context"""

        if not self.current_context:
            return

        context = self.current_context

        # Adapt max concurrent tasks based on resource availability
        avg_cpu = context.resource_availability.get(ResourceConstraint.CPU_USAGE, 0.5)
        if avg_cpu < 0.3:
            self.max_concurrent_tasks = min(8, self.max_concurrent_tasks + 1)
        elif avg_cpu > 0.8:
            self.max_concurrent_tasks = max(2, self.max_concurrent_tasks - 1)

        # Adapt batch window based on meeting intensity
        if context.meeting_intensity > 0.8:
            self.batch_window_seconds = min(60, self.batch_window_seconds + 5)
        elif context.meeting_intensity < 0.3:
            self.batch_window_seconds = max(15, self.batch_window_seconds - 5)

    async def get_session_status(self, session_id: str) -> Dict[str, Any]:
        """Get status of a scheduling session"""

        if session_id not in self.active_sessions:
            return {}

        session = self.active_sessions[session_id]

        # Get session tasks
        session_task_ids = session["session_queue"]

        scheduled_count = sum(
            1 for tid in session_task_ids if tid in self.scheduled_tasks
        )
        executing_count = sum(
            1 for tid in session_task_ids if tid in self.executing_tasks
        )
        completed_count = sum(
            1 for tid in session_task_ids if tid in self.completed_tasks
        )

        return {
            "session_id": session_id,
            "total_tasks": len(session_task_ids),
            "scheduled_tasks": scheduled_count,
            "executing_tasks": executing_count,
            "completed_tasks": completed_count,
            "pending_batches": len(self.pending_batches),
            "current_context": (
                asdict(self.current_context) if self.current_context else None
            ),
            "resource_utilization": self.metrics.resource_utilization,
            "performance_metrics": asdict(self.metrics),
        }

    async def close_session(self, session_id: str) -> Dict[str, Any]:
        """Close a scheduling session"""

        if session_id not in self.active_sessions:
            return {}

        session = self.active_sessions[session_id]

        # Get final statistics
        stats = await self.get_session_status(session_id)

        # Clean up session tasks
        session_task_ids = session["session_queue"]
        for task_id in session_task_ids:
            # Cancel any pending tasks
            if task_id in self.scheduled_tasks:
                del self.scheduled_tasks[task_id]

        del self.active_sessions[session_id]

        self.logger.info(f"Closed scheduling session {session_id}")

        return stats


# Global insight scheduler instance
insight_scheduler = InsightScheduler()


async def get_insight_scheduler() -> InsightScheduler:
    """Get the global insight scheduler instance"""
    return insight_scheduler


async def initialize_insight_scheduler():
    """Initialize and start the insight scheduler"""
    await insight_scheduler.start()
    return insight_scheduler
