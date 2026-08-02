export type AnnotationTool = "underline" | "highlight";

export interface TextRangeAnnotation {
  id: string;
  target: "question";
  kind: "text";
  start: number;
  end: number;
  tool: AnnotationTool;
}

export interface ImageRectAnnotation {
  id: string;
  target: "question";
  kind: "image";
  imageId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tool: AnnotationTool;
}

export type Annotation = TextRangeAnnotation | ImageRectAnnotation;

export type ThemeMode = "light" | "dark" | "system";
