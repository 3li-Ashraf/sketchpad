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
const gridLinesStatus = document.querySelector("#gridLinesStatus");
const clearButton = document.querySelector("#clearButton");
const grid = document.querySelector("#grid");

const pixels = [];
const usedPixels = [];
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
        pixels[i].classList.add("pixel");
        pixels[i].style.backgroundColor = backgroundColorPicker.value;
        grid.appendChild(pixels[i]);
    }
    
    if (gridLinesStatus.textContent === "ON") {
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
}

function addGridLines() {
    const gridSize = gridSizeSlider.value;
    let index = 0;

    for (let row = 1; row <= gridSize; row++) {
        for (let column = 1; column <= gridSize; column++) {
            pixels[index].style.borderTop = "1px solid #9c9c9c";
            pixels[index].style.borderLeft = "1px solid #9c9c9c";

            if (column % gridSize === 0) {
                pixels[index].style.borderRight = "1px solid #9c9c9c";
            }

            if (row % gridSize === 0) {
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

            if (column % gridSize === 0) {
                pixels[index].style.removeProperty("border-right");
            }
            
            if (row % gridSize === 0) {
                pixels[index].style.removeProperty("border-bottom");
            }

            index++;
        }
    }
}

function draw(pixel) {
   switch (drawingMode) {
    case "pen":
        pixel.style.backgroundColor = penColorPicker.value;
        usedPixels.add(pixel);
        break;

    case "eraser":
        if (!usedPixels.includes(pixel)) return;
        pixel.style.backgroundColor = backgroundColorPicker.value;
        usedPixels.remove(pixel);
        break;

    case "colorful":
        pixel.style.backgroundColor = getRandomColor();
        usedPixels.add(pixel);
        break;

    case "shading":
        pixel.style.backgroundColor = shade(pixel.style.backgroundColor);
        usedPixels.add(pixel);
        break;

    case "lighten":
        pixel.style.backgroundColor = lighten(pixel.style.backgroundColor);
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

function shade(color) {
    const [R, G, B] = color
                    .slice(4, -1)
                    .split(", ");
    return `rgb(${R - 25}, ${G - 25}, ${B - 25})`;
}

function lighten(color) {
    const [R, G, B] = color
                    .slice(4, -1)
                    .split(", ");
    return `rgb(${+R + 25}, ${+G + 25}, ${+B + 25})`;
}

function changeDrawingMode(newDrawingMode, newDrawingModeButton) {
    drawingMode = newDrawingMode;
    drawingModeButton.classList.remove("button-on");
    drawingModeButton = newDrawingModeButton;
    drawingModeButton.classList.add("button-on");
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

gridSizeSlider.addEventListener("input", () => {
    destructGrid();
    constructGrid();
    gridSizeOutput.textContent = `${gridSizeSlider.value} X ${gridSizeSlider.value}`
});

gridLinesButton.addEventListener("click", () => {
    gridLinesButton.classList.toggle("button-on");

    if (gridLinesStatus.textContent === "OFF") {
        gridLinesStatus.textContent = "ON";
        addGridLines();
    }
    else {
        gridLinesStatus.textContent = "OFF";
        removeGridLines();
    }
});

clearButton.addEventListener("click", () => {
    clearButton.classList.add("button-on");
    destructGrid();
    constructGrid();
});

clearButton.addEventListener("transitionend", () => {
    clearButton.classList.remove("button-on");
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

//---------------------------------------------------------------------------------------------------------------------
// Date in footer

const currentYearOutput = document.querySelector("#currentYear");
currentYearOutput.textContent = new Date().getFullYear();

//---------------------------------------------------------------------------------------------------------------------

constructGrid();