/**
 * @file Save files written by this version of the format, kept byte for byte.
 * They stand for files people already have on disk: whatever the encoder does
 * in future, each must keep opening as exactly its sketch.
 */

import type { Sketch } from "../domain/grid";
import type { Bytes } from "../io/compression";

const bytesOf = (base64: string): Bytes =>
    Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));

interface GoldenFile {
    name: string;
    bytes: Bytes;
    sketch: Sketch;
}

const W = "#FFFFFF";
const B = "#3EA6FF";
const K = "#000000";

export const GOLDEN_FILES: readonly GoldenFile[] = [
    {
        name: "a 4×4 palette-mode sketch of three colors",
        bytes: bytesOf("U0tQRAQAeJxj/v//v92y/wwMDCKZmSIANr8F3g=="),
        // prettier-ignore
        sketch: {
            gridSize: 4,
            colors: [
                W, B, B, W,
                B, K, K, B,
                B, K, K, B,
                W, B, B, W,
            ],
        },
    },
    {
        // Deflate could not shrink this one, so it holds stored blocks.
        name: "a 16×16 RGB-mode sketch with every cell different",
        bytes: bytesOf(
            "U0tQRBABeJwBAAP//AD/AAH+BwL9DgP8FQT7HAX6Iwb5Kgf4MQj3OAn2Pwr1Rgv0TQzzVA3yWw7xYg/waRDvcBHudxLtfhPshRTrjBXqkxbpmhfooRjnqBnmrxrlthvkvRzjxB3iyx7h0h/g2SDf4CHe5yLd7iPc9STb/CXaAybZCifYESjXGCnWHyrVJivULSzTNC3SOy7RQi/QSTDPUDHOVzLNXjPMZTTLbDXKczbJejfIgTjHiDnGjzrFljvEnTzDpD3Cqz7Bsj/AuUC/wEG+x0K9zkO81US73EW640a56ke48Ui3+Em2/0q1Bku0DUyzFE2yG06xIk+wKVCvMFGuN1KtPlOsRVSrTFWqU1apWleoYVinaFmmb1qldlukfVyjhF2ii16hkl+gmWCfoGGep2KdrmOctWSbvGWaw2aZymeY0WiX2GmW32qV5muU7WyT9G2S+26RAm+QCXCPEHGOF3KNHnOMJXSLLHWKM3aJOneIQXiHSHmGT3qFVnuEXXyDZH2Ca36Bcn+AeYB/gIF+h4J9joN8lYR7nIV6o4Z5qod4sYh3uIl2v4p1xot0zYxz1I1y245x4o9w6ZBv8JFu95Jt/pNsBZRrDJVqE5ZpGpdoIZhnKJlmL5plNptkPZxjRJ1iS55hUp9gWaBfYKFeZ6JdbqNcdaRbfKVag6ZZiqdYkahXmKlWn6pVpqtUraxTtK1Su65Rwq9QybBP0LFO17JN3rNM5bRL7LVK87ZJ+rdIAbhHCLlGD7pFFrtEHbxDJL1CK75BMr9AOcA/QME+R8I9TsM8VcQ7XMU6Y8Y5asc4ccg3eMk2f8o1hss0jcwzlM0ym84xos8wqdAvsNEut9ItvtMsxdQrzNUq09Yp2tco4dgn6Nkm79ol9tsk/dwjBN0iC94hEt8gGeAfIOEeJ+IdLuMcNeQbPOUaQ+YZSucYUegXWOkWX+oVZusUbewTdO0Se+4Rgu8QifAPkPEOl/INnvMMpfQLrPUKs/YJuvcIwfgHyPkGz/oF1vsE3fwD5P0C6/4B8v8A+bSbfpA="
        ),
        sketch: {
            gridSize: 16,
            colors: Array.from(
                { length: 256 },
                (_, index) =>
                    `#${[index, 255 - index, (index * 7) & 255]
                        .map((channel) => channel.toString(16).padStart(2, "0"))
                        .join("")
                        .toUpperCase()}`
            ),
        },
    },
];
