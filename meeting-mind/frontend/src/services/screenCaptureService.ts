// Screen Capture Service
// Handles browser screen sharing API and frame extraction with optimization

export interface CaptureFrame {
  id: string;
  timestamp: number;
  imageData: string; // base64 encoded
  canvas: HTMLCanvasElement;
  metadata: {
    width: number;
    height: number;
    quality: number;
    size: number;
  };
}

export interface CaptureSettings {
  frameRate: number; // frames per second
  quality: number; // 0.1 to 1.0
  maxWidth: number;
  maxHeight: number;
  enableOptimization: boolean;
  compressionLevel: number;
}

export interface ScreenShareMetadata {
  displaySurface: 'monitor' | 'window' | 'browser';
  logicalSurface: boolean;
  cursor: 'never' | 'always' | 'motion';
  aspectRatio: number;
  frameRate: number;
}

export class ScreenCaptureService {
  private mediaStream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private isCapturing = false;
  private captureInterval: NodeJS.Timeout | null = null;
  private frameBuffer: CaptureFrame[] = [];
  private settings: CaptureSettings;
  private onFrameCaptured?: (frame: CaptureFrame) => void;
  private onError?: (error: Error) => void;
  private frameCount = 0;
  private totalSize = 0;

  // Performance optimization
  private offscreenCanvas: OffscreenCanvas | null = null;
  private offscreenContext: OffscreenCanvasRenderingContext2D | null = null;
  private compressionWorker: Worker | null = null;

  constructor(settings: Partial<CaptureSettings> = {}) {
    this.settings = {
      frameRate: 2, // Default 2 FPS for screen sharing
      quality: 0.8,
      maxWidth: 1920,
      maxHeight: 1080,
      enableOptimization: true,
      compressionLevel: 0.7,
      ...settings
    };

    this.initializeOptimization();
  }

  private initializeOptimization() {
    // Initialize offscreen canvas for better performance
    if (typeof OffscreenCanvas !== 'undefined') {
      this.offscreenCanvas = new OffscreenCanvas(
        this.settings.maxWidth,
        this.settings.maxHeight
      );
      this.offscreenContext = this.offscreenCanvas.getContext('2d');
    }

    // Initialize compression worker
    this.initializeCompressionWorker();
  }

  private initializeCompressionWorker() {
    const workerCode = `
      self.onmessage = function(e) {
        const { imageData, quality, type } = e.data;
        
        // Create canvas in worker
        const canvas = new OffscreenCanvas(imageData.width, imageData.height);
        const ctx = canvas.getContext('2d');
        
        // Put image data
        ctx.putImageData(imageData, 0, 0);
        
        // Convert to blob with compression
        canvas.convertToBlob({
          type: type || 'image/jpeg',
          quality: quality || 0.8
        }).then(blob => {
          const reader = new FileReader();
          reader.onload = () => {
            self.postMessage({
              success: true,
              data: reader.result,
              originalSize: imageData.data.length,
              compressedSize: blob.size
            });
          };
          reader.readAsDataURL(blob);
        }).catch(error => {
          self.postMessage({
            success: false,
            error: error.message
          });
        });
      };
    `;

    const blob = new Blob([workerCode], { type: 'application/javascript' });
    this.compressionWorker = new Worker(URL.createObjectURL(blob));
  }

  async startCapture(): Promise<ScreenShareMetadata> {
    try {
      // Check if browser supports screen capture
      if (!navigator.mediaDevices?.getDisplayMedia) {
        throw new Error('Screen capture not supported in this browser');
      }

      // Request screen share permission
      const constraints: DisplayMediaStreamConstraints = {
        video: {
          width: { max: this.settings.maxWidth },
          height: { max: this.settings.maxHeight },
          frameRate: { max: this.settings.frameRate }
        },
        audio: false // We handle audio separately
      };

      this.mediaStream = await navigator.mediaDevices.getDisplayMedia(constraints);

      // Setup video element
      this.video = document.createElement('video');
      this.video.srcObject = this.mediaStream;
      this.video.autoplay = true;
      this.video.muted = true;
      this.video.playsInline = true;

      // Wait for video to be ready
      await new Promise((resolve, reject) => {
        this.video!.onloadedmetadata = resolve;
        this.video!.onerror = reject;
        setTimeout(reject, 5000); // 5 second timeout
      });

      // Setup canvas for frame extraction
      this.setupCanvas();

      // Extract metadata
      const track = this.mediaStream.getVideoTracks()[0];
      const settings = track.getSettings();
      const capabilities = track.getCapabilities?.() || {};

      const metadata: ScreenShareMetadata = {
        displaySurface: (settings as any).displaySurface || 'monitor',
        logicalSurface: (settings as any).logicalSurface || false,
        cursor: (settings as any).cursor || 'motion',
        aspectRatio: settings.width! / settings.height!,
        frameRate: settings.frameRate || this.settings.frameRate
      };

      // Start frame capture
      this.startFrameCapture();

      // Handle stream end
      track.onended = () => {
        this.stopCapture();
      };

      this.isCapturing = true;
      return metadata;

    } catch (error) {
      this.handleError(new Error(`Failed to start screen capture: ${error}`));
      throw error;
    }
  }

  private setupCanvas() {
    if (!this.video) return;

    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');

    // Set canvas size based on video dimensions
    const videoWidth = this.video.videoWidth;
    const videoHeight = this.video.videoHeight;

    // Calculate optimal size maintaining aspect ratio
    const aspectRatio = videoWidth / videoHeight;
    let canvasWidth = Math.min(videoWidth, this.settings.maxWidth);
    let canvasHeight = canvasWidth / aspectRatio;

    if (canvasHeight > this.settings.maxHeight) {
      canvasHeight = this.settings.maxHeight;
      canvasWidth = canvasHeight * aspectRatio;
    }

    this.canvas.width = canvasWidth;
    this.canvas.height = canvasHeight;
  }

  private startFrameCapture() {
    if (!this.video || !this.canvas || !this.context) return;

    const captureFrame = () => {
      if (!this.isCapturing || !this.video || !this.canvas || !this.context) return;

      try {
        // Draw current video frame to canvas
        this.context.drawImage(
          this.video,
          0, 0,
          this.canvas.width,
          this.canvas.height
        );

        // Create frame data
        const timestamp = Date.now();
        const frameId = `frame_${this.frameCount++}_${timestamp}`;

        // Extract image data
        const imageData = this.context.getImageData(
          0, 0,
          this.canvas.width,
          this.canvas.height
        );

        // Create frame object
        const frame: CaptureFrame = {
          id: frameId,
          timestamp,
          imageData: '', // Will be set after compression
          canvas: this.canvas.cloneNode(true) as HTMLCanvasElement,
          metadata: {
            width: this.canvas.width,
            height: this.canvas.height,
            quality: this.settings.quality,
            size: imageData.data.length
          }
        };

        // Compress and process frame
        this.processFrame(frame, imageData);

      } catch (error) {
        this.handleError(new Error(`Frame capture failed: ${error}`));
      }
    };

    // Start interval capture
    const interval = 1000 / this.settings.frameRate;
    this.captureInterval = setInterval(captureFrame, interval);
  }

  private async processFrame(frame: CaptureFrame, imageData: ImageData) {
    if (this.settings.enableOptimization && this.compressionWorker) {
      // Use worker for compression
      this.compressionWorker.postMessage({
        imageData,
        quality: this.settings.quality,
        type: 'image/jpeg'
      });

      this.compressionWorker.onmessage = (e) => {
        const { success, data, compressedSize, error } = e.data;
        
        if (success) {
          frame.imageData = data;
          frame.metadata.size = compressedSize;
          this.addFrameToBuffer(frame);
        } else {
          this.handleError(new Error(`Compression failed: ${error}`));
        }
      };
    } else {
      // Fallback to main thread compression
      frame.imageData = this.canvas!.toDataURL('image/jpeg', this.settings.quality);
      this.addFrameToBuffer(frame);
    }
  }

  private addFrameToBuffer(frame: CaptureFrame) {
    // Add to buffer
    this.frameBuffer.push(frame);
    this.totalSize += frame.metadata.size;

    // Maintain buffer size (keep last 100 frames)
    if (this.frameBuffer.length > 100) {
      const removed = this.frameBuffer.shift();
      if (removed) {
        this.totalSize -= removed.metadata.size;
      }
    }

    // Trigger callback
    if (this.onFrameCaptured) {
      this.onFrameCaptured(frame);
    }
  }

  stopCapture() {
    this.isCapturing = false;

    // Clear interval
    if (this.captureInterval) {
      clearInterval(this.captureInterval);
      this.captureInterval = null;
    }

    // Stop media stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Clean up video
    if (this.video) {
      this.video.srcObject = null;
      this.video = null;
    }

    // Clean up canvas
    this.canvas = null;
    this.context = null;
  }

  // Frame management
  getLatestFrame(): CaptureFrame | null {
    return this.frameBuffer.length > 0 ? this.frameBuffer[this.frameBuffer.length - 1] : null;
  }

  getFrameBuffer(): CaptureFrame[] {
    return [...this.frameBuffer];
  }

  getFramesSince(timestamp: number): CaptureFrame[] {
    return this.frameBuffer.filter(frame => frame.timestamp >= timestamp);
  }

  clearBuffer() {
    this.frameBuffer = [];
    this.totalSize = 0;
  }

  // Settings management
  updateSettings(newSettings: Partial<CaptureSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Restart capture if active to apply new settings
    if (this.isCapturing) {
      this.stopCapture();
      // Note: Caller should restart capture manually
    }
  }

  // Performance monitoring
  getPerformanceMetrics() {
    return {
      frameCount: this.frameCount,
      bufferSize: this.frameBuffer.length,
      totalSize: this.totalSize,
      averageFrameSize: this.frameBuffer.length > 0 ? this.totalSize / this.frameBuffer.length : 0,
      frameRate: this.settings.frameRate,
      isCapturing: this.isCapturing,
      memoryUsage: this.totalSize / (1024 * 1024) // MB
    };
  }

  // Event handlers
  onFrameCapture(callback: (frame: CaptureFrame) => void) {
    this.onFrameCaptured = callback;
  }

  onErrorOccurred(callback: (error: Error) => void) {
    this.onError = callback;
  }

  private handleError(error: Error) {
    console.error('ScreenCaptureService error:', error);
    if (this.onError) {
      this.onError(error);
    }
  }

  // Utility methods
  async captureCurrentFrame(): Promise<CaptureFrame | null> {
    if (!this.video || !this.canvas || !this.context || !this.isCapturing) {
      return null;
    }

    try {
      // Capture single frame
      this.context.drawImage(
        this.video,
        0, 0,
        this.canvas.width,
        this.canvas.height
      );

      const timestamp = Date.now();
      const frameId = `manual_${timestamp}`;
      const imageData = this.canvas.toDataURL('image/jpeg', this.settings.quality);

      return {
        id: frameId,
        timestamp,
        imageData,
        canvas: this.canvas.cloneNode(true) as HTMLCanvasElement,
        metadata: {
          width: this.canvas.width,
          height: this.canvas.height,
          quality: this.settings.quality,
          size: imageData.length
        }
      };
    } catch (error) {
      this.handleError(new Error(`Manual frame capture failed: ${error}`));
      return null;
    }
  }

  // Browser compatibility check
  static isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getDisplayMedia &&
      HTMLCanvasElement.prototype.toDataURL
    );
  }

  // Cleanup
  destroy() {
    this.stopCapture();
    
    if (this.compressionWorker) {
      this.compressionWorker.terminate();
      this.compressionWorker = null;
    }

    this.clearBuffer();
    this.onFrameCaptured = undefined;
    this.onError = undefined;
  }
}

// Export types and service
export default ScreenCaptureService;