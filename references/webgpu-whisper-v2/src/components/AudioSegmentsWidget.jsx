import React, { useCallback, useRef, useEffect, memo, useMemo } from 'react';
import { WaveFile } from 'wavefile';
import { FixedSizeList as List } from 'react-window';

// Memoize individual segment item
const SegmentItem = memo(({ segment, index, onPlay, onDownload, onTranscribe }) => {
    const width = `${(segment.endTime - segment.startTime) * 100}%`;
    const left = `${segment.startTime * 100}%`;
    
    const bgColor = segment.isMerged 
        ? 'bg-purple-500 opacity-60'
        : segment.isProcessed 
            ? 'bg-blue-500 opacity-40'
            : 'bg-gray-500 opacity-40';

    return (
        <div 
            className={`absolute h-full ${bgColor} rounded-md transition-all duration-200`}
            style={{ 
                left,
                width,
                zIndex: segment.isMerged ? 2 : 1
            }}
            title={`${segment.isMerged ? 'Merged: ' : ''}${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s`}
        >
            {segment.isMerged && (
                <div className="absolute -top-5 left-0 text-xs text-purple-600 font-bold">
                    Merged ({segment.mergedCount})
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
});

// Memoize list row component
const Row = memo(({ index, style, data }) => {
    const { segments, onPlay, onDownload, onTranscribe } = data;
    const segment = segments[index];
    
    return (
        <div style={style} className={`flex flex-col p-2 rounded ${segment.isMerged ? 'bg-purple-100 dark:bg-purple-900' : 'bg-white dark:bg-gray-700'}`}>
            <div className="flex items-center space-x-4">
                <span className="text-sm">
                    {segment.isMerged ? '🔄 ' : ''}{`Segment ${index + 1}: ${segment.startTime.toFixed(2)}s - ${segment.endTime.toFixed(2)}s (${(segment.endTime - segment.startTime).toFixed(2)}s)`}
                </span>
                <button
                    onClick={() => onPlay(segment)}
                    className="px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                    Play
                </button>
                <button
                    onClick={() => onDownload(segment, index + 1)}
                    className="px-2 py-1 bg-green-500 text-white rounded hover:bg-green-600"
                >
                    Download
                </button>
                <button
                    onClick={() => onTranscribe(segment)}
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
    );
});

// Memoize the entire AudioSegmentsWidget component
export const AudioSegmentsWidget = memo(({ segments, worker, language }) => {
    const audioDataRef = useRef([]);

    // Memoize handlers
    const playSegment = useCallback(async (segment) => {
        if (!segment.audioData || segment.audioData.length === 0) {
            console.error('Invalid segment audio data');
            return;
        }

        try {
            const wav = new WaveFile();
            wav.fromScratch(1, segment.sampleRate, '32f', segment.audioData);
            wav.toBitDepth('16');
            const wavBuffer = wav.toBuffer();
            const audioContext = new AudioContext();
            const audioBuffer = await audioContext.decodeAudioData(wavBuffer.buffer);
            const source = audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(audioContext.destination);
            source.start();
        } catch (error) {
            console.error('Error playing segment:', error);
        }
    }, []);

    const downloadSegment = useCallback((segment, index) => {
        try {
            const wav = new WaveFile();
            wav.fromScratch(1, segment.sampleRate, '32f', segment.audioData);
            wav.toBitDepth('16');
            const wavBuffer = wav.toBuffer();
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
    }, []);

    const handleTranscribe = useCallback((segment) => {
        if (!worker) return;
        
        worker.postMessage({
            type: 'transcribe',
            data: {
                audioData: segment.audioData,
                segmentId: segment.id,
                language: language,
                isMerged: segment.isMerged
            }
        });
    }, [worker, language]);

    // Memoize list data
    const listData = useMemo(() => ({
        segments,
        onPlay: playSegment,
        onDownload: downloadSegment,
        onTranscribe: handleTranscribe
    }), [segments, playSegment, downloadSegment, handleTranscribe]);

    return (
        <div className="mt-4 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-semibold mb-2">Detected Speech Segments ({segments.length})</h3>
            
            <List
                height={400}
                itemCount={segments.length}
                itemSize={80}
                width={'100%'}
                itemData={listData}
            >
                {Row}
            </List>
        </div>
    );
});

AudioSegmentsWidget.displayName = 'AudioSegmentsWidget'; 