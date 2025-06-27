// OCR Service
// Client-side OCR using Tesseract.js with optimization and caching

import { createWorker, createScheduler, PSM, OEM } from 'tesseract.js';
import type { Worker, Scheduler } from 'tesseract.js';

export interface OCRResult {
  id: string;
  text: string;
  confidence: number;
  words: OCRWord[];
  lines: OCRLine[];
  paragraphs: OCRParagraph[];
  blocks: OCRBlock[];
  processingTime: number;
  imageMetadata: {
    width: number;
    height: number;
    source: string;
  };
}

export interface OCRWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
  fontInfo?: {
    size: number;
    family: string;
    bold: boolean;
    italic: boolean;
  };
}

export interface OCRLine {
  text: string;
  confidence: number;
  words: OCRWord[];
  bbox: BoundingBox;
}

export interface OCRParagraph {
  text: string;
  confidence: number;
  lines: OCRLine[];
  bbox: BoundingBox;
}

export interface OCRBlock {
  text: string;
  confidence: number;
  paragraphs: OCRParagraph[];
  bbox: BoundingBox;
  blockType: 'text' | 'image' | 'table' | 'separator';
}

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  width: number;
  height: number;
}

export interface OCRSettings {
  language: string;
  oem: OEM; // OCR Engine Mode
  psm: PSM; // Page Segmentation Mode
  whitelist?: string; // Character whitelist
  blacklist?: string; // Character blacklist
  tessedit_char_whitelist?: string;
  preserve_interword_spaces?: string;
  user_defined_dpi?: string;
}

export interface ImagePreprocessingOptions {
  grayscale: boolean;
  contrast: number;
  brightness: number;
  sharpen: boolean;
  denoise: boolean;
  deskew: boolean;
  resize?: {
    width: number;
    height: number;
    maintainAspectRatio: boolean;
  };
}

export class OCRService {
  private workers: Worker[] = [];
  private scheduler: Scheduler | null = null;
  private isInitialized = false;
  private cache = new Map<string, OCRResult>();
  private settings: OCRSettings;
  private workerCount: number;
  private initializationPromise: Promise<void> | null = null;

  // Performance tracking
  private stats = {
    totalProcessed: 0,
    totalTime: 0,
    averageTime: 0,
    cacheHits: 0,
    cacheMisses: 0
  };

  constructor(workerCount: number = 2, settings: Partial<OCRSettings> = {}) {
    this.workerCount = workerCount;
    this.settings = {
      language: 'eng',
      oem: OEM.LSTM_ONLY,
      psm: PSM.AUTO,
      ...settings
    };
  }

  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  private async _initialize(): Promise<void> {
    try {
      console.log('Initializing OCR Service with', this.workerCount, 'workers');

      // Create workers
      for (let i = 0; i < this.workerCount; i++) {
        const worker = await createWorker();
        await worker.loadLanguage(this.settings.language);
        await worker.initialize(this.settings.language);
        await worker.setParameters(this.settings);
        this.workers.push(worker);
      }

      // Create scheduler for load balancing
      this.scheduler = createScheduler();
      this.workers.forEach(worker => {
        this.scheduler!.addWorker(worker);
      });

      this.isInitialized = true;
      console.log('OCR Service initialized successfully');

    } catch (error) {
      console.error('Failed to initialize OCR Service:', error);
      throw error;
    }
  }

  async processImage(
    imageSource: string | HTMLImageElement | HTMLCanvasElement | File,
    options: Partial<ImagePreprocessingOptions> = {}
  ): Promise<OCRResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const startTime = Date.now();
    
    // Generate cache key
    const cacheKey = await this.generateCacheKey(imageSource, options);
    
    // Check cache
    if (this.cache.has(cacheKey)) {
      this.stats.cacheHits++;
      return this.cache.get(cacheKey)!;
    }

    this.stats.cacheMisses++;

    try {
      // Preprocess image
      const processedImage = await this.preprocessImage(imageSource, options);
      
      // Perform OCR
      const result = await this.performOCR(processedImage, cacheKey);
      
      // Update stats
      const processingTime = Date.now() - startTime;
      this.updateStats(processingTime);
      
      // Cache result
      this.cache.set(cacheKey, result);
      
      return result;

    } catch (error) {
      console.error('OCR processing failed:', error);
      throw error;
    }
  }

  private async performOCR(imageSource: any, id: string): Promise<OCRResult> {
    const startTime = Date.now();

    const { data } = await this.scheduler!.addJob('recognize', imageSource, {
      logger: m => console.log(m)
    });

    const processingTime = Date.now() - startTime;

    // Extract structured data
    const words = this.extractWords(data);
    const lines = this.extractLines(data);
    const paragraphs = this.extractParagraphs(data);
    const blocks = this.extractBlocks(data);

    // Get image metadata
    let imageMetadata = { width: 0, height: 0, source: 'unknown' };
    if (imageSource instanceof HTMLCanvasElement) {
      imageMetadata = {
        width: imageSource.width,
        height: imageSource.height,
        source: 'canvas'
      };
    } else if (imageSource instanceof HTMLImageElement) {
      imageMetadata = {
        width: imageSource.naturalWidth,
        height: imageSource.naturalHeight,
        source: 'image'
      };
    }

    return {
      id,
      text: data.text,
      confidence: data.confidence,
      words,
      lines,
      paragraphs,
      blocks,
      processingTime,
      imageMetadata
    };
  }

  private async preprocessImage(
    imageSource: string | HTMLImageElement | HTMLCanvasElement | File,
    options: Partial<ImagePreprocessingOptions>
  ): Promise<HTMLCanvasElement> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    let image: HTMLImageElement;

    // Convert source to image
    if (typeof imageSource === 'string') {
      image = new Image();
      image.src = imageSource;
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    } else if (imageSource instanceof HTMLCanvasElement) {
      // Convert canvas to image
      image = new Image();
      image.src = imageSource.toDataURL();
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    } else if (imageSource instanceof File) {
      image = new Image();
      image.src = URL.createObjectURL(imageSource);
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
      });
    } else {
      image = imageSource;
    }

    // Set canvas size
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;

    // Apply resize if specified
    if (options.resize) {
      if (options.resize.maintainAspectRatio) {
        const aspectRatio = width / height;
        if (width > height) {
          width = options.resize.width;
          height = width / aspectRatio;
        } else {
          height = options.resize.height;
          width = height * aspectRatio;
        }
      } else {
        width = options.resize.width;
        height = options.resize.height;
      }
    }

    canvas.width = width;
    canvas.height = height;

    // Draw image
    ctx.drawImage(image, 0, 0, width, height);

    // Apply preprocessing filters
    if (options.grayscale) {
      this.applyGrayscale(ctx, width, height);
    }

    if (options.contrast !== undefined && options.contrast !== 1) {
      this.applyContrast(ctx, width, height, options.contrast);
    }

    if (options.brightness !== undefined && options.brightness !== 0) {
      this.applyBrightness(ctx, width, height, options.brightness);
    }

    if (options.sharpen) {
      this.applySharpen(ctx, width, height);
    }

    if (options.denoise) {
      this.applyDenoise(ctx, width, height);
    }

    return canvas;
  }

  // Image processing filters
  private applyGrayscale(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private applyContrast(ctx: CanvasRenderingContext2D, width: number, height: number, contrast: number) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let i = 0; i < data.length; i += 4) {
      data[i] = factor * (data[i] - 128) + 128;
      data[i + 1] = factor * (data[i + 1] - 128) + 128;
      data[i + 2] = factor * (data[i + 2] - 128) + 128;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private applyBrightness(ctx: CanvasRenderingContext2D, width: number, height: number, brightness: number) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      data[i] += brightness;
      data[i + 1] += brightness;
      data[i + 2] += brightness;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private applySharpen(ctx: CanvasRenderingContext2D, width: number, height: number) {
    // Simple sharpen filter
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);

    const kernel = [
      0, -1, 0,
      -1, 5, -1,
      0, -1, 0
    ];

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              sum += copy[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
            }
          }
          const idx = (y * width + x) * 4 + c;
          data[idx] = Math.max(0, Math.min(255, sum));
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  private applyDenoise(ctx: CanvasRenderingContext2D, width: number, height: number) {
    // Simple median filter for noise reduction
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const copy = new Uint8ClampedArray(data);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        for (let c = 0; c < 3; c++) {
          const values = [];
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4 + c;
              values.push(copy[idx]);
            }
          }
          values.sort((a, b) => a - b);
          const idx = (y * width + x) * 4 + c;
          data[idx] = values[4]; // median
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  // Data extraction helpers
  private extractWords(data: any): OCRWord[] {
    return data.words.map((word: any) => ({
      text: word.text,
      confidence: word.confidence,
      bbox: this.createBoundingBox(word.bbox),
      fontInfo: word.font_name ? {
        size: word.font_size || 12,
        family: word.font_name,
        bold: word.bold || false,
        italic: word.italic || false
      } : undefined
    }));
  }

  private extractLines(data: any): OCRLine[] {
    return data.lines.map((line: any) => ({
      text: line.text,
      confidence: line.confidence,
      words: line.words.map((word: any) => ({
        text: word.text,
        confidence: word.confidence,
        bbox: this.createBoundingBox(word.bbox)
      })),
      bbox: this.createBoundingBox(line.bbox)
    }));
  }

  private extractParagraphs(data: any): OCRParagraph[] {
    return data.paragraphs.map((paragraph: any) => ({
      text: paragraph.text,
      confidence: paragraph.confidence,
      lines: paragraph.lines.map((line: any) => ({
        text: line.text,
        confidence: line.confidence,
        words: line.words.map((word: any) => ({
          text: word.text,
          confidence: word.confidence,
          bbox: this.createBoundingBox(word.bbox)
        })),
        bbox: this.createBoundingBox(line.bbox)
      })),
      bbox: this.createBoundingBox(paragraph.bbox)
    }));
  }

  private extractBlocks(data: any): OCRBlock[] {
    return data.blocks.map((block: any) => ({
      text: block.text,
      confidence: block.confidence,
      paragraphs: block.paragraphs.map((paragraph: any) => ({
        text: paragraph.text,
        confidence: paragraph.confidence,
        lines: paragraph.lines.map((line: any) => ({
          text: line.text,
          confidence: line.confidence,
          words: line.words.map((word: any) => ({
            text: word.text,
            confidence: word.confidence,
            bbox: this.createBoundingBox(word.bbox)
          })),
          bbox: this.createBoundingBox(line.bbox)
        })),
        bbox: this.createBoundingBox(paragraph.bbox)
      })),
      bbox: this.createBoundingBox(block.bbox),
      blockType: this.determineBlockType(block)
    }));
  }

  private createBoundingBox(bbox: any): BoundingBox {
    return {
      x0: bbox.x0,
      y0: bbox.y0,
      x1: bbox.x1,
      y1: bbox.y1,
      width: bbox.x1 - bbox.x0,
      height: bbox.y1 - bbox.y0
    };
  }

  private determineBlockType(block: any): 'text' | 'image' | 'table' | 'separator' {
    // Simple heuristic - in practice, this would be more sophisticated
    if (block.text.trim().length === 0) return 'separator';
    if (block.text.includes('\t') || (block.lines && block.lines.length > 3)) return 'table';
    return 'text';
  }

  // Cache management
  private async generateCacheKey(
    imageSource: string | HTMLImageElement | HTMLCanvasElement | File,
    options: Partial<ImagePreprocessingOptions>
  ): Promise<string> {
    // Simple hash generation for caching
    const optionsStr = JSON.stringify(options);
    let sourceStr = '';

    if (typeof imageSource === 'string') {
      sourceStr = imageSource;
    } else if (imageSource instanceof HTMLCanvasElement) {
      sourceStr = imageSource.toDataURL();
    } else if (imageSource instanceof File) {
      sourceStr = `${imageSource.name}_${imageSource.size}_${imageSource.lastModified}`;
    } else {
      sourceStr = imageSource.src || 'unknown';
    }

    // Simple hash function
    const str = sourceStr + optionsStr;
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `ocr_${Math.abs(hash)}`;
  }

  private updateStats(processingTime: number) {
    this.stats.totalProcessed++;
    this.stats.totalTime += processingTime;
    this.stats.averageTime = this.stats.totalTime / this.stats.totalProcessed;
  }

  // Public API methods
  async updateSettings(newSettings: Partial<OCRSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    
    // Update all workers
    for (const worker of this.workers) {
      await worker.setParameters(this.settings);
    }
  }

  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
      isInitialized: this.isInitialized,
      workerCount: this.workers.length
    };
  }

  clearCache() {
    this.cache.clear();
  }

  // Specialized OCR methods
  async extractTextFromSlide(canvas: HTMLCanvasElement): Promise<string> {
    const result = await this.processImage(canvas, {
      grayscale: true,
      contrast: 1.2,
      sharpen: true,
      denoise: true
    });

    // Filter out low-confidence results
    return result.words
      .filter(word => word.confidence > 60)
      .map(word => word.text)
      .join(' ');
  }

  async detectHeadings(canvas: HTMLCanvasElement): Promise<OCRWord[]> {
    const result = await this.processImage(canvas);
    
    // Heuristic for heading detection (larger font, higher position)
    return result.words.filter(word => 
      word.confidence > 70 &&
      (word.fontInfo?.size || 0) > 16 &&
      word.bbox.y0 < canvas.height * 0.3
    );
  }

  async extractTableData(canvas: HTMLCanvasElement): Promise<string[][]> {
    const result = await this.processImage(canvas, {
      grayscale: true,
      contrast: 1.1,
      sharpen: true
    });

    // Group words by lines and columns
    const lines = result.lines.sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const table: string[][] = [];

    for (const line of lines) {
      const words = line.words.sort((a, b) => a.bbox.x0 - b.bbox.x0);
      const row = words.map(word => word.text);
      if (row.length > 0) {
        table.push(row);
      }
    }

    return table;
  }

  // Cleanup
  async terminate() {
    if (this.scheduler) {
      await this.scheduler.terminate();
      this.scheduler = null;
    }

    for (const worker of this.workers) {
      await worker.terminate();
    }

    this.workers = [];
    this.isInitialized = false;
    this.cache.clear();
  }
}

export default OCRService;