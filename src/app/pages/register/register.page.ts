import { Component } from '@angular/core';
import { CameraPreview, CameraPreviewPictureOptions, CameraPreviewOptions } from '@ionic-native/camera-preview/ngx';
import { Platform, LoadingController, AlertController } from '@ionic/angular';
import { OpencvProcessingService } from '../../services/opencv-processing.service';
import { TesseractOcrService } from '../../services/tesseract-ocr.service';
import { UserDetails } from '../../models/user-details';
import { CutoutStyle } from '../../models/cutout-style';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage {
  public userDetails: UserDetails = {
    FirstName: {verified: false},
    LastName: {verified: false},
    DateOfBirth: {verified: false}
  };
  public cutout: CutoutStyle = {
    Top: {
      "width": "100vw",
      "height": "35vh",
      "top": "0px",
    },
    Left: {
      "width": "10vw",
      "height": "50vw",
      "top": "35vh",
    },
    Right: {
      "width": "10vw",
      "height": "50vw",
      "top": "35vh",
      "left": "90vw",
    },
    Bottom: {
      "width": "100vw",
      "height": "100vh",
      "top": "calc(35vh + 50vw)",
    },
    Box: {
      "width": "80vw",
      "height": "50vw",
      "top": "35vh",
      "left": "10vw",
    }
  };
  public cameraActive: boolean = false;
  public divHtml: string = "";
  public verificationComplete: boolean = false;
  public verified: boolean = false;
  public idDetected: boolean = false;
  private image: HTMLImageElement;
  private width: number;
  private height: number;
  private matVectors: any[];
  private extractedText: string[] = [];
  private loading: HTMLIonLoadingElement;
  private intervalId: NodeJS.Timeout;
  private roi: Object = {};

  constructor(
    private cameraPreview: CameraPreview,
    private platform: Platform,
    private openCV: OpencvProcessingService,
    private tess: TesseractOcrService,
    private loadingController: LoadingController,
    private alretController: AlertController
  ) {
      this.width = this.platform.width();   //screen width
      this.height = this.platform.height(); //screen height
      this.openCV.initOpenCv();   //initialize openCV service
      this.tess.loadWorker();     //load tesseract worker for OCR

      //set region of interest to crop image
      this.roi["xPos"] = parseFloat(this.cutout.Box.left)/100;
      this.roi["yPos"] = parseFloat(this.cutout.Box.top)/100;
      this.roi["width"] = parseFloat(this.cutout.Box.width)/100;
      this.roi["height"] = parseFloat(this.cutout.Box.height)/100;
  }

  //if form input is empty, alert user; else open camera
  async logForm() {
    let keys = Object.keys(this.userDetails);
    for(let i = 0; i < keys.length; i++) {
      if(this.userDetails[keys[i]].value == undefined || this.userDetails[keys[i]].value == "") {
        const alert = await this.alretController.create({
          header: "Invalid Input",
          message: "Please make sure all input fields are valid.",
          buttons: ['OK']
        });
        await alert.present();
        break;
      }else if(i == keys.length-1) {
        this.openCamera();
      }
    }
  }

  openCamera() {
    const cameraPreviewOpts: CameraPreviewOptions = {
      x: 0,
      y: 0,
      width: this.width,
      height: this.height,
      camera: 'rear',
      tapPhoto: true,
      previewDrag: true,
      toBack: true,
      alpha: 1
    };

    this.cameraPreview.startCamera(cameraPreviewOpts).then(
      (res) => {
        this.cameraActive = true;
        console.log(res);
        this.detectId();  //detect photo id in camera preview
      },
      (err) => {
        console.log(err);
      }
    );
  }

  stopCamera() {
    clearInterval(this.intervalId);   //stop scanning for photo id
    this.cameraPreview.stopCamera();
    this.cameraActive = false;
  }

  detectId() {
    const pictureOpts: CameraPreviewPictureOptions = {
      quality: 75
    }

    let snapshot = new Image();
    this.intervalId = setInterval(async () => {
      await this.cameraPreview.takeSnapshot(pictureOpts).then(img => {
        snapshot.src = 'data:image/jpeg;base64,' + img;
        snapshot.onload = () => {
          this.idDetected = this.openCV.detectId(snapshot, this.roi); //face detection for photo id validation
        }
      });
    }, 500);
  }

  async capture() {
    if(!this.idDetected) {
      return
    }
    clearInterval(this.intervalId);   //stop scanning for photo id

    const pictureOpts: CameraPreviewPictureOptions = {
      quality: 100
    };

    await this.cameraPreview.takePicture(pictureOpts).then(img => {
      this.image = new Image();
      this.image.src = 'data:image/jpeg;base64,' + img;
      this.image.onload = () => {
        this.presentLoading();  //present loading animation
        this.getVectors();      //get mat vectors from openCV contaning only text images
      }
    }), (err: any) => {
      console.log(err);
    };

    this.stopCamera();
  }

  async getVectors() {
    this.matVectors = this.openCV.detectText(this.image, this.roi);
    for(let i = 0; i < this.matVectors.length; i++) {
      let canvas = document.createElement('canvas');
      canvas.width = this.matVectors[i].cols;
      canvas.height = this.matVectors[i].rows;
      this.openCV.imshow(canvas, this.matVectors[i]);

      //perform OCR on every text image and save to 'extractedText'
      await this.tess.recognizeImage(canvas.toDataURL()).then(result => {
        this.extractedText.push(...result.toLowerCase().split("\n"));
      });
    }

    //if user entered a value that matches the recognized text, the input is verified
    for(const key in this.userDetails) {
      this.extractedText.forEach((text) => {
        if(text.includes(this.userDetails[key].value.toLowerCase())) {
          this.userDetails[key].verified = true;
          return;
        }
      });
    }

    this.verified = this.checkIfVerified(); //check if all user input has been verified
    this.verificationComplete = true;
    await this.loading.dismiss();   //dismiss loading animation
  }

  async presentLoading() {
    this.loading = await this.loadingController.create({
      message: 'Please wait...',
    });

    await this.loading.present();
  }

  //if all user input is verified, return true; else return false
  checkIfVerified() {
    for(const key in this.userDetails) {
      if(!this.userDetails[key].verified) {
        return false;
      }
    }
    return true;
  }

  //reload page
  reset() {
    this.presentLoading();
    location.reload();
  }
}
