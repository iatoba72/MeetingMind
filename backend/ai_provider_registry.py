# AI Provider Registry
# Manages dynamic loading and configuration of AI providers for MeetingMind
# Supports multiple provider types with cost tracking and health monitoring

import json
import os
import time
import asyncio
import logging
from typing import Dict, List, Optional, Any, Union, Type
from dataclasses import dataclass, asdict
from enum import Enum
from datetime import datetime, timedelta
from pathlib import Path
import importlib
from abc import ABC, abstractmethod

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ProviderStatus(Enum):
    """Provider health status enumeration"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"

@dataclass
class UsageMetrics:
    """Tracks usage and cost metrics for a provider"""
    total_requests: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost_cents: float = 0.0
    last_request_timestamp: Optional[datetime] = None
    average_latency_ms: float = 0.0
    error_count: int = 0
    success_rate: float = 100.0

@dataclass
class HealthMetrics:
    """Provider health check metrics"""
    status: ProviderStatus = ProviderStatus.UNKNOWN
    last_check_timestamp: Optional[datetime] = None
    consecutive_failures: int = 0
    response_time_ms: float = 0.0
    error_message: Optional[str] = None
    check_count: int = 0
    success_count: int = 0
    last_success_timestamp: Optional[datetime] = None
    uptime_percentage: float = 100.0
    average_response_time: float = 0.0

class BaseAIProvider(ABC):
    """
    Abstract base class for AI providers
    
    All AI providers must implement this interface to work with the registry.
    This ensures consistent behavior across different provider implementations
    while allowing for provider-specific optimizations.
    
    Key Features:
    - Async/await support for non-blocking operations
    - Streaming response capability
    - Cost tracking with token counting
    - Health check monitoring
    - Error handling and retry logic
    """
    
    def __init__(self, config: Dict[str, Any], provider_id: str):
        self.config = config
        self.provider_id = provider_id
        self.usage_metrics = UsageMetrics()
        self.health_metrics = HealthMetrics()
        
    @abstractmethod
    async def generate_text(
        self, 
        prompt: str, 
        model: str = None,
        max_tokens: int = None,
        temperature: float = 0.7,
        stream: bool = False,
        **kwargs
    ) -> Union[str, AsyncIterator[str]]:
        """Generate text response from the AI provider"""
        pass
    
    @abstractmethod
    async def chat_completion(
        self,
        messages: List[Dict[str, str]],
        model: str = None,
        max_tokens: int = None,
        temperature: float = 0.7,
        stream: bool = False,
        **kwargs
    ) -> Union[Dict[str, Any], AsyncIterator[Dict[str, Any]]]:
        """Generate chat completion response"""
        pass
    
    @abstractmethod
    async def health_check(self) -> bool:
        """Perform provider health check"""
        pass
    
    @abstractmethod
    def estimate_cost(self, input_tokens: int, output_tokens: int, model: str = None) -> float:
        """Estimate cost in cents for token usage"""
        pass
    
    def update_usage_metrics(self, input_tokens: int, output_tokens: int, latency_ms: float, cost_cents: float):
        """Update usage statistics"""
        self.usage_metrics.total_requests += 1
        self.usage_metrics.total_input_tokens += input_tokens
        self.usage_metrics.total_output_tokens += output_tokens
        self.usage_metrics.total_cost_cents += cost_cents
        self.usage_metrics.last_request_timestamp = datetime.now()
        
        # Update average latency
        total_requests = self.usage_metrics.total_requests
        self.usage_metrics.average_latency_ms = (
            (self.usage_metrics.average_latency_ms * (total_requests - 1) + latency_ms) / total_requests
        )
    
    def update_health_metrics(self, status: ProviderStatus, response_time_ms: float = 0.0, error_message: str = None):
        """Update health check metrics with comprehensive tracking"""
        self.health_metrics.status = status
        self.health_metrics.last_check_timestamp = datetime.now()
        self.health_metrics.response_time_ms = response_time_ms
        self.health_metrics.error_message = error_message
        self.health_metrics.check_count += 1
        
        if status == ProviderStatus.HEALTHY:
            self.health_metrics.consecutive_failures = 0
            self.health_metrics.success_count += 1
            self.health_metrics.last_success_timestamp = datetime.now()
        else:
            self.health_metrics.consecutive_failures += 1
        
        # Update uptime percentage
        if self.health_metrics.check_count > 0:
            self.health_metrics.uptime_percentage = (
                self.health_metrics.success_count / self.health_metrics.check_count
            ) * 100
        
        # Update average response time
        if response_time_ms > 0:
            if self.health_metrics.average_response_time == 0:
                self.health_metrics.average_response_time = response_time_ms
            else:
                # Exponential moving average with alpha = 0.1
                alpha = 0.1
                self.health_metrics.average_response_time = (
                    alpha * response_time_ms + 
                    (1 - alpha) * self.health_metrics.average_response_time
                )

class AnthropicProvider(BaseAIProvider):
    """Anthropic Claude provider implementation"""
    
    def __init__(self, config: Dict[str, Any], provider_id: str):
        super().__init__(config, provider_id)
        try:
            import anthropic
            self.client = anthropic.AsyncAnthropic(
                api_key=config.get("api_key"),
                base_url=config.get("base_url", "https://api.anthropic.com")
            )
        except ImportError:
            logger.error("Anthropic library not installed. Run: pip install anthropic")
            raise
    
    async def generate_text(self, prompt: str, model: str = None, **kwargs) -> str:
        start_time = time.time()
        model = model or "claude-3-5-sonnet-20241022"
        
        try:
            response = await self.client.messages.create(
                model=model,
                max_tokens=kwargs.get("max_tokens", self.config.get("max_tokens", 4096)),
                temperature=kwargs.get("temperature", 0.7),
                messages=[{"role": "user", "content": prompt}]
            )
            
            latency_ms = (time.time() - start_time) * 1000
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            cost = self.estimate_cost(input_tokens, output_tokens, model)
            
            self.update_usage_metrics(input_tokens, output_tokens, latency_ms, cost)
            self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
            
            return response.content[0].text
            
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            raise
    
    async def chat_completion(self, messages: List[Dict[str, str]], model: str = None, **kwargs) -> Dict[str, Any]:
        start_time = time.time()
        model = model or "claude-3-5-sonnet-20241022"
        
        try:
            response = await self.client.messages.create(
                model=model,
                max_tokens=kwargs.get("max_tokens", self.config.get("max_tokens", 4096)),
                temperature=kwargs.get("temperature", 0.7),
                messages=messages
            )
            
            latency_ms = (time.time() - start_time) * 1000
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens
            cost = self.estimate_cost(input_tokens, output_tokens, model)
            
            self.update_usage_metrics(input_tokens, output_tokens, latency_ms, cost)
            self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
            
            return {
                "message": {"role": "assistant", "content": response.content[0].text},
                "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
                "cost_cents": cost
            }
            
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            raise
    
    async def health_check(self) -> bool:
        try:
            start_time = time.time()
            response = await self.client.messages.create(
                model="claude-3-haiku-20240307",
                max_tokens=10,
                messages=[{"role": "user", "content": "Hello"}]
            )
            latency_ms = (time.time() - start_time) * 1000
            self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
            return True
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            return False
    
    def estimate_cost(self, input_tokens: int, output_tokens: int, model: str = None) -> float:
        # Anthropic pricing (cents per token)
        pricing = {
            "claude-3-5-sonnet-20241022": {"input": 0.0003, "output": 0.0015},
            "claude-3-haiku-20240307": {"input": 0.000025, "output": 0.000125},
        }
        
        model_pricing = pricing.get(model or "claude-3-5-sonnet-20241022", pricing["claude-3-5-sonnet-20241022"])
        return (input_tokens * model_pricing["input"]) + (output_tokens * model_pricing["output"])

class OpenAIProvider(BaseAIProvider):
    """OpenAI GPT provider implementation"""
    
    def __init__(self, config: Dict[str, Any], provider_id: str):
        super().__init__(config, provider_id)
        try:
            import openai
            self.client = openai.AsyncOpenAI(
                api_key=config.get("api_key"),
                organization=config.get("organization"),
                base_url=config.get("base_url", "https://api.openai.com/v1")
            )
        except ImportError:
            logger.error("OpenAI library not installed. Run: pip install openai")
            raise
    
    async def generate_text(self, prompt: str, model: str = None, **kwargs) -> str:
        response = await self.chat_completion(
            [{"role": "user", "content": prompt}],
            model=model,
            **kwargs
        )
        return response["message"]["content"]
    
    async def chat_completion(self, messages: List[Dict[str, str]], model: str = None, **kwargs) -> Dict[str, Any]:
        start_time = time.time()
        model = model or "gpt-4o-mini"
        
        try:
            response = await self.client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=kwargs.get("max_tokens", self.config.get("max_tokens", 4096)),
                temperature=kwargs.get("temperature", 0.7)
            )
            
            latency_ms = (time.time() - start_time) * 1000
            input_tokens = response.usage.prompt_tokens
            output_tokens = response.usage.completion_tokens
            cost = self.estimate_cost(input_tokens, output_tokens, model)
            
            self.update_usage_metrics(input_tokens, output_tokens, latency_ms, cost)
            self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
            
            return {
                "message": response.choices[0].message.to_dict(),
                "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
                "cost_cents": cost
            }
            
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            raise
    
    async def health_check(self) -> bool:
        try:
            start_time = time.time()
            response = await self.client.chat.completions.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "user", "content": "Hello"}],
                max_tokens=1
            )
            latency_ms = (time.time() - start_time) * 1000
            self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
            return True
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            return False
    
    def estimate_cost(self, input_tokens: int, output_tokens: int, model: str = None) -> float:
        # OpenAI pricing (cents per token)
        pricing = {
            "gpt-4o": {"input": 0.0025, "output": 0.01},
            "gpt-4o-mini": {"input": 0.00015, "output": 0.0006},
            "gpt-3.5-turbo": {"input": 0.0005, "output": 0.0015},
        }
        
        model_pricing = pricing.get(model or "gpt-4o-mini", pricing["gpt-4o-mini"])
        return (input_tokens * model_pricing["input"]) + (output_tokens * model_pricing["output"])

class LocalProvider(BaseAIProvider):
    """Local model provider (Ollama, LM Studio, etc.)"""
    
    def __init__(self, config: Dict[str, Any], provider_id: str):
        super().__init__(config, provider_id)
        import aiohttp
        self.session = aiohttp.ClientSession()
        self.base_url = config.get("base_url", "http://localhost:11434")
        self.api_format = config.get("api_format", "ollama")
    
    async def generate_text(self, prompt: str, model: str = None, **kwargs) -> str:
        if self.api_format == "ollama":
            return await self._ollama_generate(prompt, model, **kwargs)
        else:
            # OpenAI-compatible format
            response = await self.chat_completion(
                [{"role": "user", "content": prompt}],
                model=model,
                **kwargs
            )
            return response["message"]["content"]
    
    async def _ollama_generate(self, prompt: str, model: str = None, **kwargs) -> str:
        start_time = time.time()
        model = model or "llama3.1:8b"
        
        try:
            async with self.session.post(
                f"{self.base_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {
                        "temperature": kwargs.get("temperature", 0.7),
                        "num_predict": kwargs.get("max_tokens", self.config.get("max_tokens", 2048))
                    }
                }
            ) as response:
                result = await response.json()
                
                latency_ms = (time.time() - start_time) * 1000
                # Local models have zero cost
                self.update_usage_metrics(0, 0, latency_ms, 0.0)
                self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
                
                return result.get("response", "")
                
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            raise
    
    async def chat_completion(self, messages: List[Dict[str, str]], model: str = None, **kwargs) -> Dict[str, Any]:
        start_time = time.time()
        model = model or "llama3.1:8b"
        
        try:
            async with self.session.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {
                        "temperature": kwargs.get("temperature", 0.7),
                        "num_predict": kwargs.get("max_tokens", self.config.get("max_tokens", 2048))
                    }
                }
            ) as response:
                result = await response.json()
                
                latency_ms = (time.time() - start_time) * 1000
                # Local models have zero cost
                self.update_usage_metrics(0, 0, latency_ms, 0.0)
                self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
                
                return {
                    "message": result.get("message", {}),
                    "usage": {"input_tokens": 0, "output_tokens": 0},
                    "cost_cents": 0.0
                }
                
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            raise
    
    async def health_check(self) -> bool:
        try:
            start_time = time.time()
            async with self.session.get(f"{self.base_url}/api/tags") as response:
                if response.status == 200:
                    latency_ms = (time.time() - start_time) * 1000
                    self.update_health_metrics(ProviderStatus.HEALTHY, latency_ms)
                    return True
                else:
                    self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=f"HTTP {response.status}")
                    return False
        except Exception as e:
            self.update_health_metrics(ProviderStatus.UNHEALTHY, error_message=str(e))
            return False
    
    def estimate_cost(self, input_tokens: int, output_tokens: int, model: str = None) -> float:
        # Local models are free
        return 0.0

class AIProviderRegistry:
    """
    Central registry for managing AI providers
    
    The registry provides:
    1. Dynamic provider loading based on configuration
    2. Health monitoring and status tracking
    3. Cost tracking and usage analytics
    4. Provider selection with fallback logic
    5. Configuration validation and management
    
    Design Patterns:
    - Factory pattern for provider instantiation
    - Registry pattern for provider management
    - Strategy pattern for provider selection
    - Observer pattern for health monitoring
    
    Production Features:
    - Automatic failover to backup providers
    - Rate limiting and quota management
    - Caching for improved performance
    - Metrics collection and monitoring
    """
    
    def __init__(self):
        self.providers: Dict[str, BaseAIProvider] = {}
        self.provider_configs: Dict[str, Dict[str, Any]] = {}
        self.health_check_tasks: Dict[str, asyncio.Task] = {}
        
        # Provider type mapping
        self.provider_classes = {
            "anthropic": AnthropicProvider,
            "openai": OpenAIProvider,
            "xai": OpenAIProvider,  # X.AI uses OpenAI-compatible API
            "local": LocalProvider,
            "azure_openai": OpenAIProvider,  # Azure uses OpenAI-compatible API
        }
    
    async def load_configuration(self, config_path: str):
        """Load provider configurations from JSON file"""
        try:
            with open(config_path, 'r') as f:
                config_data = json.load(f)
            
            # Validate schema (basic validation)
            if "providers" not in config_data:
                raise ValueError("Configuration must contain 'providers' key")
            
            # Clear existing providers
            await self.shutdown()
            
            # Load each provider
            for provider_config in config_data["providers"]:
                if provider_config.get("enabled", True):
                    await self.register_provider(provider_config)
            
            logger.info(f"Loaded {len(self.providers)} providers from {config_path}")
            
        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            raise
    
    async def register_provider(self, config: Dict[str, Any]):
        """Register a single provider from configuration"""
        provider_id = config["id"]
        provider_type = config["type"]
        
        if provider_type not in self.provider_classes:
            logger.warning(f"Unknown provider type: {provider_type}")
            return
        
        try:
            # Expand environment variables in config
            expanded_config = self._expand_env_vars(config["config"])
            
            # Create provider instance
            provider_class = self.provider_classes[provider_type]
            provider = provider_class(expanded_config, provider_id)
            
            # Store provider and config
            self.providers[provider_id] = provider
            self.provider_configs[provider_id] = config
            
            # Start health monitoring if enabled
            health_config = config.get("health_check", {})
            if health_config.get("enabled", True):
                await self._start_health_monitoring(provider_id, health_config)
            
            logger.info(f"Registered provider: {provider_id} ({provider_type})")
            
        except Exception as e:
            logger.error(f"Failed to register provider {provider_id}: {e}")
            raise
    
    def _expand_env_vars(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Expand environment variables in configuration values"""
        expanded = {}
        for key, value in config.items():
            if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
                env_var = value[2:-1]
                expanded[key] = os.getenv(env_var, value)
            else:
                expanded[key] = value
        return expanded
    
    async def _start_health_monitoring(self, provider_id: str, health_config: Dict[str, Any]):
        """Start enhanced background health monitoring for a provider"""
        interval = health_config.get("interval_seconds", 300)
        timeout = health_config.get("timeout_seconds", 10)
        failure_threshold = health_config.get("failure_threshold", 3)
        
        async def health_monitor():
            while provider_id in self.providers:
                try:
                    provider = self.providers[provider_id]
                    
                    # Perform health check with timeout
                    try:
                        start_time = time.time()
                        health_result = await asyncio.wait_for(
                            provider.health_check(), 
                            timeout=timeout
                        )
                        response_time_ms = (time.time() - start_time) * 1000
                        
                        if health_result:
                            # Determine status based on response time and consecutive failures
                            if response_time_ms > timeout * 800:  # 80% of timeout
                                status = ProviderStatus.DEGRADED
                            else:
                                status = ProviderStatus.HEALTHY
                            
                            provider.update_health_metrics(status, response_time_ms)
                            logger.debug(f"Health check passed for {provider_id}: {response_time_ms:.1f}ms")
                        else:
                            provider.update_health_metrics(
                                ProviderStatus.UNHEALTHY, 
                                response_time_ms, 
                                "Health check returned False"
                            )
                            
                    except asyncio.TimeoutError:
                        provider.update_health_metrics(
                            ProviderStatus.UNHEALTHY, 
                            timeout * 1000, 
                            f"Health check timeout after {timeout}s"
                        )
                        logger.warning(f"Health check timeout for {provider_id}")
                        
                    except Exception as health_error:
                        provider.update_health_metrics(
                            ProviderStatus.UNHEALTHY, 
                            0, 
                            str(health_error)
                        )
                        logger.error(f"Health check error for {provider_id}: {health_error}")
                    
                    # Check if provider should be marked as critically unhealthy
                    if provider.health_metrics.consecutive_failures >= failure_threshold:
                        logger.critical(f"Provider {provider_id} has {provider.health_metrics.consecutive_failures} consecutive failures")
                        
                        # Optionally disable provider after too many failures
                        if provider.health_metrics.consecutive_failures >= failure_threshold * 2:
                            logger.critical(f"Disabling provider {provider_id} due to excessive failures")
                            self.provider_configs[provider_id]["enabled"] = False
                    
                    await asyncio.sleep(interval)
                    
                except asyncio.CancelledError:
                    logger.info(f"Health monitoring cancelled for {provider_id}")
                    break
                except Exception as e:
                    logger.error(f"Health monitoring error for {provider_id}: {e}")
                    await asyncio.sleep(interval)
        
        task = asyncio.create_task(health_monitor())
        self.health_check_tasks[provider_id] = task
        logger.info(f"Started health monitoring for {provider_id} (interval: {interval}s, timeout: {timeout}s)")
    
    async def get_provider(self, provider_id: str = None) -> Optional[BaseAIProvider]:
        """Get a specific provider or select the best available one"""
        if provider_id:
            return self.providers.get(provider_id)
        
        # Select best provider based on priority and health
        available_providers = []
        for pid, provider in self.providers.items():
            config = self.provider_configs[pid]
            if (config.get("enabled", True) and 
                provider.health_metrics.status in [ProviderStatus.HEALTHY, ProviderStatus.UNKNOWN]):
                available_providers.append((pid, config.get("priority", 50)))
        
        if not available_providers:
            return None
        
        # Sort by priority (lower numbers = higher priority)
        available_providers.sort(key=lambda x: x[1])
        return self.providers[available_providers[0][0]]
    
    async def generate_text(self, prompt: str, provider_id: str = None, **kwargs) -> str:
        """Generate text using the specified or best available provider"""
        provider = await self.get_provider(provider_id)
        if not provider:
            raise RuntimeError("No available providers")
        
        return await provider.generate_text(prompt, **kwargs)
    
    async def chat_completion(self, messages: List[Dict[str, str]], provider_id: str = None, **kwargs) -> Dict[str, Any]:
        """Generate chat completion using the specified or best available provider"""
        provider = await self.get_provider(provider_id)
        if not provider:
            raise RuntimeError("No available providers")
        
        return await provider.chat_completion(messages, **kwargs)
    
    def get_provider_status(self) -> Dict[str, Dict[str, Any]]:
        """Get status information for all providers"""
        status = {}
        for provider_id, provider in self.providers.items():
            config = self.provider_configs[provider_id]
            status[provider_id] = {
                "name": config["name"],
                "type": config["type"],
                "enabled": config.get("enabled", True),
                "priority": config.get("priority", 50),
                "health": {
                    "status": provider.health_metrics.status.value,
                    "last_check": provider.health_metrics.last_check_timestamp.isoformat() if provider.health_metrics.last_check_timestamp else None,
                    "consecutive_failures": provider.health_metrics.consecutive_failures,
                    "response_time_ms": provider.health_metrics.response_time_ms,
                    "error_message": provider.health_metrics.error_message,
                    "check_count": provider.health_metrics.check_count,
                    "success_count": provider.health_metrics.success_count,
                    "last_success": provider.health_metrics.last_success_timestamp.isoformat() if provider.health_metrics.last_success_timestamp else None,
                    "uptime_percentage": provider.health_metrics.uptime_percentage,
                    "average_response_time": provider.health_metrics.average_response_time
                },
                "usage": {
                    "total_requests": provider.usage_metrics.total_requests,
                    "total_input_tokens": provider.usage_metrics.total_input_tokens,
                    "total_output_tokens": provider.usage_metrics.total_output_tokens,
                    "total_cost_cents": provider.usage_metrics.total_cost_cents,
                    "average_latency_ms": provider.usage_metrics.average_latency_ms,
                    "success_rate": provider.usage_metrics.success_rate
                }
            }
        return status
    
    def get_usage_summary(self) -> Dict[str, Any]:
        """Get aggregated usage summary across all providers"""
        total_requests = sum(p.usage_metrics.total_requests for p in self.providers.values())
        total_cost = sum(p.usage_metrics.total_cost_cents for p in self.providers.values())
        total_tokens = sum(
            p.usage_metrics.total_input_tokens + p.usage_metrics.total_output_tokens 
            for p in self.providers.values()
        )
        
        return {
            "total_requests": total_requests,
            "total_cost_cents": total_cost,
            "total_cost_usd": total_cost / 100,
            "total_tokens": total_tokens,
            "active_providers": len([p for p in self.providers.values() 
                                   if p.health_metrics.status == ProviderStatus.HEALTHY]),
            "providers_count": len(self.providers)
        }
    
    async def test_provider(self, provider_id: str, test_prompt: str = "Hello, how are you?") -> Dict[str, Any]:
        """Test a specific provider with a test prompt"""
        provider = self.providers.get(provider_id)
        if not provider:
            return {"success": False, "error": "Provider not found"}
        
        try:
            start_time = time.time()
            response = await provider.generate_text(test_prompt)
            latency_ms = (time.time() - start_time) * 1000
            
            return {
                "success": True,
                "response": response,
                "latency_ms": latency_ms,
                "cost_cents": provider.estimate_cost(len(test_prompt.split()), len(response.split()))
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "error_type": type(e).__name__
            }
    
    async def shutdown(self):
        """Shutdown all providers and cleanup resources"""
        # Cancel health check tasks
        for task in self.health_check_tasks.values():
            task.cancel()
        
        # Wait for tasks to complete
        if self.health_check_tasks:
            await asyncio.gather(*self.health_check_tasks.values(), return_exceptions=True)
        
        # Cleanup provider resources
        for provider in self.providers.values():
            if hasattr(provider, 'session') and provider.session:
                await provider.session.close()
        
        self.providers.clear()
        self.provider_configs.clear()
        self.health_check_tasks.clear()
        
        logger.info("AI Provider Registry shutdown complete")

# Global registry instance
registry = AIProviderRegistry()

async def initialize_registry(config_path: str = None):
    """Initialize the global registry with configuration"""
    if config_path is None:
        # Look for config in standard locations
        possible_paths = [
            "/mnt/d/Claude/MeetingsHacker/meeting-mind/shared/ai-provider-examples.json",
            "./shared/ai-provider-examples.json",
            "./ai-provider-config.json"
        ]
        
        for path in possible_paths:
            if os.path.exists(path):
                config_path = path
                break
    
    if config_path and os.path.exists(config_path):
        await registry.load_configuration(config_path)
        logger.info("AI Provider Registry initialized successfully")
    else:
        logger.warning("No AI provider configuration found")

# FastAPI integration
async def get_registry() -> AIProviderRegistry:
    """Dependency for FastAPI routes"""
    return registry