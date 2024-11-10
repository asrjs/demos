export class AudioProcessor {
    constructor(options = {}) {
        this.options = {
            sampleRate: 16000,
            bufferSize: 128,
            smaLength: 6,
            amplitudeThreshold: 0.2,
            silenceThreshold: 50,
            minSpeechLength: 1.0,
            lookback: 3200,
            ...options
        };

        this.rollingBuffer = new Float32Array(this.options.lookback);
        this.recordedAudio = [];
        this.absValues = [];
        this.silenceCounter = 0;
        this.isRecording = false;
        this.rollingBufferIndex = 0;
    }

    movingAverage(audioData) {
        const maxAbsValue = Math.max(...Array.from(audioData).map(Math.abs));
        this.absValues.push(maxAbsValue);
        
        if (this.absValues.length > this.options.smaLength) {
            this.absValues.shift();
        }
        
        const sum = this.absValues.reduce((acc, val) => acc + val, 0);
        return sum / this.absValues.length;
    }

    processAudioChunk(inputChannel) {
        // Update rolling buffer using circular buffer approach
        for (let i = 0; i < inputChannel.length; i++) {
            this.rollingBuffer[this.rollingBufferIndex] = inputChannel[i];
            this.rollingBufferIndex = (this.rollingBufferIndex + 1) % this.options.lookback;
        }

        const sma = this.movingAverage(inputChannel);

        if (sma > this.options.amplitudeThreshold) {
            if (!this.isRecording) {
                // Start of speech detected - include lookback buffer
                this.recordedAudio = Array.from(this.getRollingBufferInOrder());
                this.isRecording = true;
            }
            this.recordedAudio.push(...Array.from(inputChannel));
            this.silenceCounter = 0;
            return null;
        } else {
            if (this.isRecording) {
                this.silenceCounter++;
                this.recordedAudio.push(...Array.from(inputChannel));
                
                if (this.silenceCounter > this.options.silenceThreshold) {
                    const recordingLength = this.recordedAudio.length / this.options.sampleRate;
                    
                    if (recordingLength > this.options.minSpeechLength) {
                        const audioData = new Float32Array(this.recordedAudio);
                        this.reset();
                        return audioData;
                    } else {
                        this.reset();
                    }
                }
            }
            return null;
        }
    }

    getRollingBufferInOrder() {
        const result = new Float32Array(this.options.lookback);
        for (let i = 0; i < this.options.lookback; i++) {
            const index = (this.rollingBufferIndex + i) % this.options.lookback;
            result[i] = this.rollingBuffer[index];
        }
        return result;
    }

    reset() {
        this.recordedAudio = [];
        this.isRecording = false;
        this.silenceCounter = 0;
    }
} 