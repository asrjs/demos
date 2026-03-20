export class RollingAudioRingBuffer {
  constructor(sampleRate, durationSeconds = 8) {
    this.sampleRate = sampleRate;
    this.maxFrames = Math.max(1, Math.floor(sampleRate * durationSeconds));
    this.buffer = new Float32Array(this.maxFrames);
    this.currentFrame = 0;
  }

  write(chunk) {
    let chunkLength = chunk.length;
    let dataToWrite = chunk;

    if (chunkLength > this.maxFrames) {
      const start = chunkLength - this.maxFrames;
      dataToWrite = chunk.subarray(start);
      this.currentFrame += start;
      chunkLength = this.maxFrames;
    }

    const writePos = this.currentFrame % this.maxFrames;
    const remainingSpace = this.maxFrames - writePos;

    if (chunkLength <= remainingSpace) {
      this.buffer.set(dataToWrite, writePos);
    } else {
      this.buffer.set(dataToWrite.subarray(0, remainingSpace), writePos);
      this.buffer.set(dataToWrite.subarray(remainingSpace), 0);
    }

    this.currentFrame += chunkLength;
  }

  read(startFrame, endFrame) {
    if (endFrame <= startFrame) {
      return new Float32Array(0);
    }

    const baseFrame = this.getBaseFrameOffset();
    const safeStart = Math.max(startFrame, baseFrame);
    const safeEnd = Math.min(endFrame, this.currentFrame);
    if (safeEnd <= safeStart) {
      return new Float32Array(0);
    }

    const length = safeEnd - safeStart;
    const result = new Float32Array(length);
    const readPos = safeStart % this.maxFrames;
    const remainingAtEnd = this.maxFrames - readPos;

    if (length <= remainingAtEnd) {
      result.set(this.buffer.subarray(readPos, readPos + length));
    } else {
      result.set(this.buffer.subarray(readPos, this.maxFrames));
      result.set(this.buffer.subarray(0, length - remainingAtEnd), remainingAtEnd);
    }

    return result;
  }

  getCurrentFrame() {
    return this.currentFrame;
  }

  getBaseFrameOffset() {
    return Math.max(0, this.currentFrame - this.maxFrames);
  }

  getMinMaxPairs(pointCount = 160, frameSpan = this.maxFrames) {
    const safePoints = Math.max(8, Math.floor(pointCount));
    const endFrame = this.getCurrentFrame();
    const startFrame = Math.max(this.getBaseFrameOffset(), endFrame - frameSpan);
    const frameCount = Math.max(1, endFrame - startFrame);
    const framesPerPoint = Math.max(1, Math.floor(frameCount / safePoints));
    const minMax = new Float32Array(safePoints * 2);

    for (let pointIndex = 0; pointIndex < safePoints; pointIndex += 1) {
      const pointStart = startFrame + pointIndex * framesPerPoint;
      const pointEnd =
        pointIndex === safePoints - 1
          ? endFrame
          : Math.min(endFrame, pointStart + framesPerPoint);
      let min = 1;
      let max = -1;

      for (let frame = pointStart; frame < pointEnd; frame += 1) {
        const sample = this.buffer[frame % this.maxFrames];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }

      if (pointEnd <= pointStart) {
        min = 0;
        max = 0;
      }

      minMax[pointIndex * 2] = min;
      minMax[pointIndex * 2 + 1] = max;
    }

    return {
      startFrame,
      endFrame,
      minMax,
    };
  }

  reset() {
    this.currentFrame = 0;
    this.buffer.fill(0);
  }
}
