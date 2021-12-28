import { Injectable } from '@angular/core';
import { createWorker } from 'tesseract.js';

@Injectable({
  providedIn: 'root'
})
export class TesseractOcrService {
  private worker: Tesseract.Worker;
  private workerReady: boolean = false;

  constructor() {}

  //load tesseract worker from local storage paths
  async loadWorker() {
    this.worker = createWorker({
      workerPath: "./assets/worker/worker.min.js",
      corePath: "./assets/core/tesseract-core.wasm.js",
      langPath: "./assets/lang-data",
      logger: progress => {
        console.log(progress)
      }
    });

    await this.worker.load();
    await this.worker.loadLanguage('eng');
    await this.worker.initialize('eng').then(() => {
      this.workerReady = true;
      console.log("Worker ready");
    });
  }

  //recognize text from image
  async recognizeImage(img: string) {
    if(this.workerReady) {
      const result = await this.worker.recognize(img);
      return result.data.text;
    }else {
      console.log("Tesseract worker not initialized.")
    }
  }
}
