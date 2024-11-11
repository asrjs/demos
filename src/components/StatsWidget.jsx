import { useRef } from 'react';
import { BufferVisualizer } from './BufferVisualizer';

export function StatsWidget({ chunks, audioContextRef, segments = [] }) {
    const audioPlayerRef = useRef(null);

    const handlePlayback = async () => {
        if (!chunks.length) return;

        try {
            // Create AudioBuffer from raw PCM data
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const audioBuffer = audioContextRef.current.createBuffer(1, totalLength, audioContextRef.current.sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            let offset = 0;
            for (const chunk of chunks) {
                channelData.set(chunk, offset);
                offset += chunk.length;
            }

            // Convert AudioBuffer to blob
            const wavBuffer = audioBufferToWav(audioBuffer);
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            const audioUrl = URL.createObjectURL(blob);
            
            if (audioPlayerRef.current) {
                audioPlayerRef.current.src = audioUrl;
                await audioPlayerRef.current.play();
                audioPlayerRef.current.onended = () => URL.revokeObjectURL(audioUrl);
            }
        } catch (error) {
            console.error('Playback failed:', error);
        }
    };

    const handleDownload = async () => {
        if (!chunks.length) return;

        try {
            // Create AudioBuffer directly from PCM data
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const audioBuffer = audioContextRef.current.createBuffer(1, totalLength, audioContextRef.current.sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            let offset = 0;
            for (const chunk of chunks) {
                channelData.set(chunk, offset);
                offset += chunk.length;
            }
            
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
            }, 0);
        } catch (error) {
            console.error('Download failed:', error);
        }
    };

    function audioBufferToWav(buffer) {
        const numChannels = 1;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        
        const dataLength = buffer.length * numChannels * (bitDepth / 8);
        const bufferLength = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferLength);
        const view = new DataView(arrayBuffer);
        
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

    return (
        <div className="w-full p-4 border rounded-lg mt-4">
            <h3 className="font-semibold mb-2">Buffer Statistics</h3>
            
            <div className="mb-4 w-full">
                <BufferVisualizer 
                    chunks={chunks} 
                    audioContextRef={audioContextRef}
                    segments={segments}
                />
            </div>

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