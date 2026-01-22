// public/audio-processor.js
class EchoCancellationProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 2048;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
    this.noiseEstimate = 0.01;
    this.lastInput = 0;
    this.echoEstimate = new Float32Array(256).fill(0);
    this.echoIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];
    
    if (input.length > 0) {
      const inputChannel = input[0];
      const outputChannel = output[0];
      
      // Calculate RMS for voice activity detection
      let sum = 0;
      for (let i = 0; i < inputChannel.length; i++) {
        sum += inputChannel[i] * inputChannel[i];
      }
      const rms = Math.sqrt(sum / inputChannel.length);
      
      // Update noise estimate during silence
      if (rms < 0.005) {
        this.noiseEstimate = this.noiseEstimate * 0.99 + rms * 0.01;
      }
      
      // Adaptive threshold for noise gate
      const threshold = Math.max(0.01, this.noiseEstimate * 1.5);
      
      if (rms < threshold) {
        // Noise gate active - output silence
        for (let i = 0; i < outputChannel.length; i++) {
          outputChannel[i] = 0;
        }
      } else {
        // Process audio with echo cancellation
        for (let i = 0; i < outputChannel.length; i++) {
          // Store input in buffer for echo estimation
          this.buffer[this.bufferIndex] = inputChannel[i];
          this.bufferIndex = (this.bufferIndex + 1) % this.bufferSize;
          
          // High-pass filter at ~80Hz to remove rumble
          const alpha = 0.95;
          let filtered = inputChannel[i] - this.lastInput * alpha;
          this.lastInput = inputChannel[i];
          
          // Simple echo cancellation using delay line subtraction
          const echoDelay = 128; // Approximate echo delay in samples
          const echoIndex = (this.bufferIndex - echoDelay + this.bufferSize) % this.bufferSize;
          const echoComponent = this.buffer[echoIndex] * 0.3; // Estimated echo
          
          // Subtract estimated echo
          filtered -= echoComponent;
          
          // Dynamic range compression
          let sample = filtered;
          const compressionThreshold = 0.2;
          const compressionRatio = 3;
          
          if (Math.abs(sample) > compressionThreshold) {
            const sign = sample > 0 ? 1 : -1;
            const excess = Math.abs(sample) - compressionThreshold;
            sample = sign * (compressionThreshold + excess / compressionRatio);
          }
          
          // Apply gentle low-pass filter to reduce harshness
          if (i > 0) {
            sample = sample * 0.7 + outputChannel[i - 1] * 0.3;
          }
          
          // Output with overall gain reduction
          outputChannel[i] = sample * 0.6;
        }
      }
    }
    
    return true;
  }
}

registerProcessor('echo-cancellation-processor', EchoCancellationProcessor);
