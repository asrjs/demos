import React from 'react';

export function AudioSegmentsWidget({ segments }) {
    const playSegment = (segment) => {
        // Verify segment data
        console.log('Playing segment:', {
            start: segment.startTime.toFixed(2),
            end: segment.endTime.toFixed(2),
            duration: (segment.endTime - segment.startTime).toFixed(2),
            expectedSamples: segment.samples,
            actualSamples: segment.audioData.length,
            sampleRate: segment.sampleRate
        });

        // Create audio context with correct sample rate
        const audioContext = new AudioContext({ sampleRate: segment.sampleRate });
        
        // Create buffer with exact segment length
        const buffer = audioContext.createBuffer(1, segment.samples, segment.sampleRate);
        
        // Copy the entire segment audio data
        const channelData = buffer.getChannelData(0);
        channelData.set(segment.audioData);

        const source = audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(audioContext.destination);
        
        source.start();
        
        // Clean up when done
        source.onended = () => {
            audioContext.close();
        };
    };

    const downloadSegment = (segment, index) => {
        // Use the actual segment audio data
        const wavData = createWavFile(segment.audioData, segment.sampleRate);
        
        // Create and trigger download
        const blob = new Blob([wavData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `segment_${index}_${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Helper function to create WAV file
    const createWavFile = (audioData, sampleRate) => {
        const buffer = new ArrayBuffer(44 + audioData.length * 2);
        const view = new DataView(buffer);

        // Write WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + audioData.length * 2, true);
        writeString(view, 8, 'WAVE');

        // Write format chunk
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);

        // Write data chunk
        writeString(view, 36, 'data');
        view.setUint32(40, audioData.length * 2, true);

        // Write audio data
        const volume = 0.8; // Increased volume slightly
        let offset = 44;
        for (let i = 0; i < audioData.length; i++) {
            view.setInt16(offset, audioData[i] * 0x7FFF * volume, true);
            offset += 2;
        }

        return buffer;
    };

    const writeString = (view, offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };

    return (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Detected Speech Segments</h3>
            <div className="space-y-2">
                {segments.map((segment, index) => (
                    <div key={index} className="flex items-center space-x-4 p-2 bg-white dark:bg-gray-700 rounded">
                        <span className="text-sm">
                            {`Segment ${index + 1}: ${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s (${(segment.endTime - segment.startTime).toFixed(2)}s)`}
                        </span>
                        <button
                            onClick={() => playSegment(segment)}
                            className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Play
                        </button>
                        <button
                            onClick={() => downloadSegment(segment, index + 1)}
                            className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                        >
                            Download
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
} 