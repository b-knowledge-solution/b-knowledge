/**
 * @description File extension constants for preview routing and validation
 */

/** Image file extensions */
export const ImageExtension = {
  JPG: 'jpg',
  JPEG: 'jpeg',
  PNG: 'png',
  GIF: 'gif',
  WEBP: 'webp',
  SVG: 'svg',
  BMP: 'bmp',
} as const

/** All image extensions as an array */
export const IMAGE_EXTENSIONS = Object.values(ImageExtension)

/** Document file extensions */
export const DocumentExtension = {
  PDF: 'pdf',
  DOC: 'doc',
  DOCX: 'docx',
  TXT: 'txt',
  MD: 'md',
  MDX: 'mdx',
} as const

/** Spreadsheet file extensions */
export const SpreadsheetExtension = {
  XLS: 'xls',
  XLSX: 'xlsx',
  CSV: 'csv',
} as const

/** Presentation file extensions */
export const PresentationExtension = {
  PPT: 'ppt',
  PPTX: 'pptx',
} as const

/** Code/text file extensions */
export const CodeExtension = {
  JSON: 'json',
  XML: 'xml',
  LOG: 'log',
  CSS: 'css',
  JS: 'js',
  TS: 'ts',
  TSX: 'tsx',
  JSX: 'jsx',
  YML: 'yml',
  YAML: 'yaml',
} as const

/** All code/text extensions as an array */
export const CODE_EXTENSIONS = Object.values(CodeExtension)

/** Archive file extensions */
export const ArchiveExtension = {
  ZIP: 'zip',
} as const

/** Office file extensions (for conversion previews) */
export const OFFICE_EXTENSIONS = [
  DocumentExtension.DOC,
  DocumentExtension.DOCX,
  SpreadsheetExtension.XLS,
  SpreadsheetExtension.XLSX,
  SpreadsheetExtension.CSV,
  PresentationExtension.PPT,
  PresentationExtension.PPTX,
] as const

/** Accepted glossary import extensions */
export const GLOSSARY_IMPORT_EXTENSIONS = '.xlsx,.xls'
