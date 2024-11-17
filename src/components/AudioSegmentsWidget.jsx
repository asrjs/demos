import React from 'react';
import { WaveFile } from 'wavefile';

export function AudioSegmentsWidget({ segments, worker, language }) {
    const playSegment = async (segment) => {
        if (!segment.audioData || segment.audioData.length === 0) {
            console.error('Invalid segment audio data');
            return;
        }

        console.log('Playing segment:', {
            start: segment.startTime.toFixed(2),
            end: segment.endTime.toFixed(2),
            duration: segment.duration.toFixed(2),
            samples: segment.audioData.length,
            sampleRate: segment.sampleRate
        });

        try {
            // Yeni bir WaveFile oluştur
            const wav = new WaveFile();
            
            // Ses verisini ayarla
            wav.fromScratch(1, // mono
                segment.sampleRate,
                '32f', // 32-bit float
                segment.audioData
            );

            // 16-bit PCM'e dönüştür
            wav.toBitDepth('16');

            // WAV buffer'ını al
            const wavBuffer = wav.toBuffer();

            // AudioBuffer oluştur ve çal
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(wavBuffer.buffer);
            
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Error playing segment:', error);
        }
    };

    const downloadSegment = (segment, index) => {
        try {
            // Yeni bir WaveFile oluştur
            const wav = new WaveFile();
            
            // Ses verisini ayarla
            wav.fromScratch(1, // mono
                segment.sampleRate,
                '32f', // 32-bit float
                segment.audioData
            );

            // 16-bit PCM'e dönüştür
            wav.toBitDepth('16');

            // WAV buffer'ını al
            const wavBuffer = wav.toBuffer();
            
            // Download işlemi
            const blob = new Blob([wavBuffer], { type: 'audio/wav' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `segment_${index}_${segment.startTime.toFixed(2)}-${segment.endTime.toFixed(2)}.wav`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading segment:', error);
        }
    };

    // Segment'i transkripsiyon için worker'a gönder
    const transcribeSegment = (segment, index) => {
        if (!worker || !worker.postMessage) {
            console.error('Worker not properly initialized', {
                workerExists: !!worker,
                hasPostMessage: !!(worker && worker.postMessage)
            });
            return;
        }
        
        try {
            console.log('Transcribing segment:', {
                index,
                duration: segment.duration,
                samples: segment.audioData.length
            });

            worker.postMessage({
                type: 'transcribe',
                data: {
                    audioData: segment.audioData,
                    language: language || 'tr',
                    segmentId: index
                }
            });
        } catch (error) {
            console.error('Error sending message to worker:', error);
        }
    };

    return (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Detected Speech Segments</h3>
            <div className="space-y-2">
                {segments.map((segment, index) => (
                    <div key={index} className="flex flex-col p-2 bg-white dark:bg-gray-700 rounded">
                        <div className="flex items-center space-x-4">
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
                            <button
                                onClick={() => transcribeSegment(segment, index)}
                                className="px-2 py-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                                disabled={segment.isProcessed}
                            >
                                {segment.isProcessed ? 'Transcribed' : 'Transcribe'}
                            </button>
                        </div>

                        {segment.transcription && (
                            <div className="mt-2 ml-4">
                                <div className="text-sm text-gray-600">
                                    {segment.transcription.text}
                                </div>
                                {segment.transcription.chunks && segment.transcription.chunks.length > 0 && (
                                    <div className="mt-1 text-xs text-gray-400 flex flex-wrap gap-1">
                                        {segment.transcription.chunks.map((chunk, i) => (
                                            <span key={i} className="bg-gray-100 dark:bg-gray-600 px-1 rounded">
                                                {chunk.text} [{chunk.start.toFixed(1)}s-{chunk.end.toFixed(1)}s]
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
} 