# Project Architecture Documentation

## Core Audio Processing Modules

### 1. `audio-processor.js`
**Primary Role**: Raw Audio Capture
- Implements `AudioWorkletProcessor` for low-level audio capture
- Buffers incoming audio data in fixed-size chunks (2000 samples)
- Sends audio chunks to main thread via `postMessage`
- Runs in a separate thread for efficient audio processing

### 2. `AudioSegmentProcessor.js`
**Primary Role**: Speech Detection & Segmentation
- Analyzes audio data to detect speech segments
- Calculates energy levels and applies thresholds
- Implements speech detection algorithm with:
  - Energy threshold detection
  - Silence detection
  - Hysteresis for stable detection
  - DC offset removal
- Creates speech segments when speech is detected
- Manages timing and duration of segments

### 3. `AudioManager.js`
**Primary Role**: Audio Processing Orchestration
- Coordinates between audio capture and speech detection
- Manages audio processing state
- Handles audio buffer processing
- Coordinates segment creation and management
- Provides interface for parameter adjustments
- Manages callbacks for UI updates

### 4. `SpeechSegment.js`
**Primary Role**: Data Structure
- Defines the structure for speech segments
- Stores segment metadata:
  - Start/end times
  - Energy levels
  - Audio data
  - Processing status
  - Transcription results

## Visualization Components

### 1. `BufferVisualizer.jsx`
**Primary Role**: Audio Waveform Visualization
- Renders audio waveform on canvas
- Displays detected speech segments
- Shows time markers
- Visualizes processed vs unprocessed segments
- Handles real-time updates of audio data

### 2. `AudioVisualizer.jsx`
**Primary Role**: Control Panel & Parameters
- Provides UI for parameter adjustment
- Displays current audio metrics:
  - Energy levels
  - Average energy
  - Peak values
- Contains controls for:
  - Energy threshold
  - Silence length
  - Speech hangover
  - Energy scale
  - Hysteresis ratio

### 3. `StatsWidget.jsx`
**Primary Role**: Statistics Display
- Shows buffer statistics
- Displays segment counts
- Shows total duration
- Monitors active/processed segments

## Application Control

### 1. `App.jsx`
**Primary Role**: Application Orchestration
- Manages application state
- Coordinates between components
- Handles model loading
- Manages audio recording state
- Coordinates transcription process
- Handles language selection
- Manages UI state and updates

### 2. `worker.js`
**Primary Role**: ML Model Processing
- Runs Whisper model in WebGPU
- Handles model loading and initialization
- Processes speech segments for transcription
- Manages model state and processing queue
- Communicates results back to main thread

## Data Flow

1. **Audio Capture**:
