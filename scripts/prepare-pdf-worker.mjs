import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const source = resolve("node_modules/pdf-parse/dist/worker/pdf.worker.mjs");
const destinationDirectory = resolve("public");
const destination = resolve(destinationDirectory, "pdf.worker.mjs");

mkdirSync(destinationDirectory, { recursive: true });
copyFileSync(source, destination);
console.log("Prepared pdf-parse worker for serverless PDF extraction.");
