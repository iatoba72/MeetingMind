class StreamingDashboard {
    constructor() {
        this.socket = null;
        this.charts = {};
        this.streams = new Map();
        this.streamKeys = new Map();
        this.authToken = localStorage.getItem('authToken');
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        this.setupCharts();
        await this.connectWebSocket();
        await this.loadInitialData();
        this.startPeriodicUpdates();
    }

    setupEventListeners() {
        // Refresh streams
        document.getElementById('refresh-streams').addEventListener('click', () => {
            this.loadStreams();
        });

        // Generate stream key form
        document.getElementById('generate-key-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.generateStreamKey();
        });

        // Update server time
        this.updateServerTime();
        setInterval(() => this.updateServerTime(), 1000);
    }

    setupCharts() {
        // Bandwidth Chart
        const bandwidthCtx = document.getElementById('bandwidth-chart').getContext('2d');
        this.charts.bandwidth = new Chart(bandwidthCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Bandwidth (Mbps)',
                    data: [],
                    borderColor: 'rgb(59, 130, 246)',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Mbps'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

        // Quality Chart
        const qualityCtx = document.getElementById('quality-chart').getContext('2d');
        this.charts.quality = new Chart(qualityCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Quality Score',
                    data: [],
                    borderColor: 'rgb(34, 197, 94)',
                    backgroundColor: 'rgba(34, 197, 94, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Quality Score'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });
    }

    async connectWebSocket() {
        try {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Connected to streaming server');
                this.updateConnectionStatus(true);
            });

            this.socket.on('disconnect', () => {
                console.log('Disconnected from streaming server');
                this.updateConnectionStatus(false);
            });

            this.socket.on('stream-live', (data) => {
                this.handleStreamLive(data);
            });

            this.socket.on('stream-ended', (data) => {
                this.handleStreamEnded(data);
            });

            this.socket.on('stream-status', (data) => {
                this.handleStreamStatus(data);
            });

            this.socket.on('health-alert', (alert) => {
                this.handleHealthAlert(alert);
            });

            this.socket.on('metrics-updated', (data) => {
                this.handleMetricsUpdate(data);
            });

        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.updateConnectionStatus(false);
        }
    }

    updateConnectionStatus(connected) {
        const statusDot = document.getElementById('connection-status');
        const statusText = document.getElementById('connection-text');
        
        if (connected) {
            statusDot.className = 'w-3 h-3 rounded-full bg-green-500 mr-2';
            statusText.textContent = 'Connected';
        } else {
            statusDot.className = 'w-3 h-3 rounded-full bg-red-500 mr-2';
            statusText.textContent = 'Disconnected';
        }
    }

    async loadInitialData() {
        try {
            await Promise.all([
                this.loadStreams(),
                this.loadMetrics(),
                this.loadStreamKeys(),
                this.loadHealthStatus()
            ]);
        } catch (error) {
            console.error('Error loading initial data:', error);
        }
    }

    async loadStreams() {
        try {
            const response = await this.fetch('/api/streams');
            const streams = await response.json();
            
            this.streams.clear();
            streams.forEach(stream => {
                this.streams.set(stream.id, stream);
            });
            
            this.updateStreamsDisplay();
        } catch (error) {
            console.error('Error loading streams:', error);
        }
    }

    async loadMetrics() {
        try {
            const response = await this.fetch('/api/metrics');
            const metrics = await response.json();
            
            this.updateMetricsDisplay(metrics);
            this.updateCharts(metrics);
        } catch (error) {
            console.error('Error loading metrics:', error);
        }
    }

    async loadStreamKeys() {
        try {
            const response = await this.fetch('/api/auth/stream-keys');
            if (response.ok) {
                const keys = await response.json();
                this.updateStreamKeysDisplay(keys);
            }
        } catch (error) {
            console.error('Error loading stream keys:', error);
        }
    }

    async loadHealthStatus() {
        try {
            const response = await this.fetch('/api/health-monitor');
            const health = await response.json();
            
            this.updateHealthDisplay(health);
        } catch (error) {
            console.error('Error loading health status:', error);
        }
    }

    updateStreamsDisplay() {
        const container = document.getElementById('streams-list');
        const activeStreams = Array.from(this.streams.values())
            .filter(stream => ['connecting', 'live'].includes(stream.status));
        
        if (activeStreams.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">No active streams</p>';
            return;
        }

        container.innerHTML = activeStreams.map(stream => `
            <div class="border border-gray-200 rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <h4 class="font-medium">${stream.title || stream.id}</h4>
                        <p class="text-sm text-gray-600">${stream.type.toUpperCase()} • ${stream.id}</p>
                    </div>
                    <div class="flex items-center">
                        <div class="w-2 h-2 rounded-full status-dot-${stream.health?.status || 'healthy'} mr-2"></div>
                        <span class="text-sm font-medium status-${stream.health?.status || 'healthy'}">${stream.status}</span>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div>
                        <span class="text-gray-600">Bitrate:</span>
                        <span class="font-medium">${this.formatBitrate(stream.quality?.bitrate || 0)}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">FPS:</span>
                        <span class="font-medium">${stream.quality?.fps || 0}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Viewers:</span>
                        <span class="font-medium">${stream.viewers || 0}</span>
                    </div>
                    <div>
                        <span class="text-gray-600">Uptime:</span>
                        <span class="font-medium">${this.formatDuration(new Date() - new Date(stream.startTime))}</span>
                    </div>
                </div>
                ${stream.health?.issues?.length > 0 ? `
                    <div class="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p class="text-xs text-yellow-800">
                            <i class="fas fa-exclamation-triangle mr-1"></i>
                            ${stream.health.issues[0].message}
                        </p>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    updateMetricsDisplay(metrics) {
        // Update metric cards
        document.getElementById('active-streams').textContent = metrics.system?.activeStreams || 0;
        document.getElementById('total-bandwidth').textContent = this.formatBitrate(metrics.system?.totalBandwidth || 0);
        document.getElementById('avg-quality').textContent = `${Math.round(metrics.performance?.quality?.averageQualityScore || 100)}%`;
        document.getElementById('server-uptime').textContent = this.formatDuration((metrics.system?.uptime || 0) * 1000);
    }

    updateCharts(metrics) {
        // Update bandwidth chart
        if (metrics.timeSeries?.bandwidth) {
            const bandwidthData = metrics.timeSeries.bandwidth;
            const labels = this.generateTimeLabels(20); // Last 20 data points
            const data = Array(20).fill(0).map((_, i) => {
                const time = new Date(Date.now() - (19 - i) * 30000); // 30 second intervals
                return bandwidthData.current / 1000000 || 0; // Convert to Mbps
            });

            this.charts.bandwidth.data.labels = labels;
            this.charts.bandwidth.data.datasets[0].data = data;
            this.charts.bandwidth.update('none');
        }

        // Update quality chart
        if (metrics.timeSeries?.quality) {
            const qualityData = metrics.timeSeries.quality;
            const labels = this.generateTimeLabels(20);
            const data = Array(20).fill(0).map(() => qualityData.current || 100);

            this.charts.quality.data.labels = labels;
            this.charts.quality.data.datasets[0].data = data;
            this.charts.quality.update('none');
        }
    }

    updateHealthDisplay(health) {
        const container = document.getElementById('health-alerts');
        const alerts = health.alerts || [];
        
        if (alerts.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center">All systems healthy</p>';
            return;
        }

        container.innerHTML = alerts.slice(0, 5).map(alert => `
            <div class="border-l-4 ${this.getAlertBorderColor(alert.issue.severity)} bg-gray-50 p-3">
                <div class="flex justify-between items-start">
                    <div>
                        <p class="text-sm font-medium text-gray-900">
                            <i class="fas ${this.getAlertIcon(alert.issue.severity)} mr-2"></i>
                            ${alert.issue.message}
                        </p>
                        <p class="text-xs text-gray-600 mt-1">
                            Stream: ${alert.streamId} • ${this.formatTimeAgo(new Date(alert.created))}
                        </p>
                    </div>
                    <button class="text-gray-400 hover:text-gray-600" onclick="dashboard.acknowledgeAlert('${alert.id}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
        `).join('');
    }

    updateStreamKeysDisplay(keys) {
        const container = document.getElementById('stream-keys-list');
        
        if (keys.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center text-sm">No active stream keys</p>';
            return;
        }

        container.innerHTML = keys.slice(0, 10).map(key => `
            <div class="border border-gray-200 rounded p-3">
                <div class="flex justify-between items-center">
                    <div class="flex-1 min-w-0">
                        <p class="text-sm font-medium text-gray-900 truncate">
                            Meeting: ${key.meetingId || 'N/A'}
                        </p>
                        <p class="text-xs text-gray-600">
                            ${key.key.substring(0, 8)}...
                        </p>
                    </div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs ${key.status === 'active' ? 'text-green-600' : 'text-gray-600'}">
                            ${key.status}
                        </span>
                        <button class="text-red-600 hover:text-red-800" onclick="dashboard.revokeStreamKey('${key.id}')">
                            <i class="fas fa-trash text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async generateStreamKey() {
        try {
            const meetingId = document.getElementById('meeting-id').value;
            const userId = document.getElementById('user-id').value;
            const expiresIn = document.getElementById('expiry').value;

            const response = await this.fetch('/api/auth/stream-keys', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    meetingId,
                    userId,
                    expiresIn,
                    permissions: ['publish']
                })
            });

            if (response.ok) {
                const result = await response.json();
                alert(`Stream key generated successfully!\n\nKey: ${result.streamKey}\n\nUse this key in your streaming software.`);
                document.getElementById('generate-key-form').reset();
                this.loadStreamKeys();
            } else {
                const error = await response.json();
                alert(`Error generating stream key: ${error.error}`);
            }
        } catch (error) {
            console.error('Error generating stream key:', error);
            alert('Error generating stream key. Please try again.');
        }
    }

    async revokeStreamKey(keyId) {
        if (!confirm('Are you sure you want to revoke this stream key?')) {
            return;
        }

        try {
            const response = await this.fetch(`/api/auth/stream-keys/${keyId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                this.loadStreamKeys();
            } else {
                const error = await response.json();
                alert(`Error revoking stream key: ${error.error}`);
            }
        } catch (error) {
            console.error('Error revoking stream key:', error);
            alert('Error revoking stream key. Please try again.');
        }
    }

    async acknowledgeAlert(alertId) {
        try {
            // This would typically call an API endpoint to acknowledge the alert
            console.log('Acknowledging alert:', alertId);
            this.loadHealthStatus();
        } catch (error) {
            console.error('Error acknowledging alert:', error);
        }
    }

    handleStreamLive(data) {
        console.log('Stream went live:', data);
        this.loadStreams();
    }

    handleStreamEnded(data) {
        console.log('Stream ended:', data);
        this.loadStreams();
    }

    handleStreamStatus(data) {
        if (this.streams.has(data.id)) {
            this.streams.set(data.id, data);
            this.updateStreamsDisplay();
        }
    }

    handleHealthAlert(alert) {
        console.log('Health alert:', alert);
        this.loadHealthStatus();
        
        // Show notification
        this.showNotification(alert.issue.message, alert.issue.severity);
    }

    handleMetricsUpdate(data) {
        this.loadMetrics();
    }

    showNotification(message, severity = 'info') {
        // Simple notification system
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${this.getNotificationColor(severity)}`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${this.getAlertIcon(severity)} mr-2"></i>
                <span class="text-sm">${message}</span>
                <button class="ml-4 text-lg" onclick="this.parentElement.parentElement.remove()">×</button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    startPeriodicUpdates() {
        // Update data every 30 seconds
        setInterval(() => {
            this.loadStreams();
            this.loadMetrics();
        }, 30000);

        // Update health status every 10 seconds
        setInterval(() => {
            this.loadHealthStatus();
        }, 10000);
    }

    // Helper methods
    async fetch(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                ...(this.authToken && { 'Authorization': `Bearer ${this.authToken}` })
            }
        };

        return fetch(url, { ...defaultOptions, ...options });
    }

    formatBitrate(bps) {
        if (bps === 0) return '0 bps';
        if (bps < 1000) return `${bps} bps`;
        if (bps < 1000000) return `${Math.round(bps / 1000)} kbps`;
        return `${(bps / 1000000).toFixed(1)} Mbps`;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    formatTimeAgo(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        
        const diffDays = Math.floor(diffHours / 24);
        return `${diffDays}d ago`;
    }

    generateTimeLabels(count) {
        const labels = [];
        const now = new Date();
        
        for (let i = count - 1; i >= 0; i--) {
            const time = new Date(now.getTime() - i * 30000); // 30 second intervals
            labels.push(time.toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }));
        }
        
        return labels;
    }

    getAlertBorderColor(severity) {
        switch (severity) {
            case 'critical': return 'border-red-500';
            case 'warning': return 'border-yellow-500';
            default: return 'border-blue-500';
        }
    }

    getAlertIcon(severity) {
        switch (severity) {
            case 'critical': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    }

    getNotificationColor(severity) {
        switch (severity) {
            case 'critical': return 'bg-red-500 text-white';
            case 'warning': return 'bg-yellow-500 text-white';
            default: return 'bg-blue-500 text-white';
        }
    }

    updateServerTime() {
        document.getElementById('server-time').textContent = new Date().toLocaleString();
    }
}

// Initialize dashboard when page loads
const dashboard = new StreamingDashboard();