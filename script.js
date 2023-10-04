//---------------------------------------------------------------------------------------------------------------------
// Declarations

const penColorPicker = document.querySelector("#penColorPicker");
const backgroundColorPicker = document.querySelector("#backgroundColorPicker");
const penButton = document.querySelector("#penButton");
const eraserButton = document.querySelector("#eraserButton");
const colorfulModeButton = document.querySelector("#colorfulModeButton");
const shadingModeButton = document.querySelector("#shadingModeButton");
const lightenModeButton = document.querySelector("#lightenModeButton");
const gridSizeOutput = document.querySelector("#gridSize");
const gridSizeSlider = document.querySelector("#gridSizeSlider");
const gridLinesButton = document.querySelector("#gridLinesButton");
const undoButton = document.querySelector("#undoButton");
const redoButton = document.querySelector("#redoButton");
const gridLinesStatusOutput = document.querySelector("#gridLinesStatus");
const screenshotButton = document.querySelector("#screenshotButton");
const clearButton = document.querySelector("#clearButton");
const grid = document.querySelector("#grid");

const pixels = [];
const usedPixels = [];
const undoArray = [];
const redoArray = [];
let gridLinesStatus = "ON";
let drawingMode = "pen";
let drawingModeButton = penButton;

//---------------------------------------------------------------------------------------------------------------------
// Functions

function constructGrid() {
    const gridSize = gridSizeSlider.value;
    grid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`
    grid.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`

    for (let i = 0; i < gridSize * gridSize; i++) {
        pixels[i] = document.createElement("div");
        pixels[i].style.backgroundColor = backgroundColorPicker.value;
        grid.appendChild(pixels[i]);
    }
    
    if (gridLinesStatus === "ON") {
        addGridLines();
    }

    pixels.forEach(pixel => {
        pixel.addEventListener("mousedown", event => draw(event.target));
        pixel.addEventListener("mouseenter", event => {
            if (event.buttons === 0) return;
            draw(event.target);
        });
    });
}

function destructGrid() {
    pixels.forEach(pixel => grid.removeChild(pixel));
    pixels.length = 0;
    usedPixels.length = 0;
    undoArray.length = 0;
    redoArray.length = 0;
}

function clearGrid() {
    destructGrid();
    constructGrid();
}

function addGridLines() {
    const gridSize = gridSizeSlider.value;
    let index = 0;

    for (let row = 1; row <= gridSize; row++) {
        for (let column = 1; column <= gridSize; column++) {

            // To avoid double borders, top and left borders are applied to every pixel
            pixels[index].style.borderTop = "1px solid #9c9c9c";
            pixels[index].style.borderLeft = "1px solid #9c9c9c";

            // Add a right border the the right most pixels
            if (column == gridSize) {
                pixels[index].style.borderRight = "1px solid #9c9c9c";
            }

            // Add a bottom border to the bottom most pixels
            if (row == gridSize) {
                pixels[index].style.borderBottom = "1px solid #9c9c9c";
            }

            index++;
        }
    }
}

function removeGridLines() {
    const gridSize = gridSizeSlider.value;
    let index = 0;

    for (let row = 1; row <= gridSize; row++) {
        for (let column = 1; column <= gridSize; column++) {
            pixels[index].style.removeProperty("border-top");
            pixels[index].style.removeProperty("border-left");

            if (column == gridSize) {
                pixels[index].style.removeProperty("border-right");
            }
            
            if (row == gridSize) {
                pixels[index].style.removeProperty("border-bottom");
            }

            index++;
        }
    }
}

function toggleGridLines() {
    gridLinesButton.classList.toggle("button-on");

    switch (gridLinesStatus) {
        case "ON":
            removeGridLines();
            gridLinesStatus = "OFF";
            gridLinesStatusOutput.textContent = "OFF";
            break;

        case "OFF":
            addGridLines();
            gridLinesStatus = "ON";
            gridLinesStatusOutput.textContent = "ON";
            break;
    }
}

function draw(pixel) {
    redoArray.length = 0;
    
   switch (drawingMode) {
    case "pen":
        if (pixel.style.backgroundColor === penColorPicker.rgbValue && usedPixels.includes(pixel)) return;
        undoArray.push(new Pixel(pixel, !usedPixels.includes(pixel) ? "blank" : "used"));
        pixel.style.backgroundColor = penColorPicker.value;
        usedPixels.add(pixel);
        break;

    case "eraser":
        if (!usedPixels.includes(pixel)) return;
        undoArray.push(new Pixel(pixel, "erased"));
        pixel.style.backgroundColor = backgroundColorPicker.value;
        usedPixels.remove(pixel);
        break;

    case "colorful":
        undoArray.push(new Pixel(pixel, !usedPixels.includes(pixel) ? "blank" : "used"));
        pixel.style.backgroundColor = getRandomColor();
        usedPixels.add(pixel);
        break;

    case "shading":
        undoArray.push(new Pixel(pixel, !usedPixels.includes(pixel) ? "blank" : "used"));
        pixel.style.backgroundColor = shadeOrLightenColor(pixel.style.backgroundColor, "shade");
        usedPixels.add(pixel);
        break;

    case "lighten":
        undoArray.push(new Pixel(pixel, !usedPixels.includes(pixel) ? "blank" : "used"));
        pixel.style.backgroundColor = shadeOrLightenColor(pixel.style.backgroundColor, "lighten");
        usedPixels.add(pixel);
        break;
   }
}

function getRandomColor() {
    const R = Math.floor(Math.random() * 256);
    const G = Math.floor(Math.random() * 256);
    const B = Math.floor(Math.random() * 256);
    return `rgb(${R}, ${G}, ${B})`;
}

function shadeOrLightenColor(color, option) {
    const [R, G, B] = color.slice(4, -1).split(", ");

    switch (option) {
        case "shade":
            return `rgb(${R - 25}, ${G - 25}, ${B - 25})`;

        case "lighten":
            return `rgb(${+R + 25}, ${+G + 25}, ${+B + 25})`;
    }
}

function undo() {
    if (undoArray.length === 0) return;

    const object = undoArray.pop();
    redoArray.push(new Pixel(object.pixel, object.status));

    switch (object.status) {
        case "blank":
            usedPixels.remove(object.pixel);
            object.pixel.style.backgroundColor = backgroundColorPicker.value;
            break;

        case "used":
        case "erased":
            object.pixel.style.backgroundColor = object.color;
            break;
    }
}

function redo() {
    if (redoArray.length === 0) return;

    const object = redoArray.pop();
    undoArray.push(new Pixel(object.pixel, object.status));

    switch (object.status) {
        case "used":
        case "blank":
            usedPixels.add(object.pixel);
            object.pixel.style.backgroundColor = object.color;
            break;

        case "erased":
            usedPixels.remove(object.pixel);
            object.pixel.style.backgroundColor = backgroundColorPicker.value;
            break;
    }
}

function changeDrawingMode(newDrawingMode, newDrawingModeButton) {
    drawingMode = newDrawingMode;
    drawingModeButton.classList.remove("button-on");
    drawingModeButton = newDrawingModeButton;
    drawingModeButton.classList.add("button-on");
}

function screenshot() {
    html2canvas(grid).then(canvas => {
        const screenshotDataUrl = canvas.toDataURL("image/png");
        const downloadLink = document.createElement('a');
        downloadLink.href = screenshotDataUrl;
        downloadLink.download = "screenshot.png";
        downloadLink.click();
    });
}

function hex2rgb(hex) {
    const R = parseInt(hex.slice(1, 3), 16);
    const G = parseInt(hex.slice(3, 5), 16);
    const B = parseInt(hex.slice(5, 7), 16);
    return `rgb(${R}, ${G}, ${B})`;
}

function Pixel(pixel, status) {
    this.pixel = pixel;
    this.color = pixel.style.backgroundColor;
    this.status = status ;
}

usedPixels.add = function(pixel) {
    if (this.includes(pixel)) return;
    this.push(pixel);
}

usedPixels.remove = function(pixel) {
    if (!this.includes(pixel)) return;
    const index = usedPixels.indexOf(pixel);
    usedPixels.splice(index,1);
}

//---------------------------------------------------------------------------------------------------------------------
//Event listeners

penColorPicker.addEventListener("input", () => {
    penColorPicker.rgbValue = hex2rgb(penColorPicker.value);
});

backgroundColorPicker.addEventListener("input", () => {
    const blankPixels = pixels.filter(pixel => !usedPixels.includes(pixel));

    blankPixels.forEach(pixel => {
        pixel.style.backgroundColor = backgroundColorPicker.value;
    });
});

penButton.addEventListener("click", () => {
    changeDrawingMode("pen", penButton);
});

eraserButton.addEventListener("click", () => {
    changeDrawingMode("eraser", eraserButton);
});

colorfulModeButton.addEventListener("click", () => {
    changeDrawingMode("colorful", colorfulModeButton);
});

shadingModeButton.addEventListener("click", () => {
    changeDrawingMode("shading", shadingModeButton);
});

lightenModeButton.addEventListener("click", () => {
    changeDrawingMode("lighten", lightenModeButton);
});

undoButton.addEventListener("click", () => {
    undoButton.classList.add("button-on");
    undo();
});

undoButton.addEventListener("transitionend", () => {
    undoButton.classList.remove("button-on");
});

redoButton.addEventListener("click", () => {
    redoButton.classList.add("button-on");
    redo();
});

redoButton.addEventListener("transitionend", () => {
    redoButton.classList.remove("button-on");
});

gridSizeSlider.addEventListener("input", () => {
    clearGrid();
    gridSizeOutput.textContent = `${gridSizeSlider.value} X ${gridSizeSlider.value}`;
});

gridLinesButton.addEventListener("click", toggleGridLines);

clearButton.addEventListener("click", () => {
    clearButton.classList.add("button-on");
    clearGrid();
});

clearButton.addEventListener("transitionend", () => {
    clearButton.classList.remove("button-on");
});

screenshotButton.addEventListener("click", () => {
    screenshotButton.classList.add("button-on");
    screenshot();
});

screenshotButton.addEventListener("transitionend", () => {
    screenshotButton.classList.remove("button-on");
});

window.addEventListener("load", () => {
    constructGrid();
    drawingModeButton.classList.add("button-on");
    gridLinesStatusOutput.textContent = gridLinesStatus;
    if (gridLinesStatus === "ON") gridLinesButton.classList.add("button-on");
    gridSizeOutput.textContent = `${gridSizeSlider.value} X ${gridSizeSlider.value}`;
    penColorPicker.rgbValue = hex2rgb(penColorPicker.value);
});

//-------------------------------------------------------------------------------------------------------
// Simulate button click

let isMouseDown = false;
let buttonPressInterval;

function simulateButtonClick(btn) {
    btn.click();
}

undoButton.addEventListener('mousedown', () => {
    isMouseDown = true;
    buttonPressInterval = setInterval(() => simulateButtonClick(undoButton), 100);
});

redoButton.addEventListener('mousedown', () => {
    isMouseDown = true;
    buttonPressInterval = setInterval(() => simulateButtonClick(redoButton), 100);
});

window.addEventListener('mouseup', () => {
    isMouseDown = false;
    clearInterval(buttonPressInterval);
});

//---------------------------------------------------------------------------------------------------------------------
// Date in footer

const currentYearOutput = document.querySelector("#currentYear");
currentYearOutput.textContent = new Date().getFullYear();