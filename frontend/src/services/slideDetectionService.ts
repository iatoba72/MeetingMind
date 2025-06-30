// Slide Detection Service
// Detects slide changes and content transitions in screen sharing

import type { CaptureFrame } from './screenCaptureService';

export interface SlideChangeEvent {
  id: string;
  timestamp: number;
  frameId: string;
  changeType: 'slide_change' | 'content_update' | 'transition' | 'animation';
  confidence: number;
  previousSlide?: SlideInfo;
  currentSlide: SlideInfo;
  metrics: {
    visualDifference: number;
    structuralDifference: number;
    colorDifference: number;
    edgeDifference: number;
  };
}

export interface SlideInfo {
  id: string;
  timestamp: number;
  thumbnail: string; // base64 encoded
  dominantColors: string[];
  textContent?: string;
  layout: {
    hasTitle: boolean;
    hasBulletPoints: boolean;
    hasImages: boolean;
    hasCharts: boolean;
    textRegions: TextRegion[];
  };
  metadata: {
    aspectRatio: number;
    complexity: number;
    textDensity: number;
    brightness: number;
  };
}

export interface TextRegion {
  bbox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  text: string;
  confidence: number;
  fontSize: number;
  fontStyle: 'normal' | 'bold' | 'italic';
}

export interface DetectionSettings {
  sensitivityThreshold: number; // 0.1 to 1.0
  minimumTimeBetweenChanges: number; // milliseconds
  ignoreMinorChanges: boolean;
  enableStructuralAnalysis: boolean;
  enableColorAnalysis: boolean;
  enableEdgeDetection: boolean;
  debounceTime: number; // milliseconds
}

export class SlideDetectionService {
  private settings: DetectionSettings;
  private previousFrame: CaptureFrame | null = null;
  private previousSlide: SlideInfo | null = null;
  private lastChangeTime = 0;
  private debounceTimeout: NodeJS.Timeout | null = null;
  private onSlideChange?: (event: SlideChangeEvent) => void;
  private frameHistory: CaptureFrame[] = [];
  private slideHistory: SlideInfo[] = [];

  // Canvas for image processing
  private canvas: HTMLCanvasElement;
  private context: CanvasRenderingContext2D;

  // Performance optimization
  private edgeCanvas: HTMLCanvasElement;
  private edgeContext: CanvasRenderingContext2D;

  constructor(settings: Partial<DetectionSettings> = {}) {
    this.settings = {
      sensitivityThreshold: 0.3,
      minimumTimeBetweenChanges: 1000, // 1 second
      ignoreMinorChanges: true,
      enableStructuralAnalysis: true,
      enableColorAnalysis: true,
      enableEdgeDetection: true,
      debounceTime: 500,
      ...settings
    };

    // Initialize canvases
    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d')!;
    this.edgeCanvas = document.createElement('canvas');
    this.edgeContext = this.edgeCanvas.getContext('2d')!;
  }

  processFrame(frame: CaptureFrame): Promise<SlideChangeEvent | null> {
    return new Promise((resolve) => {
      // Clear previous debounce
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
      }

      // Debounce rapid changes
      this.debounceTimeout = setTimeout(async () => {
        const changeEvent = await this.analyzeFrame(frame);
        resolve(changeEvent);
      }, this.settings.debounceTime);
    });
  }

  private async analyzeFrame(frame: CaptureFrame): Promise<SlideChangeEvent | null> {
    // Add to frame history
    this.frameHistory.push(frame);
    if (this.frameHistory.length > 10) {
      this.frameHistory.shift();
    }

    // Skip if too soon after last change
    const timeSinceLastChange = frame.timestamp - this.lastChangeTime;
    if (timeSinceLastChange < this.settings.minimumTimeBetweenChanges) {
      return null;
    }

    // If no previous frame, this is the first slide
    if (!this.previousFrame) {
      const slideInfo = await this.extractSlideInfo(frame);
      this.previousFrame = frame;
      this.previousSlide = slideInfo;
      this.slideHistory.push(slideInfo);
      this.lastChangeTime = frame.timestamp;

      return {
        id: `change_${Date.now()}`,
        timestamp: frame.timestamp,
        frameId: frame.id,
        changeType: 'slide_change',
        confidence: 1.0,
        currentSlide: slideInfo,
        metrics: {
          visualDifference: 1.0,
          structuralDifference: 1.0,
          colorDifference: 1.0,
          edgeDifference: 1.0
        }
      };
    }

    // Compare with previous frame
    const metrics = await this.compareFrames(this.previousFrame, frame);
    const overallDifference = this.calculateOverallDifference(metrics);

    // Determine if this is a significant change
    if (overallDifference > this.settings.sensitivityThreshold) {
      const changeType = this.classifyChange(metrics, overallDifference);
      
      // Skip minor changes if configured
      if (this.settings.ignoreMinorChanges && changeType === 'content_update' && overallDifference < 0.5) {
        return null;
      }

      const currentSlide = await this.extractSlideInfo(frame);
      
      const changeEvent: SlideChangeEvent = {
        id: `change_${Date.now()}`,
        timestamp: frame.timestamp,
        frameId: frame.id,
        changeType,
        confidence: Math.min(overallDifference, 1.0),
        previousSlide: this.previousSlide || undefined,
        currentSlide,
        metrics
      };

      // Update state
      this.previousFrame = frame;
      this.previousSlide = currentSlide;
      this.slideHistory.push(currentSlide);
      this.lastChangeTime = frame.timestamp;

      // Trigger callback
      if (this.onSlideChange) {
        this.onSlideChange(changeEvent);
      }

      return changeEvent;
    }

    return null;
  }

  private async compareFrames(
    frame1: CaptureFrame,
    frame2: CaptureFrame
  ): Promise<SlideChangeEvent['metrics']> {
    // Set up canvases
    this.canvas.width = frame1.metadata.width;
    this.canvas.height = frame1.metadata.height;

    // Calculate visual difference
    const visualDifference = await this.calculateVisualDifference(frame1, frame2);

    // Calculate structural difference (if enabled)
    let structuralDifference = 0;
    if (this.settings.enableStructuralAnalysis) {
      structuralDifference = await this.calculateStructuralDifference(frame1, frame2);
    }

    // Calculate color difference (if enabled)
    let colorDifference = 0;
    if (this.settings.enableColorAnalysis) {
      colorDifference = await this.calculateColorDifference(frame1, frame2);
    }

    // Calculate edge difference (if enabled)
    let edgeDifference = 0;
    if (this.settings.enableEdgeDetection) {
      edgeDifference = await this.calculateEdgeDifference(frame1, frame2);
    }

    return {
      visualDifference,
      structuralDifference,
      colorDifference,
      edgeDifference
    };
  }

  private async calculateVisualDifference(frame1: CaptureFrame, frame2: CaptureFrame): Promise<number> {
    // Draw both frames and compare pixel by pixel
    this.context.drawImage(frame1.canvas, 0, 0);
    const imageData1 = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);

    this.context.drawImage(frame2.canvas, 0, 0);
    const imageData2 = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);

    const data1 = imageData1.data;
    const data2 = imageData2.data;
    let totalDifference = 0;
    let pixelCount = 0;

    // Sample every 4th pixel for performance
    for (let i = 0; i < data1.length; i += 16) {
      const r1 = data1[i];
      const g1 = data1[i + 1];
      const b1 = data1[i + 2];
      
      const r2 = data2[i];
      const g2 = data2[i + 1];
      const b2 = data2[i + 2];

      // Calculate Euclidean distance
      const diff = Math.sqrt(
        Math.pow(r1 - r2, 2) +
        Math.pow(g1 - g2, 2) +
        Math.pow(b1 - b2, 2)
      );

      totalDifference += diff;
      pixelCount++;
    }

    // Normalize to 0-1 range
    return pixelCount > 0 ? (totalDifference / pixelCount) / (255 * Math.sqrt(3)) : 0;
  }

  private async calculateStructuralDifference(frame1: CaptureFrame, frame2: CaptureFrame): Promise<number> {
    // Convert to grayscale and apply edge detection
    const edges1 = this.extractEdges(frame1.canvas);
    const edges2 = this.extractEdges(frame2.canvas);

    // Compare edge maps
    let edgeDifference = 0;
    let edgePixelCount = 0;

    for (let i = 0; i < edges1.length; i++) {
      if (edges1[i] > 0 || edges2[i] > 0) {
        edgeDifference += Math.abs(edges1[i] - edges2[i]);
        edgePixelCount++;
      }
    }

    return edgePixelCount > 0 ? edgeDifference / (edgePixelCount * 255) : 0;
  }

  private async calculateColorDifference(frame1: CaptureFrame, frame2: CaptureFrame): Promise<number> {
    const colors1 = this.extractDominantColors(frame1.canvas);
    const colors2 = this.extractDominantColors(frame2.canvas);

    // Compare color histograms
    let colorDifference = 0;
    const maxBins = Math.max(colors1.length, colors2.length);

    for (let i = 0; i < maxBins; i++) {
      const color1 = colors1[i] || { count: 0, color: [0, 0, 0] };
      const color2 = colors2[i] || { count: 0, color: [0, 0, 0] };

      const diff = Math.sqrt(
        Math.pow(color1.color[0] - color2.color[0], 2) +
        Math.pow(color1.color[1] - color2.color[1], 2) +
        Math.pow(color1.color[2] - color2.color[2], 2)
      );

      colorDifference += diff * Math.abs(color1.count - color2.count);
    }

    return Math.min(colorDifference / (255 * Math.sqrt(3) * 100), 1);
  }

  private async calculateEdgeDifference(frame1: CaptureFrame, frame2: CaptureFrame): Promise<number> {
    // Simple edge difference using Sobel operator
    const edges1 = this.applySobelOperator(frame1.canvas);
    const edges2 = this.applySobelOperator(frame2.canvas);

    let totalDiff = 0;
    let pixelCount = 0;

    for (let i = 0; i < edges1.length; i++) {
      totalDiff += Math.abs(edges1[i] - edges2[i]);
      pixelCount++;
    }

    return pixelCount > 0 ? totalDiff / (pixelCount * 255) : 0;
  }

  private extractEdges(canvas: HTMLCanvasElement): Uint8Array {
    this.context.drawImage(canvas, 0, 0);
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const edges = new Uint8Array(canvas.width * canvas.height);

    // Simple edge detection using gradient magnitude
    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        const idx = (y * canvas.width + x) * 4;
        
        // Get neighboring pixels
        const grayLeft = 0.299 * data[idx - 4] + 0.587 * data[idx - 3] + 0.114 * data[idx - 2];
        const grayRight = 0.299 * data[idx + 4] + 0.587 * data[idx + 5] + 0.114 * data[idx + 6];
        const grayUp = 0.299 * data[idx - canvas.width * 4] + 0.587 * data[idx - canvas.width * 4 + 1] + 0.114 * data[idx - canvas.width * 4 + 2];
        const grayDown = 0.299 * data[idx + canvas.width * 4] + 0.587 * data[idx + canvas.width * 4 + 1] + 0.114 * data[idx + canvas.width * 4 + 2];

        // Calculate gradient
        const gx = grayRight - grayLeft;
        const gy = grayDown - grayUp;
        const magnitude = Math.sqrt(gx * gx + gy * gy);

        edges[y * canvas.width + x] = Math.min(255, magnitude);
      }
    }

    return edges;
  }

  private extractDominantColors(canvas: HTMLCanvasElement): Array<{ color: [number, number, number], count: number }> {
    this.context.drawImage(canvas, 0, 0);
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const colorMap = new Map<string, number>();

    // Sample every 16th pixel for performance
    for (let i = 0; i < data.length; i += 64) {
      // Quantize colors to reduce noise
      const r = Math.floor(data[i] / 32) * 32;
      const g = Math.floor(data[i + 1] / 32) * 32;
      const b = Math.floor(data[i + 2] / 32) * 32;
      
      const colorKey = `${r},${g},${b}`;
      colorMap.set(colorKey, (colorMap.get(colorKey) || 0) + 1);
    }

    // Sort by count and return top colors
    return Array.from(colorMap.entries())
      .map(([colorKey, count]) => {
        const [r, g, b] = colorKey.split(',').map(Number);
        return { color: [r, g, b] as [number, number, number], count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  private applySobelOperator(canvas: HTMLCanvasElement): Uint8Array {
    this.context.drawImage(canvas, 0, 0);
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const edges = new Uint8Array(canvas.width * canvas.height);

    // Sobel kernels
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        let gx = 0, gy = 0;

        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * canvas.width + (x + kx)) * 4;
            const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            
            const kernelIdx = (ky + 1) * 3 + (kx + 1);
            gx += gray * sobelX[kernelIdx];
            gy += gray * sobelY[kernelIdx];
          }
        }

        const magnitude = Math.sqrt(gx * gx + gy * gy);
        edges[y * canvas.width + x] = Math.min(255, magnitude);
      }
    }

    return edges;
  }

  private calculateOverallDifference(metrics: SlideChangeEvent['metrics']): number {
    // Weighted combination of different metrics
    let totalWeight = 0;
    let weightedSum = 0;

    if (metrics.visualDifference > 0) {
      weightedSum += metrics.visualDifference * 0.4;
      totalWeight += 0.4;
    }

    if (this.settings.enableStructuralAnalysis && metrics.structuralDifference > 0) {
      weightedSum += metrics.structuralDifference * 0.3;
      totalWeight += 0.3;
    }

    if (this.settings.enableColorAnalysis && metrics.colorDifference > 0) {
      weightedSum += metrics.colorDifference * 0.2;
      totalWeight += 0.2;
    }

    if (this.settings.enableEdgeDetection && metrics.edgeDifference > 0) {
      weightedSum += metrics.edgeDifference * 0.1;
      totalWeight += 0.1;
    }

    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private classifyChange(
    metrics: SlideChangeEvent['metrics'],
    overallDifference: number
  ): SlideChangeEvent['changeType'] {
    // Classify based on the type and magnitude of change
    if (overallDifference > 0.8) {
      return 'slide_change';
    } else if (metrics.structuralDifference > 0.6) {
      return 'transition';
    } else if (overallDifference > 0.4) {
      return 'content_update';
    } else {
      return 'animation';
    }
  }

  private async extractSlideInfo(frame: CaptureFrame): Promise<SlideInfo> {
    const dominantColors = this.extractDominantColors(frame.canvas);
    const layout = await this.analyzeLayout(frame.canvas);
    const metadata = this.calculateMetadata(frame.canvas, dominantColors);

    return {
      id: `slide_${Date.now()}`,
      timestamp: frame.timestamp,
      thumbnail: frame.imageData,
      dominantColors: dominantColors.slice(0, 5).map(c => 
        `rgb(${c.color[0]}, ${c.color[1]}, ${c.color[2]})`
      ),
      layout,
      metadata
    };
  }

  private async analyzeLayout(canvas: HTMLCanvasElement): Promise<SlideInfo['layout']> {
    // Simple layout analysis - would be enhanced with OCR integration
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Analyze top portion for title
    let topBrightness = 0;
    let topPixels = 0;
    const titleRegionHeight = Math.floor(canvas.height * 0.2);

    for (let y = 0; y < titleRegionHeight; y++) {
      for (let x = 0; x < canvas.width; x += 4) {
        const idx = (y * canvas.width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        topBrightness += brightness;
        topPixels++;
      }
    }

    const hasTitle = topPixels > 0 && (topBrightness / topPixels) < 128; // Dark text assumption

    // Detect bullet points (simple heuristic)
    const hasBulletPoints = this.detectBulletPoints(canvas);

    // Detect images (high color variance regions)
    const hasImages = this.detectImages(canvas);

    // Detect charts (patterns and geometric shapes)
    const hasCharts = this.detectCharts(canvas);

    return {
      hasTitle,
      hasBulletPoints,
      hasImages,
      hasCharts,
      textRegions: [] // Would be populated with OCR integration
    };
  }

  private detectBulletPoints(canvas: HTMLCanvasElement): boolean {
    // Simple heuristic: look for left-aligned dark spots
    this.context.drawImage(canvas, 0, 0);
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let bulletCandidates = 0;
    const leftMargin = Math.floor(canvas.width * 0.1);
    const rightBound = Math.floor(canvas.width * 0.2);

    for (let y = Math.floor(canvas.height * 0.3); y < canvas.height * 0.8; y += 20) {
      for (let x = leftMargin; x < rightBound; x += 5) {
        const idx = (y * canvas.width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        
        if (brightness < 100) { // Dark pixel
          bulletCandidates++;
        }
      }
    }

    return bulletCandidates > 3;
  }

  private detectImages(canvas: HTMLCanvasElement): boolean {
    // Detect high color variance regions
    this.context.drawImage(canvas, 0, 0);
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    let highVarianceRegions = 0;
    const regionSize = 50;

    for (let y = 0; y < canvas.height - regionSize; y += regionSize) {
      for (let x = 0; x < canvas.width - regionSize; x += regionSize) {
        const variance = this.calculateRegionVariance(data, x, y, regionSize, canvas.width);
        if (variance > 1000) {
          highVarianceRegions++;
        }
      }
    }

    return highVarianceRegions > 2;
  }

  private detectCharts(canvas: HTMLCanvasElement): boolean {
    // Simple geometric pattern detection
    const edges = this.extractEdges(canvas);
    let straightLines = 0;
    let totalEdges = 0;

    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > 128) {
        totalEdges++;
        // Check for horizontal/vertical alignment
        const y = Math.floor(i / canvas.width);
        const x = i % canvas.width;
        
        if (this.checkLineAlignment(edges, x, y, canvas.width, canvas.height)) {
          straightLines++;
        }
      }
    }

    return totalEdges > 0 && (straightLines / totalEdges) > 0.3;
  }

  private calculateRegionVariance(
    data: Uint8ClampedArray,
    startX: number,
    startY: number,
    size: number,
    width: number
  ): number {
    let sum = 0;
    let sumSquared = 0;
    let count = 0;

    for (let y = startY; y < startY + size; y++) {
      for (let x = startX; x < startX + size; x++) {
        const idx = (y * width + x) * 4;
        const brightness = (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
        sum += brightness;
        sumSquared += brightness * brightness;
        count++;
      }
    }

    const mean = sum / count;
    const variance = (sumSquared / count) - (mean * mean);
    return variance;
  }

  private checkLineAlignment(
    edges: Uint8Array,
    x: number,
    y: number,
    width: number,
    height: number
  ): boolean {
    // Check horizontal alignment
    let horizontalCount = 0;
    for (let dx = -3; dx <= 3; dx++) {
      const nx = x + dx;
      if (nx >= 0 && nx < width) {
        const idx = y * width + nx;
        if (edges[idx] > 128) horizontalCount++;
      }
    }

    // Check vertical alignment
    let verticalCount = 0;
    for (let dy = -3; dy <= 3; dy++) {
      const ny = y + dy;
      if (ny >= 0 && ny < height) {
        const idx = ny * width + x;
        if (edges[idx] > 128) verticalCount++;
      }
    }

    return horizontalCount >= 5 || verticalCount >= 5;
  }

  private calculateMetadata(
    canvas: HTMLCanvasElement,
    dominantColors: Array<{ color: [number, number, number], count: number }>
  ): SlideInfo['metadata'] {
    this.context.drawImage(canvas, 0, 0);
    const imageData = this.context.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Calculate average brightness
    let totalBrightness = 0;
    let pixelCount = 0;

    for (let i = 0; i < data.length; i += 16) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      totalBrightness += brightness;
      pixelCount++;
    }

    const averageBrightness = totalBrightness / pixelCount;

    // Calculate complexity (edge density)
    const edges = this.extractEdges(canvas);
    let edgeCount = 0;
    for (let i = 0; i < edges.length; i++) {
      if (edges[i] > 128) edgeCount++;
    }
    const complexity = edgeCount / edges.length;

    // Estimate text density (dark pixels in regular patterns)
    let textPixels = 0;
    for (let i = 0; i < data.length; i += 16) {
      const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (brightness < 100) textPixels++;
    }
    const textDensity = textPixels / pixelCount;

    return {
      aspectRatio: canvas.width / canvas.height,
      complexity,
      textDensity,
      brightness: averageBrightness / 255,
      dominantColors: dominantColors.slice(0, 3).map(c => c.color) // Top 3 dominant colors
    };
  }

  // Public API
  updateSettings(newSettings: Partial<DetectionSettings>) {
    this.settings = { ...this.settings, ...newSettings };
  }

  onSlideChangeDetected(callback: (event: SlideChangeEvent) => void) {
    this.onSlideChange = callback;
  }

  getSlideHistory(): SlideInfo[] {
    return [...this.slideHistory];
  }

  getCurrentSlide(): SlideInfo | null {
    return this.previousSlide;
  }

  getDetectionStats() {
    return {
      totalSlides: this.slideHistory.length,
      averageSlideTime: this.slideHistory.length > 1 
        ? (this.slideHistory[this.slideHistory.length - 1].timestamp - this.slideHistory[0].timestamp) / (this.slideHistory.length - 1)
        : 0,
      lastChangeTime: this.lastChangeTime,
      settings: this.settings
    };
  }

  reset() {
    this.previousFrame = null;
    this.previousSlide = null;
    this.lastChangeTime = 0;
    this.frameHistory = [];
    this.slideHistory = [];
    
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
  }
}

export default SlideDetectionService;