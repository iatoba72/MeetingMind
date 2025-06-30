"""
Automatic Source Switching Logic for MeetingMind
Intelligently switches between audio sources based on availability, quality, and priority
"""

import asyncio
import logging
import time
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from enum import Enum
import uuid

logger = logging.getLogger(__name__)


class SourceType(Enum):
    MICROPHONE = "microphone"
    RTMP_STREAM = "rtmp_stream"
    SRT_STREAM = "srt_stream"
    NETWORK_AUDIO = "network_audio"
    FILE_PLAYBACK = "file_playback"


class SourceState(Enum):
    AVAILABLE = "available"
    ACTIVE = "active"
    UNAVAILABLE = "unavailable"
    ERROR = "error"
    SWITCHING = "switching"


class SwitchingMode(Enum):
    AUTOMATIC = "automatic"
    MANUAL = "manual"
    PRIORITY_BASED = "priority_based"
    QUALITY_BASED = "quality_based"


@dataclass
class AudioSourceInfo:
    """Information about an audio source"""

    source_id: str
    source_type: SourceType
    name: str
    state: SourceState
    priority: int  # Lower number = higher priority
    quality_score: float  # 0-1, higher is better
    last_activity: datetime
    bytes_received: int
    sample_rate: int
    channels: int
    bitrate_kbps: float
    latency_ms: float
    packet_loss_rate: float
    signal_to_noise_ratio: float
    metadata: Dict[str, Any]


@dataclass
class SwitchingConfig:
    """Configuration for automatic source switching"""

    switching_mode: SwitchingMode = SwitchingMode.AUTOMATIC
    auto_switch_enabled: bool = True
    fallback_timeout_seconds: int = 5
    quality_threshold: float = 0.7
    max_latency_ms: float = 500
    max_packet_loss_rate: float = 0.05
    min_signal_to_noise_ratio: float = 10.0
    priority_weights: Dict[str, float] = None
    blacklisted_sources: List[str] = None
    preferred_sources: List[str] = None
    sticky_switching: bool = True  # Resist frequent switching
    switch_cooldown_seconds: int = 3


class SourceSwitcher:
    """
    Automatic Source Switching Engine

    Features:
    - Automatic switching based on source availability and quality
    - Priority-based source selection
    - Quality metrics evaluation (latency, packet loss, SNR)
    - Fallback mechanisms for source failures
    - Manual override capabilities
    - Switching history and analytics
    - Configurable switching policies
    """

    def __init__(self, config: SwitchingConfig = None):
        self.config = config or SwitchingConfig()
        self.sources: Dict[str, AudioSourceInfo] = {}
        self.active_source_id: Optional[str] = None
        self.switching_callbacks: List[Callable] = []
        self.monitoring_task: Optional[asyncio.Task] = None
        self.last_switch_time: Optional[datetime] = None

        # Initialize default priority weights
        if self.config.priority_weights is None:
            self.config.priority_weights = {
                SourceType.MICROPHONE.value: 1.0,
                SourceType.SRT_STREAM.value: 0.9,
                SourceType.RTMP_STREAM.value: 0.8,
                SourceType.NETWORK_AUDIO.value: 0.7,
                SourceType.FILE_PLAYBACK.value: 0.3,
            }

        if self.config.blacklisted_sources is None:
            self.config.blacklisted_sources = []

        if self.config.preferred_sources is None:
            self.config.preferred_sources = []

        # Switching statistics
        self.stats = {
            "total_switches": 0,
            "automatic_switches": 0,
            "manual_switches": 0,
            "failed_switches": 0,
            "switch_history": [],
            "uptime_seconds": 0,
            "start_time": datetime.now(),
        }

        logger.info("Source switcher initialized")

    async def start(self) -> bool:
        """Start the source switcher"""
        try:
            logger.info("Starting source switcher...")

            # Start monitoring task
            self.monitoring_task = asyncio.create_task(self._monitor_sources())

            logger.info("Source switcher started successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to start source switcher: {e}")
            return False

    async def stop(self) -> bool:
        """Stop the source switcher"""
        try:
            logger.info("Stopping source switcher...")

            # Stop monitoring
            if self.monitoring_task:
                self.monitoring_task.cancel()
                try:
                    await self.monitoring_task
                except asyncio.CancelledError:
                    pass

            # Deactivate current source
            if self.active_source_id:
                await self._deactivate_source(self.active_source_id)

            logger.info("Source switcher stopped")
            return True

        except Exception as e:
            logger.error(f"Error stopping source switcher: {e}")
            return False

    def register_source(self, source_info: AudioSourceInfo) -> bool:
        """Register a new audio source"""
        try:
            self.sources[source_info.source_id] = source_info
            logger.info(
                f"Registered source: {source_info.name} ({source_info.source_type.value})"
            )

            # Trigger source evaluation if auto-switching is enabled
            if self.config.auto_switch_enabled:
                asyncio.create_task(self._evaluate_sources())

            return True

        except Exception as e:
            logger.error(f"Error registering source {source_info.source_id}: {e}")
            return False

    def unregister_source(self, source_id: str) -> bool:
        """Unregister an audio source"""
        try:
            if source_id in self.sources:
                source_info = self.sources[source_id]
                logger.info(f"Unregistering source: {source_info.name}")

                # If this is the active source, switch to another
                if source_id == self.active_source_id:
                    asyncio.create_task(self._find_and_switch_to_best_source())

                del self.sources[source_id]
                return True

            return False

        except Exception as e:
            logger.error(f"Error unregistering source {source_id}: {e}")
            return False

    def update_source_metrics(self, source_id: str, metrics: Dict[str, Any]) -> bool:
        """Update metrics for a source"""
        try:
            if source_id not in self.sources:
                return False

            source = self.sources[source_id]

            # Update metrics
            if "bytes_received" in metrics:
                source.bytes_received = metrics["bytes_received"]
            if "bitrate_kbps" in metrics:
                source.bitrate_kbps = metrics["bitrate_kbps"]
            if "latency_ms" in metrics:
                source.latency_ms = metrics["latency_ms"]
            if "packet_loss_rate" in metrics:
                source.packet_loss_rate = metrics["packet_loss_rate"]
            if "signal_to_noise_ratio" in metrics:
                source.signal_to_noise_ratio = metrics["signal_to_noise_ratio"]

            source.last_activity = datetime.now()

            # Recalculate quality score
            source.quality_score = self._calculate_quality_score(source)

            # Check if we need to switch sources due to quality degradation
            if (
                self.config.auto_switch_enabled
                and source_id == self.active_source_id
                and source.quality_score < self.config.quality_threshold
            ):
                asyncio.create_task(self._evaluate_sources())

            return True

        except Exception as e:
            logger.error(f"Error updating source metrics for {source_id}: {e}")
            return False

    async def switch_to_source(self, source_id: str, manual: bool = False) -> bool:
        """Manually switch to a specific source"""
        try:
            if source_id not in self.sources:
                logger.error(f"Source {source_id} not found")
                return False

            source = self.sources[source_id]

            if source.state not in [SourceState.AVAILABLE, SourceState.ACTIVE]:
                logger.error(f"Source {source_id} is not available for switching")
                return False

            # Check switching cooldown
            if (
                self.last_switch_time
                and (datetime.now() - self.last_switch_time).total_seconds()
                < self.config.switch_cooldown_seconds
            ):
                logger.warning(f"Switch cooldown active, ignoring switch request")
                return False

            logger.info(
                f"Switching to source: {source.name} ({'manual' if manual else 'automatic'})"
            )

            # Deactivate current source
            if self.active_source_id and self.active_source_id != source_id:
                await self._deactivate_source(self.active_source_id)

            # Activate new source
            if await self._activate_source(source_id):
                self.active_source_id = source_id
                self.last_switch_time = datetime.now()

                # Update statistics
                self.stats["total_switches"] += 1
                if manual:
                    self.stats["manual_switches"] += 1
                else:
                    self.stats["automatic_switches"] += 1

                # Add to switch history
                self.stats["switch_history"].append(
                    {
                        "timestamp": datetime.now().isoformat(),
                        "from_source": (
                            self.active_source_id
                            if self.active_source_id != source_id
                            else None
                        ),
                        "to_source": source_id,
                        "reason": "manual" if manual else "automatic",
                        "quality_score": source.quality_score,
                    }
                )

                # Keep only last 100 switch events
                if len(self.stats["switch_history"]) > 100:
                    self.stats["switch_history"] = self.stats["switch_history"][-100:]

                # Notify callbacks
                await self._notify_switch_callbacks(source_id, source)

                return True
            else:
                self.stats["failed_switches"] += 1
                return False

        except Exception as e:
            logger.error(f"Error switching to source {source_id}: {e}")
            self.stats["failed_switches"] += 1
            return False

    async def _monitor_sources(self):
        """Monitor sources and perform automatic switching"""
        while True:
            try:
                await asyncio.sleep(1)  # Check every second

                # Update uptime
                self.stats["uptime_seconds"] = (
                    datetime.now() - self.stats["start_time"]
                ).total_seconds()

                # Check source availability
                current_time = datetime.now()
                for source_id, source in self.sources.items():
                    # Check for stale sources
                    time_since_activity = current_time - source.last_activity
                    if time_since_activity > timedelta(
                        seconds=self.config.fallback_timeout_seconds
                    ):
                        if source.state in [SourceState.AVAILABLE, SourceState.ACTIVE]:
                            logger.warning(
                                f"Source {source.name} appears stale, marking as unavailable"
                            )
                            source.state = SourceState.UNAVAILABLE

                            # If this was the active source, find a replacement
                            if source_id == self.active_source_id:
                                await self._find_and_switch_to_best_source()

                # Perform periodic source evaluation if auto-switching is enabled
                if self.config.auto_switch_enabled:
                    await self._evaluate_sources()

            except Exception as e:
                logger.error(f"Error in source monitoring: {e}")
                await asyncio.sleep(5)  # Back off on error

    async def _evaluate_sources(self):
        """Evaluate all sources and switch if needed"""
        try:
            if not self.config.auto_switch_enabled:
                return

            # Find the best available source
            best_source_id = self._find_best_source()

            if best_source_id and best_source_id != self.active_source_id:
                # Check if switching is justified
                if await self._should_switch_to_source(best_source_id):
                    await self.switch_to_source(best_source_id, manual=False)

        except Exception as e:
            logger.error(f"Error evaluating sources: {e}")

    def _find_best_source(self) -> Optional[str]:
        """Find the best available source based on configured criteria"""
        try:
            available_sources = {
                sid: source
                for sid, source in self.sources.items()
                if (
                    source.state == SourceState.AVAILABLE
                    and sid not in self.config.blacklisted_sources
                )
            }

            if not available_sources:
                return None

            # Apply switching mode logic
            if self.config.switching_mode == SwitchingMode.PRIORITY_BASED:
                return self._find_best_by_priority(available_sources)
            elif self.config.switching_mode == SwitchingMode.QUALITY_BASED:
                return self._find_best_by_quality(available_sources)
            else:  # AUTOMATIC
                return self._find_best_by_combined_score(available_sources)

        except Exception as e:
            logger.error(f"Error finding best source: {e}")
            return None

    def _find_best_by_priority(
        self, sources: Dict[str, AudioSourceInfo]
    ) -> Optional[str]:
        """Find source with highest priority"""
        return min(sources.keys(), key=lambda sid: sources[sid].priority)

    def _find_best_by_quality(
        self, sources: Dict[str, AudioSourceInfo]
    ) -> Optional[str]:
        """Find source with highest quality score"""
        return max(sources.keys(), key=lambda sid: sources[sid].quality_score)

    def _find_best_by_combined_score(
        self, sources: Dict[str, AudioSourceInfo]
    ) -> Optional[str]:
        """Find source with best combined priority and quality score"""

        def combined_score(source: AudioSourceInfo) -> float:
            # Normalize priority (lower is better, so invert)
            priority_score = 1.0 / (source.priority + 1)

            # Apply type-specific weight
            type_weight = self.config.priority_weights.get(
                source.source_type.value, 0.5
            )

            # Combine scores
            return (priority_score * 0.3 + source.quality_score * 0.7) * type_weight

        return max(sources.keys(), key=lambda sid: combined_score(sources[sid]))

    async def _should_switch_to_source(self, source_id: str) -> bool:
        """Determine if we should switch to the given source"""
        try:
            if not self.active_source_id:
                return True  # No active source, switch immediately

            current_source = self.sources.get(self.active_source_id)
            new_source = self.sources.get(source_id)

            if not current_source or not new_source:
                return False

            # Don't switch if current source is in preferred list
            if (
                self.config.preferred_sources
                and self.active_source_id in self.config.preferred_sources
                and current_source.quality_score >= self.config.quality_threshold
            ):
                return False

            # Don't switch if new source doesn't meet quality threshold
            if new_source.quality_score < self.config.quality_threshold:
                return False

            # If sticky switching is enabled, require significant improvement
            if self.config.sticky_switching:
                improvement_threshold = 0.2  # Require 20% improvement
                if (
                    new_source.quality_score
                    < current_source.quality_score + improvement_threshold
                ):
                    return False

            # Check if current source has degraded below threshold
            if current_source.quality_score < self.config.quality_threshold:
                return True

            # Switch if new source has significantly better quality
            return new_source.quality_score > current_source.quality_score + 0.1

        except Exception as e:
            logger.error(
                f"Error determining if should switch to source {source_id}: {e}"
            )
            return False

    async def _find_and_switch_to_best_source(self):
        """Find and switch to the best available source"""
        best_source_id = self._find_best_source()
        if best_source_id:
            await self.switch_to_source(best_source_id, manual=False)
        else:
            logger.warning("No suitable source found for switching")
            self.active_source_id = None

    def _calculate_quality_score(self, source: AudioSourceInfo) -> float:
        """Calculate quality score for a source (0-1, higher is better)"""
        try:
            score = 1.0

            # Latency penalty
            if source.latency_ms > self.config.max_latency_ms:
                score *= 0.5
            elif source.latency_ms > self.config.max_latency_ms / 2:
                score *= 0.8

            # Packet loss penalty
            if source.packet_loss_rate > self.config.max_packet_loss_rate:
                score *= 0.3
            elif source.packet_loss_rate > self.config.max_packet_loss_rate / 2:
                score *= 0.7

            # Signal-to-noise ratio bonus
            if source.signal_to_noise_ratio >= self.config.min_signal_to_noise_ratio:
                score *= 1.1
            elif (
                source.signal_to_noise_ratio < self.config.min_signal_to_noise_ratio / 2
            ):
                score *= 0.6

            # Activity recency bonus
            time_since_activity = (
                datetime.now() - source.last_activity
            ).total_seconds()
            if time_since_activity < 1:
                score *= 1.05
            elif time_since_activity > 5:
                score *= 0.9

            return min(score, 1.0)  # Cap at 1.0

        except Exception as e:
            logger.error(
                f"Error calculating quality score for source {source.source_id}: {e}"
            )
            return 0.5  # Default neutral score

    async def _activate_source(self, source_id: str) -> bool:
        """Activate a source"""
        try:
            if source_id not in self.sources:
                return False

            source = self.sources[source_id]
            source.state = SourceState.ACTIVE

            logger.info(f"Activated source: {source.name}")
            return True

        except Exception as e:
            logger.error(f"Error activating source {source_id}: {e}")
            return False

    async def _deactivate_source(self, source_id: str) -> bool:
        """Deactivate a source"""
        try:
            if source_id not in self.sources:
                return False

            source = self.sources[source_id]
            source.state = SourceState.AVAILABLE

            logger.info(f"Deactivated source: {source.name}")
            return True

        except Exception as e:
            logger.error(f"Error deactivating source {source_id}: {e}")
            return False

    async def _notify_switch_callbacks(self, source_id: str, source: AudioSourceInfo):
        """Notify all registered callbacks about source switch"""
        for callback in self.switching_callbacks:
            try:
                await callback(source_id, source)
            except Exception as e:
                logger.error(f"Error in switching callback: {e}")

    def add_switch_callback(self, callback: Callable):
        """Add callback for source switching events"""
        self.switching_callbacks.append(callback)

    def remove_switch_callback(self, callback: Callable):
        """Remove switching callback"""
        if callback in self.switching_callbacks:
            self.switching_callbacks.remove(callback)

    def get_active_source(self) -> Optional[AudioSourceInfo]:
        """Get the currently active source"""
        if self.active_source_id:
            return self.sources.get(self.active_source_id)
        return None

    def get_all_sources(self) -> Dict[str, AudioSourceInfo]:
        """Get all registered sources"""
        return self.sources.copy()

    def get_available_sources(self) -> Dict[str, AudioSourceInfo]:
        """Get all available sources"""
        return {
            sid: source
            for sid, source in self.sources.items()
            if source.state == SourceState.AVAILABLE
        }

    def get_switcher_stats(self) -> Dict[str, Any]:
        """Get switching statistics"""
        return {
            **self.stats,
            "active_source_id": self.active_source_id,
            "total_sources": len(self.sources),
            "available_sources": len(self.get_available_sources()),
            "config": asdict(self.config),
        }

    def update_config(self, new_config: Dict[str, Any]) -> bool:
        """Update switcher configuration"""
        try:
            for key, value in new_config.items():
                if hasattr(self.config, key):
                    setattr(self.config, key, value)

            logger.info("Source switcher configuration updated")
            return True

        except Exception as e:
            logger.error(f"Error updating switcher configuration: {e}")
            return False


# Global source switcher instance
source_switcher: Optional[SourceSwitcher] = None


async def get_source_switcher(config: SwitchingConfig = None) -> SourceSwitcher:
    """Get or create source switcher instance"""
    global source_switcher
    if source_switcher is None:
        source_switcher = SourceSwitcher(config or SwitchingConfig())
    return source_switcher


async def start_source_switcher(config: SwitchingConfig = None) -> bool:
    """Start the global source switcher"""
    switcher = await get_source_switcher(config)
    return await switcher.start()


async def stop_source_switcher() -> bool:
    """Stop the global source switcher"""
    global source_switcher
    if source_switcher:
        result = await source_switcher.stop()
        source_switcher = None
        return result
    return True
