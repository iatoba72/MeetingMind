import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Grid,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  IconButton,
  Paper,
  List,
  ListItem,
  ListItemText,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tabs,
  Tab,
  Slider,
  Switch,
  FormControlLabel,
  CircularProgress,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  Upload as UploadIcon,
  Screenshot as ScreenshotIcon,
  TextFields as TextIcon,
  BarChart as ChartIcon,
  TableChart as TableIcon,
  Code as CodeIcon,
  Assignment as DocumentIcon,
  Settings as SettingsIcon,
  PlayArrow as ProcessIcon,
  ExpandMore as ExpandMoreIcon,
  Visibility as PreviewIcon,
  BugReport as TestIcon,
  Assessment as AnalyticsIcon,
  Speed as PerformanceIcon
} from '@mui/icons-material';

import OCRService, { OCRResult, OCRSettings, ImagePreprocessingOptions } from '../services/ocrService';
import ScreenCaptureService from '../services/screenCaptureService';

// Types
interface TestCase {
  id: string;
  name: string;
  description: string;
  image: string; // base64
  expectedText?: string;
  contentType: 'text' | 'table' | 'chart' | 'code' | 'mixed' | 'handwriting';
  difficulty: 'easy' | 'medium' | 'hard';
  language: string;
}

interface TestResult {
  testCaseId: string;
  ocrResult: OCRResult;
  accuracy: number;
  processingTime: number;
  settings: OCRSettings;
  preprocessing: ImagePreprocessingOptions;
  errors: string[];
  suggestions: string[];
}

interface BatchTestResult {
  id: string;
  timestamp: number;
  testCases: string[];
  results: TestResult[];
  overallAccuracy: number;
  averageProcessingTime: number;
  settings: OCRSettings;
  preprocessing: ImagePreprocessingOptions;
}

interface PreprocessingPreview {
  original: string;
  grayscale: string;
  contrast: string;
  brightness: string;
  sharpen: string;
  denoise: string;
}

const VisionLab: React.FC = () => {
  // State
  const [activeTab, setActiveTab] = useState(0);
  const [ocrService] = useState(() => new OCRService(2));
  const [screenCapture] = useState(() => new ScreenCaptureService());
  const [isInitialized, setIsInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // OCR Settings
  const [ocrSettings, setOcrSettings] = useState<OCRSettings>({
    language: 'eng',
    oem: 1, // LSTM_ONLY
    psm: 3,  // AUTO
  });

  // Preprocessing Settings
  const [preprocessing, setPreprocessing] = useState<ImagePreprocessingOptions>({
    grayscale: true,
    contrast: 1.0,
    brightness: 0,
    sharpen: false,
    denoise: false,
    deskew: false
  });

  // Test Cases
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
  const [currentResult, setCurrentResult] = useState<OCRResult | null>(null);
  const [batchResults, setBatchResults] = useState<BatchTestResult[]>([]);

  // UI State
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [preprocessingPreview, setPreprocessingPreview] = useState<PreprocessingPreview | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize OCR service
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        await ocrService.initialize();
        setIsInitialized(true);
      } catch (err) {
        setError('Failed to initialize OCR service');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    const loadDefaults = () => {
      const defaultTestCases: TestCase[] = [
        {
          id: 'text_simple',
          name: 'Simple Text',
          description: 'Clean, high-contrast text document',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          expectedText: 'This is a simple text document with clear, readable fonts.',
          contentType: 'text',
          difficulty: 'easy',
          language: 'eng'
        },
        {
          id: 'table_data',
          name: 'Table with Data',
          description: 'Structured table with numerical data',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          expectedText: 'Name | Age | City\nJohn | 25 | New York\nJane | 30 | Los Angeles',
          contentType: 'table',
          difficulty: 'medium',
          language: 'eng'
        },
        {
          id: 'chart_complex',
          name: 'Chart with Labels',
          description: 'Bar chart with axis labels and legend',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          expectedText: 'Sales Data\nQ1: 100\nQ2: 150\nQ3: 200\nQ4: 175',
          contentType: 'chart',
          difficulty: 'hard',
          language: 'eng'
        },
        {
          id: 'code_snippet',
          name: 'Code Snippet',
          description: 'Programming code with syntax highlighting',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          expectedText: 'function calculate(a, b) {\n  return a + b;\n}',
          contentType: 'code',
          difficulty: 'medium',
          language: 'eng'
        },
        {
          id: 'mixed_content',
          name: 'Mixed Content',
          description: 'Document with text, images, and formatting',
          image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
          expectedText: 'Title: Document Overview\nThis document contains mixed content including text and images.',
          contentType: 'mixed',
          difficulty: 'hard',
          language: 'eng'
        }
      ];

      setTestCases(defaultTestCases);
    };

    initialize();
    loadDefaults();
  }, [ocrService]);


  // File upload handling
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      setUploadedImage(imageData);
      generatePreprocessingPreview(imageData);
    };
    reader.readAsDataURL(file);
  };

  // Screen capture
  const handleScreenCapture = async () => {
    try {
      setLoading(true);
      await screenCapture.startCapture();
      
      // Wait a bit then capture a frame
      setTimeout(async () => {
        const frame = await screenCapture.captureCurrentFrame();
        if (frame) {
          setUploadedImage(frame.imageData);
          generatePreprocessingPreview(frame.imageData);
        }
        screenCapture.stopCapture();
        setLoading(false);
      }, 1000);
    } catch {
      setError('Failed to capture screen');
      setLoading(false);
    }
  };

  // Generate preprocessing preview
  const generatePreprocessingPreview = async (imageData: string) => {
    try {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d')!;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const preview: PreprocessingPreview = {
          original: imageData,
          grayscale: canvas.toDataURL(),
          contrast: canvas.toDataURL(),
          brightness: canvas.toDataURL(),
          sharpen: canvas.toDataURL(),
          denoise: canvas.toDataURL()
        };

        setPreprocessingPreview(preview);
      };
      img.src = imageData;
    } catch (err) {
      console.error('Failed to generate preview:', err);
    }
  };

  // Process image with OCR
  const processImage = async (imageData: string) => {
    if (!isInitialized) {
      setError('OCR service not initialized');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const result = await ocrService.processImage(imageData, preprocessing);
      setCurrentResult(result);
      
    } catch (err) {
      setError('OCR processing failed');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Run test case
  const runTestCase = async (testCase: TestCase): Promise<TestResult> => {
    const startTime = Date.now();
    
    try {
      const ocrResult = await ocrService.processImage(testCase.image, preprocessing);
      const processingTime = Date.now() - startTime;
      
      // Calculate accuracy (simplified)
      const accuracy = testCase.expectedText 
        ? calculateTextSimilarity(ocrResult.text, testCase.expectedText)
        : ocrResult.confidence / 100;

      return {
        testCaseId: testCase.id,
        ocrResult,
        accuracy,
        processingTime,
        settings: ocrSettings,
        preprocessing,
        errors: [],
        suggestions: generateSuggestions(ocrResult, testCase)
      };
    } catch (err) {
      return {
        testCaseId: testCase.id,
        ocrResult: {} as OCRResult,
        accuracy: 0,
        processingTime: Date.now() - startTime,
        settings: ocrSettings,
        preprocessing,
        errors: [err instanceof Error ? err.message : 'Unknown error'],
        suggestions: []
      };
    }
  };

  // Run batch tests
  const runBatchTests = async (selectedTestCases: TestCase[]) => {
    setLoading(true);
    const results: TestResult[] = [];

    for (const testCase of selectedTestCases) {
      const result = await runTestCase(testCase);
      results.push(result);
    }

    const overallAccuracy = results.reduce((sum, r) => sum + r.accuracy, 0) / results.length;
    const averageProcessingTime = results.reduce((sum, r) => sum + r.processingTime, 0) / results.length;

    const batchResult: BatchTestResult = {
      id: `batch_${Date.now()}`,
      timestamp: Date.now(),
      testCases: selectedTestCases.map(tc => tc.id),
      results,
      overallAccuracy,
      averageProcessingTime,
      settings: ocrSettings,
      preprocessing
    };

    setBatchResults(prev => [batchResult, ...prev]);
    setLoading(false);
  };

  // Utility functions
  const calculateTextSimilarity = (text1: string, text2: string): number => {
    // Simple Levenshtein distance-based similarity
    const longer = text1.length > text2.length ? text1 : text2;
    const shorter = text1.length > text2.length ? text2 : text1;
    
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
  };

  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[j][i] = matrix[j - 1][i - 1];
        } else {
          matrix[j][i] = Math.min(
            matrix[j - 1][i - 1] + 1,
            matrix[j][i - 1] + 1,
            matrix[j - 1][i] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  };

  const generateSuggestions = (result: OCRResult, testCase: TestCase): string[] => {
    const suggestions: string[] = [];
    
    if (result.confidence < 80) {
      suggestions.push('Consider improving image quality or preprocessing');
    }
    
    if (testCase.contentType === 'table' && !result.text.includes('\t')) {
      suggestions.push('Enable table-specific OCR settings for better structure detection');
    }
    
    if (testCase.contentType === 'code' && result.confidence < 90) {
      suggestions.push('Use monospace font detection or code-specific preprocessing');
    }
    
    return suggestions;
  };

  // Render methods
  const renderImageInput = () => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Image Input
        </Typography>
        
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item>
            <Button
              variant="outlined"
              startIcon={<UploadIcon />}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload Image
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </Grid>
          <Grid item>
            <Button
              variant="outlined"
              startIcon={<ScreenshotIcon />}
              onClick={handleScreenCapture}
              disabled={loading}
            >
              Capture Screen
            </Button>
          </Grid>
        </Grid>

        {uploadedImage && (
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Uploaded Image
            </Typography>
            <img
              src={uploadedImage}
              alt="Uploaded"
              style={{
                maxWidth: '100%',
                maxHeight: 300,
                border: '1px solid #ddd',
                borderRadius: 4
              }}
            />
            <Box mt={2}>
              <Button
                variant="contained"
                startIcon={<ProcessIcon />}
                onClick={() => processImage(uploadedImage)}
                disabled={loading || !isInitialized}
              >
                {loading ? 'Processing...' : 'Process with OCR'}
              </Button>
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );

  const renderPreprocessingPreview = () => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Preprocessing Preview
        </Typography>
        
        {preprocessingPreview && (
          <Grid container spacing={2}>
            <Grid item xs={6} md={4}>
              <Typography variant="subtitle2">Original</Typography>
              <img src={preprocessingPreview.original} alt="Original" style={{ width: '100%' }} />
            </Grid>
            <Grid item xs={6} md={4}>
              <Typography variant="subtitle2">Grayscale</Typography>
              <img src={preprocessingPreview.grayscale} alt="Grayscale" style={{ width: '100%' }} />
            </Grid>
            <Grid item xs={6} md={4}>
              <Typography variant="subtitle2">Enhanced</Typography>
              <img src={preprocessingPreview.contrast} alt="Enhanced" style={{ width: '100%' }} />
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );

  const renderSettings = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">OCR Settings</Typography>
          <IconButton onClick={() => setShowSettings(!showSettings)}>
            <SettingsIcon />
          </IconButton>
        </Box>

        {showSettings && (
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Language</InputLabel>
                <Select
                  value={ocrSettings.language}
                  onChange={(e) => setOcrSettings(prev => ({ ...prev, language: e.target.value }))}
                >
                  <MenuItem value="eng">English</MenuItem>
                  <MenuItem value="spa">Spanish</MenuItem>
                  <MenuItem value="fra">French</MenuItem>
                  <MenuItem value="deu">German</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>Page Segmentation Mode</InputLabel>
                <Select
                  value={ocrSettings.psm}
                  onChange={(e) => setOcrSettings(prev => ({ ...prev, psm: Number(e.target.value) }))}
                >
                  <MenuItem value={3}>Auto</MenuItem>
                  <MenuItem value={6}>Single Block</MenuItem>
                  <MenuItem value={7}>Single Line</MenuItem>
                  <MenuItem value={8}>Single Word</MenuItem>
                  <MenuItem value={13}>Raw line</MenuItem>
                </Select>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <Typography gutterBottom>Preprocessing Options</Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={preprocessing.grayscale}
                    onChange={(e) => setPreprocessing(prev => ({ ...prev, grayscale: e.target.checked }))}
                  />
                }
                label="Grayscale"
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControlLabel
                control={
                  <Switch
                    checked={preprocessing.sharpen}
                    onChange={(e) => setPreprocessing(prev => ({ ...prev, sharpen: e.target.checked }))}
                  />
                }
                label="Sharpen"
              />
            </Grid>

            <Grid item xs={12}>
              <Typography gutterBottom>Contrast: {preprocessing.contrast}</Typography>
              <Slider
                value={preprocessing.contrast}
                onChange={(_, value) => setPreprocessing(prev => ({ ...prev, contrast: value as number }))}
                min={0.5}
                max={3}
                step={0.1}
                valueLabelDisplay="auto"
              />
            </Grid>

            <Grid item xs={12}>
              <Typography gutterBottom>Brightness: {preprocessing.brightness}</Typography>
              <Slider
                value={preprocessing.brightness}
                onChange={(_, value) => setPreprocessing(prev => ({ ...prev, brightness: value as number }))}
                min={-100}
                max={100}
                step={5}
                valueLabelDisplay="auto"
              />
            </Grid>
          </Grid>
        )}
      </CardContent>
    </Card>
  );

  const renderResults = () => (
    currentResult && (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            OCR Results
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={8}>
              <Typography variant="subtitle2" gutterBottom>
                Extracted Text
              </Typography>
              <Paper sx={{ p: 2, bgcolor: 'grey.50', minHeight: 100 }}>
                <Typography variant="body2" style={{ whiteSpace: 'pre-wrap' }}>
                  {currentResult.text || 'No text detected'}
                </Typography>
              </Paper>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" gutterBottom>
                Metrics
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemText 
                    primary="Confidence" 
                    secondary={`${Math.round(currentResult.confidence)}%`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Processing Time" 
                    secondary={`${Math.round(currentResult.processingTime)}ms`}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Words Detected" 
                    secondary={currentResult.words.length}
                  />
                </ListItem>
                <ListItem>
                  <ListItemText 
                    primary="Lines Detected" 
                    secondary={currentResult.lines.length}
                  />
                </ListItem>
              </List>
            </Grid>
          </Grid>

          {currentResult.words.length > 0 && (
            <Box mt={2}>
              <Typography variant="subtitle2" gutterBottom>
                Word-level Analysis
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Word</TableCell>
                      <TableCell>Confidence</TableCell>
                      <TableCell>Position</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {currentResult.words.slice(0, 10).map((word, index) => (
                      <TableRow key={index}>
                        <TableCell>{word.text}</TableCell>
                        <TableCell>{Math.round(word.confidence)}%</TableCell>
                        <TableCell>
                          {Math.round(word.bbox.x0)}, {Math.round(word.bbox.y0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          )}
        </CardContent>
      </Card>
    )
  );

  const renderTestCases = () => (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">Test Cases</Typography>
          <Button
            variant="contained"
            startIcon={<TestIcon />}
            onClick={() => runBatchTests(testCases)}
            disabled={loading || !isInitialized}
          >
            Run All Tests
          </Button>
        </Box>

        <Grid container spacing={2}>
          {testCases.map((testCase) => (
            <Grid item xs={12} md={6} lg={4} key={testCase.id}>
              <Card 
                variant={selectedTestCase?.id === testCase.id ? "elevation" : "outlined"}
                sx={{ cursor: 'pointer', height: '100%' }}
                onClick={() => setSelectedTestCase(testCase)}
              >
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
                    <Typography variant="subtitle1">
                      {testCase.name}
                    </Typography>
                    <Chip 
                      label={testCase.difficulty}
                      size="small"
                      color={testCase.difficulty === 'easy' ? 'success' : 
                             testCase.difficulty === 'medium' ? 'warning' : 'error'}
                    />
                  </Box>
                  
                  <Typography variant="body2" color="text.secondary" mb={2}>
                    {testCase.description}
                  </Typography>
                  
                  <Box display="flex" gap={1} mb={2}>
                    <Chip 
                      label={testCase.contentType}
                      size="small"
                      icon={
                        testCase.contentType === 'text' ? <TextIcon /> :
                        testCase.contentType === 'table' ? <TableIcon /> :
                        testCase.contentType === 'chart' ? <ChartIcon /> :
                        testCase.contentType === 'code' ? <CodeIcon /> :
                        <DocumentIcon />
                      }
                    />
                    <Chip label={testCase.language} size="small" variant="outlined" />
                  </Box>

                  <img
                    src={testCase.image}
                    alt={testCase.name}
                    style={{
                      width: '100%',
                      height: 100,
                      objectFit: 'cover',
                      borderRadius: 4,
                      border: '1px solid #ddd'
                    }}
                  />

                  <Box mt={2}>
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={(e) => {
                        e.stopPropagation();
                        runTestCase(testCase);
                      }}
                      disabled={loading}
                    >
                      Run Test
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </CardContent>
    </Card>
  );

  const renderBatchResults = () => (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Batch Test Results
        </Typography>

        {batchResults.map((batch) => (
          <Accordion key={batch.id}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box display="flex" alignItems="center" width="100%">
                <Typography sx={{ flexGrow: 1 }}>
                  {new Date(batch.timestamp).toLocaleString()}
                </Typography>
                <Chip 
                  label={`${Math.round(batch.overallAccuracy * 100)}% accuracy`}
                  color={batch.overallAccuracy > 0.8 ? 'success' : 'warning'}
                />
                <Typography variant="body2" sx={{ ml: 2 }}>
                  {Math.round(batch.averageProcessingTime)}ms avg
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Test Case</TableCell>
                      <TableCell>Accuracy</TableCell>
                      <TableCell>Processing Time</TableCell>
                      <TableCell>Confidence</TableCell>
                      <TableCell>Errors</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {batch.results.map((result) => (
                      <TableRow key={result.testCaseId}>
                        <TableCell>{result.testCaseId}</TableCell>
                        <TableCell>{Math.round(result.accuracy * 100)}%</TableCell>
                        <TableCell>{Math.round(result.processingTime)}ms</TableCell>
                        <TableCell>{Math.round(result.ocrResult.confidence || 0)}%</TableCell>
                        <TableCell>
                          {result.errors.length > 0 ? (
                            <Chip label={`${result.errors.length} errors`} size="small" color="error" />
                          ) : (
                            <Chip label="None" size="small" color="success" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </AccordionDetails>
          </Accordion>
        ))}
      </CardContent>
    </Card>
  );

  if (!isInitialized && loading) {
    return (
      <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="60vh">
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ mt: 2 }}>
          Initializing Vision Lab...
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Loading Tesseract.js and OCR models
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Box display="flex" alignItems="center" mb={3}>
        <TestIcon sx={{ mr: 2, fontSize: 32 }} />
        <Box>
          <Typography variant="h4">Vision Lab</Typography>
          <Typography variant="body1" color="text.secondary">
            Test and optimize OCR performance on different content types
          </Typography>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Tabs value={activeTab} onChange={(_, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
        <Tab label="Interactive Testing" icon={<PreviewIcon />} iconPosition="start" />
        <Tab label="Test Cases" icon={<TestIcon />} iconPosition="start" />
        <Tab label="Batch Results" icon={<AnalyticsIcon />} iconPosition="start" />
        <Tab label="Performance" icon={<PerformanceIcon />} iconPosition="start" />
      </Tabs>

      {loading && (
        <LinearProgress sx={{ mb: 2 }} />
      )}

      {activeTab === 0 && (
        <Grid container spacing={3}>
          <Grid item xs={12} lg={6}>
            {renderImageInput()}
            <Box mt={2}>
              {renderSettings()}
            </Box>
          </Grid>
          <Grid item xs={12} lg={6}>
            {uploadedImage && renderPreprocessingPreview()}
            <Box mt={2}>
              {renderResults()}
            </Box>
          </Grid>
        </Grid>
      )}

      {activeTab === 1 && renderTestCases()}
      {activeTab === 2 && renderBatchResults()}
      {activeTab === 3 && (
        <Card>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Performance Analysis
            </Typography>
            <Typography variant="body2">
              Performance metrics and optimization recommendations will be displayed here.
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
};

export default VisionLab;