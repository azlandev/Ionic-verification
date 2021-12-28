interface Style {
  "width": string;
  "height": string;
  "top": string;
  "left"?: string
}

export interface CutoutStyle {
  Top: Style,
  Left: Style,
  Right: Style,
  Bottom: Style,
  Box: Style
}
