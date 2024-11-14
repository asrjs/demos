import { AudioSegmentProcessor } from './AudioSegmentProcessor';

/**
 * Singleton class to manage audio state and processing across components
 * @class AudioManager
 */
export class AudioManager {
    static instance = null;
    
    constructor() {
        if (AudioManager.instance) {
            return AudioManager.instance;
        }
        
        this.audioContext = null;
        this.audioBuffer = new Float32Array(0);
        this.chunks = [];
        this.segments = [];
        this.metrics = {
            currentEnergy: 0,
            averageEnergy: 0,
            peakEnergy: 0,
            totalDuration: 0
        };
        this.processor = null;
        this.listeners = new Set();
        this.initialized = false;
        
        this.parameters = {
            threshold: 0.02,
            silenceLength: 0.2,
            speechHangover: 0.2,
            energyScale: 2.0,
            hysteresisRatio: 1.2,
            minSpeechDuration: 0.1
        };
        
        // Add better tracking for processed audio
        this.lastProcessedSampleIndex = 0;
        this.processedSegments = new Set(); // Track unique segments
        this.processingInterval = 250; // Process every 1 second instead of every chunk
        this.lastProcessTime = 0;
        
        // Add tracking for last processed position
        this.lastProcessedTime = 0;
        this.processedSegments = new Set(); // Track processed segments
        
        AudioManager.instance = this;
    }

    /**
     * Initialize audio context and processor
     * @param {Object} options - Configuration options
     * @param {number} options.sampleRate - Sample rate for audio processing
     * @param {Function} options.onSegmentDetected - Callback for new segments
     */
    async initialize(options = {}) {
        if (this.initialized) return;

        try {
            this.options = options;
            this.processor = new AudioSegmentProcessor({
                sampleRate: options.sampleRate || 16000,
                onSegmentDetected: this.handleNewSegment.bind(this)
            });
            
            this.initialized = true;
            this.notifyListeners('initialized');
        } catch (error) {
            console.error('Failed to initialize AudioManager:', error);
            throw error;
        }
    }

    /**
     * Start audio context (must be called after user gesture)
     */
    async startAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new AudioContext({ 
                sampleRate: this.options?.sampleRate || 16000 
            });
        }
        
        if (this.audioContext.state !== 'running') {
            await this.audioContext.resume();
        }
        
        this.notifyListeners('audioContextStarted');
    }

    /**
     * Add new audio chunk to buffer
     * @param {Float32Array} chunk - New audio data
     */
    addChunk(chunk) {
        // Keep fixed buffer size (e.g., 90 seconds)
        const maxSamples = 90 * this.audioContext.sampleRate;
        this.chunks.push(chunk);
        
        // Update total buffer
        const newBuffer = new Float32Array(this.chunks.reduce((acc, c) => acc + c.length, 0));
        let offset = 0;
        for (const c of this.chunks) {
            newBuffer.set(c, offset);
            offset += c.length;
        }
        
        // Trim if too long
        if (newBuffer.length > maxSamples) {
            this.audioBuffer = newBuffer.slice(-maxSamples);
            // Also trim chunks
            while (this.getChunksDuration() > 90) {
                this.chunks.shift();
            }
        } else {
            this.audioBuffer = newBuffer;
        }

        this.notifyListeners('bufferUpdated');
    }

    /**
     * Get duration of current chunks in seconds
     * @returns {number} Duration in seconds
     */
    getChunksDuration() {
        return this.chunks.reduce((acc, c) => acc + c.length, 0) / this.audioContext.sampleRate;
    }

    /**
     * Subscribe to audio state changes
     * @param {Function} callback - Listener callback
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of state change
     * @param {string} event - Event type
     * @param {*} data - Event data
     */
    notifyListeners(event, data) {
        this.listeners.forEach(listener => listener(event, data));
    }

    /**
     * Handle new segment detection
     * @param {Object} segment - Detected speech segment
     */
    handleNewSegment(segment) {
        this.segments.push(segment);
        this.notifyListeners('newSegment', segment);
    }

    /**
     * Get current audio metrics
     * @returns {Object} Current audio metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Reset all state
     */
    reset() {
        this.audioBuffer = new Float32Array(0);
        this.chunks = [];
        this.segments = [];
        this.metrics = {
            currentEnergy: 0,
            averageEnergy: 0,
            peakEnergy: 0,
            totalDuration: 0
        };
        this.lastProcessedSampleIndex = 0;
        this.processedSegments.clear();
        this.notifyListeners('reset');
    }

    /**
     * Set energy threshold
     * @param {number} threshold - New threshold value
     */
    setThreshold(threshold) {
        this.parameters.threshold = threshold;
        if (this.processor) {
            this.processor.setThreshold(threshold);
        }
        this.notifyListeners('parameterChanged', { type: 'threshold', value: threshold });
    }

    /**
     * Set silence length
     * @param {number} length - New silence length in seconds
     */
    setSilenceLength(length) {
        this.parameters.silenceLength = length;
        if (this.processor) {
            this.processor.setSilenceLength(length);
        }
        this.notifyListeners('parameterChanged', { type: 'silenceLength', value: length });
    }

    /**
     * Set speech hangover
     * @param {number} hangover - New hangover time in seconds
     */
    setSpeechHangover(hangover) {
        this.parameters.speechHangover = hangover;
        if (this.processor) {
            this.processor.options.speechHangover = hangover;
        }
        this.notifyListeners('parameterChanged', { type: 'speechHangover', value: hangover });
    }

    /**
     * Set energy scale
     * @param {number} scale - New energy scale value
     */
    setEnergyScale(scale) {
        this.parameters.energyScale = scale;
        if (this.processor) {
            this.processor.options.energyScale = scale;
        }
        this.notifyListeners('parameterChanged', { type: 'energyScale', value: scale });
    }

    /**
     * Set hysteresis ratio
     * @param {number} ratio - New hysteresis ratio
     */
    setHysteresisRatio(ratio) {
        this.parameters.hysteresisRatio = ratio;
        if (this.processor) {
            this.processor.options.hysteresisRatio = ratio;
        }
        this.notifyListeners('parameterChanged', { type: 'hysteresisRatio', value: ratio });
    }

    /**
     * Set minimum speech duration
     * @param {number} duration - New minimum duration in seconds
     */
    setMinSpeechDuration(duration) {
        this.parameters.minSpeechDuration = duration;
        if (this.processor) {
            this.processor.options.minSpeechDuration = duration;
        }
        this.notifyListeners('parameterChanged', { type: 'minSpeechDuration', value: duration });
    }

    /**
     * Update all parameters at once
     * @param {Object} params - Object containing parameter updates
     */
    updateParameters(params) {
        Object.entries(params).forEach(([key, value]) => {
            if (typeof this[`set${key.charAt(0).toUpperCase() + key.slice(1)}`] === 'function') {
                this[`set${key.charAt(0).toUpperCase() + key.slice(1)}`](value);
            }
        });
    }

    /**
     * Get current parameters
     * @returns {Object} Current parameters
     */
    getParameters() {
        return { ...this.parameters };
    }

    /**
     * Process audio buffer for speech detection
     * @param {AudioBuffer|Object} audioBuffer - Audio buffer to process
     * @param {number} bufferStartTime - Start time of the buffer
     * @returns {Promise<Array>} Detected speech segments
     */
    async processAudioBuffer(audioBuffer, bufferStartTime) {
        if (!this.processor) {
            console.warn('AudioProcessor not initialized');
            return [];
        }

        try {
            const audioData = audioBuffer.getChannelData ? 
                audioBuffer.getChannelData(0) : 
                audioBuffer.audioData || audioBuffer;

            // Log processing attempt
            console.log('Processing audio buffer:', {
                startTime: bufferStartTime.toFixed(2),
                duration: (audioData.length / this.audioContext.sampleRate).toFixed(2),
                samples: audioData.length
            });

            const segments = this.processor.processAudioData(audioData, bufferStartTime);

            // Filter out duplicate segments with improved overlap handling
            const newSegments = segments.filter(segment => {
                const segmentKey = `${segment.startTime.toFixed(3)}-${segment.endTime.toFixed(3)}`;
                
                // Check for duplicates with tolerance
                const tolerance = 0.1; // 100ms tolerance
                const isDuplicate = Array.from(this.processedSegments).some(key => {
                    const [existingStart, existingEnd] = key.split('-').map(Number);
                    const overlap = !(
                        segment.endTime + tolerance < existingStart || 
                        segment.startTime - tolerance > existingEnd
                    );
                    return overlap;
                });

                if (!isDuplicate) {
                    this.processedSegments.add(segmentKey);
                    return true;
                }
                return false;
            });

            if (newSegments.length > 0) {
                this.segments.push(...newSegments);
                newSegments.forEach(segment => {
                    this.notifyListeners('newSegment', segment);
                });

                console.log('Found new speech segments:', {
                    count: newSegments.length,
                    segments: newSegments.map(s => ({
                        start: s.startTime.toFixed(2),
                        end: s.endTime.toFixed(2),
                        duration: (s.endTime - s.startTime).toFixed(2)
                    })),
                    bufferStartTime: bufferStartTime.toFixed(2)
                });
            }

            return newSegments;
        } catch (error) {
            console.error('Error processing audio buffer:', error);
            return [];
        }
    }

    /**
     * Process new chunk of audio data
     * @param {Float32Array} chunk - New audio chunk
     */
    async processNewChunk(chunk) {
        this.addChunk(chunk);
        
        const currentTime = Date.now();
        if (currentTime - this.lastProcessTime < this.processingInterval) {
            return;
        }
        this.lastProcessTime = currentTime;

        try {
            const sampleRate = this.audioContext.sampleRate;
            const totalSamples = this.audioBuffer.length;
            const currentBufferTime = totalSamples / sampleRate;
            
            // Find start position based on last processed segment
            let startTime = this.lastProcessedTime;
            
            // Add overlap to catch segments that might start before the last processed time
            const overlapSeconds = 0.5; // 500ms overlap
            startTime = Math.max(0, startTime - overlapSeconds);
            
            // Convert time to samples
            const startIndex = Math.floor(startTime * sampleRate);
            
            // Process in smaller windows to avoid missing segments
            const windowSize = 2 * sampleRate; // 2 second windows
            const overlap = 0.5 * sampleRate; // 500ms overlap between windows
            
            if (startIndex < totalSamples) {
                const audioToProcess = this.audioBuffer.slice(startIndex);
                let processedLength = 0;
                
                // Process audio in smaller windows
                while (processedLength < audioToProcess.length) {
                    const windowStart = processedLength;
                    const windowEnd = Math.min(windowStart + windowSize, audioToProcess.length);
                    const windowAudio = audioToProcess.slice(windowStart, windowEnd);
                    
                    const windowStartTime = startTime + (windowStart / sampleRate);
                    
                    console.log('Processing window:', {
                        windowStartTime: windowStartTime.toFixed(2),
                        windowDuration: (windowAudio.length / sampleRate).toFixed(2),
                        samples: windowAudio.length
                    });

                    // Process the window
                    const newSegments = await this.processAudioBuffer({
                        getChannelData: () => windowAudio,
                        sampleRate: sampleRate,
                        length: windowAudio.length
                    }, windowStartTime);

                    // Move to next window with overlap
                    processedLength += (windowSize - overlap);
                    
                    // Update last processed time, accounting for the overlap in the next window
                    this.lastProcessedTime = windowStartTime + (windowAudio.length / sampleRate) - (overlap / sampleRate);
                }

                console.log('Finished processing chunk:', {
                    startTime: startTime.toFixed(2),
                    endTime: this.lastProcessedTime.toFixed(2),
                    duration: ((totalSamples - startIndex) / sampleRate).toFixed(2)
                });
            }
        } catch (error) {
            console.error('Error in processNewChunk:', error);
        }
    }

    /**
     * Check if a segment overlaps with processed segments
     * @param {Object} segment - Speech segment to check
     * @param {number} tolerance - Tolerance for overlap in seconds
     * @returns {boolean} True if the segment is processed, false otherwise
     */
    isSegmentProcessed(segment, tolerance = 0.1) {
        const segmentKey = `${segment.startTime.toFixed(3)}-${segment.endTime.toFixed(3)}`;
        
        // Check for duplicates with tolerance
        return Array.from(this.processedSegments).some(key => {
            const [existingStart, existingEnd] = key.split('-').map(Number);
            return !(segment.endTime + tolerance < existingStart || 
                    segment.startTime - tolerance > existingEnd);
        });
    }
}

// Export singleton instance
export const audioManager = new AudioManager(); 