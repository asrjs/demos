export class SpeechSegment {
    constructor(data) {
        this.startTime = data.startTime;
        this.endTime = data.endTime;
        this.audioData = data.audioData;
        this.isProcessed = false;
        this.transcription = '';
        this.energy = this.calculateEnergy();
        this.isSilence = this.energy < 0.1; // Configurable threshold
    }

    calculateEnergy() {
        return Math.sqrt(
            this.audioData.reduce((sum, sample) => sum + sample * sample, 0) 
            / this.audioData.length
        );
    }

    getDuration() {
        return this.endTime - this.startTime;
    }

    isLongEnough(minDuration = 0.5) {
        return this.getDuration() >= minDuration;
    }
} 