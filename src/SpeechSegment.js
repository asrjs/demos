export class SpeechSegment {
    constructor({ startTime, endTime, energy, audioData, isProcessed = false, isMerged = false, isPartOfMerged = false }) {
        this.startTime = startTime;
        this.endTime = endTime;
        this.energy = energy;
        this.audioData = audioData;
        this.isProcessed = isProcessed;
        this.isMerged = isMerged;
        this.isPartOfMerged = isPartOfMerged;
        this.transcription = '';
        this.id = null;
        this.mergedId = null;
    }

    getDuration() {
        return this.endTime - this.startTime;
    }

    isSilence() {
        return false;
    }
} 