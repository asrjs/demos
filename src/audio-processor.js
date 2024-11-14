class AudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.bufferSize = 1600;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
        
        this.maxValues = [];
        this.smaLength = 6;
        this.silenceCounter = 0;
        this.silenceThreshold = 8;
    }

    calculateMaxEnergy(buffer) {
        const maxAbsValue = Math.max(...Array.from(buffer).map(Math.abs));
        this.maxValues.push(maxAbsValue);
        
        if (this.maxValues.length > this.smaLength) {
            this.maxValues.shift();
        }
        
        const sum = this.maxValues.reduce((acc, val) => acc + val, 0);
        return (sum / this.maxValues.length);
    }

    process(inputs, outputs) {
        const input = inputs[0];
        const channel = input[0];

        if (!channel) return true;

        for (let i = 0; i < channel.length; i++) {
            this.buffer[this.bufferIndex++] = channel[i];

            if (this.bufferIndex >= this.bufferSize) {
                const energy = this.calculateMaxEnergy(this.buffer);
                
                this.port.postMessage({
                    type: 'audio_data',
                    audioData: this.buffer.slice(),
                    energy: energy
                });
                
                this.bufferIndex = 0;
            }
        }

        return true;
    }
}

registerProcessor('audio-processor', AudioProcessor); 