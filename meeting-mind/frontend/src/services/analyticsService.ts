// Analytics Service
// Comprehensive meeting analytics with participation, sentiment, and collaboration metrics

export interface ParticipationMetrics {
  speakerId: string;
  speakerName: string;
  totalTalkTime: number; // seconds
  talkTimePercentage: number;
  numberOfTurns: number;
  averageTurnLength: number;
  interruptions: number;
  interruptionsReceived: number;
  questionsAsked: number;
  questionsAnswered: number;
  silencePeriods: number;
  longestSilence: number;
  engagementScore: number;
}

export interface SentimentMetrics {
  timestamp: number;
  speakerId: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  intensity: number; // 0-1
  emotionalState: string;
  keywords: string[];
  context: string;
}

export interface EfficiencyMetrics {
  meetingId: string;
  duration: number;
  plannedDuration: number;
  agendaAdherence: number;
  decisionsMade: number;
  actionItemsGenerated: number;
  participationBalance: number;
  timeWasted: number;
  focusScore: number;
  productivityScore: number;
  overallEfficiency: number;
}

export interface TopicDistribution {
  topic: string;
  duration: number;
  percentage: number;
  speakers: string[];
  sentiment: number;
  keywords: string[];
  relevanceScore: number;
  transitionPoints: number[];
}

export interface CollaborationPattern {
  type: 'discussion' | 'presentation' | 'brainstorming' | 'decision_making' | 'conflict' | 'consensus';
  startTime: number;
  endTime: number;
  participants: string[];
  intensity: number;
  outcomes: string[];
  effectiveness: number;
}

export interface SpeechSegment {
  speakerId: string;
  startTime: number;
  endTime: number;
  text: string;
  confidence: number;
  sentiment?: number;
  topics?: string[];
  isQuestion?: boolean;
  isInterruption?: boolean;
}

export interface MeetingAnalytics {
  meetingId: string;
  startTime: number;
  endTime: number;
  participants: ParticipationMetrics[];
  sentimentTimeline: SentimentMetrics[];
  efficiency: EfficiencyMetrics;
  topics: TopicDistribution[];
  collaborationPatterns: CollaborationPattern[];
  keyMoments: KeyMoment[];
  recommendations: string[];
}

export interface KeyMoment {
  timestamp: number;
  type: 'decision' | 'conflict' | 'breakthrough' | 'consensus' | 'confusion' | 'engagement_peak';
  description: string;
  participants: string[];
  impact: number;
  confidence: number;
}

export interface CustomMetric {
  id: string;
  name: string;
  description: string;
  formula: string;
  dataSource: string[];
  aggregation: 'sum' | 'average' | 'max' | 'min' | 'count' | 'custom';
  filters: MetricFilter[];
  visualization: 'line' | 'bar' | 'pie' | 'scatter' | 'heatmap' | 'gauge';
  thresholds: {
    excellent: number;
    good: number;
    average: number;
    poor: number;
  };
}

export interface MetricFilter {
  field: string;
  operator: 'equals' | 'greater_than' | 'less_than' | 'contains' | 'not_equals';
  value: any;
}

export class AnalyticsService {
  private speechSegments: SpeechSegment[] = [];
  private meetingMetadata: any = {};
  private customMetrics: CustomMetric[] = [];

  // Main analysis method
  async analyzeMeeting(
    meetingId: string,
    speechSegments: SpeechSegment[],
    meetingMetadata: any
  ): Promise<MeetingAnalytics> {
    this.speechSegments = speechSegments;
    this.meetingMetadata = meetingMetadata;

    const [
      participants,
      sentimentTimeline,
      efficiency,
      topics,
      collaborationPatterns,
      keyMoments
    ] = await Promise.all([
      this.calculateParticipationMetrics(),
      this.analyzeSentimentOverTime(),
      this.calculateEfficiencyMetrics(),
      this.analyzeTopicDistribution(),
      this.identifyCollaborationPatterns(),
      this.identifyKeyMoments()
    ]);

    const recommendations = this.generateRecommendations({
      participants,
      efficiency,
      collaborationPatterns
    });

    return {
      meetingId,
      startTime: meetingMetadata.startTime,
      endTime: meetingMetadata.endTime,
      participants,
      sentimentTimeline,
      efficiency,
      topics,
      collaborationPatterns,
      keyMoments,
      recommendations
    };
  }

  // Participation Metrics
  async calculateParticipationMetrics(): Promise<ParticipationMetrics[]> {
    const speakerMap = new Map<string, ParticipationMetrics>();

    // Initialize speakers
    const uniqueSpeakers = [...new Set(this.speechSegments.map(s => s.speakerId))];
    uniqueSpeakers.forEach(speakerId => {
      speakerMap.set(speakerId, {
        speakerId,
        speakerName: this.getSpeakerName(speakerId),
        totalTalkTime: 0,
        talkTimePercentage: 0,
        numberOfTurns: 0,
        averageTurnLength: 0,
        interruptions: 0,
        interruptionsReceived: 0,
        questionsAsked: 0,
        questionsAnswered: 0,
        silencePeriods: 0,
        longestSilence: 0,
        engagementScore: 0
      });
    });

    // Calculate basic metrics
    let totalMeetingTime = 0;
    if (this.speechSegments.length > 0) {
      totalMeetingTime = Math.max(...this.speechSegments.map(s => s.endTime)) - 
                        Math.min(...this.speechSegments.map(s => s.startTime));
    }

    // Process each segment
    this.speechSegments.forEach((segment, index) => {
      const speaker = speakerMap.get(segment.speakerId)!;
      const duration = segment.endTime - segment.startTime;

      // Talk time
      speaker.totalTalkTime += duration;
      speaker.numberOfTurns++;

      // Questions
      if (segment.isQuestion) {
        speaker.questionsAsked++;
      }

      // Interruptions
      if (segment.isInterruption) {
        speaker.interruptions++;
        // Find who was interrupted
        const interruptedSegment = this.speechSegments
          .slice(0, index)
          .reverse()
          .find(s => s.endTime > segment.startTime && s.speakerId !== segment.speakerId);
        
        if (interruptedSegment) {
          const interruptedSpeaker = speakerMap.get(interruptedSegment.speakerId)!;
          interruptedSpeaker.interruptionsReceived++;
        }
      }

      // Detect responses to questions
      if (index > 0) {
        const previousSegment = this.speechSegments[index - 1];
        if (previousSegment.isQuestion && 
            segment.startTime - previousSegment.endTime < 3000 && // within 3 seconds
            segment.speakerId !== previousSegment.speakerId) {
          speaker.questionsAnswered++;
        }
      }
    });

    // Calculate derived metrics and silence periods
    const speakers = Array.from(speakerMap.values());
    speakers.forEach(speaker => {
      speaker.averageTurnLength = speaker.numberOfTurns > 0 ? 
        speaker.totalTalkTime / speaker.numberOfTurns : 0;
      
      speaker.talkTimePercentage = totalMeetingTime > 0 ? 
        (speaker.totalTalkTime / totalMeetingTime) * 100 : 0;

      // Calculate silence periods for this speaker
      const speakerSegments = this.speechSegments
        .filter(s => s.speakerId === speaker.speakerId)
        .sort((a, b) => a.startTime - b.startTime);

      let silences: number[] = [];
      for (let i = 1; i < speakerSegments.length; i++) {
        const silence = speakerSegments[i].startTime - speakerSegments[i-1].endTime;
        if (silence > 5000) { // 5 second threshold
          silences.push(silence);
        }
      }

      speaker.silencePeriods = silences.length;
      speaker.longestSilence = silences.length > 0 ? Math.max(...silences) : 0;

      // Engagement score (0-100)
      speaker.engagementScore = this.calculateEngagementScore(speaker);
    });

    return speakers;
  }

  // Sentiment Analysis Over Time
  async analyzeSentimentOverTime(): Promise<SentimentMetrics[]> {
    const sentimentData: SentimentMetrics[] = [];

    for (const segment of this.speechSegments) {
      const sentiment = await this.analyzeSentiment(segment.text);
      
      sentimentData.push({
        timestamp: segment.startTime,
        speakerId: segment.speakerId,
        sentiment: sentiment.label,
        confidence: sentiment.confidence,
        intensity: sentiment.intensity,
        emotionalState: sentiment.emotionalState,
        keywords: sentiment.keywords,
        context: segment.text.substring(0, 100)
      });
    }

    return sentimentData;
  }

  // Efficiency Metrics
  async calculateEfficiencyMetrics(): Promise<EfficiencyMetrics> {
    const duration = this.meetingMetadata.endTime - this.meetingMetadata.startTime;
    const plannedDuration = this.meetingMetadata.plannedDuration || duration;

    // Analyze agenda adherence
    const agendaItems = this.meetingMetadata.agenda || [];
    const discussedTopics = await this.extractTopics();
    const agendaAdherence = this.calculateAgendaAdherence(agendaItems, discussedTopics);

    // Count decisions and action items
    const decisions = this.countDecisions();
    const actionItems = this.countActionItems();

    // Calculate participation balance (lower is better)
    const participationMetrics = await this.calculateParticipationMetrics();
    const participationBalance = this.calculateParticipationBalance(participationMetrics);

    // Estimate time wasted (off-topic discussions, long silences)
    const timeWasted = this.estimateTimeWasted();

    // Focus score based on topic coherence
    const focusScore = this.calculateFocusScore();

    // Overall productivity
    const productivityScore = this.calculateProductivityScore(decisions, actionItems, duration);

    // Overall efficiency (weighted combination)
    const overallEfficiency = (
      agendaAdherence * 0.2 +
      participationBalance * 0.2 +
      focusScore * 0.2 +
      productivityScore * 0.2 +
      (1 - Math.min(timeWasted / duration, 1)) * 0.2
    ) * 100;

    return {
      meetingId: this.meetingMetadata.id,
      duration,
      plannedDuration,
      agendaAdherence,
      decisionsMade: decisions,
      actionItemsGenerated: actionItems,
      participationBalance,
      timeWasted,
      focusScore,
      productivityScore,
      overallEfficiency
    };
  }

  // Topic Distribution Analysis
  async analyzeTopicDistribution(): Promise<TopicDistribution[]> {
    const topics = await this.extractTopics();
    const topicMap = new Map<string, TopicDistribution>();

    // Initialize topics
    topics.forEach(topic => {
      topicMap.set(topic, {
        topic,
        duration: 0,
        percentage: 0,
        speakers: [],
        sentiment: 0,
        keywords: [],
        relevanceScore: 0,
        transitionPoints: []
      });
    });

    // Analyze each segment for topics
    let totalDuration = 0;
    let currentTopic = '';
    let topicStartTime = 0;

    for (let i = 0; i < this.speechSegments.length; i++) {
      const segment = this.speechSegments[i];
      const segmentTopics = await this.identifySegmentTopics(segment.text);
      const primaryTopic = segmentTopics.length > 0 ? segmentTopics[0] : 'general';

      // Topic transition detection
      if (primaryTopic !== currentTopic) {
        if (currentTopic && topicMap.has(currentTopic)) {
          const topic = topicMap.get(currentTopic)!;
          topic.transitionPoints.push(segment.startTime);
        }
        currentTopic = primaryTopic;
        topicStartTime = segment.startTime;
      }

      if (topicMap.has(primaryTopic)) {
        const topic = topicMap.get(primaryTopic)!;
        const segmentDuration = segment.endTime - segment.startTime;
        
        topic.duration += segmentDuration;
        totalDuration += segmentDuration;
        
        if (!topic.speakers.includes(segment.speakerId)) {
          topic.speakers.push(segment.speakerId);
        }

        // Extract keywords
        const keywords = this.extractKeywords(segment.text);
        topic.keywords = [...new Set([...topic.keywords, ...keywords])];

        // Add sentiment
        if (segment.sentiment !== undefined) {
          topic.sentiment = (topic.sentiment + segment.sentiment) / 2;
        }
      }
    }

    // Calculate percentages and relevance scores
    const topicDistribution = Array.from(topicMap.values());
    topicDistribution.forEach(topic => {
      topic.percentage = totalDuration > 0 ? (topic.duration / totalDuration) * 100 : 0;
      topic.relevanceScore = this.calculateTopicRelevance(topic);
    });

    return topicDistribution.sort((a, b) => b.duration - a.duration);
  }

  // Collaboration Pattern Identification
  async identifyCollaborationPatterns(): Promise<CollaborationPattern[]> {
    const patterns: CollaborationPattern[] = [];
    let currentPattern: Partial<CollaborationPattern> | null = null;

    for (let i = 0; i < this.speechSegments.length; i++) {
      const segment = this.speechSegments[i];
      const context = this.speechSegments.slice(Math.max(0, i-5), i+5);
      
      const patternType = this.identifyPatternType(segment, context);
      
      if (!currentPattern || currentPattern.type !== patternType) {
        // End current pattern
        if (currentPattern) {
          currentPattern.endTime = segment.startTime;
          currentPattern.effectiveness = this.calculatePatternEffectiveness(currentPattern as CollaborationPattern);
          patterns.push(currentPattern as CollaborationPattern);
        }

        // Start new pattern
        currentPattern = {
          type: patternType,
          startTime: segment.startTime,
          participants: [segment.speakerId],
          intensity: 0.5,
          outcomes: []
        };
      } else {
        // Continue current pattern
        if (!currentPattern.participants!.includes(segment.speakerId)) {
          currentPattern.participants!.push(segment.speakerId);
        }
        
        // Update intensity based on participation
        currentPattern.intensity = this.calculatePatternIntensity(currentPattern, segment);
      }
    }

    // Close final pattern
    if (currentPattern) {
      currentPattern.endTime = this.speechSegments[this.speechSegments.length - 1].endTime;
      currentPattern.effectiveness = this.calculatePatternEffectiveness(currentPattern as CollaborationPattern);
      patterns.push(currentPattern as CollaborationPattern);
    }

    return patterns;
  }

  // Key Moments Detection
  async identifyKeyMoments(): Promise<KeyMoment[]> {
    const keyMoments: KeyMoment[] = [];

    for (let i = 0; i < this.speechSegments.length; i++) {
      const segment = this.speechSegments[i];
      const context = this.speechSegments.slice(Math.max(0, i-3), i+4);

      // Decision moments
      if (this.isDecisionMoment(segment, context)) {
        keyMoments.push({
          timestamp: segment.startTime,
          type: 'decision',
          description: this.extractDecisionDescription(segment, context),
          participants: this.getContextParticipants(context),
          impact: this.calculateMomentImpact(segment, context),
          confidence: 0.8
        });
      }

      // Conflict detection
      if (this.isConflictMoment(segment, context)) {
        keyMoments.push({
          timestamp: segment.startTime,
          type: 'conflict',
          description: 'Disagreement or tension detected',
          participants: this.getContextParticipants(context),
          impact: 0.6,
          confidence: 0.7
        });
      }

      // Breakthrough moments
      if (this.isBreakthroughMoment(segment, context)) {
        keyMoments.push({
          timestamp: segment.startTime,
          type: 'breakthrough',
          description: 'Significant insight or solution identified',
          participants: this.getContextParticipants(context),
          impact: 0.9,
          confidence: 0.75
        });
      }

      // Consensus moments
      if (this.isConsensusMoment(segment, context)) {
        keyMoments.push({
          timestamp: segment.startTime,
          type: 'consensus',
          description: 'Group agreement reached',
          participants: this.getContextParticipants(context),
          impact: 0.8,
          confidence: 0.8
        });
      }

      // Engagement peaks
      if (this.isEngagementPeak(segment, context)) {
        keyMoments.push({
          timestamp: segment.startTime,
          type: 'engagement_peak',
          description: 'High participation and energy detected',
          participants: this.getContextParticipants(context),
          impact: 0.6,
          confidence: 0.7
        });
      }
    }

    return keyMoments.sort((a, b) => b.impact - a.impact);
  }

  // Custom Metrics
  async calculateCustomMetric(metric: CustomMetric, data: any): Promise<number> {
    try {
      // Simple formula evaluation (in production, use a safe expression parser)
      const context = this.prepareMetricContext(data, metric.dataSource);
      const result = this.evaluateFormula(metric.formula, context);
      return this.applyFilters(result, metric.filters, context);
    } catch (error) {
      console.error('Error calculating custom metric:', error);
      return 0;
    }
  }

  // Helper Methods
  private getSpeakerName(speakerId: string): string {
    return this.meetingMetadata.participants?.[speakerId]?.name || `Speaker ${speakerId}`;
  }

  private calculateEngagementScore(participant: ParticipationMetrics): number {
    // Weighted score based on multiple factors
    const talkTimeScore = Math.min(participant.talkTimePercentage / 25, 1) * 30; // 30 points max
    const turnScore = Math.min(participant.numberOfTurns / 10, 1) * 20; // 20 points max
    const questionScore = (participant.questionsAsked + participant.questionsAnswered) * 5; // 5 points each
    const interruptionPenalty = participant.interruptions * -2; // -2 points each
    const silencePenalty = Math.min(participant.silencePeriods / 5, 1) * -10; // -10 points max

    return Math.max(0, Math.min(100, talkTimeScore + turnScore + questionScore + interruptionPenalty + silencePenalty));
  }

  private async analyzeSentiment(text: string): Promise<{
    label: 'positive' | 'negative' | 'neutral';
    confidence: number;
    intensity: number;
    emotionalState: string;
    keywords: string[];
  }> {
    // Simplified sentiment analysis (in production, use a proper NLP library)
    const positiveWords = ['good', 'great', 'excellent', 'happy', 'agree', 'love', 'perfect', 'amazing'];
    const negativeWords = ['bad', 'terrible', 'hate', 'disagree', 'awful', 'horrible', 'wrong', 'frustrated'];
    
    const words = text.toLowerCase().split(/\s+/);
    let positiveCount = 0;
    let negativeCount = 0;
    const foundKeywords: string[] = [];

    words.forEach(word => {
      if (positiveWords.includes(word)) {
        positiveCount++;
        foundKeywords.push(word);
      } else if (negativeWords.includes(word)) {
        negativeCount++;
        foundKeywords.push(word);
      }
    });

    let label: 'positive' | 'negative' | 'neutral';
    let intensity: number;

    if (positiveCount > negativeCount) {
      label = 'positive';
      intensity = Math.min(positiveCount / words.length * 10, 1);
    } else if (negativeCount > positiveCount) {
      label = 'negative';
      intensity = Math.min(negativeCount / words.length * 10, 1);
    } else {
      label = 'neutral';
      intensity = 0.5;
    }

    return {
      label,
      confidence: Math.min((positiveCount + negativeCount) / words.length * 5, 1),
      intensity,
      emotionalState: this.determineEmotionalState(label, intensity),
      keywords: foundKeywords
    };
  }

  private determineEmotionalState(sentiment: string, intensity: number): string {
    if (sentiment === 'positive') {
      return intensity > 0.7 ? 'enthusiastic' : intensity > 0.4 ? 'pleased' : 'content';
    } else if (sentiment === 'negative') {
      return intensity > 0.7 ? 'angry' : intensity > 0.4 ? 'frustrated' : 'concerned';
    } else {
      return 'neutral';
    }
  }

  private async extractTopics(): Promise<string[]> {
    // Simplified topic extraction (in production, use topic modeling)
    const allText = this.speechSegments.map(s => s.text).join(' ');
    const words = allText.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const wordFreq = new Map<string, number>();

    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Get top words as topics
    return Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  private async identifySegmentTopics(text: string): Promise<string[]> {
    // Simple keyword matching for topic identification
    const topicKeywords = {
      'planning': ['plan', 'schedule', 'timeline', 'roadmap', 'strategy'],
      'budget': ['budget', 'cost', 'money', 'expense', 'financial'],
      'team': ['team', 'people', 'staff', 'hire', 'resource'],
      'product': ['product', 'feature', 'development', 'build', 'design'],
      'marketing': ['marketing', 'campaign', 'promotion', 'brand', 'customer'],
      'technical': ['technical', 'code', 'system', 'architecture', 'implementation']
    };

    const textLower = text.toLowerCase();
    const identifiedTopics: string[] = [];

    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => textLower.includes(keyword))) {
        identifiedTopics.push(topic);
      }
    });

    return identifiedTopics.length > 0 ? identifiedTopics : ['general'];
  }

  private extractKeywords(text: string): string[] {
    // Extract meaningful keywords
    const words = text.toLowerCase().match(/\b\w{4,}\b/g) || [];
    const stopWords = new Set(['that', 'this', 'with', 'have', 'will', 'from', 'they', 'been', 'have', 'their']);
    
    return words.filter(word => !stopWords.has(word)).slice(0, 5);
  }

  private calculateAgendaAdherence(agendaItems: string[], discussedTopics: string[]): number {
    if (agendaItems.length === 0) return 1;

    let covered = 0;
    agendaItems.forEach(item => {
      if (discussedTopics.some(topic => item.toLowerCase().includes(topic))) {
        covered++;
      }
    });

    return covered / agendaItems.length;
  }

  private countDecisions(): number {
    const decisionKeywords = ['decide', 'agreed', 'concluded', 'approved', 'rejected'];
    return this.speechSegments.filter(segment =>
      decisionKeywords.some(keyword => segment.text.toLowerCase().includes(keyword))
    ).length;
  }

  private countActionItems(): number {
    const actionKeywords = ['will do', 'action item', 'responsible for', 'assign', 'task'];
    return this.speechSegments.filter(segment =>
      actionKeywords.some(keyword => segment.text.toLowerCase().includes(keyword))
    ).length;
  }

  private calculateParticipationBalance(participants: ParticipationMetrics[]): number {
    if (participants.length === 0) return 1;

    const talkTimes = participants.map(p => p.talkTimePercentage);
    const mean = talkTimes.reduce((sum, time) => sum + time, 0) / talkTimes.length;
    const variance = talkTimes.reduce((sum, time) => sum + Math.pow(time - mean, 2), 0) / talkTimes.length;
    
    // Lower variance means better balance
    return Math.max(0, 1 - (variance / 100));
  }

  private estimateTimeWasted(): number {
    // Estimate based on long silences and off-topic discussions
    let wastedTime = 0;

    // Add long silences between segments
    for (let i = 1; i < this.speechSegments.length; i++) {
      const gap = this.speechSegments[i].startTime - this.speechSegments[i-1].endTime;
      if (gap > 10000) { // 10 seconds
        wastedTime += gap;
      }
    }

    return wastedTime;
  }

  private calculateFocusScore(): number {
    // Based on topic coherence and transitions
    const topics = this.speechSegments.map(s => s.topics || ['general']).flat();
    const uniqueTopics = new Set(topics);
    
    // Fewer topics generally means better focus
    const topicDiversity = uniqueTopics.size / Math.max(topics.length, 1);
    return Math.max(0, 1 - topicDiversity);
  }

  private calculateProductivityScore(decisions: number, actionItems: number, duration: number): number {
    const durationHours = duration / (1000 * 60 * 60);
    const decisionRate = decisions / durationHours;
    const actionRate = actionItems / durationHours;
    
    // Normalize to 0-1 scale
    return Math.min(1, (decisionRate + actionRate) / 5);
  }

  private calculateTopicRelevance(topic: TopicDistribution): number {
    // Simple relevance based on participation and duration
    const durationScore = Math.min(topic.percentage / 20, 1) * 0.5; // 50% weight
    const participationScore = Math.min(topic.speakers.length / 5, 1) * 0.3; // 30% weight
    const sentimentScore = (topic.sentiment + 1) / 2 * 0.2; // 20% weight (normalize -1,1 to 0,1)
    
    return durationScore + participationScore + sentimentScore;
  }

  private identifyPatternType(segment: SpeechSegment, context: SpeechSegment[]): CollaborationPattern['type'] {
    const text = segment.text.toLowerCase();
    
    if (text.includes('present') || text.includes('show') || context.length < 3) {
      return 'presentation';
    } else if (text.includes('idea') || text.includes('brainstorm') || text.includes('creative')) {
      return 'brainstorming';
    } else if (text.includes('decide') || text.includes('choose') || text.includes('vote')) {
      return 'decision_making';
    } else if (text.includes('disagree') || text.includes('but') || text.includes('however')) {
      return 'conflict';
    } else if (text.includes('agree') || text.includes('consensus') || text.includes('all')) {
      return 'consensus';
    } else {
      return 'discussion';
    }
  }

  private calculatePatternIntensity(pattern: Partial<CollaborationPattern>, segment: SpeechSegment): number {
    // Intensity based on participation rate and speech characteristics
    const participationRate = pattern.participants!.length / (this.meetingMetadata.totalParticipants || 4);
    const wordRate = segment.text.split(' ').length / ((segment.endTime - segment.startTime) / 1000);
    
    return Math.min(1, (participationRate + Math.min(wordRate / 3, 1)) / 2);
  }

  private calculatePatternEffectiveness(pattern: CollaborationPattern): number {
    // Effectiveness based on pattern type and outcomes
    const baseEffectiveness = {
      'discussion': 0.7,
      'presentation': 0.8,
      'brainstorming': 0.6,
      'decision_making': 0.9,
      'conflict': 0.3,
      'consensus': 0.9
    };

    const base = baseEffectiveness[pattern.type] || 0.5;
    const intensityBonus = pattern.intensity * 0.2;
    const participationBonus = Math.min(pattern.participants.length / 4, 1) * 0.1;
    
    return Math.min(1, base + intensityBonus + participationBonus);
  }

  private isDecisionMoment(segment: SpeechSegment, context: SpeechSegment[]): boolean {
    const decisionWords = ['decide', 'agreed', 'concluded', 'final', 'approved', 'go with'];
    return decisionWords.some(word => segment.text.toLowerCase().includes(word));
  }

  private isConflictMoment(segment: SpeechSegment, context: SpeechSegment[]): boolean {
    const conflictWords = ['disagree', 'wrong', 'but', 'however', 'issue', 'problem'];
    return conflictWords.some(word => segment.text.toLowerCase().includes(word)) &&
           segment.sentiment !== undefined && segment.sentiment < -0.3;
  }

  private isBreakthroughMoment(segment: SpeechSegment, context: SpeechSegment[]): boolean {
    const breakthroughWords = ['insight', 'solution', 'breakthrough', 'eureka', 'perfect', 'exactly'];
    return breakthroughWords.some(word => segment.text.toLowerCase().includes(word)) &&
           segment.sentiment !== undefined && segment.sentiment > 0.5;
  }

  private isConsensusMoment(segment: SpeechSegment, context: SpeechSegment[]): boolean {
    const consensusWords = ['all agree', 'consensus', 'everyone', 'unanimous', 'together'];
    return consensusWords.some(word => segment.text.toLowerCase().includes(word));
  }

  private isEngagementPeak(segment: SpeechSegment, context: SpeechSegment[]): boolean {
    // Check if multiple people are speaking in quick succession
    const recentSpeakers = new Set(context.slice(-5).map(s => s.speakerId));
    return recentSpeakers.size >= 3;
  }

  private extractDecisionDescription(segment: SpeechSegment, context: SpeechSegment[]): string {
    return `Decision made: ${segment.text.substring(0, 100)}...`;
  }

  private getContextParticipants(context: SpeechSegment[]): string[] {
    return [...new Set(context.map(s => s.speakerId))];
  }

  private calculateMomentImpact(segment: SpeechSegment, context: SpeechSegment[]): number {
    const participantCount = this.getContextParticipants(context).length;
    const textLength = segment.text.length;
    const baseImpact = 0.5;
    
    return Math.min(1, baseImpact + (participantCount / 10) + (textLength / 1000));
  }

  private generateRecommendations(analytics: {
    participants: ParticipationMetrics[];
    efficiency: EfficiencyMetrics;
    collaborationPatterns: CollaborationPattern[];
  }): string[] {
    const recommendations: string[] = [];

    // Participation recommendations
    const lowEngagement = analytics.participants.filter(p => p.engagementScore < 40);
    if (lowEngagement.length > 0) {
      recommendations.push(`Encourage more participation from ${lowEngagement.map(p => p.speakerName).join(', ')}`);
    }

    const highInterrupters = analytics.participants.filter(p => p.interruptions > 3);
    if (highInterrupters.length > 0) {
      recommendations.push(`Address interruption patterns with ${highInterrupters.map(p => p.speakerName).join(', ')}`);
    }

    // Efficiency recommendations
    if (analytics.efficiency.overallEfficiency < 60) {
      recommendations.push('Consider using a more structured agenda to improve meeting efficiency');
    }

    if (analytics.efficiency.timeWasted > analytics.efficiency.duration * 0.2) {
      recommendations.push('Reduce off-topic discussions and long silences');
    }

    // Collaboration recommendations
    const conflictPatterns = analytics.collaborationPatterns.filter(p => p.type === 'conflict');
    if (conflictPatterns.length > 2) {
      recommendations.push('Consider conflict resolution strategies for future meetings');
    }

    return recommendations;
  }

  // Custom metric helpers
  private prepareMetricContext(data: any, dataSources: string[]): any {
    const context: any = {};
    dataSources.forEach(source => {
      context[source] = data[source] || 0;
    });
    return context;
  }

  private evaluateFormula(formula: string, context: any): number {
    // Simple formula evaluation (in production, use a proper expression parser)
    try {
      // Replace variables in formula with actual values
      let evaluatedFormula = formula;
      Object.keys(context).forEach(key => {
        evaluatedFormula = evaluatedFormula.replace(new RegExp(`\\b${key}\\b`, 'g'), context[key]);
      });
      
      // Basic math evaluation (unsafe - use proper parser in production)
      return eval(evaluatedFormula) || 0;
    } catch {
      return 0;
    }
  }

  private applyFilters(value: number, filters: MetricFilter[], context: any): number {
    // Apply filters to the calculated value
    for (const filter of filters) {
      const fieldValue = context[filter.field];
      let passes = false;

      switch (filter.operator) {
        case 'equals':
          passes = fieldValue === filter.value;
          break;
        case 'greater_than':
          passes = fieldValue > filter.value;
          break;
        case 'less_than':
          passes = fieldValue < filter.value;
          break;
        case 'contains':
          passes = String(fieldValue).includes(filter.value);
          break;
        case 'not_equals':
          passes = fieldValue !== filter.value;
          break;
      }

      if (!passes) {
        return 0; // Filter failed
      }
    }

    return value;
  }

  // Public API for custom metrics
  addCustomMetric(metric: CustomMetric): void {
    this.customMetrics.push(metric);
  }

  getCustomMetrics(): CustomMetric[] {
    return [...this.customMetrics];
  }

  removeCustomMetric(metricId: string): void {
    this.customMetrics = this.customMetrics.filter(m => m.id !== metricId);
  }
}

export default AnalyticsService;