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
        this.processor = null;
        this.listeners = new Set();
        this.initialized = false;
        
        this.parameters = {
            threshold: 0.02,
            silenceLength: 0.8,
            minSpeechDuration: 0.3
        };
        
        // Chunk işleme için state
        this.currentSegment = null;
        this.recordedChunks = [];
        
        // Tüm ses verisini tutmak için
        this.audioBuffer = new Float32Array(0);
        this.lastProcessedTime = 0;
        
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
     * Process new chunk of audio data
     * @param {Float32Array} chunk - New audio chunk
     */
    processNewChunk(chunk, energy) {
        if (!chunk || !chunk.length) return;

        // Yeni chunk'ı ana buffer'a ekle
        const newBuffer = new Float32Array(this.audioBuffer.length + chunk.length);
        newBuffer.set(this.audioBuffer);
        newBuffer.set(chunk, this.audioBuffer.length);
        this.audioBuffer = newBuffer;

        const currentTime = this.getCurrentTime();
        
        // Chunk'ı işle ve segment oluştur
        const segments = this.processor.processAudioData(
            chunk,              // anlık chunk
            currentTime,        // zaman
            energy,            // enerji
            this.audioBuffer,  // tüm ses verisi
            this.lastProcessedTime  // son işlenen zaman
        );
        
        if (segments.length > 0) {
            segments.forEach(segment => {
                this.notifyListeners('newSegment', segment);
            });
        }

        this.lastProcessedTime = currentTime;
    }

    /**
     * Get current time
     * @returns {number} Current time in seconds
     */
    getCurrentTime() {
        return this.audioContext ? this.audioContext.currentTime : 0;
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
        this.notifyListeners('newSegment', segment);
    }

    /**
     * Reset all state
     */
    reset() {
        this.currentSegment = null;
        this.recordedChunks = [];
        if (this.processor) {
            this.processor.reset();
        }
        this.notifyListeners('reset');
    }

    /**
     * Update all parameters at once
     * @param {Object} params - Object containing parameter updates
     */
    updateParameters(params) {
        Object.assign(this.parameters, params);
        if (this.processor) {
            this.processor.setThreshold(this.parameters.threshold);
            this.processor.setSilenceLength(this.parameters.silenceLength);
        }
    }
}

// Export singleton instance
export const audioManager = new AudioManager(); 