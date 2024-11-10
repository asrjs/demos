export class SpeechSegment {
    constructor({ startTime, endTime, energy, audioData }) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.energy = energy;
        this.audioData = audioData;
        this.isProcessed = false;
        this.transcription = '';
    }

    getDuration() {
        return this.endTime - this.startTime;
    }

    isSilence() {
        return false;  // For now, assume no silence segments
    }
} 