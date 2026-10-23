import { createContext, useContext } from "react";
import { getImageUrl } from "../../api";

/** Import previews resolve temporary assets without persisting them as images. */
export const defaultImagePreviewResolver = (filename: string) => getImageUrl(filename);
export const ImagePreviewContext = createContext(defaultImagePreviewResolver);
export const useImagePreviewResolver = () => useContext(ImagePreviewContext);
