import { useRef, useEffect, useCallback } from "react";
import { audioManager } from "../AudioManager";

export function BufferVisualizer({ chunks, audioContextRef, segments = [], onEnergyUpdate }) {
    const canvasRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const lastChunksLengthRef = useRef(0);
    const lastBufferStateRef = useRef({ isBufferFull: false });
    const UPDATE_INTERVAL = 100;
    const MAX_DURATION = 30;
    const SKIP_POINTS = 16;

    const drawSegments = useCallback((ctx, segments, totalDuration, canvas) => {
        const isBufferFull = totalDuration > MAX_DURATION;
        const visibleDuration = isBufferFull ? MAX_DURATION : totalDuration;
        const windowStart = isBufferFull ? totalDuration - MAX_DURATION : 0;

        segments.forEach(segment => {
            const normalizedStart = isBufferFull 
                ? (segment.startTime - windowStart) 
                : segment.startTime;
            const normalizedEnd = isBufferFull 
                ? (segment.endTime - windowStart) 
                : segment.endTime;

            const startX = (normalizedStart / visibleDuration) * canvas.width;
            const endX = (normalizedEnd / visibleDuration) * canvas.width;

            if (normalizedStart <= visibleDuration && normalizedEnd >= 0) {
                ctx.fillStyle = segment.isMerged ? 'rgba(128, 0, 128, 0.2)' :
                              segment.isPartOfMerged ? 'rgba(255, 165, 0, 0.1)' :
                              segment.isProcessed ? 'rgba(0, 200, 0, 0.1)' :
                              'rgba(255, 200, 0, 0.1)';
                
                ctx.fillRect(startX, 0, endX - startX, canvas.height);

                ctx.strokeStyle = segment.isMerged ? 
                    'rgba(128, 0, 128, 0.5)' : 
                    'rgba(0, 100, 200, 0.5)';
                ctx.beginPath();
                ctx.moveTo(startX, 0);
                ctx.lineTo(startX, canvas.height);
                ctx.moveTo(endX, 0);
                ctx.lineTo(endX, canvas.height);
                ctx.stroke();

                ctx.fillStyle = '#666';
                ctx.font = '10px Arial';
                ctx.fillText(`${segment.startTime.toFixed(1)}s`, startX + 2, 10);
            }
        });
    }, []);

    const drawWaveform = useCallback((ctx, audioData, canvas, totalDuration) => {
        const isBufferFull = totalDuration > MAX_DURATION;
        const visibleDuration = isBufferFull ? MAX_DURATION : totalDuration;

        const visibleSamples = isBufferFull 
            ? Math.min(audioData.length, MAX_DURATION * audioContextRef.current.sampleRate)
            : audioData.length;
        
        const startIndex = isBufferFull 
            ? audioData.length - visibleSamples 
            : 0;

        const centerY = canvas.height / 2;
        const scale = canvas.height / 2;
        
        ctx.strokeStyle = '#c8c8c8';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i < visibleSamples; i += SKIP_POINTS) {
            const x = (i / visibleSamples) * canvas.width;
            const dataIndex = startIndex + i;
            const y = centerY + (audioData[dataIndex] || 0) * scale;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }, []);

    useEffect(() => {
        const now = Date.now();
        if (now - lastUpdateRef.current < UPDATE_INTERVAL) return;
        if (!chunks.length || !canvasRef.current) return;
        if (chunks.length === lastChunksLengthRef.current) return;

        lastUpdateRef.current = now;
        lastChunksLengthRef.current = chunks.length;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true
        });

        const processAudioData = async () => {
            // Create combined audio data from chunks
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const audioData = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of chunks) {
                audioData.set(chunk, offset);
                offset += chunk.length;
            }

            // Calculate energy values from the most recent chunk
            const recentChunk = chunks[chunks.length - 1];
            if (recentChunk && onEnergyUpdate) {
                const windowSize = 1024;
                let energy = 0;
                let peak = 0;
                
                // Calculate RMS energy and peak
                for (let i = 0; i < recentChunk.length; i++) {
                    const value = Math.abs(recentChunk[i]);
                    energy += value * value;
                    peak = Math.max(peak, value);
                }
                
                energy = Math.sqrt(energy / recentChunk.length);
                
                // Calculate moving average
                const avgEnergy = energy; // You can implement a proper moving average if needed
                
                // Send energy updates
                onEnergyUpdate(energy, avgEnergy, peak, peak);
            }

            const totalDuration = totalLength / audioContextRef.current.sampleRate;

            // Clear canvas ONCE
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw layers in order
            drawWaveform(ctx, audioData, canvas, totalDuration);
            drawSegments(ctx, segments, totalDuration, canvas);
            drawTimeMarkers(ctx, totalDuration, canvas);
        };

        processAudioData().catch(console.error);
    }, [chunks, segments, drawSegments, drawWaveform, onEnergyUpdate]);

    const drawTimeMarkers = (ctx, totalDuration, canvas) => {
        const isBufferFull = totalDuration > MAX_DURATION;
        const visibleDuration = isBufferFull ? MAX_DURATION : totalDuration;
        const windowStart = isBufferFull ? totalDuration - MAX_DURATION : 0;

        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        for (let i = 0; i <= visibleDuration; i += 5) {
            const x = (i / visibleDuration) * canvas.width;
            const time = windowStart + i;
            ctx.fillText(`${time.toFixed(0)}s`, x, canvas.height - 2);
        }
    };

    return (
        <canvas 
            ref={canvasRef} 
            width={480} 
            height={160}
            className="w-full border rounded bg-[#f5f5f5]"
        />
    );
}