import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

declare var cv: any;

@Injectable({
  providedIn: 'root'
})
export class OpencvProcessingService {
  private faceCascade: any;
  private classifierLoaded = new BehaviorSubject<boolean>(false);
  classifierLoaded$ = this.classifierLoaded.asObservable();

  constructor() {}

  //load casscade classifiers for face detection after OpenCV has been initialized
  initOpenCv() {
    cv['onRuntimeInitialized'] = () => {
      this.faceCascade = new cv.CascadeClassifier();
      this.createFileFromUrl('haarcascade_frontalface_default.xml', 'assets/classifier/haarcascade_frontalface_default.xml').subscribe(() => {
        this.faceCascade.load('haarcascade_frontalface_default.xml');
        this.classifierLoaded.next(true);
        console.log("Classifier loaded");
      });
    }
  }

  //load mat vector image onto canvas
  imshow(canvas: HTMLCanvasElement, vector: any) {
    cv.imshow(canvas, vector);
  }

  //detect photo id in image through face detection
  detectId(image: HTMLImageElement, roi: any) {

    //load and crop image
    let src = cv.imread(image);
    let rect = new cv.Rect(roi.xPos*src.cols, roi.yPos*src.rows, roi.width*src.cols, roi.height*src.cols);
    let dst = src.roi(rect);
    cv.cvtColor(dst, dst, cv.COLOR_RGBA2GRAY, 0);

    let faces = new cv.RectVector();

    //detect faces in image and add it to 'faces' array
    if(this.classifierLoaded$) {
      const msize = new cv.Size(0, 0);
      this.faceCascade.detectMultiScale(dst, faces, 1.1, 3, 0, msize, msize);
    }else {
      console.log("Classifier not loaded");
    }

    return (faces.size() > 0 ? true : false);   //if face has been detected, return true; else return false
  }

  //isolate and return only text portions of image
  detectText(image: HTMLImageElement, roi: any) {

    //load and crop image
    let src = cv.imread(image);
    let rect = new cv.Rect(roi.xPos*src.cols, roi.yPos*src.rows, roi.width*src.cols, roi.height*src.cols);
    let mat = src.roi(rect);
    let dst = src.roi(rect);

    //resize duplicate image for faster performance
    const targetWidth = 1000;
    let dsize = new cv.Size(targetWidth, mat.rows * (targetWidth/mat.cols));
    cv.resize(mat, mat, dsize, 0, 0, cv.INTER_NEAREST);

    //transform image to isolate text area
    cv.cvtColor(mat, mat, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(mat, mat, new cv.Size(3, 3), 0, 0, cv.BORDER_DEFAULT);
    cv.morphologyEx(mat, mat, cv.MORPH_BLACKHAT, cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(19, 5)));

    //further transform image and threshold
    cv.Sobel(mat, mat, cv.CV_8U, 1, 0);
    cv.morphologyEx(mat, mat, cv.MORPH_CLOSE,  cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(19, 3)));
    cv.threshold(mat, mat, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);

    //find text areas and append cropped text images to 'regionsOfInterest'
    let contours = new cv.MatVector();
    cv.findContours(mat, contours, new cv.Mat(), cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);
    let regionsOfInterest = [];
    for (let i = 0; i < contours.size(); ++i) {
      let rect = cv.boundingRect(contours.get(i));
      if(rect.width > 2*rect.height && rect.height > 10) {
        let offsets = this.offsetPoints(mat, rect);
        let topLeft = new cv.Point(offsets.x1 * (dst.cols/targetWidth), offsets.y1 * (dst.cols/targetWidth));
        let bottomRight = new cv.Point(offsets.x2 * (dst.cols/targetWidth), offsets.y2 * (dst.cols/targetWidth));
        regionsOfInterest.push(this.processImage(dst.roi(new cv.Rect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y))))
      }
    }

    return regionsOfInterest;   //return text images
  }

  /////////////HELPERS/////////////

  //expand crop area so text doesn't get cut off
  offsetPoints(src: any, rect: any) {
    let offset: number = 10;
    let x1: number = rect.x;
    let y1: number = rect.y;
    let x2: number = rect.x + rect.width;
    let y2: number = rect.y + rect.height;

    if(x1 - offset >= 0) {
      x1 -= offset;
    }else {
      x1 = 0;
    }
    if(y1 - offset >= 0) {
      y1 -= offset;
    }else {
      y1 = 0;
    }
    if(x2 + offset <= src.cols) {
      x2 += offset;
    }else {
      x2 = src.cols;
    }
    if(y2 + offset <= src.rows) {
      y2 += offset;
    }else {
      y2 = src.rows;
    }

    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2};
  }

  //threshold text images for better OCR results. This function can be modified for improved accuracy
  processImage(src: any) {
    cv.cvtColor(src, src, cv.COLOR_RGBA2GRAY, 0);
    cv.adaptiveThreshold(src, src, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 41, 3);

    return src;
  }

  //create XML file from url for loading cascade classifiers
  createFileFromUrl(path: string, url: string) {
    const request = new XMLHttpRequest();
    request.open('GET', url, true);
    request.responseType = 'arraybuffer';
    return new Observable(observer => {
      request.onload = () => {
        if (request.readyState === 4) {
          if (request.status === 200) {
            const data = new Uint8Array(request.response);
            cv.FS_createDataFile('/', path, data, true, false, false);
            observer.next();
            observer.complete();
          } else {
            console.log('Failed to load ' + url + ' status: ' + request.status);
            observer.error();
          }
        }
      };
      request.send();
    });
  }
}
