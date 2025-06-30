"""
Network Diagnostics API Endpoints
Provides REST API for network testing and troubleshooting
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query
from pydantic import BaseModel
from typing import Dict, List, Optional, Any
import logging
import asyncio
from datetime import datetime

from network_diagnostics import (
    get_network_diagnostics,
    run_quick_network_test,
    PingResult,
    PortTestResult,
    BandwidthResult,
    NetworkQualityResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/network-diagnostics", tags=["Network Diagnostics"])


class NetworkDiagnosticsResponse(BaseModel):
    success: bool
    message: str
    data: Optional[Dict[str, Any]] = None


class QuickTestRequest(BaseModel):
    host: Optional[str] = "google.com"


class PingTestRequest(BaseModel):
    host: str
    count: Optional[int] = 10
    timeout: Optional[int] = 5


class PortTestRequest(BaseModel):
    host: str
    port: int
    protocol: Optional[str] = "tcp"
    timeout: Optional[int] = 5


class BandwidthTestRequest(BaseModel):
    duration_seconds: Optional[int] = 10


class ComprehensiveTestRequest(BaseModel):
    target_host: Optional[str] = "google.com"


# Store for background test results
background_test_results = {}


@router.post("/quick-test", response_model=NetworkDiagnosticsResponse)
async def run_quick_test(request: QuickTestRequest):
    """Run a quick network diagnostic test"""
    try:
        result = await run_quick_network_test(request.host)

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"Quick network test completed for {request.host}",
            data={"test_result": result},
        )

    except Exception as e:
        logger.error(f"Error in quick test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ping", response_model=NetworkDiagnosticsResponse)
async def ping_test(request: PingTestRequest):
    """Perform ping test"""
    try:
        diagnostics = await get_network_diagnostics()
        result = await diagnostics.ping_test(
            request.host, request.count, request.timeout
        )

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"Ping test completed for {request.host}",
            data={
                "ping_result": {
                    "host": result.host,
                    "packets_sent": result.packets_sent,
                    "packets_received": result.packets_received,
                    "packet_loss_percent": result.packet_loss_percent,
                    "min_latency_ms": result.min_latency_ms,
                    "max_latency_ms": result.max_latency_ms,
                    "avg_latency_ms": result.avg_latency_ms,
                    "std_deviation_ms": result.std_deviation_ms,
                    "success": result.success,
                    "error_message": result.error_message,
                }
            },
        )

    except Exception as e:
        logger.error(f"Error in ping test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/port-test", response_model=NetworkDiagnosticsResponse)
async def port_connectivity_test(request: PortTestRequest):
    """Test port connectivity"""
    try:
        diagnostics = await get_network_diagnostics()
        result = await diagnostics.test_port_connectivity(
            request.host, request.port, request.protocol, request.timeout
        )

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"Port test completed for {request.host}:{request.port}",
            data={
                "port_result": {
                    "host": result.host,
                    "port": result.port,
                    "protocol": result.protocol,
                    "is_open": result.is_open,
                    "response_time_ms": result.response_time_ms,
                    "error_message": result.error_message,
                }
            },
        )

    except Exception as e:
        logger.error(f"Error in port test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/common-ports", response_model=NetworkDiagnosticsResponse)
async def test_common_ports(host: str = Query(..., description="Host to test")):
    """Test connectivity to common ports"""
    try:
        diagnostics = await get_network_diagnostics()
        results = await diagnostics.test_common_ports(host)

        port_data = []
        for result in results:
            port_data.append(
                {
                    "host": result.host,
                    "port": result.port,
                    "protocol": result.protocol,
                    "is_open": result.is_open,
                    "response_time_ms": result.response_time_ms,
                    "error_message": result.error_message,
                }
            )

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"Common ports test completed for {host}",
            data={"port_results": port_data},
        )

    except Exception as e:
        logger.error(f"Error in common ports test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bandwidth", response_model=NetworkDiagnosticsResponse)
async def bandwidth_test(request: BandwidthTestRequest):
    """Perform bandwidth test"""
    try:
        diagnostics = await get_network_diagnostics()
        result = await diagnostics.bandwidth_test(request.duration_seconds)

        return NetworkDiagnosticsResponse(
            success=True,
            message="Bandwidth test completed",
            data={
                "bandwidth_result": {
                    "download_mbps": result.download_mbps,
                    "upload_mbps": result.upload_mbps,
                    "latency_ms": result.latency_ms,
                    "jitter_ms": result.jitter_ms,
                    "packet_loss_percent": result.packet_loss_percent,
                    "test_duration_seconds": result.test_duration_seconds,
                    "success": result.success,
                    "error_message": result.error_message,
                }
            },
        )

    except Exception as e:
        logger.error(f"Error in bandwidth test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/interfaces", response_model=NetworkDiagnosticsResponse)
async def get_network_interfaces():
    """Get network interface information"""
    try:
        diagnostics = await get_network_diagnostics()
        interfaces = await diagnostics.get_network_interfaces()

        interface_data = []
        for interface in interfaces:
            interface_data.append(
                {
                    "name": interface.name,
                    "type": interface.type,
                    "is_up": interface.is_up,
                    "ip_addresses": interface.ip_addresses,
                    "mac_address": interface.mac_address,
                    "mtu": interface.mtu,
                    "speed_mbps": interface.speed_mbps,
                    "duplex": interface.duplex,
                    "statistics": interface.statistics,
                }
            )

        return NetworkDiagnosticsResponse(
            success=True,
            message="Network interfaces retrieved",
            data={"interfaces": interface_data},
        )

    except Exception as e:
        logger.error(f"Error getting network interfaces: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/dns-test", response_model=NetworkDiagnosticsResponse)
async def dns_resolution_test(
    domain: str = Query(..., description="Domain to resolve")
):
    """Test DNS resolution"""
    try:
        diagnostics = await get_network_diagnostics()
        result = await diagnostics.dns_resolution_test(domain)

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"DNS resolution test completed for {domain}",
            data={"dns_result": result},
        )

    except Exception as e:
        logger.error(f"Error in DNS test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/traceroute", response_model=NetworkDiagnosticsResponse)
async def traceroute_test(
    host: str = Query(..., description="Host to trace route to"),
    max_hops: int = Query(15, description="Maximum number of hops"),
):
    """Perform traceroute test"""
    try:
        diagnostics = await get_network_diagnostics()
        result = await diagnostics.traceroute_test(host, max_hops)

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"Traceroute test completed for {host}",
            data={"traceroute_result": result},
        )

    except Exception as e:
        logger.error(f"Error in traceroute test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/comprehensive-test", response_model=NetworkDiagnosticsResponse)
async def start_comprehensive_test(
    request: ComprehensiveTestRequest, background_tasks: BackgroundTasks
):
    """Start a comprehensive network diagnostic test"""
    try:
        test_id = f"test_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

        # Start test in background
        background_tasks.add_task(
            run_comprehensive_test_background, test_id, request.target_host
        )

        return NetworkDiagnosticsResponse(
            success=True,
            message="Comprehensive test started",
            data={
                "test_id": test_id,
                "status": "running",
                "estimated_duration_seconds": 60,
            },
        )

    except Exception as e:
        logger.error(f"Error starting comprehensive test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def run_comprehensive_test_background(test_id: str, target_host: str):
    """Run comprehensive test in background"""
    try:
        background_test_results[test_id] = {
            "status": "running",
            "started_at": datetime.now().isoformat(),
            "progress": 0,
        }

        diagnostics = await get_network_diagnostics()

        # Update progress
        background_test_results[test_id]["progress"] = 25

        result = await diagnostics.run_comprehensive_test(target_host)

        background_test_results[test_id] = {
            "status": "completed",
            "started_at": background_test_results[test_id]["started_at"],
            "completed_at": datetime.now().isoformat(),
            "progress": 100,
            "result": result,
        }

    except Exception as e:
        background_test_results[test_id] = {
            "status": "failed",
            "started_at": background_test_results.get(test_id, {}).get("started_at"),
            "completed_at": datetime.now().isoformat(),
            "progress": 0,
            "error": str(e),
        }


@router.get("/comprehensive-test/{test_id}", response_model=NetworkDiagnosticsResponse)
async def get_comprehensive_test_result(test_id: str):
    """Get comprehensive test result"""
    try:
        if test_id not in background_test_results:
            raise HTTPException(status_code=404, detail="Test not found")

        test_data = background_test_results[test_id]

        return NetworkDiagnosticsResponse(
            success=True,
            message=f"Test status: {test_data['status']}",
            data={"test_data": test_data},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting test result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/streaming-specific-test", response_model=NetworkDiagnosticsResponse)
async def streaming_specific_test():
    """Run tests specific to streaming requirements"""
    try:
        diagnostics = await get_network_diagnostics()

        # Test streaming-related ports and services
        rtmp_test = await diagnostics.test_port_connectivity("localhost", 1935, "tcp")
        srt_test = await diagnostics.test_port_connectivity("localhost", 9998, "tcp")

        # Test latency to common streaming servers
        ping_results = []
        streaming_servers = ["youtube.com", "twitch.tv", "facebook.com"]

        for server in streaming_servers:
            ping_result = await diagnostics.ping_test(server, count=5)
            ping_results.append(
                {
                    "server": server,
                    "latency_ms": ping_result.avg_latency_ms,
                    "packet_loss": ping_result.packet_loss_percent,
                    "success": ping_result.success,
                }
            )

        # Test bandwidth
        bandwidth_result = await diagnostics.bandwidth_test(duration_seconds=5)

        # Generate streaming recommendations
        recommendations = []
        issues = []

        if not rtmp_test.is_open:
            issues.append("RTMP server (port 1935) not accessible")
            recommendations.append("Start MeetingMind RTMP server")

        if not srt_test.is_open:
            issues.append("SRT server (port 9998) not accessible")
            recommendations.append("Start MeetingMind SRT server")

        avg_latency = sum(p["latency_ms"] for p in ping_results if p["success"]) / len(
            [p for p in ping_results if p["success"]]
        )

        if avg_latency > 100:
            issues.append(f"High latency to streaming platforms: {avg_latency:.1f}ms")
            recommendations.append("Consider using wired connection")

        if bandwidth_result.download_mbps < 10:
            issues.append(
                f"Low upload bandwidth: {bandwidth_result.upload_mbps:.1f} Mbps"
            )
            recommendations.append("Upgrade internet plan for quality streaming")

        quality_score = 100
        if avg_latency > 50:
            quality_score -= 20
        if bandwidth_result.download_mbps < 25:
            quality_score -= 30
        if len(issues) > 0:
            quality_score -= 20

        return NetworkDiagnosticsResponse(
            success=True,
            message="Streaming-specific tests completed",
            data={
                "streaming_servers": ping_results,
                "rtmp_server": {
                    "accessible": rtmp_test.is_open,
                    "response_time_ms": rtmp_test.response_time_ms,
                },
                "srt_server": {
                    "accessible": srt_test.is_open,
                    "response_time_ms": srt_test.response_time_ms,
                },
                "bandwidth": {
                    "download_mbps": bandwidth_result.download_mbps,
                    "upload_mbps": bandwidth_result.upload_mbps,
                    "suitable_for_streaming": bandwidth_result.upload_mbps >= 5,
                },
                "quality_assessment": {
                    "score": max(0, quality_score),
                    "avg_latency_ms": avg_latency,
                    "issues": issues,
                    "recommendations": recommendations,
                },
            },
        )

    except Exception as e:
        logger.error(f"Error in streaming-specific test: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system-info", response_model=NetworkDiagnosticsResponse)
async def get_system_network_info():
    """Get system network information"""
    try:
        diagnostics = await get_network_diagnostics()
        system_info = diagnostics._get_system_info()

        return NetworkDiagnosticsResponse(
            success=True,
            message="System network information retrieved",
            data={"system_info": system_info},
        )

    except Exception as e:
        logger.error(f"Error getting system info: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/test-results/{test_id}", response_model=NetworkDiagnosticsResponse)
async def delete_test_result(test_id: str):
    """Delete a test result"""
    try:
        if test_id in background_test_results:
            del background_test_results[test_id]
            return NetworkDiagnosticsResponse(
                success=True, message=f"Test result {test_id} deleted"
            )
        else:
            raise HTTPException(status_code=404, detail="Test not found")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting test result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/test-history", response_model=NetworkDiagnosticsResponse)
async def get_test_history():
    """Get history of background tests"""
    try:
        return NetworkDiagnosticsResponse(
            success=True,
            message="Test history retrieved",
            data={"test_history": background_test_results},
        )

    except Exception as e:
        logger.error(f"Error getting test history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
