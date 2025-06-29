import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Paper,
  List,
  ListItem,
  ListItemText,
  Alert,
  Tabs,
  Tab,
  Switch,
  FormControlLabel,
  LinearProgress,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Avatar,
  AvatarGroup
} from '@mui/material';
import {
  Analytics as AnalyticsIcon,
  TrendingUp as TrendingUpIcon,
  Group as GroupIcon,
  Timer as TimerIcon,
  Psychology as InsightIcon,
  Refresh as RefreshIcon,
  FilterList as FilterIcon,
  Report as ReportIcon,
  Science as ExperimentIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  SaveAlt as ExportIcon
} from '@mui/icons-material';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ScatterChart,
  Scatter
} from 'recharts';

import AnalyticsService, {
  MeetingAnalytics,
  SpeechSegment
} from '../services/analyticsService';

// Types
interface AnalyticsPeriod {
  id: string;
  name: string;
  value: number; // days
}

// interface DashboardFilter {
//   dateRange: [Date, Date];
//   participants: string[];
//   meetingTypes: string[];
//   minDuration: number;
//   maxDuration: number;
// }

interface CustomMetric {
  id: string;
  name: string;
  description: string;
  formula: string;
  dataSource: string[];
  aggregation: string;
  filters: string[];
  visualization: string;
  thresholds: {
    excellent: number;
    good: number;
    average: number;
    poor: number;
  };
}

interface MetricVisualization {
  id: string;
  type: 'line' | 'bar' | 'pie' | 'radar' | 'scatter' | 'area';
  title: string;
  dataKey: string;
  color: string;
  enabled: boolean;
}

const COLORS = ['#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1', '#d084d0'];
const PERIODS: AnalyticsPeriod[] = [
  { id: 'today', name: 'Today', value: 1 },
  { id: 'week', name: 'This Week', value: 7 },
  { id: 'month', name: 'This Month', value: 30 },
  { id: 'quarter', name: 'This Quarter', value: 90 },
  { id: 'year', name: 'This Year', value: 365 }
];

const AnalyticsDashboard: React.FC = () => {
  // Services
  const [analyticsService] = useState(() => new AnalyticsService());

  // State
  const [activeTab, setActiveTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState<AnalyticsPeriod>(PERIODS[2]);

  // Data
  const [currentAnalytics, setCurrentAnalytics] = useState<MeetingAnalytics | null>(null);
  const [aggregatedMetrics, setAggregatedMetrics] = useState<Record<string, unknown> | null>(null);

  // UI State
  const [showFilters, setShowFilters] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);

  // Custom metrics
  const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([]);

  // Visualization settings
  const [visualizations, setVisualizations] = useState<MetricVisualization[]>([
    { id: 'participation', type: 'bar', title: 'Participation Distribution', dataKey: 'talkTimePercentage', color: COLORS[0], enabled: true },
    { id: 'sentiment', type: 'line', title: 'Sentiment Over Time', dataKey: 'sentiment', color: COLORS[1], enabled: true },
    { id: 'efficiency', type: 'radar', title: 'Meeting Efficiency', dataKey: 'efficiency', color: COLORS[2], enabled: true },
    { id: 'topics', type: 'pie', title: 'Topic Distribution', dataKey: 'duration', color: COLORS[3], enabled: true }
  ]);

  const generateMockAnalytics = useCallback(async (): Promise<MeetingAnalytics[]> => {
    // Generate mock speech segments
    const mockSegments: SpeechSegment[] = [
      {
        speakerId: 'speaker1',
        startTime: 0,
        endTime: 30000,
        text: 'Welcome everyone to our quarterly review meeting.',
        confidence: 0.95,
        sentiment: 0.2,
        topics: ['meeting', 'review'],
        isQuestion: false,
        isInterruption: false
      },
      {
        speakerId: 'speaker2',
        startTime: 31000,
        endTime: 65000,
        text: 'Thank you. I have some great results to share from Q3.',
        confidence: 0.92,
        sentiment: 0.7,
        topics: ['results', 'q3'],
        isQuestion: false,
        isInterruption: false
      },
      {
        speakerId: 'speaker3',
        startTime: 66000,
        endTime: 85000,
        text: 'What were the main challenges we faced?',
        confidence: 0.88,
        sentiment: -0.1,
        topics: ['challenges'],
        isQuestion: true,
        isInterruption: false
      }
    ];

    const mockMetadata = {
      id: 'meeting_1',
      startTime: Date.now() - 3600000,
      endTime: Date.now(),
      plannedDuration: 3600000,
      participants: {
        'speaker1': { name: 'Alice Johnson' },
        'speaker2': { name: 'Bob Smith' },
        'speaker3': { name: 'Carol Davis' }
      },
      agenda: ['Quarterly Review', 'Performance Metrics', 'Next Steps'],
      totalParticipants: 3
    };

    const analytics = await analyticsService.analyzeMeeting('meeting_1', mockSegments, mockMetadata);
    return [analytics];
  }, [analyticsService]);

  const aggregateMetrics = (analytics: MeetingAnalytics[]) => {
    const totalMeetings = analytics.length;
    const avgEfficiency = analytics.reduce((sum, a) => sum + a.efficiency.overallEfficiency, 0) / totalMeetings;
    const totalParticipants = analytics.reduce((sum, a) => sum + a.participants.length, 0);
    const avgParticipation = totalParticipants / totalMeetings;

    return {
      totalMeetings,
      avgEfficiency,
      avgParticipation,
      totalDuration: analytics.reduce((sum, a) => sum + a.efficiency.duration, 0),
      topTopics: aggregateTopics(analytics),
      collaborationTrends: aggregateCollaboration(analytics)
    };
  };

  const aggregateTopics = (analytics: MeetingAnalytics[]) => {
    const topicMap = new Map<string, number>();
    
    analytics.forEach(meeting => {
      meeting.topics.forEach(topic => {
        topicMap.set(topic.topic, (topicMap.get(topic.topic) || 0) + topic.duration);
      });
    });

    return Array.from(topicMap.entries())
      .map(([topic, duration]) => ({ topic, duration }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);
  };

  const aggregateCollaboration = (analytics: MeetingAnalytics[]) => {
    const patternMap = new Map<string, number>();
    
    analytics.forEach(meeting => {
      meeting.collaborationPatterns.forEach(pattern => {
        patternMap.set(pattern.type, (patternMap.get(pattern.type) || 0) + 1);
      });
    });

    return Array.from(patternMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  };

  const loadAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      // Mock data - in real implementation, this would fetch from API
      const mockMeetings = await generateMockAnalytics();
      setMeetingAnalytics(mockMeetings);

      if (mockMeetings.length > 0) {
        setCurrentAnalytics(mockMeetings[0]);
        const aggregated = aggregateMetrics(mockMeetings);
        setAggregatedMetrics(aggregated);
      }

    } catch (err) {
      setError('Failed to load analytics data');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [generateMockAnalytics, aggregateMetrics]);

  // Initialize and load data
  useEffect(() => {
    loadAnalyticsData();
  }, [selectedPeriod, loadAnalyticsData]);

  // Render participation metrics
  const renderParticipationMetrics = () => {
    if (!currentAnalytics) return null;

    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6">Participation Analysis</Typography>
            <Chip label={`${currentAnalytics.participants.length} participants`} />
          </Box>

          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={currentAnalytics.participants}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="speakerName" />
              <YAxis />
              <RechartsTooltip />
              <Legend />
              <Bar dataKey="talkTimePercentage" fill={COLORS[0]} name="Talk Time %" />
              <Bar dataKey="engagementScore" fill={COLORS[1]} name="Engagement Score" />
            </BarChart>
          </ResponsiveContainer>

          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>Detailed Metrics</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Participant</TableCell>
                    <TableCell align="right">Talk Time</TableCell>
                    <TableCell align="right">Turns</TableCell>
                    <TableCell align="right">Questions</TableCell>
                    <TableCell align="right">Interruptions</TableCell>
                    <TableCell align="right">Engagement</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentAnalytics.participants.map((participant) => (
                    <TableRow key={participant.speakerId}>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Avatar sx={{ width: 24, height: 24 }}>
                            {participant.speakerName.charAt(0)}
                          </Avatar>
                          {participant.speakerName}
                        </Box>
                      </TableCell>
                      <TableCell align="right">
                        {participant.talkTimePercentage.toFixed(1)}%
                      </TableCell>
                      <TableCell align="right">{participant.numberOfTurns}</TableCell>
                      <TableCell align="right">{participant.questionsAsked}</TableCell>
                      <TableCell align="right">{participant.interruptions}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={Math.round(participant.engagementScore)}
                          size="small"
                          color={participant.engagementScore > 70 ? 'success' : 
                                 participant.engagementScore > 40 ? 'warning' : 'error'}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Render sentiment analysis
  const renderSentimentAnalysis = () => {
    if (!currentAnalytics) return null;

    // Prepare sentiment timeline data
    const sentimentData = currentAnalytics.sentimentTimeline.map(s => ({
      time: new Date(s.timestamp).toLocaleTimeString(),
      sentiment: s.sentiment === 'positive' ? s.intensity : 
                 s.sentiment === 'negative' ? -s.intensity : 0,
      speaker: s.speakerId,
      confidence: s.confidence
    }));

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Sentiment Over Time</Typography>
          
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={sentimentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis domain={[-1, 1]} />
              <RechartsTooltip />
              <Area 
                type="monotone" 
                dataKey="sentiment" 
                stroke={COLORS[1]} 
                fill={COLORS[1]}
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>

          <Box mt={2}>
            <Grid container spacing={2}>
              {['positive', 'neutral', 'negative'].map((sentiment) => {
                const count = currentAnalytics.sentimentTimeline.filter(s => s.sentiment === sentiment).length;
                const percentage = (count / currentAnalytics.sentimentTimeline.length) * 100;
                
                return (
                  <Grid item xs={4} key={sentiment}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                      <Typography variant="h4" 
                        color={sentiment === 'positive' ? 'success.main' : 
                               sentiment === 'negative' ? 'error.main' : 'text.secondary'}>
                        {percentage.toFixed(1)}%
                      </Typography>
                      <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                        {sentiment}
                      </Typography>
                    </Paper>
                  </Grid>
                );
              })}
            </Grid>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Render efficiency metrics
  const renderEfficiencyMetrics = () => {
    if (!currentAnalytics) return null;

    const efficiency = currentAnalytics.efficiency;
    const radarData = [
      { metric: 'Agenda Adherence', value: efficiency.agendaAdherence * 100 },
      { metric: 'Participation Balance', value: efficiency.participationBalance * 100 },
      { metric: 'Focus Score', value: efficiency.focusScore * 100 },
      { metric: 'Productivity', value: efficiency.productivityScore * 100 },
      { metric: 'Overall Efficiency', value: efficiency.overallEfficiency }
    ];

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Meeting Efficiency</Typography>
          
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} />
                  <Radar 
                    name="Efficiency" 
                    dataKey="value" 
                    stroke={COLORS[2]} 
                    fill={COLORS[2]} 
                    fillOpacity={0.3}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <List>
                <ListItem>
                  <ListItemText 
                    primary="Duration vs Planned"
                    secondary={`${Math.round(efficiency.duration / 60000)} / ${Math.round(efficiency.plannedDuration / 60000)} minutes`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Decisions Made"
                    secondary={efficiency.decisionsMade}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Action Items"
                    secondary={efficiency.actionItemsGenerated}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Time Wasted"
                    secondary={`${Math.round(efficiency.timeWasted / 60000)} minutes`}
                  />
                </ListItem>
              </List>
            </Grid>
          </Grid>
        </CardContent>
      </Card>
    );
  };

  // Render topic distribution
  const renderTopicDistribution = () => {
    if (!currentAnalytics) return null;

    const topicData = currentAnalytics.topics.map((topic, index) => ({
      ...topic,
      fill: COLORS[index % COLORS.length]
    }));

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Topic Distribution</Typography>
          
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={topicData}
                cx="50%"
                cy="50%"
                outerRadius={80}
                dataKey="percentage"
                nameKey="topic"
                label={({ topic, percentage }: { topic: string, percentage: number }) => `${topic}: ${percentage.toFixed(1)}%`}
              >
                {topicData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <RechartsTooltip />
            </PieChart>
          </ResponsiveContainer>

          <Box mt={2}>
            <Typography variant="subtitle2" gutterBottom>Topic Details</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Topic</TableCell>
                    <TableCell align="right">Duration</TableCell>
                    <TableCell align="right">Speakers</TableCell>
                    <TableCell align="right">Relevance</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {currentAnalytics.topics.map((topic) => (
                    <TableRow key={topic.topic}>
                      <TableCell>{topic.topic}</TableCell>
                      <TableCell align="right">
                        {Math.round(topic.duration / 60000)}m
                      </TableCell>
                      <TableCell align="right">
                        <AvatarGroup max={3} sx={{ justifyContent: 'flex-end' }}>
                          {topic.speakers.map((speaker, idx) => (
                            <Avatar key={idx} sx={{ width: 20, height: 20, fontSize: 10 }}>
                              {speaker.charAt(speaker.length - 1)}
                            </Avatar>
                          ))}
                        </AvatarGroup>
                      </TableCell>
                      <TableCell align="right">
                        <LinearProgress 
                          variant="determinate" 
                          value={topic.relevanceScore * 100}
                          sx={{ width: 60 }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Render collaboration patterns
  const renderCollaborationPatterns = () => {
    if (!currentAnalytics) return null;

    const patternData = currentAnalytics.collaborationPatterns.map(pattern => ({
      type: pattern.type.replace('_', ' '),
      duration: (pattern.endTime - pattern.startTime) / 60000,
      effectiveness: pattern.effectiveness * 100,
      participants: pattern.participants.length
    }));

    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>Collaboration Patterns</Typography>
          
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart data={patternData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="duration" name="Duration (min)" />
              <YAxis dataKey="effectiveness" name="Effectiveness %" />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter dataKey="participants" fill={COLORS[4]} />
            </ScatterChart>
          </ResponsiveContainer>

          <Box mt={2}>
            <Grid container spacing={2}>
              {currentAnalytics.collaborationPatterns.map((pattern, index) => (
                <Grid item xs={12} sm={6} md={4} key={index}>
                  <Paper sx={{ p: 2 }}>
                    <Typography variant="subtitle2" sx={{ textTransform: 'capitalize' }}>
                      {pattern.type.replace('_', ' ')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {Math.round((pattern.endTime - pattern.startTime) / 60000)} minutes
                    </Typography>
                    <Box display="flex" alignItems="center" gap={1} mt={1}>
                      <Typography variant="caption">Effectiveness:</Typography>
                      <LinearProgress 
                        variant="determinate" 
                        value={pattern.effectiveness * 100}
                        sx={{ flex: 1 }}
                      />
                      <Typography variant="caption">
                        {Math.round(pattern.effectiveness * 100)}%
                      </Typography>
                    </Box>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Box>
        </CardContent>
      </Card>
    );
  };

  // Render analytics playground
  const renderAnalyticsPlayground = () => {
    return (
      <Dialog open={showPlayground} onClose={() => setShowPlayground(false)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Analytics Playground</Typography>
            <Button
              startIcon={<AddIcon />}
              onClick={() => setEditingMetric({
                id: '',
                name: '',
                description: '',
                formula: '',
                dataSource: [],
                aggregation: 'average',
                filters: [],
                visualization: 'line',
                thresholds: { excellent: 90, good: 70, average: 50, poor: 30 }
              })}
            >
              New Metric
            </Button>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Custom Metrics</Typography>
              <List>
                {customMetrics.map((metric) => (
                  <ListItem key={metric.id}>
                    <ListItemText 
                      primary={metric.name}
                      secondary={metric.description}
                    />
                    <IconButton onClick={() => setEditingMetric(metric)}>
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => setCustomMetrics(prev => prev.filter(m => m.id !== metric.id))}>
                      <DeleteIcon />
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Visualization Settings</Typography>
              {visualizations.map((viz) => (
                <FormControlLabel
                  key={viz.id}
                  control={
                    <Switch
                      checked={viz.enabled}
                      onChange={(e) => setVisualizations(prev => 
                        prev.map(v => v.id === viz.id ? { ...v, enabled: e.target.checked } : v)
                      )}
                    />
                  }
                  label={viz.title}
                />
              ))}
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowPlayground(false)}>Close</Button>
          <Button startIcon={<ExportIcon />}>Export Settings</Button>
        </DialogActions>
      </Dialog>
    );
  };

  // Render overview cards
  const renderOverviewCards = () => {
    if (!aggregatedMetrics) return null;

    return (
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Meetings
                  </Typography>
                  <Typography variant="h4">
                    {aggregatedMetrics.totalMeetings}
                  </Typography>
                </Box>
                <AnalyticsIcon color="primary" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Avg Efficiency
                  </Typography>
                  <Typography variant="h4">
                    {Math.round(aggregatedMetrics.avgEfficiency)}%
                  </Typography>
                </Box>
                <TrendingUpIcon color="success" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Avg Participants
                  </Typography>
                  <Typography variant="h4">
                    {Math.round(aggregatedMetrics.avgParticipation)}
                  </Typography>
                </Box>
                <GroupIcon color="info" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography color="textSecondary" gutterBottom>
                    Total Duration
                  </Typography>
                  <Typography variant="h4">
                    {Math.round(aggregatedMetrics.totalDuration / 3600000)}h
                  </Typography>
                </Box>
                <TimerIcon color="warning" sx={{ fontSize: 40 }} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    );
  };

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" mb={3}>
        <AnalyticsIcon sx={{ mr: 2, fontSize: 32 }} />
        <Box flex={1}>
          <Typography variant="h4">Analytics Dashboard</Typography>
          <Typography variant="body1" color="text.secondary">
            Comprehensive meeting analytics with participation, sentiment, and collaboration insights
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Period</InputLabel>
            <Select
              value={selectedPeriod.id}
              onChange={(e) => {
                const period = PERIODS.find(p => p.id === e.target.value);
                if (period) setSelectedPeriod(period);
              }}
              label="Period"
            >
              {PERIODS.map((period) => (
                <MenuItem key={period.id} value={period.id}>
                  {period.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton onClick={() => setShowFilters(!showFilters)}>
            <FilterIcon />
          </IconButton>
          <IconButton onClick={() => setShowPlayground(true)}>
            <ExperimentIcon />
          </IconButton>
          <IconButton onClick={loadAnalyticsData}>
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {renderOverviewCards()}

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Participation" icon={<GroupIcon />} iconPosition="start" />
        <Tab label="Sentiment" icon={<InsightIcon />} iconPosition="start" />
        <Tab label="Efficiency" icon={<TrendingUpIcon />} iconPosition="start" />
        <Tab label="Topics" icon={<ReportIcon />} iconPosition="start" />
        <Tab label="Collaboration" icon={<ViewIcon />} iconPosition="start" />
      </Tabs>

      {activeTab === 0 && renderParticipationMetrics()}
      {activeTab === 1 && renderSentimentAnalysis()}
      {activeTab === 2 && renderEfficiencyMetrics()}
      {activeTab === 3 && renderTopicDistribution()}
      {activeTab === 4 && renderCollaborationPatterns()}

      {renderAnalyticsPlayground()}
    </Box>
  );
};

export default AnalyticsDashboard;