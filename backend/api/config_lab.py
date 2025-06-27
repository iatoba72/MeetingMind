# Config Laboratory API
# Backend endpoints for testing configuration changes

from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from fastapi.responses import JSONResponse
from typing import Dict, List, Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
import uuid
import json
import asyncio
import logging
import time
from pathlib import Path

router = APIRouter(prefix="/api/config-lab", tags=["config-lab"])
logger = logging.getLogger("ConfigLabAPI")

# Pydantic models
class ExperimentResult(BaseModel):
    timestamp: str
    test_name: str
    status: str  # 'pass', 'fail', 'warning'
    message: str
    metrics: Optional[Dict[str, float]] = None
    screenshot: Optional[str] = None

class Experiment(BaseModel):
    id: str
    name: str
    description: str
    settings: Dict[str, Any]
    created_at: str
    created_by: str
    results: Optional[List[ExperimentResult]] = None
    status: str  # 'draft', 'running', 'completed', 'failed'
    duration: Optional[int] = None  # in seconds
    tags: List[str] = Field(default_factory=list)

class TestSuite(BaseModel):
    id: str
    name: str
    description: str
    tests: List[Dict[str, Any]]
    enabled: bool

class Environment(BaseModel):
    id: str
    name: str
    description: str
    device_type: str  # 'desktop', 'tablet', 'mobile'
    screen_size: Dict[str, int]
    user_agent: str
    enabled: bool

class RunExperimentRequest(BaseModel):
    experiment_id: str
    test_suite_ids: List[str]
    environment_ids: List[str]
    run_by: str = "api"

class TestRunner:
    """Handles the execution of configuration tests"""
    
    def __init__(self):
        self.logger = logging.getLogger("TestRunner")
        self.test_functions = {
            'testFontSizeScaling': self._test_font_size_scaling,
            'testThemeTransition': self._test_theme_transition,
            'testCompactMode': self._test_compact_mode,
            'measureRenderTime': self._measure_render_time,
            'measureMemoryUsage': self._measure_memory_usage,
            'testContrastRatio': self._test_contrast_ratio,
            'testKeyboardNavigation': self._test_keyboard_navigation,
        }
    
    async def run_test(self, test: Dict[str, Any], environment: Environment, settings: Dict[str, Any]) -> ExperimentResult:
        """Run a single test"""
        start_time = time.time()
        
        try:
            # Get test function
            test_function = self.test_functions.get(test['function'])
            if not test_function:
                raise ValueError(f"Unknown test function: {test['function']}")
            
            # Apply test timeout
            timeout = test.get('timeout', 10000) / 1000  # Convert to seconds
            
            # Run test with timeout
            result = await asyncio.wait_for(
                test_function(test, environment, settings),
                timeout=timeout
            )
            
            execution_time = (time.time() - start_time) * 1000  # Convert to ms
            
            return ExperimentResult(
                timestamp=datetime.utcnow().isoformat(),
                test_name=f"{environment.name} - {test['name']}",
                status=result.get('status', 'pass'),
                message=result.get('message', 'Test completed successfully'),
                metrics={
                    'execution_time': round(execution_time, 2),
                    **result.get('metrics', {})
                }
            )
            
        except asyncio.TimeoutError:
            return ExperimentResult(
                timestamp=datetime.utcnow().isoformat(),
                test_name=f"{environment.name} - {test['name']}",
                status='fail',
                message=f"Test timed out after {timeout}s"
            )
        except Exception as e:
            return ExperimentResult(
                timestamp=datetime.utcnow().isoformat(),
                test_name=f"{environment.name} - {test['name']}",
                status='fail',
                message=f"Test error: {str(e)}"
            )
    
    async def _test_font_size_scaling(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Test font size scaling"""
        await asyncio.sleep(0.5)  # Simulate test execution
        
        font_size = settings.get('font_size', 14)
        
        # Simulate checking if UI scales properly
        if font_size < 10 or font_size > 24:
            return {
                'status': 'fail',
                'message': f'Font size {font_size}px is outside acceptable range (10-24px)',
                'metrics': {'font_size': font_size}
            }
        
        # Check if it's mobile and font is too small
        if environment.device_type == 'mobile' and font_size < 12:
            return {
                'status': 'warning',
                'message': f'Font size {font_size}px may be too small for mobile devices',
                'metrics': {'font_size': font_size}
            }
        
        return {
            'status': 'pass',
            'message': f'Font size {font_size}px scales appropriately for {environment.device_type}',
            'metrics': {'font_size': font_size}
        }
    
    async def _test_theme_transition(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Test theme transition"""
        await asyncio.sleep(0.3)
        
        theme = settings.get('theme', 'light')
        
        # Simulate measuring transition smoothness
        transition_time = 200 + (50 if theme == 'auto' else 0)  # Auto theme takes longer
        
        if transition_time > 300:
            return {
                'status': 'warning',
                'message': f'Theme transition took {transition_time}ms (recommended < 300ms)',
                'metrics': {'transition_time': transition_time}
            }
        
        return {
            'status': 'pass',
            'message': f'Theme transition to {theme} completed in {transition_time}ms',
            'metrics': {'transition_time': transition_time}
        }
    
    async def _test_compact_mode(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Test compact mode"""
        await asyncio.sleep(0.4)
        
        compact_mode = settings.get('compact_mode', False)
        
        if not compact_mode:
            return {
                'status': 'pass',
                'message': 'Compact mode not enabled, test skipped',
                'metrics': {}
            }
        
        # Simulate checking if elements remain accessible
        min_touch_target = 44 if environment.device_type == 'mobile' else 32
        simulated_button_size = 36 if compact_mode else 44
        
        if simulated_button_size < min_touch_target:
            return {
                'status': 'fail',
                'message': f'Compact mode makes touch targets too small ({simulated_button_size}px < {min_touch_target}px)',
                'metrics': {'button_size': simulated_button_size, 'min_size': min_touch_target}
            }
        
        return {
            'status': 'pass',
            'message': 'Compact mode maintains accessibility standards',
            'metrics': {'button_size': simulated_button_size}
        }
    
    async def _measure_render_time(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Measure render time"""
        await asyncio.sleep(1.0)  # Simulate performance measurement
        
        # Simulate render time based on settings complexity
        base_time = 50
        complexity_factor = len(settings) * 2
        device_factor = {'mobile': 1.5, 'tablet': 1.2, 'desktop': 1.0}[environment.device_type]
        
        render_time = base_time + complexity_factor * device_factor
        
        if render_time > 100:
            return {
                'status': 'warning',
                'message': f'Render time {render_time:.1f}ms exceeds recommended threshold (100ms)',
                'metrics': {'render_time': render_time}
            }
        
        return {
            'status': 'pass',
            'message': f'Render time {render_time:.1f}ms is within acceptable range',
            'metrics': {'render_time': render_time}
        }
    
    async def _measure_memory_usage(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Measure memory usage"""
        await asyncio.sleep(0.8)
        
        # Simulate memory usage measurement
        base_memory = 20  # MB
        settings_memory = len(settings) * 0.5
        theme_memory = 5 if settings.get('theme') == 'dark' else 3
        
        total_memory = base_memory + settings_memory + theme_memory
        
        if total_memory > 50:
            return {
                'status': 'warning',
                'message': f'Memory usage {total_memory:.1f}MB is high (recommended < 50MB)',
                'metrics': {'memory_usage': total_memory}
            }
        
        return {
            'status': 'pass',
            'message': f'Memory usage {total_memory:.1f}MB is acceptable',
            'metrics': {'memory_usage': total_memory}
        }
    
    async def _test_contrast_ratio(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Test contrast ratio"""
        await asyncio.sleep(0.6)
        
        theme = settings.get('theme', 'light')
        high_contrast = settings.get('high_contrast', False)
        
        # Simulate contrast ratio calculation
        if high_contrast:
            contrast_ratio = 7.5
        elif theme == 'dark':
            contrast_ratio = 5.2
        else:
            contrast_ratio = 4.8
        
        if contrast_ratio < 4.5:
            return {
                'status': 'fail',
                'message': f'Contrast ratio {contrast_ratio:.1f}:1 fails WCAG AA standards (4.5:1)',
                'metrics': {'contrast_ratio': contrast_ratio}
            }
        
        if contrast_ratio < 7.0:
            return {
                'status': 'warning',
                'message': f'Contrast ratio {contrast_ratio:.1f}:1 meets AA but not AAA standards',
                'metrics': {'contrast_ratio': contrast_ratio}
            }
        
        return {
            'status': 'pass',
            'message': f'Contrast ratio {contrast_ratio:.1f}:1 meets WCAG AAA standards',
            'metrics': {'contrast_ratio': contrast_ratio}
        }
    
    async def _test_keyboard_navigation(self, test: Dict, environment: Environment, settings: Dict[str, Any]) -> Dict[str, Any]:
        """Test keyboard navigation"""
        await asyncio.sleep(1.2)
        
        # Simulate keyboard navigation test
        # This would normally involve checking focus management, tab order, etc.
        
        elements_tested = 15
        accessible_elements = 14 if settings.get('screen_reader_support') else 13
        
        if accessible_elements < elements_tested:
            return {
                'status': 'warning',
                'message': f'{accessible_elements}/{elements_tested} elements are keyboard accessible',
                'metrics': {'accessible_elements': accessible_elements, 'total_elements': elements_tested}
            }
        
        return {
            'status': 'pass',
            'message': f'All {elements_tested} elements are keyboard accessible',
            'metrics': {'accessible_elements': accessible_elements, 'total_elements': elements_tested}
        }

# Storage (in production, this would be a database)
experiments_storage: Dict[str, Experiment] = {}
test_runner = TestRunner()

# Default test suites and environments
DEFAULT_TEST_SUITES = [
    TestSuite(
        id='ui-responsiveness',
        name='UI Responsiveness',
        description='Test how UI adapts to different settings',
        enabled=True,
        tests=[
            {
                'id': 'font-size-test',
                'name': 'Font Size Adaptation',
                'description': 'Verify UI scales properly with font size changes',
                'function': 'testFontSizeScaling',
                'expected_outcome': 'UI elements scale proportionally',
                'timeout': 5000,
                'critical': True
            },
            {
                'id': 'theme-switch-test',
                'name': 'Theme Switch',
                'description': 'Test smooth transition between themes',
                'function': 'testThemeTransition',
                'expected_outcome': 'No layout shifts or flashing',
                'timeout': 3000,
                'critical': False
            },
            {
                'id': 'compact-mode-test',
                'name': 'Compact Mode',
                'description': 'Verify compact mode maintains usability',
                'function': 'testCompactMode',
                'expected_outcome': 'All elements remain accessible',
                'timeout': 4000,
                'critical': True
            }
        ]
    ),
    TestSuite(
        id='performance',
        name='Performance Impact',
        description='Measure performance impact of settings changes',
        enabled=True,
        tests=[
            {
                'id': 'render-time-test',
                'name': 'Render Time',
                'description': 'Measure component render time with new settings',
                'function': 'measureRenderTime',
                'expected_outcome': 'Render time < 100ms',
                'timeout': 10000,
                'critical': True
            },
            {
                'id': 'memory-usage-test',
                'name': 'Memory Usage',
                'description': 'Check memory consumption after settings change',
                'function': 'measureMemoryUsage',
                'expected_outcome': 'Memory increase < 10MB',
                'timeout': 5000,
                'critical': False
            }
        ]
    ),
    TestSuite(
        id='accessibility',
        name='Accessibility',
        description='Verify accessibility compliance with settings',
        enabled=True,
        tests=[
            {
                'id': 'contrast-ratio-test',
                'name': 'Contrast Ratio',
                'description': 'Check color contrast meets WCAG standards',
                'function': 'testContrastRatio',
                'expected_outcome': 'Contrast ratio > 4.5:1',
                'timeout': 3000,
                'critical': True
            },
            {
                'id': 'keyboard-navigation-test',
                'name': 'Keyboard Navigation',
                'description': 'Verify keyboard navigation works with new settings',
                'function': 'testKeyboardNavigation',
                'expected_outcome': 'All elements keyboard accessible',
                'timeout': 8000,
                'critical': True
            }
        ]
    )
]

DEFAULT_ENVIRONMENTS = [
    Environment(
        id='desktop-1080p',
        name='Desktop 1080p',
        description='Standard desktop environment',
        device_type='desktop',
        screen_size={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        enabled=True
    ),
    Environment(
        id='tablet-ipad',
        name='iPad Pro',
        description='Tablet environment',
        device_type='tablet',
        screen_size={'width': 1024, 'height': 1366},
        user_agent='Mozilla/5.0 (iPad; CPU OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        enabled=True
    ),
    Environment(
        id='mobile-iphone',
        name='iPhone 12',
        description='Mobile environment',
        device_type='mobile',
        screen_size={'width': 390, 'height': 844},
        user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
        enabled=False
    )
]

@router.get("/experiments", response_model=List[Experiment])
async def get_experiments():
    """Get all experiments"""
    return list(experiments_storage.values())

@router.post("/experiments", response_model=Experiment)
async def create_experiment(experiment: Experiment):
    """Create a new experiment"""
    if not experiment.id:
        experiment.id = str(uuid.uuid4())
    
    experiment.created_at = datetime.utcnow().isoformat()
    experiments_storage[experiment.id] = experiment
    
    logger.info(f"Created experiment: {experiment.name}")
    return experiment

@router.get("/experiments/{experiment_id}", response_model=Experiment)
async def get_experiment(experiment_id: str):
    """Get a specific experiment"""
    if experiment_id not in experiments_storage:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    return experiments_storage[experiment_id]

@router.put("/experiments/{experiment_id}", response_model=Experiment)
async def update_experiment(experiment_id: str, experiment: Experiment):
    """Update an experiment"""
    if experiment_id not in experiments_storage:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    experiment.id = experiment_id
    experiments_storage[experiment_id] = experiment
    
    logger.info(f"Updated experiment: {experiment.name}")
    return experiment

@router.delete("/experiments/{experiment_id}")
async def delete_experiment(experiment_id: str):
    """Delete an experiment"""
    if experiment_id not in experiments_storage:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    del experiments_storage[experiment_id]
    logger.info(f"Deleted experiment: {experiment_id}")
    
    return {"success": True, "message": "Experiment deleted"}

@router.post("/experiments/{experiment_id}/run")
async def run_experiment(experiment_id: str, request: RunExperimentRequest, background_tasks: BackgroundTasks):
    """Run an experiment"""
    if experiment_id not in experiments_storage:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    experiment = experiments_storage[experiment_id]
    
    # Update experiment status
    experiment.status = "running"
    experiments_storage[experiment_id] = experiment
    
    # Run experiment in background
    background_tasks.add_task(
        _run_experiment_background,
        experiment_id,
        request.test_suite_ids,
        request.environment_ids,
        request.run_by
    )
    
    return {"success": True, "message": "Experiment started", "experiment_id": experiment_id}

async def _run_experiment_background(experiment_id: str, test_suite_ids: List[str], environment_ids: List[str], run_by: str):
    """Run experiment in background"""
    try:
        experiment = experiments_storage[experiment_id]
        start_time = time.time()
        results = []
        
        logger.info(f"Starting experiment {experiment_id}")
        
        # Get test suites and environments
        test_suites = [suite for suite in DEFAULT_TEST_SUITES if suite.id in test_suite_ids]
        environments = [env for env in DEFAULT_ENVIRONMENTS if env.id in environment_ids]
        
        # Run tests in each environment
        for environment in environments:
            for test_suite in test_suites:
                for test in test_suite.tests:
                    try:
                        result = await test_runner.run_test(test, environment, experiment.settings)
                        results.append(result)
                        
                        # Update experiment with partial results
                        experiment.results = results
                        experiments_storage[experiment_id] = experiment
                        
                        # Small delay between tests
                        await asyncio.sleep(0.1)
                        
                    except Exception as e:
                        logger.error(f"Test failed: {e}")
                        error_result = ExperimentResult(
                            timestamp=datetime.utcnow().isoformat(),
                            test_name=f"{environment.name} - {test['name']}",
                            status='fail',
                            message=f"Test execution failed: {str(e)}"
                        )
                        results.append(error_result)
        
        # Calculate duration
        duration = int(time.time() - start_time)
        
        # Update experiment with final results
        experiment.status = "completed"
        experiment.results = results
        experiment.duration = duration
        experiments_storage[experiment_id] = experiment
        
        logger.info(f"Completed experiment {experiment_id} in {duration}s with {len(results)} results")
        
    except Exception as e:
        logger.error(f"Experiment {experiment_id} failed: {e}")
        
        # Mark as failed
        experiment = experiments_storage.get(experiment_id)
        if experiment:
            experiment.status = "failed"
            experiments_storage[experiment_id] = experiment

@router.get("/test-suites", response_model=List[TestSuite])
async def get_test_suites():
    """Get available test suites"""
    return DEFAULT_TEST_SUITES

@router.get("/environments", response_model=List[Environment])
async def get_environments():
    """Get available test environments"""
    return DEFAULT_ENVIRONMENTS

@router.get("/experiments/{experiment_id}/results", response_model=List[ExperimentResult])
async def get_experiment_results(experiment_id: str):
    """Get experiment results"""
    if experiment_id not in experiments_storage:
        raise HTTPException(status_code=404, detail="Experiment not found")
    
    experiment = experiments_storage[experiment_id]
    return experiment.results or []

@router.get("/stats")
async def get_lab_stats():
    """Get laboratory statistics"""
    total_experiments = len(experiments_storage)
    completed_experiments = sum(1 for exp in experiments_storage.values() if exp.status == "completed")
    total_tests_run = sum(len(exp.results or []) for exp in experiments_storage.values())
    
    # Calculate success rate
    all_results = []
    for exp in experiments_storage.values():
        if exp.results:
            all_results.extend(exp.results)
    
    passed_tests = sum(1 for result in all_results if result.status == "pass")
    success_rate = (passed_tests / len(all_results) * 100) if all_results else 0
    
    return {
        "total_experiments": total_experiments,
        "completed_experiments": completed_experiments,
        "total_tests_run": total_tests_run,
        "success_rate": round(success_rate, 2),
        "available_test_suites": len(DEFAULT_TEST_SUITES),
        "available_environments": len(DEFAULT_ENVIRONMENTS)
    }