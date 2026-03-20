import React, { useEffect, useRef } from 'react';

export function WaveformCanvas({ snapshot }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const { width, height } = canvas;
    context.clearRect(0, 0, width, height);

    context.fillStyle = '#020617';
    context.fillRect(0, 0, width, height);

    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.35)');
    gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.7)');
    gradient.addColorStop(1, 'rgba(186, 230, 253, 0.9)');

    const waveform = Array.isArray(snapshot?.waveform) ? snapshot.waveform : [];
    const midY = height / 2;

    context.strokeStyle = 'rgba(255,255,255,0.08)';
    context.lineWidth = 1;
    for (let y = 1; y < 4; y += 1) {
      const lineY = (height / 4) * y;
      context.beginPath();
      context.moveTo(0, lineY);
      context.lineTo(width, lineY);
      context.stroke();
    }

    if (!waveform.length) {
      context.fillStyle = 'rgba(148, 163, 184, 0.75)';
      context.font = '12px IBM Plex Sans, sans-serif';
      context.fillText('Waiting for waveform data…', 16, 24);
      return;
    }

    const barWidth = Math.max(1, width / waveform.length);
    context.fillStyle = gradient;

    waveform.forEach((point, index) => {
      const min = Array.isArray(point) ? point[0] : point?.min ?? 0;
      const max = Array.isArray(point) ? point[1] : point?.max ?? 0;
      const x = index * barWidth;
      const top = midY - max * (height * 0.42);
      const bottom = midY - min * (height * 0.42);
      const barHeight = Math.max(1.5, bottom - top);
      context.fillRect(x, top, Math.max(1, barWidth - 1), barHeight);
    });

    if (snapshot?.activeSegment) {
      context.strokeStyle = 'rgba(16, 185, 129, 0.9)';
      context.lineWidth = 2;
      context.strokeRect(1, 1, width - 2, height - 2);
    }
  }, [snapshot]);

  return (
    <div className="rounded-[24px] border border-slate-800 bg-slate-950/80 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        <span>Waveform</span>
        <span>{snapshot?.state || 'idle'}</span>
      </div>
      <canvas
        ref={canvasRef}
        width={880}
        height={220}
        className="streaming-waveform-canvas h-[220px] w-full rounded-[18px]"
      />
    </div>
  );
}
