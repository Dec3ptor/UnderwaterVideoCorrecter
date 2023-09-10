let originalImageData = null;  // For storing the original image data
let depth = 20;  // Default value
let hue = 0;  // Default value
let brightness = 100;  // Default value
let whiteBalance = 6500;  // Initialize to a neutral value
let contrast = 100;  // Initialize to a neutral value (percentage)
let saturation = 100;  // Initialize to a neutral value (percentage)
let adjstRed = 10;
let redMultiplier = 1, greenMultiplier = 1, blueMultiplier = 1;
let redInput = 1;
let greenInput = 1;
let blueInput = 1;


//---------IMAGE FILTER LOGIC----------//
// This will work because adjstRed is defined in this scope
function anotherFunction() {
    let adjstRed = 20;
    console.log(adjstRed);  
}

let lastHue = null;
let lastMatrix = null;

// Constants for easier understanding and maintainability
const MAX_COLOR_VALUE = 255;
const NUM_COLOR_CHANNELS = 4;

let useAutoColor = false;  // Flag to determine if auto color correction should be used

// Function to be called when the checkbox is clicked
function onCheckboxClick() {
  useAutoColor = !useAutoColor;  // Toggle the flag
          // Currently showing the original, switch to the filtered
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const pixels = imageData.data;
          const colorFilterMatrix = getOptimizedColorFilterMatrix(pixels, canvas.width, canvas.height, depth);
          applyColorMatrixToPixels(pixels, colorFilterMatrix);
          ctx.putImageData(imageData, 0, 0);
}


function getKey(settings) {
    return JSON.stringify(settings);
}

let lastSettings = null;
let lastManualMatrix = null;
let matrixCache = {};

function getOptimizedColorFilterMatrix(pixels, width, height, depth) {
    let currentSettings;
    if (useAutoColor) {
        currentSettings = `auto-${depth}`;
    } else {
        currentSettings = `${redMultiplier}-${greenMultiplier}-${blueMultiplier}-${hue}`;
    }

    // Check for cached matrix
    if (currentSettings === lastSettings && lastManualMatrix) {
        return lastManualMatrix;
    }

    if (matrixCache[currentSettings]) {
        return matrixCache[currentSettings];
    }

    let newMatrix;
    if (useAutoColor) {
        newMatrix = getColorFilterMatrix(pixels, width, height, depth);
    } else {
        newMatrix = getManualMatrix(redMultiplier, greenMultiplier, blueMultiplier, hue);
    }

    lastSettings = currentSettings;
    lastManualMatrix = newMatrix;
    matrixCache[currentSettings] = newMatrix;

    return newMatrix;
}

function getManualMatrix(redMultiplier, greenMultiplier, blueMultiplier, hue) {
    
    // Initialize a 5x4 color matrix to the identity matrix
    const matrix = [
        1, 0, 0, 0, 0,
        0, 1, 0, 0, 0,
        0, 0, 1, 0, 0,
        0, 0, 0, 1, 0
    ];

    // New code for red, green, and blue multipliers
    matrix[0] *= redMultiplier;
    matrix[5] *= greenMultiplier;
    matrix[10] *= blueMultiplier;

    // New code for hue adjustment (simplified)
    matrix[1] = matrix[5] * Math.sin(hue);
    matrix[2] = matrix[10] * Math.sin(hue);

    return matrix;
}


function getColorFilterMatrix(pixels, width, height, depth) {
    const numOfPixels = width * height;
    const thresholdRatio = 2000;
    const thresholdLevel = numOfPixels / thresholdRatio;
    const blueMagicValue = 1.2;
  
    let hist = { 
        r: new Uint32Array(MAX_COLOR_VALUE + 1),
        g: new Uint32Array(MAX_COLOR_VALUE + 1),
        b: new Uint32Array(MAX_COLOR_VALUE + 1)
    };

    let normalize = { r: [], g: [], b: [] };

    const avg = calculateAverageColor(pixels, width, height);
    const dynamicMaxHueShift = calculateHueShiftBasedOnDepth(depth);
    const dynamicMinAvgRed = calculateMinAvgRedBasedOnDepth(depth);
  
    let hueShift = hue;
    let newAvgRed = avg.r;

    for (let i = 0, len = pixels.length; i < len; i += 16) {
        processPixel(pixels, i, hueShift, hist);
        processPixel(pixels, i + 4, hueShift, hist);
        processPixel(pixels, i + 8, hueShift, hist);
        processPixel(pixels, i + 12, hueShift, hist);
    }

    while (newAvgRed < dynamicMinAvgRed) {
        const shifted = hueShiftRed(avg.r, avg.g, avg.b, hueShift);
        newAvgRed = shifted.r + shifted.g + shifted.b;
        hueShift++;
        if (hueShift > dynamicMaxHueShift) newAvgRed = dynamicMinAvgRed;
    }

    for (let i = 0; i < pixels.length; i += NUM_COLOR_CHANNELS) {
        let red = pixels[i] | 0;
        const green = pixels[i + 1] | 0;
        const blue = pixels[i + 2] | 0;
        
        const shifted = hueShiftRed(red, green, blue, hueShift);
        red = shifted.r + shifted.g + shifted.b;
        red = Math.min(MAX_COLOR_VALUE, Math.max(0, red)) | 0;
        
        hist.r[red]++;
        hist.g[green]++;
        hist.b[blue]++;
    }

    for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = (pixels[i] * (brightness / 100)) | 0;
        pixels[i + 1] = (pixels[i + 1] * (brightness / 100)) | 0;
        pixels[i + 2] = (pixels[i + 2] * (brightness / 100)) | 0;
    }
  
    normalize.r.push(0);
    normalize.g.push(0);
    normalize.b.push(0);

    for (let i = 0; i <= MAX_COLOR_VALUE; i++) {
        if (hist.r[i] - thresholdLevel < 2) normalize.r.push(i);
        if (hist.g[i] - thresholdLevel < 2) normalize.g.push(i);
        if (hist.b[i] - thresholdLevel < 2) normalize.b.push(i);
    }

    normalize.r.push(MAX_COLOR_VALUE);
    normalize.g.push(MAX_COLOR_VALUE);
    normalize.b.push(MAX_COLOR_VALUE);
    
    let adjust = { r: {}, g: {}, b: {} }; // Define the adjust object here

    adjust.r = normalizingInterval(normalize.r);
    adjust.g = normalizingInterval(normalize.g);
    adjust.b = normalizingInterval(normalize.b);

    const shifted = hueShiftRed(1, 1, 1, hueShift);
    let redGain = 256 / (adjust.r.high - adjust.r.low);
    let greenGain = 256 / (adjust.g.high - adjust.g.low);
    let blueGain = 256 / (adjust.b.high - adjust.b.low);
    const redOffset = (-adjust.r.low / 256) * redGain;
    const greenOffset = (-adjust.g.low / 256) * greenGain;
    const blueOffset = (-adjust.b.low / 256) * blueGain;
    let adjstRed = shifted.r * redGain;
    let adjstRedGreen = shifted.g * redGain;
    let adjstRedBlue = shifted.b * redGain * blueMagicValue;

    let newAdjstRed = adjstRed * redMultiplier;
    let newGreenGain = greenGain * greenMultiplier;
    let newBlueGain = blueGain * blueMultiplier;

    // Add these lines before returning the matrix to apply RGB multipliers
    adjstRed *= redMultiplier;
    greenGain *= greenMultiplier;
    blueGain *= blueMultiplier;

    return [
        newAdjstRed, adjstRedGreen, adjstRedBlue, 0, redOffset,
        0, newGreenGain, 0, 0, greenOffset,
        0, 0, newBlueGain, 0, blueOffset,
        0, 0, 0, 1, 0,
    ];    
}


// Contrast adjustment [0, 200]
function adjustContrast(pixel, contrast) {
    return ((pixel - 128) * (contrast / 100) + 128);
}

// White balance adjustment based on color temperature
// This is a simple example; a more accurate model would be more complex
function adjustWhiteBalance(pixel, colorTemp) {
    const factor = (colorTemp - 6500) / 6500;
    return pixel * (1 + factor);
}

// Saturation adjustment [0, 200]
// Convert RGB to HSL, adjust S, convert back to RGB
function adjustSaturation(r, g, b, saturation) {
    // Convert RGB to HSL
    r /= 255;
    g /= 255;
    b /= 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }

    // Adjust saturation
    s *= (saturation / 100);

    // Convert back to RGB
    let r1, g1, b1;
    if (s === 0) {
        r1 = g1 = b1 = l; // achromatic
    } else {
        const hue2rgb = function hue2rgb(p, q, t) {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r1 = hue2rgb(p, q, h + 1 / 3);
        g1 = hue2rgb(p, q, h);
        b1 = hue2rgb(p, q, h - 1 / 3);
    }

    r1 = Math.round(r1 * 255);
    g1 = Math.round(g1 * 255);
    b1 = Math.round(b1 * 255);

    return { r: r1, g: g1, b: b1 };
}


function processPixel(pixels, index, hueShift, hist) {
    let red = pixels[index];
    let green = pixels[index + 1];
    let blue = pixels[index + 2];

 // Hue shift
    let shifted = hueShiftRed(red, green, blue, hueShift);
    red = shifted.r + shifted.g + shifted.b;
    
    // // Contrast adjustment
    // red = adjustContrast(red, contrast);
    // green = adjustContrast(green, contrast);
    // blue = adjustContrast(blue, contrast);

    // // White balance adjustment
    // red = adjustWhiteBalance(red, whiteBalance);
    // green = adjustWhiteBalance(green, whiteBalance);
    // blue = adjustWhiteBalance(blue, whiteBalance);

    // // Saturation adjustment
    // shifted = adjustSaturation(red, green, blue, saturation);
    // red = shifted.r;
    // green = shifted.g;
    // blue = shifted.b;

    // Rounding and clamping the values
    red = Math.min(MAX_COLOR_VALUE, Math.max(0, Math.round(red)));
    green = Math.min(MAX_COLOR_VALUE, Math.max(0, Math.round(green)));
    blue = Math.min(MAX_COLOR_VALUE, Math.max(0, Math.round(blue)));

    pixels[index] = red;
    pixels[index + 1] = green;
    pixels[index + 2] = blue;

    hist.r[red]++;
    hist.g[green]++;
    hist.b[blue]++;
}


function calculateAverageColor(pixels, width, height) {
    const avg = { r: 0, g: 0, b: 0 };
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width * 4; x += 4) {
            const pos = x + (width * 4) * y;
            avg.r += pixels[pos];
            avg.g += pixels[pos + 1];
            avg.b += pixels[pos + 2];
        }
    }
    avg.r /= (width * height);
    avg.g /= (width * height);
    avg.b /= (width * height);
    return avg;
}

// Cache for trigonometric calculations
let trigCache = {};

function getTrigValues(hue) {
    if (trigCache[hue]) {
        return trigCache[hue];
    }

    const U = Math.cos(hue * Math.PI / 180);
    const W = Math.sin(hue * Math.PI / 180);
    trigCache[hue] = { U, W };
    return { U, W };
}

function hueShiftRed(r, g, b, h) {
    const { U, W } = getTrigValues(h);
    r = (0.299 + 0.701 * U + 0.168 * W) * r;
    g = (0.587 - 0.587 * U + 0.330 * W) * g;
    b = (0.114 - 0.114 * U - 0.497 * W) * b;
    return { r, g, b };
}

function normalizingInterval(normArray) {
    let high = 255;
    let low = 0;
    let maxDist = 0;
    for (let i = 1; i < normArray.length; i++) {
        let dist = normArray[i] - normArray[i - 1];
        if (dist > maxDist) {
            maxDist = dist;
            high = normArray[i];
            low = normArray[i - 1];
        }
    }
    return { low, high };
}

function calculateHueShiftBasedOnDepth(depth) {
    // Constants for exponential decay
    const initialHueShift = 120;
    const decayConstant = 0.05;  // Change this based on your specific requirements
    
    return initialHueShift * Math.exp(-decayConstant * depth);
}

function calculateMinAvgRedBasedOnDepth(depth) {
    // Constants for exponential increase
    const initialMinAvgRed = 60;
    const growthConstant = 0.03;  // Change this based on your specific requirements

    return initialMinAvgRed * Math.exp(growthConstant * depth);
}

let smoothedMatrix = null;  // Will store the smoothed matrix
let alpha = 0.9;  // Initialize with a high value for the first frame

function getSmoothColorFilterMatrix(pixels, width, height, depth) {
  const matrix = getOptimizedColorFilterMatrix(pixels, width, height, depth);
  
  if (smoothedMatrix === null) {
    smoothedMatrix = matrix;  // Initialize if this is the first frame
  } else {
    // Apply exponential smoothing
    for (let i = 0; i < matrix.length; i++) {
      smoothedMatrix[i] = alpha * matrix[i] + (1 - alpha) * smoothedMatrix[i];
    }
  }

  // Gradually reduce alpha to its final value (e.g., 0.1)
  if (alpha > 0.1) {
    alpha *= 0.95;  // Reduce alpha by 5% each frame
  }

  return smoothedMatrix;
}

// Reset smoothedMatrix and alpha when a new video is loaded
function onNewVideo() {
  smoothedMatrix = null;
  alpha = 0.9;
}

//------------------------------------------//

let showOriginal = false;  // A flag to determine whether to show the original image

// Function to toggle the display between the original and the filtered images
function toggleOriginalImage() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    if (showOriginal) {
        // Currently showing the original, switch to the filtered
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const colorFilterMatrix = getOptimizedColorFilterMatrix(pixels, canvas.width, canvas.height, depth);
        applyColorMatrixToPixels(pixels, colorFilterMatrix);
        ctx.putImageData(imageData, 0, 0);
    } else {
        // Currently showing the filtered, switch to the original
        ctx.putImageData(originalImageData, 0, 0);
    }

    // Toggle the flag for the next click
    showOriginal = !showOriginal;
}

// Initialize global variables
let canvasElement;
let ctx;
let videoElement;
// Initialize some global variables
let isMuted = false;  // New flag
let isPlaying = true;  // Initialize flag for play/pause
let animationFrameId;
let isShowingOriginal = false;  // New flag to remember if showing original or filtered content

// This function is called once the video metadata is loaded
function startVideoProcessing() {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    requestAnimationFrame(renderFrame);
}

function renderFrame() {
    if (!isPlaying) {
        cancelAnimationFrame(animationFrameId);
        return;
    }
    
    ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    if (!showOriginal) {
        // Apply your filter here
        let imageData = ctx.getImageData(0, 0, canvasElement.width, canvasElement.height);
        const pixels = new Uint8ClampedArray(imageData.data.buffer);  // Typed array
        const colorFilterMatrix = getSmoothColorFilterMatrix(pixels, canvasElement.width, canvasElement.height, depth);

        applyColorMatrixToPixels(pixels, colorFilterMatrix);
        
        ctx.putImageData(imageData, 0, 0);
    }

    animationFrameId = requestAnimationFrame(renderFrame);
}


// Inside your DOMContentLoaded function
document.addEventListener("DOMContentLoaded", function() {

    
    canvasElement = document.getElementById('canvas');
    ctx = canvasElement.getContext('2d');
    videoElement = document.getElementById('video'); 
    const fileInput = document.getElementById('fileInput');
    const rewindBtn = document.getElementById('rewindBtn');
    const rewindMoreBtn = document.getElementById('rewindMoreBtn');
    const playPauseBtn = document.getElementById('playPauseBtn');
    const muteBtn = document.getElementById('muteBtn');
    const skipBtn = document.getElementById('skipBtn');
    const skipMoreBtn = document.getElementById('skipMoreBtn');

    


// document.getElementById('whiteBalanceInput').addEventListener('input', function() {
//     whiteBalance = this.value;
// });

// document.getElementById('contrastInput').addEventListener('input', function() {
//     contrast = this.value;
// });

// document.getElementById('saturationInput').addEventListener('input', function() {
//     saturation = this.value;
// });

  
    playPauseBtn.addEventListener('click', function() {
        if (isPlaying) {
            isPlaying = false;
            videoElement.pause();
            playPauseBtn.innerText = 'Play';
        } else {
            isPlaying = true;
            videoElement.play();
            playPauseBtn.innerText = 'Pause';
            requestAnimationFrame(renderFrame);
        }
    });
      muteBtn.addEventListener('click', function() {
        if (isMuted) {
            videoElement.muted = false;
            isMuted = false;
            muteBtn.innerText = 'Mute';
        } else {
            videoElement.muted = true;
            isMuted = true;
            muteBtn.innerText = 'Unmute';
        }
    });

    skipBtn.addEventListener('click', function() {
        videoElement.currentTime += 5;  // Skip 5 seconds forward
    });
    skipMoreBtn.addEventListener('click', function() {
        videoElement.currentTime += 15;  // Skip 5 seconds forward
    });

    rewindBtn.addEventListener('click', function() {
        videoElement.currentTime -= 5;  // Skip 5 seconds backward
    });
    rewindMoreBtn.addEventListener('click', function() {
        videoElement.currentTime -= 15;  // Skip 15 seconds backward
    });
    // Event listeners for RGB input
    document.getElementById('redInput').addEventListener('input', function() {
        redMultiplier = this.value / 255;
    });
    
    document.getElementById('greenInput').addEventListener('input', function() {
        greenMultiplier = this.value / 255;
    });
    
    document.getElementById('blueInput').addEventListener('input', function() {
        blueMultiplier = this.value / 255;
    });
    document.getElementById("resetBtn").addEventListener("click", function() {
        // Reset all your variables and settings to default
        redMultiplier = 1;
        greenMultiplier = 1;
        blueMultiplier = 1;
    
        // Currently showing the original, switch to the filtered
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const colorFilterMatrix = getColorFilterMatrix(pixels, canvas.width, canvas.height, depth);
        applyColorMatrixToPixels(pixels, colorFilterMatrix);
        ctx.putImageData(imageData, 0, 0);
      });
    
    document.getElementById("downloadBtn").addEventListener("click", function() {
        const canvas = document.getElementById('canvas');
        const imgData = canvas.toDataURL("image/png");
        const a = document.createElement('a');
        a.href = imgData;
        a.download = 'filtered_image.png';
        a.click();
      });
    
  // Inside your DOMContentLoaded function, add these lines
  document.getElementById('depthInput').addEventListener('input', function() {
    depth = this.value;
});

document.getElementById('hueInput').addEventListener('input', function() {
    hue = this.value;
  });  
  
document.getElementById('brightnessInput').addEventListener('input', function() {
    brightness = this.value;
});

fileInput.addEventListener('change', function() {
    // Reset global variables
    smoothedMatrix = null;  // Reset smoothed color matrix
    alpha = 0.9;  // Reset alpha for smoothing
    originalImageData = null;  // Reset original image data
    isShowingOriginal = false;  // Reset flag for showing original content
    showOriginal = false; // Reset the flag for toggling original image
    
    // Stop ongoing animations for video
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    // Clear the canvas
    ctx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    // Release previous object URL, if any
    if (videoElement.src) {
        URL.revokeObjectURL(videoElement.src);
    }
        const file = fileInput.files[0];
        const type = file.type;
        
        if (type.startsWith('video')) {
                canvas.style.display = 'block'; // or 'inline' or any other suitable value
            videoElement.src = URL.createObjectURL(file);
            videoElement.addEventListener('loadedmetadata', startVideoProcessing);
            videoElement.play();
        } else if (type.startsWith('image')) {
              canvas.style.display = 'block'; // or 'inline' or any other suitable value
            // Handle image files
            const img = new Image();
            img.onload = function() {
                // Fit image within canvas
                const aspectRatio = img.width / img.height;
                canvas.width = Math.min(window.innerWidth, img.width);
                canvas.height = canvas.width / aspectRatio;

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                // Save original image data
                originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

                // Now apply the filter
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const pixels = imageData.data;
                const colorFilterMatrix = getOptimizedColorFilterMatrix(pixels, canvas.width, canvas.height, depth);
                applyColorMatrixToPixels(pixels, colorFilterMatrix);
                ctx.putImageData(imageData, 0, 0);
            };
            img.src = URL.createObjectURL(file);
        }
    });

     // Attach click events to canvases
     document.getElementById('canvas').addEventListener('click', toggleOriginalImage);

});


function toggleOriginalImage() {
  const file = fileInput.files[0];
  const type = file.type;
  if (type.startsWith('image')) {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    if (showOriginal) {
        // If currently showing the original, switch to the filtered
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        const colorFilterMatrix = getOptimizedColorFilterMatrix(pixels, canvas.width, canvas.height, depth);
        applyColorMatrixToPixels(pixels, colorFilterMatrix);
        ctx.putImageData(imageData, 0, 0);
    } else {
        // If currently showing the filtered, switch to the original
        ctx.putImageData(originalImageData, 0, 0);
    }
  }
    // Toggle the flag for the next click
    showOriginal = !showOriginal;
  
}


function applyColorMatrixToPixels(pixels, colorFilterMatrix) {
    for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        // Apply the color matrix filter according to the provided algorithm
        const newR = Math.min(255, Math.max(0, r * colorFilterMatrix[0] + g * colorFilterMatrix[1] + b * colorFilterMatrix[2] + colorFilterMatrix[4] * 255));
        const newG = Math.min(255, Math.max(0, g * colorFilterMatrix[6] + colorFilterMatrix[9] * 255));
        const newB = Math.min(255, Math.max(0, b * colorFilterMatrix[12] + colorFilterMatrix[14] * 255));

        // Update pixel array in-place with RGB multipliers
        pixels[i] = newR * redMultiplier;
        pixels[i + 1] = newG * greenMultiplier;
        pixels[i + 2] = newB * blueMultiplier;
    }
}


  
const video = document.getElementById('video');