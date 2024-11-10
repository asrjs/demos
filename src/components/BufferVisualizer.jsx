import { useRef, useEffect } from "react";

export function BufferVisualizer({ chunks, audioContextRef, threshold = 0.05, segments = [] }) {
    const canvasRef = useRef(null);
    const lastUpdateRef = useRef(0);
    const lastChunksLengthRef = useRef(0);
    const UPDATE_INTERVAL = 250;
    const MAX_DURATION = 30;

    useEffect(() => {
        if (!chunks.length || !canvasRef.current) return;
        
        if (chunks.length === lastChunksLengthRef.current) return;
        
        const now = Date.now();
        if (now - lastUpdateRef.current < UPDATE_INTERVAL) return;

        lastUpdateRef.current = now;
        lastChunksLengthRef.current = chunks.length;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');

        const blob = new Blob(chunks, { type: 'audio/webm;codecs=opus' });
        blob.arrayBuffer().then(async arrayBuffer => {
            try {
                const audioBuffer = await audioContextRef.current.decodeAudioData(arrayBuffer);
                const audioData = audioBuffer.getChannelData(0);

                const samplesFor30Sec = MAX_DURATION * audioContextRef.current.sampleRate;
                const recentAudioData = audioData.length > samplesFor30Sec 
                    ? audioData.slice(-samplesFor30Sec) 
                    : audioData;

                // Clear canvas
                ctx.fillStyle = 'rgb(245, 245, 245)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                // Draw waveform in light gray
                const centerY = canvas.height / 2;
                const scale = canvas.height / 2;
                
                ctx.strokeStyle = 'rgba(200, 200, 200, 0.5)';
                ctx.beginPath();
                for (let i = 0; i < recentAudioData.length; i++) {
                    const x = (i / recentAudioData.length) * canvas.width;
                    const y = centerY + recentAudioData[i] * scale;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();

                // Draw speech blocks and markers
                const baseTime = Math.max(0, (audioData.length - recentAudioData.length)) / audioContextRef.current.sampleRate;

                segments.forEach(segment => {
                    const startX = ((segment.startTime - baseTime) / MAX_DURATION) * canvas.width;
                    const endX = ((segment.endTime - baseTime) / MAX_DURATION) * canvas.width;
                    
                    if (startX + (endX - startX) > 0 && startX < canvas.width) {
                        // Draw vertical markers at speech boundaries
                        ctx.strokeStyle = 'rgba(0, 100, 200, 0.5)';
                        ctx.lineWidth = 2;
                        
                        // Start marker
                        ctx.beginPath();
                        ctx.moveTo(startX, 0);
                        ctx.lineTo(startX, canvas.height);
                        ctx.stroke();

                        // End marker
                        ctx.beginPath();
                        ctx.moveTo(endX, 0);
                        ctx.lineTo(endX, canvas.height);
                        ctx.stroke();

                        // Highlight speech region
                        ctx.fillStyle = segment.isProcessed 
                            ? 'rgba(0, 200, 0, 0.1)'  // Processed speech
                            : 'rgba(0, 100, 200, 0.1)'; // Unprocessed speech
                        ctx.fillRect(startX, 0, endX - startX, canvas.height);
                    }
                });

                // Draw threshold line
                ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, centerY - (threshold * scale));
                ctx.lineTo(canvas.width, centerY - (threshold * scale));
                ctx.stroke();

                // Draw time markers
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.font = '10px Arial';
                for (let i = 0; i <= MAX_DURATION; i += 5) {
                    const x = (canvas.width * i) / MAX_DURATION;
                    ctx.fillText(`${i}s`, x, canvas.height - 2);
                }

            } catch (error) {
                console.error('Error processing audio:', error);
            }
        });
    }, [chunks, threshold, audioContextRef, segments]);

    return (
        <canvas 
            ref={canvasRef} 
            width={720} 
            height={120}
            className="w-full border rounded bg-[rgb(245,245,245)]"
        />
    );
}