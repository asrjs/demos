import { useRef } from 'react';
import { BufferVisualizer } from './BufferVisualizer';
import { SpeechSegmentsDebug } from './SpeechSegmentsDebug';

export function StatsWidget({ chunks, audioContextRef, segments = [], threshold }) {
    // Fix duration calculation
    // Each chunk is 25ms (0.025 seconds) as set in the recorder
    const totalDuration = chunks.length * 0.025;  // Simple and accurate duration calculation
    const totalSize = chunks.reduce((acc, chunk) => acc + chunk.size, 0);
    const audioPlayerRef = useRef(null);

    const handlePlayback = async () => {
        if (!chunks.length) return;

        // Create blob directly from chunks
        const blob = new Blob(chunks, { 
            type: 'audio/webm;codecs=opus' 
        });
        const audioUrl = URL.createObjectURL(blob);
        
        if (audioPlayerRef.current) {
            audioPlayerRef.current.src = audioUrl;
            try {
                await audioPlayerRef.current.play();
            } catch (error) {
                console.error('Playback failed:', error);
            }
        }

        audioPlayerRef.current.onended = () => {
            URL.revokeObjectURL(audioUrl);
        };
    };

    const handleDownload = async () => {
        if (!chunks.length) return;

        try {
            // Create blob directly from chunks
            const blob = new Blob(chunks, { 
                type: 'audio/webm;codecs=opus' 
            });
            
            // Convert to audio data
            const arrayBuffer = await blob.arrayBuffer();
            const audioContext = new AudioContext({ sampleRate: 16000 });
            const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            
            // Convert to WAV
            const wavBuffer = audioBufferToWav(audioBuffer);
            const wavBlob = new Blob([wavBuffer], { type: 'audio/wav' });
            
            // Download
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `audio_recording_${new Date().toISOString()}.wav`;
            document.body.appendChild(a);
            a.click();
            
            // Cleanup
            setTimeout(() => {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                audioContext.close();
            }, 0);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    // Function to convert AudioBuffer to WAV format
    function audioBufferToWav(buffer) {
        const numChannels = 1; // Mono
        const sampleRate = buffer.sampleRate;
        const format = 1; // PCM
        const bitDepth = 16;
        
        const dataLength = buffer.length * numChannels * (bitDepth / 8);
        const bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);
        
        // WAV header
        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
        view.setUint16(32, numChannels * (bitDepth / 8), true);
        view.setUint16(34, bitDepth, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);
        
        // Write audio data
        const channelData = buffer.getChannelData(0);
        let offset = 44;
        for (let i = 0; i < channelData.length; i++) {
            const sample = Math.max(-1, Math.min(1, channelData[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
        
        return arrayBuffer;
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    // Format time in MM:SS format
    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="w-full p-4 border rounded-lg mt-4">
            <h3 className="font-semibold mb-2">Buffer Statistics</h3>
            
            <div className="mb-4 w-full">
                <BufferVisualizer 
                    chunks={chunks} 
                    audioContextRef={audioContextRef}
                    threshold={threshold}
                    segments={segments}
                />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
                <div>Chunks: {chunks.length}</div>
                <div>Total Size: {(totalSize / 1024).toFixed(2)} KB</div>
                <div>Duration: {totalDuration.toFixed(2)}s</div>
                <div>Sample Rate: {audioContextRef.current?.sampleRate || 16000} Hz</div>
                <div>Speech Segments: {segments.filter(s => !s.isSilence).length}</div>
                <div>Processed: {segments.filter(s => s.isProcessed).length}</div>
                <div>Avg Segment: {
                    (segments.filter(s => !s.isSilence)
                        .reduce((acc, s) => acc + s.getDuration(), 0) 
                        / segments.filter(s => !s.isSilence).length || 0
                    ).toFixed(2)}s
                </div>
                <div>Last Energy: {
                    segments[segments.length - 1]?.energy.toFixed(3) || 'N/A'
                }</div>
            </div>

            {/* Add debug panel */}
            <SpeechSegmentsDebug segments={segments} />

            <div className="flex justify-between items-center">
                <div className="flex gap-2">
                    <button 
                        onClick={handlePlayback}
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:bg-blue-300"
                        disabled={!chunks.length}
                    >
                        Play Buffer
                    </button>
                    <button 
                        onClick={handleDownload}
                        className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:bg-green-300"
                        disabled={!chunks.length}
                    >
                        Download WAV
                    </button>
                </div>
                <audio ref={audioPlayerRef} controls className="w-64" />
            </div>
        </div>
    );
} 