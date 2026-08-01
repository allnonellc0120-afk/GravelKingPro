/**
 * Web Audio API Integration for Morris Law Kernel V3.5
 * 
 * Recommended Architecture for Superior Music & Video Sound App:
 * - Web Audio API: Real-time playback, metering, visualization, light preview processing
 * - Morris Law Kernel (Python backend): Heavy adaptive mastering + stem isolation
 * 
 * This file provides production-ready Web Audio API examples.
 */

// ==================== AUDIO CONTEXT ====================
let audioContext;
let sourceNode;
let gainNode;
let analyserNode;
let compressorNode; // Built-in Web Audio compressor for preview

function initAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
}

// ==================== PLAYBACK WITH WEB AUDIO API ====================
async function playAudioBuffer(audioBuffer) {
    const ctx = initAudioContext();
    
    if (sourceNode) sourceNode.disconnect();
    
    sourceNode = ctx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    
    // Gain
    gainNode = ctx.createGain();
    gainNode.gain.value = 0.9;
    
    // Analyser for metering / visualization
    analyserNode = ctx.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.minDecibels = -90;
    analyserNode.maxDecibels = -10;
    analyserNode.smoothingTimeConstant = 0.8;
    
    // Optional built-in compressor for real-time preview
    compressorNode = ctx.createDynamicsCompressor();
    compressorNode.threshold.value = -18;
    compressorNode.knee.value = 12;
    compressorNode.ratio.value = 3;
    compressorNode.attack.value = 0.003;
    compressorNode.release.value = 0.25;
    
    // Chain: Source → Compressor → Gain → Analyser → Destination
    sourceNode
        .connect(compressorNode)
        .connect(gainNode)
        .connect(analyserNode)
        .connect(ctx.destination);
    
    sourceNode.start(0);
    
    return { sourceNode, analyserNode, gainNode };
}

// ==================== REAL-TIME METERING ====================
function getAudioMeter(analyser) {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);
    
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
    }
    const average = sum / bufferLength;
    
    return {
        level: average / 255,           // 0-1 normalized
        peak: Math.max(...dataArray) / 255
    };
}

// ==================== WAVEFORM VISUALIZATION ====================
function drawWaveform(canvas, analyser) {
    const ctx = canvas.getContext('2d');
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    function draw() {
        requestAnimationFrame(draw);
        analyser.getByteTimeDomainData(dataArray);
        
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#00ff9f';
        ctx.beginPath();
        
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0;
            const y = v * canvas.height / 2;
            
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            
            x += sliceWidth;
        }
        
        ctx.stroke();
    }
    draw();
}

// ==================== OFFLINE RENDERING (For Preview) ====================
async function renderOffline(audioBuffer, duration = null) {
    const ctx = new OfflineAudioContext(
        audioBuffer.numberOfChannels,
        audioBuffer.length,
        audioBuffer.sampleRate
    );
    
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    
    const gain = ctx.createGain();
    gain.gain.value = 0.85;
    
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(0);
    
    const renderedBuffer = await ctx.startRendering();
    return renderedBuffer;
}

// ==================== INTEGRATION WITH MORRIS LAW KERNEL ====================
/**
 * Recommended Flow:
 * 1. User uploads audio in browser
 * 2. Send to backend (FastAPI) → MorrisLawKernel.process()
 * 3. Backend returns processed audio
 * 4. Play result using Web Audio API above
 * 
 * For real-time preview: Use Web Audio API built-in nodes while processing happens in background.
 */

// Example: Load audio file and play with Web Audio
async function loadAndPlayFile(file) {
    const ctx = initAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    
    return playAudioBuffer(audioBuffer);
}

// Export for use in larger applications
window.GravelKingWebAudio = {
    initAudioContext,
    playAudioBuffer,
    getAudioMeter,
    drawWaveform,
    renderOffline,
    loadAndPlayFile
};

console.log("GravelKing Web Audio API integration loaded. Ready for Morris Law Kernel backend.");
