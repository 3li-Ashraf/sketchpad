//---------------------------------------------------------------------------------------------------------------------
// Declarations

const penColorPicker = document.querySelector("#penAndFillColorPicker");
const backgroundColorPicker = document.querySelector("#backgroundColorPicker");
const penButton = document.querySelector("#penButton");
const eraserButton = document.querySelector("#eraserButton");
const fillButton = document.querySelector("#fillButton");
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

let pixelsMatrix;
const undoActionArray = [];
const redoActionArray = [];
let gridLinesStatus = "ON";
let drawingMode = "pen";
let drawingModeButton = penButton;

//---------------------------------------------------------------------------------------------------------------------
// Functions

function constructGrid() {
    const gridSize = gridSizeSlider.value;
    grid.style.gridTemplateColumns = `repeat(${gridSize}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${gridSize}, 1fr)`;
    pixelsMatrix = generateMatrix(gridSize, gridSize);

    for (let i = 0; i < gridSize; i++) {
        for (let j = 0; j < gridSize; j++) {
            const div = document.createElement("div");
            div.style.backgroundColor = backgroundColorPicker.value;
            grid.appendChild(div);
            pixelsMatrix[i][j] = new Pixel(div, 0);
            pixelsMatrix[i][j].div.addEventListener("mousedown", event => draw(event.target));
            pixelsMatrix[i][j].div.addEventListener("mouseenter", (event) => {
                if (event.buttons === 0) return;
                draw(event.target);
            });
        }
    }

    if (gridLinesStatus === "ON") {
        addGridLines();
    }
}

function destructGrid() {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            grid.removeChild(pixelsMatrix[i][j].div);
        }
    }
    pixelsMatrix = null;
    undoActionArray.length = 0;
    redoActionArray.length = 0;
}

function clearGrid() {
    destructGrid();
    constructGrid();
}

function addGridLines() {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            // To avoid double borders, top and left borders are applied to every pixel
            pixelsMatrix[i][j].div.style.borderTop = "1px solid #9c9c9c";
            pixelsMatrix[i][j].div.style.borderLeft = "1px solid #9c9c9c";

            // Add a right border the the right most pixels
            if (j + 1 == pixelsMatrix.rows) {
                pixelsMatrix[i][j].div.style.borderRight = "1px solid #9c9c9c";
            }

            // Add a bottom border to the bottom most pixels
            if (i + 1 == pixelsMatrix.rows) {
                pixelsMatrix[i][j].div.style.borderBottom = "1px solid #9c9c9c";
            }
        }
    }
}

function removeGridLines() {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            pixelsMatrix[i][j].div.style.removeProperty("border-top");
            pixelsMatrix[i][j].div.style.removeProperty("border-left");

            if (j + 1 == pixelsMatrix.rows) {
                pixelsMatrix[i][j].div.style.removeProperty("border-right");
            }

            if (i + 1 == pixelsMatrix.rows) {
                pixelsMatrix[i][j].div.style.removeProperty("border-bottom");
            }
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

function draw(div) {
    const pixel = getPixel(div);
    const penColor = penColorPicker.rgbValue;
    const backgroundColor = backgroundColorPicker.value;

    switch (drawingMode) {
        case "pen":
            if (pixel.isFilled && div.style.backgroundColor === penColor) return;
            undoActionArray.push(new Action(pixel, pixel.isFilled ? "drawFilled" : "drawBlank"));
            div.style.backgroundColor = penColor;
            pixel.updateColorHistoryArray();
            pixel.isFilled = 1;
            break;

        case "eraser":
            if (!pixel.isFilled) return;
            undoActionArray.push(new Action(pixel, "erase"));
            div.style.backgroundColor = backgroundColor;
            pixel.isFilled = 0;
            break;

        case "fill":
            const filledPixels = [];

            if (pixel.isFilled) {
                undoActionArray.push(new Action(filledPixels, "fillFilled"));
                FloodFillFilled(pixelsMatrix, getPixelRow(div), getPixelColumn(div), div.style.backgroundColor, filledPixels);
            }
            else {
                undoActionArray.push(new Action(filledPixels, "fillBlank"));
                FloodFillBlank(pixelsMatrix, getPixelRow(div), getPixelColumn(div), filledPixels);
            }

            if (filledPixels.length === 0) undoActionArray.pop();
            break;

        case "shading":
            undoActionArray.push(new Action(pixel, pixel.isFilled ? "shadeFilled" : "shadeBlank"));
            div.style.backgroundColor = shadeOrLightenColor(div.style.backgroundColor, "shade");
            pixel.updateColorHistoryArray();
            pixel.isFilled = 1;
            break;

        case "lighten":
            undoActionArray.push(new Action(pixel, pixel.isFilled ? "lightenFilled" : "lightenBlank"));
            div.style.backgroundColor = shadeOrLightenColor(div.style.backgroundColor, "lighten");
            pixel.updateColorHistoryArray();
            pixel.isFilled = 1;
            break;

        case "colorful":
            undoActionArray.push(new Action(pixel, pixel.isFilled ? "drawFilled" : "drawBlank"));
            div.style.backgroundColor = getRandomColor();
            pixel.updateColorHistoryArray();
            pixel.isFilled = 1;
            break;
    }

    redoActionArray.length = 0;
    clearPixelsColorRedoHistory();
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
    if (undoActionArray.length === 0) return;

    const action = undoActionArray.pop();
    redoActionArray.push(action);

    switch (action.type) {
        case "erase":
            action.pixel.isFilled = 1;
            action.pixel.div.style.backgroundColor = action.pixel.colorHistoryArray[action.pixel.colorHistoryArrayIndex];
            break;

        case "drawBlank":
        case "shadeBlank":
        case "lightenBlank":
            action.pixel.isFilled = 0;
            action.pixel.colorHistoryArrayIndex--;
            action.pixel.div.style.backgroundColor = backgroundColorPicker.value;
            break;

        case "drawFilled":
        case "shadeFilled":
        case "lightenFilled":
            action.pixel.div.style.backgroundColor = action.pixel.colorHistoryArray[--action.pixel.colorHistoryArrayIndex];
            break;

        case "fillBlank":
            action.pixel.forEach(pixel => {
                pixel.isFilled = 0;
                pixel.colorHistoryArrayIndex--;
                pixel.div.style.backgroundColor = backgroundColorPicker.value;
            });
            break;

        case "fillFilled":
            action.pixel.forEach(pixel => {
                pixel.div.style.backgroundColor = pixel.colorHistoryArray[--pixel.colorHistoryArrayIndex];
            });
            break;
    }
}

function redo() {
    if (redoActionArray.length === 0) return;

    const action = redoActionArray.pop();
    undoActionArray.push(action);

    switch (action.type) {
        case "erase":
            action.pixel.isFilled = 0;
            action.pixel.div.style.backgroundColor = backgroundColorPicker.value;
            break;

        case "drawBlank":
        case "shadeBlank":
        case "lightenBlank":
            action.pixel.isFilled = 1;
            action.pixel.div.style.backgroundColor = action.pixel.colorHistoryArray[++action.pixel.colorHistoryArrayIndex];
            break;

        case "drawFilled":
        case "shadeFilled":
        case "lightenFilled":
            action.pixel.div.style.backgroundColor = action.pixel.colorHistoryArray[++action.pixel.colorHistoryArrayIndex];
            break;

        case "fillBlank":
            action.pixel.forEach(pixel => {
                pixel.isFilled = 1;
                pixel.div.style.backgroundColor = pixel.colorHistoryArray[++pixel.colorHistoryArrayIndex];
            });
            break;

        case "fillFilled":
            action.pixel.forEach(pixel => {
                pixel.div.style.backgroundColor = pixel.colorHistoryArray[++pixel.colorHistoryArrayIndex];
            });
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

getPixel = function (div) {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            if (pixelsMatrix[i][j].div === div) {
                return pixelsMatrix[i][j];
            }
        }
    }
}

getPixelRow = function (div) {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            if (pixelsMatrix[i][j].div === div) {
                return i;
            }
        }
    }
}

getPixelColumn = function (div) {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            if (pixelsMatrix[i][j].div === div) {
                return j;
            }
        }
    }
}

function generateMatrix(row, col) {
    let matrix = [];

    for (let i = 0; i < row; i++) {
        matrix[i] = [];

        for (let j = 0; j < col; j++) {
            matrix[i][j] = 0;
        }
    }

    matrix.rows = row;
    matrix.columns = col;

    return matrix;
}

function clearPixelsColorRedoHistory() {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            pixelsMatrix[i][j].calibrateColorHistoryArray();
        }
    }
}

function Pixel(div, isFilled) {
    this.div = div;
    this.isFilled = isFilled;
    this.colorHistoryArray = [];
    this.colorHistoryArrayIndex = -1;

    this.updateColorHistoryArray = function () {
        this.colorHistoryArray[++this.colorHistoryArrayIndex] = div.style.backgroundColor;
    };

    this.calibrateColorHistoryArray = function () {
        this.colorHistoryArray.length = this.colorHistoryArrayIndex + 1;
    }
}

function Action(pixel, type = null) {
    this.pixel = pixel;
    this.type = type;
}

function FloodFillFilled(pixelsMatrix, row, column, filledColor, filledPixels) {
    if (!validCoordinates(pixelsMatrix, row, column))
        return;

    if ((pixelsMatrix[row][column].isFilled === 1
        && pixelsMatrix[row][column].div.style.backgroundColor !== penColorPicker.rgbValue
        && pixelsMatrix[row][column].div.style.backgroundColor === filledColor)) {

        pixelsMatrix[row][column].div.style.backgroundColor = penColorPicker.rgbValue;
        pixelsMatrix[row][column].updateColorHistoryArray();
        filledPixels.push(pixelsMatrix[row][column]);

        FloodFillFilled(pixelsMatrix, row + 1, column, filledColor, filledPixels);
        FloodFillFilled(pixelsMatrix, row - 1, column, filledColor, filledPixels);
        FloodFillFilled(pixelsMatrix, row, column + 1, filledColor, filledPixels);
        FloodFillFilled(pixelsMatrix, row, column - 1, filledColor, filledPixels);
    }
}

function FloodFillBlank(pixelsMatrix, row, column, filledPixels) {
    if (!validCoordinates(pixelsMatrix, row, column))
        return;

    if (pixelsMatrix[row][column].isFilled === 1) return;

    pixelsMatrix[row][column].isFilled = 1;
    pixelsMatrix[row][column].div.style.backgroundColor = penColorPicker.rgbValue;
    pixelsMatrix[row][column].updateColorHistoryArray();
    filledPixels.push(pixelsMatrix[row][column]);

    FloodFillBlank(pixelsMatrix, row + 1, column, filledPixels);
    FloodFillBlank(pixelsMatrix, row - 1, column, filledPixels);
    FloodFillBlank(pixelsMatrix, row, column + 1, filledPixels);
    FloodFillBlank(pixelsMatrix, row, column - 1, filledPixels);
}

function validCoordinates(pixelsMatrix, row, column) {
    return (row >= 0 && row < pixelsMatrix.rows && column >= 0 && column < pixelsMatrix.columns);
}

//---------------------------------------------------------------------------------------------------------------------
//Event listeners

penColorPicker.addEventListener("input", () => {
    penColorPicker.rgbValue = hex2rgb(penColorPicker.value);
});

backgroundColorPicker.addEventListener("input", () => {
    for (let i = 0; i < pixelsMatrix.rows; i++) {
        for (let j = 0; j < pixelsMatrix.columns; j++) {
            if (pixelsMatrix[i][j].isFilled) continue;
            pixelsMatrix[i][j].div.style.backgroundColor = backgroundColorPicker.value;
        }
    }
});

penButton.addEventListener("click", () => {
    changeDrawingMode("pen", penButton);
});

eraserButton.addEventListener("click", () => {
    changeDrawingMode("eraser", eraserButton);
});

fillButton.addEventListener("click", () => {
    changeDrawingMode("fill", fillButton);
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

document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyZ") {
        event.preventDefault();
        undoButton.click();
    }
});

document.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyY") {
        event.preventDefault();
        redoButton.click();
    }
});

window.addEventListener("load", () => {
    constructGrid();
    drawingModeButton.classList.add("button-on");
    gridLinesStatusOutput.textContent = gridLinesStatus;
    if (gridLinesStatus === "ON") gridLinesButton.classList.add("button-on");
    gridSizeOutput.textContent = `${gridSizeSlider.value} X ${gridSizeSlider.value}`;
    penColorPicker.rgbValue = hex2rgb(penColorPicker.value);
});

//---------------------------------------------------------------------------------------------------------------------
// Date in footer

const currentYearOutput = document.querySelector("#currentYear");
currentYearOutput.textContent = new Date().getFullYear();