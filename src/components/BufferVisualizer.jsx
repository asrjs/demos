import { useRef, useEffect, useCallback } from "react";

export function BufferVisualizer({ chunks, audioContextRef, segments = [], energyValues }) {
    const canvasRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const lastChunksLengthRef = useRef(0);
    const UPDATE_INTERVAL = 100;
    const MAX_DURATION = 30;
    const SKIP_POINTS = 16;

    const drawSegments = useCallback((ctx, segments, totalDuration, canvas) => {
        segments.forEach(segment => {
            // Calculate relative positions based on total duration
            const startX = (segment.startTime / totalDuration) * canvas.width;
            const endX = (segment.endTime / totalDuration) * canvas.width;
            
            // Only draw if segment is within view
            if (startX < canvas.width && endX > 0) {
                ctx.fillStyle = segment.isProcessed 
                    ? 'rgba(0, 200, 0, 0.1)'
                    : 'rgba(0, 100, 200, 0.1)';
                ctx.fillRect(startX, 0, endX - startX, canvas.height);

                ctx.strokeStyle = 'rgba(0, 100, 200, 0.5)';
                ctx.beginPath();
                ctx.moveTo(startX, 0);
                ctx.lineTo(startX, canvas.height);
                ctx.moveTo(endX, 0);
                ctx.lineTo(endX, canvas.height);
                ctx.stroke();
            }
        });
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
            // Calculate total duration of all chunks
            const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
            const totalDuration = totalLength / audioContextRef.current.sampleRate;

            // Create buffer for last 30 seconds
            const samplesFor30Sec = MAX_DURATION * audioContextRef.current.sampleRate;
            const audioData = new Float32Array(Math.min(totalLength, samplesFor30Sec));
            
            // Fill buffer with most recent audio data
            let writeOffset = audioData.length;
            for (let i = chunks.length - 1; i >= 0 && writeOffset > 0; i--) {
                const chunk = chunks[i];
                const copySize = Math.min(writeOffset, chunk.length);
                audioData.set(
                    chunk.slice(-copySize),
                    writeOffset - copySize
                );
                writeOffset -= copySize;
            }

            // Draw waveform
            ctx.fillStyle = '#f5f5f5';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const centerY = canvas.height / 2;
            const scale = canvas.height / 2;
            
            ctx.strokeStyle = '#c8c8c8';
            ctx.lineWidth = 1;
            ctx.beginPath();

            // Draw waveform without energy calculations
            for (let i = 0; i < audioData.length; i += SKIP_POINTS) {
                const x = (i / audioData.length) * canvas.width;
                const y = centerY + audioData[i] * scale;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();

            // Draw segments
            drawSegments(ctx, segments, totalDuration, canvas);

            // Draw time markers
            ctx.fillStyle = '#666';
            ctx.font = '10px Arial';
            for (let i = 0; i <= MAX_DURATION; i += 10) {
                const x = (canvas.width * i) / MAX_DURATION;
                const time = totalDuration - MAX_DURATION + i;
                ctx.fillText(`${time.toFixed(0)}s`, x, canvas.height - 2);
            }
        };

        processAudioData();
    }, [chunks, segments, drawSegments]);

    return (
        <canvas 
            ref={canvasRef} 
            width={720} 
            height={120}
            className="w-full border rounded bg-[#f5f5f5]"
        />
    );
}