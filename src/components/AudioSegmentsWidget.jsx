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

    const SegmentItem = ({ segment, index }) => {
        const width = `${(segment.endTime - segment.startTime) * 100}%`;
        const left = `${segment.startTime * 100}%`;
        
        // Different styling for segment states
        let bgColor;
        if (segment.isMerged) {
            bgColor = 'bg-purple-500 opacity-60';  // Merged segments
        } else if (segment.isPartOfMerged) {
            bgColor = 'bg-purple-300 opacity-40';  // Parts of merged segments
        } else if (segment.isProcessed) {
            bgColor = 'bg-blue-500 opacity-40';    // Processed individual segments
        } else {
            bgColor = 'bg-gray-500 opacity-40';    // Unprocessed segments
        }
        
        // console.log('Rendering segment:', {
        //     index,
        //     id: segment.id,
        //     isMerged: segment.isMerged,
        //     isPartOfMerged: segment.isPartOfMerged,
        //     isProcessed: segment.isProcessed,
        //     bgColor,
        //     transcription: segment.transcription
        // });

        return (
            <div 
                className={`absolute h-full ${bgColor} rounded-md transition-all duration-200`}
                style={{ 
                    left,
                    width,
                    zIndex: segment.isMerged ? 2 : segment.isPartOfMerged ? 1 : 0
                }}
                title={`${segment.isMerged ? 'Merged: ' : segment.isPartOfMerged ? 'Part of merged: ' : ''}${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s`}
            >
                {segment.isMerged && (
                    <div className="absolute -top-5 left-0 text-xs text-purple-600 font-bold">
                        Merged ({segment.mergedCount})
                    </div>
                )}
                {segment.isPartOfMerged && (
                    <div className="absolute -top-5 left-0 text-xs text-purple-400">
                        Part of: {segment.mergedId}
                    </div>
                )}
                {segment.transcription && (
                    <div className="absolute -bottom-6 left-0 text-xs text-gray-600 dark:text-gray-300 whitespace-nowrap overflow-hidden max-w-full">
                        {typeof segment.transcription === 'string' 
                            ? segment.transcription 
                            : segment.transcription.text || segment.transcription.toString()}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Detected Speech Segments ({segments.length})</h3>
            
            {/* Visualization of segments */}
            <div className="relative h-16 mb-8 bg-gray-200 dark:bg-gray-700 rounded">
                {segments.map((segment, index) => (
                    <SegmentItem 
                        key={segment.isMerged ? segment.id : index}
                        segment={segment} 
                        index={index}
                    />
                ))}
            </div>

            {/* List of segments */}
            <div className="space-y-2">
                {segments.map((segment, index) => (
                    <div key={segment.isMerged ? segment.id : index} 
                         className={`flex flex-col p-2 rounded ${
                             segment.isMerged 
                                 ? 'bg-purple-100 dark:bg-purple-900' 
                                 : 'bg-white dark:bg-gray-700'
                         }`}>
                        <div className="flex items-center space-x-4">
                            <span className="text-sm">
                                {segment.isMerged ? '🔄 ' : ''}{`Segment ${index + 1}: ${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s (${(segment.endTime - segment.startTime).toFixed(2)}s)`}
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
                            <div className="mt-2 ml-4 text-sm">
                                {typeof segment.transcription === 'string' 
                                    ? segment.transcription 
                                    : segment.transcription.text || segment.transcription.toString()}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
} 